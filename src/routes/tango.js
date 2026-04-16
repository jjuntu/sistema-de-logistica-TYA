const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { enviarATango, reintentarPendientes } = require('../services/tango');
const logger = require('../services/logger');
const prisma = new PrismaClient();

router.post('/reenviar/:ventaId', async (req, res) => {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id: req.params.ventaId },
      include: { items: true }
    });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    const result = await enviarATango(venta);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reintentar-pendientes', async (req, res) => {
  try {
    await reintentarPendientes();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pendientes', async (req, res) => {
  try {
    const pendientes = await prisma.venta.findMany({
      where: { tangoEnviado: false, estado: { not: 'CANCELADO' } },
      select: { id: true, numero: true, fecha: true, clienteNombre: true, total: true }
    });
    res.json(pendientes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;