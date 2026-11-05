import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measureStorage } from '../electron/storage-usage.js';
import { formatBytes, SETTINGS_TABS } from '../src/js/settings-panel.js';

let root;
const put = (rel, bytes) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof bytes === 'string' ? bytes : Buffer.alloc(bytes));
  return file;
};
const note = (id, extra = {}) => put(`notes/${id}/${id}.json`, JSON.stringify({ id, title: `T ${id}`, content: '', ...extra }));

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-usage-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('measureStorage', () => {
  it('splits words from pictures, names the biggest, and finds the Trash', async () => {
    const a = fs.statSync(note('a')).size;
    put('notes/a/pic.png', 5000);
    note('b');
    put('notes/b/clip.mp4', 20000);
    const c = fs.statSync(note('c', { deletedAt: 1 })).size;
    put('notes/c/x.png', 100);
    const u = await measureStorage({ notesDir: path.join(root, 'notes') });
    expect(u.ok).toBe(true);
    expect(u.notes.count).toBe(3);
    expect(u.notes.media).toBe(25100);
    expect(u.notes.top.map((n) => n.id)).toEqual(['b', 'a']);     // the Trash's note is not among them
    expect(u.notes.top[0].title).toBe('T b');
    expect(u.trash).toEqual({ bytes: c + 100, count: 1 });
    expect(u.notes.top[1].bytes).toBe(a + 5000);
    expect(u.total).toBe(u.notes.total);
  });

  it('counts a file a backup shares with its note once, with the note', async () => {
    note('a');
    const pic = put('notes/a/pic.png', 8000);
    fs.mkdirSync(path.join(root, 'backups/2026-11-04/notes/a'), { recursive: true });
    fs.linkSync(pic, path.join(root, 'backups/2026-11-04/notes/a/pic.png'));
    put('backups/2026-11-04/notes/a/a.json', 50);
    const u = await measureStorage({ notesDir: path.join(root, 'notes'), backupsDir: path.join(root, 'backups') });
    expect(u.backups.copies).toEqual([{ name: '2026-11-04', bytes: 50 }]);
    expect(u.total).toBe(u.notes.total + 50);
  });

  it('measures black holes, opened copies and the program by size only', async () => {
    put('blackholes/h1/sealed.bin', 300);
    put('blackholes/holes.json', 20);
    put('opened/n/x.pdf', 40);
    const exe = put('Nebula.exe', 1000);
    const u = await measureStorage({
      notesDir: path.join(root, 'notes'), holesDir: path.join(root, 'blackholes'),
      openedDir: path.join(root, 'opened'), appPath: exe,
    });
    expect(u.holes).toEqual({ bytes: 320, count: 1 });
    expect(u.opened).toBe(40);
    expect(u.app).toBe(1000);
    expect(u.total).toBe(1360);
  });

  it('answers for a vault that is not there yet', async () => {
    const u = await measureStorage({ notesDir: path.join(root, 'none'), appPath: path.join(root, 'nope') });
    expect(u).toMatchObject({ ok: true, total: 0, app: null, notes: { count: 0, top: [] } });
  });
});

describe('Settings tabs and sizes', () => {
  it('has the five tabs, Storage last', () => {
    expect(SETTINGS_TABS.map(([id]) => id)).toEqual(['general', 'look', 'sounds', 'lock', 'storage']);
  });
  it('writes sizes as people read them', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(formatBytes(3.2 * 1024 ** 3)).toBe('3.2 GB');
  });
});
