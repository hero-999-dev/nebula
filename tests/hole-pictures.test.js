// @vitest-environment node
/**
 * The pictures of a black hole's notes, held out of their text while it is
 * open (1.0.4). The owner: "with memory nearly full I notice that a black hole
 * passes on what I type visibly slower than a plain note". A sealed note keeps
 * its pictures written into it, and the window carried them all as text — so
 * each save went over megabytes. Now the window is given a short address for
 * each, the main process holds the pictures in memory, and the sealed file is
 * what it always was. How fast it types is measured in the built app.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlackHoles } from '../electron/black-holes.js';

const LIGHT = { name: 'scrypt', N: 1 << 10, r: 8, p: 1 };
const PIN = '482193';
const picture = (seed, kind = 'png') => `data:image/${kind};base64,${Buffer.from(`${seed}`.repeat(200)).toString('base64')}`;
const note = (id, content) => JSON.stringify({ id, title: 'T', content, createdAt: 1, updatedAt: 2 });
const HELD = /nebula-media:\/\/hole\/[\w-]+\/[\w-]+\/pic-[0-9a-f]{32}\.[a-z]{3,4}/g;

let root;
const holes = () => new BlackHoles({
  root: () => path.join(root, 'storage', 'blackholes'), kdf: LIGHT, now: () => 1_000_000,
  hello: async () => true, helloAvailable: async () => true,
  // The operating system's part, played by the test.
  canProtect: () => true,
  protect: (plain) => Buffer.from(plain).map((b) => b ^ 0x5a),
  unprotect: (box) => Buffer.from(box).map((b) => b ^ 0x5a),
});
const everyFile = (dir = root) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? everyFile(path.join(dir, e.name)) : [path.join(dir, e.name)]));

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-hole-pictures-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

/** A black hole with one note of two pictures (one of them twice), locked and opened again as the window opens it. */
async function opened() {
  const h = holes();
  const { hole } = await h.create({ name: 'Safe', pin: PIN });
  const whole = note('n1', `<p>words</p><img src="${picture('one')}"><img src="${picture('two', 'jpeg')}"><img src="${picture('one')}">`);
  expect(await h.writeAsync(hole.id, 'n1', whole)).toEqual({ ok: true });
  h.lock(hole.id);
  const res = await h.unlock(hole.id, { pin: PIN }, { holdPictures: true });
  expect(res.ok).toBe(true);
  return { h, hole, whole, given: res.notes[0] };
}

describe('the pictures of an open black hole', () => {
  it('the window is given the note with an address for each picture, and the words as they were', async () => {
    const { hole, whole, given } = await opened();
    expect(given).not.toContain('data:image/');
    expect(given.length).toBeLessThan(whole.length / 4);
    const named = given.match(HELD);
    expect(named).toHaveLength(3);
    expect(named[0]).toBe(named[2]);                                   // the same picture, the same address
    expect(named[0]).toMatch(new RegExp(`^nebula-media://hole/${hole.id}/n1/pic-[0-9a-f]{32}\\.png$`));
    expect(named[1]).toMatch(/\.jpg$/);
    expect(JSON.parse(given).content).toContain('<p>words</p>');
  });

  it('asked for the whole notes, it gives them whole as it always did', async () => {
    const { h, hole, whole } = await opened();
    expect((await h.unlock(hole.id, { pin: PIN })).notes).toEqual([whole]);
  });

  it('an address is its picture, for the note that shows it and for a copy', async () => {
    const { h, given } = await opened();
    const [png, jpg] = given.match(HELD);
    expect(h.picture(png)).toMatchObject({ mime: 'image/png' });
    expect(h.picture(png).bytes.equals(Buffer.from('one'.repeat(200)))).toBe(true);
    expect(h.picture(`${png}?v=2`).mime).toBe('image/png');
    expect(h.pictureDataUrl(png)).toBe(picture('one'));
    expect(h.pictureDataUrl(jpg)).toBe(picture('two', 'jpeg'));
    expect(h.picture('nebula-media://note/n1/aaaa.png')).toBeNull();
    expect(h.picture(png.replace(/pic-[0-9a-f]{4}/, 'pic-0000'))).toBeNull();
  });

  it('sealed again, the note is whole: what is on the disk never names a held picture', async () => {
    const { h, hole, whole, given } = await opened();
    const edited = given.replace('<p>words</p>', '<p>more words</p>');
    const back = h.withPictures(edited, null, hole.id);
    expect(back).toBe(whole.replace('<p>words</p>', '<p>more words</p>'));
    expect(await h.writeAsync(hole.id, 'n1', back)).toEqual({ ok: true });
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { pin: PIN })).notes).toEqual([back]);
  });

  it('locked, the pictures are gone from memory, and an address stays an address — nothing is dropped', async () => {
    const { h, hole, given } = await opened();
    const [png] = given.match(HELD);
    const bytes = h.picture(png).bytes;
    h.lock(hole.id);
    expect(bytes.every((b) => b === 0)).toBe(true);
    expect(h.picture(png)).toBeNull();
    expect(h.pictureDataUrl(png)).toBeNull();
    expect(h.withPictures(given)).toBe(given);
    // A closed black hole holds nothing.
    expect(h.holdPictures(hole.id, 'n1', `<img src="${picture('one')}">`)).toContain('data:image/png');
  });

  it('never on the disk in the clear', async () => {
    const { given } = await opened();
    const disk = everyFile().map((f) => fs.readFileSync(f).toString('latin1')).join('\n');
    expect(disk).not.toContain(Buffer.from('one'.repeat(200)).toString('base64').slice(0, 60));
    expect(disk).not.toContain(given.match(HELD)[0]);
    expect(everyFile().some((f) => /pic-/.test(path.basename(f)))).toBe(false);
  });

  it('a note taken from one open black hole into another takes its pictures along', async () => {
    const { h, hole, given } = await opened();
    const second = (await h.create({ name: 'Other', pin: PIN })).hole;
    const [png] = given.match(HELD);
    const sealedThere = h.withPictures(given, null, second.id);
    expect(sealedThere).toContain(picture('one'));
    h.lock(hole.id);
    // The window still names it by the first black hole: the second holds it now.
    expect(h.pictureDataUrl(png)).toBe(picture('one'));
    h.lock(second.id);
    expect(h.picture(png)).toBeNull();
  });

  it('the caller may say what stands in a picture’s place — a plain note’s file', async () => {
    const { h, hole, given } = await opened();
    const seen = [];
    const out = h.withPictures(given, (data, name, address) => { seen.push([data?.slice(0, 14), name, address]); return 'nebula-media://note/n9/file.png'; });
    expect(out).not.toMatch(HELD);
    expect(out.match(/nebula-media:\/\/note\/n9\/file\.png/g)).toHaveLength(3);
    expect(seen[0][0]).toBe('data:image/png');
    expect(seen[0][2]).toBe(given.match(HELD)[0]);
    h.lock(hole.id);
    // Locked: asked with nothing in hand, and what it answers still stands; no answer, the address stays.
    expect(h.withPictures(given, (data) => (data === null ? 'kept' : 'wrong'))).not.toMatch(HELD);
    expect(h.withPictures(given, () => null)).toBe(given);
  });

  it('a small picture (an icon in the words) is left in the text', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', pin: PIN });
    const small = `<img src="data:image/png;base64,${'A'.repeat(120)}">`;
    expect(h.holdPictures(hole.id, 'n1', small)).toBe(small);
  });
});
