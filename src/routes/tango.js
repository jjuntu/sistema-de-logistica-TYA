const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const logger = require('../services/logger');
const prisma = new PrismaClient();

const TANGO_BASE_URL = 'https://www.tangofactura.com/Services/Facturacion';

// Cache del token para no pedirlo en cada request
let cachedToken = null;
let tokenExpiry = null;

// Mapeo de provincias al formato que usa Tango
const TANGO_PROVINCIAS = {
  'Capital Federal':       'C',
  'Buenos Aires (GBA)':    'B',
  'Buenos Aires interior': 'B',
  'Córdoba':               'X',
  'Santa Fe':              'S',
  'Mendoza':               'M',
  'Tucumán':               'T',
  'Entre Ríos':            'E',
  'Corrientes':            'W',
  'Misiones':              'N',
  'Chaco':                 'H',
  'Salta':                 'A',
  'Jujuy':                 'Y',
  'Santiago del Estero':   'G',
  'Formosa':               'P',
  'La Rioja':              'F',
  'Catamarca':             'K',
  'San Juan':              'J',
  'San Luis':              'D',
  'La Pampa':              'L',
  'Neuquén':               'Q',
  'Río Negro':             'R',
  'Chubut':                'U',
  'Santa Cruz':            'Z',
  'Tierra del Fuego':      'V',
};

/**
 * Obtiene el token de acceso de Tango Factura
 * Lo cachea por 50 minutos
 */
async function obtenerToken() {
  const publicKey = process.env.TANGO_PUBLIC_KEY;
  const username  = process.env.TANGO_USERNAME;
  const password  = process.env.TANGO_PASSWORD;
  const userId    = process.env.TANGO_USER_ID;

  if (!publicKey || !username || !password || !userId) {
    throw new Error('Credenciales Tango no configuradas');
  }

  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  logger.info('Obteniendo token de Tango Factura...');
  const response = await axios.post(
    'https://www.tangofactura.com/api/Token',
    { ApplicationPublicKey: publicKey, Username: username, Password: password, UserIdentifier: userId },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  const token = response.data?.Token || response.data?.token || response.data?.access_token;
  if (!token) throw new Error('No se recibió token: ' + JSON.stringify(response.data));

  cachedToken = token;
  tokenExpiry = Date.now() + 50 * 60 * 1000;
  logger.info('Token Tango obtenido');
  return token;
}

/**
 * Envía una venta a Tango Factura
 */
async function enviarATango(venta) {
  if (!process.env.TANGO_PUBLIC_KEY) {
    logger.warn('Credenciales Tango no configuradas, saltando envío');
    return null;
  }

  try {
    const token = await obtenerToken();
    const payload = buildTangoPayload(venta, token);
    logger.info(`Enviando ${venta.numero} a Tango...`);

    const response = await axios.post(
      `${TANGO_BASE_URL}/CrearFactura`,
      payload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const tangoId = response.data?.MovimientoID || response.data?.Id || 'OK';
    logger.info(`Remito ${venta.numero} enviado a Tango — ID: ${tangoId}`);

    await prisma.venta.update({
      where: { id: venta.id },
      data: { tangoRemitoId: String(tangoId), tangoEnviado: true }
    });

    await prisma.eventoVenta.create({
      data: { ventaId: venta.id, tipo: 'TANGO_ENVIADO', detalle: `ID ${tangoId}` }
    });

    return response.data;
  } catch (err) {
    if (err.response?.status === 401) {
      cachedToken = null; tokenExpiry = null;
      logger.warn('Token Tango expirado, reintentando...');
      return enviarATango(venta);
    }
    const msg = err.response?.data?.Message || err.response?.data?.message || err.message;
    logger.error(`Error Tango ${venta.numero}: ${msg}`);
    await prisma.eventoVenta.create({
      data: { ventaId: venta.id, tipo: 'TANGO_ERROR', detalle: `Error: ${msg}` }
    });
    throw err;
  }
}

/**
 * Construye el payload para Tango Factura
 */
function buildTangoPayload(venta, token) {
  return {
    ApplicationPublicKey: process.env.TANGO_PUBLIC_KEY,
    UserIdentifier: process.env.TANGO_USER_ID,
    Token: token,
    Letra: 'B',
    ClienteNombre: venta.clienteEmpresa || venta.clienteNombre,
    ClienteDireccion: `${venta.dirCalle}, ${venta.dirLocalidad}`,
    FechaComprobante: new Date(venta.fecha).toISOString(),
    DetallesMovimiento: venta.items.map(item => ({
      ProductoNombre: item.descripcion,
      ProductoDescripcion: item.descripcion,
      Cantidad: item.cantidad,
      Precio: item.precioUnit,
      Bonificacion: 0
    })),
    Observaciones: [
      venta.notas,
      venta.transporteNombre ? `Transporte: ${venta.transporteNombre}` : null,
      `Canal: ${venta.canal}`, `Ref: ${venta.numero}`
    ].filter(Boolean).join(' | ')
  };
}

/**
 * Reintenta enviar a Tango los remitos que fallaron
 */
async function reintentarPendientes() {
  const pendientes = await prisma.venta.findMany({
    where: { tangoEnviado: false, estado: { not: 'CANCELADO' } },
    include: { items: true },
    take: 20
  });

  logger.info(`Reintentando ${pendientes.length} remitos pendientes de Tango`);
  for (const v of pendientes) {
    await enviarATango(v).catch(() => {});
  }
}

module.exports = { enviarATango, reintentarPendientes, buildTangoPayload };
