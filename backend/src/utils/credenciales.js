const bcrypt = require('bcryptjs');

// Regla institucional: la contraseña por defecto es el RUT del funcionario
// sin puntos ni guión (ej. "12.345.678-9" -> "123456789K" si el DV es letra).
const limpiarRut = (rut) => (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();

const generarPasswordDefault = (rut) => limpiarRut(rut);

const hashPasswordDefault = async (rut) => bcrypt.hash(generarPasswordDefault(rut), 10);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = { limpiarRut, generarPasswordDefault, hashPasswordDefault, EMAIL_REGEX };
