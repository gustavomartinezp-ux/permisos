const { pool } = require('./index');

const migrations = [
  {
    id: 'add_foto_url_to_funcionarios',
    sql: `ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS foto_url TEXT`,
  },
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE id = $1',
        [migration.id]
      );
      if (rows.length > 0) continue;

      await client.query(migration.sql);
      await client.query('INSERT INTO _migrations (id) VALUES ($1)', [migration.id]);
      console.log(`[migrate] ✓ ${migration.id}`);
    }
  } catch (err) {
    console.error('[migrate] Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
