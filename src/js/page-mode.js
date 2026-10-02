/**
 * How wide a note's page is (0.9.3).
 *
 * The owner: "pages should have modes — A4, A3, A5, B4, B5, B3, by the
 * standards — the page width set by them, and the caret with it; the mode we
 * have now is Nebula's own, Nebula Wide (NW), with a narrower Nebula Narrow
 * (NN); boxed beside Saved, like the arrows".
 *
 * A paper mode makes the line as long as it is on that paper when printed:
 * the sheet's width less the app's print margins, 12.7 mm a side (export.js,
 * the print stylesheet). So a line breaks on screen where it will break on
 * paper. Sizes are ISO 216 (A and B series), in millimetres. The mode belongs
 * to the note (`note.page`); it is a setting, not an edit.
 *
 * Nebula Wide is the old way again (the owner, after trying it as A4 turned
 * sideways: "NW should go back to the old style only"): no paper, no page
 * lines, the writing as wide as the window, and 100 % the screen's own size.
 * It is exported on A4, across or upright, chosen in the export's preview.
 * Nebula Narrow is A4 written close to its edges (6.35 mm margins instead of
 * 12.7 — the owner: "an A4 you can write on right up to the edges"), at the
 * screen's own size too; the papers are shown at their real size (page-zoom.js).
 * Every mode with a paper draws a very thin line where the export will start a
 * new page (the content height of its sheet).
 */

/** The print margin a side, in mm — the one the PDF and print paths use. */
export const PRINT_MARGIN_MM = 12.7;
import { printTitleRoom } from './page-order.js';

const PX_PER_MM = 96 / 25.4;

/** In the order of the boxes: the top row, then the bottom one. */
export const PAGE_MODES = [
  { id: 'nw', short: 'NW', name: 'Nebula Wide', w: 297, h: 210, fluid: true },
  { id: 'a3', short: 'A3', name: 'A3', w: 297, h: 420 },
  { id: 'a4', short: 'A4', name: 'A4', w: 210, h: 297 },
  { id: 'a5', short: 'A5', name: 'A5', w: 148, h: 210 },
  { id: 'nn', short: 'NN', name: 'Nebula Narrow', w: 210, h: 297, margin: 6.35 },
  { id: 'b3', short: 'B3', name: 'B3', w: 353, h: 500 },
  { id: 'b4', short: 'B4', name: 'B4', w: 250, h: 353 },
  { id: 'b5', short: 'B5', name: 'B5', w: 176, h: 250 },
];

export const DEFAULT_PAGE = 'nw';

export function pageMode(id) {
  return PAGE_MODES.find((m) => m.id === id) ?? PAGE_MODES[0];
}

/** Nebula Wide's sheet: A4 'landscape' (across) or 'portrait' (upright), chosen at export. */
let wideOrientation = 'landscape';
export function setWideOrientation(o) {
  wideOrientation = o === 'portrait' ? 'portrait' : 'landscape';
  return wideOrientation;
}
export function getWideOrientation() { return wideOrientation; }

/** The sheet a mode prints on, [width, height] in mm. */
export function sheetMm(id) {
  const m = pageMode(id);
  if (m.fluid && wideOrientation === 'portrait') return [m.h, m.w];
  return [m.w, m.h];
}

/** Nebula Wide: no paper on screen, the writing as wide as the window. */
export function isFluid(id) {
  return !!pageMode(id).fluid;
}

/** The papers are shown at their real size; NW and NN at the screen's own (the old way). */
export function usesRealSize(id) {
  return !['nw', 'nn'].includes(pageMode(id).id);
}

/** The print margin a side for a mode, in mm. */
export function marginMm(id) {
  return pageMode(id).margin ?? PRINT_MARGIN_MM;
}

/** The text column in CSS pixels: the sheet's width less its margins. */
export function columnPx(id) {
  const [w] = sheetMm(id);
  return Math.round((w - 2 * marginMm(id)) * PX_PER_MM);
}

/** How tall a page's writing is, in CSS pixels: where the export starts the next page. */
export function pageBreakPx(id) {
  const [, h] = sheetMm(id);
  return Math.round((h - 2 * marginMm(id)) * PX_PER_MM);
}

/** The printed sheet as CSS @page size. */
export function paperSize(id) {
  const [w, h] = sheetMm(id);
  return `${w}mm ${h}mm`;
}

/** The whole sheet's width in CSS pixels (fit to page fits this). */
export function sheetPx(id) {
  return Math.round(sheetMm(id)[0] * PX_PER_MM);
}

/**
 * A4 and the papers smaller than it open at their real size (100 %); the wider
 * ones (A3, B4, B3) fitted to the window, which a laptop cannot show them
 * whole at real size (page-zoom.js). NW and NN open at 100 %, the old size.
 */
export function opensFitted(id) {
  return ['a3', 'b4', 'b3'].includes(pageMode(id).id);
}

/** What a box's tooltip says. */
export function pageTitle(id) {
  const m = pageMode(id);
  if (m.id === 'nw') return 'Nebula Wide — as wide as the window; exported on A4, across or upright';
  if (m.id === 'nn') return 'Nebula Narrow — A4 written close to its edges, 6.35 mm margins';
  return `${m.name} page — ${m.w} × ${m.h} mm`;
}

/**
 * The page on screen: the column (and the paper's edges, drawn by CSS from
 * the same variables) on the editor, and the sheet size for printing.
 */
export function applyPageMode(editorEl, id, doc = document, title = '') {
  const m = pageMode(id);
  if (!editorEl) return m;
  editorEl.dataset.page = m.id;
  // Nebula Wide has no paper on screen: the editor as it always was.
  if (m.fluid) delete editorEl.dataset.paper;
  else editorEl.dataset.paper = '';
  editorEl.style.setProperty('--page-col', `${columnPx(m.id)}px`);
  editorEl.style.setProperty('--page-break', `${pageBreakPx(m.id)}px`);
  editorEl.style.setProperty('--page-margin', `${Math.round(marginMm(m.id) * PX_PER_MM)}px`);
  // The title the PDF prints above the writing on page one: the first page line comes that much sooner.
  if (!m.fluid && doc.body) editorEl.style.setProperty('--page-title', `${printTitleRoom(title, columnPx(m.id), doc)}px`);
  // The scroll bar's width, which the column must not pay for.
  const sb = editorEl.offsetWidth - editorEl.clientWidth - (parseFloat(getComputedStyle(editorEl).borderLeftWidth) || 0) - (parseFloat(getComputedStyle(editorEl).borderRightWidth) || 0);
  editorEl.style.setProperty('--sb', `${Math.max(0, sb)}px`);
  // The live window's print stylesheet sets the sheet; this one comes after it.
  let style = doc.getElementById('page-print-size');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'page-print-size';
    doc.head.append(style);
  }
  // The live window prints with its margin as padding (the print stylesheet's own 12.7 mm, or this mode's).
  style.textContent = `@media print { @page { size: ${paperSize(m.id)}; margin: 0; } .main { padding: ${marginMm(m.id)}mm !important; } }`;
  return m;
}

/**
 * The boxes beside Saved.
 * @param {{group: HTMLElement, editorEl: HTMLElement, current: () => string, choose: (id: string) => void}} deps
 */
export function initPageModes({ group, editorEl, current, choose, title = () => '', translate = (x) => x }) {
  if (!group) return null;
  group.replaceChildren();
  for (const m of PAGE_MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.page = m.id;
    b.textContent = m.short;
    b.title = pageTitle(m.id);
    b.setAttribute('aria-label', pageTitle(m.id));
    b.addEventListener('mousedown', (e) => e.preventDefault());   // keeps the caret where it is
    b.addEventListener('click', () => { choose(m.id); paint(); tell(b, m.id); });
    group.append(b);
  }
  // What a box is, said when it is pressed (the owner: "NW's meaning should
  // come up when it is clicked") — a tooltip waits for a hover nobody makes.
  const hint = document.createElement('div');
  hint.className = 'page-mode-hint';
  hint.setAttribute('role', 'status');
  hint.hidden = true;
  document.body.append(hint);
  let hintTimer = 0;
  function tell(button, id) {
    hint.textContent = translate(pageTitle(id));
    hint.hidden = false;
    const r = button.getBoundingClientRect();
    const w = hint.offsetWidth;
    hint.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
    hint.style.top = `${r.bottom + 8}px`;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hint.hidden = true; }, 3200);
  }
  document.addEventListener('mousedown', (e) => { if (!hint.hidden && !group.contains(e.target)) hint.hidden = true; });

  function paint() {
    const id = pageMode(current()).id;
    applyPageMode(editorEl, id, document, title());
    for (const b of group.querySelectorAll('button')) {
      const on = b.dataset.page === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  paint();
  return { paint };
}
