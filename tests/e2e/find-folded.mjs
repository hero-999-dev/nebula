/**
 * Find and folded content: a match inside a folded toggle body is counted -
 * the words are the note's - and stepping onto it opens every folded ancestor
 * on the chain and scrolls to it, as OneNote's and Notion's search expands a
 * collapsed section. A locked note opens on screen only; nothing is written.
 *
 *   node tests/e2e/find-folded.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runFindFoldedChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-find-folded-'));
  const vault = path.join(profile, 'storage/notes');
  fs.mkdirSync(vault, { recursive: true });
  const seed = (id, title, content, extra = {}) => {
    fs.mkdirSync(path.join(vault, id), { recursive: true });
    fs.writeFileSync(path.join(vault, id, `${id}.json`), JSON.stringify({ id, title, content, createdAt: 1, updatedAt: 1, ...extra }));
  };
  // A folded toggle whose body holds the words; inside its body ANOTHER folded
  // toggle, whose body holds them too - the nested-ancestor case.
  // A toggle folded by its arrow has NO data-open attribute (setOpen deletes
  // it) - that is the stored form this suite must work against.
  const NESTED = '<div class="blk-toggle"><p class="toggle-title">inner folded title</p><div class="toggle-body"><p id="inner">needle words deep in the nested folded body</p></div></div>';
  const FOLDED = `<div class="blk-toggle"><p class="toggle-title">outer folded title</p><div class="toggle-body"><p id="fb">needle words hidden in the folded body</p>${NESTED}</div></div>`;
  const OPENFOLDED = `<div class="blk-toggle" data-open="true"><p class="toggle-title">outer folded title</p><div class="toggle-body"><p id="fb">needle words hidden in the folded body</p>${NESTED}</div></div>`;
  seed('n-fold', 'Find folded', `<p id="top">needle words in the prose</p>${OPENFOLDED}<p id="bot">bottom words</p>`);
  seed('n-lock', 'Find locked folded', `<p id="top">needle words in the prose</p>${FOLDED}<p id="bot">bottom words</p>`, { readOnly: true });
  const stored = (id) => { try { return JSON.parse(fs.readFileSync(path.join(vault, id, `${id}.json`), 'utf8')).content; } catch { return null; } };

  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());

    const open = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('#note-list .note-row')].find((r) => r.textContent.includes(t))?.click(), title);
      await win.waitForFunction((t) => document.getElementById('title').value === t, title, { polling: 50 });
      await win.waitForTimeout(300);
    };
    const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return !!(await fn()); };
    const saved = async () => { await win.keyboard.press('Control+s'); await until(() => win.evaluate(() => document.getElementById('savestate').textContent === 'Saved'), 4000); };
    const foldStates = () => win.evaluate(() => [...document.querySelectorAll('.blk-toggle')].map((t) => ({ title: t.firstElementChild?.textContent?.slice(0, 24), open: t.dataset.open === 'true', bodyVisible: !!t.querySelector('.toggle-body')?.offsetParent })));

    // The outer folded body's match. The toggle is folded THROUGH the app
    // (its arrow), not seeded folded: setOpen deletes data-open, which is the
    // form the reveal must recognize.
    await open('Find folded');
    await win.evaluate(() => {
      const t = [...document.querySelectorAll('.blk-toggle')].find((x) => x.querySelector('.toggle-title')?.textContent?.startsWith('outer'));
      const title = t?.querySelector('.toggle-title');
      const r = title.getBoundingClientRect();
      window.__fold = { x: r.left + 8, y: (r.top + r.bottom) / 2 };
    });
    const foldPoint = await win.evaluate(() => window.__fold);
    await win.mouse.click(foldPoint.x, foldPoint.y);
    await win.waitForTimeout(400);
    const foldedByApp = await win.evaluate(() => {
      const t = [...document.querySelectorAll('.blk-toggle')].find((x) => x.querySelector('.toggle-title')?.textContent?.startsWith('outer'));
      return { open: t?.dataset.open === 'true', hasAttr: t?.hasAttribute('data-open'), bodyVisible: !!t?.querySelector('.toggle-body')?.offsetParent };
    });
    console.log('outer toggle after folding through the app:', JSON.stringify(foldedByApp));
    check('the outer toggle is folded the way the app folds it (no data-open)', foldedByApp.hasAttr === false && foldedByApp.bodyVisible === false, JSON.stringify(foldedByApp));

    await win.keyboard.press('Control+f');
    await win.waitForFunction(() => !document.getElementById('find-bar').hidden, null, { polling: 50 });
    await win.keyboard.type('hidden in the folded', { delay: 10 });
    await win.waitForTimeout(400);
    check('the folded-only match is counted', (await win.evaluate(() => document.getElementById('find-count')?.textContent)) === '1 of 1');
    const afterReveal = await foldStates();
    console.log('after stepping onto the folded match:', JSON.stringify(afterReveal));
    check('the folded toggle opens when the match is stepped onto', afterReveal.length === 2 && afterReveal[0].open === true && afterReveal[0].bodyVisible, JSON.stringify(afterReveal));
    check('the inner toggle stays folded (its own body holds no match yet)', afterReveal[1].open === false, JSON.stringify(afterReveal));

    // The open is a note state: the save keeps it open.
    await win.keyboard.press('Escape');
    await saved();
    check('the save keeps the toggle open', /data-open="true"/.test(stored('n-fold') ?? ''), (stored('n-fold') || '').slice(0, 160));

    // The nested case: a match inside a toggle folded inside a folded toggle.
    await win.keyboard.press('Control+f');
    await win.waitForFunction(() => !document.getElementById('find-bar').hidden, null, { polling: 50 });
    await win.keyboard.type('deep in the nested', { delay: 10 });
    await win.waitForTimeout(400);
    check('the nested folded match is counted', (await win.evaluate(() => document.getElementById('find-count')?.textContent)) === '1 of 1');
    const nestedStates = await foldStates();
    console.log('after stepping onto the nested match:', JSON.stringify(nestedStates));
    check('EVERY folded ancestor on the chain opens', nestedStates.length === 2 && nestedStates.every((t) => t.open === true), JSON.stringify(nestedStates));
    await win.keyboard.press('Escape');
    await saved();

    // The words became visible: a plain scrollable reveal, no fold state to change now.
    await win.keyboard.press('Control+f');
    await win.waitForFunction(() => !document.getElementById('find-bar').hidden, null, { polling: 50 });
    await win.keyboard.type('needle', { delay: 10 });
    await win.waitForTimeout(400);
    check('all three needles are counted', (await win.evaluate(() => document.getElementById('find-count')?.textContent)) === '1 of 3');
    await win.keyboard.press('Escape');

    // A locked note: the reveal opens on screen only, and nothing is written.
    await open('Find locked folded');
    await win.waitForTimeout(300);
    const lockBefore = await win.evaluate(() => ({ readonly: document.getElementById('editor').dataset.readonly, saved: document.getElementById('savestate')?.textContent }));
    await win.keyboard.press('Control+f');
    await win.waitForFunction(() => !document.getElementById('find-bar').hidden, null, { polling: 50 });
    await win.keyboard.type('hidden in the folded', { delay: 10 });
    await win.waitForTimeout(400);
    const lockStates = await foldStates();
    console.log('locked note, after stepping onto the folded match:', JSON.stringify(lockStates), JSON.stringify(lockBefore));
    check('a locked note opens the toggle on screen too (the hit must be visible)', lockStates[0]?.open === true && lockStates[0]?.bodyVisible, JSON.stringify(lockStates));
    await win.keyboard.press('Escape');
    await win.waitForTimeout(400);
    const lockAfter = await win.evaluate(() => document.getElementById('savestate')?.textContent);
    check("a locked note's save indicator is untouched by the reveal", lockAfter === lockBefore.saved, JSON.stringify({ before: lockBefore.saved, after: lockAfter }));
    check("the locked note's stored fold state is unchanged", !/data-open="true"/.test(stored('n-lock') ?? ''), (stored('n-lock') || '').slice(0, 160));

    check('no page errors in the find-folded checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  let passed = 0;
  await runFindFoldedChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (ok) passed += 1; else failed += 1; });
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
