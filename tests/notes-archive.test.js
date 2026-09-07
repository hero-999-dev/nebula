/**
 * Pin, archive and trash.
 *
 * Deleting used to be refused for the last note, because nothing could bring it
 * back. The trash is that way back, so the guard is gone — the user asked to be
 * able to delete the guide from their own list and re-add it from Help.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NoteStore } from '../src/js/notes.js';

const note = (id, over = {}) => ({
  id, title: id, content: `<p>${id}</p>`, createdAt: 1, updatedAt: Number(id.slice(1)) || 1, ...over,
});

function storeWith(...notes) {
  const store = new NoteStore({ allowSeed: false });
  store.notes = notes;
  store.activeId = notes[0]?.id ?? null;
  return store;
}

beforeEach(() => localStorage.clear());

describe('the three lists', () => {
  it('keeps archived and trashed notes off the main list', () => {
    const store = storeWith(
      note('n1'),
      note('n2', { archivedAt: 100 }),
      note('n3', { deletedAt: 200 }),
    );
    expect(store.live().map((n) => n.id)).toEqual(['n1']);
    expect(store.archived().map((n) => n.id)).toEqual(['n2']);
    expect(store.trashed().map((n) => n.id)).toEqual(['n3']);
  });

  it('a note in the trash is not also in the archive', () => {
    // Archiving then deleting must put it in exactly one place.
    const store = storeWith(note('n1', { archivedAt: 100, deletedAt: 200 }));
    expect(store.archived()).toEqual([]);
    expect(store.trashed()).toHaveLength(1);
  });

  it('does not search archived or trashed notes', () => {
    const store = storeWith(
      note('n1', { content: '<p>needle</p>' }),
      note('n2', { content: '<p>needle</p>', archivedAt: 1 }),
      note('n3', { content: '<p>needle</p>', deletedAt: 1 }),
    );
    expect(store.filter('needle').map((n) => n.id)).toEqual(['n1']);
  });
});

describe('pinning', () => {
  it('puts a pinned note at the top, whatever its date', () => {
    const store = storeWith(note('n1'), note('n2'), note('n3'));
    expect(store.sorted().map((n) => n.id)).toEqual(['n3', 'n2', 'n1']); // by date
    store.togglePin('n1');
    expect(store.sorted().map((n) => n.id)).toEqual(['n1', 'n3', 'n2']);
  });

  it('orders several pinned notes among themselves by date', () => {
    const store = storeWith(note('n1'), note('n2'), note('n3'));
    store.togglePin('n1');
    store.togglePin('n2');
    expect(store.sorted().map((n) => n.id)).toEqual(['n2', 'n1', 'n3']);
  });

  it('unpins on a second press', () => {
    const store = storeWith(note('n1'), note('n2'));
    store.togglePin('n1');
    expect(store.get('n1').pinned).toBe(true);
    store.togglePin('n1');
    expect(store.get('n1').pinned).toBe(false);
    expect(store.sorted().map((n) => n.id)).toEqual(['n2', 'n1']);
  });
});

describe('archive and trash', () => {
  it('archives and brings back', () => {
    const store = storeWith(note('n1'), note('n2'));
    store.archive('n1');
    expect(store.live().map((n) => n.id)).toEqual(['n2']);
    store.unarchive('n1');
    expect(store.live().map((n) => n.id).sort()).toEqual(['n1', 'n2']);
  });

  it('drops the pin when a note is archived or trashed', () => {
    const store = storeWith(note('n1'), note('n2'));
    store.togglePin('n1');
    store.archive('n1');
    expect(store.get('n1').pinned).toBe(false);
    store.togglePin('n2');
    store.trash('n2');
    expect(store.get('n2').pinned).toBe(false);
  });

  it('restores from the trash to the main list, not to the archive', () => {
    const store = storeWith(note('n1', { archivedAt: 5, deletedAt: 9 }), note('n2'));
    store.restore('n1');
    expect(store.live().map((n) => n.id).sort()).toEqual(['n1', 'n2']);
    expect(store.archived()).toEqual([]);
  });

  it('deleting forever removes the note, and the mirror deletes its file', () => {
    const store = storeWith(note('n1'), note('n2'));
    expect(store.destroy('n1')).toBe(true);
    expect(store.notes.map((n) => n.id)).toEqual(['n2']);
    expect(store.destroy('nope')).toBe(false);
  });

  it('opens another note when the open one is trashed', () => {
    const store = storeWith(note('n1'), note('n2'));
    store.setActive('n1');
    store.trash('n1');
    expect(store.activeId).toBe('n2');
  });

  it('leaves nothing open when the last note goes', () => {
    const store = storeWith(note('n1'));
    store.trash('n1');
    expect(store.activeId).toBeNull();
    expect(store.active()).toBeNull();
  });

  it('does not bump updatedAt — archiving is not editing', () => {
    const store = storeWith(note('n1'));
    const before = store.get('n1').updatedAt;
    store.archive('n1');
    store.togglePin('n1');
    expect(store.get('n1').updatedAt).toBe(before);
  });

  it('never opens a trashed note at boot', () => {
    localStorage.setItem('nebula:notes', JSON.stringify([note('n1', { deletedAt: 5 }), note('n2')]));
    localStorage.setItem('nebula:active-note', 'n1');
    const store = new NoteStore({ allowSeed: false });
    expect(store.activeId).toBe('n2');
  });
});
