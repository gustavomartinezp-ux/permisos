const express = require('express');
const { pool } = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dispositivos WHERE activo = true ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener dispositivos' });
  }
});

router.post('/', soloAdmin, async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const r = await pool.query(
      'INSERT INTO dispositivos (nombre, descripcion) VALUES ($1, $2) RETURNING *',
      [nombre.trim(), descripcion || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear dispositivo' });
  }
});

router.put('/:id', soloAdmin, async (req, res) => {
  const { nombre, descripcion, activo } = req.body;
  try {
    const r = await pool.query(
      'UPDATE dispositivos SET nombre=$1, descripcion=$2, activo=$3 WHERE id=$4 RETURNING *',
      [nombre, descripcion || null, activo !== false, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar dispositivo' });
  }
});

module.exports = router;
