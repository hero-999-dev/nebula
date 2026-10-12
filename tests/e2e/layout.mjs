/**
 * 0.9.4 — part 5 of the owner's Ideas note, in the real app on a throwaway
 * profile: where a picture in the text stands, pictures side by side, and a
 * divider that splits the page into two columns.
 *
 *   node tests/e2e/layout.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const picture = (id, width) => `<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" data-ratio="1" style="width: ${width}px;" id="${id}"><img src="${PNG}" alt="Pasted image" draggable="false"></figure>`;

export async function runLayoutChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-layout-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`),
    JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1, ...extra }));
  seed('other', '<p>another note</p>');
  seed('pictures', `<p id="top">first line</p>${picture('pic1', 240)}${picture('pic2', 200)}<p id="mid">a line under the pictures</p><p id="low">the last line</p>`);
  seed('three', `<p id="t0">three pictures</p>${picture('ta', 200)}${picture('tb', 180)}${picture('tc', 160)}<p id="t1">and a line under them</p>`);
  seed('split','<p id="s0">above the divider</p><hr class="blk-hr" id="h1"><h2 id="s1">Pixel 2D Art Studies</h2><p id="s2">a line of notes</p>'
    + `${picture('spic', 260)}<p id="s3">under the picture</p><hr class="blk-hr" id="h2"><p id="s4">below the second divider</p>`);
  seed('more', '<p id="m0">top</p><div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col"><p id="ml">left words</p><hr class="blk-hr" id="mh"><p id="ml2">more left</p></div>'
    + '<hr class="blk-vr"><div class="blk-col"><p id="mr">right words</p></div></div><hr class="blk-hr" id="mh2"><p id="m1">under</p>');
  seed('word', `<p id="w0">The quick brown fox jumps over the lazy dog.</p>${picture('wp', 60)}<p id="w1">A second line of words to drag the picture into.</p>`);
  // What the owner's note held on the first build: a picture alone in the left column, a line and a picture in the right.
  seed('colpic', `<p id="c0">above</p><div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col" id="cl">${picture('cp1', 1602)}</div><hr class="blk-vr">`
    + `<div class="blk-col" id="cr"><p id="c1">a line over the picture</p>${picture('cp2', 1602)}</div></div><p id="c2">below</p>`);
  seed('dash', '<h2 id="d0">a heading to turn back</h2><div class="blk-cols" data-block-type="columns" data-split="25,50,75" style="--split: 25%;"><div class="blk-col"><p>one</p></div><hr class="blk-vr">'
    + '<div class="blk-col" style="--w: 25%;"><p>two</p></div><hr class="blk-vr"><div class="blk-col" style="--w: 25%;"><p>three</p></div><hr class="blk-vr"><div class="blk-col" id="d4"><p id="d4p">four</p></div></div><p id="d1"><br></p>');
  seed('part','<p id="a">one</p><p id="b">two</p><p id="c">three</p><hr class="blk-hr" id="h"><p id="d">four</p><p id="e">five</p>');
  // A code block, a bookmark and a video of the note's own (its file is not there: the card is), over two columns.
  seed('blocks', '<p id="k0">first line</p>'
    + '<div class="blk-code" id="kc" data-block-type="code" data-lang="plain" data-code="let%20a%20%3D%201" contenteditable="false"><div class="code-head"><select class="code-lang" title="Code language"></select>'
    + '<span class="code-hint">markdown-style block · click the code to edit</span><button type="button" class="code-copy" title="Copy code">Copy</button><button type="button" class="code-del">✕</button></div>'
    + '<pre class="code-body"><code class="code-src" contenteditable="true" spellcheck="false"></code></pre></div><p id="k1">a line under the code</p>'
    + '<div class="link-block link-bookmark" id="kb" contenteditable="false" data-block-type="link" data-kind="bookmark" data-url="http://127.0.0.1:1/"><a class="link-card" href="http://127.0.0.1:1/" target="_blank" rel="noopener noreferrer">'
    + '<span class="link-card__kind">Bookmark</span><strong class="link-card__title">a bookmark</strong><small class="link-card__url">http://127.0.0.1:1/</small></a><button type="button" class="link-del" data-link-remove="true">×</button></div>'
    + '<p id="k2">a line under the card</p>'
    + '<div class="link-block link-embed link-file" id="kv" contenteditable="false" data-block-type="link" data-kind="file" data-name="clip.mp4"><a class="link-card"><span class="link-card__kind">Video</span><strong class="link-card__title">clip.mp4</strong></a>'
    + '<button type="button" class="link-del" data-link-remove="true">×</button><video class="link-frame" controls preload="metadata" src="nebula-media://note/blocks/vid-abc-0123abcd.mp4"></video></div><p id="k3">the last line</p>'
    + '<div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col" id="kl"><p id="k4">left</p></div><hr class="blk-vr"><div class="blk-col" id="kr"><p id="k5">right</p></div></div><p id="k6">under</p>'
    + '<div class="link-block link-embed" contenteditable="false" data-block-type="link" data-kind="embed" data-url="http://127.0.0.1:1/"><a class="link-card" href="http://127.0.0.1:1/">x</a></div><p id="k7">the end</p>');
  // Blocks that take no caret with no line between or under them: a code block, a bookmark, and a bookmark as the last thing.
  const bookmark = (id) => `<div class="link-block link-bookmark" id="${id}" contenteditable="false" data-block-type="link" data-kind="bookmark" data-url="http://127.0.0.1:1/"><a class="link-card" href="http://127.0.0.1:1/" target="_blank" rel="noopener noreferrer">`
    + '<span class="link-card__kind">Bookmark</span><strong class="link-card__title">a bookmark</strong><small class="link-card__url">http://127.0.0.1:1/</small></a><button type="button" class="link-del" data-link-remove="true">×</button></div>';
  seed('gaps', '<p id="g0">the first line of a note that is long enough to click in</p><div class="blk-code" id="gc" data-block-type="code" data-lang="plain" data-code="x" contenteditable="false"><div class="code-head"><select class="code-lang" title="Code language"></select>'
    + `<button type="button" class="code-copy" title="Copy code">Copy</button></div><pre class="code-body"><code class="code-src" contenteditable="true" spellcheck="false"></code></pre></div>${bookmark('gb')}<p id="g1">a line between the cards, to click over</p>${bookmark('gl')}`);
  seed('locked', '<p id="q0">a locked note</p><div class="blk-code" id="qc" data-block-type="code" data-lang="plain" data-code="x" contenteditable="false"><div class="code-head"><select class="code-lang" title="Code language"></select>'
    + '<button type="button" class="code-copy" title="Copy code">Copy</button></div><pre class="code-body"><code class="code-src" contenteditable="true" spellcheck="false"></code></pre></div><p id="q1">a line under the code</p>', { readOnly: true });
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 800));
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
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, cls: el.className };
    }, selector);
    /** The inside of the note's page, in the window. */
    const page = () => win.evaluate(() => {
      const ed = document.getElementById('editor');
      const r = ed.getBoundingClientRect();
      const css = getComputedStyle(ed);
      const left = r.left + parseFloat(css.paddingLeft) + parseFloat(css.borderLeftWidth);
      const right = r.left + parseFloat(css.borderLeftWidth) + ed.clientWidth - parseFloat(css.paddingRight);
      return { left, right, cx: (left + right) / 2 };
    });
    const mark = () => win.evaluate(() => {
      const m = document.querySelector('.drop-mark');
      if (!m || m.hidden) return null;
      const r = m.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, upright: r.height > r.width };
    });
    const order = () => win.evaluate(() => [...document.querySelectorAll('#editor > *')].filter((e) => !e.matches('.shape-layer, .image-layer')).map((e) => e.id || e.tagName.toLowerCase()).join(','));
    const drag = async (from, to, { hold = false, steps = 8 } = {}) => {
      await win.mouse.move(from.x, from.y);
      await win.mouse.down();
      await win.mouse.move(from.x + 4, from.y + 4);
      await win.mouse.move(to.x, to.y, { steps });
      await win.waitForTimeout(60);
      if (!hold) { await win.mouse.up(); await win.waitForTimeout(120); }
    };
    const barButton = (name) => win.evaluate((n) => {
      const b = document.querySelector(`#image-bar [data-image="${n}"]`);
      return { shown: !document.getElementById('image-bar').hidden && !b.hidden, on: b.classList.contains('on'), disabled: b.disabled };
    }, name);
    const pressBar = async (name) => { await win.evaluate((n) => document.querySelector(`#image-bar [data-image="${n}"]`).click(), name); await win.waitForTimeout(80); };

    // ---- A picture in the text: left, centre or right ----------------------------
    await open('pictures');
    let p1 = await box('#pic1');
    await win.mouse.click(p1.cx, p1.cy);
    await win.waitForTimeout(120);
    const bar0 = { left: await barButton('left'), center: await barButton('center'), beside: await barButton('beside') };
    check('a picture in the text shows where it stands on its bar: left, lit', bar0.left.shown && bar0.left.on && bar0.center.shown && !bar0.center.on && bar0.beside.shown && bar0.beside.disabled,
      JSON.stringify(bar0));
    let pg = await page();
    await pressBar('center');
    p1 = await box('#pic1');
    check('the middle button puts it in the middle of its line', Math.abs(p1.cx - pg.cx) < 2 && (await barButton('center')).on && !(await barButton('left')).on, JSON.stringify({ p1, pg }));
    await pressBar('right');
    p1 = await box('#pic1');
    check('the right button at the right', Math.abs(p1.right - pg.right) < 2 && /note-image--right/.test(p1.cls), JSON.stringify({ p1, pg }));
    check('the lines keep their order around it', await order() === 'top,pic1,pic2,mid,low', await order());

    // Pulled sideways on its own line, it snaps.
    await drag({ x: p1.cx, y: p1.cy }, { x: p1.cx - (pg.right - pg.left) / 2, y: p1.cy + 3 }, { hold: true });
    const midway = await box('#pic1');
    await win.mouse.up();
    await win.waitForTimeout(120);
    check('pulled half the line to the left it stands in the middle, already while held', Math.abs(midway.cx - pg.cx) < 2 && /note-image--center/.test((await box('#pic1')).cls), JSON.stringify(midway));
    p1 = await box('#pic1');
    await drag({ x: p1.cx, y: p1.cy }, { x: pg.left + 20, y: p1.cy });
    p1 = await box('#pic1');
    check('and pulled on, at the left', Math.abs(p1.left - pg.left) < 2 && !/note-image--(center|right)/.test(p1.cls), JSON.stringify(p1));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(150);
    check('one Ctrl+Z puts it back in the middle', /note-image--center/.test((await box('#pic1')).cls), (await box('#pic1')).cls);
    await win.keyboard.press('Control+y');
    await win.waitForTimeout(150);

    // ---- Beside another picture ----------------------------------------------------
    p1 = await box('#pic1');
    let p2 = await box('#pic2');
    check('two pictures stand one under the other to begin with', p2.top >= p1.bottom, JSON.stringify({ p1, p2 }));
    await drag({ x: p2.cx, y: p2.cy }, { x: p1.right - 30, y: p1.cy }, { hold: true });
    const held = { mark: await mark(), order: await order(), p2: await box('#pic2') };
    check('held over the right half of the other, an upright mark stands at its right side — and nothing has moved',
      !!held.mark && held.mark.upright && Math.abs(held.mark.left - p1.right) < 12 && Math.abs(held.mark.height - p1.height) < 3 && held.order === 'top,pic1,pic2,mid,low'
      && Math.abs(held.p2.top - p2.top) < 1, JSON.stringify({ held, p1 }));
    await win.mouse.up();
    await win.waitForTimeout(150);
    p1 = await box('#pic1');
    p2 = await box('#pic2');
    check('let go, the two share the line', Math.abs(p1.top - p2.top) < 2 && p2.left >= p1.right && /note-image--row/.test(p1.cls) && /note-image--row/.test(p2.cls) && !(await mark()),
      JSON.stringify({ p1, p2 }));
    check('the bar says so: “beside” is lit', (await barButton('beside')).on && !(await barButton('left')).on, JSON.stringify(await barButton('beside')));
    const below = await box('#mid');
    check('the words go on under the taller one', below.top >= Math.max(p1.bottom, p2.bottom), JSON.stringify({ below, p1, p2 }));

    // A narrow window: smaller, not cut off.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(700, 800));
    await win.waitForTimeout(350);
    pg = await page();
    p1 = await box('#pic1');
    p2 = await box('#pic2');
    check('in a narrow window they are still side by side and inside the page', Math.abs(p1.top - p2.top) < 2 && p2.right <= pg.right + 1 && p1.left >= pg.left - 1 && p1.width < 240,
      JSON.stringify({ p1, p2, pg }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 800));
    await win.waitForTimeout(350);
    pg = await page();

    // Swapped by a drag onto the other side.
    p1 = await box('#pic1');
    p2 = await box('#pic2');
    await drag({ x: p2.cx, y: p2.cy }, { x: p1.left + 20, y: p1.cy });
    check('dropped on the other’s left half it stands before it', await order() === 'top,pic2,pic1,mid,low' && (await box('#pic2')).left < (await box('#pic1')).left, await order());

    // Out of the row: the button, and a drag to a gap.
    await pressBar('beside');
    p1 = await box('#pic1');
    p2 = await box('#pic2');
    check('“beside” pressed again gives it a line of its own under the other', p2.top >= p1.bottom && !/note-image--row/.test(p1.cls) && !/note-image--row/.test(p2.cls)
      && await order() === 'top,pic1,pic2,mid,low', JSON.stringify({ p1, p2, order: await order() }));
    await pressBar('beside');
    check('and once more puts it back beside the one before it', Math.abs((await box('#pic1')).top - (await box('#pic2')).top) < 2);
    p2 = await box('#pic2');
    const low = await box('#low');
    await drag({ x: p2.cx, y: p2.cy }, { x: low.left + 60, y: low.top - 3 }, { hold: true });
    const flat = await mark();
    check('held between two lines, a flat mark lies there, as wide as the page', !!flat && !flat.upright && Math.abs(flat.width - (pg.right - pg.left)) < 3 && Math.abs(flat.top - low.top) < 14, JSON.stringify({ flat, low, pg }));
    await win.mouse.up();
    await win.waitForTimeout(150);
    check('let go, the picture moves there, out of its row', await order() === 'top,pic1,mid,pic2,low' && !/note-image--row/.test((await box('#pic1')).cls) && !/note-image--row/.test((await box('#pic2')).cls),
      `${await order()} ${(await box('#pic2')).cls}`);

    // Esc gives the drag up.
    p2 = await box('#pic2');
    const top = await box('#top');
    await drag({ x: p2.cx, y: p2.cy }, { x: top.left + 40, y: top.top - 4 }, { hold: true });
    const before = !!(await mark());
    await win.keyboard.press('Escape');
    await win.mouse.up();
    await win.waitForTimeout(120);
    check('Esc while dragging leaves everything where it was', before && !(await mark()) && await order() === 'top,pic1,mid,pic2,low', `${before} ${JSON.stringify(await mark())} ${await order()}`);

    // A picture set free leaves no row behind.
    p1 = await box('#pic1');
    p2 = await box('#pic2');
    await drag({ x: p2.cx, y: p2.cy }, { x: p1.right - 20, y: p1.cy });
    await pressBar('front');
    await win.waitForTimeout(120);
    const freed = await win.evaluate(() => ({ p1: document.getElementById('pic1').className, p2: document.getElementById('pic2').className, floats: !!document.getElementById('pic2').closest('.shape-layer') }));
    check('a picture set floating takes the row with it', freed.floats && !/note-image--(row|inline)/.test(freed.p2) && !/note-image--row/.test(freed.p1) && !(await barButton('left')).shown, JSON.stringify(freed));
    await win.keyboard.press('Escape');

    // ---- The owner's first try: "a bug in making pictures bigger and smaller, and
    //      a problem adding a third picture" --------------------------------------
    await open('three');
    pg = await page();
    const tops = async () => (await Promise.all(['#ta', '#tb', '#tc'].map((s) => box(s)))).map((b) => Math.round(b.top));
    const grab = async (selector, corner = 'se') => {
      const b = await box(selector);
      await win.mouse.click(b.cx, b.cy);
      await win.waitForTimeout(100);
      const h = await box(`${selector} .image-h[data-corner="${corner}"]`);
      return { x: h.cx, y: h.cy, box: await box(selector) };
    };
    const pull = async (from, dx, dy = 0) => {
      await win.mouse.move(from.x, from.y);
      await win.mouse.down();
      await win.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
      await win.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
      await win.mouse.up();
      await win.waitForTimeout(120);
    };
    // Bigger and smaller, the corner under the pointer.
    let g = await grab('#ta');
    await pull(g, 60);
    let ta = await box('#ta');
    check('a picture at the left grows by as much as its corner is pulled', Math.abs(ta.width - g.box.width - 60) < 3 && Math.abs(ta.right - g.box.right - 60) < 3, JSON.stringify({ before: g.box, ta }));
    await pressBar('center');
    g = await grab('#ta');
    await pull(g, 40);
    ta = await box('#ta');
    check('one in the middle grows to both sides, its corner still under the pointer', Math.abs(ta.right - g.box.right - 40) < 3 && Math.abs(ta.width - g.box.width - 80) < 4 && Math.abs(ta.cx - pg.cx) < 2,
      JSON.stringify({ before: g.box, ta, pg }));
    g = await grab('#ta');
    await pull(g, -70);
    ta = await box('#ta');
    check('and smaller the same way', Math.abs(ta.right - g.box.right + 70) < 3 && Math.abs(ta.width - g.box.width + 140) < 4, JSON.stringify({ before: g.box, ta }));
    await pressBar('left');

    // A third picture beside two.
    let a3 = await box('#ta');
    let b3 = await box('#tb');
    await drag({ x: b3.cx, y: b3.cy }, { x: a3.right - 20, y: a3.cy });
    b3 = await box('#tb');
    // Two in a row: the right one may grow into the room the left one leaves — past its half of the
    // line ("it does not grow to the right any more", the owner) — and never past the line.
    {
      pg = await page();
      const half = (pg.right - pg.left) / 2;
      a3 = await box('#ta');
      g = await grab('#tb');
      await pull(g, pg.right - g.x + 60);
      const wide = await box('#tb');
      const left = await box('#ta');
      const told = await win.evaluate(() => ['ta', 'tb'].map((id) => document.getElementById(id).style.getPropertyValue('--beside')).join(' '));
      check('beside a narrow picture, one pulled out grows past half the line into the room that is left, and stops at the line’s end', a3.width < half - 30 && wide.width > half + 20
        && Math.abs(wide.top - left.top) < 2 && Math.abs(left.width - a3.width) < 1 && wide.right <= pg.right + 1 && pg.right - wide.right < 16, JSON.stringify({ half, a: a3.width, wide, told, pg }));
      // Back to what it was, by the corner at its top: the one at its foot is under the window's edge now.
      g = await grab('#tb', 'ne');
      await pull(g, -(wide.width - b3.width));
      b3 = await box('#tb');
    }
    const c3 = await box('#tc');
    await drag({ x: c3.cx, y: c3.cy }, { x: b3.right - 20, y: b3.cy });
    let row = await tops();
    const rowed = await win.evaluate(() => ['ta', 'tb', 'tc'].map((id) => `${document.getElementById(id).classList.contains('note-image--row')}:${document.getElementById(id).style.getPropertyValue('--row')}`).join(' '));
    check('a third picture dropped beside two shares their line', row[0] === row[1] && row[1] === row[2] && rowed === 'true:3 true:3 true:3' && (await box('#tc')).left > (await box('#tb')).right - 1,
      `${row} ${rowed}`);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(700, 800));
    await win.waitForTimeout(350);
    pg = await page();
    row = await tops();
    const fit = { a: await box('#ta'), c: await box('#tc') };
    check('three stay on one line in a narrow window, inside the page', row[0] === row[1] && row[1] === row[2] && fit.a.left >= pg.left - 1 && fit.c.right <= pg.right + 1, JSON.stringify({ row, fit, pg }));
    // Held back by the row: pulled far out it does not store a width it cannot have …
    g = await grab('#ta');
    await pull(g, 220);
    const capped = await win.evaluate(() => { const f = document.getElementById('ta'); return { given: parseFloat(f.style.width), drawn: parseFloat(getComputedStyle(f).width) }; });
    check('a picture pulled wider than its share of the line keeps the width it is drawn at', capped.given <= capped.drawn + 1, JSON.stringify(capped));
    // … so the next pull inward makes it smaller at once.
    g = await grab('#ta');
    await pull(g, -30);
    ta = await box('#ta');
    check('and gets smaller from the first pixel of the next pull', Math.abs(ta.width - g.box.width + 30) < 4, JSON.stringify({ before: g.box, ta }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 800));
    await win.waitForTimeout(350);
    // The button, too: out, and back in as the third.
    await win.mouse.click((await box('#tc')).cx, (await box('#tc')).cy);
    await pressBar('beside');
    const outOf = await win.evaluate(() => ['ta', 'tb', 'tc'].map((id) => document.getElementById(id).style.getPropertyValue('--row') || '-').join(' '));
    await pressBar('beside');
    const backIn = await win.evaluate(() => ['ta', 'tb', 'tc'].map((id) => document.getElementById(id).style.getPropertyValue('--row') || '-').join(' '));
    check('“beside” takes the third out (two are left sharing) and puts it back', outOf === '2 2 -' && backIn === '3 3 3', `${outOf} / ${backIn}`);
    await win.keyboard.press('Escape');

    // ---- A divider that splits the page -----------------------------------------
    await open('split');
    const struct = () => win.evaluate(() => {
      const seen = new Set();
      const name = (e) => { if (e.id && !seen.has(e.id)) { seen.add(e.id); return e.id; } return e.tagName.toLowerCase(); };
      const flow = (parent) => [...parent.children].filter((e) => !e.matches('.shape-layer, .image-layer')).map((e) => (e.classList.contains('blk-cols')
        ? `[${[...e.children].map((c) => (c.matches('hr') ? '|' : flow(c))).join(' ')}]` : name(e))).join(',');
      return flow(document.getElementById('editor'));
    });
    const shade = () => win.evaluate(() => {
      const s = document.querySelector('.drop-shade');
      if (!s || s.hidden) return null;
      const r = s.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
    pg = await page();
    const start = await struct();
    check('the note begins as one flow with two dividers', start === 's0,h1,s1,s2,spic,s3,h2,s4', start);

    // Pulled up: it moves, a flat mark first.
    let h2 = await box('#h2');
    const s2 = await box('#s2');
    await drag({ x: pg.left + 200, y: h2.cy }, { x: pg.left + 210, y: s2.top - 2 }, { hold: true });
    const moveMark = await mark();
    check('a divider pulled up shows a flat mark between two lines, and stays put while held', !!moveMark && !moveMark.upright && Math.abs(moveMark.top - s2.top) < 14 && await struct() === start,
      JSON.stringify({ moveMark, s2 }));
    await win.mouse.up();
    await win.waitForTimeout(150);
    check('let go, the divider lies there', await struct() === 's0,h1,s1,h2,s2,spic,s3,s4', await struct());
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);
    check('and one Ctrl+Z puts it back', await struct() === start, await struct());

    // Pulled sideways: it stands up — shown first.
    h2 = await box('#h2');
    const s1 = await box('#s1');
    const s3 = await box('#s3');
    await drag({ x: pg.left + 200, y: h2.cy }, { x: pg.cx + 4, y: h2.cy + 2 }, { hold: true });
    const up = { mark: await mark(), shade: await shade(), struct: await struct() };
    check('pulled sideways, the mark stands upright in the middle of the page, from the divider above down to this one',
      !!up.mark && up.mark.upright && Math.abs(up.mark.left + up.mark.width / 2 - pg.cx) < 3 && Math.abs(up.mark.top - s1.top) < 3 && up.mark.top + up.mark.height >= s3.bottom - 1,
      JSON.stringify({ up, s1, s3, pg }));
    check('the part that will be split is tinted, and nothing has changed yet', !!up.shade && Math.abs(up.shade.left - pg.left) < 2 && Math.abs(up.shade.right - pg.right) < 2 && up.struct === start, JSON.stringify(up));
    await win.keyboard.press('Escape');
    await win.mouse.up();
    await win.waitForTimeout(120);
    check('Esc gives it up: no mark, no change', !(await mark()) && !(await shade()) && await struct() === start, await struct());

    await drag({ x: pg.left + 200, y: h2.cy }, { x: pg.cx + 4, y: h2.cy + 2 });
    const split = await struct();
    check('let go, the part between the two dividers is two columns: what was there at the left, an empty line at the right, the divider between',
      split === 's0,h1,[s1,s2,spic,s3 | p],s4', split);
    const cols = await win.evaluate(() => {
      const c = document.querySelector('#editor .blk-cols');
      const [l, r] = c.querySelectorAll(':scope > .blk-col');
      const rule = c.querySelector(':scope > hr.blk-vr').getBoundingClientRect();
      const lr = l.getBoundingClientRect();
      const rr = r.getBoundingClientRect();
      const sel = getSelection();
      return { split: c.dataset.split, style: c.getAttribute('style'), rule: (rule.left + rule.right) / 2, ruleH: rule.height, height: c.getBoundingClientRect().height,
        left: { l: lr.left, r: lr.right }, right: { l: rr.left, r: rr.right }, caretInRight: r.contains(sel.anchorNode), pic: document.getElementById('spic').getBoundingClientRect().right };
    });
    check('the divider stands upright in the middle, as tall as the columns', cols.split === '50' && /--split:\s*50%/.test(cols.style) && Math.abs(cols.rule - pg.cx) < 2 && Math.abs(cols.ruleH - cols.height) < 2,
      JSON.stringify({ cols, pg }));
    check('the columns lie side by side inside the page, the picture inside its column', cols.left.r < cols.rule && cols.right.l > cols.rule && Math.abs(cols.left.l - pg.left) < 2 && Math.abs(cols.right.r - pg.right) < 2
      && cols.pic <= cols.left.r + 1, JSON.stringify(cols));
    check('and the caret waits in the empty column', cols.caretInRight, JSON.stringify(cols));
    await win.keyboard.type('notes at the right');
    await win.keyboard.press('Enter');
    await win.keyboard.type('/bullet');
    await win.waitForTimeout(250);
    await win.keyboard.press('Enter');
    await win.waitForTimeout(150);
    await win.keyboard.type('a list there');
    await win.waitForTimeout(150);
    const typed = await win.evaluate(() => {
      const r = document.querySelectorAll('#editor .blk-col')[1];
      return { text: r.textContent, kids: [...r.children].map((e) => e.tagName.toLowerCase()).join(','), top: r.firstElementChild.getBoundingClientRect().top, left: document.getElementById('s1').getBoundingClientRect().top };
    });
    check('words typed there stay in the right column, level with the left one’s first line — a list too', /notes at the right/.test(typed.text) && /a list there/.test(typed.text) && typed.kids === 'p,ul'
      && Math.abs(typed.top - typed.left) < 12, JSON.stringify(typed));

    // The keys that would take a column apart do nothing at its edges.
    await win.evaluate(() => {
      const p = document.querySelectorAll('#editor .blk-col')[1].firstElementChild;
      const r = document.createRange();
      r.setStart(p.firstChild, 0);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.press('Backspace');
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(120);
    check('Backspace at the start of a column leaves the columns as they are', /^s0,h1,\[s1,s2,spic,s3 \| p,ul\],s4$/.test(await struct()), await struct());
    await win.evaluate(() => {
      const p = document.getElementById('s3');
      const r = document.createRange();
      r.selectNodeContents(p);
      r.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.press('Delete');
    await win.waitForTimeout(120);
    check('and Delete at the end of one', /^s0,h1,\[s1,s2,spic,s3 \| p,ul\],s4$/.test(await struct()) && await win.evaluate(() => document.getElementById('s3').textContent === 'under the picture'), await struct());
    await win.keyboard.press('Enter');
    await win.keyboard.type('more at the left');
    await win.waitForTimeout(120);
    check('Enter and words in the left column stay in the left column', /^s0,h1,\[s1,s2,spic,s3,p \| p,ul\],s4$/.test(await struct()), await struct());

    // A picture pasted in a column stays in the column; one dragged over goes to the other.
    const COLS_NOW = /^s0,h1,\[s1,s2,spic,s3,p \| p,ul\],s4$/;
    await win.evaluate(() => {
      const p = document.querySelectorAll('#editor .blk-col')[1].firstElementChild;
      const r = document.createRange();
      r.selectNodeContents(p);
      r.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    // Electron 44 writes the clipboard as ClipboardItems (electron/context-menu.js).
    await app.evaluate(async ({ clipboard, nativeImage, ClipboardItem }, png) => {
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([nativeImage.createFromDataURL(png).toPNG()], { type: 'image/png' }) })]);
    }, PNG);
    await win.keyboard.press('Control+v');
    await win.waitForFunction(() => document.querySelectorAll('#editor .note-image').length === 2, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.waitForTimeout(150);
    check('a picture pasted in the right column goes into the right column, under the caret’s line', await struct() === 's0,h1,[s1,s2,spic,s3,p | p,figure,ul],s4', await struct());
    await win.keyboard.press('Delete');
    await win.waitForTimeout(150);
    check('and Delete takes it away again', COLS_NOW.test(await struct()), await struct());
    const sp = await box('#spic');
    const list = await box('#editor .blk-col:last-child ul');
    await drag({ x: sp.cx, y: sp.cy }, { x: list.left + 60, y: list.top - 2 }, { hold: true });
    const inCol = await mark();
    await win.mouse.up();
    await win.waitForTimeout(150);
    check('a picture dragged into the other column shows its mark there, as wide as that column, and lands there',
      !!inCol && !inCol.upright && inCol.left >= list.left - 30 && inCol.width < (pg.right - pg.left) * 0.6 && await struct() === 's0,h1,[s1,s2,s3,p | p,spic,ul],s4',
      `${JSON.stringify(inCol)} ${await struct()}`);
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);
    check('Ctrl+Z takes it back to its own column', COLS_NOW.test(await struct()), await struct());

    // Words selected across both columns and deleted: what is left is still a sound note.
    await win.evaluate(() => {
      const from = document.getElementById('s2').firstChild;
      const to = document.querySelectorAll('#editor .blk-col')[1].firstElementChild;
      const r = document.createRange();
      r.setStart(from, 2);
      r.setEnd(to.firstChild, 5);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.press('Delete');
    await win.waitForTimeout(200);
    const sound = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const blocks = [...ed.querySelectorAll('.blk-cols')];
      const whole = blocks.every((c) => c.children.length === 3 && c.children[0].matches('.blk-col') && c.children[1].matches('hr.blk-vr') && c.children[2].matches('.blk-col')
        && c.children[0].firstElementChild && c.children[2].firstElementChild);
      const stray = [...ed.querySelectorAll('.blk-col, hr.blk-vr')].some((e) => !e.parentElement.classList.contains('blk-cols'));
      return { whole, stray, text: ed.textContent.replace(/\s+/g, ' ') };
    });
    check('a selection across both columns, deleted, leaves whole columns or none — and the words outside it', sound.whole && !sound.stray && /Pixel 2D Art Studies/.test(sound.text) && /a list there/.test(sound.text)
      && /below the second divider/.test(sound.text), JSON.stringify(sound));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(250);
    check('and Ctrl+Z gives everything back', COLS_NOW.test(await struct()) && await win.evaluate(() => document.getElementById('s2').textContent === 'a line of notes'), await struct());

    // The upright divider: moved sideways, picked, deleted.
    pg = await page(); // the note is longer now: a scrollbar took some of the page's width
    let vr = await box('#editor hr.blk-vr');
    await drag({ x: vr.cx, y: vr.cy }, { x: pg.left + (pg.right - pg.left) * 0.3, y: vr.cy + 5 });
    vr = await box('#editor hr.blk-vr');
    const narrow = await win.evaluate(() => document.querySelector('#editor .blk-cols').dataset.split);
    check('dragged sideways, the upright divider makes the left column narrower', narrow === '30' && Math.abs(vr.cx - (pg.left + (pg.right - pg.left) * 0.3)) < 3, `${narrow} ${JSON.stringify(vr)} ${JSON.stringify(pg)}`);
    await drag({ x: vr.cx, y: vr.cy }, { x: pg.left + 10, y: vr.cy });
    check('but never narrower than a fifth of the line', await win.evaluate(() => document.querySelector('#editor .blk-cols').dataset.split) === '20');
    vr = await box('#editor hr.blk-vr');
    await win.mouse.click(vr.cx, vr.cy);
    await win.waitForTimeout(120);
    check('a click picks it', /armed/.test((await box('#editor hr.blk-vr')).cls));
    await win.keyboard.press('Delete');
    await win.waitForTimeout(150);
    check('Delete takes the divider away: one flow again, left first, then right', /^s0,h1,s1,s2,spic,s3,p,p,ul,s4$/.test(await struct()) && !(await win.evaluate(() => document.querySelector('#editor .blk-cols, #editor .blk-col, #editor hr.blk-vr'))),
      await struct());
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);
    check('Ctrl+Z brings the columns back', /^s0,h1,\[s1,s2,spic,s3,p \| p,ul\],s4$/.test(await struct()), await struct());

    // What is stored: no armed divider, the split on the block.
    await win.waitForTimeout(1200);
    const stored = JSON.parse(fs.readFileSync(path.join(notes, 'split', 'split.json'), 'utf8')).content;
    check('the note is saved with its columns, and nothing of the screen in it', /class="blk-cols"[^>]*data-split="20"/.test(stored.replace(/data-split="20"([^>]*)class="blk-cols"/, 'class="blk-cols"$1data-split="20"'))
      && /<hr class="blk-vr">/.test(stored) && !/armed|drop-mark/.test(stored), stored.slice(0, 400));

    // Opened again, it is the same.
    await open('other');
    await open('split');
    check('opened again, the columns are as they were left', /^s0,h1,\[s1,s2,spic,s3,p \| p,ul\],s4$/.test(await struct()) && await win.evaluate(() => document.querySelector('#editor .blk-cols').dataset.split) === '20', await struct());

    // Only part of it: the pointer held over a block starts the split there.
    {
      await open('part');
      pg = await page();
      const h = await box('#h');
      const b = await box('#b');
      await drag({ x: pg.left + 100, y: h.cy }, { x: pg.left + (pg.right - pg.left) * 0.7, y: b.cy }, { hold: true });
      const part = await mark();
      await win.mouse.up();
      await win.waitForTimeout(150);
      check('held over a line above, the split starts at that line — and what was there keeps the wider side', !!part && Math.abs(part.top - b.top) < 3 && await struct() === 'a,[b,c | p],d,e'
        && await win.evaluate(() => document.querySelector('#editor .blk-cols').dataset.split) === '70', `${JSON.stringify(part)} ${await struct()}`);
      await win.keyboard.press('Control+z');
      await win.waitForTimeout(200);
      const h3 = await box('#h');
      const e = await box('#e');
      await drag({ x: pg.right - 100, y: h3.cy }, { x: pg.left + (pg.right - pg.left) * 0.33, y: e.cy });
      check('pulled down and to the left third, the part under it is split, the words at the wider right — and a line to go on with under the columns', await struct() === 'a,b,c,[p | d,e],p'
        && await win.evaluate(() => document.querySelector('#editor .blk-cols').dataset.split) === '33', await struct());
    }

    // ---- More than two columns --------------------------------------------------
    {
      await open('more');
      pg = await page();
      const W = pg.right - pg.left;
      const rules = () => win.evaluate(() => [...document.querySelectorAll('#editor hr.blk-vr')].map((r) => { const b = r.getBoundingClientRect(); return (b.left + b.right) / 2; }));
      const splits = () => win.evaluate(() => document.querySelector('#editor .blk-cols').dataset.split);
      const at = (list) => list.map((p) => pg.left + (W * p) / 100);
      const near = (got, want) => got.length === want.length && got.every((x, i) => Math.abs(x - want[i]) < 2.5);
      check('the note begins with two columns and a divider lying in the left one', await struct() === 'm0,[ml,mh,ml2 | mr],mh2,m1', await struct());

      // A divider pulled sideways over a column cuts that column in two: shown first.
      let mh = await box('#mh');
      const block = await box('#editor .blk-cols');
      const leftCol = await box('#editor .blk-col');
      await drag({ x: mh.left + 30, y: mh.cy }, { x: pg.left + W * 0.26, y: mh.cy + 3 }, { hold: true });
      const cut = { mark: await mark(), shade: await shade(), struct: await struct() };
      check('pulled sideways in a column, the mark stands upright in that column, as tall as the columns, the column tinted',
        !!cut.mark && cut.mark.upright && Math.abs(cut.mark.left + cut.mark.width / 2 - (pg.left + W * 0.25)) < 3 && Math.abs(cut.mark.top - block.top) < 2 && Math.abs(cut.mark.height - block.height) < 2
        && !!cut.shade && Math.abs(cut.shade.left - leftCol.left) < 2 && Math.abs(cut.shade.right - leftCol.right) < 2 && cut.struct === 'm0,[ml,mh,ml2 | mr],mh2,m1',
        JSON.stringify({ cut, block, leftCol }));
      await win.keyboard.press('Escape');
      await win.mouse.up();
      await win.waitForTimeout(120);
      check('Esc gives it up', !(await mark()) && await struct() === 'm0,[ml,mh,ml2 | mr],mh2,m1', await struct());
      mh = await box('#mh');
      await drag({ x: mh.left + 30, y: mh.cy }, { x: pg.left + W * 0.26, y: mh.cy + 3 });
      check('let go, there are three columns: what the column held at the left, an empty one beside it, the divider gone into the upright one',
        await struct() === 'm0,[ml,ml2 | p | mr],mh2,m1' && await splits() === '25,50', `${await struct()} ${await splits()}`);
      check('each upright divider stands at its place on the line', near(await rules(), at([25, 50])), JSON.stringify({ rules: await rules(), want: at([25, 50]) }));
      await win.keyboard.type('middle words');
      await win.waitForTimeout(120);
      check('the caret waits in the new column, and words typed stay in it', await win.evaluate(() => document.querySelectorAll('#editor .blk-col')[1].textContent === 'middle words'));

      // A divider of the note itself, pulled sideways over a column, cuts that column too.
      const mh2 = await box('#mh2');
      const right = await box('#editor .blk-col:last-child');
      await drag({ x: pg.left + 60, y: mh2.cy }, { x: pg.left + W * 0.8, y: right.cy });
      check('a fourth column, from a divider under the columns pulled up into the right one', await struct() === 'm0,[ml,ml2 | p | mr | p],m1' && await splits() === '25,50,80', `${await struct()} ${await splits()}`);
      check('all three dividers at their places, the columns inside the page', near(await rules(), at([25, 50, 80]))
        && await win.evaluate(() => { const c = [...document.querySelectorAll('#editor .blk-col')]; const b = document.querySelector('#editor .blk-cols').getBoundingClientRect(); return c.length === 4 && c.at(-1).getBoundingClientRect().right <= b.right + 1 && c.every((el) => el.getBoundingClientRect().width > 60); }),
        JSON.stringify({ rules: await rules(), want: at([25, 50, 80]) }));
      await win.keyboard.type('fourth');
      await win.waitForTimeout(100);

      // One upright divider moved: only its two columns change.
      let all = await rules();
      const vy = (await box('#editor hr.blk-vr')).cy;
      await drag({ x: all[1], y: vy }, { x: pg.left + W * 0.6, y: vy + 4 });
      check('the middle divider pulled to the right moves alone', await splits() === '25,60,80' && near(await rules(), at([25, 60, 80])), `${await splits()} ${JSON.stringify(await rules())}`);
      all = await rules();
      await drag({ x: all[1], y: vy }, { x: pg.right - 5, y: vy });
      // The least is a few words' room: 48px and the divider's own, as a share of this line.
      const least = Math.max(5, Math.ceil((77.4 / W) * 100));
      check('and never past the one at its right, less a column’s least width', await splits() === `25,${80 - least},80`, `${await splits()} least ${least}`);
      await win.keyboard.press('Control+z');
      await win.waitForTimeout(200);
      check('Ctrl+Z puts it back', await splits() === '25,60,80', await splits());

      // One of them taken away: its two columns become one.
      all = await rules();
      await win.mouse.click(all[0], vy);
      await win.waitForTimeout(120);
      await win.keyboard.press('Delete');
      await win.waitForTimeout(150);
      check('Delete on the first upright divider joins the two columns at its sides, and the others stay', await struct() === 'm0,[ml,ml2,p | mr | p],m1' && await splits() === '60,80'
        && await win.evaluate(() => document.querySelector('#editor .blk-col').textContent === 'left wordsmore leftmiddle words'), `${await struct()} ${await splits()}`);
      await win.keyboard.press('Control+z');
      await win.waitForTimeout(200);
      check('Ctrl+Z brings the four back', await struct() === 'm0,[ml,ml2 | p | mr | p],m1' && await splits() === '25,60,80', `${await struct()} ${await splits()}`);
      await win.keyboard.press('Control+y');
      await win.waitForTimeout(200);

      await win.waitForTimeout(1200);
      const kept = JSON.parse(fs.readFileSync(path.join(notes, 'more', 'more.json'), 'utf8')).content;
      check('the note is saved with every divider’s place and the middle column’s width', /data-split="60,80"/.test(kept) && /class="blk-col" style="--w: ?20%;?"/.test(kept) && (kept.match(/<hr class="blk-vr">/g) ?? []).length === 2 && !/armed/.test(kept),
        kept.slice(0, 500));
      await open('other');
      await open('more');
      check('opened again, three columns as they were left, each divider at its place', await struct() === 'm0,[ml,ml2,p | mr | p],m1' && await splits() === '60,80' && near(await rules(), at([60, 80])),
        `${await struct()} ${await splits()} ${JSON.stringify(await rules())}`);
    }

    // ---- A picture standing in a line of words --------------------------------------
    {
      await open('word');
      pg = await page();
      const where = () => win.evaluate(() => {
        const p = document.getElementById('wp');
        const line = p.parentElement;
        const r = p.getBoundingClientRect();
        const l = line.getBoundingClientRect();
        return { tag: p.tagName, line: line.id || line.tagName, before: p.previousSibling?.nodeValue ?? null, after: p.nextSibling?.nodeValue ?? null,
          inside: r.left >= l.left - 1 && r.right <= l.right + 1 && r.top >= l.top - 1 && r.bottom <= l.bottom + 1, width: r.width, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, right: r.right, bottom: r.bottom, left: r.left, top: r.top };
      });
      let wp = await box('#wp');
      await win.mouse.click(wp.cx, wp.cy);
      await win.waitForTimeout(120);
      const before = { word: await barButton('inword'), caption: await barButton('caption'), order: await order() };
      check('a picture in the text has a fourth place on its bar: in a line of words, not lit', before.word.shown && !before.word.on && !before.caption.disabled && before.order === 'w0,wp,w1', JSON.stringify(before));
      await pressBar('inword');
      let w = await where();
      const lit = { word: await barButton('inword'), left: await barButton('left'), beside: await barButton('beside'), caption: await barButton('caption') };
      check('pressed, the picture stands at the end of the line before it, as a character of that line', w.tag === 'SPAN' && w.line === 'w0' && /dog\.$/.test(w.before ?? '') && w.inside && await order() === 'w0,w1',
        JSON.stringify(w));
      check('the bar says so: that place lit, no side lit, no caption and no “beside” for it', lit.word.on && !lit.left.on && lit.beside.disabled && lit.caption.disabled, JSON.stringify(lit));
      check('it is still the selected picture, with its handles', await win.evaluate(() => { const p = document.getElementById('wp'); return p.classList.contains('sel') && p.querySelectorAll(':scope > .image-h').length === 4 && !document.getElementById('image-bar').hidden; }));

      // Dragged: it goes to the caret under the pointer, shown first.
      const w1 = await box('#w1');
      const target = await win.evaluate(() => {
        const text = document.getElementById('w1').firstChild;
        const r = document.createRange();
        const i = text.nodeValue.indexOf('words');
        r.setStart(text, i);
        r.setEnd(text, i + 1);
        const b = r.getBoundingClientRect();
        return { x: b.left + 1, y: (b.top + b.bottom) / 2, lineHeight: b.height };
      });
      await drag({ x: w.cx, y: w.cy }, target, { hold: true });
      const caret = { mark: await mark(), where: await where() };
      check('dragged over another line, an upright mark as tall as a line stands at the caret there, and nothing has moved yet',
        !!caret.mark && caret.mark.upright && caret.mark.height < 60 && Math.abs(caret.mark.left - target.x) < 12 && caret.mark.top >= w1.top - 2 && caret.mark.top + caret.mark.height <= w1.bottom + 2 && caret.where.line === 'w0',
        JSON.stringify({ caret, target, w1 }));
      await win.keyboard.press('Escape');
      await win.mouse.up();
      await win.waitForTimeout(120);
      check('Esc gives the drag up', !(await mark()) && (await where()).line === 'w0');
      w = await where();
      await drag({ x: w.cx, y: w.cy }, target);
      w = await where();
      check('let go, the picture stands between the words of that line', w.tag === 'SPAN' && w.line === 'w1' && /of $/.test(w.before ?? '') && /^words/.test(w.after ?? '') && w.inside
        && await win.evaluate(() => document.getElementById('w0').textContent === 'The quick brown fox jumps over the lazy dog.' && document.getElementById('w1').textContent === 'A second line of words to drag the picture into.'),
        JSON.stringify(w));

      // Resized by a corner, like any picture.
      await drag({ x: w.right - 2, y: w.bottom - 2 }, { x: w.right + 28, y: w.bottom + 28 });
      const grown = await where();
      check('a corner pulled out makes it bigger, in its line', Math.abs(grown.width - w.width - 30) < 6 && grown.line === 'w1' && grown.inside, JSON.stringify({ was: w.width, now: grown.width }));

      // Enter lets go of it with the caret right after it.
      await win.keyboard.press('Enter');
      await win.keyboard.type('X');
      await win.waitForTimeout(120);
      w = await where();
      check('Enter lets go of it, and typing goes on right after it in the same line', /^Xwords/.test(w.after ?? '') && w.line === 'w1' && await win.evaluate(() => !document.querySelector('#editor .note-image.sel')) && await order() === 'w0,w1',
        JSON.stringify(w));

      // A side on the bar takes it out of the line; the fourth place puts it back.
      await win.mouse.click(w.cx, w.cy);
      await win.waitForTimeout(120);
      await pressBar('center');
      w = await where();
      check('“in the middle” takes it out of its line, onto a line of its own under it, in the middle', w.tag === 'FIGURE' && await order() === 'w0,w1,wp' && Math.abs(w.cx - pg.cx) < 2
        && (await barButton('center')).on && !(await barButton('inword')).on && !(await barButton('caption')).disabled, `${JSON.stringify(w)} ${await order()}`);
      await pressBar('inword');
      w = await where();
      check('and the fourth place puts it at the end of that line again', w.tag === 'SPAN' && w.line === 'w1' && w.after === null && await order() === 'w0,w1', JSON.stringify(w));

      // Deleted, the line stays.
      await win.keyboard.press('Delete');
      await win.waitForTimeout(150);
      check('Delete takes the picture away and leaves its line', await win.evaluate(() => !document.getElementById('wp') && document.getElementById('w1').textContent === 'A second line of Xwords to drag the picture into.'));
      await win.keyboard.press('Control+z');
      await win.waitForTimeout(200);
      w = await where();
      check('Ctrl+Z brings it back into its line', w.tag === 'SPAN' && w.line === 'w1', JSON.stringify(w));

      await win.keyboard.press('Escape');
      await win.waitForTimeout(1300);
      const kept = JSON.parse(fs.readFileSync(path.join(notes, 'word', 'word.json'), 'utf8')).content;
      check('the note is saved with the picture inside its paragraph, and nothing of the screen', /<p id="w1">[^]*<span class="note-image note-image--inline note-image--inword"[^>]*>[^]*<\/span><\/p>/.test(kept) && !/ sel\b|drop-mark/.test(kept),
        kept.slice(0, 600));
      await open('other');
      await open('word');
      w = await where();
      check('opened again, it still stands in its line', w.tag === 'SPAN' && w.line === 'w1' && w.inside && await order() === 'w0,w1', JSON.stringify(w));
    }

    // ---- A column that ends with a picture; a picture taken above the line over it ----
    {
      await open('colpic');
      const kids = () => win.evaluate(() => ['cl', 'cr'].map((id) => [...document.getElementById(id).children].map((e) => e.id || e.tagName.toLowerCase()).join(',')).join(' | '));
      check('a column that ends with a picture is given a line to write on under it', await kids() === 'cp1,p | c1,cp2,p', await kids());
      const under = await box('#cl > p');
      await win.mouse.click(under.left + 20, under.cy);
      await win.keyboard.type('written under the picture');
      await win.waitForTimeout(120);
      check('a click there puts the caret under the picture, and words typed stay in that column',
        await win.evaluate(() => document.querySelector('#cl > p').textContent === 'written under the picture') && await kids() === 'cp1,p | c1,cp2,p', await kids());
      // The picture under one line, pulled just clear of its own top: it goes above that line.
      const pic = await box('#cp2');
      const line = await box('#c1');
      await drag({ x: pic.cx, y: pic.top + 30 }, { x: pic.cx + 3, y: pic.top - 9 }, { hold: true });
      const up = await mark();
      await win.mouse.up();
      await win.waitForTimeout(150);
      check('a picture pulled clear of its own top goes above the one line over it — the mark says so first',
        !!up && !up.upright && up.top < line.top + 2 && await kids() === 'cp1,p | cp2,c1,p', `${JSON.stringify({ up, line })} ${await kids()}`);
      await win.keyboard.press('Control+z');
      await win.waitForTimeout(200);
      check('Ctrl+Z puts it back under the line', await kids() === 'cp1,p | c1,cp2,p', await kids());
      await win.keyboard.press('Escape');
    }

    // ---- Four dashes are a divider; no limit on the columns; /paragraph ---------------
    {
      await open('dash');
      pg = await page();
      const W = pg.right - pg.left;
      const flow = () => struct();
      const caretEnd = (selector) => win.evaluate((s) => {
        const el = document.querySelector(s);
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        document.getElementById('editor').focus();
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      }, selector);
      await caretEnd('#d1');
      await win.keyboard.type('---');
      await win.waitForTimeout(80);
      check('three dashes on a line are three dashes', await win.evaluate(() => document.getElementById('d1').textContent === '---' && !document.querySelector('#editor > hr.blk-hr')));
      await win.keyboard.type('-');
      await win.waitForTimeout(120);
      check('the fourth makes the line a divider, with a line to go on with under it', /^d0,\[p \| p \| p \| d4p\],hr,p$/.test(await flow())
        && await win.evaluate(() => { const s = getSelection(); const p = document.querySelector('#editor > hr.blk-hr').nextElementSibling; return p.contains(s.anchorNode) && !p.textContent; }), await flow());
      await win.keyboard.press('Control+z');
      await win.waitForTimeout(200);
      check('Ctrl+Z gives the dashes back, for the times they were meant', await win.evaluate(() => document.getElementById('d1')?.textContent === '----' && !document.querySelector('#editor > hr.blk-hr')), await flow());
      await win.keyboard.press('Control+y');
      await win.waitForTimeout(200);

      // In a column the divider is made in that column — and pulled sideways it cuts the column: a fifth.
      await caretEnd('#d4p');
      await win.keyboard.press('Enter');
      await win.keyboard.type('----');
      await win.waitForTimeout(150);
      check('four dashes typed in a column make the divider in that column', await win.evaluate(() => [...document.getElementById('d4').children].map((e) => e.tagName).join(',')) === 'P,HR,P', await flow());
      const inCol = await box('#d4 > hr.blk-hr');
      await drag({ x: inCol.left + 20, y: inCol.cy }, { x: pg.left + W * 0.87, y: inCol.cy + 3 });
      const five = await win.evaluate(() => ({ cols: document.querySelectorAll('#editor .blk-col').length, split: document.querySelector('#editor .blk-cols').dataset.split,
        inside: [...document.querySelectorAll('#editor .blk-col')].every((c) => c.getBoundingClientRect().width > 40 && c.getBoundingClientRect().right <= document.querySelector('#editor .blk-cols').getBoundingClientRect().right + 1) }));
      check('a fifth column: there is no count that stops it, only the room a column needs', five.cols === 5 && five.split === '25,50,75,88' && five.inside, JSON.stringify(five));

      // /paragraph turns a line back into a plain one.
      await caretEnd('#d0');
      await win.keyboard.type(' /paragraph');
      await win.waitForTimeout(250);
      const offered = await win.evaluate(() => { const m = document.getElementById('slash-menu'); return m.hidden ? null : [...m.querySelectorAll('button')].map((b) => b.textContent); });
      await win.keyboard.press('Enter');
      await win.waitForTimeout(150);
      check('/paragraph offers Paragraph and turns the heading into a plain line', offered?.[0] === 'Paragraph'
        && await win.evaluate(() => { const first = document.querySelector('#editor > :not(.shape-layer):not(.image-layer)'); return first.tagName === 'P' && first.textContent.trim() === 'a heading to turn back'; }),
        JSON.stringify(offered));
    }

    // ---- A card, a video and a code block are moved as a picture is (block-drag.js) ----
    {
      await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u); }; });
      const opened = () => app.evaluate(() => globalThis.__opened.length);
      await open('blocks');
      const START = 'k0,kc,k1,kb,k2,kv,k3,div,k6,div,k7';
      check('the note of blocks opens with its code, its card and its video in their places', await order() === START, await order());
      const k0 = await box('#k0');
      await win.mouse.click(k0.left + 30, k0.cy);

      // The code block, by its top line, to under the line that follows the card.
      let head = await box('#kc .code-head');
      let k2 = await box('#k2');
      await drag({ x: head.cx, y: head.cy }, { x: k2.cx, y: k2.bottom - 1 }, { hold: true });
      const heldCode = { mark: await mark(), order: await order(), grabbing: await win.evaluate(() => document.body.classList.contains('block-dragging')) };
      check('a code block held by its top line: a flat mark under the line it is over, and nothing has moved',
        !!heldCode.mark && !heldCode.mark.upright && Math.abs(heldCode.mark.top - k2.bottom) < 14 && heldCode.order === START && heldCode.grabbing, JSON.stringify({ heldCode, k2 }));
      await win.mouse.up();
      await win.waitForTimeout(150);
      check('let go, it lies there — and the mark is gone', await order() === 'k0,k1,kb,k2,kc,kv,k3,div,k6,div,k7' && !(await mark())
        && !(await win.evaluate(() => document.body.classList.contains('block-dragging'))), await order());
      check('its code went with it', await win.evaluate(() => document.querySelector('#kc .code-src').textContent) === 'let a = 1');
      await win.keyboard.press('Control+z');
      await win.waitForTimeout(200);
      check('one Ctrl+Z puts the code block back', await order() === START, await order());

      // Esc while it is held leaves it where it was.
      head = await box('#kc .code-head');
      k2 = await box('#k2');
      await drag({ x: head.cx, y: head.cy }, { x: k2.cx, y: k2.bottom - 1 }, { hold: true });
      await win.keyboard.press('Escape');
      const afterEsc = { mark: await mark(), grabbing: await win.evaluate(() => document.body.classList.contains('block-dragging')) };
      await win.mouse.up();
      await win.waitForTimeout(120);
      check('Esc while it is held: the mark goes and the block stays', !afterEsc.mark && !afterEsc.grabbing && await order() === START, JSON.stringify({ afterEsc, order: await order() }));

      // The language picker and Copy are still the block's own: a pull from them takes nothing.
      const copy = await box('#kc .code-copy');
      await drag({ x: copy.cx, y: copy.cy }, { x: k2.cx, y: k2.bottom - 1 });
      check('a pull that starts on Copy moves nothing', await order() === START, await order());

      // The bookmark: a press that does not move is the click it was; a pull moves the card and opens nothing.
      let card = await box('#kb .link-card');
      await win.mouse.click(card.cx, card.cy);
      await win.waitForTimeout(200);
      check('a click on a card still opens its link', await opened() === 1, String(await opened()));
      await drag({ x: card.cx, y: card.cy }, { x: card.cx + 30, y: card.cy + 4 });
      await win.waitForTimeout(200);
      check('a card pulled a little and let go on itself: nothing moves, and the link stays shut', await order() === START && await opened() === 1, JSON.stringify({ order: await order(), opened: await opened() }));
      const top = await box('#k0');
      await drag({ x: card.cx, y: card.cy }, { x: top.cx, y: top.top + 1 });
      await win.waitForTimeout(200);
      check('a bookmark pulled over the first line becomes the first thing in the note, and its link stays shut', await order() === 'kb,k0,kc,k1,k2,kv,k3,div,k6,div,k7' && await opened() === 1,
        JSON.stringify({ order: await order(), opened: await opened() }));

      // The video: by its picture into a column; by the strip of its own controls, nowhere.
      let film = await box('#kv video');
      const k3 = await box('#k3');
      await drag({ x: film.cx, y: film.bottom - 12 }, { x: k3.cx, y: k3.bottom + 40 });
      check('a pull that starts on the player’s own controls moves nothing', await order() === 'kb,k0,kc,k1,k2,kv,k3,div,k6,div,k7', await order());
      film = await box('#kv video');
      const k5 = await box('#k5');
      await drag({ x: film.cx, y: film.top + 24 }, { x: k5.cx, y: k5.bottom - 1 }, { hold: true });
      const heldFilm = await mark();
      const col = await box('#kr');
      await win.mouse.up();
      await win.waitForTimeout(200);
      const inColumn = await win.evaluate(() => { const v = document.getElementById('kv'); return { parent: v.parentElement.id, kids: [...v.parentElement.children].map((e) => e.id || e.tagName).join(','), src: v.querySelector('video')?.getAttribute('src') }; });
      check('a video held by its picture over a column: the mark lies in that column', !!heldFilm && !heldFilm.upright && heldFilm.left >= col.left - 2 && heldFilm.left + heldFilm.width <= col.right + 2, JSON.stringify({ heldFilm, col }));
      check('let go, the video is in the column under its line, with a line to go on with — and it is the same video',
        inColumn.parent === 'kr' && inColumn.kids === 'k5,kv,P' && inColumn.src === 'nebula-media://note/blocks/vid-abc-0123abcd.mp4' && await order() === 'kb,k0,kc,k1,k2,k3,div,k6,div,k7', JSON.stringify({ inColumn, order: await order() }));
      // And out again, by its title line.
      await win.evaluate(() => document.getElementById('k6').scrollIntoView({ block: 'center' }));
      await win.waitForTimeout(120);
      const name = await box('#kv .link-card');
      const k6 = await box('#k6');
      await drag({ x: name.cx, y: name.cy }, { x: k6.left + 40, y: k6.cy - 2 }, { hold: true });
      const outMark = { mark: await mark(), cols: await box("#editor .blk-cols"), k6, name, flow: await win.evaluate(() => document.getElementById("kv").parentElement.id) };
      await win.mouse.up();
      await win.waitForTimeout(200);
      check('by its title line it comes out of the column again, onto the note', await order() === 'kb,k0,kc,k1,k2,k3,div,kv,k6,div,k7'
        && await win.evaluate(() => document.getElementById('kr').children.length >= 1), JSON.stringify({ order: await order(), outMark }));

      // An embedded page: by the line over it — the page itself keeps the mouse — and it is still an embed where it lands.
      const EMBED = '#editor > .link-embed:not(.link-file)';
      await win.evaluate(() => document.getElementById('k6').scrollIntoView({ block: 'center' }));
      await win.waitForTimeout(120);
      const over6 = await box('#k6');
      const pageCard = await box(`${EMBED} .link-card`);
      await drag({ x: pageCard.left + 40, y: pageCard.cy }, { x: over6.left + 40, y: over6.top + 2 });
      await win.waitForTimeout(250);
      const embed = await win.evaluate((sel) => { const c = document.querySelector(sel); return { frame: c?.querySelector('webview')?.getAttribute('src') || '', handles: c?.querySelectorAll(':scope > .embed-h').length, next: c?.nextElementSibling?.id }; }, EMBED);
      check('an embedded page pulled by its title line lies over the line above it, still an embed with its handles', await order() === 'kb,k0,kc,k1,k2,k3,div,kv,div,k6,k7'
        && /^http:\/\/127\.0\.0\.1:1\//.test(embed.frame) && embed.handles === 8 && embed.next === 'k6' && await opened() === 1, JSON.stringify({ order: await order(), embed, opened: await opened() }));
      await win.keyboard.press('Control+z');
      await win.waitForTimeout(250);
      check('one Ctrl+Z puts the embed back under that line', await order() === 'kb,k0,kc,k1,k2,k3,div,kv,k6,div,k7', await order());

      // ---- A click where there is no line to stand on (gap-caret.js) -------------------
      {
        await open('gaps');
        const caret = () => win.evaluate(() => {
          const s = getSelection();
          const n = s.rangeCount ? s.anchorNode : null;
          const line = (n?.nodeType === 1 ? n : n?.parentElement)?.closest('#editor > *');
          return { line: line ? (line.id || line.tagName.toLowerCase()) : null, offset: s.anchorOffset, collapsed: s.isCollapsed, inEditor: document.activeElement?.id === 'editor' };
        });
        const typed = async () => {
          await win.keyboard.type('Q');
          await win.waitForTimeout(80);
          return win.evaluate(() => [...document.querySelectorAll('#editor > *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.includes('Q'))).map((e) => e.id || e.tagName.toLowerCase()).join(','));
        };
        check('the note of gaps: a code block, a card right under it, a line, and a card as the last thing', await order() === 'g0,gc,gb,g1,gl', await order());
        // Between the code block and the card under it: nothing to stand on.
        let code = await box('#gc');
        let card = await box('#gb');
        await win.mouse.click(code.left + 60, (code.bottom + card.top) / 2);
        await win.waitForTimeout(150);
        const between = { order: await order(), caret: await caret() };
        check('a click between a code block and the card under it makes a line there, with the caret in it — not on a line far away',
          between.order === 'g0,gc,p,gb,g1,gl' && between.caret.line === 'p' && between.caret.collapsed && between.caret.inEditor, JSON.stringify(between));
        check('what is typed next stands in that line', await typed() === 'p', await order());
        await win.keyboard.press('Control+z');
        await win.keyboard.press('Control+z');
        await win.waitForTimeout(200);
        check('Ctrl+Z takes the letter, and once more the line', await order() === 'g0,gc,gb,g1,gl', await order());

        // Under the last card of the note.
        let lastCard = await box('#gl');
        await win.mouse.click(lastCard.left + 80, lastCard.bottom + 30);
        await win.waitForTimeout(150);
        const under = { order: await order(), caret: await caret() };
        check('a click under the last card makes a line under it, with the caret in it', under.order === 'g0,gc,gb,g1,gl,p' && under.caret.line === 'p' && under.caret.inEditor, JSON.stringify(under));
        check('and what is typed stands there', await typed() === 'p');
        // Clicked again, there is a line now: no second one.
        lastCard = await box('#gl');
        await win.mouse.click(lastCard.left + 80, lastCard.bottom + 6);
        await win.waitForTimeout(150);
        check('clicked again in the gap under it, the caret goes to the line that is there — none is made', await order() === 'g0,gc,gb,g1,gl,p' && (await caret()).line === 'p', JSON.stringify({ order: await order(), caret: await caret() }));

        // Beside a card: over it in its upper half, under it in its lower half; and a gap with a line at its side.
        card = await box('#gb');
        await win.mouse.click(card.right + 80, card.bottom - 6);
        await win.waitForTimeout(150);
        const beside = await caret();
        check('a click beside a card, low: the caret is in the line under it', beside.line === 'g1' && await order() === 'g0,gc,gb,g1,gl,p', JSON.stringify(beside));
        const g1 = await box('#g1');
        lastCard = await box('#gl');
        await win.mouse.click(g1.left + 150, (g1.bottom + lastCard.top) / 2 + 2);
        await win.waitForTimeout(150);
        const overCard = await caret();
        check('a click in the gap over a card that has a line over it: the caret is in that line, near where the click was — not at its end or its start',
          overCard.line === 'g1' && overCard.offset > 3 && overCard.offset < 36 && await order() === 'g0,gc,gb,g1,gl,p', JSON.stringify(overCard));
        // The code itself is still clicked as it always was.
        const src = await box('#gc .code-src');
        await win.mouse.click(src.left + 12, src.cy);
        await win.waitForTimeout(120);
        check('a click on the code still puts the caret in the code', await win.evaluate(() => getSelection().anchorNode?.parentElement?.closest('.code-src') !== null || getSelection().anchorNode?.classList?.contains('code-src')));
      }

      // A locked note: nothing is taken.
      await open('locked');
      const isLocked = await win.evaluate(() => document.getElementById('editor').dataset.readonly === 'true');
      head = await box('#qc .code-head');
      const q1 = await box('#q1');
      await drag({ x: head.cx, y: head.cy }, { x: q1.cx, y: q1.bottom + 4 }, { hold: true });
      const lockedMark = await mark();
      await win.mouse.up();
      await win.waitForTimeout(120);
      check('in a locked note a block is not taken, and no mark is shown', isLocked && !lockedMark && await order() === 'q0,qc,q1', JSON.stringify({ isLocked, lockedMark, order: await order() }));
      const q1again = await box('#q1');
      await win.mouse.click(q1again.left + 60, q1again.bottom + 40);
      await win.waitForTimeout(120);
      check('and a click makes no line in it', await order() === 'q0,qc,q1', await order());
    }

    check('no page errors in the layout checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runLayoutChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
