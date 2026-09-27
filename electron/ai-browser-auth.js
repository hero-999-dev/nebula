/**
 * Google sign-in from the AI panel goes to the system browser.
 *
 * Google refuses sign-in inside embedded browsers, and a third-party web
 * session has no OAuth callback into Nebula. So when a service's webview heads
 * for accounts.google.com, the service's own page opens in the default browser
 * instead, where its cookies and sign-in flow stay together. The session does
 * not come back into the panel.
 */

export function isGoogleSignIn(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === 'accounts.google.com';
  } catch {
    return false;
  }
}

export function installBrowserAuth(contents, { serviceUrl, openExternal, notify, closePopup } = {}) {
  // One sign-in attempt redirects several times; open the browser only once.
  let handedOff = false;
  const handoff = () => {
    if (handedOff) return;
    handedOff = true;
    Promise.resolve()
      .then(() => openExternal(serviceUrl))
      .then(() => { notify?.({ ok: true, url: serviceUrl }); closePopup?.(); })
      .catch(() => { handedOff = false; notify?.({ ok: false, url: serviceUrl }); });
  };

  const navigate = (event, url, _inPlace, isMainFrame) => {
    if (isMainFrame === false || !isGoogleSignIn(url)) return;
    event.preventDefault();
    handoff();
  };
  contents.on('will-navigate', navigate);
  contents.on('will-redirect', navigate);

  contents.setWindowOpenHandler(({ url }) => {
    if (isGoogleSignIn(url)) { handoff(); return { action: 'deny' }; }
    try {
      if (!['https:', 'http:'].includes(new URL(url).protocol)) return { action: 'deny' };
    } catch {
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // A sign-in popup the service opens gets the same treatment, and closes itself.
  contents.on('did-create-window', (popup) => installBrowserAuth(popup.webContents, {
    serviceUrl, openExternal, notify, closePopup: () => popup.close(),
  }));

  return { reset: () => { handedOff = false; } };
}
