import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://cesfam-permisos-api.onrender.com/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (window.location.pathname !== '/login') {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  cambiarPassword: (password_actual, password_nueva) =>
    api.patch('/auth/cambiar-password', { password_actual, password_nueva }),
};

export const funcionariosApi = {
  listar: (params = {}) => api.get('/funcionarios', { params }),
  obtener: (id, anio) => api.get(`/funcionarios/${id}`, { params: { anio } }),
  crear: (data) => api.post('/funcionarios', data),
  actualizar: (id, data) => api.put(`/funcionarios/${id}`, data),
  eliminar: (id, password_admin) => api.delete(`/funcionarios/${id}`, { data: { password_admin } }),
  actualizarSaldos: (id, saldos, arrastres, anio, motivo) => api.put(`/funcionarios/${id}/saldos`, { saldos, arrastres, anio, motivo }),
  actualizarFoto: (id, foto_base64) => api.put(`/funcionarios/${id}/foto`, { foto_base64 }),
  eliminarFoto: (id) => api.delete(`/funcionarios/${id}/foto`),
  bulk: (funcionarios) => api.post('/funcionarios/bulk', { funcionarios }),
};

export const tiposPermisosApi = {
  listar: () => api.get('/tipos-permisos'),
  crear: (data) => api.post('/tipos-permisos', data),
  actualizar: (id, data) => api.put(`/tipos-permisos/${id}`, data),
};

export const serviciosApi = {
  listar: () => api.get('/servicios'),
  todos: () => api.get('/servicios/todos'),
  crear: (data) => api.post('/servicios', data),
  actualizar: (id, data) => api.put(`/servicios/${id}`, data),
};

export const dispositivosApi = {
  listar: () => api.get('/dispositivos'),
  crear: (data) => api.post('/dispositivos', data),
  actualizar: (id, data) => api.put(`/dispositivos/${id}`, data),
};

export const solicitudesApi = {
  listar: (params) => api.get('/solicitudes', { params }),
  crear: (data) => api.post('/solicitudes', data),
  preAprobar: (id, observaciones) => api.patch(`/solicitudes/${id}/pre-aprobar`, { observaciones }),
  aprobar: (id, observaciones) => api.patch(`/solicitudes/${id}/aprobar`, { observaciones }),
  rechazar: (id, observaciones) => api.patch(`/solicitudes/${id}/rechazar`, { observaciones }),
};

export const saldosApi = {
  porFuncionario: (id, anio) => api.get(`/saldos/funcionario/${id}`, { params: { anio } }),
  ajustar: (data) => api.put('/saldos/ajuste', data),
  calcularArrastre: (anio_origen, anio_destino) =>
    api.post('/saldos/calcular-arrastre', { anio_origen, anio_destino }),
};

export const historialApi = {
  global: (params) => api.get('/historial', { params }),
  porFuncionario: (id, params) => api.get(`/historial/funcionario/${id}`, { params }),
};

export const dashboardApi = {
  stats: (anio) => api.get('/dashboard/stats', { params: { anio } }),
};

export const usuariosApi = {
  listar: () => api.get('/usuarios'),
  actualizar: (id, data) => api.put(`/usuarios/${id}`, data),
  crear: (data) => api.post('/usuarios', data),
  toggleActivo: (id, activo) => api.patch(`/usuarios/${id}/activo`, { activo }),
  cambiarPassword: (id, password_nueva, password_admin) =>
    api.patch(`/usuarios/${id}/password`, { password_nueva, password_admin }),
  cambiarEmail: (id, email, password_admin) =>
    api.patch(`/usuarios/${id}/email`, { email, password_admin }),
};

export default api;
