import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft, User, Calendar, Briefcase, Plus, Clock, BarChart3,
  Edit2, Save, X, Building2, ArrowLeftRight, FileDown, Printer, Camera, Trash2,
  KeyRound, Mail, ShieldAlert,
} from 'lucide-react';
import { funcionariosApi, historialApi, solicitudesApi, usuariosApi } from '../api/client';
import { generarReporteFuncionario, imprimirReporteFuncionario } from '../utils/reportePDF';
import { useAuth } from '../context/AuthContext';
import SaldoCard from '../components/SaldoCard';
import TimelineMovimientos from '../components/TimelineMovimientos';
import EstadoBadge from '../components/EstadoBadge';
import SolicitudModal from '../components/SolicitudModal';
import FuncionarioModal from '../components/FuncionarioModal';
import toast from 'react-hot-toast';

const TABS = [
  { id: 'saldos',      label: 'Saldos',      icon: BarChart3 },
  { id: 'historial',   label: 'Historial',   icon: Clock },
  { id: 'solicitudes', label: 'Solicitudes', icon: Calendar },
];

const CONTRATO_COLORS = {
  'Indefinido': 'bg-green-100 text-green-700',
  'Plazo Fijo': 'bg-blue-100 text-blue-700',
  'Honorarios': 'bg-yellow-100 text-yellow-700',
  'Suplencia':  'bg-purple-100 text-purple-700',
};

export default function FuncionarioDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { esAdmin, esSupervisor, esFuncionario, usuario } = useAuth();
  const esPropioFuncionario = esFuncionario && String(usuario?.funcionario_id) === String(id);
  const [funcionario, setFuncionario] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [tab, setTab] = useState('saldos');
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

  // Admin: gestión de cuenta
  const [accionCuenta, setAccionCuenta] = useState(null); // 'password' | 'email' | 'eliminar'
  const [cuentaForm, setCuentaForm] = useState({ password_admin: '', password_nueva: '', email: '' });
  const [procesandoCuenta, setProcesandoCuenta] = useState(false);

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

  useEffect(() => { cargarFuncionario(); }, [id]);

  useEffect(() => {
    if (tab === 'historial') cargarHistorial();
  }, [tab, id]);

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
    setCuentaForm({ password_admin: '', password_nueva: '', email: '' });
    setAccionCuenta(accion);
  };

  const ejecutarAccionCuenta = async () => {
    if (!cuentaForm.password_admin) return toast.error('Ingresa tu contraseña de administrador');
    setProcesandoCuenta(true);
    try {
      if (accionCuenta === 'password') {
        if (cuentaForm.password_nueva.length < 6) { setProcesandoCuenta(false); return toast.error('Mínimo 6 caracteres'); }
        await usuariosApi.cambiarPassword(funcionario.usuario_id, cuentaForm.password_nueva, cuentaForm.password_admin);
        toast.success('Contraseña actualizada');
      } else if (accionCuenta === 'email') {
        if (!cuentaForm.email.includes('@')) { setProcesandoCuenta(false); return toast.error('Email inválido'); }
        await usuariosApi.cambiarEmail(funcionario.usuario_id, cuentaForm.email, cuentaForm.password_admin);
        toast.success('Email actualizado');
        cargarFuncionario();
      } else if (accionCuenta === 'eliminar') {
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
            {esAdmin && (
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
            {funcionario.foto_url && esAdmin && (
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
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            {(esAdmin || esPropioFuncionario) && (
              <button onClick={() => setShowModal(true)} className="btn-primary">
                <Plus size={16} />
                <span className="hidden sm:inline">Nueva solicitud</span>
              </button>
            )}
            {esAdmin && (
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

      {/* Admin: Gestión de cuenta */}
      {esAdmin && (funcionario.usuario_id || funcionario.activo === false) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5 space-y-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={16} className="text-dark-500" />
            <h3 className="text-sm font-semibold text-dark-700">Gestión de cuenta</h3>
          </div>

          {funcionario.usuario_id && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-dark-600 flex-1 min-w-0">
                <Mail size={14} className="text-dark-400 flex-shrink-0" />
                <span className="truncate">{funcionario.usuario_email || '—'}</span>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => abrirAccion('email')} className="btn-secondary text-xs py-1.5 px-3">
                  <Mail size={13} />
                  Cambiar email
                </button>
                <button onClick={() => abrirAccion('password')} className="btn-secondary text-xs py-1.5 px-3">
                  <KeyRound size={13} />
                  Cambiar contraseña
                </button>
              </div>
            </div>
          )}

          {funcionario.activo === false && (
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
                {accionCuenta === 'password' && 'Nueva contraseña para el funcionario'}
                {accionCuenta === 'email' && 'Nuevo email para el funcionario'}
                {accionCuenta === 'eliminar' && '¿Eliminar este funcionario permanentemente?'}
              </p>

              {accionCuenta === 'password' && (
                <input
                  type="password"
                  placeholder="Nueva contraseña (mín. 6 caracteres)"
                  value={cuentaForm.password_nueva}
                  onChange={e => setCuentaForm(p => ({ ...p, password_nueva: e.target.value }))}
                  className="input-field"
                />
              )}
              {accionCuenta === 'email' && (
                <input
                  type="email"
                  placeholder="Nuevo email"
                  value={cuentaForm.email}
                  onChange={e => setCuentaForm(p => ({ ...p, email: e.target.value }))}
                  className="input-field"
                />
              )}
              {accionCuenta === 'eliminar' && (
                <p className="text-xs text-red-600">
                  Se eliminarán todos los datos: historial, saldos y solicitudes del funcionario. Esta acción no se puede deshacer.
                </p>
              )}

              <input
                type="password"
                placeholder="Tu contraseña de administrador"
                value={cuentaForm.password_admin}
                onChange={e => setCuentaForm(p => ({ ...p, password_admin: e.target.value }))}
                className="input-field"
              />

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

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-100 p-1 rounded-xl w-fit">
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            onClick={() => setTab(tid)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              tab === tid
                ? 'bg-white text-dark-900 shadow-sm'
                : 'text-dark-500 hover:text-dark-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Saldos */}
      {tab === 'saldos' && (
        <div className="space-y-4">
          {esAdmin && !editandoSaldos && funcionario.saldos?.length > 0 && (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {funcionario.saldos?.map((s, i) => (
                <SaldoCard key={s.id} saldo={s} index={i} />
              ))}
              {!funcionario.saldos?.length && (
                <p className="text-dark-400 text-sm col-span-full py-8 text-center">
                  Sin saldos asignados para el año actual
                </p>
              )}
            </div>
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
    </div>
  );
}
