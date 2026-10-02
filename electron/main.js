import { app, BrowserWindow, Menu, dialog, shell, ipcMain, session, clipboard, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installAiSignIn, signInWindowOpener } from './ai-browser-auth.js';
import { AI_SERVICES, isGoogleService } from '../src/js/ai-services.js';
import { realScaleFor } from '../src/js/page-zoom.js';
import { fetchPageTitle, fetchVideoPoster } from './link-metadata.js';
import { installContextMenu, registerEditingHandlers, writeImageToClipboard } from './context-menu.js';
import { purgeNoteFromBackups, purgeDeletedFromBackups } from './backup-purge.js';
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

/** The window's own base colour — what shows wherever the page paints nothing. */
const WINDOW_BG = '#17122A';
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
/** The Blink feature behind passkeys; switched off in every page the app shows (see below). */
export const NO_WEBAUTH = 'WebAuth';

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

/**
 * The folder the last export or import went to. Electron 43 opens every file
 * dialog in Downloads unless told otherwise, and the OS no longer remembers
 * the last folder for it; the app does, for as long as it runs (0.9.3).
 */
let lastFolder = null;

/**
 * The sheet a print goes on (0.9.3): the note's paper (page-mode.js), in
 * microns as Electron wants a size it has no name for; A4 for Nebula's own.
 */
const PAPER_MM = { nw: [297, 210], 'nw-portrait': [210, 297], nn: [210, 297], a3: [297, 420], a4: [210, 297], a5: [148, 210], b3: [353, 500], b4: [250, 353], b5: [176, 250] };
function printPageSize(page) {
  const mm = PAPER_MM[String(page || '')];
  return mm ? { width: mm[0] * 1000, height: mm[1] * 1000 } : 'A4';
}
const PDF_OPTIONS = {
  // The note's own frame and code-block fills are part of how it reads.
  printBackground: true,
  pageSize: 'A4',
  // The page box comes from the document's own `@page`, exactly. Without
  // this Chromium rounds it — the sheet came out 795x1124 while the page box
  // was 794x1123 offset by a pixel, leaving a 0.75pt strip of the document's
  // background along the top edge of every page.
  preferCSSPageSize: true,
};
/** Where the export preview keeps its PDF while it is open: this app's own (Nebula Test and Nebula never share it). */
const pdfPreviewDir = () => path.join(app.getPath('userData'), 'pdf-preview');
/** The preview's own session: a PDF shown, nothing navigated, nothing opened. */
const PDF_PREVIEW_PARTITION = 'nebula-pdf-preview';
const inLastFolder = (name) => (lastFolder ? path.join(lastFolder, path.basename(name)) : name);
const backupsRoot = () => path.join(app.getPath('userData'), 'backups');

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
    const backupsDir = backupsRoot();
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
      // When the notes deleted before 0.9.1 were taken out of the backups.
      ...(meta.deletedNotesPurged ? { deletedNotesPurged: meta.deletedNotesPurged } : {}),
    };
    fsSync.mkdirSync(storageRoot(), { recursive: true });
    fsSync.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.warn('[nebula] vault meta write failed:', err.message);
  }
}

/**
 * Once per vault: the notes deleted before 0.9.1 come out of the backups
 * (backup-purge.js). From then on a note leaves the backups as it leaves the
 * vault, so this never has to run again. An empty or unreadable vault is not
 * purged against — it is tried again on the next start.
 */
function purgeOldDeletions() {
  const file = path.join(storageRoot(), 'meta.json');
  let meta = {};
  try { meta = JSON.parse(fsSync.readFileSync(file, 'utf8')); } catch { /* no stamp yet */ }
  if (meta.deletedNotesPurged) return;
  try {
    const result = purgeDeletedFromBackups(path.join(storageRoot(), 'notes'), backupsRoot());
    if (result.refused) return;
    meta.deletedNotesPurged = new Date().toISOString();
    fsSync.writeFileSync(file, JSON.stringify(meta, null, 2), 'utf8');
    if (result.removed) console.info(`[nebula] ${result.removed} backup copies of deleted notes removed`);
  } catch (err) {
    console.warn('[nebula] purging deleted notes from backups failed:', err.message);
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
let quitRequested = false;
let saveRequestId = 0;
const rendererSavers = new Map();

/** Resolve only when the renderer has flushed its buffers and disk queue. */
function requestRendererSave(win) {
  if (!win || win.isDestroyed()) return Promise.resolve();
  const saver = rendererSavers.get(win.webContents.id);
  // No editable note exists before boot registers the save listener.
  if (!saver) return Promise.resolve();
  if (saver.pending) return saver.pending.promise;
  const requestId = ++saveRequestId;
  let finish;
  const promise = new Promise((resolve, reject) => {
    finish = (error) => error ? reject(new Error(error)) : resolve();
  });
  const timeout = setTimeout(() => {
    if (saver.pending?.requestId !== requestId) return;
    saver.pending = null;
    finish('Saving did not finish. Please try again before closing Nebula.');
  }, 15_000);
  saver.pending = { requestId, promise, finish, timeout };
  win.webContents.send('lifecycle:save', requestId);
  return promise;
}

app.on('before-quit', () => { quitRequested = true; });
// The export preview's PDFs hold notes: none outlives the app (0.9.3).
app.on('will-quit', () => { try { fsSync.rmSync(pdfPreviewDir(), { recursive: true, force: true }); } catch { /* in use */ } });

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
    titleBarOverlay: { color: '#100C1E', symbolColor: '#EDE7F7', height: 37 },
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
    backgroundColor: WINDOW_BG,
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
      disableBlinkFeatures: NO_WEBAUTH,
    },
  });
  // Every AI tab and embed is a <webview>: passkeys off in each (see NO_WEBAUTH).
  win.webContents.on('will-attach-webview', (_e, webPreferences) => {
    webPreferences.disableBlinkFeatures = [webPreferences.disableBlinkFeatures, NO_WEBAUTH].filter(Boolean).join(',');
  });

  const restored = savedBounds();
  if (restored) win.setBounds(restored);
  // A window that was maximized opens maximized — but maximize() on a hidden
  // window shows it at once on Windows, before the page has painted, and the
  // page first laid itself out at the saved (half-screen) size: the app opened
  // "as if the screen were split in two" (the owner, 0.9.3, Electron 44). The
  // page is laid out at the screen's size from the start, and the window is
  // maximized only as it is shown; leaving maximized goes back to the saved size.
  const startMaximized = !!readPrefs().maximized;
  if (startMaximized) {
    try { win.setBounds(screen.getDisplayMatching(restored ?? win.getBounds()).workArea); } catch { /* no display info */ }
  }

  // Actual size needs the monitor's physical width, which Windows takes a moment
  // to tell: asked now, so it is ready by the time a note opens.
  void realScale(win);

  win.once('ready-to-show', () => {
    if (startMaximized) {
      win.maximize();
      if (restored) win.once('unmaximize', () => { if (!win.isDestroyed()) win.setBounds(restored); });
    }
    win.show();
  });

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
  let allowClose = false;
  let closing = false;
  win.on('close', (event) => {
    remember();
    if (allowClose || !rendererSavers.has(win.webContents.id)) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    void requestRendererSave(win).then(() => {
      if (win.isDestroyed()) return;
      allowClose = true;
      if (quitRequested) app.quit();
      else win.close();
    }).catch(async (error) => {
      quitRequested = false;
      closing = false;
      if (win.isDestroyed()) return;
      await dialog.showMessageBox(win, {
        type: 'error', buttons: ['Keep editing'],
        message: 'Your latest changes could not be saved.',
        detail: `${error.message}\nThe window has stayed open so you can retry saving.`,
      });
    });
  });

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
  installContextMenu(win);
  const contentsId = win.webContents.id;
  win.webContents.on('did-start-loading', () => {
    // Reload registers a fresh listener once its store has booted.
    if (!rendererSavers.get(contentsId)?.pending) rendererSavers.delete(contentsId);
  });
  win.webContents.once('destroyed', () => {
    const pending = rendererSavers.get(contentsId)?.pending;
    if (pending) {
      clearTimeout(pending.timeout);
      pending.finish('The window closed before saving finished.');
    }
    rendererSavers.delete(contentsId);
  });
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

  ipcMain.handle('lifecycle:ready', (event) => {
    if (from(event) !== mainWindow) return false;
    if (!rendererSavers.has(event.sender.id)) rendererSavers.set(event.sender.id, { pending: null });
    return true;
  });
  ipcMain.on('lifecycle:saved', (event, result) => {
    const saver = rendererSavers.get(event.sender.id);
    const pending = saver?.pending;
    if (!pending || result?.requestId !== pending.requestId) return;
    clearTimeout(pending.timeout);
    saver.pending = null;
    pending.finish(result.ok === true ? null : String(result.error || 'Saving failed.'));
  });

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
  ipcMain.handle('window:snapshot', (e) => takeSnapshot(from(e)));
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
        height: 37,
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
  ipcMain.handle('app:open-external', (e, url) => {
    let parsed;
    try { parsed = new URL(String(url)); } catch { return false; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    shell.openExternal(parsed.href);
    return true;
  });

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
    // Text, or the bytes of a Word / OpenDocument file (0.9.3, office.js).
    const binary = content instanceof Uint8Array;
    if (!win || (typeof content !== 'string' && !binary)) return { ok: false };
    const FILTERS = {
      html: [{ name: 'HTML', extensions: ['html'] }],
      nebula: [{ name: 'Nebula note', extensions: ['json'] }],
      docx: [{ name: 'Word document', extensions: ['docx'] }],
      odt: [{ name: 'OpenDocument text', extensions: ['odt'] }],
      doc: [{ name: 'Word 97–2003 document', extensions: ['doc'] }],
      rtf: [{ name: 'Rich Text', extensions: ['rtf'] }],
      enex: [{ name: 'Evernote export', extensions: ['enex'] }],
    };
    const filters = FILTERS[format] ?? [{ name: 'Markdown', extensions: ['md'] }];
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export note',
      defaultPath: inLastFolder(String(suggested ?? 'Untitled')),
      filters,
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    lastFolder = path.dirname(filePath);
    try {
      await fs.writeFile(filePath, binary ? Buffer.from(content) : content, binary ? undefined : 'utf8');
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
  /**
   * Render a standalone document in a window of its own and print it.
   *
   * Printing the live window forced a choice between a white sheet and margins
   * that repeat: Chromium fills a page's margin band from a document background
   * colour captured once at load, outside the print stylesheet, so a dark app
   * framed every page. `@page { margin: 0 }` was the only way to a clean sheet,
   * and a page margin is the only kind that repeats.
   *
   * A document that is white from the moment it loads has neither problem. It
   * gets no preload, no Node and no JavaScript at all — it is the user's own
   * note, but it is also markup being handed to a fresh renderer, and this one
   * has nothing to offer it.
   */
  async function withPrintWindow(html, run) {
    const dir = await fs.mkdtemp(path.join(app.getPath('temp'), 'nebula-print-'));
    const file = path.join(dir, 'note.html');
    await fs.writeFile(file, html, 'utf8');
    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      backgroundColor: '#FFFFFF',
      webPreferences: {
        javascript: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    try {
      await win.loadFile(file);
      // Web fonts (KaTeX) and the first layout; printing before they land gives
      // a page set in fallback faces.
      await new Promise((resolve) => { setTimeout(resolve, 350); });
      return await run(win);
    } finally {
      try { win.destroy(); } catch { /* already gone */ }
      try { await fs.rm(dir, { recursive: true, force: true }); } catch { /* leave it */ }
    }
  }

  /**
   * The PDF export's preview (0.9.3, the owner: "a preview of which page and
   * which style the export will be, in a panel that suits the app"). The PDF
   * is made once and shown from a file of its own; Export saves that same PDF.
   * The file holds the note, so it goes when the preview closes, and anything a
   * crash left behind goes at the next start (deleted notes stay deleted).
   */
  const previews = new Map();          // token -> { file, data }
  async function dropPreview(token) {
    const p = previews.get(token);
    previews.delete(token);
    if (p) await fs.rm(p.file, { force: true }).catch(() => {});
  }
  ipcMain.handle('note:pdf-preview', async (e, { document: html } = {}) => {
    if (!from(e) || typeof html !== 'string' || !html) return { ok: false };
    try {
      const data = await withPrintWindow(html, (w) => w.webContents.printToPDF(PDF_OPTIONS));
      await fs.mkdir(pdfPreviewDir(), { recursive: true });
      const token = randomUUID();
      const file = path.join(pdfPreviewDir(), `${token}.pdf`);
      await fs.writeFile(file, data);
      previews.set(token, { file, data });
      return { ok: true, token, url: pathToFileURL(file).href, bytes: data.length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('note:pdf-save', async (e, { token, suggested } = {}) => {
    const win = from(e);
    const p = previews.get(token);
    if (!win || !p) return { ok: false };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export as PDF',
      defaultPath: inLastFolder(String(suggested ?? 'Untitled.pdf')),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    lastFolder = path.dirname(filePath);
    try {
      await fs.writeFile(filePath, p.data);
      await dropPreview(token);
      return { ok: true, path: filePath, bytes: p.data.length, via: 'preview' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('note:pdf-discard', (_e, token) => dropPreview(token));

  ipcMain.handle('note:pdf', async (e, { suggested, document: html } = {}) => {
    const win = from(e);
    if (!win) return { ok: false };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export as PDF',
      defaultPath: inLastFolder(String(suggested ?? 'Untitled.pdf')),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    lastFolder = path.dirname(filePath);

    const options = PDF_OPTIONS;
    try {
      // A whole document, printed in a window of its own. Falling back to the
      // live window keeps the export working if the renderer is too old to send
      // one — it just loses the repeating margins.
      const data = html
        ? await withPrintWindow(html, (w) => w.webContents.printToPDF(options))
        : await win.webContents.printToPDF(options);
      await fs.writeFile(filePath, data);
      // `via` says which path produced it: the note's own white document, or
      // the live window as a fallback. Worth having in the return value — the
      // two differ in exactly the way that is hard to see from the outside.
      return { ok: true, path: filePath, bytes: data.length, via: html ? 'document' : 'window' };
    } catch (err) {
      return { ok: false, error: err.message };
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
  ipcMain.handle('note:print', async (e, { page } = {}) => {
    const win = from(e);
    if (!win) return { ok: false };
    return new Promise((resolve) => {
      win.webContents.print(
        { silent: false, printBackground: true, pageSize: printPageSize(page) },
        (ok, reason) => resolve({ ok, reason: reason ?? null }),
      );
    });
  });

  ipcMain.handle('note:import', async (e) => {
    const win = from(e);
    if (!win) return { ok: false };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      ...(lastFolder ? { defaultPath: lastFolder } : {}),
      title: 'Import a note',
      properties: ['openFile'],
      filters: [
        { name: 'Notes', extensions: ['md', 'markdown', 'html', 'htm', 'txt', 'json', 'docx', 'odt', 'doc', 'rtf', 'enex'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (!canceled && filePaths?.[0]) lastFolder = path.dirname(filePaths[0]);
    if (canceled || !filePaths?.length) return { ok: false, canceled: true };
    try {
      const file = filePaths[0];
      const name = path.basename(file);
      // Word and OpenDocument (0.9.3): the bytes go to the renderer, which reads
      // them (office.js) and sanitises the result like any HTML file. The old
      // binary .doc is read to its text here (word-extractor), as paragraphs.
      if (/\.(docx|odt|doc|rtf)$/i.test(name)) {
        const bytes = await fs.readFile(file);
        if (bytes.length > 64 * 1024 * 1024) return { ok: false, error: 'too large' };
        if (/\.doc$/i.test(name) && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
          const { default: WordExtractor } = await import('word-extractor');
          const doc = await new WordExtractor().extract(bytes);
          const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const html = String(doc.getBody() ?? '').split(/\r?\n/).map((line) => `<p>${esc(line) || '<br>'}</p>`).join('');
          return { ok: true, name: name.replace(/\.doc$/i, '.html'), text: html };
        }
        return { ok: true, name, bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
      }
      const text = await fs.readFile(file, 'utf8');
      // The renderer parses and sanitises it; the main process only reads bytes.
      return { ok: true, name, text };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

/**
 * F12: a picture of the window (0.8.9). Saved as a PNG in Pictures\Nebula and
 * put on the clipboard. Caught in the main process on every web contents —
 * the window and each embedded page or video — so it works wherever the
 * focus is; a key listener in the page would miss it inside an embed.
 */
export function snapshotName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `Nebula ${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}.${p(date.getMinutes())}.${p(date.getSeconds())}.png`;
}

async function takeSnapshot(win) {
  if (!win || win.isDestroyed()) return { ok: false };
  try {
    const image = await win.webContents.capturePage();
    await writeImageToClipboard(image);
    // NEBULA_SNAPSHOT_DIR lets the tests keep their pictures out of the user's folder.
    const dir = process.env.NEBULA_SNAPSHOT_DIR || path.join(app.getPath('pictures'), 'Nebula');
    await fs.mkdir(dir, { recursive: true });
    let file = path.join(dir, snapshotName());
    for (let n = 2; fsSync.existsSync(file); n += 1) file = file.replace(/( \(\d+\))?\.png$/, ` (${n}).png`);
    await fs.writeFile(file, image.toPNG());
    win.webContents.send('window:snapshot-taken', { ok: true, path: file });
    return { ok: true, path: file };
  } catch (err) {
    win.webContents.send('window:snapshot-taken', { ok: false, error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * No "allow public and private networks" prompt (0.9.3).
 *
 * The owner met Windows Firewall's question for nebula.exe and asked that the
 * app never need it. Nebula opens no server of its own; what asks is
 * Chromium's WebRTC in the AI tabs and embeds, which waits for other peers'
 * UDP packets on every network card (and announces itself over mDNS). With
 * this, WebRTC goes only through a relay the site provides, so nothing on the
 * machine waits for a connection from outside and Windows has nothing to ask.
 * A site's voice or video still works where the site offers a relay.
 */
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');

/**
 * No passkeys anywhere in the app (0.9.3). Google's sign-in (Gemini, and the
 * "Continue with Google" of ChatGPT and Mistral) asks for a passkey the moment
 * it opens, and Chromium in Electron answers with the Windows "Choose a
 * passkey" window before an address is typed. The page script in
 * ai-browser-auth.js did not reach every page in time (the owner met the
 * window again in Gemini); with WebAuth switched off in Blink the API is not
 * there at all, in every page, frame and popup, from the first load. Nebula
 * itself never uses it.
 */
app.commandLine.appendSwitch('disable-blink-features', 'WebAuth');
// Electron 36 and later lower-case what goes through app.commandLine, and a
// Blink feature name is case-sensitive: "webauth" switches nothing off. The
// same feature goes into every window's and webview's own preferences
// (disableBlinkFeatures), which is where Electron 44 honours it (0.9.3).

/**
 * Which way of signing in to Google worked for each site (0.9.3,
 * SIGN_IN_METHODS in ai-services.js): the sign-in window starts with it next
 * time. A small file in this copy's own folder — site addresses and a method
 * name, nothing from any note.
 */
const signInMemoryFile = () => path.join(app.getPath('userData'), 'sign-in-methods.json');
let signInMemoryCache = null;
const signInMemory = {
  get(site) {
    if (!signInMemoryCache) {
      try { signInMemoryCache = JSON.parse(fsSync.readFileSync(signInMemoryFile(), 'utf8')) || {}; } catch { signInMemoryCache = {}; }
    }
    return signInMemoryCache[site];
  },
  set(site, method) {
    if (!site || !method) return;
    this.get(site);
    if (signInMemoryCache[site] === method) return;
    signInMemoryCache[site] = method;
    try { fsSync.writeFileSync(signInMemoryFile(), JSON.stringify(signInMemoryCache, null, 2)); } catch { /* remembered for this run only */ }
  },
};
/**
 * What the sign-in windows did, step by step (0.9.3), so a sign-in that fails
 * on the owner's machine can be read afterwards: sign-in-log.txt in this
 * copy's folder, the last 400 lines. Addresses are redacted by redactUrl —
 * host and path only, never a code, token or e-mail.
 */
const signInLogFile = () => path.join(app.getPath('userData'), 'sign-in-log.txt');
function signInLog(event, data = {}) {
  const line = `${new Date().toISOString()} ${event} ${JSON.stringify(data)}\n`;
  try {
    fsSync.appendFileSync(signInLogFile(), line);
    const all = fsSync.readFileSync(signInLogFile(), 'utf8').split('\n');
    if (all.length > 480) fsSync.writeFileSync(signInLogFile(), all.slice(-400).join('\n'));
  } catch { /* the log is a help, never a reason to fail */ }
}

/**
 * Actual size (0.9.3): how much a CSS millimetre must be zoomed to be a real
 * one on this screen. Windows reports the monitor's physical width (WMI): in
 * millimetres from the monitor's own modes where it lists them, else in whole
 * centimetres (31 for a 309 mm screen: 0.3 % off); the screen's width in device-independent pixels over that
 * width, against CSS's 96 per inch, is the factor — Windows' own scaling falls
 * out of it. One monitor, or the one whose proportions match the window's
 * display; anything else (macOS, an unreadable or implausible answer) is 1.
 */
// One question, shared: the window asks as it is created and the page asks
// while Windows is still answering. A cached 1 set before the answer came back
// gave the page 1, and 100 % was CSS's size, not the paper's (0.9.3).
let realScaleAsked = null;
function realScale(win) {
  realScaleAsked ??= measureRealScale(win);
  return realScaleAsked;
}
async function measureRealScale(win) {
  let realScaleCache = 1;
  if (process.platform !== 'win32') return realScaleCache;
  try {
    const { execFile } = await import('node:child_process');
    const out = await new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$mm = @{}; Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorListedSupportedSourceModes -ErrorAction SilentlyContinue | ForEach-Object { $s = $_.MonitorSourceModes | Where-Object HorizontalImageSize | Select-Object -First 1; if ($s) { $mm[$_.InstanceName] = "$($s.HorizontalImageSize / 10) $($s.VerticalImageSize / 10)" } }; '
      + 'Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBasicDisplayParams | Where-Object Active | ForEach-Object { if ($mm[$_.InstanceName]) { $mm[$_.InstanceName] } else { "$($_.MaxHorizontalImageSize) $($_.MaxVerticalImageSize)" } }'],
    { timeout: 15000, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout))));
    const monitors = out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter((p) => p.length === 2).map(([w, h]) => ({ w, h }));
    const display = screen.getDisplayMatching(win?.getBounds?.() ?? screen.getPrimaryDisplay().bounds);
    realScaleCache = realScaleFor(display.size.width, display.size.height, monitors);
  } catch { realScaleCache = 1; }
  return realScaleCache;
}

/** The app's language, for the page a sign-in window shows when Google refused every way. */
const appLanguage = () => mainWindow?.webContents?.executeJavaScript("localStorage.getItem('nebula:lang') || 'en'").catch(() => 'en') ?? 'en';

app.on('web-contents-created', (_event, contents) => {
  try { contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp'); } catch { /* a contents that cannot take it */ }
  if (contents.getType() === 'webview' && contents.session === session.fromPartition(PDF_PREVIEW_PARTITION)) {
    // The export preview shows its PDF and nothing else: a link in the note is
    // not followed inside the preview, and nothing opens a window from it.
    contents.on('will-navigate', (ev) => ev.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
  if (contents.getType() === 'webview') {
    const id = Object.keys(AI_SERVICES).find(id => contents.session === session.fromPartition('persist:ai-' + id));
    // Google sign-in stays in the app, in this service's own session (0.9.2).
    if (id) {
      const popupOptions = { parent: mainWindow ?? undefined };
      // Gemini is Google's own: the whole tab is Firefox, not only the sign-in.
      const firefoxAlways = isGoogleService(AI_SERVICES[id]?.url);
      const openSignIn = signInWindowOpener(BrowserWindow, popupOptions, {
        memory: signInMemory,
        chromium: app.userAgentFallback,     // the engine as it is, without Electron's name
        platform: process.platform,
        language: appLanguage,
        log: signInLog,
      });
      installAiSignIn(contents, { popupOptions, openSignIn, firefoxAlways, log: signInLog });
    }
  }
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F12' || input.control || input.alt || input.shift || input.meta) return;
    event.preventDefault();
    const host = contents.hostWebContents || contents;
    void takeSnapshot(BrowserWindow.fromWebContents(host));
  });
});

app.whenReady().then(async () => {
  app.userAgentFallback = app.userAgentFallback
    .replace(/ Electron\/[\d.]+/gi, '')
    .replace(/ Nebula(?: Test)?\/[\d.]+/gi, '');
  // The app draws its own menus beside the logo, so the native bar goes.
  Menu.setApplicationMenu(null);
  registerShellHandlers();
  registerEditingHandlers(ipcMain, () => mainWindow);
  // Webviews load arbitrary sites — allow only what chat UIs legitimately need.
  const ALLOWED_PERMISSIONS = new Set([
    'media', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'openExternal',
  ]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(ALLOWED_PERMISSIONS.has(permission));
  });

  try { fsSync.rmSync(pdfPreviewDir(), { recursive: true, force: true }); } catch { /* another copy has one open */ }
  snapshotStorage();
  purgeOldDeletions();
  stampVaultMeta();

  ipcMain.handle('display:real-scale', (e) => realScale(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.handle('storage:root', () => storageRoot());
  // Before the renderer repairs every note in the vault (src/js/heal.js) — the
  // one step that writes notes nobody opened — the vault is put aside under a
  // label. A labelled copy is never overwritten, so asking twice keeps the first.
  ipcMain.handle('storage:backup', (_e, label) => {
    const safe = String(label ?? '').replace(/[^\w.-]/g, '').slice(0, 64);
    if (!safe) return { ok: false };
    const dest = snapshotStorage({ label: safe });
    return dest ? { ok: true, path: dest } : { ok: false };
  });

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
      // A note deleted from the vault (the Trash's Delete) leaves every backup
      // with it: a deleted note must not be recoverable (owner, 2026-09-27).
      const note = /^notes[\\/]([\w-]+)\.json$/.exec(String(rel));
      if (note) purgeNoteFromBackups(backupsRoot(), note[1]);
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

  ipcMain.handle('links:title', (event, url) => {
    if (event.sender !== mainWindow?.webContents) return { ok: false };
    return fetchPageTitle(url);
  });
  // A video's still and title, for an export "with video" (0.9.3).
  ipcMain.handle('links:video-poster', (event, url) => {
    if (event.sender !== mainWindow?.webContents) return { ok: false };
    return fetchVideoPoster(url);
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
    version: APP_VERSION,
    canSelfUpdate: canSelfUpdate(CHANNEL),
    getWindow: () => mainWindow,
    beforeInstall: async () => {
      await requestRendererSave(mainWindow);
      const backup = snapshotStorage({ label: `pre-update-${APP_VERSION}-${Date.now()}` });
      if (!backup) throw new Error('The backup could not be created. The update has not been installed.');
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
