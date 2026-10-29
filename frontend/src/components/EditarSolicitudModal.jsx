import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, Scale, AlertCircle, Pencil, UserCheck, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { solicitudesApi, saldosApi } from '../api/client';
import {
  esDiaHabil, DISPOSITIVO_EXCEPCION_DIA_HABIL, tipoRequiereDiaHabil, construirRango, formatoFecha,
} from '../utils/diasHabiles';
import CalendarioPermiso from './CalendarioPermiso';

// Corrige una solicitud con saldo (pendiente, pre-aprobada o aprobada): tipo,
// número de días, fecha de inicio, jornada, motivo y reemplazante. El backend
// devuelve los días al tipo original y los descuenta del nuevo en una sola
// transacción, manteniendo el estado de la solicitud.
export default function EditarSolicitudModal({ solicitud, onClose, onSuccess }) {
  const original = {
    tipoId: String(solicitud.tipo_permiso_id),
    dias: Number(solicitud.dias_solicitados),
    inicio: String(solicitud.fecha_inicio).substring(0, 10),
    anio: parseInt(String(solicitud.fecha_inicio).substring(0, 4), 10),
  };

  const [saldos, setSaldos] = useState([]);
  const [tipoId, setTipoId] = useState(original.tipoId);
  const [medioDia, setMedioDia] = useState(original.dias === 0.5);
  const [jornada, setJornada] = useState(solicitud.jornada_medio_dia || 'AM');
  const [medioDiaInicio, setMedioDiaInicio] = useState(!!solicitud.medio_dia_inicio);
  const [numDias, setNumDias] = useState(original.dias === 0.5 ? '' : String(original.dias));
  const [fechaInicio, setFechaInicio] = useState(original.inicio);
  const [motivo, setMotivo] = useState(solicitud.motivo || '');
  const [reemplazante, setReemplazante] = useState(solicitud.reemplazante || '');
  const [motivoCambio, setMotivoCambio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    saldosApi.porFuncionario(solicitud.funcionario_id, original.anio)
      .then(({ data }) => setSaldos(data))
      .catch(() => toast.error('No se pudieron cargar los saldos del funcionario'));
  }, [solicitud.funcionario_id, original.anio]);

  const saldoSel = saldos.find((s) => String(s.tipo_permiso_id) === tipoId);
  const jornadaForzada = saldoSel?.jornada_forzada || null;
  const permiteMedioDia = saldoSel?.permite_medio_dia === true;
  const esMedioDia = !!jornadaForzada || (permiteMedioDia && medioDia);

  useEffect(() => {
    if (jornadaForzada) setJornada(jornadaForzada);
  }, [jornadaForzada]);

  const esSar = DISPOSITIVO_EXCEPCION_DIA_HABIL.test(solicitud.dispositivo || '');
  const cuentaCorridos = esSar && tipoRequiereDiaHabil(saldoSel);
  // N,5 días: N+1 días hábiles con el primero o el último en media jornada
  const numDiasValor = parseFloat(numDias) || 0;
  const conMedioDia = permiteMedioDia && !esMedioDia && numDiasValor % 1 === 0.5;
  const rango = !esMedioDia ? construirRango(fechaInicio, Math.ceil(numDiasValor), cuentaCorridos) : null;
  const inicioSol = esMedioDia ? fechaInicio : (rango?.inicio || '');
  const finSol = esMedioDia ? fechaInicio : (rango?.fin || '');
  const dias = esMedioDia ? 0.5 : (rango ? rango.dias.length - (conMedioDia ? 0.5 : 0) : 0);

  // Lo que hoy ocupa esta solicitud vuelve al saldo si se mantiene el mismo tipo
  const disponible = saldoSel
    ? Number(saldoSel.total_disponible ?? saldoSel.dias_disponibles ?? 0) + (tipoId === original.tipoId ? original.dias : 0)
    : 0;
  const medioDiaNoHabil = esMedioDia && fechaInicio && tipoRequiereDiaHabil(saldoSel) && !esSar
    && !esDiaHabil(new Date(`${fechaInicio}T12:00:00`));
  const excede = saldoSel && dias > disponible;

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!saldoSel) return setError('Selecciona el tipo de permiso');
    if (!(dias > 0)) return setError('Ingresa el número de días y la fecha de inicio');
    if (medioDiaNoHabil) return setError('La fecha de medio día debe ser un día hábil');
    if (excede) return setError(`Saldo insuficiente: disponibles ${disponible}`);
    if (!motivoCambio.trim()) return setError('Indica el motivo de la corrección');
    setGuardando(true);
    try {
      await solicitudesApi.editar(solicitud.id, {
        tipo_permiso_id: parseInt(tipoId, 10),
        fecha_inicio: inicioSol,
        fecha_fin: finSol,
        dias_solicitados: dias,
        jornada_medio_dia: esMedioDia || conMedioDia ? jornada : null,
        medio_dia_inicio: conMedioDia && medioDiaInicio,
        motivo,
        reemplazante,
        motivo_cambio: motivoCambio.trim(),
      });
      toast.success('Solicitud corregida y saldos actualizados');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo corregir la solicitud');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-100">
          <div>
            <h2 className="font-semibold text-dark-900 flex items-center gap-2">
              <Pencil size={16} className="text-brand-600" />
              Corregir solicitud N° {solicitud.id}
            </h2>
            <p className="text-xs text-dark-500 mt-0.5">
              {solicitud.nombres} {solicitud.apellidos} · actualmente {solicitud.tipo_nombre}, {original.dias} día(s) desde {formatoFecha(original.inicio)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-500"><X size={18} /></button>
        </div>

        <form onSubmit={guardar} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-1.5">Tipo de permiso</label>
            <select value={tipoId} onChange={(e) => { setTipoId(e.target.value); setMedioDia(false); }} className="input-field">
              {saldos.map((s) => {
                const disp = Number(s.total_disponible ?? s.dias_disponibles ?? 0)
                  + (String(s.tipo_permiso_id) === original.tipoId ? original.dias : 0);
                return (
                  <option key={s.tipo_permiso_id} value={s.tipo_permiso_id}>
                    {s.tipo_nombre} — {disp} día(s) disponibles
                  </option>
                );
              })}
            </select>
          </div>

          {jornadaForzada ? (
            <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
              Este permiso es siempre media jornada {jornadaForzada}.
            </p>
          ) : permiteMedioDia && (
            <div className="flex gap-2">
              {[false, true].map((v) => (
                <button key={String(v)} type="button" onClick={() => setMedioDia(v)}
                  className={`flex-1 py-2 text-sm rounded-xl border font-medium ${medioDia === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-dark-600 border-dark-200'}`}>
                  {v ? 'Medio día' : 'Día completo'}
                </button>
              ))}
            </div>
          )}
          {(esMedioDia || conMedioDia) && !jornadaForzada && (
            <div className="flex gap-2">
              {['AM', 'PM'].map((j) => (
                <button key={j} type="button" onClick={() => setJornada(j)}
                  className={`flex-1 py-2 text-sm rounded-xl border font-medium ${jornada === j ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-dark-600 border-dark-200'}`}>
                  Jornada {j}
                </button>
              ))}
            </div>
          )}

          <div className={esMedioDia ? '' : 'grid grid-cols-2 gap-3'}>
            {!esMedioDia && (
              <div>
                <label className="block text-sm font-medium text-dark-700 mb-1.5"><Scale size={14} className="inline mr-1" />Número de días</label>
                <input type="text" inputMode={permiteMedioDia ? 'decimal' : 'numeric'} value={numDias}
                  onChange={(e) => {
                    // Solo enteros, o N,5 en tipos que admiten medio día
                    const v = e.target.value.replace(',', '.');
                    if (permiteMedioDia ? /^\d{0,3}(\.5?)?$/.test(v) : /^\d{0,3}$/.test(v)) setNumDias(v);
                  }}
                  className="input-field" placeholder={permiteMedioDia ? 'ej. 3,5' : ''} required />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-1.5"><Calendar size={14} className="inline mr-1" />{esMedioDia ? 'Fecha' : 'Fecha de inicio'}</label>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="input-field" required />
            </div>
          </div>

          {rango && (
            <div className="rounded-xl border border-dark-200 p-3 space-y-2">
              <p className="text-xs text-dark-600">
                Del <strong>{formatoFecha(rango.inicio)}</strong> al <strong>{formatoFecha(rango.fin)}</strong>
                {' · '}{cuentaCorridos ? 'días corridos (SAR)' : 'se omiten fines de semana y feriados'}
              </p>
              {rango.inicio !== fechaInicio && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                  La fecha elegida no es día hábil: el permiso comienza el {formatoFecha(rango.inicio)}.
                </p>
              )}
              <CalendarioPermiso dias={rango.dias} />
              {conMedioDia && (
                <div className="pt-2 border-t border-dark-100 space-y-1.5">
                  <p className="text-xs text-dark-600">¿Qué día es medio día? (jornada {jornada})</p>
                  <div className="flex gap-2">
                    {[[true, 'Primer día', rango.inicio], [false, 'Último día', rango.fin]].map(([v, label, f]) => (
                      <button key={label} type="button"
                        onClick={() => { setMedioDiaInicio(v); setJornada(v ? 'PM' : 'AM'); }}
                        className={`flex-1 py-2 text-xs rounded-xl border font-medium transition-all ${
                          medioDiaInicio === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-dark-600 border-dark-200 hover:border-brand-300'
                        }`}>
                        {label} · {formatoFecha(f)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {saldoSel && dias > 0 && (
            <div className={`rounded-lg p-3 text-sm ${excede ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-brand-50 border border-brand-200 text-brand-700'}`}>
              {dias} día(s) de {disponible} disponibles · quedan <strong>{Math.max(disponible - dias, 0)}</strong>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-dark-700 mb-1.5"><FileText size={14} className="inline mr-1" />Motivo / actividad</label>
            <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-1.5"><UserCheck size={14} className="inline mr-1" />En mi ausencia realizará mis funciones</label>
            <input type="text" maxLength={150} value={reemplazante} onChange={(e) => setReemplazante(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 mb-1.5">Motivo de la corrección <span className="text-red-500">*</span></label>
            <input type="text" value={motivoCambio} onChange={(e) => setMotivoCambio(e.target.value)}
              className="input-field" placeholder="Ej: se ingresó como Feriado Legal y era Permiso Administrativo" required />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle size={16} />{error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={guardando || !saldoSel || !(dias > 0) || excede || medioDiaNoHabil}
              className="btn-primary flex-1 justify-center">
              {guardando ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : 'Guardar corrección'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
