let saveHook = null;

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A store that keeps some keys somewhere better than localStorage (the disk
 * mirror). The hook gets the value itself and, when the caller knows it, which
 * items changed; it returns true when it has taken the value over.
 */
export function setSaveHook(fn) {
  saveHook = fn;
}

/**
 * @param {string} key
 * @param {*} value
 * @param {{changed?: string[]}} [opts] the ids of the notes that changed, when
 *   the caller knows — the mirror then writes those and nothing else.
 */
export function saveJson(key, value, { changed } = {}) {
  let taken = false;
  try {
    taken = saveHook?.(key, value, { changed }) === true;
  } catch { /* disk mirror must not block in-app save */ }
  // With the notes on disk, a second copy of every note in localStorage is
  // pure cost: it was never read back while the vault had files, and writing
  // it on every autosave froze the window for 0.4 s in a vault with two long
  // articles in it (the owner's "Nebula Test is slower", 0.9.3).
  if (taken) return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function generateId(prefix = 'n') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
