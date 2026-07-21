const bcrypt = require('bcryptjs');

// Contraseña por defecto institucional, la misma que ya usa la creación de
// funcionarios (POST /funcionarios, /bulk) vía INITIAL_PASSWORD — se unifica
// aquí para que exista una única definición de "contraseña por defecto".
const generarPasswordDefault = () => process.env.INITIAL_PASSWORD || 'cesfam2026';

const hashPasswordDefault = async () => bcrypt.hash(generarPasswordDefault(), 10);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = { generarPasswordDefault, hashPasswordDefault, EMAIL_REGEX };
