import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, X, Tag, AlertCircle, ToggleLeft, ToggleRight, ShieldAlert } from 'lucide-react';
import { tiposPermisosApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const COLORES_PRESET = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#EF4444', '#06B6D4', '#6B7280',
  '#F97316', '#84CC16',
];

const TIPOS_ESPECIALES_OPCIONES = [
  { tipo_especial: 'ESP_FALLECIMIENTO_HIJO',  nombre: 'Fallecimiento de Hijo',                     dias_fijos: 10, tipo_dias: 'corridos',          normativa: 'Art. 108 bis Ley 18.883',        requiere_certificado: true,  color: '#7C3AED' },
  { tipo_especial: 'ESP_HIJO_GESTACION',      nombre: 'Fallecimiento Hijo en Gestación',           dias_fijos: 7,  tipo_dias: 'habiles',            normativa: 'Art. 108 bis Ley 18.883',        requiere_certificado: true,  color: '#9333EA' },
  { tipo_especial: 'ESP_CONYUGE',             nombre: 'Fallecimiento Cónyuge o Conviviente Civil', dias_fijos: 7,  tipo_dias: 'corridos',          normativa: 'Art. 108 bis Ley 18.883',        requiere_certificado: true,  color: '#DC2626' },
  { tipo_especial: 'ESP_FAMILIAR_DIRECTO',    nombre: 'Fallecimiento Padre, Madre o Hermano',     dias_fijos: 4,  tipo_dias: 'habiles',            normativa: 'Art. 108 Ley 18.883',           requiere_certificado: true,  color: '#EA580C' },
  { tipo_especial: 'ESP_NACIMIENTO',          nombre: 'Nacimiento o Adopción de Hijo',             dias_fijos: 5,  tipo_dias: 'habiles',            normativa: 'Art. 195 Código del Trabajo',   requiere_certificado: false, color: '#0891B2' },
  { tipo_especial: 'ESP_MATRIMONIO',          nombre: 'Casamiento o Unión Civil',                  dias_fijos: 5,  tipo_dias: 'habiles_continuos', normativa: 'Art. 207 bis Código del Trabajo', requiere_certificado: false, color: '#059669' },
];

const LABEL_TIPO_DIAS = {
  corridos:          'días corridos',
  habiles:           'días hábiles',
  habiles_continuos: 'días hábiles continuos',
};

const FORM_VACIO = {
  codigo: '', nombre: '', descripcion: '',
  dias_anuales_max: '', color: '#3B82F6',
  requiere_aprobacion: true, activo: true,
  es_especial: false, tipo_especial: '',
  dias_fijos: '', tipo_dias: '', normativa: '', requiere_certificado: false,
};

function TipoModal({ tipo, onClose, onSuccess }) {
  const [form, setForm] = useState(tipo || FORM_VACIO);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const esEdicion = !!tipo;

  const aplicarPreset = (preset) => {
    setForm(prev => ({
      ...prev,
      codigo:               preset.tipo_especial,
      nombre:               preset.nombre,
      tipo_especial:        preset.tipo_especial,
      dias_fijos:           preset.dias_fijos,
      tipo_dias:            preset.tipo_dias,
      normativa:            preset.normativa,
      requiere_certificado: preset.requiere_certificado,
      color:                preset.color,
      dias_anuales_max:     preset.dias_fijos,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.codigo || !form.nombre) return setError('Código y nombre son obligatorios');
    if (!form.es_especial && form.dias_anuales_max === '') return setError('Los días máx/año son obligatorios');
    if (form.es_especial && (!form.tipo_especial || !form.dias_fijos || !form.tipo_dias)) {
      return setError('Completa todos los campos del tipo especial');
    }
    setCargando(true);
    try {
      if (esEdicion) {
        await tiposPermisosApi.actualizar(tipo.id, form);
        toast.success('Tipo de permiso actualizado');
      } else {
        await tiposPermisosApi.crear(form);
        toast.success('Tipo de permiso creado');
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setCargando(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-dark-900">
            {esEdicion ? 'Editar tipo de permiso' : 'Nuevo tipo de permiso'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Toggle Permiso Especial */}
          {!esEdicion && (
            <div className="flex items-center justify-between py-2 px-3 bg-dark-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-dark-700">Permiso Especial (días fijos por ley)</p>
                <p className="text-xs text-dark-400">Sin descuento de saldo, calculado automáticamente</p>
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...FORM_VACIO, es_especial: !form.es_especial })}
                className={`transition-colors ${form.es_especial ? 'text-purple-600' : 'text-dark-300'}`}
              >
                {form.es_especial ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
          )}

          {/* Selector de preset para tipos especiales */}
          {form.es_especial && !esEdicion && (
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">
                Tipo especial predefinido
              </label>
              <select
                value={form.tipo_especial}
                onChange={(e) => {
                  const preset = TIPOS_ESPECIALES_OPCIONES.find(o => o.tipo_especial === e.target.value);
                  if (preset) aplicarPreset(preset);
                  else setForm(prev => ({ ...prev, tipo_especial: e.target.value }));
                }}
                className="input-field"
                required={form.es_especial}
              >
                <option value="">Seleccionar tipo especial...</option>
                {TIPOS_ESPECIALES_OPCIONES.map(o => (
                  <option key={o.tipo_especial} value={o.tipo_especial}>
                    {o.nombre} — {o.dias_fijos} {LABEL_TIPO_DIAS[o.tipo_dias]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Campos comunes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">
                Código <span className="text-red-500">*</span>
              </label>
              <input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                className="input-field uppercase"
                placeholder="Ej: LICENCIA"
                maxLength={60}
                disabled={esEdicion || form.es_especial}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">
                {form.es_especial ? 'Días fijos' : 'Días máx/año'} <span className="text-red-500">*</span>
              </label>
              <input
                type="number" min="0" max="365"
                value={form.es_especial ? (form.dias_fijos || '') : form.dias_anuales_max}
                onChange={(e) => setForm({ ...form, dias_anuales_max: e.target.value })}
                className="input-field"
                disabled={form.es_especial}
                required={!form.es_especial}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="input-field"
              placeholder="Ej: Licencia Médica"
              disabled={form.es_especial && !esEdicion}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">Descripción</label>
            <textarea
              value={form.descripcion || ''}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="input-field resize-none h-16 text-sm"
              placeholder="Descripción breve (opcional)"
            />
          </div>

          {/* Info normativa para tipos especiales */}
          {form.es_especial && form.normativa && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 space-y-1">
              <p className="text-xs font-semibold text-purple-800 flex items-center gap-1.5">
                <ShieldAlert size={12} />
                Normativa legal
              </p>
              <p className="text-xs text-purple-700">{form.normativa}</p>
              <p className="text-xs text-purple-700">
                {form.dias_fijos} {LABEL_TIPO_DIAS[form.tipo_dias] || 'días'}
                {form.requiere_certificado && ' · Requiere certificado'}
              </p>
            </div>
          )}

          {/* Color */}
          {!form.es_especial && (
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-2">Color identificador</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLORES_PRESET.map((c) => (
                  <button
                    key={c} type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-dark-400 scale-110' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color" value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-7 h-7 rounded-full cursor-pointer border-0 p-0"
                  title="Color personalizado"
                />
              </div>
            </div>
          )}

          {/* Requiere aprobación — solo para tipos normales */}
          {!form.es_especial && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-dark-700">Requiere aprobación</span>
              <button
                type="button"
                onClick={() => setForm({ ...form, requiere_aprobacion: !form.requiere_aprobacion })}
                className={`transition-colors ${form.requiere_aprobacion ? 'text-brand-600' : 'text-dark-300'}`}
              >
                {form.requiere_aprobacion ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={cargando} className="btn-primary flex-1 justify-center">
              {cargando
                ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                : esEdicion ? 'Guardar cambios' : 'Crear tipo'
              }
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function TiposPermisos() {
  const { esAdmin } = useAuth();
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalData, setModalData] = useState(null);
  const [filtro, setFiltro] = useState('todos'); // 'todos' | 'normales' | 'especiales'

  const cargar = () => {
    setCargando(true);
    tiposPermisosApi.listar()
      .then(({ data }) => setTipos(data))
      .catch(() => toast.error('Error al cargar tipos de permisos'))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  const toggleActivo = async (tipo) => {
    try {
      await tiposPermisosApi.actualizar(tipo.id, { ...tipo, activo: !tipo.activo });
      toast.success(tipo.activo ? 'Tipo desactivado' : 'Tipo activado');
      cargar();
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  const tiposFiltrados = tipos.filter(t =>
    filtro === 'normales'   ? !t.es_especial :
    filtro === 'especiales' ?  t.es_especial :
    true
  );

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Tipos de Permisos</h1>
          <p className="text-dark-500 text-sm mt-0.5">{tipos.length} tipo(s) configurados</p>
        </div>
        {esAdmin && (
          <button onClick={() => setModalData({})} className="btn-primary">
            <Plus size={16} />
            Nuevo tipo
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {[
          { key: 'todos',      label: 'Todos' },
          { key: 'normales',   label: 'Con saldo' },
          { key: 'especiales', label: 'Especiales' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFiltro(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtro === key
                ? 'bg-brand-600 text-white'
                : 'bg-dark-100 text-dark-600 hover:bg-dark-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="card h-32 animate-pulse bg-dark-100" />)}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {tiposFiltrados.map((tipo, i) => (
            <motion.div
              key={tipo.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`card p-4 ${!tipo.activo ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${tipo.color}20` }}
                  >
                    {tipo.es_especial
                      ? <ShieldAlert size={18} style={{ color: tipo.color }} />
                      : <Tag size={18} style={{ color: tipo.color }} />
                    }
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-dark-800">{tipo.nombre}</p>
                      {tipo.es_especial && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">ESP</span>
                      )}
                    </div>
                    <p className="text-xs text-dark-400 font-mono">{tipo.codigo}</p>
                  </div>
                </div>
                {esAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setModalData(tipo)}
                      className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400 hover:text-dark-600"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => toggleActivo(tipo)}
                      className={`p-1.5 rounded-lg transition-colors ${tipo.activo ? 'hover:bg-red-50 text-dark-400 hover:text-red-600' : 'hover:bg-emerald-50 text-dark-300 hover:text-emerald-600'}`}
                      title={tipo.activo ? 'Desactivar' : 'Activar'}
                    >
                      {tipo.activo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold" style={{ color: tipo.color }}>
                    {tipo.es_especial ? tipo.dias_fijos : tipo.dias_anuales_max}
                  </p>
                  <p className="text-xs text-dark-400">
                    {tipo.es_especial
                      ? (LABEL_TIPO_DIAS[tipo.tipo_dias] || 'días')
                      : 'días máx. por año'
                    }
                  </p>
                </div>
                <div className="text-right space-y-1">
                  {tipo.es_especial ? (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full block">Sin descuento saldo</span>
                  ) : tipo.requiere_aprobacion ? (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full block">Requiere aprobación</span>
                  ) : (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full block">Automático</span>
                  )}
                  {tipo.es_especial && tipo.requiere_certificado && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full block">Requiere cert.</span>
                  )}
                  {!tipo.activo && (
                    <p className="text-xs text-red-500">Inactivo</p>
                  )}
                </div>
              </div>

              {tipo.es_especial && tipo.normativa && (
                <p className="text-xs text-purple-600 mt-2 border-t border-dark-100 pt-2">
                  {tipo.normativa}
                </p>
              )}

              {!tipo.es_especial && tipo.descripcion && (
                <p className="text-xs text-dark-400 mt-2 border-t border-dark-100 pt-2">
                  {tipo.descripcion}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {modalData !== null && (
          <TipoModal
            tipo={modalData.id ? modalData : null}
            onClose={() => setModalData(null)}
            onSuccess={cargar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
