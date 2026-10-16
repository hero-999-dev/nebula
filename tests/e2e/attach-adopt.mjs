/**
 * A file card pasted into another note (0.9.6, B4): the pasted card used to keep
 * the source note's address in the live DOM, so its click was refused ("The
 * file is not in this note") even after the save's rehome had copied the file —
 * until an app restart. The paste now copies the file in at once (adopt) and
 * the card names its own note; a card brought back by an undo is healed at the
 * click.
 *
 *   node tests/e2e/attach-adopt.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runAttachAdoptChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-adopt-'));
  const vault = path.join(profile, 'storage/notes');
  fs.mkdirSync(vault, { recursive: true });
  const seed = (id, title, content) => {
    fs.mkdirSync(path.join(vault, id), { recursive: true });
    fs.writeFileSync(path.join(vault, id, `${id}.json`), JSON.stringify({ id, title, content, createdAt: 1, updatedAt: 1 }));
  };
  seed('n-a', 'Adopt source', '<p id="a1">source line</p><p>more source words</p>');
  seed('n-b', 'Adopt dest', '<p id="b1">dest line</p>');
  seed('n-c', 'Adopt dest of sealed', '<p id="c1">plain dest line</p>');
  const sample = path.join(profile, 'sample.pdf');
  fs.writeFileSync(sample, '%PDF-1.4 adopt probe');
  const copyDest = path.join(profile, 'saved-copy.pdf');

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
      await win.waitForTimeout(250);
    };
    const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return !!(await fn()); };
    const saved = async () => { await win.keyboard.press('Control+s'); await until(() => win.evaluate(() => document.getElementById('savestate').textContent === 'Saved'), 4000); };
    const cardSrc = () => win.evaluate(() => document.querySelector('#editor .link-attach')?.dataset.src ?? null);
    const clickCard = async () => {
      const box = await win.evaluate(() => { const el = document.querySelector('#editor .link-attach .link-card'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
      if (!box) return false;
      await win.mouse.click(box.x, box.y);
      return until(() => fs.existsSync(copyDest), 5000);
    };

    // A card in the source note.
    await open('Adopt source');
    await win.evaluate(() => { const el = document.querySelector('#a1'); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }); }, [sample]);
    await win.keyboard.press('Enter'); await win.waitForTimeout(200);
    await win.keyboard.type('/file'); await win.waitForTimeout(300);
    await win.keyboard.press('Enter');
    await until(async () => !!(await cardSrc()), 6000);
    await saved();
    check('the source note holds a card', /\/n-a\/att-/.test((await cardSrc()) ?? ''), (await cardSrc()) ?? 'none');

    // Paste it into another note.
    await win.keyboard.press('Control+a'); await win.waitForTimeout(150);
    await win.keyboard.press('Control+c'); await win.waitForTimeout(150);
    await open('Adopt dest');
    await win.evaluate(() => { const el = document.querySelector('#b1'); const r = document.createRange(); r.setStart(el.firstChild, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('Control+v');
    await until(async () => !!(await cardSrc()), 6000);
    check('the card is pasted into the second note', !!(await cardSrc()), 'no card');

    // B4: the pasted card names its OWN note, without waiting for a save.
    const adopted = await until(async () => /\/n-b\/att-/.test((await cardSrc()) ?? ''), 8000);
    check('the pasted card names this note (adopted at paste)', adopted, (await cardSrc()) ?? 'no card');

    // Its file: a copy in this note's folder, the source's untouched.
    const ownAtt = ((await cardSrc()) || '').split('/').pop();
    check('the file is copied into this note', !!ownAtt && fs.existsSync(path.join(vault, 'n-b', ownAtt)), ownAtt ?? '');
    check('the copy holds the file\'s bytes', !!ownAtt && fs.existsSync(path.join(vault, 'n-b', ownAtt)) && fs.readFileSync(path.join(vault, 'n-b', ownAtt)).equals(fs.readFileSync(sample)));
    const srcAtt = [...fs.readdirSync(path.join(vault, 'n-a'))].find((f) => /^att-/.test(f));
    check('the source note keeps its own file', !!srcAtt && fs.existsSync(path.join(vault, 'n-a', srcAtt)));
    check('the adopted file keeps its ending (.pdf)', /\.pdf$/.test(ownAtt), ownAtt ?? '');

    // The click saves a copy — no "The file is not in this note".
    await app.evaluate(({ dialog }, d) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: d }); }, copyDest);
    check('clicking the pasted card saves a copy', await clickCard());
    fs.rmSync(copyDest, { force: true });

    // The stored text names this note too.
    await saved();
    check('the stored note names this note\'s file', /\/n-b\/att-/.test(stored('n-b') ?? ''), (stored('n-b') || '').slice(0, 200));

    // Undo takes the card away; redo brings it back — and the healed card still opens.
    await win.keyboard.press('Control+z'); await win.waitForTimeout(400);
    check('undo takes the pasted card away', !(await cardSrc()));
    await win.keyboard.press('Control+y'); await win.waitForTimeout(400);
    check('redo brings the card back', !!(await cardSrc()));
    await app.evaluate(({ dialog }, d) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: d }); }, copyDest);
    check('the card brought back by redo still saves a copy', await clickCard());
    fs.rmSync(copyDest, { force: true });

    // A sealed source: the file is adopted out of an open black hole into a plain
    // note. One plain copy passes through the source hole's opened scope and is
    // shredded when the copy is done; nothing of it stays on the disk in the clear.
    const made = await win.evaluate(async ({ sample }) => {
      const made = await window.nebula.holes.create({ name: 'Adopt hole', pin: '123456' });
      const sealed = await window.nebula.holes.addFile(made.hole.id, 'n-h', sample);
      return { holeId: made.hole.id, sealedUrl: sealed?.url ?? null, ok: !!(made?.ok && sealed?.ok) };
    }, { sample });
    check('a file sealed into a black hole', made.ok, JSON.stringify(made));
    const sealedAdopt = made.ok ? await win.evaluate(async ({ url }) => window.nebula.media.adoptFile('n-c', null, url), { url: made.sealedUrl }) : null;
    check('a card naming a sealed file is adopted into a plain note', !!sealedAdopt?.ok && /\/n-c\/att-.*\.pdf$/.test(sealedAdopt.url ?? ''), JSON.stringify(sealedAdopt));
    const sealedAtt = sealedAdopt ? (sealedAdopt.url || '').split('/').pop() : '';
    check('the copy of the sealed file is in the plain note, right bytes, .pdf', !!sealedAtt && fs.existsSync(path.join(vault, 'n-c', sealedAtt)) && fs.readFileSync(path.join(vault, 'n-c', sealedAtt)).equals(fs.readFileSync(sample)), sealedAtt);
    const openedDir = path.join(profile, 'opened');
    const stray = fs.existsSync(openedDir) ? (function walk(d) { const out = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) out.push(...walk(f)); else out.push(f); } return out; })(openedDir) : [];
    check('no plaintext staging remains under opened/', stray.length === 0, stray.join(', '));

    check('no page errors in the adopt checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  let passed = 0;
  await runAttachAdoptChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (ok) passed += 1; else failed += 1; });
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
