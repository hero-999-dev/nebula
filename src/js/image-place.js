/**
 * Where a picture in the text stands (0.9.4).
 *
 * A picture in the text used to stand at the left of its own line and nowhere
 * else. The owner's Ideas note: "one mode fixes the picture at the left — make
 * that an alignment setting … so I can put the picture left or right as I
 * like", and, of two pictures one under the other, "I would have liked to put
 * this picture beside the other one".
 *
 *   note-image--center / --right   where it stands on its line (left is no class)
 *   note-image--row                it shares its line with the pictures next to
 *                                  it that carry the class too
 *
 * A picture is still a block of the note, a child of the editor or of a
 * column, so everything that moves, selects or deletes pictures goes on
 * working. The pictures of a row are never wider than the line together
 * (editor.css: each at most its share, by `--row`, the number in the row — or
 * the room the others leave, by `--beside`, where that is more), so a narrow
 * window makes them smaller, not cut off.
 *
 * The drag: a picture in the text is taken by the mouse and
 *   – pulled sideways on its own line, it snaps left, centre or right;
 *   – held over another picture, a mark stands at that picture's side — let
 *     go, and the two share the line;
 *   – held between two blocks, a mark lies there — let go, and it moves.
 */

import { showDropMark, hideDropMark } from './drop-mark.js';

export const ALIGNS = ['left', 'center', 'right'];
const ALIGN_CLASS = { center: 'note-image--center', right: 'note-image--right' };
export const ROW = 'note-image--row';
const IN_TEXT = 'note-image--inline';
const NOT_FLOW = '.shape-layer, .image-layer, .blk-vr';

/** A picture that flows with the words (not one floating on the canvas). */
export const inText = (el) => !!el?.classList?.contains(IN_TEXT) && !el.closest('.shape-layer, .image-layer');

/**
 * A picture standing in a line of words (0.9.4): a character of that line,
 * what a word processor calls "in line with text". It is a <span>, since a
 * <figure> cannot stand in a paragraph — read back from a file it would end
 * the paragraph — and so it has no caption.
 *
 *   <p>words <span class="note-image note-image--inline note-image--inword"
 *                  contenteditable="false" style="width: 80px"><img></span> more words</p>
 */
export const IN_WORD = 'note-image--inword';
export const inWord = (el) => !!el?.classList?.contains(IN_WORD);
/** The lines a picture can stand in. */
const WORD_LINE = 'p, h1, h2, h3, h4, h5, h6, li';
const NO_WORDS = '.note-image, .shape, .blk-code, .link-block, .inline-eq, .image-caption, .shape-layer, .image-layer, [contenteditable="false"]';

/** The same picture as another element: what it is, what it holds. */
function retag(el, tag) {
  const next = el.ownerDocument.createElement(tag);
  for (const attr of el.attributes) next.setAttribute(attr.name, attr.value);
  next.append(...el.childNodes);
  return next;
}

/** A line a picture left: with nothing else on it, it is an empty line again. */
function settleLine(line) {
  if (line?.matches?.(WORD_LINE) && !line.textContent.replace(/​/g, '') && !line.firstElementChild) line.innerHTML = '<br>';
}

/** The block of the flow a node of a line belongs to: its paragraph, or the list its item is in. */
function blockOfLine(el) {
  let block = el;
  while (block.parentElement?.closest('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote')) block = block.parentElement;
  return block;
}

/**
 * Into a line of words. With a caret, there; else at the end of the line right
 * before the picture, else at the start of the one right after it, else on a
 * line of its own, where words can be written at its sides.
 * @param {HTMLElement} figure a picture in the text
 * @param {Range|null} [range] a caret in a line of words
 * @returns {HTMLElement} the picture as it stands now
 */
export function putInLine(figure, range = null) {
  if (!inText(figure)) return figure;
  const doc = figure.ownerDocument;
  let span = figure;
  if (!inWord(figure)) {
    span = retag(figure, 'span');
    span.querySelector(':scope > figcaption')?.remove();
    span.classList.remove(ALIGN_CLASS.center, ALIGN_CLASS.right, ROW);
    span.style.removeProperty('--row');
    span.style.removeProperty('--beside');
    span.classList.add(IN_WORD);
    span.removeAttribute('data-block-type');
  }
  const was = figure.parentElement;
  const isLine = (el) => !!el && el.matches('p, h1, h2, h3, h4, h5, h6');
  if (range) {
    figure.remove();
    range.insertNode(span);
  } else {
    const before = figure.previousElementSibling;
    const after = figure.nextElementSibling;
    if (isLine(before)) {
      // An empty line's <br> is the line; the picture takes its place.
      if (before.lastChild?.nodeName === 'BR') before.lastChild.remove();
      figure.remove();
      before.append(span);
    } else if (isLine(after)) {
      if (after.childNodes.length === 1 && after.firstChild.nodeName === 'BR') after.firstChild.remove();
      figure.remove();
      after.prepend(span);
    } else {
      const line = doc.createElement('p');
      figure.replaceWith(line);
      line.append(span);
    }
  }
  if (was && was !== span.parentElement) { settleLine(was); tidyRows(was); }
  return span;
}

/**
 * Out of its line of words, onto a line of its own right under that line (in
 * its place, when the line held nothing else).
 * @returns {HTMLElement} the picture as it stands now
 */
export function leaveLine(span) {
  if (!inWord(span) || !span.parentElement) return span;
  const figure = retag(span, 'figure');
  figure.classList.remove(IN_WORD);
  figure.dataset.blockType = 'image';
  const home = span.parentElement;
  const block = blockOfLine(span);
  span.remove();
  const alone = block === home && !home.textContent.replace(/​/g, '').trim() && !home.querySelector('img, .inline-eq');
  if (alone) block.replaceWith(figure);
  else { block.after(figure); settleLine(home); }
  return figure;
}

/**
 * The caret a point of the window stands at, when that is in a line of words
 * of the note — where a picture dragged there would stand.
 * @param {HTMLElement} editor @param {number} x @param {number} y
 * @returns {{range: Range, rect: {left: number, top: number, height: number}}|null}
 */
export function caretAt(editor, x, y) {
  const doc = editor.ownerDocument;
  let range = null;
  if (doc.caretRangeFromPoint) range = doc.caretRangeFromPoint(x, y);
  else if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) { range = doc.createRange(); range.setStart(pos.offsetNode, pos.offset); }
  }
  if (!range) return null;
  range.collapse(true);
  const host = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const line = host?.closest(WORD_LINE);
  if (!line || !editor.contains(line) || host.closest(NO_WORDS)) return null;
  let rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  if (!rect || !rect.height) {
    // An empty line has no caret box of its own: the line's, at its left.
    const box = line.getBoundingClientRect();
    rect = { left: box.left, top: box.top, height: box.height };
  }
  return { range, rect: { left: rect.left, top: rect.top, height: rect.height } };
}

export function alignOf(figure) {
  if (figure?.classList.contains(ALIGN_CLASS.right)) return 'right';
  if (figure?.classList.contains(ALIGN_CLASS.center)) return 'center';
  return 'left';
}

const rowMate = (el) => (el && inText(el) && el.classList.contains(ROW) ? el : null);

/** The pictures sharing a line with this one, itself included, in order. */
export function rowOf(figure) {
  if (!rowMate(figure)) return [figure];
  const row = [figure];
  for (let n = rowMate(figure.previousElementSibling); n; n = rowMate(n.previousElementSibling)) row.unshift(n);
  for (let n = rowMate(figure.nextElementSibling); n; n = rowMate(n.nextElementSibling)) row.push(n);
  return row;
}

export const inRow = (figure) => rowOf(figure).length > 1;

/**
 * A row of one is no row: the class goes where no neighbour shares it. And
 * each picture of a row knows how many share its line (`--row`), which is what
 * makes three or four fit as two do — the owner, on the first build: "there is
 * a problem adding a third picture" (it was pushed under the other two).
 *
 * And how much of the line the others take (`--beside`: their widths as given,
 * and their gaps). A share was all a picture could have: beside a narrow one
 * it stopped at half the line with room left at its right — "it does not grow
 * to the right any more" (the owner, 0.9.4). Now it may take what the others
 * leave. Called again while a picture of a row is resized (rich-paste.js).
 */
const ROW_GAP = 12;
const givenWidth = (figure) => parseFloat(figure.style.width) || figure.offsetWidth || 0;
export function tidyRows(root) {
  if (!root) return;
  for (const figure of root.querySelectorAll(`.${ROW}`)) {
    if (!inText(figure) || !(rowMate(figure.previousElementSibling) || rowMate(figure.nextElementSibling))) figure.classList.remove(ROW);
  }
  for (const figure of root.querySelectorAll('.note-image')) {
    const had = figure.style.getPropertyValue('--row');
    const row = figure.classList.contains(ROW) ? rowOf(figure) : [];
    const count = row.length ? String(row.length) : '';
    if (count !== had) {
      if (count) figure.style.setProperty('--row', count); else figure.style.removeProperty('--row');
    }
    const beside = row.length ? `${Math.ceil(row.reduce((sum, other) => sum + (other === figure ? 0 : givenWidth(other) + ROW_GAP), 0))}px` : '';
    if (beside !== figure.style.getPropertyValue('--beside')) {
      if (beside) figure.style.setProperty('--beside', beside); else figure.style.removeProperty('--beside');
    }
  }
}

/** Out of its row, onto a line of its own right under it. */
export function leaveRow(figure) {
  const row = rowOf(figure);
  if (row.length > 1 && row.at(-1) !== figure) row.at(-1).after(figure);
  figure.classList.remove(ROW);
  tidyRows(figure.parentElement);
}

/** Left, centre or right on its line; a picture in a row gets a line of its own first. */
export function setAlign(figure, align) {
  if (!inText(figure) || inWord(figure) || !ALIGNS.includes(align)) return false;
  if (figure.classList.contains(ROW)) leaveRow(figure);
  if (alignOf(figure) === align) return false;
  figure.classList.remove(ALIGN_CLASS.center, ALIGN_CLASS.right);
  if (ALIGN_CLASS[align]) figure.classList.add(ALIGN_CLASS[align]);
  return true;
}

/** Beside another picture in the text, on the side asked for. */
export function putBeside(figure, target, side = 'after') {
  if (!inText(figure) || !inText(target) || inWord(figure) || inWord(target) || figure === target) return false;
  const was = figure.parentElement;
  if (side === 'before') target.before(figure); else target.after(figure);
  for (const el of [figure, target]) {
    el.classList.remove(ALIGN_CLASS.center, ALIGN_CLASS.right);
    el.classList.add(ROW);
  }
  tidyRows(was);
  tidyRows(figure.parentElement);
  return true;
}

/** The picture in the text right before this one, if that is what stands there. */
export const pictureBefore = (figure) => (!inWord(figure) && inText(figure?.previousElementSibling) && !inWord(figure.previousElementSibling) ? figure.previousElementSibling : null);

/**
 * The blocks of a flow in units: a row of pictures is one unit, so nothing is
 * ever dropped into the middle of a row by its gaps.
 */
function unitsOf(parent) {
  const units = [];
  for (const el of parent.children) {
    if (el.matches(NOT_FLOW)) continue;
    const last = units.at(-1);
    if (rowMate(el) && last && rowMate(last.els.at(-1)) && last.els.at(-1).nextElementSibling === el) last.els.push(el);
    else units.push({ els: [el] });
  }
  for (const unit of units) {
    const rects = unit.els.map((el) => el.getBoundingClientRect());
    unit.top = Math.min(...rects.map((r) => r.top));
    unit.bottom = Math.max(...rects.map((r) => r.bottom));
  }
  return units;
}

/** The inside of a flow, in the window. */
export function contentBox(parent) {
  const rect = parent.getBoundingClientRect();
  const css = getComputedStyle(parent);
  const zoom = rect.width / Math.max(1, parent.offsetWidth) || 1;
  const left = rect.left + (parseFloat(css.paddingLeft) + parseFloat(css.borderLeftWidth) || 0) * zoom;
  const right = rect.left + (parent.clientWidth + (parseFloat(css.borderLeftWidth) || 0) - (parseFloat(css.paddingRight) || 0)) * zoom;
  return { left, right: Math.max(left + 1, right), top: rect.top, bottom: rect.bottom };
}

/** The flow under a point: the column there, else the note itself. */
export function flowAt(editor, x, y) {
  for (const col of editor.querySelectorAll('.blk-col')) {
    const r = col.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return col;
  }
  return editor;
}

/**
 * The gap of a flow nearest a height: which unit the dragged thing would stand
 * before (null: at the end), and where the mark lies.
 * @returns {{parent: HTMLElement, before: Element|null, slot: number, units: Array, line: object}}
 */
export function gapAt(parent, y) {
  const units = unitsOf(parent);
  let slot = units.findIndex((u) => y < (u.top + u.bottom) / 2);
  if (slot < 0) slot = units.length;
  return gapOf(parent, units, slot);
}

/** The gap before the unit of that number (after the last, for one past it), and where its mark lies. */
function gapOf(parent, units, slot) {
  const box = contentBox(parent);
  const above = units[slot - 1];
  const below = units[slot];
  let at;
  if (above && below) at = (above.bottom + below.top) / 2;
  else if (below) at = below.top - 4;
  else if (above) at = above.bottom + 4;
  else at = box.top + 8;
  return {
    parent, slot, units, before: below ? below.els[0] : null,
    line: { left: box.left, top: at - 1.5, width: box.right - box.left, height: 3 },
  };
}

/**
 * The gap a block would be dropped into from that height: the nearest one, and
 * never a gap at its own side when it stands alone on its line. Pulled clear of
 * itself it goes one place that way at least. Over a neighbour of one line the
 * nearest gap was still its own, so a picture under a line could not be taken
 * above that line ("I cannot take the picture one back", the owner, of a
 * column holding a line and a picture).
 * @param {HTMLElement} el the block that is dragged
 * @param {HTMLElement} parent the flow under the pointer
 * @returns the gap, or null where letting go would change nothing
 */
export function gapAwayFrom(el, parent, y) {
  const gap = gapAt(parent, y);
  const mine = gap.units.findIndex((u) => u.els.includes(el));
  const alone = mine >= 0 && gap.units[mine].els.length === 1;
  if (gap.parent !== el.parentElement || !alone || (gap.slot !== mine && gap.slot !== mine + 1)) return gap;
  const own = el.getBoundingClientRect();
  const step = y < own.top - 6 && mine > 0 ? mine - 1 : y > own.bottom + 6 && mine + 2 <= gap.units.length ? mine + 2 : -1;
  return step < 0 ? null : gapOf(gap.parent, gap.units, step);
}

/**
 * @param {HTMLElement} editor
 * @returns the drag of a picture in the text: over() while it moves, drop() when let go
 */
export function createPictureDrag(editor) {
  /** Where the picture stood when it was taken, to give it back on Esc. */
  let origin = null;

  function begin(figure) {
    origin = { figure, align: alignOf(figure), rect: figure.getBoundingClientRect() };
  }

  /** What letting go here would do. Alignment is shown by doing it; the rest by the mark. */
  function over(figure, x, y, dx) {
    if (!origin || origin.figure !== figure) begin(figure);
    // A picture standing in a line of words goes to the caret under the pointer.
    if (inWord(figure)) {
      const caret = caretAt(editor, x, y);
      if (!caret) { hideDropMark(); return null; }
      showDropMark({ left: caret.rect.left - 1.5, top: caret.rect.top, width: 3, height: caret.rect.height });
      return { kind: 'word', range: caret.range };
    }
    // Over another picture: beside it.
    for (const other of editor.querySelectorAll(`.${IN_TEXT}`)) {
      if (other === figure || !inText(other) || inWord(other)) continue;
      const r = other.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const side = x < (r.left + r.right) / 2 ? 'before' : 'after';
      const already = side === 'before' ? other.previousElementSibling === figure : other.nextElementSibling === figure;
      if (already && figure.classList.contains(ROW) && other.classList.contains(ROW)) { hideDropMark(); return null; }
      showDropMark({ left: (side === 'before' ? r.left - 7 : r.right + 4), top: r.top, width: 3, height: r.height });
      return { kind: 'beside', target: other, side };
    }
    const own = figure.getBoundingClientRect();
    // On its own line, pulled sideways: left, centre or right, whichever its edge is nearest.
    if (y >= own.top - 6 && y <= own.bottom + 6 && !inRow(figure)) {
      hideDropMark();
      const box = contentBox(figure.parentElement);
      const width = origin.rect.width;
      const places = { left: box.left, center: box.left + (box.right - box.left - width) / 2, right: box.right - width };
      // Measured from the place it had when taken, so a small move changes nothing.
      const wanted = places[origin.align] + dx;
      let best = origin.align;
      for (const name of ALIGNS) if (Math.abs(places[name] - wanted) < Math.abs(places[best] - wanted) - 0.5) best = name;
      setAlign(figure, best);
      return { kind: 'align', align: best, changed: best !== origin.align };
    }
    // Between two blocks: there.
    const gap = gapAwayFrom(figure, flowAt(editor, x, y), y);
    if (!gap) { hideDropMark(); return null; }
    showDropMark(gap.line);
    return { kind: 'gap', parent: gap.parent, before: gap.before, after: gap.units[gap.slot - 1]?.els.at(-1) ?? null };
  }

  /** Does what over() promised. @returns {boolean} whether the note changed */
  function drop(figure, target) {
    hideDropMark();
    origin = null;
    if (!target) return false;
    if (target.kind === 'align') return !!target.changed;
    if (target.kind === 'word') {
      if (!target.range.startContainer.isConnected || figure.contains(target.range.startContainer)) return false;
      putInLine(figure, target.range);
      return true;
    }
    if (target.kind === 'beside') return putBeside(figure, target.target, target.side);
    if (target.kind === 'gap') {
      const was = figure.parentElement;
      figure.classList.remove(ROW);
      // It comes to its own line; before the unit under the mark, else after the one above it.
      if (target.before && target.before !== figure && target.before.isConnected) target.before.before(figure);
      else if (target.after && target.after !== figure && target.after.isConnected) target.after.after(figure);
      else if (!target.before && !target.after) target.parent.append(figure);
      tidyRows(was);
      tidyRows(figure.parentElement);
      return true;
    }
    return false;
  }

  /** Esc: as it was. */
  function cancel(figure) {
    hideDropMark();
    if (origin && origin.figure === figure) setAlign(figure, origin.align);
    origin = null;
  }

  return { begin, over, drop, cancel };
}
