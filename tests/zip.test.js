// @vitest-environment node
/**
 * A note's zip (1.0.3): written stored, read stored or deflated, and nothing
 * in it lands outside the folder it is unpacked into.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { writeZip, unzipTo, safeEntryPath } from '../electron/zip.js';

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-zip-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

/** A zip as another program writes one: every entry deflated, no UTF-8 flag on plain names. */
function deflatedZip(entries) {
  const locals = [];
  const heads = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name, 'utf8');
    const body = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(8, 10);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(n.length, 28);
    head.writeUInt32LE(offset, 42);
    locals.push(local, n, body);
    heads.push(head, n);
    offset += 30 + n.length + body.length;
  }
  const dir = Buffer.concat(heads);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

describe('a note’s zip', () => {
  it('holds a note and its files, and gives back the same bytes', async () => {
    const film = path.join(root, 'film.mp4');
    fs.writeFileSync(film, Buffer.alloc(300_000, 9));
    const zip = path.join(root, 'Trip.zip');
    await writeZip(zip, [
      { name: 'Trip.json', data: '{"id":"n1"}' },
      { name: 'Trip files/vid-a-12345678.mp4', file: film },
      { name: 'Trip files/Ödev.pdf', data: Buffer.from('%PDF-1.4') },
      { name: 'Trip files/empty.txt', data: '' },
    ]);
    const out = path.join(root, 'out');
    const written = await unzipTo(zip, out);
    expect(written.map((p) => path.relative(out, p).split(path.sep).join('/')).sort())
      .toEqual(['Trip files/empty.txt', 'Trip files/vid-a-12345678.mp4', 'Trip files/Ödev.pdf', 'Trip.json']);
    expect(fs.readFileSync(path.join(out, 'Trip.json'), 'utf8')).toBe('{"id":"n1"}');
    expect(fs.readFileSync(path.join(out, 'Trip files', 'vid-a-12345678.mp4')).equals(fs.readFileSync(film))).toBe(true);
    expect(fs.readFileSync(path.join(out, 'Trip files', 'Ödev.pdf'), 'utf8')).toBe('%PDF-1.4');
    expect(fs.statSync(path.join(out, 'Trip files', 'empty.txt')).size).toBe(0);
  });

  it('reads one zipped again by Windows or another program: deflated', async () => {
    const zip = path.join(root, 'again.zip');
    const text = 'x'.repeat(10_000);
    fs.writeFileSync(zip, deflatedZip([{ name: 'Trip.json', data: Buffer.from(text) }, { name: 'Trip files/a.pdf', data: Buffer.from('pdf') }]));
    const out = path.join(root, 'out');
    expect(await unzipTo(zip, out)).toHaveLength(2);
    expect(fs.readFileSync(path.join(out, 'Trip.json'), 'utf8')).toBe(text);
  });

  it('puts nothing outside its folder, and leaves out a file whose bytes were changed', async () => {
    const zip = path.join(root, 'bad.zip');
    const bytes = deflatedZip([
      { name: '../outside.txt', data: Buffer.from('no') },
      { name: 'C:/Windows/evil.txt', data: Buffer.from('no') },
      { name: 'ok.txt', data: Buffer.from('fine') },
    ]);
    fs.writeFileSync(zip, bytes);
    const out = path.join(root, 'out');
    const written = await unzipTo(zip, out);
    expect(written).toEqual([path.join(out, 'ok.txt')]);
    expect(fs.existsSync(path.join(root, 'outside.txt'))).toBe(false);
    expect(safeEntryPath(out, '/abs/x')).toBe(path.join(out, 'abs', 'x'));
    expect(safeEntryPath(out, 'a/../../x')).toBeNull();
    // A changed byte: the checksum no longer fits, the file is not kept.
    const stored = path.join(root, 'stored.zip');
    await writeZip(stored, [{ name: 'a.txt', data: 'abcdef' }]);
    const raw = fs.readFileSync(stored);
    raw[raw.indexOf('abcdef')] = 0x7a;
    fs.writeFileSync(stored, raw);
    expect(await unzipTo(stored, path.join(root, 'out2'))).toEqual([]);
    await expect(unzipTo(path.join(root, 'bad.zip.txt'), out)).rejects.toThrow();
  });
});
