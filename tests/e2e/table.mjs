/**
 * 0.9.4 — tables, in the real app on a throwaway profile: made from the slash
 * menu, written in with the keys, selected with the mouse, coloured, merged,
 * filled from the corner, made wider and longer, moved, and saved as a plain
 * table with nothing of the screen's in it.
 *
 *   node tests/e2e/table.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cell = (text = '<br>', attrs = '') => `<td contenteditable="true"${attrs}>${text}</td>`;
const table = (rows) => '<div class="blk-table" data-block-type="table" contenteditable="false"><table>'
  + `<colgroup>${'<col style="width: 140px;">'.repeat(rows[0].length)}</colgroup><tbody>${rows.map((row) => `<tr>${row.map((text) => cell(text)).join('')}</tr>`).join('')}</tbody></table></div>`;

export async function runTableChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-table-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`),
    JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1, ...extra }));
  seed('other', '<p>another note</p>');
  seed('tbl', '<p id="t0">a line above</p><p id="t1"><br></p><p id="t2">a line below</p>');
  seed('move', `<p id="m0">first</p>${table([['a', 'b'], ['c', 'd']])}<p id="m1">second</p><p id="m2">third</p>`);
  seed('tlock', `<p id="q0">a locked note</p>${table([['a', 'b'], ['c', 'd']])}<p id="q1">under</p>`, { readOnly: true });

  /** The note's file, wherever this version keeps it. */
  const stored = (id) => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const file = walk(notes).find((f) => path.basename(f) === `${id}.json`);
    return file ? JSON.parse(fs.readFileSync(file, 'utf8')).content : null;
  };

  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 860));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());

    const open = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
      await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
      await win.waitForTimeout(200);
    };
    const box = (selector) => win.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
    }, selector);
    /** The cell on row r, column c of the note's first table (no merged cells before it in its row). */
    const td = (r, c) => `#editor .blk-table tbody tr:nth-child(${r + 1}) td:nth-of-type(${c + 1})`;
    /** The table as it is on the screen. */
    const state = () => win.evaluate(() => {
      const wrap = document.querySelector('#editor .blk-table');
      if (!wrap) return null;
      const sel = getSelection();
      const at = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
      const cells = [...wrap.querySelectorAll('tbody td')];
      return {
        rows: [...wrap.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((c) => c.innerText.replace(/\n$/, ''))),
        xs: [...wrap.querySelectorAll('thead th.tbl-x')].map((th) => getComputedStyle(th, '::before').content.replace(/"/g, '')),
        ys: [...wrap.querySelectorAll('tbody th.tbl-y')].map((th) => getComputedStyle(th, '::before').content.replace(/"/g, '')),
        sel: cells.filter((c) => c.classList.contains('sel')).map((c) => cells.indexOf(c)),
        act: cells.findIndex((c) => c.classList.contains('act')),
        caret: cells.indexOf(at?.closest('td') ?? null),
        collapsed: sel.isCollapsed,
        focus: cells.indexOf(document.activeElement),
        chip: [...wrap.querySelectorAll('.tbl-chip button')].map((b) => b.dataset.tbl),
        widths: [...wrap.querySelectorAll('colgroup col:not(.tbl-ui)')].map((col) => col.style.width),
        spans: cells.map((c) => `${c.getAttribute('colspan') ?? 1}x${c.getAttribute('rowspan') ?? 1}`).filter((s) => s !== '1x1'),
        colours: cells.map((c) => [...c.classList].filter((n) => n.startsWith('h-')).join('')),
      };
    });
    const order = () => win.evaluate(() => [...document.querySelectorAll('#editor > *')].filter((e) => !e.matches('.shape-layer, .image-layer')).map((e) => e.id || (e.classList.contains('blk-table') ? 'table' : e.tagName.toLowerCase())).join(','));
    const drag = async (from, to, { steps = 8 } = {}) => {
      await win.mouse.move(from.x, from.y);
      await win.mouse.down();
      await win.mouse.move(from.x + 3, from.y + 3);
      await win.mouse.move(to.x, to.y, { steps });
      await win.waitForTimeout(60);
      await win.mouse.up();
      await win.waitForTimeout(120);
    };
    const centre = async (selector) => { const b = await box(selector); return { x: b.cx, y: b.cy }; };
    const clickChip = async (act) => { const b = await box(`#editor .tbl-chip [data-tbl="${act}"]`); await win.mouse.click(b.cx, b.cy); await win.waitForTimeout(120); };
    const saved = async (id) => { await win.waitForTimeout(900); return stored(id); };

    // ---- made from the slash menu -------------------------------------------------
    await open('tbl');
    await win.click('#t1');
    await win.keyboard.type('/table');
    await win.waitForTimeout(150);
    await win.keyboard.press('Enter');
    await win.waitForTimeout(200);
    const asked = await win.evaluate(() => { const b = document.querySelector('.tbl-size'); return { open: !!b, on: b?.querySelectorAll('.tbl-size__grid span.on').length, numbers: [...(b?.querySelectorAll('input') ?? [])].map((i) => i.value).join('x'), table: !!document.querySelector('#editor .blk-table') }; });
    check('/table asks for the size first: five by five to begin with, and no table yet', asked.open && asked.on === 25 && asked.numbers === '5x5' && !asked.table, JSON.stringify(asked));
    await win.keyboard.press('Enter');
    await win.waitForTimeout(250);
    let s = await state();
    check('/table puts a table of five rows and five columns in place of the empty line', await order() === 't0,table,t2' && s?.rows.length === 5 && s.rows.every((row) => row.length === 5), `${await order()} ${JSON.stringify(s?.rows)}`);
    check('the columns are numbered x1… on top and the rows y1… at the left', s.xs.join() === 'x1,x2,x3,x4,x5' && s.ys.join() === 'y1,y2,y3,y4,y5', JSON.stringify([s.xs, s.ys]));
    check('and the caret is in its first cell', s.caret === 0 && s.focus === 0, JSON.stringify(s));
    // The rest is done on three rows of three: the last two columns and rows go, by their numbers.
    for (const [first, last, act] of [['#editor th.tbl-x:nth-of-type(5)', '#editor th.tbl-x:nth-of-type(6)', 'del-cols'], ['#editor tbody tr:nth-child(4) th.tbl-y', '#editor tbody tr:nth-child(5) th.tbl-y', 'del-rows']]) {
      const a = await centre(first);
      const b = await centre(last);
      await win.mouse.click(a.x, a.y);
      await win.keyboard.down('Shift');
      await win.mouse.click(b.x, b.y);
      await win.keyboard.up('Shift');
      await win.waitForTimeout(100);
      await clickChip(act);
    }
    s = await state();
    check('two columns and two rows selected by their numbers, with Shift, are deleted together', s.rows.length === 3 && s.rows.every((row) => row.length === 3) && s.xs.join() === 'x1,x2,x3' && s.ys.join() === 'y1,y2,y3', JSON.stringify(s));
    await win.click(td(0, 0));
    const numbers = await win.evaluate(() => {
      const x = document.querySelector('#editor th.tbl-x').getBoundingClientRect();
      const y = document.querySelector('#editor th.tbl-y').getBoundingClientRect();
      const c = document.querySelector('#editor .blk-table td').getBoundingClientRect();
      return { xOver: x.bottom <= c.top + 1 && Math.abs(x.left - c.left) < 2, yLeft: y.right <= c.left + 1 && Math.abs(y.top - c.top) < 2, wide: c.width };
    });
    check('the numbers stand over and beside the cells, each column 140 wide', numbers.xOver && numbers.yLeft && Math.abs(numbers.wide - 140) < 3, JSON.stringify(numbers));

    // ---- the keys -----------------------------------------------------------------
    await win.keyboard.type('one');
    await win.keyboard.press('Tab');
    await win.keyboard.type('two');
    await win.keyboard.press('Tab');
    await win.keyboard.press('Tab');
    await win.keyboard.type('four');
    s = await state();
    check('Tab steps to the next cell, over the end of a row too', s.rows[0].join('|') === 'one|two|' && s.rows[1][0] === 'four' && s.caret === 3, JSON.stringify(s.rows));
    await win.keyboard.press('Shift+Tab');
    await win.keyboard.press('Shift+Tab');
    await win.keyboard.type('!');
    s = await state();
    check('Shift+Tab steps back, the caret at the end of what the cell holds', s.rows[0][1] === 'two!' && s.caret === 1, JSON.stringify(s.rows));
    await win.keyboard.press('Enter');
    await win.keyboard.type('lines');
    s = await state();
    check('Enter is a new line in the cell', s.rows[0][1] === 'two!\nlines' && s.rows.length === 3 && s.caret === 1, JSON.stringify(s.rows));
    await win.keyboard.press('ArrowDown');
    await win.keyboard.type('under');
    s = await state();
    check('↓ on the last line of a cell goes to the cell under it', s.rows[1][1] === 'under', JSON.stringify(s.rows));
    await win.keyboard.press('ArrowUp');
    await win.keyboard.press('ArrowUp');
    s = await state();
    check('↑ goes up a cell, then up a line inside it', s.caret === 1 && s.rows[0][1] === 'two!\nlines', JSON.stringify(s));
    await win.keyboard.press('ArrowUp');
    await win.keyboard.type('^');
    check('↑ from the first row leaves the table for the line above', await win.evaluate(() => document.querySelector('#t0').textContent) === 'a line above^' && (await state()).act === -1, await win.evaluate(() => document.querySelector('#t0').textContent));
    await win.click(td(2, 2));
    await win.keyboard.press('Tab');
    await win.keyboard.type('new row');
    s = await state();
    check('Tab in the last cell makes a row', s.rows.length === 4 && s.rows[3][0] === 'new row' && s.ys.join() === 'y1,y2,y3,y4', JSON.stringify(s.rows));
    await win.keyboard.press('ArrowDown');
    await win.keyboard.type('v');
    check('↓ from the last row leaves the table for the line under it', await win.evaluate(() => document.querySelector('#t2').textContent) === 'va line below', await win.evaluate(() => document.querySelector('#t2').textContent));

    let note = await saved('tbl');
    check('the note holds a plain table: no numbering, no grips, nothing selected', !!note && note.includes('<td contenteditable="true">one</td>') && !/tbl-|<th|<thead|class="(sel|act)"/.test(note) && (note.match(/<col /g) ?? []).length === 3, note);

    // ---- typing is taken back with Ctrl+Z, and the table is drawn again -----------
    await win.click(td(2, 0));
    await win.keyboard.type('gone');
    await win.waitForTimeout(700);
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);
    s = await state();
    check('Ctrl+Z takes back what was typed in a cell, and the table is drawn as it was', s.rows[2][0] === '' && s.xs.join() === 'x1,x2,x3' && s.ys.length === 4 && s.focus === 6, JSON.stringify(s));
    await win.keyboard.type('kept');
    s = await state();
    check('and the caret is still in that cell', s.rows[2][0] === 'kept', JSON.stringify(s.rows));

    // ---- cells selected by pulling the mouse --------------------------------------
    await drag(await centre(td(1, 0)), await centre(td(2, 1)));
    s = await state();
    check('pulling from one cell to another selects the cells between them', s.sel.join() === '3,4,6,7' && s.act === 3, JSON.stringify(s));
    check('no words are selected, and the caret waits in the first of them', s.collapsed && s.caret === 3 && s.focus === 3, JSON.stringify(s));
    check('Merge is offered at the selection\'s lower right', s.chip.join() === 'merge', JSON.stringify(s.chip));
    const chipAt = await win.evaluate(() => {
      const chip = document.querySelector('#editor .tbl-chip').getBoundingClientRect();
      const last = document.querySelector('#editor .blk-table tbody tr:nth-child(3) td:nth-of-type(2)').getBoundingClientRect();
      const first = document.querySelector('#editor .blk-table tbody tr:nth-child(2) td:nth-of-type(1)').getBoundingClientRect();
      const square = document.querySelector('#editor .tbl-fill').getBoundingClientRect();
      return { under: chip.top >= last.bottom, right: Math.abs(chip.right - last.right) < 4, squareLeft: Math.abs((square.left + square.right) / 2 - first.left) < 3, squareLow: Math.abs((square.top + square.bottom) / 2 - last.bottom) < 3 };
    });
    check('under its right corner; the fill square is at its lower left', chipAt.under && chipAt.right && chipAt.squareLeft && chipAt.squareLow, JSON.stringify(chipAt));

    // ---- a highlight colour colours the selected cells ----------------------------
    await win.keyboard.press('Control+h');
    await win.waitForTimeout(120);
    s = await state();
    const tint = await win.evaluate(() => getComputedStyle(document.querySelectorAll('#editor .blk-table tbody td')[4]).backgroundColor);
    check('a highlight colours the back of the selected cells', [3, 4, 6, 7].every((i) => s.colours[i] === 'h-yellow') && s.colours.filter(Boolean).length === 4 && !/rgba\(0, 0, 0, 0\)|transparent/.test(tint), JSON.stringify([s.colours, tint]));
    await win.click(td(0, 0));
    await win.keyboard.press('Control+h');
    await win.waitForTimeout(120);
    s = await state();
    check('with only a caret in a cell, that cell', s.colours[0] === 'h-yellow' && s.colours.filter(Boolean).length === 5, JSON.stringify(s.colours));
    await win.keyboard.press('Control+h');
    await win.waitForTimeout(120);
    check('and the same colour again takes it off', (await state()).colours[0] === '', JSON.stringify((await state()).colours));
    await win.click(td(0, 0));
    await win.evaluate(() => {
      const text = document.querySelector('#editor .blk-table td').firstChild;
      const r = document.createRange();
      r.selectNodeContents(text);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.press('Control+h');
    await win.waitForTimeout(120);
    const worded = await win.evaluate(() => document.querySelector('#editor .blk-table td').innerHTML);
    check('words selected in a cell are highlighted as words, not the cell', /<span class="h-yellow">one<\/span>/.test(worded) && (await state()).colours[0] === '', worded);

    // ---- merge and unmerge --------------------------------------------------------
    await drag(await centre(td(1, 0)), await centre(td(2, 1)));
    await clickChip('merge');
    s = await state();
    check('Merge makes one cell of them, holding what they held', s.spans.join() === '2x2' && s.rows[1][0] === 'four\nunder\nkept' && s.colours[3] === 'h-yellow', JSON.stringify(s));
    check('and Unmerge is offered for it', s.chip.join() === 'unmerge' && s.act === 3, JSON.stringify(s));
    note = await saved('tbl');
    check('the note holds the merged cell as one cell', /<td contenteditable="true" class="h-yellow" colspan="2" rowspan="2">four<br>under<br>kept<\/td>/.test(note ?? ''), note);
    await clickChip('unmerge');
    s = await state();
    check('Unmerge gives the cells back, in the merged cell\'s colour', s.spans.length === 0 && s.rows[1].length === 3 && s.rows[2].length === 3 && [3, 4, 6, 7].every((i) => s.colours[i] === 'h-yellow') && s.sel.join() === '3,4,6,7', JSON.stringify(s));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);
    s = await state();
    check('Ctrl+Z merges them again', s.spans.join() === '2x2' && s.xs.length === 3, JSON.stringify(s));
    await win.keyboard.press('Control+y');
    await win.waitForTimeout(200);

    // ---- Delete empties the selected cells ----------------------------------------
    await drag(await centre(td(1, 0)), await centre(td(2, 1)));
    await win.keyboard.press('Delete');
    await win.waitForTimeout(100);
    s = await state();
    check('Delete empties the selected cells and leaves the others', s.rows[1].slice(0, 2).join('') === '' && s.rows[2].slice(0, 2).join('') === '' && s.rows[0][1] === 'two!\nlines' && s.rows[3][0] === 'new row', JSON.stringify(s.rows));

    // ---- carried on from the lower-left square ------------------------------------
    await win.click(td(0, 2));
    await win.keyboard.type('1');
    await win.keyboard.press('ArrowDown');
    await win.keyboard.type('2');
    await drag(await centre(td(0, 2)), await centre(td(1, 2)));
    let square = await centre('#editor .tbl-fill');
    await drag(square, await centre(td(3, 2)));
    s = await state();
    check('the square pulled down carries a run of numbers on', s.rows.map((row) => row[2]).join() === '1,2,3,4' && s.sel.join() === '2,5,8,11', JSON.stringify(s));
    await win.click(td(3, 0));
    square = await centre('#editor .tbl-fill');
    await drag(square, await centre(td(3, 1)));
    s = await state();
    check('pulled to the side from one cell, it copies the cell', s.rows[3].slice(0, 2).join() === 'new row,new row', JSON.stringify(s.rows));

    // ---- a column made wider -------------------------------------------------------
    const grip = await centre('#editor th.tbl-x:nth-of-type(2) .tbl-colgrip');
    const before = await box('#editor .blk-table > table');
    await drag(grip, { x: grip.x + 60, y: grip.y });
    s = await state();
    const after = await box('#editor .blk-table > table');
    check('the line at a column\'s right is pulled to make it wider', s.widths.join() === '200px,140px,140px' && Math.abs(after.width - before.width - 60) < 3, JSON.stringify([s.widths, before.width, after.width]));
    await drag({ x: grip.x + 60, y: grip.y }, { x: grip.x - 400, y: grip.y });
    check('and no narrower than a letter or two', (await state()).widths[0] === '24px', JSON.stringify((await state()).widths));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);
    check('Ctrl+Z gives it its width back', (await state()).widths[0] === '200px', JSON.stringify((await state()).widths));

    // ---- one more row, one more column ---------------------------------------------
    await win.hover(td(0, 0));
    let plus = await centre('#editor .tbl-add-row');
    await win.mouse.click(plus.x, plus.y);
    await win.waitForTimeout(120);
    plus = await centre('#editor .tbl-add-col');
    await win.mouse.click(plus.x, plus.y);
    await win.waitForTimeout(120);
    s = await state();
    const plusAt = await win.evaluate(() => {
      const t = document.querySelector('#editor .blk-table > table').getBoundingClientRect();
      const row = document.querySelector('#editor .tbl-add-row').getBoundingClientRect();
      const col = document.querySelector('#editor .tbl-add-col').getBoundingClientRect();
      return { rowUnder: row.top >= t.bottom - 1 && row.top < t.bottom + 12, colRight: col.left >= t.right - 1 && col.left < t.right + 12 };
    });
    check('the + along the bottom adds a row, the + at the right a column', s.rows.length === 5 && s.rows.every((row) => row.length === 4) && s.xs.join() === 'x1,x2,x3,x4' && s.ys.at(-1) === 'y5' && s.widths.length === 4, JSON.stringify(s));
    check('they stand under the table and at its right', plusAt.rowUnder && plusAt.colRight, JSON.stringify(plusAt));

    // ---- a column or a row by its number -------------------------------------------
    let head = await centre('#editor th.tbl-x:nth-of-type(5)');
    await win.mouse.click(head.x, head.y);
    await win.waitForTimeout(100);
    s = await state();
    check('a press on x4 selects the fourth column', s.sel.join() === '3,7,11,15,19' && s.chip.join() === 'merge,del-cols', JSON.stringify(s));
    await clickChip('del-cols');
    s = await state();
    check('Delete column takes it away', s.rows.every((row) => row.length === 3) && s.xs.join() === 'x1,x2,x3' && s.widths.length === 3, JSON.stringify(s));
    head = await centre('#editor tbody tr:nth-child(5) th.tbl-y');
    await win.mouse.click(head.x, head.y);
    await win.waitForTimeout(100);
    await clickChip('del-rows');
    s = await state();
    check('a press on y5, then Delete row, takes the row away', s.rows.length === 4 && s.ys.join() === 'y1,y2,y3,y4', JSON.stringify(s));

    // ---- cells as rows of words: copied and pasted ---------------------------------
    await drag(await centre(td(0, 2)), await centre(td(1, 2)));
    await win.keyboard.press('Control+c');
    await win.waitForTimeout(150);
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    check('Ctrl+C on selected cells copies them as rows of words', copied.replace(/\r/g, '') === '1\n2', JSON.stringify(copied));
    await app.evaluate(({ clipboard }) => clipboard.writeText('p\tq\r\nr\ts'));
    await win.click(td(2, 0));
    await win.keyboard.press('Control+v');
    await win.waitForTimeout(250);
    s = await state();
    check('rows of words pasted in a cell go one cell each from there', s.rows[2].slice(0, 2).join() === 'p,q' && s.rows[3].slice(0, 2).join() === 'r,s' && s.rows.length === 4, JSON.stringify(s.rows));
    await app.evaluate(({ clipboard }) => clipboard.writeText('plain words'));
    await win.click(td(1, 1));
    await win.keyboard.press('Control+v');
    await win.waitForTimeout(250);
    s = await state();
    check('plain words pasted in a cell are typed there', s.rows[1][1] === 'plain words' && await order() === 't0,table,t2', JSON.stringify(s.rows));

    // ---- the whole table: selected by its corner, and deleted ----------------------
    const corner = await centre('#editor .tbl-corner');
    await win.click(td(0, 0));
    await win.mouse.click(corner.x, corner.y);
    await win.waitForTimeout(120);
    s = await state();
    check('a click on the corner selects nothing and offers nothing', s.sel.length === 0 && s.chip.length === 0, JSON.stringify(s));
    await win.click(td(1, 1));
    await win.keyboard.press('Control+a');
    await win.keyboard.press('Control+a');
    await win.waitForTimeout(120);
    s = await state();
    check('Ctrl+A twice in a cell selects the whole table', s.sel.length === 12 && s.chip.includes('del-table'), JSON.stringify(s));
    await clickChip('del-table');
    check('Delete table takes it out of the note, the caret on a line', await order() === 't0,t2' && await win.evaluate(() => !!getSelection().anchorNode && document.querySelector('#t2').contains(getSelection().anchorNode)), await order());
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(250);
    s = await state();
    check('and Ctrl+Z brings it back, drawn', await order() === 't0,table,t2' && s?.xs.join() === 'x1,x2,x3' && s.rows.length === 4, JSON.stringify(s));

    // ---- the toolbar's button -------------------------------------------------------
    await win.click('#t2');
    await win.keyboard.press('End');
    await win.evaluate(() => document.querySelector('#toolbar [data-act="table"]').click());
    await win.waitForTimeout(200);
    await win.keyboard.press('Enter');
    await win.waitForTimeout(250);
    check('the bar\'s Table button puts one under the caret\'s line', /^t0,table,t2,table,p$/.test(await order()), await order());
    const newer = await win.evaluate(() => { const w = document.querySelectorAll('#editor .blk-table')[1]; return { rows: w.querySelectorAll('tbody tr').length, cells: w.querySelectorAll('tbody td').length }; });
    check('five rows of five cells again', newer.rows === 5 && newer.cells === 25, JSON.stringify(newer));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);

    // ---- moved by its corner, as a picture is --------------------------------------
    await open('move');
    check('a table in a note that is opened is drawn', (await state())?.xs.join() === 'x1,x2' && await order() === 'm0,table,m1,m2', JSON.stringify(await state()));
    // ---- a right-click: a row or a column put in beside the cell ------------------
    const rightClick = async (selector) => {
      const p = await centre(selector);
      await win.mouse.click(p.x, p.y, { button: 'right' });
      await win.waitForFunction(() => !document.getElementById('ctx-menu')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
      return win.evaluate(() => (document.getElementById('ctx-menu').hidden ? [] : [...document.querySelectorAll('#ctx-menu > button')].map((b) => b.textContent)));
    };
    const pick = async (label) => { await win.evaluate((l) => [...document.querySelectorAll('#ctx-menu > button')].find((b) => b.textContent === l)?.click(), label); await win.waitForTimeout(150); };
    let offered = await rightClick(td(0, 1));
    check('a right-click in a cell offers a row above or below, a column left or right, and deleting them — over the pastes', offered.join('|') === 'Insert row above|Insert row below|Insert column left|Insert column right|Delete row|Delete column|Delete table|Cut|Copy|Paste as Nebula format|Paste original format|Select all', offered.join('|'));
    await pick('Insert column left');
    await win.keyboard.type('new');
    s = await state();
    check('Insert column left puts a column in between, the caret in it beside the clicked cell', s.rows.join('|') === 'a,new,b|c,,d' && s.xs.join() === 'x1,x2,x3' && s.widths.length === 3 && s.caret === 1, JSON.stringify(s));
    await rightClick(td(0, 0));
    await pick('Insert row below');
    s = await state();
    check('Insert row below puts a row in between', s.rows.join('|') === 'a,new,b|,,|c,,d' && s.ys.join() === 'y1,y2,y3' && s.caret === 3, JSON.stringify(s));
    note = await saved('move');
    check('and the note holds them as plain rows and cells', (note?.match(/<tr>/g) ?? []).length === 3 && (note.match(/<col /g) ?? []).length === 3 && !/tbl-/.test(note), note);
    offered = await rightClick('#editor tbody tr:nth-child(2) th.tbl-y');
    check('a right-click on a row\'s number offers that row\'s choices alone', offered.join('|') === 'Insert row above|Insert row below|Delete row', offered.join('|'));
    await pick('Delete row');
    offered = await rightClick('#editor th.tbl-x:nth-of-type(3)');
    check('and on a column\'s number that column\'s', offered.join('|') === 'Insert column left|Insert column right|Delete column', offered.join('|'));
    await pick('Delete column');
    s = await state();
    check('Delete row and Delete column take them away again', s.rows.join('|') === 'a,b|c,d' && s.xs.join() === 'x1,x2' && s.ys.join() === 'y1,y2', JSON.stringify(s));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(150);
    check('one Ctrl+Z brings the column back', (await state()).rows.join('|') === 'a,new,b|c,,d', JSON.stringify((await state()).rows));
    await win.keyboard.press('Control+y');
    await win.waitForTimeout(150);

    offered = await rightClick('#editor .tbl-corner');
    check('a right-click on the corner offers Delete table alone', offered.join('|') === 'Delete table', offered.join('|'));
    await win.keyboard.press('Escape');
    const from = await centre('#editor .tbl-corner');
    const m2 = await box('#m2');
    await win.mouse.move(from.x, from.y);
    await win.mouse.down();
    await win.mouse.move(from.x + 12, from.y + 12);
    await win.mouse.move(m2.left + 40, m2.bottom + 6, { steps: 8 });
    await win.waitForTimeout(80);
    const marked = await win.evaluate(() => { const m = document.querySelector('.drop-mark'); return !!m && !m.hidden; });
    await win.mouse.up();
    await win.waitForTimeout(150);
    s = await state();
    check('taken by its corner, a mark shows where it will lie, and it moves there', marked && /^m0,m1,m2,table/.test(await order()) && s.rows.join('|') === 'a,b|c,d' && s.sel.length === 0, `${marked} ${await order()} ${JSON.stringify(s)}`);
    const gap = await box('#editor .blk-table');
    await win.mouse.click(gap.right + 120, gap.top + 30);
    await win.waitForTimeout(120);
    check('a click beside a table finds a line, or makes one', await win.evaluate(() => { const n = getSelection().anchorNode; const el = n?.nodeType === 1 ? n : n?.parentElement; return !!el?.closest('#editor p'); }), await order());
    await open('other');
    await open('move');
    note = stored('move');
    check('the moved table is saved, plain, and drawn again when the note is opened', /<p id="m2">third<\/p><div class="blk-table"/.test(note ?? '') && !/tbl-/.test(note) && (await state())?.ys.join() === 'y1,y2', note);

    // ---- a locked note --------------------------------------------------------------
    await open('tlock');
    const lockedNote = stored('tlock');
    await win.click(td(0, 0));
    await win.keyboard.type('zzz');
    await win.keyboard.press('Tab');
    await win.keyboard.press('Tab');
    await win.keyboard.press('Tab');
    await win.keyboard.press('Tab');
    await drag(await centre(td(0, 0)), await centre(td(1, 1)));
    s = await state();
    const shown = await win.evaluate(() => ({ plus: getComputedStyle(document.querySelector('#editor .tbl-add-row')).display, square: !!document.querySelector('#editor .tbl-fill') }));
    await win.keyboard.press('Delete');
    await win.keyboard.press('Control+h');
    await win.waitForTimeout(150);
    const lockedNow = await state();
    check('in a locked note a table is read: its cells can be selected, and nothing changes it', s.sel.length === 4 && s.chip.length === 0 && shown.plus === 'none' && !shown.square
      && lockedNow.rows.join('|') === 'a,b|c,d' && lockedNow.colours.join('') === '' && (await saved('tlock')) === lockedNote, JSON.stringify([s, shown, lockedNow]));

    const p = await centre(td(1, 1));
    await win.mouse.click(p.x, p.y, { button: 'right' });
    await win.waitForTimeout(400);
    check('and a right-click offers no row or column there', await win.evaluate(() => ![...document.querySelectorAll('#ctx-menu > button')].some((b) => /Insert|Delete/.test(b.textContent))), await win.evaluate(() => document.getElementById('ctx-menu').textContent));
    await win.keyboard.press('Escape');

    check('no page errors in the table checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  let passed = 0;
  await runTableChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (ok) passed += 1; else failed += 1; });
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
