import { setSaveHook } from './storage.js';

const NOTES_KEY = 'nebula:notes';

let api = null;
const lastWritten = new Map();
const desired = new Map();
const failures = new Map();
let readError = null;
let generation = 0;

/**
 * One promise chain per file. Rapid saves (seeding, fast typing) used to fire
 * overlapping writes at the same path and interleave into corrupt JSON —
 * queueing makes the last state win, in order.
 */
const queues = new Map();

export function getDiskStatus() {
  const error = readError ?? failures.values().next().value ?? null;
  return { ok: !error, pending: queues.size > 0, error };
}

function publishStatus() {
  window.dispatchEvent(new CustomEvent('nebula-storage-status', { detail: getDiskStatus() }));
}

function enqueue(id, json) {
  const prev = queues.get(id);
  if (prev?.json === json) return prev.promise;
  if (!prev && !failures.has(id) && (lastWritten.get(id) ?? null) === json) return Promise.resolve();

  const targetApi = api;
  const currentGeneration = generation;
  const entry = { json, promise: null };
  entry.promise = (prev?.promise ?? Promise.resolve()).then(async () => {
    const rel = `notes/${id}.json`;
    const result = json === null ? await targetApi.remove(rel) : await targetApi.write(rel, json);
    if (!result?.ok) throw new Error(result?.error ?? `Could not ${json === null ? 'remove' : 'save'} ${rel}`);
    if (generation !== currentGeneration) return;
    // Acknowledging before this result used to suppress every later retry.
    if (json === null) lastWritten.delete(id);
    else lastWritten.set(id, json);
    failures.delete(id);
    if (json === null && desired.get(id) === null) desired.delete(id);
  }).catch((err) => {
    if (generation !== currentGeneration) return;
    failures.set(id, err?.message ?? String(err));
    console.warn('[storage] write failed', err);
  }).finally(() => {
    if (generation !== currentGeneration) return;
    if (queues.get(id) === entry) queues.delete(id);
    publishStatus();
  });
  queues.set(id, entry);
  publishStatus();
  return entry.promise;
}

/**
 * @param {object[]} notes every note
 * @param {string[]} [changed] the ids that changed. Without it every note is
 *   serialised again to find out — a 6 MB article on every keystroke's save.
 */
function mirrorNotes(notes, changed) {
  if (!api || !Array.isArray(notes)) return Promise.resolve();

  const only = Array.isArray(changed) ? new Set(changed) : null;
  const ids = new Set();
  const jobs = [];
  for (const note of notes) {
    if (!note?.id) continue;
    ids.add(note.id);
    if (only && !only.has(note.id) && (desired.has(note.id) || lastWritten.has(note.id))) continue;
    const json = JSON.stringify(note, null, 2);
    desired.set(note.id, json);
    jobs.push(enqueue(note.id, json));
  }
  // notes that no longer exist lose their file (was deleting the wrong path)
  for (const id of new Set([...lastWritten.keys(), ...desired.keys()])) {
    if (ids.has(id)) continue;
    desired.set(id, null);
    jobs.push(enqueue(id, null));
  }
  return Promise.all(jobs).then(() => {});
}

let localCopyDropped = false;

/** The save hook: notes go to disk, and localStorage stops carrying them. */
function mirror(key, value, { changed } = {}) {
  if (!api || key !== NOTES_KEY) return false;
  mirrorNotes(value, changed).catch((err) => console.warn('[storage] mirror failed', err));
  // The copy loaded at boot is stale from the first save on. Left there, a
  // vault emptied on disk would find it on the next start and write every
  // note in it back — the notes deleted since among them.
  if (!localCopyDropped) {
    localCopyDropped = true;
    try { localStorage.removeItem(NOTES_KEY); } catch { /* nothing to drop */ }
  }
  return true;
}

/** Wait for every pending disk write (used before quitting / verifying). */
export async function flushDisk() {
  if (!api) return;
  // Retry only at the start of an explicit flush. A persistent disk error must
  // reject this flush, not spin forever or report a successful save.
  for (const id of failures.keys()) {
    if (!queues.has(id) && desired.has(id)) enqueue(id, desired.get(id));
  }
  while (queues.size) await Promise.all([...queues.values()].map((entry) => entry.promise));
  if (failures.size) throw new Error(getDiskStatus().error);
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
  generation += 1;
  localCopyDropped = false;
  api = window.nebula?.storage ?? null;
  lastWritten.clear();
  desired.clear();
  failures.clear();
  queues.clear();
  readError = null;
  setSaveHook(null);
  publishStatus();

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
    readError = listing?.error ?? 'unreadable';
    publishStatus();
    console.warn('[storage] vault unreadable, disk mirror disabled:', listing?.error);
    return { bridge: true, ok: false, empty: false, error: listing?.error ?? 'unreadable' };
  }

  const files = listing.files ?? [];
  if (files.length) {
    const notes = [];
    for (const file of files) {
      let res;
      try { res = await api.read(`notes/${file}`); }
      catch (err) { res = { ok: false, error: err?.message ?? String(err) }; }
      if (!res?.ok) {
        // A file that vanished between listing and reading is survivable; an
        // I/O or permission error means we are not seeing the whole vault.
        if (!res?.missing) readError = res?.error ?? 'read failed';
        continue;
      }
      try {
        const note = JSON.parse(res.data);
        if (note?.id) {
          notes.push(note);
          lastWritten.set(note.id, JSON.stringify(note, null, 2));
        } else readError = `Invalid note file: ${file}`;
      } catch {
        readError = `Unreadable note file: ${file}`;
        console.warn('[storage] skipping unreadable note file', file);
      }
    }

    if (readError) {
      api = null;
      lastWritten.clear();
      setSaveHook(null);
      publishStatus();
      console.warn('[storage] vault partially unreadable, disk mirror disabled:', readError);
      return { bridge: true, ok: false, empty: false, error: readError };
    }

    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    setSaveHook(mirror);
    return { bridge: true, ok: true, empty: notes.length === 0, error: null };
  }

  // No files on disk. If localStorage still holds notes this is an upgrade from
  // a build that had no disk mirror — push them out to files, do not reseed.
  const cached = localStorage.getItem(NOTES_KEY);
  let cachedNotes = [];
  if (cached) {
    try { cachedNotes = JSON.parse(cached) ?? []; } catch { cachedNotes = []; }
    if (!Array.isArray(cachedNotes)) cachedNotes = [];
    if (cachedNotes.length) await mirrorNotes(cachedNotes);
  }
  const cachedCount = cachedNotes.length;

  setSaveHook(mirror);
  return { bridge: true, ok: true, empty: cachedCount === 0, error: null };
}

/**
 * A file of the vault that is not a note (0.9.3: `folders.json`). Read and
 * written only while the vault itself was read successfully — the same rule
 * the notes follow — so an unreadable vault is never written to.
 * @returns {Promise<string|null>} the text, or null when it is not there or cannot be read
 */
export async function readVaultFile(rel) {
  if (!api) return null;
  try {
    const res = await api.read(rel);
    return res?.ok ? res.data : null;
  } catch { return null; }
}

/** @returns {Promise<boolean>} whether it was written */
export async function writeVaultFile(rel, text) {
  if (!api) return false;
  try {
    const res = await api.write(rel, text);
    return !!res?.ok;
  } catch { return false; }
}

export function hasDiskStorage() {
  return !!api;
}
