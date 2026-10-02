/**
 * Folders and a dragged order in the note list (0.9.3) — the owner's Ideas
 * note: "notes into folders, a click on a folder shows its notes, folders can
 * be named, pinning inside a folder; and the order of the notes can be
 * dragged, the pinned ones among themselves as well".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoteStore, sortKey } from '../src/js/notes.js';
import { FolderStore, parseFolders, cleanFolderName, listGroups } from '../src/js/folders.js';
import { parseGroup, groupKey, orderFor, ownRun } from '../src/js/note-list.js';
import { dropGapBreaks } from '../src/js/migrate.js';

function storeWith(notes) {
  localStorage.setItem('nebula:notes', JSON.stringify(notes));
  return new NoteStore({ allowSeed: false });
}
const ids = (list) => list.map((n) => n.id);

describe('a dragged order', () => {
  beforeEach(() => localStorage.clear());

  it('a note nobody dragged stands by its last change, as before', () => {
    expect(sortKey({ updatedAt: 5 })).toBe(5);
    expect(sortKey({ updatedAt: 5, order: 2.5 })).toBe(2.5);
    expect(sortKey({ updatedAt: 5, order: NaN })).toBe(5);
    const store = storeWith([{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 3 }, { id: 'c', updatedAt: 2, pinned: true }]);
    expect(ids(store.sorted())).toEqual(['c', 'b', 'a']);
  });

  it('a place worked out from the neighbours: between, at the top, at the bottom', () => {
    expect(orderFor([300, 0, 200], 1)).toEqual({ order: 250 });
    expect(orderFor([0, 300, 200], 0)).toEqual({ order: 301 });
    expect(orderFor([300, 200, 0], 2)).toEqual({ order: 199 });
    expect(orderFor([42], 0)).toEqual({ order: 42 });
    // No room between two equal neighbours: the run is numbered afresh.
    expect(orderFor([7, 0, 7], 1)).toEqual({ renumber: [7, -993, -1993] });
  });

  it('a note put in a place keeps its date, and its pin', () => {
    const store = storeWith([{ id: 'a', updatedAt: 300 }, { id: 'b', updatedAt: 200 }, { id: 'c', updatedAt: 100, pinned: true }]);
    store.setPlace('b', { order: 350 });
    expect(ids(store.sorted())).toEqual(['c', 'b', 'a']);
    expect(store.get('b').updatedAt).toBe(200);
    store.setPlace('c', { order: 1 });
    expect(store.get('c').pinned).toBe(true);
  });

  it('a new note still comes in at the top', () => {
    const store = storeWith([{ id: 'a', updatedAt: 300 }, { id: 'b', updatedAt: 200 }]);
    store.setPlace('b', { order: 301 });
    const made = store.createNote('New');
    expect(store.sorted()[0].id).toBe(made.id);
  });

  it('dragging never pins or unpins: a note let go in the other run goes to its own (0.9.3)', () => {
    expect(ownRun('p', false)).toEqual({ seq: 'r', edge: 'start' });
    expect(ownRun('r', true)).toEqual({ seq: 'p', edge: 'end' });
    expect(ownRun('f:f1:p', false)).toEqual({ seq: 'f:f1:r', edge: 'start' });
    expect(ownRun('f:f1:r', false)).toBeNull();
    expect(ownRun('p', true)).toBeNull();
  });

  it('numbers several notes at once, one save', () => {
    const store = storeWith([{ id: 'a', updatedAt: 10 }, { id: 'b', updatedAt: 10 }]);
    const spy = vi.spyOn(store, 'save');
    store.setOrders([['a', 5], ['b', 4], ['gone', 3]]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ids(store.sorted())).toEqual(['a', 'b']);
  });

  it('into a folder and out of it, the rest of the note untouched', () => {
    const store = storeWith([{ id: 'a', updatedAt: 1, content: '<p>x</p>' }]);
    store.setPlace('a', { folder: 'f1' });
    expect(store.get('a').folder).toBe('f1');
    store.setFolder('a', null);
    expect('folder' in store.get('a')).toBe(false);
    store.setFolder('a', 'f2');
    expect(store.get('a').folder).toBe('f2');
    expect(store.get('a').content).toBe('<p>x</p>');
    expect(store.get('a').updatedAt).toBe(1);
  });

  it('a deleted folder gives every note in it back to the list, archived and trashed ones too', () => {
    const store = storeWith([{ id: 'a', folder: 'f', updatedAt: 1 }, { id: 'b', folder: 'f', archivedAt: 5, updatedAt: 1 }, { id: 'c', folder: 'g', updatedAt: 1 }]);
    expect(store.releaseFolder('f').sort()).toEqual(['a', 'b']);
    expect(store.get('a').folder).toBeUndefined();
    expect(store.get('c').folder).toBe('g');
  });
});

describe('folders', () => {
  beforeEach(() => localStorage.clear());

  it('a name is one trimmed line, never empty', () => {
    expect(cleanFolderName('  Work \n stuff  ')).toBe('Work stuff');
    expect(cleanFolderName('   ')).toBe('');
    expect(cleanFolderName('x'.repeat(200))).toHaveLength(80);
  });

  it('reads only well-formed folders, each once', () => {
    expect(parseFolders('not json')).toBeNull();
    expect(parseFolders(JSON.stringify({ folders: [{ id: 'a', name: 'A' }, { id: 'a', name: 'again' }, { id: 'b', name: ' ' }, { name: 'no id' }, null] })))
      .toEqual([{ id: 'a', name: 'A', createdAt: 0 }]);
  });

  it('makes, renames and removes a folder; a new one is shown open', () => {
    const folders = new FolderStore([]);
    const f = folders.create('  Work ');
    expect(f.name).toBe('Work');
    expect(folders.isOpen(f.id)).toBe(true);
    expect(folders.create('   ')).toBeNull();
    folders.rename(f.id, 'Projects');
    expect(folders.get(f.id).name).toBe('Projects');
    folders.rename(f.id, '');
    expect(folders.get(f.id).name).toBe('Projects');
    expect(JSON.parse(localStorage.getItem('nebula:folders'))[0].name).toBe('Projects');
    expect(folders.remove(f.id)).toBe(true);
    expect(folders.all()).toEqual([]);
  });

  it('remembers which folders are open on this computer', () => {
    const folders = new FolderStore([{ id: 'a', name: 'A', createdAt: 1 }]);
    expect(folders.toggle('a')).toBe(true);
    expect(new FolderStore([{ id: 'a', name: 'A', createdAt: 1 }]).isOpen('a')).toBe(true);
    folders.toggle('a');
    expect(new FolderStore([]).isOpen('a')).toBe(false);
  });

  it('draws pinned notes, then each folder with its notes, then the rest; a lost folder\'s notes are in the list', () => {
    const folders = new FolderStore([{ id: 'f', name: 'F', createdAt: 1 }]);
    const notes = [
      { id: 'p', pinned: true }, { id: 'fp', folder: 'f', pinned: true },
      { id: 'x' }, { id: 'fx', folder: 'f' }, { id: 'lost', folder: 'gone' },
    ];
    const g = listGroups(notes, folders);
    expect(ids(g.pinned)).toEqual(['p']);
    expect(ids(g.folders[0].notes)).toEqual(['fp', 'fx']);
    expect(ids(g.rest)).toEqual(['x', 'lost']);
  });

  it('a folder stands among the notes by when it was made, or where it was dragged — not always on top (0.9.3)', () => {
    const folders = new FolderStore([{ id: 'f', name: 'F', createdAt: 150 }]);
    const notes = [{ id: 'new', updatedAt: 200 }, { id: 'old', updatedAt: 100 }];
    const key = (n) => n.updatedAt;
    const names = (g) => g.root.map((x) => (x.kind === 'folder' ? `[${x.folder.id}]` : x.note.id));
    expect(names(listGroups(notes, folders, key))).toEqual(['new', '[f]', 'old']);
    folders.setOrder('f', 50);
    expect(names(listGroups(notes, folders, key))).toEqual(['new', 'old', '[f]']);
    expect(JSON.parse(localStorage.getItem('nebula:folders'))[0].order).toBe(50);
    expect(parseFolders(JSON.stringify([{ id: 'f', name: 'F', createdAt: 1, order: 9 }]))[0].order).toBe(9);
  });

  it('names the groups a note can be dropped in', () => {
    expect(groupKey(null, true)).toBe('p');
    expect(groupKey(null, false)).toBe('r');
    expect(groupKey('f-1-a', true)).toBe('f:f-1-a:p');
    expect(parseGroup('f:f-1-a:r')).toEqual({ folder: 'f-1-a', pinned: false });
    expect(parseGroup('p')).toEqual({ folder: null, pinned: true });
    expect(parseGroup('nonsense')).toBeNull();
  });
});

describe('nothing between a divider and the picture under it (0.9.3)', () => {
  const root = (html) => { const el = document.createElement('div'); el.innerHTML = html; return el; };
  const FIG = '<figure class="note-image"><img src="data:,"></figure>';

  it('a loose <br> there goes; a real line, or a <br> beside text, stays', () => {
    const el = root(`<h1>Ideas</h1><hr class="blk-hr"><br>${FIG}<br>${FIG}<p>x</p><br><p>y</p>`);
    expect(dropGapBreaks(el)).toBe(2);
    expect(el.innerHTML).toBe(`<h1>Ideas</h1><hr class="blk-hr">${FIG}${FIG}<p>x</p><br><p>y</p>`);
    expect(dropGapBreaks(el)).toBe(0);
    const kept = root(`<hr class="blk-hr"><p><br></p>${FIG}`);
    expect(dropGapBreaks(kept)).toBe(0);
  });
});
