// @vitest-environment node
/**
 * The logo in colours of one's own (0.9.4), in the main process: the pictures
 * it is handed are checked, kept as an icon file, and the shortcuts that start
 * this copy of the app are pointed at it (electron/app-logo.js). Real files in
 * the system's temp directory; Electron's `shell` is played by the test.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { ICON_SIZES, cleanLogoColors, pngOfSize, icoOf, readLogo, writeLogo, clearLogo, listShortcuts, pointShortcuts, makeShortcut, logoAppId, pinnedAppId, taskbarDetails } from '../electron/app-logo.js';

/** A real PNG of one colour, `size` a side. */
function png(size, value = 0x7c) {
  const row = Buffer.alloc(size * 4 + 1, value);
  row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const url = (bytes) => `data:image/png;base64,${bytes.toString('base64')}`;
const COLORS = { bg: '#F7F7F7', edge: '#2B2B2B', moon: '#2B2B2B', shade: '#2B2B2B', star: '#2b2b2b' };
const pictures = (value) => Object.fromEntries(ICON_SIZES.map((size) => [size, url(png(size, value))]));

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-logo-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('what the window hands over', () => {
  it('five colours, each six hex digits — or it is no logo', () => {
    expect(cleanLogoColors(COLORS)).toEqual({ ...COLORS, star: '#2B2B2B' });
    expect(cleanLogoColors({ ...COLORS, star: undefined })).toBeNull();
    expect(cleanLogoColors({ ...COLORS, bg: 'red' })).toBeNull();
    expect(cleanLogoColors({ ...COLORS, bg: '#FFF' })).toBeNull();
    expect(cleanLogoColors({ ...COLORS, bg: '#F7F7F7"; x' })).toBeNull();
    expect(cleanLogoColors(null)).toBeNull();
  });

  it('a picture is a PNG of exactly the size it is given as, and nothing else', () => {
    expect(pngOfSize(url(png(32)), 32)?.equals(png(32))).toBe(true);
    expect(pngOfSize(url(png(32)), 48)).toBeNull();                                   // another size
    expect(pngOfSize(`data:image/jpeg;base64,${png(32).toString('base64')}`, 32)).toBeNull();
    expect(pngOfSize(`data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`, 32)).toBeNull();
    expect(pngOfSize(`data:image/png;base64,${png(32).toString('base64')}" onerror="x`, 32)).toBeNull();
    expect(pngOfSize('C:\\Windows\\System32\\shell32.dll', 32)).toBeNull();
    expect(pngOfSize(undefined, 32)).toBeNull();
    expect(pngOfSize(`data:image/png;base64,${'A'.repeat(1_000_000)}`, 32)).toBeNull();   // far too heavy for an icon
  });
});

describe('the icon file', () => {
  it('holds every picture, largest first, each where its entry says', () => {
    const list = ICON_SIZES.map((size) => [size, png(size, size & 0xff)]);
    const ico = icoOf([...list].reverse());
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, ICON_SIZES.length]);
    list.forEach(([size, bytes], i) => {
      const e = 6 + 16 * i;
      expect(ico.readUInt8(e), `width of ${size}`).toBe(size === 256 ? 0 : size);
      expect(ico.readUInt8(e + 1)).toBe(size === 256 ? 0 : size);
      expect([ico.readUInt16LE(e + 4), ico.readUInt16LE(e + 6)]).toEqual([1, 32]);
      const [length, at] = [ico.readUInt32LE(e + 8), ico.readUInt32LE(e + 12)];
      expect(length).toBe(bytes.length);
      expect(ico.subarray(at, at + length).equals(bytes)).toBe(true);
    });
    expect(ico.length).toBe(6 + 16 * list.length + list.reduce((sum, [, b]) => sum + b.length, 0));
  });
});

describe('a logo kept in the profile', () => {
  it('is its colours, a 256 px picture and an icon file named after the colours', () => {
    expect(readLogo(dir)).toBeNull();
    const res = writeLogo(dir, COLORS, pictures());
    expect(res.ok).toBe(true);
    expect(res.colors.star).toBe('#2B2B2B');
    expect(path.basename(res.ico)).toMatch(/^icon-[0-9a-f]{12}\.ico$/);
    expect(fs.readFileSync(res.png).equals(png(256))).toBe(true);
    expect(fs.readdirSync(dir).sort()).toEqual([path.basename(res.ico), 'icon.png', 'logo.json'].sort());
    expect(readLogo(dir)).toEqual({ colors: res.colors, ico: res.ico, png: res.png });
  });

  it('another logo has another file name — the desktop remembers a picture by its name — and the one before is removed', () => {
    const first = writeLogo(dir, COLORS, pictures());
    const second = writeLogo(dir, { ...COLORS, star: '#FF0000' }, pictures(0x10));
    expect(second.ico).not.toBe(first.ico);
    expect(fs.existsSync(first.ico)).toBe(false);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.ico'))).toEqual([path.basename(second.ico)]);
    // The same colours again: the same name.
    expect(writeLogo(dir, COLORS, pictures()).ico).toBe(first.ico);
  });

  it('is not kept without every picture, or with a colour that is not one — and what was there stays', () => {
    const first = writeLogo(dir, COLORS, pictures());
    const { 16: _small, ...missing } = pictures();
    expect(writeLogo(dir, COLORS, missing)).toEqual({ ok: false, error: 'picture' });
    expect(writeLogo(dir, COLORS, { ...pictures(), 48: url(png(47)) })).toEqual({ ok: false, error: 'picture' });
    expect(writeLogo(dir, { ...COLORS, moon: 'blue' }, pictures())).toEqual({ ok: false, error: 'colors' });
    expect(readLogo(dir)?.ico).toBe(first.ico);
  });

  it('that is not whole is no logo: the app wears its own', () => {
    const res = writeLogo(dir, COLORS, pictures());
    fs.rmSync(res.ico);
    expect(readLogo(dir)).toBeNull();
    writeLogo(dir, COLORS, pictures());
    fs.writeFileSync(path.join(dir, 'logo.json'), JSON.stringify({ colors: COLORS, ico: '..\\..\\evil.ico' }));
    expect(readLogo(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'logo.json'), '{');
    expect(readLogo(dir)).toBeNull();
  });

  it('is gone, files and all, when the logo is Nebula’s own again', () => {
    writeLogo(dir, COLORS, pictures());
    clearLogo(dir);
    expect(fs.existsSync(dir)).toBe(false);
    expect(readLogo(dir)).toBeNull();
    clearLogo(dir);                       // nothing there: nothing to do
  });
});

describe('the shortcuts', () => {
  const EXE = 'C:\\Apps\\Nebula\\Nebula.exe';
  /** Shortcut files are empty here; what each "holds" is kept by the fake shell. */
  function desk(links) {
    const held = new Map();
    for (const [rel, link] of Object.entries(links)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, '');
      if (link) held.set(full, { ...link });
    }
    const shell = {
      readShortcutLink: (file) => { if (!held.has(file)) throw new Error('not a shortcut'); return { ...held.get(file) }; },
      writeShortcutLink: (file, how, options) => { if (how !== 'update') throw new Error(how); held.set(file, { ...held.get(file), ...options }); return true; },
    };
    return { held, shell };
  }
  const rel = (files) => files.map((f) => path.relative(dir, f).replace(/\\/g, '/')).sort();

  it('that start this copy of the app are pointed at the icon — on the desktop, in a folder of it, two deep', async () => {
    const { held, shell } = desk({
      'Nebula.lnk': { target: EXE },
      'Tools/Nebula again.lnk': { target: 'c:\\apps\\nebula\\NEBULA.EXE' },          // the same program, written another way
      'Tools/More/Deep.lnk': { target: EXE },
      'Tools/More/Too/Deep.lnk': { target: EXE },                                     // three folders down: not looked for
      'Other.lnk': { target: 'C:\\Apps\\Other\\Other.exe', icon: 'C:\\x.ico' },
      'Nebula Test.lnk': { target: 'C:\\Apps\\Nebula Test\\Nebula Test.exe' },         // another copy: not ours to touch
      'Broken.lnk': null,
      'notes.txt': null,
    });
    expect(rel(await listShortcuts([dir, '', path.join(dir, 'nowhere')]))).toEqual(['Broken.lnk', 'Nebula Test.lnk', 'Nebula.lnk', 'Other.lnk', 'Tools/More/Deep.lnk', 'Tools/Nebula again.lnk']);
    const icon = path.join(dir, 'logo', 'icon-0123456789ab.ico');
    const changed = await pointShortcuts({ dirs: [dir, ''], target: EXE, icon, shell });
    expect(rel(changed)).toEqual(['Nebula.lnk', 'Tools/More/Deep.lnk', 'Tools/Nebula again.lnk']);
    for (const file of changed) expect(held.get(file)).toMatchObject({ icon, iconIndex: 0 });
    expect(held.get(path.join(dir, 'Other.lnk'))).toEqual({ target: 'C:\\Apps\\Other\\Other.exe', icon: 'C:\\x.ico' });
    expect(held.get(path.join(dir, 'Nebula Test.lnk'))).toEqual({ target: 'C:\\Apps\\Nebula Test\\Nebula Test.exe' });
    expect(held.get(path.join(dir, 'Tools', 'More', 'Too', 'Deep.lnk'))).toEqual({ target: EXE });
  });

  it('that wear it already are left alone, and go back to the program’s own icon when asked', async () => {
    const { held, shell } = desk({ 'Nebula.lnk': { target: EXE } });
    const icon = path.join(dir, 'icon.ico');
    expect(await pointShortcuts({ dirs: [dir], target: EXE, icon, shell })).toHaveLength(1);
    expect(await pointShortcuts({ dirs: [dir], target: EXE, icon, shell })).toEqual([]);
    expect(await pointShortcuts({ dirs: [dir], target: EXE, icon: EXE, shell })).toHaveLength(1);
    expect(held.get(path.join(dir, 'Nebula.lnk'))).toMatchObject({ target: EXE, icon: EXE, iconIndex: 0 });
  });

  it('a folder that is not there, or a shell that fails, changes nothing and breaks nothing', async () => {
    const { shell } = desk({ 'Nebula.lnk': { target: EXE } });
    expect(await pointShortcuts({ dirs: [path.join(dir, 'nowhere')], target: EXE, icon: 'x.ico', shell })).toEqual([]);
    const failing = { readShortcutLink: shell.readShortcutLink, writeShortcutLink: () => { throw new Error('denied'); } };
    expect(await pointShortcuts({ dirs: [dir], target: EXE, icon: 'x.ico', shell: failing })).toEqual([]);
  });

  it('are read a few at a time, the process let go in between — it is the app’s own thread Windows asks for the window’s icon', async () => {
    const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`Menu/Program ${i}.lnk`, { target: i === 40 ? EXE : `C:\\P\\${i}.exe` }]));
    const { held, shell } = desk(many);
    let reads = 0;
    let longest = 0;
    let run = 0;
    const counting = { ...shell, readShortcutLink: (file) => { reads += 1; run += 1; longest = Math.max(longest, run); return shell.readShortcutLink(file); } };
    let breaths = 0;
    const changed = await pointShortcuts({ dirs: [dir], target: EXE, icon: 'C:\\new.ico', shell: counting, breathe: async () => { breaths += 1; run = 0; } });
    expect(reads).toBe(41);
    expect(longest).toBeLessThanOrEqual(2);                 // never more than two shortcuts read in one go
    expect(breaths).toBe(20);
    expect(changed).toHaveLength(1);
    expect(held.get(changed[0]).icon).toBe('C:\\new.ico');
  });

  it('give way to a newer logo: what is left is that one’s to do', async () => {
    const { held, shell } = desk(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`N${i}.lnk`, { target: EXE }])));
    let done = 0;
    const counting = { ...shell, writeShortcutLink: (...args) => { done += 1; return shell.writeShortcutLink(...args); } };
    const changed = await pointShortcuts({ dirs: [dir], target: EXE, icon: 'C:\\old.ico', shell: counting, stale: () => done >= 3 });
    expect(changed.length).toBeLessThan(10);
    expect(changed.length).toBeGreaterThanOrEqual(3);
    const newer = await pointShortcuts({ dirs: [dir], target: EXE, icon: 'C:\\new.ico', shell });
    expect(newer).toHaveLength(10);
    expect([...held.values()].every((l) => l.icon === 'C:\\new.ico')).toBe(true);
  });
});

describe('a shortcut made for the logo', () => {
  const EXE = 'C:\\Apps\\Nebula\\Nebula.exe';
  function shellOf(held = new Map()) {
    return {
      held,
      readShortcutLink: (file) => { if (!held.has(file)) throw new Error('not a shortcut'); return { ...held.get(file) }; },
      writeShortcutLink: (file, how, options) => { held.set(file, how === 'create' ? { ...options } : { ...held.get(file), ...options }); fs.writeFileSync(file, ''); return true; },
    };
  }

  it('is made on the desktop, starting this program and wearing the logo', () => {
    const shell = shellOf();
    const desktop = path.join(dir, 'Desktop');
    const res = makeShortcut({ dir: desktop, name: 'Nebula', target: EXE, icon: 'C:\\p\\logo\\icon-0123456789ab.ico', shell });
    expect(res).toEqual({ ok: true, made: true, file: path.join(desktop, 'Nebula.lnk') });
    expect(shell.held.get(res.file)).toEqual({ target: EXE, icon: 'C:\\p\\logo\\icon-0123456789ab.ico', iconIndex: 0, description: 'Nebula' });
  });

  it('that is there already is given the logo, not made twice — and another program’s of that name is left alone', () => {
    const shell = shellOf();
    makeShortcut({ dir, name: 'Nebula', target: EXE, icon: EXE, shell });
    const again = makeShortcut({ dir, name: 'Nebula', target: 'c:\\apps\\nebula\\nebula.exe', icon: 'C:\\new.ico', shell });
    expect(again).toMatchObject({ ok: true, made: false });
    expect(shell.held.get(again.file)).toMatchObject({ target: EXE, icon: 'C:\\new.ico' });
    shell.held.set(path.join(dir, 'Other.lnk'), { target: 'C:\\Other\\Other.exe' });
    fs.writeFileSync(path.join(dir, 'Other.lnk'), '');
    expect(makeShortcut({ dir, name: 'Other', target: EXE, icon: 'C:\\new.ico', shell })).toMatchObject({ ok: false, error: 'exists' });
    expect(shell.held.get(path.join(dir, 'Other.lnk'))).toEqual({ target: 'C:\\Other\\Other.exe' });
  });

  it('has a name a file may have, and is made nowhere without one', () => {
    const shell = shellOf();
    expect(path.basename(makeShortcut({ dir, name: 'Ne<bu>la: "Test"?', target: EXE, icon: EXE, shell }).file)).toBe('Ne bu la Test.lnk');
    expect(path.basename(makeShortcut({ dir, name: `${'N'.repeat(79)}🌙 app`, target: EXE, icon: EXE, shell }).file)).toBe(`${'N'.repeat(79)}🌙.lnk`); // hunt B24: never half an emoji
    expect(makeShortcut({ dir, name: '  ', target: EXE, icon: EXE, shell })).toEqual({ ok: false, error: 'where' });
    expect(makeShortcut({ dir: '', name: 'Nebula', target: EXE, icon: EXE, shell })).toEqual({ ok: false, error: 'where' });
    const failing = { readShortcutLink: shell.readShortcutLink, writeShortcutLink: () => { throw new Error('denied'); } };
    expect(makeShortcut({ dir: path.join(dir, 'x'), name: 'Nebula', target: EXE, icon: EXE, shell: failing })).toMatchObject({ ok: false, error: 'denied' });
  });
});

/**
 * The owner's Ideas note (0.9.5): "the logo — on the desktop it works; down on
 * the taskbar it does not". Windows draws a taskbar button from the Start-menu
 * shortcut that carries the window's app ID, and an installed copy cannot
 * always write that shortcut: a window wearing a logo takes an ID of its own.
 */
describe('the taskbar', () => {
  const EXE = 'C:\\Apps\\Nebula\\Nebula.exe';
  const ICO = (hash) => path.join('profile', 'logo', `icon-${hash}.ico`);

  it('a logo has an app ID of its own, and another logo another', () => {
    expect(logoAppId('com.nebula.app', ICO('0123456789ab'))).toBe('com.nebula.app.logo.0123456789ab');
    expect(logoAppId('com.nebula.app', ICO('ABCDEF012345'))).toBe('com.nebula.app.logo.abcdef012345');
    expect(logoAppId('com.nebula.app', ICO('0123456789ab'))).not.toBe(logoAppId('com.nebula.app', ICO('ba9876543210')));
    expect(logoAppId('com.nebula.app', EXE)).toBe('com.nebula.app');   // no logo file: the app's own
    expect(logoAppId('com.nebula.app', null)).toBe('com.nebula.app');
  });

  it('a window with a logo says which icon and which program stand for it; without one it is the app as it was', () => {
    const logo = { ico: ICO('0123456789ab') };
    expect(taskbarDetails({ base: 'com.nebula.app', logo, target: EXE, name: 'Nebula' })).toEqual({
      appId: 'com.nebula.app.logo.0123456789ab', appIconPath: logo.ico, appIconIndex: 0, relaunchCommand: `"${EXE}"`, relaunchDisplayName: 'Nebula',
    });
    expect(taskbarDetails({ base: 'com.nebula.app', logo: null, target: EXE, name: 'Nebula' })).toEqual({ appId: 'com.nebula.app' });
  });

  it('where the app is pinned the window keeps the pin\'s ID, so that it opens on the pin', () => {
    const logo = { ico: ICO('0123456789ab') };
    expect(taskbarDetails({ base: 'com.nebula.app', logo, pinned: 'com.nebula.app', target: EXE, name: 'Nebula' })).toEqual({ appId: 'com.nebula.app' });
    expect(taskbarDetails({ base: 'com.nebula.app', logo, pinned: '', target: EXE, name: 'Nebula' })).toEqual({ appId: 'com.nebula.app' });
    expect(taskbarDetails({ base: 'com.nebula.app', logo: null, pinned: 'com.nebula.app.logo.ba9876543210', target: EXE, name: 'Nebula' })).toEqual({ appId: 'com.nebula.app.logo.ba9876543210' });
  });

  it('the pin that starts this copy is found among the pins, and no other', () => {
    const held = new Map();
    const pin = (name, link) => { fs.writeFileSync(path.join(dir, name), ''); if (link) held.set(path.join(dir, name), link); };
    const shell = { readShortcutLink: (file) => { if (!held.has(file)) throw new Error('not a shortcut'); return held.get(file); } };
    expect(pinnedAppId({ dir: path.join(dir, 'nowhere'), target: EXE, shell })).toBeNull();
    pin('Browser.lnk', { target: 'C:\\Other\\Browser.exe', appUserModelId: 'browser' });
    pin('Broken.lnk', null);
    pin('notes.txt', { target: EXE, appUserModelId: 'not a shortcut' });
    expect(pinnedAppId({ dir, target: EXE, shell })).toBeNull();
    pin('Nebula.lnk', { target: EXE.toUpperCase(), appUserModelId: 'com.nebula.app' });
    expect(pinnedAppId({ dir, target: EXE, shell })).toBe('com.nebula.app');
    held.set(path.join(dir, 'Nebula.lnk'), { target: EXE });
    expect(pinnedAppId({ dir, target: EXE, shell })).toBe('');
  });
});
