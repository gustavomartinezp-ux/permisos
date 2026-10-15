// Días hábiles y feriados (espejo de backend/src/utils/feriadoLegal.js).
// Compartido por la ventana de solicitud y la de edición de solicitudes.

// Feriados Chile 2025-2027 (espejo del backend para preview instantáneo)
export const FERIADOS = new Set([
  '2025-01-01','2025-04-18','2025-04-19','2025-05-01','2025-05-21',
  '2025-06-20','2025-06-29','2025-07-16','2025-08-15','2025-09-18',
  '2025-09-19','2025-10-12','2025-10-31','2025-11-01','2025-12-08','2025-12-25',
  '2026-01-01','2026-04-03','2026-04-04','2026-05-01','2026-05-21',
  '2026-06-19','2026-06-29','2026-07-16','2026-08-15','2026-09-18',
  '2026-09-19','2026-10-12','2026-10-31','2026-11-01','2026-12-08','2026-12-25',
  '2027-01-01','2027-03-26','2027-03-27','2027-05-01','2027-05-21',
  '2027-06-21','2027-06-29','2027-07-16','2027-08-15','2027-09-18',
  '2027-09-19','2027-10-12','2027-10-31','2027-11-01','2027-12-08','2027-12-25',
]);

export function toISO(d) { return d.toISOString().split('T')[0]; }

export function esDiaHabil(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !FERIADOS.has(toISO(d));
}

// Dispositivo (establecimiento) con régimen de turnos 24/7: único exceptuado
// de la regla de "solo día hábil" para Permiso Administrativo y Feriado
// Legal. Es `funcionario.dispositivo` (nombre del establecimiento), no
// `funcionario.sector` — ese campo está vacío para todos los funcionarios.
export const DISPOSITIVO_EXCEPCION_DIA_HABIL = /\bSAR\b/i;

export function tipoRequiereDiaHabil(saldo) {
  return saldo?.codigo === 'ADMIN' || saldo?.es_feriado_legal === true;
}

// Espejo de validarSolicitudPermiso del backend, para feedback instantáneo
// antes de enviar la solicitud.
// Arma el rango de un permiso a partir de la fecha de inicio y el número de
// días: cuenta solo días hábiles (salta fines de semana y feriados) y, si la
// fecha elegida no es hábil, el permiso comienza el siguiente día hábil.
// En SAR (turnos 24/7) los días se cuentan corridos.
export function construirRango(inicio, numDias, corridos) {
  if (!inicio || !(numDias > 0)) return null;
  const cur = new Date(inicio + 'T12:00:00');
  if (isNaN(cur)) return null;
  const dias = [];
  let guard = 0;
  while (dias.length < numDias && guard++ < 730) {
    if (corridos || esDiaHabil(cur)) dias.push(toISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return { inicio: dias[0], fin: dias[dias.length - 1], dias };
}

export const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
export const formatoFecha = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${['dom','lun','mar','mié','jue','vie','sáb'][d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
};

