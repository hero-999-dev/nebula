/**
 * Black holes: notes kept encrypted (0.9.4).
 *
 * The owner's Ideas note: "a black hole section beside the folders — notes
 * kept wholly inside it, encrypted to the standards of the trade, stored in a
 * folder of their own inside Nebula; they are for notes that must be safe, and
 * opening one in the app asks for a password: a 4-digit PIN, set when the
 * black hole is made — or a passkey (fingerprint, the computer's PIN)."
 *
 *   storage/blackholes/<hole>/hole.json    its name, how it is locked, its key — wrapped
 *   storage/blackholes/<hole>/<note>.bh    one note, encrypted whole: title, words, pictures
 *
 * Each black hole has a key of its own, 256 random bits, and every note in it
 * is sealed with AES-256-GCM under that key (a fresh nonce each time; the
 * hole's and the note's ids are bound in, so a file moved to another place
 * does not open). Nothing of a note is written anywhere else: its pictures
 * stay inside it, not in a folder beside it (note-media.js is for ordinary
 * notes), and it never reaches the ordinary notes' folder.
 *
 * The key itself is kept only wrapped:
 *
 *   – by the PIN: scrypt (N = 2^16) turns the six digits and a salt into the
 *     key that wraps it. Six digits are a million guesses, which no key
 *     derivation can make many; so the wrapped key is wrapped once more by the
 *     operating system for this user (Electron safeStorage: DPAPI on Windows,
 *     the Keychain on a Mac). Copied off this computer — a backup, a flash
 *     drive — the files cannot be guessed at.
 *   – beside the PIN, if the owner adds one, by a passkey (Windows Hello /
 *     Touch ID): a second copy of the key, wrapped by the operating system
 *     alone and handed over only after it has said yes. Then either opens the
 *     black hole. The PIN is the lock, always (the owner, 0.9.4: "a 6-digit
 *     PIN compulsory, the passkey optional — as the app's own lock"); a black
 *     hole of the first builds that is opened by a passkey alone still opens,
 *     and takes a PIN when one is set for it.
 *   – and by a recovery key, made once and shown once: 160 random bits as 32
 *     letters and digits. It opens the black hole on another computer, after
 *     Windows is installed again, or when the PIN is forgotten.
 *
 * After five wrong PINs each further try has to wait, longer every time.
 *
 * Deleting a black hole, and taking a note out of one, ask for its answer
 * once more (`delete`, `prove`): the PIN, the passkey where one was added, or
 * the recovery key — whoever only found the app open does neither.
 *
 * While a black hole is open its key is in this process's memory, and its
 * notes are in the window's; locking it, or quitting, lets go of both.
 *
 * A video is too large to be sealed into its note, so it is sealed beside it:
 *
 *   storage/blackholes/<hole>/<note>~vid-….mp4.bhv
 *   storage/blackholes/<hole>/<note>~att-….pdf.bhv   a file attached to the note, sealed the same way
 *
 * "NBV1", the size of a piece (1 MiB) and the video's length, then the video
 * in pieces, each sealed by itself (its own nonce; the hole, the note, the
 * file, the piece's number and the whole length bound in — pieces cannot be
 * swapped, dropped or cut off unnoticed). The player asks for parts of a
 * video; only the pieces it asks for are opened, and never onto the disk.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { shred, VIDEO_EXTENSIONS, attachmentExt } from './note-media.js';

const ID = /^[\w-]{1,120}$/;
const MAGIC = Buffer.from('NBH1');
/** A sealed video: its magic, the size of a piece, and what a piece costs on the disk beyond its bytes. */
const VIDEO_MAGIC = Buffer.from('NBV1');
export const VIDEO_PIECE = 1024 * 1024;
const PIECE_COST = 28;                       // nonce 12 + tag 16
const VIDEO_HEAD = 16;                       // magic 4 + piece size 4 + length 8
/** A video's name in a note: as the vault names one, and of a kind a note can hold — or an attached file's, of any kind (note-media.js). */
const VIDEO_NAME = new RegExp(`^(?:vid-[a-z0-9]+-[0-9a-f]{8}\\.(${VIDEO_EXTENSIONS.join('|')})|att-[a-z0-9]+-[0-9a-f]{8}\\.[a-z0-9]{2,5})$`);
const sealedVideo = (noteId, name) => `${noteId}~${name}.bhv`;
export const KDF = { name: 'scrypt', N: 1 << 16, r: 8, p: 1 };
/**
 * A PIN is six digits (the owner, on the first build: "six, not four"). A
 * black hole made with four keeps its four until its PIN is changed: the
 * length is on the black hole (`digits`), four where nothing is written.
 */
export const PIN_DIGITS = 6;
export const PIN = /^\d{6}$/;
const pinDigits = (meta) => (meta?.lock === 'pin' ? (Number(meta.digits) === PIN_DIGITS ? PIN_DIGITS : 4) : 0);
const isPinOf = (meta, pin) => new RegExp(`^\\d{${pinDigits(meta)}}$`).test(String(pin ?? ''));
const NAME_MAX = 60;
/** Wrong PINs before a try has to wait, and how the wait grows. */
export const FREE_TRIES = 5;
export function waitAfter(fails) {
  if (fails < FREE_TRIES) return 0;
  return Math.min(15 * 60_000, 30_000 * 2 ** (fails - FREE_TRIES));
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** 160 random bits as 32 letters and digits, in fours. */
export function newRecoveryKey(bytes = crypto.randomBytes(20)) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{4}/g).join('-');
}
/** As typed: any case, with or without the dashes and spaces. */
export const cleanRecoveryKey = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '');
export const cleanHoleName = (raw) => Array.from(String(raw ?? '').replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join(''); // characters, not UTF-16 units: never half an emoji (hunt B24)
/**
 * A hint for the PIN (the owner: "an option to set a hint"). It is kept in the
 * clear beside the black hole's name and shown to whoever is asked for the PIN
 * — it is a reminder for its owner, not a secret — so one that gives the PIN
 * away is not kept.
 */
const HINT_MAX = 80;
export const cleanHint = (raw) => Array.from(String(raw ?? '').replace(/\s+/g, ' ').trim()).slice(0, HINT_MAX).join(''); // characters, not UTF-16 units: never half an emoji (hunt B24)
const hintTells = (hint, pin) => !!pin && String(hint).replace(/\D/g, '').includes(String(pin));

function derive(secret, salt, kdf = KDF) {
  return crypto.scryptSync(Buffer.from(String(secret), 'utf8'), salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 512 * 1024 * 1024 });
}

/** nonce (12) | ciphertext | tag (16) */
function seal(key, plain, bound = '') {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(bound, 'utf8'));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, body, cipher.getAuthTag()]);
}

/** @throws when the key is wrong or a byte was changed */
function unseal(key, box, bound = '') {
  if (box.length < 28) throw new Error('too short');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, box.subarray(0, 12));
  decipher.setAAD(Buffer.from(bound, 'utf8'));
  decipher.setAuthTag(box.subarray(box.length - 16));
  return Buffer.concat([decipher.update(box.subarray(12, box.length - 16)), decipher.final()]);
}

function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

const b64 = (buf) => buf.toString('base64');
const un64 = (text) => Buffer.from(String(text ?? ''), 'base64');

export class BlackHoles {
  /** id → the hole's key, while it is open */
  #keys = new Map();

  /**
   * @param {object} deps
   * @param {() => string} deps.root storage/blackholes
   * @param {(plain: Buffer) => Buffer} [deps.protect] wrap for this user of this computer (safeStorage)
   * @param {(box: Buffer) => Buffer} [deps.unprotect]
   * @param {() => boolean} [deps.canProtect]
   * @param {(reason: string) => Promise<boolean>} [deps.hello] the operating system asks who is there
   * @param {() => Promise<boolean>} [deps.helloAvailable]
   * @param {() => number} [deps.now]
   * @param {object} [deps.kdf] lighter in tests
   * @param {number} [deps.digits] how long a new PIN is (tests make a black hole of the first build with four)
   * @param {boolean} [deps.passkeyOnly] let `create` make a black hole of the first builds, opened by a passkey alone (tests)
   */
  constructor({ root, protect, unprotect, canProtect = () => false, hello, helloAvailable = async () => false, now = Date.now, kdf = KDF, digits = PIN_DIGITS, passkeyOnly = false }) {
    this.root = root;
    this.protect = protect;
    this.unprotect = unprotect;
    this.canProtect = canProtect;
    this.hello = hello;
    this.helloAvailable = helloAvailable;
    this.now = now;
    this.kdf = kdf;
    this.digits = digits;
    this.passkeyOnly = passkeyOnly;
  }

  /** A PIN as a new one must be. */
  #newPin(pin) { return new RegExp(`^\\d{${this.digits}}$`).test(String(pin ?? '')); }

  #dir(id) { return path.join(this.root(), id); }
  #metaFile(id) { return path.join(this.#dir(id), 'hole.json'); }

  #meta(id) {
    if (!ID.test(String(id))) return null;
    try {
      const meta = JSON.parse(fs.readFileSync(this.#metaFile(id), 'utf8'));
      return meta?.id === id && meta.key && meta.recovery ? meta : null;
    } catch { return null; }
  }

  #saveMeta(meta) {
    fs.mkdirSync(this.#dir(meta.id), { recursive: true });
    writeAtomic(this.#metaFile(meta.id), JSON.stringify(meta, null, 2));
  }

  #noteFiles(id) {
    try { return fs.readdirSync(this.#dir(id)).filter((f) => f.endsWith('.bh') && ID.test(f.slice(0, -3))); } catch { return []; }
  }

  #describe(meta) {
    const fails = meta.fails?.count ?? 0;
    const wait = Math.max(0, (meta.fails?.at ?? 0) + waitAfter(fails) - this.now());
    return {
      id: meta.id, name: meta.name, createdAt: meta.createdAt, lock: meta.lock, digits: pinDigits(meta),
      // What opens it: its PIN (always, but for one of the first builds), and a passkey where one was added.
      pin: meta.lock === 'pin', passkey: meta.lock === 'hello' || !!meta.passkey?.box,
      hint: meta.lock === 'pin' ? cleanHint(meta.hint) : '',
      notes: this.#noteFiles(meta.id).length, open: this.#keys.has(meta.id), waitMs: wait,
      trashedAt: meta.trashedAt ?? 0,
    };
  }

  /** Every black hole of the vault: its name and whether it is open — never anything of its notes. */
  list() {
    let names;
    try { names = fs.readdirSync(this.root()); } catch { return []; }
    return names.map((id) => this.#meta(id)).filter(Boolean)
      .sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id))
      .map((meta) => this.#describe(meta));
  }

  /**
   * A new black hole, open from the start: locked by a 6-digit PIN, and — with
   * `passkey` — by a passkey beside it. (`lock: 'hello'` makes one of the
   * first builds, opened by a passkey alone; only where `passkeyOnly` allows.)
   * @param {{name: string, pin: string, hint?: string, passkey?: boolean, lock?: 'pin'|'hello'}} how
   * @returns {Promise<{ok: boolean, hole?: object, recoveryKey?: string, error?: string}>}
   */
  async create({ name, lock = 'pin', pin, hint, passkey = false } = {}) {
    const clean = cleanHoleName(name);
    if (!clean) return { ok: false, error: 'name' };
    if (lock !== 'pin' && lock !== 'hello') return { ok: false, error: 'lock' };
    // The PIN is the lock, always: a passkey alone makes no black hole.
    if (lock === 'hello' && !this.passkeyOnly) return { ok: false, error: 'pin' };
    if (lock === 'pin' && !this.#newPin(pin)) return { ok: false, error: 'pin' };
    const reminder = lock === 'pin' ? cleanHint(hint) : '';
    if (hintTells(reminder, pin)) return { ok: false, error: 'hint' };
    const also = lock === 'pin' && passkey === true;
    if (lock === 'hello' || also) {
      if (!this.canProtect() || !(await this.helloAvailable())) return { ok: false, error: 'hello-unavailable' };
      if (!(await this.hello(clean))) return { ok: false, error: 'hello-refused' };
    }
    const id = `bh-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const key = crypto.randomBytes(32);
    const recoveryKey = newRecoveryKey();
    const rsalt = crypto.randomBytes(16);
    const meta = {
      v: 1, id, name: clean, createdAt: this.now(), lock, ...(lock === 'pin' ? { digits: this.digits } : {}), ...(reminder ? { hint: reminder } : {}),
      cipher: 'aes-256-gcm', kdf: { ...this.kdf },
      key: this.#wrap(id, lock, key, pin),
      ...(also ? { passkey: { box: b64(this.protect(key)) } } : {}),
      recovery: { salt: b64(rsalt), box: b64(seal(derive(cleanRecoveryKey(recoveryKey), rsalt, this.kdf), key, `${id}/recovery`)) },
    };
    this.#saveMeta(meta);
    this.#keys.set(id, key);
    return { ok: true, hole: this.#describe(meta), recoveryKey };
  }

  /** The hole's key wrapped for this computer: by the PIN and the operating system, or by the operating system alone. */
  #wrap(id, lock, key, pin) {
    const os = this.canProtect();
    if (lock === 'hello') return { os: true, box: b64(this.protect(key)) };
    const salt = crypto.randomBytes(16);
    const inner = seal(derive(pin, salt, this.kdf), key, `${id}/pin`);
    return { os, salt: b64(salt), box: b64(os ? this.protect(inner) : inner) };
  }

  #fail(meta) {
    meta.fails = { count: (meta.fails?.count ?? 0) + 1, at: this.now() };
    this.#saveMeta(meta);
    return { ok: false, error: 'wrong', triesLeft: Math.max(0, FREE_TRIES - meta.fails.count), waitMs: waitAfter(meta.fails.count) };
  }

  /**
   * The black hole's key, for the right answer: its recovery key; the passkey,
   * where the black hole has one (or is one of the first builds, opened by a
   * passkey alone); its PIN. Counts a wrong PIN or key; a passkey refused is
   * no guess. Nothing of the black hole is changed here but that count.
   * @returns {Promise<{ok: true, key: Buffer, by: 'recovery'|'hello'|'pin'} | {ok: false, error: string, waitMs?: number, triesLeft?: number}>}
   */
  async #answer(meta, { pin, recovery, hello } = {}) {
    const id = meta.id;
    const wait = (meta.fails?.at ?? 0) + waitAfter(meta.fails?.count ?? 0) - this.now();
    if (wait > 0) return { ok: false, error: 'wait', waitMs: wait };
    if (recovery !== undefined) {
      const typed = cleanRecoveryKey(recovery);
      if (typed.length !== 32) return this.#fail(meta);
      try { return { ok: true, by: 'recovery', key: unseal(derive(typed, un64(meta.recovery.salt), meta.kdf), un64(meta.recovery.box), `${id}/recovery`) }; } catch { return this.#fail(meta); }
    }
    if (hello || meta.lock === 'hello') {
      if (!hello) return { ok: false, error: 'hello' };
      const kept = meta.lock === 'hello' ? meta.key.box : meta.passkey?.box;
      if (!kept) return { ok: false, error: 'hello' };
      let box;
      try { box = this.unprotect(un64(kept)); } catch { return { ok: false, error: 'other-computer' }; }
      if (!(await this.helloAvailable())) return { ok: false, error: 'hello-unavailable' };
      if (!(await this.hello(meta.name))) return { ok: false, error: 'hello-refused' };
      return { ok: true, by: 'hello', key: box };
    }
    if (!isPinOf(meta, pin)) return { ok: false, error: 'pin' };
    let inner = un64(meta.key.box);
    if (meta.key.os) {
      try { inner = this.unprotect(inner); } catch { return { ok: false, error: 'other-computer' }; }
    }
    try { return { ok: true, by: 'pin', key: unseal(derive(pin, un64(meta.key.salt), meta.kdf), inner, `${id}/pin`) }; } catch { return this.#fail(meta); }
  }

  /**
   * Is this the black hole's answer? Asked before a note is taken out of it
   * (and by `delete`): the black hole may be open or shut, in the list or in
   * the Trash, and is left exactly as it was.
   * @param {string} id
   * @param {{pin?: string, hello?: boolean, recovery?: string}} by
   * @returns {Promise<{ok: boolean, error?: string, waitMs?: number, triesLeft?: number}>}
   */
  async prove(id, by = {}) {
    const meta = this.#meta(id);
    if (!meta) return { ok: false, error: 'missing' };
    const res = await this.#answer(meta, by);
    if (!res.ok) return res;
    const good = res.key.length === 32;
    res.key.fill(0);
    if (!good) return { ok: false, error: 'damaged' };
    if (meta.fails) { delete meta.fails; this.#saveMeta(meta); }
    return { ok: true };
  }

  /**
   * Open a black hole: by its PIN, by the passkey where it has one, or by its
   * recovery key (with a new PIN for a PIN one — it is wrapped for this
   * computer again).
   * @param {string} id
   * @param {{pin?: string, hello?: boolean, recovery?: string}} by
   * @returns {Promise<{ok: boolean, notes?: string[], damaged?: number, error?: string, waitMs?: number, triesLeft?: number}>}
   */
  async unlock(id, { pin, recovery, hello } = {}) {
    const meta = this.#meta(id);
    if (!meta) return { ok: false, error: 'missing' };
    if (meta.trashedAt) return { ok: false, error: 'trashed' };
    let key = this.#keys.get(id) ?? null;
    if (!key) {
      // A recovery key opens a PIN black hole only together with the new PIN it is to have.
      if (recovery !== undefined && meta.lock === 'pin' && cleanRecoveryKey(recovery).length === 32 && !this.#newPin(pin)
        && (meta.fails?.at ?? 0) + waitAfter(meta.fails?.count ?? 0) - this.now() <= 0) return { ok: false, error: 'pin' };
      const res = await this.#answer(meta, { pin, recovery, hello });
      if (!res.ok) return res;
      key = res.key;
      if (res.by === 'recovery') {
        // Wrapped for this computer again; a Hello one only where the system can keep it.
        if (meta.lock === 'hello' && !this.canProtect()) return { ok: false, error: 'hello-unavailable' };
        meta.key = this.#wrap(id, meta.lock, key, pin);
        if (meta.lock === 'pin') meta.digits = this.digits;
        // A passkey's copy of the key was wrapped for the computer it was added on: it is added again here, if wanted.
        delete meta.passkey;
      }
      if (key.length !== 32) return { ok: false, error: 'damaged' };
      if (meta.fails || res.by === 'recovery') { delete meta.fails; this.#saveMeta(meta); }
      this.#keys.set(id, key);
    }
    const notes = [];
    let damaged = 0;
    for (const file of this.#noteFiles(id)) {
      try {
        const bytes = fs.readFileSync(path.join(this.#dir(id), file));
        if (!bytes.subarray(0, 4).equals(MAGIC)) throw new Error('not a note');
        notes.push(unseal(key, bytes.subarray(4), `${id}/${file.slice(0, -3)}`).toString('utf8'));
      } catch { damaged += 1; }
    }
    // A video taken out of a note since the black hole was last opened goes now —
    // and `swept` names it for the caller, who takes it out of the backups too.
    const swept = this.#sweepVideos(id, notes, damaged);
    return { ok: true, notes, damaged, ...(swept.length ? { swept } : {}) };
  }

  isOpen(id) { return this.#keys.has(id); }

  /** Let go of the key. The files stay as they are: sealed. */
  lock(id) {
    const key = this.#keys.get(id);
    if (key) key.fill(0);
    return this.#keys.delete(id);
  }

  lockAll() {
    for (const id of [...this.#keys.keys()]) this.lock(id);
  }

  /** One note sealed into an open black hole. */
  write(id, noteId, json) {
    const key = this.#keys.get(id);
    if (!key) return { ok: false, error: 'locked' };
    if (!ID.test(String(noteId)) || !this.#meta(id)) return { ok: false, error: 'missing' };
    writeAtomic(path.join(this.#dir(id), `${noteId}.bh`), Buffer.concat([MAGIC, seal(key, Buffer.from(String(json), 'utf8'), `${id}/${noteId}`)]));
    return { ok: true };
  }

  /** One note out of a black hole, for good — its videos with it. */
  remove(id, noteId) {
    if (!ID.test(String(id)) || !ID.test(String(noteId))) return { ok: false, error: 'missing' };
    shred(path.join(this.#dir(id), `${noteId}.bh`));
    for (const file of this.#videoFiles(id)) if (file.startsWith(`${noteId}~`)) shred(path.join(this.#dir(id), file));
    return { ok: true };
  }

  #videoFiles(id) {
    try { return fs.readdirSync(this.#dir(id)).filter((f) => f.endsWith('.bhv')); } catch { return []; }
  }

  /** The address a note shows a sealed video from. */
  static videoUrl(id, noteId, name) { return `nebula-media://hole/${id}/${noteId}/${name}`; }

  /**
   * A video file sealed into an open black hole, for one of its notes: read and
   * written a piece at a time, so its size is no matter.
   * @param {string} id @param {string} noteId @param {string} source the file to copy in
   * @param {string} [keepName] the name it has already (a note moved in with its videos)
   * @returns {Promise<{ok: boolean, url?: string, name?: string, file?: string, error?: string}>}
   */
  async addVideo(id, noteId, source, keepName) {
    const key = this.#keys.get(id);
    if (!key) return { ok: false, error: 'locked' };
    if (!ID.test(String(noteId)) || !this.#meta(id)) return { ok: false, error: 'missing' };
    const from = String(source ?? '');
    const ext = from.slice(from.lastIndexOf('.') + 1).toLowerCase();
    const name = keepName ?? `vid-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    if (!VIDEO_NAME.test(name)) return { ok: false, error: 'not a video this app can play' };
    const dest = path.join(this.#dir(id), sealedVideo(noteId, name));
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
    let input = null;
    let output = null;
    try {
      input = await fs.promises.open(from, 'r');
      const { size } = await input.stat();
      output = await fs.promises.open(tmp, 'w');
      const head = Buffer.alloc(VIDEO_HEAD);
      VIDEO_MAGIC.copy(head, 0);
      head.writeUInt32BE(VIDEO_PIECE, 4);
      head.writeBigUInt64BE(BigInt(size), 8);
      await output.write(head);
      const piece = Buffer.alloc(VIDEO_PIECE);
      for (let i = 0, at = 0; at < size; i += 1) {
        const { bytesRead } = await input.read(piece, 0, VIDEO_PIECE, at);
        if (!bytesRead) throw new Error('the file ended early');
        await output.write(seal(key, piece.subarray(0, bytesRead), `${id}/${noteId}/${name}/${i}/${size}`));
        at += bytesRead;
      }
      await output.close();
      output = null;
      await fs.promises.rename(tmp, dest);
      return { ok: true, url: BlackHoles.videoUrl(id, noteId, name), name: path.basename(from), file: name, size };
    } catch (err) {
      await output?.close().catch(() => {});
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      return { ok: false, error: err.message };
    } finally {
      await input?.close().catch(() => {});
    }
  }

  /** Any file sealed into an open black hole as attached to one of its notes (note-media.js addAttachment). */
  addFile(id, noteId, source) {
    return this.addVideo(id, noteId, source, `att-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${attachmentExt(source)}`);
  }

  /** How long a sealed video is, or null when it is not there or the black hole is locked. */
  videoSize(id, noteId, name) {
    if (!this.#keys.has(id) || !ID.test(String(noteId)) || !VIDEO_NAME.test(String(name))) return null;
    try {
      const fd = fs.openSync(path.join(this.#dir(id), sealedVideo(noteId, name)), 'r');
      try {
        const head = Buffer.alloc(VIDEO_HEAD);
        fs.readSync(fd, head, 0, VIDEO_HEAD, 0);
        if (!head.subarray(0, 4).equals(VIDEO_MAGIC) || head.readUInt32BE(4) !== VIDEO_PIECE) return null;
        return Number(head.readBigUInt64BE(8));
      } finally { fs.closeSync(fd); }
    } catch { return null; }
  }

  /**
   * A part of a sealed video, opened a piece at a time as it is asked for.
   * @param {number} start @param {number} end both inclusive, within the video
   * @returns {AsyncGenerator<Buffer>}
   */
  async* videoPart(id, noteId, name, start, end) {
    const size = this.videoSize(id, noteId, name);
    if (size === null || start > end || end >= size) return;
    const handle = await fs.promises.open(path.join(this.#dir(id), sealedVideo(noteId, name)), 'r');
    try {
      const sealed = Buffer.alloc(VIDEO_PIECE + PIECE_COST);
      for (let i = Math.floor(start / VIDEO_PIECE); i * VIDEO_PIECE <= end; i += 1) {
        const key = this.#keys.get(id);
        if (!key) return;                    // locked while it played
        const plainLength = Math.min(VIDEO_PIECE, size - i * VIDEO_PIECE);
        const { bytesRead } = await handle.read(sealed, 0, plainLength + PIECE_COST, VIDEO_HEAD + i * (VIDEO_PIECE + PIECE_COST));
        if (bytesRead !== plainLength + PIECE_COST) throw new Error('a piece is missing');
        const plain = unseal(key, sealed.subarray(0, bytesRead), `${id}/${noteId}/${name}/${i}/${size}`);
        const from = Math.max(0, start - i * VIDEO_PIECE);
        const to = Math.min(plainLength, end - i * VIDEO_PIECE + 1);
        yield Buffer.from(plain.subarray(from, to));
      }
    } finally {
      await handle.close().catch(() => {});
    }
  }

  /** A sealed video written out in the clear — for a note that is taken out of its black hole. */
  async exportVideo(id, noteId, name, dest) {
    const size = this.videoSize(id, noteId, name);
    if (size === null) return { ok: false, error: 'missing' };
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
    let output = null;
    try {
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      output = await fs.promises.open(tmp, 'w');
      if (size) for await (const part of this.videoPart(id, noteId, name, 0, size - 1)) await output.write(part);
      const written = (await output.stat()).size;
      await output.close();
      output = null;
      if (written !== size) throw new Error('the video did not come out whole');
      await fs.promises.rename(tmp, dest);
      return { ok: true };
    } catch (err) {
      await output?.close().catch(() => {});
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      return { ok: false, error: err.message };
    }
  }

  /**
   * The sealed videos no note shows any more, removed: called with the notes
   * of a black hole that has just been opened. A video whose note could not
   * be read is left alone.
   * @param {string[]} notes each note's JSON @param {number} damaged notes that did not open
   */
  #sweepVideos(id, notes, damaged) {
    if (damaged) return [];
    const all = notes.join('\n');
    const removed = [];
    for (const file of this.#videoFiles(id)) {
      const at = file.indexOf('~');
      if (at < 1 || file.includes('.tmp-')) continue;
      const noteId = file.slice(0, at);
      const name = file.slice(at + 1, -4);
      if (all.includes(BlackHoles.videoUrl(id, noteId, name))) continue;
      shred(path.join(this.#dir(id), file));
      removed.push(file);
    }
    return removed;
  }

  rename(id, name) {
    const meta = this.#meta(id);
    const clean = cleanHoleName(name);
    if (!meta || !clean) return { ok: false, error: 'name' };
    meta.name = clean;
    this.#saveMeta(meta);
    return { ok: true, hole: this.#describe(meta) };
  }

  /** The hint of an open black hole that is locked by a PIN: set, changed, or taken away with an empty one. */
  setHint(id, hint) {
    const meta = this.#meta(id);
    if (!meta || !this.#keys.has(id)) return { ok: false, error: 'locked' };
    if (meta.lock !== 'pin') return { ok: false, error: 'lock' };
    const reminder = cleanHint(hint);
    if (reminder) meta.hint = reminder; else delete meta.hint;
    this.#saveMeta(meta);
    return { ok: true, hole: this.#describe(meta) };
  }

  /**
   * A new PIN for an open black hole. One of the first builds that is opened
   * by a passkey alone takes its PIN here, and is a PIN black hole with a
   * passkey beside it from then on.
   */
  changePin(id, pin) {
    const meta = this.#meta(id);
    const key = this.#keys.get(id);
    if (!meta || !key) return { ok: false, error: 'locked' };
    if (!this.#newPin(pin)) return { ok: false, error: 'pin' };
    if (meta.lock === 'hello') {
      meta.passkey = { box: meta.key.box };
      meta.lock = 'pin';
    }
    meta.key = this.#wrap(id, 'pin', key, pin);
    meta.digits = this.digits;
    // A hint that tells the new PIN is no hint to keep.
    if (hintTells(meta.hint ?? '', pin)) delete meta.hint;
    delete meta.fails;
    this.#saveMeta(meta);
    return { ok: true };
  }

  /**
   * A passkey beside the PIN of an open black hole: added — after the passkey
   * itself has said yes — or taken away. Being open is the answer here: the
   * key is in hand. One of the first builds, opened by a passkey alone, cannot
   * lose it before it has a PIN (`changePin`).
   * @param {string} id @param {boolean} on
   */
  async setPasskey(id, on) {
    const meta = this.#meta(id);
    const key = this.#keys.get(id);
    if (!meta || !key) return { ok: false, error: 'locked' };
    if (meta.lock !== 'pin') return { ok: false, error: on ? 'set' : 'pin' };
    if (!on) {
      if (meta.passkey) { delete meta.passkey; this.#saveMeta(meta); }
      return { ok: true, hole: this.#describe(meta) };
    }
    if (!this.canProtect() || !(await this.helloAvailable())) return { ok: false, error: 'hello-unavailable' };
    if (!(await this.hello(meta.name))) return { ok: false, error: 'hello-refused' };
    meta.passkey = { box: b64(this.protect(key)) };
    this.#saveMeta(meta);
    return { ok: true, hole: this.#describe(meta) };
  }

  /**
   * Into the Trash, whole — "black holes should be able to go to the Trash
   * too" (the owner, 0.9.4). It is locked there: its key is let go of, and it
   * is not opened again until it is restored. Nothing of it changes on the
   * disk but the day it went, in hole.json; its notes stay sealed, in the
   * backups as well — the Trash is a way back.
   */
  trash(id) {
    const meta = this.#meta(id);
    if (!meta) return { ok: false, error: 'missing' };
    this.lock(id);
    if (!meta.trashedAt) { meta.trashedAt = this.now(); this.#saveMeta(meta); }
    return { ok: true, hole: this.#describe(meta) };
  }

  /** Out of the Trash again: a black hole like any other, locked. */
  restore(id) {
    const meta = this.#meta(id);
    if (!meta) return { ok: false, error: 'missing' };
    if (meta.trashedAt) { delete meta.trashedAt; this.#saveMeta(meta); }
    return { ok: true, hole: this.#describe(meta) };
  }

  /**
   * A black hole and every note in it, gone: each file overwritten, then
   * removed. Open or not; from the Trash. Asked for its answer first — its
   * PIN, its passkey, or its recovery key (the owner, 0.9.4: "deleting a black
   * hole must need its password").
   * @param {string} id
   * @param {{pin?: string, hello?: boolean, recovery?: string}} by
   */
  async delete(id, by = {}) {
    const meta = ID.test(String(id)) ? this.#meta(id) : null;
    if (!meta) return { ok: false, error: 'missing' };
    const proof = await this.#answer(meta, by);
    if (!proof.ok) return proof;
    proof.key.fill(0);
    this.lock(id);
    const dir = this.#dir(id);
    let removed = 0;
    for (const name of fs.readdirSync(dir)) { shred(path.join(dir, name)); removed += 1; }
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true, removed };
  }
}

/**
 * The script that asks Windows Hello (Windows PowerShell 5.1, which can reach
 * the Windows Runtime): `check` answers whether there is anything to ask, any
 * other first argument asks, with the words in NEBULA_HELLO_REASON.
 *
 * The question belongs to the app's window (NEBULA_HELLO_WINDOW, its handle):
 * asked plainly it is nobody's, and Windows put it behind Nebula — "the
 * passkey comes up at the back" (the owner, on the first build). Asked for a
 * window (IUserConsentVerifierInterop) it stands in front of that window and
 * takes the keys. Should that way fail, it is asked the plain way.
 */
const CONSENT_FOR_WINDOW = 'using System; using System.Runtime.InteropServices; '
  + '[ComImport, Guid("39E050C3-4E74-441A-8DC0-B81104DF949C"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)] '
  + 'public interface INebulaConsentInterop { [return: MarshalAs(UnmanagedType.IInspectable)] '
  + 'object RequestVerificationForWindowAsync(IntPtr appWindow, [MarshalAs(UnmanagedType.HString)] string message, [In] ref Guid riid); } '
  + 'public static class NebulaConsent { public static object Ask(object factory, IntPtr window, string message, Guid riid) { '
  + 'return ((INebulaConsentInterop)factory).RequestVerificationForWindowAsync(window, message, ref riid); } }';
export const WINDOWS_HELLO_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  '$null = [Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]',
  "$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1",
  'function Wait-Op($op, $type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $null = $task.Wait(120000); $task.Result }',
  '$a = Wait-Op ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])',
  "if ($env:NEBULA_HELLO_ASK -ne '1') { \"availability:$a\"; exit 0 }",
  "if (\"$a\" -ne 'Available') { \"availability:$a\"; exit 0 }",
  '$type = [Windows.Security.Credentials.UI.UserConsentVerificationResult]',
  '$r = $null',
  'if ($env:NEBULA_HELLO_WINDOW) { try {',
  '  $null = [Windows.Foundation.IAsyncOperation`1, Windows.Foundation, ContentType = WindowsRuntime]',
  `  Add-Type -TypeDefinition '${CONSENT_FOR_WINDOW}'`,
  '  $iid = ([Windows.Foundation.IAsyncOperation`1].MakeGenericType($type)).GUID',
  '  $factory = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeMarshal]::GetActivationFactory([Windows.Security.Credentials.UI.UserConsentVerifier])',
  '  $r = Wait-Op ([NebulaConsent]::Ask($factory, [IntPtr][long]$env:NEBULA_HELLO_WINDOW, $env:NEBULA_HELLO_REASON, $iid)) $type',
  '} catch { $r = $null } }',
  'if ($null -eq $r) { $r = Wait-Op ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync($env:NEBULA_HELLO_REASON)) $type }',
  '"result:$r"',
].join('\n');

/** What the script answered: is Hello there, and (when asked) did it say yes. */
export function readHelloAnswer(stdout) {
  const text = String(stdout ?? '');
  const availability = /availability:(\w+)/.exec(text)?.[1] ?? null;
  const result = /result:(\w+)/.exec(text)?.[1] ?? null;
  return { available: availability === 'Available' || result !== null, verified: result === 'Verified' };
}
