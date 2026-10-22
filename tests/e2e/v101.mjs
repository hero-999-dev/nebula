/**
 * 1.0.1 — the owner's "Ideas For Nebula and Testing For Nebula" note: the map's
 * label search keeps its picks and follows the language, the map has a Fit
 * button by its zoom, the right-click menu has no "Zoom in", the German dash,
 * and a divider splits inside a toggle and inside a part of a column. The real
 * app on a throwaway profile.
 *
 *   node tests/e2e/v101.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runV101Checks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-v101-'));
  const storage = path.join(profile, 'storage');
  const notes = path.join(storage, 'notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(storage, 'folders.json'), JSON.stringify({ folders: [{ id: 'f-game', name: 'Game Development', createdAt: 1 }] }));
  const write = (id, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`), JSON.stringify({ id, title: id, content: `<p>the words of ${id}</p>`, createdAt: 1, updatedAt: 1, ...extra }));
  write('pixel', {
    folder: 'f-game', labels: ['Game Dev', 'Pixel', 'Pixel Art'], updatedAt: 9,
    content: '<p>tools <span class="note-tag" data-tag="Dithering" contenteditable="false">#Dithering</span> and '
      + '<a class="note-mention" data-note="zsk" contenteditable="false">@zsk</a></p>',
  });
  write('zsk', { updatedAt: 8, labels: ['Anti-aliasing'] });
  write('ideas', { updatedAt: 7, labels: ['Pixel Art'] });
  // A divider in an open toggle, between two lines.
  write('tog', { updatedAt: 6, content: '<div class="blk-toggle" id="t" data-open="true"><p class="toggle-title">Pictures</p><div class="toggle-body">'
    + '<p id="ta">one line in the toggle</p><hr class="blk-hr" id="th"><p id="tb">another line in the toggle</p></div></div><p id="after">after the toggle</p>' });
  // The owner's note: two dividers in a row in the left column, words under them.
  write('colpart', { updatedAt: 5, content: '<p id="c0">above</p><div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col" id="cl">'
    + '<p id="ct">the top of the column</p><p><br></p><hr class="blk-hr" id="ch1"><hr class="blk-hr" id="ch2"><p id="cw">I want to split this part with the divider above</p><p id="cw2">into small pieces</p></div>'
    + '<hr class="blk-vr"><div class="blk-col" id="cr"><p>right</p><p><br></p><p><br></p><p><br></p><p><br></p><p><br></p></div></div><p id="c1">under</p>' });
  let app;
  const errors = [];
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.on('pageerror', (e) => errors.push(String(e)));
    win.setDefaultTimeout(10_000);
    await win.setViewportSize?.({ width: 1500, height: 900 }).catch(() => {});
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());

    await win.click('.galaxy-mini .galaxy-full');
    await win.waitForTimeout(900);
    const chips = () => win.evaluate(() => [...document.querySelectorAll('.split-map .galaxy-chip > span')].map((s) => s.textContent));
    for (const q of ['Game Dev', 'Dithering', '@zsk', 'Pixel Art', 'Pixel']) {
      await win.fill('.split-map .galaxy-search-input', q);
      await win.waitForTimeout(150);
      await win.keyboard.press('Enter');
    }
    const first = await chips();
    check('five labels and mentions picked', first.length === 5, JSON.stringify(first));

    // Out of the field: on the map's empty space, on the note list, a note opened.
    const box = await win.evaluate(() => { const r = document.querySelector('.split-map canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await win.mouse.click(box.x + 30, box.y + box.h - 30);
    await win.waitForTimeout(500);
    check('a click on the map\'s empty space keeps the picks', (await chips()).length === 5, JSON.stringify(await chips()));
    await win.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await win.waitForTimeout(700);
    check('a click on the map\'s middle keeps the picks', (await chips()).length === 5, JSON.stringify(await chips()));
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes('ideas'))?.click());
    await win.waitForTimeout(900);
    check('opening another note keeps the picks', (await chips()).length === 5, JSON.stringify(await chips()));
    await win.evaluate(() => [...document.querySelectorAll('.split-map .galaxy-list button')].find((b) => b.textContent.startsWith('pixel'))?.focus());
    await win.focus('.split-map canvas');
    await win.keyboard.press('Enter');
    await win.waitForTimeout(900);
    check('opening a note from the map keeps the picks', (await chips()).length === 5, JSON.stringify(await chips()));

    // The right-click menu has no "Zoom in": the wheel and the buttons zoom.
    const menu = await win.evaluate(async () => {
      [...document.querySelectorAll('.split-map .galaxy-list button')].find((x) => x.textContent.startsWith('pixel'))?.focus();
      await new Promise((r) => setTimeout(r, 1200));
      const c = document.querySelector('.split-map canvas');
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      await new Promise((res) => setTimeout(res, 100));
      const m = document.querySelector('.galaxy-menu');
      return m && !m.hidden ? [...m.querySelectorAll('button')].map((x) => x.textContent) : null;
    });
    check('the right-click menu has no "Zoom in"', Array.isArray(menu) && menu.length > 0 && !menu.includes('Zoom in'), JSON.stringify(menu));
    await win.keyboard.press('Escape');

    // The label field follows the language, there and back.
    const placeholder = () => win.evaluate(() => document.querySelector('.split-map .galaxy-search-input')?.placeholder);
    await win.evaluate(() => document.querySelector('[data-lang="tr"]')?.click());
    await win.waitForTimeout(400);
    const tr = await placeholder();
    await win.evaluate(() => document.querySelector('[data-lang="en"]')?.click());
    await win.waitForTimeout(400);
    const en = await placeholder();
    check('the label field is Turkish in Turkish and English again in English', tr === 'Etiketler ve bahsetmeler…' && en === 'Labels and mentions…', JSON.stringify({ tr, en }));

    await win.evaluate(() => document.querySelector('.split-pane[data-note="@map"] .split-close')?.click());
    await win.waitForTimeout(500);
    const fit = await win.evaluate(() => { const b = document.querySelector('.galaxy-mini .galaxy-mini-fit'); return b ? { title: b.title, beside: !!b.parentElement.querySelector('.galaxy-full') } : null; });
    check('the minimap has a Fit button beside its enlarge button', fit?.title === 'Fit' && fit.beside, JSON.stringify(fit));
    if (fit) {
      await win.evaluate(() => document.querySelector('.galaxy-mini .galaxy-mini-fit').click());
      await win.waitForTimeout(700);
    }

    const open = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes(t))?.click(), title);
      await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
      await win.waitForTimeout(250);
    };
    const rect = (sel) => win.evaluate((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 } : null; }, sel);
    const drag = async (from, to) => {
      await win.mouse.move(from.x, from.y);
      await win.mouse.down();
      await win.mouse.move(from.x + 4, from.y + 1);
      await win.mouse.move(to.x, to.y, { steps: 10 });
      await win.waitForTimeout(80);
      await win.mouse.up();
      await win.waitForTimeout(200);
    };

    // The German dash: "--" and a space, only when the app speaks German.
    await open('ideas');
    await win.evaluate(() => document.querySelector('[data-lang="de"]')?.click());
    await win.waitForTimeout(300);
    await win.evaluate(() => { const p = document.querySelector('#editor p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById('editor').focus(); });
    await win.keyboard.type(' Wort -- weiter');
    await win.waitForTimeout(150);
    const de = await win.evaluate(() => document.querySelector('#editor p').textContent);
    await win.evaluate(() => document.querySelector('[data-lang="en"]')?.click());
    await win.waitForTimeout(300);
    await win.evaluate(() => { const p = document.querySelector('#editor p'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById('editor').focus(); });
    await win.keyboard.type(' and -- on');
    await win.waitForTimeout(150);
    const plain = await win.evaluate(() => document.querySelector('#editor p').textContent);
    check('in German "--" and a space is a dash; in English it stays two', de.endsWith('Wort \u2013 weiter') && plain.endsWith('and -- on'), JSON.stringify({ de, plain }));

    // A divider in a toggle, pulled sideways, puts the toggle's lines side by side.
    await open('tog');
    let hr = await rect('#th');
    let line = await rect('#editor');
    await drag({ x: hr.left + 30, y: hr.cy }, { x: line.left + (line.right - line.left) * 0.7, y: hr.cy + 2 });
    const tog = await win.evaluate(() => { const c = document.querySelector('#t > .toggle-body > .blk-cols'); return c ? c.querySelectorAll(':scope > .blk-col').length : 0; });
    check('a divider pulled sideways in a toggle makes two columns in it', tog === 2, String(tog));

    // The lower of two dividers in a column cuts only the part under it.
    await open('colpart');
    hr = await rect('#ch2');
    const words = await rect('#cw2');   // the part from the divider down to the line the pointer is on
    line = await rect('#cl');
    await drag({ x: hr.left + 20, y: hr.cy }, { x: line.left + (line.right - line.left) * 0.6, y: words.cy });
    const part = await win.evaluate(() => [...document.querySelectorAll('#editor > .blk-cols')].map((c) => `${c.querySelectorAll(':scope > .blk-col').length}${c.querySelector('#cw') ? '*' : ''}`).join(','));
    check('the lower of two dividers in a column cuts only the part under it', /^2,3\*$/.test(part)
      && await win.evaluate(() => !!document.querySelector('#ct') && document.querySelector('#cw').parentElement === document.querySelector('#cw2').parentElement), `${part} ${await win.evaluate(() => document.getElementById('editor').innerHTML.replace(/ style="[^"]*"/g, ''))}`);

    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let failed = 0;
  await runV101Checks((name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  });
  process.exit(failed ? 1 : 0);
}
