/**
 * Rich paste and floating images.
 *
 * Bookmarks request a bounded page title; URL and mention do not fetch.
 * Embed is explicitly chosen and
 * renders in a sandbox without same-origin privileges; its link remains a
 * fallback for sites which refuse framing. Async paste is bound to a note.
 */

import { editorZoom } from './page-zoom.js';
import { bindLinkPreview } from './link-preview.js';
import { resizeImageBox, ensureImageHandles } from './image-resize.js';
import { injectIcons } from './icons.js';
import { isVideoFile, isMediaUrl, makeVideoBlock, refreshVideoBlocks, initVideoPlayers } from './file-video.js';
import { makeAttachBlock, refreshAttachBlocks, initAttachCards, dropKind, isAttachUrl, ownsAttachUrl } from './file-attach.js';
import { createPictureDrag, alignOf, setAlign, inRow, leaveRow, putBeside, pictureBefore, tidyRows, inWord, putInLine, leaveLine } from './image-place.js';
import { cleanPastedHtml, cleanNebulaHtml, fromNebula, undressInserted, dressInNoteFont } from './paste-clean.js';
import { dropTarget, insertBlocks, holdsStructure, caretAfter } from './block-handle.js';
import { showDropMark, hideDropMark } from './drop-mark.js';

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
  // Without scrolling: focus coming back from a field outside the note (the
  // "Paste as" address) put a caret at the top of the note first, and the page
  // jumped up there — "I paste a web page and the screen goes to the top, I
  // have to scroll down again" (the owner, 0.9.4).
  editor.focus({ preventScroll: true });
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
  // Pictures and shapes are placed on the paper (0.9.3): measured from the
  // canvas, which is the paper's width and scrolls with the page.
  const canvas = editor.querySelector(':scope > .shape-layer:not(.shape-layer--behind)');
  if (canvas) {
    const origin = canvas.getBoundingClientRect();
    return {
      left: Math.max(8, (clientX - origin.left) / editorZoom(editor)),
      top: Math.max(8, (clientY - origin.top) / editorZoom(editor)),
    };
  }
  const rect = editor.getBoundingClientRect();
  return {
    left: Math.max(8, (clientX - rect.left) / editorZoom(editor) + editor.scrollLeft),
    top: Math.max(8, (clientY - rect.top) / editorZoom(editor) + editor.scrollTop),
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
  figure.append(image);
  ensureImageHandles(figure);
  return figure;
}

const EMBED_EDGES = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

/** An embed's eight resize handles, rebuilt to this version's set (the 0.9.3 first build drew one grip). */
function ensureEmbedHandles(card) {
  card.querySelectorAll(':scope > .embed-grip, :scope > .embed-h:not([data-edge])').forEach((g) => g.remove());
  const have = new Set([...card.querySelectorAll(':scope > .embed-h')].map((h) => h.dataset.edge));
  for (const edge of EMBED_EDGES) {
    if (have.has(edge)) continue;
    const h = document.createElement('span');
    h.className = 'embed-h';
    h.dataset.edge = edge;
    h.title = 'Drag to resize the embed';
    card.append(h);
  }
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
    ensureEmbedHandles(card);
    // A video player loads or says why itself; the hint is for pages that refuse a frame.
    if (!source.video) {
      const hint = document.createElement('small');
      hint.className = 'link-embed-hint';
      hint.hidden = true;
      hint.textContent = 'This preview could not load. Open the link above in your browser.';
      card.append(hint);
    }
  }
  return card;
}

export function initRichPaste(editor, { history, onGeometry, onHeal, noteFont, noteId, noteHole } = {}) {
  if (!editor) return null;
  let pendingRange = null;
  let selectedImage = null;
  let drag = null;
  const claimed = new WeakSet();
  let generation = 0;
  let preferredKind = '';

  const dirty = () => editor.dispatchEvent(new Event('input', { bubbles: true }));
  // A card's page title is something that ARRIVED, not an edit: it goes into
  // the current state without an undo step (so redo survives), and is stored
  // as a repair rather than as a change of the note's date (0.9.1).
  const watchTitle = (card) => bindLinkPreview(card, {
    placeholder: linkLabel(card.dataset.url),
    onTitle: (write) => {
      if (!editor.contains(card)) return;
      if (history?.absorb) history.absorb(write); else write();
      onHeal?.();
    },
  });
  editor.addEventListener('input', () => {
    for (const card of editor.querySelectorAll('.link-block')) watchTitle(card);
  });

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
    // On a line with nothing written in the note's font yet the link came out in
    // the app's serif (1.0.0: "a URL pasted with Ctrl+V turns serif though the
    // note's font is another", the owner). It is written in that font, as typed words are.
    const font = noteFont?.();
    if (font && (font.family || font.size) && !inNoteFont(anchor)) {
      const span = document.createElement('span');
      if (font.family) span.style.fontFamily = font.family;
      if (font.size && !anchor.closest('h1, h2, h3, h4, h5, h6')) span.style.fontSize = `${font.size}px`;
      anchor.before(span);
      span.appendChild(anchor);
    }
    placeCaretAfter(anchor);
  }

  /** Whether the words here already stand in a font written on the line. */
  function inNoteFont(node) {
    for (let el = node.parentElement; el && el !== editor; el = el.parentElement) {
      if (el.style?.fontFamily) return true;
      if (/^(P|LI|H[1-6]|DIV|BLOCKQUOTE)$/.test(el.tagName)) return false;
    }
    return false;
  }

  /**
   * Links pasted in come back as Nebula's links. Chromium's copy of a few lines
   * of links kept only their href — no class, no new window — and they showed
   * as plain words in the ink's colour (1.0.0: "five links copied inside
   * Nebula, all in Nebula's format, came out not in it", the owner).
   */
  function dressPastedLinks() {
    for (const a of editor.querySelectorAll('a[href]:not([class])')) {
      if (!/^(https?:|mailto:)/i.test(a.getAttribute('href') || '')) continue;
      if (a.closest('.code-src, pre, .link-block, .note-mention')) continue;
      a.className = 'link-url';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  }
  editor.addEventListener('input', (e) => { if (e.inputType === 'insertFromPaste') dressPastedLinks(); });

  function insertBlockLink(url, kind, range) {
    const card = makeLinkBlock(url, kind);
    range.deleteContents();
    let block = directBlock(editor, range.startContainer);
    // One level under the note, or under the column it stands in (0.9.4), or
    // in the part of a toggle that folds (1.0.0: an embed or a bookmark made in
    // a toggle went out under the whole toggle, "not put in the toggle", the owner).
    const flow = (el) => el === editor || !!el?.classList.contains('blk-col') || !!el?.classList.contains('toggle-body');
    while (block && !flow(block.parentElement)) block = block.parentElement;
    if (block && flow(block.parentElement)) {
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
  /** Take a link card out of the note - its x, or the keyboard on a picked card. */
  function removeLinkCard(card) {
    if (!card || !editor.contains(card)) return;
    history?.push();
    // A file's card: the copy Open made of it goes now (undo brings the card back; Open copies again).
    if (card.classList.contains('link-attach')) void window.nebula?.media?.forgetFile?.(card.dataset.src)?.catch?.(() => {});
    card.remove();
    dirty();
  }

  editor.addEventListener('click', (event) => {
    const card = event.target.closest('[data-link-remove]')?.closest('.link-block');
    if (!card || !editor.contains(card)) return;
    event.preventDefault();
    removeLinkCard(card);
  });

  /**
   * A link card picked from the keyboard (nebula-pick-card, toolbar.js): it is
   * outlined, and the keys work on it - Enter does what a click on the card
   * does, Backspace or Delete takes it away by the same path as its x, any
   * other key lets go of it. A card could not be reached by Tab, which the
   * editor uses for indentation, so this is how the keyboard meets it.
   */
  let pickedCard = null;
  const unpickCard = () => { if (pickedCard) { pickedCard.classList.remove('sel'); pickedCard = null; } };
  editor.addEventListener('nebula-pick-card', (e) => {
    unpickCard();
    const card = e.detail;
    if (!card?.isConnected || !editor.contains(card) || !card.matches('.link-block')) return;
    pickedCard = card;
    card.classList.add('sel');
    editor.focus({ preventScroll: true });
  });
  editor.addEventListener('keydown', (e) => {
    if (!pickedCard) return;
    // The note changed under the pick: the card is gone with it, and the key
    // belongs to the note now open.
    if (!pickedCard.isConnected || !editor.contains(pickedCard)) { unpickCard(); return; }
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    const card = pickedCard;
    if (e.key === 'Enter') { e.preventDefault(); unpickCard(); card.querySelector('.link-card')?.click(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopImmediatePropagation(); unpickCard(); removeLinkCard(card); return; }
    unpickCard();
  });
  editor.addEventListener('mousedown', () => unpickCard(), true);

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
      // Where a picture in the text stands on its line (0.9.4): shown for those only.
      + '<span class="image-bar__sep" data-in-text></span>'
      + '<button type="button" data-image="left" data-in-text title="Picture at the left"><span data-icon="alignLeft"></span></button>'
      + '<button type="button" data-image="center" data-in-text title="Picture in the middle"><span data-icon="alignCenter"></span></button>'
      + '<button type="button" data-image="right" data-in-text title="Picture at the right"><span data-icon="alignRight"></span></button>'
      + '<button type="button" data-image="beside" data-in-text title="Beside the picture before it">▯▯</button>'
      // In a line of words, as a character of it (0.9.4): a word processor's "in line with text".
      + '<button type="button" data-image="inword" data-in-text title="In a line of words">a▫a</button>'
      + '<span class="image-bar__sep"></span>'
      + '<button type="button" data-image="caption" title="Add or edit a caption">Aa</button>'
      + '<button type="button" data-image="crop" title="Crop the picture">✂</button>'
      + '<button type="button" data-image="del" title="Delete image">✕</button>';
    injectIcons(bar);
    document.body.appendChild(bar);
    return bar;
  }

  const imageBar = ensureImageBar();
  const pictureDrag = createPictureDrag(editor);
  // ✂ on the bar (image-crop.js); the cropped picture comes back selected.
  const crop = initImageCrop(editor, { history, onDone: (figure) => { selectImage(figure); onGeometry?.(); } });

  function positionImageBar() {
    if (!selectedImage?.isConnected) { selectImage(null); return; }
    const rect = selectedImage.getBoundingClientRect();
    // While the picture is scrolled out of the note, its bar goes with it —
    // pinned to the edge of the window it sat over the text being read (the
    // owner's Bug Finding note, 0.9.2). The picture stays selected; the bar
    // comes back when the picture does.
    const view = editor.getBoundingClientRect();
    const out = rect.bottom < view.top || rect.top > view.bottom;
    imageBar.hidden = out;
    if (out) return;
    const width = imageBar.offsetWidth || 130;
    const height = imageBar.offsetHeight || 32;
    const top = rect.top - height - 8 >= view.top ? rect.top - height - 8 : rect.bottom + 8;
    imageBar.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    imageBar.style.top = `${Math.max(view.top + 4, Math.min(top, view.bottom - height - 4))}px`;
  }

  /** Which of the three placements an image has. */
  function placementOf(image) {
    if (image.classList.contains('note-image--inline')) return 'inline';
    return image.closest('.shape-layer--behind, .image-layer--behind') ? 'back' : 'front';
  }

  /**
   * A picture in the text let go (Esc, a click on its bar) while the caret
   * stood beside it on the editor itself: that caret was hidden only while the
   * picture was selected, and blinked between the divider and the picture the
   * moment it was not — "the divider still has a caret of its own" (the owner,
   * 0.9.3). It goes to the nearest line: the one after the picture, else the
   * one before, else the next or last line of the note.
   */
  const TEXT_LINE = 'p, div:not([class]), h1, h2, h3, h4, h5, h6, blockquote, ul, ol';
  function caretOffTheEditor(was) {
    if (!was?.isConnected || was.parentNode !== editor) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed || sel.anchorNode !== editor) return;
    const isLine = (n) => n?.nodeType === Node.ELEMENT_NODE && n.matches(TEXT_LINE);
    let target = null;
    let atEnd = false;
    if (isLine(was.nextElementSibling)) target = was.nextElementSibling;
    else if (isLine(was.previousElementSibling)) { target = was.previousElementSibling; atEnd = true; }
    else {
      for (let n = was.nextElementSibling; n && !target; n = n.nextElementSibling) if (isLine(n)) target = n;
      for (let n = was.previousElementSibling; n && !target; n = n.previousElementSibling) if (isLine(n)) { target = n; atEnd = true; }
    }
    if (!target) return;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    if (atEnd) for (let t = text; t; t = walker.nextNode()) text = t;
    const r = document.createRange();
    if (text) r.setStart(text, atEnd ? text.nodeValue.length : 0);
    else r.setStart(target, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /** The bar's second group: where a picture in the text stands, the current place lit. */
  function lightPlace() {
    const image = selectedImage;
    const inText = !!image && placementOf(image) === 'inline';
    for (const el of imageBar.querySelectorAll('[data-in-text]')) { el.hidden = !inText; if (!inText) el.classList.remove('on'); }
    // A picture in a line of words has no caption: it is a character of the line.
    const word = inText && inWord(image);
    imageBar.querySelector('[data-image="caption"]').disabled = word;
    if (!inText) return;
    const row = inRow(image);
    for (const name of ['left', 'center', 'right']) {
      imageBar.querySelector(`[data-image="${name}"]`).classList.toggle('on', !word && !row && alignOf(image) === name);
    }
    const beside = imageBar.querySelector('[data-image="beside"]');
    beside.classList.toggle('on', row);
    beside.disabled = word || (!row && !pictureBefore(image));
    imageBar.querySelector('[data-image="inword"]').classList.toggle('on', word);
  }

  /** A picture out of the note; the line of words it stood in alone is an empty line again. */
  function takeOut(image) {
    const line = inWord(image) ? image.parentElement : null;
    image.remove();
    if (line && !line.textContent.replace(/\u200b/g, '') && !line.firstElementChild) line.innerHTML = '<br>';
  }

  function selectImage(image) {
    const was = selectedImage;
    editor.querySelectorAll('.note-image.sel').forEach((node) => node.classList.remove('sel'));
    selectedImage = image || null;
    if (was && !selectedImage) caretOffTheEditor(was);
    selectedImage?.classList.add('sel');
    imageBar.hidden = !selectedImage;
    if (selectedImage) {
      editor.dispatchEvent(new CustomEvent('nebula-canvas-select', { detail: 'image' }));
      const place = placementOf(selectedImage);
      for (const b of imageBar.querySelectorAll('[data-image="back"], [data-image="front"], [data-image="inline"]')) {
        b.classList.toggle('on', b.dataset.image === place);
      }
      lightPlace();
      // A widget is drawn, not a photo: there is nothing to crop.
      const cropButton = imageBar.querySelector('[data-image="crop"]');
      if (cropButton) cropButton.hidden = isWidget(selectedImage);
      // A picture just selected is one the owner wants to see — one pasted at
      // the end of a long note is still below the view — so it comes into view
      // with its bar. Only scrolling away from it afterwards hides the bar.
      const rect = selectedImage.getBoundingClientRect();
      const view = editor.getBoundingClientRect();
      if (rect.bottom < view.top || rect.top > view.bottom) selectedImage.scrollIntoView({ block: 'nearest' });
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
        if (url) {
          const next = makeLinkBlock(url, card.dataset.kind === 'embed' ? 'embed' : 'bookmark');
          if (card.dataset.anchor) next.dataset.anchor = card.dataset.anchor;
          card.replaceWith(next);
        }
      }
    }
    for (const card of editor.querySelectorAll('.link-block')) watchTitle(card);
    // An embed is resized from its four sides and corners (0.9.3); the handles
    // are controls drawn into the note, so every embed gets them here, old ones
    // too (trap 47).
    for (const card of editor.querySelectorAll('.link-block.link-embed')) ensureEmbedHandles(card);
    for (const image of editor.querySelectorAll('.note-image')) {
      image.setAttribute('contenteditable', 'false');
      ensureImageHandles(image);
      const img = image.querySelector('img');
      if (img) img.draggable = false;
      captionOf(image); // a saved caption is editable again
      if (isWidget(image)) renderWidget(image);
    }
    // A row whose other picture was deleted, cut or undone away is no row.
    tidyRows(editor);
    refreshVideoBlocks(editor);
    refreshAttachBlocks(editor);
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
      // A pasted picture's place is used once: kept, it sent the next widget
      // or picture back to this line (owner, 1.0.0).
      if (linkMenu.hidden) pendingRange = null;
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
    // In a column the picture stays in the column (0.9.4); in a toggle's body it
    // stays in the body, where the fold can hide it — what is put in with
    // the caret in the body used to land after the whole toggle, visible folded.
    const staysIn = (el) => el.classList?.contains('blk-col') || el.classList?.contains('toggle-body');
    while (el.parentElement && el.parentElement !== editor && !staysIn(el.parentElement)) el = el.parentElement;
    if (el.matches('.blk-col, .blk-cols')) return null;
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
    if (floating === !inline) return image;
    const rect = image.getBoundingClientRect();
    if (floating) {
      // Out of its line of words first: only a figure floats.
      if (inWord(image)) image = leaveLine(image);
      const layer = ensureLayer(editor);
      const origin = layer.getBoundingClientRect();
      const pictureHeight = image.querySelector('img')?.getBoundingClientRect().height || rect.height;
      const z = editorZoom(editor);
      const flow = image.parentElement;
      image.classList.remove('note-image--inline', 'note-image--center', 'note-image--right', 'note-image--row');
      image.style.removeProperty('--row');
      image.style.removeProperty('--beside');
      image.style.left = `${Math.round((rect.left - origin.left) / z)}px`;
      image.style.top = `${Math.round((rect.top - origin.top) / z)}px`;
      image.style.height = `${Math.round(pictureHeight / z)}px`;
      layer.appendChild(image);
      tidyRows(flow);
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
    return image;
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
    } finally {
      if (linkMenu.hidden) pendingRange = null;
    }
  }

  editor.addEventListener('mousedown', (event) => {
    if (editor.dataset.readonly === 'true') return;
    if (event.target.closest('.image-caption')) { selectImage(null); return; }
    // A drag on a live Universe map pans the map; it never picks the widget up.
    if (event.target.closest('.wg-live')) return;
    // A widget's key or day is pressed, not the widget dragged: it is selected
    // (so the keyboard goes to it) and the click does the rest (widgets.js).
    const widgetKey = event.target.closest('.note-widget [data-k], .note-widget [data-day]');
    if (widgetKey) {
      claimed.add(event);
      const widget = widgetKey.closest('.note-widget');
      if (selectedImage !== widget) selectImage(widget);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
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
      corner: handle?.dataset.corner || 'se',
      moved: false,
      downX: event.clientX,
      downY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      left: parseFloat(image.style.left) || 0,
      top: parseFloat(image.style.top) || 0,
      // A picture in the text is resized from the width it is drawn at, which a
      // narrow page, a column or a row may have made less than the width it was
      // given: starting from the given one, the first part of every pull did
      // nothing ("a bug in making pictures bigger and smaller", the owner, 0.9.4).
      width: (image.classList.contains('note-image--inline') && parseFloat(getComputedStyle(image).width))
        || parseFloat(image.style.width) || image.offsetWidth,
      height: parseFloat(image.style.height) || image.offsetHeight,
      ratio: Number(image.dataset.ratio) || image.offsetWidth / Math.max(1, image.offsetHeight),
    };
  }, true);

  window.addEventListener('mousemove', (event) => {
    if (!drag) return;
    // On the page, not on the screen: the page may be zoomed (page-zoom.js).
    const z = editorZoom(editor);
    const dx = (event.clientX - drag.startX) / z;
    const dy = (event.clientY - drag.startY) / z;
    if (Math.abs(event.clientX - drag.downX) > 2 || Math.abs(event.clientY - drag.downY) > 2) drag.moved = true;
    if (!drag.moved) return;
    const inText = drag.image.classList.contains('note-image--inline');
    if (inText && drag.kind === 'move') {
      // It sits in the text: the drag says where in the text (image-place.js),
      // and nothing moves but its alignment until the button is let go.
      editor.classList.add('image-dragging');
      drag.target = pictureDrag.over(drag.image, event.clientX, event.clientY, event.clientX - drag.downX);
      lightPlace();
      positionImageBar();
      return;
    }
    if (!inText) drag.layer.style.minHeight = `${drag.extent}px`;
    editor.classList.add('image-dragging');
    if (drag.kind === 'move') {
      drag.image.style.left = `${Math.max(0, drag.left + dx)}px`;
      drag.image.style.top = `${Math.max(0, drag.top + dy)}px`;
    } else {
      // In the middle of its line it grows to both sides, so the corner keeps
      // up with the pointer only at twice the pull.
      const centred = inText && !inRow(drag.image) && alignOf(drag.image) === 'center';
      const box = resizeImageBox(drag, centred ? dx * 2 : dx, dy, drag.corner, inText);
      drag.image.style.width = Math.round(box.width) + 'px';
      if (inText) {
        // Never given more than can be drawn: the rest would have to be pulled back before it got smaller.
        const drawn = parseFloat(getComputedStyle(drag.image).width);
        if (drawn && drawn < Math.round(box.width) - 0.5) drag.image.style.width = `${Math.floor(drawn)}px`;
        // The pictures beside it are told what it takes now: the room is theirs or its.
        if (inRow(drag.image)) tidyRows(drag.image.parentElement);
      }
      if (!inText) {
        drag.image.style.height = Math.round(box.height) + 'px';
        drag.image.style.left = Math.round(box.left) + 'px';
        drag.image.style.top = Math.round(box.top) + 'px';
      }
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
    const inText = drag.kind === 'move' && drag.image.classList.contains('note-image--inline');
    if (inText) {
      // Let go: the picture goes where the mark stood. Nothing changed, nothing saved.
      const image = drag.image;
      const changed = pictureDrag.drop(image, drag.cancelled ? null : drag.target);
      drag = null;
      if (changed) {
        if (image.isConnected) selectImage(image);
        onGeometry?.();
        dirty();
      } else lightPlace();
      return;
    }
    if (drag.moved) { onGeometry?.(); dirty(); }
    drag = null;
  }
  // Esc while a picture in the text is dragged: it stays where it was.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !drag || drag.kind !== 'move' || !drag.image.classList.contains('note-image--inline')) return;
    event.preventDefault();
    event.stopPropagation();
    pictureDrag.cancel(drag.image);
    drag.cancelled = true;
    drag.target = null;
    finishDrag();
  }, true);
  editor.addEventListener('nebula-canvas-select', (e) => { if (e.detail !== 'image' && selectedImage) selectImage(null); });
  /**
   * A picture onto the clipboard as a picture (0.9.3). "I cannot copy pictures
   * out of Nebula" (the owner's Ideas note): Ctrl+C with a picture selected
   * copied nothing, since a selected picture is not a text selection. It goes
   * as a PNG, which every program takes, through the main process.
   */
  async function copyImage(figure) {
    // A widget is copied as the note's own markup, by the note's copy (it has no picture to send).
    if (isWidget(figure)) {
      const range = document.createRange();
      range.selectNode(figure);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
      const ok = document.execCommand('copy');
      s.removeAllRanges();
      return ok;
    }
    const img = figure?.querySelector('img');
    if (!img) return false;
    const src = img.getAttribute('src') || '';
    // A picture shown from its file (0.9.4): the main process reads the file itself.
    if (isMediaUrl(src) && window.nebula?.clipboard?.image) {
      let done = false;
      try { done = await window.nebula.clipboard.image({ url: src, html: `<img src="${src.replace(/"/g, '&quot;')}" alt="">` }); } catch { done = false; }
      window.dispatchEvent(new CustomEvent('nebula-toast', { detail: done ? 'Picture copied' : 'The picture could not be copied' }));
      return done;
    }
    let dataUrl = src;
    if (!/^data:image\/png[;,]/i.test(src)) {
      try {
        if (!img.complete) await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        dataUrl = canvas.toDataURL('image/png');
      } catch { /* a picture that cannot be drawn is sent as it is */ }
    }
    let ok = false;
    try {
      if (window.nebula?.clipboard?.image) {
        ok = await window.nebula.clipboard.image({ dataUrl, html: `<img src="${src.replace(/"/g, '&quot;')}" alt="">` });
      } else if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
        ok = true;
      }
    } catch { ok = false; }
    window.dispatchEvent(new CustomEvent('nebula-toast', { detail: ok ? 'Picture copied' : 'The picture could not be copied' }));
    return ok;
  }

  function deleteImage(figure) {
    if (!figure?.isConnected) return;
    history?.push();
    if (selectedImage === figure) selectImage(null);
    takeOut(figure);
    dirty();
  }

  // A double click on a picture opens its caption (0.9.3): "double-click the
  // picture and the note under it should open, quickly" (the owner).
  editor.addEventListener('dblclick', (event) => {
    if (editor.dataset.readonly === 'true') return;
    const figure = event.target.closest?.('.note-image');
    if (!figure || inWord(figure) || isWidget(figure) || event.target.closest('.image-caption')) return;
    event.preventDefault();
    editCaption(figure);
  });

  /**
   * An embed resized by its corner, like a picture (0.9.3, the owner's Ideas
   * note). Width and height are kept on the card (`width`, `--embed-h`); a
   * video keeps its shape, so only its width changes.
   */
  let embedDrag = null;
  editor.addEventListener('mousedown', (event) => {
    const grip = event.target.closest?.('.embed-h');
    if (!grip || event.button !== 0 || editor.dataset.readonly === 'true') return;
    const card = grip.closest('.link-block');
    event.preventDefault();
    event.stopPropagation();
    history?.push();
    const frame = card.querySelector('.link-frame');
    embedDrag = {
      card,
      x: event.clientX,
      y: event.clientY,
      width: card.getBoundingClientRect().width / editorZoom(editor),
      height: (frame?.getBoundingClientRect().height || 300 * editorZoom(editor)) / editorZoom(editor),
      video: card.classList.contains('link-embed--video') || card.classList.contains('link-file'),   // a video keeps its shape: only its width changes
      max: editor.clientWidth - 24,
      edge: grip.dataset.edge,
    };
    document.body.classList.add('resizing');
  }, true);
  window.addEventListener('mousemove', (event) => {
    if (!embedDrag) return;
    const d = embedDrag;
    const z = editorZoom(editor);
    const dx = (event.clientX - d.x) / z;
    const dy = (event.clientY - d.y) / z;
    // A side moves the way it is pulled: outward grows the embed, inward shrinks it.
    if (/[ew]/.test(d.edge)) {
      const w = d.width + (d.edge.includes('w') ? -dx : dx);
      d.card.style.width = `${Math.round(Math.min(d.max, Math.max(260, w)))}px`;
    }
    if (/[ns]/.test(d.edge) && !d.video) {
      const h = d.height + (d.edge.includes('n') ? -dy : dy);
      d.card.style.setProperty('--embed-h', `${Math.round(Math.min(1400, Math.max(120, h)))}px`);
    }
    onGeometry?.();
  });
  window.addEventListener('mouseup', () => {
    if (!embedDrag) return;
    embedDrag = null;
    document.body.classList.remove('resizing');
    dirty();
  });

  // A picture in the text stays selected only while the caret stands beside
  // it, on the editor itself. ↑ from it put the caret in the heading while the
  // picture stayed outlined — and the caret, hidden while a picture is
  // selected, could not be seen there (0.9.3).
  // Only a caret the arrow keys moved counts: a paste or a click selects a
  // picture while the caret stays in its line, and that is as it should be.
  let arrowedFrom = null;
  editor.addEventListener('keydown', (e) => {
    arrowedFrom = selectedImage && !e.altKey && /^(Arrow(Up|Down|Left|Right)|Home|End|Page(Up|Down))$/.test(e.key) ? selectedImage : null;
  }, true);
  document.addEventListener('selectionchange', () => {
    const was = arrowedFrom;
    arrowedFrom = null;
    if (!was || was !== selectedImage || was.closest('.shape-layer, .image-layer')) return;
    const s = window.getSelection();
    const n = s?.rangeCount ? s.anchorNode : null;
    if (!n || n === editor || !editor.contains(n) || was.contains(n)) return;
    selectImage(null);
  });

  // Reached from the keyboard: Backspace or Delete against a picture in the text (toolbar.js).
  editor.addEventListener('nebula-select-image', (e) => {
    if (e.detail?.isConnected && editor.contains(e.detail)) selectImage(e.detail);
  });
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
    if (act === 'caption') { if (!inWord(selectedImage)) editCaption(selectedImage); return; }
    if (act === 'crop') { const figure = selectedImage; selectImage(null); crop.start(figure); return; }
    if (act === 'left' || act === 'center' || act === 'right' || act === 'beside') {
      let figure = selectedImage;
      if (placementOf(figure) !== 'inline' || (act === 'beside' && inWord(figure))) return;
      history?.push();
      // Out of its line of words, onto a line of its own, where it has a side.
      if (inWord(figure)) { figure = leaveLine(figure); refreshImages(); }
      if (act !== 'beside') setAlign(figure, act);
      else if (inRow(figure)) leaveRow(figure);
      else if (pictureBefore(figure)) putBeside(figure, pictureBefore(figure), 'after');
      selectImage(figure);
      onGeometry?.();
      dirty();
      return;
    }
    if (act === 'inword') {
      // Into the line of words beside it, or out of it again.
      if (placementOf(selectedImage) !== 'inline') return;
      history?.push();
      const next = inWord(selectedImage) ? leaveLine(selectedImage) : putInLine(selectedImage);
      refreshImages();
      selectImage(next);
      onGeometry?.();
      dirty();
      return;
    }
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
      selectedImage = setImageFloating(selectedImage, true);
    }
    if (act === 'del') {
      history?.push();
      takeOut(selectedImage);
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
    // A picture that is no longer in the note (an undo put the markup back)
    // is not selected any more: it swallowed the next Delete and Backspace.
    if (selectedImage && !selectedImage.isConnected) selectImage(null);
    // A picture in the text, selected (0.9.3): Enter opens a line under it,
    // Shift+Enter one over it, and Alt+↑ / Alt+↓ move it past the line above
    // or below — a picture has no caret of its own to type around it with.
    const inTextPicture = selectedImage?.classList.contains('note-image--inline') && editor.dataset.readonly !== 'true'
      && !event.target.closest?.('input, textarea, .code-src, .shape-text, .image-caption, .blk-table');
    // In a line of words it is a character: Enter lets go of it with the caret
    // right after it (Shift: right before), and the line goes on being typed.
    if (inTextPicture && inWord(selectedImage) && event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      const picture = selectedImage;
      selectImage(null);
      const r = document.createRange();
      if (event.shiftKey) r.setStartBefore(picture); else r.setStartAfter(picture);
      r.collapse(true);
      editor.focus({ preventScroll: true });
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(r);
      return;
    }
    if (inTextPicture && event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      history?.push();
      const figure = selectedImage;
      const line = document.createElement('p');
      line.innerHTML = '<br>';
      if (event.shiftKey) figure.before(line); else figure.after(line);
      selectImage(null);
      placeCaretIn(line);
      dirty();
      return;
    }
    if (inTextPicture && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      const figure = selectedImage;
      if (inWord(figure)) return;                 // it moves with its line, not past lines
      const skip = (el) => el && el.matches('.shape-layer, .image-layer');
      let other = event.key === 'ArrowUp' ? figure.previousElementSibling : figure.nextElementSibling;
      if (skip(other)) other = null;
      if (!other) return;
      history?.push();
      if (event.key === 'ArrowUp') other.before(figure); else other.after(figure);
      selectImage(figure);
      onGeometry?.();
      dirty();
      return;
    }
    // Ctrl+C and Ctrl+X with a picture selected copy the picture itself (0.9.3).
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'c' || key === 'x') && !event.shiftKey && !event.altKey
      && selectedImage && !event.target.closest?.('input, textarea, .code-src, .shape-text, .image-caption, .blk-table')) {
      event.preventDefault();
      event.stopPropagation();
      const figure = selectedImage;
      void copyImage(figure).then((ok) => { if (ok && key === 'x' && editor.dataset.readonly !== 'true') deleteImage(figure); });
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedImage
      && !event.target.closest('input, textarea, .code-src, .shape-text, .image-caption, .blk-table')) {
      event.preventDefault();
      event.stopPropagation();
      history?.push();
      // An image in the text leaves the caret where the image was: at the end
      // of the line it went under. The caret stayed wherever the click had
      // left it, and the next word typed landed at the end of the note
      // (long-note trials, 0.8.9).
      const inText = selectedImage.classList.contains('note-image--inline');
      if (inWord(selectedImage)) {
        // A character of its line: the caret stays where it stood.
        const picture = selectedImage;
        const r = document.createRange();
        r.setStartBefore(picture);
        r.collapse(true);
        selectImage(null);
        takeOut(picture);
        editor.focus({ preventScroll: true });
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(r);
        dirty();
        return;
      }
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

  /**
   * How the next paste is taken (0.9.4, the right-click menu's two ways — there
   * were three; the owner: "take the option Paste only text away, for now"):
   *   nebula    as Ctrl+V: the words and their structure in the note's own dress
   *   original  the same, and the SIZE the words were copied in (paste-clean.js);
   *             the font, the colour and the ground are the note's
   * Set by paste() just before the main process makes the paste, and used once.
   */
  let pasteMode = 'nebula';
  let pasteModeTimer = 0;

  editor.addEventListener('paste', (event) => {
    const mode = pasteMode;
    pasteMode = 'nebula';
    // A caption is one line of words in the caption's own look (0.9.5). Left to
    // the browser, words copied from another page came in that page's colour,
    // size and background — and stayed so: "I copied into the caption from
    // another format" (the owner's Ideas note).
    const caption = event.target.closest?.('.image-caption');
    if (caption) {
      event.preventDefault();
      const words = (event.clipboardData?.getData('text/plain') || '').replace(/\s*[\r\n]+\s*/g, ' ');
      const selection = window.getSelection();
      const at = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!words.trim() || !at || !caption.contains(at.commonAncestorContainer)) return;
      history?.push();
      // Put in as a text node: insertText wrote the look of the words it
      // replaced (their highlight, the theme's ink) into the new ones.
      at.deleteContents();
      const text = document.createTextNode(words);
      at.insertNode(text);
      for (const el of caption.querySelectorAll('span, font, b, i, u, s, em, strong')) if (!el.textContent) el.remove();
      at.setStartAfter(text);
      at.collapse(true);
      selection.removeAllRanges();
      selection.addRange(at);
      caption.normalize();
      dirty();
      return;
    }
    if (event.target.closest('.code-src, .shape-text, .link-block, .note-image')) return;
    // Files copied in Explorer or Finder (1.0.0): a video, or any file that is
    // not a picture, goes in as it does when it is dropped — "a video cannot be
    // pasted, only dropped" (Log, 0.9.4). Pictures keep the picture's way below.
    const files = [...(event.clipboardData?.files || [])];
    const kind = dropKind(files, { isImage: (f) => isImageMime(f.type), isVideo: isVideoFile });
    if ((kind === 'attach' || kind === 'video') && !event.target.closest?.('.blk-table td')) {
      event.preventDefault();
      if (editor.dataset.readonly === 'true') return;
      const at = currentRange(editor);
      if (kind === 'attach' && window.nebula?.media?.addFile) void insertAttachFiles(files, at);
      else if (kind === 'video' && window.nebula?.media?.addVideo) void insertVideoFile(files.find(isVideoFile), at);
      return;
    }
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
      return;
    }
    // Words from another page arrive in that page's font, size and colour;
    // they take the note's own now (paste-clean.js, 0.9.2).
    // A copy from a note keeps Nebula's classes and blocks and loses only the
    // colour, font and scrollbar Chromium wrote into it when it copied.
    const html = event.clipboardData?.getData('text/html') || '';
    if (!html) return;
    const ours = fromNebula(html);
    // "Paste original format" keeps the size the words were copied in, beside
    // what every paste keeps (bold, italic, underline, lists, links).
    let clean = ours ? cleanNebulaHtml(html) : cleanPastedHtml(html, { keepSize: mode === 'original' });
    // A toggle with what folds away, or columns, from a note (1.0.0): the
    // browser's paste merged the first and last block into the caret's line —
    // the toggle's title came out as a plain line, its body beside it ("I have
    // to make a toggle, copy the title, then copy the text", the owner). They
    // go in whole, between the two halves of the line.
    if (ours && clean && holdsStructure(clean) && !event.target.closest?.('.blk-table td')) {
      const at = currentRange(editor);
      if (at) {
        event.preventDefault();
        history?.push();
        const last = insertBlocks(editor, clean, at);
        if (last) caretAfter(last);
        dirty();
        onGeometry?.();
        void adoptPastedCards();
        return;
      }
    }
    if (!clean || (ours && !/style=|data-font-family/.test(html))) return;
    // In a note with a writing font the pasted lines are written in it, as
    // typed ones are (0.9.4); a font that came along from another note stays.
    const font = noteFont?.();
    if (font && (font.family || font.size)) {
      const at = currentRange(editor);
      const line = at?.collapsed ? lineOf(at.startContainer) : null;
      const onEmptyLine = !!line && line !== editor && !line.textContent.replace(/​/g, '').trim();
      clean = dressInNoteFont(clean, font, { loose: onEmptyLine });
    }
    event.preventDefault();
    history?.push();
    // insertHTML writes the theme's ink onto what it inserts; it comes off again.
    const had = new Set(editor.querySelectorAll('[style*="color"]'));
    document.execCommand('insertHTML', false, clean);
    undressInserted(editor, had);
    dressPastedLinks();
    dirty();
    // A pasted file card names another note's file: the file is copied in here at once.
    void adoptPastedCards();
  });

  /**
   * Words copied with pictures among them (0.9.4): the note shows a picture
   * from its file, under an address only Nebula knows. For another program
   * the copy holds the pictures themselves; the words go as they are.
   */
  editor.addEventListener('copy', (event) => {
    const range = currentRange(editor);
    if (!range || range.collapsed || !event.clipboardData || !window.nebula?.media?.inlineSync) return;
    if (event.target.closest?.('.code-src, .shape-text')) return;
    const holder = document.createElement('div');
    holder.append(range.cloneContents());
    if (!holder.querySelector('img[src^="nebula-media://note/"]')) return;
    let html = holder.innerHTML;
    try { html = window.nebula.media.inlineSync(html); } catch { return; }
    event.clipboardData.setData('text/html', html);
    event.clipboardData.setData('text/plain', window.getSelection().toString());
    event.preventDefault();
  });

  /**
   * Files dragged over the note from the computer (1.0.0): the mark shows the
   * place between two blocks where a file or a video will stand — the same
   * mark as a block's drag. "The mark that comes up while files are dragged
   * does not work properly" (the owner): there was none of the note's own, only
   * the browser's caret, and the card went after the line the caret was in.
   * Pictures float where they are let go, and get no mark.
   */
  const filesOnly = (dt) => [...(dt?.types || [])].includes('Files');
  const allPictures = (dt) => {
    const files = [...(dt?.items || [])].filter((item) => item.kind === 'file');
    return files.length > 0 && files.every((item) => isImageMime(item.type));
  };
  let fileGap = null;
  const forgetGap = () => { if (fileGap) hideDropMark(); fileGap = null; };
  editor.addEventListener('dragover', (event) => {
    const types = [...(event.dataTransfer?.types || [])];
    if (types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain')) event.preventDefault();
    if (!filesOnly(event.dataTransfer) || editor.dataset.readonly === 'true' || allPictures(event.dataTransfer)) { forgetGap(); return; }
    fileGap = dropTarget(editor, null, event.clientX, event.clientY, { sides: false });
    if (fileGap) showDropMark(fileGap.line); else hideDropMark();
  });
  editor.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget || !editor.contains(event.relatedTarget)) forgetGap();
  });
  window.addEventListener('dragend', forgetGap);

  /** Cards to the gap the mark showed; false when that gap is gone by now. */
  function putAtGap(gap, cards) {
    const parent = gap?.parent;
    if (!parent?.isConnected || !editor.contains(parent)) return false;
    const ref = gap.ref?.parentNode === parent ? gap.ref : null;
    for (const card of cards) parent.insertBefore(card, ref);
    return true;
  }
  /**
   * A video file dropped on the note (0.9.4): the main process copies it into
   * the note's own folder, and the note shows it from there (file-video.js).
   * It stands after the line it was dropped on.
   */
  const say = (text) => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: text }));
  async function insertVideoFile(file, range, gap = null) {
    const id = noteId?.();
    // A file dropped on the note, or the path of one chosen from the computer (/video).
    const source = typeof file === 'string' ? file : (window.nebula?.media?.pathOf?.(file) || '');
    if (!id || !source) { say('The video could not be added'); return null; }
    const started = generation;
    say('Copying the video into the note…');
    let res = null;
    // In a black hole the video is sealed beside its note; anywhere else it is a file in the note's folder.
    const hole = noteHole?.() ?? null;
    try { res = hole ? await window.nebula.holes.addVideo(hole, id, source) : await window.nebula.media.addVideo(id, source); } catch { res = null; }
    // Another note is open by now: the copy is nobody's, and goes at the next start.
    if (started !== generation || noteId?.() !== id) { leftBehind(id, hole, res); if (res?.ok) say('The video could not be added'); return null; }
    if (!res?.ok) { say('The video could not be added'); return null; }
    history?.push();
    const card = makeVideoBlock(res.url, res.name);
    ensureEmbedHandles(card);
    if (!putAtGap(gap, [card])) {
      const block = topBlockOf(range?.startContainer && editor.contains(range.startContainer) ? range : currentRange(editor));
      const empty = block && !block.textContent.trim() && !block.querySelector('img, hr, .link-block, .note-image, .blk-code, .inline-eq');
      if (block && empty) block.replaceWith(card);
      else if (block) block.after(card);
      else editor.append(card);
    }
    let next = card.nextElementSibling;
    if (!next || next.matches('.note-image, .link-block, hr, .blk-code')) {
      next = document.createElement('p');
      next.innerHTML = '<br>';
      card.after(next);
    }
    placeCaretIn(next);
    refreshVideoBlocks(editor);
    onGeometry?.();
    dirty();
    say('Video added');
    return card;
  }

  /** /video: a video file chosen from the computer goes in where the caret was. */
  async function pickVideo() {
    if (editor.dataset.readonly === 'true' || !window.nebula?.media?.pickVideo) return null;
    const at = currentRange(editor);
    let res = null;
    try { res = await window.nebula.media.pickVideo(); } catch { res = null; }
    if (!res?.ok || !res.path) return null;
    return insertVideoFile(res.path, at);
  }
  initVideoPlayers(editor);

  /**
   * Files attached to the note (0.9.6, file-attach.js): each is copied into the
   * note's folder — sealed beside it in a black hole — and stands as a card,
   * one after another, after the line they were dropped on.
   * @param {Array<File|string>} files dropped files, or paths chosen with /file
   */
  /**
   * A copy made for a note the window has left meanwhile: no write ever named
   * it, so the next start asked about "pictures no longer shown" (hunt B18).
   * Released, it goes then without a question. (A black hole keeps its own.)
   */
  function leftBehind(id, hole, res) {
    if (hole || !res?.ok || !res.url) return;
    window.nebula?.media?.releaseAdded?.(id, res.url)?.catch?.(() => {});
  }

  async function insertAttachFiles(files, range, gap = null) {
    const id = noteId?.();
    const sources = [...(files ?? [])].map((file) => ({
      path: typeof file === 'string' ? file : (window.nebula?.media?.pathOf?.(file) || ''),
      name: typeof file === 'string' ? file.split(/[\\/]/).pop() : file.name,
    }));
    if (!id || !sources.length || sources.some((s) => !s.path)) { say('The file could not be added'); return []; }
    const started = generation;
    say(sources.length > 1 ? 'Copying the files into the note…' : 'Copying the file into the note…');
    const hole = noteHole?.() ?? null;
    const added = [];
    let failed = 0;
    for (const source of sources) {
      let res = null;
      try { res = hole ? await window.nebula.holes.addFile(hole, id, source.path) : await window.nebula.media.addFile(id, source.path); } catch { res = null; }
      // Another note is open by now: what was copied is nobody's, and goes at the next start.
      if (started !== generation || noteId?.() !== id) {
        for (const done of [...added, res]) leftBehind(id, hole, done);
        say(sources.length > 1 ? 'The files could not be added' : 'The file could not be added');
        return [];
      }
      if (res?.ok) added.push(res); else failed += 1;
    }
    if (!added.length) { say(failed > 1 ? 'The files could not be added' : 'The file could not be added'); return []; }
    history?.push();
    const block = topBlockOf(range?.startContainer && editor.contains(range.startContainer) ? range : currentRange(editor));
    const empty = block && !block.textContent.trim() && !block.querySelector('img, hr, .link-block, .note-image, .blk-code, .inline-eq');
    const cards = added.map((res) => makeAttachBlock(res.url, res.name, res.size));
    let last = putAtGap(gap, cards) ? cards.at(-1) : null;
    for (const card of last ? [] : cards) {
      if (last) last.after(card);
      else if (block && empty) block.replaceWith(card);
      else if (block) block.after(card);
      else editor.append(card);
      last = card;
    }
    let next = last.nextElementSibling;
    if (!next || next.matches('.note-image, .link-block, hr, .blk-code')) {
      next = document.createElement('p');
      next.innerHTML = '<br>';
      last.after(next);
    }
    placeCaretIn(next);
    refreshAttachBlocks(editor);
    onGeometry?.();
    dirty();
    say(failed ? 'Some files could not be added' : (cards.length > 1 ? 'Files added' : 'File added'));
    return cards;
  }

  /** A card already being adopted — two quick pastes must not copy one file twice. */
  const adopting = new WeakSet();

  /**
   * A file card pasted from another note still names that note's file. The
   * save's rehome copies the file and rewrites the stored text, but the live
   * card is never told — its click is refused ("The file is not in this note")
   * until a restart. Instead the file is copied into this note at once and the
   * card is given this note's own address; a card whose source is gone (or its
   * black hole is locked) keeps what it has, and its click says what is wrong.
   */
  async function adoptPastedCards() {
    const id = noteId?.();
    const adopt = window.nebula?.media?.adoptFile;
    if (!id || !adopt) return;
    const hole = noteHole?.() ?? null;
    const started = generation;
    for (const card of [...editor.querySelectorAll('.link-attach')]) {
      const src = card.dataset.src || '';
      if (!isAttachUrl(src) || ownsAttachUrl(src, { id, hole }) || adopting.has(card)) continue;
      adopting.add(card);
      let res = null;
      try { res = await adopt(id, hole, src); } catch { res = null; } finally { adopting.delete(card); }
      // Another note is open by now: the copies already made are nobody's, and go at the next start.
      if (started !== generation || noteId?.() !== id) { leftBehind(id, hole, res); return; }
      if (res?.ok) {
        card.dataset.src = res.url;
        refreshAttachBlocks(editor);
        dirty();
      }
    }
  }

  /** /file: files chosen from the computer go in where the caret was. */
  async function pickFiles() {
    if (editor.dataset.readonly === 'true' || !window.nebula?.media?.pickFiles) return [];
    const at = currentRange(editor);
    let res = null;
    try { res = await window.nebula.media.pickFiles(); } catch { res = null; }
    if (!res?.ok || !res.paths?.length) return [];
    return insertAttachFiles(res.paths, at);
  }
  initAttachCards(editor, { say, owner: () => ({ id: noteId?.() ?? null, hole: noteHole?.() ?? null }) });

  editor.addEventListener('drop', (event) => {
    // Where the mark stood, worked out again at the very place it was let go.
    const gap = filesOnly(event.dataTransfer) ? dropTarget(editor, null, event.clientX, event.clientY, { sides: false }) : null;
    forgetGap();
    const dropped = [...(event.dataTransfer?.files || [])];
    // Anything that is neither a picture nor a video among them: every file is attached (0.9.6).
    if (dropKind(dropped, { isImage: (f) => isImageMime(f.type), isVideo: isVideoFile }) === 'attach') {
      event.preventDefault();
      if (window.nebula?.media?.addFile && editor.dataset.readonly !== 'true') {
        void insertAttachFiles(dropped, document.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null, gap);
      }
      return;
    }
    const video = dropped.find(isVideoFile);
    if (video && window.nebula?.media?.addVideo && editor.dataset.readonly !== 'true') {
      event.preventDefault();
      void insertVideoFile(video, document.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null, gap);
      return;
    }
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

  /**
   * Paste from a button or a menu.
   * @param {'nebula'|'original'|'text'} [mode]
   * @param {Range|null} [at] where the caret was when the menu opened
   */
  async function paste(mode = 'nebula', at = null) {
    const savedRange = at ?? currentRange(editor);
    const started = generation;
    // In the app the main process makes a real paste at the caret, and the
    // handler above takes it exactly as it takes Ctrl+V. Reading the clipboard
    // from the page is refused there, so the menu's Paste did nothing (0.9.4).
    if (window.nebula?.edit?.paste) {
      if (!restoreRange(editor, savedRange)) editor.focus({ preventScroll: true });
      // A caret in a code block, a shape's words, a caption or a table's cell:
      // the paste goes to that field, which editor.focus() has just taken the
      // focus from.
      const start = savedRange?.startContainer;
      const host = (start?.nodeType === Node.ELEMENT_NODE ? start : start?.parentElement)
        ?.closest?.('.code-src, .shape-text, .image-caption, .blk-table td');
      if (host && editor.contains(host)) {
        host.focus({ preventScroll: true });
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedRange);
      }
      // A table's cell takes words whatever was asked for, and its paste never
      // reaches the handler that would use the mode up: left set, the next
      // Ctrl+V on a line was pasted in it (table.js).
      pasteMode = host?.matches?.('td') ? 'nebula' : mode;
      clearTimeout(pasteModeTimer);
      pasteModeTimer = setTimeout(() => { pasteMode = 'nebula'; }, 1500);
      try { await window.nebula.edit.paste('rich'); } catch { pasteMode = 'nebula'; }
      return;
    }
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

  /** A widget (1.0.0) into the text where the caret is, selected like a pasted picture. */
  function insertWidget(kind) {
    if (editor.dataset.readonly === 'true') return null;
    const widget = makeWidget(kind);
    if (!widget) return null;
    history?.push();
    ensureImageHandles(widget);
    // Where the caret is now: /widget put it back on its line.
    placeInText(widget, currentRange(editor));
    refreshImages();
    selectImage(widget);
    dirty();
    return widget;
  }
  initWidgets(editor, { history, selected: () => (isWidget(selectedImage) ? selectedImage : null) });

  refreshImages();

  return {
    open,
    insertWidget,
    paste,
    refresh: refreshImages,
    insertVideoFile,
    pickVideo,
    insertAttachFiles,
    pickFiles,
    reset: () => { generation += 1; drag = null; editor.classList.remove('image-dragging'); selectImage(null); hideLinkMenu(); crop.cancel(); embedDrag = null; },
    insertImageBlob,
    copyImage,
    deleteImage,
    editCaption,
    selectImage,
  };
}import { ensureLayer as ensureCanvas } from './shapes.js';
import { initImageCrop } from './image-crop.js';
import { makeWidget, isWidget, renderWidget, initWidgets } from './widgets.js';

