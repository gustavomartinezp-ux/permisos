import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Search, Plus, Users, ChevronRight, Upload, FileDown, UserX,
  AlertTriangle, Clock, Briefcase, Trash2, PowerOff, Power,
  X, ShieldAlert, Eye, EyeOff,
} from 'lucide-react';
import { funcionariosApi, solicitudesApi } from '../api/client';
import { generarReporteFuncionario } from '../utils/reportePDF';
import { useAuth } from '../context/AuthContext';
import SolicitudModal from '../components/SolicitudModal';
import FuncionarioModal from '../components/FuncionarioModal';
import CargaMasivaModal from '../components/CargaMasivaModal';
import toast from 'react-hot-toast';

// ─── Config por grupo contractual ─────────────────────────────────────────────
const GRUPOS = {
  contrata: {
    label:      'Planta / Contrata',
    desc:       'Funcionarios con contrato indefinido o a plazo fijo',
    avatarBg:   'bg-brand-100',
    avatarText: 'text-brand-700',
    barColor:   'bg-brand-500',
    badge:      'bg-emerald-100 text-emerald-700',
    api_param:  'contrata',
  },
  honorarios: {
    label:      'Honorarios',
    desc:       'Funcionarios contratados a honorarios',
    avatarBg:   'bg-amber-100',
    avatarText: 'text-amber-700',
    barColor:   'bg-amber-500',
    badge:      'bg-amber-100 text-amber-700',
    api_param:  'honorarios',
  },
  suplentes: {
    label:      'Personal Suplente',
    desc:       'Funcionarios con calidad contractual de suplencia',
    avatarBg:   'bg-purple-100',
    avatarText: 'text-purple-700',
    barColor:   'bg-purple-500',
    badge:      'bg-purple-100 text-purple-700',
    api_param:  'suplentes',
  },
};

const fmtFecha = (d) => {
  if (!d) return null;
  try { return format(parseISO(d.toString().substring(0,10)), 'd MMM yyyy', { locale: es }); }
  catch { return null; }
};

// ─── Tarjeta Planta/Contrata (saldos de permisos) ────────────────────────────
function CardContrata({ funcionario, cfg, onSolicitar, descargarPDF, generandoPDF }) {
  const totalAsignado = funcionario.saldos?.reduce((s, x) => s + x.dias_asignados, 0) || 0;
  const totalUsado    = funcionario.saldos?.reduce((s, x) => s + x.dias_usados, 0) || 0;
  const porcentaje    = totalAsignado > 0 ? Math.round((totalUsado / totalAsignado) * 100) : 0;

  return (
    <>
      <div className="space-y-1.5 mb-3">
        {funcionario.saldos?.slice(0, 3).map((s) => {
          const disp = s.dias_asignados - s.dias_usados - (s.dias_pendientes || 0);
          return (
            <div key={s.tipo_id} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-dark-500 flex-1 truncate">{s.tipo_nombre}</span>
              <span className="text-xs font-medium text-dark-700">{disp}/{s.dias_asignados}</span>
            </div>
          );
        })}
      </div>
      <div>
        <div className="flex justify-between text-xs text-dark-400 mb-1">
          <span>Uso total</span>
          <span>{totalUsado}/{totalAsignado} días ({porcentaje}%)</span>
        </div>
        <div className="h-1.5 bg-dark-100 rounded-full overflow-hidden">
          <div className={`h-full ${cfg.barColor} rounded-full`} style={{ width: `${Math.min(porcentaje,100)}%` }} />
        </div>
      </div>
      {onSolicitar && (
        <button
          onClick={() => onSolicitar(funcionario)}
          className="mt-3 w-full text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
        >
          <Plus size={13} />Nueva solicitud
        </button>
      )}
    </>
  );
}

// ─── Tarjeta Honorarios (convenio / vigencia) ─────────────────────────────────
function CardHonorarios({ funcionario, cfg }) {
  const fechaTermino = funcionario.fecha_termino_contrato;
  const diasRestantes = fechaTermino
    ? differenceInDays(new Date(fechaTermino.toString().substring(0,10)), new Date())
    : null;

  let vigenciaClass = 'text-dark-500';
  let vigenciaLabel = fechaTermino ? fmtFecha(fechaTermino) : 'Sin fecha término';
  let alertaVigencia = null;

  if (diasRestantes !== null) {
    if (diasRestantes < 0) {
      vigenciaClass = 'text-red-600 font-semibold';
      alertaVigencia = 'Contrato vencido';
    } else if (diasRestantes <= 30) {
      vigenciaClass = 'text-amber-600 font-semibold';
      alertaVigencia = `Vence en ${diasRestantes} días`;
    }
  }

  return (
    <div className="space-y-2">
      {alertaVigencia && (
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${
          diasRestantes !== null && diasRestantes < 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
        }`}>
          <AlertTriangle size={11} />
          {alertaVigencia}
        </div>
      )}
      {funcionario.convenio_honorarios && (
        <div className="flex items-start gap-1.5">
          <Briefcase size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <span className="text-xs text-dark-600 truncate">{funcionario.convenio_honorarios}</span>
        </div>
      )}
      {funcionario.prestacion && (
        <p className="text-xs text-dark-400 truncate">{funcionario.prestacion}</p>
      )}
      <div className="flex items-center gap-1.5">
        <Clock size={11} className={vigenciaClass} />
        <span className={`text-xs ${vigenciaClass}`}>Vigencia: {vigenciaLabel}</span>
      </div>
    </div>
  );
}

// ─── Tarjeta Suplentes (info de reemplazo) ────────────────────────────────────
function CardSuplentes({ funcionario }) {
  const fechaTermino = funcionario.fecha_termino_contrato;
  const diasRestantes = fechaTermino
    ? differenceInDays(new Date(fechaTermino.toString().substring(0,10)), new Date())
    : null;

  return (
    <div className="space-y-2">
      {funcionario.reemplaza_nombres ? (
        <div className="flex items-start gap-1.5">
          <Users size={12} className="text-purple-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-dark-700">
              Reemplaza a: {funcionario.reemplaza_nombres} {funcionario.reemplaza_apellidos}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-dark-400 italic">Sin reemplazo asignado</p>
      )}
      {fechaTermino && (
        <div className={`flex items-center gap-1.5 text-xs ${
          diasRestantes !== null && diasRestantes < 0 ? 'text-red-600 font-semibold' :
          diasRestantes !== null && diasRestantes <= 14 ? 'text-amber-600 font-semibold' : 'text-dark-500'
        }`}>
          <Clock size={11} />
          Término: {fmtFecha(fechaTermino)}
          {diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 14 && (
            <span className="ml-1">({diasRestantes}d)</span>
          )}
          {diasRestantes !== null && diasRestantes < 0 && (
            <span className="ml-1">(vencido)</span>
          )}
        </div>
      )}
      <Link
        to={`/funcionarios/${funcionario.id}#suplencias`}
        className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
      >
        Ver historial de suplencias →
      </Link>
    </div>
  );
}

// ─── Tarjeta genérica ─────────────────────────────────────────────────────────
function FuncionarioCard({ funcionario, index, onSolicitar, grupo, esAdmin, onPasivar, onActivar, onEliminar }) {
  const cfg = GRUPOS[grupo] || GRUPOS.contrata;
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const descargarPDF = async (e) => {
    e.preventDefault();
    setGenerandoPDF(true);
    try {
      const anio = new Date().getFullYear();
      const [detalle, sols] = await Promise.all([
        funcionariosApi.obtener(funcionario.id, anio),
        solicitudesApi.listar({ funcionario_id: funcionario.id, limit: 200 }),
      ]);
      const solsAnio = (sols.data.solicitudes || []).filter(s =>
        new Date(s.fecha_inicio).getFullYear() === anio
      );
      generarReporteFuncionario(detalle.data, solsAnio);
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="card-hover p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
            funcionario.activo === false
              ? 'bg-dark-100 text-dark-400'
              : `${cfg.avatarBg} ${cfg.avatarText}`
          }`}>
            {funcionario.activo === false
              ? <UserX size={16} />
              : <>{funcionario.nombres[0]}{funcionario.apellidos[0]}</>
            }
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className={`font-semibold text-sm ${funcionario.activo === false ? 'text-dark-400' : 'text-dark-800'}`}>
                {funcionario.nombres} {funcionario.apellidos}
              </p>
              {funcionario.sector && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  { Verde: 'bg-green-100 text-green-700', Azul: 'bg-blue-100 text-blue-700', Amarillo: 'bg-yellow-100 text-yellow-700', Rojo: 'bg-red-100 text-red-700', Lila: 'bg-purple-100 text-purple-700', SAR: 'bg-cyan-100 text-cyan-700' }[funcionario.sector] || 'bg-dark-100 text-dark-600'
                }`}>{funcionario.sector}</span>
              )}
              {funcionario.tipo_contrato && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                  {funcionario.tipo_contrato}
                </span>
              )}
            </div>
            <p className="text-xs text-dark-500">{funcionario.cargo}</p>
            {funcionario.servicio && <p className="text-xs text-dark-400">{funcionario.servicio}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={descargarPDF}
            disabled={generandoPDF}
            title="Descargar PDF"
            className="p-1.5 rounded-lg hover:bg-emerald-50 text-dark-400 hover:text-emerald-600 transition-colors"
          >
            {generandoPDF
              ? <span className="animate-spin h-3.5 w-3.5 border border-emerald-600 border-t-transparent rounded-full inline-block" />
              : <FileDown size={15} />
            }
          </button>

          {/* Acciones de admin */}
          {esAdmin && funcionario.activo !== false && (
            <button
              onClick={() => onPasivar(funcionario)}
              title="Pasivar funcionario"
              className="p-1.5 rounded-lg hover:bg-amber-50 text-dark-400 hover:text-amber-600 transition-colors"
            >
              <PowerOff size={15} />
            </button>
          )}
          {esAdmin && funcionario.activo === false && (
            <>
              <button
                onClick={() => onActivar(funcionario)}
                title="Activar funcionario"
                className="p-1.5 rounded-lg hover:bg-emerald-50 text-dark-400 hover:text-emerald-600 transition-colors"
              >
                <Power size={15} />
              </button>
              <button
                onClick={() => onEliminar(funcionario)}
                title="Eliminar definitivamente"
                className="p-1.5 rounded-lg hover:bg-red-50 text-dark-400 hover:text-red-600 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}

          <Link
            to={`/funcionarios/${funcionario.id}`}
            className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400 hover:text-dark-600 transition-colors"
          >
            <ChevronRight size={17} />
          </Link>
        </div>
      </div>

      {/* Contenido específico por grupo */}
      {grupo === 'honorarios' ? (
        <CardHonorarios funcionario={funcionario} cfg={cfg} />
      ) : grupo === 'suplentes' ? (
        <CardSuplentes funcionario={funcionario} />
      ) : (
        <CardContrata
          funcionario={funcionario}
          cfg={cfg}
          onSolicitar={onSolicitar}
          descargarPDF={descargarPDF}
          generandoPDF={generandoPDF}
        />
      )}
    </motion.div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Funcionarios({ grupo }) {
  const { esSupervisor, esAdmin } = useAuth();
  const cfg = GRUPOS[grupo] || GRUPOS.contrata;

  const [funcionarios, setFuncionarios] = useState([]);
  const [busqueda, setBusqueda]         = useState('');
  const [cargando, setCargando]         = useState(true);
  const [verPasivos, setVerPasivos]     = useState(false);
  const [modalSolicitud, setModalSolicitud] = useState(null);
  const [showNuevo, setShowNuevo]       = useState(false);
  const [showBulk, setShowBulk]         = useState(false);

  // Pasivar
  const [confirmPasivar, setConfirmPasivar] = useState(null);
  const [procesandoPasivar, setProcesandoPasivar] = useState(false);

  // Eliminar definitivamente
  const [confirmEliminar, setConfirmEliminar] = useState(null);
  const [pasoEliminar, setPasoEliminar]       = useState(1);
  const [passwordAdmin, setPasswordAdmin]     = useState('');
  const [showPass, setShowPass]               = useState(false);
  const [procesandoEliminar, setProcesandoEliminar] = useState(false);

  const cargar = () => {
    setCargando(true);
    const params = {};
    if (grupo) params.tipo_grupo = cfg.api_param;
    if (verPasivos) params.activo = 'false';
    funcionariosApi.listar(params)
      .then(({ data }) => setFuncionarios(data))
      .catch(() => toast.error('Error al cargar funcionarios'))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, [verPasivos, grupo]);

  // ── Handlers de baja ────────────────────────────────────────────────────────

  async function handlePasivar() {
    if (!confirmPasivar) return;
    setProcesandoPasivar(true);
    try {
      await funcionariosApi.actualizar(confirmPasivar.id, { activo: false });
      toast.success(`${confirmPasivar.nombres} ${confirmPasivar.apellidos} pasivado correctamente`);
      setConfirmPasivar(null);
      cargar();
    } catch {
      toast.error('Error al pasivar el funcionario');
    } finally {
      setProcesandoPasivar(false);
    }
  }

  async function handleActivar(funcionario) {
    try {
      await funcionariosApi.actualizar(funcionario.id, { activo: true });
      toast.success(`${funcionario.nombres} ${funcionario.apellidos} activado correctamente`);
      cargar();
    } catch {
      toast.error('Error al activar el funcionario');
    }
  }

  function abrirEliminar(funcionario) {
    setConfirmEliminar(funcionario);
    setPasoEliminar(1);
    setPasswordAdmin('');
    setShowPass(false);
  }

  function cerrarEliminar() {
    setConfirmEliminar(null);
    setPasoEliminar(1);
    setPasswordAdmin('');
    setShowPass(false);
  }

  async function handleEliminarDefinitivo() {
    if (!passwordAdmin.trim()) return;
    setProcesandoEliminar(true);
    try {
      await funcionariosApi.eliminar(confirmEliminar.id, passwordAdmin);
      toast.success(`${confirmEliminar.nombres} ${confirmEliminar.apellidos} eliminado permanentemente`);
      cerrarEliminar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar. Verifica la contraseña.');
    } finally {
      setProcesandoEliminar(false);
    }
  }

  const filtrados = funcionarios.filter((f) => {
    if (verPasivos ? f.activo !== false : f.activo === false) return false;
    const q = busqueda.toLowerCase();
    return (
      f.nombres.toLowerCase().includes(q) ||
      f.apellidos.toLowerCase().includes(q) ||
      f.rut?.toLowerCase().includes(q) ||
      f.cargo?.toLowerCase().includes(q) ||
      f.servicio?.toLowerCase().includes(q) ||
      f.convenio_honorarios?.toLowerCase().includes(q) ||
      f.prestacion?.toLowerCase().includes(q)
    );
  });

  // Alertas de vencimiento (solo Honorarios y Suplentes)
  const conVencimiento = grupo !== 'contrata'
    ? filtrados.filter(f => {
        if (!f.fecha_termino_contrato) return false;
        const d = differenceInDays(new Date(f.fecha_termino_contrato.toString().substring(0,10)), new Date());
        return d <= 30;
      })
    : [];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">{cfg.label}</h1>
          <p className="text-dark-500 text-sm mt-0.5">{cfg.desc}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {esAdmin && (
            <div className="flex rounded-lg border border-dark-200 overflow-hidden text-xs font-medium">
              <button
                onClick={() => { setVerPasivos(false); setBusqueda(''); }}
                className={`px-3 py-1.5 transition-colors ${!verPasivos ? 'bg-brand-600 text-white' : 'bg-white text-dark-600 hover:bg-dark-50'}`}
              >
                Activos
              </button>
              <button
                onClick={() => { setVerPasivos(true); setBusqueda(''); }}
                className={`px-3 py-1.5 transition-colors ${verPasivos ? 'bg-dark-700 text-white' : 'bg-white text-dark-600 hover:bg-dark-50'}`}
              >
                Pasivos
              </button>
            </div>
          )}
          {esAdmin && !verPasivos && (
            <>
              <button onClick={() => setShowBulk(true)} className="btn-secondary">
                <Upload size={15} />
                <span className="hidden sm:inline">Carga masiva</span>
              </button>
              <button onClick={() => setShowNuevo(true)} className="btn-primary">
                <Plus size={15} />
                <span className="hidden sm:inline">Nuevo</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alerta vencimientos */}
      {conVencimiento.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-sm text-amber-700">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>
            <strong>{conVencimiento.length}</strong> contrato{conVencimiento.length > 1 ? 's' : ''} vence{conVencimiento.length === 1 ? '' : 'n'} en los próximos 30 días.
          </span>
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={`Buscar ${cfg.label.toLowerCase()} por nombre, RUT, cargo...`}
          className="input-field pl-10 bg-white"
        />
      </div>

      {/* Contador */}
      {!cargando && (
        <p className="text-xs text-dark-400">
          {filtrados.length} funcionario{filtrados.length !== 1 ? 's' : ''} {verPasivos ? 'pasivo(s)' : 'activo(s)'}
        </p>
      )}

      {/* Grid */}
      {cargando ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card p-4 h-48 animate-pulse bg-dark-100" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-dark-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin resultados</p>
          <p className="text-sm mt-1">
            {busqueda
              ? `No se encontraron ${cfg.label.toLowerCase()} para "${busqueda}"`
              : verPasivos
              ? `No hay ${cfg.label.toLowerCase()} pasivos registrados`
              : `No hay ${cfg.label.toLowerCase()} registrados`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtrados.map((f, i) => (
            <FuncionarioCard
              key={f.id}
              funcionario={f}
              index={i}
              grupo={grupo}
              esAdmin={esAdmin}
              onSolicitar={esSupervisor && grupo !== 'honorarios' ? setModalSolicitud : null}
              onPasivar={setConfirmPasivar}
              onActivar={handleActivar}
              onEliminar={abrirEliminar}
            />
          ))}
        </div>
      )}

      {modalSolicitud && (
        <SolicitudModal
          funcionario={modalSolicitud}
          onClose={() => setModalSolicitud(null)}
          onSuccess={cargar}
        />
      )}

      {showNuevo && (
        <FuncionarioModal
          onClose={() => setShowNuevo(false)}
          onSuccess={cargar}
          grupoInicial={grupo}
        />
      )}

      {showBulk && (
        <CargaMasivaModal
          onClose={() => setShowBulk(false)}
          onSuccess={cargar}
        />
      )}

      {/* ── Modal: Confirmar Pasivar ────────────────────────────────────────── */}
      {confirmPasivar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <PowerOff size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-dark-900">Pasivar funcionario</h3>
                <p className="text-xs text-dark-500">Borrado lógico reversible</p>
              </div>
            </div>

            <p className="text-sm text-dark-700 mb-1">
              ¿Confirmas pasivar a{' '}
              <strong>{confirmPasivar.nombres} {confirmPasivar.apellidos}</strong>?
            </p>
            <p className="text-xs text-dark-500 mb-5">
              El funcionario no podrá iniciar sesión ni aparecerá en los listados activos.
              Su historial queda intacto y la acción es reversible desde la vista "Pasivos".
            </p>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmPasivar(null)}
                className="btn-secondary text-sm"
                disabled={procesandoPasivar}
              >
                Cancelar
              </button>
              <button
                onClick={handlePasivar}
                disabled={procesandoPasivar}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {procesandoPasivar
                  ? <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  : <PowerOff size={14} />
                }
                Pasivar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Modal: Eliminar Definitivamente ────────────────────────────────── */}
      {confirmEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  {pasoEliminar === 1
                    ? <ShieldAlert size={18} className="text-red-600" />
                    : <Trash2 size={18} className="text-red-600" />
                  }
                </div>
                <div>
                  <h3 className="font-semibold text-dark-900">Eliminar definitivamente</h3>
                  <p className="text-xs text-dark-500">Paso {pasoEliminar} de 2</p>
                </div>
              </div>
              <button onClick={cerrarEliminar} className="text-dark-400 hover:text-dark-600">
                <X size={18} />
              </button>
            </div>

            {pasoEliminar === 1 ? (
              <>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <p className="text-sm font-semibold text-red-700 mb-1">⚠ Esta acción es irreversible</p>
                  <p className="text-xs text-red-600">
                    Se eliminará por completo el registro de{' '}
                    <strong>{confirmEliminar.nombres} {confirmEliminar.apellidos}</strong>,
                    incluyendo su historial, saldos, solicitudes y cuenta de usuario.
                    No hay forma de recuperar estos datos.
                  </p>
                </div>
                <p className="text-xs text-dark-500 mb-5">
                  Solo se puede eliminar un funcionario que ya esté en estado <strong>Pasivo</strong>.
                </p>
                <div className="flex gap-2 justify-end">
                  <button onClick={cerrarEliminar} className="btn-secondary text-sm">
                    Cancelar
                  </button>
                  <button
                    onClick={() => setPasoEliminar(2)}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <ShieldAlert size={14} />
                    Entendido, continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-dark-700 mb-4">
                  Ingresa tu <strong>contraseña de administrador</strong> para confirmar la eliminación de{' '}
                  <strong>{confirmEliminar.nombres} {confirmEliminar.apellidos}</strong>.
                </p>
                <div className="relative mb-5">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={passwordAdmin}
                    onChange={(e) => setPasswordAdmin(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEliminarDefinitivo()}
                    placeholder="Contraseña de admin"
                    className="input-field pr-10 w-full"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setPasoEliminar(1)}
                    className="btn-secondary text-sm"
                    disabled={procesandoEliminar}
                  >
                    Atrás
                  </button>
                  <button
                    onClick={handleEliminarDefinitivo}
                    disabled={!passwordAdmin.trim() || procesandoEliminar}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {procesandoEliminar
                      ? <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                      : <Trash2 size={14} />
                    }
                    Eliminar definitivamente
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
