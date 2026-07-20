const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos, requierePermiso } = require('../middleware/rbac');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

router.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM servicios WHERE activo = true ORDER BY nombre');
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

router.get('/todos', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM servicios ORDER BY nombre');
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

router.post('/', requierePermiso('configuracion.gestionar'), async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const r = await pool.query(
      'INSERT INTO servicios (nombre, descripcion) VALUES ($1, $2) RETURNING *',
      [nombre.trim(), descripcion || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ya existe un servicio con ese nombre' });
    res.status(500).json({ error: 'Error al crear servicio' });
  }
});

router.put('/:id', requierePermiso('configuracion.gestionar'), async (req, res) => {
  const { nombre, descripcion, activo } = req.body;
  try {
    const r = await pool.query(
      'UPDATE servicios SET nombre=$1, descripcion=$2, activo=$3 WHERE id=$4 RETURNING *',
      [nombre, descripcion || null, activo !== false, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar servicio' });
  }
});

module.exports = router;
