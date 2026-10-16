/**
 * A link card from the keyboard (B11): a card could be neither reached nor
 * used without a mouse - Tab is the editor's indent, so the card's buttons
 * were out of reach, and Backspace never selected or removed it, while the
 * same flow selects and removes a picture. Now an empty line beside a card,
 * taken away, offers the card (as a picture is offered), and the keys work on
 * the picked card: Enter does what a click does, Backspace or Delete removes
 * it by the same path as its x, any other key lets go of it.
 *
 *   node tests/e2e/card-keys.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runCardKeysChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-card-keys-'));
  const vault = path.join(profile, 'storage/notes');
  fs.mkdirSync(vault, { recursive: true });
  const seed = (id, title, content) => {
    fs.mkdirSync(path.join(vault, id), { recursive: true });
    fs.writeFileSync(path.join(vault, id, `${id}.json`), JSON.stringify({ id, title, content, createdAt: 1, updatedAt: 1 }));
  };
  const BOOKMARK = '<div class="link-block" contenteditable="false" data-block-type="link" data-kind="bookmark" data-src="https://example.com/page" data-title="Example page"><a class="link-card"><span class="link-card__kind">example.com</span><strong class="link-card__title">Example page</strong></a><button class="link-del" data-link-remove="true">×</button></div>';
  seed('n-file', 'Keys file', '<p id="p0">words before</p><p id="p1">right after the card</p>');
  seed('n-book', 'Keys bookmark', `<p><br></p>${BOOKMARK}`);
  seed('n-plain', 'Keys plain', '<p id="t1">plain words to type in</p>');
  const sample = path.join(profile, 'sample.pdf');
  fs.writeFileSync(sample, '%PDF-1.4 card keys');
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
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.querySelector('.nr-title')?.textContent === t)?.click(), title);
      await win.waitForFunction((t) => document.getElementById('title').value === t, title, { polling: 50 });
      await win.waitForTimeout(300);
    };
    const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return !!(await fn()); };
    const saved = async () => { await win.keyboard.press('Control+s'); await until(() => win.evaluate(() => document.getElementById('savestate').textContent === 'Saved'), 4000); };
    const cardState = () => win.evaluate(() => {
      const c = document.querySelector('#editor .link-block');
      return c ? { picked: c.classList.contains('sel') } : null;
    });

    // A file card, made the usual way; the caret sits on the empty line under it.
    await open('Keys file');
    await win.evaluate(() => { const el = document.querySelector('#p0'); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }); }, [sample]);
    await win.keyboard.press('Enter'); await win.waitForTimeout(200);
    await win.keyboard.type('/file'); await win.waitForTimeout(300);
    await win.keyboard.press('Enter');
    await until(() => win.evaluate(() => !!document.querySelector('#editor .link-attach')), 6000);

    await win.keyboard.press('Backspace'); await win.waitForTimeout(350);
    const picked1 = await cardState();
    check('Backspace on the line under a card picks the card', picked1?.picked === true, JSON.stringify(picked1));

    await win.keyboard.press('Backspace'); await win.waitForTimeout(350);
    check('the next Backspace removes the card', (await cardState()) === null);
    await saved();
    check('the saved note no longer names the card', !/att-/.test(stored('n-file') ?? ''), (stored('n-file') || '').slice(0, 200));

    await win.keyboard.press('Control+z'); await win.waitForTimeout(350);
    check('undo brings the card back', !!(await cardState()));
    await saved();
    check("a picked card's 'sel' never reaches the saved note", !/class="[^"]*\bsel\b/.test(stored('n-file') ?? ''), (stored('n-file') || '').slice(0, 200));

    // Pick it again; Enter does what a click does: save a copy.
    await win.keyboard.press('Backspace'); await win.waitForTimeout(350);
    check('the card is picked again', (await cardState())?.picked === true, JSON.stringify(await cardState()));
    await app.evaluate(({ dialog }, d) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: d }); }, path.join(profile, 'kb-copy.pdf'));
    await win.keyboard.press('Enter');
    await until(() => fs.existsSync(path.join(profile, 'kb-copy.pdf')), 5000);
    check('Enter on the picked card saves a copy', fs.existsSync(path.join(profile, 'kb-copy.pdf')));

    // The range-delete guard still refuses: a selection across the card leaves it.
    await win.keyboard.press('Control+a');
    await win.keyboard.press('Backspace'); await win.waitForTimeout(350);
    check('a range delete never takes a card silently', !!(await cardState()));


    // A bookmark card from the other side: Delete on the empty line above picks it.
    await open('Keys bookmark');
    await win.evaluate(() => { const line = document.querySelector('#editor > p'); const r = document.createRange(); r.selectNodeContents(line); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    // A card with nothing under it: Delete on the empty line above offers the card.
    await win.keyboard.press('Delete'); await win.waitForTimeout(350);
    const picked2 = await cardState();
    check('Delete on the empty line above a card picks the card', picked2?.picked === true, JSON.stringify(picked2));
    await win.keyboard.press('Delete'); await win.waitForTimeout(350);
    check('the next Delete removes the bookmark card', (await cardState()) === null);
    await win.keyboard.press('Control+z'); await win.waitForTimeout(350);
    await win.keyboard.press('Control+z'); await win.waitForTimeout(350);
    check('undo brings the bookmark card back', !!(await cardState()));

    // A pick does not outlive its note: the first Backspace in another note
    // belongs to that note.
    await open('Keys bookmark');
    await win.evaluate(() => { const line = document.querySelector('#editor > p'); const r = document.createRange(); r.selectNodeContents(line); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('Backspace'); await win.waitForTimeout(350);   // drop the line, pick the card
    const picked3 = await cardState();
    check('the card is picked before the switch', picked3?.picked === true, JSON.stringify(picked3));
    await open('Keys plain');
    await win.evaluate(() => { const el = document.querySelector('#t1'); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('Backspace'); await win.waitForTimeout(350);
    const after = await win.evaluate(() => document.querySelector('#t1')?.textContent);
    check('a pick in another note does not swallow the first key', after === 'plain words to type i', JSON.stringify(after));

    check('no page errors in the card key checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  let passed = 0;
  await runCardKeysChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (ok) passed += 1; else failed += 1; });
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
