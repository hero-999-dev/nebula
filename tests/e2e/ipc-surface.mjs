/** IPC path guards against a throwaway profile. Run after build. */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
export async function runIpcSurfaceChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-ipc-'));
  const noteDir = path.join(profile, 'storage', 'notes', 'n-probe');
  fs.mkdirSync(noteDir, { recursive: true });
  fs.writeFileSync(path.join(noteDir, 'n-probe.json'), JSON.stringify({ id: 'n-probe', title: 'IPC probe', content: '<p>Keep me</p>' }));
  const sentinel = path.join(profile, 'sentinel.txt');
  fs.writeFileSync(sentinel, 'outside storage');
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron', 'main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    await win.waitForFunction(() => !!window.nebula?.storage?.backup, null, { timeout: 10000 });
    const bad = await win.evaluate(async () => ({ dot: await window.nebula.storage.backup('.'), up: await window.nebula.storage.backup('..') }));
    check('backup refuses dot path labels', bad.dot?.ok === false && bad.up?.ok === false, JSON.stringify(bad));
    const blocked = await win.evaluate(async () => {
      const labels = ['../escape', 'C:drive', '\\\\server\\share', 'CON', 'NUL.txt', 'x'.repeat(65)];
      return Promise.all(labels.map(async (label) => ({ label, result: await window.nebula.storage.backup(label) })));
    });
    check('backup refuses traversal, device and overlong labels', blocked.every(({ result }) => result?.ok === false), JSON.stringify(blocked));
    const escaped = await win.evaluate(async (absolute) => {
      const paths = ['../sentinel.txt', absolute, '\\\\server\\share\\file'];
      return Promise.all(paths.map(async (rel) => {
        const read = await window.nebula.storage.read(rel).catch(() => ({ ok: false }));
        const remove = await window.nebula.storage.remove(rel).catch(() => ({ ok: false }));
        const write = await window.nebula.storage.write(rel, 'changed').catch(() => ({ ok: false }));
        return { rel, read, remove, write };
      }));
    }, sentinel);
    check('storage read, write and delete stay inside storage', escaped.every(({ read, remove, write }) => !read?.ok && !remove?.ok && !write?.ok) && fs.readFileSync(sentinel, 'utf8') === 'outside storage', JSON.stringify(escaped));
    const good = await win.evaluate(() => window.nebula.storage.backup('ipc-probe'));
    check('backup accepts a safe label within backups', good?.ok === true && path.resolve(good.path) === path.join(profile, 'backups', 'ipc-probe') && fs.existsSync(path.join(good.path, 'notes', 'n-probe', 'n-probe.json')), JSON.stringify(good));
    check('the note survives rejected backup labels', fs.existsSync(path.join(noteDir, 'n-probe.json')));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runIpcSurfaceChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` - ${detail}`}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
