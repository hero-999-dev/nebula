/**
 * Projects (1.0.0) — the owner: "when folders are put inside each other, a
 * project forms on the left. Projects work like folders and are stored the
 * same way, only higher in the hierarchy; they have add note and add folder,
 * and a note can sit beside the folders. No projects in black holes for now."
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NoteStore } from '../src/js/notes.js';
import { FolderStore } from '../src/js/folders.js';
import { ProjectStore, parseProjects, listTree } from '../src/js/projects.js';
import { parseGroup, groupKey, ownRun } from '../src/js/note-list.js';
import { initDiskStorage } from '../src/js/disk-store.js';

function storeWith(notes) {
  localStorage.setItem('nebula:notes', JSON.stringify(notes));
  return new NoteStore({ allowSeed: false });
}
const ids = (list) => list.map((n) => n.id);

describe('projects', () => {
  beforeEach(() => localStorage.clear());

  it('reads only well-formed projects; a folder is in one project at most', () => {
    expect(parseProjects('nope')).toBeNull();
    const list = parseProjects(JSON.stringify({ projects: [
      { id: 'j1', name: 'One', folders: ['a', 'b', 7] },
      { id: 'j1', name: 'again' },
      { id: 'j2', name: 'Two', folders: ['b', 'c'], order: 4 },
      { id: 'j3', name: '  ' },
    ] }));
    expect(list).toEqual([
      { id: 'j1', name: 'One', createdAt: 0, folders: ['a', 'b'] },
      { id: 'j2', name: 'Two', createdAt: 0, folders: ['c'], order: 4 },
    ]);
  });

  it('keeps folder membership in its own file, so an older app saving folders.json cannot empty a project', () => {
    const projects = new ProjectStore([]);
    const p = projects.create(' Launch ', ['f1', 'f2']);
    expect(p.name).toBe('Launch');
    expect(projects.isOpen(p.id)).toBe(true);
    expect(JSON.parse(localStorage.getItem('nebula:projects'))[0].folders).toEqual(['f1', 'f2']);
    // folders.json as an older Nebula writes it knows nothing of projects — and needs not
    const folders = new FolderStore([{ id: 'f1', name: 'A', createdAt: 1 }, { id: 'f2', name: 'B', createdAt: 2 }]);
    folders.save();
    expect(JSON.parse(localStorage.getItem('nebula:folders')).every((f) => !('project' in f))).toBe(true);
    expect(projects.of('f2').id).toBe(p.id);
  });

  it('moves a folder between projects and out; a deleted folder leaves its project', () => {
    const projects = new ProjectStore([]);
    const a = projects.create('A', ['f1']);
    const b = projects.create('B');
    expect(projects.setFolder('f1', b.id)).toBe(true);
    expect(a.folders).toEqual([]);
    expect(b.folders).toEqual(['f1']);
    expect(projects.setFolder('f1', 'missing')).toBe(false);
    projects.setFolder('f1', null);
    expect(projects.of('f1')).toBeNull();
    projects.setFolder('f1', a.id);
    projects.forgetFolder('f1');
    expect(projects.of('f1')).toBeNull();
  });

  it('a note goes straight into a project, out of its folder; into a folder, out of its project', () => {
    const store = storeWith([{ id: 'n', updatedAt: 1, folder: 'f1' }]);
    store.setProject('n', 'j1');
    expect(store.get('n')).toMatchObject({ project: 'j1' });
    expect(store.get('n').folder).toBeUndefined();
    store.setFolder('n', 'f2');
    expect(store.get('n').project).toBeUndefined();
    store.setPlace('n', { project: 'j1', order: 5 });
    expect(store.get('n')).toMatchObject({ project: 'j1', order: 5 });
    store.setFolder('n', null);
    expect(store.get('n').project).toBeUndefined();
  });

  it('a deleted project lets its notes go back to the list', () => {
    const store = storeWith([{ id: 'a', updatedAt: 1, project: 'j1' }, { id: 'b', updatedAt: 1, project: 'j2' }]);
    expect(store.releaseProject('j1')).toEqual(['a']);
    expect(store.get('a').project).toBeUndefined();
    expect(store.get('b').project).toBe('j2');
  });

  it('draws projects with their folders and loose notes; a lost project\'s notes and folders are in the list', () => {
    const folders = new FolderStore([{ id: 'f1', name: 'F1', createdAt: 10 }, { id: 'f2', name: 'F2', createdAt: 20 }, { id: 'f3', name: 'F3', createdAt: 30 }]);
    const projects = new ProjectStore([{ id: 'j', name: 'J', createdAt: 25, folders: ['f1', 'f2', 'gone'] }]);
    const notes = [
      { id: 'top', pinned: true, updatedAt: 1 },
      { id: 'loose', project: 'j', updatedAt: 15 },
      { id: 'jpin', project: 'j', pinned: true, updatedAt: 1 },
      { id: 'in1', folder: 'f1', updatedAt: 1 },
      { id: 'lost', project: 'nope', updatedAt: 40 },
      { id: 'free', updatedAt: 5 },
    ];
    const tree = listTree(notes, folders, projects, (n) => n.updatedAt);
    expect(ids(tree.pinned)).toEqual(['top']);
    const names = tree.root.map((x) => (x.kind === 'note' ? x.note.id : `[${(x.folder ?? x.project).id}]`));
    expect(names).toEqual(['lost', '[f3]', '[j]', 'free']);
    const j = tree.root.find((x) => x.kind === 'project');
    expect(ids(j.pinned)).toEqual(['jpin']);
    expect(j.items.map((x) => (x.kind === 'note' ? x.note.id : `[${x.folder.id}]`))).toEqual(['[f2]', 'loose', '[f1]']);
    expect(ids(j.items.find((x) => x.folder?.id === 'f1').notes)).toEqual(['in1']);
  });

  it('names the runs inside a project, and keeps a dragged note in its own pin', () => {
    expect(groupKey(null, false, 'j1')).toBe('j:j1:r');
    expect(groupKey(null, true, 'j1')).toBe('j:j1:p');
    expect(groupKey('f1', false, 'j1')).toBe('f:f1:r');
    expect(parseGroup('j:j1:r')).toEqual({ folder: null, project: 'j1', pinned: false });
    expect(parseGroup('f:f1:p')).toEqual({ folder: 'f1', pinned: true });
    expect(ownRun('j:j1:p', false)).toEqual({ seq: 'j:j1:r', edge: 'start' });
  });
});

describe('projects and black holes', () => {
  beforeEach(async () => {
    localStorage.clear();
    const files = { 'n.json': JSON.stringify({ id: 'n', title: 'n', content: '', createdAt: 1, updatedAt: 1, project: 'j1' }) };
    window.nebula = {
      storage: {
        list: async () => ({ ok: true, files: Object.keys(files) }),
        read: async (rel) => ({ ok: true, data: files[rel.replace('notes/', '')] }),
        write: async () => ({ ok: true }),
        remove: async () => ({ ok: true }),
      },
      holes: { write: async () => ({ ok: true }), remove: async () => ({ ok: true }) },
    };
    await initDiskStorage();
  });

  it('no project reaches into a black hole', () => {
    const store = new NoteStore({ allowSeed: false });
    expect(store.get('n').project).toBe('j1');
    store.setHole('n', 'h1');
    expect(store.get('n').project).toBeUndefined();
    expect(store.setProject('n', 'j1').project).toBeUndefined();
    store.setPlace('n', { project: 'j1' });
    expect(store.get('n').project).toBeUndefined();
    store.addHoleNotes('h2', [{ id: 'm', updatedAt: 1, project: 'j1', folder: 'f' }]);
    expect(store.get('m').project).toBeUndefined();
    expect(store.get('m').folder).toBeUndefined();
  });
});
