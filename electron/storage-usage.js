/**
 * How much room Nebula takes on this computer (1.0.3, Settings → Storage).
 *
 * The plan (Nebula-Tailscale-Sync-Plan, "Storage"): the notes — their words
 * and their pictures and videos apart, the biggest five by name — the black
 * holes (sealed, so only their files' sizes), the backups, the Trash, the
 * program itself and the copies opened in other programs, and the whole.
 *
 * Measured off the window's thread, a folder at a time, never following a
 * link. A backup shares the vault's pictures and videos (note-media.js
 * snapshotVault, hard links): a file is counted once, where it is met first —
 * the notes before the backups — so the whole is what the disk really holds.
 * Nothing here deletes anything; it only reads sizes and the notes' titles.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const NOTE_ID = /^[\w-]{1,120}$/;
const TOP = 5;

/** A file met once: its device and inode, or its path where the disk gives none. */
function counter() {
  const seen = new Set();
  return (st, file) => {
    const key = st.ino ? `${st.dev}:${st.ino}` : file;
    if (seen.has(key)) return 0;
    seen.add(key);
    return Number(st.size);
  };
}

/** Every file under a folder, its size counted once. @returns {Promise<number>} */
async function sizeOf(dir, count) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { total += await sizeOf(full, count); continue; }
    if (!entry.isFile()) continue;
    try { total += count(await fs.lstat(full, { bigint: true }), full); } catch { /* gone meanwhile */ }
  }
  return total;
}

/** One file's size, counted once; 0 when it is not there. */
async function fileSize(file, count) {
  try { return count(await fs.lstat(file, { bigint: true }), file); } catch { return 0; }
}

/** A note's title and whether it is in the Trash, read from its JSON; nothing else of it is kept. */
async function headOf(file) {
  try {
    const note = JSON.parse(await fs.readFile(file, 'utf8'));
    return { title: typeof note?.title === 'string' ? note.title.slice(0, 120) : '', trashed: !!note?.deletedAt };
  } catch { return { title: '', trashed: false }; }
}

/**
 * @param {object} where
 * @param {string} where.notesDir     storage/notes: a folder per note
 * @param {string} [where.holesDir]   storage/blackholes
 * @param {string} [where.backupsDir]
 * @param {string} [where.openedDir]
 * @param {string|null} [where.appPath]  the program: its folder, or the one portable file
 * @param {string[]} [where.skip]       note ids not to name (the guide)
 */
export async function measureStorage({ notesDir, holesDir = null, backupsDir = null, openedDir = null, appPath = null, skip = [] }) {
  const count = counter();
  const notes = { total: 0, text: 0, media: 0, count: 0, top: [] };
  const trash = { bytes: 0, count: 0 };
  const sizes = [];
  let ids = [];
  try { ids = (await fs.readdir(notesDir, { withFileTypes: true })).filter((e) => e.isDirectory() && NOTE_ID.test(e.name)).map((e) => e.name); } catch { /* no vault yet */ }
  for (const id of ids) {
    const dir = path.join(notesDir, id);
    const json = path.join(dir, `${id}.json`);
    const text = await fileSize(json, count);
    const all = text + await sizeOf(dir, count);   // the JSON is met first, so the folder adds only the rest
    const head = await headOf(json);
    notes.text += text;
    notes.media += all - text;
    notes.total += all;
    notes.count += 1;
    if (head.trashed) { trash.bytes += all; trash.count += 1; }
    else if (!skip.includes(id)) sizes.push({ id, title: head.title, bytes: all });
  }
  notes.top = sizes.sort((a, b) => b.bytes - a.bytes).slice(0, TOP);

  const holes = { bytes: 0, count: 0 };
  if (holesDir) {
    let entries = [];
    try { entries = (await fs.readdir(holesDir, { withFileTypes: true })).filter((e) => e.isDirectory()); } catch { /* none */ }
    for (const entry of entries) { holes.bytes += await sizeOf(path.join(holesDir, entry.name), count); holes.count += 1; }
    // Whatever lies beside the holes' folders (their list) belongs to them too.
    holes.bytes += await sizeOf(holesDir, count);
  }

  const backups = { total: 0, copies: [] };
  if (backupsDir) {
    let entries = [];
    try { entries = (await fs.readdir(backupsDir, { withFileTypes: true })).filter((e) => e.isDirectory()); } catch { /* none */ }
    for (const entry of entries.sort((a, b) => b.name.localeCompare(a.name))) {
      const bytes = await sizeOf(path.join(backupsDir, entry.name), count);
      backups.copies.push({ name: entry.name, bytes });
      backups.total += bytes;
    }
  }

  const opened = openedDir ? await sizeOf(openedDir, count) : 0;
  let app = null;
  if (appPath) {
    try {
      const st = await fs.lstat(appPath, { bigint: true });
      app = st.isDirectory() ? await sizeOf(appPath, count) : count(st, appPath);
    } catch { app = null; }
  }
  const total = notes.total + holes.bytes + backups.total + opened + (app ?? 0);
  return { ok: true, at: Date.now(), notes, trash, holes, backups, opened, app, total };
}
