/**
 * A click where there is no line to stand on (0.9.4).
 *
 * The owner, on the twentieth test build: "under the videos the cursor
 * disappears, sometimes I cannot click — in general this happens with every
 * new feature we add". A card, a video and a code block take no caret. A click
 * in the gap between two of them, under the last one of a note, or beside one,
 * is a click on the note itself, and Chromium, finding nothing to stand on
 * there, put the caret on some line far away: the first of the note, or one
 * well below — out of sight, and what was typed next went there.
 *
 * It is settled here once, for every block that takes no caret, wherever one
 * stands (the note, a column):
 *   – a line right above or under the place: the caret goes there;
 *   – none (two cards one under the other, a card as the last thing or the
 *     first): a line is made in the gap, with the caret in it. One Ctrl+Z
 *     takes it away.
 * A click beside such a block is a click over it in its upper half and under
 * it in its lower half.
 *
 * Pictures are not touched: a picture in the text is selected by a click
 * beside it, and Enter opens a line under it (rich-paste.js, toolbar.js
 * settleGap). Only a place that has one of these blocks at its side is
 * answered here.
 *
 * Two more places, from the owner's Ideas note ("when I click where I want,
 * the caret should be there, on that line — that is how we keep the caret from
 * getting lost or stuck"):
 *   – beside a divider. A divider takes no caret either. A click on it, or
 *     within a few pixels over or under it, picks it (dividers.js; its own
 *     wider strip takes those clicks). Past that strip the ground is the
 *     flow's: a click there goes to the line under the divider, or to the one
 *     above it; and under a divider that is the last thing of the note or of
 *     a column, where there is no line, one is made, as under a card.
 *   – the empty ground at the foot of a column. A column shorter than its
 *     neighbour has room under its last line; a click there was answered with
 *     a line of some other place — the paragraph under the columns. It goes
 *     to the end of the column's own last line.
 */

/** What takes no caret and has nothing of its own that a click beside it could select. */
export const NO_CARET = '.link-block, .blk-code, .blk-table';
/** A divider: no caret in it; a click ON it picks it (dividers.js), a click in the gap beside it is answered here. */
const DIVIDER = 'hr.blk-hr';
const NOT_FLOW = '.shape-layer, .image-layer, .blk-vr, br';
/** What a caret cannot stand in. */
const NO_LINE = '[contenteditable="false"], hr, .blk-cols, br';
/** What a <br> between two of is a gap, not a line (migrate.js dropGapBreaks). */
const GAP_SIDE = 'hr, .note-image, .blk-code, .link-block, .blk-table';

const isLine = (el) => !!el && !el.matches(NO_LINE);
const takesNone = (el) => !!el && el.matches(NO_CARET);
const isDivider = (el) => !!el && el.matches(DIVIDER);
const isRow = (el) => !!el && el.matches('.blk-cols');

/**
 * What a click on a flow at that height should do.
 * @param {HTMLElement} flow the note, or a column of it — what was clicked
 * @param {number} y in the window
 * @returns {null | {line: Element, atEnd: boolean} | {parent: HTMLElement, before: Element|null}}
 *   null: nothing of ours — the browser places the caret as it always did
 */
export function placeForClick(flow, y) {
  const blocks = [...flow.children].filter((el) => !el.matches(NOT_FLOW));
  const at = blocks.findIndex((el) => el.getBoundingClientRect().bottom > y);
  const above = at < 0 ? blocks.at(-1) : blocks[at - 1];
  const below = at < 0 ? undefined : blocks[at];
  const level = below?.getBoundingClientRect();
  if (level && level.top <= y) {
    // Level with a block, at its side.
    if (!takesNone(below)) return null;
    const next = blocks[at + 1];
    if (y < (level.top + level.bottom) / 2) return isLine(above) ? { line: above, atEnd: true } : { parent: flow, before: below };
    return isLine(next) ? { line: next, atEnd: false } : { parent: flow, before: next ?? null };
  }
  if (!takesNone(above) && !takesNone(below)) {
    // Right under a divider, or right over one: the line on that side of it;
    // under the last divider of the flow, a new one.
    if (isDivider(above)) {
      if (isLine(below)) return { line: below, atEnd: false };
      return below && !isRow(below) ? null : { parent: flow, before: below ?? null };
    }
    if (isDivider(below)) return isLine(above) ? { line: above, atEnd: true } : isRow(above) ? { parent: flow, before: below } : null;
    // Under everything a column holds: its own last line.
    if (!below && isLine(above) && flow.classList?.contains('blk-col')) return { line: above, atEnd: true };
    // Under a picture or a row of columns that ends the flow, on open ground: a
    // line to write on ("there is room and no caret comes", the owner's Ideas note).
    if (!below && above && !isLine(above)) return { parent: flow, before: null };
    return null;
  }
  if (isLine(below)) return { line: below, atEnd: false };
  if (isLine(above)) return { line: above, atEnd: true };
  return { parent: flow, before: below ?? null };
}

/**
 * @param {HTMLElement} editor
 * @param {{history?: {push: () => void}, isLocked?: () => boolean, onGeometry?: () => void}} [opts]
 */
export function initGapCaret(editor, { history, isLocked = () => false, onGeometry } = {}) {
  if (!editor) return;

  function caretIn(el, atEnd) {
    const sel = window.getSelection();
    const r = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    if (atEnd) for (let t = text; t; t = walker.nextNode()) text = t;
    if (text) r.setStart(text, atEnd ? text.nodeValue.length : 0);
    else {
      // No words in it: the innermost thing a caret stands in.
      let inner = el;
      while (inner.firstElementChild && inner.firstElementChild.tagName !== 'BR' && !inner.firstElementChild.matches(NO_LINE)) inner = inner.firstElementChild;
      r.setStart(inner, 0);
    }
    r.collapse(true);
    if (document.activeElement !== editor) editor.focus({ preventScroll: true });
    sel.removeAllRanges();
    sel.addRange(r);
  }

  editor.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey || e.defaultPrevented || isLocked() || editor.dataset.readonly === 'true') return;
    // Only a press on the flow itself: on a block, the block answers.
    const flow = e.target === editor ? editor : (e.target.matches?.('.blk-col, .toggle-body') && editor.contains(e.target) ? e.target : null);
    if (!flow) return;
    // A <br> straight on the flow is a line nobody can stand on: over a divider
    // the press went out of the note and the caret was lost, and what was typed
    // landed loose ("birinci satira yazamiyorum", the owner's Bug Find note, 1.0.3).
    // It becomes the empty line it looks like, before the press is answered.
    // Between two blocks that are no lines (a divider and a picture) it is no
    // line either, only a gap ("there should be nothing there", the owner's Ideas note): it goes,
    // as it goes when a note opens (migrate.js dropGapBreaks).
    const gap = (br) => {
      const side = (n, step) => { while (n && ((n.nodeType === 3 && !n.nodeValue.trim()) || n.nodeName === 'BR')) n = n[step]; return n; };
      const a = side(br.previousSibling, 'previousSibling');
      const b = side(br.nextSibling, 'nextSibling');
      return a?.nodeType === 1 && b?.nodeType === 1 && a.matches(GAP_SIDE) && b.matches(GAP_SIDE);
    };
    let gone = 0;
    for (const br of [...flow.children]) if (br.tagName === 'BR' && gap(br)) { br.remove(); gone++; }
    const bare = [...flow.children].filter((c) => c.tagName === 'BR').map((br) => {
      const line = document.createElement('p');
      br.replaceWith(line);
      line.append(br);
      return line;
    });
    if (bare.length || gone) editor.dispatchEvent(new Event('input', { bubbles: true }));
    if (bare.length) {
      const hit = bare.find((line) => { const b = line.getBoundingClientRect(); return e.clientY >= b.top && e.clientY < b.bottom; });
      if (hit) {
        e.preventDefault();
        caretIn(hit, false);
        return;
      }
    }
    const place = placeForClick(flow, e.clientY);
    if (!place) return;
    e.preventDefault();
    if (place.line) {
      // In that line, as near the click as its words go: at the height of its nearest row.
      const box = place.line.getBoundingClientRect();
      const inset = Math.min(8, box.height / 2);
      const near = document.caretRangeFromPoint?.(e.clientX, place.atEnd ? box.bottom - inset : box.top + inset);
      if (near && place.line.contains(near.startContainer) && !near.startContainer.parentElement?.closest('[contenteditable="false"]')) {
        near.collapse(true);
        if (document.activeElement !== editor) editor.focus({ preventScroll: true });
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(near);
      } else caretIn(place.line, place.atEnd);
      return;
    }
    // The new line waits for the button to come up where it went down: a press
    // pulled from here is the band that picks blocks (block-handle.js), not a line.
    pending = { place, x: e.clientX, y: e.clientY };
  });
  let pending = null;
  window.addEventListener('mouseup', (e) => {
    const p = pending;
    pending = null;
    if (!p || Math.abs(e.clientX - p.x) > 4 || Math.abs(e.clientY - p.y) > 4 || isLocked()) return;
    const { place } = p;
    if (!place.parent.isConnected) return;
    history?.push();
    const line = document.createElement('p');
    line.innerHTML = '<br>';
    place.parent.insertBefore(line, place.before?.parentNode === place.parent ? place.before : null);
    caretIn(line, false);
    onGeometry?.();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  window.addEventListener('blur', () => { pending = null; });
}
