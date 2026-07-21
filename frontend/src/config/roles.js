// Catálogo compartido de roles RBAC — usado por Sidebar (etiqueta del usuario
// logueado) y por la ficha de funcionario (badge de rol de cada persona).
// Mantener sincronizado con los códigos sembrados en backend/src/db/migrate.js.

export const NOMBRE_ROL = {
  ADMIN_TI: 'Administrador de TI',
  RRHH_ADMIN: 'Encargado de RRHH',
  SECRETARY: 'Secretaría',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Funcionario',
  AUDITOR: 'Auditor',
};

export const ORDEN_ROL = ['ADMIN_TI', 'RRHH_ADMIN', 'SECRETARY', 'SUPERVISOR', 'AUDITOR', 'EMPLOYEE'];

export const COLOR_ROL = {
  ADMIN_TI: 'bg-red-100 text-red-700 border-red-200',
  RRHH_ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  SECRETARY: 'bg-blue-100 text-blue-700 border-blue-200',
  SUPERVISOR: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EMPLOYEE: 'bg-dark-100 text-dark-600 border-dark-200',
  AUDITOR: 'bg-amber-100 text-amber-700 border-amber-200',
};
