const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { SECTORES_VALIDOS, AREAS_VALIDAS } = require('../config/catalogos');

const router = express.Router();
router.use(verificarToken);

router.get('/stats', async (req, res) => {
  if (req.usuario.rol === 'funcionario') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const anio = req.query.anio || new Date().getFullYear();
  const esSupervisor = req.usuario.rol === 'supervisor';
  const sectorFiltro = esSupervisor && req.usuario.sector ? req.usuario.sector : null;
  const areaFiltro   = esSupervisor && !req.usuario.sector && req.usuario.area ? req.usuario.area : null;

  try {
    // Validar el valor del filtro contra los catálogos antes de usarlo en SQL
    const filterParam = SECTORES_VALIDOS.includes(sectorFiltro) ? sectorFiltro
                      : AREAS_VALIDAS.includes(areaFiltro)      ? areaFiltro
                      : null;
    // Nombre de columna — viene de nuestra lógica, no de input del usuario
    const filterField = SECTORES_VALIDOS.includes(sectorFiltro) ? 'f.sector' : 'f.area';

    // Condición parametrizada según posición del placeholder en cada query
    const fCond1 = filterParam ? `AND ${filterField} = $1` : '';  // sin otros params
    const fCond2 = filterParam ? `AND ${filterField} = $2` : '';  // anio ocupa $1
    const pFilt  = filterParam ? [filterParam] : [];
    const pAnio  = filterParam ? [anio, filterParam] : [anio];

    const [totalFunc, pendientes, preAprobadas, aprobadas, rechazadas] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM funcionarios f WHERE f.activo = true ${fCond1}`,
        pFilt
      ),
      pool.query(
        `SELECT COUNT(*) FROM solicitudes sol
         JOIN funcionarios f ON sol.funcionario_id = f.id
         WHERE sol.estado = 'pendiente' ${fCond1}`,
        pFilt
      ),
      pool.query(
        `SELECT COUNT(*) FROM solicitudes sol
         JOIN funcionarios f ON sol.funcionario_id = f.id
         WHERE sol.estado = 'pre_aprobado' ${fCond1}`,
        pFilt
      ),
      pool.query(
        `SELECT COUNT(*) FROM solicitudes sol
         JOIN funcionarios f ON sol.funcionario_id = f.id
         WHERE sol.estado = 'aprobado'
           AND EXTRACT(YEAR FROM sol.fecha_solicitud) = $1 ${fCond2}`,
        pAnio
      ),
      pool.query(
        `SELECT COUNT(*) FROM solicitudes sol
         JOIN funcionarios f ON sol.funcionario_id = f.id
         WHERE sol.estado = 'rechazado'
           AND EXTRACT(YEAR FROM sol.fecha_solicitud) = $1 ${fCond2}`,
        pAnio
      ),
    ]);

    // ── Fuera hoy ────────────────────────────────────────────────────────────
    const fueraHoy = await pool.query(
      `SELECT sol.id, sol.funcionario_id, sol.fecha_inicio, sol.fecha_fin, sol.dias_solicitados,
              f.nombres, f.apellidos, f.cargo, f.sector,
              s.nombre AS servicio,
              tp.nombre AS tipo_nombre, tp.color
       FROM solicitudes sol
       JOIN funcionarios f ON sol.funcionario_id = f.id
       LEFT JOIN servicios s ON f.servicio_id = s.id
       JOIN tipos_permisos tp ON sol.tipo_permiso_id = tp.id
       WHERE sol.estado = 'aprobado'
         AND CURRENT_DATE BETWEEN sol.fecha_inicio AND sol.fecha_fin
         ${fCond1}
       ORDER BY f.sector NULLS LAST, f.apellidos`,
      pFilt
    );

    // ── Próximas ausencias (7 días) ──────────────────────────────────────────
    const proximasVencer = await pool.query(
      `SELECT sol.*, f.nombres, f.apellidos, tp.nombre AS tipo_nombre, tp.color
       FROM solicitudes sol
       JOIN funcionarios f ON sol.funcionario_id = f.id
       JOIN tipos_permisos tp ON sol.tipo_permiso_id = tp.id
       WHERE sol.estado = 'aprobado'
         AND sol.fecha_inicio > CURRENT_DATE
         AND sol.fecha_inicio <= CURRENT_DATE + INTERVAL '7 days'
         ${fCond1}
       ORDER BY sol.fecha_inicio ASC
       LIMIT 5`,
      pFilt
    );

    // ── Top funcionarios con más días usados ─────────────────────────────────
    const topFuncionarios = await pool.query(
      `SELECT f.id, f.nombres, f.apellidos, f.cargo,
              SUM(sf.dias_usados) AS total_usados,
              SUM(sf.dias_asignados) AS total_asignados
       FROM funcionarios f
       JOIN saldos_funcionarios sf ON f.id = sf.funcionario_id
       WHERE sf.anio = $1 AND f.activo = true ${fCond2}
       GROUP BY f.id
       ORDER BY total_usados DESC
       LIMIT 5`,
      pAnio
    );

    // ── Actividad reciente ───────────────────────────────────────────────────
    const actividadReciente = await pool.query(
      `SELECT hm.*, f.nombres, f.apellidos, tp.nombre AS tipo_nombre, tp.color
       FROM historial_movimientos hm
       JOIN funcionarios f ON hm.funcionario_id = f.id
       JOIN tipos_permisos tp ON hm.tipo_permiso_id = tp.id
       ${filterParam ? `WHERE ${filterField} = $1` : ''}
       ORDER BY hm.created_at DESC
       LIMIT 8`,
      pFilt
    );

    // ── Solicitudes para acción según rol ────────────────────────────────────
    let solicitudesPendientes;
    let estadoAccion;

    if (esSupervisor) {
      estadoAccion = 'pendiente';
      solicitudesPendientes = await pool.query(
        `SELECT sol.*, f.nombres, f.apellidos, f.cargo, f.sector,
                s.nombre AS servicio, tp.nombre AS tipo_nombre, tp.color
         FROM solicitudes sol
         JOIN funcionarios f ON sol.funcionario_id = f.id
         LEFT JOIN servicios s ON f.servicio_id = s.id
         JOIN tipos_permisos tp ON sol.tipo_permiso_id = tp.id
         WHERE sol.estado = 'pendiente' ${fCond1}
         ORDER BY sol.fecha_solicitud ASC
         LIMIT 10`,
        pFilt
      );
    } else {
      estadoAccion = 'mixed';
      // Admin ve pre_aprobados + pendientes directos (supervisores y programas sin jefe intermedio)
      solicitudesPendientes = await pool.query(
        `SELECT sol.*, f.nombres, f.apellidos, f.cargo, f.sector,
                s.nombre AS servicio, tp.nombre AS tipo_nombre, tp.color
         FROM solicitudes sol
         JOIN funcionarios f ON sol.funcionario_id = f.id
         LEFT JOIN servicios s ON f.servicio_id = s.id
         JOIN tipos_permisos tp ON sol.tipo_permiso_id = tp.id
         WHERE sol.estado = 'pre_aprobado'
            OR (sol.estado = 'pendiente' AND EXISTS (
                  SELECT 1 FROM usuarios u
                  WHERE u.funcionario_id = sol.funcionario_id
                    AND u.rol = 'supervisor'
                    AND u.activo = true
               ))
         ORDER BY CASE WHEN sol.estado = 'pendiente' THEN 0 ELSE 1 END,
                  sol.fecha_solicitud ASC
         LIMIT 15`
      );
    }

    // Contar pendientes directos para admin
    const directasAdmin = !esSupervisor
      ? await pool.query(
          `SELECT COUNT(*) FROM solicitudes sol
           WHERE sol.estado = 'pendiente'
             AND EXISTS (
               SELECT 1 FROM usuarios u
               WHERE u.funcionario_id = sol.funcionario_id
                 AND u.rol = 'supervisor'
                 AND u.activo = true
             )`
        )
      : null;

    res.json({
      stats: {
        total_funcionarios: parseInt(totalFunc.rows[0].count),
        solicitudes_pendientes: parseInt(pendientes.rows[0].count),
        solicitudes_pre_aprobadas: parseInt(preAprobadas.rows[0].count),
        solicitudes_aprobadas: parseInt(aprobadas.rows[0].count),
        solicitudes_rechazadas: parseInt(rechazadas.rows[0].count),
        fuera_hoy_count: fueraHoy.rows.length,
        solicitudes_directas: directasAdmin ? parseInt(directasAdmin.rows[0].count) : 0,
      },
      fuera_hoy: fueraHoy.rows,
      proximas_ausencias: proximasVencer.rows,
      top_funcionarios: topFuncionarios.rows,
      actividad_reciente: actividadReciente.rows,
      solicitudes_pendientes: solicitudesPendientes.rows,
      estado_accion: estadoAccion,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

module.exports = router;
