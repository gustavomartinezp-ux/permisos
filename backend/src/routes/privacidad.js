'use strict';
const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos, requierePermiso } = require('../middleware/rbac');

// Derechos del titular de datos personales (Ley 21.719): acceso y
// portabilidad (descarga de todos sus datos), y solicitudes de rectificación,
// supresión, oposición y bloqueo que responde RRHH dentro del plazo legal.
const router = express.Router();
router.use(verificarToken, cargarPermisos);

const TIPOS = ['acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad', 'bloqueo'];
const ESTADOS = ['pendiente', 'en_proceso', 'respondida', 'rechazada'];
// 30 días corridos desde la solicitud (prorrogables una vez por igual plazo)
const DIAS_PLAZO = 30;

const sinFuncionario = (req, res) => {
  if (req.usuario.funcionario_id) return false;
  res.status(400).json({ error: 'Su cuenta no está vinculada a un funcionario' });
  return true;
};

// ─── GET /mis-datos — todos los datos del titular, en JSON (portabilidad) ────
router.get('/mis-datos', async (req, res) => {
  if (sinFuncionario(req, res)) return;
  const fid = req.usuario.funcionario_id;
  const q = async (sql) => (await pool.query(sql, [fid])).rows;
  try {
    const [ficha] = await q(
      `SELECT f.*, d.nombre AS dispositivo, d2.nombre AS dispositivo_2, s.nombre AS servicio
       FROM funcionarios f
       LEFT JOIN dispositivos d ON d.id = f.dispositivo_id
       LEFT JOIN dispositivos d2 ON d2.id = f.dispositivo_id_2
       LEFT JOIN servicios s ON s.id = f.servicio_id
       WHERE f.id = $1`
    );
    const datos = {
      generado_en: new Date().toISOString(),
      responsable: 'Dirección de Administración de Salud de Talcahuano (DAS), Bulnes 266, Talcahuano',
      ficha,
      cuenta: await q(
        `SELECT u.email, u.rol, u.activo, u.created_at, u.email_verified_at,
                COALESCE(ARRAY_AGG(r.codigo) FILTER (WHERE r.codigo IS NOT NULL), '{}') AS roles
         FROM usuarios u
         LEFT JOIN user_roles ur ON ur.usuario_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE u.funcionario_id = $1
         GROUP BY u.id, u.email, u.rol, u.activo, u.created_at, u.email_verified_at`
      ),
      saldos: await q(
        `SELECT tp.nombre AS tipo, s.anio, s.dias_asignados, s.dias_usados, s.dias_pendientes,
                s.saldo_arrastre, s.arrastre_usados, s.arrastre_pendientes
         FROM saldos_funcionarios s JOIN tipos_permisos tp ON tp.id = s.tipo_permiso_id
         WHERE s.funcionario_id = $1 ORDER BY s.anio DESC, tp.nombre`
      ),
      solicitudes: await q(
        `SELECT s.id, tp.nombre AS tipo, s.fecha_inicio, s.fecha_fin, s.dias_solicitados, s.jornada_medio_dia,
                s.motivo, s.reemplazante, s.estado, s.fecha_solicitud, s.fecha_resolucion, s.observaciones,
                s.observaciones_supervisor, s.firma_solicitante_en
         FROM solicitudes s JOIN tipos_permisos tp ON tp.id = s.tipo_permiso_id
         WHERE s.funcionario_id = $1 ORDER BY s.fecha_inicio DESC`
      ),
      horas_compensatorias: await q(
        `SELECT fecha_realizacion, tipo_dia, horas_realizadas, factor_aplicado, horas_compensatorias, estado, observaciones, created_at
         FROM horas_compensatorias WHERE funcionario_id = $1 ORDER BY fecha_realizacion DESC`
      ),
      solicitudes_compensacion: await q(
        `SELECT id, fecha_inicio, fecha_fin, hora_inicio, horas_solicitadas, estado, motivo, observaciones,
                fecha_solicitud, fecha_resolucion
         FROM solicitudes_compensacion WHERE funcionario_id = $1 ORDER BY fecha_inicio DESC`
      ),
      cometidos_comisiones: await q(
        `SELECT tipo, origen, destino, motivo, fecha_inicio, fecha_fin, dias, estado, requiere_viatico,
                tipo_viatico, monto_viatico, created_at
         FROM cometidos_comisiones WHERE funcionario_id = $1 ORDER BY fecha_inicio DESC`
      ),
      licencias_medicas: await q(
        `SELECT fecha_inicio, fecha_fin, dias, folio, entidad_emisora, observaciones, created_at
         FROM licencias_medicas WHERE funcionario_id = $1 ORDER BY fecha_inicio DESC`
      ),
      suplencias: await q(
        `SELECT nombre_reemplazado, cargo_reemplazado, unidad, motivo_reemplazo, fecha_inicio, fecha_termino, estado
         FROM historial_suplencias
         WHERE funcionario_suplente_id = $1 OR funcionario_reemplazado_id = $1 ORDER BY fecha_inicio DESC`
      ),
      movimientos_saldo: await q(
        `SELECT h.created_at, tp.nombre AS tipo, h.tipo_movimiento, h.dias_movimiento, h.saldo_anterior,
                h.saldo_nuevo, h.descripcion
         FROM historial_movimientos h LEFT JOIN tipos_permisos tp ON tp.id = h.tipo_permiso_id
         WHERE h.funcionario_id = $1 ORDER BY h.created_at DESC`
      ),
      firmas: await q(
        `SELECT imagen, activa, created_at FROM firmas WHERE funcionario_id = $1 ORDER BY created_at DESC`
      ),
      solicitudes_de_derechos: await q(
        `SELECT tipo, detalle, estado, respuesta, plazo, respondido_en, created_at
         FROM derechos_solicitudes WHERE funcionario_id = $1 ORDER BY created_at DESC`
      ),
      // Quién consultó sus datos (destinatarios de la información)
      accesos_a_sus_datos: await q(
        `SELECT a.created_at, a.recurso, a.detalle,
                COALESCE(f.nombres || ' ' || f.apellidos, u.email) AS consultado_por
         FROM accesos_datos a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         LEFT JOIN funcionarios f ON f.id = u.funcionario_id
         WHERE a.funcionario_id = $1 AND a.recurso <> 'login'
         ORDER BY a.created_at DESC LIMIT 1000`
      ),
    };
    res.json(datos);
  } catch (err) {
    console.error('[privacidad] mis-datos:', err.message);
    res.status(500).json({ error: 'Error al reunir sus datos' });
  }
});

// ─── Solicitudes de derechos del propio titular ─────────────────────────────
router.get('/derechos/mias', async (req, res) => {
  if (sinFuncionario(req, res)) return;
  try {
    const { rows } = await pool.query(
      `SELECT id, tipo, detalle, estado, respuesta, plazo, respondido_en, created_at
       FROM derechos_solicitudes WHERE funcionario_id = $1 ORDER BY created_at DESC`,
      [req.usuario.funcionario_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[privacidad] derechos mias:', err.message);
    res.status(500).json({ error: 'Error al obtener sus solicitudes' });
  }
});

router.post('/derechos', async (req, res) => {
  if (sinFuncionario(req, res)) return;
  const { tipo } = req.body || {};
  const detalle = String(req.body?.detalle || '').trim();
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de solicitud inválido' });
  if (detalle.length < 5) return res.status(400).json({ error: 'Describa su solicitud' });
  if (detalle.length > 4000) return res.status(400).json({ error: 'La descripción es demasiado larga' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO derechos_solicitudes (funcionario_id, usuario_id, tipo, detalle, plazo)
       VALUES ($1, $2, $3, $4, (NOW() AT TIME ZONE 'America/Santiago')::date + $5::int)
       RETURNING id, tipo, detalle, estado, plazo, created_at`,
      [req.usuario.funcionario_id, req.usuario.id, tipo, detalle, DIAS_PLAZO]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[privacidad] derechos post:', err.message);
    res.status(500).json({ error: 'Error al registrar la solicitud' });
  }
});

// ─── Gestión (RRHH / TI) y auditoría ─────────────────────────────────────────
router.get('/derechos', requierePermiso('datos_personales.gestionar', 'datos_personales.auditar'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, f.nombres, f.apellidos, f.rut,
              rf.nombres || ' ' || rf.apellidos AS respondido_por_nombre
       FROM derechos_solicitudes d
       JOIN funcionarios f ON f.id = d.funcionario_id
       LEFT JOIN usuarios ru ON ru.id = d.respondido_por
       LEFT JOIN funcionarios rf ON rf.id = ru.funcionario_id
       ORDER BY (d.estado IN ('pendiente', 'en_proceso')) DESC, d.plazo ASC, d.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[privacidad] derechos:', err.message);
    res.status(500).json({ error: 'Error al obtener las solicitudes' });
  }
});

router.patch('/derechos/:id', requierePermiso('datos_personales.gestionar'), async (req, res) => {
  const { estado } = req.body || {};
  const respuesta = String(req.body?.respuesta || '').trim();
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  if (['respondida', 'rechazada'].includes(estado) && respuesta.length < 5) {
    return res.status(400).json({ error: 'Escriba la respuesta al titular' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE derechos_solicitudes
       SET estado = $1, respuesta = NULLIF($2, ''),
           respondido_por = $3,
           respondido_en = CASE WHEN $5 THEN NOW() ELSE NULL END
       WHERE id = $4 RETURNING *`,
      [estado, respuesta, req.usuario.id, parseInt(req.params.id), ['respondida', 'rechazada'].includes(estado)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[privacidad] derechos patch:', err.message);
    res.status(500).json({ error: 'Error al actualizar la solicitud' });
  }
});

// Registro de accesos: filtro por funcionario consultado, por usuario y por fecha
router.get('/accesos', requierePermiso('datos_personales.auditar'), async (req, res) => {
  const params = [];
  const cond = [];
  const filtro = (sql, valor) => { params.push(valor); cond.push(sql.replace('?', `$${params.length}`)); };
  if (req.query.funcionario_id) filtro('a.funcionario_id = ?', parseInt(req.query.funcionario_id));
  if (req.query.usuario_id) filtro('a.usuario_id = ?', parseInt(req.query.usuario_id));
  if (req.query.recurso) filtro('a.recurso = ?', String(req.query.recurso));
  if (req.query.desde) filtro("a.created_at >= (?::date AT TIME ZONE 'America/Santiago')", String(req.query.desde));
  if (req.query.hasta) filtro("a.created_at < ((?::date + 1) AT TIME ZONE 'America/Santiago')", String(req.query.hasta));
  if (req.query.buscar) {
    filtro(`(uf.nombres || ' ' || uf.apellidos ILIKE ? OR tf.nombres || ' ' || tf.apellidos ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`, `%${req.query.buscar}%`);
  }
  params.push(Math.min(parseInt(req.query.limit) || 300, 2000));
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.created_at, a.recurso, a.detalle, a.ip, a.funcionario_id, a.usuario_id,
              COALESCE(uf.nombres || ' ' || uf.apellidos, u.email) AS usuario,
              tf.nombres || ' ' || tf.apellidos AS funcionario
       FROM accesos_datos a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN funcionarios uf ON uf.id = u.funcionario_id
       LEFT JOIN funcionarios tf ON tf.id = a.funcionario_id
       ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
       ORDER BY a.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[privacidad] accesos:', err.message);
    res.status(500).json({ error: 'Error al obtener el registro de accesos' });
  }
});

module.exports = router;
