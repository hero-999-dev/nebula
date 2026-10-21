/**
 * Settings (0.9.4): what a new note starts with and what is put away — the
 * store (settings.js), the choices the sheet offers (settings-panel.js), the
 * dock with the AI panel put away, and the font menu's pins (toolbar.js).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, cleanSettings, readSettings, writeSettings, newNoteDefaults } from '../src/js/settings.js';
import { fontChoices } from '../src/js/settings-panel.js';
import { FONTS, FONT_SIZES, BASE_FONT_SIZE, fontRows, togglePinned, readPinnedFonts, readCustomFonts, lastFontOf, readLastFont } from '../src/js/toolbar.js';
import { buildMenus, commandsOf, initAppMenu } from '../src/js/app-menu.js';
import { initDock } from '../src/js/dock.js';
import { STRINGS, t } from '../src/js/i18n.js';
import { on } from '../src/js/bus.js';

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

describe('the settings store', () => {
  it('is the app as it always was until something is chosen', () => {
    expect(readSettings()).toEqual({ font: null, size: null, page: 'nw', hideAi: false, hideHoles: false, spell: ['en', 'de', 'pl', 'tr'] });
    expect(readSettings()).toEqual({ ...DEFAULT_SETTINGS });
    expect(newNoteDefaults()).toEqual({ font: null, page: null });
  });

  it('keeps only what the app can act on', () => {
    expect(cleanSettings(null)).toEqual({ ...DEFAULT_SETTINGS });
    expect(cleanSettings('a string')).toEqual({ ...DEFAULT_SETTINGS });
    expect(cleanSettings({ font: 'Arial, Helvetica, sans-serif', size: '18', page: 'a4', hideAi: true, hideHoles: true }))
      .toEqual({ font: 'Arial, Helvetica, sans-serif', size: 18, page: 'a4', hideAi: true, hideHoles: true, spell: ['en', 'de', 'pl', 'tr'] });
    // A font that could end a CSS value, a size no line is written in, a page there is none of, a yes that is not one.
    expect(cleanSettings({ font: 'Evil; } body { display: none', size: 2, page: 'a9', hideAi: 'yes', hideHoles: 1 }))
      .toEqual({ font: 'Evil body display: none', size: null, page: 'nw', hideAi: false, hideHoles: false, spell: ['en', 'de', 'pl', 'tr'] });
    expect(cleanSettings({ font: '   ', size: 'big' })).toMatchObject({ font: null, size: null });
    expect(cleanSettings({ size: 401 }).size).toBeNull();
    expect(cleanSettings({ size: 400 }).size).toBe(400);
    expect(cleanSettings({ size: 6 }).size).toBe(6);
  });

  it('checks spelling in every language until one is taken off (1.0.0)', () => {
    expect(cleanSettings({}).spell).toEqual(['en', 'de', 'pl', 'tr']);
    expect(cleanSettings({ spell: ['tr', 'en', 'tr', 'xx', 3] }).spell).toEqual(['en', 'tr']);
    expect(cleanSettings({ spell: [] }).spell).toEqual([]);
    expect(cleanSettings({ spell: 'en' }).spell).toEqual(['en', 'de', 'pl', 'tr']);
    expect(writeSettings({ spell: ['pl'] }).spell).toEqual(['pl']);
    expect(readSettings().spell).toEqual(['pl']);
  });

  it('writes a change, keeps the rest, and says so', () => {
    const heard = [];
    const off = on('settings-changed', ({ settings }) => heard.push(settings));
    writeSettings({ page: 'a5' });
    const now = writeSettings({ hideAi: true });
    off();
    expect(now).toEqual({ font: null, size: null, page: 'a5', hideAi: true, hideHoles: false, spell: ['en', 'de', 'pl', 'tr'] });
    expect(readSettings()).toEqual(now);
    expect(heard).toHaveLength(2);
    expect(heard[1]).toEqual(now);
  });

  it('reads a damaged setting as none', () => {
    localStorage.setItem('nebula:settings', '{not json');
    expect(readSettings()).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('gives a new note its font, its size and its page — and nothing where the app’s own is wanted', () => {
    expect(newNoteDefaults({ font: '"Segoe UI", system-ui, sans-serif' })).toEqual({ font: { family: '"Segoe UI", system-ui, sans-serif' }, page: null });
    expect(newNoteDefaults({ size: 18 })).toEqual({ font: { size: 18 }, page: null });
    expect(newNoteDefaults({ font: 'Verdana, Geneva, sans-serif', size: 12, page: 'a4' })).toEqual({ font: { family: 'Verdana, Geneva, sans-serif', size: 12 }, page: 'a4' });
    expect(newNoteDefaults({ page: 'nw' })).toEqual({ font: null, page: null });
  });
});

describe('the fonts Settings offers a new note', () => {
  it('are the app’s own — the serif standing for "none" — then the ones added', () => {
    const rows = fontChoices(['Noto Serif', 'arial']);
    // The app's own says what it is — and the serif is "Serif", no longer "Serif (default)":
    // what a new note is written in is what Settings says.
    expect(rows[0]).toEqual(['', 'Serif']);      // 1.0.0: the font's name, no "Nebula’s own"
    expect(FONTS[0][0]).toBe('Serif');
    expect(rows.slice(1, FONTS.length).map(([, label]) => label)).toEqual(FONTS.slice(1).map(([label]) => label));
    expect(rows.at(-1)).toEqual(['"Noto Serif", serif', 'Noto Serif']);
    expect(rows).toHaveLength(FONTS.length + 1);          // "arial" is the app's Arial already
  });

  it('still show a font chosen earlier and since taken off the list', () => {
    const rows = fontChoices([], '"Candara", serif');
    expect(rows.at(-1)).toEqual(['"Candara", serif', 'Candara']);
    expect(fontChoices([], 'Arial, Helvetica, sans-serif')).toHaveLength(FONTS.length);
  });

  it('come with the sizes of the size box', () => {
    expect(FONT_SIZES).toContain(16);
    expect([...FONT_SIZES].sort((a, b) => a - b)).toEqual(FONT_SIZES);
  });

  it('"Nebula’s own" says what it is: the size the stylesheet writes a note in', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../src/css/app.css'), 'utf8');
    const editor = /\n\.editor \{[^}]*\}/.exec(css)[0];
    expect(Number(/font-size:\s*(\d+)px/.exec(editor)[1])).toBe(BASE_FONT_SIZE);
    expect(FONT_SIZES).toContain(BASE_FONT_SIZE);
    for (const [lang, said] of [['de', 'Standard von Nebula (14)'], ['pl', 'Domyślne w Nebula (14)'], ['tr', 'Nebula varsayılanı (14)']]) {
      expect(t(`Nebula’s own (${BASE_FONT_SIZE})`, lang)).toBe(said);
    }
    expect(t('Nebula’s own (Serif)', 'tr')).toBe('Nebula varsayılanı (Serif)');
  });
});

describe('a pin beside each font', () => {
  it('puts the pinned ones first, in the order they were pinned', () => {
    const rows = fontRows('', { pinned: ['Consolas', 'arial'], custom: ['Noto Serif'] }).own;
    expect(rows.slice(0, 3).map((r) => [r.label, r.pinned])).toEqual([['Consolas', true], ['Arial', true], ['Serif', false]]);
    expect(rows).toHaveLength(FONTS.length + 1);
    expect(rows.filter((r) => r.pinned)).toHaveLength(2);
    // The rest keep their order.
    expect(rows.slice(2).map((r) => r.label)).toEqual([...FONTS.map(([label]) => label).filter((l) => !['Consolas', 'Arial'].includes(l)), 'Noto Serif']);
  });

  it('pins a font that was added, and a search keeps the pinned first', () => {
    const rows = fontRows('s', { pinned: ['Noto Serif'], custom: ['Noto Serif'] }).own;
    expect(rows[0]).toEqual({ label: 'Noto Serif', stack: '"Noto Serif", serif', custom: true, pinned: true });
    expect(rows.every((r) => /s/i.test(r.label) || /s/i.test(r.stack))).toBe(true);
  });

  it('a pin on a font that is not in the list pins nothing', () => {
    const rows = fontRows('', { pinned: ['Gone Sans'] }).own;
    expect(rows.map((r) => r.label)).toEqual(FONTS.map(([label]) => label));
    expect(rows.some((r) => r.pinned)).toBe(false);
  });

  it('a press pins, the next unpins — whatever the case of the name', () => {
    expect(togglePinned([], 'Arial')).toEqual(['Arial']);
    expect(togglePinned(['Arial'], 'Consolas')).toEqual(['Arial', 'Consolas']);
    expect(togglePinned(['Arial', 'Consolas'], 'arial')).toEqual(['Consolas']);
    expect(togglePinned(['Arial'], '')).toEqual(['Arial']);
    const before = ['Arial'];
    togglePinned(before, 'Consolas');
    expect(before).toEqual(['Arial']);
  });

  it('is kept on this computer, a damaged list read as none', () => {
    expect(readPinnedFonts()).toEqual([]);
    localStorage.setItem('nebula:fonts-pinned', JSON.stringify(['Arial', 7, null, 'Consolas']));
    expect(readPinnedFonts()).toEqual(['Arial', 'Consolas']);
    localStorage.setItem('nebula:fonts-pinned', '{');
    expect(readPinnedFonts()).toEqual([]);
    expect(readCustomFonts()).toEqual([]);
  });
});

describe('the font used last', () => {
  it('is its name and the stack it is written with — the app’s own name for a font it has', () => {
    expect(lastFontOf('"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif')).toEqual({ label: 'Instrument Sans', stack: '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif' });
    expect(lastFontOf('Consolas, "Cascadia Mono", monospace')).toEqual({ label: 'Consolas', stack: 'Consolas, "Cascadia Mono", monospace' });
    expect(lastFontOf(FONTS[0][1]).label).toBe('Serif');
    expect(lastFontOf('"Inter", "Segoe UI", system-ui, sans-serif').label).toBe('Sans');
  });

  it('is nothing where no font is named, and never one that could end a style', () => {
    for (const none of ['', '   ', null, undefined, ';;;']) expect(lastFontOf(none)).toBeNull();
    expect(lastFontOf('Arial; } body { display: none').stack).toBe('Arial body display: none');
  });

  it('is kept on this computer, a damaged one read as none', () => {
    expect(readLastFont()).toBeNull();
    localStorage.setItem('nebula:font-last', JSON.stringify({ label: 'anything', stack: 'Georgia, serif' }));
    expect(readLastFont()).toEqual({ label: 'Georgia', stack: 'Georgia, serif' });
    localStorage.setItem('nebula:font-last', '{');
    expect(readLastFont()).toBeNull();
  });
});

describe('Settings in the menus', () => {
  const ctx = (extra = {}) => ({ actions: {}, history: {}, find: {}, palette: {}, shortcuts: {}, ...extra });

  it('stands after Help and opens the sheet at a press: no list under it', () => {
    const open = vi.fn();
    const menus = buildMenus(ctx({ settings: { open } }));
    expect(menus.map((m) => m.title).slice(-2)).toEqual(['Help', 'Settings']);
    const settings = menus.at(-1);
    expect(settings.direct).toBe(true);
    expect(settings.items).toHaveLength(1);
    settings.items[0].run();
    expect(open).toHaveBeenCalledTimes(1);
    expect(commandsOf(menus).some((c) => c.id === 'settings.open')).toBe(true);
  });

  it('draws it as a title that runs, with no menu of its own', () => {
    document.body.innerHTML = '<nav id="app-menu"></nav>';
    const open = vi.fn();
    initAppMenu(ctx({ settings: { open } }));
    const titles = [...document.querySelectorAll('#app-menu .am-title')];
    expect(titles.map((b) => b.textContent)).toEqual(['File', 'Edit', 'View', 'Window', 'Help', 'Settings']);
    const last = titles.at(-1);
    expect(last.dataset.cmd).toBe('settings.open');
    expect(last.parentElement.querySelector('.am-menu')).toBeNull();
    // With another menu open, pressing it shuts that one and opens the sheet.
    titles[0].click();
    expect(document.querySelector('#app-menu .am-menu:not([hidden])')).not.toBeNull();
    last.click();
    expect(document.querySelector('#app-menu .am-menu:not([hidden])')).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('leaves "Toggle AI panel" out while the AI panel is put away — of the menu and of the palette', () => {
    let shown = true;
    document.body.innerHTML = '<nav id="app-menu"></nav>';
    const menu = initAppMenu(ctx({ aiShown: () => shown }));
    const view = [...document.querySelectorAll('#app-menu .am-title')].find((b) => b.textContent === 'View');
    const item = document.querySelector('[data-cmd="view.ai"]');
    view.click();
    expect(item.hidden).toBe(false);
    expect(menu.commands.some((c) => c.id === 'view.ai')).toBe(true);
    view.click();
    shown = false;
    view.click();
    expect(item.hidden).toBe(true);
    expect(menu.commands.some((c) => c.id === 'view.ai')).toBe(false);
  });

  it('offers "Lock Nebula" only where a lock is set', () => {
    let set = false;
    const lockNow = vi.fn();
    const menus = buildMenus(ctx({ lockSet: () => set, lockNow }));
    expect(commandsOf(menus).some((c) => c.id === 'file.lock')).toBe(false);
    set = true;
    const cmd = commandsOf(menus).find((c) => c.id === 'file.lock');
    expect(cmd.label).toBe('Lock Nebula');
    cmd.run();
    expect(lockNow).toHaveBeenCalledTimes(1);
  });
});

describe('the dock with the AI panel put away', () => {
  const page = () => {
    document.body.innerHTML = '<div id="edit-shell" class="edit-shell bar-top"></div><aside id="ai-panel" hidden></aside><button id="ai-close"></button>'
      + '<div id="pad">' + ['top', 'right', 'ai', 'bottom', 'left', 'hide'].map((k) => `<button data-pad="${k}"></button>`).join('') + '</div>';
  };
  const ai = () => document.getElementById('ai-panel');
  const aiButton = () => document.querySelector('[data-pad="ai"]');

  it('opens and shuts the panel from its button until it is put away', () => {
    page();
    initDock();
    aiButton().click();
    expect(ai().hidden).toBe(false);
    writeSettings({ hideAi: true });
    expect(ai().hidden).toBe(true);
    expect(aiButton().hidden).toBe(true);
    expect(document.getElementById('pad').classList.contains('pad--no-ai')).toBe(true);
    // Nothing opens it now: the menu's "Toggle AI panel" presses this very button.
    aiButton().click();
    expect(ai().hidden).toBe(true);
    expect(JSON.parse(localStorage.getItem('nebula:layout')).ai).toBe(false);
  });

  it('comes back shut, and opens at a press again', () => {
    page();
    initDock();
    aiButton().click();
    writeSettings({ hideAi: true });
    writeSettings({ hideAi: false });
    expect(aiButton().hidden).toBe(false);
    expect(document.getElementById('pad').classList.contains('pad--no-ai')).toBe(false);
    expect(ai().hidden).toBe(true);
    aiButton().click();
    expect(ai().hidden).toBe(false);
  });

  it('starts put away where the setting says so, whatever the layout remembered', () => {
    localStorage.setItem('nebula:layout', JSON.stringify({ bar: 'right', barHidden: false, ai: true }));
    localStorage.setItem('nebula:settings', JSON.stringify({ hideAi: true }));
    page();
    initDock();
    expect(ai().hidden).toBe(true);
    expect(aiButton().hidden).toBe(true);
    expect(document.getElementById('edit-shell').classList.contains('bar-right')).toBe(true);
  });
});

describe('the new words, in every language', () => {
  const WORDS = [
    'Settings', 'New notes', 'Text size', 'Page', 'Show and hide', 'Hide the AI panel', 'Hide the black holes',
    'Lock on opening', 'Lock Nebula', 'Lock Nebula now', 'Nebula opens without asking.', 'Set a lock', 'Set the lock', 'Also open with a passkey',
    'Nebula asks for its PIN when it opens.', 'Nebula asks for its PIN — or your passkey — when it opens.', 'Nebula asks for your passkey when it opens.',
    'Turn the lock off', 'Turn the lock on', 'Remove lock', 'Add a passkey', 'Remove the passkey', 'Log in with passkey', 'Use the passkey',
    'The lock is on', 'The lock is off', 'Lock removed', 'Passkey added', 'Passkey removed', 'Nebula is locked', 'That key does not open Nebula.', 'Back',
    'Pin to the top', 'Unpin', 'Last used font', 'Add to the list', 'That font is not on this computer, so it cannot be added', 'Could not save: Nebula stays open', 'The lock was removed — set a new one in Settings',
    'Put a theme on it', 'Nebula’s own', 'Border', 'Moon', 'Moon’s shade', 'Star', 'The logo could not be changed', 'The logo is worn in the desktop app.',
    'Bring back the ready profiles', 'Set a PIN', 'Delete the black hole', 'Black hole deleted',
    'It is worn by this window, the taskbar and the shortcuts that start Nebula — on the desktop, in the Start menu, pinned to the taskbar. A program file itself keeps the icon it was built with: a shortcut to it wears the logo.',
    'Add a logo theme', 'Name of the logo theme:', 'Give the logo theme a name', 'That name is taken — give it another', 'Double-click to rename',
    'Put a shortcut on the desktop', 'Another shortcut of that name is on the desktop', 'The shortcut could not be made', 'A shortcut with the logo is on the desktop', 'The shortcut on the desktop wears the logo',
    'Notes in a black hole are kept encrypted. Opening it asks for its 6-digit PIN — or, if you add one, for a passkey: your fingerprint, face or the computer’s own PIN.',
    'A new note starts with these. The notes you have keep their own.',
    'Its button and its tabs are put away. Your sign-ins stay as they are.',
    'Their section and their button leave the note list; open ones are locked first. Nothing is deleted, and they are back when this is turned off.',
    'The lock keeps the app shut on this computer. It does not encrypt the notes’ files — a black hole does that.',
    'A 6-digit PIN locks Nebula: it is asked for each time the app opens.',
    'The lock is turned off: Nebula opens without asking. Its PIN is kept.',
    'Nebula will open without asking. The lock is kept, to be turned on again.',
    'Type the PIN, then confirm with the passkey. After that, either one opens Nebula.',
    'The lock is deleted: its PIN, its passkey and its recovery key are forgotten.',
    'Write this key down and keep it somewhere safe. It opens Nebula when the PIN is forgotten. It is shown only now.',
    'Type the recovery key that was shown when the lock was set. It opens Nebula and removes the lock — set a new one in Settings.',
  ];

  it('are translated into Deutsch, Polski and Türkçe', () => {
    for (const word of WORDS) {
      expect(STRINGS[word], word).toHaveLength(3);
      for (const lang of ['de', 'pl', 'tr']) expect(t(word, lang), `${word} (${lang})`).not.toBe(word);
    }
  });

  it('say what is done to a black hole, with its name in it', () => {
    for (const lang of ['de', 'pl', 'tr']) {
      const out = t('The note leaves “Safe” and is kept as an ordinary note again, not encrypted.', lang);
      const gone = t('“Safe” and every note in it are deleted for good. Nothing brings them back.', lang);
      for (const said of [out, gone]) {
        expect(said).toContain('Safe');
        expect(said).not.toMatch(/The note leaves|deleted for good/);
      }
    }
  });

  it('say "off" and "remove" in two different words, in every language', () => {
    for (const lang of ['de', 'pl', 'tr']) {
      expect(t('Turn the lock off', lang)).not.toBe(t('Remove lock', lang));
      expect(t('Turn the lock off', lang)).not.toBe(t('Turn the lock on', lang));
      expect(t('The lock is off', lang)).not.toBe(t('Lock removed', lang));
    }
  });

  it('never decline the app’s name', () => {
    for (const word of WORDS) {
      for (const said of STRINGS[word]) expect(said, word).not.toMatch(/Nebul(?!a(?![a-zğışöüç]))/);
    }
  });
});
