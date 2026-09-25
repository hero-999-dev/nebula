/**
 * Rich paste and floating images.
 *
 * Bookmark/URL/mention never fetch a page. Embed is explicitly chosen and
 * renders in a sandbox without same-origin privileges; its link remains a
 * fallback for sites which refuse framing. Async paste is bound to a note.
 */

const LINK_KINDS = ['embed', 'bookmark', 'url', 'mention'];

export function normalizeUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value || /\s/.test(value)) return '';
  const candidate = /^www\./i.test(value) ? `https://${value}` : value;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

/** Sent as the Referer by video embeds. The project's public page: nothing private in it. */
export const EMBED_REFERRER = 'https://hero-999-dev.github.io/nebula/';

/** "90", "90s", "1m30s", "1h2m3s" -> seconds; anything else -> 0. */
function seconds(t) {
  const v = String(t ?? '').trim();
  if (/^\d+$/.test(v)) return Number(v);
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) : 0;
}

/**
 * What an Embed actually loads for a link.
 *
 * A YouTube or Vimeo link points at the site's watch page — header, comments,
 * recommendations. Embedding that put the whole page in the note instead of
 * the video. These sites publish a player URL for exactly this; everything
 * else loads as given. The card keeps showing the link that was pasted.
 * @returns {{src: string, video: boolean}}
 */
export function embedSource(raw) {
  let u;
  try { u = new URL(String(raw ?? '')); } catch { return { src: String(raw ?? ''), video: false }; }
  const host = u.hostname.replace(/^(?:www|m|music)\./, '');
  let id = '';
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
    else id = (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]+)/) || [])[1] || '';
  }
  if (/^[\w-]{6,}$/.test(id)) {
    const start = seconds(u.searchParams.get('t') || u.searchParams.get('start'));
    return { src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`, video: true };
  }
  const vimeo = host === 'vimeo.com' && u.pathname.match(/^\/(\d+)/);
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo[1]}`, video: true };
  return { src: u.href, video: false };
}

export function isImageMime(mime) {
  return /^image\/(?:png|jpe?g|gif|webp)$/i.test(String(mime ?? ''));
}

export function linkLabel(raw) {
  const url = normalizeUrl(raw);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.hostname}${path}${parsed.search}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

const $ = (id) => document.getElementById(id);

function currentRange(editor) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
}

function restoreRange(editor, range) {
  if (!range || !editor.contains(range.commonAncestorContainer)) return false;
  editor.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function placeCaretAfter(node) {
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretIn(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function directBlock(editor, node) {
  let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (el && el !== editor) {
    if (/^(P|DIV|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|LI)$/.test(el.tagName)
      && !el.classList.contains('link-block')
      && !el.classList.contains('image-layer')
      && !el.classList.contains('shape-layer')) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Floating images share the shapes' two layers (0.8.8): one canvas above the
 * text and one under it, where images and shapes stack in one order and can
 * be dragged over and under each other. Until 0.8.7 images had layers of
 * their own, always painted above every shape.
 */
function ensureLayer(editor, behind = false) {
  return ensureCanvas(editor, behind);
}

function imagePoint(editor, clientX, clientY) {
  const rect = editor.getBoundingClientRect();
  return {
    left: Math.max(8, clientX - rect.left + editor.scrollLeft),
    top: Math.max(8, clientY - rect.top + editor.scrollTop),
  };
}

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

function imageSize(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 420, height: image.naturalHeight || 280 });
    image.onerror = () => reject(new Error('Image could not be decoded'));
    image.src = src;
  });
}

function makeImage(src, width, height, at, inline = false) {
  const figure = document.createElement('figure');
  figure.className = inline ? 'note-image note-image--inline' : 'note-image';
  figure.setAttribute('contenteditable', 'false');
  figure.dataset.blockType = 'image';
  figure.dataset.ratio = String(width / Math.max(1, height));
  figure.style.width = `${Math.round(width)}px`;
  if (!inline) {
    figure.style.left = `${Math.round(at?.left ?? 40)}px`;
    figure.style.top = `${Math.round(at?.top ?? 40)}px`;
    figure.style.height = `${Math.round(height)}px`;
  }

  const image = document.createElement('img');
  image.src = src;
  image.alt = 'Pasted image';
  image.draggable = false;
  const handle = document.createElement('span');
  handle.className = 'image-h';
  handle.title = 'Resize image';
  figure.append(image, handle);
  return figure;
}

function makeLinkBlock(url, kind) {
  const card = document.createElement('div');
  card.className = `link-block link-${kind}`;
  card.setAttribute('contenteditable', 'false');
  card.dataset.blockType = 'link';
  card.dataset.kind = kind;
  card.dataset.url = url;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.className = 'link-card';
  const badge = document.createElement('span');
  badge.className = 'link-card__kind';
  badge.textContent = kind === 'embed' ? 'Embed' : 'Bookmark';
  const title = document.createElement('strong');
  title.className = 'link-card__title';
  title.textContent = linkLabel(url);
  const caption = document.createElement('small');
  caption.className = 'link-card__url';
  caption.textContent = url;
  anchor.append(badge, title, caption);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'link-del';
  remove.dataset.linkRemove = 'true';
  remove.title = 'Remove link';
  remove.textContent = '×';
  card.append(anchor, remove);
  if (kind === 'embed') {
    const frame = document.createElement('webview');
    frame.className = 'link-frame';
    frame.title = `Embedded ${linkLabel(url)}`;
    frame.setAttribute('partition', 'persist:embed');
    frame.setAttribute('allowpopups', '');
    frame.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no');
    frame.setAttribute('useragent', navigator.userAgent
      .replace(/ Electron\/[\d.]+/i, '')
      .replace(/ Nebula(?: Test)?\/[\d.]+/i, ''));
    // The user explicitly chose Embed. Do not defer navigation to an
    // intersection callback: Electron can suspend it for an occluded window.
    frame.loading = 'eager';
    const source = embedSource(url);
    if (source.video) {
      card.classList.add('link-embed--video');
      // YouTube refuses a player with no Referer ("Video player configuration
      // error", 153); a page loaded straight into a webview sends none. Name the
      // app's public site, as a web page embedding the player would.
      frame.setAttribute('httpreferrer', EMBED_REFERRER);
    }
    frame.src = source.src;
    card.append(frame);
    // A video player loads or says why itself; the hint is for pages that refuse a frame.
    if (!source.video) {
      const hint = document.createElement('small');
      hint.className = 'link-embed-hint';
      hint.textContent = 'Preview blocked or blank? Open the link above. Some sites do not allow embedding.';
      card.append(hint);
    }
  }
  return card;
}

export function initRichPaste(editor, { history, onGeometry } = {}) {
  if (!editor) return null;
  let pendingRange = null;
  let selectedImage = null;
  let drag = null;
  const claimed = new WeakSet();
  let generation = 0;
  let preferredKind = '';

  const dirty = () => editor.dispatchEvent(new Event('input', { bubbles: true }));

  function ensureLinkMenu() {
    let menu = $('link-menu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'link-menu';
    menu.className = 'float-menu link-menu';
    menu.hidden = true;
    const title = document.createElement('div');
    title.className = 'link-menu__title';
    title.textContent = 'Paste as';
    const input = document.createElement('input');
    input.id = 'link-url-input';
    input.type = 'url';
    input.placeholder = 'https://example.com';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Link URL');
    const options = document.createElement('div');
    options.className = 'link-menu__options';
    for (const kind of LINK_KINDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.linkKind = kind;
      button.textContent = kind === 'url' ? 'URL' : kind[0].toUpperCase() + kind.slice(1);
      options.appendChild(button);
    }
    const hint = document.createElement('div');
    hint.className = 'link-menu__hint';
    hint.textContent = 'Choose how this link should appear.';
    menu.append(title, input, options, hint);
    document.body.appendChild(menu);
    return menu;
  }

  const linkMenu = ensureLinkMenu();
  const linkInput = linkMenu.querySelector('#link-url-input');
  const linkHint = linkMenu.querySelector('.link-menu__hint');

  function positionLinkMenu(range = pendingRange) {
    if (!range) return;
    let rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      const editorRect = editor.getBoundingClientRect();
      rect = { left: editorRect.left + 20, bottom: editorRect.top + 36 };
    }
    const width = linkMenu.offsetWidth || 320;
    const height = linkMenu.offsetHeight || 150;
    linkMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    linkMenu.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8))}px`;
  }

  function open(kind = '', url = '') {
    preferredKind = kind;
    pendingRange = currentRange(editor);
    const onWords = wordsSelected(pendingRange);
    const start = pendingRange?.startContainer;
    const existing = (start?.nodeType === Node.ELEMENT_NODE ? start : start?.parentElement)?.closest?.('a[href]');
    linkInput.value = url || (onWords && existing ? existing.getAttribute('href') : '');
    linkHint.textContent = onWords
      ? 'URL links the selected words. Leave it empty to remove a link.'
      : url ? 'Choose how this link should appear — ↓, then ← → and Enter.' : 'Paste a URL, then choose a format — ↓, then ← → and Enter.';
    linkMenu.querySelectorAll('[data-link-kind]').forEach((button) => {
      button.classList.toggle('sel', button.dataset.linkKind === kind);
    });
    linkMenu.hidden = false;
    positionLinkMenu();
    requestAnimationFrame(() => { if (!linkMenu.hidden) { linkInput.focus(); linkInput.select(); } });
  }

  function hideLinkMenu() {
    linkMenu.hidden = true;
    pendingRange = null;
  }

  function insertInlineLink(url, kind, range) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.className = kind === 'mention' ? 'link-mention' : 'link-url';
    anchor.textContent = kind === 'mention' ? `@${new URL(url).hostname}` : url;
    range.deleteContents();
    range.insertNode(anchor);
    placeCaretAfter(anchor);
  }

  function insertBlockLink(url, kind, range) {
    const card = makeLinkBlock(url, kind);
    range.deleteContents();
    let block = directBlock(editor, range.startContainer);
    while (block && block.parentElement !== editor) block = block.parentElement;
    if (block && block.parentElement === editor) {
      const tail = document.createRange();
      tail.selectNodeContents(block);
      tail.setStart(range.startContainer, range.startOffset);
      const blank = block.cloneNode(false);
      blank.removeAttribute('id');
      blank.appendChild(tail.extractContents());
      if (!blank.textContent && !blank.querySelector('img')) blank.innerHTML = '<br>';
      if (/^(UL|OL)$/.test(blank.tagName) && !blank.querySelector('li')) blank.innerHTML = '<li><br></li>';
      block.after(card);
      card.after(blank);
      if (!block.textContent.trim() && !block.querySelector('img')) block.remove();
      placeCaretIn(blank);
    } else {
      range.insertNode(card);
      const blank = document.createElement('p');
      blank.innerHTML = '<br>';
      card.after(blank);
      placeCaretIn(blank);
    }
  }

  /** Selected words inside the note's prose, not in a code block, shape, card or caption. */
  function wordsSelected(range) {
    if (!range || range.collapsed || !range.toString().trim()) return false;
    const host = range.commonAncestorContainer;
    const el = host.nodeType === Node.ELEMENT_NODE ? host : host.parentElement;
    return editor.contains(el) && !el.closest('.code-src, .shape, .link-block, .note-image');
  }

  /**
   * Link the selected words to `url`, keeping the words and their formatting.
   *
   * Until 0.8.5 a link could only be inserted as its own URL text, so an
   * article rewritten in Nebula lost every link it had (the page-rebuild test:
   * 0 of 44). Chromium's createLink wraps each run of the selection, bold and
   * italic included; the caret ends after the link so typing goes on outside it.
   */
  const LINE = 'p, div, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption';
  const lineOf = (node) => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest(LINE);

  function decorate(a, url) {
    a.href = url;
    a.classList.add('link-url');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = `${url} — Ctrl+click to open`;
    return a;
  }

  function linkWords(range, url) {
    if (!restoreRange(editor, range)) return null;
    history?.push();
    let last = null;
    const inLink = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest('a[href]');
    if (inLink && editor.contains(inLink)) {
      // Words already in one link: change where it goes.
      last = decorate(inLink, url);
    } else if (lineOf(range.startContainer) === lineOf(range.endContainer)) {
      // One line: wrap the selection. Bold and italic inside it come along.
      const a = decorate(document.createElement('a'), url);
      a.appendChild(range.extractContents());
      a.querySelectorAll('a').forEach((inner) => inner.replaceWith(...inner.childNodes));
      range.insertNode(a);
      last = a;
    } else {
      // Across lines, Chromium's command splits the link per line correctly.
      document.execCommand('createLink', false, url);
      const sel = window.getSelection();
      const within = sel.rangeCount ? sel.getRangeAt(0) : null;
      for (const a of editor.querySelectorAll('a[href]')) {
        if (a.getAttribute('href') !== url || a.closest('.link-block') || !within?.intersectsNode(a)) continue;
        last = decorate(a, url);
      }
    }
    if (last) placeCaretAfter(last);
    dirty();
    return last;
  }

  /** Take the link off the selected words, keeping the words. */
  function unlinkWords(range) {
    if (!restoreRange(editor, range)) return;
    history?.push();
    for (const a of [...editor.querySelectorAll('a[href]')]) {
      if (a.closest('.link-block') || !range.intersectsNode(a)) continue;
      a.replaceWith(...a.childNodes);
    }
    dirty();
  }

  function applyLink(kind) {
    const url = normalizeUrl(linkInput.value);
    const range = pendingRange;
    // An empty address on linked words takes the link off them.
    if (!linkInput.value.trim() && kind === 'url' && wordsSelected(range)) {
      hideLinkMenu();
      unlinkWords(range);
      return;
    }
    if (!url) {
      linkHint.textContent = 'Enter a valid http(s) URL first.';
      linkInput.focus();
      return;
    }
    hideLinkMenu();
    if (kind === 'url' && wordsSelected(range)) { linkWords(range, url); return; }
    if (!restoreRange(editor, range)) return;
    history?.push();
    if (kind === 'url' || kind === 'mention') insertInlineLink(url, kind, range);
    else insertBlockLink(url, kind, range);
    dirty();
  }

  linkMenu.addEventListener('mousedown', (event) => {
    if (event.target.closest('[data-link-kind]')) event.preventDefault();
  });
  linkMenu.addEventListener('click', (event) => {
    const kind = event.target.closest('[data-link-kind]')?.dataset.linkKind;
    if (kind) applyLink(kind);
  });
  /**
   * The menu by keyboard (0.8.7): from the address, ↓ steps into the options;
   * ← → move between them (wrapping), Enter applies the lit one, ↑ goes back
   * to the address. Esc anywhere closes it and puts the caret back in the note.
   */
  const kindButtons = () => [...linkMenu.querySelectorAll('[data-link-kind]')];
  function lightKind(button) {
    for (const b of kindButtons()) b.classList.toggle('sel', b === button);
    button?.focus();
  }
  linkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); applyLink(preferredKind || 'url'); return; }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const buttons = kindButtons();
      lightKind(buttons.find((b) => b.dataset.linkKind === preferredKind) || buttons[0]);
    }
  });
  linkMenu.addEventListener('keydown', (event) => {
    const button = event.target.closest?.('[data-link-kind]');
    if (!button) return;
    const buttons = kindButtons();
    const at = buttons.indexOf(button);
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      lightKind(buttons[(at + step + buttons.length) % buttons.length]);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      linkInput.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      applyLink(button.dataset.linkKind);
    }
  });
  editor.addEventListener('mousedown', (event) => {
    if (event.target.closest('[data-link-remove]')) event.preventDefault();
  });
  editor.addEventListener('click', (event) => {
    const card = event.target.closest('[data-link-remove]')?.closest('.link-block');
    if (!card || !editor.contains(card)) return;
    event.preventDefault();
    history?.push();
    card.remove();
    dirty();
  });

  function ensureImageBar() {
    let bar = $('image-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'image-bar';
    bar.className = 'image-bar';
    bar.hidden = true;
    // Three placements side by side, the current one lit (owner's request,
    // replacing the ⇄ toggle): under the text, over it, or in it.
    bar.innerHTML = '<button type="button" data-image="back" title="Behind the text (floats)">▾</button>'
      + '<button type="button" data-image="front" title="Above the text (floats, on top)">▴</button>'
      + '<button type="button" data-image="inline" title="In the text (moves with the words)">≡</button>'
      + '<span class="image-bar__sep"></span>'
      + '<button type="button" data-image="caption" title="Add or edit a caption">Aa</button>'
      + '<button type="button" data-image="del" title="Delete image">✕</button>';
    document.body.appendChild(bar);
    return bar;
  }

  const imageBar = ensureImageBar();

  function positionImageBar() {
    if (!selectedImage?.isConnected) { selectImage(null); return; }
    const rect = selectedImage.getBoundingClientRect();
    const width = imageBar.offsetWidth || 130;
    const height = imageBar.offsetHeight || 32;
    const top = rect.top - height - 8 >= 8 ? rect.top - height - 8 : rect.bottom + 8;
    imageBar.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    imageBar.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
  }

  /** Which of the three placements an image has. */
  function placementOf(image) {
    if (image.classList.contains('note-image--inline')) return 'inline';
    return image.closest('.shape-layer--behind, .image-layer--behind') ? 'back' : 'front';
  }

  function selectImage(image) {
    editor.querySelectorAll('.note-image.sel').forEach((node) => node.classList.remove('sel'));
    selectedImage = image || null;
    selectedImage?.classList.add('sel');
    imageBar.hidden = !selectedImage;
    if (selectedImage) {
      editor.dispatchEvent(new CustomEvent('nebula-canvas-select', { detail: 'image' }));
      const place = placementOf(selectedImage);
      for (const b of imageBar.querySelectorAll('[data-image="back"], [data-image="front"], [data-image="inline"]')) {
        b.classList.toggle('on', b.dataset.image === place);
      }
      positionImageBar();
    }
  }

  function behindImageAt(x, y) {
    let hit = null;
    for (const image of editor.querySelectorAll('.shape-layer--behind .note-image, .image-layer--behind .note-image')) {
      const rect = image.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) hit = image;
    }
    return hit;
  }

  function refreshImages() {
    for (const layer of editor.querySelectorAll('.image-layer')) layer.contentEditable = 'false';
    for (const card of editor.querySelectorAll('.link-block')) {
      // A video saved before 0.8.5 loads the watch page; point it at the player.
      // Only videos: another embed's src follows its own navigation (a sign-in).
      const video = card.dataset.kind === 'embed' && embedSource(card.dataset.url).video;
      const onWatchPage = video && !/^https:\/\/(?:www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/
        .test(card.querySelector('webview')?.getAttribute('src') || '');
      if (!card.querySelector('.link-del') || (card.dataset.kind === 'embed' && !card.querySelector('webview')) || onWatchPage) {
        const url = normalizeUrl(card.dataset.url);
        if (url) card.replaceWith(makeLinkBlock(url, card.dataset.kind === 'embed' ? 'embed' : 'bookmark'));
      }
    }
    for (const image of editor.querySelectorAll('.note-image')) {
      image.setAttribute('contenteditable', 'false');
      if (!image.querySelector('.image-h')) {
        const handle = document.createElement('span');
        handle.className = 'image-h';
        handle.title = 'Resize image';
        image.appendChild(handle);
      }
      const img = image.querySelector('img');
      if (img) img.draggable = false;
      captionOf(image); // a saved caption is editable again
    }
    if (selectedImage && !selectedImage.isConnected) selectImage(null);
  }

  function insertImageData(src, dimensions, at) {
    const maxWidth = 460;
    const ratio = dimensions.width / Math.max(1, dimensions.height);
    let width = Math.min(maxWidth, Math.max(120, dimensions.width || maxWidth));
    let height = width / ratio;
    if (height > 420) { height = 420; width = height * ratio; }
    history?.push();
    let image;
    if (at) {
      // Dropped at a point: it floats there, over or behind the text.
      image = makeImage(src, width, height, at);
      ensureLayer(editor).appendChild(image);
    } else {
      // Pasted: it goes into the text, on the caret's line, and flows with it.
      // Floating by pixel position is what scattered images over the text and
      // left gaps as soon as the window was a different width (owner's video,
      // 0.8.5). The image bar can still set it free.
      image = makeImage(src, width, height, null, true);
      placeInText(image, pendingRange || currentRange(editor));
    }
    refreshImages();
    selectImage(image);
    dirty();
    return image;
  }

  /** The note-level block a range sits in, or null. */
  function topBlockOf(range) {
    let el = range?.startContainer;
    el = el?.nodeType === Node.ELEMENT_NODE ? el : el?.parentElement;
    if (!el || !editor.contains(el) || el === editor) {
      const child = range && range.startContainer === editor ? editor.childNodes[range.startOffset - 1] : null;
      return child?.nodeType === Node.ELEMENT_NODE && !child.matches('.shape-layer, .image-layer') ? child : null;
    }
    while (el.parentElement && el.parentElement !== editor) el = el.parentElement;
    return el.matches('.shape-layer, .image-layer') ? null : el;
  }

  /** Put an image into the text after the caret's line (in place of it, if empty), with a line to go on typing. */
  function placeInText(image, range) {
    const block = topBlockOf(range);
    const empty = block && !block.textContent.trim()
      && !block.querySelector('img, hr, .link-block, .note-image, .blk-code, .inline-eq');
    if (block && empty) block.replaceWith(image);
    else if (block) block.after(image);
    else editor.append(image);
    let next = image.nextElementSibling;
    if (!next || next.matches('.note-image, .link-block, hr, .blk-code')) {
      next = document.createElement('p');
      next.innerHTML = '<br>';
      image.after(next);
    }
    placeCaretIn(next);
  }

  /** In the text -> floating, staying exactly where it is on screen; and back. */
  function setImageFloating(image, floating) {
    const inline = image.classList.contains('note-image--inline');
    if (floating === !inline) return;
    const rect = image.getBoundingClientRect();
    if (floating) {
      const layer = ensureLayer(editor);
      const origin = layer.getBoundingClientRect();
      const pictureHeight = image.querySelector('img')?.getBoundingClientRect().height || rect.height;
      image.classList.remove('note-image--inline');
      image.style.left = `${Math.round(rect.left - origin.left)}px`;
      image.style.top = `${Math.round(rect.top - origin.top)}px`;
      image.style.height = `${Math.round(pictureHeight)}px`;
      layer.appendChild(image);
    } else {
      // Into the text after the last line that starts above the image's top edge.
      let after = null;
      for (const el of editor.children) {
        if (el.matches('.shape-layer, .image-layer') || el === image) continue;
        if (el.getBoundingClientRect().top <= rect.top) after = el;
      }
      image.classList.remove('behind');
      image.classList.add('note-image--inline');
      image.style.left = '';
      image.style.top = '';
      image.style.height = '';
      if (after) after.after(image);
      else {
        // Before the first line of text, but after the overlay layers, which stay first.
        const first = [...editor.children].find((el) => !el.matches('.shape-layer, .image-layer') && el !== image);
        if (first) first.before(image); else editor.append(image);
      }
    }
  }

  async function insertImageBlob(blob, at) {
    if (!blob || !isImageMime(blob.type)) return null;
    const started = generation;
    try {
      const src = await readBlob(blob);
      const dimensions = await imageSize(src);
      if (started !== generation) return null;
      return insertImageData(src, dimensions, at);
    } catch {
      return null;
    }
  }

  editor.addEventListener('mousedown', (event) => {
    if (event.target.closest('.image-caption')) { selectImage(null); return; }
    const handle = event.target.closest('.image-h');
    let image = event.target.closest('.note-image');
    if (!image && !event.target.closest('.shape, .link-block')) {
      const behind = behindImageAt(event.clientX, event.clientY);
      if (behind !== selectedImage || event.altKey) image = behind;
    }
    if (!image) return;
    claimed.add(event);
    history?.push();
    selectImage(image);
    event.preventDefault();
    event.stopPropagation();
    drag = {
      image,
      layer: image.parentElement,
      extent: editor.scrollHeight,
      kind: handle ? 'resize' : 'move',
      moved: false,
      downX: event.clientX,
      downY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      left: parseFloat(image.style.left) || 0,
      top: parseFloat(image.style.top) || 0,
      width: parseFloat(image.style.width) || image.offsetWidth,
      height: parseFloat(image.style.height) || image.offsetHeight,
      ratio: Number(image.dataset.ratio) || image.offsetWidth / Math.max(1, image.offsetHeight),
    };
  }, true);

  window.addEventListener('mousemove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(event.clientX - drag.downX) > 2 || Math.abs(event.clientY - drag.downY) > 2) drag.moved = true;
    if (!drag.moved) return;
    const inText = drag.image.classList.contains('note-image--inline');
    if (inText && drag.kind === 'move') return; // it sits in the text; ⇄ on the bar sets it free
    if (!inText) drag.layer.style.minHeight = `${drag.extent}px`;
    editor.classList.add('image-dragging');
    if (drag.kind === 'move') {
      drag.image.style.left = `${Math.max(0, drag.left + dx)}px`;
      drag.image.style.top = `${Math.max(0, drag.top + dy)}px`;
    } else {
      const delta = Math.abs(dx) >= Math.abs(dy * drag.ratio) ? dx : dy * drag.ratio;
      const width = Math.max(Math.min(100, 60 * drag.ratio), drag.width + delta);
      drag.image.style.width = `${Math.round(width)}px`;
      if (!inText) drag.image.style.height = `${Math.round(width / drag.ratio)}px`;
    }
    positionImageBar();
    onGeometry?.();
  });

  function finishDrag() {
    if (!drag) return;
    if (drag.layer !== editor) {
      drag.layer.style.minHeight = '';
      if (!drag.layer.getAttribute('style')) drag.layer.removeAttribute('style');
    }
    editor.classList.remove('image-dragging');
    if (drag.moved) { onGeometry?.(); dirty(); }
    drag = null;
  }
  editor.addEventListener('nebula-canvas-select', (e) => { if (e.detail !== 'image' && selectedImage) selectImage(null); });
  window.addEventListener('mouseup', finishDrag);
  window.addEventListener('blur', finishDrag);

  /**
   * An image's caption: a line of text under it that moves with it.
   *
   * Images float, so a caption typed as the next paragraph drifted away from
   * the picture as soon as either moved. The caption is a <figcaption> inside
   * the figure, editable on its own like a shape's text.
   */
  function captionOf(figure, create = false) {
    let cap = figure.querySelector(':scope > figcaption.image-caption');
    if (!cap && create) {
      cap = document.createElement('figcaption');
      cap.className = 'image-caption';
      cap.dataset.placeholder = 'Caption';
      figure.appendChild(cap);
    }
    if (cap) cap.setAttribute('contenteditable', 'true');
    return cap;
  }

  function editCaption(figure) {
    history?.push();
    const cap = captionOf(figure, true);
    selectImage(null);
    cap.focus();
    const r = document.createRange();
    r.selectNodeContents(cap);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return cap;
  }

  // Where the caret was in the note's prose, so leaving a caption goes back there.
  let lastProse = null;
  document.addEventListener('selectionchange', () => {
    const range = currentRange(editor);
    const host = range?.startContainer;
    const el = host?.nodeType === Node.ELEMENT_NODE ? host : host?.parentElement;
    if (range && el && !el.closest('.image-caption, .note-image, .shape, .code-src, .link-block')) lastProse = range;
  });

  /**
   * Leaving a caption (Enter or Escape): an empty one is removed, and the caret
   * goes back into the note — where it was, or the end. Blurring alone left the
   * selection inside the caption, so the next keys went nowhere.
   */
  function finishCaption(cap) {
    if (!cap?.isConnected) return;
    if (!cap.textContent.replace(/​/g, '').trim()) cap.remove();
    cap.blur();
    if (!(lastProse && restoreRange(editor, lastProse))) {
      editor.focus();
      const end = document.createRange();
      end.selectNodeContents(editor);
      end.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(end);
    }
    dirty();
  }

  editor.addEventListener('focusout', (event) => {
    const cap = event.target.closest?.('.image-caption');
    if (cap && !cap.textContent.trim()) { cap.remove(); dirty(); }
  });

  imageBar.addEventListener('mousedown', (event) => event.preventDefault());
  imageBar.addEventListener('click', (event) => {
    const act = event.target.closest('[data-image]')?.dataset.image;
    if (!selectedImage || !act) return;
    if (act === 'caption') { editCaption(selectedImage); return; }
    if (act === 'inline') {
      history?.push();
      setImageFloating(selectedImage, false);
      selectImage(selectedImage);
      onGeometry?.();
      dirty();
      return;
    }
    // Behind/above text: an image in the text is set free where it stands first.
    if ((act === 'back' || act === 'front') && selectedImage.classList.contains('note-image--inline')) {
      history?.push();
      setImageFloating(selectedImage, true);
    }
    if (act === 'del') {
      history?.push();
      selectedImage.remove();
      selectImage(null);
      dirty();
      return;
    }
    history?.push();
    const behind = act === 'back';
    selectedImage.classList.toggle('behind', behind);
    ensureLayer(editor, behind).appendChild(selectedImage);
    selectImage(selectedImage);
    onGeometry?.();
    dirty();
  });

  document.addEventListener('mousedown', (event) => {
    if (!linkMenu.hidden && !event.target.closest('#link-menu, #slash-menu')) hideLinkMenu();
    if (claimed.has(event)) return;
    if (event.target.closest('.note-image, #image-bar')) return;
    if (selectedImage) selectImage(null);
  });
  editor.addEventListener('scroll', () => { if (selectedImage) positionImageBar(); });
  window.addEventListener('resize', () => { if (selectedImage) positionImageBar(); });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !linkMenu.hidden) {
      const back = pendingRange;
      hideLinkMenu();
      if (back) restoreRange(editor, back);
      return;
    }
    const cap = event.target.closest?.('.image-caption');
    if (cap && (event.key === 'Enter' || event.key === 'Escape')) {
      event.preventDefault();
      event.stopPropagation();
      finishCaption(cap);
      return;
    }
    if (event.key === 'Escape') selectImage(null);
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedImage
      && !event.target.closest('input, textarea, .code-src, .shape-text, .image-caption')) {
      event.preventDefault();
      event.stopPropagation();
      history?.push();
      // An image in the text leaves the caret where the image was: at the end
      // of the line it went under. The caret stayed wherever the click had
      // left it, and the next word typed landed at the end of the note
      // (long-note trials, 0.8.9).
      const inText = selectedImage.classList.contains('note-image--inline');
      const above = inText ? selectedImage.previousElementSibling : null;
      selectedImage.remove();
      selectImage(null);
      if (above && !above.matches('.shape-layer, .image-layer, .note-image, .link-block, .blk-code, hr')) {
        const r = document.createRange();
        r.selectNodeContents(above);
        r.collapse(false);
        editor.focus({ preventScroll: true });
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(r);
      }
      dirty();
    }
  }, true);

  // Links in a note open with Ctrl+click (Cmd+click on a Mac); a plain click
  // puts the caret in the words, as it does everywhere else in the note.
  editor.addEventListener('click', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const a = event.target.closest?.('a[href]');
    if (!a || !editor.contains(a)) return;
    const url = normalizeUrl(a.getAttribute('href'));
    if (!url) return;
    event.preventDefault();
    if (window.nebula?.openExternal) void window.nebula.openExternal(url);
    else window.open(url, '_blank', 'noopener');
  });

  editor.addEventListener('paste', (event) => {
    if (event.target.closest('.code-src, .shape-text, .link-block, .note-image')) return;
    const items = [...(event.clipboardData?.items || [])];
    const imageItem = items.find((item) => isImageMime(item.type));
    if (imageItem) {
      event.preventDefault();
      pendingRange = currentRange(editor);
      void insertImageBlob(imageItem.getAsFile(), null);
      return;
    }
    const text = event.clipboardData?.getData('text/plain') || '';
    // A URL pasted over selected words links them, as in any editor.
    const selected = currentRange(editor);
    if (normalizeUrl(text) && wordsSelected(selected)) {
      event.preventDefault();
      linkWords(selected, normalizeUrl(text));
      return;
    }
    if (normalizeUrl(text)) {
      event.preventDefault();
      open('', text);
    }
  });

  editor.addEventListener('dragover', (event) => {
    const types = [...(event.dataTransfer?.types || [])];
    if (types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain')) event.preventDefault();
  });
  editor.addEventListener('drop', (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((item) => isImageMime(item.type));
    if (file) {
      event.preventDefault();
      void insertImageBlob(file, imagePoint(editor, event.clientX, event.clientY));
      return;
    }
    const text = event.dataTransfer?.getData('text/plain') || '';
    if (normalizeUrl(text)) {
      event.preventDefault();
      const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (range) restoreRange(editor, range);
      open('', text);
    }
  });

  async function paste() {
    const savedRange = currentRange(editor);
    const started = generation;
    editor.focus();
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read().catch(() => []);
        if (started !== generation) return;
        for (const clipboardItem of items) {
          const type = clipboardItem.types.find((item) => isImageMime(item));
          if (type) {
            const blob = await clipboardItem.getType(type);
            if (started !== generation) return;
            await insertImageBlob(blob, null);
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (started !== generation || !restoreRange(editor, savedRange)) return;
      if (normalizeUrl(text)) { open('', text); return; }
      if (text) { history?.push(); document.execCommand('insertText', false, text); dirty(); }
    } catch {
      if (started !== generation) return;
      restoreRange(editor, savedRange);
      try { document.execCommand('paste'); } catch { /* browser preview */ }
    }
  }

  refreshImages();

  return {
    open,
    paste,
    refresh: refreshImages,
    reset: () => { generation += 1; drag = null; editor.classList.remove('image-dragging'); selectImage(null); hideLinkMenu(); },
    insertImageBlob,
  };
}import { ensureLayer as ensureCanvas } from './shapes.js';

