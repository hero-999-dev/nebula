/** A vault that disappears while the app is open must not be silently rebuilt without its media. */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');

// The disconnect, as a person pulling a drive or moving the folder would do it.
// Windows refuses to move a folder for a moment while something reads a file in
// it (the picture the note just showed, a virus scan of what was just written):
// EPERM/EBUSY, seen in about half the runs. The person would try again; so does this.
async function moveAway(from, to) {
  for (let tries = 0; ; tries++) {
    try { fs.renameSync(from, to); return; }
    catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || tries >= 50) throw err;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

export async function runVaultDisconnectChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-vault-disconnect-'));
  const notes = path.join(profile, 'storage', 'notes');
  const media = ['picture.png', 'video.mp4', 'att-m1abc-0a1b2c3d.pdf'];
  for (const [id, title] of [['n-one', 'Disconnect one'], ['n-two', 'Disconnect two']]) {
    const dir = path.join(notes, id);
    fs.mkdirSync(dir, { recursive: true });
    const content = id === 'n-two' ? `<p>${title}</p><p><img src="nebula-media://note/${id}/picture.png"></p><p><video src="nebula-media://note/${id}/video.mp4"></video></p><p><span class="link-attach" data-src="nebula-media://note/${id}/att-m1abc-0a1b2c3d.pdf" data-name="file.pdf"></span></p>` : `<p>${title}</p>`;
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, title, content, createdAt: 1, updatedAt: 1 }));
    if (id === 'n-two') for (const name of media) fs.writeFileSync(path.join(dir, name), `original ${name}`);
  }
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    await win.waitForFunction(() => [...document.querySelectorAll('.note-row')].some((r) => r.textContent.includes('Disconnect one')));
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes('Disconnect one')).click());
    await win.waitForFunction(() => document.getElementById('editor')?.textContent?.includes('Disconnect one'));
    const disconnected = path.join(profile, 'disconnected-notes');
    await moveAway(notes, disconnected);
    await win.evaluate(() => { const ed = document.getElementById('editor'); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.type(' changed');
    await win.waitForTimeout(1200);
    const state = await win.evaluate(() => ({ save: document.getElementById('savestate')?.textContent, banner: !document.getElementById('demo-banner')?.hidden }));
    check('disconnected vault reports Not saved with a visible error', state.save === 'Not saved' && state.banner, JSON.stringify(state));
    check('disconnected vault is not recreated without its media', !fs.existsSync(notes));
    check('original media remain intact in the disconnected folder', media.every((name) => fs.readFileSync(path.join(disconnected, 'n-two', name), 'utf8') === `original ${name}`));
  } finally {
    // A failed autosave intentionally vetoes normal quit; end this throwaway
    // process directly so the test does not wait on the unsaved-note dialog.
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }

  // The same failure can affect just one note folder while the vault itself remains.
  const single = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-note-disconnect-'));
  const folder = path.join(single, 'storage', 'notes', 'n-one');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'n-one.json'), JSON.stringify({ id: 'n-one', title: 'One folder', content: '<p>words</p><img src="nebula-media://note/n-one/picture.png">', createdAt: 1, updatedAt: 1 }));
  fs.writeFileSync(path.join(folder, 'picture.png'), 'original picture');
  app = null;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: single } });
    const win = await app.firstWindow();
    await win.waitForFunction(() => [...document.querySelectorAll('.note-row')].some((r) => r.textContent.includes('One folder')));
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes('One folder')).click());
    await win.waitForFunction(() => document.getElementById('editor')?.textContent?.includes('words'));
    const disconnected = path.join(single, 'disconnected-note');
    await moveAway(folder, disconnected);
    await win.evaluate(() => { const ed = document.getElementById('editor'); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.type(' changed');
    await win.waitForTimeout(1200);
    const state = await win.evaluate(() => ({ save: document.getElementById('savestate')?.textContent, banner: !document.getElementById('demo-banner')?.hidden }));
    check('disconnected note folder reports Not saved', state.save === 'Not saved' && state.banner, JSON.stringify(state));
    check('disconnected note folder is not recreated without its picture', !fs.existsSync(folder));
    check('original picture remains in the disconnected note folder', fs.readFileSync(path.join(disconnected, 'picture.png'), 'utf8') === 'original picture');
  } finally {
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app?.close().catch(() => {});
    fs.rmSync(single, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runVaultDisconnectChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` - ${detail}`}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
