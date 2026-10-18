/**
 * The copies Open makes of attached files (0.9.6): where each lies, and that
 * each goes with what it was made from — its note, its black hole when that
 * is locked or deleted, its card when that is taken out. GPT's review found a
 * locked or deleted black hole left its opened files in the clear.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attachedOf, attachedName, openedFolder, openedPath, runsCode, clearOpened, clearOpenedAsync } from '../electron/opened-files.js';
import { shredTree } from '../electron/backup-purge.js';

// The real shredder, watched: a copy is overwritten before it goes, not just unlinked.
vi.mock('../electron/backup-purge.js', async (real) => { const m = await real(); return { ...m, shredTree: vi.fn(m.shredTree) }; });

const ATT = 'att-m1abc-0a1b2c3d.pdf';
const PLAIN = `nebula-media://note/n1/${ATT}`;
const SEALED = `nebula-media://hole/bh-1/n2/${ATT}`;

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-opened-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

/** Open, as main.js does it: a copy at openedPath. */
const open = (url, name = 'Report.pdf') => {
  const dest = openedPath(root, url, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, 'plain');
  return dest;
};

describe('what an attached file’s address names', () => {
  it('its note, its black hole if any, and its stored name', () => {
    expect(attachedOf(PLAIN)).toEqual({ holeId: null, noteId: 'n1', file: ATT });
    expect(attachedOf(SEALED)).toEqual({ holeId: 'bh-1', noteId: 'n2', file: ATT });
  });

  it('nothing for any other address: a picture, a video, a path, a climb out', () => {
    for (const url of [
      'nebula-media://note/n1/vid-m1abc-0a1b2c3d.mp4',
      'nebula-media://note/n1/0123456789abcdef01234567.png',
      'nebula-media://note/../att-m1abc-0a1b2c3d.pdf',
      'nebula-media://note/n1/../../att-m1abc-0a1b2c3d.pdf',
      'nebula-media://hole/bh-1/att-m1abc-0a1b2c3d.pdf',
      'file:///C:/Windows/win.ini',
      '', null, undefined,
    ]) expect(attachedOf(url)).toBeNull();
  });

  it('a name it came with is made a safe file name; with none, the stored one', () => {
    expect(attachedName('a/b\\c:d*e?f"g<h>i|j.pdf', ATT)).toBe('a_b_c_d_e_f_g_h_i_j.pdf');
    expect(attachedName('..', ATT)).toBe(ATT);
    expect(attachedName('  .hidden.  ', ATT)).toBe('hidden.pdf');
    expect(attachedName('', ATT)).toBe(ATT);
    expect(attachedName('x'.repeat(400), ATT)).toHaveLength(150);
    // Cut by the stem (hunt B2): without its ending a copy opens with nothing.
    expect(attachedName('x'.repeat(400) + '.docx', 'att-m1abc-0a1b2c3d.docx')).toBe('x'.repeat(145) + '.docx');
    expect(attachedName('a'.repeat(160) + ' .pdf', ATT)).toMatch(/^a+.pdf$/);
  });

  it('always ends in the stored ending: the name is note text and may claim any (hunt B12)', () => {
    const TXT = 'att-m1abc-0a1b2c3d.txt';
    expect(attachedName('readme.bat', TXT)).toBe('readme.bat.txt');
    expect(attachedName('readme.txt.exe', TXT)).toBe('readme.txt.exe.txt');
    expect(attachedName('Notes.TXT', TXT)).toBe('Notes.txt');
    expect(attachedName('Report', ATT)).toBe('Report.pdf');
    // Trailing dots and spaces Windows drops cannot smuggle an ending past it.
    expect(attachedName('run.bat. . ', TXT)).toBe('run.bat.txt');
    // A stored .bin is a file whose ending is not a plain one: a plain one over it is forged.
    const BIN = 'att-m1abc-0a1b2c3d.bin';
    expect(attachedName('run.bat', BIN)).toBe('run.bat.bin');
    expect(attachedName('Run.EXE', BIN)).toBe('Run.EXE.bin');
    // …and a real one keeps its name, so its program still opens it.
    expect(attachedName('Makefile', BIN)).toBe('Makefile');
    expect(attachedName('main.c', BIN)).toBe('main.c');
    expect(attachedName('data.parquet', BIN)).toBe('data.parquet');
    expect(attachedName('setup.application', BIN)).toBe('setup.application');
    // Dotfiles have no extension (they are stored as .bin), and Open/Save
    // should use the same visible name the card shows (hunt C16).
    expect(attachedName('.env', BIN)).toBe('.env');
    expect(attachedName('.vimrc', BIN)).toBe('.vimrc');
    expect(attachedName('..env', BIN)).toBe('env');
    expect(attachedName('.CON', BIN)).toBe('_.CON.bin');
    expect(attachedName('.txt', TXT)).toBe('txt.txt');
    // A device name is never a file on Windows.
    expect(attachedName('CON', TXT)).toBe('_CON.txt');
    expect(attachedName('nul.txt', TXT)).toBe('_nul.txt');
    expect(attachedName('com1.notes', TXT)).toBe('_com1.notes.txt');
    expect(attachedName('console', TXT)).toBe('console.txt');
    expect(openedPath(root, `nebula-media://note/n1/${TXT}`, 'run.bat')).toBe(path.join(root, 'note', 'n1', 'att-m1abc-0a1b2c3d', 'run.bat.txt'));
  });

  it('a program, a script, a shortcut is told by its stored ending (hunt B12)', () => {
    for (const ext of ['exe', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'hta', 'msi', 'lnk', 'url', 'reg', 'jar', 'scr', 'com', 'py', 'sh', 'tool', 'pkg', 'docm', 'xlsm', 'pptm', 'xlam']) {
      expect(runsCode(`att-m1abc-0a1b2c3d.${ext}`), ext).toBe(true);
    }
    for (const ext of ['pdf', 'txt', 'docx', 'xlsx', 'png', 'zip', 'mp3', 'bin', 'csv', 'json', 'html']) {
      expect(runsCode(`att-m1abc-0a1b2c3d.${ext}`), ext).toBe(false);
    }
    expect(runsCode('')).toBe(false);
    expect(runsCode(null)).toBe(false);
    // A .bin by the ending its copy opens under: one too long to be stored as itself.
    const BIN = 'att-m1abc-0a1b2c3d.bin';
    for (const name of ['setup.application', 'App.appref-ms', 'go.command', 'tool.AppImage', 'x.settingcontent-ms']) expect(runsCode(BIN, name), name).toBe(true);
    // A real dotfile keeps its leading dot; if its whole name looks like a
    // runnable ending, the same warning must guard it (hunt B15).
    for (const name of ['.bat', '.exe', '.ps1']) expect(runsCode(BIN, name), name).toBe(true);
    // A forged plain ending opens as .bin and runs nothing; a real long one that runs nothing is not asked.
    for (const name of ['run.bat', 'main.c', 'data.parquet', 'Makefile', '']) expect(runsCode(BIN, name), name).toBe(false);
  });
});

describe('where Open puts a copy', () => {
  it('in a folder per file, under the notes folder’s note or the black hole’s', () => {
    expect(openedFolder(root, PLAIN)).toBe(path.join(root, 'note', 'n1', 'att-m1abc-0a1b2c3d'));
    expect(openedFolder(root, SEALED)).toBe(path.join(root, 'hole', 'bh-1', 'n2', 'att-m1abc-0a1b2c3d'));
    expect(openedPath(root, PLAIN, 'Q3.pdf')).toBe(path.join(root, 'note', 'n1', 'att-m1abc-0a1b2c3d', 'Q3.pdf'));
    expect(openedPath(root, 'nebula-media://note/n1/../x', 'Q3.pdf')).toBeNull();
  });

  it('never outside its root, whatever the name it came with', () => {
    for (const name of ['../../evil.exe', '..\\..\\evil.exe', 'C:\\Windows\\evil.exe', '/etc/passwd']) {
      const dest = openedPath(root, PLAIN, name);
      expect(path.relative(openedFolder(root, PLAIN), dest)).not.toMatch(/^\.\.|[\\/]/);
    }
  });
});

describe('each copy goes with what it was made from', () => {
  let plain, sealed, otherHole, otherNote;
  beforeEach(() => {
    plain = open(PLAIN);
    sealed = open(SEALED);
    otherHole = open(`nebula-media://hole/bh-2/n3/${ATT}`);
    otherNote = open(`nebula-media://hole/bh-1/n9/${ATT}`);
  });

  it('a black hole locked or deleted: every copy from it, and only from it', () => {
    expect(clearOpened(root, { holeId: 'bh-1' })).toBe(2);
    expect([fs.existsSync(sealed), fs.existsSync(otherNote)]).toEqual([false, false]);
    expect([fs.existsSync(plain), fs.existsSync(otherHole)]).toEqual([true, true]);
  });

  it('every black hole locked: every copy from any, none from the notes folder', () => {
    expect(clearOpened(root, { holes: true })).toBe(3);
    expect(fs.existsSync(plain)).toBe(true);
    expect(fs.existsSync(path.join(root, 'hole'))).toBe(false);
  });

  it('a note taken out of a black hole: that note’s copies there', () => {
    expect(clearOpened(root, { holeId: 'bh-1', noteId: 'n2' })).toBe(1);
    expect([fs.existsSync(sealed), fs.existsSync(otherNote)]).toEqual([false, true]);
  });

  it('a note deleted: its copies in the notes folder', () => {
    expect(clearOpened(root, { noteId: 'n1' })).toBe(1);
    expect(fs.existsSync(plain)).toBe(false);
    expect(fs.existsSync(sealed)).toBe(true);
  });

  it('asynchronously clears a large opened copy for a deleted note while preserving others', async () => {
    fs.writeFileSync(plain, Buffer.alloc(16 * 1024 * 1024, 0x71));
    expect(await clearOpenedAsync(root, { noteId: 'n1' })).toBe(1);
    expect(fs.existsSync(plain)).toBe(false);
    expect(fs.existsSync(sealed)).toBe(true);
  });

  it('unlinks a junction in the opened-copy tree without touching its target', async () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    const sentinel = path.join(outside, 'keep.pdf');
    fs.writeFileSync(sentinel, 'external copy');
    const link = path.join(root, 'note', 'n1');
    fs.rmSync(link, { recursive: true, force: true });
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await clearOpenedAsync(root, { noteId: 'n1' })).toBe(1);
    expect(fs.existsSync(link)).toBe(false);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('external copy');
    expect(fs.existsSync(sealed)).toBe(true);
  });

  it('a card taken out: that one file’s copies', () => {
    const second = open(`nebula-media://note/n1/att-m1abc-0a1b2c3e.pdf`);
    expect(clearOpened(root, { url: PLAIN })).toBe(1);
    expect([fs.existsSync(plain), fs.existsSync(second)]).toEqual([false, true]);
  });

  it('the start and the quit: all of them', () => {
    expect(clearOpened(root)).toBe(4);
    expect(fs.existsSync(root)).toBe(false);
  });

  it('shreds, never only deletes: every clear goes through shredTree (deleted is deleted)', () => {
    shredTree.mockClear();
    clearOpened(root, { noteId: 'n1' });
    clearOpened(root, { holeId: 'bh-1' });
    clearOpened(root);
    expect(shredTree.mock.calls.map(([dir]) => path.relative(root, dir))).toEqual([path.join('note', 'n1'), path.join('hole', 'bh-1'), '']);
  });

  it('a scope that names no place clears nothing — never the whole folder', () => {
    for (const scope of [{ noteId: '..' }, { holeId: '../x' }, { holeId: 'bh-1', noteId: 'a/b' }, { url: 'file:///x' }, { noteId: '' }]) {
      expect(clearOpened(root, scope)).toBe(0);
    }
    expect([plain, sealed, otherHole, otherNote].every((f) => fs.existsSync(f))).toBe(true);
  });
});
