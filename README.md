# TerrenoCNR

Plataforma web y móvil para la toma de información, inspección, trazabilidad georreferenciada y supervisión de actividades en terreno de la **Comisión Nacional de Riego (CNR)** — **Ministerio de Agricultura de Chile**.

---

## Arquitectura del Proyecto

```text
TerrenoCNR/
├── packages/
│   └── shared/       # Esquemas Zod, motor de formularios dinámicos, motor de workflows y utilidades GeoJSON/KML/CSV
├── apps/
│   ├── api/          # Backend REST (Fastify + Prisma + PostgreSQL), PDF/QR, Excel, almacenamiento cifrado y MCP stdio
│   ├── web/          # Panel administrativo y operacional (Next.js App Router + Tailwind CSS + Leaflet)
│   └── mobile/       # App Android / iOS offline-first (React Native + Expo + SQLite + Leaflet WebView)
```

---

## Funcionalidades Principales

### Plataforma Web (`apps/web`)
- **Panel de Control (`/dashboard`)**: KPIs operacionales, gráficos por estado/tipo y exportación a Excel (`.xlsx`).
- **Actividades y Órdenes de Trabajo (`/actividades` y `/actividades/[id]`)**:
  - Vista **Listado** y **Tablero Kanban** con filtros instantáneos por búsqueda y estado.
  - Formulario digital dinámico, evidencias cifradas, flujo de aprobaciones y generación de **Informes PDF / Vouchers con QR**.
  - **Código QR de acceso rápido** por OT (descargable en PNG) para escaneo directo desde terreno.
  - Dibujo en mapa de **Puntos, Líneas y Polígonos** por clic o coordenadas manuales, con buscador autocompletado de direcciones/zonas en Chile y opción de borrar/limpiar.
- **Mapa Terreno (`/mapa`)**: visualización cartográfica con etiquetas de referencia permanentes, panel lateral interactivo (clic para centrar y hacer zoom) y exportación **GeoJSON**, **KML** y **CSV**.
- **Constructores y Administración**:
  - `/formularios`: editor visual de plantillas dinámicas y reglas condicionales.
  - `/workflows`: gestión de estados, transiciones y aprobaciones.
  - `/usuarios`: administración de usuarios, roles y unidades.
  - `/integraciones`: API Keys, webhooks HMAC, conectores y servidor MCP.
  - `/auditoria`: bitácora de acciones y bandeja de correos.

### Aplicación Móvil (`apps/mobile`)
- **Offline-First con SQLite**: operación completa sin conexión y cola local de mutaciones/evidencias.
- **Sincronización Automática (`expo-network`)**: detecta automáticamente la reconexión a **Wi-Fi o datos móviles** (y el regreso a primer plano) para sincronizar cambios pendientes.
- **4 Vistas Principales**:
  - **Panel**: KPIs, avance promedio global, barras por estado y actividades recientes.
  - **OTs (Listado | Kanban)**: creación offline de nuevas OT, búsqueda, filtros y transiciones de workflow.
  - **Mapa**: mapa interactivo Leaflet + OpenStreetMap con ubicación GPS del dispositivo (`Mi ubicación`), etiquetas de referencia y listado de geometrías.
  - **Sync**: estado de red en vivo, interruptor de auto-sincronización y cola pendiente.
- **Lector QR de OTs (`📷 QR OT`)**: escanea el QR de una OT para abrir directamente su detalle, formulario y mapa.
- **Captura GPS Multi-Geometría**: captura `POINT`, `LINE`, `TRACK` y `POLYGON` marcando vértices por GPS o tocando el mapa, con buscador autocompletado de direcciones/zonas en Chile.

---

## Requisitos Previos

- **Node.js** `>= 20`
- **PostgreSQL** (ej. PostgreSQL 16/18 local)
- **Expo Go** en Android/iOS (para pruebas móviles en red local)

---

## Instalación y Ejecución Local

1. **Instalar dependencias del monorepo** (raíz):
   ```bash
   npm install
   ```

2. **Configurar variables de entorno de la API** (`apps/api/.env`):
   ```env
   DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:5432/terreno_cnr?schema=public"
   JWT_SECRET="cambia-este-secreto-largo"
   CORS_ORIGINS="http://localhost:3000,http://localhost:3001,http://localhost:8081"
   ```

3. **Inicializar base de datos y datos de demostración**:
   ```bash
   npm run db:push -w @terreno/api
   npm run db:seed -w @terreno/api
   ```

4. **Levantar API y Web** (en terminales separadas):
   ```bash
   npm run dev:api
   npm run dev:web
   ```
   - API: `http://localhost:4000` (Swagger en `/docs`, salud en `/health`)
   - Web: `http://localhost:3000` (o `-p 3001` si el puerto 3000 está ocupado)

5. **Levantar App Móvil**:
   ```bash
   cd apps/mobile
   npm install
   npx expo start -c
   ```
   > En la pantalla de login móvil, configura la URL de la API con la IP local de tu equipo (ej. `http://192.168.x.x:4000`).

---

## Credenciales de Demostración

| Perfil | Correo | Contraseña |
| :--- | :--- | :--- |
| Administrador CNR | `admin@cnr.gob.cl` | `Cnr2026!Demo` |
| Inspector Terreno | `terreno@cnr.gob.cl` | `Cnr2026!Demo` |

---

## Pruebas y Verificación

```bash
# Pruebas unitarias e integración (@terreno/shared y @terreno/api)
npm test

# Verificación de tipos TypeScript
npm run typecheck
```
