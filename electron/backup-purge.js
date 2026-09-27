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

/** A note id is a file name, never a path. */
const NOTE_ID = /^[\w-]{1,120}$/;

function shred(file) {
  try {
    const size = fs.statSync(file).size;
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
  let live;
  try {
    live = new Set(fs.readdirSync(notesDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
  } catch {
    return { refused: true, removed: 0 };
  }
  if (!live.size) return { refused: true, removed: 0 };
  let removed = 0;
  for (const dir of noteDirs(backupsDir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || live.has(f.slice(0, -5))) continue;
      shred(path.join(dir, f));
      removed += 1;
    }
  }
  return { refused: false, removed };
}
