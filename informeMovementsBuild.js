/**
 * Builders del HTML de las tablas de movimientos del Resumen Ejecutivo,
 * a partir de los datos devueltos por loadMovementsContext().
 *
 * Cada builder devuelve la <table>… completa (header + tbody + tfoot)
 * que reemplaza al contenido plantilla del template.
 */

function fmtFecha(d) {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(date.getUTCFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
}

function fmtN(n) {
    if (n == null || !Number.isFinite(n)) return '';
    return n.toLocaleString('es-AR');
}

function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function emptyState(colspan, label) {
    return `<tr class="exec-empty-row"><td colspan="${colspan}">Sin registros en el período · <em>${esc(label)}</em></td></tr>`;
}

/**
 * Atributos del <table> de ejecución. Alto de fila FIJO y parejo (20px de letra,
 * relleno fijo del CSS). El blanco de las tablas cortas se resuelve con el flujo
 * continuo en el PDF (varias secciones por hoja), no inflando las filas.
 */
function tableAttrs() {
    return 'class="exec-table"';
}

/** ───────── VENTAS ─────────
 * Una venta = una CARGA. Agrupa las filas por fecha + campo + comprador
 * (lo que sale el mismo día al mismo comprador desde el mismo campo es una
 * sola carga) y suma cabezas y kg. Pedido de Ignacio: ver 1 fila por carga
 * con el total de animales, no una fila por categoría.
 */
export function groupVentasByCarga(ventas) {
    const groups = new Map();
    for (const v of ventas || []) {
        const key = `${esc(fmtFecha(v.fecha))}__${v.campo}__${v.comprador}`;
        if (!groups.has(key)) {
            groups.set(key, {
                fecha: v.fecha,
                campo: v.campo,
                comprador: v.comprador,
                transportista: v.transportista,
                cab: 0,
                kg: 0,
                cats: new Map(),
            });
        }
        const g = groups.get(key);
        g.cab += v.cantidad || 0;
        g.kg += v.kg || 0;
        if (v.categoria) g.cats.set(v.categoria, (g.cats.get(v.categoria) || 0) + (v.cantidad || 0));
        if (!g.transportista && v.transportista) g.transportista = v.transportista;
    }
    return [...groups.values()].sort((a, b) => (a.fecha?.getTime?.() || 0) - (b.fecha?.getTime?.() || 0));
}

export function buildVentasTableHtml(ventas) {
    const cols = 7;
    const cargas = groupVentasByCarga(ventas);
    const totals = { cab: 0, kg: 0 };
    const body = cargas
        .map((g) => {
            totals.cab += g.cab;
            totals.kg += g.kg;
            const cats = [...g.cats.entries()]
                .map(([c, n]) => `<span class="cat-pill">${esc(c)}${n ? ` (${fmtN(n)})` : ''}</span>`)
                .join(' ');
            return `<tr>
                <td class="nowrap">${esc(fmtFecha(g.fecha))}</td>
                <td>${esc(g.campo)}</td>
                <td>${esc(g.comprador)}</td>
                <td>${cats}</td>
                <td class="num">${fmtN(g.cab)}</td>
                <td class="num">${fmtN(g.kg)}</td>
                <td>${esc(g.transportista)}</td>
            </tr>`;
        })
        .join('');

    return `<table ${tableAttrs(cargas.length)} aria-label="Ventas del período (por carga)">
        <thead><tr>
            <th class="nowrap">Fecha</th>
            <th>Campo</th>
            <th>Comprador</th>
            <th>Categorías</th>
            <th class="num">Cab</th>
            <th class="num">Kg</th>
            <th>Transportista</th>
        </tr></thead>
        <tbody>${body || emptyState(cols, 'Ventas')}</tbody>
        ${cargas.length > 0 ? `<tfoot><tr>
            <td colspan="3">Total · ${cargas.length} carga${cargas.length === 1 ? '' : 's'}</td>
            <td></td>
            <td class="num">${fmtN(totals.cab)}</td>
            <td class="num">${fmtN(totals.kg)}</td>
            <td></td>
        </tr></tfoot>` : ''}
    </table>`;
}

export function buildVentasSummary(ventas) {
    if (!ventas || ventas.length === 0) return 'Sin operaciones en el período';
    const cargas = groupVentasByCarga(ventas);
    const cab = ventas.reduce((s, v) => s + (v.cantidad || 0), 0);
    const compradores = new Set(ventas.map((v) => v.comprador).filter(Boolean));
    return `<strong>${cargas.length} carga${cargas.length === 1 ? '' : 's'}</strong> · <strong>${fmtN(cab)} cab</strong> · ${compradores.size} comprador${compradores.size === 1 ? '' : 'es'}`;
}

/** ───────── MUERTES ───────── (cada fila = 1 cabeza) */
export function buildMuertesTableHtml(muertes) {
    const cols = 7;
    const body = muertes
        .map((m) => `<tr>
            <td class="nowrap">${esc(fmtFecha(m.fecha))}</td>
            <td>${esc(m.campo)}</td>
            <td>${esc(m.rodeo)}</td>
            <td><span class="cat-pill">${esc(m.categoria)}</span></td>
            <td class="num">${fmtN(m.pesoEstimado)}</td>
            <td>${esc(m.causa)}</td>
            <td>${esc(m.diagnostico)}</td>
        </tr>`)
        .join('');

    return `<table ${tableAttrs(muertes.length)} aria-label="Muertes del período">
        <thead><tr>
            <th class="nowrap">Fecha</th>
            <th>Campo</th>
            <th>Rodeo</th>
            <th>Categoría</th>
            <th class="num">Peso est. (kg)</th>
            <th>Causa / observaciones</th>
            <th>Diagnóstico</th>
        </tr></thead>
        <tbody>${body || emptyState(cols, 'Muertes')}</tbody>
        ${muertes.length > 0 ? `<tfoot><tr>
            <td colspan="3">Total</td>
            <td colspan="4">${muertes.length} cab</td>
        </tr></tfoot>` : ''}
    </table>`;
}

export function buildMuertesSummary(muertes) {
    if (muertes.length === 0) return 'Sin eventos en el período';
    return `<strong>${muertes.length} cab</strong> · ${muertes.length} evento${muertes.length === 1 ? '' : 's'}`;
}

/** ───────── NACIMIENTOS ───────── */
export function buildNacimientosTableHtml(nacimientos) {
    const cols = 5;
    let total = 0;
    const body = nacimientos
        .map((n) => {
            total += n.cantidad || 0;
            return `<tr>
                <td class="nowrap">${esc(fmtFecha(n.fecha))}</td>
                <td>${esc(n.campo)}</td>
                <td>${esc(n.rodeo)}</td>
                <td><span class="cat-pill">${esc(n.categoria)}</span></td>
                <td class="num">${fmtN(n.cantidad)}</td>
            </tr>`;
        })
        .join('');

    return `<table ${tableAttrs(nacimientos.length)} aria-label="Nacimientos del período">
        <thead><tr>
            <th class="nowrap">Fecha</th>
            <th>Campo</th>
            <th>Rodeo</th>
            <th>Categoría</th>
            <th class="num">Cab</th>
        </tr></thead>
        <tbody>${body || emptyState(cols, 'Nacimientos')}</tbody>
        ${nacimientos.length > 0 ? `<tfoot><tr>
            <td colspan="4">Total</td>
            <td class="num">${fmtN(total)}</td>
        </tr></tfoot>` : ''}
    </table>`;
}

export function buildNacimientosSummary(nacimientos) {
    if (nacimientos.length === 0) return 'Sin nacimientos registrados en el período';
    const cab = nacimientos.reduce((s, n) => s + (n.cantidad || 0), 0);
    return `<strong>${fmtN(cab)} cab</strong> · ${nacimientos.length} registro${nacimientos.length === 1 ? '' : 's'}`;
}

/** ───────── COMPRAS ───────── */
export function buildComprasTableHtml(compras) {
    const cols = 7;
    const totals = { cab: 0, kg: 0 };
    const body = compras
        .map((c) => {
            totals.cab += c.cantidad || 0;
            totals.kg += c.pesoTotal || 0;
            return `<tr>
                <td class="nowrap">${esc(fmtFecha(c.fecha))}</td>
                <td>${esc(c.campoDestino)}</td>
                <td>${esc(c.rodeoDestino)}</td>
                <td><span class="cat-pill">${esc(c.categoria)}</span></td>
                <td class="num">${fmtN(c.cantidad)}</td>
                <td class="num">${fmtN(c.pesoTotal)}</td>
                <td>${esc(c.transportista)}</td>
            </tr>`;
        })
        .join('');

    return `<table ${tableAttrs(compras.length)} aria-label="Compras del período">
        <thead><tr>
            <th class="nowrap">Fecha</th>
            <th>Campo destino</th>
            <th>Rodeo destino</th>
            <th>Categoría</th>
            <th class="num">Cab</th>
            <th class="num">Kg totales</th>
            <th>Transportista</th>
        </tr></thead>
        <tbody>${body || emptyState(cols, 'Compras')}</tbody>
        ${compras.length > 0 ? `<tfoot><tr>
            <td colspan="4">Total</td>
            <td class="num">${fmtN(totals.cab)}</td>
            <td class="num">${fmtN(totals.kg)}</td>
            <td></td>
        </tr></tfoot>` : ''}
    </table>`;
}

export function buildComprasSummary(compras) {
    if (compras.length === 0) return 'Sin compras registradas en el período';
    const cab = compras.reduce((s, c) => s + (c.cantidad || 0), 0);
    return `<strong>${compras.length} operacion${compras.length === 1 ? '' : 'es'}</strong> · <strong>${fmtN(cab)} cab</strong>`;
}

/** ───────── TRASLADOS ─────────
 * Un traslado = un movimiento. Pedido de Ignacio: agrupar por fecha + mismo
 * campo de ORIGEN + mismo DESTINO (lo que sale el mismo día del mismo campo al
 * mismo destino es un solo traslado). Suma cabezas; lista categorías.
 */
export function groupTrasladosByCarga(traslados) {
    const groups = new Map();
    for (const t of traslados || []) {
        const destino = `${t.campoDestino || ''}${t.rodeoDestino ? ` · ${t.rodeoDestino}` : ''}`;
        const key = `${esc(fmtFecha(t.fecha))}__${t.campoOrigen || ''}__${destino}`;
        if (!groups.has(key)) {
            groups.set(key, {
                fecha: t.fecha,
                campoOrigen: t.campoOrigen,
                rodeosOrigen: new Set(),
                campoDestino: t.campoDestino,
                rodeoDestino: t.rodeoDestino,
                cab: 0,
                cats: new Map(),
                transportistas: new Set(),
                observaciones: new Set(),
            });
        }
        const g = groups.get(key);
        g.cab += t.cantidad || 0;
        if (t.rodeoOrigen) g.rodeosOrigen.add(t.rodeoOrigen);
        if (t.categoria) g.cats.set(t.categoria, (g.cats.get(t.categoria) || 0) + (t.cantidad || 0));
        if (t.transportista) g.transportistas.add(t.transportista);
        if (t.observaciones) g.observaciones.add(t.observaciones);
    }
    return [...groups.values()].sort((a, b) => (a.fecha?.getTime?.() || 0) - (b.fecha?.getTime?.() || 0));
}

export function buildTrasladosTableHtml(traslados) {
    const cols = 7;
    const grupos = groupTrasladosByCarga(traslados);
    let total = 0;
    const body = grupos
        .map((g) => {
            total += g.cab;
            /* Si el grupo mezcla rodeos de origen, mostramos solo el campo. */
            const rodeoOrigen = g.rodeosOrigen.size === 1 ? ` · ${esc([...g.rodeosOrigen][0])}` : '';
            const cats = [...g.cats.entries()].map(([c, n]) => `<span class="cat-pill">${esc(c)}${n ? ` (${fmtN(n)})` : ''}</span>`).join(' ');
            return `<tr>
                <td class="nowrap">${esc(fmtFecha(g.fecha))}</td>
                <td>${esc(g.campoOrigen)}${rodeoOrigen}</td>
                <td>${esc(g.campoDestino)}${g.rodeoDestino ? ` · ${esc(g.rodeoDestino)}` : ''}</td>
                <td>${cats}</td>
                <td class="num">${fmtN(g.cab)}</td>
                <td>${esc([...g.transportistas].join(', '))}</td>
                <td>${esc([...g.observaciones].join(' · '))}</td>
            </tr>`;
        })
        .join('');

    return `<table ${tableAttrs(grupos.length)} aria-label="Traslados del período (por carga)">
        <thead><tr>
            <th class="nowrap">Fecha</th>
            <th>Origen</th>
            <th>Destino</th>
            <th>Categorías</th>
            <th class="num">Cab</th>
            <th>Transportista</th>
            <th>Observaciones</th>
        </tr></thead>
        <tbody>${body || emptyState(cols, 'Traslados')}</tbody>
        ${grupos.length > 0 ? `<tfoot><tr>
            <td colspan="4">Total · ${grupos.length} traslado${grupos.length === 1 ? '' : 's'}</td>
            <td class="num">${fmtN(total)}</td>
            <td colspan="2"></td>
        </tr></tfoot>` : ''}
    </table>`;
}

export function buildTrasladosSummary(traslados) {
    if (!traslados || traslados.length === 0) return 'Sin traslados registrados en el período';
    const grupos = groupTrasladosByCarga(traslados);
    const cab = traslados.reduce((s, t) => s + (t.cantidad || 0), 0);
    return `<strong>${fmtN(cab)} cab</strong> · <strong>${grupos.length} traslado${grupos.length === 1 ? '' : 's'}</strong>`;
}

/** ───────── CUENTAS POR COBRAR ───────── */
function estadoPillClass(estado) {
    const s = (estado || '').toLowerCase();
    if (s.includes('cobrado') && !s.includes('parcial')) return 'ok';
    if (s.includes('parcial')) return 'partial';
    if (s.includes('pendiente')) return 'pend';
    return 'neu';
}

export function buildCxCTableHtml(cxc) {
    const cols = 8;
    let totalFacturado = 0;
    let totalPendiente = 0;
    const body = cxc
        .map((c) => {
            totalFacturado += c.total || 0;
            if ((c.estado || '').toLowerCase().includes('pendiente')) {
                totalPendiente += c.total || 0;
            }
            return `<tr>
                <td class="nowrap">${esc(fmtFecha(c.fecha))}</td>
                <td>${esc(c.procedencia)}</td>
                <td>${esc(c.comprador)}</td>
                <td><span class="cat-pill">${esc(c.categoria)}</span></td>
                <td class="num">${fmtN(c.cantidad)}</td>
                <td class="num">${fmtN(c.total)}</td>
                <td class="nowrap">${esc(fmtFecha(c.fechaCobro))}</td>
                <td><span class="estado-pill ${estadoPillClass(c.estado)}">${esc(c.estado)}</span></td>
            </tr>`;
        })
        .join('');

    return `<table ${tableAttrs(cxc.length)} aria-label="Cuentas por cobrar del período">
        <thead><tr>
            <th class="nowrap">Carga</th>
            <th>Procedencia</th>
            <th>Comprador</th>
            <th>Categoría</th>
            <th class="num">Cab</th>
            <th class="num">Total</th>
            <th class="nowrap">Cobro</th>
            <th>Estado</th>
        </tr></thead>
        <tbody>${body || emptyState(cols, 'Cuentas por cobrar')}</tbody>
        ${cxc.length > 0 ? `<tfoot><tr>
            <td colspan="5">Total facturado</td>
            <td class="num">${fmtN(totalFacturado)}</td>
            <td colspan="2">Pendiente: ${fmtN(totalPendiente)}</td>
        </tr></tfoot>` : ''}
    </table>`;
}

export function buildCxCSummary(cxc) {
    if (cxc.length === 0) return 'Sin cuentas por cobrar en el período';
    const pendientes = cxc.filter((c) => (c.estado || '').toLowerCase().includes('pendiente')).length;
    return `<strong>${cxc.length} operacion${cxc.length === 1 ? '' : 'es'}</strong> · ${pendientes} pendiente${pendientes === 1 ? '' : 's'}`;
}

/** ───────── PLAN DE MANEJO / SANITARIO ─────────
 * Tabla Categoría × Meses-del-período.
 * @param {{categoria:string,porMes:Object}[]} categorias
 * @param {{idx:number,abbr:string,largo:string}[]} meses
 */
export function buildPlanTableHtml(categorias, meses) {
    if (!categorias || categorias.length === 0 || !meses || meses.length === 0) {
        return `<table class="plan-excel"><tbody><tr>
            <td class="plan-cell-empty">Sin actividades planificadas para el período.</td>
        </tr></tbody></table>`;
    }

    const headCols = meses.map((m) => `<th scope="col">${esc(m.largo)}</th>`).join('');

    const body = categorias
        .map((cat) => {
            const cells = meses
                .map((m) => {
                    const acts = cat.porMes[m.idx] || [];
                    if (acts.length === 0) {
                        return '<td class="plan-cell-empty">—</td>';
                    }
                    return `<td>${acts.map((a) => esc(a)).join('<br>')}</td>`;
                })
                .join('');
            return `<tr><th scope="row" class="plan-cat">${esc(cat.categoria)}</th>${cells}</tr>`;
        })
        .join('');

    return `<table class="plan-excel" aria-label="Plan por categoría y mes">
        <thead><tr><th scope="col">Categoría</th>${headCols}</tr></thead>
        <tbody>${body}</tbody>
    </table>`;
}

function titleCaseCat(s) {
    const t = String(s || '').trim().toLowerCase();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Mini recuadro compacto del PLAN PROGRAMADO del período (matriz Categoría × Mes,
 * actividades como chips). Va arriba de la comparación Programado vs Real.
 * Pedido de Ignacio: "un mini recuadro con lo programado y la comparación abajo".
 */
export function buildPlanMiniHtml(categorias, meses) {
    if (!categorias || categorias.length === 0 || !meses || meses.length === 0) {
        return '<div class="plan-mini"><div class="plan-mini-empty">Sin plan programado para el período.</div></div>';
    }
    const head = meses.map((m) => `<th>${esc(m.largo)}</th>`).join('');
    const rows = categorias
        .map((cat) => {
            const cells = meses
                .map((m) => {
                    const acts = cat.porMes[m.idx] || [];
                    if (!acts.length) return '<td class="pm-empty">·</td>';
                    const chips = acts.map((a) => `<span class="pm-chip">${esc(a)}</span>`).join('');
                    return `<td>${chips}</td>`;
                })
                .join('');
            return `<tr><th class="pm-cat">${esc(titleCaseCat(cat.categoria))}</th>${cells}</tr>`;
        })
        .join('');
    return `<div class="plan-mini">
        <table class="plan-mini-table" aria-label="Plan programado por categoría y mes">
            <thead><tr><th class="pm-corner"></th>${head}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}
