/**
 * Two-row editing bar + the right-click mini bar.
 * Formatting execCommand can't express (underline styles, inline code,
 * equations) wraps the selection in a classed span — and underline styles are
 * EXCLUSIVE: applying one strips any previous underline wrapper so they can
 * never nest into each other.
 */

import { addShape } from './shapes.js';
import { insertCodeBlock } from './codeblock.js';
import { normalizeLists, exitListOnEmptyItem, liftListItemAtStart } from './lists.js';
import { enterOutOfWrapper, backspaceOutOfWrapper } from './inline-format.js';
import { initEquation } from './equation.js';
import { on } from './bus.js';
import { toMarkdown, toHtml, toPrintDocument, safeFileName, FORMATS } from './export.js';
import { noteFromFile } from './import.js';

/**
 * Colours are CLASSES, not values written into the note.
 *
 * They used to be hex literals handed to `execCommand('foreColor')`, picked to
 * look right on the warm light paper. Open the same note on the violet or the
 * dark theme and a "yellow background" was a pale pastel under light ink —
 * highlight and text ran straight into each other. A class resolves through
 * tokens.css, so one note reads correctly in all three themes.
 *
 * `[label, class]`; the empty class is "clear it".
 */
export const TEXT_COLORS = [
  ['Black text', ''],
  ['Gray text', 'c-gray'],
  ['Brown text', 'c-brown'],
  ['Orange text', 'c-orange'],
  ['Yellow text', 'c-yellow'],
  ['Green text', 'c-green'],
  ['Blue text', 'c-blue'],
  ['Purple text', 'c-purple'],
  ['Pink text', 'c-pink'],
  ['Red text', 'c-red'],
];

export const HILITE_COLORS = [
  ['No background', ''],
  ['Gray background', 'h-gray'],
  ['Brown background', 'h-brown'],
  ['Orange background', 'h-orange'],
  ['Yellow background', 'h-yellow'],
  ['Green background', 'h-green'],
  ['Blue background', 'h-blue'],
  ['Purple background', 'h-purple'],
  ['Pink background', 'h-pink'],
  ['Red background', 'h-red'],
];

/** Every class in a family, for stripping before applying another one. */
export const colorClasses = (rows) => rows.map(([, cls]) => cls).filter(Boolean);

export const U_STYLES = ['u-single', 'u-double', 'u-bold', 'u-wavy', 'u-dash'];

/**
 * [label, CSS font stack]. Each stack ends in a generic family so a note still
 * reads on a machine that lacks the face — a bare "Calibri" would silently fall
 * back to the browser default on macOS.
 */
export const FONTS = [
  ['Serif (default)', '"Charter", "Iowan Old Style", Georgia, serif'],
  ['Sans', '"Inter", "Segoe UI", system-ui, sans-serif'],
  ['Arial', 'Arial, Helvetica, sans-serif'],
  ['Calibri', 'Calibri, "Segoe UI", sans-serif'],
  ['Segoe UI', '"Segoe UI", system-ui, sans-serif'],
  ['Verdana', 'Verdana, Geneva, sans-serif'],
  ['Tahoma', 'Tahoma, Geneva, sans-serif'],
  ['Trebuchet MS', '"Trebuchet MS", Tahoma, sans-serif'],
  ['Times New Roman', '"Times New Roman", Times, serif'],
  ['Georgia', 'Georgia, "Times New Roman", serif'],
  ['Garamond', 'Garamond, "EB Garamond", Georgia, serif'],
  ['Comic Sans MS', '"Comic Sans MS", "Comic Sans", cursive'],
  ['Courier New', '"Courier New", Courier, monospace'],
  ['Consolas', 'Consolas, "Cascadia Mono", monospace'],
  ['Cascadia Code', '"Cascadia Code", Consolas, monospace'],
];

/** First family of a CSS stack, unquoted — for labelling the picker. */
export function firstFamily(stack) {
  return String(stack || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
}

/** The FONTS label whose stack starts with the same family, if there is one. */
export function fontLabelFor(family) {
  const want = firstFamily(family).toLowerCase();
  if (!want) return null;
  const hit = FONTS.find(([, stack]) => firstFamily(stack).toLowerCase() === want);
  return hit ? hit[0] : null;
}

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

export function initToolbar(editorEl, { onSave, shapes, history, noteTitle, onImport } = {}) {
  const toolbar = document.getElementById('toolbar');
  const miniBar = document.getElementById('mini-bar');
  if (!toolbar || !editorEl) return null;

  // What the A and H buttons apply when pressed directly — a class, not a hex.
  let lastColor = 'c-red';
  let lastHilite = 'h-yellow';
  let lastShape = 'rect';
  const colorBar = document.getElementById('color-bar');
  const hiliteBar = document.getElementById('hilite-bar');

  /** The bars under A and H show the real colour of the theme that is on. */
  function paintColorBars() {
    if (colorBar) colorBar.style.background = lastColor ? tokenValue(lastColor, 'color') : 'var(--ink)';
    if (hiliteBar) hiliteBar.style.background = lastHilite ? tokenValue(lastHilite, 'backgroundColor') : 'transparent';
  }

  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  function cmd(name, value = null) {
    // Only when the caret is somewhere else. A shape's text is a nested
    // editable INSIDE the editor, so focusing the editor moved focus off it and
    // threw the selection away — bold, italic and the rest simply did nothing
    // inside a shape.
    if (!editorEl.contains(document.activeElement)) editorEl.focus();
    // styleWithCSS is a document-wide flag and applyFont leaves it ON, so bold
    // afterwards emitted <span style="font-weight:bold"> instead of <b>. Every
    // other part of the app — queryCommandState, the export, the importer's
    // allow-list — is written for the tags.
    try { document.execCommand('styleWithCSS', false, false); } catch { /* ignore */ }
    // Even the browser's own commands are snapshotted: the app's undo is the
    // only one now, so it has to know about every edit, not just ours.
    history?.push();
    document.execCommand(name, false, value);
    dirty();
  }

  /**
   * The last selection that was inside the editor.
   *
   * The toolbar's mousedown handler preventDefaults to keep the selection —
   * except over `input` and `select`, which have to be able to take focus to be
   * usable. Focusing them is exactly what clears the document selection, so
   * every control that is a field rather than a button lost the text it was
   * meant to act on: picking a size with words selected did *nothing at all*,
   * silently, because `selectionInEditor()` returned null and the action
   * returned early. Remembered here, restored by `withSelection` below.
   */
  let savedRange = null;

  function selectionInEditor() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    return editorEl.contains(range.commonAncestorContainer) ? range : null;
  }

  /** Put the remembered selection back, for actions driven from a field. */
  function restoreSelection() {
    if (selectionInEditor()) return true;          // still there, nothing to do
    if (!savedRange || !editorEl.contains(savedRange.commonAncestorContainer)) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  }

  /** Run an action with the editor's own selection in place. */
  function withSelection(fn) {
    restoreSelection();
    return fn();
  }

  function reselect(node) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(node);
    sel.addRange(r);
  }

  /**
   * Wrap the selection in a classed span.
   *
   * Precise node surgery, deliberately. 0.4.4 routed this through
   * `execCommand('insertHTML')` to get onto Chromium's undo stack, and it
   * worked — but insertHTML re-serialises the fragment and rewrote the spaces
   * on either side of the selection as `&nbsp;`:
   *
   *     <p>colour&nbsp;<span class="c-red">this</span>&nbsp;word</p>
   *
   * Every formatting action quietly corrupted the text that way. Undo comes
   * from history.js now, so there is nothing to buy by going through the
   * browser's own command.
   */
  function wrapSelection(cls) {
    const range = selectionInEditor();
    if (!range || range.collapsed) return null;
    history?.push();
    const parts = blockRanges(range);
    if (!parts.length) { dirty(); return null; }
    // Back to front: extracting inside one block cannot disturb the ranges in
    // the blocks before it.
    const spans = [];
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const span = document.createElement('span');
      span.className = cls;
      span.appendChild(parts[i].extractContents());
      parts[i].insertNode(span);
      spans.unshift(span);
    }
    editorEl.normalize();
    if (spans.length === 1) reselect(spans[0]);
    else {
      const sel = window.getSelection();
      const r = document.createRange();
      r.setStartBefore(spans[0]);
      r.setEndAfter(spans[spans.length - 1]);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    dirty();
    return spans[0];
  }

  /** The nearest ancestor that lays its children out as a block. */
  function blockAncestor(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el !== editorEl) {
      const d = getComputedStyle(el).display;
      if (d !== 'inline' && d !== 'contents') return el;
      el = el.parentElement;
    }
    return editorEl;
  }

  /**
   * The selection cut at block boundaries — one range per block it touches.
   *
   * A drag across a paragraph boundary makes a range whose `extractContents`
   * returns BLOCK nodes. Wrapping those in one inline span produced
   *
   *     <p>first </p><span class="u-single"><p>rest</p><p>second</p></span>...
   *
   * and `text-decoration` does not propagate into a block child, so the
   * underline was applied and nothing at all was underlined — while the
   * paragraph the drag started in was silently split in two. Per block, each
   * gets its own span: exactly what execCommand does for fonts, which is why
   * the font path never had this bug.
   */
  function blockRanges(range) {
    const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentNode;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const runs = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!range.intersectsNode(node)) continue;
      // A code block owns its own text. A shape's TEXT is ordinary prose and
      // must take bold, italic and the rest — only the layer's chrome is out.
      if (node.parentElement?.closest('.blk-code')) continue;
      if (node.parentElement?.closest('.shape-layer')
        && !node.parentElement?.closest('.shape-text')) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      // intersectsNode is true for a node merely touching a boundary.
      if (start >= end) continue;
      const block = blockAncestor(node);
      const last = runs[runs.length - 1];
      if (last && last.block === block) { last.endNode = node; last.endOffset = end; }
      else runs.push({ block, startNode: node, startOffset: start, endNode: node, endOffset: end });
    }
    return runs.map((r) => {
      const out = document.createRange();
      out.setStart(r.startNode, r.startOffset);
      out.setEnd(r.endNode, r.endOffset);
      return out;
    });
  }

  /**
   * Remove every wrapper of one family touching the selection, keeping the
   * text. A family is a set of classes only one of which may apply at a time:
   * the five underline styles, the nine text colours, the nine highlights.
   */
  function stripFamily(classes, extra = '') {
    const sel = [...classes.map((c) => `.${c}`), ...(extra ? [extra] : [])].join(',');
    const range = selectionInEditor();
    if (!range || !sel) return;
    history?.push();
    // wrappers fully inside the selection
    if (range.cloneContents().querySelector?.(sel)) {
      const span = document.createElement('span');
      span.appendChild(range.extractContents());
      span.querySelectorAll(sel).forEach((el) => el.replaceWith(...el.childNodes));
      range.insertNode(span);
      span.replaceWith(...span.childNodes);
    }
    // an ancestor wrapper around the selection
    let node = range.commonAncestorContainer;
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    const anc = node?.closest?.(sel);
    if (anc && editorEl.contains(anc)) anc.replaceWith(...anc.childNodes);
    editorEl.normalize();
  }

  /**
   * One class from `classes`, replacing whichever one was already there — never
   * nesting them. An empty `cls` just clears the family.
   */
  function applyExclusive(classes, cls, extra = '') {
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    const text = range.toString();
    // Stripping can drop the selection. Its boundary points usually survive,
    // and putting them back is exact — the content search below cannot find a
    // run that spans two blocks, so without this the whole action was a no-op
    // on exactly the selections that needed it most.
    const saved = range.cloneRange();
    stripFamily(classes, extra);
    if (!cls) { dirty(); return; }
    const sel = window.getSelection();
    if ((sel.isCollapsed || !selectionInEditor())
        && saved.startContainer.isConnected && saved.endContainer.isConnected) {
      try {
        sel.removeAllRanges();
        sel.addRange(saved);
      } catch { /* boundaries no longer form a range; fall through */ }
    }
    // re-find the same text after stripping, then wrap it once
    if (sel.isCollapsed && text) {
      // the strip can drop the selection — restore it by content search
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

  /**
   * With nothing selected, apply to the whole block.
   *
   * `applyExclusive` returns early on a collapsed selection, so putting the
   * caret in a line and picking a colour did *nothing at all* — which is
   * exactly what was reported. The font picker grew this fallback in 0.4.4 and
   * the colours never did.
   */
  function applyToBlockOrSelection(classes, cls) {
    const range = selectionInEditor();
    // Selection only. This used to fall back to the whole block when nothing
    // was selected, which is how "I did not select anywhere, I press change
    // colour and everything changes" happened — the same complaint the font
    // picker had, and the same answer.
    if (!range || range.collapsed) return;
    applyExclusive(classes, cls);
  }

  /**
   * Underline needs a selection — no whole-block fallback.
   *
   * Colours and fonts apply to the line when nothing is selected, which is what
   * was asked for. An underline is not the same: picking a style with the caret
   * merely parked in a line underlined the entire line, which is never what
   * anyone means by it.
   */
  // `u` is in the strip set as well as the classes: Ctrl+U used to fall through
  // to Chromium and leave a native <u>, which "None" then could not remove.
  /**
   * Is everything the selection touches already wearing this class?
   *
   * Bold and Italic go through execCommand, which toggles: pressing Bold on
   * bold text turns it off. Ours did not — "the underline part will not switch
   * off", "a background was picked and it will not close". Picking what is
   * already applied clears it now, which is what every one of these controls
   * has always looked like it would do.
   */
  function alreadyApplied(cls) {
    if (!cls) return false;
    const range = selectionInEditor();
    if (!range) return false;
    let node = range.commonAncestorContainer;
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    if (node?.closest?.(`.${cls}`)) return true;
    if (range.collapsed) return false;
    // A range that spans several wrappers counts only if every part is covered.
    const walker = document.createTreeWalker(
      node ?? editorEl, NodeFilter.SHOW_TEXT,
    );
    let n, saw = false;
    while ((n = walker.nextNode())) {
      if (!range.intersectsNode(n) || !n.nodeValue.trim()) continue;
      if (n === range.startContainer && range.startOffset === n.nodeValue.length) continue;
      if (n === range.endContainer && range.endOffset === 0) continue;
      saw = true;
      if (!n.parentElement?.closest(`.${cls}`)) return false;
    }
    return saw;
  }

  const applyUnderline = (cls) => withSelection(() => {
    const want = cls === 'none' ? '' : cls;
    applyExclusive(U_STYLES, alreadyApplied(want) ? '' : want, 'u');
  });
  const applyTextColor = (cls) => withSelection(() =>
    applyToBlockOrSelection(colorClasses(TEXT_COLORS), alreadyApplied(cls) ? '' : cls));
  const applyHilite = (cls) => withSelection(() =>
    applyToBlockOrSelection(colorClasses(HILITE_COLORS), alreadyApplied(cls) ? '' : cls));

  /** What a colour class actually paints in the theme that is on right now. */
  function tokenValue(cls, prop) {
    const probe = document.createElement('span');
    probe.className = cls;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const value = getComputedStyle(probe)[prop];
    probe.remove();
    return value;
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
    history?.push();
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

  /**
   * The to-do button toggles. It used to be one-way: once a line was a to-do
   * there was no way back to a paragraph, so a mis-click was permanent.
   */
  /**
   * A divider, always at the top level.
   *
   * `insertHTML` puts it wherever the caret is, and the caret is often inside
   * something: pressing it on an empty to-do line produced
   * `<div class="blk-todo"><hr class="blk-hr">…</div>` — a divider inside a
   * to-do, which is not a thing. It goes after the caret's own top-level block
   * instead, with an empty line under it to carry on in.
   */
  function insertDivider() {
    const block = blockOf();
    history?.push();
    const hr = document.createElement('hr');
    hr.className = 'blk-hr';
    const after = document.createElement('p');
    after.innerHTML = '<br>';
    if (block) {
      block.after(hr);
      hr.after(after);
      // An empty block the divider was called from has nothing left to say.
      if (!block.textContent.trim() && !block.querySelector('img, .blk-code, .inline-eq')) {
        block.remove();
      }
    } else {
      editorEl.append(hr, after);
    }
    placeCaretEnd(after);
    dirty();
  }

  function makeTodo() {
    const el = blockOf();
    if (!el) { cmd('insertHTML', '<div class="blk-todo"><br></div>'); return; }
    history?.push();
    const isTodo = el.classList.contains('blk-todo');
    const next = document.createElement(isTodo ? 'p' : 'div');
    if (!isTodo) next.className = 'blk-todo';
    next.innerHTML = el.innerHTML || '<br>';
    if (el.dataset.ind) next.dataset.ind = el.dataset.ind; // keep the indent
    el.replaceWith(next);
    placeCaretEnd(next);
    dirty();
  }

  /**
   * A px font size. `execCommand('fontSize')` only knows 1..7, so the value is
   * applied to the spans it creates — but with `styleWithCSS` on, those are
   * plain spans the browser owns, and setting one more property on them keeps
   * them inside its own undo entry instead of replacing them wholesale.
   */
  function applyFontSize(px) {
    history?.push();
    const range = selectionInEditor();
    if (!range || range.collapsed) {
      const block = blockOf();
      if (!block) return;
      block.style.fontSize = `${px}px`;
      dirty();
      return;
    }
    if (!editorEl.contains(document.activeElement)) editorEl.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, '7');
    // Only what the command just marked, and only inside the new selection:
    // sweeping the whole editor for `xxx-large` also resized anything that
    // already carried it, which is a local action reaching across the note.
    const marked = selectionInEditor();
    // No selection to scope by means no sweep. Without this guard the loop
    // resized EVERY element in the note carrying xxx-large — "sometimes random
    // places grow by themselves".
    if (!marked) { dirty(); return; }
    editorEl.querySelectorAll('[style*="xxx-large"], font[size="7"]').forEach((el) => {
      if (!marked.intersectsNode(el)) return;
      el.style.fontSize = `${px}px`;
      el.removeAttribute('size');
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
    history?.push();
    // A to-do is a <div class="blk-todo">, and Chromium's list commands do not
    // know what to do with one — pressing bulleted or numbered on a to-do line
    // did nothing at all. Handing it a plain paragraph instead was not enough
    // either: it produced `<p><ul><li>…</li></ul></p>`, a list nested inside a
    // paragraph. So the list is built here, and the command is skipped.
    const block = blockOf();
    if (block?.classList.contains('blk-todo')) {
      const list = document.createElement(name === 'insertOrderedList' ? 'ol' : 'ul');
      const li = document.createElement('li');
      li.innerHTML = block.innerHTML || '<br>';
      list.appendChild(li);
      if (block.dataset.ind) list.dataset.ind = block.dataset.ind;
      block.replaceWith(list);
      placeCaretEnd(li);
      normalizeLists(editorEl);   // merge with a list already next to it
      dirty();
      return;
    }
    document.execCommand(name, false, null);
    normalizeLists(editorEl);
    dirty();
  }

  const insertShape = (kind) => (shapes ? shapes.addShape(kind) : addShape(editorEl, kind));

  /**
   * Export the open note.
   *
   * Markdown and HTML are built here and handed over as bytes; PDF is produced
   * by the main process through Chromium's own writer, because a PDF made from
   * the OS print dialog is a picture of the window rather than a document.
   */
  async function exportNote(format) {
    const api = window.nebula?.note;
    const title = noteTitle?.() || 'Untitled';
    if (!api) { window.print(); return; }          // browser preview: no dialogs
    if (format === 'pdf') {
      await api.pdf({ suggested: safeFileName(title, 'pdf'), document: printDocument(title) });
      return;
    }
    const content = format === 'html' ? toHtml(editorEl.innerHTML, title) : toMarkdown(editorEl.innerHTML, title);
    await api.export({ suggested: safeFileName(title, format), content, format });
  }

  /**
   * Every stylesheet the app is using, as text, with its relative URLs made
   * absolute.
   *
   * The print window loads from a temporary directory, so `url(./KaTeX_*.woff2)`
   * would resolve to nothing there and every equation would fall back to a
   * system font. Each sheet's own href is the base to resolve against.
   */
  function appStyles() {
    let out = '';
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = [...sheet.cssRules];
      } catch {
        continue;   // a sheet from another origin cannot be read; skip it
      }
      const base = sheet.href || document.baseURI;
      for (const rule of rules) {
        // The app's own `@media print` block is left behind on purpose. It
        // exists to flatten a dark WINDOW onto paper — hiding the sidebar,
        // covering a dark sheet with `@page { margin: 0 }`. This document has
        // no sidebar and is white to begin with, and that zeroed page margin
        // fought the real one: the export came out with a correct left margin
        // and no top margin at all.
        if (rule.media && /print/i.test(rule.media.mediaText)) continue;
        out += `${rule.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (whole, quote, ref) => {
          if (/^(data:|https?:|file:|blob:)/i.test(ref)) return whole;
          try { return `url("${new URL(ref, base).href}")`; } catch { return whole; }
        })}\n`;
      }
    }
    return out;
  }

  /** The note as a standalone white document, for the PDF writer. */
  function printDocument(title) {
    return toPrintDocument({ title, body: editorEl.innerHTML, css: appStyles() });
  }

  async function importNote() {
    const api = window.nebula?.note;
    if (!api) return;
    const res = await api.import();
    if (!res?.ok) return;
    // Parsed and sanitised HERE: the main process only ever read bytes, and an
    // imported file is not allowed to bring markup the editor did not ask for.
    onImport?.(noteFromFile(res.name, res.text));
  }

  function buildExportMenu() {
    const menu = document.getElementById('menu-export');
    if (!menu) return;
    menu.innerHTML = '<div class="tb-menu__label">Export this note</div>';
    for (const fmt of FORMATS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.format = fmt.id;
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = fmt.label;
      btn.appendChild(label);
      btn.addEventListener('click', () => { closeMenus(); void exportNote(fmt.id); });
      menu.appendChild(btn);
    }
  }
  buildExportMenu();

  const equation = initEquation(editorEl, { dirty });

  const ACTIONS = {
    // Not execCommand('undo'): Chromium's stack cannot see the edits this app
    // makes by script, so it would roll back the wrong thing. See history.js.
    undo: () => { if (history?.undo()) dirty(); },
    redo: () => { if (history?.redo()) dirty(); },
    ul: () => listCommand('insertUnorderedList'),
    ol: () => listCommand('insertOrderedList'),
    todo: makeTodo,
    indent: () => indent(1),
    outdent: () => indent(-1),
    save: () => onSave?.(),
    // Through Electron, so Chromium lays the page out and hands the driver
    // text. `window.print()` let the platform rasterise it, which is what made
    // a printed note look like a photograph of the window.
    print: () => { const api = window.nebula?.note; if (api?.print) void api.print(); else window.print(); },
    import: () => void importNote(),
    'export-md': () => void exportNote('md'),
    'export-html': () => void exportNote('html'),
    'export-pdf': () => void exportNote('pdf'),
    cut: () => cmd('cut'),
    copy: () => cmd('copy'),
    paste: () => void pasteFromClipboard(),
    // Through the shapes controller when there is one, so a new shape arrives
    // selected with its colour bar open — adding one and then having to hunt
    // for it to recolour it is not the point of a shape button.
    // The button inserts whatever kind was chosen last — picking Circle from
    // the menu and then pressing the button again gave a rectangle.
    'shape-rect': () => insertShape(lastShape),
    codeblock: () => insertCodeBlock(editorEl, 'javascript', history),
    divider: () => insertDivider(),
    bold: () => cmd('bold'),
    italic: () => cmd('italic'),
    underline: () => applyUnderline('u-single'),
    strike: () => cmd('strikeThrough'),
    code: () => wrapSelection('inline-code'),
    eq: () => equation?.open(),
    color: () => applyTextColor(lastColor),
    hilite: () => applyHilite(lastHilite),
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
    if (shapeKind) { lastShape = shapeKind; insertShape(shapeKind); closeMenus(); }
  });

  function closeMenus() {
    toolbar.querySelectorAll('.tb-menu').forEach((m) => { m.hidden = true; });
  }
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.tb-wrap')) closeMenus();
  });

  // ----- color menus (Notion-style names + swatches) -----
  // The swatch shows the class rendered in the theme that is on, so the menu
  // and the note can never disagree. The custom picker is gone: a hand-picked
  // hex is exactly the frozen value this release stopped writing, and it is
  // what made a highlight unreadable on the other two themes.
  function buildColorMenu(id, colors, apply, isHilite) {
    const menu = document.getElementById(id);
    if (!menu) return;
    menu.innerHTML = `<div class="tb-menu__label">${isHilite ? 'Background color' : 'Text color'}</div>`;
    for (const [name, cls] of colors) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.colorClass = cls;
      const swatch = document.createElement('span');
      swatch.className = isHilite ? `swatch ${cls}` : `swatch swatch--a ${cls}`;
      if (isHilite && !cls) swatch.style.background = 'transparent';
      if (!isHilite) swatch.textContent = 'A';
      // The label is its own element so it occupies a real grid column; as a
      // bare text node its box depended on the row's content and one row could
      // sit off the line the others share.
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = name;
      btn.append(swatch, label);
      btn.addEventListener('click', () => { apply(cls); closeMenus(); });
      menu.appendChild(btn);
    }
  }

  buildColorMenu('menu-color', TEXT_COLORS, (cls) => {
    lastColor = cls;
    paintColorBars();
    applyTextColor(cls);
  }, false);

  buildColorMenu('menu-hilite', HILITE_COLORS, (cls) => {
    lastHilite = cls;
    paintColorBars();
    applyHilite(cls);
  }, true);

  paintColorBars();
  on('theme-changed', paintColorBars);

  // ----- outline / font / size -----
  const outlineSel = document.getElementById('tb-outline');
  outlineSel?.addEventListener('change', (e) => {
    // A <select> has to take focus to be used, which drops the editor's
    // selection — same trap as the size field.
    withSelection(() => cmd('formatBlock', e.target.value === 'p' ? 'p' : e.target.value));
  });

  const fontBtn = document.getElementById('tb-font');
  const fontName = fontBtn?.querySelector('.tb-font__name');
  const sizeInput = document.getElementById('tb-size');

  /**
   * Apply a font.
   *
   * `styleWithCSS` makes Chromium emit `<span style="font-family:…">` itself,
   * so there is no `<font face>` left to rewrite afterwards. That rewrite was
   * the Ctrl+Z bug the user hit: replacing the element the browser had just
   * inserted desynchronised its undo stack, and undoing a font change left a
   * duplicate of the text behind.
   *
   * With only a caret there is nothing for the command to act on, so the whole
   * block takes the font instead — picking a font with the caret parked in a
   * line used to do nothing at all.
   */
  function applyFont(stack) {
    const range = selectionInEditor();
    // Nothing selected, nothing to restyle. 0.6.0 gave this a whole-block
    // fallback because picking a font with the caret parked in a line appeared
    // to do nothing; the user's answer to that is explicit — "when changing the
    // font only what is SELECTED should change; if nothing is selected it
    // should not change" — and a font quietly taking a whole paragraph is the
    // more surprising of the two.
    if (!range || range.collapsed) return;
    if (!editorEl.contains(document.activeElement)) editorEl.focus();
    history?.push();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontName', false, stack);
    dirty();
  }

  function buildFontMenu() {
    const menu = document.getElementById('menu-font');
    if (!menu) return;
    menu.innerHTML = '<div class="tb-menu__label">Font</div>';
    for (const [label, stack] of FONTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.font = stack;
      // Set in its own face, so the list is a preview and not fifteen identical
      // rows. Assigned as a property, not written into a style="" attribute:
      // the stacks contain double quotes ("Segoe UI"), which end the attribute
      // early and leave the row with no font at all.
      const labelEl = document.createElement('span');
      labelEl.className = 'label';
      labelEl.textContent = label;
      labelEl.style.fontFamily = stack;
      btn.appendChild(labelEl);
      btn.addEventListener('click', () => {
        // Through withSelection: if anything has taken the selection since the
        // words were highlighted, applyFont's collapsed-caret branch would
        // quietly restyle the WHOLE line instead — "selecting some places
        // still changes the font of the whole area".
        withSelection(() => applyFont(stack));
        if (fontName) fontName.textContent = label;
        closeMenus();
      });
      menu.appendChild(btn);
    }
  }
  buildFontMenu();

  function applySize() {
    const px = parseSize(sizeInput.value);
    if (px) { sizeInput.value = String(px); withSelection(() => applyFontSize(px)); }
    paintSizeTarget(false);
  }
  /** The common sizes, behind the caret. Typing a number still works. */
  const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 48, 72];
  (function buildSizeMenu() {
    const menu = document.getElementById('menu-size');
    if (!menu) return;
    menu.innerHTML = '<div class="tb-menu__label">Size</div>';
    for (const px of SIZES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.size = String(px);
      const label = document.createElement('span');
      label.className = 'label';
      // Just the number. "px" on every row is eleven characters of noise in a
      // list where every entry is a size in px.
      label.textContent = String(px);
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        closeMenus();
        sizeInput.value = String(px);
        withSelection(() => applyFontSize(px));
      });
      menu.appendChild(btn);
    }
  }());

  /**
   * Keep the selection VISIBLE while the size box has focus.
   *
   * The range is remembered and put back (`withSelection`), so the size always
   * landed on the right words — but Chromium stops painting a selection the
   * moment its editable loses focus, so the highlight vanished the instant the
   * box was clicked and there was no way to tell what was about to change.
   * Painted with the same Custom Highlight API the find bar uses, which draws
   * without touching the note.
   */
  const SIZE_HL = 'nebula-size-target';
  function paintSizeTarget(on) {
    if (!window.CSS?.highlights) return;
    if (!on || !savedRange || savedRange.collapsed) {
      CSS.highlights.delete(SIZE_HL);
      return;
    }
    try {
      CSS.highlights.set(SIZE_HL, new Highlight(savedRange.cloneRange()));
    } catch { /* a detached range; nothing to draw */ }
  }
  sizeInput?.addEventListener('focus', () => paintSizeTarget(true));
  sizeInput?.addEventListener('blur', () => paintSizeTarget(false));

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
    if (fontName) {
      const fam = firstFamily(cs.fontFamily);
      fontName.textContent = fontLabelFor(fam) ?? fam ?? 'Font';
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
    /**
     * What the caret is standing IN, not what the browser would type next.
     *
     * Two faults, one cause. `queryCommandState('bold')` reports the typing
     * state, which Chromium carries across a boundary: with the caret at the
     * very start of a line whose first word happens to be bold, the Bold button
     * lit up on plain text — "bold is stuck here, it will not turn off".
     *
     * And a caret at offset 0 of a paragraph sits OUTSIDE the span that holds
     * the line's formatting, so `closest()` from that node found nothing and
     * the underline mark never appeared at the start of an underlined line —
     * "right at the beginning there is no indicator at all".
     *
     * Both are answered by asking which element is at the caret, stepping into
     * the child it sits beside, and reading the DOM from there.
     */
    let at = range.startContainer;
    if (at.nodeType === Node.ELEMENT_NODE) {
      at = at.childNodes[range.startOffset] ?? at.childNodes[range.startOffset - 1] ?? at;
    }
    const caretEl = at.nodeType === Node.ELEMENT_NODE ? at : at.parentElement;
    const wearing = (selector) => !!caretEl?.closest?.(selector);
    const MARKS = {
      bold: 'b,strong',
      italic: 'i,em',
      strike: 's,strike,del',
      underline: `${U_STYLES.map((c) => `.${c}`).join(',')},u`,
    };
    toolbar.querySelectorAll('[data-act]').forEach((b) => {
      const mark = MARKS[b.dataset.act];
      if (mark) b.classList.toggle('active', wearing(mark));
    });
  }
  document.addEventListener('selectionchange', () => {
    const range = selectionInEditor();
    if (!range) return;
    // Cloned: the live range keeps moving, and what is wanted is the selection
    // as it was before focus went to a toolbar field.
    savedRange = range.cloneRange();
    syncState();
  });

  /**
   * What a delete is actually about to take.
   *
   * Both of the rules below were written against `keydown` first, by working out
   * from the caret which element WOULD go. That guess is wrong often enough to
   * matter: with empty spans between the caret and a shape layer the guess saw
   * the spans, and Chromium — which selects a non-editable island on the first
   * Backspace and removes it on the second — took all eleven shapes in a note
   * on the second press. The same guess let a divider go without arming.
   *
   * `beforeinput` does not guess. `getTargetRanges()` is the range the browser
   * is about to delete, before it deletes it.
   */
  editorEl.addEventListener('beforeinput', (e) => {
    if (!e.inputType?.startsWith('delete')) {
      editorEl.querySelectorAll('hr.blk-hr.armed').forEach((h) => h.classList.remove('armed'));
      return;
    }
    const statics = typeof e.getTargetRanges === 'function' ? e.getTargetRanges() : [];
    if (!statics.length) return;
    const live = statics.map((r) => {
      const out = document.createRange();
      try {
        out.setStart(r.startContainer, r.startOffset);
        out.setEnd(r.endContainer, r.endOffset);
      } catch { return null; }
      return out;
    }).filter(Boolean);
    const touching = (selector) => [...editorEl.querySelectorAll(selector)]
      .filter((el) => live.some((r) => r.intersectsNode(el)));

    // A shape layer is not text. Nothing typed, and no delete, removes one —
    // the shape bar's own ✕ is the way, and it is undoable.
    if (touching('.shape-layer').length) {
      e.preventDefault();
      return;
    }

    /**
     * The element a backward delete is about to merge with.
     *
     * `intersectsNode` cannot see a void element next to a boundary: an `<hr>`
     * has no content for a range to overlap, so a delete positioned right after
     * one does not "touch" it and the divider went without ever being armed.
     * Its boundary is what has to be read.
     */
    const mergeTarget = () => {
      const r = live[0];
      if (!r) return null;
      const n = r.startContainer;
      if (n.nodeType === Node.ELEMENT_NODE && r.startOffset > 0) {
        const cand = n.childNodes[r.startOffset - 1];
        if (cand?.nodeType === Node.ELEMENT_NODE) return cand;
      }
      if (n.nodeType === Node.TEXT_NODE && r.startOffset > 0) return null;
      let el = n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement;
      while (el && el !== editorEl) {
        if (el.previousElementSibling) return el.previousElementSibling;
        el = el.parentElement;
      }
      return null;
    };

    // A divider takes two goes: the first shows which one, the second takes it.
    // One press removed it the moment the caret reached the line beneath, which
    // is the opposite of "I want to get CLOSE to the divider".
    const before = e.inputType === 'deleteContentBackward' ? mergeTarget() : null;
    const hrs = [...new Set([
      ...touching('hr.blk-hr'),
      ...(before?.classList?.contains('blk-hr') ? [before] : []),
    ])];
    if (hrs.length === 1) {
      e.preventDefault();
      const hr = hrs[0];

      // An empty line between the caret and the divider goes first.
      //
      // "It selects the divider, but the empty white row underneath is still
      // there" — arming it while a blank line sat in between meant the gap
      // could never be closed, which was the whole point of getting close to
      // the divider. The blank line goes on this press; the divider is offered
      // on the next one.
      // From the SELECTION, not from the target range: the range a backward
      // delete reports starts in the block BEFORE the caret, so reading it gave
      // the wrong line and the blank one was never the one removed.
      const caret = window.getSelection();
      let block = caret && caret.rangeCount ? caret.getRangeAt(0).startContainer : null;
      if (block && block.nodeType !== Node.ELEMENT_NODE) block = block.parentElement;
      while (block && block.parentElement !== editorEl) block = block.parentElement;
      if (block && block !== hr && !block.textContent.trim()
        && block.previousElementSibling === hr) {
        history?.push();
        const after = block.nextElementSibling;
        block.remove();
        if (after) {
          const r = document.createRange();
          r.setStart(after, 0);
          r.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        }
        dirty();
        return;
      }

      if (hr.classList.contains('armed')) {
        // Removed here rather than left to the browser: at this boundary its own
        // backward delete merges the blocks around the divider and leaves the
        // divider itself alone, so the second press appeared to do nothing.
        history?.push();
        hr.remove();
        dirty();
      } else {
        editorEl.querySelectorAll('hr.blk-hr.armed').forEach((h) => h.classList.remove('armed'));
        hr.classList.add('armed');
      }
    }
  });

  // ----- todo tick -----
  // Only the box itself ticks. The whole 24px left edge used to, so clicking
  // near the start of a to-do to put the caret there checked it off instead —
  // "I can only tick it, I cannot click into it to write".
  editorEl.addEventListener('click', (e) => {
    const todo = e.target.closest('.blk-todo');
    if (!todo || e.target !== todo) return;
    const r = todo.getBoundingClientRect();
    const box = { left: r.left + 2, right: r.left + 18, top: r.top + 2, bottom: r.top + 22 };
    const onBox = e.clientX >= box.left && e.clientX <= box.right
      && e.clientY >= box.top && e.clientY <= box.bottom;
    if (!onBox) return;
    history?.push();
    todo.classList.toggle('done');
    dirty();
  });

  // ----- shortcuts -----
  editorEl.addEventListener('keydown', (e) => {
    if (e.target.closest('.code-src')) return; // code blocks own their keys
    const mod = e.ctrlKey || e.metaKey;

    /**
     * The caret stays in the note.
     *
     * Held at the top of a note, Chromium walks the selection OUT of the
     * editable and into the page around it — it ends up in the sidebar's
     * "Nebula" wordmark, where nothing is drawn and nothing typed arrives.
     * "Press the up arrow from here and you will see the bug straight away."
     * The default is left to run and the selection is pulled back only if it
     * actually left, so ordinary movement is untouched.
     */
    if (!mod && e.key.startsWith('Arrow')) {
      requestAnimationFrame(() => {
        if (document.activeElement !== editorEl) return;   // focus left deliberately
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        if (editorEl.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
        const back = document.createRange();
        back.selectNodeContents(editorEl);
        back.collapse(e.key === 'ArrowUp' || e.key === 'ArrowLeft');
        sel.removeAllRanges();
        sel.addRange(back);
      });
    }

    if (e.key === 'Tab') { e.preventDefault(); indent(e.shiftKey ? -1 : 1); return; }

    // Getting out of an inline format. Enter at the end of one starts the next
    // line plain; Backspace at the start of one takes the format off. Without
    // these two, an inline-code or underline run is a trap — see inline-format.js.
    // Leaving a list is checked first: on an empty item both keys mean "I am
    // done with this list", and Backspace especially must not merge the empty
    // item into the numbered line above it.
    if (!mod && (e.key === 'Enter' || e.key === 'Backspace') && !e.shiftKey) {
      if (exitListOnEmptyItem(editorEl, window.getSelection())) {
        e.preventDefault();
        dirty();
        return;
      }
    }
    // Backspace at the start of an item that HAS text takes it out of the list
    // rather than merging it upward — the way back to the left margin.
    if (!mod && e.key === 'Backspace' && !e.shiftKey) {
      history?.push();
      if (liftListItemAtStart(editorEl, window.getSelection())) {
        e.preventDefault();
        dirty();
        return;
      }
    }
    // Enter on an EMPTY to-do ends the run, exactly as it does in a list.
    // Without it the only way out was to keep making empty to-dos.
    if (!mod && e.key === 'Enter' && !e.shiftKey) {
      const here = blockOf();
      if (here?.classList.contains('blk-todo') && !here.textContent.trim()) {
        e.preventDefault();
        history?.push();
        const out = document.createElement('p');
        out.innerHTML = '<br>';
        here.replaceWith(out);
        placeCaretEnd(out);
        dirty();
        return;
      }
    }

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
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); ACTIONS.undo(); return; }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); ACTIONS.redo(); return; }
    // Ctrl+U was never in this table, so it fell through to Chromium and
    // inserted a native <u> — a different mechanism from the button's
    // `u-single`, which is why the style menu's "None" could not undo it.
    if (k === 'u') { e.preventDefault(); ACTIONS.underline(); return; }
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
