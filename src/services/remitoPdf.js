const PDFDocument = require('pdfkit');

// Logo ABCTechos embebido en base64
const LOGO_BASE64 = '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';

const EMPRESAS = {
  ABCTECHOS: {
    nombre:    'TECHOS Y ACEROS INOXIDABLES SRL',
    direccion: 'SANTA ROSA 4025 (1644) - VICTORIA - Argentina',
    iva:       'IVA Responsable Inscripto',
    cuit:      '33-71869015-9',
    iibb:      '33718690159',
    inicio:    '01/11/2024',
  },
  ACEROINOXIDABLES: {
    nombre:    'TECHOS Y ACEROS INOXIDABLES SRL',
    direccion: 'SANTA ROSA 4025 (1644) - VICTORIA - Argentina',
    iva:       'IVA Responsable Inscripto',
    cuit:      '33-71869015-9',
    iibb:      '33718690159',
    inicio:    '01/11/2024',
  },
};

const CAT_MAP = {
  RI: 'Responsable Inscripto',
  CF: 'Consumidor Final',
  M:  'Responsable Monotributo',
  MONOTRIBUTISTA: 'Responsable Monotributo',
};

/**
 * Genera el PDF del remito y lo escribe en el stream `res` (Express response)
 * o en cualquier Writable stream.
 */
function generarRemitoPDF(venta, stream) {
  const empresa = EMPRESAS[venta.unidad] || EMPRESAS.ABCTECHOS;
  const logoBuffer = Buffer.from(LOGO_BASE64, 'base64');

  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(stream);

  const L  = 42;           // margen izquierdo
  const R  = 553;          // margen derecho
  const TW = R - L;        // ancho total
  let   y  = 30;           // cursor Y

  // ── helpers ──────────────────────────────────────────────────────────
  const line   = (x1, y1, x2, y2) => doc.moveTo(x1, y1).lineTo(x2, y2).strokeColor('#cccccc').lineWidth(0.5).stroke();
  const box    = (x, bY, w, h)    => doc.rect(x, bY, w, h).strokeColor('#cccccc').lineWidth(0.5).stroke();
  const txt    = (t, x, tY, opts) => doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts?.size || 8).fillColor(opts?.color || 'black').text(String(t ?? ''), x, tY, { lineBreak: false, ...(opts || {}) });

  const fechaStr = venta.fecha
    ? (venta.fecha instanceof Date
        ? venta.fecha.toLocaleDateString('es-AR')
        : venta.fecha)
    : new Date().toLocaleDateString('es-AR');

  // ══════════════════════════════════════════════════════════════════════
  // ENCABEZADO
  // ══════════════════════════════════════════════════════════════════════
  const H_HDR = 108;
  box(L, y, TW, H_HDR);

  // Logo
  doc.image(logoBuffer, L + 6, y + 6, { width: 72, height: 72 });

  // Líneas verticales separadoras
  const cx = L + TW / 2;
  line(cx - 56, y, cx - 56, y + H_HDR);
  line(cx + 56, y, cx + 56, y + H_HDR);

  // Centro: X + ORIGINAL
  txt('X', cx, y + 14, { bold: true, size: 28, align: 'center', width: 112, continued: false });
  txt('ORIGINAL', cx - 56, y + 54, { bold: true, size: 9, align: 'center', width: 112 });
  txt('DOCUMENTO NO VALIDO COMO FACTURA', cx - 56, y + 66, { size: 6.5, align: 'center', width: 112 });

  // Datos empresa izquierda (debajo del logo)
  txt(empresa.direccion, L + 6, y + 82, { size: 7 });
  txt(empresa.iva,       L + 6, y + 92, { size: 7 });
  txt(`CUIT: ${empresa.cuit}`, L + 6, y + 102, { size: 7 });

  // Derecha arriba: CUIT / IIBB / Inicio
  const dx = cx + 58;
  txt(`CUIT: ${empresa.cuit}`,         dx, y + 6,  { size: 7 });
  txt(`Ingresos Brutos: ${empresa.iibb}`, dx, y + 16, { size: 7 });
  txt(`Inicio de Actividades: ${empresa.inicio}`, dx, y + 26, { size: 7 });

  // Derecha: Remito N° + Fecha + Vendedor
  txt(`Remito Nº: ${venta.numero || ''}`, dx, y + 44, { bold: true, size: 11 });
  txt(`Fecha: ${fechaStr}`,              dx, y + 62, { size: 8 });
  txt(`Vendedor: ${venta.vendedor || ''}`, dx, y + 74, { size: 8 });

  y += H_HDR + 8;

  // ══════════════════════════════════════════════════════════════════════
  // DATOS DEL CLIENTE
  // ══════════════════════════════════════════════════════════════════════
  const H_CLI = 64;
  box(L, y, TW, H_CLI);

  const nombre = venta.clienteEmpresa || venta.clienteNombre || '';
  txt(nombre, L + 6, y + 8, { bold: true, size: 8.5 });

  const dirStr = [venta.dirCalle, venta.dirLocalidad, venta.dirProvincia].filter(Boolean).join(' - ');
  txt(dirStr, L + 6, y + 22, { size: 8 });

  const info2 = [venta.dirCP ? `(${venta.dirCP})` : null, venta.clienteTel || null].filter(Boolean).join(' - ');
  if (info2) txt(info2, L + 6, y + 34, { size: 8 });

  const catLabel = CAT_MAP[(venta.clienteCategoria || 'CF').toUpperCase()] || 'Consumidor Final';
  let ivaStr = `I.V.A.:${catLabel}`;
  if (venta.clienteCuit) ivaStr += ` - CUIT: ${venta.clienteCuit}`;
  txt(ivaStr, L + 6, y + 46, { size: 8 });

  if (venta.transporteNombre) {
    txt(`Transporte: ${venta.transporteNombre}`, R - 6, y + 8, { size: 8, align: 'right', width: 200 });
  }

  y += H_CLI + 8;

  // ══════════════════════════════════════════════════════════════════════
  // TABLA DE ÍTEMS
  // ══════════════════════════════════════════════════════════════════════
  const COL_COD  = 56;
  const COL_CANT = 56;
  const COL_UM   = 70;
  const COL_DEP  = 90;
  const COL_PROD = TW - COL_COD - COL_CANT - COL_UM - COL_DEP;

  // Header tabla
  const H_TH = 20;
  doc.rect(L, y, TW, H_TH).fillColor('#f0f0f0').fill();
  box(L, y, TW, H_TH);

  doc.fillColor('black');
  txt('Código',       L + 4,                                  y + 6, { bold: true, size: 7.5 });
  txt('Producto',     L + COD_X(COL_COD),                    y + 6, { bold: true, size: 7.5 });
  txt('U. de medida', L + COD_X(COL_COD) + COL_PROD,        y + 6, { bold: true, size: 7.5 });
  txt('Depósito',     L + COD_X(COL_COD) + COL_PROD + COL_UM, y + 6, { bold: true, size: 7.5 });
  txt('Cantidad',     R - 4, y + 6, { bold: true, size: 7.5, align: 'right', width: COL_CANT });

  y += H_TH;

  function COD_X(offset) { return offset; }

  const items = venta.items || [];
  items.forEach(item => {
    const H_ROW = 22;
    box(L, y, TW, H_ROW);

    const desc = (item.descripcion || '').substring(0, 65);
    txt(item.codigo || '',         L + 4,                                  y + 7, { size: 7.5 });
    txt(desc,                      L + COL_COD + 4,                        y + 7, { size: 7.5 });
    txt(item.unidad || 'Unidad',   L + COL_COD + COL_PROD + 4,             y + 7, { size: 7.5 });
    txt('Depósito general',        L + COL_COD + COL_PROD + COL_UM + 4,    y + 7, { size: 7.5 });
    const cant = parseFloat(item.cantidad || 1).toFixed(2);
    txt(cant, R - 4, y + 7, { size: 7.5, align: 'right', width: COL_CANT });

    y += H_ROW;
  });

  // ══════════════════════════════════════════════════════════════════════
  // OBSERVACIONES
  // ══════════════════════════════════════════════════════════════════════
  y += 8;
  const H_OBS = 56;
  box(L, y, TW, H_OBS);
  txt('Observaciones', L + 6, y + 6, { bold: true, size: 7.5 });
  if (venta.notas) {
    txt(venta.notas.substring(0, 120), L + 6, y + 20, { size: 7.5 });
  }

  y += H_OBS;

  // ══════════════════════════════════════════════════════════════════════
  // PIE
  // ══════════════════════════════════════════════════════════════════════
  doc.font('Helvetica').fontSize(7).fillColor('grey')
     .text('Hoja 1 de 1', L, 812, { align: 'right', width: TW });

  doc.end();
}

module.exports = { generarRemitoPDF };
