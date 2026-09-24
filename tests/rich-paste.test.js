import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizeUrl, isImageMime, linkLabel, initRichPaste } from '../src/js/rich-paste.js';
import { initHistory } from '../src/js/history.js';
import { sanitize, fromMarkdown } from '../src/js/import.js';
import { toHtml, toMarkdown } from '../src/js/export.js';

describe('rich paste helpers', () => {
  it('normalizes only web URLs', () => {
    expect(normalizeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeUrl('www.example.com')).toBe('https://www.example.com/');
    expect(normalizeUrl('ftp://example.com')).toBe('');
    expect(normalizeUrl('javascript:alert(1)')).toBe('');
    expect(normalizeUrl('')).toBe('');
  });

  it('recognizes clipboard image types but not arbitrary files', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('image/jpeg')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
    expect(isImageMime('')).toBe(false);
  });

  it('makes compact labels for bookmark cards', () => {
    expect(linkLabel('https://example.com/docs?page=2')).toBe('example.com/docs?page=2');
    expect(linkLabel('not a url')).toBe('');
  });
});

describe('rich paste editing regressions', () => {
  let editor, rich, history;
  const select = (node, start = 0, end = start) => {
    const range = document.createRange();
    range.setStart(node, start); range.setEnd(node, end);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
  };
  const insert = (kind, url = 'https://example.com/docs') => {
    rich.open(kind, url);
    document.querySelector(`[data-link-kind="${kind}"]`).click();
  };
  beforeEach(() => {
    document.body.innerHTML = '<div id="editor" contenteditable="true"><p>before selected after</p></div>';
    editor = document.getElementById('editor');
    vi.stubGlobal('requestAnimationFrame', () => 0);
    Range.prototype.getBoundingClientRect = () => ({ left: 20, bottom: 30, width: 1, height: 20 });
    history = initHistory(editor, { onRestore: () => { rich.reset(); rich.refresh(); } });
    rich = initRichPaste(editor, { history });
    select(editor.querySelector('p').firstChild, 7, 15);
  });
  afterEach(() => { rich.reset(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each(['bookmark', 'embed'])('%s splits prose at the selected text and supports delete/undo/redo', (kind) => {
    insert(kind);
    expect([...editor.children].map((el) => el.tagName)).toEqual(['P', 'DIV', 'P']);
    expect(editor.firstChild.textContent).toBe('before ');
    expect(editor.lastChild.textContent).toBe(' after');
    expect(editor.querySelector('p .link-block')).toBeNull();
    editor.querySelector('.link-del').click();
    expect(editor.querySelector('.link-block')).toBeNull();
    expect(history.undo()).toBe(true);
    expect(editor.querySelector('.link-block')).not.toBeNull();
    expect(history.undo()).toBe(true);
    expect(editor.textContent).toBe('before selected after');
    expect(history.redo()).toBe(true);
    expect(editor.querySelector('.link-block')).not.toBeNull();
    expect(history.redo()).toBe(true);
    expect(editor.querySelector('.link-block')).toBeNull();
  });

  it.each(['url', 'mention'])('%s replaces a selection inline without fetching', (kind) => {
    insert(kind);
    const anchor = editor.querySelector('a');
    expect(anchor.href).toBe('https://example.com/docs');
    expect(anchor.textContent).toBe(kind === 'url' ? anchor.href : '@example.com');
    expect(editor.querySelectorAll('p')).toHaveLength(1);
    expect(editor.querySelector('webview, iframe')).toBeNull();
    history.undo();
    expect(editor.textContent).toBe('before selected after');
  });

  it('embeds in a webview so sites that refuse frames can still load', () => {
    insert('embed');
    const frame = editor.querySelector('webview');
    expect(frame.getAttribute('partition')).toBe('persist:embed');
    expect(frame.getAttribute('webpreferences')).toContain('nodeIntegration=no');
    expect(editor.querySelector('iframe')).toBeNull();
    expect(editor.querySelector('a').href).toBe(frame.src);
    expect(editor.querySelector('.link-embed-hint').textContent).toContain('do not allow');
  });

  it('splits nested list content without putting a block inside a paragraph', () => {
    editor.innerHTML = '<ul><li><p>beforeafter</p></li></ul>';
    select(editor.querySelector('p').firstChild, 6);
    insert('bookmark');
    expect([...editor.children].map((el) => el.tagName)).toEqual(['UL', 'DIV', 'UL']);
    expect(editor.firstChild.textContent).toBe('before');
    expect(editor.lastChild.textContent).toBe('after');
  });

  it('rehydrates exported cards after sanitizing, without importing iframe privileges', () => {
    insert('embed');
    const exported = toHtml(editor.innerHTML);
    expect(exported).not.toContain('<iframe');
    expect(exported).not.toContain('<webview');
    editor.innerHTML = sanitize(exported);
    rich.refresh();
    expect(editor.querySelectorAll('.link-del')).toHaveLength(1);
    expect(editor.querySelector('webview').getAttribute('webpreferences')).toContain('nodeIntegration=no');
    expect(toMarkdown(editor.innerHTML)).toContain('[example.com/docs](https://example.com/docs)');
    editor.querySelector('webview').remove();
    rich.refresh(); rich.refresh();
    expect(editor.querySelectorAll('webview')).toHaveLength(1);
    expect(editor.querySelector('iframe')).toBeNull();
  });

  it('cancels an image decode if the active note changed', async () => {
    let decode;
    vi.stubGlobal('Image', class { set src(value) { decode = () => this.onload(); } naturalWidth = 640; naturalHeight = 320; });
    const pending = rich.insertImageBlob(new Blob(['png'], { type: 'image/png' }));
    await vi.waitFor(() => expect(decode).toBeTypeOf('function'));
    rich.reset(); editor.innerHTML = '<p>other note</p>';
    decode();
    expect(await pending).toBeNull();
    expect(editor.innerHTML).toBe('<p>other note</p>');
  });

  it('rejects corrupt images rather than saving a broken-image placeholder', async () => {
    vi.stubGlobal('Image', class { set src(value) { queueMicrotask(() => this.onerror()); } });
    expect(await rich.insertImageBlob(new Blob(['broken'], { type: 'image/png' }))).toBeNull();
    expect(editor.querySelector('img')).toBeNull();
  });

  it('preserves only safe image geometry through HTML import', () => {
    const cleaned = sanitize('<div class="image-layer"><figure class="note-image" style="left:30px;top:40px;width:200px;height:100px;position:fixed;background:url(https://bad.test)"><img src="data:image/png;base64,YQ=="></figure></div>');
    editor.innerHTML = cleaned; rich.refresh();
    const figure = editor.querySelector('figure');
    expect(figure.style.width).toBe('200px');
    expect(figure.style.left).toBe('30px');
    expect(figure.style.position).toBe('');
    expect(figure.style.background).toBe('');
    expect(editor.querySelector('.image-layer').contentEditable).toBe('false');
    expect(editor.querySelectorAll('.image-h')).toHaveLength(1);
  });

  it('round-trips Markdown images as images and rejects unsafe clipboard formats', () => {
    expect(sanitize(fromMarkdown('![photo](data:image/png;base64,YQ==)'))).toContain('<img');
    expect(isImageMime('image/svg+xml')).toBe(false);
    expect(isImageMime('image/bmp')).toBe(false);
    expect(normalizeUrl('https://user:password@example.com')).toBe('');
    expect(normalizeUrl('https://example.com some prose')).toBe('');
  });
});
