/**
 * Lectura de movimientos operativos desde Google Sheets para el Informe Ganadero.
 * Fuente: planilla maestra AppSheet (gid del libro definido abajo).
 *
 * Filtra todas las filas por la columna FECHA dentro del rango [fecha1ISO, fecha2ISO].
 * Las fechas en la planilla vienen en formato variable (dd/mm/yy, d/m/yy, dd/mm/yyyy),
 * por eso usamos un parser tolerante.
 *
 * Uso (Node):
 *   import { createSheetsClient, loadMovementsContext } from './informeMovementsData.js';
 *   const sheets = await createSheetsClient(credentials);
 *   const ctx = await loadMovementsContext(sheets, '2026-04-01', '2026-05-07');
 */

import { google } from 'googleapis';
import { loadPlanContext } from './informePlanData.js';
import {
    loadExecutionContext,
    compareExecutionVsPlan,
    buildBitacoraFromExecution,
} from './informeExecutionData.js';

export const SPREADSHEET_ID = '1pIcBFR6609lOSLhe602ysgrI_lR_SseQi1HkdUjhDxI';
/** Planilla de Cuentas por Cobrar — separada de la maestra. */
export const SPREADSHEET_ID_CXC = '1QQzrReY-5IAnQaF7RepEgKq8Wchzlb9NIQqgDAx21qw';

const SHEETS = {
    ventas: { spreadsheetId: SPREADSHEET_ID, tab: 'Ventas 25', range: 'A2:N' },
    muertes: { spreadsheetId: SPREADSHEET_ID, tab: 'Muertes 25', range: 'A2:K' },
    nacimientos: { spreadsheetId: SPREADSHEET_ID, tab: 'Nacimientos 25', range: 'A2:H' },
    compras: { spreadsheetId: SPREADSHEET_ID, tab: 'Compras 25', range: 'A2:I' },
    traslados: { spreadsheetId: SPREADSHEET_ID, tab: 'Traslados 25', range: 'A2:O' },
    cxc: { spreadsheetId: SPREADSHEET_ID_CXC, tab: 'Hoja 1', range: 'A2:P' },
};

/**
 * Devuelve un cliente autenticado de Google Sheets v4.
 * @param {object} credentialsJson Contenido de la service-account JSON.
 */
export async function createSheetsClient(credentialsJson) {
    const auth = new google.auth.GoogleAuth({
        credentials: credentialsJson,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return google.sheets({ version: 'v4', auth });
}

/**
 * Parser tolerante: acepta "dd/mm/yy", "d/m/yy", "dd/mm/yyyy", "yyyy-mm-dd".
 * Devuelve Date (UTC medianoche) o null si no parsea.
 */
export function parseSheetDate(value) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s) return null;

    /* ISO yyyy-mm-dd */
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

    /* dd/mm/yyyy o dd/mm/yy o d/m/yy */
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m) {
        const day = +m[1];
        const month = +m[2] - 1;
        let year = +m[3];
        if (year < 100) year += 2000;
        return new Date(Date.UTC(year, month, day));
    }
    return null;
}

function isoToDate(iso) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function withinRange(d, fromDate, toDate) {
    if (!d) return false;
    return d.getTime() >= fromDate.getTime() && d.getTime() <= toDate.getTime();
}

async function readSheet(sheets, key) {
    const conf = SHEETS[key];
    const range = `'${conf.tab}'!${conf.range}`;
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: conf.spreadsheetId,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
    });
    return res.data.values ?? [];
}

function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const cleaned = String(v).replace(/\./g, '').replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function str(v) {
    if (v == null) return '';
    return String(v).trim();
}

/**
 * Filas Ventas. Columnas hoja:
 * 0:ID 1:FECHA 2:CAMPO SALIDA 3:RODEO SALIDA 4:CANTIDAD 5:CATEGORÍA 6:KG CAMION
 * 7:COMPRADOR 8:TRANSPORTISTA 9:PATENTE 10:JAULAS 11:OBSERVACIONES 12:ESTADO
 */
function mapVentaRow(r) {
    const fecha = parseSheetDate(r[1]);
    return {
        fecha,
        fechaRaw: str(r[1]),
        campo: str(r[2]),
        rodeo: str(r[3]),
        cantidad: num(r[4]) ?? 0,
        categoria: str(r[5]),
        kg: num(r[6]),
        comprador: str(r[7]),
        transportista: str(r[8]),
        observaciones: str(r[11]),
    };
}

/**
 * Filas Muertes. Columnas:
 * 0:ID 1:FECHA 2:CAMPO 3:RODEO 4:CATEGORÍA 5:PESO ESTIMADO
 * 6:CAUSA Y OBSERVACIONES 7:DIAGNOSTICO
 * Nota: cada fila representa una muerte individual (cab=1).
 */
function mapMuerteRow(r) {
    const fecha = parseSheetDate(r[1]);
    return {
        fecha,
        fechaRaw: str(r[1]),
        campo: str(r[2]),
        rodeo: str(r[3]),
        categoria: str(r[4]),
        pesoEstimado: num(r[5]),
        causa: str(r[6]),
        diagnostico: str(r[7]),
    };
}

/** Nacimientos. Columnas: 0:ID 1:Fecha 2:Campo 3:Rodeo 4:Cantidad 5:Categoria */
function mapNacimientoRow(r) {
    const fecha = parseSheetDate(r[1]);
    return {
        fecha,
        fechaRaw: str(r[1]),
        campo: str(r[2]),
        rodeo: str(r[3]),
        cantidad: num(r[4]) ?? 0,
        categoria: str(r[5]),
    };
}

/**
 * Compras. Columnas:
 * 0:ID 1:FECHA 2:CAMPO DESTINO 3:RODEO DESTINO 4:CANTIDAD 5:CATEGORÍA
 * 6:PESO TOTAL 7:OBSERVACIONES 8:TRANSPORTISTA
 */
function mapCompraRow(r) {
    const fecha = parseSheetDate(r[1]);
    return {
        fecha,
        fechaRaw: str(r[1]),
        campoDestino: str(r[2]),
        rodeoDestino: str(r[3]),
        cantidad: num(r[4]) ?? 0,
        categoria: str(r[5]),
        pesoTotal: num(r[6]),
        observaciones: str(r[7]),
        transportista: str(r[8]),
    };
}

/**
 * Traslados. Columnas:
 * 0:ID 1:FECHA 2:CAMPO SALIDA 3:RODEO SALIDA 4:CANTIDAD 5:CATEGORÍA
 * 6:PESO+/- 7:PESO TOTAL 8:CAMPO DESTINO 9:RODEO DESTINO
 * 10:TRANSPORTISTA 11:PATENTE 12:JAULAS 13:OBSERVACIONES
 */
function mapTrasladoRow(r) {
    const fecha = parseSheetDate(r[1]);
    return {
        fecha,
        fechaRaw: str(r[1]),
        campoOrigen: str(r[2]),
        rodeoOrigen: str(r[3]),
        cantidad: num(r[4]) ?? 0,
        categoria: str(r[5]),
        pesoTotal: num(r[7]),
        campoDestino: str(r[8]),
        rodeoDestino: str(r[9]),
        transportista: str(r[10]),
        observaciones: str(r[13]),
    };
}

/**
 * Cuentas por Cobrar. Columnas (planilla separada 'GANADERIA ventas TEMPORAL…'):
 * 0:Codigo 1:carga(fecha) 2:cobro(fecha) 3:Estado 4:Procedencia 5:Comprador
 * 6:Cantidad 7:Categoria 8:kg destino 9:kg camion 10:desbaste 11:kg frigorifico
 * 12:Factura cobrar 13:Iva 14:efectivo 15:Total
 * Filtramos por fecha de carga (col 1).
 */
function mapCxCRow(r) {
    const fecha = parseSheetDate(r[1]);
    return {
        fecha,
        fechaRaw: str(r[1]),
        fechaCobro: parseSheetDate(r[2]),
        fechaCobroRaw: str(r[2]),
        estado: str(r[3]),
        procedencia: str(r[4]),
        comprador: str(r[5]),
        cantidad: num(r[6]) ?? 0,
        categoria: str(r[7]),
        kg: num(r[8]),
        total: num(r[15]),
    };
}

const MAPPERS = {
    ventas: mapVentaRow,
    muertes: mapMuerteRow,
    nacimientos: mapNacimientoRow,
    compras: mapCompraRow,
    traslados: mapTrasladoRow,
    cxc: mapCxCRow,
};

async function readAndFilter(sheets, key, from, to) {
    const rows = await readSheet(sheets, key);
    const mapper = MAPPERS[key];
    return rows
        .map(mapper)
        .filter((row) => withinRange(row.fecha, from, to))
        .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

/**
 * Carga todos los movimientos del período.
 * @param {object} sheets Cliente Google Sheets autenticado.
 * @param {string} fecha1ISO yyyy-mm-dd inclusive.
 * @param {string} fecha2ISO yyyy-mm-dd inclusive.
 */
export async function loadMovementsContext(sheets, fecha1ISO, fecha2ISO) {
    const from = isoToDate(fecha1ISO);
    const to = isoToDate(fecha2ISO);
    if (!from || !to) {
        throw new Error('Fechas inválidas (esperaba yyyy-mm-dd)');
    }

    const [ventas, muertes, nacimientos, compras, traslados, cxc, plan, execution] = await Promise.all([
        readAndFilter(sheets, 'ventas', from, to),
        readAndFilter(sheets, 'muertes', from, to),
        readAndFilter(sheets, 'nacimientos', from, to),
        readAndFilter(sheets, 'compras', from, to),
        readAndFilter(sheets, 'traslados', from, to),
        readAndFilter(sheets, 'cxc', from, to),
        loadPlanContext(sheets, fecha1ISO, fecha2ISO).catch((e) => {
            console.error('No se pudo cargar el Plan de Manejo/Sanitario:', e.message);
            return null;
        }),
        loadExecutionContext(sheets, fecha1ISO, fecha2ISO).catch((e) => {
            console.error('No se pudo cargar Ejecucion:', e.message);
            return [];
        }),
    ]);

    /* Derivados: comparación Plan vs Ejecución, y bitácora */
    const comparison = plan ? compareExecutionVsPlan(plan, execution) : { manejo: [], sanitario: [] };
    const bitacora = buildBitacoraFromExecution(execution);

    return {
        ventas, muertes, nacimientos, compras, traslados, cxc,
        plan, execution, comparison, bitacora,
    };
}
