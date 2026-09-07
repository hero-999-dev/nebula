import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoteStore, plainSnippet, relativeTime, noteText } from '../src/js/notes.js';
import { SEED_NOTES } from '../src/js/seed-notes.js';

describe('NoteStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds the guide on a fresh vault and opens it', () => {
    const store = new NoteStore();
    expect(store.notes).toHaveLength(SEED_NOTES.length);
    expect(store.notes.map((n) => n.title)).toEqual(SEED_NOTES.map((s) => s.title));
    expect(store.active().title).toBe('Welcome to Nebula Guide');
    // every seeded note keeps its content — the old loop saved before content landed
    for (const note of store.notes) expect(note.content.length).toBeGreaterThan(50);
  });

  it('seeding writes storage once, not once per note', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const store = new NoteStore();
    const noteWrites = spy.mock.calls.filter(([k]) => k === 'nebula:notes').length;
    expect(noteWrites).toBe(1);
    expect(store.notes.length).toBe(SEED_NOTES.length);
    spy.mockRestore();
  });

  it('creates and switches notes', () => {
    const store = new NoteStore();
    const first = store.activeId;
    const n = store.createNote('Second');
    expect(n.id).not.toBe(first);
    expect(store.activeId).toBe(n.id);
  });

  it('updates content and title', () => {
    const store = new NoteStore();
    store.updateActive({ title: 'Hello', content: '<p>World</p>' });
    expect(store.active().title).toBe('Hello');
    expect(store.active().content).toContain('World');
  });

  it('will not delete the last note', () => {
    const store = new NoteStore();
    while (store.notes.length > 1) store.deleteActive();
    expect(store.deleteActive()).toBe(false);
    expect(store.notes.length).toBe(1);
  });

  it('filters by title and body', () => {
    const store = new NoteStore();
    store.createNote('Alpha');
    store.updateActive({ content: '<p>zebra stripe</p>' });
    store.createNote('Beta');
    expect(store.filter('zebra').some((n) => n.title === 'Alpha')).toBe(true);
    expect(store.filter('Beta').length).toBe(1);
  });
});

describe('helpers', () => {
  it('plainSnippet strips tags', () => {
    expect(plainSnippet('<p>Hi <b>there</b></p>')).toBe('Hi there');
  });

  it('relativeTime buckets', () => {
    expect(relativeTime(Date.now() - 30_000)).toBe('now');
    expect(relativeTime(Date.now() - 120_000)).toBe('2m');
  });
});

/**
 * Seeding only happens on an empty vault — that rule is what stops a failed
 * read from looking like a first run, and it does not bend. The consequence is
 * that anyone who already had notes never saw the guide. `ensureGuide` closes
 * that gap by ADDING, never overwriting.
 */
describe('NoteStore.ensureGuide', () => {
  const GUIDE = { title: 'Welcome to Nebula Guide', content: '<h1>Welcome to Nebula</h1><p>x</p>' };

  beforeEach(() => localStorage.clear());

  it('adds the guide to a vault that already has notes, without touching them', () => {
    const store = new NoteStore({ allowSeed: false });
    store.notes = [{ id: 'a', title: 'My note', content: 'mine', createdAt: 1, updatedAt: 1 }];
    store.save();

    expect(store.ensureGuide(GUIDE, '1.0.0')).toBe(true);
    expect(store.notes).toHaveLength(2);
    expect(store.notes[0].title).toBe(GUIDE.title);
    expect(store.notes.find((n) => n.id === 'a')).toEqual({
      id: 'a', title: 'My note', content: 'mine', createdAt: 1, updatedAt: 1,
    });
  });

  it('does it once — a second boot on the same version adds nothing', () => {
    const store = new NoteStore({ allowSeed: false });
    expect(store.ensureGuide(GUIDE, '1.0.0')).toBe(true);
    expect(store.ensureGuide(GUIDE, '1.0.0')).toBe(false);
    expect(store.notes.filter((n) => n.title === GUIDE.title)).toHaveLength(1);
  });

  it('a deleted guide stays deleted until the guide itself changes', () => {
    const store = new NoteStore({ allowSeed: false });
    store.ensureGuide(GUIDE, '1.0.0');
    store.notes = [];               // the user deleted it
    store.save();
    expect(store.ensureGuide(GUIDE, '1.0.0')).toBe(false);
    expect(store.notes).toHaveLength(0);
    // ...but a newer guide is offered again
    expect(store.ensureGuide(GUIDE, '1.1.0')).toBe(true);
  });

  it('a freshly seeded vault is only stamped, never given a second copy', () => {
    const store = new NoteStore();                       // seeds the guide
    const before = store.notes.length;
    expect(store.ensureGuide(SEED_NOTES[0], '9.9.9')).toBe(false);
    expect(store.notes).toHaveLength(before);
    expect(localStorage.getItem('nebula:guide-version')).toBe('9.9.9');
  });

  it('refuses without a note or a version rather than writing junk', () => {
    const store = new NoteStore({ allowSeed: false });
    expect(store.ensureGuide(null, '1.0.0')).toBe(false);
    expect(store.ensureGuide(GUIDE, '')).toBe(false);
    expect(store.notes).toHaveLength(0);
  });
});

describe('note text', () => {
  it('leaves shape text out of the preview', () => {
    // Shapes are the note's first children, so two words typed inside one
    // became the whole sidebar preview: "Heyoooo… drag me anywhere" ahead of
    // the actual first line.
    const html = '<div class="shape-layer"><div class="shape rect">'
      + '<div class="shape-text">Heyooooooo</div><span class="shape-h"></span></div></div>'
      + '<h1>Welcome to Nebula</h1><p>A calm place for notes.</p>';
    expect(noteText(html)).toBe('Welcome to Nebula A calm place for notes.');
    expect(plainSnippet(html, 40)).not.toContain('Heyo');
  });

  it('drops both layers, not just the first', () => {
    const html = '<div class="shape-layer shape-layer--behind"><div class="shape-text">back</div></div>'
      + '<div class="shape-layer"><div class="shape-text">front</div></div><p>real text</p>';
    expect(noteText(html)).toBe('real text');
  });

  it('cuts a long preview with an ellipsis rather than growing', () => {
    const long = `<p>${'Hey' + 'o'.repeat(200)}</p>`;
    const snip = plainSnippet(long, 48);
    expect(snip).toHaveLength(48);
    expect(snip.endsWith('…')).toBe(true);
  });

  it('is empty for an empty note', () => {
    expect(noteText('')).toBe('');
    expect(noteText(null)).toBe('');
  });
});

describe('NoteStore.filter searches the whole note', () => {
  beforeEach(() => localStorage.clear());

  it('finds a word past the first 500 characters', () => {
    // It used to search plainSnippet(content, 500), so anything further down a
    // long note could not be found from the sidebar at all.
    const store = new NoteStore({ allowSeed: false });
    store.notes = [
      { id: 'a', title: 'Long', content: `<p>${'filler '.repeat(200)}needle</p>`, createdAt: 1, updatedAt: 2 },
      { id: 'b', title: 'Other', content: '<p>nothing here</p>', createdAt: 1, updatedAt: 1 },
    ];
    expect(store.filter('needle').map((n) => n.id)).toEqual(['a']);
  });

  it('still matches on the title, and keeps only what matched', () => {
    const store = new NoteStore({ allowSeed: false });
    store.notes = [
      { id: 'a', title: 'Groceries', content: '<p>milk</p>', createdAt: 1, updatedAt: 2 },
      { id: 'b', title: 'Ideas', content: '<p>a better milkshake</p>', createdAt: 1, updatedAt: 1 },
    ];
    expect(store.filter('grocer').map((n) => n.id)).toEqual(['a']);
    expect(store.filter('milk').map((n) => n.id)).toEqual(['a', 'b']);
    expect(store.filter('zebra')).toEqual([]);
  });

  it('does not match text that only exists inside a shape', () => {
    const store = new NoteStore({ allowSeed: false });
    store.notes = [{ id: 'a', title: 'N', content: '<div class="shape-layer"><div class="shape-text">zebra</div></div><p>hi</p>', createdAt: 1, updatedAt: 1 }];
    expect(store.filter('zebra')).toEqual([]);
    expect(store.filter('hi').map((n) => n.id)).toEqual(['a']);
  });
});
