/**
 * Genera PDF vectorial del informe (Chromium + CSS de impresión).
 *
 * Uso:
 *   npm run pdf:informe -- --from 2026-04-01 --to 2026-05-07
 *   npm run pdf:informe -- --from 2026-04-01 --to 2026-05-07 --out ./Informe.pdf
 *   npm run pdf:informe -- --from 2026-04-01 --to 2026-05-07 --scale 1
 *
 * Requiere Chromium: npx playwright install chromium
 * Variables: mismas que el front (.env con VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 */

import 'dotenv/config';
import { readFile } from 'fs/promises';
import fs from 'node:fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import {
    applyInformeToDocument,
    fillInformeStaticPlaceholders,
    serializeInformeDocument,
} from '../informeHtmlBuild.js';
import { loadInformeStockContext } from '../informeReportData.js';
import {
    createSheetsClient,
    loadMovementsContext,
} from '../informeMovementsData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATE_PATH = join(ROOT, 'public', 'informe-ganaderia-v2.template.html');

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs() {
    const a = process.argv.slice(2);
    let from;
    let to;
    let out;
    let scaleStr;
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--from' && a[i + 1]) from = a[++i];
        else if (a[i] === '--to' && a[i + 1]) to = a[++i];
        else if (a[i] === '--out' && a[i + 1]) out = a[++i];
        else if (a[i] === '--scale' && a[i + 1]) scaleStr = a[++i];
    }
    return { from, to, out, scaleStr };
}

function usage() {
    console.error(`Uso:
  npm run pdf:informe -- --from YYYY-MM-DD --to YYYY-MM-DD [--out ruta.pdf] [--scale 0.9]
  --scale  opcional; por defecto 0.9 (matrices de stock en una sola hoja). Rango 0.1–2. Usar 1 para tamaño «natural».

Primera vez: npx playwright install chromium
`);
}

async function main() {
    const { from: fecha1ISO, to: fecha2ISO, out, scaleStr } = parseArgs();
    if (!fecha1ISO || !fecha2ISO || !ISO_RE.test(fecha1ISO) || !ISO_RE.test(fecha2ISO)) {
        usage();
        process.exit(1);
    }
    if (fecha1ISO > fecha2ISO) {
        console.error('La fecha --from no puede ser mayor que --to.');
        process.exit(1);
    }

    let scale = 0.9;
    if (scaleStr != null && scaleStr !== '') {
        const s = Number(scaleStr);
        if (!Number.isFinite(s) || s < 0.1 || s > 2) {
            console.error('--scale debe ser un número entre 0.1 y 2.');
            process.exit(1);
        }
        scale = s;
    }

    const outPath =
        out || join(process.cwd(), `Informe_Ganaderia_${fecha1ISO}_${fecha2ISO}.pdf`);

    const templateRaw = await readFile(TEMPLATE_PATH, 'utf8');
    const htmlStatic = fillInformeStaticPlaceholders(templateRaw, { fecha1ISO, fecha2ISO });

    const ctx = await loadInformeStockContext(fecha1ISO, fecha2ISO);

    /* Movements (Google Sheets) — OBLIGATORIO: sin datos reales NO generamos el PDF
       (evita salir con las tablas de ejemplo de la plantilla, que son falsas). */
    const credsPath =
        process.env.GOOGLE_SHEETS_CREDENTIALS?.trim() ||
        join(ROOT, '..', 'aym-ganaderiaautomatizaciones-3fd0e794441a.json');
    if (!fs.existsSync(credsPath)) {
        console.error(
            `\nERROR: no se encontraron las credenciales de Google Sheets en:\n  ${credsPath}\n` +
            'El PDF no se generó para no mostrar datos de ejemplo.\n' +
            'Definí GOOGLE_SHEETS_CREDENTIALS con la ruta al JSON de la service account.',
        );
        process.exit(1);
    }
    try {
        const credentials = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        const sheets = await createSheetsClient(credentials);
        ctx.movements = await loadMovementsContext(sheets, fecha1ISO, fecha2ISO);
        const counts = Object.fromEntries(
            Object.entries(ctx.movements).map(([k, v]) => [k, v.length]),
        );
        console.error('Movements cargados desde Google Sheets:', counts);
    } catch (e) {
        console.error('\nERROR: no se pudieron cargar los movimientos desde Google Sheets:', e.message);
        console.error('El PDF no se generó para no mostrar datos de ejemplo.');
        process.exit(1);
    }

    const dom = new JSDOM(htmlStatic, {
        contentType: 'text/html;charset=utf-8',
    });
    const doc = dom.window.document;
    applyInformeToDocument(doc, ctx);

    const body = doc.body;
    if (body) {
        body.classList.add('informe-print-ready');
        body.classList.remove('informe-pdf-capture-mode');
    }

    const htmlFinal = serializeInformeDocument(doc);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.emulateMedia({ media: 'print' });
        await page.setContent(htmlFinal, {
            waitUntil: 'networkidle',
            timeout: 120_000,
        });
        await page.pdf({
            path: outPath,
            format: 'A4',
            landscape: true,
            printBackground: true,
            preferCSSPageSize: true,
            scale,
            margin: {
                top: '10mm',
                bottom: '10mm',
                left: '8mm',
                right: '8mm',
            },
        });
    } finally {
        await browser.close();
    }

    console.error(`PDF generado: ${outPath}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
