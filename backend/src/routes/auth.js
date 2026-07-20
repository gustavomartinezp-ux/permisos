const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos } = require('../middleware/rbac');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intente nuevamente en 15 minutos.' },
});

router.post('/login', loginLimiter, [
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
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

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
    await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, req.usuario.id]);
    res.json({ mensaje: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

router.get('/me', verificarToken, cargarPermisos, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.rol, u.funcionario_id, u.sector, u.area,
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
