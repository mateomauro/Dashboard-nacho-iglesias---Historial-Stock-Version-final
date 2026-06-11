import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Plugin de dev: replica /api/movements localmente para que el botón "Descargar PDF"
 * del navegador funcione sin necesidad de correr `netlify dev`.
 * Lee las credenciales del JSON local (la misma ruta que usa el CLI).
 * En producción, esto NO se ejecuta — Netlify Functions toma /api/movements.
 */
function movementsDevApiPlugin() {
    return {
        name: 'movements-dev-api',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/api/movements', async (req, res) => {
                try {
                    const url = new URL(req.url, 'http://localhost');
                    const from = url.searchParams.get('from');
                    const to = url.searchParams.get('to');
                    if (!from || !to) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'Faltan from/to' }));
                        return;
                    }

                    /* Resolver credenciales — env var o archivo en carpeta padre */
                    let credentials;
                    const envJson = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON?.trim();
                    if (envJson) {
                        credentials = JSON.parse(envJson);
                    } else {
                        const fallback = path.resolve(
                            process.cwd(),
                            '..',
                            'aym-ganaderiaautomatizaciones-3fd0e794441a.json',
                        );
                        if (!fs.existsSync(fallback)) {
                            res.statusCode = 500;
                            res.end(JSON.stringify({
                                error: 'No hay credenciales. Definí GOOGLE_SHEETS_CREDENTIALS_JSON o colocá el JSON un nivel arriba.',
                            }));
                            return;
                        }
                        credentials = JSON.parse(fs.readFileSync(fallback, 'utf8'));
                    }

                    const { createSheetsClient, loadMovementsContext } = await import('./informeMovementsData.js');
                    const sheets = await createSheetsClient(credentials);
                    const ctx = await loadMovementsContext(sheets, from, to);
                    res.setHeader('content-type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ from, to, ...ctx }));
                } catch (e) {
                    console.error('[/api/movements dev]', e);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },
    };
}

export default defineConfig({
    plugins: [react(), movementsDevApiPlugin()],
    server: {
        port: 5173,
        strictPort: true,
    },
});
