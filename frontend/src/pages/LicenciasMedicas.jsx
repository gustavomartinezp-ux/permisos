import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Search, X, FileText, Calendar, Trash2, Edit2 } from 'lucide-react';
import { licenciasMedicasApi, funcionariosApi } from '../api/client';
import toast from 'react-hot-toast';

const fmtFecha = (d) => d ? format(parseISO(d.toString().substring(0, 10)), 'd MMM yyyy', { locale: es }) : '—';

// ─── Modal: Nueva / Editar Licencia Médica ────────────────────────────────────
function LicenciaModal({ funcionarios, licencia, onClose, onSuccess }) {
  const esEdicion = !!licencia;
  const [form, setForm] = useState({
    funcionario_id: licencia?.funcionario_id || '',
    fecha_inicio: licencia?.fecha_inicio?.toString().substring(0, 10) || '',
    fecha_fin: licencia?.fecha_fin?.toString().substring(0, 10) || '',
    folio: licencia?.folio || '',
    entidad_emisora: licencia?.entidad_emisora || '',
    observaciones: licencia?.observaciones || '',
  });
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState(licencia ? `${licencia.nombres} ${licencia.apellidos}` : '');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const sugerencias = !esEdicion && busqueda.length >= 1
    ? funcionarios.filter((f) => `${f.nombres} ${f.apellidos} ${f.rut || ''}`.toLowerCase().includes(busqueda.toLowerCase())).slice(0, 8)
    : [];

  const diasPrevia = form.fecha_inicio && form.fecha_fin && form.fecha_fin >= form.fecha_inicio
    ? differenceInDays(new Date(`${form.fecha_fin}T12:00:00`), new Date(`${form.fecha_inicio}T12:00:00`)) + 1
    : null;

  useEffect(() => {
    const clickFuera = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', clickFuera);
    return () => document.removeEventListener('mousedown', clickFuera);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.funcionario_id) return toast.error('Selecciona un funcionario');
    if (!form.fecha_inicio || !form.fecha_fin) return toast.error('Ingresa las fechas de la licencia');
    if (form.fecha_fin < form.fecha_inicio) return toast.error('La fecha de fin no puede ser anterior a la de inicio');

    setGuardando(true);
    try {
      if (esEdicion) {
        await licenciasMedicasApi.actualizar(licencia.id, form);
        toast.success('Licencia médica actualizada');
      } else {
        await licenciasMedicasApi.crear(form);
        toast.success('Licencia médica registrada');
      }
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al guardar la licencia médica');
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
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-dark-900">{esEdicion ? 'Editar licencia médica' : 'Nueva licencia médica'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!esEdicion && (
            <div ref={dropdownRef} className="relative">
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Funcionario</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setShowDropdown(true); set('funcionario_id', ''); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar por nombre o RUT..."
                  className="input-field pl-9"
                />
              </div>
              {showDropdown && sugerencias.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-dark-200 shadow-lg max-h-48 overflow-y-auto">
                  {sugerencias.map((f) => (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() => { set('funcionario_id', f.id); setBusqueda(`${f.nombres} ${f.apellidos}`); setShowDropdown(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-dark-50 flex flex-col"
                    >
                      <span className="font-medium text-dark-800">{f.nombres} {f.apellidos}</span>
                      <span className="text-xs text-dark-400">{f.rut} · {f.cargo}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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

          {diasPrevia !== null && (
            <p className="text-xs text-dark-500 flex items-center gap-1.5">
              <Calendar size={12} />
              {diasPrevia} día{diasPrevia !== 1 ? 's' : ''} corrido{diasPrevia !== 1 ? 's' : ''}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Folio (opcional)</label>
              <input type="text" value={form.folio} onChange={(e) => set('folio', e.target.value)} className="input-field" placeholder="N° de licencia" />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Entidad emisora (opcional)</label>
              <input type="text" value={form.entidad_emisora} onChange={(e) => set('entidad_emisora', e.target.value)} className="input-field" placeholder="Fonasa, Isapre, Mutual..." />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-700 mb-1.5">Observaciones (opcional)</label>
            <textarea value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} className="input-field" rows={2} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary flex-1 justify-center">
              {guardando ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : 'Guardar'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function LicenciasMedicas() {
  const [licencias, setLicencias] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmEliminar, setConfirmEliminar] = useState(null);

  const cargar = useCallback(() => {
    setCargando(true);
    Promise.all([licenciasMedicasApi.listar(), funcionariosApi.listar()])
      .then(([lic, func]) => { setLicencias(lic.data); setFuncionarios(func.data); })
      .catch(() => toast.error('Error al cargar licencias médicas'))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = licencias.filter((l) => {
    if (!busqueda) return true;
    const texto = `${l.nombres} ${l.apellidos} ${l.rut || ''}`.toLowerCase();
    return texto.includes(busqueda.toLowerCase());
  });

  const handleEliminar = async () => {
    try {
      await licenciasMedicasApi.eliminar(confirmEliminar.id);
      toast.success('Licencia médica eliminada');
      setConfirmEliminar(null);
      cargar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al eliminar');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Licencias Médicas</h1>
          <p className="text-dark-500 text-sm mt-0.5">Registro y gestión de licencias médicas del personal</p>
        </div>
        <button onClick={() => { setEditando(null); setShowModal(true); }} className="btn-primary">
          <Plus size={16} />
          <span className="hidden sm:inline">Nueva licencia</span>
        </button>
      </div>

      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o RUT..."
          className="input-field pl-10 bg-white"
        />
      </div>

      {cargando ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card h-16 animate-pulse bg-dark-100" />)}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 text-dark-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin licencias médicas registradas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((l) => (
            <motion.div key={l.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-dark-800">{l.nombres} {l.apellidos}</p>
                <p className="text-xs text-dark-500">{l.rut} · {l.cargo}</p>
                <p className="text-xs text-dark-600 mt-1">
                  {fmtFecha(l.fecha_inicio)} — {fmtFecha(l.fecha_fin)} ({l.dias} día{l.dias !== 1 ? 's' : ''})
                  {l.folio && <span className="text-dark-400"> · Folio {l.folio}</span>}
                  {l.entidad_emisora && <span className="text-dark-400"> · {l.entidad_emisora}</span>}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => { setEditando(l); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400 hover:text-dark-600">
                  <Edit2 size={15} />
                </button>
                <button onClick={() => setConfirmEliminar(l)} className="p-1.5 rounded-lg hover:bg-red-50 text-dark-400 hover:text-red-600">
                  <Trash2 size={15} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <LicenciaModal
            funcionarios={funcionarios}
            licencia={editando}
            onClose={() => setShowModal(false)}
            onSuccess={() => { setShowModal(false); cargar(); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmEliminar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmEliminar(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
              <p className="text-sm font-medium text-dark-800 mb-1">¿Eliminar esta licencia médica?</p>
              <p className="text-xs text-dark-500 mb-4">
                {confirmEliminar.nombres} {confirmEliminar.apellidos} · {fmtFecha(confirmEliminar.fecha_inicio)} — {fmtFecha(confirmEliminar.fecha_fin)}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmEliminar(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button onClick={handleEliminar} className="flex-1 justify-center inline-flex items-center gap-2 font-medium rounded-xl border bg-red-600 text-white border-red-600 hover:bg-red-700 py-2">Eliminar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
