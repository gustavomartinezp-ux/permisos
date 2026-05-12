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

    // 1. Sector para funcionarios (Verde, Azul, Amarillo, Rojo, Lila)
    await client.query(`ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS sector VARCHAR(20)`);
    console.log('✅ funcionarios.sector');

    // 2. Sector para usuarios (supervisor gestiona su sector)
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sector VARCHAR(20)`);
    console.log('✅ usuarios.sector');

    // 3. Campos de pre-aprobación en solicitudes
    await client.query(`ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS pre_aprobado_por INTEGER REFERENCES usuarios(id)`);
    await client.query(`ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS fecha_pre_aprobacion TIMESTAMPTZ`);
    await client.query(`ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS observaciones_supervisor TEXT`);
    console.log('✅ solicitudes: pre_aprobado_por, fecha_pre_aprobacion, observaciones_supervisor');

    // 4. Actualizar constraint de estado para incluir 'pre_aprobado'
    await client.query(`ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_estado_check`);
    await client.query(`
      ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_estado_check
      CHECK (estado IN ('pendiente', 'pre_aprobado', 'aprobado', 'rechazado'))
    `);
    console.log('✅ solicitudes.estado: constraint actualizado con pre_aprobado');

    await client.query('COMMIT');
    console.log('\n🎉 Migración 3 completada exitosamente');
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
