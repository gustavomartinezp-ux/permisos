import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, CheckCircle2, XCircle, Search, ShieldCheck, RotateCcw } from 'lucide-react';
import { solicitudesApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import EstadoBadge from '../components/EstadoBadge';
import RechazoModal from '../components/RechazoModal';
import toast from 'react-hot-toast';

const getHorarioJornada = (fechaISO, jornada) => {
  if (!jornada || !fechaISO) return null;
  const dow = new Date(fechaISO + 'T12:00:00').getDay();
  if (jornada === 'AM') return dow === 5 ? '08:00–12:00 hrs' : '08:00–12:30 hrs';
  return dow === 5 ? '12:00–16:00 hrs' : '12:30–17:00 hrs';
};

const SECTORES_COLORES = {
  'Verde':    'bg-green-100 text-green-700',
  'Azul':     'bg-blue-100 text-blue-700',
  'Amarillo': 'bg-yellow-100 text-yellow-700',
  'Rojo':     'bg-red-100 text-red-700',
  'Lila':     'bg-purple-100 text-purple-700',
};

const ESTADOS = [
  { value: '',             label: 'Todos' },
  { value: 'pendiente',   label: 'Pendientes' },
  { value: 'pre_aprobado', label: 'Pre-aprobados' },
  { value: 'aprobado',    label: 'Aprobadas' },
  { value: 'rechazado',   label: 'Rechazadas' },
  { value: 'cancelado',   label: 'Reintegradas' },
];

export default function Solicitudes() {
  const { esAdmin, esSupervisor, usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [procesando, setProcesando] = useState(null);
  const [rechazandoId, setRechazandoId] = useState(null);
  const [anulandoId, setAnulandoId] = useState(null);

  const cargar = useCallback(() => {
    setCargando(true);
    solicitudesApi.listar({ estado: filtroEstado || undefined, limit: 100 })
      .then(({ data }) => {
        setSolicitudes(data.solicitudes);
        setTotal(data.total);
      })
      .catch(() => toast.error('Error al cargar solicitudes'))
      .finally(() => setCargando(false));
  }, [filtroEstado]);

  useEffect(() => { cargar(); }, [cargar]);

  const preAprobar = async (id) => {
    setProcesando(id);
    try {
      await solicitudesApi.preAprobar(id);
      toast.success('Solicitud pre-aprobada — pendiente de aprobación final del administrador');
      cargar();
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
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aprobar');
    } finally {
      setProcesando(null);
    }
  };

  const confirmarAnulacion = async (obs) => {
    setProcesando(anulandoId);
    try {
      await solicitudesApi.reintegrar(anulandoId, obs);
      toast.success('Permiso anulado — días reintegrados al saldo');
      setAnulandoId(null);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al anular permiso');
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
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al rechazar');
    } finally {
      setProcesando(null);
    }
  };

  const filtradas = solicitudes.filter((s) => {
    const q = busqueda.toLowerCase();
    return (
      s.nombres?.toLowerCase().includes(q) ||
      s.apellidos?.toLowerCase().includes(q) ||
      s.rut?.toLowerCase().includes(q) ||
      s.tipo_nombre?.toLowerCase().includes(q) ||
      s.sector?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-dark-900">Solicitudes</h1>
        <p className="text-dark-500 text-sm mt-0.5">{total} solicitud(es) en total</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por funcionario, RUT, tipo o sector..."
            className="input-field pl-9 bg-white"
          />
        </div>
        <div className="flex gap-1 bg-dark-100 p-1 rounded-xl flex-shrink-0 flex-wrap">
          {ESTADOS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFiltroEstado(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtroEstado === value
                  ? 'bg-white text-dark-900 shadow-sm'
                  : 'text-dark-500 hover:text-dark-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Indicador de flujo */}
      {esSupervisor && (
        <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-100 rounded-xl text-xs text-orange-700">
          <ShieldCheck size={14} />
          {esAdmin
            ? 'Como Administrador, puedes dar la aprobación final a solicitudes pre-aprobadas.'
            : 'Como Supervisor, puedes pre-aprobar las solicitudes pendientes de tu sector. La aprobación final la otorga el Administrador.'}
        </div>
      )}

      {/* Tabla */}
      {cargando ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="card p-4 h-20 animate-pulse bg-dark-100" />
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 text-dark-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin solicitudes</p>
          <p className="text-sm mt-1">
            {busqueda || filtroEstado ? 'Prueba con otros filtros' : 'No hay solicitudes registradas'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 bg-dark-50 border-b border-dark-100 text-xs font-medium text-dark-500 uppercase tracking-wide">
            <span>Funcionario</span>
            <span>Permiso / Período</span>
            <span>Días</span>
            <span>Estado</span>
            {esSupervisor && <span>Acciones</span>}
          </div>
          <div className="divide-y divide-dark-100">
            {filtradas.map((sol, index) => (
              <motion.div
                key={sol.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.03 }}
                className="px-5 py-4 flex flex-col md:grid md:grid-cols-[1fr_1fr_auto_auto_auto] gap-3 md:gap-4 md:items-center"
              >
                {/* Funcionario */}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/funcionarios/${sol.funcionario_id}`}
                      className="font-medium text-dark-800 hover:text-brand-600 transition-colors text-sm"
                    >
                      {sol.nombres} {sol.apellidos}
                    </Link>
                    {sol.sector && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SECTORES_COLORES[sol.sector] || 'bg-dark-100 text-dark-600'}`}>
                        {sol.sector}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-dark-400">{sol.cargo} · {sol.servicio}</p>
                </div>

                {/* Tipo / Fechas */}
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${sol.color}20`, color: sol.color }}
                    >
                      {sol.tipo_nombre}
                    </span>
                  </div>
                  <p className="text-xs text-dark-500 mt-0.5">
                    {format(parseISO(sol.fecha_inicio), 'd MMM', { locale: es })} –{' '}
                    {format(parseISO(sol.fecha_fin), 'd MMM yyyy', { locale: es })}
                  </p>
                  {sol.jornada_medio_dia && (
                    <p className={`text-xs font-medium mt-0.5 ${sol.jornada_medio_dia === 'AM' ? 'text-amber-600' : 'text-indigo-600'}`}>
                      Medio día {sol.jornada_medio_dia} · {getHorarioJornada(sol.fecha_inicio, sol.jornada_medio_dia)}
                    </p>
                  )}
                  {sol.motivo && (
                    <p className="text-xs text-dark-400 truncate max-w-xs">{sol.motivo}</p>
                  )}
                  {sol.estado === 'pre_aprobado' && sol.preaprobador_nombres && (
                    <p className="text-xs text-orange-600 mt-0.5">
                      Pre-aprobado por {sol.preaprobador_nombres} {sol.preaprobador_apellidos}
                    </p>
                  )}
                </div>

                {/* Días */}
                <div className="text-sm font-semibold text-dark-700 text-center">
                  {sol.dias_solicitados}d
                </div>

                {/* Estado */}
                <div>
                  <EstadoBadge estado={sol.estado} />
                  {sol.aprobador_nombres && sol.estado === 'aprobado' && (
                    <p className="text-xs text-dark-400 mt-0.5">
                      por {sol.aprobador_nombres} {sol.aprobador_apellidos}
                    </p>
                  )}
                </div>

                {/* Acciones */}
                {esSupervisor && (
                  <div className="flex items-center gap-2">
                    {/* Supervisor: pre-aprobar pendientes (no las propias) */}
                    {!esAdmin && sol.estado === 'pendiente' && String(sol.funcionario_id) !== String(usuario?.funcionario_id) && (
                      <>
                        <button
                          onClick={() => preAprobar(sol.id)}
                          disabled={procesando === sol.id}
                          className="p-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors disabled:opacity-50"
                          title="Pre-aprobar"
                        >
                          {procesando === sol.id
                            ? <span className="animate-spin h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full block" />
                            : <ShieldCheck size={17} />
                          }
                        </button>
                        <button
                          onClick={() => setRechazandoId(sol.id)}
                          disabled={procesando === sol.id}
                          className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                          title="Rechazar"
                        >
                          <XCircle size={17} />
                        </button>
                      </>
                    )}
                    {/* Admin: anular permiso aprobado y reintegrar días */}
                    {esAdmin && sol.estado === 'aprobado' && (
                      <button
                        onClick={() => setAnulandoId(sol.id)}
                        disabled={procesando === sol.id}
                        className="p-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors disabled:opacity-50"
                        title="Anular permiso y reintegrar días al saldo"
                      >
                        {procesando === sol.id
                          ? <span className="animate-spin h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full block" />
                          : <RotateCcw size={17} />
                        }
                      </button>
                    )}
                    {/* Admin: aprobar final pre-aprobadas (o pendientes directamente) */}
                    {esAdmin && (sol.estado === 'pre_aprobado' || sol.estado === 'pendiente') && (
                      <>
                        <button
                          onClick={() => aprobar(sol.id)}
                          disabled={procesando === sol.id}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                            sol.estado === 'pre_aprobado'
                              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                          }`}
                          title={sol.estado === 'pre_aprobado' ? 'Aprobación final' : 'Aprobar directamente'}
                        >
                          {procesando === sol.id
                            ? <span className="animate-spin h-4 w-4 border-2 border-emerald-600 border-t-transparent rounded-full block" />
                            : <CheckCircle2 size={17} />
                          }
                        </button>
                        <button
                          onClick={() => setRechazandoId(sol.id)}
                          disabled={procesando === sol.id}
                          className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                          title="Rechazar"
                        >
                          <XCircle size={17} />
                        </button>
                      </>
                    )}
                    {/* Solicitud ya resuelta */}
                    {(sol.estado === 'aprobado' || sol.estado === 'rechazado') && (
                      <span className="text-xs text-dark-300 italic">
                        {sol.fecha_resolucion
                          ? format(parseISO(sol.fecha_resolucion), 'd MMM', { locale: es })
                          : '—'}
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
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

      {anulandoId && (
        <RechazoModal
          cargando={procesando === anulandoId}
          onClose={() => setAnulandoId(null)}
          onConfirm={confirmarAnulacion}
          titulo="Anular permiso aprobado"
          labelMotivo="Motivo de la anulación"
          placeholder="Ej: Error en el registro, solicitud duplicada..."
          textoBoton="Anular permiso"
          variante="orange"
        />
      )}
    </div>
  );
}
