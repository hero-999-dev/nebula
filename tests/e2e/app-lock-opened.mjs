/** Lock Nebula must clear plaintext copies opened from encrypted black holes. */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');

export async function runAppLockOpenedChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-lock-opened-'));
  const source = path.join(profile, 'source.pdf');
  fs.writeFileSync(source, 'app-lock-opened-secret');
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    await win.waitForFunction(() => !!window.nebula?.holes?.create);
    await win.waitForFunction(() => !!document.querySelector('.note-row'));
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    // The test opens a copy without launching the computer's PDF program.
    await app.evaluate(({ shell }) => { shell.openPath = async () => ''; });
    const made = await win.evaluate(() => window.nebula.holes.create({ name: 'Safe', pin: '482193' }));
    if (!made.ok) throw new Error(`hole create: ${JSON.stringify(made)}`);
    const id = made.hole.id;
    const added = await win.evaluate(({ holeId, sourcePath }) => window.nebula.holes.addFile(holeId, 'n-lock', sourcePath), { holeId: id, sourcePath: source });
    if (!added.ok) throw new Error(`hole add file: ${JSON.stringify(added)}`);
    fs.rmSync(source);
    const opened = await win.evaluate((url) => window.nebula.media.openFile(url, 'source.pdf'), added.url);
    const openedDir = path.join(profile, 'opened', 'hole', id);
    check('black-hole attachment opens as a plaintext copy', opened.ok && fs.existsSync(openedDir), JSON.stringify(opened));
    const set = await win.evaluate(() => window.nebula.lock.set({ pin: '193482' }));
    if (!set.ok) throw new Error(`app lock set: ${JSON.stringify(set)}`);
    const locked = await win.evaluate(() => window.nebula.lock.now());
    if (!locked.ok) throw new Error(`app lock now: ${JSON.stringify(locked)}`);
    await win.waitForTimeout(300);
    check('Lock Nebula clears opened black-hole plaintext', !fs.existsSync(openedDir));
    const state = await win.evaluate(() => window.nebula.lock.state());
    check('app remains locked after clearing opened copies', state.locked === true, JSON.stringify(state));
    const unlocked = await win.evaluate(() => window.nebula.lock.unlock({ pin: '193482' }));
    const holes = await win.evaluate(() => window.nebula.holes.list());
    check('unlocking the app leaves the black hole locked', unlocked.ok && holes.ok && holes.holes.find((h) => h.id === id)?.open === false, JSON.stringify({ unlocked, holes }));
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runAppLockOpenedChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` - ${detail}`}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
