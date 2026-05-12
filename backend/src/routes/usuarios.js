const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken, soloAdmin);

const SECTORES_VALIDOS = ['Verde', 'Azul', 'Amarillo', 'Rojo', 'Lila'];

// Listar todos los usuarios (admin)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.rol, u.activo, u.sector,
              f.nombres, f.apellidos, f.cargo, f.rut
       FROM usuarios u
       LEFT JOIN funcionarios f ON u.funcionario_id = f.id
       ORDER BY u.rol, f.apellidos NULLS LAST, u.email`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// Actualizar sector y rol de un usuario
router.put('/:id', async (req, res) => {
  const { sector, rol } = req.body;
  const { id } = req.params;

  if (sector && !SECTORES_VALIDOS.includes(sector)) {
    return res.status(400).json({ error: 'Sector inválido' });
  }
  if (rol && !['admin', 'supervisor', 'funcionario'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  try {
    const result = await pool.query(
      `UPDATE usuarios
       SET sector = COALESCE($1, sector),
           rol    = COALESCE($2, rol)
       WHERE id = $3
       RETURNING id, email, rol, sector, activo`,
      [sector || null, rol || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// Crear usuario supervisor
router.post('/', [
  body('email').isEmail(),
  body('rol').isIn(['admin', 'supervisor']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, rol, sector } = req.body;
  try {
    const hash = bcrypt.hashSync('cesfam2026', 10);
    const result = await pool.query(
      `INSERT INTO usuarios (email, password_hash, rol, sector)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET rol = $3, sector = $4
       RETURNING id, email, rol, sector`,
      [email.toLowerCase(), hash, rol, sector || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// Cambiar contraseña de un usuario (admin autoriza con su propia clave)
router.patch('/:id/password', async (req, res) => {
  const { password_nueva, password_admin } = req.body;
  if (!password_nueva || password_nueva.length < 6)
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  if (!password_admin)
    return res.status(400).json({ error: 'Se requiere contraseña de administrador para autorizar' });
  try {
    const admin = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    const valida = await bcrypt.compare(password_admin, admin.rows[0].password_hash);
    if (!valida) return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });

    const hash = await bcrypt.hash(password_nueva, 10);
    const result = await pool.query(
      'UPDATE usuarios SET password_hash = $1 WHERE id = $2 RETURNING id, email',
      [hash, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ mensaje: 'Contraseña actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar contraseña' });
  }
});

// Cambiar email de un usuario (admin autoriza con su propia clave)
router.patch('/:id/email', async (req, res) => {
  const { email, password_admin } = req.body;
  if (!email || !email.includes('@'))
    return res.status(400).json({ error: 'Email inválido' });
  if (!password_admin)
    return res.status(400).json({ error: 'Se requiere contraseña de administrador para autorizar' });
  try {
    const admin = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    const valida = await bcrypt.compare(password_admin, admin.rows[0].password_hash);
    if (!valida) return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });

    const result = await pool.query(
      'UPDATE usuarios SET email = $1 WHERE id = $2 RETURNING id, email',
      [email.trim().toLowerCase(), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ese email ya está en uso' });
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar email' });
  }
});

// Activar/desactivar usuario
router.patch('/:id/activo', async (req, res) => {
  const { activo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, email, activo`,
      [activo !== false, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

module.exports = router;
