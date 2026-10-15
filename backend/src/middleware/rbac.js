const { pool } = require('../db');

// Caché en memoria de roles/permisos por usuario. cargarPermisos corre en cada
// petición; con muchos usuarios simultáneos sus consultas saturaban el pool de
// conexiones. Se cachea 30 s y se invalida al asignar/revocar roles o crear/
// cancelar subrogaciones (ver invalidarPermisos).
const CACHE_TTL_MS = 30 * 1000;
const cachePermisos = new Map();

// Sin argumento limpia todo (ej. cambios a role_permissions)
const invalidarPermisos = (usuarioId) => {
  if (usuarioId == null) cachePermisos.clear();
  else cachePermisos.delete(String(usuarioId));
};

// Roles, subrogación vigente y permisos efectivos en UNA sola consulta.
// Si el usuario está subrogando a un supervisor titular (fecha vigente),
// hereda además el rol SUPERVISOR y el scope (sector/área) del titular.
async function resolverPermisos(usuarioId) {
  const { rows } = await pool.query(
    `WITH sub AS (
       SELECT s.supervisor_titular_id, u.sector, u.area
       FROM subrogaciones s
       JOIN usuarios u ON u.id = s.supervisor_titular_id
       WHERE s.usuario_subrogante_id = $1
         AND s.activo = TRUE
         AND (NOW() AT TIME ZONE 'America/Santiago')::date BETWEEN s.fecha_inicio AND s.fecha_fin
       LIMIT 1
     ),
     mis_roles AS (
       SELECT r.codigo FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.usuario_id = $1
       UNION
       SELECT 'SUPERVISOR' WHERE EXISTS (SELECT 1 FROM sub)
     )
     SELECT
       COALESCE((SELECT ARRAY_AGG(codigo) FROM mis_roles), '{}') AS roles,
       COALESCE((SELECT ARRAY_AGG(DISTINCT p.codigo)
                 FROM role_permissions rp
                 JOIN permissions p ON p.id = rp.permission_id
                 JOIN roles r ON r.id = rp.role_id
                 WHERE r.codigo IN (SELECT codigo FROM mis_roles)), '{}') AS permisos,
       (SELECT ROW_TO_JSON(sub) FROM sub) AS sub`,
    [usuarioId]
  );
  return rows[0];
}

const cargarPermisos = async (req, res, next) => {
  try {
    const clave = String(req.usuario.id);
    let entrada = cachePermisos.get(clave);
    if (!entrada || entrada.expira < Date.now()) {
      entrada = { datos: await resolverPermisos(req.usuario.id), expira: Date.now() + CACHE_TTL_MS };
      cachePermisos.set(clave, entrada);
    }
    const { roles, permisos, sub } = entrada.datos;

    req.usuario.rolesRBAC = [...roles];
    req.usuario.permisos = [...permisos];
    req.usuario.subrogandoA = sub ? sub.supervisor_titular_id : null;
    req.usuario.scopeEfectivo = sub
      ? { sector: sub.sector || null, area: sub.area || null }
      : { sector: req.usuario.sector || null, area: req.usuario.area || null };

    next();
  } catch (err) {
    console.error('[rbac] Error al cargar permisos:', err.message);
    res.status(500).json({ error: 'Error al resolver permisos' });
  }
};

// Permite el acceso si el usuario tiene AL MENOS UNO de los permisos indicados.
// El rol legacy 'admin' (usuarios.rol) siempre pasa, para no romper compatibilidad
// mientras conviven ambos sistemas.
const requierePermiso = (...codigos) => (req, res, next) => {
  if (req.usuario.rol === 'admin') return next();
  const permisos = req.usuario.permisos || [];
  if (codigos.some((c) => permisos.includes(c))) return next();
  return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' });
};

// Bloquea la acción si el solicitante de la solicitud es el mismo usuario autenticado,
// sin importar su rol — regla de anticonflicto de interés aplicable a todos por igual.
const noAutoAprobacion = (funcionarioIdSolicitud, req) => {
  return !!(req.usuario.funcionario_id && funcionarioIdSolicitud == req.usuario.funcionario_id);
};

// true solo si el usuario es un funcionario raso (EMPLOYEE) sin ningún rol RBAC
// adicional — usado para relajar los checks legacy `rol === 'funcionario'` y dejar
// pasar a roles nuevos (ej. AUDITOR, SECRETARY) que no tienen equivalente en
// usuarios.rol pero sí deben tener acceso de lectura/gestión más amplio.
const esSoloAutoservicio = (req) => {
  if (req.usuario.rol !== 'funcionario') return false;
  const roles = req.usuario.rolesRBAC || [];
  return !roles.some((r) => r !== 'EMPLOYEE');
};

// Roles RBAC que implican visibilidad global (no acotada a sector/área) sin
// importar qué rol legacy arrastre la cuenta — ej. una cuenta con rol legacy
// 'supervisor' a la que además se le asignó ADMIN_TI vía la UI de Roles no
// debe seguir viendo solo su sector.
const ROLES_VISIBILIDAD_GLOBAL = ['ADMIN_TI', 'RRHH_ADMIN', 'AUDITOR'];

// Variante para middlewares/rutas ya autenticadas (usa req.usuario.rolesRBAC,
// cargado por cargarPermisos).
const tieneVisibilidadGlobal = (req) => {
  if (req.usuario.rol === 'admin') return true;
  const roles = req.usuario.rolesRBAC || [];
  return roles.some((r) => ROLES_VISIBILIDAD_GLOBAL.includes(r));
};

// Variante para contextos sin request (ej. el worker de reportería), que
// resuelve la visibilidad global consultando roles RBAC directamente por id.
const tieneVisibilidadGlobalPorUsuarioId = async (usuarioId) => {
  const { rows } = await pool.query(
    `SELECT u.rol,
            ARRAY_AGG(r.codigo) FILTER (WHERE r.codigo IS NOT NULL) AS roles
     FROM usuarios u
     LEFT JOIN user_roles ur ON ur.usuario_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1
     GROUP BY u.rol`,
    [usuarioId]
  );
  const row = rows[0];
  if (!row) return false;
  if (row.rol === 'admin') return true;
  return (row.roles || []).some((r) => ROLES_VISIBILIDAD_GLOBAL.includes(r));
};

module.exports = {
  cargarPermisos, invalidarPermisos, requierePermiso, noAutoAprobacion, esSoloAutoservicio,
  tieneVisibilidadGlobal, tieneVisibilidadGlobalPorUsuarioId,
};
