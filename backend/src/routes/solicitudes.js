const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { errorPermisoEstamento, esPermisoEstamento } = require('../utils/estamento');
const { cargarPermisos, requierePermiso, noAutoAprobacion, esSoloAutoservicio, tieneVisibilidadGlobal, alcanceSupervisor, filtroAlcance, puedeActuarPorFuncionario } = require('../middleware/rbac');
const {
  calcularDiasHabiles,
  calcularDistribucion,
  calcularFechaFinEspecial,
  validarBloqueObligatorio10Dias,
  verificarSolapamiento,
  fechaEnesimoDiaHabil,
  siguienteDiaHabil,
  validarSolicitudPermiso,
  diasDelRango,
  bloqueObligatorioTomado,
  errorParcializacion,
} = require('../utils/feriadoLegal');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

// Los días a descontar los determina el rango de fechas (hábiles; corridos en
// SAR), no lo que envíe el cliente. Medio día (0,5) va en una sola fecha; en
// los tipos que admiten medio día (Administrativo, Jornadas) también se puede
// pedir N,5 días: el primer o el último día del rango es media jornada AM o PM.
// Devuelve el mensaje de error, o null si los días cuadran con las fechas.
function errorDiasSolicitud(funcionario, tipo, inicio, fin, dias, jornada) {
  const n = Number(dias);
  if (n === 0.5) return String(inicio) === String(fin) ? null : 'Medio día debe solicitarse en una sola fecha';
  const delRango = diasDelRango(funcionario, tipo, inicio, fin);
  if (n % 1 === 0) {
    return delRango === n ? null : `El rango ${inicio} al ${fin} corresponde a ${delRango} día(s), no a ${n}`;
  }
  if (n % 1 !== 0.5 || !tipo.permite_medio_dia) return `${tipo.nombre} solo puede solicitarse por días completos`;
  if (jornada !== 'AM' && jornada !== 'PM') return 'Indica si el medio día es jornada AM o PM';
  return delRango - 0.5 === n ? null
    : `El rango ${inicio} al ${fin} tiene ${delRango} día(s): con uno en media jornada son ${delRango - 0.5}, no ${n}`;
}

// En N,5 días (N ≥ 1), ¿el medio día es el primer día del rango? (si no, el último)
const medioDiaAlInicio = (dias, valor) => Number(dias) > 1 && Number(dias) % 1 !== 0 && (valor === true || valor === 'true');

// La jornada AM/PM solo se guarda cuando la solicitud incluye un medio día
const jornadaDeSolicitud = (dias, jornada) => (Number(dias) % 1 !== 0 ? (jornada || null) : null);

// Saldo del período imputado (antes → después) para el formato oficial.
async function guardarSaldoPeriodo(client, solicitudId, disponibleAntes, dias) {
  const r = await client.query(
    `UPDATE solicitudes SET saldo_periodo_antes = $1, saldo_periodo_despues = $2
     WHERE id = $3 RETURNING *`,
    [disponibleAntes, Math.max(disponibleAntes - dias, 0), solicitudId]
  );
  return r.rows[0];
}

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
      // Supervisor (o subrogante) solo ve su sector o su área
      const cond = filtroAlcance(alcanceSupervisor(req), params);
      if (cond) { whereClause += ` AND ${cond}`; paramIdx = params.length + 1; }
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
         f.tipo_contrato, f.horas_contrato, d.nombre AS dispositivo,
         f.escalafon, f.tipo_contrato_2, f.horas_contrato_2,
         f.fecha_ingreso, f.convenio_honorarios, f.prestacion,
         s.nombre AS servicio,
         -- Datos del formato oficial, según el movimiento de reserva de esta
         -- solicitud: saldo disponible antes ("Nº TOTAL DÍAS") y después
         -- ("SALDO PENDIENTE"), para reimprimirlo idéntico días después.
         -- En feriado se usa el saldo del período imputado (arrastre o actual)
         -- si está registrado; si no, el total del movimiento.
         COALESCE(sol.saldo_periodo_antes, mov.saldo_anterior)  AS saldo_total_formulario,
         COALESCE(sol.saldo_periodo_despues, mov.saldo_nuevo)   AS saldo_pendiente_formulario,
         tp.nombre AS tipo_nombre, tp.codigo AS tipo_codigo, tp.color,
         tp.es_feriado_legal, tp.es_especial, tp.tipo_especial,
         aprobador.nombres AS aprobador_nombres,
         aprobador.apellidos AS aprobador_apellidos,
         preap_func.nombres AS preaprobador_nombres,
         preap_func.apellidos AS preaprobador_apellidos
       FROM solicitudes sol
       JOIN funcionarios f ON sol.funcionario_id = f.id
       LEFT JOIN servicios s ON f.servicio_id = s.id
       LEFT JOIN dispositivos d ON f.dispositivo_id = d.id
       LEFT JOIN LATERAL (
         SELECT hm.saldo_anterior, hm.saldo_nuevo
         FROM historial_movimientos hm
         WHERE hm.solicitud_id = sol.id AND hm.tipo_permiso_id = sol.tipo_permiso_id
           AND (hm.tipo_movimiento = 'reserva'
                OR (hm.tipo_movimiento = 'descuento' AND hm.descripcion LIKE 'Corrección de solicitud%'))
         ORDER BY hm.id DESC
         LIMIT 1
       ) mov ON TRUE
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
  // Quien cubre las funciones durante la ausencia (campo del formato oficial DAS)
  const reemplazante = String(req.body.reemplazante || '').trim().slice(0, 150) || null;

  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != funcionario_id) {
    return res.status(403).json({ error: 'Solo puedes solicitar permisos para ti mismo' });
  }
  if (!(await puedeActuarPorFuncionario(req, funcionario_id))) {
    return res.status(403).json({ error: 'Solo puede ingresar a nombre de funcionarios de su sector o área' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar que el funcionario esté activo
    const funcResult = await client.query(
      `SELECT f.activo, f.sector, d.nombre AS dispositivo,
              f.escalafon, f.tipo_contrato, f.tipo_contrato_2, f.horas_contrato, f.horas_contrato_2
       FROM funcionarios f
       LEFT JOIN dispositivos d ON f.dispositivo_id = d.id
       WHERE f.id = $1`, [funcionario_id]
    );
    if (!funcResult.rows[0]?.activo) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'El funcionario está inactivo y no puede solicitar permisos' });
    }
    const funcionario = funcResult.rows[0];

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

    // Regla general: Permiso Administrativo y Feriado Legal solo en días
    // hábiles, salvo sector SAR (turnos 24/7) — ver validarSolicitudPermiso.
    const validacionDiaHabil = validarSolicitudPermiso(funcionario, tipo, fecha_inicio, fecha_fin);
    if (!validacionDiaHabil.valido) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: validacionDiaHabil.error,
        dias_no_habiles: validacionDiaHabil.dias_no_habiles,
      });
    }

    // Tipos con jornada forzada (ej: ESTAMENTO) solo permiten media jornada
    if (jornadaForzada && dias_solicitados !== 0.5) {
      await client.query('ROLLBACK');
      const label = jornadaForzada === 'PM' ? 'media jornada PM (13:00 hrs)' : 'media jornada AM';
      return res.status(400).json({
        error: `Este tipo de permiso solo puede solicitarse como ${label} según normativa institucional`,
      });
    }
    if (esPermisoEstamento(tipo)) {
      const errorEstamento = errorPermisoEstamento(funcionario, fecha_inicio);
      if (errorEstamento) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: errorEstamento });
      }
    }
    // Forzar jornada_medio_dia en backend si el tipo lo exige
    const jornadaMedioDiaFinal = jornadaForzada || jornadaDeSolicitud(dias_solicitados, jornada_medio_dia);

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
            dias_solicitados, dias_arrastre, dias_periodo_actual, motivo, reemplazante)
         VALUES ($1,$2,$3,$4,$5,0,0,$6,$7) RETURNING *`,
        [funcionario_id, tipo_permiso_id, fecha_inicio, fechaFinCalc, diasFijos, motivo, reemplazante]
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

    // Los días a descontar los determina el rango de fechas (hábiles; corridos
    // en SAR), no lo que envíe el cliente: así el saldo nunca se descuadra.
    const errorDias = errorDiasSolicitud(funcionario, tipo, fecha_inicio, fecha_fin, dias_solicitados, jornadaMedioDiaFinal);
    if (errorDias) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: errorDias });
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
      const arrastreDisponible = Math.max((s.saldo_arrastre || 0) - (s.arrastre_usados || 0) - (s.arrastre_pendientes || 0), 0);
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

      // ── Bloque obligatorio de 10 días (solo período actual) ───────────────
      if (fromActual > 0 && fromActual < 10) {
        const bloqueo = errorParcializacion({
          actualDisponible, fromActual, anio,
          bloqueTomado: await bloqueObligatorioTomado(client, s),
        });
        if (bloqueo) {
          await client.query('ROLLBACK');
          return res.status(400).json(bloqueo);
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
              dias_solicitados, dias_arrastre, dias_periodo_actual, motivo, jornada_medio_dia, reemplazante)
           VALUES ($1, $2, $3, $4, $5, $5, 0, $6, $7, $8) RETURNING *`,
          [funcionario_id, tipo_permiso_id, fecha_inicio, fechaFinArrastre, fromArrastre, motivo, jornadaMedioDiaFinal, reemplazante]
        );
        const solActual = await client.query(
          `INSERT INTO solicitudes
             (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
              dias_solicitados, dias_arrastre, dias_periodo_actual, motivo, jornada_medio_dia, reemplazante)
           VALUES ($1, $2, $3, $4, $5, 0, $5, $6, $7, $8) RETURNING *`,
          [funcionario_id, tipo_permiso_id, fechaInicioActual, fecha_fin, fromActual, motivo, jornadaMedioDiaFinal, reemplazante]
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

        const arrConSaldo = await guardarSaldoPeriodo(client, solArrastre.rows[0].id, arrastreDisponible, fromArrastre);
        const actConSaldo = await guardarSaldoPeriodo(client, solActual.rows[0].id, actualDisponible, fromActual);

        await client.query('COMMIT');
        return res.status(201).json({
          dividida: true,
          solicitud_arrastre: arrConSaldo,
          solicitud_actual: actConSaldo,
          distribucion: { fromArrastre, fromActual },
        });
      }

      // Insertar solicitud con desglose (caso normal: todo arrastre o todo período actual)
      const nuevaSolicitud = await client.query(
        `INSERT INTO solicitudes
           (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
            dias_solicitados, dias_arrastre, dias_periodo_actual, motivo, jornada_medio_dia, reemplazante)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
         dias_solicitados, fromArrastre, fromActual, motivo, jornadaMedioDiaFinal, reemplazante]
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

      const conSaldo = fromActual > 0
        ? await guardarSaldoPeriodo(client, nuevaSolicitud.rows[0].id, actualDisponible, fromActual)
        : await guardarSaldoPeriodo(client, nuevaSolicitud.rows[0].id, arrastreDisponible, fromArrastre);

      await client.query('COMMIT');
      return res.status(201).json({
        ...conSaldo,
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
          dias_solicitados, dias_arrastre, dias_periodo_actual, motivo, jornada_medio_dia, reemplazante, medio_dia_inicio)
       VALUES ($1, $2, $3, $4, $5, 0, $5, $6, $7, $8, $9) RETURNING *`,
      [funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin, dias_solicitados, motivo, jornadaMedioDiaFinal, reemplazante,
       medioDiaAlInicio(dias_solicitados, req.body.medio_dia_inicio)]
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
router.patch('/:id/pre-aprobar', requierePermiso('solicitudes.pre_aprobar'), async (req, res) => {
  if (req.usuario.rol === 'admin') {
    return res.status(400).json({ error: 'El administrador debe usar la aprobación final, no la pre-aprobación' });
  }
  const { id } = req.params;
  const { observaciones } = req.body;

  try {
    const check = await pool.query(
      `SELECT sol.id, sol.funcionario_id, f.sector, f.sector_2, f.area
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
    // se usa el sector/área del titular en vez del propio. Cuentas con visibilidad
    // global (admin, ADMIN_TI/RRHH_ADMIN/AUDITOR vía RBAC) no se acotan a su sector.
    if (!tieneVisibilidadGlobal(req)) {
      const scope = req.usuario.scopeEfectivo || { sector: req.usuario.sector, area: req.usuario.area };
      if (scope.sector && solCheck.sector !== scope.sector && solCheck.sector_2 !== scope.sector) {
        return res.status(403).json({ error: 'No puede pre-aprobar solicitudes de otro sector' });
      }
      if (!scope.sector && scope.area && solCheck.area !== scope.area) {
        return res.status(403).json({ error: 'No puede pre-aprobar solicitudes de otra área' });
      }
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
router.patch('/:id/rechazar', requierePermiso('solicitudes.pre_aprobar', 'solicitudes.aprobar'), async (req, res) => {
  const { id } = req.params;
  const { observaciones } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const solicitud = await client.query(
      `SELECT sol.*, tp.es_feriado_legal, tp.es_especial, tp.nombre AS tipo_nombre, f.sector, f.sector_2, f.area
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

    // Anticonflicto de interés: nadie puede rechazar su propia solicitud, sin importar el rol
    // (mismo criterio que /aprobar).
    if (noAutoAprobacion(sol.funcionario_id, req)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puede rechazar su propia solicitud' });
    }

    // Fuera de visibilidad global, solo puede rechazar solicitudes de su propio sector/área.
    if (!tieneVisibilidadGlobal(req)) {
      const scope = req.usuario.scopeEfectivo || { sector: req.usuario.sector, area: req.usuario.area };
      if (scope.sector && sol.sector !== scope.sector && sol.sector_2 !== scope.sector) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No puede rechazar solicitudes de otro sector' });
      }
      if (!scope.sector && scope.area && sol.area !== scope.area) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No puede rechazar solicitudes de otra área' });
      }
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

// EDITAR solicitud — corrige tipo, fechas, días, jornada, motivo o reemplazante
// de una solicitud pendiente, pre-aprobada o aprobada (ej. se ingresó como
// Feriado Legal y era Permiso Administrativo). En una sola transacción:
//   1) devuelve los días al saldo del tipo/año original (pendientes o usados
//      según el estado),
//   2) valida el nuevo rango con las mismas reglas que al crear (día hábil,
//      días = hábiles del rango, sin solapes, saldo suficiente),
//   3) descuenta del saldo del tipo/año nuevo manteniendo el mismo estado.
// Los permisos especiales (sin saldo) no se editan: se rechazan y se crean de nuevo.
router.patch('/:id/editar', requierePermiso('solicitudes.aprobar'), async (req, res) => {
  const { id } = req.params;
  const {
    tipo_permiso_id, fecha_inicio, fecha_fin, dias_solicitados,
    jornada_medio_dia, motivo, motivo_cambio,
  } = req.body;
  const reemplazante = String(req.body.reemplazante || '').trim().slice(0, 150) || null;

  if (!motivo_cambio || !String(motivo_cambio).trim()) {
    return res.status(400).json({ error: 'Indica el motivo de la corrección' });
  }
  if (!tipo_permiso_id || !fecha_inicio || !fecha_fin || !(Number(dias_solicitados) > 0)) {
    return res.status(400).json({ error: 'Faltan el tipo, las fechas o los días' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const actual = await client.query(
      `SELECT sol.*, tp.nombre AS tipo_nombre, tp.es_especial, tp.es_feriado_legal,
              d.nombre AS dispositivo,
              f.escalafon, f.tipo_contrato, f.tipo_contrato_2, f.horas_contrato, f.horas_contrato_2
       FROM solicitudes sol
       JOIN tipos_permisos tp ON tp.id = sol.tipo_permiso_id
       JOIN funcionarios f ON f.id = sol.funcionario_id
       LEFT JOIN dispositivos d ON d.id = f.dispositivo_id
       WHERE sol.id = $1 AND sol.estado IN ('pendiente', 'pre_aprobado', 'aprobado')
       FOR UPDATE OF sol`,
      [id]
    );
    if (actual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada o ya rechazada/cancelada' });
    }
    const sol = actual.rows[0];

    if (noAutoAprobacion(sol.funcionario_id, req)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puede editar su propia solicitud' });
    }

    const tipoNuevo = (await client.query('SELECT * FROM tipos_permisos WHERE id = $1', [tipo_permiso_id])).rows[0];
    if (sol.es_especial || !tipoNuevo || tipoNuevo.es_especial || !tipoNuevo.activo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Solo se pueden editar permisos con saldo (no especiales). Para un permiso especial, recházalo y crea uno nuevo.' });
    }

    // ── Validaciones del nuevo rango (mismas reglas que al crear) ──────────
    const funcionario = { dispositivo: sol.dispositivo };
    const validacion = validarSolicitudPermiso(funcionario, tipoNuevo, fecha_inicio, fecha_fin);
    if (!validacion.valido) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: validacion.error });
    }
    const jornadaFinal = tipoNuevo.jornada_forzada || jornadaDeSolicitud(dias_solicitados, jornada_medio_dia);
    if (tipoNuevo.jornada_forzada && Number(dias_solicitados) !== 0.5) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `${tipoNuevo.nombre} solo puede ser media jornada ${tipoNuevo.jornada_forzada}` });
    }
    if (esPermisoEstamento(tipoNuevo)) {
      const errorEstamento = errorPermisoEstamento(sol, fecha_inicio);
      if (errorEstamento) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: errorEstamento });
      }
    }
    const errorDias = errorDiasSolicitud(funcionario, tipoNuevo, fecha_inicio, fecha_fin, dias_solicitados, jornadaFinal);
    if (errorDias) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: errorDias });
    }
    if (await verificarSolapamiento(client, sol.funcionario_id, fecha_inicio, fecha_fin, id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Las nuevas fechas se solapan con otra solicitud del funcionario' });
    }

    const aprobada = sol.estado === 'aprobado';
    const diasViejos = Number(sol.dias_solicitados);
    const arrViejo = Number(sol.dias_arrastre) || 0;
    const actViejo = sol.dias_periodo_actual != null ? Number(sol.dias_periodo_actual) : diasViejos;
    const anioViejo = new Date(sol.fecha_inicio).getFullYear();
    const anioNuevo = new Date(`${fecha_inicio}T12:00:00`).getFullYear();

    // Bloquea ambos saldos en orden de id para evitar interbloqueos
    const saldos = (await client.query(
      `SELECT * FROM saldos_funcionarios
       WHERE funcionario_id = $1 AND ((tipo_permiso_id = $2 AND anio = $3) OR (tipo_permiso_id = $4 AND anio = $5))
       ORDER BY id FOR UPDATE`,
      [sol.funcionario_id, sol.tipo_permiso_id, anioViejo, tipo_permiso_id, anioNuevo]
    )).rows;
    const sViejo = saldos.find((s) => s.tipo_permiso_id === sol.tipo_permiso_id && s.anio === anioViejo);
    if (!saldos.find((s) => s.tipo_permiso_id === Number(tipo_permiso_id) && s.anio === anioNuevo)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `El funcionario no tiene saldo de ${tipoNuevo.nombre} para ${anioNuevo}` });
    }
    const disponible = (s) => (s.dias_asignados - s.dias_usados - s.dias_pendientes)
      + Math.max(s.saldo_arrastre - s.arrastre_usados - s.arrastre_pendientes, 0);

    // 1) Devolver los días de la solicitud original
    if (sViejo) {
      const antes = disponible(sViejo);
      await client.query(
        aprobada
          ? `UPDATE saldos_funcionarios SET arrastre_usados = GREATEST(arrastre_usados - $1, 0),
               dias_usados = GREATEST(dias_usados - $2, 0), updated_at = NOW() WHERE id = $3`
          : `UPDATE saldos_funcionarios SET arrastre_pendientes = GREATEST(arrastre_pendientes - $1, 0),
               dias_pendientes = GREATEST(dias_pendientes - $2, 0), updated_at = NOW() WHERE id = $3`,
        [arrViejo, actViejo, sViejo.id]
      );
      await registrarMovimiento(client, {
        funcionarioId: sol.funcionario_id, solicitudId: id, tipoPermisoId: sol.tipo_permiso_id,
        tipoMovimiento: 'reintegro', diasMovimiento: diasViejos,
        saldoAnterior: antes, saldoNuevo: antes + diasViejos,
        descripcion: `Corrección de solicitud N° ${id}: se devuelven ${diasViejos} día(s) de ${sol.tipo_nombre} — ${motivo_cambio}`,
        usuarioId: req.usuario.id,
      });
    }

    // 2) Descontar del saldo nuevo (ya con la devolución aplicada)
    const sNuevo = (await client.query(
      'SELECT * FROM saldos_funcionarios WHERE funcionario_id = $1 AND tipo_permiso_id = $2 AND anio = $3',
      [sol.funcionario_id, tipo_permiso_id, anioNuevo]
    )).rows[0];
    const diasNuevos = Number(dias_solicitados);
    const arrDisp = tipoNuevo.es_feriado_legal
      ? Math.max(sNuevo.saldo_arrastre - sNuevo.arrastre_usados - sNuevo.arrastre_pendientes, 0) : 0;
    const actDisp = sNuevo.dias_asignados - sNuevo.dias_usados - sNuevo.dias_pendientes;
    if (arrDisp + actDisp < diasNuevos) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Saldo insuficiente de ${tipoNuevo.nombre}: disponibles ${arrDisp + actDisp}, solicitados ${diasNuevos}` });
    }
    const { fromArrastre, fromActual } = tipoNuevo.es_feriado_legal
      ? calcularDistribucion(diasNuevos, arrDisp, actDisp)
      : { fromArrastre: 0, fromActual: diasNuevos };
    if (tipoNuevo.es_feriado_legal && fromActual > 0 && fromActual < 10) {
      const bloqueo = errorParcializacion({
        actualDisponible: actDisp, fromActual, anio: anioNuevo,
        bloqueTomado: await bloqueObligatorioTomado(client, sNuevo, Number(id)),
      });
      if (bloqueo) {
        await client.query('ROLLBACK');
        return res.status(400).json(bloqueo);
      }
    }
    await client.query(
      aprobada
        ? `UPDATE saldos_funcionarios SET arrastre_usados = arrastre_usados + $1,
             dias_usados = dias_usados + $2, updated_at = NOW() WHERE id = $3`
        : `UPDATE saldos_funcionarios SET arrastre_pendientes = arrastre_pendientes + $1,
             dias_pendientes = dias_pendientes + $2, updated_at = NOW() WHERE id = $3`,
      [fromArrastre, fromActual, sNuevo.id]
    );
    const antesNuevo = arrDisp + actDisp;
    // 'reserva' para pendientes y 'descuento' para aprobadas; el saldo antes/después
    // de este movimiento es el que imprime el formato oficial de la solicitud.
    await registrarMovimiento(client, {
      funcionarioId: sol.funcionario_id, solicitudId: id, tipoPermisoId: Number(tipo_permiso_id),
      tipoMovimiento: aprobada ? 'descuento' : 'reserva', diasMovimiento: diasNuevos,
      saldoAnterior: antesNuevo, saldoNuevo: antesNuevo - diasNuevos,
      descripcion: `Corrección de solicitud N° ${id}: ${diasNuevos} día(s) de ${tipoNuevo.nombre} del ${fecha_inicio} al ${fecha_fin} — ${motivo_cambio}`,
      usuarioId: req.usuario.id,
    });

    // 3) Actualizar la solicitud
    const cambio = `[${new Date().toLocaleDateString('es-CL')}] Corregida: ${sol.tipo_nombre} ${diasViejos} día(s) del `
      + `${String(sol.fecha_inicio).substring(0, 10)} → ${tipoNuevo.nombre} ${diasNuevos} día(s) del ${fecha_inicio}. Motivo: ${motivo_cambio}`;
    await client.query(
      `UPDATE solicitudes
       SET tipo_permiso_id = $1, fecha_inicio = $2, fecha_fin = $3, dias_solicitados = $4,
           dias_arrastre = $5, dias_periodo_actual = $6, jornada_medio_dia = $7,
           motivo = $8, reemplazante = $9,
           observaciones = CONCAT_WS(' | ', NULLIF(observaciones, ''), $10::text),
           saldo_periodo_antes = $12, saldo_periodo_despues = $13,
           medio_dia_inicio = $14
       WHERE id = $11`,
      [tipo_permiso_id, fecha_inicio, fecha_fin, diasNuevos, fromArrastre, fromActual, jornadaFinal,
       motivo ?? sol.motivo, reemplazante, cambio, id,
       // Feriado de un solo período: saldo de ese período; mixto u otro tipo: total
       !tipoNuevo.es_feriado_legal || (fromArrastre > 0 && fromActual > 0) ? null : (fromActual > 0 ? actDisp : arrDisp),
       !tipoNuevo.es_feriado_legal || (fromArrastre > 0 && fromActual > 0) ? null
         : Math.max((fromActual > 0 ? actDisp - fromActual : arrDisp - fromArrastre), 0),
       medioDiaAlInicio(diasNuevos, req.body.medio_dia_inicio)]
    );

    // Bloque obligatorio de 10 días de feriado (si una aprobada entra o sale de feriado)
    if (aprobada) {
      for (const s of [sViejo, sNuevo]) {
        if (!s) continue;
        const tp = s.tipo_permiso_id === Number(tipo_permiso_id) ? tipoNuevo : { es_feriado_legal: sol.es_feriado_legal };
        if (!tp.es_feriado_legal) continue;
        const b = await validarBloqueObligatorio10Dias(client, sol.funcionario_id, s.tipo_permiso_id, s.anio);
        await client.query(
          `UPDATE saldos_funcionarios SET bloque_10_dias_cumplido = $1, fecha_inicio_bloque = $2, fecha_fin_bloque = $3 WHERE id = $4`,
          [b.cumplido, b.fecha_inicio_bloque || null, b.fecha_fin_bloque || null, s.id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ mensaje: 'Solicitud corregida y saldos actualizados', saldo_nuevo: antesNuevo - diasNuevos });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al editar la solicitud' });
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
