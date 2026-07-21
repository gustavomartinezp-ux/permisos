import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, FileText, AlertCircle, ArrowLeftRight, Info, Download, Printer, CheckCircle2, ShieldAlert, Wallet, Scale } from 'lucide-react';
import { solicitudesApi, saldosApi, tiposPermisosApi } from '../api/client';
import { descargarFormularioOficial, imprimirFormularioOficial } from '../utils/reportePDF';
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

function toISO(d) { return d.toISOString().split('T')[0]; }

function esDiaHabil(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !FERIADOS.has(toISO(d));
}

function calcularDiasHabiles(inicio, fin) {
  if (!inicio || !fin) return 0;
  const start = new Date(inicio + 'T12:00:00');
  const end   = new Date(fin   + 'T12:00:00');
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
  const fromActual   = diasSolicitados - fromArrastre;
  return { fromArrastre, fromActual };
}

// Calcula fecha_fin para un permiso especial (espejo del backend)
function calcularFechaFinEspecialLocal(fechaInicio, diasFijos, tipoDias) {
  if (!fechaInicio || !diasFijos || !tipoDias) return '';
  const start = new Date(fechaInicio + 'T12:00:00');
  if (tipoDias === 'corridos') {
    const end = new Date(start);
    end.setDate(end.getDate() + diasFijos - 1);
    return toISO(end);
  }
  let count = 0;
  const cur = new Date(start);
  while (count < diasFijos) {
    if (esDiaHabil(cur)) count++;
    if (count < diasFijos) cur.setDate(cur.getDate() + 1);
  }
  return toISO(cur);
}

const LABEL_TIPO_DIAS = {
  corridos:          'días corridos',
  habiles:           'días hábiles',
  habiles_continuos: 'días hábiles continuos',
};

export default function SolicitudModal({ funcionario, onClose, onSuccess }) {
  const [saldos, setSaldos] = useState([]);
  const [tiposEspeciales, setTiposEspeciales] = useState([]);
  const [categoria, setCategoria] = useState('saldos'); // 'saldos' | 'especial'
  const [form, setForm] = useState({
    tipo_permiso_id: '',
    fecha_inicio: '',
    fecha_fin: '',
    motivo: '',
  });
  const [medioDia, setMedioDia]           = useState(false);
  const [jornadaMedioDia, setJornadaMedioDia] = useState('AM');
  const [cargando, setCargando]           = useState(false);
  const [error, setError]                 = useState('');
  const [solicitudCreada, setSolicitudCreada] = useState(null);

  useEffect(() => {
    if (!funcionario) return;
    Promise.all([
      saldosApi.porFuncionario(funcionario.id),
      tiposPermisosApi.listar(),
    ])
      .then(([saldosRes, tiposRes]) => {
        setSaldos(saldosRes.data);
        setTiposEspeciales(tiposRes.data.filter(t => t.es_especial && t.activo));
      })
      .catch(() => toast.error('No se pudieron cargar los tipos de permiso'));
  }, [funcionario]);

  // Tipo seleccionado: puede ser un saldo normal o un tipo especial
  const saldoSel        = saldos.find(s => s.tipo_permiso_id == form.tipo_permiso_id);
  const tipoEspecialSel = tiposEspeciales.find(t => t.id == form.tipo_permiso_id);
  const esEspecial      = !!tipoEspecialSel;

  // Tipos con jornada forzada (ej: ESTAMENTO → PM obligatorio)
  const jornadaForzada = saldoSel?.jornada_forzada || null;

  // Auto-aplicar jornada forzada cuando el tipo lo exige
  useEffect(() => {
    if (jornadaForzada) {
      setMedioDia(true);
      setJornadaMedioDia(jornadaForzada);
    }
  }, [jornadaForzada]);

  // Para tipos especiales: fecha_fin y días calculados automáticamente
  const fechaFinEspecial = esEspecial
    ? calcularFechaFinEspecialLocal(form.fecha_inicio, tipoEspecialSel.dias_fijos, tipoEspecialSel.tipo_dias)
    : '';

  const permiteMedioDia = !esEspecial && saldoSel?.permite_medio_dia === true;
  const diasSolicitados = esEspecial
    ? (tipoEspecialSel.dias_fijos || 0)
    : medioDia
      ? 0.5
      : calcularDiasHabiles(form.fecha_inicio, form.fecha_fin);

  // Saldo para tipos normales
  const arrastreDisp = saldoSel?.es_feriado_legal
    ? ((saldoSel.saldo_arrastre || 0) - (saldoSel.arrastre_usados || 0) - (saldoSel.arrastre_pendientes || 0))
    : 0;
  const actualDisp = saldoSel
    ? saldoSel.dias_asignados - saldoSel.dias_usados - (saldoSel.dias_pendientes || 0)
    : 0;
  const totalDisp = saldoSel?.es_feriado_legal ? arrastreDisp + actualDisp : actualDisp;

  const distribucion = !esEspecial && saldoSel?.es_feriado_legal && diasSolicitados > 0
    ? calcularDistribucion(diasSolicitados, arrastreDisp, actualDisp)
    : null;

  const maxParciales          = saldoSel?.es_feriado_legal ? Math.max((saldoSel.dias_asignados || 0) - 10, 0) : null;
  const parcialesUsados       = saldoSel?.es_feriado_legal ? (saldoSel.dias_parciales_usados || 0) : 0;
  const parcialesDisponibles  = maxParciales !== null ? Math.max(maxParciales - parcialesUsados, 0) : null;
  const fromActual            = distribucion?.fromActual ?? 0;
  const esParcial             = saldoSel?.es_feriado_legal && fromActual > 0 && fromActual < 10;
  const excedeParcializacion  = esParcial && (parcialesUsados + fromActual) > maxParciales;

  const saldoInsuficiente = !esEspecial && !!form.tipo_permiso_id
    && (diasSolicitados > totalDisp || excedeParcializacion);

  const getHorario = (fecha, jornada) => {
    if (!fecha || !jornada) return '';
    const dow = new Date(fecha + 'T12:00:00').getDay();
    if (jornada === 'AM') return dow === 5 ? '08:00 – 12:00 hrs' : '08:00 – 12:30 hrs';
    return dow === 5 ? '12:00 – 16:00 hrs' : '12:30 – 17:00 hrs';
  };

  const handleTipoChange = (e) => {
    setForm({ ...form, tipo_permiso_id: e.target.value, fecha_inicio: '', fecha_fin: '' });
    setMedioDia(false);
    setError('');
  };

  const cambiarCategoria = (cat) => {
    if (cat === categoria) return;
    setCategoria(cat);
    setForm((f) => ({ ...f, tipo_permiso_id: '', fecha_inicio: '', fecha_fin: '' }));
    setMedioDia(false);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (esEspecial) {
      if (!form.fecha_inicio) return setError('Ingresa la fecha de inicio');
      if (!fechaFinEspecial)  return setError('No se pudo calcular la fecha de término');

      setCargando(true);
      try {
        const { data } = await solicitudesApi.crear({
          funcionario_id:   funcionario.id,
          tipo_permiso_id:  parseInt(form.tipo_permiso_id),
          fecha_inicio:     form.fecha_inicio,
          fecha_fin:        fechaFinEspecial,
          dias_solicitados: tipoEspecialSel.dias_fijos,
          motivo:           form.motivo,
        });
        toast.success('Solicitud registrada exitosamente');
        onSuccess?.();
        setSolicitudCreada({
          ...data,
          tipo_nombre:   tipoEspecialSel.nombre,
          es_especial:   true,
          tipo_especial: tipoEspecialSel.tipo_especial,
          _saldoInfo:    {},
        });
      } catch (err) {
        setError(err.response?.data?.error || 'Error al registrar solicitud');
      } finally {
        setCargando(false);
      }
      return;
    }

    // Flujo normal
    if (!medioDia && diasSolicitados <= 0) return setError('Las fechas no son válidas');
    if (medioDia && !jornadaMedioDia)       return setError('Selecciona la jornada AM o PM');
    if (saldoInsuficiente)                  return setError(`Saldo insuficiente. Disponibles: ${totalDisp} días`);

    const fechaFin = medioDia ? form.fecha_inicio : form.fecha_fin;
    setCargando(true);
    try {
      const { data } = await solicitudesApi.crear({
        funcionario_id:    funcionario.id,
        tipo_permiso_id:   parseInt(form.tipo_permiso_id),
        fecha_inicio:      form.fecha_inicio,
        fecha_fin:         fechaFin,
        dias_solicitados:  diasSolicitados,
        motivo:            form.motivo,
        jornada_medio_dia: medioDia ? jornadaMedioDia : undefined,
      });
      const saldoInfo = {
        total_dias:     totalDisp,
        saldo_pendiente: Math.max(totalDisp - diasSolicitados, 0),
        tiene_arrastre:  (saldoSel?.saldo_arrastre || 0) > 0,
      };

      if (data.dividida) {
        // El arrastre debe solicitarse antes que el período actual: quedaron
        // 2 solicitudes independientes, cada una con su propio formato oficial.
        toast.success('Se registraron 2 solicitudes: arrastre debe tramitarse antes del período actual');
        onSuccess?.();
        setSolicitudCreada({
          dividida: true,
          tipo_nombre: saldoSel?.tipo_nombre,
          jornada_medio_dia: medioDia ? jornadaMedioDia : null,
          _saldoInfo: saldoInfo,
          tramos: [
            { ...data.solicitud_arrastre, _etiqueta: `${data.distribucion.fromArrastre} día(s) de arrastre (período anterior)` },
            { ...data.solicitud_actual,   _etiqueta: `${data.distribucion.fromActual} día(s) del período actual` },
          ],
        });
      } else {
        toast.success('Solicitud registrada exitosamente');
        onSuccess?.();
        setSolicitudCreada({
          ...data,
          tipo_nombre:       saldoSel?.tipo_nombre,
          es_feriado_legal:  saldoSel?.es_feriado_legal || false,
          jornada_medio_dia: medioDia ? jornadaMedioDia : null,
          _saldoInfo: saldoInfo,
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar solicitud');
    } finally {
      setCargando(false);
    }
  };

  // ── Pantalla de éxito ─────────────────────────────────────────────────────
  if (solicitudCreada) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center"
          >
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 size={36} className="text-green-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-dark-900 mb-1">
              {solicitudCreada.dividida ? '2 solicitudes registradas' : 'Solicitud registrada'}
            </h2>
            <p className="text-sm text-dark-500 mb-1">
              {funcionario?.nombres} {funcionario?.apellidos}
            </p>

            {solicitudCreada.dividida ? (
              <>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
                  El arrastre del período anterior debe tramitarse antes que el período actual, así que se generaron
                  dos solicitudes independientes.
                </p>
                <div className="space-y-4 mb-2 text-left">
                  {solicitudCreada.tramos.map((tramo) => (
                    <div key={tramo.id} className="rounded-xl border border-dark-200 p-3">
                      <p className="text-sm text-dark-700 mb-2">
                        <span className="font-medium">{solicitudCreada.tipo_nombre}</span>
                        {' · '}N° {String(tramo.id || '').padStart(5, '0')}
                        <span className="block text-xs text-dark-400 mt-0.5">{tramo._etiqueta}</span>
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => descargarFormularioOficial(tramo, funcionario, solicitudCreada._saldoInfo)}
                          className="btn-secondary text-xs py-1.5 px-3 flex-1 justify-center gap-1.5"
                        >
                          <Download size={14} /> PDF
                        </button>
                        <button
                          onClick={() => imprimirFormularioOficial(tramo, funcionario, solicitudCreada._saldoInfo)}
                          className="btn-secondary text-xs py-1.5 px-3 flex-1 justify-center gap-1.5"
                        >
                          <Printer size={14} /> Imprimir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={onClose} className="text-sm text-dark-400 hover:text-dark-600 transition-colors py-2 mt-3">
                  Cerrar
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-dark-500 mb-6">
                  <span className="font-medium text-dark-700">{solicitudCreada.tipo_nombre}</span>
                  {' · '}N° {String(solicitudCreada.id || '').padStart(5, '0')}
                </p>
                <p className="text-sm text-dark-600 mb-5">
                  Descarga o imprime el formato oficial precargado con los datos registrados para obtener las firmas correspondientes.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => descargarFormularioOficial(solicitudCreada, funcionario, solicitudCreada._saldoInfo)}
                    className="btn-primary justify-center gap-2 py-3"
                  >
                    <Download size={17} />
                    Descargar formato oficial (PDF)
                  </button>
                  <button
                    onClick={() => imprimirFormularioOficial(solicitudCreada, funcionario, solicitudCreada._saldoInfo)}
                    className="btn-secondary justify-center gap-2 py-3"
                  >
                    <Printer size={17} />
                    Imprimir formato oficial
                  </button>
                  <button onClick={onClose} className="text-sm text-dark-400 hover:text-dark-600 transition-colors py-2">
                    Cerrar sin imprimir
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Formulario principal ──────────────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1,    opacity: 1, y: 0  }}
          exit={{    scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100 sticky top-0 bg-white z-10">
            <div>
              <h2 className="font-semibold text-dark-900">Nueva Solicitud de Permiso</h2>
              <p className="text-sm text-dark-500">{funcionario?.nombres} {funcionario?.apellidos}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-100 text-dark-400">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Selector de categoría */}
            <div>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-dark-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => cambiarCategoria('saldos')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    categoria === 'saldos' ? 'bg-white text-brand-700 shadow-sm' : 'text-dark-500 hover:text-dark-700'
                  }`}
                >
                  <Wallet size={15} />
                  Permisos con Saldos
                </button>
                <button
                  type="button"
                  onClick={() => cambiarCategoria('especial')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    categoria === 'especial' ? 'bg-white text-purple-700 shadow-sm' : 'text-dark-500 hover:text-dark-700'
                  }`}
                >
                  <Scale size={15} />
                  Permisos por Ley / Especiales
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  categoria === 'saldos' ? 'bg-brand-100 text-brand-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {categoria === 'saldos' ? 'Con saldo anual' : 'Sin descuento de saldo'}
                </span>
                <span className="text-xs text-dark-400">
                  {categoria === 'saldos'
                    ? 'Descuenta días de tu saldo disponible del año'
                    : 'Días fijos establecidos por normativa institucional'}
                </span>
              </div>
            </div>

            {/* Tipo permiso */}
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-1.5">Tipo de Permiso</label>
              {categoria === 'saldos' ? (
                saldos.length > 0 ? (
                  <select value={form.tipo_permiso_id} onChange={handleTipoChange} className="input-field" required>
                    <option value="">Seleccionar tipo...</option>
                    {saldos.map((s) => {
                      const aDisp = s.es_feriado_legal
                        ? ((s.saldo_arrastre || 0) - (s.arrastre_usados || 0) - (s.arrastre_pendientes || 0))
                        : 0;
                      const pDisp = s.dias_asignados - s.dias_usados - (s.dias_pendientes || 0);
                      const tot   = s.es_feriado_legal ? aDisp + pDisp : pDisp;
                      return (
                        <option key={s.tipo_permiso_id} value={s.tipo_permiso_id}>
                          {s.tipo_nombre} — {tot} días disponibles{s.es_feriado_legal && aDisp > 0 ? ` (${aDisp} arrastre)` : ''}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <p className="text-sm text-dark-400 bg-dark-50 rounded-lg p-3">
                    No tienes tipos de permiso con saldo asignado.
                  </p>
                )
              ) : (
                tiposEspeciales.length > 0 ? (
                  <select value={form.tipo_permiso_id} onChange={handleTipoChange} className="input-field" required>
                    <option value="">Seleccionar tipo...</option>
                    {tiposEspeciales.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} — {t.dias_fijos} {LABEL_TIPO_DIAS[t.tipo_dias] || 'días'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-dark-400 bg-dark-50 rounded-lg p-3">
                    No hay permisos especiales configurados.
                  </p>
                )
              )}
            </div>

            {/* Indicador destacado de saldo disponible */}
            {categoria === 'saldos' && saldoSel && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-brand-200 bg-brand-50 p-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-brand-700 flex items-center gap-1.5">
                    <Wallet size={14} />
                    Saldo disponible
                  </span>
                  <span className="text-2xl font-bold text-brand-700 tabular-nums">{totalDisp}</span>
                </div>
                <div className="mt-2 h-1.5 bg-brand-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((totalDisp / Math.max((saldoSel.dias_asignados || 0) + (saldoSel.es_feriado_legal ? (saldoSel.saldo_arrastre || 0) : 0), 1)) * 100, 100)}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="h-full bg-brand-500 rounded-full"
                  />
                </div>
                <p className="text-xs text-brand-600 mt-1.5">
                  Tienes <strong>{totalDisp} de {(saldoSel.dias_asignados || 0) + (saldoSel.es_feriado_legal ? (saldoSel.saldo_arrastre || 0) : 0)}</strong> días disponibles para {saldoSel.tipo_nombre}.
                </p>
              </motion.div>
            )}

            {/* Banner informativo para tipos especiales */}
            {esEspecial && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl border border-purple-200 bg-purple-50 p-3 space-y-1.5"
              >
                <p className="text-xs font-semibold text-purple-800 flex items-center gap-1.5">
                  <ShieldAlert size={13} />
                  Permiso Especial — días calculados automáticamente
                </p>
                <p className="text-xs text-purple-700">
                  <span className="font-medium">{tipoEspecialSel.dias_fijos} {LABEL_TIPO_DIAS[tipoEspecialSel.tipo_dias] || 'días'}</span>
                  {' · '}{tipoEspecialSel.normativa}
                </p>
                {tipoEspecialSel.requiere_certificado && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
                    <AlertCircle size={12} className="flex-shrink-0" />
                    Debe presentar certificado que respalde este permiso.
                  </p>
                )}
              </motion.div>
            )}

            {/* Banner jornada forzada (ESTAMENTO y similares) */}
            {jornadaForzada && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm"
              >
                <p className="font-semibold text-sky-800 flex items-center gap-1.5">
                  <AlertCircle size={13} />
                  Jornada fijada automáticamente por normativa institucional
                </p>
                <p className="text-sky-700 text-xs mt-0.5">
                  Este permiso se registra como <strong>media jornada {jornadaForzada === 'PM' ? 'PM (desde las 13:00 hrs)' : 'AM (hasta las 13:00 hrs)'}</strong>. No puede modificarse.
                </p>
              </motion.div>
            )}

            {/* Toggle día completo / medio día — solo para tipos normales sin jornada forzada */}
            {permiteMedioDia && !jornadaForzada && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMedioDia(false)}
                    className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-all ${
                      !medioDia ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-dark-600 border-dark-200 hover:border-brand-300'
                    }`}>
                    Día completo
                  </button>
                  <button type="button" onClick={() => setMedioDia(true)}
                    className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-all ${
                      medioDia ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-dark-600 border-dark-200 hover:border-brand-300'
                    }`}>
                    Medio día
                  </button>
                </div>

                {medioDia && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setJornadaMedioDia('AM')}
                        className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-all ${
                          jornadaMedioDia === 'AM' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-dark-600 border-dark-200 hover:border-amber-300'
                        }`}>
                        Jornada AM
                      </button>
                      <button type="button" onClick={() => setJornadaMedioDia('PM')}
                        className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-all ${
                          jornadaMedioDia === 'PM' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-dark-600 border-dark-200 hover:border-indigo-300'
                        }`}>
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
            {esEspecial ? (
              /* Permiso especial: solo fecha_inicio; fecha_fin calculada */
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-dark-700 mb-1.5">
                    <Calendar size={14} className="inline mr-1" />
                    Fecha de inicio
                  </label>
                  <input
                    type="date"
                    value={form.fecha_inicio}
                    onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-700 mb-1.5">
                    <Calendar size={14} className="inline mr-1" />
                    Fecha de término
                  </label>
                  <input
                    type="date"
                    value={fechaFinEspecial}
                    readOnly
                    className="input-field bg-dark-50 text-dark-500 cursor-not-allowed"
                    placeholder="Auto-calculada"
                  />
                </div>
              </div>
            ) : (
              /* Permiso normal */
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
            )}

            {/* Resumen para tipos especiales */}
            {esEspecial && form.fecha_inicio && fechaFinEspecial && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="rounded-lg p-3 text-sm bg-purple-50 border border-purple-200"
              >
                <p className="font-medium text-purple-800">
                  {tipoEspecialSel.dias_fijos} {LABEL_TIPO_DIAS[tipoEspecialSel.tipo_dias] || 'días'}
                  {' · '}sin descuento de saldo
                </p>
                <p className="text-xs text-purple-600 mt-0.5">
                  Del {form.fecha_inicio} al {fechaFinEspecial}
                </p>
              </motion.div>
            )}

            {/* Resumen días para tipos normales */}
            {!esEspecial && form.fecha_inicio && form.fecha_fin && diasSolicitados > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className={`rounded-lg p-3 text-sm space-y-2 ${
                  saldoInsuficiente ? 'bg-red-50 border border-red-200' : 'bg-brand-50 border border-brand-200'
                }`}
              >
                <p className={`font-medium ${saldoInsuficiente ? 'text-red-700' : 'text-brand-700'}`}>
                  {diasSolicitados} día(s) hábil(es)
                  {saldoSel && ` de ${totalDisp} disponibles`}
                </p>

                {saldoSel && !saldoInsuficiente && (
                  <div className="flex justify-between text-xs pt-1.5 border-t border-brand-200">
                    <span className="text-dark-500">Saldo restante tras esta solicitud</span>
                    <span className="font-semibold text-dark-700">{Math.max(totalDisp - diasSolicitados, 0)} días</span>
                  </div>
                )}

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
                Motivo {esEspecial ? '' : '(opcional)'}
              </label>
              <textarea
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                className="input-field resize-none h-20"
                placeholder={esEspecial ? 'Descripción breve (opcional)...' : 'Describe brevemente el motivo del permiso...'}
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
                disabled={
                  cargando ||
                  (!esEspecial && (saldoInsuficiente || diasSolicitados <= 0)) ||
                  (esEspecial && !form.fecha_inicio)
                }
                className="btn-primary flex-1 justify-center"
              >
                {cargando
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : 'Registrar Solicitud'
                }
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
