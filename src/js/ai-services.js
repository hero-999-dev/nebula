/**
 * The browsers the app may be to Google (0.9.3). Checked on every release
 * against Mozilla's and Google's own version lists (scripts/check-browsers.js,
 * run by `npm run push` and shown by preflight): a years-old version is what
 * Google answers with "Try using a different browser". When that check says
 * so, these two lines are what to change.
 */
export const FIREFOX_RELEASE = { version: 157, date: '2026-09-29' };
export const FIREFOX_ESR = 153;

function osPart(platform) {
  return platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15'
    : platform === 'linux' ? 'X11; Linux x86_64'
      : 'Windows NT 10.0; Win64; x64';
}

/**
 * A current Firefox on this platform ('win32' | 'darwin' | 'linux') — the one
 * embedded browser Google still lets sign in. One string for the main process
 * (ai-browser-auth.js) and the panel's tabs.
 * @param {string} platform
 * @param {number|{version: number}} [when] a time (today's release is worked
 *   out from it) or a fixed version (the ESR)
 */
export function firefoxUserAgentFor(platform, when = Date.now()) {
  const v = typeof when === 'object' && when ? when.version : currentFirefox(when);
  return `Mozilla/5.0 (${osPart(platform)}; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
}

/**
 * The Firefox version out today (0.9.3). A fixed 128 — two years old and out
 * of support by 2026 — is what Google answers with "Try using a different
 * browser" (the owner, Mistral). Counted from the last release on record by
 * Firefox's four-week cycle, never below it; the release check keeps the
 * record current, since Mozilla does not always keep to four weeks.
 */
export function currentFirefox(now = Date.now()) {
  const [y, m, d] = FIREFOX_RELEASE.date.split('-').map(Number);
  const since = Math.floor((now - Date.UTC(y, m - 1, d)) / (28 * 86_400_000));
  return FIREFOX_RELEASE.version + Math.max(0, since);
}

/**
 * The ways a sign-in window can present itself to Google, tried in turn when
 * Google refuses one (the owner, 0.9.3: "a method of its own for each site,
 * in the background, if one method does not simply work"). What worked for a
 * site is remembered and tried first the next time.
 */
export const SIGN_IN_METHODS = ['firefox', 'firefox-esr', 'chromium'];

/**
 * @param {string} method one of SIGN_IN_METHODS
 * @param {{platform?: string, chromium?: string, now?: number}} ctx
 *   `chromium` is the engine's own user agent (without Electron)
 */
export function userAgentForMethod(method, { platform, chromium = '', now = Date.now() } = {}) {
  if (method === 'firefox-esr') return firefoxUserAgentFor(platform, { version: FIREFOX_ESR });
  if (method === 'chromium' && chromium) return chromium;
  return firefoxUserAgentFor(platform, now);
}

/**
 * The methods for a site: the one to try first there (what worked last, or
 * what Google has not refused yet), then the rest. With nothing on record, a
 * service's own tab starts as the engine it really is — since Electron 44
 * that is a current Chrome (152), and Google refused Firefox after the e-mail
 * step for ChatGPT and Copilot (the owner's sign-in log, 2026-09-30) — while
 * Gemini, whose whole tab is Firefox, starts as Firefox.
 * @param {string} [remembered]
 * @param {{firefoxFirst?: boolean}} [opts]
 */
export function methodOrder(remembered, { firefoxFirst = false } = {}) {
  const base = firefoxFirst ? SIGN_IN_METHODS : ['chromium', 'firefox', 'firefox-esr'];
  return SIGN_IN_METHODS.includes(remembered)
    ? [remembered, ...base.filter((m) => m !== remembered)]
    : [...base];
}

/** A Google service: its whole tab speaks as Firefox (0.9.3), not only its sign-in. */
export function isGoogleService(url) {
  try { return /(^|\.)google\.com$/.test(new URL(url).hostname); } catch { return false; }
}

export const AI_SERVICES = {
  claude: { name: 'Claude', url: 'https://claude.ai', dot: '#d97706' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com', dot: '#4285f4' },
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com', dot: '#10a37f' },
  mistral: { name: 'Mistral', url: 'https://chat.mistral.ai', dot: '#ff7000' },
  // After Mistral, at the owner's word (0.9.3). Perplexity and DeepSeek are out
  // for now (DeepSeek's own captcha refused every answer in the app).
  mathgpt: { name: 'MathGPT', url: 'https://math-gpt.org', dot: '#e0457b' },
  copilot: { name: 'Copilot', url: 'https://copilot.microsoft.com', dot: '#0f6cbd' },
};

/**
 * A tab nobody is looking at goes to sleep (0.9.4).
 *
 * The owner's Ideas note, over a task manager showing Nebula at 750 MB: "the
 * AI panels can go to sleep when they are not used, as in other browsers — but
 * if that works like reloading the page and somebody's temporary chat is in
 * there, I would not want to break it." Measured: every tab that was opened
 * once holds 170 to 300 MB for as long as the app runs, the panel open or not.
 *
 * Sleeping IS loading the page again later — there is no other way to give
 * the memory back — so a tab sleeps only when that loses nothing we can know
 * of. The app does not read a page to find out; it goes by the address, and by
 * whether keys were pressed in the tab since the address last changed:
 *
 *   – a temporary or incognito chat (the address says so) stays awake;
 *   – so does a tab that was typed in while its address names no saved chat —
 *     a temporary chat on a site whose address does not say so, or words on a
 *     new chat's page that were never sent;
 *   – and one that was typed in last without Enter: words not sent yet;
 *   – and one that is playing sound, or still loading.
 *
 * A saved chat comes back from its own address, so it may sleep.
 */
export const SLEEP_AFTER_MS = 20 * 60 * 1000;

/** An address that says the chat is not kept: ChatGPT's ?temporary-chat=true, Claude's ?incognito. */
export function isTemporaryChat(raw) {
  try {
    const u = new URL(raw);
    return /temporary|incognito|private[-_]?chat/i.test(`${u.pathname}${u.search}${u.hash}`);
  } catch { return false; }
}

/** An address that names one saved chat: a long id among its parts (/c/<uuid>, /chat/<uuid>, /app/<hex>). */
export function namesSavedChat(raw) {
  try {
    return new URL(raw).pathname.split('/').some((part) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)
      || (/^[A-Za-z0-9_-]{12,}$/.test(part) && /\d/.test(part) && /[A-Za-z]/.test(part)));
  } catch { return false; }
}

/**
 * Whether loading a tab's page again could lose something.
 * @param {{url: string, typed?: boolean, lastKeyEnter?: boolean, audible?: boolean, loading?: boolean}} tab
 *   `typed`: a key was pressed in it since its address last changed; `lastKeyEnter`: the last of them was Enter
 */
export function wouldLoseOnReload({ url, typed = false, lastKeyEnter = false, audible = false, loading = false }) {
  if (audible || loading) return true;
  if (isTemporaryChat(url)) return true;
  if (!typed) return false;
  return !namesSavedChat(url) || !lastKeyEnter;
}

/**
 * Whether a tab is put to sleep now.
 * @param {object} tab what wouldLoseOnReload takes, and:
 * @param {number} tab.now
 * @param {number} tab.lastSeen when it was last on screen
 * @param {boolean} [tab.onScreen] it is the tab being looked at
 * @param {boolean} [tab.keepAwake] the reader said to leave it
 * @param {number} [after] how long unseen, in ms
 */
export function shouldSleep({ now, lastSeen, onScreen = false, keepAwake = false, ...tab }, after = SLEEP_AFTER_MS) {
  if (onScreen || keepAwake || !(after > 0) || !Number.isFinite(after)) return false;
  if (now - lastSeen < after) return false;
  return !wouldLoseOnReload(tab);
}

/** How long a tab may go unseen, from the stored minutes (0: never sleep; nothing stored: twenty). */
export function sleepAfterMs(stored) {
  if (stored === null || stored === undefined || stored === '') return SLEEP_AFTER_MS;
  const minutes = Number(stored);
  if (!Number.isFinite(minutes) || minutes < 0) return SLEEP_AFTER_MS;
  return minutes === 0 ? Infinity : minutes * 60 * 1000;
}

/**
 * The tabs the panel shows (0.9.3): the built-in services less the ones taken
 * away, each with the name and address it was given, then the sites added
 * with +. A right-click on a tab changes its name ("header") or address, or
 * deletes it; a built-in one is only hidden, and comes back with "Restore
 * removed sites".
 * @param {Record<string, {name: string, url: string, dot?: string}>} builtIn
 * @param {{id: string, name: string, url: string, dot?: string}[]} custom
 * @param {Record<string, {name?: string, url?: string}>} overrides
 * @param {string[]} hidden
 */
export function mergeServices(builtIn, custom = [], overrides = {}, hidden = []) {
  const out = {};
  const gone = new Set(Array.isArray(hidden) ? hidden : []);
  for (const [id, s] of Object.entries(builtIn)) {
    if (gone.has(id)) continue;
    const o = overrides?.[id] || {};
    out[id] = { ...s, ...(o.name ? { name: o.name } : {}), ...(o.url ? { url: o.url } : {}) };
  }
  for (const c of Array.isArray(custom) ? custom : []) if (c?.id && c.url) out[c.id] = c;
  return out;
}

/** An address typed for a site: https:// added when missing; null when it is not one. */
export function siteUrl(raw) {
  let url = String(raw ?? '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    return ['https:', 'http:'].includes(u.protocol) && u.hostname.includes('.') ? u.toString() : null;
  } catch { return null; }
}

/** A site's name as the panel may keep it: one line, trimmed, not endless.
 * Characters, not UTF-16 units, so no emoji is cut in half (hunt B24). */
export function cleanSiteName(raw) {
  return Array.from(String(raw ?? '').trim()).slice(0, 40).join('');
}
