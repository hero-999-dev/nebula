/**
 * Two computers on one tailnet, one vault each (1.0.3, sync.js). What is
 * decided here is pure: which notes to take, which to let go, when two edits
 * met — and the signature that proves a request came from the paired copy.
 *
 * Pull only. A copy never writes to the other's disk: the other's window holds
 * its notes in memory and would write them straight back. Each copy reads the
 * other's vault and changes its own through its own window; a nudge asks the
 * other to do the same.
 *
 * The base is what both copies last agreed on, per note: a hash both had. A
 * side that still has the base did not change the note; a side that has not
 * deleted it but whose peer has a tombstone for it lets it go.
 */
import crypto from 'node:crypto';

export const PROTOCOL = 1;
export const SYNC_PORT = 37412;
/** Bigger than this, a file comes in the background, after the notes (frame first). */
export const BIG_FILE = 5 * 1024 * 1024;
/** How long a deletion is remembered for a copy that was away. */
export const TOMB_DAYS = 180;
/** A signed request older or newer than this is refused. */
export const SKEW_MS = 5 * 60 * 1000;

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** Stamps a copy writes on its own, without the note changing: left out of the hash. */
const BOOKKEEPING = new Set(['markupVersion']);
const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);

/**
 * A note's text, hashed in one shape: pretty or compact, keys in any order, the
 * same note is the same hash (disk-store.js writes a long note compact). A
 * markup stamp one copy added on opening is not a change either: without this,
 * the first sync kept a copy of every note one side had merely opened.
 * @returns {{hash: string, note: object}|null}
 */
export function hashNote(text) {
  try {
    const note = JSON.parse(String(text));
    if (!note || typeof note !== 'object' || Array.isArray(note)) return null;
    const shape = canonical(Object.fromEntries(Object.entries(note).filter(([k]) => !BOOKKEEPING.has(k))));
    return { hash: sha(JSON.stringify(shape)).slice(0, 32), note };
  } catch { return null; }
}

/** The id a conflict's other version is kept under: the same on both computers. */
export const copyIdOf = (id, hash) => `${String(id).slice(0, 100)}-c${String(hash).slice(0, 8)}`;

/**
 * The version that lost, as a note of its own. Built from its text alone, so
 * the two computers make the very same note and agree on it afterwards. Its
 * pictures are named in its own folder; sync.js puts them there.
 */
export function conflictCopy(text, id, copyId) {
  const note = JSON.parse(String(text));
  const stamp = new Date(Number(note.updatedAt) || 0).toISOString().slice(0, 16).replace('T', ' ');
  const from = `nebula-media://note/${id}/`;
  const to = `nebula-media://note/${copyId}/`;
  const moved = (v) => (typeof v === 'string' ? v.split(from).join(to) : v);
  const out = {};
  for (const [key, value] of Object.entries(note)) out[key] = key === 'content' ? moved(value) : value;
  out.id = copyId;
  out.title = `${String(note.title ?? '').trim() || 'Untitled'} ⇄ ${stamp}`;
  delete out.pinned;
  return JSON.stringify(out, null, 2);
}

/**
 * What one pull does.
 *
 * @param {object} p
 * @param {Map<string,{hash:string, updatedAt:number}>} p.local  this vault
 * @param {Map<string,{hash:string, updatedAt:number}>} p.remote the peer's vault
 * @param {Map<string,string>} p.base     id → the hash both last had
 * @param {Map<string,number>} p.localTombs  id → when it was deleted here
 * @param {Map<string,number>} p.remoteTombs id → when it was deleted there
 * @param {Set<string>} [p.keepOut] this copy's own guide, never sent nor taken
 * @returns {{take: object[], drop: object[], copies: object[], same: object[]}}
 *   take   {id, hash, expect}  the peer's version replaces (or becomes) this one;
 *          `expect` is the local updatedAt seen, null for a new note — the window
 *          takes it only if the note is still as it was
 *   drop   {id, expect}        deleted there, unchanged here
 *   copies {id, copyId, side}  both changed: the losing side ('local'|'remote') kept as a copy
 *   same   {id, hash}          already alike
 */
export function planSync({ local, remote, base, localTombs = new Map(), remoteTombs = new Map(), keepOut = new Set() }) {
  const take = [];
  const drop = [];
  const copies = [];
  const same = [];
  const ids = new Set([...local.keys(), ...remote.keys()]);
  for (const id of ids) {
    if (keepOut.has(id)) continue;
    const L = local.get(id);
    const R = remote.get(id);
    const B = base.get(id) ?? null;
    if (L && R) {
      if (L.hash === R.hash) { same.push({ id, hash: L.hash }); continue; }
      if (R.hash === B) continue;                       // changed here only: the peer takes it
      if (L.hash === B) { take.push({ id, hash: R.hash, expect: L.updatedAt }); continue; }
      // Both changed. The newer stays under the id; the other is kept beside it.
      const remoteWins = R.updatedAt > L.updatedAt || (R.updatedAt === L.updatedAt && R.hash > L.hash);
      if (remoteWins) {
        copies.push({ id, copyId: copyIdOf(id, L.hash), side: 'local' });
        take.push({ id, hash: R.hash, expect: L.updatedAt });
      } else {
        copies.push({ id, copyId: copyIdOf(id, R.hash), side: 'remote' });
      }
      continue;
    }
    if (L) {
      const gone = remoteTombs.get(id);
      if (gone != null && (L.hash === B || L.updatedAt <= gone)) drop.push({ id, expect: L.updatedAt });
      // Otherwise: new here, or changed after the peer deleted it — the peer takes it back.
      continue;
    }
    const gone = localTombs.get(id);
    if (gone != null && (R.hash === B || R.updatedAt <= gone)) continue;   // deleted here: the peer lets it go
    take.push({ id, hash: R.hash, expect: null });
  }
  // A copy already here is not made again; one the peer already made comes as a note of its own.
  return { take, drop, copies: copies.filter((c) => !local.has(c.copyId) && !remote.has(c.copyId)), same };
}

/**
 * A list kept beside the notes (folders.json, projects.json), merged by id.
 * The base is the elements both had alike; an element one side changed or
 * added is kept, one side deleted from the base goes.
 * @returns {{merged: object[], base: object[], changed: boolean}}
 */
export function mergeList(base = [], local = [], remote = []) {
  const key = (e) => JSON.stringify(e);
  const byId = (list) => new Map((Array.isArray(list) ? list : []).filter((e) => e && typeof e.id === 'string').map((e) => [e.id, e]));
  const B = byId(base);
  const L = byId(local);
  const R = byId(remote);
  const merged = [];
  for (const [id, l] of L) {
    const r = R.get(id);
    const b = B.get(id);
    if (!r) { if (!b || key(b) !== key(l)) merged.push(l); continue; }     // deleted there, unchanged here: goes
    if (key(l) === key(r) || !b || key(l) !== key(b)) merged.push(l);       // alike, new on both, or changed here
    else merged.push(r);
  }
  for (const [id, r] of R) {
    if (L.has(id)) continue;
    const b = B.get(id);
    if (!b || key(b) !== key(r)) merged.push(r);                             // new there, or changed there after a delete here
  }
  const agreed = merged.filter((e) => R.has(e.id) && key(R.get(e.id)) === key(e));
  const changed = merged.length !== L.size || merged.some((e) => !L.has(e.id) || key(L.get(e.id)) !== key(e));
  return { merged, base: agreed, changed };
}

/** The pairing code: shown once on one computer, typed on the other. 120 bits. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makePairingCode(bytes = crypto.randomBytes(15)) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{1,4}/g).join('-');
}
/** A code as typed: case, spaces and dashes do not matter. */
export function cleanPairingCode(raw) {
  const s = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
  return s.length === 24 && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}
/** The key both computers sign with — the code itself never travels. */
export const keyOfCode = (code) => crypto.createHash('sha256').update(`nebula-sync-v1:${cleanPairingCode(code)}`).digest();

const macOf = (key, text) => crypto.createHmac('sha256', key).update(text).digest('hex');
const sameHex = (a, b) => {
  const [x, y] = [Buffer.from(String(a), 'hex'), Buffer.from(String(b), 'hex')];
  return x.length === 32 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * A request signed for once: its time and a nonce never used before, so a
 * signature seen is no use a second time (sync.js remembers the nonces).
 */
export function signRequest(key, method, path, ts = Date.now(), nonce = crypto.randomBytes(16).toString('hex')) {
  return `v1.${ts}.${nonce}.${macOf(key, `${method.toUpperCase()}\n${path}\n${ts}\n${nonce}`)}`;
}
/** The request's nonce when it is signed with `key` and timely, else null. */
export function verifyRequest(key, header, method, path, now = Date.now()) {
  const m = /^v1\.(\d{10,16})\.([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(String(header ?? ''));
  if (!m || !key) return null;
  const [, ts, nonce, mac] = m;
  if (Math.abs(now - Number(ts)) > SKEW_MS) return null;
  return sameHex(macOf(key, `${method.toUpperCase()}\n${path}\n${ts}\n${nonce}`), mac) ? nonce : null;
}

/**
 * The answer's proof: the peer, too, holds the key. Without it a request is
 * answered by whatever sits at the peer's address, and its notes are not taken.
 */
export const proveReply = (key, nonce) => macOf(key, `reply\n${nonce}`);
export const checkReply = (key, nonce, proof) => !!key && /^[0-9a-f]{64}$/.test(String(proof ?? '')) && sameHex(proveReply(key, nonce), proof);

/** A Tailscale address: 100.64.0.0/10, written plainly or inside IPv6. */
export function inTailnet(addr) {
  const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(String(addr ?? ''));
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 100 && b >= 64 && b <= 127;
}
/**
 * The adapter Tailscale made: "Tailscale" on Windows, tailscale0 on Linux, a
 * utun on macOS. 100.64.0.0/10 is also what a carrier hands out behind its NAT
 * (CGNAT), and an address there is shared with the carrier's other customers.
 */
export const isTailscaleAdapter = (name) => /tailscale|^utun\d*$/i.test(String(name ?? ''));
export const isLoopback =(addr) => /^(?:::ffff:)?127\.\d+\.\d+\.\d+$|^::1$/.test(String(addr ?? ''));

/** The peer as typed: a tailnet address or a MagicDNS name, nothing else. */
export function cleanPeer(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s || s.length > 253) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)) return s;
  return /^[a-z0-9](?:[a-z0-9-]{0,62})(?:\.[a-z0-9](?:[a-z0-9-]{0,62}))*$/.test(s) ? s : null;
}

/** Where a download stopped, and the Range header that carries on from there. */
export function resumeFrom(have, total) {
  if (!(have > 0) || !(total > 0) || have >= total) return { start: 0, header: null };
  return { start: have, header: `bytes=${have}-${total - 1}` };
}

/** Deletions older than the window are forgotten. */
export function pruneTombs(tombs, now = Date.now()) {
  const out = new Map();
  for (const [id, at] of tombs) if (now - at < TOMB_DAYS * 86_400_000) out.set(id, at);
  return out;
}
