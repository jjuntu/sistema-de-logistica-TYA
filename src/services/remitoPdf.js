const PDFDocument = require('pdfkit');

const LOGO_BASE64 = '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';

const EMPRESAS = {
  ABCTECHOS: {
    nombre: 'TECHOS Y ACEROS INOXIDABLES SRL',
    direccion: 'SANTA ROSA 4025 (1644) - VICTORIA - Argentina',
    iva: 'IVA Responsable Inscripto',
    cuit: '33-71869015-9',
    iibb: '33718690159',
    inicio: '01/11/2024',
  },
  ACEROINOXIDABLES: {
    nombre: 'TECHOS Y ACEROS INOXIDABLES SRL',
    direccion: 'SANTA ROSA 4025 (1644) - VICTORIA - Argentina',
    iva: 'IVA Responsable Inscripto',
    cuit: '33-71869015-9',
    iibb: '33718690159',
    inicio: '01/11/2024',
  },
};

const CAT_MAP = {
  RI: 'Responsable Inscripto',
  CF: 'Consumidor Final',
  M: 'Responsable Monotributo',
  MONOTRIBUTISTA: 'Responsable Monotributo',
};

function generarRemitoPDF(venta, stream) {
  const empresa = EMPRESAS[venta.unidad] || EMPRESAS.ABCTECHOS;
  const logoBuffer = Buffer.from(LOGO_BASE64, 'base64');

  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  doc.pipe(stream);

  const L = 42;
  const R = 553;
  const TW = R - L;
  let y = 30;

  const borde = () => doc.strokeColor('#bbbbbb').lineWidth(0.5);
  const box = (x, bY, w, h) => { borde(); doc.rect(x, bY, w, h).stroke(); };
  const vline = (x1, y1, y2) => { borde(); doc.moveTo(x1, y1).lineTo(x1, y2).stroke(); };
  const hline = (x1, y1, x2) => { borde(); doc.moveTo(x1, y1).lineTo(x2, y1).stroke(); };

  function txt(t, x, tY, opts) {
    opts = opts || {};
    doc
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.size || 8)
      .fillColor(opts.color || 'black')
      .text(String(t == null ? '' : t), x, tY, {
        lineBreak: false,
        width: opts.width,
        align: opts.align || 'left',
      });
  }

  const fechaStr = venta.fecha instanceof Date
    ? venta.fecha.toLocaleDateString('es-AR')
    : String(venta.fecha || new Date().toLocaleDateString('es-AR'));

  // ENCABEZADO
  const H_HDR = 110;
  const COL1_W = 140;
  const COL2_W = 120;
  const COL3_W = TW - COL1_W - COL2_W;
  const x1 = L;
  const x2 = L + COL1_W;
  const x3 = L + COL1_W + COL2_W;

  box(L, y, TW, H_HDR);
  vline(x2, y, y + H_HDR);
  vline(x3, y, y + H_HDR);

  // Col 1: logo + datos empresa
  doc.image(logoBuffer, x1 + 8, y + 8, { width: 64, height: 64 });
  txt(empresa.direccion, x1 + 4, y + 78, { size: 6.5, width: COL1_W - 8 });
  txt(empresa.iva, x1 + 4, y + 88, { size: 6.5, width: COL1_W - 8 });
  txt('CUIT: ' + empresa.cuit, x1 + 4, y + 98, { size: 6.5, width: COL1_W - 8 });

  // Col 2: X + ORIGINAL
  doc.font('Helvetica-Bold').fontSize(34).fillColor('black').text('X', x2 + 35, y + 10, { lineBreak: false });
  txt('ORIGINAL', x2 + 4, y + 58, { bold: true, size: 9, align: 'center', width: COL2_W - 8 });
  txt('DOCUMENTO NO VALIDO COMO FACTURA', x2 + 4, y + 70, { size: 6, align: 'center', width: COL2_W - 8 });

  // Col 3: CUIT + remito info
  txt('CUIT: ' + empresa.cuit, x3 + 6, y + 6, { size: 7 });
  txt('Ingresos Brutos: ' + empresa.iibb, x3 + 6, y + 17, { size: 7 });
  txt('Inicio de Actividades: ' + empresa.inicio, x3 + 6, y + 28, { size: 7 });
  hline(x3, y + 40, R);
  txt('Remito N\u00ba: ' + (venta.numero || ''), x3 + 6, y + 48, { bold: true, size: 10.5 });
  txt('Fecha: ' + fechaStr, x3 + 6, y + 66, { size: 8 });
  txt('Vendedor: ' + (venta.vendedor || 'SISTEMA'), x3 + 6, y + 78, { size: 8 });

  y += H_HDR + 6;

  // CLIENTE
  const H_CLI = 66;
  box(L, y, TW, H_CLI);
  const nombre = venta.clienteEmpresa || venta.clienteNombre || '';
  txt(nombre, L + 6, y + 8, { bold: true, size: 9, width: TW - 12 });
  const dirParts = [venta.dirCalle, venta.dirLocalidad, venta.dirProvincia].filter(Boolean);
  txt(dirParts.join(' - '), L + 6, y + 22, { size: 8, width: TW - 12 });
  const info2 = [venta.dirCP ? '(' + venta.dirCP + ')' : null, venta.clienteTel || null].filter(Boolean).join(' - ');
  if (info2) txt(info2, L + 6, y + 34, { size: 8, width: TW - 12 });
  const catLabel = CAT_MAP[(venta.clienteCategoria || 'CF').toUpperCase()] || 'Consumidor Final';
  let ivaStr = 'I.V.A.:' + catLabel;
  if (venta.clienteCuit) ivaStr += ' - CUIT: ' + venta.clienteCuit;
  txt(ivaStr, L + 6, y + 46, { size: 8, width: TW - 12 });
  if (venta.transporteNombre) {
    txt('Transporte: ' + venta.transporteNombre, R - 6, y + 8, { size: 8, align: 'right', width: 160 });
  }
  y += H_CLI + 6;

  // TABLA
  const C_COD = 56;
  const C_CANT = 52;
  const C_UM = 72;
  const C_DEP = 90;
  const C_PROD = TW - C_COD - C_CANT - C_UM - C_DEP;
  const xCod = L;
  const xProd = xCod + C_COD;
  const xUM = xProd + C_PROD;
  const xDep = xUM + C_UM;
  const xCant = xDep + C_DEP;

  const H_TH = 20;
  doc.rect(L, y, TW, H_TH).fillColor('#eeeeee').fill();
  borde(); doc.rect(L, y, TW, H_TH).stroke();
  doc.fillColor('black');
  txt('Codigo', xCod + 4, y + 6, { bold: true, size: 7.5 });
  txt('Producto', xProd + 4, y + 6, { bold: true, size: 7.5 });
  txt('U. de medida', xUM + 4, y + 6, { bold: true, size: 7.5 });
  txt('Deposito', xDep + 4, y + 6, { bold: true, size: 7.5 });
  txt('Cantidad', xCant + 4, y + 6, { bold: true, size: 7.5, width: C_CANT - 8, align: 'right' });
  y += H_TH;

  (venta.items || []).forEach(function(item) {
    const H_ROW = 22;
    borde(); doc.rect(L, y, TW, H_ROW).stroke();
    txt(String(item.codigo || ''), xCod + 4, y + 7, { size: 7.5 });
    txt(String(item.descripcion || '').substring(0, 60), xProd + 4, y + 7, { size: 7.5, width: C_PROD - 8 });
    txt(item.unidad || 'Unidad', xUM + 4, y + 7, { size: 7.5 });
    txt('Deposito general', xDep + 4, y + 7, { size: 7.5 });
    txt(parseFloat(item.cantidad || 1).toFixed(2), xCant + 4, y + 7, { size: 7.5, width: C_CANT - 8, align: 'right' });
    y += H_ROW;
  });

  // OBSERVACIONES
  y += 8;
  const H_OBS = 56;
  box(L, y, TW, H_OBS);
  txt('Observaciones', L + 6, y + 6, { bold: true, size: 7.5 });
  if (venta.notas) {
    txt(String(venta.notas).substring(0, 120), L + 6, y + 20, { size: 7.5, width: TW - 12 });
  }

  // PIE
  doc.font('Helvetica').fontSize(7).fillColor('grey')
    .text('Hoja 1 de 1', L, 812, { align: 'right', width: TW, lineBreak: false });

  doc.end();
}

module.exports = { generarRemitoPDF };
