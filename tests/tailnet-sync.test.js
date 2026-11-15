/**
 * Tailscale sync, the window's half (1.0.3, src/js/tailnet-sync.js): what
 * came is taken only where the note is still as the pull saw it, and never
 * into a black hole. And the Tools sheet's one-line summary.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { NoteStore } from '../src/js/notes.js';
import { initNoteActions } from '../src/js/note-actions.js';
import { canTake, applyIncoming, keepOutOf, canKeepOff, initTailnetSync } from '../src/js/tailnet-sync.js';
import { emit } from '../src/js/bus.js';
import {
  lastLine, syncError, compareVersions, deviceLine, syncCardLine, TAILSCALE_STEPS, firewallHint, FIREWALL_HEAD, FIREWALL_STEPS, initToolsPanel,
} from '../src/js/tools-panel.js';
import { GUIDE_NOTE } from '../src/js/seed-notes.js';
import { STRINGS, t } from '../src/js/i18n.js';
import { makeVideoBlock, refreshVideoBlocks, setComingVideos, comingVideoWords } from '../src/js/file-video.js';
import { makeAttachBlock, refreshAttachBlocks } from '../src/js/file-attach.js';
import { SYNC_PORT } from '../electron/sync-core.js';

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

  // 1.0.4, the owner, 2026-11-15: "notlara sağ tıklayıp bu notu sync olmasın diğer bilgisayarla özelliği olsun".
  it('keeps a note marked so to this computer: named to the main process, nothing taken over it, nothing dropped', () => {
    const store = fakeStore([
      { id: 'g', title: GUIDE_NOTE.title },
      { id: 'a', title: 'Mine', updatedAt: 5, noSync: true },
      { id: 'b', title: 'Shared', updatedAt: 5 },
    ]);
    expect(keepOutOf(store)).toEqual(['g', 'a']);
    expect(canTake({ id: 'a', updatedAt: 5, noSync: true }, 5)).toBe(false);
    const r = applyIncoming(store, {
      notes: [
        { id: 'a', text: text({ id: 'a', title: 'Theirs', updatedAt: 7 }), expect: 5 },
        { id: 'k', text: text({ id: 'k', title: 'Kept there', noSync: true }), expect: null },   // no copy hands such a note out
      ],
      drops: [{ id: 'a', expect: 5 }],
    });
    expect(r).toEqual({ applied: [], dropped: [], skipped: ['a', 'k', 'a'] });
    expect(store.get('a').title).toBe('Mine');
    expect(store.get('k')).toBeNull();
    expect(store.destroyed).toEqual([]);
  });

  it('offers it in the note’s menu once sync is on, and on a kept note always', () => {
    expect(canKeepOff({ id: 'a', title: 'Mine' }, false)).toBe(false);
    expect(canKeepOff({ id: 'a', title: 'Mine' }, undefined)).toBe(false);
    expect(canKeepOff({ id: 'a', title: 'Mine' }, true)).toBe(true);
    expect(canKeepOff({ id: 'a', title: 'Mine', noSync: true }, false)).toBe(true);
    // The guide and a black hole's notes stay on each computer anyway.
    expect(canKeepOff({ id: 'g', title: GUIDE_NOTE.title }, true)).toBe(false);
    expect(canKeepOff({ id: 'h', title: 'Sealed', hole: 'z' }, true)).toBe(false);
    expect(canKeepOff(null, true)).toBe(false);
  });

  it('stands in the note’s own menu, saying what choosing it switches to', () => {
    const page = fs.readFileSync('src/index.html', 'utf8');
    const holder = document.createElement('div');
    holder.innerHTML = /<div class="note-menu" id="note-menu" hidden>[\s\S]*?<\/div>/.exec(page)[0];
    document.body.append(holder);
    localStorage.clear();
    try {
      const store = new NoteStore({ allowSeed: false });
      store.notes = [{ id: 'a', title: 'Mine', content: '', createdAt: 1, updatedAt: 5 }];
      store.save();
      let on = false;
      let changed = 0;
      const actions = initNoteActions({ store, onChanged: () => { changed += 1; }, canKeepOff: (note) => canKeepOff(note, on) });
      const entry = holder.querySelector('[data-note-act="nosync"]');
      // After the view modes, before the labels.
      expect(entry.previousElementSibling.dataset.noteAct).toBe('autoorder');
      const more = actions.moreButton('a');
      holder.append(more);
      more.click();
      expect(entry.hidden).toBe(true);
      more.click();                       // shut
      on = true;
      more.click();
      expect(entry.hidden).toBe(false);
      expect(entry.textContent).toBe('Do not sync this note');
      entry.click();
      expect(store.get('a').noSync).toBe(true);
      expect(changed).toBe(1);
      // Sync switched off since: a kept note still has its way back.
      on = false;
      more.click();
      expect(entry.hidden).toBe(false);
      expect(entry.textContent).toBe('Sync this note again');
      entry.click();
      expect(store.get('a').noSync).toBeUndefined();
      more.click();
      expect(entry.hidden).toBe(true);
      actions.close();
      // The badge by the title, in the Only view badge's shape.
      expect(page).toMatch(/<button type="button" class="readonly-chip" id="nosync-chip" hidden title="[^"]+">Not synced<\/button>/);
    } finally {
      holder.remove();
      localStorage.clear();
    }
  });

  it('knows whether sync is on: asked once, then told by Tools at every change', async () => {
    let enabled = false;
    const state = async () => ({ enabled, paired: false, canPair: true, devices: [], last: null, waiting: 0 });
    window.nebula = { sync: { on() {}, onAsk() {}, keepOut: async () => {}, state, check: state } };
    const overlay = document.createElement('div');
    const body = document.createElement('div');
    overlay.append(body);
    document.body.append(overlay);
    try {
      const tailnet = initTailnetSync({ store: fakeStore([]), folders: {}, projects: {}, saveCurrent: async () => {}, renderList() {}, openNote() {} });
      const panel = initToolsPanel({ overlay, body });
      await new Promise((r) => setTimeout(r, 0));
      expect(tailnet.isOn()).toBe(false);
      enabled = true;
      await panel.refresh();
      expect(tailnet.isOn()).toBe(true);
      // A refusal (the lock shut, say) is no word on the switch.
      emit('sync-state', { ok: false, error: 'locked' });
      expect(tailnet.isOn()).toBe(true);
      enabled = false;
      await panel.refresh();
      expect(tailnet.isOn()).toBe(false);
    } finally {
      delete window.nebula;
      overlay.remove();
      document.querySelector('.sync-screen')?.remove();
      document.getElementById('sync-card')?.remove();
    }
    for (const key of ['Do not sync this note', 'Sync this note again', 'Not synced', 'This note stays on this computer: Tailscale sync leaves it out. Click to sync it again.']) {
      expect(STRINGS[key]).toHaveLength(3);
      expect(new Set(STRINGS[key]).size).toBe(3);
    }
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

  // 1.0.4, learned on 2026-11-05: "did not answer" was a firewall that kept Nebula out, while Tailscale saw the device online.
  it('names the firewall when a device is online in Tailscale and silent in Nebula, and gives the way through', () => {
    const now = 1_800_000_000_000;
    const silent = { name: 'desktop', reach: { ok: false, error: 'unreachable', address: '100.101.1.2', online: true } };
    expect(deviceLine(silent, now)).toEqual({ ok: false, text: 'Online in Tailscale, but Nebula does not answer there', firewall: true });
    // Not online, not to be told, or another reason: the line is as it was and nothing is said of a firewall.
    const others = [
      { name: 'off', reach: { ok: false, error: 'unreachable', online: false } },
      { name: 'unknown', reach: { ok: false, error: 'unreachable', online: null } },
      { name: 'plain', reach: { ok: false, error: 'unreachable' } },
      { name: 'locked', reach: { ok: false, error: 'peer-locked', online: true } },
      { name: 'fine', reach: { ok: true, version: '1.0.4', online: true } },
      // What a pull kept is no word of Tailscale's: only a device asked just now is judged.
      { name: 'old', seen: { at: now, error: 'unreachable', online: true } },
    ];
    for (const d of others) expect(deviceLine(d, now).firewall).toBeUndefined();
    expect(deviceLine(others[0], now).text).toBe('Not answering: is it on, with Tailscale and Nebula open?');
    expect(firewallHint(others, now)).toBeNull();
    expect(firewallHint([], now)).toBeNull();
    expect(firewallHint(undefined, now)).toBeNull();

    const hint = firewallHint([silent, ...others, { name: 'laptop', reach: { ok: false, error: 'unreachable', online: true } }], now);
    expect(hint.head).toMatch(/^Tailscale sees desktop, laptop online, but Nebula does not answer there\./);
    expect(hint.head).toMatch(/the firewall of that device is most likely blocking Nebula/);
    expect(hint.steps).toEqual(FIREWALL_STEPS);
    expect(FIREWALL_STEPS.map((s) => s.split(':')[0])).toEqual(['Windows', 'Mac', 'Linux']);
    // The port named is the one sync listens on.
    expect(FIREWALL_STEPS[2]).toContain(`port ${SYNC_PORT} `);
    expect(FIREWALL_STEPS[2]).toContain(`to any port ${SYNC_PORT} proto tcp`);
    // In every language, with the names' place and the command kept as they are.
    for (const key of ['Online in Tailscale, but Nebula does not answer there', FIREWALL_HEAD, ...FIREWALL_STEPS]) {
      expect(STRINGS[key], key).toHaveLength(3);
      for (const said of STRINGS[key]) {
        expect(said).not.toBe(key);
        if (key.includes('{names}')) expect(said).toContain('{names}');
        if (key.includes('sudo ufw')) expect(said).toContain(`sudo ufw allow in on tailscale0 to any port ${SYNC_PORT} proto tcp`);
        // Nebula's name is never declined.
        expect(said).not.toMatch(/Nebula[a-zęąıİ’']/);
      }
    }
  });

  it('shows the firewall’s way under the list only while a device is online and silent', async () => {
    const overlay = document.createElement('div');
    const body = document.createElement('div');
    overlay.append(body);
    document.body.append(overlay);
    const base = { enabled: true, paired: true, canPair: true, address: '100.101.1.1', listening: true, openSync: false, last: null, waiting: 0 };
    let devices = [{ name: 'desktop', seen: null, reach: { ok: false, error: 'unreachable', address: '100.101.1.2', online: true } }];
    const state = async () => ({ ...base, devices });
    window.nebula = { sync: { state, check: state, on() {} } };
    try {
      const panel = initToolsPanel({ overlay, body });
      const box = body.querySelector('#tool-firewall');
      expect(box.hidden).toBe(true);
      // Between the list and the line that adds a device.
      expect(box.previousElementSibling.id).toBe('tool-devices');
      panel.open();
      await new Promise((r) => setTimeout(r, 20));
      expect(box.hidden).toBe(false);
      expect(box.querySelector('p').textContent).toMatch(/^Tailscale sees desktop online/);
      expect([...box.querySelectorAll('li')].map((li) => li.textContent)).toEqual(FIREWALL_STEPS);
      expect(body.querySelector('.tool-device__state').textContent).toBe('Online in Tailscale, but Nebula does not answer there');
      // It answers again, or Tailscale no longer sees it: the box goes.
      devices = [{ name: 'desktop', seen: null, reach: { ok: false, error: 'unreachable', address: '100.101.1.2', online: false } }];
      await panel.refresh();
      expect(box.hidden).toBe(true);
      expect(box.childElementCount).toBe(0);
      panel.close();
    } finally {
      delete window.nebula;
      overlay.remove();
    }
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

// 1.0.4, learned on 2026-11-05: "Skip" only took the card away; the sync went on.
describe('the card over the window while Nebula opens', () => {
  it('has a button that says what it does: it hides the card and the sync goes on', async () => {
    let done;
    const calls = [];
    const sync = {
      on() {}, onAsk() {},
      keepOut: async () => {},
      state: async () => ({ enabled: true, paired: true, openSync: true, devices: [{ name: 'laptop' }, { name: 'phone' }] }),
      now: () => { calls.push('now'); return new Promise((resolve) => { done = resolve; }); },
    };
    for (const name of ['cancel', 'stop', 'abort', 'skip']) sync[name] = () => { calls.push(name); };
    window.nebula = { sync };
    try {
      const tailnet = initTailnetSync({ store: fakeStore([]), folders: {}, projects: {}, saveCurrent: async () => {}, renderList() {}, openNote() {} });
      const opening = tailnet.onOpening();
      await new Promise((r) => setTimeout(r, 20));
      const card = document.querySelector('.sync-screen');
      const button = card.querySelector('.sync-screen__skip');
      expect(card.hidden).toBe(false);
      expect(card.querySelector('.sync-screen__peer').textContent).toBe('laptop, phone');
      expect(button.textContent).toBe('Hide (keeps syncing)');
      button.click();
      expect(card.hidden).toBe(true);
      // Nothing was called off: the one sync that began is still the only call.
      expect(calls).toEqual(['now']);
      done({});
      await opening;
      expect(card.hidden).toBe(true);
    } finally {
      delete window.nebula;
      document.querySelector('.sync-screen')?.remove();
      document.getElementById('sync-card')?.remove();
    }
    const said = STRINGS['Hide (keeps syncing)'];
    expect(said).toHaveLength(3);
    for (const line of said) expect(line).toMatch(/\(.+\)$/);
    expect(new Set([...said, ...STRINGS.Skip]).size).toBe(6);
  });
});

// 1.0.4, the owner, 2026-11-15: "oynatıcıda video eşitleniyor · % kartı", "iki bilgisayar da açıkken canlı eşitleme".
describe('while both computers are open', () => {
  const file = { id: 'n-1_Ab', name: 'vid-m1abc-0a1b2c3d.mp4' };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('learns which big files are still coming, tells their players as they move on, and shows no card for a live sync', async () => {
    const heard = {};
    let list = [{ ...file, got: 250, size: 1000 }];
    let asked = 0;
    window.nebula = {
      sync: {
        on(name, fn) { heard[name] = fn; }, onAsk() {},
        keepOut: async () => {},
        state: async () => ({ enabled: true }),
        coming: async () => { asked += 1; return list; },
      },
    };
    const root = document.createElement('div');
    root.innerHTML = makeVideoBlock(`nebula-media://note/${file.id}/${file.name}`, 'My clip.mp4').outerHTML;
    document.body.append(root);
    refreshVideoBlocks(root);
    const video = root.querySelector('.link-file');
    video.querySelector('video').load = () => {};   // the page's stand-in has no player to load into
    const word = () => video.querySelector('.video-coming__text')?.textContent ?? null;
    try {
      initTailnetSync({ store: fakeStore([]), folders: {}, projects: {}, saveCurrent: async () => {}, renderList() {}, openNote() {} });
      await tick();
      // Asked once at the start: the player that waits says how much is here.
      expect(asked).toBe(1);
      expect(word()).toBe('Video syncing · 25 %');
      // Each piece that comes moves it on; the card at the bottom right counts it too, as before.
      const card = document.getElementById('sync-card');
      heard.progress({ phase: 'files', ...file, got: 500, size: 1000, left: 1 });
      expect(word()).toBe('Video syncing · 50 %');
      expect(card.hidden).toBe(false);
      // A live sync is no news: no card, whatever it did — but the list of what is coming is asked again.
      card.hidden = true;
      heard.progress({ phase: 'looking', device: 'laptop', reason: 'live' });
      heard.progress({ phase: 'notes', device: 'laptop', done: 0, total: 1, reason: 'live' });
      heard.progress({ phase: 'done', took: 1, devices: 1, away: 0, reason: 'live' });
      expect(card.hidden).toBe(true);
      await tick();
      expect(asked).toBe(2);
      heard.progress({ phase: 'done', error: 'unreachable', reason: 'live' });
      expect(card.hidden).toBe(true);
      await tick();
      // Any other sync says what it does, as before.
      heard.progress({ phase: 'looking', device: 'laptop', reason: 'manual' });
      expect(card.hidden).toBe(false);
      // The file is here: the player is a player again.
      heard['media-ready'](file);
      expect(video.classList.contains('is-coming')).toBe(false);
      expect(word()).toBe(null);
      // A refusal (the lock shut, say) is no list: nothing is drawn of it, nothing breaks.
      list = { ok: false, error: 'locked' };
      heard.progress({ phase: 'idle', left: 0 });
      await tick();
      expect(asked).toBe(4);
      expect(video.classList.contains('is-coming')).toBe(false);
    } finally {
      delete window.nebula;
      root.remove();
      setComingVideos([]);
      comingVideoWords((pct) => `Video syncing · ${pct} %`);
      document.querySelector('.sync-screen')?.remove();
      document.getElementById('sync-card')?.remove();
    }
  });

  // 1.0.4, the owner, 2026-11-15: "tailscale yapalim kücükleri".
  it('takes a newer version of the open note in where the reader is, and never over a word typed since the pull looked', async () => {
    let ask = null;
    window.nebula = {
      sync: { on() {}, onAsk(fn) { ask = fn; }, keepOut: async () => {}, state: async () => ({ enabled: true }), coming: async () => [{ id: 'a', name: 'att-m1abc-0a1b2c3d.pdf', got: 250, size: 1000 }] },
    };
    const store = fakeStore([{ id: 'a', updatedAt: 5, content: 'old' }, { id: 'b', updatedAt: 1, content: 'other' }]);
    store.activeId = 'a';
    const did = [];
    // What is typed goes to the disk (waited for), then — a key pressed while the disk wrote — into the store at once.
    let typed = null;
    const saveCurrent = async () => { await tick(); did.push('write'); };
    const flushTyped = () => {
      did.push('typed');
      if (typed) { store.notes[0] = { ...store.notes[0], ...typed }; typed = null; }
    };
    const folders = { folders: [], save: async () => { await tick(); did.push('folders'); } };
    const came = (id, updatedAt, expect) => ({ id, expect, text: text({ id, updatedAt, content: `new ${id}` }) });
    const root = document.createElement('div');
    root.innerHTML = makeAttachBlock('nebula-media://note/a/att-m1abc-0a1b2c3d.pdf', 'report.pdf', 9_000_000).outerHTML;
    document.body.append(root);
    refreshAttachBlocks(root);
    try {
      initTailnetSync({
        store, folders, projects: {}, saveCurrent, flushTyped,
        renderList() { did.push('list'); },
        openNote(id, o) { did.push(['open', id, o]); },
      });
      await tick();
      // The card of a big file still coming says so in the window's words, by its kind.
      expect(root.querySelector('.file-coming__text').textContent).toBe('File syncing · 25 %');
      // The open note came in newer: what is typed is written first, then it is shown in place — not opened
      // again — and at once: before anything else is waited for (the folders here), so no key comes between.
      expect(await ask('apply', { notes: [came('a', 9, 5)], folders: [{ id: 'f1', name: 'Work' }] })).toEqual({ applied: ['a'], dropped: [], skipped: [], lists: true });
      expect(did).toEqual(['write', 'typed', ['open', 'a', { inPlace: true }], 'folders', 'list', 'write']);
      expect(store.notes[0].content).toBe('new a');
      expect(folders.folders.map((f) => f.name)).toEqual(['Work']);
      // A key pressed after "prepare" — even while the disk wrote, a moment before the notes came: the note is
      // left alone, nothing is shown anew.
      did.length = 0;
      typed = { updatedAt: 12, content: 'typed here' };
      expect(await ask('apply', { notes: [came('a', 15, 9)] })).toEqual({ applied: [], dropped: [], skipped: ['a'], lists: true });
      expect(did).toEqual(['write', 'typed']);
      expect(store.notes[0].content).toBe('typed here');
      // Another note came: the list is drawn, the open note is not touched.
      did.length = 0;
      expect((await ask('apply', { notes: [came('b', 3, 1)] })).applied).toEqual(['b']);
      expect(did).toEqual(['write', 'typed', 'list', 'write']);
      // The open note deleted on the other computer: the list's first is opened, as a note is.
      did.length = 0;
      expect((await ask('apply', { drops: [{ id: 'a', expect: 12 }] })).dropped).toEqual(['a']);
      expect(did).toEqual(['write', 'typed', ['open', 'a', undefined], 'list', 'write']);
      // "prepare" writes what is typed and names what stays here; anything else is refused.
      expect(await ask('prepare')).toEqual({ keepOut: [] });
      await expect(ask('else')).rejects.toThrow();
    } finally {
      delete window.nebula;
      root.remove();
      setComingVideos([]);
      comingVideoWords((pct) => `Video syncing · ${pct} %`);
      document.querySelector('.sync-screen')?.remove();
      document.getElementById('sync-card')?.remove();
    }
  });

  it('says it in every language, with the per cent in its place', () => {
    expect(t('Video syncing · 62 %', 'de')).toBe('Video wird synchronisiert · 62 %');
    expect(t('Video syncing · 62 %', 'pl')).toBe('Synchronizacja wideo · 62 %');
    expect(t('Video syncing · 62 %', 'tr')).toBe('Video eşitleniyor · %62');
    expect(t('Video syncing · 0 %', 'en')).toBe('Video syncing · 0 %');
  });
});
