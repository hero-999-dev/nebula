/**
 * Rich paste and floating images.
 *
 * A URL pasted into a note is deliberately not fetched here. Fetching arbitrary
 * pages from the renderer makes a note a tiny browser and turns an innocent
 * paste into a network/security problem. Nebula stores the URL and paints a
 * useful, clickable card instead; the normal external-link handler opens it.
 */

const LINK_KINDS = ['embed', 'bookmark', 'url', 'mention'];

export function normalizeUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const candidate = /^www\./i.test(value) ? `https://${value}` : value;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function isImageMime(mime) {
  return /^image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml)$/i.test(String(mime ?? ''));
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

function ensureLayer(editor, behind = false) {
  const selector = behind
    ? ':scope > .image-layer--behind'
    : ':scope > .image-layer:not(.image-layer--behind)';
  let layer = editor.querySelector(selector);
  if (!layer) {
    layer = document.createElement('div');
    layer.className = behind ? 'image-layer image-layer--behind' : 'image-layer';
    layer.setAttribute('contenteditable', 'false');
    layer.dataset.blockType = 'image-layer';
    editor.insertBefore(layer, editor.firstChild);
  }
  return layer;
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
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 420, height: image.naturalHeight || 280 });
    image.onerror = () => resolve({ width: 420, height: 280 });
    image.src = src;
  });
}

function makeImage(src, width, height, at) {
  const figure = document.createElement('figure');
  figure.className = 'note-image';
  figure.setAttribute('contenteditable', 'false');
  figure.dataset.blockType = 'image';
  figure.dataset.ratio = String(width / Math.max(1, height));
  figure.style.left = `${Math.round(at?.left ?? 40)}px`;
  figure.style.top = `${Math.round(at?.top ?? 40)}px`;
  figure.style.width = `${Math.round(width)}px`;
  figure.style.height = `${Math.round(height)}px`;

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
  return card;
}

export function initRichPaste(editor, { history } = {}) {
  if (!editor) return null;
  let pendingRange = null;
  let selectedImage = null;
  let drag = null;
  const claimed = new WeakSet();
  let imageCascade = 0;

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
      button.textContent = kind[0].toUpperCase() + kind.slice(1);
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
    pendingRange = currentRange(editor);
    linkInput.value = url || '';
    linkHint.textContent = url ? 'Choose how this link should appear.' : 'Paste a URL, then choose a format.';
    linkMenu.querySelectorAll('[data-link-kind]').forEach((button) => {
      button.classList.toggle('sel', button.dataset.linkKind === kind);
    });
    linkMenu.hidden = false;
    positionLinkMenu();
    requestAnimationFrame(() => { linkInput.focus(); linkInput.select(); });
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
    const block = directBlock(editor, range.startContainer);
    if (block && block.parentElement === editor) {
      block.parentNode.insertBefore(card, block.nextSibling);
      const blank = document.createElement('p');
      blank.appendChild(document.createElement('br'));
      card.after(blank);
      if (!block.textContent.trim() && !block.querySelector('br, img')) block.remove();
      placeCaretIn(blank);
    } else {
      range.deleteContents();
      range.insertNode(card);
      placeCaretAfter(card);
    }
  }

  function applyLink(kind) {
    const url = normalizeUrl(linkInput.value);
    if (!url) {
      linkHint.textContent = 'Enter a valid http(s) URL first.';
      linkInput.focus();
      return;
    }
    const range = pendingRange;
    hideLinkMenu();
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

  function ensureImageBar() {
    let bar = $('image-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'image-bar';
    bar.className = 'image-bar';
    bar.hidden = true;
    bar.innerHTML = '<button type="button" data-image="back" title="Send behind text">▾</button>'
      + '<button type="button" data-image="front" title="Bring above text">▴</button>'
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

  function selectImage(image) {
    editor.querySelectorAll('.note-image.sel').forEach((node) => node.classList.remove('sel'));
    selectedImage = image || null;
    selectedImage?.classList.add('sel');
    imageBar.hidden = !selectedImage;
    if (selectedImage) positionImageBar();
  }

  function behindImageAt(x, y) {
    let hit = null;
    for (const image of editor.querySelectorAll('.image-layer--behind .note-image')) {
      const rect = image.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) hit = image;
    }
    return hit;
  }

  function refreshImages() {
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
    }
    if (selectedImage && !selectedImage.isConnected) selectImage(null);
  }

  function insertImageData(src, dimensions, at) {
    imageCascade = (imageCascade + 1) % 8;
    const maxWidth = 460;
    const ratio = dimensions.width / Math.max(1, dimensions.height);
    let width = Math.min(maxWidth, Math.max(120, dimensions.width || maxWidth));
    let height = width / ratio;
    if (height > 420) { height = 420; width = height * ratio; }
    const point = at || { left: 36 + imageCascade * 22, top: (editor.scrollTop || 0) + 36 + imageCascade * 18 };
    const image = makeImage(src, width, height, point);
    history?.push();
    ensureLayer(editor).appendChild(image);
    refreshImages();
    selectImage(image);
    dirty();
    return image;
  }

  async function insertImageBlob(blob, at) {
    if (!blob || !isImageMime(blob.type)) return null;
    try {
      const src = await readBlob(blob);
      const dimensions = await imageSize(src);
      return insertImageData(src, dimensions, at);
    } catch {
      return null;
    }
  }

  editor.addEventListener('mousedown', (event) => {
    const handle = event.target.closest('.image-h');
    let image = event.target.closest('.note-image');
    if (!image) image = behindImageAt(event.clientX, event.clientY);
    if (!image) return;
    claimed.add(event);
    selectImage(image);
    event.preventDefault();
    history?.push();
    drag = {
      image,
      kind: handle ? 'resize' : 'move',
      moved: false,
      downX: event.clientX,
      downY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      left: parseFloat(image.style.left) || 0,
      top: parseFloat(image.style.top) || 0,
      width: image.offsetWidth,
      height: image.offsetHeight,
      ratio: Number(image.dataset.ratio) || image.offsetWidth / Math.max(1, image.offsetHeight),
    };
  });

  window.addEventListener('mousemove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(event.clientX - drag.downX) > 2 || Math.abs(event.clientY - drag.downY) > 2) drag.moved = true;
    if (!drag.moved) return;
    if (drag.kind === 'move') {
      drag.image.style.left = `${Math.max(0, drag.left + dx)}px`;
      drag.image.style.top = `${Math.max(0, drag.top + dy)}px`;
    } else {
      const width = Math.max(100, drag.width + dx);
      drag.image.style.width = `${Math.round(width)}px`;
      drag.image.style.height = `${Math.round(width / drag.ratio)}px`;
    }
    positionImageBar();
  });

  window.addEventListener('mouseup', () => {
    if (!drag) return;
    if (drag.moved) dirty();
    drag = null;
  });

  imageBar.addEventListener('mousedown', (event) => event.preventDefault());
  imageBar.addEventListener('click', (event) => {
    const act = event.target.closest('[data-image]')?.dataset.image;
    if (!selectedImage || !act) return;
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
    positionImageBar();
    dirty();
  });

  document.addEventListener('mousedown', (event) => {
    if (claimed.has(event)) return;
    if (event.target.closest('.note-image, #image-bar')) return;
    if (selectedImage) selectImage(null);
  });
  editor.addEventListener('scroll', () => { if (selectedImage) positionImageBar(); });
  window.addEventListener('resize', () => { if (selectedImage) positionImageBar(); });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !linkMenu.hidden) { hideLinkMenu(); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedImage
      && !event.target.closest('input, textarea, .code-src, .shape-text')) {
      event.preventDefault();
      history?.push();
      selectedImage.remove();
      selectImage(null);
      dirty();
    }
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
    if (normalizeUrl(text)) {
      event.preventDefault();
      open('', text);
    }
  });

  editor.addEventListener('dragover', (event) => {
    if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault();
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
      open('', text);
    }
  });

  async function paste() {
    pendingRange = currentRange(editor);
    editor.focus();
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const clipboardItem of items) {
          const type = clipboardItem.types.find((item) => isImageMime(item));
          if (type) {
            const blob = await clipboardItem.getType(type);
            await insertImageBlob(blob, null);
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (normalizeUrl(text)) { open('', text); return; }
      if (text) document.execCommand('insertText', false, text);
    } catch {
      try { document.execCommand('paste'); } catch { /* browser preview */ }
    }
  }

  refreshImages();

  return {
    open,
    paste,
    refresh: refreshImages,
    reset: () => { selectImage(null); hideLinkMenu(); },
    insertImageBlob,
  };
}
