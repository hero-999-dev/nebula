// @vitest-environment node
/**
 * Closing while a big file crosses (Tailscale sync, 1.0.4; the owner,
 * 2026-11-15: "büyük aktarım sürerken kapatmadan önce soru"): the question
 * electron/sync-close.js makes of what sync.js says is moving. That sync.js
 * says it only while a file really crosses is in tests/sync-server.test.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { closeQuestion, STAY, CLOSE } from '../electron/sync-close.js';
import { WORDS } from '../electron/dialog-words.js';

const MB = 1048576;
const coming = { name: 'film.mp4', got: 52.5 * MB, size: 210 * MB, left: 2 };

describe('the question before Nebula closes', () => {
  it('is not asked when nothing crosses', () => {
    expect(closeQuestion(null)).toBeNull();
    expect(closeQuestion(undefined, 'tr')).toBeNull();
    expect(closeQuestion({ coming: null, going: 0 }, 'de')).toBeNull();
    expect(closeQuestion({}, 'pl')).toBeNull();
  });

  it('names the file coming here and how much of it is here, and says nothing is lost', () => {
    const q = closeQuestion({ coming, going: 0 }, 'en');
    expect(q.message).toBe('A big file is still being synced.');
    expect(q.detail).toBe('film.mp4: 52.5 of 210.0 MB are here. If you close Nebula now, the rest comes the next time Nebula is open on both computers.');
    expect(q.type).toBe('question');
  });

  it('says so when another device is taking one from here, and both when both', () => {
    const going = closeQuestion({ coming: null, going: 2 }, 'en');
    expect(going.detail).toBe('Another of your devices is still taking a big file from this computer. If you close Nebula now, it carries on the next time Nebula is open on both.');
    const both = closeQuestion({ coming, going: 1 }, 'en');
    expect(both.detail.split('\n\n')).toEqual([closeQuestion({ coming, going: 0 }, 'en').detail, going.detail]);
  });

  it('keeps Nebula open by default: the first button, Enter, Esc and the dialog’s ×', () => {
    const q = closeQuestion({ coming, going: 0 }, 'en');
    expect(q.buttons).toEqual(['Keep Nebula open', 'Close anyway']);
    expect([STAY, CLOSE]).toEqual([0, 1]);
    expect(q.buttons[STAY]).toBe('Keep Nebula open');
    expect(q.buttons[CLOSE]).toBe('Close anyway');
    expect(q.defaultId).toBe(STAY);
    expect(q.cancelId).toBe(STAY);
    expect(q.noLink).toBe(true);
  });

  it('never shows a number that is none: a size or a share nobody knows is 0.0', () => {
    const q = closeQuestion({ coming: { name: 'x.mp4', got: undefined, size: -5 }, going: 0 }, 'en');
    expect(q.detail).toMatch(/^x\.mp4: 0\.0 of 0\.0 MB are here\./);
    expect(closeQuestion({ coming: { got: 1, size: 2 }, going: 0 }, 'en').detail).toMatch(/^: 0\.0 of 0\.0 MB/);
  });

  it('asks in the app’s language, with the file and the numbers in their places and Nebula’s name as it is', () => {
    const english = closeQuestion({ coming, going: 1 }, 'en');
    const seen = new Set([JSON.stringify(english)]);
    for (const lang of ['de', 'pl', 'tr']) {
      const q = closeQuestion({ coming, going: 1 }, lang);
      seen.add(JSON.stringify(q));
      expect(q.buttons).toHaveLength(2);
      expect(q.buttons[STAY]).not.toBe(english.buttons[STAY]);
      expect(q.buttons[CLOSE]).not.toBe(english.buttons[CLOSE]);
      expect(q.message).not.toBe(english.message);
      expect(q.detail).toContain('film.mp4');
      expect(q.detail).toContain('52.5');
      expect(q.detail).toContain('210.0');
      expect(q.detail).not.toMatch(/[{}]/);
      expect(q.detail.split('\n\n')).toHaveLength(2);
      for (const said of [q.message, q.detail, ...q.buttons]) expect(said).not.toMatch(/Nebula[a-zęąıİ’']/);
    }
    expect(seen.size).toBe(4);
    // A language nobody wrote keeps the English.
    expect(closeQuestion({ coming, going: 1 }, 'fr')).toEqual(english);
    // Every word of it stands in the table the other dialogs use.
    for (const key of [english.message, ...english.buttons]) expect(WORDS[key], key).toHaveLength(3);
  });

  it('is asked by the window’s closing after the save and before the window hides, and staying takes the closing back', () => {
    const main = fs.readFileSync('electron/main.js', 'utf8');
    const at = main.indexOf('closeQuestion(sync?.moving()');
    expect(at).toBeGreaterThan(0);
    const before = main.slice(0, at);
    const after = main.slice(at, at + 1000);
    expect(before.lastIndexOf('requestRendererSave(win)')).toBeGreaterThan(before.lastIndexOf("win.on('close'"));
    expect(after).toMatch(/response !== CLOSE\) \{\s*quitRequested = false;\s*closing = false;\s*return;/);
    expect(after.indexOf('win.hide()')).toBeGreaterThan(after.indexOf('return;'));
  });
});
