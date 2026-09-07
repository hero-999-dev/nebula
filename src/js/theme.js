/**
 * Four themes: main (violet, the default), dark, light, and white — plain
 * white, so a note can be checked against what it will look like on A4.
 *
 * `main` is also what bare `:root` carries in tokens.css, so the app is already
 * the right colour before this module runs — nothing flashes while localStorage
 * is read. Only a non-default choice needs the attribute set.
 */

import { emit } from './bus.js';

const KEY = 'nebula:theme';
export const THEMES = ['main', 'dark', 'light', 'white'];
const DEFAULT = 'main';

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.includes(saved) ? saved : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function apply(theme, buttons) {
  document.documentElement.dataset.theme = theme;
  for (const btn of buttons ?? []) {
    btn.classList.toggle('on', btn.dataset.theme === theme);
    btn.setAttribute('aria-pressed', String(btn.dataset.theme === theme));
  }
  // Anything that has READ a token rather than referencing it has to repaint —
  // the toolbar's colour bars sample the palette to show what they will apply.
  emit('theme-changed', { theme });
}

/**
 * @param {HTMLElement|null} group container holding one [data-theme] button per theme
 */
export function initTheme(group) {
  const buttons = group ? [...group.querySelectorAll('[data-theme]')] : [];
  apply(read(), buttons);

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      if (!THEMES.includes(theme)) return;
      apply(theme, buttons);
      try { localStorage.setItem(KEY, theme); } catch { /* private mode: this session only */ }
    });
  }
}

export function getTheme() {
  return read();
}
