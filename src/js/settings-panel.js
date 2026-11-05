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

import { readSettings, writeSettings, SPELL_LANGUAGES, DEFAULT_SETTINGS } from './settings.js';
import { FONTS, FONT_SIZES, BASE_FONT_SIZE, readCustomFonts, customFontStack, firstFamily } from './toolbar.js';
import { PAGE_MODES } from './page-mode.js';
import { initAppLockSettings } from './app-lock.js';
import { initLogoEditor } from './logo-editor.js';
import {
  chooseBackdrop, removeBackdrop, hasBackdrop, backdropPicture, isSmooth, screenOf,
  backdropPhotos, wearPhoto, deletePhoto, wornPhotoId,
  MIX_STYLES, MIX_MIN, MIX_MAX, DEFAULT_MIX, readMix, keepMix, useMix, drawMix, mixPicture, photoColors,
} from './backdrop.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { on } from './bus.js';
import { ring, stopRing, isRinging, soundChoices, soundOf, chooseSound, addOwnSound, removeOwnSound } from './alarm-sound.js';

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

/** The Settings sheet's tabs, in order: [id, label]. */
export const SETTINGS_TABS = [
  ['general', 'General'],
  ['look', 'Appearance'],
  ['sounds', 'Sounds'],
  ['lock', 'App lock'],
  ['storage', 'Storage'],
];
const TAB_KEY = 'nebula:settings-tab';

/** Bytes, the way a person reads them. */
export function formatBytes(n) {
  const b = Math.max(0, Number(n) || 0);
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/**
 * @param {object} deps
 * @param {HTMLElement} deps.overlay
 * @param {HTMLElement} deps.body
 * @param {HTMLElement} [deps.closeButton]
 * @param {() => Promise<void>} deps.saveNow
 */
export function initSettingsPanel({ overlay, body, closeButton, saveNow, emptyTrash, noteTitle, themeEditor }) {
  if (!overlay || !body) return null;

  // One category to a tab (1.0.3, the plan's round 2): a small row of quiet
  // buttons over the sheet, the last one chosen opened again next time.
  body.replaceChildren();
  body.parentElement?.querySelector(':scope > .set-tabs')?.remove();
  const tabRow = el('div', 'set-tabs');
  tabRow.setAttribute('role', 'tablist');
  tabRow.setAttribute('aria-label', t('Settings'));
  body.before(tabRow);
  const panels = new Map();
  const tabButtons = new Map();
  for (const [id, label] of SETTINGS_TABS) {
    const b = el('button', 'set-tab', label);
    b.type = 'button';
    b.id = `set-tab-${id}`;
    b.dataset.tab = id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `set-panel-${id}`);
    tabRow.append(b);
    tabButtons.set(id, b);
    const panel = el('div', 'set-panel');
    panel.id = `set-panel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', b.id);
    panel.hidden = true;
    body.append(panel);
    panels.set(id, panel);
  }
  let current = null;
  function showTab(id, { focus = false } = {}) {
    if (!panels.has(id)) id = SETTINGS_TABS[0][0];
    current = id;
    for (const [key, b] of tabButtons) {
      const on = key === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('on', on);
      panels.get(key).hidden = !on;
    }
    // Appearance is the preview and its colours side by side: the sheet is wider there.
    overlay.querySelector('.settings-modal')?.classList.toggle('is-wide', id === 'look');
    try { localStorage.setItem(TAB_KEY, id); } catch { /* remembered for this run only */ }
    body.scrollTop = 0;
    if (focus) tabButtons.get(id).focus();
    if (id === 'storage' && !overlay.hidden) void paintStorage();
  }
  tabRow.addEventListener('click', (e) => {
    const b = e.target.closest('.set-tab');
    if (b) showTab(b.dataset.tab);
  });
  tabRow.addEventListener('keydown', (e) => {
    const ids = SETTINGS_TABS.map(([id]) => id);
    const at = ids.indexOf(current);
    const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: ids.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    showTab(ids[(to + ids.length) % ids.length], { focus: true });
  });

  const group = (title, tab = 'general') => {
    const section = el('section', 'set-group');
    section.append(el('h3', 'set-head', title));
    panels.get(tab).append(section);
    return section;
  };
  const row = (section, label, control) => {
    const line = el('label', 'set-row');
    line.append(el('span', 'set-label', label), control);
    section.append(line);
    return line;
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

  const locked = group('Lock on opening', 'lock');
  const lockHost = el('div', 'set-lock');
  lockHost.id = 'set-lock';
  locked.append(lockHost);
  const lock = initAppLockSettings({ host: lockHost, saveNow });

  // ── Appearance (1.0.3). One theme organizer, laid out as the logo's editor
  // is (the owner: "ayarlardaki logo düzenleme gibi olsun"): at the left a
  // Nebula in small — the title strip, the whole note list with its foot, the
  // page's head and editing bar and a note — and at its right every colour
  // there is to choose: the themes, Your own theme's profiles and slots, the
  // styles' colours with the same bar, the styles, the picture.
  const behind = group('Theme organizer', 'look');
  const studio = el('div', 'theme-studio');
  const studioSide = el('div', 'studio-side');
  const studioTools = el('div', 'studio-tools');
  studio.append(studioSide, studioTools);
  behind.append(studio);

  // The preview is drawn at a window's size and shown smaller, so every part
  // of it is there and in proportion; it wears the app's own colours.
  const PREVIEW_W = 960;
  const PREVIEW_H = 600;
  const preview = el('div', 'look-preview');
  preview.id = 'set-look-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  const stage = el('div', 'lp-stage');
  preview.append(stage);
  const ic = (name) => { const s = el('span', 'lp-ic'); s.innerHTML = icon(name); return s; };
  const words = (cls, text) => el('span', cls, text);
  // The title strip: the logo, the menus, the note's name, the window's buttons.
  const pvBar = el('div', 'lp-bar');
  const pvLogo = el('span', 'lp-logo');
  const pvMenus = el('span', 'lp-menus');
  const pvWinTitle = words('lp-wintitle', 'Your note');
  const pvWin = el('span', 'lp-win');
  pvWin.append(ic('minus'), ic('square'), ic('close'));
  pvBar.append(pvLogo, pvMenus, pvWinTitle, pvWin);
  // The note list, as the sidebar has it, from its brand down to the language.
  const pvSide = el('div', 'lp-side');
  const pvBrand = el('div', 'lp-brand');
  pvBrand.append(ic('menu'), words('lp-brand__name', 'Nebula'));
  pvBrand.lastChild.dataset.noI18n = '';
  const pvSearch = el('div', 'lp-search');
  pvSearch.append(ic('search'), words(null, 'Search'));
  const pvFilters = el('div', 'lp-filters');
  pvFilters.append(words('lp-filter on', 'All'), words('lp-filter', 'Pinned'), words('lp-filter', 'Labels'));
  const noteRow = (title, snippet, when, { on = false, pin = false } = {}) => {
    const r = el('div', `lp-row${on ? ' on' : ''}`);
    const top = el('div', 'lp-row__top');
    if (pin) top.append(ic('pin'));
    top.append(words('lp-row__title', title), words('lp-row__when', when));
    r.append(top, words('lp-row__snip', snippet));
    return r;
  };
  const folderRow = el('div', 'lp-folder');
  folderRow.append(ic('folder'), words('lp-folder__name', 'Ideas'), words('lp-count', '3'));
  const holeRow = el('div', 'lp-folder lp-hole');
  holeRow.append(el('span', 'lp-disc'), words('lp-folder__name', 'Black hole'), ic('lock'));
  const pvList = el('div', 'lp-list');
  pvList.append(
    words('lp-sec', 'Notes'),
    noteRow('Your note', 'This is how your words look…', '12:40', { on: true, pin: true }),
    folderRow,
    noteRow('A list for the week', 'Groceries, the train, a call', 'Mon'),
    noteRow('Reading', 'Three chapters left', 'Sun'),
    words('lp-sec', 'Black holes'),
    holeRow,
  );
  const pvGalaxy = el('div', 'lp-galaxy');
  const galaxyHead = el('div', 'lp-galaxy__head');
  galaxyHead.append(ic('universe'), words(null, 'Universe'));
  const galaxySky = el('div', 'lp-galaxy__sky');
  for (const [x, y, r] of [[18, 40, 5], [42, 22, 3], [64, 58, 4], [80, 30, 2.5], [30, 70, 2.5], [54, 38, 2]]) {
    const star = el('span', 'lp-star');
    star.style.cssText = `left:${x}%;top:${y}%;width:${r * 2}px;height:${r * 2}px`;
    galaxySky.append(star);
  }
  pvGalaxy.append(galaxyHead, galaxySky);
  const pvDrawers = el('div', 'lp-drawers');
  pvDrawers.append(words('lp-btn', 'Archive'), words('lp-btn', 'Trash'));
  const pvNew = el('div', 'lp-newrow');
  const plusOf = (name) => { const b = el('span', 'lp-btn lp-btn--ic'); b.append(ic(name), words('lp-plus', '+')); return b; };
  pvNew.append(words('lp-btn lp-new', 'New note'), plusOf('folder'), plusOf('project'));
  const pvMeta = el('div', 'lp-meta');
  const pvVersion = words('lp-version', '');
  pvVersion.dataset.noI18n = '';
  const pvLangs = el('span', 'lp-langs');
  pvLangs.dataset.noI18n = '';
  pvLangs.append(words('on', 'English'), words(null, 'Deutsch'), words(null, 'Polski'), words(null, 'Türkçe'));
  pvMeta.append(pvVersion, pvLangs);
  pvSide.append(pvBrand, pvSearch, pvFilters, pvList, pvGalaxy, pvDrawers, pvNew, pvMeta);
  // The page: its head (the name, a label, saved, the bar's pad), the editing
  // bar's two rows, and the note on its paper.
  const pvMain = el('div', 'lp-main');
  const pvHead = el('div', 'lp-head');
  const pvPad = el('span', 'lp-pad');
  pvPad.append(ic('up'), ic('right'), ic('ai'), ic('down'), ic('left'), ic('minus'));
  pvHead.append(words('lp-title', 'Your note'), words('lp-label', 'Ideas'), words('lp-saved', 'Saved'), pvPad);
  const pvTools = el('div', 'lp-toolbar');
  const toolRow = (...items) => {
    const r = el('div', 'lp-tbrow');
    for (const it of items) r.append(it === '|' ? el('span', 'lp-sep') : typeof it === 'string' ? ic(it) : it);
    return r;
  };
  const pvFont = words('lp-select', '');
  pvFont.dataset.noI18n = '';
  const pvSize = words('lp-select lp-select--n', '');
  pvSize.dataset.noI18n = '';
  pvTools.append(
    toolRow('undo', 'redo', '|', words('lp-select', 'Paragraph'), '|', 'bullets', 'numbers', 'todo', 'toggle', 'outdent', 'indent', '|', 'save', 'print', 'download', 'upload', '|', 'shapes', 'divider', 'table'),
    toolRow(pvFont, pvSize, '|', 'bold', 'italic', 'underline', 'strike', 'hilite', '|', 'link', 'image', 'code', 'equation', 'emoji', 'clip'),
  );
  const pvPage = el('div', 'lp-page');
  const pvNote = el('div', 'lp-note');
  const todo = (text, done) => { const r = el('div', `lp-todo${done ? ' done' : ''}`); r.append(el('span', 'lp-box'), words(null, text)); return r; };
  pvNote.append(
    el('p', null, 'This is how your words look over the picture.'),
    el('div', 'lp-h', 'A list for the week'),
    todo('Groceries', true), todo('The train at nine', false),
    el('blockquote', 'lp-quote', 'A theme, a picture and a font, seen at once.'),
  );
  pvPage.append(pvNote);
  pvMain.append(pvHead, pvTools, pvPage);
  const pvBody = el('div', 'lp-body');
  pvBody.append(pvSide, pvMain);
  stage.append(pvBar, pvBody);
  const backdropPercent = el('output', 'lp-amount');
  preview.append(backdropPercent);
  studioSide.append(preview, el('p', 'set-hint', 'Nebula as it will look: the theme, the picture, the logo and the font of a new note, as they are set here.'));
  // The stage is drawn at a window's size and brought down to the column's width.
  const fitPreview = () => {
    const k = (preview.clientWidth || PREVIEW_W) / PREVIEW_W;
    stage.style.zoom = String(k);
    preview.style.height = `${Math.round(PREVIEW_H * k)}px`;
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fitPreview).observe(preview);
  /** The picture the preview shows while a style is pointed at, else the one worn. */
  let pointed = null;
  function paintPreview() {
    const picture = pointed ?? (hasBackdrop() ? backdropPicture() : null);
    preview.classList.toggle('has-backdrop', !!picture);
    backdropPercent.hidden = !picture;
    if (picture) preview.style.setProperty('--backdrop-image', `url("${picture}")`);
    else preview.style.removeProperty('--backdrop-image');
    const s = readSettings();
    pvNote.style.fontFamily = s.font || '';
    pvNote.style.setProperty('--lp-size', `${s.size || BASE_FONT_SIZE}px`);
    pvFont.textContent = firstFamily(s.font || '') || t('Font');
    pvSize.textContent = String(s.size || BASE_FONT_SIZE);
    pvMenus.replaceChildren(...[...document.querySelectorAll('#app-menu .am-title')].map((m) => el('span', null, m.textContent)));
    pvVersion.textContent = document.getElementById('app-version')?.textContent ?? '';
    const lang = document.documentElement.lang || 'en';
    [...pvLangs.children].forEach((c, i) => c.classList.toggle('on', ['en', 'de', 'pl', 'tr'][i] === lang.slice(0, 2)));
    fitPreview();
  }
  // The logo is the title strip's own, copied whenever the logo editor redraws it.
  const tbLogo = document.getElementById('tb-logo');
  const copyLogo = () => { pvLogo.innerHTML = tbLogo?.innerHTML ?? ''; };
  copyLogo();
  if (tbLogo) new MutationObserver(copyLogo).observe(tbLogo, { childList: true, subtree: true, attributes: true, characterData: true });
  on('settings-changed', paintPreview);

  // At the right: the themes, then Your own theme — whose bar and colours
  // also choose the styles' colours (the owner: "your own theme kismi ile
  // stiller ic ice gecmeli") — then the styles and the picture.
  const themeRow = document.getElementById('theme-row');
  const themePanel = document.getElementById('theme-editor');
  if (themeRow) studioTools.append(el('div', 'te-label', 'Themes'), themeRow);
  if (themePanel) studioTools.append(themePanel);
  const mixStyles = el('div', 'set-mix-styles');
  mixStyles.id = 'set-mix-styles';
  mixStyles.setAttribute('role', 'group');
  mixStyles.setAttribute('aria-label', t('Style'));
  studioTools.append(el('div', 'te-label', 'Styles'), mixStyles,
    el('p', 'set-hint', 'A picture of the style colours above. Point at a style to see it in the preview.'));
  const backdropFile = el('input');
  backdropFile.type = 'file';
  backdropFile.accept = 'image/*';
  backdropFile.id = 'set-backdrop-file';
  backdropFile.hidden = true;
  const backdropChoose = el('button', 'btn', 'Choose a picture');
  backdropChoose.type = 'button';
  backdropChoose.id = 'set-backdrop-choose';
  const backdropRemove = el('button', 'btn', 'Remove the picture');
  backdropRemove.type = 'button';
  backdropRemove.id = 'set-backdrop-remove';
  // Every photo chosen, kept as a little picture beside Choose a picture: put on
  // again with a click, deleted with its × (the owner's Bug Find note, 2026-11-04).
  const backdropPhotoRow = el('div', 'set-photos');
  backdropPhotoRow.id = 'set-backdrop-photos';
  const backdropButtons = el('div', 'set-buttons');
  backdropButtons.append(backdropChoose, backdropPhotoRow, backdropRemove, backdropFile);
  // The picture is under the preview (1.0.3, the owner: "picture kısmı sola aktarılsın").
  const pictureTools = el('div', 'studio-picture');
  pictureTools.id = 'set-picture';
  pictureTools.append(el('div', 'te-label', 'Picture'), backdropButtons);
  studioSide.append(pictureTools);
  let mixTimer = 0;
  /** Wears the mix now, or a moment later while a colour is being pulled across the wheel. */
  const wearMix = (later = false) => {
    clearTimeout(mixTimer);
    const go = async () => {
      if (!await useMix(readMix())) window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'That picture could not be used' }));
      paintBackdrop();
    };
    if (later) mixTimer = setTimeout(go, 350);
    else void go();
  };
  function addMixColor() {
    const colors = readMix().colors;
    if (colors.length >= MIX_MAX) return;
    keepMix({ colors: [...colors, DEFAULT_MIX.colors[colors.length % DEFAULT_MIX.colors.length]] });
    drawMixButtons();
    if (readMix().on) wearMix();
  }
  function removeMixColor(i) {
    if (readMix().colors.length <= MIX_MIN) return;
    keepMix({ colors: readMix().colors.filter((_, j) => j !== i) });
    drawMixButtons();
    if (readMix().on) wearMix();
  }
  /** One of the style's colours, chosen in the theme editor. */
  function pickMixColor(i, hex) {
    const colors = [...readMix().colors];
    colors[i] = hex;
    keepMix({ colors });
    drawMixButtons();
    if (readMix().on) wearMix(true);
  }
  // Under its five slots, the style's colours; under its colours, the photo's.
  themeEditor?.useColorSet({
    label: 'Style colours (up to 5)',
    most: MIX_MAX,
    colors: () => readMix().colors,
    pick: pickMixColor,
    add: addMixColor,
    remove: removeMixColor,
    canAdd: () => readMix().colors.length < MIX_MAX,
    canRemove: () => readMix().colors.length > MIX_MIN,
    // Only while the photo is worn: a style worn instead takes its colours away too (the owner, 2026-11-04:
    // "arka plana stil seçtim, colours inspired by your picture hâlâ duruyor, durmaması lazım").
    offers: () => (wornPhotoId() ? photoColors() : []),
  });
  function drawMixButtons() {
    const mix = readMix();
    mixStyles.replaceChildren();
    for (const style of MIX_STYLES) {
      const b = el('button', `set-mix-style${mix.on && mix.style === style.id ? ' on' : ''}`);
      b.type = 'button';
      b.dataset.mixStyle = style.id;
      b.setAttribute('aria-pressed', String(mix.on && mix.style === style.id));
      const drawing = document.createElement('canvas');
      drawing.width = 128;
      drawing.height = 72;
      drawing.setAttribute('aria-hidden', 'true');
      const ctx = drawing.getContext('2d');
      if (ctx) drawMix(ctx, drawing.width, drawing.height, style.id, mix.colors);
      b.append(drawing, el('span', null, t(style.label)));
      b.addEventListener('click', () => { pointed = null; keepMix({ style: style.id }); wearMix(); });
      // Pointed at, the style is shown in the preview, in the colours chosen.
      const show = () => { pointed = mixPicture({ style: style.id, colors: readMix().colors }); paintPreview(); };
      const hide = () => { if (pointed) { pointed = null; paintPreview(); } };
      b.addEventListener('pointerenter', show);
      b.addEventListener('focus', show);
      b.addEventListener('pointerleave', hide);
      b.addEventListener('blur', hide);
      mixStyles.append(b);
    }
  }
  drawMixButtons();
  const backdropAmount = el('input', 'set-range');
  backdropAmount.type = 'range';
  backdropAmount.id = 'set-backdrop-amount';
  backdropAmount.min = '5';
  backdropAmount.max = '100';
  backdropAmount.step = '1';
  // Back to 30% in one click (the owner, 2026-11-04: "varsayılana dön olsun").
  const backdropDefault = el('button', 'btn', 'Reset to default');
  backdropDefault.type = 'button';
  backdropDefault.id = 'set-backdrop-default';
  row(pictureTools, 'How much it shows', backdropAmount).append(backdropDefault);
  pictureTools.append(el('p', 'set-hint', 'It stands behind your notes, in this window only. It is kept on this computer and is part of no note.'));
  // Softened for the screen (1.0.3, backdrop.js): an outside screen showed the
  // picture's colours in steps and specks, so there it is drawn smaller and softer.
  const smoothScreen = select('set-smooth-screen');
  for (const [value, label] of [['auto', 'On an external screen'], ['on', 'Always'], ['off', 'Never']]) smoothScreen.append(option(value, label));
  row(pictureTools, 'Soften for the screen', smoothScreen);
  pictureTools.append(el('p', 'set-hint', 'If the picture shows green specks or steps on your screen, set Soften for the screen to Always or On an external screen.'));
  const smoothHint = el('p', 'set-hint');
  smoothHint.id = 'set-smooth-hint';
  pictureTools.append(smoothHint);
  const paintSmoothHint = () => {
    smoothScreen.value = readSettings().smoothScreen;
    const where = screenOf();
    const name = where?.label ? ` (${where.label})` : '';
    const on = isSmooth();
    smoothHint.textContent = where == null
      ? t(on ? 'The picture is softened: drawn smaller and a little blurred.' : 'The picture is drawn at its full size.')
      : `${t(where.internal ? 'This window is on the computer’s own screen' : 'This window is on an external screen')}${name}. ${t(on ? 'The picture is softened: drawn smaller and a little blurred.' : 'The picture is drawn at its full size.')}`;
    smoothHint.dataset.noI18n = '';
  };
  smoothScreen.addEventListener('change', () => writeSettings({ smoothScreen: smoothScreen.value }));
  on('backdrop-smooth', () => { paintSmoothHint(); paintPreview(); });
  on('settings-changed', paintSmoothHint);
  on('lang-changed', paintSmoothHint);
  paintSmoothHint();
  let photosPainted = 0;
  async function paintPhotos() {
    const turn = ++photosPainted;
    const photos = await backdropPhotos();
    if (turn !== photosPainted) return;
    const worn = wornPhotoId();
    backdropPhotoRow.hidden = !photos.length;
    backdropPhotoRow.replaceChildren(...photos.map(({ id, picture }) => {
      const cell = el('span', `set-photo${id === worn ? ' on' : ''}`);
      cell.dataset.photo = id;
      const wear = el('button', 'set-photo__wear');
      wear.type = 'button';
      wear.title = t('Put this picture behind your notes');
      wear.setAttribute('aria-label', wear.title);
      wear.setAttribute('aria-pressed', String(id === worn));
      wear.style.backgroundImage = `url("${picture}")`;
      wear.addEventListener('click', async () => {
        if (!await wearPhoto(id)) window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'That picture could not be used' }));
        paintBackdrop();
      });
      const drop = el('button', 'set-photo__drop', '×');
      drop.type = 'button';
      drop.title = t('Delete this picture');
      drop.setAttribute('aria-label', drop.title);
      drop.addEventListener('click', async () => { await deletePhoto(id); paintBackdrop(); });
      cell.append(wear, drop);
      return cell;
    }));
  }
  const paintBackdrop = () => {
    void paintPhotos();
    backdropRemove.hidden = !hasBackdrop();
    backdropAmount.disabled = !hasBackdrop();
    backdropAmount.value = String(Math.round(readSettings().backdrop * 100));
    paintBackdropAmount();
    backdropDefault.disabled = !hasBackdrop() || backdropAmount.value === String(Math.round(DEFAULT_SETTINGS.backdrop * 100));
    paintPreview();
    drawMixButtons();
    themeEditor?.refresh();
  };
  function paintBackdropAmount() {
    preview.style.setProperty('--backdrop', String(Number(backdropAmount.value) / 100));
    backdropPercent.textContent = `${backdropAmount.value}%`;
  }
  backdropChoose.addEventListener('click', () => backdropFile.click());
  backdropFile.addEventListener('change', async () => {
    const file = backdropFile.files?.[0];
    backdropFile.value = '';
    if (!file) return;
    const chosen = await chooseBackdrop(file);
    if (chosen === 'full') window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'No more pictures can be kept: delete one first' }));
    else if (!chosen) window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'That picture could not be used' }));
    paintBackdrop();
  });
  backdropRemove.addEventListener('click', async () => { await removeBackdrop(); paintBackdrop(); });
  backdropAmount.addEventListener('input', () => {
    paintBackdropAmount();
    writeSettings({ backdrop: Number(backdropAmount.value) / 100 });
    backdropDefault.disabled = backdropAmount.value === String(Math.round(DEFAULT_SETTINGS.backdrop * 100));
  });
  backdropDefault.addEventListener('click', () => {
    writeSettings({ backdrop: DEFAULT_SETTINGS.backdrop });
    paintBackdrop();
  });

  // What the Pomodoro and the Clock widgets ring with (1.0.3, alarm-sound.js).
  // Three sounds, each its own row: the Clock's alarm, a Pomodoro's focus ending, its break ending.
  const ringing = group('Sounds', 'sounds');
  const SOUND_ROWS = [['alarm', 'Alarm'], ['focus', 'Focus ends'], ['break', 'Break ends']];
  const soundPicks = {};
  for (const [slot, label] of SOUND_ROWS) {
    const pick = el('select', 'set-select');
    pick.id = `set-sound-${slot}`;
    const play = el('button', 'btn set-sound-play', '▶');
    play.type = 'button';
    play.title = t('Play');
    play.setAttribute('aria-label', t('Play'));
    const line = el('div', 'set-sound');
    line.append(pick, play);
    row(ringing, label, line);
    soundPicks[slot] = pick;
    pick.addEventListener('change', () => {
      chooseSound(slot, pick.value);
      play.disabled = pick.value === 'off';
      if (pick.value !== 'off') void ring({ id: pick.value });
      paintRemove();
    });
    play.addEventListener('click', () => { if (isRinging()) stopRing(); else void ring({ id: pick.value }); });
  }
  const soundFile = el('input');
  soundFile.type = 'file';
  soundFile.accept = 'audio/*';
  soundFile.id = 'set-alarm-file';
  soundFile.hidden = true;
  const soundChoose = el('button', 'btn', 'Add a sound of mine');
  soundChoose.type = 'button';
  soundChoose.id = 'set-alarm-choose';
  const soundRemove = el('button', 'btn', 'Remove my sound');
  soundRemove.type = 'button';
  soundRemove.id = 'set-alarm-remove';
  const soundButtons = el('div', 'set-buttons');
  soundButtons.append(soundChoose, soundRemove, soundFile);
  ringing.append(soundButtons, el('p', 'set-hint', 'The Clock rings with the first; a Pomodoro with the other two. The widgets choose them too. Your own sounds are kept on this computer.'));
  // "Remove my sound" takes away the sound of yours the alarm row shows, else the first other row's.
  const removable = () => Object.values(soundPicks).map((p) => p.value).find((v) => /^own(:|$)/.test(v)) ?? null;
  const paintRemove = () => { soundRemove.hidden = !removable(); };
  async function paintSounds() {
    const choices = await soundChoices();
    for (const [slot, pick] of Object.entries(soundPicks)) {
      const chosen = soundOf(slot);
      pick.replaceChildren(...choices.map((c) => {
        const o = option(c.value, c.label);
        o.dataset.noI18n = '';
        return o;
      }));
      pick.value = choices.some((c) => c.value === chosen) ? chosen : (slot === 'break' ? 'bell' : 'chime');
      pick.nextElementSibling.disabled = pick.value === 'off';
    }
    paintRemove();
  }
  soundChoose.addEventListener('click', () => soundFile.click());
  soundFile.addEventListener('change', async () => {
    const file = soundFile.files?.[0];
    soundFile.value = '';
    const value = await addOwnSound(file, 'alarm');
    if (!value) return;
    await paintSounds();
    void ring({ id: value });
  });
  soundRemove.addEventListener('click', async () => {
    const value = removable();
    if (!value) return;
    await removeOwnSound(value);
    await paintSounds();
  });

  // The logo, at the foot of Appearance: itself at the left, its colours at the right.
  const logoGroup = group('Logo', 'look');
  const logoHost = el('div', 'set-logo');
  logoGroup.append(logoHost);
  const logo = initLogoEditor({ host: logoHost });

  // ── Storage (1.0.3): how much room Nebula takes here, and the two ways it
  // already had to make some — the backups' own tidying and the Trash's
  // Delete. Nothing new is deleted from here (the plan: "deleted is deleted").
  const room = group('On this computer', 'storage');
  room.id = 'set-storage';
  const roomTotal = el('p', 'set-store-total');
  roomTotal.id = 'set-store-total';
  const roomRows = el('div', 'set-store');
  const measure = el('button', 'btn', 'Measure again');
  measure.type = 'button';
  measure.id = 'set-store-measure';
  room.append(roomTotal, roomRows);
  const roomButtons = el('div', 'set-buttons');
  roomButtons.append(measure);
  room.append(roomButtons, el('p', 'set-hint', 'A picture a backup shares with its note is counted once, with the note. Black holes are sealed: only the size of their files is read.'));
  const storeLine = (label, bytes, id) => {
    const line = el('div', 'set-store-row');
    if (id) line.id = id;
    line.append(el('span', 'set-label', label), el('span', 'set-store-size', formatBytes(bytes)));
    roomRows.append(line);
    return line;
  };
  let measuring = null;
  async function paintStorage(fresh = false) {
    const api = window.nebula?.storage;
    if (!api?.usage) { roomTotal.textContent = t('Storage needs the desktop app.'); return; }
    if (measuring) return measuring;
    roomTotal.textContent = t('Measuring…');
    measure.disabled = true;
    measuring = (async () => {
      const u = await api.usage({ fresh }).catch(() => null);
      measuring = null;
      measure.disabled = false;
      roomRows.replaceChildren();
      if (!u?.ok) { roomTotal.textContent = u?.error === 'locked' ? t('Nebula is locked.') : t('It could not be measured.'); return; }
      roomTotal.textContent = `${t('Nebula on this computer')}: ${formatBytes(u.total)}`;

      storeLine(t('Notes'), u.notes.total, 'set-store-notes');
      roomRows.append(el('p', 'set-hint', `${u.notes.count} · ${t('words')} ${formatBytes(u.notes.text)} · ${t('pictures and videos')} ${formatBytes(u.notes.media)}`));
      if (u.notes.top.length) {
        const top = el('ol', 'set-store-top');
        top.id = 'set-store-top';
        for (const n of u.notes.top) {
          const li = el('li');
          const name = el('span', 'set-store-name', noteTitle?.(n.id) ?? (n.title || t('Untitled')));
          name.dataset.noI18n = '';
          li.append(name, el('span', 'set-store-size', formatBytes(n.bytes)));
          top.append(li);
        }
        roomRows.append(top);
      }

      storeLine(t('Black holes'), u.holes.bytes, 'set-store-holes');
      roomRows.append(el('p', 'set-hint', `${u.holes.count}`));

      storeLine(t('Backups'), u.backups.total, 'set-store-backups');
      if (u.backups.copies.length) {
        const list = el('ul', 'set-store-top');
        for (const c of u.backups.copies) {
          const li = el('li');
          const name = el('span', 'set-store-name', c.name);
          name.dataset.noI18n = '';
          li.append(name, el('span', 'set-store-size', formatBytes(c.bytes)));
          list.append(li);
        }
        roomRows.append(list);
      }
      if (u.backups.stale) {
        const tidy = el('button', 'btn', 'Remove the older copies');
        tidy.type = 'button';
        tidy.id = 'set-store-tidy';
        tidy.addEventListener('click', async () => { tidy.disabled = true; await api.tidyBackups(); void paintStorage(true); });
        const b = el('div', 'set-buttons');
        b.append(tidy);
        roomRows.append(b);
      } else roomRows.append(el('p', 'set-hint', 'One copy a day and the newest before an update are kept; older ones go by themselves.'));

      storeLine(t('Trash'), u.trash.bytes, 'set-store-trash');
      if (u.trash.count && emptyTrash) {
        const empty = el('button', 'btn', 'Empty the trash');
        empty.type = 'button';
        empty.id = 'set-store-empty';
        empty.addEventListener('click', async () => {
          // As each Delete in the Trash: the first press only asks.
          if (!empty.classList.contains('is-sure')) { empty.classList.add('is-sure'); empty.textContent = t('Delete for good?'); return; }
          empty.disabled = true;
          await emptyTrash();
          void paintStorage(true);
        });
        const b = el('div', 'set-buttons');
        b.append(empty);
        roomRows.append(el('p', 'set-hint', `${u.trash.count} · ${t('Its notes are deleted for good, from the backups too. Black holes in the Trash are deleted there, one at a time.')}`), b);
      }

      if (u.app !== null) storeLine(t('The program'), u.app, 'set-store-app');
      storeLine(t('Files opened in other programs'), u.opened, 'set-store-opened');
    })();
    return measuring;
  }
  measure.addEventListener('click', () => { void paintStorage(true); });

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
    paintBackdrop();
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
  function open(tab = null) {
    paint();
    void lock?.refresh();
    void logo?.refresh();
    void paintSounds();
    themeEditor?.open();
    overlay.hidden = false;
    let kept = null;
    try { kept = localStorage.getItem(TAB_KEY); } catch { /* none */ }
    showTab(tab ?? kept ?? SETTINGS_TABS[0][0]);
    if (current === 'general') font.focus({ preventScroll: true });
    else tabButtons.get(current).focus({ preventScroll: true });
  }
  closeButton?.addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) { e.preventDefault(); close(); }
  });

  return { open, close, showTab, lockNow: () => lock?.lockNow() ?? Promise.resolve(false) };
}
