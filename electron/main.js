import { app, BrowserWindow, Menu, dialog, shell, ipcMain, session, clipboard, screen, protocol, safeStorage, systemPreferences } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installAiSignIn, signInWindowOpener } from './ai-browser-auth.js';
import { AI_SERVICES, isGoogleService } from '../src/js/ai-services.js';
import { realScaleFor } from '../src/js/page-zoom.js';
import { fetchPageTitle, fetchVideoPoster } from './link-metadata.js';
import { installContextMenu, registerEditingHandlers, writeImageToClipboard, forgetIgnoredWords } from './context-menu.js';
import { purgeNoteFromBackupsAsync, purgeDeletedFromBackups, purgeHoleNoteFromBackupsAsync, purgeHoleFromBackupsAsync, purgeHoleFilesFromBackupsAsync, protectLegacyHoleBackups, purgeUnnamedFromBackups, shredTree, pruneLabelled, oldWayCopies, dropOldWayCopies } from './backup-purge.js';
import { BlackHoles, WINDOWS_HELLO_SCRIPT, readHelloAnswer } from './black-holes.js';
import { AppLock } from './app-lock.js';
import { readLogo, writeLogo, clearLogo, pointShortcuts, makeShortcut, pinnedAppId, taskbarDetails } from './app-logo.js';
import { filesFromArgv, readNoteFile } from './open-file.js';
import { offerOpenWith } from './open-with.js';
import { attachedOf, attachedName, openedPath, runsCode, clearOpened as clearOpenedIn, clearOpenedAsync as clearOpenedAsyncIn } from './opened-files.js';
import { markOfTheWeb } from './mark-of-the-web.js';
import { vaultPresence } from './vault-presence.js';
import { staysOnPage, externalUrl, popupGate } from './navigation.js';
import { allowed, isChatSession, isEmbedSession, ASK_EMBED, askKeys, checkKey, askWords, pageAnswers } from './permissions.js';
import { words } from './dialog-words.js';
import {
  MEDIA_SCHEME, NOTE_ID, externalize, inlinePictures, rehome, removeNoteFolderAsync, tidyVault, addVideo, addAttachment, pictureDataUrl, travelWhole, travelFolder, noteFile, noteIds, snapshotVault, missingMedia, sweepNote, RELEASED_FILE, readReleased, writeReleased, noteReleases, releaseAdded,
  parseMediaUrl, mediaPath, mimeOf, byteRange, isVideoName, VIDEO_EXTENSIONS,
} from './note-media.js';
import { initUpdater } from './updater.js';
import { resolveUserData, appChannel, canSelfUpdate } from './user-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A note's pictures and videos are files in its folder (note-media.js); the
// note shows a video straight from there. Said before the app is ready, as
// Electron requires: a scheme pages may load media from, in pieces.
protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

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
const APP_ID = META.nebulaAppId ?? 'com.nebula.app';
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
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

/** Notes live here, each in a folder of its own: its JSON file, its pictures, its videos. This directory is the vault. */
const storageRoot = () => path.join(app.getPath('userData'), 'storage');
const notesRoot = () => path.join(storageRoot(), 'notes');
/** The note a vault path is the file of — `notes/<id>.json` — or null. */
const noteIdOf = (rel) => /^notes[\\/]([\w-]{1,120})\.json$/.exec(String(rel ?? ''))?.[1] ?? null;

/**
 * The folder the last export or import went to. Electron 43 opens every file
 * dialog in Downloads unless told otherwise, and the OS no longer remembers
 * the last folder for it; the app does, for as long as it runs (0.9.3).
 */
let lastFolder = null;
/** /video's dialog is open: asked for again meanwhile, there is still one. */
let pickingVideo = false;

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
/** Where the page a PDF is printed from lies while it prints: this app's own folder, never the system's. */
const pdfPrintDir = () => path.join(app.getPath('userData'), 'pdf-print');
/** The previews open now, each in a folder of its own under it: token -> { dir, file, data }. */
const previews = new Map();
let previewEpoch = 0;
/**
 * Every preview, and every page being printed, gone — shredded: they hold notes
 * in the clear. At a lock (a black hole's note may be among them), at quit and
 * at the start; a preview being made meanwhile is not kept.
 */
function dropAllPreviews() {
  previewEpoch += 1;
  previews.clear();
  for (const dir of [pdfPreviewDir(), pdfPrintDir()]) {
    try { shredTree(dir); } catch { /* another copy has one open: the next start */ }
  }
}
/**
 * Where an attached file is copied to be opened by its own program (0.9.6) —
 * opened-files.js says where each lies and when it goes.
 */
const openedDir = () => path.join(app.getPath('userData'), 'opened');
const clearOpened = (scope) => clearOpenedIn(openedDir(), scope);
const clearOpenedAsync = (scope) => clearOpenedAsyncIn(openedDir(), scope);
/** A Windows program may release a copy after its hole or note was removed. Retry then. */
function retryReleasedCopies() {
  let ids;
  try { ids = fsSync.readdirSync(path.join(openedDir(), 'hole'), { withFileTypes: true }); }
  catch { ids = []; }
  for (const entry of ids) {
    if (entry.isDirectory() && /^[\w-]{1,120}$/.test(entry.name) && !blackHoles.isOpen(entry.name)) {
      clearOpened({ holeId: entry.name });
    }
  }
  let existingNotes = noteIds(notesRoot());
  if (existingNotes === null) {
    try { fsSync.statSync(notesRoot()); return; }
    catch (err) { if (err.code !== 'ENOENT') return; existingNotes = new Set(); }
  }
  if (existingNotes === null) return; // an unreadable vault never justifies deleting copies
  let plain;
  try { plain = fsSync.readdirSync(path.join(openedDir(), 'note'), { withFileTypes: true }); }
  catch { return; }
  for (const entry of plain) {
    if (entry.isDirectory() && NOTE_ID.test(entry.name) && !existingNotes.has(entry.name)) {
      clearOpened({ noteId: entry.name });
    }
  }
}
/** The preview's own session: a PDF shown, nothing navigated, nothing opened. */
const PDF_PREVIEW_PARTITION = 'nebula-pdf-preview';
/** Where a link embedded in a note is shown (src/js/rich-paste.js makeLinkBlock). */
const EMBED_PARTITION = 'persist:embed';
const inLastFolder = (name) => (lastFolder ? path.join(lastFolder, path.basename(name)) : name);
const backupsRoot = () => path.join(app.getPath('userData'), 'backups');

function resolveInStorage(rel) {
  const root = storageRoot();
  const abs = path.resolve(root, String(rel ?? ''));
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('Invalid storage path');
  return abs;
}

/**
 * Where a vault path lies on the disk. To the window a note is
 * `notes/<id>.json`; on the disk its file is in the note's own folder,
 * `notes/<id>/<id>.json` (note-media.js).
 */
function inStorage(rel) {
  const id = noteIdOf(rel);
  return id ? noteFile(notesRoot(), id) : resolveInStorage(rel);
}

/**
 * Copy the vault aside.
 *
 * Without a label this is the daily safety net: one copy per calendar day in
 * backups/YYYY-MM-DD, made at the first start of that day, and the newest
 * alone is kept — seven were, until the owner (0.9.4): "not seven days: a
 * copy of twenty-four hours, on an exFAT flash drive and a network drive
 * too." With a label it is an extra, un-rotated copy — used right before an
 * update installs, so a bad release can never be the last thing that touched
 * a user's notes. Of the labelled ones the app makes itself — before an
 * update, before a repair of old notes — the newest of each kind is kept
 * (backup-purge.js pruneLabelled). A label of any other kind stays until the
 * user removes it.
 *
 * A copy holds a file named `.making` while it is being made: one the app
 * was closed over is no copy — it is removed and made again — so the copy
 * before it is never given up for half a one.
 *
 * A copy holds the notes' own files; their pictures and videos, which never
 * change once written, it shares with the vault instead of copying
 * (note-media.js snapshotVault) — "I do not want the backups to take up a
 * great deal of room" (the owner, 0.9.4).
 */
const KEEP_DAILY = 1;
const MAKING = '.making';
function snapshotStorage({ label } = {}) {
  try {
    const src = storageRoot();
    if (!fsSync.existsSync(src)) return null;
    const backupsDir = backupsRoot();
    const name = label ?? new Date().toISOString().slice(0, 10);
    const dest = path.join(backupsDir, name);
    fsSync.mkdirSync(backupsDir, { recursive: true });
    const half = (dir) => fsSync.existsSync(path.join(backupsDir, dir, MAKING));
    const dated = () => fsSync.readdirSync(backupsDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (half(name)) fsSync.rmSync(dest, { recursive: true, force: true });
    if (!fsSync.existsSync(dest)) {
      fsSync.mkdirSync(dest, { recursive: true });
      fsSync.writeFileSync(path.join(dest, MAKING), '');
      // The daily copy takes the place of the one before it, and where the disk
      // cannot share a file it takes that one's pictures and videos over
      // instead of copying them again (note-media.js snapshotVault).
      const before = label ? null : dated().filter((d) => d !== name && !half(d)).pop();
      snapshotVault(src, dest, before ? path.join(backupsDir, before) : null);
      fsSync.rmSync(path.join(dest, MAKING), { force: true });
    }
    for (const dir of dated().filter((d) => !half(d)).slice(0, -KEEP_DAILY)) {
      fsSync.rmSync(path.join(backupsDir, dir), { recursive: true, force: true });
    }
    const gone = pruneLabelled(backupsDir);
    if (gone.length) console.info(`[nebula] backups: older copies of their kind removed — ${gone.join(', ')}`);
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
      // 2: a note's pictures and videos are files in its own folder (0.9.4, note-media.js).
      // 3: the note's own file is in that folder too.
      schemaVersion: 3,
      appVersion: APP_VERSION,
      firstOpened: meta.firstOpened ?? new Date().toISOString(),
      lastOpened: new Date().toISOString(),
      // When the notes deleted before 0.9.1 were taken out of the backups.
      ...(meta.deletedNotesPurged ? { deletedNotesPurged: meta.deletedNotesPurged } : {}),
      // A list of what the person takes out of their notes is kept from here on (note-media.js noteReleases):
      // should it ever be missing, nothing counts as taken out — rather than everything.
      releasedList: true,
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
 * Windows Hello or Touch ID, for a black hole that is opened by one (0.9.4,
 * black-holes.js). On Windows the question is put by Windows PowerShell, which
 * can reach the Windows Runtime; on a Mac by Electron itself. NEBULA_HELLO
 * lets a test be the answer: `ok`, `no`, or `none` for a computer without it.
 */
function askWindowsHello(ask, reason = '') {
  return new Promise((resolve) => {
    import('node:child_process').then(({ execFile }) => {
      // The question is the app's window's: it stands in front of it, not behind (black-holes.js).
      let owner = '';
      try {
        const handle = ask && mainWindow && !mainWindow.isDestroyed() ? mainWindow.getNativeWindowHandle() : null;
        if (handle) owner = String(handle.length >= 8 ? handle.readBigUInt64LE(0) : handle.readUInt32LE(0));
      } catch { owner = ''; }
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_HELLO_SCRIPT], {
        env: { ...process.env, NEBULA_HELLO_ASK: ask ? '1' : '', NEBULA_HELLO_REASON: reason, NEBULA_HELLO_WINDOW: owner },
        timeout: ask ? 130_000 : 20_000,
        windowsHide: true,
      }, (err, stdout) => resolve(err ? { available: false, verified: false } : readHelloAnswer(stdout)));
    }).catch(() => resolve({ available: false, verified: false }));
  });
}
let helloThere = null;
function helloAvailable() {
  const forced = process.env.NEBULA_HELLO;
  if (forced) return Promise.resolve(forced !== 'none');
  if (process.platform === 'darwin') { try { return Promise.resolve(!!systemPreferences.canPromptTouchID()); } catch { return Promise.resolve(false); } }
  if (process.platform !== 'win32') return Promise.resolve(false);
  helloThere ??= askWindowsHello(false).then((a) => a.available);
  return helloThere;
}
/** The question itself: `what` finishes "Nebula — …" (and Touch ID's "Nebula wants to …"). */
async function helloAsk(what) {
  const forced = process.env.NEBULA_HELLO;
  if (forced) return forced === 'ok';
  if (process.platform === 'darwin') {
    try { await systemPreferences.promptTouchID(what); return true; } catch { return false; }
  }
  if (process.platform !== 'win32') return false;
  return (await askWindowsHello(true, `Nebula — ${what}`)).verified;
}
const helloVerify = (name, action = 'open') => helloAsk(`${action === 'delete' ? 'delete' : action === 'change-pin' ? 'change the PIN of' : 'open'} the black hole “${name}”`);

/** The vault's black holes (black-holes.js): their keys are wrapped for this user by the operating system. */
const holesRoot = () => path.join(storageRoot(), 'blackholes');
const blackHoles = new BlackHoles({
  root: holesRoot,
  canProtect: () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } },
  protect: (plain) => safeStorage.encryptString(plain.toString('base64')),
  unprotect: (box) => Buffer.from(safeStorage.decryptString(box), 'base64'),
  hello: helloVerify,
  helloAvailable,
});

/**
 * The lock on opening the app (0.9.4, app-lock.js): set in Settings. While it
 * is shut this process hands the window nothing of the notes — `shut()` is
 * asked by everything that would: the vault's files, the black holes, the
 * notes' pictures and videos.
 */
const appLock = new AppLock({
  file: () => path.join(app.getPath('userData'), 'app-lock.json'),
  hello: () => helloAsk('open the app'),
  helloAvailable,
});
const shut = () => appLock.isLocked();

/**
 * Each note's folder (0.9.4, note-media.js). The first time a vault is opened
 * by a version that keeps pictures as files, the vault is put aside as it was
 * (`backups/pre-note-folders`, never overwritten); then, at every start, any
 * note still holding pictures in its text is written the new way and what no
 * note names any more leaves the folders.
 */
/** Notes with files nothing in the app took out of them — kept until the person is asked (note-media.js): id → the files. */
const heldMedia = new Map();
/** What the person has taken out of their notes since this start (note-media.js noteReleases): deleted at the next one. */
let released = new Map();
const releasedFile = () => path.join(storageRoot(), RELEASED_FILE);
function prepareNoteFolders() {
  try {
    if (!fsSync.existsSync(notesRoot())) return;
    let meta = {};
    try { meta = JSON.parse(fsSync.readFileSync(path.join(storageRoot(), 'meta.json'), 'utf8')); } catch { /* no stamp yet */ }
    if (!(meta.schemaVersion >= 2) && fsSync.readdirSync(notesRoot()).some((f) => f.endsWith('.json'))) {
      if (!snapshotStorage({ label: 'pre-note-folders' })) return;   // no copy put aside, no change of format
    }
    // A vault a list has been kept for (meta.json): a list that is gone is an empty one, never none.
    const done = tidyVault(notesRoot(), { released: readReleased(releasedFile()) ?? (meta.releasedList ? new Map() : null) });
    // From here on a new list: what is taken out in this run.
    released = new Map();
    try { writeReleased(releasedFile(), released); } catch (err) { console.warn('[nebula] note folders: the list of what is taken out could not be started:', err.message); }
    // What a note no longer names has just left its folder; it leaves the backups too
    // ("deleted from the backups as well" — the owner).
    heldMedia.clear();
    for (const held of done.held) heldMedia.set(held.id, held.files);
    if (heldMedia.size) console.info(`[nebula] note folders: ${heldMedia.size} notes lost pictures that nothing in the app took out — kept until asked about`);
    const unnamed = purgeUnnamedFromBackups(notesRoot(), backupsRoot(), { keep: heldMedia });
    if (unnamed) console.info(`[nebula] backups: ${unnamed} pictures and videos their notes no longer show removed`);
    // The copy put aside before the pictures left the notes has done its work
    // once every picture a note names is in that note's folder: it goes then
    // — "it has no meaning after the move" (the owner). Kept while anything is missing.
    const aside = path.join(backupsRoot(), 'pre-note-folders');
    if (fsSync.existsSync(aside) && missingMedia(notesRoot()) === 0) {
      const removed = shredTree(aside);
      console.info(`[nebula] note folders: every picture is in its note's folder — the copy put aside before the move is removed (${removed} files)`);
    }
    if (done.inside || done.moved || done.swept) console.info(`[nebula] note folders: ${done.inside} note files moved into their folders, ${done.moved} notes written with their pictures as files, ${done.swept} unused files removed`);
  } catch (err) {
    console.warn('[nebula] preparing note folders failed:', err.message);
  }
}

/**
 * The copies kept the old way — every picture written into its note's text,
 * in each of them — removed at this start, not one a day for a week
 * (backup-purge.js dropOldWayCopies), and a copy the new way made in their
 * place: there is never a start that leaves the vault without one. Only once
 * the vault's own move is whole: while a picture is missing from a note's
 * folder, every old copy stays.
 */
async function dropOldBackups() {
  try {
    if (!oldWayCopies(backupsRoot()).length || missingMedia(notesRoot()) !== 0) return;
    const gone = await dropOldWayCopies(backupsRoot());
    if (!gone.length) return;
    console.info(`[nebula] backups: copies kept the old way removed — ${gone.join(', ')}`);
    snapshotStorage();
  } catch (err) {
    console.warn('[nebula] removing the backups kept the old way failed:', err.message);
  }
}

/** A note's file, served to the note that shows it: a picture whole, a video in the pieces the player asks for. */
async function serveMedia(request) {
  if (shut()) return new Response(null, { status: 403 });
  // A video sealed in a black hole (black-holes.js): opened a piece at a time, for as long as the black hole is open.
  const sealed = /^nebula-media:\/\/hole\/([\w-]{1,120})\/([\w-]{1,120})\/(vid-[a-z0-9]+-[0-9a-f]{8}\.[a-z0-9]{2,5})(?:[?#].*)?$/.exec(request.url);
  if (sealed) {
    const [, holeId, noteId, name] = sealed;
    const length = blackHoles.videoSize(holeId, noteId, name);
    if (length === null) return new Response(null, { status: 404 });
    const wanted = request.headers.get('range');
    const part = byteRange(wanted, length);
    if (wanted && !part) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${length}` } });
    const head = { 'content-type': mimeOf(name), 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
    if (!length) return new Response(null, { status: 200, headers: { ...head, 'content-length': '0' } });
    const [from, to] = part ?? [0, length - 1];
    return new Response(Readable.toWeb(Readable.from(blackHoles.videoPart(holeId, noteId, name, from, to))), {
      status: part ? 206 : 200,
      headers: { ...head, 'content-length': String(to - from + 1), ...(part ? { 'content-range': `bytes ${from}-${to}/${length}` } : {}) },
    });
  }
  const named = parseMediaUrl(request.url);
  const file = named ? mediaPath(notesRoot(), named.id, named.file) : null;
  if (!file) return new Response(null, { status: 404 });
  let size;
  try { size = (await fs.stat(file)).size; } catch { return new Response(null, { status: 404 }); }
  const asked = request.headers.get('range');
  const range = byteRange(asked, size);
  if (asked && !range) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  const headers = { 'content-type': mimeOf(file), 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  if (!size) return new Response(null, { status: 200, headers: { ...headers, 'content-length': '0' } });
  const [start, end] = range ?? [0, size - 1];
  const body = Readable.toWeb(fsSync.createReadStream(file, { start, end }));
  return new Response(body, {
    status: range ? 206 : 200,
    headers: { ...headers, 'content-length': String(end - start + 1), ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) },
  });
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

/**
 * "Open with Nebula" (0.9.4, open-file.js). One copy of the app per vault: a
 * file opened while Nebula is running goes to the running copy — a second copy
 * writing the same notes is how notes get lost. The lock is this profile's
 * own (the folder set above), so Nebula and Nebula Test never share it.
 */
const onlyCopy = app.requestSingleInstanceLock();
if (!onlyCopy) app.quit();
/** Files handed to the app that the window has not taken yet. */
const handedFiles = onlyCopy ? filesFromArgv(process.argv) : [];
function handOver(files) {
  handedFiles.push(...files);
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (handedFiles.length) win.webContents.send('files:open');
}
app.on('second-instance', (_event, argv, cwd) => handOver(filesFromArgv(argv, cwd)));
// A Mac hands a file over with an event, before the app is ready or after.
app.on('open-file', (event, file) => { event.preventDefault(); handOver([file]); });
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
app.on('will-quit', () => {
  dropAllPreviews();
  clearOpened();
});

/** The test build carries its own mark so the two are told apart at a glance. */
function windowIconPath() {
  if (process.platform !== 'win32') return '../build/icon.png';
  return CHANNEL === 'test' ? '../build/icon-test.ico' : '../build/icon.ico';
}

/**
 * The logo in colours of the user's own (0.9.4, app-logo.js): set in Settings,
 * kept in the profile, worn by the window, the taskbar and the shortcuts that
 * start this copy of the app.
 */
const logoDir = () => path.join(app.getPath('userData'), 'logo');
/** The icon file the window wears: the user's logo where there is one, the app's own otherwise. */
function windowIcon() {
  const logo = readLogo(logoDir());
  if (logo) return process.platform === 'win32' ? logo.ico : logo.png;
  return path.join(__dirname, windowIconPath());
}
/**
 * The shortcuts that start this copy — on the desktop, in the Start menu, on
 * the taskbar — pointed at an icon file, or back at the program for its own.
 * Only for a packaged app: run from source there is no program of ours that a
 * shortcut would start (NEBULA_SHORTCUT_DIRS lets a test say where to look).
 */
/** Whether this copy has shortcuts to look after: Windows, and a packaged app (or a test that says where). */
const logoShortcutsHere = () => process.platform === 'win32' && (app.isPackaged || !!process.env.NEBULA_SHORTCUT_DIRS);
/** The program a shortcut to this copy starts: the portable file itself, not the copy it unpacks and runs. */
const logoTarget = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
/**
 * Where shortcuts are: the desktop — this user's first, then everyone's — the
 * Start menu, both, and what is pinned to the taskbar and to Start.
 */
function logoShortcutDirs() {
  const forced = process.env.NEBULA_SHORTCUT_DIRS;
  if (forced) return forced.split(path.delimiter);
  const roaming = app.getPath('appData');
  const pinned = path.join(roaming, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned');
  return [
    app.getPath('desktop'),
    process.env.PUBLIC ? path.join(process.env.PUBLIC, 'Desktop') : '',
    path.join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.ProgramData ? path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
    path.join(pinned, 'TaskBar'),
    path.join(pinned, 'StartMenu'),
    path.join(pinned, 'ImplicitAppShortcuts'),
  ];
}
/**
 * The shortcuts that start this copy are given the logo — or, with `null`,
 * the program's own icon again. Never on the spot: a moment after the change,
 * so that a colour pulled about is not written into the shortcuts at every
 * step, and a few shortcuts at a time (app-logo.js `pointShortcuts`), so that
 * the app's own thread is free when Windows asks the window for its new icon.
 * A newer logo takes over from one that is still being put on.
 */
let shortcutsFor = 0;
let shortcutsTimer = null;
function pointLogoShortcuts(ico, { after = 600 } = {}) {
  if (!logoShortcutsHere()) return;
  const mine = ++shortcutsFor;
  clearTimeout(shortcutsTimer);
  shortcutsTimer = setTimeout(() => {
    pointShortcuts({ dirs: logoShortcutDirs(), target: logoTarget(), icon: ico ?? logoTarget(), shell, stale: () => mine !== shortcutsFor })
      .catch((err) => console.warn('[nebula] the shortcuts could not be given the logo:', err.message));
  }, after);
}
/**
 * The taskbar button (0.9.5, app-logo.js `taskbarDetails`): Windows draws it
 * from what the window's app ID stands for, and for an installed copy that is
 * the Start-menu shortcut — so a window wearing a logo of the user's says so
 * under an ID of its own. Where the app is pinned, the window keeps the pin's.
 */
function tellTaskbar(win, logo) {
  if (!logoShortcutsHere() || !win || win.isDestroyed()) return;
  try {
    const forced = process.env.NEBULA_SHORTCUT_DIRS;
    const dir = forced
      ? path.join(forced.split(path.delimiter)[0], 'TaskBar')
      : path.join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');
    const details = taskbarDetails({ base: APP_ID, logo, pinned: pinnedAppId({ dir, target: logoTarget(), shell }), target: logoTarget(), name: APP_TITLE });
    // A window that was never told anything else has the app's ID as it is: nothing to say.
    if (!taskbarSays && details.appId === APP_ID) return;
    win.setAppDetails(details);
    taskbarSays = details;
  } catch (err) { console.warn('[nebula] the taskbar could not be told of the logo:', err.message); }
}
/** What the taskbar was told last — for the checks. */
let taskbarSays = null;

/** Put a logo on: `null` is the app's own again. */
function wearLogo(logo) {
  const win = mainWindow;
  try {
    if (process.platform === 'darwin') app.dock?.setIcon(logo ? logo.png : path.join(__dirname, '../build/icon.png'));
    else if (win && !win.isDestroyed()) win.setIcon(logo ? (process.platform === 'win32' ? logo.ico : logo.png) : path.join(__dirname, windowIconPath()));
  } catch (err) { console.warn('[nebula] the window could not be given the logo:', err.message); }
  tellTaskbar(win, logo);
  pointLogoShortcuts(logo?.ico ?? null);
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
    icon: windowIcon(),
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

  // Before it is shown: the taskbar button is the logo's from its first moment.
  tellTaskbar(win, readLogo(logoDir()));

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
        type: 'error', buttons: [words('Keep editing', await appLanguage())],
        message: words('Your latest changes could not be saved.', await appLanguage()),
        detail: words('{error}\nThe window has stayed open so you can retry saving.', await appLanguage(), { error: error.message }),
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

  // The window shows the app and nothing else (hunt B21, navigation.js): a page
  // loaded in it would get the whole bridge. A link opens with Ctrl+click.
  win.webContents.on('will-navigate', (event, url) => {
    if (!staysOnPage(url, win.webContents.getURL())) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const href = externalUrl(url);
    if (href) shell.openExternal(href);
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
    const filters = await appLanguage().then((lang) => (FILTERS[format] ?? [{ name: 'Markdown', extensions: ['md'] }]).map((f) => ({ ...f, name: words(f.name, lang) })));
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: words('Export note', await appLanguage()),
      defaultPath: inLastFolder(String(suggested ?? 'Untitled')),
      filters,
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    lastFolder = path.dirname(filePath);
    try {
      if (binary || format !== 'nebula') {
        await fs.writeFile(filePath, binary ? Buffer.from(content) : content, binary ? undefined : 'utf8');
        return { ok: true, path: filePath };
      }
      // A Nebula note travels whole (note-media.js): its pictures and its
      // smaller videos are written into it, and the videos too large for a
      // file of text go into a folder beside it — whatever their size, and
      // out of a black hole too, while it is open.
      const whole = await travelWhole(content, notesRoot(), {
        sealed: {
          size: (holeId, noteId, name) => blackHoles.videoSize(holeId, noteId, name),
          read: async (holeId, noteId, name) => {
            const parts = [];
            const size = blackHoles.videoSize(holeId, noteId, name) ?? 0;
            if (size) for await (const part of blackHoles.videoPart(holeId, noteId, name, 0, size - 1)) parts.push(part);
            return Buffer.concat(parts);
          },
          write: async (holeId, noteId, name, dest) => (await blackHoles.exportVideo(holeId, noteId, name, dest)).ok,
        },
      });
      await fs.writeFile(filePath, whole.text, 'utf8');
      let beside = 0;
      let failed = whole.left;
      const folder = travelFolder(filePath);
      if (whole.beside.length) {
        await fs.mkdir(folder, { recursive: true });
        for (const video of whole.beside) { if (await video.put(path.join(folder, video.name))) beside += 1; else failed += 1; }
      }
      return { ok: true, path: filePath, ...(beside ? { videosBeside: beside, folder: path.basename(folder) } : {}), ...(failed ? { videosLeft: failed } : {}) };
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
    // The page is the note in the clear: it lies in this app's own folder,
    // where a lock and the next start reach it, and is shredded when printed.
    await fs.mkdir(pdfPrintDir(), { recursive: true });
    const dir = await fs.mkdtemp(path.join(pdfPrintDir(), 'print-'));
    const file = path.join(dir, 'note.html');
    let win = null;
    try {
      await fs.writeFile(file, html, 'utf8');
      win = new BrowserWindow({
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
      await win.loadFile(file);
      // Web fonts (KaTeX) and the first layout; printing before they land gives
      // a page set in fallback faces.
      await new Promise((resolve) => { setTimeout(resolve, 350); });
      return await run(win);
    } finally {
      try { win?.destroy(); } catch { /* already gone */ }
      try { shredTree(dir); } catch { /* the next start takes it */ }
    }
  }

  /**
   * The PDF export's preview (0.9.3, the owner: "a preview of which page and
   * which style the export will be, in a panel that suits the app"). The PDF
   * is made once and shown from a file of its own; Export saves that same PDF.
   * The file holds the note, so it goes when the preview closes, and anything a
   * crash left behind goes at the next start (deleted notes stay deleted).
   */
  async function dropPreview(token) {
    const p = previews.get(token);
    previews.delete(token);
    if (!p) return;
    // The viewer of a preview just closed can hold its PDF a moment longer on Windows, and the
    // folder stayed until the next start (0.9.6 smoke, under load): tried again for two seconds.
    for (let i = 0; i < 10; i += 1) {
      try { shredTree(p.dir); } catch { /* still held */ }
      if (!fsSync.existsSync(p.dir)) return;
      await new Promise((r) => { setTimeout(r, 200); });
    }
  }
  ipcMain.handle('note:pdf-preview', async (e, { document: html } = {}) => {
    if (!from(e) || typeof html !== 'string' || !html) return { ok: false };
    const epoch = previewEpoch;
    try {
      const data = await withPrintWindow(html, (w) => w.webContents.printToPDF(PDF_OPTIONS));
      // Locked while it was printing: what it was of is shut now, and nothing of it is kept.
      if (epoch !== previewEpoch || shut()) return { ok: false, error: 'locked' };
      const token = randomUUID();
      const dir = path.join(pdfPreviewDir(), token);
      const file = path.join(dir, 'preview.pdf');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, data);
      if (epoch !== previewEpoch) { try { shredTree(dir); } catch { /* the next start */ } return { ok: false, error: 'locked' }; }
      previews.set(token, { dir, file, data });
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
      title: words('Export as PDF', await appLanguage()),
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
      title: words('Export as PDF', await appLanguage()),
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
      title: words('Import a note', await appLanguage()),
      properties: ['openFile'],
      filters: [
        { name: words('Notes', await appLanguage()), extensions: ['md', 'markdown', 'html', 'htm', 'txt', 'json', 'docx', 'odt', 'doc', 'rtf', 'enex'] },
        { name: words('All files', await appLanguage()), extensions: ['*'] },
      ],
    });
    if (!canceled && filePaths?.[0]) lastFolder = path.dirname(filePaths[0]);
    if (canceled || !filePaths?.length) return { ok: false, canceled: true };
    // Read as a file handed to the app is (open-file.js): the window parses and sanitises it.
    return readNoteFile(filePaths[0], notesRoot());
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
  // NEBULA_REAL_SCALE lets a test be the screen it needs: 1 is what a Mac answers.
  const forced = Number(process.env.NEBULA_REAL_SCALE);
  if (Number.isFinite(forced) && forced >= 0.5 && forced <= 3) return forced;
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
const appLanguage = async () => { try { const wc = mainWindow?.webContents; return wc && !wc.isDestroyed() ? await Promise.race([wc.executeJavaScript("localStorage.getItem('nebula:lang') || 'en'"), new Promise((r) => setTimeout(() => r('en'), 250))]) : 'en'; } catch { return 'en'; } }; // en when the window is gone, thrown at, or not answering (hunt B26)

// Every other session — an embed in a note (persist:embed), an AI tab
// (persist:ai-<id>), the PDF preview — is made when its first view is: with no
// handler it granted a page everything, the microphone and the clipboard too (hunt B22).
// The default session is made here too: its own handler, set once the app is
// ready, takes the place of this one.
app.on('session-created', (ses) => {
  const chat = isChatSession(ses.storagePath);
  const embed = isEmbedSession(ses.storagePath);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    if (embed && ASK_EMBED.has(permission)) { askEmbed(wc, permission, details).then(cb, () => cb(false)); return; }
    cb(allowed(permission, { chat, externalURL: details?.externalURL }));
  });
  // With no check handler Electron answers every check "granted": an embedded
  // page saw Notification.permission === 'granted' and showed notifications it
  // never asked for. What it may ask for, it has only once the person said yes.
  if (embed) {
    ses.setPermissionCheckHandler((wc, permission, origin, details) => {
      if (!ASK_EMBED.has(permission)) return true;
      return !!(wc && embedPages.get(wc)?.granted(checkKey(permission, { origin, mediaType: details?.mediaType })));
    });
  }
});

// A page embedded in a note may ask for the microphone, the camera or
// notifications; the person answers, and the answer lives only as long as that
// page is open (owner, 2026-10-16; permissions.js, hunt B25).
const embedPages = new WeakMap();
async function askEmbed(wc, permission, details) {
  const page = wc && embedPages.get(wc);
  const url = details?.requestingUrl || wc?.getURL?.() || '';
  const keys = askKeys(permission, { url, mediaTypes: details?.mediaTypes });
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const verdict = page && win && !shut() ? page.decide(keys) : 'deny';
  if (verdict !== 'ask') return verdict === 'allow';
  const load = page.load();
  page.asking(true);
  try {
    const lang = await appLanguage(); const { message, detail } = askWords(permission, { url, mediaTypes: details?.mediaTypes, lang });
    const { response } = await dialog.showMessageBox(win, {
      type: 'question', buttons: [words("Don't allow", lang), words('Allow', lang)], defaultId: 0, cancelId: 0, noLink: true, message, detail,
    });
    const yes = response === 1 && !wc.isDestroyed() && page.load() === load && !shut();
    page.answer(keys, yes, load);
    return yes;
  } finally {
    if (page.load() === load) page.asking(false);
  }
}

app.on('web-contents-created', (_event, contents) => {
  try { contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp'); } catch { /* a contents that cannot take it */ }
  if (contents.getType() === 'webview' && contents.session === session.fromPartition(PDF_PREVIEW_PARTITION)) {
    // The export preview shows its PDF and nothing else: a link in the note is
    // not followed inside the preview, and nothing opens a window from it.
    contents.on('will-navigate', (ev) => ev.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
  if (contents.getType() === 'webview' && contents.session === session.fromPartition(EMBED_PARTITION)) {
    // A page embedded in a note opened windows of the app's own, unasked (hunt
    // B23, navigation.js): a link the user just pressed goes to the browser.
    const gate = popupGate();
    const page = pageAnswers();
    embedPages.set(contents, page);
    contents.on('input-event', (_e, input) => { if (input.type === 'mouseDown' || input.type === 'keyDown') { gate.touched(); page.pressed(); } });
    // A reload or another page in the embed is asked again (hunt B25).
    contents.on('did-navigate', () => page.reset());
    contents.setWindowOpenHandler(({ url }) => {
      const href = gate.take(url);
      if (href) shell.openExternal(href);
      return { action: 'deny' };
    });
  }
  if (contents.getType() === 'webview') {
    const id =Object.keys(AI_SERVICES).find(id => contents.session === session.fromPartition('persist:ai-' + id));
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
  if (contents.getType() === 'webview') {
    // A tab that was typed in may hold words a reload would lose, so it is not
    // put to sleep (0.9.4, src/js/ai-services.js). The page hears only THAT a
    // key that writes was pressed in this view, and whether it was Enter —
    // never which key: Nebula does not read what is written in a chat.
    contents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return;
      const key = String(input.key || '');
      const writes = key.length === 1 || ['Enter', 'Backspace', 'Delete', 'Process'].includes(key);
      if (!writes || ((input.control || input.meta) && !/^[vx]$/i.test(key))) return;
      const host = contents.hostWebContents;
      if (!host || host.isDestroyed() || host !== mainWindow?.webContents) return;
      host.send('ai:typed', { wc: contents.id, enter: key === 'Enter' && !input.shift });
    });
  }
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F12' || input.control || input.alt || input.shift || input.meta) return;
    event.preventDefault();
    const host = contents.hostWebContents || contents;
    void takeSnapshot(BrowserWindow.fromWebContents(host));
  });
});

app.whenReady().then(async () => {
  if (!onlyCopy) return;       // the running copy has the file; this one is on its way out
  app.userAgentFallback = app.userAgentFallback
    .replace(/ Electron\/[\d.]+/gi, '')
    .replace(/ Nebula(?: Test)?\/[\d.]+/gi, '');
  // The app draws its own menus beside the logo, so the native bar goes.
  Menu.setApplicationMenu(null);
  // A portable copy tells Windows itself that it opens documents: no installer did (open-with.js).
  if (process.platform === 'win32' && app.isPackaged && process.env.PORTABLE_EXECUTABLE_FILE) {
    void offerOpenWith({ exe: process.env.PORTABLE_EXECUTABLE_FILE, name: APP_TITLE });
  }
  registerShellHandlers();
  // "Ignore" on a misspelt word lasts until the app closes: what the last run
  // put aside leaves the dictionary now (context-menu.js, 0.9.4).
  const ignoredWords = {
    read: () => (Array.isArray(readPrefs().spellIgnored) ? readPrefs().spellIgnored : []),
    write: (words) => writePrefs({ spellIgnored: words }),
  };
  forgetIgnoredWords(session.defaultSession, ignoredWords.read());
  ignoredWords.write([]);
  registerEditingHandlers(ipcMain, () => mainWindow, ignoredWords, (url) => (shut() ? null : pictureDataUrl(notesRoot(), url)));
  // The pictures a note names, written into its markup — for an export, a
  // copy for another program, a crop: wherever the picture itself is needed.
  ipcMain.handle('media:inline', (e, html) => (e.sender === mainWindow?.webContents && !shut() ? inlinePictures(String(html ?? ''), notesRoot()) : String(html ?? '')));
  // The notes whose lost pictures and videos wait for an answer: how many each, never their names.
  ipcMain.handle('media:held', (e) => (e.sender === mainWindow?.webContents && !shut() ? [...heldMedia].map(([id, files]) => ({ id, files: files.length })) : []));
  // The answer "delete them": those files alone, and only the ones the note still does not name — out of its folder and every backup.
  ipcMain.handle('media:drop-held', (e, id) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false };
    const files = heldMedia.get(String(id ?? ''));
    if (!files) return { ok: false, error: 'missing' };
    try {
      const text = fsSync.readFileSync(noteFile(notesRoot(), String(id)), 'utf8');
      if (!JSON.parse(text)?.id) return { ok: false, error: 'unreadable' };
      const only = new Set(files);
      const removed = sweepNote(notesRoot(), String(id), text, { videos: true, only });
      if (!fsSync.existsSync(path.join(notesRoot(), String(id)))) vault?.forget(String(id));
      purgeUnnamedFromBackups(notesRoot(), backupsRoot(), { only: new Map([[String(id), only]]) });
      heldMedia.delete(String(id));
      return { ok: true, removed };
    } catch (err) {
      console.warn('[nebula] removing a note’s lost pictures failed:', err.message);
      return { ok: false, error: 'failed' };
    }
  });
  // The answer "put them back": the window is given their names and writes them into the note again, at its end.
  // They are no longer waiting then; should the note not be saved after all, the next start asks again.
  ipcMain.handle('media:take-held', (e, id) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false };
    const files = heldMedia.get(String(id ?? ''));
    if (!files) return { ok: false, error: 'missing' };
    heldMedia.delete(String(id));
    return { ok: true, files: files.filter((name) => fsSync.existsSync(path.join(notesRoot(), String(id), name))) };
  });
  ipcMain.handle('media:data-url', (e, url) => (e.sender === mainWindow?.webContents && !shut() ? pictureDataUrl(notesRoot(), String(url ?? '')) : null));
  // A copy is made while the key is still down: this one answers at once.
  ipcMain.on('media:inline-sync', (e, html) => { e.returnValue = e.sender === mainWindow?.webContents && !shut() ? inlinePictures(String(html ?? ''), notesRoot()) : String(html ?? ''); });
  // The app's own window. Embeds and AI tabs have sessions of their own,
  // guarded where each is made (session-created, permissions.js).
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    // The font menu's "Add a font" lists the fonts of this computer (0.9.4).
    // Only the app's own window may ask: an embedded page must not learn them.
    if (permission === 'local-fonts') { cb(wc === mainWindow?.webContents); return; }
    // openExternal: a link with a scheme the browser does not know asks this
    // before Windows runs it — ms-settings:, ms-msdt:, a file share (hunt B21).
    cb(allowed(permission, { chat: true, externalURL: details?.externalURL }));
  });

  dropAllPreviews();
  clearOpened();
  app.on('browser-window-focus', retryReleasedCopies);
  setInterval(retryReleasedCopies, 30_000).unref();
  snapshotStorage();
  purgeOldDeletions();
  prepareNoteFolders();
  // Capture after startup migrations, which legitimately move and create folders.
  const vault = vaultPresence(notesRoot());
  vault.capture();
  stampVaultMeta();
  dropOldBackups();
  protocol.handle(MEDIA_SCHEME, serveMedia);

  // Black holes (0.9.4): the window asks, this process holds the keys. Only the
  // app's own window may ask, and a fault answers as a refusal, never a crash.
  // The logo in the user's own colours (app-logo.js): the window draws it, this
  // process checks the pictures, keeps them and puts them on. Only the app's own window may ask.
  const logoCall = (name, run) => ipcMain.handle(`logo:${name}`, async (e, ...args) => {
    if (e.sender !== mainWindow?.webContents) return { ok: false, error: 'not allowed' };
    try { return await run(...args); } catch (err) { console.warn(`[nebula] logo ${name} failed:`, err.message); return { ok: false, error: 'failed' }; }
  });
  // `own`: which logo this build came with — the test build has one of its own, which only it offers.
  logoCall('get', () => ({
    ok: true,
    colors: readLogo(logoDir())?.colors ?? null,
    taskbar: taskbarSays?.appId ?? null,
    own: CHANNEL === 'test' || process.env.NEBULA_LOGO_OWN === 'test' ? 'test' : 'main',
    shortcuts: logoShortcutsHere(),
  }));
  // A shortcut on the desktop that wears the logo: the program file there cannot.
  logoCall('shortcut', () => {
    if (!logoShortcutsHere()) return { ok: false, error: 'unavailable' };
    const res = makeShortcut({ dir: logoShortcutDirs()[0], name: APP_TITLE, target: logoTarget(), icon: readLogo(logoDir())?.ico ?? logoTarget(), shell });
    return { ok: res.ok, made: !!res.made, error: res.error };
  });
  logoCall('set', (colors, images) => {
    const res = writeLogo(logoDir(), colors, images);
    if (!res.ok) return res;
    // The window wears it now; the shortcuts follow a moment later, without holding this up.
    wearLogo(res);
    return { ok: true, colors: res.colors };
  });
  logoCall('clear', () => {
    clearLogo(logoDir());
    wearLogo(null);
    return { ok: true };
  });
  // A shortcut made since the logo was set wears the program's own icon: it is given the logo at the next start —
  // once the app is up, not while it starts.
  { const logo = readLogo(logoDir()); if (logo) pointLogoShortcuts(logo.ico, { after: 5000 }); }

  // The lock on opening the app (app-lock.js): the window asks, this process
  // decides. Only the app's own window may ask.
  const lock = (name, run) => ipcMain.handle(`lock:${name}`, async (e, ...args) => {
    if (e.sender !== mainWindow?.webContents) return { ok: false, error: 'not allowed' };
    try { return await run(...args); } catch (err) { console.warn(`[nebula] app lock ${name} failed:`, err.message); return { ok: false, error: 'failed' }; }
  });
  // Whether there is a passkey here is looked up only for Settings (`hello`): the window's question before it starts must not wait for it.
  lock('state', (what) => appLock.state({ withHello: what?.hello === true }));
  lock('set', (how) => appLock.set(how ?? {}));
  lock('unlock', (by) => appLock.unlock(by ?? {}));
  lock('clear', (by) => appLock.clear(by ?? {}));
  // Off keeps the lock and stops the asking; a passkey is added beside the PIN, or taken away.
  lock('turn', (on, by) => appLock.turn(on === true, by ?? {}));
  lock('passkey', (on, by) => appLock.passkey(on === true, by ?? {}));
  // "Lock Nebula": shut now. The black holes let go of their keys, and the
  // window is loaded again — it holds nothing then, and asks before it shows anything.
  lock('now', async () => {
    if (!appLock.lockNow()) return { ok: false, error: 'unset' };
    blackHoles.lockAll();
    await clearOpenedAsync({ holes: true });
    dropAllPreviews();
    setImmediate(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload(); });
    return { ok: true };
  });

  const hole = (name, run) => ipcMain.handle(`holes:${name}`, async (e, ...args) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false, error: 'not allowed' };
    try { return await run(...args); } catch (err) { console.warn(`[nebula] black hole ${name} failed:`, err.message); return { ok: false, error: 'failed' }; }
  });
  const protectedHoleBackups = new Set();
  hole('list', async () => {
    const holes = blackHoles.list();
    for (const item of holes) {
      if (protectedHoleBackups.has(item.id)) continue;
      const nameBox = blackHoles.protectedNameBox(item.id);
      if (!nameBox) continue;
      const result = protectLegacyHoleBackups(backupsRoot(), item.id, null, nameBox);
      if (!result.failed) protectedHoleBackups.add(item.id);
    }
    return { ok: true, holes, hello: await helloAvailable() };
  });
  // A black hole is locked by a PIN, always; a passkey is an addition (black-holes.js).
  hole('create', (how) => blackHoles.create({ name: how?.name, pin: how?.pin, hint: how?.hint, passkey: how?.passkey === true }));
  // Its answer, asked before a note is taken out of it.
  hole('prove', (id, by) => blackHoles.prove(String(id ?? ''), by ?? {}));
  hole('passkey', (id, on) => blackHoles.setPasskey(String(id ?? ''), on === true));
  hole('unlock', async (id, by) => {
    // A failed retry in earlier builds could leave a newer hole-marked plain
    // note. The renderer restores it after authentication; do not sweep media
    // that only that pending edit references before it has been re-sealed.
    const plainIds = noteIds(notesRoot());
    const preserveMedia = plainIds === null || [...plainIds].some((noteId) => {
      // A previous boot could strip the marker from a leaked copy. An exact
      // note-id collision with a sealed note is enough to keep its media
      // until the renderer has reconciled the two versions.
      if (blackHoles.hasSealedNote(String(id), noteId)) return true;
      try { return JSON.parse(fsSync.readFileSync(noteFile(notesRoot(), noteId), 'utf8')).hole === String(id); }
      catch { return true; } // unreadable state is never grounds to delete media
    });
    // The sealed videos its notes no longer show went as it opened: they leave the backups too.
    const { swept, ...res } = await blackHoles.unlock(String(id ?? ''), by ?? {}, { preserveMedia });
    // A backup that was unreadable during the first upgrade gets another
    // chance whenever the protected live hole is authenticated again.
    if (res.ok) {
      const wrapper = blackHoles.protectedKeyWrapper(String(id));
      const backupResult = protectLegacyHoleBackups(backupsRoot(), String(id), wrapper, blackHoles.protectedNameBox(String(id)));
      if (backupResult.failed) {
        console.warn(`[nebula] ${backupResult.failed} old black-hole backup key wrappers could not be strengthened`);
        res.backupProtectionIncomplete = true;
      }
    }
    if (swept?.length) await purgeHoleFilesFromBackupsAsync(backupsRoot(), String(id), swept);
    // Backup shredding can also yield to a Lock command. Never deliver the
    // plaintext unlock result after the hole has closed in that interval.
    if (res.ok && !blackHoles.isOpen(String(id ?? ''))) return { ok: false, error: 'locked' };
    return res;
  });
  // Shut, a black hole's files are in the clear nowhere: the copies Open made go too.
  hole('lock', async (id) => { const ok = blackHoles.lock(String(id ?? '')); await clearOpenedAsync({ holeId: String(id ?? '') }); dropAllPreviews(); return { ok }; });
  hole('lock-all', async () => { blackHoles.lockAll(); await clearOpenedAsync({ holes: true }); dropAllPreviews(); return { ok: true }; });
  // Sealed whole: a note that still names pictures in the notes folder (it was
  // just moved in) has them written into it first — the folder goes with its plain file.
  hole('write', (id, noteId, json) => blackHoles.writeAsync(String(id ?? ''), String(noteId ?? ''), inlinePictures(String(json ?? ''), notesRoot())));
  hole('remove', async (id, noteId) => {
    const res = await blackHoles.remove(String(id ?? ''), String(noteId ?? ''));
    // Deleted is deleted: its sealed copies leave the backups too.
    if (res.ok) await purgeHoleNoteFromBackupsAsync(backupsRoot(), String(id), String(noteId));
    if (res.ok) await clearOpenedAsync({ holeId: String(id ?? ''), noteId: String(noteId ?? '') });
    return res;
  });
  hole('rename', (id, name) => {
    const holeId = String(id ?? '');
    const res = blackHoles.rename(holeId, name);
    if (res.ok) {
      const backup = protectLegacyHoleBackups(backupsRoot(), holeId, null, blackHoles.protectedNameBox(holeId));
      if (backup.failed) res.backupProtectionIncomplete = true;
    }
    return res;
  });
  // A video file for a note in a black hole: sealed there, never in the notes folder.
  hole('add-video', (id, noteId, source) => blackHoles.addVideo(String(id ?? ''), String(noteId ?? ''), String(source ?? '')));
  // Any file attached to a note in a black hole (0.9.6): sealed beside it as a video is.
  hole('add-file', (id, noteId, source) => blackHoles.addFile(String(id ?? ''), String(noteId ?? ''), String(source ?? '')));
  // A note moved in with its videos: each is sealed under the name it has, from the note's own folder.
  hole('import-video', (id, noteId, file) => {
    const source = mediaPath(notesRoot(), String(noteId ?? ''), String(file ?? ''));
    if (!source) return { ok: false, error: 'missing' };
    return blackHoles.addVideo(String(id ?? ''), String(noteId), source, String(file));
  });
  // A note taken out with its videos: each is written into the note's own folder, in the clear.
  hole('export-video', async (id, noteId, file) => {
    const dest = mediaPath(notesRoot(), String(noteId ?? ''), String(file ?? ''));
    if (!dest) return { ok: false, error: 'missing' };
    vault.assert(String(noteId));
    const res = await blackHoles.exportVideo(String(id ?? ''), String(noteId), String(file), dest);
    if (res.ok) vault.remember(String(noteId));
    return res.ok ? { ok: true, url: `nebula-media://note/${noteId}/${file}` } : res;
  });
  hole('change-pin', (id, pin, by) => blackHoles.changePin(String(id ?? ''), pin, by ?? {}));
  hole('new-recovery', (id) => blackHoles.newRecovery(String(id ?? '')));
  hole('hint', (id, hint) => blackHoles.setHint(String(id ?? ''), hint));
  hole('trash', async (id) => {
    const res = blackHoles.trash(String(id ?? ''));
    if (res.ok) { await clearOpenedAsync({ holeId: String(id) }); dropAllPreviews(); }
    return res;
  });
  hole('restore', (id) => blackHoles.restore(String(id ?? '')));
  hole('delete', async (id, by) => {
    const res = await blackHoles.delete(String(id ?? ''), by ?? {});
    if (res.ok) await purgeHoleFromBackupsAsync(backupsRoot(), String(id));
    if (res.ok) await clearOpenedAsync({ holeId: String(id ?? '') });
    return res;
  });
  app.on('before-quit', () => blackHoles.lockAll());

  // The files the app was opened with, read for the window: each once.
  ipcMain.handle('files:take', async (e) => {
    if (e.sender !== mainWindow?.webContents || shut()) return [];
    const files = handedFiles.splice(0);
    return Promise.all(files.map((file) => readNoteFile(file, notesRoot())));
  });

  // A video file dropped into a note: copied into that note's folder (0.9.4).
  ipcMain.handle('media:add-video', async (e, id, source) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false, error: 'not allowed' };
    try {
      vault.assert(String(id ?? ''));
      const res = await addVideo(notesRoot(), String(id ?? ''), String(source ?? ''));
      if (res.ok) vault.remember(String(id));
      return res;
    } catch (err) { return { ok: false, error: err.message }; }
  });
  // /video (0.9.4): a video file chosen from the computer. Only its path goes
  // back; it is copied into the note, or sealed into its black hole, as a dropped one is.
  ipcMain.handle('media:pick-video', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || e.sender !== mainWindow?.webContents) return { ok: false };
    if (pickingVideo) return { ok: false, canceled: true };
    const options = {
      title: words('Add a video', await appLanguage()),
      defaultPath: lastFolder || undefined,
      properties: ['openFile'],
      filters: [{ name: words('Video', await appLanguage()), extensions: VIDEO_EXTENSIONS }, { name: words('All files', await appLanguage()), extensions: ['*'] }],
    };
    // On Windows the dialog is nobody's child. /video is typed, and Chromium
    // hides the pointer while one types until the mouse moves over its window;
    // a dialog owned by that window shares the hidden pointer and, the window
    // being held still under it, never sees the move that would bring it back —
    // "the cursor disappears in the video picker" (the owner, 0.9.4).
    pickingVideo = true;
    let picked;
    try { picked = await (process.platform === 'win32' ? dialog.showOpenDialog(options) : dialog.showOpenDialog(win, options)); }
    finally { pickingVideo = false; }
    if (!win.isDestroyed()) win.focus();
    const { canceled, filePaths } = picked;
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
    lastFolder = path.dirname(filePaths[0]);
    return { ok: true, path: filePaths[0] };
  });
  // Any file dropped into a note with other kinds, or chosen by /file (0.9.6):
  // copied into the note's folder and kept there, under a name of its own (note-media.js).
  ipcMain.handle('media:add-file', async (e, id, source) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false, error: 'not allowed' };
    try {
      vault.assert(String(id ?? ''));
      const res = await addAttachment(notesRoot(), String(id ?? ''), String(source ?? ''));
      if (res.ok) vault.remember(String(id));
      return res;
    } catch (err) { return { ok: false, error: err.message }; }
  });
  // /file (0.9.6): files chosen from the computer, to be attached. Only their paths go back.
  ipcMain.handle('media:pick-files', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || e.sender !== mainWindow?.webContents) return { ok: false };
    if (pickingVideo) return { ok: false, canceled: true };
    const options = { title: words('Attach files', await appLanguage()), defaultPath: lastFolder || undefined, properties: ['openFile', 'multiSelections'] };
    // Nobody's child on Windows, for the hidden pointer (media:pick-video).
    pickingVideo = true;
    let picked;
    try { picked = await (process.platform === 'win32' ? dialog.showOpenDialog(options) : dialog.showOpenDialog(win, options)); }
    finally { pickingVideo = false; }
    if (!win.isDestroyed()) win.focus();
    const { canceled, filePaths } = picked;
    if (canceled || !filePaths?.length) return { ok: false, canceled: true };
    lastFolder = path.dirname(filePaths[0]);
    return { ok: true, paths: filePaths };
  });
  /**
   * An attached file, by its address, copied to dest: from the note's own
   * folder, or — in a black hole — opened out of its seal. Only an attached file.
   */
  const attachedTo = async (url, dest) => {
    const of = attachedOf(url);
    if (!of) return { ok: false, error: 'missing' };
    if (of.holeId) {
      const res = await blackHoles.exportVideo(of.holeId, of.noteId, of.file, dest);
      return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'missing' };
    }
    const file = mediaPath(notesRoot(), of.noteId, of.file);
    if (!file || !fsSync.existsSync(file)) return { ok: false, error: 'missing' };
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const tmp = dest + '.tmp-' + process.pid;
    try {
      await fs.copyFile(file, tmp);
      await fs.rename(tmp, dest);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
    return { ok: true };
  };
  // A click on a file's card (0.9.6): a copy of it saved where the person says, in Downloads unless they choose.
  ipcMain.handle('media:save-file', async (e, url, name) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || e.sender !== mainWindow?.webContents || shut()) return { ok: false };
    const of = attachedOf(url);
    if (!of) return { ok: false, error: 'missing' };
    const options = { title: words('Save a copy', await appLanguage()), defaultPath: path.join(app.getPath('downloads'), attachedName(name, of.file)) };
    const picked = await (process.platform === 'win32' ? dialog.showSaveDialog(options) : dialog.showSaveDialog(win, options));
    if (!win.isDestroyed()) win.focus();
    if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };
    try {
      const res = await attachedTo(url, picked.filePath);
      if (res.ok) await markOfTheWeb(picked.filePath);
      return res.ok ? { ok: true, path: picked.filePath } : res;
    } catch (err) { return { ok: false, error: err.message }; }
  });
  // "Open" on a file's card: a copy, opened by the program the system has for its kind (openedDir).
  ipcMain.handle('media:open-file', async (e, url, name) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false };
    const of = attachedOf(url);
    const accessible = () => !shut() && !!of && (!of.holeId || blackHoles.isOpen(of.holeId));
    // A program can hold a plaintext copy past lock on Windows. Its presence
    // is never permission to open it again through Nebula.
    if (!accessible()) return { ok: false, error: 'locked' };
    // A folder of its own per file, so two files of one name both open.
    const dest = openedPath(openedDir(), url, name);
    if (!dest) return { ok: false, error: 'missing' };
    // A program, a script, a shortcut is run, not shown: never at one click (hunt B12).
    // Judged by the stored ending — the name on the card is note text and may say anything.
    if (runsCode(attachedOf(url).file, name)) {
      const win = BrowserWindow.fromWebContents(e.sender);
      const lang = await appLanguage(); const options = {
        type: 'warning', buttons: [words('Cancel', lang), words('Open anyway', lang)], defaultId: 0, cancelId: 0, noLink: true,
        message: words('{file} can run code on this computer.', lang, { file: path.basename(dest) }),
        detail: words('What it runs can reach everything you can. Open it only if you trust where this note came from. Save a copy keeps it without running it.', lang),
      };
      const { response } = await (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options));
      if (response !== 1) return { ok: false, canceled: true };
      if (!accessible()) return { ok: false, error: 'locked' };
    }
    try {
      // Opened already since the start: the same copy — a program may hold it, and the file never changes.
      if (!fsSync.existsSync(dest)) {
        const res = await attachedTo(url, dest);
        if (!res.ok) return res;
        await markOfTheWeb(dest);
      }
      if (!accessible()) {
        if (of.holeId) await clearOpenedAsync({ url: String(url) });
        return { ok: false, error: 'locked' };
      }
      const error = await shell.openPath(dest);
      return error ? { ok: false, error } : { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  // A file's card taken out of its note: the copy Open made of it goes now (the file itself at the next start).
  ipcMain.handle('media:forget-file', async (e, url) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false };
    return { ok: true, removed: await clearOpenedAsync({ url: String(url ?? '') }) };
  });
  // A file, video or adopted card copied for a note the window has left meanwhile (hunt B18): never
  // named, so nothing released it — released now, it goes at the next start without a question.
  ipcMain.handle('media:release-added', (e, id, url) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false };
    try {
      if (!releaseAdded(released, notesRoot(), String(id ?? ''), String(url ?? ''))) return { ok: false };
      writeReleased(releasedFile(), released);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  // A file card pasted into this note from another one: the file it names is
  // copied in here at once — sealed beside the note when it is in a black
  // hole — and the card is given this note's own address for it. The save's
  // rehome would copy the file later, but the live card is never told: without
  // this the card's click is refused until a restart.
  ipcMain.handle('media:adopt-file', async (e, id, hole, url) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false, error: 'not allowed' };
    const noteId = String(id ?? '');
    const holeId = hole == null ? null : String(hole);
    const of = attachedOf(String(url ?? ''));
    if (!NOTE_ID.test(noteId) || !of) return { ok: false, error: 'missing' };
    if (of.holeId === holeId && of.noteId === noteId) return { ok: true, url: String(url ?? '') };
    try { if (!holeId) vault.assert(noteId); }
    catch (err) { return { ok: false, error: err.message }; }
    const plain = of.holeId ? null : mediaPath(notesRoot(), of.noteId, of.file);
    if (plain && !fsSync.existsSync(plain)) return { ok: false, error: 'missing' };
    // A plain source is copied straight in, once, from the note's own file:
    // sealed when the destination is a black hole, a folder file otherwise.
    if (plain) {
      const added = holeId ? await blackHoles.addFile(holeId, noteId, plain) : await addAttachment(notesRoot(), noteId, plain);
      if (!holeId && added?.ok) vault.remember(noteId);
      return added?.ok ? { ok: true, url: added.url } : { ok: false, error: added?.error ?? 'missing' };
    }
    // A sealed source: its bytes come out through one plain copy under the
    // source's opened scope — inside the profile, under the source hole, so a
    // hole's lock or deletion shreds it and the next start takes any a crash
    // left behind — named as the stored file, so its ending is kept. The
    // folder is unique and is shredded when the copy is done.
    const stage = path.join(openedDir(), 'hole', of.holeId, of.noteId, 'adopt', `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, of.file);
    try {
      const copied = await attachedTo(String(url ?? ''), stage);
      if (!copied.ok) return copied;
      const added = holeId ? await blackHoles.addFile(holeId, noteId, stage) : await addAttachment(notesRoot(), noteId, stage);
      if (!holeId && added?.ok) vault.remember(noteId);
      return added?.ok ? { ok: true, url: added.url } : { ok: false, error: added?.error ?? 'missing' };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      try { shredTree(path.dirname(stage)); } catch { /* already gone */ }
    }
  });
  // A video the app's own player cannot play (an AVI, a WMV): the system's
  // player is asked to. Only a video file of a note's own folder, by its address.
  ipcMain.handle('media:open-outside', async (e, url) => {
    if (e.sender !== mainWindow?.webContents || shut()) return { ok: false };
    const named = parseMediaUrl(String(url ?? ''));
    const file = named && isVideoName(named.file) ? mediaPath(notesRoot(), named.id, named.file) : null;
    if (!file || !fsSync.existsSync(file)) return { ok: false, error: 'missing' };
    const error = await shell.openPath(file);
    return error ? { ok: false, error } : { ok: true };
  });

  // "Clear session data" on an AI tab (0.9.4): that tab's own cookies, site
  // storage and cache — its sign-in — and nothing else. Each tab has a session
  // of its own (persist:ai-<id>), so no other tab and no note is touched.
  ipcMain.handle('ai:clear-session', async (e, id) => {
    if (e.sender !== mainWindow?.webContents) return false;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return false;
    try {
      const ses = session.fromPartition(`persist:ai-${id}`);
      await ses.clearStorageData();
      await ses.clearCache();
      await ses.clearAuthCache();
      return true;
    } catch (err) {
      console.warn('[nebula] clearing an AI tab session failed:', err.message);
      return false;
    }
  });

  ipcMain.handle('display:real-scale', (e) => realScale(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.handle('storage:root', () => storageRoot());
  // Before the renderer repairs every note in the vault (src/js/heal.js) — the
  // one step that writes notes nobody opened — the vault is put aside under a
  // label. A labelled copy is never overwritten, so asking twice keeps the first.
  ipcMain.handle('storage:backup', (_e, label) => {
    const name = String(label ?? '');
    // A label is one folder name, never a path. In particular '.' and '..'
    // would make snapshotStorage mistake backups/ or the profile root for a
    // completed backup; a stray .making there could make it remove that tree.
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(name)
        || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) return { ok: false };
    const dest = snapshotStorage({ label: name });
    return dest ? { ok: true, path: dest } : { ok: false };
  });

  ipcMain.handle('storage:read', async (_e, rel) => {
    // Shut (app-lock.js): "could not be read", never "not there" — the window must not take it for an empty vault.
    if (shut()) return { ok: false, missing: false, error: 'locked' };
    try {
      vault.assert(noteIdOf(rel));
      let data;
      try {
        data = await fs.readFile(inStorage(rel), 'utf8');
      } catch (err) {
        // A note file that could not be moved into its folder at the start is still read where it lies.
        if (err.code !== 'ENOENT' || !noteIdOf(rel)) throw err;
        data = await fs.readFile(resolveInStorage(rel), 'utf8');
      }
      // A note is handed over as it is stored: the window shows its pictures
      // from their files (note-media.js), and holds none of them as text.
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
    if (shut()) throw new Error('Nebula is locked');
    const noteId = noteIdOf(rel);
    if (noteId && JSON.parse(String(content))?.hole) return { ok: false, error: 'Encrypted notes require black-hole storage' };
    vault.assert(noteId);
    const abs = inStorage(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    // A note's pictures go to its folder as files, and its file keeps their
    // names (note-media.js): the files first, so the text never names one
    // that is not there.
    const stored = noteId ? rehome(externalize(content, noteId, notesRoot()).text, noteId, notesRoot()) : content;
    // What this write takes out of the note is written down as taken out by the person — so that the next start
    // deletes it without asking — and written down first: cut off between the two, the note still names the file.
    if (noteId) {
      let before = null;
      try { before = await fs.readFile(abs, 'utf8'); } catch { /* a new note */ }
      if (before !== null) {
        try { if (noteReleases(released, noteId, before, stored)) writeReleased(releasedFile(), released); }
        catch (err) { console.warn('[nebula] what is taken out of a note could not be written down:', err.message); }
      }
    }
    const tmp = `${abs}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await fs.writeFile(tmp, stored, 'utf8');
      await fs.rename(tmp, abs);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
    if (noteId) vault.remember(noteId);
    // A picture taken out of the note keeps its file until the next start: an undo may still want it.
    return { ok: true, path: abs };
  });

  ipcMain.handle('storage:list', async (_e, relDir) => {
    if (shut()) return { ok: false, files: [], error: 'locked' };
    try {
      vault.assert();
      const dir = resolveInStorage(relDir);
      const files = await fs.readdir(dir);
      // The notes: each is a folder with its file in it, named to the window as `<id>.json`.
      if (dir === notesRoot()) {
        const ids = noteIds(dir);
        if (!ids) throw new Error('the notes could not be listed');
        return { ok: true, files: [...ids].map((id) => `${id}.json`) };
      }
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
    if (shut()) return { ok: false };
    try {
      vault.assert(noteIdOf(rel));
      const abs = resolveInStorage(rel);
      if (!rel || abs === storageRoot()) return { ok: false };
      // A note: its file is in its folder, which goes whole just below (and a flat file of an older vault with it).
      await fs.rm(abs, { recursive: true, force: true });
      // A note deleted from the vault (the Trash's Delete) leaves every backup
      // with it: a deleted note must not be recoverable (owner, 2026-09-27).
      const note = /^notes[\\/]([\w-]+)\.json$/.exec(String(rel));
      if (note && NOTE_ID.test(note[1])) { await removeNoteFolderAsync(notesRoot(), note[1]); vault.forget(note[1]); await clearOpenedAsync({ noteId: note[1] }); }   // its pictures, videos and files with it
      if (note) await purgeNoteFromBackupsAsync(backupsRoot(), note[1]);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('storage:reveal', async (_e, rel) => {
    const abs = inStorage(rel);
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
