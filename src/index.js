require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./services/logger');
const webhookRoutes = require('./routes/webhooks');
const ventasRoutes = require('./routes/ventas');
const transportistasRoutes = require('./routes/transportistas');
const tangoRoutes = require('./routes/tango');
const { initQueue } = require('./services/queue');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Seguridad y middleware ──
app.set('trust proxy', 1); // Railway usa proxy
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Rate limiting general
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes, esperá un momento.' }
}));

// Rate limiting estricto para webhooks (previene abuso)
app.use('/webhook', rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
}));

// Body parsers
// Los webhooks de ML necesitan el body raw para verificar firma
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rutas ──
app.use('/webhook', webhookRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/transportistas', transportistasRoutes);
app.use('/api/tango', tangoRoutes);

// Health check (Railway lo usa para saber si el server está vivo)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error global
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Inicio ──
async function start() {
  try {
    await initQueue();
    logger.info('Cola de tareas inicializada');
  } catch (e) {
    logger.warn('Redis no disponible, cola desactivada:', e.message);
  }

  app.listen(PORT, () => {
    logger.info(`Servidor ABCTechos Logística corriendo en puerto ${PORT}`);
    logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}

start();

module.exports = app;
