import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, PenLine, Eraser, Upload, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { firmasApi } from '../api/client';

// Lienzo en px lógicos; se dibuja al doble de resolución para que la firma
// salga nítida en el PDF.
const ANCHO = 560;
const ALTO = 200;
const ESCALA = 2;

// Recorta los bordes vacíos (transparentes) y devuelve el PNG, o null si no hay trazo
function exportarRecortado(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  let x1 = width, y1 = height, x2 = -1, y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 20) {
        if (x < x1) x1 = x; if (x > x2) x2 = x;
        if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return null;
  const m = 8;
  x1 = Math.max(x1 - m, 0); y1 = Math.max(y1 - m, 0);
  x2 = Math.min(x2 + m, width - 1); y2 = Math.min(y2 + m, height - 1);
  const out = document.createElement('canvas');
  out.width = x2 - x1 + 1;
  out.height = y2 - y1 + 1;
  out.getContext('2d').drawImage(canvas, x1, y1, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export default function MiFirmaModal({ onClose }) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const [actual, setActual] = useState(undefined); // undefined = cargando
  const [hayTrazo, setHayTrazo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    firmasApi.mia()
      .then(({ data }) => setActual(data.imagen || null))
      .catch((err) => { setActual(null); toast.error(err?.response?.data?.error || 'No se pudo cargar su firma'); });
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.6 * ESCALA;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f2a5c';
  }, [actual]);

  const punto = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvasRef.current.width / r.width), (e.clientY - r.top) * (canvasRef.current.height / r.height)];
  };
  const iniciar = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const [x, y] = punto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    setHayTrazo(true);
  };
  const mover = (e) => {
    if (!dibujando.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const [x, y] = punto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const terminar = () => { dibujando.current = false; };

  const limpiar = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setHayTrazo(false);
  };

  // Foto o escaneo de la firma: el fondo claro se vuelve transparente
  const subirImagen = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) return toast.error('Seleccione una imagen');
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      const k = Math.min(c.width / img.width, c.height / img.height);
      const w = img.width * k, h = img.height * k;
      ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      const datos = ctx.getImageData(0, 0, c.width, c.height);
      const d = datos.data;
      for (let i = 0; i < d.length; i += 4) {
        const luz = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (luz > 170) d[i + 3] = 0;
        else { d[i] = 15; d[i + 1] = 42; d[i + 2] = 92; d[i + 3] = Math.min(d[i + 3], Math.round((170 - luz) * 2.2)); }
      }
      ctx.putImageData(datos, 0, 0);
      URL.revokeObjectURL(img.src);
      setHayTrazo(true);
    };
    img.onerror = () => toast.error('No se pudo leer la imagen');
    img.src = URL.createObjectURL(archivo);
  };

  const guardar = async () => {
    let imagen = exportarRecortado(canvasRef.current);
    if (!imagen) return toast.error('Dibuje su firma antes de guardar');
    // Si pesa demasiado se reduce a la mitad
    if (imagen.length > 190000) {
      const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = imagen; });
      const c = document.createElement('canvas');
      c.width = Math.round(img.width / 2); c.height = Math.round(img.height / 2);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      imagen = c.toDataURL('image/png');
    }
    setGuardando(true);
    try {
      const { data } = await firmasApi.guardar(imagen);
      setActual(data.imagen);
      setHayTrazo(false);
      toast.success('Firma guardada. Se estampará en sus formularios.');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al guardar la firma');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!window.confirm('¿Eliminar su firma? Los documentos ya firmados la conservan.')) return;
    try {
      await firmasApi.eliminar();
      setActual(null);
      toast.success('Firma eliminada');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al eliminar la firma');
    }
  };

  // Portal a <body>, igual que el cambio de contraseña (el menú lateral hereda texto blanco)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 text-dark-900">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 z-10 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
              <PenLine size={18} className="text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-dark-900">Mi firma</h2>
          </div>
          <button type="button" onClick={onClose} title="Cerrar" className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-dark-500 mb-4">
          Su firma se estampa en los formularios al enviar una solicitud y, si es jefatura o Dirección, al
          aprobarla, junto con su nombre, la fecha y la hora. Así no es necesario imprimir el permiso.
          Solo usted puede registrar o cambiar su firma.
        </p>

        {actual === undefined ? (
          <p className="text-sm text-dark-400 py-6 text-center">Cargando…</p>
        ) : (
          <>
            {actual && (
              <div className="mb-4">
                <p className="text-xs font-medium text-dark-700 mb-1.5">Firma registrada</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 border border-dark-200 rounded-xl bg-dark-50 p-2 flex justify-center">
                    <img src={actual} alt="Firma registrada" className="max-h-20" />
                  </div>
                  <button type="button" onClick={eliminar} title="Eliminar firma" className="p-2 rounded-lg hover:bg-red-50 text-red-500">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs font-medium text-dark-700 mb-1.5">
              {actual ? 'Reemplazar por una nueva' : 'Dibuje su firma'} (con el dedo o el mouse)
            </p>
            <canvas
              ref={canvasRef}
              width={ANCHO * ESCALA}
              height={ALTO * ESCALA}
              onPointerDown={iniciar}
              onPointerMove={mover}
              onPointerUp={terminar}
              onPointerCancel={terminar}
              className="w-full border-2 border-dashed border-dark-200 rounded-xl bg-white touch-none cursor-crosshair"
              style={{ aspectRatio: `${ANCHO} / ${ALTO}` }}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" onClick={limpiar} className="btn-secondary">
                <Eraser size={15} /> Limpiar
              </button>
              <label className="btn-secondary cursor-pointer">
                <Upload size={15} /> Subir foto de la firma
                <input type="file" accept="image/*" className="hidden" onChange={subirImagen} />
              </label>
              <button type="button" onClick={guardar} disabled={!hayTrazo || guardando} className="btn-primary ml-auto">
                {guardando
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : 'Guardar firma'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
