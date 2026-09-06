/**
 * Update checking, in two modes behind one renderer contract.
 *
 *   auto   — packaged Windows installer build. electron-updater reads
 *            latest.yml from the GitHub release, downloads on request, and
 *            installs on restart.
 *   manual — everything else: macOS (Squirrel.Mac refuses to update an app
 *            that is not code-signed, and we have no Apple certificate), the
 *            portable exe (there is no installer to hand the update to), and
 *            `npm run dev`. We ask the GitHub API what the latest release is
 *            and, if it is newer, offer to open the download page.
 *
 * The renderer is told the mode but never has to branch on the platform: both
 * modes push the same `update:status` payload.
 *
 * Nothing downloads or installs without the user pressing a button —
 * autoDownload and autoInstallOnAppQuit are both off.
 */
import { app, ipcMain, net, shell } from 'electron';
import { isNewerVersion } from './version-compare.js';

export const REPO_OWNER = 'hero-999-dev';
export const REPO_NAME = 'nebula';
const RELEASES_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const API_LATEST = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

const FIRST_CHECK_MS = 10_000;      // let the window paint before touching the network
const RECHECK_MS = 6 * 60 * 60 * 1000;

/** Portable builds set this; there is no installer for an update to replace. */
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_DIR;

let mode = 'manual';
let autoUpdater = null;
let getWindow = () => null;
let beforeInstall = async () => {};
let status = { state: 'none', version: null, percent: 0, error: null, url: RELEASES_PAGE, mode: 'manual' };
let checking = false;

function setStatus(next) {
  status = { ...status, error: null, ...next, mode };
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status);
  return status;
}

/* ------------------------------------------------------------------ manual */

async function fetchLatestRelease() {
  const res = await net.fetch(API_LATEST, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Nebula/${app.getVersion()}`,
    },
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const json = await res.json();
  return {
    version: String(json.tag_name ?? '').replace(/^v/i, ''),
    url: json.html_url || RELEASES_PAGE,
  };
}

async function checkManual() {
  setStatus({ state: 'checking', percent: 0 });
  try {
    const latest = await fetchLatestRelease();
    if (latest.version && isNewerVersion(latest.version, app.getVersion())) {
      return setStatus({ state: 'manual', version: latest.version, url: latest.url });
    }
    return setStatus({ state: 'none', version: null, url: RELEASES_PAGE });
  } catch (err) {
    // No releases yet (404) is the normal state of a brand-new repo, not a fault.
    return setStatus({ state: 'error', error: err.message, url: RELEASES_PAGE });
  }
}

/* -------------------------------------------------------------------- auto */

async function loadAutoUpdater() {
  // Bundling mistakes must not brick the app: if electron-updater is missing
  // from the asar we drop to manual mode instead of throwing at startup.
  try {
    const mod = await import('electron-updater');
    return mod.default?.autoUpdater ?? mod.autoUpdater ?? null;
  } catch (err) {
    console.warn('[nebula] electron-updater unavailable, falling back to manual:', err.message);
    return null;
  }
}

function wireAutoUpdater(updater) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.logger = null;

  updater.on('checking-for-update', () => setStatus({ state: 'checking', percent: 0 }));
  updater.on('update-available', (info) => setStatus({ state: 'available', version: info?.version ?? null }));
  updater.on('update-not-available', () => setStatus({ state: 'none', version: null }));
  updater.on('download-progress', (p) => setStatus({ state: 'downloading', percent: Math.round(p?.percent ?? 0) }));
  updater.on('update-downloaded', (info) => setStatus({ state: 'downloaded', version: info?.version ?? null, percent: 100 }));
  updater.on('error', (err) => setStatus({ state: 'error', error: err?.message ?? String(err) }));
}

async function checkAuto() {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setStatus({ state: 'error', error: err?.message ?? String(err) });
  }
  return status;
}

/* ------------------------------------------------------------------ public */

async function runCheck() {
  if (checking) return status;
  checking = true;
  try {
    return mode === 'auto' ? await checkAuto() : await checkManual();
  } finally {
    checking = false;
  }
}

/**
 * @param {object} opts
 * @param {() => Electron.BrowserWindow|null} opts.getWindow  window to push status to
 * @param {() => Promise<void>} opts.beforeInstall            runs right before the app quits to install
 */
export async function initUpdater(opts = {}) {
  getWindow = opts.getWindow ?? getWindow;
  beforeInstall = opts.beforeInstall ?? beforeInstall;

  // Only an installed Windows build may replace itself. A test build is
  // packaged and on Windows too, so "packaged and win32" is not enough.
  const wantsAuto = opts.canSelfUpdate !== false
    && app.isPackaged && process.platform === 'win32' && !isPortable();
  if (wantsAuto) {
    autoUpdater = await loadAutoUpdater();
    if (autoUpdater) {
      mode = 'auto';
      wireAutoUpdater(autoUpdater);
    }
  }
  status = { ...status, mode };

  ipcMain.handle('update:state', () => status);
  ipcMain.handle('update:check', () => runCheck());

  ipcMain.handle('update:download', async () => {
    if (mode !== 'auto') return status;
    try {
      setStatus({ state: 'downloading', percent: 0 });
      await autoUpdater.downloadUpdate();
    } catch (err) {
      setStatus({ state: 'error', error: err?.message ?? String(err) });
    }
    return status;
  });

  ipcMain.handle('update:install', async () => {
    if (mode !== 'auto' || status.state !== 'downloaded') return status;
    // Snapshot the vault before we hand control to the installer. This is the
    // one moment where the app is replaced under the user's feet, so it is the
    // one moment worth an extra copy of their notes.
    try {
      await beforeInstall();
    } catch (err) {
      console.warn('[nebula] pre-update snapshot failed:', err.message);
    }
    // (isSilent, isForceRunAfter). isSilent MUST be true: with false the NSIS
    // assisted installer opens its wizard and waits for clicks, so the user
    // presses "Restart and install", the app closes, and they are left staring
    // at a setup dialog. They already consented by pressing the button — run it
    // silently and relaunch.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return status;
  });

  ipcMain.handle('update:open', async () => {
    await shell.openExternal(status.url || RELEASES_PAGE);
    return status;
  });

  // Automatic checks only in a real installed app; in dev the user can still
  // press the button, but nothing nags.
  if (app.isPackaged) {
    setTimeout(() => { runCheck().catch(() => {}); }, FIRST_CHECK_MS).unref?.();
    setInterval(() => { runCheck().catch(() => {}); }, RECHECK_MS).unref?.();
  }

  return { mode };
}
