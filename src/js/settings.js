/**
 * Settings (0.9.4): what the app is asked to do by default.
 *
 * The owner's Ideas note: "Settings beside Help at the top; pressing it brings
 * the settings up — a default font, a default note size, a default mode,
 * hiding the AI tabs, hiding the black holes entirely, and a PIN or a passkey
 * when the app is opened, as a black hole has."
 *
 * This is the store: one object on this computer, read by whoever needs it
 * (a new note, the dock, the black holes) and written by the Settings sheet
 * (settings-panel.js). The lock on opening is not here — it is the main
 * process's to keep and to enforce (electron/app-lock.js).
 */

import { emit, on } from './bus.js';
import { PAGE_MODES, DEFAULT_PAGE } from './page-mode.js';

const KEY = 'nebula:settings';

/** Nothing chosen: the app as it always was. */
export const DEFAULT_SETTINGS = Object.freeze({
  /** The font a new note is written in: a CSS stack, or null for the app's own serif. */
  font: null,
  /** The size a new note is written in, in px, or null for the app's own. */
  size: null,
  /** The page a new note is made on (page-mode.js): Nebula Wide unless chosen otherwise. */
  page: DEFAULT_PAGE,
  /** The AI panel and its button, put away. */
  hideAi: false,
  /** The black holes — their section, their button, their menu items — put away. */
  hideHoles: false,
  /** The languages the spell checker knows (1.0.0): every language of the app unless one is taken off. */
  spell: Object.freeze(['en', 'de', 'pl', 'tr']),
});

/** The languages the spell checker can be given, in the order Settings shows them. */
export const SPELL_LANGUAGES = [['en', 'English'], ['de', 'Deutsch'], ['pl', 'Polski'], ['tr', 'Türkçe']];

/**
 * Whatever was stored, as settings: every field of a kind and in a range the
 * app can act on, anything else its default. Pure — tested.
 * @param {unknown} raw
 */
export function cleanSettings(raw) {
  const from = raw && typeof raw === 'object' ? raw : {};
  const font = typeof from.font === 'string' ? from.font.replace(/[;{}<>\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  const size = Math.round(Number(from.size));
  return {
    font: font || null,
    size: Number.isFinite(size) && size >= 6 && size <= 400 ? size : null,
    page: PAGE_MODES.some((m) => m.id === from.page) ? from.page : DEFAULT_PAGE,
    hideAi: from.hideAi === true,
    hideHoles: from.hideHoles === true,
    spell: Array.isArray(from.spell)
      ? SPELL_LANGUAGES.map(([code]) => code).filter((code) => from.spell.includes(code))
      : [...DEFAULT_SETTINGS.spell],
  };
}

export function readSettings() {
  try {
    return cleanSettings(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Change some of them; everyone listening for `settings-changed` hears what they are now. */
export function writeSettings(patch) {
  const settings = cleanSettings({ ...readSettings(), ...(patch || {}) });
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* this session only */ }
  emit('settings-changed', { settings });
  return settings;
}

/**
 * What a new note starts with: its writing font (notes.js `setFont`) and its
 * page (`setPage`); null where the app's own is wanted. Pure — tested.
 * @returns {{font: {family?: string, size?: number}|null, page: string|null}}
 */
export function newNoteDefaults(settings = readSettings()) {
  const s = cleanSettings(settings);
  const font = { ...(s.font ? { family: s.font } : {}), ...(s.size ? { size: s.size } : {}) };
  return {
    font: Object.keys(font).length ? font : null,
    page: s.page !== DEFAULT_PAGE ? s.page : null,
  };
}

/**
 * Hands the spell checker the languages ticked in Settings, now and whenever
 * they change (1.0.0). It no longer follows the app's language: every language
 * is checked unless it is taken off.
 */
export function initSpelling() {
  const send = () => { void window.nebula?.spell?.language?.(readSettings().spell)?.catch?.(() => {}); };
  send();
  on('settings-changed', send);
}
