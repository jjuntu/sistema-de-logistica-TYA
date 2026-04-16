const logger = require('./logger');

/**
 * Notifica al cliente cuando su pedido es recibido.
 * Por ahora loguea el mensaje — conectar con Twilio o
 * Meta Cloud API cuando estén configurados.
 */
async function notificarCliente(venta) {
  const mensaje = buildMensajeCliente(venta);

  if (process.env.TWILIO_ACCOUNT_SID && venta.clienteTel) {
    await enviarWhatsApp(venta.clienteTel, mensaje);
  } else {
    logger.info(`[Notificación pendiente] Para ${venta.clienteNombre}: ${mensaje}`);
  }
}

function buildMensajeCliente(venta) {
  const empresa = venta.unidad === 'ABCTECHOS' ? 'ABCTechos' : 'Acero Inoxidables';
  return `Hola ${venta.clienteNombre.split(' ')[0]}! 👋 Tu pedido en ${empresa} fue recibido correctamente.\n\nN° de remito: *${venta.numero}*\nDirección de entrega: ${venta.dirCalle}, ${venta.dirLocalidad}\n\nTe avisamos cuando esté en camino. Cualquier consulta respondé este mensaje. ¡Gracias!`;
}

async function enviarWhatsApp(tel, mensaje) {
  // Requiere Twilio con WhatsApp Business habilitado
  // o Meta Cloud API
  try {
    const twilio = require('twilio');
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:+54${tel.replace(/\D/g,'')}`,
      body: mensaje
    });
    logger.info(`WhatsApp enviado a ${tel}`);
  } catch (err) {
    logger.error('Error enviando WhatsApp:', err.message);
  }
}

module.exports = { notificarCliente };
