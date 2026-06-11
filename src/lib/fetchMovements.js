/**
 * Browser helper: pide los movements al endpoint Netlify Function.
 * Si el endpoint no está disponible (dev local sin netlify dev, error 500, etc.),
 * devuelve null para que el caller use la plantilla de fallback.
 */
export async function fetchMovementsContext(fecha1ISO, fecha2ISO) {
    const url = `/api/movements?from=${encodeURIComponent(fecha1ISO)}&to=${encodeURIComponent(fecha2ISO)}`;
    try {
        const res = await fetch(url, { headers: { accept: 'application/json' } });
        if (!res.ok) {
            console.warn(`fetchMovements: HTTP ${res.status} — se usará plantilla.`);
            return null;
        }
        const json = await res.json();
        if (json.error) {
            console.warn('fetchMovements: error del servidor:', json.error);
            return null;
        }
        const {
            ventas = [],
            muertes = [],
            nacimientos = [],
            compras = [],
            traslados = [],
            cxc = [],
            plan = null,
            execution = [],
            comparison = { manejo: [], sanitario: [] },
            bitacora = [],
        } = json;
        return {
            ventas, muertes, nacimientos, compras, traslados, cxc,
            plan, execution, comparison, bitacora,
        };
    } catch (e) {
        console.warn('fetchMovements: no se pudo contactar el endpoint —', e.message);
        return null;
    }
}
