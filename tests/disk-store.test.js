/**
 * Guards for the disk mirror bugs found on 2026-07-16: racing writes corrupted
 * note files, and the delete branch referenced an out-of-scope variable so the
 * wrong file was targeted (and it threw).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDiskStorage, flushDisk, hasDiskStorage } from '../src/js/disk-store.js';
import { saveJson } from '../src/js/storage.js';

function fakeVault({ writeDelay = () => 0 } = {}) {
  const files = new Map();
  const order = [];
  return {
    files,
    order,
    api: {
      list: vi.fn(async () => ({ ok: true, files: [...files.keys()] })),
      read: vi.fn(async (rel) => {
        const name = rel.replace('notes/', '');
        return files.has(name) ? { ok: true, data: files.get(name) } : { ok: false };
      }),
      // simulates a real fs: slow, out-of-order completion
      write: vi.fn(async (rel, content) => {
        const ms = writeDelay(content);
        await new Promise((r) => setTimeout(r, ms));
        files.set(rel.replace('notes/', ''), content);
        order.push(`w:${rel}`);
        return { ok: true };
      }),
      remove: vi.fn(async (rel) => {
        files.delete(rel.replace('notes/', ''));
        order.push(`r:${rel}`);
        return { ok: true };
      }),
      reveal: vi.fn(async () => ({ ok: true })),
      root: vi.fn(async () => 'C:\\fake'),
    },
  };
}

const note = (id, content) => ({ id, title: id, content, createdAt: 1, updatedAt: 1 });

describe('disk mirror', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.nebula;
  });

  it('serializes rapid saves per file — last state wins, never interleaved', async () => {
    // long content resolves slower, so an unqueued mirror would land out of order
    const vault = fakeVault({ writeDelay: (c) => (c.length > 200 ? 20 : 1) });
    window.nebula = { storage: vault.api };
    await initDiskStorage();
    expect(hasDiskStorage()).toBe(true);

    saveJson('nebula:notes', [note('n1', 'x'.repeat(300))]); // slow write
    saveJson('nebula:notes', [note('n1', 'final')]);          // fast write, queued after
    await flushDisk();

    const written = JSON.parse(vault.files.get('n1.json'));
    expect(written.content).toBe('final');
    expect(() => JSON.parse(vault.files.get('n1.json'))).not.toThrow();
  });

  it('every mirrored file is valid, complete JSON', async () => {
    const vault = fakeVault();
    window.nebula = { storage: vault.api };
    await initDiskStorage();

    const notes = Array.from({ length: 6 }, (_, i) => note(`n${i}`, `<p>${'body '.repeat(i * 20)}</p>`));
    saveJson('nebula:notes', notes);
    await flushDisk();

    expect(vault.files.size).toBe(6);
    for (const [name, raw] of vault.files) {
      const parsed = JSON.parse(raw); // throws if truncated → test fails
      expect(parsed.id, name).toBeTruthy();
      expect(parsed.content, name).toContain('<p>');
    }
  });

  it('removing a note deletes ITS file (not another note\'s)', async () => {
    const vault = fakeVault();
    window.nebula = { storage: vault.api };
    await initDiskStorage();

    saveJson('nebula:notes', [note('keep', 'a'), note('gone', 'b')]);
    await flushDisk();
    expect([...vault.files.keys()].sort()).toEqual(['gone.json', 'keep.json']);

    saveJson('nebula:notes', [note('keep', 'a')]);
    await flushDisk();
    expect([...vault.files.keys()]).toEqual(['keep.json']);
    expect(vault.api.remove).toHaveBeenCalledWith('notes/gone.json');
  });

  it('skips unchanged notes instead of rewriting them', async () => {
    const vault = fakeVault();
    window.nebula = { storage: vault.api };
    await initDiskStorage();

    saveJson('nebula:notes', [note('n1', 'same')]);
    await flushDisk();
    const first = vault.api.write.mock.calls.length;
    saveJson('nebula:notes', [note('n1', 'same')]);
    await flushDisk();
    expect(vault.api.write.mock.calls.length).toBe(first);
  });

  it('loads notes from disk at boot and ignores a corrupt file', async () => {
    const vault = fakeVault();
    vault.files.set('good.json', JSON.stringify(note('good', 'ok')));
    vault.files.set('bad.json', '{ "id": "bad", trunca');
    window.nebula = { storage: vault.api };
    await initDiskStorage();

    const loaded = JSON.parse(localStorage.getItem('nebula:notes'));
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('good');
  });

  it('browser (no bridge) stays in memory and never throws', async () => {
    const status = await initDiskStorage();
    expect(status).toEqual({ bridge: false, ok: true, empty: true, error: null });
    expect(hasDiskStorage()).toBe(false);
    expect(() => saveJson('nebula:notes', [note('n1', 'x')])).not.toThrow();
  });
});
