'use strict';
const express = require('express');
const { pool } = require('../db');
const { verificarToken, soloAdmin, adminOSupervisor } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

const MOTIVOS_VALIDOS = [
  'licencia_medica', 'feriado_legal', 'permiso_administrativo',
  'permiso_sin_goce', 'vacancia', 'otro',
];

// Solo funcionarios con estos contratos pueden ser asignados como suplentes
const TIPOS_CONTRATO_SUPLENCIA_PERMITIDOS = ['Suplencia'];

// Helper: adjuntar prórrogas a un array de suplencias
async function adjuntarProrrogas(suplencias) {
  if (!suplencias.length) return suplencias;
  const ids = suplencias.map(s => s.id);
  const { rows } = await pool.query(
    `SELECT sp.*, uc.nombres AS creador_nombres, uc.apellidos AS creador_apellidos
     FROM suplencias_prorrogas sp
     LEFT JOIN usuarios u ON sp.creado_por = u.id
     LEFT JOIN funcionarios uc ON u.funcionario_id = uc.id
     WHERE sp.suplencia_id = ANY($1)
     ORDER BY sp.created_at ASC`,
    [ids]
  );
  const mapa = {};
  for (const p of rows) {
    if (!mapa[p.suplencia_id]) mapa[p.suplencia_id] = [];
    mapa[p.suplencia_id].push(p);
  }
  return suplencias.map(s => ({ ...s, prorrogas: mapa[s.id] || [] }));
}

// ─── GET /stats ───────────────────────────────────────────────────────────────
router.get('/stats', adminOSupervisor, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [activas, finalizadas, prorrogadas, proximas, vencidas] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM historial_suplencias WHERE estado = 'activa'`),
      pool.query(`SELECT COUNT(*) FROM historial_suplencias WHERE estado = 'finalizada'`),
      pool.query(`SELECT COUNT(*) FROM historial_suplencias WHERE estado = 'prorrogada'`),
      pool.query(
        `SELECT COUNT(*) FROM historial_suplencias
         WHERE estado IN ('activa','prorrogada')
           AND fecha_termino BETWEEN $1 AND $1::date + 14`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(*) FROM historial_suplencias
         WHERE estado IN ('activa','prorrogada') AND fecha_termino < $1`,
        [today]
      ),
    ]);
    res.json({
      activas:           parseInt(activas.rows[0].count),
      finalizadas:       parseInt(finalizadas.rows[0].count),
      prorrogadas:       parseInt(prorrogadas.rows[0].count),
      proximas_vencer:   parseInt(proximas.rows[0].count),
      vencidas_sin_cierre: parseInt(vencidas.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ─── GET /alertas ─────────────────────────────────────────────────────────────
router.get('/alertas', adminOSupervisor, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      `SELECT hs.*,
              f.nombres  AS suplente_nombres,  f.apellidos  AS suplente_apellidos,
              f.rut      AS suplente_rut,       f.sector     AS suplente_sector,
              remp.nombres AS reemplazado_nombres_fn,
              remp.apellidos AS reemplazado_apellidos_fn
       FROM historial_suplencias hs
       JOIN funcionarios f ON hs.funcionario_suplente_id = f.id
       LEFT JOIN funcionarios remp ON hs.funcionario_reemplazado_id = remp.id
       WHERE hs.estado IN ('activa','prorrogada')
         AND (hs.fecha_termino < $1 OR hs.fecha_termino BETWEEN $1 AND $1::date + 14)
       ORDER BY hs.fecha_termino ASC`,
      [today]
    );
    res.json(rows.map(r => ({
      ...r,
      tipo_alerta: r.fecha_termino < today ? 'vencida' : 'proxima',
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
});

// ─── GET /funcionario/:id ─────────────────────────────────────────────────────
router.get('/funcionario/:id', async (req, res) => {
  if (req.usuario.rol === 'funcionario' && req.usuario.funcionario_id != req.params.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT hs.*,
              remp.nombres   AS reemplazado_nombres_fn,
              remp.apellidos AS reemplazado_apellidos_fn,
              uc.nombres  AS creador_nombres,      uc.apellidos  AS creador_apellidos,
              ua.nombres  AS actualizador_nombres, ua.apellidos  AS actualizador_apellidos
       FROM historial_suplencias hs
       LEFT JOIN funcionarios remp   ON hs.funcionario_reemplazado_id = remp.id
       LEFT JOIN usuarios u_cr       ON hs.creado_por    = u_cr.id
       LEFT JOIN funcionarios uc     ON u_cr.funcionario_id = uc.id
       LEFT JOIN usuarios u_ac       ON hs.actualizado_por = u_ac.id
       LEFT JOIN funcionarios ua     ON u_ac.funcionario_id = ua.id
       WHERE hs.funcionario_suplente_id = $1
       ORDER BY hs.fecha_inicio DESC`,
      [req.params.id]
    );
    res.json(await adjuntarProrrogas(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener suplencias' });
  }
});

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get('/', adminOSupervisor, async (req, res) => {
  try {
    const params = [];
    const conds = ['1=1'];

    if (req.query.estado) {
      conds.push(`hs.estado = $${params.length + 1}`);
      params.push(req.query.estado);
    }
    if (req.query.funcionario_id) {
      conds.push(`hs.funcionario_suplente_id = $${params.length + 1}`);
      params.push(parseInt(req.query.funcionario_id));
    }
    if (req.query.unidad) {
      conds.push(`hs.unidad ILIKE $${params.length + 1}`);
      params.push(`%${req.query.unidad}%`);
    }
    if (req.query.q) {
      conds.push(
        `(f.nombres ILIKE $${params.length + 1} OR f.apellidos ILIKE $${params.length + 1}
          OR hs.nombre_reemplazado ILIKE $${params.length + 1}
          OR hs.cargo_reemplazado  ILIKE $${params.length + 1})`
      );
      params.push(`%${req.query.q}%`);
    }

    const { rows } = await pool.query(
      `SELECT hs.*,
              f.nombres  AS suplente_nombres,  f.apellidos  AS suplente_apellidos,
              f.rut      AS suplente_rut,       f.sector     AS suplente_sector,
              f.cargo    AS suplente_cargo,
              remp.nombres   AS reemplazado_nombres_fn,
              remp.apellidos AS reemplazado_apellidos_fn
       FROM historial_suplencias hs
       JOIN funcionarios f ON hs.funcionario_suplente_id = f.id
       LEFT JOIN funcionarios remp ON hs.funcionario_reemplazado_id = remp.id
       WHERE ${conds.join(' AND ')}
       ORDER BY hs.fecha_inicio DESC
       LIMIT 300`,
      params
    );
    res.json(await adjuntarProrrogas(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener suplencias' });
  }
});

// ─── GET /alertas-contractuales ───────────────────────────────────────────────
// IMPORTANTE: debe estar antes de GET /:id para que Express no lo capture como parámetro
router.get('/alertas-contractuales', adminOSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT hs.id, hs.estado, hs.fecha_inicio, hs.fecha_termino,
              hs.nombre_reemplazado, hs.cargo_reemplazado,
              f.nombres AS suplente_nombres, f.apellidos AS suplente_apellidos,
              f.rut AS suplente_rut, f.tipo_contrato
       FROM historial_suplencias hs
       JOIN funcionarios f ON hs.funcionario_suplente_id = f.id
       WHERE f.tipo_contrato IS DISTINCT FROM 'Suplencia'
       ORDER BY CASE WHEN hs.estado = 'activa' THEN 0 WHEN hs.estado = 'prorrogada' THEN 1 ELSE 2 END,
                hs.fecha_inicio DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener alertas contractuales' });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', adminOSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT hs.*,
              f.nombres  AS suplente_nombres,  f.apellidos  AS suplente_apellidos,
              f.rut      AS suplente_rut,
              remp.nombres   AS reemplazado_nombres_fn,
              remp.apellidos AS reemplazado_apellidos_fn,
              uc.nombres  AS creador_nombres,      uc.apellidos  AS creador_apellidos,
              ua.nombres  AS actualizador_nombres, ua.apellidos  AS actualizador_apellidos
       FROM historial_suplencias hs
       JOIN funcionarios f ON hs.funcionario_suplente_id = f.id
       LEFT JOIN funcionarios remp ON hs.funcionario_reemplazado_id = remp.id
       LEFT JOIN usuarios u_cr   ON hs.creado_por     = u_cr.id
       LEFT JOIN funcionarios uc ON u_cr.funcionario_id = uc.id
       LEFT JOIN usuarios u_ac   ON hs.actualizado_por  = u_ac.id
       LEFT JOIN funcionarios ua ON u_ac.funcionario_id  = ua.id
       WHERE hs.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Suplencia no encontrada' });
    const [result] = await adjuntarProrrogas(rows);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener suplencia' });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────
router.post('/', soloAdmin, async (req, res) => {
  const {
    funcionario_suplente_id, funcionario_reemplazado_id,
    rut_reemplazado, nombre_reemplazado,
    cargo_reemplazado, unidad, motivo_reemplazo,
    fecha_inicio, fecha_termino, observaciones, documento_respaldo,
  } = req.body;

  if (!funcionario_suplente_id) return res.status(400).json({ error: 'El funcionario suplente es obligatorio' });
  if (!cargo_reemplazado?.trim()) return res.status(400).json({ error: 'El cargo reemplazado es obligatorio' });
  if (!motivo_reemplazo || !MOTIVOS_VALIDOS.includes(motivo_reemplazo))
    return res.status(400).json({ error: 'Motivo de reemplazo inválido' });
  if (!fecha_inicio || !fecha_termino) return res.status(400).json({ error: 'Las fechas son obligatorias' });
  if (fecha_inicio > fecha_termino) return res.status(400).json({ error: 'La fecha de inicio debe ser anterior al término' });

  try {
    // ── Validación contractual: solo contratos autorizados pueden suplantar ──
    const suplente = await pool.query(
      `SELECT tipo_contrato, nombres, apellidos FROM funcionarios WHERE id = $1 AND activo = true`,
      [parseInt(funcionario_suplente_id)]
    );
    if (!suplente.rows.length) {
      return res.status(404).json({ error: 'Funcionario suplente no encontrado o inactivo' });
    }
    const tipoContrato = suplente.rows[0].tipo_contrato;
    if (!TIPOS_CONTRATO_SUPLENCIA_PERMITIDOS.includes(tipoContrato)) {
      return res.status(422).json({
        error: `Los funcionarios con calidad contractual "${tipoContrato || 'Planta/Indefinido'}" no pueden realizar suplencias ni ser asignados como reemplazantes. Solo están autorizados funcionarios con contrato de Suplencia.`,
        codigo: 'CONTRATO_NO_AUTORIZADO',
        tipo_contrato: tipoContrato,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO historial_suplencias
         (funcionario_suplente_id, funcionario_reemplazado_id, rut_reemplazado, nombre_reemplazado,
          cargo_reemplazado, unidad, motivo_reemplazo, fecha_inicio, fecha_termino,
          estado, observaciones, documento_respaldo, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'activa',$10,$11,$12)
       RETURNING *`,
      [
        parseInt(funcionario_suplente_id),
        funcionario_reemplazado_id ? parseInt(funcionario_reemplazado_id) : null,
        rut_reemplazado || null,
        nombre_reemplazado || null,
        cargo_reemplazado.trim(),
        unidad?.trim() || null,
        motivo_reemplazo,
        fecha_inicio,
        fecha_termino,
        observaciones?.trim() || null,
        documento_respaldo?.trim() || null,
        req.usuario.id,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar suplencia' });
  }
});

// ─── PATCH /:id/prorrogar ─────────────────────────────────────────────────────
router.patch('/:id/prorrogar', soloAdmin, async (req, res) => {
  const { nueva_fecha_termino, observaciones } = req.body;
  if (!nueva_fecha_termino) return res.status(400).json({ error: 'La nueva fecha de término es obligatoria' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM historial_suplencias WHERE id = $1 AND estado IN ('activa','prorrogada') FOR UPDATE`,
      [req.params.id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Suplencia no encontrada o ya finalizada' });
    }
    const s = rows[0];
    if (nueva_fecha_termino <= s.fecha_termino.toISOString().split('T')[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La nueva fecha debe ser posterior a la fecha de término actual' });
    }

    await client.query(
      `INSERT INTO suplencias_prorrogas
         (suplencia_id, fecha_termino_anterior, nueva_fecha_termino, observaciones, creado_por)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, s.fecha_termino, nueva_fecha_termino, observaciones?.trim() || null, req.usuario.id]
    );

    await client.query(
      `UPDATE historial_suplencias
       SET estado = 'prorrogada', fecha_termino = $1, actualizado_por = $2, updated_at = NOW()
       WHERE id = $3`,
      [nueva_fecha_termino, req.usuario.id, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Suplencia prorrogada correctamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al prorrogar suplencia' });
  } finally {
    client.release();
  }
});

// ─── PATCH /:id/finalizar ─────────────────────────────────────────────────────
router.patch('/:id/finalizar', soloAdmin, async (req, res) => {
  const { observaciones } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE historial_suplencias
       SET estado = 'finalizada',
           observaciones = COALESCE($1, observaciones),
           actualizado_por = $2,
           updated_at = NOW()
       WHERE id = $3 AND estado IN ('activa','prorrogada')
       RETURNING *`,
      [observaciones?.trim() || null, req.usuario.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Suplencia no encontrada o ya finalizada' });
    res.json({ mensaje: 'Suplencia finalizada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al finalizar suplencia' });
  }
});

module.exports = router;
