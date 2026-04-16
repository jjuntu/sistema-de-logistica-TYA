const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { motorTransporte } = require('../services/motorTransporte');
const { procesarOrdenNormalizada } = require('../services/procesadorOrdenes');

const { generarRemitoPDF } = require('../services/remitoPdf');


// GET /api/ventas — listar con filtros
router.get('/', async (req, res) => {
  try {
    const { estado, canal, unidad, fecha_desde, fecha_hasta, page = 1, limit = 50 } = req.query;
    const where = {};
    if (estado) where.estado = estado;
    if (canal)  where.canal  = canal;
    if (unidad) where.unidad = unidad;
    if (fecha_desde || fecha_hasta) {
      where.fecha = {};
      if (fecha_desde) where.fecha.gte = new Date(fecha_desde);
      if (fecha_hasta) where.fecha.lte = new Date(fecha_hasta);
    }

    const [ventas, total] = await Promise.all([
      prisma.venta.findMany({
        where,
        include: { items: true, eventos: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: (parseInt(page) - 1) * parseInt(limit)
      }),
      prisma.venta.count({ where })
    ]);

    res.json({ ventas, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ventas/:id/remito-pdf — genera PDF del remito
router.get('/:id/remito-pdf', async (req, res) => {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id: req.params.id },
      include: { items: true }
    });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    const fecha = new Date(venta.fecha);
    const fechaStr = fecha.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });

    const ventaData = {
      numero:           venta.numero,
      fecha:            fechaStr,
      vendedor:         venta.vendedor || 'SISTEMA',
      unidad:           venta.unidad || 'ABCTECHOS',
      clienteNombre:    venta.clienteNombre,
      clienteEmpresa:   venta.clienteEmpresa,
      clienteCuit:      venta.clienteDocumento,
      clienteCategoria: venta.clienteCategoria || 'CF',
      clienteTel:       venta.clienteTel,
      dirCalle:         venta.dirCalle,
      dirLocalidad:     venta.dirLocalidad,
      dirProvincia:     venta.dirProvincia,
      dirCP:            venta.dirCP,
      transporteNombre: venta.transporteNombre,
      notas:            venta.notas,
      items: venta.items.map(i => ({
        codigo:      '',
        descripcion: i.descripcion,
        cantidad:    i.cantidad,
        unidad:      i.unidad || 'Unidad',
      }))
    };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="remito-${venta.numero}.pdf"`);
    generarRemitoPDF(ventaData, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ventas/:id
router.get('/:id', async (req, res) => {router.get('/limpiar-pruebas', async (req, res) => {
  try {
    const ids = (await prisma.venta.findMany({
      where: { numero: { in: ['R0001','R0002','R0003'] } },
      select: { id: true }
    })).map(v => v.id);
    await prisma.eventoVenta.deleteMany({ where: { ventaId: { in: ids } } });
    await prisma.itemVenta.deleteMany({ where: { ventaId: { in: ids } } });
    const r = await prisma.venta.deleteMany({ where: { id: { in: ids } } });
    res.json({ ok: true, borrados: r.count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/ventas/:id
router.get('/:id', async (req, res) => {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id: req.params.id },
      include: { items: true, eventos: { orderBy: { createdAt: 'desc' } } }
    });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(venta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ventas — carga manual (WhatsApp, mostrador)
router.post('/', async (req, res) => {
  try {
    const venta = await procesarOrdenNormalizada({
      canal: req.body.canal || 'LOCAL',
      unidad: req.body.unidad || 'ABCTECHOS',
      cliente: req.body.cliente,
      direccion: req.body.direccion,
      items: req.body.items,
      total: req.body.total,
      notas: req.body.notas
    });
    res.status(201).json(venta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/ventas/:id/estado
router.patch('/:id/estado', async (req, res) => {
  try {
    const { estado, nota } = req.body;
    const venta = await prisma.venta.update({
      where: { id: req.params.id },
      data: { estado }
    });
    await prisma.eventoVenta.create({
      data: { ventaId: req.params.id, tipo: estado, detalle: nota || null }
    });
    res.json(venta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/ventas/:id/transporte
router.patch('/:id/transporte', async (req, res) => {
  try {
    const { nombre, costo, nota } = req.body;
    const venta = await prisma.venta.update({
      where: { id: req.params.id },
      data: { transporteNombre: nombre, transporteCosto: costo, transporteNota: nota }
    });
    await prisma.eventoVenta.create({
      data: {
        ventaId: req.params.id,
        tipo: 'TRANSPORTE_ASIGNADO',
        detalle: `${nombre}${costo ? ` — $${costo}` : ''}`
      }
    });
    res.json(venta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ventas/motor-transporte?provincia=X
router.get('/utils/motor-transporte', (req, res) => {
  const { provincia, items } = req.query;
  const resultado = motorTransporte(provincia, items ? JSON.parse(items) : []);
  res.json(resultado);
});

// GET /api/ventas/stats/resumen
router.get('/stats/resumen', async (req, res) => {
  try {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const [hoyCount, pendientes, transito, entregados] = await Promise.all([
      prisma.venta.count({ where: { fecha: { gte: hoy } } }),
      prisma.venta.count({ where: { estado: 'PENDIENTE' } }),
      prisma.venta.count({ where: { estado: 'TRANSITO' } }),
      prisma.venta.count({ where: { estado: 'ENTREGADO' } }),
    ]);
    res.json({ hoy: hoyCount, pendientes, transito, entregados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
