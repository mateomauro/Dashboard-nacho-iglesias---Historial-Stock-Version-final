/**
 * Prueba de conexión a Google Sheets API (Service Account).
 *
 * Uso:
 *   npm run sheet:test
 *
 * Credenciales (JSON de service account):
 *   Variable de entorno GOOGLE_SHEETS_CREDENTIALS = ruta absoluta al .json
 *   Si no está definida, intenta ../aym-ganaderiaautomatizaciones-3fd0e794441a.json (carpeta padre del dashboard).
 *
 * La hoja debe estar compartida con el client_email del JSON (lector alcanza).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_ROOT = path.resolve(__dirname, '..');

const SPREADSHEET_ID = '1pIcBFR6609lOSLhe602ysgrI_lR_SseQi1HkdUjhDxI';
const SHEET_GID = 670948513;
const SAMPLE_RANGE_ROWS = 15;
const SAMPLE_RANGE_COLS = 12; // A..L

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function defaultCredentialsPath() {
  return path.join(DASHBOARD_ROOT, '..', 'aym-ganaderiaautomatizaciones-3fd0e794441a.json');
}

function resolveCredentialsPath() {
  const fromEnv = process.env.GOOGLE_SHEETS_CREDENTIALS?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const fallback = defaultCredentialsPath();
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function rangeA1(endColLetter, rowCount) {
  return `A1:${endColLetter}${rowCount}`;
}

async function main() {
  const keyPath = resolveCredentialsPath();
  if (!keyPath) {
    console.error(
      'No se encontró el JSON de service account.\n' +
        'Definí GOOGLE_SHEETS_CREDENTIALS con la ruta al archivo, o colocá aym-ganaderiaautomatizaciones-3fd0e794441a.json en la carpeta "informes estructura" (un nivel arriba del dashboard).'
    );
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (raw.type !== 'service_account' || !raw.client_email) {
    console.error('El JSON no parece ser de una service account de Google.');
    process.exit(1);
  }

  console.log('Credenciales:', keyPath);
  console.log('Service account:', raw.client_email);
  console.log('Spreadsheet ID:', SPREADSHEET_ID);
  console.log('Buscando pestaña con gid (sheetId):', SHEET_GID);
  console.log('');

  const auth = new google.auth.GoogleAuth({
    credentials: raw,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'properties.title,sheets(properties(sheetId,title))',
  });

  const title = meta.data.properties?.title ?? '(sin título)';
  console.log('Libro:', title);

  const sheetList = meta.data.sheets ?? [];
  const match = sheetList.find((s) => s.properties?.sheetId === SHEET_GID);
  if (!match?.properties?.title) {
    console.error(
      'No se encontró una pestaña con sheetId =',
      SHEET_GID,
      '\nPestañas disponibles:',
      sheetList.map((s) => `${s.properties.title} (id=${s.properties.sheetId})`).join(', ')
    );
    process.exit(1);
  }

  const sheetTitle = match.properties.title;
  console.log('Pestaña:', sheetTitle);
  console.log('');

  const endCol = colLetter(SAMPLE_RANGE_COLS);
  const a1 = rangeA1(endCol, SAMPLE_RANGE_ROWS);
  const range = `'${sheetTitle.replace(/'/g, "''")}'!${a1}`;

  const values = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = values.data.values ?? [];
  console.log(`Rango leído: ${range}`);
  console.log(`Filas devueltas: ${rows.length}`);
  console.log('');
  console.log('Primeras filas (muestra):');
  console.log(JSON.stringify(rows.slice(0, 8), null, 2));
  console.log('');
  console.log('OK: conexión y lectura funcionaron.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
