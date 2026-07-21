'use strict';
const express = require('express');
const ExcelJS = require('exceljs');
const { pool } = require('../db');
const { verificarToken, adminOSupervisor } = require('../middleware/auth');
const { cargarPermisos, requierePermiso, tieneVisibilidadGlobal } = require('../middleware/rbac');
const { SECTORES_VALIDOS, AREAS_VALIDAS } = require('../config/catalogos');

const router = express.Router();

// Acceso: admin/supervisor legacy, o cualquiera con permiso de reportes/auditoría nuevo
// (RRHH_ADMIN, SECRETARY, AUDITOR).
router.use(verificarToken, cargarPermisos, (req, res, next) => {
  const legacyOk = ['admin', 'supervisor'].includes(req.usuario.rol);
  const permisoOk = (req.usuario.permisos || []).some((p) =>
    ['reportes.ver_globales', 'reportes.ver_operativos', 'auditoria.ver_todo'].includes(p)
  );
  if (legacyOk || permisoOk) return next();
  return res.status(403).json({ error: 'Acceso restringido a supervisores, administradores y roles con acceso a reportes' });
});

router.get('/estadisticas', async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const hoy  = new Date().toISOString().split('T')[0];

    // Filtro por sector/área para supervisor
    let fp = null; // filterParam
    let ff = null; // filterField
    if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
      if (SECTORES_VALIDOS.includes(req.usuario.sector)) { fp = req.usuario.sector; ff = 'f.sector'; }
      else if (AREAS_VALIDAS.includes(req.usuario.area)) { fp = req.usuario.area;   ff = 'f.area'; }
    }
    const joinF  = fp ? 'JOIN funcionarios f ON s.funcionario_id=f.id' : '';
    const andFp  = fp ? `AND ${ff} = $2` : '';
    const andFp1 = fp ? `AND ${ff} = $1` : '';
    const pAnio  = fp ? [anio, fp] : [anio];
    const pHoy   = fp ? [hoy, fp]  : [hoy];
    const pFp    = fp ? [fp] : [];

    const [funcRes, estRes, activosRes, horasRes, ausRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE f.activo=TRUE)  AS activos,
                COUNT(*) FILTER (WHERE f.activo=FALSE) AS inactivos
         FROM funcionarios f ${fp ? `WHERE ${ff} = $1` : ''}`, pFp
      ),
      pool.query(
        `SELECT estado, COUNT(*) AS total
         FROM solicitudes s ${joinF}
         WHERE EXTRACT(YEAR FROM s.fecha_inicio)=$1 ${andFp}
         GROUP BY estado`, pAnio
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM solicitudes s ${joinF}
         WHERE s.estado='aprobado' AND s.fecha_inicio<=$1 AND s.fecha_fin>=$1 ${andFp}`,
        pHoy
      ),
      pool.query(
        `SELECT COALESCE(SUM(hc.horas_compensatorias),0) AS total
         FROM horas_compensatorias hc
         ${fp ? 'JOIN funcionarios f ON hc.funcionario_id=f.id' : ''}
         WHERE hc.estado='activo' ${andFp1}`, pFp
      ),
      pool.query(
        `SELECT COUNT(DISTINCT s.funcionario_id) AS funcionarios,
                COALESCE(SUM(s.dias_solicitados),0) AS dias,
                COUNT(s.id) AS solicitudes
         FROM solicitudes s ${joinF}
         WHERE s.estado='aprobado' AND s.fecha_inicio >= NOW()-INTERVAL '180 days' ${andFp1}`,
        pFp
      ),
    ]);

    const estadoMap = {};
    for (const r of estRes.rows) estadoMap[r.estado] = parseInt(r.total);

    res.json({
      funcionarios: {
        activos:   parseInt(funcRes.rows[0].activos),
        inactivos: parseInt(funcRes.rows[0].inactivos),
      },
      solicitudes: {
        pendientes:    estadoMap.pendiente    || 0,
        pre_aprobadas: estadoMap.pre_aprobado || 0,
        aprobadas:     estadoMap.aprobado     || 0,
        rechazadas:    estadoMap.rechazado    || 0,
        reintegradas:  estadoMap.cancelado    || 0,
      },
      permisos_activos_hoy: parseInt(activosRes.rows[0].total),
      horas_compensatorias: parseFloat(horasRes.rows[0].total),
      ausentismo_180: {
        funcionarios: parseInt(ausRes.rows[0].funcionarios),
        dias:         parseFloat(ausRes.rows[0].dias),
        solicitudes:  parseInt(ausRes.rows[0].solicitudes),
      },
      anio,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ─── Reporte de permisos con filtros y paginación ────────────────────────────
router.get('/permisos', async (req, res) => {
  try {
    const {
      fecha_inicio, fecha_fin, tipo_permiso_id, estado, sector, page = 1, limit = 50,
    } = req.query;

    const params = [];
    const where  = ['1=1'];

    if (fecha_inicio)    { params.push(fecha_inicio);            where.push(`s.fecha_inicio >= $${params.length}`); }
    if (fecha_fin)       { params.push(fecha_fin);               where.push(`s.fecha_fin <= $${params.length}`); }
    if (tipo_permiso_id) { params.push(parseInt(tipo_permiso_id)); where.push(`s.tipo_permiso_id = $${params.length}`); }
    if (estado)          { params.push(estado);                  where.push(`s.estado = $${params.length}`); }
    if (sector)          { params.push(sector);                  where.push(`f.sector = $${params.length}`); }

    if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
      if (req.usuario.sector) { params.push(req.usuario.sector); where.push(`f.sector = $${params.length}`); }
      else if (req.usuario.area) { params.push(req.usuario.area); where.push(`f.area = $${params.length}`); }
    }

    const whereStr = where.join(' AND ');
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM solicitudes s JOIN funcionarios f ON s.funcionario_id=f.id WHERE ${whereStr}`,
      params
    );

    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const result = await pool.query(
      `SELECT s.id, s.fecha_solicitud, s.fecha_inicio, s.fecha_fin,
              s.dias_solicitados, s.estado, s.jornada_medio_dia, s.observaciones,
              f.nombres, f.apellidos, f.rut, f.cargo, f.sector, f.area,
              tp.nombre AS tipo_permiso, tp.color, tp.es_especial,
              sv.nombre AS servicio,
              CONCAT(ap.nombres,' ',ap.apellidos) AS aprobador
       FROM solicitudes s
       JOIN funcionarios f  ON s.funcionario_id=f.id
       JOIN tipos_permisos tp ON s.tipo_permiso_id=tp.id
       LEFT JOIN servicios sv ON f.servicio_id=sv.id
       LEFT JOIN usuarios u  ON s.aprobado_por=u.id
       LEFT JOIN funcionarios ap ON u.funcionario_id=ap.id
       WHERE ${whereStr}
       ORDER BY s.fecha_inicio DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );

    res.json({
      total: parseInt(countRes.rows[0].count),
      page:  parseInt(page),
      limit: parseInt(limit),
      data:  result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener reporte de permisos' });
  }
});

// ─── Ausentismo últimos 180 días ─────────────────────────────────────────────
router.get('/ausentismo', async (req, res) => {
  try {
    let sector = req.query.sector || null;
    let area   = null;
    // Supervisor: forzar su propio sector/área, ignorar query param
    if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
      if (SECTORES_VALIDOS.includes(req.usuario.sector)) { sector = req.usuario.sector; area = null; }
      else if (AREAS_VALIDAS.includes(req.usuario.area)) { sector = null; area = req.usuario.area; }
      else { sector = null; }
    }
    const params = [];
    const sw = sector
      ? (params.push(sector), `AND f.sector = $${params.length}`)
      : area
      ? (params.push(area), `AND f.area = $${params.length}`)
      : '';

    const [porFuncionario, porTipo, porMes, resumen] = await Promise.all([
      pool.query(
        `SELECT f.id, f.nombres, f.apellidos, f.cargo, f.sector,
                COUNT(s.id)::int                         AS total_solicitudes,
                COALESCE(SUM(s.dias_solicitados),0)::int AS total_dias
         FROM funcionarios f
         JOIN solicitudes s ON s.funcionario_id=f.id
         WHERE s.estado='aprobado' AND s.fecha_inicio >= NOW()-INTERVAL '180 days' ${sw}
         GROUP BY f.id ORDER BY total_dias DESC LIMIT 20`, params
      ),
      pool.query(
        `SELECT tp.nombre, tp.color,
                COUNT(s.id)::int                         AS total,
                COALESCE(SUM(s.dias_solicitados),0)::int AS dias
         FROM solicitudes s
         JOIN tipos_permisos tp ON s.tipo_permiso_id=tp.id
         JOIN funcionarios f    ON s.funcionario_id=f.id
         WHERE s.estado='aprobado' AND s.fecha_inicio >= NOW()-INTERVAL '180 days' ${sw}
         GROUP BY tp.id ORDER BY dias DESC`, params
      ),
      pool.query(
        `SELECT TO_CHAR(s.fecha_inicio,'YYYY-MM') AS mes,
                COUNT(s.id)::int                         AS solicitudes,
                COALESCE(SUM(s.dias_solicitados),0)::int AS dias
         FROM solicitudes s JOIN funcionarios f ON s.funcionario_id=f.id
         WHERE s.estado='aprobado' AND s.fecha_inicio >= NOW()-INTERVAL '180 days' ${sw}
         GROUP BY mes ORDER BY mes`, params
      ),
      pool.query(
        `SELECT COUNT(DISTINCT s.funcionario_id)::int    AS funcionarios_ausentes,
                COALESCE(SUM(s.dias_solicitados),0)::int AS total_dias,
                COUNT(s.id)::int                         AS total_solicitudes
         FROM solicitudes s JOIN funcionarios f ON s.funcionario_id=f.id
         WHERE s.estado='aprobado' AND s.fecha_inicio >= NOW()-INTERVAL '180 days' ${sw}`, params
      ),
    ]);

    const inicio = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const hoy    = new Date().toISOString().split('T')[0];

    res.json({
      periodo:       { desde: inicio, hasta: hoy },
      resumen:       resumen.rows[0],
      porFuncionario: porFuncionario.rows,
      porTipo:       porTipo.rows,
      porMes:        porMes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ausentismo' });
  }
});

// ─── Exportar funcionarios → Excel ───────────────────────────────────────────
router.get('/exportar/funcionarios', requierePermiso('reportes.ver_globales', 'auditoria.ver_todo'), async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();

    const [{ rows: funcs }, { rows: saldos }, { rows: horas }] = await Promise.all([
      pool.query(
        `SELECT f.*, sv.nombre AS servicio_nombre, d.nombre AS dispositivo_nombre,
                u.email AS usuario_email, u.rol AS usuario_rol,
                CONCAT(remp.nombres,' ',remp.apellidos) AS reemplaza_a_nombre
         FROM funcionarios f
         LEFT JOIN servicios sv   ON f.servicio_id=sv.id
         LEFT JOIN dispositivos d ON f.dispositivo_id=d.id
         LEFT JOIN usuarios u     ON u.funcionario_id=f.id AND u.activo=TRUE
         LEFT JOIN funcionarios remp ON f.reemplaza_a=remp.id
         ORDER BY f.apellidos, f.nombres`
      ),
      pool.query(
        `SELECT sf.funcionario_id, tp.nombre AS tipo, tp.codigo,
                sf.dias_asignados, sf.dias_usados, sf.dias_pendientes,
                (sf.dias_asignados-sf.dias_usados-sf.dias_pendientes) AS disponible
         FROM saldos_funcionarios sf
         JOIN tipos_permisos tp ON sf.tipo_permiso_id=tp.id
         WHERE sf.anio=$1 AND tp.activo=TRUE ORDER BY tp.nombre`, [anio]
      ),
      pool.query(
        `SELECT hc.funcionario_id,
                COALESCE(SUM(hc.horas_compensatorias),0) AS ganadas
         FROM horas_compensatorias hc WHERE hc.estado='activo'
         GROUP BY hc.funcionario_id`
      ),
    ]);

    // Mapas auxiliares
    const saldoMap = {};
    for (const s of saldos) {
      if (!saldoMap[s.funcionario_id]) saldoMap[s.funcionario_id] = [];
      saldoMap[s.funcionario_id].push(s);
    }
    const horasMap = {};
    for (const h of horas) horasMap[h.funcionario_id] = parseFloat(h.ganadas);

    // ── Workbook ──
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CESFAM Los Cerros';
    wb.created = new Date();

    // ── Hoja 1: Funcionarios ──
    const ws = wb.addWorksheet('Funcionarios', { views: [{ state: 'frozen', ySplit: 3 }] });

    // Título institucional
    ws.mergeCells('A1:S1');
    const t1 = ws.getCell('A1');
    t1.value = 'CESFAM LOS CERROS — TALCAHUANO  |  Reporte de Funcionarios';
    t1.font  = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    t1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    t1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    ws.mergeCells('A2:S2');
    const t2 = ws.getCell('A2');
    t2.value = `Año ${anio}  |  Generado: ${new Date().toLocaleString('es-CL')}  |  Por: ${req.usuario.email || ''}`;
    t2.font  = { italic: true, size: 10, color: { argb: 'FFFFFFFF' } };
    t2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B5278' } };
    t2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 16;

    const cols = [
      { h: 'ID',            k: 'id',                width: 7  },
      { h: 'RUT',           k: 'rut',               width: 14 },
      { h: 'Apellidos',     k: 'apellidos',          width: 22 },
      { h: 'Nombres',       k: 'nombres',            width: 22 },
      { h: 'Cargo',         k: 'cargo',              width: 24 },
      { h: 'Sector',        k: 'sector',             width: 12 },
      { h: 'Área',          k: 'area',               width: 14 },
      { h: 'Servicio',      k: 'servicio_nombre',    width: 18 },
      { h: 'Dispositivo',   k: 'dispositivo_nombre', width: 18 },
      { h: 'Tipo Contrato', k: 'tipo_contrato',      width: 18 },
      { h: 'Hrs Contrato',  k: 'horas_contrato',     width: 12 },
      { h: 'Fecha Ingreso', k: 'fecha_ingreso',      width: 14 },
      { h: 'Activo',        k: 'activo',             width: 9  },
      { h: 'Email',         k: 'usuario_email',      width: 28 },
      { h: 'Rol',           k: 'usuario_rol',        width: 13 },
      { h: `Feriado ${anio}`,    k: 's_fl', width: 14 },
      { h: `Adm. ${anio}`,       k: 's_pa', width: 12 },
      { h: `Hrs Comp.`,          k: 'hc',   width: 12 },
      { h: 'Reemplaza A',   k: 'reemplaza_a_nombre', width: 22 },
    ];

    const headerRow = ws.getRow(3);
    headerRow.values = cols.map(c => c.h);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B6B9E' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FF1E3A5F' } } };
    });
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

    funcs.forEach((f, idx) => {
      const sl = saldoMap[f.id] || [];
      const fl = sl.find(s => s.codigo === 'FL' || s.tipo?.toLowerCase().includes('feriado'));
      const pa = sl.find(s => s.codigo === 'PA' || s.tipo?.toLowerCase().includes('administrativ'));

      const row = ws.addRow([
        f.id, f.rut, f.apellidos, f.nombres, f.cargo,
        f.sector, f.area, f.servicio_nombre, f.dispositivo_nombre,
        f.tipo_contrato, f.horas_contrato,
        f.fecha_ingreso ? new Date(f.fecha_ingreso).toLocaleDateString('es-CL') : '',
        f.activo ? 'Activo' : 'Inactivo',
        f.usuario_email, f.usuario_rol,
        fl ? parseFloat(fl.disponible) : '',
        pa ? parseFloat(pa.disponible) : '',
        horasMap[f.id] || 0,
        f.reemplaza_a_nombre || '',
      ]);
      row.height = 15;
      if (idx % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FB' } };
        });
      }
      // Marcar inactivos en gris
      if (!f.activo) {
        row.eachCell(cell => {
          cell.font = { color: { argb: 'FF999999' }, italic: true };
        });
      }
    });

    ws.autoFilter = {
      from: { row: 3, column: 1 },
      to:   { row: 3, column: cols.length },
    };

    // ── Hoja 2: Saldos detallados ──
    const ws2 = wb.addWorksheet('Saldos');
    const hdr2 = ws2.addRow(['Funcionario', 'RUT', 'Sector', 'Tipo Permiso', 'Código', 'Asignados', 'Usados', 'Pendientes', 'Disponibles']);
    hdr2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hdr2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B6B9E' } };
    hdr2.height = 18;
    [18, 14, 12, 22, 12, 11, 10, 11, 11].forEach((w, i) => { ws2.getColumn(i+1).width = w; });

    for (const f of funcs) {
      for (const s of (saldoMap[f.id] || [])) {
        const r = ws2.addRow([
          `${f.apellidos} ${f.nombres}`, f.rut, f.sector,
          s.tipo, s.codigo, s.dias_asignados, s.dias_usados, s.dias_pendientes, s.disponible,
        ]);
        if (parseFloat(s.disponible) < 0) {
          r.getCell(9).font = { color: { argb: 'FFCC0000' }, bold: true };
        }
      }
    }
    ws2.autoFilter = { from: 'A1', to: 'I1' };

    // ── Hoja 3: Ausentismo 180 días ──
    const ws3 = wb.addWorksheet('Ausentismo 180 días');
    ws3.addRow(['Ranking Ausentismo — Últimos 180 días']).font = { bold: true, size: 12 };
    ws3.addRow([]);
    const hdr3 = ws3.addRow(['Funcionario', 'RUT', 'Cargo', 'Sector', 'N° Solicitudes', 'Total Días']);
    hdr3.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hdr3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B6B9E' } };

    const { rows: aus } = await pool.query(
      `SELECT f.nombres, f.apellidos, f.cargo, f.sector, f.rut,
              COUNT(s.id)::int AS total_solicitudes,
              COALESCE(SUM(s.dias_solicitados),0)::int AS total_dias
       FROM funcionarios f JOIN solicitudes s ON s.funcionario_id=f.id
       WHERE s.estado='aprobado' AND s.fecha_inicio >= NOW()-INTERVAL '180 days'
       GROUP BY f.id ORDER BY total_dias DESC LIMIT 50`
    );
    for (const a of aus) {
      ws3.addRow([`${a.apellidos} ${a.nombres}`, a.rut, a.cargo, a.sector, a.total_solicitudes, a.total_dias]);
    }
    [24, 14, 22, 12, 14, 10].forEach((w, i) => { ws3.getColumn(i+1).width = w; });

    // ── Respuesta ──
    const fecha = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="funcionarios_${anio}_${fecha}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar Excel' });
  }
});

// ─── Exportar permisos → CSV ──────────────────────────────────────────────────
router.get('/exportar/permisos', async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, estado, sector } = req.query;
    const params = [];
    const where  = ['1=1'];

    if (fecha_inicio) { params.push(fecha_inicio); where.push(`s.fecha_inicio >= $${params.length}`); }
    if (fecha_fin)    { params.push(fecha_fin);    where.push(`s.fecha_fin <= $${params.length}`); }
    if (estado)       { params.push(estado);       where.push(`s.estado = $${params.length}`); }
    if (sector)       { params.push(sector);       where.push(`f.sector = $${params.length}`); }

    if (req.usuario.rol === 'supervisor' && !tieneVisibilidadGlobal(req)) {
      if (req.usuario.sector) { params.push(req.usuario.sector); where.push(`f.sector = $${params.length}`); }
    }

    const { rows } = await pool.query(
      `SELECT f.rut, f.apellidos||' '||f.nombres AS funcionario, f.cargo, f.sector,
              tp.nombre AS tipo_permiso, s.fecha_inicio, s.fecha_fin, s.dias_solicitados,
              s.estado, s.jornada_medio_dia, s.fecha_solicitud
       FROM solicitudes s
       JOIN funcionarios f   ON s.funcionario_id=f.id
       JOIN tipos_permisos tp ON s.tipo_permiso_id=tp.id
       WHERE ${where.join(' AND ')}
       ORDER BY s.fecha_inicio DESC`, params
    );

    const fmt = (d) => d ? new Date(d).toLocaleDateString('es-CL') : '';
    const esc  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const lines = [
      `"CESFAM LOS CERROS — Reporte de Permisos"`,
      `"Generado: ${new Date().toLocaleString('es-CL')}"`,
      '',
      ['RUT','Funcionario','Cargo','Sector','Tipo Permiso','Fecha Inicio','Fecha Fin','Días','Estado','Medio Día','Fecha Solicitud'].map(esc).join(';'),
      ...rows.map(r => [
        esc(r.rut), esc(r.funcionario), esc(r.cargo), esc(r.sector),
        esc(r.tipo_permiso), esc(fmt(r.fecha_inicio)), esc(fmt(r.fecha_fin)),
        esc(r.dias_solicitados), esc(r.estado), esc(r.jornada_medio_dia ? 'Sí' : 'No'),
        esc(fmt(r.fecha_solicitud)),
      ].join(';')),
    ];

    const fecha = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="permisos_${fecha}.csv"`);
    res.send('﻿' + lines.join('\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al exportar CSV' });
  }
});

module.exports = router;
