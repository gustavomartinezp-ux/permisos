import { useState, useEffect } from 'react';
import { CalendarDays, AlertCircle } from 'lucide-react';
import { solicitudesApi } from '../api/client';
import { toISO, formatoFecha } from '../utils/diasHabiles';

const fechaPlazo = (iso) => `${formatoFecha(iso)} ${iso.substring(0, 4)}`;

// Estamento del funcionario, plazo vigente del Permiso de Estamento
// (celebración + 15 días corridos) o el motivo por el que no le corresponde.
export default function PlazoEstamento({ funcionarioId }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    solicitudesApi.estamento(funcionarioId, new Date().getFullYear())
      .then((r) => setInfo(r.data))
      .catch(() => setInfo(null));
  }, [funcionarioId]);

  if (!info) return null;

  const hoy = toISO(new Date());
  const enCurso = info.plazo && hoy >= info.plazo.desde && hoy <= info.plazo.hasta;
  // Plazo vigente: el de este año si aún no termina; si no, el del próximo
  const plazo = info.plazo && hoy > info.plazo.hasta ? info.plazo_siguiente : info.plazo;

  return (
    <div className={`mt-4 rounded-xl border p-3 text-sm ${info.error ? 'border-red-200 bg-red-50' : 'border-sky-200 bg-sky-50'}`}>
      <p className={`font-semibold flex items-center gap-1.5 ${info.error ? 'text-red-800' : 'text-sky-800'}`}>
        <CalendarDays size={14} />
        Permiso de Estamento{info.nombre ? ` — ${info.nombre}` : ''}
        {enCurso && !info.error && (
          <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">En plazo</span>
        )}
      </p>
      {info.error ? (
        <p className="text-red-700 text-xs mt-1 flex items-start gap-1.5">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <span>{info.error}.</span>
        </p>
      ) : plazo ? (
        <p className="text-sky-700 text-xs mt-1">
          Plazo {enCurso ? 'en curso' : 'próximo'}: desde el <strong>{fechaPlazo(plazo.desde)}</strong> (día de la celebración)
          {' '}hasta el <strong>{fechaPlazo(plazo.hasta)}</strong> — {info.dias_plazo} días corridos.
        </p>
      ) : (
        <p className="text-sky-700 text-xs mt-1">Este estamento no tiene fecha de celebración registrada.</p>
      )}
    </div>
  );
}
