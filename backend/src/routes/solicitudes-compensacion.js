'use strict';
const express = require('express');
const { pool } = require('../db');
const { verificarToken, adminOSupervisor } = require('../middleware/auth');
const { cargarPermisos, tieneVisibilidadGlobal } = require('../middleware/rbac');
const { calcularSaldo } = require('./horas-compensatorias');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

// ─── FIFO: registra qué horas específicas se consumieron al aprobar ───────────
async function registrarConsumoFIFO(client, solicitudId, funcionarioId, horasSolicitadas) {
  const { rows } = await client.query(
    `SELECT hc.id, hc.fecha_realizacion, hc.tipo_dia, hc.factor_aplicado,
            hc.horas_compensatorias,
            COALESCE(SUM(con.horas_consumidas), 0) AS ya_consumidas
     FROM horas_compensatorias hc
     LEFT JOIN horas_compensatorias_consumo con ON con.horas_comp_id = hc.id
     WHERE hc.funcionario_id = $1 AND hc.estado = 'activo'
     GROUP BY hc.id
     HAVING hc.horas_compensatorias > COALESCE(SUM(con.horas_consumidas), 0)
     ORDER BY hc.fecha_realizacion ASC, hc.created_at ASC`,
    [funcionarioId]
  );

  let remaining = parseFloat(horasSolicitadas);
  for (const h of rows) {
    if (remaining <= 0) break;
    const disponible = parseFloat(h.horas_compensatorias) - parseFloat(h.ya_consumidas);
    const toConsume  = Math.min(disponible, remaining);
    await client.query(
      `INSERT INTO horas_compensatorias_consumo
         (solicitud_id, horas_comp_id, horas_consumidas, fecha_realizacion, tipo_dia, factor_aplicado)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [solicitudId, h.id, toConsume, h.fecha_realizacion, h.tipo_dia, h.factor_aplicado]
    );
    remaining -= toConsume;
  }
}

// ─── GET /api/solicitudes-compensacion ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let where = '1=1';
    const params = [];

    if (req.usuario.rol === 'funcionario') {
      where += ` AND sc.funcionario_id = $${params.length + 1}`;
      params.push(req.usuario.funcionario_id);
    } else if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
      // Supervisor ve sus propias solicitudes + las de su sector/área
      const condiciones = [];
      if (req.usuario.funcionario_id) {
        params.push(req.usuario.funcionario_id);
        condiciones.push(`sc.funcionario_id = $${params.length}`);
      }
      if (req.usuario.sector) {
        params.push(req.usuario.sector);
        condiciones.push(`f.sector = $${params.length}`);
      } else if (req.usuario.area) {
        params.push(req.usuario.area);
        condiciones.push(`f.area = $${params.length}`);
      }
      if (condiciones.length > 0) {
        where += ` AND (${condiciones.join(' OR ')})`;
      } else {
        where += ' AND 1=0';
      }
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

    const solicitudes = result.rows;

    // Adjuntar detalle FIFO a las aprobadas (solo si la tabla ya existe)
    const idsAprobadas = solicitudes.filter(s => s.estado === 'aprobado').map(s => s.id);
    if (idsAprobadas.length > 0) {
      try {
        const consumo = await pool.query(
          `SELECT con.* FROM horas_compensatorias_consumo con
           WHERE con.solicitud_id = ANY($1)
           ORDER BY con.fecha_realizacion ASC`,
          [idsAprobadas]
        );
        const mapa = {};
        for (const c of consumo.rows) {
          if (!mapa[c.solicitud_id]) mapa[c.solicitud_id] = [];
          mapa[c.solicitud_id].push(c);
        }
        for (const s of solicitudes) s.consumo_detalle = mapa[s.id] || [];
      } catch {
        for (const s of solicitudes) s.consumo_detalle = [];
      }
    }

    res.json(solicitudes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

// ─── POST /api/solicitudes-compensacion ──────────────────────────────────────
router.post('/', async (req, res) => {
  const { funcionario_id, fecha_jornada, horas_solicitadas, motivo } = req.body;

  // Validar funcionario_id
  if (!funcionario_id || !Number.isInteger(Number(funcionario_id))) {
    return res.status(400).json({ error: 'Funcionario inválido' });
  }
  if (!fecha_jornada) {
    return res.status(400).json({ error: 'La fecha de jornada es obligatoria' });
  }

  // Validar horas enteras
  const horasInt = Number(horas_solicitadas);
  if (!Number.isInteger(horasInt) || horasInt < 1) {
    return res.status(400).json({ error: 'Las horas deben ser un número entero de al menos 1' });
  }
  if (horasInt > 8) {
    return res.status(400).json({ error: 'No se pueden solicitar más de 8 horas por jornada' });
  }

  if (req.usuario.rol === 'funcionario' && req.usuario.funcionario_id != funcionario_id) {
    return res.status(403).json({ error: 'Solo puedes solicitar para ti mismo' });
  }

  // Verificar saldo (backend obligatorio)
  const saldo = await calcularSaldo(Number(funcionario_id));
  if (saldo.saldo_disponible < horasInt) {
    return res.status(400).json({
      error: `Saldo insuficiente. Disponible: ${saldo.saldo_disponible} hrs, solicitadas: ${horasInt} hrs`,
      saldo_disponible: saldo.saldo_disponible,
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO solicitudes_compensacion
         (funcionario_id, fecha_inicio, fecha_fin, horas_solicitadas, motivo, saldo_anterior, saldo_restante)
       VALUES ($1,$2,$2,$3,$4,$5,$6) RETURNING *`,
      [
        Number(funcionario_id), fecha_jornada, horasInt, motivo || null,
        saldo.saldo_disponible,
        saldo.saldo_disponible - horasInt,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar solicitud' });
  }
});

// ─── PATCH /:id/aprobar ───────────────────────────────────────────────────────
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

    // Supervisor no puede aprobar su propia solicitud de horas compensatorias
    if (req.usuario.rol === 'supervisor' && req.usuario.funcionario_id && s.funcionario_id == req.usuario.funcionario_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puede aprobar su propia solicitud de horas compensatorias. Debe ser procesada por el Administrador.' });
    }

    // Supervisor solo puede aprobar solicitudes de funcionarios bajo su cargo
    if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
      const funcCheck = await client.query('SELECT sector, area FROM funcionarios WHERE id = $1', [s.funcionario_id]);
      const f = funcCheck.rows[0];
      const inSector = req.usuario.sector && f?.sector === req.usuario.sector;
      const inArea   = req.usuario.area   && f?.area   === req.usuario.area;
      if (!inSector && !inArea) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Solo puede aprobar solicitudes de funcionarios bajo su cargo directo' });
      }
    }

    const saldo = await calcularSaldo(s.funcionario_id);
    if (saldo.saldo_disponible < parseFloat(s.horas_solicitadas)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Saldo insuficiente al aprobar. Disponible: ${saldo.saldo_disponible} hrs`,
        saldo_disponible: saldo.saldo_disponible,
      });
    }

    const saldoRestante = saldo.saldo_disponible - parseFloat(s.horas_solicitadas);

    await client.query(
      `UPDATE solicitudes_compensacion
       SET estado = 'aprobado', aprobado_por = $1, fecha_resolucion = NOW(),
           observaciones = $2, saldo_restante = $3
       WHERE id = $4`,
      [req.usuario.id, observaciones || null, saldoRestante, req.params.id]
    );

    // Registrar consumo FIFO para trazabilidad
    await registrarConsumoFIFO(client, parseInt(req.params.id), s.funcionario_id, s.horas_solicitadas);

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

// ─── PATCH /:id/rechazar ──────────────────────────────────────────────────────
router.patch('/:id/rechazar', adminOSupervisor, async (req, res) => {
  const { observaciones } = req.body;
  try {
    // Verificar existencia y scope antes de rechazar
    if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
      const solCheck = await pool.query(
        `SELECT sc.funcionario_id, f.sector, f.area
         FROM solicitudes_compensacion sc
         JOIN funcionarios f ON sc.funcionario_id = f.id
         WHERE sc.id = $1 AND sc.estado = 'pendiente'`,
        [req.params.id]
      );
      if (!solCheck.rows.length) {
        return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
      }
      const s = solCheck.rows[0];

      if (req.usuario.funcionario_id && s.funcionario_id == req.usuario.funcionario_id) {
        return res.status(403).json({ error: 'No puede rechazar su propia solicitud de horas compensatorias. Solo el Administrador puede hacerlo.' });
      }

      const inSector = req.usuario.sector && s.sector === req.usuario.sector;
      const inArea   = req.usuario.area   && s.area   === req.usuario.area;
      if (!inSector && !inArea) {
        return res.status(403).json({ error: 'Solo puede gestionar solicitudes de funcionarios bajo su cargo directo' });
      }
    }

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

// ─── PATCH /:id/cancelar ─────────────────────────────────────────────────────
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
