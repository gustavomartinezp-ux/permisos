require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await pool.query(`
    INSERT INTO tipos_permisos (codigo, nombre, descripcion, dias_anuales_max, color) VALUES
      ('LICENCIA','Licencia Médica','Licencia médica por enfermedad o accidente',0,'#EF4444'),
      ('CAPACIT','Días de Capacitación','Días destinados a capacitación y formación',5,'#06B6D4')
    ON CONFLICT (codigo) DO NOTHING
  `);
  console.log('Tipos OK');

  const tipos = await pool.query(
    `SELECT id, dias_anuales_max FROM tipos_permisos WHERE codigo IN ('LICENCIA','CAPACIT') AND activo=true`
  );
  const funcs = await pool.query(`SELECT id FROM funcionarios WHERE activo=true`);
  let count = 0;
  for (const t of tipos.rows) {
    for (const f of funcs.rows) {
      await pool.query(
        `INSERT INTO saldos_funcionarios (funcionario_id,tipo_permiso_id,anio,dias_asignados)
         VALUES ($1,$2,2026,$3) ON CONFLICT DO NOTHING`,
        [f.id, t.id, t.dias_anuales_max]
      );
      count++;
    }
  }
  console.log('Saldos creados:', count);

  const r = await pool.query('SELECT codigo, nombre, dias_anuales_max, activo FROM tipos_permisos ORDER BY nombre');
  console.table(r.rows);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
