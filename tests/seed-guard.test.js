/**
 * The seed guard.
 *
 * Before this, "the note list is empty" was the only signal the store had, and
 * `storage:list` turned every failure into an empty list. A permission error or
 * a locked profile therefore looked exactly like a first run, and the app
 * answered by writing six sample notes over the top of a vault it could not
 * read. These tests pin the distinction that makes that impossible.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDiskStorage, hasDiskStorage, flushDisk } from '../src/js/disk-store.js';
import { NoteStore } from '../src/js/notes.js';
import { SEED_NOTES } from '../src/js/seed-notes.js';
import { saveJson } from '../src/js/storage.js';

const note = (id, content = 'body') => ({ id, title: id, content, createdAt: 1, updatedAt: 1 });

/** A vault whose behaviour each test dictates. */
function vault({ list, read } = {}) {
  const files = new Map();
  return {
    files,
    api: {
      list: list ?? vi.fn(async () => ({ ok: true, files: [...files.keys()] })),
      read: read ?? vi.fn(async (rel) => {
        const name = rel.replace('notes/', '');
        return files.has(name)
          ? { ok: true, data: files.get(name) }
          : { ok: false, missing: true, error: 'ENOENT' };
      }),
      write: vi.fn(async (rel, content) => { files.set(rel.replace('notes/', ''), content); return { ok: true }; }),
      remove: vi.fn(async (rel) => { files.delete(rel.replace('notes/', '')); return { ok: true }; }),
      reveal: vi.fn(async () => ({ ok: true })),
      root: vi.fn(async () => 'C:\\fake'),
    },
  };
}

/** What src/js/main.js does with the status it gets back. */
const seedDecision = (status) => status.ok && status.empty;

describe('vault status', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.nebula;
    vi.restoreAllMocks();
  });

  it('a genuinely empty vault is a first run — seeding allowed', async () => {
    const v = vault();
    window.nebula = { storage: v.api };

    const status = await initDiskStorage();
    expect(status).toMatchObject({ bridge: true, ok: true, empty: true });
    expect(seedDecision(status)).toBe(true);

    const store = new NoteStore({ allowSeed: seedDecision(status) });
    expect(store.notes).toHaveLength(SEED_NOTES.length);
  });

  it('a vault with notes is not empty — seeding refused, notes load', async () => {
    const v = vault();
    v.files.set('n1.json', JSON.stringify(note('n1', 'real note')));
    window.nebula = { storage: v.api };

    const status = await initDiskStorage();
    expect(status).toMatchObject({ bridge: true, ok: true, empty: false });

    const store = new NoteStore({ allowSeed: seedDecision(status) });
    expect(store.notes).toHaveLength(1);
    expect(store.notes[0].content).toBe('real note');
  });

  it('a failed listing is NOT a first run — no seeding, no disk writes', async () => {
    const v = vault({ list: vi.fn(async () => ({ ok: false, files: [], error: 'EPERM: operation not permitted' })) });
    window.nebula = { storage: v.api };

    const status = await initDiskStorage();
    expect(status).toMatchObject({ bridge: true, ok: false, empty: false });
    expect(status.error).toContain('EPERM');
    expect(seedDecision(status)).toBe(false);
    expect(hasDiskStorage()).toBe(false);

    const store = new NoteStore({ allowSeed: seedDecision(status) });
    expect(store.notes).toHaveLength(0);

    // The mirror is off, so nothing this session does can reach the files.
    saveJson('nebula:notes', [note('n9')]);
    await flushDisk();
    expect(v.api.write).not.toHaveBeenCalled();
    expect(v.api.remove).not.toHaveBeenCalled();
  });

  it('a throwing listing is treated the same as a failed one', async () => {
    const v = vault({ list: vi.fn(async () => { throw new Error('bridge gone'); }) });
    window.nebula = { storage: v.api };

    const status = await initDiskStorage();
    expect(status).toMatchObject({ bridge: true, ok: false });
    expect(seedDecision(status)).toBe(false);
  });

  it('an I/O error while reading a listed note disables the mirror', async () => {
    const v = vault({
      read: vi.fn(async () => ({ ok: false, missing: false, error: 'EACCES: permission denied' })),
    });
    v.files.set('n1.json', JSON.stringify(note('n1')));
    window.nebula = { storage: v.api };

    const status = await initDiskStorage();
    expect(status).toMatchObject({ bridge: true, ok: false, empty: false });
    expect(status.error).toContain('EACCES');
    expect(hasDiskStorage()).toBe(false);

    // Crucially: localStorage was not overwritten with a partial vault.
    expect(localStorage.getItem('nebula:notes')).toBeNull();
  });

  it('a note file deleted between listing and reading is survivable', async () => {
    const v = vault();
    v.files.set('gone.json', JSON.stringify(note('gone')));
    v.files.set('here.json', JSON.stringify(note('here')));
    window.nebula = { storage: v.api };
    const realRead = v.api.read;
    v.api.read = vi.fn(async (rel) =>
      rel.endsWith('gone.json') ? { ok: false, missing: true, error: 'ENOENT' } : realRead(rel));

    const status = await initDiskStorage();
    expect(status).toMatchObject({ bridge: true, ok: true, empty: false });
    expect(JSON.parse(localStorage.getItem('nebula:notes'))).toHaveLength(1);
  });

  it('notes only in localStorage are pushed to disk, not reseeded', async () => {
    const v = vault();
    localStorage.setItem('nebula:notes', JSON.stringify([note('legacy', 'from an older build')]));
    window.nebula = { storage: v.api };

    const status = await initDiskStorage();
    await flushDisk();

    expect(status).toMatchObject({ ok: true, empty: false });
    expect(seedDecision(status)).toBe(false);
    expect([...v.files.keys()]).toEqual(['legacy.json']);

    const store = new NoteStore({ allowSeed: seedDecision(status) });
    expect(store.notes.map((n) => n.id)).toEqual(['legacy']);
  });

  it('browser preview seeds, because there is nothing on disk to lose', async () => {
    const status = await initDiskStorage();
    expect(seedDecision(status)).toBe(true);
    expect(new NoteStore({ allowSeed: seedDecision(status) }).notes).toHaveLength(SEED_NOTES.length);
  });
});

describe('NoteStore seeding', () => {
  beforeEach(() => localStorage.clear());

  it('leaves an empty store empty when seeding is refused', () => {
    const store = new NoteStore({ allowSeed: false });
    expect(store.notes).toHaveLength(0);
    expect(store.activeId).toBeNull();
    expect(store.active()).toBeNull();
  });

  it('never seeds over notes that are already there', () => {
    localStorage.setItem('nebula:notes', JSON.stringify([note('kept', 'mine')]));
    expect(new NoteStore({ allowSeed: true }).notes).toHaveLength(1);
  });
});
