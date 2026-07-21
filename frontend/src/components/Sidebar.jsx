import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, FileText, Clock, LogOut,
  ChevronRight, Settings, UserCircle, KeyRound, Hourglass, BarChart2, UserCheck, Briefcase, UserCog, Info, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CambiarPasswordModal from './CambiarPasswordModal';
import { NOMBRE_ROL, ORDEN_ROL } from '../config/roles';

// Roles permitidos por ítem — deben reflejar lo que el backend realmente exige
// en cada ruta (ver backend/src/middleware/rbac.js y las rutas correspondientes).
// Sin `roles` = visible para cualquiera que no sea autoservicio puro.
const ELEVADOS = ['ADMIN_TI', 'RRHH_ADMIN', 'SECRETARY', 'SUPERVISOR', 'AUDITOR'];

const NAV_SUPERVISOR = [
  { to: '/dashboard',            label: 'Dashboard',           icon: LayoutDashboard, roles: ELEVADOS },
  { header: 'Funcionarios',      roles: ELEVADOS },
  { to: '/funcionarios',         label: 'Planta / Contrata',   icon: Users,     groupColor: 'text-emerald-400', roles: ELEVADOS },
  { to: '/honorarios',           label: 'Honorarios',          icon: Briefcase, groupColor: 'text-amber-400',   roles: ELEVADOS },
  { to: '/suplentes',            label: 'Personal Suplente',   icon: UserCog,   groupColor: 'text-purple-400',  roles: ELEVADOS },
  { header: 'Gestión',           roles: ELEVADOS },
  { to: '/solicitudes',          label: 'Solicitudes',         icon: FileText,    roles: ELEVADOS },
  { to: '/horas-compensatorias', label: 'Hrs. Compensat.',     icon: Hourglass,   roles: ELEVADOS },
  { to: '/historial',            label: 'Historial',           icon: Clock,       roles: ELEVADOS },
  { to: '/suplencias',           label: 'Hist. Suplencias',    icon: UserCheck,   roles: ELEVADOS },
  { to: '/reportes',             label: 'Reportes',            icon: BarChart2,   roles: ELEVADOS },
  { to: '/configuracion',        label: 'Configuración',       icon: Settings,    roles: ['ADMIN_TI'] }, // 👈 único visible para ADMIN_TI
  { to: '/roles',                label: 'Roles y Permisos',    icon: ShieldCheck, roles: ['ADMIN_TI', 'SUPERVISOR'] },
  { header: 'Información' },
  { to: '/acerca',               label: 'Acerca del Sistema',  icon: Info },
];

// Nombres legibles para los roles RBAC — se muestran en vez del rol legacy
// crudo (que no cambia aunque se asignen roles nuevos, ver AuthContext).
// Catálogo compartido en ../config/roles (también usado en FuncionarioDetalle).

// Filtra el menú según los roles RBAC del usuario y quita headers que se
// queden sin ningún ítem visible debajo (evita títulos de sección huérfanos).
function filtrarNav(items, rolesUsuario) {
  const visibles = items.filter((item) => !item.roles || item.roles.some((r) => rolesUsuario.includes(r)));
  return visibles.filter((item, i) => {
    if (!item.header) return true;
    const siguiente = visibles[i + 1];
    return siguiente && !siguiente.header;
  });
}

export default function Sidebar({ mobile = false, onClose }) {
  const { usuario, logout, esSoloAutoservicio, rolesEfectivos } = useAuth();
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
    { header: 'Información' },
    { to: '/acerca',                 label: 'Acerca del Sistema',  icon: Info },
  ];

  const navItems = esSoloAutoservicio
    ? navFuncionario
    : filtrarNav(NAV_SUPERVISOR, rolesEfectivos);

  const etiquetaRol = ORDEN_ROL
    .filter((codigo) => rolesEfectivos.includes(codigo))
    .map((codigo) => NOMBRE_ROL[codigo])
    .join(' · ') || usuario?.rol;

  return (
    <aside className="flex flex-col h-full bg-dark-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 overflow-hidden shadow">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
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
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          if (item.header) {
            return (
              <p key={item.header} className="px-3 pt-4 pb-1 text-xs font-semibold text-dark-500 uppercase tracking-wider">
                {item.header}
              </p>
            );
          }
          const { to, label, icon: Icon, groupColor } = item;
          return (
            <NavLink
              key={to}
              to={to}
              onClick={mobile ? onClose : undefined}
              className={({ isActive }) => isActive ? 'sidebar-link-active' : 'sidebar-link'}
            >
              <Icon size={18} className={groupColor || ''} />
              <span>{label}</span>
            </NavLink>
          );
        })}
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
            <p className="text-xs text-dark-400 truncate" title={etiquetaRol}>{etiquetaRol}</p>
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
