import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';
import CentroDescargas from './CentroDescargas';
import { SISTEMA } from '../config/sistema';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-dark-50">
      {/* Sidebar desktop */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <div className="w-60">
          <Sidebar />
        </div>
      </div>

      {/* Sidebar móvil overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 z-50 lg:hidden"
            >
              <Sidebar mobile onClose={() => setSidebarOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <CentroDescargas />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar móvil */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-dark-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-dark-600 hover:bg-dark-100 transition-colors"
          >
            <Menu size={20} />
          </button>
          <p className="font-semibold text-dark-800 text-sm">CESFAM Los Cerros</p>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </main>

        {/* Footer global institucional */}
        <footer className="flex-shrink-0 border-t border-dark-200 bg-white px-4 py-2 text-center">
          <p className="text-xs text-dark-400">
            Sistema desarrollado por{' '}
            <span className="font-medium text-dark-600">{SISTEMA.autor}</span>
            {' '}© {SISTEMA.anio}
          </p>
        </footer>
      </div>
    </div>
  );
}
