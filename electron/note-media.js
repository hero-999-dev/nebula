/**
 * A note's pictures and videos are files in the note's own folder (0.9.4).
 *
 * The owner's Ideas note: "a copy of the pictures and videos put into a note —
 * a folder of its own for each note, the files kept in there; let us change how
 * the files are kept, inside storage again." Until now a picture was written
 * into the note's JSON as base64, so a note with three snapshots was a 2 MB
 * text file, rewritten whole at every pause in typing.
 *
 *   storage/notes/<id>/         the note's folder
 *     <id>.json                 the note: its words and markup
 *     <hash>.png                a picture, named by what it is
 *     vid-<time>-<rand>.mp4     a video dropped into the note
 *     att-<time>-<rand>.pdf     a file attached to the note (0.9.6): kept, never shown
 *
 * In the note's file a picture is `nebula-media://note/<id>/<hash>.png`.
 *
 * The note's file lay beside its folder at first (storage/notes/<id>.json);
 * the owner, on that build: "the JSON files inside the folder too — I do not
 * want them apart." So a note is one folder, whole: its words, its pictures,
 * its videos. A vault kept the first way is put this way at its next start
 * (moveNotesIn); to the window a note is still `notes/<id>.json`, and the main
 * process knows where that lies (noteFile).
 *
 * The window works with the references (since the ninth test build): a note
 * is handed over as it is stored, and its pictures are shown straight from
 * their files — a vault of pictures is no longer held in memory as text, in
 * every note at once. A picture pasted or dropped arrives written into the
 * text and is taken out at the save (`externalize`); where the picture itself
 * is needed — an export, a copy for another program, a crop, a note going
 * into a black hole — it is written in again for that (`inlinePictures`,
 * `travelWhole`, `pictureDataUrl`). A picture's file is written once; a
 * save while typing writes the words only.
 *
 * A video is too large to be handed about as text: it stays a file, and the
 * note shows it straight from its folder (the `nebula-media` protocol,
 * electron/main.js).
 *
 * Deleted is deleted: a picture or a video taken out of a note loses its file
 * at the next start — not at the save, so an undo in between still has it; a note deleted from the Trash loses its folder, in every backup too
 * (backup-purge.js).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MEDIA_SCHEME = 'nebula-media';
/** A note id is a file name, never a path (as in backup-purge.js). */
export const NOTE_ID = /^[\w-]{1,120}$/;
const FILE_NAME = /^[\w-]{1,80}\.[a-z0-9]{2,5}$/;

/** mime → extension, for the pictures a note can hold. */
const IMAGE_EXT = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp', bmp: 'bmp', avif: 'avif', 'svg+xml': 'svg' };
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml' };
/**
 * The video files a note can hold: "every kind of video file" (the owner, on
 * the first build). Holding one is not playing it — the player is Chromium's,
 * which plays MP4, WebM and most Matroska; an AVI, a WMV or an MPEG-2 file is
 * kept, travels and is sealed like any other, and its card says that it cannot
 * be played here (file-video.js).
 */
export const VIDEO_MIME = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
  mpg: 'video/mpeg', mpeg: 'video/mpeg', '3gp': 'video/3gpp', m2ts: 'video/mp2t', mts: 'video/mp2t',
};
export const VIDEO_EXTENSIONS = Object.keys(VIDEO_MIME);
export const mimeOf = (file) => IMAGE_MIME[extOf(file)] ?? VIDEO_MIME[extOf(file)] ?? 'application/octet-stream';
const extOf = (file) => String(file).slice(String(file).lastIndexOf('.') + 1).toLowerCase();
/**
 * A file attached to a note — "this note concerns these files" (the owner,
 * after OneNote). Any kind of file: a PDF, a spreadsheet, an archive, a
 * picture or a video too when it came with other files. It is kept as it is,
 * never shown or played, so it is neither a picture nor a video here,
 * whatever its extension; the note's card names it by the name it came with.
 */
const ATTACHMENT = /^att-[a-z0-9]+-[0-9a-f]{8}\.[a-z0-9]{2,5}$/;
export const isAttachmentName = (file) => ATTACHMENT.test(String(file));
export const isPicture = (file) => extOf(file) in IMAGE_MIME && !isAttachmentName(file);
export const isVideoName = (file) => extOf(file) in VIDEO_MIME && !isAttachmentName(file);
/** What is kept as a file of its own and swept only at a start: a video or an attached file. */
export const isKeptFile = (file) => isVideoName(file) || isAttachmentName(file);

/** A picture written into the text. Short ones (an icon) are left where they are. */
const DATA_URL = /data:image\/(png|jpe?g|gif|webp|bmp|avif|svg\+xml);base64,([A-Za-z0-9+/]{400,}={0,2})/g;
/** A reference to a file of a note. */
const REFERENCE = /nebula-media:\/\/note\/([\w-]{1,120})\/([\w-]{1,80}\.[a-z0-9]{2,5})/g;

/**
 * The note's id is in the path, under the one host `note`: a browser writes a
 * host in small letters, and an id is not always small letters.
 */
export const MEDIA_HOST = 'note';
export const mediaUrl = (id, file) => `${MEDIA_SCHEME}://${MEDIA_HOST}/${id}/${file}`;

/** The note and file a reference names — `nebula-media://note/<id>/<file>` — or null. */
export function parseMediaUrl(raw) {
  const m = /^nebula-media:\/\/note\/([\w-]{1,120})\/([\w-]{1,80}\.[a-z0-9]{2,5})(?:[?#].*)?$/.exec(String(raw ?? ''));
  return m ? { id: m[1], file: m[2] } : null;
}
export const noteFolder = (notesDir, id) => path.join(notesDir, id);
/** The note's own file, in its folder. */
export const noteFile = (notesDir, id) => path.join(notesDir, id, `${id}.json`);

/**
 * The notes a vault holds, by id: a folder with its note file in it — and a
 * note file lying flat: in a vault not yet put this way, or one whose name is
 * no id a folder is made for (a file copied in by hand, with a space in its
 * name). Such a file stays where it is and is a note all the same.
 * @returns {Set<string>|null} null when the folder could not be read at all
 */
export function noteIds(notesDir) {
  let entries;
  try { entries = fs.readdirSync(notesDir, { withFileTypes: true }); } catch { return null; }
  const ids = new Set();
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (NOTE_ID.test(entry.name) && fs.existsSync(noteFile(notesDir, entry.name))) ids.add(entry.name);
    } else if (entry.name.endsWith('.json')) ids.add(entry.name.slice(0, -5));
  }
  return ids;
}

/**
 * Every note file lying flat in the notes folder goes into the note's own
 * folder. Where a note has both, the one written last is the note and the
 * other goes — a tool or an older build may have written the flat one since.
 * @returns {number} how many were moved in
 */
export function moveNotesIn(notesDir) {
  let entries;
  try { entries = fs.readdirSync(notesDir, { withFileTypes: true }); } catch { return 0; }
  let moved = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const id = entry.name.slice(0, -5);
    if (!NOTE_ID.test(id)) continue;
    const flat = path.join(notesDir, entry.name);
    const inside = noteFile(notesDir, id);
    try {
      fs.mkdirSync(noteFolder(notesDir, id), { recursive: true });
      if (fs.existsSync(inside) && fs.statSync(inside).mtimeMs >= fs.statSync(flat).mtimeMs) { shred(flat); continue; }
      fs.renameSync(flat, inside);
      moved += 1;
    } catch { /* it stays where it is, and is still read from there */ }
  }
  return moved;
}

/** The file a reference names, or null when it is not one this vault could hold. */
export function mediaPath(notesDir, id, file) {
  if (!NOTE_ID.test(String(id)) || !FILE_NAME.test(String(file))) return null;
  return path.join(notesDir, id, file);
}

function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** The same overwrite-then-remove, without holding the event loop: a large
 * video's overwrite hands the turn back between blocks, so a locked window
 * stays live while it runs (the freeze on a 176 MB move, and the antivirus
 * scans that sat on every block). Best effort, as the synchronous one.
 */
export async function shredAsync(file) {
  try {
    // A planted symbolic link must never be followed: overwriting it would
    // destroy whatever it points at. The link itself is unlinked, nothing else.
    const info = await fs.promises.lstat(file);
    if (info.isSymbolicLink()) { await fs.promises.rm(file, { force: true }); return; }
    // A file a backup still shares is only taken out of this place (see shred).
    if (info.nlink > 1) { await fs.promises.rm(file, { force: true }); return; }
    const handle = await fs.promises.open(file, fs.constants.O_NOFOLLOW ? (fs.constants.O_RDWR | fs.constants.O_NOFOLLOW) : 'r+');
    try {
      const block = Buffer.alloc(Math.min(info.size, 4 * 1024 * 1024));
      for (let at = 0; at < info.size; at += block.length) {
        // FileHandle.write may write less than asked: the block is done only when
        // its last byte is on the disk, or the tail would survive the shredding.
        let done = 0;
        const len = Math.min(block.length, info.size - at);
        while (done < len) {
          const { bytesWritten } = await handle.write(block, done, len - done, at + done);
          if (!bytesWritten) throw new Error('the disk would not take the block');
          done += bytesWritten;
        }
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch { /* it is removed below all the same */ }
  await fs.promises.rm(file, { force: true });
}

/** Overwritten, then removed (best effort on flash and SSDs — see backup-purge.js). */
export function shred(file) {
  try {
    // As the asynchronous one: a symbolic link is unlinked, never followed.
    const info = fs.lstatSync(file);
    if (info.isSymbolicLink()) { fs.rmSync(file, { force: true }); return; }
    // A file a backup still shares (snapshotVault) is only taken out of this
    // place: its bytes are that backup's too, until the backup lets go of it
    // — or the note is deleted, when every place it lies in is shredded and
    // the last of them takes the bytes with it.
    if (info.nlink > 1) { fs.rmSync(file, { force: true }); return; }
    const fd = fs.openSync(file, fs.constants.O_NOFOLLOW ? (fs.constants.O_RDWR | fs.constants.O_NOFOLLOW) : 'r+');
    try {
      // In pieces: a video may be larger than the memory there is to spare.
      const block = Buffer.alloc(Math.min(info.size, 4 * 1024 * 1024));
      for (let at = 0; at < info.size; at += block.length) {
        // writeSync may write less than asked; loop until the block's last byte is on the disk.
        let done = 0;
        const len = Math.min(block.length, info.size - at);
        while (done < len) {
          const bytesWritten = fs.writeSync(fd, block, done, len - done, at + done);
          if (!bytesWritten) throw new Error('the disk would not take the block');
          done += bytesWritten;
        }
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch { /* it is removed below all the same */ }
  fs.rmSync(file, { force: true });
}

/**
 * A note's text as it is stored: every picture written into it becomes a file
 * in the note's folder and a reference in the text. A picture that could not
 * be written stays in the text — nothing is ever dropped.
 * @returns {{text: string, files: number}} `files`: pictures newly written
 */
export function externalize(text, id, notesDir) {
  const source = String(text ?? '');
  if (!NOTE_ID.test(String(id)) || !source.includes('data:image/')) return { text: source, files: 0 };
  const folder = noteFolder(notesDir, id);
  let files = 0;
  let made = false;
  const out = source.replace(DATA_URL, (all, kind, b64) => {
    try {
      const ext = IMAGE_EXT[kind.toLowerCase()];
      const name = `${crypto.createHash('sha256').update(b64).digest('hex').slice(0, 24)}.${ext}`;
      const file = path.join(folder, name);
      if (!fs.existsSync(file)) {
        if (!made) { fs.mkdirSync(folder, { recursive: true }); made = true; }
        writeAtomic(file, Buffer.from(b64, 'base64'));
        files += 1;
      }
      return mediaUrl(id, name);
    } catch {
      return all;
    }
  });
  return { text: out, files };
}

/**
 * A note's text as the app works with it: every reference to a picture is the
 * picture itself again. A reference whose file is not there is left as it is.
 * `folders` are where a note's folder may be: the vault's notes, or — for a
 * note file brought in from elsewhere — the folder that file lies in.
 */
export function inlinePictures(text, folders) {
  const source = String(text ?? '');
  if (!source.includes(`${MEDIA_SCHEME}://${MEDIA_HOST}/`)) return source;
  const roots = Array.isArray(folders) ? folders : [folders];
  return source.replace(REFERENCE, (all, id, file) => {
    if (!isPicture(file)) return all;
    for (const root of roots) {
      try {
        const data = fs.readFileSync(path.join(root, id, file));
        return `data:${IMAGE_MIME[extOf(file)]};base64,${data.toString('base64')}`;
      } catch { /* not in this one */ }
    }
    return all;
  });
}

/** One picture a reference names, written out as text — for a copy, or a crop. Null when it is not a picture that is there. */
export function pictureDataUrl(notesDir, url) {
  const named = parseMediaUrl(url);
  if (!named || !isPicture(named.file)) return null;
  try {
    return `data:${IMAGE_MIME[extOf(named.file)]};base64,${fs.readFileSync(path.join(notesDir, named.id, named.file)).toString('base64')}`;
  } catch { return null; }
}

/**
 * How much video an exported note carries inside itself, in all. What is more
 * goes into a folder beside the file (travelWhole): no video is too large to
 * travel — "no size limit on the videos of a Nebula note" (the owner).
 */
export const TRAVEL_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_KIND = { mp4: 'mp4', m4v: 'mp4', webm: 'webm', ogv: 'ogg', mov: 'quicktime' };
const VIDEO_EXT = { mp4: 'mp4', webm: 'webm', ogg: 'ogv', quicktime: 'mov' };
const VIDEO_DATA = /data:video\/(mp4|webm|ogg|quicktime);base64,([A-Za-z0-9+/]{400,}={0,2})/g;

/** A video or an attached file sealed beside a note in a black hole (black-holes.js). */
const SEALED = /nebula-media:\/\/hole\/([\w-]{1,120})\/([\w-]{1,120})\/((?:vid|att)-[a-z0-9]+-[0-9a-f]{8}\.[a-z0-9]{2,5})/g;

/** Where the videos too large for an exported note's own file are put: a folder beside it, named after it. */
export const travelFolder = (filePath) => `${String(filePath).replace(/\.json$/i, '')} videos`;

/**
 * A note leaving the vault as a Nebula note, with every video it has. Those
 * that fit the budget are written into the file; each of the rest is handed
 * back to be put into the folder beside the file (travelFolder), where the
 * import finds it again (stageTravelled). The note names such a video as a
 * file of its own folder, whatever it was before.
 *
 * @param {string} text the note file's text
 * @param {string} notesDir
 * @param {object} [opts]
 * @param {number} [opts.budget]
 * @param {{size: Function, read: Function, write: Function}} [opts.sealed] the videos of a note in a
 *   black hole, opened by the main process: size(hole, note, file) → bytes or null,
 *   read(hole, note, file) → Promise<Buffer>, write(hole, note, file, dest) → Promise<boolean>
 * @returns {Promise<{text: string, beside: Array<{name: string, put: (dest: string) => Promise<boolean>}>, left: number}>}
 *   `left`: videos the note names that are not there to be carried
 */
export async function travelWhole(text, notesDir, { budget = TRAVEL_VIDEO_BYTES, sealed = null } = {}) {
  let out = inlinePictures(text, notesDir);
  let room = budget;
  let left = 0;
  const beside = new Map();
  const swaps = [];
  // An attached file always goes beside: written in, it would come back as a video, or not at all.
  const fits = (file, size) => isVideoName(file) && extOf(file) in VIDEO_KIND && size <= room;
  for (const [address, id, file] of new Map([...out.matchAll(REFERENCE)].filter((m) => isKeptFile(m[2])).map((m) => [m[0], m])).values()) {
    const full = mediaPath(notesDir, id, file);
    let size = -1;
    try { size = fs.statSync(full).size; } catch { size = -1; }
    if (size < 0) { left += 1; continue; }
    if (fits(file, size)) {
      room -= size;
      swaps.push([address, `data:video/${VIDEO_KIND[extOf(file)]};base64,${fs.readFileSync(full).toString('base64')}`]);
    } else if (!beside.has(file)) {
      beside.set(file, { name: file, put: async (dest) => { try { await fs.promises.copyFile(full, dest); return true; } catch { return false; } } });
    }
  }
  for (const [address, hole, id, file] of new Map([...out.matchAll(SEALED)].map((m) => [m[0], m])).values()) {
    const size = sealed?.size(hole, id, file) ?? null;
    if (size === null || !NOTE_ID.test(id)) { left += 1; continue; }
    if (fits(file, size)) {
      room -= size;
      swaps.push([address, `data:video/${VIDEO_KIND[extOf(file)]};base64,${(await sealed.read(hole, id, file)).toString('base64')}`]);
    } else {
      if (!beside.has(file)) beside.set(file, { name: file, put: (dest) => sealed.write(hole, id, file, dest) });
      swaps.push([address, mediaUrl(id, file)]);
    }
  }
  for (const [from, to] of swaps) out = out.split(from).join(to);
  return { text: out, beside: [...beside.values()], left };
}

/** Where the videos of a note file brought in from elsewhere wait until the note is saved: `notes/incoming-…`. */
const INCOMING = /^incoming-[a-z0-9]{6,20}$/;

/**
 * A note file from elsewhere with videos written into it: each becomes a file
 * at once, in a folder of its own beside the notes, and the text names it —
 * the window is never handed a video as text. The note's first save takes
 * the files into the note's own folder (`rehome`), and the next start clears
 * what waited.
 */
export function stageVideos(text, notesDir) {
  const source = String(text ?? '');
  if (!source.includes('data:video/')) return source;
  const id = `incoming-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const folder = path.join(notesDir, id);
  let made = false;
  return source.replace(VIDEO_DATA, (all, kind, b64) => {
    try {
      if (!made) { fs.mkdirSync(folder, { recursive: true }); made = true; }
      const name = `vid-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${VIDEO_EXT[kind.toLowerCase()]}`;
      writeAtomic(path.join(folder, name), Buffer.from(b64, 'base64'));
      return mediaUrl(id, name);
    } catch { return all; }
  });
}

/**
 * A note file brought in from elsewhere, with all of its videos: those written
 * into it (stageVideos), and those lying beside it — in the folder an export
 * made for the large ones (travelFolder), or in the note's own folder when the
 * file was copied out of a vault with it. Each is copied to where the others
 * wait, and the text names it there.
 * @param {string} text @param {string} notesDir @param {string} filePath the note file that is read
 * @returns {Promise<string>}
 */
export async function stageTravelled(text, notesDir, filePath) {
  let out = stageVideos(text, notesDir);
  const named = [...new Map([...out.matchAll(REFERENCE)].filter((m) => isKeptFile(m[2]) && !INCOMING.test(m[1])).map((m) => [m[0], m])).values()];
  if (!named.length) return out;
  const here = path.dirname(filePath);
  let incoming = null;
  for (const [address, id, file] of named) {
    // …or beside the note's file itself, when that is read out of its own folder.
    const from = [path.join(travelFolder(filePath), file), path.join(here, id, file), ...(path.basename(here) === id ? [path.join(here, file)] : [])].find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
    if (!from) continue;
    try {
      incoming ??= `incoming-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
      await fs.promises.mkdir(path.join(notesDir, incoming), { recursive: true });
      const tmp = path.join(notesDir, incoming, `${file}.tmp-${process.pid}`);
      await fs.promises.copyFile(from, tmp);
      await fs.promises.rename(tmp, path.join(notesDir, incoming, file));
      out = out.split(address).join(mediaUrl(incoming, file));
    } catch { /* it goes on naming a file that is not here */ }
  }
  return out;
}

/** The files a note's text names: {own: in its own folder, others: [id, file] in another note's}. */
export function referencesOf(text, id) {
  const own = new Set();
  const others = [];
  for (const m of String(text ?? '').matchAll(REFERENCE)) {
    if (m[1] === id) own.add(m[2]); else others.push([m[1], m[2]]);
  }
  return { own, others };
}

/**
 * A note that names a file of another note — a copy of a note, a video pasted
 * from one — gets a copy of that file in its own folder, and names that
 * instead: each note owns what it shows, and deleting one never empties the other.
 */
export function rehome(text, id, notesDir) {
  const source = String(text ?? '');
  if (!NOTE_ID.test(String(id))) return source;
  const { others } = referencesOf(source, id);
  if (!others.length) return source;
  let out = source;
  for (const [from, file] of others) {
    const src = mediaPath(notesDir, from, file);
    const dest = mediaPath(notesDir, id, file);
    if (!src || !dest) continue;
    try {
      // Its copy already here is its own, the other note's file gone or not: a
      // window still naming a deleted note's file must not leave this one unnamed.
      if (!fs.existsSync(dest)) {
        if (!fs.existsSync(src)) continue;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
      out = out.split(mediaUrl(from, file)).join(mediaUrl(id, file));
    } catch { /* it goes on naming the other note's file */ }
  }
  return out;
}

/**
 * The pictures and videos a note's folder holds that its text no longer names.
 * @param {{videos?: boolean}} [opts] videos too
 * @returns {string[]} their file names
 */
export function unnamedOf(notesDir, id, text, { videos = false } = {}) {
  if (!NOTE_ID.test(String(id))) return [];
  const folder = noteFolder(notesDir, id);
  let names;
  try {
    if (!fs.lstatSync(folder).isDirectory()) return [];
    names = fs.readdirSync(folder);
  } catch { return []; }
  const { own } = referencesOf(text, id);
  return names.filter((name) => !own.has(name) && !name.includes('.tmp-') && (isPicture(name) || (videos && isKeptFile(name))));
}

/**
 * Which of a note's files did the person take out, and which went some other way?
 *
 * What a note no longer names is deleted at the next start, from its folder
 * and from every backup. Taken out by the person that is what was asked for,
 * however many they were: "when someone deletes and closes, why should it
 * come back? It has to be gone altogether" (the owner, on a build that asked
 * whenever many went at once). Lost some other way — a fault, a file changed
 * outside the app — it would be the pictures gone with no way back.
 *
 * The two look the same on the disk, but not on the way there: everything
 * the window does to a note is written through the app (main.js
 * storage:write), and each such write is looked at — the files the note named
 * before it and does not name after it are *released* by the person; one
 * named again (an undo) is released no longer. The list is kept beside the
 * vault's other files (`released.json`) for the next start, which deletes what
 * is on it without a word, and keeps and asks about an unnamed file that is
 * not: nothing in the app took it out.
 *
 * A vault that has no such list yet was last written by a build that kept
 * none: everything unnamed goes, as it did then.
 *
 * Against a sudden end — a crash, the power gone — every step errs the same
 * way: towards keeping and asking. The list is written *before* the note is
 * (main.js): cut off between the two, the note still names the file and
 * nothing happens to it. A note's file is replaced whole or not at all; one
 * that cannot be read is not judged. And a list that is there but cannot be
 * read is an empty list — nothing was taken out, so everything unnamed is
 * asked about — never "no list", which would delete it all.
 */
export const RELEASED_FILE = 'released.json';

/**
 * The list as it was left: note id → the files released. Null: there is no
 * list at all. One that cannot be read is an empty one.
 */
export function readReleased(file) {
  const map = new Map();
  let stored;
  try { stored = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return err?.code === 'ENOENT' ? null : map; }
  for (const [id, names] of Object.entries(stored?.notes ?? {})) {
    if (!NOTE_ID.test(id) || !Array.isArray(names)) continue;
    const clean = names.filter((name) => FILE_NAME.test(String(name)));
    if (clean.length) map.set(id, new Set(clean));
  }
  return map;
}

export function writeReleased(file, released) {
  const notes = {};
  for (const [id, names] of released) if (names.size) notes[id] = [...names].sort();
  writeAtomic(file, JSON.stringify({ v: 1, notes }, null, 2));
}

/**
 * One write of a note through the app, looked at: what it no longer names is
 * released, what it names again is not.
 * @param {Map<string, Set<string>>} released changed in place
 * @returns {boolean} whether the list changed
 */
export function noteReleases(released, id, before, after) {
  if (!NOTE_ID.test(String(id))) return false;
  const was = referencesOf(before, id).own;
  const is = referencesOf(after, id).own;
  const names = released.get(id) ?? new Set();
  let changed = false;
  for (const name of was) if (!is.has(name) && !names.has(name)) { names.add(name); changed = true; }
  for (const name of is) if (names.delete(name)) changed = true;
  if (names.size) released.set(id, names); else released.delete(id);
  return changed;
}

/**
 * A file copied into a note's folder for the window, which no longer wants it:
 * another note was opened while it was being copied (hunt B18). No write ever
 * named it, so nothing released it, and the next start asked about "pictures
 * no longer shown" for a file that never was in the note. Released here, it
 * goes at the next start without a word — still only if the note does not
 * name it then.
 * @param {Map<string, Set<string>>} released changed in place
 * @returns {boolean} whether the list changed
 */
export function releaseAdded(released, notesDir, id, url) {
  if (!NOTE_ID.test(String(id))) return false;
  const prefix = mediaUrl(id, '');
  const name = String(url ?? '').startsWith(prefix) ? String(url).slice(prefix.length) : '';
  if (!FILE_NAME.test(name) || !(isKeptFile(name) || isPicture(name))) return false;
  if (!fs.existsSync(path.join(noteFolder(notesDir, id), name))) return false;
  let text = '';
  try { text = fs.readFileSync(noteFile(notesDir, id), 'utf8'); } catch { /* a note never saved names nothing */ }
  if (referencesOf(text, id).own.has(name)) return false;
  const names = released.get(id) ?? new Set();
  if (names.has(name)) return false;
  names.add(name);
  released.set(id, names);
  return true;
}

/**
 * What a note's folder holds that its text no longer names, removed.
 * @param {{videos?: boolean, only?: Set<string>}} [opts] videos too (at a
 *   start; never while the note is open, when an undo may still bring one
 *   back); `only`: of these files alone
 * @returns {number} files removed
 */
export function sweepNote(notesDir, id, text, { videos = false, only = null } = {}) {
  if (!NOTE_ID.test(String(id))) return 0;
  const folder = noteFolder(notesDir, id);
  let removed = 0;
  for (const name of unnamedOf(notesDir, id, text, { videos })) {
    if (only && !only.has(name)) continue;
    shred(path.join(folder, name));
    removed += 1;
  }
  try { if (!fs.readdirSync(folder).length) fs.rmdirSync(folder); } catch { /* not empty, or gone */ }
  return removed;
}

/** A note's folder and everything in it, gone: the note was deleted. */
/** The same, without holding the event loop: each file overwritten block by
 * block (shredAsync), the folder removed after — for the storage:delete
 * path, where a large video must not freeze the window (main.js awaits it).
 */
export async function removeNoteFolderAsync(notesDir, id) {
  if (!NOTE_ID.test(String(id))) return 0;
  const folder = noteFolder(notesDir, id);
  // A planted link or junction in the folder's place is unlinked, never followed.
  try { if (fs.lstatSync(folder).isSymbolicLink()) { await fs.promises.rm(folder, { force: true }); return 0; } } catch { return 0; }
  let names;
  try { names = fs.readdirSync(folder); } catch { return 0; }
  for (const name of names) await shredAsync(path.join(folder, name));
  await fs.promises.rm(folder, { recursive: true, force: true });
  return names.length;
}

export function removeNoteFolder(notesDir, id) {
  if (!NOTE_ID.test(String(id))) return 0;
  const folder = noteFolder(notesDir, id);
  // As the asynchronous one: a planted link is unlinked, never followed.
  try { if (fs.lstatSync(folder).isSymbolicLink()) { fs.rmSync(folder, { force: true }); return 0; } } catch { return 0; }
  let names;
  try { names = fs.readdirSync(folder); } catch { return 0; }
  for (const name of names) shred(path.join(folder, name));
  fs.rmSync(folder, { recursive: true, force: true });
  return names.length;
}

/** What is written once and never changed: a picture, a video, an attached file, either sealed in a black hole. */
const writtenOnce = (name) => !name.includes('.tmp-') && (isPicture(name) || isKeptFile(name) || name.endsWith('.bhv'));

/**
 * The vault copied aside — a backup. What is written once and never changed
 * (pictures, videos) is not copied but shared: a second name for the same
 * bytes (a hard link), so seven days of backups hold a video once, not eight
 * times. Everything else — the notes' own files, a few kilobytes each — is
 * copied.
 *
 * Where the disk cannot share a file (a flash drive's exFAT, a network
 * folder) a copy has to hold the bytes itself. With `before` — the daily copy
 * this one takes the place of — it takes them over from there instead of
 * copying them again: the file is moved from the old copy into the new one,
 * by its name and its size. So a note with a 1.8 GB video is copied once, on
 * the day the video comes, not at the first start of every day; and the old
 * copy, which goes when the new one is made, never stands beside it in full.
 * @returns {{copied: number, shared: number, taken: number}}
 */
export function snapshotVault(src, dest, before = null) {
  const done = { copied: 0, shared: 0, taken: 0 };
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    const old = before ? path.join(before, entry.name) : null;
    if (entry.isDirectory()) {
      const inner = snapshotVault(from, to, old);
      done.copied += inner.copied;
      done.shared += inner.shared;
      done.taken += inner.taken;
    } else if (entry.isFile()) {
      // A copy cut short is never whole: no backup is the better for it (tidyVault removes it after).
      if (isCutShort(entry.name)) continue;
      if (writtenOnce(entry.name)) {
        try { fs.linkSync(from, to); done.shared += 1; continue; } catch { /* this disk cannot share a file */ }
        if (old) {
          try {
            if (fs.statSync(old).size === fs.statSync(from).size) { fs.renameSync(old, to); done.taken += 1; continue; }
          } catch { /* the copy before does not hold it: copied below */ }
        }
      }
      fs.copyFileSync(from, to);
      done.copied += 1;
    }
  }
  return done;
}

/**
 * The files the vault's notes name in their own folders that are not there.
 * None: every picture and video taken out of a note's text is in its folder.
 * @returns {number|null} null when the vault could not be read
 */
export function missingMedia(notesDir) {
  const ids = noteIds(notesDir);
  if (!ids) return null;
  let missing = 0;
  for (const id of ids) {
    if (!NOTE_ID.test(id)) continue;
    let text;
    try { text = fs.readFileSync(noteFile(notesDir, id), 'utf8'); } catch { continue; }
    for (const file of referencesOf(text, id).own) if (!fs.existsSync(path.join(notesDir, id, file))) missing += 1;
  }
  return missing;
}

/**
 * At a start: every note file goes into its note's folder; every note still
 * holding pictures in its text is written the new way; and what no note names
 * any more is removed from the folders — the videos taken out of notes since
 * the last start among it. A note whose file cannot be read is left alone,
 * folder and all. With `released` — what the person took out since the last
 * start (noteReleases) — an unnamed file that is not on it stays, and is named
 * in `held` for the person to be asked about; without it everything unnamed goes.
 * @param {{released?: Map<string, Set<string>>|null}} [opts]
 * @returns {{inside: number, moved: number, swept: number, held: {id: string, files: string[]}[]}}
 */
export function tidyVault(notesDir, { released = null } = {}) {
  const result = { inside: moveNotesIn(notesDir), moved: 0, swept: 0, held: [] };
  let names;
  try { names = fs.readdirSync(notesDir); } catch { return result; }
  for (const name of names) {
    // What an imported note's videos waited in: taken into the note's own folder at its first save.
    if (INCOMING.test(name)) { result.swept += removeNoteFolder(notesDir, name); continue; }
    const id = name;
    if (!NOTE_ID.test(id)) continue;
    const file = noteFile(notesDir, id);
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
      if (!JSON.parse(text)?.id) continue;
    } catch {
      if (abandonedFolder(notesDir, id)) result.swept += removeNoteFolder(notesDir, id);
      continue;
    }
    result.swept += sweepCutShort(notesDir, id);
    try {
      const out = rehome(externalize(text, id, notesDir).text, id, notesDir);
      if (out !== text) { writeAtomic(file, out); result.moved += 1; text = out; }
      const taken = released?.get(id);
      const unexplained = released ? unnamedOf(notesDir, id, text, { videos: true }).filter((name) => !taken?.has(name)) : [];
      if (unexplained.length) {
        result.held.push({ id, files: unexplained });
        result.swept += sweepNote(notesDir, id, text, { videos: true, only: taken ?? new Set() });
        continue;
      }
      result.swept += sweepNote(notesDir, id, text, { videos: true });
    } catch { /* this note stays as it was */ }
  }
  return result;
}

/** What a copy into a note's folder is written as until it is whole (copyInto, writeAtomic): `<name>.tmp-<pid>[-<time>-<random>]`. */
const CUT_SHORT = /^(.+)\.tmp-\d+(?:-\d+-[a-z0-9]+)?$/;

/** A copy cut short of a file this app writes into a note's folder — never whole, never worth keeping or backing up. With `id`: of that note's own file. */
export function isCutShort(name, id = null) {
  const base = CUT_SHORT.exec(String(name))?.[1];
  return !!base && (isPicture(base) || isKeptFile(base) || (id == null ? base.endsWith('.json') : base === `${id}.json`));
}

/**
 * Copies cut short in a saved note's folder — a quit or a crash while a file,
 * a video, a picture or the note itself was being written — removed. Nothing
 * names them, so nothing else ever would, and every daily backup would copy
 * them in full. Only at a start: one app on the profile, nothing copying yet.
 * Only what this app writes there; anything else stays.
 * @returns {number} files removed
 */
function sweepCutShort(notesDir, id) {
  const folder = noteFolder(notesDir, id);
  let removed = 0;
  let entries;
  try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    if (!entry.isFile() || !isCutShort(entry.name, id)) continue;
    shred(path.join(folder, entry.name));
    removed += 1;
  }
  return removed;
}

/**
 * A folder no note was ever written into, holding only files copied in for
 * one (videos, attached files, a copy cut short): a new note left before its
 * first save while its file was being copied. Nothing names them, and a note
 * whose file is there but cannot be read is never this.
 */
function abandonedFolder(notesDir, id) {
  if (fs.existsSync(noteFile(notesDir, id)) || fs.existsSync(path.join(notesDir, `${id}.json`))) return false;
  let entries;
  try { entries = fs.readdirSync(noteFolder(notesDir, id), { withFileTypes: true }); } catch { return false; }
  return entries.every((e) => e.isFile() && (isKeptFile(e.name) || isKeptFile(e.name.replace(/\.tmp-\d+$/, ''))));
}

/**
 * A video file copied into a note's folder.
 * @returns {Promise<{ok: boolean, url?: string, name?: string, error?: string}>}
 */
export async function addVideo(notesDir, id, source) {
  if (!NOTE_ID.test(String(id))) return { ok: false, error: 'no note' };
  const from = String(source ?? '');
  const ext = extOf(from);
  if (!from || !(ext in VIDEO_MIME)) return { ok: false, error: 'not a video this app can play' };
  return copyInto(notesDir, id, from, 'vid', ext);
}

/** The extension an attached file is kept under: its own, when it is a plain one; `bin` otherwise. */
export function attachmentExt(source) {
  const ext = path.extname(String(source ?? '')).slice(1).toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'bin';
}

/**
 * Any file copied into a note's folder, to be kept there (isAttachmentName).
 * The name it came with is handed back for the note's card; the folder keeps
 * it under a name of its own, which no file name from outside can bend.
 * @returns {Promise<{ok: boolean, url?: string, name?: string, size?: number, error?: string}>}
 */
export async function addAttachment(notesDir, id, source) {
  if (!NOTE_ID.test(String(id))) return { ok: false, error: 'no note' };
  const from = String(source ?? '');
  if (!from) return { ok: false, error: 'no file' };
  return copyInto(notesDir, id, from, 'att', attachmentExt(from));
}

async function copyInto(notesDir, id, from, prefix, ext) {
  try {
    const stat = await fs.promises.stat(from);
    if (!stat.isFile()) return { ok: false, error: 'not a file' };
    const folder = noteFolder(notesDir, id);
    // A note saved before the copy and gone after it was deleted meanwhile: its
    // folder must not come back with this file in it (tidyVault passes a folder with no note).
    const saved = fs.existsSync(noteFile(notesDir, id));
    await fs.promises.mkdir(folder, { recursive: true });
    const name = `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const tmp = path.join(folder, `${name}.tmp-${process.pid}`);
    try {
      await fs.promises.copyFile(from, tmp);
      await fs.promises.rename(tmp, path.join(folder, name));
    } catch (err) {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
    if (saved && !fs.existsSync(noteFile(notesDir, id))) {
      await fs.promises.rm(path.join(folder, name), { force: true }).catch(() => {});
      await fs.promises.rmdir(folder).catch(() => {});
      return { ok: false, error: 'no note' };
    }
    return { ok: true, url: mediaUrl(id, name), name: path.basename(from), size: stat.size };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** A `bytes=a-b` header against a file's size: [start, end], or null when there is none or it cannot be met. */
export function byteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  end = Math.min(end, size - 1);
  if (start > end || start >= size) return null;
  start = Math.max(0, start);
  return [start, end];
}
