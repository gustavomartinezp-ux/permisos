require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { pool } = require('./db');
const { runMigrations } = require('./db/migrate');

const authRoutes = require('./routes/auth');
const funcionariosRoutes = require('./routes/funcionarios');
const solicitudesRoutes = require('./routes/solicitudes');
const saldosRoutes = require('./routes/saldos');
const historialRoutes = require('./routes/historial');
const dashboardRoutes = require('./routes/dashboard');
const tiposPermisosRoutes      = require('./routes/tipos-permisos');
const dispositivosRoutes       = require('./routes/dispositivos');
const serviciosRoutes          = require('./routes/servicios');
const usuariosRoutes           = require('./routes/usuarios');
const horasCompRoutes          = require('./routes/horas-compensatorias');
const solicitudesCompRoutes    = require('./routes/solicitudes-compensacion');
const reportesRoutes           = require('./routes/reportes');
const suplenciasRoutes         = require('./routes/suplencias');
const rolesRoutes               = require('./routes/roles');
const subrogacionesRoutes       = require('./routes/subrogaciones');
const reporteTareasRoutes       = require('./routes/reporte-tareas');
const birthdaysRoutes           = require('./routes/birthdays');
const feriadoLegalRoutes        = require('./routes/feriado-legal');
const licenciasMedicasRoutes    = require('./routes/licencias-medicas');
const cometidosComisionesRoutes = require('./routes/cometidos-comisiones');
const { evaluarHitosAntiguedad } = require('./workers/antiguedadWorker');

const app = express();

const originesPermitidos = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || originesPermitidos.some(o => o === origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS no permitido'));
    }
  },
  credentials: true,
}));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/saldos', saldosRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tipos-permisos', tiposPermisosRoutes);
app.use('/api/dispositivos',              dispositivosRoutes);
app.use('/api/servicios',                serviciosRoutes);
app.use('/api/usuarios',                 usuariosRoutes);
app.use('/api/horas-compensatorias',     horasCompRoutes);
app.use('/api/solicitudes-compensacion', solicitudesCompRoutes);
app.use('/api/reportes',                 reportesRoutes);
app.use('/api/suplencias',               suplenciasRoutes);
app.use('/api/roles',                    rolesRoutes);
app.use('/api/subrogaciones',            subrogacionesRoutes);
app.use('/api/reporte-tareas',           reporteTareasRoutes);
app.use('/api/birthdays',                birthdaysRoutes);
app.use('/api/feriado-legal',            feriadoLegalRoutes);
app.use('/api/licencias-medicas',        licenciasMedicasRoutes);
app.use('/api/cometidos-comisiones',     cometidosComisionesRoutes);

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
runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor CESFAM Los Cerros corriendo en puerto ${PORT}`);
    });

    // Monitoreo continuo de hitos de antigüedad (bono de +5 días a los 15/20
    // años de servicio): se corre al levantar el servidor (por si estuvo
    // dormido el día exacto de algún hito) y luego cada 6 horas. Sin cron
    // externo — mismo criterio que el resto del proyecto (Render free tier).
    evaluarHitosAntiguedad().catch((err) => console.error('[antiguedad] error en verificación inicial:', err.message));
    setInterval(() => {
      evaluarHitosAntiguedad().catch((err) => console.error('[antiguedad] error en verificación periódica:', err.message));
    }, 6 * 60 * 60 * 1000);
  })
  .catch((err) => {
    console.error('No se pudieron ejecutar las migraciones:', err.message);
    process.exit(1);
  });
