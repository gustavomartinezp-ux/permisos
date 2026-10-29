'use strict';
const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos } = require('../middleware/rbac');
const { imagenValida } = require('../utils/firmas');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

// Cada funcionario administra solo su propia firma: nadie puede registrarla
// por otro (ni RRHH), para que la firma estampada sea siempre de su titular.
const sinFuncionario = (req, res) => {
  if (req.usuario.funcionario_id) return false;
  res.status(400).json({ error: 'Su cuenta no está vinculada a un funcionario' });
  return true;
};

router.get('/mia', async (req, res) => {
  if (sinFuncionario(req, res)) return;
  try {
    const { rows } = await pool.query(
      'SELECT imagen, created_at FROM firmas WHERE funcionario_id = $1 AND activa',
      [req.usuario.funcionario_id]
    );
    res.json(rows[0] || { imagen: null });
  } catch (err) {
    console.error('[firmas] get:', err.message);
    res.status(500).json({ error: 'Error al obtener la firma' });
  }
});

router.put('/mia', async (req, res) => {
  if (sinFuncionario(req, res)) return;
  const { imagen } = req.body || {};
  if (!imagenValida(imagen)) return res.status(400).json({ error: 'La firma debe ser una imagen PNG de menos de 150 KB' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE firmas SET activa = FALSE WHERE funcionario_id = $1 AND activa', [req.usuario.funcionario_id]);
    const { rows } = await client.query(
      'INSERT INTO firmas (funcionario_id, imagen) VALUES ($1, $2) RETURNING imagen, created_at',
      [req.usuario.funcionario_id, imagen]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[firmas] put:', err.message);
    res.status(500).json({ error: 'Error al guardar la firma' });
  } finally {
    client.release();
  }
});

// Desactiva la firma; los documentos ya firmados la conservan
router.delete('/mia', async (req, res) => {
  if (sinFuncionario(req, res)) return;
  try {
    await pool.query('UPDATE firmas SET activa = FALSE WHERE funcionario_id = $1 AND activa', [req.usuario.funcionario_id]);
    res.json({ imagen: null });
  } catch (err) {
    console.error('[firmas] delete:', err.message);
    res.status(500).json({ error: 'Error al eliminar la firma' });
  }
});

module.exports = router;
