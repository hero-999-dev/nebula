/**
 * Google sign-in in an AI tab stays in the app, in the tab's own session
 * (0.9.2). 0.9.0 sent it to the system browser: the session never came back,
 * and Gemini's panel stayed blank because its check of who is signed in goes
 * through accounts.google.com.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { installAiSignIn, isGoogleSignIn, firefoxUserAgent, isGoogleAccountsPage, signInWindowOpener, isOAuthRequest, freshSignInUrl, GOOGLE_HOSTS, redactUrl } from '../electron/ai-browser-auth.js';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function guest(ses = { webRequest: { onBeforeSendHeaders: vi.fn() } }) {
  const wc = new EventEmitter();
  wc.session = ses;
  wc.ua = CHROME;
  wc.getUserAgent = () => wc.ua;
  wc.setUserAgent = (ua) => { wc.ua = ua; };
  wc.setWindowOpenHandler = (fn) => { wc.popup = fn; };
  wc.getURL = () => '';
  return wc;
}

describe('Google sign-in inside the app', () => {
  it('the sign-in log keeps where, never what: no code, token, state or e-mail (0.9.3)', () => {
    expect(redactUrl('https://auth.openai.com/api/accounts/callback/google?code=SECRET&state=XYZ&login_hint=me%40mail.com'))
      .toBe('auth.openai.com/api/accounts/callback/google?code&state&login_hint');
    expect(redactUrl('https://accounts.google.com/v3/signin/rejected')).toBe('accounts.google.com/v3/signin/rejected');
    expect(redactUrl('data:text/html,<b>x</b>')).toBe('data:(page)');
    expect(redactUrl('not a url')).toBe('(not an address)');
  });

  it('matches only the real HTTPS Google account host', () => {
    expect(isGoogleSignIn('https://accounts.google.com/o/oauth2/auth')).toBe(true);
    for (const url of ['http://accounts.google.com', 'https://accounts.google.com.evil.test', 'https://evil.test/accounts.google.com', 'javascript:alert(1)']) {
      expect(isGoogleSignIn(url)).toBe(false);
    }
  });

  it('never stops the silent check of who is signed in; without a window to open, nothing is stopped', () => {
    const openSignIn = vi.fn();
    const wc = guest();
    installAiSignIn(wc, { openSignIn });
    const event = { preventDefault: vi.fn() };
    wc.emit('will-redirect', event, 'https://accounts.google.com/ServiceLogin?passive=1209600&continue=https://gemini.google.com/', false, true);
    expect(event.preventDefault).not.toHaveBeenCalled();
    const plain = guest();
    installAiSignIn(plain);
    plain.emit('will-navigate', event, 'https://accounts.google.com/signin');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(openSignIn).not.toHaveBeenCalled();
  });

  it('takes a sign-in the person started out of the tab, into a window of its own (the Claude way, 0.9.3)', () => {
    const openSignIn = vi.fn();
    const wc = guest();
    installAiSignIn(wc, { openSignIn });
    const nav = { preventDefault: vi.fn() };
    wc.emit('will-navigate', nav, 'https://accounts.google.com/ServiceLogin?continue=https://gemini.google.com/app');
    expect(nav.preventDefault).toHaveBeenCalled();
    expect(openSignIn).toHaveBeenCalledWith(wc, 'https://accounts.google.com/ServiceLogin?continue=https://gemini.google.com/app', { firefoxFirst: false });
    // ChatGPT and Mistral get there by a redirect from their own sign-in page.
    const redirect = { preventDefault: vi.fn() };
    wc.emit('will-redirect', redirect, 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x', false, true);
    expect(redirect.preventDefault).toHaveBeenCalled();
    // Not a frame inside the page, and not any other site.
    const frame = { preventDefault: vi.fn() };
    wc.emit('will-redirect', frame, 'https://accounts.google.com/o/oauth2/v2/auth', false, false);
    wc.emit('will-navigate', frame, 'https://chatgpt.com/auth/login');
    expect(frame.preventDefault).not.toHaveBeenCalled();
  });

  it('knows when Google hands back to the service', () => {
    for (const u of ['https://accounts.google.com/v3/signin/identifier', 'https://accounts.youtube.com/accounts/SetSID', 'https://www.google.com/accounts/SetSID', 'https://accounts.google.de/x']) {
      expect(isGoogleAccountsPage(u), u).toBe(true);
    }
    for (const u of ['https://gemini.google.com/app', 'https://auth.openai.com/callback?code=1', 'https://chat.mistral.ai/', 'https://www.google.com/search?q=x', 'http://accounts.google.com/']) {
      expect(isGoogleAccountsPage(u), u).toBe(false);
    }
  });

  it('the sign-in window closes when Google hands back, and sends the tab there', async () => {
    const created = [];
    class FakeWindow extends EventEmitter {
      constructor(opts) { super(); this.opts = opts; this.webContents = guest(opts.webPreferences.session); this.webContents.loadURL = vi.fn(); this.destroyed = false; created.push(this); }
      isDestroyed() { return this.destroyed; }
      loadURL(u) { this.url = u; return Promise.resolve(); }
      close() { this.destroyed = true; this.emit('closed'); }
      focus() {}
    }
    const tab = guest();
    tab.loadURL = vi.fn();
    tab.reload = vi.fn();
    tab.isDestroyed = () => false;
    const open = signInWindowOpener(FakeWindow, { parent: 'main' });
    const win = open(tab, 'https://accounts.google.com/v3/signin/identifier?continue=https://gemini.google.com/app&TL=tainted');
    await new Promise((r) => setTimeout(r, 5));
    // A new attempt from the start, with only the address to come back to.
    expect(win.url).toBe('https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2Fapp');
    expect(win.opts.webPreferences.session).toBe(tab.session);
    expect(win.opts.parent).toBe('main');
    expect(win.webContents.ua).toBe(firefoxUserAgent());
    win.webContents.emit('did-navigate', {}, 'https://accounts.google.com/v3/signin/challenge/pwd');
    win.webContents.emit('did-navigate', {}, 'https://accounts.youtube.com/accounts/SetSID');
    expect(tab.loadURL).not.toHaveBeenCalled();
    // Google hands back with a redirect: it is stopped in the window, and the
    // tab alone takes the address — it carries a code that works once (0.9.3).
    const hop = { preventDefault: vi.fn() };
    win.webContents.emit('will-redirect', hop, 'https://gemini.google.com/app?code=once', false, true);
    expect(hop.preventDefault).toHaveBeenCalled();
    expect(tab.loadURL).toHaveBeenCalledTimes(1);
    expect(tab.loadURL).toHaveBeenCalledWith('https://gemini.google.com/app?code=once');
    await new Promise((r) => setTimeout(r, 5));
    expect(win.isDestroyed()).toBe(true);
    expect(tab.reload).not.toHaveBeenCalled();
    // Closed by hand before the end: the tab looks again.
    const second = open(tab, 'https://accounts.google.com/ServiceLogin');
    second.close();
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });

  it('a page the window already arrived at is never loaded again in the tab: the window finishes, then the tab reloads (0.9.3)', async () => {
    vi.useFakeTimers();
    try {
      class W extends EventEmitter {
        constructor(opts) { super(); this.webContents = guest(opts.webPreferences.session); this.destroyed = false; }
        isDestroyed() { return this.destroyed; }
        loadURL() { return Promise.resolve(); }
        close() { this.destroyed = true; this.emit('closed'); }
        focus() {}
      }
      const tab = guest();
      tab.loadURL = vi.fn();
      tab.reload = vi.fn();
      tab.isDestroyed = () => false;
      const win = signInWindowOpener(W)(tab, 'https://accounts.google.com/o/oauth2/v2/auth?client_id=1&redirect_uri=https%3A%2F%2Fclerk.example%2Fcb');
      win.webContents.emit('did-navigate', {}, 'https://clerk.example/cb?code=once');
      win.webContents.emit('did-navigate', {}, 'https://example.com/sso-callback');
      await vi.advanceTimersByTimeAsync(1000);
      expect(win.isDestroyed()).toBe(false);          // still finishing its sign-in
      await vi.advanceTimersByTimeAsync(1000);
      expect(win.isDestroyed()).toBe(true);
      expect(tab.loadURL).not.toHaveBeenCalled();
      expect(tab.reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no window spam: one closed by hand stays closed until the tab is used, and an idle tab opens two a minute at most (0.9.3, ChatGPT)', () => {
    let clock = 1_000_000;
    class W extends EventEmitter {
      constructor(opts) { super(); this.webContents = guest(opts.webPreferences.session); this.destroyed = false; }
      isDestroyed() { return this.destroyed; }
      loadURL() { return Promise.resolve(); }
      close() { this.destroyed = true; this.emit('closed'); }
      focus() {}
    }
    const tab = guest();
    tab.reload = vi.fn();
    tab.loadURL = vi.fn();
    tab.isDestroyed = () => false;
    const open = signInWindowOpener(W, {}, { now: () => clock });
    const g = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=1';
    const first = open(tab, g);
    expect(first).toBeTruthy();
    first.close();                                  // the owner closes it
    clock += 1000;
    expect(open(tab, g)).toBeNull();                // the page tries again by itself: nothing
    clock += 120_000;
    expect(open(tab, g)).toBeNull();                // still nothing, however long after
    tab.emit('input-event', {}, { type: 'mouseDown' });
    clock += 100;
    const again = open(tab, g);                     // they click in the tab: it opens
    expect(again).toBeTruthy();
    again.destroyed = true;                         // handed back (not closed by hand)
    clock += 20_000;                                // idle now
    expect(open(tab, g)).toBeTruthy();
    const w3 = open(tab, g);
    expect(w3).toBeTruthy();                        // the one still open, brought forward
    w3.destroyed = true;
    expect(open(tab, g)).toBeNull();                // a third by itself within the minute: no
    clock += 61_000;
    expect(open(tab, g)).toBeTruthy();
  });

  it('when Google refuses, the next browser tries; every one refused, the window says how else to sign in (0.9.3)', async () => {
    let nextId = 500;
    class W extends EventEmitter {
      constructor(opts) { super(); this.webContents = guest(opts.webPreferences.session); this.webContents.id = nextId++; this.loads = []; }
      isDestroyed() { return false; }
      loadURL(u) { this.loads.push([u, this.webContents.ua]); return Promise.resolve(); }
      close() {}
      focus() {}
    }
    const tab = guest();
    tab.getURL = () => 'https://gemini.google.com/app';
    const memory = { get: vi.fn(() => undefined), set: vi.fn() };
    const CHROMIUM = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    const win = signInWindowOpener(W, {}, { memory, chromium: CHROMIUM, platform: 'win32', language: () => 'tr' })(tab, 'https://accounts.google.com/v3/signin/rejected?x=1');
    await new Promise((r) => setTimeout(r, 5));
    const fresh = 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2F';
    for (let i = 0; i < 3; i++) {
      // Google gets to its refusal inside the page as well as by a load.
      win.webContents.emit(i % 2 ? 'did-navigate' : 'did-navigate-in-page', {}, 'https://accounts.google.com/v3/signin/rejected?x=1');
      await new Promise((r) => setTimeout(r, 350));
    }
    const [one, two, three, last] = win.loads;
    expect([one[0], two[0], three[0]]).toEqual([fresh, fresh, fresh]);
    // A service's tab starts as the engine it is (a current Chrome since
    // Electron 44), then today's Firefox, then the ESR (the owner's log, 0.9.3).
    expect(one[1]).toBe(CHROMIUM);
    expect(two[1]).toMatch(/Firefox\/1[5-9]\d\.0$/);
    expect(three[1]).toMatch(/Firefox\/140\.0$/);
    expect(last[0]).toMatch(/^data:text\/html/);
    expect(decodeURIComponent(last[0])).toContain('e-posta');   // in the app's language
    expect(win.loads).toHaveLength(4);                        // and no more rounds
    // Each refusal moves the site on, so the next window does not start with a refused way.
    expect(memory.set.mock.calls.map((c) => c[1])).toEqual(['firefox', 'firefox-esr']);
  });

  it('the order: a service’s tab starts as Chromium, Gemini as Firefox; a refused way is not tried first again', async () => {
    const { methodOrder } = await import('../src/js/ai-services.js');
    expect(methodOrder(undefined)).toEqual(['chromium', 'firefox', 'firefox-esr']);
    expect(methodOrder(undefined, { firefoxFirst: true })).toEqual(['firefox', 'firefox-esr', 'chromium']);
    expect(methodOrder('firefox')).toEqual(['firefox', 'chromium', 'firefox-esr']);
    expect(methodOrder('nonsense')).toEqual(['chromium', 'firefox', 'firefox-esr']);
  });

  it('remembers what worked for a site, and starts with it next time (0.9.3)', async () => {
    let nextId = 700;
    class W extends EventEmitter {
      constructor(opts) { super(); this.webContents = guest(opts.webPreferences.session); this.webContents.id = nextId++; this.loads = []; this.destroyed = false; }
      isDestroyed() { return this.destroyed; }
      loadURL(u) { this.loads.push([u, this.webContents.ua]); return Promise.resolve(); }
      close() { this.destroyed = true; this.emit('closed'); }
      focus() {}
    }
    const saved = {};
    const memory = { get: (k) => saved[k], set: (k, v) => { saved[k] = v; } };
    const tab = guest();
    tab.getURL = () => 'https://math-gpt.org/sign-in';
    tab.loadURL = vi.fn();
    tab.reload = vi.fn();
    tab.isDestroyed = () => false;
    const open = signInWindowOpener(W, {}, { memory, platform: 'win32' });
    const oauth = 'https://accounts.google.com/o/oauth2/auth?client_id=1&redirect_uri=https%3A%2F%2Fclerk.math-gpt.org%2Fcb';
    const w1 = open(tab, oauth);
    w1.webContents.emit('did-navigate-in-page', {}, 'https://accounts.google.com/v3/signin/rejected');
    await new Promise((r) => setTimeout(r, 350));
    w1.webContents.emit('will-redirect', { preventDefault() {} }, 'https://clerk.math-gpt.org/cb?code=once', false, true);
    expect(saved['https://math-gpt.org']).toBe('firefox');      // refused as Chromium, worked as Firefox
    await new Promise((r) => setTimeout(r, 5));
    tab.emit('input-event', {}, { type: 'mouseDown' });
    const w2 = open(tab, oauth);
    await new Promise((r) => setTimeout(r, 350));
    expect(w2.loads[0][1]).toMatch(/Firefox\/1[5-9]\d\.0$/);   // Firefox first now
  });

  it('opens the window by itself when the tab lands on a sign-in page or on the refusal', () => {
    const openSignIn = vi.fn();
    const wc = guest();
    installAiSignIn(wc, { openSignIn });
    wc.emit('did-navigate', {}, 'https://gemini.google.com/app');
    wc.emit('did-navigate', {}, 'https://accounts.google.com/ServiceLogin?passive=1209600');
    expect(openSignIn).not.toHaveBeenCalled();
    wc.emit('did-navigate', {}, 'https://accounts.google.com/v3/signin/rejected?continue=x');
    expect(openSignIn).toHaveBeenCalledTimes(1);
  });

  it('starts a sign-in afresh for the same destination', async () => {
    const { freshSignInUrl } = await import('../electron/ai-browser-auth.js');
    expect(freshSignInUrl('https://accounts.google.com/v3/signin/identifier?continue=https://gemini.google.com/app&TL=abc'))
      .toBe('https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2Fapp');
    expect(freshSignInUrl('https://accounts.google.com/v3/signin/rejected', 'https://gemini.google.com/'))
      .toBe('https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2F');
    expect(freshSignInUrl('https://accounts.google.com/x?continue=javascript:alert(1)', ''))
      .toBe('https://accounts.google.com/ServiceLogin');
  });

  it('is Firefox once a Google page has arrived, and the tab’s own identity again after', () => {
    const wc = guest();
    installAiSignIn(wc);
    wc.emit('did-navigate', {}, 'https://accounts.google.com/signin');
    expect(wc.ua).toBe(firefoxUserAgent());
    wc.emit('did-navigate', {}, 'https://gemini.google.com/app');
    expect(wc.ua).toBe(CHROME);
  });

  it('never switches identity in the middle of a navigation: that restarts it, and on a redirect it looped', () => {
    const wc = guest();
    installAiSignIn(wc);
    wc.emit('will-redirect', {}, 'https://accounts.google.com/signin', false, true);
    wc.emit('will-navigate', {}, 'https://accounts.google.com/signin');
    wc.emit('did-start-navigation', {}, 'https://accounts.google.com/signin', false, true);
    expect(wc.ua).toBe(CHROME);
  });

  it('sends Google a Firefox request header, set once per session', () => {
    const ses = { webRequest: { onBeforeSendHeaders: vi.fn() } };
    installAiSignIn(guest(ses));
    installAiSignIn(guest(ses));
    expect(ses.webRequest.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
    const [filter, handler] = ses.webRequest.onBeforeSendHeaders.mock.calls[0];
    expect(filter.urls).toEqual(GOOGLE_HOSTS);
    const done = vi.fn();
    handler({ url: 'https://accounts.google.com/v3/signin', requestHeaders: { 'User-Agent': CHROME, Cookie: 'x' } }, done);
    expect(done).toHaveBeenCalledWith({ requestHeaders: { 'User-Agent': firefoxUserAgent(), Cookie: 'x' } });
    // The rest of Google keeps the service's own identity.
    const other = vi.fn();
    handler({ url: 'https://www.gstatic.com/x.js', requestHeaders: { 'User-Agent': CHROME } }, other);
    expect(other).toHaveBeenCalledWith({});
  });

  it('a sign-in window is Firefox to all of Google, in a session whose tab is not (0.9.3, Mistral)', () => {
    // The Mistral tab came first and set the session's listener; the window
    // shares it. Its gstatic and googleapis requests said Chromium, and Google
    // refused the address.
    const ses = { webRequest: { onBeforeSendHeaders: vi.fn() } };
    const tab = guest(ses); tab.id = 101;
    installAiSignIn(tab);
    const win = guest(ses); win.id = 102;
    installAiSignIn(win, { firefoxAlways: true, windowOnly: true });
    const [, handler] = ses.webRequest.onBeforeSendHeaders.mock.calls[0];
    const fromWindow = vi.fn();
    handler({ url: 'https://www.gstatic.com/x.js', webContentsId: 102, requestHeaders: { 'User-Agent': CHROME, 'sec-ch-ua': '"Chromium"' } }, fromWindow);
    expect(fromWindow).toHaveBeenCalledWith({ requestHeaders: { 'User-Agent': firefoxUserAgent() } });
    const fromTab = vi.fn();
    handler({ url: 'https://www.gstatic.com/x.js', webContentsId: 101, requestHeaders: { 'User-Agent': CHROME } }, fromTab);
    expect(fromTab).toHaveBeenCalledWith({});
    // Gemini's own session is Firefox throughout, even a request with no tab.
    const gses = { webRequest: { onBeforeSendHeaders: vi.fn() } };
    installAiSignIn(guest(gses), { firefoxAlways: true });
    const [, ghandler] = gses.webRequest.onBeforeSendHeaders.mock.calls[0];
    const worker = vi.fn();
    ghandler({ url: 'https://gemini.google.com/sw.js', webContentsId: -1, requestHeaders: { 'User-Agent': CHROME } }, worker);
    expect(worker).toHaveBeenCalledWith({ requestHeaders: { 'User-Agent': firefoxUserAgent() } });
  });

  it('keeps a service’s "Sign in with Google" request whole: client, return address and state (0.9.3, Mistral)', () => {
    const oauth = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=1.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fauth.mistral.ai%2Fcb&state=s&response_type=code';
    expect(isOAuthRequest(oauth)).toBe(true);
    expect(freshSignInUrl(oauth, 'https://v2.auth.mistral.ai/')).toBe(oauth);
    // Refused on the way: the request it carries is started again as it is.
    expect(freshSignInUrl('https://accounts.google.com/v3/signin/rejected?continue=' + encodeURIComponent(oauth))).toBe(oauth);
    expect(isOAuthRequest('https://accounts.google.com/ServiceLogin?continue=https://gemini.google.com/')).toBe(false);
    expect(isOAuthRequest('https://evil.test/o/oauth2/v2/auth?client_id=1')).toBe(false);
  });

  it('the sign-in window loads without waiting for ever on the passkey script (0.9.3: it stayed blank)', async () => {
    class W extends EventEmitter {
      constructor(opts) { super(); this.webContents = guest(opts.webPreferences.session); this.loads = []; }
      isDestroyed() { return false; }
      loadURL(u) { this.loads.push(u); return Promise.resolve(); }
      close() {}
      focus() {}
    }
    const tab = guest();
    tab.getURL = () => 'https://v2.auth.mistral.ai/login?flow=1';
    // A debugger that never answers, as on a window with no page yet.
    const Hanging = class extends W {
      constructor(opts) {
        super(opts);
        this.webContents.debugger = { isAttached: () => false, attach() {}, sendCommand: () => new Promise(() => {}) };
      }
    };
    const oauth = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=1&redirect_uri=https%3A%2F%2Fauth.mistral.ai%2Fcb';
    const win = signInWindowOpener(Hanging)(tab, oauth);
    expect(win.loads).toEqual([]);
    await new Promise((r) => setTimeout(r, 400));
    // Straight to Google: no empty page first, which made the script miss it.
    expect(win.loads).toEqual([oauth]);
  });

  it('opens a "Continue with Google" popup as a window of the app, and nothing that is not a web page', () => {
    const wc = guest();
    installAiSignIn(wc, { popupOptions: { parent: 'main' } });
    expect(wc.popup({ url: 'https://accounts.google.com/o/oauth2/auth' })).toMatchObject({ action: 'allow', overrideBrowserWindowOptions: { parent: 'main' } });
    expect(wc.popup({ url: 'file:///secret' })).toEqual({ action: 'deny' });
    expect(wc.popup({ url: 'not a url' })).toEqual({ action: 'deny' });
  });

  it('gives the popup the same treatment', () => {
    const wc = guest();
    installAiSignIn(wc);
    const inner = guest(wc.session);
    wc.emit('did-create-window', { webContents: inner });
    expect(typeof inner.popup).toBe('function');
    inner.emit('did-navigate', {}, 'https://accounts.google.com/o/oauth2/auth');
    expect(inner.ua).toBe(firefoxUserAgent());
  });
});

describe('what counts as a sign-in the person started', () => {
  it('is a Google sign-in page, never the silent checks or the cookie steps', async () => {
    const { isInteractiveSignIn } = await import('../electron/ai-browser-auth.js');
    expect(isInteractiveSignIn('https://accounts.google.com/ServiceLogin?continue=https://gemini.google.com/app')).toBe(true);
    expect(isInteractiveSignIn('https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn')).toBe(true);
    expect(isInteractiveSignIn('https://accounts.google.com/o/oauth2/v2/auth?client_id=x')).toBe(true);
    for (const u of ['https://accounts.google.com/ServiceLogin?passive=1209600', 'https://accounts.google.com/CheckCookie?continue=x',
      'https://accounts.google.com/ListAccounts', 'https://accounts.google.com/RotateCookiesPage', 'https://chatgpt.com/', 'http://accounts.google.com/signin']) {
      expect(isInteractiveSignIn(u), u).toBe(false);
    }
  });
});
