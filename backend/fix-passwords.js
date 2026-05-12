require('dotenv').config();
const { pool } = require('./src/db');
const bcrypt = require('bcryptjs');

async function fixPasswords() {
  const hash = bcrypt.hashSync('password', 10);
  console.log('Actualizando contraseñas...');
  const result = await pool.query(
    'UPDATE usuarios SET password_hash = $1',
    [hash]
  );
  console.log(`OK — ${result.rowCount} usuario(s) actualizados.`);
  console.log('Contraseña para todos los usuarios: password');
  await pool.end();
}

fixPasswords().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
