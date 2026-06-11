/**
 * Construcción del HTML del informe (plantilla + datos Historial_Stock).
 * Compartido entre el navegador (iframe + canvas) y el generador Playwright (JSDOM).
 */

import { buildMatrixTableHtml, buildDeltaMatrixTableHtml } from './informeMatrixBuild.js';
import {
    formatDeltaCab,
    formatPctChange,
    getCategoryQty,
} from './informeReportData.js';
import {
    buildVentasTableHtml,
    buildVentasSummary,
    buildMuertesTableHtml,
    buildMuertesSummary,
    buildNacimientosTableHtml,
    buildNacimientosSummary,
    buildComprasTableHtml,
    buildComprasSummary,
    buildTrasladosTableHtml,
    buildTrasladosSummary,
    buildCxCTableHtml,
    buildCxCSummary,
    buildPlanTableHtml,
    buildPlanMiniHtml,
} from './informeMovementsBuild.js';
import {
    buildCompareTableHtml,
    buildBitacoraHtml,
    buildNarrativaHtml,
} from './informeExecutionBuild.js';

const MOVEMENT_BUILDERS = {
    ventas: { table: buildVentasTableHtml, summary: buildVentasSummary },
    muertes: { table: buildMuertesTableHtml, summary: buildMuertesSummary },
    nacimientos: { table: buildNacimientosTableHtml, summary: buildNacimientosSummary },
    compras: { table: buildComprasTableHtml, summary: buildComprasSummary },
    traslados: { table: buildTrasladosTableHtml, summary: buildTrasladosSummary },
    cxc: { table: buildCxCTableHtml, summary: buildCxCSummary },
};

const MONTHS_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** ISO yyyy-mm-dd → dd/mm/yyyy */
export function formatIsoToAr(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    const [y, m, d] = iso.split('-').map(Number);
    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${dd}/${mm}/${y}`;
}

/** Días calendario que abarca el rango [isoA, isoB] contando ambos extremos. */
export function diffDaysIso(isoA, isoB) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoA || '') || !/^\d{4}-\d{2}-\d{2}$/.test(isoB || '')) {
        return null;
    }
    const [y1, m1, d1] = isoA.split('-').map(Number);
    const [y2, m2, d2] = isoB.split('-').map(Number);
    const a = Date.UTC(y1, m1 - 1, d1);
    const b = Date.UTC(y2, m2 - 1, d2);
    return Math.round((b - a) / 86400000) + 1;
}

/** Fecha local → "4 de mayo, 2026" */
export function formatDateLongSpanish(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]}, ${d.getFullYear()}`;
}

export function fillTemplate(html, vars) {
    return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.split(k).join(v),
        html,
    );
}

/**
 * Sustituye placeholders {{…}} en la plantilla cruda (sin tocar el DOM).
 * @param {string} templateHtml
 * @param {{ fecha1ISO: string, fecha2ISO: string }} opts
 */
export function fillInformeStaticPlaceholders(templateHtml, { fecha1ISO, fecha2ISO }) {
    const fecha1 = formatIsoToAr(fecha1ISO);
    const fecha2 = formatIsoToAr(fecha2ISO);
    const fechaEmisionLarga = formatDateLongSpanish(new Date());
    const informeTitle = `Informe Mensual de Ganadería — ${fecha1} / ${fecha2}`;
    return fillTemplate(templateHtml, {
        '{{INFORME_TITLE}}': informeTitle,
        '{{FECHA1}}': fecha1,
        '{{FECHA2}}': fecha2,
        '{{FECHA_EMISION_LARGA}}': fechaEmisionLarga,
    });
}

function setText(doc, id, text) {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
}

/**
 * Tabla principal de variación (estilo "tablero de control"):
 * CATEGORIA | INICIO | CIERRE | VAR. | %  con fila TOTAL destacada
 * y luego Vientres / Recría / Toros / Invernada.
 */
export function buildVarTableHtml(aggStart, aggEnd, fechaInicio, fechaCierre) {
    const nf = (n) => n.toLocaleString('es-AR');
    const signed = (n) => (n > 0 ? `+${nf(n)}` : n < 0 ? `−${nf(Math.abs(n))}` : '0');
    const varCls = (d) => (d > 0 ? 'up' : d < 0 ? 'down' : 'neu');

    const rows = [
        { key: 'VIENTRES', title: 'Vientres' },
        { key: 'RECRIA', title: 'Recría' },
        { key: 'TOROS', title: 'Toros' },
        { key: 'INVERNADA', title: 'Invernada' },
    ];

    const body = rows
        .map(({ key, title }) => {
            const s0 = aggStart.supra[key];
            const s1 = aggEnd.supra[key];
            const d = s1 - s0;
            const cls = varCls(d);
            return `
        <tr>
          <td class="vt-cat">${title}</td>
          <td class="num">${nf(s0)}</td>
          <td class="num">${nf(s1)}</td>
          <td class="num ${cls}">${signed(d)}</td>
          <td class="num ${cls}">${formatPctChange(s0, s1)}</td>
        </tr>`;
        })
        .join('');

    const t0 = aggStart.supra.TOTAL;
    const t1 = aggEnd.supra.TOTAL;
    const td = t1 - t0;
    const tcls = varCls(td);

    return `
      <table class="var-table" aria-label="Variación de stock por categoría">
        <thead>
          <tr>
            <th class="vt-cat">Categoria</th>
            <th class="num">Inicio<span class="vt-date">${formatIsoToAr(fechaInicio)}</span></th>
            <th class="num">Cierre<span class="vt-date">${formatIsoToAr(fechaCierre)}</span></th>
            <th class="num">Var.</th>
            <th class="num">%</th>
          </tr>
        </thead>
        <tbody>
          <tr class="vt-total">
            <td class="vt-cat">TOTAL</td>
            <td class="num">${nf(t0)}</td>
            <td class="num">${nf(t1)}</td>
            <td class="num ${tcls}">${signed(td)}</td>
            <td class="num ${tcls}">${formatPctChange(t0, t1)}</td>
          </tr>
          ${body}
        </tbody>
      </table>`;
}

/**
 * Tarjeta "Subcategoría: Terneros":
 * al pie (Tro Pie) / ♂ destetados (Tro) / ♀ destetadas (Tra),
 * con Inicio / Cierre / Var.
 */
export function buildTernerosCardHtml(aggStart, aggEnd) {
    const nf = (n) => n.toLocaleString('es-AR');
    const signed = (n) => (n > 0 ? `+${nf(n)}` : n < 0 ? `−${nf(Math.abs(n))}` : '0');
    const varCls = (d) => (d > 0 ? 'up' : d < 0 ? 'down' : 'neu');

    const rows = [
        { label: 'al pie', cat: 'Tro Pie', mark: '<span class="tn-mark tn-pie">○</span>' },
        { label: 'destetados', cat: 'Tro', mark: '<span class="tn-mark tn-m">♂</span>' },
        { label: 'destetadas', cat: 'Tra', mark: '<span class="tn-mark tn-f">♀</span>' },
    ];

    const body = rows
        .map(({ label, cat, mark }) => {
            const n0 = getCategoryQty(aggStart.byCat, cat);
            const n1 = getCategoryQty(aggEnd.byCat, cat);
            const d = n1 - n0;
            return `
        <tr>
          <td class="tn-lbl">${mark}<span>${label}</span></td>
          <td class="num">${nf(n0)}</td>
          <td class="num">${nf(n1)}</td>
          <td class="num ${varCls(d)}">${signed(d)}</td>
        </tr>`;
        })
        .join('');

    return `
      <div class="tn-head">Subcategoría: <strong>Terneros</strong></div>
      <table class="tn-table" aria-label="Subcategoría Terneros">
        <thead>
          <tr><th></th><th class="num">Inicio</th><th class="num">Cierre</th><th class="num">Var.</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>`;
}

/**
 * Recuadro "Control de cierre": la diferencia a revisar (informado − esperado),
 * en un pill verde (ok) o ámbar (a revisar).
 */
export function buildControlCierreHtml(ctx) {
    const m = ctx.movements || {};
    const inicial = ctx.aggStart.supra.TOTAL;
    const informado = ctx.aggEnd.supra.TOTAL;
    const ventas = (m.ventas || []).reduce((s, v) => s + (v.cantidad || 0), 0);
    const muertes = (m.muertes || []).length;
    const compras = (m.compras || []).reduce((s, c) => s + (c.cantidad || 0), 0);
    const nacimientos = (m.nacimientos || []).reduce((s, n) => s + (n.cantidad || 0), 0);
    const esperado = inicial - ventas - muertes + compras + nacimientos;
    const dif = informado - esperado;
    const ok = dif === 0;
    const nf = (n) => Math.round(n).toLocaleString('es-AR');
    const difTxt = dif > 0 ? `+${nf(dif)}` : dif < 0 ? `−${nf(Math.abs(dif))}` : '0';

    return `
      <div class="cc-title">Control de cierre</div>
      <div class="cc-pill ${ok ? 'ok' : 'warn'}">
        <span class="cc-pill-lbl">${ok ? 'Cuadra' : 'Diferencia a revisar'}</span>
        <span class="cc-pill-val">${difTxt}</span>
      </div>
      <div class="cc-foot">${ok ? 'Stock conciliado' : 'Pendiente de conciliación'}</div>`;
}

/**
 * Puente de Stock: explica la variación total como reconciliación.
 * inicial − ventas − muertes + compras + nacimientos = cierre esperado,
 * vs cierre informado, y la diferencia a revisar.
 */
export function buildPuenteStockHtml(ctx) {
    const fmt = (n) => Math.round(n).toLocaleString('es-AR');
    const signed = (n) => (n > 0 ? `+ ${fmt(n)}` : n < 0 ? `− ${fmt(Math.abs(n))}` : '0');
    const m = ctx.movements || {};
    const inicial = ctx.aggStart.supra.TOTAL;
    const informado = ctx.aggEnd.supra.TOTAL;
    const ventas = (m.ventas || []).reduce((s, v) => s + (v.cantidad || 0), 0);
    const muertes = (m.muertes || []).length; // cada fila = 1 cabeza
    const compras = (m.compras || []).reduce((s, c) => s + (c.cantidad || 0), 0);
    const nacimientos = (m.nacimientos || []).reduce((s, n) => s + (n.cantidad || 0), 0);
    const esperado = inicial - ventas - muertes + compras + nacimientos;
    const dif = informado - esperado;
    const difCls = dif === 0 ? 'ok' : 'warn';

    return `
      <div class="puente-head">
        <span class="vmh-tag">Puente de stock</span>
        <span class="vmh-title">Cómo se explica la variación</span>
      </div>
      <table class="puente-table" aria-label="Puente de stock">
        <tbody>
          <tr><td>Stock inicial</td><td class="num">${fmt(inicial)}</td></tr>
          <tr class="resta"><td>− Ventas</td><td class="num">− ${fmt(ventas)}</td></tr>
          <tr class="resta"><td>− Muertes</td><td class="num">− ${fmt(muertes)}</td></tr>
          <tr class="suma"><td>+ Compras</td><td class="num">+ ${fmt(compras)}</td></tr>
          <tr class="suma"><td>+ Nacimientos <span class="puente-note">(terneros al pie)</span></td><td class="num">+ ${fmt(nacimientos)}</td></tr>
          <tr class="reclas"><td>± Reclasificaciones internas <span class="puente-note">(no cambian el total)</span></td><td class="num">0</td></tr>
        </tbody>
        <tfoot>
          <tr class="esperado"><td>= Stock cierre esperado</td><td class="num">${fmt(esperado)}</td></tr>
          <tr class="informado"><td>Stock cierre informado</td><td class="num">${fmt(informado)}</td></tr>
          <tr class="diferencia ${difCls}"><td>Diferencia a revisar</td><td class="num">${signed(dif)}</td></tr>
        </tfoot>
      </table>`;
}

/**
 * @param {Document} doc
 * @param {Awaited<ReturnType<import('./informeReportData.js').loadInformeStockContext>>} ctx
 */
export function applyInformeToDocument(doc, ctx) {
    const { aggStart, aggEnd, deltaTotal, resolvedFechaInicio, resolvedFechaCierre } = ctx;

    setText(doc, 'informe-resolved-fecha-inicio', formatIsoToAr(resolvedFechaInicio));
    setText(doc, 'informe-resolved-fecha-cierre', formatIsoToAr(resolvedFechaCierre));

    /* Subtítulo s03: "01/04/2026 a 29/05/2026 | 59 días calendario" */
    const subEl = doc.getElementById('informe-var-sub');
    if (subEl) {
        const dias = diffDaysIso(resolvedFechaInicio, resolvedFechaCierre);
        const diasTxt = dias != null ? `  |  ${dias} días calendario` : '';
        subEl.textContent = `${formatIsoToAr(resolvedFechaInicio)} a ${formatIsoToAr(resolvedFechaCierre)}${diasTxt}`;
    }

    const cStart = buildMatrixTableHtml(ctx.rowsStart, { tableId: 'matrix-informe-inicio' });
    const cEnd = buildMatrixTableHtml(ctx.rowsEnd, { tableId: 'matrix-informe-cierre' });

    const slotInicio = doc.getElementById('informe-slot-inicio');
    if (slotInicio) {
        slotInicio.innerHTML = `<div class="table-responsive matrix-responsive">${cStart.html}</div>`;
    }
    const slotCierre = doc.getElementById('informe-slot-cierre');
    if (slotCierre) {
        slotCierre.innerHTML = `<div class="table-responsive matrix-responsive">${cEnd.html}</div>`;
    }

    /* Tercera hoja: DIFERENCIA por celda (Cierre − Inicio), con signo y color. */
    const cDelta = buildDeltaMatrixTableHtml(ctx.rowsStart, ctx.rowsEnd, { tableId: 'matrix-informe-delta' });
    const slotDelta = doc.getElementById('informe-slot-delta');
    if (slotDelta) {
        slotDelta.innerHTML = `<div class="table-responsive matrix-responsive">${cDelta.html}</div>`;
    }

    const msgIni = doc.getElementById('informe-msg-inicio');
    if (msgIni) {
        msgIni.textContent = cStart.snapshotDate
            ? `Matriz construida con la foto del ${formatIsoToAr(cStart.snapshotDate)} (última fecha disponible ≤ inicio del informe).`
            : '';
    }
    const msgCie = doc.getElementById('informe-msg-cierre');
    if (msgCie) {
        msgCie.textContent = cEnd.snapshotDate
            ? `Matriz construida con la foto del ${formatIsoToAr(cEnd.snapshotDate)} (última fecha disponible ≤ cierre del informe).`
            : '';
    }

    /* Tabla principal de variación (TOTAL + supracategorías). */
    const varTable = doc.getElementById('informe-var-table');
    if (varTable) {
        varTable.innerHTML = buildVarTableHtml(
            aggStart,
            aggEnd,
            resolvedFechaInicio,
            resolvedFechaCierre,
        );
    }

    /* Columna izquierda: Puente de Stock (sólo con datos de movimientos). */
    const puenteSlot = doc.getElementById('informe-puente-slot');
    if (puenteSlot) {
        if (ctx.movements) {
            puenteSlot.innerHTML = buildPuenteStockHtml(ctx);
        } else {
            puenteSlot.innerHTML = `
        <div class="puente-empty">
          <strong>Puente de stock no disponible.</strong>
          Requiere los movimientos (ventas, muertes, compras, nacimientos) del período.
        </div>`;
        }
    }

    /* Columna derecha arriba: Subcategoría Terneros. */
    const ternerosSlot = doc.getElementById('informe-terneros-slot');
    if (ternerosSlot) {
        ternerosSlot.innerHTML = buildTernerosCardHtml(aggStart, aggEnd);
    }

    /* Columna derecha abajo: Control de cierre (diferencia a revisar). */
    const controlSlot = doc.getElementById('informe-control-slot');
    if (controlSlot) {
        if (ctx.movements) {
            controlSlot.innerHTML = buildControlCierreHtml(ctx);
        } else {
            controlSlot.innerHTML = `
        <div class="cc-title">Control de cierre</div>
        <div class="cc-foot">Requiere movimientos del período.</div>`;
        }
    }

    const kpiStock = doc.getElementById('informe-kpi-stock-cierre');
    if (kpiStock) kpiStock.textContent = fmtN(aggEnd.supra.TOTAL);

    setText(doc, 'informe-kpi-delta-total', formatDeltaCab(deltaTotal));
    setText(
        doc,
        'informe-kpi-delta-sub',
        `${formatIsoToAr(resolvedFechaInicio)} → ${formatIsoToAr(resolvedFechaCierre)}`,
    );

    /* Movimientos reales (Google Sheets). Si no hay ctx.movements, se respeta la plantilla. */
    if (ctx.movements) {
        applyMovementsToDocument(doc, ctx.movements);
    }
}

/**
 * Reemplaza tablas y summaries de Ventas/Muertes/Nacimientos/Compras/Traslados
 * con datos reales. Sólo afecta a los exec-block marcados con data-mov-block.
 * @param {Document} doc
 * @param {{ventas:Array, muertes:Array, nacimientos:Array, compras:Array, traslados:Array}} movements
 */
export function applyMovementsToDocument(doc, movements) {
    Object.entries(MOVEMENT_BUILDERS).forEach(([key, builders]) => {
        const rows = movements[key] || [];
        const block = doc.querySelector(`[data-mov-block="${key}"]`);

        /* Si no hay datos, eliminamos la página entera (informe-pdf-section ancestro). */
        if (rows.length === 0) {
            const section = block?.closest('.informe-pdf-section');
            if (section) section.remove();
            return;
        }

        const tableWrap = doc.querySelector(`[data-mov-table="${key}"]`);
        if (tableWrap) {
            tableWrap.innerHTML = builders.table(rows);
        }
        const summaryEl = doc.querySelector(`[data-mov-summary="${key}"]`);
        if (summaryEl) {
            summaryEl.innerHTML = builders.summary(rows);
        }
    });

    /* Plan de Manejo / Sanitario (planilla de planificación). */
    if (movements.plan) {
        applyPlanToDocument(doc, movements.plan);
    }

    /* Programado vs Real (s05b: Manejo, s05c: Sanitario) + Narrativa (s05d) */
    applyExecutionToDocument(doc, movements);
}

/**
 * Inyecta:
 *  - s05b: Plan de Manejo (Programado vs Real)
 *  - s05c: Plan Sanitario (Programado vs Real)
 *  - s05d: Resumen narrativo, Bitácora WhatsApp, Próximas acciones
 *  Todo derivado de la hoja Whatsapp (bot) + Plan de Federico.
 */
export function applyExecutionToDocument(doc, movements) {
    const comparison = movements.comparison || { manejo: [], sanitario: [] };
    const bitacora = movements.bitacora || [];
    const execution = movements.execution || [];
    const plan = movements.plan;

    /* Mini recuadro del plan programado (arriba de cada comparación) */
    if (plan) {
        const pMan = doc.querySelector('[data-plan-mini="manejo"]');
        if (pMan) pMan.innerHTML = buildPlanMiniHtml(plan.manejo, plan.meses);
        const pSan = doc.querySelector('[data-plan-mini="sanitario"]');
        if (pSan) pSan.innerHTML = buildPlanMiniHtml(plan.sanitario, plan.meses);
    }

    /* s05b - Programado vs Real (Manejo) */
    const cMan = doc.querySelector('[data-exec-compare="manejo"]');
    if (cMan) cMan.innerHTML = buildCompareTableHtml(comparison.manejo, 'Actividad programada');

    /* s05c - Programado vs Real (Sanitario) */
    const cSan = doc.querySelector('[data-exec-compare="sanitario"]');
    if (cSan) cSan.innerHTML = buildCompareTableHtml(comparison.sanitario, 'Tratamiento programado');

    /* s05d - Narrativa (resumen del período) */
    const nar = doc.querySelector('[data-exec-narrativa]');
    if (nar) nar.innerHTML = buildNarrativaHtml(execution);
    if (execution.length === 0) {
        doc.getElementById('informe-pdf-s05d')?.remove();
    }

    /* s05e - Bitácora WhatsApp (sección aparte para que pueda empacar en el blanco
       que deja la sección anterior). Si no hay mensajes, se quita la hoja. */
    const bit = doc.querySelector('[data-exec-bitacora]');
    if (bit) bit.innerHTML = buildBitacoraHtml(bitacora);
    if (bitacora.length === 0) {
        doc.getElementById('informe-pdf-s05e')?.remove();
    }
}

/**
 * Inyecta las tablas del Plan de Manejo y Sanitario (sección 05 · Planificación).
 * @param {Document} doc
 * @param {{meses:Array, manejo:Array, sanitario:Array}} plan
 */
export function applyPlanToDocument(doc, plan) {
    const manejoWrap = doc.querySelector('[data-plan-table="manejo"]');
    if (manejoWrap) {
        manejoWrap.innerHTML = buildPlanTableHtml(plan.manejo, plan.meses);
    }
    const sanitarioWrap = doc.querySelector('[data-plan-table="sanitario"]');
    if (sanitarioWrap) {
        sanitarioWrap.innerHTML = buildPlanTableHtml(plan.sanitario, plan.meses);
    }
}

/**
 * Serializa el documento completo (respeta DOCTYPE si existe).
 * @param {Document} doc
 */
export function serializeInformeDocument(doc) {
    const docEl = doc.documentElement;
    if (!docEl) return '<!DOCTYPE html><html><body></body></html>';
    const inner = docEl.outerHTML;
    if (!inner.toLowerCase().includes('<!doctype')) {
        return `<!DOCTYPE html>${inner}`;
    }
    return inner;
}
