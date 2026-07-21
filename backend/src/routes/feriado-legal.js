'use strict';

const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos, requierePermiso, esSoloAutoservicio } = require('../middleware/rbac');
const { mensajeHito } = require('../utils/antiguedad');
const { evaluarHitosAntiguedad } = require('../workers/antiguedadWorker');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

async function obtenerAlertas(funcionarioId) {
  // Solo hitos de hoy en adelante — evita mostrar el mensaje (redactado en
  // futuro: "cumplirá", "se agregarán") para hitos históricos ya resueltos
  // hace años, que quedarían leyéndose de forma confusa fuera de contexto.
  const { rows } = await pool.query(
    `SELECT h.id, h.tramo_anios, h.fecha_cumplimiento, h.dias_agregados, h.aplicado, h.aplicado_en,
            f.nombres, f.apellidos
     FROM hitos_antiguedad h
     JOIN funcionarios f ON f.id = h.funcionario_id
     WHERE h.funcionario_id = $1
       AND h.fecha_cumplimiento >= CURRENT_DATE
     ORDER BY h.fecha_cumplimiento DESC`,
    [funcionarioId]
  );
  return rows.map((r) => ({
    id: r.id,
    tramo_anios: r.tramo_anios,
    fecha_cumplimiento: r.fecha_cumplimiento,
    dias_agregados: r.dias_agregados,
    aplicado: r.aplicado,
    aplicado_en: r.aplicado_en,
    mensaje: mensajeHito({
      nombreCompleto: `${r.nombres} ${r.apellidos}`,
      fechaCumplimiento: r.fecha_cumplimiento,
      tramoAnios: r.tramo_anios,
    }),
  }));
}

// Alertas del propio funcionario logueado.
router.get('/alertas', async (req, res) => {
  if (!req.usuario.funcionario_id) return res.json([]);
  try {
    res.json(await obtenerAlertas(req.usuario.funcionario_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener alertas de antigüedad' });
  }
});

// Alertas de un funcionario puntual (ficha) — mismo criterio de acceso que saldos.js.
router.get('/alertas/:funcionarioId', async (req, res) => {
  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != req.params.funcionarioId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    res.json(await obtenerAlertas(req.params.funcionarioId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener alertas de antigüedad' });
  }
});

// Disparo manual del barrido (además del automático por intervalo en server.js)
// — útil para forzar una verificación inmediata sin esperar al próximo ciclo.
router.post('/verificar-hitos', requierePermiso('saldos.ajustar'), async (req, res) => {
  try {
    const resultado = await evaluarHitosAntiguedad();
    res.json({ mensaje: 'Verificación de hitos de antigüedad completada', ...resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al verificar hitos de antigüedad' });
  }
});

module.exports = router;
