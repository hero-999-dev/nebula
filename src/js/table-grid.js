/**
 * A table as a grid (0.9.4): where each cell stands, and what merging, adding,
 * deleting and filling do to it. Nothing here needs a screen — table.js draws
 * the table and takes the mouse and the keys; this is tested in jsdom.
 *
 * What a note holds is a plain table:
 *
 *   <div class="blk-table" data-block-type="table" contenteditable="false">
 *     <table><colgroup><col style="width: 140px">…</colgroup>
 *       <tbody><tr><td contenteditable="true" class="h-yellow" colspan="2">…</td>…</tr>…</tbody>
 *     </table>
 *   </div>
 *
 * A row that was pulled higher than its words need holds that height
 * (<tr style="height: 80px">); a row without one is as high as its words.
 *
 * A merged cell is one <td> with a colspan and a rowspan, so the same place in
 * the grid is not the same child of its row everywhere. Every change is made
 * on the grid — rows of places, each naming the cell that covers it — and the
 * rows are written out again from it (layout).
 */

/**
 * A new column's width, and the narrowest one may be pulled to, in pixels.
 * The narrowest was 44; the owner, with forty columns pulled down to it:
 * "let there be the right to put more from left to right".
 */
export const COL_WIDTH = 140;
export const MIN_COL = 24;
/** A new table: five rows of five cells (the owner, 0.9.4: "three by three is small"). */
export const NEW_ROWS = 5;
export const NEW_COLS = 5;
/** The largest table that is made in one go. */
export const MAX_ROWS = 100;
export const MAX_COLS = 60;
/**
 * The highest a row is pulled to, in pixels — and the lowest: as low as a
 * column may be narrow, so that a cell can be a square. The lowest was a line
 * of words with its room around it; the owner, with a grid of small boxes to
 * colour (the "urgent bugs" note, 0.9.4): "what does this making smaller go by
 * in the rows and in the columns? let us put these right — let it not be a
 * line".
 */
export const MAX_ROW = 800;
export const MIN_ROW = MIN_COL;
/** What the screen draws into a table and a note never holds (note-markup.js). */
export const UI = 'tbl-ui';

const HILITE = /^h-[a-z]+$/;

const span = (td, name) => Math.max(1, Number.parseInt(td.getAttribute(name) ?? '', 10) || 1);
function setSpan(td, name, n) {
  if (n > 1) td.setAttribute(name, String(n));
  else td.removeAttribute(name);
}

/** The body the rows are in — made if the table has none. */
export function bodyOf(table) {
  return table.tBodies[0] ?? table.appendChild(table.ownerDocument.createElement('tbody'));
}
/** The table's own rows: the numbering over them is no row of it. */
export const rowsOf = (table) => [...bodyOf(table).children].filter((el) => el.tagName === 'TR');
const cellsOf = (tr) => [...tr.children].filter((el) => el.tagName === 'TD');
/** The columns' widths are on these; the one under the row numbers is the screen's. */
export const colsOf = (table) => [...table.querySelectorAll(':scope > colgroup > col')].filter((col) => !col.classList.contains(UI));
/**
 * A column's own width. Where the table is drawn narrower than it is — it
 * would reach over the edge of its page or its column (table.js fitTable) —
 * the style holds what is drawn and `data-w` the column's own.
 */
const ownWidth = (col) => Number.parseFloat(col?.dataset?.w ?? '') || Number.parseFloat(col?.style.width ?? '');
export const widthOf = (col) => ownWidth(col) || COL_WIDTH;
/** A column's own width set; it is drawn as wide until the table is fitted again. */
export function setWidth(col, px) {
  col.removeAttribute('data-w');
  col.style.width = `${Math.round(px * 100) / 100}px`;
}

/**
 * A row's own height, in pixels: the least it is drawn — a row is never lower
 * than what its cells hold needs. 0: it has none, and is as high as its words.
 * The owner (0.9.4), told that only columns could be pulled: "let the height
 * of a row be pulled too".
 */
const ROW_HEIGHT = /^(\d+(?:\.\d+)?)px$/;
export const heightOf = (tr) => {
  const h = Number.parseFloat(ROW_HEIGHT.exec(tr?.style?.height ?? '')?.[1] ?? '') || 0;
  return h > 0 ? Math.max(MIN_ROW, Math.min(MAX_ROW, h)) : 0;
};
/** A row's own height set; nothing above zero takes it off, and the row is as high as its words again. */
export function setHeight(tr, px) {
  tr.removeAttribute('style');
  if (px > 0) tr.style.height = `${Math.round(Math.max(MIN_ROW, Math.min(MAX_ROW, px)))}px`;
}
/**
 * A row's own height told to the stylesheet, where a table is drawn — on the
 * screen, in a printed page, in a page written out. A cell keeps room over and
 * under its words; a row pulled lower than its words with that room gives the
 * room up first, and the stylesheet can only do that knowing the height
 * (`--row`). A note never holds it: setHeight and note-markup.js take it off.
 */
export const ROW_TOLD = '--row';
export function tellHeight(tr) {
  const h = heightOf(tr);
  setHeight(tr, h);
  if (h) tr.style.setProperty(ROW_TOLD, `${h}px`);
}

/**
 * A new, empty table as a note holds it, with an empty line under it.
 * @param {number} [rows]
 * @param {number} [cols]
 * @param {number} [width] each column's
 */
export function tableHtml(rows = NEW_ROWS, cols = NEW_COLS, width = COL_WIDTH) {
  const cell = '<td contenteditable="true"><br></td>';
  const w = Math.max(MIN_COL, Math.round(Number(width)) || COL_WIDTH);
  return '<div class="blk-table" data-block-type="table" contenteditable="false"><table>'
    + `<colgroup>${`<col style="width: ${w}px;">`.repeat(cols)}</colgroup>`
    + `<tbody>${`<tr>${cell.repeat(cols)}</tr>`.repeat(rows)}</tbody>`
    + '</table></div><p><br></p>';
}

/** How a cell's words are lined up, where it is not the left: the one style a cell keeps. */
const ALIGNED = /^(center|right|justify)$/;
export const alignOf = (td) => (ALIGNED.test(td?.style?.textAlign ?? '') ? td.style.textAlign : '');
/** A cell's words lined up: '', 'left' and anything unknown are the left, which is no style at all. */
export function setAlign(td, value) {
  td.removeAttribute('style');
  if (ALIGNED.test(value ?? '')) td.style.textAlign = value;
}

/** An empty cell; `like` gives it its background and the way its words are lined up. */
export function freshCell(doc, like = null) {
  const td = doc.createElement('td');
  td.setAttribute('contenteditable', 'true');
  td.appendChild(doc.createElement('br'));
  if (like) {
    for (const cls of like.classList) if (HILITE.test(cls)) td.classList.add(cls);
    setAlign(td, alignOf(like));
  }
  return td;
}

/**
 * A table as a note holds it, whatever it was dressed in: the numbering, the
 * grips and the + of the screen, the selection, and the styles a browser
 * writes onto everything it copies all go. What stays is the table, its rows
 * and cells, a width on each column, the height a row was pulled to and the
 * way a cell's words are lined up.
 * A copy of a table brings all of that along (the lines around a table copied
 * with it, 0.9.4), and so can a file.
 * @param {Element} wrap the .blk-table
 * @returns {HTMLTableElement|null} its table; null where it holds none
 */
export function plainTable(wrap) {
  wrap.querySelectorAll(`.${UI}, .tbl-corner, .tbl-x, .tbl-y, .tbl-ycol, .tbl-add, .tbl-fill, .tbl-chip, thead, tfoot, caption, button`).forEach((el) => el.remove());
  const table = wrap.querySelector(':scope > table');
  // Nothing stands in the block beside its table.
  for (const node of [...wrap.childNodes]) if (node !== table) node.remove();
  if (!table) return null;
  wrap.removeAttribute('style');
  wrap.removeAttribute('data-ind');
  table.removeAttribute('style');
  for (const el of table.querySelectorAll('tbody, colgroup')) el.removeAttribute('style');
  for (const tr of table.querySelectorAll('tr')) setHeight(tr, heightOf(tr));
  for (const col of table.querySelectorAll('col')) {
    const w = ownWidth(col);
    col.removeAttribute('style');
    col.removeAttribute('class');
    col.removeAttribute('data-w');
    if (Number.isFinite(w) && w > 0) col.style.width = `${Math.round(w)}px`;
  }
  // A heading cell of a table from elsewhere is a cell like the others here.
  for (const th of table.querySelectorAll('th')) {
    const td = table.ownerDocument.createElement('td');
    for (const name of ['colspan', 'rowspan']) if (th.hasAttribute(name)) td.setAttribute(name, th.getAttribute(name));
    td.append(...th.childNodes);
    th.replaceWith(td);
  }
  for (const td of table.querySelectorAll('td')) {
    setAlign(td, alignOf(td));
    td.removeAttribute('data-ind');
    td.classList.remove('sel', 'act', 'fill');
    if (!td.classList.length) td.removeAttribute('class');
  }
  return table;
}

/**
 * Where every cell stands.
 * @param {HTMLTableElement} table
 * @returns {{matrix: Array<Array<HTMLTableCellElement|undefined>>, where: Map<HTMLTableCellElement, {r: number, c: number, rs: number, cs: number}>, rows: number, cols: number}}
 *   matrix[r][c] is the cell covering that place; `where` gives a cell's first place and how far it reaches
 */
export function gridOf(table) {
  const trs = rowsOf(table);
  const matrix = trs.map(() => []);
  const where = new Map();
  trs.forEach((tr, r) => {
    let c = 0;
    for (const td of cellsOf(tr)) {
      while (matrix[r][c]) c += 1;
      const rs = Math.min(span(td, 'rowspan'), trs.length - r);
      const cs = span(td, 'colspan');
      for (let dr = 0; dr < rs; dr += 1) for (let dc = 0; dc < cs; dc += 1) matrix[r + dr][c + dc] ??= td;
      where.set(td, { r, c, rs, cs });
      c += cs;
    }
  });
  const cols = Math.max(0, ...matrix.map((row) => row.length));
  return { matrix, where, rows: trs.length, cols };
}

/**
 * The rows written out again from a grid of places. A cell reaches as far as
 * the places that name it, from its first one.
 * @param {HTMLTableElement} table
 * @param {Array<Array<HTMLTableCellElement>>} matrix
 */
export function layout(table, matrix) {
  const doc = table.ownerDocument;
  const body = bodyOf(table);
  let trs = rowsOf(table);
  for (let i = trs.length; i < matrix.length; i += 1) body.appendChild(doc.createElement('tr'));
  trs.slice(matrix.length).forEach((tr) => tr.remove());
  trs = rowsOf(table);
  const placed = new Set();
  matrix.forEach((row, r) => {
    const mine = [];
    row.forEach((td, c) => {
      if (!td || placed.has(td)) return;
      placed.add(td);
      let cs = 1;
      while (row[c + cs] === td) cs += 1;
      let rs = 1;
      while (matrix[r + rs]?.[c] === td) rs += 1;
      setSpan(td, 'colspan', cs);
      setSpan(td, 'rowspan', rs);
      mine.push(td);
    });
    for (const old of cellsOf(trs[r])) if (!mine.includes(old)) old.remove();
    for (const td of mine) trs[r].appendChild(td);
  });
  syncCols(table, Math.max(0, ...matrix.map((row) => row.length)));
}

/** As many columns as the grid is wide, each with a width. */
export function syncCols(table, count) {
  const doc = table.ownerDocument;
  let group = table.querySelector(':scope > colgroup');
  if (!group) {
    group = doc.createElement('colgroup');
    table.prepend(group);
  }
  const cols = colsOf(table);
  for (let i = cols.length; i < count; i += 1) group.appendChild(doc.createElement('col'));
  cols.slice(count).forEach((col) => col.remove());
  for (const col of colsOf(table)) {
    const w = ownWidth(col);
    if (!(w >= MIN_COL)) setWidth(col, Number.isFinite(w) && w > 0 ? MIN_COL : COL_WIDTH);
  }
}

/**
 * A table with a cell on every place and a width on every column: one that
 * came in from a file, or was cut short by a paste, is made whole.
 * @returns {ReturnType<typeof gridOf>}
 */
export function squareUp(table) {
  const grid = gridOf(table);
  let holes = false;
  // Not one cell left: a table is at least one.
  if (!grid.rows) grid.matrix.push([]);
  grid.cols = Math.max(1, grid.cols);
  for (const row of grid.matrix) {
    for (let c = 0; c < grid.cols; c += 1) {
      if (row[c]) continue;
      row[c] = freshCell(table.ownerDocument);
      holes = true;
    }
  }
  if (holes) layout(table, grid.matrix);
  else syncCols(table, grid.cols);
  return holes ? gridOf(table) : grid;
}

/**
 * The block of places between two of them — grown until no merged cell is cut
 * by its edge.
 * @param {ReturnType<typeof gridOf>} grid
 * @param {{r: number, c: number}} a
 * @param {{r: number, c: number}} b
 * @returns {{r0: number, c0: number, r1: number, c1: number}}
 */
export function rectOf(grid, a, b) {
  const row = (n) => Math.max(0, Math.min(grid.rows - 1, n));
  const col = (n) => Math.max(0, Math.min(grid.cols - 1, n));
  let r0 = row(Math.min(a.r, b.r));
  let r1 = row(Math.max(a.r, b.r));
  let c0 = col(Math.min(a.c, b.c));
  let c1 = col(Math.max(a.c, b.c));
  for (let grown = true; grown;) {
    grown = false;
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const w = grid.where.get(grid.matrix[r]?.[c]);
        if (!w) continue;
        if (w.r < r0) { r0 = w.r; grown = true; }
        if (w.c < c0) { c0 = w.c; grown = true; }
        if (w.r + w.rs - 1 > r1) { r1 = w.r + w.rs - 1; grown = true; }
        if (w.c + w.cs - 1 > c1) { c1 = w.c + w.cs - 1; grown = true; }
      }
    }
  }
  return { r0, c0, r1, c1 };
}

/** The cells of a block of places, each once, as they are read. */
export function cellsIn(grid, rect) {
  const out = [];
  const seen = new Set();
  for (let r = rect.r0; r <= rect.r1; r += 1) {
    for (let c = rect.c0; c <= rect.c1; c += 1) {
      const td = grid.matrix[r]?.[c];
      if (!td || seen.has(td)) continue;
      seen.add(td);
      out.push(td);
    }
  }
  return out;
}

/** The cell that begins on that place — none where a merged cell only reaches over it. */
function originAt(grid, r, c) {
  const td = grid.matrix[r]?.[c];
  const w = grid.where.get(td);
  return w && w.r === r && w.c === c ? td : null;
}

/** Nothing written in it: only the break that holds an empty cell open. */
export function isBlank(td) {
  return !td.textContent.replace(/​/g, '').trim() && !td.querySelector('img, .inline-eq, .note-mention, .note-tag');
}

/** A cell's words, a line for each break. */
export function cellText(td) {
  let out = '';
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += child.nodeValue;
      else if (child.nodeType === 1 && child.tagName === 'BR') out += '\n';
      else if (child.nodeType === 1) walk(child);
    }
  };
  walk(td);
  return out.replace(/​/g, '').replace(/\n+$/, '');
}

/** Words into a cell, a break for each line. */
export function setCellText(td, text) {
  const doc = td.ownerDocument;
  const lines = String(text ?? '').split('\n');
  td.replaceChildren();
  lines.forEach((line, i) => {
    if (i) td.appendChild(doc.createElement('br'));
    if (line) td.appendChild(doc.createTextNode(line));
  });
  if (!td.lastChild || td.lastChild.nodeName === 'BR') td.appendChild(doc.createElement('br'));
}

/**
 * The cells of a block become one, standing on its first place. What the
 * others held follows what the first holds, each on a line of its own:
 * nothing written is lost.
 * @returns {HTMLTableCellElement|null} the cell they became; null where there was only one
 */
export function mergeCells(table, rect) {
  const grid = gridOf(table);
  const cells = cellsIn(grid, rect);
  if (cells.length < 2) return null;
  const doc = table.ownerDocument;
  const keep = cells[0];
  for (const td of cells.slice(1)) {
    if (isBlank(td)) continue;
    if (isBlank(keep)) keep.replaceChildren();
    else {
      if (keep.lastChild?.nodeName === 'BR') keep.lastChild.remove();
      keep.appendChild(doc.createElement('br'));
    }
    keep.append(...td.childNodes);
  }
  if (!keep.firstChild) keep.appendChild(doc.createElement('br'));
  for (let r = rect.r0; r <= rect.r1; r += 1) for (let c = rect.c0; c <= rect.c1; c += 1) grid.matrix[r][c] = keep;
  layout(table, grid.matrix);
  return keep;
}

/**
 * Every merged cell of a block is cells again: it stays on its first place
 * with what it holds, and the places it reached over get empty cells in its
 * colour.
 * @returns {boolean} whether there was one
 */
export function unmergeCells(table, rect) {
  const grid = gridOf(table);
  let changed = false;
  for (const td of cellsIn(grid, rect)) {
    const w = grid.where.get(td);
    if (w.rs === 1 && w.cs === 1) continue;
    for (let r = w.r; r < w.r + w.rs; r += 1) {
      for (let c = w.c; c < w.c + w.cs; c += 1) {
        if (r !== w.r || c !== w.c) grid.matrix[r][c] = freshCell(table.ownerDocument, td);
      }
    }
    changed = true;
  }
  if (changed) layout(table, grid.matrix);
  return changed;
}

/** Whether a block holds a merged cell. */
export function hasMerged(grid, rect) {
  return cellsIn(grid, rect).some((td) => { const w = grid.where.get(td); return w.rs > 1 || w.cs > 1; });
}

/**
 * A row of empty cells before row `at` — after the last one when `at` is the
 * number of rows. A merged cell that reaches across that line reaches over the
 * new row too: it is not cut in two. The new row is as high as its words; the
 * rows under it keep the heights they were pulled to.
 * @returns {number} where the row stands
 */
export function insertRow(table, at) {
  const grid = gridOf(table);
  const r = Math.max(0, Math.min(grid.rows, Math.round(Number(at)) || 0));
  const above = grid.matrix[r - 1];
  const below = grid.matrix[r];
  grid.matrix.splice(r, 0, Array.from({ length: Math.max(1, grid.cols) }, (_, c) => (
    above && below && above[c] && above[c] === below[c] ? above[c] : freshCell(table.ownerDocument))));
  // A row of its own between the others: a height stays with the row it was given to.
  if (grid.rows) bodyOf(table).insertBefore(table.ownerDocument.createElement('tr'), rowsOf(table)[r] ?? null);
  layout(table, grid.matrix);
  return r;
}

/**
 * A column of empty cells before column `at` — after the last one when `at` is
 * the number of columns — with a new column's width. A merged cell across that
 * line reaches over it.
 * @returns {number} where the column stands
 */
export function insertColumn(table, at) {
  const grid = gridOf(table);
  if (!grid.rows) grid.matrix.push([]);
  const c = Math.max(0, Math.min(grid.cols, Math.round(Number(at)) || 0));
  for (const row of grid.matrix) {
    while (row.length < grid.cols) row.push(freshCell(table.ownerDocument));
    const through = c > 0 && c < grid.cols && row[c - 1] === row[c];
    row.splice(c, 0, through ? row[c] : freshCell(table.ownerDocument));
  }
  // The widths stay with their columns: the new one's is put in between them.
  syncCols(table, grid.cols);
  const before = colsOf(table)[c] ?? null;
  const col = table.ownerDocument.createElement('col');
  col.style.width = `${COL_WIDTH}px`;
  table.querySelector(':scope > colgroup').insertBefore(col, before);
  layout(table, grid.matrix);
  return c;
}

/** A row of empty cells under the last one. */
export function addRow(table) {
  insertRow(table, gridOf(table).rows);
}

/** A column of empty cells after the last one. */
export function addColumn(table) {
  insertColumn(table, gridOf(table).cols);
}

/**
 * Rows r0..r1 go, their heights with them. A merged cell that reached into
 * them is shorter; one that began in them and goes on under them stays, with
 * what it holds.
 * @returns {number} how many rows are left
 */
export function deleteRows(table, r0, r1) {
  const grid = gridOf(table);
  grid.matrix.splice(r0, r1 - r0 + 1);
  rowsOf(table).slice(r0, r1 + 1).forEach((tr) => tr.remove());
  layout(table, grid.matrix);
  return grid.matrix.length;
}

/**
 * Columns c0..c1 go, their widths with them.
 * @returns {number} how many columns are left
 */
export function deleteColumns(table, c0, c1) {
  const grid = gridOf(table);
  for (const row of grid.matrix) row.splice(c0, c1 - c0 + 1);
  colsOf(table).slice(c0, c1 + 1).forEach((col) => col.remove());
  layout(table, grid.matrix);
  return Math.max(0, ...grid.matrix.map((row) => row.length));
}

/* ------------------------------------------------------------------ filling */

const NUMBER = /^-?\d+(?:[.,]\d+)?$/;
const WORDS_NUMBER = /^([\s\S]*?)(\d+)$/;

/**
 * What stands on place `i` of a run that begins with these words (place 0 is
 * the first of them): numbers that step evenly go on stepping — 1, 2 → 3, 4;
 * 10, 20 → 30 — and so do words ending in a number: "Day 1" → "Day 2".
 * @param {string[]} texts
 * @param {number} i before the run when below zero
 * @returns {string|null} null: no run — the cells are copied as they are
 */
export function seriesAt(texts, i) {
  const n = texts.length;
  if (!n) return null;
  if (n >= 2 && texts.every((s) => NUMBER.test(s))) {
    const values = texts.map((s) => Number(s.replace(',', '.')));
    const step = values[1] - values[0];
    if (!values.every((v, k) => k === 0 || Math.abs(v - values[k - 1] - step) < 1e-9)) return null;
    const places = Math.max(...texts.map((s) => (s.split(/[.,]/)[1] ?? '').length));
    const out = (values[0] + step * i).toFixed(places);
    return texts.some((s) => s.includes(',')) ? out.replace('.', ',') : out;
  }
  const parts = texts.map((s) => WORDS_NUMBER.exec(s));
  if (!parts.every(Boolean) || !parts[0][1].trim() || !parts.every((p) => p[1] === parts[0][1])) return null;
  const values = parts.map((p) => Number(p[2]));
  const step = n === 1 ? 1 : values[1] - values[0];
  if (!values.every((v, k) => k === 0 || v - values[k - 1] === step)) return null;
  const value = values[0] + step * i;
  if (value < 0) return null;
  const digits = parts[0][2];
  return `${parts[0][1]}${digits.length > 1 && digits.startsWith('0') ? String(value).padStart(digits.length, '0') : value}`;
}

/**
 * Where a block pulled by its corner to place `at` reaches: one way only — up
 * or down, or to a side — whichever it was pulled further.
 * @param {{r0: number, c0: number, r1: number, c1: number}} src
 * @param {{r: number, c: number}} at
 * @returns {{r0: number, c0: number, r1: number, c1: number}|null} null inside the block itself
 */
export function fillTarget(src, at) {
  const dr = at.r < src.r0 ? at.r - src.r0 : at.r > src.r1 ? at.r - src.r1 : 0;
  const dc = at.c < src.c0 ? at.c - src.c0 : at.c > src.c1 ? at.c - src.c1 : 0;
  if (!dr && !dc) return null;
  if (Math.abs(dr) >= Math.abs(dc)) return { r0: Math.min(src.r0, at.r), r1: Math.max(src.r1, at.r), c0: src.c0, c1: src.c1 };
  return { r0: src.r0, r1: src.r1, c0: Math.min(src.c0, at.c), c1: Math.max(src.c1, at.c) };
}

/** What a cell holds, its colour and the way its words are lined up, onto another. */
function copyCell(from, to) {
  to.replaceChildren(...[...from.childNodes].map((n) => n.cloneNode(true)));
  if (!to.firstChild) to.appendChild(to.ownerDocument.createElement('br'));
  for (const cls of [...to.classList]) if (HILITE.test(cls)) to.classList.remove(cls);
  for (const cls of from.classList) if (HILITE.test(cls)) to.classList.add(cls);
  if (!to.classList.length) to.removeAttribute('class');
  setAlign(to, alignOf(from));
}

/** A run's next words into a cell that holds a copy: in the copy's own dress where it is one piece of text. */
function writeSeries(td, text) {
  const walker = td.ownerDocument.createTreeWalker(td, 4 /* NodeFilter.SHOW_TEXT */);
  const words = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.replace(/​/g, '').trim()) words.push(n);
  if (words.length === 1) words[0].nodeValue = text;
  else setCellText(td, text);
}

/**
 * A block carried on over the places around it, as Excel's corner does: the
 * cells are copied one after the other, again and again, with their colour;
 * a run of numbers goes on (seriesAt).
 * @param {HTMLTableElement} table
 * @param {{r0: number, c0: number, r1: number, c1: number}} src what is carried on
 * @param {{r0: number, c0: number, r1: number, c1: number}} dst where to: src and the places beyond one of its sides
 * @returns {boolean} whether a cell changed
 */
export function fillCells(table, src, dst) {
  const grid = gridOf(table);
  const vertical = dst.c0 === src.c0 && dst.c1 === src.c1;
  const [l0, l1] = vertical ? [src.c0, src.c1] : [src.r0, src.r1];
  const [s0, s1] = vertical ? [src.r0, src.r1] : [src.c0, src.c1];
  const [d0, d1] = vertical ? [dst.r0, dst.r1] : [dst.c0, dst.c1];
  const n = s1 - s0 + 1;
  let changed = false;
  for (let line = l0; line <= l1; line += 1) {
    const at = (k) => (vertical ? originAt(grid, k, line) : originAt(grid, line, k));
    const source = Array.from({ length: n }, (_, k) => at(s0 + k));
    const texts = source.map((td) => (td ? cellText(td).trim() : ''));
    const put = (k) => {
      const to = at(k);
      const i = k - s0;
      const from = source[((i % n) + n) % n];
      if (!to || !from) return;
      copyCell(from, to);
      const next = seriesAt(texts, i);
      if (next !== null) writeSeries(to, next);
      changed = true;
    };
    for (let k = s1 + 1; k <= d1; k += 1) put(k);
    for (let k = s0 - 1; k >= d0; k -= 1) put(k);
  }
  return changed;
}

/* ------------------------------------------------------------------ copying */

/** A block as rows of words: a tab between cells, a line for each row. */
export function toTsv(grid, rect) {
  const rows = [];
  for (let r = rect.r0; r <= rect.r1; r += 1) {
    const row = [];
    for (let c = rect.c0; c <= rect.c1; c += 1) {
      const td = originAt(grid, r, c);
      row.push(td ? cellText(td).replace(/[\t\n]+/g, ' ') : '');
    }
    rows.push(row.join('\t'));
  }
  return rows.join('\n');
}

/**
 * Copied rows of words as a grid: what a spreadsheet or another table put on
 * the clipboard. One cell of words alone is no grid.
 * @param {string} text
 * @returns {string[][]|null}
 */
export function fromTsv(text) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (!raw.includes('\t')) return null;
  return raw.split('\n').map((line) => line.split('\t'));
}

/**
 * Rows of words onto the table from a place on: one cell each, going right
 * and down. The table grows where they would not fit.
 * @returns {{r0: number, c0: number, r1: number, c1: number}} the block that was written
 */
export function putRows(table, at, rows, { maxRows = 500, maxCols = MAX_COLS } = {}) {
  const lines = rows.slice(0, maxRows).map((row) => row.slice(0, maxCols));
  const wide = Math.max(1, ...lines.map((row) => row.length));
  let grid = gridOf(table);
  for (let r = grid.rows; r < at.r + lines.length; r += 1) addRow(table);
  for (let c = grid.cols; c < at.c + wide; c += 1) addColumn(table);
  grid = gridOf(table);
  lines.forEach((row, i) => row.forEach((text, j) => {
    const td = originAt(grid, at.r + i, at.c + j);
    if (td) setCellText(td, text);
  }));
  return { r0: at.r, c0: at.c, r1: at.r + lines.length - 1, c1: at.c + wide - 1 };
}
