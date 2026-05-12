import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Pencil, X, Tag, ToggleLeft, ToggleRight, AlertCircle,
  Building2, Briefcase, Settings, RefreshCw, Users, MapPin, ShieldCheck,
} from 'lucide-react';
import { tiposPermisosApi, serviciosApi, dispositivosApi, saldosApi, usuariosApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ─── Colores preset para tipos de permiso ───────────────────────────────────
const COLORES_PRESET = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#EF4444', '#06B6D4', '#6B7280',
  '#F97316', '#84CC16',
];

// ─── Modal: Tipo de Permiso ──────────────────────────────────────────────────
function TipoModal({ tipo, onClose, onSuccess }) {
  const esEdicion = !!tipo;
  const [form, setForm] = useState(tipo || {
    codigo: '', nombre: '', descripcion: '', dias_anuales_max: '',
    color: '#3B82F6', requiere_aprobacion: true, es_feriado_legal: false,
  });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.codigo || !form.nombre || form.dias_anuales_max === '') {
      return setError('Código, nombre y días son obligatorios');
    }
    setCargando(true);
    try {
      esEdicion
        ? await tiposPermisosApi.actualizar(tipo.id, form)
        : await tiposPermisosApi.crear(form);
      toast.success(esEdicion ? 'Tipo actualizado' : 'Tipo creado');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <ModalShell title={esEdicion ? 'Editar tipo de permiso' : 'Nuevo tipo de permiso'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">Código <span className="text-red-500">*</span></label>
            <input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
              className="input-field uppercase" placeholder="Ej: VACACIONES" maxLength={20} disabled={esEdicion} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">Días máx/año <span className="text-red-500">*</span></label>
            <input type="number" min="0" max="365" value={form.dias_anuales_max}
              onChange={e => setForm({ ...form, dias_anuales_max: e.target.value })} className="input-field" required />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1.5">Nombre <span className="text-red-500">*</span></label>
          <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
            className="input-field" placeholder="Ej: Feriado Legal" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1.5">Descripción</label>
          <textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })}
            className="input-field resize-none h-16 text-sm" placeholder="Descripción breve (opcional)" />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-2">Color identificador</label>
          <div className="flex items-center gap-2 flex-wrap">
            {COLORES_PRESET.map(c => (
              <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-dark-400 scale-110' : ''}`}
                style={{ backgroundColor: c }} />
            ))}
            <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
              className="w-7 h-7 rounded-full cursor-pointer border-0 p-0" />
          </div>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-dark-700">Requiere aprobación</span>
          <button type="button" onClick={() => setForm({ ...form, requiere_aprobacion: !form.requiere_aprobacion })}
            className={`transition-colors ${form.requiere_aprobacion ? 'text-brand-600' : 'text-dark-300'}`}>
            {form.requiere_aprobacion ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          </button>
        </div>
        <div className="flex items-center justify-between py-1 border-t border-dark-100 pt-3">
          <div>
            <span className="text-sm text-dark-700">Feriado Legal</span>
            <p className="text-xs text-dark-400 mt-0.5">Activa reglas de arrastre y bloque de 10 días</p>
          </div>
          <button type="button" onClick={() => setForm({ ...form, es_feriado_legal: !form.es_feriado_legal })}
            className={`transition-colors ${form.es_feriado_legal ? 'text-amber-500' : 'text-dark-300'}`}>
            {form.es_feriado_legal ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          </button>
        </div>
        {error && <ErrorBox msg={error} />}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <BtnSubmit cargando={cargando} label={esEdicion ? 'Guardar cambios' : 'Crear tipo'} />
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Modal: Servicio ─────────────────────────────────────────────────────────
function ServicioModal({ servicio, onClose, onSuccess }) {
  const esEdicion = !!servicio;
  const [form, setForm] = useState(servicio || { nombre: '', descripcion: '' });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) return setError('El nombre es obligatorio');
    setCargando(true);
    try {
      esEdicion
        ? await serviciosApi.actualizar(servicio.id, form)
        : await serviciosApi.crear(form);
      toast.success(esEdicion ? 'Servicio actualizado' : 'Servicio creado');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <ModalShell title={esEdicion ? 'Editar servicio/unidad' : 'Nuevo servicio/unidad'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1.5">Nombre <span className="text-red-500">*</span></label>
          <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
            className="input-field" placeholder="Ej: Medicina General" required autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1.5">Descripción</label>
          <textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })}
            className="input-field resize-none h-16 text-sm" placeholder="Descripción breve (opcional)" />
        </div>
        {error && <ErrorBox msg={error} />}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <BtnSubmit cargando={cargando} label={esEdicion ? 'Guardar cambios' : 'Crear servicio'} />
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Modal: Dispositivo ──────────────────────────────────────────────────────
function DispositivoModal({ dispositivo, onClose, onSuccess }) {
  const esEdicion = !!dispositivo;
  const [form, setForm] = useState(dispositivo || { nombre: '', descripcion: '' });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) return setError('El nombre es obligatorio');
    setCargando(true);
    try {
      esEdicion
        ? await dispositivosApi.actualizar(dispositivo.id, form)
        : await dispositivosApi.crear(form);
      toast.success(esEdicion ? 'Dispositivo actualizado' : 'Dispositivo creado');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <ModalShell title={esEdicion ? 'Editar establecimiento' : 'Nuevo establecimiento'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1.5">Nombre <span className="text-red-500">*</span></label>
          <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
            className="input-field" placeholder="Ej: CESFAM LOS CERROS" required autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1.5">Descripción</label>
          <textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })}
            className="input-field resize-none h-16 text-sm" placeholder="Descripción breve (opcional)" />
        </div>
        {error && <ErrorBox msg={error} />}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <BtnSubmit cargando={cargando} label={esEdicion ? 'Guardar cambios' : 'Crear establecimiento'} />
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Helpers compartidos ─────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
          <h2 className="font-semibold text-dark-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400"><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function ErrorBox({ msg }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
      <AlertCircle size={15} />{msg}
    </div>
  );
}

function BtnSubmit({ cargando, label }) {
  return (
    <button type="submit" disabled={cargando} className="btn-primary flex-1 justify-center">
      {cargando ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : label}
    </button>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
const TABS = [
  { id: 'tipos',        label: 'Tipos de Permisos', icon: Tag },
  { id: 'servicios',    label: 'Servicios/Unidades', icon: Briefcase },
  { id: 'dispositivos', label: 'Establecimientos',   icon: Building2 },
  { id: 'usuarios',     label: 'Supervisores',        icon: Users },
];

const SECTORES = ['Verde', 'Azul', 'Amarillo', 'Rojo', 'Lila', 'SAR'];
const SECTOR_COLORS = {
  Verde: 'bg-green-100 text-green-700', Azul: 'bg-blue-100 text-blue-700',
  Amarillo: 'bg-yellow-100 text-yellow-700', Rojo: 'bg-red-100 text-red-700',
  Lila: 'bg-purple-100 text-purple-700', SAR: 'bg-cyan-100 text-cyan-700',
};
const AREAS_SUPERVISOR = [
  'Técnica', 'Administrativa', 'Salud Familiar', 'SOME', 'Estadística', 'Servicios Generales',
  'Programa Infantil', 'Programa Adolescente', 'Programa Salud Reproductiva',
  'Programa del Adulto', 'Programa Adulto Mayor', 'Programa Salud Dental',
  'Programa de Salud Mental', 'Programa Comunitario', 'Referente OIRS', 'Médico Gestor',
];
const ROL_LABELS = { admin: 'Administrador', supervisor: 'Supervisor', funcionario: 'Funcionario' };

export default function Configuracion() {
  const { esAdmin } = useAuth();
  const [tab, setTab] = useState('tipos');
  const [calculandoArrastre, setCalculandoArrastre] = useState(false);
  const [anioArrastre, setAnioArrastre] = useState(new Date().getFullYear() - 1);
  const [tipos, setTipos] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [dispositivos, setDispositivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [usuarios, setUsuarios] = useState([]);
  const [modalTipo, setModalTipo] = useState(null);
  const [modalServicio, setModalServicio] = useState(null);
  const [modalDispositivo, setModalDispositivo] = useState(null);
  const [nuevoUsuario, setNuevoUsuario] = useState({ email: '', rol: 'supervisor', sector: '', area: '' });
  const [creandoUsuario, setCreandoUsuario] = useState(false);

  const cargarTipos = () =>
    tiposPermisosApi.listar().then(({ data }) => setTipos(data));

  const cargarServicios = () =>
    serviciosApi.todos().then(({ data }) => setServicios(data));

  const cargarDispositivos = () =>
    dispositivosApi.listar().then(({ data }) => setDispositivos(data));

  const cargarUsuarios = () =>
    usuariosApi.listar().then(({ data }) => setUsuarios(data));

  useEffect(() => {
    setCargando(true);
    Promise.all([cargarTipos(), cargarServicios(), cargarDispositivos(), cargarUsuarios()])
      .catch(() => toast.error('Error cargando configuración'))
      .finally(() => setCargando(false));
  }, []);

  const cambiarSectorUsuario = async (id, sector) => {
    try {
      await usuariosApi.actualizar(id, { sector: sector || null });
      toast.success('Sector actualizado');
      cargarUsuarios();
    } catch { toast.error('Error al actualizar sector'); }
  };

  const cambiarRolUsuario = async (id, rol) => {
    try {
      await usuariosApi.actualizar(id, { rol });
      toast.success('Rol actualizado');
      cargarUsuarios();
    } catch { toast.error('Error al actualizar rol'); }
  };

  const crearUsuario = async (e) => {
    e.preventDefault();
    if (!nuevoUsuario.email) return toast.error('El email es obligatorio');
    setCreandoUsuario(true);
    try {
      await usuariosApi.crear(nuevoUsuario);
      toast.success(`Usuario ${nuevoUsuario.email} creado. Contraseña: cesfam2026`, { duration: 5000 });
      setNuevoUsuario({ email: '', rol: 'supervisor', sector: '', area: '' });
      cargarUsuarios();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear usuario');
    } finally {
      setCreandoUsuario(false);
    }
  };

  const toggleTipo = async (t) => {
    try {
      await tiposPermisosApi.actualizar(t.id, { ...t, activo: !t.activo });
      toast.success(t.activo ? 'Tipo desactivado' : 'Tipo activado');
      cargarTipos();
    } catch { toast.error('Error al cambiar estado'); }
  };

  const toggleServicio = async (s) => {
    try {
      await serviciosApi.actualizar(s.id, { ...s, activo: !s.activo });
      toast.success(s.activo ? 'Servicio desactivado' : 'Servicio activado');
      cargarServicios();
    } catch { toast.error('Error al cambiar estado'); }
  };

  const toggleDispositivo = async (d) => {
    try {
      await dispositivosApi.actualizar(d.id, { ...d, activo: !d.activo });
      toast.success(d.activo ? 'Establecimiento desactivado' : 'Establecimiento activado');
      cargarDispositivos();
    } catch { toast.error('Error al cambiar estado'); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 flex items-center gap-2">
            <Settings size={22} className="text-brand-500" />
            Configuración
          </h1>
          <p className="text-dark-500 text-sm mt-0.5">Administración de tipos de permisos, servicios y establecimientos</p>
        </div>
        {esAdmin && tab !== 'usuarios' && (
          <button
            onClick={() => {
              if (tab === 'tipos') setModalTipo({});
              else if (tab === 'servicios') setModalServicio({});
              else setModalDispositivo({});
            }}
            className="btn-primary"
          >
            <Plus size={16} />
            {tab === 'tipos' ? 'Nuevo tipo' : tab === 'servicios' ? 'Nuevo servicio' : 'Nuevo establecimiento'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-100 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              tab === id ? 'bg-white text-dark-900 shadow-sm' : 'text-dark-500 hover:text-dark-700'
            }`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── Tab: Tipos de Permisos ── */}
      {tab === 'tipos' && (
        cargando ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="card h-32 animate-pulse bg-dark-100" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {tipos.map((t, i) => (
              <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`card p-4 ${!t.activo ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${t.color}20` }}>
                      <Tag size={18} style={{ color: t.color }} />
                    </div>
                    <div>
                      <p className="font-semibold text-dark-800">{t.nombre}</p>
                      <p className="text-xs text-dark-400 font-mono">{t.codigo}</p>
                    </div>
                  </div>
                  {esAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => setModalTipo(t)}
                        className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400 hover:text-dark-600">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => toggleTipo(t)}
                        className={`p-1.5 rounded-lg transition-colors ${t.activo ? 'hover:bg-red-50 text-dark-400 hover:text-red-600' : 'hover:bg-emerald-50 text-dark-300 hover:text-emerald-600'}`}>
                        {t.activo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold" style={{ color: t.color }}>{t.dias_anuales_max}</p>
                    <p className="text-xs text-dark-400">días máx. por año</p>
                  </div>
                  <div className="text-right space-y-1">
                    <span className={`text-xs px-2 py-1 rounded-full ${t.requiere_aprobacion ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {t.requiere_aprobacion ? 'Requiere aprobación' : 'Automático'}
                    </span>
                    {t.es_feriado_legal && (
                      <p className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Feriado Legal</p>
                    )}
                    {!t.activo && <p className="text-xs text-red-500 mt-1">Inactivo</p>}
                  </div>
                </div>
                {t.descripcion && (
                  <p className="text-xs text-dark-400 mt-2 border-t border-dark-100 pt-2">{t.descripcion}</p>
                )}
              </motion.div>
            ))}
            {tipos.length === 0 && (
              <p className="text-dark-400 text-sm col-span-full py-8 text-center">No hay tipos de permisos configurados</p>
            )}
          </div>
        )
      )}

      {/* ── Tab: Servicios ── */}
      {tab === 'servicios' && (
        cargando ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="card h-24 animate-pulse bg-dark-100" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servicios.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`card p-4 ${!s.activo ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase size={16} className="text-brand-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-dark-800 text-sm">{s.nombre}</p>
                      {s.descripcion && <p className="text-xs text-dark-400 mt-0.5">{s.descripcion}</p>}
                      {!s.activo && <p className="text-xs text-red-500 mt-0.5">Inactivo</p>}
                    </div>
                  </div>
                  {esAdmin && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setModalServicio(s)}
                        className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400 hover:text-dark-600">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => toggleServicio(s)}
                        className={`p-1.5 rounded-lg transition-colors ${s.activo ? 'hover:bg-red-50 text-dark-400 hover:text-red-600' : 'hover:bg-emerald-50 text-dark-300 hover:text-emerald-600'}`}>
                        {s.activo ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {servicios.length === 0 && (
              <p className="text-dark-400 text-sm col-span-full py-8 text-center">No hay servicios/unidades configurados</p>
            )}
          </div>
        )
      )}

      {/* ── Tab: Dispositivos ── */}
      {tab === 'dispositivos' && (
        cargando ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="card h-24 animate-pulse bg-dark-100" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dispositivos.map((d, i) => (
              <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`card p-4 ${!d.activo ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Building2 size={16} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-dark-800 text-sm">{d.nombre}</p>
                      {d.descripcion && <p className="text-xs text-dark-400 mt-0.5">{d.descripcion}</p>}
                      {!d.activo && <p className="text-xs text-red-500 mt-0.5">Inactivo</p>}
                    </div>
                  </div>
                  {esAdmin && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setModalDispositivo(d)}
                        className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400 hover:text-dark-600">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => toggleDispositivo(d)}
                        className={`p-1.5 rounded-lg transition-colors ${d.activo ? 'hover:bg-red-50 text-dark-400 hover:text-red-600' : 'hover:bg-emerald-50 text-dark-300 hover:text-emerald-600'}`}>
                        {d.activo ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {dispositivos.length === 0 && (
              <p className="text-dark-400 text-sm col-span-full py-8 text-center">No hay establecimientos configurados</p>
            )}
          </div>
        )
      )}

      {/* ── Panel: Usuarios / Supervisores ── */}
      {tab === 'usuarios' && (
        <div className="space-y-5">
          {/* Crear usuario supervisor */}
          <div className="card p-5">
            <p className="text-sm font-semibold text-dark-800 mb-3 flex items-center gap-2">
              <ShieldCheck size={15} className="text-brand-500" />
              Crear usuario supervisor / administrador
            </p>
            <form onSubmit={crearUsuario} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-48">
                <label className="block text-xs font-medium text-dark-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={nuevoUsuario.email}
                  onChange={e => setNuevoUsuario(p => ({ ...p, email: e.target.value }))}
                  className="input-field"
                  placeholder="supervisor@cesfam.cl"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1.5">Rol</label>
                <select value={nuevoUsuario.rol} onChange={e => setNuevoUsuario(p => ({ ...p, rol: e.target.value }))} className="input-field">
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1.5">Sector</label>
                <select
                  value={nuevoUsuario.sector}
                  onChange={e => setNuevoUsuario(p => ({ ...p, sector: e.target.value, area: e.target.value ? '' : p.area }))}
                  className="input-field"
                >
                  <option value="">Sin sector</option>
                  {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1.5">Área / Programa</label>
                <select
                  value={nuevoUsuario.area}
                  onChange={e => setNuevoUsuario(p => ({ ...p, area: e.target.value, sector: e.target.value ? '' : p.sector }))}
                  className="input-field"
                  disabled={!!nuevoUsuario.sector}
                >
                  <option value="">Sin área/programa</option>
                  {AREAS_SUPERVISOR.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <button type="submit" disabled={creandoUsuario} className="btn-primary">
                {creandoUsuario
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : <><Plus size={15} />Crear</>
                }
              </button>
            </form>
            <p className="text-xs text-dark-400 mt-2">La contraseña inicial será <strong>cesfam2026</strong>. El usuario deberá cambiarla.</p>
          </div>

          {/* Lista de usuarios */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 bg-dark-50 border-b border-dark-100 text-xs font-medium text-dark-500 uppercase tracking-wide grid grid-cols-[1fr_auto_auto_auto_auto] gap-4">
              <span>Usuario</span>
              <span>Rol</span>
              <span>Sector</span>
              <span>Área/Programa</span>
              <span>Estado</span>
            </div>
            <div className="divide-y divide-dark-100">
              {usuarios.filter(u => u.rol !== 'funcionario').map(u => (
                <div key={u.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center">
                  <div>
                    <p className="text-sm font-medium text-dark-800">{u.email}</p>
                    {u.nombres && <p className="text-xs text-dark-400">{u.nombres} {u.apellidos}</p>}
                  </div>
                  <select
                    value={u.rol}
                    onChange={e => cambiarRolUsuario(u.id, e.target.value)}
                    className="input-field text-xs py-1 w-36"
                  >
                    <option value="admin">Administrador</option>
                    <option value="supervisor">Supervisor</option>
                  </select>
                  <select
                    value={u.sector || ''}
                    onChange={e => cambiarSectorUsuario(u.id, e.target.value)}
                    className="input-field text-xs py-1 w-28"
                  >
                    <option value="">Sin sector</option>
                    {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select
                    value={u.area || ''}
                    onChange={e => usuariosApi.actualizar(u.id, { area: e.target.value || null }).then(() => { toast.success('Área actualizada'); cargarUsuarios(); }).catch(() => toast.error('Error'))}
                    className="input-field text-xs py-1 w-40"
                  >
                    <option value="">Sin área</option>
                    {AREAS_SUPERVISOR.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              ))}
              {usuarios.filter(u => u.rol !== 'funcionario').length === 0 && (
                <div className="px-5 py-8 text-center text-dark-400 text-sm">No hay supervisores/administradores configurados</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Panel: Cálculo de Arrastre (solo admin) ── */}
      {esAdmin && tab === 'tipos' && (
        <div className="card p-5 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex-1">
              <p className="font-semibold text-amber-800 text-sm flex items-center gap-2">
                <RefreshCw size={15} />
                Calcular arrastre de feriado legal
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Transfiere los días no usados de feriado legal del año seleccionado al año siguiente.
                Ejecutar una vez al inicio de cada año.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div>
                <label className="text-xs text-amber-700 block mb-1">Año origen</label>
                <input
                  type="number"
                  value={anioArrastre}
                  min={2020} max={new Date().getFullYear()}
                  onChange={e => setAnioArrastre(parseInt(e.target.value))}
                  className="input-field w-28 text-sm"
                />
              </div>
              <div className="flex items-end pb-0.5">
                <span className="text-amber-600 text-sm mx-1">→</span>
                <span className="text-sm font-semibold text-amber-800">{anioArrastre + 1}</span>
              </div>
              <button
                onClick={async () => {
                  if (!window.confirm(`¿Calcular arrastre de ${anioArrastre} a ${anioArrastre + 1}?\n\nEsto sobrescribirá el saldo de arrastre existente para ese año.`)) return;
                  setCalculandoArrastre(true);
                  try {
                    const { data } = await saldosApi.calcularArrastre(anioArrastre, anioArrastre + 1);
                    toast.success(data.mensaje);
                  } catch (err) {
                    toast.error(err.response?.data?.error || 'Error al calcular arrastre');
                  } finally {
                    setCalculandoArrastre(false);
                  }
                }}
                disabled={calculandoArrastre}
                className="btn-primary bg-amber-500 hover:bg-amber-600 border-amber-500 self-end"
              >
                {calculandoArrastre
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : <><RefreshCw size={15} />Calcular</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
      <AnimatePresence>
        {modalTipo !== null && (
          <TipoModal
            tipo={modalTipo.id ? modalTipo : null}
            onClose={() => setModalTipo(null)}
            onSuccess={cargarTipos}
          />
        )}
        {modalServicio !== null && (
          <ServicioModal
            servicio={modalServicio.id ? modalServicio : null}
            onClose={() => setModalServicio(null)}
            onSuccess={cargarServicios}
          />
        )}
        {modalDispositivo !== null && (
          <DispositivoModal
            dispositivo={modalDispositivo.id ? modalDispositivo : null}
            onClose={() => setModalDispositivo(null)}
            onSuccess={cargarDispositivos}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
