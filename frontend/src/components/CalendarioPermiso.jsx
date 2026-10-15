import { FERIADOS, MESES, toISO } from '../utils/diasHabiles';

// Calendario de los meses que abarca el permiso: marca los días que se
// descuentan y muestra en gris los fines de semana/feriados que se saltan.
export default function CalendarioPermiso({ dias }) {
  if (!dias?.length) return null;
  const marcados = new Set(dias);
  const ini = new Date(dias[0] + 'T12:00:00');
  const fin = new Date(dias[dias.length - 1] + 'T12:00:00');
  const meses = [];
  const m = new Date(ini.getFullYear(), ini.getMonth(), 1, 12);
  while (m <= fin) { meses.push(new Date(m)); m.setMonth(m.getMonth() + 1); }

  return (
    <div className={`grid gap-3 ${meses.length > 1 ? 'sm:grid-cols-2' : ''}`}>
      {meses.map((mes) => {
        const primero = (mes.getDay() + 6) % 7; // lunes = 0
        const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
        const celdas = [...Array(primero).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
        return (
          <div key={mes.toISOString()}>
            <p className="text-xs font-semibold text-dark-700 capitalize mb-1">{MESES[mes.getMonth()]} {mes.getFullYear()}</p>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
              {['L','M','M','J','V','S','D'].map((d, i) => <span key={i} className="text-dark-400 font-medium">{d}</span>)}
              {celdas.map((dia, i) => {
                if (!dia) return <span key={i} />;
                const iso = toISO(new Date(mes.getFullYear(), mes.getMonth(), dia, 12));
                const marcado = marcados.has(iso);
                const dentro = iso > dias[0] && iso < dias[dias.length - 1];
                const feriado = FERIADOS.has(iso);
                return (
                  <span
                    key={i}
                    title={marcado ? 'Día del permiso' : feriado ? 'Feriado' : dentro ? 'No hábil (no se descuenta)' : ''}
                    className={`rounded py-0.5 ${
                      marcado ? 'bg-brand-600 text-white font-semibold'
                        : dentro ? 'bg-dark-100 text-dark-400 line-through'
                        : feriado ? 'text-red-500'
                        : 'text-dark-600'
                    }`}
                  >
                    {dia}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

