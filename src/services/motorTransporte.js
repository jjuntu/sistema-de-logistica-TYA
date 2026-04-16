// Motor de transporte — sugiere los mejores transportistas por zona y tipo de carga
// Los datos base se pueden enriquecer desde la base de datos

const TRANSPORTISTAS_BASE = [
  {
    nombre: 'Flota propia — Hilux',
    zonas: ['Capital Federal', 'Buenos Aires (GBA)'],
    tipos: ['bulto', 'chapas', 'ferreteria'],
    pesoMaxKg: 400,
    prioridad: 1,
    esFlotaPropia: true,
    web: null,
    tel: null,
    nota: 'Cargas livianas hasta ~400 kg, GBA y CABA'
  },
  {
    nombre: 'Flota propia — Accelo',
    zonas: ['Capital Federal', 'Buenos Aires (GBA)'],
    tipos: ['chapas', 'paneles', 'madera', 'acero', 'general'],
    pesoMaxKg: 3500,
    prioridad: 1,
    esFlotaPropia: true,
    web: null,
    tel: null,
    nota: 'Cargas grandes, chapas largas, GBA y CABA'
  },
  {
    nombre: 'Lancioni Cargas',
    zonas: ['Capital Federal', 'Buenos Aires (GBA)', 'Buenos Aires interior',
            'Córdoba', 'Santa Fe', 'Entre Ríos', 'Corrientes', 'Misiones'],
    tipos: ['chapas', 'acero', 'general', 'paneles'],
    pesoMaxKg: null,
    prioridad: 2,
    esFlotaPropia: false,
    web: null,
    tel: null,
    nota: 'Buen precio GBA e interior, consultar frecuencia de salidas'
  },
  {
    nombre: 'Transporte Imaz',
    zonas: ['Buenos Aires interior', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'La Pampa'],
    tipos: ['chapas', 'paneles', 'general', 'madera'],
    pesoMaxKg: null,
    prioridad: 2,
    esFlotaPropia: false,
    web: null,
    tel: null,
    nota: 'Muy buenos precios al interior bonaerense y litoral'
  },
  {
    nombre: 'Vía Cargo',
    zonas: ['Capital Federal', 'Buenos Aires (GBA)', 'Córdoba', 'Santa Fe',
            'Mendoza', 'Tucumán', 'Salta', 'Jujuy', 'Neuquén', 'Río Negro'],
    tipos: ['general', 'ferreteria', 'bulto', 'paneles'],
    pesoMaxKg: null,
    prioridad: 3,
    esFlotaPropia: false,
    web: 'https://viacargo.com.ar',
    tel: null,
    nota: 'Tienen cotizador online, buena cobertura nacional'
  },
  {
    nombre: 'Movicargo',
    zonas: ['Buenos Aires interior', 'La Pampa', 'Neuquén', 'Río Negro', 'Chubut', 'Santa Cruz', 'Tierra del Fuego'],
    tipos: ['chapas', 'madera', 'general', 'paneles'],
    pesoMaxKg: null,
    prioridad: 2,
    esFlotaPropia: false,
    web: null,
    tel: null,
    nota: 'Especialistas en Patagonia y sur del país'
  },
  {
    nombre: 'Transporte Norte',
    zonas: ['Tucumán', 'Salta', 'Jujuy', 'Santiago del Estero',
            'Formosa', 'Chaco', 'Corrientes', 'Misiones'],
    tipos: ['chapas', 'general', 'madera', 'paneles'],
    pesoMaxKg: null,
    prioridad: 2,
    esFlotaPropia: false,
    web: null,
    tel: null,
    nota: 'Especialistas en NOA y NEA'
  },
  {
    nombre: 'JadLog Cargas',
    zonas: ['Capital Federal', 'Buenos Aires (GBA)', 'Córdoba', 'Santa Fe',
            'Mendoza', 'Tucumán', 'Buenos Aires interior'],
    tipos: ['bulto', 'ferreteria', 'general'],
    pesoMaxKg: 30,
    prioridad: 3,
    esFlotaPropia: false,
    web: 'https://jadlog.com.ar',
    tel: null,
    nota: 'Solo para bultos livianos, tienen tracking online'
  },
];

/**
 * Devuelve lista de transportistas recomendados para una zona y tipo de carga,
 * ordenados por prioridad (flota propia primero, luego por zona específica).
 *
 * @param {string} provincia
 * @param {Array} items - items de la venta para inferir tipo de carga
 * @param {number} pesoKg - peso estimado
 * @returns {Array} transportistas ordenados
 */
function motorTransporte(provincia, items = [], pesoKg = 0) {
  const tipoCarga = inferirTipoCarga(items);

  const candidatos = TRANSPORTISTAS_BASE.filter(t => {
    const zonaOk = t.zonas.some(z =>
      z.toLowerCase() === (provincia || '').toLowerCase()
    );
    const tipoOk = t.tipos.includes(tipoCarga) || t.tipos.includes('general');
    const pesoOk = !t.pesoMaxKg || !pesoKg || pesoKg <= t.pesoMaxKg;
    return zonaOk && tipoOk && pesoOk;
  });

  // Ordenar: flota propia primero, luego por prioridad
  return candidatos.sort((a, b) => {
    if (a.esFlotaPropia && !b.esFlotaPropia) return -1;
    if (!a.esFlotaPropia && b.esFlotaPropia) return 1;
    return a.prioridad - b.prioridad;
  });
}

function inferirTipoCarga(items) {
  const descripciones = items.map(i => (i.descripcion || '').toLowerCase()).join(' ');
  if (descripciones.match(/chapa|sinusoidal|trapezoidal|perfil|galvaniz/)) return 'chapas';
  if (descripciones.match(/panel|sandwich|tyvek|lana|aislac/)) return 'paneles';
  if (descripciones.match(/madera|tirante|viga|machimbre/)) return 'madera';
  if (descripciones.match(/inox|acero|ca[ñn]o|macizo|solda/)) return 'acero';
  if (descripciones.match(/ferret|bulón|tornillo|remach|gramp/)) return 'ferreteria';
  return 'general';
}

module.exports = { motorTransporte, inferirTipoCarga };
