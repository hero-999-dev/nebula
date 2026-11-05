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
 *   test   — the test build (2026-11-05: "testte güncellensin, track etsin").
 *            It follows the newest `test-*` pre-release on GitHub: its
 *            test-build.json says when that build was packed, and a later one
 *            is downloaded beside the running exe and put in its place on
 *            restart. A test build syncs only with the very same build, so
 *            every device has to follow it.
 *
 * The renderer is told the mode but never has to branch on the platform: both
 * modes push the same `update:status` payload.
 *
 * Nothing downloads or installs without the user pressing a button —
 * autoDownload and autoInstallOnAppQuit are both off.
 */
import { app, ipcMain, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isNewerVersion } from './version-compare.js';

export const REPO_OWNER = 'hero-999-dev';
export const REPO_NAME = 'nebula';
const RELEASES_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const API_LATEST = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

const FIRST_CHECK_MS = 2_000;      // let the window paint before touching the network
const RECHECK_MS = 6 * 60 * 60 * 1000;
const TEST_RECHECK_MS = 30 * 60 * 1000;   // test builds come often; the API allows 60 asks an hour
const API_RELEASES = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=20`;
const TEST_EXE = 'Nebula-Test.exe';
const TEST_STAMP_FILE = 'test-build.json';

/** Portable builds set this; there is no installer for an update to replace. */
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_DIR;

let mode = 'manual';
let autoUpdater = null;
let getWindow = () => null;
let beforeInstall = async () => {};
let status = { state: 'none', version: null, percent: 0, error: null, url: RELEASES_PAGE, mode: 'manual' };
let checking = false;
let currentVersion = '';
let testStamp = null;
/** The newer test build found: its page, its exe and how big, its stamp. */
let testOffer = null;

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
      'User-Agent': `Nebula/${currentVersion}`,
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
    if (latest.version && isNewerVersion(latest.version, currentVersion)) {
      return setStatus({ state: 'manual', version: latest.version, url: latest.url });
    }
    return setStatus({ state: 'none', version: null, url: RELEASES_PAGE });
  } catch (err) {
    // No releases yet (404) is the normal state of a brand-new repo, not a fault.
    return setStatus({ state: 'error', error: err.message, url: RELEASES_PAGE });
  }
}

/* -------------------------------------------------------------------- test */

/** 20261105-0224 → 2026-11-05 02:24, the way the card shows it. Pure — tested. */
export function stampLabel(stamp) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(String(stamp ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : String(stamp ?? '');
}

/**
 * The newest test build among GitHub's releases: the first `test-*`
 * pre-release carrying both the exe and its stamp file. Pure — tested.
 */
export function pickTestRelease(releases) {
  for (const r of releases ?? []) {
    if (!r?.prerelease || !/^test-/.test(String(r.tag_name ?? ''))) continue;
    const exe = r.assets?.find((a) => a.name === TEST_EXE);
    const stamp = r.assets?.find((a) => a.name === TEST_STAMP_FILE);
    if (exe && stamp) return { url: r.html_url, exe: exe.browser_download_url, size: exe.size, stampUrl: stamp.browser_download_url };
  }
  return null;
}

/** Whether `theirs` was packed after `mine`: stamps are date then time, so they sort. Pure — tested. */
export const isLaterStamp = (theirs, mine) => !!theirs && /^\d{8}-\d{4}$/.test(theirs) && (!mine || theirs > mine);

const github = (url) => net.fetch(url, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Nebula/${currentVersion}` },
});

/** The exe the user double-clicked — not the copy unpacked to run. */
const ownExe = () => process.env.PORTABLE_EXECUTABLE_FILE || '';

async function checkTest() {
  if (status.state === 'downloading' || status.state === 'downloaded') return status;
  setStatus({ state: 'checking', percent: 0 });
  try {
    const res = await github(API_RELEASES);
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const found = pickTestRelease(await res.json());
    if (!found) return setStatus({ state: 'none', version: null });
    const stampRes = await github(found.stampUrl);
    if (!stampRes.ok) throw new Error(`GitHub returned ${stampRes.status}`);
    const theirs = String((await stampRes.json())?.stamp ?? '');
    if (!isLaterStamp(theirs, testStamp)) { testOffer = null; return setStatus({ state: 'none', version: null }); }
    testOffer = { ...found, stamp: theirs };
    return setStatus({ state: 'available', version: `Test ${stampLabel(theirs)}`, url: found.url });
  } catch (err) {
    return setStatus({ state: 'error', error: err.message, url: RELEASES_PAGE });
  }
}

async function downloadTest() {
  const exe = ownExe();
  // Not started from its exe (a dev run): there is nothing to replace, so the page opens instead.
  if (!testOffer || !exe) { await shell.openExternal(testOffer?.url || RELEASES_PAGE); return status; }
  const part = `${exe}.download`;
  try {
    setStatus({ state: 'downloading', percent: 0 });
    const res = await net.fetch(testOffer.exe);
    if (!res.ok || !res.body) throw new Error(`GitHub returned ${res.status}`);
    const total = Number(res.headers.get('content-length')) || testOffer.size || 0;
    const out = fs.createWriteStream(part);
    let got = 0;
    let shown = -1;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      const percent = total ? Math.floor((got / total) * 100) : 0;
      if (percent !== shown) { shown = percent; setStatus({ state: 'downloading', percent }); }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    if (testOffer.size && got !== testOffer.size) throw new Error('The download came in incomplete.');
    fs.renameSync(part, `${exe}.new`);
    return setStatus({ state: 'downloaded', percent: 100 });
  } catch (err) {
    fs.rmSync(part, { force: true });
    return setStatus({ state: 'error', error: err?.message ?? String(err) });
  }
}

/**
 * The lines that put the new exe in place once this one has closed, and open
 * it. The portable launcher holds its exe until the app is gone, so the move
 * is tried again each second, for a minute. Pure — tested.
 */
export function swapScript(exe, fresh) {
  const q = (p) => `"${p}"`;
  return [
    '@echo off',
    'set tries=0',
    ':again',
    `move /y ${q(fresh)} ${q(exe)} >nul 2>&1 && goto done`,
    'set /a tries+=1',
    'if %tries% geq 60 goto done',
    'timeout /t 1 /nobreak >nul',
    'goto again',
    ':done',
    `start "" ${q(exe)}`,
    '(goto) 2>nul & del "%~f0"',
    '',
  ].join('\r\n');
}

async function installTest() {
  const exe = ownExe();
  const fresh = `${exe}.new`;
  if (!exe || !fs.existsSync(fresh)) return status;
  try {
    await beforeInstall();
  } catch (err) {
    return setStatus({ state: 'error', error: err?.message ?? String(err) });
  }
  const script = path.join(os.tmpdir(), `nebula-test-update-${Date.now()}.cmd`);
  fs.writeFileSync(script, swapScript(exe, fresh));
  spawn('cmd.exe', ['/d', '/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  setImmediate(() => app.quit());
  return status;
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
    if (mode === 'test') return await checkTest();
    return mode === 'auto' ? await checkAuto() : await checkManual();
  } finally {
    checking = false;
  }
}

/**
 * @param {object} opts
 * @param {() => Electron.BrowserWindow|null} opts.getWindow  window to push status to
 * @param {() => Promise<void>} opts.beforeInstall            runs right before the app quits to install
 * @param {string} opts.version                              resolved Nebula package version, including dev runs
 */
export async function initUpdater(opts = {}) {
  getWindow = opts.getWindow ?? getWindow;
  beforeInstall = opts.beforeInstall ?? beforeInstall;
  currentVersion = opts.version ?? app.getVersion();
  testStamp = opts.testStamp ?? null;

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
  if (testStamp) mode = 'test';
  status = { ...status, mode };

  ipcMain.handle('update:state', () => status);
  ipcMain.handle('update:check', () => runCheck());

  ipcMain.handle('update:download', async () => {
    if (mode === 'test') return downloadTest();
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
    if (mode === 'test' && status.state === 'downloaded') return installTest();
    if (mode !== 'auto' || status.state !== 'downloaded') return status;
    // Snapshot the vault before we hand control to the installer. This is the
    // one moment where the app is replaced under the user's feet, so it is the
    // one moment worth an extra copy of their notes.
    try {
      await beforeInstall();
    } catch (err) {
      console.warn('[nebula] pre-update snapshot failed:', err.message);
      return setStatus({ state: 'error', error: err?.message ?? String(err) });
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
  // A check on every launch, in every channel. It used to be packaged builds
  // only, so a dev run never checked and nobody could see the path working;
  // and ten seconds was long enough that the launch check looked like no check.
  setTimeout(() => { runCheck().catch(() => {}); }, FIRST_CHECK_MS).unref?.();
  setInterval(() => { runCheck().catch(() => {}); }, mode === 'test' ? TEST_RECHECK_MS : RECHECK_MS).unref?.();

  return { mode };
}
