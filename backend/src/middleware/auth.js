const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

const soloAdmin = (req, res, next) => {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
};

const adminOSupervisor = (req, res, next) => {
  if (!['admin', 'supervisor'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'Acceso restringido a supervisores y administradores' });
  }
  next();
};

module.exports = { verificarToken, soloAdmin, adminOSupervisor };
