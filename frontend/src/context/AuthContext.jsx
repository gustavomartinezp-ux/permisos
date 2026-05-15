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
    localStorage.setItem('usuario', JSON.stringify(data.usuario));
    setUsuario(data.usuario);
    return data.usuario;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  }, []);

  const esAdmin        = usuario?.rol === 'admin';
  const esSupervisor   = ['admin', 'supervisor'].includes(usuario?.rol);
  const esSupervisorPuro = usuario?.rol === 'supervisor';
  const esFuncionario  = usuario?.rol === 'funcionario';

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout, esAdmin, esSupervisor, esSupervisorPuro, esFuncionario }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
