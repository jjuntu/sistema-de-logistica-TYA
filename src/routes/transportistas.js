// routes/transportistas.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const lista = await prisma.transportista.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    });
    res.json(lista);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const t = await prisma.transportista.create({ data: req.body });
    res.status(201).json(t);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const t = await prisma.transportista.update({ where: { id: req.params.id }, data: req.body });
    res.json(t);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.transportista.update({ where: { id: req.params.id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
