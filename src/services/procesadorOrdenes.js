const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');
const { motorTransporte } = require('./motorTransporte');
const { enviarATango } = require('./tango');
const { notificarCliente } = require('./notificaciones');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// PROCESADOR PRINCIPAL
// Recibe una orden normalizada y la mete al sistema
// ─────────────────────────────────────────────
async function procesarOrdenNormalizada(ordenNorm) {
  const {
    canalExternoId, canal, unidad,
    cliente, items, total,
    direccion, notas
  } = ordenNorm;

  // Deduplicación: si ya existe esta orden externa, ignorar
  if (canalExternoId) {
    const existe = await prisma.venta.findFirst({
      where: { canalExternoId: String(canalExternoId) }
    });
    if (existe) {
      logger.info(`Orden ${canalExternoId} ya procesada (${existe.numero}), ignorando duplicado`);
      return existe;
    }
  }

  // Generar número de remito
  const numero = await generarNumeroRemito();

  // Motor de transporte: qué transportistas cubren esta zona
  const transporteSugerido = motorTransporte(direccion.provincia, items);

  // Crear la venta en la base de datos
  const venta = await prisma.venta.create({
    data: {
      numero,
      canal,
      canalExternoId: canalExternoId ? String(canalExternoId) : null,
      unidad,
      clienteNombre:   cliente.nombre,
      clienteEmpresa:  cliente.empresa || null,
      clienteEmail:    cliente.email || null,
      clienteTel:      cliente.tel || null,
      clienteDocumento: cliente.documento || null,
      dirCalle:     direccion.calle,
      dirLocalidad: direccion.localidad,
      dirProvincia: direccion.provincia,
      dirCP:        direccion.cp || null,
      transporteNombre: transporteSugerido?.[0]?.nombre || null,
      total,
      notas: notas || null,
      items: {
        create: items.map(i => ({
          descripcion: i.descripcion,
          cantidad:    i.cantidad,
          unidad:      i.unidad || 'un',
          precioUnit:  i.precioUnit,
          total:       i.cantidad * i.precioUnit
        }))
      },
      eventos: {
        create: [{
          tipo: 'CREADA',
          detalle: `Orden recibida vía ${canal}`
        }]
      }
    },
    include: { items: true }
  });

  logger.info(`Venta creada: ${venta.numero} — ${cliente.nombre} — ${direccion.provincia}`);

  // Enviar a Tango Factura de forma asíncrona (no bloquea)
  enviarATango(venta).catch(err =>
    logger.error(`Error enviando ${venta.numero} a Tango:`, err.message)
  );

  // Notificar al cliente si tiene email/tel
  if (cliente.email || cliente.tel) {
    notificarCliente(venta).catch(err =>
      logger.error(`Error notificando cliente:`, err.message)
    );
  }

  return venta;
}

// ─────────────────────────────────────────────
// NORMALIZADORES POR CANAL
// ─────────────────────────────────────────────

// Mercado Libre — primero hay que buscar los datos completos vía API
async function procesarOrdenML({ resource, user_id }) {
  const token = process.env.ML_ACCESS_TOKEN;
  if (!token) throw new Error('ML_ACCESS_TOKEN no configurado');

  // Buscar datos completos de la orden en la API de ML
  const url = `https://api.mercadolibre.com${resource}`;
  const { data: orden } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  logger.info(`ML orden ${orden.id} — status: ${orden.status}, pago: ${orden.payments?.[0]?.status}`);

  // Solo procesar si está pagada
  if (orden.status !== 'paid' && orden.payments?.[0]?.status !== 'approved') {
    logger.info(`ML orden ${orden.id} no está pagada todavía, ignorando`);
    return null;
  }

  const envio = orden.shipping || {};
  const comprador = orden.buyer || {};
  const direccion = envio.receiver_address || {};

  // Buscar datos del envío si tiene shipping_id
  let dirDetalle = {};
  if (envio.id) {
    try {
      const { data: ship } = await axios.get(
        `https://api.mercadolibre.com/shipments/${envio.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      dirDetalle = ship.receiver_address || {};
    } catch(e) {
      logger.warn('No se pudo obtener datos de envío ML:', e.message);
    }
  }

  const dir = {
    calle:     dirDetalle.street_name || direccion.street_name || 'A confirmar',
    localidad: dirDetalle.city?.name || direccion.city?.name || '',
    provincia: normalizarProvincia(dirDetalle.state?.name || direccion.state?.name || ''),
    cp:        dirDetalle.zip_code || direccion.zip_code || ''
  };

  const ordenNorm = {
    canalExternoId: orden.id,
    canal:   'MERCADOLIBRE',
    unidad:  detectarUnidadML(orden),
    cliente: {
      nombre:    `${comprador.first_name || ''} ${comprador.last_name || ''}`.trim() || 'Cliente ML',
      email:     comprador.email || null,
      tel:       null,
      documento: null
    },
    direccion: dir,
    items: (orden.order_items || []).map(i => ({
      descripcion: i.item?.title || 'Producto ML',
      cantidad:    i.quantity || 1,
      unidad:      'un',
      precioUnit:  i.unit_price || 0
    })),
    total: orden.total_amount || 0,
    notas: `Orden ML #${orden.id}`
  };

  return procesarOrdenNormalizada(ordenNorm);
}

// WooCommerce
async function procesarOrdenWC({ orden }) {
  const shipping = orden.shipping || {};
  const billing  = orden.billing  || {};

  const dir = {
    calle:     `${shipping.address_1 || billing.address_1 || ''} ${shipping.address_2 || ''}`.trim(),
    localidad: shipping.city || billing.city || '',
    provincia: normalizarProvincia(shipping.state || billing.state || ''),
    cp:        shipping.postcode || billing.postcode || ''
  };

  const ordenNorm = {
    canalExternoId: orden.id,
    canal:   'WOOCOMMERCE',
    unidad:  'ABCTECHOS',
    cliente: {
      nombre:    `${billing.first_name || ''} ${billing.last_name || ''}`.trim(),
      empresa:   billing.company || null,
      email:     billing.email || null,
      tel:       billing.phone || null
    },
    direccion: dir,
    items: (orden.line_items || []).map(i => ({
      descripcion: i.name,
      cantidad:    i.quantity,
      unidad:      'un',
      precioUnit:  parseFloat(i.price) || 0
    })),
    total: parseFloat(orden.total) || 0,
    notas: orden.customer_note || null
  };

  return procesarOrdenNormalizada(ordenNorm);
}

// Tiendanube — el webhook manda solo {store_id, event, id}, hay que ir a buscar la orden completa
async function procesarOrdenTN({ datos }) {
  const token = process.env.TN_ACCESS_TOKEN;
  const storeId = datos.store_id || process.env.TN_USER_ID;

  if (!token) throw new Error('TN_ACCESS_TOKEN no configurado');
  if (!storeId) throw new Error('store_id no recibido y TN_USER_ID no configurado');

  const orderId = datos.id || datos.order?.id;
  if (!orderId) throw new Error('order id no recibido en webhook TN');

  // Fetch la orden completa desde la API de Tiendanube
  const url = `https://api.tiendanube.com/v1/${storeId}/orders/${orderId}`;
  logger.info(`TN: obteniendo orden completa desde ${url}`);

  const { data: orden } = await axios.get(url, {
    headers: {
      'Authentication': `bearer ${token}`,
      'User-Agent': 'ABCTechos Logistica (info@abctechos.com)'
    }
  });

  logger.info(`TN orden ${orden.id} — status: ${orden.status}, payment: ${orden.payment_status}, total: ${orden.total}`);

  const cliente  = orden.customer || {};
  const shipping = orden.shipping_address || {};

  // Armar direccion desde shipping_address
  const calleCompleta = [
    shipping.address,
    shipping.number,
    shipping.floor ? `piso ${shipping.floor}` : null
  ].filter(Boolean).join(' ').trim();

  const dir = {
    calle:     calleCompleta || 'A confirmar',
    localidad: shipping.city || shipping.locality || '',
    provincia: normalizarProvincia(shipping.province || ''),
    cp:        shipping.zipcode || ''
  };

  // Items: TN los llama "products"
  const items = (orden.products || []).map(i => ({
    descripcion: i.name || 'Producto',
    cantidad:    parseFloat(i.quantity) || 1,
    unidad:      'un',
    precioUnit:  parseFloat(i.price) || 0
  }));

  // Nombre del cliente: primero intento customer.name, sino first+last del shipping
  const nombreCliente = (
    cliente.name ||
    `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim() ||
    `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim() ||
    'Cliente TN'
  );

  const ordenNorm = {
    canalExternoId: orden.id,
    canal:   'TIENDANUBE',
    unidad:  'ACEROINOXIDABLES',
    cliente: {
      nombre:    nombreCliente,
      email:     cliente.email || orden.contact_email || null,
      tel:       cliente.phone || shipping.phone || orden.contact_phone || null,
      documento: cliente.identification || null
    },
    direccion: dir,
    items,
    total: parseFloat(orden.total) || 0,
    notas: orden.owner_note || null
  };

  return procesarOrdenNormalizada(ordenNorm);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
async function generarNumeroRemito() {
  const result = await prisma.$transaction(async (tx) => {
    let contador = await tx.contador.findUnique({ where: { id: 'remito_counter' } });
    if (!contador) {
      contador = await tx.contador.create({ data: { id: 'remito_counter', valor: 1 } });
    }
    await tx.contador.update({
      where: { id: 'remito_counter' },
      data: { valor: { increment: 1 } }
    });
    return contador.valor;
  });
  return `R${String(result).padStart(4, '0')}`;
}

function detectarUnidadML(orden) {
  const titulo = (orden.order_items?.[0]?.item?.title || '').toLowerCase();
  if (titulo.includes('inox') || titulo.includes('acero') || titulo.includes('caño')) {
    return 'ACEROINOXIDABLES';
  }
  return 'ABCTECHOS';
}

// Normaliza nombres de provincia a formato estándar
function normalizarProvincia(raw) {
  const mapa = {
    'buenos aires': 'Buenos Aires (GBA)',
    'ba': 'Buenos Aires (GBA)',
    'caba': 'Capital Federal',
    'capital federal': 'Capital Federal',
    'ciudad autonoma': 'Capital Federal',
    'cordoba': 'Córdoba',
    'santa fe': 'Santa Fe',
    'mendoza': 'Mendoza',
    'tucuman': 'Tucumán',
    'entre rios': 'Entre Ríos',
    'corrientes': 'Corrientes',
    'misiones': 'Misiones',
    'chaco': 'Chaco',
    'salta': 'Salta',
    'jujuy': 'Jujuy',
    'neuquen': 'Neuquén',
    'rio negro': 'Río Negro',
    'chubut': 'Chubut',
    'santa cruz': 'Santa Cruz',
    'tierra del fuego': 'Tierra del Fuego',
    'la pampa': 'La Pampa',
    'san luis': 'San Luis',
    'san juan': 'San Juan',
    'catamarca': 'Catamarca',
    'la rioja': 'La Rioja',
    'formosa': 'Formosa',
    'santiago del estero': 'Santiago del Estero',
  };
  const key = (raw || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
  return mapa[key] || raw || 'Sin especificar';
}

module.exports = {
  procesarOrdenML,
  procesarOrdenWC,
  procesarOrdenTN,
  procesarOrdenNormalizada
};
