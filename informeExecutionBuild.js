/**
 * Builders HTML para la sección 05:
 *   - s05b · "Programado vs Real" (Plan de Manejo + Plan Sanitario)
 *   - s05c · "Bitácora operativa" (mensajes agrupados por fecha+campo)
 */

function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtFecha(d) {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(date.getUTCFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
}

function badgeFor(estado) {
    if (estado === 'Cumplido') return '<span class="badge badge-green">Cumplido</span>';
    if (estado === 'Pendiente') return '<span class="badge badge-amber">Pendiente</span>';
    if (estado === 'Extra') return '<span class="badge badge-blue">Extra (no planificado)</span>';
    if (estado === 'Desvio') return '<span class="badge badge-red">Desvio</span>';
    if (estado === 'En curso') return '<span class="badge badge-blue">En curso</span>';
    return `<span class="badge badge-amber">${esc(estado)}</span>`;
}

/**
 * Tabla "Plan de Manejo" o "Plan Sanitario" (Programado vs Real).
 * @param {Array} rows  filas de compareExecutionVsPlan
 * @param {string} actividadHeader  'Actividad programada' o 'Tratamiento programado'
 */
export function buildCompareTableHtml(rows, actividadHeader = 'Actividad programada') {
    if (!rows || rows.length === 0) {
        return `<table class="compare-table compare-table--compact"><tbody><tr>
            <td colspan="4" style="text-align:center;color:#94a3b8;padding:24px;font-style:italic">
                Sin actividades planificadas ni registradas para el período.
            </td>
        </tr></tbody></table>`;
    }

    const body = rows
        .map((r) => `<tr>
            <td class="cmp-mescat"><span class="cmp-mes">${esc(r.mes)}</span><span class="cmp-cat">${esc(r.categoria)}</span></td>
            <td>${esc(r.actividad)}</td>
            <td>${esc(r.detalle)}</td>
            <td>${badgeFor(r.estado)}</td>
        </tr>`)
        .join('');

    return `<table class="compare-table compare-table--compact">
        <thead><tr>
            <th>Mes · Categoria</th>
            <th>${esc(actividadHeader)}</th>
            <th>Lo que ocurrio</th>
            <th>Estado</th>
        </tr></thead>
        <tbody>${body}</tbody>
    </table>`;
}

const MES_ABBR3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Separador de miles estilo es-AR: 1644 → "1.644". */
function fmtMiles(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "Realizado / detalle": "Campo (n), Campo (n)… Total X". */
function fmtRealizado(r) {
    const campos = (r.detalle && r.detalle !== '—') ? r.detalle.replace(/;\s*/g, ', ') : '';
    const total = r.cabezas ? `${campos ? '. ' : ''}Total ${fmtMiles(r.cabezas)}` : '';
    return (campos + total) || '—';
}

/** "TACTO - BOQUEO" → "Tacto - boqueo" (el plan viene en mayúsculas). */
function sentenceCase(s) {
    const t = String(s || '').trim().toLowerCase();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Sección "Ejecución del período": parte las filas de compareExecutionVsPlan en
 * 3 tablas — Cumplido, Extra y Pendiente (faltantes agrupados por mes+categoría).
 * @param {Array} rows  filas de compareExecutionVsPlan (un tipo)
 * @param {string} actLabel  'Actividad' (manejo) o 'Tratamiento' (sanitario)
 */
export function buildCompareSectionHtml(rows, actLabel = 'Actividad') {
    if (!rows || rows.length === 0) {
        return '<div class="exec-empty">Sin actividades planificadas ni registradas para el período.</div>';
    }
    const cumplido = rows.filter((r) => r.estado === 'Cumplido');
    const extra = rows.filter((r) => r.estado === 'Extra');
    const pendiente = rows.filter((r) => r.estado === 'Pendiente');

    const tablaHechas = (list, cls) => `<table class="compare-table compare-table--compact exec-state-table ${cls}">
        <thead><tr><th class="es-mes">Mes</th><th class="es-cat">Categoria</th><th>${esc(actLabel)}</th><th>Realizado / detalle</th></tr></thead>
        <tbody>${list.map((r) => `<tr>
            <td class="es-mes">${esc(MES_ABBR3[r.mesIdx] || r.mes)}</td>
            <td class="es-cat">${esc(r.categoria)}</td>
            <td>${esc(sentenceCase(r.actividad))}</td>
            <td>${esc(fmtRealizado(r))}</td>
        </tr>`).join('')}</tbody>
    </table>`;

    /* Pendiente: lectura compacta — UNA fila por MES; las categorías van dentro de
       la celda, en negrita: "Vacas: a; b. Vaquillonas: c. Recria: d". */
    const pendByMes = new Map();
    for (const r of pendiente) {
        if (!pendByMes.has(r.mesIdx)) pendByMes.set(r.mesIdx, new Map());
        const cats = pendByMes.get(r.mesIdx);
        if (!cats.has(r.categoria)) cats.set(r.categoria, []);
        cats.get(r.categoria).push(sentenceCase(r.actividad));
    }
    const tablaPend = `<table class="compare-table compare-table--compact exec-state-table es-pte">
        <thead><tr><th class="es-mescat">Mes / categoria</th><th>Faltante</th></tr></thead>
        <tbody>${[...pendByMes.keys()].sort((a, b) => a - b).map((mesIdx) => {
            const cats = pendByMes.get(mesIdx);
            const txt = [...cats.entries()]
                .map(([cat, acts]) => `<b>${esc(cat)}:</b> ${esc(acts.join('; '))}`)
                .join('. ');
            return `<tr><td class="es-mescat">${esc(MES_ABBR3[mesIdx] || '')}</td><td>${txt}</td></tr>`;
        }).join('')}</tbody>
    </table>`;

    let out = '<div class="compare-section-title exec-period">Ejecución del período</div>';
    if (cumplido.length) {
        out += '<div class="exec-state-head"><span class="badge badge-green">OK</span><span class="esh-label">Cumplido</span></div>' + tablaHechas(cumplido, 'es-ok');
    }
    if (extra.length) {
        out += '<div class="exec-state-head"><span class="badge badge-blue">EXTRA</span><span class="esh-label">Extra no planificado</span></div>' + tablaHechas(extra, 'es-extra');
    }
    if (pendiente.length) {
        out += '<div class="exec-state-head"><span class="badge badge-amber">PTE</span><span class="esh-label">Pendiente — lectura compacta de faltantes</span></div>' + tablaPend;
    }
    return out;
}

/**
 * Bitácora operativa (s05c): lista de mensajes agrupados por fecha+campo.
 * @param {Array} groups  salida de buildBitacoraFromExecution
 */
export function buildBitacoraHtml(groups) {
    if (!groups || groups.length === 0) {
        return '<div class="bitacora-empty">Sin partes registrados en el período.</div>';
    }

    /* Cada CAMPO es una tarjeta (header verde + badge "N fechas" + fechas en azul),
       distribuidas en 2 columnas. Se usa una <table> como contenedor porque es lo que
       el motor de captura del PDF (html2canvas) renderiza de forma confiable; la tarjeta
       va en un <div> interno para que tome el alto de su contenido. */
    const cols = groups.length <= 2 ? 1 : 2;

    const cells = groups.map((g) => {
        const n = g.fechas.length;
        const badge = `${n} ${n === 1 ? 'fecha' : 'fechas'}`;
        const fechasHtml = g.fechas
            .map((f) => {
                const items = f.items.map((it) => `<div class="tl-line">· ${esc(it)}</div>`).join('');
                return `<div class="tl-fecha"><div class="tl-fecha-lbl">${esc(fmtFecha(f.fecha))}</div><div class="tl-items">${items}</div></div>`;
            })
            .join('');
        return `<td class="tl-cell"><div class="tl-card">`
            + `<div class="tl-head"><span class="tl-campo">${esc(g.campo)}</span><span class="tl-badge">${esc(badge)}</span></div>`
            + `<div class="tl-body">${fechasHtml}</div></div></td>`;
    });
    while (cells.length % cols !== 0) cells.push('<td class="tl-cell tl-empty"></td>');

    const rows = [];
    for (let i = 0; i < cells.length; i += cols) {
        rows.push(`<tr>${cells.slice(i, i + cols).join('')}</tr>`);
    }

    return `<table class="bitacora-grid"><tbody>${rows.join('')}</tbody></table>`;
}

/**
 * Resumen narrativo automático (s05c). Lee la ejecución y arma 4-5 bullets.
 */
export function buildNarrativaHtml(execution) {
    if (!execution || execution.length === 0) {
        return `<div class="narrative">
            <p style="color:#94a3b8;font-style:italic">Sin registros de Sanidad o Manejo en el período.</p>
        </div>`;
    }

    /* Agrupar por tipo+actividad para los highlights */
    const groups = {};
    for (const e of execution) {
        const key = `${e.tipo}::${e.actividad || e.actividadRaw}`;
        if (!groups[key]) groups[key] = { tipo: e.tipo, actividad: e.actividad || e.actividadRaw, campos: new Map(), cab: 0 };
        const g = groups[key];
        if (e.campo) g.campos.set(e.campo, (g.campos.get(e.campo) || 0) + (e.cantidad || 0));
        g.cab += e.cantidad || 0;
    }

    const items = Object.values(groups)
        .sort((a, b) => b.cab - a.cab)
        .slice(0, 6)
        .map((g) => {
            /* Cada campo con su cantidad entre paréntesis; al final, la suma total
               (= la suma de los paréntesis de esa actividad). */
            const campos = [...g.campos.entries()]
                .map(([c, n]) => `${esc(c)}${n ? ` (${n})` : ''}`)
                .join(', ');
            const total = g.cab > 0 ? ` — Total: ${g.cab} cab` : '';
            return `<p><strong>${esc(g.tipo)} · ${esc(g.actividad)}:</strong> ${campos}${total}.</p>`;
        })
        .join('');

    return `<div class="narrative">${items}</div>`;
}

/**
 * Tarjetas "Próximas acciones" (s05c).
 * Por ahora simple — derivado de Pendientes del próximo mes (si tenemos esa info).
 * Si no, mostrar un placeholder.
 */
export function buildProximasAccionesHtml(plan, execution) {
    /* Para una versión robusta: lista las actividades del Plan del mes siguiente al cierre.
       Por ahora un placeholder elegante. */
    const fallback = `<div class="next-actions">
        <div class="na-card">
            <div class="na-title">Manejo</div>
            <div class="na-item"><span class="na-dot"></span>Continuar segun el plan del proximo mes.</div>
        </div>
        <div class="na-card">
            <div class="na-title">Sanidad</div>
            <div class="na-item"><span class="na-dot"></span>Aplicar tratamientos pendientes detectados.</div>
        </div>
    </div>`;
    return fallback;
}
