import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, FileText, Clock, LogOut, Cross,
  ChevronRight, Settings, UserCircle, KeyRound, Hourglass,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CambiarPasswordModal from './CambiarPasswordModal';

const NAV_SUPERVISOR = [
  { to: '/dashboard',             label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/funcionarios',          label: 'Funcionarios',     icon: Users },
  { to: '/solicitudes',           label: 'Solicitudes',      icon: FileText },
  { to: '/horas-compensatorias',  label: 'Hrs. Compensat.',  icon: Hourglass },
  { to: '/historial',             label: 'Historial',        icon: Clock },
  { to: '/configuracion',         label: 'Configuración',    icon: Settings },
];

export default function Sidebar({ mobile = false, onClose }) {
  const { usuario, logout, esFuncionario } = useAuth();
  const navigate = useNavigate();
  const [showCambiarPassword, setShowCambiarPassword] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = usuario
    ? `${(usuario.nombres || '?')[0]}${(usuario.apellidos || '?')[0]}`
    : '??';

  // Nav para funcionario: solo sus propias secciones
  const navFuncionario = [
    { to: `/funcionarios/${usuario?.funcionario_id}`, label: 'Mi Perfil',          icon: UserCircle },
    { to: '/solicitudes',            label: 'Mis Solicitudes',    icon: FileText },
    { to: '/horas-compensatorias',   label: 'Hrs. Compensatorias',icon: Hourglass },
    { to: '/historial',              label: 'Mi Historial',       icon: Clock },
  ];

  const navItems = esFuncionario ? navFuncionario : NAV_SUPERVISOR;

  return (
    <aside className="flex flex-col h-full bg-dark-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0">
          <Cross size={18} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">CESFAM Los Cerros</p>
          <p className="text-xs text-dark-400 truncate">Gestión de Permisos</p>
        </div>
        {mobile && (
          <button onClick={onClose} className="ml-auto p-1 rounded text-dark-400 hover:text-white">
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={mobile ? onClose : undefined}
            className={({ isActive }) => isActive ? 'sidebar-link-active' : 'sidebar-link'}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 pb-4 border-t border-white/10 pt-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {initials.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate text-white">
              {usuario?.nombres} {usuario?.apellidos}
            </p>
            <p className="text-xs text-dark-400 capitalize">{usuario?.rol}</p>
          </div>
        </div>
        <button onClick={() => setShowCambiarPassword(true)} className="sidebar-link w-full">
          <KeyRound size={18} />
          <span>Cambiar contraseña</span>
        </button>
        <button onClick={handleLogout} className="sidebar-link w-full">
          <LogOut size={18} />
          <span>Cerrar sesión</span>
        </button>
      </div>

      {showCambiarPassword && (
        <CambiarPasswordModal onClose={() => setShowCambiarPassword(false)} />
      )}
    </aside>
  );
}
