'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const { verificarToken, soloAdmin, adminOSupervisor } = require('../middleware/auth');
const { calcularSaldo } = require('./horas-compensatorias');

const router = express.Router();
router.use(verificarToken);

// GET /api/solicitudes-compensacion — lista
router.get('/', async (req, res) => {
  try {
    let where = '1=1';
    const params = [];

    if (req.usuario.rol === 'funcionario') {
      where += ` AND sc.funcionario_id = $${params.length + 1}`;
      params.push(req.usuario.funcionario_id);
    } else if (req.query.funcionario_id) {
      where += ` AND sc.funcionario_id = $${params.length + 1}`;
      params.push(parseInt(req.query.funcionario_id));
    }
    if (req.query.estado) {
      where += ` AND sc.estado = $${params.length + 1}`;
      params.push(req.query.estado);
    }

    const result = await pool.query(
      `SELECT sc.*,
              f.nombres, f.apellidos, f.rut, f.sector,
              aprobador.nombres AS aprobador_nombres, aprobador.apellidos AS aprobador_apellidos
       FROM solicitudes_compensacion sc
       JOIN funcionarios f ON sc.funcionario_id = f.id
       LEFT JOIN usuarios u ON sc.aprobado_por = u.id
       LEFT JOIN funcionarios aprobador ON u.funcionario_id = aprobador.id
       WHERE ${where}
       ORDER BY sc.fecha_solicitud DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

// POST /api/solicitudes-compensacion — funcionario solicita usar horas
router.post('/', [
  body('funcionario_id').isInt({ min: 1 }),
  body('fecha_inicio').isDate(),
  body('fecha_fin').isDate(),
  body('horas_solicitadas').isFloat({ min: 0.25 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { funcionario_id, fecha_inicio, fecha_fin, horas_solicitadas, motivo } = req.body;

  if (req.usuario.rol === 'funcionario' && req.usuario.funcionario_id != funcionario_id) {
    return res.status(403).json({ error: 'Solo puedes solicitar para ti mismo' });
  }
  if (new Date(fecha_fin) < new Date(fecha_inicio)) {
    return res.status(400).json({ error: 'La fecha fin debe ser igual o posterior a la fecha inicio' });
  }

  // Verificar saldo disponible (backend obligatorio)
  const saldo = await calcularSaldo(funcionario_id);
  if (saldo.saldo_disponible < parseFloat(horas_solicitadas)) {
    return res.status(400).json({
      error: `Saldo insuficiente. Disponible: ${saldo.saldo_disponible} hrs, solicitadas: ${horas_solicitadas} hrs`,
      saldo_disponible: saldo.saldo_disponible,
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO solicitudes_compensacion
         (funcionario_id, fecha_inicio, fecha_fin, horas_solicitadas, motivo)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [funcionario_id, fecha_inicio, fecha_fin, parseFloat(horas_solicitadas), motivo || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar solicitud' });
  }
});

// PATCH /api/solicitudes-compensacion/:id/aprobar — admin/supervisor aprueba
router.patch('/:id/aprobar', adminOSupervisor, async (req, res) => {
  const { observaciones } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sol = await client.query(
      `SELECT * FROM solicitudes_compensacion WHERE id = $1 AND estado = 'pendiente' FOR UPDATE`,
      [req.params.id]
    );
    if (sol.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }

    const s = sol.rows[0];
    const saldo = await calcularSaldo(s.funcionario_id);
    if (saldo.saldo_disponible < parseFloat(s.horas_solicitadas)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Saldo insuficiente al momento de aprobar. Disponible: ${saldo.saldo_disponible} hrs`,
        saldo_disponible: saldo.saldo_disponible,
      });
    }

    await client.query(
      `UPDATE solicitudes_compensacion
       SET estado = 'aprobado', aprobado_por = $1, fecha_resolucion = NOW(), observaciones = $2
       WHERE id = $3`,
      [req.usuario.id, observaciones || null, req.params.id]
    );

    await client.query('COMMIT');
    const saldoNuevo = await calcularSaldo(s.funcionario_id);
    res.json({ mensaje: 'Solicitud aprobada', saldo: saldoNuevo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al aprobar solicitud' });
  } finally {
    client.release();
  }
});

// PATCH /api/solicitudes-compensacion/:id/rechazar
router.patch('/:id/rechazar', adminOSupervisor, async (req, res) => {
  const { observaciones } = req.body;
  try {
    const result = await pool.query(
      `UPDATE solicitudes_compensacion
       SET estado = 'rechazado', aprobado_por = $1, fecha_resolucion = NOW(), observaciones = $2
       WHERE id = $3 AND estado = 'pendiente' RETURNING *`,
      [req.usuario.id, observaciones || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }
    res.json({ mensaje: 'Solicitud rechazada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al rechazar solicitud' });
  }
});

// PATCH /api/solicitudes-compensacion/:id/cancelar — funcionario cancela la suya
router.patch('/:id/cancelar', async (req, res) => {
  try {
    const sol = await pool.query(
      `SELECT * FROM solicitudes_compensacion WHERE id = $1 AND estado = 'pendiente'`,
      [req.params.id]
    );
    if (sol.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }
    if (req.usuario.rol === 'funcionario' && req.usuario.funcionario_id != sol.rows[0].funcionario_id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    await pool.query(
      `UPDATE solicitudes_compensacion SET estado = 'cancelado', fecha_resolucion = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ mensaje: 'Solicitud cancelada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cancelar solicitud' });
  }
});

module.exports = router;
