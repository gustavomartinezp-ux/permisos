import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, Search, X, MapPin, Car, FileCheck, AlertTriangle,
  CheckCircle2, Clock, XCircle, Briefcase,
} from 'lucide-react';
import { cometidosComisionesApi, funcionariosApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const fmtFecha = (d) => d ? format(parseISO(d.toString().substring(0, 10)), 'd MMM yyyy', { locale: es }) : '—';

const ESTADO_STYLES = {
  pendiente:          'bg-amber-100 text-amber-700 border-amber-200',
  aprobado_jefatura:  'bg-blue-100 text-blue-700 border-blue-200',
  aprobado_direccion: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rechazado:          'bg-red-100 text-red-700 border-red-200',
};
const ESTADO_LABEL = {
  pendiente: 'Pendiente', aprobado_jefatura: 'Aprobado Jefatura',
  aprobado_direccion: 'Aprobado Dirección', rechazado: 'Rechazado',
};
const ESTADO_ICON = {
  pendiente: Clock, aprobado_jefatura: FileCheck, aprobado_direccion: CheckCircle2, rechazado: XCircle,
};

function EstadoBadge({ estado }) {
  const Icon = ESTADO_ICON[estado] || Clock;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_STYLES[estado]}`}>
      <Icon size={11} />
      {ESTADO_LABEL[estado]}
    </span>
  );
}

// ─── Modal: Nueva solicitud ────────────────────────────────────────────────────
function NuevaSolicitudModal({ funcionarios, funcionarioPropio, onClose, onSuccess }) {
  const [tipo, setTipo] = useState('cometido');
  const [form, setForm] = useState({
    funcionario_id: funcionarioPropio?.funcionario_id || '', origen: '', destino: '', motivo: '', fecha_inicio: '', fecha_fin: '',
    sale_de_comuna: false, sale_de_region: false, requiere_movilizacion: false, monto_movilizacion: '',
    vehiculo_institucional: '', pernocta: false, decreto_asociado: '', documento_respaldo: '',
    requiere_viatico: false, monto_viatico: '',
  });
  const [busqueda, setBusqueda] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [limite, setLimite] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const dropdownRef = useRef(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const sugerencias = busqueda.length >= 1
    ? funcionarios.filter((f) => `${f.nombres} ${f.apellidos} ${f.rut || ''}`.toLowerCase().includes(busqueda.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    const clickFuera = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', clickFuera);
    return () => document.removeEventListener('mousedown', clickFuera);
  }, []);

  // Muestra el cupo anual disponible de Comisión de Servicio apenas se elige
  // el funcionario — para que jefatura/RRHH vean el límite ANTES de enviar.
  useEffect(() => {
    if (tipo !== 'comision' || !form.funcionario_id) { setLimite(null); return; }
    const anio = form.fecha_inicio ? new Date(`${form.fecha_inicio}T12:00:00`).getFullYear() : new Date().getFullYear();
    cometidosComisionesApi.limiteComision(form.funcionario_id, anio)
      .then(({ data }) => setLimite(data))
      .catch(() => setLimite(null));
  }, [tipo, form.funcionario_id, form.fecha_inicio]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.funcionario_id) return toast.error('Selecciona un funcionario');
    if (!form.origen || !form.destino || !form.motivo) return toast.error('Completa origen, destino y motivo');
    if (!form.fecha_inicio || !form.fecha_fin) return toast.error('Ingresa las fechas');
    if (form.fecha_fin < form.fecha_inicio) return toast.error('La fecha de fin no puede ser anterior a la de inicio');
    if (tipo === 'comision' && !form.decreto_asociado) return toast.error('La Comisión de Servicio requiere N° de Decreto/Resolución');

    setGuardando(true);
    try {
      await cometidosComisionesApi.crear({ ...form, tipo });
      toast.success('Solicitud registrada');
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al registrar la solicitud');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 z-10 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-dark-900">Nueva solicitud</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400"><X size={18} /></button>
        </div>

        {/* Selector de tipo */}
        <div className="flex rounded-xl border border-dark-200 overflow-hidden mb-5 text-sm font-medium">
          <button type="button" onClick={() => setTipo('cometido')}
            className={`flex-1 py-2.5 transition-colors ${tipo === 'cometido' ? 'bg-brand-600 text-white' : 'bg-white text-dark-600 hover:bg-dark-50'}`}>
            Cometido Funcionario
          </button>
          <button type="button" onClick={() => setTipo('comision')}
            className={`flex-1 py-2.5 transition-colors ${tipo === 'comision' ? 'bg-brand-600 text-white' : 'bg-white text-dark-600 hover:bg-dark-50'}`}>
            Comisión de Servicio
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {funcionarioPropio ? (
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Funcionario</label>
              <div className="input-field bg-dark-50 text-dark-600">
                {funcionarioPropio.nombres} {funcionarioPropio.apellidos} (tú)
              </div>
            </div>
          ) : (
            <div ref={dropdownRef} className="relative">
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Funcionario</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                <input type="text" value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setShowDropdown(true); set('funcionario_id', ''); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar por nombre o RUT..." className="input-field pl-9" />
              </div>
              {showDropdown && sugerencias.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-dark-200 shadow-lg max-h-48 overflow-y-auto">
                  {sugerencias.map((f) => (
                    <button type="button" key={f.id}
                      onClick={() => { set('funcionario_id', f.id); setBusqueda(`${f.nombres} ${f.apellidos}`); setShowDropdown(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-dark-50 flex flex-col">
                      <span className="font-medium text-dark-800">{f.nombres} {f.apellidos}</span>
                      <span className="text-xs text-dark-400">{f.rut} · {f.cargo}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {limite && (
            <div className={`rounded-xl p-3 text-xs flex items-start gap-2 ${limite.dias_disponibles > 0 ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Lleva <strong>{limite.dias_acumulados}</strong> de 90 días de Comisión de Servicio usados en {limite.anio}.
                Disponibles: <strong>{limite.dias_disponibles}</strong> día(s).
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Origen</label>
              <input type="text" value={form.origen} onChange={(e) => set('origen', e.target.value)} className="input-field" placeholder="CESFAM Los Cerros" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Destino</label>
              <input type="text" value={form.destino} onChange={(e) => set('destino', e.target.value)} className="input-field" placeholder="DAS / lugar de terreno" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">Motivo</label>
            <textarea value={form.motivo} onChange={(e) => set('motivo', e.target.value)} className="input-field" rows={2} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Fecha inicio</label>
              <input type="date" value={form.fecha_inicio} onChange={(e) => set('fecha_inicio', e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Fecha fin</label>
              <input type="date" value={form.fecha_fin} onChange={(e) => set('fecha_fin', e.target.value)} className="input-field" required />
            </div>
          </div>

          {/* Campos condicionales */}
          {tipo === 'cometido' ? (
            <div className="space-y-3 rounded-xl bg-dark-50 p-4 border border-dark-200">
              <p className="text-xs font-semibold text-dark-700 flex items-center gap-1.5"><MapPin size={13} /> Detalle del cometido</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.sale_de_comuna} onChange={(e) => set('sale_de_comuna', e.target.checked)} />
                  Sale de la comuna
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.sale_de_region} onChange={(e) => set('sale_de_region', e.target.checked)} />
                  Sale de la región
                </label>
              </div>
              {(form.sale_de_comuna || form.sale_de_region) && (
                <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5">✓ Corresponde viático (sale de la comuna/región)</p>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.requiere_movilizacion} onChange={(e) => set('requiere_movilizacion', e.target.checked)} />
                Requiere gasto de movilización
              </label>
              {form.requiere_movilizacion && (
                <input type="number" min="0" value={form.monto_movilizacion} onChange={(e) => set('monto_movilizacion', e.target.value)}
                  placeholder="Monto movilización ($)" className="input-field" />
              )}
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1.5 flex items-center gap-1.5"><Car size={13} /> Vehículo institucional (opcional)</label>
                <input type="text" value={form.vehiculo_institucional} onChange={(e) => set('vehiculo_institucional', e.target.value)}
                  placeholder="Patente / identificador" className="input-field" />
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl bg-dark-50 p-4 border border-dark-200">
              <p className="text-xs font-semibold text-dark-700 flex items-center gap-1.5"><Briefcase size={13} /> Detalle de la comisión</p>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1.5">N° Decreto Alcaldicio / Resolución Exenta</label>
                <input type="text" value={form.decreto_asociado} onChange={(e) => set('decreto_asociado', e.target.value)} className="input-field" required />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.pernocta} onChange={(e) => set('pernocta', e.target.checked)} />
                Pernocta (viático completo; si no, parcial)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.requiere_viatico} onChange={(e) => set('requiere_viatico', e.target.checked)} />
                Requiere viático
              </label>
              {form.requiere_viatico && (
                <input type="number" min="0" value={form.monto_viatico} onChange={(e) => set('monto_viatico', e.target.value)}
                  placeholder="Monto viático ($)" className="input-field" />
              )}
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1.5">Justificación / documento de respaldo (opcional)</label>
                <textarea value={form.documento_respaldo} onChange={(e) => set('documento_respaldo', e.target.value)} className="input-field" rows={2}
                  placeholder="Descripción o referencia del documento adjunto" />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary flex-1 justify-center">
              {guardando ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : 'Enviar solicitud'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function CometidosComisiones() {
  const { esAdmin, esSupervisor, esSoloAutoservicio, usuario, tienePermiso } = useAuth();
  const puedeAprobarDireccion = tienePermiso('solicitudes.aprobar');
  const [solicitudes, setSolicitudes] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [rechazando, setRechazando] = useState(null);
  const [obsRechazo, setObsRechazo] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    // GET /funcionarios devuelve 403 para un funcionario en autoservicio puro
    // (y el interceptor global trata cualquier 403 como sesión inválida y
    // fuerza logout) — no se pide esa lista si no la va a poder ver de todos
    // modos, ya que solo puede solicitar para sí mismo.
    Promise.all([
      cometidosComisionesApi.listar(filtroTipo ? { tipo: filtroTipo } : {}),
      esSoloAutoservicio ? Promise.resolve({ data: [] }) : funcionariosApi.listar(),
    ])
      .then(([sol, func]) => { setSolicitudes(sol.data); setFuncionarios(func.data); })
      .catch(() => toast.error('Error al cargar solicitudes'))
      .finally(() => setCargando(false));
  }, [filtroTipo, esSoloAutoservicio]);

  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (fn, mensaje) => {
    try {
      await fn();
      toast.success(mensaje);
      cargar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al procesar la acción');
    }
  };

  const confirmarRechazo = async () => {
    await accion(() => cometidosComisionesApi.rechazar(rechazando.id, obsRechazo), 'Solicitud rechazada');
    setRechazando(null);
    setObsRechazo('');
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Cometidos y Comisiones de Servicio</h1>
          <p className="text-dark-500 text-sm mt-0.5">Ley 19.378 / Ley 18.883 — Atención Primaria de Salud</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} />
          <span className="hidden sm:inline">Nueva solicitud</span>
        </button>
      </div>

      <div className="flex gap-2">
        {[['', 'Todos'], ['cometido', 'Cometidos'], ['comision', 'Comisiones']].map(([val, label]) => (
          <button key={val} onClick={() => setFiltroTipo(val)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filtroTipo === val ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-dark-600 border-dark-200 hover:bg-dark-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="card h-24 animate-pulse bg-dark-100" />)}</div>
      ) : solicitudes.length === 0 ? (
        <div className="text-center py-16 text-dark-400">
          <Briefcase size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin solicitudes registradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {solicitudes.map((s) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold uppercase tracking-wide text-dark-500">
                      {s.tipo === 'cometido' ? 'Cometido Funcionario' : 'Comisión de Servicio'}
                    </span>
                    <EstadoBadge estado={s.estado} />
                  </div>
                  <p className="font-semibold text-sm text-dark-800 mt-1">{s.nombres} {s.apellidos}</p>
                  <p className="text-xs text-dark-500">{s.origen} → {s.destino} · {fmtFecha(s.fecha_inicio)} — {fmtFecha(s.fecha_fin)} ({s.dias}d)</p>
                  <p className="text-xs text-dark-400 mt-1">{s.motivo}</p>
                  {s.decreto_asociado && <p className="text-xs text-dark-400">Decreto/Resolución: {s.decreto_asociado}</p>}
                  {s.requiere_viatico && <p className="text-xs text-blue-600">Viático {s.tipo_viatico}{s.monto_viatico ? ` · $${s.monto_viatico}` : ''}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {s.estado === 'pendiente' && (esAdmin || esSupervisor) && (
                    <button onClick={() => accion(() => cometidosComisionesApi.aprobarJefatura(s.id), 'Aprobado por jefatura')} className="btn-secondary text-xs py-1.5 px-3">
                      Aprobar jefatura
                    </button>
                  )}
                  {(s.estado === 'pendiente' || s.estado === 'aprobado_jefatura') && puedeAprobarDireccion && (
                    <button onClick={() => accion(() => cometidosComisionesApi.aprobarDireccion(s.id), 'Aprobado por dirección')} className="btn-primary text-xs py-1.5 px-3">
                      Aprobar dirección
                    </button>
                  )}
                  {(s.estado === 'pendiente' || s.estado === 'aprobado_jefatura') && (esAdmin || esSupervisor || puedeAprobarDireccion) && (
                    <button onClick={() => setRechazando(s)} className="btn-secondary text-xs py-1.5 px-3 text-red-600 border-red-200 hover:bg-red-50">
                      Rechazar
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <NuevaSolicitudModal
            funcionarios={funcionarios}
            funcionarioPropio={esSoloAutoservicio ? usuario : null}
            onClose={() => setShowModal(false)}
            onSuccess={() => { setShowModal(false); cargar(); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rechazando && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setRechazando(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
              <p className="text-sm font-medium text-dark-800 mb-3">¿Rechazar esta solicitud?</p>
              <textarea value={obsRechazo} onChange={(e) => setObsRechazo(e.target.value)} placeholder="Motivo del rechazo (opcional)" className="input-field mb-4" rows={2} />
              <div className="flex gap-3">
                <button onClick={() => setRechazando(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button onClick={confirmarRechazo} className="flex-1 justify-center inline-flex items-center gap-2 font-medium rounded-xl border bg-red-600 text-white border-red-600 hover:bg-red-700 py-2">Rechazar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
