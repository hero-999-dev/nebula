/**
 * Projects in the note list (1.0.0).
 *
 * The owner: "when folders are put inside each other, a project forms on the
 * left. Projects work like folders and are stored the same way, only higher
 * in the hierarchy. Projects have add note and add folder — I put two folders
 * in, and I can also put a note beside them; it holds them all." No projects
 * inside black holes, for now.
 *
 * A project is one entry of `projects.json`, beside `folders.json` in the
 * vault: its name, its place, and the folders in it. The folders it holds are
 * kept HERE, not as a field on the folder — an older Nebula reads
 * folders.json, keeps only the fields it knows, and writes it back, which
 * would quietly empty every project. A note put straight into a project (not
 * into one of its folders) says so itself (`note.project`): notes keep every
 * field they carry, in every version.
 *
 * A project is never a black hole's: a note that goes into one leaves its
 * project (notes.js setHole), and a project's folders are main space only.
 */

import { readVaultFile, writeVaultFile } from './disk-store.js';
import { generateId } from './storage.js';
import { cleanFolderName } from './folders.js';

const FILE = 'projects.json';
const LOCAL = 'nebula:projects';
const OPEN = 'nebula:projects-open';

/** Only well-formed entries, each id once, each folder in one project at most. */
export function parseProjects(text) {
  let list;
  try { list = JSON.parse(text); } catch { return null; }
  if (Array.isArray(list?.projects)) list = list.projects;
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const taken = new Set();
  const out = [];
  for (const p of list) {
    const id = typeof p?.id === 'string' ? p.id : '';
    const name = cleanFolderName(p?.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const folders = (Array.isArray(p.folders) ? p.folders : [])
      .filter((f) => typeof f === 'string' && f && !taken.has(f));
    folders.forEach((f) => taken.add(f));
    const entry = { id, name, createdAt: Number(p.createdAt) || 0, folders };
    if (Number.isFinite(p.order)) entry.order = p.order;
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

export class ProjectStore {
  constructor(projects = []) {
    this.projects = projects;
    const open = readLocal(OPEN, []);
    this.open = new Set(Array.isArray(open) ? open.filter((id) => typeof id === 'string') : []);
    this.written = Promise.resolve(true);
  }

  static async load() {
    const text = await readVaultFile(FILE);
    const fromVault = text === null ? null : parseProjects(text);
    const local = parseProjects(JSON.stringify(readLocal(LOCAL, [])));
    return new ProjectStore(fromVault ?? local ?? []);
  }

  all() { return this.projects; }

  get(id) { return this.projects.find((p) => p.id === id) ?? null; }

  has(id) { return !!id && this.projects.some((p) => p.id === id); }

  /** The project a folder is in, or null. */
  of(folderId) { return (folderId && this.projects.find((p) => p.folders.includes(folderId))) || null; }

  /**
   * A new project, with the folders given moved into it (each leaves the
   * project it was in: a folder is in one project at most).
   */
  create(name, folderIds = []) {
    const clean = cleanFolderName(name);
    if (!clean) return null;
    const project = { id: generateId('j'), name: clean, createdAt: Date.now(), folders: [] };
    this.projects.push(project);
    for (const f of folderIds) this.#take(f, project);
    this.open.add(project.id);
    this.#saveOpen();
    this.save();
    return project;
  }

  rename(id, name) {
    const project = this.get(id);
    const clean = cleanFolderName(name);
    if (!project || !clean || clean === project.name) return project;
    project.name = clean;
    this.save();
    return project;
  }

  /** The project goes; its folders stay, back in the list. The caller frees its notes. */
  remove(id) {
    const i = this.projects.findIndex((p) => p.id === id);
    if (i < 0) return false;
    this.projects.splice(i, 1);
    this.open.delete(id);
    this.#saveOpen();
    this.save();
    return true;
  }

  /** A folder into a project, or out of every project with null. */
  setFolder(folderId, projectId) {
    const to = projectId ? this.get(projectId) : null;
    if (projectId && !to) return false;
    const from = this.of(folderId);
    if (from === to) return false;
    this.#take(folderId, to);
    this.save();
    return true;
  }

  /** A deleted folder leaves its project. */
  forgetFolder(folderId) {
    if (!this.of(folderId)) return false;
    this.#take(folderId, null);
    this.save();
    return true;
  }

  #take(folderId, to) {
    for (const p of this.projects) p.folders = p.folders.filter((f) => f !== folderId);
    if (to) to.folders.push(folderId);
  }

  key(project) {
    const p = typeof project === 'string' ? this.get(project) : project;
    return p ? (Number.isFinite(p.order) ? p.order : p.createdAt) : 0;
  }

  setOrder(id, order) {
    const project = this.get(id);
    if (!project || !Number.isFinite(order) || project.order === order) return project;
    project.order = order;
    this.save();
    return project;
  }

  isOpen(id) { return this.open.has(id); }

  setOpen(id, on) {
    if (on) this.open.add(id); else this.open.delete(id);
    this.#saveOpen();
  }

  toggle(id) { this.setOpen(id, !this.isOpen(id)); return this.isOpen(id); }

  #saveOpen() { writeLocal(OPEN, [...this.open]); }

  save() {
    const list = this.projects.map(({ id, name, createdAt, order, folders }) => (
      Number.isFinite(order) ? { id, name, createdAt, order, folders: [...folders] } : { id, name, createdAt, folders: [...folders] }));
    writeLocal(LOCAL, list);
    this.written = writeVaultFile(FILE, JSON.stringify({ projects: list }, null, 2));
    return this.written;
  }
}

/**
 * The list as it is drawn when nothing filters it, with projects (1.0.0): the
 * pinned notes, then projects, folders and notes together, each where it
 * stands. A project holds its folders and the notes put straight into it —
 * its pinned ones first, then the rest by place, as the list does.
 *
 * A note whose folder is gone, or whose project is gone, is simply in the
 * list; a folder whose project is gone is a folder in the list.
 *
 * @returns {{pinned: object[], root: object[]}} root items are
 *   {kind:'note', note} | {kind:'folder', folder, notes} |
 *   {kind:'project', project, pinned: object[], items: ({kind:'note',note}|{kind:'folder',folder,notes})[]}
 */
export function listTree(notes, folders, projects, keyOf = (n) => n.updatedAt ?? 0) {
  const folderGroups = new Map(folders.all().map((folder) => [folder.id, { kind: 'folder', folder, notes: [] }]));
  const projectGroups = new Map(projects.all().map((project) => [project.id, { kind: 'project', project, pinned: [], rest: [], items: [] }]));
  const out = { pinned: [], root: [] };
  const rest = [];
  for (const note of notes) {
    const folder = note.folder ? folderGroups.get(note.folder) : null;
    const project = !folder && note.project ? projectGroups.get(note.project) : null;
    if (folder) folder.notes.push(note);
    else if (project) (note.pinned ? project.pinned : project.rest).push(note);
    else if (note.pinned) out.pinned.push(note);
    else rest.push(note);
  }
  const free = [];
  for (const group of folderGroups.values()) {
    const project = projects.of(group.folder.id);
    const pg = project ? projectGroups.get(project.id) : null;
    if (pg) pg.items.push(group); else free.push(group);
  }
  const byKey = (items) => items
    .map((item, i) => ({ item, i, key: item.kind === 'note' ? keyOf(item.note) : item.kind === 'folder' ? folders.key(item.folder) : projects.key(item.project) }))
    .sort((a, b) => (b.key - a.key) || (a.i - b.i))
    .map((k) => k.item);
  for (const pg of projectGroups.values()) {
    pg.items = byKey([...pg.rest.map((note) => ({ kind: 'note', note })), ...pg.items]);
    delete pg.rest;
  }
  out.root = byKey([...rest.map((note) => ({ kind: 'note', note })), ...free, ...projectGroups.values()]);
  return out;
}
