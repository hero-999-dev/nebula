import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoteStore, plainSnippet, relativeTime } from '../src/js/notes.js';
import { SEED_NOTES } from '../src/js/seed-notes.js';

describe('NoteStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds one note per feature category on a fresh vault', () => {
    const store = new NoteStore();
    expect(store.notes).toHaveLength(SEED_NOTES.length);
    expect(store.notes.map((n) => n.title)).toEqual(SEED_NOTES.map((s) => s.title));
    expect(store.active().title).toBe('Welcome to Nebula');
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
