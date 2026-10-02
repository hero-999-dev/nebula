/**
 * Signing in to an AI service with Google, inside the app (0.9.2).
 *
 * Google refuses sign-in in an embedded Chromium: "Couldn't sign you in — this
 * browser or app may not be secure" (the owner met it in ChatGPT, Gemini and
 * Mistral). 0.9.0 answered by sending the sign-in to the system browser — but
 * a session made there never comes back into the panel, and stopping the
 * redirect to accounts.google.com left the panel blank for Gemini, which goes
 * through that host just to check who is signed in. The owner asked for the
 * other thing: the sign-in pops up, and once it is done you are back in the
 * panel, signed in.
 *
 * So the sign-in stays in the service's own session (its `persist:ai-*`
 * partition): Google's pages are asked for with a Firefox identity — the one
 * embedded browser Google still lets sign in — in the panel itself or in the
 * popup a "Continue with Google" button opens, which is a small window of the
 * app sharing that session. The provider closes the popup when it is done, and
 * the panel is signed in. Everything else keeps the panel's Chrome identity.
 */

/**
 * An address as the sign-in log may keep it (0.9.3): where, never what —
 * the host and path, and only the NAMES of the query's parameters, so no
 * code, token, state or e-mail hint is ever written down.
 */
export function redactUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol === 'data:') return 'data:(page)';
    const names = [...new Set([...u.searchParams.keys()])];
    return `${u.host}${u.pathname}${names.length ? `?${names.join('&')}` : ''}`;
  } catch { return '(not an address)'; }
}

/** Only the real HTTPS Google account host. */
export function isGoogleSignIn(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === 'accounts.google.com';
  } catch {
    return false;
  }
}

/** A current Firefox on this platform. */
export function firefoxUserAgent(platform = process.platform) {
  return firefoxUserAgentFor(platform);
}

import { firefoxUserAgentFor, userAgentForMethod, methodOrder } from '../src/js/ai-services.js';

const sessionsDone = new WeakSet();
/**
 * The contents (by id) that speak to every Google host as a browser of their
 * own, not only on its sign-in pages: Gemini's tab, and each sign-in window as
 * whichever browser it is being at the moment (0.9.3, SIGN_IN_METHODS).
 */
const identities = new Map();
const firefoxSessions = new WeakSet();
/** Everything Google a sign-in page loads from. */
export const GOOGLE_HOSTS = ['https://*.google.com/*', 'https://accounts.youtube.com/*', 'https://*.gstatic.com/*', 'https://*.googleapis.com/*'];

/**
 * The hosts a Google sign-in passes through before it hands back to the
 * service: the account pages themselves, YouTube's cookie step, and
 * google.com's /accounts pages. Anything else is the service again.
 */
export function isGoogleAccountsPage(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'accounts.google.com' || u.hostname === 'accounts.youtube.com') return true;
    if (/^accounts\.google\.[a-z.]+$/.test(u.hostname)) return true;
    return /^(www\.)?google\.[a-z.]+$/.test(u.hostname) && /^\/(accounts|sorry)\b/.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * A sign-in the person started, as opposed to the silent check Gemini makes
 * to learn who is signed in (`passive=`), which must stay in the tab.
 */
export function isInteractiveSignIn(raw) {
  if (!isGoogleSignIn(raw)) return false;
  try {
    const u = new URL(raw);
    if (u.searchParams.has('passive')) return false;
    // Cookie bookkeeping on the way through, never a page to sign in on.
    return !/^\/(ListAccounts|RotateCookies|CheckCookie|SetSID|accounts\/SetSID)/i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * No passkeys in the AI tabs (0.9.3).
 *
 * Google, ChatGPT and Mistral ask the browser for a passkey the moment their
 * sign-in page opens ("conditional mediation"), and Chromium in Electron
 * answers that with the Windows "Choose a passkey" dialog at once — before an
 * email is typed — so the owner could not get past it to their account. The
 * page is told there are none: `navigator.credentials` refuses a public-key
 * request and `PublicKeyCredential` is gone, which is what every sign-in page
 * checks before offering one. Passwords and "Continue with Google" are left
 * as they are. Runs before the page's own scripts, in every frame.
 */
export const NO_PASSKEYS = `(() => {
  try {
    // Google's pages only (0.9.3). Anywhere else the page keeps the browser's
    // own objects: a stand-in PublicKeyCredential and a hidden window.chrome
    // are just what a captcha looks for, and DeepSeek's refused every answer.
    // Passkeys stay off everywhere through the Blink switch in main.js.
    const host = (window.location && window.location.hostname) || '';
    if (host && !/(^|\\.)(google\\.(com|[a-z]{2})|google\\.com?\\.[a-z]{2}|youtube\\.com|gstatic\\.com)$/.test(host)) return;
    const refuse = () => Promise.reject(new DOMException('Passkeys are not available here', 'NotAllowedError'));
    const cred = navigator.credentials;
    if (cred) {
      const get = cred.get && cred.get.bind(cred);
      const create = cred.create && cred.create.bind(cred);
      Object.defineProperty(cred, 'get', { configurable: true, value: (o) => (o && o.publicKey) ? refuse() : (get ? get(o) : refuse()) });
      Object.defineProperty(cred, 'create', { configurable: true, value: (o) => (o && o.publicKey) ? refuse() : (create ? create(o) : refuse()) });
    }
    // The API is there, as in every browser, and says it has no passkeys: a
    // missing one is itself a sign of an odd browser (0.9.3: Gemini answered
    // "this browser may not be secure" once it was gone).
    const no = () => Promise.resolve(false);
    let pkc = window.PublicKeyCredential;
    if (typeof pkc !== 'function') {
      pkc = function PublicKeyCredential() { throw new TypeError('Illegal constructor'); };
      Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, writable: true, value: pkc });
    }
    for (const name of ['isConditionalMediationAvailable', 'isUserVerifyingPlatformAuthenticatorAvailable']) {
      Object.defineProperty(pkc, name, { configurable: true, writable: true, value: no });
    }
    // Where the page is told it runs in Firefox, nothing may say Chromium.
    if (String(navigator.userAgent).includes('Firefox/')) {
      try { Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => undefined }); } catch (e) {}
      try { delete window.chrome; } catch (e) {}
      try { Object.defineProperty(window, 'chrome', { configurable: true, get: () => undefined }); } catch (e) {}
    }
  } catch (e) { /* a page that locked these down keeps them */ }
})();`;

const fenced = new WeakSet();

/**
 * Put NO_PASSKEYS in front of every page this contents loads.
 * @returns {Promise<boolean>} settles once the script is in place — a window
 *   of our own waits for it before it loads anything.
 */
export function refusePasskeys(contents) {
  if (!contents || fenced.has(contents)) return Promise.resolve(false);
  fenced.add(contents);
  const dbg = contents.debugger;
  if (!dbg) return Promise.resolve(false);
  try {
    if (!dbg.isAttached()) dbg.attach('1.3');
  } catch {
    return Promise.resolve(false);       // DevTools are open on it; nothing to add
  }
  // Sent at once, not after Page.enable: the first page is already on its way,
  // and a sign-in page a moment later must not be missed.
  return dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: NO_PASSKEYS, runImmediately: true })
    .then(() => true, () => false);
}

/** The request headers that say "Chromium", which Firefox never sends. */
/** The request headers of whichever browser `ua` names: Firefox sends no sec-ch-ua. */
export function asIdentity(headers, ua) {
  if (/Firefox\//.test(ua)) return asFirefox(headers, ua);
  return { ...(headers || {}), 'User-Agent': ua };
}

/** A contents becomes another browser to Google, from its next request on. */
export function setIdentity(contents, ua) {
  if (!contents || typeof contents.id !== 'number') return;
  identities.set(contents.id, ua);
  contents.setUserAgent?.(ua);
}

export function asFirefox(headers, firefox = firefoxUserAgent()) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) if (!/^sec-ch-ua/i.test(k)) out[k] = v;
  out['User-Agent'] = firefox;
  return out;
}

/**
 * @param {Electron.WebContents} contents an AI tab's webview (or a popup it opened)
 * @param {{ popupOptions?: object }} [opts] how a sign-in popup window looks
 */
export function installAiSignIn(contents, { popupOptions = {}, openSignIn = null, firefoxAlways = false, windowOnly = false, passkeyScript = false, log = null } = {}) {
  const firefox = firefoxUserAgent();
  // The page script (and the debugger that puts it in) only where Google's
  // pages are shown: Gemini's tab, a sign-in window, a popup. A service's own
  // tab (DeepSeek, ChatGPT, Copilot…) is left as the browser made it (0.9.3).
  const ready = firefoxAlways || passkeyScript ? refusePasskeys(contents) : Promise.resolve(false);
  // A Google service (Gemini) is Firefox from its first page on: Google's own
  // sign-in looks at the whole visit, and a tab that was Chrome a moment ago
  // and Firefox on the sign-in page is exactly what it refuses (0.9.3).
  if (firefoxAlways && contents.getUserAgent?.() !== firefox) contents.setUserAgent?.(firefox);

  /**
   * Google sign-in in a window of its own, the way Claude does it (0.9.3).
   *
   * Claude's "Continue with Google" opens a popup and signs in there; Gemini,
   * ChatGPT and Mistral took the tab itself to accounts.google.com, and Google
   * refused it: "Couldn't sign you in — this browser or app may not be
   * secure" (the owner, 0.9.3: "do it the Claude way for everything"). A
   * sign-in the person starts in a tab now opens in a small window of the app
   * that shares the tab's session; when Google hands back to the service, the
   * window closes and the tab goes on from there, signed in. The silent
   * check of who is signed in stays in the tab.
   */
  if (openSignIn) {
    const popOut = (event, url, isMainFrame = true) => {
      if (!isMainFrame || !isInteractiveSignIn(url)) return;
      event.preventDefault();
      log?.('tab-to-google', { tab: redactUrl(contents.getURL?.() || ''), to: redactUrl(url) });
      openSignIn(contents, url, { firefoxFirst: firefoxAlways });
    };
    contents.on('will-navigate', (event, url) => popOut(event, url, true));
    contents.on('will-redirect', (event, url, _inPlace, isMainFrame) => popOut(event, url, isMainFrame !== false));
    // The tab got to a Google sign-in page anyway, or to Google's "Couldn't
    // sign you in" (the owner, 0.9.3: Gemini opened straight on it). The
    // sign-in window opens by itself, so its Sign in works at once.
    contents.on('did-navigate', (_e, url) => {
      if (isInteractiveSignIn(url) || isSignInRefused(url)) {
        log?.(isSignInRefused(url) ? 'tab-refused-by-google' : 'tab-on-google', { at: redactUrl(url) });
        openSignIn(contents, url, { firefoxFirst: firefoxAlways });
      }
    });
  }

  // The request header: Google reads it before any script runs. One listener
  // per session, deciding per request: Google's account pages are always
  // Firefox; the rest of Google only for a contents that is Firefox throughout
  // (Gemini, and every sign-in window). The window used to share the Mistral
  // tab's session, whose listener covered accounts.google.com alone, so the
  // window's other Google requests still said Chromium (sec-ch-ua*) under a
  // Firefox name — and Google refused the address (the owner, 0.9.3).
  // A Google service's own session (Gemini) is Firefox throughout, workers
  // included; a sign-in window only makes itself Firefox (windowOnly), since
  // it shares the session of a service that is not.
  if (firefoxAlways && typeof contents.id === 'number' && !identities.has(contents.id)) identities.set(contents.id, firefox);
  const ses = contents.session;
  if (ses && firefoxAlways && !windowOnly) firefoxSessions.add(ses);
  if (ses && !sessionsDone.has(ses)) {
    sessionsDone.add(ses);
    ses.webRequest.onBeforeSendHeaders({ urls: GOOGLE_HOSTS }, (details, done) => {
      const own = identities.get(details.webContentsId) ?? (firefoxSessions.has(ses) ? firefox : null);
      if (!own && !isGoogleSignIn(details.url)) return done({});
      done({ requestHeaders: asIdentity(details.requestHeaders, own ?? firefox) });
    });
  }
  contents.once?.('destroyed', () => identities.delete(contents.id));

  // navigator.userAgent: Firefox from the first Google page on, the tab's own
  // again once it has left Google. Only ever switched AFTER a page has arrived:
  // setUserAgent in the middle of a navigation restarts it, and switching on
  // the redirect restarted it at the address that redirects — a loop the smoke
  // check caught before it shipped. While navigating, the header above speaks.
  let own = null;
  contents.on('did-navigate', (_e, url) => {
    if (firefoxAlways) return;
    if (isGoogleSignIn(url)) {
      if (own === null) own = contents.getUserAgent();
      if (contents.getUserAgent() !== firefox) contents.setUserAgent(firefox);
    } else if (own !== null) {
      contents.setUserAgent(own);
      own = null;
    }
  });

  // A "Continue with Google" popup: a window of the app in the same session,
  // so what it signs in to is what the panel sees when it closes.
  contents.setWindowOpenHandler(({ url }) => {
    try {
      if (!['https:', 'http:'].includes(new URL(url).protocol)) return { action: 'deny' };
    } catch {
      return { action: 'deny' };
    }
    return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 700, autoHideMenuBar: true, ...popupOptions, webPreferences: { disableBlinkFeatures: 'WebAuth' } } };
  });
  contents.on('did-create-window', (popup) => installAiSignIn(popup.webContents, { popupOptions, firefoxAlways, windowOnly, passkeyScript: true }));
  return { ready };
}

const ATTEMPT_TEXT = {
  en: (n, of) => `Google refused — trying another way (${n}/${of}): enter your e-mail again`,
  de: (n, of) => `Google hat abgelehnt — anderer Weg (${n}/${of}): E-Mail-Adresse bitte erneut eingeben`,
  pl: (n, of) => `Google odmówił — inny sposób (${n}/${of}): wpisz adres e-mail ponownie`,
  tr: (n, of) => `Google reddetti — başka bir yol deneniyor (${n}/${of}): e-postanı yeniden yaz`,
};

const REFUSED_TEXT = {
  en: ['Google did not let this app sign you in', 'Google refused every way the app tried (three browsers). Sign in on the site with your e-mail address instead, or close this window and try again later.', 'Close'],
  de: ['Google hat die Anmeldung in dieser App nicht zugelassen', 'Google hat jeden Weg abgelehnt, den die App versucht hat (drei Browser). Melde dich auf der Website mit deiner E-Mail-Adresse an oder schließe dieses Fenster und versuche es später erneut.', 'Schließen'],
  pl: ['Google nie pozwolił zalogować się w tej aplikacji', 'Google odrzucił każdy sposób, który aplikacja wypróbowała (trzy przeglądarki). Zaloguj się na stronie adresem e-mail albo zamknij to okno i spróbuj później.', 'Zamknij'],
  tr: ['Google bu uygulamada girişe izin vermedi', 'Google, uygulamanın denediği her yolu reddetti (üç tarayıcı). Sitede e-posta adresinle giriş yap ya da bu pencereyi kapatıp daha sonra tekrar dene.', 'Kapat'],
};

/** The page a sign-in window shows when Google refused every browser (0.9.3). */
export function refusedPage(site, lang = 'en') {
  const [title, body, close] = REFUSED_TEXT[lang] || REFUSED_TEXT.en;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>`
    + '<body style="font:15px/1.5 system-ui,sans-serif;margin:32px;color:#222;background:#fafafa">'
    + `<h2 style="font-size:19px;margin:0 0 12px">${esc(title)}</h2>`
    + (site ? `<p style="color:#555;margin:0 0 8px">${esc(site)}</p>` : '')
    + `<p>${esc(body)}</p>`
    + `<button onclick="window.close()" style="font:inherit;padding:7px 16px;border-radius:8px;border:1px solid #bbb;background:#fff;cursor:pointer">${esc(close)}</button>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/** A service's "Sign in with Google": Google's OAuth consent, not its own sign-in. */
export function isOAuthRequest(raw) {
  if (!isGoogleSignIn(raw)) return false;
  try {
    const u = new URL(raw);
    return /^\/(o\/oauth2\/|signin\/oauth\b)/.test(u.pathname) && u.searchParams.has('client_id');
  } catch { return false; }
}

/** Google's "Couldn't sign you in — this browser or app may not be secure". */
export function isSignInRefused(raw) {
  if (!isGoogleSignIn(raw)) return false;
  try { return /\/rejected\b/i.test(new URL(raw).pathname); } catch { return false; }
}

/**
 * A sign-in started afresh for the same destination.
 *
 * The address a tab was sent to carries that tab's attempt, and when Google
 * had already refused the tab, the window that took the address over was
 * refused too — until "Try again" started a new attempt (the owner, 0.9.3:
 * "then Try again, and it works"). The window starts a new one from the
 * start: Google's sign-in page with only the address to come back to.
 */
export function freshSignInUrl(raw, fallback = '') {
  // "Sign in with Google" on another service (Mistral, ChatGPT) is an OAuth
  // request: its client, return address and state are the whole point, and a
  // bare ServiceLogin in its place signs in to Google and never gets back
  // (0.9.3). It is the fresh attempt itself, so it is loaded as it is.
  if (isOAuthRequest(raw)) return raw;
  let back = '';
  try {
    const u = new URL(raw);
    back = u.searchParams.get('continue') || '';
    // Google nests its own continue inside a redirect now and then.
    if (back && isOAuthRequest(back)) return back;
    if (back && isGoogleAccountsPage(back)) back = new URL(back).searchParams.get('continue') || back;
  } catch { /* not an address */ }
  if (!back || !/^https:\/\//.test(back)) back = fallback;
  const out = new URL('https://accounts.google.com/ServiceLogin');
  if (back) out.searchParams.set('continue', back);
  return out.toString();
}

/** How long a sign-in window waits for the passkey script before it loads anyway. */
const PASSKEY_WAIT_MS = 300;
/** How long a sign-in window that arrived at the service stays quiet before it closes. */
const WINDOW_SETTLE_MS = 1500;
/** A sign-in window a tab opens by itself, without anyone using it: at most this many a minute. */
const AUTO_OPENS = 2;
/** Input in the tab this recently counts as the person asking for the sign-in. */
const USED_RECENTLY_MS = 10_000;

/**
 * The window a tab's Google sign-in opens in (see installAiSignIn). It shares
 * the tab's session, speaks as Firefox to Google, and closes itself once the
 * sign-in hands back to the service — the tab, not the window, taking that
 * address (it holds a code that works once).
 *
 * @param {typeof import('electron').BrowserWindow} BrowserWindow
 * @param {object} [options] extra window options (the parent)
 * @returns {(tab: Electron.WebContents, url: string) => Electron.BrowserWindow}
 */
export function signInWindowOpener(BrowserWindow, options = {}, {
  now = () => Date.now(), memory = null, chromium = '', platform = process.platform, language = null, log = null,
} = {}) {
  const open = new WeakMap();   // tab -> its sign-in window
  // What each tab did lately (0.9.3): ChatGPT's tab, left alone in the
  // background, sent itself to Google again and again, and every time a new
  // window came up over whatever the owner was doing — "it kept spamming, and
  // clicking another site did not stop it". A window the person closed by
  // hand stays closed until they use that tab again, and a tab that nobody is
  // using opens at most AUTO_OPENS windows a minute.
  const state = new WeakMap();  // tab -> { lastInput, closedByHand, opens: [] }
  const stateOf = (tab) => {
    let s = state.get(tab);
    if (!s) {
      s = { lastInput: 0, closedByHand: 0, opens: [] };
      state.set(tab, s);
      tab.on?.('input-event', (_e, input) => {
        if (/^(mouseDown|keyDown|rawKeyDown|touchStart|gestureTap)$/.test(input?.type || '')) s.lastInput = now();
      });
    }
    return s;
  };
  return (tab, url, { firefoxFirst = false } = {}) => {
    const existing = open.get(tab);
    // Already open: it is brought forward, and the sign-in in it is left as it is.
    if (existing && !existing.isDestroyed()) { existing.focus(); return existing; }
    const s = stateOf(tab);
    const t = now();
    const used = t - s.lastInput < USED_RECENTLY_MS;
    if (s.closedByHand && s.lastInput <= s.closedByHand) { log?.('window-held-back', { why: 'closed by hand, tab not used since' }); return null; }
    s.opens = s.opens.filter((at) => t - at < 60_000);
    if (!used && s.opens.length >= AUTO_OPENS) { log?.('window-held-back', { why: `${AUTO_OPENS} a minute without the tab being used` }); return null; }
    s.opens.push(t);
    let home = '';
    try { const t = new URL(tab.getURL?.() || ''); if (!isGoogleAccountsPage(t.href)) home = `${t.origin}/`; } catch { /* no page yet */ }
    const start = freshSignInUrl(url, home);
    const win = new BrowserWindow({
      width: 520,
      height: 700,
      autoHideMenuBar: true,
      title: 'Sign in',
      ...options,
      webPreferences: { session: tab.session, contextIsolation: true, sandbox: true, nodeIntegration: false, disableBlinkFeatures: 'WebAuth' },
    });
    open.set(tab, win);
    const wc = win.webContents;
    // Firefox in every page of it, and the passkey script in place BEFORE the
    // first page loads — this window is ours, so there is no race to lose.
    const { ready } = installAiSignIn(wc, { popupOptions: options, firefoxAlways: true, windowOnly: true });
    // One browser after another when Google refuses (0.9.3): the one that
    // worked for this site last time first. `site` is where the sign-in
    // started (the service's own sign-in page).
    const site = home ? new URL(home).origin : '';
    const order = methodOrder(memory?.get?.(site), { firefoxFirst });
    let attempt = 0;
    const become = (i) => setIdentity(wc, userAgentForMethod(order[i], { platform, chromium, now: now() }));
    become(0);
    const worked = () => { if (site) memory?.set?.(site, order[attempt]); };
    // The window's title says why Google's address page came back: its own
    // title is kept off while another way is tried (0.9.3: "a screen comes and
    // at once goes to this").
    let attemptTitle = null;
    wc.on('page-title-updated', (e) => { if (attemptTitle) e.preventDefault(); });
    const showAttempt = () => {
      Promise.resolve(language?.()).catch(() => 'en').then((lang) => {
        attemptTitle = (ATTEMPT_TEXT[lang] || ATTEMPT_TEXT.en)(attempt + 1, order.length);
        if (!win.isDestroyed()) win.setTitle?.(attemptTitle);
      });
    };
    const say = (event, data = {}) => log?.(event, { site, method: order[attempt], ...data });
    say('window-open', { start: redactUrl(start), order: order.join('>') });
    wc.on('did-navigate', (_e, next) => say('window-page', { at: redactUrl(next) }));
    wc.on('did-navigate-in-page', (_e, next) => { if (isSignInRefused(next)) say('window-page', { at: redactUrl(next), inPage: true }); });
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => { if (isMainFrame !== false && code !== -3) say('window-load-failed', { code, desc, at: redactUrl(url) }); });
    // The address Google hands back to carries a code that works ONCE. The
    // window used to follow the redirect AND send the tab there: two requests
    // raced with one code, and whichever came second was refused — Mistral
    // and Claude signed in "after a few failed tries", MathGPT answered
    // "Unauthorized request" (the owner, 0.9.3). Now only one of them goes:
    // the redirect is stopped in the window and the tab takes the address;
    // a page the window already arrived at (a navigation no redirect showed)
    // is left to finish there, and the tab is reloaded after, never sent to
    // the same address again.
    let handedBack = false;
    let arrivedInWindow = false;
    let reloaded = false;
    const isWeb = (next) => { try { return ['https:', 'http:'].includes(new URL(next).protocol); } catch { return false; } };
    const handBack = (e, next) => {
      if (handedBack || isGoogleAccountsPage(next) || !isWeb(next)) return;
      handedBack = true;
      worked();
      say('handed-to-tab', { to: redactUrl(next) });
      e?.preventDefault?.();
      if (!tab.isDestroyed()) tab.loadURL(next);
      setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 0);
    };
    wc.on('will-redirect', (e, next, _inPlace, isMainFrame) => { if (isMainFrame !== false) handBack(e, next); });
    let settle = null;
    wc.on('did-navigate', (_e, next) => {
      if (isGoogleAccountsPage(next) || !isWeb(next)) return;
      if (!handedBack) { handedBack = true; arrivedInWindow = true; worked(); say('arrived-in-window', { at: redactUrl(next) }); }
      if (!arrivedInWindow) return;
      // The service finishes its sign-in in this page (a script, a redirect
      // or two); when the window has been quiet for a moment it closes and
      // the tab looks again.
      clearTimeout(settle);
      settle = setTimeout(done, WINDOW_SETTLE_MS);
    });
    const done = () => {
      if (!tab.isDestroyed()) { reloaded = true; tab.reload(); }
      if (!win.isDestroyed()) win.close();
    };
    wc.on('did-start-navigation', (_e, _url, inPlace, isMainFrame) => {
      if (arrivedInWindow && isMainFrame !== false && !inPlace) clearTimeout(settle);
    });
    // Refused: the next browser tries, from the start (the owner, 0.9.3:
    // "Try using a different browser" for MathGPT and Mistral while ChatGPT
    // went through). When every one was refused, the window says so and how
    // else to sign in, instead of going round again. Google moves from the
    // address page to its refusal inside the page (did-navigate-in-page), so
    // both are watched.
    let gaveUp = false;
    const refused = (_e, next) => {
      if (!isSignInRefused(next) || gaveUp || win.isDestroyed()) return;
      say('refused-by-google', { at: redactUrl(next) });
      if (attempt + 1 < order.length) {
        attempt += 1;
        say('next-method');
        // The next window for this site starts with a way Google has not refused.
        if (site) memory?.set?.(site, order[attempt]);
        showAttempt();
        setTimeout(() => {
          if (win.isDestroyed()) return;
          become(attempt);
          void win.loadURL(start);
        }, 300);
        return;
      }
      gaveUp = true;
      say('gave-up');
      setTimeout(async () => {
        if (win.isDestroyed()) return;
        const lang = await Promise.resolve(language?.()).catch(() => 'en');
        void win.loadURL(refusedPage(site, lang));
      }, 300);
    };
    wc.on('did-navigate', refused);
    wc.on('did-navigate-in-page', refused);
    // Closed by hand: the tab looks again, in case the sign-in finished.
    win.on('closed', () => {
      clearTimeout(settle);
      if (!handedBack) s.closedByHand = now();
      say('window-closed', { byHand: !handedBack });
      if ((!handedBack || arrivedInWindow) && !tab.isDestroyed() && !reloaded) tab.reload();
    });
    // The script is registered before the first page and is waiting for it:
    // Chromium puts it in front of that page when the load starts. Waiting for
    // the debugger's answer instead could wait for ever — the answer can need a
    // page first — and the window stayed blank (the owner, 0.9.3, Mistral).
    // Loading an empty page first was worse: the script then missed Google's
    // page, which showed Chromium under a Firefox name and refused the address
    // until "Try again" loaded a second one. So: a short wait at most, then Google.
    Promise.race([Promise.resolve(ready), new Promise(r => setTimeout(r, PASSKEY_WAIT_MS))])
      .finally(() => { if (!win.isDestroyed()) void win.loadURL(start); });
    return win;
  };
}
