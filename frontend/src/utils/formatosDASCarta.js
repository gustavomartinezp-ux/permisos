import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LOGO_TALCAHUANO_PNG } from './logoTalcahuano';
import { TEXTOS_SUSPENSION, LINEAS_SUSPENSION, LOGO_TALCAHUANO_AZUL_PNG } from './plantillaSuspension';
import { ENCABEZADO_COMPENSATORIO_PNG } from './encabezadoCompensatorio';
import { estamparFirma, cargarFirmas } from './firmasPDF';

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
  linea(doc, 235, 371, yF + 74, 0.8);
  rotulo(doc, 'DIRECCIÓN', 303, yF + 87, { ...T, estilo: 'bold', size: 10.5, align: 'center' });
  const firmas = solicitud._firmas || {};
  // Las de arriba, más bajas: la fila de totales está justo encima
  estamparFirma(doc, firmas.solicitante, IZQ + 3, 216, yF, 1, 44);
  estamparFirma(doc, firmas.jefe, 390, DER, yF, 1, 44);
  estamparFirma(doc, firmas.direccion, 235, 371, yF + 74);

  const finCiudad = rotulo(doc, 'TALCAHUANO,', IZQ + 5, 716, { ...T, estilo: 'bold', size: 10.5 });
  campo(doc, fechaLarga(solicitud.fecha_solicitud || solicitud.created_at), finCiudad + 2, 420, 718.5);
  return doc;
}

// ─── Solicitud de Descanso Compensatorio (formato agosto 2026) ──────────────
// Reconstruido desde el Word institucional: marco y textos en azul DAS, letra
// Verdana negrita (aquí Helvetica negrita estirada al ancho original). El Word
// mide 612 × 907,5 pt; para hoja carta se acortan los dos espacios en blanco
// (antes de las firmas y antes de "TALCAHUANO:") sin achicar letra ni anchos.
const AZUL_DAS = [2, 103, 170];

// Rótulo azul en negrita, repartido hasta el borde derecho del original
function rotuloAzul(doc, texto, x, y, size, hasta) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size);
  doc.setTextColor(...AZUL_DAS);
  const ancho = doc.getTextWidth(texto);
  const charSpace = hasta && ancho < hasta - x ? (hasta - x - ancho) / Math.max(texto.length - 1, 1) : 0;
  doc.text(texto, x, y, charSpace ? { charSpace } : undefined);
}

export function construirFormatoCompensatorio(sol, funcionario, folio) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: CARTA });
  const f = funcionario;
  // y del Word → y en carta: firmas suben 70 pt y el bloque final 116 pt
  const Y = (y) => (y <= 400 ? y : y <= 700 ? y - 70 : y - 116);
  if (folio) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(folio, 590, 20, { align: 'right' });
  }

  // Marco con el encabezado interrumpiendo el borde superior
  doc.setDrawColor(...AZUL_DAS);
  doc.setLineWidth(1);
  doc.line(21.7, Y(37.2), 101.9, Y(37.2));
  doc.line(474, Y(37.2), 590.2, Y(37.2));
  doc.line(21.7, Y(37.2), 21.7, Y(883.9));
  doc.line(590.2, Y(37.2), 590.2, Y(883.9));
  doc.line(21.7, Y(883.9), 590.2, Y(883.9));
  doc.addImage(ENCABEZADO_COMPENSATORIO_PNG, 'PNG', 116, Y(24), 332, 38);

  // Textos fijos: [texto, x, y base, tamaño, borde derecho original]
  const TEXTOS = [
    ['SOLICITUD DE DESCANSO COMPENSATORIO', 81.9, 125.8, 18, 519.5],
    ['NOMBRE COMPLETO:', 62.7, 166.3, 9.96, 177],
    ['R.U.T:', 62.7, 193.1, 9.64, 94],
    ['JORNADA:', 349.3, 196.1, 9.96, 406],
    ['HRS.', 488.4, 196.1, 9.96, 515.2],
    ['CARGO:', 62.7, 232.3, 9.96, 105],
    ['TIPO CONTRATO: INDEFINIDO', 63.7, 263.7, 9.42, 219.6],
    ['PLAZO FIJO', 296.6, 263.7, 9.64, 361],
    ['REEMPLAZO', 424.7, 263.7, 9.96, 496],
    ['CESFAM:', 63.7, 296, 9.96, 112],
    ['VIENE A SOLICITAR :', 62.7, 328.1, 9.96, 182],
    ['horas de descanso compensatorio, a partir de las', 222.7, 328.1, 9.96, 498.5],
    ['hrs', 528.5, 328.1, 9.96, 544.3],
    ['del', 62.7, 352, 9.96, 79],
    ['y hasta las', 162.4, 352, 9.96, 222.5],
    ['del', 285.2, 352, 9.96, 302],
    ['del año en curso.', 365.7, 352, 9.96, 461.7],
    ['FIRMA SOLICITANTE', 92.7, 627.8, 9.42, 197.5],
    ['JEFE OFICINA O', 444.9, 627.7, 9.96, 528.1],
    ['DIRECTOR', 459.5, 639.7, 9.96, 517.4],
    ['TALCAHUANO:', 63.7, 756.9, 9.96, 143.5],
    ['OBSERVACIÓN IMPORTANTE: ESTE FORMULARIO SE DEBE LLENAR EN TRIPLICADO.', 63.7, 807.5, 8.04, 416.7],
    ['DEBE ADJUNTAR A REGISTRO DE RELOJ CONTROL DE LAS HORAS QUE DESEA COMPENSAR', 66, 826.7, 8.04, 449],
    ['DAS TALCAHUANO, Bulnes 266, Teléfono 413835700', 200.3, 869.9, 7.61, 416.7],
  ];
  for (const [texto, x, y, size, hasta] of TEXTOS) rotuloAzul(doc, texto, x, Y(y), size, hasta);

  // Líneas de llenado (azules, como el original) con el dato encima
  const lineaAzul = (x1, x2, y, grosor = 1) => {
    doc.setDrawColor(...AZUL_DAS);
    doc.setLineWidth(grosor);
    doc.line(x1, Y(y), x2, Y(y));
  };
  const dato = (valor, x1, x2, y, opciones) => { lineaAzul(x1, x2, y); campo(doc, valor, x1, x2, Y(y), opciones); };

  dato(nombreCompleto(f), 177.4, 565.8, 167.6);
  dato(f.rut, 94.3, 301.6, 194.3);
  dato(numero(horasTotales(f) || ''), 406.6, 485, 197.3, { centrar: true });
  dato(f.cargo || f.escalafon || '', 105.5, 563.8, 233.6);

  // Tipo de contrato: X en la casilla que corresponde (Suplencia = Reemplazo)
  const tipos = tiposContrato(f).map((t) => t.toLowerCase());
  const marca = (c) => (tipos.some(c) ? 'X' : '');
  dato(marca((t) => t.includes('indefinido') || t.includes('planta')), 223.2, 293.2, 265, { centrar: true });
  dato(marca((t) => t.includes('plazo') || t.includes('contrata')), 364.4, 421.3, 265, { centrar: true });
  dato(marca((t) => t.includes('suplencia') || t.includes('reemplazo')), 496.5, 565.9, 265, { centrar: true });

  dato(f.dispositivo || f.cesfam || '', 112, 565.3, 297.2);

  // Solicitud
  const inicio = hora(sol.hora_inicio);
  dato(numero(sol.horas_solicitadas), 182.4, 219.3, 329.3, { centrar: true });
  dato(inicio, 498.9, 528.5, 329.3, { centrar: true, size: 9 });
  dato(diaMes(sol.fecha_inicio), 79.1, 159, 353.2, { centrar: true });
  dato(sumarHoras(inicio, sol.horas_solicitadas), 222.8, 281.8, 353.2, { centrar: true });
  dato(diaMes(sol.fecha_fin || sol.fecha_inicio), 302.3, 365.7, 353.2, { centrar: true });

  // Firmas y fecha de solicitud
  lineaAzul(63, 229.7, 593.8);
  lineaAzul(397.9, 564.6, 593.8);
  const firmas = sol._firmas || {};
  estamparFirma(doc, firmas.solicitante, 63, 229.7, Y(593.8));
  estamparFirma(doc, firmas.direccion, 397.9, 564.6, Y(593.8));
  dato(fechaLarga(sol.fecha_solicitud || sol.created_at), 143.9, 315.6, 758.2);
  return doc;
}

export async function descargarFormatoCompensatorio(sol, funcionario) {
  const folio = `COMP-${String(sol.id || '').padStart(5, '0')}`;
  const firmas = await cargarFirmas(sol, { compensacion: true });
  const doc = construirFormatoCompensatorio({ ...sol, _firmas: firmas }, funcionario, folio);
  const ap = (funcionario.apellidos || 'funcionario').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  doc.save(`${folio}_${ap}.pdf`);
}

// ─── Solicitud de Suspensión de Ejecución de Contrato (honorarios) ──────────
// El personal a honorarios no tiene feriado ni permisos de la Ley 19.378: su
// contrato prevé "suspensión de la ejecución" por las letras 10b a 10i. Cada
// tipo de permiso del sistema se imputa a su letra.
const LETRA_POR_TIPO = {
  ESP_CONYUGE: '10b', ESP_HIJO_GESTACION: '10c', ESP_FALLECIMIENTO_HIJO: '10d',
  ESP_FAMILIAR_DIRECTO: '10e', ESP_NACIMIENTO: '10f', ESP_MATRIMONIO: '10g',
  ADMIN: '10h', FERIADO: '10i',
};
const DESCRIPCION_LETRA = {
  '10b': 'Fallecimiento cónyuge o conviviente civil', '10c': 'Muerte de hijo en gestación',
  '10d': 'Muerte de un hijo', '10e': 'Fallecimiento hermano, madre o padre',
  '10f': 'Nacimiento de un hijo', '10g': 'Matrimonio civil / Unión civil',
  '10h': 'Motivos particulares del prestador', '10i': '15 días hábiles',
};
// Filas de la tabla [y1, y2] donde van "Desde" / "Hasta"
const FILAS_SUSPENSION = {
  '10b': [305.8, 332.4], '10c': [332.4, 357.4], '10d': [357.4, 372.8], '10e': [372.8, 399.8],
  '10f': [399.8, 432.4], '10g': [432.4, 470.4],
  '10h-6': [484.5, 506.9], '10h-4': [506.9, 529.5], '10h-2': [529.5, 552.0],
  '10i': [552.0, 652.5],
};

export function letraSuspension(solicitud) {
  const cod = solicitud.tipo_especial || solicitud.tipo_codigo || solicitud.codigo;
  if (LETRA_POR_TIPO[cod]) return LETRA_POR_TIPO[cod];
  const n = (solicitud.tipo_nombre || '').toLowerCase();
  if (n.includes('feriado')) return '10i';
  if (n.includes('administrativ')) return '10h';
  return null;
}

// Meses de contrato continuo (desde la fecha de ingreso) para la fila de 10h
function mesesDeContrato(fechaIngreso, alDia) {
  if (!fechaIngreso) return null;
  const [a, m, d] = String(fechaIngreso).substring(0, 10).split('-').map(Number);
  const [ra, rm, rd] = String(alDia || format(new Date(), 'yyyy-MM-dd')).substring(0, 10).split('-').map(Number);
  return (ra - a) * 12 + (rm - m) - (rd < d ? 1 : 0);
}

export function construirFormatoSuspension(solicitud, funcionario, saldoInfo = {}, folio) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [612, 936] });
  const f = funcionario;
  if (folio) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(folio, 576, 20, { align: 'right' });
  }
  doc.addImage(LOGO_TALCAHUANO_AZUL_PNG, 'PNG', 194.25, 23.5, 223.5, 36);

  // Textos fijos: misma posición y ancho que en el original. Calibri se
  // reemplaza por Helvetica al 90 % (tamaño visual equivalente) y cada línea se
  // reparte entre sus palabras hasta el ancho original (como el justificado).
  doc.setTextColor(...NEGRO);
  for (const [texto, x, y, size, negrita, ancho] of TEXTOS_SUSPENSION) {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    let s = size * 0.9;
    doc.setFontSize(s);
    if (doc.getTextWidth(texto) > ancho) { s *= ancho / doc.getTextWidth(texto); doc.setFontSize(s); }
    // Pie (dirección municipal) y títulos: centrados sobre su ancho original
    if (y > 870 || size >= 18) { doc.text(texto, x + ancho / 2, y, { align: 'center' }); continue; }
    const palabras = texto.split(/\s+/);
    const anchos = palabras.map((p) => doc.getTextWidth(p));
    const hueco = (ancho - anchos.reduce((t, w) => t + w, 0)) / Math.max(palabras.length - 1, 1);
    if (palabras.length < 2 || hueco > s * 1.2 || (palabras.length <= 3 && hueco > s * 0.5)) { doc.text(texto, x, y); continue; }
    let cx = x;
    palabras.forEach((p, i) => { doc.text(p, cx, y); cx += anchos[i] + hueco; });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.04 * 0.9);
  doc.text(':', 158.06, 283.49);
  doc.text('(Ej: 10b - 10g ó 10h)', 573.9, 283.49, { align: 'right' });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.48);
  for (const [tipo, a, b, c] of LINEAS_SUSPENSION) {
    if (tipo === 'h') doc.line(a, b, c, b);
    else doc.line(a, b, a, c);
  }

  // Datos del prestador
  campo(doc, nombreCompleto(f), 165, 575, 151.7);
  campo(doc, f.rut, 165, 398, 178.7);
  campo(doc, numero(horasTotales(f) || ''), 448, 481, 178.7, { centrar: true });
  campo(doc, f.cargo || f.escalafon || '', 165, 575, 205.6);
  // Varios convenios ("A / B / C"): si no caben en la línea, se recorta con "…"
  let programa = f.convenio_honorarios || f.prestacion || '';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  while (programa.length > 4 && doc.getTextWidth(programa) > 404) programa = `${programa.slice(0, -2).trimEnd()}…`;
  campo(doc, programa, 165, 575, 232.6);
  campo(doc, f.dispositivo || f.cesfam || '', 165, 575, 259.6);

  const letra = letraSuspension(solicitud);
  if (letra) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...TINTA);
    doc.text(`${letra} — ${DESCRIPCION_LETRA[letra]}`, 168, 283.49);

    let fila = letra;
    if (letra === '10h') {
      const meses = mesesDeContrato(f.fecha_ingreso, solicitud.fecha_inicio);
      fila = meses === null || meses > 11 ? '10h-6' : meses > 6 ? '10h-4' : '10h-2';
    }
    const [y1, y2] = FILAS_SUSPENSION[fila];
    const yc = (y1 + y2) / 2 + 3.5;
    campo(doc, fechaCorta(solicitud.fecha_inicio), 434.4, 507.2, yc + 2.5, { centrar: true, size: 9.5 });
    campo(doc, fechaCorta(solicitud.fecha_fin), 507.2, 579.1, yc + 2.5, { centrar: true, size: 9.5 });

    // Saldos solo para 10h y 10i
    if (letra === '10h' || letra === '10i') {
      const ys = (677.5 + 722.1) / 2 + 6;
      campo(doc, numero(saldoInfo.total_dias), 434.4, 487.7, ys, { centrar: true, size: 11 });
      campo(doc, numero(solicitud.dias_solicitados), 487.7, 534.5, ys, { centrar: true, size: 11 });
      campo(doc, numero(saldoInfo.saldo_pendiente), 534.5, 579.1, ys, { centrar: true, size: 11 });
    }
  }

  // Firmas: solicitante, referente (jefatura que pre-aprueba) y director
  const firmas = solicitud._firmas || {};
  // Más bajas: la tabla de saldos termina justo encima
  estamparFirma(doc, firmas.solicitante, 71.3, 162.14, 769.4, 1, 36);
  estamparFirma(doc, firmas.jefe, 258.17, 368.47, 769.4, 1, 36);
  estamparFirma(doc, firmas.direccion, 438.19, 540.69, 769.4, 1, 36);

  // Fecha de solicitud
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12 * 0.9);
  doc.setTextColor(...NEGRO);
  const rotFecha = 'FECHA SOLICITUD, EN TALCAHUANO A';
  doc.text(rotFecha, 36, 855.6);
  const xf = 36 + doc.getTextWidth(rotFecha) + 4;
  linea(doc, xf, xf + 120, 857.5, 0.6);
  campo(doc, fechaLarga(solicitud.fecha_solicitud || solicitud.created_at), xf, xf + 120, 857.5, { centrar: true });
  return doc;
}

// ─── Memorándum Interno (Jornadas y Permiso de Estamento) ───────────────────
// Reconstruido desde el formulario impreso del CESFAM: encabezado municipal,
// tres casilleros, título, DE / A, 14 líneas de texto y firma del interesado.
// Los casilleros llevan N° de solicitud, fecha y tipo de permiso; el cuerpo se
// redacta con los datos de la solicitud y se escribe sobre las líneas.
export function esMemorandumInterno(solicitud) {
  const cod = solicitud.tipo_codigo || solicitud.codigo || '';
  const n = (solicitud.tipo_nombre || '').toLowerCase();
  return cod === 'JORNADAS' || cod === 'ESTAMENTO' || n.includes('jornada') || n.includes('estamento');
}

export function construirMemorandumInterno(solicitud, funcionario, saldoInfo = {}, folio) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: CARTA });
  const f = funcionario;
  const IZQ = 54;
  const DER = 558;

  // Encabezado institucional (texto tal cual el formulario impreso)
  const cx = 170;
  rotulo(doc, 'I.MUNICIPALIDAD DE TALCAHUANO', cx, 54, { size: 8, align: 'center' });
  rotulo(doc, 'DIRECCIÓN DE ADMINISTRACIÓN DE SALUD', cx, 64, { size: 8, align: 'center' });
  rotulo(doc, 'CESFAM  LOS CERROS', cx, 74, { estilo: 'bold', size: 8, align: 'center' });

  // Tres casilleros: N° de solicitud, fecha y tipo
  const bx = 300, by = 86, bw = 64, bh = 25;
  doc.setDrawColor(...NEGRO);
  doc.setLineWidth(0.9);
  for (let i = 0; i < 3; i++) doc.rect(bx + i * bw, by, bw, bh);
  const esEstamento = (solicitud.tipo_codigo || '') === 'ESTAMENTO' || (solicitud.tipo_nombre || '').toLowerCase().includes('estamento');
  const casilleros = [
    folio || (solicitud.id ? `N° ${solicitud.id}` : ''),
    fechaCorta(solicitud.fecha_solicitud || solicitud.created_at),
    esEstamento ? 'ESTAMENTO' : 'JORNADAS',
  ];
  casilleros.forEach((v, i) => campo(doc, v, bx + i * bw, bx + (i + 1) * bw, by + bh / 2 + 5.5, { centrar: true, size: 8.5 }));

  rotulo(doc, 'MEMORANDUM INTERNO', 210, 196, { estilo: 'bold', size: 16, align: 'center' });

  // DE / A
  const de = [nombreCompleto(f), f.cargo].filter(Boolean).join(' — ');
  const dispositivo = f.dispositivo || f.cesfam || 'CESFAM LOS CERROS';
  rotulo(doc, 'DE:', IZQ, 238, { size: 10 });
  llenar(doc, de, 112, DER, 240);
  rotulo(doc, 'A:', IZQ, 263, { size: 10 });
  llenar(doc, `DIRECCIÓN ${dispositivo}`.toUpperCase(), 112, DER, 265);

  // Cuerpo
  const dias = Number(solicitud.dias_solicitados);
  const medio = solicitud.jornada_medio_dia || (esEstamento ? 'PM' : null);
  const tipo = esEstamento ? 'Permiso de Estamento' : 'Jornadas';
  const cantidad = dias === 0.5
    ? `media jornada ${medio || ''}`.trim()
    : `${numero(dias)} día${dias === 1 ? '' : 's'}`;
  const periodo = solicitud.fecha_fin && String(solicitud.fecha_fin).substring(0, 10) !== String(solicitud.fecha_inicio).substring(0, 10)
    ? `desde el ${fechaCorta(solicitud.fecha_inicio)} hasta el ${fechaCorta(solicitud.fecha_fin)}`
    : `el día ${fechaCorta(solicitud.fecha_inicio)}`;
  const jornada = horasTotales(f);
  const parrafos = [
    `Junto con saludar, por medio del presente solicito a usted autorizar ${cantidad} de ${tipo}, ${periodo}.`,
    solicitud.motivo ? `Motivo: ${solicitud.motivo}.` : null,
    `Funcionario(a): ${nombreCompleto(f)}, RUT ${f.rut || '—'}, ${f.cargo || ''}${jornada ? `, jornada ${jornada} hrs.` : '.'}`,
    solicitud.reemplazante ? `En mi ausencia realizará mis funciones: ${solicitud.reemplazante}.` : null,
    'Sin otro particular, saluda atentamente a usted.',
  ].filter(Boolean);

  const LINEAS = 14;
  const y0 = 315;
  const paso = 24.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const renglones = [];
  for (const p of parrafos) renglones.push(...doc.splitTextToSize(p, DER - IZQ - 8));
  for (let i = 0; i < LINEAS; i++) {
    const y = y0 + i * paso;
    linea(doc, IZQ, DER, y);
    if (renglones[i]) campo(doc, renglones[i], IZQ, DER + 400, y);
  }

  // Firmas: interesado, V°B° de la jefatura directa y Dirección
  linea(doc, 348, 540, 692, 0.8);
  rotulo(doc, 'Firma Interesado', 444, 705, { estilo: 'bold', size: 10, align: 'center' });
  linea(doc, 72, 264, 692, 0.8);
  rotulo(doc, 'V° B° Jefe Directo', 168, 705, { estilo: 'bold', size: 10, align: 'center' });
  linea(doc, 210, 402, 762, 0.8);
  rotulo(doc, 'Dirección', 306, 775, { estilo: 'bold', size: 10, align: 'center' });
  const firmas = solicitud._firmas || {};
  // Las de arriba, más bajas: la última línea del texto está justo encima
  estamparFirma(doc, firmas.solicitante, 348, 540, 692, 1, 40);
  estamparFirma(doc, firmas.jefe, 72, 264, 692, 1, 40);
  estamparFirma(doc, firmas.direccion, 210, 402, 762);
  return doc;
}
