const { Pool, types } = require('pg');
require('dotenv').config();

// Devolver NUMERIC como float en vez de string
types.setTypeParser(1700, (val) => parseFloat(val));
// Devolver DATE como texto 'YYYY-MM-DD'. Por defecto pg lo convierte a un Date
// a medianoche UTC; en el navegador (Chile, UTC-3/-4) eso se muestra como el
// día ANTERIOR (ej. un permiso del 15-oct aparecía "hasta 14 oct").
types.setTypeParser(1082, (val) => val);

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
  // Pooler de Supabase en modo transacción: admite muchas conexiones cliente.
  // 20 evita que las peticiones hagan fila cuando hay muchos usuarios a la vez.
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Error en cliente PostgreSQL:', err.message);
});

module.exports = { pool };
