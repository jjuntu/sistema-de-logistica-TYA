const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');
const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// IMPORTANTE: Tango Factura usa application/x-www-form-urlencoded
// Los arrays van como DetallesMovimiento[0].Campo=valor
// ─────────────────────────────────────────────

const TANGO_BASE_URL  = 'https://www.tangofactura.com/Services/Facturacion';
const TANGO_TOKEN_URL = 'https://www.tangofactura.com/Provisioning/GetAuthToken';

let cachedToken = null;
let tokenExpiry = null;

// ─────────────────────────────────────────────
// Categorías impositivas
// 1 = Responsable Inscripto | 4 = Consumidor Final | 6 = Monotributista
// ─────────────────────────────────────────────
function resolverCategoriaImpositiva(venta) {
  const cat = venta.categoriaImpositiva || venta.clienteCategoria;
  if (!cat) {
    if (venta.clienteCuit && venta.clienteEmpresa) return 1;
    return 4;
  }
  const mapa = {
    'RI': 1, 'RESPONSABLE_INSCRIPTO': 1, 'RESPONSABLE INSCRIPTO': 1, '1': 1,
    'CF': 4, 'CONSUMIDOR_FINAL': 4, 'CONSUMIDOR FINAL': 4, '4': 4,
    'M':  6, 'MONOTRIBUTO': 6, 'MONOTRIBUTISTA': 6, '6': 6,
  };
  return mapa[String(cat).toUpperCase()] ?? 4;
}

// A → RI (cat 1) | B → CF (cat 4) y Monotributistas (cat 6)
function resolverLetra(categoriaImpositiva) {
  return categoriaImpositiva === 1 ? 'A' : 'B';
}

// 80 = CUIT | 96 = DNI | 99 = Sin identificar
function resolverTipoDocumento(venta, categoriaImpositiva) {
  if (venta.clienteCuit) return 80;
  if (venta.clienteDni)  return 96;
  if (categoriaImpositiva === 4) return 99;
  return 80;
}

function resolverNroDocumento(venta) {
  if (venta.clienteCuit) return venta.clienteCuit.replace(/[-]/g, '');
  if (venta.clienteDni)  return venta.clienteDni.replace(/[-]/g, '');
  return '0';
}

// Perfil según empresa
// 22749 = ABC TECHOS | 22750 = ACEROS INOXIDABLES
function resolverPerfilComprobante(venta) {
  const unidad = (venta.unidad || '').toUpperCase();
  const canal  = (venta.canal  || '').toUpperCase();

  // Prioridad: campo unidad (más confiable)
  if (unidad === 'ABCTECHOS' || unidad === 'ABC')              return 22749;
  if (unidad === 'ACEROINOXIDABLES' || unidad === 'ACEROS')    return 22750;

  // Fallback: canal
  if (canal === 'WOOCOMMERCE')                                  return 22749;
  if (canal === 'TIENDANUBE' || canal === 'MERCADOLIBRE')       return 22750;

  // Default
  return 22750;
}

// ─────────────────────────────────────────────
// TOKEN
// ─────────────────────────────────────────────
async function obtenerToken() {
  const publicKey = process.env.TANGO_PUBLIC_KEY;
  const username  = process.env.TANGO_USERNAME;
  const password  = process.env.TANGO_PASSWORD;
  const userId    = process.env.TANGO_USER_ID;

  if (!publicKey || !username || !password || !userId) {
    throw new Error('Credenciales Tango no configuradas');
  }

  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) return cachedToken;

  logger.info('Obteniendo token de Tango Factura...');
  const response = await axios.post(
    TANGO_TOKEN_URL,
    new URLSearchParams({ UserName: username, Password: password }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );

  const raw   = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  const token = raw.replace(/"/g, '').trim();
  if (!token) throw new Error('No se recibió token: ' + raw);

  cachedToken = token;
  tokenExpiry = Date.now() + 50 * 60 * 1000;
  logger.info('Token Tango obtenido');
  return token;
}

// ─────────────────────────────────────────────
// HELPER: aplanar items para form-urlencoded
// ─────────────────────────────────────────────
function aplanarItems(items) {
  const data = {};
  (items || []).forEach((item, i) => {
    data[`DetallesMovimiento[${i}].ProductoNombre`]      = item.descripcion || item.nombre || 'Producto';
    data[`DetallesMovimiento[${i}].ProductoDescripcion`] = item.descripcion || item.nombre || 'Producto';
    data[`DetallesMovimiento[${i}].Cantidad`]            = Number(item.cantidad) || 1;
    data[`DetallesMovimiento[${i}].Precio`]              = Number(item.precioUnit || item.precio) || 0;
    data[`DetallesMovimiento[${i}].Bonificacion`]        = 0;
  });
  return data;
}

// ─────────────────────────────────────────────
// HELPER: ejecutar llamada a Tango
// ─────────────────────────────────────────────
async function ejecutarTango(metodo, payload) {
  const token = await obtenerToken();
  const data  = {
    ApplicationPublicKey: process.env.TANGO_PUBLIC_KEY,
    UserIdentifier:       process.env.TANGO_USER_ID,
    Token:                token,
    ...payload,
  };

  const response = await axios.post(
    `${TANGO_BASE_URL}/${metodo}`,
    new URLSearchParams(data).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );

  const result = response.data;
  if (result?.CodigoError !== 0 && result?.Error?.length) {
    const msgs = result.Error.map(e => e.Mensaje).join(' | ');
    throw new Error(msgs);
  }
  return result?.Data;
}

// ─────────────────────────────────────────────
// CREAR REMITO EN TANGO
// ─────────────────────────────────────────────
async function crearRemitoTango(venta, token) {
  const nombreCliente = venta.clienteEmpresa || venta.clienteNombre || 'Sin nombre';
  const direccion     = [venta.dirCalle, venta.dirLocalidad].filter(Boolean).join(', ') || 'Sin dirección';
  const perfilId      = resolverPerfilComprobante(venta);

  logger.info(`Creando remito Tango para ${venta.numero}...`);

  const payload = {
    ClienteNombre:    nombreCliente,
    ClienteDireccion: direccion,
    FechaComprobante: new Date(venta.fecha || Date.now()).toISOString(),
    PerfilComprobanteID: perfilId,
    Observacion: [`Ref: ${venta.numero}`, `Canal: ${venta.canal}`, venta.notas].filter(Boolean).join(' | '),
    ...aplanarItems(venta.items),
  };

  const data = await ejecutarTango('CrearRemito', payload);
  const remitoId = data?.MovimientoId || data?.MovimientoID || 'OK';
  logger.info(`Remito Tango creado — ID: ${remitoId}`);

  await prisma.eventoVenta.create({
    data: { ventaId: venta.id, tipo: 'TANGO_REMITO', detalle: `Remito ID ${remitoId}` },
  });

  return remitoId;
}

// ─────────────────────────────────────────────
// CREAR FACTURA EN TANGO
// ─────────────────────────────────────────────
async function crearFacturaTango(venta, remitoId) {
  const categoriaImpositiva = resolverCategoriaImpositiva(venta);
  const letra               = resolverLetra(categoriaImpositiva);
  const tipoDoc             = resolverTipoDocumento(venta, categoriaImpositiva);
  const nroDoc              = resolverNroDocumento(venta);
  const perfilId            = resolverPerfilComprobante(venta);
  const nombreCliente       = venta.clienteEmpresa || venta.clienteNombre || 'Sin nombre';
  const direccion           = [venta.dirCalle, venta.dirLocalidad].filter(Boolean).join(', ') || 'Sin dirección';

  const catLabel = { 1: 'RI', 4: 'CF', 6: 'Mono' }[categoriaImpositiva] || '?';
  logger.info(`Creando factura Tango para ${venta.numero} (Factura ${letra} / ${catLabel})...`);

  const payload = {
    Letra:                     letra,
    FechaComprobante:          new Date(venta.fecha || Date.now()).toISOString(),
    ClienteNombre:             nombreCliente,
    ClienteDireccion:          direccion,
    ClienteTipoDocumento:      tipoDoc,
    ClienteNumeroDocumento:    nroDoc,
    CategoriaImpositivaCodigo: categoriaImpositiva,
    PerfilComprobanteID:       perfilId,
    // Vincular con el remito si se creó
    ...(remitoId && remitoId !== 'OK' ? { MovimientoReferenciaID: remitoId } : {}),
    Observacion: [
      venta.notas,
      venta.transporteNombre ? `Transporte: ${venta.transporteNombre}` : null,
      `Canal: ${venta.canal}`,
      `Ref: ${venta.numero}`,
    ].filter(Boolean).join(' | '),
    ...aplanarItems(venta.items),
  };

  const data    = await ejecutarTango('CrearFactura', payload);
  const facturaId = data?.MovimientoId || data?.MovimientoID || 'OK';
  logger.info(`Factura Tango creada — ID: ${facturaId}`);

  await prisma.venta.update({
    where: { id: venta.id },
    data:  { tangoRemitoId: String(facturaId), tangoEnviado: true },
  });

  await prisma.eventoVenta.create({
    data: { ventaId: venta.id, tipo: 'TANGO_ENVIADO', detalle: `Factura ID ${facturaId}` },
  });

  return facturaId;
}

// ─────────────────────────────────────────────
// ENVIAR A TANGO — Remito + Factura automático
// ─────────────────────────────────────────────
async function enviarATango(venta) {
  if (!process.env.TANGO_PUBLIC_KEY) {
    logger.warn('Credenciales Tango no configuradas, saltando envío');
    return null;
  }

  try {
    // 1. Crear remito
    const remitoId = await crearRemitoTango(venta);

    // 2. Crear factura vinculada al remito
    const facturaId = await crearFacturaTango(venta, remitoId);

    return { remitoId, facturaId };

  } catch (err) {
    if (err.response?.status === 401) {
      cachedToken = null;
      tokenExpiry = null;
      return enviarATango(venta);
    }

    const msg = err.message || err.response?.data?.Error?.[0]?.Mensaje;
    logger.error(`Error Tango ${venta.numero}: ${msg}`);

    await prisma.eventoVenta.create({
      data: { ventaId: venta.id, tipo: 'TANGO_ERROR', detalle: `Error: ${msg}` },
    });

    throw err;
  }
}

// ─────────────────────────────────────────────
// REINTENTAR PENDIENTES
// ─────────────────────────────────────────────
async function reintentarPendientes() {
  const pendientes = await prisma.venta.findMany({
    where:   { tangoEnviado: false, estado: { not: 'CANCELADO' } },
    include: { items: true },
    take:    20,
  });

  logger.info(`Reintentando ${pendientes.length} remitos pendientes...`);

  for (const v of pendientes) {
    await enviarATango(v).catch(err => {
      logger.error(`No se pudo reenviar ${v.numero}: ${err.message}`);
    });
  }
}

// Para uso interno/testing
function buildTangoPayload(venta, token) {
  const categoriaImpositiva = resolverCategoriaImpositiva(venta);
  return {
    ApplicationPublicKey:      process.env.TANGO_PUBLIC_KEY,
    UserIdentifier:            process.env.TANGO_USER_ID,
    Token:                     token,
    Letra:                     resolverLetra(categoriaImpositiva),
    CategoriaImpositivaCodigo: categoriaImpositiva,
    ClienteTipoDocumento:      resolverTipoDocumento(venta, categoriaImpositiva),
    ClienteNumeroDocumento:    resolverNroDocumento(venta),
    PerfilComprobanteID:       resolverPerfilComprobante(venta),
    ...aplanarItems(venta.items),
  };
}

module.exports = { enviarATango, reintentarPendientes, buildTangoPayload };

