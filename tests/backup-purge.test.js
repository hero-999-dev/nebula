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
import { purgeNoteFromBackups, purgeDeletedFromBackups } from '../electron/backup-purge.js';

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
