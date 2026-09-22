/**
 * Guards for the disk mirror bugs found on 2026-07-16: racing writes corrupted
 * note files, and the delete branch referenced an out-of-scope variable so the
 * wrong file was targeted (and it threw).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initDiskStorage, flushDisk, hasDiskStorage, getDiskStatus } from '../src/js/disk-store.js';
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

  it('protects a partially corrupt vault and preserves the previous cache', async () => {
    const vault = fakeVault();
    vault.files.set('good.json', JSON.stringify(note('good', 'ok')));
    vault.files.set('bad.json', '{ "id": "bad", trunca');
    localStorage.setItem('nebula:notes', JSON.stringify([note('cached', 'last known state')]));
    window.nebula = { storage: vault.api };
    const status = await initDiskStorage();

    const loaded = JSON.parse(localStorage.getItem('nebula:notes'));
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('cached');
    expect(status).toMatchObject({ ok: false, empty: false });
    expect(hasDiskStorage()).toBe(false);
    saveJson('nebula:notes', [note('cached', 'edited')]);
    await flushDisk();
    expect(vault.api.write).not.toHaveBeenCalled();
  });

  it('reports a failed write and retries identical content on the next save', async () => {
    const vault = fakeVault();
    vault.api.write.mockResolvedValueOnce({ ok: false, error: 'disk full' });
    window.nebula = { storage: vault.api };
    await initDiskStorage();
    const statuses = [];
    const onStatus = (event) => statuses.push(event.detail);
    window.addEventListener('nebula-storage-status', onStatus);
    try {
      saveJson('nebula:notes', [note('n1', 'unchanged')]);
      expect(getDiskStatus().pending).toBe(true);
      await expect(flushDisk()).rejects.toThrow('disk full');
      expect(getDiskStatus()).toEqual({ ok: false, pending: false, error: 'disk full' });
      saveJson('nebula:notes', [note('n1', 'unchanged')]);
      await flushDisk();
      expect(JSON.parse(vault.files.get('n1.json')).content).toBe('unchanged');
      expect(vault.api.write).toHaveBeenCalledTimes(2);
      expect(statuses.at(-1)).toEqual({ ok: true, pending: false, error: null });
    } finally {
      window.removeEventListener('nebula-storage-status', onStatus);
    }
  });

  it('retries a rejected bridge call on flush, keeping the latest state', async () => {
    const vault = fakeVault();
    vault.api.write.mockRejectedValueOnce(new Error('bridge failed'));
    window.nebula = { storage: vault.api };
    await initDiskStorage();
    saveJson('nebula:notes', [note('n1', 'first')]);
    await expect(flushDisk()).rejects.toThrow('bridge failed');
    await flushDisk();
    expect(JSON.parse(vault.files.get('n1.json')).content).toBe('first');
    expect(getDiskStatus()).toEqual({ ok: true, pending: false, error: null });

    vault.api.write.mockRejectedValueOnce(new Error('transient'));
    saveJson('nebula:notes', [note('n1', 'second')]);
    saveJson('nebula:notes', [note('n1', 'latest')]);
    await flushDisk();
    expect(JSON.parse(vault.files.get('n1.json')).content).toBe('latest');
  });

  it('retries a failed deletion and never resurrects its old write', async () => {
    const vault = fakeVault();
    window.nebula = { storage: vault.api };
    await initDiskStorage();
    saveJson('nebula:notes', [note('gone', 'body')]);
    await flushDisk();
    vault.api.remove.mockResolvedValueOnce({ ok: false, error: 'locked file' });
    saveJson('nebula:notes', []);
    await expect(flushDisk()).rejects.toThrow('locked file');
    expect(vault.files.has('gone.json')).toBe(true);
    await flushDisk();
    expect(vault.files.has('gone.json')).toBe(false);
    expect(vault.api.remove).toHaveBeenCalledTimes(2);
  });

  it('queues a return to the acknowledged value behind an unfinished newer write', async () => {
    const vault = fakeVault({ writeDelay: () => 3 });
    window.nebula = { storage: vault.api };
    await initDiskStorage();
    saveJson('nebula:notes', [note('n1', 'original')]);
    await flushDisk();
    saveJson('nebula:notes', [note('n1', 'temporary')]);
    saveJson('nebula:notes', [note('n1', 'original')]);
    await flushDisk();
    expect(JSON.parse(vault.files.get('n1.json')).content).toBe('original');
  });

  it('browser (no bridge) stays in memory and never throws', async () => {
    const status = await initDiskStorage();
    expect(status).toEqual({ bridge: false, ok: true, empty: true, error: null });
    expect(hasDiskStorage()).toBe(false);
    expect(() => saveJson('nebula:notes', [note('n1', 'x')])).not.toThrow();
  });
});
