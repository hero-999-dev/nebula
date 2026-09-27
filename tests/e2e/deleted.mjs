/**
 * Deleted is deleted (0.9.1), in the real app.
 *
 * The owner: "a note I deleted must not be recoverable — that is a security
 * hole". Nebula Test's backups held 28 notes deleted long before. Here a vault
 * starts with backups that still hold a note deleted before this version: the
 * first start must take it out of every backup and leave the others alone.
 * Then a note goes to the Trash (still in the backups: the Trash is a way
 * back) and is deleted there — after which no backup may hold it either.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runDeletedChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-deleted-'));
  const vault = path.join(profile, 'storage', 'notes');
  const backups = path.join(profile, 'backups');
  const note = (dir, id, title) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, title, content: `<p>${title}</p>`, createdAt: 1, updatedAt: 1 }));
  };
  note(vault, 'n-keep', 'Keep');
  note(vault, 'n-bin', 'Into the bin');
  for (const b of ['2026-09-01', 'pre-update-0.8.8-1']) {
    note(path.join(backups, b, 'notes'), 'n-keep', 'Keep');
    note(path.join(backups, b, 'notes'), 'n-bin', 'Into the bin');
    note(path.join(backups, b, 'notes'), 'n-gone', 'Deleted before 0.9.1');
  }
  const copies = (id) => fs.readdirSync(backups).filter((b) => fs.existsSync(path.join(backups, b, 'notes', `${id}.json`)));

  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10000);
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50 });
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());

    check('the first start takes a note deleted before this version out of every backup', copies('n-gone').length === 0, JSON.stringify(copies('n-gone')));
    check('...and leaves the notes still in the vault in them', copies('n-keep').length >= 2 && copies('n-bin').length >= 2);
    const meta = JSON.parse(fs.readFileSync(path.join(profile, 'storage', 'meta.json'), 'utf8'));
    check('...once: the vault remembers it was done', !!meta.deletedNotesPurged);

    // Into the Trash: still in the backups, because the Trash is a way back.
    await win.evaluate(() => {
      const row = [...document.querySelectorAll('.note-row')].find((r) => r.querySelector('.nr-title')?.textContent === 'Into the bin');
      row.parentElement.querySelector('.nr-more').click();
      document.querySelector('[data-note-act="trash"]').click();
    });
    await win.waitForTimeout(400);
    check('a note in the Trash is still in the backups', copies('n-bin').length >= 2);

    // Deleted from the Trash: gone from the vault and from every backup.
    await win.evaluate(() => document.querySelector('.drawer-tab[data-drawer="trash"]').click());
    await win.waitForFunction(() => [...document.querySelectorAll('.drawer-item')].some((i) => i.textContent.includes('Into the bin')), null, { polling: 50 });
    await win.evaluate(() => {
      const item = [...document.querySelectorAll('.drawer-item')].find((i) => i.textContent.includes('Into the bin'));
      [...item.querySelectorAll('.drawer-actions button')].find((b) => b.textContent === 'Delete').click();
    });
    await win.waitForFunction(() => ![...document.querySelectorAll('.drawer-item')].some((i) => i.textContent.includes('Into the bin')), null, { polling: 50 });
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) {
      gone = !fs.existsSync(path.join(vault, 'n-bin.json')) && copies('n-bin').length === 0;
      if (!gone) await win.waitForTimeout(100);
    }
    check('a note deleted from the Trash is gone from the vault and from every backup', gone, JSON.stringify(copies('n-bin')));
    check('...and the note that was kept is still everywhere', fs.existsSync(path.join(vault, 'n-keep.json')) && copies('n-keep').length >= 2);
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runDeletedChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
