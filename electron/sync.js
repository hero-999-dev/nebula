/**
 * Tailscale sync (1.0.3): two devices or more, one vault each, kept alike
 * over the tailnet — Tools → Tailscale sync.
 *
 * Each copy serves its own vault, read only, on its Tailscale address and
 * nowhere else; every request is signed with the key the whole group made
 * from one pairing code. A copy pulls from every device on its list in turn
 * (the owner, 2026-11-04: "iki den fazla cihazı bağlama olsun"), each with
 * its own history, so a change made on any of them goes round all of them. A copy changes its own vault only, and only through its own
 * window (sync-core.js says why): a pull reads the peer, decides, fetches, and
 * hands the window the notes to take. The window takes a note only if it is
 * still as it was when the pull looked; what it did not take is left for the
 * next pull.
 *
 * Notes and small files first, the frame of the vault; big files after, in
 * the background, carried on where they stopped. A deleted note leaves a
 * tombstone (an id and a time, nothing of the note) so the peer lets it go,
 * and what was half downloaded for it goes with it — a deleted note stays
 * deleted (the owner, 2026-09-27). Black holes are never served.
 */
import http from 'node:http';
import os from 'node:os';
import dns from 'node:dns/promises';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import {
  PROTOCOL, SYNC_PORT, BIG_FILE, hashNote, conflictCopy, planSync, mergeList, makePairingCode, cleanPairingCode,
  keyOfCode, signRequest, verifyRequest, proveReply, checkReply, inTailnet, isTailscaleAdapter, isLoopback, cleanPeer,
  resumeFrom, pruneTombs, SKEW_MS,
} from './sync-core.js';
import { NOTE_ID, noteIds, noteFile, mediaPath, referencesOf } from './note-media.js';

const API = '/sync/v1';
const FILE_NAME = /^[\w-]{1,80}\.[a-z0-9]{2,5}$/;
const SHA = /^[0-9a-f]{64}$/;
/** The longest a note's text may be when it comes over (its pictures are files, not text). */
const NOTE_MAX = 256 * 1024 * 1024;   // the owner, 2026-11-04: "not sınırını yükselt 256 mb'ye"
/** How many other devices one copy syncs with: a phone, a laptop, a desktop and more, not a crowd. */
export const MAX_DEVICES = 12;

/**
 * This computer's Tailscale address, or null while Tailscale is not up. Only on
 * Tailscale's own adapter: a carrier's 100.64 address on Wi-Fi or mobile data
 * looks the same and is not the tailnet (sync-core.js, isTailscaleAdapter).
 */
export function tailnetAddress(nets = os.networkInterfaces()) {
  for (const [name, list] of Object.entries(nets ?? {})) {
    if (!isTailscaleAdapter(name)) continue;
    for (const a of list ?? []) if ((a.family === 'IPv4' || a.family === 4) && inTailnet(a.address)) return a.address;
  }
  return null;
}

const fail = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });
const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store' });
  res.end(text);
}

/**
 * @param {object} o
 * @param {() => string} o.userData
 * @param {() => string} o.notesRoot
 * @param {() => string} o.storageRoot
 * @param {string} o.version     the app's version: both copies must run the same one
 * @param {() => boolean} o.shut the lock on opening is shut: nothing is served or pulled
 * @param {() => Electron.BrowserWindow|null} o.getWindow
 * @param {() => boolean} o.canProtect
 * @param {(text: string) => Buffer} o.protect   the pairing key, wrapped for this user (safeStorage)
 * @param {(box: Buffer) => string} o.unprotect
 * @param {string} [o.host]      where to listen instead of the tailnet (tests: loopback)
 * @param {number} [o.port]
 * @param {number} [o.peerPort]
 */
export function createSync(o) {
  const host = o.host ?? process.env.NEBULA_SYNC_HOST ?? null;
  const port = Number(o.port ?? process.env.NEBULA_SYNC_PORT) || SYNC_PORT;
  const peerPort = Number(o.peerPort ?? process.env.NEBULA_SYNC_PEER_PORT) || port;
  // Two copies on one computer, for the tests: loopback stands in for the tailnet.
  const testing = !!host && isLoopback(host);
  const allowed = (addr) => inTailnet(addr) || (testing && isLoopback(addr));
  const log = o.log ?? console;

  const dir = () => path.join(o.userData(), 'sync');
  const stateFile = () => path.join(dir(), 'state.json');
  const pairFile = () => path.join(dir(), 'pair.bin');
  const codeFile = () => path.join(dir(), 'code.bin');
  const partialDir = () => path.join(dir(), 'partial');

  // ── what this copy keeps ──────────────────────────────────────────────────
  // A device's name or address; in the tests also a loopback port, for three copies on one computer.
  const cleanName = (raw) => (testing && /^127\.0\.0\.1:\d{2,5}$/.test(String(raw ?? '').trim()) ? String(raw).trim() : cleanPeer(raw));
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  /** One of the other devices, and what this copy last saw of it: its own base, so each pair keeps its own history. */
  const cleanDevice = (d) => {
    const name = cleanName(d?.name);
    return name ? {
      name,
      instance: typeof d.instance === 'string' ? d.instance : null,
      base: obj(d.base),
      folderBase: Array.isArray(d.folderBase) ? d.folderBase : [],
      projectBase: Array.isArray(d.projectBase) ? d.projectBase : [],
      seen: d.seen && typeof d.seen === 'object' ? d.seen : null,
    } : null;
  };
  function cleanState(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    // The one "other computer" of before is the first device of the list.
    const listed = Array.isArray(s.peers) ? s.peers
      : s.peer ? [{ name: s.peer, instance: s.peerInstance, base: s.base, folderBase: s.folderBase, projectBase: s.projectBase }] : [];
    const peers = [];
    for (const d of listed.map(cleanDevice)) if (d && !peers.some((p) => p.name === d.name) && peers.length < MAX_DEVICES) peers.push(d);
    return {
      instance: typeof s.instance === 'string' && /^[0-9a-f]{32}$/.test(s.instance) ? s.instance : crypto.randomBytes(16).toString('hex'),
      enabled: s.enabled === true,
      peers,
      openSync: s.openSync !== false,
      tombs: obj(s.tombs),
      last: s.last && typeof s.last === 'object' ? s.last : null,
      pending: Array.isArray(s.pending) ? s.pending.filter((f) => NOTE_ID.test(f?.from) && NOTE_ID.test(f?.to) && FILE_NAME.test(f?.name) && SHA.test(f?.sha)) : [],
    };
  }
  let state = (() => {
    try { return cleanState(JSON.parse(fsSync.readFileSync(stateFile(), 'utf8'))); } catch { return cleanState(null); }
  })();
  function persist() {
    try {
      fsSync.mkdirSync(dir(), { recursive: true });
      const tmp = `${stateFile()}.tmp-${process.pid}`;
      fsSync.writeFileSync(tmp, JSON.stringify(state));
      fsSync.renameSync(tmp, stateFile());
    } catch (err) { log.warn('[nebula] sync state could not be written:', err.message); }
  }
  if (!fsSync.existsSync(stateFile())) persist();
  const forgetDevice = (d) => { d.instance = null; d.base = {}; d.folderBase = []; d.projectBase = []; d.seen = null; };
  const deviceNamed = (name) => state.peers.find((d) => d.name === name) ?? null;

  // The key every device of the group signs with, and the code it was made from
  // (shown again under "Add a device"). Both kept wrapped by the operating
  // system, never as plain text; the code is no more than the key it makes.
  let key;
  function getKey() {
    if (key !== undefined) return key;
    try { key = Buffer.from(o.unprotect(fsSync.readFileSync(pairFile())), 'base64'); if (key.length !== 32) key = null; } catch { key = null; }
    return key;
  }
  const writeWrapped = (file, text) => {
    fsSync.mkdirSync(dir(), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    fsSync.writeFileSync(tmp, o.protect(text));
    fsSync.renameSync(tmp, file);
  };
  function keptCode() {
    try { return cleanPairingCode(o.unprotect(fsSync.readFileSync(codeFile()))); } catch { return null; }
  }
  function setCode(code) {
    const next = keyOfCode(code);
    writeWrapped(pairFile(), next.toString('base64'));
    writeWrapped(codeFile(), cleanPairingCode(code));
    key = next;
    for (const d of state.peers) forgetDevice(d);
    persist();
  }

  /** The window's own guide: never served, never taken (it is made by each copy in its language). */
  let keepOut = null;

  // ── this vault, as the peer sees it ───────────────────────────────────────
  const shaCache = new Map();
  async function fileSha(file) {
    const st = await fs.stat(file);
    const known = shaCache.get(file);
    if (known && known.size === st.size && known.mtimeMs === st.mtimeMs) return known;
    const sha = await new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      fsSync.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
    });
    const entry = { size: st.size, mtimeMs: st.mtimeMs, sha };
    shaCache.set(file, entry);
    return entry;
  }
  const noteCache = new Map();
  /** A note as the manifest gives it, or null for a black hole's mark or a file that is not a note. */
  async function noteEntry(id) {
    const file = noteFile(o.notesRoot(), id);
    const st = await fs.stat(file);
    const known = noteCache.get(id);
    if (known && known.size === st.size && known.mtimeMs === st.mtimeMs) return known.entry;
    const text = await fs.readFile(file, 'utf8');
    const h = hashNote(text);
    const entry = !h || h.note.hole || h.note.id !== id ? null
      : { hash: h.hash, updatedAt: Number(h.note.updatedAt) || 0, names: [...referencesOf(text, id).own] };
    noteCache.set(id, { size: st.size, mtimeMs: st.mtimeMs, entry });
    return entry;
  }
  async function vaultNotes({ withFiles }) {
    const ids = noteIds(o.notesRoot());
    if (!ids) {
      if (!fsSync.existsSync(o.notesRoot())) return new Map();
      throw fail('unreadable');
    }
    const out = new Map();
    for (const id of ids) {
      if (keepOut?.has(id)) continue;
      let entry;
      try { entry = await noteEntry(id); } catch { continue; }
      if (!entry) continue;
      const note = { hash: entry.hash, updatedAt: entry.updatedAt };
      if (withFiles) {
        note.files = [];
        for (const name of entry.names) {
          const file = mediaPath(o.notesRoot(), id, name);
          if (!file) continue;
          try { const { size, sha } = await fileSha(file); note.files.push({ name, size, sha }); } catch { /* named, not there: not offered */ }
        }
      }
      out.set(id, note);
    }
    return out;
  }
  async function readList(name, field) {
    try {
      const v = JSON.parse(await fs.readFile(path.join(o.storageRoot(), name), 'utf8'));
      return Array.isArray(v) ? v : Array.isArray(v?.[field]) ? v[field] : [];
    } catch { return []; }
  }
  const hello = () => ({ app: 'nebula', protocol: PROTOCOL, version: o.version, instance: state.instance });

  // ── the server ────────────────────────────────────────────────────────────
  let server = null;
  let listeningOn = null;
  const ready = () => state.enabled && !!getKey();
  const listenHost = () => host ?? tailnetAddress();

  /** The nonces of the signatures taken, while they are timely: each is let in once. */
  const nonces = new Map();
  function useNonce(nonce, now = Date.now()) {
    for (const [n, at] of nonces) { if (now - at <= 2 * SKEW_MS) break; nonces.delete(n); }
    if (nonces.has(nonce)) return false;
    nonces.set(nonce, now);
    return true;
  }

  async function handle(req, res) {
    if (!allowed(req.socket.remoteAddress)) return sendJson(res, 403, { error: 'outside' });
    const url = new URL(req.url ?? '/', 'http://peer');
    const p = url.pathname;
    const nonce = verifyRequest(getKey(), req.headers['x-nebula-sync'], req.method ?? '', p);
    // A signature is good once: one seen again (copied off the wire, say) is refused.
    if (!nonce || !useNonce(nonce)) return sendJson(res, 401, { error: 'unpaired' });
    res.setHeader('x-nebula-sync-proof', proveReply(getKey(), nonce));
    if (o.shut()) return sendJson(res, 423, { error: 'locked' });
    if (!state.enabled) return sendJson(res, 403, { error: 'off' });
    if (req.method === 'GET' && p === `${API}/hello`) return sendJson(res, 200, hello());
    // Nothing but hello is handed to a copy of another version: one of the two is to be updated first.
    const asking = req.headers['x-nebula-version'];
    if (asking && asking !== o.version) return sendJson(res, 409, { error: 'version', theirs: o.version });
    // Until the window has said which note is its guide, nothing is handed out.
    if (keepOut === null) return sendJson(res, 503, { error: 'starting' });
    if (req.method === 'GET' && p === `${API}/manifest`) {
      const notes = await vaultNotes({ withFiles: true });
      return sendJson(res, 200, {
        ...hello(),
        notes: Object.fromEntries(notes),
        tombs: state.tombs,
        folders: await readList('folders.json', 'folders'),
        projects: await readList('projects.json', 'projects'),
      });
    }
    let m = /^\/sync\/v1\/note\/([\w-]{1,120})$/.exec(p);
    if (req.method === 'GET' && m) {
      const id = m[1];
      if (keepOut.has(id)) return sendJson(res, 404, { error: 'missing' });
      let text;
      try { text = await fs.readFile(noteFile(o.notesRoot(), id), 'utf8'); } catch { return sendJson(res, 404, { error: 'missing' }); }
      const h = hashNote(text);
      if (!h || h.note.hole || h.note.id !== id) return sendJson(res, 404, { error: 'missing' });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store' });
      return res.end(text);
    }
    m = /^\/sync\/v1\/file\/([\w-]{1,120})\/([\w-]{1,80}\.[a-z0-9]{2,5})$/.exec(p);
    if (req.method === 'GET' && m) {
      const [, id, name] = m;
      // Only a file a plain note names: never a black hole's, never one waiting to be deleted.
      let entry = null;
      try { entry = keepOut.has(id) ? null : await noteEntry(id); } catch { /* no note */ }
      const file = entry?.names.includes(name) ? mediaPath(o.notesRoot(), id, name) : null;
      let st;
      try { st = file ? await fs.stat(file) : null; } catch { st = null; }
      if (!st?.isFile()) return sendJson(res, 404, { error: 'missing' });
      const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''));
      let start = 0;
      let end = st.size - 1;
      if (range) {
        start = Number(range[1]);
        if (range[2]) end = Math.min(end, Number(range[2]));
        if (start > end) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
      }
      res.writeHead(range ? 206 : 200, {
        'content-type': 'application/octet-stream',
        'content-length': end - start + 1,
        'accept-ranges': 'bytes',
        ...(range ? { 'content-range': `bytes ${start}-${end}/${st.size}` } : {}),
      });
      if (st.size === 0) return res.end();
      fsSync.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
      return undefined;
    }
    if (req.method === 'POST' && p === `${API}/nudge`) {
      // The peer is closing, or just changed something: this copy pulls now. Answered when done, or after half a minute.
      await Promise.race([pull('nudge'), delay(30_000)]);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: 'unknown' });
  }

  function stop() {
    if (!server) return;
    server.close();
    server.closeAllConnections?.();
    server = null;
    listeningOn = null;
  }
  function serve() {
    const where = ready() ? listenHost() : null;
    if (!where) { stop(); return; }
    if (server && listeningOn === where) return;
    stop();
    const s = http.createServer((req, res) => {
      handle(req, res).catch((err) => {
        log.warn('[nebula] sync request failed:', err.message);
        if (!res.headersSent) sendJson(res, 500, { error: 'failed' }); else res.destroy();
      });
    });
    s.on('error', (err) => {
      log.warn('[nebula] sync could not listen:', err.code ?? err.message);
      if (server === s) { server = null; listeningOn = null; }
    });
    s.listen(port, where);
    server = s;
    listeningOn = where;
  }

  // ── asking the other devices ──────────────────────────────────────────────
  /** Where a device answers: its tailnet address (a name is looked up), on the sync port. */
  async function peerAddress(raw) {
    const name = cleanName(raw);
    if (!name) throw fail('no-peer');
    const [host0, portText] = name.split(':');
    let addr = host0;
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(addr)) {
      try { addr = (await dns.lookup(addr, { family: 4 })).address; } catch { throw fail('unreachable'); }
    }
    // A name that does not lead into the tailnet is not followed.
    if (!allowed(addr)) throw fail('outside');
    return { host: addr, port: Number(portText) || peerPort };
  }
  /** Signed for once; answered only by a copy of the group (its proof), else 'unpaired' and nothing of it is read. */
  function request(addr, method, p, { headers = {}, timeout = 20_000 } = {}) {
    return new Promise((resolve, reject) => {
      const nonce = crypto.randomBytes(16).toString('hex');
      const req = http.request({
        host: addr.host, port: addr.port, method, path: p, timeout,
        headers: { 'x-nebula-sync': signRequest(getKey(), method, p, Date.now(), nonce), 'x-nebula-version': o.version, ...headers },
      }, (res) => {
        if (res.statusCode === 401 || checkReply(getKey(), nonce, res.headers['x-nebula-sync-proof'])) return resolve(res);
        res.resume();
        reject(fail('unpaired'));
      });
      req.on('timeout', () => req.destroy(fail('unreachable')));
      req.on('error', (err) => reject(err.code === 'unreachable' ? err : fail('unreachable')));
      req.end();
    });
  }
  const statusError = (status) => fail(
    status === 409 ? 'version' : status === 401 ? 'unpaired' : status === 423 ? 'peer-locked' : status === 403 ? 'peer-off' : status === 503 ? 'peer-starting' : status === 404 ? 'missing' : 'failed',
    { status, ...(status === 409 ? { mine: o.version } : {}) },
  );
  async function getText(addr, p, max = NOTE_MAX) {
    const res = await request(addr, 'GET', p);
    if (res.statusCode !== 200) { res.resume(); throw statusError(res.statusCode); }
    const chunks = [];
    let size = 0;
    for await (const chunk of res) {
      size += chunk.length;
      if (size > max) { res.destroy(); throw fail('too-big'); }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const getJson = async (addr, p) => {
    try { return JSON.parse(await getText(addr, p)); } catch (err) { throw err.code ? err : fail('failed'); }
  };

  /** One file into a note's folder: through `partial/`, checked, then moved in whole. Carries on where it stopped. */
  async function download(addr, f, onBytes = () => {}) {
    const dest = mediaPath(o.notesRoot(), f.to, f.name);
    if (!dest) throw fail('failed');
    const partDir = path.join(partialDir(), f.to);
    const part = path.join(partDir, `${f.name}.part`);
    await fs.mkdir(partDir, { recursive: true });
    let have = 0;
    try { have = (await fs.stat(part)).size; } catch { /* nothing yet */ }
    if (have > f.size) { await fs.rm(part, { force: true }); have = 0; }
    if (have < f.size || f.size === 0) {
      const { start, header } = resumeFrom(have, f.size);
      const res = await request(addr, 'GET', `${API}/file/${f.from}/${f.name}`, { headers: header ? { range: header } : {}, timeout: 60_000 });
      if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); throw statusError(res.statusCode); }
      const out = fsSync.createWriteStream(part, { flags: res.statusCode === 206 && start > 0 ? 'a' : 'w' });
      // No more than the file said it was: a peer sending on and on does not fill the disk.
      let room = f.size - (res.statusCode === 206 ? start : 0);
      let over = false;
      await new Promise((resolve, reject) => {
        res.on('data', (d) => {
          room -= d.length;
          if (room < 0 && !over) { over = true; res.unpipe(out); res.destroy(); out.destroy(); reject(fail('sha')); return; }
          onBytes(d.length);
        });
        res.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve);
        res.pipe(out);
      }).catch(async (err) => {
        if (over) await fs.rm(part, { force: true }).catch(() => {});
        throw err;
      });
    }
    const { sha } = await fileSha(part);
    shaCache.delete(part);
    if (sha !== f.sha) { await fs.rm(part, { force: true }); throw fail('sha'); }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(part, dest);
    await fs.rm(partDir, { recursive: false }).catch(() => {});   // only when empty
  }

  // ── talking to the window ─────────────────────────────────────────────────
  let askId = 0;
  const asks = new Map();
  function ask(kind, payload, timeout = 120_000) {
    const win = o.getWindow();
    if (!win || win.isDestroyed()) return Promise.reject(fail('no-window'));
    const requestId = ++askId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { asks.delete(requestId); reject(fail('window-timeout')); }, timeout);
      asks.set(requestId, { resolve, reject, timer });
      win.webContents.send('sync:ask', { requestId, kind, payload });
    });
  }
  function answer(requestId, result, error) {
    const waiting = asks.get(requestId);
    if (!waiting) return;
    asks.delete(requestId);
    clearTimeout(waiting.timer);
    if (error) waiting.reject(fail(String(error))); else waiting.resolve(result);
  }
  function tell(channel, payload) {
    const win = o.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
  const progress = (p) => tell('sync:progress', p);

  // ── one pull ──────────────────────────────────────────────────────────────
  let pulling = null;
  function pull(reason = 'manual') {
    if (!pulling) pulling = runPull(reason).finally(() => { pulling = null; tell('sync:state', publicState()); });
    return pulling;
  }

  async function bringFiles(addr, via, from, to, files, added, later, onBytes) {
    for (const f of Array.isArray(files) ? files : []) {
      if (!FILE_NAME.test(String(f?.name)) || !(Number(f.size) >= 0) || !SHA.test(String(f.sha))) continue;
      const dest = mediaPath(o.notesRoot(), to, f.name);
      if (!dest) continue;
      if (fsSync.existsSync(dest)) continue;     // already here — and a file here is never written over
      const job = { from, to, name: f.name, size: Number(f.size), sha: f.sha, via };
      if (job.size > BIG_FILE) { later.push(job); continue; }
      await download(addr, job, onBytes);
      if (!added.has(to)) added.set(to, []);
      added.get(to).push(f.name);
    }
  }
  async function copyOwnFiles(id, copyId, text, added) {
    for (const name of referencesOf(text, id).own) {
      const src = mediaPath(o.notesRoot(), id, name);
      const dst = mediaPath(o.notesRoot(), copyId, name);
      if (!src || !dst || fsSync.existsSync(dst) || !fsSync.existsSync(src)) continue;
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
      if (!added.has(copyId)) added.set(copyId, []);
      added.get(copyId).push(name);
    }
  }

  const errorOf = (err) => ({
    error: typeof err.code === 'string' ? err.code : 'failed',
    ...(err.theirs ? { theirs: err.theirs } : {}),
    ...(err.mine ? { mine: err.mine } : {}),
  });

  /**
   * One pull: from every device in turn, each against its own base. What one
   * device brought is here for the next one to see, so a note goes round the
   * whole group however many there are; a deleted note's tombstone goes with
   * it, so it stays deleted on all of them.
   */
  async function runPull(reason) {
    const summary = { at: Date.now(), reason, took: 0, dropped: 0, copies: 0, skipped: 0, waiting: 0, error: null, devices: [] };
    try {
      if (o.shut()) throw fail('locked');
      if (!ready()) throw fail('off');
      if (keepOut === null) throw fail('starting');
      if (!state.peers.length) throw fail('no-peer');
      for (const device of [...state.peers]) {
        const seen = { name: device.name, at: Date.now(), error: null };
        try {
          const got = await pullFrom(device);
          for (const k of ['took', 'dropped', 'copies', 'skipped']) summary[k] += got[k];
          seen.version = o.version;
        } catch (err) {
          Object.assign(seen, errorOf(err));
          if (seen.error === 'failed') log.warn('[nebula] sync failed:', err.message);
        }
        if (state.peers.includes(device)) device.seen = seen;
        summary.devices.push(seen);
      }
      // One device away is said beside its name; the pull fails only when none answered.
      const bad = summary.devices.filter((d) => d.error);
      if (bad.length === summary.devices.length) Object.assign(summary, errorOf(Object.assign(new Error(bad[0].error), { code: bad[0].error, theirs: bad[0].theirs, mine: bad[0].mine })));
    } catch (err) {
      Object.assign(summary, errorOf(err));
      if (summary.error === 'failed') log.warn('[nebula] sync failed:', err.message);
    }
    summary.waiting = state.pending.length;
    state.last = summary;
    persist();
    progress({
      phase: 'done', reason, error: summary.error, theirs: summary.theirs, mine: summary.mine,
      took: summary.took, copies: summary.copies, dropped: summary.dropped, skipped: summary.skipped,
      waiting: summary.waiting, devices: summary.devices.length, away: summary.devices.filter((d) => d.error).length,
    });
    if (state.pending.length) void drainPending();
    return summary;
  }

  async function pullFrom(device) {
    const got = { took: 0, dropped: 0, copies: 0, skipped: 0 };
    const addr = await peerAddress(device.name);
    progress({ phase: 'looking', device: device.name });
    const remote = await getJson(addr, `${API}/manifest`);
    if (remote?.app !== 'nebula' || remote.protocol !== PROTOCOL) throw fail('protocol');
    if (remote.version !== o.version) throw fail('version', { theirs: String(remote.version ?? ''), mine: o.version });
    if (remote.instance === state.instance) throw fail('self');
    // Its name and its address both listed: pulled once, under the first.
    if (state.peers.some((d) => d !== device && d.instance === remote.instance)) throw fail('twice');
    if (remote.instance !== device.instance) { forgetDevice(device); device.instance = remote.instance; }

    // The window writes what it holds, and says which note is its guide.
    const prep = await ask('prepare', null);
    if (Array.isArray(prep?.keepOut)) keepOut = new Set(prep.keepOut.filter((id) => NOTE_ID.test(String(id))));
    const local = await vaultNotes({ withFiles: false });
    const remoteNotes = new Map();
    for (const [id, n] of Object.entries(remote.notes ?? {})) {
      if (NOTE_ID.test(id) && typeof n?.hash === 'string') remoteNotes.set(id, { hash: n.hash, updatedAt: Number(n.updatedAt) || 0, files: n.files });
    }
    state.tombs = Object.fromEntries(pruneTombs(new Map(Object.entries(state.tombs))));
    const remoteTombs = new Map(Object.entries(remote.tombs ?? {}).filter(([id]) => NOTE_ID.test(id)).map(([id, at]) => [id, Number(at) || 0]));
    const plan = planSync({
      local, remote: remoteNotes, base: new Map(Object.entries(device.base)),
      localTombs: new Map(Object.entries(state.tombs)), remoteTombs, keepOut,
    });

    const notes = [];
    const copies = [];
    const added = new Map();
    const later = [];
    const total = plan.take.length + plan.copies.length;
    let done = 0;
    let bytes = 0;
    const onBytes = (n) => { bytes += n; };
    for (const t of plan.take) {
      progress({ phase: 'notes', device: device.name, done: done++, total, bytes });
      let text = null;
      try { text = await getText(addr, `${API}/note/${t.id}`); } catch (err) { if (err.code !== 'missing') throw err; }
      const h = text && hashNote(text);
      if (!h || h.hash !== t.hash || h.note.id !== t.id) { got.skipped++; continue; }   // changed there meanwhile: next time
      await bringFiles(addr, device.name, t.id, t.id, remoteNotes.get(t.id).files, added, later, onBytes);
      notes.push({ id: t.id, text, expect: t.expect, hash: t.hash });
    }
    for (const c of plan.copies) {
      progress({ phase: 'notes', device: device.name, done: done++, total, bytes });
      let text = null;
      if (c.side === 'local') {
        text = await fs.readFile(noteFile(o.notesRoot(), c.id), 'utf8').catch(() => null);
        if (text) await copyOwnFiles(c.id, c.copyId, text, added);
      } else {
        try { text = await getText(addr, `${API}/note/${c.id}`); } catch (err) { if (err.code !== 'missing') throw err; }
        if (text && hashNote(text)?.hash === remoteNotes.get(c.id).hash) await bringFiles(addr, device.name, c.id, c.copyId, remoteNotes.get(c.id).files, added, later, onBytes);
        else text = null;
      }
      if (!text) { got.skipped++; continue; }
      copies.push({ id: c.copyId, text: conflictCopy(text, c.id, c.copyId), expect: null });
    }
    const folders = mergeList(device.folderBase, await readList('folders.json', 'folders'), remote.folders);
    const projects = mergeList(device.projectBase, await readList('projects.json', 'projects'), remote.projects);

    progress({ phase: 'apply', device: device.name, done: total, total, bytes });
    const result = (notes.length || copies.length || plan.drop.length || folders.changed || projects.changed)
      ? await ask('apply', {
        notes: notes.map(({ id, text, expect }) => ({ id, text, expect })),
        copies,
        drops: plan.drop,
        folders: folders.changed ? folders.merged : null,
        projects: projects.changed ? projects.merged : null,
      })
      : { applied: [], dropped: [], skipped: [], lists: true };
    const applied = new Set(Array.isArray(result?.applied) ? result.applied : []);
    const dropped = new Set(Array.isArray(result?.dropped) ? result.dropped : []);

    // What the window did not take: the files brought for it leave again, so nothing waits in a folder unnamed.
    for (const [id, names] of added) {
      if (applied.has(id)) continue;
      for (const name of names) { const file = mediaPath(o.notesRoot(), id, name); if (file) await fs.rm(file, { force: true }).catch(() => {}); }
    }
    for (const s of plan.same) device.base[s.id] = s.hash;
    for (const n of notes) if (applied.has(n.id)) { device.base[n.id] = n.hash; delete state.tombs[n.id]; }
    // Let go here too: its tombstone is kept, and handed on to the devices that pull from this one.
    for (const d of plan.drop) {
      if (!dropped.has(d.id)) continue;
      for (const other of state.peers) delete other.base[d.id];
      state.tombs[d.id] = Math.max(Number(state.tombs[d.id]) || 0, remoteTombs.get(d.id) ?? Date.now());
    }
    if (result?.lists) { device.folderBase = folders.base; device.projectBase = projects.base; }
    const known = new Set(state.pending.map((f) => `${f.to}/${f.name}`));
    for (const f of later) if (applied.has(f.to) && !known.has(`${f.to}/${f.name}`)) state.pending.push(f);
    got.took = notes.filter((n) => applied.has(n.id)).length;
    got.copies = copies.filter((c) => applied.has(c.id)).length;
    got.dropped = dropped.size;
    got.skipped += Array.isArray(result?.skipped) ? result.skipped.length : 0;
    persist();
    return got;
  }

  // ── big files, in the background ──────────────────────────────────────────
  let draining = false;
  async function drainPending() {
    if (draining || !state.pending.length || !ready() || o.shut()) return;
    draining = true;
    // Each file from the device that offered it; a device away is tried again next time, the others carry on.
    const addrs = new Map();
    const away = new Set();
    try {
      let i = 0;
      while (i < state.pending.length && ready() && !o.shut()) {
        const f = state.pending[i];
        const via = f.via ?? state.peers[0]?.name;
        // Its device left the list: nothing is fetched from it.
        if (!via || !deviceNamed(via)) { state.pending.splice(i, 1); persist(); continue; }
        if (away.has(via)) { i++; continue; }
        let addr = addrs.get(via);
        if (!addr) {
          try {
            addr = await peerAddress(via);
            // Files waiting from an earlier sync are not fetched from a copy updated since, or not yet.
            if ((await getJson(addr, `${API}/hello`))?.version !== o.version) throw fail('version');
            addrs.set(via, addr);
          } catch { away.add(via); i++; continue; }
        }
        const dest = mediaPath(o.notesRoot(), f.to, f.name);
        // The note went meanwhile, or the file is here already.
        if (dest && fsSync.existsSync(noteFile(o.notesRoot(), f.to)) && !fsSync.existsSync(dest)) {
          let got = 0;
          try {
            await download(addr, f, (n) => { got += n; progress({ phase: 'files', name: f.name, got, size: f.size, left: state.pending.length }); });
            tell('sync:media-ready', { id: f.to, name: f.name });
          } catch (err) {
            // Gone there, or not what it said it was: dropped. Anything else: carried on later, from where it stopped.
            if (err.code !== 'missing' && err.code !== 'sha') { away.add(via); i++; continue; }
          }
        }
        state.pending.splice(i, 1);
        persist();
      }
    } catch { /* away: next time */ } finally {
      draining = false;
      progress({ phase: 'idle', left: state.pending.length });
    }
  }

  // ── is each device there ──────────────────────────────────────────────────
  /** What each device answered when last asked (not kept: asked again when Tools opens). */
  const reach = new Map();
  async function checkDevice(device) {
    const seen = { at: Date.now(), ok: false, error: null, version: null };
    try {
      const addr = await peerAddress(device.name);
      seen.address = addr.host;
      const h = await Promise.race([getJson(addr, `${API}/hello`), delay(5000).then(() => { throw fail('unreachable'); })]);
      if (h?.app !== 'nebula') throw fail('protocol');
      seen.version = String(h.version ?? '');
      if (h.instance === state.instance) throw fail('self');
      if (state.peers.some((d) => d !== device && d.instance && d.instance === h.instance)) throw fail('twice');
      if (seen.version !== o.version) throw fail('version', { theirs: seen.version, mine: o.version });
      seen.ok = true;
    } catch (err) { Object.assign(seen, errorOf(err)); }
    if (state.peers.includes(device)) reach.set(device.name, seen);
    return seen;
  }
  async function checkAll() {
    if (!ready() || o.shut()) return publicState();
    await Promise.all(state.peers.map(checkDevice));
    return publicState();
  }

  // ── what the rest of the app calls ────────────────────────────────────────
  function publicState() {
    return {
      enabled: state.enabled,
      devices: state.peers.map((d) => ({ name: d.name, seen: d.seen, reach: reach.get(d.name) ?? null })),
      maxDevices: MAX_DEVICES,
      openSync: state.openSync,
      paired: !!getKey(),
      hasCode: !!getKey() && !!keptCode(),
      canPair: (() => { try { return !!o.canProtect(); } catch { return false; } })(),
      address: testing ? host : tailnetAddress(),
      listening: !!listeningOn,
      busy: !!pulling,
      waiting: state.pending.length,
      last: state.last,
      version: o.version,
    };
  }

  /** A note deleted here: remembered as gone (its id, nothing else), and nothing half-downloaded for it is left. */
  async function forgetNote(id) {
    if (!NOTE_ID.test(String(id ?? ''))) return;
    noteCache.delete(id);
    const hadPending = state.pending.some((f) => f.to === id);
    state.pending = state.pending.filter((f) => f.to !== id);
    await fs.rm(path.join(partialDir(), id), { recursive: true, force: true }).catch(() => {});
    if (!getKey() && !hadPending) return;
    state.tombs[id] = Date.now();
    for (const d of state.peers) delete d.base[id];
    persist();
  }

  /**
   * Closing, or Sync now: every device is asked to pull now, while this copy still answers.
   * How many did, done; 0 is falsy, so closing reads it as before.
   */
  async function nudgePeer(ms = 8000) {
    if (!ready() || o.shut() || !state.peers.length) return 0;
    const one = async (device) => {
      try {
        const addr = await Promise.race([peerAddress(device.name), delay(1500).then(() => { throw fail('unreachable'); })]);
        const res = await request(addr, 'POST', `${API}/nudge`, { timeout: ms });
        res.resume();
        return res.statusCode === 200;
      } catch { return false; }
    };
    return (await Promise.all(state.peers.map(one))).filter(Boolean).length;
  }

  let timer = null;
  function start() {
    serve();
    timer ??= setInterval(() => { serve(); void drainPending(); }, 60_000);
    timer.unref?.();
  }
  function shutdown() {
    if (timer) clearInterval(timer);
    timer = null;
    stop();
  }

  /** A device added to the list, or taken off it (its history with this copy goes with it). */
  function addDevice(raw) {
    const name = cleanName(raw);
    if (!name) return { ok: false, error: 'peer' };
    if (deviceNamed(name)) return { ok: true, state: publicState() };
    if (state.peers.length >= MAX_DEVICES) return { ok: false, error: 'too-many' };
    state.peers.push(cleanDevice({ name }));
    persist();
    return { ok: true, state: publicState() };
  }
  function removeDevice(raw) {
    const name = cleanName(raw) ?? String(raw ?? '');
    state.peers = state.peers.filter((d) => d.name !== name);
    state.pending = state.pending.filter((f) => (f.via ?? '') !== name);
    reach.delete(name);
    persist();
    return { ok: true, state: publicState() };
  }

  function register(ipcMain, fromWindow) {
    const handle = (name, run) => ipcMain.handle(`sync:${name}`, async (e, ...args) => {
      if (!fromWindow(e)) return { ok: false, error: 'not allowed' };
      if (o.shut()) return { ok: false, error: 'locked' };
      try { return await run(...args); } catch (err) { log.warn(`[nebula] sync ${name} failed:`, err.message); return { ok: false, error: 'failed' }; }
    });
    handle('state', () => publicState());
    handle('configure', (patch = {}) => {
      if ('addDevice' in patch) { const r = addDevice(patch.addDevice); if (!r.ok) return r; }
      if ('removeDevice' in patch) removeDevice(patch.removeDevice);
      if ('enabled' in patch) state.enabled = patch.enabled === true;
      if ('openSync' in patch) state.openSync = patch.openSync !== false;
      persist();
      serve();
      return { ok: true, state: publicState() };
    });
    handle('make-code', () => {
      if (!o.canProtect()) return { ok: false, error: 'protect' };
      const code = makePairingCode();
      setCode(code);
      serve();
      return { ok: true, code };
    });
    handle('set-code', (raw) => {
      if (!o.canProtect()) return { ok: false, error: 'protect' };
      if (!cleanPairingCode(raw)) return { ok: false, error: 'code' };
      setCode(raw);
      serve();
      return { ok: true };
    });
    // The group's code again, for the next device: wrapped like the key, so no more than the key it makes.
    handle('show-code', () => {
      const code = getKey() ? keptCode() : null;
      return code ? { ok: true, code: code.match(/.{1,4}/g).join('-') } : { ok: false, error: 'no-code' };
    });
    handle('unpair', () => {
      fsSync.rmSync(pairFile(), { force: true });
      fsSync.rmSync(codeFile(), { force: true });
      key = null;
      for (const d of state.peers) forgetDevice(d);
      reach.clear();
      persist();
      serve();
      return { ok: true };
    });
    // Both ways (the owner, 2026-11-05: "sync now dedim … diğer bilgisayarda sync olmuş olması lazım"):
    // this copy pulls, then asks the devices it reached to pull from it in turn.
    handle('now', async () => {
      const summary = await pull('manual');
      const reached = summary.devices.filter((d) => !d.error).length;
      if (!reached) return summary;
      progress({ phase: 'others', devices: reached });
      const told = await nudgePeer(35_000);
      progress({ phase: 'others-done', told, devices: reached });
      return { ...summary, told };
    });
    handle('check', () => checkAll());
    handle('keep-out', (ids) => {
      keepOut = new Set((Array.isArray(ids) ? ids : []).filter((id) => NOTE_ID.test(String(id))));
      if (state.pending.length) void drainPending();
      return { ok: true };
    });
    ipcMain.on('sync:answer', (e, msg) => {
      if (fromWindow(e)) answer(Number(msg?.requestId), msg?.result, msg?.error);
    });
  }

  return {
    start, shutdown, register, pull, nudgePeer, forgetNote, publicState, answer, checkAll,
    // Tests drive these without a window.
    setKeepOut: (ids) => { keepOut = new Set(ids); },
    configure: ({ peer, peers, ...patch }) => {
      Object.assign(state, patch);
      for (const name of peers ?? (peer ? [peer] : [])) addDevice(name);
      persist();
      serve();
    },
    pairWith: (code) => { setCode(code); serve(); },
    listening: () => listeningOn,
    drained: async () => { while (draining) await delay(20); },
  };
}
