// @vitest-environment node
/**
 * Black holes (0.9.4): notes kept encrypted — what the main process does with
 * keys and files. Real folders in the system's temp directory; the operating
 * system's part (safeStorage, Windows Hello) is played by the test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlackHoles, newRecoveryKey, cleanRecoveryKey, cleanHoleName, cleanHint, waitAfter, FREE_TRIES, readHelloAnswer, WINDOWS_HELLO_SCRIPT, VIDEO_PIECE } from '../electron/black-holes.js';
import { purgeHoleNoteFromBackups, purgeHoleFromBackups, purgeHoleFilesFromBackups } from '../electron/backup-purge.js';

const LIGHT = { name: 'scrypt', N: 1 << 10, r: 8, p: 1 };      // the real one takes a fifth of a second a try
const SECRET = 'the launch codes are 0000';
const note = (id, extra = {}) => JSON.stringify({ id, title: `Title of ${id}`, content: `<p>${SECRET}</p><img src="data:image/png;base64,${'A'.repeat(900)}">`, createdAt: 1, updatedAt: 2, ...extra });

let root;
let clock;
let helloSays;
/** This computer's user, as safeStorage is: what one wraps another cannot open. */
const computer = (name) => ({
  canProtect: () => true,
  protect: (plain) => Buffer.concat([Buffer.from(`${name}:`), Buffer.from(plain).map((b) => b ^ 0x5a)]),
  unprotect: (box) => {
    if (!box.subarray(0, name.length + 1).equals(Buffer.from(`${name}:`))) throw new Error('not this user');
    return Buffer.from(box.subarray(name.length + 1)).map((b) => b ^ 0x5a);
  },
});
const holes = (on = computer('mine'), extra = {}) => new BlackHoles({
  root: () => path.join(root, 'storage', 'blackholes'), kdf: LIGHT, now: () => clock,
  hello: async () => helloSays, helloAvailable: async () => true, ...on, ...extra,
});
/** As the first builds made them: `create` may make a black hole that a passkey alone opens. */
const firstBuild = (on = computer('mine'), extra = {}) => holes(on, { passkeyOnly: true, ...extra });
const everyFile = (dir = root) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? everyFile(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const onDisk = () => everyFile().map((f) => fs.readFileSync(f).toString('latin1')).join('\n');

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-holes-')); clock = 1_000_000; helloSays = true; });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('a black hole', () => {
  it('is made with a name and a 6-digit PIN, open, with a recovery key shown once', async () => {
    const h = holes();
    const made = await h.create({ name: '  My   secrets ', lock: 'pin', pin: '482193' });
    expect(made.ok).toBe(true);
    expect(made.hole).toMatchObject({ name: 'My secrets', lock: 'pin', digits: 6, notes: 0, open: true });
    expect(made.recoveryKey).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(h.list()).toHaveLength(1);
    expect(onDisk()).not.toContain(made.recoveryKey);
    expect(onDisk()).not.toContain('482193');
    expect(onDisk()).not.toContain('My secrets');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'storage', 'blackholes', made.hole.id, 'hole.json'), 'utf8')).nameBox).toBeTruthy();
  });

  it('protects a legacy clear-text label on the next read without changing the visible label', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Private label', pin: '482193' });
    const file = path.join(root, 'storage', 'blackholes', hole.id, 'hole.json');
    const old = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete old.nameBox;
    old.name = 'Private label';
    fs.writeFileSync(file, JSON.stringify(old));
    h.lock(hole.id);
    expect(holes().list()[0].name).toBe('Private label');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('Private label');
  });

  it('needs a name, a way to lock it, and exactly six digits', async () => {
    const h = holes();
    expect((await h.create({ name: ' ', lock: 'pin', pin: '123456' })).error).toBe('name');
    expect((await h.create({ name: 'x', lock: 'word', pin: '123456' })).error).toBe('lock');
    for (const pin of ['123', '1234', '12345', '1234567', 'abcdef', '', undefined]) expect((await h.create({ name: 'x', lock: 'pin', pin })).error).toBe('pin');
    expect(h.list()).toEqual([]);
  });
});

describe('a note in a black hole', () => {
  it('is on the disk sealed whole: no title, no word, no picture can be read there', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    expect(h.write(hole.id, 'n1', note('n1')).ok).toBe(true);
    const files = everyFile().map((f) => path.relative(root, f).replace(/\\/g, '/'));
    expect(files.sort()).toEqual([`storage/blackholes/${hole.id}/hole.json`, `storage/blackholes/${hole.id}/n1.bh`]);
    const disk = onDisk();
    expect(disk).not.toContain(SECRET);
    expect(disk).not.toContain('Title of n1');
    expect(disk).not.toContain('AAAAAAAAAAAAAAAA');
    expect(disk).not.toContain('data:image');
    expect(fs.readFileSync(path.join(root, 'storage', 'blackholes', hole.id, 'n1.bh')).subarray(0, 4).toString()).toBe('NBH1');
  });

  it('comes back exactly as it was, with the right PIN', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    h.write(hole.id, 'n2', note('n2', { pinned: true }));
    h.lock(hole.id);
    expect(h.list()[0]).toMatchObject({ open: false, notes: 2 });
    const opened = await holes().unlock(hole.id, { pin: '482193' });
    expect(opened.ok).toBe(true);
    expect(opened.damaged).toBe(0);
    expect(opened.notes.sort()).toEqual([note('n1'), note('n2', { pinned: true })].sort());
  });

  it('does not reveal a note whose asynchronous read finishes after the hole locks', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    h.lock(hole.id);
    const original = fs.promises.readFile;
    const spy = vi.spyOn(fs.promises, 'readFile').mockImplementation(async (...args) => {
      const bytes = await original(...args);
      if (String(args[0]).endsWith('n1.bh')) h.lock(hole.id);
      return bytes;
    });
    try { expect(await h.unlock(hole.id, { pin: '482193' })).toEqual({ ok: false, error: 'locked' }); }
    finally { spy.mockRestore(); }
    expect(h.isOpen(hole.id)).toBe(false);
  });

  it('keeps an asynchronous large-note write off the delete path and cancels it on lock', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', pin: '482193' });
    const pending = h.writeAsync(hole.id, 'n-large', note('n-large', { content: 'x'.repeat(2_000_000) }));
    expect(await h.remove(hole.id, 'n-large')).toMatchObject({ ok: false, error: 'in-use' });
    h.lock(hole.id);
    expect(await pending).toMatchObject({ ok: false, error: 'locked' });
    expect(fs.existsSync(path.join(root, 'storage', 'blackholes', hole.id, 'n-large.bh'))).toBe(false);
    expect((await h.unlock(hole.id, { pin: '482193' })).ok).toBe(true);
    expect(await h.writeAsync(hole.id, 'n-large', note('n-large'))).toEqual({ ok: true });
    const latest = note('n-large', { title: 'Latest sealed edit' });
    expect(await h.writeAsync(hole.id, 'n-large', latest)).toEqual({ ok: true });
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { pin: '482193' })).notes).toContain(latest);
  });

  it('is sealed afresh at every save, and cannot be written to a locked black hole', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const file = path.join(root, 'storage', 'blackholes', hole.id, 'n1.bh');
    h.write(hole.id, 'n1', note('n1'));
    const first = fs.readFileSync(file);
    h.write(hole.id, 'n1', note('n1'));
    expect(fs.readFileSync(file).equals(first)).toBe(false);      // a new nonce: the same note never looks the same twice
    h.lock(hole.id);
    expect(h.write(hole.id, 'n1', note('n1', { title: 'later' }))).toEqual({ ok: false, error: 'locked' });
  });

  it('does not open in another place: a file moved between black holes or renamed is refused, the rest still open', async () => {
    const h = holes();
    const a = (await h.create({ name: 'A', lock: 'pin', pin: '111111' })).hole;
    h.write(a.id, 'n1', note('n1'));
    h.write(a.id, 'n2', note('n2'));
    const dir = path.join(root, 'storage', 'blackholes', a.id);
    fs.renameSync(path.join(dir, 'n2.bh'), path.join(dir, 'n3.bh'));
    const bytes = fs.readFileSync(path.join(dir, 'n1.bh'));
    bytes[bytes.length - 20] ^= 1;
    fs.writeFileSync(path.join(dir, 'n4.bh'), bytes);
    h.lock(a.id);
    const opened = await h.unlock(a.id, { pin: '111111' });
    expect(opened.notes).toEqual([note('n1')]);
    expect(opened.damaged).toBe(2);
  });

  it('is gone for good when deleted, and the whole black hole with it', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    h.write(hole.id, 'n2', note('n2'));
    expect((await h.remove(hole.id, 'n1')).ok).toBe(true);
    expect(h.list()[0].notes).toBe(1);
    // Only with its answer — open as it is: whoever found the app open deletes nothing.
    expect(await h.delete(hole.id)).toEqual({ ok: false, error: 'pin' });
    expect(await h.delete(hole.id, { pin: '000000' })).toMatchObject({ ok: false, error: 'wrong' });
    expect(h.list()[0].notes).toBe(1);
    expect(await h.delete(hole.id, { pin: '482193' })).toEqual({ ok: true, removed: 2 });
    expect(h.list()).toEqual([]);
    expect(fs.existsSync(path.join(root, 'storage', 'blackholes', hole.id))).toBe(false);
    expect((await h.remove('..', 'n1')).ok).toBe(false);
    expect((await h.delete('../..', { pin: '482193' })).ok).toBe(false);
  });

  it('goes to the Trash whole and locked, cannot be opened there, and comes back as it was', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193', hint: 'the usual' });
    h.write(hole.id, 'n1', note('n1'));
    const dir = path.join(root, 'storage', 'blackholes', hole.id);
    const sealed = fs.readFileSync(path.join(dir, 'n1.bh'));
    expect(h.list()[0].trashedAt).toBe(0);

    clock = 2_000_000;
    const binned = h.trash(hole.id);
    expect(binned.ok).toBe(true);
    expect(binned.hole).toMatchObject({ id: hole.id, name: 'Safe', notes: 1, open: false, trashedAt: 2_000_000 });
    expect(h.isOpen(hole.id)).toBe(false);                                 // its key is let go of
    expect(h.list()[0].trashedAt).toBe(2_000_000);                         // still listed: the window draws it in the Trash
    expect(fs.readFileSync(path.join(dir, 'n1.bh')).equals(sealed)).toBe(true);   // nothing of its notes changes
    expect(onDisk()).not.toContain(SECRET);
    // Not opened there — by its PIN or by its recovery key — and a wrong PIN is not counted either.
    expect(await h.unlock(hole.id, { pin: '482193' })).toEqual({ ok: false, error: 'trashed' });
    expect(await h.unlock(hole.id, { pin: '000000' })).toEqual({ ok: false, error: 'trashed' });
    expect(h.write(hole.id, 'n2', note('n2')).ok).toBe(false);
    clock = 3_000_000;
    expect(h.trash(hole.id).hole.trashedAt).toBe(2_000_000);              // a second time changes nothing

    const back = h.restore(hole.id);
    expect(back.hole).toMatchObject({ trashedAt: 0, open: false, notes: 1, hint: 'the usual' });
    expect('trashedAt' in JSON.parse(fs.readFileSync(path.join(dir, 'hole.json'), 'utf8'))).toBe(false);
    expect((await h.unlock(hole.id, { pin: '482193' })).notes).toEqual([note('n1')]);
    expect(h.restore(hole.id).ok).toBe(true);                               // restoring one that is not there is no fault
    expect(h.trash('nope').ok).toBe(false);
    expect(h.restore('../..').ok).toBe(false);
  });

  it('an open one is locked by going to the Trash, and from the Trash it is deleted for good', async () => {
    const h = firstBuild();
    const { hole } = await h.create({ name: 'Open', lock: 'hello' });
    h.write(hole.id, 'n1', note('n1'));
    expect(h.isOpen(hole.id)).toBe(true);
    expect(h.trash(hole.id).hole.open).toBe(false);
    expect(await h.unlock(hole.id, { hello: true })).toEqual({ ok: false, error: 'trashed' });
    expect(await h.delete(hole.id)).toEqual({ ok: false, error: 'hello' });
    helloSays = false;
    expect(await h.delete(hole.id, { hello: true })).toEqual({ ok: false, error: 'hello-refused' });
    expect(h.list()).toHaveLength(1);
    helloSays = true;
    expect(await h.delete(hole.id, { hello: true })).toEqual({ ok: true, removed: 2 });
    expect(h.list()).toEqual([]);
  });
});

describe('the PIN', () => {
  it('wrong, opens nothing and says how many tries are left; after five every try has to wait, longer each time', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.lock(hole.id);
    for (let i = 1; i <= FREE_TRIES; i += 1) {
      const res = await h.unlock(hole.id, { pin: '000000' });
      expect(res).toMatchObject({ ok: false, error: 'wrong', triesLeft: FREE_TRIES - i });
    }
    expect(waitAfter(FREE_TRIES)).toBe(30_000);
    expect(await h.unlock(hole.id, { pin: '482193' })).toMatchObject({ ok: false, error: 'wait' });   // even the right one waits
    expect(h.list()[0].waitMs).toBe(30_000);
    clock += 30_001;
    expect((await h.unlock(hole.id, { pin: '000000' })).waitMs).toBe(60_000);
    clock += 60_001;
    expect((await h.unlock(hole.id, { pin: '482193' })).ok).toBe(true);
    expect(h.list()[0].waitMs).toBe(0);
    expect(waitAfter(40)).toBe(15 * 60_000);                    // never longer than a quarter of an hour
  });

  it('is remembered across a restart of the app, the count of wrong tries too', async () => {
    const { hole } = await holes().create({ name: 'Safe', lock: 'pin', pin: '482193' });
    await holes().unlock(hole.id, { pin: '000000' });
    expect((await holes().unlock(hole.id, { pin: '000001' })).triesLeft).toBe(FREE_TRIES - 2);
    expect((await holes().unlock(hole.id, { pin: '482193' })).ok).toBe(true);
  });

  it('can be changed while the black hole is open — after its old answer; the old one is then no key', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    // Being open is not knowing it: no answer, or the wrong one, changes nothing.
    expect(await h.changePin(hole.id, '909090')).toEqual({ ok: false, error: 'pin' });
    expect((await h.changePin(hole.id, '909090', { pin: '000000' })).error).toBe('wrong');
    expect(await h.changePin(hole.id, '12', { pin: '482193' })).toMatchObject({ ok: false });
    expect((await h.changePin(hole.id, '909090', { pin: '482193' })).ok).toBe(true);
    // The passkey answers for whoever does not know the current PIN.
    expect((await h.changePin(hole.id, '314159', { hello: true })).error).toBe('hello');   // it has no passkey
    h.lock(hole.id);
    expect(await h.changePin(hole.id, '111111', { pin: '909090' })).toEqual({ ok: false, error: 'locked' });
    expect((await h.unlock(hole.id, { pin: '482193' })).error).toBe('wrong');
    expect((await h.unlock(hole.id, { pin: '909090' })).notes).toEqual([note('n1')]);
  });

  it('may have a hint: kept in the clear beside the name, shown to whoever is asked — and never one that tells the PIN', async () => {
    const h = holes();
    expect((await h.create({ name: 'Told', lock: 'pin', pin: '482193', hint: 'it is 482193' })).error).toBe('hint');
    expect((await h.create({ name: 'Told', lock: 'pin', pin: '482193', hint: '48 21 93, backwards no' })).error).toBe('hint');
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193', hint: '  the   year we moved, twice ' });
    expect(hole.hint).toBe('the year we moved, twice');
    expect(cleanHint('x'.repeat(200))).toHaveLength(80);
    expect(cleanHint(`${'x'.repeat(79)}🌙 hint`)).toBe(`${'x'.repeat(79)}🌙`); // hunt B24: never half an emoji
    h.lock(hole.id);
    expect(h.list()[0].hint).toBe('the year we moved, twice');   // a locked black hole shows it: that is what it is for
    expect(h.setHint(hole.id, 'another')).toEqual({ ok: false, error: 'locked' });   // but only its owner changes it
    await h.unlock(hole.id, { pin: '482193' });
    expect(h.setHint(hole.id, 'grandmother’s door').hole.hint).toBe('grandmother’s door');
    // A new PIN that the hint would tell takes the hint away.
    h.setHint(hole.id, 'starts with 9090 90');
    expect((await h.changePin(hole.id, '909090', { pin: '482193' })).ok).toBe(true);
    expect(h.list()[0].hint).toBe('');
    expect(h.setHint(hole.id, '').hole.hint).toBe('');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'storage', 'blackholes', hole.id, 'hole.json'), 'utf8')).hint).toBeUndefined();
    // A black hole opened by the passkey has no PIN to be reminded of.
    const old = firstBuild();
    const finger = (await old.create({ name: 'Finger', lock: 'hello', hint: 'ignored' })).hole;
    expect(finger.hint).toBe('');
    expect(old.setHint(finger.id, 'x')).toEqual({ ok: false, error: 'lock' });
  });

  it('of four digits, from the first build, still opens its black hole — and is six from its next change', async () => {
    const old = holes(computer('mine'), { digits: 4 });
    const { hole } = await old.create({ name: 'Old', lock: 'pin', pin: '4821' });
    old.write(hole.id, 'n1', note('n1'));
    // As the first build wrote it: nothing about the PIN's length.
    const file = path.join(root, 'storage', 'blackholes', hole.id, 'hole.json');
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete meta.digits;
    fs.writeFileSync(file, JSON.stringify(meta));
    const h = holes();
    expect(h.list()[0]).toMatchObject({ lock: 'pin', digits: 4 });
    expect((await h.unlock(hole.id, { pin: '482100' })).error).toBe('pin');       // six digits are not its PIN
    expect((await h.unlock(hole.id, { pin: '4821' })).notes).toEqual([note('n1')]);
    expect(await h.changePin(hole.id, '9090', { pin: '4821' })).toMatchObject({ ok: false, error: 'pin' });
    expect((await h.changePin(hole.id, '909090', { pin: '4821' })).ok).toBe(true);
    h.lock(hole.id);
    expect(h.list()[0].digits).toBe(6);
    expect((await h.unlock(hole.id, { pin: '4821' })).error).toBe('pin');
    expect((await h.unlock(hole.id, { pin: '909090' })).ok).toBe(true);
  });
});

describe('off this computer', () => {
  it('the files cannot be opened with the PIN: the key is wrapped for this user by the operating system', async () => {
    const { hole } = await holes(computer('mine')).create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const elsewhere = holes(computer('thief'));
    expect(await elsewhere.unlock(hole.id, { pin: '482193' })).toEqual({ ok: false, error: 'other-computer' });
    expect(elsewhere.list()[0]).toMatchObject({ open: false, waitMs: 0 });      // and that is not a wrong PIN
  });

  it('the recovery key opens it, with a new PIN, and from then on that PIN does', async () => {
    const mine = holes(computer('mine'));
    const { hole, recoveryKey } = await mine.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    mine.write(hole.id, 'n1', note('n1'));
    const other = holes(computer('new laptop'));
    expect((await other.unlock(hole.id, { recovery: recoveryKey })).error).toBe('pin');
    expect((await other.unlock(hole.id, { recovery: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA', pin: '777777' })).error).toBe('wrong');
    const typed = recoveryKey.toLowerCase().replace(/-/g, ' ');           // however it is typed
    expect((await other.unlock(hole.id, { recovery: typed, pin: '777777' })).notes).toEqual([note('n1')]);
    other.lock(hole.id);
    expect((await other.unlock(hole.id, { pin: '777777' })).ok).toBe(true);
    expect(cleanRecoveryKey(typed)).toBe(recoveryKey.replace(/-/g, ''));
    expect(newRecoveryKey(Buffer.alloc(20))).toBe('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA');
  });

  it('a new recovery key replaces the old one, which stops working', async () => {
    const h = holes(computer('mine'));
    const { hole, recoveryKey: oldKey } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    h.lock(hole.id);
    expect(h.newRecovery(hole.id)).toEqual({ ok: false, error: 'locked' });     // only while it is open
    expect((await h.unlock(hole.id, { pin: '482193' })).ok).toBe(true);
    const res = h.newRecovery(hole.id);
    expect(res.ok).toBe(true);
    expect(res.recoveryKey).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(res.recoveryKey).not.toBe(oldKey);
    expect(onDisk()).not.toContain(res.recoveryKey);                            // shown once, never on the disk
    h.lock(hole.id);
    const other = holes(computer('new laptop'));
    expect((await other.unlock(hole.id, { recovery: oldKey, pin: '777777' })).error).toBe('wrong');
    expect((await other.unlock(hole.id, { recovery: res.recoveryKey, pin: '777777' })).notes).toEqual([note('n1')]);
  });

  it('refuses a new PIN wrapper when OS secure storage is unavailable', async () => {
    const bare = holes({ canProtect: () => false });
    expect(await bare.create({ name: 'Safe', lock: 'pin', pin: '482193' })).toEqual({ ok: false, error: 'storage-unavailable' });
    expect(bare.list()).toEqual([]);
  });

  it('keeps an old unprotected wrapper readable, then upgrades it on a valid PIN when OS protection returns', async () => {
    let available = true;
    const machine = { ...computer('mine'), canProtect: () => available };
    const maker = holes(machine);
    const { hole } = await maker.create({ name: 'Safe', pin: '482193' });
    maker.write(hole.id, 'n1', note('n1'));
    maker.lock(hole.id);
    const file = path.join(root, 'storage', 'blackholes', hole.id, 'hole.json');
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    meta.key.box = machine.unprotect(Buffer.from(meta.key.box, 'base64')).toString('base64');
    meta.key.os = false; // a legacy wrapper written while safeStorage was unavailable
    fs.writeFileSync(file, JSON.stringify(meta));
    available = false;
    const legacy = holes(machine);
    expect(legacy.list()[0].needsProtection).toBe(true);
    expect((await legacy.unlock(hole.id, { pin: '482193' })).notes).toEqual([note('n1')]);
    expect(await legacy.changePin(hole.id, '777777', { pin: '482193' })).toEqual({ ok: false, error: 'storage-unavailable' });
    legacy.lock(hole.id);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).key.os).toBe(false);
    available = true;
    expect((await legacy.unlock(hole.id, { pin: '482193' })).ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).key.os).toBe(true);
    expect(legacy.list()[0].needsProtection).toBe(false);
    legacy.lock(hole.id);
    expect((await holes(computer('thief')).unlock(hole.id, { pin: '482193' })).error).toBe('other-computer');
    expect((await holes(machine).unlock(hole.id, { pin: '482193' })).notes).toEqual([note('n1')]);
  });
});

describe('the PIN is the lock; a passkey stands beside it', () => {
  it('no black hole is made without a PIN — a passkey alone is not a lock', async () => {
    const h = holes();
    expect(await h.create({ name: 'x', lock: 'hello' })).toEqual({ ok: false, error: 'pin' });
    expect(await h.create({ name: 'x', passkey: true })).toEqual({ ok: false, error: 'pin' });
    expect(await h.create({ name: 'x', pin: '1234', passkey: true })).toEqual({ ok: false, error: 'pin' });
    expect(h.list()).toEqual([]);
  });

  it('with a passkey added at the start, either opens it — only after the passkey said yes to being added', async () => {
    const h = holes();
    helloSays = false;
    expect((await h.create({ name: 'Both', pin: '482193', passkey: true })).error).toBe('hello-refused');
    expect((await holes(computer('mine'), { helloAvailable: async () => false }).create({ name: 'Both', pin: '482193', passkey: true })).error).toBe('hello-unavailable');
    expect(h.list()).toEqual([]);
    helloSays = true;
    const { hole } = await h.create({ name: 'Both', pin: '482193', passkey: true });
    expect(hole).toMatchObject({ lock: 'pin', pin: true, passkey: true, digits: 6 });
    h.write(hole.id, 'n1', note('n1'));
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { pin: '482193' })).notes).toEqual([note('n1')]);
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { hello: true })).notes).toEqual([note('n1')]);
    h.lock(hole.id);
    helloSays = false;
    expect((await h.unlock(hole.id, { hello: true })).error).toBe('hello-refused');
    expect((await h.unlock(hole.id, { pin: '482193' })).ok).toBe(true);
    // Nothing of the key can be read in what is kept for the passkey, either.
    expect(onDisk()).not.toContain(SECRET);
  });

  it('a black hole with no passkey does not open to one', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Pin only', pin: '482193' });
    expect(hole).toMatchObject({ pin: true, passkey: false });
    h.lock(hole.id);
    expect(await h.unlock(hole.id, { hello: true })).toEqual({ ok: false, error: 'hello' });
    expect(await h.prove(hole.id, { hello: true })).toEqual({ ok: false, error: 'hello' });
  });

  it('a passkey is added to an open black hole, and taken away again', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Later', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    helloSays = false;
    expect(await h.setPasskey(hole.id, true)).toEqual({ ok: false, error: 'hello-refused' });
    helloSays = true;
    expect((await h.setPasskey(hole.id, true)).hole.passkey).toBe(true);
    h.lock(hole.id);
    expect(await h.setPasskey(hole.id, false)).toEqual({ ok: false, error: 'locked' });      // shut: nothing is changed
    expect((await h.unlock(hole.id, { hello: true })).notes).toEqual([note('n1')]);
    expect((await h.setPasskey(hole.id, false)).hole.passkey).toBe(false);
    h.lock(hole.id);
    expect(await h.unlock(hole.id, { hello: true })).toEqual({ ok: false, error: 'hello' });
    expect((await h.unlock(hole.id, { pin: '482193' })).ok).toBe(true);
  });

  it('the PIN is changed without the passkey being lost — the passkey answers for the current PIN too', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Both', pin: '482193', passkey: true });
    expect((await h.changePin(hole.id, '111111', { pin: '482193' })).ok).toBe(true);
    expect((await h.changePin(hole.id, '222222', { hello: true })).ok).toBe(true);
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { pin: '482193' })).error).toBe('wrong');
    expect((await h.unlock(hole.id, { hello: true })).ok).toBe(true);
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { pin: '222222' })).ok).toBe(true);
  });

  it('on another computer the passkey’s copy is no key; the recovery key opens it and the passkey is added anew', async () => {
    const h = holes();
    const { hole, recoveryKey } = await h.create({ name: 'Both', pin: '482193', passkey: true });
    h.lock(hole.id);
    const there = holes(computer('new laptop'));
    expect((await there.unlock(hole.id, { hello: true })).error).toBe('other-computer');
    expect((await there.unlock(hole.id, { recovery: recoveryKey, pin: '222222' })).ok).toBe(true);
    expect(there.list()[0]).toMatchObject({ pin: true, passkey: false });
    expect((await there.setPasskey(hole.id, true)).hole.passkey).toBe(true);
    there.lock(hole.id);
    expect((await there.unlock(hole.id, { hello: true })).ok).toBe(true);
  });
});

describe('its answer, asked once more', () => {
  it('prove: the PIN, the passkey or the recovery key — open or shut, and nothing changes', async () => {
    const h = holes();
    const { hole, recoveryKey } = await h.create({ name: 'Safe', pin: '482193', passkey: true });
    h.write(hole.id, 'n1', note('n1'));
    const before = fs.readFileSync(path.join(root, 'storage', 'blackholes', hole.id, 'hole.json'), 'utf8');
    for (const open of [true, false]) {
      if (!open) h.lock(hole.id);
      expect(await h.prove(hole.id, { pin: '482193' })).toEqual({ ok: true });
      expect(await h.prove(hole.id, { hello: true })).toEqual({ ok: true });
      expect(await h.prove(hole.id, { recovery: recoveryKey })).toEqual({ ok: true });
      expect(await h.prove(hole.id, {})).toEqual({ ok: false, error: 'pin' });
      expect(h.isOpen(hole.id)).toBe(open);
    }
    expect(fs.readFileSync(path.join(root, 'storage', 'blackholes', hole.id, 'hole.json'), 'utf8')).toBe(before);
    expect(await h.prove('nope', { pin: '482193' })).toEqual({ ok: false, error: 'missing' });
  });

  it('a wrong one is counted like a wrong PIN at the door, and waits the same', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', pin: '482193' });
    let last;
    for (let i = 0; i < FREE_TRIES; i += 1) last = await h.prove(hole.id, { pin: '000000' });
    expect(last).toMatchObject({ ok: false, error: 'wrong', triesLeft: 0, waitMs: waitAfter(FREE_TRIES) });
    expect((await h.prove(hole.id, { pin: '482193' })).error).toBe('wait');
    expect((await h.delete(hole.id, { pin: '482193' })).error).toBe('wait');
    clock += waitAfter(FREE_TRIES);
    expect(await h.prove(hole.id, { pin: '482193' })).toEqual({ ok: true });
    expect(h.list()[0].waitMs).toBe(0);
  });

  it('a black hole in the Trash is deleted only with it — by the recovery key too, when the PIN is forgotten', async () => {
    const h = holes();
    const { hole, recoveryKey } = await h.create({ name: 'Forgotten', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    h.trash(hole.id);
    expect(await h.delete(hole.id, {})).toEqual({ ok: false, error: 'pin' });
    expect(await h.delete(hole.id, { recovery: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA' })).toMatchObject({ ok: false, error: 'wrong' });
    expect(h.list()).toHaveLength(1);
    expect(await h.delete(hole.id, { recovery: recoveryKey })).toEqual({ ok: true, removed: 2 });
    expect(h.list()).toEqual([]);
  });
});

describe('a black hole opened by Windows Hello or Touch ID — as the first builds made them', () => {
  it('takes a PIN when one is set for it, and is a PIN black hole with a passkey beside it from then on', async () => {
    const h = firstBuild();
    const { hole } = await h.create({ name: 'Finger', lock: 'hello' });
    expect(hole).toMatchObject({ lock: 'hello', pin: false, passkey: true, digits: 0 });
    h.write(hole.id, 'n1', note('n1'));
    expect(await h.setPasskey(hole.id, false)).toEqual({ ok: false, error: 'pin' });       // it would have no lock left
    expect(await h.changePin(hole.id, '1234', { hello: true })).toEqual({ ok: false, error: 'pin' });
    expect((await h.changePin(hole.id, '482193', { hello: true })).ok).toBe(true);
    expect(h.list()[0]).toMatchObject({ lock: 'pin', pin: true, passkey: true, digits: 6 });
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { pin: '482193' })).notes).toEqual([note('n1')]);
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { hello: true })).notes).toEqual([note('n1')]);
    expect((await h.setPasskey(hole.id, false)).hole.passkey).toBe(false);
    expect(h.setHint(hole.id, 'now it has one').hole.hint).toBe('now it has one');
  });

  it('is made only after the system has said yes, and opened the same way', async () => {
    const h = firstBuild();
    helloSays = false;
    expect((await h.create({ name: 'Finger', lock: 'hello' })).error).toBe('hello-refused');
    helloSays = true;
    const { hole, recoveryKey } = await h.create({ name: 'Finger', lock: 'hello' });
    expect(hole.lock).toBe('hello');
    h.write(hole.id, 'n1', note('n1'));
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { pin: '123456' })).error).toBe('hello');     // it has no PIN
    helloSays = false;
    expect((await h.unlock(hole.id, { hello: true })).error).toBe('hello-refused');
    helloSays = true;
    expect((await h.unlock(hole.id, { hello: true })).notes).toEqual([note('n1')]);
    h.lock(hole.id);
    expect((await holes(computer('new laptop')).unlock(hole.id, { hello: true })).error).toBe('other-computer');
    expect((await holes(computer('new laptop')).unlock(hole.id, { recovery: recoveryKey })).ok).toBe(true);
  });

  it('cannot be made where there is no Hello, or nowhere for the system to keep the key', async () => {
    expect((await firstBuild(computer('mine'), { helloAvailable: async () => false }).create({ name: 'x', lock: 'hello' })).error).toBe('hello-unavailable');
    expect((await firstBuild({ canProtect: () => false }).create({ name: 'x', lock: 'hello' })).error).toBe('storage-unavailable');
  });

  it('is asked through a script that answers in words this reads', () => {
    expect(readHelloAnswer('availability:Available\r\n')).toEqual({ available: true, verified: false });
    expect(readHelloAnswer('availability:DeviceNotPresent')).toEqual({ available: false, verified: false });
    expect(readHelloAnswer('result:Verified')).toEqual({ available: true, verified: true });
    expect(readHelloAnswer('result:Canceled')).toEqual({ available: true, verified: false });
    expect(readHelloAnswer('')).toEqual({ available: false, verified: false });
    expect(WINDOWS_HELLO_SCRIPT).toContain('UserConsentVerifier');
    expect(WINDOWS_HELLO_SCRIPT).not.toMatch(/'[^']*\$env:NEBULA_HELLO_REASON[^']*'/);   // the words are never part of the script
  });
});

describe('a video in a black hole', () => {
  const NAME = 'vid-m1abc-0a1b2c3d.mp4';
  /** Two and a half pieces of bytes that say where they are. */
  const film = () => { const b = Buffer.alloc(VIDEO_PIECE * 2 + 500_000); for (let i = 0; i < b.length; i += 1) b[i] = (i * 7 + (i >> 11)) & 0xff; return b; };
  const part = async (h, id, from, to) => { const out = []; for await (const p of h.videoPart(id, 'n1', NAME, from, to)) out.push(p); return Buffer.concat(out); };
  let source;
  let bytes;
  beforeEach(() => { bytes = film(); source = path.join(root, 'Holiday.mp4'); fs.writeFileSync(source, bytes); });

  it('is sealed beside its note, in pieces: nothing of it can be read on the disk, and its own file is untouched', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const res = await h.addVideo(hole.id, 'n1', source);
    expect(res).toMatchObject({ ok: true, name: 'Holiday.mp4', size: bytes.length });
    expect(res.url).toMatch(new RegExp(`^nebula-media://hole/${hole.id}/n1/vid-[a-z0-9]+-[0-9a-f]{8}\\.mp4$`));
    const sealed = path.join(root, 'storage', 'blackholes', hole.id, `n1~${res.file}.bhv`);
    const disk = fs.readFileSync(sealed);
    expect(disk.subarray(0, 4).toString()).toBe('NBV1');
    expect(disk.length).toBe(16 + bytes.length + 3 * 28);              // three pieces, each with its nonce and tag
    expect(disk.includes(bytes.subarray(1000, 1064))).toBe(false);
    expect(disk.includes(bytes.subarray(VIDEO_PIECE + 77, VIDEO_PIECE + 141))).toBe(false);
    expect(fs.readFileSync(source).equals(bytes)).toBe(true);
    expect(h.list()[0].notes).toBe(0);                                  // a video is not a note
  });

  it('is handed to the player in the parts it asks for — the start, a part across two pieces, the end, all of it', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    await h.addVideo(hole.id, 'n1', source, NAME);
    expect(h.videoSize(hole.id, 'n1', NAME)).toBe(bytes.length);
    expect((await part(h, hole.id, 0, 99)).equals(bytes.subarray(0, 100))).toBe(true);
    expect((await part(h, hole.id, VIDEO_PIECE - 10, VIDEO_PIECE + 9)).equals(bytes.subarray(VIDEO_PIECE - 10, VIDEO_PIECE + 10))).toBe(true);
    expect((await part(h, hole.id, bytes.length - 5, bytes.length - 1)).equals(bytes.subarray(bytes.length - 5))).toBe(true);
    expect((await part(h, hole.id, 0, bytes.length - 1)).equals(bytes)).toBe(true);
    expect((await part(h, hole.id, 5, bytes.length)).length).toBe(0);    // past its end: nothing
  });

  it('cannot be read while the black hole is locked, and a changed or swapped piece is refused', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    await h.addVideo(hole.id, 'n1', source, NAME);
    const sealed = path.join(root, 'storage', 'blackholes', hole.id, `n1~${NAME}.bhv`);
    const disk = fs.readFileSync(sealed);
    // The second piece written over the first: each piece knows its number.
    const swapped = Buffer.from(disk);
    disk.copy(swapped, 16, 16 + VIDEO_PIECE + 28, 16 + 2 * (VIDEO_PIECE + 28));
    fs.writeFileSync(sealed, swapped);
    await expect(part(h, hole.id, 0, 10)).rejects.toThrow();
    expect((await part(h, hole.id, VIDEO_PIECE, VIDEO_PIECE + 9)).equals(bytes.subarray(VIDEO_PIECE, VIDEO_PIECE + 10))).toBe(true);
    fs.writeFileSync(sealed, disk);
    h.lock(hole.id);
    expect(h.videoSize(hole.id, 'n1', NAME)).toBeNull();
    expect((await part(h, hole.id, 0, 10)).length).toBe(0);
    expect((await h.addVideo(hole.id, 'n1', source)).error).toBe('locked');
  });

  it('comes out whole when its note is taken out, and goes with its note when the note is deleted', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    await h.addVideo(hole.id, 'n1', source, NAME);
    await h.addVideo(hole.id, 'n2', source, NAME);
    const out = path.join(root, 'storage', 'notes', 'n1', NAME);
    expect((await h.exportVideo(hole.id, 'n1', NAME, out)).ok).toBe(true);
    expect(fs.readFileSync(out).equals(bytes)).toBe(true);
    h.write(hole.id, 'n1', note('n1'));
    await h.remove(hole.id, 'n1');
    expect(fs.readdirSync(path.join(root, 'storage', 'blackholes', hole.id)).sort()).toEqual(['hole.json', `n2~${NAME}.bhv`]);
  });

  it('refuses note or hole deletion while a sealed video response holds a file open', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    await h.addVideo(hole.id, 'n1', source, NAME);
    const stream = h.videoPart(hole.id, 'n1', NAME, 0, bytes.length - 1);
    expect((await stream.next()).done).toBe(false);
    expect(await h.remove(hole.id, 'n1')).toEqual({ ok: false, error: 'in-use' });
    expect(await h.delete(hole.id, { pin: '482193' })).toEqual({ ok: false, error: 'in-use' });
    expect(fs.existsSync(path.join(root, 'storage', 'blackholes', hole.id, 'n1.bh'))).toBe(true);
    await stream.return();
    expect(await h.remove(hole.id, 'n1')).toEqual({ ok: true });
    expect((await h.delete(hole.id, { pin: '482193' })).ok).toBe(true);
  });

  it('a video no note shows any more is gone the next time the black hole is opened — unless a note could not be read', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const kept = await h.addVideo(hole.id, 'n1', source);
    const dropped = await h.addVideo(hole.id, 'n1', source);
    h.write(hole.id, 'n1', note('n1', { content: `<video src="${kept.url}"></video>` }));
    const dir = path.join(root, 'storage', 'blackholes', hole.id);
    h.lock(hole.id);
    // A note that cannot be read: nothing is swept, its videos may be among them.
    fs.writeFileSync(path.join(dir, 'broken.bh'), 'NBH1 not a note at all, not a note');
    await h.unlock(hole.id, { pin: '482193' });
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.bhv'))).toHaveLength(2);
    h.lock(hole.id);
    fs.rmSync(path.join(dir, 'broken.bh'));
    // A backup made while both were there holds both, sealed.
    const backups = path.join(root, 'backups');
    for (const copy of ['2026-10-07', 'kept-by-hand']) fs.cpSync(dir, path.join(backups, copy, 'blackholes', hole.id), { recursive: true });
    const opened = await h.unlock(hole.id, { pin: '482193' });
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.bhv'))).toEqual([`n1~${kept.file}.bhv`]);
    expect(dropped.file).not.toBe(kept.file);
    // The opening names what it swept, and that leaves every backup too; what a note still shows stays there.
    expect(opened.swept).toEqual([`n1~${dropped.file}.bhv`]);
    expect(purgeHoleFilesFromBackups(backups, hole.id, opened.swept)).toBe(2);
    for (const copy of ['2026-10-07', 'kept-by-hand']) {
      expect(fs.readdirSync(path.join(backups, copy, 'blackholes', hole.id)).filter((f) => f.endsWith('.bhv'))).toEqual([`n1~${kept.file}.bhv`]);
    }
    // Only a sealed video's name is taken for one: nothing else of the black hole can be asked out of a backup this way.
    expect(purgeHoleFilesFromBackups(backups, hole.id, ['hole.json', 'n1.bh', '../hole.json', `..\\${hole.id}\\n1.bh`, null])).toBe(0);
    expect(fs.existsSync(path.join(backups, '2026-10-07', 'blackholes', hole.id, 'hole.json'))).toBe(true);
    // Opened again with nothing to sweep, it names nothing.
    h.lock(hole.id);
    expect('swept' in (await h.unlock(hole.id, { pin: '482193' }))).toBe(false);
  });

  it('any file attached to a note is sealed the same way, and comes out whole (0.9.6)', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const doc = path.join(root, 'Contract.PDF');
    fs.writeFileSync(doc, `%PDF ${SECRET}`);
    const res = await h.addFile(hole.id, 'n1', doc);
    expect(res).toMatchObject({ ok: true, name: 'Contract.PDF' });
    expect(res.url).toMatch(new RegExp(`^nebula-media://hole/${hole.id}/n1/att-[a-z0-9]+-[0-9a-f]{8}\\.pdf$`));
    expect(onDisk()).toContain(SECRET);                                   // the person's own file, where it was
    fs.rmSync(doc);
    expect(onDisk()).not.toContain(SECRET);                               // and nowhere in the black hole
    const out = path.join(root, 'out', 'Contract.pdf');
    expect((await h.exportVideo(hole.id, 'n1', res.file, out)).ok).toBe(true);
    expect(fs.readFileSync(out, 'utf8')).toBe(`%PDF ${SECRET}`);
    const plain = path.join(root, 'README');
    fs.writeFileSync(plain, 'x');
    expect((await h.addFile(hole.id, 'n1', plain)).file).toMatch(/^att-[a-z0-9]+-[0-9a-f]{8}\.bin$/);
    h.lock(hole.id);
    expect((await h.addFile(hole.id, 'n1', plain)).error).toBe('locked');
  });

  it('only a video, and only under a name a video has', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const text = path.join(root, 'notes.txt');
    fs.writeFileSync(text, 'x');
    expect((await h.addVideo(hole.id, 'n1', text)).ok).toBe(false);
    expect((await h.addVideo(hole.id, 'n1', source, '../escape.mp4')).ok).toBe(false);
    expect((await h.addVideo(hole.id, '../n1', source)).ok).toBe(false);
    expect((await h.addVideo(hole.id, 'n1', path.join(root, 'missing.mp4'))).ok).toBe(false);
    expect(fs.readdirSync(path.join(root, 'storage', 'blackholes', hole.id))).toEqual(['hole.json']);
  });

  it('leaves the backups with its note', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    await h.addVideo(hole.id, 'n1', source, NAME);
    const backups = path.join(root, 'backups');
    fs.cpSync(path.join(root, 'storage'), path.join(backups, '2026-10-06'), { recursive: true });
    expect(purgeHoleNoteFromBackups(backups, hole.id, 'n1')).toBe(2);
    expect(fs.readdirSync(path.join(backups, '2026-10-06', 'blackholes', hole.id))).toEqual(['hole.json']);
  });
});

describe('names and keys', () => {
  it('a name is one line, not endless; a locked black hole can be renamed', async () => {
    expect(cleanHoleName('  a\n b  ')).toBe('a b');
    expect(cleanHoleName('x'.repeat(200))).toHaveLength(60);
    expect(cleanHoleName(`${'x'.repeat(59)}🌙 hole`)).toBe(`${'x'.repeat(59)}🌙`); // hunt B24: never half an emoji
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.lock(hole.id);
    expect(h.rename(hole.id, 'Vault').hole.name).toBe('Vault');
    expect(h.rename(hole.id, '  ').ok).toBe(false);
    expect((await h.unlock(hole.id, { pin: '482193' })).ok).toBe(true);
  });

  it('locking lets go of the key: nothing is handed over again without the PIN', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    expect(h.isOpen(hole.id)).toBe(true);
    h.lockAll();
    expect(h.isOpen(hole.id)).toBe(false);
    expect((await h.unlock(hole.id, {})).error).toBe('pin');
  });
});

describe('deleted is deleted, in the backups too', () => {
  it('a note deleted from a black hole, and a black hole deleted, leave every backup', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    h.write(hole.id, 'n2', note('n2'));
    const backups = path.join(root, 'backups');
    for (const name of ['2026-10-06', 'pre-update-x']) fs.cpSync(path.join(root, 'storage'), path.join(backups, name), { recursive: true });
    expect(purgeHoleNoteFromBackups(backups, hole.id, 'n1')).toBe(2);
    expect(fs.readdirSync(path.join(backups, '2026-10-06', 'blackholes', hole.id)).sort()).toEqual(['hole.json', 'n2.bh']);
    expect(purgeHoleNoteFromBackups(backups, '..', 'n1')).toBe(0);
    expect(purgeHoleFromBackups(backups, hole.id)).toBe(4);
    for (const name of ['2026-10-06', 'pre-update-x']) expect(fs.existsSync(path.join(backups, name, 'blackholes', hole.id))).toBe(false);
  });
});

describe('an answer that arrives after the lock (2026-10-17 security audit)', () => {
  const tick = () => new Promise((r) => setImmediate(r));
  /** A hello the test holds: the passkey answers when the test says so. */
  const gated = () => {
    const waiting = [];
    const h = holes(computer('mine'), { hello: () => new Promise((r) => { waiting.push(r); }) });
    return { h, hello: (yes = true) => { for (const r of waiting.splice(0)) r(yes); } };
  };
  const metaOf = (id) => JSON.parse(fs.readFileSync(path.join(root, 'storage/blackholes', id, 'hole.json'), 'utf8'));

  it('a passkey answer that outlived "lock all" opens nothing', async () => {
    const { h, hello } = gated();
    const making = h.create({ name: 'Safe', lock: 'pin', pin: '482193', passkey: true });
    await tick(); hello(true);                                    // the passkey agrees to be added
    const { hole } = await making;
    h.lock(hole.id);
    const pending = h.unlock(hole.id, { hello: true });           // the prompt is up
    await tick();
    expect(h.isOpen(hole.id)).toBe(false);
    h.lockAll();                                                  // "Lock all holes" while the prompt is up
    hello(true);                                                  // ... and the passkey says yes anyway
    expect(await pending).toEqual({ ok: false, error: 'locked' });
    expect(h.isOpen(hole.id)).toBe(false);
  });

  it('a passkey added while the hole was locked meanwhile is not stored — no wrapper of the zeroed key', async () => {
    const { h, hello } = gated();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    const pending = h.setPasskey(hole.id, true);
    await tick();
    h.lock(hole.id);                                              // the lock zeroes the very buffer the passkey would wrap
    hello(true);
    expect(await pending).toEqual({ ok: false, error: 'locked' });
    expect(metaOf(hole.id).passkey).toBeUndefined();
    expect(await h.unlock(hole.id, { pin: '482193' })).toMatchObject({ ok: true, notes: [note('n1')] });
  });

  it('a stale answer does not ride a hole opened again meanwhile: the key it began with is gone', async () => {
    const { h, hello } = gated();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    const adding = h.setPasskey(hole.id, true);
    await tick(); hello(true);
    expect((await adding).ok).toBe(true);
    h.lock(hole.id);
    const pending = h.unlock(hole.id, { hello: true });           // starts shut
    await tick();
    h.lock(hole.id);                                              // ... locked ...
    expect(await h.unlock(hole.id, { pin: '482193' })).toMatchObject({ ok: true });   // ... and opened again by the PIN
    hello(true);
    expect(await pending).toEqual({ ok: false, error: 'locked' });
    expect(h.isOpen(hole.id)).toBe(true);                         // the PIN's opening stands
  });

  it('a passkey taken away while its own yes was on its way is not resurrected by it', async () => {
    const { h, hello } = gated();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const adding = h.setPasskey(hole.id, true);
    await tick(); hello(true);
    expect((await adding).ok).toBe(true);
    const readding = h.setPasskey(hole.id, true);                  // asked for again
    await tick();
    expect(await h.setPasskey(hole.id, false)).toMatchObject({ ok: true });   // taken away meanwhile
    hello(true);
    expect(await readding).toEqual({ ok: false, error: 'locked' });
    expect(metaOf(hole.id).passkey).toBeUndefined();
    h.lock(hole.id);
    expect((await h.unlock(hole.id, { hello: true })).error).toBe('hello');   // there is no passkey any more
  });

  it('a proof and a delete whose answers outlived "lock all" prove and destroy nothing', async () => {
    const { h, hello } = gated();
    const making = h.create({ name: 'Safe', lock: 'pin', pin: '482193', passkey: true });
    await tick(); hello(true);
    const { hole } = await making;
    h.write(hole.id, 'n1', note('n1'));
    h.lock(hole.id);
    const proof = h.prove(hole.id, { hello: true });
    const gone = h.delete(hole.id, { hello: true });
    await tick();
    h.lockAll();
    hello(true);
    expect(await proof).toEqual({ ok: false, error: 'locked' });
    expect(await gone).toEqual({ ok: false, error: 'locked' });
    expect(h.list()[0].notes).toBe(1);
    expect(fs.existsSync(path.join(root, 'storage/blackholes', hole.id, 'n1.bh'))).toBe(true);
  });

  it('a black hole is not born open behind a "lock all" pressed while its passkey was asked for', async () => {
    const { h, hello } = gated();
    const making = h.create({ name: 'Safe', lock: 'pin', pin: '482193', passkey: true });
    await tick();
    h.lockAll();                                                   // pressed while the passkey that makes it is asked for
    hello(true);
    expect(await making).toEqual({ ok: false, error: 'locked' });
    expect(h.list()).toEqual([]);
    expect(fs.existsSync(path.join(root, 'storage/blackholes'))).toBe(false);   // nothing was born
  });

  it('a playing stops when the hole locks between a read and the piece it would have opened', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    const src = path.join(root, 'two.mp4');
    fs.writeFileSync(src, Buffer.alloc(2 * VIDEO_PIECE, 9));
    const added = await h.addVideo(hole.id, 'n1', src);
    const real = fs.promises.open;
    const spy = vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await real(...args);
      const read = handle.read?.bind(handle);
      if (!read) return handle;
      let reads = 0;
      handle.read = async (...ra) => { const r = await read(...ra); reads += 1; if (reads === 1) h.lock(hole.id); return r; };
      return handle;
    });
    try {
      const parts = [];
      for await (const part of h.videoPart(hole.id, 'n1', added.file, 0, 2 * VIDEO_PIECE - 1)) parts.push(part);
      expect(parts).toEqual([]);          // nothing opened after the lock — and no throw, no piece under the dead key
    } finally { spy.mockRestore(); }
  });

  it('a video is not sealed under the zeroed key when the hole locks mid-copy', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    const big = path.join(root, 'big.mp4');
    fs.writeFileSync(big, Buffer.alloc(3 * VIDEO_PIECE, 1));       // three pieces
    const real = fs.promises.open;
    const spy = vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await real(...args);
      const read = handle.read?.bind(handle);
      if (!read) return handle;
      let reads = 0;
      handle.read = async (...ra) => { const r = await read(...ra); reads += 1; if (reads === 2) h.lock(hole.id); return r; };
      return handle;
    });
    try {
      expect(await h.addVideo(hole.id, 'n1', big)).toEqual({ ok: false, error: 'locked' });
    } finally { spy.mockRestore(); }
    // Nothing of the video is kept — not even a half-written tmp.
    expect(fs.readdirSync(path.join(root, 'storage/blackholes', hole.id)).sort()).toEqual(['hole.json', 'n1.bh']);
  });

  it('will not move a hole to Trash or remove its note during a media import', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    const source = path.join(root, 'incoming.mp4');
    fs.writeFileSync(source, Buffer.alloc(VIDEO_PIECE, 7));
    const pending = h.addVideo(hole.id, 'n1', source);
    expect(h.trash(hole.id)).toMatchObject({ ok: false, error: 'in-use' });
    expect(await h.remove(hole.id, 'n1')).toMatchObject({ ok: false, error: 'in-use' });
    expect((await pending).ok).toBe(true);
    expect(h.trash(hole.id).ok).toBe(true);
  });

  it('no copy comes out of a hole that locked before the file was committed — an empty one too', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    const empty = path.join(root, 'empty.mp4');
    fs.writeFileSync(empty, Buffer.alloc(0));
    const added = await h.addVideo(hole.id, 'n1', empty);
    expect(added.ok).toBe(true);
    const out = path.join(root, 'out', 'empty.mp4');
    const real = fs.promises.open;
    const spy = vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await real(...args);
      if (String(args[0]).includes('.tmp-')) {
        const close = handle.close.bind(handle);
        handle.close = async () => { const r = await close(); h.lock(hole.id); return r; };   // the lock lands just before the rename
      }
      return handle;
    });
    try {
      expect(await h.exportVideo(hole.id, 'n1', added.file, out)).toEqual({ ok: false, error: 'locked' });
    } finally { spy.mockRestore(); }
    expect(fs.existsSync(out)).toBe(false);
    expect(fs.readdirSync(path.join(root, 'out')).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  it('a lock that lands while the sweep shreds takes the notes with it — nothing is handed over after the lock (GPT race 1)', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const source = path.join(root, 'loose.mp4');
    fs.writeFileSync(source, Buffer.from('a video no note names'));
    await h.addVideo(hole.id, 'n1', source);                    // unreferenced: the sweep takes it
    h.write(hole.id, 'n1', note('n1'));
    h.lock(hole.id);
    const realStat = fs.promises.lstat.bind(fs.promises);
    let armed = true;
    const spy = vi.spyOn(fs.promises, 'lstat').mockImplementation(async (...args) => {
      const res = await realStat(...args);
      if (armed && String(args[0]).endsWith('.bhv')) { armed = false; h.lock(hole.id); }   // the lock lands mid-sweep
      return res;
    });
    try {
      const res = await h.unlock(hole.id, { pin: '482193' });
      expect(res).toEqual({ ok: false, error: 'locked' });      // the notes leave with the lock
      expect(h.isOpen(hole.id)).toBe(false);
      expect(fs.existsSync(path.join(root, 'storage/blackholes', hole.id, 'n1.bh'))).toBe(true);
    } finally { spy.mockRestore(); }
  });

  it('nothing commits onto a note while its removal runs — writes and imports refuse, and work again after (GPT race 2)', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    const source = path.join(root, 'v.mp4');
    fs.writeFileSync(source, Buffer.from('video bytes'));
    await h.addVideo(hole.id, 'n1', source);
    const seen = {};
    const realStat = fs.promises.lstat.bind(fs.promises);
    const spy = vi.spyOn(fs.promises, 'lstat').mockImplementation(async (...args) => {
      const file = String(args[0]);
      if (file.endsWith('.bh')) {
        if (!seen.sync) seen.sync = h.write(hole.id, 'n1', note('n1'));
        if (!seen.async) seen.async = await h.writeAsync(hole.id, 'n1', JSON.stringify(note('n1')));
      }
      if (file.endsWith('.bhv') && !seen.import) seen.import = await h.addVideo(hole.id, 'n1', source);
      return realStat(...args);
    });
    try {
      expect(await h.remove(hole.id, 'n1')).toEqual({ ok: true });
      expect(seen.sync).toEqual({ ok: false, error: 'in-use' });
      expect(seen.async).toEqual({ ok: false, error: 'in-use' });
      expect(seen.import).toEqual({ ok: false, error: 'in-use' });
      const dir = path.join(root, 'storage/blackholes', hole.id);
      expect(fs.readdirSync(dir).filter((f) => f.startsWith('n1'))).toEqual([]);
    } finally { spy.mockRestore(); }
    expect((await h.addVideo(hole.id, 'n1', source)).ok).toBe(true);   // once the removal is done, an import works again
  });

  it('a junction planted where the hole’s directory belongs is unlinked, never followed', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const holesRootDir = path.join(root, 'storage', 'blackholes');
    const realMeta = fs.readFileSync(path.join(holesRootDir, hole.id, 'hole.json'), 'utf8');
    fs.rmSync(path.join(holesRootDir, hole.id), { recursive: true, force: true });
    const victim = path.join(root, 'outside', 'not-the-holes-to-destroy');
    fs.mkdirSync(victim, { recursive: true });
    fs.writeFileSync(path.join(victim, 'precious.bh'), 'the words must survive');
    fs.writeFileSync(path.join(victim, 'hole.json'), realMeta);   // the planted link must pass for the real hole
    try {
      fs.symlinkSync(victim, path.join(holesRootDir, hole.id), process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;   // this platform needs a privilege to make links; the code path is the same elsewhere
    }
    expect(await h.delete(hole.id, { pin: '482193' })).toEqual({ ok: true, removed: 0 });   // the link went, nothing else
    expect(fs.existsSync(path.join(holesRootDir, hole.id))).toBe(false);
    expect(fs.readFileSync(path.join(victim, 'precious.bh'), 'utf8')).toBe('the words must survive');
  });

  it('the passkey prompt names its action: opening says open, deleting says delete', async () => {
    const asked = [];
    const seen = { open: null, delete: null };
    const watching = holes(computer('mine'), { hello: async (name, action) => { asked.push({ name, action }); return true; } });
    const made = await watching.create({ name: 'Mine', lock: 'pin', pin: '482193', passkey: true });
    watching.lock(made.hole.id);
    expect((await watching.unlock(made.hole.id, { hello: true })).ok).toBe(true);
    seen.open = asked[asked.length - 1];
    watching.lock(made.hole.id);
    expect((await watching.delete(made.hole.id, { hello: true })).ok).toBe(true);
    seen.delete = asked[asked.length - 1];
    expect(seen.open).toMatchObject({ name: 'Mine', action: 'open' });
    expect(seen.delete).toMatchObject({ name: 'Mine', action: 'delete' });   // the OS prompt never says open for a deletion
  });

  it('nothing touches a black hole while its whole deletion runs — no second delete, no unlock, write, import, note removal or trash (Codex addendum)', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    const source = path.join(root, 'v.mp4');
    fs.writeFileSync(source, Buffer.from('video bytes'));
    const seen = {};
    const realStat = fs.promises.lstat.bind(fs.promises);
    const spy = vi.spyOn(fs.promises, 'lstat').mockImplementation(async (...args) => {
      const file = String(args[0]);
      if (file.includes(hole.id) && !seen.anything) {
        seen.anything = true;                                     // the deletion's first shred is in flight
        seen.delete = await h.delete(hole.id, { pin: '482193' });
        seen.deleteWrong = await h.delete(hole.id, { pin: '000000' });
        seen.unlock = await h.unlock(hole.id, { pin: '482193' });
        seen.write = h.write(hole.id, 'n1', note('n1'));
        seen.import = await h.addVideo(hole.id, 'n1', source);
        seen.remove = await h.remove(hole.id, 'n1');
        seen.trash = h.trash(hole.id);
        seen.restore = h.restore(hole.id);
        seen.rename = h.rename(hole.id, 'A new name');
        seen.prove = await h.prove(hole.id, { pin: '000000' });   // a wrong PIN would write its fail count mid-destruction
      }
      return realStat(...args);
    });
    try {
      expect(await h.delete(hole.id, { pin: '482193' })).toEqual({ ok: true, removed: 2 });
      expect(seen.delete).toEqual({ ok: false, error: 'in-use' });
      expect(seen.deleteWrong).toEqual({ ok: false, error: 'in-use' });   // no failed-PIN metadata write mid-shred
      expect(seen.unlock).toEqual({ ok: false, error: 'in-use' });
      // The writes and the import answer 'locked' — the deletion drops the key first, so
      // there is nothing to seal with; the refusal is what matters.
      expect(seen.write).toEqual({ ok: false, error: 'locked' });
      expect(seen.import).toEqual({ ok: false, error: 'locked' });
      expect(seen.remove).toEqual({ ok: false, error: 'locked' });
      expect(seen.trash).toEqual({ ok: false, error: 'in-use' });
      expect(seen.restore).toEqual({ ok: false, error: 'in-use' });   // no resurrection mid-destruction
      expect(seen.rename).toEqual({ ok: false, error: 'in-use' });    // no label written into a hole being destroyed
      expect(seen.prove).toEqual({ ok: false, error: 'in-use' });     // no fail count either
      expect(fs.existsSync(path.join(root, 'storage/blackholes', hole.id))).toBe(false);
    } finally { spy.mockRestore(); }
  });

  it('nothing is taken out of a locked black hole: remove refuses while it is shut', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    h.lock(hole.id);
    expect(await h.remove(hole.id, 'n1')).toEqual({ ok: false, error: 'locked' });
    expect(h.list()[0].notes).toBe(1);
    expect(await h.unlock(hole.id, { pin: '482193' })).toMatchObject({ ok: true });
    expect((await h.remove(hole.id, 'n1')).ok).toBe(true);
  });

  it('the sweep can be left to the caller that is restoring what it withheld (preserveMedia)', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    const source = path.join(root, 'v.mp4');
    fs.writeFileSync(source, Buffer.from('video bytes'));
    const kept = await h.addVideo(hole.id, 'n1', source);
    const dropped = await h.addVideo(hole.id, 'n1', source);
    h.write(hole.id, 'n1', note('n1', { content: `<video src="${kept.url}"></video>` }));
    h.lock(hole.id);
    const opened = await h.unlock(hole.id, { pin: '482193' }, { preserveMedia: true });
    expect(opened.ok).toBe(true);
    expect('swept' in opened).toBe(false);
    expect(fs.readdirSync(path.join(root, 'storage/blackholes', hole.id)).filter((f) => f.endsWith('.bhv'))).toHaveLength(2);
  });
});

describe('the residue of an answer that outlived the lock', () => {
  /** What the race wrote, as it was: the passkey's wrapper of a zeroed key. */
  const deadWrapper = (id) => {
    const file = path.join(root, 'storage/blackholes', id, 'hole.json');
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    meta.passkey = { box: computer('mine').protect(Buffer.alloc(32)).toString('base64') };
    fs.writeFileSync(file, JSON.stringify(meta, null, 2));
  };

  it('is no key when asked for — and is taken away by the next PIN unlock', async () => {
    const h = holes();
    const { hole } = await h.create({ name: 'Safe', lock: 'pin', pin: '482193' });
    h.write(hole.id, 'n1', note('n1'));
    deadWrapper(hole.id);
    h.lock(hole.id);
    expect(await h.unlock(hole.id, { hello: true })).toEqual({ ok: false, error: 'damaged' });   // the dead wrapper opens nothing
    expect(h.isOpen(hole.id)).toBe(false);
    expect(await h.unlock(hole.id, { pin: '482193' })).toMatchObject({ ok: true, notes: [note('n1')] });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'storage/blackholes', hole.id, 'hole.json'), 'utf8')).passkey).toBeUndefined();
  });
});
