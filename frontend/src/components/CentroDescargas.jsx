import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Download, FileSpreadsheet, FileText, Clock3, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { reporteTareasApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const ETIQUETA_TIPO = { permisos: 'Reporte de Permisos' };

const ESTADO_INFO = {
  PENDING:    { label: 'En cola',      className: 'bg-dark-100 text-dark-500' },
  PROCESSING: { label: 'Procesando…',  className: 'bg-amber-50 text-amber-700' },
  COMPLETED:  { label: 'Listo',        className: 'bg-emerald-50 text-emerald-700' },
  FAILED:     { label: 'Error',        className: 'bg-red-50 text-red-700' },
};

const ACTIVOS = ['PENDING', 'PROCESSING'];

async function descargarTarea(tarea) {
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_URL || 'https://cesfam-permisos-api.onrender.com/api';
  const resp = await fetch(`${base}/reporte-tareas/${tarea.id}/descargar`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error('No se pudo descargar el archivo');
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tarea.archivo_nombre || 'reporte';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CentroDescargas() {
  const { usuario, esSoloAutoservicio } = useAuth();
  const [tareas, setTareas] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const vistasRef = useRef(new Set());
  const prevEstadosRef = useRef({});

  const cargar = useCallback(() => {
    reporteTareasApi.listar()
      .then(({ data }) => {
        // Notificación flotante cuando una tarea pasa a COMPLETED/FAILED
        data.forEach((t) => {
          const anterior = prevEstadosRef.current[t.id];
          if (anterior && anterior !== t.status) {
            if (t.status === 'COMPLETED') {
              toast.success(
                (to) => (
                  <span className="flex items-center gap-2">
                    Tu reporte está listo
                    <button
                      onClick={() => { descargarTarea(t).catch(() => toast.error('Error al descargar')); toast.dismiss(to.id); }}
                      className="text-xs font-semibold underline"
                    >
                      Descargar
                    </button>
                  </span>
                ),
                { duration: 8000 }
              );
            } else if (t.status === 'FAILED') {
              toast.error('No se pudo generar tu reporte');
            }
          }
        });
        const nuevosEstados = {};
        data.forEach((t) => { nuevosEstados[t.id] = t.status; });
        prevEstadosRef.current = nuevosEstados;
        setTareas(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!usuario || esSoloAutoservicio) return;
    cargar();
    let cancelado = false;
    const tick = () => {
      if (cancelado) return;
      cargar();
      const hayActivas = tareas.some((t) => ACTIVOS.includes(t.status));
      timeoutId = setTimeout(tick, hayActivas ? 4000 : 25000);
    };
    let timeoutId = setTimeout(tick, 4000);
    return () => { cancelado = true; clearTimeout(timeoutId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, esSoloAutoservicio]);

  if (!usuario || esSoloAutoservicio) return null;

  const enProceso = tareas.filter((t) => ACTIVOS.includes(t.status)).length;
  const noVistas = tareas.filter((t) => t.status === 'COMPLETED' && !vistasRef.current.has(t.id)).length;
  const badge = enProceso + noVistas;

  const toggle = () => {
    setAbierto((v) => {
      const next = !v;
      if (next) tareas.forEach((t) => vistasRef.current.add(t.id));
      return next;
    });
  };

  return (
    <div className="fixed top-3 right-4 z-30">
      <button
        onClick={toggle}
        className="relative w-10 h-10 rounded-full bg-white shadow-card border border-dark-200 flex items-center justify-center text-dark-600 hover:text-brand-600 hover:border-brand-300 transition-colors"
        title="Centro de Descargas"
      >
        <Download size={17} />
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
      </button>

      <AnimatePresence>
        {abierto && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2 w-80 max-h-[420px] overflow-y-auto bg-white rounded-xl shadow-glass border border-dark-100 z-20"
            >
              <div className="px-4 py-3 border-b border-dark-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-dark-800">Centro de Descargas</p>
                <button onClick={cargar} className="text-dark-400 hover:text-dark-600">
                  <RefreshCw size={13} />
                </button>
              </div>

              {tareas.length === 0 ? (
                <p className="text-center text-xs text-dark-400 py-8 px-4">
                  Sin reportes generados. Cuando generes uno, aparecerá aquí.
                </p>
              ) : (
                <div className="divide-y divide-dark-50">
                  {tareas.map((t) => {
                    const info = ESTADO_INFO[t.status] || ESTADO_INFO.PENDING;
                    const Icono = t.formato === 'excel' ? FileSpreadsheet : FileText;
                    return (
                      <div key={t.id} className="px-4 py-3 flex items-start gap-2.5">
                        <Icono size={16} className="text-dark-400 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-dark-800 truncate">
                            {ETIQUETA_TIPO[t.report_type] || t.report_type}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${info.className}`}>
                              {info.label}
                            </span>
                            {t.status === 'PROCESSING' && (
                              <span className="animate-spin h-2.5 w-2.5 border-2 border-amber-400 border-t-transparent rounded-full" />
                            )}
                          </div>
                          {t.status === 'FAILED' && t.error_message && (
                            <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                              <AlertTriangle size={10} /> {t.error_message}
                            </p>
                          )}
                          {t.expires_at && t.status === 'COMPLETED' && (
                            <p className="text-[10px] text-dark-400 mt-1 flex items-center gap-1">
                              <Clock3 size={10} />
                              Expira: {new Date(t.expires_at).toLocaleDateString('es-CL')}
                            </p>
                          )}
                        </div>
                        {t.status === 'COMPLETED' && (
                          <button
                            onClick={() => descargarTarea(t).catch(() => toast.error('Error al descargar'))}
                            className="text-brand-600 hover:text-brand-700 shrink-0 mt-0.5"
                            title="Descargar"
                          >
                            <Download size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
