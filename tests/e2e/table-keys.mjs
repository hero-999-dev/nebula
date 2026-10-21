/**
 * 1.0.0 — the arrows in a table (the owner: "up, down, left and right in a
 * table go mad while moving the caret with the arrow keys"). A short cell in a
 * row made tall by a long one never let Down out, and Chromium walked to the
 * cell beside; a caret at the very start of a cell had no box at all. The real
 * app on a throwaway profile, real key presses.
 *
 *   node tests/e2e/table-keys.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runTableKeyChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-tablekeys-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const content = `<p id="above">above line</p><div class="blk-table"><table><tbody>${
    row(['a1 words', 'b1', 'c1 long words that wrap more more more more more more more more more'])}${
    row(['a2', '', 'c2'])}${row(['a3', 'b3 x', 'c3'])}</tbody></table></div><p id="below">below line</p>`;
  fs.writeFileSync(path.join(notes, 'tk.json'), JSON.stringify({ id: 'tk', title: 'tk', content, createdAt: 1, updatedAt: 1 }));
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 900));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.title === 'tk')?.click());
    await win.waitForFunction(() => document.querySelector('#editor td'), null, { polling: 50 });
    await win.waitForTimeout(300);

    // Where the caret is: "r,c" by grid (the row-number column left out), or the line's id.
    const where = () => win.evaluate(() => {
      const n = getSelection().anchorNode;
      const el = n?.nodeType === 1 ? n : n?.parentElement;
      const td = el?.closest('td');
      if (td) {
        const tr = td.parentElement;
        return `${[...tr.parentElement.children].indexOf(tr)},${[...tr.querySelectorAll('td')].indexOf(td)}`;
      }
      return el?.closest('p')?.id ?? '?';
    });
    const press = async (...keys) => { const seen = []; for (const k of keys) { await win.keyboard.press(k); await win.waitForTimeout(50); seen.push(await where()); } return seen.join(' '); };
    const clickCell = async (r, c, left = true) => {
      const at = await win.evaluate(([r, c, left]) => {
        const td = document.querySelectorAll('#editor tbody tr')[r].querySelectorAll('td')[c];
        const b = td.getBoundingClientRect();
        return [left ? b.left + 6 : b.right - 6, b.top + 14];
      }, [r, c, left]);
      await win.mouse.click(at[0], at[1]);
      await win.waitForTimeout(80);
    };

    await clickCell(0, 0);
    check('Down from a short cell in a tall row goes to the cell under it, then out under the table',
      (await press('ArrowDown', 'ArrowDown', 'ArrowDown')) === '1,0 2,0 below', await where());
    check('Up from the line under the table goes to the cell above the caret, not the last cell',
      (await press('ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp')) === '2,0 1,0 0,0 above', await where());
    check('Down from the line over the table goes into the cell under the caret', (await press('ArrowDown')) === '0,0', await where());

    await clickCell(0, 1);
    check('Down in the middle column stays in that column', (await press('ArrowDown', 'ArrowDown')) === '1,1 2,1', await where());

    await clickCell(0, 2);
    const inLong = await press('ArrowDown', 'ArrowDown');
    check('Down in a cell of many lines walks its lines before leaving it', inLong.startsWith('0,2 0,2'), inLong);

    await clickCell(1, 0);
    await win.keyboard.press('Home');
    check('Left at the start of a row goes to the end of the row above', (await press('ArrowLeft')) === '0,2', await where());
    await clickCell(1, 2, false);
    await win.keyboard.press('End');
    check('Right at the end of a row goes to the start of the row under', (await press('ArrowRight')) === '2,0', await where());

    await clickCell(0, 0);
    await win.keyboard.press('Home');
    const first = await press('ArrowLeft');
    check('Left at the start of the first cell keeps the caret there', first === '0,0', first);
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  let failed = 0;
  await runTableKeyChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`\n${count - failed}/${count} table key checks passed`);
  process.exit(failed ? 1 : 0);
}
