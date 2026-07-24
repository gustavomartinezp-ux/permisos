'use strict';

const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');
const { cargarPermisos, requierePermiso, noAutoAprobacion, esSoloAutoservicio, tieneVisibilidadGlobal } = require('../middleware/rbac');
const { diasCorridos, validarLimiteComision } = require('../utils/cometidosComisiones');

const router = express.Router();
router.use(verificarToken, cargarPermisos);

// ─── Listado — mismo criterio de scope que solicitudes.js ─────────────────────
router.get('/', async (req, res) => {
  try {
    const { estado, tipo, funcionario_id } = req.query;
    const where = ['1=1'];
    const params = [];

    if (esSoloAutoservicio(req)) {
      params.push(req.usuario.funcionario_id);
      where.push(`cc.funcionario_id = $${params.length}`);
    } else {
      if (funcionario_id) {
        params.push(funcionario_id);
        where.push(`cc.funcionario_id = $${params.length}`);
      }
      if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
        if (req.usuario.sector) {
          params.push(req.usuario.sector);
          where.push(`f.sector = $${params.length}`);
        } else if (req.usuario.area) {
          params.push(req.usuario.area);
          where.push(`f.area = $${params.length}`);
        }
      }
    }
    if (estado) { params.push(estado); where.push(`cc.estado = $${params.length}`); }
    if (tipo)   { params.push(tipo);   where.push(`cc.tipo = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT cc.*, f.nombres, f.apellidos, f.rut, f.cargo, f.sector, f.area
       FROM cometidos_comisiones cc
       JOIN funcionarios f ON f.id = cc.funcionario_id
       WHERE ${where.join(' AND ')}
       ORDER BY cc.fecha_inicio DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener cometidos y comisiones' });
  }
});

// Días de Comisión de Servicio ya acumulados este año — para que el
// formulario muestre el límite disponible antes de enviar la solicitud.
router.get('/limite-comision/:funcionarioId', async (req, res) => {
  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != req.params.funcionarioId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const { valido, dias_acumulados, dias_disponibles } = await validarLimiteComision(pool, {
      funcionarioId: req.params.funcionarioId, anio, diasSolicitud: 0,
    });
    res.json({ anio, dias_acumulados, dias_disponibles, valido });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular el límite de comisión' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cc.*, f.nombres, f.apellidos, f.rut, f.cargo, f.sector, f.area
       FROM cometidos_comisiones cc JOIN funcionarios f ON f.id = cc.funcionario_id
       WHERE cc.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    if (esSoloAutoservicio(req) && req.usuario.funcionario_id != rows[0].funcionario_id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el detalle' });
  }
});

// ─── Crear ──────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    tipo, funcionario_id, origen, destino, motivo, fecha_inicio, fecha_fin,
    sale_de_comuna, sale_de_region, requiere_movilizacion, monto_movilizacion, vehiculo_institucional,
    pernocta, decreto_asociado, documento_respaldo,
    requiere_viatico, tipo_viatico, monto_viatico,
  } = req.body;

  if (!['cometido', 'comision'].includes(tipo)) {
    return res.status(400).json({ error: 'El tipo debe ser "cometido" o "comision"' });
  }
  if (!funcionario_id || !origen || !destino || !motivo || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if (fecha_fin < fecha_inicio) {
    return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio' });
  }
  if (esSoloAutoservicio(req) && req.usuario.funcionario_id != funcionario_id) {
    return res.status(403).json({ error: 'Solo puedes solicitar para ti mismo' });
  }

  const dias = diasCorridos(fecha_inicio, fecha_fin);

  // Reglas de negocio del tipo:
  // - Cometido: viático solo si sale de la comuna o región.
  // - Comisión: exige decreto/resolución y define viático completo/parcial según pernocte.
  const esCometido = tipo === 'cometido';
  const viaticoAplicable = esCometido
    ? !!(sale_de_comuna || sale_de_region)
    : !!requiere_viatico;
  const tipoViaticoFinal = esCometido ? null : (pernocta ? 'completo' : 'parcial');

  if (tipo === 'comision' && !decreto_asociado) {
    return res.status(400).json({ error: 'La Comisión de Servicio requiere N° de Decreto Alcaldicio o Resolución Exenta asociado' });
  }

  try {
    let limite = null;
    if (tipo === 'comision') {
      const anio = new Date(`${fecha_inicio}T12:00:00`).getFullYear();
      limite = await validarLimiteComision(pool, { funcionarioId: funcionario_id, anio, diasSolicitud: dias });
      if (!limite.valido) {
        return res.status(400).json({ error: limite.error, ...limite });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO cometidos_comisiones
         (tipo, funcionario_id, origen, destino, motivo, fecha_inicio, fecha_fin, dias,
          sale_de_comuna, sale_de_region, requiere_movilizacion, monto_movilizacion, vehiculo_institucional,
          pernocta, decreto_asociado, documento_respaldo,
          requiere_viatico, tipo_viatico, monto_viatico, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        tipo, funcionario_id, origen, destino, motivo, fecha_inicio, fecha_fin, dias,
        !!sale_de_comuna, !!sale_de_region, !!requiere_movilizacion, monto_movilizacion || null, vehiculo_institucional || null,
        !!pernocta, decreto_asociado || null, documento_respaldo || null,
        viaticoAplicable, tipoViaticoFinal, monto_viatico || null, req.usuario.id,
      ]
    );
    res.status(201).json({ ...rows[0], limite_comision: limite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar la solicitud' });
  }
});

// ─── Aprobar jefatura (Supervisor de sector/área) ──────────────────────────────
router.patch('/:id/aprobar-jefatura', requierePermiso('solicitudes.pre_aprobar', 'solicitudes.aprobar'), async (req, res) => {
  if (req.usuario.rol === 'admin') {
    return res.status(400).json({ error: 'El administrador debe usar la aprobación de dirección, no la de jefatura' });
  }
  try {
    const check = await pool.query(
      `SELECT cc.id, cc.funcionario_id, f.sector, f.area
       FROM cometidos_comisiones cc JOIN funcionarios f ON f.id = cc.funcionario_id
       WHERE cc.id = $1 AND cc.estado = 'pendiente'`,
      [req.params.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    const sol = check.rows[0];

    if (noAutoAprobacion(sol.funcionario_id, req)) {
      return res.status(403).json({ error: 'No puede aprobar su propia solicitud' });
    }

    if (!tieneVisibilidadGlobal(req)) {
      const scope = req.usuario.scopeEfectivo || { sector: req.usuario.sector, area: req.usuario.area };
      if (scope.sector && sol.sector !== scope.sector) {
        return res.status(403).json({ error: 'No puede aprobar solicitudes de otro sector' });
      }
      if (!scope.sector && scope.area && sol.area !== scope.area) {
        return res.status(403).json({ error: 'No puede aprobar solicitudes de otra área' });
      }
    }

    await pool.query(
      `UPDATE cometidos_comisiones
       SET estado = 'aprobado_jefatura', aprobado_jefatura_por = $1, aprobado_jefatura_en = NOW()
       WHERE id = $2`,
      [req.usuario.id, req.params.id]
    );
    res.json({ mensaje: 'Aprobado por jefatura. Pendiente de aprobación de dirección.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al aprobar' });
  }
});

// ─── Aprobar dirección (aprobación final) ──────────────────────────────────────
router.patch('/:id/aprobar-direccion', requierePermiso('solicitudes.aprobar'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sol = await client.query(
      `SELECT * FROM cometidos_comisiones WHERE id = $1 AND estado IN ('pendiente','aprobado_jefatura') FOR UPDATE`,
      [req.params.id]
    );
    if (sol.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    }
    const s = sol.rows[0];

    if (noAutoAprobacion(s.funcionario_id, req)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puede aprobar su propia solicitud' });
    }

    // Límite legal: se re-valida en la aprobación final, que es el momento
    // en que de verdad se compromete el cupo anual de la persona.
    if (s.tipo === 'comision') {
      const anio = new Date(s.fecha_inicio).getFullYear();
      const limite = await validarLimiteComision(client, {
        funcionarioId: s.funcionario_id, anio, diasSolicitud: s.dias, excludeId: s.id,
      });
      if (!limite.valido) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: limite.error, ...limite });
      }
    }

    await client.query(
      `UPDATE cometidos_comisiones
       SET estado = 'aprobado_direccion', aprobado_direccion_por = $1, aprobado_direccion_en = NOW()
       WHERE id = $2`,
      [req.usuario.id, req.params.id]
    );
    await client.query('COMMIT');
    res.json({ mensaje: 'Solicitud aprobada por dirección' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al aprobar' });
  } finally {
    client.release();
  }
});

// ─── Rechazar (en cualquier etapa pendiente) ───────────────────────────────────
router.patch('/:id/rechazar', async (req, res) => {
  const puedeJefatura = req.usuario.rol === 'admin' || req.usuario.rol === 'supervisor'
    || (req.usuario.permisos || []).includes('solicitudes.pre_aprobar');
  const puedeDireccion = req.usuario.rol === 'admin' || (req.usuario.permisos || []).includes('solicitudes.aprobar');
  if (!puedeJefatura && !puedeDireccion) {
    return res.status(403).json({ error: 'No tienes permiso para rechazar esta solicitud' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE cometidos_comisiones
       SET estado = 'rechazado', rechazado_por = $1, rechazado_en = NOW(), observaciones_rechazo = $2
       WHERE id = $3 AND estado IN ('pendiente', 'aprobado_jefatura')
       RETURNING id`,
      [req.usuario.id, req.body.observaciones || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
    res.json({ mensaje: 'Solicitud rechazada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al rechazar' });
  }
});

module.exports = router;
