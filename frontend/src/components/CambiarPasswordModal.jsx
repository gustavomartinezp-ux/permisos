import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, KeyRound, Eye, EyeOff } from 'lucide-react';
import { authApi } from '../api/client';
import toast from 'react-hot-toast';

export default function CambiarPasswordModal({ onClose }) {
  const [form, setForm] = useState({ actual: '', nueva: '', confirmar: '' });
  const [mostrar, setMostrar] = useState({ actual: false, nueva: false, confirmar: false });
  const [guardando, setGuardando] = useState(false);

  const toggle = (campo) => setMostrar(p => ({ ...p, [campo]: !p[campo] }));
  const set = (campo, valor) => setForm(p => ({ ...p, [campo]: valor }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.nueva.length < 6) return toast.error('La nueva contraseña debe tener al menos 6 caracteres');
    if (form.nueva !== form.confirmar) return toast.error('Las contraseñas no coinciden');
    setGuardando(true);
    try {
      await authApi.cambiarPassword(form.actual, form.nueva);
      toast.success('Contraseña actualizada exitosamente');
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al cambiar contraseña');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 z-10"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
                <KeyRound size={18} className="text-brand-600" />
              </div>
              <h2 className="text-lg font-semibold text-dark-900">Cambiar contraseña</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { key: 'actual', label: 'Contraseña actual' },
              { key: 'nueva', label: 'Nueva contraseña' },
              { key: 'confirmar', label: 'Confirmar nueva contraseña' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-dark-700 mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type={mostrar[key] ? 'text' : 'password'}
                    value={form[key]}
                    onChange={e => set(key, e.target.value)}
                    className="input-field pr-10"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600"
                  >
                    {mostrar[key] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            ))}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
                Cancelar
              </button>
              <button type="submit" disabled={guardando} className="btn-primary flex-1 justify-center">
                {guardando
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : 'Guardar'
                }
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
