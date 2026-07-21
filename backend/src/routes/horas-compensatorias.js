'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos, requierePermiso, esSoloAutoservicio, tieneVisibilidadGlobal } = require('../middleware/rbac');
const { FERIADOS_CHILE } = require('../utils/feriadoLegal');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

function detectarTipoDia(fecha) {
  const d = new Date(fecha + 'T12:00:00');
  const dow = d.getDay();
  const iso = d.toISOString().split('T')[0];
  if (FERIADOS_CHILE.has(iso)) return 'FERIADO';
  if (dow === 6) return 'SABADO';
  if (dow === 0) return 'DOMINGO';
  return 'HABIL';
}

function calcularFactor(tipoDia) {
  return tipoDia === 'HABIL' ? 1.25 : 1.50;
}

// ─── Saldo de horas de un funcionario ────────────────────────────────────────
async function calcularSaldo(funcionarioId) {
  const ganadas = await pool.query(
    `SELECT COALESCE(SUM(horas_compensatorias), 0) AS total
     FROM horas_compensatorias
     WHERE funcionario_id = $1 AND estado = 'activo'`,
    [funcionarioId]
  );
  const usadas = await pool.query(
    `SELECT COALESCE(SUM(horas_solicitadas), 0) AS total
     FROM solicitudes_compensacion
     WHERE funcionario_id = $1 AND estado = 'aprobado'`,
    [funcionarioId]
  );
  const pendientes = await pool.query(
    `SELECT COALESCE(SUM(horas_solicitadas), 0) AS total
     FROM solicitudes_compensacion
     WHERE funcionario_id = $1 AND estado = 'pendiente'`,
    [funcionarioId]
  );
  const hGanadas   = parseFloat(ganadas.rows[0].total);
  const hUsadas    = parseFloat(usadas.rows[0].total);
  const hPendientes = parseFloat(pendientes.rows[0].total);
  return {
    horas_ganadas:    hGanadas,
    horas_usadas:     hUsadas,
    horas_pendientes: hPendientes,
    saldo_disponible: Math.max(hGanadas - hUsadas - hPendientes, 0),
  };
}

// GET /api/horas-compensatorias/saldo/:funcionarioId
router.get('/saldo/:funcionarioId', async (req, res) => {
  const id = parseInt(req.params.funcionarioId);
  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const saldo = await calcularSaldo(id);
    res.json(saldo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular saldo' });
  }
});

// GET /api/horas-compensatorias — admin ve todo, funcionario ve las suyas
router.get('/', async (req, res) => {
  try {
    let whereClause = '1=1';
    const params = [];

    if (esSoloAutoservicio(req)) {
      whereClause += ` AND hc.funcionario_id = $${params.length + 1}`;
      params.push(req.usuario.funcionario_id);
    } else if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
      // Supervisor solo ve horas de funcionarios de su sector/área
      if (req.usuario.sector) {
        whereClause += ` AND f.sector = $${params.length + 1}`;
        params.push(req.usuario.sector);
      } else if (req.usuario.area) {
        whereClause += ` AND f.area = $${params.length + 1}`;
        params.push(req.usuario.area);
      } else if (req.usuario.funcionario_id) {
        whereClause += ` AND hc.funcionario_id = $${params.length + 1}`;
        params.push(req.usuario.funcionario_id);
      } else {
        whereClause += ' AND 1=0';
      }
    } else if (req.query.funcionario_id) {
      whereClause += ` AND hc.funcionario_id = $${params.length + 1}`;
      params.push(parseInt(req.query.funcionario_id));
    }

    const result = await pool.query(
      `SELECT hc.*,
              f.nombres, f.apellidos, f.rut, f.cargo,
              uf.nombres AS creado_por_nombre, uf.apellidos AS creado_por_apellido
       FROM horas_compensatorias hc
       JOIN funcionarios f ON hc.funcionario_id = f.id
       LEFT JOIN usuarios u ON hc.creado_por = u.id
       LEFT JOIN funcionarios uf ON u.funcionario_id = uf.id
       WHERE ${whereClause}
       ORDER BY hc.fecha_realizacion DESC, hc.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener horas compensatorias' });
  }
});

// GET /api/horas-compensatorias/funcionario/:id — saldo + registros de un funcionario
router.get('/funcionario/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  // Supervisor solo puede ver funcionarios de su sector/área o su propio perfil
  if (req.usuario.rol === 'supervisor' && req.usuario.funcionario_id != id && !tieneVisibilidadGlobal(req)) {
    const check = await pool.query('SELECT sector, area FROM funcionarios WHERE id = $1', [id]);
    if (check.rows.length > 0) {
      const f = check.rows[0];
      const inSector = req.usuario.sector && f.sector === req.usuario.sector;
      const inArea   = req.usuario.area   && f.area   === req.usuario.area;
      if (!inSector && !inArea) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }
    }
  }
  try {
    const [saldo, registros] = await Promise.all([
      calcularSaldo(id),
      pool.query(
        `SELECT hc.*, uf.nombres AS creado_por_nombre, uf.apellidos AS creado_por_apellido
         FROM horas_compensatorias hc
         LEFT JOIN usuarios u ON hc.creado_por = u.id
         LEFT JOIN funcionarios uf ON u.funcionario_id = uf.id
         WHERE hc.funcionario_id = $1
         ORDER BY hc.fecha_realizacion DESC`,
        [id]
      ),
    ]);
    res.json({ saldo, registros: registros.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});

// POST /api/horas-compensatorias — solo admin registra horas extraordinarias
router.post('/', requierePermiso('saldos.ajustar'), [
  body('funcionario_id').isInt({ min: 1 }),
  body('fecha_realizacion').isDate(),
  body('horas_realizadas').isFloat({ min: 0.25, max: 24 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { funcionario_id, fecha_realizacion, horas_realizadas, observaciones } = req.body;

  // Auto-detectar tipo de día y factor
  const tipo_dia       = detectarTipoDia(fecha_realizacion);
  const factor_aplicado = calcularFactor(tipo_dia);
  const horas_compensatorias = parseFloat((horas_realizadas * factor_aplicado).toFixed(2));

  try {
    const result = await pool.query(
      `INSERT INTO horas_compensatorias
         (funcionario_id, fecha_realizacion, tipo_dia, horas_realizadas,
          factor_aplicado, horas_compensatorias, observaciones, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [funcionario_id, fecha_realizacion, tipo_dia, parseFloat(horas_realizadas),
       factor_aplicado, horas_compensatorias, observaciones || null, req.usuario.id]
    );

    const saldo = await calcularSaldo(funcionario_id);
    res.status(201).json({ ...result.rows[0], saldo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar horas' });
  }
});

// DELETE /api/horas-compensatorias/:id — admin anula un registro
router.delete('/:id', requierePermiso('saldos.ajustar'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE horas_compensatorias
       SET estado = 'anulado', updated_at = NOW()
       WHERE id = $1 AND estado = 'activo'
       RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado o ya anulado' });
    }
    res.json({ mensaje: 'Registro anulado', registro: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al anular registro' });
  }
});

module.exports = router;
module.exports.calcularSaldo = calcularSaldo;
