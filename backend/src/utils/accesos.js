'use strict';
const { pool } = require('../db');

// Registro de accesos a datos personales (Ley 21.719, deber de seguridad):
// quién consultó la ficha, las licencias médicas o los formularios de otro
// funcionario, y los inicios de sesión. Sirve para investigar y notificar una
// vulneración. Nunca interrumpe la petición si el registro falla.
//   recurso: 'ficha' | 'licencias' | 'documento' | 'login' | 'exportacion'
function registrarAcceso(req, { funcionarioId = null, recurso, detalle = null, usuarioId } = {}) {
  const usuario = usuarioId ?? req.usuario?.id ?? null;
  // La consulta de los propios datos no se registra (salvo el inicio de sesión)
  if (recurso !== 'login' && funcionarioId != null && req.usuario?.funcionario_id == funcionarioId) return;
  pool.query(
    'INSERT INTO accesos_datos (usuario_id, funcionario_id, recurso, detalle, ip) VALUES ($1, $2, $3, $4, $5)',
    [usuario, funcionarioId, recurso, detalle, String(req.ip || '').slice(0, 64)]
  ).catch((err) => console.error('[accesos] registro:', err.message));
}

module.exports = { registrarAcceso };
