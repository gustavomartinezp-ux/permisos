import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, FileText, AlertCircle, ArrowLeftRight, Info } from 'lucide-react';
import { solicitudesApi, saldosApi } from '../api/client';
import toast from 'react-hot-toast';

// Feriados Chile 2025-2026 (espejo del backend para preview instantáneo)
const FERIADOS = new Set([
  '2025-01-01','2025-04-18','2025-04-19','2025-05-01','2025-05-21',
  '2025-06-20','2025-06-29','2025-07-16','2025-08-15','2025-09-18',
  '2025-09-19','2025-10-12','2025-10-31','2025-11-01','2025-12-08','2025-12-25',
  '2026-01-01','2026-04-03','2026-04-04','2026-05-01','2026-05-21',
  '2026-06-19','2026-06-29','2026-07-16','2026-08-15','2026-09-18',
  '2026-09-19','2026-10-12','2026-10-31','2026-11-01','2026-12-08','2026-12-25',
]);

function toISO(d) {
  return d.toISOString().split('T')[0];
}

function esDiaHabil(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !FERIADOS.has(toISO(d));
}

function calcularDiasHabiles(inicio, fin) {
  if (!inicio || !fin) return 0;
  const start = new Date(inicio + 'T12:00:00');
  const end = new Date(fin + 'T12:00:00');
  if (end < start) return 0;
  let dias = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (esDiaHabil(cur)) dias++;
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

function calcularDistribucion(diasSolicitados, arrastreDisp, actualDisp) {
  const fromArrastre = Math.min(diasSolicitados, arrastreDisp);
  const fromActual = diasSolicitados - fromArrastre;
  return { fromArrastre, fromActual };
}

export default function SolicitudModal({ funcionario, onClose, onSuccess }) {
  const [saldos, setSaldos] = useState([]);
  const [form, setForm] = useState({
    tipo_permiso_id: '',
    fecha_inicio: '',
    fecha_fin: '',
    motivo: '',
  });
  const [medioDia, setMedioDia] = useState(false);
  const [jornadaMedioDia, setJornadaMedioDia] = useState('AM');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (funcionario) {
      saldosApi.porFuncionario(funcionario.id)
        .then(({ data }) => setSaldos(data))
        .catch(() => toast.error('No se pudieron cargar los saldos'));
    }
  }, [funcionario]);

  const saldoSel = saldos.find(s => s.tipo_permiso_id == form.tipo_permiso_id);
  const permiteMedioDia = saldoSel?.permite_medio_dia === true;
  const diasSolicitados = medioDia ? 0.5 : calcularDiasHabiles(form.fecha_inicio, form.fecha_fin);

  const arrastreDisp = saldoSel?.es_feriado_legal
    ? ((saldoSel.saldo_arrastre || 0) - (saldoSel.arrastre_usados || 0) - (saldoSel.arrastre_pendientes || 0))
    : 0;
  const actualDisp = saldoSel
    ? saldoSel.dias_asignados - saldoSel.dias_usados - (saldoSel.dias_pendientes || 0)
    : 0;
  const totalDisp = saldoSel?.es_feriado_legal ? arrastreDisp + actualDisp : actualDisp;

  const distribucion = saldoSel?.es_feriado_legal && diasSolicitados > 0
    ? calcularDistribucion(diasSolicitados, arrastreDisp, actualDisp)
    : null;

  // Límite de parcialización: máximo dias_asignados - 10 del período actual
  const maxParciales = saldoSel?.es_feriado_legal ? Math.max((saldoSel.dias_asignados || 0) - 10, 0) : null;
  const parcialesUsados = saldoSel?.es_feriado_legal ? (saldoSel.dias_parciales_usados || 0) : 0;
  const parcialesDisponibles = maxParciales !== null ? Math.max(maxParciales - parcialesUsados, 0) : null;
  const fromActual = distribucion?.fromActual ?? 0;
  const esParcial = saldoSel?.es_feriado_legal && fromActual > 0 && fromActual < 10;
  const excedeParcializacion = esParcial && (parcialesUsados + fromActual) > maxParciales;

  const saldoInsuficiente = !!form.tipo_permiso_id && (diasSolicitados > totalDisp || excedeParcializacion);

  // Devuelve el rango horario según día de semana y jornada
  const getHorario = (fecha, jornada) => {
    if (!fecha || !jornada) return '';
    const dow = new Date(fecha + 'T12:00:00').getDay();
    if (jornada === 'AM') return dow === 5 ? '08:00 – 12:00 hrs' : '08:00 – 12:30 hrs';
    return dow === 5 ? '12:00 – 16:00 hrs' : '12:30 – 17:00 hrs';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!medioDia && diasSolicitados <= 0) return setError('Las fechas no son válidas');
    if (medioDia && !jornadaMedioDia) return setError('Selecciona la jornada AM o PM');
    if (saldoInsuficiente) return setError(`Saldo insuficiente. Disponibles: ${totalDisp} días`);

    const fechaFin = medioDia ? form.fecha_inicio : form.fecha_fin;

    setCargando(true);
    try {
      await solicitudesApi.crear({
        funcionario_id: funcionario.id,
        tipo_permiso_id: parseInt(form.tipo_permiso_id),
        fecha_inicio: form.fecha_inicio,
        fecha_fin: fechaFin,
        dias_solicitados: diasSolicitados,
        motivo: form.motivo,
        jornada_medio_dia: medioDia ? jornadaMedioDia : undefined,
      });
      toast.success('Solicitud registrada exitosamente');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar solicitud');
    } finally {
      setCargando(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
            <div>
              <h2 className="font-semibold text-dark-900">Nueva Solicitud de Permiso</h2>
              <p className="text-sm text-dark-500">{funcionario?.nombres} {funcionario?.apellidos}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-100 text-dark-400">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Tipo permiso */}
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-1.5">
                Tipo de Permiso
              </label>
              <select
                value={form.tipo_permiso_id}
                onChange={(e) => setForm({ ...form, tipo_permiso_id: e.target.value })}
                className="input-field"
                required
              >
                <option value="">Seleccionar tipo...</option>
                {saldos.map((s) => {
                  const aDisp = s.es_feriado_legal
                    ? ((s.saldo_arrastre || 0) - (s.arrastre_usados || 0) - (s.arrastre_pendientes || 0))
                    : 0;
                  const pDisp = s.dias_asignados - s.dias_usados - (s.dias_pendientes || 0);
                  const tot = s.es_feriado_legal ? aDisp + pDisp : pDisp;
                  return (
                    <option key={s.tipo_permiso_id} value={s.tipo_permiso_id}>
                      {s.tipo_nombre} — {tot} días disponibles{s.es_feriado_legal && aDisp > 0 ? ` (${aDisp} arrastre)` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Toggle día completo / medio día */}
            {permiteMedioDia && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMedioDia(false)}
                    className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-all ${
                      !medioDia ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-dark-600 border-dark-200 hover:border-brand-300'
                    }`}
                  >
                    Día completo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMedioDia(true)}
                    className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-all ${
                      medioDia ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-dark-600 border-dark-200 hover:border-brand-300'
                    }`}
                  >
                    Medio día
                  </button>
                </div>

                {/* Selector AM / PM */}
                {medioDia && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setJornadaMedioDia('AM')}
                        className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-all ${
                          jornadaMedioDia === 'AM'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-dark-600 border-dark-200 hover:border-amber-300'
                        }`}
                      >
                        Jornada AM
                      </button>
                      <button
                        type="button"
                        onClick={() => setJornadaMedioDia('PM')}
                        className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-all ${
                          jornadaMedioDia === 'PM'
                            ? 'bg-indigo-500 text-white border-indigo-500'
                            : 'bg-white text-dark-600 border-dark-200 hover:border-indigo-300'
                        }`}
                      >
                        Jornada PM
                      </button>
                    </div>
                    {form.fecha_inicio && (
                      <p className="text-xs text-center text-dark-500 bg-dark-50 rounded-lg py-1.5 font-medium">
                        {jornadaMedioDia === 'AM' ? 'Mañana' : 'Tarde'}: {getHorario(form.fecha_inicio, jornadaMedioDia)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Fechas */}
            <div className={medioDia ? '' : 'grid grid-cols-2 gap-3'}>
              <div>
                <label className="block text-sm font-medium text-dark-700 mb-1.5">
                  <Calendar size={14} className="inline mr-1" />
                  {medioDia ? 'Fecha' : 'Fecha inicio'}
                </label>
                <input
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              {!medioDia && (
                <div>
                  <label className="block text-sm font-medium text-dark-700 mb-1.5">
                    <Calendar size={14} className="inline mr-1" />
                    Fecha fin
                  </label>
                  <input
                    type="date"
                    value={form.fecha_fin}
                    min={form.fecha_inicio}
                    onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
              )}
            </div>

            {/* Resumen días */}
            {form.fecha_inicio && form.fecha_fin && diasSolicitados > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={`rounded-lg p-3 text-sm space-y-2 ${
                  saldoInsuficiente ? 'bg-red-50 border border-red-200' : 'bg-brand-50 border border-brand-200'
                }`}
              >
                <p className={`font-medium ${saldoInsuficiente ? 'text-red-700' : 'text-brand-700'}`}>
                  {diasSolicitados} día(s) hábil(es)
                  {saldoSel && ` de ${totalDisp} disponibles`}
                </p>

                {/* Distribución feriado legal */}
                {distribucion && !saldoInsuficiente && (
                  <div className="border-t border-brand-200 pt-2 space-y-1">
                    <p className="text-xs font-medium text-brand-600 flex items-center gap-1">
                      <ArrowLeftRight size={12} />
                      Distribución de días
                    </p>
                    {distribucion.fromArrastre > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-amber-700">Del período anterior (arrastre)</span>
                        <span className="font-bold text-amber-700">{distribucion.fromArrastre}</span>
                      </div>
                    )}
                    {distribucion.fromActual > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-brand-700">Del período actual</span>
                        <span className="font-bold text-brand-700">{distribucion.fromActual}</span>
                      </div>
                    )}
                    {arrastreDisp > 0 && distribucion.fromActual > 0 && (
                      <div className="flex items-start gap-1 mt-1 text-xs text-amber-600 bg-amber-50 rounded p-1.5">
                        <Info size={12} className="flex-shrink-0 mt-0.5" />
                        Se aplica arrastre obligatoriamente antes del período actual.
                      </div>
                    )}
                  </div>
                )}

                {/* Panel de parcialización */}
                {saldoSel?.es_feriado_legal && maxParciales !== null && (
                  <div className={`border-t pt-2 mt-1 space-y-1 ${excedeParcializacion ? 'border-red-200' : 'border-brand-200'}`}>
                    <p className={`text-xs font-medium flex items-center gap-1 ${excedeParcializacion ? 'text-red-600' : 'text-dark-500'}`}>
                      <Info size={12} />
                      Días parcializados del período actual
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-dark-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${excedeParcializacion ? 'bg-red-500' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(((parcialesUsados + (esParcial ? fromActual : 0)) / Math.max(maxParciales, 1)) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold whitespace-nowrap ${excedeParcializacion ? 'text-red-600' : 'text-dark-600'}`}>
                        {parcialesUsados + (esParcial ? fromActual : 0)} / {maxParciales} días
                      </span>
                    </div>
                    {excedeParcializacion && (
                      <p className="text-xs text-red-600">
                        Supera el límite. Solo puede parcializar {parcialesDisponibles} día(s) más del período actual.
                      </p>
                    )}
                    {!excedeParcializacion && esParcial && parcialesDisponibles <= 2 && parcialesDisponibles > 0 && (
                      <p className="text-xs text-amber-600">
                        Solo quedan {parcialesDisponibles} día(s) disponibles para parcializar.
                      </p>
                    )}
                  </div>
                )}

                {/* Advertencia bloque 10 días */}
                {saldoSel?.es_feriado_legal && !saldoSel?.bloque_10_dias_cumplido && (
                  <div className="flex items-start gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                    Recuerda: debes tomar al menos 10 días hábiles consecutivos del período actual en algún momento del año.
                  </div>
                )}

                {saldoInsuficiente && !excedeParcializacion && (
                  <p className="text-red-600 text-xs">Saldo insuficiente para este período</p>
                )}
              </motion.div>
            )}

            {/* Motivo */}
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-1.5">
                <FileText size={14} className="inline mr-1" />
                Motivo (opcional)
              </label>
              <textarea
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                className="input-field resize-none h-20"
                placeholder="Describe brevemente el motivo del permiso..."
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={cargando || saldoInsuficiente || diasSolicitados <= 0}
                className="btn-primary flex-1 justify-center"
              >
                {cargando ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : 'Registrar Solicitud'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
