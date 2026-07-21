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
  toggleActivo: (id, activo) => api.patch(`/funcionarios/${id}/activo`, { activo }),
  eliminar: (id, password_admin) => api.delete(`/funcionarios/${id}`, { data: { password_admin } }),
  actualizarSaldos: (id, saldos, arrastres, anio, motivo) => api.put(`/funcionarios/${id}/saldos`, { saldos, arrastres, anio, motivo }),
  actualizarFoto: (id, foto_base64) => api.put(`/funcionarios/${id}/foto`, { foto_base64 }),
  eliminarFoto: (id) => api.delete(`/funcionarios/${id}/foto`),
  bulk: (funcionarios) => api.post('/funcionarios/bulk', { funcionarios }),
  actualizarEmailCuenta: (id, email) => api.put(`/funcionarios/${id}/email`, { email }),
  resetearPasswordDefault: (id) => api.post(`/funcionarios/${id}/credenciales/reset-password`),
  toggleCumpleanos: (id, mostrar_cumpleanos) => api.patch(`/funcionarios/${id}/mostrar-cumpleanos`, { mostrar_cumpleanos }),
};

export const birthdaysApi = {
  hoy: () => api.get('/birthdays/today'),
  like: (id) => api.post(`/birthdays/${id}/like`),
  likers: (id) => api.get(`/birthdays/${id}/likers`),
};

export const feriadoLegalApi = {
  misAlertas: () => api.get('/feriado-legal/alertas'),
  alertasDe: (funcionarioId) => api.get(`/feriado-legal/alertas/${funcionarioId}`),
  verificarHitos: () => api.post('/feriado-legal/verificar-hitos'),
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
  reintegrar: (id, observaciones) => api.patch(`/solicitudes/${id}/reintegrar`, { observaciones }),
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

export const rolesApi = {
  listar: () => api.get('/roles'),
  listarUsuarios: () => api.get('/roles/usuarios'),
  asignar: (usuarioId, codigo) => api.post(`/roles/usuarios/${usuarioId}/asignar`, { codigo }),
  revocar: (usuarioId, codigo) => api.delete(`/roles/usuarios/${usuarioId}/roles/${codigo}`),
};

export const subrogacionesApi = {
  listar: () => api.get('/subrogaciones'),
  candidatos: () => api.get('/subrogaciones/candidatos'),
  crear: (data) => api.post('/subrogaciones', data),
  cancelar: (id) => api.patch(`/subrogaciones/${id}/cancelar`),
};

export const dashboardApi = {
  stats: (anio) => api.get('/dashboard/stats', { params: { anio } }),
};

export const horasCompensatoriasApi = {
  listar:           (params = {}) => api.get('/horas-compensatorias', { params }),
  porFuncionario:   (id) => api.get(`/horas-compensatorias/funcionario/${id}`),
  saldo:            (id) => api.get(`/horas-compensatorias/saldo/${id}`),
  registrar:        (data) => api.post('/horas-compensatorias', data),
  anular:           (id) => api.delete(`/horas-compensatorias/${id}`),
};

export const solicitudesCompensacionApi = {
  listar:    (params = {}) => api.get('/solicitudes-compensacion', { params }),
  crear:     (data) => api.post('/solicitudes-compensacion', data),
  aprobar:   (id, observaciones) => api.patch(`/solicitudes-compensacion/${id}/aprobar`, { observaciones }),
  rechazar:  (id, observaciones) => api.patch(`/solicitudes-compensacion/${id}/rechazar`, { observaciones }),
  cancelar:  (id) => api.patch(`/solicitudes-compensacion/${id}/cancelar`),
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

export const reportesApi = {
  estadisticas: (params = {}) => api.get('/reportes/estadisticas', { params }),
  permisos:     (params = {}) => api.get('/reportes/permisos',     { params }),
  ausentismo:   (params = {}) => api.get('/reportes/ausentismo',   { params }),
};

export const reporteTareasApi = {
  crear:   (data) => api.post('/reporte-tareas', data),
  listar:  () => api.get('/reporte-tareas'),
  tipos:   () => api.get('/reporte-tareas/tipos'),
};

export const suplenciasApi = {
  listar:                 (params = {}) => api.get('/suplencias',                         { params }),
  porFuncionario:         (id)          => api.get(`/suplencias/funcionario/${id}`),
  stats:                  ()            => api.get('/suplencias/stats'),
  alertas:                ()            => api.get('/suplencias/alertas'),
  alertasContractuales:   ()            => api.get('/suplencias/alertas-contractuales'),
  crear:                  (data)        => api.post('/suplencias', data),
  prorrogar:              (id, data)    => api.patch(`/suplencias/${id}/prorrogar`, data),
  finalizar:              (id, data)    => api.patch(`/suplencias/${id}/finalizar`, data),
};

export default api;
