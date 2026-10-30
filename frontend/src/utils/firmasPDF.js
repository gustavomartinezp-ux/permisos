import { format } from 'date-fns';
import { solicitudesApi, solicitudesCompensacionApi } from '../api/client';
import { limpiarFirma } from './limpiarFirma';

// Firma electrónica simple sobre la línea de firma del formulario: la imagen
// registrada por el funcionario (si tiene) y, bajo ella, quién firmó y cuándo.
// x1, x2 e yLinea van en la unidad del documento; k = unidades por punto
// (1 en documentos en pt, 25,4 / 72 en documentos en mm).
const GRIS = [71, 85, 105];
const ALTO_MAX = 50;

// altoMax (pt) se reduce donde la línea de firma tiene poco espacio encima
export function estamparFirma(doc, firma, x1, x2, yLinea, k = 1, altoMax = ALTO_MAX) {
  if (!firma) return;
  const cx = (x1 + x2) / 2;
  const fecha = firma.fecha ? format(new Date(firma.fecha), 'dd/MM/yyyy HH:mm') : '';

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS);
  doc.setFontSize(5.5);
  const ancho = x2 - x1;
  const ajustar = (texto) => {
    let s = 5.5;
    doc.setFontSize(s);
    while (s > 4 && doc.getTextWidth(texto) > ancho) { s -= 0.25; doc.setFontSize(s); }
  };
  const l1 = firma.nombre ? `Firmado electrónicamente por ${firma.nombre}` : 'Firmado electrónicamente';
  ajustar(l1);
  doc.text(l1, cx, yLinea - 7.5 * k, { align: 'center' });
  doc.setFontSize(5.5);
  doc.text(fecha, cx, yLinea - 2 * k, { align: 'center' });

  if (!firma.imagen) return;
  try {
    const { width, height } = doc.getImageProperties(firma.imagen);
    let h = altoMax * k;
    let w = (width / height) * h;
    if (w > ancho) { w = ancho; h = (height / width) * w; }
    doc.addImage(firma.imagen, 'PNG', cx - w / 2, yLinea - 12.5 * k - h, w, h);
  } catch {
    // Imagen ilegible: queda solo el texto de la firma
  }
}

// Firmas de la solicitud ({ solicitante, jefe, direccion }); sin conexión o sin
// acceso el formulario sale igual, con las líneas en blanco.
export async function cargarFirmas(solicitud, { compensacion = false } = {}) {
  if (!solicitud?.id) return {};
  try {
    const api = compensacion ? solicitudesCompensacionApi : solicitudesApi;
    const { data } = await api.firmas(solicitud.id);
    // Sin sombras ni fondo de la foto, recortada al trazo
    const firmas = { ...(data || {}) };
    for (const etapa of ['solicitante', 'jefe', 'direccion']) {
      if (firmas[etapa]?.imagen) firmas[etapa] = { ...firmas[etapa], imagen: await limpiarFirma(firmas[etapa].imagen) };
    }
    return firmas;
  } catch {
    return {};
  }
}
