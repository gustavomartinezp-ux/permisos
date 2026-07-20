const { pool } = require('../db');
const { generarExcelEjecutivo } = require('../reportes/excelEjecutivo');
const { generarPdfEjecutivo } = require('../reportes/pdfEjecutivo');
const { SECTORES_VALIDOS, AREAS_VALIDAS } = require('../config/catalogos');

// Genera el archivo (PDF o Excel) a partir de un paquete ya armado de
// kpis/columnas/filas — evita repetir el switch formato==='excel' en cada
// generador de reporte.
async function empaquetar({ titulo, filtrosTexto, kpis, columnas, filas, totalesKeys = [], generadoPor, formato, prefijoArchivo }) {
  const fecha = new Date().toISOString().split('T')[0];
  if (formato === 'excel') {
    const buffer = await generarExcelEjecutivo({
      titulo,
      subtitulo: `Generado: ${new Date().toLocaleString('es-CL')}${filtrosTexto ? ' · ' + filtrosTexto : ''}`,
      kpis, columnas, filas, totalesKeys,
    });
    return { buffer, nombreArchivo: `${prefijoArchivo}_${fecha}.xlsx` };
  }
  const buffer = await generarPdfEjecutivo({
    titulo, filtrosTexto: filtrosTexto || 'Sin filtros', kpis, columnas, filas, generadoPor,
  });
  return { buffer, nombreArchivo: `${prefijoArchivo}_${fecha}.pdf` };
}

// Resuelve el scope sector/área de un supervisor, para reutilizar en los
// reportes "preconcebidos" que no tienen filtros propios de usuario.
async function scopeSupervisor(usuarioId) {
  const { rows } = await pool.query('SELECT rol, sector, area, email FROM usuarios WHERE id = $1', [usuarioId]);
  const u = rows[0] || {};
  let sector = null, area = null;
  if (u.rol === 'supervisor') {
    if (SECTORES_VALIDOS.includes(u.sector)) sector = u.sector;
    else if (AREAS_VALIDAS.includes(u.area)) area = u.area;
  }
  return { ...u, sector, area };
}

// Cola in-process, sin Redis/BullMQ: suficiente para el volumen de este
// sistema (~230 funcionarios). Procesa una tarea a la vez para no saturar
// el pool de conexiones a Postgres; el request HTTP que crea la tarea ya
// respondió 202 antes de que esto empiece a correr (ver routes/reporte-tareas.js).
const cola = [];
let procesando = false;

function encolar(taskId) {
  cola.push(taskId);
  procesarSiguiente();
}

function procesarSiguiente() {
  if (procesando) return;
  const taskId = cola.shift();
  if (taskId === undefined) return;
  procesando = true;
  procesarTarea(taskId)
    .catch(async (err) => {
      console.error(`[reporteWorker] Error en tarea ${taskId}:`, err);
      await pool.query(
        `UPDATE report_tasks SET status='FAILED', error_message=$1, completed_at=NOW() WHERE id=$2`,
        [String(err.message || 'Error desconocido').slice(0, 500), taskId]
      ).catch(() => {});
    })
    .finally(() => {
      procesando = false;
      if (cola.length) setImmediate(procesarSiguiente);
    });
}

async function procesarTarea(taskId) {
  const { rows } = await pool.query('SELECT * FROM report_tasks WHERE id = $1', [taskId]);
  const tarea = rows[0];
  if (!tarea) return;

  await pool.query(`UPDATE report_tasks SET status = 'PROCESSING' WHERE id = $1`, [taskId]);

  const generador = GENERADORES[tarea.report_type];
  if (!generador) throw new Error(`Tipo de reporte desconocido: ${tarea.report_type}`);

  const { buffer, nombreArchivo } = await generador(tarea.filtros || {}, tarea.formato, tarea.usuario_id);

  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 días
  await pool.query(
    `UPDATE report_tasks
     SET status = 'COMPLETED', archivo = $1, archivo_nombre = $2,
         completed_at = NOW(), expires_at = $3
     WHERE id = $4`,
    [buffer, nombreArchivo, expiresAt, taskId]
  );

  // Limpieza oportunista de tareas vencidas — no hay cron dedicado.
  pool.query(`DELETE FROM report_tasks WHERE expires_at < NOW()`).catch(() => {});
}

// ─── Generador: Reporte de Permisos ──────────────────────────────────────────
// Reutiliza los mismos filtros que GET /api/reportes/permisos.
async function generarReportePermisos(filtros, formato, usuarioId) {
  const params = [];
  const where = ['1=1'];
  const { fecha_inicio, fecha_fin, tipo_permiso_id, estado, sector } = filtros;

  if (fecha_inicio)    { params.push(fecha_inicio); where.push(`s.fecha_inicio >= $${params.length}`); }
  if (fecha_fin)       { params.push(fecha_fin);    where.push(`s.fecha_fin <= $${params.length}`); }
  if (tipo_permiso_id) { params.push(parseInt(tipo_permiso_id)); where.push(`s.tipo_permiso_id = $${params.length}`); }
  if (estado)          { params.push(estado);       where.push(`s.estado = $${params.length}`); }
  if (sector)          { params.push(sector);       where.push(`f.sector = $${params.length}`); }

  const { rows: usuarioRows } = await pool.query('SELECT rol, sector, area, email FROM usuarios WHERE id = $1', [usuarioId]);
  const u = usuarioRows[0] || {};
  if (u.rol === 'supervisor') {
    if (u.sector) { params.push(u.sector); where.push(`f.sector = $${params.length}`); }
    else if (u.area) { params.push(u.area); where.push(`f.area = $${params.length}`); }
  }

  const { rows } = await pool.query(
    `SELECT s.id, s.fecha_inicio, s.fecha_fin, s.dias_solicitados, s.estado,
            f.nombres, f.apellidos, f.rut, f.cargo, f.sector,
            tp.nombre AS tipo_permiso
     FROM solicitudes s
     JOIN funcionarios f ON s.funcionario_id = f.id
     JOIN tipos_permisos tp ON s.tipo_permiso_id = tp.id
     WHERE ${where.join(' AND ')}
     ORDER BY s.fecha_inicio DESC
     LIMIT 5000`,
    params
  );

  const total = rows.length;
  const aprobados = rows.filter((r) => r.estado === 'aprobado').length;
  const diasUtilizados = rows
    .filter((r) => r.estado === 'aprobado')
    .reduce((acc, r) => acc + (r.dias_solicitados || 0), 0);
  const pctAprobados = total ? aprobados / total : 0;

  const kpis = [
    { label: 'Total Solicitudes', valor: String(total), valorNumerico: total },
    { label: '% Aprobados', valor: `${(pctAprobados * 100).toFixed(1)}%`, valorNumerico: pctAprobados, formato: 'porcentaje' },
    { label: 'Días Utilizados', valor: String(diasUtilizados), valorNumerico: diasUtilizados },
  ];

  // Anchos relativos (se escalan al ancho de página en el PDF; en el Excel
  // se recalculan por contenido real vía autoAjustarColumnas). "Desde"/"Hasta"
  // necesitan suficiente ancho para "dd-mm-aaaa" (10 caracteres) sin envolver.
  const columnas = [
    { key: 'nombre_completo', header: 'Funcionario', width: 125 },
    { key: 'rut',             header: 'RUT',         width: 70 },
    { key: 'cargo',           header: 'Cargo',       width: 95 },
    { key: 'sector',          header: 'Sector',      width: 55 },
    { key: 'tipo_permiso',    header: 'Tipo Permiso',width: 85 },
    { key: 'fecha_inicio',    header: 'Desde',       width: 85, formato: 'fecha' },
    { key: 'fecha_fin',       header: 'Hasta',       width: 85, formato: 'fecha' },
    { key: 'dias_solicitados',header: 'Días',        width: 40, formato: 'entero' },
    { key: 'estado',          header: 'Estado',      width: 70 },
  ];

  const filas = rows.map((r) => ({ ...r, nombre_completo: `${r.apellidos} ${r.nombres}` }));

  const filtrosTexto = Object.entries(filtros)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ') || 'Sin filtros';

  const fecha = new Date().toISOString().split('T')[0];

  if (formato === 'excel') {
    const buffer = await generarExcelEjecutivo({
      titulo: 'Reporte de Permisos',
      subtitulo: `Generado: ${new Date().toLocaleString('es-CL')} · Filtros: ${filtrosTexto}`,
      kpis,
      columnas,
      filas,
      totalesKeys: ['dias_solicitados'],
    });
    return { buffer, nombreArchivo: `reporte_permisos_${fecha}.xlsx` };
  }

  const buffer = await generarPdfEjecutivo({
    titulo: 'Reporte Ejecutivo de Permisos',
    filtrosTexto,
    kpis,
    columnas,
    filas,
    generadoPor: u.email || '',
  });
  return { buffer, nombreArchivo: `reporte_permisos_${fecha}.pdf` };
}

// ─── Generador: Ausentismo (180 días) ────────────────────────────────────────
// Reutiliza la misma lógica de GET /api/reportes/ausentismo.
async function generarReporteAusentismo(filtros, formato, usuarioId) {
  const u = await scopeSupervisor(usuarioId);
  const params = [];
  const sw = u.sector
    ? (params.push(u.sector), `AND f.sector = $${params.length}`)
    : u.area
    ? (params.push(u.area), `AND f.area = $${params.length}`)
    : '';

  const [porFuncionario, resumen] = await Promise.all([
    pool.query(
      `SELECT f.nombres, f.apellidos, f.rut, f.cargo, f.sector,
              COUNT(s.id)::int AS total_solicitudes,
              COALESCE(SUM(s.dias_solicitados),0)::int AS total_dias
       FROM funcionarios f
       JOIN solicitudes s ON s.funcionario_id = f.id
       WHERE s.estado='aprobado' AND s.fecha_inicio >= NOW()-INTERVAL '180 days' ${sw}
       GROUP BY f.id ORDER BY total_dias DESC LIMIT 50`, params
    ),
    pool.query(
      `SELECT COUNT(DISTINCT s.funcionario_id)::int AS funcionarios_ausentes,
              COALESCE(SUM(s.dias_solicitados),0)::int AS total_dias,
              COUNT(s.id)::int AS total_solicitudes
       FROM solicitudes s JOIN funcionarios f ON s.funcionario_id = f.id
       WHERE s.estado='aprobado' AND s.fecha_inicio >= NOW()-INTERVAL '180 days' ${sw}`, params
    ),
  ]);
  const r = resumen.rows[0];

  const kpis = [
    { label: 'Funcionarios Ausentes', valor: String(r.funcionarios_ausentes), valorNumerico: r.funcionarios_ausentes },
    { label: 'Total Solicitudes', valor: String(r.total_solicitudes), valorNumerico: r.total_solicitudes },
    { label: 'Total Días', valor: String(r.total_dias), valorNumerico: r.total_dias },
  ];
  const columnas = [
    { key: 'nombre_completo', header: 'Funcionario', width: 140 },
    { key: 'rut',             header: 'RUT',         width: 75 },
    { key: 'cargo',           header: 'Cargo',       width: 110 },
    { key: 'sector',          header: 'Sector',      width: 65 },
    { key: 'total_solicitudes', header: 'N° Solicitudes', width: 70, formato: 'entero' },
    { key: 'total_dias',      header: 'Total Días', width: 60, formato: 'entero' },
  ];
  const filas = porFuncionario.rows.map((f) => ({ ...f, nombre_completo: `${f.apellidos} ${f.nombres}` }));

  return empaquetar({
    titulo: 'Ausentismo — Últimos 180 días',
    filtrosTexto: u.sector ? `Sector: ${u.sector}` : u.area ? `Área: ${u.area}` : '',
    kpis, columnas, filas, totalesKeys: ['total_dias', 'total_solicitudes'],
    generadoPor: u.email || '', formato, prefijoArchivo: 'reporte_ausentismo',
  });
}

// ─── Generador: Balance General de Saldos ────────────────────────────────────
async function generarReporteBalanceSaldos(filtros, formato, usuarioId) {
  const u = await scopeSupervisor(usuarioId);
  const anio = parseInt(filtros.anio) || new Date().getFullYear();
  const params = [anio];
  const sw = u.sector
    ? (params.push(u.sector), `AND f.sector = $${params.length}`)
    : u.area
    ? (params.push(u.area), `AND f.area = $${params.length}`)
    : '';

  const { rows } = await pool.query(
    `SELECT f.nombres, f.apellidos, f.rut, f.sector, tp.nombre AS tipo_permiso,
            sf.dias_asignados, sf.dias_usados, sf.dias_pendientes,
            (sf.dias_asignados - sf.dias_usados - sf.dias_pendientes) AS disponible
     FROM saldos_funcionarios sf
     JOIN funcionarios f ON sf.funcionario_id = f.id
     JOIN tipos_permisos tp ON sf.tipo_permiso_id = tp.id
     WHERE sf.anio = $1 AND tp.activo = TRUE AND tp.es_especial = FALSE AND f.activo = TRUE ${sw}
     ORDER BY f.apellidos, f.nombres, tp.nombre
     LIMIT 5000`, params
  );

  const total = rows.length;
  const criticos = rows.filter((r) => r.disponible <= 1).length;
  const promedioDisponible = total ? rows.reduce((a, r) => a + r.disponible, 0) / total : 0;

  const kpis = [
    { label: 'Saldos Registrados', valor: String(total), valorNumerico: total },
    { label: 'Saldos Críticos (≤1 día)', valor: String(criticos), valorNumerico: criticos },
    { label: 'Promedio Disponible', valor: promedioDisponible.toFixed(1), valorNumerico: promedioDisponible },
  ];
  const columnas = [
    { key: 'nombre_completo', header: 'Funcionario', width: 130 },
    { key: 'rut',             header: 'RUT',         width: 75 },
    { key: 'sector',          header: 'Sector',      width: 60 },
    { key: 'tipo_permiso',    header: 'Tipo Permiso',width: 100 },
    { key: 'dias_asignados',  header: 'Asignados',  width: 55, formato: 'entero' },
    { key: 'dias_usados',     header: 'Usados',     width: 55, formato: 'entero' },
    { key: 'disponible',      header: 'Disponible', width: 60, formato: 'entero' },
  ];
  const filas = rows.map((r) => ({ ...r, nombre_completo: `${r.apellidos} ${r.nombres}` }));

  return empaquetar({
    titulo: `Balance General de Saldos ${anio}`,
    filtrosTexto: u.sector ? `Sector: ${u.sector}` : u.area ? `Área: ${u.area}` : '',
    kpis, columnas, filas, totalesKeys: ['dias_asignados', 'dias_usados', 'disponible'],
    generadoPor: u.email || '', formato, prefijoArchivo: 'balance_saldos',
  });
}

// ─── Generador: Dotación de Funcionarios ─────────────────────────────────────
async function generarReporteFuncionarios(filtros, formato, usuarioId) {
  const u = await scopeSupervisor(usuarioId);
  const params = [];
  const sw = u.sector
    ? (params.push(u.sector), `AND f.sector = $${params.length}`)
    : u.area
    ? (params.push(u.area), `AND f.area = $${params.length}`)
    : '';

  const { rows } = await pool.query(
    `SELECT f.nombres, f.apellidos, f.rut, f.cargo, f.sector, f.area,
            f.tipo_contrato, f.horas_contrato, f.fecha_ingreso
     FROM funcionarios f
     WHERE f.activo = TRUE ${sw}
     ORDER BY f.apellidos, f.nombres
     LIMIT 5000`, params
  );

  const total = rows.length;
  const conContrato = rows.filter((r) => r.tipo_contrato).length;
  const horasPromedio = total ? rows.reduce((a, r) => a + (r.horas_contrato || 0), 0) / total : 0;

  const kpis = [
    { label: 'Funcionarios Activos', valor: String(total), valorNumerico: total },
    { label: 'Con Contrato Registrado', valor: String(conContrato), valorNumerico: conContrato },
    { label: 'Horas Contrato Promedio', valor: horasPromedio.toFixed(1), valorNumerico: horasPromedio },
  ];
  const columnas = [
    { key: 'nombre_completo', header: 'Funcionario', width: 135 },
    { key: 'rut',             header: 'RUT',         width: 75 },
    { key: 'cargo',           header: 'Cargo',       width: 110 },
    { key: 'sector',          header: 'Sector',      width: 60 },
    { key: 'area',            header: 'Área',        width: 90 },
    { key: 'tipo_contrato',   header: 'Contrato',    width: 85 },
    { key: 'horas_contrato',  header: 'Hrs.',        width: 40, formato: 'entero' },
    { key: 'fecha_ingreso',   header: 'Ingreso',     width: 80, formato: 'fecha' },
  ];
  const filas = rows.map((r) => ({ ...r, nombre_completo: `${r.apellidos} ${r.nombres}` }));

  return empaquetar({
    titulo: 'Dotación de Funcionarios',
    filtrosTexto: u.sector ? `Sector: ${u.sector}` : u.area ? `Área: ${u.area}` : '',
    kpis, columnas, filas, totalesKeys: ['horas_contrato'],
    generadoPor: u.email || '', formato, prefijoArchivo: 'dotacion_funcionarios',
  });
}

// ─── Generador: Resumen Ejecutivo General ────────────────────────────────────
async function generarReporteEstadisticas(filtros, formato, usuarioId) {
  const u = await scopeSupervisor(usuarioId);
  const anio = parseInt(filtros.anio) || new Date().getFullYear();
  const params = [anio];
  const sw = u.sector
    ? (params.push(u.sector), `AND f.sector = $${params.length}`)
    : u.area
    ? (params.push(u.area), `AND f.area = $${params.length}`)
    : '';
  const joinF = u.sector || u.area ? 'JOIN funcionarios f ON s.funcionario_id = f.id' : '';

  const [funcRes, estRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE f.activo=TRUE) AS activos,
              COUNT(*) FILTER (WHERE f.activo=FALSE) AS inactivos
       FROM funcionarios f ${u.sector || u.area ? `WHERE ${u.sector ? 'f.sector' : 'f.area'} = $1` : ''}`,
      u.sector || u.area ? [u.sector || u.area] : []
    ),
    pool.query(
      `SELECT estado, COUNT(*)::int AS total
       FROM solicitudes s ${joinF}
       WHERE EXTRACT(YEAR FROM s.fecha_inicio) = $1 ${sw}
       GROUP BY estado ORDER BY estado`, params
    ),
  ]);

  const activos = parseInt(funcRes.rows[0]?.activos || 0);
  const inactivos = parseInt(funcRes.rows[0]?.inactivos || 0);
  const totalSolicitudes = estRes.rows.reduce((a, r) => a + r.total, 0);

  const kpis = [
    { label: 'Funcionarios Activos', valor: String(activos), valorNumerico: activos },
    { label: 'Funcionarios Inactivos', valor: String(inactivos), valorNumerico: inactivos },
    { label: `Solicitudes ${anio}`, valor: String(totalSolicitudes), valorNumerico: totalSolicitudes },
  ];
  const columnas = [
    { key: 'estado', header: 'Estado',   width: 100 },
    { key: 'total',  header: 'Cantidad', width: 80, formato: 'entero' },
  ];

  return empaquetar({
    titulo: `Resumen Ejecutivo General ${anio}`,
    filtrosTexto: u.sector ? `Sector: ${u.sector}` : u.area ? `Área: ${u.area}` : '',
    kpis, columnas, filas: estRes.rows, totalesKeys: ['total'],
    generadoPor: u.email || '', formato, prefijoArchivo: 'resumen_ejecutivo',
  });
}

const GENERADORES = {
  permisos: generarReportePermisos,
  ausentismo: generarReporteAusentismo,
  balance_saldos: generarReporteBalanceSaldos,
  funcionarios: generarReporteFuncionarios,
  estadisticas: generarReporteEstadisticas,
};

module.exports = { encolar };
