import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, X, Clock, CheckCircle2, XCircle, AlertCircle,
  Trash2, Calendar, Users, TrendingUp, Hourglass, ChevronDown, ChevronUp,
} from 'lucide-react';
import { horasCompensatoriasApi, solicitudesCompensacionApi, funcionariosApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const TIPO_DIA_BADGE = {
  HABIL:   { label: 'Día hábil',   cls: 'bg-blue-100 text-blue-700',    factor: '×1.25' },
  SABADO:  { label: 'Sábado',      cls: 'bg-amber-100 text-amber-700',   factor: '×1.50' },
  DOMINGO: { label: 'Domingo',     cls: 'bg-orange-100 text-orange-700', factor: '×1.50' },
  FERIADO: { label: 'Feriado',     cls: 'bg-red-100 text-red-700',       factor: '×1.50' },
};

const ESTADO_BADGE = {
  pendiente: 'bg-amber-100 text-amber-700',
  aprobado:  'bg-emerald-100 text-emerald-700',
  rechazado: 'bg-red-100 text-red-700',
  cancelado: 'bg-dark-100 text-dark-500',
};

// ─── Modal: registrar horas (admin) ──────────────────────────────────────────
function RegistrarHorasModal({ funcionarios, onClose, onSuccess }) {
  const [form, setForm] = useState({ funcionario_id: '', fecha_realizacion: '', horas_realizadas: '', observaciones: '' });
  const [preview, setPreview]   = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState('');

  const calcularPreview = useCallback(() => {
    if (!form.fecha_realizacion || !form.horas_realizadas) { setPreview(null); return; }
    const fecha = new Date(form.fecha_realizacion + 'T12:00:00');
    const dow   = fecha.getDay();
    const FERIADOS = new Set([
      '2025-01-01','2025-04-18','2025-04-19','2025-05-01','2025-05-21','2025-06-20',
      '2025-06-29','2025-07-16','2025-08-15','2025-09-18','2025-09-19','2025-10-12',
      '2025-10-31','2025-11-01','2025-12-08','2025-12-25',
      '2026-01-01','2026-04-03','2026-04-04','2026-05-01','2026-05-21','2026-06-19',
      '2026-06-29','2026-07-16','2026-08-15','2026-09-18','2026-09-19','2026-10-12',
      '2026-10-31','2026-11-01','2026-12-08','2026-12-25',
    ]);
    const iso  = form.fecha_realizacion;
    let tipoDia;
    if (FERIADOS.has(iso)) tipoDia = 'FERIADO';
    else if (dow === 6) tipoDia = 'SABADO';
    else if (dow === 0) tipoDia = 'DOMINGO';
    else tipoDia = 'HABIL';

    const factor = tipoDia === 'HABIL' ? 1.25 : 1.50;
    const horas  = parseFloat(form.horas_realizadas) || 0;
    setPreview({ tipoDia, factor, horasComp: +(horas * factor).toFixed(2) });
  }, [form.fecha_realizacion, form.horas_realizadas]);

  useEffect(() => { calcularPreview(); }, [calcularPreview]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.funcionario_id) return setError('Selecciona un funcionario');
    setCargando(true);
    try {
      await horasCompensatoriasApi.registrar(form);
      toast.success('Horas registradas correctamente');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
          <h2 className="font-semibold text-dark-900">Registrar Horas Extraordinarias</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">Funcionario <span className="text-red-500">*</span></label>
            <select value={form.funcionario_id}
              onChange={(e) => setForm({ ...form, funcionario_id: e.target.value })}
              className="input-field" required>
              <option value="">Seleccionar funcionario...</option>
              {funcionarios.map(f => (
                <option key={f.id} value={f.id}>{f.nombres} {f.apellidos} — {f.cargo}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">
                <Calendar size={12} className="inline mr-1" />
                Fecha de realización <span className="text-red-500">*</span>
              </label>
              <input type="date" value={form.fecha_realizacion}
                onChange={(e) => setForm({ ...form, fecha_realizacion: e.target.value })}
                className="input-field" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">
                Horas realizadas <span className="text-red-500">*</span>
              </label>
              <input type="number" step="0.25" min="0.25" max="24"
                value={form.horas_realizadas}
                onChange={(e) => setForm({ ...form, horas_realizadas: e.target.value })}
                className="input-field" placeholder="Ej: 4" required />
            </div>
          </div>

          {/* Preview de cálculo */}
          {preview && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`rounded-xl p-3 border text-sm ${
                preview.factor === 1.50
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-blue-50 border-blue-200'
              }`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIPO_DIA_BADGE[preview.tipoDia]?.cls}`}>
                  {TIPO_DIA_BADGE[preview.tipoDia]?.label}
                </span>
                <span className={`text-xs font-bold ${preview.factor === 1.50 ? 'text-orange-700' : 'text-blue-700'}`}>
                  Factor {preview.factor}
                </span>
              </div>
              <p className={`text-sm font-semibold ${preview.factor === 1.50 ? 'text-orange-800' : 'text-blue-800'}`}>
                {form.horas_realizadas} hrs × {preview.factor} = <span className="text-lg">{preview.horasComp}</span> hrs compensatorias
              </p>
            </motion.div>
          )}

          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">Observaciones</label>
            <textarea value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              className="input-field resize-none h-16 text-sm"
              placeholder="Contexto o descripción de las horas (opcional)" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle size={15} />{error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={cargando} className="btn-primary flex-1 justify-center">
              {cargando
                ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                : 'Registrar Horas'
              }
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Modal: solicitar compensación (funcionario) ──────────────────────────────
function SolicitarCompModal({ funcionario, saldo, onClose, onSuccess }) {
  const [form, setForm] = useState({ fecha_inicio: '', fecha_fin: '', horas_solicitadas: '', motivo: '' });
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (parseFloat(form.horas_solicitadas) > saldo) {
      return setError(`Saldo insuficiente. Disponible: ${saldo} hrs`);
    }
    setCargando(true);
    try {
      await solicitudesCompensacionApi.crear({
        ...form,
        funcionario_id:   funcionario.id,
        horas_solicitadas: parseFloat(form.horas_solicitadas),
      });
      toast.success('Solicitud registrada');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
          <h2 className="font-semibold text-dark-900">Solicitar Compensación</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-center">
            <p className="text-xs text-teal-600 font-medium">Saldo disponible</p>
            <p className="text-2xl font-bold text-teal-700">{saldo} hrs</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Fecha inicio</label>
              <input type="date" value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className="input-field" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Fecha fin</label>
              <input type="date" value={form.fecha_fin} min={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                className="input-field" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">Horas a compensar</label>
            <input type="number" step="0.25" min="0.25" max={saldo}
              value={form.horas_solicitadas}
              onChange={(e) => setForm({ ...form, horas_solicitadas: e.target.value })}
              className="input-field" placeholder="Ej: 4" required />
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">Motivo (opcional)</label>
            <textarea value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              className="input-field resize-none h-16 text-sm" placeholder="Describe brevemente..." />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle size={15} />{error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={cargando || !form.horas_solicitadas} className="btn-primary flex-1 justify-center">
              {cargando
                ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                : 'Solicitar'
              }
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function HorasCompensatorias() {
  const { esAdmin, esFuncionario, usuario } = useAuth();

  const [data, setData]               = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [modalRegistrar, setModalRegistrar]   = useState(false);
  const [modalSolicitar, setModalSolicitar]   = useState(false);
  const [procesando, setProcesando]   = useState(null);
  const [expandido, setExpandido]     = useState({});

  const funcionarioId = esFuncionario ? usuario?.funcionario_id : null;

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const dataRes = await (esFuncionario
        ? horasCompensatoriasApi.porFuncionario(funcionarioId)
        : horasCompensatoriasApi.listar());
      setData(dataRes.data);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error desconocido';
      toast.error(`Horas: ${msg}`);
      console.error('horas-compensatorias error:', err?.response?.status, err?.response?.data);
    }

    try {
      const solRes = await solicitudesCompensacionApi.listar(
        esFuncionario ? { funcionario_id: funcionarioId } : {}
      );
      setSolicitudes(solRes.data);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error desconocido';
      toast.error(`Solicitudes comp.: ${msg}`);
      console.error('solicitudes-compensacion error:', err?.response?.status, err?.response?.data);
    }

    setCargando(false);
  }, [esFuncionario, funcionarioId]);

  useEffect(() => {
    cargar();
    if (esAdmin) {
      funcionariosApi.listar({ activo: true, limit: 200 })
        .then(({ data }) => setFuncionarios(Array.isArray(data) ? data : data.funcionarios || []))
        .catch(() => {});
    }
  }, [cargar, esAdmin]);

  const anularRegistro = async (id) => {
    if (!confirm('¿Anular este registro de horas?')) return;
    try {
      await horasCompensatoriasApi.anular(id);
      toast.success('Registro anulado');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al anular');
    }
  };

  const aprobarSolicitud = async (id) => {
    setProcesando(id);
    try {
      await solicitudesCompensacionApi.aprobar(id);
      toast.success('Solicitud aprobada — horas descontadas');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aprobar');
    } finally {
      setProcesando(null);
    }
  };

  const rechazarSolicitud = async (id) => {
    setProcesando(id);
    try {
      await solicitudesCompensacionApi.rechazar(id);
      toast.success('Solicitud rechazada');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al rechazar');
    } finally {
      setProcesando(null);
    }
  };

  const cancelarSolicitud = async (id) => {
    setProcesando(id);
    try {
      await solicitudesCompensacionApi.cancelar(id);
      toast.success('Solicitud cancelada');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cancelar');
    } finally {
      setProcesando(null);
    }
  };

  // Saldo del funcionario logueado (para vista funcionario)
  const saldo = esFuncionario ? (data?.saldo || null) : null;

  // Para vista admin: agrupar registros por funcionario
  const registrosAdmin = !esFuncionario ? (Array.isArray(data) ? data : []) : [];

  // Para vista funcionario: los registros están en data.registros
  const registrosFuncionario = esFuncionario ? (data?.registros || []) : [];

  if (cargando) {
    return (
      <div className="p-6 space-y-4">
        {[1,2,3].map(i => <div key={i} className="card h-24 animate-pulse bg-dark-100" />)}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Horas Compensatorias</h1>
          <p className="text-dark-500 text-sm mt-0.5">
            {esFuncionario ? 'Tu saldo y solicitudes de compensación' : 'Gestión institucional de horas extraordinarias'}
          </p>
        </div>
        <div className="flex gap-2">
          {esAdmin && (
            <button onClick={() => setModalRegistrar(true)} className="btn-primary">
              <Plus size={16} />
              Registrar Horas
            </button>
          )}
          {esFuncionario && saldo && (
            <button onClick={() => setModalSolicitar(true)} className="btn-primary"
              disabled={saldo.saldo_disponible <= 0}>
              <Plus size={16} />
              Solicitar Compensación
            </button>
          )}
        </div>
      </div>

      {/* ── Vista funcionario: tarjetas de saldo ── */}
      {esFuncionario && saldo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Horas ganadas',   value: saldo.horas_ganadas,    color: 'bg-teal-500',   icon: TrendingUp },
            { label: 'Horas usadas',    value: saldo.horas_usadas,     color: 'bg-blue-500',   icon: Clock },
            { label: 'Pendientes',      value: saldo.horas_pendientes, color: 'bg-amber-500',  icon: Hourglass },
            { label: 'Saldo disponible',value: saldo.saldo_disponible, color: 'bg-emerald-500',icon: CheckCircle2 },
          ].map(({ label, value, color, icon: Icon }) => (
            <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-dark-500 mb-1">{label}</p>
                  <p className="text-2xl font-bold text-dark-900">{value}</p>
                  <p className="text-xs text-dark-400">hrs</p>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon size={18} className="text-white" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Panel explicativo de factores ── */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-4 border-l-4 border-blue-400">
          <p className="text-xs font-semibold text-blue-700 mb-1">Días hábiles (lunes a viernes)</p>
          <p className="text-2xl font-bold text-blue-800">× 1.25</p>
          <p className="text-xs text-dark-500 mt-0.5">1 hora trabajada = 1.25 hrs compensatorias</p>
          <p className="text-xs text-dark-400 mt-1">Ej: 4 hrs → 5 hrs compensatorias</p>
        </div>
        <div className="card p-4 border-l-4 border-orange-400">
          <p className="text-xs font-semibold text-orange-700 mb-1">Sábados, domingos y feriados</p>
          <p className="text-2xl font-bold text-orange-800">× 1.50</p>
          <p className="text-xs text-dark-500 mt-0.5">1 hora trabajada = 1.50 hrs compensatorias</p>
          <p className="text-xs text-dark-400 mt-1">Ej: 4 hrs → 6 hrs compensatorias</p>
        </div>
      </div>

      {/* ── Solicitudes pendientes (admin/supervisor) ── */}
      {!esFuncionario && (() => {
        const pendientes = solicitudes.filter(s => s.estado === 'pendiente');
        if (!pendientes.length) return null;
        return (
          <div className="card">
            <div className="px-5 py-4 border-b border-dark-100 flex items-center gap-2">
              <Hourglass size={16} className="text-amber-500" />
              <h2 className="font-semibold text-dark-800">Solicitudes pendientes</h2>
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">{pendientes.length}</span>
            </div>
            <div className="divide-y divide-dark-100">
              {pendientes.map(sol => (
                <div key={sol.id} className="px-5 py-3.5 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-800">{sol.nombres} {sol.apellidos}</p>
                    <p className="text-xs text-dark-400">
                      {format(parseISO(sol.fecha_inicio), 'd MMM', { locale: es })} –{' '}
                      {format(parseISO(sol.fecha_fin), 'd MMM yyyy', { locale: es })}
                      {' · '}<span className="font-semibold text-teal-700">{sol.horas_solicitadas} hrs</span>
                    </p>
                    {sol.motivo && <p className="text-xs text-dark-400 truncate">{sol.motivo}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => aprobarSolicitud(sol.id)} disabled={procesando === sol.id}
                      className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      title="Aprobar">
                      {procesando === sol.id
                        ? <span className="animate-spin h-4 w-4 border-2 border-emerald-600 border-t-transparent rounded-full block" />
                        : <CheckCircle2 size={16} />}
                    </button>
                    <button onClick={() => rechazarSolicitud(sol.id)} disabled={procesando === sol.id}
                      className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                      title="Rechazar">
                      <XCircle size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Registros admin: agrupados por funcionario ── */}
      {!esFuncionario && registrosAdmin.length > 0 && (() => {
        const porFuncionario = registrosAdmin.reduce((acc, r) => {
          const key = r.funcionario_id;
          if (!acc[key]) acc[key] = { nombres: r.nombres, apellidos: r.apellidos, rut: r.rut, registros: [] };
          acc[key].registros.push(r);
          return acc;
        }, {});

        return (
          <div className="card">
            <div className="px-5 py-4 border-b border-dark-100 flex items-center gap-2">
              <Users size={16} className="text-brand-500" />
              <h2 className="font-semibold text-dark-800">Registros por funcionario</h2>
            </div>
            <div className="divide-y divide-dark-100">
              {Object.entries(porFuncionario).map(([fid, { nombres, apellidos, rut, registros }]) => {
                const ganadas  = registros.filter(r => r.estado === 'activo').reduce((a, r) => a + parseFloat(r.horas_compensatorias), 0);
                const isOpen   = expandido[fid];
                return (
                  <div key={fid}>
                    <button
                      onClick={() => setExpandido(p => ({ ...p, [fid]: !p[fid] }))}
                      className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-dark-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-dark-800">{nombres} {apellidos}</p>
                        <p className="text-xs text-dark-400">{rut} · {registros.length} registro(s)</p>
                      </div>
                      <span className="text-sm font-bold text-teal-700">{ganadas.toFixed(2)} hrs</span>
                      {isOpen ? <ChevronUp size={15} className="text-dark-400" /> : <ChevronDown size={15} className="text-dark-400" />}
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden bg-dark-50"
                        >
                          {registros.map(r => (
                            <div key={r.id} className={`px-8 py-2.5 flex items-center gap-3 border-b border-dark-100 last:border-0 ${r.estado === 'anulado' ? 'opacity-40' : ''}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs font-medium text-dark-700">
                                    {format(parseISO(r.fecha_realizacion), 'd MMM yyyy', { locale: es })}
                                  </p>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_DIA_BADGE[r.tipo_dia]?.cls}`}>
                                    {TIPO_DIA_BADGE[r.tipo_dia]?.label}
                                  </span>
                                  <span className="text-xs text-dark-500">{TIPO_DIA_BADGE[r.tipo_dia]?.factor}</span>
                                  {r.estado === 'anulado' && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Anulado</span>}
                                </div>
                                <p className="text-xs text-dark-400 mt-0.5">
                                  {r.horas_realizadas} hrs → <span className="font-semibold text-teal-700">{r.horas_compensatorias} hrs comp.</span>
                                  {r.observaciones && ` · ${r.observaciones}`}
                                </p>
                              </div>
                              {r.estado === 'activo' && esAdmin && (
                                <button onClick={() => anularRegistro(r.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-100 text-dark-400 hover:text-red-600 transition-colors"
                                  title="Anular registro">
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Vista funcionario: registros propios ── */}
      {esFuncionario && registrosFuncionario.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-dark-100 flex items-center gap-2">
            <Clock size={16} className="text-teal-500" />
            <h2 className="font-semibold text-dark-800">Mis horas registradas</h2>
          </div>
          <div className="divide-y divide-dark-100">
            {registrosFuncionario.map(r => (
              <div key={r.id} className={`px-5 py-3 flex items-center gap-3 ${r.estado === 'anulado' ? 'opacity-40' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-dark-700">
                      {format(parseISO(r.fecha_realizacion), 'd MMM yyyy', { locale: es })}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_DIA_BADGE[r.tipo_dia]?.cls}`}>
                      {TIPO_DIA_BADGE[r.tipo_dia]?.label} {TIPO_DIA_BADGE[r.tipo_dia]?.factor}
                    </span>
                    {r.estado === 'anulado' && <span className="text-xs bg-red-100 text-red-600 px-1.5 rounded-full">Anulado</span>}
                  </div>
                  <p className="text-xs text-dark-400 mt-0.5">
                    {r.horas_realizadas} hrs trabajadas → <span className="font-semibold text-teal-700">{r.horas_compensatorias} hrs compensatorias</span>
                    {r.observaciones && ` · ${r.observaciones}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Mis solicitudes (funcionario) ── */}
      {esFuncionario && solicitudes.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-dark-100 flex items-center gap-2">
            <Calendar size={16} className="text-brand-500" />
            <h2 className="font-semibold text-dark-800">Mis solicitudes de compensación</h2>
          </div>
          <div className="divide-y divide-dark-100">
            {solicitudes.map(sol => (
              <div key={sol.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-dark-800">
                      {format(parseISO(sol.fecha_inicio), 'd MMM', { locale: es })} –{' '}
                      {format(parseISO(sol.fecha_fin), 'd MMM yyyy', { locale: es })}
                    </p>
                    <span className="text-sm font-bold text-teal-700">{sol.horas_solicitadas} hrs</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ESTADO_BADGE[sol.estado]}`}>
                      {sol.estado}
                    </span>
                  </div>
                  {sol.motivo && <p className="text-xs text-dark-400 truncate mt-0.5">{sol.motivo}</p>}
                </div>
                {sol.estado === 'pendiente' && (
                  <button onClick={() => cancelarSolicitud(sol.id)} disabled={procesando === sol.id}
                    className="p-1.5 rounded-lg hover:bg-red-100 text-dark-400 hover:text-red-600 transition-colors"
                    title="Cancelar">
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!cargando && registrosAdmin.length === 0 && registrosFuncionario.length === 0 && (
        <div className="card p-10 text-center">
          <Clock size={36} className="mx-auto mb-3 text-dark-300" />
          <p className="text-dark-500 font-medium">No hay registros de horas compensatorias</p>
          {esAdmin && <p className="text-dark-400 text-sm mt-1">Usa "Registrar Horas" para acreditar horas extraordinarias</p>}
        </div>
      )}

      <AnimatePresence>
        {modalRegistrar && (
          <RegistrarHorasModal
            funcionarios={funcionarios}
            onClose={() => setModalRegistrar(false)}
            onSuccess={cargar}
          />
        )}
        {modalSolicitar && saldo && (
          <SolicitarCompModal
            funcionario={{ id: funcionarioId }}
            saldo={saldo.saldo_disponible}
            onClose={() => setModalSolicitar(false)}
            onSuccess={cargar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
