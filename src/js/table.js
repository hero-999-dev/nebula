/**
 * A table in a note (0.9.4).
 *
 * The owner, on the twenty-first test build: "now let there be tables. A
 * simple table; we can make it wider to the right and left; over the boxes a
 * numbering as in Excel, but as x1 and y1 — at the left and on top; with the
 * highlight colours we colour the back of the selected part of a table; the
 * selected part can be merged and unmerged — the merge choice comes up at the
 * lower right; in Excel one pulls from the lower right corner to carry on and
 * copy: here the same, pulled from the lower left; a + along the bottom makes
 * the table longer and one at the right makes it wider; and tables move as
 * pictures do."
 *
 * What a note holds is a plain table (table-grid.js). Each cell is a place of
 * its own to write in, as a picture's caption is: the caret does not walk out
 * of it by itself, and a line of the note is never joined into it.
 *
 * Everything else is the screen's — drawn when a note is shown, never saved
 * (note-markup.js takes out whatever carries the class tbl-ui):
 *   – the numbering: x1, x2… over the columns, y1, y2… beside the rows. A
 *     press on one selects its column or row; the line at the right of an x is
 *     pulled to make that column wider or narrower, and the line under a y to
 *     make that row higher or lower;
 *   – the corner where the two meet: the table is taken by it and moved as a
 *     picture is (block-drag.js); a right-click on it deletes the table;
 *   – a + along the bottom for one more row, and one at the right for one more
 *     column;
 *   – around the selected cells: at the lower left the small square that is
 *     pulled to carry them on over their neighbours, and at the lower right
 *     what can be done with them — Merge, Unmerge, and for whole rows, columns
 *     or the whole table, Delete.
 *
 * A right-click in a cell (context-menu.js asks `menu`) puts a row in above or
 * below it, or a column at its left or right — between two, that is — and
 * takes its row, its column or the table away. On a number it offers that
 * row's or that column's.
 *
 * A table never reaches over the edge of the place it stands on (fitTable): a
 * new one, a column more and a column pulled take the room there is, and where
 * the page gets narrower under a table it is drawn narrower. A new table's
 * size is asked for first (table-size.js).
 *
 * Cells are selected by pulling the mouse from one to another, by Shift and a
 * click, or by the numbering. A highlight colour then colours their backs —
 * and with only a caret in a cell, that cell's (toolbar.js asks hiliteCells).
 *
 * Keys in a cell: Tab and Shift+Tab step to the next and the last cell (Tab in
 * the last one makes a row), the arrows step over the edge of a cell into its
 * neighbour and out of the table, Enter is a new line in the cell. With cells
 * selected, Delete empties them, Ctrl+C and Ctrl+X take them as rows of words
 * any spreadsheet reads, and pasted rows of words go one cell each.
 */

import { t } from './i18n.js';
import {
  UI, MIN_COL, MIN_ROW, MAX_ROW, NEW_ROWS, NEW_COLS, setWidth, heightOf, setHeight, tellHeight, tableHtml, bodyOf, rowsOf, colsOf, widthOf, gridOf, squareUp, rectOf, cellsIn, hasMerged,
  mergeCells, unmergeCells, addRow, addColumn, insertRow, insertColumn, deleteRows, deleteColumns,
  fillTarget, fillCells, toTsv, fromTsv, putRows, setCellText, cellText, isBlank, plainTable, alignOf, setAlign,
} from './table-grid.js';

export const TABLE = '.blk-table';
const tableOf = (wrap) => wrap?.querySelector(':scope > table') ?? null;
/** What a caret cannot stand in, beside a table. */
const NO_LINE = '[contenteditable="false"], hr, .blk-cols, .shape-layer, .image-layer';

/** What each editor's tables have selected: asked by the toolbar's highlight. */
const CONTROLLERS = new WeakMap();

/**
 * The table as the screen shows it: whole (a cell on every place, a width on
 * every column, every cell a place to write in) and with its numbering, its
 * grips and its two + drawn. Whatever was drawn before is drawn again, so a
 * table put back by an undo, pasted or read from a file looks as one just
 * made does.
 * @param {HTMLElement} wrap the .blk-table
 * @returns {boolean} whether there was a table to dress
 */
export function dressTable(wrap) {
  const doc = wrap.ownerDocument;
  // What was drawn before goes first, and with it whatever a copy made by the browser carries: the dress it
  // was copied in, a numbering that is only cells now, a + that is only a button.
  const table = plainTable(wrap);
  if (!table) return false;
  if (wrap.getAttribute('contenteditable') !== 'false') wrap.setAttribute('contenteditable', 'false');
  if (wrap.dataset.blockType !== 'table') wrap.dataset.blockType = 'table';
  const grid = squareUp(table);
  for (const td of grid.where.keys()) {
    if (td.getAttribute('contenteditable') !== 'true') td.setAttribute('contenteditable', 'true');
    if (!td.firstChild) td.appendChild(doc.createElement('br'));
  }

  const make = (tag, cls, data = {}) => {
    const el = doc.createElement(tag);
    el.className = cls;
    for (const [key, value] of Object.entries(data)) el.dataset[key] = String(value);
    return el;
  };
  table.querySelector(':scope > colgroup').prepend(make('col', `${UI} tbl-ycol`));
  const head = make('thead', UI);
  const top = doc.createElement('tr');
  const corner = make('th', 'tbl-corner');
  corner.title = t('Drag to move the table');
  top.appendChild(corner);
  for (let c = 0; c < grid.cols; c += 1) {
    const th = make('th', 'tbl-x', { n: `x${c + 1}`, c });
    th.appendChild(make('span', 'tbl-colgrip'));
    top.appendChild(th);
  }
  head.appendChild(top);
  table.insertBefore(head, bodyOf(table));
  rowsOf(table).forEach((tr, r) => {
    const th = make('th', `${UI} tbl-y`, { n: `y${r + 1}`, r });
    th.appendChild(make('span', 'tbl-rowgrip'));
    tr.prepend(th);
    tellHeight(tr);
  });
  for (const [cls, act, title] of [['tbl-add-col', 'add-col', 'Add a column'], ['tbl-add-row', 'add-row', 'Add a row']]) {
    const button = make('button', `${UI} tbl-add ${cls}`, { tbl: act });
    button.type = 'button';
    button.tabIndex = -1;
    button.title = t(title);
    wrap.appendChild(button);
  }
  fitTable(wrap);
  return true;
}

/** Every table under `root`, dressed. */
export function refreshTables(root) {
  for (const wrap of root.querySelectorAll(TABLE)) dressTable(wrap);
}

/**
 * Whether a table stands as dressTable left it: its numbering over every
 * column and beside every row, and its two +. One that was pasted with the
 * lines around it, or changed behind the app's back, does not.
 */
function isDressed(wrap) {
  const table = tableOf(wrap);
  if (!table) return true;                      // nothing to dress
  if (wrap.children.length < 3 || wrap.querySelectorAll(':scope > .tbl-add').length !== 2) return false;
  if (wrap.hasAttribute('style') || !table.querySelector(':scope > colgroup > col.tbl-ycol')) return false;
  const rows = rowsOf(table);
  if (!rows.length || rows.some((tr) => !tr.firstElementChild?.classList.contains('tbl-y'))) return false;
  return table.querySelectorAll(':scope > thead.tbl-ui th.tbl-x').length === colsOf(table).length;
}

/** The table's block the caret or the selection begins in; null outside one. */
export function tableAt(editor) {
  const node = editor?.ownerDocument.defaultView.getSelection()?.anchorNode;
  const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const wrap = el?.closest?.(TABLE);
  return wrap && editor.contains(wrap) ? wrap : null;
}

/**
 * A new table where the caret is: after its line — in place of it when the
 * line is empty — on the note, in a column or in a toggle's body.
 * @param {HTMLElement} editor
 * @param {{push: () => void}|null} [history]
 * @param {{instead?: Element|null, rows?: number, cols?: number}} [opts] `instead`: the empty line it takes the place of
 * @returns {HTMLElement|null} the table's block
 */
export function insertTable(editor, history = null, { instead = null, rows = NEW_ROWS, cols = NEW_COLS } = {}) {
  if (!editor || editor.dataset.readonly === 'true') return null;
  const doc = editor.ownerDocument;
  history?.push();
  const holder = doc.createElement('div');
  holder.innerHTML = tableHtml(rows, cols);
  const wrap = holder.firstElementChild;
  if (instead?.parentNode && editor.contains(instead)) instead.replaceWith(wrap);
  else {
    const sel = doc.defaultView.getSelection();
    const node = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null;
    let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!el || !editor.contains(el) || el.closest('.shape-layer, .image-layer')) el = null;
    // A table does not stand in a table, a caption or code: it goes under what the caret is in.
    const inside = el?.closest?.(`${TABLE}, .blk-code, .note-image, .link-block`);
    if (inside && editor.contains(inside)) el = inside;
    const flow = el?.closest?.('.toggle-body, .blk-col');
    const host = flow && editor.contains(flow) && flow !== el ? flow : editor;
    let block = !el || el === host ? null : el;
    while (block && block.parentElement !== host) block = block.parentElement;
    if (block) {
      const empty = block.matches('p, div:not([class])') && !block.textContent.replace(/​/g, '').trim()
        && !block.querySelector('img, hr, .inline-eq, .note-image, .link-block, .blk-code, .note-mention');
      if (empty) block.replaceWith(wrap); else block.after(wrap);
    } else host.appendChild(wrap);
  }
  // A line to go on with under it.
  const next = wrap.nextElementSibling;
  if (!next || next.matches(NO_LINE) || next.matches('.note-image, .link-block, .blk-code')) {
    const line = doc.createElement('p');
    line.innerHTML = '<br>';
    wrap.after(line);
  }
  dressTable(wrap);
  settle(wrap);
  const first = wrap.querySelector('td');
  if (first) {
    first.focus({ preventScroll: true });
    const r = doc.createRange();
    r.setStart(first, 0);
    r.collapse(true);
    const sel = doc.defaultView.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return wrap;
}

/**
 * How wide the columns of a table may be, all together, where it stands — on
 * the page, in a column, in a toggle's body — so that the table and the row
 * numbers at its left stay inside it.
 *
 * The + at its right stays inside as well only where something stands beside
 * the place: in a column with another column at its right. Everywhere else it
 * hangs out into the page's margin and takes no room (editor.css), and the
 * table reaches the edge the page's dividers end on. It did not: the + took
 * its room off every table, and the owner, with a table that had taken all the
 * room there was (the "urgent bugs" note, 0.9.4): "let the right side of the
 * table be in line with the black line — widen it".
 * @returns {number|null} null where nothing is laid out (a test without a screen, a closed toggle)
 */
function roomFor(wrap) {
  const host = wrap.parentElement;
  const table = tableOf(wrap);
  if (!host || !table || !host.clientWidth) return null;
  const style = wrap.ownerDocument.defaultView.getComputedStyle(host);
  const inner = host.clientWidth - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0);
  const drawn = colsOf(table).reduce((sum, col) => sum + (Number.parseFloat(col.style.width) || 0), 0);
  // What the block is wider by than its columns: the row numbers, the table's own lines, the + where it has room of its own.
  const room = inner - Math.max(0, wrap.offsetWidth - drawn);
  return room > 0 ? room : null;
}

/**
 * A table never reaches over the edge of the place it stands on. The owner
 * (the "urgent bugs" note, 0.9.4): a table in a column lay over the video in
 * the column beside it once a panel had made the page narrower, and one of
 * thirteen columns made the whole page scroll sideways — "no widening to the
 * side like this".
 *
 * Where its columns are wider, all together, than the room there is, they are
 * drawn narrower, each by the same share. That is the screen's alone: the
 * note keeps each column's own width (`data-w` while it is drawn narrower —
 * note-markup.js writes it back), and with room again the table is as wide as
 * it was made.
 * @param {HTMLElement} wrap the .blk-table
 */
export function fitTable(wrap) {
  const table = tableOf(wrap);
  if (!table) return;
  const cols = colsOf(table);
  const own = cols.map(widthOf);
  const room = roomFor(wrap);
  const total = own.reduce((sum, w) => sum + w, 0);
  const share = room && total > room ? room / total : 1;
  cols.forEach((col, i) => {
    if (share < 1) {
      const drawn = `${Math.max(4, Math.floor(own[i] * share * 100) / 100)}px`;
      if (col.dataset.w !== String(own[i])) col.dataset.w = String(own[i]);
      if (col.style.width !== drawn) col.style.width = drawn;
    } else if (col.hasAttribute('data-w')) setWidth(col, own[i]);
  });
}

/**
 * The columns' own widths made to fit the room there is, for good: after a
 * table is made, a column is added or one is about to be pulled. Each gives
 * of what it has over the narrowest a column may be; where every one is that
 * narrow already, the table is only drawn narrower (fitTable).
 */
function settle(wrap) {
  const table = tableOf(wrap);
  const room = roomFor(wrap);
  if (!table || !room) return;
  const cols = colsOf(table);
  const own = cols.map(widthOf);
  const total = own.reduce((sum, w) => sum + w, 0);
  if (total > room) {
    const loose = own.reduce((sum, w) => sum + Math.max(0, w - MIN_COL), 0);
    const cut = loose ? Math.min(1, (total - room) / loose) : 0;
    const fitted = own.map((w) => Math.max(MIN_COL, Math.floor(w - Math.max(0, w - MIN_COL) * cut)));
    // The pixels the rounding left over go back, one each to the narrowest first: the table ends on the edge
    // of its place, not a few pixels short of it, and its columns stay as even as they were.
    let over = Math.floor(room) - fitted.reduce((sum, w) => sum + w, 0);
    const narrowed = fitted.map((_, i) => i).filter((i) => fitted[i] < own[i]).sort((a, b) => fitted[a] - fitted[b]);
    for (let k = 0; over > 0 && k < narrowed.length; k += 1) { fitted[narrowed[k]] += 1; over -= 1; }
    cols.forEach((col, i) => setWidth(col, fitted[i]));
  }
  fitTable(wrap);
}

/** A width as a ruler reads it: a pixel of the page is 1/96 inch. */
export const millimetres = (px) => `${(Math.round(px * 25.4 / 96 * 10) / 10).toFixed(1)} mm`;

/**
 * The words of a table's cells lined up — left, centre, right or both edges:
 * the selected cells', or the cell's the caret is in.
 * @param {HTMLElement} editor
 * @param {'left'|'center'|'right'|'justify'} value
 * @returns {boolean} whether it was a table's to answer
 */
export function alignCells(editor, value) {
  return CONTROLLERS.get(editor)?.align(value) ?? false;
}

/**
 * A highlight colour on a table's cells: the selected ones — or, with only a
 * caret in a cell, that cell. Picking the colour they all have takes it off.
 * @param {HTMLElement} editor
 * @param {string} cls the colour's class; empty takes any colour off
 * @param {string[]} family every highlight class
 * @returns {boolean} whether it was a table's to answer
 */
export function hiliteCells(editor, cls, family) {
  return CONTROLLERS.get(editor)?.hilite(cls, family) ?? false;
}

/**
 * @param {HTMLElement} editor
 * @param {{history?: {push: () => void}, isLocked?: () => boolean, onGeometry?: () => void}} [opts]
 */
export function initTables(editor, { history, isLocked = () => false, onGeometry } = {}) {
  if (!editor) return null;
  const doc = editor.ownerDocument;
  const win = doc.defaultView;
  const locked = () => isLocked() || editor.dataset.readonly === 'true';
  const dirty = () => editor.dispatchEvent(new Event('input', { bubbles: true }));
  const wrapOf = (el) => { const wrap = el?.closest?.(TABLE); return wrap && editor.contains(wrap) ? wrap : null; };
  const cellOf = (el) => { const td = el?.closest?.('td'); return td && wrapOf(td) ? td : null; };

  /**
   * What is selected: the table, the place the selection began on (where the
   * caret is) and the place it reaches to. `ranged`: cells were selected as
   * cells — by a pull, Shift, or the numbering — not merely stood in.
   * @type {null | {wrap: HTMLElement, a: {r: number, c: number}, f: {r: number, c: number}, ranged: boolean}}
   */
  let sel = null;
  /** A press on a cell that may become a pull over cells. */
  let press = null;
  /** A column's line being pulled — or, with `row`, the line under a row. */
  let resize = null;
  /** The corner square being pulled. */
  let fill = null;

  const posOf = (td) => {
    const w = gridOf(td.closest('table')).where.get(td);
    return w ? { r: w.r, c: w.c } : null;
  };

  /** The selected block and its cells, as the table stands now. */
  function selected() {
    if (!sel?.wrap.isConnected) return null;
    const table = tableOf(sel.wrap);
    if (!table) return null;
    const grid = gridOf(table);
    if (!grid.rows || !grid.cols) return null;
    const rect = rectOf(grid, sel.a, sel.f);
    return { table, grid, rect, cells: cellsIn(grid, rect) };
  }

  function unmark() {
    for (const td of editor.querySelectorAll(`${TABLE} td.sel, ${TABLE} td.act, ${TABLE} td.fill`)) {
      td.classList.remove('sel', 'act', 'fill');
      if (!td.classList.length) td.removeAttribute('class');
    }
  }

  /** The selection as the screen shows it: the cells, the square, the choices. */
  function paint() {
    unmark();
    const now = selected();
    for (const el of editor.querySelectorAll('.tbl-fill, .tbl-chip')) if (!now || el.parentElement !== sel.wrap) el.remove();
    if (!now) { sel = null; return; }
    const { table, grid, rect, cells } = now;
    if (sel.ranged || cells.length > 1) for (const td of cells) td.classList.add('sel');
    grid.matrix[Math.min(sel.a.r, grid.rows - 1)]?.[Math.min(sel.a.c, grid.cols - 1)]?.classList.add('act');

    const first = grid.matrix[rect.r0][rect.c0];
    const last = grid.matrix[rect.r1][rect.c1];
    const left = table.offsetLeft + first.offsetLeft;
    const right = table.offsetLeft + last.offsetLeft + last.offsetWidth;
    const bottom = table.offsetTop + last.offsetTop + last.offsetHeight;

    let square = sel.wrap.querySelector(':scope > .tbl-fill');
    let chip = sel.wrap.querySelector(':scope > .tbl-chip');
    if (locked()) { square?.remove(); chip?.remove(); return; }
    if (!square) {
      square = doc.createElement('div');
      square.className = `${UI} tbl-fill`;
      square.title = t('Drag to fill the cells beside');
      sel.wrap.appendChild(square);
    }
    square.style.left = `${left}px`;
    square.style.top = `${bottom}px`;

    const allRows = rect.r0 === 0 && rect.r1 === grid.rows - 1;
    const allCols = rect.c0 === 0 && rect.c1 === grid.cols - 1;
    const rowCount = rect.r1 - rect.r0 + 1;
    const colCount = rect.c1 - rect.c0 + 1;
    const choices = [
      cells.length > 1 ? ['merge', 'Merge'] : null,
      hasMerged(grid, rect) ? ['unmerge', 'Unmerge'] : null,
      !sel.ranged ? null
        : allRows && allCols ? ['del-table', 'Delete table']
          : allCols ? ['del-rows', rowCount > 1 ? 'Delete rows' : 'Delete row']
            : allRows ? ['del-cols', colCount > 1 ? 'Delete columns' : 'Delete column'] : null,
    ].filter(Boolean);
    if (!choices.length) { chip?.remove(); return; }
    if (!chip) {
      chip = doc.createElement('div');
      chip.className = `${UI} tbl-chip`;
      sel.wrap.appendChild(chip);
    }
    const want = choices.map(([act]) => act).join(' ');
    if (chip.dataset.has !== want) {
      chip.dataset.has = want;
      chip.replaceChildren(...choices.map(([act, label]) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.dataset.tbl = act;
        // Drawn from here by the stylesheet, as the numbering is: Find and the note's text see no words of the app's.
        button.dataset.label = t(label);
        return button;
      }));
    }
    chip.style.left = `${Math.max(right, chip.offsetWidth)}px`;
    // Under the selection; under the + too where the selection reaches the last row.
    chip.style.top = `${bottom + 6 + (rect.r1 === grid.rows - 1 ? 20 : 0)}px`;
  }

  function clear() {
    if (!sel) return;
    sel = null;
    paint();
  }

  /** The caret into a cell, at its start or its end. */
  function caretIn(td, atEnd = false) {
    if (!td) return;
    td.focus({ preventScroll: true });
    const r = doc.createRange();
    r.selectNodeContents(td);
    if (atEnd && td.lastChild?.nodeName === 'BR') r.setEndBefore(td.lastChild);
    r.collapse(!atEnd);
    const s = win.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    td.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /** The cell the selection began on. */
  function anchorCell() {
    const now = selected();
    return now ? now.grid.matrix[Math.min(sel.a.r, now.grid.rows - 1)]?.[Math.min(sel.a.c, now.grid.cols - 1)] ?? null : null;
  }

  function select(wrap, a, f, ranged) {
    sel = { wrap, a, f, ranged };
    paint();
  }

  /** The words out of sight while cells are selected as cells: the caret waits in the first one. */
  function parkCaret() {
    const td = anchorCell();
    if (!td) return;
    const s = win.getSelection();
    if (doc.activeElement === td && s.rangeCount && s.isCollapsed && td.contains(s.anchorNode)) return;
    caretIn(td, true);
  }

  /** A column or a row, by its number; with Shift, from the place the selection began to it. */
  function selectLine(wrap, head, extend) {
    const grid = gridOf(tableOf(wrap));
    const column = head.classList.contains('tbl-x');
    const n = Number(column ? head.dataset.c : head.dataset.r) || 0;
    const from = extend && sel?.wrap === wrap ? sel.a : null;
    const a = column ? { r: 0, c: from ? from.c : n } : { r: from ? from.r : n, c: 0 };
    const f = column ? { r: grid.rows - 1, c: n } : { r: n, c: grid.cols - 1 };
    select(wrap, a, f, true);
    parkCaret();
  }

  function selectAll(wrap) {
    const grid = gridOf(tableOf(wrap));
    select(wrap, { r: 0, c: 0 }, { r: grid.rows - 1, c: grid.cols - 1 }, true);
    parkCaret();
  }

  /** The cell of that table under a point — the nearest one where the point is beside the table. */
  function cellAt(wrap, x, y) {
    const body = bodyOf(tableOf(wrap)).getBoundingClientRect();
    const first = wrap.querySelector('td')?.getBoundingClientRect();
    if (!first) return null;
    const cx = Math.max(first.left + 2, Math.min(body.right - 3, x));
    const cy = Math.max(body.top + 2, Math.min(body.bottom - 3, y));
    const td = cellOf(doc.elementFromPoint(cx, cy));
    return td && td.closest(TABLE) === wrap ? td : null;
  }

  /** The table taken out of the note, the caret on a line where it stood. */
  function removeTable(wrap) {
    const next = wrap.nextElementSibling;
    const prev = wrap.previousElementSibling;
    let line = next && !next.matches(NO_LINE) ? next : null;
    const atEnd = !line && prev && !prev.matches(NO_LINE);
    if (atEnd) line = prev;
    if (!line) {
      line = doc.createElement('p');
      line.innerHTML = '<br>';
      wrap.after(line);
    }
    wrap.remove();
    sel = null;
    editor.focus({ preventScroll: true });
    const r = doc.createRange();
    r.selectNodeContents(line);
    if (atEnd && line.lastChild?.nodeName === 'BR') r.setEndBefore(line.lastChild);
    r.collapse(!atEnd);
    const s = win.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  /**
   * One of the table's own choices: the + at its edges, what stands at the
   * selection's corner, and what a right-click offers.
   * @param {string} act
   * @param {HTMLElement} wrap
   * @param {{at?: number, to?: number|null, keep?: number}} [where] from a right-click: for a row or column put
   *   in, the one it goes before (`at`) and the column or row the caret stays on (`keep`); for rows or columns
   *   taken away, the first and the last (`at`, `to`) — without `to`, the selected ones
   */
  function run(act, wrap, { at = 0, to = null, keep = 0 } = {}) {
    if (locked()) return;
    const table = tableOf(wrap);
    if (!table) return;
    const now = sel?.wrap === wrap ? selected() : null;
    if (!now && !/^(add|ins)-|^del-table$/.test(act) && to === null) return;
    history?.push();
    let caret = null;
    /** The column that was put in, to be given its width. */
    let added = -1;
    if (act === 'add-row') addRow(table);
    else if (act === 'add-col') { addColumn(table); added = gridOf(table).cols - 1; }
    else if (act === 'ins-row' || act === 'ins-col') {
      // The new row or column is the one stood in: the caret goes into its cell beside the one that was
      // clicked — or, where a merged cell reaches over that place, into its first cell of its own.
      const rows = act === 'ins-row';
      const n = rows ? insertRow(table, at) : insertColumn(table, at);
      if (!rows) added = n;
      const grid = gridOf(table);
      const line = rows ? grid.matrix[n] : grid.matrix.map((row) => row[n]);
      const own = (k) => { const w = grid.where.get(line[k]); return !!w && w.r === (rows ? n : k) && w.c === (rows ? k : n); };
      const k = own(keep) ? keep : Math.max(0, line.findIndex((_, i) => own(i)));
      const pos = rows ? { r: n, c: k } : { r: k, c: n };
      sel = { wrap, a: pos, f: pos, ranged: false };
    }
    else if (act === 'merge') {
      caret = mergeCells(table, now.rect);
      if (caret) sel = { wrap, a: { r: now.rect.r0, c: now.rect.c0 }, f: { r: now.rect.r0, c: now.rect.c0 }, ranged: false };
    } else if (act === 'unmerge') {
      unmergeCells(table, now.rect);
      sel = { wrap, a: { r: now.rect.r0, c: now.rect.c0 }, f: { r: now.rect.r1, c: now.rect.c1 }, ranged: true };
    } else if (act === 'del-rows') {
      const [r0, r1] = to === null ? [now.rect.r0, now.rect.r1] : [at, to];
      const left = deleteRows(table, r0, r1);
      const r = Math.min(r0, left - 1);
      sel = left ? { wrap, a: { r, c: 0 }, f: { r, c: 0 }, ranged: false } : null;
      if (!left) act = 'del-table';
    } else if (act === 'del-cols') {
      const [c0, c1] = to === null ? [now.rect.c0, now.rect.c1] : [at, to];
      const left = deleteColumns(table, c0, c1);
      const c = Math.min(c0, left - 1);
      sel = left ? { wrap, a: { r: 0, c }, f: { r: 0, c }, ranged: false } : null;
      if (!left) act = 'del-table';
    }
    if (act === 'del-table') removeTable(wrap);
    else {
      dressTable(wrap);
      if (added >= 0) {
        // One column more where there is no room for a new column's width: it is as wide as the others are
        // on average, and then all make room alike — or the first columns would be the ones squeezed, add
        // after add.
        const cols = colsOf(table);
        const room = roomFor(wrap);
        const total = cols.reduce((sum, col) => sum + widthOf(col), 0);
        if (room && total > room && cols.length > 1 && cols[added]) {
          const others = (total - widthOf(cols[added])) / (cols.length - 1);
          setWidth(cols[added], Math.max(MIN_COL, Math.min(widthOf(cols[added]), Math.round(others))));
        }
        settle(wrap);
      }
      paint();
      if (sel?.wrap === wrap) caretIn(caret ?? anchorCell(), true);
    }
    onGeometry?.();
    dirty();
  }

  /* ---------------------------------------------------------------- mouse */

  editor.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
      // A right-click in cells that are selected leaves them selected — what it offers is for all of them.
      // The press alone would put the caret into the cell under it, and one cell would be left.
      const td = cellOf(e.target);
      const now = td && sel?.ranged && sel.wrap === td.closest(TABLE) ? selected() : null;
      const w = now?.grid.where.get(td);
      if (w && w.r >= now.rect.r0 && w.r <= now.rect.r1 && w.c >= now.rect.c0 && w.c <= now.rect.c1) e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const wrap = wrapOf(e.target);
    if (!wrap) { clear(); return; }
    if (e.target.closest('.tbl-chip, .tbl-add')) {
      // The click does the work; the press takes neither the caret nor the table.
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target.closest('.tbl-colgrip')) {
      e.preventDefault();
      e.stopPropagation();
      const table = tableOf(wrap);
      const head = e.target.closest('th');
      const col = colsOf(table)[Number(head?.dataset.c)];
      if (!col || locked()) return;
      const zoom = table.getBoundingClientRect().width / Math.max(1, table.offsetWidth) || 1;
      resize = { wrap, head, col, x: e.clientX, zoom, moved: false };
      doc.body.classList.add('tbl-resizing');
      showWidth();
      return;
    }
    if (e.target.closest('.tbl-rowgrip')) {
      e.preventDefault();
      e.stopPropagation();
      const table = tableOf(wrap);
      const head = e.target.closest('th');
      const row = rowsOf(table)[Number(head?.dataset.r)];
      if (!row || locked()) return;
      const zoom = table.getBoundingClientRect().width / Math.max(1, table.offsetWidth) || 1;
      resize = { wrap, head, row, y: e.clientY, zoom, moved: false };
      doc.body.classList.add('tbl-resizing', 'tbl-resizing-row');
      showWidth();
      return;
    }
    if (e.target.closest('.tbl-fill')) {
      e.preventDefault();
      e.stopPropagation();
      const now = sel?.wrap === wrap ? selected() : null;
      if (!now || locked()) return;
      fill = { wrap, src: now.rect, dst: null };
      doc.body.classList.add('tbl-filling');
      return;
    }
    const head = e.target.closest('th.tbl-x, th.tbl-y');
    if (head) {
      e.preventDefault();
      e.stopPropagation();
      selectLine(wrap, head, e.shiftKey);
      return;
    }
    if (e.target.closest('.tbl-corner')) return;          // taken to be moved (block-drag.js), and nothing else
    const td = cellOf(e.target);
    if (!td) { e.preventDefault(); return; }              // a line between cells: nothing to stand in
    const pos = posOf(td);
    if (!pos) return;
    if (e.shiftKey && sel?.wrap === wrap) {
      e.preventDefault();
      select(wrap, sel.a, pos, true);
      parkCaret();
      press = { wrap, td: null };
      return;
    }
    select(wrap, pos, pos, false);
    press = { wrap, td };
  }, true);

  /**
   * The width of the column being pulled, over its number — or the height of
   * the row being pulled, beside its number: in millimetres, as it is drawn
   * (and printed).
   */
  function showWidth() {
    if (!resize) return;
    let tip = resize.wrap.querySelector(':scope > .tbl-tip');
    if (!tip) {
      tip = doc.createElement('div');
      tip.className = `${UI} tbl-tip${resize.row ? ' tbl-tip-row' : ''}`;
      resize.wrap.appendChild(tip);
    }
    if (resize.row) {
      // What is drawn: a row is as high as its words where they need more than it was given.
      const box = resize.wrap.getBoundingClientRect();
      const row = resize.row.getBoundingClientRect();
      const head = resize.head.getBoundingClientRect();
      tip.dataset.label = millimetres(row.height / resize.zoom || heightOf(resize.row));
      tip.style.left = `${(head.right - box.left) / resize.zoom}px`;
      tip.style.top = `${(row.bottom - box.top) / resize.zoom}px`;
      return;
    }
    const table = tableOf(resize.wrap);
    // Drawn from here by the stylesheet, as the numbering is.
    tip.dataset.label = millimetres(Number.parseFloat(resize.col.style.width) || widthOf(resize.col));
    tip.style.left = `${table.offsetLeft + resize.head.offsetLeft + resize.head.offsetWidth}px`;
    tip.style.top = `${table.offsetTop}px`;
  }

  function endPulls({ apply = true } = {}) {
    if (resize) {
      const moved = resize.moved;
      resize.wrap.querySelector(':scope > .tbl-tip')?.remove();
      resize = null;
      doc.body.classList.remove('tbl-resizing', 'tbl-resizing-row');
      if (moved) { onGeometry?.(); dirty(); }
    }
    if (fill) {
      const { wrap, src, dst } = fill;
      fill = null;
      doc.body.classList.remove('tbl-filling');
      unmark();
      const table = tableOf(wrap);
      if (apply && dst && table && wrap.isConnected && !locked()) {
        history?.push();
        if (fillCells(table, src, dst)) dirty();
        sel = { wrap, a: { r: dst.r0, c: dst.c0 }, f: { r: dst.r1, c: dst.c1 }, ranged: true };
      }
      paint();
      if (sel) parkCaret();
    }
    if (press) {
      press = null;
      doc.body.classList.remove('tbl-ranging');
    }
  }

  win.addEventListener('mousemove', (e) => {
    if (!resize && !fill && !press) return;
    // The button was let go where the window could not see it.
    if (!(e.buttons & 1)) { endPulls({ apply: false }); return; }
    if (resize) {
      if (!resize.wrap.isConnected) { endPulls({ apply: false }); return; }
      if (resize.row) {
        if (!resize.moved) {
          if (e.clientY === resize.y) return;
          history?.push();
          resize.moved = true;
          // How high the row is drawn now, and the lowest it can be drawn: as low as a column may be
          // narrow where its words leave it that — a row of one line gives up the room over and under
          // it — and otherwise as high as its words need. It is given the height it is drawn at, so the
          // lowest is asked for twice: what the row is with the least, and what it is when given that.
          const own = heightOf(resize.row);
          resize.from = resize.row.offsetHeight || own;
          setHeight(resize.row, MIN_ROW);
          tellHeight(resize.row);
          setHeight(resize.row, resize.row.offsetHeight);
          tellHeight(resize.row);
          resize.least = Math.max(MIN_ROW, resize.row.offsetHeight);
          setHeight(resize.row, own);
          tellHeight(resize.row);
        }
        const want = Math.round(resize.from + (e.clientY - resize.y) / resize.zoom);
        const h = Math.max(resize.least, Math.min(MAX_ROW, want));
        if (h !== heightOf(resize.row)) {
          setHeight(resize.row, h);
          tellHeight(resize.row);
          paint();
        }
        showWidth();
        return;
      }
      if (!resize.moved) {
        if (e.clientX === resize.x) return;
        history?.push();
        resize.moved = true;
        // What is drawn is what is pulled: a table drawn narrower than it is takes those widths for its own.
        settle(resize.wrap);
        const cols = colsOf(tableOf(resize.wrap));
        resize.from = widthOf(resize.col);
        resize.share = (Number.parseFloat(resize.col.style.width) || resize.from) / resize.from || 1;
        // No wider than the room that is left: the table does not push the page out to the side.
        const room = roomFor(resize.wrap);
        const total = cols.reduce((sum, col) => sum + widthOf(col), 0);
        resize.most = room && total <= room ? resize.from + (room - total) : Infinity;
      }
      const want = Math.round(resize.from + (e.clientX - resize.x) / resize.zoom / resize.share);
      const w = Math.max(MIN_COL, Math.min(Math.floor(resize.most), want));
      if (w !== widthOf(resize.col)) {
        setWidth(resize.col, w);
        fitTable(resize.wrap);
        paint();
      }
      showWidth();
      return;
    }
    if (fill) {
      const td = cellAt(fill.wrap, e.clientX, e.clientY);
      const at = td && posOf(td);
      const table = tableOf(fill.wrap);
      if (!at || !table) return;
      const grid = gridOf(table);
      const target = fillTarget(fill.src, at);
      fill.dst = target;
      for (const cell of fill.wrap.querySelectorAll('td.fill')) cell.classList.remove('fill');
      if (target) {
        const inSrc = new Set(cellsIn(grid, fill.src));
        for (const cell of cellsIn(grid, target)) if (!inSrc.has(cell)) cell.classList.add('fill');
      }
      return;
    }
    if (!press.wrap.isConnected || sel?.wrap !== press.wrap) { endPulls(); return; }
    const td = cellAt(press.wrap, e.clientX, e.clientY);
    if (!td || td === press.td) return;
    const at = posOf(td);
    if (!at) return;
    // Out of the cell it began in: it is cells that are being selected now, not words.
    press.td = null;
    doc.body.classList.add('tbl-ranging');
    if (sel.f.r === at.r && sel.f.c === at.c && sel.ranged) return;
    select(press.wrap, sel.a, at, true);
    parkCaret();
  });
  win.addEventListener('mouseup', () => endPulls());
  win.addEventListener('blur', () => endPulls({ apply: false }));

  editor.addEventListener('click', (e) => {
    const wrap = wrapOf(e.target);
    if (!wrap) return;
    const act = e.target.closest('[data-tbl]')?.dataset.tbl;
    if (act) {
      e.preventDefault();
      e.stopPropagation();
      run(act, wrap);
    }
    // A click on the corner does nothing: it selected the whole table and offered Merge and Delete, which
    // nobody had asked for by picking the table up (the owner, 0.9.4). Ctrl+A twice selects every cell.
  }, true);

  // Words are not pulled out of a cell or dropped into one: a cell holds what is typed and pasted.
  editor.addEventListener('dragstart', (e) => { if (wrapOf(e.target)) e.preventDefault(); }, true);
  editor.addEventListener('drop', (e) => { if (wrapOf(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);

  // The caret gone into another cell by a key, an undo or a script: that cell is the one stood in.
  editor.addEventListener('focusin', (e) => {
    const td = cellOf(e.target);
    if (!td || press || fill) return;
    const wrap = td.closest(TABLE);
    // The cell the selection began on is where the caret waits while cells are selected; in any other,
    // the caret has gone on — by Tab, by an undo — and nothing stays selected behind it.
    if (sel?.wrap === wrap && anchorCell() === td) return;
    const pos = posOf(td);
    if (pos) select(wrap, pos, pos, false);
  });
  // The caret gone out of the table: nothing of it is selected.
  doc.addEventListener('selectionchange', () => {
    if (!sel || press || fill) return;
    const s = win.getSelection();
    const node = s?.rangeCount ? s.anchorNode : null;
    if (!node || !editor.contains(node)) return;           // in a toolbar's field: the cells stay selected
    if (!sel.wrap.contains(node)) clear();
  });

  /* ----------------------------------------------------------------- keys */

  /** Whether the caret stands at the cell's very start or end. */
  function atEdge(td, start) {
    const s = win.getSelection();
    if (!s?.rangeCount || !s.isCollapsed || !td.contains(s.anchorNode)) return false;
    const range = s.getRangeAt(0);
    const side = doc.createRange();
    side.selectNodeContents(td);
    if (start) side.setEnd(range.startContainer, range.startOffset);
    else side.setStart(range.endContainer, range.endOffset);
    const part = side.cloneContents();
    if (part.textContent.replace(/​/g, '').length || part.querySelector('img, .inline-eq, .note-mention')) return false;
    // A break before the caret is a line above it; one after it only holds the last line open.
    return part.querySelectorAll('br').length <= (start ? 0 : 1);
  }

  /** Whether everything written in the cell is selected. */
  function wordsAllSelected(td) {
    const s = win.getSelection();
    if (!s?.rangeCount || s.isCollapsed || !td.contains(s.anchorNode) || !td.contains(s.focusNode)) return false;
    const range = s.getRangeAt(0);
    const bare = (r) => { const part = r.cloneContents(); return !part.textContent.replace(/\u200b/g, '').length && !part.querySelector('img, .inline-eq, .note-mention'); };
    const before = doc.createRange();
    before.selectNodeContents(td);
    before.setEnd(range.startContainer, range.startOffset);
    const after = doc.createRange();
    after.selectNodeContents(td);
    after.setStart(range.endContainer, range.endOffset);
    return bare(before) && bare(after);
  }

  /**
   * Where the caret is drawn. A collapsed range at the very start of a text
   * (or between elements) has no box in Chromium, and then the arrows were
   * left to Chromium, which walked into the cell beside instead of the one
   * under (1.0.0: "up, down, left and right in a table go mad", the owner).
   * The character beside it says which line it stands on.
   */
  function caretRect(range) {
    const own = range.getClientRects()[0];
    if (own && own.height) return own;
    let node = range.startContainer;
    let at = range.startOffset;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const next = node.childNodes[at] ?? null;
      const prev = node.childNodes[at - 1] ?? null;
      if (next?.nodeType === Node.TEXT_NODE && next.length) { node = next; at = 0; } else if (prev?.nodeType === Node.TEXT_NODE && prev.length) { node = prev; at = prev.length; } else return null;
    }
    if (node.nodeType !== Node.TEXT_NODE || !node.length) return null;
    const probe = doc.createRange();
    if (at < node.length) { probe.setStart(node, at); probe.setEnd(node, at + 1); } else { probe.setStart(node, at - 1); probe.setEnd(node, at); }
    const rects = probe.getClientRects();
    const box = (at < node.length ? rects[0] : rects[rects.length - 1]) ?? null;
    if (!box || !box.height) return null;
    // The caret stands at the side of that character it touches.
    const x = at < node.length ? box.left : box.right;
    return { top: box.top, bottom: box.bottom, height: box.height, left: x, right: x };
  }

  /** Whether the caret stands on the cell's first line (or its last). */
  function onEdgeLine(td, first) {
    const s = win.getSelection();
    if (!s?.rangeCount || !td.contains(s.anchorNode)) return false;
    if (atEdge(td, first)) return true;
    const rect = caretRect(s.getRangeAt(0));
    if (!rect || !rect.height) return isBlank(td) || lineTops(td).length <= 1;
    // Against the cell's own lines, not its box: a row is as tall as its
    // tallest cell, and a short cell beside a long one had empty room under its
    // one line, so Down never left it and Chromium walked to the cell beside.
    const tops = lineTops(td);
    if (!tops.length) return true;
    const mid = rect.top + rect.height / 2;
    const edge = first ? tops[0] : tops[tops.length - 1];
    return first ? mid < edge.bottom : mid > edge.top;
  }

  /** The cell's lines from top to bottom, as { top, bottom }. */
  function lineTops(td) {
    const r = doc.createRange();
    r.selectNodeContents(td);
    const lines = [];
    for (const b of r.getClientRects()) {
      if (!b.height) continue;
      const same = lines.find((l) => Math.abs(l.top - b.top) < 2);
      if (same) same.bottom = Math.max(same.bottom, b.bottom);
      else lines.push({ top: b.top, bottom: b.bottom });
    }
    return lines.sort((x, y) => x.top - y.top);
  }

  /**
   * Into the cell over or under by an arrow, at the same place across as the
   * caret was — on its last line going up, its first going down — as a line of
   * words does; at its end or start where nothing stands there.
   */
  function caretAcross(to, x, up) {
    if (x === null || !doc.caretRangeFromPoint) { caretIn(to, up); return; }
    to.focus({ preventScroll: true });
    to.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const box = to.getBoundingClientRect();
    const style = win.getComputedStyle(to);
    const padL = Number.parseFloat(style.paddingLeft) || 0;
    const padR = Number.parseFloat(style.paddingRight) || 0;
    const all = doc.createRange();
    all.selectNodeContents(to);
    const lines = [...all.getClientRects()].filter((b) => b.height);
    const line = up ? lines[lines.length - 1] : lines[0];
    if (!line) { caretIn(to, up); return; }
    const px = Math.max(box.left + padL + 1, Math.min(x, box.right - padR - 1));
    const at = doc.caretRangeFromPoint(px, line.top + line.height / 2);
    if (!at || !to.contains(at.startContainer)) { caretIn(to, up); return; }
    at.collapse(true);
    const s = win.getSelection();
    s.removeAllRanges();
    s.addRange(at);
  }

  /**
   * Out of the table by an arrow: to the line over or under it. Where there is
   * none — the table is the first or the last thing, or stands against a
   * picture or a code block — one is made: a table at the very top of a note
   * had no way to get a line written over it.
   */
  function leave(wrap, up) {
    let line = up ? wrap.previousElementSibling : wrap.nextElementSibling;
    if (line?.matches('.shape-layer, .image-layer')) line = null;
    if (!line || line.matches(NO_LINE)) {
      if (locked()) return false;
      history?.push();
      line = doc.createElement('p');
      line.innerHTML = '<br>';
      if (up) wrap.before(line); else wrap.after(line);
      dirty();
    }
    clear();
    editor.focus({ preventScroll: true });
    const walker = doc.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    if (up) for (let n = text; n; n = walker.nextNode()) text = n;
    const r = doc.createRange();
    if (text) r.setStart(text, up ? text.nodeValue.length : 0);
    else r.setStart(line, 0);
    r.collapse(true);
    const s = win.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    return true;
  }

  /** A new line in the cell. */
  function lineBreak(td) {
    const s = win.getSelection();
    if (!s?.rangeCount || !td.contains(s.anchorNode)) return;
    history?.push();
    const range = s.getRangeAt(0);
    range.deleteContents();
    const br = doc.createElement('br');
    range.insertNode(br);
    // A break that is the last thing in a cell draws no line after it: a second one holds the line open.
    let next = br.nextSibling;
    while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue) next = next.nextSibling;
    if (!next) br.after(doc.createElement('br'));
    const caret = doc.createRange();
    caret.setStartAfter(br);
    caret.collapse(true);
    s.removeAllRanges();
    s.addRange(caret);
    dirty();
  }

  function emptyCells(cells) {
    history?.push();
    for (const td of cells) setCellText(td, '');
    dirty();
  }

  // Up from the line under a table, or Down from the line over it: into the
  // cell straight above or below the caret. Chromium's own went to the last
  // cell from under and the first from over, whatever column the caret was in.
  editor.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (cellOf(e.target)) return;
    const s = win.getSelection();
    if (!s?.rangeCount || !s.isCollapsed) return;
    const up = e.key === 'ArrowUp';
    let line = s.anchorNode?.nodeType === Node.ELEMENT_NODE ? s.anchorNode : s.anchorNode?.parentElement;
    while (line && line.parentElement && line.parentElement !== editor
      && !line.parentElement.classList.contains('blk-col') && !line.parentElement.classList.contains('toggle-body')) line = line.parentElement;
    if (!line || line === editor || !editor.contains(line) || line.closest(TABLE)) return;
    const wrap = up ? line.previousElementSibling : line.nextElementSibling;
    if (!wrap?.matches(TABLE)) return;
    const rect = caretRect(s.getRangeAt(0));
    const tops = lineTops(line);
    if (rect && tops.length > 1) {
      const mid = rect.top + rect.height / 2;
      if (up ? mid > tops[0].bottom : mid < tops[tops.length - 1].top) return;
    }
    const grid = gridOf(tableOf(wrap));
    const row = grid.matrix[up ? grid.rows - 1 : 0] ?? [];
    const x = rect ? rect.left : line.getBoundingClientRect().left;
    const cells = [...new Set(row.filter(Boolean))];
    if (!cells.length) return;
    const to = cells.find((c) => { const b = c.getBoundingClientRect(); return x >= b.left && x < b.right; })
      ?? (x < cells[0].getBoundingClientRect().left ? cells[0] : cells[cells.length - 1]);
    e.preventDefault();
    e.stopPropagation();
    caretAcross(to, x, up);
  }, true);

  editor.addEventListener('keydown', (e) => {
    const td = cellOf(e.target);
    if (!td || e.isComposing) return;
    const wrap = td.closest(TABLE);
    const mod = e.ctrlKey || e.metaKey;
    const now = sel?.wrap === wrap ? selected() : null;
    const many = !!now && (sel.ranged || now.cells.length > 1);

    if (e.key === 'Escape' && many) {
      e.preventDefault();
      e.stopPropagation();
      select(wrap, sel.a, sel.a, false);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && many && !mod) {
      e.preventDefault();
      e.stopPropagation();
      if (!locked()) emptyCells(now.cells);
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
      // Ctrl+A in a cell is that cell's words; again — or in an empty cell — every cell of the table; and
      // once more the whole note, as on a line. Chromium's own took the whole note at the first press, and
      // the next letter wrote over all of it.
      const whole = !!now && sel.ranged && now.rect.r0 === 0 && now.rect.c0 === 0
        && now.rect.r1 === now.grid.rows - 1 && now.rect.c1 === now.grid.cols - 1;
      if (whole) { clear(); return; }
      e.preventDefault();
      e.stopPropagation();
      if (many || isBlank(td) || wordsAllSelected(td)) { selectAll(wrap); return; }
      const r = doc.createRange();
      r.selectNodeContents(td);
      if (td.lastChild?.nodeName === 'BR') r.setEndBefore(td.lastChild);
      const s = win.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      return;
    }
    if (mod || e.altKey) return;

    const arrow = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (arrow && e.shiftKey && many) {
      // Shift and an arrow with cells selected: one cell more, or less.
      e.preventDefault();
      e.stopPropagation();
      const w = now.grid.where.get(now.grid.matrix[sel.f.r]?.[sel.f.c]) ?? { r: sel.f.r, c: sel.f.c, rs: 1, cs: 1 };
      const r = arrow[0] < 0 ? w.r - 1 : arrow[0] > 0 ? w.r + w.rs : sel.f.r;
      const c = arrow[1] < 0 ? w.c - 1 : arrow[1] > 0 ? w.c + w.cs : sel.f.c;
      if (r >= 0 && r < now.grid.rows && c >= 0 && c < now.grid.cols) select(wrap, sel.a, { r, c }, true);
      return;
    }
    if (arrow && !e.shiftKey) {
      const grid = now?.grid ?? gridOf(tableOf(wrap));
      const w = grid.where.get(td);
      if (!w) return;
      if (many) select(wrap, sel.a, sel.a, false);
      const [dr, dc] = arrow;
      const out = dr ? onEdgeLine(td, dr < 0) : atEdge(td, dc < 0);
      if (!out) return;
      const r = dr < 0 ? w.r - 1 : dr > 0 ? w.r + w.rs : w.r;
      const c = dc < 0 ? w.c - 1 : dc > 0 ? w.c + w.cs : w.c;
      let to = grid.matrix[r]?.[c];
      // Left at a row's first cell goes to the end of the row above, right at
      // its last to the start of the row under: the order the cells are read in.
      if (!to && dc) {
        const all = cellsIn(grid, { r0: 0, c0: 0, r1: grid.rows - 1, c1: grid.cols - 1 });
        to = all[all.indexOf(td) + (dc < 0 ? -1 : 1)] ?? null;
      }
      e.stopPropagation();
      if (to) {
        e.preventDefault();
        if (dr) {
          const s = win.getSelection();
          const rect = s?.rangeCount ? caretRect(s.getRangeAt(0)) : null;
          caretAcross(to, rect ? rect.left : null, dr < 0);
        } else caretIn(to, dc < 0);
      } else if (dr && leave(wrap, dr < 0)) e.preventDefault();
      else e.preventDefault();          // the first cell's start, the last cell's end: the caret stays
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const table = tableOf(wrap);
      let grid = gridOf(table);
      let all = cellsIn(grid, { r0: 0, c0: 0, r1: grid.rows - 1, c1: grid.cols - 1 });
      const i = all.indexOf(td);
      // With cells selected the step is taken from the first of them, and they are let go.
      if (many) select(wrap, sel.a, sel.a, false);
      if (e.shiftKey) { if (i > 0) caretIn(all[i - 1], true); return; }
      if (i === all.length - 1) {
        if (locked()) return;
        history?.push();
        addRow(table);
        dressTable(wrap);
        onGeometry?.();
        dirty();
        grid = gridOf(table);
        all = cellsIn(grid, { r0: 0, c0: 0, r1: grid.rows - 1, c1: grid.cols - 1 });
      }
      caretIn(all[i + 1], true);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (many) select(wrap, sel.a, sel.a, false);
      if (!locked()) lineBreak(td);
    }
  }, true);

  // Typing with cells selected goes into the first of them, and that is the one stood in again.
  editor.addEventListener('beforeinput', (e) => {
    if (!sel?.ranged || !cellOf(e.target) || !e.inputType?.startsWith('insert')) return;
    select(sel.wrap, sel.a, sel.a, false);
  }, true);

  /* ------------------------------------------------------------ clipboard */

  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  for (const type of ['copy', 'cut']) {
    editor.addEventListener(type, (e) => {
      const td = cellOf(e.target);
      const now = td && sel?.wrap === td.closest(TABLE) ? selected() : null;
      if (!now || !(sel.ranged || now.cells.length > 1) || !e.clipboardData) return;
      // Words selected in the one cell stood in are copied as words.
      const s = win.getSelection();
      if (now.cells.length === 1 && s && !s.isCollapsed) return;
      e.preventDefault();
      e.stopPropagation();
      const tsv = toTsv(now.grid, now.rect);
      e.clipboardData.setData('text/plain', tsv);
      e.clipboardData.setData('text/html', `<table>${tsv.split('\n').map((row) => `<tr>${row.split('\t').map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>`);
      if (type === 'cut' && !locked()) emptyCells(now.cells);
    }, true);
  }

  editor.addEventListener('paste', (e) => {
    const td = cellOf(e.target);
    if (!td) return;
    // A cell takes words: a picture or a card pasted here would be a block inside a cell.
    e.preventDefault();
    e.stopPropagation();
    if (locked()) return;
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
    if (!text) return;
    const wrap = td.closest(TABLE);
    const table = tableOf(wrap);
    const now = sel?.wrap === wrap ? selected() : null;
    const rows = fromTsv(text);
    history?.push();
    if (rows) {
      const at = now ? { r: now.rect.r0, c: now.rect.c0 } : posOf(td);
      const put = putRows(table, at, rows);
      dressTable(wrap);
      settle(wrap);
      select(wrap, { r: put.r0, c: put.c0 }, { r: put.r1, c: put.c1 }, true);
      parkCaret();
      onGeometry?.();
    } else if (now && (sel.ranged || now.cells.length > 1)) {
      // One piece of words onto several cells: each gets it.
      for (const cell of now.cells) setCellText(cell, text.replace(/\n$/, ''));
      paint();
    } else {
      const s = win.getSelection();
      if (!s?.rangeCount || !td.contains(s.anchorNode)) caretIn(td, true);
      const range = s.getRangeAt(0);
      range.deleteContents();
      if (isBlank(td) && !cellText(td)) td.replaceChildren();
      const lines = text.replace(/\n$/, '').split('\n');
      const piece = doc.createDocumentFragment();
      lines.forEach((line, i) => {
        if (i) piece.appendChild(doc.createElement('br'));
        if (line) piece.appendChild(doc.createTextNode(line));
      });
      const last = piece.lastChild;
      const at = td.firstChild ? range : (() => { const r = doc.createRange(); r.setStart(td, 0); r.collapse(true); return r; })();
      at.insertNode(piece);
      if (!td.lastChild || (td.lastChild.nodeName === 'BR' && td.lastChild === last)) td.appendChild(doc.createElement('br'));
      if (last) {
        const caret = doc.createRange();
        caret.setStartAfter(last);
        caret.collapse(true);
        s.removeAllRanges();
        s.addRange(caret);
      }
    }
    dirty();
  }, true);

  /* ------------------------------------------------------------ the rest */

  // A table that came in undrawn — pasted with the lines around it, or made by another part of the app.
  editor.addEventListener('input', () => {
    let drew = false;
    for (const wrap of editor.querySelectorAll(TABLE)) {
      if (isDressed(wrap)) continue;
      dressTable(wrap);
      drew = true;
    }
    if (drew) watch();
    if (sel && !sel.wrap.isConnected) clear();
    else if (drew || sel) paint();
  });
  // The page's width changed under the table: the square and the choices follow.
  win.addEventListener('resize', () => { if (sel) paint(); });

  // The place a table stands on made narrower or wider — a panel opened beside the note, the window pulled,
  // another page size chosen, a column's divider moved: every table is fitted to the room there is now.
  function refit() {
    if (resize) return;
    for (const wrap of editor.querySelectorAll(TABLE)) fitTable(wrap);
    if (sel) paint();
  }
  const watcher = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => refit()) : null;
  function watch() {
    if (!watcher) return;
    watcher.disconnect();
    watcher.observe(editor);
    for (const wrap of editor.querySelectorAll(TABLE)) if (wrap.parentElement && wrap.parentElement !== editor) watcher.observe(wrap.parentElement);
  }

  const controller = {
    /** Every table drawn again: a note was opened, or a step taken back. */
    refresh() {
      press = null;
      resize = null;
      fill = null;
      doc.body.classList.remove('tbl-ranging', 'tbl-resizing', 'tbl-resizing-row', 'tbl-filling');
      if (sel && !sel.wrap.isConnected) sel = null;
      refreshTables(editor);
      watch();
      paint();
    },
    insert: (opts) => { const wrap = locked() ? null : insertTable(editor, history, opts); if (wrap) watch(); return wrap; },
    hilite(cls, family) {
      const now = selected();
      if (!now || locked()) return false;
      const s = win.getSelection();
      const many = sel.ranged || now.cells.length > 1;
      // Words selected in the cell stood in are the words' to colour.
      if (!many && (!s?.rangeCount || !s.isCollapsed || !now.cells[0]?.contains(s.anchorNode))) return false;
      history?.push();
      const off = !cls || now.cells.every((td) => td.classList.contains(cls));
      for (const td of now.cells) {
        td.classList.remove(...family);
        if (!off) td.classList.add(cls);
        if (!td.classList.length) td.removeAttribute('class');
      }
      paint();
      dirty();
      return true;
    },
    align(value) {
      const now = selected();
      if (!now) return false;
      const s = win.getSelection();
      const node = s?.rangeCount ? s.anchorNode : null;
      // The caret on a line outside: the table has nothing selected for the bar to act on.
      if (!node || !sel.wrap.contains(node)) return false;
      if (locked()) return true;
      const many = sel.ranged || now.cells.length > 1;
      const cells = many ? now.cells : [anchorCell()].filter(Boolean);
      const to = value === 'left' ? '' : value;
      if (cells.every((td) => alignOf(td) === to)) return true;
      history?.push();
      for (const td of cells) setAlign(td, to);
      paint();
      dirty();
      return true;
    },
    selection: () => { const now = selected(); return now ? { ...now.rect, ranged: sel.ranged } : null; },
    /**
     * What a right-click on a table offers (context-menu.js): a row put in
     * above or below the cell that was clicked, a column at its left or right,
     * and its row or column taken away. On a number of the numbering, that
     * row's or that column's only.
     * @param {Element} target what was clicked
     * @returns {Array<[string, () => void]|null>|null} [label, what it does], null for a rule between
     *   them; null where the click was on no cell and no number, or the note is locked
     */
    menu(target) {
      const wrap = wrapOf(target);
      const table = tableOf(wrap);
      if (!table || locked()) return null;
      const grid = gridOf(table);
      const td = cellOf(target);
      const head = target.closest?.('th.tbl-x, th.tbl-y');
      // The corner selects nothing any more: the table is deleted from here.
      if (target.closest?.('.tbl-corner')) return [['Delete table', () => run('del-table', wrap)]];
      let w = td ? grid.where.get(td) : null;
      let rows = !!w;
      let cols = !!w;
      // In cells that are selected, the rows and columns are the selection's: all of them.
      const now = w && sel?.wrap === wrap && sel.ranged ? selected() : null;
      if (now && w.r >= now.rect.r0 && w.r <= now.rect.r1 && w.c >= now.rect.c0 && w.c <= now.rect.c1) {
        w = { r: now.rect.r0, c: now.rect.c0, rs: now.rect.r1 - now.rect.r0 + 1, cs: now.rect.c1 - now.rect.c0 + 1 };
      }
      if (!w && head) {
        cols = head.classList.contains('tbl-x');
        rows = !cols;
        const n = Number(cols ? head.dataset.c : head.dataset.r) || 0;
        w = cols ? { r: 0, c: n, rs: 1, cs: 1 } : { r: n, c: 0, rs: 1, cs: 1 };
      }
      if (!w) return null;
      const go = (act, where) => () => run(act, wrap, where);
      const out = [];
      if (rows) out.push(['Insert row above', go('ins-row', { at: w.r, keep: w.c })], ['Insert row below', go('ins-row', { at: w.r + w.rs, keep: w.c })]);
      if (cols) out.push(['Insert column left', go('ins-col', { at: w.c, keep: w.r })], ['Insert column right', go('ins-col', { at: w.c + w.cs, keep: w.r })]);
      out.push(null);
      if (rows) out.push([w.rs > 1 ? 'Delete rows' : 'Delete row', go('del-rows', { at: w.r, to: w.r + w.rs - 1 })]);
      if (cols) out.push([w.cs > 1 ? 'Delete columns' : 'Delete column', go('del-cols', { at: w.c, to: w.c + w.cs - 1 })]);
      if (rows && cols) out.push(['Delete table', () => run('del-table', wrap)]);
      return out;
    },
  };
  CONTROLLERS.set(editor, controller);
  refreshTables(editor);
  watch();
  return controller;
}
