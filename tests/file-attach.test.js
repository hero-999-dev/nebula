/**
 * A file attached to a note (0.9.6), as OneNote keeps one: the card the note
 * shows it in, what the screen adds to it and never saves, how a drop is
 * taken, and what a file for another program holds in its place. The copying
 * into the note's folder is in tests/note-media.test.js, the sealing in a
 * black hole in tests/black-holes.test.js.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileExt, clipName, fileKind, fileSize, fileLabel, isAttachUrl, ownsAttachUrl, makeAttachBlock, refreshAttachBlocks, initAttachCards, dropKind, shownName } from '../src/js/file-attach.js';
import { fileVideoLines, plainVideosOf, sealedVideosOf } from '../src/js/file-video.js';
import { serializeNote } from '../src/js/note-markup.js';
import { heldMarkup } from '../src/js/held-media.js';
import { filterSlash } from '../src/js/slash-menu.js';

const URL = 'nebula-media://note/n-1_Ab/att-m1abc-0a1b2c3d.pdf';
const at = (ext) => `nebula-media://note/n1/att-m1abc-0a1b2c3d.${ext}`;
const HOLE_URL = 'nebula-media://hole/bh-1/n1/att-m1abc-0a1b2c3d.xlsx';

afterEach(() => { document.body.innerHTML = ''; delete window.nebula; });

describe('what a card says of its file', () => {
  it('its ending, small letters, from its own name only', () => {
    expect(fileExt('Report.PDF')).toBe('pdf');
    expect(fileExt('C:\\Users\\me\\archive.tar.gz')).toBe('gz');
    expect(fileExt('/home/me/notes.md')).toBe('md');
    expect(fileExt('.gitignore')).toBe('');             // a name that only starts with a dot has no ending
    expect(fileExt('README')).toBe('');
    expect(fileExt('trailing.')).toBe('');
    expect(fileExt('odd.p d f')).toBe('');
    expect(fileExt(null)).toBe('');
  });

  it('a long name is cut by characters: never half an emoji, and the ending stays (hunt B24)', () => {
    expect(clipName(`${'x'.repeat(39)}🌙 name`, 40)).toBe(`${'x'.repeat(39)}🌙`);
    expect(clipName(`${'x'.repeat(35)}🌙 report.pdf`, 40)).toBe(`${'x'.repeat(35)}🌙.pdf`);
  });

  it('its kind, which colours the logo: pdf, doc, sheet, … and `file` for the rest', () => {
    expect(fileKind('a.pdf')).toBe('pdf');
    expect(fileKind('a.docx')).toBe('doc');
    expect(fileKind('a.xlsx')).toBe('sheet');
    expect(fileKind('a.csv')).toBe('sheet');
    expect(fileKind('a.pptx')).toBe('slides');
    expect(fileKind('a.zip')).toBe('archive');
    expect(fileKind('a.png')).toBe('image');
    expect(fileKind('a.mp3')).toBe('audio');
    expect(fileKind('a.mkv')).toBe('video');
    expect(fileKind('a.txt')).toBe('text');
    expect(fileKind('a.py')).toBe('code');
    expect(fileKind('a.exe')).toBe('app');
    expect(fileKind('a.epub')).toBe('book');
    expect(fileKind('a.xyz')).toBe('file');
    expect(fileKind('README')).toBe('file');
  });

  it('its size as people read it, and both on the line under its name', () => {
    expect(fileSize(0)).toBe('0 B');
    expect(fileSize(820)).toBe('820 B');
    expect(fileSize(1024)).toBe('1 KB');
    expect(fileSize(14 * 1024 + 300)).toBe('14 KB');
    expect(fileSize(1.25 * 1024 * 1024)).toBe('1.3 MB');
    expect(fileSize(3.4 * 1024 ** 3)).toBe('3.4 GB');
    expect(fileSize(-1)).toBe('');
    expect(fileSize('x')).toBe('');
    expect(fileLabel('report.pdf', 1.2 * 1024 * 1024)).toBe('PDF · 1.2 MB');
    expect(fileLabel('README', undefined)).toBe('FILE');
  });

  it('an address only ever a note’s own attached file — in its folder or sealed in a black hole', () => {
    expect(isAttachUrl(URL)).toBe(true);
    expect(isAttachUrl(HOLE_URL)).toBe(true);
    expect(isAttachUrl('nebula-media://note/n1/vid-m1abc-0a1b2c3d.mp4')).toBe(false);   // a video is not an attached file
    expect(isAttachUrl('nebula-media://note/n1/../att-m1abc-0a1b2c3d.pdf')).toBe(false);
    expect(isAttachUrl('file:///C:/secret.pdf')).toBe(false);
    expect(isAttachUrl('https://example.com/att-m1abc-0a1b2c3d.pdf')).toBe(false);
  });
});

describe('the card', () => {
  it('is a card like a link’s: the logo of its kind, its name, its size, and an ×', () => {
    const card = makeAttachBlock(URL, 'Quarterly report.pdf', 1234567);
    expect(card.matches('div.link-block.link-attach[contenteditable="false"][data-block-type="link"][data-kind="attach"]')).toBe(true);
    expect(card.dataset.name).toBe('Quarterly report.pdf');
    expect(card.dataset.size).toBe('1234567');
    expect(card.dataset.src).toBe(URL);
    expect(card.querySelector('.attach-icon').dataset.type).toBe('pdf');
    expect(card.querySelector('.attach-icon__ext').textContent).toBe('PDF');
    expect(card.querySelector('.link-card__kind').textContent).toBe('PDF · 1.2 MB');
    expect(card.querySelector('.link-card__title').textContent).toBe('Quarterly report.pdf');
    expect(card.querySelector('.link-card').hasAttribute('href')).toBe(false);   // nothing to follow out of the app
    expect(card.querySelector('[data-link-remove]')).not.toBeNull();
  });

  it('keeps no address that is not a note’s attached file, and a name that is markup stays words', () => {
    const card = makeAttachBlock('javascript:alert(1)', '<img src=x onerror=alert(1)>.pdf');
    expect(card.dataset.src).toBe('');
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('.link-card__title').textContent).toBe('<img src=x onerror=alert(1)>.pdf');
    expect(makeAttachBlock(URL, 'x'.repeat(500) + '.pdf').dataset.name.length).toBe(200);
    expect(makeAttachBlock(URL, '').dataset.name).toBe('file');
  });

  it('a long name is cut by its stem: the ending, and so the kind, stays (hunt B2)', () => {
    const card = makeAttachBlock(URL, 'x'.repeat(250) + '.Docx', 9);
    expect(card.dataset.name).toHaveLength(200);
    expect(card.dataset.name.endsWith('.Docx')).toBe(true);
    expect(card.querySelector('.attach-icon__ext').textContent).toBe('DOCX');
    expect(card.querySelector('.attach-icon').dataset.type).toBe(fileKind('a.docx'));
    expect(makeAttachBlock(URL, 'y'.repeat(300)).dataset.name).toBe('y'.repeat(200));
  });

  it('is given Open and Save a copy on the screen, once — and they are never saved with the note', () => {
    const editor = document.createElement('div');
    editor.append(makeAttachBlock(URL, 'a.pdf', 10));
    refreshAttachBlocks(editor);
    refreshAttachBlocks(editor);
    const bars = editor.querySelectorAll('.attach-bar');
    expect(bars).toHaveLength(1);
    expect([...bars[0].querySelectorAll('[data-attach]')].map((b) => b.dataset.attach)).toEqual(['open', 'save']);
    expect(bars[0].nextElementSibling.matches('.link-del')).toBe(true);
    const saved = serializeNote(editor);
    expect(saved).not.toContain('attach-bar');
    expect(saved).toContain('link-attach');
    expect(saved).toContain(URL);
    // An address bent in the note's file is not followed.
    editor.querySelector('.link-attach').dataset.src = 'file:///C:/Windows/win.ini';
    refreshAttachBlocks(editor);
    expect(editor.querySelector('.link-attach').dataset.src).toBe('');
  });

  it('shows the stored file’s ending, whatever the name it came with claims (hunt B13)', () => {
    expect(shownName('invoice.pdf', at('exe'))).toBe('invoice.pdf.exe');
    expect(shownName('Report.PDF', at('pdf'))).toBe('Report.PDF');
    expect(shownName('run.bat. . ', at('txt'))).toBe('run.bat.txt');
    expect(shownName('run.bat', at('bin'))).toBe('run.bat.bin');
    for (const name of ['Makefile', 'main.c', 'data.parquet', 'setup.application', '.env', '.vimrc']) expect(shownName(name, at('bin'))).toBe(name);
    expect(shownName('a.pdf', 'file:///x.exe')).toBe('a.pdf');   // no stored file: nothing to say
  });

  it('a face that says another file than it holds is drawn again — a true one is left alone (hunt B13)', () => {
    const editor = document.createElement('div');
    const forged = makeAttachBlock(at('exe'), 'invoice.pdf', 48213);
    const pdfFace = makeAttachBlock(URL, 'invoice.pdf', 48213);
    forged.querySelector('.attach-icon').replaceWith(pdfFace.querySelector('.attach-icon'));
    forged.querySelector('.link-card').replaceWith(pdfFace.querySelector('.link-card'));
    forged.querySelector('.link-card').setAttribute('href', 'https://example.com');
    const bare = makeAttachBlock(at('txt'), 'readme.bat', 12);
    bare.querySelector('.attach-icon').remove();
    bare.querySelector('.link-card').remove();
    // A true card, through a save and a load, as a note keeps it.
    const kept = document.createElement('div');
    kept.append(makeAttachBlock(URL, 'Quarterly report.pdf', 1234567));
    editor.innerHTML = serializeNote(kept);
    const trueIcon = editor.querySelector('.attach-icon');
    const trueLabel = editor.querySelector('.link-card');
    editor.append(forged, bare);
    refreshAttachBlocks(editor);
    expect(editor.querySelector('.attach-icon')).toBe(trueIcon);
    expect(editor.querySelector('.link-card')).toBe(trueLabel);
    expect(forged.querySelector('.attach-icon__ext').textContent).toBe('EXE');
    expect(forged.querySelector('.attach-icon').dataset.type).toBe('app');
    expect(forged.querySelector('.link-card__title').textContent).toBe('invoice.pdf.exe');
    expect(forged.querySelector('.link-card__kind').textContent).toBe('EXE · 47 KB');
    expect(forged.querySelector('.link-card').hasAttribute('href')).toBe(false);
    expect(forged.dataset.name).toBe('invoice.pdf');
    expect([...bare.children].map((c) => c.className)).toEqual(['attach-icon', 'link-card', 'attach-bar', 'link-del']);
    expect(bare.querySelector('.link-card__title').textContent).toBe('readme.bat.txt');
    refreshAttachBlocks(editor);
    expect(editor.querySelectorAll('.attach-icon, .link-card')).toHaveLength(6);
  });

  it('a click on it saves a copy; Open hands a copy to the file’s own program; a locked black hole is said', async () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    editor.append(makeAttachBlock(URL, 'a.pdf', 10));
    refreshAttachBlocks(editor);
    const saveFile = vi.fn(async () => ({ ok: true }));
    const openFile = vi.fn(async () => ({ ok: false, error: 'locked' }));
    window.nebula = { media: { saveFile, openFile } };
    const said = [];
    initAttachCards(editor, { say: (text) => said.push(text) });
    editor.querySelector('.link-card__title').click();
    await vi.waitFor(() => expect(said).toEqual(['Saved a copy of the file']));
    expect(saveFile).toHaveBeenCalledWith(URL, 'a.pdf');
    editor.querySelector('[data-attach="open"]').click();
    await vi.waitFor(() => expect(said).toHaveLength(2));
    expect(openFile).toHaveBeenCalledWith(URL, 'a.pdf');
    expect(said[1]).toBe('Open the black hole first');
    // The × removes the card as for any card: it does not save a copy.
    editor.querySelector('[data-link-remove]').click();
    expect(saveFile).toHaveBeenCalledTimes(1);
  });

  it('a save the person cancels says nothing; a card with no file says so', async () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    editor.append(makeAttachBlock(URL, 'a.pdf'), makeAttachBlock('', 'b.pdf'));
    window.nebula = { media: { saveFile: async () => ({ ok: false, canceled: true }), openFile: async () => ({ ok: true }) } };
    const said = [];
    initAttachCards(editor, { say: (text) => said.push(text) });
    editor.querySelectorAll('.attach-icon')[0].click();
    await new Promise((r) => setTimeout(r, 0));
    expect(said).toEqual([]);
    editor.querySelectorAll('.attach-icon')[1].click();
    expect(said).toEqual(['The file is not in this note']);
  });
});

describe('a note opens only its own files', () => {
  it('the address must name the open note, and its black hole or none', () => {
    expect(ownsAttachUrl(URL, { id: 'n-1_Ab', hole: null })).toBe(true);
    expect(ownsAttachUrl(URL, { id: 'n-2', hole: null })).toBe(false);
    expect(ownsAttachUrl(URL, { id: 'n-1_Ab', hole: 'bh-1' })).toBe(false);
    expect(ownsAttachUrl(HOLE_URL, { id: 'n1', hole: 'bh-1' })).toBe(true);
    expect(ownsAttachUrl(HOLE_URL, { id: 'n1', hole: 'bh-2' })).toBe(false);
    expect(ownsAttachUrl(HOLE_URL, { id: 'n1', hole: null })).toBe(false);
    expect(ownsAttachUrl(URL, null)).toBe(false);
    expect(ownsAttachUrl('nebula-media://note/n-1_Ab/../x.pdf', { id: 'n-1_Ab' })).toBe(false);
  });

  it('a card pasted from another note is neither saved nor opened', async () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    editor.append(makeAttachBlock(URL, 'theirs.pdf'));
    refreshAttachBlocks(editor);
    const saveFile = vi.fn(async () => ({ ok: true }));
    const openFile = vi.fn(async () => ({ ok: true }));
    window.nebula = { media: { saveFile, openFile } };
    const said = [];
    initAttachCards(editor, { say: (text) => said.push(text), owner: () => ({ id: 'n-2', hole: null }) });
    // One click at a time: while the first is being refused the card is busy (B4).
    editor.querySelector('.link-card__title').click();
    await new Promise((r) => setTimeout(r, 0));
    editor.querySelector('[data-attach="open"]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(saveFile).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
    expect(said).toEqual(['The file is not in this note', 'The file is not in this note']);
  });

  it('a card naming another note is adopted into this note at the click, and only then opened', async () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    editor.append(makeAttachBlock(URL, 'theirs.pdf'));
    refreshAttachBlocks(editor);
    const OWN = 'nebula-media://note/n-2/att-m1abc2d-0a1b2c3d.pdf';
    const saveFile = vi.fn(async () => ({ ok: true }));
    const openFile = vi.fn(async () => ({ ok: true }));
    const adoptFile = vi.fn(async () => ({ ok: true, url: OWN }));
    window.nebula = { media: { saveFile, openFile, adoptFile } };
    const said = [];
    initAttachCards(editor, { say: (text) => said.push(text), owner: () => ({ id: 'n-2', hole: null }) });
    editor.querySelector('.link-card__title').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(adoptFile).toHaveBeenCalledWith('n-2', null, URL);
    expect(saveFile).toHaveBeenCalledWith(OWN, 'theirs.pdf');
    expect(editor.querySelector('.link-attach').dataset.src).toBe(OWN);
  });
});

describe('a drop', () => {
  const kinds = { isImage: (f) => f.type.startsWith('image/'), isVideo: (f) => /\.mp4$/.test(f.name) };
  it('of pictures, or with a video, goes in as before; anything else among them, and every file becomes a card', () => {
    expect(dropKind([{ name: 'a.png', type: 'image/png' }], kinds)).toBe('image');
    expect(dropKind([{ name: 'a.mp4', type: 'video/mp4' }, { name: 'b.png', type: 'image/png' }], kinds)).toBe('video');
    expect(dropKind([{ name: 'a.pdf', type: 'application/pdf' }], kinds)).toBe('attach');
    expect(dropKind([{ name: 'a.png', type: 'image/png' }, { name: 'b.zip', type: '' }], kinds)).toBe('attach');
    expect(dropKind([], kinds)).toBeNull();
    expect(dropKind(null, kinds)).toBeNull();
  });

  it('/file is in the slash menu, and /video still finds only the video', () => {
    expect(filterSlash('file').map((i) => i.id)).toEqual(['file']);
    expect(filterSlash('video').map((i) => i.id)).toEqual(['video']);
  });
});

describe('where the note goes on', () => {
  it('a file for another program holds a line with the file’s name', () => {
    const doc = new DOMParser().parseFromString('<p>before</p>', 'text/html');
    doc.body.append(makeAttachBlock(URL, 'Quarterly report.pdf', 10, doc));
    fileVideoLines(doc);
    expect(doc.body.innerHTML).toBe('<p>before</p><p>📎 Quarterly report.pdf</p>');
  });

  it('its file is carried with the note — into a black hole and out of one, as a video is', () => {
    const html = `<div class="link-attach" data-src="${URL}"></div><div data-src="${HOLE_URL}"></div>`;
    expect(plainVideosOf(html).map((v) => v[2])).toEqual(['att-m1abc-0a1b2c3d.pdf']);
    expect(sealedVideosOf(html).map((v) => v[3])).toEqual(['att-m1abc-0a1b2c3d.xlsx']);
  });

  it('a note held for its lost files gets its attached files back as cards — one ending like a picture too', async () => {
    const out = await heldMarkup('n1', ['att-m1abc-0a1b2c3d.png', 'att-m1abc-0a1b2c3e.pdf'], async () => ({ width: 10, height: 10 }));
    const box = document.createElement('div');
    box.innerHTML = out;
    expect([...box.querySelectorAll('.link-attach')].map((c) => c.dataset.src)).toEqual([
      'nebula-media://note/n1/att-m1abc-0a1b2c3d.png', 'nebula-media://note/n1/att-m1abc-0a1b2c3e.pdf',
    ]);
    expect(box.querySelector('img')).toBeNull();
  });
});
