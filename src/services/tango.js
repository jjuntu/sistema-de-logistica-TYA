const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

const prisma = new PrismaClient();

const TANGO_BASE_URL = process.env.TANGO_API_URL || 'https://api.tangofactura.com';
const TANGO_TOKEN    = process.env.TANGO_API_TOKEN;

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
 * Envía una venta a Tango Factura como remito
 * Usa el endpoint POST /api/Voucher
 */
async function enviarATango(venta) {
  if (!TANGO_TOKEN) {
    logger.warn('TANGO_API_TOKEN no configurado, saltando envío a Tango');
    return null;
  }

  try {
    const payload = buildTangoPayload(venta);
    logger.info(`Enviando remito ${venta.numero} a Tango Factura...`);

    const response = await axios.post(
      `${TANGO_BASE_URL}/api/Voucher`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TANGO_TOKEN}`,
        },
        timeout: 15000
      }
    );

    const tangoId = response.data?.Id || response.data?.id;
    logger.info(`Remito ${venta.numero} enviado a Tango — ID: ${tangoId}`);

    // Actualizar venta con el ID de Tango
    await prisma.venta.update({
      where: { id: venta.id },
      data: {
        tangoRemitoId: String(tangoId),
        tangoEnviado: true
      }
    });

    await prisma.eventoVenta.create({
      data: {
        ventaId: venta.id,
        tipo: 'TANGO_ENVIADO',
        detalle: `Remito creado en Tango con ID ${tangoId}`
      }
    });

    return response.data;
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    logger.error(`Error enviando ${venta.numero} a Tango: ${msg}`);

    await prisma.eventoVenta.create({
      data: {
        ventaId: venta.id,
        tipo: 'TANGO_ERROR',
        detalle: `Error: ${msg}`
      }
    });

    throw err;
  }
}

/**
 * Construye el payload en el formato que espera Tango Factura API REST
 */
function buildTangoPayload(venta) {
  const provinciaCode = TANGO_PROVINCIAS[venta.dirProvincia] || 'B';

  return {
    // Tipo de comprobante: REM = Remito
    PtoVta: parseInt(process.env.TANGO_PTO_VTA || '1'),
    TipoComp: process.env.TANGO_TIPO_COMP || 'REM',

    // Fecha
    FechaComp: venta.fecha.toISOString().split('T')[0].replace(/-/g, '/'),

    // Cliente
    RazonSocial: venta.clienteEmpresa || venta.clienteNombre,
    NombreFantasia: venta.clienteNombre,
    CUIT: venta.clienteDocumento || '0000000000000',
    Domicilio: venta.dirCalle,
    Localidad: venta.dirLocalidad,
    Provincia: provinciaCode,
    CodigoPostal: venta.dirCP || '',
    EMail: venta.clienteEmail || '',
    Telefono: venta.clienteTel || '',

    // Unidad de negocio
    CodigoSucursal: venta.unidad === 'ABCTECHOS' ? '001' : '002',

    // Items
    Items: venta.items.map((item, idx) => ({
      Orden: idx + 1,
      Codigo: '',
      Descripcion: item.descripcion,
      Cantidad: item.cantidad,
      Unidad: item.unidad || 'UN',
      PrecioUnitario: item.precioUnit,
      Importe: item.total,
    })),

    // Totales
    Total: venta.total,

    // Observaciones
    Observaciones: [
      venta.notas,
      venta.transporteNombre ? `Transporte: ${venta.transporteNombre}` : null,
      `Canal: ${venta.canal}`,
      `Ref: ${venta.numero}`
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
