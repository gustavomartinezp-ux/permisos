import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Download, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { privacidadApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Derechos del titular (Ley 21.719): descarga de sus datos y solicitudes de
// acceso, rectificación, supresión, oposición, portabilidad y bloqueo.
export const TIPOS_DERECHO = {
  acceso: 'Acceso',
  rectificacion: 'Rectificación',
  supresion: 'Supresión',
  oposicion: 'Oposición',
  portabilidad: 'Portabilidad',
  bloqueo: 'Bloqueo',
};
const AYUDA = {
  acceso: 'Saber qué datos suyos se tratan, para qué y quién los ha consultado.',
  rectificacion: 'Corregir un dato inexacto o desactualizado. Indique cuál y el valor correcto.',
  supresion: 'Eliminar datos que ya no sean necesarios. Indique cuáles.',
  oposicion: 'Oponerse a un uso determinado de sus datos. Indique cuál y por qué.',
  portabilidad: 'Recibir sus datos en formato estructurado (también puede descargarlos arriba).',
  bloqueo: 'Suspender temporalmente el uso de un dato mientras se revisa su solicitud.',
};
export const ESTADO_DERECHO = {
  pendiente: ['Pendiente', 'bg-amber-100 text-amber-700'],
  en_proceso: ['En proceso', 'bg-blue-100 text-blue-700'],
  respondida: ['Respondida', 'bg-emerald-100 text-emerald-700'],
  rechazada: ['Rechazada', 'bg-red-100 text-red-700'],
};
export const fechaCl = (v) => (v ? new Date(String(v).length <= 10 ? `${v}T12:00:00` : v).toLocaleDateString('es-CL') : '—');

export default function MisDatos() {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [form, setForm] = useState({ tipo: 'rectificacion', detalle: '' });
  const [enviando, setEnviando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const vinculado = !!usuario?.funcionario_id;

  const cargar = () => {
    if (!vinculado) return;
    privacidadApi.misDerechos().then(({ data }) => setSolicitudes(data)).catch(() => {});
  };
  useEffect(cargar, [vinculado]);

  const descargar = async () => {
    setDescargando(true);
    try {
      const { data } = await privacidadApi.misDatos();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mis_datos_${new Date().toISOString().substring(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'No se pudieron descargar sus datos');
    } finally {
      setDescargando(false);
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await privacidadApi.solicitarDerecho(form);
      toast.success('Solicitud enviada. RRHH le responderá dentro de 30 días corridos.');
      setForm({ tipo: form.tipo, detalle: '' });
      cargar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al enviar la solicitud');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-dark-900 flex items-center gap-2">
          <Shield size={22} className="text-brand-500" /> Mis datos personales
        </h1>
        <p className="text-dark-500 text-sm mt-0.5">
          Sus derechos según la Ley de Protección de Datos Personales.{' '}
          <Link to="/privacidad" className="text-brand-600 hover:underline">Ver la política de privacidad</Link>
        </p>
      </div>

      {!vinculado ? (
        <div className="card p-5 text-sm text-dark-500">Su cuenta no está vinculada a un funcionario.</div>
      ) : (
        <>
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-dark-800">Descargar mis datos</h2>
            <p className="text-sm text-dark-500">
              Un archivo con todos sus datos en el sistema: ficha, saldos, solicitudes, licencias, firmas y quién
              ha consultado su información (derechos de acceso y portabilidad).
            </p>
            <button onClick={descargar} disabled={descargando} className="btn-primary">
              {descargando
                ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                : <><Download size={15} /> Descargar (JSON)</>}
            </button>
          </div>

          <form onSubmit={enviar} className="card p-5 space-y-3">
            <h2 className="font-semibold text-dark-800">Hacer una solicitud</h2>
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Derecho</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="input-field">
                {Object.entries(TIPOS_DERECHO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <p className="text-xs text-dark-400 mt-1">{AYUDA[form.tipo]}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-700 mb-1.5">Detalle</label>
              <textarea
                value={form.detalle}
                onChange={(e) => setForm({ ...form, detalle: e.target.value })}
                rows={4}
                maxLength={4000}
                className="input-field"
                placeholder="Describa su solicitud"
                required
              />
            </div>
            <button type="submit" disabled={enviando || form.detalle.trim().length < 5} className="btn-primary">
              <Send size={15} /> Enviar solicitud
            </button>
          </form>

          <div className="card">
            <div className="px-5 py-3 border-b border-dark-100">
              <h2 className="font-semibold text-dark-800">Mis solicitudes</h2>
            </div>
            {solicitudes.length === 0 ? (
              <p className="px-5 py-6 text-sm text-dark-400 text-center">No ha hecho solicitudes.</p>
            ) : (
              <div className="divide-y divide-dark-100">
                {solicitudes.map((s) => {
                  const [etiqueta, clase] = ESTADO_DERECHO[s.estado] || [s.estado, ''];
                  return (
                    <div key={s.id} className="px-5 py-3.5 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-dark-800">{TIPOS_DERECHO[s.tipo]}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${clase}`}>{etiqueta}</span>
                        <span className="text-xs text-dark-400 ml-auto">
                          {fechaCl(s.created_at)} · plazo {fechaCl(s.plazo)}
                        </span>
                      </div>
                      <p className="text-sm text-dark-600 whitespace-pre-line">{s.detalle}</p>
                      {s.respuesta && (
                        <p className="text-sm text-dark-700 bg-dark-50 rounded-lg px-3 py-2 whitespace-pre-line">
                          <span className="font-medium">Respuesta ({fechaCl(s.respondido_en)}):</span> {s.respuesta}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
