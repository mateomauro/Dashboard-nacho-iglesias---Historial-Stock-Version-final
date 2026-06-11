/**
 * Informe ganadero: datos reales desde Historial_Stock (Supabase).
 * Descarga en navegador: html2canvas → jsPDF (respaldo, bitmap).
 * Para PDF vectorial y saltos prolijos usar: npm run pdf:informe
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
    applyInformeToDocument,
    fillInformeStaticPlaceholders,
} from './informeHtmlBuild.js';
import { loadInformeStockContext } from './informeReportData.js';
import { fetchMovementsContext } from './src/lib/fetchMovements.js';

export { formatDateLongSpanish, formatIsoToAr } from './informeHtmlBuild.js';

const CAPTURE_WIDTH_MIN = 1500;
const SCALE = 2;
const PDF_MARGIN_MM = 6;
const JPEG_QUALITY = 0.92;

/**
 * Layout del PDF (todo apaisado):
 *  - kind 'page': una sección = una hoja completa, ajustada/estirada a la hoja
 *    (Stock / Variación, infografías de página completa).
 *  - kind 'section': tabla de ejecución. Se EMPACAN (bin-packing keep-together):
 *    varias secciones cortas comparten una hoja mientras entren (con un separador
 *    fino), sin partir ninguna. Cuando la próxima no entra, hoja nueva. Una sección
 *    más alta que una hoja se parte por borde de fila en hojas enteras (rowSnap),
 *    con la letra a escala FIJA (no se achica nunca). El orden NO se reordena.
 *    Si una sección no tiene filas, se quita del DOM antes y acá se saltea.
 *  - Orden de ejecución pedido por el cliente: Cobros (Cuentas por Cobrar) va
 *    JUSTO después de Ventas.
 */
const PDF_LAYOUT = [
    /** Stock + Variación: una sección = una hoja completa (infografías). */
    { kind: 'page', id: 'informe-pdf-s02', fitOnePage: true, fitStretchFill: true },
    { kind: 'page', id: 'informe-pdf-s01', fitOnePage: true, fitStretchFill: true },
    { kind: 'page', id: 'informe-pdf-s02b', fitOnePage: true, fitStretchFill: true }, // Diferencia: llena la hoja como Inicio/Cierre (con max-content no recorta)
    { kind: 'page', id: 'informe-pdf-s03', fitOnePage: true, fitStretchFill: false, fitUpscale: false, fitAlignTop: true }, // Tablero de control: preserva proporciones (no estira ni agranda), alineado arriba
    { kind: 'section', id: 'informe-pdf-s04' },  // Ventas
    { kind: 'section', id: 'informe-pdf-s04f' }, // Cobros (Cuentas por Cobrar) — pedido: tras Ventas
    { kind: 'section', id: 'informe-pdf-s04b' }, // Muertes
    { kind: 'section', id: 'informe-pdf-s04c' }, // Nacimientos
    { kind: 'section', id: 'informe-pdf-s04d' }, // Compras
    { kind: 'section', id: 'informe-pdf-s04e' }, // Traslados
    { kind: 'section', id: 'informe-pdf-s05b' }, // Programado vs Real — Manejo
    { kind: 'section', id: 'informe-pdf-s05c' }, // Programado vs Real — Sanitario
    { kind: 'section', id: 'informe-pdf-s05d' }, // Narrativa (resumen)
    { kind: 'section', id: 'informe-pdf-s05e', softFill: true }, // Bitácora WhatsApp: puede partirse para llenar el blanco que dejó la sección anterior
];

function copyParentStyles(iframeDoc) {
    const head = iframeDoc.head;
    if (!head) return;

    const nodes = document.querySelectorAll(
        'link[rel="stylesheet"], style',
    );

    nodes.forEach((node) => {
        const clone = node.cloneNode(true);
        if (clone.tagName === 'LINK') {
            const href = node.getAttribute('href');
            if (href) {
                try {
                    clone.setAttribute('href', new URL(href, document.baseURI).href);
                } catch (_) {
                    /* noop */
                }
            }
        }
        head.appendChild(clone);
    });
}

function waitForIframeLoad(iframe) {
    return new Promise((resolve, reject) => {
        const onLoad = () => {
            iframe.removeEventListener('load', onLoad);
            iframe.removeEventListener('error', onError);
            resolve();
        };
        const onError = () => {
            iframe.removeEventListener('load', onLoad);
            iframe.removeEventListener('error', onError);
            reject(new Error('No se pudo cargar el informe en el iframe.'));
        };
        iframe.addEventListener('load', onLoad);
        iframe.addEventListener('error', onError);
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUniformBreakpoints(canvasH, pageHpx) {
    const out = [0];
    let y = 0;
    while (y + pageHpx < canvasH) {
        y += pageHpx;
        out.push(Math.round(y));
    }
    if (out[out.length - 1] < canvasH) out.push(canvasH);
    return out;
}

/** Bordes inferiores (px, escalados, relativos al tope) de cada fila <tr> del elemento. */
function computeRowBottoms(captureEl, canvasH) {
    const elRect = captureEl.getBoundingClientRect();
    const trs = [...captureEl.querySelectorAll('tr')];
    if (!trs.length) return null;
    return trs
        .map((tr) => (tr.getBoundingClientRect().bottom - elRect.top) * SCALE)
        .map((b) => Math.min(Math.max(0, b), canvasH))
        .sort((a, b) => a - b);
}

/** Control de "fila viuda": si la última hoja quedó con un resto ínfimo (1 fila),
    sube el corte anterior para dejarle ~2-3 filas juntas. Muta `out`.
    Pensado para tablas de MUCHAS filas chicas: mover el corte cuesta poco.
    Con filas gigantes (p. ej. la bitácora: 4 tarjetas grandes) NO debe actuar:
    subiría el corte tanto que dejaría la hoja anterior casi vacía. */
function applyWidowControl(out, bottoms, canvasH, pageHpx) {
    if (out.length < 3) return;
    const diffs = [];
    for (let i = 1; i < bottoms.length; i++) {
        const d = bottoms[i] - bottoms[i - 1];
        if (d > 1) diffs.push(d);
    }
    diffs.sort((a, b) => a - b);
    const rowH = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
    if (rowH <= 0) return;
    const minLast = rowH * 2.5;          // que la última hoja tenga ~2-3 filas
    const penult = out.length - 2;       // inicio de la última hoja
    const floor = out[penult - 1];       // inicio de la penúltima hoja
    const lastSeg = canvasH - out[penult];
    if (lastSeg > 0 && lastSeg < minLast) {
        const target = canvasH - minLast;
        let best = -1;
        for (const b of bottoms) {
            if (b > floor + 1 && b <= target && b > best) best = b;
        }
        /* Guard: la hoja anterior debe quedar ≥70% llena tras mover el corte.
           Si no (filas enormes), preferimos el blanco al FINAL, nunca al principio. */
        const keepsPageFull = pageHpx > 0 ? (best - floor) >= pageHpx * 0.7 : true;
        if (best > floor && best < out[penult] && keepsPageFull) {
            out[penult] = Math.round(best);
        }
    }
}

/**
 * LLENADO (greedy) por borde de fila: cada hoja se llena al máximo cortando en la
 * última fila que entra completa. La PRIMERA hoja dispone de `firstAvailPx` (para
 * empezar en el blanco que dejó la sección anterior); las siguientes, `pageHpx`.
 */
function sliceGreedy(bottoms, canvasH, pageHpx, firstAvailPx, widow = true) {
    const out = [0];
    let start = 0;
    let avail = firstAvailPx;
    let guard = 0;
    while (start < canvasH - 0.5 && guard < 800) {
        guard += 1;
        const remainingH = canvasH - start;
        if (remainingH <= avail + 0.5) break; // lo que queda entra en una hoja
        const maxCut = start + avail;
        let best = -1;
        for (const b of bottoms) {
            if (b > start + 1 && b <= maxCut && b > best) best = b;
        }
        const cut = best > start ? best : maxCut; // fila gigante: corte duro
        out.push(Math.round(cut));
        start = cut;
        avail = pageHpx; // de la 2ª hoja en adelante, hoja completa
    }
    if (out[out.length - 1] < canvasH) out.push(canvasH);
    /* En soft-fill NO aplicamos viuda: queremos llenar el blanco al máximo; el resto
       fluye (aunque la última franja quede corta, suele ser contenido final). */
    if (widow) applyWidowControl(out, bottoms, canvasH, pageHpx);
    return [...new Set(out)].sort((a, b) => a - b);
}

function buildRowBreakpoints(captureEl, canvasH, pageHpx) {
    const bottoms = computeRowBottoms(captureEl, canvasH);
    if (!bottoms) return null;
    if (canvasH <= pageHpx) return [0, canvasH];
    return sliceGreedy(bottoms, canvasH, pageHpx, pageHpx);
}

function resolveBreakpoints(captureEl, canvasH, pageHpx, useRowSnap) {
    if (useRowSnap || captureEl.querySelector('table')) {
        const bp = buildRowBreakpoints(captureEl, canvasH, pageHpx);
        if (bp && bp.length > 1) {
            return { breakpoints: bp };
        }
    }

    return {
        breakpoints: buildUniformBreakpoints(canvasH, pageHpx),
    };
}

/**
 * @param {import('jspdf').jsPDF} pdf
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} breakpoints
 * @param {number} pxPerMm
 * @param {number} usableWmm
 * @param {number} usableHmm
 * @param {number} globalPageIndex
 */
function addCanvasSlicesToPdf(
    pdf,
    canvas,
    breakpoints,
    pxPerMm,
    usableWmm,
    usableHmm,
    globalPageIndex,
) {
    const margin = PDF_MARGIN_MM;
    const n = breakpoints.length - 1;
    let pageCounter = globalPageIndex;

    for (let i = 0; i < n; i++) {
        const y0 = breakpoints[i];
        const y1 = breakpoints[i + 1];
        const sliceH = y1 - y0;

        if (pageCounter > 0) {
            pdf.addPage('a4', 'l');
        }

        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, -y0);

        const sliceHmm = sliceH / pxPerMm;
        const yMm = margin;

        const data = slice.toDataURL('image/jpeg', JPEG_QUALITY);
        pdf.addImage(data, 'JPEG', margin, yMm, usableWmm, sliceHmm);
        pageCounter++;
    }

    return pageCounter;
}

/**
 * Una sección en una sola página: encaja en el área útil (matrices solo se achican).
 * Con allowUpscale, puede agrandarse hasta llenar la hoja (p. ej. variación del período).
 * Con allowStretchFill, llena exactamente el área útil sin preservar aspect ratio
 * (útil para matrices: las dos hojas Inicio/Cierre quedan idénticas y aprovechan toda la hoja).
 */
function addCanvasFitOnePageToPdf(
    pdf,
    canvas,
    pxPerMm,
    usableWmm,
    usableHmm,
    globalPageIndex,
    allowUpscale = false,
    allowStretchFill = false,
    alignTop = false,
) {
    const margin = PDF_MARGIN_MM;
    let wMm;
    let hMm;
    if (allowStretchFill) {
        wMm = usableWmm;
        hMm = usableHmm;
    } else {
        const contentWmm = canvas.width / pxPerMm;
        const contentHmm = canvas.height / pxPerMm;
        const fit = Math.min(usableWmm / contentWmm, usableHmm / contentHmm);
        const scale = allowUpscale ? fit : Math.min(1, fit);
        wMm = contentWmm * scale;
        hMm = contentHmm * scale;
    }
    const xMm = margin + (usableWmm - wMm) / 2;
    const yMm = alignTop ? margin : margin + (usableHmm - hMm) / 2;

    if (globalPageIndex > 0) {
        pdf.addPage('a4', 'l');
    }

    const data = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    pdf.addImage(data, 'JPEG', xMm, yMm, wMm, hMm);
    return globalPageIndex + 1;
}

/** Recorta una franja [y0, y0+sliceH) del canvas en un canvas nuevo (fondo blanco). */
function makeSliceCanvas(canvas, y0, sliceH) {
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, -y0);
    return slice;
}

function placeCanvasImage(pdf, canvas, xMm, yMm, wMm, hMm) {
    const data = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    pdf.addImage(data, 'JPEG', xMm, yMm, wMm, hMm);
}

/**
 * EMPAQUE de bloques en hojas A4 apaisadas (bin-packing keep-together, en mm):
 *  - mode 'page': cada uno ocupa una hoja completa (Stock/Variación), ajustado/estirado.
 *  - mode 'section': bloque ATÓMICO. Se apilan en la misma hoja mientras entren (con un
 *    separador fino). Si la próxima sección no entra, hoja nueva. Una sección más alta
 *    que una hoja se parte por borde de fila (breakpoints precalculados), en hojas
 *    enteras y SIN achicar la letra (la continuación sigue con las filas siguientes).
 * Todas las secciones se capturan al mismo ancho (1700px) → misma escala → la letra
 * mide lo mismo en todas. NO reordena (respeta el orden del array).
 * @returns {{ pages: number, placements: Array }}
 */
function layoutBlocksToPdf(pdf, blocks, usableWmm, usableHmm) {
    const GAP_MM = 5;            // aire entre secciones apiladas
    const SOFT_MIN_FILL_MM = 45; // blanco mínimo para que valga la pena soft-fill
    const margin = PDF_MARGIN_MM;
    const placements = [];
    let firstPlacement = true;  // la 1ª hoja ya existe en jsPDF; no hacer addPage
    let curUsedMm = 0;          // alto ya usado en la hoja actual
    let pageNo = 1;

    const newPage = () => {
        if (!firstPlacement) { pdf.addPage('a4', 'l'); pageNo += 1; }
        firstPlacement = false;
        curUsedMm = 0;
    };
    const divider = (yMm) => {
        pdf.setDrawColor(203, 213, 225);
        pdf.setLineWidth(0.25);
        pdf.line(margin + 8, yMm, margin + usableWmm - 8, yMm);
    };

    for (const b of blocks) {
        const pxPerMm = b.canvas.width / usableWmm;

        if (b.mode === 'page') {
            newPage();
            let wMm;
            let hMm;
            if (b.stretchFill) {
                wMm = usableWmm;
                hMm = usableHmm;
            } else {
                const cW = b.canvas.width / pxPerMm;
                const cH = b.canvas.height / pxPerMm;
                const fit = Math.min(usableWmm / cW, usableHmm / cH);
                const scale = b.upscale ? fit : Math.min(1, fit);
                wMm = cW * scale;
                hMm = cH * scale;
            }
            const xMm = margin + (usableWmm - wMm) / 2;
            const yMm = b.alignTop ? margin : margin + (usableHmm - hMm) / 2;
            placeCanvasImage(pdf, b.canvas, xMm, yMm, wMm, hMm);
            placements.push({ id: b.id, page: pageNo, kind: 'page', yTopMm: Math.round(yMm), hMm: Math.round(hMm) });
            curUsedMm = usableHmm; // la hoja queda llena
            continue;
        }

        // mode 'section'
        const pageHpx = Math.floor(usableHmm * pxPerMm);
        const sectionHmm = b.canvas.height / pxPerMm;
        const gap = curUsedMm > 0 ? GAP_MM : 0;
        const remainMm = usableHmm - curUsedMm - gap;

        // 1) ¿Entra ENTERA en lo que queda de la hoja actual? → apilar tal cual.
        if (curUsedMm > 0 && sectionHmm <= remainMm + 0.5) {
            const yTop = margin + curUsedMm + gap;
            divider(margin + curUsedMm + gap / 2);
            placeCanvasImage(pdf, b.canvas, margin, yTop, usableWmm, sectionHmm);
            placements.push({ id: b.id, page: pageNo, kind: 'packed', yTopMm: Math.round(yTop), hMm: Math.round(sectionHmm) });
            curUsedMm += gap + sectionHmm;
            continue;
        }

        /* 2) SOFT-FILL (solo secciones marcadas, p. ej. la Bitácora): si quedó blanco
              aprovechable, arrancamos acá llenándolo y el resto fluye a hojas nuevas.
              Solo si entra el encabezado + ≥1 fila en el blanco (no dejamos títulos solos). */
        let onCurrentPage = false;
        let firstAvailPx = pageHpx;
        if (b.softFill && b.bottoms && b.bottoms.length && curUsedMm > 0 && remainMm >= SOFT_MIN_FILL_MM) {
            const firstRowPx = b.bottoms.find((x) => x > 1);
            if (firstRowPx && firstRowPx <= remainMm * pxPerMm) {
                onCurrentPage = true;
                firstAvailPx = remainMm * pxPerMm;
            }
        }

        // 3) Entra en una hoja y NO estamos rellenando blanco → hoja nueva, entera.
        if (!onCurrentPage && sectionHmm <= usableHmm + 0.5) {
            newPage();
            placeCanvasImage(pdf, b.canvas, margin, margin, usableWmm, sectionHmm);
            placements.push({ id: b.id, page: pageNo, kind: 'top', yTopMm: margin, hMm: Math.round(sectionHmm) });
            curUsedMm = sectionHmm;
            continue;
        }

        // 4) Partir en franjas. Soft-fill: 1ª franja en el blanco actual; resto, hojas
        //    enteras. Sección más alta que una hoja: franjas de hoja completa.
        const cuts = (b.softFill && b.bottoms && b.bottoms.length)
            ? sliceGreedy(b.bottoms, b.canvas.height, pageHpx, onCurrentPage ? firstAvailPx : pageHpx, !onCurrentPage)
            : (b.breakpoints && b.breakpoints.length > 1
                ? b.breakpoints
                : buildUniformBreakpoints(b.canvas.height, pageHpx));
        for (let i = 0; i < cuts.length - 1; i++) {
            const y0 = cuts[i];
            const sliceH = cuts[i + 1] - y0;
            const slice = makeSliceCanvas(b.canvas, y0, sliceH);
            const sliceHmm = sliceH / pxPerMm;
            if (i === 0 && onCurrentPage) {
                const yTop = margin + curUsedMm + gap;
                divider(margin + curUsedMm + gap / 2);
                placeCanvasImage(pdf, slice, margin, yTop, usableWmm, sliceHmm);
                placements.push({ id: b.id, page: pageNo, kind: 'fill-start', yTopMm: Math.round(yTop), hMm: Math.round(sliceHmm) });
                curUsedMm += gap + sliceHmm;
            } else {
                newPage();
                placeCanvasImage(pdf, slice, margin, margin, usableWmm, sliceHmm);
                placements.push({ id: b.id, page: pageNo, kind: i === 0 ? 'split-start' : 'split-cont', yTopMm: margin, hMm: Math.round(sliceHmm) });
                curUsedMm = sliceHmm; // permite apilar una sección corta bajo la cola del corte
            }
        }
    }

    return { pages: pageNo, placements };
}

/**
 * Construye un bloque para `layoutBlocksToPdf` a partir de un elemento ya capturado.
 * Para secciones más altas que una hoja, precalcula los breakpoints AHORA (mientras el
 * contenedor está medible al ancho correcto), no en el momento del layout.
 */
function buildPdfBlock(item, canvas, el, usableWmm, usableHmm) {
    if (item.kind === 'page' && item.fitOnePage !== false) {
        return {
            id: item.id, canvas, mode: 'page',
            stretchFill: item.fitStretchFill === true,
            upscale: item.fitUpscale === true,
            alignTop: item.fitAlignTop === true,
        };
    }
    const pxPerMm = canvas.width / usableWmm;
    const pageHeightPx = Math.floor(usableHmm * pxPerMm);
    const sectionHmm = canvas.height / pxPerMm;
    const softFill = item.softFill === true;
    /* Bordes de fila: para soft-fill los necesitamos siempre (corte a cualquier alto);
       para el resto, solo si la sección es más alta que una hoja. */
    const bottoms = softFill ? computeRowBottoms(el, canvas.height) : null;
    let breakpoints = null;
    if (sectionHmm > usableHmm + 0.5) {
        breakpoints = resolveBreakpoints(el, canvas.height, pageHeightPx, true).breakpoints;
    }
    return { id: item.id, canvas, mode: 'section', breakpoints, bottoms, softFill };
}

/**
 * @param {HTMLIFrameElement} iframe
 * @param {HTMLElement} el
 */
export async function captureElementToCanvas(iframe, el) {
    const pad = 48;
    const w = Math.max(CAPTURE_WIDTH_MIN, Math.ceil(el.scrollWidth) + pad);
    const h = Math.ceil(el.scrollHeight) + pad;

    iframe.style.width = `${w}px`;
    iframe.style.height = `${h}px`;
    await sleep(120);

    const opts = {
        scale: SCALE,
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: false,
        logging: false,
        windowWidth: w,
        windowHeight: h,
        scrollX: 0,
        scrollY: 0,
        foreignObjectRendering: false,
    };

    try {
        return await html2canvas(el, opts);
    } catch (err) {
        /* Reintento defensivo: el path del iframe a veces queda transitoriamente
           sin window ("Document is not attached to a Window"). */
        await sleep(220);
        return html2canvas(el, opts);
    }
}

/**
 * @param {{ fecha1ISO: string, fecha2ISO: string }} opts
 */
export async function downloadGanaderiaInformePdf({ fecha1ISO, fecha2ISO }) {
    const stockCtx = await loadInformeStockContext(fecha1ISO, fecha2ISO);

    /* Movements via Netlify Function (credenciales server-side, jamás en el browser).
       Si NO se pueden traer los datos reales de movimientos, abortamos: NO generamos el
       PDF con la plantilla de ejemplo (saldrían ventas/muertes/etc. FALSAS sin avisar). */
    const movements = await fetchMovementsContext(fecha1ISO, fecha2ISO);
    if (!movements) {
        throw new Error(
            'No se pudieron obtener los movimientos del período (ventas, muertes, compras, etc.). ' +
            'El informe no se generó para evitar mostrar datos de ejemplo. ' +
            'Revisá la conexión e intentá de nuevo en unos minutos.',
        );
    }
    stockCtx.movements = movements;

    const base = import.meta.env.BASE_URL || '/';
    const normalized = base.endsWith('/') ? base : `${base}/`;
    const url = `${normalized}informe-ganaderia-v2.template.html`;
    /* no-store: siempre traer la plantilla fresca (evita PDFs con CSS viejo cacheado). */
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`No se pudo cargar la plantilla (${res.status})`);

    let html = fillInformeStaticPlaceholders(await res.text(), { fecha1ISO, fecha2ISO });

    document.querySelectorAll('iframe[data-informe-render]').forEach((n) => n.remove());
    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-informe-render', 'true');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = [
        'position:fixed',
        'left:-99999px',
        'top:0',
        `width:${CAPTURE_WIDTH_MIN}px`,
        'height:240px',
        'border:0',
        'visibility:hidden',
    ].join(';');
    document.body.appendChild(iframe);

    /* Blob URL en iframe suele dejar document.defaultView === null y html2canvas
       lanza "Document is not attached to a Window". srcdoc hereda origen del padre. */
    const loadPromise = waitForIframeLoad(iframe);
    iframe.srcdoc = html;
    try {
        await loadPromise;

        let doc = iframe.contentDocument;
        if (!doc) throw new Error('No se pudo acceder al documento del informe.');

        if (!doc.defaultView) {
            iframe.removeAttribute('srcdoc');
            const blankLoad = waitForIframeLoad(iframe);
            iframe.src = 'about:blank';
            await blankLoad;
            const d2 = iframe.contentDocument;
            if (!d2?.defaultView) {
                throw new Error(
                    'El iframe del informe no obtuvo ventana; usá npm run pdf:informe para PDF vectorial.',
                );
            }
            d2.open();
            d2.write(html);
            d2.close();
            await sleep(50);
            doc = iframe.contentDocument;
            if (!doc?.defaultView) {
                throw new Error('No se pudo preparar el documento para captura.');
            }
        }

        copyParentStyles(doc);
        applyInformeToDocument(doc, stockCtx);

        doc.body?.classList.add('informe-pdf-capture-mode');
        doc.body?.classList.remove('informe-print-ready');

        try {
            if (doc.fonts?.ready) await doc.fonts.ready;
        } catch (_) {
            /* noop */
        }
        await sleep(450);

        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const usableWmm = pageW - PDF_MARGIN_MM * 2;
        const usableHmm = pageH - PDF_MARGIN_MM * 2;

        /* 1) Capturamos cada sección a su canvas (al ancho fijo de 1700px) y, para las
              más altas que una hoja, precalculamos los cortes por fila ACÁ (mientras el
              iframe está dimensionado para esa sección; medirlos después daría mal).
           2) Empacamos: Stock/Variación a hoja completa; las tablas de ejecución se
              apilan varias por hoja mientras entren, sin achicar la letra. */
        const blocks = [];
        for (const item of PDF_LAYOUT) {
            const el = doc.getElementById(item.id);
            if (!el) continue;
            const canvas = await captureElementToCanvas(iframe, el);
            blocks.push(buildPdfBlock(item, canvas, el, usableWmm, usableHmm));
        }
        layoutBlocksToPdf(pdf, blocks, usableWmm, usableHmm);

        const filename = `Informe_Ganaderia_${fecha1ISO}_${fecha2ISO}.pdf`;
        pdf.save(filename);
    } finally {
        setTimeout(() => iframe.remove(), 400);
    }
}

/**
 * SOLO TEST — captura un elemento ya montado en el DOM (con capture-mode aplicado)
 * y lo pagina con la MISMA lógica de producción (rowSnap → addCanvasSlicesToPdf).
 * Devuelve la cantidad de páginas, las alturas de cada slice (mm) y el PDF en data-uri.
 * Sirve para verificar, en un navegador real, que las tablas largas se cortan en
 * varias hojas sin achicar la letra. No se usa en producción.
 */
export async function __renderElementToPdfForTest(el) {
    const canvas = await html2canvas(el, {
        scale: SCALE,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
    });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const usableWmm = pdf.internal.pageSize.getWidth() - PDF_MARGIN_MM * 2;
    const usableHmm = pdf.internal.pageSize.getHeight() - PDF_MARGIN_MM * 2;
    const pxPerMm = canvas.width / usableWmm;
    const pageHeightPx = Math.floor(usableHmm * pxPerMm);
    const { breakpoints } = resolveBreakpoints(el, canvas.height, pageHeightPx, true);
    addCanvasSlicesToPdf(pdf, canvas, breakpoints, pxPerMm, usableWmm, usableHmm, 0);
    const sliceHeightsMm = [];
    for (let i = 1; i < breakpoints.length; i++) {
        sliceHeightsMm.push(Math.round(((breakpoints[i] - breakpoints[i - 1]) / pxPerMm) * 10) / 10);
    }
    return {
        pages: breakpoints.length - 1,
        canvasHeightPx: canvas.height,
        pageHeightPx,
        sliceHeightsMm,
        usableHmm: Math.round(usableHmm * 10) / 10,
        dataUri: pdf.output('datauristring'),
    };
}

/** SOLO TEST — render de una sección a una hoja con estirado (como Stock/Variación). */
export async function __renderStretchToPdfForTest(el) {
    const canvas = await html2canvas(el, {
        scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false,
    });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const usableWmm = pdf.internal.pageSize.getWidth() - PDF_MARGIN_MM * 2;
    const usableHmm = pdf.internal.pageSize.getHeight() - PDF_MARGIN_MM * 2;
    const pxPerMm = canvas.width / usableWmm;
    addCanvasFitOnePageToPdf(pdf, canvas, pxPerMm, usableWmm, usableHmm, 0, true, true, false);
    return { dataUri: pdf.output('datauristring'), canvasW: canvas.width, canvasH: canvas.height };
}

/** SOLO TEST — render de una sección a una hoja preservando aspecto (sin estirar). */
export async function __renderFitToPdfForTest(el) {
    const canvas = await html2canvas(el, {
        scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false,
    });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const usableWmm = pdf.internal.pageSize.getWidth() - PDF_MARGIN_MM * 2;
    const usableHmm = pdf.internal.pageSize.getHeight() - PDF_MARGIN_MM * 2;
    const pxPerMm = canvas.width / usableWmm;
    addCanvasFitOnePageToPdf(pdf, canvas, pxPerMm, usableWmm, usableHmm, 0, true, false, false);
    return { dataUri: pdf.output('datauristring'), canvasW: canvas.width, canvasH: canvas.height };
}

/**
 * SOLO TEST — renderiza varias secciones, CADA UNA arrancando en su propia hoja
 * y cortándose por filas si es larga (igual que el loop de producción por-sección).
 * Combina todo en un PDF. Devuelve páginas totales, páginas por sección y data-uri.
 */
export async function __renderSectionsToPdfForTest(els) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const usableWmm = pdf.internal.pageSize.getWidth() - PDF_MARGIN_MM * 2;
    const usableHmm = pdf.internal.pageSize.getHeight() - PDF_MARGIN_MM * 2;
    let globalPageIdx = 0;
    const perSection = [];
    for (const el of els) {
        if (!el) continue;
        const canvas = await html2canvas(el, {
            scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false,
        });
        const pxPerMm = canvas.width / usableWmm;
        const pageHeightPx = Math.floor(usableHmm * pxPerMm);
        const { breakpoints } = resolveBreakpoints(el, canvas.height, pageHeightPx, true);
        globalPageIdx = addCanvasSlicesToPdf(pdf, canvas, breakpoints, pxPerMm, usableWmm, usableHmm, globalPageIdx);
        perSection.push(breakpoints.length - 1);
    }
    return { totalPages: globalPageIdx, perSection, dataUri: pdf.output('datauristring') };
}

/**
 * SOLO TEST — renderiza una lista de elementos con el MOTOR DE EMPAQUE de producción
 * (layoutBlocksToPdf): tablas cortas apiladas varias por hoja, largas partidas por fila.
 * `specs` es una lista de elementos, o de objetos { el, mode?, stretchFill?, upscale?, alignTop? }.
 * Devuelve { pages, placements, dataUri } para verificar el empaque sin abrir el visor.
 */
export async function __renderPackedToPdfForTest(specs) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const usableWmm = pdf.internal.pageSize.getWidth() - PDF_MARGIN_MM * 2;
    const usableHmm = pdf.internal.pageSize.getHeight() - PDF_MARGIN_MM * 2;
    const blocks = [];
    for (const spec of specs) {
        const el = spec?.el || spec;
        if (!el) continue;
        const canvas = await html2canvas(el, {
            scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false,
        });
        const item = {
            id: el.id,
            kind: spec?.mode === 'page' ? 'page' : 'section',
            fitStretchFill: spec?.stretchFill === true,
            fitUpscale: spec?.upscale === true,
            fitAlignTop: spec?.alignTop === true,
            softFill: spec?.softFill === true,
        };
        blocks.push(buildPdfBlock(item, canvas, el, usableWmm, usableHmm));
    }
    const { pages, placements } = layoutBlocksToPdf(pdf, blocks, usableWmm, usableHmm);
    return { pages, placements, dataUri: pdf.output('datauristring') };
}
