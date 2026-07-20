const { pool } = require('../db');
const { generarExcelEjecutivo } = require('../reportes/excelEjecutivo');
const { generarPdfEjecutivo } = require('../reportes/pdfEjecutivo');

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

const GENERADORES = {
  permisos: generarReportePermisos,
};

module.exports = { encolar };
