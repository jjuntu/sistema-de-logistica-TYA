const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const logger = require('../services/logger');
const { procesarOrden } = require('../services/procesadorOrdenes');
const { agregarTarea } = require('../services/queue');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// MERCADO LIBRE
// ML manda un POST con topic + resource cuando hay un evento.
// Después hay que hacer GET a la resource para buscar los datos.
// ─────────────────────────────────────────────
router.post('/mercadolibre', async (req, res) => {
  try {
    const body = JSON.parse(req.body.toString());
    const { topic, resource, user_id } = body;

    logger.info(`Webhook ML recibido — topic: ${topic}, resource: ${resource}`);

    // Guardar log raw siempre
    await prisma.webhookLog.create({
      data: { fuente: 'mercadolibre', payload: body }
    });

    // Solo procesar órdenes pagadas
    if (topic !== 'orders_v2' && topic !== 'orders') {
      return res.sendStatus(200); // ML requiere 200 inmediato
    }

    // Encolar el procesamiento asíncrono (ML necesita el 200 en < 5 seg)
    await agregarTarea('procesar-orden-ml', {
      resource,
      user_id,
      fuente: 'MERCADOLIBRE'
    });

    res.sendStatus(200);
  } catch (err) {
    logger.error('Error en webhook ML:', err);
    res.sendStatus(200); // Siempre 200 a ML para que no reintente
  }
});

// ─────────────────────────────────────────────
// WOOCOMMERCE (abctechos.com)
// WC manda un POST completo con todos los datos de la orden.
// Verificamos la firma HMAC con el secret.
// ─────────────────────────────────────────────
router.post('/woocommerce', async (req, res) => {
  try {
    // Verificar firma de WooCommerce
    const signature = req.headers['x-wc-webhook-signature'];
    if (signature && process.env.WC_WEBHOOK_SECRET) {
      const hash = crypto
        .createHmac('sha256', process.env.WC_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('base64');
      if (hash !== signature) {
        logger.warn('Firma inválida en webhook WooCommerce');
        return res.sendStatus(401);
      }
    }

    const orden = req.body;
    logger.info(`Webhook WC recibido — order_id: ${orden.id}, status: ${orden.status}`);

    await prisma.webhookLog.create({
      data: { fuente: 'woocommerce', payload: orden }
    });

    // Solo procesar órdenes completadas o procesando
    if (!['processing', 'completed'].includes(orden.status)) {
      return res.sendStatus(200);
    }

    await agregarTarea('procesar-orden-wc', {
      orden,
      fuente: 'WOOCOMMERCE'
    });

    res.sendStatus(200);
  } catch (err) {
    logger.error('Error en webhook WooCommerce:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// TIENDANUBE (acerosinoxidables.com.ar)
// TN manda un POST con evento + datos de la orden.
// ─────────────────────────────────────────────
router.post('/tiendanube', async (req, res) => {
  try {
    const { event, store_id } = req.body;
    logger.info(`Webhook TN recibido — event: ${event}, store: ${store_id}`);

    await prisma.webhookLog.create({
      data: { fuente: 'tiendanube', payload: req.body }
    });

    // Solo procesar órdenes pagadas
    if (!['order/paid', 'order/packed', 'order/fulfilled'].includes(event)) {
      return res.sendStatus(200);
    }

    await agregarTarea('procesar-orden-tn', {
      datos: req.body,
      fuente: 'TIENDANUBE'
    });

    res.sendStatus(200);
  } catch (err) {
    logger.error('Error en webhook Tiendanube:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ENDPOINT DE PRUEBA (para verificar que el server responde)
// ML te pide verificar la URL con un GET antes de guardarla
// ─────────────────────────────────────────────
router.get('/mercadolibre', (req, res) => {
  res.json({ status: 'ok', message: 'Webhook ABCTechos Logística activo' });
});
router.get('/woocommerce', (req, res) => {
  res.json({ status: 'ok', message: 'Webhook WooCommerce activo' });
});
router.get('/tiendanube', (req, res) => {
  res.json({ status: 'ok', message: 'Webhook Tiendanube activo' });
});

module.exports = router;
