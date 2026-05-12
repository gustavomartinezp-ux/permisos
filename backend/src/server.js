require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');

const authRoutes = require('./routes/auth');
const funcionariosRoutes = require('./routes/funcionarios');
const solicitudesRoutes = require('./routes/solicitudes');
const saldosRoutes = require('./routes/saldos');
const historialRoutes = require('./routes/historial');
const dashboardRoutes = require('./routes/dashboard');
const tiposPermisosRoutes = require('./routes/tipos-permisos');
const dispositivosRoutes  = require('./routes/dispositivos');
const serviciosRoutes     = require('./routes/servicios');
const usuariosRoutes      = require('./routes/usuarios');

const app = express();

const originesPermitidos = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || originesPermitidos.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('CORS no permitido'));
    }
  },
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/saldos', saldosRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tipos-permisos', tiposPermisosRoutes);
app.use('/api/dispositivos',  dispositivosRoutes);
app.use('/api/servicios',     serviciosRoutes);
app.use('/api/usuarios',      usuariosRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'conectada', timestamp: new Date().toISOString() });
  } catch {
    res.status(500).json({ status: 'error', db: 'desconectada' });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor CESFAM Los Cerros corriendo en puerto ${PORT}`);
});
