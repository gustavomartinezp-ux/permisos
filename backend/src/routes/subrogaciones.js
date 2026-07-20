const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos } = require('../middleware/rbac');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

const esSupervisor = (req) =>
  req.usuario.rol === 'supervisor' || (req.usuario.rolesRBAC || []).includes('SUPERVISOR');

const puedeGestionarTodas = (req) =>
  req.usuario.rol === 'admin' || (req.usuario.permisos || []).includes('usuarios.gestionar_roles');

// Lista liviana de usuarios activos, para elegir a quién delegar. Accesible a
// cualquier supervisor (no requiere el permiso amplio de gestión de usuarios).
router.get('/candidatos', async (req, res) => {
  if (!esSupervisor(req) && !puedeGestionarTodas(req)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, f.nombres, f.apellidos
      FROM usuarios u
      LEFT JOIN funcionarios f ON f.id = u.funcionario_id
      WHERE u.activo = true AND u.id <> $1
      ORDER BY f.apellidos NULLS LAST, u.email
    `, [req.usuario.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener candidatos' });
  }
});

// Subrogaciones donde el usuario es titular o subrogante, más todas si es ADMIN_TI/RRHH.
router.get('/', async (req, res) => {
  try {
    const base = `
      SELECT s.*,
        tit.email AS titular_email, ftit.nombres AS titular_nombres, ftit.apellidos AS titular_apellidos,
        sub.email AS subrogante_email, fsub.nombres AS subrogante_nombres, fsub.apellidos AS subrogante_apellidos
      FROM subrogaciones s
      JOIN usuarios tit ON tit.id = s.supervisor_titular_id
      LEFT JOIN funcionarios ftit ON ftit.id = tit.funcionario_id
      JOIN usuarios sub ON sub.id = s.usuario_subrogante_id
      LEFT JOIN funcionarios fsub ON fsub.id = sub.funcionario_id
    `;
    const result = puedeGestionarTodas(req)
      ? await pool.query(`${base} ORDER BY s.fecha_inicio DESC`)
      : await pool.query(
          `${base} WHERE s.supervisor_titular_id = $1 OR s.usuario_subrogante_id = $1 ORDER BY s.fecha_inicio DESC`,
          [req.usuario.id]
        );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener subrogaciones' });
  }
});

// Crear delegación temporal — solo el propio supervisor titular
router.post('/', async (req, res) => {
  if (!esSupervisor(req)) {
    return res.status(403).json({ error: 'Solo un supervisor puede delegar su rol' });
  }
  const { usuario_subrogante_id, fecha_inicio, fecha_fin, motivo } = req.body;
  if (!usuario_subrogante_id || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  if (usuario_subrogante_id == req.usuario.id) {
    return res.status(400).json({ error: 'No puede delegarse a sí mismo' });
  }

  try {
    const destino = await pool.query('SELECT id, activo FROM usuarios WHERE id = $1', [usuario_subrogante_id]);
    if (destino.rows.length === 0 || !destino.rows[0].activo) {
      return res.status(404).json({ error: 'Usuario subrogante no encontrado o inactivo' });
    }

    const result = await pool.query(
      `INSERT INTO subrogaciones
         (supervisor_titular_id, usuario_subrogante_id, fecha_inicio, fecha_fin, motivo, creado_por)
       VALUES ($1, $2, $3, $4, $5, $1)
       RETURNING *`,
      [req.usuario.id, usuario_subrogante_id, fecha_inicio, fecha_fin, motivo || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23514') return res.status(400).json({ error: 'Rango de fechas inválido' });
    res.status(500).json({ error: 'Error al crear la subrogación' });
  }
});

// Cancelar una delegación — el propio titular o roles de gestión
router.patch('/:id/cancelar', async (req, res) => {
  try {
    const sub = await pool.query('SELECT * FROM subrogaciones WHERE id = $1', [req.params.id]);
    if (sub.rows.length === 0) return res.status(404).json({ error: 'Subrogación no encontrada' });

    const esTitular = sub.rows[0].supervisor_titular_id == req.usuario.id;
    if (!esTitular && !puedeGestionarTodas(req)) {
      return res.status(403).json({ error: 'No puede cancelar esta subrogación' });
    }

    await pool.query('UPDATE subrogaciones SET activo = FALSE WHERE id = $1', [req.params.id]);
    res.json({ mensaje: 'Subrogación cancelada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cancelar la subrogación' });
  }
});

module.exports = router;
