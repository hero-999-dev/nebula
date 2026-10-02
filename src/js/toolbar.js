/**
 * Two-row editing bar + the right-click mini bar.
 * Formatting execCommand can't express (underline styles, inline code,
 * equations) wraps the selection in a classed span — and underline styles are
 * EXCLUSIVE: applying one strips any previous underline wrapper so they can
 * never nest into each other.
 */

import { paperSize, marginMm, getWideOrientation, isFluid, sheetMm } from './page-mode.js';
import { toDocx, toOdt, toDoc, toEnex, enexToNotes, previewDocument, docxToHtml, odtToHtml, rtfToHtml, docKind } from './office.js';
import { prepareVideos, getVideoMode, setVideoMode, hasVideos } from './export-video.js';
import { initPdfPreview, PAGED } from './pdf-preview.js';
import { addShape } from './shapes.js';
import { insertCodeBlock } from './codeblock.js';
import { normalizeLists, exitListOnEmptyItem, liftListItemAtStart, carryLine, stepListItems } from './lists.js';
import { blockFromNode, convertBlock, exitQuoteOnEmptyLine, insertDivider as insertDividerAt, tidyAfterDelete, beforeDelete } from './blocks.js';
import { enterOutOfWrapper, backspaceOutOfWrapper, formatsAt, dropFormatsOnEmptyLine } from './inline-format.js';
import { applyInlineFamily, clearInlineFamilyAtCaret, cleanTypingMarkers } from './inline-family.js';
import { initEquation } from './equation.js';
import { on } from './bus.js';
import { toMarkdown, toHtml, toPrintDocument, toNebulaNote, safeFileName, FORMATS } from './export.js';
import { serializeNote } from './note-markup.js';
import { dropCopiedAnchor } from './arrows.js';
import { noteFromFile } from './import.js';
import { makeToggle } from './toggles.js';

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
  // The theme's own ink: it changes with Main, Dark, Light and White (0.9.2).
  ['Theme color (default)', ''],
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
  return Math.min(400, Math.max(5, Math.round(n)));
}

/** Does anything between `node` and the editor set a font or a size? */
export function hasExplicitFont(node, root) {
  for (let el = node?.nodeType === 1 ? node : node?.parentElement; el && el !== root; el = el.parentElement) {
    if (el.style?.fontFamily || el.style?.fontSize) return true;
    if (el.tagName === 'FONT' && (el.getAttribute('face') || el.getAttribute('size'))) return true;
  }
  return false;
}

export function initToolbar(editorEl, { onSave, shapes, arrows, history, noteTitle, noteLabels, onImport, onPaste, onLink, noteFont, setNoteFont, translate = (x) => x, onWideOrientation } = {}) {
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
   * One class from `classes`, replacing whichever one was already there — never
   * nesting them. An empty `cls` just clears the family.
   */
  function applyExclusive(classes, cls, extra = '') {
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    const parts = blockRanges(range);
    if (!parts.length) return;
    history?.push();
    applyInlineFamily(editorEl, parts, classes, cls, extra);
    dirty();
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

  /**
   * Switch a mark off where there is nothing to select.
   *
   * Formatting carries across Enter, so a new line inherits the wrappers of the
   * line above. Every one of these controls needs a SELECTION — that was the
   * fix for "a colour I did not ask for took the whole line" — and on a fresh
   * empty line there is nothing to select, so the mark could not be switched
   * off at all: "the underline part will not close", six times.
   *
   * With the caret inside a wrapper of the family and nothing selected: an
   * empty wrapper is taken away, and a wrapper with words in it is stepped out
   * of, so what comes next is typed outside it.
   *
   * @returns {boolean} whether it dealt with the press
   */
  function clearAtCaret(classes, extra = '') {
    const range = selectionInEditor();
    if (!range || !range.collapsed) return false;
    history?.push();
    if (!clearInlineFamilyAtCaret(editorEl, range, classes, extra)) return false;
    dirty();
    return true;
  }

  /** The line a node is in: the nearest block, never the editor. */
  function lineOf(node) {
    const el = blockAncestor(node);
    return el && el !== editorEl && editorEl.contains(el) ? el : null;
  }

  /** A line with nothing on it but a <br> (and empty formatting). */
  function isBlankLine(el) {
    return !el.textContent.replace(/\u200b/g, '').trim()
      && !el.querySelector('img, hr, .inline-eq, .note-image, .link-block, .blk-code, .note-mention, ul, ol, table');
  }

  function placeCaretAt(el, atEnd) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    if (atEnd) for (let t = text; t; t = walker.nextNode()) text = t;
    const r = document.createRange();
    if (text) r.setStart(text, atEnd ? text.nodeValue.length : 0);
    else r.setStart(el, atEnd ? el.childNodes.length : 0);
    r.collapse(true);
    if (!editorEl.contains(document.activeElement)) editorEl.focus({ preventScroll: true });
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
  }

  /**
   * The block right before (back) or after the caret's line — but only when
   * the caret stands at that edge of the line, with nothing drawn between:
   * no letter, no <br>, no picture. Otherwise null: the key edits inside the
   * line. (A <br> at the start of a list item is a line of its own: Backspace
   * after it removes it, it does not reach the block above.)
   */
  function neighbourAtEdge(back) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    const line = lineOf(r.startContainer);
    if (!line) return null;
    const side = document.createRange();
    side.selectNodeContents(line);
    if (back) side.setEnd(r.startContainer, r.startOffset);
    else side.setStart(r.startContainer, r.startOffset);
    if (side.toString().replace(/\u200b/g, '').length) return null;
    const between = side.cloneContents();
    const drawn = [...between.querySelectorAll('br, img, hr, .inline-eq, .note-mention, figure')];
    // Going forward, the <br> that only holds an empty line open is not drawn content.
    const holder = !back && drawn.length === 1 && drawn[0].nodeName === 'BR' && isBlankLine(line);
    if (drawn.length && !holder) return null;
    for (let el = line; el && el !== editorEl; el = el.parentElement) {
      let sib = back ? el.previousSibling : el.nextSibling;
      while (sib && sib.nodeType === Node.TEXT_NODE && !sib.nodeValue.trim()) sib = back ? sib.previousSibling : sib.nextSibling;
      if (sib) return sib.nodeType === Node.ELEMENT_NODE ? sib : null;
    }
    return null;
  }

  // A delete that joined two lines: Chromium's style spans and a list split in two (blocks.js).
  let beforeThisDelete = null;
  let deleteFromProse = false;
  editorEl.addEventListener('beforeinput', (e) => {
    beforeThisDelete = e.inputType?.startsWith('delete') ? beforeDelete(editorEl) : null;
    const at = window.getSelection()?.anchorNode;
    const host = at?.nodeType === Node.ELEMENT_NODE ? at : at?.parentElement;
    deleteFromProse = !!e.inputType?.startsWith('delete') && !host?.closest?.('.image-caption, .shape-text, .code-src');
  }, true);

  /**
   * After a delete in the prose the caret stays in the prose (0.9.3).
   *
   * Emptying a line under a picture, Chromium could leave the caret between
   * two blocks — on the editor itself — or carry it into the next picture's
   * caption, the nearest place it can type: "when I delete here the cursor
   * jumps straight to the caption" (the owner's Ideas note). The caret is put
   * back on a line where the words were, made if need be.
   */
  function keepCaretInProse() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const r = sel.getRangeAt(0);
    const node = r.startContainer;
    const host = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const caption = host?.closest?.('.image-caption');
    let spot = null;              // [parent, index] where an empty line goes
    if (caption && editorEl.contains(caption)) {
      const figure = caption.closest('.note-image');
      if (!figure || figure.closest('.shape-layer, .image-layer')) return;
      spot = [figure.parentNode, [...figure.parentNode.childNodes].indexOf(figure)];
    } else if (node === editorEl) {
      spot = [editorEl, r.startOffset];
    } else return;
    const [parent, index] = spot;
    const before = parent.childNodes[index - 1];
    const after = parent.childNodes[index];
    const usable = (el) => el?.nodeType === Node.ELEMENT_NODE && el.matches('p, div:not([class]), h1, h2, h3, blockquote, li') && !el.closest('.shape-layer');
    let line;
    if (usable(before)) line = before;
    else if (usable(after) && !caption) line = after;
    else {
      line = document.createElement('p');
      line.innerHTML = '<br>';
      parent.insertBefore(line, after ?? null);
    }
    if (caption && document.activeElement === caption) caption.blur();
    if (!editorEl.contains(document.activeElement) || document.activeElement !== editorEl) editorEl.focus({ preventScroll: true });
    placeCaretAt(line, line === before);
  }

  // A caret on the editor itself, between two blocks that are not lines — a
  // divider and a picture — stands on nothing: a click in that gap put one
  // there, blinking between them. Next to a picture in the text, the picture
  // is selected instead (0.9.3).
  //
  // A loose <br> in that gap is not a line either: the owner's Ideas note had
  // `<hr><br><figure>`, and the caret stood on it under the divider. It is
  // looked past, and goes. The check also runs after a delete: taking away
  // the picture under a divider left the caret between the divider and the
  // next picture without the selection changing — "the divider has a caret of
  // its own" (the owner, 0.9.3).
  let gapCheck = 0;
  // Which way the caret was sent last: a key, or none for a click.
  let lastKey = '';
  editorEl.addEventListener('keydown', (e) => { lastKey = e.key; }, true);
  editorEl.addEventListener('mousedown', () => { lastKey = ''; }, true);
  const loose = (n) => n && ((n.nodeType === Node.TEXT_NODE && !n.nodeValue.trim())
    || (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR'));
  function settleGap() {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed || sel.anchorNode !== editorEl) return;
    let before = editorEl.childNodes[sel.anchorOffset - 1];
    let after = editorEl.childNodes[sel.anchorOffset];
    const gap = [];
    while (loose(before)) { gap.push(before); before = before.previousSibling; }
    while (loose(after)) { gap.push(after); after = after.nextSibling; }
    const picture = [after, before].find((n) => n?.nodeType === Node.ELEMENT_NODE && n.matches('.note-image'));
    const line = (n) => n?.nodeType === Node.ELEMENT_NODE && n.matches('p, div:not([class]), h1, h2, h3, h4, h5, h6, li, blockquote, ul, ol');
    // Right beside a divider, on no line: ↓ or End → from the heading above it
    // put the caret there, and it blinked at the divider's left end — "the
    // divider has a caret of its own" (the owner, 0.9.3). It goes on the way
    // it was going: down or right to the line under the divider (a picture
    // there is selected), up or left to the end of the line above; with no
    // line that way, the divider is picked.
    const hr = [after, before].find((n) => n?.nodeType === Node.ELEMENT_NODE && n.matches('hr.blk-hr'));
    if (hr && !(picture && !line(before) && !line(after))) {
      const up = /^(ArrowUp|ArrowLeft|Backspace|PageUp|Home)$/.test(lastKey) ? true : (lastKey ? false : hr === after);
      const above = hr.previousElementSibling;
      const below = hr.nextElementSibling;
      if (up && line(above)) placeCaretAt(above, true);
      else if (!up && below?.matches('.note-image') && !below.closest('.shape-layer, .image-layer')) {
        // Beside the picture, where a picture's selection keeps the caret —
        // not above the divider, where a key typed next would land.
        const r = document.createRange();
        r.setStartBefore(below);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        editorEl.dispatchEvent(new CustomEvent('nebula-select-image', { detail: below }));
      }
      else if (!up && line(below)) placeCaretAt(below, false);
      else editorEl.dispatchEvent(new CustomEvent('nebula-pick-divider', { detail: hr }));
      return;
    }
    if (!picture || line(before) || line(after)) return;
    if (gap.some((n) => n.nodeType === Node.ELEMENT_NODE)) {
      history?.push();
      gap.forEach((n) => n.remove());
      dirty();
    }
    editorEl.dispatchEvent(new CustomEvent('nebula-select-image', { detail: picture }));
  }
  const settleSoon = () => {
    cancelAnimationFrame(gapCheck);
    gapCheck = requestAnimationFrame(settleGap);
  };
  document.addEventListener('selectionchange', settleSoon);
  editorEl.addEventListener('input', settleSoon);

  editorEl.addEventListener('input', (e) => {
    if (e.inputType?.startsWith('delete') && deleteFromProse) keepCaretInProse();
    if (e.inputType?.startsWith('delete')) tidyAfterDelete(editorEl, window.getSelection(), beforeThisDelete);
    // Enter copies the line's attributes onto the new line, its arrow anchor too.
    if (e.inputType === 'insertParagraph') dropCopiedAnchor(editorEl, window.getSelection());
  });
  editorEl.addEventListener('input', () => cleanTypingMarkers(editorEl, { preserveActive: true }));
  document.addEventListener('selectionchange', () => cleanTypingMarkers(editorEl, { preserveActive: true }));

  /**
   * Underline what is typed next, with nothing selected.
   *
   * Ctrl+B and Ctrl+I then typing gave bold and italic words; Ctrl+U then
   * typing gave plain ones, because underline needs a selection (above). The
   * caret now steps into an empty underline wrapper held open by a zero-width
   * marker, which the first typed letter replaces — the same marker Ctrl+U
   * uses to step out again (long-note trials, 0.8.9).
   */
  function underlineAtCaret(cls) {
    const range = selectionInEditor();
    if (!range || !range.collapsed) return false;
    const host = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    if (host?.closest('.blk-code, .code-src')) return false;
    history?.push();
    const span = document.createElement('span');
    span.className = cls;
    span.dataset.formatCaret = '';
    const text = document.createTextNode('​');
    span.appendChild(text);
    range.insertNode(span);
    const caret = document.createRange();
    caret.setStart(text, 1);
    caret.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(caret);
    dirty();
    return true;
  }

  const applyUnderline = (cls) => withSelection(() => {
    const want = cls === 'none' ? '' : cls;
    if (clearAtCaret(U_STYLES, 'u')) return;
    if (want && underlineAtCaret(want)) return;
    applyExclusive(U_STYLES, alreadyApplied(want) ? '' : want, 'u');
  });
  const applyTextColor = (cls) => withSelection(() => {
    if (clearAtCaret(colorClasses(TEXT_COLORS))) return;
    if (!cls) clearFixedInk();
    applyToBlockOrSelection(colorClasses(TEXT_COLORS), alreadyApplied(cls) ? '' : cls);
  });

  /**
   * "Theme color" also takes off the colours pasted text brought with it.
   *
   * Words copied from another page arrive as `style="color: rgb(0, 0, 0)"` or
   * `<font color>`, not as one of our classes, so the default ink never
   * reached them: in the Dark theme they stayed black on black (the owner's
   * snapshot, 0.9.2). Every element the selection touches, and the wrappers
   * around it inside its line, lets go of a fixed colour.
   */
  function clearFixedInk() {
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    const touched = new Set();
    const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement, NodeFilter.SHOW_TEXT);
    for (let t = walker.currentNode; t; t = walker.nextNode()) {
      if (t.nodeType !== Node.TEXT_NODE || !range.intersectsNode(t)) continue;
      for (let el = t.parentElement; el && el !== editorEl; el = el.parentElement) {
        touched.add(el);
        if (el.matches('p, li, h1, h2, h3, h4, h5, h6, blockquote, .blk-todo')) break;
      }
    }
    for (const el of touched) {
      if (el.style?.color) {
        el.style.removeProperty('color');
        if (!el.getAttribute('style')) el.removeAttribute('style');
      }
      if (el.tagName === 'FONT') el.removeAttribute('color');
    }
  }
  const applyHilite = (cls) => withSelection(() => {
    if (clearAtCaret(colorClasses(HILITE_COLORS))) return;
    applyToBlockOrSelection(colorClasses(HILITE_COLORS), alreadyApplied(cls) ? '' : cls);
  });

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

  /**
   * The block the caret is in, one level under the editor — or under a toggle
   * (0.9.3): its title and the lines of its body are blocks of their own, and
   * taking the whole toggle for them turned it into a to-do.
   */
  function blockOf() {
    const range = selectionInEditor();
    if (!range) return null;
    let el = range.startContainer;
    if (el.nodeType !== Node.ELEMENT_NODE) el = el.parentElement;
    const top = (p) => p === editorEl || p?.classList?.contains('toggle-body') || p?.classList?.contains('blk-toggle');
    while (el && !top(el.parentElement)) el = el.parentElement;
    return el && el !== editorEl && !el.classList.contains('toggle-body') ? el : null;
  }

  /**
   * The lines a Tab moves: the block each selected line is in — the line
   * itself, not the wrapper a font or colour put round several lines, which
   * took the heading above and the whole list along with it (0.9.3).
   */
  function indentBlocks() {
    const range = selectionInEditor();
    if (!range) return [];
    const out = new Set();
    const add = (node) => {
      const el = blockAncestor(node);
      if (el && el !== editorEl && !el.closest('.shape-layer, .blk-code')) out.add(el);
    };
    add(range.startContainer);
    if (!range.collapsed) {
      const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) if (range.intersectsNode(t) && t.nodeValue.trim()) add(t);
    }
    // An item's list moves as one block when the item itself cannot.
    return [...out].map((el) => (el.tagName === 'LI' ? el.parentElement : el))
      .filter((el, i, all) => all.indexOf(el) === i && !all.some((o) => o !== el && o.contains(el)));
  }

  function indent(delta) {
    history?.push();
    if (stepListItems(editorEl, window.getSelection(), delta)) {
      normalizeLists(editorEl);
      dirty();
      return;
    }
    const blocks = indentBlocks();
    if (!blocks.length) return;
    for (const el of blocks) {
      const next = stepIndent(el.dataset.ind, delta);
      if (next === 0) delete el.dataset.ind;
      else el.dataset.ind = String(next);
    }
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
    history?.push();
    placeCaretEnd(insertDividerAt(editorEl, window.getSelection()));
    dirty();
  }

  /** The caret's line becomes the title of a toggle list; in a title, the toggle goes back to lines. */
  function makeToggleHere() {
    const range = selectionInEditor();
    if (!range) return;
    const block = blockFromNode(range.startContainer, editorEl);
    if (!block || block.closest('.shape-layer, .blk-code')) return;
    history?.push();
    const toggle = makeToggle(block.matches('.blk-toggle > :first-child') ? block.parentElement.firstElementChild : block);
    const title = toggle.firstElementChild;
    const r = document.createRange();
    r.selectNodeContents(title);
    r.collapse(false);
    if (title.lastChild?.nodeName === 'BR') r.setStartBefore(title.lastChild);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
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
    setNoteFont?.({ size: px === 17 ? null : px });   // the note's writing size (0.9.3)
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
   * Every export that makes pages (PDF, Word, OpenDocument, Rich Text) opens
   * the preview first (0.9.3); videos go out with or without their picture.
   */
  async function exportNote(format) {
    const api = window.nebula?.note;
    const title = noteTitle?.() || 'Untitled';
    if (!api) { window.print(); return; }          // browser preview: no dialogs
    if (PAGED[format] && pdfPreview && api.pdfPreview) { pdfPreview.open(format); return; }
    if (format === 'pdf') {
      await api.pdf({ suggested: safeFileName(title, 'pdf'), document: await printDocument(title) });
      return;
    }
    await writeExport(format);
  }

  /** The note as stored, not as on screen — and its videos as this export takes them. */
  async function exportHtml() {
    // A selected picture or a shape being typed in must not travel to another computer inside the file.
    return prepareVideos(serializeNote(editorEl), getVideoMode(), { poster: (url) => window.nebula?.links?.videoPoster?.(url) });
  }

  /** The note's paper and margins (Nebula Wide: A4, the way it was last turned). */
  function exportPage() {
    const [w, h] = sheetMm(pageNow());
    return { w, h, margin: marginMm(pageNow()) };
  }

  /** Build the file for a format and hand it to the main process to save. */
  async function writeExport(format) {
    const api = window.nebula?.note;
    const title = noteTitle?.() || 'Untitled';
    const fmt = FORMATS.find((f) => f.id === format);
    const html = format === 'nebula' ? serializeNote(editorEl) : await exportHtml();
    const page = exportPage();
    const content = format === 'docx' ? await toDocx(html, title, page)
      : format === 'odt' ? await toOdt(html, title, page)
        : format === 'doc' || format === 'rtf' ? toDoc(html, title, page)
          : format === 'enex' ? toEnex(html, title)
            : format === 'html' ? toHtml(html, title)
              : format === 'nebula' ? toNebulaNote({ title, content: html, labels: noteLabels?.() })
                : toMarkdown(html, title);
    return api.export({ suggested: safeFileName(title, fmt?.ext || format), content, format });
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
  async function printDocument(title) {
    const page = editorEl.dataset.page;
    return toPrintDocument({ title, body: await exportHtml(), css: appStyles(), size: paperSize(page), margin: `${marginMm(page)}mm` });
  }

  const pageNow = () => editorEl.dataset.page || 'nw';
  const pdfPreview = window.nebula?.note?.pdfPreview ? initPdfPreview({
    overlay: document.getElementById('ov-pdf'),
    api: window.nebula.note,
    page: pageNow,
    // What the preview prints: the PDF's own document, or a file's blocks in its styles.
    document: async (format) => (format === 'pdf'
      ? printDocument(noteTitle?.() || 'Untitled')
      : previewDocument(await exportHtml(), noteTitle?.() || 'Untitled', exportPage())),
    save: (format, token) => (format === 'pdf'
      ? window.nebula.note.pdfSave({ token, suggested: safeFileName(noteTitle?.() || 'Untitled', 'pdf') })
      : writeExport(format)),
    hasVideos: () => hasVideos(serializeNote(editorEl)),
    onOrientation: () => onWideOrientation?.(),
    translate,
  }) : null;

  /** A .docx, .odt, .doc or .rtf's bytes as HTML; a binary .doc arrives as its text, read by the main process. */
  async function officeToHtml(name, bytes) {
    const ext = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();
    const kind = ext === 'doc' || ext === 'rtf' ? docKind(bytes) : ext;
    if (kind === 'docx' || kind === 'zip') return docxToHtml(bytes);
    if (kind === 'odt') return odtToHtml(bytes);
    if (kind === 'rtf') return rtfToHtml(new TextDecoder('windows-1252').decode(bytes));
    if (kind === 'html') return new TextDecoder().decode(bytes);
    if (kind === 'text') return new TextDecoder().decode(bytes).split(/\r?\n/).map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;') || '<br>'}</p>`).join('');
    return null;
  }

  async function importNote() {
    const api = window.nebula?.note;
    if (!api) return;
    const res = await api.import();
    if (!res?.ok) return;
    const cannot = () => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'That file could not be read' }));
    // Parsed and sanitised HERE: the main process only ever read bytes, and an
    // imported file is not allowed to bring markup the editor did not ask for.
    if (res.bytes) {
      // Word, OpenDocument and Rich Text (0.9.3): read to HTML here, then sanitised like any HTML file.
      const html = await officeToHtml(res.name, res.bytes).catch(() => null);
      if (html === null) { cannot(); return; }
      onImport?.(noteFromFile(res.name.replace(/\.[^.]+$/, '.html'), html));
      return;
    }
    // An Evernote export (Apple Notes, Bear, Joplin...): each of its notes, as a note.
    if (/\.enex$/i.test(res.name)) {
      let notes = [];
      try { notes = enexToNotes(res.text); } catch { cannot(); return; }
      for (const n of notes) {
        const note = noteFromFile(`${n.title}.html`, n.html);
        onImport?.({ ...note, title: n.title });
      }
      if (!notes.length) cannot();
      return;
    }
    onImport?.(noteFromFile(res.name, res.text));
  }

  function buildExportMenu() {
    const menu = document.getElementById('menu-export');
    if (!menu) return;
    menu.innerHTML = '<div class="tb-menu__label">Export this note</div>';
    // Videos with their picture, or as links only (0.9.3): for every export, remembered.
    const videos = document.createElement('div');
    videos.className = 'tb-menu__seg';
    videos.innerHTML = '<span class="seg-label">Videos</span><button type="button" data-videos="with">With</button><button type="button" data-videos="without">Without</button>';
    const paintVideos = () => {
      for (const b of videos.querySelectorAll('button')) {
        const on = b.dataset.videos === getVideoMode();
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      }
    };
    for (const b of videos.querySelectorAll('button')) {
      b.title = b.dataset.videos === 'with' ? 'Videos as they show in the note: the picture, linked' : 'Videos as their links only';
      b.addEventListener('click', (e) => { e.stopPropagation(); setVideoMode(b.dataset.videos); paintVideos(); });
    }
    paintVideos();
    menu.appendChild(videos);
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
    toggle: makeToggleHere,
    indent: () => indent(1),
    outdent: () => indent(-1),
    save: () => onSave?.(),
    // Through Electron, so Chromium lays the page out and hands the driver
    // text. `window.print()` let the platform rasterise it, which is what made
    // a printed note look like a photograph of the window.
    // Nebula Wide prints on A4 the way its last export was turned (pdf-preview.js).
    print: () => {
      const api = window.nebula?.note;
      const page = isFluid(pageNow()) && getWideOrientation() === 'portrait' ? 'nw-portrait' : pageNow();
      if (api?.print) void api.print({ page }); else window.print();
    },
    import: () => void importNote(),
    // Selected words become a link; with nothing selected it inserts one.
    link: () => onLink?.(),
    'export-md': () => void exportNote('md'),
    'export-html': () => void exportNote('html'),
    'export-pdf': () => void exportNote('pdf'),
    'export-docx': () => void exportNote('docx'),
    'export-odt': () => void exportNote('odt'),
    'export-doc': () => void exportNote('doc'),
    'export-rtf': () => void exportNote('rtf'),
    'export-enex': () => void exportNote('enex'),
    cut: () => cmd('cut'),
    copy: () => cmd('copy'),
    paste: () => void (onPaste ? onPaste() : pasteFromClipboard()),
    // Through the shapes controller when there is one, so a new shape arrives
    // selected with its colour bar open — adding one and then having to hunt
    // for it to recolour it is not the point of a shape button.
    // The button inserts whatever kind was chosen last — picking Circle from
    // the menu and then pressing the button again gave a rectangle.
    'shape-rect': () => insertShape(lastShape),
    codeblock: () => insertCodeBlock(editorEl, 'javascript', history),
    divider: () => insertDivider(),
    bold: () => { cmd('bold'); notePending('bold'); },
    italic: () => { cmd('italic'); notePending('italic'); },
    underline: () => { applyUnderline('u-single'); syncState(); },
    strike: () => { cmd('strikeThrough'); notePending('strikeThrough', 'strike'); },
    code: () => wrapSelection('inline-code'),
    eq: () => equation?.open(),
    color: () => applyTextColor(lastColor),
    hilite: () => applyHilite(lastHilite),
    al: () => cmd('justifyLeft'),
    ac: () => cmd('justifyCenter'),
    ar: () => cmd('justifyRight'),
    aj: () => cmd('justifyFull'),
  };
  // Only view (0.8.9): every action that would change the note does nothing;
  // the ones that read it — save, print, export, copy — and import (a new note) stay.
  {
    const READING = new Set(['save', 'print', 'export-md', 'export-html', 'export-pdf', 'export-docx', 'export-odt', 'export-doc', 'export-rtf', 'export-enex', 'copy', 'import']);
    for (const name of Object.keys(ACTIONS)) {
      if (READING.has(name)) continue;
      const run = ACTIONS[name];
      ACTIONS[name] = (...args) => (editorEl.dataset.readonly === 'true' ? undefined : run(...args));
    }
  }

  const toolbarMenus = [...toolbar.querySelectorAll('.tb-menu')];
  // A scrolling rail clips descendants even when they have a high z-index.
  // Keep the menus in the viewport and keep their event delegation with them.
  for (const menu of toolbarMenus) {
    document.body.appendChild(menu);
    Object.assign(menu.style, { position: 'fixed', right: 'auto', bottom: 'auto', zIndex: '160' });
  }
  let openMenu = null;
  let menuAnchor = null;

  function positionMenu() {
    if (!openMenu || openMenu.hidden || !menuAnchor) return;
    const anchor = menuAnchor.getBoundingClientRect();
    const shell = document.getElementById('edit-shell');
    const margin = 8;
    openMenu.style.maxHeight = `${Math.min(520, window.innerHeight - 2 * margin)}px`;
    const rect = openMenu.getBoundingClientRect();
    let x = anchor.left;
    let y = anchor.bottom + 4;
    if (shell?.classList.contains('bar-left')) { x = anchor.right + 4; y = anchor.top; }
    else if (shell?.classList.contains('bar-right')) { x = anchor.left - rect.width - 4; y = anchor.top; }
    else if (shell?.classList.contains('bar-bottom')) y = anchor.top - rect.height - 4;
    else if (y + rect.height > window.innerHeight - margin && anchor.top > rect.height) y = anchor.top - rect.height - 4;
    openMenu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))}px`;
    openMenu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))}px`;
  }

  function keepSelection(e) {
    if (!e.target.closest('input, select')) e.preventDefault(); // keep the selection
  }
  toolbar.addEventListener('mousedown', keepSelection);
  toolbarMenus.forEach((menu) => menu.addEventListener('mousedown', keepSelection));

  function toolbarClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act && ACTIONS[act]) { closeMenus(); ACTIONS[act](); return; }

    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
      const menu = document.getElementById(menuBtn.dataset.menu);
      if (!menu) return;
      const wasOpen = !menu.hidden;
      closeMenus();
      menu.hidden = wasOpen;
      if (!wasOpen) {
        openMenu = menu;
        menuAnchor = menuBtn;
        positionMenu();
      }
      return;
    }
    const ustyle = e.target.closest('[data-ustyle]')?.dataset.ustyle;
    if (ustyle) { applyUnderline(ustyle); closeMenus(); return; }

    const shapeKind = e.target.closest('[data-shape-add]')?.dataset.shapeAdd;
    if (shapeKind) { lastShape = shapeKind; insertShape(shapeKind); closeMenus(); }
    const arrowKind = e.target.closest('[data-arrow-add]')?.dataset.arrowAdd;
    if (arrowKind) { arrows?.add(arrowKind); closeMenus(); }
  }
  toolbar.addEventListener('click', toolbarClick);
  toolbarMenus.forEach((menu) => menu.addEventListener('click', toolbarClick));

  function closeMenus() {
    toolbarMenus.forEach((m) => { m.hidden = true; });
    openMenu = null;
    menuAnchor = null;
  }
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.tb-wrap, .tb-menu')) closeMenus();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  window.addEventListener('resize', positionMenu);
  toolbar.addEventListener('scroll', positionMenu);

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
    withSelection(() => {
      const kind = e.target.value === 'p' ? 'text' : e.target.value;
      const block = blockFromNode(window.getSelection()?.anchorNode, editorEl);
      if (block && convertBlock(block, kind)) dirty();
    });
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
    // The font picked last is the note's writing font (0.9.3): a new line is
    // written in it. The owner: "I picked a font in a note and I am writing —
    // that is the default for that note now, where I left off; the places I
    // wrote in other fonts keep those". The serif is the app's own and means
    // "none". Nothing already written changes.
    setNoteFont?.({ family: stack === FONTS[0][1] ? null : stack });
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
  // 5 to 9 too (0.9.3): at real size a note's 12px is 9 pt on paper, and smaller is asked for.
  const SIZES = [5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 48, 72];
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

  /**
   * The note's writing font, if what is typed at this caret would take it:
   * a new, empty line with no font of its own, outside code, captions and
   * shapes. A heading keeps its own size.
   */
  function writingFontAt(range) {
    const font = noteFont?.();
    if (!font || (!font.family && !font.size) || !range?.collapsed) return null;
    const host = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    if (!host || host.closest('.code-src, .blk-code, .shape-layer, .image-caption, .inline-code, .note-mention, .note-tag, .inline-eq')) return null;
    const block = blockAncestor(host);
    if (!block || block === editorEl || block.textContent.replace(/\u200b/g, '').length) return null;
    if (hasExplicitFont(host, editorEl)) return null;
    const heading = block.matches('h1, h2, h3, h4, h5, h6');
    return { family: font.family || null, size: heading ? null : font.size || null };
  }

  // Typing on a new line in a note with a writing font: the letter goes into
  // a span in that font. Inserted here rather than left to the browser, so the
  // letter lands in it and nothing is left behind if nothing is typed.
  editorEl.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertText' || !e.data || e.isComposing) return;
    const range = selectionInEditor();
    const font = writingFontAt(range);
    if (!font || (!font.family && !font.size)) return;
    e.preventDefault();
    history?.typed();          // the step before this letter, as any typing does
    const span = document.createElement('span');
    if (font.family) span.style.fontFamily = font.family;
    if (font.size) span.style.fontSize = `${font.size}px`;
    span.textContent = e.data;
    const block = blockAncestor(range.startContainer);
    const placeholder = block.childNodes.length === 1 && block.firstChild.nodeName === 'BR' ? block.firstChild : null;
    range.insertNode(span);
    placeholder?.remove();
    const caret = document.createRange();
    caret.setStart(span.firstChild, span.firstChild.nodeValue.length);
    caret.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(caret);
    dirty();
  }, true);

  /** Reflect what the caret actually sits in — the selects stay in sync. */
  function syncState() {
    const range = selectionInEditor();
    if (!range) return;
    let el = range.startContainer;
    if (el.nodeType !== Node.ELEMENT_NODE) el = el.parentElement;
    if (!el) return;
    const cs = getComputedStyle(el);
    // On a new line of a note with a writing font, the bar shows what will be typed.
    const writing = writingFontAt(range);
    if (fontName) {
      const fam = firstFamily(writing?.family || cs.fontFamily);
      fontName.textContent = fontLabelFor(fam) ?? fam ?? 'Font';
    }
    if (document.activeElement !== sizeInput) {
      const px = writing?.size || Math.round(parseFloat(cs.fontSize));
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
    // Switched with nothing selected, a mark changes only what is typed next:
    // the note does not have it yet, so until the caret moves or the words are
    // typed, the button shows what it was just switched to (notePending).
    const pend = pending && range.collapsed && range.startContainer === pending.node && range.startOffset === pending.offset
      ? pending.marks : null;
    toolbar.querySelectorAll('[data-act]').forEach((b) => {
      const mark = MARKS[b.dataset.act];
      if (!mark) return;
      b.classList.toggle('active', pend && b.dataset.act in pend ? pend[b.dataset.act] : wearing(mark));
    });
  }

  /**
   * Ctrl+B, Ctrl+I and the buttons with a bare caret. Chromium only changes
   * its typing state, no selectionchange follows, and the caret's DOM still
   * says the old thing — so the bar did not move until typing began ("Ctrl+B
   * works but the bold button up there does not change", the owner's Bug
   * Finding note, 0.9.2). The typing state is asked for right here, where it
   * is exactly the thing that was switched, not read back at a boundary later
   * (HANDOVER 40).
   */
  let pending = null;
  function notePending(command, act = command) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed || !editorEl.contains(sel.anchorNode)) { pending = null; syncState(); return; }
    const r = sel.getRangeAt(0);
    const same = pending && pending.node === r.startContainer && pending.offset === r.startOffset;
    const marks = same ? pending.marks : {};
    marks[act] = document.queryCommandState(command);
    pending = { node: r.startContainer, offset: r.startOffset, marks };
    syncState();
  }
  // Once the words are typed the note itself carries the mark.
  editorEl.addEventListener('input', () => { pending = null; });
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
    // Editing a nested text host intersects its ancestor overlay too, but is
    // not a request to delete that overlay.
    if (e.target.closest('.shape-text, .code-src, .image-caption')) return;
    if (!e.inputType?.startsWith('delete')) {
      editorEl.querySelectorAll('hr.blk-hr.armed').forEach((h) => h.classList.remove('armed'));
      return;
    }
    const insideText = (() => {
      if (e.inputType !== 'deleteContentBackward') return false;
      const caret = window.getSelection();
      if (!caret?.rangeCount || !caret.isCollapsed) return false;
      const node = caret.getRangeAt(0).startContainer;
      return node.nodeType === Node.TEXT_NODE && caret.getRangeAt(0).startOffset > 0
        && !!node.textContent.trim();
    })();
    // A picture in the text is not a letter. Backspace at the start of the line
    // under it, or Delete at the end of the line above, took it away in one
    // press with nothing to show it was going (the owner's Ideas note, 0.9.3).
    // The first press selects it, as a divider is armed; the next one — the
    // picture's own delete — takes it. Only a caret at the very EDGE of its
    // line counts: the first 0.9.3 build also caught the letter at the start
    // of a line ("R" under a picture could not be deleted — the picture was
    // selected instead), and an empty line under a picture could not go.
    const back = e.inputType === 'deleteContentBackward';
    const edge = back ? neighbourAtEdge(true) : e.inputType === 'deleteContentForward' ? neighbourAtEdge(false) : null;
    if (edge?.matches?.('.note-image') && !edge.closest('.shape-layer, .image-layer')) {
      e.preventDefault();
      const line = lineOf(window.getSelection().getRangeAt(0).startContainer);
      const next = line && (back ? line.nextElementSibling : line.previousElementSibling);
      if (line && isBlankLine(line)) {
        // An empty line beside a picture simply goes: the picture, or the
        // words after it, move up ("I cannot bring the picture up", the
        // owner's Ideas note, 0.9.3 — under a divider the line stayed). With
        // no line of text to stand in, the picture is selected; Enter on it
        // opens a line under it again.
        history?.push();
        line.remove();
        if (next && !next.matches('.note-image, hr, .blk-code, .link-block, .shape-layer, .image-layer')) placeCaretAt(next, !back);
        else editorEl.dispatchEvent(new CustomEvent('nebula-select-image', { detail: edge }));
        dirty();
        return;
      }
      editorEl.dispatchEvent(new CustomEvent('nebula-select-image', { detail: edge }));
      return;
    }
    // Backspace at the start of a line under an empty line: the empty line goes
    // and the caret stays where it is. Left to Chromium, the join could leave
    // the caret at the far end of the line (under a picture, the owner's Ideas
    // note, 0.9.3), and the next Backspace ate the last letter instead.
    if (back && edge?.matches?.('p, div:not([class])') && edge.parentElement && isBlankLine(edge)
      && !edge.querySelector('*:not(br, span, b, strong, i, em, u, s, font)')) {
      e.preventDefault();
      history?.push();
      const sel = window.getSelection();
      const keep = sel.getRangeAt(0).cloneRange();
      edge.remove();
      sel.removeAllRanges();
      sel.addRange(keep);
      dirty();
      return;
    }
    // Before the target ranges: next to a picture Chromium may report none.
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
    if (touching('.shape-layer, .image-layer, .link-block').length) {
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
    const caretSelection = window.getSelection();
    // A deliberate text selection is not a request to arm the previous divider.
    if (caretSelection?.rangeCount && !caretSelection.isCollapsed) return;

    // From the caret's line when it is in one (a <br> before the caret is not
    // the start of the line); from the delete's own range when it is not.
    const inLine = caretSelection?.rangeCount && lineOf(caretSelection.getRangeAt(0).startContainer);
    const before = back ? (inLine ? neighbourAtEdge(true) : mergeTarget()) : null;
    const hrs = [...new Set([
      ...touching('hr.blk-hr'),
      ...(before?.classList?.contains('blk-hr') ? [before] : []),
    ])];
    if (!insideText && hrs.length === 1) {
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
      block = block?.closest('p,div,h1,h2,h3,h4,h5,h6,li,blockquote');

      const isEmptyBlock = (el) => el && el !== hr && !el.textContent.trim()
        && !el.querySelector('hr,.blk-code,.shape-layer,.image-layer,.link-block,img');
      const placeCaretAtStart = (el) => {
        if (!el) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const text = walker.nextNode();
        const r = document.createRange();
        if (text) r.setStart(text, 0);
        else r.setStart(el, 0);
        r.collapse(true);
        caret.removeAllRanges();
        caret.addRange(r);
      };

      // The caret is often at the start of the text block AFTER the blank
      // paragraph.  Looking only at `block.previousElementSibling === hr`
      // therefore armed the divider while the gap remained in place.
      const gap = block?.previousElementSibling;
      if (block && gap && isEmptyBlock(gap) && gap.previousElementSibling === hr) {
        history?.push();
        gap.remove();
        placeCaretAtStart(block);
        dirty();
        return;
      }

      if (isEmptyBlock(block) && block.previousElementSibling === hr) {
        history?.push();
        const after = block.nextElementSibling;
        block.remove();
        // Only into a line of text: at the start of a picture or a code block
        // the next Backspace worked on that instead of the divider (0.8.9).
        if (after && !after.matches('.note-image, .blk-code, .link-block, hr, .shape-layer, .image-layer')) {
          placeCaretAtStart(after);
        } else if (after?.matches('.note-image') && !after.closest('.shape-layer, .image-layer')) {
          // A picture right under the divider comes up. A caret left between
          // the two stood on no line at all and blinked there — "a cursor
          // between the divider and the picture" (the owner, 0.9.3) — so
          // something is picked instead: going backwards (Backspace), the
          // divider, which the next Backspace takes away; going forwards
          // (Delete), the picture. Picking the picture on Backspace made the
          // next Backspace delete it: a /divider typed and taken back with
          // Backspace cost the picture under it (the long-note trials, 0.9.3).
          editorEl.dispatchEvent(back
            ? new CustomEvent('nebula-pick-divider', { detail: hr })
            : new CustomEvent('nebula-select-image', { detail: after }));
        } else {
          const r = document.createRange();
          r.setStartAfter(hr);
          r.collapse(true);
          caret.removeAllRanges();
          caret.addRange(r);
        }
        dirty();
        return;
      }

      if (hr.classList.contains('armed')) {
        // Removed here rather than left to the browser: at this boundary its own
        // backward delete merges the blocks around the divider and leaves the
        // divider itself alone, so the second press appeared to do nothing.
        history?.push();
        const above = hr.previousElementSibling;
        hr.remove();
        // Backspace goes backwards: with the divider gone the caret joins the
        // end of the line above, where it was before Enter and /divider. It
        // stayed at the start of the line below, so the next word typed landed
        // in the wrong paragraph (long-note trials, 0.8.9).
        if (above && !above.matches('.shape-layer, .image-layer, .link-block, .blk-code, hr, .note-image')) {
          const r = document.createRange();
          r.selectNodeContents(above);
          r.collapse(false);
          const walker = document.createTreeWalker(above, NodeFilter.SHOW_TEXT);
          let last = null;
          for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.nodeValue.trim()) last = t;
          if (last) r.setStart(last, last.nodeValue.replace(/\s+$/, '').length);
          r.collapse(true);
          caret.removeAllRanges();
          caret.addRange(r);
        }
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
  /**
   * Ctrl+Z / Ctrl+Y are the note's, wherever the key lands.
   *
   * A code block owns its keys, so Ctrl+Z there reached Chromium's own undo,
   * which knows the insertHTML that made the block and nothing Nebula did by
   * script: undo took the code block out behind Nebula's back, and the next
   * Ctrl+Z or Ctrl+Y — pressed with the focus gone to the page, since the
   * block that had it was gone — brought it back (long-note trials, 0.8.9).
   * @returns {boolean} whether the key was undo or redo
   */
  const undoKey = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); ACTIONS.undo(); return true; }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); ACTIONS.redo(); return true; }
    return false;
  };

  editorEl.addEventListener('keydown', (e) => {
    if (e.target.closest('.code-src')) { undoKey(e); return; } // code blocks own their other keys
    const mod = e.ctrlKey || e.metaKey;
    // Shape text owns normal editing keys. App undo/save shortcuts below still
    // apply, but paragraph/list/divider handlers must not escape this host.
    if (e.target.closest('.shape-text, .image-caption') && !mod) return;

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
    // An empty item one level in: Enter brings it back out a level, as in any
    // editor. Chromium's own answer left a list inside a list with no item
    // around it (found inside a toggle list, 0.9.3).
    if (!mod && e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      const at = sel?.isCollapsed ? sel.anchorNode : null;
      const li = (at?.nodeType === Node.ELEMENT_NODE ? at : at?.parentElement)?.closest?.('li');
      if (li && editorEl.contains(li) && li.parentElement?.parentElement?.tagName === 'LI'
        && !li.textContent.replace(/\u200b/g, '').trim() && !li.querySelector('ul, ol, img')) {
        e.preventDefault();
        history?.push();
        stepListItems(editorEl, sel, -1);
        normalizeLists(editorEl);
        dirty();
        return;
      }
    }
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
    // Enter on an empty quote line leaves the quote (Chromium would start another).
    if (!mod && e.key === 'Enter' && !e.shiftKey && blockOf()?.closest('blockquote')) {
      history?.push();
      if (exitQuoteOnEmptyLine(editorEl, window.getSelection())) {
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
        // The line after keeps the font the to-dos were written in (lists.js carryLine).
        const out = carryLine(here, document.createElement('p'));
        here.replaceWith(out);
        const at = document.createRange();
        at.setStartBefore(out.querySelector('br'));
        at.collapse(true);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(at);
        dirty();
        return;
      }
    }

    // Bold/italic switched off before Enter stay off on the new line; Chromium
    // would copy them from the text before the caret. See inline-format.js.
    if (!mod && e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      const here = sel?.isCollapsed ? formatsAt(sel.anchorNode, editorEl) : {};
      const off = ['bold', 'italic'].filter((k) => here[k] && !document.queryCommandState(k));
      if (off.length) setTimeout(() => { if (dropFormatsOnEmptyLine(editorEl, window.getSelection(), off)) dirty(); }, 0);
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
    // Chromium applies Ctrl+B and Ctrl+I itself; the bar follows right after.
    if ((k === 'b' || k === 'i') && !e.shiftKey && !e.altKey) {
      setTimeout(() => notePending(k === 'b' ? 'bold' : 'italic'), 0);
    }
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
  function miniBarAt(x, y) {
    if (!miniBar) return;
    miniBar.hidden = false;
    const w = miniBar.offsetWidth || 260;
    miniBar.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
    miniBar.style.top = `${Math.max(8, y - 44)}px`;
  }
  editorEl.addEventListener('contextmenu', (e) => {
    // In the app the right-click goes to the main process first, which alone
    // knows about a misspelt word; context-menu.js opens the bar from there.
    // Taking the event here would stop that from ever arriving (0.9.3).
    if (window.nebula?.contextMenu) return;
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    e.preventDefault();
    miniBarAt(e.clientX, e.clientY);
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
    // Nothing focused (the page itself): Chromium's undo would edit the note unseen.
    if (e.target === document.body || e.target === document.documentElement) undoKey(e);
  });

  return { actions: ACTIONS, syncState, miniBarAt };
}
