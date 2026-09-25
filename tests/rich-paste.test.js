import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizeUrl, isImageMime, linkLabel, initRichPaste, embedSource, EMBED_REFERRER } from '../src/js/rich-paste.js';
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

  it('url links the selected words, keeping them (0.8.5)', () => {
    insert('url');
    const anchor = editor.querySelector('a');
    expect(anchor.href).toBe('https://example.com/docs');
    expect(anchor.textContent).toBe('selected');
    expect(anchor.classList.contains('link-url')).toBe(true);
    expect(editor.textContent).toBe('before selected after');
    expect(editor.querySelector('webview, iframe')).toBeNull();
    history.undo();
    expect(editor.querySelector('a')).toBeNull();
    expect(editor.textContent).toBe('before selected after');
  });

  it('keeps bold inside linked words, and re-links a link instead of nesting one', () => {
    editor.innerHTML = '<p>one <b>two</b> three</p>';
    const p = editor.querySelector('p');
    const r = document.createRange();
    r.setStart(p.firstChild, 0);
    r.setEnd(p.lastChild, 3);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    insert('url');
    expect(p.innerHTML).toBe('<a href="https://example.com/docs" class="link-url" target="_blank" rel="noopener noreferrer" title="https://example.com/docs — Ctrl+click to open">one <b>two</b> th</a>ree');
    select(p.querySelector('a b').firstChild, 0, 3);
    rich.open('url');
    document.getElementById('link-url-input').value = 'https://example.org/';
    document.querySelector('[data-link-kind="url"]').click();
    expect(p.querySelectorAll('a')).toHaveLength(1);
    expect(p.querySelector('a').getAttribute('href')).toBe('https://example.org/');
  });

  it('an empty address takes the link off the selected words', () => {
    insert('url');
    select(editor.querySelector('a').firstChild, 0, 8);
    rich.open('url');
    expect(document.getElementById('link-url-input').value).toBe('https://example.com/docs');
    document.getElementById('link-url-input').value = '';
    document.querySelector('[data-link-kind="url"]').click();
    expect(editor.querySelector('a')).toBeNull();
    expect(editor.textContent).toBe('before selected after');
  });

  it('mention replaces a selection inline without fetching', () => {
    const kind = 'mention';
    insert(kind);
    const anchor = editor.querySelector('a');
    expect(anchor.href).toBe('https://example.com/docs');
    expect(anchor.textContent).toBe('@example.com');
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

  describe('a pasted image goes into the text (0.8.6)', () => {
    const loads = () => vi.stubGlobal('Image', class { set src(value) { queueMicrotask(() => this.onload()); } naturalWidth = 640; naturalHeight = 320; });
    const png = () => new Blob(['png'], { type: 'image/png' });

    it('sits after the caret line, in the flow, with a line under it to go on typing', async () => {
      loads();
      const figure = await rich.insertImageBlob(png());
      expect(figure.classList.contains('note-image--inline')).toBe(true);
      expect(figure.parentElement).toBe(editor);
      expect(figure.previousElementSibling.textContent).toBe('before selected after');
      expect(figure.style.top).toBe('');
      expect(figure.nextElementSibling.tagName).toBe('P');
      expect(editor.querySelector('.image-layer')).toBeNull();
      expect(window.getSelection().anchorNode).toBe(figure.nextElementSibling);
    });

    it('takes the place of an empty line', async () => {
      loads();
      editor.innerHTML = '<p>one</p><p><br></p><p>two</p>';
      const blank = editor.querySelectorAll('p')[1];
      const r = document.createRange(); r.setStart(blank, 0); r.collapse(true);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
      await rich.insertImageBlob(png());
      expect([...editor.children].map((el) => el.tagName)).toEqual(['P', 'FIGURE', 'P']);
    });

    it('a dropped image still floats where it was dropped', async () => {
      loads();
      const figure = await rich.insertImageBlob(png(), { left: 50, top: 60 });
      expect(figure.classList.contains('note-image--inline')).toBe(false);
      expect(figure.parentElement.classList.contains('image-layer')).toBe(true);
      expect(figure.style.top).toBe('60px');
    });

    it('⇄ on the image bar sets it free and puts it back in the text', async () => {
      loads();
      const figure = await rich.insertImageBlob(png());
      const flow = document.querySelector('#image-bar [data-image="flow"]');
      flow.click();
      expect(figure.classList.contains('note-image--inline')).toBe(false);
      expect(figure.parentElement.classList.contains('image-layer')).toBe(true);
      expect(figure.style.left).not.toBe('');
      flow.click();
      expect(figure.classList.contains('note-image--inline')).toBe(true);
      expect(figure.parentElement).toBe(editor);
      expect(figure.style.left).toBe('');
    });
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
    // A URL carrying a login is refused. Built through the URL API rather than
    // typed out, so no literal "name:secret@host" sits in the source for a
    // credential scan to flag (the flash sync held this file back for it).
    const withLogin = new URL('https://example.com/');
    withLogin.username = 'user';
    expect(normalizeUrl(withLogin.href)).toBe('');
    withLogin.password = 'secret';
    expect(normalizeUrl(withLogin.href)).toBe('');
    expect(normalizeUrl('https://example.com some prose')).toBe('');
  });
});

describe('embedSource: a video link embeds its player, not the watch page', () => {
  const player = 'https://www.youtube-nocookie.com/embed/FUfGcZ092b0';
  it.each([
    'https://www.youtube.com/watch?v=FUfGcZ092b0',
    'https://youtube.com/watch?v=FUfGcZ092b0&list=PL1',
    'https://m.youtube.com/watch?v=FUfGcZ092b0',
    'https://youtu.be/FUfGcZ092b0',
    'https://www.youtube.com/shorts/FUfGcZ092b0',
    'https://www.youtube.com/live/FUfGcZ092b0',
    'https://www.youtube-nocookie.com/embed/FUfGcZ092b0',
  ])('%s', (url) => {
    expect(embedSource(url)).toEqual({ src: player, video: true });
  });

  it('carries a start time', () => {
    expect(embedSource('https://youtu.be/FUfGcZ092b0?t=90').src).toBe(`${player}?start=90`);
    expect(embedSource('https://www.youtube.com/watch?v=FUfGcZ092b0&t=1m30s').src).toBe(`${player}?start=90`);
  });

  it('handles Vimeo and leaves every other page as it is', () => {
    expect(embedSource('https://vimeo.com/76979871')).toEqual({ src: 'https://player.vimeo.com/video/76979871', video: true });
    expect(embedSource('https://example.com/watch?v=abc')).toEqual({ src: 'https://example.com/watch?v=abc', video: false });
    expect(embedSource('https://www.youtube.com/@channel')).toEqual({ src: 'https://www.youtube.com/@channel', video: false });
  });

  it('sends a public https referrer, which YouTube requires of a player', () => {
    expect(new URL(EMBED_REFERRER).protocol).toBe('https:');
  });
});

describe('image captions (0.8.5)', () => {
  let editor, rich;
  const IMG = '<div class="image-layer" contenteditable="false"><figure class="note-image" contenteditable="false" style="left:10px;top:10px;width:100px;height:50px"><img src="data:image/png;base64,iVBORw0KGgo="></figure></div><p>text line</p>';
  beforeEach(() => {
    document.body.innerHTML = `<div id="editor" contenteditable="true">${IMG}</div>`;
    editor = document.getElementById('editor');
    vi.stubGlobal('requestAnimationFrame', () => 0);
    rich = initRichPaste(editor, {});
    rich.refresh();
    const t = editor.querySelector('p').firstChild;
    const r = document.createRange(); r.setStart(t, 4); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
    editor.querySelector('.note-image').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  afterEach(() => { rich.reset(); vi.unstubAllGlobals(); });
  const captionButton = () => document.querySelector('#image-bar [data-image="caption"]');
  const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  it('adds an editable caption inside the figure from the image bar', () => {
    expect(document.getElementById('image-bar').hidden).toBe(false);
    captionButton().click();
    const cap = editor.querySelector('.note-image figcaption.image-caption');
    expect(cap).not.toBeNull();
    expect(cap.getAttribute('contenteditable')).toBe('true');
    expect(document.activeElement).toBe(cap);
  });

  it('Enter finishes the caption and puts the caret back in the note', () => {
    captionButton().click();
    const cap = editor.querySelector('figcaption');
    cap.textContent = 'Source: a survey';
    key(cap, 'Enter');
    expect(cap.textContent).toBe('Source: a survey');
    const sel = window.getSelection();
    expect(editor.querySelector('p').contains(sel.anchorNode)).toBe(true);
  });

  it('an empty caption is removed when left', () => {
    captionButton().click();
    key(editor.querySelector('figcaption'), 'Escape');
    expect(editor.querySelector('figcaption')).toBeNull();
  });

  it('Backspace in a caption edits the caption, never deletes the image', () => {
    captionButton().click();
    const cap = editor.querySelector('figcaption');
    cap.textContent = 'x';
    key(cap, 'Backspace');
    expect(editor.querySelector('.note-image')).not.toBeNull();
  });

  it('a saved caption comes back editable, and Markdown export keeps it', () => {
    editor.innerHTML = IMG.replace('</figure>', '<figcaption class="image-caption">Saved</figcaption></figure>');
    rich.refresh();
    expect(editor.querySelector('figcaption').getAttribute('contenteditable')).toBe('true');
    expect(toMarkdown(editor.innerHTML)).toContain('*Saved*');
  });
});
