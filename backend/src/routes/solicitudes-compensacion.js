'use strict';
const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos, requierePermiso, esSoloAutoservicio, alcanceSupervisor, filtroAlcance, dentroDeAlcance, puedeActuarPorFuncionario } = require('../middleware/rbac');
const { calcularSaldo } = require('./horas-compensatorias');
const { firmaActivaDeUsuario, firmarComoSolicitante, puedeVerDocumentosDe, etapa } = require('../utils/firmas');
const { registrarAcceso } = require('../utils/accesos');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

// Admin/supervisor (rol legacy) o cualquier cuenta con el permiso RBAC
// saldos.ajustar (RRHH_ADMIN/SECRETARY) — antes esto se limitaba al rol
// legacy exacto y bloqueaba con 403 a cuentas RBAC sin ese rol, lo que además
// dispara el logout forzado del interceptor global de axios ante cualquier 403.
const puedeGestionarCompensacion = (req, res, next) => {
  if (['admin', 'supervisor'].includes(req.usuario.rol)) return next();
  if ((req.usuario.rolesRBAC || []).includes('SUPERVISOR')) return next(); // subrogante
  if ((req.usuario.permisos || []).includes('saldos.ajustar')) return next();
  return res.status(403).json({ error: 'No tienes permiso para gestionar solicitudes de horas compensatorias' });
};

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

    if (esSoloAutoservicio(req)) {
      where += ` AND sc.funcionario_id = $${params.length + 1}`;
      params.push(req.usuario.funcionario_id);
    } else if (alcanceSupervisor(req)) {
      // Supervisor ve sus propias solicitudes + las de su sector/área
      const condiciones = [];
      if (req.usuario.funcionario_id) {
        params.push(req.usuario.funcionario_id);
        condiciones.push(`sc.funcionario_id = $${params.length}`);
      }
      const cond = filtroAlcance(alcanceSupervisor(req), params);
      if (cond) condiciones.push(cond);
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
              -- Datos para el formato oficial de descanso compensatorio
              f.cargo, f.escalafon, f.tipo_contrato, f.horas_contrato,
              f.tipo_contrato_2, f.horas_contrato_2, disp.nombre AS dispositivo,
              aprobador.nombres AS aprobador_nombres, aprobador.apellidos AS aprobador_apellidos
       FROM solicitudes_compensacion sc
       JOIN funcionarios f ON sc.funcionario_id = f.id
       LEFT JOIN dispositivos disp ON disp.id = f.dispositivo_id
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
  const horaInicio = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.body.hora_inicio || '')) ? req.body.hora_inicio : null;

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

  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != funcionario_id) {
    return res.status(403).json({ error: 'Solo puedes solicitar para ti mismo' });
  }
  if (!(await puedeActuarPorFuncionario(req, funcionario_id))) {
    return res.status(403).json({ error: 'Solo puede ingresar a nombre de funcionarios de su sector o área' });
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
         (funcionario_id, fecha_inicio, fecha_fin, horas_solicitadas, motivo, saldo_anterior, saldo_restante, hora_inicio)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        Number(funcionario_id), fecha_jornada, horasInt, motivo || null,
        saldo.saldo_disponible,
        saldo.saldo_disponible - horasInt,
        horaInicio,
      ]
    );
    await firmarComoSolicitante(pool, 'solicitudes_compensacion', req, [result.rows[0].id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar solicitud' });
  }
});

// ─── GET /:id/firmas — solicitante y jefatura o Dirección que aprobó ─────────
router.get('/:id/firmas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sc.estado, sc.firma_solicitante_en, sc.fecha_resolucion, sc.aprobado_por,
              f.id, f.sector, f.sector_2, f.area, f.nombres || ' ' || f.apellidos AS solicitante,
              fs.imagen AS img_solicitante, fd.imagen AS img_direccion,
              pd.nombres || ' ' || pd.apellidos AS direccion
       FROM solicitudes_compensacion sc
       JOIN funcionarios f ON f.id = sc.funcionario_id
       LEFT JOIN firmas fs ON fs.id = sc.firma_solicitante_id
       LEFT JOIN firmas fd ON fd.id = sc.firma_direccion_id
       LEFT JOIN usuarios ud ON ud.id = sc.aprobado_por
       LEFT JOIN funcionarios pd ON pd.id = ud.funcionario_id
       WHERE sc.id = $1`,
      [parseInt(req.params.id)]
    );
    const s = rows[0];
    if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (!puedeVerDocumentosDe(req, s)) return res.status(403).json({ error: 'Acceso denegado' });
    registrarAcceso(req, { funcionarioId: s.id, recurso: 'documento', detalle: `compensatorio ${req.params.id}` });
    res.json({
      solicitante: etapa(['pendiente', 'aprobado'].includes(s.estado) && s.firma_solicitante_en, s.solicitante, s.firma_solicitante_en, s.img_solicitante),
      jefe: null,
      direccion: etapa(s.estado === 'aprobado' && s.aprobado_por, s.direccion, s.fecha_resolucion, s.img_direccion),
    });
  } catch (err) {
    console.error('[compensacion] firmas:', err.message);
    res.status(500).json({ error: 'Error al obtener las firmas' });
  }
});

// ─── PATCH /:id/firmar — el funcionario firma su propia solicitud ────────────
router.patch('/:id/firmar', async (req, res) => {
  if (!req.usuario.funcionario_id) return res.status(400).json({ error: 'Su cuenta no está vinculada a un funcionario' });
  try {
    const { rows } = await pool.query(
      `UPDATE solicitudes_compensacion
       SET firma_solicitante_en = NOW(),
           firma_solicitante_id = (SELECT id FROM firmas WHERE funcionario_id = $2 AND activa)
       WHERE id = $1 AND funcionario_id = $2 AND estado IN ('pendiente', 'aprobado')
         AND EXISTS (SELECT 1 FROM firmas WHERE funcionario_id = $2 AND activa)
       RETURNING id`,
      [parseInt(req.params.id), req.usuario.funcionario_id]
    );
    if (!rows[0]) return res.status(400).json({ error: 'Registre su firma en "Mi firma" y firme solo sus solicitudes vigentes' });
    res.json({ mensaje: 'Solicitud firmada' });
  } catch (err) {
    console.error('[compensacion] firmar:', err.message);
    res.status(500).json({ error: 'Error al firmar la solicitud' });
  }
});

// ─── PATCH /:id/aprobar ───────────────────────────────────────────────────────
router.patch('/:id/aprobar', puedeGestionarCompensacion, async (req, res) => {
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
    if (alcanceSupervisor(req) && req.usuario.funcionario_id && s.funcionario_id == req.usuario.funcionario_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puede aprobar su propia solicitud de horas compensatorias. Debe ser procesada por el Administrador.' });
    }

    // Supervisor solo puede aprobar solicitudes de funcionarios bajo su cargo
    const alcance = alcanceSupervisor(req);
    if (alcance) {
      const funcCheck = await client.query('SELECT sector, sector_2, area FROM funcionarios WHERE id = $1', [s.funcionario_id]);
      if (!dentroDeAlcance(alcance, funcCheck.rows[0])) {
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
           observaciones = $2, saldo_restante = $3,
           firma_direccion_id = ${firmaActivaDeUsuario(1)}
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
router.patch('/:id/rechazar', puedeGestionarCompensacion, async (req, res) => {
  const { observaciones } = req.body;
  try {
    // Verificar existencia y scope antes de rechazar
    const alcance = alcanceSupervisor(req);
    if (alcance) {
      const solCheck = await pool.query(
        `SELECT sc.funcionario_id, f.sector, f.sector_2, f.area
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

      if (!dentroDeAlcance(alcance, s)) {
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
    if (esSoloAutoservicio(req) && req.usuario.funcionario_id != sol.rows[0].funcionario_id) {
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
