import { setSaveHook } from './storage.js';

const NOTES_KEY = 'nebula:notes';

let api = null;
/**
 * Where each note is kept (0.9.4): the vault's notes folder, or — a note marked
 * `hole` — sealed in that black hole (electron/black-holes.js). A note that
 * changes place is written to the new one first and then deleted from the
 * old: moved into a black hole, its plain file leaves the vault and every
 * backup, as a deleted note's does.
 */
const VAULT = 'vault';
const placeOf = (note) => (note?.hole ? `hole:${note.hole}` : VAULT);
const placed = new Map();
let holesApi = null;
async function put(bridge, id, json, where) {
  if (where === VAULT) return bridge.write(`notes/${id}.json`, json);
  if (!holesApi) return { ok: false, error: 'No black holes here' };
  return holesApi.write(where.slice(5), id, json);
}
async function take(bridge, id, where) {
  if (where === VAULT) return bridge.remove(`notes/${id}.json`);
  if (!holesApi) return { ok: false, error: 'No black holes here' };
  return holesApi.remove(where.slice(5), id);
}
const lastWritten = new Map();
const desired = new Map();
// Earlier flush retries could write a hole-marked note into the plain vault.
// Withhold it until its hole is authenticated, then retry the encrypted move.
const pendingSeals = new Map();
const failures = new Map();
let readError = null;
let generation = 0;

/**
 * One note as its file's text. A long note's pretty-printed file is twice
 * the bytes through the bridge, the seal and the write (perf, 2026-10-23);
 * the padding stays for the notes a person reads and leaves once a note is
 * large. Every place the text is made or compared uses this, so a note never
 * flips between the two shapes on its own.
 */
const PRETTY_CHARS = 100_000;
export const noteJson = (note) =>
  String(note?.content ?? '').length > PRETTY_CHARS ? JSON.stringify(note) : JSON.stringify(note, null, 2);

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

function enqueue(id, json, where = VAULT) {
  const prev = queues.get(id);
  if (prev?.json === json) return prev.promise;
  // Nothing to do — unless it is a deletion of a note that is on the disk somewhere.
  if (!prev && !failures.has(id) && (lastWritten.get(id) ?? null) === json && !(json === null && placed.has(id))) return Promise.resolve();
  // The same note already waiting for the same place: the older state would
  // reach the disk only to be overwritten at once by the newer one — a slow
  // write of a large sealed note left a backlog of one save per debounce
  // behind it (perf, 2026-10-23). The pending write takes the newer state;
  // a move to another place still queues, written where it belongs first.
  if (prev && !prev.started && prev.where === where) { prev.json = json; return prev.promise; }

  const targetApi = api;
  const currentGeneration = generation;
  const entry = { json, where, started: false, promise: null };
  entry.promise = (prev?.promise ?? Promise.resolve()).then(async () => {
    entry.started = true;
    const rel = `notes/${id}.json`;
    const was = placed.get(id) ?? null;
    const to = entry.json === null ? null : entry.where;
    // Written where it belongs first; only then deleted from where it was.
    let result = to ? await put(targetApi, id, entry.json, to) : { ok: true };
    if (result?.ok && was && was !== to) result = await take(targetApi, id, was);
    if (!result?.ok) throw new Error(result?.error ?? `Could not ${entry.json === null ? 'remove' : 'save'} ${rel}`);
    if (generation !== currentGeneration) return;
    if (to) placed.set(id, to); else placed.delete(id);
    // Acknowledging before this result used to suppress every later retry.
    if (entry.json === null) lastWritten.delete(id);
    else lastWritten.set(id, entry.json);
    failures.delete(id);
    if (entry.json === null && desired.get(id) === null) desired.delete(id);
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
    const json = noteJson(note);
    desired.set(note.id, json);
    jobs.push(enqueue(note.id, json, placeOf(note)));
  }
  // notes that no longer exist lose their file (was deleting the wrong path)
  for (const id of new Set([...lastWritten.keys(), ...desired.keys(), ...placed.keys()])) {
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
    if (!queues.has(id) && desired.has(id)) {
      const json = desired.get(id);
      // Retry the requested destination, including a move that never reached
      // placed. Defaulting to the vault writes encrypted notes in plaintext.
      enqueue(id, json, json === null ? VAULT : placeOf(JSON.parse(json)));
    }
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
  holesApi = window.nebula?.holes ?? null;
  placed.clear();
  lastWritten.clear();
  desired.clear();
  pendingSeals.clear();
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
          if (typeof note.hole === 'string' && /^[\w-]{1,120}$/.test(note.hole)) {
            pendingSeals.set(note.id, note);
            continue;
          }
          const marked = 'hole' in note;
          delete note.hole;
          notes.push(note);
          placed.set(note.id, VAULT);
          if (!marked) lastWritten.set(note.id, noteJson(note));
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
    return { bridge: true, ok: true, empty: notes.length === 0 && pendingSeals.size === 0, error: null };
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

/**
 * A black hole was opened (0.9.4): its notes, as the main process handed them
 * over, are known to be on the disk already — sealed, in that black hole.
 * @param {string} holeId @param {string[]} jsons each note as it was written
 * @returns {object[]} the notes, each marked with its black hole
 */
export function adoptHoleNotes(holeId, jsons) {
  const notes = [];
  for (const json of Array.isArray(jsons) ? jsons : []) {
    let note;
    try { note = JSON.parse(json); } catch { continue; }
    if (!note?.id) continue;
    note.hole = holeId;
    notes.push(note);
    // A note that is also a plain file (a move that was cut short) keeps its
    // place on record, so the next save takes the plain file away.
    if (placed.get(note.id) === VAULT) continue;
    const now = noteJson(note);
    placed.set(note.id, `hole:${holeId}`);
    lastWritten.set(note.id, now);
    desired.set(note.id, now);
  }
  for (const [id, residue] of pendingSeals) {
    if (residue.hole !== holeId) continue;
    const index = notes.findIndex((note) => note.id === id);
    // The failed retry contains the latest unsaved edit. A newer sealed note
    // wins, but either way the leftover plain copy must leave the vault.
    const recovered = index >= 0 && Number(notes[index].updatedAt || 0) > Number(residue.updatedAt || 0) ? notes[index] : residue;
    if (index >= 0) notes[index] = recovered; else notes.push(recovered);
    placed.set(id, VAULT);
    lastWritten.delete(id);
    const json = noteJson(recovered);
    desired.set(id, json);
    void enqueue(id, json, `hole:${holeId}`);
    pendingSeals.delete(id);
  }
  return notes;
}

/** Await one note's current move/write, so the UI does not announce a move
 * while its old plaintext file is still waiting to be removed. */
export async function flushNote(id) {
  if (!api) return;
  const entry = queues.get(id);
  if (entry) await entry.promise;
  if (failures.has(id)) throw new Error(failures.get(id));
}

/**
 * A black hole was locked: its notes leave the note store, and the mirror
 * forgets them — or it would take their absence for a deletion. Called after
 * everything pending has been written (flushDisk).
 */
export function forgetNotes(ids) {
  for (const id of ids ?? []) {
    lastWritten.delete(id);
    desired.delete(id);
    failures.delete(id);
    placed.delete(id);
  }
  publishStatus();
}

export function hasDiskStorage() {
  return !!api;
}
