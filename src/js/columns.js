/**
 * A divider that splits the page (0.9.4).
 *
 * The owner's Ideas note: "dividers should be able to split the page … I add a
 * divider and drag it to the right side; it should show how the divider will
 * be dropped, and place it if the user agrees", and, under a snapshot of a
 * video with half the page empty beside it: "I take a divider and split the
 * page down the middle — only that part — so I can write on the right; later I
 * put another divider below and write the old way again under it."
 *
 * So a divider is taken by the mouse:
 *   – pulled up or down, a flat mark lies between two blocks — let go, and the
 *     divider moves there;
 *   – pulled sideways, it stands up: an upright mark where the pointer is, the
 *     part of the note it will split tinted. Let go, and that part is two
 *     columns with the divider between them. Esc gives the drag up.
 *
 * The part that is split: everything between the divider and the next divider
 * above it — or, with the pointer held lower than the divider, below it. Held
 * over a block in that part, the split starts at that block, so less can be
 * taken. What was there goes into the wider column; the other is an empty line
 * to write on.
 *
 *   <div class="blk-cols" data-split="50" style="--split: 50%">
 *     <div class="blk-col">…blocks…</div>
 *     <hr class="blk-vr">
 *     <div class="blk-col">…blocks…</div>
 *   </div>
 *
 * The upright divider is a divider: a click picks it and Backspace or Delete
 * takes it away, which puts the two columns back into one flow, left first;
 * dragged sideways it makes one column wider and the other narrower. It is an
 * <hr>, so a file written for another program has a rule between what was left
 * and what was right.
 *
 * More than two columns: a divider pulled sideways over a column cuts that
 * column in two — as many as the line has room for ("no limit on the columns:
 * whatever the user wants", the owner): a column is only never made narrower
 * than a few words. What the column held keeps the wider part. `data-split` then names every divider's place, left to right, and each
 * column between two dividers its own share:
 *
 *   <div class="blk-cols" data-split="33,67" style="--split: 33%">
 *     <div class="blk-col">…</div><hr class="blk-vr">
 *     <div class="blk-col" style="--w: 34%">…</div><hr class="blk-vr">
 *     <div class="blk-col">…</div>
 *   </div>
 *
 * Taking one of several upright dividers away joins the two columns at its
 * sides; the last one taken away ends the columns.
 *
 * A part of a column (1.0.1): a divider in a column, pulled sideways and up or
 * down over its own column, cuts only its part of it — what lies between it
 * and the next divider, or the part the pointer is over — the way it does on
 * the note; pulled level with itself, it still cuts the whole column
 * (the owner: "I want to split this part with the divider above, into small
 * pieces"). Columns do not nest, so the block is cut across into the rows
 * above that part, the part, and the rows under it; only the part's row gets
 * the new column.
 */

import { showDropMark, hideDropMark } from './drop-mark.js';
import { gapAt, flowAt, contentBox } from './image-place.js';

export const COLS = 'blk-cols';
export const COL = 'blk-col';
export const VR = 'blk-vr';
const HR = 'hr.blk-hr';
const LAYER = '.shape-layer, .image-layer';
/** A column is never narrower than this share of the line. */
export const MIN_SPLIT = 20;
export const MAX_SPLIT = 80;
/**
 * With more than two columns, none is narrower than this share of the line —
 * and so a line never holds more than a hundred over it. That is what a note
 * may hold; on the screen a column is not made narrower than MIN_COL_PX of
 * words either (leastShare), which on most pages is the tighter of the two.
 */
export const MIN_COL = 5;
export const MAX_COLS = Math.floor(100 / MIN_COL);
/** The words' room a column keeps when one is cut or a divider is moved, in the page's pixels. */
export const MIN_COL_PX = 48;
/** What an upright divider takes of the line beside it (editor.css: 14px at each side, and the rule). */
const RULE_PX = 29.4;

/** The least share of a line that wide a column may have. */
export function leastShare(linePx) {
  const px = Number(linePx);
  if (!Number.isFinite(px) || px <= 0) return MIN_COL;
  return Math.max(MIN_COL, Math.ceil(((MIN_COL_PX + RULE_PX) / px) * 100));
}
/** Sideways travel that stands a dragged divider up, in pixels. */
const TURN = 40;

/** A share of the line a divider may stand at: whole percent, in range, the halves and thirds a little sticky. */
export function cleanSplit(pct) {
  let n = Math.round(Number(pct));
  if (!Number.isFinite(n)) return 50;
  for (const snap of [50, 33, 67]) if (Math.abs(n - snap) <= 2) n = snap;
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, n));
}

/** Where a block's upright dividers stand, as shares of the line, left to right. */
export function splitsOf(cols) {
  return String(cols?.dataset?.split ?? '').split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * The places the dividers of `count` columns may stand at: in order, whole
 * percent, every column wide enough. Places that do not fit the columns are
 * spread evenly.
 * @param {number[]} list @param {number} count
 */
export function cleanSplits(list, count) {
  const n = Math.max(2, Math.round(Number(count)) || 2);
  if (n === 2) return [cleanSplit(list?.[0] ?? 50)];
  const got = (list ?? []).map((v) => Math.round(Number(v)));
  if (got.length !== n - 1 || got.some((v) => !Number.isFinite(v))) return Array.from({ length: n - 1 }, (_, i) => Math.round(((i + 1) * 100) / n));
  const out = [];
  got.forEach((v, i) => {
    // Room for the columns still to come at its right, and for the one at its left.
    out.push(Math.min(100 - MIN_COL * (n - 1 - i), Math.max((out[i - 1] ?? 0) + MIN_COL, v)));
  });
  return out;
}

const columnsOf = (cols) => [...cols.querySelectorAll(`:scope > .${COL}`)];
const rulesOf = (cols) => [...cols.querySelectorAll(`:scope > hr.${VR}`)];

/** Blocks a caret cannot stand in: what a flow must not end with. */
const NO_CARET_UNDER = '.note-image, .link-block, .blk-code, .blk-table, hr';

const blankLine = (doc) => {
  const p = doc.createElement('p');
  p.innerHTML = '<br>';
  return p;
};

/** The blocks of a flow that take part in the text. */
const BODY = 'toggle-body';
const blocksOf = (parent) => [...parent.children].filter((el) => !el.matches(LAYER));
const isBound = (el) => el.matches(`${HR}, .${COLS}`);

/**
 * The blocks a divider would split, pulled sideways.
 * @param {HTMLElement} hr a divider standing straight on the note
 * @param {'above'|'below'|'row'} where the pointer is, measured from the divider
 * @param {Element|null} [from] the block the pointer is over: the split starts (above) or ends (below) there
 */
export function sectionOf(hr, where = 'row', from = null) {
  const blocks = blocksOf(hr.parentElement);
  const at = blocks.indexOf(hr);
  if (at < 0) return [];
  let first = at;
  while (first > 0 && !isBound(blocks[first - 1])) first -= 1;
  let last = at;
  while (last < blocks.length - 1 && !isBound(blocks[last + 1])) last += 1;
  let above = blocks.slice(first, at);
  let below = blocks.slice(at + 1, last + 1);
  if (where === 'above' && from && above.includes(from)) above = above.slice(above.indexOf(from));
  if (where === 'below' && from && below.includes(from)) below = below.slice(0, below.indexOf(from) + 1);
  if (where === 'below') return below.length ? below : above;
  return above.length ? above : below;
}

/**
 * The part of the note around a block: everything between the dividers (or
 * columns) above and below it (1.0.0). The divider being dragged is no bound,
 * and not part of what is split.
 *
 * The owner, 1.0.0: text between a divider above and one below; a third
 * divider put in and pulled sideways next to that text split "the text beside
 * the new divider" — the part around the place the divider was put in, not
 * the part it was dropped on. The part under the pointer is the one split now.
 * @param {Element} block a block standing on the note
 * @param {Element|null} [skip] the divider that is dragged
 */
export function sectionAround(block, skip = null) {
  const blocks = blocksOf(block.parentElement).filter((el) => el !== skip);
  const at = blocks.indexOf(block);
  if (at < 0 || isBound(block)) return [];
  let first = at;
  while (first > 0 && !isBound(blocks[first - 1])) first -= 1;
  let last = at;
  while (last < blocks.length - 1 && !isBound(blocks[last + 1])) last += 1;
  return blocks.slice(first, last + 1);
}

/** Whether a line holds nothing: it would only be an empty line at the foot of a column. */
const isBlank = (el) => el.matches('p, div:not([class])') && !el.textContent.replace(/​/g, '').trim()
  && !el.querySelector('img, hr, .inline-eq, .note-image, .link-block, .blk-code');

/**
 * Split: the blocks become one column, an empty line the other, the divider
 * upright between them.
 * @param {Element[]} blocks neighbours in one flow, in order (may be none)
 * @param {HTMLElement} hr the divider that was dragged; it is taken out of the flow
 * @param {number} pct where the divider stands, as a share of the line
 * @param {'left'|'right'|null} [keep] the side the words already stand on (contentSide), which they keep
 * @returns {{cols: HTMLElement, empty: HTMLElement}} the block made, and the column to write in
 */
export function splitAt(blocks, hr, pct, keep = null) {
  const doc = hr.ownerDocument;
  const split = cleanSplit(pct);
  const cols = doc.createElement('div');
  cols.className = COLS;
  cols.dataset.blockType = 'columns';
  const left = doc.createElement('div');
  const right = doc.createElement('div');
  left.className = COL;
  right.className = COL;
  const rule = doc.createElement('hr');
  rule.className = VR;
  cols.append(left, rule, right);
  setSplit(cols, split);

  // The empty lines at the end of what is split stay under the columns, as lines.
  const taken = [...blocks];
  while (taken.length > 1 && isBlank(taken.at(-1))) taken.pop();
  (taken[0] ?? hr).before(cols);
  // What was there stays on the side it stands on; when the divider cuts
  // through it, it keeps the wider side, and even, the left.
  const full = keep === 'left' ? left : keep === 'right' ? right : split >= 50 ? left : right;
  const empty = full === left ? right : left;
  if (taken.length) full.append(...taken); else full.append(blankLine(doc));
  empty.append(blankLine(doc));
  hr.remove();
  // A line to go on with under the columns, when nothing follows them.
  const next = cols.nextElementSibling;
  if (!next || next.matches(LAYER)) cols.after(blankLine(doc));
  return { cols, empty };
}

/** Where the upright dividers stand, as shares of the line; each column between two of them gets its width. */
export function setSplits(cols, list) {
  const columns = columnsOf(cols);
  const splits = cleanSplits(list, columns.length);
  cols.dataset.split = splits.join(',');
  cols.style.setProperty('--split', `${splits[0]}%`);
  columns.forEach((col, i) => {
    if (i > 0 && i < columns.length - 1) { col.style.setProperty('--w', `${splits[i] - splits[i - 1]}%`); return; }
    if (col.style.getPropertyValue('--w')) col.style.removeProperty('--w');
    if (col.hasAttribute('style') && !col.getAttribute('style').trim()) col.removeAttribute('style');
  });
  return splits;
}

/** Where the upright divider of two columns stands, as a share of the line. */
export function setSplit(cols, pct) {
  return setSplits(cols, [pct])[0];
}

/** A place a divider is glad to stand at: the halves, thirds and quarters of the line. */
const sticky = (pct) => {
  const n = Math.round(Number(pct));
  for (const snap of [50, 33, 67, 25, 75]) if (Math.abs(n - snap) <= 2) return snap;
  return n;
};

/**
 * Where a column would be cut in two with the pointer at `pct` of the line,
 * or null when the line holds no more columns or this one is too narrow.
 * @param {number} [least] the least share either part may have (leastShare)
 */
export function splitPoint(col, pct, least = MIN_COL) {
  const cols = col?.parentElement;
  if (!cols?.classList.contains(COLS)) return null;
  const columns = columnsOf(cols);
  const k = columns.indexOf(col);
  if (k < 0 || columns.length >= MAX_COLS) return null;
  const at = [0, ...cleanSplits(splitsOf(cols), columns.length), 100];
  const [from, to] = [at[k], at[k + 1]];
  const min = Math.max(MIN_COL, least);
  if (to - from < 2 * min) return null;
  let p = sticky(pct);
  if (Math.abs(p - (from + to) / 2) <= 2) p = Math.round((from + to) / 2);
  return Math.min(to - min, Math.max(from + min, p));
}

/**
 * One more column: the column is cut in two where the pointer is. What it
 * held keeps the wider part; the other is an empty line to write on.
 * @param {HTMLElement} col @param {number} pct the pointer, as a share of the line
 * @param {HTMLElement|null} [hr] the divider that was dragged there; it is taken out of the flow
 * @param {number} [least] the least share either part may have (leastShare)
 * @param {'left'|'right'|null} [keep] the side the words already stand on (contentSide), which they keep
 * @returns {{cols: HTMLElement, empty: HTMLElement}|null}
 */
export function splitColumn(col, pct, hr = null, least = MIN_COL, keep = null) {
  const p = splitPoint(col, pct, least);
  if (p === null) return null;
  const cols = col.parentElement;
  const doc = col.ownerDocument;
  const columns = columnsOf(cols);
  const k = columns.indexOf(col);
  const splits = cleanSplits(splitsOf(cols), columns.length);
  const [from, to] = [splits[k - 1] ?? 0, splits[k] ?? 100];
  const home = hr?.parentElement;
  hr?.remove();
  if (home?.classList.contains(COL) && !home.firstElementChild) home.append(blankLine(doc));
  const empty = doc.createElement('div');
  empty.className = COL;
  empty.append(blankLine(doc));
  const rule = doc.createElement('hr');
  rule.className = VR;
  const right = keep ? keep === 'left' : p - from >= to - p;
  if (right) col.after(rule, empty); else col.before(empty, rule);
  splits.splice(k, 0, p);
  setSplits(cols, splits);
  return { cols, empty };
}

/**
 * A part of a column cut in two (1.0.1): the columns are cut across, above and
 * under the part, so it has a row of its own, and that row's column is split
 * (splitColumn). The other columns' blocks go to the row they stand beside.
 * @param {HTMLElement} col the column the part is in
 * @param {Element[]} blocks the part: neighbours in `col`, in order
 * @param {number} pct the pointer, as a share of the line
 * @param {HTMLElement|null} [hr] the divider that was dragged; it is taken out of the flow
 * @param {number} [least] @param {'left'|'right'|null} [keep] as for splitColumn
 * @returns {{cols: HTMLElement, empty: HTMLElement}|null}
 */
export function splitPart(col, blocks, pct, hr = null, least = MIN_COL, keep = null) {
  const cols = col?.parentElement;
  if (!cols?.classList.contains(COLS) || !blocks.length || splitPoint(col, pct, least) === null) return null;
  const doc = col.ownerDocument;
  const columns = columnsOf(cols);
  const ci = columns.indexOf(col);
  const rects = blocks.map((el) => el.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  hr?.remove();
  const own = [...col.children];
  const a = own.indexOf(blocks[0]);
  const b = own.indexOf(blocks.at(-1));
  if (a < 0 || b < a) return null;
  // Per row (above, the part, under), per column, the blocks that go there.
  const rows = [0, 1, 2].map(() => columns.map(() => []));
  columns.forEach((c, i) => {
    for (const el of [...c.children]) {
      let k = 1;
      if (c === col) { const j = own.indexOf(el); k = j < a ? 0 : j > b ? 2 : 1; }
      else if (!el.matches(LAYER)) {
        const r = el.getBoundingClientRect();
        const mid = (r.top + r.bottom) / 2;
        k = mid < top ? 0 : mid > bottom ? 2 : 1;
      }
      rows[k][i].push(el);
    }
  });
  // A row of nothing but empty lines is no row: its lines stay with the part.
  for (const k of [0, 2]) {
    if (!rows[k].every((list) => list.every(isBlank))) continue;
    rows[k].forEach((list, i) => { if (k) rows[1][i].push(...list); else rows[1][i].unshift(...list); });
    rows[k] = columns.map(() => []);
  }
  const rules = rulesOf(cols);
  // A row that ends on a divider or a picture keeps a line to write on.
  const fill = (c, list) => {
    c.append(...list);
    if (!c.firstElementChild || c.lastElementChild.matches(NO_CARET_UNDER)) c.append(blankLine(doc));
  };
  // The rows above and under are new blocks; the part's row is the block itself,
  // so its columns keep what they carry (an id, a width).
  const row = (k) => {
    if (rows[k].every((list) => !list.length)) return null;
    const block = cols.cloneNode(false);
    block.removeAttribute('id');
    rows[k].forEach((list, i) => {
      if (i) block.append(rules[i - 1]?.cloneNode(false) ?? Object.assign(doc.createElement('hr'), { className: VR }));
      const c = columns[i].cloneNode(false);
      c.removeAttribute('id');
      fill(c, list);
      block.append(c);
    });
    return block;
  };
  const above = row(0);
  const under = row(2);
  rows[1].forEach((list, i) => { columns[i].replaceChildren(); fill(columns[i], list); });
  if (above) cols.before(above);
  if (under) cols.after(under);
  return splitColumn(columns[ci], pct, null, least, keep);
}

/**
 * A block dropped at the side of another, as in Notion (1.0.0, block-handle.js):
 * the two stand in two columns, half and half, where the other one stood.
 * @param {Element} target a block standing on the note
 * @param {Element} block the block that was dragged there
 * @param {'left'|'right'} side where it goes
 * @returns {HTMLElement} the columns
 */
export function columnsBeside(target, block, side) {
  const doc = target.ownerDocument;
  const cols = doc.createElement('div');
  cols.className = COLS;
  cols.dataset.blockType = 'columns';
  const left = doc.createElement('div');
  const right = doc.createElement('div');
  left.className = COL;
  right.className = COL;
  const rule = doc.createElement('hr');
  rule.className = VR;
  target.before(cols);
  cols.append(left, rule, right);
  if (side === 'left') { left.append(block); right.append(target); } else { left.append(target); right.append(block); }
  setSplit(cols, 50);
  const next = cols.nextElementSibling;
  if (!next || next.matches(LAYER)) cols.after(blankLine(doc));
  return cols;
}

/**
 * A block dropped at the side of a block in a column: a new column beside that
 * one, which gives it half its room. Null when the line holds no more columns
 * or that one is too narrow to share.
 * @param {HTMLElement} col @param {Element} block @param {'left'|'right'} side
 * @param {number} [least] the least share either part may have (leastShare)
 * @returns {{cols: HTMLElement, col: HTMLElement}|null}
 */
export function columnBeside(col, block, side, least = MIN_COL) {
  if (!canShare(col, least)) return null;
  const cols = col.parentElement;
  const columns = columnsOf(cols);
  const k = columns.indexOf(col);
  const splits = cleanSplits(splitsOf(cols), columns.length);
  const [from, to] = [splits[k - 1] ?? 0, splits[k] ?? 100];
  const doc = col.ownerDocument;
  const fresh = doc.createElement('div');
  fresh.className = COL;
  fresh.append(block);
  const rule = doc.createElement('hr');
  rule.className = VR;
  if (side === 'left') col.before(fresh, rule); else col.after(rule, fresh);
  // The new divider's place goes in at its own position among the others.
  splits.splice(k, 0, Math.round((from + to) / 2));
  setSplits(cols, splits);
  return { cols, col: fresh };
}

/** Whether a column has room to give half of to a new one beside it. */
export function canShare(col, least = MIN_COL) {
  const cols = col?.parentElement;
  if (!cols?.classList.contains(COLS)) return false;
  const columns = columnsOf(cols);
  const k = columns.indexOf(col);
  if (k < 0 || columns.length >= MAX_COLS) return false;
  const splits = cleanSplits(splitsOf(cols), columns.length);
  return (splits[k] ?? 100) - (splits[k - 1] ?? 0) >= 2 * Math.max(MIN_COL, least);
}

/**
 * A column whose last block was dragged away goes, as in Notion: its room goes
 * to the column at its left (the first one's to the one at its right), and the
 * last but one column ends the columns.
 * @returns {Element|null} the first block of what is left where the columns stood, when they ended
 */
export function dropColumn(col) {
  const cols = col?.parentElement;
  if (!cols?.classList.contains(COLS)) return null;
  const columns = columnsOf(cols);
  const k = columns.indexOf(col);
  if (k < 0) return null;
  if (columns.length <= 2) {
    col.remove();
    rulesOf(cols).forEach((r) => r.remove());
    return unsplit(cols);
  }
  const splits = cleanSplits(splitsOf(cols), columns.length);
  const rule = k > 0 ? col.previousElementSibling : col.nextElementSibling;
  if (rule?.matches(`hr.${VR}`)) rule.remove();
  col.remove();
  splits.splice(k > 0 ? k - 1 : 0, 1);
  setSplits(cols, splits);
  return null;
}

/** Whether a column holds nothing but one empty line, or nothing at all. */
export const columnIsEmpty = (col) => !col.firstElementChild || onlyBlank(col);

/**
 * An upright divider to a new place: only the two columns at its sides change.
 * @param {number} [least] the least share either of them may have (leastShare)
 */
export function moveRule(vr, pct, least = MIN_COL) {
  const cols = vr.parentElement;
  const columns = columnsOf(cols);
  if (columns.length <= 2) return setSplit(cols, pct);
  const i = rulesOf(cols).indexOf(vr);
  const splits = cleanSplits(splitsOf(cols), columns.length);
  if (i < 0) return null;
  const min = Math.max(MIN_COL, least);
  const [low, high] = [(splits[i - 1] ?? 0) + min, (splits[i + 1] ?? 100) - min];
  // Columns already narrower than that (a narrow window) keep their divider where it is.
  if (low > high) return splits[i];
  splits[i] = Math.min(high, Math.max(low, sticky(pct)));
  return setSplits(cols, splits)[i];
}

const onlyBlank = (col) => col.childNodes.length === 1 && col.firstChild.nodeType === 1 && isBlank(col.firstChild);

/**
 * An upright divider taken away: the columns at its sides become one, left
 * first. The last divider of a block ends its columns.
 * @returns the first block of what was joined
 */
export function removeRule(vr) {
  const cols = vr.parentElement;
  const columns = columnsOf(cols);
  if (columns.length <= 2) return unsplit(cols);
  const left = vr.previousElementSibling;
  const right = vr.nextElementSibling;
  const i = rulesOf(cols).indexOf(vr);
  const splits = cleanSplits(splitsOf(cols), columns.length);
  if (!onlyBlank(right)) {
    if (onlyBlank(left)) left.replaceChildren(...right.childNodes); else left.append(...right.childNodes);
  }
  right.remove();
  vr.remove();
  splits.splice(i, 1);
  setSplits(cols, splits);
  return left.firstElementChild;
}

/** The two columns back into one flow, left first. @returns the first block that came out */
export function unsplit(cols) {
  const doc = cols.ownerDocument;
  const out = [];
  for (const col of cols.querySelectorAll(`:scope > .${COL}`)) {
    const kids = [...col.childNodes];
    // A column nobody wrote in leaves no empty line behind.
    if (kids.length === 1 && kids[0].nodeType === 1 && isBlank(kids[0])) continue;
    out.push(...kids);
  }
  if (!out.length) out.push(blankLine(doc));
  cols.replaceWith(...out);
  return out.find((n) => n.nodeType === 1) ?? null;
}

/**
 * Columns as this version writes them, whatever an edit left: two to four
 * columns with a divider between each two, each with a line to stand on, the
 * dividers in range. A block that lost all but one column is put back into one
 * flow. Idempotent.
 * @returns {number} how many were touched
 */
export function healColumns(root) {
  if (!root) return 0;
  let touched = 0;
  const doc = root.ownerDocument;
  // A column or an upright divider outside its block is no column.
  for (const stray of [...root.querySelectorAll(`.${COL}, hr.${VR}`)]) {
    if (stray.parentElement?.classList.contains(COLS)) continue;
    if (stray.matches('hr')) stray.remove(); else stray.replaceWith(...stray.childNodes);
    touched += 1;
  }
  // An indent is a line's: on a column or a divider it moved the divider over
  // (a Tab on words loose in a column, before 1.0.0).
  for (const el of [...root.querySelectorAll(`.${COLS}[data-ind], .${COL}[data-ind], hr.${VR}[data-ind]`)]) {
    delete el.dataset.ind;
    touched += 1;
  }
  for (const cols of [...root.querySelectorAll(`.${COLS}`)]) {
    const columns = columnsOf(cols);
    // Columns do not nest, and one column is no columns.
    if (columns.length < 2 || cols.parentElement?.closest(`.${COLS}`)) { unsplit(cols); touched += 1; continue; }
    const before = cols.outerHTML;
    // More columns than a line holds: the last one takes what the others held.
    for (const extra of columns.splice(MAX_COLS)) { columns.at(-1).append(...extra.childNodes); extra.remove(); }
    for (const node of [...cols.childNodes]) {
      // Words typed on the block itself, between its columns, go into the left one.
      if (node.nodeType === 3 && node.nodeValue.trim()) { const p = doc.createElement('p'); p.append(node); columns[0].append(p); }
      else if (node.nodeType === 3) node.remove();
      else if (!columns.includes(node) && !node.matches(`hr.${VR}`)) columns[0].append(node);
    }
    // A divider between each two columns, and nowhere else.
    const rules = rulesOf(cols);
    rules.splice(columns.length - 1).forEach((r) => r.remove());
    const wanted = columns.flatMap((col, i) => (i ? [rules[i - 1] ?? Object.assign(doc.createElement('hr'), { className: VR }), col] : [col]));
    if (wanted.length !== cols.childNodes.length || wanted.some((node, i) => cols.childNodes[i] !== node)) cols.replaceChildren(...wanted);
    for (const col of columns) {
      // Loose words in a column become a line; an empty column gets one.
      for (const node of [...col.childNodes]) {
        if (node.nodeType === 3 && node.nodeValue.trim()) { const p = doc.createElement('p'); node.before(p); p.append(node); }
        else if (node.nodeType === 3) node.remove();
        else if (node.tagName === 'BR') node.remove();
      }
      if (!col.firstElementChild) col.append(blankLine(doc));
      // A column ends with a line to write on: under a picture, an embed, a
      // code block or a divider there was nowhere to put the caret ("I cannot
      // write under this", the owner, of a picture alone in its column).
      else if (col.lastElementChild.matches(NO_CARET_UNDER)) col.append(blankLine(doc));
    }
    setSplits(cols, splitsOf(cols));
    cols.dataset.blockType = 'columns';
    if (cols.outerHTML !== before) touched += 1;
  }
  return touched;
}

/**
 * @param {HTMLElement} editorEl
 * @param {{history?: {push: () => void}, isLocked?: () => boolean, onGeometry?: () => void}} [opts]
 */
export function initColumns(editorEl, { history, isLocked = () => false, onGeometry } = {}) {
  if (!editorEl) return null;
  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  function caretIn(el, atEnd = false) {
    if (!el) return;
    const sel = window.getSelection();
    const r = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    if (atEnd) for (let t = text; t; t = walker.nextNode()) text = t;
    if (text) r.setStart(text, atEnd ? text.nodeValue.length : 0);
    else r.setStart(el, 0);
    r.collapse(true);
    if (!editorEl.contains(document.activeElement)) editorEl.focus({ preventScroll: true });
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // ---- a divider taken by the mouse ------------------------------------------
  /** @type {null | {hr: HTMLElement, x: number, y: number, moved: boolean, target: object|null}} */
  let drag = null;

  /** What letting go here would do, and the mark that says so. */
  function over(x, y) {
    const hr = drag.hr;
    const row = hr.getBoundingClientRect();
    // A toggle's body is a flow of its own, like the note (1.0.1: "pictures in
    // toggles cannot be put side by side with dividers", the owner) — but not
    // in a column, where columns would nest.
    const onNote = flat(hr.parentElement);
    const box = contentBox(hr.parentElement);
    // Sideways only when the pull is more across than up or down: a divider
    // carried a long way up or down drifts aside on the way, and turned into
    // a split instead of moving (1.0.0: "I cannot drag the lower of two
    // dividers to places I could", the owner).
    const sideways = Math.abs(x - drag.x) >= TURN && Math.abs(x - drag.x) >= Math.abs(y - drag.y) * 0.75;
    // Pulled sideways over its own column: only its part of it (1.0.1).
    const home = hr.parentElement.classList.contains(COL) ? hr.parentElement : null;
    if (sideways && home && flowAt(editorEl, x, y) === home) {
      const blocks = partIn(hr, home, y, row);
      const cols = home.parentElement;
      const line = contentBox(cols);
      const pct = ((x - line.left) / Math.max(1, line.right - line.left)) * 100;
      const p = blocks ? splitPoint(home, pct, leastOf(cols)) : null;
      if (p !== null) {
        const at = line.left + ((line.right - line.left) * p) / 100;
        const rects = blocks.map((el) => el.getBoundingClientRect());
        const top = Math.min(...rects.map((r) => r.top));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        const part = home.getBoundingClientRect();
        showDropMark({ left: at - 1.5, top, width: 3, height: bottom - top }, { left: part.left, top, width: part.width, height: bottom - top });
        return { kind: 'part', col: home, blocks, pct };
      }
    }
    // Pulled sideways over a column: that column is cut in two where the pointer is.
    const col = sideways ? columnAt(x, y) : null;
    if (col) {
      const cols = col.parentElement;
      const line = contentBox(cols);
      const pct = ((x - line.left) / Math.max(1, line.right - line.left)) * 100;
      const at = line.left + ((line.right - line.left) * splitPoint(col, pct, leastOf(cols))) / 100;
      const whole = cols.getBoundingClientRect();
      const part = col.getBoundingClientRect();
      showDropMark({ left: at - 1.5, top: whole.top, width: 3, height: whole.height }, { left: part.left, top: whole.top, width: part.width, height: whole.height });
      return { kind: 'column', col, pct };
    }
    if (onNote && sideways) {
      // Pulled sideways: it stands up where the pointer is.
      const where = y < row.top - 8 ? 'above' : y > row.bottom + 8 ? 'below' : 'row';
      // Over a part of the note away from the divider's own: that part (1.0.0).
      const under = where === 'row' ? null : partUnder(hr, y, hr.parentElement);
      let from = null;
      if (where !== 'row' && !under) {
        const all = sectionOf(hr, where);
        // The block the pointer is over; past the last of them, all of them.
        from = where === 'above'
          ? all.find((el) => el.getBoundingClientRect().bottom > y) ?? null
          : [...all].reverse().find((el) => el.getBoundingClientRect().top < y) ?? null;
      }
      const blocks = under ?? sectionOf(hr, where, from);
      const pct = cleanSplit(((x - box.left) / Math.max(1, box.right - box.left)) * 100);
      const rects = blocks.map((el) => el.getBoundingClientRect());
      const top = rects.length ? Math.min(row.top, ...rects.map((r) => r.top)) : row.top - 20;
      const bottom = rects.length ? Math.max(row.bottom, ...rects.map((r) => r.bottom)) : row.bottom + 20;
      const at = box.left + ((box.right - box.left) * pct) / 100;
      showDropMark({ left: at - 1.5, top, width: 3, height: bottom - top }, { left: box.left, top, width: box.right - box.left, height: bottom - top });
      return { kind: 'split', blocks, pct };
    }
    // Pulled up or down: to another place between two blocks.
    const body = hr.parentElement.classList.contains(BODY) ? hr.parentElement.getBoundingClientRect() : null;
    const inBody = body && x >= body.left && x <= body.right && y >= body.top - 8 && y <= body.bottom + 8;
    const gap = gapAt(inBody ? hr.parentElement : flowAt(editorEl, x, y), y);
    const mine = gap.units.findIndex((u) => u.els.includes(hr));
    if (mine >= 0 && (gap.slot === mine || gap.slot === mine + 1)) { hideDropMark(); return null; }
    showDropMark(gap.line);
    return { kind: 'move', parent: gap.parent, before: gap.before };
  }

  /**
   * The part of the note under the pointer, when it is not the divider's own
   * part (there the split starts at the block the pointer is over, as before).
   */
  /** A flow a divider stands up in: the note, or a toggle's body that is in no column. */
  function flat(parent) {
    return parent === editorEl || (!!parent?.classList.contains(BODY) && !parent.closest(`.${COL}`));
  }

  function partUnder(hr, y, flow = editorEl) {
    const all = blocksOf(flow);
    const el = all.find((b) => {
      if (b === hr) return false;
      const r = b.getBoundingClientRect();
      return r.height > 0 && y >= r.top - 6 && y <= r.bottom + 6;
    });
    if (!el || isBound(el)) return null;
    const part = sectionAround(el, hr);
    const i = all.indexOf(hr);
    if (part.includes(all[i - 1]) || part.includes(all[i + 1])) return null;
    return part.length ? part : null;
  }

  /**
   * The part of its column a divider pulled sideways would cut, when the
   * pointer is above or under it: as on the note, its own part or the part
   * the pointer is over. Null when it stays level with the divider, or the
   * part is the whole column — then the column is cut, as before.
   */
  function partIn(hr, col, y, row) {
    const where = y < row.top - 8 ? 'above' : y > row.bottom + 8 ? 'below' : 'row';
    if (where === 'row') return null;
    const under = partUnder(hr, y, col);
    let from = null;
    if (!under) {
      const all = sectionOf(hr, where);
      from = where === 'above'
        ? all.find((el) => el.getBoundingClientRect().bottom > y) ?? null
        : [...all].reverse().find((el) => el.getBoundingClientRect().top < y) ?? null;
    }
    const blocks = under ?? sectionOf(hr, where, from);
    const rest = blocksOf(col).filter((el) => el !== hr && !blocks.includes(el) && !isBlank(el));
    return blocks.length && rest.length ? blocks : null;
  }

  /** The column under a point that can be cut in two, if there is one. */
  function columnAt(x, y) {
    const col = flowAt(editorEl, x, y);
    if (col === editorEl) return null;
    const line = contentBox(col.parentElement);
    return splitPoint(col, ((x - line.left) / Math.max(1, line.right - line.left)) * 100, leastOf(col.parentElement)) === null ? null : col;
  }
  /** The least share a column of this block may have, from the width its line is drawn at. */
  function leastOf(cols) {
    const line = contentBox(cols);
    const zoom = cols.getBoundingClientRect().width / Math.max(1, cols.offsetWidth) || 1;
    return leastShare((line.right - line.left) / zoom);
  }

  /**
   * The side of a cut at x the blocks' words and pictures stay on, or null
   * when there are none. A divider dropped right of a calculator put the
   * calculator in the wider part, to the right of the cut, and the note moved
   * sideways (the owner's Ideas note, 1.0.0: "otomatik yana kaydırdı notu").
   * Words that run on across the cut moved too, so they stay left as well:
   * only what stands wholly right of the cut goes right ("divider ekledigimde
   * sol üstteki not saga kayiyor").
   */
  function contentSide(blocks, x) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of blocks) {
      if (!b?.isConnected || b === drag?.hr) continue;
      const boxes = [];
      for (const m of b.querySelectorAll?.('figure, img, video, iframe, table, .blk-code, .blk-cols') ?? []) boxes.push(m.getBoundingClientRect());
      if (b.matches('figure, table, .blk-code, .blk-cols, hr')) boxes.push(b.getBoundingClientRect());
      else {
        const r = document.createRange();
        r.selectNodeContents(b);
        boxes.push(...r.getClientRects());
      }
      for (const box of boxes) {
        if (box.width < 1) continue;
        lo = Math.min(lo, box.left);
        hi = Math.max(hi, box.right);
      }
    }
    if (hi < lo) return null;
    return lo >= x ? 'right' : 'left';
  }
  /** The x on the screen of a share of a block's line. */
  function xOf(pct, box) {
    const line = contentBox(box);
    return line.left + (pct / 100) * (line.right - line.left);
  }

  function finish(apply) {
    const d = drag;
    drag = null;
    hideDropMark();
    document.body.classList.remove('divider-dragging');
    if (!d || !apply || !d.target || !d.hr.isConnected) return;
    history?.push();
    d.hr.classList.remove('armed');
    if (d.target.kind === 'move') {
      if (d.target.before?.isConnected) d.target.before.before(d.hr); else d.target.parent.append(d.hr);
      // A divider at the very end leaves no line to go on with.
      if (!d.hr.nextElementSibling) d.hr.after(blankLine(document));
    } else if (d.target.kind === 'part') {
      const { col, blocks: part } = d.target;
      const cols = col.parentElement;
      const live = part.filter((el) => el.isConnected && el.parentElement === col);
      const p = live.length && cols ? splitPoint(col, d.target.pct, leastOf(cols)) : null;
      const keep = p === null ? null : contentSide(live, xOf(p, cols));
      const made = p === null ? null : splitPart(col, live, d.target.pct, d.hr, leastOf(cols), keep);
      if (made) caretIn(made.empty.firstElementChild);
    } else if (d.target.kind === 'column') {
      const col = d.target.col;
      const cols = col.parentElement;
      const p = col.isConnected ? splitPoint(col, d.target.pct, leastOf(cols)) : null;
      const keep = p === null ? null : contentSide([...col.children], xOf(p, cols));
      const made = col.isConnected ? splitColumn(col, d.target.pct, d.hr, leastOf(cols), keep) : null;
      if (made) caretIn(made.empty.firstElementChild);
    } else {
      const blocks = d.target.blocks.filter((el) => el.isConnected);
      const keep = contentSide(blocks, xOf(cleanSplit(d.target.pct), blocks[0]?.parentElement ?? editorEl));
      const { empty } = splitAt(blocks, d.hr, d.target.pct, keep);
      caretIn(empty.firstElementChild);
    }
    onGeometry?.();
    dirty();
  }

  editorEl.addEventListener('mousedown', (e) => {
    const hr = e.target.closest?.(HR);
    if (!hr || e.button !== 0 || isLocked() || !editorEl.contains(hr)) return;
    // Only where blocks stand in a row of their own: on the note, or in a column.
    if (hr.parentElement !== editorEl && !hr.parentElement?.classList.contains(COL) && !hr.parentElement?.classList.contains(BODY)) return;
    drag = { hr, x: e.clientX, y: e.clientY, moved: false, target: null };
  }, true);

  window.addEventListener('mousemove', (e) => {
    if (rule) { resize(e); return; }
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 5 && Math.abs(e.clientY - drag.y) < 5) return;
    if (!drag.hr.isConnected) { finish(false); return; }
    drag.moved = true;
    document.body.classList.add('divider-dragging');
    drag.target = over(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (rule) { endResize(); return; }
    if (drag) finish(drag.moved);
  });
  window.addEventListener('blur', () => { if (drag) finish(false); if (rule) endResize(); });

  // ---- the upright divider: picked, deleted, moved sideways ----------------
  /** @type {null | {vr: HTMLElement, cols: HTMLElement, x: number, moved: boolean}} */
  let rule = null;
  let picked = null;

  function release() {
    if (picked?.isConnected) picked.classList.remove('armed');
    picked = null;
  }

  function pick(vr) {
    editorEl.querySelectorAll('hr.armed').forEach((h) => h.classList.remove('armed'));
    picked = vr;
    vr.classList.add('armed');
    if (!editorEl.contains(document.activeElement)) editorEl.focus({ preventScroll: true });
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStartBefore(vr);
    r.setEndAfter(vr);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  editorEl.addEventListener('mousedown', (e) => {
    const vr = e.target.closest?.(`hr.${VR}`);
    if (!vr || e.button !== 0 || !editorEl.contains(vr)) { release(); return; }
    e.preventDefault();
    e.stopPropagation();
    if (isLocked()) return;
    pick(vr);
    rule = { vr, cols: vr.parentElement, x: e.clientX, moved: false };
  }, true);

  function resize(e) {
    if (!rule.cols.isConnected) { rule = null; return; }
    if (!rule.moved && Math.abs(e.clientX - rule.x) < 3) return;
    if (!rule.moved) { rule.moved = true; history?.push(); document.body.classList.add('divider-dragging'); }
    const box = contentBox(rule.cols);
    moveRule(rule.vr, ((e.clientX - box.left) / Math.max(1, box.right - box.left)) * 100, leastOf(rule.cols));
    onGeometry?.();
  }
  function endResize() {
    const moved = rule?.moved;
    rule = null;
    document.body.classList.remove('divider-dragging');
    if (moved) dirty();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag?.moved) {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
      return;
    }
    if (!picked) return;
    if (!picked.isConnected || !picked.classList.contains('armed')) { picked = null; return; }
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key) || !editorEl.contains(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'c'].includes(e.key.toLowerCase())) { release(); return; }
    const vr = picked;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isLocked()) return;
      history?.push();
      release();
      caretIn(removeRule(vr));
      onGeometry?.();
      dirty();
      return;
    }
    // Any other key lets go of it and carries on in the column at its right.
    release();
    const line = vr.nextElementSibling?.firstElementChild;
    if (e.key === 'Escape' || e.key.startsWith('Arrow')) e.preventDefault();
    caretIn(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? vr.previousElementSibling?.lastElementChild : line, e.key === 'ArrowLeft' || e.key === 'ArrowUp');
  }, true);

  const TEXT_LINE = 'p, div:not([class]), h1, h2, h3, h4, h5, h6, blockquote, ul, ol, .blk-todo, .blk-toggle';
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    const r = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (picked && (!r || r.collapsed || !r.intersectsNode(picked))) release();
    // A caret on the block or on a column itself stands on no line — a click in
    // the room beside the divider puts one there, and the next word typed
    // would be nobody's. It goes to the line it is nearest.
    if (!r || !r.collapsed || drag || rule) return;
    const host = r.startContainer;
    if (host.nodeType !== 1 || !editorEl.contains(host)) return;
    let col = null;
    let at = r.startOffset;
    if (host.classList.contains(COL)) col = host;
    else if (host.classList.contains(COLS)) {
      const next = host.childNodes[at];
      col = (next?.classList?.contains(COL) ? next : host.childNodes[at - 1]?.classList?.contains(COL) ? host.childNodes[at - 1] : host.querySelector(`.${COL}`));
      at = next === col ? 0 : col?.childNodes.length ?? 0;
    }
    if (!col) return;
    const line = col.childNodes[at]?.nodeType === 1 ? col.childNodes[at] : col.childNodes[at - 1];
    const atEnd = line !== col.childNodes[at];
    if (line?.nodeType === 1 && line.matches(TEXT_LINE)) caretIn(line, atEnd);
  });

  /**
   * The keys that would take a column apart. Backspace at the very start of a
   * column, or Delete at its very end, would join its first or last line to
   * whatever stands outside it, and the column with it; there they do nothing.
   */
  editorEl.addEventListener('keydown', (e) => {
    if ((e.key !== 'Backspace' && e.key !== 'Delete') || e.ctrlKey || e.metaKey || e.altKey || isLocked()) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    const col = (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(`.${COL}`);
    if (!col || !editorEl.contains(col)) return;
    const probe = document.createRange();
    probe.selectNodeContents(col);
    if (e.key === 'Backspace') probe.setEnd(sel.anchorNode, sel.anchorOffset);
    else probe.setStart(sel.anchorNode, sel.anchorOffset);
    const between = probe.cloneContents();
    // Anything between the caret and the column's edge — a word, a picture, another line — and the key is the browser's.
    if (between.textContent.replace(/​/g, '').length || between.querySelector('img, hr, .note-image, .link-block, .blk-code, .inline-eq')) return;
    const line = (node.nodeType === 1 ? node : node.parentElement).closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, div');
    const edge = e.key === 'Backspace' ? col.firstElementChild : col.lastElementChild;
    if (!line || !(edge === line || edge.contains(line))) return;
    // In a list or a toggle the key has work of its own (an item becoming a line).
    if (line.closest('li, .blk-toggle, .blk-todo') && col.contains(line.closest('li, .blk-toggle, .blk-todo'))) return;
    // An empty first line with something under it joins nothing to anything: it simply goes (toolbar.js
    // dropEmptyLine). Held here, it could not be taken from over a table, a video or a picture at the top of
    // a column (the owner, 0.9.4).
    if (e.key === 'Backspace' && line.parentElement === col && line.nextElementSibling
      && line.matches('p, div:not([class]), h1, h2, h3, h4, h5, h6') && !line.textContent.replace(/\u200b/g, '').trim()
      && !line.querySelector('img, hr, .inline-eq, .note-image, .link-block, .blk-code, .note-mention, ul, ol, table')) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  /** After a load, an undo or a paste: columns as they should be. */
  function refresh() {
    const touched = healColumns(editorEl);
    if (picked && !picked.isConnected) picked = null;
    return touched;
  }
  // An edit across both columns can take one of them away; the rest is put right at once.
  // The whole-note query does not run on every keystroke of a large note
  // (perf, 2026-10-23): it trails the typing by a moment, and heals with the
  // selection as it stands then.
  let healTimer = null;
  const healColumnsLater = () => {
    if (healTimer) return;
    healTimer = setTimeout(() => {
      healTimer = null;
      if (!editorEl.querySelector(`.${COLS}, .${COL}, hr.${VR}`)) return;
      const sel = window.getSelection();
      const keep = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      if (healColumns(editorEl) && keep && editorEl.contains(keep.startContainer)) {
        sel.removeAllRanges();
        sel.addRange(keep);
      }
    }, 150);
  };
  editorEl.addEventListener('input', healColumnsLater);

  return { refresh, release, dragging: () => !!drag?.moved };
}
