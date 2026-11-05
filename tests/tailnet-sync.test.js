/**
 * Tailscale sync, the window's half (1.0.3, src/js/tailnet-sync.js): what
 * came is taken only where the note is still as the pull saw it, and never
 * into a black hole. And the Tools sheet's one-line summary.
 */
import { describe, it, expect } from 'vitest';
import { canTake, applyIncoming, keepOutOf } from '../src/js/tailnet-sync.js';
import { lastLine, syncError, compareVersions, deviceLine, syncCardLine, TAILSCALE_STEPS } from '../src/js/tools-panel.js';
import { GUIDE_NOTE } from '../src/js/seed-notes.js';

function fakeStore(notes) {
  const saved = [];
  const destroyed = [];
  return {
    notes,
    saved,
    destroyed,
    get(id) { return this.notes.find((n) => n.id === id) ?? null; },
    save(changed) { saved.push(changed); },
    destroy(id) { this.notes = this.notes.filter((n) => n.id !== id); destroyed.push(id); return true; },
  };
}
const text = (note) => JSON.stringify(note);

describe('taking a note that came', () => {
  it('only while it is as the pull saw it, and never a black hole’s', () => {
    expect(canTake(null, null)).toBe(true);
    expect(canTake({ id: 'a', updatedAt: 5 }, null)).toBe(false);
    expect(canTake({ id: 'a', updatedAt: 5 }, 5)).toBe(true);
    expect(canTake({ id: 'a', updatedAt: 6 }, 5)).toBe(false);
    expect(canTake({ id: 'a', updatedAt: 5, hole: 'h' }, 5)).toBe(false);
    expect(canTake(null, 5)).toBe(false);
  });

  it('copies first, then the notes; a word typed meanwhile is never written over', () => {
    const store = fakeStore([{ id: 'a', title: 'A', updatedAt: 5 }, { id: 'b', title: 'B', updatedAt: 9 }]);
    const r = applyIncoming(store, {
      copies: [{ id: 'a-c1', text: text({ id: 'a-c1', title: 'A ⇄', updatedAt: 5 }), expect: null }],
      notes: [
        { id: 'a', text: text({ id: 'a', title: 'A there', updatedAt: 7 }), expect: 5 },
        { id: 'b', text: text({ id: 'b', title: 'B there', updatedAt: 8 }), expect: 3 },     // typed here since
        { id: 'n', text: text({ id: 'n', title: 'New', updatedAt: 1 }), expect: null },
        { id: 'x', text: text({ id: 'y' }), expect: null },                                    // not what it says
        { id: 'h', text: text({ id: 'h', hole: 'z' }), expect: null },
      ],
    });
    expect(r.applied).toEqual(['a-c1', 'a', 'n']);
    expect(r.skipped).toEqual(['b', 'x', 'h']);
    expect(store.get('a').title).toBe('A there');
    expect(store.get('b').title).toBe('B');
    expect(store.saved).toEqual([['a-c1', 'a', 'n']]);
  });

  it('lets go of a note deleted there only when it is untouched here', () => {
    const store = fakeStore([{ id: 'a', updatedAt: 5 }, { id: 'b', updatedAt: 6 }, { id: 'h', updatedAt: 1, hole: 'z' }]);
    const r = applyIncoming(store, { drops: [{ id: 'a', expect: 5 }, { id: 'b', expect: 5 }, { id: 'h', expect: 1 }] });
    expect(r.dropped).toEqual(['a']);
    expect(r.skipped).toEqual(['b', 'h']);
    expect(store.saved).toEqual([]);
  });

  it('keeps the guide to each computer', () => {
    const store = fakeStore([{ id: 'g', title: GUIDE_NOTE.title }, { id: 'a', title: 'Mine' }]);
    expect(keepOutOf(store)).toEqual(['g']);
  });
});

describe('the Tools sheet', () => {
  it('says the last sync in one line', () => {
    const now = 1_800_000_000_000;
    expect(lastLine(null)).toBe('Not synced yet.');
    expect(lastLine({ at: now - 10_000, took: 3, copies: 1, dropped: 0, skipped: 0 }, now)).toBe('just now: 3 taken, 1 kept side by side');
    expect(lastLine({ at: now - 5 * 60_000, error: 'unreachable' }, now)).toMatch(/^5 min ago: The other computer did not answer/);
    expect(syncError('version', '1.0.2')).toBe('Both computers need the same version of Nebula. (1.0.2)');
    expect(syncError('anything')).toBe('Sync failed.');
  });

  // The owner, 2026-11-04: "bir tanesi gerideyse önce güncelleyin desin".
  it('says which computer is behind, and to update it first', () => {
    expect(compareVersions('1.0.2', '1.0.3')).toBeLessThan(0);
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.3', '1.0.3')).toBe(0);
    expect(syncError('version', '1.0.2', '1.0.3')).toBe('The other computer has an older Nebula (1.0.2; this one has 1.0.3). Update Nebula there first, then sync.');
    expect(syncError('version', '1.0.4', '1.0.3')).toBe('This computer has an older Nebula (1.0.3; the other has 1.0.4). Update Nebula here first, then sync.');
    expect(lastLine({ at: 1, error: 'version', theirs: '1.0.4', mine: '1.0.3' }, 1)).toMatch(/Update Nebula here first/);
  });

  // The owner, 2026-11-04: "bilgisayarlar birbirine bağlı ise Tailscale bağlı olduğunu feedback versin".
  it('says beside each device whether it is connected, else why not', () => {
    const now = 1_800_000_000_000;
    expect(deviceLine({ name: 'laptop', reach: { ok: true, version: '1.0.3' }, seen: { at: now - 3 * 60_000 } }, now))
      .toEqual({ ok: true, text: 'Connected · Nebula 1.0.3 · synced 3 min ago' });
    expect(deviceLine({ name: 'phone', reach: { ok: false, error: 'unreachable' } }, now))
      .toEqual({ ok: false, text: 'Not answering: is it on, with Tailscale and Nebula open?' });
    expect(deviceLine({ name: 'x', reach: { ok: false, error: 'version', theirs: '1.0.2', mine: '1.0.3' } }, now).text).toMatch(/Update Nebula there first/);
    expect(deviceLine({ name: 'new' }, now)).toEqual({ ok: null, text: 'Not checked yet' });
    expect(lastLine({ at: now, took: 2, devices: [{ name: 'a' }, { name: 'b', error: 'unreachable' }] }, now)).toBe('just now: 2 taken, 1 not reached');
  });

  it('guides for any number of devices, not two', () => {
    expect(TAILSCALE_STEPS.join(' ')).not.toMatch(/both|two computers/i);
    expect(TAILSCALE_STEPS.join(' ')).toMatch(/each of the others/);
  });
});

describe('the sync card at the bottom right', () => {
  it('names the device, then counts the notes on the bar', () => {
    expect(syncCardLine({ phase: 'looking', device: 'laptop' })).toMatchObject({ head: 'Syncing with laptop…', share: null, end: false });
    expect(syncCardLine({ phase: 'notes', device: 'laptop', done: 2, total: 8 })).toMatchObject({ line: 'note 3 of 8', share: 0.25 });
    expect(syncCardLine({ phase: 'apply', device: 'laptop', done: 8, total: 8 }).share).toBe(1);
  });
  it('counts a big file in MB, and the files after it', () => {
    const f = syncCardLine({ phase: 'files', name: 'film.mp4', got: 52428800, size: 104857600, left: 3 });
    expect(f).toMatchObject({ head: 'film.mp4', share: 0.5, end: false });
    expect(f.line).toBe('50.0 of 100.0 MB · 2 files still coming');
  });
  it('ends with what came of it', () => {
    expect(syncCardLine({ phase: 'done', took: 3, copies: 1, devices: 2, away: 0 })).toMatchObject({ head: 'Synced', line: '3 taken, 1 kept side by side', end: true });
    expect(syncCardLine({ phase: 'done', took: 0, devices: 2, away: 1 }).line).toBe('Already up to date · 1 not reached');
    expect(syncCardLine({ phase: 'done', error: 'unreachable' })).toMatchObject({ head: 'Sync failed.', failed: true, end: true });
  });
  it('then says whether the others synced back', () => {
    expect(syncCardLine({ phase: 'others', devices: 2 })).toMatchObject({ share: null, end: false });
    expect(syncCardLine({ phase: 'others-done', told: 2, devices: 2 })).toMatchObject({ head: 'Synced on all your devices', line: '', end: true });
    expect(syncCardLine({ phase: 'others-done', told: 1, devices: 2 }).line).toBe('1 not reached');
    expect(syncCardLine({ phase: 'others-done', told: 0, devices: 1 }).head).toBe('Synced here');
    expect(syncCardLine({ phase: 'idle' })).toBeNull();
  });
});
