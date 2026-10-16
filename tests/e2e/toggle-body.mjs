/**
 * What is put into a toggle's body belongs to the body (B5): a picture, a video
 * or a file card placed with the caret inside the body used to land after the
 * whole toggle — visible when the toggle was folded. topBlockOf stops at the
 * body's edge now, as it always did at a column's.
 *
 *   node tests/e2e/toggle-body.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export async function runToggleBodyChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-toggle-body-'));
  const vault = path.join(profile, 'storage/notes');
  fs.mkdirSync(vault, { recursive: true });
  const seed = (id, title, content) => {
    fs.mkdirSync(path.join(vault, id), { recursive: true });
    fs.writeFileSync(path.join(vault, id, `${id}.json`), JSON.stringify({ id, title, content, createdAt: 1, updatedAt: 1 }));
  };
  const TOGGLE = '<div class="blk-toggle" data-open="true"><p class="toggle-title" id="ttin">title words</p><div class="toggle-body"><p id="tbin">body words</p></div></div>';
  const COLS = '<div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col"><p id="cin">col words</p></div><div class="blk-col"><p><br></p></div></div>';
  seed('n-tog', 'Toggle body note', `<p id="top">top line</p>${TOGGLE}<p id="bot">bottom line</p>`);
  seed('n-col', 'Column body note', `<p id="top">top line</p>${COLS}<p id="bot">bottom line</p>`);
  const sample = path.join(profile, 'sample.pdf');
  fs.writeFileSync(sample, '%PDF-1.4 toggle body');

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
      await win.waitForTimeout(250);
    };
    const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return !!(await fn()); };
    const into = (sel) => win.evaluate((s) => {
      const el = document.querySelector(s); if (!el) return false;
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const sel2 = getSelection(); sel2.removeAllRanges(); sel2.addRange(r);
      return true;
    }, sel);
    const inside = (sel, ofSel) => win.evaluate(({ sel, ofSel }) => !!document.querySelector(sel)?.closest(ofSel), { sel, ofSel });
    const pastePicture = async () => {
      await app.evaluate(({ clipboard, nativeImage, ClipboardItem }, b64) => clipboard.write([new ClipboardItem({ 'image/png': new Blob([nativeImage.createFromBuffer(Buffer.from(b64, 'base64')).toPNG()], { type: 'image/png' }) })]), PIXEL);
      await win.keyboard.press('Control+v');
      await until(() => win.evaluate(() => !!document.querySelector('#editor .note-image')), 5000);
    };

    // The toggle body: a picture, then a file card.
    await open('Toggle body note');
    await into('#tbin');
    await win.keyboard.press('Enter'); await win.waitForTimeout(200);
    await pastePicture();
    check('a picture pasted in the body stays in the body', await inside('#editor .note-image', '.blk-toggle .toggle-body'));
    await into('#tbin');
    await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }); }, [sample]);
    await win.keyboard.press('Enter'); await win.waitForTimeout(200);
    await win.keyboard.type('/file'); await win.waitForTimeout(300);
    await win.keyboard.press('Enter');
    await until(() => win.evaluate(() => !!document.querySelector('#editor .link-attach')), 6000);
    check('a file card attached in the body stays in the body', await inside('#editor .link-attach', '.blk-toggle .toggle-body'));

    // Fold: both go away with the body.
    await win.evaluate(() => { const t = document.querySelector('.blk-toggle .toggle-title'); const r = t.getBoundingClientRect(); window.__fold = { x: r.left + 8, y: (r.top + r.bottom) / 2 }; });
    const fold = await win.evaluate(() => window.__fold);
    await win.mouse.click(fold.x, fold.y);
    await win.waitForTimeout(400);
    const folded = await win.evaluate(() => ({
      body: !!document.querySelector('.blk-toggle .toggle-body')?.offsetParent,
      pic: !!document.querySelector('#editor .note-image')?.offsetParent,
      card: !!document.querySelector('#editor .link-attach')?.offsetParent,
    }));
    check('folding the toggle hides the body', !folded.body, JSON.stringify(folded));
    check('folding the toggle hides the picture put in the body', !folded.pic, JSON.stringify(folded));
    check('folding the toggle hides the card put in the body', !folded.card, JSON.stringify(folded));

    // The column still keeps what is pasted in it (0.9.4, unchanged by B5).
    await open('Column body note');
    await into('#cin');
    await win.keyboard.press('Enter'); await win.waitForTimeout(200);
    await pastePicture();
    check('a picture pasted in a column still stays in the column', await inside('#editor .note-image', '.blk-col'));

    check('no page errors in the toggle body checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  let passed = 0;
  await runToggleBodyChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (ok) passed += 1; else failed += 1; });
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
