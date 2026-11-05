/**
 * The logo's editor, at the foot of the Settings sheet (0.9.4).
 *
 * The owner: "the logo at the bottom left, and at its right its colours to
 * change — in the style of Your own theme at the bottom left of the window;
 * the star, the moon, the ground and the rest; and a theme, a ready one like
 * Contrast or one of the user's own, can be put on the logo." And on its
 * first build: "Nebula's own belongs to the test app only. A + beside
 * Contrast: users add themes that are for the logo alone, and name them; a
 * change made to a ready one is kept as a new theme. The logo at the top left
 * of the app is not this one — that stays with the app's theme."
 *
 * At the left the logo as it will be worn, large and in the two small sizes a
 * taskbar and a title bar draw it at. At the right, laid out as the theme
 * editor is (theme-editor.js, whose pieces these are):
 *
 *   – the themes to put on it: Main — the logo Nebula comes with — and the
 *     other fixed themes, the ready profiles and the saved ones of Your own
 *     theme, then the logo's own themes, each with a ×, and a + that keeps the
 *     colours on the logo now under a name. (The test build has a logo of its
 *     own, and offers it first as "Nebula's own"; no other build does.)
 *   – the five slots, each with its colour in a box; the long bar of the
 *     chosen slot's colour, which opens every colour there is, and its code;
 *     and the ready colours.
 *
 * A colour changed on a logo theme changes that theme. Changed on anything
 * else — a fixed theme, a profile — it makes a new logo theme, named after
 * what it was made from ("Contrast 2"), and the changes after it go there:
 * what the app comes with is never written over.
 *
 * Every pick is drawn at once and, a moment later, worn: the pictures are
 * made here, in each size an icon holds, and handed to the main process
 * (electron/app-logo.js), which keeps them and puts them on the window, the
 * taskbar and the shortcuts. Back at the logo the build came with nothing is
 * kept. The mark in the app's own title strip is not touched: it is drawn in
 * the theme's accent, as every icon of the app is.
 *
 * A picture of the user's own can stand in for the drawn logo (1.0.3,
 * logo-crop.js): cut here, worn the same way. Picking a theme or a colour
 * takes it off, but it is kept, first among the themes as "My picture", to be
 * put on again ("use a picture of mine kaydedilmiyor"); Remove the picture
 * removes it for good.
 *
 * In the test build Nebula's own is worn as any other theme is, drawn and
 * kept (the owner: "teste özel Nebula's own … güncellemiyor, diğerleri
 * güncelliyor"): taken back to the program's own icon, Windows kept drawing
 * the last logo it had for the portable file's shortcuts and taskbar button.
 */

import { t } from './i18n.js';
import { cropLogoPicture } from './logo-crop.js';
import { askText } from './dialog.js';
import { icon } from './icons.js';
import { SWATCHES, cleanHex, luminance } from './theme-custom.js';
import { readReadyProfiles, readProfiles } from './theme-editor.js';
import {
  LOGO_SLOTS, LOGO_SIZES, OWN_LOGO, FIXED_THEMES, cleanLogo, sameLogo, logoFromTheme, logoDataUrl,
  cleanLogoThemes, saveLogoTheme, renameLogoTheme, nextLogoName,
} from './logo.js';

/** What each slot paints, in the editor's words. */
const SLOT_LABELS = { bg: 'Background', edge: 'Border', moon: 'Moon', shade: 'Moon’s shade', star: 'Star' };
/** The fixed themes, under the names the theme row gives them. Main's logo is the one Nebula comes with. */
const FIXED_NAMES = { main: 'Main', dark: 'Dark', light: 'Light', white: 'White' };
/** The logo's own themes, kept on this computer. */
const THEMES_KEY = 'nebula:logo-themes';
/** Which of them the colours on the logo belong to, across a start of the app. */
const EDITING_KEY = 'nebula:logo-theme';
/** The name the user gave the kept picture ("my picture de double click to rename olsun"); none: My picture. */
const PICTURE_NAME_KEY = 'nebula:logo-picture-name';
const PICTURE_NAME_MAX = 40;
const pictureName = () => { try { return localStorage.getItem(PICTURE_NAME_KEY) || null; } catch { return null; } };
function setPictureName(name) {
  try { if (name) localStorage.setItem(PICTURE_NAME_KEY, name); else localStorage.removeItem(PICTURE_NAME_KEY); } catch { /* not kept */ }
}
const WEAR_AFTER_MS = 350;

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const toast = (text) => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: text }));

/** The logo as PNG pictures, one for each size an icon holds: size → data address. */
export async function logoPictures(colors) {
  const out = {};
  for (const size of LOGO_SIZES) {
    const image = new Image();
    image.src = logoDataUrl(colors, size);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(image, 0, 0, size, size);
    out[size] = canvas.toDataURL('image/png');
  }
  return out;
}

/**
 * @param {{host: HTMLElement}} deps where it is drawn
 * @returns {{refresh: () => Promise<void>}|null}
 */
export function initLogoEditor({ host }) {
  if (!host) return null;
  const api = window.nebula?.logo ?? null;

  /** The logo this build came with, and whether it is the test build's. */
  let own = OWN_LOGO.main;
  let isTest = false;
  /** The colours on the logo now. */
  let draft = { ...own };
  /** The user's own picture on the logo, as an address, or null when the colours are drawn. */
  let picture = null;
  /** The user's own picture kept for later, as an address (256 px), or null. */
  let kept = null;
  let active = 0;
  /** The logo theme those colours belong to — a change is kept there — or null. */
  let editing = null;
  /** A logo theme about to be deleted: its question is shown in the chips' place. */
  let asking = null;
  let timer = 0;
  /** The last thing asked of the main process, so an older answer is not taken for a newer one. */
  let asked = 0;

  /** What the editor offers that is not the logo's own: [name, colours, whether the name is the app's word]. */
  function offered() {
    const list = [];
    if (isTest) list.push(['Nebula’s own', own, true]);
    for (const [id, colors] of Object.entries(FIXED_THEMES)) list.push([FIXED_NAMES[id], id === 'main' ? OWN_LOGO.main : logoFromTheme(colors), true]);
    const ready = readReadyProfiles();
    for (const profile of [...ready, ...readProfiles(ready)]) list.push([profile.name, logoFromTheme(profile.colors), false]);
    return list;
  }
  /** Names a logo theme cannot take: what is offered, in English and as it is shown. */
  const reserved = () => offered().flatMap(([name, , ours]) => (ours ? [name, t(name)] : [name]));
  function readThemes() {
    try { return cleanLogoThemes(JSON.parse(localStorage.getItem(THEMES_KEY) || '[]'), reserved()); } catch { return []; }
  }
  function keep(list) {
    themes = list;
    try {
      localStorage.setItem(THEMES_KEY, JSON.stringify(themes));
      if (editing) localStorage.setItem(EDITING_KEY, editing); else localStorage.removeItem(EDITING_KEY);
    } catch { /* this session only */ }
  }
  let themes = [];

  // ---- built once ------------------------------------------------------------
  const side = el('div', 'logo-side');
  const big = el('img', 'logo-big');
  big.alt = 'Logo';
  const smalls = el('div', 'logo-smalls');
  const mid = el('img', 'logo-mid');
  const tiny = el('img', 'logo-tiny');
  for (const img of [mid, tiny]) img.alt = '';
  smalls.append(mid, tiny);
  side.append(big, smalls);

  const tools = el('div', 'logo-tools');
  const themesLabel = el('div', 'te-label', 'Put a theme on it');
  const themesEl = el('div', 'te-profiles logo-themes');
  const slotsEl = el('div', 'te-slots');
  const bar = el('label', 'te-bar');
  bar.title = 'Any colour';
  const wheel = el('input');
  wheel.type = 'color';
  wheel.setAttribute('aria-label', 'Any colour');
  const barCode = el('span', 'te-bar__code');
  barCode.dataset.noI18n = '';
  bar.append(wheel, barCode);
  const hexInput = el('input', 'te-hex');
  hexInput.type = 'text';
  hexInput.maxLength = 7;
  hexInput.placeholder = '#RRGGBB';
  hexInput.setAttribute('aria-label', 'Colour code');
  hexInput.autocomplete = 'off';
  hexInput.spellcheck = false;
  const barRow = el('div', 'te-bar-row');
  barRow.append(bar, hexInput);
  const grid = el('div', 'te-swatches');
  const pictureRow = el('div', 'set-buttons');
  const pictureFile = el('input');
  pictureFile.type = 'file';
  pictureFile.accept = 'image/*';
  pictureFile.id = 'logo-picture-file';
  pictureFile.hidden = true;
  const pictureChoose = el('button', 'btn', 'Use a picture of mine');
  pictureChoose.type = 'button';
  pictureChoose.id = 'logo-picture-choose';
  const pictureRemove = el('button', 'btn', 'Remove the picture');
  pictureRemove.type = 'button';
  pictureRemove.id = 'logo-picture-remove';
  pictureRow.append(pictureChoose, pictureRemove, pictureFile);
  tools.append(pictureRow, themesLabel, themesEl, slotsEl, barRow, grid);

  const editor = el('div', 'logo-editor');
  editor.id = 'logo-editor';
  editor.append(side, tools);
  const hint = el('p', 'set-hint', api
    ? 'It is worn by this window, the taskbar and the shortcuts that start Nebula — on the desktop, in the Start menu, pinned to the taskbar. A program file itself keeps the icon it was built with: a shortcut to it wears the logo.'
    : 'The logo is worn in the desktop app.');
  // For a desktop that has the program file on it and no shortcut: one is made, wearing the logo.
  const shortcut = el('button', 'btn logo-shortcut', 'Put a shortcut on the desktop');
  shortcut.type = 'button';
  shortcut.hidden = true;
  shortcut.addEventListener('click', async () => {
    shortcut.disabled = true;
    const res = await api.shortcut().catch(() => null);
    shortcut.disabled = false;
    toast(!res?.ok ? (res?.error === 'exists' ? 'Another shortcut of that name is on the desktop' : 'The shortcut could not be made')
      : res.made ? 'A shortcut with the logo is on the desktop' : 'The shortcut on the desktop wears the logo');
  });
  host.replaceChildren(editor, hint, shortcut);

  const slotButtons = LOGO_SLOTS.map((slot, i) => {
    const row = el('button', 'te-slot');
    row.type = 'button';
    row.dataset.slot = slot;
    row.append(el('span', 'te-slot__name', SLOT_LABELS[slot]), el('span', 'te-slot__box'));
    row.addEventListener('click', () => { active = i; paint(); });
    slotsEl.append(row);
    return row;
  });
  const swatchButtons = SWATCHES.map((hex) => {
    const cell = el('button', 'te-swatch');
    cell.type = 'button';
    cell.dataset.hex = hex;
    cell.title = hex;
    cell.setAttribute('aria-label', hex);
    cell.style.background = hex;
    cell.addEventListener('click', () => setColor(hex));
    grid.append(cell);
    return cell;
  });

  // ---- the themes ----------------------------------------------------------------
  /** The name of what the colours on the logo are, as it is shown: the logo theme being changed, or the first offered one of those colours. */
  function wornName() {
    if (editing && themes.some((x) => x.name === editing)) return editing;
    const hit = offered().find(([, colors]) => sameLogo(colors, draft));
    if (hit) return hit[2] ? t(hit[0]) : hit[0];
    return themes.find((x) => sameLogo(x.colors, draft))?.name ?? null;
  }

  function paintThemes() {
    themesEl.replaceChildren();
    if (asking) {
      const q = el('p', 'te-ask', t(`Delete the profile ${asking}?`));
      const yes = el('button', 'te-chip te-chip--danger', 'Delete');
      yes.type = 'button';
      yes.addEventListener('click', () => {
        if (editing === asking) editing = null;
        keep(themes.filter((x) => x.name !== asking));
        asking = null;
        paintThemes();
      });
      const no = el('button', 'te-chip', 'Cancel');
      no.type = 'button';
      no.addEventListener('click', () => { asking = null; paintThemes(); });
      themesEl.append(q, yes, no);
      return;
    }
    const mine = editing && themes.some((x) => x.name === editing) ? editing : null;
    let lit = false;
    if (kept) {
      const b = el('button', `te-chip logo-mine${picture ? ' on' : ''}`);
      b.type = 'button';
      b.dataset.logoTheme = 'picture';
      const thumb = el('img', 'logo-mine__img');
      thumb.alt = '';
      thumb.src = kept;
      const named = pictureName();
      const label = el('span', '', named ?? 'My picture');
      if (named) label.dataset.noI18n = '';       // the user's own word
      b.title = t('Double-click to rename');
      b.append(thumb, label);
      b.addEventListener('click', () => { void wearKept(); });
      b.addEventListener('dblclick', () => { void renamePicture(); });
      themesEl.append(b);
    }
    for (const [name, colors, ours] of offered()) {
      const on = !picture && !mine && !lit && sameLogo(colors, draft);
      lit ||= on;
      const b = el('button', `te-chip${on ? ' on' : ''}`, name);
      b.type = 'button';
      b.dataset.logoTheme = name;
      if (!ours) b.dataset.noI18n = '';          // a profile's name is its maker's word
      b.addEventListener('click', () => { draft = cleanLogo(colors, own); editing = null; keep(themes); wear(); });
      themesEl.append(b);
    }
    for (const theme of themes) {
      const on = !picture && (mine ? mine === theme.name : (!lit && sameLogo(theme.colors, draft)));
      lit ||= on;
      const wrap = el('span', `te-chip logo-theme${on ? ' on' : ''}`);
      wrap.dataset.logoTheme = theme.name;
      const pick = el('button', 'te-chip__name', theme.name);
      pick.type = 'button';
      pick.dataset.noI18n = '';
      pick.title = t('Double-click to rename');
      pick.style.setProperty('--dot', theme.colors.moon);
      pick.style.setProperty('--dot-bg', theme.colors.bg);
      pick.addEventListener('click', () => { draft = { ...theme.colors }; editing = theme.name; keep(themes); wear(); });
      pick.addEventListener('dblclick', () => { void rename(theme.name); });
      const x = el('button', 'te-chip__x', '×');
      x.type = 'button';
      x.title = 'Delete this profile';
      x.setAttribute('aria-label', 'Delete this profile');
      x.addEventListener('click', () => { asking = theme.name; paintThemes(); });
      wrap.append(pick, x);
      themesEl.append(wrap);
    }
    // The colours on the logo now, kept under a name: a theme that is the logo's alone.
    const add = el('button', 'te-chip logo-add', '+');
    add.type = 'button';
    add.title = 'Add a logo theme';
    add.setAttribute('aria-label', 'Add a logo theme');
    add.addEventListener('click', () => { void addTheme(); });
    themesEl.append(add);
  }

  const taken = () => [...reserved(), ...themes.map((x) => x.name)];

  async function addTheme() {
    const name = await askText(t('Name of the logo theme:'), nextLogoName(wornName() ?? t('Logo'), taken()));
    if (name === null) return;
    const res = saveLogoTheme(themes, name, draft, reserved());
    if (res.error || themes.some((x) => x.name.toLowerCase() === String(name).trim().toLowerCase())) {
      toast(res.error === 'name' ? 'Give the logo theme a name' : 'That name is taken — give it another');
      return;
    }
    editing = res.themes.at(-1).name;
    keep(res.themes);
    paint();
  }

  /** The kept picture's name; left empty, it is My picture again. */
  async function renamePicture() {
    const to = await askText(t('Name of the picture:'), pictureName() ?? t('My picture'));
    if (to === null) return;
    const name = to.trim().slice(0, PICTURE_NAME_MAX);
    setPictureName(name && name !== t('My picture') ? name : null);
    paint();
  }

  async function rename(from) {
    const to = await askText(t('Name of the logo theme:'), from);
    if (to === null) return;
    const res = renameLogoTheme(themes, from, to, reserved());
    if (res.error) { toast(res.error === 'name' ? 'Give the logo theme a name' : 'That name is taken — give it another'); return; }
    if (editing === from) editing = res.name;
    keep(res.themes);
    paint();
  }

  // ---- painting ----------------------------------------------------------------
  function paint() {
    big.src = picture ?? logoDataUrl(draft, 256);
    mid.src = picture ?? logoDataUrl(draft, 32);
    tiny.src = picture ?? logoDataUrl(draft, 16);
    pictureRemove.hidden = !picture && !kept;
    LOGO_SLOTS.forEach((slot, i) => {
      slotButtons[i].classList.toggle('on', i === active);
      slotButtons[i].setAttribute('aria-pressed', String(i === active));
      slotButtons[i].querySelector('.te-slot__box').style.background = draft[slot];
    });
    const hex = draft[LOGO_SLOTS[active]];
    bar.style.background = hex;
    barCode.style.color = luminance(hex) > 0.45 ? '#000000' : '#FFFFFF';
    barCode.textContent = hex;
    wheel.value = hex.toLowerCase();
    if (document.activeElement !== hexInput) hexInput.value = hex;
    for (const cell of swatchButtons) cell.classList.toggle('on', cell.dataset.hex === hex);
    paintThemes();
    paintTitle();
  }

  /**
   * The logo at the left of the title bar wears what the taskbar wears (the
   * owner's Bug Find note: a theme or a picture put on the logo left it as it
   * was). The logo the build came with stays the drawn one, in the theme's accent.
   */
  const titleLogo = document.getElementById('tb-logo');
  function paintTitle() {
    if (!titleLogo) return;
    const worn = picture ?? (sameLogo(draft, own) ? null : logoDataUrl(draft, 64));
    const img = titleLogo.querySelector('img.tb-logo__img');
    if (!worn) {
      if (img) titleLogo.innerHTML = icon('logo');
      return;
    }
    if (img) { img.src = worn; return; }
    const pic = el('img', 'tb-logo__img');
    pic.alt = '';
    pic.src = worn;
    titleLogo.replaceChildren(pic);
  }

  /** Drawn now; worn a moment later, so a colour pulled across the wheel is not written at every step. */
  function wear() {
    picture = null;
    paint();
    if (!api) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void send(); }, WEAR_AFTER_MS);
  }

  /** @param {Record<string, string>|null} [pictures] the user's own picture, cut; otherwise the colours are drawn */
  async function send(pictures = null) {
    const mine = ++asked;
    const colors = { ...draft };
    try {
      // The logo the build came with is the icon it has already: nothing of a logo is kept then —
      // but for the test build's, which is worn as the others are (see the head of this file).
      const res = pictures ? await api.set(colors, pictures, true)
        : sameLogo(colors, own) && !isTest ? await api.clear() : await api.set(colors, await logoPictures(colors));
      if (mine === asked && !res?.ok) toast('The logo could not be changed');
    } catch {
      if (mine === asked) toast('The logo could not be changed');
    }
  }

  pictureChoose.addEventListener('click', () => pictureFile.click());
  pictureFile.addEventListener('change', async () => {
    const file = pictureFile.files?.[0];
    pictureFile.value = '';
    if (!file) return;
    const pictures = await cropLogoPicture(file);
    if (!pictures) return;
    clearTimeout(timer);
    picture = pictures[256];
    kept = picture;
    paint();
    if (api) void send(pictures);
  });
  /** The kept picture put on again. */
  async function wearKept() {
    if (!kept || picture) return;
    clearTimeout(timer);
    const mine = ++asked;
    picture = kept;
    paint();
    if (!api) return;
    const res = await api.wearPicture({ ...draft }).catch(() => null);
    if (mine === asked && !res?.ok) toast('The logo could not be changed');
  }
  // Removed for good: the kept picture goes, and the logo is drawn in its colours again.
  pictureRemove.addEventListener('click', () => {
    kept = null;
    setPictureName(null);
    if (api) void api.forgetPicture().catch(() => null);
    wear();
  });

  /**
   * A colour for the chosen slot. On a logo theme, that theme changes; on
   * anything else a new logo theme is made of it, named after what it was.
   */
  function setColor(raw) {
    const hex = cleanHex(raw);
    if (!hex || draft[LOGO_SLOTS[active]] === hex) return;
    const was = wornName();
    draft[LOGO_SLOTS[active]] = hex;
    if (editing && themes.some((x) => x.name === editing)) {
      keep(themes.map((x) => (x.name === editing ? { ...x, colors: { ...draft } } : x)));
    } else {
      editing = nextLogoName(was ?? t('Logo'), taken());
      keep([...themes, { name: editing, colors: { ...draft } }]);
    }
    wear();
  }
  wheel.addEventListener('input', () => setColor(wheel.value));
  hexInput.addEventListener('input', () => setColor(hexInput.value));
  hexInput.addEventListener('blur', () => { hexInput.value = draft[LOGO_SLOTS[active]]; });
  hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hexInput.blur(); } });

  /** What the app wears now, asked of the main process: when the sheet opens. */
  async function refresh() {
    if (api) {
      try {
        const res = await api.get();
        if (res?.ok) {
          isTest = res.own === 'test';
          own = isTest ? OWN_LOGO.test : OWN_LOGO.main;
          draft = cleanLogo(res.colors ?? own, own);
          picture = res.picture ?? null;
          kept = res.kept ?? null;
          shortcut.hidden = !res.shortcuts;
        }
      } catch { /* as it was */ }
    }
    themes = readThemes();
    // The logo theme the colours were last changed on, if they are still its colours.
    let last = null;
    try { last = localStorage.getItem(EDITING_KEY); } catch { /* none */ }
    const mine = themes.find((x) => x.name === last);
    editing = mine && sameLogo(mine.colors, draft) ? mine.name : null;
    asking = null;
    paint();
  }
  paint();
  if (api) void refresh();

  return { refresh, pending: () => asked };
}
