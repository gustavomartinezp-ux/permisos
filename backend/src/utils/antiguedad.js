'use strict';

// Regla institucional de feriado legal por antigüedad:
//   < 15 años  -> 15 días (ya es el default de tipos_permisos.dias_anuales_max)
//   >= 15 y <20 -> 20 días (15 base + 5 al cumplir el tramo)
//   >= 20 años -> 25 días (20 + 5 al cumplir el segundo tramo)
const TRAMOS_ANTIGUEDAD = [15, 20];
const DIAS_POR_TRAMO = 5;

// node-postgres entrega columnas `date` como objetos Date (cuyo .toString()
// NO es ISO, ej. "Fri Apr 19 2004..."); si ya viene como string (ej. desde
// JSON) se usa tal cual. toISOString() siempre produce "YYYY-MM-DDTHH:mm:ss".
const soloFecha = (fecha) => (fecha instanceof Date ? fecha.toISOString() : fecha.toString()).substring(0, 10);

// Construye la fecha a mediodía para evitar corrimientos de día por huso horario.
const aFechaMediodia = (fechaISO) => new Date(`${soloFecha(fechaISO)}T12:00:00`);

// Años de servicio cumplidos a la fecha `hasta` (por defecto, hoy).
function aniosServicio(fechaIngreso, hasta = new Date()) {
  const ingreso = aFechaMediodia(fechaIngreso);
  const referencia = new Date(hasta);
  let anios = referencia.getFullYear() - ingreso.getFullYear();
  const aniversarioEsteAnio = new Date(referencia.getFullYear(), ingreso.getMonth(), ingreso.getDate());
  if (referencia < aniversarioEsteAnio) anios -= 1;
  return anios;
}

// Fecha exacta en la que se cumple un tramo de antigüedad (ej. 15 años desde el ingreso).
function fechaCumplimientoTramo(fechaIngreso, tramoAnios) {
  const ingreso = aFechaMediodia(fechaIngreso);
  const fecha = new Date(ingreso);
  fecha.setFullYear(ingreso.getFullYear() + tramoAnios);
  return fecha;
}

function diasFeriadoPorAntiguedad(anios) {
  if (anios >= 20) return 25;
  if (anios >= 15) return 20;
  return 15;
}

function diferenciaDias(desde, hasta) {
  const MS_DIA = 1000 * 60 * 60 * 24;
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b - a) / MS_DIA);
}

// Mensaje institucional exacto pedido para la alerta de hito de antigüedad.
function mensajeHito({ nombreCompleto, fechaCumplimiento, tramoAnios }) {
  const fechaTexto = aFechaMediodia(fechaCumplimiento).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return `Estimado/a ${nombreCompleto}, le informamos que el ${fechaTexto} cumplirá ${tramoAnios} años de antigüedad. ` +
    `En dicha fecha se agregarán automáticamente 5 días a su saldo de feriado legal, ` +
    `los cuales podrá comenzar a utilizar a partir de ese mismo día.`;
}

module.exports = {
  TRAMOS_ANTIGUEDAD,
  DIAS_POR_TRAMO,
  aniosServicio,
  fechaCumplimientoTramo,
  diasFeriadoPorAntiguedad,
  diferenciaDias,
  mensajeHito,
  soloFecha,
};
