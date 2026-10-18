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
    await app.evaluate(({ shell }) => { globalThis.auditOpens = 0; shell.openPath = async () => { globalThis.auditOpens++; return ''; }; });
    const made = await win.evaluate(() => window.nebula.holes.create({ name: 'Safe', pin: '482193' }));
    if (!made.ok) throw new Error(`hole create: ${JSON.stringify(made)}`);
    const id = made.hole.id;
    const plainWrite = await win.evaluate((id) => window.nebula.storage.write('notes/n-private.json', JSON.stringify({ id: 'n-private', hole: id, content: 'private sentinel' })), id);
    check('main refuses a hole-marked note through ordinary storage', plainWrite.ok === false && !fs.existsSync(path.join(profile, 'storage', 'notes', 'n-private', 'n-private.json')), JSON.stringify(plainWrite));
    const added = await win.evaluate(({ holeId, sourcePath }) => window.nebula.holes.addFile(holeId, 'n-lock', sourcePath), { holeId: id, sourcePath: source });
    if (!added.ok) throw new Error(`hole add file: ${JSON.stringify(added)}`);
    fs.rmSync(source);
    const opened = await win.evaluate((url) => window.nebula.media.openFile(url, 'source.pdf'), added.url);
    const openedDir = path.join(profile, 'opened', 'hole', id);
    check('black-hole attachment opens as a plaintext copy', opened.ok && fs.existsSync(openedDir), JSON.stringify(opened));
    // Keep the attachment referenced when unlocking sweeps unused sealed media.
    await win.evaluate(({ id, url }) => window.nebula.holes.write(id, 'n-lock', JSON.stringify({ id: 'n-lock', content: url })), { id, url: added.url });
    await win.evaluate((id) => window.nebula.holes.trash(id), id);
    check('trashing a black hole clears its opened plaintext in main', !fs.existsSync(openedDir));
    await win.evaluate((id) => window.nebula.holes.restore(id), id);
    // Simulate a plaintext copy retained by another program at lock time.
    const retained = path.join(openedDir, 'n-lock', added.file.replace(/\.[a-z0-9]+$/, ''), 'source.pdf');
    fs.mkdirSync(path.dirname(retained), { recursive: true });
    fs.writeFileSync(retained, 'synthetic retained copy');
    const beforeOpens = await app.evaluate(() => globalThis.auditOpens);
    const refused = await win.evaluate((url) => window.nebula.media.openFile(url, 'source.pdf'), added.url);
    check('a locked hole cannot reopen a retained plaintext copy', !refused.ok && await app.evaluate(() => globalThis.auditOpens) === beforeOpens, JSON.stringify(refused));
    await win.evaluate((id) => window.nebula.holes.unlock(id, { pin: '482193' }), id);
    // Exhibit of the old retry bug: the latest edit is plain and marked,
    // whereas the older encrypted note does not yet reference its attachment.
    await win.evaluate((id) => window.nebula.holes.write(id, 'n-lock', JSON.stringify({ id: 'n-lock', title: 'Old sealed', content: '<p>old</p>', updatedAt: 1 })), id);
    const residueDir = path.join(profile, 'storage', 'notes', 'n-lock');
    fs.mkdirSync(residueDir, { recursive: true });
    const residueFile = path.join(residueDir, 'n-lock.json');
    fs.writeFileSync(residueFile, JSON.stringify({ id: 'n-lock', hole: id, title: 'Recovered secret', content: `<p>residue sentinel</p><p>${added.url}</p>`, updatedAt: 2 }));
    await win.reload();
    await win.waitForSelector('.hole-lock');
    check('historical marked plaintext is withheld from the locked note list and cache', await win.evaluate(() => !document.querySelector('#note-list').textContent.includes('Recovered secret') && !localStorage.getItem('nebula:notes')?.includes('residue sentinel')));
    await win.evaluate(() => document.querySelector('.hole-lock').click());
    await win.locator('#ov-hole .hole-pin').fill('482193');
    await win.waitForFunction(() => document.querySelector('#note-list').textContent.includes('Recovered secret'));
    for (let i = 0; i < 50 && fs.existsSync(residueFile); i++) await win.waitForTimeout(100);
    check('authenticated unlock reseals the historical retry and removes its plain file', !fs.existsSync(residueFile));
    check('unlock preserves media referenced only by the recovered edit', fs.existsSync(path.join(profile, 'storage', 'blackholes', id, `n-lock~${added.file}.bhv`)));
    // An even older boot could have stripped the hole marker. An exact ID
    // match with a sealed note can still be reconciled after PIN unlock.
    await win.evaluate((holeId) => window.nebula.holes.write(holeId, 'n-markerless', JSON.stringify({ id: 'n-markerless', title: 'Old sealed copy', content: 'old content', updatedAt: 1 })), id);
    await win.evaluate((holeId) => window.nebula.holes.lock(holeId), id);
    const markerlessDir = path.join(profile, 'storage', 'notes', 'n-markerless');
    const markerlessFile = path.join(markerlessDir, 'n-markerless.json');
    fs.mkdirSync(markerlessDir, { recursive: true });
    fs.writeFileSync(markerlessFile, JSON.stringify({ id: 'n-markerless', title: 'Newer plain copy', content: 'markerless secret', updatedAt: 2 }));
    const markerlessBackup = path.join(profile, 'backups', '2026-10-17', 'notes', 'n-markerless', 'n-markerless.json');
    fs.mkdirSync(path.dirname(markerlessBackup), { recursive: true });
    fs.copyFileSync(markerlessFile, markerlessBackup);
    await win.reload();
    await win.waitForSelector('.hole-lock');
    check('markerless copy remains untouched until its matching hole is authenticated', fs.existsSync(markerlessFile));
    await win.evaluate(() => document.querySelector('.hole-lock').click());
    await win.locator('#ov-hole .hole-pin').fill('482193');
    await win.waitForFunction(() => document.querySelector('#note-list').textContent.includes('Newer plain copy'));
    for (let i = 0; i < 50 && fs.existsSync(markerlessFile); i++) await win.waitForTimeout(100);
    check('exact-id markerless copy is resealed and removed after unlock', !fs.existsSync(markerlessFile));
    // The vault copy can disappear before the backup's bounded async shred finishes.
    for (let i = 0; i < 50 && fs.existsSync(markerlessBackup); i++) await win.waitForTimeout(100);
    check('reconciled markerless plaintext also leaves the backup', !fs.existsSync(markerlessBackup));
    const reconciled = await win.evaluate((holeId) => window.nebula.holes.unlock(holeId, {}), id);
    check('reconciliation keeps the newer markerless edit', reconciled.notes?.some((raw) => JSON.parse(raw).content === 'markerless secret'));
    // A legacy PIN-only wrapper may still exist in both the live vault and
    // backups. The OS-protected migration must reach every local copy.
    await win.evaluate((holeId) => window.nebula.holes.lock(holeId), id);
    const holeMetaFile = path.join(profile, 'storage', 'blackholes', id, 'hole.json');
    const oldMeta = JSON.parse(fs.readFileSync(holeMetaFile, 'utf8'));
    const inner = await app.evaluate(({ safeStorage }, box) => safeStorage.decryptString(Buffer.from(box, 'base64')), oldMeta.key.box);
    oldMeta.key.box = inner;
    oldMeta.key.os = false;
    oldMeta.name = 'Private legacy label';
    delete oldMeta.nameBox;
    fs.writeFileSync(holeMetaFile, JSON.stringify(oldMeta));
    const oldBackup = path.join(profile, 'backups', 'security-legacy', 'blackholes', id, 'hole.json');
    fs.mkdirSync(path.dirname(oldBackup), { recursive: true });
    fs.copyFileSync(holeMetaFile, oldBackup);
    const upgraded = await win.evaluate((holeId) => window.nebula.holes.unlock(holeId, { pin: '482193' }), id);
    const liveKey = JSON.parse(fs.readFileSync(holeMetaFile, 'utf8')).key;
    const backupKey = JSON.parse(fs.readFileSync(oldBackup, 'utf8')).key;
    check('legacy PIN wrapper upgrades with real OS protection', upgraded.ok && liveKey.os === true && liveKey.box !== inner);
    check('local backup loses the old guessable wrapper too', backupKey.os === true && backupKey.box === liveKey.box);
    check('legacy labels leave both live and backup metadata in clear text',
      !fs.readFileSync(holeMetaFile, 'utf8').includes('Private legacy label') && !fs.readFileSync(oldBackup, 'utf8').includes('Private legacy label'));
    const lateBackup = path.join(profile, 'backups', 'security-retry', 'blackholes', id, 'hole.json');
    fs.mkdirSync(path.dirname(lateBackup), { recursive: true });
    fs.writeFileSync(lateBackup, JSON.stringify(oldMeta));
    const retried = await win.evaluate((holeId) => window.nebula.holes.unlock(holeId, {}), id);
    check('later unlock retries a legacy backup that was previously unavailable', retried.ok && JSON.parse(fs.readFileSync(lateBackup, 'utf8')).key.box === liveKey.box);
    await win.evaluate((url) => window.nebula.media.openFile(url, 'source.pdf'), added.url);
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
