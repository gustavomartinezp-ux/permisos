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

// ─────────────────────────────────────────────────────────────────────────────
// Formato oficial de solicitud de permiso (para imprimir / firmar)
// ─────────────────────────────────────────────────────────────────────────────

function construirFormatoPermiso(solicitud, funcionario) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto  = doc.internal.pageSize.getHeight();
  const margen = 18;
  const anchoUtil = ancho - margen * 2;

  // ── Borde exterior ──────────────────────────────────────────────────────────
  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(0.8);
  doc.rect(margen - 4, 10, anchoUtil + 8, alto - 20);

  // ── Encabezado ──────────────────────────────────────────────────────────────
  doc.setFillColor(...COLOR_PRIMARIO);
  doc.rect(margen - 4, 10, anchoUtil + 8, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('CESFAM LOS CERROS', ancho / 2, 22, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('SOLICITUD DE PERMISO ADMINISTRATIVO', ancho / 2, 30, { align: 'center' });

  doc.setFontSize(8);
  const fechaSolicitud = solicitud.fecha_solicitud
    ? format(parseISO(String(solicitud.fecha_solicitud).split('T')[0]), "d 'de' MMMM 'de' yyyy", { locale: es })
    : format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  doc.text(`Fecha: ${fechaSolicitud}`, ancho / 2, 38, { align: 'center' });

  // Número de solicitud (esquina superior derecha del encabezado)
  if (solicitud.id) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`N° ${String(solicitud.id).padStart(5, '0')}`, ancho - margen - 2, 18, { align: 'right' });
  }

  let y = 52;

  // ── Sección: Datos del funcionario ─────────────────────────────────────────
  doc.setFillColor(235, 240, 255);
  doc.rect(margen - 4, y - 5, anchoUtil + 8, 7, 'F');
  doc.setTextColor(...COLOR_PRIMARIO);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL FUNCIONARIO/A', margen, y);
  y += 7;

  const drawCampo = (label, valor, x, yPos, labelW = 30, totalW = 80) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_GRIS);
    doc.text(label + ':', x, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 20);
    doc.text(valor || '—', x + labelW, yPos);
    doc.setDrawColor(180, 190, 210);
    doc.setLineWidth(0.3);
    doc.line(x + labelW, yPos + 0.8, x + totalW, yPos + 0.8);
  };

  drawCampo('Nombre completo', `${funcionario.nombres || ''} ${funcionario.apellidos || ''}`, margen, y, 36, anchoUtil);
  y += 9;
  drawCampo('RUT', funcionario.rut || '—', margen, y, 18, 65);
  drawCampo('Cargo', funcionario.cargo || '—', margen + 70, y, 16, anchoUtil - 70);
  y += 9;
  drawCampo('Servicio / Unidad', funcionario.servicio || '—', margen, y, 36, anchoUtil * 0.55);
  drawCampo('Contrato', funcionario.tipo_contrato || '—', margen + anchoUtil * 0.6, y, 22, anchoUtil * 0.4);
  y += 14;

  // ── Sección: Datos del permiso ─────────────────────────────────────────────
  doc.setFillColor(235, 240, 255);
  doc.rect(margen - 4, y - 5, anchoUtil + 8, 7, 'F');
  doc.setTextColor(...COLOR_PRIMARIO);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL PERMISO SOLICITADO', margen, y);
  y += 7;

  drawCampo('Tipo de permiso', solicitud.tipo_nombre || '—', margen, y, 36, anchoUtil);
  y += 10;

  const fechaInicio = fmt(solicitud.fecha_inicio);
  const fechaFin    = fmt(solicitud.fecha_fin);
  const diasLabel   = solicitud.dias_solicitados === 0.5 ? '0.5 (medio día)' : String(solicitud.dias_solicitados);

  drawCampo('Fecha de inicio', fechaInicio, margen, y, 30, 70);
  drawCampo('Fecha de término', fechaFin, margen + 75, y, 33, 75);
  y += 10;
  drawCampo('N° de días hábiles', diasLabel, margen, y, 36, 65);

  // Jornada (checkboxes visuales)
  const xJorn = margen + 75;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_GRIS);
  doc.text('Jornada:', xJorn, y);
  const jornada = solicitud.jornada_medio_dia;
  const opciones = [
    { label: 'AM', activo: jornada === 'AM' },
    { label: 'PM', activo: jornada === 'PM' },
    { label: 'Día completo', activo: !jornada },
  ];
  let xOp = xJorn + 22;
  opciones.forEach(({ label, activo }) => {
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.5);
    doc.rect(xOp, y - 3.5, 4, 4);
    if (activo) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLOR_PRIMARIO);
      doc.text('✓', xOp + 0.5, y - 0.2);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(20, 20, 20);
    doc.text(label, xOp + 5.5, y);
    xOp += label.length * 2.2 + 12;
  });

  y += 10;

  // Horario si es medio día
  if (jornada && solicitud.fecha_inicio) {
    const dow = new Date(solicitud.fecha_inicio + 'T12:00:00').getDay();
    const horario = jornada === 'AM'
      ? (dow === 5 ? '08:00 – 12:00 hrs' : '08:00 – 12:30 hrs')
      : (dow === 5 ? '12:00 – 16:00 hrs' : '12:30 – 17:00 hrs');
    drawCampo('Horario', horario, margen, y, 20, 80);
    y += 10;
  }

  // Motivo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_GRIS);
  doc.text('Motivo:', margen, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 20, 20);

  const motivoTexto = solicitud.motivo || '';
  const motivoLineas = doc.splitTextToSize(motivoTexto || '(sin especificar)', anchoUtil - 20);
  doc.text(motivoLineas, margen + 20, y);
  doc.setDrawColor(180, 190, 210);
  doc.setLineWidth(0.3);
  for (let li = 0; li < Math.max(motivoLineas.length, 3); li++) {
    doc.line(margen + 20, y + 0.8 + li * 5.5, margen + anchoUtil, y + 0.8 + li * 5.5);
  }
  y += Math.max(motivoLineas.length, 3) * 5.5 + 5;

  // Distribución arrastre si aplica
  if (solicitud.dias_arrastre > 0 || solicitud.dias_periodo_actual > 0) {
    doc.setFillColor(254, 252, 232);
    doc.roundedRect(margen - 4, y - 3, anchoUtil + 8, 12, 1, 1, 'F');
    doc.setDrawColor(202, 138, 4);
    doc.setLineWidth(0.4);
    doc.roundedRect(margen - 4, y - 3, anchoUtil + 8, 12, 1, 1, 'S');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 80, 0);
    doc.text('Distribución Feriado Legal:', margen, y + 3);
    doc.setFont('helvetica', 'normal');
    const partes = [];
    if (solicitud.dias_arrastre > 0) partes.push(`${solicitud.dias_arrastre} día(s) de arrastre`);
    if (solicitud.dias_periodo_actual > 0) partes.push(`${solicitud.dias_periodo_actual} día(s) período actual`);
    doc.text(partes.join(' + '), margen + 50, y + 3);
    y += 17;
  }

  y += 5;

  // ── Sección: Firmas ─────────────────────────────────────────────────────────
  if (y > alto - 75) { y = alto - 75; }

  doc.setFillColor(235, 240, 255);
  doc.rect(margen - 4, y - 5, anchoUtil + 8, 7, 'F');
  doc.setTextColor(...COLOR_PRIMARIO);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('VISACIONES Y FIRMAS', margen, y);
  y += 8;

  const firmas = [
    { titulo: 'Funcionario/a',    nombre: `${funcionario.nombres || ''} ${funcionario.apellidos || ''}` },
    { titulo: 'Jefe/a Directo/a', nombre: '' },
    { titulo: 'Director/a',       nombre: '' },
  ];

  const anchoFirma = anchoUtil / firmas.length;
  firmas.forEach((firma, i) => {
    const xF = margen + i * anchoFirma;
    const lineaFirma = y + 20;

    doc.setDrawColor(80, 80, 120);
    doc.setLineWidth(0.5);
    doc.line(xF + 4, lineaFirma, xF + anchoFirma - 4, lineaFirma);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_PRIMARIO);
    doc.text(firma.titulo, xF + anchoFirma / 2, lineaFirma + 5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(50, 50, 50);
    if (firma.nombre) {
      doc.text(firma.nombre, xF + anchoFirma / 2, lineaFirma + 10, { align: 'center' });
    }

    doc.setTextColor(...COLOR_GRIS);
    doc.setFontSize(7);
    doc.text('Nombre y firma', xF + anchoFirma / 2, lineaFirma + 15, { align: 'center' });

    doc.setDrawColor(200, 205, 220);
    doc.setLineWidth(0.3);
    doc.line(xF + 4, lineaFirma + 22, xF + anchoFirma - 4, lineaFirma + 22);
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_GRIS);
    doc.text('Fecha', xF + anchoFirma / 2, lineaFirma + 27, { align: 'center' });
  });

  y += 38;

  // ── Pie de página ───────────────────────────────────────────────────────────
  doc.setFillColor(240, 242, 247);
  doc.rect(margen - 4, alto - 15, anchoUtil + 8, 8, 'F');
  doc.setFontSize(6.5);
  doc.setTextColor(...COLOR_GRIS);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Documento generado por el Sistema de Gestión de Permisos — CESFAM Los Cerros — Confidencial',
    ancho / 2, alto - 10, { align: 'center' }
  );

  return doc;
}

export function descargarFormatoPermiso(solicitud, funcionario) {
  const doc = construirFormatoPermiso(solicitud, funcionario);
  const nombre = `permiso_${String(solicitud.id || 'nuevo').padStart(5, '0')}_${(funcionario.apellidos || 'funcionario').toLowerCase().replace(/\s+/g, '_')}.pdf`;
  doc.save(nombre);
}

export function imprimirFormatoPermiso(solicitud, funcionario) {
  const doc = construirFormatoPermiso(solicitud, funcionario);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}

// ═════════════════════════════════════════════════════════════════════════════
// FORMULARIOS OFICIALES INSTITUCIONALES — DISAM / DAS TALCAHUANO
// ═════════════════════════════════════════════════════════════════════════════

const TIPOS_ESPECIALES = [
  { keywords: ['fallecimiento hijo', 'hijo fallec', 'hijo (10'], label: 'FALLECIMIENTO HIJO*', nota: '(10 días corridos desde el día del fallecimiento) Art. 108 bis Ley 18.883' },
  { keywords: ['gestacion', 'gestación', 'en gestacion', 'en gestación'], label: 'FALLECIMIENTO HIJO EN GESTACION*', nota: '(7 días hábiles desde el día del fallecimiento certificado) Art. 108 bis Ley 18.883' },
  { keywords: ['conyuge', 'cónyuge', 'conviviente'], label: 'FALLECIMIENTO CONYUGE O CONVIVIENTE CIVIL*', nota: '(7 días corridos desde el día del fallecimiento) Art. 108 bis Ley 18.883' },
  { keywords: ['fallecimiento padre', 'fallecimiento madre', 'fallecimiento hermano', 'padre, madre', 'madre o hermano'], label: 'FALLECIMIENTO PADRE, MADRE O HERMANO*', nota: '(4 días hábiles desde el día del fallecimiento) Art. 108 Ley 18.883' },
  { keywords: ['nacimiento', 'adopcion', 'adopción'], label: 'NACIMIENTO O ADOPCION HIJO*', nota: '(5 días hábiles desde el día del parto o adopción) Art. 195 Cod del Trabajo' },
  { keywords: ['matrimonio', 'casamiento', 'union civil', 'unión civil'], label: 'CASAMIENTO O UNION CIVIL*', nota: '(5 días hábiles continuos en el día del matrimonio o del acuerdo de unión civil) Art. 207 bis Cod. del Trabajo' },
];

function detectarTipoFormulario(solicitud) {
  if (solicitud.es_feriado_legal) return 'feriado';
  const n = (solicitud.tipo_nombre || '').toLowerCase();
  if (n.includes('feriado')) return 'feriado';
  const especial = ['fallecimiento', 'nacimiento', 'matrimonio', 'adopcion', 'adopción', 'casamiento', 'union civil', 'unión civil', 'permiso especial'];
  if (especial.some(k => n.includes(k))) return 'especial';
  return 'administrativo';
}

function detectarSubtipoEspecial(tipo_nombre) {
  const n = (tipo_nombre || '').toLowerCase();
  for (const t of TIPOS_ESPECIALES) {
    if (t.keywords.some(k => n.includes(k))) return t;
  }
  return null;
}

function codigoDoc(solicitud) {
  const tipo = detectarTipoFormulario(solicitud);
  const prefix = tipo === 'feriado' ? 'FER' : tipo === 'especial' ? 'ESP' : 'PAD';
  const anio = solicitud.fecha_inicio ? String(solicitud.fecha_inicio).substring(0, 4) : new Date().getFullYear();
  return `${prefix}-${anio}-${String(solicitud.id || 0).padStart(5, '0')}`;
}

// Dibuja etiqueta + línea de subrayado con valor opcional
function campoLinea(doc, label, valor, x, y, finX) {
  const labelAncho = label ? doc.getTextWidth(label + (label.endsWith(':') ? '' : ':')) + 2 : 0;
  if (label) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(20, 20, 20);
    doc.text(label + (label.endsWith(':') ? '' : ':'), x, y);
  }
  const valorX = x + labelAncho;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  if (valor) doc.text(String(valor), valorX + 1, y);
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(valorX, y + 0.9, finX, y + 0.9);
}

// Dibuja casilla de verificación cuadrada
function casilla(doc, x, y, marcado, size = 3.5) {
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.4);
  doc.rect(x, y - size + 0.6, size, size);
  if (marcado) {
    doc.setFillColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text('X', x + 0.8, y - 0.2);
  }
}

// Encabezado institucional TALCAHUANO común a los tres formularios
function encabezadoInstitucional(doc, titulo, direccion, ancho, margen) {
  doc.setDrawColor(0);
  doc.setLineWidth(1);
  doc.line(margen, 8, ancho - margen, 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(0, 70, 170);
  doc.text('TALCAHUANO', ancho / 2, 21, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  doc.text(direccion, ancho / 2, 27, { align: 'center' });

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margen, 30, ancho - margen, 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(titulo, ancho / 2, 42, { align: 'center' });

  doc.setLineWidth(0.3);
  doc.line(margen, 46, ancho - margen, 46);

  return 56;
}

// Sección de firmas común a los tres formularios
function seccionFirmas(doc, ancho, margen, y) {
  const w = 52;
  const x1 = margen + 4;
  const x2 = (ancho - w) / 2;
  const x3 = ancho - margen - w - 4;

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(x1, y, x1 + w, y);
  doc.line(x3, y, x3 + w, y);
  doc.line(x2, y + 18, x2 + w, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text('FIRMA SOLICITANTE', x1 + w / 2, y + 5, { align: 'center' });
  doc.text('DIRECTOR(A) ESTABLECIMIENTO', x3 + w / 2, y + 5, { align: 'center' });
  doc.text('V°B° JEFE DIRECTO', x2 + w / 2, y + 23, { align: 'center' });

  return y + 32;
}

// Pie de página institucional
function pieInstitucional(doc, texto, ancho, alto, margen) {
  doc.setLineWidth(0.3);
  doc.setDrawColor(100, 100, 100);
  doc.line(margen, alto - 12, ancho - margen, alto - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(texto, ancho / 2, alto - 7, { align: 'center' });
}

// ─── Plantilla 1: Feriado Legal ──────────────────────────────────────────────
function construirFormularioFeriado(solicitud, funcionario, saldoInfo = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto  = doc.internal.pageSize.getHeight();
  const margen = 15;
  const derecho = ancho - margen;

  let y = encabezadoInstitucional(doc, 'SOLICITUD DE FERIADO LEGAL',
    'DISAM TALCAHUANO, Bulnes 266, Teléfono 413835700', ancho, margen);

  // Código único (esquina superior derecha)
  const codigo = codigoDoc(solicitud);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
  doc.text(codigo, derecho, 14, { align: 'right' });

  const nombre = `${funcionario.nombres || ''} ${funcionario.apellidos || ''}`.trim();
  campoLinea(doc, 'NOMBRE COMPLETO', nombre, margen, y, derecho);
  y += 9;

  // RUT + JORNADA HRS
  const xRutFin = margen + 68;
  campoLinea(doc, 'R.U.T.', funcionario.rut || '', margen, y, xRutFin);
  const xJ = xRutFin + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('JORNADA:', xJ, y);
  const xJVal = xJ + doc.getTextWidth('JORNADA:') + 2;
  campoLinea(doc, '', funcionario.horas_contrato ? String(funcionario.horas_contrato) : '', xJVal, y, xJVal + 14);
  doc.setFont('helvetica', 'bold');
  doc.text('HRS.', xJVal + 16, y);
  y += 9;

  campoLinea(doc, 'CARGO', funcionario.cargo || '', margen, y, derecho);
  y += 9;

  // Tipo contrato con casillas
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('TIPO CONTRATO:', margen, y);
  const contrato = (funcionario.tipo_contrato || '').toLowerCase();
  const opcionesContrato = [
    { label: 'INDEFINIDO', es: contrato.includes('indefinido') },
    { label: 'PLAZO FIJO:', es: contrato.includes('plazo') },
    { label: 'REEMPLAZO:', es: contrato.includes('reemplazo') },
  ];
  let xTc = margen + doc.getTextWidth('TIPO CONTRATO:') + 4;
  opcionesContrato.forEach(({ label, es }) => {
    casilla(doc, xTc, y, es);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
    doc.text(label, xTc + 5, y);
    const lw = doc.getTextWidth(label);
    campoLinea(doc, '', '', xTc + 5 + lw + 1, y, xTc + 5 + lw + 16);
    xTc += 5 + lw + 20;
  });
  y += 9;

  campoLinea(doc, 'CESFAM', funcionario.dispositivo || funcionario.cesfam || '', margen, y, derecho);
  y += 12;

  // Solicitud
  const diasLabel = solicitud.dias_solicitados === 0.5 ? '0.5 (MEDIO DÍA)' : String(solicitud.dias_solicitados || '');
  const anioSol   = solicitud.fecha_inicio ? String(solicitud.fecha_inicio).substring(0, 4) : String(new Date().getFullYear());
  const fIni = fmt(solicitud.fecha_inicio);
  const fFin = fmt(solicitud.fecha_fin);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('VENGO A SOLICITAR:', margen, y);
  let xV = margen + doc.getTextWidth('VENGO A SOLICITAR:') + 2;
  campoLinea(doc, '', diasLabel, xV, y, xV + 20);
  xV += 22;
  doc.setFont('helvetica', 'bold');
  doc.text('DÍA(S) DE FERIADO LEGAL, DESDE EL DÍA', xV, y);
  xV += doc.getTextWidth('DÍA(S) DE FERIADO LEGAL, DESDE EL DÍA') + 2;
  campoLinea(doc, '', fIni, xV, y, derecho);
  y += 9;

  doc.setFont('helvetica', 'bold'); doc.text('HASTA EL DÍA:', margen, y);
  let xH = margen + doc.getTextWidth('HASTA EL DÍA:') + 2;
  campoLinea(doc, '', fFin, xH, y, xH + 36);
  xH += 38;
  doc.setFont('helvetica', 'bold'); doc.text('CORRESPONDIENTE AL AÑO CALENDARIO:', xH, y);
  xH += doc.getTextWidth('CORRESPONDIENTE AL AÑO CALENDARIO:') + 2;
  campoLinea(doc, '', anioSol, xH, y, derecho);
  y += 12;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('EN MI AUSENCIA REALIZARÁ MIS FUNCIONES EL/LA SR./SRA.:', margen, y);
  const xRem = margen + doc.getTextWidth('EN MI AUSENCIA REALIZARÁ MIS FUNCIONES EL/LA SR./SRA.:') + 2;
  campoLinea(doc, '', '', xRem, y, derecho);
  y += 12;

  // Línea separadora
  doc.setLineWidth(0.5); doc.setDrawColor(0);
  doc.line(margen, y, derecho, y);
  y += 8;

  // Caja de saldos
  const totalDias  = saldoInfo.total_dias  !== undefined ? String(saldoInfo.total_dias)  : '';
  const saldoPend  = saldoInfo.saldo_pendiente !== undefined ? String(saldoInfo.saldo_pendiente) : '';
  const diasSol    = String(solicitud.dias_solicitados || '');
  const tieneArr   = saldoInfo.tiene_arrastre;
  const boxW = (ancho - margen * 2) * 0.54;
  const boxH = 30;
  doc.setDrawColor(0); doc.setLineWidth(0.5);
  doc.rect(margen, y, boxW, boxH);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('Nº DE TOTAL DÍAS', margen + 3, y + 8);
  campoLinea(doc, '', totalDias, margen + 3 + doc.getTextWidth('Nº DE TOTAL DÍAS') + 2, y + 8, margen + boxW - 3);
  doc.text('Nº DÍAS SOLICITADOS', margen + 3, y + 18);
  campoLinea(doc, '', diasSol, margen + 3 + doc.getTextWidth('Nº DÍAS SOLICITADOS') + 2, y + 18, margen + boxW - 3);
  doc.text('SALDO PENDIENTE', margen + 3, y + 27);
  campoLinea(doc, '', saldoPend, margen + 3 + doc.getTextWidth('SALDO PENDIENTE') + 2, y + 27, margen + boxW - 3);

  // FERIADO ACUMULADO (lado derecho)
  const xAc = margen + boxW + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('FERIADO ACUMULADO', xAc, y + 8);
  casilla(doc, xAc, y + 18, tieneArr === true);
  doc.setFont('helvetica', 'normal'); doc.text('SI', xAc + 5, y + 18);
  casilla(doc, xAc + 16, y + 18, tieneArr === false);
  doc.text('NO', xAc + 21, y + 18);
  y += boxH + 18;

  // Firmas
  y = seccionFirmas(doc, ancho, margen, y);
  y += 10;

  // Fecha ciudad
  const fechaHoy = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text(`TALCAHUANO, ${fechaHoy}`, margen, y);
  y += 12;

  // Observación
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('OBSERVACIÓN IMPORTANTE:', margen, y);
  y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const obs = '✓  Ningún funcionario puede abandonar sus funciones, si no ha sido autorizado formalmente para hacer uso del permiso solicitado.';
  const obsLines = doc.splitTextToSize(obs, ancho - margen * 2 - 5);
  doc.text(obsLines, margen + 5, y);

  pieInstitucional(doc, 'DISAM TALCAHUANO, Bulnes 266, Teléfono 413835700.', ancho, alto, margen);
  return doc;
}

// ─── Plantilla 2: Permiso Administrativo ─────────────────────────────────────
function construirFormularioAdministrativo(solicitud, funcionario, saldoInfo = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto  = doc.internal.pageSize.getHeight();
  const margen = 15;
  const derecho = ancho - margen;

  let y = encabezadoInstitucional(doc, 'SOLICITUD PERMISO ADMINISTRATIVO',
    'BULNES # 266  TALCAHUANO  TELÉFONO 41-3835700', ancho, margen);

  // Línea vertical izquierda (detalle del formato oficial)
  doc.setDrawColor(0); doc.setLineWidth(0.8);
  doc.line(margen, 47, margen, y - 4);

  const codigo = codigoDoc(solicitud);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
  doc.text(codigo, derecho, 14, { align: 'right' });

  const nombre = `${funcionario.nombres || ''} ${funcionario.apellidos || ''}`.trim();
  campoLinea(doc, 'NOMBRE COMPLETO', nombre, margen, y, derecho);
  y += 9;

  campoLinea(doc, 'RUT', funcionario.rut || '', margen, y, derecho);
  y += 9;

  campoLinea(doc, 'CARGO', funcionario.cargo || '', margen, y, derecho);
  y += 9;

  // Tipo contrato
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('TIPO CONTRATO:', margen, y);
  const contrato = (funcionario.tipo_contrato || '').toLowerCase();
  const opcTC = [
    { label: 'INDEFINIDO:', es: contrato.includes('indefinido') },
    { label: 'PLAZO FIJO:', es: contrato.includes('plazo') },
    { label: 'REEMPLAZO:', es: contrato.includes('reemplazo') },
  ];
  let xTC = margen + doc.getTextWidth('TIPO CONTRATO:') + 4;
  opcTC.forEach(({ label, es }) => {
    casilla(doc, xTC, y, es);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
    doc.text(label, xTC + 5, y);
    const lw = doc.getTextWidth(label);
    campoLinea(doc, '', '', xTC + 5 + lw + 1, y, xTC + 5 + lw + 14);
    xTC += 5 + lw + 18;
  });
  y += 9;

  campoLinea(doc, 'CESFAM', funcionario.dispositivo || funcionario.cesfam || '', margen, y, derecho);
  y += 12;

  // SOLICITO: ___ DÍA(S) DE PERMISO ADMINISTRATIVO CON / SIN GOCE
  const diasLabel = solicitud.dias_solicitados === 0.5 ? '0.5 (MEDIO DÍA)' : String(solicitud.dias_solicitados || '');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('SOLICITO:', margen, y);
  let xSol = margen + doc.getTextWidth('SOLICITO:') + 2;
  campoLinea(doc, '', diasLabel, xSol, y, xSol + 20);
  xSol += 22;
  doc.setFont('helvetica', 'bold');
  doc.text('DÍA(S) DE PERMISO ADMINISTRATIVO', xSol, y);
  xSol += doc.getTextWidth('DÍA(S) DE PERMISO ADMINISTRATIVO') + 3;
  casilla(doc, xSol, y, true);
  doc.setFont('helvetica', 'normal'); doc.text('CON', xSol + 5, y);
  xSol += 5 + doc.getTextWidth('CON') + 4;
  casilla(doc, xSol, y, false);
  doc.setFont('helvetica', 'normal'); doc.text('SIN', xSol + 5, y);
  xSol += 5 + doc.getTextWidth('SIN') + 4;
  doc.setFont('helvetica', 'bold'); doc.text('GOCE DE REMUNERACIONES', xSol, y);
  y += 9;

  // DESDE: ___ HASTA: ___ POR MOTIVOS PARTICULARES
  const fIni = fmt(solicitud.fecha_inicio);
  const fFin = fmt(solicitud.fecha_fin);
  doc.setFont('helvetica', 'bold'); doc.text('DESDE:', margen, y);
  let xD = margen + doc.getTextWidth('DESDE:') + 2;
  campoLinea(doc, '', fIni, xD, y, xD + 35);
  xD += 37;
  doc.setFont('helvetica', 'bold'); doc.text('HASTA:', xD, y);
  let xH2 = xD + doc.getTextWidth('HASTA:') + 2;
  campoLinea(doc, '', fFin, xH2, y, xH2 + 35);
  xH2 += 37;
  doc.setFont('helvetica', 'bold'); doc.text('POR MOTIVOS PARTICULARES.', xH2, y);
  y += 9;

  // AM / PM / DÍA
  const jornada = solicitud.jornada_medio_dia;
  let xAM = margen + 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('AM', xAM, y);
  xAM += doc.getTextWidth('AM') + 2;
  campoLinea(doc, '', jornada === 'AM' ? '✓' : '', xAM, y, xAM + 16);
  xAM += 20;
  doc.text('PM', xAM, y);
  xAM += doc.getTextWidth('PM') + 2;
  campoLinea(doc, '', jornada === 'PM' ? '✓' : '', xAM, y, xAM + 16);
  xAM += 20;
  doc.text('DÍA', xAM, y);
  xAM += doc.getTextWidth('DÍA') + 2;
  campoLinea(doc, '', !jornada ? '✓' : '', xAM, y, xAM + 22);
  y += 10;

  // Motivo
  if (solicitud.motivo) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
    doc.text('MOTIVO:', margen, y);
    doc.setFont('helvetica', 'normal');
    const mLines = doc.splitTextToSize(solicitud.motivo, derecho - margen - doc.getTextWidth('MOTIVO:') - 4);
    doc.text(mLines, margen + doc.getTextWidth('MOTIVO:') + 3, y);
    doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.3);
    for (let i = 0; i < Math.max(mLines.length, 1); i++) {
      doc.line(margen + doc.getTextWidth('MOTIVO:') + 3, y + 0.9 + i * 5.5, derecho, y + 0.9 + i * 5.5);
    }
    y += Math.max(mLines.length, 1) * 5.5 + 5;
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('EN MI AUSENCIA REALIZARÁ MIS FUNCIONES EL/LA SR./SRA.:', margen, y);
  const xRem = margen + doc.getTextWidth('EN MI AUSENCIA REALIZARÁ MIS FUNCIONES EL/LA SR./SRA.:') + 2;
  campoLinea(doc, '', '', xRem, y, derecho);
  y += 12;

  // Línea separadora
  doc.setLineWidth(0.5); doc.setDrawColor(0);
  doc.line(margen, y, derecho, y);
  y += 8;

  // Caja saldos
  const totalDias = saldoInfo.total_dias !== undefined ? String(saldoInfo.total_dias) : '';
  const saldoPend = saldoInfo.saldo_pendiente !== undefined ? String(saldoInfo.saldo_pendiente) : '';
  const diasSolStr = String(solicitud.dias_solicitados || '');
  const colW = (ancho - margen * 2) / 3;
  doc.setDrawColor(0); doc.setLineWidth(0.5);
  doc.rect(margen, y, ancho - margen * 2, 16);
  doc.line(margen + colW, y, margen + colW, y + 16);
  doc.line(margen + colW * 2, y, margen + colW * 2, y + 16);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(20, 20, 20);
  doc.text('Nº TOTAL DÍAS', margen + colW / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(totalDias, margen + colW / 2, y + 13, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('Nº DÍAS SOLICITADOS', margen + colW + colW / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(diasSolStr, margen + colW + colW / 2, y + 13, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('SALDO PENDIENTE', margen + colW * 2 + colW / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(saldoPend, margen + colW * 2 + colW / 2, y + 13, { align: 'center' });
  y += 26;

  y = seccionFirmas(doc, ancho, margen, y);
  y += 10;

  const fechaHoy = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text(`TALCAHUANO, ${fechaHoy}`, margen, y);
  y += 12;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('OBSERVACIÓN IMPORTANTE:', margen, y);
  y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const obs = 'Ningún funcionario puede abandonar sus funciones, si no ha sido autorizado formalmente para hacer uso del permiso solicitado.';
  doc.text(doc.splitTextToSize(obs, ancho - margen * 2 - 5), margen + 5, y);

  pieInstitucional(doc, 'BULNES # 266  TALCAHUANO  TELÉFONO 41-3835700', ancho, alto, margen);
  return doc;
}

// ─── Plantilla 3: Permiso Especial ───────────────────────────────────────────
function construirFormularioEspecial(solicitud, funcionario) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto  = doc.internal.pageSize.getHeight();
  const margen = 15;
  const derecho = ancho - margen;

  let y = encabezadoInstitucional(doc, 'SOLICITUD DE PERMISO ESPECIAL',
    'DAS TALCAHUANO, Manuel Bulnes 266, Tercer Piso, Talcahuano, Fono: 413835700', ancho, margen);

  const codigo = codigoDoc(solicitud);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
  doc.text(codigo, derecho, 14, { align: 'right' });

  const nombre = `${funcionario.nombres || ''} ${funcionario.apellidos || ''}`.trim();
  campoLinea(doc, 'NOMBRE COMPLETO', nombre, margen, y, derecho);
  y += 9;

  // RUT + JORNADA HRS
  const xRutFin2 = margen + 68;
  campoLinea(doc, 'RUT', funcionario.rut || '', margen, y, xRutFin2);
  const xJ2 = xRutFin2 + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('JORNADA', xJ2, y);
  const xJV2 = xJ2 + doc.getTextWidth('JORNADA') + 2;
  campoLinea(doc, '', funcionario.horas_contrato ? String(funcionario.horas_contrato) : '', xJV2, y, xJV2 + 14);
  doc.setFont('helvetica', 'bold'); doc.text('HRS', xJV2 + 16, y);
  y += 9;

  campoLinea(doc, 'ESTAMENTO', funcionario.cargo || funcionario.estamento || '', margen, y, derecho);
  y += 9;

  campoLinea(doc, 'TIPO DE CONTRATO', funcionario.tipo_contrato || '', margen, y, derecho);
  y += 9;

  campoLinea(doc, 'CESFAM', funcionario.dispositivo || funcionario.cesfam || '', margen, y, derecho);
  y += 12;

  // Encabezado de la solicitud
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('VIENE A SOLICITAR   PERMISO ESPECIAL CORRESPONDIENTE A:', margen, y);
  y += 6;

  // Tabla de tipos de permiso especial
  const subtipoActivo = detectarSubtipoEspecial(solicitud.tipo_nombre);
  const colDesde = derecho - 40;
  const colHasta = derecho - 16;

  // Encabezado tabla
  doc.setDrawColor(0); doc.setLineWidth(0.4);
  doc.rect(margen, y, derecho - margen, 7);
  doc.line(colDesde, y, colDesde, y + 7);
  doc.line(colHasta, y, colHasta, y + 7);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('PERMISO', (margen + colDesde) / 2, y + 5, { align: 'center' });
  doc.text('DESDE', (colDesde + colHasta) / 2, y + 5, { align: 'center' });
  doc.text('HASTA', (colHasta + derecho) / 2, y + 5, { align: 'center' });
  y += 7;

  TIPOS_ESPECIALES.forEach((tipo) => {
    const activo = subtipoActivo?.label === tipo.label;
    const filaH = 12;
    doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.rect(margen, y, derecho - margen, filaH);
    doc.line(colDesde, y, colDesde, y + filaH);
    doc.line(colHasta, y, colHasta, y + filaH);

    if (activo) {
      doc.setFillColor(235, 245, 255);
      doc.rect(margen + 0.2, y + 0.2, colDesde - margen - 0.4, filaH - 0.4, 'F');
    }

    doc.setFont('helvetica', activo ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(activo ? 0 : 40, activo ? 50 : 40, activo ? 120 : 40);
    const textoTipo = `${tipo.label}  ${tipo.nota}`;
    const tipoLines = doc.splitTextToSize(textoTipo, colDesde - margen - 4);
    const textY = tipoLines.length === 1 ? y + filaH / 2 + 2 : y + 4;
    doc.text(tipoLines, margen + 2, textY);

    if (activo) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(0, 80, 160);
      doc.text(fmt(solicitud.fecha_inicio), (colDesde + colHasta) / 2, y + filaH / 2 + 2, { align: 'center' });
      doc.text(fmt(solicitud.fecha_fin),    (colHasta + derecho) / 2,  y + filaH / 2 + 2, { align: 'center' });
    }
    y += filaH;
  });
  y += 10;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text('EN MI AUSENCIA REALIZARÁ MIS FUNCIONES EL/LA SR./SRA.:', margen, y);
  const xRem2 = margen + doc.getTextWidth('EN MI AUSENCIA REALIZARÁ MIS FUNCIONES EL/LA SR./SRA.:') + 2;
  campoLinea(doc, '', '', xRem2, y, derecho);
  y += 12;

  doc.setLineWidth(0.5); doc.setDrawColor(0);
  doc.line(margen, y, derecho, y);
  y += 14;

  y = seccionFirmas(doc, ancho, margen, y);
  y += 10;

  const fechaHoy = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 20, 20);
  doc.text(`TALCAHUANO, ${fechaHoy}`, margen, y);
  y += 12;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('OBSERVACIÓN IMPORTANTE', margen, y);
  y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const obs2 = '✓  Para las solicitudes especiales (*) debe presentar certificado que respalde la solicitud de este permiso.';
  doc.text(doc.splitTextToSize(obs2, ancho - margen * 2 - 5), margen + 5, y);

  pieInstitucional(doc, 'DAS TALCAHUANO, Manuel Bulnes 266, Tercer Piso, Talcahuano, Fono: 413835700', ancho, alto, margen);
  return doc;
}

// ─── Dispatcher principal ────────────────────────────────────────────────────
function construirFormularioOficial(solicitud, funcionario, saldoInfo = {}) {
  const tipo = detectarTipoFormulario(solicitud);
  if (tipo === 'feriado')  return construirFormularioFeriado(solicitud, funcionario, saldoInfo);
  if (tipo === 'especial') return construirFormularioEspecial(solicitud, funcionario);
  return construirFormularioAdministrativo(solicitud, funcionario, saldoInfo);
}

export function descargarFormularioOficial(solicitud, funcionario, saldoInfo = {}) {
  const doc  = construirFormularioOficial(solicitud, funcionario, saldoInfo);
  const code = codigoDoc(solicitud);
  const ap   = (funcionario.apellidos || 'funcionario').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  doc.save(`${code}_${ap}.pdf`);
}

export function imprimirFormularioOficial(solicitud, funcionario, saldoInfo = {}) {
  const doc = construirFormularioOficial(solicitud, funcionario, saldoInfo);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}
