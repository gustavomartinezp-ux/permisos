import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeftRight, CheckCircle2 } from 'lucide-react';

export default function SaldoCard({ saldo, index = 0 }) {
  const disponible = saldo.dias_asignados - saldo.dias_usados - (saldo.dias_pendientes || 0);
  const arrastreDisp = saldo.es_feriado_legal
    ? ((saldo.saldo_arrastre || 0) - (saldo.arrastre_usados || 0) - (saldo.arrastre_pendientes || 0))
    : 0;
  const totalDisponible = saldo.es_feriado_legal
    ? (saldo.total_disponible ?? disponible + arrastreDisp)
    : disponible;
  const porcentajeUsado = saldo.dias_asignados > 0
    ? Math.round((saldo.dias_usados / saldo.dias_asignados) * 100)
    : 0;
  const critico = totalDisponible <= 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className={`card p-4 ${critico ? 'border-red-300 bg-red-50' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: saldo.color }}
            />
            <p className="text-xs font-medium text-dark-500 uppercase tracking-wide">
              {saldo.codigo}
            </p>
            {saldo.es_feriado_legal && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                Feriado Legal
              </span>
            )}
          </div>
          <p className="font-semibold text-dark-800 text-sm">{saldo.tipo_nombre}</p>
        </div>
        {critico && (
          <span title="Saldo bajo">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          </span>
        )}
      </div>

      {/* Barra de progreso */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-dark-500 mb-1">
          <span>Usado: <strong className="text-dark-700">{saldo.dias_usados}</strong></span>
          <span>Total: <strong className="text-dark-700">{saldo.dias_asignados}</strong></span>
        </div>
        <div className="h-1.5 bg-dark-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(porcentajeUsado, 100)}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: index * 0.07 + 0.2 }}
            className="h-full rounded-full"
            style={{ backgroundColor: saldo.color }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-dark-50 rounded-lg p-2">
          <p className="text-lg font-bold" style={{ color: saldo.color }}>{totalDisponible}</p>
          <p className="text-xs text-dark-500">Disponibles</p>
        </div>
        <div className="bg-dark-50 rounded-lg p-2">
          <p className="text-lg font-bold text-dark-700">{saldo.dias_usados}</p>
          <p className="text-xs text-dark-500">Usados</p>
        </div>
        <div className="bg-dark-50 rounded-lg p-2">
          <p className="text-lg font-bold text-amber-600">{saldo.dias_pendientes || 0}</p>
          <p className="text-xs text-dark-500">Pendientes</p>
        </div>
      </div>

      {/* Desglose arrastre y parcialización (solo feriado legal) */}
      {saldo.es_feriado_legal && (
        <div className="mt-3 pt-3 border-t border-dark-100 space-y-1.5">
          <p className="text-xs font-medium text-dark-500 flex items-center gap-1">
            <ArrowLeftRight size={12} />
            Desglose
          </p>
          <div className="flex justify-between text-xs">
            <span className="text-dark-500">Período actual</span>
            <span className="font-semibold text-dark-700">{disponible} días</span>
          </div>
          {arrastreDisp > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-amber-600">Arrastre año anterior</span>
              <span className="font-semibold text-amber-700">{arrastreDisp} días</span>
            </div>
          )}
          {/* Parcialización */}
          {saldo.dias_asignados > 10 && (
            <div className="mt-1 pt-1 border-t border-dark-100">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-dark-400">Días parcializables</span>
                <span className="font-medium text-dark-600">
                  {Math.max((saldo.max_parciales ?? saldo.dias_asignados - 10) - (saldo.dias_parciales_usados || 0), 0)} restantes
                  <span className="text-dark-400 font-normal"> / {saldo.max_parciales ?? saldo.dias_asignados - 10} máx</span>
                </span>
              </div>
            </div>
          )}
          {saldo.bloque_10_dias_cumplido ? (
            <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
              <CheckCircle2 size={12} />
              Bloque 10 días cumplido
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
              <AlertTriangle size={12} />
              Pendiente bloque 10 días consecutivos
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
