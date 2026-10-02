/**
 * The browsers the app may be to Google (0.9.3). Checked on every release
 * against Mozilla's and Google's own version lists (scripts/check-browsers.js,
 * run by `npm run push` and shown by preflight): a years-old version is what
 * Google answers with "Try using a different browser". When that check says
 * so, these two lines are what to change.
 */
export const FIREFOX_RELEASE = { version: 157, date: '2026-09-29' };
export const FIREFOX_ESR = 140;

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
