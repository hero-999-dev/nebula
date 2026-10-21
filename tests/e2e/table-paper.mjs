/**
 * 1.0.0 — a table on paper narrower than the place it was made in (Log, 0.9.4:
 * "a table printed or exported to PDF on a page narrower than the one it was
 * made on is not fitted there"). The print document (export.js
 * toPrintDocument) is drawn by Chromium as wide as an A5 page's writing, with
 * script off as in the PDF writer's window: a table made 900 px wide, one in a
 * column, and one narrower than the page, which stays as it was made.
 *
 *   node tests/e2e/table-paper.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const table = (id, widths) => `<div class="blk-table" data-block-type="table" contenteditable="false"><table id="${id}">`
  + `<colgroup>${widths.map((w) => `<col style="width: ${w}px;">`).join('')}</colgroup>`
  + `<tbody><tr>${widths.map((_, i) => `<td>cell ${i + 1} with some words in it</td>`).join('')}</tr></tbody></table></div>`;

export async function runTablePaperChecks(check) {
  const dom = new JSDOM('<!doctype html><body></body>');
  for (const name of ['DOMParser', 'document', 'Node', 'HTMLElement', 'Element']) globalThis[name] ??= dom.window[name];
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
  const { toPrintDocument } = await import('../../src/js/export.js');
  const body = `<p>above</p>${table('wide', [300, 300, 300])}`
    + `<div class="blk-cols" data-split="50" style="--split: 50%;"><div class="blk-col">${table('incol', [250, 250])}</div><hr class="blk-vr"><div class="blk-col"><p>beside</p></div></div>`
    + `${table('narrow', [120, 80])}<p>below</p>`;
  const html = toPrintDocument({ title: 'Paper', body, css: fs.readFileSync(path.join(root, 'src/css/editor.css'), 'utf8'), size: '148mm 210mm', margin: '12.7mm' });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-paper-'));
  const file = path.join(profile, 'paper.html');
  fs.writeFileSync(file, html);
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    await app.firstWindow();
    // A5's writing: 148 mm less two margins of 12.7 mm, at 96 px to the inch.
    const width = Math.floor(((148 - 2 * 12.7) / 25.4) * 96);
    const m = await app.evaluate(async ({ BrowserWindow }, { file, width }) => {
      const w = new BrowserWindow({ show: false, useContentSize: true, width, height: 900, webPreferences: { javascript: true, sandbox: true } });
      await w.loadFile(file);
      const out = await w.webContents.executeJavaScript(`(() => { try {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const ed = box('.editor');
        return { page: ed.width, wide: box('#wide').width, col: document.querySelector('#incol').closest('.blk-col').getBoundingClientRect().width,
          incol: box('#incol').width, narrow: box('#narrow').width, scroll: document.documentElement.scrollWidth };
      } catch (e) { return { error: String(e) }; } })()`);
      w.destroy();
      return out;
    }, { file, width });
    check('a table wider than the paper is drawn as wide as the page’s writing', m.wide <= m.page + 1 && m.wide > m.page - 2, JSON.stringify(m));
    check('a table in a column is as wide as its column at most', m.incol <= m.col + 1, JSON.stringify(m));
    check('a table narrower than the paper keeps its own width', Math.abs(m.narrow - 200) <= 2, JSON.stringify(m));
    check('nothing on the page reaches past its edge', m.scroll <= width + 1, JSON.stringify(m));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runTablePaperChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
