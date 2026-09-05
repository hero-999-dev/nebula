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
    `<button type="button" class="code-copy" title="Copy code">Copy</button></div>` +
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

export function insertCodeBlock(editorEl, lang = 'javascript') {
  editorEl.focus();
  document.execCommand('insertHTML', false, codeBlockHtml('', lang));
  const block = editorEl.querySelector('.blk-code:not([data-ready])');
  if (block) {
    block.dataset.ready = '1';
    paintCode(block);
    block.querySelector('.code-src')?.focus();
  }
  editorEl.dispatchEvent(new Event('input', { bubbles: true }));
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

export function initCodeBlocks(editorEl) {
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
  editorEl.addEventListener('focusout', (e) => {
    const src = e.target.closest?.('.code-src');
    if (src) paintCode(src.closest('.blk-code'));
  });
}
