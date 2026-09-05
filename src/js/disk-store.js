import { setSaveHook } from './storage.js';

const NOTES_KEY = 'nebula:notes';

let api = null;
const lastWritten = new Map();

/**
 * One promise chain per file. Rapid saves (seeding, fast typing) used to fire
 * overlapping writes at the same path and interleave into corrupt JSON —
 * queueing makes the last state win, in order.
 */
const queues = new Map();

function enqueue(key, task) {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(task, task).catch((err) => console.warn('[storage] write failed', err));
  queues.set(key, next);
  next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

function mirrorNotes(serialized) {
  if (!api) return Promise.resolve();
  let notes;
  try {
    notes = JSON.parse(serialized);
  } catch {
    return Promise.resolve();
  }
  if (!Array.isArray(notes)) return Promise.resolve();

  const ids = new Set();
  const jobs = [];
  for (const note of notes) {
    if (!note?.id) continue;
    ids.add(note.id);
    const json = JSON.stringify(note, null, 2);
    if (lastWritten.get(note.id) === json) continue;
    lastWritten.set(note.id, json);
    const rel = `notes/${note.id}.json`;
    jobs.push(enqueue(rel, () => api.write(rel, json)));
  }
  // notes that no longer exist lose their file (was deleting the wrong path)
  for (const id of [...lastWritten.keys()]) {
    if (ids.has(id)) continue;
    lastWritten.delete(id);
    const rel = `notes/${id}.json`;
    jobs.push(enqueue(rel, () => api.remove(rel)));
  }
  return Promise.all(jobs).then(() => {});
}

function mirror(key, serialized) {
  if (!api || key !== NOTES_KEY) return;
  mirrorNotes(serialized).catch((err) => console.warn('[storage] mirror failed', err));
}

/** Wait for every pending disk write (used before quitting / verifying). */
export function flushDisk() {
  return Promise.all([...queues.values()]).then(() => {});
}

/**
 * Load the vault from disk into localStorage before the note store boots.
 *
 * @returns {Promise<{bridge: boolean, ok: boolean, empty: boolean, error: string|null}>}
 *   bridge — running in the desktop app (false in a plain browser)
 *   ok     — the vault was read successfully; if false, NOTHING may be written
 *            back to disk and the caller must not treat the app as a first run
 *   empty  — the vault is genuinely empty, i.e. a real first run
 *
 * The distinction between "empty" and "unreadable" is the whole point of this
 * return value: a failed read used to look exactly like a fresh install, and a
 * fresh install seeds sample notes over the top.
 */
export async function initDiskStorage() {
  api = window.nebula?.storage ?? null;
  lastWritten.clear();

  if (!api) {
    // Browser preview: in-memory only, nothing on disk to lose.
    return { bridge: false, ok: true, empty: true, error: null };
  }

  let listing;
  try {
    listing = await api.list('notes');
  } catch (err) {
    listing = { ok: false, files: [], error: err?.message ?? String(err) };
  }

  if (!listing?.ok) {
    // Clear the save hook rather than merely not setting it: while the vault
    // cannot be read, nothing this session does may reach the files on disk.
    api = null;
    setSaveHook(null);
    console.warn('[storage] vault unreadable, disk mirror disabled:', listing?.error);
    return { bridge: true, ok: false, empty: false, error: listing?.error ?? 'unreadable' };
  }

  const files = listing.files ?? [];
  if (files.length) {
    const notes = [];
    let readError = null;
    for (const file of files) {
      const res = await api.read(`notes/${file}`);
      if (!res.ok) {
        // A file that vanished between listing and reading is survivable; an
        // I/O or permission error means we are not seeing the whole vault.
        if (!res.missing) readError = res.error ?? 'read failed';
        continue;
      }
      try {
        const note = JSON.parse(res.data);
        if (note?.id) {
          notes.push(note);
          lastWritten.set(note.id, JSON.stringify(note, null, 2));
        }
      } catch {
        console.warn('[storage] skipping unreadable note file', file);
      }
    }

    if (readError) {
      api = null;
      lastWritten.clear();
      setSaveHook(null);
      console.warn('[storage] vault partially unreadable, disk mirror disabled:', readError);
      return { bridge: true, ok: false, empty: false, error: readError };
    }

    if (notes.length) localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    setSaveHook(mirror);
    return { bridge: true, ok: true, empty: notes.length === 0, error: null };
  }

  // No files on disk. If localStorage still holds notes this is an upgrade from
  // a build that had no disk mirror — push them out to files, do not reseed.
  const cached = localStorage.getItem(NOTES_KEY);
  let cachedCount = 0;
  if (cached) {
    try { cachedCount = JSON.parse(cached)?.length ?? 0; } catch { cachedCount = 0; }
    if (cachedCount) await mirrorNotes(cached);
  }

  setSaveHook(mirror);
  return { bridge: true, ok: true, empty: cachedCount === 0, error: null };
}

export function hasDiskStorage() {
  return !!api;
}
