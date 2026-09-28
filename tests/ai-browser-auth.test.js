/**
 * Google sign-in in an AI tab stays in the app, in the tab's own session
 * (0.9.2). 0.9.0 sent it to the system browser: the session never came back,
 * and Gemini's panel stayed blank because its check of who is signed in goes
 * through accounts.google.com.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { installAiSignIn, isGoogleSignIn, firefoxUserAgent } from '../electron/ai-browser-auth.js';

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
  it('matches only the real HTTPS Google account host', () => {
    expect(isGoogleSignIn('https://accounts.google.com/o/oauth2/auth')).toBe(true);
    for (const url of ['http://accounts.google.com', 'https://accounts.google.com.evil.test', 'https://evil.test/accounts.google.com', 'javascript:alert(1)']) {
      expect(isGoogleSignIn(url)).toBe(false);
    }
  });

  it('never stops a navigation: the redirect Gemini makes to check who is signed in goes through', () => {
    const wc = guest();
    installAiSignIn(wc);
    const event = { preventDefault: vi.fn() };
    wc.emit('will-redirect', event, 'https://accounts.google.com/ServiceLogin?passive=true', false, true);
    wc.emit('will-navigate', event, 'https://accounts.google.com/signin');
    expect(event.preventDefault).not.toHaveBeenCalled();
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
    expect(filter.urls).toEqual(['https://accounts.google.com/*']);
    const done = vi.fn();
    handler({ requestHeaders: { 'User-Agent': CHROME, Cookie: 'x' } }, done);
    expect(done).toHaveBeenCalledWith({ requestHeaders: { 'User-Agent': firefoxUserAgent(), Cookie: 'x' } });
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
