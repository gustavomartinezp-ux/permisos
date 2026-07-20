const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { verificarToken, soloAdmin, adminOSupervisor } = require('../middleware/auth');

const router = express.Router();

router.use(verificarToken);

router.get('/', async (req, res) => {
  if (req.usuario.rol === 'funcionario') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const anio = req.query.anio || new Date().getFullYear();

    const soloInactivos = req.usuario.rol === 'admin' && req.query.activo === 'false';
    const whereParts = [soloInactivos ? 'f.activo = false' : 'f.activo = true'];
    const queryParams = [anio];

    // Supervisor solo ve su sector o su área
    if (req.usuario.rol === 'supervisor') {
      if (req.usuario.sector) {
        whereParts.push(`f.sector = $2`);
        queryParams.push(req.usuario.sector);
      } else if (req.usuario.area) {
        whereParts.push(`f.area = $2`);
        queryParams.push(req.usuario.area);
      }
    }

    // Filtro por grupo contractual
    if (req.query.tipo_grupo === 'contrata') {
      whereParts.push(`f.tipo_contrato IN ('Indefinido', 'Plazo Fijo')`);
    } else if (req.query.tipo_grupo === 'honorarios') {
      whereParts.push(`f.tipo_contrato = 'Honorarios'`);
    } else if (req.query.tipo_grupo === 'suplentes') {
      whereParts.push(`f.tipo_contrato = 'Suplencia'`);
    }

    const result = await pool.query(
      `SELECT
         f.id, f.rut, f.nombres, f.apellidos, f.cargo, f.fecha_ingreso, f.activo, f.sector, f.area,
         f.tipo_contrato, f.horas_contrato, f.reemplaza_a, f.grupo_contractual,
         f.convenio_honorarios, f.prestacion, f.fecha_termino_contrato,
         s.nombre AS servicio,
         d.nombre AS dispositivo, d.id AS dispositivo_id,
         remp.nombres AS reemplaza_nombres, remp.apellidos AS reemplaza_apellidos,
         u.rol AS usuario_rol, u.email AS usuario_email,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'tipo_id', sf.tipo_permiso_id,
               'tipo_nombre', tp.nombre,
               'tipo_codigo', tp.codigo,
               'color', tp.color,
               'dias_asignados', sf.dias_asignados,
               'dias_usados', sf.dias_usados,
               'dias_pendientes', sf.dias_pendientes,
               'dias_disponibles', (sf.dias_asignados - sf.dias_usados - sf.dias_pendientes)
             ) ORDER BY tp.nombre
           ) FILTER (WHERE sf.id IS NOT NULL),
           '[]'
         ) AS saldos
       FROM funcionarios f
       LEFT JOIN servicios s ON f.servicio_id = s.id
       LEFT JOIN dispositivos d ON f.dispositivo_id = d.id
       LEFT JOIN funcionarios remp ON f.reemplaza_a = remp.id
       LEFT JOIN saldos_funcionarios sf ON f.id = sf.funcionario_id AND sf.anio = $1
       LEFT JOIN tipos_permisos tp ON sf.tipo_permiso_id = tp.id
       LEFT JOIN usuarios u ON u.funcionario_id = f.id AND u.activo = true
       WHERE ${whereParts.join(' AND ')}
       GROUP BY f.id, s.nombre, d.nombre, d.id, remp.nombres, remp.apellidos, u.rol, u.email
       ORDER BY f.sector NULLS LAST, f.area NULLS LAST, f.apellidos, f.nombres`,
      queryParams
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener funcionarios' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const anio = req.query.anio || new Date().getFullYear();
    const { id } = req.params;

    if (req.usuario.rol === 'funcionario' && req.usuario.funcionario_id != id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    // Supervisor solo puede ver funcionarios de su sector/área o su propio perfil
    if (req.usuario.rol === 'supervisor' && req.usuario.funcionario_id != id) {
      const check = await pool.query(
        'SELECT sector, area FROM funcionarios WHERE id = $1 AND activo = true', [id]
      );
      if (check.rows.length > 0) {
        const f = check.rows[0];
        const inSector = req.usuario.sector && f.sector === req.usuario.sector;
        const inArea   = req.usuario.area   && f.area   === req.usuario.area;
        if (!inSector && !inArea) {
          return res.status(403).json({ error: 'Acceso denegado: funcionario fuera de su ámbito' });
        }
      }
    }

    const funcionario = await pool.query(
      `SELECT f.*,
              s.nombre AS servicio,
              d.nombre AS dispositivo,
              remp.nombres AS reemplaza_nombres,
              remp.apellidos AS reemplaza_apellidos,
              u.id AS usuario_id,
              u.email AS usuario_email,
              u.rol AS usuario_rol,
              u.sector AS supervisor_sector,
              u.area AS supervisor_area,
              f.grupo_contractual,
              f.convenio_honorarios,
              f.prestacion,
              f.fecha_termino_contrato
       FROM funcionarios f
       LEFT JOIN servicios s ON f.servicio_id = s.id
       LEFT JOIN dispositivos d ON f.dispositivo_id = d.id
       LEFT JOIN funcionarios remp ON f.reemplaza_a = remp.id
       LEFT JOIN usuarios u ON u.funcionario_id = f.id AND u.activo = true
       WHERE f.id = $1`,
      [id]
    );

    if (funcionario.rows.length === 0) {
      return res.status(404).json({ error: 'Funcionario no encontrado' });
    }

    const saldos = await pool.query(
      `SELECT sf.*, tp.nombre AS tipo_nombre, tp.codigo, tp.color, tp.es_feriado_legal,
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
       WHERE sf.funcionario_id = $1 AND sf.anio = $2 AND tp.es_especial = FALSE
       ORDER BY tp.es_feriado_legal DESC, tp.nombre`,
      [id, anio]
    );

    const solicitudes = await pool.query(
      `SELECT sol.*, tp.nombre AS tipo_nombre, tp.color,
              u.nombres AS aprobador_nombres, u.apellidos AS aprobador_apellidos
       FROM solicitudes sol
       JOIN tipos_permisos tp ON sol.tipo_permiso_id = tp.id
       LEFT JOIN usuarios usr ON sol.aprobado_por = usr.id
       LEFT JOIN funcionarios u ON usr.funcionario_id = u.id
       WHERE sol.funcionario_id = $1
       ORDER BY sol.fecha_solicitud DESC
       LIMIT 20`,
      [id]
    );

    res.json({
      ...funcionario.rows[0],
      saldos: saldos.rows,
      solicitudes_recientes: solicitudes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener funcionario' });
  }
});

// Crear funcionario individual con usuario y saldos personalizados
router.post('/', soloAdmin, [
  body('rut').notEmpty(),
  body('nombres').notEmpty(),
  body('apellidos').notEmpty(),
  body('cargo').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    rut, nombres, apellidos, cargo, servicio_id, fecha_ingreso, email, saldos_custom,
    sector, area,
    rol_sistema, sector_supervisa, area_supervisa,
    tipo_contrato, horas_contrato, dispositivo_id, reemplaza_a,
    fecha_nacimiento, telefono, direccion_particular, numero_reloj,
    convenio_honorarios, prestacion, fecha_termino_contrato,
    escalafon, categoria, nivel,
    suplencia_fecha_inicio, motivo_reemplazo,
  } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const nuevo = await client.query(
      `INSERT INTO funcionarios
         (rut, nombres, apellidos, cargo, servicio_id, fecha_ingreso,
          sector, area, tipo_contrato, horas_contrato, dispositivo_id, reemplaza_a,
          fecha_nacimiento, telefono, direccion_particular, numero_reloj,
          convenio_honorarios, prestacion, fecha_termino_contrato,
          escalafon, categoria, nivel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [
        rut, nombres, apellidos, cargo,
        servicio_id || null, fecha_ingreso || null,
        sector || null, area || null,
        tipo_contrato || null, horas_contrato ? parseInt(horas_contrato) : null,
        dispositivo_id || null, reemplaza_a || null,
        fecha_nacimiento || null, telefono || null,
        direccion_particular || null, numero_reloj ? parseInt(numero_reloj) : null,
        convenio_honorarios || null, prestacion || null, fecha_termino_contrato || null,
        escalafon || null, categoria || null, nivel || null,
      ]
    );

    const funcId = nuevo.rows[0].id;
    const anio = new Date().getFullYear();

    // Crear saldos: usa custom si viene, si no usa el máximo del tipo
    const tipos = await client.query('SELECT id, dias_anuales_max FROM tipos_permisos WHERE activo = true');
    if (tipos.rows.length > 0) {
      const tipoIds = tipos.rows.map(t => t.id);
      const diasArr = tipos.rows.map(t => {
        const diasCustom = saldos_custom?.[t.id];
        return diasCustom !== undefined ? parseInt(diasCustom) : t.dias_anuales_max;
      });
      await client.query(
        `INSERT INTO saldos_funcionarios (funcionario_id, tipo_permiso_id, anio, dias_asignados)
         SELECT $1, tipo_id, $2, dias
         FROM unnest($3::int[], $4::int[]) AS t(tipo_id, dias)`,
        [funcId, anio, tipoIds, diasArr]
      );
    }

    // Registrar en historial_suplencias si es suplente con fechas
    if (tipo_contrato === 'Suplencia' && suplencia_fecha_inicio && fecha_termino_contrato) {
      let cargoReemplazado = cargo;
      let rutReemplazado = null;
      let nombreReemplazado = null;
      if (reemplaza_a) {
        const rep = await client.query(
          'SELECT cargo, rut, nombres, apellidos FROM funcionarios WHERE id = $1',
          [reemplaza_a]
        );
        if (rep.rows.length > 0) {
          cargoReemplazado = rep.rows[0].cargo;
          rutReemplazado   = rep.rows[0].rut;
          nombreReemplazado = `${rep.rows[0].nombres} ${rep.rows[0].apellidos}`;
        }
      }
      const motivo = ['licencia_medica','feriado_legal','permiso_administrativo','permiso_sin_goce','vacancia','otro']
        .includes(motivo_reemplazo) ? motivo_reemplazo : 'otro';
      await client.query(
        `INSERT INTO historial_suplencias
           (funcionario_suplente_id, funcionario_reemplazado_id,
            rut_reemplazado, nombre_reemplazado, cargo_reemplazado,
            motivo_reemplazo, fecha_inicio, fecha_termino, estado, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'activa',$9)`,
        [
          funcId, reemplaza_a || null,
          rutReemplazado, nombreReemplazado, cargoReemplazado,
          motivo, suplencia_fecha_inicio, fecha_termino_contrato,
          req.user?.id || null,
        ]
      );
    }

    // Crear cuenta de usuario si se provee email
    if (email && email.trim()) {
      if (!process.env.INITIAL_PASSWORD) throw new Error('INITIAL_PASSWORD no está configurada en el servidor');
      const hash = await bcrypt.hash(process.env.INITIAL_PASSWORD, 10);
      const rolUsuario = ['admin', 'supervisor', 'funcionario'].includes(rol_sistema) ? rol_sistema : 'funcionario';
      const sectorUser = rolUsuario === 'supervisor' ? (sector_supervisa || null) : null;
      const areaUser   = rolUsuario === 'supervisor' ? (area_supervisa   || null) : null;
      await client.query(
        `INSERT INTO usuarios (email, password_hash, rol, funcionario_id, sector, area)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET rol=$3, sector=$5, area=$6`,
        [email.trim().toLowerCase(), hash, rolUsuario, funcId, sectorUser, areaUser]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(nuevo.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'El RUT ya está registrado' });
    res.status(500).json({ error: 'Error al crear funcionario' });
  } finally {
    client.release();
  }
});

// Carga masiva desde Excel (array de funcionarios)
router.post('/bulk', soloAdmin, async (req, res) => {
  const { funcionarios } = req.body;

  if (!Array.isArray(funcionarios) || funcionarios.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de funcionarios' });
  }

  const client = await pool.connect();
  const resultados = { exitosos: 0, errores: [] };

  try {
    await client.query('BEGIN');

    const tipos = await client.query('SELECT id, codigo, nombre, dias_anuales_max FROM tipos_permisos WHERE activo = true');
    const anio = new Date().getFullYear();

    for (let i = 0; i < funcionarios.length; i++) {
      const f = funcionarios[i];
      try {
        if (!f.rut || !f.nombres || !f.apellidos) {
          resultados.errores.push({ fila: i + 2, rut: f.rut || '?', error: 'Faltan campos obligatorios (RUT, nombres, apellidos)' });
          continue;
        }

        const servicioResult = f.servicio
          ? await client.query(`SELECT id FROM servicios WHERE LOWER(nombre) LIKE LOWER($1) LIMIT 1`, [`%${f.servicio}%`])
          : { rows: [] };

        const dispositivoResult = f.dispositivo
          ? await client.query(`SELECT id FROM dispositivos WHERE LOWER(nombre) LIKE LOWER($1) LIMIT 1`, [`%${f.dispositivo}%`])
          : { rows: [] };

        const TIPOS_CONTRATO = ['Indefinido', 'Plazo Fijo', 'Honorarios', 'Suplencia'];
        const tipoContrato = TIPOS_CONTRATO.includes(f.tipo_contrato) ? f.tipo_contrato : null;
        const horasContrato = f.horas_contrato ? parseInt(f.horas_contrato) || null : null;

        const nuevo = await client.query(
          `INSERT INTO funcionarios
             (rut, nombres, apellidos, cargo, servicio_id, fecha_ingreso,
              tipo_contrato, horas_contrato, dispositivo_id,
              fecha_nacimiento, telefono, escalafon, categoria, nivel)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (rut) DO UPDATE SET
             nombres=EXCLUDED.nombres, apellidos=EXCLUDED.apellidos,
             cargo=EXCLUDED.cargo, servicio_id=EXCLUDED.servicio_id,
             fecha_ingreso=EXCLUDED.fecha_ingreso,
             tipo_contrato=EXCLUDED.tipo_contrato,
             horas_contrato=EXCLUDED.horas_contrato,
             dispositivo_id=EXCLUDED.dispositivo_id,
             fecha_nacimiento=EXCLUDED.fecha_nacimiento,
             telefono=EXCLUDED.telefono,
             escalafon=EXCLUDED.escalafon,
             categoria=EXCLUDED.categoria,
             nivel=EXCLUDED.nivel
           RETURNING id, rut`,
          [
            f.rut.trim(),
            f.nombres.trim(),
            f.apellidos.trim(),
            f.cargo?.trim() || null,
            servicioResult.rows[0]?.id || null,
            f.fecha_ingreso || null,
            tipoContrato,
            horasContrato,
            dispositivoResult.rows[0]?.id || null,
            f.fecha_nacimiento || null,
            f.telefono?.trim() || null,
            f.escalafon?.trim() || null,
            f.categoria?.trim() || null,
            f.nivel?.trim() || null,
          ]
        );

        const funcId = nuevo.rows[0].id;

        // Saldos: cada tipo puede tener días específicos en el Excel
        if (tipos.rows.length > 0) {
          const tipoIds = tipos.rows.map(t => t.id);
          const diasArr = tipos.rows.map(t => {
            const diasClave  = t.codigo.toLowerCase();
            const diasCustom = f.saldos?.[t.id] ?? f.saldos?.[diasClave];
            return diasCustom !== undefined && diasCustom !== '' ? parseInt(diasCustom) : t.dias_anuales_max;
          });
          await client.query(
            `INSERT INTO saldos_funcionarios (funcionario_id, tipo_permiso_id, anio, dias_asignados)
             SELECT $1, tipo_id, $2, dias
             FROM unnest($3::int[], $4::int[]) AS t(tipo_id, dias)
             ON CONFLICT (funcionario_id, tipo_permiso_id, anio)
             DO UPDATE SET dias_asignados = EXCLUDED.dias_asignados`,
            [funcId, anio, tipoIds, diasArr]
          );
        }

        // Crear usuario si tiene email
        if (f.email && f.email.trim()) {
          if (!process.env.INITIAL_PASSWORD) throw new Error('INITIAL_PASSWORD no está configurada en el servidor');
          const hash = await bcrypt.hash(process.env.INITIAL_PASSWORD, 10);
          await client.query(
            `INSERT INTO usuarios (email, password_hash, rol, funcionario_id)
             VALUES ($1, $2, 'funcionario', $3)
             ON CONFLICT (email) DO UPDATE SET funcionario_id = EXCLUDED.funcionario_id`,
            [f.email.trim().toLowerCase(), hash, funcId]
          );
        }

        resultados.exitosos++;
      } catch (rowErr) {
        resultados.errores.push({ fila: i + 2, rut: f.rut || '?', error: rowErr.message });
      }
    }

    await client.query('COMMIT');
    res.json({
      mensaje: `${resultados.exitosos} funcionario(s) cargados correctamente`,
      ...resultados,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error en la carga masiva' });
  } finally {
    client.release();
  }
});

router.put('/:id', adminOSupervisor, async (req, res) => {
  const {
    nombres, apellidos, cargo, servicio_id, activo, sector, area,
    tipo_contrato, horas_contrato, dispositivo_id, reemplaza_a, fecha_ingreso,
    fecha_nacimiento, telefono, direccion_particular, numero_reloj,
    rol_sistema, sector_supervisa, area_supervisa,
    convenio_honorarios, prestacion, fecha_termino_contrato,
    escalafon, categoria, nivel,
  } = req.body;

  if (activo === false && req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede desactivar funcionarios' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const activoParam = (req.usuario.rol === 'admin' && activo != null) ? Boolean(activo) : null;
    const result = await client.query(
      `UPDATE funcionarios
       SET nombres=$1, apellidos=$2, cargo=$3, servicio_id=$4,
           activo = COALESCE($5, activo),
           tipo_contrato=$6, horas_contrato=$7, dispositivo_id=$8, reemplaza_a=$9,
           fecha_ingreso=$10, sector=$11, area=$12,
           fecha_nacimiento=$13, telefono=$14, direccion_particular=$15, numero_reloj=$16,
           convenio_honorarios=$17, prestacion=$18, fecha_termino_contrato=$19,
           escalafon=$20, categoria=$21, nivel=$22
       WHERE id=$23 RETURNING *`,
      [
        nombres, apellidos, cargo,
        servicio_id || null,
        activoParam,
        tipo_contrato || null,
        horas_contrato ? parseInt(horas_contrato) : null,
        dispositivo_id || null,
        reemplaza_a || null,
        fecha_ingreso || null,
        sector || null,
        area || null,
        fecha_nacimiento || null,
        telefono || null,
        direccion_particular || null,
        numero_reloj ? parseInt(numero_reloj) : null,
        convenio_honorarios || null,
        prestacion || null,
        fecha_termino_contrato || null,
        escalafon || null,
        categoria || null,
        nivel || null,
        req.params.id,
      ]
    );

    // Actualizar o crear usuario si se indica rol_sistema (solo admin)
    if (req.usuario.rol === 'admin' && rol_sistema) {
      const rolValido = ['admin', 'supervisor', 'funcionario'].includes(rol_sistema) ? rol_sistema : 'funcionario';
      const sectorUser = rolValido === 'supervisor' ? (sector_supervisa || null) : null;
      const areaUser   = rolValido === 'supervisor' ? (area_supervisa   || null) : null;
      await client.query(
        `UPDATE usuarios
         SET rol=$1, sector=$2, area=$3
         WHERE funcionario_id=$4 AND activo=true`,
        [rolValido, sectorUser, areaUser, req.params.id]
      );
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar funcionario' });
  } finally {
    client.release();
  }
});

// Pasivar / Activar — solo cambia el campo activo (no toca ningún otro dato)
router.patch('/:id/activo', soloAdmin, async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean')
    return res.status(400).json({ error: 'El campo activo debe ser un booleano' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE funcionarios SET activo = $1 WHERE id = $2
       RETURNING id, activo, nombres, apellidos`,
      [activo, req.params.id]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Funcionario no encontrado' });
    }

    // Sincronizar el usuario vinculado
    await client.query(
      `UPDATE usuarios SET activo = $1 WHERE funcionario_id = $2`,
      [activo, req.params.id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar estado del funcionario' });
  } finally {
    client.release();
  }
});

// Eliminar funcionario pasivo — requiere contraseña del admin
router.delete('/:id', soloAdmin, async (req, res) => {
  const { password_admin } = req.body;
  if (!password_admin)
    return res.status(400).json({ error: 'Se requiere contraseña de administrador para confirmar' });

  const client = await pool.connect();
  try {
    const admin = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    const valida = await bcrypt.compare(password_admin, admin.rows[0].password_hash);
    if (!valida) return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });

    const func = await pool.query('SELECT activo, nombres, apellidos FROM funcionarios WHERE id = $1', [req.params.id]);
    if (!func.rows[0]) return res.status(404).json({ error: 'Funcionario no encontrado' });
    if (func.rows[0].activo !== false)
      return res.status(400).json({ error: 'Solo se pueden eliminar funcionarios en estado Pasivo' });

    await client.query('BEGIN');

    // 1. Suplencias donde este funcionario era el suplente
    //    (las prórrogas se borran en CASCADE desde historial_suplencias)
    await client.query(
      `DELETE FROM historial_suplencias WHERE funcionario_suplente_id = $1`,
      [req.params.id]
    );
    // 2. Desreferenciar donde era el reemplazado (FK nullable, sin CASCADE)
    await client.query(
      `UPDATE historial_suplencias SET funcionario_reemplazado_id = NULL
       WHERE funcionario_reemplazado_id = $1`,
      [req.params.id]
    );

    // 3. Desreferenciar creado_por / actualizado_por en suplencias
    await client.query(
      `UPDATE historial_suplencias SET creado_por = NULL WHERE creado_por IN
       (SELECT id FROM usuarios WHERE funcionario_id = $1)`,
      [req.params.id]
    );
    await client.query(
      `UPDATE historial_suplencias SET actualizado_por = NULL WHERE actualizado_por IN
       (SELECT id FROM usuarios WHERE funcionario_id = $1)`,
      [req.params.id]
    );

    // 4. Historial de movimientos y saldos
    await client.query('DELETE FROM historial_movimientos WHERE funcionario_id = $1', [req.params.id]);
    await client.query('DELETE FROM saldos_funcionarios WHERE funcionario_id = $1', [req.params.id]);

    // 5. Desreferenciar aprobadores en solicitudes antes de borrarlas
    await client.query(
      `UPDATE solicitudes SET pre_aprobado_por = NULL
       WHERE pre_aprobado_por IN (SELECT id FROM usuarios WHERE funcionario_id = $1)`,
      [req.params.id]
    );
    await client.query(
      `UPDATE solicitudes SET aprobado_por = NULL
       WHERE aprobado_por IN (SELECT id FROM usuarios WHERE funcionario_id = $1)`,
      [req.params.id]
    );
    await client.query('DELETE FROM solicitudes WHERE funcionario_id = $1', [req.params.id]);

    // 6. Usuario vinculado y finalmente el funcionario
    await client.query('DELETE FROM usuarios WHERE funcionario_id = $1', [req.params.id]);
    await client.query('DELETE FROM funcionarios WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');

    res.json({ mensaje: `${func.rows[0].nombres} ${func.rows[0].apellidos} eliminado permanentemente` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE funcionario error:', err.message);
    res.status(500).json({ error: `Error al eliminar funcionario: ${err.message}` });
  } finally {
    client.release();
  }
});

// Actualizar foto de perfil
router.put('/:id/foto', async (req, res) => {
  const { id } = req.params;
  const { foto_base64 } = req.body;

  if (req.usuario.rol === 'funcionario' && req.usuario.funcionario_id != id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  if (!foto_base64 || !foto_base64.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Se requiere una imagen válida en base64' });
  }
  // Limite ~300 KB en base64 (~225 KB imagen real)
  if (foto_base64.length > 400000) {
    return res.status(400).json({ error: 'La imagen es muy grande. Máximo 300 KB.' });
  }
  try {
    await pool.query('UPDATE funcionarios SET foto_url=$1 WHERE id=$2', [foto_base64, id]);
    res.json({ mensaje: 'Foto actualizada', foto_url: foto_base64 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar foto' });
  }
});

// Eliminar foto de perfil
router.delete('/:id/foto', async (req, res) => {
  const { id } = req.params;
  if (req.usuario.rol === 'funcionario' && req.usuario.funcionario_id != id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    await pool.query('UPDATE funcionarios SET foto_url=NULL WHERE id=$1', [id]);
    res.json({ mensaje: 'Foto eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar foto' });
  }
});

// Actualizar saldos manualmente (cambio de grado + ajuste arrastre feriado legal)
router.put('/:id/saldos', soloAdmin, async (req, res) => {
  const { saldos, arrastres, anio, motivo } = req.body;
  const funcId = req.params.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const anioTarget = anio || new Date().getFullYear();
    const resultados = [];

    // Ajustar dias_asignados
    for (const [tipoId, diasNuevos] of Object.entries(saldos || {})) {
      const saldoActual = await client.query(
        `SELECT * FROM saldos_funcionarios
         WHERE funcionario_id=$1 AND tipo_permiso_id=$2 AND anio=$3 FOR UPDATE`,
        [funcId, tipoId, anioTarget]
      );
      if (saldoActual.rows.length === 0) continue;

      const s = saldoActual.rows[0];
      const saldoAnterior = s.dias_asignados - s.dias_usados - s.dias_pendientes;
      const diasNuevosInt = parseInt(diasNuevos);

      await client.query(
        `UPDATE saldos_funcionarios SET dias_asignados=$1, updated_at=NOW() WHERE id=$2`,
        [diasNuevosInt, s.id]
      );

      const saldoNuevo = diasNuevosInt - s.dias_usados - s.dias_pendientes;
      await client.query(
        `INSERT INTO historial_movimientos
           (funcionario_id, tipo_permiso_id, tipo_movimiento, dias_movimiento,
            saldo_anterior, saldo_nuevo, descripcion, usuario_responsable)
         VALUES ($1,$2,'ajuste',$3,$4,$5,$6,$7)`,
        [funcId, tipoId, diasNuevosInt - s.dias_asignados, saldoAnterior, saldoNuevo,
         motivo || `Ajuste manual de días asignados a ${diasNuevosInt}`, req.usuario.id]
      );
      resultados.push({ tipo_permiso_id: tipoId, campo: 'dias_asignados', valor: diasNuevosInt });
    }

    // Ajustar saldo_arrastre (solo feriado legal)
    for (const [tipoId, arrNuevo] of Object.entries(arrastres || {})) {
      const saldoActual = await client.query(
        `SELECT sf.*, tp.es_feriado_legal FROM saldos_funcionarios sf
         JOIN tipos_permisos tp ON sf.tipo_permiso_id = tp.id
         WHERE sf.funcionario_id=$1 AND sf.tipo_permiso_id=$2 AND sf.anio=$3 FOR UPDATE`,
        [funcId, tipoId, anioTarget]
      );
      if (saldoActual.rows.length === 0 || !saldoActual.rows[0].es_feriado_legal) continue;

      const s = saldoActual.rows[0];
      const arrAnterior = (s.saldo_arrastre || 0) - (s.arrastre_usados || 0) - (s.arrastre_pendientes || 0);
      const arrNuevoInt = parseInt(arrNuevo);

      await client.query(
        `UPDATE saldos_funcionarios SET saldo_arrastre=$1, updated_at=NOW() WHERE id=$2`,
        [arrNuevoInt, s.id]
      );

      const arrNuevoDisp = arrNuevoInt - (s.arrastre_usados || 0) - (s.arrastre_pendientes || 0);
      await client.query(
        `INSERT INTO historial_movimientos
           (funcionario_id, tipo_permiso_id, tipo_movimiento, dias_movimiento,
            saldo_anterior, saldo_nuevo, descripcion, usuario_responsable)
         VALUES ($1,$2,'ajuste',$3,$4,$5,$6,$7)`,
        [funcId, tipoId, arrNuevoInt - (s.saldo_arrastre || 0), arrAnterior, arrNuevoDisp,
         motivo || `Ajuste manual de arrastre feriado legal a ${arrNuevoInt} días`, req.usuario.id]
      );
      resultados.push({ tipo_permiso_id: tipoId, campo: 'saldo_arrastre', valor: arrNuevoInt });
    }

    await client.query('COMMIT');
    res.json({ mensaje: `${resultados.length} ajuste(s) realizados`, resultados });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar saldos' });
  } finally {
    client.release();
  }
});

module.exports = router;
