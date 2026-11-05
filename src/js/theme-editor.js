/**
 * The editor of a theme of one's own (0.9.4). Since 1.0.3 it stands open in
 * Settings → Appearance, at the right of the preview, as the logo's editor
 * stands at the right of the logo: no button opens it (the owner: "stil kismini
 * ikonla acma tamamen kalksin"), and the styles' colours are chosen in it too.
 *
 * Laid out after the custom theme screen of the Pixel Pomo app, as the owner
 * asked: a name and "Save this profile" on top; the profiles to start from
 * (Matcha and Contrast come with the app, and can be deleted like any other —
 * and brought back); the five slots, each with its colour in a box —
 * a press chooses the slot; the long bar of the chosen slot's colour with its
 * code, which opens every colour there is; and the ready colours under it.
 *
 * The app is the preview: every pick is worn at once (theme.js wearCustom),
 * so nothing here draws a sample of its own.
 */

import { on } from './bus.js';
import { t } from './i18n.js';
import {
  SLOTS, SWATCHES, READY_PROFILES, readyProfiles, cleanHex, cleanColors, cleanProfiles, cleanProfileName,
  saveProfile, profileOf, hardToRead, luminance,
} from './theme-custom.js';

const PROFILES_KEY = 'nebula:theme-profiles';
/** The names of the ready profiles the reader deleted (0.9.4). */
const REMOVED_KEY = 'nebula:theme-ready-removed';

/** What each slot paints, in the editor's words. */
const SLOT_LABELS = {
  bg: 'Background',
  dark: 'Sidebar and darkest tone',
  lines: 'Lines',
  accent: 'Accent',
  text: 'Text',
};

const TOKEN_OF = { bg: '--paper', dark: '--paper-sunken', lines: '--rule', accent: '--clay', text: '--ink' };

/** The ready profiles that are still there. */
export function readReadyProfiles() {
  try {
    const gone = JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]');
    return readyProfiles(Array.isArray(gone) ? gone : []);
  } catch { return readyProfiles(); }
}
function writeRemoved(ready) {
  const gone = READY_PROFILES.filter((p) => !ready.includes(p)).map((p) => p.name);
  try { localStorage.setItem(REMOVED_KEY, JSON.stringify(gone)); } catch { /* this session only */ }
}
/** The profiles the reader saved. */
export function readProfiles(ready = readReadyProfiles()) {
  try { return cleanProfiles(JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'), ready); } catch { return []; }
}
function writeProfiles(list) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch { /* this session only */ }
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * @param {object} deps
 * @param {HTMLElement} deps.panel the container, in Settings → Appearance
 * @param {ReturnType<import('./theme.js').initTheme>} deps.theme
 */
export function initThemeEditor({ panel, theme }) {
  if (!panel || !theme) return null;

  let ready = readReadyProfiles();
  let profiles = readProfiles(ready);
  /** What is being edited: a name and five colours. */
  let draft = { name: '', colors: cleanColors(theme.custom().colors) };
  let active = 0;
  /** A saved profile about to be deleted: its question is shown in the list's place. */
  let asking = null;

  const toast = (text) => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: text }));

  // ---- the panel, built once -------------------------------------------------
  panel.replaceChildren();
  panel.hidden = false;

  const saveRow = el('div', 'te-save');
  const nameInput = el('input', 'te-name');
  nameInput.type = 'text';
  nameInput.maxLength = 32;
  nameInput.placeholder = 'Profile name';
  nameInput.setAttribute('aria-label', 'Profile name');
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  const saveBtn = el('button', 'btn primary te-save-btn', 'Save this profile');
  saveBtn.type = 'button';
  saveRow.append(nameInput, saveBtn);

  const profilesLabel = el('div', 'te-label', 'Profiles');
  const profilesEl = el('div', 'te-profiles');

  const slotsLabel = el('div', 'te-label', 'Theme colours');
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
  const hint = el('p', 'te-hint', 'Press the bar for any colour, or type a code.');
  const grid = el('div', 'te-swatches');
  const warn = el('p', 'te-warn', 'These words are hard to read on this ground.');
  warn.hidden = true;
  // A second set of colours the same bar and swatches choose (1.0.3: the
  // background's styles, `useColorSet`), and the colours of a chosen photo.
  const extraLabel = el('div', 'te-label te-extra-label');
  const extraEl = el('div', 'te-extra');
  const offersLabel = el('div', 'te-label te-offers-label', 'Colours inspired by your picture');
  const offersEl = el('div', 'te-offers');
  extraLabel.hidden = extraEl.hidden = offersLabel.hidden = offersEl.hidden = true;

  // What is chosen on one side, what it is chosen from on the other (1.0.3, the
  // owner: "renk seçme panelini style colours'un sağına alınsın"); one column where there is no room.
  const sets = el('div', 'te-pick__sets');
  sets.append(slotsLabel, slotsEl);
  const choose = el('div', 'te-pick__colors');
  // Headed as the side beside it is, level with it (the owner: "color picker başlığı ekle theme colours'un header'ı ile aynı hizaya").
  const chooseLabel = el('div', 'te-label te-pick-label', 'Colour picker');
  choose.append(chooseLabel, barRow, hint, grid);
  // A row of their own under both, so the photo's colours are headed level with
  // the style's (the owner, 2026-11-04: "from your picture headeri style colours ile aynı hizaya gelsin").
  const extraBox = el('div', 'te-pick__extra');
  extraBox.append(extraLabel, extraEl);
  const offersBox = el('div', 'te-pick__offers');
  offersBox.append(offersLabel, offersEl);
  const pickEl = el('div', 'te-pick');
  pickEl.append(sets, choose, extraBox, offersBox);
  panel.append(profilesLabel, profilesEl, saveRow, pickEl, warn);
  /**
   * @type {null | { label: string, colors: () => string[], pick: (i: number, hex: string) => void,
   *   add?: () => void, remove?: (i: number) => void, canAdd?: () => boolean, canRemove?: () => boolean,
   *   offers?: () => string[], most?: number }}
   */
  let extra = null;
  /** The slot being chosen: a theme slot's index, or `{ x: i }` for a colour of the second set. */
  const isExtra = () => typeof active === 'object' && active !== null;

  // ---- painting ----------------------------------------------------------------
  const slotButtons = SLOTS.map((slot, i) => {
    const row = el('button', 'te-slot');
    row.type = 'button';
    row.dataset.slot = slot;
    const label = el('span', 'te-slot__name', SLOT_LABELS[slot]);
    const box = el('span', 'te-slot__box');
    row.append(label, box);
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

  function paintProfiles() {
    profilesEl.replaceChildren();
    if (asking) {
      const q = el('p', 'te-ask', t(`Delete the profile ${asking}?`));
      const yes = el('button', 'te-chip te-chip--danger', 'Delete');
      yes.type = 'button';
      yes.addEventListener('click', () => {
        // A ready one is remembered as deleted; a saved one leaves the list.
        if (ready.some((p) => p.name === asking)) {
          ready = ready.filter((p) => p.name !== asking);
          writeRemoved(ready);
        } else {
          profiles = profiles.filter((p) => p.name !== asking);
          writeProfiles(profiles);
        }
        asking = null;
        paintProfiles();
      });
      const no = el('button', 'te-chip', 'Cancel');
      no.type = 'button';
      no.addEventListener('click', () => { asking = null; paintProfiles(); });
      profilesEl.append(q, yes, no);
      return;
    }
    const worn = theme.current() === 'custom' ? profileOf(draft.colors, profiles, ready) : null;
    const chip = (profile, { removable, lit = worn === profile.name, ours = false, own = false }) => {
      const wrap = el('span', `te-chip${lit ? ' on' : ''}`);
      const pick = el('button', 'te-chip__name', profile.name);
      pick.type = 'button';
      if (!ours) pick.dataset.noI18n = '';      // a profile's name is the reader's word
      pick.style.setProperty('--dot', profile.colors.accent);
      pick.style.setProperty('--dot-bg', profile.colors.bg);
      pick.addEventListener('click', () => {
        draft = { name: ours ? '' : profile.name, colors: { ...profile.colors } };
        // Only a profile the reader saved is saved again under its name.
        nameInput.value = own ? profile.name : '';
        commit();
      });
      wrap.append(pick);
      if (removable) {
        const x = el('button', 'te-chip__x', '×');
        x.type = 'button';
        x.title = 'Delete this profile';
        x.setAttribute('aria-label', 'Delete this profile');
        x.addEventListener('click', () => { asking = profile.name; paintProfiles(); });
        wrap.append(x);
      }
      profilesEl.append(wrap);
    };
    for (const profile of ready) chip(profile, { removable: true });
    for (const profile of profiles) chip(profile, { removable: true, own: true });
    // Colours that were picked and never saved are not lost with a change of
    // theme: they stay one press away until a profile takes their place.
    const last = theme.custom();
    if (!profileOf(last.colors, profiles, ready)) {
      chip({ name: 'Last edited', colors: last.colors }, { removable: false, ours: true, lit: theme.current() === 'custom' && !worn });
    }
    // A ready profile that was deleted is one press from being back.
    if (ready.length < READY_PROFILES.length) {
      const back = el('button', 'te-chip te-chip--back', 'Bring back the ready profiles');
      back.type = 'button';
      back.addEventListener('click', () => {
        ready = [...READY_PROFILES];
        writeRemoved(ready);
        profiles = cleanProfiles(profiles, ready);
        writeProfiles(profiles);
        paintProfiles();
      });
      profilesEl.append(back);
    }
  }

  function paintExtra() {
    extraBox.hidden = extraLabel.hidden = extraEl.hidden = !extra;
    const offers = extra?.offers?.() ?? [];
    offersBox.hidden = offersLabel.hidden = offersEl.hidden = !offers.length;
    offersEl.replaceChildren(...offers.map((hex) => {
      const cell = el('button', 'te-offer');
      cell.type = 'button';
      cell.dataset.hex = hex.toUpperCase();
      cell.title = hex.toUpperCase();
      cell.setAttribute('aria-label', hex.toUpperCase());
      cell.style.background = hex;
      cell.addEventListener('click', () => setColor(hex));
      return cell;
    }));
    if (!extra) return;
    const colors = extra.colors();
    extraLabel.textContent = t(extra.label);
    // How many there are of how many there may be (1.0.3, the owner: "style up to 5 colours desin").
    if (extra.most) {
      const count = el('span', 'te-count', `${colors.length}/${extra.most}`);
      count.dataset.noI18n = '';
      extraLabel.append(' ', count);
    }
    if (isExtra() && active.x >= colors.length) active = { x: colors.length - 1 };
    extraEl.replaceChildren(...colors.map((hex, i) => {
      const wrap = el('span', 'te-dot-wrap');
      const dot = el('button', `te-dot${isExtra() && active.x === i ? ' on' : ''}`);
      dot.type = 'button';
      dot.dataset.x = String(i);
      dot.style.background = hex;
      dot.title = `${t('Colour')} ${i + 1}`;
      dot.setAttribute('aria-label', dot.title);
      dot.setAttribute('aria-pressed', String(isExtra() && active.x === i));
      dot.addEventListener('click', () => { active = { x: i }; paint(); });
      wrap.append(dot);
      if (extra.remove && extra.canRemove?.()) {
        const x = el('button', 'te-dot__x', '×');
        x.type = 'button';
        x.title = t('Remove this colour');
        x.setAttribute('aria-label', x.title);
        x.addEventListener('click', () => {
          extra.remove(i);
          if (isExtra() && active.x >= i && active.x > 0) active = { x: active.x - 1 };
          paint();
        });
        wrap.append(x);
      }
      return wrap;
    }));
    if (extra.add && extra.canAdd?.()) {
      const plus = el('button', 'te-dot-add', '+');
      plus.type = 'button';
      plus.title = t('Add a colour');
      plus.setAttribute('aria-label', plus.title);
      plus.addEventListener('click', () => { extra.add(); active = { x: extra.colors().length - 1 }; paint(); });
      extraEl.append(plus);
    }
  }

  /** The colour of the slot being chosen. */
  const activeHex = () => (isExtra() && extra ? extra.colors()[active.x] : draft.colors[SLOTS[isExtra() ? 0 : active]]).toUpperCase();

  function paint() {
    if (isExtra() && !extra) active = 0;
    SLOTS.forEach((slot, i) => {
      slotButtons[i].classList.toggle('on', i === active);
      slotButtons[i].setAttribute('aria-pressed', String(i === active));
      slotButtons[i].querySelector('.te-slot__box').style.background = draft.colors[slot];
    });
    paintExtra();
    const hex = activeHex();
    bar.style.background = hex;
    // The code is written ON the bar: black or white, whichever reads there.
    barCode.style.color = luminance(hex) > 0.45 ? '#000000' : '#FFFFFF';
    barCode.textContent = hex;
    wheel.value = hex.toLowerCase();
    if (document.activeElement !== hexInput) hexInput.value = hex;
    for (const cell of swatchButtons) cell.classList.toggle('on', cell.dataset.hex === hex);
    warn.hidden = !hardToRead(draft.colors);
    paintProfiles();
  }

  /** The draft is what the app wears, from this moment. */
  function commit() {
    theme.wearCustom(draft);
    paint();
  }

  function setColor(raw) {
    const hex = cleanHex(raw);
    if (!hex || activeHex() === hex) return;
    if (isExtra() && extra) {
      // A style's colour: the theme is left as it is.
      extra.pick(active.x, hex.toLowerCase());
      paint();
      return;
    }
    draft.colors[SLOTS[active]] = hex;
    commit();
  }

  wheel.addEventListener('input', () => setColor(wheel.value));
  hexInput.addEventListener('input', () => setColor(hexInput.value));
  hexInput.addEventListener('blur', () => { hexInput.value = activeHex(); });
  hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hexInput.blur(); } });

  function save() {
    const result = saveProfile(profiles, nameInput.value, draft.colors, ready);
    if (result.error === 'name') {
      toast('Give the profile a name first');
      nameInput.focus();
      return;
    }
    if (result.error === 'ready') {
      toast('That is a ready profile — give yours another name');
      nameInput.focus();
      nameInput.select();
      return;
    }
    profiles = result.profiles;
    writeProfiles(profiles);
    draft.name = cleanProfileName(nameInput.value);
    commit();
    toast('Profile saved');
  }
  saveBtn.addEventListener('click', save);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });

  // ---- what is on screen ----------------------------------------------------------
  /** The five colours the app is wearing now, read from its tokens. */
  function wornColors() {
    const css = getComputedStyle(document.documentElement);
    const picked = {};
    for (const slot of SLOTS) picked[slot] = cleanHex(css.getPropertyValue(TOKEN_OF[slot]));
    return cleanColors(picked);
  }

  /**
   * Starts again from what the app wears, on the slot `at` (Settings opened,
   * a style's colour pressed).
   * @param {number | { x: number }} [at] a theme slot, or `{ x: i }` for a style's colour
   */
  function open(at) {
    // Start from what is on screen, as the Pixel Pomo editor does: the custom
    // theme when it is worn, the fixed theme's own colours when one of those is.
    if (theme.current() === 'custom') {
      const custom = theme.custom();
      draft = { name: custom.name, colors: { ...custom.colors } };
    } else {
      draft = { name: '', colors: wornColors() };
    }
    const saved = profiles.find((p) => p.name === draft.name);
    nameInput.value = saved ? saved.name : '';
    asking = null;
    active = (typeof at === 'number' || (at && extra)) ? at : 0;
    paint();
  }

  // Main, Dark, Light or White pressed: the editor shows that theme's colours
  // (the owner: "hazir temalara bastim, tema organize kismini güncellemiyor").
  on('theme-changed', ({ theme: worn } = {}) => {
    if (worn === 'custom') return;
    draft = { name: '', colors: wornColors() };
    nameInput.value = '';
    asking = null;
    paint();
  });

  open();

  return {
    open,
    /** Give the bar and swatches a second set of colours to choose (null takes it away). */
    useColorSet(set) { extra = set; paint(); },
    /** Paint again: the second set changed from outside. */
    refresh() { paint(); },
  };
}
