/**
 * Tailscale sync's decisions (1.0.3, electron/sync-core.js): what one pull
 * takes, lets go and keeps beside, and who may ask. The two copies talking
 * over loopback are in tests/e2e/sync.mjs.
 */
import { describe, it, expect } from 'vitest';
import {
  hashNote, copyIdOf, conflictCopy, planSync, mergeList, makePairingCode, cleanPairingCode, keyOfCode,
  signRequest, verifyRequest, proveReply, checkReply, isTailscaleAdapter, inTailnet, isLoopback, cleanPeer, resumeFrom, pruneTombs, SKEW_MS, TOMB_DAYS,
} from '../electron/sync-core.js';

const n = (hash, updatedAt) => ({ hash, updatedAt });
const plan = (o) => planSync({ local: new Map(), remote: new Map(), base: new Map(), ...o });

describe('a note’s hash', () => {
  it('is the same pretty or compact, and nothing for what is not a note', () => {
    const note = { id: 'a', title: 'T', content: '<p>x</p>', updatedAt: 5 };
    expect(hashNote(JSON.stringify(note, null, 2)).hash).toBe(hashNote(JSON.stringify(note)).hash);
    expect(hashNote(JSON.stringify({ ...note, title: 'U' })).hash).not.toBe(hashNote(JSON.stringify(note)).hash);
    const reordered = Object.fromEntries(Object.entries(note).reverse());
    expect(hashNote(JSON.stringify({ ...reordered, markupVersion: '1.0.1' })).hash).toBe(hashNote(JSON.stringify(note)).hash);
    expect(hashNote('nonsense')).toBeNull();
    expect(hashNote('[1]')).toBeNull();
    expect(hashNote('null')).toBeNull();
  });
});

describe('one pull', () => {
  it('takes what changed there, leaves what changed here', () => {
    const p = plan({
      local: new Map([['a', n('A1', 1)], ['b', n('B2', 9)], ['c', n('C', 1)]]),
      remote: new Map([['a', n('A2', 9)], ['b', n('B1', 1)], ['c', n('C', 1)]]),
      base: new Map([['a', 'A1'], ['b', 'B1'], ['c', 'C']]),
    });
    expect(p.take).toEqual([{ id: 'a', hash: 'A2', expect: 1 }]);
    expect(p.same).toEqual([{ id: 'c', hash: 'C' }]);
    expect(p.copies).toEqual([]);
    expect(p.drop).toEqual([]);
  });

  it('takes a note new there, and keeps one new here for the peer to take', () => {
    const p = plan({ local: new Map([['mine', n('M', 1)]]), remote: new Map([['theirs', n('T', 1)]]) });
    expect(p.take).toEqual([{ id: 'theirs', hash: 'T', expect: null }]);
    expect(p.drop).toEqual([]);
  });

  it('when both changed, the newer stays and the other is kept beside it — the same on both computers', () => {
    const here = { local: new Map([['a', n('aaaaaaaa11', 5)]]), remote: new Map([['a', n('bbbbbbbb22', 7)]]), base: new Map([['a', 'old']]) };
    const p = plan(here);
    expect(p.take).toEqual([{ id: 'a', hash: 'bbbbbbbb22', expect: 5 }]);
    expect(p.copies).toEqual([{ id: 'a', copyId: 'a-caaaaaaaa', side: 'local' }]);
    // The other computer, pulling from this one, keeps its own version and makes the same copy.
    const there = plan({ local: here.remote, remote: here.local, base: here.base });
    expect(there.take).toEqual([]);
    expect(there.copies).toEqual([{ id: 'a', copyId: 'a-caaaaaaaa', side: 'remote' }]);
    // A tie is settled by the hash, the same way on both.
    const tie = plan({ local: new Map([['a', n('x1', 5)]]), remote: new Map([['a', n('x2', 5)]]), base: new Map() });
    const tieThere = plan({ local: new Map([['a', n('x2', 5)]]), remote: new Map([['a', n('x1', 5)]]), base: new Map() });
    expect(tie.copies[0].copyId).toBe(tieThere.copies[0].copyId);
    // Made once: a copy already here is not made again.
    const again = plan({ ...here, local: new Map([...here.local, ['a-caaaaaaaa', n('cp', 5)]]) });
    expect(again.copies).toEqual([]);
    // The peer made it first: it is taken as a note, not made twice.
    const made = plan({ ...here, remote: new Map([...here.remote, ['a-caaaaaaaa', n('cp', 5)]]) });
    expect(made.copies).toEqual([]);
    expect(made.take.map((t) => t.id)).toEqual(['a', 'a-caaaaaaaa']);
  });

  it('lets go of a note deleted there and untouched here; keeps one changed after the delete', () => {
    const remoteTombs = new Map([['a', 100], ['b', 100], ['c', 100]]);
    const p = plan({
      local: new Map([['a', n('A', 50)], ['b', n('B2', 200)], ['c', n('C', 90)]]),
      base: new Map([['a', 'A'], ['b', 'B1']]),
      remoteTombs,
    });
    expect(p.drop).toEqual([{ id: 'a', expect: 50 }, { id: 'c', expect: 90 }]);
  });

  it('does not take back what was deleted here, unless it changed there after', () => {
    const p = plan({
      remote: new Map([['a', n('A', 50)], ['b', n('B2', 200)]]),
      base: new Map([['a', 'A'], ['b', 'B1']]),
      localTombs: new Map([['a', 100], ['b', 100]]),
    });
    expect(p.take).toEqual([{ id: 'b', hash: 'B2', expect: null }]);
  });

  it('never touches a copy’s own guide', () => {
    const p = plan({ remote: new Map([['guide', n('G', 1)]]), keepOut: new Set(['guide']) });
    expect(p.take).toEqual([]);
  });
});

describe('the losing version, kept as a note', () => {
  it('moves under its own id, its pictures named in its own folder, dated in its title', () => {
    const text = JSON.stringify({ id: 'a', title: 'Plan', pinned: true, updatedAt: Date.UTC(2026, 10, 4, 9, 30), content: '<img src="nebula-media://note/a/p.png"><img src="nebula-media://note/other/q.png">' });
    const copy = JSON.parse(conflictCopy(text, 'a', copyIdOf('a', 'deadbeef00')));
    expect(copy.id).toBe('a-cdeadbeef');
    expect(copy.title).toBe('Plan ⇄ 2026-11-04 09:30');
    expect(copy.content).toContain('nebula-media://note/a-cdeadbeef/p.png');
    expect(copy.content).toContain('nebula-media://note/other/q.png');
    expect(copy.pinned).toBeUndefined();
    expect(conflictCopy(text, 'a', 'a-cdeadbeef')).toBe(conflictCopy(text, 'a', 'a-cdeadbeef'));
    expect(copyIdOf('x'.repeat(120), 'abcdef0123')).toMatch(/^[\w-]{1,120}$/);
  });
});

describe('folders and projects', () => {
  const f = (id, name) => ({ id, name });
  it('keep what either side added or changed, and let go what one deleted untouched', () => {
    const base = [f('a', 'A'), f('b', 'B'), f('c', 'C')];
    const local = [f('a', 'A2'), f('b', 'B'), f('n', 'New here')];        // c deleted here
    const remote = [f('a', 'A'), f('c', 'C'), f('m', 'New there')];       // b deleted there
    const { merged, base: agreed, changed } = mergeList(base, local, remote);
    expect(merged).toEqual([f('a', 'A2'), f('n', 'New here'), f('m', 'New there')]);
    expect(agreed).toEqual([f('m', 'New there')]);
    expect(changed).toBe(true);
  });

  it('take a change made there, and say when nothing changed', () => {
    expect(mergeList([f('a', 'A')], [f('a', 'A')], [f('a', 'A9')]).merged).toEqual([f('a', 'A9')]);
    const still = mergeList([f('a', 'A')], [f('a', 'A')], [f('a', 'A')]);
    expect(still.changed).toBe(false);
    expect(still.base).toEqual([f('a', 'A')]);
    expect(mergeList(undefined, 'x', null).merged).toEqual([]);
  });
});

describe('pairing and signatures', () => {
  it('a code is 24 letters in sixes of four, typed however', () => {
    const code = makePairingCode();
    expect(code).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){5}$/);
    expect(cleanPairingCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code.replace(/-/g, ''));
    expect(cleanPairingCode('ABCD-1234')).toBeNull();
    expect(cleanPairingCode('O'.repeat(24))).toBeNull();
    expect(keyOfCode(code).equals(keyOfCode(code.toLowerCase()))).toBe(true);
    expect(makePairingCode()).not.toBe(code);
  });

  it('a request is signed for its method, path and moment', () => {
    const key = keyOfCode(makePairingCode());
    const now = 1_800_000_000_000;
    const nonce = 'ab'.repeat(16);
    const header = signRequest(key, 'get', '/sync/v1/manifest', now, nonce);
    expect(verifyRequest(key, header, 'GET', '/sync/v1/manifest', now + 1000)).toBe(nonce);
    expect(verifyRequest(key, header, 'GET', '/sync/v1/note/a', now)).toBeNull();
    expect(verifyRequest(key, header, 'POST', '/sync/v1/manifest', now)).toBeNull();
    expect(verifyRequest(key, header, 'GET', '/sync/v1/manifest', now + SKEW_MS + 1)).toBeNull();
    expect(verifyRequest(keyOfCode(makePairingCode()), header, 'GET', '/sync/v1/manifest', now)).toBeNull();
    expect(verifyRequest(key, 'v1.x.y', 'GET', '/', now)).toBeNull();
    expect(verifyRequest(null, header, 'GET', '/sync/v1/manifest', now)).toBeNull();
    // The nonce is signed too: another put in its place is refused.
    expect(verifyRequest(key, header.replace(nonce, 'cd'.repeat(16)), 'GET', '/sync/v1/manifest', now)).toBeNull();
    // Each signature has a nonce of its own.
    expect(signRequest(key, 'GET', '/', now)).not.toBe(signRequest(key, 'GET', '/', now));
  });

  it('an answer proves it comes from the paired copy', () => {
    const key = keyOfCode(makePairingCode());
    const nonce = 'ab'.repeat(16);
    const proof = proveReply(key, nonce);
    expect(checkReply(key, nonce, proof)).toBe(true);
    expect(checkReply(key, 'cd'.repeat(16), proof)).toBe(false);
    expect(checkReply(keyOfCode(makePairingCode()), nonce, proof)).toBe(false);
    expect(checkReply(key, nonce, undefined)).toBe(false);
    expect(checkReply(key, nonce, 'zz')).toBe(false);
    expect(checkReply(null, nonce, proof)).toBe(false);
  });
});

describe('addresses', () => {
  it('knows a tailnet address from any other', () => {
    for (const a of ['100.64.0.1', '100.101.102.103', '100.127.255.255', '::ffff:100.70.1.2']) expect(inTailnet(a), a).toBe(true);
    for (const a of ['100.63.255.255', '100.128.0.1', '192.168.1.5', '10.0.0.1', '127.0.0.1', 'fd7a:115c::1', '', null]) expect(inTailnet(a), String(a)).toBe(false);
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('100.64.0.1')).toBe(false);
    // A carrier's 100.64 address on Wi-Fi is not the tailnet: only Tailscale's adapter is.
    for (const n of ['Tailscale', 'tailscale0', 'utun3']) expect(isTailscaleAdapter(n), n).toBe(true);
    for (const n of ['Wi-Fi', 'Ethernet', 'wlan0', 'Mobile broadband', '', null]) expect(isTailscaleAdapter(n), String(n)).toBe(false);
  });

  it('takes a peer as an address or a MagicDNS name, nothing else', () => {
    expect(cleanPeer(' 100.64.0.7 ')).toBe('100.64.0.7');
    expect(cleanPeer('Laptop.tail1234.ts.net')).toBe('laptop.tail1234.ts.net');
    expect(cleanPeer('http://evil')).toBeNull();
    expect(cleanPeer('a b')).toBeNull();
    expect(cleanPeer('')).toBeNull();
  });
});

describe('downloads and deletions', () => {
  it('carry on from where a download stopped', () => {
    expect(resumeFrom(0, 100)).toEqual({ start: 0, header: null });
    expect(resumeFrom(40, 100)).toEqual({ start: 40, header: 'bytes=40-99' });
    expect(resumeFrom(100, 100)).toEqual({ start: 0, header: null });
  });

  it('forget a deletion after its window', () => {
    const now = Date.now();
    const kept = pruneTombs(new Map([['old', now - (TOMB_DAYS + 1) * 86_400_000], ['new', now - 1000]]), now);
    expect([...kept.keys()]).toEqual(['new']);
  });
});
