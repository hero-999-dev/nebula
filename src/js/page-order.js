/**
 * Auto order page (0.9.3).
 *
 * The owner: "beside the page zoom an auto order page button — press it and
 * it puts right what runs over; by hand, with every page but NW", and in a
 * note's ⋯ menu a way to turn it on for that note. What it puts right is what
 * a page line falls across: a shape or a picture the export would cut in two
 * or push to the next page. Each is moved down to just below the line, so the
 * screen and the PDF break in the same place.
 *
 * The lines (page-mode.js, editor.css) are where the PDF starts a new page:
 * every page height (the sheet less its margins) from where the writing
 * starts, less the note's title, which the PDF prints above the writing on the
 * first page (`--page-title`). All measured in the page's own pixels (CSS
 * zoom divided out), from the top of the editor's padding box — the canvas's
 * corner, and where the shapes' `top` counts from.
 *
 * A shape or a floating picture is moved by its `top`. A picture in the text
 * gets a top margin of its own, marked `data-page-gap` so the next run takes
 * it back before measuring again (the words above it may have moved).
 */
import { editorZoom } from './page-zoom.js';

/** Room left under a line for what is moved below it. */
export const ORDER_GAP = 8;
/** Where the writing starts in the editor (its top padding). */
const WRITING_TOP = 16;

/**
 * The first page line strictly inside (top, bottom), or null. Lines are at
 * origin + k * pageHeight for k >= 1.
 */
export function lineAcross(top, bottom, origin, pageHeight) {
  if (!(pageHeight > 0) || !(bottom > top)) return null;
  const k = Math.max(1, Math.floor((top - origin) / pageHeight) + 1);
  const y = origin + k * pageHeight;
  return y > top + 0.5 && y < bottom - 0.5 ? y : null;
}

/** Where a box goes so that no line falls across it, or null if it is fine or cannot fit on a page. */
export function placeBelow(top, height, origin, pageHeight, gap = ORDER_GAP) {
  const y = lineAcross(top, top + height, origin, pageHeight);
  if (y === null) return null;
  if (height > pageHeight - 2 * gap) return null;          // taller than a page: nothing to gain
  return y + gap;
}

function lines(editorEl) {
  const px = (name) => Number.parseFloat(editorEl.style.getPropertyValue(name)) || 0;
  const pageHeight = px('--page-break');
  return { pageHeight, origin: WRITING_TOP - px('--page-title') };
}

/**
 * Put right what a page line falls across, in the open note.
 * @returns {number} how many things were moved
 */
export function orderPage(editorEl) {
  if (!editorEl || !('paper' in editorEl.dataset)) return 0;     // Nebula Wide: nothing changes
  const { pageHeight, origin } = lines(editorEl);
  if (!(pageHeight > 0)) return 0;
  const z = editorZoom(editorEl);
  const top0 = () => editorEl.getBoundingClientRect().top;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { top: (r.top - top0()) / z + editorEl.scrollTop, height: r.height / z };
  };
  let moved = 0;

  // Pictures in the text first: a gap given to one moves everything under it.
  const inline = [...editorEl.querySelectorAll('.note-image')].filter((el) => !el.closest('.shape-layer'));
  for (const el of inline) {
    if (el.dataset.pageGap !== undefined) { el.style.marginTop = ''; delete el.dataset.pageGap; }
  }
  for (const el of inline) {
    let added = 0;
    for (let tries = 0; tries < 3; tries += 1) {
      const b = box(el);
      const to = placeBelow(b.top, b.height, origin, pageHeight);
      if (to === null) break;
      const margin = Number.parseFloat(getComputedStyle(el).marginTop) || 0;
      added += to - b.top;
      el.style.marginTop = `${Math.round(margin + (to - b.top))}px`;
    }
    if (added > 0) { el.dataset.pageGap = String(Math.round(added)); moved += 1; }
  }

  // Shapes and pictures on the canvas, front and back: moved by their top.
  for (const el of editorEl.querySelectorAll('.shape-layer > .shape, .shape-layer > .note-image')) {
    const b = box(el);
    const to = placeBelow(b.top, b.height, origin, pageHeight);
    if (to === null) continue;
    const top = Number.parseFloat(el.style.top) || 0;
    el.style.top = `${Math.round(top + (to - b.top))}px`;
    moved += 1;
  }
  return moved;
}

/**
 * The title's room on the PDF's first page, in CSS pixels: the print
 * document's title (export.js `.print-title`, 22pt, line-height 1.2, 6 mm
 * below it) set at the paper's line width.
 */
export function printTitleRoom(title, columnPx, doc = document) {
  const probe = doc.createElement('div');
  probe.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;'
    + `width:${Math.max(1, columnPx)}px;font-family:var(--serif);font-size:22pt;font-weight:600;line-height:1.2;margin:0;white-space:normal;overflow-wrap:break-word;`;
  probe.textContent = String(title || 'Untitled');
  doc.body.append(probe);
  const h = probe.getBoundingClientRect().height || 35.2;
  probe.remove();
  return Math.round(h + 6 * 96 / 25.4);
}
