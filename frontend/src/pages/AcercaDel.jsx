import { motion } from 'framer-motion';
import { Code2, Server, Database, Monitor, Calendar, User2, Info, Shield, Layers } from 'lucide-react';
import { SISTEMA } from '../config/sistema';

const STACK_ICONS = {
  'React 18':      <Monitor size={15} className="text-cyan-500" />,
  'Vite':          <Layers size={15} className="text-purple-500" />,
  'Tailwind CSS':  <Code2 size={15} className="text-sky-500" />,
  'Framer Motion': <Monitor size={15} className="text-pink-500" />,
  'Node.js':       <Server size={15} className="text-emerald-500" />,
  'Express':       <Server size={15} className="text-gray-500" />,
  'PostgreSQL':    <Database size={15} className="text-blue-500" />,
  'Docker':        <Shield size={15} className="text-blue-400" />,
};

function InfoRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-dark-100 last:border-0">
      <span className="text-sm text-dark-500">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-brand-600' : 'text-dark-800'}`}>
        {value}
      </span>
    </div>
  );
}

export default function AcercaDel() {
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-2xl mx-auto">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-dark-900 flex items-center gap-2">
          <Info size={22} className="text-brand-500" />
          Acerca del Sistema
        </h1>
        <p className="text-dark-500 text-sm mt-0.5">
          Información institucional y técnica de la plataforma
        </p>
      </div>

      {/* Card principal: identidad del sistema */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="card overflow-hidden"
      >
        <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <img src="/logo.png" alt="Logo CESFAM" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">CESFAM Los Cerros</h2>
              <p className="text-brand-200 text-sm">{SISTEMA.nombre}</p>
            </div>
          </div>
        </div>

        <div className="px-6 divide-y divide-dark-100">
          <InfoRow label="Versión"          value={`v${SISTEMA.version}`} />
          <InfoRow label="Año"              value={SISTEMA.anio} />
          <InfoRow label="Institución"      value="CESFAM Los Cerros" />
        </div>
      </motion.div>

      {/* Card: créditos del desarrollador */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="card p-6"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <User2 size={22} className="text-brand-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-1">
              Desarrollador
            </p>
            <p className="text-xl font-bold text-dark-900">{SISTEMA.autor}</p>
            <p className="text-sm text-dark-500 mt-1">
              Diseño, desarrollo e implementación del sistema institucional de gestión de
              permisos y recursos humanos para CESFAM Los Cerros.
            </p>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-dark-100 flex items-center gap-2 text-xs text-dark-400">
          <Calendar size={13} />
          <span>© {SISTEMA.anio} {SISTEMA.autor} — Todos los derechos reservados</span>
        </div>
      </motion.div>

      {/* Card: stack tecnológico */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.14 }}
        className="card p-6"
      >
        <h3 className="text-sm font-semibold text-dark-800 flex items-center gap-2 mb-4">
          <Code2 size={15} className="text-brand-500" />
          Tecnologías utilizadas
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SISTEMA.stack.map(({ nombre, rol }) => (
            <div key={nombre} className="flex items-center gap-3 p-3 rounded-xl bg-dark-50 border border-dark-100">
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                {STACK_ICONS[nombre] || <Code2 size={15} className="text-dark-400" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-dark-800">{nombre}</p>
                <p className="text-xs text-dark-400">{rol}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Pie institucional */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="text-center py-2"
      >
        <p className="text-xs text-dark-400">
          Sistema desarrollado por{' '}
          <span className="font-medium text-dark-600">{SISTEMA.autor}</span>
          {' '}© {SISTEMA.anio}
        </p>
      </motion.div>
    </div>
  );
}
