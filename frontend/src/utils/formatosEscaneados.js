import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FONDO_CAPACITACION, FONDO_COMPENSATORIO } from './fondosFormatosDAS';

// ═════════════════════════════════════════════════════════════════════════════
// Formatos oficiales DAS entregados como documento escaneado (Solicitud de
// Permiso de Capacitación y Solicitud de Descanso Compensatorio). La página
// escaneada se usa tal cual como fondo (tamaño carta) y los datos se escriben
// sobre cada línea de llenado. Coordenadas en puntos desde la esquina superior
// izquierda, medidas sobre el escaneo; "y" es la altura de la línea.
// ═════════════════════════════════════════════════════════════════════════════

const CARTA = [612, 792];
const TINTA = [15, 23, 42];

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

// Escribe sobre una línea; achica la letra hasta 7,5 pt si no cabe y, si aun
// así no cabe, la deja sobresalir (mejor legible que diminuta).
function escribir(doc, valor, x1, x2, y, { centrar = false, size = 10 } = {}) {
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
  else doc.text(texto, x1 + 2, y - 2.5);
}

function nuevaPagina(fondo, folio) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: CARTA });
  doc.addImage(fondo, 'JPEG', 0, 0, CARTA[0], CARTA[1]);
  if (folio) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 130, 145);
    doc.text(folio, CARTA[0] - 30, 24, { align: 'right' });
  }
  return doc;
}

// ─── Solicitud Permiso de Capacitación ───────────────────────────────────────
export function construirFormatoCapacitacionDAS(solicitud, funcionario, saldoInfo = {}, folio) {
  const doc = nuevaPagina(FONDO_CAPACITACION, folio);
  const f = funcionario;
  const tipos = tiposContrato(f).map((t) => t.toLowerCase());
  const marca = (c) => (tipos.some(c) ? 'X' : '');

  escribir(doc, nombreCompleto(f), 232, 518, 246.1);
  escribir(doc, f.rut, 232, 518, 283.3);
  escribir(doc, estamentoCargo(f), 233, 518, 320.0);
  escribir(doc, marca((t) => t.includes('indefinido') || t.includes('planta')), 302, 331, 358.0, { centrar: true });
  // Plazo Fijo incluye contrata y suplencias (reemplazos a plazo)
  escribir(doc, marca((t) => t.includes('plazo') || t.includes('contrata') || t.includes('suplencia')), 397, 423, 359.1, { centrar: true });
  escribir(doc, marca((t) => t.includes('honorario')), 502.6, 525, 360.0, { centrar: true });
  escribir(doc, f.dispositivo || f.cesfam || '', 233, 524, 394.4);

  escribir(doc, numero(solicitud.dias_solicitados), 144.7, 168, 430.4, { centrar: true });
  escribir(doc, fechaCorta(solicitud.fecha_inicio), 228, 272, 444.2, { size: 9.5 });
  escribir(doc, fechaCorta(solicitud.fecha_fin), 316, 368, 445.5, { size: 9.5 });

  // Nombre o actividad (campo "motivo"): continúa en la segunda línea si es largo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const actividad = (solicitud.motivo || '').trim();
  const [l1 = '', ...resto] = actividad ? doc.splitTextToSize(actividad, 205) : [];
  escribir(doc, l1, 313, 523, 482.0);
  escribir(doc, resto.join(' '), 82, 524, 503.5);

  // "Nº TOTAL DÍAS: 05" viene impreso: se reemplaza por el saldo real del funcionario
  if (saldoInfo.total_dias !== undefined && saldoInfo.total_dias !== null) {
    doc.setFillColor(255, 255, 255);
    doc.rect(166, 531, 17, 12, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...TINTA);
    doc.text(numero(saldoInfo.total_dias), 168, 540.5);
  }
  escribir(doc, numero(solicitud.dias_solicitados), 323, 362, 544.7, { centrar: true });
  escribir(doc, numero(saldoInfo.saldo_pendiente), 480, 524.5, 546.5, { centrar: true });

  escribir(doc, fechaLarga(solicitud.fecha_solicitud || solicitud.created_at), 172, 400, 716.6);
  return doc;
}

// ─── Solicitud de Descanso Compensatorio ─────────────────────────────────────
export function construirFormatoCompensatorio(sol, funcionario, folio) {
  const doc = nuevaPagina(FONDO_COMPENSATORIO, folio);
  const f = funcionario;
  const horas = numero(sol.horas_solicitadas);
  const inicio = hora(sol.hora_inicio);

  escribir(doc, nombreCompleto(f), 158, 519, 247.1);
  escribir(doc, f.rut, 158, 355, 272.5);
  escribir(doc, numero(horasTotales(f) || ''), 410, 480, 270.5, { centrar: true });
  escribir(doc, f.escalafon || f.cargo || '', 158, 519, 297.9);
  escribir(doc, tiposContrato(f).map((t, i) => {
    const h = i === 0 ? f.horas_contrato : f.horas_contrato_2;
    return tiposContrato(f).length > 1 && h ? `${t} ${h} hrs` : t;
  }).join(' + '), 158, 519, 323.5);
  escribir(doc, f.dispositivo || f.cesfam || '', 158, 519, 348.7);

  escribir(doc, horas, 161.6, 252, 407.7, { centrar: true });
  escribir(doc, inicio, 161.6, 197.6, 426.4, { centrar: true, size: 9.5 });
  escribir(doc, diaMes(sol.fecha_inicio), 238, 328, 427.3, { centrar: true });
  escribir(doc, sumarHoras(inicio, sol.horas_solicitadas), 385.6, 439, 428.9, { centrar: true, size: 9.5 });
  escribir(doc, diaMes(sol.fecha_fin || sol.fecha_inicio), 161.6, 209.5, 445.1, { centrar: true });

  escribir(doc, fechaCorta(sol.fecha_solicitud || sol.created_at), 198.4, 297.4, 637.0, { centrar: true });
  return doc;
}

export function descargarFormatoCompensatorio(sol, funcionario) {
  const folio = `COMP-${String(sol.id || '').padStart(5, '0')}`;
  const doc = construirFormatoCompensatorio(sol, funcionario, folio);
  const ap = (funcionario.apellidos || 'funcionario').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  doc.save(`${folio}_${ap}.pdf`);
}
