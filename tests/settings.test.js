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
import { FONTS, FONT_SIZES, BASE_FONT_SIZE, fontRows, fontLabelFor, firstFamily, byFontName, togglePinned, readPinnedFonts, readCustomFonts, lastFontOf, readLastFont } from '../src/js/toolbar.js';
import { buildMenus, commandsOf, initAppMenu } from '../src/js/app-menu.js';
import { initDock } from '../src/js/dock.js';
import { STRINGS, t } from '../src/js/i18n.js';
import { on } from '../src/js/bus.js';
import { DESIGNS, DESIGN_NAMES, DESIGN_FACES, designOfFace, designFacePlace, designStack } from '../src/js/design.js';

/** The designs' faces as the font lists begin with them, one a design (the owner's picks, 1.0.4): [font, its design's name]. */
const FACES = [['Serif', 'Nebula'], ['Fondamento', 'Medieval'], ['VT323', 'Pixel'], ['Oxanium', 'Neon'],
  ['Patrick Hand', 'Blueprint'], ['Courgette', 'Ink'], ['Marcellus', 'Art Deco'], ['Bodoni Moda', 'Clockwork']];
/** Every other font of the app, by its name. */
const REST = FONTS.map(([label]) => label).filter((l) => !FACES.some(([face]) => face === l)).sort(byFontName);
/** The menu's own fonts with nothing pinned: those faces, then the others by their names. */
const UNPINNED = [...FACES.map(([face]) => face), ...REST];

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

describe('the settings store', () => {
  it('is the app as it always was until something is chosen', () => {
    expect(readSettings()).toEqual({ font: null, size: null, page: 'nw', hideAi: false, hideHoles: false, spell: ['en', 'de', 'pl', 'tr'], backdrop: 0.3, smoothScreen: 'off', alarmSound: 'chime', focusSound: 'chime', breakSound: 'bell' });
    expect(readSettings()).toEqual({ ...DEFAULT_SETTINGS });
    expect(newNoteDefaults()).toEqual({ font: null, page: null });
  });

  it('keeps only what the app can act on', () => {
    expect(cleanSettings(null)).toEqual({ ...DEFAULT_SETTINGS });
    expect(cleanSettings('a string')).toEqual({ ...DEFAULT_SETTINGS });
    expect(cleanSettings({ font: 'Arial, Helvetica, sans-serif', size: '18', page: 'a4', hideAi: true, hideHoles: true }))
      .toEqual({ font: 'Arial, Helvetica, sans-serif', size: 18, page: 'a4', hideAi: true, hideHoles: true, spell: ['en', 'de', 'pl', 'tr'], backdrop: 0.3, smoothScreen: 'off', alarmSound: 'chime', focusSound: 'chime', breakSound: 'bell' });
    // A font that could end a CSS value, a size no line is written in, a page there is none of, a yes that is not one.
    expect(cleanSettings({ font: 'Evil; } body { display: none', size: 2, page: 'a9', hideAi: 'yes', hideHoles: 1 }))
      .toEqual({ font: 'Evil body display: none', size: null, page: 'nw', hideAi: false, hideHoles: false, spell: ['en', 'de', 'pl', 'tr'], backdrop: 0.3, smoothScreen: 'off', alarmSound: 'chime', focusSound: 'chime', breakSound: 'bell' });
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

  it('keeps an alarm sound it knows, the wind chimes otherwise (1.0.3)', () => {
    expect(cleanSettings({}).alarmSound).toBe('chime');
    for (const id of ['off', 'chime', 'bell', 'own', 'own:k3j9x2a1', 'system:Alarm01.wav']) expect(cleanSettings({ alarmSound: id }).alarmSound).toBe(id);
    for (const id of ['system:../x.wav', 'system:', 'loud', 3, 'own:', 'own:AB', 'own:../x', 'system:a\\b.wav']) expect(cleanSettings({ alarmSound: id }).alarmSound).toBe('chime');
  });

  it('does not soften the picture until asked (1.0.3: "never olsun doğal ayarı")', () => {
    expect(cleanSettings({}).smoothScreen).toBe('off');
    for (const v of ['auto', 'on', 'off']) expect(cleanSettings({ smoothScreen: v }).smoothScreen).toBe(v);
    for (const v of ['yes', true, 1, 'ON', null]) expect(cleanSettings({ smoothScreen: v }).smoothScreen).toBe('off');
  });

  it('writes a change, keeps the rest, and says so', () => {
    const heard = [];
    const off = on('settings-changed', ({ settings }) => heard.push(settings));
    writeSettings({ page: 'a5' });
    const now = writeSettings({ hideAi: true });
    off();
    expect(now).toEqual({ font: null, size: null, page: 'a5', hideAi: true, hideHoles: false, spell: ['en', 'de', 'pl', 'tr'], backdrop: 0.3, smoothScreen: 'off', alarmSound: 'chime', focusSound: 'chime', breakSound: 'bell' });
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
  it('are the designs’ faces first, then every other one by its name, the ones added among them', () => {
    const rows = fontChoices(['Noto Serif', 'arial']);
    // The Serif is a font as the other designs' faces are: a new note given it is in it under every design.
    expect(rows[0]).toEqual([FONTS[0][1], 'Serif (Nebula)']);
    expect(newNoteDefaults({ font: rows[0][0] || null }).font).toEqual({ family: FONTS[0][1] });
    // No row stands for "no font": that is what a vault that chose nothing has, and what the button under the designs gives back.
    expect(rows.every(([stack]) => stack)).toBe(true);
    // 1.0.4: the designs' faces stand over every font, in the designs' order, each with its design's name after it.
    const fonts = rows;
    expect(fonts.slice(0, FACES.length).map(([, label]) => label)).toEqual(FACES.map(([face, design]) => `${face} (${design})`));
    expect(fonts[1][0]).toBe('"Fondamento", "Palatino Linotype", Georgia, serif');
    // The owner: "fontlar alfabeye göre sıralansın".
    const rest = fonts.slice(FACES.length).map(([, label]) => label);
    expect(rest).toEqual([...REST, 'Noto Serif'].sort(byFontName));
    expect(rest.slice(0, 5)).toEqual(['Almendra', 'Architects Daughter', 'Arial', 'Calibri', 'Cascadia Code']);
    expect(rest[rest.indexOf('Noto Serif') - 1]).toBe('MedievalSharp');
    expect(rows.find(([, label]) => label === 'Noto Serif')).toEqual(['"Noto Serif", serif', 'Noto Serif']);
    expect(rows).toHaveLength(FONTS.length + 1);          // "arial" is the app's Arial already; Noto Serif is the one more
    expect(new Set(rows.map(([stack]) => stack)).size).toBe(rows.length);
  });

  // The owner: "ben sadece Nebula temasının notu serif olsun istedim, diğer designlar gibi" — and the four
  // layers as they were. Then, to "serif niye font yok demek?": the Serif is a font like Fondamento, with no
  // row added for "no font" — that comes back by the button under the designs.
  it('hold the Serif as Nebula’s face: the design’s own stack, and a font of a note’s own like any other', () => {
    expect(FONTS[0]).toEqual(['Serif', designStack('nebula')]);
    expect(fs.readFileSync(path.resolve('src/css/tokens.css'), 'utf8')).toContain(`--serif: ${FONTS[0][1]};`);
    // The bar and the lists name it by its label, never by the first face of its stack.
    expect(fontLabelFor(FONTS[0][1])).toBe('Serif');
    expect(lastFontOf(FONTS[0][1])).toEqual({ label: 'Serif', stack: FONTS[0][1] });
    // Words given the Serif before 1.0.4 carry the shorter stack; they are still named Serif.
    expect(fontLabelFor('"Charter", "Iowan Old Style", Georgia, serif')).toBe('Serif');
    // Picked in the Font menu it is the note's writing font, under every design; no list has a row of "no font".
    const toolbar = fs.readFileSync(path.resolve('src/js/toolbar.js'), 'utf8');
    expect(toolbar).toContain('setNoteFont?.({ family: stack || null });');
    expect(toolbar).not.toContain('stack === FONTS[0][1] ? null');
    expect(toolbar).not.toContain('DESIGN_FONT');
    expect(fontChoices().filter(([stack]) => !stack)).toEqual([]);
    expect(fontChoices().filter(([stack]) => stack === FONTS[0][1])).toEqual([[FONTS[0][1], 'Serif (Nebula)']]);
    // Selected words given it are in it under every design; under Nebula the browser already reads the Serif
    // there and would write nothing, so it is written under a name of its own first.
    expect(toolbar).toContain("document.execCommand('fontName', false, serif ? SERIF_NAME : stack);");
    // Settings keeps it as chosen, and with nothing chosen shows the row of the face the design writes in.
    const panel = fs.readFileSync(path.resolve('src/js/settings-panel.js'), 'utf8');
    expect(panel).not.toContain('font === FONTS[0][1]');
    expect(panel).toContain("font.value = s.font ?? rows.find(([stack]) => firstFamily(stack).toLowerCase() === face)?.[0] ?? '';");
    expect(panel).toContain("on('design-changed', paintFont);");
    for (const id of DESIGNS) {
      const face = firstFamily(designStack(id)).toLowerCase();
      expect(fontChoices().filter(([stack]) => firstFamily(stack).toLowerCase() === face), id).toHaveLength(1);
    }
  });

  // The known fault of the 03:36 build: the bar's font name stayed what the last caret had read.
  it('have the bar say the note’s font with no caret in the note: on opening it, and when the design changes', () => {
    const toolbar = fs.readFileSync(path.resolve('src/js/toolbar.js'), 'utf8');
    expect(toolbar).toContain("on('design-changed', syncNoteFont);");
    expect(toolbar).toContain("fontName.textContent = shownFont(font?.family || cs.fontFamily).label || 'Font';");
    expect(toolbar).toContain('return { actions: ACTIONS, syncState, syncNoteFont, miniBarAt };');
    // A caret left in the note's root by a note read in again reads the words it stands before, not the root.
    expect(toolbar).toContain('if (el === editorEl && range.collapsed) {');
    expect(toolbar).toContain('if (selectionInEditor()) { syncState(); return; }');
    const main = fs.readFileSync(path.resolve('src/js/main.js'), 'utf8');
    const at = main.indexOf('function openNote(id, { inPlace = false } = {}) {');
    expect(at).toBeGreaterThan(-1);
    const open = main.slice(at);
    expect(open.slice(0, open.indexOf('\n  }\n'))).toContain('toolbar.syncNoteFont();');
  });

  it('say a design’s name in the reader’s language', () => {
    const rows = fontChoices([], null, (name) => t(name, 'tr'));
    expect(rows.find(([, label]) => label.startsWith('Courgette'))[1]).toBe('Courgette (Mürekkep)');
    expect(rows[0][1]).toBe('Serif (Nebula)');            // the name is never declined
  });

  it('still show a font chosen earlier and since taken off the list, in its place by name', () => {
    const rows = fontChoices([], '"Candara", serif');
    const at = rows.findIndex(([stack]) => stack === '"Candara", serif');
    expect(rows[at]).toEqual(['"Candara", serif', 'Candara']);
    expect([rows[at - 1][1], rows[at + 1][1]]).toEqual(['Calibri', 'Cascadia Code']);
    expect(fontChoices([], 'Arial, Helvetica, sans-serif')).toHaveLength(FONTS.length);
    // A face that is out of the app (the brush's script) is still the choice of whoever chose it, and no design's.
    expect(fontChoices([], '"Kaushan Script", "Segoe Script", cursive').find(([, label]) => label.startsWith('Kaushan'))[1]).toBe('Kaushan Script');
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
  it('puts the pinned ones right under the designs’ faces, in the order they were pinned', () => {
    const rows = fontRows('', { pinned: ['Consolas', 'arial'], custom: ['Noto Serif'] }).own;
    expect(rows.slice(0, FACES.length).map((r) => r.label)).toEqual(FACES.map(([face]) => face));
    expect(rows.slice(FACES.length, FACES.length + 3).map((r) => [r.label, r.pinned])).toEqual([['Consolas', true], ['Arial', true], ['Almendra', false]]);
    expect(rows).toHaveLength(FONTS.length + 1);
    expect(rows.filter((r) => r.pinned)).toHaveLength(2);
    // The rest by their names, the reader's own among them.
    expect(rows.slice(FACES.length + 2).map((r) => r.label)).toEqual([...REST.filter((l) => !['Consolas', 'Arial'].includes(l)), 'Noto Serif'].sort(byFontName));
  });

  it('pins a font that was added, and a search keeps the pinned over the rest', () => {
    const rows = fontRows('s', { pinned: ['Noto Serif'], custom: ['Noto Serif'] }).own;
    expect(rows.filter((r) => !r.design)[0]).toEqual({ label: 'Noto Serif', stack: '"Noto Serif", serif', custom: true, pinned: true, design: '' });
    expect(rows.every((r) => /s/i.test(r.label) || /s/i.test(r.stack))).toBe(true);
  });

  it('a pin on a font that is not in the list pins nothing', () => {
    const rows = fontRows('', { pinned: ['Gone Sans'] }).own;
    expect(rows.map((r) => r.label)).toEqual(UNPINNED);
    expect(rows.some((r) => r.pinned)).toBe(false);
  });
});

describe('the designs’ faces in the font menu (1.0.4)', () => {
  it('stand first, in the designs’ order, each saying whose it is', () => {
    const rows = fontRows('').own;
    expect(rows.slice(0, FACES.length).map((r) => [r.label, r.design])).toEqual(FACES);
    // Nebula's is the app's own serif, the first row of all.
    expect(rows[0]).toEqual({ label: 'Serif', stack: FONTS[0][1], custom: false, pinned: false, design: 'Nebula' });
    expect(rows.slice(FACES.length).every((r) => r.design === '')).toBe(true);
    // The owner: "fontlar alfabeye göre sıralansın".
    expect(rows.slice(FACES.length).map((r) => r.label)).toEqual(REST);
    expect(REST.slice(0, 4)).toEqual(['Almendra', 'Architects Daughter', 'Arial', 'Calibri']);
    expect(REST.at(-1)).toBe('Verdana');
    expect(rows).toHaveLength(FONTS.length);
  });

  // The owner: "design fontları sırada en üstte olsun hep".
  it('nothing goes over them: a pinned face stays in its place and says so, a pinned font comes after them', () => {
    const rows = fontRows('', { pinned: ['Bodoni Moda', 'Georgia'] }).own;
    expect(rows.slice(0, FACES.length).map((r) => r.label)).toEqual(FACES.map(([face]) => face));
    expect(rows[FACES.length - 1]).toMatchObject({ label: 'Bodoni Moda', pinned: true, design: 'Clockwork' });
    expect(rows.slice(FACES.length, FACES.length + 2).map((r) => [r.label, r.pinned, r.design])).toEqual([['Georgia', true, ''], ['Almendra', false, '']]);
    expect(rows.filter((r) => r.label === 'Bodoni Moda')).toHaveLength(1);
  });

  it('a design’s name finds its face, in English and in the reader’s language', () => {
    expect(fontRows('art deco').own.map((r) => r.label)).toEqual(['Marcellus']);
    expect(fontRows('mürekkep').own).toEqual([]);
    expect(fontRows('mürekkep', { say: (name) => t(name, 'tr') }).own.map((r) => r.label)).toEqual(['Courgette']);
    // A font's own name is found as before, and one that is no design's says none.
    expect(fontRows('garamond').own.map((r) => [r.label, r.design])).toEqual([['Cormorant Garamond', ''], ['EB Garamond', ''], ['Garamond', '']]);
    // The faces that went out of the app are in no list.
    for (const gone of ['Kaushan', 'Rye', 'Grenze Gotisch']) expect(fontRows(gone).own, gone).toEqual([]);
  });

  it('every face named for a design is a font of the menu, and its design writes in it', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../src/css/designs.css'), 'utf8');
    expect(Object.keys(DESIGN_FACES)).toEqual(DESIGNS);
    expect(DESIGN_FACES.nebula).toEqual([FONTS[0][0]]);
    expect(designOfFace('serif')).toBe('Nebula');
    for (const [id, faces] of Object.entries(DESIGN_FACES).slice(1)) {
      expect(faces, id).toHaveLength(1);                   // one face a design, for its words and its heads
      const own = new RegExp(`\\n:root\\[data-design="${id}"\\] \\{[^}]*\\}`).exec(css)[0];
      for (const face of faces) {
        expect(FONTS.some(([label, stack]) => label === face && stack.startsWith(`"${face}"`)), face).toBe(true);
        expect(own, `${id}: ${face}`).toContain(`"${face}`);
        expect(designOfFace(face.toUpperCase())).toBe(DESIGN_NAMES[id]);
      }
      expect(/--serif:\s*"([^"]+)"/.exec(own)[1]).toBe(faces[0]);
      expect(STRINGS[DESIGN_NAMES[id]], DESIGN_NAMES[id]).toBeDefined();
    }
    expect(designOfFace('Georgia')).toBe('');
    expect(designOfFace('')).toBe('');
    expect(designFacePlace('Cinzel')).toBe(-1);
  });
});

describe('a pin, pressed and kept', () => {
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
    // Tools stands after it (1.0.3).
    expect(menus.map((m) => m.title).slice(-3)).toEqual(['Help', 'Settings', 'Tools']);
    const settings = menus.at(-2);
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
    expect(titles.map((b) => b.textContent)).toEqual(['File', 'Edit', 'View', 'Window', 'Help', 'Settings', 'Tools']);
    const last = titles.at(-2);
    expect(last.dataset.cmd).toBe('settings.open');
    expect(last.parentElement.querySelector('.am-menu')).toBeNull();
    // Tools, beside it, has a list of its own.
    expect(titles.at(-1).parentElement.querySelector('.am-menu')).not.toBeNull();
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
