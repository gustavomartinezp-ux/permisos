import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, PartyPopper } from 'lucide-react';
import { birthdaysApi } from '../api/client';
import toast from 'react-hot-toast';

const CONFETI = ['🎉', '🎈', '🎂', '✨'];

const inicial = (s) => (s || '').trim()[0]?.toUpperCase() || '?';

function Avatar({ nombres, apellidos, foto_url }) {
  const cls = 'w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden bg-white/20 flex items-center justify-center font-bold text-white';
  if (foto_url) {
    return <img src={foto_url} alt="" className={`${cls} object-cover`} />;
  }
  return <div className={cls}>{inicial(nombres)}{inicial(apellidos)}</div>;
}

function LikersPopover({ funcionarioId, onClose }) {
  const [likers, setLikers] = useState(null);

  useEffect(() => {
    birthdaysApi.likers(funcionarioId)
      .then(({ data }) => setLikers(data))
      .catch(() => setLikers([]));
  }, [funcionarioId]);

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="absolute right-0 top-full mt-2 z-20 w-64 bg-white rounded-xl shadow-xl border border-dark-200 p-3"
      >
        <p className="text-xs font-semibold text-dark-700 mb-2">Han felicitado hoy</p>
        {likers === null && <p className="text-xs text-dark-400">Cargando…</p>}
        {likers?.length === 0 && <p className="text-xs text-dark-400">Sé el primero en felicitar 🎉</p>}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {likers?.map((l) => (
            <div key={l.usuario_id} className="flex items-center gap-2 text-xs text-dark-600">
              <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700 overflow-hidden flex-shrink-0">
                {l.foto_url
                  ? <img src={l.foto_url} alt="" className="w-full h-full object-cover" />
                  : <span>{inicial(l.nombres || l.email)}</span>}
              </div>
              <span className="truncate">{l.nombres ? `${l.nombres} ${l.apellidos}` : l.email}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  );
}

function BirthdayCard({ f, onLikeToggled }) {
  const [popover, setPopover] = useState(false);
  const [rebotando, setRebotando] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const toggleLike = async () => {
    if (procesando) return;
    setProcesando(true);
    setRebotando(true);
    setTimeout(() => setRebotando(false), 300);
    try {
      const { data } = await birthdaysApi.like(f.id);
      onLikeToggled(f.id, data);
    } catch {
      toast.error('No se pudo registrar la felicitación');
    } finally {
      setProcesando(false);
    }
  };

  const unidad = f.area || f.sector || f.cargo;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl p-4 flex-shrink-0 w-72 sm:w-80 bg-gradient-to-br from-amber-400 via-orange-400 to-pink-500 text-white shadow-lg"
    >
      {/* Confeti sutil, decorativo — no interactúa con clics */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-60">
        {CONFETI.map((e, i) => (
          <motion.span
            key={i}
            className="absolute text-base"
            style={{ left: `${10 + i * 24}%`, top: '-12%' }}
            animate={{ y: ['0%', '480%'], rotate: [0, 20, -20, 0] }}
            transition={{ duration: 6 + i, repeat: Infinity, ease: 'linear', delay: i * 0.8 }}
          >
            {e}
          </motion.span>
        ))}
      </div>

      <div className="relative flex items-start gap-3">
        <Avatar nombres={f.nombres} apellidos={f.apellidos} foto_url={f.foto_url} />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-white/80 font-semibold">¡Feliz cumpleaños! 🎂</p>
          <p className="font-bold leading-tight truncate">{f.nombres} {f.apellidos}</p>
          {unidad && <p className="text-xs text-white/80 truncate">{unidad}</p>}
        </div>
      </div>

      <p className="relative text-xs text-white/90 mt-3 leading-snug">
        La Dirección y todo el equipo te deseamos un muy feliz cumpleaños. ¡Gracias por tu entrega y compromiso diario! 🎉
      </p>

      <div className="relative flex items-center justify-between mt-3">
        <motion.button
          onClick={toggleLike}
          animate={rebotando ? { scale: [1, 1.3, 1] } : {}}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            f.ya_le_di_like ? 'bg-white text-pink-600' : 'bg-white/20 text-white hover:bg-white/30'
          }`}
        >
          <Heart size={13} fill={f.ya_le_di_like ? 'currentColor' : 'none'} />
          Felicitación
        </motion.button>

        <div className="relative">
          <button
            onClick={() => setPopover((p) => !p)}
            className="text-[11px] text-white/90 underline decoration-white/40 underline-offset-2 text-right"
          >
            {f.likes_count} {f.likes_count === 1 ? 'compañero ha felicitado' : 'compañeros han felicitado'}
          </button>
          <AnimatePresence>
            {popover && <LikersPopover funcionarioId={f.id} onClose={() => setPopover(false)} />}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export default function CumpleanosBanner() {
  const [cumpleanieros, setCumpleanieros] = useState([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    birthdaysApi.hoy()
      .then(({ data }) => setCumpleanieros(data))
      .catch(() => {})
      .finally(() => setCargado(true));
  }, []);

  const actualizarLike = (id, data) => {
    setCumpleanieros((prev) => prev.map((f) =>
      f.id === id ? { ...f, likes_count: data.likes_count, ya_le_di_like: data.ya_le_di_like } : f
    ));
  };

  if (!cargado || cumpleanieros.length === 0) return null;

  return (
    <div className="px-4 sm:px-6 pt-4">
      <div className="flex items-center gap-2 mb-2">
        <PartyPopper size={16} className="text-amber-500" />
        <p className="text-sm font-semibold text-dark-700">
          {cumpleanieros.length === 1 ? 'Hoy celebramos un cumpleaños' : `Hoy celebramos ${cumpleanieros.length} cumpleaños`}
        </p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {cumpleanieros.map((f) => (
          <BirthdayCard key={f.id} f={f} onLikeToggled={actualizarLike} />
        ))}
      </div>
    </div>
  );
}
