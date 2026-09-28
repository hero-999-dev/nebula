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
  const os = platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15'
    : platform === 'linux' ? 'X11; Linux x86_64'
      : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${os}; rv:128.0) Gecko/20100101 Firefox/128.0`;
}

const sessionsDone = new WeakSet();

/**
 * @param {Electron.WebContents} contents an AI tab's webview (or a popup it opened)
 * @param {{ popupOptions?: object }} [opts] how a sign-in popup window looks
 */
export function installAiSignIn(contents, { popupOptions = {} } = {}) {
  const firefox = firefoxUserAgent();

  // The request header: Google reads it before any script runs.
  const ses = contents.session;
  if (ses && !sessionsDone.has(ses)) {
    sessionsDone.add(ses);
    ses.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*'] }, (details, done) => {
      done({ requestHeaders: { ...details.requestHeaders, 'User-Agent': firefox } });
    });
  }

  // navigator.userAgent: Firefox from the first Google page on, the tab's own
  // again once it has left Google. Only ever switched AFTER a page has arrived:
  // setUserAgent in the middle of a navigation restarts it, and switching on
  // the redirect restarted it at the address that redirects — a loop the smoke
  // check caught before it shipped. While navigating, the header above speaks.
  let own = null;
  contents.on('did-navigate', (_e, url) => {
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
    return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 700, autoHideMenuBar: true, ...popupOptions } };
  });
  contents.on('did-create-window', (popup) => installAiSignIn(popup.webContents, { popupOptions }));
}
