/**
 * 0.9.4 — a table that is hard to break. The owner: "test the table in
 * different scenarios — how could I make it go wrong? — and fix it so that it
 * does not." Everything here is what a hand does to a table that table.mjs
 * does not: the bar's buttons with the caret in a cell, the keys that mean
 * something else on a line, selections that begin outside and end inside,
 * copies, undo, merged cells with rows put in through them, another table
 * dropped on it. After each, the table is looked over whole (`audit`).
 *
 *   node tests/e2e/table-edges.mjs          (after npm run build)
 *   node tests/e2e/table-edges.mjs --look   (prints what each step left, for reading)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOOK = process.argv.includes('--look');
const cell = (text = '<br>') => `<td contenteditable="true">${text}</td>`;
const table = (rows) => '<div class="blk-table" data-block-type="table" contenteditable="false"><table>'
  + `<colgroup>${'<col style="width: 140px;">'.repeat(rows[0].length)}</colgroup><tbody>${rows.map((row) => `<tr>${row.map((text) => cell(text)).join('')}</tr>`).join('')}</tbody></table></div>`;
const ABC = [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']];
const NOTE = `<p id="p0">above line</p>${table(ABC)}<p id="p1">below line</p>`;
const FLAT = 'a,b,c|d,e,f|g,h,i';

/** Every table of the note looked over: what is wrong with it, in words. Runs in the page. */
function auditPage() {
  const bad = [];
  const ed = document.getElementById('editor');
  const BLOCKY = 'p, div, h1, h2, h3, h4, h5, h6, ul, ol, li, table, hr, pre, blockquote, details, .link-block, .note-image, .blk-code, .blk-cols, .blk-toggle, .blk-todo';
  for (const el of ed.querySelectorAll('.tbl-ui, td, tr, tbody, thead, table, colgroup, col, th')) {
    if (!el.closest('.blk-table')) bad.push(`outside a table: ${el.tagName.toLowerCase()}.${el.className}`);
  }
  ed.querySelectorAll('.blk-table').forEach((wrap, i) => {
    const say = (m) => bad.push(`table ${i}: ${m}`);
    if (wrap.getAttribute('contenteditable') !== 'false') say('the block can be typed in');
    if (wrap.hasAttribute('data-ind') || wrap.hasAttribute('style')) say(`the block is dressed: ${wrap.getAttribute('data-ind') ?? ''} ${wrap.getAttribute('style') ?? ''}`);
    const host = wrap.parentElement;
    if (!(host === ed || host.matches('.toggle-body, .blk-col'))) say(`stands in ${host.tagName.toLowerCase()}.${host.className}`);
    const kids = [...wrap.children].map((e) => e.tagName.toLowerCase() + (e.className ? `.${e.className.split(' ').join('.')}` : ''));
    const tbl = wrap.querySelector(':scope > table');
    if (!tbl) { say(`no table in it: ${kids.join(' ')}`); return; }
    if ([...wrap.children].filter((e) => !e.classList.contains('tbl-ui')).length !== 1) say(`holds more than its table: ${kids.join(' ')}`);
    if (wrap.querySelectorAll(':scope > .tbl-add').length !== 2) say(`${wrap.querySelectorAll(':scope > .tbl-add').length} + buttons`);
    for (const n of wrap.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) say('words beside the table');
    const parts = [...tbl.children].map((e) => e.tagName).join(',');
    if (parts !== 'COLGROUP,THEAD,TBODY') say(`made of ${parts}`);
    const trs = [...(tbl.tBodies[0]?.children ?? [])];
    const cols = [...tbl.querySelectorAll(':scope > colgroup > col:not(.tbl-ui)')];
    const M = trs.map(() => []);
    let overlap = false;
    trs.forEach((tr, r) => {
      if (tr.tagName !== 'TR') say('not a row in the body');
      const cs = [...tr.children];
      if (!cs[0]?.matches('th.tbl-ui.tbl-y')) say(`row ${r} has no number`);
      let c = 0;
      for (const td of cs.slice(1)) {
        if (td.tagName !== 'TD') { say(`row ${r} holds a ${td.tagName.toLowerCase()}`); continue; }
        if (td.getAttribute('contenteditable') !== 'true') say('a cell cannot be typed in');
        if (td.hasAttribute('data-ind')) say('a cell is indented');
        if (td.querySelector(BLOCKY)) say(`a block in a cell: ${td.innerHTML.slice(0, 90)}`);
        if (!td.firstChild) say(`row ${r}: a cell with nothing to hold it open`);
        while (M[r][c]) c += 1;
        const rs = Number(td.getAttribute('rowspan')) || 1;
        const span = Number(td.getAttribute('colspan')) || 1;
        for (let a = 0; a < rs; a += 1) {
          for (let b = 0; b < span; b += 1) {
            if (!M[r + a]) { say('a cell reaches under the last row'); continue; }
            if (M[r + a][c + b]) overlap = true;
            M[r + a][c + b] = td;
          }
        }
        c += span;
      }
    });
    if (overlap) say('two cells on one place');
    const wide = Math.max(0, ...M.map((row) => row.length));
    M.forEach((row, r) => { for (let c = 0; c < wide; c += 1) if (!row[c]) say(`no cell on ${r},${c}`); });
    if (!trs.length || !wide) say('no rows or no columns');
    if (cols.length !== wide) say(`${cols.length} widths for ${wide} columns`);
    if (tbl.querySelectorAll('thead th.tbl-x').length !== wide) say('the x numbers do not match the columns');
    // Drawn narrower than its own width where the page has no room for it, but never to nothing.
    for (const col of cols) if (!(Number.parseFloat(col.style.width) >= 4) || (col.dataset.w && !(Number(col.dataset.w) >= 24)) || (!col.dataset.w && !(Number.parseFloat(col.style.width) >= 24))) say(`a column ${col.style.width} wide (${col.dataset.w ?? 'its own'})`);
    for (const tr of trs) if (tr.getBoundingClientRect().height < 20) say(`a row ${Math.round(tr.getBoundingClientRect().height)}px high`);
    for (const td of tbl.querySelectorAll('td')) if (td.scrollWidth > td.clientWidth + 1) say(`words run out of a cell: ${td.textContent.slice(0, 30)}`);
    const act = wrap.querySelectorAll('td.act').length;
    if (act > 1) say(`${act} cells stood in`);
  });
  return bad;
}

export async function runTableEdgeChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-table-edges-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`),
    JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1, ...extra }));
  const SPARE = 90;
  for (let i = 0; i < SPARE; i += 1) seed(`e${String(i).padStart(2, '0')}`, NOTE);
  seed('blank', '<p id="b0"><br></p>');
  seed('two', `<p id="w0">first</p>${table([['a', 'b'], ['c', 'd']])}<p id="w1">between</p>${table([['k', 'l'], ['m', 'n']])}<p id="w2">last</p>`);
  seed('top', `${table([['a', 'b'], ['c', 'd']])}`);
  seed('cols', '<p id="c0">over</p><div class="blk-cols" data-split="50" style="--split: 50%"><div class="blk-col"><p id="c1"><br></p></div><hr class="blk-vr"><div class="blk-col"><p id="c2">right side</p></div></div><p id="c3">under</p>');
  for (const id of ['size1', 'size2', 'size3']) seed(id, '<p id="z0"><br></p>');
  // The owner's "urgent bugs" note, second round (0.9.4): a table, a video and a picture, each at the top of a
  // column with an empty line over it; a table as wide as all the room there is, under a divider.
  const PIC = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#bbb"/></svg>')}`;
  const PICTURE = `<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" data-ratio="2" style="width: 200px;"><img src="${PIC}" alt="x" draggable="false"><figcaption class="image-caption" data-placeholder="Caption" contenteditable="true"></figcaption></figure>`;
  const VIDEO = '<div class="link-block link-embed link-file" contenteditable="false" data-block-type="link" data-kind="file" data-name="v.mp4" style="width: 200px;"><a class="link-card"><span class="link-card__kind">Video</span><strong class="link-card__title">v.mp4</strong></a><video class="link-frame" controls="" preload="metadata"></video></div>';
  const SMALL = table([['a', 'b'], ['c', 'd']]);
  seed('three', `<hr class="blk-hr"><div class="blk-cols" data-split="30,64" style="--split: 30%;"><div class="blk-col"><p id="g1"><br></p>${SMALL}<p id="g1b"><br></p></div><hr class="blk-vr">`
    + `<div class="blk-col" style="--w: 34%;"><p id="g2"><br></p>${VIDEO}<p id="g2b"><br></p></div><hr class="blk-vr"><div class="blk-col"><p id="g3"><br></p>${PICTURE}<p id="g3b"><br></p></div></div><p id="g4">under</p>`);
  seed('lone', '<p id="o0">over</p><div class="blk-cols" data-split="50" style="--split: 50%"><div class="blk-col"><p id="o1"><br></p></div><hr class="blk-vr"><div class="blk-col"><p id="o2">word</p><p id="o3">more</p></div></div>');
  for (const [id, block] of [['toptable', SMALL], ['topvideo', VIDEO], ['toppicture', PICTURE], ['toppicture2', PICTURE]]) seed(id, `<p id="t1"><br></p>${block}<p id="t2">under</p>`);
  seed('overtable', `<p id="d0">above</p><p id="d1"><br></p>${SMALL}<p id="d2">under</p>`);
  seed('overvideo', `<p id="d0">above</p><p id="d1"><br></p>${VIDEO}<p id="d2">under</p>`);
  seed('line', `<hr class="blk-hr"><div class="blk-table" data-block-type="table" contenteditable="false"><table><colgroup>${'<col style="width: 140px;">'.repeat(16)}</colgroup><tbody>${`<tr>${cell().repeat(16)}</tr>`.repeat(2)}</tbody></table></div><p id="n1"><br></p>`);
  seed('host', '<p id="h0">before</p><div class="blk-toggle" data-open="true"><p>title</p><div class="toggle-body"><p id="h1"><br></p></div></div><p id="h2">after</p>');

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
      await win.waitForTimeout(160);
    };
    let spare = 0;
    let current = '';
    /** A note nobody has touched: a line, a table of a…i, a line. */
    const fresh = async () => { current = `e${String(spare).padStart(2, '0')}`; spare += 1; if (spare > SPARE) throw new Error('no spare note left'); await open(current); };
    const box = (selector) => win.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
    }, selector);
    const centre = async (selector) => { const b = await box(selector); if (!b) throw new Error(`nothing at ${selector}`); return { x: b.cx, y: b.cy }; };
    const td = (r, c, n = 1) => `#editor .blk-table:nth-of-type(${n}) tbody tr:nth-child(${r + 1}) td:nth-of-type(${c + 1})`;
    const cellAt = (r, c) => `#editor .blk-table tbody tr:nth-child(${r + 1}) td:nth-of-type(${c + 1})`;
    const audit = () => win.evaluate(auditPage);
    /** The note as a hand sees it. */
    const look = () => win.evaluate(() => {
      const ed = document.getElementById('editor');
      const sel = getSelection();
      const at = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
      const tables = [...ed.querySelectorAll('.blk-table')].map((wrap) => {
        const cells = [...wrap.querySelectorAll('tbody td')];
        return {
          flat: [...wrap.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((c) => c.innerText.replace(/\n$/, '')).join(',')).join('|'),
          sel: cells.filter((c) => c.classList.contains('sel')).map((c) => cells.indexOf(c)),
          act: cells.findIndex((c) => c.classList.contains('act')),
          caret: cells.indexOf(at?.closest('td') ?? null),
          spans: cells.map((c, i) => `${i}:${c.getAttribute('colspan') ?? 1}x${c.getAttribute('rowspan') ?? 1}`).filter((s) => !s.endsWith(':1x1')),
          chip: [...wrap.querySelectorAll('.tbl-chip button')].map((b) => b.dataset.tbl),
          html: cells.map((c) => c.innerHTML),
          align: cells.map((c) => c.style.textAlign).join(','),
        };
      });
      return {
        order: [...ed.children].filter((e) => !e.matches('.shape-layer, .image-layer')).map((e) => e.id || (e.classList.contains('blk-table') ? 'table' : e.tagName.toLowerCase() + (e.className ? `.${e.className.split(' ')[0]}` : ''))).join(','),
        t: tables[0] ?? null,
        tables,
        text: [...ed.children].filter((e) => !e.matches('.shape-layer, .image-layer, .blk-table')).map((e) => e.innerText.replace(/\n$/, '')).join('|'),
        collapsed: sel.isCollapsed,
        inCell: !!at?.closest?.('.blk-table td'),
        focusIn: !!document.activeElement?.closest?.('#editor'),
      };
    });
    const drag = async (from, to, { steps = 8 } = {}) => {
      await win.mouse.move(from.x, from.y);
      await win.mouse.down();
      await win.mouse.move(from.x + 3, from.y + 3);
      await win.mouse.move(to.x, to.y, { steps });
      await win.waitForTimeout(60);
      await win.mouse.up();
      await win.waitForTimeout(120);
    };
    const press = async (...keys) => { for (const key of keys) { await win.keyboard.press(key); await win.waitForTimeout(25); } await win.waitForTimeout(90); };
    const type = async (text) => { await win.keyboard.type(text); await win.waitForTimeout(90); };
    const clickChip = async (act) => { const b = await box(`#editor .tbl-chip [data-tbl="${act}"]`); if (!b) throw new Error(`no ${act} offered`); await win.mouse.click(b.cx, b.cy); await win.waitForTimeout(120); };
    const rightClick = async (selector) => {
      const p = await centre(selector);
      await win.mouse.click(p.x, p.y, { button: 'right' });
      await win.waitForFunction(() => !document.getElementById('ctx-menu')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    };
    const pick = async (label) => { await win.evaluate((l) => [...document.querySelectorAll('#ctx-menu > button')].find((b) => b.textContent === l)?.click(), label); await win.waitForTimeout(160); };
    /** Words and their markup on the clipboard, as a copy from a page puts them. */
    const copyRich = (text, html) => win.evaluate(async ([t, h]) => {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([t], { type: 'text/plain' }), 'text/html': new Blob([h], { type: 'text/html' }) })]);
    }, [text, html]);
    const caretAt = (selector, atEnd) => win.evaluate(([s, end]) => {
      const el = document.querySelector(s);
      document.getElementById('editor').focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(!end);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    }, [selector, atEnd]);

    /**
     * One thing done to a table and what must be true after it.
     * @param {string} name
     * @param {() => Promise<void>} act
     * @param {(l: Awaited<ReturnType<typeof look>>) => boolean} [expect] beside the table being whole
     */
    const scene = async (name, act, expect = () => true) => {
      let thrown = '';
      try { await act(); } catch (e) { thrown = String(e?.message ?? e).split('\n')[0]; }
      await win.waitForTimeout(60);
      const bad = await audit();
      const l = await look();
      let ok = false;
      try { ok = !thrown && !bad.length && !!expect(l); } catch (e) { thrown = String(e?.message ?? e); }
      const brief = JSON.stringify({ thrown: thrown || undefined, bad: bad.length ? bad : undefined, order: l.order, flat: l.t?.flat, text: l.text, sel: l.t?.sel, caret: l.t?.caret, spans: l.t?.spans, inCell: l.inCell });
      if (LOOK) console.log(`  · ${name}\n      ${brief}`);
      check(name, ok, brief);
      return l;
    };
    const whole = (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT && l.text === 'above line|below line';

    // ---- the bar's buttons with the caret in a cell --------------------------------
    for (const act of ['ul', 'ol', 'todo', 'toggle', 'indent', 'outdent']) {
      await fresh();
      await scene(`the bar's "${act}" with the caret in a cell leaves the table a table`, async () => {
        await win.click(cellAt(1, 1));
        await win.evaluate((a) => document.querySelector(`#toolbar [data-act="${a}"]`).click(), act);
        await win.waitForTimeout(150);
        await type('x');
      }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT.replace('e', 'ex') && l.text === 'above line|below line');
    }
    for (const kind of ['h1', 'h2', 'h3', 'blockquote']) {
      await fresh();
      await scene(`the outline's "${kind}" with the caret in a cell leaves the table a table`, async () => {
        await win.click(cellAt(1, 1));
        await win.evaluate((k) => { const s = document.getElementById('tb-outline'); s.value = k; s.dispatchEvent(new Event('change', { bubbles: true })); }, kind);
        await win.waitForTimeout(150);
        await type('x');
      }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT.replace('e', 'ex'));
    }
    for (const act of ['divider', 'codeblock', 'table']) {
      await fresh();
      await scene(`the bar's "${act}" with the caret in a cell goes under the table, not into it`, async () => {
        await win.click(cellAt(1, 1));
        await win.evaluate((a) => document.querySelector(`#toolbar [data-act="${a}"]`).click(), act);
        await win.waitForTimeout(250);
        if (act === 'table') { await press('Enter'); await win.waitForTimeout(200); }   // its size: five by five
      }, (l) => l.order.startsWith('p0,table,') && l.tables[0].flat === FLAT && l.order !== 'p0,table,p1' && l.order.endsWith('p1'));
      await scene(`and Ctrl+Z takes "${act}" back`, async () => {
        await win.evaluate(() => document.querySelector('#toolbar [data-act="undo"]').click());
        await win.waitForTimeout(200);
      }, (l) => l.t.flat === FLAT && l.tables.length === 1 && !/hr|blk-code/.test(l.order));
    }
    for (const act of ['bold', 'italic', 'underline', 'strike', 'code', 'color']) {
      await fresh();
      await scene(`"${act}" on words selected in a cell dresses the words`, async () => {
        await win.click(cellAt(1, 1));
        await press('Control+a');
        await win.evaluate((a) => document.querySelector(`#toolbar [data-act="${a}"]`).click(), act);
        await win.waitForTimeout(150);
      }, (l) => whole(l) && l.t.html[4] !== 'e');
    }
    for (const [act, want] of [['ac', 'center'], ['ar', 'right'], ['aj', 'justify'], ['al', '']]) {
      await fresh();
      await scene(`"${act}" with the caret in a cell lines that cell's words up`, async () => {
        await win.click(cellAt(1, 1));
        if (act === 'al') { await win.evaluate(() => document.querySelector('#toolbar [data-act="ac"]').click()); await win.waitForTimeout(100); }
        await win.evaluate((a) => document.querySelector(`#toolbar [data-act="${a}"]`).click(), act);
        await win.waitForTimeout(150);
      }, (l) => whole(l) && l.t.align === `,,,,${want},,,,`);
    }
    await fresh();
    await scene('with cells selected, centring lines all of them up', async () => {
      await drag(await centre(cellAt(0, 0)), await centre(cellAt(1, 1)));
      await win.evaluate(() => document.querySelector('#toolbar [data-act="ac"]').click());
      await win.waitForTimeout(150);
    }, (l) => whole(l) && l.t.align === 'center,center,,center,center,,,,');
    await scene('and it is kept in the note, and by a reopening', async () => {
      await win.waitForTimeout(900);
      await open('blank');
      await open(current);
    }, (l) => whole(l) && l.t.align === 'center,center,,center,center,,,,' && /<td contenteditable="true" style="text-align: center;">a<\/td>/.test(stored(current) ?? ''));
    await fresh();
    await scene('with cells selected, the bar\'s list and to-do do nothing to them', async () => {
      await drag(await centre(cellAt(0, 0)), await centre(cellAt(1, 1)));
      for (const act of ['ul', 'todo', 'toggle', 'indent']) { await win.evaluate((a) => document.querySelector(`#toolbar [data-act="${a}"]`).click(), act); await win.waitForTimeout(90); }
    }, whole);

    // ---- what the keys mean on a line, typed in a cell -----------------------------
    for (const words of ['# ', '## ', '- ', '* ', '1. ', '[] ', '[ ] ', '> ', '>> ', '--- ', '``` ', '$$ ', '**b** ', '`c` ', '==m== ', 'www.example.com ', '#tag ', '@', '[[', '/']) {
      await fresh();
      await scene(`"${words}" typed in an empty cell stays words in the cell`, async () => {
        await win.click(cellAt(1, 1));
        await press('Backspace');
        await type(words);
        await press('Escape');
      }, (l) => l.order === 'p0,table,p1' && l.t.flat.startsWith('a,b,c|d,') && l.t.flat.endsWith(',f|g,h,i') && l.inCell);
    }
    for (const words of ['---', '```', '- x', '1. x', '# x', '> x', '[] x']) {
      await fresh();
      await scene(`"${words}" and Enter in a cell is a new line in the cell`, async () => {
        await win.click(cellAt(1, 1));
        await press('Backspace');
        await type(words);
        await press('Enter');
        await type('z');
      }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT.replace('e', `${words}\nz`));
    }

    // ---- the keys that take things away --------------------------------------------
    await fresh();
    await scene('Backspace and Delete held in an empty cell take nothing but that', async () => {
      await win.click(cellAt(1, 1));
      await press('Backspace', 'Backspace', 'Backspace', 'Backspace', 'Delete', 'Delete', 'Delete', 'Control+Backspace', 'Control+Delete');
    }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT.replace('e', '') && l.t.caret === 4);
    await scene('and what is typed then is in that cell, which is as high as it was', async () => { await type('back'); },
      (l) => l.t.flat === FLAT.replace('e', 'back'));
    await fresh();
    await scene('Backspace at the start of a cell and Delete at its end do not reach its neighbours', async () => {
      await win.click(cellAt(1, 1));
      await press('Home', 'Backspace', 'Backspace', 'End', 'Delete', 'Delete');
    }, whole);
    await fresh();
    await scene('Ctrl+A in a cell selects that cell\'s words, and typing writes over them only', async () => {
      await win.click(cellAt(1, 1));
      await press('Control+a');
      await type('new');
    }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT.replace('e', 'new') && l.text === 'above line|below line');
    await fresh();
    await scene('Ctrl+A again selects every cell of the table, and Delete empties them: the table stays', async () => {
      await win.click(cellAt(1, 1));
      await press('Control+a', 'Control+a');
    }, (l) => whole(l) && l.t.sel.length === 9);
    await scene('emptied, it is a table of empty cells between its two lines', async () => { await press('Delete'); },
      (l) => l.order === 'p0,table,p1' && l.t.flat === ',,|,,|,,' && l.text === 'above line|below line');
    await fresh();
    await scene('in an empty cell the first Ctrl+A is the table\'s cells already', async () => {
      await win.click(cellAt(1, 1));
      await press('Backspace', 'Control+a');
    }, (l) => l.t.sel.length === 9);
    await scene('a third Ctrl+A is the whole note, as on a line: a letter then writes over all of it', async () => {
      await press('Control+a');
      await type('W');
    }, (l) => !l.t && l.text === 'W');
    await scene('and Ctrl+Z brings the note back, its table drawn', async () => { await press('Control+z'); await win.waitForTimeout(200); },
      (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT.replace('e', ''));
    await fresh();
    await scene('Shift and the arrows from a cell do not select into another', async () => {
      await win.click(cellAt(1, 1));
      await press('Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+End', 'Shift+Control+End');
      await type('Q');
    }, (l) => l.order === 'p0,table,p1' && /^a,b,c\|d,e?Q,f\|g,h,i$/.test(l.t.flat));
    await fresh();
    await scene('Home, End, Page Up and Page Down in a cell leave the table alone', async () => {
      await win.click(cellAt(1, 1));
      await press('Home', 'End', 'Control+Home', 'Control+End', 'PageUp', 'PageDown');
    }, whole);
    await fresh();
    await scene('three clicks in a cell and a letter write over that cell only', async () => {
      const p = await centre(cellAt(1, 1));
      await win.mouse.click(p.x, p.y, { clickCount: 3 });
      await win.waitForTimeout(100);
      await type('T');
    }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT.replace('e', 'T') && l.text === 'above line|below line');

    // ---- Tab with cells selected ---------------------------------------------------
    await fresh();
    await scene('Tab with cells selected steps on, and nothing stays selected behind it', async () => {
      await drag(await centre(cellAt(0, 0)), await centre(cellAt(1, 1)));
      await press('Tab');
      await type('t');
      await press('Delete');
    }, (l) => l.t.flat === 'a,bt,c|d,e,f|g,h,i' && l.t.sel.length === 0 && l.t.act === 1 && l.t.caret === 1);
    await fresh();
    await scene('typing with cells selected goes into the first, and Delete then takes a letter, not the cells', async () => {
      await drag(await centre(cellAt(0, 1)), await centre(cellAt(1, 2)));
      await type('yz');
      await press('Backspace');
    }, (l) => l.t.flat === 'a,by,c|d,e,f|g,h,i' && l.t.sel.length === 0);
    await fresh();
    await scene('Enter with cells selected is a line in the first, Escape lets them go', async () => {
      await drag(await centre(cellAt(0, 0)), await centre(cellAt(2, 2)));
      await press('Escape');
      await press('Delete');
    }, (l) => l.t.sel.length === 0 && l.t.flat.endsWith('|d,e,f|g,h,i'));

    // ---- from the lines around the table -------------------------------------------
    await fresh();
    await scene('Backspace at the start of the line under a table does not join the line into it', async () => {
      await caretAt('#p1', false);
      await press('Backspace');
      await type('K');
    }, (l) => l.t?.flat === FLAT && l.text.includes('above line') && /K/.test(l.text) && !/K/.test(l.t.flat));
    await fresh();
    await scene('Delete at the end of the line over a table does not pull the table\'s words up', async () => {
      await caretAt('#p0', true);
      await press('Delete');
      await type('K');
    }, (l) => l.t?.flat === FLAT && l.text.startsWith('above lineK'));
    await fresh();
    await scene('Shift+↓ from the line over a table and a letter: the table goes whole or stays whole', async () => {
      await caretAt('#p0', false);
      await press('Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowDown');
      await type('R');
    }, (l) => !l.t || l.t.flat === FLAT);
    await scene('and Ctrl+Z gives back what was there', async () => { await press('Control+z', 'Control+z'); }, whole);
    await fresh();
    await scene('a pull of the mouse from the line over a table into a cell, and Delete: whole or gone', async () => {
      const from = await box('#p0');
      await drag({ x: from.left + 30, y: from.cy }, await centre(cellAt(1, 1)));
      await press('Delete');
    }, (l) => !l.t || l.t.flat === FLAT);
    await fresh();
    await scene('a pull from a cell out to the line under the table selects cells, and Delete empties them only', async () => {
      const to = await box('#p1');
      await drag(await centre(cellAt(1, 1)), { x: to.left + 60, y: to.cy });
      await press('Delete');
    }, (l) => l.order === 'p0,table,p1' && l.text === 'above line|below line' && l.t.flat === 'a,b,c|,,f|,,i');
    await fresh();
    await scene('Shift and a click in a cell with the caret on a line outside selects no half table', async () => {
      await caretAt('#p0', false);
      const p = await centre(cellAt(1, 1));
      await win.keyboard.down('Shift');
      await win.mouse.click(p.x, p.y);
      await win.keyboard.up('Shift');
      await win.waitForTimeout(100);
      await type('S');
    }, (l) => !l.t || /^a,b,c\|d,(e|S|eS|Se),f\|g,h,i$/.test(l.t.flat));
    await fresh();
    await scene('Ctrl+A on a line and Delete take the table with the lines, and Ctrl+Z brings it back drawn', async () => {
      await caretAt('#p0', false);
      await press('Control+a', 'Delete');
      await win.waitForTimeout(150);
      await press('Control+z');
      await win.waitForTimeout(200);
    }, whole);

    // ---- copied with the lines around it -------------------------------------------
    await fresh();
    await scene('a table copied with the lines around it', async () => {
      await caretAt('#p0', false);
      await press('Control+a', 'Control+c');
      await win.waitForTimeout(200);
    }, whole);
    await open('blank');
    await scene('is a table where it is pasted: drawn once, with its cells', async () => {
      await win.click('#b0');
      await press('Control+v');
      await win.waitForTimeout(500);
    }, (l) => l.tables.length === 1 && l.t.flat === FLAT);
    await scene('and the note it is pasted in holds it plain', async () => { await win.waitForTimeout(900); },
      () => { const n = stored('blank') ?? ''; return n.includes('blk-table') && !/tbl-|<th|<thead|<button/.test(n) && (n.match(/<td /g) ?? []).length === 9; });
    await fresh();
    await scene('cells copied and pasted on a line outside leave no loose cells there', async () => {
      await drag(await centre(cellAt(0, 0)), await centre(cellAt(1, 1)));
      await press('Control+c');
      await win.waitForTimeout(150);
      await caretAt('#p1', true);
      await press('Control+v');
      await win.waitForTimeout(400);
    }, (l) => l.tables[0].flat === FLAT);

    // ---- pasted from the right-click menu ------------------------------------------
    for (const label of ['Paste as Nebula format', 'Paste original format']) {
      await fresh();
      await scene(`"${label}" from a right-click in a cell puts no block into the cell`, async () => {
        await win.click(cellAt(1, 1));
        await copyRich('Head\none\ntwo', '<h1>Head</h1><ul><li>one</li><li>two</li></ul><table><tr><td>x</td></tr></table><p>tail</p>');
        await rightClick(cellAt(1, 1));
        await pick(label);
        await win.waitForTimeout(400);
      }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT.replace('e', 'eHead\none\ntwo') && l.text === 'above line|below line');
    }
    await fresh();
    await scene('a table from another page pasted on a line leaves no loose cells in the note', async () => {
      await caretAt('#p1', true);
      await copyRich('x\ty', '<table><tbody><tr><th>x</th><td>y</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>');
      await press('Control+v');
      await win.waitForTimeout(400);
    }, (l) => l.tables[0].flat === FLAT && /x/.test(l.text));
    await fresh();
    await scene('the bar\'s Paste with the caret in a cell puts no block into the cell', async () => {
      await win.click(cellAt(1, 1));
      await copyRich('Head\none', '<h1>Head</h1><ul><li>one</li></ul>');
      await win.evaluate(() => document.querySelector('#toolbar [data-act="paste"]').click());
      await win.waitForTimeout(400);
    }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT.replace('e', 'eHead\none') && l.text === 'above line|below line');

    // ---- merged cells --------------------------------------------------------------
    await fresh();
    await scene('a whole row merged, then a column put in through it and a row under it', async () => {
      await drag(await centre(cellAt(1, 0)), await centre(cellAt(1, 2)));
      await clickChip('merge');
      await rightClick(cellAt(0, 1));
      await pick('Insert column left');
      await rightClick(cellAt(1, 0));
      await pick('Insert row below');
    }, (l) => l.t.flat === 'a,,b,c|d\ne\nf|,,,|g,,h,i' && l.t.spans.join() === '4:4x1');
    await scene('Tab walks every cell of it and the last Tab makes a row', async () => {
      await win.click(cellAt(0, 0));
      for (let i = 0; i < 13; i += 1) await press('Tab');
      await type('end');
    }, (l) => l.t.flat.endsWith('|g,,h,i|end,,,'));
    await scene('undone step by step and done again, it is the same table', async () => {
      for (let i = 0; i < 8; i += 1) await press('Control+z');
      for (let i = 0; i < 8; i += 1) await press('Control+y');
    }, (l) => l.t.flat.endsWith('|g,,h,i|end,,,') && l.t.spans.join() === '4:4x1');
    await fresh();
    await scene('every cell merged into one, then a row and a column put in beside it', async () => {
      await win.click(cellAt(1, 1));
      await press('Control+a', 'Control+a');
      await clickChip('merge');
      await rightClick(cellAt(0, 0));
      await pick('Insert row below');
      await rightClick(cellAt(0, 0));
      await pick('Insert column right');
    }, (l) => l.t.spans.join() === '0:3x3' && l.t.flat.split('|').length === 4);
    await scene('its rows deleted by a right-click one after the other end with no table', async () => {
      for (let i = 0; i < 4; i += 1) {
        if (!(await box(cellAt(0, 0)))) break;
        await rightClick(cellAt(0, 0));
        await pick((await win.evaluate(() => [...document.querySelectorAll('#ctx-menu > button')].map((b) => b.textContent).find((x) => /^Delete rows?$/.test(x)))));
      }
    }, (l) => l.order === 'p0,p1' || (l.t && l.t.flat.length >= 0));
    await fresh();
    await scene('a column merged top to bottom, its neighbour deleted, then unmerged', async () => {
      await drag(await centre(cellAt(0, 1)), await centre(cellAt(2, 1)));
      await clickChip('merge');
      await rightClick(cellAt(0, 0));
      await pick('Delete column');
      await win.click(cellAt(0, 0));
      await clickChip('unmerge');
    }, (l) => l.t.flat === 'b\ne\nh,c|,f|,i' && l.t.spans.length === 0);
    await fresh();
    await scene('a merged cell deleted through: the row it begins on goes, it stays with its words', async () => {
      await drag(await centre(cellAt(0, 0)), await centre(cellAt(1, 1)));
      await clickChip('merge');
      const y = await centre('#editor tbody tr:nth-child(1) th.tbl-y');
      await win.mouse.click(y.x, y.y, { button: 'right' });
      await win.waitForFunction(() => !document.getElementById('ctx-menu')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
      await pick('Delete row');
    }, (l) => l.t.flat === 'a\nb\nd\ne,f|g,h,i' && l.t.spans.join() === '0:2x1');
    await fresh();
    await scene('a right-click on selected rows deletes all of them', async () => {
      const y1 = await centre('#editor tbody tr:nth-child(1) th.tbl-y');
      const y2 = await centre('#editor tbody tr:nth-child(2) th.tbl-y');
      await drag(y1, y2);
      await win.mouse.click(y1.x, y1.y);
      await win.keyboard.down('Shift');
      await win.mouse.click(y2.x, y2.y);
      await win.keyboard.up('Shift');
      await win.waitForTimeout(100);
      await rightClick(cellAt(1, 1));
      await pick('Delete rows');
    }, (l) => l.t.flat === 'g,h,i');

    // ---- one table on another ------------------------------------------------------
    await open('two');
    await scene('a table pulled by its corner onto another table lands beside it, not in it', async () => {
      const from = await centre('#editor .blk-table .tbl-corner');
      const to = await win.evaluate(() => { const r = document.querySelectorAll('#editor .blk-table')[1].querySelector('tbody tr:nth-child(2) td').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 12 }; });
      await win.mouse.move(from.x, from.y);
      await win.mouse.down();
      await win.mouse.move(from.x + 12, from.y + 12);
      await win.mouse.move(to.x, to.y, { steps: 10 });
      await win.waitForTimeout(80);
      await win.mouse.up();
      await win.waitForTimeout(200);
    }, (l) => l.tables.length === 2 && l.tables.map((t) => t.flat).sort().join(' ') === 'a,b|c,d k,l|m,n');
    await scene('and a table dropped on itself stays where it is', async () => {
      const from = await centre('#editor .blk-table .tbl-corner');
      const to = await centre('#editor .blk-table tbody tr:nth-child(2) td:nth-of-type(2)');
      await win.mouse.move(from.x, from.y);
      await win.mouse.down();
      await win.mouse.move(from.x + 12, from.y + 12);
      await win.mouse.move(to.x, to.y, { steps: 6 });
      await win.mouse.up();
      await win.waitForTimeout(200);
    }, (l) => l.tables.length === 2);
    await scene('cells of one table and then of the other: only one has cells selected', async () => {
      const a = await win.evaluate(() => [...document.querySelectorAll('#editor .blk-table')].map((w) => { const f = w.querySelector('tbody tr:nth-child(1) td:nth-of-type(1)').getBoundingClientRect(); const t = w.querySelector('tbody tr:nth-child(2) td:nth-of-type(2)').getBoundingClientRect(); return [{ x: f.left + 20, y: f.top + 12 }, { x: t.left + 20, y: t.top + 12 }]; }));
      await drag(a[0][0], a[0][1]);
      await drag(a[1][0], a[1][1]);
    }, (l) => l.tables[0].sel.length === 0 && l.tables[1].sel.length === 4);
    await scene('a pull that begins in one table and ends over the other selects in the first only', async () => {
      const a = await win.evaluate(() => [...document.querySelectorAll('#editor .blk-table')].map((w) => { const f = w.querySelector('tbody tr:nth-child(1) td:nth-of-type(1)').getBoundingClientRect(); return { x: f.left + 20, y: f.top + 12 }; }));
      await drag(a[0], a[1]);
      await press('Delete');
    }, (l) => l.tables[1].flat.replace(/[,|]/g, '').length === 4 && l.tables[1].sel.length === 0);

    // ---- in a toggle's body --------------------------------------------------------
    await open('host');
    await scene('a table made in a toggle\'s body stands in the body', async () => {
      await win.click('#h1');
      await type('/table');
      await win.waitForTimeout(150);
      await press('Enter');
      await win.waitForTimeout(200);
      await press('Enter');
      await win.waitForTimeout(200);
      await type('in');
    }, (l) => l.tables.length === 0 || true);
    await scene('and it is a whole table there', async () => {}, () => true);
    const hosted = await win.evaluate(() => { const w = document.querySelector('#editor .blk-table'); return { host: w?.parentElement?.className, first: w?.querySelector('td')?.textContent }; });
    check('in the toggle\'s body, with what was typed in its first cell', hosted.host === 'toggle-body' && hosted.first === 'in', JSON.stringify(hosted));

    // ---- alone in a note, and in a column ------------------------------------------
    await open('top');
    await scene('a table that is the first thing of a note: ↑ from its first row makes a line over it', async () => {
      await win.click(cellAt(0, 0));
      await press('ArrowUp');
      await type('over');
    }, (l) => l.order === 'p,table' && l.text === 'over' && l.t.flat === 'a,b|c,d');
    await scene('and ↓ from its last row a line under it', async () => {
      await win.click(cellAt(1, 1));
      await press('ArrowDown');
      await type('under');
    }, (l) => l.order === 'p,table,p' && l.text === 'over|under' && l.t.flat === 'a,b|c,d');
    await scene('again, the lines that are there are gone to, and no more are made', async () => {
      await win.click(cellAt(0, 0));
      await press('ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown');
    }, (l) => l.order === 'p,table,p' && l.text === 'over|under');
    await open('cols');
    await scene('a table made in a column is no wider than its column', async () => {
      await win.click('#c1');
      await type('/table');
      await win.waitForTimeout(150);
      await press('Enter');
      await win.waitForTimeout(250);
      await press('Enter');
      await win.waitForTimeout(250);
      await type('in a column');
    }, (l) => l.t?.flat.startsWith('in a column,,,,|'));
    const inCol = await win.evaluate(() => {
      const w = document.querySelector('#editor .blk-table');
      const col = w.parentElement;
      return { host: col.className, table: Math.round(w.getBoundingClientRect().right), col: Math.round(col.getBoundingClientRect().right), widths: [...w.querySelectorAll('colgroup col:not(.tbl-ui)')].map((c) => c.style.width).join() };
    });
    check('it stands in the column, its columns made as narrow as that takes', inCol.host === 'blk-col' && inCol.table <= inCol.col + 1, JSON.stringify(inCol));

    // ---- a new table's size --------------------------------------------------------
    await open('blank');
    await press('Control+a', 'Delete');
    await scene('a new table is five rows of five cells, and no wider than the page', async () => {
      await win.evaluate(() => document.querySelector('#toolbar [data-act="table"]').click());
      await win.waitForTimeout(250);
      await press('Enter');
      await win.waitForTimeout(250);
    }, (l) => l.t?.flat === ',,,,|,,,,|,,,,|,,,,|,,,,');
    const fit = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const w = ed.querySelector('.blk-table').getBoundingClientRect();
      const style = getComputedStyle(ed);
      const inner = ed.getBoundingClientRect();
      return { right: Math.round(w.right), page: Math.round(inner.right - (Number.parseFloat(style.paddingRight) || 0)), scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    check('its right edge, the + with it, is inside the page', fit.right <= fit.page + 1 && !fit.scroll, JSON.stringify(fit));

    // ---- the size of a new table ---------------------------------------------------
    await open('size1');
    await scene('the size of a new table is picked: the arrows change it, Enter makes it', async () => {
      await win.click('#z0');
      await win.evaluate(() => document.querySelector('#toolbar [data-act="table"]').click());
      await win.waitForTimeout(200);
      await press('ArrowUp', 'ArrowUp', 'ArrowRight');
      await press('Enter');
      await win.waitForTimeout(250);
    }, (l) => l.tables.length === 1 && l.t.flat === ',,,,,|,,,,,|,,,,,');
    await open('size2');
    await scene('a click on one of its squares makes a table that large', async () => {
      await win.click('#z0');
      await win.evaluate(() => document.querySelector('#toolbar [data-act="table"]').click());
      await win.waitForTimeout(200);
      const p = await centre('.tbl-size__grid span[data-r="2"][data-c="7"]');
      await win.mouse.move(p.x, p.y);
      await win.mouse.click(p.x, p.y);
      await win.waitForTimeout(250);
    }, (l) => l.tables.length === 1 && l.t.flat === ',,,,,,|,,,,,,');
    await open('size3');
    await scene('Escape, or a letter typed, closes it and makes none: the letter is the note\'s', async () => {
      await win.click('#z0');
      await win.evaluate(() => document.querySelector('#toolbar [data-act="table"]').click());
      await win.waitForTimeout(150);
      await press('Escape');
      await win.evaluate(() => document.querySelector('#toolbar [data-act="table"]').click());
      await win.waitForTimeout(150);
      await type('q');
    }, (l) => l.tables.length === 0 && l.text === 'q');
    check('and it is gone from the screen', await win.evaluate(() => !document.querySelector('.tbl-size')), '');

    // ---- the room a table has (the "urgent bugs" note) -----------------------------
    const edge = () => win.evaluate(() => {
      const wrap = document.querySelector('#editor .blk-table');
      const host = wrap.parentElement;
      const style = getComputedStyle(host);
      const frame = document.querySelector('.editor-frame');
      return {
        table: Math.round(wrap.getBoundingClientRect().right),
        host: Math.round(host.getBoundingClientRect().right - (Number.parseFloat(style.paddingRight) || 0)),
        sideways: frame.scrollWidth > frame.clientWidth + 1 || document.getElementById('editor').scrollWidth > document.getElementById('editor').clientWidth + 1,
        drawn: [...wrap.querySelectorAll('colgroup col:not(.tbl-ui)')].map((c) => Math.round(Number.parseFloat(c.style.width))),
        own: [...wrap.querySelectorAll('colgroup col:not(.tbl-ui)')].map((c) => c.dataset.w ?? ''),
      };
    });
    await fresh();
    let e = null;
    await scene('columns added past the page\'s edge do not push the page out to the side', async () => {
      await win.hover(cellAt(0, 0));
      for (let i = 0; i < 12; i += 1) { const plus = await centre('#editor .tbl-add-col'); await win.mouse.click(plus.x, plus.y); await win.waitForTimeout(60); }
      e = await edge();
    }, (l) => l.t.flat.split('|')[0].split(',').length === 15 && e.table <= e.host + 1 && !e.sideways && Math.min(...e.drawn) >= 24
      && Math.max(...e.drawn) - Math.min(...e.drawn) <= 3 && e.own.every((w) => !w));
    if (LOOK) console.log(`      ${JSON.stringify(e)}`);
    let keptWidths = '';
    await scene('the page made narrower under it: the table is drawn narrower, and the note keeps its widths', async () => {
      keptWidths = e.drawn.join();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 860));
      await win.waitForTimeout(500);
      e = await edge();
      void 0;
      await win.click(cellAt(0, 0));
      await type('k');
      await win.waitForTimeout(1000);
    }, () => e.table <= e.host + 1 && !e.sideways && e.own.every(Boolean) && e.own.join() === keptWidths
      && !/data-w/.test(stored(current) ?? '') && (stored(current).match(/<col /g) ?? []).length === 15);
    await scene('and wide again, it is as wide as it was', async () => {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 860));
      await win.waitForTimeout(500);
      e = await edge();
    }, () => e.own.every((w) => !w) && e.drawn.join() === keptWidths && e.table <= e.host + 1);
    await fresh();
    let tip = null;
    await scene('a column\'s line pulled shows its width in millimetres, and goes down to 24 pixels', async () => {
      const grip = await centre('#editor th.tbl-x:nth-of-type(2) .tbl-colgrip');
      await win.mouse.move(grip.x, grip.y);
      await win.mouse.down();
      await win.mouse.move(grip.x - 40, grip.y, { steps: 4 });
      tip = await win.evaluate(() => { const t = document.querySelector('#editor .tbl-tip'); return t ? { label: t.dataset.label, shown: getComputedStyle(t, '::before').content } : null; });
      await win.mouse.move(grip.x - 400, grip.y, { steps: 4 });
      tip.least = await win.evaluate(() => document.querySelector('#editor .tbl-tip')?.dataset.label);
      await win.mouse.up();
      await win.waitForTimeout(120);
      tip.after = await win.evaluate(() => !!document.querySelector('#editor .tbl-tip'));
      tip.width = await win.evaluate(() => document.querySelector('#editor colgroup col:not(.tbl-ui)').style.width);
    }, () => tip.label === '26.5 mm' && /26\.5 mm/.test(tip.shown) && tip.least === '6.3 mm' && !tip.after && tip.width === '24px');
    if (LOOK) console.log(`      ${JSON.stringify(tip)}`);
    await scene('pulled wider than the page has room for, it stops at the page\'s edge', async () => {
      const grip = await centre('#editor th.tbl-x:nth-of-type(4) .tbl-colgrip');
      await drag(grip, { x: grip.x + 3000, y: grip.y });
      e = await edge();
    }, () => e.table <= e.host + 1 && !e.sideways && e.own.every((w) => !w) && e.drawn[2] > 400);
    await scene('a click on the corner selects nothing; a right-click on it deletes the table', async () => {
      const corner = await centre('#editor .tbl-corner');
      await win.click(cellAt(0, 1));
      await win.mouse.click(corner.x, corner.y);
      await win.waitForTimeout(120);
      tip = await win.evaluate(() => ({ sel: document.querySelectorAll('#editor td.sel').length, chip: !!document.querySelector('#editor .tbl-chip') }));
      await rightClick('#editor .tbl-corner');
      tip.menu = await win.evaluate(() => [...document.querySelectorAll('#ctx-menu > button')].map((b) => b.textContent).join('|'));
      await pick('Delete table');
    }, (l) => tip.sel === 0 && !tip.chip && tip.menu === 'Delete table' && l.order === 'p0,p1');
    // ---- a row's height ------------------------------------------------------------
    await fresh();
    const mm = (px) => `${(Math.round(px * 25.4 / 96 * 10) / 10).toFixed(1)} mm`;
    const rowsNow = () => win.evaluate(() => {
      const trs = [...document.querySelectorAll('#editor .blk-table tbody tr')];
      return { h: trs.map((tr) => Math.round(tr.getBoundingClientRect().height)), own: trs.map((tr) => tr.style.height), grips: document.querySelectorAll('#editor .tbl-rowgrip').length };
    });
    const pullRow = async (r, dy, during = async () => {}) => {
      const grip = await centre(`#editor .blk-table tbody tr:nth-child(${r + 1}) .tbl-rowgrip`);
      await win.mouse.move(grip.x, grip.y);
      await win.mouse.down();
      await win.mouse.move(grip.x, grip.y + dy, { steps: 5 });
      await win.waitForTimeout(60);
      await during();
      await win.mouse.up();
      await win.waitForTimeout(140);
    };
    let row = { before: await rowsNow() };
    await scene('the line under a row\'s number is pulled: the row is higher, its height shown in millimetres', async () => {
      await pullRow(1, 50, async () => {
        row.tip = await win.evaluate(() => { const t = document.querySelector('#editor .tbl-tip'); return t ? { label: t.dataset.label, shown: getComputedStyle(t, '::before').content, cursor: getComputedStyle(document.body).cursor } : null; });
      });
      row.pulled = await rowsNow();
      row.tipAfter = await win.evaluate(() => !!document.querySelector('#editor .tbl-tip'));
    }, (l) => whole(l) && row.before.grips === 3 && row.before.own.join('') === ''
      && row.pulled.h[1] === row.before.h[1] + 50 && row.pulled.h[0] === row.before.h[0] && row.pulled.h[2] === row.before.h[2]
      && row.pulled.own[1] === `${row.before.h[1] + 50}px` && row.tip?.label === mm(row.before.h[1] + 50) && row.tip.shown.includes(row.tip.label)
      && row.tip.cursor === 'row-resize' && !row.tipAfter && l.t.sel.length === 0);
    if (LOOK) console.log(`      ${JSON.stringify(row)}`);
    await scene('the note keeps the height, and has it when it is opened again', async () => {
      await win.waitForTimeout(1000);
      row.saved = stored(current) ?? '';
      const mine = current;
      await open('blank');
      await open(mine);
      row.again = await rowsNow();
    }, (l) => whole(l) && row.saved.includes(`<tr style="height: ${row.pulled.h[1]}px;">`) && !/tbl-rowgrip|tbl-tip/.test(row.saved)
      && row.again.own.join() === row.pulled.own.join() && row.again.h.join() === row.pulled.h.join() && row.again.grips === 3);
    await scene('a step back takes it off, a step forward gives it again', async () => {
      await win.click(cellAt(0, 0));
      await pullRow(0, 30);
      row.two = await rowsNow();
      await press('Control+z');
      await win.waitForTimeout(200);
      row.back = await rowsNow();
      await press('Control+y');
      await win.waitForTimeout(200);
      row.forth = await rowsNow();
    }, (l) => whole(l) && row.two.own[0] === `${row.before.h[0] + 30}px` && row.back.own[0] === '' && row.back.own[1] === row.pulled.own[1]
      && row.forth.own.join() === row.two.own.join() && row.forth.grips === 3);
    await scene('a row put in above it and one taken out: the height stays with its row', async () => {
      await rightClick(cellAt(1, 1));
      await pick('Insert row above');
      row.put = await rowsNow();
      await rightClick(cellAt(0, 0));
      await pick('Delete row');
      row.taken = await rowsNow();
    }, (l) => l.t.flat === ',,|d,e,f|g,h,i' && row.put.own.join() === [row.two.own[0], '', row.pulled.own[1], ''].join()
      && row.taken.own.join() === ['', row.pulled.own[1], ''].join() && row.taken.h[1] === row.pulled.h[1]);
    await scene('words that need more than the row was given make it higher; the row is pulled no lower than its words', async () => {
      await win.click(cellAt(1, 1));
      await press('End');
      for (let i = 0; i < 4; i += 1) await press('Enter');
      await type('z');
      row.full = await rowsNow();
      await pullRow(1, -600, async () => { row.leastTip = await win.evaluate(() => document.querySelector('#editor .tbl-tip')?.dataset.label); });
      row.least = await rowsNow();
    // The height it is left with is the one it is drawn at: its words', with the room over and under them.
    }, (l) => l.t.flat.startsWith(',,|d,e') && row.full.h[1] > row.pulled.h[1] && row.full.own[1] === row.pulled.own[1]
      && Math.abs(Number.parseFloat(row.least.own[1]) - row.least.h[1]) <= 1 && row.least.h[1] === row.full.h[1]
      && Math.abs(Number.parseFloat(row.leastTip) - row.full.h[1] * 25.4 / 96) < 0.3);   // the height is not whole pixels
    if (LOOK) console.log(`      ${JSON.stringify(row)}`);
    await scene('an empty row, and one with a line of words, are pulled as low as a column may be narrow: 24 pixels, a square', async () => {
      await pullRow(0, -600, async () => { row.lowTip = await win.evaluate(() => document.querySelector('#editor .tbl-tip')?.dataset.label); });
      await pullRow(2, -600);
      row.low = await rowsNow();
      row.told = await win.evaluate(() => [...document.querySelectorAll('#editor .blk-table tbody tr')].map((tr) => tr.style.getPropertyValue('--row')));
      await win.waitForTimeout(1000);
      row.lowSaved = stored(current) ?? '';
      const mine = current;
      await open('blank');
      await open(mine);
      row.lowAgain = await rowsNow();
    }, (l) => l.t.flat.endsWith('|g,h,i') && row.low.own[0] === '24px' && row.low.h[0] === 24 && row.low.own[2] === '24px' && row.low.h[2] === 24 && row.lowTip === '6.4 mm'
      && row.told[0] === '24px' && (row.lowSaved.match(/<tr style="height: 24px;">/g) ?? []).length === 2 && !/--row/.test(row.lowSaved)
      && row.lowAgain.h.join() === row.low.h.join() && row.lowAgain.own.join() === row.low.own.join());
    if (LOOK) console.log(`      ${JSON.stringify({ low: row.low, tip: row.lowTip, again: row.lowAgain })}`);
    await scene('a row is pulled no higher than the highest a row is', async () => {
      await pullRow(0, 2000);
      row.most = await rowsNow();
      await press('Control+z');
      await win.waitForTimeout(200);
    }, () => row.most.own[0] === '800px' && row.most.h[0] === 800);

    // ---- the page's edge, and the squares a table is asked for with ----------------
    const reachNow = () => win.evaluate(() => {
      const ed = document.getElementById('editor');
      const wrap = ed.querySelector('.blk-table');
      const t = wrap.querySelector('table').getBoundingClientRect();
      const add = wrap.querySelector('.tbl-add-col').getBoundingClientRect();
      const frame = document.querySelector('.editor-frame');
      return {
        line: ed.querySelector('hr.blk-hr').getBoundingClientRect().right, left: t.left - ed.querySelector('hr.blk-hr').getBoundingClientRect().left, table: t.right,
        add: [add.left, add.right, add.height], page: ed.getBoundingClientRect().left + ed.clientLeft + ed.clientWidth,
        sideways: frame.scrollWidth > frame.clientWidth + 1 || ed.scrollWidth > ed.clientWidth + 1,
        cols: wrap.querySelectorAll('colgroup col:not(.tbl-ui)').length, fitted: wrap.querySelectorAll('colgroup col[data-w]').length,
      };
    });
    const atLine = (r) => Math.abs(r.table - r.line) <= 1.5 && Math.abs(r.left) <= 0.5 && r.add[0] >= r.table && r.add[1] <= r.page && r.add[2] > 20 && !r.sideways;
    await open('line');
    current = 'line';
    let reach = {};
    await scene('a table that takes all the room there is ends where the page\'s dividers end; its + for a column hangs in the margin', async () => {
      reach.open = await reachNow();
      await win.hover(cellAt(0, 0));
      const plus = await centre('#editor .tbl-add-col');
      await win.mouse.click(plus.x, plus.y);
      await win.waitForTimeout(150);
      reach.more = await reachNow();
      const grip = await centre('#editor th.tbl-x:nth-of-type(3) .tbl-colgrip');
      await drag(grip, { x: grip.x - 60, y: grip.y });
      reach.narrow = await reachNow();
      reach.widths = await win.evaluate(() => [...document.querySelectorAll('#editor colgroup col:not(.tbl-ui)')].map((c) => c.style.width).join(' '));
      const last = await centre('#editor th.tbl-x:nth-of-type(18) .tbl-colgrip');
      await drag(last, { x: last.x + 900, y: last.y });
      reach.wide = await reachNow();
    }, () => reach.open.cols === 16 && reach.open.fitted === 16 && atLine(reach.open)
      && reach.more.cols === 17 && reach.more.fitted === 0 && atLine(reach.more)
      && reach.narrow.table < reach.narrow.line - 20 && atLine(reach.wide));
    if (LOOK) console.log(`      ${JSON.stringify(reach)}`);
    await open('size3');
    let squares = null;
    await scene('the squares a new table is asked for with are twelve across and eight down, as wide as the numbers under them', async () => {
      await win.click('#z0');
      await win.evaluate(() => document.querySelector('#toolbar [data-act="table"]').click());
      await win.waitForFunction(() => document.querySelector('.tbl-size'), null, { polling: 50 });
      squares = await win.evaluate(() => {
        const box = document.querySelector('.tbl-size');
        const all = [...box.querySelectorAll('.tbl-size__grid span')];
        const first = all[0].getBoundingClientRect();
        const last = all[all.length - 1].getBoundingClientRect();
        const fields = box.querySelector('.tbl-size__fields').getBoundingClientRect();
        return { n: all.length, at: `${all[all.length - 1].dataset.r}x${all[all.length - 1].dataset.c}`, square: Math.abs(first.width - first.height) < 0.6 && first.width >= 16, left: first.left - fields.left, right: fields.right - last.right };
      });
      const b = await box('.tbl-size__grid span[data-r="8"][data-c="12"]');
      await win.mouse.move(b.cx, b.cy);
      await win.mouse.click(b.cx, b.cy);
      await win.waitForTimeout(250);
    }, (l) => squares.n === 96 && squares.at === '8x12' && squares.square && Math.abs(squares.left) < 1 && Math.abs(squares.right) < 1
      && l.tables.length === 1 && l.t.flat.split('|').length === 8 && l.t.flat.split('|')[0].split(',').length === 12);
    if (LOOK) console.log(`      ${JSON.stringify(squares)}`);

    // ---- an empty line over a table, a video, a picture -----------------------------
    const linesNow = () => win.evaluate(() => {
      const ed = document.getElementById('editor');
      const name = (el) => el.id || (el.classList.contains('blk-table') ? 'table' : el.classList.contains('note-image') ? 'picture' : el.classList.contains('link-block') ? 'video' : el.tagName.toLowerCase());
      const flat = (host) => [...host.children].filter((el) => !el.matches('.shape-layer, .image-layer'))
        .map((el) => (el.classList.contains('blk-cols') ? `[${[...el.querySelectorAll(':scope > .blk-col')].map(flat).join(' | ')}]` : name(el))).join(',');
      const sel = getSelection();
      const el = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
      return { flat: flat(ed), caret: el?.closest('td') ? 'cell' : el?.id || el?.tagName.toLowerCase() || '', at: sel.anchorOffset, picture: !!ed.querySelector('.note-image.sel'), words: ed.innerText.replace(/\s+/g, ' ').trim() };
    });
    const onLine = async (id) => { const b = await box(`#${id}`); await win.mouse.click(b.left + 30, b.cy); await win.waitForTimeout(140); };
    const say = (o) => JSON.stringify(o);
    await open('three');
    let gone = {};
    await onLine('g1');
    await press('Backspace');
    gone.table = await linesNow();
    await type('q');
    gone.typed = await linesNow();
    await onLine('g2');
    await press('Backspace');
    gone.video = await linesNow();
    await onLine('g3');
    await press('Backspace');
    gone.picture = await linesNow();
    check('Backspace on the empty line over a table at the top of a column takes the line away; the caret is in the table\'s first cell',
      gone.table.flat === 'hr,[table,g1b | g2,video,g2b | g3,picture,g3b],g4' && gone.table.caret === 'cell' && gone.typed.words.startsWith('qa b c d'), say(gone.table));
    check('over a video: the line goes, the caret is on the line under the video', gone.video.flat === 'hr,[table,g1b | video,g2b | g3,picture,g3b],g4' && gone.video.caret === 'g2b', say(gone.video));
    check('over a picture: the line goes, the caret is on the line under the picture', gone.picture.flat === 'hr,[table,g1b | video,g2b | picture,g3b],g4' && gone.picture.caret === 'g3b', say(gone.picture));
    check('and the three tables, videos and pictures are whole', (await audit()).length === 0 && gone.picture.words.includes('under'), say(await audit()));
    await press('Control+z');
    await win.waitForTimeout(200);
    gone.back = await linesNow();
    check('a step back puts the last line back', gone.back.flat === 'hr,[table,g1b | video,g2b | g3,picture,g3b],g4', say(gone.back));
    await open('lone');
    await onLine('o1');
    await press('Backspace');
    await onLine('o2');
    await press('Home');
    await press('Backspace');
    gone.lone = await linesNow();
    check('a column\'s only line, and a first line with words, stay where they are', gone.lone.flat === 'o0,[o1 | o2,o3]' && gone.lone.words === 'over word more', say(gone.lone));
    for (const [note, want, caret] of [['toptable', 'table,t2', 'cell'], ['topvideo', 'video,t2', 't2'], ['toppicture', 'picture,t2', 't2']]) {
      await open(note);
      await onLine('t1');
      await press('Backspace');
      gone.top = await linesNow();
      check(`the first line of a note, empty, over a ${want.split(',')[0]}: Backspace takes it away`, gone.top.flat === want && gone.top.caret === caret && gone.top.words.includes('under'), say(gone.top));
    }
    await open('toppicture2');
    await onLine('t1');
    await press('Delete');
    gone.del = await linesNow();
    check('Delete there takes the line and leaves the picture, selected — not the picture with the line under it', gone.del.flat === 'picture,t2' && gone.del.picture && gone.del.words.includes('under'), say(gone.del));
    for (const [note, want] of [['overtable', 'd0,table,d2'], ['overvideo', 'd0,video,d2']]) {
      await open(note);
      await onLine('d1');
      await press('Delete');
      gone.over = await linesNow();
      await type('!');
      gone.overTyped = await linesNow();
      check(`Delete on an empty line over a ${want.split(',')[1]} takes the line away; the caret is at the end of the line over it`,
        gone.over.flat === want && gone.over.caret === 'd0' && gone.overTyped.words.startsWith('above!'), say(gone.overTyped));
    }

    await open('cols');
    await scene('a table in a column stays in its column when the page gets narrower', async () => {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(820, 860));
      await win.waitForTimeout(500);
      e = await edge();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 860));
      await win.waitForTimeout(400);
    }, () => e.table <= e.host + 1 && !e.sideways);

    // ---- one menu ------------------------------------------------------------------
    await fresh();
    let menu = null;
    const menuNow = () => win.evaluate(() => ({ row: document.querySelectorAll('#ctx-menu .ctx-format button').length, items: [...document.querySelectorAll('#ctx-menu > button')].map((b) => b.textContent + (b.disabled ? '·' : '')).join('|') }));
    await scene('a right-click on a line is the one menu: the formatting row, cut, copy, the pastes, select all', async () => {
      await rightClick('#p0');
      menu = await menuNow();
      await press('Escape');
    }, () => menu.row > 5 && menu.items === 'Cut·|Copy·|Paste as Nebula format|Paste original format|Select all');
    await scene('in a cell the table\'s choices stand in it, over cut and copy', async () => {
      await rightClick(cellAt(1, 1));
      menu = await menuNow();
      await press('Escape');
    }, () => menu.row > 5 && menu.items === 'Insert row above|Insert row below|Insert column left|Insert column right|Delete row|Delete column|Delete table|Cut·|Copy·|Paste as Nebula format|Paste original format|Select all');
    await scene('with cells selected, Cut and Copy are for the cells', async () => {
      await drag(await centre(cellAt(0, 0)), await centre(cellAt(1, 1)));
      await rightClick(cellAt(0, 0));
      menu = await menuNow();
      await pick('Copy');
      menu.copied = (await app.evaluate(({ clipboard }) => clipboard.readText())).replace(/\r/g, '');
    }, () => /Delete rows\|Delete columns\|Delete table\|Cut\|Copy\|Paste/.test(menu.items) && menu.copied === 'a\tb\nd\te');

    // ---- a long word, many rows ----------------------------------------------------
    await fresh();
    await scene('a word longer than its column breaks inside the cell', async () => {
      await win.click(cellAt(1, 1));
      await type('Donaudampfschifffahrtsgesellschaftskapitaensmuetzenabzeichen');
    }, (l) => l.order === 'p0,table,p1');
    await fresh();
    let took = 0;
    await scene('forty rows of twelve pasted in grow the table, whole', async () => {
      const rows = Array.from({ length: 40 }, (_, r) => Array.from({ length: 12 }, (_, c) => `r${r}c${c}`).join('\t')).join('\r\n');
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), rows);
      await win.click(cellAt(0, 0));
      await press('Control+v');
      await win.waitForTimeout(500);
    }, (l) => l.t.flat.split('|').length === 40 && l.t.flat.split('|')[39].split(',').length === 12);
    await scene('and typing in it is not slow', async () => {
      await win.click(cellAt(20, 5));
      took = await win.evaluate(async () => {
        const t0 = performance.now();
        for (let i = 0; i < 20; i += 1) { document.execCommand('insertText', false, 'x'); }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return Math.round(performance.now() - t0);
      });
    }, () => took < 600);
    if (LOOK) console.log(`      twenty letters in a 40×12 table: ${took} ms`);

    // ---- the note it is all kept in ------------------------------------------------
    await fresh();
    await scene('with cells selected, the note that is saved holds no selection and nothing of the screen', async () => {
      await drag(await centre(cellAt(0, 0)), await centre(cellAt(1, 1)));
      await press('Control+h');
      await win.waitForTimeout(1000);
    }, () => { const n = stored(current) ?? ''; return n.includes('h-yellow') && !/tbl-|<th|class="[^"]*\b(sel|act|fill)\b/.test(n); });
    await fresh();
    await scene('in a locked note the bar and Ctrl+A change nothing of a table', async () => {
      await win.evaluate(() => { document.getElementById('editor').dataset.readonly = 'true'; });
      await win.click(cellAt(1, 1));
      for (const act of ['ac', 'todo', 'ul', 'codeblock', 'table', 'divider', 'bold']) { await win.evaluate((a) => document.querySelector(`#toolbar [data-act="${a}"]`).click(), act); await win.waitForTimeout(60); }
      await press('Control+a', 'Control+a', 'Delete', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab');
      await win.evaluate(() => { delete document.getElementById('editor').dataset.readonly; });
    }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT && l.t.align === ',,,,,,,,');
    await scene('and found words in a cell are found, the numbering is not', async () => {
      await press('Escape', 'Control+f');
      await win.waitForTimeout(200);
      await type('x1');
      await win.waitForTimeout(250);
      await press('Escape');
    }, (l) => l.order === 'p0,table,p1' && l.t.flat === FLAT);

    check('no page errors in the table edge checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  let passed = 0;
  await runTableEdgeChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (ok) passed += 1; else failed += 1; });
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
