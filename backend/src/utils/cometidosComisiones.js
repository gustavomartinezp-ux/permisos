'use strict';

// Límite legal: máximo 3 meses (90 días) en Comisión de Servicio por año
// calendario (Ley 19.378 / 18.883). Solo cuenta días corridos de solicitudes
// ya aprobadas (jefatura o dirección) — una comisión rechazada o pendiente
// no consume el límite todavía.
const LIMITE_DIAS_COMISION_ANUAL = 90;

const diasCorridos = (fechaInicio, fechaFin) => {
  const MS_DIA = 1000 * 60 * 60 * 24;
  const a = new Date(`${fechaInicio}T12:00:00`);
  const b = new Date(`${fechaFin}T12:00:00`);
  return Math.round((b - a) / MS_DIA) + 1;
};

// `client` puede ser el pool o un cliente de transacción (FOR UPDATE la usa
// el llamador si necesita bloquear antes de aprobar).
async function diasComisionAcumulados(client, funcionarioId, anio, excludeId = null) {
  const params = [funcionarioId, anio];
  let query = `
    SELECT COALESCE(SUM(dias), 0) AS total
    FROM cometidos_comisiones
    WHERE funcionario_id = $1
      AND tipo = 'comision'
      AND estado IN ('aprobado_jefatura', 'aprobado_direccion')
      AND EXTRACT(YEAR FROM fecha_inicio) = $2
  `;
  if (excludeId) {
    params.push(excludeId);
    query += ` AND id != $${params.length}`;
  }
  const { rows } = await client.query(query, params);
  return parseInt(rows[0].total, 10);
}

// Valida que aprobar esta solicitud no haga superar el límite anual. Se usa
// tanto al crear (feedback temprano) como — de forma obligatoria — en cada
// paso de aprobación, que es donde de verdad hay que impedirlo.
async function validarLimiteComision(client, { funcionarioId, anio, diasSolicitud, excludeId = null }) {
  const acumulados = await diasComisionAcumulados(client, funcionarioId, anio, excludeId);
  const total = acumulados + diasSolicitud;
  const diasDisponibles = Math.max(LIMITE_DIAS_COMISION_ANUAL - acumulados, 0);
  if (total > LIMITE_DIAS_COMISION_ANUAL) {
    return {
      valido: false,
      dias_acumulados: acumulados,
      dias_disponibles: diasDisponibles,
      error: `El funcionario ya acumula ${acumulados} día(s) en Comisiones de Servicio aprobadas durante ${anio}. ` +
        `Esta solicitud (${diasSolicitud} día(s)) superaría el límite legal de ${LIMITE_DIAS_COMISION_ANUAL} días ` +
        `(3 meses) por año calendario. Disponibles: ${diasDisponibles} día(s).`,
    };
  }
  return { valido: true, dias_acumulados: acumulados, dias_disponibles: diasDisponibles - diasSolicitud };
}

module.exports = {
  LIMITE_DIAS_COMISION_ANUAL,
  diasCorridos,
  diasComisionAcumulados,
  validarLimiteComision,
};
