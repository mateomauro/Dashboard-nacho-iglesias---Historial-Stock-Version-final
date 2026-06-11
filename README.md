# Dashboard Ganadero — Historial de Stock

Aplicación web para visualizar el historial de stock ganadero y generar un **informe mensual en PDF** con datos reales de stock (Supabase) y de movimientos operativos (Google Sheets).

## Qué incluye el informe

- **Stock por categoría** — fotos de inicio y cierre del rodeo (matriz Campo · Rodeo · Categoría).
- **Diferencia del período** — variación Cierre − Inicio por celda.
- **Variación de stock** — tablero de control: total por categoría, puente de stock (cómo se explica la variación) y subcategoría de terneros.
- **Resúmenes ejecutivos** — Ventas, Cobros, Muertes, Nacimientos, Compras, Traslados.
- **Ejecución operativa** — Plan de Manejo y Sanitario (Programado vs Real) y bitácora.

## Stack

- **Vite** + JavaScript vanilla (dashboard e informe) + **React** (solo el login con Supabase Auth).
- **Supabase** — datos de stock (`Historial_Stock`) y autenticación.
- **Google Sheets** — movimientos operativos (ventas, muertes, etc.), vía Netlify Function.
- **jsPDF + html2canvas** — generación del PDF en el navegador.
- **Netlify** — hosting + Functions (`/api/movements`).

## Requisitos

- Node.js 20+
- Una base de **Supabase** con la tabla `Historial_Stock`.
- Una **service account de Google** con acceso de lectura a la planilla de movimientos.

## Variables de entorno

Crear un archivo `.env` en la raíz (no se commitea):

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Para los movimientos (Google Sheets), las credenciales de la service account se proveen como:

- **En local:** variable `GOOGLE_SHEETS_CREDENTIALS_JSON` (JSON completo) o el archivo JSON de la service account un nivel arriba del proyecto.
- **En Netlify:** variable de entorno `GOOGLE_SHEETS_CREDENTIALS_JSON` (Site settings → Environment variables).

## Correr en local

```bash
npm install
npm run dev
```

Abre http://localhost:5173. El botón "Descargar informe PDF" usa un plugin de Vite que replica `/api/movements` localmente (necesita las credenciales de Google Sheets).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite). |
| `npm run build` | Build de producción a `dist/`. |
| `npm run preview` | Sirve el build de producción. |
| `npm run pdf:informe -- --from YYYY-MM-DD --to YYYY-MM-DD` | Genera el PDF vectorial desde la terminal (Chromium). Requiere `npx playwright install chromium`. |
| `npm run sheet:test` | Prueba la conexión a Google Sheets. |

## Despliegue (Netlify)

El proyecto ya trae `netlify.toml` configurado:

- Build: `npm run build` → publica `dist/`.
- Functions en `netlify/functions/` (incluye `/api/movements`).

Configurar en Netlify las variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `GOOGLE_SHEETS_CREDENTIALS_JSON`.

## Notas

- El informe **nunca** se genera con datos de ejemplo: si no se pueden obtener los movimientos reales, la generación se aborta con un aviso.
- Las credenciales (`.env`, JSON de service account) están en `.gitignore` y no deben commitearse.
