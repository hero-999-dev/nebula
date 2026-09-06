/**
 * Two-row editing bar + the right-click mini bar.
 * Formatting execCommand can't express (underline styles, inline code,
 * equations) wraps the selection in a classed span — and underline styles are
 * EXCLUSIVE: applying one strips any previous underline wrapper so they can
 * never nest into each other.
 */

import { addShape } from './shapes.js';
import { insertCodeBlock } from './codeblock.js';
import { normalizeLists } from './lists.js';
import { enterOutOfWrapper, backspaceOutOfWrapper } from './inline-format.js';
import { initEquation } from './equation.js';

export const TEXT_COLORS = [
  ['Default text', ''],
  ['Gray text', '#8A8371'],
  ['Brown text', '#8B5E3C'],
  ['Orange text', '#C96F2E'],
  ['Yellow text', '#A98A2D'],
  ['Green text', '#6E8B6A'],
  ['Blue text', '#4A6B8A'],
  ['Purple text', '#7C5D8A'],
  ['Pink text', '#B0607F'],
  ['Red text', '#9E3B32'],
];

export const HILITE_COLORS = [
  ['No background', ''],
  ['Gray background', '#E3DED2'],
  ['Brown background', '#E0CDB8'],
  ['Orange background', '#F2D4BC'],
  ['Yellow background', '#EFE3C0'],
  ['Green background', '#D6E4D0'],
  ['Blue background', '#D3E0EA'],
  ['Purple background', '#E2D7E8'],
  ['Pink background', '#F0D2CE'],
  ['Red background', '#EFC4BE'],
];

export const U_STYLES = ['u-single', 'u-double', 'u-bold', 'u-wavy', 'u-dash'];

/** Clamp indent level on the current block. Pure — tested. */
export function stepIndent(current, delta, max = 6) {
  return Math.max(0, Math.min(max, (Number(current) || 0) + delta));
}

/** Accept any positive number the user types (px). Pure — tested. */
export function parseSize(raw) {
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(400, Math.max(6, Math.round(n)));
}

export function initToolbar(editorEl, { onSave, shapes } = {}) {
  const toolbar = document.getElementById('toolbar');
  const miniBar = document.getElementById('mini-bar');
  if (!toolbar || !editorEl) return null;

  let lastColor = '#9E3B32';
  let lastHilite = '#EFE3C0';
  const colorBar = document.getElementById('color-bar');
  const hiliteBar = document.getElementById('hilite-bar');
  if (colorBar) colorBar.style.background = lastColor;
  if (hiliteBar) hiliteBar.style.background = lastHilite;

  const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  function cmd(name, value = null) {
    editorEl.focus();
    document.execCommand(name, false, value);
    dirty();
  }

  function selectionInEditor() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    return editorEl.contains(range.commonAncestorContainer) ? range : null;
  }

  function reselect(node) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(node);
    sel.addRange(r);
  }

  /** Wrap the selection in a classed span. */
  function wrapSelection(cls) {
    const range = selectionInEditor();
    if (!range || range.collapsed) return null;
    const span = document.createElement('span');
    span.className = cls;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    reselect(span);
    dirty();
    return span;
  }

  /** Remove every underline wrapper touching the selection (keeps the text). */
  function stripUnderlines() {
    const range = selectionInEditor();
    if (!range) return;
    const frag = range.cloneContents();
    const hasInside = frag.querySelector?.(U_STYLES.map((c) => `.${c}`).join(','));
    // wrappers fully inside the selection
    if (hasInside) {
      const span = document.createElement('span');
      span.appendChild(range.extractContents());
      span.querySelectorAll(U_STYLES.map((c) => `.${c}`).join(',')).forEach((el) => el.replaceWith(...el.childNodes));
      range.insertNode(span);
      span.replaceWith(...span.childNodes);
    }
    // an ancestor wrapper around the selection
    let node = range.commonAncestorContainer;
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    const anc = node?.closest?.(U_STYLES.map((c) => `.${c}`).join(','));
    if (anc && editorEl.contains(anc)) anc.replaceWith(...anc.childNodes);
    editorEl.normalize();
  }

  /** Underline styles are exclusive — never nested. */
  function applyUnderline(cls) {
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    const text = range.toString();
    stripUnderlines();
    if (cls === 'none') { dirty(); return; }
    // re-find the same text after stripping, then wrap it once
    const sel = window.getSelection();
    if (sel.isCollapsed && text) {
      // selection may have been dropped by the strip — restore by content search
      const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const i = n.textContent.indexOf(text);
        if (i !== -1) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + text.length);
          sel.removeAllRanges();
          sel.addRange(r);
          break;
        }
      }
    }
    wrapSelection(cls);
  }

  function blockOf() {
    const range = selectionInEditor();
    if (!range) return null;
    let el = range.startContainer;
    if (el.nodeType !== Node.ELEMENT_NODE) el = el.parentElement;
    while (el && el.parentElement !== editorEl) el = el.parentElement;
    return el && el !== editorEl ? el : null;
  }

  function indent(delta) {
    const el = blockOf();
    if (!el) return;
    const next = stepIndent(el.dataset.ind, delta);
    if (next === 0) delete el.dataset.ind;
    else el.dataset.ind = String(next);
    dirty();
  }

  function placeCaretEnd(el) {
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function makeTodo() {
    const el = blockOf();
    if (el && !el.classList.contains('blk-todo')) {
      const div = document.createElement('div');
      div.className = 'blk-todo';
      div.innerHTML = el.innerHTML || '<br>';
      el.replaceWith(div);
      placeCaretEnd(div);
      dirty();
    } else if (!el) {
      cmd('insertHTML', '<div class="blk-todo"><br></div>');
    }
  }

  /** Apply a px font size — execCommand only knows 1..7, so we post-fix spans. */
  function applyFontSize(px) {
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    document.execCommand('fontSize', false, '7');
    editorEl.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span');
      span.style.fontSize = `${px}px`;
      span.innerHTML = f.innerHTML;
      f.replaceWith(span);
    });
    dirty();
  }

  async function pasteFromClipboard() {
    editorEl.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (text) cmd('insertText', text);
    } catch {
      document.execCommand('paste');
    }
  }

  /**
   * Chromium's list commands are only right in the simple case — a numbered
   * list started under a bulleted one ends up nested inside its last item.
   * normalizeLists puts the tree back; see lists.js.
   */
  function listCommand(name) {
    editorEl.focus();
    document.execCommand(name, false, null);
    normalizeLists(editorEl);
    dirty();
  }

  const insertShape = (kind) => (shapes ? shapes.addShape(kind) : addShape(editorEl, kind));

  const equation = initEquation(editorEl, { dirty });

  const ACTIONS = {
    undo: () => cmd('undo'),
    redo: () => cmd('redo'),
    ul: () => listCommand('insertUnorderedList'),
    ol: () => listCommand('insertOrderedList'),
    todo: makeTodo,
    indent: () => indent(1),
    outdent: () => indent(-1),
    save: () => onSave?.(),
    print: () => window.print(),
    cut: () => cmd('cut'),
    copy: () => cmd('copy'),
    paste: () => void pasteFromClipboard(),
    // Through the shapes controller when there is one, so a new shape arrives
    // selected with its colour bar open — adding one and then having to hunt
    // for it to recolour it is not the point of a shape button.
    'shape-rect': () => insertShape('rect'),
    codeblock: () => insertCodeBlock(editorEl),
    divider: () => cmd('insertHTML', '<hr class="blk-hr"><p><br></p>'),
    bold: () => cmd('bold'),
    italic: () => cmd('italic'),
    underline: () => applyUnderline('u-single'),
    strike: () => cmd('strikeThrough'),
    code: () => wrapSelection('inline-code'),
    eq: () => equation?.open(),
    color: () => cmd('foreColor', lastColor),
    hilite: () => cmd('hiliteColor', lastHilite),
    al: () => cmd('justifyLeft'),
    ac: () => cmd('justifyCenter'),
    ar: () => cmd('justifyRight'),
    aj: () => cmd('justifyFull'),
  };

  toolbar.addEventListener('mousedown', (e) => {
    if (!e.target.closest('input, select')) e.preventDefault(); // keep the selection
  });

  toolbar.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act && ACTIONS[act]) { closeMenus(); ACTIONS[act](); return; }

    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
      const menu = document.getElementById(menuBtn.dataset.menu);
      const wasOpen = !menu.hidden;
      closeMenus();
      menu.hidden = wasOpen;
      return;
    }
    const ustyle = e.target.closest('[data-ustyle]')?.dataset.ustyle;
    if (ustyle) { applyUnderline(ustyle); closeMenus(); return; }

    const shapeKind = e.target.closest('[data-shape-add]')?.dataset.shapeAdd;
    if (shapeKind) { insertShape(shapeKind); closeMenus(); }
  });

  function closeMenus() {
    toolbar.querySelectorAll('.tb-menu').forEach((m) => { m.hidden = true; });
  }
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.tb-wrap')) closeMenus();
  });

  // ----- color menus (Notion-style names + swatches) -----
  function buildColorMenu(id, colors, apply, isHilite) {
    const menu = document.getElementById(id);
    if (!menu) return;
    menu.innerHTML = `<div class="tb-menu__label">${isHilite ? 'Background color' : 'Text color'}</div>`;
    for (const [name, value] of colors) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const chip = isHilite
        ? `<span class="swatch" style="background:${value || 'transparent'}"></span>`
        : `<span class="swatch swatch--a" style="color:${value || 'var(--ink)'}">A</span>`;
      // The label is its own element so it occupies a real grid column; as a
      // bare text node its box depended on the row's content and one row could
      // sit off the line the others share.
      btn.innerHTML = `${chip}<span class="label">${name}</span>`;
      btn.addEventListener('click', () => { apply(value); closeMenus(); });
      menu.appendChild(btn);
    }
    const row = document.createElement('div');
    row.className = 'custom-row';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = isHilite ? '#EFE3C0' : '#9E3B32';
    input.addEventListener('input', () => apply(input.value));
    row.append(input, document.createTextNode('Custom'));
    menu.appendChild(row);
  }

  buildColorMenu('menu-color', TEXT_COLORS, (v) => {
    lastColor = v || ink();
    if (colorBar) colorBar.style.background = lastColor;
    cmd('foreColor', lastColor);
  }, false);

  buildColorMenu('menu-hilite', HILITE_COLORS, (v) => {
    if (v) {
      lastHilite = v;
      if (hiliteBar) hiliteBar.style.background = v;
      cmd('hiliteColor', v);
    } else {
      cmd('hiliteColor', 'transparent');
    }
  }, true);

  // ----- outline / font / size -----
  const outlineSel = document.getElementById('tb-outline');
  outlineSel?.addEventListener('change', (e) => {
    cmd('formatBlock', e.target.value === 'p' ? 'p' : e.target.value);
  });

  const fontInput = document.getElementById('tb-font');
  const sizeInput = document.getElementById('tb-size');

  function applyFont() {
    const v = fontInput.value.trim();
    if (v) cmd('fontName', v);
  }
  fontInput?.addEventListener('change', applyFont);
  fontInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyFont(); } });

  function applySize() {
    const px = parseSize(sizeInput.value);
    if (px) { sizeInput.value = String(px); applyFontSize(px); }
  }
  sizeInput?.addEventListener('change', applySize);
  sizeInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applySize(); } });

  /** Reflect what the caret actually sits in — the selects stay in sync. */
  function syncState() {
    const range = selectionInEditor();
    if (!range) return;
    let el = range.startContainer;
    if (el.nodeType !== Node.ELEMENT_NODE) el = el.parentElement;
    if (!el) return;
    const cs = getComputedStyle(el);
    if (document.activeElement !== fontInput) {
      const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '');
      if (fam) fontInput.value = fam;
    }
    if (document.activeElement !== sizeInput) {
      const px = Math.round(parseFloat(cs.fontSize));
      if (px) sizeInput.value = String(px);
    }
    const block = el.closest('h1,h2,h3,blockquote,p,div');
    if (outlineSel && block) {
      const tag = block.tagName.toLowerCase();
      outlineSel.value = ['h1', 'h2', 'h3', 'blockquote'].includes(tag) ? tag : 'p';
    }
    toolbar.querySelectorAll('[data-act]').forEach((b) => {
      const a = b.dataset.act;
      const map = { bold: 'bold', italic: 'italic', strike: 'strikeThrough' };
      if (map[a]) {
        try { b.classList.toggle('active', document.queryCommandState(map[a])); } catch { /* ignore */ }
      }
    });
  }
  document.addEventListener('selectionchange', () => {
    if (selectionInEditor()) syncState();
  });

  // ----- todo tick -----
  editorEl.addEventListener('click', (e) => {
    const todo = e.target.closest('.blk-todo');
    if (!todo || e.target !== todo) return;
    if (e.clientX - todo.getBoundingClientRect().left < 24) {
      todo.classList.toggle('done');
      dirty();
    }
  });

  // ----- shortcuts -----
  editorEl.addEventListener('keydown', (e) => {
    if (e.target.closest('.code-src')) return; // code blocks own their keys
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Tab') { e.preventDefault(); indent(e.shiftKey ? -1 : 1); return; }

    // Getting out of an inline format. Enter at the end of one starts the next
    // line plain; Backspace at the start of one takes the format off. Without
    // these two, an inline-code or underline run is a trap — see inline-format.js.
    if (!mod && e.key === 'Enter' && !e.shiftKey) {
      if (enterOutOfWrapper(editorEl, window.getSelection())) {
        e.preventDefault();
        dirty();
      }
      return;
    }
    if (!mod && e.key === 'Backspace') {
      if (backspaceOutOfWrapper(editorEl, window.getSelection())) {
        e.preventDefault();
        dirty();
      }
      return;
    }

    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'e') { e.preventDefault(); ACTIONS.code(); }
    else if (k === 'q') { e.preventDefault(); ACTIONS.eq(); }
    else if (k === 't') { e.preventDefault(); ACTIONS.color(); }
    else if (k === 'h') { e.preventDefault(); ACTIONS.hilite(); }
    else if (k === 's' && e.shiftKey) { e.preventDefault(); ACTIONS.strike(); }
    else if (k === 's') { e.preventDefault(); ACTIONS.save(); }
    else if (k === 'p') { e.preventDefault(); ACTIONS.print(); }
  });

  // ----- mini bar on right-click over a selection -----
  editorEl.addEventListener('contextmenu', (e) => {
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    e.preventDefault();
    miniBar.hidden = false;
    const w = miniBar.offsetWidth || 260;
    miniBar.style.left = `${Math.min(e.clientX, window.innerWidth - w - 8)}px`;
    miniBar.style.top = `${Math.max(8, e.clientY - 44)}px`;
  });
  miniBar?.addEventListener('mousedown', (e) => e.preventDefault());
  miniBar?.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act && ACTIONS[act]) ACTIONS[act]();
    miniBar.hidden = true;
  });
  document.addEventListener('mousedown', (e) => {
    if (miniBar && !miniBar.hidden && !e.target.closest('#mini-bar')) miniBar.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (miniBar) miniBar.hidden = true; closeMenus(); }
  });

  return { actions: ACTIONS, syncState };
}
