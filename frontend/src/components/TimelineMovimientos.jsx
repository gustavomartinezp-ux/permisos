import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { TrendingDown, TrendingUp, RefreshCw, Plus, Clock } from 'lucide-react';

const movimientoConfig = {
  descuento:  { icon: TrendingDown, color: 'text-red-600',     bg: 'bg-red-100',     label: 'Descuento' },
  reintegro:  { icon: TrendingUp,   color: 'text-emerald-600', bg: 'bg-emerald-100', label: 'Reintegro' },
  ajuste:     { icon: RefreshCw,    color: 'text-blue-600',    bg: 'bg-blue-100',    label: 'Ajuste' },
  asignacion: { icon: Plus,         color: 'text-purple-600',  bg: 'bg-purple-100',  label: 'Asignación' },
  reserva:    { icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-100',   label: 'En trámite' },
};

function TimelineItem({ mov, index, isLast }) {
  const cfg = movimientoConfig[mov.tipo_movimiento] || movimientoConfig.ajuste;
  const Icon = cfg.icon;

  const fecha = parseISO(mov.created_at);
  const signoDias = mov.tipo_movimiento === 'reintegro' || mov.tipo_movimiento === 'asignacion'
    ? '+' : '-';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className="relative flex gap-4"
    >
      {/* Línea vertical */}
      {!isLast && (
        <div className="absolute left-4 top-10 w-px h-full bg-dark-200" />
      )}

      {/* Ícono */}
      <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center`}>
        <Icon size={15} className={cfg.color} />
      </div>

      {/* Contenido */}
      <div className="flex-1 pb-6 min-w-0">
        <div className="card p-3.5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${mov.color}20`,
                    color: mov.color,
                  }}
                >
                  {mov.tipo_permiso_nombre}
                </span>
                <span className={`text-xs font-semibold ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm text-dark-700 leading-snug">{mov.descripcion}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-base font-bold ${mov.tipo_movimiento === 'reintegro' || mov.tipo_movimiento === 'asignacion' ? 'text-emerald-600' : 'text-red-600'}`}>
                {signoDias}{Math.abs(mov.dias_movimiento)} días
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-dark-100">
            <div className="flex items-center gap-3 text-xs text-dark-400">
              <span>
                Saldo: {' '}
                <span className="line-through text-dark-400">{mov.saldo_anterior}</span>
                {' → '}
                <span className="font-semibold text-dark-700">{mov.saldo_nuevo}</span>
                {' días'}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-dark-500">
                {format(fecha, "d MMM yyyy 'a las' HH:mm", { locale: es })}
              </p>
              {mov.responsable_nombres && (
                <p className="text-xs text-dark-400">
                  por {mov.responsable_nombres} {mov.responsable_apellidos}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function TimelineMovimientos({ movimientos = [], cargando }) {
  if (cargando) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-dark-200 flex-shrink-0" />
            <div className="flex-1">
              <div className="card p-3.5 h-20 bg-dark-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (movimientos.length === 0) {
    return (
      <div className="text-center py-12 text-dark-400">
        <Clock size={36} className="mx-auto mb-3 opacity-40" />
        <p className="font-medium">Sin movimientos registrados</p>
        <p className="text-sm mt-1">El historial aparecerá aquí cuando se procesen permisos</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {movimientos.map((mov, index) => (
        <TimelineItem
          key={mov.id}
          mov={mov}
          index={index}
          isLast={index === movimientos.length - 1}
        />
      ))}
    </div>
  );
}
