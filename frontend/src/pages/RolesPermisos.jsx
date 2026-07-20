import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { X, Plus, UserCog, Clock3, Ban, ShieldCheck } from 'lucide-react';
import { rolesApi, subrogacionesApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const ROLE_BADGE = {
  ADMIN_TI:   'bg-red-50 text-red-700',
  RRHH_ADMIN: 'bg-brand-50 text-brand-700',
  SECRETARY:  'bg-cyan-50 text-cyan-700',
  SUPERVISOR: 'bg-purple-50 text-purple-700',
  EMPLOYEE:   'bg-dark-100 text-dark-600',
  AUDITOR:    'bg-amber-50 text-amber-700',
};

function fmtNombre(u) {
  if (u.nombres) return `${u.nombres} ${u.apellidos || ''}`.trim();
  return u.email;
}

function SeccionRoles() {
  const [usuarios, setUsuarios] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [asignando, setAsignando] = useState({}); // { [usuarioId]: codigoSeleccionado }

  const cargar = () => {
    setCargando(true);
    Promise.all([rolesApi.listarUsuarios(), rolesApi.listar()])
      .then(([u, r]) => { setUsuarios(u.data); setCatalogo(r.data); })
      .catch(() => toast.error('No se pudieron cargar los roles'))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter((u) =>
      fmtNombre(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [usuarios, busqueda]);

  const asignar = async (usuarioId) => {
    const codigo = asignando[usuarioId];
    if (!codigo) return;
    try {
      await rolesApi.asignar(usuarioId, codigo);
      toast.success('Rol asignado');
      setAsignando((s) => ({ ...s, [usuarioId]: '' }));
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al asignar el rol');
    }
  };

  const revocar = async (usuarioId, codigo) => {
    try {
      await rolesApi.revocar(usuarioId, codigo);
      toast.success('Rol revocado');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al revocar el rol');
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-dark-900 flex items-center gap-2">
            <ShieldCheck size={17} className="text-brand-600" />
            Gestión de Roles
          </h2>
          <p className="text-xs text-dark-500 mt-0.5">Asigna o revoca roles RBAC por usuario.</p>
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o correo..."
          className="input-field max-w-xs"
        />
      </div>

      {cargando ? (
        <div className="py-8 flex justify-center">
          <span className="animate-spin h-5 w-5 border-2 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="max-h-[480px] overflow-y-auto divide-y divide-dark-100">
          {filtrados.map((u) => (
            <div key={u.id} className="py-3 flex items-center gap-3 flex-wrap">
              <div className="min-w-[180px]">
                <p className="text-sm font-medium text-dark-800">{fmtNombre(u)}</p>
                <p className="text-xs text-dark-400">{u.email} · rol legacy: {u.rol_legacy}</p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {u.roles_rbac.map((codigo) => (
                  <span
                    key={codigo}
                    className={`text-[11px] font-medium pl-2 pr-1 py-0.5 rounded-full flex items-center gap-1 ${ROLE_BADGE[codigo] || 'bg-dark-100 text-dark-600'}`}
                  >
                    {codigo}
                    <button
                      onClick={() => revocar(u.id, codigo)}
                      className="hover:opacity-60"
                      title={`Revocar ${codigo}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={asignando[u.id] || ''}
                  onChange={(e) => setAsignando((s) => ({ ...s, [u.id]: e.target.value }))}
                  className="input-field py-1.5 text-xs w-40"
                >
                  <option value="">+ Asignar rol...</option>
                  {catalogo
                    .filter((r) => !u.roles_rbac.includes(r.codigo))
                    .map((r) => (
                      <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
                    ))}
                </select>
                <button
                  onClick={() => asignar(u.id)}
                  disabled={!asignando[u.id]}
                  className="btn-secondary py-1.5 px-2"
                  title="Asignar"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
          {filtrados.length === 0 && (
            <p className="text-center text-sm text-dark-400 py-8">Sin resultados</p>
          )}
        </div>
      )}
    </div>
  );
}

function SeccionSubrogacion() {
  const [subrogaciones, setSubrogaciones] = useState([]);
  const [candidatos, setCandidatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState({ usuario_subrogante_id: '', fecha_inicio: '', fecha_fin: '', motivo: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    setCargando(true);
    Promise.all([subrogacionesApi.listar(), subrogacionesApi.candidatos()])
      .then(([s, c]) => { setSubrogaciones(s.data); setCandidatos(c.data); })
      .catch(() => toast.error('No se pudieron cargar las subrogaciones'))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, []);

  const crear = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await subrogacionesApi.crear(form);
      toast.success('Subrogación creada');
      setForm({ usuario_subrogante_id: '', fecha_inicio: '', fecha_fin: '', motivo: '' });
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear la subrogación');
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = async (id) => {
    try {
      await subrogacionesApi.cancelar(id);
      toast.success('Subrogación cancelada');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cancelar');
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-dark-900 flex items-center gap-2">
          <UserCog size={17} className="text-purple-600" />
          Subrogación de Supervisión
        </h2>
        <p className="text-xs text-dark-500 mt-0.5">
          Delega temporalmente tu rol de supervisor a otro usuario por un rango de fechas.
        </p>
      </div>

      <form onSubmit={crear} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-dark-700 mb-1">Delegar a</label>
          <select
            required
            value={form.usuario_subrogante_id}
            onChange={(e) => setForm({ ...form, usuario_subrogante_id: e.target.value })}
            className="input-field"
          >
            <option value="">Seleccionar usuario...</option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>{fmtNombre(c)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1">Desde</label>
          <input
            type="date" required
            value={form.fecha_inicio}
            onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1">Hasta</label>
          <input
            type="date" required
            min={form.fecha_inicio || undefined}
            value={form.fecha_fin}
            onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
            className="input-field"
          />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-dark-700 mb-1">Motivo (opcional)</label>
          <input
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            placeholder="Ej: Vacaciones, licencia médica..."
            className="input-field"
          />
        </div>
        <button type="submit" disabled={guardando} className="btn-primary justify-center">
          {guardando
            ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            : <><Plus size={15} className="mr-1" />Delegar</>
          }
        </button>
      </form>

      {cargando ? (
        <div className="py-6 flex justify-center">
          <span className="animate-spin h-5 w-5 border-2 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="divide-y divide-dark-100 pt-1">
          {subrogaciones.map((s) => (
            <div key={s.id} className="py-3 flex items-center gap-3 flex-wrap">
              <Clock3 size={14} className="text-dark-400 shrink-0" />
              <div className="flex-1 min-w-[220px] text-sm">
                <span className="font-medium text-dark-700">
                  {s.titular_nombres ? `${s.titular_nombres} ${s.titular_apellidos}` : s.titular_email}
                </span>
                <span className="text-dark-400"> → </span>
                <span className="font-medium text-dark-700">
                  {s.subrogante_nombres ? `${s.subrogante_nombres} ${s.subrogante_apellidos}` : s.subrogante_email}
                </span>
                <p className="text-xs text-dark-400">
                  {s.fecha_inicio?.slice(0, 10)} — {s.fecha_fin?.slice(0, 10)}
                  {s.motivo ? ` · ${s.motivo}` : ''}
                </p>
              </div>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${s.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-dark-100 text-dark-500'}`}>
                {s.activo ? 'Activa' : 'Cancelada'}
              </span>
              {s.activo && (
                <button onClick={() => cancelar(s.id)} className="btn-secondary py-1 px-2 text-xs gap-1">
                  <Ban size={12} />
                  Cancelar
                </button>
              )}
            </div>
          ))}
          {subrogaciones.length === 0 && (
            <p className="text-center text-sm text-dark-400 py-6">Sin subrogaciones registradas</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function RolesPermisos() {
  const { tienePermiso, esSupervisorPuro } = useAuth();
  const puedeGestionarRoles = tienePermiso('usuarios.gestionar_roles');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto"
    >
      <div>
        <h1 className="text-xl font-bold text-dark-900">Roles y Permisos</h1>
        <p className="text-sm text-dark-500">Gestión de accesos RBAC y subrogaciones de supervisión.</p>
      </div>

      {puedeGestionarRoles && <SeccionRoles />}
      {esSupervisorPuro && <SeccionSubrogacion />}

      {!puedeGestionarRoles && !esSupervisorPuro && (
        <p className="text-dark-400 text-sm py-8 text-center">No tienes secciones disponibles en esta página.</p>
      )}
    </motion.div>
  );
}
