import { useCallback, useEffect, useState } from 'react';
import { Shield, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { privacidadApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { TIPOS_DERECHO, ESTADO_DERECHO, fechaCl } from './MisDatos';

// Gestión Ley 21.719: solicitudes de derechos de los titulares (RRHH / TI
// responden; Auditoría solo ve) y registro de accesos a datos personales.
const RECURSOS = { ficha: 'Ficha', licencias: 'Licencias médicas', documento: 'Formulario PDF', login: 'Inicio de sesión' };
const hoyIso = () => new Date().toISOString().substring(0, 10);
const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function Solicitudes({ puedeResponder }) {
  const [lista, setLista] = useState([]);
  const [abierta, setAbierta] = useState(null);
  const [resp, setResp] = useState({ estado: 'respondida', respuesta: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = () => privacidadApi.derechos().then(({ data }) => setLista(data)).catch(() => toast.error('Error al cargar las solicitudes'));
  useEffect(() => { cargar(); }, []);

  const abrir = (s) => { setAbierta(s.id); setResp({ estado: s.estado === 'pendiente' ? 'respondida' : s.estado, respuesta: s.respuesta || '' }); };
  const guardar = async (id) => {
    setGuardando(true);
    try {
      await privacidadApi.responderDerecho(id, resp);
      toast.success('Solicitud actualizada');
      setAbierta(null);
      cargar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  if (lista.length === 0) return <p className="card px-5 py-8 text-sm text-dark-400 text-center">No hay solicitudes de derechos.</p>;
  return (
    <div className="card divide-y divide-dark-100">
      {lista.map((s) => {
        const [etiqueta, clase] = ESTADO_DERECHO[s.estado] || [s.estado, ''];
        const abiertaAun = ['pendiente', 'en_proceso'].includes(s.estado);
        const vencida = abiertaAun && String(s.plazo).substring(0, 10) < hoyIso();
        return (
          <div key={s.id} className="px-5 py-3.5 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-dark-800">{s.nombres} {s.apellidos}</span>
              <span className="text-xs text-dark-400">{s.rut}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-dark-100 text-dark-600">{TIPOS_DERECHO[s.tipo]}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${clase}`}>{etiqueta}</span>
              <span className={`text-xs ml-auto ${vencida ? 'text-red-600 font-semibold' : 'text-dark-400'}`}>
                {fechaCl(s.created_at)} · plazo {fechaCl(s.plazo)}{vencida ? ' (vencido)' : ''}
              </span>
            </div>
            <p className="text-sm text-dark-600 whitespace-pre-line">{s.detalle}</p>
            {s.respuesta && abierta !== s.id && (
              <p className="text-sm text-dark-700 bg-dark-50 rounded-lg px-3 py-2 whitespace-pre-line">
                <span className="font-medium">Respuesta{s.respondido_por_nombre ? ` de ${s.respondido_por_nombre}` : ''} ({fechaCl(s.respondido_en)}):</span> {s.respuesta}
              </p>
            )}
            {puedeResponder && abierta !== s.id && (
              <button onClick={() => abrir(s)} className="text-xs text-brand-600 hover:underline">
                {abiertaAun ? 'Responder' : 'Editar respuesta'}
              </button>
            )}
            {abierta === s.id && (
              <div className="space-y-2 pt-1">
                <select value={resp.estado} onChange={(e) => setResp({ ...resp, estado: e.target.value })} className="input-field">
                  {Object.entries(ESTADO_DERECHO).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <textarea
                  value={resp.respuesta}
                  onChange={(e) => setResp({ ...resp, respuesta: e.target.value })}
                  rows={3}
                  className="input-field"
                  placeholder="Respuesta al titular (qué se hizo o por qué no procede)"
                />
                <div className="flex gap-2">
                  <button onClick={() => setAbierta(null)} className="btn-secondary">Cancelar</button>
                  <button onClick={() => guardar(s.id)} disabled={guardando} className="btn-primary">Guardar</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Accesos() {
  const [filtros, setFiltros] = useState({ buscar: '', recurso: '', desde: '', hasta: '' });
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
    privacidadApi.accesos({ ...params, limit: 500 })
      .then(({ data }) => setLista(data))
      .catch(() => toast.error('Error al cargar el registro de accesos'))
      .finally(() => setCargando(false));
  }, [filtros]);
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); cargar(); }} className="card p-4 grid gap-3 sm:grid-cols-5 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-dark-700 mb-1">Persona (quien consultó o consultada)</label>
          <input value={filtros.buscar} onChange={(e) => set('buscar', e.target.value)} className="input-field" placeholder="Nombre o correo" />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1">Tipo</label>
          <select value={filtros.recurso} onChange={(e) => set('recurso', e.target.value)} className="input-field">
            <option value="">Todos</option>
            {Object.entries(RECURSOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1">Desde</label>
          <input type="date" value={filtros.desde} onChange={(e) => set('desde', e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-700 mb-1">Hasta</label>
          <input type="date" value={filtros.hasta} onChange={(e) => set('hasta', e.target.value)} className="input-field" />
        </div>
        <button type="submit" className="btn-primary sm:col-span-5 sm:w-fit">
          <Search size={15} /> Buscar
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-dark-50 text-xs text-dark-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Fecha</th>
              <th className="text-left px-4 py-2 font-medium">Quién</th>
              <th className="text-left px-4 py-2 font-medium">Qué</th>
              <th className="text-left px-4 py-2 font-medium">De quién</th>
              <th className="text-left px-4 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-100">
            {lista.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2 whitespace-nowrap text-dark-500">{fechaHora(a.created_at)}</td>
                <td className="px-4 py-2">{a.usuario || '—'}</td>
                <td className="px-4 py-2 whitespace-nowrap">{RECURSOS[a.recurso] || a.recurso}</td>
                <td className="px-4 py-2">{a.recurso === 'login' ? '—' : (a.funcionario || '—')}</td>
                <td className="px-4 py-2 text-dark-500">{a.detalle || ''}{a.ip ? ` · IP ${a.ip}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && lista.length === 0 && <p className="px-5 py-6 text-sm text-dark-400 text-center">Sin registros.</p>}
        {lista.length === 500 && <p className="px-5 py-2 text-xs text-dark-400">Se muestran los 500 más recientes; acote la búsqueda.</p>}
      </div>
    </div>
  );
}

export default function DatosPersonales() {
  const { tienePermiso } = useAuth();
  const [tab, setTab] = useState('solicitudes');
  const puedeResponder = tienePermiso('datos_personales.gestionar');
  const puedeAuditar = tienePermiso('datos_personales.auditar');

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-dark-900 flex items-center gap-2">
          <Shield size={22} className="text-brand-500" /> Datos personales
        </h1>
        <p className="text-dark-500 text-sm mt-0.5">
          Solicitudes de derechos de los funcionarios y registro de accesos (Ley 21.719)
        </p>
      </div>
      <div className="flex gap-1 bg-dark-100 p-1 rounded-xl w-fit">
        {[['solicitudes', 'Solicitudes de derechos'], ...(puedeAuditar ? [['accesos', 'Registro de accesos']] : [])].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === id ? 'bg-white text-dark-900 shadow-sm' : 'text-dark-500 hover:text-dark-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'solicitudes' ? <Solicitudes puedeResponder={puedeResponder} /> : <Accesos />}
    </div>
  );
}
