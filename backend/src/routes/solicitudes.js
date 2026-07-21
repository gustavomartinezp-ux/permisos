const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const { verificarToken, soloAdmin, adminOSupervisor } = require('../middleware/auth');
const { cargarPermisos, requierePermiso, noAutoAprobacion, esSoloAutoservicio, tieneVisibilidadGlobal } = require('../middleware/rbac');
const {
  calcularDiasHabiles,
  calcularDistribucion,
  calcularFechaFinEspecial,
  validarBloqueObligatorio10Dias,
  verificarSolapamiento,
  fechaEnesimoDiaHabil,
  siguienteDiaHabil,
} = require('../utils/feriadoLegal');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

async function registrarMovimiento(client, {
  funcionarioId, solicitudId = null, tipoPermisoId, tipoMovimiento,
  diasMovimiento, saldoAnterior, saldoNuevo, descripcion, usuarioId,
}) {
  await client.query(
    `INSERT INTO historial_movimientos
       (funcionario_id, solicitud_id, tipo_permiso_id, tipo_movimiento,
        dias_movimiento, saldo_anterior, saldo_nuevo, descripcion, usuario_responsable)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [funcionarioId, solicitudId, tipoPermisoId, tipoMovimiento,
     diasMovimiento, saldoAnterior, saldoNuevo, descripcion, usuarioId]
  );
}

async function actualizarEstadoSolicitud(client, id, estado, usuarioId, observaciones) {
  await client.query(
    `UPDATE solicitudes
     SET estado = $1, aprobado_por = $2, fecha_resolucion = NOW(), observaciones = $3
     WHERE id = $4`,
    [estado, usuarioId, observaciones || null, id]
  );
}

router.get('/', async (req, res) => {
  try {
    const { estado, funcionario_id, limit = 50, offset = 0 } = req.query;

    let whereClause = '1=1';
    const params = [];
    let paramIdx = 1;

    if (esSoloAutoservicio(req)) {
      whereClause += ` AND sol.funcionario_id = $${paramIdx++}`;
      params.push(req.usuario.funcionario_id);
    } else {
      if (funcionario_id) {
        whereClause += ` AND sol.funcionario_id = $${paramIdx++}`;
        params.push(funcionario_id);
      }
      // Supervisor solo ve su sector o su área
      if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
        if (req.usuario.sector) {
          whereClause += ` AND f.sector = $${paramIdx++}`;
          params.push(req.usuario.sector);
        } else if (req.usuario.area) {
          whereClause += ` AND f.area = $${paramIdx++}`;
          params.push(req.usuario.area);
        }
      }
    }

    if (estado) {
      whereClause += ` AND sol.estado = $${paramIdx++}`;
      params.push(estado);
    }

    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(
      `SELECT
         sol.*,
         f.nombres, f.apellidos, f.rut, f.cargo, f.sector, f.area AS funcionario_area,
         s.nombre AS servicio,
         tp.nombre AS tipo_nombre, tp.codigo AS tipo_codigo, tp.color,
         tp.es_feriado_legal, tp.es_especial, tp.tipo_especial,
         aprobador.nombres AS aprobador_nombres,
         aprobador.apellidos AS aprobador_apellidos,
         preap_func.nombres AS preaprobador_nombres,
         preap_func.apellidos AS preaprobador_apellidos
       FROM solicitudes sol
       JOIN funcionarios f ON sol.funcionario_id = f.id
       LEFT JOIN servicios s ON f.servicio_id = s.id
       JOIN tipos_permisos tp ON sol.tipo_permiso_id = tp.id
       LEFT JOIN usuarios u ON sol.aprobado_por = u.id
       LEFT JOIN funcionarios aprobador ON u.funcionario_id = aprobador.id
       LEFT JOIN usuarios preap_usr ON sol.pre_aprobado_por = preap_usr.id
       LEFT JOIN funcionarios preap_func ON preap_usr.funcionario_id = preap_func.id
       WHERE ${whereClause}
       ORDER BY sol.fecha_solicitud DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    const total = await pool.query(
      `SELECT COUNT(*) FROM solicitudes sol
       JOIN funcionarios f ON sol.funcionario_id = f.id
       WHERE ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({ solicitudes: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

router.post('/', [
  body('funcionario_id').isInt(),
  body('tipo_permiso_id').isInt(),
  body('fecha_inicio').isDate(),
  body('fecha_fin').isDate(),
  body('dias_solicitados').isFloat({ min: 0.5 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin, dias_solicitados, motivo, jornada_medio_dia } = req.body;

  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != funcionario_id) {
    return res.status(403).json({ error: 'Solo puedes solicitar permisos para ti mismo' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar que el funcionario esté activo
    const funcActivo = await client.query(
      `SELECT activo FROM funcionarios WHERE id = $1`, [funcionario_id]
    );
    if (!funcActivo.rows[0]?.activo) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'El funcionario está inactivo y no puede solicitar permisos' });
    }

    const anio = new Date(fecha_inicio).getFullYear();

    // Verificar tipo de permiso
    const tipoResult = await client.query(
      `SELECT * FROM tipos_permisos WHERE id = $1`,
      [tipo_permiso_id]
    );
    const tipo = tipoResult.rows[0];
    const esFeriadoLegal  = tipo?.es_feriado_legal  === true;
    const esEspecial      = tipo?.es_especial       === true;
    const jornadaForzada  = tipo?.jornada_forzada   || null;

    // Tipos con jornada forzada (ej: ESTAMENTO) solo permiten media jornada
    if (jornadaForzada && dias_solicitados !== 0.5) {
      await client.query('ROLLBACK');
      const label = jornadaForzada === 'PM' ? 'media jornada PM (13:00 hrs)' : 'media jornada AM';
      return res.status(400).json({
        error: `Este tipo de permiso solo puede solicitarse como ${label} según normativa institucional`,
      });
    }
    // Forzar jornada_medio_dia en backend si el tipo lo exige
    const jornadaMedioDiaFinal = jornadaForzada || jornada_medio_dia || null;

    // ── Lógica permiso especial (sin saldo, fecha_fin calculada en backend) ──
    if (esEspecial) {
      const diasFijos  = tipo.dias_fijos;
      const tipoDias   = tipo.tipo_dias;
      const fechaFinCalc = calcularFechaFinEspecial(fecha_inicio, diasFijos, tipoDias);

      const solapaEsp = await verificarSolapamiento(client, funcionario_id, fecha_inicio, fechaFinCalc);
      if (solapaEsp) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Las fechas se solapan con una solicitud existente' });
      }

      const nuevaSolicitud = await client.query(
        `INSERT INTO solicitudes
           (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
            dias_solicitados, dias_arrastre, dias_periodo_actual, motivo)
         VALUES ($1,$2,$3,$4,$5,0,0,$6) RETURNING *`,
        [funcionario_id, tipo_permiso_id, fecha_inicio, fechaFinCalc, diasFijos, motivo]
      );

      await registrarMovimiento(client, {
        funcionarioId: funcionario_id, solicitudId: nuevaSolicitud.rows[0].id,
        tipoPermisoId: tipo_permiso_id, tipoMovimiento: 'reserva',
        diasMovimiento: diasFijos, saldoAnterior: 0, saldoNuevo: 0,
        descripcion: `Permiso especial: ${tipo.nombre} — ${diasFijos} día(s) ${tipoDias} (sin descuento de saldo)`,
        usuarioId: req.usuario.id,
      });

      await client.query('COMMIT');
      return res.status(201).json({
        ...nuevaSolicitud.rows[0],
        es_especial: true,
        tipo_especial: tipo.tipo_especial,
        tipo_nombre: tipo.nombre,
      });
    }

    // Verificar solapamiento de fechas (aplica a tipos normales y feriado legal)
    const solapa = await verificarSolapamiento(client, funcionario_id, fecha_inicio, fecha_fin);
    if (solapa) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Las fechas se solapan con una solicitud existente' });
    }

    const saldo = await client.query(
      `SELECT * FROM saldos_funcionarios
       WHERE funcionario_id = $1 AND tipo_permiso_id = $2 AND anio = $3
       FOR UPDATE`,
      [funcionario_id, tipo_permiso_id, anio]
    );

    if (saldo.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No tiene saldo asignado para este tipo de permiso' });
    }

    const s = saldo.rows[0];

    if (esFeriadoLegal) {
      // ── Lógica feriado legal ──────────────────────────────────────────────
      const arrastreDisponible = (s.saldo_arrastre || 0) - (s.arrastre_usados || 0) - (s.arrastre_pendientes || 0);
      const actualDisponible = s.dias_asignados - s.dias_usados - s.dias_pendientes;
      const totalDisponible = arrastreDisponible + actualDisponible;

      if (totalDisponible < dias_solicitados) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Saldo insuficiente. Disponible: ${totalDisponible} días (${arrastreDisponible} arrastre + ${actualDisponible} período actual), solicitados: ${dias_solicitados}`,
          dias_disponibles: totalDisponible,
          arrastre_disponible: arrastreDisponible,
          actual_disponible: actualDisponible,
        });
      }

      // Calcular distribución: arrastre primero obligatoriamente
      const { fromArrastre, fromActual } = calcularDistribucion(
        dias_solicitados, arrastreDisponible, actualDisponible
      );

      // ── Regla de parcialización ───────────────────────────────────────────
      // Si la solicitud toma días del período actual Y son menos de 10 (parcial),
      // validar que no supere el tope: dias_asignados - 10
      if (fromActual > 0 && fromActual < 10) {
        const maxParciales = Math.max(s.dias_asignados - 10, 0);
        const parcialesRes = await client.query(
          `SELECT COALESCE(SUM(dias_periodo_actual), 0) AS total
           FROM solicitudes
           WHERE funcionario_id = $1
             AND tipo_permiso_id = $2
             AND EXTRACT(YEAR FROM fecha_inicio) = $3
             AND estado IN ('aprobado','pendiente')
             AND dias_periodo_actual > 0
             AND dias_periodo_actual < 10`,
          [funcionario_id, tipo_permiso_id, anio]
        );
        const parcialesExistentes = parseInt(parcialesRes.rows[0].total) || 0;

        if (parcialesExistentes + fromActual > maxParciales) {
          await client.query('ROLLBACK');
          const disponibles = Math.max(maxParciales - parcialesExistentes, 0);
          return res.status(400).json({
            error: `Solo puede parcializar ${maxParciales} día(s) del período actual (${s.dias_asignados} días − 10 del bloque obligatorio). Ya lleva ${parcialesExistentes} día(s) parcializados y quedan ${disponibles} disponibles para parcializar.`,
            max_parciales: maxParciales,
            parciales_usados: parcialesExistentes,
            parciales_disponibles: disponibles,
          });
        }
      }

      // Reservar días en saldo (una sola reserva total, se divida o no en 2 solicitudes)
      await client.query(
        `UPDATE saldos_funcionarios
         SET arrastre_pendientes = arrastre_pendientes + $1,
             dias_pendientes     = dias_pendientes     + $2,
             updated_at = NOW()
         WHERE id = $3`,
        [fromArrastre, fromActual, s.id]
      );

      const saldoAnteriorDisponible = totalDisponible;

      // Regla institucional: si la solicitud mezcla días de arrastre y de
      // período actual, el arrastre debe solicitarse primero — se generan
      // DOS solicitudes independientes (una 100% arrastre, otra 100%
      // período actual) en vez de una sola con desglose interno, para que
      // cada tramo quede como su propio trámite/folio administrativo.
      if (fromArrastre > 0 && fromActual > 0) {
        const fechaFinArrastre = fechaEnesimoDiaHabil(fecha_inicio, fromArrastre);
        const fechaInicioActual = (() => {
          const d = siguienteDiaHabil(new Date(`${fechaFinArrastre}T12:00:00`));
          return d.toISOString().split('T')[0];
        })();

        const solArrastre = await client.query(
          `INSERT INTO solicitudes
             (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
              dias_solicitados, dias_arrastre, dias_periodo_actual, motivo, jornada_medio_dia)
           VALUES ($1, $2, $3, $4, $5, $5, 0, $6, $7) RETURNING *`,
          [funcionario_id, tipo_permiso_id, fecha_inicio, fechaFinArrastre, fromArrastre, motivo, jornadaMedioDiaFinal]
        );
        const solActual = await client.query(
          `INSERT INTO solicitudes
             (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
              dias_solicitados, dias_arrastre, dias_periodo_actual, motivo, jornada_medio_dia)
           VALUES ($1, $2, $3, $4, $5, 0, $5, $6, $7) RETURNING *`,
          [funcionario_id, tipo_permiso_id, fechaInicioActual, fecha_fin, fromActual, motivo, jornadaMedioDiaFinal]
        );

        await registrarMovimiento(client, {
          funcionarioId: funcionario_id, solicitudId: solArrastre.rows[0].id,
          tipoPermisoId: tipo_permiso_id, tipoMovimiento: 'reserva',
          diasMovimiento: fromArrastre,
          saldoAnterior: saldoAnteriorDisponible,
          saldoNuevo: saldoAnteriorDisponible - fromArrastre,
          descripcion: `Solicitud feriado legal (arrastre): ${fromArrastre} día(s) del período anterior en trámite`,
          usuarioId: req.usuario.id,
        });
        await registrarMovimiento(client, {
          funcionarioId: funcionario_id, solicitudId: solActual.rows[0].id,
          tipoPermisoId: tipo_permiso_id, tipoMovimiento: 'reserva',
          diasMovimiento: fromActual,
          saldoAnterior: saldoAnteriorDisponible - fromArrastre,
          saldoNuevo: saldoAnteriorDisponible - fromArrastre - fromActual,
          descripcion: `Solicitud feriado legal (período actual): ${fromActual} día(s) en trámite`,
          usuarioId: req.usuario.id,
        });

        await client.query('COMMIT');
        return res.status(201).json({
          dividida: true,
          solicitud_arrastre: solArrastre.rows[0],
          solicitud_actual: solActual.rows[0],
          distribucion: { fromArrastre, fromActual },
        });
      }

      // Insertar solicitud con desglose (caso normal: todo arrastre o todo período actual)
      const nuevaSolicitud = await client.query(
        `INSERT INTO solicitudes
           (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
            dias_solicitados, dias_arrastre, dias_periodo_actual, motivo, jornada_medio_dia)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
         dias_solicitados, fromArrastre, fromActual, motivo, jornadaMedioDiaFinal]
      );

      await registrarMovimiento(client, {
        funcionarioId: funcionario_id, solicitudId: nuevaSolicitud.rows[0].id,
        tipoPermisoId: tipo_permiso_id, tipoMovimiento: 'reserva',
        diasMovimiento: dias_solicitados,
        saldoAnterior: saldoAnteriorDisponible,
        saldoNuevo: saldoAnteriorDisponible - dias_solicitados,
        descripcion: `Solicitud feriado legal: ${fromArrastre} día(s) arrastre + ${fromActual} día(s) período actual en trámite`,
        usuarioId: req.usuario.id,
      });

      await client.query('COMMIT');
      return res.status(201).json({
        ...nuevaSolicitud.rows[0],
        distribucion: { fromArrastre, fromActual },
      });
    }

    // ── Lógica permiso normal ─────────────────────────────────────────────
    const { dias_asignados, dias_usados, dias_pendientes } = s;
    const diasDisponibles = dias_asignados - dias_usados - dias_pendientes;

    if (diasDisponibles < dias_solicitados) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Saldo insuficiente. Disponibles: ${diasDisponibles} días, solicitados: ${dias_solicitados} días`,
        dias_disponibles: diasDisponibles,
      });
    }

    await client.query(
      `UPDATE saldos_funcionarios
       SET dias_pendientes = dias_pendientes + $1, updated_at = NOW()
       WHERE id = $2`,
      [dias_solicitados, s.id]
    );

    const nuevaSolicitud = await client.query(
      `INSERT INTO solicitudes
         (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
          dias_solicitados, dias_arrastre, dias_periodo_actual, motivo, jornada_medio_dia)
       VALUES ($1, $2, $3, $4, $5, 0, $5, $6, $7) RETURNING *`,
      [funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin, dias_solicitados, motivo, jornadaMedioDiaFinal]
    );

    await registrarMovimiento(client, {
      funcionarioId: funcionario_id, solicitudId: nuevaSolicitud.rows[0].id,
      tipoPermisoId: tipo_permiso_id, tipoMovimiento: 'reserva',
      diasMovimiento: dias_solicitados,
      saldoAnterior: diasDisponibles,
      saldoNuevo: diasDisponibles - dias_solicitados,
      descripcion: `Solicitud de permiso registrada — ${dias_solicitados} día(s) en trámite`,
      usuarioId: req.usuario.id,
    });

    await client.query('COMMIT');
    res.status(201).json(nuevaSolicitud.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al registrar solicitud' });
  } finally {
    client.release();
  }
});

// PRE-APROBAR solicitud (Supervisor de sector → estado pre_aprobado)
router.patch('/:id/pre-aprobar', adminOSupervisor, async (req, res) => {
  if (req.usuario.rol === 'admin') {
    return res.status(400).json({ error: 'El administrador debe usar la aprobación final, no la pre-aprobación' });
  }
  const { id } = req.params;
  const { observaciones } = req.body;

  try {
    const check = await pool.query(
      `SELECT sol.id, sol.funcionario_id, f.sector, f.area
       FROM solicitudes sol
       JOIN funcionarios f ON sol.funcionario_id = f.id
       WHERE sol.id = $1 AND sol.estado = 'pendiente'`,
      [id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }

    const solCheck = check.rows[0];

    if (noAutoAprobacion(solCheck.funcionario_id, req)) {
      return res.status(403).json({ error: 'No puede pre-aprobar su propia solicitud. Será aprobada directamente por el Administrador.' });
    }

    // Scope efectivo: si el usuario está subrogando a un supervisor titular vigente,
    // se usa el sector/área del titular en vez del propio.
    const scope = req.usuario.scopeEfectivo || { sector: req.usuario.sector, area: req.usuario.area };
    if (scope.sector && solCheck.sector !== scope.sector) {
      return res.status(403).json({ error: 'No puede pre-aprobar solicitudes de otro sector' });
    }
    if (!scope.sector && scope.area && solCheck.area !== scope.area) {
      return res.status(403).json({ error: 'No puede pre-aprobar solicitudes de otra área' });
    }

    await pool.query(
      `UPDATE solicitudes
       SET estado = 'pre_aprobado',
           pre_aprobado_por = $1,
           fecha_pre_aprobacion = NOW(),
           observaciones_supervisor = $2
       WHERE id = $3`,
      [req.usuario.id, observaciones || null, id]
    );

    res.json({ mensaje: 'Solicitud pre-aprobada. Pendiente de aprobación final del administrador.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al pre-aprobar solicitud' });
  }
});

// APROBAR solicitud final — RRHH_ADMIN (o admin legacy), transacción atómica completa
router.patch('/:id/aprobar', requierePermiso('solicitudes.aprobar'), async (req, res) => {
  const { id } = req.params;
  const { observaciones } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const solicitud = await client.query(
      `SELECT sol.*, tp.nombre AS tipo_nombre, tp.es_feriado_legal, tp.es_especial
       FROM solicitudes sol
       JOIN tipos_permisos tp ON sol.tipo_permiso_id = tp.id
       WHERE sol.id = $1 AND sol.estado IN ('pendiente', 'pre_aprobado')
       FOR UPDATE`,
      [id]
    );

    if (solicitud.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }

    const sol = solicitud.rows[0];

    // Anticonflicto de interés: nadie puede aprobar su propia solicitud, sin importar el rol.
    if (noAutoAprobacion(sol.funcionario_id, req)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puede aprobar su propia solicitud' });
    }

    // ── Aprobar permiso especial (sin movimiento de saldo) ────────────────
    if (sol.es_especial) {
      await actualizarEstadoSolicitud(client, id, 'aprobado', req.usuario.id, observaciones);
      await registrarMovimiento(client, {
        funcionarioId: sol.funcionario_id, solicitudId: id,
        tipoPermisoId: sol.tipo_permiso_id, tipoMovimiento: 'descuento',
        diasMovimiento: sol.dias_solicitados, saldoAnterior: 0, saldoNuevo: 0,
        descripcion: `Permiso especial aprobado: ${sol.tipo_nombre} del ${sol.fecha_inicio} al ${sol.fecha_fin}`,
        usuarioId: req.usuario.id,
      });
      await client.query('COMMIT');
      return res.json({ mensaje: 'Solicitud aprobada correctamente' });
    }

    const anio = new Date(sol.fecha_inicio).getFullYear();

    const saldo = await client.query(
      `SELECT * FROM saldos_funcionarios
       WHERE funcionario_id = $1 AND tipo_permiso_id = $2 AND anio = $3
       FOR UPDATE`,
      [sol.funcionario_id, sol.tipo_permiso_id, anio]
    );

    const s = saldo.rows[0];
    const diasArrastre = sol.dias_arrastre || 0;
    // OJO: no usar `||` acá — dias_periodo_actual=0 es un valor legítimo
    // (solicitud 100% arrastre) y `0 || x` cae igual al fallback, duplicando
    // el descuento/reintegro contra el período actual.
    const diasActual = sol.dias_periodo_actual != null ? sol.dias_periodo_actual : sol.dias_solicitados;

    if (sol.es_feriado_legal) {
      // ── Aprobar feriado legal ─────────────────────────────────────────────
      // Reconstituir saldo total antes de que se creara la solicitud (para el historial)
      const arrastreAntes = (s.saldo_arrastre || 0) - (s.arrastre_usados || 0) - (s.arrastre_pendientes || 0) + diasArrastre;
      const actualAntes   = s.dias_asignados - s.dias_usados - s.dias_pendientes + diasActual;
      const totalAntes    = arrastreAntes + actualAntes;

      await client.query(
        `UPDATE saldos_funcionarios
         SET arrastre_usados   = arrastre_usados   + $1,
             arrastre_pendientes = GREATEST(arrastre_pendientes - $1, 0),
             dias_usados       = dias_usados       + $2,
             dias_pendientes   = GREATEST(dias_pendientes - $2, 0),
             updated_at = NOW()
         WHERE id = $3`,
        [diasArrastre, diasActual, s.id]
      );

      // Calcular y actualizar estado del bloque obligatorio de 10 días
      const bloqueInfo = await validarBloqueObligatorio10Dias(
        client, sol.funcionario_id, sol.tipo_permiso_id, anio
      );
      await client.query(
        `UPDATE saldos_funcionarios
         SET bloque_10_dias_cumplido = $1,
             fecha_inicio_bloque     = $2,
             fecha_fin_bloque        = $3
         WHERE id = $4`,
        [
          bloqueInfo.cumplido,
          bloqueInfo.fecha_inicio_bloque || null,
          bloqueInfo.fecha_fin_bloque || null,
          s.id,
        ]
      );

      await actualizarEstadoSolicitud(client, id, 'aprobado', req.usuario.id, observaciones);

      const saldoNuevo = totalAntes - sol.dias_solicitados;
      await registrarMovimiento(client, {
        funcionarioId: sol.funcionario_id, solicitudId: id,
        tipoPermisoId: sol.tipo_permiso_id, tipoMovimiento: 'descuento',
        diasMovimiento: sol.dias_solicitados, saldoAnterior: totalAntes, saldoNuevo,
        descripcion: `Feriado legal aprobado: ${sol.tipo_nombre} del ${sol.fecha_inicio} al ${sol.fecha_fin} (${diasArrastre} arrastre + ${diasActual} período actual)`,
        usuarioId: req.usuario.id,
      });

      await client.query('COMMIT');
      return res.json({
        mensaje: 'Solicitud aprobada correctamente',
        saldo_nuevo: saldoNuevo,
        bloque_cumplido: bloqueInfo.cumplido,
        bloque_max_dias: bloqueInfo.bloque_max,
      });
    }

    // ── Aprobar permiso normal ────────────────────────────────────────────
    const saldoAnteriorDisponible = s.dias_asignados - s.dias_usados - s.dias_pendientes;
    const saldoNuevo = s.dias_asignados - (s.dias_usados + sol.dias_solicitados);

    await client.query(
      `UPDATE saldos_funcionarios
       SET dias_usados     = dias_usados     + $1,
           dias_pendientes = GREATEST(dias_pendientes - $1, 0),
           updated_at = NOW()
       WHERE id = $2`,
      [sol.dias_solicitados, s.id]
    );

    await actualizarEstadoSolicitud(client, id, 'aprobado', req.usuario.id, observaciones);
    await registrarMovimiento(client, {
      funcionarioId: sol.funcionario_id, solicitudId: id,
      tipoPermisoId: sol.tipo_permiso_id, tipoMovimiento: 'descuento',
      diasMovimiento: sol.dias_solicitados, saldoAnterior: saldoAnteriorDisponible, saldoNuevo,
      descripcion: `Permiso aprobado: ${sol.tipo_nombre} del ${sol.fecha_inicio} al ${sol.fecha_fin}`,
      usuarioId: req.usuario.id,
    });

    await client.query('COMMIT');
    res.json({ mensaje: 'Solicitud aprobada correctamente', saldo_nuevo: saldoNuevo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al aprobar solicitud' });
  } finally {
    client.release();
  }
});

// RECHAZAR solicitud — libera los días pendientes
router.patch('/:id/rechazar', adminOSupervisor, async (req, res) => {
  const { id } = req.params;
  const { observaciones } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const solicitud = await client.query(
      `SELECT sol.*, tp.es_feriado_legal, tp.es_especial, tp.nombre AS tipo_nombre, f.sector
       FROM solicitudes sol
       JOIN tipos_permisos tp ON sol.tipo_permiso_id = tp.id
       JOIN funcionarios f ON sol.funcionario_id = f.id
       WHERE sol.id = $1 AND sol.estado IN ('pendiente', 'pre_aprobado') FOR UPDATE`,
      [id]
    );

    if (solicitud.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }

    const sol = solicitud.rows[0];

    // Supervisor no puede rechazar su propia solicitud
    if (req.usuario.rol === 'supervisor' && req.usuario.funcionario_id && sol.funcionario_id == req.usuario.funcionario_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puede rechazar su propia solicitud. Solo el Administrador puede hacerlo.' });
    }

    // Supervisor solo puede rechazar de su sector
    if (req.usuario.rol === 'supervisor' && req.usuario.sector && sol.sector !== req.usuario.sector && !tieneVisibilidadGlobal(req)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puede rechazar solicitudes de otro sector' });
    }

    // ── Rechazar permiso especial (sin movimiento de saldo) ───────────────
    if (sol.es_especial) {
      await actualizarEstadoSolicitud(client, id, 'rechazado', req.usuario.id, observaciones);
      await registrarMovimiento(client, {
        funcionarioId: sol.funcionario_id, solicitudId: id,
        tipoPermisoId: sol.tipo_permiso_id, tipoMovimiento: 'reintegro',
        diasMovimiento: sol.dias_solicitados, saldoAnterior: 0, saldoNuevo: 0,
        descripcion: `Permiso especial rechazado: ${sol.tipo_nombre}`,
        usuarioId: req.usuario.id,
      });
      await client.query('COMMIT');
      return res.json({ mensaje: 'Solicitud rechazada' });
    }

    const anio = new Date(sol.fecha_inicio).getFullYear();
    const diasArrastre = sol.dias_arrastre || 0;
    // OJO: no usar `||` acá — dias_periodo_actual=0 es un valor legítimo
    // (solicitud 100% arrastre) y `0 || x` cae igual al fallback, duplicando
    // el descuento/reintegro contra el período actual.
    const diasActual = sol.dias_periodo_actual != null ? sol.dias_periodo_actual : sol.dias_solicitados;

    const saldo = await client.query(
      `SELECT * FROM saldos_funcionarios
       WHERE funcionario_id = $1 AND tipo_permiso_id = $2 AND anio = $3 FOR UPDATE`,
      [sol.funcionario_id, sol.tipo_permiso_id, anio]
    );

    const s = saldo.rows[0];

    if (sol.es_feriado_legal) {
      // ── Rechazar feriado legal ────────────────────────────────────────────
      const arrastreAntes = (s.saldo_arrastre || 0) - (s.arrastre_usados || 0) - (s.arrastre_pendientes || 0);
      const actualAntes   = s.dias_asignados - s.dias_usados - s.dias_pendientes;
      const totalAntes    = arrastreAntes + actualAntes;

      await client.query(
        `UPDATE saldos_funcionarios
         SET arrastre_pendientes = GREATEST(arrastre_pendientes - $1, 0),
             dias_pendientes     = GREATEST(dias_pendientes     - $2, 0),
             updated_at = NOW()
         WHERE id = $3`,
        [diasArrastre, diasActual, s.id]
      );

      await actualizarEstadoSolicitud(client, id, 'rechazado', req.usuario.id, observaciones);
      await registrarMovimiento(client, {
        funcionarioId: sol.funcionario_id, solicitudId: id,
        tipoPermisoId: sol.tipo_permiso_id, tipoMovimiento: 'reintegro',
        diasMovimiento: sol.dias_solicitados,
        saldoAnterior: totalAntes, saldoNuevo: totalAntes + sol.dias_solicitados,
        descripcion: `Solicitud rechazada — ${diasArrastre} día(s) arrastre + ${diasActual} día(s) período actual reintegrados`,
        usuarioId: req.usuario.id,
      });

      await client.query('COMMIT');
      return res.json({
        mensaje: 'Solicitud rechazada y días reintegrados',
        saldo_nuevo: totalAntes + sol.dias_solicitados,
      });
    }

    // ── Rechazar permiso normal ───────────────────────────────────────────
    const saldoAnteriorDisponible = s.dias_asignados - s.dias_usados - s.dias_pendientes;
    const saldoNuevo = saldoAnteriorDisponible + sol.dias_solicitados;

    await client.query(
      `UPDATE saldos_funcionarios
       SET dias_pendientes = GREATEST(dias_pendientes - $1, 0), updated_at = NOW()
       WHERE id = $2`,
      [sol.dias_solicitados, s.id]
    );

    await actualizarEstadoSolicitud(client, id, 'rechazado', req.usuario.id, observaciones);
    await registrarMovimiento(client, {
      funcionarioId: sol.funcionario_id, solicitudId: id,
      tipoPermisoId: sol.tipo_permiso_id, tipoMovimiento: 'reintegro',
      diasMovimiento: sol.dias_solicitados,
      saldoAnterior: saldoAnteriorDisponible, saldoNuevo,
      descripcion: `Solicitud rechazada — ${sol.dias_solicitados} día(s) reintegrados al saldo`,
      usuarioId: req.usuario.id,
    });

    await client.query('COMMIT');
    res.json({ mensaje: 'Solicitud rechazada y días reintegrados', saldo_nuevo: saldoNuevo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al rechazar solicitud' });
  } finally {
    client.release();
  }
});

// REINTEGRAR días — admin cancela una solicitud aprobada y devuelve los días
router.patch('/:id/reintegrar', requierePermiso('solicitudes.reintegrar'), async (req, res) => {
  const { id } = req.params;
  const { observaciones } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const solicitud = await client.query(
      `SELECT sol.*, tp.es_feriado_legal, tp.es_especial, tp.nombre AS tipo_nombre
       FROM solicitudes sol
       JOIN tipos_permisos tp ON sol.tipo_permiso_id = tp.id
       WHERE sol.id = $1 AND sol.estado = 'aprobado'
       FOR UPDATE`,
      [id]
    );

    if (solicitud.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada o no está aprobada' });
    }

    const sol = solicitud.rows[0];

    // ── Reintegrar permiso especial (sin movimiento de saldo) ────────────
    if (sol.es_especial) {
      await registrarMovimiento(client, {
        funcionarioId: sol.funcionario_id, solicitudId: id,
        tipoPermisoId: sol.tipo_permiso_id, tipoMovimiento: 'reintegro',
        diasMovimiento: sol.dias_solicitados, saldoAnterior: 0, saldoNuevo: 0,
        descripcion: `Reintegro manual (especial): ${sol.tipo_nombre} del ${sol.fecha_inicio} al ${sol.fecha_fin}${observaciones ? ' — ' + observaciones : ''}`,
        usuarioId: req.usuario.id,
      });
      await actualizarEstadoSolicitud(client, id, 'cancelado', req.usuario.id, observaciones || 'Reintegro manual por administrador');
      await client.query('COMMIT');
      return res.json({ mensaje: 'Solicitud cancelada correctamente' });
    }

    const anio = new Date(sol.fecha_inicio).getFullYear();
    const diasArrastre = parseFloat(sol.dias_arrastre) || 0;
    // Mismo cuidado que en /aprobar y /rechazar: dias_periodo_actual=0 es
    // legítimo (solicitud 100% arrastre), no debe caer al fallback.
    const diasActual = sol.dias_periodo_actual != null ? parseFloat(sol.dias_periodo_actual) : parseFloat(sol.dias_solicitados);

    const saldo = await client.query(
      `SELECT * FROM saldos_funcionarios
       WHERE funcionario_id = $1 AND tipo_permiso_id = $2 AND anio = $3
       FOR UPDATE`,
      [sol.funcionario_id, sol.tipo_permiso_id, anio]
    );

    if (!saldo.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Saldo no encontrado' });
    }

    const s = saldo.rows[0];

    if (sol.es_feriado_legal) {
      const saldoAntes = (parseFloat(s.saldo_arrastre) - parseFloat(s.arrastre_usados) - parseFloat(s.arrastre_pendientes))
                       + (parseFloat(s.dias_asignados) - parseFloat(s.dias_usados) - parseFloat(s.dias_pendientes));
      await client.query(
        `UPDATE saldos_funcionarios
         SET arrastre_usados = GREATEST(arrastre_usados - $1, 0),
             dias_usados     = GREATEST(dias_usados - $2, 0),
             updated_at = NOW()
         WHERE id = $3`,
        [diasArrastre, diasActual, s.id]
      );
      await registrarMovimiento(client, {
        funcionarioId: sol.funcionario_id, solicitudId: id,
        tipoPermisoId: sol.tipo_permiso_id, tipoMovimiento: 'reintegro',
        diasMovimiento: sol.dias_solicitados,
        saldoAnterior: saldoAntes, saldoNuevo: saldoAntes + parseFloat(sol.dias_solicitados),
        descripcion: `Reintegro manual: ${sol.tipo_nombre} del ${sol.fecha_inicio} al ${sol.fecha_fin}${observaciones ? ' — ' + observaciones : ''}`,
        usuarioId: req.usuario.id,
      });
    } else {
      const saldoAntes = parseFloat(s.dias_asignados) - parseFloat(s.dias_usados) - parseFloat(s.dias_pendientes);
      await client.query(
        `UPDATE saldos_funcionarios
         SET dias_usados = GREATEST(dias_usados - $1, 0),
             updated_at = NOW()
         WHERE id = $2`,
        [sol.dias_solicitados, s.id]
      );
      await registrarMovimiento(client, {
        funcionarioId: sol.funcionario_id, solicitudId: id,
        tipoPermisoId: sol.tipo_permiso_id, tipoMovimiento: 'reintegro',
        diasMovimiento: sol.dias_solicitados,
        saldoAnterior: saldoAntes, saldoNuevo: saldoAntes + parseFloat(sol.dias_solicitados),
        descripcion: `Reintegro manual: ${sol.tipo_nombre} del ${sol.fecha_inicio} al ${sol.fecha_fin}${observaciones ? ' — ' + observaciones : ''}`,
        usuarioId: req.usuario.id,
      });
    }

    await actualizarEstadoSolicitud(client, id, 'cancelado', req.usuario.id, observaciones || 'Reintegro manual por administrador');

    await client.query('COMMIT');
    res.json({ mensaje: 'Días reintegrados correctamente al saldo del funcionario' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al reintegrar días' });
  } finally {
    client.release();
  }
});

module.exports = router;
