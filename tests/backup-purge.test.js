// @vitest-environment node
/**
 * A note deleted from the Trash is gone from the backups too (owner,
 * 2026-09-27: "a note I deleted must not be recoverable — that is a security
 * hole"). Nebula Test's backups held 28 notes deleted long before.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { purgeNoteFromBackups, purgeNoteFromBackupsAsync, purgeHoleNoteFromBackupsAsync, purgeHoleFromBackupsAsync, purgeDeletedFromBackups, protectLegacyHoleBackups } from '../electron/backup-purge.js';

let root;
const notes = () => path.join(root, 'storage', 'notes');
const backups = () => path.join(root, 'backups');
const put = (dir, id, text = '{"id":"x","content":"words"}') => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), text);
};
const inBackups = (id) => fs.readdirSync(backups()).filter((b) => fs.existsSync(path.join(backups(), b, 'notes', `${id}.json`)));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-purge-'));
  put(notes(), 'n-live');
  put(notes(), 'n-trashed', '{"id":"n-trashed","deletedAt":1}');
  for (const b of ['2026-09-09', '2026-09-10', 'pre-update-0.8.8-1', 'pre-heal-0.9.1']) {
    put(path.join(backups(), b, 'notes'), 'n-live');
    put(path.join(backups(), b, 'notes'), 'n-trashed');
    put(path.join(backups(), b, 'notes'), 'n-gone');
  }
  fs.writeFileSync(path.join(backups(), '2026-09-10', 'meta.json'), '{}');
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('a note deleted from the vault leaves every backup', () => {
  it('purges a large media backup before reporting completion', async () => {
    const media = path.join(backups(), '2026-09-10', 'notes', 'n-gone');
    fs.mkdirSync(media, { recursive: true });
    fs.writeFileSync(path.join(media, 'vid-large.webm'), Buffer.alloc(16 * 1024 * 1024, 7));
    expect(await purgeNoteFromBackupsAsync(backups(), 'n-gone')).toBe(5);
    expect(inBackups('n-gone')).toEqual([]);
    expect(fs.existsSync(media)).toBe(false);
    expect(inBackups('n-live')).toHaveLength(4);
  });

  it('unlinks a directory junction in a backup without traversing its external target', async () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    const sentinel = path.join(outside, 'keep.bin');
    fs.writeFileSync(sentinel, 'outside data');
    const link = path.join(backups(), '2026-09-10', 'notes', 'n-gone');
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    await purgeNoteFromBackupsAsync(backups(), 'n-gone');
    expect(fs.existsSync(link)).toBe(false);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('outside data');
  });

  it('skips a backup whose notes directory redirects outside the backup tree', async () => {
    const outside = path.join(root, 'outside-notes');
    put(outside, 'n-gone', 'external note');
    const link = path.join(backups(), '2026-09-10', 'notes');
    fs.rmSync(link, { recursive: true, force: true });
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await purgeNoteFromBackupsAsync(backups(), 'n-gone')).toBe(3);
    expect(fs.readFileSync(path.join(outside, 'n-gone.json'), 'utf8')).toBe('external note');
  });

  it('removes that note from daily, pre-update and pre-heal copies alike, and nothing else', () => {
    expect(purgeNoteFromBackups(backups(), 'n-gone')).toBe(4);
    expect(inBackups('n-gone')).toEqual([]);
    expect(inBackups('n-live')).toHaveLength(4);
    expect(inBackups('n-trashed')).toHaveLength(4);
    expect(fs.existsSync(path.join(backups(), '2026-09-10', 'meta.json'))).toBe(true);
  });

  it('takes a note id only, never a path', () => {
    expect(purgeNoteFromBackups(backups(), '../storage/notes/n-live')).toBe(0);
    expect(purgeNoteFromBackups(backups(), '')).toBe(0);
    expect(fs.existsSync(path.join(notes(), 'n-live.json'))).toBe(true);
  });

  it('is fine with no backups at all', () => {
    expect(purgeNoteFromBackups(path.join(root, 'nowhere'), 'n-gone')).toBe(0);
  });
});

describe('the notes deleted before this version, once', () => {
  it('removes every note no longer in the vault; the Trash is still a way back', () => {
    expect(purgeDeletedFromBackups(notes(), backups())).toEqual({ refused: false, removed: 4 });
    expect(inBackups('n-gone')).toEqual([]);
    expect(inBackups('n-trashed')).toHaveLength(4);   // still in the vault, in the Trash
    expect(inBackups('n-live')).toHaveLength(4);
    expect(purgeDeletedFromBackups(notes(), backups()).removed).toBe(0);
  });

  it('refuses when the vault has no notes: the backups may be the only copy left', () => {
    fs.rmSync(notes(), { recursive: true });
    expect(purgeDeletedFromBackups(notes(), backups())).toEqual({ refused: true, removed: 0 });
    fs.mkdirSync(notes(), { recursive: true });
    expect(purgeDeletedFromBackups(notes(), backups())).toEqual({ refused: true, removed: 0 });
    expect(inBackups('n-gone')).toHaveLength(4);
  });
});

describe('asynchronous black-hole backup purge', () => {
  it('waits for sealed note and media removal and keeps other notes until whole-hole deletion', async () => {
    for (const label of ['2026-09-09', 'kept-by-hand']) {
      const dir = path.join(backups(), label, 'blackholes', 'h1');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'n1.bh'), 'sealed note');
      fs.writeFileSync(path.join(dir, 'n1~vid-test.bhv'), Buffer.alloc(4 * 1024 * 1024, 9));
      fs.writeFileSync(path.join(dir, 'n2.bh'), 'other note');
    }
    expect(await purgeHoleNoteFromBackupsAsync(backups(), 'h1', 'n1')).toBe(4);
    expect(await purgeHoleNoteFromBackupsAsync(backups(), 'h1', '../n2')).toBe(0);
    for (const label of ['2026-09-09', 'kept-by-hand']) {
      const dir = path.join(backups(), label, 'blackholes', 'h1');
      expect(fs.readdirSync(dir)).toEqual(['n2.bh']);
    }
    expect(await purgeHoleFromBackupsAsync(backups(), 'h1')).toBe(2);
    expect(await purgeHoleFromBackupsAsync(backups(), 'h1')).toBe(0);
  });
});

describe('legacy black-hole key wrappers in local backups', () => {
  it('replaces only unprotected wrappers, keeping every sealed note and the backup metadata', () => {
    const wrapper = { os: true, salt: 'new-salt', box: 'os-protected-box' };
    for (const label of ['2026-09-09', 'kept-by-hand']) {
      const dir = path.join(backups(), label, 'blackholes', 'h1');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'hole.json'), JSON.stringify({ id: 'h1', name: label, key: { os: false, salt: 'old', box: 'guessable' }, recovery: { box: 'recovery' } }));
      fs.writeFileSync(path.join(dir, 'n1.bh'), 'sealed note');
    }
    expect(protectLegacyHoleBackups(backups(), 'h1', wrapper)).toEqual({ updated: 2, failed: 0 });
    for (const label of ['2026-09-09', 'kept-by-hand']) {
      const dir = path.join(backups(), label, 'blackholes', 'h1');
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'hole.json'), 'utf8'));
      expect(meta).toMatchObject({ id: 'h1', name: label, key: wrapper, recovery: { box: 'recovery' } });
      expect(fs.readFileSync(path.join(dir, 'n1.bh'), 'utf8')).toBe('sealed note');
    }
    expect(protectLegacyHoleBackups(backups(), 'h1', wrapper)).toEqual({ updated: 0, failed: 0 });
    expect(protectLegacyHoleBackups(backups(), '../h1', wrapper)).toEqual({ updated: 0, failed: 0 });
  });

  it('removes a legacy clear-text label from a protected backup without changing its sealed notes', () => {
    const file = path.join(backups(), 'kept-by-hand', 'blackholes', 'h1', 'hole.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ id: 'h1', name: 'Private label', key: { os: true, salt: 'old', box: 'protected' }, recovery: { box: 'kept' } }));
    fs.writeFileSync(path.join(path.dirname(file), 'n1.bh'), 'sealed note');
    expect(protectLegacyHoleBackups(backups(), 'h1', null, 'encrypted-name')).toEqual({ updated: 1, failed: 0 });
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(meta.name).toBeUndefined();
    expect(meta.nameBox).toBe('encrypted-name');
    expect(meta.key.box).toBe('protected');
    expect(fs.readFileSync(path.join(path.dirname(file), 'n1.bh'), 'utf8')).toBe('sealed note');
  });
});
