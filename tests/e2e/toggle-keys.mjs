/**
 * 1.0.0 — toggles one under another, in columns (the owner): "with the toggle
 * closed, Enter goes into the note and starts at its top instead of going
 * below", "the notes inside the toggle lists disappear", "a Tab anywhere on the
 * page moves the divider over". Real keys in the real app, in a column and on
 * the note itself.
 *
 *   node tests/e2e/toggle-keys.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const T = (n) => `<div class="blk-toggle"><p class="toggle-title" id="h${n}">Title ${n}</p><div class="toggle-body"><p>b${n}a</p><p>b${n}b</p></div></div>`;
const STACK = `${T(1)}${T(2)}${T(3)}<p id="x">words</p><p id="e"><br></p>`;
const inCols = (inner) => `<p>above</p><div class="blk-cols" data-split="60" style="--split: 60%;"><div class="blk-col" id="c1"><p id="l1">left</p></div>`
  + `<hr class="blk-vr"><div class="blk-col" id="c2">${inner}</div></div><p>below</p>`;

export async function runToggleKeyChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-tkeys-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content) => fs.writeFileSync(path.join(notes, `${id}.json`), JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1 }));
  seed('tk-cols', inCols(STACK));
  seed('tk-flat', STACK);
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 900));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const open = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
      await win.waitForFunction((t) => document.querySelector('#title')?.value === t, title, { polling: 50 });
      await win.waitForTimeout(250);
    };
    const caret = (id, end) => win.evaluate(([i, e]) => {
      const el = document.getElementById(i);
      const t = el.firstChild;
      const r = document.createRange();
      r.setStart(t, e && t.nodeType === 3 ? t.length : 0);
      r.collapse(true);
      document.querySelector('#editor').focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    }, [id, end]);
    const state = () => win.evaluate(() => {
      const ts = [...document.querySelectorAll('#editor .blk-toggle')];
      const n = getSelection().anchorNode;
      const line = (n?.nodeType === 1 ? n : n?.parentElement)?.closest('p');
      return {
        toggles: ts.map((t) => `${t.dataset.open ? '+' : '-'}${t.firstElementChild.textContent}:${t.querySelector('.toggle-body')?.textContent ?? ''}`),
        caretAfterT1: !!line && line.previousElementSibling === ts[0],
        caretIn: line?.id || line?.className || line?.textContent || '',
      };
    });
    const folded = ['-Title 1:b1ab1b', '-Title 2:b2ab2b', '-Title 3:b3ab3b'];

    for (const note of ['tk-cols', 'tk-flat']) {
      const where = note === 'tk-cols' ? 'in a column' : 'on the note';
      await open(note);
      // Enter at the end of a folded title: a line under it, the toggle still folded.
      await caret('h1', true);
      await win.keyboard.press('Enter');
      await win.keyboard.type('new');
      let s = await state();
      check(`Enter on a folded toggle's title makes a line under it, ${where}`, s.caretAfterT1 && JSON.stringify(s.toggles) === JSON.stringify(folded), JSON.stringify(s));
      // Backspace back up: the line joins nothing it should not, the folded part stays.
      for (let i = 0; i < 4; i += 1) await win.keyboard.press('Backspace');
      s = await state();
      check(`Backspace on the line under a folded toggle keeps what is folded, ${where}`, JSON.stringify(s.toggles) === JSON.stringify(folded), JSON.stringify(s));
      // Under the last toggle: words joined to its title, an empty line taken — the folded lines all stay.
      await caret('x', false);
      await win.keyboard.press('Backspace');
      await caret('e', false);
      await win.keyboard.press('Backspace');
      s = await state();
      check(`Backspace under the last folded toggle joins its title and loses nothing, ${where}`,
        JSON.stringify(s.toggles) === JSON.stringify(['-Title 1:b1ab1b', '-Title 2:b2ab2b', '-Title 3words:b3ab3b']), JSON.stringify(s));
      // Delete at the end of a folded title: the next toggle stays where it is, both bodies kept.
      await caret('h1', true);
      await win.keyboard.press('Delete');
      s = await state();
      check(`Delete at the end of a folded title takes no folded lines, ${where}`,
        JSON.stringify(s.toggles) === JSON.stringify(['-Title 1:b1ab1b', '-Title 2:b2ab2b', '-Title 3words:b3ab3b']), JSON.stringify(s));
    }

    // Tab on words lying loose in a column (as typing can leave them): the line moves, the divider does not.
    await open('tk-cols');
    const vr = () => win.evaluate(() => Math.round(document.querySelector('.blk-vr').getBoundingClientRect().left));
    const x0 = await vr();
    await win.evaluate(() => {
      const t = document.createTextNode('loose words');
      document.getElementById('c1').prepend(t);
      const r = document.createRange();
      r.setStart(t, 3);
      r.collapse(true);
      document.querySelector('#editor').focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.press('Tab');
    await win.keyboard.press('Tab');
    await caret('l1', true);
    await win.keyboard.press('Tab');
    const after = await win.evaluate(() => ({
      cols: document.querySelectorAll('.blk-cols[data-ind], .blk-col[data-ind], .blk-vr[data-ind]').length,
      loose: document.querySelector('#c1').firstElementChild?.outerHTML ?? '',
      l1: document.getElementById('l1')?.dataset.ind ?? '',
    }));
    const x1 = await vr();
    check('Tab in a column moves the line, never the divider', x1 === x0 && after.cols === 0 && after.l1 === '1' && /data-ind="2"/.test(after.loose), JSON.stringify({ x0, x1, ...after }));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runToggleKeyChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
