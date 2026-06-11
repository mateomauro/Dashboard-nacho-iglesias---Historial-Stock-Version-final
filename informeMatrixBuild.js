/**
 * Construye el HTML de la tabla matriz (misma lógica que updateMatrixTable en app.js),
 * sin filtros de UI: todas las supracategorías y categorías del esquema.
 */

export const MATRIX_STRUCTURE = {
    RECRIA: ['Tro Indif', 'Tro', 'Tra', 'Tro Pie'],
    VIENTRES: ['Vaq repo', 'Vaq 1er 15', 'Vaq 1er 20', 'Vaq 2do 15', 'Vaq 2do 20', 'Vaca 3er', 'Vaca Gen', 'CUT'],
    TOROS: ['Toro', 'Torito'],
    INVERNADA: ['Vaca Venta', 'MEJ', 'Novillo', 'Novillito', 'Vaq Venta'],
};

export const CATS_EXCLUDED_FROM_SUPRA_TOTAL = ['Tro Indif'];

const hideEmptyCategories = true;

/**
 * @param {object[]} data Filas Historial_Stock (un solo Fecha o se usa la más reciente dentro del lote)
 * @param {{ tableId?: string }} options
 * @returns {{ html: string, snapshotDate: string|null, generalTotal: number }}
 */
export function buildMatrixTableHtml(data, options = {}) {
    const tableId = options.tableId || 'matrix-table-informe';

    if (!data || data.length === 0) {
        return {
            html: `<p style="margin:12px;color:#64748b;font-size:13px;">Sin filas de stock para esta fecha.</p>`,
            snapshotDate: null,
            generalTotal: 0,
        };
    }

    const filterSupraValues = [];
    const filterCatValues = [];

    const initialStructure = {};
    Object.keys(MATRIX_STRUCTURE).forEach((supra) => {
        if (filterSupraValues.length === 0 || filterSupraValues.includes(supra)) {
            const cats = MATRIX_STRUCTURE[supra].filter(
                (c) => filterCatValues.length === 0 || filterCatValues.includes(c),
            );
            if (cats.length > 0) initialStructure[supra] = cats;
        }
    });

    const ALL_INITIAL_CATS = Object.values(initialStructure).flat();

    let maxDateStr = data[0].Fecha;
    let maxDate = new Date(maxDateStr);
    data.forEach((item) => {
        const d = new Date(item.Fecha);
        if (d > maxDate) {
            maxDate = d;
            maxDateStr = item.Fecha;
        }
    });

    const latestData = data.filter((item) => item.Fecha === maxDateStr);

    const matrix = {};
    const generalTotals = { Total: 0 };
    ALL_INITIAL_CATS.forEach((c) => {
        generalTotals[c] = 0;
    });

    latestData.forEach((row) => {
        const campo = (row.Campo || 'Sin Campo').trim();
        const rodeo = (row.Rodeo || 'Sin Rodeo').trim();
        const cat = (row.Categoria || '').trim();
        const cant = Number(row.Cantidad) || 0;

        if (!matrix[campo]) {
            matrix[campo] = { totalCampo: 0, rodeos: {}, campoTotals: {} };
            ALL_INITIAL_CATS.forEach((c) => {
                matrix[campo].campoTotals[c] = 0;
            });
        }
        if (!matrix[campo].rodeos[rodeo]) {
            matrix[campo].rodeos[rodeo] = { Total: 0 };
            ALL_INITIAL_CATS.forEach((c) => {
                matrix[campo].rodeos[rodeo][c] = 0;
            });
        }

        const matchedColumn = ALL_INITIAL_CATS.find((c) => c.toLowerCase() === cat.toLowerCase());

        if (matchedColumn) {
            matrix[campo].rodeos[rodeo][matchedColumn] += cant;
            matrix[campo].campoTotals[matchedColumn] += cant;
            generalTotals[matchedColumn] += cant;

            const isExcluded = CATS_EXCLUDED_FROM_SUPRA_TOTAL.some(
                (c) => c.toLowerCase() === matchedColumn.toLowerCase(),
            );
            if (!isExcluded) {
                matrix[campo].rodeos[rodeo].Total += cant;
                matrix[campo].totalCampo += cant;
                generalTotals.Total += cant;
            }
        }
    });

    const visibleStructure = {};
    Object.keys(initialStructure).forEach((supra) => {
        let cats;
        if (hideEmptyCategories) {
            cats = initialStructure[supra].filter((cat) => generalTotals[cat] > 0);
        } else {
            cats = [...initialStructure[supra]];
        }
        if (cats.length > 0) visibleStructure[supra] = cats;
    });

    const ALL_VISIBLE_CATS = Object.values(visibleStructure).flat();
    const firstCatInSupra = new Set();
    Object.keys(visibleStructure).forEach((supra) => {
        const cats = visibleStructure[supra];
        if (cats.length) firstCatInSupra.add(cats[0]);
    });

    const supraSubtotals = {};
    Object.keys(visibleStructure).forEach((supra) => {
        supraSubtotals[supra] = (initialStructure[supra] || []).reduce(
            (sum, cat) =>
                CATS_EXCLUDED_FROM_SUPRA_TOTAL.includes(cat)
                    ? sum
                    : sum + (generalTotals[cat] || 0),
            0,
        );
    });

    const theadHtml = `
        <tr class="header-supra">
            <th class="col-sticky col-campo">Campo</th>
            <th class="col-sticky col-rodeo">Rodeo</th>
            <th class="col-sticky col-totales" style="z-index: 50;">TOTALES</th>
            ${Object.keys(visibleStructure)
                .map(
                    (supra) => `
                <th colspan="${visibleStructure[supra].length}" class="group-${supra.toLowerCase()} col-supra-boundary">${supra}<br><span class="supra-subtotal">${supraSubtotals[supra].toLocaleString('es-AR')}</span></th>`,
                )
                .join('')}
        </tr>
        <tr class="header-cat">
            <th class="col-sticky col-campo header-filler" style="border-top: none;"></th>
            <th class="col-sticky col-rodeo header-filler" style="border-top: none;"></th>
            <th class="col-sticky col-totales header-filler" style="border-top: none; z-index: 49;"></th>
            ${Object.keys(visibleStructure)
                .flatMap((supra) =>
                    visibleStructure[supra].map(
                        (cat, idx) =>
                            `<th class="sub-cat group-${supra.toLowerCase()}${idx === 0 ? ' col-supra-boundary' : ''}">${cat}</th>`,
                    ),
                )
                .join('')}
        </tr>
    `;

    let bodyHtml = '';

    bodyHtml += '<tr class="row-total-general">';
    bodyHtml +=
        '<th colspan="2" class="col-sticky col-campo" style="text-align: right; padding-right: 12px;">General</th>';
    bodyHtml += `<td class="col-totales">${generalTotals.Total.toLocaleString('es-AR')}</td>`;
    ALL_VISIBLE_CATS.forEach((col) => {
        const val = generalTotals[col];
        const bc = firstCatInSupra.has(col) ? ' class="col-supra-boundary"' : '';
        bodyHtml += `<td${bc}>${val > 0 ? val.toLocaleString('es-AR') : ''}</td>`;
    });
    bodyHtml += '</tr>';

    const sortedCampos = Object.keys(matrix).sort();
    sortedCampos.forEach((campoName) => {
        const campoData = matrix[campoName];
        const sortedRodeos = Object.keys(campoData.rodeos).sort();
        let isFirstRodeo = true;

        sortedRodeos.forEach((rodeoName) => {
            const rodeoData = campoData.rodeos[rodeoName];
            bodyHtml += '<tr>';
            if (isFirstRodeo) {
                bodyHtml += `<td class="col-sticky col-campo"><strong>${campoName}</strong></td>`;
                isFirstRodeo = false;
            } else {
                bodyHtml += '<td class="col-sticky col-campo"></td>';
            }
            bodyHtml += `<td class="col-sticky col-rodeo">${rodeoName}</td>`;
            bodyHtml += `<td class="col-totales">${rodeoData.Total > 0 ? rodeoData.Total.toLocaleString('es-AR') : ''}</td>`;
            ALL_VISIBLE_CATS.forEach((col) => {
                const val = rodeoData[col];
                const bc = firstCatInSupra.has(col) ? ' class="col-supra-boundary"' : '';
                bodyHtml += `<td${bc}>${val > 0 ? val.toLocaleString('es-AR') : ''}</td>`;
            });
            bodyHtml += '</tr>';
        });

        if (sortedRodeos.length > 0) {
            bodyHtml += '<tr class="row-total-campo">';
            bodyHtml += '<td class="col-sticky col-campo"></td>';
            bodyHtml +=
                '<td class="col-sticky col-rodeo" style="text-align: right; padding-right: 12px;"><strong>Total</strong></td>';
            bodyHtml += `<td class="col-totales">${campoData.totalCampo > 0 ? campoData.totalCampo.toLocaleString('es-AR') : ''}</td>`;
            ALL_VISIBLE_CATS.forEach((col) => {
                const val = campoData.campoTotals[col];
                const bc = firstCatInSupra.has(col) ? ' class="col-supra-boundary"' : '';
                bodyHtml += `<td${bc}>${val > 0 ? val.toLocaleString('es-AR') : ''}</td>`;
            });
            bodyHtml += '</tr>';
        }
    });

    const html = `
<table class="matrix-table" id="${tableId}">
  <thead>${theadHtml}</thead>
  <tbody>${bodyHtml}</tbody>
</table>`;

    return {
        html,
        snapshotDate: maxDateStr,
        generalTotal: generalTotals.Total,
    };
}

/**
 * Matriz de DIFERENCIA (Cierre − Inicio) por celda Campo·Rodeo·Categoría.
 * Misma estructura que la matriz normal, pero cada celda muestra el delta neto con
 * signo y color (verde = entró, rojo = salió, vacío = sin cambio). Filas = unión de
 * todos los Campo·Rodeo de ambas fotos (un rodeo puede existir en una y no en la otra).
 * Columnas = categorías con stock en inicio O cierre (unión, para que calce con las
 * otras dos hojas). El total general (excl. Tro Indif) debe coincidir con deltaTotal.
 * @param {object[]} rowsStart Filas de la foto de inicio
 * @param {object[]} rowsEnd   Filas de la foto de cierre
 * @returns {{ html: string, generalTotal: number }}
 */
export function buildDeltaMatrixTableHtml(rowsStart, rowsEnd, options = {}) {
    const tableId = options.tableId || 'matrix-informe-delta';
    const ALL_CATS = Object.values(MATRIX_STRUCTURE).flat();
    const isExcluded = (cat) =>
        CATS_EXCLUDED_FROM_SUPRA_TOTAL.some((c) => c.toLowerCase() === cat.toLowerCase());

    /* Quedarse con la última Fecha de cada lote (igual que la matriz normal). */
    const latest = (data) => {
        if (!data || !data.length) return [];
        let maxStr = data[0].Fecha;
        let max = new Date(maxStr);
        data.forEach((it) => {
            const d = new Date(it.Fecha);
            if (d > max) { max = d; maxStr = it.Fecha; }
        });
        return data.filter((it) => it.Fecha === maxStr);
    };

    /* Cantidades por celda: m[campo][rodeo][cat] = suma de Cantidad. */
    const aggregate = (data) => {
        const m = {};
        latest(data).forEach((row) => {
            const campo = (row.Campo || 'Sin Campo').trim();
            const rodeo = (row.Rodeo || 'Sin Rodeo').trim();
            const cat = (row.Categoria || '').trim();
            const cant = Number(row.Cantidad) || 0;
            const col = ALL_CATS.find((c) => c.toLowerCase() === cat.toLowerCase());
            if (!col) return;
            if (!m[campo]) m[campo] = {};
            if (!m[campo][rodeo]) m[campo][rodeo] = {};
            m[campo][rodeo][col] = (m[campo][rodeo][col] || 0) + cant;
        });
        return m;
    };

    const start = aggregate(rowsStart);
    const end = aggregate(rowsEnd);

    if (!Object.keys(start).length && !Object.keys(end).length) {
        return {
            html: `<p style="margin:12px;color:#64748b;font-size:13px;">Sin datos para calcular la diferencia.</p>`,
            generalTotal: 0,
        };
    }

    /* Generales por categoría (para visibilidad de columnas y fila General). */
    const genStart = {}; const genEnd = {}; const genDelta = {};
    ALL_CATS.forEach((c) => { genStart[c] = 0; genEnd[c] = 0; });
    const sumInto = (src, target) => {
        Object.values(src).forEach((rodeos) =>
            Object.values(rodeos).forEach((cells) => {
                ALL_CATS.forEach((c) => { target[c] += cells[c] || 0; });
            }),
        );
    };
    sumInto(start, genStart);
    sumInto(end, genEnd);
    ALL_CATS.forEach((c) => { genDelta[c] = genEnd[c] - genStart[c]; });

    /* Delta por campo/rodeo + totales (excluyendo Tro Indif del Total, igual que siempre). */
    const campos = [...new Set([...Object.keys(start), ...Object.keys(end)])].sort();
    const matrix = {};
    let generalTotal = 0;
    campos.forEach((campo) => {
        const rodeos = [...new Set([
            ...Object.keys(start[campo] || {}),
            ...Object.keys(end[campo] || {}),
        ])].sort();
        const cData = { rodeos: {}, campoTotals: {}, totalCampo: 0 };
        ALL_CATS.forEach((c) => { cData.campoTotals[c] = 0; });
        rodeos.forEach((rodeo) => {
            const rData = { Total: 0 };
            ALL_CATS.forEach((c) => {
                const s = (start[campo] && start[campo][rodeo] && start[campo][rodeo][c]) || 0;
                const e = (end[campo] && end[campo][rodeo] && end[campo][rodeo][c]) || 0;
                const d = e - s;
                rData[c] = d;
                cData.campoTotals[c] += d;
                if (!isExcluded(c)) { rData.Total += d; cData.totalCampo += d; }
            });
            cData.rodeos[rodeo] = rData;
        });
        matrix[campo] = cData;
        generalTotal += cData.totalCampo;
    });

    /* Columnas visibles: SOLO categorías con movimiento (algún delta != 0, en el general
       o en alguna celda). Las que tienen stock pero no se movieron se ocultan: enfocan
       la hoja en el movimiento y evitan que se haga innecesariamente ancha. */
    const catHasMovement = {};
    ALL_CATS.forEach((c) => { catHasMovement[c] = genDelta[c] !== 0; });
    campos.forEach((campo) => {
        Object.values(matrix[campo].rodeos).forEach((rData) => {
            ALL_CATS.forEach((c) => { if (rData[c] !== 0) catHasMovement[c] = true; });
        });
    });
    const visibleStructure = {};
    Object.keys(MATRIX_STRUCTURE).forEach((supra) => {
        const cats = MATRIX_STRUCTURE[supra].filter((c) => catHasMovement[c]);
        if (cats.length) visibleStructure[supra] = cats;
    });
    const ALL_VISIBLE = Object.values(visibleStructure).flat();
    const firstCatInSupra = new Set();
    Object.keys(visibleStructure).forEach((supra) => {
        if (visibleStructure[supra].length) firstCatInSupra.add(visibleStructure[supra][0]);
    });

    const supraSubtotals = {};
    Object.keys(visibleStructure).forEach((supra) => {
        supraSubtotals[supra] = (MATRIX_STRUCTURE[supra] || []).reduce(
            (sum, c) => (isExcluded(c) ? sum : sum + (genDelta[c] || 0)),
            0,
        );
    });

    /* Celda delta: vacío si 0; con signo y color si no. */
    const fmtDelta = (v) => {
        if (!v) return '';
        const cls = v > 0 ? 'delta-pos' : 'delta-neg';
        const sign = v > 0 ? '+' : '−';
        return `<span class="${cls}">${sign}${Math.abs(v).toLocaleString('es-AR')}</span>`;
    };

    const theadHtml = `
        <tr class="header-supra">
            <th class="col-sticky col-campo">Campo</th>
            <th class="col-sticky col-rodeo">Rodeo</th>
            <th class="col-sticky col-totales" style="z-index: 50;">TOTALES</th>
            ${Object.keys(visibleStructure)
                .map(
                    (supra) => `
                <th colspan="${visibleStructure[supra].length}" class="group-${supra.toLowerCase()} col-supra-boundary">${supra}<br><span class="supra-subtotal">${fmtDelta(supraSubtotals[supra]) || '0'}</span></th>`,
                )
                .join('')}
        </tr>
        <tr class="header-cat">
            <th class="col-sticky col-campo header-filler" style="border-top: none;"></th>
            <th class="col-sticky col-rodeo header-filler" style="border-top: none;"></th>
            <th class="col-sticky col-totales header-filler" style="border-top: none; z-index: 49;"></th>
            ${Object.keys(visibleStructure)
                .flatMap((supra) =>
                    visibleStructure[supra].map(
                        (cat, idx) =>
                            `<th class="sub-cat group-${supra.toLowerCase()}${idx === 0 ? ' col-supra-boundary' : ''}">${cat}</th>`,
                    ),
                )
                .join('')}
        </tr>
    `;

    let bodyHtml = '';
    bodyHtml += '<tr class="row-total-general">';
    bodyHtml +=
        '<th colspan="2" class="col-sticky col-campo" style="text-align: right; padding-right: 12px;">General</th>';
    bodyHtml += `<td class="col-totales">${fmtDelta(generalTotal)}</td>`;
    ALL_VISIBLE.forEach((col) => {
        const bc = firstCatInSupra.has(col) ? ' class="col-supra-boundary"' : '';
        bodyHtml += `<td${bc}>${fmtDelta(genDelta[col])}</td>`;
    });
    bodyHtml += '</tr>';

    Object.keys(matrix).sort().forEach((campoName) => {
        const campoData = matrix[campoName];
        const sortedRodeos = Object.keys(campoData.rodeos).sort();
        let isFirstRodeo = true;
        sortedRodeos.forEach((rodeoName) => {
            const rodeoData = campoData.rodeos[rodeoName];
            bodyHtml += '<tr>';
            bodyHtml += isFirstRodeo
                ? `<td class="col-sticky col-campo"><strong>${campoName}</strong></td>`
                : '<td class="col-sticky col-campo"></td>';
            isFirstRodeo = false;
            bodyHtml += `<td class="col-sticky col-rodeo">${rodeoName}</td>`;
            bodyHtml += `<td class="col-totales">${fmtDelta(rodeoData.Total)}</td>`;
            ALL_VISIBLE.forEach((col) => {
                const bc = firstCatInSupra.has(col) ? ' class="col-supra-boundary"' : '';
                bodyHtml += `<td${bc}>${fmtDelta(rodeoData[col])}</td>`;
            });
            bodyHtml += '</tr>';
        });
        if (sortedRodeos.length > 0) {
            bodyHtml += '<tr class="row-total-campo">';
            bodyHtml += '<td class="col-sticky col-campo"></td>';
            bodyHtml +=
                '<td class="col-sticky col-rodeo" style="text-align: right; padding-right: 12px;"><strong>Total</strong></td>';
            bodyHtml += `<td class="col-totales">${fmtDelta(campoData.totalCampo)}</td>`;
            ALL_VISIBLE.forEach((col) => {
                const bc = firstCatInSupra.has(col) ? ' class="col-supra-boundary"' : '';
                bodyHtml += `<td${bc}>${fmtDelta(campoData.campoTotals[col])}</td>`;
            });
            bodyHtml += '</tr>';
        }
    });

    const html = `
<table class="matrix-table matrix-delta" id="${tableId}">
  <thead>${theadHtml}</thead>
  <tbody>${bodyHtml}</tbody>
</table>`;

    return { html, generalTotal };
}
