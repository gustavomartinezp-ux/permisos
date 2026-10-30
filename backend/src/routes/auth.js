const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos } = require('../middleware/rbac');
const { registrarAcceso } = require('../utils/accesos');

// Bloqueo de la cuenta (no de la red): tras 5 contraseñas erróneas seguidas,
// 15 minutos sin poder ingresar desde ningún equipo (Ley 21.719, seguridad).
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

const router = express.Router();

// Protección contra fuerza bruta. Todo el CESFAM sale a internet por la misma
// IP, así que limitar solo por IP bloqueaba a todos cuando muchos ingresaban a
// la vez. Ahora:
//  - por cuenta (IP + correo): 10 intentos FALLIDOS en 15 min; los ingresos
//    correctos no cuentan.
//  - por IP: tope amplio de intentos fallidos (cubre el probar muchas cuentas).
const claveIp = (req) => ipKeyGenerator(req.ip || '');
const loginLimiterCuenta = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${claveIp(req)}|${String(req.body?.email || '').trim().toLowerCase()}`,
  message: { error: 'Demasiados intentos fallidos para esta cuenta. Intente nuevamente en 15 minutos.' },
});
const loginLimiterIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: claveIp,
  message: { error: 'Demasiados intentos de inicio de sesión desde esta red. Intente nuevamente en unos minutos.' },
});

router.post('/login', loginLimiterIp, loginLimiterCuenta, [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT u.*, f.nombres, f.apellidos, f.cargo, f.rut,
              f.sector AS funcionario_sector, f.area AS funcionario_area
       FROM usuarios u
       LEFT JOIN funcionarios f ON u.funcionario_id = f.id
       WHERE u.email = $1 AND u.activo = true`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = result.rows[0];
    const acceso = (detalle) => registrarAcceso(req, {
      usuarioId: usuario.id, funcionarioId: usuario.funcionario_id, recurso: 'login', detalle,
    });

    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      acceso('rechazado: cuenta bloqueada');
      return res.status(423).json({
        error: `Cuenta bloqueada por ${MAX_INTENTOS} intentos fallidos. Intente nuevamente en ${MINUTOS_BLOQUEO} minutos o pida a RRHH restablecer su contraseña.`,
      });
    }

    const passwordValida = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordValida) {
      const { rows: [estado] } = await pool.query(
        `UPDATE usuarios
         SET intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
             bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= $2 THEN NOW() + make_interval(mins => $3) ELSE bloqueado_hasta END
         WHERE id = $1
         RETURNING bloqueado_hasta > NOW() AS bloqueada`,
        [usuario.id, MAX_INTENTOS, MINUTOS_BLOQUEO]
      );
      acceso(estado?.bloqueada ? 'fallido: cuenta bloqueada' : 'fallido');
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (usuario.intentos_fallidos || usuario.bloqueado_hasta) {
      await pool.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [usuario.id]);
    }
    acceso('correcto');

    // sector y area: del propio usuario (supervisor) o del funcionario vinculado
    const sector = usuario.sector || usuario.funcionario_sector || null;
    const area   = usuario.area   || usuario.funcionario_area   || null;

    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email,
        rol: usuario.rol,
        funcionario_id: usuario.funcionario_id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        sector,
        area,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        rol: usuario.rol,
        funcionario_id: usuario.funcionario_id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        cargo: usuario.cargo,
        rut: usuario.rut,
        sector,
        area,
        must_change_password: usuario.must_change_password,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.patch('/cambiar-password', verificarToken, [
  body('password_actual').notEmpty().withMessage('Contraseña actual requerida'),
  body('password_nueva').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { password_actual, password_nueva } = req.body;
  try {
    const result = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });

    const valida = await bcrypt.compare(password_actual, result.rows[0].password_hash);
    if (!valida) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    const hash = await bcrypt.hash(password_nueva, 10);
    await pool.query(
      'UPDATE usuarios SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [hash, req.usuario.id]
    );
    res.json({ mensaje: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

router.get('/me', verificarToken, cargarPermisos, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.rol, u.funcionario_id, u.sector, u.area, u.must_change_password,
              f.nombres, f.apellidos, f.cargo, f.rut,
              f.sector AS funcionario_sector, f.area AS funcionario_area
       FROM usuarios u
       LEFT JOIN funcionarios f ON u.funcionario_id = f.id
       WHERE u.id = $1`,
      [req.usuario.id]
    );
    const u = result.rows[0];
    res.json({
      ...u,
      sector: u.sector || u.funcionario_sector || null,
      area:   u.area   || u.funcionario_area   || null,
      rolesRBAC: req.usuario.rolesRBAC,
      permisos: req.usuario.permisos,
      subrogandoA: req.usuario.subrogandoA,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

module.exports = router;
