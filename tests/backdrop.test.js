// @vitest-environment node
/**
 * The picture behind the note (1.0.3), in the main process (electron/backdrop.js):
 * only a JPEG of a reasonable weight is kept; every photo chosen stays until its
 * × deletes it, and the last one deleted leaves nothing.
 * Real files in the system's temp directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jpegOf, readBackdrop, addPhoto, wearPhoto, removePhoto, listPhotos, wornPhoto, isPhotoId, PHOTOS_MAX } from '../electron/backdrop.js';
import { fitSide, cleanMix, stopsOf, colorAt, paletteOf, MIX_STYLES, MIX_MAX, DEFAULT_MIX, smoothFor } from '../src/js/backdrop.js';

const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64')}`;
let root;
let dir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-backdrop-'));
  dir = path.join(root, 'backdrop');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the picture kept', () => {
  it('takes only a JPEG', () => {
    expect(jpegOf(JPEG)).not.toBeNull();
    expect(jpegOf(null)).toBeNull();
    expect(jpegOf('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
    expect(jpegOf(`data:image/jpeg;base64,${Buffer.from('not a picture').toString('base64')}`)).toBeNull();
    expect(jpegOf(`data:image/jpeg;base64,${Buffer.alloc(12_000_100, 0xff).toString('base64')}`)).toBeNull();
    expect(addPhoto(dir, 'nonsense')).toEqual({ ok: false, error: 'picture' });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('comes back as it went in, once worn; taken off it stays kept', () => {
    expect(readBackdrop(dir)).toBeNull();
    const { ok, id } = addPhoto(dir, JPEG);
    expect(ok).toBe(true);
    expect(isPhotoId(id)).toBe(true);
    expect(readBackdrop(dir)).toBeNull();
    expect(wearPhoto(dir, id).ok).toBe(true);
    expect(readBackdrop(dir)).toBe(JPEG);
    expect(wearPhoto(dir, null).ok).toBe(true);
    expect(readBackdrop(dir)).toBeNull();
    expect(listPhotos(dir)).toEqual([{ id, picture: JPEG }]);
    expect(wearPhoto(dir, 'p0000000000000-zzzz').ok).toBe(false);
    expect(wearPhoto(dir, '../evil').ok).toBe(false);
  });

  it('keeps each photo until its × deletes it; the last one leaves nothing', () => {
    const a = addPhoto(dir, JPEG).id;
    const b = addPhoto(dir, JPEG).id;
    wearPhoto(dir, b);
    expect(listPhotos(dir).map((p) => p.id)).toEqual([a, b].sort());
    expect(removePhoto(dir, a)).toEqual({ ok: true, worn: false });
    expect(wornPhoto(dir)).toBe(b);
    expect(removePhoto(dir, b)).toEqual({ ok: true, worn: true });
    expect(fs.existsSync(dir)).toBe(false);
    expect(removePhoto(dir, '../x').ok).toBe(false);
  });

  it('keeps no more than it may', () => {
    for (let i = 0; i < PHOTOS_MAX; i++) expect(addPhoto(dir, JPEG).ok).toBe(true);
    expect(addPhoto(dir, JPEG)).toEqual({ ok: false, error: 'full' });
  });

  it('takes the one picture an earlier build kept as the first photo, worn', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'picture.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    expect(readBackdrop(dir)).toBe(JPEG);
    expect(fs.existsSync(path.join(dir, 'picture.jpg'))).toBe(false);
    expect(listPhotos(dir)).toHaveLength(1);
  });
});

describe('the size it is kept at', () => {
  it('is its own when small, its long side brought down when large', () => {
    expect(fitSide(800, 600)).toEqual([800, 600]);
    expect(fitSide(5120, 2880)).toEqual([2560, 1440]);
    expect(fitSide(1000, 8000, 2000)).toEqual([250, 2000]);
  });
});

describe('a background made of colours (1.0.3)', () => {
  it('keeps two to five colours and a style it knows', () => {
    expect(cleanMix(null)).toEqual({ ...DEFAULT_MIX, colors: [...DEFAULT_MIX.colors] });
    expect(cleanMix({ style: 'waves', colors: ['#AABBCC', '#000000'], on: true })).toEqual({ style: 'waves', colors: ['#aabbcc', '#000000'], on: true });
    expect(cleanMix({ style: 'nope', colors: ['#111111'] })).toEqual({ style: DEFAULT_MIX.style, colors: DEFAULT_MIX.colors, on: false });
    expect(cleanMix({ colors: ['#111111', 'red', '#22222', '#333333'] }).colors).toEqual(['#111111', '#333333']);
    expect(cleanMix({ colors: Array(9).fill('#123456') }).colors).toHaveLength(MIX_MAX);
    expect(MIX_STYLES.length).toBe(15);
    expect(MIX_STYLES.slice(8, 12).map((s) => s.id)).toEqual(['aurora', 'rings', 'mesh', 'facets']);
    expect(MIX_STYLES.slice(-3).map((s) => s.id)).toEqual(['horizon', 'dunes', 'bubbles']);
    for (const style of ['horizon', 'dunes', 'bubbles']) expect(cleanMix({ style }).style).toBe(style);
  });

  it('softens the picture on a screen outside the laptop, or as Settings says', () => {
    expect(smoothFor('auto', { internal: false })).toBe(true);
    expect(smoothFor('auto', { internal: true })).toBe(false);
    expect(smoothFor('auto', null)).toBe(false);
    expect(smoothFor('on', { internal: true })).toBe(true);
    expect(smoothFor('on', null)).toBe(true);
    expect(smoothFor('off', { internal: false })).toBe(false);
  });

  it('spreads the colours evenly from one end to the other', () => {
    expect(stopsOf(['#000000', '#ffffff'])).toEqual([[0, '#000000'], [1, '#ffffff']]);
    expect(stopsOf(['#a', '#b', '#c']).map(([at]) => at)).toEqual([0, 0.5, 1]);
  });

  it('finds the colour at any point along them', () => {
    expect(colorAt(['#000000', '#ffffff'], 0)).toBe('#000000');
    expect(colorAt(['#000000', '#ffffff'], 1)).toBe('#ffffff');
    expect(colorAt(['#000000', '#ffffff'], 0.5)).toBe('#808080');
    expect(colorAt(['#ff0000', '#00ff00', '#0000ff'], 0.5)).toBe('#00ff00');
    expect(colorAt(['#ff0000', '#00ff00'], 7)).toBe('#00ff00');
  });
});

describe('the colours of a photo (1.0.3)', () => {
  const pixels = (...runs) => new Uint8ClampedArray(runs.flatMap(([rgba, n]) => Array(n).fill(rgba).flat()));
  it('gives the colours it is mostly made of, the most of it first', () => {
    const out = paletteOf(pixels([[10, 20, 200, 255], 50], [[250, 250, 250, 255], 30], [[200, 30, 30, 255], 10]));
    expect(out).toEqual(['#0a14c8', '#fafafa', '#c81e1e']);
  });
  it('leaves out colours too close to one taken, and the see-through', () => {
    const out = paletteOf(pixels([[100, 100, 100, 255], 20], [[128, 100, 100, 255], 15], [[0, 255, 0, 0], 40]));
    expect(out).toEqual(['#646464']);
  });
  it('gives no more than it is asked for', () => {
    const many = pixels(...Array.from({ length: 10 }, (_, i) => [[i * 25, 255 - i * 25, (i * 80) % 256, 255], 10 - i]));
    expect(paletteOf(many, 3)).toHaveLength(3);
  });
});
