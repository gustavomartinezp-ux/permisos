import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => {
    try {
      const stored = localStorage.getItem('usuario');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authApi.me()
        .then(({ data }) => setUsuario(data))
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('usuario');
          setUsuario(null);
        })
        .finally(() => setCargando(false));
    } else {
      setCargando(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login(email, password);
    localStorage.setItem('token', data.token);
    // /auth/login no incluye rolesRBAC/permisos (solo /auth/me los resuelve) —
    // se pide el perfil completo para que el menú y los guards de ruta queden
    // correctos desde el primer render, sin esperar a un refresh.
    const { data: perfil } = await authApi.me();
    localStorage.setItem('usuario', JSON.stringify(perfil));
    setUsuario(perfil);
    return perfil;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  }, []);

  // Aplica cambios parciales al perfil en memoria y en localStorage sin re-hacer
  // login — usado tras el cambio obligatorio de contraseña para limpiar
  // must_change_password sin esperar un refresh completo de /auth/me.
  const actualizarUsuario = useCallback((parcial) => {
    setUsuario((prev) => {
      const siguiente = { ...prev, ...parcial };
      localStorage.setItem('usuario', JSON.stringify(siguiente));
      return siguiente;
    });
  }, []);

  const esAdmin        = usuario?.rol === 'admin';
  const esSupervisor   = ['admin', 'supervisor'].includes(usuario?.rol);
  const esSupervisorPuro = usuario?.rol === 'supervisor' || (usuario?.rolesRBAC || []).includes('SUPERVISOR');
  const esFuncionario  = usuario?.rol === 'funcionario';
  // Autoservicio estricto: rol legacy funcionario Y sin ningún rol RBAC adicional
  // (SECRETARY/AUDITOR también parten de rol legacy 'funcionario' pero no deben
  // quedar restringidos a la vista de autoservicio).
  const esSoloAutoservicio = esFuncionario && !(usuario?.rolesRBAC || []).some((r) => r !== 'EMPLOYEE');

  // RBAC granular (roles/permisos nuevos, conviven con el rol legacy de arriba)
  const tienePermiso = useCallback(
    (...codigos) => usuario?.rol === 'admin' || codigos.some((c) => (usuario?.permisos || []).includes(c)),
    [usuario]
  );
  const tieneRolRBAC = useCallback(
    (codigo) => (usuario?.rolesRBAC || []).includes(codigo),
    [usuario]
  );

  // Set de roles RBAC a usar para filtrar menús/rutas por rol. Si el backend ya
  // resolvió rolesRBAC (caso normal) se usa tal cual; si no llegó todavía, se
  // deriva del rol legacy para no dejar el menú vacío/incorrecto un instante.
  const rolesEfectivos = (usuario?.rolesRBAC && usuario.rolesRBAC.length > 0)
    ? usuario.rolesRBAC
    : usuario?.rol === 'admin'      ? ['ADMIN_TI', 'RRHH_ADMIN']
    : usuario?.rol === 'supervisor' ? ['SUPERVISOR']
    : usuario?.rol === 'funcionario' ? ['EMPLOYEE']
    : [];

  return (
    <AuthContext.Provider value={{
      usuario, cargando, login, logout, actualizarUsuario,
      esAdmin, esSupervisor, esSupervisorPuro, esFuncionario, esSoloAutoservicio,
      tienePermiso, tieneRolRBAC, rolesEfectivos,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
