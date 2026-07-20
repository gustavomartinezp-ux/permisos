const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos } = require('../middleware/rbac');
const { encolar } = require('../workers/reporteWorker');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

const puedeGenerarReportes = (req, res, next) => {
  const legacyOk = ['admin', 'supervisor'].includes(req.usuario.rol);
  const permisoOk = (req.usuario.permisos || []).some((p) =>
    ['reportes.ver_globales', 'reportes.ver_operativos', 'auditoria.ver_todo'].includes(p)
  );
  if (legacyOk || permisoOk) return next();
  return res.status(403).json({ error: 'Acceso restringido a supervisores, administradores y roles con acceso a reportes' });
};

const TIPOS_VALIDOS = ['permisos'];

// Crear tarea de reporte — responde 202 de inmediato, el worker procesa aparte.
router.post('/', puedeGenerarReportes, async (req, res) => {
  const { report_type, formato, filtros } = req.body;
  if (!TIPOS_VALIDOS.includes(report_type)) {
    return res.status(400).json({ error: 'Tipo de reporte inválido' });
  }
  if (!['pdf', 'excel'].includes(formato)) {
    return res.status(400).json({ error: 'Formato inválido' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO report_tasks (usuario_id, report_type, formato, filtros)
       VALUES ($1, $2, $3, $4)
       RETURNING id, report_type, formato, status, created_at`,
      [req.usuario.id, report_type, formato, JSON.stringify(filtros || {})]
    );
    const tarea = rows[0];
    encolar(tarea.id);
    res.status(202).json(tarea);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la tarea de reporte' });
  }
});

// Centro de Descargas: tareas propias no vencidas, más recientes primero.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, report_type, formato, status, archivo_nombre, error_message,
              created_at, completed_at, expires_at
       FROM report_tasks
       WHERE usuario_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar tareas de reporte' });
  }
});

// Descargar el archivo generado (solo el dueño de la tarea).
router.get('/:id/descargar', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM report_tasks WHERE id = $1 AND usuario_id = $2`,
      [req.params.id, req.usuario.id]
    );
    const tarea = rows[0];
    if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (tarea.status !== 'COMPLETED') {
      return res.status(409).json({ error: 'El reporte aún no está listo', status: tarea.status });
    }
    const contentType = tarea.formato === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${tarea.archivo_nombre}"`);
    res.send(tarea.archivo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al descargar el reporte' });
  }
});

module.exports = router;
