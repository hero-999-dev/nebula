/** Notion-style "/" block menu. */

import { addShape } from './shapes.js';
import { insertCodeBlock } from './codeblock.js';
import { icon } from './icons.js';

export const SLASH_ITEMS = [
  { id: 'text', ic: 'text', label: 'Text' },
  { id: 'h1', ic: 'h1', label: 'Heading 1' },
  { id: 'h2', ic: 'h2', label: 'Heading 2' },
  { id: 'h3', ic: 'h3', label: 'Heading 3' },
  { id: 'bullet', ic: 'bullets', label: 'Bulleted list' },
  { id: 'numbered', ic: 'numbers', label: 'Numbered list' },
  { id: 'todo', ic: 'todo', label: 'To-do' },
  { id: 'quote', ic: 'quote', label: 'Quote' },
  { id: 'code', ic: 'codeblock', label: 'Code block' },
  { id: 'divider', ic: 'divider', label: 'Divider' },
  { id: 'shape', ic: 'shapes', label: 'Shape' },
];

/** Find a live "/query" immediately before the caret. Pure — tested. */
export function detectSlash(textBeforeCaret) {
  const m = textBeforeCaret.match(/(?:^|\s)\/([\w-]*)$/);
  if (!m) return null;
  return { query: m[1], start: textBeforeCaret.length - m[1].length - 1 };
}

export function filterSlash(query) {
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter((it) => it.label.toLowerCase().includes(q) || it.id.includes(q));
}

export function initSlashMenu(editorEl, { history, shapes } = {}) {
  const menu = document.getElementById('slash-menu');
  if (!menu || !editorEl) return;

  let ctx = null;
  let sel = 0;
  let items = SLASH_ITEMS;
  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  function hide() { menu.hidden = true; ctx = null; sel = 0; }

  function render() {
    menu.innerHTML = '';
    items.forEach((it, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = i === sel ? 'sel' : '';
      btn.innerHTML = `<span class="fm-ic">${icon(it.ic)}</span><span>${it.label}</span>`;
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); apply(it.id); });
      menu.appendChild(btn);
    });
  }

  function position() {
    const s = window.getSelection();
    if (!s || !s.rangeCount) return;
    let rect = s.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height && !rect.top) {
      let el = s.anchorNode;
      if (el && el.nodeType !== Node.ELEMENT_NODE) el = el.parentElement;
      if (el) rect = el.getBoundingClientRect();
    }
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;
    menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 300)}px`;
  }

  function removeSlashText() {
    if (!ctx) return;
    const r = document.createRange();
    r.setStart(ctx.node, ctx.start);
    r.setEnd(ctx.node, ctx.end);
    r.deleteContents();
    const s = window.getSelection();
    s.removeAllRanges();
    const caret = document.createRange();
    caret.setStart(ctx.node, ctx.start);
    caret.collapse(true);
    s.addRange(caret);
  }

  function apply(id) {
    removeSlashText();
    hide();
    editorEl.focus();
    // Every block this menu inserts is one undo step. Nothing here used to touch
  // history at all — the module did not even import it — so `/` could add a
  // code block, a divider or a shape and Ctrl+Z would skip straight past it to
  // whatever was typed before.
  history?.push();
  const exec = (n, v = null) => document.execCommand(n, false, v);
    switch (id) {
      case 'text': exec('formatBlock', 'p'); break;
      case 'h1': exec('formatBlock', 'h1'); break;
      case 'h2': exec('formatBlock', 'h2'); break;
      case 'h3': exec('formatBlock', 'h3'); break;
      case 'quote': exec('formatBlock', 'blockquote'); break;
      case 'bullet': exec('insertUnorderedList'); break;
      case 'numbered': exec('insertOrderedList'); break;
      case 'todo': exec('insertHTML', '<div class="blk-todo"><br></div>'); break;
      case 'divider': exec('insertHTML', '<hr class="blk-hr"><p><br></p>'); break;
      case 'code': insertCodeBlock(editorEl, 'javascript', history); break;
      // Through the controller, so it arrives selected like the toolbar's does.
    case 'shape': shapes ? shapes.addShape('rect') : addShape(editorEl, 'rect', history); break;
    }
    dirty();
  }

  editorEl.addEventListener('input', () => {
    const s = window.getSelection();
    if (!s || !s.rangeCount || !s.isCollapsed) return hide();
    const node = s.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !editorEl.contains(node)) return hide();
    if (node.parentElement?.closest('.code-src, .shape')) return hide();
    const hit = detectSlash(node.textContent.slice(0, s.anchorOffset));
    if (!hit) return hide();
    ctx = { node, start: hit.start, end: s.anchorOffset };
    items = filterSlash(hit.query);
    if (!items.length) return hide();
    sel = 0;
    render();
    position();
    menu.hidden = false;
  });

  editorEl.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      apply(items[sel].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#slash-menu')) hide();
  });
}
