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
// Categorías impositivas Tango Factura
// 1 = Responsable Inscripto
// 4 = Consumidor Final
// 6 = Monotributista
// ─────────────────────────────────────────────
function resolverCategoriaImpositiva(venta) {
  const cat = venta.categoriaImpositiva || venta.clienteCategoria;
  if (!cat) {
    if (venta.clienteCuit && venta.clienteEmpresa) return 1; // tiene CUIT + empresa → RI
    return 4; // fallback CF
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

// 80 = CUIT | 96 = DNI | 99 = Sin identificar (CF sin datos)
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

// ─────────────────────────────────────────────
// TOKEN
// SDK PHP usa /Provisioning/GetAuthToken con form-encoded UserName+Password
// y devuelve el token como string con comillas, ej: "abc123"
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

  // El SDK PHP hace: str_replace('"', '', $result)  → limpia comillas del string
  const raw   = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  const token = raw.replace(/"/g, '').trim();

  if (!token) throw new Error('No se recibió token: ' + raw);

  cachedToken = token;
  tokenExpiry = Date.now() + 50 * 60 * 1000;
  logger.info('Token Tango obtenido');
  return token;
}

// ─────────────────────────────────────────────
// BUILD PAYLOAD — form-urlencoded flat object
// Arrays van como: DetallesMovimiento[0].Campo = valor
// ─────────────────────────────────────────────
function buildTangoPayload(venta, token) {
  const categoriaImpositiva = resolverCategoriaImpositiva(venta);
  const letra               = resolverLetra(categoriaImpositiva);
  const tipoDoc             = resolverTipoDocumento(venta, categoriaImpositiva);
  const nroDoc              = resolverNroDocumento(venta);

  const nombreCliente = venta.clienteEmpresa || venta.clienteNombre || 'Sin nombre';
  const direccion     = [venta.dirCalle, venta.dirLocalidad].filter(Boolean).join(', ') || 'Sin dirección';

  const data = {
    // Autenticación
    ApplicationPublicKey:      process.env.TANGO_PUBLIC_KEY,
    UserIdentifier:            process.env.TANGO_USER_ID,
    Token:                     token,

    // Comprobante
    Letra:                     letra,
    FechaComprobante:          new Date(venta.fecha || Date.now()).toISOString(),

    // Cliente — nombre correcto de campos según SDK: ClienteNumeroDocumento (no NroDocumento)
    ClienteNombre:             nombreCliente,
    ClienteDireccion:          direccion,
    ClienteTipoDocumento:      tipoDoc,
    ClienteNumeroDocumento:    nroDoc,       // ← campo correcto según SDK PHP
    CategoriaImpositivaCodigo: categoriaImpositiva,

    // Observaciones — campo correcto es "Observacion" (sin 'es') según SDK
    Observacion: [
      venta.notas,
      venta.transporteNombre ? `Transporte: ${venta.transporteNombre}` : null,
      `Canal: ${venta.canal}`,
      `Ref: ${venta.numero}`,
    ].filter(Boolean).join(' | '),
  };

  // Aplanar items como DetallesMovimiento[0].Campo=valor (formato SDK)
  const items = venta.items || [];
  items.forEach((item, i) => {
    data[`DetallesMovimiento[${i}].ProductoNombre`]      = item.descripcion || item.nombre || 'Producto';
    data[`DetallesMovimiento[${i}].ProductoDescripcion`] = item.descripcion || item.nombre || 'Producto';
    data[`DetallesMovimiento[${i}].Cantidad`]            = Number(item.cantidad) || 1;
    data[`DetallesMovimiento[${i}].Precio`]              = Number(item.precioUnit || item.precio) || 0;
    data[`DetallesMovimiento[${i}].Bonificacion`]        = 0;
  });

  return data;
}

// ─────────────────────────────────────────────
// ENVIAR A TANGO
// ─────────────────────────────────────────────
async function enviarATango(venta) {
  if (!process.env.TANGO_PUBLIC_KEY) {
    logger.warn('Credenciales Tango no configuradas, saltando envío');
    return null;
  }

  try {
    const token   = await obtenerToken();
    const payload = buildTangoPayload(venta, token);

    const catLabel = { 1: 'RI', 4: 'CF', 6: 'Mono' }[payload.CategoriaImpositivaCodigo] || '?';
    logger.info(`Enviando ${venta.numero} a Tango (Factura ${payload.Letra} / ${catLabel})...`);

    const response = await axios.post(
      `${TANGO_BASE_URL}/CrearFactura`,
      new URLSearchParams(payload).toString(),   // form-urlencoded, igual que SDK PHP
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    // La respuesta viene como APIResult: { CodigoError, Data, Error }
    const result  = response.data;
    if (result?.CodigoError !== 0 && result?.Error?.length) {
      const msgs = result.Error.map(e => e.Mensaje).join(' | ');
      throw new Error(`Tango rechazó el comprobante: ${msgs}`);
    }

    const tangoId = result?.Data?.MovimientoId || result?.Data?.MovimientoID || 'OK';
    logger.info(`Remito ${venta.numero} enviado a Tango — ID: ${tangoId}`);

    await prisma.venta.update({
      where: { id: venta.id },
      data:  { tangoRemitoId: String(tangoId), tangoEnviado: true },
    });

    await prisma.eventoVenta.create({
      data: { ventaId: venta.id, tipo: 'TANGO_ENVIADO', detalle: `ID ${tangoId}` },
    });

    return result.Data;

  } catch (err) {
    if (err.response?.status === 401) {
      cachedToken = null;
      tokenExpiry = null;
      return enviarATango(venta);
    }

    const msg = err.response?.data?.Error?.[0]?.Mensaje
      || err.response?.data?.Message
      || err.message;
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

module.exports = { enviarATango, reintentarPendientes, buildTangoPayload };