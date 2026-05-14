const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM tipos_permisos ORDER BY nombre`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tipos de permisos' });
  }
});

router.post('/', soloAdmin, [
  body('codigo').notEmpty().trim().toUpperCase(),
  body('nombre').notEmpty().trim(),
  body('dias_anuales_max').isInt({ min: 0 }),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    codigo, nombre, descripcion, dias_anuales_max, requiere_aprobacion, color, es_feriado_legal,
    es_especial, tipo_especial, dias_fijos, tipo_dias, normativa, requiere_certificado,
  } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const nuevo = await client.query(
      `INSERT INTO tipos_permisos
         (codigo, nombre, descripcion, dias_anuales_max, requiere_aprobacion, color, es_feriado_legal,
          es_especial, tipo_especial, dias_fijos, tipo_dias, normativa, requiere_certificado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        codigo, nombre, descripcion || null, parseInt(dias_anuales_max),
        requiere_aprobacion !== false, color || '#3B82F6', es_feriado_legal === true,
        es_especial === true, tipo_especial || null,
        dias_fijos ? parseInt(dias_fijos) : null,
        tipo_dias || null, normativa || null,
        requiere_certificado === true,
      ]
    );

    // Los permisos especiales no tienen saldo — solo crear saldos para tipos normales
    if (!es_especial) {
      const anio = new Date().getFullYear();
      await client.query(
        `INSERT INTO saldos_funcionarios (funcionario_id, tipo_permiso_id, anio, dias_asignados)
         SELECT f.id, $1, $2, $3
         FROM funcionarios f
         WHERE f.activo = true
         ON CONFLICT (funcionario_id, tipo_permiso_id, anio) DO NOTHING`,
        [nuevo.rows[0].id, anio, parseInt(dias_anuales_max)]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(nuevo.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'El código ya existe' });
    console.error(err);
    res.status(500).json({ error: 'Error al crear tipo de permiso' });
  } finally {
    client.release();
  }
});

router.put('/:id', soloAdmin, async (req, res) => {
  const {
    nombre, descripcion, dias_anuales_max, requiere_aprobacion, color, activo, es_feriado_legal,
    es_especial, tipo_especial, dias_fijos, tipo_dias, normativa, requiere_certificado,
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tipos_permisos
       SET nombre=$1, descripcion=$2, dias_anuales_max=$3,
           requiere_aprobacion=$4, color=$5, activo=$6, es_feriado_legal=$7,
           es_especial=$8, tipo_especial=$9, dias_fijos=$10,
           tipo_dias=$11, normativa=$12, requiere_certificado=$13
       WHERE id=$14 RETURNING *`,
      [
        nombre, descripcion || null, parseInt(dias_anuales_max),
        requiere_aprobacion !== false, color, activo !== false, es_feriado_legal === true,
        es_especial === true, tipo_especial || null,
        dias_fijos ? parseInt(dias_fijos) : null,
        tipo_dias || null, normativa || null,
        requiere_certificado === true,
        req.params.id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar tipo de permiso' });
  }
});

module.exports = router;
