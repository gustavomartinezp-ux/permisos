const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Área funcional para funcionarios (a qué área pertenece el funcionario)
    await client.query(`ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS area VARCHAR(40)`);
    console.log('✅ funcionarios.area');

    // 2. Área funcional para usuarios (qué área supervisa el jefe de área)
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area VARCHAR(40)`);
    console.log('✅ usuarios.area');

    await client.query('COMMIT');
    console.log('\n🎉 Migración 4 completada exitosamente');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

run();
