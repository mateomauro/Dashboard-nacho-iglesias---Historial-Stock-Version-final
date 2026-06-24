/**
 * Lectura del Plan de Manejo y Plan Sanitario desde Google Sheets.
 * Planilla: "Plan Manejo y Sanitario - Federico".
 *
 * Cada hoja es una matriz Categoría × Mes (ENE…DIC). La fila que tiene texto
 * en la columna A abre una categoría; las filas siguientes con A vacía son
 * continuación (actividades adicionales de la misma categoría).
 *
 * loadPlanContext() devuelve, para el rango de fechas pedido, solo los meses
 * que intersectan el período del informe.
 */

export const SPREADSHEET_ID_PLAN = '1Je8PS_CJtJN-30SAEI2G9HMtxtbuYxIQK6W33NtKRvY';

const PLAN_SHEETS = {
    manejo: { tab: 'Plan de manejo', range: 'A1:N40' },
    sanitario: { tab: 'Plan Sanitario', range: 'A1:N40' },
};

const MESES_ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MESES_LARGO = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function str(v) {
    return v == null ? '' : String(v).trim();
}

/** Índices de mes (0-11) que intersectan [fecha1ISO, fecha2ISO]. */
export function mesesEnRango(fecha1ISO, fecha2ISO) {
    const d1 = new Date(`${fecha1ISO}T00:00:00Z`);
    const d2 = new Date(`${fecha2ISO}T00:00:00Z`);
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return [];
    const out = [];
    let y = d1.getUTCFullYear();
    let m = d1.getUTCMonth();
    const endY = d2.getUTCFullYear();
    const endM = d2.getUTCMonth();
    let guard = 0;
    while ((y < endY || (y === endY && m <= endM)) && guard < 36) {
        out.push(m);
        m += 1;
        if (m > 11) { m = 0; y += 1; }
        guard += 1;
    }
    return out;
}

/**
 * Parsea una matriz del Plan. Devuelve:
 *   [{ categoria: 'VACAS', porMes: { 3: ['TACTO - BOQUEO'], 4: [], ... } }, ...]
 * Las claves de porMes son índices de mes 0-11.
 *
 * @param {string[][]} rows  filas crudas (incluye el título en rows[0])
 */
export function parsePlanSheet(rows) {
    if (!rows || rows.length < 2) return [];

    /* La fila de meses es la primera que tiene "ENE" en alguna celda. */
    let headerIdx = rows.findIndex((r) => (r || []).some((c) => str(c).toUpperCase() === 'ENE'));
    if (headerIdx < 0) headerIdx = 1;
    const headerRow = rows[headerIdx] || [];

    /* Mapa columna → índice de mes 0-11. */
    const colToMonth = {};
    headerRow.forEach((cell, colIdx) => {
        const idx = MESES_ABBR.indexOf(str(cell).toUpperCase());
        if (idx >= 0) colToMonth[colIdx] = idx;
    });

    const categorias = [];
    let actual = null;

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const catName = str(row[0]).toUpperCase();

        if (catName) {
            actual = { categoria: catName, porMes: {} };
            categorias.push(actual);
        }
        if (!actual) continue;

        Object.entries(colToMonth).forEach(([colIdx, monthIdx]) => {
            const val = str(row[colIdx]);
            if (val) {
                if (!actual.porMes[monthIdx]) actual.porMes[monthIdx] = [];
                actual.porMes[monthIdx].push(val);
            }
        });
    }

    /* Descarta categorías sin ninguna actividad. */
    return categorias.filter((c) => Object.keys(c.porMes).length > 0);
}

async function readPlanSheet(sheets, key) {
    const conf = PLAN_SHEETS[key];
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID_PLAN,
        range: `'${conf.tab}'!${conf.range}`,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
    });
    return res.data.values ?? [];
}

/**
 * Carga el Plan de Manejo y Sanitario, recortado a los meses del período.
 * @returns {{ meses: {idx:number,abbr:string,largo:string}[], manejo: any[], sanitario: any[] }}
 */
export async function loadPlanContext(sheets, fecha1ISO, fecha2ISO) {
    const mesesIdx = mesesEnRango(fecha1ISO, fecha2ISO);
    const meses = mesesIdx.map((idx) => ({
        idx,
        abbr: MESES_ABBR[idx],
        largo: MESES_LARGO[idx],
    }));

    /* "Mes siguiente": el mes posterior al último del período. Se muestra en la
       matriz programada (visibilidad) pero NO se evalúa como vencido — no entra a
       compareExecutionVsPlan, que itera solo `meses`. */
    const lastIdx = mesesIdx[mesesIdx.length - 1];
    const nextIdx = (lastIdx + 1) % 12;
    const mesSiguiente = { idx: nextIdx, abbr: MESES_ABBR[nextIdx], largo: MESES_LARGO[nextIdx] };

    const [manejoRows, sanitarioRows] = await Promise.all([
        readPlanSheet(sheets, 'manejo'),
        readPlanSheet(sheets, 'sanitario'),
    ]);

    return {
        meses,
        mesSiguiente,
        fecha1: fecha1ISO,
        fecha2: fecha2ISO,
        manejo: parsePlanSheet(manejoRows),
        sanitario: parsePlanSheet(sanitarioRows),
    };
}
