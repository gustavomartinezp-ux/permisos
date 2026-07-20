const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos, esSoloAutoservicio } = require('../middleware/rbac');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

router.get('/', async (req, res) => {
  const { funcionario_id, tipo_movimiento, limit = 100, offset = 0 } = req.query;

  let where = '1=1';
  const params = [];
  let idx = 1;

  if (esSoloAutoservicio(req)) {
    where += ` AND hm.funcionario_id = $${idx++}`;
    params.push(req.usuario.funcionario_id);
  } else if (funcionario_id) {
    where += ` AND hm.funcionario_id = $${idx++}`;
    params.push(funcionario_id);
  }

  if (tipo_movimiento) {
    where += ` AND hm.tipo_movimiento = $${idx++}`;
    params.push(tipo_movimiento);
  }

  params.push(parseInt(limit), parseInt(offset));

  try {
    const result = await pool.query(
      `SELECT
         hm.*,
         f.nombres, f.apellidos, f.rut,
         tp.nombre AS tipo_permiso_nombre, tp.codigo, tp.color,
         responsable.nombres AS responsable_nombres,
         responsable.apellidos AS responsable_apellidos,
         u.rol AS responsable_rol
       FROM historial_movimientos hm
       JOIN funcionarios f ON hm.funcionario_id = f.id
       JOIN tipos_permisos tp ON hm.tipo_permiso_id = tp.id
       LEFT JOIN usuarios u ON hm.usuario_responsable = u.id
       LEFT JOIN funcionarios responsable ON u.funcionario_id = responsable.id
       WHERE ${where}
       ORDER BY hm.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    const total = await pool.query(
      `SELECT COUNT(*) FROM historial_movimientos hm WHERE ${where}`,
      params.slice(0, -2)
    );

    res.json({ movimientos: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

router.get('/funcionario/:id', async (req, res) => {
  const { id } = req.params;
  const { anio, limit = 50 } = req.query;

  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  let where = 'hm.funcionario_id = $1';
  const params = [id];
  let idx = 2;

  if (anio) {
    where += ` AND EXTRACT(YEAR FROM hm.created_at) = $${idx++}`;
    params.push(anio);
  }

  params.push(parseInt(limit));

  try {
    const result = await pool.query(
      `SELECT
         hm.*,
         tp.nombre AS tipo_permiso_nombre, tp.codigo, tp.color,
         responsable.nombres AS responsable_nombres,
         responsable.apellidos AS responsable_apellidos
       FROM historial_movimientos hm
       JOIN tipos_permisos tp ON hm.tipo_permiso_id = tp.id
       LEFT JOIN usuarios u ON hm.usuario_responsable = u.id
       LEFT JOIN funcionarios responsable ON u.funcionario_id = responsable.id
       WHERE ${where}
       ORDER BY hm.created_at DESC
       LIMIT $${idx}`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener historial del funcionario' });
  }
});

module.exports = router;
