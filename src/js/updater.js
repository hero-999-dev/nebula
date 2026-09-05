/**
 * The update card: one small panel driven entirely by `update:status` from the
 * main process. The renderer never asks which platform it is on — the main
 * process decides whether an update can be installed in place ("auto") or only
 * downloaded from the browser ("manual"), and this just renders the state.
 */

const DISMISSED_KEY = 'nebula:update-dismissed';

const $ = (id) => document.getElementById(id);

let api = null;
let card = null;
let textEl = null;
let barEl = null;
let fillEl = null;
let actionEl = null;
let dismissEl = null;
let last = null;
let userAsked = false;   // a manual check reports "up to date" and errors; a background one stays quiet
let hideTimer = null;

function dismissedVersion() {
  try { return localStorage.getItem(DISMISSED_KEY); } catch { return null; }
}

function rememberDismissed(version) {
  try {
    if (version) localStorage.setItem(DISMISSED_KEY, version);
  } catch { /* private mode — nagging again next launch is acceptable */ }
}

function hide() {
  clearTimeout(hideTimer);
  card.hidden = true;
}

function show({ text, action, onAction, percent = null, canDismiss = true, autoHideMs = 0 }) {
  clearTimeout(hideTimer);
  textEl.textContent = text;

  const showBar = percent !== null;
  barEl.hidden = !showBar;
  if (showBar) fillEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;

  actionEl.hidden = !action;
  if (action) {
    actionEl.textContent = action;
    actionEl.onclick = onAction;
  }
  dismissEl.hidden = !canDismiss;

  card.hidden = false;
  if (autoHideMs) hideTimer = setTimeout(hide, autoHideMs);
}

function render(status) {
  last = status;
  switch (status.state) {
    case 'checking':
      if (userAsked) show({ text: 'Checking for updates…', canDismiss: false });
      return;

    case 'available':
      if (!userAsked && dismissedVersion() === status.version) return hide();
      return show({
        text: `Nebula ${status.version} is available.`,
        action: 'Update',
        onAction: () => api.download(),
      });

    case 'downloading':
      return show({
        text: `Downloading Nebula ${status.version ?? ''}…`.trim(),
        percent: status.percent ?? 0,
        canDismiss: false,
      });

    case 'downloaded':
      return show({
        text: `Nebula ${status.version} is ready. Your notes stay exactly where they are.`,
        action: 'Restart and install',
        onAction: () => api.install(),
      });

    case 'manual':
      if (!userAsked && dismissedVersion() === status.version) return hide();
      return show({
        text: `Nebula ${status.version} is available.`,
        action: 'Download',
        onAction: () => { api.open(); hide(); },
      });

    case 'error':
      if (!userAsked) return hide();
      return show({
        text: `Could not check for updates: ${status.error}`,
        action: 'Open releases',
        onAction: () => { api.open(); hide(); },
      });

    case 'none':
    default:
      if (!userAsked) return hide();
      return show({ text: 'Nebula is up to date.', autoHideMs: 4000 });
  }
}

/**
 * @param {object} opts
 * @param {HTMLElement|null} opts.checkButton  optional "Check for updates" control
 */
export function initUpdater({ checkButton = null } = {}) {
  api = window.nebula?.updates ?? null;
  card = $('update-card');
  if (!card) return false;

  if (!api) {
    // Browser preview — there is nothing to update.
    checkButton?.remove();
    return false;
  }

  textEl = $('uc-text');
  barEl = $('uc-bar');
  fillEl = $('uc-fill');
  actionEl = $('uc-action');
  dismissEl = $('uc-dismiss');

  dismissEl.addEventListener('click', () => {
    rememberDismissed(last?.version);
    hide();
  });

  api.onStatus((status) => render(status));

  checkButton?.addEventListener('click', async () => {
    userAsked = true;
    try {
      render(await api.check());
    } finally {
      // Later background checks stay silent again.
      setTimeout(() => { userAsked = false; }, 1000);
    }
  });

  // Pick up a status that arrived before this module was wired up.
  api.state().then((status) => { if (status && status.state !== 'none') render(status); }).catch(() => {});
  return true;
}

export async function showAppVersion(el) {
  if (!el) return;
  const version = await window.nebula?.version?.().catch(() => null);
  el.textContent = version ? `v${version}` : '';
}
