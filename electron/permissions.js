/**
 * What a web page inside the app may have without being asked (hunt B22).
 *
 * The list used to be set on the default session only — the app's own window.
 * Every embed in a note (persist:embed) and every AI tab (persist:ai-<id>) has
 * a session of its own, and a session with no handler grants everything: a
 * page embedded in a note had the microphone, read the clipboard (a password
 * copied a moment ago) and could ask for the location, all without a word.
 */
import { externalUrl } from './navigation.js';
import { words } from './dialog-words.js';

/** Any page: a video player's full screen, a game's pointer, a Copy button. */
export const WEB_PAGE = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write']);
/** A chat tab, and the app's own window: a voice prompt, a reply's notification. */
export const CHAT = new Set([...WEB_PAGE, 'media', 'notifications']);

/**
 * @param {string} permission Electron's name for it
 * @param {{chat?: boolean, externalURL?: string}} [where] chat: an AI tab or the
 *   app's window; externalURL: what an `openExternal` request would hand Windows
 */
export function allowed(permission, { chat = false, externalURL = '' } = {}) {
  if (permission === 'openExternal') return !!externalUrl(externalURL);
  return (chat ? CHAT : WEB_PAGE).has(permission);
}

/** An AI tab's session, by where it keeps its files: <userData>/Partitions/ai-<id>. */
export function isChatSession(storagePath) {
  return /[\\/]Partitions[\\/]ai-[^\\/]+[\\/]?$/i.test(String(storagePath ?? ''));
}

/**
 * What a page embedded in a note may ASK for (owner, 2026-10-16): the
 * microphone or camera, and notifications. Nebula asks the person; with no
 * "Allow" the page has nothing. The answer is never saved — it lasts while
 * that page is open, and a reload, another page or the note opened again asks
 * anew (hunt B25).
 */
export const ASK_EMBED = new Set(['media', 'notifications']);

/** A press in the page this long ago may still be what made it ask. */
export const PRESS_MS = 5000;

/** The embed session, by where it keeps its files: <userData>/Partitions/embed. */
export function isEmbedSession(storagePath) {
  return /[\\/]Partitions[\\/]embed[\\/]?$/i.test(String(storagePath ?? ''));
}

const originOf = (url) => {
  try { const o = new URL(String(url ?? '')).origin; return o && o !== 'null' ? o : ''; } catch { return ''; }
};

/**
 * What one request is about, one key per thing the person can say yes to:
 * the microphone and the camera are separate answers.
 * @returns {string[]} empty when it is nothing to ask about
 */
export function askKeys(permission, { url = '', mediaTypes } = {}) {
  const origin = originOf(url);
  if (!origin || !ASK_EMBED.has(permission)) return [];
  if (permission !== 'media') return [`${origin} ${permission}`];
  const types = (Array.isArray(mediaTypes) ? mediaTypes : []).filter((t) => t === 'audio' || t === 'video');
  return [...new Set(types.length ? types : ['audio', 'video'])].sort().map((t) => `${origin} media:${t}`);
}

/** The same key for a permission CHECK (Electron gives one media type, or 'unknown'). */
export function checkKey(permission, { origin = '', mediaType = '' } = {}) {
  const o = originOf(origin);
  if (!o || !ASK_EMBED.has(permission)) return '';
  if (permission !== 'media') return `${o} ${permission}`;
  return mediaType === 'audio' || mediaType === 'video' ? `${o} media:${mediaType}` : '';
}

/**
 * The answers one open page has been given, in memory only.
 * decide(keys): 'allow' when every key was allowed, 'deny' when one was
 * refused, while another question is open, or when nobody pressed anything in
 * the page just now (a page asking by itself, again and again, gets no
 * question); 'ask' otherwise.
 */
export function pageAnswers(now = Date.now) {
  const answers = new Map();
  let pressedAt = -Infinity;
  let asking = false;
  let load = 0;
  return {
    /** Which page load this is: an answer given to an earlier one is dropped. */
    load() { return load; },
    pressed() { pressedAt = now(); },
    decide(keys) {
      if (!keys.length) return 'deny';
      if (keys.some((k) => answers.get(k) === false)) return 'deny';
      if (keys.every((k) => answers.get(k) === true)) return 'allow';
      if (asking || now() - pressedAt > PRESS_MS) return 'deny';
      return 'ask';
    },
    asking(on) { asking = !!on; },
    answer(keys, yes, forLoad = load) { if (forLoad === load) for (const k of keys) answers.set(k, !!yes); },
    granted(key) { return !!key && answers.get(key) === true; },
    /** A new page or a reload: nothing it was told carries over. */
    reset() { answers.clear(); asking = false; pressedAt = -Infinity; load += 1; },
  };
}

/**
 * The question, in words: which site, and what it wants — in the app's language
 * (dialog-words.js, hunt B26; English when the window is gone). The English
 * sentence is the key; the site fills its {site}.
 */
export function askWords(permission, { url = '', mediaTypes, lang = 'en' } = {}) {
  let site = '';
  try { site = new URL(String(url)).host; } catch { /* named below */ }
  const who = site ? '{site}' : 'A page in this note';   // the WORDS key carries the placeholder
  let key = `${who} wants to show notifications`;
  if (permission === 'media') {
    const kinds = askKeys('media', { url: url || 'https://x', mediaTypes });
    const mic = kinds.some((k) => k.endsWith(':audio'));
    const cam = kinds.some((k) => k.endsWith(':video'));
    key = `${who} wants to ${mic && cam ? 'use your microphone and camera' : cam ? 'use your camera' : 'use your microphone'}`;
  }
  return {
    message: words(key, lang, site ? { site } : {}),
    detail: words('A page embedded in this note is asking. Nothing is remembered: the next time this page opens, it asks again.', lang),
  };
}
