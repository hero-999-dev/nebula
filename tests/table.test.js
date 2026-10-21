/**
 * Tables (0.9.4): the grid a table is (table-grid.js), what is drawn round it
 * and never saved (table.js, note-markup.js), and what leaves the note with it
 * (export.js). The mouse and the keys are in tests/e2e/table.mjs.
 */
import { describe, it, expect } from 'vitest';
import {
  tableHtml, gridOf, rectOf, cellsIn, mergeCells, unmergeCells, hasMerged, addRow, addColumn, insertRow, insertColumn, deleteRows, deleteColumns,
  seriesAt, fillTarget, fillCells, toTsv, fromTsv, putRows, cellText, setCellText, squareUp, colsOf, COL_WIDTH, MIN_COL,
  plainTable, alignOf, NEW_ROWS, NEW_COLS, rowsOf, heightOf, setHeight, tellHeight, MAX_ROW, MIN_ROW,
} from '../src/js/table-grid.js';
import { dressTable, refreshTables, insertTable, initTables, hiliteCells, alignCells, tableAt, fitTable, millimetres } from '../src/js/table.js';
import { pickTableSize, GRID_ROWS, GRID_COLS } from '../src/js/table-size.js';
import { cleanNebulaHtml } from '../src/js/paste-clean.js';
import { serializeNote, hasTransient } from '../src/js/note-markup.js';
import { toMarkdown, toHtml } from '../src/js/export.js';
import { sanitize } from '../src/js/import.js';
import { migrateNote } from '../src/js/migrate.js';
import { healHtml } from '../src/js/heal.js';
import { gripOf, DRAG_BLOCK } from '../src/js/block-drag.js';
import { placeForClick } from '../src/js/gap-caret.js';
import { SLASH_ITEMS } from '../src/js/slash-menu.js';
import { STRINGS } from '../src/js/i18n.js';

/** A table of `rows` × `cols` in the page, each cell holding its place: "r,c". */
function make(rows = 3, cols = 3, { named = true } = {}) {
  const host = document.createElement('div');
  host.id = 'editor';
  host.setAttribute('contenteditable', 'true');
  host.innerHTML = tableHtml(rows, cols);
  document.body.replaceChildren(host);
  const table = host.querySelector('table');
  if (named) [...table.rows].forEach((tr, r) => [...tr.cells].forEach((td, c) => { td.innerHTML = `${r},${c}`; }));
  return { host, wrap: host.firstElementChild, table };
}
/** The table as rows of what its cells hold; a place a merged cell only reaches over is "·". */
const shape = (table) => {
  const grid = gridOf(table);
  return grid.matrix.map((row, r) => row.map((td, c) => {
    const w = grid.where.get(td);
    return w.r === r && w.c === c ? cellText(td) : '·';
  }).join(' | '));
};
const block = (r0, c0, r1, c1) => ({ r0, c0, r1, c1 });

describe('a new table', () => {
  it('is rows of cells to write in, with a width on every column and a line under it', () => {
    const { host, wrap, table } = make(2, 3, { named: false });
    expect(wrap.matches('.blk-table[contenteditable="false"][data-block-type="table"]')).toBe(true);
    expect(table.rows.length).toBe(2);
    expect([...table.rows].map((tr) => tr.cells.length)).toEqual([3, 3]);
    expect([...table.querySelectorAll('td')].every((td) => td.getAttribute('contenteditable') === 'true' && td.innerHTML === '<br>')).toBe(true);
    expect(colsOf(table).map((col) => col.style.width)).toEqual(Array(3).fill(`${COL_WIDTH}px`));
    expect(host.lastElementChild.outerHTML).toBe('<p><br></p>');
  });

  it('is in the slash menu and on the bar, in every language', () => {
    expect(SLASH_ITEMS.find((it) => it.id === 'table')?.label).toBe('Table');
    for (const text of ['Table', 'Merge', 'Unmerge', 'Delete row', 'Delete rows', 'Delete column', 'Delete columns', 'Delete table', 'Add a row', 'Add a column', 'Insert row above', 'Insert row below', 'Insert column left', 'Insert column right']) {
      expect(STRINGS[text], text).toHaveLength(3);
    }
  });
});

describe('the grid', () => {
  it('knows where each cell stands, merged ones too', () => {
    const { table } = make(3, 3);
    mergeCells(table, block(0, 0, 1, 1));
    const grid = gridOf(table);
    expect([grid.rows, grid.cols]).toEqual([3, 3]);
    expect(grid.where.get(grid.matrix[1][1])).toEqual({ r: 0, c: 0, rs: 2, cs: 2 });
    expect(grid.where.get(grid.matrix[1][2])).toEqual({ r: 1, c: 2, rs: 1, cs: 1 });
    expect(shape(table)).toEqual(['0,0\n0,1\n1,0\n1,1 | · | 0,2', '· | · | 1,2', '2,0 | 2,1 | 2,2']);
  });

  it('a block of places grows until no merged cell is cut by its edge', () => {
    const { table } = make(4, 4);
    mergeCells(table, block(1, 1, 2, 2));
    const grid = gridOf(table);
    expect(rectOf(grid, { r: 0, c: 0 }, { r: 1, c: 1 })).toEqual(block(0, 0, 2, 2));
    expect(rectOf(grid, { r: 2, c: 2 }, { r: 3, c: 3 })).toEqual(block(1, 1, 3, 3));
    expect(rectOf(grid, { r: 3, c: 3 }, { r: 0, c: 3 })).toEqual(block(0, 3, 3, 3));
    expect(rectOf(grid, { r: 9, c: 9 }, { r: 3, c: 0 })).toEqual(block(3, 0, 3, 3));
    expect(cellsIn(grid, block(0, 0, 2, 2)).length).toBe(6);
  });

  it('a table cut short is made whole: a cell on every place, a width on every column', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="blk-table"><table><tbody><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td></tr></tbody></table></div>';
    const table = host.querySelector('table');
    const grid = squareUp(table);
    expect([grid.rows, grid.cols]).toEqual([2, 3]);
    expect(shape(table)).toEqual(['a | b | c', 'd |  | ']);
    expect(colsOf(table).length).toBe(3);
    const none = document.createElement('div');
    none.innerHTML = '<table><colgroup><col style="width: 3px"></colgroup></table>';
    expect(squareUp(none.firstChild).rows).toBe(1);
    expect(colsOf(none.firstChild)[0].style.width).toBe(`${MIN_COL}px`);
  });
});

describe('merging', () => {
  it('makes one cell of a block, on its first place, holding what they all held', () => {
    const { table } = make(2, 3);
    table.rows[0].cells[1].innerHTML = '<br>';
    table.rows[0].cells[0].classList.add('h-yellow');
    const kept = mergeCells(table, block(0, 0, 1, 1));
    expect(kept).toBe(table.rows[0].cells[0]);
    expect(kept.getAttribute('colspan')).toBe('2');
    expect(kept.getAttribute('rowspan')).toBe('2');
    expect(kept.innerHTML).toBe('0,0<br>1,0<br>1,1');
    expect(kept.classList.contains('h-yellow')).toBe(true);
    expect([...table.rows].map((tr) => tr.cells.length)).toEqual([2, 1]);
    expect(mergeCells(table, block(0, 0, 0, 0))).toBeNull();
  });

  it('unmerging gives the places back as empty cells in the cell\'s colour', () => {
    const { table } = make(2, 3);
    table.rows[0].cells[0].classList.add('h-blue');
    mergeCells(table, block(0, 0, 1, 1));
    expect(hasMerged(gridOf(table), block(0, 0, 1, 2))).toBe(true);
    expect(unmergeCells(table, block(0, 0, 0, 0))).toBe(true);
    expect(shape(table)).toEqual(['0,0\n0,1\n1,0\n1,1 |  | 0,2', ' |  | 1,2']);
    expect([...table.querySelectorAll('td')].filter((td) => td.classList.contains('h-blue')).length).toBe(4);
    expect(table.querySelector('[colspan], [rowspan]')).toBeNull();
    expect(unmergeCells(table, block(0, 0, 1, 2))).toBe(false);
  });

  it('two whole rows merged are still two rows of the grid', () => {
    const { table } = make(3, 2);
    mergeCells(table, block(0, 0, 1, 1));
    expect(gridOf(table).rows).toBe(3);
    expect(table.rows[1].cells.length).toBe(0);
    expect(shape(table)[2]).toBe('2,0 | 2,1');
  });
});

describe('rows and columns', () => {
  it('a row is added under the last, a column after the last', () => {
    const { table } = make(2, 2);
    addRow(table);
    addColumn(table);
    expect(shape(table)).toEqual(['0,0 | 0,1 | ', '1,0 | 1,1 | ', ' |  | ']);
    expect(colsOf(table).length).toBe(3);
    expect(table.rows[2].cells[0].getAttribute('contenteditable')).toBe('true');
  });

  it('a row or a column is put in between two; a merged cell across that line reaches over it', () => {
    const { table } = make(3, 3);
    colsOf(table)[1].style.width = '200px';
    expect(insertRow(table, 1)).toBe(1);
    expect(shape(table)).toEqual(['0,0 | 0,1 | 0,2', ' |  | ', '1,0 | 1,1 | 1,2', '2,0 | 2,1 | 2,2']);
    expect(insertColumn(table, 0)).toBe(0);
    expect(shape(table)[0]).toBe(' | 0,0 | 0,1 | 0,2');
    expect(colsOf(table).map((col) => col.style.width)).toEqual(['140px', '140px', '200px', '140px']);
    const kept = mergeCells(table, block(2, 1, 3, 2));
    insertRow(table, 3);
    insertColumn(table, 2);
    const grid = gridOf(table);
    expect(grid.where.get(kept)).toEqual({ r: 2, c: 1, rs: 3, cs: 3 });
    expect([grid.rows, grid.cols]).toEqual([5, 5]);
    expect(shape(table)[3]).toBe(' | · | · | · | ');
    expect(shape(table).map((row) => row.split(' | ')[2])).toEqual(['', '', '·', '·', '·']);
    expect(colsOf(table).map((col) => col.style.width)).toEqual(['140px', '140px', '140px', '200px', '140px']);
    // Past either end it is the first or the last.
    expect(insertRow(table, 99)).toBe(5);
    expect(insertColumn(table, -3)).toBe(0);
  });

  it('rows go; a merged cell reaching into them is shorter, one beginning in them stays', () => {
    const { table } = make(4, 2);
    mergeCells(table, block(1, 0, 3, 0));
    expect(deleteRows(table, 1, 1)).toBe(3);
    expect(shape(table)).toEqual(['0,0 | 0,1', '1,0\n2,0\n3,0 | 2,1', '· | 3,1']);
    expect(deleteRows(table, 2, 2)).toBe(2);
    expect(table.querySelector('[rowspan]')).toBeNull();
    expect(deleteRows(table, 0, 1)).toBe(0);
  });

  it('columns go, their widths with them', () => {
    const { table } = make(2, 4);
    colsOf(table)[1].style.width = '200px';
    colsOf(table)[3].style.width = '90px';
    mergeCells(table, block(0, 1, 0, 2));
    expect(deleteColumns(table, 1, 1)).toBe(3);
    expect(shape(table)).toEqual(['0,0 | 0,1\n0,2 | 0,3', '1,0 | 1,2 | 1,3']);
    expect(colsOf(table).map((col) => col.style.width)).toEqual(['140px', '140px', '90px']);
    expect(table.querySelector('[colspan]')).toBeNull();
  });
});

describe('carrying cells on from the corner', () => {
  it('goes one way only: the way it was pulled further', () => {
    const src = block(1, 1, 1, 2);
    expect(fillTarget(src, { r: 3, c: 2 })).toEqual(block(1, 1, 3, 2));
    expect(fillTarget(src, { r: 0, c: 1 })).toEqual(block(0, 1, 1, 2));
    expect(fillTarget(src, { r: 1, c: 0 })).toEqual(block(1, 0, 1, 2));
    expect(fillTarget(src, { r: 2, c: 4 })).toEqual(block(1, 1, 1, 4));
    expect(fillTarget(src, { r: 1, c: 2 })).toBeNull();
  });

  it('numbers that step evenly go on stepping; words ending in a number count on', () => {
    expect(seriesAt(['1', '2'], 2)).toBe('3');
    expect(seriesAt(['10', '20'], 4)).toBe('50');
    expect(seriesAt(['5', '3'], 2)).toBe('1');
    expect(seriesAt(['1,5', '2,0'], 2)).toBe('2,5');
    expect(seriesAt(['0.25', '0.50'], -1)).toBe('0.00');
    expect(seriesAt(['Day 1'], 1)).toBe('Day 2');
    expect(seriesAt(['Week 01', 'Week 03'], 2)).toBe('Week 05');
    expect(seriesAt(['Day 1'], -2)).toBeNull();
    // One number alone, uneven steps and plain words are copied.
    expect(seriesAt(['7'], 1)).toBeNull();
    expect(seriesAt(['1', '2', '4'], 3)).toBeNull();
    expect(seriesAt(['a', 'b'], 2)).toBeNull();
    expect(seriesAt(['2024'], 1)).toBeNull();
  });

  it('copies a cell down with its colour, and carries a run on', () => {
    const { table } = make(4, 3, { named: false });
    const at = (r, c) => gridOf(table).matrix[r][c];
    at(0, 0).innerHTML = '<b>word</b>';
    at(0, 0).classList.add('h-green');
    at(0, 1).textContent = '1';
    at(1, 1).textContent = '2';
    expect(fillCells(table, block(0, 0, 0, 0), block(0, 0, 3, 0))).toBe(true);
    expect([1, 2, 3].map((r) => at(r, 0).outerHTML)).toEqual(Array(3).fill('<td contenteditable="true" class="h-green"><b>word</b></td>'));
    fillCells(table, block(0, 1, 1, 1), block(0, 1, 3, 1));
    expect([0, 1, 2, 3].map((r) => cellText(at(r, 1)))).toEqual(['1', '2', '3', '4']);
  });

  it('a pattern of several cells repeats, to a side and upwards too', () => {
    const { table } = make(3, 5, { named: false });
    const at = (r, c) => gridOf(table).matrix[r][c];
    at(2, 0).textContent = 'a';
    at(2, 1).textContent = 'b';
    fillCells(table, block(2, 0, 2, 1), block(2, 0, 2, 4));
    expect(shape(table)[2]).toBe('a | b | a | b | a');
    fillCells(table, block(2, 0, 2, 4), block(0, 0, 2, 4));
    expect(shape(table)).toEqual(Array(3).fill('a | b | a | b | a'));
  });
});

describe('cells as rows of words', () => {
  it('a block is copied with a tab between cells', () => {
    const { table } = make(2, 3);
    table.rows[0].cells[1].innerHTML = 'two<br>lines';
    expect(toTsv(gridOf(table), block(0, 0, 1, 1))).toBe('0,0\ttwo lines\n1,0\t1,1');
    expect(fromTsv('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(fromTsv('only words\nin lines')).toBeNull();
  });

  it('pasted rows go one cell each, and the table grows where they would not fit', () => {
    const { table } = make(2, 2);
    expect(putRows(table, { r: 1, c: 1 }, [['x', 'y'], ['z']])).toEqual(block(1, 1, 2, 2));
    expect(shape(table)).toEqual(['0,0 | 0,1 | ', '1,0 | x | y', ' | z | ']);
    expect(colsOf(table).length).toBe(3);
  });

  it('a cell\'s words keep their lines', () => {
    const td = document.createElement('td');
    setCellText(td, 'one\n\ntwo');
    expect(td.innerHTML).toBe('one<br><br>two');
    expect(cellText(td)).toBe('one\n\ntwo');
    setCellText(td, '');
    expect(td.innerHTML).toBe('<br>');
  });
});

describe('what is drawn round a table is the screen\'s', () => {
  it('the numbering, the grips and the two + are drawn, and the note does not hold them', () => {
    const { host, wrap, table } = make(2, 3);
    const stored = host.innerHTML;
    expect(dressTable(wrap)).toBe(true);
    expect([...table.querySelectorAll('thead th.tbl-x')].map((th) => th.dataset.n)).toEqual(['x1', 'x2', 'x3']);
    expect([...table.querySelectorAll('tbody th.tbl-y')].map((th) => th.dataset.n)).toEqual(['y1', 'y2']);
    expect(table.querySelector('thead .tbl-corner')).not.toBeNull();
    expect(table.querySelectorAll('.tbl-colgrip').length).toBe(3);
    expect(wrap.querySelectorAll(':scope > .tbl-add').length).toBe(2);
    // The numbers are drawn by the stylesheet: no words of theirs are in the note's text.
    expect(wrap.textContent).toBe('0,00,10,21,01,11,2');
    expect(hasTransient(host)).toBe(true);
    expect(serializeNote(host)).toBe(stored);
    // Drawn again, it is the same drawing: a step taken back finds every node where it was.
    const drawn = host.innerHTML;
    refreshTables(host);
    expect(host.innerHTML).toBe(drawn);
    expect(gridOf(table).cols).toBe(3);
  });

  it('selected cells are not saved as selected', () => {
    const { host, wrap, table } = make(2, 2);
    const stored = host.innerHTML;
    dressTable(wrap);
    table.querySelectorAll('td')[0].classList.add('sel', 'act');
    table.querySelectorAll('td')[1].classList.add('fill', 'h-red');
    expect(serializeNote(host)).toBe(stored.replace('<td contenteditable="true">0,1', '<td contenteditable="true" class="h-red">0,1'));
  });

  it('a table from a file or a browser\'s copy is put right when it is drawn', () => {
    const host = document.createElement('div');
    host.innerHTML = sanitize('<div class="blk-table" style="color: red"><table style="width: 900px"><tbody><tr><td style="border: 1px solid">a</td><td colspan="2" onclick="x()">b</td></tr><tr><td></td></tr></tbody></table></div>');
    document.body.replaceChildren(host);
    refreshTables(host);
    const html = serializeNote(host);
    expect(html).toBe('<div class="blk-table" contenteditable="false" data-block-type="table"><table><colgroup><col style="width: 140px;"><col style="width: 140px;"><col style="width: 140px;"></colgroup><tbody>'
      + '<tr><td contenteditable="true">a</td><td colspan="2" contenteditable="true">b</td></tr>'
      + '<tr><td contenteditable="true"><br></td><td contenteditable="true"><br></td><td contenteditable="true"><br></td></tr></tbody></table></div>');
  });

  it('bringing a note up to this version leaves a table as it is', () => {
    const { host } = make(2, 2, { named: false });
    const stored = host.innerHTML;
    migrateNote(host);
    expect(host.innerHTML).toBe(stored);
    const healed = healHtml(stored);
    expect([healed.changed, healed.safe]).toEqual([false, true]);
  });
});

describe('a table among the other blocks', () => {
  it('is put after the caret\'s line, in place of an empty one, with the caret in its first cell', () => {
    const host = document.createElement('div');
    host.id = 'editor';
    host.setAttribute('contenteditable', 'true');
    host.innerHTML = '<p id="a">words</p><p id="b"><br></p>';
    document.body.replaceChildren(host);
    const caretIn = (el) => { const r = document.createRange(); r.setStart(el, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
    caretIn(host.querySelector('#a').firstChild);
    let pushed = 0;
    const first = insertTable(host, { push: () => { pushed += 1; } });
    expect(pushed).toBe(1);
    expect([...host.children].map((el) => el.id || el.className)).toEqual(['a', 'blk-table', 'b']);
    expect(getSelection().anchorNode.closest?.('td') ?? getSelection().anchorNode.parentElement.closest('td')).toBe(first.querySelector('td'));
    caretIn(host.querySelector('#b'));
    insertTable(host, null, { rows: 1, cols: 2 });
    expect([...host.children].map((el) => el.id || el.tagName + (el.className ? `.${el.className}` : ''))).toEqual(['a', 'DIV.blk-table', 'DIV.blk-table', 'P']);
    expect(host.lastElementChild.outerHTML).toBe('<p><br></p>');
    // A locked note takes none.
    host.dataset.readonly = 'true';
    expect(insertTable(host)).toBeNull();
  });

  it('is taken by its corner and moved as a picture is; a click beside it finds a line', () => {
    const { host, wrap } = make(1, 1);
    dressTable(wrap);
    expect(wrap.matches(DRAG_BLOCK)).toBe(true);
    expect(gripOf(wrap.querySelector('.tbl-corner'), 0)).toBe(wrap);
    expect(gripOf(wrap.querySelector('td'), 0)).toBeNull();
    expect(gripOf(wrap.querySelector('.tbl-add'), 0)).toBeNull();
    const box = (el, top) => { el.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 0, right: 600 }); };
    box(wrap, 100);
    box(host.lastElementChild, 150);
    host.lastElementChild.remove();
    expect(placeForClick(host, 300)).toEqual({ parent: host, before: null });
  });

  it('a highlight colour colours the back of the selected cells, and picked again takes it off', () => {
    const { host, wrap, table } = make(2, 2);
    let pushed = 0;
    const tables = initTables(host, { history: { push: () => { pushed += 1; } } });
    const family = ['h-yellow', 'h-red'];
    expect(hiliteCells(host, 'h-yellow', family)).toBe(false);          // nothing of a table is selected
    wrap.querySelector('th.tbl-y').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(tables.selection()).toEqual({ r0: 0, c0: 0, r1: 0, c1: 1, ranged: true });
    expect([...table.querySelectorAll('td.sel')].map((td) => td.textContent)).toEqual(['0,0', '0,1']);
    expect(hiliteCells(host, 'h-yellow', family)).toBe(true);
    expect(pushed).toBe(1);
    expect([...table.querySelectorAll('td.h-yellow')].map((td) => td.textContent)).toEqual(['0,0', '0,1']);
    hiliteCells(host, 'h-red', family);
    expect(table.querySelectorAll('td.h-yellow').length).toBe(0);
    expect(table.querySelectorAll('td.h-red').length).toBe(2);
    hiliteCells(host, 'h-red', family);
    expect(table.querySelectorAll('td[class*="h-"]').length).toBe(0);
    // The choices for a whole row: it can be merged, and it can go.
    expect([...wrap.querySelectorAll('.tbl-chip button')].map((b) => b.dataset.tbl)).toEqual(['merge', 'del-rows']);
    wrap.querySelector('.tbl-chip [data-tbl="merge"]').click();
    expect(shape(table)).toEqual(['0,0\n0,1 | ·', '1,0 | 1,1']);
    expect([...wrap.querySelectorAll('.tbl-chip button')].map((b) => b.dataset.tbl)).toEqual(['unmerge']);
    wrap.querySelector('.tbl-add-row').click();
    wrap.querySelector('.tbl-add-col').click();
    expect([gridOf(table).rows, gridOf(table).cols]).toEqual([3, 3]);
    expect([...table.querySelectorAll('th.tbl-y')].map((th) => th.dataset.n)).toEqual(['y1', 'y2', 'y3']);
    // A right-click on a cell: a row above or below it, a column at its left or right, its row or column gone.
    const at = (r, c) => gridOf(table).matrix[r][c];
    const offered = (target) => tables.menu(target)?.map((row) => row?.[0] ?? '—');
    expect(offered(at(1, 1))).toEqual(['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right', '—', 'Delete row', 'Delete column', 'Delete table']);
    expect(offered(at(0, 0))?.slice(-3)).toEqual(['Delete row', 'Delete columns', 'Delete table']);       // the merged cell is two columns wide
    expect(offered(wrap.querySelector('th.tbl-y'))).toEqual(['Insert row above', 'Insert row below', '—', 'Delete row']);
    expect(offered(wrap.querySelector('th.tbl-x'))).toEqual(['Insert column left', 'Insert column right', '—', 'Delete column']);
    expect(offered(wrap.querySelector('.tbl-corner'))).toEqual(['Delete table']);
    expect(tables.menu(host)).toBeNull();
    const pick = (target, label) => tables.menu(target).find((row) => row?.[0] === label)[1]();
    pick(at(1, 1), 'Insert row above');
    expect(shape(table)).toEqual(['0,0\n0,1 | · | ', ' |  | ', '1,0 | 1,1 | ', ' |  | ']);
    expect(tables.selection()).toEqual({ r0: 1, c0: 1, r1: 1, c1: 1, ranged: false });     // the caret in the new row, in the clicked cell's column
    pick(at(2, 0), 'Insert column right');
    expect(shape(table)).toEqual(['0,0\n0,1 | · | · | ', ' |  |  | ', '1,0 |  | 1,1 | ', ' |  |  | ']);   // the merged cell reaches over the new column
    expect(tables.selection()).toEqual({ r0: 2, c0: 1, r1: 2, c1: 1, ranged: false });
    pick(at(2, 1), 'Delete column');
    pick(at(1, 0), 'Delete row');
    expect(shape(table)).toEqual(['0,0\n0,1 | · | ', '1,0 | 1,1 | ', ' |  | ']);
    pick(at(2, 2), 'Insert row below');
    pick(at(0, 2), 'Insert column right');
    expect([gridOf(table).rows, gridOf(table).cols]).toEqual([4, 4]);
    // A click on the corner selects nothing (it is only taken to move the table); a right-click on it deletes the table.
    const before = tables.selection();
    wrap.querySelector('.tbl-corner').click();
    expect(tables.selection()).toEqual(before);
    expect(wrap.querySelector('.tbl-chip [data-tbl="del-table"]')).toBeNull();
    pick(wrap.querySelector('.tbl-corner'), 'Delete table');
    expect(host.querySelector('.blk-table')).toBeNull();
    expect(host.innerHTML).toBe('<p><br></p>');
  });
});

describe('a table leaving the note', () => {
  const note = '<div class="blk-table" data-block-type="table" contenteditable="false"><table><colgroup><col style="width: 140px;"><col style="width: 140px;"></colgroup><tbody>'
    + '<tr><td contenteditable="true">Name</td><td contenteditable="true"><b>Size</b></td></tr>'
    + '<tr><td contenteditable="true" colspan="2">a | b<br>c</td></tr></tbody></table></div>';

  it('is a table in Markdown: the first row heads it', () => {
    expect(toMarkdown(note)).toBe('| Name | **Size** |\n| --- | --- |\n| a \\| b<br>c |  |\n');
  });

  it('is a table in an HTML file, with nothing of the app\'s on it', () => {
    const html = toHtml(note, 'T');
    expect(html).toContain('<td colspan="2">a | b<br>c</td>');
    expect(html).not.toContain('contenteditable');
    expect(html).toContain('.blk-table td { border: 1px solid #ccc;');
  });
});

/**
 * The table trials (0.9.4). The owner: "test the table in different scenarios —
 * how could I make it go wrong? — and fix it so that it does not." What a hand
 * does is in tests/e2e/table-edges.mjs; here, the grid under any run of changes
 * and what the trials found.
 */
describe('a table that is hard to break', () => {
  /** What is wrong with a table's grid, in words: nothing, for a sound one. */
  const unsound = (table) => {
    const out = [];
    const grid = gridOf(table);
    if (grid.rows < 1 || grid.cols < 1) out.push(`${grid.rows} rows, ${grid.cols} columns`);
    const places = new Map();
    grid.matrix.forEach((row, r) => {
      for (let c = 0; c < grid.cols; c += 1) {
        const td = row[c];
        if (!td) { out.push(`no cell on ${r},${c}`); continue; }
        if (!places.has(td)) places.set(td, []);
        places.get(td).push([r, c]);
      }
    });
    for (const [td, at] of places) {
      const w = grid.where.get(td);
      if (!w) { out.push('a cell the grid does not know'); continue; }
      const want = [];
      for (let r = w.r; r < w.r + w.rs; r += 1) for (let c = w.c; c < w.c + w.cs; c += 1) want.push(`${r},${c}`);
      if (at.map((p) => p.join()).join(' ') !== want.join(' ')) out.push(`a cell on ${at.map((p) => p.join()).join(' ')} that says ${want.join(' ')}`);
      if (td.getAttribute('contenteditable') !== 'true') out.push('a cell that cannot be typed in');
      if (!td.firstChild) out.push('a cell with nothing to hold it open');
    }
    if (table.querySelectorAll('td').length !== places.size) out.push('a cell that stands on no place');
    const widths = colsOf(table).map((col) => Number.parseFloat(col.style.width));
    if (widths.length !== grid.cols) out.push(`${widths.length} widths for ${grid.cols} columns`);
    if (widths.some((w) => !(w >= MIN_COL))) out.push(`widths ${widths.join()}`);
    return out;
  };
  /** The same numbers every run. */
  const dice = (seed) => { let a = seed >>> 0; return (n) => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n); }; };

  it('is five rows of five cells when it is new', () => {
    expect([NEW_ROWS, NEW_COLS]).toEqual([5, 5]);
    const host = document.createElement('div');
    host.innerHTML = tableHtml();
    expect([...host.querySelectorAll('tr')].map((tr) => tr.cells.length)).toEqual([5, 5, 5, 5, 5]);
    expect(host.querySelectorAll('col').length).toBe(5);
    const editor = document.createElement('div');
    editor.id = 'editor';
    editor.innerHTML = '<p><br></p>';
    document.body.replaceChildren(editor);
    const wrap = insertTable(editor);
    expect([gridOf(wrap.querySelector('table')).rows, gridOf(wrap.querySelector('table')).cols]).toEqual([5, 5]);
    expect(wrap.querySelectorAll('th.tbl-x').length).toBe(5);
  });

  it('stays a whole grid through any run of merging, unmerging, rows and columns put in and taken out, filling and pasting', () => {
    for (let run = 0; run < 120; run += 1) {
      const roll = dice(run * 7919 + 13);
      const { wrap, table } = make(2 + roll(4), 2 + roll(4));
      dressTable(wrap);
      const done = [];
      for (let step = 0; step < 30; step += 1) {
        const grid = gridOf(table);
        const a = { r: roll(grid.rows), c: roll(grid.cols) };
        const b = { r: roll(grid.rows), c: roll(grid.cols) };
        const rect = rectOf(grid, a, b);
        const op = roll(9);
        if (op === 0) { mergeCells(table, rect); done.push(`merge ${Object.values(rect).join()}`); }
        else if (op === 1) { unmergeCells(table, rect); done.push(`unmerge ${Object.values(rect).join()}`); }
        else if (op === 2 && grid.rows < 9) { const at = roll(grid.rows + 1); insertRow(table, at); done.push(`row in ${at}`); }
        else if (op === 3 && grid.cols < 9) { const at = roll(grid.cols + 1); insertColumn(table, at); done.push(`column in ${at}`); }
        else if (op === 4 && rect.r1 - rect.r0 + 1 < grid.rows) { deleteRows(table, rect.r0, rect.r1); done.push(`rows out ${rect.r0}-${rect.r1}`); }
        else if (op === 5 && rect.c1 - rect.c0 + 1 < grid.cols) { deleteColumns(table, rect.c0, rect.c1); done.push(`columns out ${rect.c0}-${rect.c1}`); }
        else if (op === 6) {
          const to = fillTarget(rect, { r: roll(grid.rows), c: roll(grid.cols) });
          if (to) { fillCells(table, rect, to); done.push(`fill ${Object.values(rect).join()} to ${Object.values(to).join()}`); }
        } else if (op === 7 && grid.rows < 8 && grid.cols < 8) {
          putRows(table, a, [['p', 'q', 'r'], ['s', 't', 'u']]);
          done.push(`paste at ${a.r},${a.c}`);
        } else if (op === 8) {
          // As the note keeps it and shows it again.
          const kept = serializeNote(wrap.parentElement);
          wrap.parentElement.innerHTML = kept;
          done.push('saved and opened');
          const again = document.querySelector('.blk-table');
          dressTable(again);
          expect(unsound(again.querySelector('table')), `run ${run}: ${done.join(' · ')}`).toEqual([]);
          break;
        }
        dressTable(wrap);
        expect(unsound(table), `run ${run}: ${done.join(' · ')}`).toEqual([]);
        expect(wrap.querySelectorAll('th.tbl-x').length, `run ${run}: ${done.join(' · ')}`).toBe(gridOf(table).cols);
        expect(wrap.querySelectorAll('th.tbl-y').length).toBe(gridOf(table).rows);
        expect(serializeNote(wrap.parentElement)).not.toMatch(/tbl-|<th/);
      }
    }
  }, 120000);

  it('a table copied with the lines round it comes plain: no numbering, no +, no selection, no dress', () => {
    const { host, wrap, table } = make(2, 2);
    const tables = initTables(host, {});
    table.querySelector('td').style.textAlign = 'center';
    wrap.querySelector('th.tbl-y').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(tables.selection()?.ranged).toBe(true);
    // What Chromium puts on the clipboard: everything, with the styles of the screen written on it.
    wrap.style.cssText = 'position: relative; display: grid; width: max-content; color: rgb(237, 231, 247);';
    for (const td of table.querySelectorAll('td')) td.style.color = 'rgb(237, 231, 247)';
    const copied = `<p style="color: rgb(237, 231, 247);">above</p>${wrap.outerHTML}`;
    const clean = cleanNebulaHtml(copied);
    expect(clean).not.toMatch(/tbl-|<th|<thead|<button|class="(sel|act)|display: grid|rgb\(/);
    expect(clean).toContain('<td contenteditable="true" style="text-align: center;">0,0</td>');
    expect((clean.match(/<col style="width: 140px;">/g) ?? []).length).toBe(2);
    // And where it lands it is drawn once, not on top of what it was copied with.
    const page = document.createElement('div');
    page.innerHTML = copied;
    document.body.replaceChildren(page);
    refreshTables(page);
    const pasted = page.querySelector('.blk-table');
    expect([pasted.querySelectorAll('thead').length, pasted.querySelectorAll('.tbl-add').length, pasted.querySelectorAll('th.tbl-y').length, pasted.querySelectorAll('th.tbl-x').length]).toEqual([1, 2, 2, 2]);
    expect(pasted.hasAttribute('style')).toBe(false);
    expect(unsound(pasted.querySelector('table'))).toEqual([]);
    expect(serializeNote(page)).toContain('<td contenteditable="true" style="text-align: center;">0,0</td>');
  });

  it('a heading cell, a caption and a button in a table from elsewhere: cells stay, the rest goes', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="blk-table" data-ind="2">words<table><caption>c</caption><thead><tr><th>h</th></tr></thead><tbody><tr><th colspan="2">a</th></tr><tr><td data-ind="1" class="sel h-red">b</td><td>c</td></tr></tbody></table><button>x</button><p>after</p></div>';
    const table = plainTable(host.firstElementChild);
    expect(host.innerHTML).toBe('<div class="blk-table"><table><tbody><tr><td colspan="2">a</td></tr><tr><td class="h-red">b</td><td>c</td></tr></tbody></table></div>');
    expect(table).toBe(host.querySelector('table'));
    host.innerHTML = '<div class="blk-table"><p>no table here</p></div>';
    expect(plainTable(host.firstElementChild)).toBeNull();
  });

  it('a file keeps a column\'s width and the way a cell\'s words are lined up, and no other style', () => {
    const html = sanitize('<div class="blk-table"><table><colgroup><col style="width: 200px; background: red"><col style="width: 99999px"></colgroup><tbody><tr>'
      + '<td style="text-align: center; color: red">a</td><td style="text-align: left; position: fixed">b</td></tr></tbody></table></div>');
    expect(html).toContain('<col style="width: 200px;">');
    expect(html).toContain('<td style="text-align: center;">a</td>');
    expect(html).not.toMatch(/red|fixed|99999|text-align: left/);
  });

  it('the bar lines up the words of the caret\'s cell, or of the selected cells', () => {
    const { host, wrap, table } = make(2, 2);
    let pushed = 0;
    const tables = initTables(host, { history: { push: () => { pushed += 1; } } });
    const caretIn = (el) => { el.focus?.(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); };
    const cells = () => [...table.querySelectorAll('td')];
    host.insertAdjacentHTML('afterbegin', '<p id="line">a line</p>');
    caretIn(host.querySelector('#line'));
    expect(tableAt(host)).toBeNull();
    expect(alignCells(host, 'center')).toBe(false);                       // a line's, not a table's
    caretIn(cells()[3]);
    expect(tableAt(host)).toBe(wrap);
    expect(alignCells(host, 'right')).toBe(true);
    expect(cells().map(alignOf)).toEqual(['', '', '', 'right']);
    expect(pushed).toBe(1);
    alignCells(host, 'right');
    expect(pushed).toBe(1);                                               // as it was: no step to take back
    wrap.querySelector('th.tbl-y').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(alignCells(host, 'center')).toBe(true);
    expect(cells().map(alignOf)).toEqual(['center', 'center', '', 'right']);
    alignCells(host, 'left');
    expect(cells().slice(0, 2).map((td) => td.hasAttribute('style'))).toEqual([false, false]);
    // A merged cell keeps the first one's; the cells it gives back take it; a filled cell takes its source's.
    caretIn(cells()[3]);
    mergeCells(table, block(1, 0, 1, 1));
    unmergeCells(table, block(1, 0, 1, 1));
    expect(cells().map(alignOf)).toEqual(['', '', '', '']);
    cells()[0].style.textAlign = 'justify';
    fillCells(table, block(0, 0, 0, 0), block(0, 0, 1, 0));
    expect(cells().map(alignOf)).toEqual(['justify', '', 'justify', '']);
    dressTable(wrap);
    expect(cells().map(alignOf)).toEqual(['justify', '', 'justify', '']);   // drawn again, it is kept
    expect(tables.selection()).not.toBeNull();
  });

  it('Ctrl+A in a cell is its words, then the table\'s cells, then the note\'s', () => {
    const { host, wrap, table } = make(2, 2);
    const tables = initTables(host, {});
    const first = table.querySelector('td');
    const r = document.createRange();
    r.selectNodeContents(first);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    first.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const key = () => { const e = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }); first.dispatchEvent(e); return e.defaultPrevented; };
    expect(key()).toBe(true);
    expect(getSelection().toString()).toBe('0,0');
    expect(tables.selection()).toEqual({ r0: 0, c0: 0, r1: 0, c1: 0, ranged: false });
    expect(key()).toBe(true);
    expect(tables.selection()).toEqual({ r0: 0, c0: 0, r1: 1, c1: 1, ranged: true });
    expect(key()).toBe(false);                                            // the browser's own: the whole note
    expect(tables.selection()).toBeNull();
    expect(wrap.querySelectorAll('td.sel').length).toBe(0);
  });

  it('Tab with cells selected goes on from the first, and a right-click in them offers all their rows', () => {
    const { host, wrap, table } = make(3, 3);
    const tables = initTables(host, {});
    const heads = wrap.querySelectorAll('th.tbl-y');
    heads[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    heads[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true }));
    expect(tables.selection()).toEqual({ r0: 0, c0: 0, r1: 1, c1: 2, ranged: true });
    const at = (r, c) => gridOf(table).matrix[r][c];
    expect(tables.menu(at(1, 1)).map((row) => row?.[0] ?? '—')).toEqual(['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right', '—', 'Delete rows', 'Delete columns', 'Delete table']);
    expect(tables.menu(at(2, 2)).map((row) => row?.[0] ?? '—').slice(-3)).toEqual(['Delete row', 'Delete column', 'Delete table']);   // outside them: its own
    // The press of a right-click in them is not let through to move the caret.
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2 });
    at(1, 1).dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    const out = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2 });
    at(2, 2).dispatchEvent(out);
    expect(out.defaultPrevented).toBe(false);
    expect(tables.selection()?.ranged).toBe(true);
    at(0, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    at(0, 1).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(tables.selection()).toEqual({ r0: 0, c0: 1, r1: 0, c1: 1, ranged: false });
    expect(wrap.querySelectorAll('td.sel').length).toBe(0);
    tables.menu(at(0, 0)).find((row) => row?.[0] === 'Delete row')[1]();
    expect(shape(table)).toEqual(['1,0 | 1,1 | 1,2', '2,0 | 2,1 | 2,2']);
  });
});

/**
 * The owner's "urgent bugs" note (0.9.4): a table that lay over the column
 * beside it, a page pushed out to the side, the narrowest column too wide, no
 * size shown while a column is pulled, no size asked for a new table.
 */
describe('a table and the room it has', () => {
  /**
   * A page `room` wide; a table's block is as wide as its columns, the row numbers (30) and its own line (1).
   * The + for a column hangs out at its right and takes no room (the owner, 0.9.4: "let the right side of the
   * table be in line with the black line").
   */
  const lay = (host, wrap, room) => {
    Object.defineProperty(host, 'clientWidth', { configurable: true, get: () => room });
    Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => colsOf(wrap.querySelector('table')).reduce((sum, col) => sum + Number.parseFloat(col.style.width), 0) + 31 });
  };
  const drawn = (table) => colsOf(table).map((col) => Number.parseFloat(col.style.width));

  it('is drawn narrower where it would reach over the edge, and the note keeps its own widths', () => {
    const { host, wrap, table } = make(2, 5);
    dressTable(wrap);
    expect(drawn(table)).toEqual([140, 140, 140, 140, 140]);
    lay(host, wrap, 431);                                   // 400 for the columns: all of the page but the row numbers
    fitTable(wrap);
    expect(drawn(table)).toEqual([80, 80, 80, 80, 80]);
    expect(colsOf(table).map((col) => col.dataset.w)).toEqual(['140', '140', '140', '140', '140']);
    expect((serializeNote(host).match(/<col style="width: 140px;">/g) ?? []).length).toBe(5);
    expect(serializeNote(host)).not.toMatch(/data-w|80px/);
    // Drawn again — a step taken back, a note opened — it is fitted again from its own widths.
    dressTable(wrap);
    expect(drawn(table)).toEqual([80, 80, 80, 80, 80]);
    expect(colsOf(table)[0].dataset.w).toBe('140');
    // A copy of it is plain: the widths are its own.
    expect((cleanNebulaHtml(`<p class="c-red">x</p>${wrap.outerHTML}`).match(/<col style="width: 140px;">/g) ?? []).length).toBe(5);
    // With room again it is as wide as it was made.
    lay(host, wrap, 2000);
    fitTable(wrap);
    expect(drawn(table)).toEqual([140, 140, 140, 140, 140]);
    expect(colsOf(table).some((col) => col.hasAttribute('data-w'))).toBe(false);
  });

  it('a new table and a column more take the room there is; a column is never narrower than the narrowest', () => {
    expect(MIN_COL).toBe(24);
    const host = document.createElement('div');
    host.id = 'editor';
    host.innerHTML = '<p><br></p>';
    document.body.replaceChildren(host);
    Object.defineProperty(host, 'clientWidth', { configurable: true, get: () => 429 });
    const proto = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList?.contains('blk-table') ? colsOf(this.querySelector('table')).reduce((sum, col) => sum + Number.parseFloat(col.style.width), 0) + 31 : 0; } });
    try {
      const tables = initTables(host, {});
      const wrap = tables.insert({ rows: 2, cols: 4 });
      const table = wrap.querySelector('table');
      // 398 for the columns, shared to the last pixel: the table ends on the edge of the page, not short of it.
      expect(drawn(table)).toEqual([100, 100, 99, 99]);
      expect(colsOf(table).some((col) => col.hasAttribute('data-w'))).toBe(false);   // their own widths now
      wrap.querySelector('.tbl-add-col').click();
      expect(drawn(table).length).toBe(5);
      expect(drawn(table).reduce((a, b) => a + b, 0)).toBe(398);
      expect(Math.min(...drawn(table))).toBeGreaterThanOrEqual(MIN_COL);
      for (let i = 0; i < 20; i += 1) wrap.querySelector('.tbl-add-col').click();
      // Twenty-five columns of 24 are 600: more than there is room for, so they are drawn narrower still.
      expect(colsOf(table).map((col) => col.dataset.w).every((w) => w === '24')).toBe(true);
      expect(drawn(table).reduce((a, b) => a + b, 0)).toBeLessThan(398.01);
      expect((serializeNote(host).match(/<col style="width: 24px;">/g) ?? []).length).toBe(25);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', proto);
    }
  });

  it('a width is read in millimetres', () => {
    expect(millimetres(96)).toBe('25.4 mm');
    expect(millimetres(140)).toBe('37.0 mm');
    expect(millimetres(48)).toBe('12.7 mm');
  });

  it('the size of a new table is picked: the squares, the arrows, the two numbers; Enter makes it, Escape does not', async () => {
    document.body.replaceChildren();
    const anchor = { left: 10, top: 10, bottom: 30 };
    const key = (k, target = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    let picked = pickTableSize(anchor);
    let box = document.querySelector('.tbl-size');
    expect(box.querySelectorAll('.tbl-size__grid span').length).toBe(GRID_ROWS * GRID_COLS);
    expect([GRID_ROWS, GRID_COLS]).toEqual([8, 12]);                                  // the owner: "twelve boxes fit — 8x12"
    expect(box.querySelectorAll('.tbl-size__grid span.on').length).toBe(25);          // five by five to begin with
    expect([...box.querySelectorAll('input')].map((i) => i.value)).toEqual(['5', '5']);
    key('Enter');
    expect(await picked).toEqual({ rows: 5, cols: 5 });
    expect(document.querySelector('.tbl-size')).toBeNull();

    picked = pickTableSize(anchor);
    box = document.querySelector('.tbl-size');
    key('ArrowDown');
    key('ArrowRight');
    key('ArrowRight');
    expect(box.querySelectorAll('span.on').length).toBe(42);
    box.querySelector('span[data-r="3"][data-c="4"]').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect([...box.querySelectorAll('input')].map((i) => i.value)).toEqual(['3', '4']);
    box.querySelector('span[data-r="3"][data-c="4"]').click();
    expect(await picked).toEqual({ rows: 3, cols: 4 });

    picked = pickTableSize(anchor);
    box = document.querySelector('.tbl-size');
    const [rows, cols] = box.querySelectorAll('input');
    rows.value = '40';
    rows.dispatchEvent(new Event('input', { bubbles: true }));
    cols.value = '999';
    cols.dispatchEvent(new Event('input', { bubbles: true }));
    box.querySelector('.tbl-size__go').click();
    expect(await picked).toEqual({ rows: 40, cols: 60 });                          // no wider than sixty

    picked = pickTableSize(anchor);
    key('Escape');
    expect(await picked).toBeNull();
    picked = pickTableSize(anchor);
    const second = pickTableSize(anchor);                                          // opened again: the first is closed
    expect(await picked).toBeNull();
    expect(document.querySelectorAll('.tbl-size').length).toBe(1);
    key('x');                                                                      // a letter is the note's: this is in the way no longer
    expect(await second).toBeNull();
    expect(document.querySelector('.tbl-size')).toBeNull();
    for (const text of ['Rows', 'Columns', 'Insert', 'Drag to move the table']) expect(STRINGS[text], text).toHaveLength(3);
  });
});

/**
 * The owner (0.9.4), told that only a column's line could be pulled: "let the
 * height of a row be pulled too".
 */
describe('a row and the height it was pulled to', () => {
  const heights = (table) => rowsOf(table).map(heightOf);

  it('a row holds its height in pixels, no higher than the highest, and none at all is a row as high as its words', () => {
    const { table } = make(3, 2);
    const [a, b, c] = rowsOf(table);
    expect(heights(table)).toEqual([0, 0, 0]);
    setHeight(a, 60.4);
    setHeight(b, 5000);
    expect(a.getAttribute('style')).toBe('height: 60px;');
    expect(heights(table)).toEqual([60, MAX_ROW, 0]);
    setHeight(a, 0);
    expect(a.hasAttribute('style')).toBe(false);
    // Only pixels are a height of ours: a spreadsheet's points are not.
    c.setAttribute('style', 'height: 15pt');
    expect(heightOf(c)).toBe(0);
    // No lower than a column may be narrow: a cell can be a square, and no smaller.
    expect(MIN_ROW).toBe(MIN_COL);
    setHeight(a, 3);
    expect(a.getAttribute('style')).toBe(`height: ${MIN_ROW}px;`);
    c.setAttribute('style', 'height: 6px');
    expect(heightOf(c)).toBe(MIN_ROW);
  });

  it('is told to the stylesheet where the table is drawn — the room over and under a cell\'s words gives way to it — and a note never holds that', () => {
    const { host, wrap, table } = make(2, 2);
    const [a, b] = rowsOf(table);
    setHeight(a, 24);
    tellHeight(a);
    tellHeight(b);
    expect(a.getAttribute('style')).toBe('height: 24px; --row: 24px;');
    expect(b.hasAttribute('style')).toBe(false);                              // a row as high as its words has nothing to tell
    expect(heightOf(a)).toBe(24);
    expect(hasTransient(host)).toBe(true);
    expect(serializeNote(host)).toContain('<tr style="height: 24px;">');
    expect(serializeNote(host)).not.toMatch(/--row/);
    setHeight(a, heightOf(a));
    expect(a.getAttribute('style')).toBe('height: 24px;');
    // A copy, and a table drawn again, begin from the height alone.
    tellHeight(a);
    expect(cleanNebulaHtml(`<p>x</p>${wrap.outerHTML}`)).not.toMatch(/--row/);
    dressTable(wrap);
    expect(rowsOf(table).map((tr) => tr.getAttribute('style'))).toEqual(['height: 24px; --row: 24px;', null]);
    // A page written out draws the row as low as the note does.
    const page = toHtml(serializeNote(host), 'T');
    expect(page).toContain('<tr style="height: 24px; --row: 24px;">');
    expect(page).toMatch(/tr\[style\*="--row"\] > td \{ padding-top: clamp/);
  });

  it('stays with its row when a row is put in or taken out above it', () => {
    const { table } = make(3, 2);
    setHeight(rowsOf(table)[0], 50);
    setHeight(rowsOf(table)[2], 90);
    insertRow(table, 1);
    expect(heights(table)).toEqual([50, 0, 0, 90]);
    expect(shape(table)).toEqual(['0,0 | 0,1', ' | ', '1,0 | 1,1', '2,0 | 2,1']);
    insertRow(table, 0);
    addRow(table);
    expect(heights(table)).toEqual([0, 50, 0, 0, 90, 0]);
    deleteRows(table, 0, 1);
    expect(heights(table)).toEqual([0, 0, 90, 0]);
    expect(shape(table)).toEqual([' | ', '1,0 | 1,1', '2,0 | 2,1', ' | ']);
    // A merged cell that began in the row taken out and goes on under it stays, and so does the height under it.
    mergeCells(table, block(1, 0, 2, 0));
    deleteRows(table, 1, 1);
    expect(heights(table)).toEqual([0, 90, 0]);
    expect(shape(table)[1]).toBe('1,0\n2,0 | 2,1');
    deleteColumns(table, 0, 0);
    insertColumn(table, 0);
    expect(heights(table)).toEqual([0, 90, 0]);
  });

  it('is the note\'s: drawn again, saved, copied and read from a file it is kept — and nothing else of a row\'s dress is', () => {
    const { host, wrap, table } = make(2, 2);
    rowsOf(table)[1].setAttribute('style', 'height: 72px; background: red; display: none');
    dressTable(wrap);
    expect(rowsOf(table).map((tr) => tr.getAttribute('style'))).toEqual([null, 'height: 72px; --row: 72px;']);
    expect(table.querySelectorAll('th.tbl-y .tbl-rowgrip').length).toBe(2);
    const saved = serializeNote(host);
    expect(saved).toContain('<tr style="height: 72px;">');
    expect(saved).not.toMatch(/tbl-rowgrip|tbl-y/);
    expect(cleanNebulaHtml(`<p>x</p>${wrap.outerHTML}`)).toContain('<tr style="height: 72px;">');
    expect(sanitize(saved)).toContain('<tr style="height: 72px;">');
    expect(sanitize(saved.replace('72px', '72em'))).not.toMatch(/<tr style/);
    expect(sanitize(saved.replace('72px', '9000px'))).not.toMatch(/<tr style/);
    expect(sanitize(saved.replace('height: 72px;', 'height: 72px; position: fixed;'))).toContain('<tr style="height: 72px;">');
  });

  it('the line under a row\'s number is pulled: one step of history, down for higher, and up no lower than a column may be narrow', () => {
    const { host, wrap, table } = make(3, 2);
    let pushed = 0;
    let inputs = 0;
    host.addEventListener('input', () => { inputs += 1; });
    initTables(host, { history: { push: () => { pushed += 1; } } });
    const grip = wrap.querySelectorAll('.tbl-rowgrip')[1];
    const move = (y) => window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 5, clientY: y }));
    grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 100 }));
    expect(document.body.classList.contains('tbl-resizing-row')).toBe(true);
    expect(wrap.querySelector('.tbl-tip.tbl-tip-row')).not.toBeNull();
    expect(table.querySelectorAll('td.sel').length).toBe(0);                 // the press is the line's, not the number's
    expect(pushed).toBe(0);
    move(100);
    expect(pushed).toBe(0);                                                   // not moved yet
    move(140);
    move(164);
    expect(pushed).toBe(1);
    expect(heights(table)).toEqual([0, 64, 0]);
    expect(wrap.querySelector('.tbl-tip').dataset.label).toBe(millimetres(64));
    move(5000);
    expect(heights(table)).toEqual([0, MAX_ROW, 0]);
    move(40);                                                                 // as far up as it goes
    expect(heights(table)).toEqual([0, MIN_ROW, 0]);
    expect(wrap.querySelector('.tbl-tip').dataset.label).toBe(millimetres(MIN_ROW));
    move(130);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(heights(table)).toEqual([0, 30, 0]);
    expect(wrap.querySelector('.tbl-tip')).toBeNull();
    expect(document.body.classList.contains('tbl-resizing')).toBe(false);
    expect(document.body.classList.contains('tbl-resizing-row')).toBe(false);
    expect(inputs).toBe(1);
    expect(serializeNote(host)).toContain('<tr style="height: 30px;">');
  });

  it('a note that may not be changed has no line to pull', () => {
    const { host, wrap, table } = make(2, 2);
    initTables(host, { isLocked: () => true });
    wrap.querySelector('.tbl-rowgrip').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientY: 90 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(heights(table)).toEqual([0, 0]);
    expect(document.body.classList.contains('tbl-resizing')).toBe(false);
  });
});
