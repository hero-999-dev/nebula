// @vitest-environment node
/**
 * "Open with Nebula" (0.9.4): which of a command line's arguments are files to
 * open, how one is read for the window, and what the installer is told. The
 * app opening one is in tests/e2e/open-with.mjs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesFromArgv, readNoteFile, DOCUMENT_EXTENSIONS, OPENABLE } from '../electron/open-file.js';
import { offerPlan, offerOpenWith } from '../electron/open-with.js';

const root = path.resolve(import.meta.dirname, '..');
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-open-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('the files among a command line’s arguments', () => {
  // Paths of the machine the tests run on. They were written "C:\Users\me\…", which is an absolute
  // path on Windows only: the release also builds on a Mac and the checks also run on Linux, and
  // there the same name is one file in the folder the tests run in — 0.9.4's first build stopped on it.
  const home = path.resolve(os.tmpdir(), 'me');
  const at = (...parts) => path.resolve(home, ...parts);
  const app = path.resolve(os.tmpdir(), 'Program Files', 'Nebula', 'Nebula.exe');

  it('the installed app: its own name, then the file', () => {
    expect(filesFromArgv([app, at('Report.docx')])).toEqual([at('Report.docx')]);
  });

  it('a development run: the app’s script is no document, and switches are not files', () => {
    expect(filesFromArgv(['electron.exe', 'dist-electron/main.js', '--remote-debugging-port=0', '--inspect', 'notes.md'], home))
      .toEqual([at('notes.md')]);
    expect(filesFromArgv(['electron.exe', '.', 'package.json'], home)).toEqual([]);
  });

  it('several files, each once, relative ones from where the second copy was started', () => {
    expect(filesFromArgv(['Nebula.exe', 'a.rtf', path.join('sub', 'b.ODT'), 'a.rtf'], home)).toEqual([at('a.rtf'), at('sub', 'b.ODT')]);
  });

  it('nothing for a kind of file Nebula does not read, or no arguments at all', () => {
    expect(filesFromArgv(['Nebula.exe', 'C:\\x\\scan.pdf', 'C:\\x\\photo.png', 'C:\\x\\setup.exe'])).toEqual([]);
    expect(filesFromArgv(['Nebula.exe'])).toEqual([]);
    expect(filesFromArgv(undefined)).toEqual([]);
  });

  it('the kinds it is offered for are ones it opens', () => {
    for (const ext of DOCUMENT_EXTENSIONS) expect(OPENABLE.test(`x.${ext}`)).toBe(true);
    expect(OPENABLE.test('x.pdf')).toBe(false);
  });
});

describe('a file read for the window', () => {
  it('words as text, a Word or OpenDocument file as its bytes', async () => {
    const md = path.join(dir, 'Plan.md');
    fs.writeFileSync(md, '# Plan\n\nwords');
    expect(await readNoteFile(md)).toEqual({ ok: true, name: 'Plan.md', text: '# Plan\n\nwords' });
    const docx = path.join(dir, 'Report.docx');
    fs.writeFileSync(docx, Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 3]));
    const res = await readNoteFile(docx);
    expect(res.ok).toBe(true);
    expect(res.name).toBe('Report.docx');
    expect([...res.bytes]).toEqual([0x50, 0x4b, 3, 4, 1, 2, 3]);
    expect(fs.readFileSync(docx).length).toBe(7);                // read, never written
  });

  it('a note file from a vault with its folder beside it brings its pictures', async () => {
    const b64 = Buffer.alloc(600, 5).toString('base64');
    fs.mkdirSync(path.join(dir, 'n1'));
    fs.writeFileSync(path.join(dir, 'n1', 'aaaaaaaaaaaaaaaaaaaaaaaa.png'), Buffer.alloc(600, 5));
    fs.writeFileSync(path.join(dir, 'n1.json'), JSON.stringify({ id: 'n1', content: '<img src="nebula-media://note/n1/aaaaaaaaaaaaaaaaaaaaaaaa.png">' }));
    const res = await readNoteFile(path.join(dir, 'n1.json'));
    expect(JSON.parse(res.text).content).toBe(`<img src="data:image/png;base64,${b64}">`);
  });

  it('says no to what is not there, is a folder, or is a kind it does not read', async () => {
    expect((await readNoteFile(path.join(dir, 'missing.docx'))).ok).toBe(false);
    fs.mkdirSync(path.join(dir, 'folder.rtf'));
    expect((await readNoteFile(path.join(dir, 'folder.rtf'))).ok).toBe(false);
    fs.writeFileSync(path.join(dir, 'scan.pdf'), 'x');
    expect(await readNoteFile(path.join(dir, 'scan.pdf'))).toMatchObject({ ok: false, name: 'scan.pdf' });
  });
});

describe('what the installers are told', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const nsh = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');

  it('Windows: Nebula is offered for each kind, with the violet icon, and never made the default', () => {
    expect(pkg.build.nsis.include).toBe('build/installer.nsh');
    expect(pkg.build.fileAssociations).toBeUndefined();           // that would take the files over
    expect(pkg.build.win.fileAssociations).toBeUndefined();
    expect(pkg.build.extraResources).toContainEqual({ from: 'build/doc.ico', to: 'doc.ico' });
    for (const ext of DOCUMENT_EXTENSIONS) {
      expect(nsh).toContain(`!insertmacro NebulaOffer ".${ext}"`);
      expect(nsh).toContain(`!insertmacro NebulaWithdraw ".${ext}"`);
    }
    expect(nsh).toContain('OpenWithProgids');
    expect(nsh).toContain('$INSTDIR\\resources\\doc.ico');
    expect(nsh).toContain('"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"');
    // Nothing writes a kind of file's own default: only its list of programs.
    expect(nsh).not.toMatch(/WriteRegStr SHCTX "Software\\Classes\\\$\{EXT\}" ""/);
    expect(/^[\x00-\x7f]*$/.test(nsh)).toBe(true);                // NSIS reads it as it is
  });

  it('macOS: the same kinds, as an alternate — in Open With, not the default', () => {
    const [docs] = pkg.build.mac.fileAssociations;
    expect(docs.ext).toEqual(DOCUMENT_EXTENSIONS);
    expect(docs.rank).toBe('Alternate');
    expect(docs.icon).toBe('build/doc.icns');
  });

  it('the icon exists in every form it is asked for', () => {
    const ico = fs.readFileSync(path.join(root, 'build', 'doc.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);                          // an icon
    expect(ico.readUInt16LE(4)).toBe(9);                          // nine sizes
    const icns = fs.readFileSync(path.join(root, 'build', 'doc.icns'));
    expect(icns.subarray(0, 4).toString('latin1')).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    expect(fs.existsSync(path.join(root, 'build', 'doc.png'))).toBe(true);
  });
});

/**
 * The owner, on the test build: "a right-click on a docx and the like — Open
 * with Nebula is not among the suggested ones; and let Nebula's description
 * be Nebula alone". A portable copy has no installer to say it for it.
 */
describe('a portable copy offers itself for documents', () => {
  const exe = 'C:\\Users\\me\\My Apps\\Nebula Test.exe';

  it('writes for this user what the installer writes, under names of its own', () => {
    const plan = offerPlan({ exe, name: 'Nebula Test' });
    expect(plan.every(([key]) => key.startsWith('HKCU\\Software\\Classes\\'))).toBe(true);
    const at = (key, value = '') => plan.find(([k, v]) => k === `HKCU\\Software\\Classes\\${key}` && v === value)?.[2];
    expect(at('Applications\\Nebula Test.exe', 'FriendlyAppName')).toBe('Nebula Test');
    expect(at('Applications\\Nebula Test.exe\\shell\\open\\command')).toBe(`"${exe}" "%1"`);
    expect(at('NebulaTestPortable.Document\\shell\\open\\command')).toBe(`"${exe}" "%1"`);
    for (const ext of DOCUMENT_EXTENSIONS) {
      expect(at(`Applications\\Nebula Test.exe\\SupportedTypes`, `.${ext}`), ext).toBe('');
      expect(at(`.${ext}\\OpenWithProgids`, 'NebulaTestPortable.Document'), ext).toBe('');
    }
    // Offered, never the default: nothing is written onto a kind of file itself, and nothing of the installed app's.
    expect(plan.some(([key, value]) => /\\\.[a-z]+$/.test(key) || (/\\\.[a-z]+\\/.test(key) && !/OpenWithProgids$/.test(key)) || value === 'Nebula.Document')).toBe(false);
    expect(plan.some(([key]) => /\\Nebula\.Document/.test(key))).toBe(false);
    expect(offerPlan({ exe: 'D:\\Nebula-portable-0.9.4.exe', name: 'Nebula' }).map(([key]) => key)).toContain('HKCU\\Software\\Classes\\NebulaPortable.Document');
    expect(plan[plan.length - 1][0]).toBe('HKCU\\Software\\Classes\\NebulaTestPortable.Document\\shell\\open\\command');
  });

  it('says it once: a start that finds it said for this place writes nothing; a copy that moved says it again', async () => {
    const store = new Map();
    const calls = [];
    const run = async (args) => {
      calls.push(args[0]);
      const value = args.includes('/ve') ? '' : args[args.indexOf('/v') + 1];
      const id = `${args[1]}|${value}`;
      if (args[0] === 'add') { store.set(id, args[args.indexOf('/d') + 1]); return { ok: true, out: '' }; }
      return store.has(id) ? { ok: true, out: `\r\n${args[1]}\r\n    ${value || '(Default)'}    REG_SZ    ${store.get(id)}\r\n\r\n` } : { ok: false, out: '' };
    };
    expect(await offerOpenWith({ exe, name: 'Nebula Test', run })).toBe('written');
    expect(calls.filter((c) => c === 'add').length).toBe(offerPlan({ exe, name: 'Nebula Test' }).length);
    calls.length = 0;
    expect(await offerOpenWith({ exe, name: 'Nebula Test', run })).toBe('there');
    expect(calls).toEqual(['query', 'query']);
    expect(await offerOpenWith({ exe: 'D:\\Nebula Test.exe', name: 'Nebula Test', run })).toBe('written');
    expect(store.get('HKCU\\Software\\Classes\\Applications\\Nebula Test.exe\\shell\\open\\command|')).toBe('"D:\\Nebula Test.exe" "%1"');
    // Windows listed the exe by itself once, without a name: that is not "said".
    store.delete('HKCU\\Software\\Classes\\Applications\\Nebula Test.exe|FriendlyAppName');
    expect(await offerOpenWith({ exe: 'D:\\Nebula Test.exe', name: 'Nebula Test', run })).toBe('written');
    expect(await offerOpenWith({ exe, name: 'Nebula Test', run: async () => ({ ok: false, out: '' }) })).toBe('failed');
    expect(await offerOpenWith({ exe, name: 'Nebula Test', run: async () => { throw new Error('no reg.exe'); } })).toBe('failed');
  });

  it('Windows names the app by its description: it is the app\'s name and nothing more', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const test = JSON.parse(fs.readFileSync(path.join(root, 'build-test.json'), 'utf8'));
    expect(pkg.description).toBe('Nebula');
    expect(pkg.build.productName).toBe('Nebula');
    expect(test.extraMetadata.description).toBe('Nebula Test');
    expect(pkg.tagline.length).toBeGreaterThan(40);          // what the site says under the name
  });
});
