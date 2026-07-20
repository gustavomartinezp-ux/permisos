const ExcelJS = require('exceljs');

const COLOR_HEADER = 'FF1E3A5F';
const COLOR_SUBHEADER = 'FF2B5278';
const COLOR_TABLE_HEADER = 'FF3B6B9E';
const COLOR_ZEBRA = 'FFF2F7FB';

function columnaLetra(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function autoAjustarColumnas(ws, minWidth = 9, maxWidth = 42) {
  ws.columns.forEach((col) => {
    let max = minWidth;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, maxWidth);
  });
}

const NUMFMT = {
  fecha: 'yyyy-mm-dd',
  moneda: '$#,##0',
  porcentaje: '0.0%',
  entero: '0',
};

// Genera un workbook de dos pestañas: "Resumen Ejecutivo" (KPIs) y
// "Detalle de Datos" (listado con formato profesional + fila de totales
// con fórmulas reales de Excel). No incluye gráfico embebido: ExcelJS no
// soporta de forma confiable la API de charts nativos del formato xlsx;
// en su lugar el resumen deja los datos ya tabulados para que Excel/Sheets
// arme el gráfico en un clic (Insertar > Gráfico recomendado).
async function generarExcelEjecutivo({ titulo, subtitulo, kpis = [], columnas, filas, totalesKeys = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CESFAM Los Cerros';
  wb.created = new Date();

  // ── Hoja 1: Resumen Ejecutivo ──
  const wsR = wb.addWorksheet('Resumen Ejecutivo');
  wsR.mergeCells('A1:D1');
  const t1 = wsR.getCell('A1');
  t1.value = `CESFAM LOS CERROS — ${titulo}`;
  t1.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER } };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  wsR.getRow(1).height = 32;

  wsR.mergeCells('A2:D2');
  const t2 = wsR.getCell('A2');
  t2.value = subtitulo;
  t2.font = { italic: true, size: 10, color: { argb: 'FFFFFFFF' } };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SUBHEADER } };
  t2.alignment = { horizontal: 'center' };
  wsR.getRow(2).height = 18;

  let row = 4;
  const hdrKpi = wsR.getRow(row);
  hdrKpi.getCell(1).value = 'Indicador';
  hdrKpi.getCell(2).value = 'Valor';
  hdrKpi.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLE_HEADER } };
  });
  row += 1;

  kpis.forEach((kpi) => {
    const cLabel = wsR.getCell(`A${row}`);
    const cValor = wsR.getCell(`B${row}`);
    cLabel.value = kpi.label;
    cLabel.font = { color: { argb: 'FF444444' } };
    cValor.value = kpi.valorNumerico ?? kpi.valor;
    cValor.font = { bold: true, size: 13, color: { argb: COLOR_HEADER } };
    if (kpi.formato && NUMFMT[kpi.formato]) cValor.numFmt = NUMFMT[kpi.formato];
    row += 1;
  });
  wsR.getColumn(1).width = 26;
  wsR.getColumn(2).width = 16;

  // ── Hoja 2: Detalle de Datos ──
  const wsD = wb.addWorksheet('Detalle de Datos', { views: [{ state: 'frozen', ySplit: 1 }] });
  const hdr = wsD.addRow(columnas.map((c) => c.header));
  hdr.height = 20;
  hdr.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TABLE_HEADER } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  filas.forEach((fila, idx) => {
    const r = wsD.addRow(columnas.map((c) => fila[c.key]));
    columnas.forEach((c, i) => {
      if (c.formato && NUMFMT[c.formato]) r.getCell(i + 1).numFmt = NUMFMT[c.formato];
    });
    if (idx % 2 === 0) {
      r.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ZEBRA } }; });
    }
  });

  if (totalesKeys.length && filas.length) {
    const firstDataRow = 2;
    const lastDataRow = 1 + filas.length;
    const totalRow = wsD.addRow(columnas.map((c, i) => (i === 0 ? 'TOTAL' : '')));
    columnas.forEach((c, i) => {
      if (totalesKeys.includes(c.key)) {
        const col = columnaLetra(i + 1);
        totalRow.getCell(i + 1).value = { formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})` };
      }
    });
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.border = { top: { style: 'medium', color: { argb: COLOR_HEADER.replace('FF', 'FF') } } };
    });
  }

  wsD.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  autoAjustarColumnas(wsD);

  return wb.xlsx.writeBuffer();
}

module.exports = { generarExcelEjecutivo };
