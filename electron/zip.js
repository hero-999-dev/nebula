/**
 * A zip, written and read without holding its files in memory.
 *
 * A Nebula note exported with its videos and attached files goes out as one
 * zip: "json olarak export edince … zip olarak olmalı, içinde video ve pdfler
 * falan varsa" (the owner, 2026-11-02, after a note copied to another computer
 * came without the folder beside it). A video has no size limit in a note, so
 * a file is streamed in and out, never read whole, and ZIP64 takes over past
 * 4 GB. What is written is stored as it is (a video does not compress); what
 * is read may be stored or deflated, as Windows or another program zipped it.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;
const UTF8 = 0x0800;

/** The CRC-32 of a file, read once. */
async function crcOf(file) {
  let crc = 0;
  for await (const part of fs.createReadStream(file)) crc = zlib.crc32(part, crc);
  return crc;
}

/** The current DOS time and date a zip entry carries. */
function dosTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** A ZIP64 extra field holding the given 64-bit values, in the order the format wants them. */
function zip64Extra(values) {
  const b = Buffer.alloc(4 + values.length * 8);
  b.writeUInt16LE(0x0001, 0);
  b.writeUInt16LE(values.length * 8, 2);
  values.forEach((v, i) => b.writeBigUInt64LE(BigInt(v), 4 + i * 8));
  return b;
}

/**
 * Writes a zip of the given entries. Each is `{name, file}` (a path, streamed)
 * or `{name, data}` (a Buffer or string). Names use forward slashes.
 * @param {string} dest
 * @param {Array<{name: string, file?: string, data?: Buffer|string}>} entries
 */
export async function writeZip(dest, entries) {
  const out = fs.createWriteStream(dest);
  let offset = 0;
  const write = (buf) => new Promise((resolve, reject) => {
    offset += buf.length;
    out.write(buf, (err) => (err ? reject(err) : resolve()));
  });
  const central = [];
  const { time, day } = dosTime();
  try {
    for (const entry of entries) {
      const name = Buffer.from(String(entry.name), 'utf8');
      const data = entry.data === undefined ? null : Buffer.from(entry.data);
      const size = data ? data.length : (await fs.promises.stat(entry.file)).size;
      const crc = data ? zlib.crc32(data) : await crcOf(entry.file);
      const at = offset;
      const big = size >= MAX32;
      const extra = big ? zip64Extra([size, size]) : Buffer.alloc(0);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(big ? 45 : 20, 4);
      local.writeUInt16LE(UTF8, 6);
      local.writeUInt16LE(0, 8); // stored
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(day, 12);
      local.writeUInt32LE(crc >>> 0, 14);
      local.writeUInt32LE(big ? MAX32 : size, 18);
      local.writeUInt32LE(big ? MAX32 : size, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(extra.length, 28);
      await write(Buffer.concat([local, name, extra]));
      if (data) await write(data);
      else for await (const part of fs.createReadStream(entry.file)) await write(part);
      central.push({ name, crc, size, at });
    }
    const start = offset;
    for (const { name, crc, size, at } of central) {
      const wide = [...(size >= MAX32 ? [size, size] : []), ...(at >= MAX32 ? [at] : [])];
      const extra = wide.length ? zip64Extra(wide) : Buffer.alloc(0);
      const head = Buffer.alloc(46);
      head.writeUInt32LE(0x02014b50, 0);
      head.writeUInt16LE(45, 4);
      head.writeUInt16LE(wide.length ? 45 : 20, 6);
      head.writeUInt16LE(UTF8, 8);
      head.writeUInt16LE(0, 10);
      head.writeUInt16LE(time, 12);
      head.writeUInt16LE(day, 14);
      head.writeUInt32LE(crc >>> 0, 16);
      head.writeUInt32LE(size >= MAX32 ? MAX32 : size, 20);
      head.writeUInt32LE(size >= MAX32 ? MAX32 : size, 24);
      head.writeUInt16LE(name.length, 28);
      head.writeUInt16LE(extra.length, 30);
      head.writeUInt32LE(at >= MAX32 ? MAX32 : at, 42);
      await write(Buffer.concat([head, name, extra]));
    }
    const length = offset - start;
    const wide = central.length >= MAX16 || start >= MAX32 || length >= MAX32;
    if (wide) {
      const record = Buffer.alloc(56);
      const recordAt = offset;
      record.writeUInt32LE(0x06064b50, 0);
      record.writeBigUInt64LE(44n, 4);
      record.writeUInt16LE(45, 12);
      record.writeUInt16LE(45, 14);
      record.writeBigUInt64LE(BigInt(central.length), 24);
      record.writeBigUInt64LE(BigInt(central.length), 32);
      record.writeBigUInt64LE(BigInt(length), 40);
      record.writeBigUInt64LE(BigInt(start), 48);
      const locator = Buffer.alloc(20);
      locator.writeUInt32LE(0x07064b50, 0);
      locator.writeBigUInt64LE(BigInt(recordAt), 8);
      locator.writeUInt32LE(1, 16);
      await write(Buffer.concat([record, locator]));
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Math.min(central.length, MAX16), 8);
    end.writeUInt16LE(Math.min(central.length, MAX16), 10);
    end.writeUInt32LE(wide ? MAX32 : length, 12);
    end.writeUInt32LE(wide ? MAX32 : start, 16);
    await write(end);
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    await fs.promises.rm(dest, { force: true }).catch(() => {});
    throw err;
  }
}

/** Reads `length` bytes at `position` of an open file. */
async function readAt(handle, position, length) {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/**
 * The entries of a zip: `{name, method, crc, compressed, size, at}`, `at`
 * being where its local header starts. Throws on a file that is no zip.
 */
async function listZip(handle) {
  const { size: total } = await handle.stat();
  const tail = await readAt(handle, Math.max(0, total - 65_557), Math.min(total, 65_557));
  const endAt = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('not a zip');
  let count = tail.readUInt16LE(endAt + 10);
  let length = tail.readUInt32LE(endAt + 12);
  let start = tail.readUInt32LE(endAt + 16);
  const locatorAt = endAt - 20;
  if (locatorAt >= 0 && tail.readUInt32LE(locatorAt) === 0x07064b50) {
    const record = await readAt(handle, Number(tail.readBigUInt64LE(locatorAt + 8)), 56);
    if (record.readUInt32LE(0) === 0x06064b50) {
      count = Number(record.readBigUInt64LE(32));
      length = Number(record.readBigUInt64LE(40));
      start = Number(record.readBigUInt64LE(48));
    }
  }
  const dir = await readAt(handle, start, length);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= dir.length && dir.readUInt32LE(p) === 0x02014b50; i += 1) {
    const flags = dir.readUInt16LE(p + 8);
    const nameLength = dir.readUInt16LE(p + 28);
    const extraLength = dir.readUInt16LE(p + 30);
    const commentLength = dir.readUInt16LE(p + 32);
    const name = dir.subarray(p + 46, p + 46 + nameLength).toString(flags & UTF8 ? 'utf8' : 'latin1');
    let compressed = dir.readUInt32LE(p + 20);
    let size = dir.readUInt32LE(p + 24);
    let at = dir.readUInt32LE(p + 42);
    const extra = dir.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength);
    for (let q = 0; q + 4 <= extra.length;) {
      const id = extra.readUInt16LE(q);
      const len = extra.readUInt16LE(q + 2);
      if (id === 0x0001) {
        let r = q + 4;
        const next = () => { const v = Number(extra.readBigUInt64LE(r)); r += 8; return v; };
        if (size === MAX32) size = next();
        if (compressed === MAX32) compressed = next();
        if (at === MAX32) at = next();
      }
      q += 4 + len;
    }
    entries.push({ name, flags, method: dir.readUInt16LE(p + 10), crc: dir.readUInt32LE(p + 16), compressed, size, at });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * A name from a zip as a path under `root`, or null: absolute names, drive
 * letters and `..` would put a file anywhere on the disk (a "zip slip").
 */
export function safeEntryPath(root, name) {
  const parts = String(name).split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some((s) => s === '.' || s === '..' || /[:\0]/.test(s))) return null;
  const full = path.resolve(root, ...parts);
  return full.startsWith(path.resolve(root) + path.sep) ? full : null;
}

/**
 * Unpacks a zip into `root`, file by file, streamed. Folders are made as
 * needed; an entry that is encrypted, of an unknown method, outside `root` or
 * whose bytes do not match its checksum is left out.
 * @returns {Promise<string[]>} the paths written
 */
export async function unzipTo(file, root, { maxEntries = 5000 } = {}) {
  const handle = await fs.promises.open(file, 'r');
  const written = [];
  try {
    const entries = (await listZip(handle)).slice(0, maxEntries);
    for (const entry of entries) {
      if (entry.name.endsWith('/') || entry.flags & 1 || ![0, 8].includes(entry.method)) continue;
      const dest = safeEntryPath(root, entry.name);
      if (!dest) continue;
      const head = await readAt(handle, entry.at, 30);
      if (head.readUInt32LE(0) !== 0x04034b50) continue;
      const from = entry.at + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      let crc = 0;
      const check = new Transform({ transform(part, _enc, done) { crc = zlib.crc32(part, crc); done(null, part); } });
      const raw = entry.compressed
        ? handle.createReadStream({ autoClose: false, start: from, end: from + entry.compressed - 1 })
        : null;
      try {
        if (raw) await pipeline(raw, ...(entry.method === 8 ? [zlib.createInflateRaw()] : []), check, fs.createWriteStream(dest));
        else await fs.promises.writeFile(dest, Buffer.alloc(0));
      } catch {
        await fs.promises.rm(dest, { force: true });
        continue;
      }
      if ((crc >>> 0) !== (entry.crc >>> 0)) { await fs.promises.rm(dest, { force: true }); continue; }
      written.push(dest);
    }
  } finally {
    await handle.close();
  }
  return written;
}
