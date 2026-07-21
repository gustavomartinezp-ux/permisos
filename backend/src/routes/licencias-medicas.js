'use strict';

const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos, requierePermiso, esSoloAutoservicio } = require('../middleware/rbac');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

const diasCorridos = (fechaInicio, fechaFin) => {
  const MS_DIA = 1000 * 60 * 60 * 24;
  const a = new Date(`${fechaInicio}T12:00:00`);
  const b = new Date(`${fechaFin}T12:00:00`);
  return Math.round((b - a) / MS_DIA) + 1;
};

// Listado global — módulo exclusivo de RRHH/Secretaría. Filtro opcional por
// funcionario para buscar en la ficha o en el propio módulo.
router.get('/', requierePermiso('licencias_medicas.gestionar'), async (req, res) => {
  try {
    const params = [];
    let where = '1=1';
    if (req.query.funcionario_id) {
      params.push(req.query.funcionario_id);
      where += ` AND lm.funcionario_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT lm.*, f.nombres, f.apellidos, f.rut, f.cargo,
              u.email AS registrado_por_email
       FROM licencias_medicas lm
       JOIN funcionarios f ON f.id = lm.funcionario_id
       LEFT JOIN usuarios u ON u.id = lm.registrado_por
       WHERE ${where}
       ORDER BY lm.fecha_inicio DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener licencias médicas' });
  }
});

// Historial de un funcionario puntual — de solo lectura para el propio
// funcionario (su ficha) o para quien ya puede ver datos ajenos (mismo
// criterio que saldos.js); la escritura sigue exigiendo el permiso arriba.
router.get('/funcionario/:id', async (req, res) => {
  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != req.params.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, fecha_inicio, fecha_fin, dias, folio, entidad_emisora, observaciones, created_at
       FROM licencias_medicas
       WHERE funcionario_id = $1
       ORDER BY fecha_inicio DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener licencias médicas' });
  }
});

router.post('/', requierePermiso('licencias_medicas.gestionar'), async (req, res) => {
  const { funcionario_id, fecha_inicio, fecha_fin, folio, entidad_emisora, observaciones } = req.body;
  if (!funcionario_id || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Funcionario, fecha de inicio y fecha de fin son obligatorios' });
  }
  if (fecha_fin < fecha_inicio) {
    return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio' });
  }
  try {
    const dias = diasCorridos(fecha_inicio, fecha_fin);
    const { rows } = await pool.query(
      `INSERT INTO licencias_medicas
         (funcionario_id, fecha_inicio, fecha_fin, dias, folio, entidad_emisora, observaciones, registrado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [funcionario_id, fecha_inicio, fecha_fin, dias, folio || null, entidad_emisora || null, observaciones || null, req.usuario.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar la licencia médica' });
  }
});

router.put('/:id', requierePermiso('licencias_medicas.gestionar'), async (req, res) => {
  const { fecha_inicio, fecha_fin, folio, entidad_emisora, observaciones } = req.body;
  if (!fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Fecha de inicio y fecha de fin son obligatorias' });
  }
  if (fecha_fin < fecha_inicio) {
    return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio' });
  }
  try {
    const dias = diasCorridos(fecha_inicio, fecha_fin);
    const { rows } = await pool.query(
      `UPDATE licencias_medicas
       SET fecha_inicio=$1, fecha_fin=$2, dias=$3, folio=$4, entidad_emisora=$5, observaciones=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [fecha_inicio, fecha_fin, dias, folio || null, entidad_emisora || null, observaciones || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Licencia médica no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la licencia médica' });
  }
});

router.delete('/:id', requierePermiso('licencias_medicas.gestionar'), async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM licencias_medicas WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Licencia médica no encontrada' });
    res.json({ mensaje: 'Licencia médica eliminada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la licencia médica' });
  }
});

module.exports = router;
