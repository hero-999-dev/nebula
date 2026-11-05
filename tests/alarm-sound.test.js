// @vitest-environment node
/**
 * The sound the Pomodoro and the Clock ring with (1.0.3), in the main process
 * (electron/alarm-sound.js): only a sound the system lists can be read, and a
 * file of the user's is kept, read back and removed. Real files in the
 * system's temp directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { systemSoundDir, soundNames, readSystemSound, readOwnSound, listOwnSounds, writeOwnSound, clearOwnSound, OWN_COUNT } from '../electron/alarm-sound.js';

const MP3 = `data:audio/mpeg;base64,${Buffer.from([0x49, 0x44, 0x33, 3, 0, 0]).toString('base64')}`;
let root;

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-sound-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('the system’s sounds', () => {
  it('are looked for where each system keeps them', () => {
    expect(systemSoundDir('win32', { SystemRoot: 'C:\\Windows' })).toBe(path.join('C:\\Windows', 'Media'));
    expect(systemSoundDir('darwin', {})).toBe('/System/Library/Sounds');
    expect(systemSoundDir('linux', {})).toContain('freedesktop');
  });

  it('are the sound files there, sorted, and nothing else', () => {
    for (const f of ['b.wav', 'A.mp3', 'notes.txt', 'c.aiff']) fs.writeFileSync(path.join(root, f), 'x');
    fs.mkdirSync(path.join(root, 'd.wav'));
    expect(soundNames(root)).toEqual(['A.mp3', 'b.wav', 'c.aiff']);
    expect(soundNames(path.join(root, 'none'))).toEqual([]);
  });

  it('are read only by a name the listing has', () => {
    fs.writeFileSync(path.join(root, 'ding.wav'), 'RIFF');
    fs.writeFileSync(path.join(root, 'secret.txt'), 'no');
    expect(readSystemSound(root, 'ding.wav')).toBe(`data:audio/wav;base64,${Buffer.from('RIFF').toString('base64')}`);
    for (const name of ['secret.txt', '../ding.wav', 'missing.wav', null]) expect(readSystemSound(root, name)).toBeNull();
  });
});

describe('a sound of the user’s', () => {
  it('is kept beside the others, read back by its id with its name, and removed alone', () => {
    const dir = path.join(root, 'alarm-sound');
    expect(readOwnSound(dir)).toBeNull();
    expect(listOwnSounds(dir)).toEqual([]);
    const one = writeOwnSound(dir, MP3, 'wake up.mp3');
    const two = writeOwnSound(dir, MP3, 'focus.mp3');
    expect(one).toEqual({ ok: true, id: expect.stringMatching(/^[a-z0-9]{6,24}$/) });
    expect(two.id).not.toBe(one.id);
    expect(readOwnSound(dir, one.id)).toEqual({ name: 'wake up.mp3', address: MP3 });
    expect(listOwnSounds(dir).map((s) => s.name).sort()).toEqual(['focus.mp3', 'wake up.mp3']);
    for (const bad of ['../x', 'A', '']) expect(readOwnSound(dir, bad)).toBeNull();
    clearOwnSound(dir, one.id);
    expect(listOwnSounds(dir)).toEqual([{ id: two.id, name: 'focus.mp3' }]);
    clearOwnSound(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('of the first 1.0.3 builds is read as “own”', () => {
    const dir = path.join(root, 'alarm-sound');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'own.mp3'), Buffer.from([0x49, 0x44, 0x33, 3, 0, 0]));
    fs.writeFileSync(path.join(dir, 'name.txt'), 'old.mp3');
    expect(listOwnSounds(dir)).toEqual([{ id: 'own', name: 'old.mp3' }]);
    expect(readOwnSound(dir)).toEqual({ name: 'old.mp3', address: MP3 });
    clearOwnSound(dir, 'own');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('stops at a shelf of OWN_COUNT', () => {
    const dir = path.join(root, 'alarm-sound');
    for (let i = 0; i < OWN_COUNT; i += 1) expect(writeOwnSound(dir, MP3, `${i}.mp3`).ok).toBe(true);
    expect(writeOwnSound(dir, MP3, 'one more.mp3')).toEqual({ ok: false, error: 'full' });
  });

  it('is only audio, of a reasonable weight', () => {
    const dir = path.join(root, 'alarm-sound');
    expect(writeOwnSound(dir, 'data:image/png;base64,AAAA', 'x.png').ok).toBe(false);
    expect(writeOwnSound(dir, 'data:audio/mpeg;base64,', 'x.mp3').ok).toBe(false);
    expect(writeOwnSound(dir, 'not a sound', 'x').ok).toBe(false);
    expect(writeOwnSound(dir, `data:audio/mpeg;base64,${'A'.repeat(21_000_004)}`, 'x').ok).toBe(false);
    expect(fs.existsSync(dir)).toBe(false);
  });
});
