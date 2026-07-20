const PDFDocument = require('pdfkit');

const COLOR_PRIMARIO = '#1E3A5F';
const COLOR_SECUNDARIO = '#3B6B9E';
const COLOR_ZEBRA = '#F2F7FB';
const COLOR_TEXTO = '#333333';

function formatCelda(v) {
  if (v instanceof Date) return v.toLocaleDateString('es-CL');
  return String(v ?? '');
}

// Genera un PDF ejecutivo: encabezado institucional, KPIs destacados,
// tabla de datos con zebra striping y pie de página con numeración real
// (paginación calculada en una segunda pasada vía bufferPages).
function generarPdfEjecutivo({ titulo, filtrosTexto, kpis = [], columnas, filas, generadoPor = '' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const marginLeft = doc.page.margins.left;
    const footerY = doc.page.height - 34;

    function dibujarHeader() {
      doc.rect(0, 0, doc.page.width, 68).fill(COLOR_PRIMARIO);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(15)
        .text('CESFAM LOS CERROS', marginLeft, 16);
      doc.font('Helvetica').fontSize(10).text(titulo, marginLeft, 36);
      doc.fontSize(7.5).fillColor('#D7E3F0')
        .text(`Generado: ${new Date().toLocaleString('es-CL')}  ·  Por: ${generadoPor}`, marginLeft, 52);
    }

    function dibujarEncabezadoTabla(yPos, scaledWidths) {
      doc.rect(marginLeft, yPos, pageWidth, 20).fill(COLOR_SECUNDARIO);
      let x = marginLeft;
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      columnas.forEach((c, i) => {
        doc.text(c.header, x + 4, yPos + 6, { width: scaledWidths[i] - 8, height: 12, ellipsis: true });
        x += scaledWidths[i];
      });
      return yPos + 20;
    }

    dibujarHeader();
    let y = 82;

    if (filtrosTexto) {
      doc.fillColor('#666666').fontSize(8.5).font('Helvetica-Oblique')
        .text(`Filtros aplicados: ${filtrosTexto}`, marginLeft, y, { width: pageWidth });
      y += 18;
    }

    // ── KPI Cards ──
    if (kpis.length) {
      const gap = 10;
      const kpiWidth = (pageWidth - (kpis.length - 1) * gap) / kpis.length;
      const kpiHeight = 52;
      kpis.forEach((kpi, i) => {
        const x = marginLeft + i * (kpiWidth + gap);
        doc.roundedRect(x, y, kpiWidth, kpiHeight, 6).fill(COLOR_ZEBRA);
        doc.fillColor(COLOR_PRIMARIO).font('Helvetica-Bold').fontSize(17)
          .text(kpi.valor, x + 10, y + 8, { width: kpiWidth - 20, height: 20, ellipsis: true });
        doc.fillColor('#666666').font('Helvetica').fontSize(7.5)
          .text(kpi.label, x + 10, y + 30, { width: kpiWidth - 20 });
      });
      y += kpiHeight + 18;
    }

    // ── Tabla ──
    const colWidths = columnas.map((c) => c.width || 80);
    const totalColsWidth = colWidths.reduce((a, b) => a + b, 0);
    const scale = pageWidth / totalColsWidth;
    const scaledWidths = colWidths.map((w) => w * scale);

    y = dibujarEncabezadoTabla(y, scaledWidths);

    const rowHeight = 16;
    filas.forEach((fila, idx) => {
      if (y + rowHeight > doc.page.height - 50) {
        doc.addPage();
        dibujarHeader();
        y = dibujarEncabezadoTabla(82, scaledWidths);
      }
      if (idx % 2 === 0) {
        doc.rect(marginLeft, y, pageWidth, rowHeight).fill(COLOR_ZEBRA);
      }
      let x = marginLeft;
      doc.fillColor(COLOR_TEXTO).font('Helvetica').fontSize(7.5);
      columnas.forEach((c, i) => {
        doc.text(formatCelda(fila[c.key]), x + 4, y + 4, {
          width: scaledWidths[i] - 8, height: rowHeight - 6, ellipsis: true,
        });
        x += scaledWidths[i];
      });
      y += rowHeight;
    });

    if (!filas.length) {
      doc.fillColor('#999999').fontSize(9).text('Sin datos para los filtros aplicados.', marginLeft, y + 10);
    }

    // ── Pie de página con numeración real (Página X de Y) ──
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor('#999999').font('Helvetica').text(
        `Página ${i - range.start + 1} de ${range.count}   ·   CESFAM Los Cerros — Documento confidencial de uso interno`,
        marginLeft, footerY, { width: pageWidth, align: 'center' }
      );
    }

    doc.end();
  });
}

module.exports = { generarPdfEjecutivo };
