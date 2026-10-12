/**
 * Black holes in the window (0.9.4): where the note store keeps a note that is
 * in one, and how the disk mirror writes it — sealed into the black hole, never
 * into the notes folder — and forgets it when the black hole is locked. The
 * sealing itself is in tests/black-holes.test.js; the app in
 * tests/e2e/black-holes.mjs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NoteStore } from '../src/js/notes.js';
import { initDiskStorage, flushDisk, adoptHoleNotes, forgetNotes } from '../src/js/disk-store.js';
import { waitWords, refusalWords } from '../src/js/black-holes.js';

/** The two bridges the mirror writes through, as the preload gives them: every call on record. */
function bridges(files = {}) {
  const calls = [];
  const sealed = new Map();
  window.nebula = {
    storage: {
      list: async () => ({ ok: true, files: Object.keys(files) }),
      read: async (rel) => ({ ok: true, data: files[rel.replace('notes/', '')] }),
      write: async (rel, json) => { calls.push(`write ${rel}`); files[rel.replace('notes/', '')] = json; return { ok: true }; },
      remove: async (rel) => { calls.push(`remove ${rel}`); delete files[rel.replace('notes/', '')]; return { ok: true }; },
    },
    holes: {
      write: async (hole, id, json) => { calls.push(`seal ${hole}/${id}`); sealed.set(`${hole}/${id}`, json); return { ok: true }; },
      remove: async (hole, id) => { calls.push(`unseal ${hole}/${id}`); sealed.delete(`${hole}/${id}`); return { ok: true }; },
    },
  };
  return { calls, sealed, files };
}
const noteJson = (id, extra = {}) => JSON.stringify({ id, title: id, content: `<p>${id}</p>`, createdAt: 1, updatedAt: 1, ...extra }, null, 2);

describe('a note in a black hole, in the store', () => {
  let store;
  beforeEach(async () => {
    localStorage.clear();
    bridges({ 'a.json': noteJson('a'), 'b.json': noteJson('b', { folder: 'f1' }) });
    await initDiskStorage();
    store = new NoteStore({ allowSeed: false });
  });

  it('is not among the notes of the list, the search or the next note to open', () => {
    store.addHoleNotes('h1', [JSON.parse(noteJson('s1', { hole: 'h1' })), JSON.parse(noteJson('s2', { pinned: true }))]);
    expect(store.live().map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(store.sorted().some((n) => n.hole)).toBe(false);
    expect(store.filter('s1')).toEqual([]);
    expect(store.inHole('h1').map((n) => n.id)).toEqual(['s2', 's1']);       // its pinned note first
    expect(store.inHole('other')).toEqual([]);
  });

  it('is made in one, moved into one and out again — in no folder while it is there', () => {
    const made = store.createNote('Secret', { hole: 'h1' });
    expect(made.hole).toBe('h1');
    store.setHole('b', 'h1');
    expect(store.get('b')).toMatchObject({ hole: 'h1' });
    expect('folder' in store.get('b')).toBe(false);
    const date = store.get('b').updatedAt;
    store.setHole('b', null);
    expect('hole' in store.get('b')).toBe(false);
    expect(store.get('b').updatedAt).toBe(date);                              // moving is not editing
  });

  it('leaves the store when its black hole is locked, and the open note is another', () => {
    store.addHoleNotes('h1', [JSON.parse(noteJson('s1'))]);
    store.setActive('s1');
    expect(store.dropHole('h1')).toEqual(['s1']);
    expect(store.get('s1')).toBeNull();
    expect(store.activeId).not.toBe('s1');
    expect(store.notes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(store.dropHole('h1')).toEqual([]);
  });
});

describe('the disk mirror', () => {
  let io;
  let store;
  beforeEach(async () => {
    localStorage.clear();
    io = bridges({ 'a.json': noteJson('a'), 'b.json': noteJson('b') });
    await initDiskStorage();
    store = new NoteStore({ allowSeed: false });
    io.calls.length = 0;
  });

  it('seals a note made in a black hole there, and never writes it to the notes folder', async () => {
    const note = store.createNote('Secret', { hole: 'h1' });
    store.updateNote(note.id, { content: '<p>words</p>' });
    await flushDisk();
    expect(io.calls.every((c) => c === `seal h1/${note.id}`)).toBe(true);
    expect(io.calls.length).toBeGreaterThan(0);
    expect(JSON.parse(io.sealed.get(`h1/${note.id}`)).content).toBe('<p>words</p>');
    expect(Object.keys(io.files).sort()).toEqual(['a.json', 'b.json']);
    expect(localStorage.getItem('nebula:notes')).toBeNull();
  });

  it('moves a note in: sealed first, and only then its plain file deleted', async () => {
    store.setHole('a', 'h1');
    await flushDisk();
    expect(io.calls).toEqual(['seal h1/a', 'remove notes/a.json']);
    expect(io.files['a.json']).toBeUndefined();
  });

  it('leaves the plain file where it is when the sealing fails', async () => {
    window.nebula.holes.write = async () => ({ ok: false, error: 'locked' });
    store.setHole('a', 'h1');
    await expect(flushDisk()).rejects.toThrow();
    expect(io.files['a.json']).toBeDefined();
    expect(io.calls.some((c) => c.startsWith('remove'))).toBe(false);
  });

  it('moves a note out: a plain file first, and only then its sealed one deleted', async () => {
    store.setHole('a', 'h1');
    await flushDisk();
    io.calls.length = 0;
    store.setHole('a', null);
    await flushDisk();
    expect(io.calls).toEqual(['write notes/a.json', 'unseal h1/a']);
    expect('hole' in JSON.parse(io.files['a.json'])).toBe(false);
  });

  it('does not write the notes of an opened black hole again, and deletes nothing when it is locked', async () => {
    const jsons = [noteJson('s1', { hole: 'h1' }), noteJson('s2', { hole: 'h1' })];
    store.addHoleNotes('h1', adoptHoleNotes('h1', jsons));
    store.updateNote('a', { title: 'changed' });
    await flushDisk();
    expect(io.calls).toEqual(['write notes/a.json']);
    // Locked: its notes leave the store — which is not a deletion.
    forgetNotes(store.dropHole('h1'));
    store.updateNote('a', { title: 'changed again' });
    store.destroy('b');
    await flushDisk();
    expect(io.calls).toEqual(['write notes/a.json', 'write notes/a.json', 'remove notes/b.json']);
  });

  it('deletes a note of a black hole from the black hole', async () => {
    store.addHoleNotes('h1', adoptHoleNotes('h1', [noteJson('s1', { hole: 'h1' })]));
    store.destroy('s1');
    await flushDisk();
    expect(io.calls).toEqual(['unseal h1/s1']);
  });

  it('a move into a black hole that was cut short is finished when it is opened: the plain file goes', async () => {
    // Sealed, but the plain file was never deleted (the app was closed in between).
    store.addHoleNotes('h1', adoptHoleNotes('h1', [noteJson('a', { hole: 'h1', title: 'sealed' })]));
    await flushDisk();
    expect(store.get('a')).toMatchObject({ hole: 'h1', title: 'sealed' });
    expect(io.calls).toEqual(['seal h1/a', 'remove notes/a.json']);
  });

  it('a file in the notes folder is a plain note, whatever it says of itself', async () => {
    localStorage.clear();
    io = bridges({ 'x.json': noteJson('x', { hole: 'h9' }) });
    await initDiskStorage();
    store = new NoteStore({ allowSeed: false });
    expect('hole' in store.get('x')).toBe(false);
    expect(store.live().map((n) => n.id)).toEqual(['x']);
  });
});

describe('what a refusal says', () => {
  it('how long to wait, in a few letters', () => {
    expect(waitWords(30_000)).toBe('30 s');
    expect(waitWords(400)).toBe('1 s');
    expect(waitWords(120_000)).toBe('2 min');
    expect(waitWords(15 * 60_000)).toBe('15 min');
  });

  it('a wrong PIN, a wait, another computer', () => {
    expect(refusalWords({ error: 'wrong', triesLeft: 3, waitMs: 0 })).toBe('Wrong. 3 more tries before a wait.');
    expect(refusalWords({ error: 'wrong', triesLeft: 1, waitMs: 0 })).toBe('Wrong. One more try before a wait.');
    expect(refusalWords({ error: 'wrong', triesLeft: 0, waitMs: 30_000 })).toBe('Wrong. Wait 30 s before the next try.');
    expect(refusalWords({ error: 'wait', waitMs: 61_000 })).toBe('Too many wrong tries. Wait 61 s.');
    expect(refusalWords({ error: 'other-computer' })).toMatch(/recovery key/);
    expect(refusalWords(null, 'hello')).toBe('Not confirmed.');
  });
});
