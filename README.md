# ABCTechos — Backend de Logística

Backend Node.js para el sistema de logística de ABCTechos y Acero Inoxidables.
Recibe webhooks de Mercado Libre, WooCommerce y Tiendanube, procesa las órdenes
automáticamente y las envía a Tango Factura.

---

## Deploy en Railway (paso a paso)

### 1. Crear cuenta en Railway
Ir a https://railway.app y registrarse con GitHub.

### 2. Subir el código a GitHub
Crear un repo en github.com y subir esta carpeta completa.

### 3. Crear proyecto en Railway
- New Project → Deploy from GitHub repo → elegir tu repo
- Railway detecta Node.js automáticamente

### 4. Agregar PostgreSQL
En el proyecto: + New → Database → PostgreSQL
Railway agrega DATABASE_URL automáticamente.

### 5. Variables de entorno
Ir a tu servicio → Variables → agregar todo lo del archivo .env.example
Las obligatorias para arrancar: DATABASE_URL, ML_ACCESS_TOKEN, TANGO_API_TOKEN

### 6. Start command
En Settings → Deploy → Start Command:
  npx prisma db push && node src/index.js

### 7. Tu URL pública
Railway te da: https://tu-app.up.railway.app
Esa es la base para todos los webhooks.

---

## URLs de webhooks a configurar

### Mercado Libre
URL: https://TU-APP.up.railway.app/webhook/mercadolibre
Ir a: developers.mercadolibre.com.ar → tu app → Notificaciones
Topic a activar: orders_v2

### WooCommerce (abctechos.com)
URL: https://TU-APP.up.railway.app/webhook/woocommerce
Ir a: WP Admin → WooCommerce → Ajustes → Avanzado → Webhooks
Eventos: "Pedido creado" y "Pedido actualizado"

### Tiendanube (acerosinoxidables.com.ar)
URL: https://TU-APP.up.railway.app/webhook/tiendanube
Ir a: Panel TN → Configuración → API

---

## API disponible

GET  /api/ventas               — listar ventas
GET  /api/ventas/:id           — detalle
POST /api/ventas               — crear manual (WPP / mostrador)
PATCH /api/ventas/:id/estado   — cambiar estado
PATCH /api/ventas/:id/transporte — asignar transporte y costo
GET  /api/ventas/stats/resumen — métricas dashboard

GET  /api/transportistas       — listar
POST /api/transportistas       — agregar
PUT  /api/transportistas/:id   — editar

POST /api/tango/reenviar/:id   — reenviar remito a Tango
GET  /api/tango/pendientes     — ver fallidos

GET  /health                   — estado del servidor
