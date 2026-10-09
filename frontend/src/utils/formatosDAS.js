import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ENCABEZADO_DAS_PNG } from './encabezadoDAS';

// ═════════════════════════════════════════════════════════════════════════════
// Formatos oficiales DAS Talcahuano (Feriado Legal, Permiso Administrativo y
// Permiso de Capacitación), calcados de las plantillas Word institucionales:
// mismo tamaño de hoja (8,5" x 12,6"), marco, encabezado, rótulos y líneas en
// las mismas coordenadas (puntos, medidas tomadas del documento original).
// Cada plantilla declara sus rótulos fijos, líneas de llenado y el campo que
// va sobre cada línea; los valores se calculan desde la solicitud y el
// funcionario para que el formato salga completamente lleno.
// ═════════════════════════════════════════════════════════════════════════════

const PAGINA = [612, 907.56];
const AZUL = [2, 103, 170];
const TINTA = [15, 23, 42];
const PIE = 'DAS TALCAHUANO, Bulnes 266, Teléfono 413835700';
const OBSERVACION = [
  'OBSERVACIÓN IMPORTANTE: NINGUN FUNCIONARIO PUEDE ABANDONAR SUS FUNCIONES, SI NO',
  'HA SIDO AUTORIZADO FORMALMENTE PARA HACER USO DEL PERMISO SOLICITADO',
];

// ─── Helpers de formato de datos ─────────────────────────────────────────────

function fechaCorta(valor) {
  if (!valor) return '';
  const iso = String(valor).substring(0, 10);
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

function fechaLarga(valor) {
  const d = valor ? new Date(`${String(valor).substring(0, 10)}T12:00:00`) : new Date();
  return format(isNaN(d) ? new Date() : d, "d 'de' MMMM 'de' yyyy", { locale: es });
}

function numero(valor) {
  if (valor === undefined || valor === null || valor === '') return '';
  const n = Number(valor);
  if (Number.isNaN(n)) return String(valor);
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

// Casilla de tipo de contrato que corresponde marcar: los valores del sistema
// son Indefinido / Plazo Fijo / Suplencia (= REEMPLAZO en el formato).
function contratoMarcado(tipoContrato) {
  const t = (tipoContrato || '').toLowerCase();
  if (t.includes('indefinido') || t.includes('titular') || t.includes('planta')) return 'indefinido';
  if (t.includes('reemplazo') || t.includes('suplencia')) return 'reemplazo';
  if (t.includes('plazo') || t.includes('contrata')) return 'plazo';
  return null;
}

function anioDe(valor) {
  return valor ? parseInt(String(valor).substring(0, 4), 10) : new Date().getFullYear();
}

// Valores comunes a los tres formatos
function valoresBase(solicitud, funcionario, saldoInfo) {
  const contrato = contratoMarcado(funcionario.tipo_contrato);
  return {
    nombre:      `${funcionario.nombres || ''} ${funcionario.apellidos || ''}`.trim(),
    rut:         funcionario.rut || '',
    jornada:     numero(funcionario.horas_contrato),
    cargo:       funcionario.cargo || '',
    indefinido:  contrato === 'indefinido' ? 'X' : '',
    plazo:       contrato === 'plazo' ? 'X' : '',
    reemplazo:   contrato === 'reemplazo' ? 'X' : '',
    cesfam:      funcionario.dispositivo || funcionario.cesfam || '',
    dias:        numero(solicitud.dias_solicitados),
    desde:       fechaCorta(solicitud.fecha_inicio),
    hasta:       fechaCorta(solicitud.fecha_fin),
    reemplazante: solicitud.reemplazante || '',
    total:       numero(saldoInfo.total_dias),
    solicitados: numero(solicitud.dias_solicitados),
    saldo:       numero(saldoInfo.saldo_pendiente),
    ciudad:      fechaLarga(solicitud.fecha_solicitud),
  };
}

// ─── Motor de dibujo ─────────────────────────────────────────────────────────

// Escribe un valor sobre una línea de llenado, centrado si es una marca corta
// y achicando la letra si no cabe en el ancho de la línea.
function escribirEnLinea(doc, valor, [x1, x2, y], { centrar = false } = {}) {
  if (!valor) return;
  const texto = String(valor);
  const ancho = x2 - x1 - 4;
  let size = 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(size);
  while (size > 6 && doc.getTextWidth(texto) > ancho) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  doc.setTextColor(...TINTA);
  if (centrar) {
    doc.text(texto, (x1 + x2) / 2, y - 2, { align: 'center' });
  } else {
    doc.text(texto, x1 + 3, y - 2);
  }
}

function dibujarFormato(plantilla, valores, folio) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: PAGINA });

  // Marco con la abertura superior donde va el encabezado
  const [mx1, my1, mx2, my2] = plantilla.marco;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(1);
  doc.line(mx1, my1, 103, my1);
  doc.line(475, my1, mx2, my1);
  doc.line(mx1, my1, mx1, my2);
  doc.line(mx2, my1, mx2, my2);
  doc.line(mx1, my2, mx2, my2);

  doc.addImage(ENCABEZADO_DAS_PNG, 'PNG', 138, plantilla.encabezadoY, 311, 43);

  // Folio del sistema (trazabilidad del documento impreso)
  if (folio) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 130, 145);
    doc.text(folio, mx2 - 6, my1 + 10, { align: 'right' });
  }

  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(plantilla.titulo, 306, plantilla.tituloY + 17, { align: 'center' });

  doc.setFontSize(10);
  for (const [x, y, texto, opciones = {}] of plantilla.rotulos) {
    doc.setFontSize(opciones.size || 10);
    doc.text(texto, x, y + 9.5, opciones.align ? { align: opciones.align } : undefined);
  }

  doc.setLineWidth(0.9);
  for (const [clave, [x1, x2, y]] of Object.entries(plantilla.campos)) {
    if ((plantilla.opcionales || []).includes(clave) && !valores[clave]) continue;
    doc.line(x1, y, x2, y);
  }
  for (const [x1, x2, y, grosor = 0.9] of plantilla.lineas || []) {
    doc.setLineWidth(grosor);
    doc.line(x1, y, x2, y);
  }

  // Observación y pie
  doc.setFontSize(8);
  doc.text(OBSERVACION[0], 64, plantilla.observacionY + 7);
  doc.text(OBSERVACION[1], 64, plantilla.observacionY + 17);
  doc.setFontSize(8.2);
  doc.text(PIE, 306, plantilla.pieY + 7.5, { align: 'center' });

  for (const [clave, linea] of Object.entries(plantilla.campos)) {
    escribirEnLinea(doc, valores[clave], linea, { centrar: (plantilla.marcas || []).includes(clave) });
  }
  for (const [x, y, clave] of plantilla.valoresLibres || []) {
    if (!valores[clave]) continue;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TINTA);
    doc.text(String(valores[clave]), x, y + 9.5);
  }
  return doc;
}

// Firmas comunes (posición vertical según plantilla)
function firmas(yLinea, yUnidad, yTexto, yTextoUnidad, dx = 0) {
  return {
    rotulos: [
      [93 + dx, yTexto, 'FIRMA SOLICITANTE'],
      [445 + dx, yTexto, 'JEFE OFICINA O'],
      [459 + dx, yTexto + 12, 'DIRECTOR'],
      [255 + dx, yTextoUnidad, 'ENCARGADO UNIDAD'],
    ],
    lineas: [[63 + dx, 229.7 + dx, yLinea, 1], [397.9 + dx, 564.6 + dx, yLinea, 1], [229.7 + dx, 396.5 + dx, yUnidad, 1]],
  };
}

// ─── Plantillas ──────────────────────────────────────────────────────────────

const ADMINISTRATIVO = (() => {
  const f = firmas(593.8, 684.7, 607, 701);
  return {
    titulo: 'SOLICITUD PERMISO ADMINISTRATIVO',
    marco: [21.7, 37.2, 590.2, 883.9], encabezadoY: 17, tituloY: 79,
    observacionY: 798, pieY: 860,
    rotulos: [
      [63, 130, 'NOMBRE COMPLETO:'],
      [63, 157, 'R.U.T:'],
      [63, 187, 'CARGO:'],
      [64, 218, 'TIPO CONTRATO: INDEFINIDO'], [296, 218, 'PLAZO FIJO'], [424, 218, 'REEMPLAZO'],
      [64, 250, 'CESFAM:'],
      [63, 284, 'SOLICITO :'], [161, 284, 'DÍAS ( S) DE PERMISO ADMINISTRATIVO  CON'], [437, 284, 'SIN'],
      [63, 308, 'GOCE DE REMUNERACIONES'], [379, 308, 'AM:'], [437, 308, 'PM:'],
      [63, 339, 'DESDE :'], [205, 339, 'HASTA :'], [369, 339, 'POR MOTIVOS PARTICULARES'],
      [64, 367, 'EN MI AUSENCIA REALIZARA MIS FUNCIONES EL/ LA SR/ SRA:'],
      [65, 427, 'Nº TOTAL DÍAS:'], [198, 427, 'Nº DÍAS SOLICITADOS'], [376, 427, 'SALDO PENDIENTE'],
      [64, 736, 'TALCAHUANO:'],
      ...f.rotulos,
    ],
    campos: {
      nombre: [174.4, 565.8, 141.2], rut: [92.7, 566.6, 167.9], cargo: [103.6, 563.8, 198.1],
      indefinido: [224, 293.2, 229.4], plazo: [364.4, 421.3, 229.4], reemplazo: [489.8, 565.9, 229.4],
      cesfam: [109.6, 565.3, 261.6],
      dias: [119.2, 157.6, 294.9], conGoce: [397.5, 434.2, 294.9], sinGoce: [456.2, 484.9, 294.9],
      am: [398, 434.1, 318.9], pm: [458.3, 489.2, 318.9],
      desde: [107.5, 202.5, 350.2], hasta: [247.9, 366.4, 350.2],
      reemplazante: [384, 561.8, 378.5],
      total: [144.9, 195.2, 438], solicitados: [312.8, 372.7, 438], saldo: [474.7, 561.5, 438],
      ciudad: [139.3, 315.6, 747],
    },
    marcas: ['indefinido', 'plazo', 'reemplazo', 'dias', 'conGoce', 'sinGoce', 'am', 'pm', 'total', 'solicitados', 'saldo'],
    lineas: [[63.7, 563.7, 401.9], ...f.lineas],
  };
})();

const FERIADO = (() => {
  const f = firmas(591, 682, 601, 695);
  return {
    titulo: 'SOLICITUD DE FERIADO LEGAL',
    marco: [21.7, 34.6, 590.2, 881.3], encabezadoY: 14.5, tituloY: 77,
    observacionY: 792, pieY: 855,
    rotulos: [
      [63, 128, 'NOMBRE COMPLETO:'],
      [63, 154, 'R.U.T:'], [349, 157, 'JORNADA:'], [488, 157, 'HRS.'],
      [63, 193, 'CARGO:'],
      [64, 225, 'TIPO CONTRATO: INDEFINIDO'], [296, 225, 'PLAZO FIJO'], [424, 225, 'REEMPLAZO'],
      [64, 257, 'CESFAM:'],
      [63, 289, 'VENGO A SOLICITAR :'], [228, 289, 'DÍAS ( S) DE FERIADO LEGAL, DESDE EL DÍA'],
      [63, 318, 'HASTA EL DÍA :'], [258, 318, 'CORRESPONDIENTE AL AÑO CALENDARIO'],
      [64, 346, 'EN MI AUSENCIA REALIZARA MIS FUNCIONES EL/ LA SR/ SRA:'],
      [64, 421, 'Nº DE TOTAL DÍAS:'], [324, 424, 'PERIODO ACUMULADO:'], [472, 424, 'SI'],
      [63, 439, 'Nº DÍAS SOLICITADOS:'], [324, 443, 'PERIODO :'], [473, 443, '20'],
      [61, 457, 'SALDO PENDIENTE:'],
      [64, 730, 'TALCAHUANO:'],
      ...f.rotulos,
    ],
    campos: {
      nombre: [174, 566, 138.5], rut: [93, 302, 165.5], jornada: [401, 485, 168.5], cargo: [104, 564, 204.5],
      indefinido: [224, 293, 235.5], plazo: [364, 421, 235.5], reemplazo: [490, 566, 235.5],
      cesfam: [110, 565, 268.5],
      dias: [175, 225, 300.5], desde: [463, 567, 300.5],
      hasta: [141, 256, 328.5], anioCalendario: [475, 564, 328.5],
      reemplazante: [384, 567, 357.5],
      total: [187, 247, 431.5], acumulado: [505, 565, 434.5],
      solicitados: [190, 248, 450.5], periodo: [399, 459, 453.5], periodo2: [489, 564, 453.5],
      saldo: [187, 247, 468.5],
      ciudad: [139, 316, 741.5],
    },
    marcas: ['indefinido', 'plazo', 'reemplazo', 'dias', 'jornada', 'total', 'acumulado', 'solicitados', 'periodo', 'periodo2', 'saldo'],
    lineas: [[64, 564, 371], ...f.lineas],
  };
})();

const CAPACITACION = (() => {
  const f = firmas(586, 677, 605, 687, 2);
  return {
    titulo: 'SOLICITUD PERMISO DE CAPACITACIÓN',
    marco: [23.8, 29.0, 592.3, 875.7], encabezadoY: 9, tituloY: 97,
    observacionY: 807, pieY: 864,
    rotulos: [
      [65, 148, 'NOMBRE COMPLETO:'],
      [65, 175, 'R.U.T:'], [351, 178, 'JORNADA:'], [490, 178, 'HRS.'],
      [65, 214, 'CARGO:'],
      [66, 245, 'TIPO CONTRATO: INDEFINIDO'], [298, 245, 'PLAZO FIJO'], [426, 245, 'REEMPLAZO'],
      [66, 277, 'CESFAM:'],
      [65, 310, 'SOLICITO:'], [179, 310, 'DÍA (S) DE PERMISO DE CAPACITACIÓN CON GOCE DE'],
      [65, 334, 'REMUNERACIONES DESDE:'], [276, 334, 'HASTA:'],
      [64, 378, 'NOMBRE O ACTIVIDAD DE CAPACITACIÓN:'],
      [66, 473, 'Nº DE TOTAL DÍAS:'],
      [65, 492, 'Nº DÍAS SOLICITADOS:'],
      [63, 510, 'SALDO PENDIENTE:'],
      [66, 745, 'TALCAHUANO:'],
      ...f.rotulos,
    ],
    campos: {
      nombre: [177, 568, 159.5], rut: [95, 304, 185.5], jornada: [403, 487, 189.5], cargo: [106, 566, 225.5],
      indefinido: [226, 295, 256.5], plazo: [366, 423, 256.5], reemplazo: [492, 568, 256.5],
      cesfam: [112, 567, 288.5],
      dias: [120, 177, 320.5],
      desde: [209, 273, 345.5], hasta: [315, 409, 345.5],
      actividad: [289, 563, 389.5], actividad2: [64, 563, 409.5],
      solicitados: [192, 250, 503], saldo: [189, 249, 521.5],
      ciudad: [141, 318, 756.5],
    },
    marcas: ['indefinido', 'plazo', 'reemplazo', 'dias', 'jornada', 'solicitados', 'saldo'],
    valoresLibres: [[178, 473, 'total']],
    // La actividad continúa en una segunda línea solo si no cabe en la primera
    opcionales: ['actividad2'],
    lineas: f.lineas,
  };
})();

// ─── Builders públicos ───────────────────────────────────────────────────────

export function construirFormatoAdministrativo(solicitud, funcionario, saldoInfo = {}, folio) {
  const v = valoresBase(solicitud, funcionario, saldoInfo);
  const jornada = solicitud.jornada_medio_dia;
  const sinGoce = (solicitud.tipo_nombre || '').toLowerCase().includes('sin goce');
  return dibujarFormato(ADMINISTRATIVO, {
    ...v,
    conGoce: sinGoce ? '' : 'X',
    sinGoce: sinGoce ? 'X' : '',
    am: jornada === 'AM' ? 'X' : '',
    pm: jornada === 'PM' ? 'X' : '',
  }, folio);
}

export function construirFormatoFeriado(solicitud, funcionario, saldoInfo = {}, folio) {
  const v = valoresBase(solicitud, funcionario, saldoInfo);
  const anio = anioDe(solicitud.fecha_inicio);
  const usaArrastre = Number(solicitud.dias_arrastre) > 0 || saldoInfo.usa_arrastre === true;
  const usaActual = Number(solicitud.dias_periodo_actual ?? solicitud.dias_solicitados) > 0;
  // Período al que se imputan los días: el arrastre corresponde al año anterior
  const periodoBase = usaArrastre ? anio - 1 : anio;
  return dibujarFormato(FERIADO, {
    ...v,
    anioCalendario: String(usaArrastre && !usaActual ? anio - 1 : anio),
    acumulado: usaArrastre ? 'X' : 'NO',
    periodo: String(periodoBase),
    periodo2: usaArrastre && usaActual ? String(anio).slice(2) : '—',
  }, folio);
}

export function construirFormatoCapacitacion(solicitud, funcionario, saldoInfo = {}, folio) {
  const v = valoresBase(solicitud, funcionario, saldoInfo);
  // El nombre de la actividad se registra en el campo "motivo" de la solicitud;
  // si es largo continúa en la línea siguiente.
  const doc = new jsPDF({ unit: 'pt', format: PAGINA });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const actividad = (solicitud.motivo || '').trim();
  const [linea1 = '', ...resto] = actividad ? doc.splitTextToSize(actividad, 270) : [];
  return dibujarFormato(CAPACITACION, {
    ...v,
    total: v.total ? v.total.padStart(2, '0') : '',
    actividad: linea1,
    actividad2: resto.join(' '),
  }, folio);
}
