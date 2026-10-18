/**
 * The copies of attached files (0.9.6) handed to their own programs by Open.
 * A copy, never the note's own file: a program saving into that would change
 * it in every backup that shares it. Each lies where the file it was made from
 * can be told by, so it goes with that file:
 *
 *   <opened>/note/<noteId>/<stored>/<name>          a note in the notes folder
 *   <opened>/hole/<holeId>/<noteId>/<stored>/<name> a note in a black hole
 *
 * Shredded at the start and at the quit; with its note when the note is
 * deleted; a black hole's when the black hole is locked, removed or deleted —
 * an opened black hole's file is in the clear, and must not stay so once the
 * black hole is shut; and a file's own when its card is taken out of a note.
 * A copy a program still holds open cannot go (Windows): it goes at the next
 * of these, at the latest at the quit or the next start.
 */
import path from 'node:path';
import { shredTree, shredTreeAsync } from './backup-purge.js';
import { isAttachmentName } from './note-media.js';

const ID = /^[\w-]{1,120}$/;
const PLAIN = /^nebula-media:\/\/note\/([\w-]{1,120})\/([\w-]{1,80}\.[a-z0-9]{2,5})$/;
const SEALED = /^nebula-media:\/\/hole\/([\w-]{1,120})\/([\w-]{1,120})\/([\w-]{1,80}\.[a-z0-9]{2,5})$/;

/**
 * What an attached file's address names: its note, its black hole if any,
 * and its stored name — or null for any address that is not one.
 * @returns {{noteId: string, holeId: string|null, file: string}|null}
 */
export function attachedOf(url) {
  const raw = String(url ?? '');
  const sealed = SEALED.exec(raw);
  if (sealed) return isAttachmentName(sealed[3]) ? { holeId: sealed[1], noteId: sealed[2], file: sealed[3] } : null;
  const plain = PLAIN.exec(raw);
  return plain && isAttachmentName(plain[2]) ? { holeId: null, noteId: plain[1], file: plain[2] } : null;
}

/** An ending a file is stored under as itself, as attachmentExt keeps it (note-media.js). */
const PLAIN_END = /.\.[a-z0-9]{2,5}$/i;

/** A name Windows keeps for a device: CON, NUL, COM1… — with any ending. */
const DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i;

/**
 * An attached file's own name, made safe to be a file name on any system.
 * It always ends in the stored file's ending (hunt B12): the name is note
 * text, and a card over a stored .txt that calls it "run.bat" must not hand
 * the system a .bat — it opens as "run.bat.txt".
 */
export function attachedName(name, file) {
  const ending = /\.[a-z0-9]+$/.exec(String(file ?? ''))?.[0] ?? '';
  const safe = String(name ?? '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\s+|[.\s]+$/g, '');
  // A leading dot is part of a real dotfile's name (stored as .bin because
  // path.extname('.env') is empty). Keep one only for .bin; never keep '..'.
  const clean = ending === '.bin' && /^\.[a-z0-9_-]/i.test(safe) ? safe : safe.replace(/^\.+/, '');
  let stem = (ending && clean.toLowerCase().endsWith(ending) ? clean.slice(0, -ending.length) : clean).replace(/[.\s]+$/, '');
  if (!stem) return file;
  if (DEVICE.test(stem.replace(/^\./, ''))) stem = `_${stem}`;
  // A stored .bin is a file whose own ending is not a plain one (note-media's
  // attachmentExt): "Makefile", "main.c", "data.parquet" keep their names. A name
  // claiming a plain ending over a .bin ("run.bat") was never stored so: forged.
  const add = ending === '.bin' && !PLAIN_END.test(stem) ? '' : ending;
  // Cut by the stem: the ending is what tells the system which program opens it.
  return stem.slice(0, 150 - add.length).replace(/[.\s]+$/, '') + add;
}

/**
 * Endings the system runs rather than shows: programs, scripts, installers,
 * shortcuts and links (Windows, macOS, Linux). Open asks first for these.
 */
const RUNS = new Set([
  'exe', 'com', 'scr', 'pif', 'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'wsc', 'sct', 'hta',
  'msi', 'msp', 'mst', 'msix', 'appx', 'lnk', 'url', 'reg', 'cpl', 'inf', 'scf', 'chm', 'hlp', 'msc', 'jar', 'jnlp', 'xll',
  'xbap', 'shb', 'shs', 'ins', 'isp', 'py', 'pyw', 'pyc', 'pl', 'rb', 'sh', 'bash', 'zsh', 'csh', 'ksh', 'run', 'tool',
  'pkg', 'mpkg', 'deb', 'rpm', 'iqy', 'slk', 'mof', 'ws',
  // Office files that carry macros: the copy has no Mark-of-the-Web, so Office's own block may not apply.
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'xlsb', 'pptm', 'potm', 'ppam', 'sldm',
]);

/** Endings that run and are never stored as themselves (longer than five, or with a dash): kept under .bin. */
const RUNS_LONG = new Set([
  'application', 'appref-ms', 'settingcontent-ms', 'appinstaller', 'appxbundle', 'msixbundle', 'gadget', 'library-ms',
  'searchconnector-ms', 'website', 'command', 'applescript', 'terminal', 'appimage', 'desktop',
]);

/**
 * Does opening this stored file run it? By its stored ending, which no note
 * text can bend — and for a .bin, by the ending its copy opens under, which
 * attachedName keeps only when it is not a plain one.
 */
export function runsCode(file, name = '') {
  const ending = /\.([a-z0-9]+)$/.exec(String(file ?? ''))?.[1];
  if (ending !== 'bin') return !!ending && RUNS.has(ending);
  const own = /\.([^.]+)$/.exec(attachedName(name, file))?.[1]?.toLowerCase();
  return !!own && (RUNS_LONG.has(own) || RUNS.has(own));
}

/** The folder the copies of one attached file lie in, or null. */
export function openedFolder(root, url) {
  const of = attachedOf(url);
  if (!of) return null;
  const stem = of.file.replace(/\.[a-z0-9]+$/, '');
  return of.holeId ? path.join(root, 'hole', of.holeId, of.noteId, stem) : path.join(root, 'note', of.noteId, stem);
}

/** Where Open puts a copy of an attached file, under the name it came with; null for any other address. */
export function openedPath(root, url, name) {
  const folder = openedFolder(root, url);
  return folder ? path.join(folder, attachedName(name, attachedOf(url).file)) : null;
}

/**
 * Shred opened copies. With nothing: all of them. `{noteId}`: a note's in the
 * notes folder. `{holeId}`: every one from that black hole; with `noteId` too,
 * that note's in it. `{url}`: one attached file's. `{holes: true}`: every
 * black hole's. Anything that does not name a place clears nothing.
 * @returns {number} files shredded
 */
function openedTarget(root, scope = {}) {
  const { noteId = null, holeId = null, url = null, holes = false } = scope;
  let target = null;
  if (url != null) target = openedFolder(root, url);
  else if (holes) target = path.join(root, 'hole');
  else if (holeId != null) {
    if (!ID.test(String(holeId)) || (noteId != null && !ID.test(String(noteId)))) return null;
    target = noteId != null ? path.join(root, 'hole', holeId, noteId) : path.join(root, 'hole', holeId);
  } else if (noteId != null) target = ID.test(String(noteId)) ? path.join(root, 'note', noteId) : null;
  else target = root;
  return target;
}

export function clearOpened(root, scope = {}) {
  const target = openedTarget(root, scope);
  if (!target) return 0;
  try { return shredTree(target); } catch { return 0; }
}

/** Remove opened copies without blocking the window on a large attachment. */
export async function clearOpenedAsync(root, scope = {}) {
  const target = openedTarget(root, scope);
  if (!target) return 0;
  try { return await shredTreeAsync(target); } catch { return 0; }
}
