/**
 * Word and OpenDocument (0.9.3) — the owner: "add odt, doc and docx to export
 * and import". A note goes out and comes back in each, and keeps its words,
 * headings, lists, emphasis, links, code and pictures.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readBlocks, toDocx, toOdt, toDoc, docxToHtml, odtToHtml, rtfToHtml, docKind, pictureOf } from '../src/js/office.js';

// A 2x1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwnwEIGAAZ+QL+qjv4HQAAAABJRU5ErkJggg==';
const NOTE = '<h1>Trip</h1><p>Plain <strong>bold</strong> <em>italic</em> <u>under</u> <s>gone</s> <a href="https://example.com">link</a> çğüşöı “quotes”</p>'
  + '<h2>List</h2><ul><li>one<ul><li>deeper</li></ul></li><li>two</li></ul><ol><li>first</li><li>second</li></ol>'
  + '<div class="blk-todo done">done task</div><blockquote><p>quoted</p></blockquote>'
  + `<div class="blk-code" data-code="${encodeURIComponent('let a = 1;\nlet b = 2;')}" data-lang="js"><pre>painted</pre></div><hr class="blk-hr">`
  + `<figure class="note-image note-image--inline" data-ratio="2" style="width: 200px;"><img src="${PNG}" alt="p"><figcaption>A caption</figcaption></figure>`
  + '<div class="shape-layer"><div class="shape">a shape</div></div>';
const A4 = { w: 210, h: 297, margin: 12.7 };

describe('reading a note', () => {
  it('as blocks of runs; shapes are left out', () => {
    const b = readBlocks(NOTE);
    expect(b.map((x) => x.type)).toEqual(['heading', 'para', 'heading', 'list', 'list', 'list', 'list', 'list', 'todo', 'para', 'code', 'hr', 'image']);
    expect(b[1].runs.find((r) => r.text === 'bold').b).toBe(true);
    expect(b[1].runs.find((r) => r.text === 'link').href).toBe('https://example.com');
    expect(b[4]).toMatchObject({ level: 1, runs: [{ text: 'deeper' }] });
    expect(b[10].text).toBe('let a = 1;\nlet b = 2;');
    expect(JSON.stringify(b)).not.toContain('a shape');
  });
  it('knows a picture by its bytes', () => {
    expect(pictureOf(PNG)).toMatchObject({ kind: 'png', w: 2, h: 1 });
    expect(pictureOf('https://example.com/x.png')).toBeNull();
  });
});

describe('.docx', () => {
  it('is a Word package on the note’s paper, and comes back in', async () => {
    const bytes = await toDocx(NOTE, 'Trip', A4);
    const zip = await JSZip.loadAsync(bytes);
    const doc = await zip.file('word/document.xml').async('string');
    expect(doc).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(doc).toContain('w:val="Heading2"');
    expect(Object.keys(zip.files)).toContain('word/media/image1.png');
    const html = await docxToHtml(bytes);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<h2>List</h2>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toMatch(/<ol><li>first<\/li><li>second<\/li><\/ol>/);
    expect(html).toContain('data:image/png;base64');
    expect(html).toContain('çğüşöı “quotes”');
  });
  it('turns Nebula Wide across', async () => {
    const zip = await JSZip.loadAsync(await toDocx('<p>x</p>', 'x', { w: 297, h: 210, margin: 12.7 }));
    expect(await zip.file('word/document.xml').async('string')).toContain('w:orient="landscape"');
  });
});

describe('.odt', () => {
  it('stores its mimetype first, and comes back in', async () => {
    const bytes = await toOdt(NOTE, 'Trip', A4);
    // An ODF reader looks for "mimetype" as the first, uncompressed entry.
    expect(new TextDecoder().decode(bytes.slice(30, 38))).toBe('mimetype');
    expect(new TextDecoder().decode(bytes.slice(38, 77))).toBe('application/vnd.oasis.opendocument.text');
    const html = await odtToHtml(bytes);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<h2>List</h2>');
    expect(html).toContain('<a href="https://example.com">');
    expect(html).toMatch(/<ol><li>first<\/li><li>second<\/li><\/ol>/);
    expect(html).toContain('<img src="data:image/png;base64');
    expect(html).toContain('let a = 1;');
  });
});

describe('.doc (Rich Text)', () => {
  it('is Rich Text Word opens, and comes back in', () => {
    const rtf = toDoc(NOTE, 'Trip', A4);
    expect(rtf.startsWith(String.raw`{\rtf1`)).toBe(true);
    expect(rtf).toContain(String.raw`\paperw11906\paperh16838`);
    expect(rtf).toContain(String.raw`\pngblip`);
    expect(docKind(new TextEncoder().encode(rtf))).toBe('rtf');
    const html = rtfToHtml(rtf);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('çğüşöı “quotes”');
    expect(html).toContain('<img src="data:image/png;base64,');
    expect(html).toContain('let a = 1;<br>let b = 2;');
  });
  it('tells a binary Word file and HTML apart', () => {
    expect(docKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toBe('binary');
    expect(docKind(new TextEncoder().encode('<html><body>x'))).toBe('html');
    expect(docKind(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('zip');
  });
});
