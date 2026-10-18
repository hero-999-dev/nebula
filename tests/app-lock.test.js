// @vitest-environment node
/**
 * The lock on opening the app (0.9.4): what the main process keeps and what it
 * answers. A lock is a 6-digit PIN; a passkey may be added beside it; it can
 * be turned off without being removed. A real file in the system's temp
 * directory; the operating system's part (the passkey) is played by the test.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppLock } from '../electron/app-lock.js';
import { FREE_TRIES, waitAfter } from '../electron/black-holes.js';

const LIGHT = { name: 'scrypt', N: 1 << 10, r: 8, p: 1 };
const PIN = '482193';
const KEY = /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/;

let dir;
let clock;
let helloSays;
let helloThere;
let helloAsked;
const file = () => path.join(dir, 'app-lock.json');
const lock = () => new AppLock({ file, kdf: LIGHT, now: () => clock, hello: async () => { helloAsked += 1; return helloSays; }, helloAvailable: async () => helloThere });
const onDisk = () => JSON.parse(fs.readFileSync(file(), 'utf8'));

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-lock-')); clock = 1_000_000; helloSays = true; helloThere = true; helloAsked = 0; });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('an app with no lock', () => {
  it('is open: nothing is set, nothing is withheld', async () => {
    const l = lock();
    expect(l.isSet()).toBe(false);
    expect(l.isOn()).toBe(false);
    expect(l.isLocked()).toBe(false);
    expect(await l.state({ withHello: true })).toEqual({ ok: true, set: false, on: false, locked: false, pin: false, passkey: false, digits: 0, hint: '', waitMs: 0, hello: true });
    expect(await l.unlock({ pin: '000000' })).toEqual({ ok: true });
    expect(l.lockNow()).toBe(false);
    expect(await l.turn(true)).toEqual({ ok: false, error: 'unset' });
    expect(await l.passkey(true, { pin: PIN })).toEqual({ ok: false, error: 'unset' });
    expect(await l.clear({})).toEqual({ ok: true });
  });

  it('takes a lock only with a PIN of six digits — a passkey alone is no lock', async () => {
    const l = lock();
    for (const pin of ['1234', '1234567', 'abcdef', '', undefined]) {
      expect(await l.set({ pin })).toEqual({ ok: false, error: 'pin' });
      expect(await l.set({ pin, passkey: true })).toEqual({ ok: false, error: 'pin' });
    }
    expect(await l.set({ passkey: true })).toEqual({ ok: false, error: 'pin' });
    expect(await l.set({ pin: PIN, hint: `it is ${PIN}` })).toEqual({ ok: false, error: 'hint' });
    expect(l.isSet()).toBe(false);
    expect(fs.existsSync(file())).toBe(false);
    expect(helloAsked).toBe(0);
  });
});

describe('a lock: a 6-digit PIN', () => {
  it('is set with a recovery key shown once, and leaves the app open until it is next started', async () => {
    const l = lock();
    const made = await l.set({ pin: PIN, hint: '  my   old door ' });
    expect(made.ok).toBe(true);
    expect(made.recoveryKey).toMatch(KEY);
    expect(l.isSet()).toBe(true);
    expect(l.isOn()).toBe(true);
    expect(l.isLocked()).toBe(false);
    // A copy of the app started now is shut.
    const next = lock();
    expect(next.isLocked()).toBe(true);
    expect(await next.state()).toEqual({ ok: true, set: true, on: true, locked: true, pin: true, passkey: false, digits: 6, hint: 'my old door', waitMs: 0 });
  });

  it('keeps neither the PIN nor the recovery key, only what they hash to', async () => {
    const made = await lock().set({ pin: PIN });
    const kept = fs.readFileSync(file(), 'utf8');
    expect(kept).not.toContain(PIN);
    expect(kept).not.toContain(made.recoveryKey);
    expect(kept).not.toContain(made.recoveryKey.replace(/-/g, ''));
    const meta = JSON.parse(kept);
    expect(meta).toMatchObject({ v: 2, on: true, passkey: false, digits: 6 });
    expect(meta.pin.hash).toBeTruthy();
    expect(meta.pin.salt).not.toBe(meta.recovery.salt);
  });

  it('opens to the right PIN and to no other — and not to a passkey nobody added', async () => {
    await lock().set({ pin: PIN });
    const l = lock();
    expect(await l.unlock({ pin: '482194' })).toMatchObject({ ok: false, error: 'wrong', triesLeft: FREE_TRIES - 1, waitMs: 0 });
    expect(l.isLocked()).toBe(true);
    expect(await l.unlock({ pin: '48219' })).toEqual({ ok: false, error: 'pin' });       // not a PIN: not a guess
    expect(await l.unlock({})).toEqual({ ok: false, error: 'pin' });
    expect(await l.unlock({ hello: true })).toEqual({ ok: false, error: 'hello' });
    expect(helloAsked).toBe(0);
    expect(l.isLocked()).toBe(true);
    expect(await l.unlock({ pin: PIN })).toEqual({ ok: true });
    expect(l.isLocked()).toBe(false);
    // The wrong try is forgotten once the right PIN came.
    expect(onDisk().fails).toBeUndefined();
  });

  it('makes each try after the fifth wrong one wait, longer every time — across restarts', async () => {
    await lock().set({ pin: PIN });
    let l = lock();
    let last;
    for (let i = 0; i < FREE_TRIES; i += 1) last = await l.unlock({ pin: '000000' });
    expect(last).toMatchObject({ ok: false, error: 'wrong', triesLeft: 0, waitMs: waitAfter(FREE_TRIES) });
    // Even the right PIN waits now, and a restart does not shorten it.
    l = lock();
    expect(await l.unlock({ pin: PIN })).toMatchObject({ ok: false, error: 'wait', waitMs: waitAfter(FREE_TRIES) });
    expect((await l.state()).waitMs).toBe(waitAfter(FREE_TRIES));
    clock += waitAfter(FREE_TRIES) - 1;
    expect((await l.unlock({ pin: PIN })).error).toBe('wait');
    clock += 1;
    expect((await l.unlock({ pin: '000000' })).waitMs).toBe(waitAfter(FREE_TRIES + 1));
    expect(waitAfter(FREE_TRIES + 1)).toBeGreaterThan(waitAfter(FREE_TRIES));
    clock += waitAfter(FREE_TRIES + 1);
    expect(await l.unlock({ pin: PIN })).toEqual({ ok: true });
  });

  it('is shut again by "Lock now", and by nothing else while the app runs', async () => {
    const l = lock();
    await l.set({ pin: PIN });
    expect(l.isLocked()).toBe(false);
    expect(l.lockNow()).toBe(true);
    expect(l.isLocked()).toBe(true);
    expect(await l.unlock({ pin: PIN })).toEqual({ ok: true });
    expect(l.isLocked()).toBe(false);
  });

  it('opens to its recovery key, typed any way, and the lock is removed after', async () => {
    const made = await lock().set({ pin: PIN });
    const l = lock();
    expect(await l.unlock({ recovery: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA' })).toMatchObject({ ok: false, error: 'wrong' });
    expect(await l.unlock({ recovery: 'too short' })).toMatchObject({ ok: false, error: 'wrong' });
    expect(l.isLocked()).toBe(true);
    expect(await l.unlock({ recovery: ` ${made.recoveryKey.toLowerCase().replace(/-/g, ' ')} ` })).toEqual({ ok: true, cleared: true });
    expect(l.isLocked()).toBe(false);
    expect(l.isSet()).toBe(false);
    expect(lock().isLocked()).toBe(false);
  });
});

describe('turning the lock off is not removing it', () => {
  it('off: the app opens without asking, and the PIN, the hint and the recovery key are all kept', async () => {
    const l = lock();
    const made = await l.set({ pin: PIN, hint: 'door' });
    const before = onDisk();
    expect(await l.turn(false, { pin: '000000' })).toMatchObject({ ok: false, error: 'wrong' });
    expect(l.isOn()).toBe(true);
    expect(await l.turn(false, {})).toEqual({ ok: false, error: 'pin' });
    expect(await l.turn(false, { pin: PIN })).toEqual({ ok: true });
    expect(l.isSet()).toBe(true);
    expect(l.isOn()).toBe(false);
    expect(l.isLocked()).toBe(false);
    expect(l.lockNow()).toBe(false);
    const after = onDisk();
    expect(after).toMatchObject({ on: false, pin: before.pin, recovery: before.recovery, hint: 'door' });
    // The app started again does not ask.
    const next = lock();
    expect(next.isLocked()).toBe(false);
    expect(await next.state()).toMatchObject({ set: true, on: false, locked: false, pin: true, hint: 'door' });
    expect(made.recoveryKey).toMatch(KEY);
  });

  it('on again: with the same PIN, nothing asked — and the app that turned it on stays open', async () => {
    const l = lock();
    await l.set({ pin: PIN });
    await l.turn(false, { pin: PIN });
    expect(await lock().turn(true)).toEqual({ ok: true });
    const next = lock();
    expect(next.isLocked()).toBe(true);
    expect(await next.unlock({ pin: '111111' })).toMatchObject({ ok: false, error: 'wrong' });
    expect(await next.unlock({ pin: PIN })).toEqual({ ok: true });
    // Turning on a lock that is on changes nothing.
    expect(await next.turn(true)).toEqual({ ok: true });
    expect(next.isLocked()).toBe(false);
  });

  it('Remove lock forgets all of it, asked for its answer — on or off', async () => {
    const l = lock();
    await l.set({ pin: PIN });
    expect(await l.set({ pin: '111111' })).toEqual({ ok: false, error: 'set' });          // not replaced: removed first
    expect(await l.clear({ pin: '111111' })).toMatchObject({ ok: false, error: 'wrong' });
    expect(l.isSet()).toBe(true);
    await l.turn(false, { pin: PIN });
    expect(await l.clear({})).toEqual({ ok: false, error: 'pin' });
    expect(await l.clear({ pin: PIN })).toEqual({ ok: true });
    expect(l.isSet()).toBe(false);
    expect(fs.existsSync(file())).toBe(false);
    expect(lock().isLocked()).toBe(false);
    expect((await l.set({ pin: '111111' })).ok).toBe(true);
  });

  it('a lock that is off is removed by its recovery key too, when the PIN is forgotten', async () => {
    const l = lock();
    const made = await l.set({ pin: PIN });
    await l.turn(false, { pin: PIN });
    expect(await l.clear({ recovery: made.recoveryKey })).toEqual({ ok: true });
    expect(l.isSet()).toBe(false);
  });
});

describe('a passkey beside the PIN', () => {
  it('is added when the lock is set, only where there is one and after its yes', async () => {
    helloThere = false;
    expect(await lock().set({ pin: PIN, passkey: true })).toEqual({ ok: false, error: 'hello-unavailable' });
    helloThere = true;
    helloSays = false;
    expect(await lock().set({ pin: PIN, passkey: true })).toEqual({ ok: false, error: 'hello-refused' });
    expect(fs.existsSync(file())).toBe(false);
    helloSays = true;
    const made = await lock().set({ pin: PIN, passkey: true });
    expect(made.recoveryKey).toMatch(KEY);
    expect(await lock().state()).toMatchObject({ set: true, on: true, locked: true, pin: true, passkey: true, digits: 6 });
  });

  it('then either opens the app: the PIN, or the passkey — whichever is used', async () => {
    await lock().set({ pin: PIN, passkey: true });
    expect(await lock().unlock({ pin: PIN })).toEqual({ ok: true });
    expect(await lock().unlock({ hello: true })).toEqual({ ok: true });
    expect(await lock().unlock({ pin: '000000' })).toMatchObject({ ok: false, error: 'wrong' });
  });

  it('is asked only when asked for; a no is not counted as a wrong guess', async () => {
    await lock().set({ pin: PIN, passkey: true });
    helloAsked = 0;
    const l = lock();
    await l.state();
    await l.state({ withHello: true });
    expect(l.isLocked()).toBe(true);
    expect(helloAsked).toBe(0);
    helloSays = false;
    for (let i = 0; i < FREE_TRIES + 2; i += 1) expect(await l.unlock({ hello: true })).toEqual({ ok: false, error: 'hello-refused' });
    expect((await l.state()).waitMs).toBe(0);
    expect(await l.unlock({ pin: PIN })).toEqual({ ok: true });
  });

  it('gone from the computer, the PIN still opens the app', async () => {
    await lock().set({ pin: PIN, passkey: true });
    helloThere = false;
    const l = lock();
    expect(await l.unlock({ hello: true })).toEqual({ ok: false, error: 'hello-unavailable' });
    expect(await l.unlock({ pin: PIN })).toEqual({ ok: true });
  });

  it('is added later by whoever knows the PIN — the passkey itself is not asked to let itself in', async () => {
    const l = lock();
    await l.set({ pin: PIN });
    expect(await l.passkey(true, {})).toEqual({ ok: false, error: 'pin' });
    expect(await l.passkey(true, { hello: true })).toEqual({ ok: false, error: 'hello' });
    expect(await l.passkey(true, { pin: '000000' })).toMatchObject({ ok: false, error: 'wrong' });
    expect(helloAsked).toBe(0);
    helloSays = false;
    expect(await l.passkey(true, { pin: PIN })).toEqual({ ok: false, error: 'hello-refused' });
    expect((await l.state()).passkey).toBe(false);
    helloSays = true;
    expect(await l.passkey(true, { pin: PIN })).toEqual({ ok: true });
    expect((await l.state()).passkey).toBe(true);
    expect(onDisk().fails).toBeUndefined();
    expect(await lock().unlock({ hello: true })).toEqual({ ok: true });
  });

  it('is taken away at a press, and the PIN is the lock again', async () => {
    const l = lock();
    await l.set({ pin: PIN, passkey: true });
    expect(await l.passkey(false)).toEqual({ ok: true });
    expect((await l.state()).passkey).toBe(false);
    const next = lock();
    expect(await next.unlock({ hello: true })).toEqual({ ok: false, error: 'hello' });
    expect(await next.unlock({ pin: PIN })).toEqual({ ok: true });
  });

  it('turns the lock off, and removes it, as the PIN does', async () => {
    const l = lock();
    await l.set({ pin: PIN, passkey: true });
    helloSays = false;
    expect(await l.turn(false, { hello: true })).toEqual({ ok: false, error: 'hello-refused' });
    helloSays = true;
    expect(await l.turn(false, { hello: true })).toEqual({ ok: true });
    expect(l.isOn()).toBe(false);
    expect(await l.clear({ hello: true })).toEqual({ ok: true });
    expect(l.isSet()).toBe(false);
  });
});

describe('while the lock is shut', () => {
  it('nothing that asks no answer is a way in, or a way to change it', async () => {
    await lock().set({ pin: PIN, passkey: true });
    const l = lock();
    expect(l.isLocked()).toBe(true);
    // "Turn the lock on" on a lock that is on: nothing, and above all not open.
    expect(await l.turn(true)).toEqual({ ok: true });
    expect(l.isLocked()).toBe(true);
    expect(await l.passkey(false)).toEqual({ ok: false, error: 'locked' });
    expect((await l.state()).passkey).toBe(true);
    expect(await l.set({ pin: '111111' })).toEqual({ ok: false, error: 'set' });
    expect(await l.turn(false, {})).toEqual({ ok: false, error: 'pin' });
    expect(await l.clear({})).toEqual({ ok: false, error: 'pin' });
    expect(l.lockNow()).toBe(true);
    expect(l.isLocked()).toBe(true);
    expect(onDisk().pin.hash).toBeTruthy();
  });
});

describe('a lock of the first test build', () => {
  const v1 = (extra) => JSON.stringify({ v: 1, createdAt: 1, kdf: LIGHT, recovery: { salt: 'AAAA', hash: 'AAAA' }, ...extra });

  it('by PIN: read as a lock with that PIN, on', async () => {
    const made = await lock().set({ pin: PIN });
    expect(made.ok).toBe(true);
    const now = onDisk();
    fs.writeFileSync(file(), JSON.stringify({ v: 1, lock: 'pin', createdAt: 1, kdf: now.kdf, digits: 6, pin: now.pin, recovery: now.recovery }));
    const l = lock();
    expect(await l.state()).toMatchObject({ set: true, on: true, locked: true, pin: true, passkey: false });
    expect(await l.unlock({ pin: PIN })).toEqual({ ok: true });
  });

  it('by passkey alone: opened by the passkey, removed by it — and it cannot lose the passkey', async () => {
    fs.writeFileSync(file(), v1({ lock: 'hello' }));
    const l = lock();
    expect(await l.state()).toMatchObject({ set: true, on: true, locked: true, pin: false, passkey: true, digits: 0 });
    expect(await l.unlock({ pin: PIN })).toEqual({ ok: false, error: 'pin' });
    expect(await l.unlock({ hello: true })).toEqual({ ok: true });
    expect(await l.passkey(false)).toEqual({ ok: false, error: 'pin' });
    expect(await l.clear({ hello: true })).toEqual({ ok: true });
    expect(l.isSet()).toBe(false);
  });
});

describe('asked for its state as the app opens', () => {
  it('does not wait to find out whether the computer has a passkey — only Settings asks that', async () => {
    let asked = 0;
    const l = new AppLock({ file, kdf: LIGHT, now: () => clock, helloAvailable: async () => { asked += 1; return true; } });
    expect(await l.state()).toEqual({ ok: true, set: false, on: false, locked: false, pin: false, passkey: false, digits: 0, hint: '', waitMs: 0 });
    await l.set({ pin: PIN });
    l.lockNow();
    expect(await l.state()).toMatchObject({ set: true, locked: true, pin: true });
    expect(asked).toBe(0);
    expect((await l.state({ withHello: true })).hello).toBe(true);
    expect(asked).toBe(1);
  });
});

describe('asked before every note is handed over', () => {
  it('looks the lock up on the disk once, and stays true to it through every change', async () => {
    let reads = 0;
    const counted = new AppLock({ file: () => { reads += 1; return file(); }, kdf: LIGHT, now: () => clock });
    for (let i = 0; i < 50; i += 1) expect(counted.isLocked()).toBe(false);
    expect(reads).toBe(1);
    await counted.set({ pin: PIN });
    expect(counted.isSet()).toBe(true);
    expect(counted.lockNow()).toBe(true);
    const before = reads;
    for (let i = 0; i < 50; i += 1) expect(counted.isLocked()).toBe(true);
    expect(reads).toBe(before);
    await counted.unlock({ pin: PIN });
    await counted.turn(false, { pin: PIN });
    expect(counted.isLocked()).toBe(false);
    expect(counted.lockNow()).toBe(false);
    await counted.turn(true);
    expect(counted.lockNow()).toBe(true);
    await counted.clear({ pin: PIN });
    expect(counted.isSet()).toBe(false);
    expect(counted.lockNow()).toBe(false);
    expect((await counted.set({ pin: '111111' })).ok).toBe(true);
    expect(counted.isSet()).toBe(true);
  });
});

describe('a lock file that is not one', () => {
  it('is no lock: a damaged file must not shut the notes away for good', async () => {
    const texts = ['', 'not json', '{}', 'null', '[]',
      JSON.stringify({ v: 2, on: true, recovery: { hash: 'x' } }),                                  // neither a PIN nor a passkey
      JSON.stringify({ v: 2, on: true, pin: { hash: 'x' } }),                                       // no recovery key
      JSON.stringify({ v: 1, lock: 'pin', recovery: { hash: 'x' } }),                               // the first build's, with no PIN
      JSON.stringify({ v: 3, on: true, pin: { hash: 'x' }, recovery: { hash: 'x' } })];
    for (const text of texts) {
      fs.writeFileSync(file(), text);
      expect(lock().isSet(), text).toBe(false);
      expect(lock().isLocked(), text).toBe(false);
    }
  });
});

describe('an answer that arrives after "Lock now" (2026-10-17 security audit)', () => {
  const tick = () => new Promise((r) => setImmediate(r));
  /** A hello the test holds: the passkey answers when the test says so. */
  const gated = () => {
    const waiting = [];
    const l = new AppLock({ file, kdf: LIGHT, now: () => clock, hello: () => new Promise((r) => { waiting.push(r); }), helloAvailable: async () => true });
    return { l, hello: (yes = true) => { for (const r of waiting.splice(0)) r(yes); } };
  };

  it('a passkey answer that outlived "Lock now" opens nothing', async () => {
    await lock().set({ pin: PIN, passkey: true });
    const { l, hello } = gated();
    expect(l.isLocked()).toBe(true);
    const pending = l.unlock({ hello: true });       // the prompt is up
    await tick();
    expect(l.lockNow()).toBe(true);                   // "Lock now" while the prompt is up
    hello(true);                                      // ... and the passkey says yes anyway
    expect(await pending).toEqual({ ok: false, error: 'locked' });
    expect(l.isLocked()).toBe(true);
    expect(await l.unlock({ pin: PIN })).toEqual({ ok: true });
  });

  it('a passkey asked for is not added after the lock was removed meanwhile — the removed lock is not written back', async () => {
    const { l, hello } = gated();
    expect((await l.set({ pin: PIN })).ok).toBe(true);
    const pending = l.passkey(true, { pin: PIN });
    await tick();
    expect(await l.clear({ pin: PIN })).toEqual({ ok: true });   // the lock is gone while its yes is on its way
    hello(true);
    expect(await pending).toEqual({ ok: false, error: 'locked' });
    expect(l.isSet()).toBe(false);
    expect(fs.existsSync(file())).toBe(false);
  });

  it('a pending answer is not an opening after the lock was turned off meanwhile', async () => {
    await lock().set({ pin: PIN, passkey: true });
    const { l, hello } = gated();
    expect(l.isLocked()).toBe(true);
    const pending = l.unlock({ hello: true });
    await tick();
    expect(await l.turn(false, { pin: PIN })).toEqual({ ok: true });   // turned off while the prompt was up
    hello(true);
    expect(await pending).toEqual({ ok: false, error: 'locked' });
    expect(l.isLocked()).toBe(false);   // off: it opens without asking anyway
  });

  it('a late "set" does not write over a lock set meanwhile', async () => {
    const { l, hello } = gated();
    const first = l.set({ pin: '111111', passkey: true });          // at its passkey prompt
    await tick();
    expect((await lock().set({ pin: '222222' })).ok).toBe(true);    // set and finished while the first was asked for
    hello(true);
    expect(await first).toEqual({ ok: false, error: 'set' });
    const next = lock();
    expect(await next.unlock({ pin: '111111' })).toMatchObject({ ok: false, error: 'wrong' });
    expect(await next.unlock({ pin: '222222' })).toEqual({ ok: true });
  });
});
