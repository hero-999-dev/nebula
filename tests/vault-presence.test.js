import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vaultPresence } from '../electron/vault-presence.js';

let profile;
let notes;
beforeEach(() => {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-vault-presence-'));
  notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(path.join(notes, 'n-a'), { recursive: true });
  fs.writeFileSync(path.join(notes, 'n-a', 'picture.png'), 'original bytes');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(profile, { recursive: true, force: true }); });

describe('a vault already opened in memory', () => {
  it('refuses to save after its notes root disappears or is replaced', () => {
    const guard = vaultPresence(notes);
    guard.capture();
    const moved = path.join(profile, 'notes-disconnected');
    fs.renameSync(notes, moved);
    expect(() => guard.assert('n-a')).toThrow('notes folder disappeared');
    fs.mkdirSync(notes);
    expect(() => guard.assert('n-a')).toThrow('notes folder disappeared');
    fs.rmSync(notes, { recursive: true, force: true });
    fs.renameSync(moved, notes);
    expect(() => guard.assert('n-a')).not.toThrow();
    expect(fs.readFileSync(path.join(notes, 'n-a', 'picture.png'), 'utf8')).toBe('original bytes');
  });

  it('refuses to save after one existing note folder disappears or is replaced', () => {
    const guard = vaultPresence(notes);
    guard.capture();
    const moved = path.join(profile, 'note-disconnected');
    fs.renameSync(path.join(notes, 'n-a'), moved);
    expect(() => guard.assert('n-a')).toThrow('note folder disappeared');
    fs.mkdirSync(path.join(notes, 'n-a'));
    expect(() => guard.assert('n-a')).toThrow('note folder disappeared');
    fs.rmSync(path.join(notes, 'n-a'), { recursive: true, force: true });
    fs.renameSync(moved, path.join(notes, 'n-a'));
    expect(() => guard.assert('n-a')).not.toThrow();
  });

  it('allows a first-run vault and remembers new note folders after they are made', () => {
    const fresh = path.join(profile, 'new-vault', 'notes');
    const guard = vaultPresence(fresh);
    guard.capture();
    expect(() => guard.assert('n-new')).not.toThrow();
    fs.mkdirSync(path.join(fresh, 'n-new'), { recursive: true });
    guard.remember('n-new');
    expect(() => guard.assert('n-new')).not.toThrow();
    fs.renameSync(path.join(fresh, 'n-new'), path.join(profile, 'new-disconnected'));
    expect(() => guard.assert('n-new')).toThrow('note folder disappeared');
  });

  it('accepts a folder recreated after the app itself removed it', () => {
    const guard = vaultPresence(notes);
    guard.capture();
    fs.rmSync(path.join(notes, 'n-a'), { recursive: true });
    expect(() => guard.assert('n-a')).toThrow('note folder disappeared');
    guard.forget('n-a');
    fs.mkdirSync(path.join(notes, 'n-a'));
    guard.remember('n-a');
    expect(() => guard.assert('n-a')).not.toThrow();
    fs.renameSync(path.join(notes, 'n-a'), path.join(profile, 'new-disconnected'));
    expect(() => guard.assert('n-a')).toThrow('note folder disappeared');
  });

  it('checks presence but skips replacement identity when inode is zero', () => {
    const realStat = fs.statSync;
    vi.spyOn(fs, 'statSync').mockImplementation((file, options) => {
      const stat = realStat(file, options);
      return file === notes ? { ...stat, ino: 0n, isDirectory: () => true } : stat;
    });
    const guard = vaultPresence(notes);
    guard.capture();
    const moved = path.join(profile, 'notes-disconnected');
    fs.renameSync(notes, moved);
    expect(() => guard.assert()).toThrow('notes folder disappeared');
    fs.mkdirSync(notes);
    expect(() => guard.assert()).not.toThrow();
  });
});
