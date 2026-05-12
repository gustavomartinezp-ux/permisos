import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const COLOR_PRIMARIO  = [30, 64, 175];   // brand blue
const COLOR_GRIS      = [100, 116, 139];
const COLOR_FONDO     = [248, 250, 252];
const COLOR_AMBER     = [180, 120, 10];
const COLOR_VERDE     = [21, 128, 61];
const COLOR_ROJO      = [185, 28, 28];

function fmt(fechaStr) {
  if (!fechaStr) return '—';
  try { return format(parseISO(String(fechaStr).split('T')[0]), 'd MMM yyyy', { locale: es }); }
  catch { return String(fechaStr).split('T')[0]; }
}

function estadoColor(estado) {
  if (estado === 'aprobado')  return COLOR_VERDE;
  if (estado === 'rechazado') return COLOR_ROJO;
  return COLOR_AMBER;
}

function construirReporte(funcionario, solicitudes = []) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto  = doc.internal.pageSize.getHeight();
  const margen = 15;
  let y = margen;

  // ── Encabezado ──────────────────────────────────────────────────────────────
  doc.setFillColor(...COLOR_PRIMARIO);
  doc.rect(0, 0, ancho, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CESFAM LOS CERROS', margen, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema de Gestión de Permisos — Reporte de Funcionario', margen, 17);

  doc.setFontSize(8);
  doc.text(`Generado: ${format(new Date(), "d 'de' MMMM yyyy, HH:mm", { locale: es })}`, margen, 23);

  // Año en la esquina
  const anioLabel = `Año ${new Date().getFullYear()}`;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(anioLabel, ancho - margen, 17, { align: 'right' });

  y = 35;

  // ── Datos del funcionario ───────────────────────────────────────────────────
  doc.setFillColor(...COLOR_FONDO);
  doc.roundedRect(margen, y, ancho - margen * 2, 40, 2, 2, 'F');
  doc.setDrawColor(220, 225, 235);
  doc.roundedRect(margen, y, ancho - margen * 2, 40, 2, 2, 'S');

  doc.setTextColor(...COLOR_PRIMARIO);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`${funcionario.nombres} ${funcionario.apellidos}`, margen + 4, y + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR_GRIS);

  const col1 = margen + 4;
  const col2 = ancho / 2 + 5;

  const infoIzq = [
    ['RUT',     funcionario.rut || '—'],
    ['Cargo',   funcionario.cargo || '—'],
    ['Servicio',funcionario.servicio || '—'],
  ];
  const infoDer = [
    ['Contrato',  funcionario.tipo_contrato || '—'],
    ['Horas/sem', funcionario.horas_contrato ? `${funcionario.horas_contrato} hrs` : '—'],
    ['Ingreso',   fmt(funcionario.fecha_ingreso)],
  ];

  infoIzq.forEach(([lbl, val], i) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${lbl}:`, col1, y + 16 + i * 7);
    doc.setFont('helvetica', 'normal');
    doc.text(val, col1 + 22, y + 16 + i * 7);
  });
  infoDer.forEach(([lbl, val], i) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${lbl}:`, col2, y + 16 + i * 7);
    doc.setFont('helvetica', 'normal');
    doc.text(val, col2 + 24, y + 16 + i * 7);
  });

  if (funcionario.dispositivo) {
    doc.setFont('helvetica', 'bold');
    doc.text('Establecimiento:', col1, y + 37);
    doc.setFont('helvetica', 'normal');
    doc.text(funcionario.dispositivo, col1 + 38, y + 37);
  }

  y += 48;

  // ── Saldos ──────────────────────────────────────────────────────────────────
  doc.setTextColor(...COLOR_PRIMARIO);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SALDOS DE PERMISOS', margen, y);
  doc.setDrawColor(...COLOR_PRIMARIO);
  doc.setLineWidth(0.5);
  doc.line(margen, y + 1.5, ancho - margen, y + 1.5);
  y += 6;

  const saldos = funcionario.saldos || [];

  const headSaldos = [['Tipo de Permiso', 'Asignados', 'Usados', 'Pendientes', 'Disponibles', 'Arrastre', 'Total']];
  const bodySaldos = saldos.map(s => {
    const disp = s.dias_asignados - s.dias_usados - (s.dias_pendientes || 0);
    const arr  = s.es_feriado_legal
      ? Math.max((s.saldo_arrastre || 0) - (s.arrastre_usados || 0) - (s.arrastre_pendientes || 0), 0)
      : null;
    const total = arr !== null ? disp + arr : disp;
    return [
      s.tipo_nombre + (s.es_feriado_legal ? ' ★' : ''),
      s.dias_asignados,
      s.dias_usados,
      s.dias_pendientes || 0,
      disp,
      arr !== null ? arr : '—',
      total,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: headSaldos,
    body: bodySaldos,
    margin: { left: margen, right: margen },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: {
      fillColor: COLOR_PRIMARIO,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'left',   cellWidth: 60 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 18 },
      6: { halign: 'center', cellWidth: 18 },
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 4) {
        const val = parseInt(data.cell.raw);
        if (!isNaN(val) && val <= 1) data.cell.styles.textColor = COLOR_ROJO;
        else if (!isNaN(val) && val <= 3) data.cell.styles.textColor = COLOR_AMBER;
        else data.cell.styles.textColor = COLOR_VERDE;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    foot: [['★ Tipo con reglas de Feriado Legal (arrastre + bloque 10 días)', '', '', '', '', '', '']],
    footStyles: { fontSize: 7, textColor: COLOR_GRIS, fillColor: [255, 255, 255] },
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── Solicitudes ─────────────────────────────────────────────────────────────
  // Salto de página si no cabe bien
  if (y > alto - 70) {
    doc.addPage();
    y = margen;
  }

  doc.setTextColor(...COLOR_PRIMARIO);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE SOLICITUDES', margen, y);
  doc.setDrawColor(...COLOR_PRIMARIO);
  doc.setLineWidth(0.5);
  doc.line(margen, y + 1.5, ancho - margen, y + 1.5);
  y += 6;

  if (solicitudes.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...COLOR_GRIS);
    doc.text('Sin solicitudes registradas para este período.', margen, y + 6);
    y += 16;
  } else {
    const headSols = [['Tipo', 'Fecha Inicio', 'Fecha Fin', 'Días', 'Arrastre', 'Período\nActual', 'Estado', 'Motivo']];
    const bodySols = solicitudes.map(sol => [
      sol.tipo_nombre || '—',
      fmt(sol.fecha_inicio),
      fmt(sol.fecha_fin),
      sol.dias_solicitados,
      sol.dias_arrastre > 0 ? sol.dias_arrastre : '—',
      sol.dias_periodo_actual > 0 ? sol.dias_periodo_actual : '—',
      (sol.estado || '').toUpperCase(),
      sol.motivo || '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: headSols,
      body: bodySols,
      margin: { left: margen, right: margen },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: COLOR_PRIMARIO,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 36, halign: 'left' },
        1: { cellWidth: 24, halign: 'center' },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 16, halign: 'center' },
        6: { cellWidth: 20, halign: 'center' },
        7: { cellWidth: 'auto', halign: 'left' },
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 6) {
          const estado = String(data.cell.raw).toLowerCase();
          data.cell.styles.textColor = estadoColor(estado);
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    y = doc.lastAutoTable.finalY + 6;
  }

  // ── Resumen de feriado legal ─────────────────────────────────────────────────
  const saldoFL = saldos.find(s => s.es_feriado_legal);
  if (saldoFL) {
    if (y > alto - 50) { doc.addPage(); y = margen; }

    doc.setTextColor(...COLOR_PRIMARIO);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN FERIADO LEGAL', margen, y);
    doc.setDrawColor(...COLOR_PRIMARIO);
    doc.line(margen, y + 1.5, ancho - margen, y + 1.5);
    y += 7;

    const dispAct = saldoFL.dias_asignados - saldoFL.dias_usados - (saldoFL.dias_pendientes || 0);
    const arrDisp = Math.max((saldoFL.saldo_arrastre || 0) - (saldoFL.arrastre_usados || 0) - (saldoFL.arrastre_pendientes || 0), 0);
    const maxParc = Math.max((saldoFL.dias_asignados || 0) - 10, 0);
    const parcUsados = saldoFL.dias_parciales_usados || 0;

    const filas = [
      ['Días período actual asignados',    saldoFL.dias_asignados],
      ['Días período actual disponibles',  dispAct],
      ['Días arrastre (año anterior)',      saldoFL.saldo_arrastre || 0],
      ['Días arrastre disponibles',         arrDisp],
      ['Total disponible',                  dispAct + arrDisp],
      ['Máximo días parcializables',        maxParc],
      ['Días parcializados ya utilizados',  parcUsados],
      ['Días parcializables restantes',     Math.max(maxParc - parcUsados, 0)],
      ['Bloque 10 días consecutivos',       saldoFL.bloque_10_dias_cumplido ? 'CUMPLIDO' : 'PENDIENTE'],
    ];

    autoTable(doc, {
      startY: y,
      body: filas,
      margin: { left: margen, right: margen },
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 90, textColor: COLOR_GRIS },
        1: { halign: 'center', cellWidth: 40 },
      },
      theme: 'plain',
      alternateRowStyles: { fillColor: [245, 247, 250] },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 1) {
          const val = data.cell.raw;
          if (val === 'CUMPLIDO') { data.cell.styles.textColor = COLOR_VERDE; data.cell.styles.fontStyle = 'bold'; }
          if (val === 'PENDIENTE') { data.cell.styles.textColor = COLOR_ROJO; data.cell.styles.fontStyle = 'bold'; }
          if (data.row.index === 4) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fontSize = 10; }
        }
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── Pie de página en todas las páginas ───────────────────────────────────────
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFillColor(240, 242, 247);
    doc.rect(0, alto - 10, ancho, 10, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_GRIS);
    doc.setFont('helvetica', 'normal');
    doc.text('CESFAM Los Cerros — Sistema de Gestión de Permisos — Documento confidencial', margen, alto - 4);
    doc.text(`Página ${i} de ${totalPaginas}`, ancho - margen, alto - 4, { align: 'right' });
  }

  return doc;
}

export function generarReporteFuncionario(funcionario, solicitudes = []) {
  const doc = construirReporte(funcionario, solicitudes);
  const nombre = `reporte_${funcionario.apellidos}_${funcionario.nombres}_${new Date().getFullYear()}.pdf`
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\.]/g, '');
  doc.save(nombre);
}

export function imprimirReporteFuncionario(funcionario, solicitudes = []) {
  const doc = construirReporte(funcionario, solicitudes);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}
