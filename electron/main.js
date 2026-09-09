import { app, BrowserWindow, Menu, dialog, shell, ipcMain, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initUpdater } from './updater.js';
import { resolveUserData, appChannel, canSelfUpdate } from './user-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The app's version, not Electron's.
 *
 * `app.getVersion()` reads the package.json of whatever directory Electron was
 * pointed at. Started as `electron dist-electron/main.js` — which is how the
 * smoke suite and a dev run both start it — that directory has no package.json,
 * so Electron answers with ITS OWN version instead. Everything downstream then
 * believes the app is v33.4.11: the sidebar prints it, and the what's-new card
 * looks up release notes for a version that will never have any and silently
 * shows nothing.
 */
function readAppVersion() {
  const reported = app.getVersion();
  if (reported && reported !== process.versions.electron) return reported;
  for (const dir of [path.join(__dirname, '..'), path.join(__dirname, '..', '..')]) {
    try {
      const pkg = JSON.parse(fsSync.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.version && pkg.name === 'nebula') return pkg.version;
    } catch { /* not there; try the next one */ }
  }
  return reported;
}
const APP_VERSION = readAppVersion();
const isDev = !!process.env.VITE_DEV_SERVER_URL;

// Windows groups taskbar buttons by AppUserModelID and takes the button's icon
// from whatever that id resolves to. electron-builder stamps this same id on the
// Start Menu and Desktop shortcuts, so setting it here is what makes the running
// app share their identity — and their icon — instead of getting a second,
// generic button. Must run before any window is created.
// (AppUserModelId is set below, once the packaged metadata has been read: the
// test build declares its own so Windows gives it a separate taskbar button.)

/**
 * The packaged package.json, which is where electron-builder's extraMetadata
 * lands. The test build sets `nebulaChannel` and `productName` there, so this
 * is how one bundle knows which build it is.
 */
function appMeta() {
  try {
    return JSON.parse(fsSync.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}
const META = appMeta();
const CHANNEL = appChannel({
  packaged: app.isPackaged,
  metaChannel: META.nebulaChannel,
  portableDir: process.env.PORTABLE_EXECUTABLE_DIR,
});
const APP_TITLE = META.productName ?? 'Nebula';

// Windows groups taskbar buttons by AppUserModelID and takes the button's icon
// from whatever that id resolves to. electron-builder stamps this same id on the
// Start Menu and Desktop shortcuts, so setting it here is what makes the running
// app share their identity — and their icon. The test build declares its own, so
// it gets a separate button rather than merging with the installed app.
if (process.platform === 'win32') {
  app.setAppUserModelId(META.nebulaAppId ?? 'com.nebula.app');
}

// Three ways to launch, three separate vaults — see electron/user-data.js.
// Without this a portable exe (including the one the repo builds into release/)
// runs on <appData>/nebula, which is the INSTALLED app's notes.
{
  const { dir } = resolveUserData({
    override: process.env.NEBULA_USER_DATA,
    portableDir: process.env.PORTABLE_EXECUTABLE_DIR,
    defaultDir: app.getPath('userData'),
  });
  app.setPath('userData', dir);
}

/** Notes live here as one JSON file per note. This directory is the vault. */
const storageRoot = () => path.join(app.getPath('userData'), 'storage');

function resolveInStorage(rel) {
  const root = storageRoot();
  const abs = path.resolve(root, String(rel ?? ''));
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('Invalid storage path');
  return abs;
}

/**
 * Copy the vault aside.
 *
 * Without a label this is the daily safety net: one copy per calendar day in
 * backups/YYYY-MM-DD, newest 7 kept. With a label it is an extra, un-rotated
 * copy — used right before an update installs, so a bad release can never be
 * the last thing that touched a user's notes. Only the dated directories are
 * ever pruned; labelled ones stay until the user removes them.
 */
function snapshotStorage({ label } = {}) {
  try {
    const src = storageRoot();
    if (!fsSync.existsSync(src)) return null;
    const backupsDir = path.join(app.getPath('userData'), 'backups');
    const name = label ?? new Date().toISOString().slice(0, 10);
    const dest = path.join(backupsDir, name);
    if (!fsSync.existsSync(dest)) {
      fsSync.mkdirSync(backupsDir, { recursive: true });
      fsSync.cpSync(src, dest, { recursive: true });
    }
    const dirs = fsSync.readdirSync(backupsDir)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    for (const dir of dirs.slice(0, -7)) {
      fsSync.rmSync(path.join(backupsDir, dir), { recursive: true, force: true });
    }
    return dest;
  } catch (err) {
    console.warn('[nebula] storage snapshot failed:', err.message);
    return null;
  }
}

/**
 * Record which version last opened this vault. Nothing reads it yet; it is what
 * a future format change will migrate from, and it makes "which build wrote
 * these files" answerable from the folder alone.
 */
function stampVaultMeta() {
  try {
    const file = path.join(storageRoot(), 'meta.json');
    let meta = {};
    if (fsSync.existsSync(file)) {
      try { meta = JSON.parse(fsSync.readFileSync(file, 'utf8')); } catch { meta = {}; }
    }
    const next = {
      schemaVersion: 1,
      appVersion: APP_VERSION,
      firstOpened: meta.firstOpened ?? new Date().toISOString(),
      lastOpened: new Date().toISOString(),
    };
    fsSync.mkdirSync(storageRoot(), { recursive: true });
    fsSync.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.warn('[nebula] vault meta write failed:', err.message);
  }
}

/**
 * Window geometry and zoom, remembered between launches.
 *
 * Kept beside the vault rather than in it: it is about this machine's window,
 * not about the notes, and it must never look like a note file to the mirror.
 */
function prefsFile() {
  return path.join(app.getPath('userData'), 'window.json');
}

function readPrefs() {
  try {
    return JSON.parse(fsSync.readFileSync(prefsFile(), 'utf8'));
  } catch {
    return {}; // no file, or a corrupt one: defaults are fine here
  }
}

function writePrefs(patch) {
  try {
    fsSync.mkdirSync(path.dirname(prefsFile()), { recursive: true });
    fsSync.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), ...patch }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[nebula] window prefs write failed:', err.message);
  }
}

const saveZoom = (level) => writePrefs({ zoom: level });

/** Only a plausible rectangle: a saved size from another monitor must not win. */
function savedBounds() {
  const { bounds } = readPrefs();
  if (!bounds) return null;
  const ok = ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(bounds[k]));
  if (!ok || bounds.width < 720 || bounds.height < 480) return null;
  return bounds;
}

let mainWindow = null;

/** The test build carries its own mark so the two are told apart at a glance. */
function windowIconPath() {
  if (process.platform !== 'win32') return '../build/icon.png';
  return CHANNEL === 'test' ? '../build/icon-test.ico' : '../build/icon.ico';
}

/**
 * The window's own frame, minus the strip Windows draws.
 *
 * `titleBarStyle: 'hidden'` keeps the resize borders and the native
 * minimise / maximise / close buttons (through `titleBarOverlay`) but hands the
 * left of the strip to the page, which is where the logo and the File / Edit /
 * View / Window / Help menus now live. The overlay colours follow the theme —
 * the renderer re-sends them through `window:overlay` when it changes.
 *
 * macOS keeps its traffic lights on the left; `hiddenInset` insets them, and
 * the page adds matching padding so nothing sits underneath.
 */
function titleBarOptions() {
  if (process.platform === 'darwin') return { titleBarStyle: 'hiddenInset' };
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#17122A', symbolColor: '#EDE7F7', height: 38 },
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#17122A',
    ...titleBarOptions(),
    // The .ico on Windows, not the 1024px PNG: the title bar draws at 16px, and
    // handing Electron one huge bitmap makes it downscale — which is what made
    // the title-bar and taskbar mark look mushy. The .ico carries a real 16px.
    icon: path.join(__dirname, windowIconPath()),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // AI panel embeds a real chat webview
    },
  });

  const restored = savedBounds();
  if (restored) win.setBounds(restored);
  if (readPrefs().maximized) win.maximize();

  win.once('ready-to-show', () => win.show());

  // Zoom is restored once the page exists, or it is applied to nothing.
  win.webContents.on('did-finish-load', () => {
    const { zoom } = readPrefs();
    if (Number.isFinite(zoom)) win.webContents.setZoomLevel(zoom);
  });

  const remember = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    writePrefs({ bounds: win.getNormalBounds(), maximized: win.isMaximized() });
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('maximize', remember);
  win.on('unmaximize', remember);
  win.on('close', remember);

  // The page's own title bar needs to know, so its maximise button can show
  // the right icon.
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    win.on(ev, () => {
      win.webContents.send('window:changed', {
        maximized: win.isMaximized(),
        fullScreen: win.isFullScreen(),
      });
    });
  }

  // index.html carries <title>Nebula</title>, and a loaded page's title wins
  // over the BrowserWindow one. The test build would otherwise say "Nebula" in
  // its title bar and Alt-Tab, which is exactly the confusion it exists to
  // avoid, so the window keeps the name the build was packaged under.
  win.on('page-title-updated', (event) => event.preventDefault());
  win.setTitle(APP_TITLE);

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  return win;
}

/**
 * Window and view controls for the in-page menus.
 *
 * The app draws its own File/Edit/View/Window/Help, so the renderer needs to be
 * able to do what the native menu roles used to. Every handler acts on the
 * window that sent the message, never on an arbitrary one.
 */
function registerShellHandlers() {
  const from = (event) => BrowserWindow.fromWebContents(event.sender);

  ipcMain.handle('window:minimize', (e) => { from(e)?.minimize(); return true; });
  ipcMain.handle('window:close', (e) => { from(e)?.close(); return true; });
  ipcMain.handle('window:maximize', (e) => {
    const win = from(e);
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('window:state', (e) => {
    const win = from(e);
    return { maximized: !!win?.isMaximized(), fullScreen: !!win?.isFullScreen() };
  });
  ipcMain.handle('window:fullscreen', (e) => {
    const win = from(e);
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });
  ipcMain.handle('window:overlay', (e, colors) => {
    const win = from(e);
    if (!win || process.platform === 'darwin' || !colors) return false;
    try {
      win.setTitleBarOverlay({
        color: String(colors.color ?? '#17122A'),
        symbolColor: String(colors.symbolColor ?? '#EDE7F7'),
        height: 38,
      });
      return true;
    } catch {
      return false; // an older Windows without the overlay is not an error
    }
  });

  // Zoom applies to THIS window, never to a focused <webview> guest — which is
  // why the default View roles looked like they did nothing while the AI panel
  // had focus. The level is remembered across launches.
  const ZOOM_MIN = -3;
  const ZOOM_MAX = 5;
  ipcMain.handle('view:zoom', (e, how) => {
    const win = from(e);
    if (!win) return 0;
    const wc = win.webContents;
    const current = wc.getZoomLevel();
    const next = how === 'reset' ? 0
      : how === 'in' ? Math.min(ZOOM_MAX, current + 0.5)
        : Math.max(ZOOM_MIN, current - 0.5);
    wc.setZoomLevel(next);
    saveZoom(next);
    return next;
  });
  ipcMain.handle('view:devtools', (e) => {
    from(e)?.webContents.toggleDevTools();
    return true;
  });
  ipcMain.handle('app:quit', () => { app.quit(); return true; });

  /**
   * Saving a note out, and reading one in.
   *
   * These are the only writes in the app that go OUTSIDE the vault, and they go
   * exactly where the user pointed in the save dialog — the renderer names a
   * suggested filename and hands over the bytes, never a path. `storage:write`
   * and its path guard are untouched.
   */
  ipcMain.handle('note:export', async (e, { suggested, content, format }) => {
    const win = from(e);
    if (!win || typeof content !== 'string') return { ok: false };
    const filters = format === 'html'
      ? [{ name: 'HTML', extensions: ['html'] }]
      : [{ name: 'Markdown', extensions: ['md'] }];
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export note',
      defaultPath: String(suggested ?? 'Untitled'),
      filters,
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
      await fs.writeFile(filePath, content, 'utf8');
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * A real PDF, from Chromium's own writer.
   *
   * `window.print()` hands the whole window to the OS print dialog; the user's
   * try.pdf came out of "Microsoft: Print To PDF" and read like a photograph of
   * the app. This is the same Skia writer Notion's export goes through, so the
   * text stays text and stays selectable.
   */
  ipcMain.handle('note:pdf', async (e, { suggested } = {}) => {
    const win = from(e);
    if (!win) return { ok: false };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export as PDF',
      defaultPath: String(suggested ?? 'Untitled.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    // The base background colour paints under everything and fills whatever the
    // page box does not cover — a hairline at the sheet's edge once the margin
    // band is gone. Nothing is transparent on screen, so swapping it to white
    // for the length of the export is invisible and leaves no colour that can
    // show through at all.
    const base = win.webContents.getBackgroundColor?.() ?? null;
    try {
      win.webContents.setBackgroundColor?.('#FFFFFF');
    } catch { /* older Electron; the print stylesheet still covers the page */ }
    try {
      // printBackground: the note's own frame and code-block fills are part of
      // how it reads; the print stylesheet already flattens the theme to paper.
      const data = await win.webContents.printToPDF({
        printBackground: true,
        // No margin BAND. Chromium fills a page's margin area with the view's
        // base background colour and paints no CSS background into it — so a
        // default-margin export came out as a white page inside a dark purple
        // frame (#17122A, this window's own backgroundColor) and no amount of
        // print CSS could reach it. With the margin at zero the whole sheet is
        // the page box, the print stylesheet's white covers it edge to edge,
        // and the margins are drawn as padding where they can be controlled.
        margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
        pageSize: 'A4',
      });
      await fs.writeFile(filePath, data);
      return { ok: true, path: filePath, bytes: data.length };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      try {
        if (base) win.webContents.setBackgroundColor?.(base);
      } catch { /* the window may already be gone */ }
    }
  });

  /**
   * Print through Chromium's own pipeline, not `window.print()`.
   *
   * `window.print()` hands the page to the platform and lets the printer driver
   * decide how to rasterise it — which on Windows means "Microsoft: Print To
   * PDF" producing something that reads like a picture of the app. Going
   * through webContents.print keeps Chromium's own layout and text output all
   * the way to the driver, with the print stylesheet applied.
   */
  ipcMain.handle('note:print', async (e) => {
    const win = from(e);
    if (!win) return { ok: false };
    return new Promise((resolve) => {
      win.webContents.print(
        { silent: false, printBackground: true, pageSize: 'A4' },
        (ok, reason) => resolve({ ok, reason: reason ?? null }),
      );
    });
  });

  ipcMain.handle('note:import', async (e) => {
    const win = from(e);
    if (!win) return { ok: false };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Import a note',
      properties: ['openFile'],
      filters: [
        { name: 'Notes', extensions: ['md', 'markdown', 'html', 'htm', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (canceled || !filePaths?.length) return { ok: false, canceled: true };
    try {
      const file = filePaths[0];
      const text = await fs.readFile(file, 'utf8');
      // The renderer parses and sanitises it; the main process only reads bytes.
      return { ok: true, name: path.basename(file), text };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

app.whenReady().then(async () => {
  // The app draws its own menus beside the logo, so the native bar goes.
  Menu.setApplicationMenu(null);
  registerShellHandlers();
  // Webviews load arbitrary sites — allow only what chat UIs legitimately need.
  const ALLOWED_PERMISSIONS = new Set([
    'media', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'openExternal',
  ]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(ALLOWED_PERMISSIONS.has(permission));
  });

  snapshotStorage();
  stampVaultMeta();

  ipcMain.handle('storage:root', () => storageRoot());

  ipcMain.handle('storage:read', async (_e, rel) => {
    try {
      const data = await fs.readFile(resolveInStorage(rel), 'utf8');
      return { ok: true, data };
    } catch (err) {
      // "not there" and "could not be read" are different answers. Collapsing
      // them is what lets a transient failure look like an empty vault.
      return { ok: false, missing: err.code === 'ENOENT', error: err.message };
    }
  });

  // Atomic: write a temp file then rename over the target, so a note file is
  // never left half-written (a crash or a racing write can't corrupt it).
  ipcMain.handle('storage:write', async (_e, rel, content) => {
    const abs = resolveInStorage(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await fs.writeFile(tmp, content, 'utf8');
      await fs.rename(tmp, abs);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
    return { ok: true, path: abs };
  });

  ipcMain.handle('storage:list', async (_e, relDir) => {
    try {
      const files = await fs.readdir(resolveInStorage(relDir));
      return { ok: true, files: files.filter((f) => f.endsWith('.json') && f !== 'meta.json') };
    } catch (err) {
      // A missing directory really is an empty vault — a first run. Anything
      // else (permissions, a locked profile, a bad path) is a failure, and the
      // renderer must NOT treat it as "no notes yet" and seed over the top.
      if (err.code === 'ENOENT') return { ok: true, files: [] };
      console.warn('[nebula] storage list failed:', err.message);
      return { ok: false, files: [], error: err.message };
    }
  });

  ipcMain.handle('storage:delete', async (_e, rel) => {
    try {
      const abs = resolveInStorage(rel);
      if (!rel || abs === storageRoot()) return { ok: false };
      await fs.rm(abs, { recursive: true, force: true });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('storage:reveal', async (_e, rel) => {
    const abs = resolveInStorage(rel);
    try {
      await fs.access(abs);
      shell.showItemInFolder(abs);
    } catch {
      await fs.mkdir(storageRoot(), { recursive: true });
      shell.openPath(storageRoot());
    }
    return { ok: true, path: abs };
  });

  ipcMain.handle('app:version', () => APP_VERSION);

  // The four places a user ever needs to find: the program, their notes, the
  // backups, and the profile that holds both. About renders them and can open
  // each one — which is the whole answer to "where is this thing installed".
  const appPaths = () => ({
    version: APP_VERSION,
    channel: CHANNEL,
    platform: process.platform,
    exeDir: process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')),
    userData: app.getPath('userData'),
    storage: storageRoot(),
    backups: path.join(app.getPath('userData'), 'backups'),
  });
  ipcMain.handle('app:paths', () => appPaths());

  // Reveal by KEY, never by a path from the renderer: the renderer can ask for
  // "storage", not for an arbitrary directory.
  ipcMain.handle('app:reveal', async (_e, key) => {
    const paths = appPaths();
    const target = { exeDir: paths.exeDir, userData: paths.userData, storage: paths.storage, backups: paths.backups }[key];
    if (!target) return { ok: false };
    await fs.mkdir(target, { recursive: true }).catch(() => {});
    await shell.openPath(target);
    return { ok: true, path: target };
  });

  createWindow();

  // Packaged macOS takes its Dock icon from the .app bundle's .icns; a dev run
  // has no bundle and shows Electron's default until told otherwise.
  if (process.platform === 'darwin' && !app.isPackaged && app.dock) {
    try {
      app.dock.setIcon(path.join(__dirname, '../build/icon.png'));
    } catch (err) {
      console.warn('[nebula] dock icon failed:', err.message);
    }
  }

  await initUpdater({
    canSelfUpdate: canSelfUpdate(CHANNEL),
    getWindow: () => mainWindow,
    beforeInstall: async () => {
      snapshotStorage({ label: `pre-update-${APP_VERSION}-${Date.now()}` });
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
