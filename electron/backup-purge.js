/**
 * A note deleted from the Trash is gone from the backups too.
 *
 * The vault is copied aside every day and before every update (and, from
 * 0.9.1, before notes are repaired), and a labelled copy is kept for good.
 * That made "delete" a matter of where one looked: a note removed from the
 * Trash lived on in every backup taken while it existed — 28 such notes in
 * Nebula Test's backups, 22 more in an old vault copy on the flash drive. The
 * owner (2026-09-27): a note I deleted must not be recoverable; anything else
 * is a security hole. The Trash stays the one way back, until a note is
 * deleted there.
 *
 * Files are overwritten before they are removed. That is best effort: flash
 * drives and SSDs remap blocks, so only encryption of the whole disk makes
 * old bytes truly unreadable.
 */

import fs from 'node:fs';
import path from 'node:path';
import { noteIds, noteFile, referencesOf, isPicture, isKeptFile, isCutShort } from './note-media.js';

/** A note id is a file name, never a path. */
const NOTE_ID = /^[\w-]{1,120}$/;

function shred(file) {
  try {
    const { size, nlink } = fs.statSync(file);
    // A picture or a video a backup shares with the vault or with another
    // backup (note-media.js snapshotVault): this place lets go of it, and the
    // last place to do so takes the bytes with it.
    if (nlink > 1) { fs.rmSync(file, { force: true }); return; }
    const fd = fs.openSync(file, 'r+');
    try {
      if (size) fs.writeSync(fd, Buffer.alloc(size));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch { /* it is removed below all the same */ }
  fs.rmSync(file, { force: true });
}

/**
 * The copies of the vault the app itself puts aside under a label, by kind:
 * before an update is installed (`pre-update-<version>-<time>`) and before the
 * repair of old notes at a version (`pre-heal-<version>`). Each was kept for
 * good, one more with every version; the owner (0.9.4): "only the newest of
 * each kind." A label of another kind — one a person made — is nobody's to prune.
 */
const LABELLED_KINDS = ['pre-update-', 'pre-heal-'];
/** What orders two copies of a kind: the time in an update's name, else the version, part by part. */
function labelOrder(rest) {
  const timed = /^(.*)-(\d{10,})$/.exec(rest);
  const version = (timed ? timed[1] : rest).split(/[^0-9]+/).filter(Boolean).map(Number);
  return [timed ? Number(timed[2]) : 0, ...version];
}
function olderFirst(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Of the labelled copies in a backups folder, those that are not the newest of their kind.
 * @param {string[]} names the folder's entries
 * @returns {string[]} the ones to remove
 */
export function staleLabelled(names) {
  const stale = [];
  for (const prefix of LABELLED_KINDS) {
    const kind = names.filter((n) => n.startsWith(prefix) && n.length > prefix.length)
      .map((name) => ({ name, order: labelOrder(name.slice(prefix.length)) }))
      .sort((a, b) => olderFirst(a.order, b.order) || a.name.localeCompare(b.name));
    stale.push(...kind.slice(0, -1).map((k) => k.name));
  }
  return stale;
}

/** The labelled copies that are not the newest of their kind, removed. @returns {string[]} their names */
export function pruneLabelled(backupsDir) {
  let names;
  try { names = fs.readdirSync(backupsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
  const gone = [];
  for (const name of staleLabelled(names)) {
    try { shredTree(path.join(backupsDir, name)); gone.push(name); } catch { /* it is tried again at the next backup */ }
  }
  return gone;
}

/** The copies the app makes itself: one a day, and the labelled kinds. */
const DATED = /^\d{4}-\d{2}-\d{2}$/;
const madeByApp = (name) => DATED.test(name) || LABELLED_KINDS.some((prefix) => name.startsWith(prefix) && name.length > prefix.length);
/** A copy on its way out: named so first, so that one the app was closed over is finished at the next start and is never taken for a copy. */
const GOING = 'going-';

/** Kept the old way: a note's file lies flat in the copy's notes, as before 0.9.4 — its pictures written into its text. */
function keptOldWay(copyDir) {
  try {
    return fs.readdirSync(path.join(copyDir, 'notes'), { withFileTypes: true })
      .some((e) => e.isFile() && e.name.endsWith('.json') && NOTE_ID.test(e.name.slice(0, -5)));
  } catch { return false; }
}

function filesIn(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) filesIn(full, out); else out.push(full);
  }
  return out;
}

/**
 * The copies in a backups folder that are to go for being kept the old way —
 * those the app made itself — and any already on its way out.
 * @returns {string[]} their folder names, the ones on their way out first
 */
export function oldWayCopies(backupsDir) {
  let names;
  try { names = fs.readdirSync(backupsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
  return [
    ...names.filter((name) => name.startsWith(GOING)),
    ...names.filter((name) => madeByApp(name) && keptOldWay(path.join(backupsDir, name))),
  ];
}

/**
 * The copies made while a picture was still written into its note's text hold
 * every picture again, each of them: a vault of 8 MB had 87 MB of backups.
 * They would leave one a day for a week, and the labelled ones not before the
 * next update. The owner (0.9.4): "do not make it wait seven days — it eats
 * the user's disk"; and, offered them made small instead: "delete the old
 * copies altogether." So every copy of the app's own making that is kept the
 * old way goes at once, overwritten — the daily ones, and the one put aside
 * before the update. The caller makes a copy the new way in their place, and
 * calls this only when the vault's own move is whole. A copy under a label a
 * person made is nobody's to remove. Between two files the app is given its
 * turn (`pause`).
 * @returns {Promise<string[]>} the copies removed
 */
export async function dropOldWayCopies(backupsDir, { pause = () => new Promise((resolve) => { setImmediate(resolve); }) } = {}) {
  const gone = [];
  for (const name of oldWayCopies(backupsDir)) {
    let dir = path.join(backupsDir, name);
    if (!name.startsWith(GOING)) {
      const going = path.join(backupsDir, `${GOING}${name}`);
      try { fs.renameSync(dir, going); } catch { continue; }      // in use, or one of that name is on its way out already: at the next start
      dir = going;
    }
    for (const file of filesIn(dir)) {
      await pause();
      shred(file);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    gone.push(name.startsWith(GOING) ? name.slice(GOING.length) : name);
  }
  return gone;
}

/**
 * A whole copy of the vault put aside under a label, gone: every file in it
 * overwritten and removed. For the copy made before the note folders, once the
 * move is seen to be whole — "it has no meaning after the move" (the owner).
 * @returns {number} files removed
 */
export function shredTree(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  let removed = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) removed += shredTree(full);
    else { shred(full); removed += 1; }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return removed;
}

/** A note's own folder in a backup — its pictures and videos (0.9.4) — and everything in it. */
function shredFolder(folder) {
  let names;
  try {
    if (!fs.statSync(folder).isDirectory()) return 0;
    names = fs.readdirSync(folder);
  } catch { return 0; }
  for (const name of names) shred(path.join(folder, name));
  fs.rmSync(folder, { recursive: true, force: true });
  return names.length;
}

/** backups/<name>/blackholes/<hole> for every backup that has it. */
function holeDirs(backupsDir, holeId) {
  if (!NOTE_ID.test(String(holeId))) return [];
  let entries;
  try { entries = fs.readdirSync(backupsDir, { withFileTypes: true }); } catch { return []; }
  return entries.filter((e) => e.isDirectory()).map((e) => path.join(backupsDir, e.name, 'blackholes', holeId)).filter((dir) => fs.existsSync(dir));
}

/** A note deleted from a black hole (0.9.4): its sealed copies leave every backup. */
export function purgeHoleNoteFromBackups(backupsDir, holeId, noteId) {
  if (!NOTE_ID.test(String(noteId))) return 0;
  let removed = 0;
  for (const dir of holeDirs(backupsDir, holeId)) {
    const file = path.join(dir, `${noteId}.bh`);
    if (fs.existsSync(file)) { shred(file); removed += 1; }
    // Its sealed videos and attached files stand beside it: <note>~vid-….bhv, <note>~att-….bhv.
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(`${noteId}~`) && name.endsWith('.bhv')) { shred(path.join(dir, name)); removed += 1; }
    }
  }
  return removed;
}

/**
 * Sealed videos taken out of a black hole's notes (black-holes.js sweeps them
 * when it is opened): out of every backup too, by their file names.
 * @param {string[]} files `<note>~vid-….bhv`
 */
export function purgeHoleFilesFromBackups(backupsDir, holeId, files) {
  const names = (files ?? []).filter((name) => /^[\w-]{1,120}~[\w.-]{1,120}\.bhv$/.test(String(name)));
  let removed = 0;
  for (const dir of holeDirs(backupsDir, holeId)) {
    for (const name of names) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) { shred(file); removed += 1; }
    }
  }
  return removed;
}

/** A black hole deleted: it leaves every backup, with every note in it. */
export function purgeHoleFromBackups(backupsDir, holeId) {
  let removed = 0;
  for (const dir of holeDirs(backupsDir, holeId)) removed += shredFolder(dir);
  return removed;
}

/** backups/<name>/notes for every backup that has one. */
function noteDirs(backupsDir) {
  let entries;
  try { entries = fs.readdirSync(backupsDir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(backupsDir, e.name, 'notes'))
    .filter((dir) => fs.existsSync(dir));
}

/**
 * One note, out of every backup: called when its file leaves the vault.
 * @returns {number} backup copies removed
 */
export function purgeNoteFromBackups(backupsDir, id) {
  if (!NOTE_ID.test(String(id))) return 0;
  let removed = 0;
  for (const dir of noteDirs(backupsDir)) {
    const file = path.join(dir, `${id}.json`);
    if (fs.existsSync(file)) { shred(file); removed += 1; }
    removed += shredFolder(path.join(dir, id));   // its pictures and videos (0.9.4)
  }
  return removed;
}

/**
 * A picture or a video taken out of a note that lives on, out of every backup.
 *
 * Its file leaves the note's folder at the next start (note-media.js
 * sweepNote); a backup that shared it went on holding it — a day in the daily
 * copy, until the next update in the copy put aside before one. The owner
 * (0.9.4): "close that too: deleted from the backups as well." So what a
 * living note's text no longer names leaves that note's folder in every
 * copy, the ones under a person's label among them.
 *
 * The note's text in the vault is what decides, not what the vault's folder
 * happens to hold: a file the note still names stays in the backups even when
 * the vault has lost it — that is what a backup is for. And a note whose file
 * cannot be read is left alone in every copy, folder and all, as the vault's
 * own sweep leaves it.
 * @param {{keep?: Map<string, Set<string>|string[]>, only?: Map<string, Set<string>>}} [opts]
 *   `keep`: files still to be asked about (note-media.js tidyVault `held`) —
 *   those stay; `only`: these notes alone, and of each these files alone (the
 *   answer to that question)
 * @returns {number} files removed
 */
export function purgeUnnamedFromBackups(notesDir, backupsDir, { keep = null, only = null } = {}) {
  const live = noteIds(notesDir);
  if (!live || !live.size) return 0;
  /** A note's id → the files its text names; null: not to be read, so not to be judged. */
  const named = new Map();
  const namesOf = (id) => {
    if (!named.has(id)) {
      let own = null;
      try {
        const text = fs.readFileSync(noteFile(notesDir, id), 'utf8');
        if (JSON.parse(text)?.id) own = referencesOf(text, id).own;
      } catch { /* left alone */ }
      named.set(id, own);
    }
    return named.get(id);
  };
  let removed = 0;
  for (const dir of noteDirs(backupsDir)) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const id = entry.name;
      if (!entry.isDirectory() || !NOTE_ID.test(id) || !live.has(id)) continue;
      if (only && !only.has(id)) continue;
      const kept = keep?.get(id) ? new Set(keep.get(id)) : null;
      const own = namesOf(id);
      if (!own) continue;
      let files;
      try { files = fs.readdirSync(path.join(dir, id)); } catch { continue; }
      for (const name of files) {
        // A copy cut short, carried in by a backup made before the start's sweep: never whole, so never a backup's to keep.
        const cut = isCutShort(name, id);
        if (!cut && (own.has(name) || name.includes('.tmp-') || !(isPicture(name) || isKeptFile(name)))) continue;
        if (kept?.has(name) || (only && !only.get(id).has(name))) continue;
        shred(path.join(dir, id, name));
        removed += 1;
      }
    }
  }
  return removed;
}

/**
 * Every note that is no longer in the vault, out of every backup: the notes
 * deleted before backups were purged on delete. Refuses when the vault holds
 * no notes — an unreadable or wiped vault must never empty the backups too,
 * since then they are the only copy left.
 * @returns {{refused: boolean, removed: number}}
 */
export function purgeDeletedFromBackups(notesDir, backupsDir) {
  // A note is a folder with its file in it — or, in a vault not yet put that way, a file lying flat.
  const live = noteIds(notesDir);
  if (!live || !live.size) return { refused: true, removed: 0 };
  let removed = 0;
  for (const dir of noteDirs(backupsDir)) {
    for (const f of fs.readdirSync(dir)) {
      // A deleted note's folder goes as its file does (0.9.4).
      if (!f.endsWith('.json')) { if (NOTE_ID.test(f) && !live.has(f)) removed += shredFolder(path.join(dir, f)); continue; }
      if (live.has(f.slice(0, -5))) continue;
      shred(path.join(dir, f));
      removed += 1;
    }
  }
  return { refused: false, removed };
}
