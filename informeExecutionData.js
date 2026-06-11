/**
 * Lectura de la hoja "Ejecucion" (que el bot de WhatsApp llena en tiempo real)
 * y comparación contra el Plan de Manejo / Sanitario de Federico.
 *
 * Genera el dataset para la página "Programado vs Real" del informe.
 *
 * Estructura de la hoja Ejecucion:
 *   A=ID  B=Fecha(YYYY-MM-DD)  C=Campo  D=Lote  E=Categoria  F=Tipo
 *   G=Actividad  H=Cantidad  I=Observaciones  J=Mensaje Original
 *   K=Cargado El  L=CategoriaFina
 */

import { SPREADSHEET_ID_PLAN } from './informePlanData.js';

/* La hoja de bitácora WhatsApp vive en la planilla de Federico (Plan Manejo y Sanitario),
   no en la planilla maestra. Se llama "Whatsapp". */
const SHEET_EJECUCION = {
    spreadsheetId: SPREADSHEET_ID_PLAN,
    tab: 'Whatsapp',
    range: 'A2:L10000',
};

/* ─────────────────────────────────────────────────────────────────
 * MAPEO DE SINÓNIMOS Plan ↔ Bot
 * El Plan de Federico está escrito a mano; el bot normaliza con catálogo cerrado.
 * Convertimos ambos al mismo "valor canónico" para poder comparar.
 * ─────────────────────────────────────────────────────────────── */
const ACTIVITY_SYNONYMS = [
    // Manejo
    [/\btacto\b.*/i, 'Diagnostico de gestacion'],
    [/diagn[oó]stico\s+de\s+gestaci[oó]n/i, 'Diagnostico de gestacion'],
    [/pre[ñn]ez/i, 'Diagnostico de gestacion'],
    [/se[ñn]alada/i, 'Señalada'],
    [/yerra/i, 'Yerra'],
    [/marca\s+y\s+caravana/i, 'Destete'],
    [/destete/i, 'Destete'],
    [/inicio.*servicio/i, 'Inicio Servicio'],
    [/incio.*servicio/i, 'Inicio Servicio'],
    [/^servicio$/i, 'Inicio Servicio'],
    [/fin.*servicio/i, 'Fin Servicio'],
    [/selecci[oó]n\s+(de\s+)?reposici[oó]n/i, 'Seleccion de Reposicion'],
    [/selecci[oó]n\s+(de\s+)?toros?/i, 'Seleccion de Toros'],
    [/cap\s*ser/i, 'Seleccion de Toros'],
    [/iatf/i, 'IATF'],
    [/ingreso.*feed\s*lot/i, 'Ingreso a Feedlot'],
    [/traslados?\s+destete/i, 'Destete'],
    [/^parto$/i, null], // ignorar — es informativo, no actividad
    [/fin\s+parto/i, null],
    [/inicio\s+parto/i, null],

    // Sanidad
    [/antiparasitario/i, 'Antiparasitario'],
    [/^atp$/i, 'Antiparasitario'],
    [/^cobre$/i, 'Cobre'],
    [/sales\s+minerales/i, 'Sales Minerales'],
    [/piojicida.*pour.*on/i, 'Piojicida Pour On'],
    [/vacuna\s+(de\s+)?fiebre\s+aftosa/i, 'Vacuna Aftosa'],
    [/(?<!^)\baftosa\b/i, 'Vacuna Aftosa'],
    [/^aftosa$/i, 'Vacuna Aftosa'],
    [/vacuna\s+carbunclo/i, 'Vacuna Carbunclo'],
    [/^carbunclo$/i, 'Vacuna Carbunclo'],
    [/vacuna\s+triple/i, 'Vacuna Triple'],
    [/^mge$/i, 'Vacuna Triple'],
    [/^mancha$/i, 'Vacuna Triple'],
    [/vacuna\s+(de\s+)?neumon[ií]a/i, 'Vacuna Neumonia'],
    [/queratoconjuntivitis/i, 'Vacuna Queratoconjuntivitis'],
    [/vacuna\s+diarrea\s+neonatal/i, 'Vacuna Diarrea Neonatal'],
    [/vacuna\s+reproductiva/i, 'Vacuna Reproductiva'],
    [/vacuna\s+hemoglobinuria/i, 'Vacuna Hemoglobinuria'],
    [/vacuna\s+brucelosis/i, 'Vacuna Brucelosis'],
    [/sangrado\s+brucelosis/i, 'Sangrado Brucelosis'],
    [/diagn[oó]stico\s+y\s+control\s+de\s+par[aá]sitos/i, 'Diagnostico y Control de Parasitos'],
    [/^hpg$/i, 'Diagnostico y Control de Parasitos'],
    [/evaluaci[oó]n\s+cl[ií]nica.*toros?/i, 'Evaluacion Clinica de Toros'],
];

/**
 * Normaliza una actividad (del plan o del bot) a un valor canónico.
 * @returns {string|null} canónico, o null si debe ignorarse
 */
export function normalizeActivity(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    for (const [pattern, canonical] of ACTIVITY_SYNONYMS) {
        if (pattern.test(s)) return canonical; // puede ser null intencionalmente
    }
    /* Si no matchea ninguno, devolver el texto trimmed (preservar para no perder info) */
    return s;
}

/**
 * Normaliza una categoría (del plan o del bot) a una de:
 *   Vacas, Vaquillonas, Terneros, Toros, Recria
 */
export function normalizeCategoria(raw) {
    if (!raw) return null;
    const s = String(raw).trim().toLowerCase();
    if (s.startsWith('vaca')) return 'Vacas';
    if (s.startsWith('vaq')) return 'Vaquillonas';
    if (s.startsWith('terner')) return 'Terneros';
    if (s.startsWith('toro')) return 'Toros';
    if (s.startsWith('recr')) return 'Recria';
    return null;
}

/**
 * Separa actividades combinadas del plan:
 *   "VACUNA TRIPLE + VACUNA DE NEUMONIA + QUERATOCONJUNTIVITIS"
 *   → ["VACUNA TRIPLE", "VACUNA DE NEUMONIA", "QUERATOCONJUNTIVITIS"]
 */
export function splitPlanActivities(cell) {
    if (!cell) return [];
    /* Saca anotaciones entre paréntesis (ej "(Repetir ambas vacunas...)") */
    const cleaned = String(cell).replace(/\([^)]*\)/g, '').trim();
    /* Separadores comunes: " + ", " / ", " , " (cuando hay coma seguida de mayúscula) */
    return cleaned
        .split(/\s*\+\s*|\s*\/\s*|\s*,\s+(?=[A-ZÁÉÍÓÚ])/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Igual que splitPlanActivities pero CONSERVA el texto literal de cada
 * actividad, incluyendo las anotaciones entre paréntesis. Corta en
 * "+", "/" o ", " SOLO a nivel 0 (no dentro de paréntesis), para no
 * romper notas como "(Repetir ambas vacunas el 10/11)".
 *   "DESTETE (Marca y Caravana Electronica)" → ["DESTETE (Marca y Caravana Electronica)"]
 */
export function splitPlanActivitiesLiteral(cell) {
    if (!cell) return [];
    const s = String(cell);
    const out = [];
    let buf = '';
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '(') { depth += 1; buf += ch; continue; }
        if (ch === ')') { depth = Math.max(0, depth - 1); buf += ch; continue; }
        if (depth === 0) {
            if (ch === '+' || ch === '/') { out.push(buf); buf = ''; continue; }
            if (ch === ',' && /^\s+[A-ZÁÉÍÓÚ]/.test(s.slice(i + 1))) {
                out.push(buf); buf = ''; continue;
            }
        }
        buf += ch;
    }
    out.push(buf);
    return out.map((x) => x.trim()).filter(Boolean);
}

/** Quita anotaciones entre paréntesis (para calcular el canónico de matching). */
export function stripParenNotes(s) {
    return String(s || '').replace(/\([^)]*\)/g, '').trim();
}

/* ─────────────────────────────────────────────────────────────────
 * Lectura de la hoja Ejecucion (filtrada por rango de fechas)
 * ─────────────────────────────────────────────────────────────── */

function parseISODate(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function str(v) {
    return v == null ? '' : String(v).trim();
}

function mapEjecucionRow(r) {
    return {
        id: str(r[0]),
        fecha: parseISODate(r[1]),
        fechaRaw: str(r[1]),
        campo: str(r[2]),
        lote: str(r[3]),
        categoria: normalizeCategoria(r[4]) || str(r[4]),
        tipo: str(r[5]),
        actividadRaw: str(r[6]),
        actividad: normalizeActivity(r[6]),
        cantidad: num(r[7]),
        observaciones: str(r[8]),
        mensajeOriginal: str(r[9]),
        cargadoEl: str(r[10]),
        categoriaFina: str(r[11]),
    };
}

/**
 * Carga las filas de Ejecucion filtradas por rango de fechas.
 */
export async function loadExecutionContext(sheets, fecha1ISO, fecha2ISO) {
    const from = parseISODate(fecha1ISO);
    const to = parseISODate(fecha2ISO);
    if (!from || !to) throw new Error('Fechas inválidas');

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_EJECUCION.spreadsheetId,
        range: `'${SHEET_EJECUCION.tab}'!${SHEET_EJECUCION.range}`,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
    });

    const rows = (res.data.values ?? [])
        .map(mapEjecucionRow)
        .filter((r) => r.fecha && r.fecha.getTime() >= from.getTime() && r.fecha.getTime() <= to.getTime())
        .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    return rows;
}

/* ─────────────────────────────────────────────────────────────────
 * Comparación Plan vs Ejecución
 * ─────────────────────────────────────────────────────────────── */

const MESES_LARGO = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function summarizeExec(rows) {
    /* Para mostrar el "Real": "Llanura 100, Eduardo 50" o similar */
    const byCampo = {};
    let totalCab = 0;
    rows.forEach((r) => {
        const cab = r.cantidad || 0;
        totalCab += cab;
        byCampo[r.campo] = (byCampo[r.campo] || 0) + cab;
    });
    const parts = Object.entries(byCampo).map(([campo, cab]) => `${campo}${cab ? ` (${cab})` : ''}`);
    return { totalCab, txt: parts.join('; ') };
}

/**
 * Cruza el Plan (manejo + sanitario) con las filas de Ejecución del período.
 * Devuelve dos arrays (manejo y sanitario), cada uno con filas:
 *   { mes, categoria, actividad, estado: 'Cumplido'|'Pendiente'|'Extra', detalle, cabezas }
 *
 * @param {{meses,manejo,sanitario}} plan
 * @param {Array} execution  filas devueltas por loadExecutionContext
 */
export function compareExecutionVsPlan(plan, execution) {
    if (!plan) return { manejo: [], sanitario: [] };

    const result = { manejo: [], sanitario: [] };
    const usedExecIds = new Set();

    for (const tipo of ['Manejo', 'Sanidad']) {
        const planKey = tipo === 'Manejo' ? 'manejo' : 'sanitario';
        const planCats = plan[planKey] || [];

        for (const planCat of planCats) {
            const catNorm = normalizeCategoria(planCat.categoria);
            if (!catNorm) continue;

            for (const m of plan.meses) {
                const rawCell = (planCat.porMes[m.idx] || []).join(' + ');
                /* Mostramos TODO lo que figura en la planilla con su texto
                   literal completo (incluye paréntesis). El canónico —calculado
                   sobre el texto sin paréntesis— se usa SOLO para cruzar contra
                   la ejecución del bot; si es null (ej. Parto, informativo) la
                   fila se muestra igual y queda sin match. */
                const activities = splitPlanActivitiesLiteral(rawCell)
                    .map((raw) => ({ raw, canonical: normalizeActivity(stripParenNotes(raw)) }));

                if (activities.length === 0) continue;

                for (const act of activities) {
                    /* Cruce con Ejecucion solo si la actividad tiene canónico */
                    const matches = act.canonical
                        ? execution.filter((e) => {
                            if (usedExecIds.has(e.id)) return false;
                            if (e.tipo.toLowerCase() !== tipo.toLowerCase()) return false;
                            if (e.categoria !== catNorm) return false;
                            if (e.fecha.getUTCMonth() !== m.idx) return false;
                            return e.actividad === act.canonical;
                        })
                        : [];
                    matches.forEach((mm) => usedExecIds.add(mm.id));

                    const { totalCab, txt } = summarizeExec(matches);
                    result[planKey].push({
                        mes: m.largo,
                        mesIdx: m.idx,
                        categoria: catNorm,
                        actividad: act.raw,                 // texto literal del Excel
                        actividadCanonical: act.canonical,  // canónico (para matching / depuración)
                        estado: matches.length > 0 ? 'Cumplido' : 'Pendiente',
                        detalle: txt || '—',
                        cabezas: totalCab,
                        registros: matches.length,
                    });
                }
            }
        }
    }

    /* Registros "Extra" (en Ejecución pero no en el plan), AGRUPADOS por
       tipo + categoría + mes + actividad → un solo registro, con los campos
       en "Lo que ocurrió" separados por "; ". Se deduplican campos idénticos
       (cubre la carga doble del bot, ej. el mismo parte cargado dos veces). */
    const extraGroups = new Map();
    for (const e of execution) {
        if (usedExecIds.has(e.id)) continue;
        if (!e.actividad) continue;
        const tipo = (e.tipo || '').toLowerCase() === 'sanidad' ? 'sanitario' : 'manejo';
        const mesIdx = e.fecha.getUTCMonth();
        const key = `${tipo}::${e.categoria}::${mesIdx}::${e.actividad}`;
        if (!extraGroups.has(key)) {
            extraGroups.set(key, { tipo, categoria: e.categoria, mesIdx, actividad: e.actividad, campos: new Map() });
        }
        const g = extraGroups.get(key);
        const label = `${e.campo}${e.cantidad ? ` (${e.cantidad})` : ''}`;
        if (!g.campos.has(label)) g.campos.set(label, e.cantidad || 0);
    }
    for (const g of extraGroups.values()) {
        const campos = [...g.campos.keys()];
        result[g.tipo].push({
            mes: MESES_LARGO[g.mesIdx] || '',
            mesIdx: g.mesIdx,
            categoria: g.categoria,
            actividad: g.actividad,
            actividadCanonical: g.actividad,
            estado: 'Extra',
            detalle: campos.join('; '),
            cabezas: [...g.campos.values()].reduce((a, b) => a + b, 0),
            registros: campos.length,
        });
    }

    /* Ordenar por mes y categoría */
    const orderCat = { Vacas: 1, Vaquillonas: 2, Terneros: 3, Toros: 4, Recria: 5 };
    for (const k of ['manejo', 'sanitario']) {
        result[k].sort((a, b) => {
            if (a.mesIdx !== b.mesIdx) return a.mesIdx - b.mesIdx;
            return (orderCat[a.categoria] || 99) - (orderCat[b.categoria] || 99);
        });
    }

    return result;
}

/**
 * Agrupa filas de Ejecución para la "Bitácora": por CAMPO y, dentro de cada campo,
 * por FECHA (compacto). Devuelve [{ campo, fechas: [{ fecha, fechaRaw, items[] }] }],
 * campos ordenados alfabéticamente y fechas cronológicas dentro de cada campo.
 */
export function buildBitacoraFromExecution(execution) {
    const campos = new Map(); // campo -> Map<fechaRaw, { fecha, fechaRaw, items[] }>
    for (const e of execution) {
        if (!campos.has(e.campo)) campos.set(e.campo, new Map());
        const byFecha = campos.get(e.campo);
        if (!byFecha.has(e.fechaRaw)) {
            byFecha.set(e.fechaRaw, { fecha: e.fecha, fechaRaw: e.fechaRaw, items: [] });
        }
        const obs = e.observaciones ? ` (${e.observaciones})` : '';
        const cant = e.cantidad ? ` ${e.cantidad} cab` : '';
        byFecha.get(e.fechaRaw).items.push(`${e.actividad || e.actividadRaw} — ${e.categoria}${cant}${obs}`);
    }
    return [...campos.entries()]
        .map(([campo, byFecha]) => ({
            campo,
            fechas: [...byFecha.values()].sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
        }))
        .sort((a, b) => a.campo.localeCompare(b.campo, 'es'));
}
