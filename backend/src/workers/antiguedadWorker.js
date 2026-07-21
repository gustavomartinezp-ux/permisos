'use strict';

const { pool } = require('../db');
const {
  TRAMOS_ANTIGUEDAD, DIAS_POR_TRAMO,
  fechaCumplimientoTramo, diferenciaDias, soloFecha,
} = require('../utils/antiguedad');

// Ventana de anticipación: el hito (=alerta) se crea apenas la fecha de
// cumplimiento entra dentro de estos días, mucho antes de aplicarse.
const DIAS_ANTICIPACION_ALERTA = 30;

// Recorre funcionarios activos, crea el hito/alerta en cuanto entra en la
// ventana de anticipación, y aplica el bono de +5 días exactamente una vez
// por tramo (15/20 años) el día en que corresponde o después (si el servidor
// estuvo dormido ese día, lo aplica en la próxima corrida — no se pierde).
async function evaluarHitosAntiguedad() {
  const hoy = new Date();
  const { rows: funcionarios } = await pool.query(
    `SELECT id, fecha_ingreso FROM funcionarios WHERE activo = true AND fecha_ingreso IS NOT NULL`
  );

  let alertasCreadas = 0;
  let hitosAplicados = 0;

  for (const f of funcionarios) {
    for (const tramo of TRAMOS_ANTIGUEDAD) {
      const fechaHito = fechaCumplimientoTramo(f.fecha_ingreso, tramo);
      const diasHastaHito = diferenciaDias(hoy, fechaHito); // negativo si ya pasó

      if (diasHastaHito > DIAS_ANTICIPACION_ALERTA) continue; // todavía muy lejos

      const insertado = await pool.query(
        `INSERT INTO hitos_antiguedad (funcionario_id, tramo_anios, fecha_cumplimiento, dias_agregados)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (funcionario_id, tramo_anios) DO NOTHING
         RETURNING id`,
        [f.id, tramo, soloFecha(fechaHito), DIAS_POR_TRAMO]
      );
      if (insertado.rows.length > 0) alertasCreadas++;

      if (diasHastaHito <= 0) {
        const aplicado = await aplicarHitoSiCorresponde(f.id, tramo, fechaHito);
        if (aplicado) hitosAplicados++;
      }
    }
  }

  return { alertasCreadas, hitosAplicados };
}

// Suma los +5 días al saldo de feriado legal VIGENTE (el año actual, no el
// año histórico del hito — un hito de hace 6 años no tiene fila de saldo en
// ese año pasado; lo que importa es el saldo que la persona puede usar HOY).
// Atómico e idempotente: el UPDATE aplicado=TRUE dentro de la misma
// transacción evita que una segunda corrida lo vuelva a sumar.
async function aplicarHitoSiCorresponde(funcionarioId, tramoAnios, fechaHito) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hito = await client.query(
      `SELECT id, aplicado, dias_agregados FROM hitos_antiguedad
       WHERE funcionario_id = $1 AND tramo_anios = $2 FOR UPDATE`,
      [funcionarioId, tramoAnios]
    );
    if (hito.rows.length === 0 || hito.rows[0].aplicado) {
      await client.query('ROLLBACK');
      return false;
    }

    const anio = new Date().getFullYear();
    const saldo = await client.query(
      `SELECT sf.id, sf.tipo_permiso_id, sf.dias_asignados, sf.dias_usados, sf.dias_pendientes
       FROM saldos_funcionarios sf
       JOIN tipos_permisos tp ON tp.id = sf.tipo_permiso_id
       WHERE sf.funcionario_id = $1 AND tp.es_feriado_legal = TRUE AND sf.anio = $2
       FOR UPDATE`,
      [funcionarioId, anio]
    );

    const dias = hito.rows[0].dias_agregados;

    if (saldo.rows.length === 0) {
      // Sin saldo de feriado legal creado para ese año — se marca aplicado
      // igual para no reintentarlo en cada corrida; si hace falta, se
      // reconcilia con un ajuste manual de saldo una vez exista el registro.
      await client.query(`UPDATE hitos_antiguedad SET aplicado = TRUE, aplicado_en = NOW() WHERE id = $1`, [hito.rows[0].id]);
      await client.query('COMMIT');
      return true;
    }

    const s = saldo.rows[0];
    const nuevoAsignado = s.dias_asignados + dias; // suma incondicional, sin importar lo acumulado
    const saldoAnterior = s.dias_asignados - s.dias_usados - s.dias_pendientes;
    const saldoNuevo = nuevoAsignado - s.dias_usados - s.dias_pendientes;

    await client.query(
      `UPDATE saldos_funcionarios SET dias_asignados = $1, updated_at = NOW() WHERE id = $2`,
      [nuevoAsignado, s.id]
    );
    await client.query(
      `INSERT INTO historial_movimientos
         (funcionario_id, tipo_permiso_id, tipo_movimiento, dias_movimiento, saldo_anterior, saldo_nuevo, descripcion, usuario_responsable)
       VALUES ($1, $2, 'asignacion', $3, $4, $5, $6, NULL)`,
      [funcionarioId, s.tipo_permiso_id, dias, saldoAnterior, saldoNuevo,
        `Bono de antigüedad: +${dias} días de feriado legal al cumplir ${tramoAnios} años de servicio`]
    );
    await client.query(
      `UPDATE hitos_antiguedad SET aplicado = TRUE, aplicado_en = NOW() WHERE id = $1`,
      [hito.rows[0].id]
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[antiguedad] error aplicando hito', funcionarioId, tramoAnios, err.message);
    return false;
  } finally {
    client.release();
  }
}

module.exports = { evaluarHitosAntiguedad, DIAS_ANTICIPACION_ALERTA };
