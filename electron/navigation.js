/**
 * Where the app's window may go, and what it may hand to the system (hunt B21).
 *
 * The window shows the app and nothing else. A plain click on a link in a part
 * of a note that is not editable (one brought in from another copy can have
 * any) loaded that page IN the window — and preload.js gave the page the whole
 * bridge: the notes, the black holes, the lock. A link that opens a new window
 * went to `shell.openExternal` whatever its scheme, and a `file:` address there
 * runs a program.
 */

/**
 * Only the page already shown: a reload, or a jump to a place on it.
 * @param {string} target where the window is asked to go
 * @param {string} current where it is
 */
export function staysOnPage(target, current) {
  try {
    const to = new URL(String(target));
    const at = new URL(String(current));
    to.hash = '';
    at.hash = '';
    return to.href === at.href;
  } catch {
    return false;
  }
}

/**
 * A window a page embedded in a note asks for (hunt B23). Each became a window
 * of the app's own, with nobody clicking: one page opened fifteen in two
 * seconds, each the same page opening the next. Now a link goes to the browser
 * only just after the user pressed something in that page, once per press.
 * @param {() => number} [now]
 */
export function popupGate(now = Date.now) {
  let at = -Infinity;
  return {
    /** A mouse button or key went down in the page. */
    touched() { at = now(); },
    /** What the browser is given for this request: '' for nothing. */
    take(url) {
      const href = externalUrl(url);
      if (!href || now() - at > 1500) return '';
      at = -Infinity;
      return href;
    },
  };
}

/**
 * A link the system's browser or mail program may be given; '' for anything
 * else — `file:`, a UNC path, `ms-settings:` and the like, which Windows runs.
 * @param {string} raw
 */
export function externalUrl(raw) {
  try {
    const url = new URL(String(raw));
    return /^(https?|mailto):$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
