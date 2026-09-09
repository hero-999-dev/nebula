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
export /**
 * Give an existing block the controls the current version has.
 *
 * A note written before 0.6.0 has a `.code-head` with a language picker and
 * Copy and nothing else, so its blocks were still undeletable after the ✕ was
 * added — the markup lives in the note, not in the code. Every paint tops the
 * head up.
 */
function ensureHeadControls(block) {
  const head = block.querySelector('.code-head');
  if (!head || head.querySelector('.code-del')) return;
  const del = block.ownerDocument.createElement('button');
  del.type = 'button';
  del.className = 'code-del';
  del.title = 'Delete this code block';
  del.setAttribute('aria-label', 'Delete this code block');
  del.textContent = '✕';
  head.appendChild(del);
}

function fillLangSelect(sel, lang) {
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
    ensureHeadControls(b);
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
    removeBlock(block);
    dirty();
  });

  editorEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (e.target.closest?.('.code-src')) return;      // editing the source
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!editorEl.contains(range.startContainer)) return;

    // A selection that takes in whole blocks: delete them with it. Chromium
    // leaves a contenteditable=false island behind when the range crosses it.
    if (!sel.isCollapsed) {
      const inside = [...editorEl.querySelectorAll('.blk-code')].filter((b) => range.intersectsNode(b));
      if (inside.length) {
        e.preventDefault();
        history?.push();
        range.deleteContents();
        inside.forEach((b) => b.remove());
        dirty();
      }
      return;
    }

    // The block on the side the key is pointing at, when the caret sits at the
    // very edge of the text next to it.
    const atStart = range.startOffset === 0;
    const node = range.startContainer;
    const atEnd = node.nodeType === Node.TEXT_NODE
      ? range.startOffset === node.nodeValue.length
      : range.startOffset === node.childNodes.length;
    const here = blockOf(node);
    const block = e.key === 'Backspace' && atStart ? codeBlockIn(neighbourOf(here, 'before'), 'before')
      : e.key === 'Delete' && atEnd ? codeBlockIn(neighbourOf(here, 'after'), 'after')
        : null;
    if (!block) return;
    e.preventDefault();
    history?.push();
    removeBlock(block);
    dirty();
  });

  /**
   * Take the block, and the wrapper it was alone in.
   *
   * Leaving an empty `<div class="c-red">` behind is the blank line that was
   * reported under a deleted block.
   */
  function removeBlock(block) {
    let target = block;
    let parent = target.parentElement;
    // Climb while the parent holds nothing but this: one element child, and no
    // text of its own. Testing `parent.textContent` would include the block's
    // own source, so the wrapper never qualified and an empty <div> was left
    // behind — the blank line reported under a deleted block.
    while (parent && parent !== editorEl && parent.children.length === 1 && ownText(parent) === '') {
      target = parent;
      parent = target.parentElement;
    }
    target.remove();
  }

  /** A parent's own text, ignoring its element children. */
  function ownText(el) {
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue;
    }
    return text.trim();
  }

  /**
   * A code block at, or wrapped inside, this element.
   *
   * A block is not always a direct child of the editor: applying a colour or a
   * font around one leaves it inside a `<div class="c-red">` wrapper, and the
   * neighbour-of-the-caret lookup then found the wrapper and gave up. Backspace
   * fell through to Chromium, which merged the paragraphs and left the block —
   * and a stray blank line — behind.
   */
  function codeBlockIn(el, side) {
    if (!el) return null;
    if (el.classList?.contains('blk-code')) return el;
    // Any depth: a wrapper can hold a wrapper. The old two-level selector
    // missed a block that had been coloured and then given a font.
    const inner = [...(el.querySelectorAll?.('.blk-code') ?? [])];
    if (!inner.length) return null;
    // Reaching backwards takes the block nearest the caret, which is the last
    // one in the wrapper; reaching forwards takes the first. A wrapper holding
    // text as well keeps its text — only the block goes.
    return side === 'before' ? inner[inner.length - 1] : inner[0];
  }

  /**
   * The nearest block-level element the caret is in.
   *
   * This used to climb all the way to the editor's DIRECT child, which is the
   * bug the user kept reporting. Applying a colour across a run that contains
   * a code block leaves the block AND the paragraph under it inside one
   * `<div class="c-red">`:
   *
   *     <div class="c-red">
   *       <div class="blk-code">…</div>
   *       <p>the caret is here</p>
   *     </div>
   *
   * Climbing to the direct child returned the WRAPPER, whose previous sibling
   * is whatever came before the wrapper — never the block sitting right above
   * the caret. Backspace fell through to Chromium, which cannot delete a
   * `contenteditable="false"` island, so nothing happened at all.
   */
  function blockOf(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el !== editorEl) {
      const d = getComputedStyle(el).display;
      if (d !== 'inline' && d !== 'contents') return el;
      el = el.parentElement;
    }
    return null;
  }

  /**
   * What sits next to the caret's block, looking outward.
   *
   * When the block is the first thing in its wrapper it has no previous
   * sibling of its own, so the search has to step out a level and ask again —
   * otherwise a block wrapped one deeper than the caret is unreachable.
   */
  function neighbourOf(el, side) {
    let cur = el;
    while (cur && cur !== editorEl) {
      const sib = side === 'before' ? cur.previousElementSibling : cur.nextElementSibling;
      if (sib) return sib;
      cur = cur.parentElement;
    }
    return null;
  }
}
