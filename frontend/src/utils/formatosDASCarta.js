import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LOGO_TALCAHUANO_PNG } from './logoTalcahuano';

// ═════════════════════════════════════════════════════════════════════════════
// Formatos oficiales DAS en tamaño carta, reconstruidos desde los documentos
// impresos entregados por la institución (Solicitud Permiso de Capacitación y
// Solicitud de Descanso Compensatorio): mismos textos, mismo orden y misma
// distribución, redibujados en limpio (líneas rectas, columnas alineadas).
// Coordenadas en puntos desde la esquina superior izquierda.
// ═════════════════════════════════════════════════════════════════════════════

const CARTA = [612, 792];
const NEGRO = [30, 30, 30];
const TINTA = [15, 23, 42];

// ─── Datos ───────────────────────────────────────────────────────────────────

// Fechas con hora (timestamp UTC, ej. fecha_solicitud) se pasan a la fecha
// local; las DATE ('YYYY-MM-DD') se usan tal cual.
const isoLocal = (v) => {
  const s = String(v);
  if (!s.includes('T')) return s.substring(0, 10);
  const d = new Date(s);
  return isNaN(d) ? s.substring(0, 10) : format(d, 'yyyy-MM-dd');
};
const fechaCorta = (v) => {
  if (!v) return '';
  const [a, m, d] = isoLocal(v).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
};
const diaMes = (v) => {
  if (!v) return '';
  const [, m, d] = String(v).substring(0, 10).split('-');
  return m && d ? `${d}/${m}` : '';
};
const fechaLarga = (v) => {
  const d = v ? new Date(`${isoLocal(v)}T12:00:00`) : new Date();
  return format(isNaN(d) ? new Date() : d, "d 'de' MMMM 'de' yyyy", { locale: es });
};
const numero = (v) => {
  if (v === undefined || v === null || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
};
const hora = (v) => (v ? String(v).substring(0, 5) : '');
const sumarHoras = (hhmm, horas) => {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  const total = h * 60 + (m || 0) + Math.round(Number(horas || 0) * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const nombreCompleto = (f) => `${f.nombres || ''} ${f.apellidos || ''}`.trim();
const estamentoCargo = (f) => {
  const est = (f.escalafon || '').trim();
  const cargo = (f.cargo || '').trim();
  if (est && cargo && est.toUpperCase() !== cargo.toUpperCase()) return `${est} – ${cargo}`;
  return cargo || est;
};
const tiposContrato = (f) => [f.tipo_contrato, f.tipo_contrato_2].filter(Boolean);
const horasTotales = (f) => (Number(f.horas_contrato) || 0) + (f.tipo_contrato_2 ? Number(f.horas_contrato_2) || 0 : 0);

// ─── Dibujo ──────────────────────────────────────────────────────────────────

function lienzo(folio) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: CARTA });
  if (folio) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(folio, CARTA[0] - 36, 28, { align: 'right' });
  }
  return doc;
}

// Texto fijo del formulario. "hasta" reparte el espacio entre las palabras
// para que la línea termine justo en ese x (texto justificado, como el original).
function rotulo(doc, texto, x, y, { fuente = 'helvetica', estilo = 'normal', size = 10, align, hasta } = {}) {
  doc.setFont(fuente, estilo);
  doc.setFontSize(size);
  doc.setTextColor(...NEGRO);
  if (hasta) {
    const palabras = texto.split(' ');
    const anchos = palabras.map((p) => doc.getTextWidth(p));
    const hueco = (hasta - x - anchos.reduce((a, b) => a + b, 0)) / Math.max(palabras.length - 1, 1);
    let cx = x;
    palabras.forEach((p, i) => { doc.text(p, cx, y); cx += anchos[i] + hueco; });
    return x + doc.getTextWidth(texto);
  }
  doc.text(texto, x, y, align ? { align } : undefined);
  return x + doc.getTextWidth(texto);
}

function linea(doc, x1, x2, y, grosor = 0.6) {
  doc.setDrawColor(...NEGRO);
  doc.setLineWidth(grosor);
  doc.line(x1, y, x2, y);
}

// Dato escrito sobre una línea de llenado: achica la letra hasta 7,5 pt si no
// cabe; centrado para marcas y números cortos.
function campo(doc, valor, x1, x2, y, { centrar = false, size = 10 } = {}) {
  if (valor === undefined || valor === null || valor === '') return;
  const texto = String(valor);
  let s = size;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(s);
  while (s > 7.5 && doc.getTextWidth(texto) > x2 - x1 - 4) {
    s -= 0.5;
    doc.setFontSize(s);
  }
  doc.setTextColor(...TINTA);
  if (centrar) doc.text(texto, (x1 + x2) / 2, y - 2.5, { align: 'center' });
  else doc.text(texto, x1 + 3, y - 2.5);
}

// Línea de llenado + dato
function llenar(doc, valor, x1, x2, y, opciones) {
  linea(doc, x1, x2, y);
  campo(doc, valor, x1, x2, y, opciones);
}

function checkmark(doc, x, y) {
  doc.setDrawColor(...NEGRO);
  doc.setLineWidth(0.9);
  doc.line(x, y - 3, x + 2.5, y);
  doc.line(x + 2.5, y, x + 7, y - 7);
}

// ─── Solicitud Permiso de Capacitación ───────────────────────────────────────
export function construirFormatoCapacitacionDAS(solicitud, funcionario, saldoInfo = {}, folio) {
  const doc = lienzo(folio);
  const f = funcionario;
  const T = { fuente: 'times' };
  const ROT = { ...T, estilo: 'bold', size: 11 };
  const IZQ = 79;      // margen izquierdo del texto
  const DER = 524;     // margen derecho
  const DOS_PUNTOS = 222;
  const LINEA_INI = 229;

  doc.addImage(LOGO_TALCAHUANO_PNG, 'PNG', 180, 55, 243, 39.2);

  rotulo(doc, 'SOLICITUD PERMISO DE CAPACITACIÓN', 306, 187, { ...T, estilo: 'bolditalic', size: 15, align: 'center' });

  // Datos del funcionario
  const filas = [
    ['NOMBRE COMPLETO', nombreCompleto(f)],
    ['R.U.T.', f.rut],
    ['ESTAMENTO – CARGO', estamentoCargo(f)],
    null, // tipo de contrato
    ['CESFAM – DAS', f.dispositivo || f.cesfam || ''],
  ];
  filas.forEach((fila, i) => {
    const y = 244 + i * 37;
    if (!fila) return;
    rotulo(doc, fila[0], IZQ, y, ROT);
    rotulo(doc, ':', DOS_PUNTOS, y, { ...T, size: 11 });
    llenar(doc, fila[1], LINEA_INI, DER, y + 2);
  });

  // Tipo de contrato (fila 4)
  const yTc = 244 + 3 * 37;
  const tipos = tiposContrato(f).map((t) => t.toLowerCase());
  const marca = (c) => (tipos.some(c) ? 'X' : '');
  rotulo(doc, 'TIPO CONTRATO', IZQ, yTc, ROT);
  rotulo(doc, ': INDEFINIDO:', DOS_PUNTOS, yTc, { ...T, size: 10.5 });
  llenar(doc, marca((t) => t.includes('indefinido') || t.includes('planta')), 300, 330, yTc + 2, { centrar: true });
  rotulo(doc, 'PLAZO FIJO:', 334, yTc, { ...T, size: 10.5 });
  // Plazo Fijo incluye contrata y suplencias (reemplazos a plazo)
  llenar(doc, marca((t) => t.includes('plazo') || t.includes('contrata') || t.includes('suplencia')), 396, 424, yTc + 2, { centrar: true });
  rotulo(doc, 'HONORARIOS:', 428, yTc, { ...T, size: 10.5 });
  llenar(doc, marca((t) => t.includes('honorario')), 498, DER, yTc + 2, { centrar: true });

  // Solicitud
  const yS = 433;
  const finSolicito = rotulo(doc, 'SOLICITO:', IZQ, yS, { ...T, size: 10.5 });
  llenar(doc, numero(solicitud.dias_solicitados), finSolicito + 6, finSolicito + 40, yS + 2, { centrar: true });
  rotulo(doc, 'DIA (S) DE PERMISO DE CAPACITACIÓN CON GOCE DE', finSolicito + 46, yS, { ...T, size: 10.5, hasta: DER });
  const finDesde = rotulo(doc, 'REMUNERACIONES DESDE:', IZQ, yS + 13, { ...T, size: 10.5 });
  llenar(doc, fechaCorta(solicitud.fecha_inicio), finDesde + 4, finDesde + 60, yS + 15, { centrar: true, size: 9.5 });
  const finHasta = rotulo(doc, 'HASTA:', finDesde + 66, yS + 13, { ...T, size: 10.5 });
  llenar(doc, fechaCorta(solicitud.fecha_fin), finHasta + 4, finHasta + 60, yS + 15, { centrar: true, size: 9.5 });

  // Actividad (campo "motivo"): continúa en la segunda línea si es largo
  const yA = 483;
  const finAct = rotulo(doc, 'NOMBRE O ACTIVIDAD DE CAPACITACIÓN:', IZQ, yA, { ...T, size: 10.5 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const actividad = (solicitud.motivo || '').trim();
  const [l1 = '', ...resto] = actividad ? doc.splitTextToSize(actividad, DER - finAct - 12) : [];
  llenar(doc, l1, finAct + 4, DER, yA + 2);
  llenar(doc, resto.join(' '), IZQ, DER, yA + 26);

  // Totales. El original trae "05" impreso; se usa el saldo real si se conoce.
  const yT = 545;
  rotulo(doc, 'N° TOTAL DÍAS:', IZQ, yT, { ...T, size: 10.5 });
  const total = saldoInfo.total_dias !== undefined && saldoInfo.total_dias !== null
    ? numero(saldoInfo.total_dias) : '05';
  rotulo(doc, total, 162, yT, { ...T, size: 10.5 });
  rotulo(doc, 'N° DIAS SOLICITADOS:', 210, yT, { ...T, size: 10.5 });
  llenar(doc, numero(solicitud.dias_solicitados), 326, 368, yT + 2, { centrar: true });
  rotulo(doc, 'SALDO PENDIENTE:', 378, yT, { ...T, size: 10.5 });
  llenar(doc, numero(saldoInfo.saldo_pendiente), 478, DER, yT + 2, { centrar: true });

  // Firmas
  const yF = 606;
  linea(doc, IZQ + 3, 216, yF, 0.8);
  rotulo(doc, 'FIRMA SOLICITANTE', (IZQ + 3 + 216) / 2, yF + 13, { ...T, estilo: 'bold', size: 10.5, align: 'center' });
  linea(doc, 390, DER, yF, 0.8);
  rotulo(doc, 'V° B° JEFE DIRECTO', (390 + DER) / 2, yF + 13, { ...T, estilo: 'bold', size: 10.5, align: 'center' });

  const finCiudad = rotulo(doc, 'TALCAHUANO,', IZQ + 5, 716, { ...T, estilo: 'bold', size: 10.5 });
  campo(doc, fechaLarga(solicitud.fecha_solicitud || solicitud.created_at), finCiudad + 2, 420, 718.5);
  return doc;
}

// ─── Solicitud de Descanso Compensatorio ─────────────────────────────────────
export function construirFormatoCompensatorio(sol, funcionario, folio) {
  const doc = lienzo(folio);
  const f = funcionario;
  const IZQ = 44;
  const DER = 519;
  const DOS_PUNTOS = 150;
  const LINEA_INI = 146;
  const R = { size: 9.5 };

  doc.addImage(LOGO_TALCAHUANO_PNG, 'PNG', 175, 61, 236, 38);

  rotulo(doc, 'SOLICITUD DE DESCANSO COMPENSATORIO', 306, 158, { estilo: 'bold', size: 15, align: 'center' });

  // Datos del funcionario: rótulo arriba, línea de llenado debajo
  const tipos = tiposContrato(f);
  const textoContrato = tipos.map((t, i) => {
    const h = i === 0 ? f.horas_contrato : f.horas_contrato_2;
    return tipos.length > 1 && h ? `${t} ${h} hrs` : t;
  }).join(' + ');
  const filas = [
    ['NOMBRE COMPLETO', nombreCompleto(f)],
    ['RUT', f.rut],
    ['ESTAMENTO', f.escalafon || f.cargo || ''],
    ['TIPO DE CONTRATO', textoContrato],
    ['CESFAM', f.dispositivo || f.cesfam || ''],
  ];
  filas.forEach(([rot, valor], i) => {
    const y = 236 + i * 26;
    rotulo(doc, rot, IZQ, y, R);
    rotulo(doc, ':', DOS_PUNTOS, y, R);
    if (rot === 'RUT') {
      linea(doc, LINEA_INI, DER, y + 13);
      campo(doc, valor, 158, 355, y + 11);
      rotulo(doc, 'JORNADA', 363, y + 2, R);
      campo(doc, numero(horasTotales(f) || ''), 410, 478, y + 4, { centrar: true });
      rotulo(doc, 'HRS', 484, y + 2, R);
    } else {
      linea(doc, LINEA_INI, DER, y + 13);
      campo(doc, valor, 158, DER, y + 11);
    }
  });

  // Solicitud
  const yV = 401;
  rotulo(doc, 'VIENE A SOLICITAR', IZQ, yV, R);
  const X = 162;
  llenar(doc, numero(sol.horas_solicitadas), X, 252, yV + 7, { centrar: true });
  rotulo(doc, 'horas de descanso compensatorio, a partir de las', 253, yV + 6, { size: 10 });
  const inicio = hora(sol.hora_inicio);
  llenar(doc, inicio, X, 198, yV + 26, { centrar: true, size: 9.5 });
  rotulo(doc, 'hrs. del', 201, yV + 25, { size: 10 });
  llenar(doc, diaMes(sol.fecha_inicio), 238, 328, yV + 26, { centrar: true });
  rotulo(doc, 'y hasta las', 332, yV + 25, { size: 10 });
  llenar(doc, sumarHoras(inicio, sol.horas_solicitadas), 385, 439, yV + 26, { centrar: true, size: 9.5 });
  rotulo(doc, 'del', 456, yV + 25, { size: 10 });
  rotulo(doc, ':', DOS_PUNTOS, yV + 46, R);
  llenar(doc, diaMes(sol.fecha_fin || sol.fecha_inicio), X, 210, yV + 44, { centrar: true });
  rotulo(doc, 'del año en curso.', 213, yV + 43, { size: 10 });

  // Firmas
  const yF = 580;
  linea(doc, 89, 206, yF, 0.8);
  rotulo(doc, 'FIRMA SOLICITANTE', (89 + 206) / 2, yF + 13, { ...R, align: 'center' });
  linea(doc, 414, DER, yF, 0.8);
  rotulo(doc, 'V°B° JEFE DIRECTO', (414 + DER) / 2, yF + 13, { ...R, align: 'center' });

  // Fecha de solicitud y observaciones
  rotulo(doc, 'FECHA SOLICITUD, TALCAHUANO', 41, 636, { size: 10 });
  llenar(doc, fechaCorta(sol.fecha_solicitud || sol.created_at), 198, 297, 638, { centrar: true });
  linea(doc, 39, 476, 646, 1.4);

  rotulo(doc, 'OBSERVACION IMPORTANTE', 41, 664, { estilo: 'bold', size: 9.5 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  linea(doc, 41, 41 + doc.getTextWidth('OBSERVACION IMPORTANTE'), 666, 0.7);
  checkmark(doc, 41, 679);
  rotulo(doc, 'Este formulario se debe llenar en triplicado.', 56, 679, { size: 9.5 });
  checkmark(doc, 41, 695);
  rotulo(doc, 'Debe adjuntar a registro de reloj control de las horas que desea compensa', 56, 695, { size: 9.5 });

  rotulo(doc, 'DAS TALCAHUANO, MANUEL BULNES 266, TERCER PISO, TALCAHUANO, FONO:413835700', 306, 771, { size: 9, align: 'center' });
  return doc;
}

export function descargarFormatoCompensatorio(sol, funcionario) {
  const folio = `COMP-${String(sol.id || '').padStart(5, '0')}`;
  const doc = construirFormatoCompensatorio(sol, funcionario, folio);
  const ap = (funcionario.apellidos || 'funcionario').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  doc.save(`${folio}_${ap}.pdf`);
}
