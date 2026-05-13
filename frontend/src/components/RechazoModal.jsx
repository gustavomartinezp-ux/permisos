import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, XCircle, RotateCcw } from 'lucide-react';

export default function RechazoModal({
  onClose, onConfirm, cargando,
  titulo = 'Rechazar solicitud',
  labelMotivo = 'Motivo del rechazo',
  placeholder = 'Ej: Falta de personal, período no disponible...',
  textoBoton = 'Rechazar',
  variante = 'red',
}) {
  const [motivo, setMotivo] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(motivo.trim() || null);
  };

  const esNaranja = variante === 'orange';
  const Icono = esNaranja ? RotateCcw : XCircle;
  const iconoCls = esNaranja ? 'text-orange-500' : 'text-red-500';
  const btnCls = esNaranja
    ? 'bg-orange-500 hover:bg-orange-600'
    : 'bg-red-500 hover:bg-red-600';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100">
            <h2 className="font-semibold text-dark-900 flex items-center gap-2">
              <Icono size={17} className={iconoCls} />
              {titulo}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-700 mb-1.5">
                {labelMotivo} <span className="text-dark-400 font-normal">(opcional)</span>
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="input-field resize-none h-24"
                placeholder={placeholder}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={cargando}
                className={`flex-1 px-4 py-2.5 rounded-xl ${btnCls} text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50`}
              >
                {cargando
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : <><Icono size={15} />{textoBoton}</>
                }
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
