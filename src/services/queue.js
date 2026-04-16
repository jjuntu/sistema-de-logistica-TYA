const logger = require('./logger');
const { procesarOrdenML, procesarOrdenWC, procesarOrdenTN } = require('./procesadorOrdenes');

// Bull usa Redis. Si no hay Redis disponible, procesamos inline.
let ventasQueue = null;

async function initQueue() {
  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL no configurado — cola desactivada, procesando inline');
    return;
  }

  const Bull = require('bull');
  ventasQueue = new Bull('ventas', process.env.REDIS_URL);

  ventasQueue.process('procesar-orden-ml', 3, async (job) => {
    return procesarOrdenML(job.data);
  });

  ventasQueue.process('procesar-orden-wc', 3, async (job) => {
    return procesarOrdenWC(job.data);
  });

  ventasQueue.process('procesar-orden-tn', 3, async (job) => {
    return procesarOrdenTN(job.data);
  });

  ventasQueue.on('completed', (job) => {
    logger.info(`Tarea ${job.name} #${job.id} completada`);
  });

  ventasQueue.on('failed', (job, err) => {
    logger.error(`Tarea ${job.name} #${job.id} falló:`, err.message);
  });

  logger.info('Cola Bull inicializada con Redis');
}

async function agregarTarea(tipo, datos) {
  if (ventasQueue) {
    await ventasQueue.add(tipo, datos, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50
    });
    logger.info(`Tarea ${tipo} encolada`);
  } else {
    // Sin Redis: procesar directamente (sincrónico, suficiente para empezar)
    logger.info(`Procesando ${tipo} inline (sin Redis)`);
    try {
      if (tipo === 'procesar-orden-ml') await procesarOrdenML(datos);
      if (tipo === 'procesar-orden-wc') await procesarOrdenWC(datos);
      if (tipo === 'procesar-orden-tn') await procesarOrdenTN(datos);
    } catch (err) {
      logger.error(`Error procesando ${tipo} inline:`, err.message);
    }
  }
}

module.exports = { initQueue, agregarTarea };
