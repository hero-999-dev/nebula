/**
 * The Settings sheet (0.9.4): Settings, beside Help at the top.
 *
 * The owner's Ideas note: "Settings beside Help; pressing it brings the
 * settings up — a default font, a default note size, a default mode, hiding
 * the AI tabs, hiding the black holes entirely, and a PIN or a passkey when
 * the app is opened, as a black hole has."
 *
 * Four groups. What a new note starts with: its font, its text size and its
 * page (the "mode" — Nebula Wide, Nebula Narrow or a paper). What is put away:
 * the AI panel, the black holes. The lock on opening (app-lock.js). And, at
 * the foot, the logo and its colours (logo-editor.js). A change is kept the
 * moment it is made — there is nothing to confirm — and whoever it concerns
 * hears of it (`settings-changed`, settings.js).
 */

import { readSettings, writeSettings, SPELL_LANGUAGES } from './settings.js';
import { FONTS, FONT_SIZES, BASE_FONT_SIZE, readCustomFonts, customFontStack, firstFamily } from './toolbar.js';
import { PAGE_MODES } from './page-mode.js';
import { initAppLockSettings } from './app-lock.js';
import { initLogoEditor } from './logo-editor.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

function option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}

/**
 * The fonts a new note may start in: the app's own, then the ones the reader
 * added. [stack, label] — '' is the app's own, and says which it is.
 */
export function fontChoices(custom = [], current = null) {
  // The app's own font is shown by its name, as the others are (1.0.0: "stop
  // writing Nebula's own, just the chosen font and the size number", the owner).
  const out = [['', FONTS[0][0]], ...FONTS.slice(1).map(([label, stack]) => [stack, label])];
  const have = new Set(out.map(([stack]) => firstFamily(stack).toLowerCase()));
  have.add(firstFamily(FONTS[0][1]).toLowerCase());
  for (const name of custom) {
    const stack = customFontStack(name);
    const key = firstFamily(stack).toLowerCase();
    if (!key || have.has(key)) continue;
    have.add(key);
    out.push([stack, firstFamily(stack)]);
  }
  // A font chosen earlier and since taken off the list is still the choice, and still shown.
  if (current && !have.has(firstFamily(current).toLowerCase())) out.push([current, firstFamily(current)]);
  return out;
}

/**
 * @param {object} deps
 * @param {HTMLElement} deps.overlay
 * @param {HTMLElement} deps.body
 * @param {HTMLElement} [deps.closeButton]
 * @param {() => Promise<void>} deps.saveNow
 */
export function initSettingsPanel({ overlay, body, closeButton, saveNow }) {
  if (!overlay || !body) return null;

  const group = (title) => {
    const section = el('section', 'set-group');
    section.append(el('h3', 'set-head', title));
    body.append(section);
    return section;
  };
  const row = (section, label, control) => {
    const line = el('label', 'set-row');
    line.append(el('span', 'set-label', label), control);
    section.append(line);
  };
  const select = (id) => {
    const s = el('select', 'set-select');
    s.id = id;
    return s;
  };
  const check = (section, id, label, hint) => {
    const line = el('label', 'set-check');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = id;
    line.append(box, el('span', '', label));
    section.append(line, el('p', 'set-hint', hint));
    return box;
  };

  body.replaceChildren();
  const notes = group('New notes');
  const font = select('set-font');
  font.dataset.noI18n = '';            // font names are names
  const size = select('set-size');
  const page = select('set-page');
  page.dataset.noI18n = '';
  row(notes, 'Font', font);
  row(notes, 'Text size', size);
  row(notes, 'Page', page);
  notes.append(el('p', 'set-hint', 'A new note starts with these. The notes you have keep their own.'));

  const shown = group('Show and hide');
  const hideAi = check(shown, 'set-hide-ai', 'Hide the AI panel', 'Its button and its tabs are put away. Your sign-ins stay as they are.');
  const hideHoles = check(shown, 'set-hide-holes', 'Hide the black holes', 'Their section and their button leave the note list; open ones are locked first. Nothing is deleted, and they are back when this is turned off.');

  // The spell checker's languages (1.0.0): all of them on, each one can be taken off.
  const spelling = group('Spelling');
  const spellBoxes = SPELL_LANGUAGES.map(([code, name]) => {
    const line = el('label', 'set-check');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = `set-spell-${code}`;
    box.value = code;
    const label = el('span', '', name);
    label.dataset.noI18n = '';         // each language in its own words
    line.append(box, label);
    spelling.append(line);
    return box;
  });
  spelling.append(el('p', 'set-hint', 'Words are checked in every language ticked here. Untick one and it is no longer corrected; with none ticked, nothing is.'));

  const locked = group('Lock on opening');
  const lockHost = el('div', 'set-lock');
  lockHost.id = 'set-lock';
  locked.append(lockHost);
  const lock = initAppLockSettings({ host: lockHost, saveNow });

  // The logo, at the foot of the sheet: itself at the left, its colours at the right.
  const logoGroup = group('Logo');
  const logoHost = el('div', 'set-logo');
  logoGroup.append(logoHost);
  const logo = initLogoEditor({ host: logoHost });

  function paint() {
    const s = readSettings();
    // Font names are names (the list is not translated).
    font.replaceChildren(...fontChoices(readCustomFonts(), s.font).map(([stack, label]) => option(stack, label)));
    font.value = s.font ?? '';
    // Sizes are numbers only; the app's own (14) is one of them, and choosing it is choosing nothing.
    size.replaceChildren(...[...new Set([...FONT_SIZES, BASE_FONT_SIZE, ...(s.size ? [s.size] : [])])].sort((a, b) => a - b).map((px) => option(String(px), String(px))));
    size.value = String(s.size ?? BASE_FONT_SIZE);
    page.replaceChildren(...PAGE_MODES.map((m) => option(m.id, m.name === m.short ? m.name : `${m.name} (${m.short})`)));
    page.value = s.page;
    hideAi.checked = s.hideAi;
    hideHoles.checked = s.hideHoles;
    for (const box of spellBoxes) box.checked = s.spell.includes(box.value);
  }

  font.addEventListener('change', () => writeSettings({ font: font.value || null }));
  size.addEventListener('change', () => writeSettings({ size: Number(size.value) === BASE_FONT_SIZE ? null : Number(size.value) }));
  page.addEventListener('change', () => writeSettings({ page: page.value }));
  hideAi.addEventListener('change', () => writeSettings({ hideAi: hideAi.checked }));
  hideHoles.addEventListener('change', () => writeSettings({ hideHoles: hideHoles.checked }));
  for (const box of spellBoxes) {
    box.addEventListener('change', () => writeSettings({ spell: spellBoxes.filter((b) => b.checked).map((b) => b.value) }));
  }

  function close() { overlay.hidden = true; }
  function open() {
    paint();
    void lock?.refresh();
    void logo?.refresh();
    overlay.hidden = false;
    font.focus({ preventScroll: true });
  }
  closeButton?.addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) { e.preventDefault(); close(); }
  });

  return { open, close, lockNow: () => lock?.lockNow() ?? Promise.resolve(false) };
}
