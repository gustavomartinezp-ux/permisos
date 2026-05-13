const { Pool, types } = require('pg');
require('dotenv').config();

// Devolver NUMERIC como float en vez de string
types.setTypeParser(1700, (val) => parseFloat(val));

// Supabase (y otros hosts remotos) requieren SSL
const sslConfig = process.env.DATABASE_URL || process.env.DB_SSL === 'true'
  ? { rejectUnauthorized: false }
  : false;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
    }
  : {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: sslConfig,
    };

const pool = new Pool({
  ...poolConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Error en cliente PostgreSQL:', err.message);
});

module.exports = { pool };
