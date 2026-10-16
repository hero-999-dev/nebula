/**
 * Nebula's logo in colours of one's own — what the main process does with it
 * (0.9.4; the picks and the drawing are src/js/logo.js, the editor is
 * src/js/logo-editor.js in Settings).
 *
 * The window draws the logo in each size an icon needs and hands the pictures
 * over. Here they are checked — a PNG of the size it says, and nothing else —
 * kept in the profile, and worn:
 *
 *   <profile>/logo/logo.json         the five colours, and the icon file's name
 *   <profile>/logo/icon.png          256 px: the window's and the taskbar's
 *   <profile>/logo/icon-<hash>.ico   every size, for a shortcut to point at
 *
 * A shortcut's icon is a file's name to Windows, and what was drawn under one
 * name is remembered by the desktop: so each logo gets a file name of its own
 * (a hash of its colours), and the one before is removed.
 *
 * "The logo on the desktop" is a shortcut's icon: the shortcuts on the
 * desktop, in the Start menu, and pinned to the taskbar or to Start, that
 * start THIS copy of the app are pointed at the new icon file, and back at the
 * program when the logo is Nebula's own again. A program file standing on the
 * desktop itself is drawn by Windows from what was built into it: that icon
 * cannot be changed from here — rewriting a running, signed program is not
 * something an app does to itself — so a shortcut wearing the logo can be
 * made beside it (`makeShortcut`).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LOGO_SLOTS = ['bg', 'edge', 'moon', 'shade', 'star'];
/** The sizes an icon file holds, largest first. */
export const ICON_SIZES = [256, 64, 48, 32, 24, 16];
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PICTURE_MAX = 600_000;

/** Five "#RRGGBB", or null when one is missing or is not a colour. */
export function cleanLogoColors(raw) {
  const out = {};
  for (const slot of LOGO_SLOTS) {
    const hex = /^#([0-9a-f]{6})$/i.exec(String(raw?.[slot] ?? '').trim());
    if (!hex) return null;
    out[slot] = `#${hex[1].toUpperCase()}`;
  }
  return out;
}

/**
 * A PNG out of a `data:image/png;base64,…` address, when it is one of exactly
 * `size` pixels a side and of a reasonable weight; null otherwise.
 */
export function pngOfSize(dataUrl, size) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m || m[1].length > PICTURE_MAX * 1.4) return null;
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length < 33 || bytes.length > PICTURE_MAX || !bytes.subarray(0, 8).equals(PNG)) return null;
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  if (bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) return null;
  return bytes;
}

/**
 * An .ico of PNG pictures (Windows Vista and later read them as they are).
 * @param {Array<[number, Buffer]>} pictures [size, png], any order
 */
export function icoOf(pictures) {
  const list = [...pictures].sort((a, b) => b[0] - a[0]);
  const head = Buffer.alloc(6 + 16 * list.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);                 // an icon
  head.writeUInt16LE(list.length, 4);
  let at = head.length;
  list.forEach(([size, png], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);       // 0 says 256
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);                     // planes
    head.writeUInt16LE(32, e + 6);                    // bits a pixel
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(at, e + 12);
    at += png.length;
  });
  return Buffer.concat([head, ...list.map(([, png]) => png)]);
}

/** The logo kept in the profile: its colours and its files, or null where there is none (or what is there is not whole). */
export function readLogo(dir) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'logo.json'), 'utf8'));
    const colors = cleanLogoColors(meta?.colors);
    const ico = /^icon-[0-9a-f]{12}\.ico$/.test(String(meta?.ico)) ? path.join(dir, meta.ico) : null;
    const png = path.join(dir, 'icon.png');
    if (!colors || !ico || !fs.existsSync(ico) || !fs.existsSync(png)) return null;
    return { colors, ico, png };
  } catch {
    return null;
  }
}

/**
 * Keep a logo: its colours and its pictures.
 * @param {string} dir <profile>/logo
 * @param {object} colors the five picks
 * @param {Record<string, string>} images size → PNG data address, every size of ICON_SIZES
 * @returns {{ok: true, colors: object, ico: string, png: string} | {ok: false, error: string}}
 */
export function writeLogo(dir, colors, images) {
  const clean = cleanLogoColors(colors);
  if (!clean) return { ok: false, error: 'colors' };
  const pictures = [];
  for (const size of ICON_SIZES) {
    const png = pngOfSize(images?.[size], size);
    if (!png) return { ok: false, error: 'picture' };
    pictures.push([size, png]);
  }
  const name = `icon-${crypto.createHash('sha256').update(LOGO_SLOTS.map((s) => clean[s]).join('')).digest('hex').slice(0, 12)}.ico`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), icoOf(pictures));
  fs.writeFileSync(path.join(dir, 'icon.png'), pictures[0][1]);
  fs.writeFileSync(path.join(dir, 'logo.json'), JSON.stringify({ colors: clean, ico: name }, null, 2));
  // The icon files of the logos before this one.
  for (const file of fs.readdirSync(dir)) {
    if (/^icon-[0-9a-f]{12}\.ico$/.test(file) && file !== name) fs.rmSync(path.join(dir, file), { force: true });
  }
  return { ok: true, colors: clean, ico: path.join(dir, name), png: path.join(dir, 'icon.png') };
}

/** Nebula's own logo again: nothing of a custom one is kept. */
export function clearLogo(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Every shortcut file under `dirs`, two folders deep — read from the disk without holding the process up. */
export async function listShortcuts(dirs, depth = 2) {
  const out = [];
  const walk = async (dir, left) => {
    let entries = [];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (left > 0) await walk(full, left - 1); } else if (/\.lnk$/i.test(entry.name)) out.push(full);
    }
  };
  for (const dir of dirs) if (dir) await walk(dir, depth);
  return out;
}

/**
 * Point the shortcuts that start this copy of the app at an icon file.
 *
 * Done a few shortcuts at a time, letting go of the process in between
 * (`breathe`). A computer's Start menu holds hundreds of shortcuts, and
 * reading each is a call to Windows: read in one go, the app's own thread
 * stood still for a second and more at every change of the logo — and it is
 * that thread Windows asks for the window's new icon. Asked while it was
 * busy, Windows gave up and the taskbar kept the old one ("it does not change
 * now; it did before" — the owner, when the Start menu of every user was
 * added to the places looked in).
 *
 * @param {object} how
 * @param {string[]} how.dirs where shortcuts are looked for, two folders deep
 * @param {string} how.target the program the shortcut must start
 * @param {string} how.icon the icon file — or the program itself, for its own icon
 * @param {{readShortcutLink: Function, writeShortcutLink: Function}} how.shell Electron's
 * @param {() => boolean} [how.stale] true once a newer logo has come: the rest is left to that one
 * @param {() => Promise<void>} [how.breathe] lets the process do its other work
 * @returns {Promise<string[]>} the shortcuts that were changed
 */
export async function pointShortcuts({ dirs, target, icon, shell, depth = 2, stale = () => false, breathe = () => new Promise((resolve) => { setImmediate(resolve); }) }) {
  const want = path.normalize(String(target)).toLowerCase();
  const changed = [];
  const files = await listShortcuts(dirs, depth);
  for (let i = 0; i < files.length; i += 1) {
    if (i % 2 === 1) await breathe();
    if (stale()) break;
    const full = files[i];
    try {
      const link = shell.readShortcutLink(full);
      if (path.normalize(String(link?.target ?? '')).toLowerCase() !== want) continue;
      if (path.normalize(String(link.icon ?? '')).toLowerCase() === path.normalize(icon).toLowerCase() && (link.iconIndex ?? 0) === 0) continue;
      if (shell.writeShortcutLink(full, 'update', { icon, iconIndex: 0 })) changed.push(full);
    } catch { /* not a shortcut this can read: left alone */ }
  }
  return changed;
}

/**
 * The taskbar (0.9.5).
 *
 * Windows draws a taskbar button from what the window's app ID stands for, not
 * from the window: where a Start-menu shortcut carries that ID — every
 * installed copy has one — the button wears that shortcut's icon, and the
 * window's own is not looked at. A copy installed for all users cannot write
 * that shortcut, so its taskbar never wore the logo ("on the desktop it works;
 * down on the taskbar it does not" — the owner's Ideas note; measured on
 * Windows 11: a window's icon, and its relaunch icon, change nothing while a
 * shortcut carries its ID).
 *
 * So while a logo of the user's is on, the window takes an ID no shortcut
 * carries, and says which icon and which program stand for it. The ID has the
 * logo's own name in it: the taskbar remembers the icon it drew for an ID, and
 * a second logo under the first one's ID went on being drawn as the first.
 */
export function logoAppId(base, ico) {
  const hash = /icon-([0-9a-f]{12})\.ico$/i.exec(String(ico ?? ''));
  return hash ? `${base}.logo.${hash[1].toLowerCase()}` : base;
}

/**
 * The app ID of the taskbar pin that starts this copy: '' for a pin without
 * one, null where nothing is pinned.
 * @param {{dir: string, target: string, shell: {readShortcutLink: Function}}} how `dir` is the folder Windows keeps the pins in
 */
export function pinnedAppId({ dir, target, shell }) {
  const want = path.normalize(String(target)).toLowerCase();
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return null; }
  for (const name of names) {
    if (!/\.lnk$/i.test(name)) continue;
    try {
      const link = shell.readShortcutLink(path.join(dir, name));
      if (path.normalize(String(link?.target ?? '')).toLowerCase() === want) return String(link.appUserModelId ?? '');
    } catch { /* not a shortcut this can read */ }
  }
  return null;
}

/**
 * What a window tells the taskbar about itself (Electron's `setAppDetails`).
 * A pin that starts this copy goes first: the window keeps the pin's ID, so
 * that it opens on the pin and not beside it — the pin's own icon is the
 * shortcut's, which `pointShortcuts` looks after.
 * @param {{base: string, logo: {ico: string}|null, pinned: string|null, target: string, name: string}} how
 */
export function taskbarDetails({ base, logo, pinned = null, target, name }) {
  if (pinned !== null) return { appId: pinned || base };
  if (!logo?.ico) return { appId: base };
  return { appId: logoAppId(base, logo.ico), appIconPath: logo.ico, appIconIndex: 0, relaunchCommand: `"${target}"`, relaunchDisplayName: name };
}

/**
 * A shortcut to this copy of the app, wearing the logo — for a desktop that
 * has the program file itself on it, whose own icon cannot be changed.
 * Where a shortcut of that name is there already it is pointed at the logo if
 * it starts this program, and left alone if it starts another.
 * @returns {{ok: boolean, made?: boolean, file?: string, error?: string}}
 */
export function makeShortcut({ dir, name, target, icon, shell }) {
  const clean = Array.from(String(name ?? '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 80).join(''); // characters, not UTF-16 units: never half an emoji (hunt B24)
  if (!dir || !clean || !target) return { ok: false, error: 'where' };
  const file = path.join(dir, `${clean}.lnk`);
  try {
    if (fs.existsSync(file)) {
      const link = shell.readShortcutLink(file);
      if (path.normalize(String(link?.target ?? '')).toLowerCase() !== path.normalize(String(target)).toLowerCase()) return { ok: false, error: 'exists', file };
      return { ok: !!shell.writeShortcutLink(file, 'update', { icon, iconIndex: 0 }), made: false, file };
    }
    fs.mkdirSync(dir, { recursive: true });
    return { ok: !!shell.writeShortcutLink(file, 'create', { target, icon, iconIndex: 0, description: clean }), made: true, file };
  } catch (err) {
    return { ok: false, error: err.message, file };
  }
}
