import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, TrendingDown, TrendingUp, RefreshCw, Plus, Search } from 'lucide-react';
import { historialApi } from '../api/client';
import TimelineMovimientos from '../components/TimelineMovimientos';
import toast from 'react-hot-toast';

const TIPOS = [
  { value: '', label: 'Todos' },
  { value: 'descuento', label: 'Descuentos' },
  { value: 'reintegro', label: 'Reintegros' },
  { value: 'reserva', label: 'En trámite' },
  { value: 'ajuste', label: 'Ajustes' },
];

export default function Historial() {
  const [movimientos, setMovimientos] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [modo, setModo] = useState('timeline'); // 'timeline' | 'tabla'

  const cargar = useCallback(() => {
    setCargando(true);
    historialApi.global({ tipo_movimiento: tipoFiltro || undefined, limit: 80 })
      .then(({ data }) => {
        setMovimientos(data.movimientos);
        setTotal(data.total);
      })
      .catch(() => toast.error('Error al cargar historial'))
      .finally(() => setCargando(false));
  }, [tipoFiltro]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-dark-900">Historial de Movimientos</h1>
        <p className="text-dark-500 text-sm mt-0.5">
          {total} movimiento(s) registrado(s) — Libro mayor de transacciones
        </p>
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1 bg-dark-100 p-1 rounded-xl flex-shrink-0">
          {TIPOS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTipoFiltro(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tipoFiltro === value
                  ? 'bg-white text-dark-900 shadow-sm'
                  : 'text-dark-500 hover:text-dark-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 ml-auto bg-dark-100 p-1 rounded-xl">
          <button
            onClick={() => setModo('timeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              modo === 'timeline' ? 'bg-white text-dark-900 shadow-sm' : 'text-dark-500'
            }`}
          >
            Línea de tiempo
          </button>
          <button
            onClick={() => setModo('tabla')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              modo === 'tabla' ? 'bg-white text-dark-900 shadow-sm' : 'text-dark-500'
            }`}
          >
            Tabla
          </button>
        </div>
      </div>

      {/* Resumen rápido */}
      {!cargando && movimientos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { tipo: 'descuento', label: 'Descuentos', color: 'text-red-600', bg: 'bg-red-50', icon: TrendingDown },
            { tipo: 'reintegro', label: 'Reintegros', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: TrendingUp },
            { tipo: 'reserva', label: 'En trámite', color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock },
            { tipo: 'ajuste', label: 'Ajustes', color: 'text-blue-600', bg: 'bg-blue-50', icon: RefreshCw },
          ].map(({ tipo, label, color, bg, icon: Icon }) => {
            const count = movimientos.filter(m => m.tipo_movimiento === tipo).length;
            return (
              <button
                key={tipo}
                onClick={() => setTipoFiltro(tipoFiltro === tipo ? '' : tipo)}
                className={`card p-3 flex items-center gap-3 transition-all hover:shadow-card-hover ${
                  tipoFiltro === tipo ? 'ring-2 ring-brand-400' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={16} className={color} />
                </div>
                <div>
                  <p className="text-lg font-bold text-dark-800">{count}</p>
                  <p className="text-xs text-dark-500">{label}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Contenido principal */}
      {modo === 'timeline' ? (
        <TimelineMovimientos movimientos={movimientos} cargando={cargando} />
      ) : (
        <div className="card overflow-hidden">
          {cargando ? (
            <div className="p-6 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-12 bg-dark-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-3 px-5 py-3 bg-dark-50 border-b border-dark-100 text-xs font-medium text-dark-500 uppercase tracking-wide">
                <span>Funcionario</span>
                <span>Descripción</span>
                <span>Tipo</span>
                <span>Días</span>
                <span>Saldo anterior → nuevo</span>
                <span>Fecha</span>
              </div>
              <div className="divide-y divide-dark-100">
                {movimientos.map((m, i) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="px-5 py-3 flex flex-col md:grid md:grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-2 md:gap-3 md:items-center text-sm"
                  >
                    <div>
                      <p className="font-medium text-dark-800">{m.nombres} {m.apellidos}</p>
                      <p className="text-xs text-dark-400">{m.rut}</p>
                    </div>
                    <p className="text-dark-600 text-xs leading-snug line-clamp-2">{m.descripcion}</p>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium w-fit"
                      style={{ backgroundColor: `${m.color}20`, color: m.color }}
                    >
                      {m.tipo_permiso_nombre}
                    </span>
                    <span className={`font-semibold text-sm ${
                      ['reintegro', 'asignacion'].includes(m.tipo_movimiento)
                        ? 'text-emerald-600'
                        : 'text-red-600'
                    }`}>
                      {['reintegro', 'asignacion'].includes(m.tipo_movimiento) ? '+' : '-'}{Math.abs(m.dias_movimiento)}d
                    </span>
                    <span className="text-xs text-dark-500">
                      {m.saldo_anterior} → {m.saldo_nuevo}
                    </span>
                    <span className="text-xs text-dark-400">
                      {format(parseISO(m.created_at), 'd MMM HH:mm', { locale: es })}
                    </span>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
