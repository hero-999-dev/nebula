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
  /** How much of the picture behind the note shows (1.0.3, backdrop.js), 0.05–1. */
  backdrop: 0.3,
  /** Whether the picture is softened for the screen (1.0.3, backdrop.js): auto (on an external screen), on or off.
   * Never until asked (the owner: "soften for the screen never olsun doğal ayarı"); screen-tip.js says where to ask. */
  smoothScreen: 'off',
  /** What the Clock widget's alarm rings with (1.0.3, alarm-sound.js): off, chime, bell, system:<name>, own or own:<id>. */
  alarmSound: 'chime',
  /** What a Pomodoro rings with when a focus ends, and when a break ends: two sounds, told apart. */
  focusSound: 'chime',
  breakSound: 'bell',
});

/** A sound setting's value, or null for one that is not a sound. Pure — tested. */
export const cleanSound = (v) => (typeof v === 'string' && /^(off|chime|bell|own(:[a-z0-9]{6,24})?|system:[^/\\:*?"<>|]{1,200})$/.test(v) ? v : null);

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
  const backdrop = from.backdrop == null ? NaN : Number(from.backdrop);
  return {
    font: font || null,
    size: Number.isFinite(size) && size >= 6 && size <= 400 ? size : null,
    page: PAGE_MODES.some((m) => m.id === from.page) ? from.page : DEFAULT_PAGE,
    hideAi: from.hideAi === true,
    hideHoles: from.hideHoles === true,
    spell: Array.isArray(from.spell)
      ? SPELL_LANGUAGES.map(([code]) => code).filter((code) => from.spell.includes(code))
      : [...DEFAULT_SETTINGS.spell],
    backdrop: Number.isFinite(backdrop) ? Math.min(1, Math.max(0.05, backdrop)) : DEFAULT_SETTINGS.backdrop,
    smoothScreen: ['auto', 'on', 'off'].includes(from.smoothScreen) ? from.smoothScreen : DEFAULT_SETTINGS.smoothScreen,
    alarmSound: cleanSound(from.alarmSound) ?? DEFAULT_SETTINGS.alarmSound,
    focusSound: cleanSound(from.focusSound) ?? DEFAULT_SETTINGS.focusSound,
    breakSound: cleanSound(from.breakSound) ?? DEFAULT_SETTINGS.breakSound,
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
