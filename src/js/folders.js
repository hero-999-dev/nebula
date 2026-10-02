/**
 * Folders in the note list (0.9.3).
 *
 * The owner: "drag notes into folders, a click on a folder shows the notes in
 * it, folders can be named, and notes can be pinned inside a folder". A note
 * says which folder it is in (`note.folder`, a folder id); the folders
 * themselves — their names and their order — are one small file in the vault,
 * `folders.json`, beside the notes, so they travel and are backed up with
 * them. localStorage keeps a copy for the browser preview, which has no vault.
 *
 * Which folders are open is how the list looks on this computer, not part of
 * the vault: it stays in localStorage.
 *
 * Deleting a folder never deletes a note: its notes go back to the list.
 */

import { readVaultFile, writeVaultFile } from './disk-store.js';
import { generateId } from './storage.js';

const FILE = 'folders.json';
const LOCAL = 'nebula:folders';
const OPEN = 'nebula:folders-open';
const NAME_MAX = 80;

/** A folder name as it is kept: one line, trimmed, not empty, not endless. */
export function cleanFolderName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** Only well-formed entries, each id once. */
export function parseFolders(text) {
  let list;
  try { list = JSON.parse(text); } catch { return null; }
  if (Array.isArray(list?.folders)) list = list.folders;
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const id = typeof f?.id === 'string' ? f.id : '';
    const name = cleanFolderName(f?.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const entry = { id, name, createdAt: Number(f.createdAt) || 0 };
    if (Number.isFinite(f.order)) entry.order = f.order;
    out.push(entry);
  }
  return out;
}

function readLocal(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* the vault copy is the one that counts */ }
}

export class FolderStore {
  /** @param {{id: string, name: string, createdAt: number}[]} [folders] */
  constructor(folders = []) {
    this.folders = folders;
    const open = readLocal(OPEN, []);
    this.open = new Set(Array.isArray(open) ? open.filter((id) => typeof id === 'string') : []);
    /** Resolves when the last write has landed (tests, and quitting). */
    this.written = Promise.resolve(true);
  }

  /**
   * The vault's folders, or this profile's copy when there is no vault file
   * yet (the browser preview, or a vault from before 0.9.3: no folders).
   */
  static async load() {
    const text = await readVaultFile(FILE);
    const fromVault = text === null ? null : parseFolders(text);
    const local = parseFolders(JSON.stringify(readLocal(LOCAL, [])));
    return new FolderStore(fromVault ?? local ?? []);
  }

  all() { return this.folders; }

  get(id) { return this.folders.find((f) => f.id === id) ?? null; }

  has(id) { return !!id && this.folders.some((f) => f.id === id); }

  create(name) {
    const clean = cleanFolderName(name);
    if (!clean) return null;
    const folder = { id: generateId('f'), name: clean, createdAt: Date.now() };
    this.folders.push(folder);
    this.open.add(folder.id);          // a new folder is shown open, empty, ready for a note
    this.#saveOpen();
    this.save();
    return folder;
  }

  rename(id, name) {
    const folder = this.get(id);
    const clean = cleanFolderName(name);
    if (!folder || !clean || clean === folder.name) return folder;
    folder.name = clean;
    this.save();
    return folder;
  }

  /** The folder goes; the caller takes its notes back to the list. */
  remove(id) {
    const i = this.folders.findIndex((f) => f.id === id);
    if (i < 0) return false;
    this.folders.splice(i, 1);
    this.open.delete(id);
    this.#saveOpen();
    this.save();
    return true;
  }

  /** Where a folder stands among the notes: where it was put, or when it was made. */
  key(folder) {
    const f = typeof folder === 'string' ? this.get(folder) : folder;
    return f ? (Number.isFinite(f.order) ? f.order : f.createdAt) : 0;
  }

  setOrder(id, order) {
    const folder = this.get(id);
    if (!folder || !Number.isFinite(order) || folder.order === order) return folder;
    folder.order = order;
    this.save();
    return folder;
  }

  isOpen(id) { return this.open.has(id); }

  setOpen(id, on) {
    if (on) this.open.add(id); else this.open.delete(id);
    this.#saveOpen();
  }

  toggle(id) { this.setOpen(id, !this.isOpen(id)); return this.isOpen(id); }

  #saveOpen() { writeLocal(OPEN, [...this.open]); }

  save() {
    const list = this.folders.map(({ id, name, createdAt, order }) => (Number.isFinite(order) ? { id, name, createdAt, order } : { id, name, createdAt }));
    writeLocal(LOCAL, list);
    this.written = writeVaultFile(FILE, JSON.stringify({ folders: list }, null, 2));
    return this.written;
  }
}

/**
 * The list as it is drawn when nothing filters it (0.9.3): pinned notes at
 * the top, then the folders and the other notes together, each where it
 * stands — a folder is not fixed above the notes (the owner: "the folder is
 * always at the top once it is made"); it stands by when it was made until
 * it is dragged, and a note changed since then rises above it, as notes do.
 * A folder's own notes are in it, its pinned ones first. A note whose folder
 * no longer exists is simply in the list.
 *
 * @param {object[]} notes live notes, already in order (NoteStore.sorted)
 * @param {FolderStore} folders
 * @param {(note: object) => number} keyOf a note's place (notes.js sortKey)
 * @returns {{pinned: object[], root: ({kind: 'note', note: object}|{kind: 'folder', folder: object, notes: object[]})[],
 *   folders: {folder: object, notes: object[]}[], rest: object[]}}
 */
export function listGroups(notes, folders, keyOf = (n) => n.updatedAt ?? 0) {
  const out = { pinned: [], folders: folders.all().map((folder) => ({ kind: 'folder', folder, notes: [] })), rest: [], root: [] };
  const byId = new Map(out.folders.map((g) => [g.folder.id, g]));
  for (const note of notes) {
    const group = note.folder ? byId.get(note.folder) : null;
    if (group) group.notes.push(note);
    else if (note.pinned) out.pinned.push(note);
    else out.rest.push(note);
  }
  const keyed = [
    ...out.rest.map((note, i) => ({ item: { kind: 'note', note }, key: keyOf(note), i })),
    ...out.folders.map((g, i) => ({ item: g, key: folders.key(g.folder), i: out.rest.length + i })),
  ];
  keyed.sort((a, b) => (b.key - a.key) || (a.i - b.i));
  out.root = keyed.map((k) => k.item);
  return out;
}
