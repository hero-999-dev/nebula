/**
 * Black holes: notes kept encrypted (0.9.4).
 *
 * The owner's Ideas note: "a black hole section beside the folders — notes
 * kept wholly inside it, encrypted to the standards of the trade, stored in a
 * folder of their own inside Nebula; they are for notes that must be safe, and
 * opening one in the app asks for a password: a 4-digit PIN, set when the
 * black hole is made — or a passkey (fingerprint, the computer's PIN)."
 *
 *   storage/blackholes/<hole>/hole.json    protected label, how it is locked, wrapped key
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
 *     the Keychain on a Mac). New PIN wrappers require that protection;
 *     an older unprotected wrapper is upgraded after a valid PIN opens it.
 *     Copied off this computer — a backup, a flash
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
 * An answer can take seconds to come — a passkey prompt outlives a lock — and
 * the lock does not wait for it. Every lock and every change marks the black
 * hole's generation, and an answer that arrives after its own has passed
 * opens nothing, adds nothing and deletes nothing; a file the lock caught
 * half written goes with it, and no wrapper of a dead key is kept.
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
import { shredAsync, VIDEO_EXTENSIONS, attachmentExt } from './note-media.js';

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
  /** A paused media response can still hold a Windows file handle. */
  #activeVideo = new Map();
  #activeWrites = new Map();
  #activeImports = new Map();
  /** A note's removal in flight: writes, imports and new streams refuse, so nothing is committed onto files that are being destroyed. */
  #activeRemoval = new Map();
  /** The whole hole's deletion in flight: nothing else may touch it — no unlock, write, import, note removal or trash — until it is gone. */
  #activeDeletion = new Map();
  #nameCache = new Map();
  #videoTag(id, noteId) { return `${id}/${noteId}`; }
  #videoBusy(id, noteId = null) {
    if (noteId !== null) return (this.#activeVideo.get(this.#videoTag(id, noteId)) ?? 0) > 0;
    return [...this.#activeVideo].some(([tag, count]) => count > 0 && tag.startsWith(`${id}/`));
  }
  #writeBusy(id, noteId = null) {
    if (noteId !== null) return (this.#activeWrites.get(this.#videoTag(id, noteId)) ?? 0) > 0;
    return [...this.#activeWrites].some(([tag, count]) => count > 0 && tag.startsWith(`${id}/`));
  }
  #importBusy(id, noteId = null) {
    if (noteId !== null) return (this.#activeImports.get(this.#videoTag(id, noteId)) ?? 0) > 0;
    return [...this.#activeImports].some(([tag, count]) => count > 0 && tag.startsWith(`${id}/`));
  }
  #removalBusy(id, noteId = null) {
    if (noteId !== null) return (this.#activeRemoval.get(this.#videoTag(id, noteId)) ?? 0) > 0;
    return [...this.#activeRemoval].some(([tag, count]) => count > 0 && tag.startsWith(`${id}/`));
  }
  #deletionBusy(id) { return (this.#activeDeletion.get(String(id)) ?? 0) > 0; }

  /**
   * Every lock and every change marks the black hole it touched (#bump), and
   * "lock all" marks every hole at once — even one that holds no key now, for
   * an answer may still be on its way to one. An answer (or a file being
   * sealed) that arrives to find a mark made after it started is stale: it
   * opens, changes and writes nothing.
   */
  #epochs = new Map();
  #epochAll = 0;
  #token(id) { return `${this.#epochAll}:${this.#epochs.get(String(id)) ?? 0}`; }
  #bump(id) { this.#epochs.set(String(id), (this.#epochs.get(String(id)) ?? 0) + 1); }

  /** Whether the key an operation began with is still the one the hole holds: a lock empties the place, a fresh opening fills it with another buffer. */
  #stillHolds(id, key) { return this.#keys.get(id) === key; }

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
      if (meta?.id !== id || !meta.key || !meta.recovery) return null;
      // Older builds kept the label in clear text. Safe storage is available
      // before a PIN is entered, so protect that label at the first read.
      if (typeof meta.name === 'string' && this.canProtect()) {
        try {
          const upgraded = { ...meta, nameBox: b64(this.protect(Buffer.from(meta.name, 'utf8'))) };
          delete upgraded.name;
          this.#saveMeta(upgraded);
          return upgraded;
        } catch { /* keep the original label until protection works */ }
      }
      return meta;
    } catch { return null; }
  }

  #name(meta) {
    if (meta.nameBox) {
      const cached = this.#nameCache.get(meta.id);
      if (cached?.box === meta.nameBox) return cached.name;
      try {
        const name = cleanHoleName(this.unprotect(un64(meta.nameBox)).toString('utf8')) || 'Black hole';
        this.#nameCache.set(meta.id, { box: meta.nameBox, name });
        return name;
      }
      catch { return 'Black hole'; } // a backup brought from another computer
    }
    return cleanHoleName(meta.name) || 'Black hole';
  }

  #saveMeta(meta) {
    fs.mkdirSync(this.#dir(meta.id), { recursive: true });
    writeAtomic(this.#metaFile(meta.id), JSON.stringify(meta, null, 2));
  }

  #noteFiles(id) {
    try { return fs.readdirSync(this.#dir(id)).filter((f) => f.endsWith('.bh') && ID.test(f.slice(0, -3))); } catch { return []; }
  }

  /** Main-process check for an old plain copy that lost its hole marker. */
  hasSealedNote(id, noteId) {
    return ID.test(String(id)) && ID.test(String(noteId)) && fs.existsSync(path.join(this.#dir(id), `${noteId}.bh`));
  }

  /** Wrapped metadata only, for upgrading old local backup copies. */
  protectedKeyWrapper(id) {
    const key = this.#meta(id)?.key;
    return key?.os === true ? { ...key } : null;
  }

  /** Protected label for upgrading the local backup metadata too. */
  protectedNameBox(id) { return this.#meta(id)?.nameBox ?? null; }

  #describe(meta) {
    const fails = meta.fails?.count ?? 0;
    const wait = Math.max(0, (meta.fails?.at ?? 0) + waitAfter(fails) - this.now());
    return {
      id: meta.id, name: this.#name(meta), createdAt: meta.createdAt, lock: meta.lock, digits: pinDigits(meta),
      // What opens it: its PIN (always, but for one of the first builds), and a passkey where one was added.
      pin: meta.lock === 'pin', passkey: meta.lock === 'hello' || !!meta.passkey?.box,
      hint: meta.lock === 'pin' ? cleanHint(meta.hint) : '',
      notes: this.#noteFiles(meta.id).length, open: this.#keys.has(meta.id), waitMs: wait,
      needsProtection: meta.lock === 'pin' && meta.key?.os !== true,
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
    if (!this.canProtect()) return { ok: false, error: 'storage-unavailable' };
    const reminder = lock === 'pin' ? cleanHint(hint) : '';
    if (hintTells(reminder, pin)) return { ok: false, error: 'hint' };
    const also = lock === 'pin' && passkey === true;
    if (lock === 'hello' || also) {
      const epochAll = this.#epochAll;
      if (!this.canProtect() || !(await this.helloAvailable())) return { ok: false, error: 'hello-unavailable' };
      if (!(await this.hello(clean))) return { ok: false, error: 'hello-refused' };
      // "Lock all" while the passkey was being asked for: this yes is stale —
      // no black hole is born open behind a lock its owner just pressed.
      if (this.#epochAll !== epochAll) return { ok: false, error: 'locked' };
    }
    const id = `bh-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const key = crypto.randomBytes(32);
    const recoveryKey = newRecoveryKey();
    const rsalt = crypto.randomBytes(16);
    let meta;
    try {
      meta = {
        v: 1, id, nameBox: b64(this.protect(Buffer.from(clean, 'utf8'))), createdAt: this.now(), lock, ...(lock === 'pin' ? { digits: this.digits } : {}), ...(reminder ? { hint: reminder } : {}),
        cipher: 'aes-256-gcm', kdf: { ...this.kdf },
        key: this.#wrap(id, lock, key, pin),
        ...(also ? { passkey: { box: b64(this.protect(key)) } } : {}),
        recovery: { salt: b64(rsalt), box: b64(seal(derive(cleanRecoveryKey(recoveryKey), rsalt, this.kdf), key, `${id}/recovery`)) },
      };
    } catch { key.fill(0); return { ok: false, error: 'storage-unavailable' }; }
    this.#saveMeta(meta);
    this.#keys.set(id, key);
    return { ok: true, hole: this.#describe(meta), recoveryKey };
  }

  /** The hole's key wrapped for this computer: by the PIN and the operating system, or by the operating system alone. */
  #wrap(id, lock, key, pin) {
    if (!this.canProtect()) throw new Error('storage-unavailable');
    if (lock === 'hello') return { os: true, box: b64(this.protect(key)) };
    const salt = crypto.randomBytes(16);
    const inner = seal(derive(pin, salt, this.kdf), key, `${id}/pin`);
    return { os: true, salt: b64(salt), box: b64(this.protect(inner)) };
  }

  #fail(meta) {
    meta.fails = { count: (meta.fails?.count ?? 0) + 1, at: this.now() };
    this.#saveMeta(meta);
    return { ok: false, error: 'wrong', triesLeft: Math.max(0, FREE_TRIES - meta.fails.count), waitMs: waitAfter(meta.fails.count) };
  }

  /**
   * A passkey whose wrapped key is all zeroes: the residue of a passkey added
   * while the hole was being locked (the lock zeroed the key buffer before the
   * wrapper was written). Whoever unwraps it holds no key, so it is refused
   * when asked for and taken away when the real answer next opens the hole.
   */
  #deadPasskey(meta) {
    if (!meta.passkey?.box) return false;
    let key = null;
    try {
      key = this.unprotect(un64(meta.passkey.box));
      return key.length === 32 && key.every((b) => b === 0);
    } catch { return false; }
    finally { key?.fill(0); }
  }

  /**
   * The black hole's key, for the right answer: its recovery key; the passkey,
   * where the black hole has one (or is one of the first builds, opened by a
   * passkey alone); its PIN. Counts a wrong PIN or key; a passkey refused is
   * no guess. Nothing of the black hole is changed here but that count.
   * @returns {Promise<{ok: true, key: Buffer, by: 'recovery'|'hello'|'pin'} | {ok: false, error: string, waitMs?: number, triesLeft?: number}>}
   */
  async #answer(meta, { pin, recovery, hello } = {}, action = 'open') {
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
      if (box.length === 32 && box.every((b) => b === 0)) return { ok: false, error: 'damaged' };
      if (!(await this.helloAvailable())) return { ok: false, error: 'hello-unavailable' };
      // The OS prompt names what is being done — opening says open, deleting says delete (main.js).
      if (!(await this.hello(this.#name(meta), action))) { box.fill(0); return { ok: false, error: 'hello-refused' }; }
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
    if (this.#deletionBusy(id)) return { ok: false, error: 'in-use' };   // a wrong answer would write its fail count into a hole being destroyed
    const meta = this.#meta(id);
    if (!meta) return { ok: false, error: 'missing' };
    const token = this.#token(id);
    const res = await this.#answer(meta, by);
    if (!res.ok) return res;
    // The answer arrived after the hole was locked or changed: it proves the hole as it was, not as it is now.
    if (this.#token(id) !== token) { res.key.fill(0); return { ok: false, error: 'locked' }; }
    const good = res.key.length === 32;
    res.key.fill(0);
    if (!good) return { ok: false, error: 'damaged' };
    if (meta.fails) { delete meta.fails; this.#saveMeta(meta); }
    return { ok: true };
  }

  /**
   * Open a black hole: by its PIN, by the passkey where it has one, or by its
   * recovery key (with a new PIN for a PIN one — it is wrapped for this
   * computer again). An answer that arrives after the hole was locked or
   * changed opens nothing (`error: 'locked'`).
   * @param {string} id
   * @param {{pin?: string, hello?: boolean, recovery?: string}} by
   * @param {{preserveMedia?: boolean}} [opts] true: the sweep of videos no note
   * shows is left to the caller, which is restoring notes that name them (the
   * main process only — the window never chooses this).
   * @returns {Promise<{ok: boolean, notes?: string[], damaged?: number, error?: string, waitMs?: number, triesLeft?: number}>}
   */
  async unlock(id, { pin, recovery, hello } = {}, { preserveMedia = false } = {}) {
    // Before the meta read: even a read can write (a legacy label upgrade), and the
    // hole's files are being destroyed — nothing of it is touched until it is gone.
    if (this.#deletionBusy(id)) return { ok: false, error: 'in-use' };
    const meta = this.#meta(id);
    if (!meta) return { ok: false, error: 'missing' };
    if (meta.trashedAt) return { ok: false, error: 'trashed' };
    let key = this.#keys.get(id) ?? null;
    if (!key) {
      const token = this.#token(id);
      // A recovery key opens a PIN black hole only together with the new PIN it is to have.
      if (recovery !== undefined && meta.lock === 'pin' && cleanRecoveryKey(recovery).length === 32 && !this.#newPin(pin)
        && (meta.fails?.at ?? 0) + waitAfter(meta.fails?.count ?? 0) - this.now() <= 0) return { ok: false, error: 'pin' };
      if (recovery !== undefined && !this.canProtect()) return { ok: false, error: 'storage-unavailable' };
      const res = await this.#answer(meta, { pin, recovery, hello });
      if (!res.ok) return res;
      // The lock (or a change to the hole) did not wait for the passkey's answer.
      if (this.#token(id) !== token) { res.key.fill(0); return { ok: false, error: 'locked' }; }
      key = res.key;
      if (key.length !== 32) { key.fill(0); return { ok: false, error: 'damaged' }; }
      if (res.by === 'recovery') {
        // Wrapped for this computer again; a Hello one only where the system can keep it.
        try { meta.key = this.#wrap(id, meta.lock, key, pin); }
        catch { key.fill(0); return { ok: false, error: 'storage-unavailable' }; }
        if (meta.lock === 'pin') meta.digits = this.digits;
        // A passkey's copy of the key was wrapped for the computer it was added on: it is added again here, if wanted.
        delete meta.passkey;
      }
      // Old versions could write a PIN wrapper with no OS protection. A
      // successful PIN supplies the original key and lets us replace it now.
      // Keep the legacy wrapper if the OS still cannot protect it; never
      // create another one or silently weaken a recovery reset.
      const upgrade = res.by === 'pin' && meta.lock === 'pin' && !meta.key.os && this.canProtect();
      if (upgrade) {
        try { meta.key = this.#wrap(id, 'pin', key, pin); }
        catch { key.fill(0); return { ok: false, error: 'storage-unavailable' }; }
      }
      // A passkey whose wrapped key is the dead one is taken away: the real answer is in hand here.
      const dead = res.by !== 'hello' && this.#deadPasskey(meta);
      if (dead) delete meta.passkey;
      if (meta.fails || res.by === 'recovery' || dead || upgrade) { delete meta.fails; this.#saveMeta(meta); this.#bump(id); }
      this.#keys.set(id, key);
    }
    const notes = [];
    let damaged = 0;
    const files = this.#noteFiles(id);
    const decryptKey = files.length ? await crypto.webcrypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']) : null;
    if (!this.#stillHolds(id, key)) return { ok: false, error: 'locked' };
    for (const file of files) {
      try {
        const bytes = await fs.promises.readFile(path.join(this.#dir(id), file));
        if (!this.#stillHolds(id, key)) return { ok: false, error: 'locked' };
        if (!bytes.subarray(0, 4).equals(MAGIC) || bytes.length < 32) throw new Error('not a note');
        const clear = await crypto.webcrypto.subtle.decrypt({
          name: 'AES-GCM', iv: bytes.subarray(4, 16),
          additionalData: Buffer.from(`${id}/${file.slice(0, -3)}`), tagLength: 128,
        }, decryptKey, bytes.subarray(16));
        if (!this.#stillHolds(id, key)) return { ok: false, error: 'locked' };
        const text = Buffer.from(clear).toString('utf8');
        new Uint8Array(clear).fill(0);
        notes.push(text);
      } catch { if (!this.#stillHolds(id, key)) return { ok: false, error: 'locked' }; damaged += 1; }
    }
    // A video taken out of a note since the black hole was last opened goes now —
    // and `swept` names it for the caller, who takes it out of the backups too.
    const swept = preserveMedia ? [] : await this.#sweepVideos(id, notes, damaged);
    // The sweep awaited: the hole may have been locked while it shredded. The
    // notes are plaintext in hand — they leave with the lock, not after it.
    if (!this.#stillHolds(id, key)) return { ok: false, error: 'locked' };
    return { ok: true, notes, damaged, ...(swept.length ? { swept } : {}) };
  }

  isOpen(id) { return this.#keys.has(id); }

  /** Let go of the key. The files stay as they are: sealed. */
  lock(id) {
    this.#bump(id);
    const key = this.#keys.get(id);
    if (key) key.fill(0);
    return this.#keys.delete(id);
  }

  lockAll() {
    this.#epochAll += 1;   // every hole, even one holding no key now — an answer may still be on its way to one
    for (const id of [...this.#keys.keys()]) this.lock(id);
  }

  /** One note sealed into an open black hole. */
  write(id, noteId, json) {
    const key = this.#keys.get(id);
    if (!key) return { ok: false, error: 'locked' };
    if (!ID.test(String(noteId)) || !this.#meta(id)) return { ok: false, error: 'missing' };
    if (this.#writeBusy(id, noteId) || this.#removalBusy(id, noteId) || this.#deletionBusy(id)) return { ok: false, error: 'in-use' };
    writeAtomic(path.join(this.#dir(id), `${noteId}.bh`), Buffer.concat([MAGIC, seal(key, Buffer.from(String(json), 'utf8'), `${id}/${noteId}`)]));
    return { ok: true };
  }

  /** Seal in memory, then write without blocking Electron's event loop on a
   * large file. Commit is synchronous after the last lock check. */
  async writeAsync(id, noteId, json) {
    const key = this.#keys.get(id);
    if (!key) return { ok: false, error: 'locked' };
    if (!ID.test(String(noteId)) || !this.#meta(id)) return { ok: false, error: 'missing' };
    if (this.#writeBusy(id, noteId) || this.#removalBusy(id, noteId) || this.#deletionBusy(id)) return { ok: false, error: 'in-use' };
    const tag = this.#videoTag(id, noteId);
    this.#activeWrites.set(tag, (this.#activeWrites.get(tag) ?? 0) + 1);
    const dest = path.join(this.#dir(id), `${noteId}.bh`);
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const plain = Buffer.from(String(json), 'utf8');
      let bytes;
      try {
        const nonce = crypto.randomBytes(12);
        const wrapped = await crypto.webcrypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
        if (!this.#stillHolds(id, key)) return { ok: false, error: 'locked' };
        const body = await crypto.webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: Buffer.from(`${id}/${noteId}`), tagLength: 128 }, wrapped, plain);
        bytes = Buffer.concat([MAGIC, nonce, Buffer.from(body)]);
      }
      finally { plain.fill(0); }
      if (!this.#stillHolds(id, key)) return { ok: false, error: 'locked' };
      await fs.promises.writeFile(tmp, bytes);
      if (!this.#stillHolds(id, key)) return { ok: false, error: 'locked' };
      fs.renameSync(tmp, dest);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
    finally {
      try { fs.rmSync(tmp, { force: true }); } catch { /* Windows may still hold it; keep the write result */ }
      const count = (this.#activeWrites.get(tag) ?? 1) - 1;
      if (count) this.#activeWrites.set(tag, count); else this.#activeWrites.delete(tag);
    }
  }

  /**
   * One note out of a black hole, for good — its videos with it. Only while the
   * black hole is open: whoever found the app open takes nothing out of what
   * is shut (the window asks for the hole's answer before it calls this; the
   * bridge is trusted, but the door is shut here too).
   */
  async remove(id, noteId) {
    if (!ID.test(String(id)) || !ID.test(String(noteId))) return { ok: false, error: 'missing' };
    if (!this.#keys.has(id)) return { ok: false, error: 'locked' };
    if (this.#videoBusy(id, noteId) || this.#writeBusy(id, noteId) || this.#importBusy(id, noteId)) return { ok: false, error: 'in-use' };
    if (this.#removalBusy(id, noteId) || this.#deletionBusy(id)) return { ok: false, error: 'in-use' };
    const tag = this.#videoTag(id, noteId);
    this.#activeRemoval.set(tag, (this.#activeRemoval.get(tag) ?? 0) + 1);
    try {
      // The overwrite yields the turn between blocks: a locked window stays live while a large video is cleaned.
      // While it runs, nothing may commit onto the note it is destroying.
      await shredAsync(path.join(this.#dir(id), `${noteId}.bh`));
      for (const file of this.#videoFiles(id)) if (file.startsWith(`${noteId}~`)) await shredAsync(path.join(this.#dir(id), file));
      return { ok: true };
    } finally {
      const count = (this.#activeRemoval.get(tag) ?? 1) - 1;
      if (count) this.#activeRemoval.set(tag, count); else this.#activeRemoval.delete(tag);
    }
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
    // The key is held across awaits: the hole may be locked while the copy runs,
    // and the lock zeroes this very buffer. Every await is followed by a look
    // at whether the key in the hole is still this one — before a piece is
    // sealed, and again before the file is committed (an empty one too).
    if (this.#removalBusy(id, noteId) || this.#deletionBusy(id)) return { ok: false, error: 'in-use' };
    const still = () => this.#stillHolds(id, key);
    const from = String(source ?? '');
    const ext = from.slice(from.lastIndexOf('.') + 1).toLowerCase();
    const name = keepName ?? `vid-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    if (!VIDEO_NAME.test(name)) return { ok: false, error: 'not a video this app can play' };
    const tag = this.#videoTag(id, noteId);
    this.#activeImports.set(tag, (this.#activeImports.get(tag) ?? 0) + 1);
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
        if (!still()) throw new Error('locked');
        if (!bytesRead) throw new Error('the file ended early');
        await output.write(seal(key, piece.subarray(0, bytesRead), `${id}/${noteId}/${name}/${i}/${size}`));
        at += bytesRead;
      }
      await output.close();
      output = null;
      if (!still()) throw new Error('locked');
      fs.renameSync(tmp, dest);   // the commit: no await after the check, so no lock can land between them
      return { ok: true, url: BlackHoles.videoUrl(id, noteId, name), name: path.basename(from), file: name, size };
    } catch (err) {
      await output?.close().catch(() => {});
      fs.rmSync(tmp, { force: true });
      return { ok: false, error: err.message };
    } finally {
      await input?.close().catch(() => {});
      const count = (this.#activeImports.get(tag) ?? 1) - 1;
      if (count) this.#activeImports.set(tag, count); else this.#activeImports.delete(tag);
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
    const key = this.#keys.get(id);               // BEFORE any await: the key this playing was let in with
    const size = this.videoSize(id, noteId, name);
    if (!key || size === null || start > end || end >= size) return;
    if (this.#removalBusy(id, noteId)) return;    // its note is being destroyed
    const tag = this.#videoTag(id, noteId);
    this.#activeVideo.set(tag, (this.#activeVideo.get(tag) ?? 0) + 1);
    let handle = null;
    try {
      handle = await fs.promises.open(path.join(this.#dir(id), sealedVideo(noteId, name)), 'r');
      if (!this.#stillHolds(id, key)) return;
      const sealed = Buffer.alloc(VIDEO_PIECE + PIECE_COST);
      for (let i = Math.floor(start / VIDEO_PIECE); i * VIDEO_PIECE <= end; i += 1) {
        // Locked while it played — or emptied and opened again, another key in
        // the place of this one: the playing stops, it does not limp on.
        if (!this.#stillHolds(id, key)) return;
        const plainLength = Math.min(VIDEO_PIECE, size - i * VIDEO_PIECE);
        const { bytesRead } = await handle.read(sealed, 0, plainLength + PIECE_COST, VIDEO_HEAD + i * (VIDEO_PIECE + PIECE_COST));
        // After the read, before a byte is opened: the lock zeroes the very buffer `key` names.
        if (!this.#stillHolds(id, key)) return;
        if (bytesRead !== plainLength + PIECE_COST) throw new Error('a piece is missing');
        const plain = unseal(key, sealed.subarray(0, bytesRead), `${id}/${noteId}/${name}/${i}/${size}`);
        const from = Math.max(0, start - i * VIDEO_PIECE);
        const to = Math.min(plainLength, end - i * VIDEO_PIECE + 1);
        yield Buffer.from(plain.subarray(from, to));
      }
    } finally {
      await handle?.close().catch(() => {});
      const remaining = (this.#activeVideo.get(tag) ?? 1) - 1;
      if (remaining) this.#activeVideo.set(tag, remaining); else this.#activeVideo.delete(tag);
    }
  }

  /** A sealed video written out in the clear — for a note that is taken out of its black hole. */
  async exportVideo(id, noteId, name, dest) {
    const key = this.#keys.get(id);
    if (!key) return { ok: false, error: 'missing' };
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
      // The last look before the file is committed: the hole may have been
      // locked while the copy came out (an empty file never enters the loop).
      if (!this.#stillHolds(id, key)) throw new Error('locked');
      if (written !== size) throw new Error('the video did not come out whole');
      fs.renameSync(tmp, dest);   // the commit: no await after the check, so no lock can land between them
      return { ok: true };
    } catch (err) {
      await output?.close().catch(() => {});
      fs.rmSync(tmp, { force: true });
      return { ok: false, error: err.message };
    }
  }

  /**
   * The sealed videos no note shows any more, removed: called with the notes
   * of a black hole that has just been opened. A video whose note could not
   * be read is left alone.
   * @param {string[]} notes each note's JSON @param {number} damaged notes that did not open
   */
  async #sweepVideos(id, notes, damaged) {
    if (damaged) return [];
    const all = notes.join('\n');
    const removed = [];
    for (const file of this.#videoFiles(id)) {
      const at = file.indexOf('~');
      if (at < 1 || file.includes('.tmp-')) continue;
      const noteId = file.slice(0, at);
      const name = file.slice(at + 1, -4);
      if (all.includes(BlackHoles.videoUrl(id, noteId, name))) continue;
      await shredAsync(path.join(this.#dir(id), file));
      removed.push(file);
    }
    return removed;
  }

  rename(id, name) {
    const clean = cleanHoleName(name);
    if (!clean) return { ok: false, error: 'name' };
    if (this.#deletionBusy(id)) return { ok: false, error: 'in-use' };   // no label written into a hole being destroyed
    const meta = this.#meta(id);
    if (!meta) return { ok: false, error: 'name' };
    if (!this.canProtect()) return { ok: false, error: 'storage-unavailable' };
    try { meta.nameBox = b64(this.protect(Buffer.from(clean, 'utf8'))); }
    catch { return { ok: false, error: 'storage-unavailable' }; }
    delete meta.name;
    this.#saveMeta(meta);
    this.#bump(id);   // an answer still on its way belongs to the hole as it was
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
    this.#bump(id);
    return { ok: true, hole: this.#describe(meta) };
  }

  /**
   * A new PIN for an open black hole — after its old answer: the current PIN,
   * or the passkey for whoever does not know it (the owner, 2026-10-18);
   * being open is not knowing it. One of the first builds that is opened by
   * a passkey alone proves with the passkey and takes its PIN here, becoming
   * a PIN black hole with the passkey beside it.
   * @param {string} id @param {string} pin @param {{pin?: string, hello?: boolean}} by
   */
  async changePin(id, pin, by = {}) {
    const meta = this.#meta(id);
    const key = this.#keys.get(id);
    if (!meta || !key) return { ok: false, error: 'locked' };
    const proof = await this.#answer(meta, by, 'change-pin');
    if (!proof.ok) return proof;
    // The lock — or a change, or a delete — did not wait for the passkey's
    // answer: this yes is stale, and nothing is written.
    if (!this.#stillHolds(id, key)) return { ok: false, error: 'locked' };
    if (!this.#newPin(pin)) return { ok: false, error: 'pin' };
    if (!this.canProtect()) return { ok: false, error: 'storage-unavailable' };
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
    this.#bump(id);   // a new PIN makes every answer still on its way stale
    return { ok: true };
  }

  /**
   * A new recovery key for an open black hole, shown once. The old one dies
   * with the swap: a key written down or left with someone is made wrong
   * again. Being open is the answer here — the key is in hand, as for a new
   * PIN — and everything after the guards is synchronous, so no answer still
   * on its way can land in between (the lock drops the key first).
   */
  newRecovery(id) {
    const meta = this.#meta(id);
    const key = this.#keys.get(id);
    if (!meta || !key) return { ok: false, error: 'locked' };
    if (!meta.recovery || !meta.key) return { ok: false, error: 'recovery' };
    const recoveryKey = newRecoveryKey();
    const rsalt = crypto.randomBytes(16);
    meta.recovery = { salt: b64(rsalt), box: b64(seal(derive(cleanRecoveryKey(recoveryKey), rsalt, this.kdf), key, `${id}/recovery`)) };
    this.#saveMeta(meta);
    this.#bump(id);
    return { ok: true, recoveryKey };
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
    const token = this.#token(id);
    if (!on) {
      if (meta.passkey) { delete meta.passkey; this.#saveMeta(meta); this.#bump(id); }
      return { ok: true, hole: this.#describe(meta) };
    }
    if (!this.canProtect() || !(await this.helloAvailable())) return { ok: false, error: 'hello-unavailable' };
    if (!(await this.hello(this.#name(meta)))) return { ok: false, error: 'hello-refused' };
    // The hole was locked — or changed, or emptied and opened again with another
    // key — while the passkey was being asked for: this yes is stale, and no
    // wrapper of the key it began with (zeroed by the lock) is written.
    if (!this.#stillHolds(id, key) || this.#token(id) !== token) return { ok: false, error: 'locked' };
    meta.passkey = { box: b64(this.protect(key)) };
    this.#saveMeta(meta);
    this.#bump(id);
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
    if (this.#writeBusy(id) || this.#importBusy(id) || this.#deletionBusy(id)) return { ok: false, error: 'in-use' };
    this.lock(id);
    if (!meta.trashedAt) { meta.trashedAt = this.now(); this.#saveMeta(meta); }
    return { ok: true, hole: this.#describe(meta) };
  }

  /** Out of the Trash again: a black hole like any other, locked. */
  restore(id) {
    const meta = this.#meta(id);
    if (!meta) return { ok: false, error: 'missing' };
    if (this.#deletionBusy(id)) return { ok: false, error: 'in-use' };   // it is being destroyed, not brought back
    if (meta.trashedAt) { delete meta.trashedAt; this.#saveMeta(meta); this.#bump(id); }
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
    if (this.#deletionBusy(id)) return { ok: false, error: 'in-use' };
    const meta = ID.test(String(id)) ? this.#meta(id) : null;
    if (!meta) return { ok: false, error: 'missing' };
    const token = this.#token(id);
    const proof = await this.#answer(meta, by, 'delete');
    if (!proof.ok) return proof;
    // Locked (or changed) while the answer was being asked for: the answer
    // destroys the hole as it was, not the one that is there now.
    if (this.#token(id) !== token) { proof.key.fill(0); return { ok: false, error: 'locked' }; }
    if (this.#videoBusy(id) || this.#writeBusy(id) || this.#importBusy(id) || this.#removalBusy(id)) { proof.key.fill(0); return { ok: false, error: 'in-use' }; }
    if (this.#deletionBusy(id)) { proof.key.fill(0); return { ok: false, error: 'in-use' }; }
    proof.key.fill(0);
    this.lock(id);
    this.#activeDeletion.set(String(id), (this.#activeDeletion.get(String(id)) ?? 0) + 1);
    try {
      const dir = this.#dir(id);
      // The directory itself may be a planted link or junction: it is unlinked,
      // never followed — whatever it points at is not this hole's to destroy.
      if (fs.lstatSync(dir).isSymbolicLink()) { fs.rmSync(dir, { force: true }); return { ok: true, removed: 0 }; }
      let removed = 0;
      for (const name of fs.readdirSync(dir)) { await shredAsync(path.join(dir, name)); removed += 1; }
      fs.rmSync(dir, { recursive: true, force: true });
      return { ok: true, removed };
    } finally {
      const count = (this.#activeDeletion.get(String(id)) ?? 1) - 1;
      if (count) this.#activeDeletion.set(String(id), count); else this.#activeDeletion.delete(String(id));
    }
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
