const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos, requierePermiso } = require('../middleware/rbac');

const router = express.Router();
router.use(verificarToken, cargarPermisos, requierePermiso('usuarios.gestionar_roles'));

// Catálogo de roles disponibles
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, codigo, nombre, descripcion FROM roles ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener roles' });
  }
});

// Usuarios con su rol legacy y sus roles RBAC actuales
router.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id, u.email, u.rol AS rol_legacy, u.activo,
        f.nombres, f.apellidos,
        COALESCE(
          JSON_AGG(r.codigo ORDER BY r.codigo) FILTER (WHERE r.codigo IS NOT NULL),
          '[]'
        ) AS roles_rbac
      FROM usuarios u
      LEFT JOIN funcionarios f ON f.id = u.funcionario_id
      LEFT JOIN user_roles ur ON ur.usuario_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      GROUP BY u.id, u.email, u.rol, u.activo, f.nombres, f.apellidos
      ORDER BY u.activo DESC, f.apellidos NULLS LAST, u.email
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios y roles' });
  }
});

// Asignar un rol RBAC a un usuario
router.post('/usuarios/:usuarioId/asignar', async (req, res) => {
  const { usuarioId } = req.params;
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ error: 'Falta el código del rol' });

  try {
    const rol = await pool.query('SELECT id FROM roles WHERE codigo = $1', [codigo]);
    if (rol.rows.length === 0) return res.status(404).json({ error: 'Rol no encontrado' });

    await pool.query(
      `INSERT INTO user_roles (usuario_id, role_id, asignado_por) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [usuarioId, rol.rows[0].id, req.usuario.id]
    );
    res.json({ mensaje: 'Rol asignado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al asignar rol' });
  }
});

// Revocar un rol RBAC de un usuario
router.delete('/usuarios/:usuarioId/roles/:codigo', async (req, res) => {
  const { usuarioId, codigo } = req.params;
  try {
    const rol = await pool.query('SELECT id FROM roles WHERE codigo = $1', [codigo]);
    if (rol.rows.length === 0) return res.status(404).json({ error: 'Rol no encontrado' });

    await pool.query(
      'DELETE FROM user_roles WHERE usuario_id = $1 AND role_id = $2',
      [usuarioId, rol.rows[0].id]
    );
    res.json({ mensaje: 'Rol revocado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al revocar rol' });
  }
});

module.exports = router;
