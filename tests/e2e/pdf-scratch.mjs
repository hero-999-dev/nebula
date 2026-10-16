/**
 * A PDF made of a note holds the note in the clear: the page it is printed
 * from and the preview it is shown from. Neither may lie outside the app's own
 * folder (where a crash would leave it for good, out of reach of every clean-up),
 * and neither may outlive a lock: a black hole's note previewed, then Nebula
 * locked, must leave no copy of it on the disk.
 *
 *   node tests/e2e/pdf-scratch.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');

export async function runPdfScratchChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-pdf-scratch-'));
  // The system's temporary folder, as the app sees it: one of the test's own, watched.
  const systemTemp = path.join(profile, 'system-temp');
  fs.mkdirSync(systemTemp);
  const seen = new Set();
  const watcher = fs.watch(systemTemp, { recursive: true }, (_kind, name) => { if (name) seen.add(String(name)); });
  const previews = path.join(profile, 'pdf-preview');
  const printing = path.join(profile, 'pdf-print');
  // Wherever under it they are kept, and whatever else is left beside them.
  const under = (dir) => { try { return fs.readdirSync(dir, { recursive: true }).map(String).filter((n) => /\.(pdf|html)$/.test(n)); } catch { return []; } };
  const pdfs = () => [...under(previews), ...under(printing)];
  let app;
  try {
    app = await electron.launch({
      args: [path.join(root, 'dist-electron/main.js')],
      env: { ...process.env, NEBULA_USER_DATA: profile, TEMP: systemTemp, TMP: systemTemp, TMPDIR: systemTemp },
    });
    const win = await app.firstWindow();
    await win.waitForFunction(() => !!window.nebula?.note?.pdfPreview && !!window.nebula?.holes?.create);
    await win.waitForFunction(() => !!document.querySelector('.note-row'));
    const made = await win.evaluate(() => window.nebula.holes.create({ name: 'Safe', pin: '482193' }));
    if (!made.ok) throw new Error(`hole create: ${JSON.stringify(made)}`);

    const document = '<!doctype html><html><head><meta charset="utf-8"></head><body><p>pdf-scratch-secret words of a sealed note</p></body></html>';
    const shown = await win.evaluate((html) => window.nebula.note.pdfPreview({ document: html }), document);
    check('a preview is made, and only the PDF is left of it', shown?.ok === true && pdfs().length === 1 && pdfs()[0].endsWith('.pdf'), JSON.stringify({ shown, left: pdfs() }));
    await new Promise((r) => { setTimeout(r, 200); });
    const outside = [...seen].filter((n) => /nebula-print|note\.html/.test(n));
    check('the page a PDF is printed from never lies in the system\'s temporary folder', outside.length === 0, outside.join(', '));

    const set = await win.evaluate(() => window.nebula.lock.set({ pin: '193482' }));
    if (!set.ok) throw new Error(`app lock set: ${JSON.stringify(set)}`);
    const locked = await win.evaluate(() => window.nebula.lock.now());
    if (!locked.ok) throw new Error(`app lock now: ${JSON.stringify(locked)}`);
    await new Promise((r) => { setTimeout(r, 400); });
    check('Lock Nebula leaves no preview of a note on the disk', pdfs().length === 0, pdfs().join(', '));
    const state = await win.evaluate(() => window.nebula.lock.state());
    check('the app is still locked after', state.locked === true, JSON.stringify(state));

    // A black hole locked by itself drops them too: the preview may be of its note.
    await win.evaluate(() => window.nebula.lock.unlock({ pin: '193482' }));
    await win.waitForFunction(() => !!window.nebula?.note?.pdfPreview);
    const opened = await win.evaluate((id) => window.nebula.holes.unlock(id, { pin: '482193' }), made.hole.id).catch((err) => ({ ok: false, error: String(err) }));
    const again = await win.evaluate((html) => window.nebula.note.pdfPreview({ document: html }), document);
    const lockedHole = await win.evaluate((id) => window.nebula.holes.lock(id), made.hole.id);
    await new Promise((r) => { setTimeout(r, 200); });
    check('locking a black hole leaves no preview on the disk', again?.ok === true && lockedHole?.ok !== false && pdfs().length === 0, JSON.stringify({ opened, again: again?.ok, lockedHole, left: pdfs() }));
  } finally {
    watcher.close();
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runPdfScratchChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` - ${detail}`}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
