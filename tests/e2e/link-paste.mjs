/**
 * 1.0.0 — links pasted in a note with a writing font (the owner: "a URL added
 * after Ctrl+V turns serif though the note's font is another"; "five links
 * copied inside Nebula, all in Nebula's format, came out not in it"). The real
 * app on a throwaway profile, the real clipboard and keys.
 *
 *   node tests/e2e/link-paste.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const font = { family: '"Arial", sans-serif', size: 18 };
const sp = (t) => `<span style="font-family: &quot;Arial&quot;, sans-serif; font-size: 18px;">${t}</span>`;
const link = (i) => `<p>${sp(`<a class="link-url" href="https://a${i}.com/" target="_blank" rel="noopener noreferrer">https://a${i}.com/</a>`)}</p>`;

export async function runLinkPasteChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-linkpaste-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const content = `<p id="l1">${sp('hello ')}</p><p id="l2"><br></p>${[1, 2, 3, 4, 5].map(link).join('')}<p id="end"><br></p><div class="blk-toggle" data-open="true"><p class="toggle-title">T</p><div class="toggle-body"><p id="tb1">inside</p><p id="tb2">inside two</p></div></div><p>after</p>`;
  fs.writeFileSync(path.join(notes, 'lp.json'), JSON.stringify({ id: 'lp', title: 'lp', content, font, createdAt: 1, updatedAt: 1 }));
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.title === 'lp')?.click());
    await win.waitForFunction(() => document.getElementById('l2'), null, { polling: 50 });
    await win.waitForTimeout(300);
    const clickLine = async (sel, right) => {
      const at = await win.evaluate(([sel, right]) => { const r = document.querySelector(sel).getBoundingClientRect(); return [right ? r.right - 4 : r.left + 4, r.top + r.height / 2]; }, [sel, right]);
      await win.mouse.click(at[0], at[1]);
    };

    // A URL pasted on an empty line and taken as a link.
    await clickLine('#l2', false);
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.com'));
    await win.keyboard.press('Control+V');
    await win.click('[data-link-kind="url"]');
    await win.waitForTimeout(200);
    const pasted = await win.evaluate(() => { const a = document.querySelector('#l2 a'); return a ? `${getComputedStyle(a).fontFamily}|${getComputedStyle(a).fontSize}` : 'none'; });
    check('a URL pasted on an empty line is written in the note\'s font and size', pasted === 'Arial, sans-serif|18px', pasted);

    // Five links copied together and pasted.
    await clickLine('#editor a[href="https://a1.com/"]', false);
    await win.keyboard.press('Home');
    for (let i = 0; i < 4; i++) await win.keyboard.press('Shift+ArrowDown');
    await win.keyboard.press('Shift+End');
    await win.keyboard.press('Control+C');
    await win.waitForTimeout(150);
    await clickLine('#end', false);
    await win.keyboard.press('Control+V');
    await win.waitForTimeout(400);
    const all = await win.evaluate(() => [...document.querySelectorAll('#editor a[href^="https://a"]')].map((a) => `${a.className}|${a.target}|${getComputedStyle(a).fontFamily}`));
    check('five links copied together paste as ten Nebula links, each in the note\'s font',
      all.length === 10 && all.every((x) => x === 'link-url|_blank|Arial, sans-serif'), JSON.stringify(all));

    // The ground beside the page takes a click, and shows the text pointer for it.
    const ground = await win.evaluate(() => {
      const ed = document.getElementById('editor').getBoundingClientRect();
      const y = ed.top + 20;
      return [ed.left - 12, ed.right + 12].map((x) => { const el = document.elementFromPoint(x, y); return el && !el.closest('#editor') ? getComputedStyle(el).cursor : 'n/a'; });
    });
    check('the ground on both sides of the page shows the text pointer', ground.every((c) => c === 'text'), JSON.stringify(ground));

    // An embed and a bookmark made in the part of a toggle that folds stay in it.
    for (const [kind, line] of [['bookmark', '#tb1'], ['embed', '#tb2']]) {
      await clickLine(line, true);
      await win.keyboard.press('End');
      await app.evaluate(({ clipboard }, u) => clipboard.writeText(u), `https://example.org/${kind}`);
      await win.keyboard.press('Control+V');
      await win.click(`[data-link-kind="${kind}"]`);
      await win.waitForTimeout(250);
    }
    const inToggle = await win.evaluate(() => [...document.querySelectorAll('#editor .link-block')].map((c) => !!c.closest('.toggle-body')));
    check('a bookmark and an embed made in a toggle stand in the toggle', inToggle.length === 2 && inToggle.every(Boolean), JSON.stringify(inToggle));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  let failed = 0;
  await runLinkPasteChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`\n${count - failed}/${count} link paste checks passed`);
  process.exit(failed ? 1 : 0);
}
