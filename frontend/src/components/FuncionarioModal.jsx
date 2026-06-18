import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Mail, Calendar, Briefcase, AlertCircle, Info, Clock, Building2, MapPin, Shield, Phone, Hash, AlertTriangle, Award } from 'lucide-react';
import { funcionariosApi, tiposPermisosApi, serviciosApi, dispositivosApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const TIPOS_CONTRATO = ['Indefinido', 'Plazo Fijo', 'Honorarios', 'Suplencia'];
const HORAS_OPCIONES = [44, 33, 28, 22, 11];
const SECTORES = ['Verde', 'Azul', 'Amarillo', 'Rojo', 'Lila', 'SAR'];
const SECTOR_COLORS = {
  'Verde':    'bg-green-100 text-green-700',
  'Azul':     'bg-blue-100 text-blue-700',
  'Amarillo': 'bg-yellow-100 text-yellow-700',
  'Rojo':     'bg-red-100 text-red-700',
  'Lila':     'bg-purple-100 text-purple-700',
  'SAR':      'bg-cyan-100 text-cyan-700',
};
const AREAS_FUNCIONALES = ['Técnica', 'Administrativa', 'Salud Familiar', 'SOME', 'Estadística', 'Servicios Generales'];
const PROGRAMAS = [
  'Programa Infantil', 'Programa Adolescente', 'Programa Salud Reproductiva',
  'Programa del Adulto', 'Programa Adulto Mayor', 'Programa Salud Dental',
  'Programa de Salud Mental', 'Programa Comunitario', 'Referente OIRS', 'Médico Gestor',
];
const ESCALAFONES = [
  'ADMINISTRATIVO',
  'ASISTENTE SOCIAL',
  'AUXILIAR',
  'CHOFER',
  'ENFERMERA',
  'ENFERMERO',
  'GUARDIA',
  'INGENIERO EN ADMINISTRACIÓN',
  'INGENIERO EN INFORMÁTICA BIOMÉDICA',
  'INGENIERO INFORMÁTICO',
  'KINESIÓLOGO',
  'MATRÓN',
  'MATRONA',
  'MÉDICO',
  'NUTRICIONISTA',
  'ODONTÓLOGO',
  'PROFESOR DE EDUCACIÓN FÍSICA',
  'PSICÓLOGO',
  'QUÍMICO FARMACÉUTICO',
  'TÉCNICO PARAMÉDICO',
  'TECNÓLOGO EN INFORMÁTICA BIOMÉDICA',
  'TECNÓLOGO MÉDICO',
  'TENS',
  'TENS DENTAL',
  'TENS PODOLOGÍA',
  'TERAPEUTA OCUPACIONAL',
];

const TIPOS_CONTRATO_POR_GRUPO = {
  contrata:   ['Indefinido', 'Plazo Fijo'],
  honorarios: ['Honorarios'],
  suplentes:  ['Suplencia'],
};

const formatRut = (value) => {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv   = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${dv}`;
};

const calcularAntiguedad = (fechaIngreso) => {
  if (!fechaIngreso) return null;
  const desde = new Date(fechaIngreso + 'T00:00:00');
  const hoy = new Date();
  const totalMeses = (hoy.getFullYear() - desde.getFullYear()) * 12 + (hoy.getMonth() - desde.getMonth());
  if (totalMeses < 0) return null;
  const anos = Math.floor(totalMeses / 12);
  const meses = totalMeses % 12;
  const partes = [];
  if (anos > 0) partes.push(`${anos} año${anos !== 1 ? 's' : ''}`);
  if (meses > 0) partes.push(`${meses} mes${meses !== 1 ? 'es' : ''}`);
  return partes.length > 0 ? partes.join(', ') : 'Menos de 1 mes';
};

export default function FuncionarioModal({ funcionario: funcEdit, onClose, onSuccess, grupoInicial }) {
  const esEdicion = !!funcEdit;
  const { esAdmin } = useAuth();
  const [tipos, setTipos] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [dispositivos, setDispositivos] = useState([]);
  const [todosFunc, setTodosFunc] = useState([]);
  const normFecha = (f) => (f ? String(f).split('T')[0] : '');

  // Si se abre desde un grupo específico, pre-seleccionamos el tipo de contrato
  const tipoContratoInicial = grupoInicial && !funcEdit
    ? TIPOS_CONTRATO_POR_GRUPO[grupoInicial]?.[0] || ''
    : funcEdit?.tipo_contrato || '';

  const [form, setForm] = useState({
    rut: '', nombres: '', apellidos: '', cargo: '',
    servicio_id: '', email: '',
    telefono: '', direccion_particular: '', numero_reloj: '',
    tipo_contrato: tipoContratoInicial,
    horas_contrato: '', dispositivo_id: '', reemplaza_a: '',
    sector: '', area: '', activo: true,
    convenio_honorarios: '', prestacion: '',
    escalafon: '', categoria: '', nivel: '',
    ...(funcEdit || {}),
    fecha_ingreso: normFecha(funcEdit?.fecha_ingreso),
    fecha_nacimiento: normFecha(funcEdit?.fecha_nacimiento),
    fecha_termino_contrato: normFecha(funcEdit?.fecha_termino_contrato),
    rol_sistema: funcEdit?.usuario_rol || 'funcionario',
    tipo_supervisor: funcEdit?.supervisor_sector
      ? 'sector'
      : PROGRAMAS.includes(funcEdit?.supervisor_area)
      ? 'programa'
      : funcEdit?.supervisor_area
      ? 'area'
      : 'sector',
    sector_supervisa: funcEdit?.supervisor_sector || '',
    area_supervisa: funcEdit?.supervisor_area || '',
  });
  const [saldos, setSaldos] = useState({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      tiposPermisosApi.listar(),
      serviciosApi.listar(),
      dispositivosApi.listar(),
      funcionariosApi.listar(),
    ]).then(([tp, sv, dv, fn]) => {
      const tiposActivos = tp.data.filter(t => t.activo);
      setTipos(tiposActivos);
      setServicios(sv.data);
      setDispositivos(dv.data);
      setTodosFunc(fn.data.filter(f => !funcEdit || f.id !== funcEdit?.id));
      if (!esEdicion) {
        const inicial = {};
        tiposActivos.forEach(t => { inicial[t.id] = t.dias_anuales_max; });
        setSaldos(inicial);
      }
    }).catch(() => toast.error('Error cargando datos del formulario'));
  }, []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const esPlantaContrata = form.tipo_contrato === 'Planta' || form.tipo_contrato === 'Contrata';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.rut || !form.nombres || !form.apellidos || !form.cargo) {
      return setError('RUT, nombres, apellidos y cargo son obligatorios');
    }
    setCargando(true);
    try {
      const { tipo_supervisor, ...payload } = form;
      if (payload.rol_sistema !== 'supervisor') {
        payload.sector_supervisa = null;
        payload.area_supervisa = null;
      } else if (tipo_supervisor === 'sector') {
        payload.area_supervisa = null;
      } else {
        payload.sector_supervisa = null;
      }
      if (esEdicion) {
        await funcionariosApi.actualizar(funcEdit.id, payload);
        toast.success('Funcionario actualizado');
      } else {
        await funcionariosApi.crear({ ...payload, saldos_custom: saldos });
        toast.success(`${form.nombres} ${form.apellidos} creado`);
        if (form.email) toast.success('Acceso creado — contraseña: cesfam2026', { duration: 5000 });
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-4"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
            <h2 className="font-semibold text-dark-900 flex items-center gap-2">
              <User size={18} className="text-brand-500" />
              {esEdicion ? `Editar — ${funcEdit.nombres} ${funcEdit.apellidos}` : 'Nuevo Funcionario'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">

              {/* Datos personales */}
              <section>
                <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-3">Datos personales</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">RUT <span className="text-red-500">*</span></label>
                    <input value={form.rut} onChange={e => set('rut', formatRut(e.target.value))} className="input-field" placeholder="12.345.678-9" required disabled={esEdicion} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">Nombres <span className="text-red-500">*</span></label>
                    <input value={form.nombres} onChange={e => set('nombres', e.target.value)} className="input-field" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">Apellidos <span className="text-red-500">*</span></label>
                    <input value={form.apellidos} onChange={e => set('apellidos', e.target.value)} className="input-field" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <Calendar size={12} className="inline mr-1" />Fecha de nacimiento
                    </label>
                    <input type="date" value={form.fecha_nacimiento || ''} onChange={e => set('fecha_nacimiento', e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <Phone size={12} className="inline mr-1" />Teléfono
                    </label>
                    <input type="tel" value={form.telefono || ''} onChange={e => set('telefono', e.target.value)} className="input-field" placeholder="+56 9 1234 5678" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">Cargo <span className="text-red-500">*</span></label>
                    <input value={form.cargo} onChange={e => set('cargo', e.target.value)} className="input-field" placeholder="Médico General" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <Hash size={12} className="inline mr-1" />N° Reloj de asistencia
                    </label>
                    <input type="number" min="1" value={form.numero_reloj || ''} onChange={e => set('numero_reloj', e.target.value)} className="input-field" placeholder="Ej: 1042" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <MapPin size={12} className="inline mr-1" />Dirección particular
                    </label>
                    <input type="text" value={form.direccion_particular || ''} onChange={e => set('direccion_particular', e.target.value)} className="input-field" placeholder="Calle, número, comuna" />
                  </div>
                </div>
              </section>

              {/* Contrato y jornada */}
              <section>
                <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-3">Contrato y jornada</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">Tipo de contrato</label>
                    <select value={form.tipo_contrato || ''} onChange={e => set('tipo_contrato', e.target.value)} className="input-field">
                      <option value="">Sin especificar</option>
                      {TIPOS_CONTRATO.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <Clock size={12} className="inline mr-1" />Horas semanales
                    </label>
                    <select value={form.horas_contrato || ''} onChange={e => set('horas_contrato', e.target.value)} className="input-field">
                      <option value="">Sin especificar</option>
                      {HORAS_OPCIONES.map(h => <option key={h} value={h}>{h} horas</option>)}
                      <option value="otro">Otra cantidad</option>
                    </select>
                  </div>

                  {form.horas_contrato === 'otro' && (
                    <div>
                      <label className="block text-xs font-medium text-dark-700 mb-1.5">Horas (manual)</label>
                      <input type="number" min="1" max="44" onChange={e => set('horas_contrato', e.target.value)} className="input-field" placeholder="Ej: 28" />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <Calendar size={12} className="inline mr-1" />Fecha de ingreso
                    </label>
                    <input type="date" value={form.fecha_ingreso || ''} onChange={e => set('fecha_ingreso', e.target.value)} className="input-field" />
                  </div>

                  {/* Fecha término — Honorarios, Suplencia y Plazo Fijo */}
                  {(form.tipo_contrato === 'Honorarios' || form.tipo_contrato === 'Suplencia' || form.tipo_contrato === 'Plazo Fijo') && (
                    <div>
                      <label className="block text-xs font-medium text-dark-700 mb-1.5">
                        <Calendar size={12} className="inline mr-1" />Fecha término contrato
                      </label>
                      <input
                        type="date"
                        value={form.fecha_termino_contrato || ''}
                        onChange={e => set('fecha_termino_contrato', e.target.value)}
                        className="input-field"
                      />
                    </div>
                  )}

                  {/* Reemplaza a — solo Suplencia */}
                  {form.tipo_contrato === 'Suplencia' && (
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-dark-700 mb-1.5">Reemplaza a</label>
                      <select value={form.reemplaza_a || ''} onChange={e => set('reemplaza_a', e.target.value)} className="input-field">
                        <option value="">Seleccionar funcionario...</option>
                        {todosFunc.map(f => (
                          <option key={f.id} value={f.id}>{f.nombres} {f.apellidos} — {f.cargo}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </section>

              {/* Datos de escalafón */}
              <section>
                <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Award size={12} />Datos de escalafón
                </p>
                <div className="p-4 bg-brand-50 rounded-xl border border-brand-100 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-dark-700 mb-1.5">Escalafón</label>
                      <select
                        value={form.escalafon || ''}
                        onChange={e => set('escalafon', e.target.value)}
                        className="input-field"
                      >
                        <option value="">Sin especificar</option>
                        {ESCALAFONES.map(esc => <option key={esc} value={esc}>{esc}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark-700 mb-1.5">Categoría</label>
                      <input
                        type="text"
                        value={form.categoria || ''}
                        onChange={e => set('categoria', e.target.value)}
                        className="input-field"
                        placeholder="Ej: A, B, C..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark-700 mb-1.5">Nivel / Grado</label>
                      <input
                        type="text"
                        value={form.nivel || ''}
                        onChange={e => set('nivel', e.target.value)}
                        className="input-field"
                        placeholder="Ej: Grado 13"
                      />
                    </div>
                    {form.fecha_ingreso && (
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-dark-700 mb-1.5">
                          <Clock size={12} className="inline mr-1" />Antigüedad
                        </label>
                        <div className="flex items-center gap-3 px-3 py-2.5 bg-white border border-brand-200 rounded-lg">
                          <span className="text-sm font-semibold text-dark-800">
                            {calcularAntiguedad(form.fecha_ingreso)}
                          </span>
                          <span className="text-xs text-dark-400">calculada desde la fecha de ingreso</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Datos específicos Honorarios */}
              {form.tipo_contrato === 'Honorarios' && (
                <section>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Briefcase size={12} />Datos de honorarios
                  </p>
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-dark-700 mb-1.5">Convenio / Programa</label>
                      <select
                        value={form.convenio_honorarios || ''}
                        onChange={e => set('convenio_honorarios', e.target.value)}
                        className="input-field text-sm"
                      >
                        <option value="">— Sin convenio —</option>
                        {PROGRAMAS.map(p => <option key={p} value={p}>{p}</option>)}
                        <option value="Convenio Salud Pública">Convenio Salud Pública</option>
                        <option value="Convenio JUNAEB">Convenio JUNAEB</option>
                        <option value="Convenio FONASA">Convenio FONASA</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark-700 mb-1.5">Tipo de prestación</label>
                      <input
                        type="text"
                        value={form.prestacion || ''}
                        onChange={e => set('prestacion', e.target.value)}
                        className="input-field text-sm"
                        placeholder="Ej: Atención médica, Kinesioterapia, Nutrición..."
                      />
                    </div>
                    <div className="p-2.5 bg-amber-100/60 rounded-lg text-xs text-amber-700">
                      Los funcionarios a honorarios no tienen derecho a feriado legal institucional ni saldo de vacaciones.
                    </div>
                  </div>
                </section>
              )}

              {/* Lugar y servicio */}
              <section>
                <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-3">Lugar de trabajo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <Building2 size={12} className="inline mr-1" />Dispositivo
                    </label>
                    <select value={form.dispositivo_id || ''} onChange={e => set('dispositivo_id', e.target.value)} className="input-field">
                      <option value="">Sin asignar</option>
                      {dispositivos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <MapPin size={12} className="inline mr-1" />Sector
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => set('sector', '')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          !form.sector ? 'bg-dark-800 text-white border-dark-800' : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                        }`}
                      >
                        Sin sector
                      </button>
                      {SECTORES.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set('sector', s)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            form.sector === s
                              ? `${SECTOR_COLORS[s]} border-transparent`
                              : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <MapPin size={12} className="inline mr-1" />Área funcional
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" onClick={() => set('area', '')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          !form.area ? 'bg-dark-800 text-white border-dark-800' : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                        }`}>
                        Sin área
                      </button>
                      {AREAS_FUNCIONALES.map(a => (
                        <button key={a} type="button" onClick={() => set('area', a)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            form.area === a
                              ? 'bg-indigo-100 text-indigo-700 border-transparent'
                              : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                          }`}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Estado activo/pasivo — solo admin en edición */}
              {esEdicion && esAdmin && (
                <section>
                  <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-3">Estado del funcionario</p>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-dark-50 border border-dark-100">
                    <div>
                      <p className="text-sm font-medium text-dark-800">
                        {form.activo !== false ? 'Activo' : 'Pasivo'}
                      </p>
                      <p className="text-xs text-dark-400 mt-0.5">
                        {form.activo !== false
                          ? 'Puede iniciar sesión y solicitar permisos'
                          : 'No puede iniciar sesión ni solicitar permisos'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => set('activo', form.activo === false ? true : false)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        form.activo !== false ? 'bg-emerald-500' : 'bg-dark-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        form.activo !== false ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </section>
              )}

              {/* Rol en el sistema — solo admin */}
              {esAdmin && (
                <section>
                  <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Shield size={12} />Rol en el sistema
                  </p>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {[
                        { val: 'funcionario', label: 'Funcionario' },
                        { val: 'supervisor', label: 'Supervisor' },
                        { val: 'administrador', label: 'Administrador' },
                      ].map(({ val, label }) => (
                        <button key={val} type="button" onClick={() => set('rol_sistema', val)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                            form.rol_sistema === val
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white text-dark-600 border-dark-200 hover:border-dark-400'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {form.rol_sistema === 'supervisor' && (
                      <div className="p-3 bg-dark-50 rounded-xl space-y-3">
                        <div>
                          <p className="text-xs font-medium text-dark-600 mb-2">Tipo de supervisión</p>
                          <div className="flex gap-2 flex-wrap">
                            {[
                              { val: 'sector',   label: 'Jefe de Sector' },
                              { val: 'area',     label: 'Jefe de Área' },
                              { val: 'programa', label: 'Jefe de Programa' },
                            ].map(({ val, label }) => (
                              <button key={val} type="button" onClick={() => set('tipo_supervisor', val)}
                                className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                                  form.tipo_supervisor === val
                                    ? 'bg-brand-600 text-white border-brand-600'
                                    : 'bg-white text-dark-600 border-dark-200 hover:border-dark-400'
                                }`}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <p className="text-xs text-dark-400 mt-1.5">
                            Jefes de Sector/Programa/Coordinador SAR solicitan permisos directo al administrador.
                          </p>
                        </div>

                        {form.tipo_supervisor === 'sector' && (
                          <div>
                            <p className="text-xs font-medium text-dark-600 mb-2">Sector que supervisa</p>
                            <div className="flex gap-2 flex-wrap">
                              <button type="button" onClick={() => set('sector_supervisa', '')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  !form.sector_supervisa ? 'bg-dark-800 text-white border-dark-800' : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                                }`}>
                                Sin asignar
                              </button>
                              {SECTORES.map(s => (
                                <button key={s} type="button" onClick={() => set('sector_supervisa', s)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                    form.sector_supervisa === s
                                      ? `${SECTOR_COLORS[s]} border-transparent`
                                      : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                                  }`}>
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {form.tipo_supervisor === 'area' && (
                          <div>
                            <p className="text-xs font-medium text-dark-600 mb-2">Área que supervisa</p>
                            <div className="flex gap-2 flex-wrap">
                              <button type="button" onClick={() => set('area_supervisa', '')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  !form.area_supervisa ? 'bg-dark-800 text-white border-dark-800' : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                                }`}>
                                Sin asignar
                              </button>
                              {AREAS_FUNCIONALES.map(a => (
                                <button key={a} type="button" onClick={() => set('area_supervisa', a)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                    form.area_supervisa === a
                                      ? 'bg-indigo-100 text-indigo-700 border-transparent'
                                      : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                                  }`}>
                                  {a}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {form.tipo_supervisor === 'programa' && (
                          <div>
                            <p className="text-xs font-medium text-dark-600 mb-2">Programa que dirige</p>
                            <div className="flex gap-2 flex-wrap">
                              <button type="button" onClick={() => set('area_supervisa', '')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  !form.area_supervisa ? 'bg-dark-800 text-white border-dark-800' : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                                }`}>
                                Sin asignar
                              </button>
                              {PROGRAMAS.map(p => (
                                <button key={p} type="button" onClick={() => set('area_supervisa', p)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                    form.area_supervisa === p
                                      ? 'bg-teal-100 text-teal-700 border-transparent'
                                      : 'bg-white text-dark-500 border-dark-200 hover:border-dark-400'
                                  }`}>
                                  {p}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {esEdicion && funcEdit?.usuario_email && (
                      <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700">
                        <Info size={13} className="flex-shrink-0 mt-0.5" />
                        Cuenta vinculada: <strong className="ml-1">{funcEdit.usuario_email}</strong>. Los cambios de rol aplican al guardar.
                      </div>
                    )}
                    {esEdicion && !funcEdit?.usuario_email && form.rol_sistema !== 'funcionario' && (
                      <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg text-xs text-amber-700">
                        <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                        Este funcionario no tiene cuenta. El rol se guarda pero no podrá iniciar sesión hasta que se cree su cuenta desde Configuración.
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Acceso — solo al crear */}
              {!esEdicion && (
                <section>
                  <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-3">Acceso al sistema (opcional)</p>
                  <div>
                    <label className="block text-xs font-medium text-dark-700 mb-1.5">
                      <Mail size={12} className="inline mr-1" />Correo electrónico
                    </label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="input-field" placeholder="funcionario@cesfam.cl" />
                  </div>
                  {form.email && (
                    <div className="flex items-start gap-2 mt-2 p-2.5 bg-brand-50 rounded-lg text-xs text-brand-700">
                      <Info size={13} className="flex-shrink-0 mt-0.5" />
                      Se creará cuenta con contraseña inicial: <strong className="ml-1">cesfam2026</strong>
                    </div>
                  )}
                </section>
              )}

              {/* Saldos iniciales — solo al crear */}
              {!esEdicion && tipos.length > 0 && (
                <section>
                  <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide mb-3">
                    Saldos iniciales {new Date().getFullYear()}
                  </p>
                  <div className="space-y-2">
                    {tipos.map(t => (
                      <div key={t.id} className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="text-sm text-dark-700 flex-1 truncate">{t.nombre}</span>
                        <input
                          type="number" min="0" max="365"
                          value={saldos[t.id] ?? t.dias_anuales_max}
                          onChange={e => setSaldos(s => ({ ...s, [t.id]: e.target.value }))}
                          className="input-field w-20 text-center text-sm py-1.5"
                        />
                        <span className="text-xs text-dark-400 w-8">días</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle size={15} />{error}
                </div>
              )}
            </div>

            <div className="px-6 pb-5 flex gap-3 border-t border-dark-100 pt-4">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" disabled={cargando} className="btn-primary flex-1 justify-center">
                {cargando
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : esEdicion ? 'Guardar cambios' : 'Crear funcionario'
                }
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
