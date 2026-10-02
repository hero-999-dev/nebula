/**
 * Videos in an export (0.9.3) — the owner: "put the videos on the A4 the way
 * they show in Nebula; exports with or without video, without = only the
 * embed's link". And the Mac's own formats: Rich Text and Evernote's .enex.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { prepareVideos, hasVideos, getVideoMode, setVideoMode } from '../src/js/export-video.js';
import { readBlocks, toDocx, toOdt, toDoc, toEnex, enexToNotes, previewDocument, rtfToHtml } from '../src/js/office.js';
import { toHtml } from '../src/js/export.js';
import { videoOf, fetchVideoPoster } from '../electron/link-metadata.js';

const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const CARD = '<div class="link-block link-embed link-embed--video" style="width: 480px; --embed-h: 270px;"><a href="https://www.youtube.com/watch?v=abcDEF12345"><span class="link-card__title">My clip</span></a><webview src="https://www.youtube-nocookie.com/embed/abcDEF12345"></webview></div>';
const NOTE = `<p>Before</p>${CARD}<p>After</p>`;
const poster = async () => ({ ok: true, site: 'youtube', title: 'My clip', dataUrl: JPG });

describe('videos, with or without', () => {
  beforeEach(() => localStorage.clear());

  it('is remembered; with is the default', () => {
    expect(getVideoMode()).toBe('with');
    setVideoMode('without');
    expect(getVideoMode()).toBe('without');
    expect(hasVideos(NOTE)).toBe(true);
    expect(hasVideos('<p>x</p>')).toBe(false);
  });

  it('with: the video as a picture, linked, as wide as its card', async () => {
    const out = await prepareVideos(NOTE, 'with', { poster });
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const fig = doc.querySelector('figure.note-video');
    expect(fig.style.width).toBe('480px');
    expect(fig.dataset.video).toBe('https://www.youtube-nocookie.com/embed/abcDEF12345');
    expect(fig.querySelector('a[href="https://www.youtube.com/watch?v=abcDEF12345"] img').getAttribute('src')).toMatch(/^data:image\/jpeg/);
    expect(fig.querySelector('figcaption').textContent).toBe('▶ My clip');
    expect(doc.querySelector('webview')).toBeNull();
  });

  it('without: the embed as a bookmark, the way the note draws one', async () => {
    const out = await prepareVideos(NOTE, 'without', { poster });
    const card = new DOMParser().parseFromString(out, 'text/html').querySelector('.link-block.link-bookmark');
    expect(card.querySelector('a.link-card').getAttribute('href')).toBe('https://www.youtube.com/watch?v=abcDEF12345');
    expect(card.querySelector('.link-card__title').textContent).toBe('▶ My clip');
    expect(card.querySelector('.link-card__url').textContent).toBe('https://www.youtube.com/watch?v=abcDEF12345');
    expect(out).not.toContain('<img');
  });

  it('with, offline: the bookmark, never an empty frame', async () => {
    const out = await prepareVideos(NOTE, 'with', { poster: async () => ({ ok: false }) });
    expect(out).toContain('class="link-block link-bookmark"');
  });

  it('a bookmark goes into a document as its card: a box, the title over the address', async () => {
    const out = await prepareVideos(NOTE, 'without', { poster });
    expect(readBlocks(out).find((b) => b.type === 'bookmark')).toEqual({ type: 'bookmark', title: '▶ My clip', href: 'https://www.youtube.com/watch?v=abcDEF12345' });
    const xml = await (await JSZip.loadAsync(await toDocx(out, 'V', {}))).file('word/document.xml').async('string');
    expect(xml).toContain('<w:pBdr><w:top w:val="single"');
    expect(xml).toContain('▶ My clip');
    expect(await (await JSZip.loadAsync(await toOdt(out, 'V', {}))).file('content.xml').async('string')).toContain('text:style-name="Bookmark"');
    expect(toDoc(out, 'V', {})).toContain(String.raw`\box\brdrs`);
    expect(toEnex(out, 'V')).toContain('BOOKMARK');
    expect(toHtml(out, 'V')).toContain('.link-card {');
  });

  it('in Word the still links to the video and plays it; in OpenDocument and Rich Text it links', async () => {
    const html = await prepareVideos(NOTE, 'with', { poster });
    expect(readBlocks(html).find((b) => b.type === 'image')).toMatchObject({ href: 'https://www.youtube.com/watch?v=abcDEF12345', video: 'https://www.youtube-nocookie.com/embed/abcDEF12345' });
    const docx = await JSZip.loadAsync(await toDocx(html, 'V', {}));
    const xml = await docx.file('word/document.xml').async('string');
    expect(xml).toContain('<wp15:webVideoPr');
    expect(xml).toContain('a:hlinkClick');
    const odt = await JSZip.loadAsync(await toOdt(html, 'V', {}));
    expect(await odt.file('content.xml').async('string')).toContain('<draw:a xlink:type="simple" xlink:href="https://www.youtube.com/watch?v=abcDEF12345">');
    expect(toDoc(html, 'V', {})).toContain('HYPERLINK "https://www.youtube.com/watch?v=abcDEF12345"');
  });

  it('a web page keeps the real player', async () => {
    const html = await prepareVideos(NOTE, 'with', { poster });
    expect(toHtml(html, 'V')).toContain('<iframe src="https://www.youtube-nocookie.com/embed/abcDEF12345"');
  });
});

describe('the video’s still, fetched by the main process', () => {
  it('knows YouTube and Vimeo links, and nothing else', () => {
    expect(videoOf('https://youtu.be/abcDEF12345')).toMatchObject({ site: 'youtube', id: 'abcDEF12345' });
    expect(videoOf('https://vimeo.com/76979871')).toMatchObject({ site: 'vimeo', id: '76979871' });
    expect(videoOf('https://example.com/watch?v=abcDEF12345')).toBeNull();
  });

  it('takes the largest still that is real, and the title', async () => {
    const asked = [];
    const fetchImpl = async (url) => {
      asked.push(url);
      if (url.includes('oembed')) return new Response(JSON.stringify({ title: 'Hello' }), { headers: { 'content-type': 'application/json' } });
      if (url.includes('maxresdefault')) return new Response(new Uint8Array(1000), { headers: { 'content-type': 'image/jpeg' } });   // the grey stand-in
      return new Response(new Uint8Array(5000), { headers: { 'content-type': 'image/jpeg' } });
    };
    const got = await fetchVideoPoster('https://www.youtube.com/watch?v=abcDEF12345', { fetchImpl });
    expect(got).toMatchObject({ ok: true, site: 'youtube', title: 'Hello' });
    expect(got.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(asked.at(-1)).toBe('https://i.ytimg.com/vi/abcDEF12345/hqdefault.jpg');
    expect(await fetchVideoPoster('https://example.com/x')).toEqual({ ok: false });
  });
});

describe('a Mac’s own formats', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwnwEIGAAZ+QL+qjv4HQAAAABJRU5ErkJggg==';
  const BODY = `<p>Hi <strong>bold</strong> & <em>more</em></p><ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul><div class="blk-todo done">done</div><figure class="note-image"><img src="${PNG}"></figure>`;

  it('Evernote (.enex): out and back, pictures by their MD5, to-dos kept', () => {
    const enex = toEnex(BODY, 'Mac note');
    expect(enex).toContain('<!DOCTYPE en-export');
    expect(enex).toContain('<en-todo checked="true"/>');
    expect(enex).toMatch(/<en-media type="image\/png" hash="[0-9a-f]{32}"\/>/);
    const doc = new DOMParser().parseFromString(enex, 'application/xml');
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    const [note] = enexToNotes(enex);
    expect(note.title).toBe('Mac note');
    expect(note.html).toContain('<b>bold</b>');
    expect(note.html).toContain('<img src="data:image/png;base64,');
    expect(note.html).toContain('class="blk-todo done"');
    expect(note.html).toMatch(/<ul><li>a<ul><li>a1<\/li><\/ul><\/li><li>b<\/li><\/ul>/);
  });

  it('Rich Text (.rtf): what TextEdit, Pages and Notes open', () => {
    const rtf = toDoc(BODY, 'Mac note', {});
    expect(rtfToHtml(rtf)).toContain('<strong>bold</strong>');
  });

  it('the preview of a document is its blocks in its styles, on its paper', () => {
    const page = previewDocument(BODY, 'Mac note', { w: 148, h: 210, margin: 12.7 });
    expect(page).toContain('@page { size: 148mm 210mm; margin: 12.7mm; }');
    expect(page).toContain('<p class="title">Mac note</p>');
    expect(page).toContain('<b>bold</b>');
    expect(page).toContain('☑ done');
  });
});
