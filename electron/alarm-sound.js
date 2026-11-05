/**
 * The sounds the Pomodoro and the Clock widgets ring with (1.0.3,
 * src/js/alarm-sound.js): one of the system's own sounds, or files of the
 * user's kept in the profile. They belong to no note.
 *
 * The owner's Bug Find note: "kullanici kendisi mp3 yükleyebilir yada sistemin
 * (windowsun hazir sesleri yada macin hazir seslerinden birini secebilsin)",
 * and then "break ile focusun sesi farkli olsun": so the user's sounds are a
 * small shelf, not one slot — each is kept as <id>.<ext> with its name in
 * <id>.name. The one sound of the first 1.0.3 builds (own.<ext>, name.txt)
 * is read as the id 'own'.
 */

import fs from 'node:fs';
import path from 'node:path';

const OWN_MAX = 15_000_000;
/** How many sounds of the user's are kept at most. */
export const OWN_COUNT = 20;
const TYPES = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.aiff': 'audio/aiff', '.aif': 'audio/aiff', '.m4a': 'audio/mp4', '.flac': 'audio/flac' };
const LEGACY = 'own';
const validId = (id) => typeof id === 'string' && (id === LEGACY || /^[a-z0-9]{6,24}$/.test(id));

/** Where the system keeps its ready sounds, by platform. */
export function systemSoundDir(platform = process.platform, env = process.env) {
  if (platform === 'win32') return path.join(env.SystemRoot || env.windir || 'C:\\Windows', 'Media');
  if (platform === 'darwin') return '/System/Library/Sounds';
  return '/usr/share/sounds/freedesktop/stereo';
}

/** The sounds in `dir` the app can play: plain file names, sorted. Pure over the listing — tested. */
export function soundNames(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && TYPES[path.extname(d.name).toLowerCase()])
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

const address = (file) => `data:${TYPES[path.extname(file).toLowerCase()]};base64,${fs.readFileSync(file).toString('base64')}`;

/** A system sound by its name, as an address; null for a name that is not one of `dir`'s own. */
export function readSystemSound(dir, name) {
  if (typeof name !== 'string' || !soundNames(dir).includes(name)) return null;
  try { return address(path.join(dir, name)); } catch { return null; }
}

/** The file of a sound of the user's in `dir`, by its id; null if there is none. */
function ownFile(dir, id) {
  if (!validId(id)) return null;
  try {
    return fs.readdirSync(dir).find((f) => path.basename(f, path.extname(f)) === id && TYPES[path.extname(f).toLowerCase()]) ?? null;
  } catch {
    return null;
  }
}

function ownName(dir, id, file) {
  for (const f of [`${id}.name`, ...(id === LEGACY ? ['name.txt'] : [])]) {
    try { const n = fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 200); if (n) return n; } catch { /* the next */ }
  }
  return file;
}

/** The user's sounds kept in `dir`, oldest first: [{ id, name }]. */
export function listOwnSounds(dir) {
  let files;
  try { files = fs.readdirSync(dir); } catch { return []; }
  return files
    .filter((f) => TYPES[path.extname(f).toLowerCase()] && validId(path.basename(f, path.extname(f))))
    .map((f) => ({ id: path.basename(f, path.extname(f)), file: f }))
    .sort((a, b) => (a.id === LEGACY ? -1 : b.id === LEGACY ? 1 : a.id.localeCompare(b.id)))
    .map(({ id, file }) => ({ id, name: ownName(dir, id, file) }));
}

/** A sound of the user's kept in `dir`: { name, address } or null. */
export function readOwnSound(dir, id = LEGACY) {
  const file = ownFile(dir, id);
  if (!file) return null;
  try { return { name: ownName(dir, id, file), address: address(path.join(dir, file)) }; } catch { return null; }
}

/** A new id, after every one there is, so the shelf keeps its order. */
function newId(dir) {
  let id = Date.now().toString(36).padStart(9, '0');
  while (ownFile(dir, id)) id = (Number.parseInt(id, 36) + 1).toString(36).padStart(9, '0');
  return id;
}

/** Keeps a sound file of the user's: an audio address of a known kind and a reasonable weight. */
export function writeOwnSound(dir, dataUrl, name) {
  const m = /^data:(audio\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  const ext = m && Object.keys(TYPES).find((e) => TYPES[e] === m[1] || (m[1] === 'audio/mp3' && e === '.mp3') || (m[1] === 'audio/x-wav' && e === '.wav'));
  if (!m || !ext || m[2].length > OWN_MAX * 1.4) return { ok: false, error: 'sound' };
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length || bytes.length > OWN_MAX) return { ok: false, error: 'sound' };
  if (listOwnSounds(dir).length >= OWN_COUNT) return { ok: false, error: 'full' };
  fs.mkdirSync(dir, { recursive: true });
  const id = newId(dir);
  fs.writeFileSync(path.join(dir, `${id}${ext}`), bytes);
  fs.writeFileSync(path.join(dir, `${id}.name`), String(name ?? '').replace(/[\r\n]/g, ' ').slice(0, 200));
  return { ok: true, id };
}

/** Takes one sound of the user's away, or, without an id, all of them. */
export function clearOwnSound(dir, id) {
  if (id === undefined) { fs.rmSync(dir, { recursive: true, force: true }); return; }
  const file = ownFile(dir, id);
  if (file) fs.rmSync(path.join(dir, file), { force: true });
  fs.rmSync(path.join(dir, `${id}.name`), { force: true });
  if (id === LEGACY) fs.rmSync(path.join(dir, 'name.txt'), { force: true });
}
