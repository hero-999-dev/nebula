/**
 * 0.9.5 — the owner's "Ideas For Nebula and Testing For Nebula" note, in the
 * real app on a throwaway profile.
 *
 *   node tests/e2e/v095.mjs          (after npm run build)
 *
 * A picture's caption: words pasted into it from another page, and a highlight
 * given to them ("it closes altogether, the caption disappears").
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runV095Checks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-v095-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content) => fs.writeFileSync(path.join(notes, `${id}.json`), JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1 }));
  const GREY = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#bbb"/></svg>')}`;
  const picture = (id, caption) => `<figure class="note-image note-image--inline" id="${id}" contenteditable="false" data-block-type="image" data-ratio="2" style="width: 200px;">`
    + `<img src="${GREY}" alt="x" draggable="false"><figcaption class="image-caption" data-placeholder="Caption" contenteditable="true">${caption}</figcaption></figure>`;
  // As the owner's note holds it: two columns, the pictures in the left one, a caption that was pasted from a dark page.
  const PASTED = '<span style="color: rgb(182, 172, 203); font-size: 12.32px; background-color: rgb(32, 26, 56);">copied from a dark page</span>';
  seed('captions', `<hr class="blk-hr"><div class="blk-cols" data-block-type="columns" data-split="40" style="--split: 40%;"><div class="blk-col"><p><br></p>${picture('f1', PASTED)}<p><br></p></div>`
    + `<hr class="blk-vr"><div class="blk-col"><p id="side">beside</p></div></div><hr class="blk-hr">${picture('f2', 'words under it')}<p id="last">last line</p>`);
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 760));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.title === 'captions')?.click());
    await win.waitForFunction(() => document.querySelector('#title').value === 'captions', null, { polling: 50 });

    const selectIn = (id, start, end) => win.evaluate(({ id, start, end }) => {
      const cap = document.querySelectorAll('#editor figure.note-image')[id]?.querySelector('figcaption');
      cap.focus();
      const walker = document.createTreeWalker(cap, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      const r = document.createRange();
      r.setStart(text, start);
      r.setEnd(text, end ?? text.nodeValue.length);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    }, { id, start, end });
    const pick = async (menu, cls) => {
      await win.click(`#toolbar [data-menu="${menu}"]`);
      await win.click(`#${menu} [data-color-class="${cls}"]`);
      await win.waitForTimeout(150);
    };
    const state = (id) => win.evaluate((id) => {
      const ed = document.getElementById('editor');
      const cap = ed.querySelectorAll('figure.note-image')[id]?.querySelector('figcaption');
      const back = (el) => getComputedStyle(el).backgroundColor;
      const first = cap?.querySelector('[class^="h-"]');
      return { figures: ed.querySelectorAll('figure').length, pictures: ed.querySelectorAll('figure > img').length, captions: ed.querySelectorAll('figcaption').length,
        text: cap?.textContent ?? null, html: cap?.innerHTML ?? null, shown: !!cap && cap.getBoundingClientRect().height > 0,
        marked: first?.textContent ?? null, back: first ? back(first) : null, inner: first?.querySelector('span') ? back(first.querySelector('span')) : null };
    }, id);

    // ---- A highlight on a caption --------------------------------------------
    await selectIn(0, 0, 6);
    await pick('menu-hilite', 'h-yellow');
    let s = await state(0);
    check('a highlight on a pasted caption leaves the picture and its caption where they are', s.figures === 2 && s.pictures === 2 && s.captions === 2 && s.shown && s.text === 'copied from a dark page', JSON.stringify(s));
    check('and it shows: the words that were selected wear it, the background they were pasted with is gone from them', s.marked === 'copied' && s.back !== 'rgba(0, 0, 0, 0)' && s.back !== 'rgb(32, 26, 56)'
      && (s.inner === null || s.inner === 'rgba(0, 0, 0, 0)'), JSON.stringify(s));
    await selectIn(0, 0, 6);
    await pick('menu-hilite', 'h-blue');
    const blue = await state(0);
    check('another highlight takes its place', blue.figures === 2 && blue.marked === 'copied' && blue.back !== s.back && /class="h-blue"/.test(blue.html) && !/h-yellow/.test(blue.html), JSON.stringify(blue));
    await selectIn(1, 0, 5);
    await pick('menu-hilite', 'h-green');
    s = await state(1);
    check('the same for a picture on the page itself', s.figures === 2 && s.captions === 2 && s.text === 'words under it' && s.marked === 'words', JSON.stringify(s));
    await selectIn(1, 0, 5);
    await pick('menu-color', 'c-red');
    s = await state(1);
    check('and for a text colour', s.figures === 2 && s.captions === 2 && s.text === 'words under it' && /c-red/.test(s.html), JSON.stringify(s));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);
    s = await state(1);
    check('Ctrl+Z takes it back', s.figures === 2 && s.captions === 2 && s.text === 'words under it' && !/c-red/.test(s.html), JSON.stringify(s));

    // ---- Words pasted into a caption -----------------------------------------
    await app.evaluate(async ({ clipboard, ClipboardItem }, data) => { await clipboard.write([new ClipboardItem(data)]); }, {
      'text/plain': 'dressed\nwords',
      'text/html': '<div style="background-color: rgb(10, 10, 12);"><span style="color: rgb(214, 210, 219); font-family: Arial; font-size: 20px; background-color: rgb(10, 10, 12);">dressed</span></div><p style="color: red;"><b>words</b></p>',
    });
    await win.evaluate(() => {
      const cap = document.querySelectorAll('#editor figure.note-image')[1].querySelector('figcaption');
      cap.focus();
      const r = document.createRange();
      r.selectNodeContents(cap);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.paste());
    await win.waitForTimeout(500);
    s = await state(1);
    check('words pasted into a caption come as words: one line, no colour, size or background of the page they were copied from', s.figures === 2 && s.captions === 2 && s.text === 'dressed words'
      && !/style=|<div|<p|<font/i.test(s.html), JSON.stringify(s));

    check('no page errors in the 0.9.5 checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runV095Checks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
