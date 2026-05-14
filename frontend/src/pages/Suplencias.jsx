import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, Search, X, ChevronDown, AlertTriangle, CheckCircle2,
  Clock, RefreshCw, Users, Calendar, FileText, Filter,
  CalendarRange, ArrowRight,
} from 'lucide-react';
import { suplenciasApi, funcionariosApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ─── Constantes ───────────────────────────────────────────────────────────────
const MOTIVOS = {
  licencia_medica:       'Licencia Médica',
  feriado_legal:         'Feriado Legal',
  permiso_administrativo:'Permiso Administrativo',
  permiso_sin_goce:      'Permiso Sin Goce',
  vacancia:              'Vacancia',
  otro:                  'Otro',
};

const ESTADO_STYLES = {
  activa:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  prorrogada: 'bg-blue-100 text-blue-700 border-blue-200',
  finalizada: 'bg-dark-100 text-dark-500 border-dark-200',
};

const ESTADO_ICONS = {
  activa:     CheckCircle2,
  prorrogada: RefreshCw,
  finalizada: Clock,
};

const fmtFecha = (d) => d ? format(parseISO(d.toString().substring(0,10)), 'd MMM yyyy', { locale: es }) : '—';
const hoy = () => new Date().toISOString().split('T')[0];

function EstadoBadge({ estado }) {
  const Icon = ESTADO_ICONS[estado] || Clock;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_STYLES[estado] || ''}`}>
      <Icon size={11} />
      {estado === 'activa' ? 'Activa' : estado === 'prorrogada' ? 'Prorrogada' : 'Finalizada'}
    </span>
  );
}

// ─── Modal: Nueva Suplencia ───────────────────────────────────────────────────
function NuevaSuplenciaModal({ funcionarios, onClose, onSuccess }) {
  const [form, setForm] = useState({
    funcionario_suplente_id: '',
    funcionario_reemplazado_id: '',
    nombre_reemplazado: '',
    rut_reemplazado: '',
    cargo_reemplazado: '',
    unidad: '',
    motivo_reemplazo: '',
    fecha_inicio: '',
    fecha_termino: '',
    observaciones: '',
    documento_respaldo: '',
  });
  const [guardando, setGuardando] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const suplentes = funcionarios.filter(f => f.tipo_contrato === 'Suplencia');
  const reemplazados = funcionarios.filter(f => f.activo !== false);

  const handleReemplazadoChange = (e) => {
    const fid = e.target.value;
    set('funcionario_reemplazado_id', fid);
    if (fid) {
      const f = reemplazados.find(x => x.id == fid);
      if (f) {
        set('nombre_reemplazado', `${f.nombres} ${f.apellidos}`);
        set('rut_reemplazado', f.rut || '');
        set('cargo_reemplazado', f.cargo || '');
      }
    }
  };

  const guardar = async () => {
    if (!form.funcionario_suplente_id) return toast.error('Selecciona el funcionario suplente');
    if (!form.cargo_reemplazado.trim()) return toast.error('El cargo reemplazado es obligatorio');
    if (!form.motivo_reemplazo) return toast.error('Selecciona el motivo de reemplazo');
    if (!form.fecha_inicio || !form.fecha_termino) return toast.error('Las fechas son obligatorias');
    if (form.fecha_inicio > form.fecha_termino) return toast.error('La fecha inicio debe ser anterior al término');
    setGuardando(true);
    try {
      await suplenciasApi.crear({
        ...form,
        funcionario_suplente_id: parseInt(form.funcionario_suplente_id),
        funcionario_reemplazado_id: form.funcionario_reemplazado_id ? parseInt(form.funcionario_reemplazado_id) : null,
      });
      toast.success('Suplencia registrada correctamente');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al registrar suplencia');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
          <h2 className="text-lg font-semibold text-dark-900">Nueva Suplencia</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-100"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Funcionario suplente */}
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-1">
              Funcionario suplente <span className="text-red-500">*</span>
            </label>
            <select
              value={form.funcionario_suplente_id}
              onChange={e => set('funcionario_suplente_id', e.target.value)}
              className="input-field"
            >
              <option value="">— Seleccionar funcionario —</option>
              {suplentes.map(f => (
                <option key={f.id} value={f.id}>{f.apellidos} {f.nombres} — {f.rut}</option>
              ))}
              {suplentes.length === 0 && (
                <optgroup label="Todos los funcionarios">
                  {reemplazados.map(f => (
                    <option key={f.id} value={f.id}>{f.apellidos} {f.nombres} — {f.rut}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {suplentes.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No hay funcionarios con contrato Suplencia. Mostrando todos.</p>
            )}
          </div>

          <div className="border-t border-dark-100 pt-4">
            <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-3">Funcionario reemplazado</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1">Seleccionar del sistema</label>
                <select
                  value={form.funcionario_reemplazado_id}
                  onChange={handleReemplazadoChange}
                  className="input-field text-sm"
                >
                  <option value="">— Externo / manual —</option>
                  {reemplazados.map(f => (
                    <option key={f.id} value={f.id}>{f.apellidos} {f.nombres}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1">RUT reemplazado</label>
                <input
                  type="text"
                  value={form.rut_reemplazado}
                  onChange={e => set('rut_reemplazado', e.target.value)}
                  className="input-field text-sm"
                  placeholder="12.345.678-9"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-dark-700 mb-1">Nombre reemplazado</label>
                <input
                  type="text"
                  value={form.nombre_reemplazado}
                  onChange={e => set('nombre_reemplazado', e.target.value)}
                  className="input-field text-sm"
                  placeholder="Se completa automáticamente al seleccionar del sistema"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1">
                  Cargo reemplazado <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.cargo_reemplazado}
                  onChange={e => set('cargo_reemplazado', e.target.value)}
                  className="input-field text-sm"
                  placeholder="Ej: Enfermera, TENS, Médico..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1">Unidad / CESFAM</label>
                <input
                  type="text"
                  value={form.unidad}
                  onChange={e => set('unidad', e.target.value)}
                  className="input-field text-sm"
                  placeholder="Ej: CESFAM Los Cerros"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-dark-100 pt-4">
            <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-3">Condiciones de la suplencia</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.motivo_reemplazo}
                  onChange={e => set('motivo_reemplazo', e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="">— Seleccionar —</option>
                  {Object.entries(MOTIVOS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1">
                  Fecha inicio <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.fecha_inicio}
                  onChange={e => set('fecha_inicio', e.target.value)}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1">
                  Fecha término <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.fecha_termino}
                  min={form.fecha_inicio}
                  onChange={e => set('fecha_termino', e.target.value)}
                  className="input-field text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1">Documento respaldo</label>
              <input
                type="text"
                value={form.documento_respaldo}
                onChange={e => set('documento_respaldo', e.target.value)}
                className="input-field text-sm"
                placeholder="Ej: Resolución N° 123/2026"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1">Observaciones</label>
              <input
                type="text"
                value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-dark-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="btn-primary flex-1 justify-center">
            {guardando
              ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              : <><Plus size={15} className="mr-1" />Registrar suplencia</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Modal: Prorrogar ─────────────────────────────────────────────────────────
function ProrrogarModal({ suplencia, onClose, onSuccess }) {
  const [fecha, setFecha] = useState('');
  const [obs, setObs] = useState('');
  const [guardando, setGuardando] = useState(false);

  const fechaActual = suplencia.fecha_termino?.toString().substring(0, 10);

  const guardar = async () => {
    if (!fecha) return toast.error('La nueva fecha de término es obligatoria');
    if (fecha <= fechaActual) return toast.error('La nueva fecha debe ser posterior a la actual');
    setGuardando(true);
    try {
      await suplenciasApi.prorrogar(suplencia.id, { nueva_fecha_termino: fecha, observaciones: obs });
      toast.success('Suplencia prorrogada correctamente');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al prorrogar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
          <h2 className="text-lg font-semibold text-dark-900">Prorrogar Suplencia</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-800">
            <p className="font-medium">{suplencia.suplente_nombres} {suplencia.suplente_apellidos}</p>
            <p className="text-xs mt-0.5">
              Término actual: <span className="font-semibold">{fmtFecha(suplencia.fecha_termino)}</span>
            </p>
          </div>
          {suplencia.prorrogas?.length > 0 && (
            <div className="p-3 bg-dark-50 rounded-xl text-xs text-dark-500 space-y-1">
              <p className="font-medium text-dark-600">Prórrogas anteriores:</p>
              {suplencia.prorrogas.map((p, i) => (
                <p key={i}>#{i+1}: {fmtFecha(p.fecha_termino_anterior)} → {fmtFecha(p.nueva_fecha_termino)}</p>
              ))}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-1">
              Nueva fecha de término <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={fecha}
              min={fechaActual}
              onChange={e => setFecha(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-1">Observaciones</label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              className="input-field resize-none"
              rows={2}
              placeholder="Motivo de la prórroga..."
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-dark-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="btn-primary flex-1 justify-center">
            {guardando
              ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              : <><RefreshCw size={15} className="mr-1" />Prorrogar</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Modal: Finalizar ─────────────────────────────────────────────────────────
function FinalizarModal({ suplencia, onClose, onSuccess }) {
  const [obs, setObs] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      await suplenciasApi.finalizar(suplencia.id, { observaciones: obs });
      toast.success('Suplencia finalizada correctamente');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al finalizar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
          <h2 className="text-lg font-semibold text-dark-900">Finalizar Suplencia</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-sm text-amber-800">
            <p className="font-medium">{suplencia.suplente_nombres} {suplencia.suplente_apellidos}</p>
            <p className="text-xs mt-0.5">
              Esta acción marcará la suplencia como FINALIZADA y no podrá modificarse.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-1">Observaciones (opcional)</label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              className="input-field resize-none"
              rows={2}
              placeholder="Motivo de finalización..."
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-dark-100">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 justify-center inline-flex items-center gap-2 font-medium rounded-xl border px-4 py-2 text-sm bg-dark-800 text-white hover:bg-dark-900 border-dark-800 transition-all"
          >
            {guardando
              ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              : <><CheckCircle2 size={15} className="mr-1" />Finalizar</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Fila de suplencia ────────────────────────────────────────────────────────
function FilaSuplencia({ s, esAdmin, onProrrogar, onFinalizar }) {
  const today = hoy();
  const estaVencida = s.estado !== 'finalizada' && s.fecha_termino?.toString().substring(0,10) < today;
  const diasRestantes = s.estado !== 'finalizada'
    ? differenceInDays(new Date(s.fecha_termino), new Date())
    : null;

  const reemplazadoNombre = s.funcionario_reemplazado_id
    ? `${s.reemplazado_nombres_fn || ''} ${s.reemplazado_apellidos_fn || ''}`.trim()
    : s.nombre_reemplazado || '—';

  return (
    <div className={`px-5 py-4 flex flex-col sm:flex-row gap-3 sm:items-center hover:bg-dark-50/50 transition-colors ${estaVencida ? 'bg-red-50/40' : ''}`}>
      {/* Suplente */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-dark-900">
            {s.suplente_apellidos} {s.suplente_nombres}
          </p>
          <EstadoBadge estado={s.estado} />
          {estaVencida && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 border border-red-200">
              <AlertTriangle size={10} />Vencida
            </span>
          )}
          {s.prorrogas?.length > 0 && (
            <span className="text-xs text-blue-600 font-medium">{s.prorrogas.length}× prorrogada</span>
          )}
        </div>
        <p className="text-xs text-dark-400 mt-0.5">{s.suplente_rut} · {s.suplente_cargo || s.cargo_reemplazado}</p>
      </div>

      {/* Reemplazado */}
      <div className="flex-1 min-w-0 hidden sm:block">
        <p className="text-xs font-medium text-dark-700 truncate">{reemplazadoNombre}</p>
        <p className="text-xs text-dark-400">{s.cargo_reemplazado}</p>
        {s.unidad && <p className="text-xs text-dark-400">{s.unidad}</p>}
      </div>

      {/* Motivo */}
      <div className="hidden lg:block w-36 flex-shrink-0">
        <p className="text-xs text-dark-600">{MOTIVOS[s.motivo_reemplazo] || s.motivo_reemplazo}</p>
      </div>

      {/* Fechas */}
      <div className="w-44 flex-shrink-0 text-xs text-dark-500">
        <div className="flex items-center gap-1">
          <span>{fmtFecha(s.fecha_inicio)}</span>
          <ArrowRight size={10} className="text-dark-300" />
          <span className={estaVencida ? 'text-red-600 font-medium' : ''}>{fmtFecha(s.fecha_termino)}</span>
        </div>
        {diasRestantes !== null && !estaVencida && (
          <p className={`mt-0.5 ${diasRestantes <= 7 ? 'text-amber-600 font-medium' : ''}`}>
            {diasRestantes === 0 ? 'Vence hoy' : diasRestantes > 0 ? `${diasRestantes}d restantes` : ''}
          </p>
        )}
      </div>

      {/* Acciones */}
      {esAdmin && s.estado !== 'finalizada' && (
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onProrrogar(s)}
            className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 font-medium transition-colors"
          >
            <RefreshCw size={12} className="inline mr-1" />Prorrogar
          </button>
          <button
            onClick={() => onFinalizar(s)}
            className="text-xs px-3 py-1.5 rounded-lg border border-dark-200 text-dark-600 hover:bg-dark-100 font-medium transition-colors"
          >
            Finalizar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Suplencias() {
  const { esAdmin } = useAuth();
  const [suplencias, setSuplencias]       = useState([]);
  const [alertas, setAlertas]             = useState([]);
  const [stats, setStats]                 = useState(null);
  const [funcionarios, setFuncionarios]   = useState([]);
  const [cargando, setCargando]           = useState(true);
  const [tab, setTab]                     = useState('activas');
  const [q, setQ]                         = useState('');
  const [filtroEstado, setFiltroEstado]   = useState('');
  const [showNueva, setShowNueva]         = useState(false);
  const [prorrogarSup, setProrrogarSup]   = useState(null);
  const [finalizarSup, setFinalizarSup]   = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (q.trim()) params.q = q.trim();

      const [supRes, statsRes, alertasRes, funRes] = await Promise.allSettled([
        suplenciasApi.listar(params),
        suplenciasApi.stats(),
        suplenciasApi.alertas(),
        funcionariosApi.listar(),
      ]);
      if (supRes.status === 'fulfilled')    setSuplencias(supRes.value.data);
      if (statsRes.status === 'fulfilled')  setStats(statsRes.value.data);
      if (alertasRes.status === 'fulfilled') setAlertas(alertasRes.value.data);
      if (funRes.status === 'fulfilled')    setFuncionarios(funRes.value.data);
    } finally {
      setCargando(false);
    }
  }, [filtroEstado, q]);

  useEffect(() => { cargar(); }, [cargar]);

  const suplenciasTab = tab === 'activas'
    ? suplencias.filter(s => s.estado !== 'finalizada')
    : tab === 'historial'
    ? suplencias
    : alertas;

  const today = hoy();

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Suplencias</h1>
          <p className="text-sm text-dark-500 mt-0.5">Control histórico de suplencias institucionales</p>
        </div>
        {esAdmin && (
          <button onClick={() => setShowNueva(true)} className="btn-primary">
            <Plus size={16} />
            Nueva suplencia
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Activas',          value: stats.activas,            color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
            { label: 'Prorrogadas',      value: stats.prorrogadas,        color: 'text-blue-600',    bg: 'bg-blue-50',    icon: RefreshCw },
            { label: 'Próx. a vencer',   value: stats.proximas_vencer,    color: 'text-amber-600',   bg: 'bg-amber-50',   icon: Clock },
            { label: 'Finalizadas',      value: stats.finalizadas,        color: 'text-dark-500',    bg: 'bg-dark-50',    icon: Users },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-4 flex items-center gap-3"
            >
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={20} className={color} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-dark-500">{label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Alerta de suplencias vencidas */}
      {stats?.vencidas_sin_cierre > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-200 text-sm text-red-700">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>
            Hay <strong>{stats.vencidas_sin_cierre}</strong> suplencia{stats.vencidas_sin_cierre > 1 ? 's' : ''} vencida{stats.vencidas_sin_cierre > 1 ? 's' : ''} sin cerrar. Revisa la pestaña Alertas.
          </span>
        </div>
      )}

      {/* Tabs + Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1 bg-dark-100 p-1 rounded-xl">
          {[
            { id: 'activas',   label: 'Vigentes' },
            { id: 'historial', label: 'Historial' },
            { id: 'alertas',   label: `Alertas${alertas.length ? ` (${alertas.length})` : ''}` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? 'bg-white text-dark-900 shadow-sm' : 'text-dark-500 hover:text-dark-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="input-field pl-9 text-sm"
              placeholder="Buscar suplente o reemplazado..."
            />
          </div>
          {tab !== 'alertas' && (
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              className="input-field text-sm w-40"
            >
              <option value="">Todos los estados</option>
              <option value="activa">Activas</option>
              <option value="prorrogada">Prorrogadas</option>
              <option value="finalizada">Finalizadas</option>
            </select>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        {/* Header tabla */}
        <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 bg-dark-50 border-b border-dark-100 text-xs font-semibold text-dark-500 uppercase tracking-wide">
          <span>Suplente</span>
          <span>Reemplaza a</span>
          <span className="hidden lg:block w-36">Motivo</span>
          <span className="w-44">Período</span>
          {esAdmin && <span className="w-32">Acciones</span>}
        </div>

        {cargando ? (
          <div className="py-16 flex justify-center">
            <span className="animate-spin h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : suplenciasTab.length === 0 ? (
          <div className="py-16 text-center text-dark-400 text-sm">
            {tab === 'alertas' ? 'Sin alertas pendientes' : 'Sin suplencias en este filtro'}
          </div>
        ) : (
          <div className="divide-y divide-dark-100">
            {suplenciasTab.map(s => (
              <FilaSuplencia
                key={s.id}
                s={s}
                esAdmin={esAdmin}
                onProrrogar={setProrrogarSup}
                onFinalizar={setFinalizarSup}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modales */}
      <AnimatePresence>
        {showNueva && (
          <NuevaSuplenciaModal
            funcionarios={funcionarios}
            onClose={() => setShowNueva(false)}
            onSuccess={cargar}
          />
        )}
        {prorrogarSup && (
          <ProrrogarModal
            suplencia={prorrogarSup}
            onClose={() => setProrrogarSup(null)}
            onSuccess={cargar}
          />
        )}
        {finalizarSup && (
          <FinalizarModal
            suplencia={finalizarSup}
            onClose={() => setFinalizarSup(null)}
            onSuccess={cargar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
