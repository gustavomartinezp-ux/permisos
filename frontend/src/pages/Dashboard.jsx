import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Users, FileText, CheckCircle2, XCircle, Clock, TrendingDown,
  ArrowRight, CalendarDays, Activity, MapPin, ShieldCheck, UserX,
} from 'lucide-react';
import { dashboardApi, solicitudesApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import EstadoBadge from '../components/EstadoBadge';
import RechazoModal from '../components/RechazoModal';
import toast from 'react-hot-toast';

const SECTORES_COLORES = {
  'Verde':    'bg-green-100 text-green-700 border-green-200',
  'Azul':     'bg-blue-100 text-blue-700 border-blue-200',
  'Amarillo': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Rojo':     'bg-red-100 text-red-700 border-red-200',
  'Lila':     'bg-purple-100 text-purple-700 border-purple-200',
};

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-dark-500 uppercase tracking-wide mb-1">{label}</p>
          <p className="text-3xl font-bold text-dark-900">{value ?? '—'}</p>
          {sub && <p className="text-xs text-dark-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={22} className="text-white" />
        </div>
      </div>
    </motion.div>
  );
}

function FueraHoyPanel({ fueraHoy }) {
  if (!fueraHoy?.length) {
    return (
      <div className="card">
        <div className="px-5 py-4 border-b border-dark-100">
          <h2 className="font-semibold text-dark-800 flex items-center gap-2">
            <MapPin size={17} className="text-brand-500" />
            Personal fuera hoy
          </h2>
        </div>
        <div className="px-5 py-8 text-center text-dark-400 text-sm">
          <UserX size={28} className="mx-auto mb-2 opacity-30" />
          Todo el personal presente hoy
        </div>
      </div>
    );
  }

  // Agrupar por sector
  const porSector = fueraHoy.reduce((acc, f) => {
    const sector = f.sector || 'Sin sector';
    if (!acc[sector]) acc[sector] = [];
    acc[sector].push(f);
    return acc;
  }, {});

  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-dark-100 flex items-center justify-between">
        <h2 className="font-semibold text-dark-800 flex items-center gap-2">
          <MapPin size={17} className="text-brand-500" />
          Personal fuera hoy
          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
            {fueraHoy.length}
          </span>
        </h2>
      </div>
      <div className="divide-y divide-dark-100">
        {Object.entries(porSector).map(([sector, personas]) => (
          <div key={sector} className="px-5 py-3">
            <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full mb-2.5 border ${SECTORES_COLORES[sector] || 'bg-dark-100 text-dark-600 border-dark-200'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Sector {sector} — {personas.length} fuera
            </div>
            <div className="space-y-1.5">
              {personas.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <Link
                    to={`/funcionarios/${p.funcionario_id}`}
                    className="text-sm font-medium text-dark-700 hover:text-brand-600 flex-1 truncate"
                  >
                    {p.nombres} {p.apellidos}
                  </Link>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{ backgroundColor: `${p.color}20`, color: p.color }}
                  >
                    {p.tipo_nombre}
                  </span>
                  <span className="text-xs text-dark-400 flex-shrink-0">
                    hasta {format(parseISO(p.fecha_fin), 'd MMM', { locale: es })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { esAdmin, esSupervisor } = useAuth();
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [rechazandoId, setRechazandoId] = useState(null);
  const [procesando, setProcesando] = useState(null);

  const cargarDatos = () => {
    setCargando(true);
    dashboardApi.stats()
      .then(({ data }) => setData(data))
      .catch(() => toast.error('Error al cargar estadísticas'))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargarDatos(); }, []);

  const preAprobar = async (id) => {
    setProcesando(id);
    try {
      await solicitudesApi.preAprobar(id);
      toast.success('Solicitud pre-aprobada');
      cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al pre-aprobar');
    } finally {
      setProcesando(null);
    }
  };

  const aprobar = async (id) => {
    setProcesando(id);
    try {
      await solicitudesApi.aprobar(id);
      toast.success('Solicitud aprobada — días descontados del saldo');
      cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aprobar');
    } finally {
      setProcesando(null);
    }
  };

  const confirmarRechazo = async (obs) => {
    setProcesando(rechazandoId);
    try {
      await solicitudesApi.rechazar(rechazandoId, obs);
      toast.success('Solicitud rechazada — días reintegrados al saldo');
      setRechazandoId(null);
      cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al rechazar');
    } finally {
      setProcesando(null);
    }
  };

  if (cargando) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="card p-5 h-28 animate-pulse bg-dark-100" />
          ))}
        </div>
      </div>
    );
  }

  const { stats, solicitudes_pendientes, actividad_reciente, proximas_ausencias, top_funcionarios, fuera_hoy, estado_accion } = data || {};

  const labelPendientes = esAdmin ? 'Pendientes de Acción' : 'Pendientes de Pre-aprobación';
  const countPendientes = esAdmin
    ? (stats?.solicitudes_pre_aprobadas || 0) + (stats?.solicitudes_directas || 0)
    : stats?.solicitudes_pendientes;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-900">Dashboard</h1>
        <p className="text-dark-500 text-sm mt-0.5">
          {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Funcionarios" value={stats?.total_funcionarios} icon={Users} color="bg-brand-500" />
        <StatCard
          label={esAdmin ? 'Requieren acción' : 'Pendientes'}
          value={countPendientes}
          icon={esAdmin ? ShieldCheck : Clock}
          color={esAdmin ? 'bg-orange-500' : 'bg-amber-500'}
          sub={esAdmin
            ? `${stats?.solicitudes_pre_aprobadas || 0} pre-aprobadas + ${stats?.solicitudes_directas || 0} directas`
            : 'esperan pre-aprobación'}
        />
        <StatCard label="Aprobadas" value={stats?.solicitudes_aprobadas} icon={CheckCircle2} color="bg-emerald-500" />
        <StatCard label="Fuera hoy" value={stats?.fuera_hoy_count} icon={MapPin} color="bg-blue-500" sub="con permiso vigente" />
      </div>

      {/* Fuera hoy — fila completa */}
      <FueraHoyPanel fueraHoy={fuera_hoy} />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Panel de acción según rol */}
        {esSupervisor && (
          <div className="lg:col-span-2">
            <div className="card">
              <div className="px-5 py-4 border-b border-dark-100 flex items-center justify-between">
                <h2 className="font-semibold text-dark-800 flex items-center gap-2">
                  {esAdmin
                    ? <ShieldCheck size={17} className="text-orange-500" />
                    : <Clock size={17} className="text-amber-500" />
                  }
                  {labelPendientes}
                  {countPendientes > 0 && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${esAdmin ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
                      {countPendientes}
                    </span>
                  )}
                </h2>
                <Link to="/solicitudes" className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  Ver todas <ArrowRight size={13} />
                </Link>
              </div>
              <div className="divide-y divide-dark-100">
                {solicitudes_pendientes?.length === 0 && (
                  <div className="px-5 py-8 text-center text-dark-400 text-sm">
                    {esAdmin ? 'No hay solicitudes pendientes de acción' : 'No hay solicitudes pendientes en tu sector'}
                  </div>
                )}
                {solicitudes_pendientes?.map((sol) => (
                  <div key={sol.id} className="px-5 py-3.5 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-dark-800 truncate">
                          {sol.nombres} {sol.apellidos}
                        </p>
                        {sol.sector && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SECTORES_COLORES[sol.sector]?.split(' ').slice(0,2).join(' ') || 'bg-dark-100 text-dark-600'}`}>
                            {sol.sector}
                          </span>
                        )}
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{ backgroundColor: `${sol.color}20`, color: sol.color }}
                        >
                          {sol.tipo_nombre}
                        </span>
                        <EstadoBadge estado={sol.estado} />
                      </div>
                      <p className="text-xs text-dark-400 mt-0.5">
                        {format(parseISO(sol.fecha_inicio), 'd MMM', { locale: es })} –{' '}
                        {format(parseISO(sol.fecha_fin), 'd MMM yyyy', { locale: es })}
                        {' '}· {sol.dias_solicitados} día(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Supervisor pre-aprueba */}
                      {!esAdmin && (
                        <button
                          onClick={() => preAprobar(sol.id)}
                          disabled={procesando === sol.id}
                          className="p-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors disabled:opacity-50"
                          title="Pre-aprobar"
                        >
                          {procesando === sol.id
                            ? <span className="animate-spin h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full block" />
                            : <ShieldCheck size={16} />
                          }
                        </button>
                      )}
                      {/* Admin aprueba final */}
                      {esAdmin && (
                        <button
                          onClick={() => aprobar(sol.id)}
                          disabled={procesando === sol.id}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                          title="Aprobación final"
                        >
                          {procesando === sol.id
                            ? <span className="animate-spin h-4 w-4 border-2 border-emerald-600 border-t-transparent rounded-full block" />
                            : <CheckCircle2 size={16} />
                          }
                        </button>
                      )}
                      <button
                        onClick={() => setRechazandoId(sol.id)}
                        disabled={procesando === sol.id}
                        className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                        title="Rechazar"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Panel derecho */}
        <div className="space-y-5">
          {proximas_ausencias?.length > 0 && (
            <div className="card">
              <div className="px-4 py-3.5 border-b border-dark-100">
                <h3 className="font-semibold text-dark-800 flex items-center gap-2 text-sm">
                  <CalendarDays size={15} className="text-brand-500" />
                  Próximas ausencias (7 días)
                </h3>
              </div>
              <div className="divide-y divide-dark-100">
                {proximas_ausencias.map((a) => (
                  <div key={a.id} className="px-4 py-2.5">
                    <p className="text-sm font-medium text-dark-700">{a.nombres} {a.apellidos}</p>
                    <p className="text-xs text-dark-400">
                      {format(parseISO(a.fecha_inicio), 'd MMM', { locale: es })} –{' '}
                      {format(parseISO(a.fecha_fin), 'd MMM', { locale: es })}
                      <span
                        className="ml-2 px-1.5 py-0.5 rounded text-xs"
                        style={{ backgroundColor: `${a.color}20`, color: a.color }}
                      >
                        {a.tipo_nombre}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {top_funcionarios?.length > 0 && (
            <div className="card">
              <div className="px-4 py-3.5 border-b border-dark-100">
                <h3 className="font-semibold text-dark-800 flex items-center gap-2 text-sm">
                  <TrendingDown size={15} className="text-red-500" />
                  Mayor uso de días
                </h3>
              </div>
              <div className="px-4 py-3 space-y-3">
                {top_funcionarios.map((f) => (
                  <Link key={f.id} to={`/funcionarios/${f.id}`} className="block group">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-dark-700 group-hover:text-brand-600 transition-colors">
                        {f.nombres} {f.apellidos}
                      </span>
                      <span className="text-dark-500">{f.total_usados}/{f.total_asignados}</span>
                    </div>
                    <div className="h-1.5 bg-dark-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${Math.min((f.total_usados / f.total_asignados) * 100, 100)}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actividad reciente */}
      {actividad_reciente?.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-dark-100 flex items-center justify-between">
            <h2 className="font-semibold text-dark-800 flex items-center gap-2">
              <Activity size={17} className="text-brand-500" />
              Actividad Reciente
            </h2>
            <Link to="/historial" className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              Ver historial completo <ArrowRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-dark-100">
            {actividad_reciente.map((a) => (
              <div key={a.id} className="px-5 py-3 flex items-center gap-4">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-dark-700 truncate">{a.descripcion}</p>
                  <p className="text-xs text-dark-400">
                    {a.nombres} {a.apellidos} · {a.tipo_nombre}
                  </p>
                </div>
                <p className="text-xs text-dark-400 flex-shrink-0">
                  {format(parseISO(a.created_at), 'd MMM HH:mm', { locale: es })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {rechazandoId && (
        <RechazoModal
          cargando={procesando === rechazandoId}
          onClose={() => setRechazandoId(null)}
          onConfirm={confirmarRechazo}
        />
      )}
    </div>
  );
}
