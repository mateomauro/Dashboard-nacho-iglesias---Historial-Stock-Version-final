/**
 * Netlify Function: /api/movements?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Proxy server-side a Google Sheets. Las credenciales viven en la variable
 * de entorno GOOGLE_SHEETS_CREDENTIALS_JSON (configurada en el dashboard
 * de Netlify: Site settings → Environment variables).
 *
 * El browser NUNCA ve las credenciales — solo recibe el JSON con los movements.
 */

import { createSheetsClient, loadMovementsContext } from '../../informeMovementsData.js';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
        },
    });
}

function getCredentials() {
    const raw = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON?.trim();
    if (!raw) {
        throw new Error(
            'Falta la variable de entorno GOOGLE_SHEETS_CREDENTIALS_JSON. ' +
            'Definila en Netlify (Site settings → Environment variables) con el contenido del JSON de la service account.',
        );
    }
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error('GOOGLE_SHEETS_CREDENTIALS_JSON no es JSON válido.');
    }
}

export default async (req) => {
    if (req.method !== 'GET') {
        return jsonResponse({ error: 'Método no permitido. Usá GET.' }, 405);
    }

    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from || !to || !ISO_RE.test(from) || !ISO_RE.test(to)) {
        return jsonResponse(
            { error: 'Parámetros inválidos. Esperaba ?from=YYYY-MM-DD&to=YYYY-MM-DD' },
            400,
        );
    }
    if (from > to) {
        return jsonResponse({ error: '`from` no puede ser mayor que `to`.' }, 400);
    }

    try {
        const credentials = getCredentials();
        const sheets = await createSheetsClient(credentials);
        const ctx = await loadMovementsContext(sheets, from, to);

        const counts = Object.fromEntries(
            Object.entries(ctx).map(([k, v]) => [k, v.length]),
        );
        return jsonResponse({ from, to, counts, ...ctx });
    } catch (e) {
        console.error('movements function error:', e);
        return jsonResponse({ error: e.message || 'Error interno' }, 500);
    }
};

export const config = {
    path: '/api/movements',
};
