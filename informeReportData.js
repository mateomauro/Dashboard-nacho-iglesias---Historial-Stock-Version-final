import { supabaseClient } from './src/lib/supabase.js';
import { MATRIX_STRUCTURE, CATS_EXCLUDED_FROM_SUPRA_TOTAL } from './informeMatrixBuild.js';

function deduplicateStockRows(rows) {
    if (!rows || rows.length === 0) return [];
    const seen = new Set();
    const deduplicated = [];
    for (let i = rows.length - 1; i >= 0; i--) {
        const item = rows[i];
        const key = `${item.Fecha}|${item.Campo}|${item.Rodeo}|${item.Supracategoria}|${item.Categoria}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduplicated.unshift(item);
        }
    }
    return deduplicated;
}

export async function fetchDistinctFechas() {
    const { data, error } = await supabaseClient.from('Historial_Stock').select('Fecha');
    if (error) throw error;
    const u = [...new Set((data || []).map((r) => r.Fecha).filter(Boolean))];
    u.sort();
    return u;
}

/** Última fecha disponible en DB que sea <= targetISO (yyyy-mm-dd) */
export function resolveSnapshotDate(fechasAsc, targetISO) {
    const eligible = fechasAsc.filter((f) => f <= targetISO);
    return eligible.length ? eligible[eligible.length - 1] : null;
}

export async function fetchRowsForFecha(iso) {
    const { data, error } = await supabaseClient
        .from('Historial_Stock')
        .select('*')
        .eq('Fecha', iso);
    if (error) throw error;
    return deduplicateStockRows(data || []);
}

function isExcludedFromGeneral(cat) {
    return CATS_EXCLUDED_FROM_SUPRA_TOTAL.some((c) => c.toLowerCase() === (cat || '').toLowerCase());
}

function categoryToSupra(catRaw) {
    const cat = (catRaw || '').trim();
    if (!cat) return null;
    for (const [supra, cats] of Object.entries(MATRIX_STRUCTURE)) {
        if (cats.some((c) => c.toLowerCase() === cat.toLowerCase())) return supra;
    }
    return null;
}

/** Totales por supracategoría + total general (misma regla de exclusión Tro Indif) */
export function aggregateBySupra(rows) {
    const out = {
        RECRIA: 0,
        VIENTRES: 0,
        TOROS: 0,
        INVERNADA: 0,
        TOTAL: 0,
    };
    const byCat = {};

    rows.forEach((row) => {
        const cat = (row.Categoria || '').trim();
        const q = Number(row.Cantidad) || 0;
        if (!cat) return;
        byCat[cat] = (byCat[cat] || 0) + q;

        const supra = categoryToSupra(cat);
        if (!supra) return;
        if (isExcludedFromGeneral(cat)) return;
        out[supra] += q;
        out.TOTAL += q;
    });

    return { supra: out, byCat };
}

export function getCategoryQty(byCatObj, name) {
    const keys = Object.keys(byCatObj);
    const found = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    return found ? byCatObj[found] : 0;
}

/**
 * @param {string} fecha1ISO
 * @param {string} fecha2ISO
 */
export async function loadInformeStockContext(fecha1ISO, fecha2ISO) {
    const fechasAsc = await fetchDistinctFechas();
    if (fechasAsc.length === 0) {
        throw new Error('No hay fechas cargadas en Historial_Stock.');
    }

    const d1 = resolveSnapshotDate(fechasAsc, fecha1ISO);
    const d2 = resolveSnapshotDate(fechasAsc, fecha2ISO);

    if (!d1) {
        throw new Error(
            `No hay registro de stock en o antes de ${fecha1ISO}. La fecha más antigua guardada es ${fechasAsc[0]}.`,
        );
    }
    if (!d2) {
        throw new Error(
            `No hay registro de stock en o antes de ${fecha2ISO}. La fecha más reciente es ${fechasAsc[fechasAsc.length - 1]}.`,
        );
    }

    const [rowsStart, rowsEnd] = await Promise.all([fetchRowsForFecha(d1), fetchRowsForFecha(d2)]);

    const a0 = aggregateBySupra(rowsStart);
    const a1 = aggregateBySupra(rowsEnd);

    const deltaTotal = a1.supra.TOTAL - a0.supra.TOTAL;

    return {
        resolvedFechaInicio: d1,
        resolvedFechaCierre: d2,
        rowsStart,
        rowsEnd,
        aggStart: a0,
        aggEnd: a1,
        deltaTotal,
    };
}

export function formatDeltaCab(n) {
    if (n === 0) return '0 cab';
    if (n > 0) return `+ ${n.toLocaleString('es-AR')} cab`;
    return `− ${Math.abs(n).toLocaleString('es-AR')} cab`;
}

/** Porcentaje (inicio → cierre). */
export function formatPctChange(prev, next) {
    if (prev == null || prev === 0) return '—';
    const p = ((next - prev) / prev) * 100;
    const abs = Math.abs(p);
    const txt = abs.toLocaleString('es-AR', { maximumFractionDigits: 1 });
    if (p > 0) return `+ ${txt} %`;
    if (p < 0) return `− ${txt} %`;
    return '0 %';
}
