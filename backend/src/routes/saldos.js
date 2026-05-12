const express = require('express');
const { pool } = require('../db');
const { verificarToken, soloAdmin, adminOSupervisor } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// ─── Saldos de un funcionario ─────────────────────────────────────────────────
router.get('/funcionario/:id', async (req, res) => {
  const anio = req.query.anio || new Date().getFullYear();

  if (req.usuario.rol === 'funcionario' && req.usuario.funcionario_id != req.params.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  try {
    const result = await pool.query(
      `SELECT sf.*,
              tp.nombre AS tipo_nombre, tp.codigo, tp.color, tp.descripcion,
              tp.es_feriado_legal,
              (sf.dias_asignados - sf.dias_usados - sf.dias_pendientes) AS dias_disponibles,
              GREATEST(sf.saldo_arrastre - sf.arrastre_usados - sf.arrastre_pendientes, 0) AS arrastre_disponible,
              (sf.dias_asignados - sf.dias_usados - sf.dias_pendientes
               + GREATEST(sf.saldo_arrastre - sf.arrastre_usados - sf.arrastre_pendientes, 0)) AS total_disponible,
              GREATEST(sf.dias_asignados - 10, 0) AS max_parciales,
              COALESCE((
                SELECT SUM(sol.dias_periodo_actual)
                FROM solicitudes sol
                WHERE sol.funcionario_id = sf.funcionario_id
                  AND sol.tipo_permiso_id = sf.tipo_permiso_id
                  AND EXTRACT(YEAR FROM sol.fecha_inicio) = sf.anio
                  AND sol.estado IN ('aprobado','pendiente')
                  AND sol.dias_periodo_actual > 0
                  AND sol.dias_periodo_actual < 10
              ), 0) AS dias_parciales_usados
       FROM saldos_funcionarios sf
       JOIN tipos_permisos tp ON sf.tipo_permiso_id = tp.id
       WHERE sf.funcionario_id = $1 AND sf.anio = $2
       ORDER BY tp.es_feriado_legal DESC, tp.nombre`,
      [req.params.id, anio]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener saldos' });
  }
});

// ─── Calcular y transferir arrastre al año nuevo ──────────────────────────────
// Toma los días restantes de feriado legal del año anterior y los pone como arrastre
router.post('/calcular-arrastre', soloAdmin, async (req, res) => {
  const anioOrigen = parseInt(req.body.anio_origen || new Date().getFullYear() - 1);
  const anioDestino = parseInt(req.body.anio_destino || new Date().getFullYear());

  if (anioOrigen >= anioDestino) {
    return res.status(400).json({ error: 'El año origen debe ser anterior al año destino' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tipos marcados como feriado legal
    const tipos = await client.query(
      `SELECT id FROM tipos_permisos WHERE es_feriado_legal = TRUE AND activo = TRUE`
    );

    let actualizados = 0;

    for (const tipo of tipos.rows) {
      // Para cada funcionario: obtener saldo del año origen
      const saldosOrigen = await client.query(
        `SELECT funcionario_id,
                GREATEST(dias_asignados - dias_usados - dias_pendientes, 0) AS dias_restantes
         FROM saldos_funcionarios
         WHERE tipo_permiso_id = $1 AND anio = $2`,
        [tipo.id, anioOrigen]
      );

      for (const s of saldosOrigen.rows) {
        if (s.dias_restantes <= 0) continue;

        // Actualizar o crear saldo del año destino con el arrastre
        const existe = await client.query(
          `SELECT id FROM saldos_funcionarios
           WHERE funcionario_id = $1 AND tipo_permiso_id = $2 AND anio = $3`,
          [s.funcionario_id, tipo.id, anioDestino]
        );

        if (existe.rows.length > 0) {
          await client.query(
            `UPDATE saldos_funcionarios
             SET saldo_arrastre = $1, updated_at = NOW()
             WHERE funcionario_id = $2 AND tipo_permiso_id = $3 AND anio = $4`,
            [s.dias_restantes, s.funcionario_id, tipo.id, anioDestino]
          );
        } else {
          const maxDias = await client.query(
            `SELECT dias_anuales_max FROM tipos_permisos WHERE id = $1`, [tipo.id]
          );
          await client.query(
            `INSERT INTO saldos_funcionarios (funcionario_id, tipo_permiso_id, anio, dias_asignados, saldo_arrastre)
             VALUES ($1, $2, $3, $4, $5)`,
            [s.funcionario_id, tipo.id, anioDestino, maxDias.rows[0].dias_anuales_max, s.dias_restantes]
          );
        }
        actualizados++;
      }
    }

    await client.query('COMMIT');
    res.json({
      mensaje: `Arrastre calculado: ${actualizados} registro(s) actualizados`,
      anio_origen: anioOrigen,
      anio_destino: anioDestino,
      actualizados,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al calcular arrastre' });
  } finally {
    client.release();
  }
});

// ─── Ajuste manual de saldo ───────────────────────────────────────────────────
router.put('/ajuste', adminOSupervisor, async (req, res) => {
  const { funcionario_id, tipo_permiso_id, anio, dias_asignados, motivo } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const saldoActual = await client.query(
      `SELECT * FROM saldos_funcionarios
       WHERE funcionario_id = $1 AND tipo_permiso_id = $2 AND anio = $3 FOR UPDATE`,
      [funcionario_id, tipo_permiso_id, anio]
    );

    if (saldoActual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Saldo no encontrado' });
    }

    const s = saldoActual.rows[0];
    const saldoAnterior = s.dias_asignados - s.dias_usados - s.dias_pendientes;

    await client.query(
      `UPDATE saldos_funcionarios SET dias_asignados = $1, updated_at = NOW() WHERE id = $2`,
      [dias_asignados, s.id]
    );

    const saldoNuevo = dias_asignados - s.dias_usados - s.dias_pendientes;

    await client.query(
      `INSERT INTO historial_movimientos
         (funcionario_id, tipo_permiso_id, tipo_movimiento, dias_movimiento,
          saldo_anterior, saldo_nuevo, descripcion, usuario_responsable)
       VALUES ($1, $2, 'ajuste', $3, $4, $5, $6, $7)`,
      [
        funcionario_id, tipo_permiso_id,
        dias_asignados - s.dias_asignados, saldoAnterior, saldoNuevo,
        motivo || `Ajuste manual de días asignados a ${dias_asignados}`,
        req.usuario.id,
      ]
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Saldo ajustado correctamente', saldo_nuevo: saldoNuevo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al ajustar saldo' });
  } finally {
    client.release();
  }
});

module.exports = router;
