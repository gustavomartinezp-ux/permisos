import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { feriadoLegalApi } from '../api/client';

// Alerta institucional de hito de antigüedad (bono de +5 días de feriado
// legal a los 15/20 años de servicio). Se monta globalmente (como
// CumpleanosBanner) para que llegue al funcionario sin importar qué pantalla
// esté viendo — el backend solo devuelve algo si el usuario logueado tiene
// un funcionario_id vinculado con un hito generado.
export default function AlertaAntiguedad() {
  const [alertas, setAlertas] = useState([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    feriadoLegalApi.misAlertas()
      .then(({ data }) => setAlertas(data))
      .catch(() => {})
      .finally(() => setCargado(true));
  }, []);

  if (!cargado || alertas.length === 0) return null;

  return (
    <div className="px-4 sm:px-6 pt-4 space-y-2">
      <AnimatePresence>
        {alertas.map((a) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-3 rounded-2xl border p-4 ${
              a.aplicado ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              a.aplicado ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
            }`}>
              {a.aplicado ? <CheckCircle2 size={18} /> : <CalendarClock size={18} />}
            </div>
            <div className="min-w-0">
              <p className={`text-sm ${a.aplicado ? 'text-emerald-800' : 'text-amber-800'}`}>
                {a.mensaje}
              </p>
              {a.aplicado && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">
                  ✓ Los días ya fueron agregados a su saldo de feriado legal.
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
