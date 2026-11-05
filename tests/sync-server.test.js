// @vitest-environment node
/**
 * The sync server's doors (1.0.3, the owner: "başka birinin bilgisayarı bu
 * açıklıktan hacklemesini ve başka dosyaları çekmesini istemiyorum"): only on
 * Tailscale's own adapter, a signature good once, and an answer taken only
 * from the copy that holds the key.
 */
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSync, tailnetAddress } from '../electron/sync.js';
import { makePairingCode, keyOfCode, signRequest, checkReply } from '../electron/sync-core.js';

const quiet = { warn() {}, log() {} };
const open = [];
afterEach(() => { while (open.length) open.pop()(); });

function copy({ port, peerPort, code, peers }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-sync-'));
  fs.mkdirSync(path.join(root, 'notes'));
  const sync = createSync({
    userData: () => root,
    notesRoot: () => path.join(root, 'notes'),
    storageRoot: () => root,
    version: '1.0.3',
    shut: () => false,
    getWindow: () => null,
    canProtect: () => true,
    protect: (text) => Buffer.from(text),
    unprotect: (box) => box.toString(),
    host: '127.0.0.1', port, peerPort, log: quiet,
  });
  sync.pairWith(code);
  sync.setKeepOut([]);
  sync.configure(peers ? { enabled: true, peers } : { enabled: true, peer: '127.0.0.1' });
  open.push(() => { sync.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
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
});
