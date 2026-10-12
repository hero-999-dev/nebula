/**
 * A lock on opening the app (0.9.4).
 *
 * The owner's Ideas note: "a PIN or a passkey when the app is opened — as a
 * black hole has". And on the first build of it: "the 6-digit PIN is the lock,
 * always; a passkey is added to it if wanted, and whoever opens the app uses
 * the one they like. Turning the lock off must not delete it — deleting is
 * Remove lock."
 *
 * So: a lock IS a 6-digit PIN. A passkey (the fingerprint, the face, the
 * computer's own PIN) may be added beside it, and then either opens the app.
 * The lock can be turned off — the app opens without asking, the PIN and the
 * passkey are kept for when it is turned on again — or removed, which forgets
 * all of it. Set in Settings; while it is on, the window asks before it shows
 * anything, and this process hands over no note until it has been answered:
 * the vault's files, the black holes and the notes' pictures are all refused
 * while the lock is shut (main.js).
 *
 *   <profile>/app-lock.json    whether it is on, and what a right answer hashes to
 *
 * What it is and what it is not: it keeps the app shut for whoever sits down
 * at this computer. It does not encrypt the notes — their files lie in the
 * notes folder as they always did, readable by anyone who can read the disk.
 * A note that must be safe from that belongs in a black hole (black-holes.js),
 * which is sealed whether the app is open or not. So the PIN here is only
 * checked, never used as a key: scrypt turns it and a salt into what is kept,
 * and a typed PIN is right when it comes to the same.
 *
 * As with a black hole: six digits; after five wrong ones each further try
 * waits, longer every time; a hint may be kept with the PIN; and a recovery
 * key, shown once, opens the app when the PIN is forgotten — and removes the
 * lock, to be set again.
 *
 * Whoever changes the lock answers it first — turning it off, removing it,
 * adding a passkey (which is asked for the PIN: a way in is not added by
 * someone who only found the app open). Turning it on, and taking the passkey
 * away, only make it tighter and ask nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { KDF, PIN_DIGITS, FREE_TRIES, waitAfter, newRecoveryKey, cleanRecoveryKey, cleanHint } from './black-holes.js';

const b64 = (buf) => buf.toString('base64');
const un64 = (text) => Buffer.from(String(text ?? ''), 'base64');
const isPin = (pin) => new RegExp(`^\\d{${PIN_DIGITS}}$`).test(String(pin ?? ''));

function hashOf(secret, salt, kdf = KDF) {
  return crypto.scryptSync(Buffer.from(String(secret), 'utf8'), salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 512 * 1024 * 1024 });
}

/** A new salt and what the secret hashes to with it. */
function keep(secret, kdf) {
  const salt = crypto.randomBytes(16);
  return { salt: b64(salt), hash: b64(hashOf(secret, salt, kdf)) };
}

/** Whether the secret is the one kept: compared in constant time. */
function matches(secret, kept, kdf) {
  try {
    const want = un64(kept?.hash);
    const got = hashOf(secret, un64(kept?.salt), kdf);
    return want.length > 0 && want.length === got.length && crypto.timingSafeEqual(want, got);
  } catch {
    return false;
  }
}

const hintTells = (hint, pin) => !!pin && String(hint).replace(/\D/g, '').includes(String(pin));

export class AppLock {
  /** Answered since this process started (or since "Lock now"). */
  #open = false;
  /**
   * Whether a lock is set and on, once looked up: `isLocked` is asked before
   * every note is handed over, and must not read the disk each time. Every
   * change goes through this object, which keeps it true to the file.
   * @type {{set: boolean, on: boolean}|null}
   */
  #known = null;

  /**
   * @param {object} deps
   * @param {() => string} deps.file <profile>/app-lock.json
   * @param {() => Promise<boolean>} [deps.hello] the operating system asks who is there
   * @param {() => Promise<boolean>} [deps.helloAvailable]
   * @param {() => number} [deps.now]
   * @param {object} [deps.kdf] lighter in tests
   */
  constructor({ file, hello = async () => false, helloAvailable = async () => false, now = Date.now, kdf = KDF }) {
    this.file = file;
    this.hello = hello;
    this.helloAvailable = helloAvailable;
    this.now = now;
    this.kdf = kdf;
  }

  /**
   * The lock as the file has it, or null where there is none (or a file that
   * is not one: a damaged file must not shut the notes away for good).
   *
   * The first test build wrote another shape — `lock: 'pin'`, or `lock:
   * 'hello'` for a lock that was a passkey alone, with no PIN. Both are read:
   * the second as a lock whose only answer is the passkey, until it is removed
   * and set anew.
   */
  #meta() {
    let meta;
    try { meta = JSON.parse(fs.readFileSync(this.file(), 'utf8')); } catch { return null; }
    if (!meta || typeof meta !== 'object' || !meta.recovery?.hash) return null;
    if (meta.v === 1 && (meta.lock === 'pin' || meta.lock === 'hello')) {
      const { lock, ...rest } = meta;
      meta = { ...rest, v: 2, on: true, passkey: lock === 'hello' };
      if (lock === 'hello') delete meta.pin;
    }
    if (meta.v !== 2) return null;
    if (!meta.pin?.hash && meta.passkey !== true) return null;
    return { ...meta, on: meta.on !== false, passkey: meta.passkey === true };
  }

  #save(meta) {
    const file = this.file();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(meta, null, 2));
      fs.renameSync(tmp, file);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
    this.#known = { set: true, on: meta.on !== false };
  }

  #remove() {
    fs.rmSync(this.file(), { force: true });
    this.#known = { set: false, on: false };
  }

  #look() {
    if (!this.#known) {
      const meta = this.#meta();
      this.#known = { set: !!meta, on: !!meta?.on };
    }
    return this.#known;
  }

  #wait(meta) {
    return Math.max(0, (meta.fails?.at ?? 0) + waitAfter(meta.fails?.count ?? 0) - this.now());
  }

  #fail(meta) {
    meta.fails = { count: (meta.fails?.count ?? 0) + 1, at: this.now() };
    this.#save(meta);
    return { ok: false, error: 'wrong', triesLeft: Math.max(0, FREE_TRIES - meta.fails.count), waitMs: waitAfter(meta.fails.count) };
  }

  /** Whether the app has a lock at all — on or turned off. */
  isSet() { return this.#look().set; }

  /** Whether the lock is on: the app asks when it opens. */
  isOn() { const { set, on } = this.#look(); return set && on; }

  /** Whether notes must be withheld now: a lock is on and has not been answered. */
  isLocked() { return !this.#open && this.isOn(); }

  /**
   * What the window may know: never anything a PIN could be worked out from.
   *
   * Whether this computer has a passkey (`hello`) is told only when asked for
   * (`withHello`, by Settings): finding out can take seconds — on Windows it
   * is asked of the system by a script — and the window asks for the state
   * before it starts, every time the app opens. That question must not wait.
   * @param {{withHello?: boolean}} [what]
   */
  async state({ withHello = false } = {}) {
    const meta = this.#meta();
    this.#known = { set: !!meta, on: !!meta?.on };
    return {
      ok: true,
      set: !!meta,
      on: !!meta?.on,
      locked: !!meta?.on && !this.#open,
      /** Whether a PIN opens it (always, but for a passkey-only lock of the first test build). */
      pin: !!meta?.pin?.hash,
      /** Whether a passkey opens it too. */
      passkey: !!meta?.passkey,
      digits: meta?.pin?.hash ? PIN_DIGITS : 0,
      hint: meta?.pin?.hash ? cleanHint(meta.hint) : '',
      waitMs: meta ? this.#wait(meta) : 0,
      ...(withHello ? { hello: await this.helloAvailable() } : {}),
    };
  }

  /**
   * Lock the app from now on: a 6-digit PIN, and a passkey beside it if
   * wanted. Only where there is no lock yet: one that is set is removed
   * first, by whoever can answer it (`clear`).
   * @param {{pin: string, hint?: string, passkey?: boolean}} how
   * @returns {Promise<{ok: boolean, recoveryKey?: string, error?: string}>}
   */
  async set({ pin, hint, passkey = false } = {}) {
    if (this.#meta()) return { ok: false, error: 'set' };
    if (!isPin(pin)) return { ok: false, error: 'pin' };
    const reminder = cleanHint(hint);
    if (hintTells(reminder, pin)) return { ok: false, error: 'hint' };
    if (passkey) {
      if (!(await this.helloAvailable())) return { ok: false, error: 'hello-unavailable' };
      if (!(await this.hello())) return { ok: false, error: 'hello-refused' };
    }
    const recoveryKey = newRecoveryKey();
    this.#save({
      v: 2, on: true, createdAt: this.now(), kdf: { ...this.kdf },
      digits: PIN_DIGITS, pin: keep(pin, this.kdf),
      ...(reminder ? { hint: reminder } : {}),
      passkey: passkey === true,
      recovery: keep(cleanRecoveryKey(recoveryKey), this.kdf),
    });
    // Whoever set it is at the app: it stays open until the app is next started.
    this.#open = true;
    return { ok: true, recoveryKey };
  }

  /**
   * Is this an answer to the lock? The PIN; the passkey, where one was added;
   * the recovery key. Counts a wrong PIN or key; a passkey refused is no guess.
   * @param {{pin?: string, hello?: boolean, recovery?: string}} by
   * @param {{passkey?: boolean}} [allow] false: the passkey is no answer here
   */
  async #answer(meta, { pin, hello, recovery } = {}, { passkey = true } = {}) {
    const wait = this.#wait(meta);
    if (wait > 0) return { ok: false, error: 'wait', waitMs: wait };
    if (recovery !== undefined) {
      const typed = cleanRecoveryKey(recovery);
      if (typed.length !== 32 || !matches(typed, meta.recovery, meta.kdf)) return this.#fail(meta);
      return { ok: true, by: 'recovery' };
    }
    if (hello) {
      if (!passkey || !meta.passkey) return { ok: false, error: 'hello' };
      if (!(await this.helloAvailable())) return { ok: false, error: 'hello-unavailable' };
      if (!(await this.hello())) return { ok: false, error: 'hello-refused' };
      return { ok: true, by: 'hello' };
    }
    if (!meta.pin?.hash || !isPin(pin)) return { ok: false, error: 'pin' };
    if (!matches(pin, meta.pin, meta.kdf)) return this.#fail(meta);
    return { ok: true, by: 'pin' };
  }

  /** A right answer forgets the wrong ones before it. */
  #forgive(meta) {
    if (!meta.fails) return;
    delete meta.fails;
    this.#save(meta);
  }

  /**
   * Open the app: by its PIN, by the passkey where one was added, or by the
   * recovery key — which also removes the lock (`cleared`), since whoever
   * needed it has lost the PIN.
   * @returns {Promise<{ok: boolean, cleared?: boolean, error?: string, waitMs?: number, triesLeft?: number}>}
   */
  async unlock(by = {}) {
    const meta = this.#meta();
    if (!meta) { this.#open = true; this.#known = { set: false, on: false }; return { ok: true }; }
    const res = await this.#answer(meta, by);
    if (!res.ok) return res;
    this.#open = true;
    if (res.by === 'recovery') { this.#remove(); return { ok: true, cleared: true }; }
    this.#forgive(meta);
    return { ok: true };
  }

  /**
   * Turn the lock on or off. Off: the app opens without asking, and the lock
   * — its PIN, its passkey, its recovery key — is kept as it is; asked for
   * its answer first. On: nothing is asked, and the app stays open until it
   * is next started. A lock that is on already is left exactly as it is —
   * shut, if it is shut: "turn it on" is never a way in.
   * @param {boolean} on
   * @param {{pin?: string, hello?: boolean, recovery?: string}} [by]
   */
  async turn(on, by = {}) {
    const meta = this.#meta();
    if (!meta) return { ok: false, error: 'unset' };
    if (on) {
      if (meta.on) return { ok: true };
      meta.on = true;
      this.#save(meta);
      this.#open = true;
      return { ok: true };
    }
    const res = await this.#answer(meta, by);
    if (!res.ok) return res;
    delete meta.fails;
    meta.on = false;
    this.#save(meta);
    this.#open = true;
    return { ok: true };
  }

  /**
   * Add a passkey beside the PIN, or take it away. Adding asks for the PIN —
   * not for the passkey that is being added, and not for a passkey at all:
   * a way in is given by whoever holds the lock — and then for the passkey's
   * own yes. Taking it away asks nothing — of whoever is in the app: while
   * the lock is shut it is refused, or someone locked out could take the
   * owner's passkey away. A lock that is a passkey alone (the first test
   * build) cannot lose it, it is removed instead.
   * @param {boolean} on
   * @param {{pin?: string, recovery?: string}} [by]
   */
  async passkey(on, by = {}) {
    const meta = this.#meta();
    if (!meta) return { ok: false, error: 'unset' };
    if (!on) {
      if (this.isLocked()) return { ok: false, error: 'locked' };
      if (!meta.pin?.hash) return { ok: false, error: 'pin' };
      if (meta.passkey) { meta.passkey = false; this.#save(meta); }
      return { ok: true };
    }
    if (meta.passkey) return { ok: true };
    const res = await this.#answer(meta, by, { passkey: false });
    if (!res.ok) return res;
    this.#forgive(meta);
    if (!(await this.helloAvailable())) return { ok: false, error: 'hello-unavailable' };
    if (!(await this.hello())) return { ok: false, error: 'hello-refused' };
    meta.passkey = true;
    this.#save(meta);
    return { ok: true };
  }

  /** Remove the lock — its PIN, its passkey, its recovery key: asked for its answer first, on or off. */
  async clear(by = {}) {
    const meta = this.#meta();
    if (!meta) { this.#known = { set: false, on: false }; return { ok: true }; }
    const res = await this.#answer(meta, by);
    if (!res.ok) return res;
    this.#remove();
    this.#open = true;
    return { ok: true };
  }

  /** Shut again, now ("Lock Nebula"). Nothing to do where no lock is on. */
  lockNow() {
    if (!this.isOn()) return false;
    this.#open = false;
    return true;
  }
}
