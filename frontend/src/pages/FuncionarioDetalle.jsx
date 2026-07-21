import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft, User, Calendar, Briefcase, Plus, Clock, BarChart3,
  Edit2, Save, X, Building2, ArrowLeftRight, FileDown, Printer, Camera, Trash2,
  KeyRound, Mail, ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Copy,
  ArrowRight, History, CalendarRange, Search, PartyPopper,
} from 'lucide-react';
import { funcionariosApi, historialApi, solicitudesApi, suplenciasApi } from '../api/client';
import { generarReporteFuncionario, imprimirReporteFuncionario } from '../utils/reportePDF';
import { useAuth } from '../context/AuthContext';
import { NOMBRE_ROL, COLOR_ROL, ORDEN_ROL } from '../config/roles';
import SaldosLista from '../components/SaldosLista';
import TimelineMovimientos from '../components/TimelineMovimientos';
import EstadoBadge from '../components/EstadoBadge';
import SolicitudModal from '../components/SolicitudModal';
import FuncionarioModal from '../components/FuncionarioModal';
import toast from 'react-hot-toast';

const MOTIVOS_SUP = {
  licencia_medica:        'Licencia Médica',
  feriado_legal:          'Feriado Legal',
  permiso_administrativo: 'Permiso Administrativo',
  permiso_sin_goce:       'Permiso Sin Goce',
  vacancia:               'Vacancia',
  otro:                   'Otro',
};

const ESTADO_SUP_STYLES = {
  activa:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  prorrogada: 'bg-blue-100 text-blue-700 border-blue-200',
  finalizada: 'bg-dark-100 text-dark-500 border-dark-200',
};

const fmtFechaSup = (d) => {
  if (!d) return '—';
  try { return format(parseISO(d.toString().substring(0,10)), 'd MMM yyyy', { locale: es }); }
  catch { return d; }
};

const CONTRATO_COLORS = {
  'Indefinido': 'bg-green-100 text-green-700',
  'Plazo Fijo': 'bg-blue-100 text-blue-700',
  'Honorarios': 'bg-yellow-100 text-yellow-700',
  'Suplencia':  'bg-purple-100 text-purple-700',
};

const TABS_VALIDOS = ['saldos', 'historial', 'solicitudes', 'suplencias'];

// Contraseña por defecto institucional — debe coincidir con INITIAL_PASSWORD
// en backend/.env (ver backend/src/utils/credenciales.js).
const PASSWORD_DEFAULT = 'cesfam2026';

// Estado de cuenta institucional: rojo (sin correo) / amarillo (contraseña por
// defecto sin cambiar) / verde (contraseña personalizada ya definida).
const estadoCuentaBadge = (f) => {
  if (!f.usuario_email) {
    return { texto: 'Sin correo registrado', clase: 'bg-red-100 text-red-700 border-red-200', Icon: XCircle };
  }
  if (f.must_change_password) {
    return { texto: 'Pendiente primer login', clase: 'bg-yellow-100 text-yellow-700 border-yellow-200', Icon: AlertTriangle };
  }
  return { texto: 'Cuenta activa', clase: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 };
};

export default function FuncionarioDetalle() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { esAdmin, esSupervisor, esFuncionario, usuario, tienePermiso } = useAuth();
  const puedeGestionarCredenciales = tienePermiso('funcionarios.gestionar_credenciales');
  const puedeEditarFuncionario = tienePermiso('funcionarios.editar', 'funcionarios.editar_basico');
  const puedeCrearParaTerceros = tienePermiso('solicitudes.crear_terceros');
  const puedeAjustarSaldos = tienePermiso('saldos.ajustar');
  const puedeEliminarFuncionario = tienePermiso('funcionarios.eliminar');
  const esPropioFuncionario = esFuncionario && String(usuario?.funcionario_id) === String(id);
  // Deliberadamente NO auto-servicio: el propio funcionario no controla su
  // publicación, solo quien ya puede editar datos básicos (RRHH/Admin/Secretaría).
  const puedeVerToggleCumpleanos = tienePermiso('funcionarios.editar_basico', 'funcionarios.editar');
  const [funcionario, setFuncionario] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.replace('#', '');
    return TABS_VALIDOS.includes(h) ? h : 'saldos';
  });

  useEffect(() => {
    const h = location.hash.replace('#', '');
    if (TABS_VALIDOS.includes(h)) setTab(h);
  }, [location.hash]);

  // Suplencias
  const [suplencias, setSuplencias]         = useState([]);
  const [cargandoSup, setCargandoSup]       = useState(false);
  const [showNuevaSup, setShowNuevaSup]     = useState(false);
  const [prorrogarSup, setProrrogarSup]     = useState(null);
  const [finalizarSup, setFinalizarSup]     = useState(null);
  const [supForm, setSupForm]               = useState({
    funcionario_reemplazado_id: '', nombre_reemplazado: '', rut_reemplazado: '',
    cargo_reemplazado: '', unidad: '', motivo_reemplazo: '',
    fecha_inicio: '', fecha_termino: '', observaciones: '', documento_respaldo: '',
  });
  const [supGuardando, setSupGuardando]     = useState(false);
  const [busquedaRemp, setBusquedaRemp]     = useState('');
  const [showDropdownRemp, setShowDropdownRemp] = useState(false);
  const [reemplazadoSel, setReemplazadoSel] = useState(null);
  const [todosFunc, setTodosFunc]           = useState([]);
  const dropdownRempRef                     = useRef(null);
  const [prorrogaForm, setProrrogaForm]     = useState({ fecha: '', obs: '' });
  const [finalizaObs, setFinalizaObs]       = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editandoSaldos, setEditandoSaldos] = useState(false);
  const [saldosEdit, setSaldosEdit] = useState({});
  const [arrastreEdit, setArrastreEdit] = useState({});
  const [motivoEdit, setMotivoEdit] = useState('');
  const [guardandoSaldos, setGuardandoSaldos] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fotoInputRef = useRef(null);

  // Gestión de cuenta / credenciales institucionales
  const [accionCuenta, setAccionCuenta] = useState(null); // 'email' | 'reset-password' | 'eliminar'
  const [cuentaForm, setCuentaForm] = useState({ password_admin: '', email: '' });
  const [procesandoCuenta, setProcesandoCuenta] = useState(false);

  // Opt-out del muro social de cumpleaños
  const [guardandoCumple, setGuardandoCumple] = useState(false);
  const toggleCumpleanos = async () => {
    if (guardandoCumple) return;
    const nuevoValor = !funcionario.mostrar_cumpleanos;
    setGuardandoCumple(true);
    try {
      await funcionariosApi.toggleCumpleanos(id, nuevoValor);
      setFuncionario((prev) => ({ ...prev, mostrar_cumpleanos: nuevoValor }));
      toast.success(nuevoValor ? 'Su cumpleaños se mostrará en el muro social' : 'Su cumpleaños ya no se mostrará');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al actualizar la preferencia');
    } finally {
      setGuardandoCumple(false);
    }
  };

  const cargarFuncionario = () => {
    setCargando(true);
    funcionariosApi.obtener(id)
      .then(({ data }) => setFuncionario(data))
      .catch(() => toast.error('Error al cargar funcionario'))
      .finally(() => setCargando(false));
  };

  const cargarHistorial = () => {
    setCargandoHistorial(true);
    historialApi.porFuncionario(id, { anio: new Date().getFullYear() })
      .then(({ data }) => setHistorial(data))
      .catch(() => toast.error('Error al cargar historial'))
      .finally(() => setCargandoHistorial(false));
  };

  const cargarSuplencias = () => {
    setCargandoSup(true);
    suplenciasApi.porFuncionario(id)
      .then(({ data }) => setSuplencias(data))
      .catch(() => {})
      .finally(() => setCargandoSup(false));
  };

  useEffect(() => { cargarFuncionario(); }, [id]);

  useEffect(() => {
    if (tab === 'historial') cargarHistorial();
    if (tab === 'suplencias') cargarSuplencias();
  }, [tab, id]);

  // Carga lista de funcionarios al abrir el modal de nueva suplencia
  useEffect(() => {
    if (!showNuevaSup) return;
    funcionariosApi.listar().then(({ data }) => setTodosFunc(data)).catch(() => {});
    setBusquedaRemp('');
    setShowDropdownRemp(false);
    setReemplazadoSel(null);
  }, [showNuevaSup]);

  // Cierra dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRempRef.current && !dropdownRempRef.current.contains(e.target))
        setShowDropdownRemp(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const iniciarEdicionSaldos = () => {
    const inicialSaldos = {};
    const inicialArrastre = {};
    funcionario.saldos?.forEach(s => {
      inicialSaldos[s.tipo_permiso_id] = s.dias_asignados;
      if (s.es_feriado_legal) inicialArrastre[s.tipo_permiso_id] = s.saldo_arrastre || 0;
    });
    setSaldosEdit(inicialSaldos);
    setArrastreEdit(inicialArrastre);
    setMotivoEdit('');
    setEditandoSaldos(true);
  };

  const cancelarEdicionSaldos = () => {
    setEditandoSaldos(false);
    setSaldosEdit({});
    setArrastreEdit({});
    setMotivoEdit('');
  };

  const guardarSaldos = async () => {
    if (!motivoEdit.trim()) return toast.error('Ingresa un motivo para el ajuste');
    setGuardandoSaldos(true);
    try {
      await funcionariosApi.actualizarSaldos(id, saldosEdit, arrastreEdit, new Date().getFullYear(), motivoEdit);
      toast.success('Saldos actualizados correctamente');
      cancelarEdicionSaldos();
      cargarFuncionario();
    } catch {
      toast.error('Error al actualizar saldos');
    } finally {
      setGuardandoSaldos(false);
    }
  };

  const fetchSolicitudesAnio = async () => {
    const anio = new Date().getFullYear();
    const { data } = await solicitudesApi.listar({ funcionario_id: id, limit: 200 });
    return (data.solicitudes || []).filter(s => new Date(s.fecha_inicio).getFullYear() === anio);
  };

  const descargarReporte = async () => {
    setGenerandoPDF(true);
    try {
      generarReporteFuncionario(funcionario, await fetchSolicitudesAnio());
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setGenerandoPDF(false);
    }
  };

  const imprimirReporte = async () => {
    setGenerandoPDF(true);
    try {
      imprimirReporteFuncionario(funcionario, await fetchSolicitudesAnio());
    } catch {
      toast.error('Error al generar el reporte');
    } finally {
      setGenerandoPDF(false);
    }
  };

  const comprimirImagen = (file) => new Promise((resolve, reject) => {
    const maxSize = 280 * 1024; // 280KB para dejar margen al base64
    if (file.size <= maxSize) {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxDim = 600;
      if (width > height && width > maxDim) { height = (height * maxDim) / width; width = maxDim; }
      else if (height > maxDim) { width = (width * maxDim) / height; height = maxDim; }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.80));
    };
    img.onerror = reject;
    img.src = url;
  });

  const subirFoto = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Solo se permiten imágenes');
    setSubiendoFoto(true);
    try {
      const base64 = await comprimirImagen(file);
      await funcionariosApi.actualizarFoto(id, base64);
      toast.success('Foto actualizada');
      setFuncionario(prev => ({ ...prev, foto_url: base64 }));
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al subir la foto');
    } finally {
      setSubiendoFoto(false);
      if (fotoInputRef.current) fotoInputRef.current.value = '';
    }
  };

  const eliminarFoto = async () => {
    setSubiendoFoto(true);
    try {
      await funcionariosApi.eliminarFoto(id);
      toast.success('Foto eliminada');
      setFuncionario(prev => ({ ...prev, foto_url: null }));
    } catch {
      toast.error('Error al eliminar la foto');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const abrirAccion = (accion) => {
    setCuentaForm({ password_admin: '', email: funcionario?.usuario_email || '' });
    setAccionCuenta(accion);
  };

  const ejecutarAccionCuenta = async () => {
    setProcesandoCuenta(true);
    try {
      if (accionCuenta === 'email') {
        if (!cuentaForm.email.includes('@')) { setProcesandoCuenta(false); return toast.error('Email inválido'); }
        const { data } = await funcionariosApi.actualizarEmailCuenta(id, cuentaForm.email);
        toast.success(data.cuenta_creada ? 'Cuenta creada con contraseña por defecto' : 'Email actualizado');
        cargarFuncionario();
      } else if (accionCuenta === 'reset-password') {
        await funcionariosApi.resetearPasswordDefault(id);
        toast.success('Contraseña restablecida al valor por defecto');
        cargarFuncionario();
      } else if (accionCuenta === 'eliminar') {
        if (!cuentaForm.password_admin) { setProcesandoCuenta(false); return toast.error('Ingresa tu contraseña de administrador'); }
        await funcionariosApi.eliminar(id, cuentaForm.password_admin);
        toast.success('Funcionario eliminado');
        navigate('/funcionarios');
        return;
      }
      setAccionCuenta(null);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al procesar la acción');
    } finally {
      setProcesandoCuenta(false);
    }
  };

  // Sin infraestructura de envío de correo en el proyecto: en vez de un switch
  // de "enviar bienvenida" que no haría nada real, se copian las credenciales
  // al portapapeles para que el staff se las entregue por el canal que use
  // habitualmente (WhatsApp, papel, llamada).
  const copiarCredenciales = async () => {
    const texto = `Correo: ${funcionario.usuario_email}\nContraseña temporal: ${PASSWORD_DEFAULT}\nDebe cambiarla en su primer inicio de sesión.`;
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Credenciales copiadas al portapapeles');
    } catch {
      toast.error('No se pudo copiar. Revisa los permisos del navegador.');
    }
  };

  if (cargando) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-dark-200 rounded" />
        <div className="card p-6 h-36 bg-dark-100" />
      </div>
    );
  }

  if (!funcionario) {
    return (
      <div className="p-6 text-center">
        <p className="text-dark-500">Funcionario no encontrado</p>
        <Link to="/funcionarios" className="btn-primary mt-4 inline-flex">Volver</Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Breadcrumb — solo supervisores tienen la lista de funcionarios */}
      {esSupervisor && (
        <Link to="/funcionarios" className="inline-flex items-center gap-2 text-sm text-dark-500 hover:text-dark-700">
          <ArrowLeft size={16} />
          Funcionarios
        </Link>
      )}

      {/* Perfil */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-5"
      >
        <div className="flex items-start gap-4">
          {/* Avatar con foto */}
          <div className="relative flex-shrink-0 group">
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-brand-100 flex items-center justify-center text-xl font-bold text-brand-700">
              {funcionario.foto_url
                ? <img src={funcionario.foto_url} alt="Foto" className="w-full h-full object-cover" />
                : <span>{funcionario.nombres[0]}{funcionario.apellidos[0]}</span>
              }
            </div>
            {puedeEditarFuncionario && (
              <button
                onClick={() => fotoInputRef.current?.click()}
                disabled={subiendoFoto}
                className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                title="Cambiar foto"
              >
                {subiendoFoto
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : <Camera size={18} className="text-white" />
                }
              </button>
            )}
            {funcionario.foto_url && puedeEditarFuncionario && (
              <button
                onClick={eliminarFoto}
                disabled={subiendoFoto}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Eliminar foto"
              >
                <Trash2 size={10} />
              </button>
            )}
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => subirFoto(e.target.files?.[0])}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-dark-900">
              {funcionario.nombres} {funcionario.apellidos}
            </h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              <span className="text-sm text-dark-500 flex items-center gap-1">
                <Briefcase size={13} />
                {funcionario.cargo}
              </span>
              {funcionario.servicio && (
                <span className="text-sm text-dark-500 flex items-center gap-1">
                  <User size={13} />
                  {funcionario.servicio}
                </span>
              )}
              {funcionario.dispositivo && (
                <span className="text-sm text-dark-500 flex items-center gap-1">
                  <Building2 size={13} />
                  {funcionario.dispositivo}
                </span>
              )}
              {funcionario.fecha_ingreso && (
                <span className="text-sm text-dark-500 flex items-center gap-1">
                  <Calendar size={13} />
                  Desde {format(parseISO(funcionario.fecha_ingreso), 'MMM yyyy', { locale: es })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <p className="text-xs text-dark-400">RUT: {funcionario.rut}</p>
              {funcionario.sector && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  { Verde: 'bg-green-100 text-green-700', Azul: 'bg-blue-100 text-blue-700', Amarillo: 'bg-yellow-100 text-yellow-700', Rojo: 'bg-red-100 text-red-700', Lila: 'bg-purple-100 text-purple-700', SAR: 'bg-cyan-100 text-cyan-700' }[funcionario.sector] || 'bg-dark-100 text-dark-600'
                }`}>
                  Sector {funcionario.sector}
                </span>
              )}
              {funcionario.area && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {funcionario.area}
                </span>
              )}
              {funcionario.activo === false && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  Pasivo
                </span>
              )}
              {funcionario.tipo_contrato && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONTRATO_COLORS[funcionario.tipo_contrato] || 'bg-dark-100 text-dark-600'}`}>
                  {funcionario.tipo_contrato}
                </span>
              )}
              {funcionario.horas_contrato && (
                <span className="text-xs text-dark-500 flex items-center gap-1">
                  <Clock size={11} />
                  {funcionario.horas_contrato}h/sem
                </span>
              )}
              {funcionario.tipo_contrato === 'Suplencia' && funcionario.reemplaza_nombres && (
                <span className="text-xs text-purple-600 font-medium">
                  Reemplaza a: {funcionario.reemplaza_nombres} {funcionario.reemplaza_apellidos}
                </span>
              )}
            </div>
            {/* Rol(es) RBAC del funcionario en el sistema */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {(funcionario.roles_rbac?.length > 0)
                ? ORDEN_ROL
                    .filter((codigo) => funcionario.roles_rbac.includes(codigo))
                    .map((codigo) => (
                      <span
                        key={codigo}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border ${COLOR_ROL[codigo] || 'bg-dark-100 text-dark-600 border-dark-200'}`}
                      >
                        {NOMBRE_ROL[codigo] || codigo}
                      </span>
                    ))
                : funcionario.usuario_id && (
                    <span className="text-xs text-dark-400">Sin rol asignado en el sistema</span>
                  )}
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            {(esAdmin || esPropioFuncionario || puedeCrearParaTerceros) && (
              <button onClick={() => setShowModal(true)} className="btn-primary">
                <Plus size={16} />
                <span className="hidden sm:inline">Nueva solicitud</span>
              </button>
            )}
            {puedeEditarFuncionario && (
              <button onClick={() => setShowEditModal(true)} className="btn-secondary">
                <Edit2 size={15} />
                <span className="hidden sm:inline">Editar datos</span>
              </button>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={descargarReporte}
                disabled={generandoPDF}
                className="btn-secondary text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                title="Descargar PDF"
              >
                {generandoPDF
                  ? <span className="animate-spin h-4 w-4 border-2 border-emerald-600 border-t-transparent rounded-full" />
                  : <FileDown size={15} />
                }
                <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                onClick={imprimirReporte}
                disabled={generandoPDF}
                className="btn-secondary text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                title="Imprimir reporte"
              >
                <Printer size={15} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Gestión de cuenta / credenciales institucionales */}
      {(puedeGestionarCredenciales || (puedeEliminarFuncionario && funcionario.activo === false)) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5 space-y-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={16} className="text-dark-500" />
            <h3 className="text-sm font-semibold text-dark-700">Gestión de cuenta</h3>
          </div>

          {puedeGestionarCredenciales && (() => {
            const badge = estadoCuentaBadge(funcionario);
            return (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-dark-600 flex-1 min-w-0">
                  <Mail size={14} className="text-dark-400 flex-shrink-0" />
                  <span className="truncate">{funcionario.usuario_email || 'Sin correo registrado'}</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${badge.clase}`}>
                    <badge.Icon size={11} />
                    {badge.texto}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <button onClick={() => abrirAccion('email')} className="btn-secondary text-xs py-1.5 px-3">
                    <Mail size={13} />
                    {funcionario.usuario_email ? 'Cambiar email' : 'Registrar email'}
                  </button>
                  {funcionario.usuario_email && (
                    <>
                      <button onClick={() => abrirAccion('reset-password')} className="btn-secondary text-xs py-1.5 px-3">
                        <KeyRound size={13} />
                        Asignar / Resetear a Contraseña por Defecto
                      </button>
                      <button onClick={copiarCredenciales} className="btn-secondary text-xs py-1.5 px-3">
                        <Copy size={13} />
                        Copiar credenciales
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {puedeEliminarFuncionario && funcionario.activo === false && (
            <div className="pt-1 border-t border-dark-100">
              <button
                onClick={() => abrirAccion('eliminar')}
                className="btn-secondary text-xs py-1.5 px-3 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 size={13} />
                Eliminar funcionario permanentemente
              </button>
            </div>
          )}

          {/* Panel de confirmación inline */}
          {accionCuenta && (
            <div className="mt-3 p-4 bg-dark-50 rounded-xl border border-dark-200 space-y-3">
              <p className="text-sm font-medium text-dark-800">
                {accionCuenta === 'email' && (funcionario.usuario_email ? 'Nuevo email para el funcionario' : 'Registrar correo y crear cuenta')}
                {accionCuenta === 'reset-password' && '¿Asignar la contraseña por defecto?'}
                {accionCuenta === 'eliminar' && '¿Eliminar este funcionario permanentemente?'}
              </p>

              {accionCuenta === 'email' && (
                <input
                  type="email"
                  placeholder="Correo institucional o personal"
                  value={cuentaForm.email}
                  onChange={e => setCuentaForm(p => ({ ...p, email: e.target.value }))}
                  className="input-field"
                  autoFocus
                />
              )}
              {accionCuenta === 'reset-password' && (
                <p className="text-xs text-dark-500">
                  La nueva contraseña será <span className="font-mono font-medium text-dark-700">{PASSWORD_DEFAULT}</span>.
                  Deberá cambiarla al iniciar sesión.
                </p>
              )}
              {accionCuenta === 'eliminar' && (
                <p className="text-xs text-red-600">
                  Se eliminarán todos los datos: historial, saldos y solicitudes del funcionario. Esta acción no se puede deshacer.
                </p>
              )}

              {accionCuenta === 'eliminar' && (
                <input
                  type="password"
                  placeholder="Tu contraseña de administrador"
                  value={cuentaForm.password_admin}
                  onChange={e => setCuentaForm(p => ({ ...p, password_admin: e.target.value }))}
                  className="input-field"
                />
              )}

              <div className="flex gap-2">
                <button onClick={() => setAccionCuenta(null)} className="btn-secondary flex-1 justify-center text-sm py-2">
                  Cancelar
                </button>
                <button
                  onClick={ejecutarAccionCuenta}
                  disabled={procesandoCuenta}
                  className={`flex-1 justify-center text-sm py-2 inline-flex items-center gap-2 font-medium rounded-xl border transition-all ${
                    accionCuenta === 'eliminar'
                      ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                      : 'btn-primary'
                  }`}
                >
                  {procesandoCuenta
                    ? <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    : accionCuenta === 'eliminar' ? 'Eliminar' : 'Confirmar'
                  }
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Estado del muro social de cumpleaños — visible para cualquiera que ya
          puede ver esta ficha; el switch solo es interactivo para quien tiene
          permiso de edición (RRHH/Admin/Secretaría). El funcionario ve su
          estado siempre, aunque no pueda cambiarlo. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <PartyPopper size={16} className="text-amber-500 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-dark-700">Muro social de cumpleaños</h3>
              <p className="text-xs text-dark-500">
                {funcionario.mostrar_cumpleanos
                  ? 'Su cumpleaños se publica y sus compañeros pueden felicitarlo.'
                  : 'Su cumpleaños no se publica en el muro social.'}
                {!puedeVerToggleCumpleanos && ' Solo RRHH/Administración puede cambiar esto.'}
              </p>
            </div>
          </div>
          <button
            onClick={puedeVerToggleCumpleanos ? toggleCumpleanos : undefined}
            disabled={guardandoCumple || !puedeVerToggleCumpleanos}
            role="switch"
            aria-checked={funcionario.mostrar_cumpleanos}
            title={puedeVerToggleCumpleanos ? undefined : 'Solo RRHH/Administración puede cambiar esto'}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
              funcionario.mostrar_cumpleanos ? 'bg-brand-600' : 'bg-dark-300'
            } ${puedeVerToggleCumpleanos ? 'disabled:opacity-60' : 'opacity-70 cursor-not-allowed'}`}
          >
            <motion.span
              className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow"
              animate={{ x: funcionario.mostrar_cumpleanos ? 20 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
        </div>
      </motion.div>

      {/* Tabs */}
      {(() => {
        const mostrarSuplencias = funcionario?.tipo_contrato === 'Suplencia' || esAdmin || esSupervisor || puedeEditarFuncionario;
        const tabs = [
          { id: 'saldos',      label: 'Saldos',      icon: BarChart3 },
          { id: 'historial',   label: 'Historial',   icon: Clock },
          { id: 'solicitudes', label: 'Solicitudes', icon: Calendar },
          ...(mostrarSuplencias ? [{ id: 'suplencias', label: 'Suplencias', icon: History }] : []),
        ];
        return (
          <div className="flex gap-1 bg-dark-100 p-1 rounded-xl w-fit flex-wrap">
            {tabs.map(({ id: tid, label, icon: Icon }) => (
              <button
                key={tid}
                onClick={() => setTab(tid)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  tab === tid ? 'bg-white text-dark-900 shadow-sm' : 'text-dark-500 hover:text-dark-700'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Tab: Saldos */}
      {tab === 'saldos' && (
        <div className="space-y-4">
          {puedeAjustarSaldos && !editandoSaldos && funcionario.saldos?.length > 0 && (
            <div className="flex justify-end">
              <button onClick={iniciarEdicionSaldos} className="btn-secondary gap-2">
                <Edit2 size={15} />
                Editar saldos
              </button>
            </div>
          )}

          {editandoSaldos ? (
            <div className="card p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-dark-800">Ajuste manual de días asignados</p>
                <p className="text-xs text-dark-500 mt-0.5">Útil para cambios de grado. Se registra en el historial con motivo.</p>
              </div>
              <div className="space-y-3">
                {funcionario.saldos?.map(s => (
                  <div key={s.tipo_permiso_id} className={`rounded-lg p-3 ${s.es_feriado_legal ? 'bg-amber-50 border border-amber-100' : 'bg-dark-50'}`}>
                    {/* Fila: días período actual */}
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-sm text-dark-700 flex-1 truncate font-medium">{s.tipo_nombre}</span>
                      <span className="text-xs text-dark-400 hidden sm:block">
                        Usados: {s.dias_usados} · Pend: {s.dias_pendientes || 0}
                      </span>
                      <input
                        type="number" min="0" max="365"
                        value={saldosEdit[s.tipo_permiso_id] ?? s.dias_asignados}
                        onChange={e => setSaldosEdit(prev => ({ ...prev, [s.tipo_permiso_id]: e.target.value }))}
                        className="input-field w-20 text-center text-sm py-1.5"
                      />
                      <span className="text-xs text-dark-400 w-14">días año</span>
                    </div>

                    {/* Fila extra: arrastre (solo feriado legal) */}
                    {s.es_feriado_legal && (
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-amber-200">
                        <ArrowLeftRight size={12} className="text-amber-500 flex-shrink-0 ml-0.5" />
                        <span className="text-xs text-amber-700 flex-1">
                          Arrastre período anterior
                          <span className="text-amber-500 ml-1">
                            (usado: {s.arrastre_usados || 0} · pend: {s.arrastre_pendientes || 0})
                          </span>
                        </span>
                        <input
                          type="number" min="0" max="365"
                          value={arrastreEdit[s.tipo_permiso_id] ?? (s.saldo_arrastre || 0)}
                          onChange={e => setArrastreEdit(prev => ({ ...prev, [s.tipo_permiso_id]: e.target.value }))}
                          className="input-field w-20 text-center text-sm py-1.5 border-amber-300 focus:border-amber-500"
                        />
                        <span className="text-xs text-amber-600 w-14">días arr.</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-700 mb-1.5">
                  Motivo del ajuste <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={motivoEdit}
                  onChange={e => setMotivoEdit(e.target.value)}
                  className="input-field"
                  placeholder="Ej: Cambio de grado, trienio, resolución N°123..."
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={cancelarEdicionSaldos} className="btn-secondary flex-1 justify-center">
                  <X size={15} />
                  Cancelar
                </button>
                <button onClick={guardarSaldos} disabled={guardandoSaldos} className="btn-primary flex-1 justify-center">
                  {guardandoSaldos
                    ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    : <><Save size={15} className="mr-1" />Guardar</>
                  }
                </button>
              </div>
            </div>
          ) : (
            <SaldosLista saldos={funcionario.saldos} />
          )}
        </div>
      )}

      {/* Tab: Historial */}
      {tab === 'historial' && (
        <div>
          <p className="text-sm text-dark-500 mb-4">
            Registro completo de movimientos del año {new Date().getFullYear()}
          </p>
          <TimelineMovimientos movimientos={historial} cargando={cargandoHistorial} />
        </div>
      )}

      {/* Tab: Solicitudes */}
      {tab === 'solicitudes' && (
        <div className="card">
          <div className="px-5 py-4 border-b border-dark-100">
            <h3 className="font-semibold text-dark-800">Solicitudes recientes</h3>
          </div>
          <div className="divide-y divide-dark-100">
            {funcionario.solicitudes_recientes?.length === 0 && (
              <div className="px-5 py-10 text-center text-dark-400 text-sm">
                Sin solicitudes registradas
              </div>
            )}
            {funcionario.solicitudes_recientes?.map((sol) => (
              <div key={sol.id} className="px-5 py-3.5 flex items-start gap-4">
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: sol.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-dark-800">{sol.tipo_nombre}</p>
                    <EstadoBadge estado={sol.estado} />
                  </div>
                  <p className="text-xs text-dark-500 mt-0.5">
                    {format(parseISO(sol.fecha_inicio), 'd MMM', { locale: es })} –{' '}
                    {format(parseISO(sol.fecha_fin), 'd MMM yyyy', { locale: es })}
                    · {sol.dias_solicitados} día(s)
                  </p>
                  {sol.motivo && (
                    <p className="text-xs text-dark-400 mt-0.5 truncate">{sol.motivo}</p>
                  )}
                </div>
                <p className="text-xs text-dark-400 flex-shrink-0">
                  {format(parseISO(sol.fecha_solicitud), 'd MMM', { locale: es })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Suplencias */}
      {tab === 'suplencias' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-dark-500">
              Historial completo de suplencias realizadas por este funcionario
            </p>
            {puedeEditarFuncionario && (
              <button
                onClick={() => { setSupForm({ funcionario_reemplazado_id: '', nombre_reemplazado: '', rut_reemplazado: '', cargo_reemplazado: '', unidad: '', motivo_reemplazo: '', fecha_inicio: '', fecha_termino: '', observaciones: '', documento_respaldo: '' }); setShowNuevaSup(true); }}
                className="btn-primary"
              >
                <Plus size={15} />
                Nueva suplencia
              </button>
            )}
          </div>

          {cargandoSup ? (
            <div className="py-10 flex justify-center">
              <span className="animate-spin h-5 w-5 border-2 border-brand-500 border-t-transparent rounded-full" />
            </div>
          ) : suplencias.length === 0 ? (
            (() => {
              const tieneDatosContractuales =
                funcionario?.tipo_contrato === 'Suplencia' && funcionario?.reemplaza_nombres;
              const fechaTerminoContrato = funcionario?.fecha_termino_contrato;
              const diasRestantesContrato = fechaTerminoContrato
                ? differenceInDays(
                    new Date(fechaTerminoContrato.toString().substring(0,10) + 'T00:00:00'),
                    new Date()
                  )
                : null;
              const diasTotalesContrato = fechaTerminoContrato && funcionario?.fecha_ingreso
                ? differenceInDays(
                    new Date(fechaTerminoContrato.toString().substring(0,10) + 'T00:00:00'),
                    new Date(funcionario.fecha_ingreso.toString().substring(0,10) + 'T00:00:00')
                  ) + 1
                : null;

              if (!tieneDatosContractuales) {
                return (
                  <div className="card py-12 text-center text-dark-400 text-sm">
                    Sin suplencias registradas
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {/* Banner informativo */}
                  <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-sm">
                    <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-800">Suplencia vigente sin registro formal</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Los datos contractuales indican suplencia activa, pero no existe un registro
                        en el historial institucional. Use "Nueva suplencia" para formalizarlo.
                      </p>
                    </div>
                  </div>

                  {/* Card sintetizado desde datos contractuales */}
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card p-5 space-y-3 border-2 border-emerald-300 bg-emerald-50/20"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">
                          <CheckCircle2 size={11} /> Activa (desde contrato)
                        </span>
                        <span className="text-xs text-dark-400 italic">Sin registro formal en historial</span>
                      </div>
                      {puedeEditarFuncionario && (
                        <button
                          onClick={() => {
                            setSupForm({
                              funcionario_reemplazado_id: funcionario.reemplaza_a || '',
                              nombre_reemplazado: `${funcionario.reemplaza_nombres} ${funcionario.reemplaza_apellidos || ''}`.trim(),
                              rut_reemplazado: '',
                              cargo_reemplazado: '',
                              unidad: funcionario.dispositivo || '',
                              motivo_reemplazo: '',
                              fecha_inicio: funcionario.fecha_ingreso?.toString().substring(0,10) || '',
                              fecha_termino: fechaTerminoContrato?.toString().substring(0,10) || '',
                              observaciones: '',
                              documento_respaldo: '',
                            });
                            setShowNuevaSup(true);
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-medium"
                        >
                          <Plus size={11} className="inline mr-1" />Registrar en historial
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <p className="text-xs text-dark-400">Reemplaza a</p>
                        <p className="font-medium text-dark-800">
                          {funcionario.reemplaza_nombres} {funcionario.reemplaza_apellidos}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-dark-400">Dispositivo / Unidad</p>
                        <p className="font-medium text-dark-800">{funcionario.dispositivo || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-dark-400">Cargo</p>
                        <p className="font-medium text-dark-800">{funcionario.cargo}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 py-2 px-3 bg-dark-50 rounded-xl text-sm">
                      <Calendar size={14} className="text-dark-400 flex-shrink-0" />
                      <span className="text-dark-600">
                        {funcionario.fecha_ingreso ? fmtFechaSup(funcionario.fecha_ingreso) : '—'}
                      </span>
                      <ArrowRight size={13} className="text-dark-300" />
                      <span className={`font-medium ${diasRestantesContrato !== null && diasRestantesContrato < 0 ? 'text-red-600' : 'text-dark-800'}`}>
                        {fechaTerminoContrato ? fmtFechaSup(fechaTerminoContrato) : '—'}
                      </span>
                      {diasTotalesContrato !== null && (
                        <span className="ml-auto text-xs text-dark-400">{diasTotalesContrato} días</span>
                      )}
                    </div>

                    {diasRestantesContrato !== null && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {diasTotalesContrato !== null && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
                            <CalendarRange size={12} />
                            {diasTotalesContrato} días totales de suplencia
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                          diasRestantesContrato < 0
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : diasRestantesContrato === 0
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : diasRestantesContrato <= 7
                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : diasRestantesContrato <= 30
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          <AlertTriangle size={11} />
                          {diasRestantesContrato < 0
                            ? `Vencida hace ${Math.abs(diasRestantesContrato)} días`
                            : diasRestantesContrato === 0
                            ? 'Vence hoy'
                            : `${diasRestantesContrato} días restantes`}
                        </span>
                      </div>
                    )}
                  </motion.div>
                </div>
              );
            })()
          ) : (() => {
            const vigentes    = suplencias.filter(s => s.estado !== 'finalizada');
            const historialSup = suplencias.filter(s => s.estado === 'finalizada');

            const renderCard = (s, destacada = false) => {
                const today = new Date().toISOString().split('T')[0];
                const estaVencida = s.estado !== 'finalizada' && s.fecha_termino?.toString().substring(0,10) < today;
                const reemplazadoNombre = s.funcionario_reemplazado_id
                  ? `${s.reemplazado_nombres_fn || ''} ${s.reemplazado_apellidos_fn || ''}`.trim()
                  : s.nombre_reemplazado || '—';
                const diasRestantes = s.estado !== 'finalizada'
                  ? differenceInDays(new Date(s.fecha_termino), new Date())
                  : null;
                const diasTotales = differenceInDays(
                  new Date(s.fecha_termino.toString().substring(0,10) + 'T00:00:00'),
                  new Date(s.fecha_inicio.toString().substring(0,10) + 'T00:00:00')
                ) + 1;
                const esVigente = s.estado !== 'finalizada';

                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`card p-5 space-y-3 ${destacada ? 'border-2 border-emerald-300 bg-emerald-50/20' : ''} ${estaVencida ? 'border-red-200 bg-red-50/30' : ''}`}
                  >
                    {/* Header de la suplencia */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${ESTADO_SUP_STYLES[s.estado]}`}>
                          {s.estado === 'activa'     && <CheckCircle2 size={11} />}
                          {s.estado === 'prorrogada' && <RefreshCw size={11} />}
                          {s.estado === 'finalizada' && <Clock size={11} />}
                          {s.estado === 'activa' ? 'Activa' : s.estado === 'prorrogada' ? 'Prorrogada' : 'Finalizada'}
                        </span>
                        {estaVencida && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 border border-red-200">
                            <AlertTriangle size={10} />Vencida sin cerrar
                          </span>
                        )}
                        {s.prorrogas?.length > 0 && (
                          <span className="text-xs text-blue-600 font-medium px-2 py-0.5 bg-blue-50 rounded-full">
                            {s.prorrogas.length}× prorrogada
                          </span>
                        )}
                      </div>
                      {puedeEditarFuncionario && s.estado !== 'finalizada' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setProrrogaForm({ fecha: '', obs: '' }); setProrrogarSup(s); }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 font-medium"
                          >
                            <RefreshCw size={11} className="inline mr-1" />Prorrogar
                          </button>
                          <button
                            onClick={() => { setFinalizaObs(''); setFinalizarSup(s); }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-dark-200 text-dark-600 hover:bg-dark-100 font-medium"
                          >
                            Finalizar
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Info principal */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <p className="text-xs text-dark-400">Reemplaza a</p>
                        <p className="font-medium text-dark-800">{reemplazadoNombre}</p>
                        {s.rut_reemplazado && <p className="text-xs text-dark-400">{s.rut_reemplazado}</p>}
                      </div>
                      <div>
                        <p className="text-xs text-dark-400">Cargo reemplazado</p>
                        <p className="font-medium text-dark-800">{s.cargo_reemplazado}</p>
                        {s.unidad && <p className="text-xs text-dark-400">{s.unidad}</p>}
                      </div>
                      <div>
                        <p className="text-xs text-dark-400">Motivo</p>
                        <p className="font-medium text-dark-800">{MOTIVOS_SUP[s.motivo_reemplazo] || s.motivo_reemplazo}</p>
                      </div>
                    </div>

                    {/* Fechas */}
                    <div className="flex items-center gap-3 py-2 px-3 bg-dark-50 rounded-xl text-sm">
                      <Calendar size={14} className="text-dark-400 flex-shrink-0" />
                      <span className="text-dark-600">{fmtFechaSup(s.fecha_inicio)}</span>
                      <ArrowRight size={13} className="text-dark-300" />
                      <span className={`font-medium ${estaVencida ? 'text-red-600' : 'text-dark-800'}`}>
                        {fmtFechaSup(s.fecha_termino)}
                      </span>
                      <span className="ml-auto text-xs text-dark-400">{diasTotales} días</span>
                    </div>

                    {/* Badges de estado vigente: duración total + alerta días restantes */}
                    {esVigente && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
                          <CalendarRange size={12} />
                          {diasTotales} días totales de suplencia
                        </span>
                        {diasRestantes !== null && (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                            estaVencida || diasRestantes < 0
                              ? 'bg-red-100 text-red-700 border-red-200'
                              : diasRestantes === 0
                              ? 'bg-red-100 text-red-700 border-red-200'
                              : diasRestantes <= 7
                              ? 'bg-amber-100 text-amber-700 border-amber-200'
                              : diasRestantes <= 30
                              ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            <AlertTriangle size={11} />
                            {diasRestantes < 0
                              ? `Vencida hace ${Math.abs(diasRestantes)} días`
                              : diasRestantes === 0
                              ? 'Vence hoy'
                              : `${diasRestantes} días restantes`}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Prórrogas */}
                    {s.prorrogas?.length > 0 && (
                      <div className="pl-3 border-l-2 border-blue-200 space-y-1">
                        <p className="text-xs font-medium text-blue-600">Historial de prórrogas</p>
                        {s.prorrogas.map((p, i) => (
                          <p key={i} className="text-xs text-dark-500 flex items-center gap-1">
                            #{i+1}: {fmtFechaSup(p.fecha_termino_anterior)}
                            <ArrowRight size={10} className="text-dark-300" />
                            {fmtFechaSup(p.nueva_fecha_termino)}
                            {p.observaciones && <span className="text-dark-400">— {p.observaciones}</span>}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Observaciones */}
                    {s.observaciones && (
                      <p className="text-xs text-dark-500 italic">{s.observaciones}</p>
                    )}

                    {/* Footer */}
                    <p className="text-xs text-dark-400">
                      Registrada {s.creador_nombres ? `por ${s.creador_nombres} ${s.creador_apellidos}` : ''} el {fmtFechaSup(s.created_at)}
                      {s.documento_respaldo && ` · Doc: ${s.documento_respaldo}`}
                    </p>
                  </motion.div>
                );
            };

            return (
              <div className="space-y-5">
                {/* ── Suplencia vigente ── */}
                {vigentes.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                        Suplencia vigente
                      </p>
                    </div>
                    {vigentes.map(s => renderCard(s, true))}
                  </div>
                )}

                {/* ── Historial de suplencias pasadas ── */}
                {historialSup.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <History size={14} className="text-dark-400" />
                      <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide">
                        Historial ({historialSup.length})
                      </p>
                    </div>
                    {historialSup.map(s => renderCard(s, false))}
                  </div>
                )}

                {/* Si solo hay vigentes y no hay historial */}
                {vigentes.length > 0 && historialSup.length === 0 && (
                  <p className="text-xs text-dark-400 text-center py-2">Sin suplencias finalizadas anteriores</p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {showModal && (
        <SolicitudModal
          funcionario={funcionario}
          onClose={() => setShowModal(false)}
          onSuccess={() => { cargarFuncionario(); if (tab === 'historial') cargarHistorial(); }}
        />
      )}

      {showEditModal && (
        <FuncionarioModal
          funcionario={funcionario}
          onClose={() => setShowEditModal(false)}
          onSuccess={cargarFuncionario}
        />
      )}

      {/* Modal: Nueva suplencia (desde ficha del funcionario) */}
      <AnimatePresence>
        {showNuevaSup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
                <div>
                  <h2 className="text-lg font-semibold text-dark-900">Nueva Suplencia</h2>
                  <p className="text-xs text-dark-500">{funcionario.nombres} {funcionario.apellidos}</p>
                </div>
                <button onClick={() => setShowNuevaSup(false)} className="p-2 rounded-lg hover:bg-dark-100"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Buscador autocomplete funcionario reemplazado */}
                  <div className="sm:col-span-2" ref={dropdownRempRef}>
                    <label className="block text-xs font-medium text-dark-700 mb-1">
                      Buscar funcionario reemplazado por nombre o RUT
                    </label>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" />
                      <input
                        type="text"
                        value={busquedaRemp}
                        onChange={e => {
                          setBusquedaRemp(e.target.value);
                          if (reemplazadoSel) {
                            setReemplazadoSel(null);
                            setSupForm(p => ({ ...p, funcionario_reemplazado_id: '', nombre_reemplazado: '', rut_reemplazado: '', cargo_reemplazado: '' }));
                          }
                          setShowDropdownRemp(true);
                        }}
                        onFocus={() => { if (busquedaRemp.length >= 1) setShowDropdownRemp(true); }}
                        className="input-field text-sm pl-9 pr-9"
                        placeholder="Escriba apellido, nombre o RUT…"
                        autoComplete="off"
                      />
                      {reemplazadoSel && (
                        <button
                          type="button"
                          onClick={() => {
                            setReemplazadoSel(null);
                            setBusquedaRemp('');
                            setSupForm(p => ({ ...p, funcionario_reemplazado_id: '', nombre_reemplazado: '', rut_reemplazado: '', cargo_reemplazado: '' }));
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-700"
                        >
                          <X size={14} />
                        </button>
                      )}
                      {showDropdownRemp && busquedaRemp.length >= 1 && (() => {
                        const filtrados = todosFunc
                          .filter(f => f.activo !== false && f.id !== parseInt(id))
                          .filter(f => {
                            const t = `${f.apellidos} ${f.nombres} ${f.nombres} ${f.apellidos} ${f.rut || ''}`.toLowerCase();
                            return t.includes(busquedaRemp.toLowerCase());
                          }).slice(0, 8);
                        return filtrados.length > 0 ? (
                          <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-dark-200 rounded-xl shadow-lg overflow-hidden">
                            {filtrados.map(f => (
                              <li
                                key={f.id}
                                onMouseDown={() => {
                                  setReemplazadoSel(f);
                                  setBusquedaRemp(`${f.apellidos} ${f.nombres}`);
                                  setShowDropdownRemp(false);
                                  setSupForm(p => ({
                                    ...p,
                                    funcionario_reemplazado_id: f.id,
                                    nombre_reemplazado: `${f.nombres} ${f.apellidos}`,
                                    rut_reemplazado: f.rut || '',
                                    cargo_reemplazado: f.cargo || '',
                                    unidad: f.unidad || p.unidad,
                                  }));
                                }}
                                className="px-4 py-2.5 cursor-pointer hover:bg-brand-50 flex justify-between items-center gap-3 text-sm"
                              >
                                <span className="font-medium text-dark-900">{f.apellidos} {f.nombres}</span>
                                <span className="text-xs text-dark-400 shrink-0">{f.rut} · {f.cargo}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-dark-200 rounded-xl shadow-lg px-4 py-3 text-xs text-dark-400">
                            Sin coincidencias — puede completar los datos manualmente abajo.
                          </div>
                        );
                      })()}
                    </div>
                    {reemplazadoSel && (
                      <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                        <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                        Datos cargados automáticamente desde el sistema
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1">Nombre reemplazado</label>
                    <input type="text" value={supForm.nombre_reemplazado}
                      onChange={e => setSupForm(p => ({ ...p, nombre_reemplazado: e.target.value }))}
                      className="input-field text-sm" placeholder="Se completa automáticamente" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1">RUT reemplazado</label>
                    <input type="text" value={supForm.rut_reemplazado}
                      onChange={e => setSupForm(p => ({ ...p, rut_reemplazado: e.target.value }))}
                      className="input-field text-sm" placeholder="12.345.678-9" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1">
                      Cargo reemplazado <span className="text-red-500">*</span>
                    </label>
                    <input type="text" value={supForm.cargo_reemplazado}
                      onChange={e => setSupForm(p => ({ ...p, cargo_reemplazado: e.target.value }))}
                      className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1">Unidad / CESFAM</label>
                    <input type="text" value={supForm.unidad}
                      onChange={e => setSupForm(p => ({ ...p, unidad: e.target.value }))}
                      className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1">
                      Motivo <span className="text-red-500">*</span>
                    </label>
                    <select value={supForm.motivo_reemplazo}
                      onChange={e => setSupForm(p => ({ ...p, motivo_reemplazo: e.target.value }))}
                      className="input-field text-sm">
                      <option value="">— Seleccionar —</option>
                      {Object.entries(MOTIVOS_SUP).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1">
                      Fecha inicio <span className="text-red-500">*</span>
                    </label>
                    <input type="date" value={supForm.fecha_inicio}
                      onChange={e => setSupForm(p => ({ ...p, fecha_inicio: e.target.value }))}
                      className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1">
                      Fecha término <span className="text-red-500">*</span>
                    </label>
                    <input type="date" value={supForm.fecha_termino} min={supForm.fecha_inicio}
                      onChange={e => setSupForm(p => ({ ...p, fecha_termino: e.target.value }))}
                      className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1">Documento respaldo</label>
                    <input type="text" value={supForm.documento_respaldo}
                      onChange={e => setSupForm(p => ({ ...p, documento_respaldo: e.target.value }))}
                      className="input-field text-sm" placeholder="Resolución N° ..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1">Observaciones</label>
                    <input type="text" value={supForm.observaciones}
                      onChange={e => setSupForm(p => ({ ...p, observaciones: e.target.value }))}
                      className="input-field text-sm" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-dark-100">
                <button onClick={() => setShowNuevaSup(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button
                  disabled={supGuardando}
                  onClick={async () => {
                    if (!supForm.cargo_reemplazado.trim()) return toast.error('Cargo reemplazado obligatorio');
                    if (!supForm.motivo_reemplazo) return toast.error('Selecciona el motivo');
                    if (!supForm.fecha_inicio || !supForm.fecha_termino) return toast.error('Las fechas son obligatorias');
                    if (supForm.fecha_inicio > supForm.fecha_termino) return toast.error('Fecha inicio debe ser anterior al término');
                    setSupGuardando(true);
                    try {
                      await suplenciasApi.crear({ ...supForm, funcionario_suplente_id: parseInt(id) });
                      toast.success('Suplencia registrada');
                      setShowNuevaSup(false);
                      cargarSuplencias();
                    } catch (err) {
                      toast.error(err?.response?.data?.error || 'Error al registrar');
                    } finally { setSupGuardando(false); }
                  }}
                  className="btn-primary flex-1 justify-center"
                >
                  {supGuardando
                    ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    : <><Plus size={15} className="mr-1" />Registrar</>
                  }
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal: Prorrogar (desde ficha) */}
        {prorrogarSup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
                <h2 className="text-lg font-semibold text-dark-900">Prorrogar Suplencia</h2>
                <button onClick={() => setProrrogarSup(null)} className="p-2 rounded-lg hover:bg-dark-100"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-800">
                  <p className="text-xs">Término actual: <span className="font-semibold">{fmtFechaSup(prorrogarSup.fecha_termino)}</span></p>
                </div>
                {prorrogarSup.prorrogas?.length > 0 && (
                  <div className="p-3 bg-dark-50 rounded-xl text-xs text-dark-500 space-y-1">
                    {prorrogarSup.prorrogas.map((p, i) => (
                      <p key={i}>#{i+1}: {fmtFechaSup(p.fecha_termino_anterior)} → {fmtFechaSup(p.nueva_fecha_termino)}</p>
                    ))}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-dark-700 mb-1">Nueva fecha término <span className="text-red-500">*</span></label>
                  <input type="date" value={prorrogaForm.fecha}
                    min={prorrogarSup.fecha_termino?.toString().substring(0,10)}
                    onChange={e => setProrrogaForm(p => ({ ...p, fecha: e.target.value }))}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-700 mb-1">Observaciones</label>
                  <textarea value={prorrogaForm.obs}
                    onChange={e => setProrrogaForm(p => ({ ...p, obs: e.target.value }))}
                    className="input-field resize-none" rows={2} />
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-dark-100">
                <button onClick={() => setProrrogarSup(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button
                  disabled={supGuardando}
                  onClick={async () => {
                    const fechaActual = prorrogarSup.fecha_termino?.toString().substring(0,10);
                    if (!prorrogaForm.fecha) return toast.error('La nueva fecha es obligatoria');
                    if (prorrogaForm.fecha <= fechaActual) return toast.error('La nueva fecha debe ser posterior a la actual');
                    setSupGuardando(true);
                    try {
                      await suplenciasApi.prorrogar(prorrogarSup.id, { nueva_fecha_termino: prorrogaForm.fecha, observaciones: prorrogaForm.obs });
                      toast.success('Suplencia prorrogada');
                      setProrrogarSup(null);
                      cargarSuplencias();
                    } catch (err) {
                      toast.error(err?.response?.data?.error || 'Error al prorrogar');
                    } finally { setSupGuardando(false); }
                  }}
                  className="btn-primary flex-1 justify-center"
                >
                  {supGuardando
                    ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    : <><RefreshCw size={15} className="mr-1" />Prorrogar</>
                  }
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal: Finalizar (desde ficha) */}
        {finalizarSup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
                <h2 className="text-lg font-semibold text-dark-900">Finalizar Suplencia</h2>
                <button onClick={() => setFinalizarSup(null)} className="p-2 rounded-lg hover:bg-dark-100"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-sm text-amber-800">
                  Esta acción marca la suplencia como FINALIZADA y bloquea modificaciones posteriores.
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-700 mb-1">Observaciones (opcional)</label>
                  <textarea value={finalizaObs}
                    onChange={e => setFinalizaObs(e.target.value)}
                    className="input-field resize-none" rows={2} />
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-dark-100">
                <button onClick={() => setFinalizarSup(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button
                  disabled={supGuardando}
                  onClick={async () => {
                    setSupGuardando(true);
                    try {
                      await suplenciasApi.finalizar(finalizarSup.id, { observaciones: finalizaObs });
                      toast.success('Suplencia finalizada');
                      setFinalizarSup(null);
                      cargarSuplencias();
                    } catch (err) {
                      toast.error(err?.response?.data?.error || 'Error al finalizar');
                    } finally { setSupGuardando(false); }
                  }}
                  className="flex-1 justify-center inline-flex items-center gap-2 font-medium rounded-xl border px-4 py-2 text-sm bg-dark-800 text-white hover:bg-dark-900 border-dark-800 transition-all"
                >
                  {supGuardando
                    ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    : <><CheckCircle2 size={15} className="mr-1" />Finalizar</>
                  }
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
