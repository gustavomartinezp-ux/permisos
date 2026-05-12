require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run(file) {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  // Remove lines starting with -- and split on semicolons
  const statements = sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      const res = await pool.query(stmt);
      if (res.rows && res.rows.length > 0) {
        console.log('Resultado:', JSON.stringify(res.rows, null, 2));
      }
    } catch (err) {
      console.error(`Error en:\n${stmt}\n→ ${err.message}`);
    }
  }
}

(async () => {
  console.log('\n=== Migración 1: supabase_campos_funcionarios.sql ===');
  await run('supabase_campos_funcionarios.sql');

  console.log('\n=== Migración 2: supabase_feriado_legal.sql ===');
  await run('supabase_feriado_legal.sql');

  console.log('\n=== Migración 3: supabase_nuevos_tipos.sql ===');
  await run('supabase_nuevos_tipos.sql');

  console.log('\n✓ Migraciones completas');
  await pool.end();
})();
