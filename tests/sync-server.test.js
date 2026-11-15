// @vitest-environment node
/**
 * The sync server's doors (1.0.3, the owner: "başka birinin bilgisayarı bu
 * açıklıktan hacklemesini ve başka dosyaları çekmesini istemiyorum"): only on
 * Tailscale's own adapter, a signature good once, and an answer taken only
 * from the copy that holds the key.
 */
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSync, tailnetAddress } from '../electron/sync.js';
import { makePairingCode, keyOfCode, signRequest, checkReply } from '../electron/sync-core.js';

const quiet = { warn() {}, log() {} };
const open = [];
/** Where a copy made here keeps its notes. */
const notesOf = new WeakMap();
afterEach(() => { while (open.length) open.pop()(); });

function copy({ port, peerPort, code, peers, tailnetOnline, shut = () => false, window = null, live }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-sync-'));
  fs.mkdirSync(path.join(root, 'notes'));
  // A made-up window, for a copy that pulls: `window(sync)` gives what stands in for it.
  let win = null;
  const sync = createSync({
    userData: () => root,
    notesRoot: () => path.join(root, 'notes'),
    storageRoot: () => root,
    version: '1.0.3',
    shut,
    getWindow: () => win,
    canProtect: () => true,
    protect: (text) => Buffer.from(text),
    unprotect: (box) => box.toString(),
    host: '127.0.0.1', port, peerPort, log: quiet, tailnetOnline, live,
  });
  sync.pairWith(code);
  sync.setKeepOut([]);
  sync.configure(peers ? { enabled: true, peers } : { enabled: true, peer: '127.0.0.1' });
  open.push(() => { sync.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
  notesOf.set(sync, path.join(root, 'notes'));
  if (window) win = window(sync);
  return sync;
}

const get = (port, p, headers) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => {
    res.resume();
    res.on('end', () => resolve(res));
  }).on('error', reject);
});
const listening = (server, port) => new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

describe('the sync server', () => {
  it('listens on Tailscale’s adapter only, not on a carrier’s 100.64 address', () => {
    const v4 = (address) => [{ family: 'IPv4', address }];
    expect(tailnetAddress({ 'Wi-Fi': v4('100.70.1.2'), Ethernet: v4('192.168.1.4') })).toBeNull();
    expect(tailnetAddress({ 'Wi-Fi': v4('100.70.1.2'), Tailscale: v4('100.101.2.3') })).toBe('100.101.2.3');
    expect(tailnetAddress({ tailscale0: v4('100.101.1.1') })).toBe('100.101.1.1');
    expect(tailnetAddress({ Tailscale: v4('192.168.1.4') })).toBeNull();
  });

  it('takes a signature once, and proves its answer', async () => {
    const code = makePairingCode();
    copy({ port: 37611, peerPort: 37612, code });
    await new Promise((r) => setTimeout(r, 50));
    const nonce = 'ab'.repeat(16);
    const headers = { 'x-nebula-sync': signRequest(keyOfCode(code), 'GET', '/sync/v1/hello', Date.now(), nonce) };
    const first = await get(37611, '/sync/v1/hello', headers);
    expect(first.statusCode).toBe(200);
    expect(checkReply(keyOfCode(code), nonce, first.headers['x-nebula-sync-proof'])).toBe(true);
    // The same request again, as if copied off the wire.
    expect((await get(37611, '/sync/v1/hello', headers)).statusCode).toBe(401);
    // Another code: nothing.
    const other = { 'x-nebula-sync': signRequest(keyOfCode(makePairingCode()), 'GET', '/sync/v1/hello') };
    expect((await get(37611, '/sync/v1/hello', other)).statusCode).toBe(401);
    // A path outside the vault is no route at all.
    const sneak = '/sync/v1/note/..%2F..%2Fsync%2Fpair.bin';
    const res = await get(37611, sneak, { 'x-nebula-sync': signRequest(keyOfCode(code), 'GET', sneak) });
    expect(res.statusCode).toBe(404);
  });

  it('takes nothing from an answer that cannot prove the key', async () => {
    const fake = http.createServer((req, res) => {
      const body = JSON.stringify({ app: 'nebula', protocol: 1, version: '1.0.3', instance: 'f'.repeat(32), notes: {}, tombs: {} });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
    });
    await listening(fake, 37614);
    open.push(() => fake.close());
    const sync = copy({ port: 37613, peerPort: 37614, code: makePairingCode() });
    const summary = await sync.pull('test');
    expect(summary.error).toBe('unpaired');
  });

  // The owner, 2026-11-04: "iki den fazla cihazı bağlama olsun… telefonumu da bağlayacağım".
  it('syncs with more than one device, and says which ones answer', async () => {
    const code = makePairingCode();
    copy({ port: 37622, code, peers: ['127.0.0.1:37621'] });
    copy({ port: 37623, code, peers: ['127.0.0.1:37621'] });
    const a = copy({ port: 37621, code, peers: ['127.0.0.1:37622', '127.0.0.1:37623', '127.0.0.1:37629'] });
    await new Promise((r) => setTimeout(r, 50));
    const checked = await a.checkAll();
    const said = Object.fromEntries(checked.devices.map((d) => [d.name, d.reach]));
    expect(said['127.0.0.1:37622']).toMatchObject({ ok: true, version: '1.0.3' });
    expect(said['127.0.0.1:37623']).toMatchObject({ ok: true });
    expect(said['127.0.0.1:37629']).toMatchObject({ ok: false, error: 'unreachable' });
    // The pull itself needs the window's notes: tests/e2e/sync.mjs, with three copies.
  });

  it('keeps to twelve devices, and never lists itself', async () => {
    const code = makePairingCode();
    const a = copy({ port: 37631, code, peers: ['127.0.0.1:37631'] });
    await new Promise((r) => setTimeout(r, 50));
    const checked = await a.checkAll();
    expect(checked.devices[0].reach).toMatchObject({ ok: false, error: 'self' });
    a.configure({ peers: Array.from({ length: 20 }, (_, i) => `127.0.0.1:${37700 + i}`) });
    expect(a.publicState().devices).toHaveLength(12);
  });

  // 1.0.4, learned on 2026-11-05: a firewall kept Nebula out of a device Tailscale saw online.
  it('asks Tailscale about a device that stays silent, and not about one that refuses or answers', async () => {
    const code = makePairingCode();
    copy({ port: 37642, code, peers: ['127.0.0.1:37641'] });
    // A door that takes the knock and says nothing, as a firewall that drops what comes.
    const sockets = [];
    const silent = net.createServer((socket) => { sockets.push(socket); socket.on('error', () => {}); });
    await listening(silent, 37643);
    open.push(() => { for (const s of sockets) s.destroy(); silent.close(); });

    const asked = [];
    const a = copy({
      port: 37641, code, peers: ['127.0.0.1:37642', '127.0.0.1:37643', '127.0.0.1:37649'],
      tailnetOnline: async (address) => { asked.push(address); return true; },
    });
    await new Promise((r) => setTimeout(r, 50));
    const checked = await a.checkAll();
    const said = Object.fromEntries(checked.devices.map((d) => [d.name, d.reach]));
    expect(said['127.0.0.1:37643']).toMatchObject({ ok: false, error: 'unreachable', online: true });
    // Nothing listens there: the device itself said no, so Nebula is shut on it and no firewall is named.
    expect(said['127.0.0.1:37649']).toMatchObject({ ok: false, error: 'unreachable' });
    expect(said['127.0.0.1:37649'].online).toBeUndefined();
    expect(said['127.0.0.1:37642']).toMatchObject({ ok: true });
    expect(said['127.0.0.1:37642'].online).toBeUndefined();
    expect(asked).toEqual(['127.0.0.1']);
  }, 15_000);

  it('takes no word of Tailscale as none: a look that fails or says something else names no firewall', async () => {
    const sockets = [];
    const silent = net.createServer((socket) => { sockets.push(socket); socket.on('error', () => {}); });
    await listening(silent, 37653);
    open.push(() => { for (const s of sockets) s.destroy(); silent.close(); });
    const code = makePairingCode();
    const broken = copy({ port: 37651, code, peers: ['127.0.0.1:37653'], tailnetOnline: async () => { throw new Error('no'); } });
    const odd = copy({ port: 37652, code, peers: ['127.0.0.1:37653'], tailnetOnline: async () => 'yes' });
    const none = copy({ port: 37654, code, peers: ['127.0.0.1:37653'] });
    const [b, o, n] = await Promise.all([broken.checkAll(), odd.checkAll(), none.checkAll()]);
    for (const checked of [b, o, n]) {
      expect(checked.devices[0].reach).toMatchObject({ ok: false, error: 'unreachable' });
      expect(checked.devices[0].reach.online).toBeNull();
    }
  }, 15_000);

  // 1.0.4, the owner, 2026-11-15: a note marked "Do not sync this note" stays on its computer.
  it('hands out nothing of a note kept to this computer, by the window’s word or by the note’s own', async () => {
    const code = makePairingCode();
    const a = copy({ port: 37671, peerPort: 37672, code });
    const root = notesOf.get(a);
    const write = (id, note) => {
      fs.mkdirSync(path.join(root, id), { recursive: true });
      fs.writeFileSync(path.join(root, id, `${id}.json`), JSON.stringify({ id, title: id, content: `<p><img src="nebula-media://note/${id}/pic.png"></p>`, updatedAt: 5, ...note }));
      fs.writeFileSync(path.join(root, id, 'pic.png'), 'png');
    };
    write('plain', {});
    write('marked', { noSync: true });      // says so itself, and the window has not named it yet
    write('named', {});                     // named by the window
    a.setKeepOut(['named']);
    await new Promise((r) => setTimeout(r, 50));
    const ask = (p) => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: 37671, path: p, headers: { 'x-nebula-sync': signRequest(keyOfCode(code), 'GET', p) } }, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });
    const manifest = await ask('/sync/v1/manifest');
    expect(manifest.status).toBe(200);
    expect(Object.keys(JSON.parse(manifest.body).notes)).toEqual(['plain']);
    expect(manifest.body).not.toMatch(/marked|named/);
    expect((await ask('/sync/v1/note/plain')).status).toBe(200);
    expect((await ask('/sync/v1/file/plain/pic.png')).status).toBe(200);
    for (const id of ['marked', 'named']) {
      expect((await ask(`/sync/v1/note/${id}`)).status).toBe(404);
      expect((await ask(`/sync/v1/file/${id}/pic.png`)).status).toBe(404);
    }
    // Put back: the mark is gone from the file, and the note is handed out again.
    write('marked', { updatedAt: 9 });
    await new Promise((r) => setTimeout(r, 20));
    expect(Object.keys(JSON.parse((await ask('/sync/v1/manifest')).body).notes).sort()).toEqual(['marked', 'plain']);
    expect((await ask('/sync/v1/note/marked')).status).toBe(200);
  });

  // The owner, 2026-11-15: "sync dışına alındığı için silinmesi diğer bilgisayara etki etmesin".
  it('deletes a note kept to this computer here alone: no tombstone goes out, and the copy another device has is not taken back', async () => {
    const code = makePairingCode();
    const asked = [];
    const askedThere = [];
    // A window that writes nothing and takes whatever it is handed.
    const windowOf = (asked) => (sync) => ({
      isDestroyed: () => false,
      webContents: {
        send(channel, msg) {
          if (channel !== 'sync:ask') return;
          asked.push(msg);
          const p = msg.payload;
          queueMicrotask(() => sync.answer(msg.requestId, msg.kind === 'prepare' ? { keepOut: [] } : {
            applied: [...p.notes, ...p.copies].map((n) => n.id), dropped: p.drops.map((d) => d.id), skipped: [], lists: true,
          }));
        },
      },
    });
    const a = copy({ port: 37673, code, peers: ['127.0.0.1:37674'], window: windowOf(asked) });
    const b = copy({ port: 37674, code, peers: ['127.0.0.1:37673'], window: windowOf(askedThere) });
    const write = (sync, id, note) => {
      fs.mkdirSync(path.join(notesOf.get(sync), id), { recursive: true });
      fs.writeFileSync(path.join(notesOf.get(sync), id, `${id}.json`), JSON.stringify({ id, title: id, content: '<p>x</p>', updatedAt: 5, ...note }));
    };
    // The other device has all three as they were; here one of them is kept to this computer.
    for (const id of ['kept', 'plain', 'fresh']) write(b, id, {});
    write(a, 'kept', { noSync: true });
    write(a, 'plain', {});
    expect(await a.isKept('kept')).toBe(true);
    expect(await a.isKept('plain')).toBe(false);
    expect(await a.isKept('nobody')).toBe(false);
    // Both deleted for good here, as the Trash's Delete does it: the file first, then the word to sync.
    for (const id of ['kept', 'plain']) {
      const kept = await a.isKept(id);
      fs.rmSync(path.join(notesOf.get(a), id), { recursive: true, force: true });
      await a.forgetNote(id, { kept });
    }
    await new Promise((r) => setTimeout(r, 50));
    const p = '/sync/v1/manifest';
    const manifest = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: 37673, path: p, headers: { 'x-nebula-sync': signRequest(keyOfCode(code), 'GET', p) } }, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => resolve(body));
      }).on('error', reject);
    });
    // The plain note's deletion is told; of the kept one, not a word.
    expect(Object.keys(JSON.parse(manifest).tombs)).toEqual(['plain']);
    expect(manifest).not.toContain('kept');
    // Remembered apart, in this copy's own state.
    const state = JSON.parse(fs.readFileSync(path.join(path.dirname(notesOf.get(a)), 'sync', 'state.json'), 'utf8'));
    expect(Object.keys(state.keptTombs)).toEqual(['kept']);
    // A pull from the device that still has all three: only the note that is new here comes.
    const summary = await a.pull('test');
    expect(summary.error).toBeNull();
    expect(summary.took).toBe(1);
    const applied = asked.filter((m) => m.kind === 'apply');
    expect(applied).toHaveLength(1);
    expect(applied[0].payload.notes.map((n) => n.id)).toEqual(['fresh']);
    expect(applied[0].payload.copies).toEqual([]);
    expect(applied[0].payload.drops).toEqual([]);
    // And the other device, pulling from here: it lets the plain note go and keeps its copy of the kept one.
    const there = await b.pull('test');
    expect(there.error).toBeNull();
    const told = askedThere.filter((m) => m.kind === 'apply');
    expect(told).toHaveLength(1);
    expect(told[0].payload.drops.map((d) => d.id)).toEqual(['plain']);
    expect(told[0].payload.notes).toEqual([]);
  });
});

// 1.0.4, the Linux builds: with no keyring Electron wraps with a password every copy knows
// (safe-store.js). The pairing is then neither written nor read: this copy is not paired.
describe('where the system keeps nothing secret', () => {
  const filesUnder = (dir) => fs.readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => e.name);
  const at = (root, canProtect) => createSync({
    userData: () => root, notesRoot: () => path.join(root, 'notes'), storageRoot: () => root,
    version: '1.0.4', shut: () => false, getWindow: () => null,
    canProtect, protect: (text) => Buffer.from(text), unprotect: (box) => box.toString(),
    host: '127.0.0.1', port: 37691, peerPort: 37692, log: quiet,
  });

  it('never writes the pairing, whoever asks, and says it cannot pair', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-sync-'));
    open.push(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'notes'));
    const weak = at(root, () => false);
    expect(() => weak.pairWith(makePairingCode())).toThrow('protect');
    expect(filesUnder(root).filter((name) => /\.bin/.test(name))).toEqual([]);
    expect(weak.publicState()).toMatchObject({ paired: false, hasCode: false, canPair: false });
  });

  it('does not read a pairing that lies there: not paired until the system keeps secrets again', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-sync-'));
    open.push(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'notes'));
    at(root, () => true).pairWith(makePairingCode());
    expect(filesUnder(root).filter((name) => /\.bin$/.test(name)).sort()).toEqual(['code.bin', 'pair.bin']);
    expect(at(root, () => false).publicState()).toMatchObject({ paired: false, hasCode: false, canPair: false });
    expect(at(root, () => true).publicState()).toMatchObject({ paired: true, hasCode: true, canPair: true });
  });
});

// 1.0.4, the owner, 2026-11-15: "iki bilgisayar da açıkken canlı eşitleme", "oynatıcıda video eşitleniyor · % kartı",
// "büyük aktarım sürerken kapatmadan önce soru" — what sync.js gives the three of them.
describe('while both copies are open', () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Live sync's waits, short. */
  const live = { quiet: 20, gap: 0, most: 200 };
  const noteOf = (sync, id) => path.join(notesOf.get(sync), id, `${id}.json`);
  const write = (sync, id, note) => {
    fs.mkdirSync(path.dirname(noteOf(sync, id)), { recursive: true });
    fs.writeFileSync(noteOf(sync, id), JSON.stringify({ id, title: id, content: '<p>x</p>', updatedAt: 5, ...note }));
  };
  /**
   * A window that writes what it is handed into its copy's vault, as the real one does, and keeps
   * every word it was sent: [channel, what]. While it writes, it asks whether each note is its own.
   */
  const takingWindow = (seen, { slow = 0, onProgress = null } = {}) => (sync) => ({
    isDestroyed: () => false,
    webContents: {
      send(channel, msg) {
        if (channel !== 'sync:ask') {
          seen.push([channel, msg]);
          if (channel === 'sync:progress') onProgress?.(msg, sync);
          return;
        }
        seen.push([`ask:${msg.kind}`, msg.payload]);
        const answer = () => {
          if (msg.kind === 'prepare') return sync.answer(msg.requestId, { keepOut: [] });
          const p = msg.payload;
          const own = [];
          for (const n of [...p.copies, ...p.notes]) {
            own.push([n.id, sync.own(n.id)]);
            fs.mkdirSync(path.dirname(noteOf(sync, n.id)), { recursive: true });
            fs.writeFileSync(noteOf(sync, n.id), n.text);
          }
          for (const d of p.drops) {
            own.push([d.id, sync.own(d.id)]);
            fs.rmSync(path.dirname(noteOf(sync, d.id)), { recursive: true, force: true });
          }
          seen.push(['own', own]);
          return sync.answer(msg.requestId, {
            applied: [...p.copies, ...p.notes].map((n) => n.id), dropped: p.drops.map((d) => d.id), skipped: [], lists: true,
          });
        };
        if (slow && msg.kind === 'prepare') setTimeout(answer, slow); else queueMicrotask(answer);
      },
    },
  });
  const applied = (seen) => seen.filter(([c]) => c === 'ask:apply').map(([, p]) => p);
  const steps = (seen) => seen.filter(([c]) => c === 'sync:progress').map(([, p]) => p);
  const ended = (seen) => steps(seen).filter((p) => p.phase === 'done').map((p) => p.reason);

  it('a change on one reaches the other by itself, and the next change the other way is no conflict', async () => {
    const code = makePairingCode();
    const seenA = [];
    const seenB = [];
    const a = copy({ port: 37681, code, peers: ['127.0.0.1:37682'], window: takingWindow(seenA), live });
    const b = copy({ port: 37682, code, peers: ['127.0.0.1:37681'], window: takingWindow(seenB), live });
    await wait(50);
    // Nothing crosses, nothing waits.
    expect(a.moving()).toBeNull();
    expect(await a.comingFiles()).toEqual([]);

    write(a, 'n1', { content: '<p>one</p>' });
    expect(a.changed()).toBe(true);
    await a.liveDone();
    // The other took it, and every step of that pull says why it ran: its window shows no card for it.
    expect(applied(seenB)).toHaveLength(1);
    expect(applied(seenB)[0].notes.map((n) => n.id)).toEqual(['n1']);
    expect(fs.readFileSync(noteOf(b, 'n1'), 'utf8')).toBe(fs.readFileSync(noteOf(a, 'n1'), 'utf8'));
    expect(steps(seenB).map((p) => p.phase)).toEqual(expect.arrayContaining(['looking', 'notes', 'apply', 'done']));
    expect(steps(seenB).every((p) => p.reason === 'live')).toBe(true);
    // While its window wrote the note, that write was not the other's own doing; afterwards a write of it is.
    expect(seenB.find(([c]) => c === 'own')[1]).toEqual([['n1', false]]);
    expect(b.own('n1')).toBe(true);
    // Then this copy looked at the other: nothing to take, and both now know what they hold alike.
    expect(ended(seenA)).toEqual(['live']);
    expect(applied(seenA)).toEqual([]);

    // Changed on the other one now: it comes here as the note itself, with no copy kept side by side.
    write(b, 'n1', { content: '<p>two</p>', updatedAt: 9 });
    expect(b.changed()).toBe(true);
    await b.liveDone();
    expect(applied(seenA)).toHaveLength(1);
    expect(applied(seenA)[0].notes.map((n) => n.id)).toEqual(['n1']);
    expect(applied(seenA)[0].copies).toEqual([]);
    expect(JSON.parse(fs.readFileSync(noteOf(a, 'n1'), 'utf8')).content).toBe('<p>two</p>');
    // A note deleted here is let go there the same way.
    fs.rmSync(path.dirname(noteOf(a, 'n1')), { recursive: true, force: true });
    await a.forgetNote('n1');
    expect(a.changed()).toBe(true);
    await a.liveDone();
    expect(applied(seenB).at(-1).drops.map((d) => d.id)).toEqual(['n1']);
    expect(seenB.filter(([c]) => c === 'own').at(-1)[1]).toEqual([['n1', false]]);
    expect(fs.existsSync(noteOf(b, 'n1'))).toBe(false);
  }, 20_000);

  it('tells nobody of what is not this computer’s own change, and nothing while it is shut or alone', async () => {
    const code = makePairingCode();
    let shut = false;
    const a = copy({ port: 37683, code, peers: ['127.0.0.1:37684'], shut: () => shut, live });
    a.setKeepOut(['kept']);
    // A note kept to this computer (and its guide, named the same way) is never told; the lists and plain notes are.
    expect(a.own('kept')).toBe(false);
    expect(a.own('plain')).toBe(true);
    expect(a.own('folders.json')).toBe(true);
    expect(a.own('projects.json')).toBe(true);
    shut = true;
    expect(a.changed()).toBe(false);
    shut = false;
    expect(a.changed()).toBe(true);
    await a.liveDone();
    const alone = copy({ port: 37685, code, peers: [], live });
    expect(alone.changed()).toBe(false);
  }, 20_000);

  it('asks for a quiet pull at its own door, and one more after a pull that was already looking', async () => {
    const code = makePairingCode();
    const seenA = [];
    const seenB = [];
    const a = copy({ port: 37686, code, peers: ['127.0.0.1:37687'], window: takingWindow(seenA), live });
    const b = copy({ port: 37687, code, peers: ['127.0.0.1:37686'], window: takingWindow(seenB, { slow: 300 }), live });
    await wait(50);
    // Closing and Sync now knock as before.
    expect(await a.nudgePeer()).toBe(1);
    expect(ended(seenB)).toEqual(['nudge']);
    // The other is in the middle of a pull — it has looked, and waits for its window — when this change is told.
    const first = b.pull('test');
    await wait(120);
    write(a, 'n2', {});
    expect(a.changed()).toBe(true);
    await a.liveDone();
    await first;
    expect(ended(seenB)).toEqual(['nudge', 'test', 'live']);
    expect(applied(seenB)).toHaveLength(1);
    expect(applied(seenB)[0].notes.map((n) => n.id)).toEqual(['n2']);
    expect(fs.existsSync(noteOf(b, 'n2'))).toBe(true);
  }, 20_000);

  it('says which big file is crossing and how far it is, to the player that waits and to the question at closing', async () => {
    const code = makePairingCode();
    const seenA = [];
    const seenB = [];
    const name = 'vid-m1abc-0a1b2c3d.mp4';
    const size = 16 * 1024 * 1024 + 4096;
    const during = [];
    const a = copy({ port: 37688, code, peers: ['127.0.0.1:37689'], window: takingWindow(seenA), live });
    const b = copy({
      port: 37689, code, peers: ['127.0.0.1:37688'], live,
      window: takingWindow(seenB, { onProgress: (p, sync) => { if (p.phase === 'files') during.push({ here: sync.moving(), there: a.moving() }); } }),
    });
    write(a, 'film', { content: `<p><video src="nebula-media://note/film/${name}"></video></p>` });
    fs.writeFileSync(path.join(notesOf.get(a), 'film', name), Buffer.alloc(size, 7));
    await wait(50);
    const summary = await b.pull('test');
    expect(summary.error).toBeNull();
    expect(summary.took).toBe(1);
    expect(summary.waiting).toBe(1);
    // The note is here, its file still to come: named to the window with how much of it is here.
    const waiting = await b.comingFiles();
    if (waiting.length) {
      expect(waiting).toHaveLength(1);
      expect(waiting[0]).toMatchObject({ id: 'film', name, size });
      expect(waiting[0].got).toBeGreaterThanOrEqual(0);
      expect(waiting[0].got).toBeLessThanOrEqual(size);
    }
    for (let i = 0; i < 500 && !seenB.some(([c]) => c === 'sync:media-ready'); i += 1) await wait(20);
    expect(seenB.filter(([c]) => c === 'sync:media-ready').map(([, m]) => m)).toEqual([{ id: 'film', name }]);
    // Every piece that came was told with its note, and counted up to the whole.
    const files = steps(seenB).filter((p) => p.phase === 'files');
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((p) => p.id === 'film' && p.name === name && p.size === size)).toBe(true);
    expect(files.map((p) => p.got)).toEqual([...files.map((p) => p.got)].sort((x, y) => x - y));
    expect(files.at(-1).got).toBe(size);
    // Meanwhile: here a file was coming — and there one was being taken, until the last of it had left that computer.
    expect(during.length).toBe(files.length);
    for (const d of during) {
      expect(d.here).toMatchObject({ coming: { name, size, left: 1 }, going: 0 });
      expect(d.here.coming.got).toBeGreaterThan(0);
      if (d.there) expect(d.there).toEqual({ coming: null, going: 1 });
    }
    expect(during[0].there).toEqual({ coming: null, going: 1 });
    // Whole: nothing crosses any more, nothing waits, and the file is as it was there.
    for (let i = 0; i < 100 && (a.moving() || b.moving() || !steps(seenB).some((p) => p.phase === 'idle')); i += 1) await wait(20);
    expect(b.moving()).toBeNull();
    expect(a.moving()).toBeNull();
    expect(await b.comingFiles()).toEqual([]);
    expect(fs.statSync(path.join(notesOf.get(b), 'film', name)).size).toBe(size);
  }, 30_000);
});
