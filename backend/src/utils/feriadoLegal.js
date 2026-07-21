'use strict';

// Feriados nacionales Chile (se pueden ampliar anualmente)
// Actualizar anualmente: agregar el año siguiente antes de que comience.
// Jun: solsticio de invierno (varía ±1 día). Verificar con https://www.feriados.cl
const FERIADOS_CHILE = new Set([
  // 2025
  '2025-01-01','2025-04-18','2025-04-19','2025-05-01','2025-05-21',
  '2025-06-20','2025-06-29','2025-07-16','2025-08-15','2025-09-18',
  '2025-09-19','2025-10-12','2025-10-31','2025-11-01','2025-12-08','2025-12-25',
  // 2026
  '2026-01-01','2026-04-03','2026-04-04','2026-05-01','2026-05-21',
  '2026-06-19','2026-06-29','2026-07-16','2026-08-15','2026-09-18',
  '2026-09-19','2026-10-12','2026-10-31','2026-11-01','2026-12-08','2026-12-25',
  // 2027 — Semana Santa: Viernes Santo 26-mar, Sábado Santo 27-mar (Pascua 28-mar)
  '2027-01-01','2027-03-26','2027-03-27','2027-05-01','2027-05-21',
  '2027-06-21','2027-06-29','2027-07-16','2027-08-15','2027-09-18',
  '2027-09-19','2027-10-12','2027-10-31','2027-11-01','2027-12-08','2027-12-25',
]);

function toISO(fecha) {
  const d = new Date(fecha);
  return d.toISOString().split('T')[0];
}

function esDiaHabil(fecha) {
  const d = new Date(fecha);
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !FERIADOS_CHILE.has(toISO(fecha));
}

function siguienteDiaHabil(fecha) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + 1);
  while (!esDiaHabil(d)) d.setDate(d.getDate() + 1);
  return d;
}

function calcularDiasHabiles(inicio, fin) {
  const start = new Date(inicio);
  const end = new Date(fin);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (esDiaHabil(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Retorna la fecha (ISO) del n-ésimo día hábil contando desde `inicio`
// (inclusive). Se usa para partir en dos un rango de fechas cuando una
// solicitud de feriado legal mezcla días de arrastre y de período actual —
// cada tramo necesita su propia fecha_inicio/fecha_fin real, no solo un
// conteo de días.
function fechaEnesimoDiaHabil(inicio, n) {
  let cur = new Date(`${toISO(inicio)}T12:00:00`);
  if (!esDiaHabil(cur)) cur = siguienteDiaHabil(new Date(cur.getTime() - 86400000));
  let count = 1;
  while (count < n) {
    cur = siguienteDiaHabil(cur);
    count++;
  }
  return toISO(cur);
}

// Arrastre primero obligatoriamente
function calcularDistribucion(diasSolicitados, arrastreDisponible, actualDisponible) {
  const fromArrastre = Math.min(diasSolicitados, arrastreDisponible);
  const fromActual = diasSolicitados - fromArrastre;
  return { fromArrastre, fromActual };
}

// Días hábiles tomados del período actual (solicitudes aprobadas o pendientes)
async function obtenerDiasHabilesActuales(client, funcionarioId, tipoPermisoId, anio, excludeId = null) {
  let query = `
    SELECT fecha_inicio, fecha_fin
    FROM solicitudes
    WHERE funcionario_id = $1
      AND tipo_permiso_id = $2
      AND EXTRACT(YEAR FROM fecha_inicio) = $3
      AND estado IN ('aprobado','pendiente')
      AND dias_periodo_actual > 0
  `;
  const params = [funcionarioId, tipoPermisoId, parseInt(anio)];
  if (excludeId) { query += ` AND id != $4`; params.push(excludeId); }
  query += ' ORDER BY fecha_inicio';

  const result = await client.query(query, params);
  const dias = [];
  for (const sol of result.rows) {
    const cur = new Date(sol.fecha_inicio);
    const end = new Date(sol.fecha_fin);
    while (cur <= end) {
      if (esDiaHabil(cur)) dias.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  dias.sort((a, b) => a - b);
  return dias.filter((d, i) => i === 0 || d.getTime() !== dias[i - 1].getTime());
}

function encontrarMaxBloqueConsecutivo(diasHabiles) {
  if (!diasHabiles.length) return { max: 0, inicio: null, fin: null };

  let max = 1, actual = 1;
  let bloqueInicio = diasHabiles[0];
  let maxInicio = diasHabiles[0], maxFin = diasHabiles[0];

  for (let i = 1; i < diasHabiles.length; i++) {
    const sig = siguienteDiaHabil(diasHabiles[i - 1]);
    if (sig.getTime() === diasHabiles[i].getTime()) {
      actual++;
      if (actual > max) {
        max = actual;
        maxInicio = bloqueInicio;
        maxFin = diasHabiles[i];
      }
    } else {
      actual = 1;
      bloqueInicio = diasHabiles[i];
    }
  }

  return {
    max,
    inicio: maxInicio ? toISO(maxInicio) : null,
    fin: maxFin ? toISO(maxFin) : null,
  };
}

async function validarBloqueObligatorio10Dias(client, funcionarioId, tipoPermisoId, anio) {
  const dias = await obtenerDiasHabilesActuales(client, funcionarioId, tipoPermisoId, anio);
  const { max, inicio, fin } = encontrarMaxBloqueConsecutivo(dias);
  return {
    cumplido: max >= 10,
    bloque_max: max,
    fecha_inicio_bloque: inicio,
    fecha_fin_bloque: fin,
  };
}

async function verificarSolapamiento(client, funcionarioId, fechaInicio, fechaFin, excludeId = null) {
  let query = `
    SELECT id FROM solicitudes
    WHERE funcionario_id = $1
      AND estado NOT IN ('rechazado', 'cancelado')
      AND fecha_inicio <= $3
      AND fecha_fin >= $2
  `;
  const params = [funcionarioId, fechaInicio, fechaFin];
  if (excludeId) { query += ` AND id != $4`; params.push(excludeId); }
  const result = await client.query(query, params);
  return result.rows.length > 0;
}

// Reglas fijas por código de tipo especial
const REGLAS_ESPECIALES = {
  ESP_FALLECIMIENTO_HIJO: { dias_fijos: 10, tipo_dias: 'corridos',          normativa: 'Art. 108 bis Ley 18.883', requiere_certificado: true },
  ESP_HIJO_GESTACION:     { dias_fijos: 7,  tipo_dias: 'habiles',            normativa: 'Art. 108 bis Ley 18.883', requiere_certificado: true },
  ESP_CONYUGE:            { dias_fijos: 7,  tipo_dias: 'corridos',          normativa: 'Art. 108 bis Ley 18.883', requiere_certificado: true },
  ESP_FAMILIAR_DIRECTO:   { dias_fijos: 4,  tipo_dias: 'habiles',            normativa: 'Art. 108 Ley 18.883',    requiere_certificado: true },
  ESP_NACIMIENTO:         { dias_fijos: 5,  tipo_dias: 'habiles',            normativa: 'Art. 195 Código del Trabajo', requiere_certificado: false },
  ESP_MATRIMONIO:         { dias_fijos: 5,  tipo_dias: 'habiles_continuos', normativa: 'Art. 207 bis Código del Trabajo', requiere_certificado: false },
};

// Calcula fecha_fin para un permiso especial de días fijos
function calcularFechaFinEspecial(fechaInicio, diasFijos, tipoDias) {
  const start = new Date(fechaInicio + 'T12:00:00');
  if (tipoDias === 'corridos') {
    const end = new Date(start);
    end.setDate(end.getDate() + diasFijos - 1);
    return end.toISOString().split('T')[0];
  }
  // habiles / habiles_continuos: contar días hábiles avanzando
  let count = 0;
  const cur = new Date(start);
  while (count < diasFijos) {
    if (esDiaHabil(cur)) count++;
    if (count < diasFijos) cur.setDate(cur.getDate() + 1);
  }
  return cur.toISOString().split('T')[0];
}

module.exports = {
  FERIADOS_CHILE,
  esDiaHabil,
  siguienteDiaHabil,
  calcularDiasHabiles,
  fechaEnesimoDiaHabil,
  calcularDistribucion,
  calcularFechaFinEspecial,
  validarBloqueObligatorio10Dias,
  verificarSolapamiento,
  REGLAS_ESPECIALES,
};
