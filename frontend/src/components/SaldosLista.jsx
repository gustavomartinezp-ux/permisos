import { motion } from 'framer-motion';
import { Palmtree, FileText, Heart, Flower2, Clock3, CalendarDays } from 'lucide-react';

const ICONOS_POR_CODIGO = {
  FERIADO: Palmtree,
  ADMIN: FileText,
  MATRIM: Heart,
  FALLEC: Flower2,
  COMPENS: Clock3,
};

function iconoTipo(codigo = '') {
  return ICONOS_POR_CODIGO[codigo] || CalendarDays;
}

function estadoSaldo(disponible, asignados) {
  if (disponible <= 0) {
    return { label: 'Agotado', className: 'bg-dark-100 text-dark-500' };
  }
  if (disponible <= 2 || (asignados > 0 && disponible / asignados <= 0.2)) {
    return { label: 'Próximo a agotarse', className: 'bg-amber-50 text-amber-700' };
  }
  return { label: 'Disponible', className: 'bg-emerald-50 text-emerald-700' };
}

function FilaSaldo({ saldo, index }) {
  const Icono = iconoTipo(saldo.codigo);
  const disponible = saldo.dias_asignados - saldo.dias_usados - (saldo.dias_pendientes || 0);
  const arrastreDisp = saldo.es_feriado_legal
    ? ((saldo.saldo_arrastre || 0) - (saldo.arrastre_usados || 0) - (saldo.arrastre_pendientes || 0))
    : 0;
  const totalDisponible = saldo.es_feriado_legal
    ? (saldo.total_disponible ?? disponible + arrastreDisp)
    : disponible;
  const asignados = saldo.dias_asignados + (saldo.es_feriado_legal ? (saldo.saldo_arrastre || 0) : 0);
  const porcentajeDisponible = asignados > 0
    ? Math.max(0, Math.min(100, Math.round((totalDisponible / asignados) * 100)))
    : 0;
  const estado = estadoSaldo(totalDisponible, asignados);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-3 px-3 rounded-lg hover:bg-dark-50/70 transition-colors"
    >
      {/* Fila 1 en móvil: icono + nombre ... métrica / Segmento en desktop: icono + nombre */}
      <div className="flex items-center justify-between gap-3 sm:contents">
        <div className="flex items-center gap-3 sm:w-52 shrink-0 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${saldo.color}14` }}
          >
            <Icono size={15} style={{ color: saldo.color }} />
          </div>
          <p className="text-sm font-semibold text-dark-800 truncate">{saldo.tipo_nombre}</p>
        </div>

        {/* Métrica: visible junto al nombre solo en móvil */}
        <div className="text-right shrink-0 sm:hidden">
          <span className="text-lg font-bold text-dark-900 tabular-nums">{totalDisponible}</span>
          <span className="text-xs text-dark-400 font-medium ml-1">disp.</span>
        </div>
      </div>

      {/* Fila 2 en móvil: badge + barra / Segmentos en desktop: badge, barra */}
      <div className="flex items-center gap-3 sm:contents">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full w-fit shrink-0 ${estado.className}`}>
          {estado.label}
        </span>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-1 flex-1 min-w-[48px] max-w-[120px] bg-dark-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${porcentajeDisponible}%` }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: index * 0.03 + 0.1 }}
              className="h-full rounded-full"
              style={{ backgroundColor: saldo.color }}
            />
          </div>
          <span className="text-xs text-dark-400 whitespace-nowrap">
            {totalDisponible} de {asignados} días
          </span>
        </div>
      </div>

      {/* Métrica principal: visible como segmento solo en desktop */}
      <div className="hidden sm:block text-right shrink-0 sm:w-24">
        <span className="text-xl font-bold text-dark-900 tabular-nums">{totalDisponible}</span>
        <span className="text-xs text-dark-400 font-medium ml-1">disp.</span>
      </div>
    </motion.div>
  );
}

export default function SaldosLista({ saldos = [] }) {
  if (!saldos.length) {
    return (
      <p className="text-dark-400 text-sm py-8 text-center">
        Sin saldos asignados para el año actual
      </p>
    );
  }

  return (
    <div className="card p-1.5 divide-y divide-dark-100/70">
      {saldos.map((s, i) => (
        <FilaSaldo key={s.id} saldo={s} index={i} />
      ))}
    </div>
  );
}
