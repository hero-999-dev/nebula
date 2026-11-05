/**
 * 1.0.3 — the bugs in the owner's Ideas note, and the app staying up when its
 * page is lost. The real app on a throwaway profile, real keys and mouse.
 *
 *   node tests/e2e/ideas-103b.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FONT = { family: '"Arial", sans-serif', size: 16 };
const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
const TABLE = `<p id="above">above line</p><div class="blk-table"><table><tbody>${
  row(['one', 'two words here', 'three'])}${row(['', '<br>', 'x'])}${row(['seven', 'eight words here', 'nine'])}</tbody></table></div><p id="below">below line</p>`;
const card = (u) => `<div class="link-block link-bookmark" contenteditable="false" data-block-type="link" data-kind="bookmark" data-url="${u}"><a href="${u}" target="_blank" rel="noopener noreferrer" class="link-card"><span class="link-card__kind">Bookmark</span><strong class="link-card__title">${u}</strong><small class="link-card__url">${u}</small></a><button type="button" class="link-del" data-link-remove="true">×</button></div>`;

export async function runIdeas103bChecks(check) {
  const server = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>e</title>embedded'); });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}/embed`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-ideas103b-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const note = (id, content, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`), JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1, ...extra }));
  note('work', '<p>x</p>');
  note('table', TABLE);
  note('font', '<p id="dst"><br></p>', { font: FONT });
  note('embed', `<p>top</p><div class="link-block link-embed" contenteditable="false" data-block-type="link" data-kind="embed" data-url="${url}"></div><p>end</p>`);
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    await app.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0].setSize(1300, 900);
      globalThis.__asks = [];
      dialog.showMessageBox = async (_w, o) => { globalThis.__asks.push(o?.message ?? ''); return { response: 0 }; };
    });
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const open = async (id, ready = '#editor') => {
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), id);
      await win.waitForFunction((t) => document.querySelector('#title').value === t, id, { polling: 50 });
      await win.waitForSelector(ready, { state: 'attached' });
      await win.waitForTimeout(250);
    };
    await open('work');
    const load = async (h) => { await win.evaluate((x) => { const e = document.getElementById('editor'); e.innerHTML = x; e.focus(); }, h); await win.waitForTimeout(100); };
    const box = (s) => win.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, h: r.height }; }, s);
    const put = (sel, end = false) => win.evaluate(([q, e]) => {
      const el = document.querySelector(q); const r = document.createRange();
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t = w.nextNode();
      if (e) for (let n = t; n; n = w.nextNode()) t = n;
      if (t) r.setStart(t, e ? t.length : 0); else r.setStart(el, 0);
      r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }, [sel, end]);
    const at = () => win.evaluate(() => {
      const armed = document.querySelector('#editor hr.armed');
      if (armed) return `picked:${armed.id}`;
      const n = getSelection().anchorNode; const el = n?.nodeType === 1 ? n : n?.parentElement;
      return el?.closest('[id]')?.id ?? '?';
    });
    const keys = async (...list) => { const seen = []; for (const k of list) { await win.keyboard.press(k); await win.waitForTimeout(60); seen.push(await at()); } return seen.join(' '); };
    const order = () => win.evaluate(() => [...document.getElementById('editor').children].map((c) => c.id || c.tagName).join(' '));

    // ---- a divider and the arrows ---------------------------------------------
    await load('<p id="a">above</p><hr id="h" class="blk-hr"><p id="u">under</p>');
    await put('#u');
    check('Up from under a divider picks it, and the next Up goes over it', (await keys('ArrowUp', 'ArrowUp')) === 'picked:h a', await at());
    check('Down comes back the same way', (await keys('ArrowDown', 'ArrowDown')) === 'picked:h u', await at());

    await load('<p id="a">above</p><hr id="h1" class="blk-hr"><hr id="h2" class="blk-hr"><p id="u">under</p>');
    await put('#u');
    const pair = await keys('ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown');
    check('two dividers: the arrows pass each in its turn, with no pushing back', pair === 'picked:h2 picked:h1 a picked:h1 picked:h2 u', pair);
    check('and no line was made between them', (await order()) === 'a h1 h2 u', await order());

    await load('<div class="blk-cols" data-split="50" style="--split:50%"><div class="blk-col"><hr id="h" class="blk-hr"><p id="u"><br></p></div><hr class="blk-vr"><div class="blk-col"><p>r</p></div></div>');
    await put('#u');
    const first = await keys('ArrowUp', 'ArrowUp', 'ArrowUp');
    check('first in a column: the divider stays picked, the caret does not bounce', first === 'picked:h picked:h picked:h', first);

    await load('<p id="u">a long line that wraps a long line that wraps a long line that wraps a long line that wraps a long line that wraps a long line that wraps a long line that wraps a long line that wraps a long line that wraps</p><hr id="h" class="blk-hr"><p id="z">z</p>');
    await put('#u');
    check('Down on the first row of a wrapped line stays in the line', (await keys('ArrowDown')) === 'u', await at());

    // ---- dragging the lower of two dividers -----------------------------------
    await load('<p id="a">aaa</p><p id="b">bbb</p><hr id="h1" class="blk-hr"><hr id="h" class="blk-hr"><p id="c">ccc</p><p id="d">ddd</p>');
    const h = await box('#h');
    const b = await box('#b');
    await win.mouse.move(h.cx, h.cy);
    await win.mouse.down();
    await win.mouse.move(h.cx + 4, h.t - 14, { steps: 4 });
    await win.mouse.move(h.cx + 4, b.b + 3, { steps: 3 });
    await win.mouse.up();
    await win.waitForTimeout(120);
    check('the lower of two dividers goes up past the other on a short pull', (await order()) === 'a b h h1 c d', await order());

    // ---- a cut beside the long upright divider --------------------------------
    await load('<div class="blk-cols" id="r1" data-split="33" style="--split:33%"><div class="blk-col"><p>a</p></div><hr class="blk-vr" id="v1"><div class="blk-col"><p>b</p></div></div><div class="blk-cols" id="r2" data-split="33" style="--split:33%"><div class="blk-col"><p>c</p></div><hr class="blk-vr" id="v2"><div class="blk-col"><p>d</p></div></div>');
    const v1 = await box('#v1');
    const v2 = await box('#v2');
    check('the upright divider of rows cut from one block runs on without a gap', Math.abs(v2.t - v1.b) < 1 && Math.abs(v2.l - v1.l) < 1, JSON.stringify({ v1, v2 }));

    // ---- Backspace at the start of a column -----------------------------------
    const THREE = '<div class="blk-cols" data-split="25,50" style="--split:25%"><div class="blk-col"><p id="w">words</p></div><hr class="blk-vr"><div class="blk-col"><p id="m">m</p></div><hr class="blk-vr"><div class="blk-col"><p id="v"><br></p></div></div>';
    const cols = () => win.evaluate(() => document.querySelectorAll('#editor .blk-col').length);
    // The upright divider is a wall: Backspace goes up out of the row, as ↑ does, and never
    // into the column before nor takes an empty column with its divider (the owner, 1.0.3).
    await load(`<p id="o">over</p>${THREE}`);
    await put('#v');
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(150);
    check('Backspace in an empty column goes up out of the row; the column and its divider stay', (await cols()) === 3 && (await at()) === 'o', `${await cols()} ${await at()}`);
    await put('#m');
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(100);
    check('at the start of a column with words, it goes up too, not into the column before', (await at()) === 'o' && (await cols()) === 3, `${await cols()} ${await at()}`);
    await load(`${THREE.replace('id="w"', 'id="w0"').replace('id="m"', 'id="m0"').replace('id="v"', 'id="v0"')}${THREE}`);
    await put('#m');
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(100);
    check('in a row under a row, Backspace goes into the column straight over it', (await at()) === 'm0' && (await cols()) === 6, `${await cols()} ${await at()}`);
    await load('<p id="pre">pre</p><div class="blk-cols" data-split="50" style="--split:50%"><div class="blk-col"><p id="w">words</p></div><hr class="blk-vr"><div class="blk-col"><p id="v"><br></p><p id="v2"><br></p></div></div>');
    await put('#w');
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(100);
    check('at the start of the first column, to the line over the row', (await at()) === 'pre' && (await cols()) === 2, await at());
    await load('<div class="blk-cols" data-split="50" style="--split:50%"><div class="blk-col"><p id="w">words</p><p id="w2">more</p></div><hr class="blk-vr"><div class="blk-col"><p id="v"><br></p></div></div>');
    await put('#v');
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(150);
    check('with nothing over the row, Backspace in an empty column keeps the row and does not cross the divider', (await cols()) === 2 && (await at()) === 'v', `${await cols()} ${await at()} ${await order()}`);

    // ---- a click on open ground gets a caret ----------------------------------
    await load('<div class="blk-cols" data-split="50" style="--split:50%"><div class="blk-col" id="cl"><p id="c1">one</p><hr id="ch" class="blk-hr"><p id="c2"></p></div><hr class="blk-vr"><div class="blk-col"><p>r</p><p>r</p><p>r</p><p>r</p><p>r</p></div></div><p id="n1">one</p><br><p id="n2"><br></p>');
    const c2 = await box('#c2');
    check('a line with nothing in it has a height to click', c2.h > 10, String(c2.h));
    await win.mouse.click(c2.cx, c2.cy);
    await win.waitForTimeout(60);
    check('and the click puts the caret there', (await at()) === 'c2', await at());
    const n2 = await box('#n2');
    await win.mouse.click(n2.cx, n2.cy);
    await win.waitForTimeout(60);
    check('a stray break between lines does not take the click away', (await at()) === 'n2', await at());

    // ---- the arrows in a table ------------------------------------------------
    await open('table', '#editor td');
    const cell = () => win.evaluate(() => {
      const s = getSelection(); const n = s.anchorNode; const el = n?.nodeType === 1 ? n : n?.parentElement;
      const td = el?.closest('td');
      if (!td) return el?.closest('p')?.id ?? '?';
      const tr = td.parentElement;
      const before = document.createRange(); before.selectNodeContents(td); before.setEnd(n, s.anchorOffset);
      return `${[...tr.parentElement.children].indexOf(tr)},${[...tr.querySelectorAll('td')].indexOf(td)}:${before.toString().length}`;
    });
    const start = await win.evaluate(() => { const b = document.querySelectorAll('#editor tbody tr')[0].querySelectorAll('td')[1].getBoundingClientRect(); return [b.left + 30, b.top + 12]; });
    await win.mouse.click(start[0], start[1]);
    await win.waitForTimeout(80);
    const off = Number((await cell()).split(':')[1]);
    await win.keyboard.press('ArrowDown');
    await win.waitForTimeout(50);
    const mid = await cell();
    await win.keyboard.press('ArrowDown');
    await win.waitForTimeout(50);
    const down = await cell();
    // Another line's letters: the same place across is within a letter's width of the same count.
    const near = /^2,1:\d+$/.test(down) && Math.abs(Number(down.split(':')[1]) - off) <= 1;
    check('Down through an empty cell keeps the place across', mid === '1,1:0' && near, `${off} ${mid} ${down}`);
    await win.keyboard.press('ArrowUp');
    await win.waitForTimeout(50);
    await win.keyboard.press('ArrowUp');
    await win.waitForTimeout(50);
    check('and Up through it comes back to the same place', (await cell()) === `0,1:${off}`, await cell());

    // ---- links in the note's font, cards pasted as cards ----------------------
    await open('font', '#dst');
    const dst = await box('#dst');
    await win.mouse.click(dst.cx, dst.cy);
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.com/card'));
    await win.keyboard.press('Control+V');
    await win.click('[data-link-kind="bookmark"]');
    await win.waitForTimeout(250);
    const family = await win.evaluate(() => { const t = document.querySelector('#editor .link-card__title'); return t ? getComputedStyle(t).fontFamily : 'none'; });
    check('a URL pasted as a card is in the note\'s font', /^"?Arial/.test(family), family);

    const FIVE = [1, 2, 3, 4, 5].map((i) => card(`https://a${i}.example/`)).join('');
    await load(`<p id="pre">before</p>${FIVE}<p id="post">after</p><p id="dst"><br></p>`);
    const from = await box('#pre');
    const to = await box('#post');
    await win.mouse.move(from.l + 2, from.cy);
    await win.mouse.down();
    await win.mouse.move(to.l + 12, to.cy, { steps: 8 });
    await win.mouse.up();
    await win.keyboard.press('Control+C');
    await win.waitForTimeout(150);
    await put('#dst');
    await win.keyboard.press('Control+V');
    await win.waitForTimeout(500);
    const pasted = await win.evaluate(() => [...document.querySelectorAll('#editor > .link-block')].map((c) => `${c.dataset.url}|${!!c.querySelector(':scope > .link-card')}|${getComputedStyle(c.querySelector('.link-card__title') ?? c).fontFamily}`));
    check('five cards copied together paste as five more, each a card',
      pasted.length === 10 && pasted.every((x) => x.includes('|true|') && x.includes('Arial')), JSON.stringify(pasted));

    // ---- what a selection holds shows, and the band starts on open ground -----
    await load(`<p id="s1">first line</p><hr id="sh" class="blk-hr">${card('https://sel.example/')}<p id="s2">last line</p>`);
    const s1 = await box('#s1');
    const s2 = await box('#s2');
    await win.mouse.move(s1.l + 2, s1.cy);
    await win.mouse.down();
    await win.mouse.move(s2.l + 30, s2.cy, { steps: 8 });
    await win.mouse.up();
    await win.waitForTimeout(150);
    const marked = () => win.evaluate(() => [...document.querySelectorAll('#editor .in-sel, #editor .block-picked')].map((e) => {
      const cs = getComputedStyle(e);
      return `${e.id || e.className.split(' ')[0]}:${e.tagName === 'HR' ? cs.borderTopColor : cs.outlineStyle}`;
    }));
    const inSel = await marked();
    const clay = await win.evaluate(() => getComputedStyle(document.querySelector('#editor hr')).borderTopColor);
    // A drag that leaves its line picks whole blocks since 1.0.3 (block-handle.js sweep).
    check('a selection across a divider and a card marks both',
      inSel.includes(`sh:${clay}`) && inSel.includes('link-block:solid') && clay !== 'rgba(0, 0, 0, 0)', JSON.stringify(inSel));
    // Picked blocks go with a click, as a selection goes with the caret.
    await win.mouse.click(s2.l + 5, s2.cy);
    await win.waitForTimeout(150);
    check('and the marks go with the selection', (await marked()).length === 0, JSON.stringify(await marked()));
    const side = await win.evaluate(() => { const e = document.getElementById('editor'); const r = e.getBoundingClientRect(); return r.left + e.clientWidth - 6; });
    await win.mouse.move(side, s1.t + 2);
    await win.mouse.down();
    await win.mouse.move(side - 40, s1.t + 40, { steps: 5 });
    await win.mouse.move(side - 80, s2.cy, { steps: 5 });
    const banded = await win.evaluate(() => !!document.querySelector('.block-band'));
    const picked = await marked();
    await win.mouse.up();
    check('a press on the right side, pulled, draws the band', banded, String(banded));
    check('and the divider and card it picks show it', picked.some((x) => x.startsWith('sh:') && !x.endsWith('none')) && picked.includes('link-block:solid'), JSON.stringify(picked));
    await win.keyboard.press('Escape');

    // ---- a card and a picture selected together go on one press ---------------
    const PIC = '<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" style="width: 200px;"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" alt="" draggable="false"><figcaption class="image-caption" contenteditable="true">cap</figcaption></figure>';
    for (const key of ['Delete', 'Backspace']) {
      await load(`<p id="d1">alpha line</p><div><br></div>${card('https://del.example/')}<div><br></div>${PIC}<p><br></p><p id="d2">zeta line</p>`);
      const d1 = await box('#d1');
      const d2 = await box('#d2');
      await win.mouse.move(d1.l + 30, d1.cy);
      await win.mouse.down();
      await win.mouse.move(d2.l + 20, d2.cy, { steps: 8 });
      await win.mouse.up();
      await win.waitForTimeout(120);
      await win.keyboard.press(key);
      await win.waitForTimeout(150);
      const left = await win.evaluate(() => [...document.getElementById('editor').children].map((c) => c.textContent.trim() || c.className.split(' ')[0] || c.tagName).join(' | '));
      // The sweep picks whole blocks, so the first and last lines go with them (1.0.3).
      check(`a card, a picture and the lines between, selected together, go on ${key}`,
        !/alpha|zeta|link-block|note-image/.test(left), left);
    }

    // ---- a divider pulled sideways beside columns cuts them --------------------
    const ROW = '<div class="blk-cols" data-split="50" style="--split:50%"><div class="blk-col"><p>words</p></div><hr class="blk-vr"><div class="blk-col"><p><br></p></div></div>';
    const shape = () => win.evaluate(() => [...document.getElementById('editor').children].map((c) => (c.matches('.blk-cols') ? `[${c.querySelectorAll(':scope > .blk-col').length}]` : c.tagName)).join(' '));
    for (const [where, html] of [['under', `<p>top</p><hr id="hc" class="blk-hr"><p><br></p>${ROW}<hr id="hd" class="blk-hr"><p><br></p><p><br></p>`], ['over', `<p>top</p><hr class="blk-hr"><p><br></p><hr id="hd" class="blk-hr">${ROW}<p><br></p>`]]) {
      await load(html);
      const hd = await box('#hd');
      await win.mouse.move(hd.cx, hd.cy);
      await win.mouse.down();
      await win.mouse.move(hd.cx + 10, hd.cy, { steps: 3 });
      await win.mouse.move(hd.cx + 220, hd.cy, { steps: 10 });
      await win.mouse.up();
      await win.waitForTimeout(150);
      const got = await shape();
      check(`a divider ${where} columns, pulled sideways level, cuts them and makes no empty row`, got.includes('[3]') && !got.includes('[2]'), got);
    }

    // ---- a divider taken to a side edge cuts in the middle ---------------------
    const pull = async (sel, tx, ty) => {
      const h = await box(sel);
      await win.mouse.move(h.cx, h.cy);
      await win.mouse.down();
      await win.mouse.move(h.cx + Math.sign(tx - h.cx) * 10, h.cy + Math.sign(ty - h.cy) * 10, { steps: 3 });
      await win.mouse.move(tx, ty, { steps: 14 });
      await win.mouse.up();
      await win.waitForTimeout(150);
    };
    const splits = () => win.evaluate(() => [...document.querySelectorAll('#editor .blk-cols')].map((c) => c.dataset.split).join(' '));
    await load('<p>top</p><hr id="he" class="blk-hr"><p>under</p><p>more</p>');
    const ed = await box('#editor');
    const he = await box('#he');
    await pull('#he', ed.r - 6, he.cy);
    check('a divider of the note taken to its side edge cuts it in the middle', (await splits()) === '50', await splits());
    await load(`<p>top</p><hr class="blk-hr"><p><br></p>${ROW}<hr id="hd" class="blk-hr"><p><br></p><p><br></p>`);
    const row = await box('#editor .blk-cols');
    const hd2 = await box('#hd');
    await pull('#hd', row.r - 4, hd2.cy);
    check('beside columns, taken to the edge: the outer column is cut in its middle', (await splits()) === '50,75', await splits());
    // The owner's row: a divider between two lines of the middle column, taken past its side.
    const S = (t) => `<p>${t}</p>`;
    const OWNERS = `<div class="blk-cols" data-block-type="columns" data-split="11,39" style="--split: 11%;"><div class="blk-col"><p>yanda</p><p><br></p></div><hr class="blk-vr"><div class="blk-col" style="--w: 28%;"><hr class="blk-hr">${S('divideri yan kenara götürünce')}<p><br></p><hr id="hs" class="blk-hr">${S('yatay dividerlarda problem')}</div><hr class="blk-vr"><div class="blk-col">${S('bu yatay')}</div></div>`;
    for (const past of [6, 24]) {
      await load(`<p>top</p>${OWNERS}<hr class="blk-hr"><p><br></p>`);
      const mid = await box('#editor .blk-cols > .blk-col:nth-of-type(2)');
      const hs = await box('#hs');
      await pull('#hs', mid.r + past, hs.cy);
      const got = await win.evaluate(() => ({ rows: document.querySelectorAll('#editor .blk-cols').length, flat: [...document.getElementById('editor').children].filter((c) => c.matches('hr.blk-hr')).length }));
      check(`a divider in a column taken ${past}px past its side cuts its part upright, not a move over the note`, got.rows === 2 && got.flat === 1, JSON.stringify(got));
    }
    // Rows standing on each other: a flat divider first in a column keeps its room from the upright one above.
    await load(`<div class="blk-cols" data-split="33" style="--split:33%"><div class="blk-col"><p>a</p></div><hr class="blk-vr"><div class="blk-col"><p>b</p></div></div><div class="blk-cols" data-split="33" style="--split:33%"><div class="blk-col"><hr id="ht" class="blk-hr"><p>c</p></div><hr class="blk-vr"><div class="blk-col"><p>d</p></div></div>`);
    const room = await win.evaluate(() => document.getElementById('ht').getBoundingClientRect().top - document.querySelectorAll('#editor .blk-cols')[1].getBoundingClientRect().top);
    check('a flat divider at the top of a row under a row is not run into by the upright one', room >= 4, String(room));

    // ---- a divider of the note goes past a row of columns ---------------------
    const TALL = `<div class="blk-cols" data-split="50" style="--split:50%"><div class="blk-col">${'<p>words</p>'.repeat(6)}</div><hr class="blk-vr"><div class="blk-col">${'<p><br></p>'.repeat(6)}</div></div>`;
    const spot = () => win.evaluate(() => {
      const hr = document.getElementById('hm');
      const kids = [...document.getElementById('editor').children];
      return `${hr.parentElement.id || hr.parentElement.className} ${kids.indexOf(hr) - kids.findIndex((c) => c.matches('.blk-cols'))}`;
    });
    for (const [dir, html] of [['down', `<p>top</p><hr id="hm" class="blk-hr"><p>a</p>${TALL}<p>b</p><p>c</p>`], ['up', `<p>top</p><p>a</p>${TALL}<p>b</p><hr id="hm" class="blk-hr"><p>c</p>`]]) {
      await load(html);
      const tall = await box('#editor .blk-cols');
      const hm = await box('#hm');
      await pull('#hm', hm.cx + 4, dir === 'down' ? tall.b - 12 : tall.t + 12);
      const got = await spot();
      check(`a divider of the note pulled ${dir} over a row of columns stays on the note, never in a column`, got.startsWith('editor '), got);
    }

    // ---- empty lines cut: as tall as the mark, never a stub --------------------
    const B = '<p><br></p>';
    await load(`<p>top</p><hr class="blk-hr"><p><br></p><hr id="hb" class="blk-hr">${B.repeat(4)}<p id="bl"><br></p><hr class="blk-hr"><p>under</p>`);
    const bl = await box('#bl');
    await pull('#hb', ed.r - 40, bl.b - 4);
    const cut = await win.evaluate(() => { const c = document.querySelector('#editor .blk-cols'); return c ? [c.children[0].children.length, Math.round(c.querySelector('hr.blk-vr').getBoundingClientRect().height)] : null; });
    check('a divider pulled sideways over empty lines takes them all: the upright line is as tall as they were', cut && cut[0] === 5 && cut[1] > 80, JSON.stringify(cut));
    // The owner's stacked rows: a divider over only empty lines in a column cuts the whole column.
    const STACK = `<p>top</p><hr class="blk-hr"><div class="blk-cols" data-split="46,73" style="--split:46%"><div class="blk-col">${B.repeat(4)}</div><hr class="blk-vr"><div class="blk-col" style="--w:27%">${B}</div><hr class="blk-vr"><div class="blk-col">${B.repeat(3)}<hr id="hc" class="blk-hr">${B}</div></div><div class="blk-cols" data-split="46,73" style="--split:46%"><div class="blk-col">${B}<p id="ld">alta inemiyorum</p></div><hr class="blk-vr"><div class="blk-col" style="--w:27%">${B}</div><hr class="blk-vr"><div class="blk-col"><p id="lu">yukarı</p></div></div><hr id="hu" class="blk-hr"><p id="pu"><br></p><p>end</p>`;
    await load(STACK);
    const hc = await box('#hc');
    const third = await box('#editor .blk-cols > .blk-col:nth-of-type(3)');
    await pull('#hc', third.r + 6, hc.cy);
    check('a divider over only empty lines in a column cuts the column top to foot, no row one line high',
      (await splits()) === '46,73,87 46,73', await splits());
    // The owner's Ideas note: two dividers in a column, empty lines between; the upper one pulled level cuts what is under it.
    const FRAMED = `<p>top</p><hr class="blk-hr"><div class="blk-cols" data-split="25,50" style="--split:25%"><div class="blk-col">${B}${B}<hr id="f1" class="blk-hr">${B}<hr id="f2" class="blk-hr"><p>words under</p>${B}</div><hr class="blk-vr"><div class="blk-col" style="--w:25%">${B}</div><hr class="blk-vr"><div class="blk-col">${B}</div></div><p>end</p>`;
    await load(FRAMED);
    const f1 = await box('#f1');
    const firstCol = await box('#editor .blk-cols > .blk-col');
    await pull('#f1', firstCol.r - 40, f1.cy);
    // Ninth try: the part is split inside its column; the columns beside it stay whole.
    const framed = () => win.evaluate(() => {
      const outer = document.querySelector('#editor > .blk-cols');
      const col = outer.querySelector(':scope > .blk-col');
      return [...col.children].map((c) => (c.matches('.blk-cols') ? `[${c.dataset.split}]` : c.id || (c.textContent.trim() ? 'T' : '.'))).join(' ');
    });
    check('the upper of two dividers pulled level cuts the empty lines under it inside its column, the columns beside it whole',
      (await splits()) === '25,50 50' && (await framed()) === '. . [50] f2 T .', `${await splits()} / ${await framed()}`);
    // The owner's pair of dividers with an empty line under it: pulled to the
    // column's side over that line, the line is cut in two, in the column.
    const PAIR = `<hr class="blk-hr"><div class="blk-cols" data-split="25,50" style="--split:25%"><div class="blk-col"><p>words</p>${B}<hr id="q1" class="blk-hr"><hr id="q2" class="blk-hr">${B}</div><hr class="blk-vr"><div class="blk-col" style="--w:25%"><hr id="m1" class="blk-hr">${B}${B}</div><hr class="blk-vr"><div class="blk-col"><div style="height:420px"></div>${B}</div></div><p>end</p>`;
    await load(PAIR);
    const q2 = await box('#q2');
    const line = await box('#q2 + p');
    await pull('#q2', (await box('#editor .blk-cols > .blk-col')).r + 8, line.cy);
    check('the lower of two dividers pulled to the column\'s side over the empty line under it cuts that line in two',
      (await splits()) === '25,50 50' && (await win.evaluate(() => document.querySelector('#q1 + .blk-cols')?.parentElement.matches('#editor > .blk-cols > .blk-col'))), `${await splits()} ${q2.cy}`);
    // The middle column's divider taken down into the empty room beside the tall column: it goes there.
    await load(PAIR);
    const roomCol = await box('#editor .blk-cols > .blk-col:nth-of-type(2)');
    await pull('#m1', (await box('#m1')).cx + 3, roomCol.b - 60);
    const m1 = await box('#m1');
    check('a divider taken down into the empty room of its column goes there, over empty lines',
      Math.abs(m1.cy - (roomCol.b - 60)) < 30 && (await splits()) === '25,50', `${Math.round(m1.cy)} vs ${Math.round(roomCol.b - 60)}`);
    // Tenth try, the owner's Ideas note: in a column of columns in a column, the
    // lower of two dividers pulled right cuts its box in two, as tall as the box.
    const DEEP = (mid) => `<hr class="blk-hr"><div class="blk-cols" data-split="25,50" style="--split:25%"><div class="blk-col">${B}</div><hr class="blk-vr"><div class="blk-col" style="--w:25%">${mid}</div><hr class="blk-vr"><div class="blk-col"><div style="height:420px"></div>${B}</div></div><p>end</p>`;
    const made = (sel) => win.evaluate((s) => {
      const c = document.querySelector(s);
      if (!c) return 'none';
      const cols = [...c.children].filter((x) => x.matches('.blk-col'));
      return `${c.parentElement.closest('.blk-cols') ? 'in' : 'out'} ${cols.map((x) => x.children.length).join('/')} ${Math.round(c.querySelector('hr.blk-vr').getBoundingClientRect().height)}`;
    }, sel);
    await load(DEEP(`<hr class="blk-hr"><div class="blk-cols" data-split="80" style="--split:80%"><div class="blk-col">${B}${B}<hr id="n1" class="blk-hr"><hr id="n2" class="blk-hr"><p>tam üstteki</p>${B}${B}</div><hr class="blk-vr"><div class="blk-col">${B.repeat(7)}</div></div>`));
    const deepCol = await box('#n2');
    await pull('#n2', deepCol.r - 8, deepCol.cy);
    const deep = await made('#n1 + .blk-cols');
    check('in a column of columns in a column, the lower divider pulled right cuts its box in two, all of it',
      deep.startsWith('in 3/1') || deep.startsWith('in 1/3'), `${deep} (column ${Math.round(deepCol.r - deepCol.l)}px)`);
    for (const [what, part, dy] of [['empty lines', B.repeat(3), 14], ['words and the empty lines under them', `<p>words</p>${B}${B}`, 0]]) {
      await load(DEEP(`<hr id="u1" class="blk-hr">${part}<hr class="blk-hr"><p>under</p>`));
      const u1 = await box('#u1');
      await pull('#u1', u1.r - 8, u1.cy + dy);
      const got = await made('#editor .blk-col > .blk-cols');
      check(`a divider over a box of ${what} cuts the whole box, not one line`, got.startsWith('in 3/1') || got.startsWith('in 1/3'), got);
    }
    // Eleventh try, the foot of the owner's Ideas note: the divider under a box
    // of words and empty lines, pulled level, cuts all of the box over it.
    await load(`<p>top</p><hr class="blk-hr"><div class="blk-cols" data-split="47" style="--split:47%"><div class="blk-col"><p>left</p></div><hr class="blk-vr"><div class="blk-col">${B}${B}${B}</div></div><p id="tz">buradan ayırmaya çalıştım -&gt;</p>${B.repeat(8)}<hr id="hz" class="blk-hr">${B.repeat(12)}`);
    const hz = await box('#hz');
    await pull('#hz', ed.cx + 150, hz.cy);
    const low = await win.evaluate(() => { const c = document.getElementById('tz')?.closest('.blk-cols'); return c ? [...c.children].filter((x) => x.matches('.blk-col')).map((x) => x.children.length).join('/') : 'none'; });
    check('the divider under a box of words and empty lines, pulled level, cuts the whole box', low === '9/1' || low === '1/9', low);
    // The foot of an upright divider pulled down: the columns grow, the words under them come in.
    const GROW = `<p>top</p><div class="blk-cols" data-split="50" style="--split:50%"><div class="blk-col"><p>a</p></div><hr id="sv" class="blk-vr"><div class="blk-col"><p>b</p></div></div><p id="w1">words</p>${B.repeat(6)}<p id="w2">stays</p>`;
    await load(GROW);
    const sv = await box('#sv');
    const aim = (await win.evaluate(() => { const r = document.querySelectorAll('#editor > p')[6].getBoundingClientRect(); return (r.top + r.bottom) / 2; }));
    const stretch = async (y) => {
      const v = await box('#sv');
      await win.mouse.move(v.cx, v.b - 3);
      await win.mouse.down();
      await win.mouse.move(v.cx, v.b + (y > v.b ? 8 : -8), { steps: 3 });
      await win.mouse.move(v.cx, y, { steps: 10 });
      await win.mouse.up();
      await win.waitForTimeout(200);
      return win.evaluate(() => ({ h: document.getElementById('sv').getBoundingClientRect().height, w1: !!document.getElementById('w1')?.closest('.blk-col'), w2: !!document.getElementById('w2')?.closest('.blk-col') }));
    };
    const grown = await stretch(aim);
    check('the foot of an upright divider pulled down makes the columns that tall, the words under them come in, the rest stays under',
      grown.h > sv.b - sv.t + 80 && grown.w1 && !grown.w2, JSON.stringify(grown));
    const shrunk = await stretch(sv.t + 40);
    check('pulled back up, the empty lines at the columns\' feet go back under them', shrunk.h < grown.h - 40 && shrunk.w1, JSON.stringify(shrunk));
    // Down out of a row of columns, and Up into the one over it.
    await load(STACK);
    const caretOn = () => win.evaluate(() => { const s = getSelection(); const n = s.anchorNode; const el = n?.nodeType === 3 ? n.parentElement : n; return el?.id || (s.isCollapsed ? el?.tagName : 'range'); });
    await win.evaluate(() => { const t = document.getElementById('ld').firstChild; const r = document.createRange(); r.setStart(t, t.length); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('ArrowDown');
    const onHr = await win.evaluate(() => document.getElementById('hu').classList.contains('armed'));
    await win.keyboard.press('ArrowDown');
    check('Down from the last line of a column picks the divider under the row, then goes on under it', onHr && (await caretOn()) === 'pu', String(onHr) + ' ' + (await caretOn()));
    await win.evaluate(() => { const t = document.getElementById('lu').firstChild; const r = document.createRange(); r.setStart(t, 0); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('ArrowUp');
    const upTo = await win.evaluate(() => { const s = getSelection(); const n = s.anchorNode; const el = n?.nodeType === 3 ? n.parentElement : n; return el?.closest('.blk-col') === document.querySelectorAll('#editor .blk-cols')[0].querySelectorAll('.blk-col')[2] || document.getElementById('hc').classList.contains('armed'); });
    check('Up from the first line of a column goes into the column over it in the row above', upTo);

    // ---- the colour palette and the corner under it ---------------------------
    const foot = () => win.evaluate(() => {
      const top = (q) => document.querySelector(q)?.getBoundingClientRect().top;
      const slot = document.querySelector('.galaxy-slot');
      return { button: top('#btn-new'), tabs: top('.drawer-tabs'), langs: top('#lang-row'), universe: slot?.offsetHeight ?? 0 };
    });
    // A short window, so the open palette has less room than it wants: the
    // corner moved there by a few pixels (the owner's screenshots, 1.0.3).
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 620));
    await win.waitForTimeout(400);
    // Since 1.0.3 the theme's editor stands open in Settings: the corner keeps the Universe.
    const shut = await foot();
    await win.evaluate(() => document.querySelector('#app-menu [data-cmd="settings.open"]').click());
    await win.waitForFunction(() => !document.getElementById('ov-settings').hidden, null, { polling: 50 });
    await win.evaluate(() => document.getElementById('set-tab-look').click());
    await win.waitForTimeout(350);
    const opened = await foot();
    check('the theme’s editor open in Settings: the Universe stays', opened.universe > 0, JSON.stringify(opened));
    check('and nothing in the corner has moved, in a short window too',
      ['button', 'tabs', 'langs', 'universe'].every((k) => Math.abs(opened[k] - shut[k]) < 1), JSON.stringify({ shut, opened }));
    await win.click('#settings-close');
    await win.waitForTimeout(250);
    check('shut again, the corner is as it was', JSON.stringify(await foot()) === JSON.stringify(shut), JSON.stringify(await foot()));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 900));
    await win.waitForTimeout(400);

    // ---- no letters for small bodies on the Universe --------------------------
    await win.evaluate(() => {
      const real = CanvasRenderingContext2D.prototype.fillText;
      window.glyphs = new Set();
      CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
        // '*' is the sky's own stars, drawn one by one.
        // Nor a lone '@': every far body is a little planet (the owner, 1.0.3).
        if (['o', '0', '@'].includes(String(text).trim())) window.glyphs.add(String(text));
        return real.call(this, text, ...rest);
      };
    });
    await win.waitForTimeout(600);
    await win.click('.galaxy-mini .galaxy-full');
    await win.waitForTimeout(800);
    await win.mouse.move(650, 450);
    for (let i = 0; i < 6; i++) { await win.mouse.wheel(0, 400); await win.waitForTimeout(120); }
    await win.waitForTimeout(400);
    if (process.env.NEBULA_SHOTS) await win.screenshot({ path: path.join(process.env.NEBULA_SHOTS, 'universe-far.png') });
    const glyphs = await win.evaluate(() => [...window.glyphs]);
    check('far away, no body of the Universe is a letter (o, 0 or @): each is a little planet', glyphs.length === 0, JSON.stringify(glyphs));
    await win.keyboard.press('Escape');
    await win.waitForTimeout(300);

    // ---- an embedded page opens no one else's folders -------------------------
    await win.evaluate(() => document.querySelector('.galaxy-close, #galaxy-close')?.click());
    await open('embed', '#editor .link-embed');
    await win.waitForFunction(() => document.querySelector('#editor webview'), null, { polling: 100, timeout: 15_000 }).catch(() => {});
    await win.waitForTimeout(1500);
    const partitions = path.join(profile, 'Partitions');
    const folders = fs.existsSync(partitions) ? fs.readdirSync(partitions) : [];
    check('an embedded page opens no AI service\'s profile', !folders.some((f) => f.startsWith('ai-')), JSON.stringify(folders));

    // ---- the page lost: it comes back, and says so if it cannot ---------------
    // Asked from the main process: Playwright's own handle on the page dies with it.
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer(); });
    const rows = () => app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0]?.webContents;
      return wc && !wc.isCrashed() && !wc.isLoading() ? wc.executeJavaScript('document.querySelectorAll(".note-row").length').catch(() => 0) : 0;
    }).catch(() => 0);
    let back = 0;
    for (let t = 0; t < 20_000 && back < 4; t += 300) { await new Promise((ok) => setTimeout(ok, 300)); back = await rows(); }
    check('a crashed page loads again by itself, with the notes on it', back >= 4, String(back));
    check('and it asked nothing the first time', (await app.evaluate(() => globalThis.__asks.length)) === 0);
  } finally {
    await app?.close().catch(() => {});
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let failed = 0;
  await runIdeas103bChecks((name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  });
  process.exit(failed ? 1 : 0);
}
