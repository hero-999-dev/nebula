/**
 * Markdown-style code blocks: pick a language, get syntax colors — like
 * GitHub / Discord / Notion. The raw source lives in data-code on the block
 * (never scraped back out of the colored markup), so re-highlighting on a
 * language change is lossless.
 */

import { LANGS, highlight } from './highlight.js';

export function codeBlockHtml(code = '', lang = 'javascript') {
  const options = Object.entries(LANGS)
    .map(([id, l]) => `<option value="${id}"${id === lang ? ' selected' : ''}>${l.label}</option>`)
    .join('');
  return (
    `<div class="blk-code" data-block-type="code" data-lang="${lang}" data-code="${encodeURIComponent(code)}" contenteditable="false">` +
    `<div class="code-head"><select class="code-lang" title="Code language">${options}</select>` +
    `<span class="code-hint">markdown-style block · click the code to edit</span>` +
    `<button type="button" class="code-copy" title="Copy code">Copy</button>` +
  `<button type="button" class="code-del" title="Delete this code block" aria-label="Delete this code block">✕</button></div>` +
    `<pre class="code-body"><code class="code-src" contenteditable="true" spellcheck="false"></code></pre>` +
    `</div><p><br></p>`
  );
}

/** Read raw source off a block (decoding the attribute). */
export function getCode(block) {
  try {
    return decodeURIComponent(block.dataset.code ?? '');
  } catch {
    return '';
  }
}

export function setCode(block, code) {
  block.dataset.code = encodeURIComponent(code);
}

/** Paint one block from its raw source + language. */
export function paintCode(block) {
  const code = getCode(block);
  const lang = block.dataset.lang || 'plain';
  const src = block.querySelector('.code-src');
  if (src) src.innerHTML = highlight(code, lang) || '<br>';
}

/** Fill a language <select> with the full list (stored notes ship it empty). */
export function fillLangSelect(sel, lang) {
  if (!sel) return;
  if (sel.options.length !== Object.keys(LANGS).length) {
    sel.innerHTML = Object.entries(LANGS)
      .map(([id, l]) => `<option value="${id}">${l.label}</option>`)
      .join('');
  }
  sel.value = LANGS[lang] ? lang : 'plain';
}

/** Paint every code block inside a root (called after loading a note). */
export function paintAllCode(root) {
  root.querySelectorAll('.blk-code').forEach((b) => {
    fillLangSelect(b.querySelector('.code-lang'), b.dataset.lang || 'plain');
    paintCode(b);
  });
}

export function insertCodeBlock(editorEl, lang = 'javascript', history = null) {
  editorEl.focus();
  history?.push();

  // The inserted block is found by a marker of its own, not by
  // `.blk-code:not([data-ready])`.
  //
  // That selector returned the first unpainted block in DOCUMENT order, and the
  // guide's seeded blocks carry no `data-ready` — so inserting a code block
  // anywhere in that note stamped, repainted and focused the note's FIRST code
  // block instead. The caret jumped to the top, the editor scrolled with it,
  // and the block that was actually inserted was left unpainted.
  const mark = `cb${Math.random().toString(36).slice(2, 9)}`;
  document.execCommand('insertHTML', false, codeBlockHtml('', lang).replace('class="blk-code"', `class="blk-code ${mark}"`));

  const block = editorEl.querySelector(`.${mark}`);
  if (block) {
    block.classList.remove(mark);
    block.dataset.ready = '1';
    paintCode(block);
    block.querySelector('.code-src')?.focus();
  }
  editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  return block;
}

/** Caret offset within a code element, counted in plain characters. */
function caretOffset(codeEl) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(codeEl);
  range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return range.toString().length;
}

function setCaret(codeEl, offset) {
  const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
  }
  const range = document.createRange();
  range.selectNodeContents(codeEl);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export function initCodeBlocks(editorEl, { history } = {}) {
  if (!editorEl) return;
  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  let repaintTimer = null;

  // typing inside a code block → keep raw source, re-highlight after a pause
  editorEl.addEventListener('input', (e) => {
    const src = e.target.closest?.('.code-src');
    if (!src) return;
    const block = src.closest('.blk-code');
    setCode(block, src.textContent ?? '');
    clearTimeout(repaintTimer);
    repaintTimer = setTimeout(() => {
      if (!document.activeElement || !src.contains(document.activeElement) && document.activeElement !== src) {
        paintCode(block);
        return;
      }
      const off = caretOffset(src);
      paintCode(block);
      setCaret(src, off);
    }, 260);
  });

  // language switch → repaint from raw source
  editorEl.addEventListener('change', (e) => {
    const sel = e.target.closest('.code-lang');
    if (!sel) return;
    const block = sel.closest('.blk-code');
    history?.push();
    block.dataset.lang = sel.value;
    paintCode(block);
    dirty();
  });

  editorEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.code-copy');
    if (!btn) return;
    const block = btn.closest('.blk-code');
    try {
      await navigator.clipboard.writeText(getCode(block));
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
    } catch { /* clipboard unavailable in preview */ }
  });

  // Tab inserts two spaces, Enter stays inside the block
  editorEl.addEventListener('keydown', (e) => {
    const src = e.target.closest?.('.code-src');
    if (!src) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      document.execCommand('insertText', false, '  ');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      document.execCommand('insertText', false, '\n');
    }
  }, true);

  // repaint when focus leaves a code block
  /**
   * Repaint when the caret has really left the block — never while it is
   * leaving.
   *
   * This used to rewrite `src.innerHTML` straight from `focusout`, i.e. while
   * the browser was still placing the caret in whatever came next. Destroying
   * those nodes mid-move makes Chromium give up and collapse the selection to
   * the top of the editable root, scrolling there — which is what "pressing the
   * down arrow throws the screen up" was. Waiting a frame, and only acting if
   * the caret really is elsewhere, leaves the move alone.
   */
  editorEl.addEventListener('focusout', (e) => {
    const src = e.target.closest?.('.code-src');
    if (!src) return;
    requestAnimationFrame(() => {
      if (!src.isConnected || src.contains(document.activeElement) || src === document.activeElement) return;
      const block = src.closest('.blk-code');
      if (block) paintCode(block);
    });
  });

  /**
   * A code block can be removed.
   *
   * It is `contenteditable="false"`, so Chromium will not delete it: Backspace
   * after it and Delete before it both simply do nothing, and there was no
   * button either — once a block was in a note there was no way at all to get
   * rid of it.
   */
  editorEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-del');
    if (!btn) return;
    const block = btn.closest('.blk-code');
    if (!block) return;
    history?.push();
    block.remove();
    dirty();
  });

  editorEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (e.target.closest?.('.code-src')) return;      // editing the source
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!editorEl.contains(range.startContainer)) return;

    // The block on the side the key is pointing at, when the caret sits at the
    // very edge of the text next to it.
    const atStart = range.startOffset === 0;
    const node = range.startContainer;
    const atEnd = node.nodeType === Node.TEXT_NODE
      ? range.startOffset === node.nodeValue.length
      : range.startOffset === node.childNodes.length;
    let block = null;
    if (e.key === 'Backspace' && atStart) {
      block = blockOf(node)?.previousElementSibling;
    } else if (e.key === 'Delete' && atEnd) {
      block = blockOf(node)?.nextElementSibling;
    }
    if (!block?.classList?.contains('blk-code')) return;
    e.preventDefault();
    history?.push();
    block.remove();
    dirty();
  });

  /** The direct child of the editor that contains a node. */
  function blockOf(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el.parentElement !== editorEl) el = el.parentElement;
    return el && el !== editorEl ? el : null;
  }
}
