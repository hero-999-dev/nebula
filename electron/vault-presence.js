/**
 * A running window holds notes in memory. If its vault (or one note's folder)
 * disappears, writing that memory into a new folder can say "Saved" while the
 * pictures, videos and attached files stay behind on another volume or path.
 * Keep the directory identities observed at boot and after new notes are made.
 */
import fs from 'node:fs';
import path from 'node:path';

const NOTE_ID = /^[\w-]{1,120}$/;

function identity(dir) {
  try {
    const stat = fs.statSync(dir, { bigint: true });
    // FAT/exFAT and some network shares report no useful inode. Their
    // presence is still checked, but a replacement cannot be distinguished.
    return stat.isDirectory() ? (stat.ino === 0n ? 'present' : `${stat.dev}:${stat.ino}`) : null;
  } catch { return null; }
}

export function vaultPresence(notesDir) {
  let root = null;
  const notes = new Map();
  const assert = (id = null) => {
    if (root !== null && identity(notesDir) !== root) throw new Error('The notes folder disappeared or changed; changes were not saved');
    if (id != null && notes.has(id) && identity(path.join(notesDir, id)) !== notes.get(id)) {
      throw new Error('This note folder disappeared or changed; changes were not saved');
    }
  };
  const remember = (id = null) => {
    assert(id);
    root ??= identity(notesDir);
    if (id != null && NOTE_ID.test(String(id)) && !notes.has(id)) {
      const found = identity(path.join(notesDir, id));
      if (found !== null) notes.set(id, found);
    }
  };
  // A deletion performed by this app is expected to remove the old inode.
  // The next successful write or media copy can then establish a new one.
  const forget = (id) => { if (NOTE_ID.test(String(id ?? ''))) notes.delete(id); };
  const capture = () => {
    remember();
    if (root === null) return;
    let entries;
    try { entries = fs.readdirSync(notesDir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) if (entry.isDirectory() && NOTE_ID.test(entry.name)) remember(entry.name);
  };
  return { assert, remember, forget, capture };
}
