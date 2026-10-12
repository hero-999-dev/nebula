/**
 * Four themes: main (violet, the default), dark, light, and white — plain
 * white, so a note can be checked against what it will look like on A4. And a
 * fifth that is the reader's own (0.9.4): five picked colours, worn as inline
 * tokens over the fixed theme of the same tone (theme-custom.js makes the
 * tokens, theme-editor.js is where they are picked).
 *
 * `main` is also what bare `:root` carries in tokens.css, so the app is already
 * the right colour before this module runs — nothing flashes while localStorage
 * is read. Only a non-default choice needs the attribute set.
 */

import { emit } from './bus.js';
import { MATCHA, cleanColors, cleanProfileName, deriveTokens, toneOf } from './theme-custom.js';

const KEY = 'nebula:theme';
const CUSTOM_KEY = 'nebula:theme-custom';
export const THEMES = ['main', 'dark', 'light', 'white'];
export const CUSTOM = 'custom';
const DEFAULT = 'main';

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    // Matcha was a fixed theme in the 0.9.4 test builds; it is the ready
    // profile of the custom theme now.
    if (saved === 'matcha') return CUSTOM;
    return THEMES.includes(saved) || saved === CUSTOM ? saved : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** The custom theme as it was last worn: `{ name, colors }`; Matcha when there is none. */
export function readCustom() {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null');
    if (raw && typeof raw === 'object') return { name: cleanProfileName(raw.name), colors: cleanColors(raw.colors) };
  } catch { /* a damaged setting: Matcha */ }
  return { name: MATCHA.name, colors: { ...MATCHA.colors } };
}

const root = () => document.documentElement;
/** The inline tokens a custom theme has set, so they can be taken off again. */
let worn = [];

function wear(colors) {
  const tokens = deriveTokens(colors);
  // The fixed theme of the same tone underneath: its note colours, and every
  // rule the stylesheet writes for "a light theme" or "a dark one", apply.
  root().dataset.theme = toneOf(colors) === 'light' ? 'light' : 'main';
  root().dataset.profile = CUSTOM;
  for (const name of worn) if (!(name in tokens)) root().style.removeProperty(name);
  for (const [name, value] of Object.entries(tokens)) root().style.setProperty(name, value);
  worn = Object.keys(tokens);
}

function unwear() {
  for (const name of worn) root().style.removeProperty(name);
  worn = [];
  delete root().dataset.profile;
}

/**
 * The remembered theme, worn now — before the app has started, for a screen
 * that stands there meanwhile (the lock on opening, app-lock.js).
 */
export function wearStoredTheme() {
  const theme = read();
  if (theme === CUSTOM) wear(readCustom().colors);
  else { unwear(); root().dataset.theme = theme; }
}

/**
 * @param {HTMLElement|null} group container holding one [data-theme] button per theme
 * @param {{customButton?: HTMLElement|null}} [opts] the button that opens the reader's own theme
 */
export function initTheme(group, { customButton = null } = {}) {
  const buttons = group ? [...group.querySelectorAll('[data-theme]')] : [];
  let current = DEFAULT;

  function paint() {
    for (const btn of buttons) {
      const on = current !== CUSTOM && btn.dataset.theme === current;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    customButton?.classList.toggle('on', current === CUSTOM);
    // Anything that has READ a token rather than referencing it has to repaint —
    // the toolbar's colour bars sample the palette to show what they will apply.
    emit('theme-changed', { theme: current });
  }

  function apply(theme) {
    current = theme;
    if (theme === CUSTOM) {
      wear(readCustom().colors);
    } else {
      unwear();
      root().dataset.theme = theme;
    }
    paint();
  }

  const remember = (theme) => { try { localStorage.setItem(KEY, theme); } catch { /* private mode: this session only */ } };

  apply(read());

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      if (!THEMES.includes(theme)) return;
      apply(theme);
      remember(theme);
    });
  }

  return {
    current: () => current,
    custom: readCustom,
    /**
     * Wear these five colours now, and keep them as the custom theme — every
     * change in the editor comes through here, so the app is the preview.
     */
    wearCustom({ name = '', colors }) {
      const clean = { name: cleanProfileName(name), colors: cleanColors(colors) };
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(clean)); } catch { /* this session only */ }
      current = CUSTOM;
      wear(clean.colors);
      remember(CUSTOM);
      paint();
      return clean;
    },
    set(theme) {
      if (!THEMES.includes(theme) && theme !== CUSTOM) return;
      apply(theme);
      remember(theme);
    },
  };
}

export function getTheme() {
  return read();
}
