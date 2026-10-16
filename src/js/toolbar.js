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
import { pickTableSize } from './table-size.js';
import { insertTable, hiliteCells, alignCells, tableAt } from './table.js';
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
import { makeToggle, unmakeToggle, toggleHandled } from './toggles.js';
import { icon } from './icons.js';

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
  // "Serif", not "Serif (default)" (the owner, 0.9.4): what a new note is written in is chosen in Settings now.
  ['Serif', '"Charter", "Iowan Old Style", Georgia, serif'],
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

/**
 * A font name as it may be kept: one line, no quotes or punctuation that would
 * end a CSS value, not endless. '' when nothing usable is left. Pure — tested.
 */
export function cleanFontName(raw) {
  return Array.from(String(raw ?? '').replace(/["'`;{}<>\\,]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 60).join(''); // characters, not UTF-16 units: never half an emoji (hunt B24)
}

/** A font stack as it may be kept: nothing in it that could end a CSS value, not endless. */
export function cleanFontStack(raw) {
  return Array.from(String(raw ?? '').replace(/[;{}<>\\()@!]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 200).join(''); // characters, not UTF-16 units: never half an emoji (hunt B24)
}

/** The stack a font added by name is written with: quoted, and a generic after it. */
export function customFontStack(name) {
  return `"${cleanFontName(name)}", serif`;
}

/**
 * The font menu's rows for what was typed in its search (0.9.4): the app's
 * own fonts and the ones the reader added first, then the fonts of this
 * computer that are not among them. Pure — tested.
 * Pinned fonts (0.9.4: "a pin beside the fonts, so the ones I like stand at
 * the top") come first, in the order they were pinned.
 * @param {string} query
 * @param {{custom?: string[], installed?: string[], pinned?: string[], limit?: number}} [have]
 * @returns {{own: Array<{label: string, stack: string, custom: boolean, pinned: boolean}>, installed: string[], add: string}}
 *   `add` is the name typed when no row is exactly it — the name "Add" would add
 */
export function fontRows(query, { custom = [], installed = [], pinned = [], limit = 40 } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  const known = new Set(FONTS.map(([, stack]) => firstFamily(stack).toLowerCase()));
  const mine = [];
  for (const name of custom) {
    const clean = cleanFontName(name);
    if (!clean || known.has(clean.toLowerCase())) continue;
    known.add(clean.toLowerCase());
    mine.push({ label: clean, stack: customFontStack(clean), custom: true });
  }
  const pins = pinned.map((name) => String(name ?? '').toLowerCase());
  const place = (row) => pins.indexOf(row.label.toLowerCase());
  const every = [...FONTS.map(([label, stack]) => ({ label, stack, custom: false })), ...mine]
    .map((row) => ({ ...row, pinned: place(row) >= 0 }));
  const own = [...every.filter((row) => row.pinned).sort((a, b) => place(a) - place(b)), ...every.filter((row) => !row.pinned)]
    .filter((row) => !q || row.label.toLowerCase().includes(q) || firstFamily(row.stack).toLowerCase().includes(q));
  const seen = new Set();
  const others = [];
  for (const family of installed) {
    const key = String(family || '').toLowerCase();
    if (!key || known.has(key) || seen.has(key) || (q && !key.includes(q))) continue;
    seen.add(key);
    others.push(family);
  }
  others.sort((a, b) => a.localeCompare(b));
  const typed = cleanFontName(query);
  const exact = typed && (known.has(typed.toLowerCase()) || FONTS.some(([label]) => label.toLowerCase() === typed.toLowerCase()) || seen.has(typed.toLowerCase()));
  return { own, installed: others.slice(0, limit), add: typed && !exact ? typed : '' };
}

/** The fonts the reader added to the menu, and the ones pinned to its top: names, kept on this computer. */
const CUSTOM_FONTS_KEY = 'nebula:fonts';
const PINNED_FONTS_KEY = 'nebula:fonts-pinned';
const FONT_STACKS_KEY = 'nebula:font-stacks';
function readNames(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function writeNames(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, 60))); } catch { /* this session only */ }
}
export const readCustomFonts = () => readNames(CUSTOM_FONTS_KEY);
export const readPinnedFonts = () => readNames(PINNED_FONTS_KEY);

/** The font used last — picked from the menu, or brought in by a paste: `{label, stack}`. */
const LAST_FONT_KEY = 'nebula:font-last';
/**
 * A font as the menu remembers it used: its name and the stack it is written
 * with; null for anything that names no font. Pure — tested.
 */
export function lastFontOf(stack) {
  const clean = cleanFontStack(stack);
  const family = cleanFontName(firstFamily(clean));
  if (!family) return null;
  return { label: fontLabelFor(family) ?? family, stack: clean };
}
export function readLastFont() {
  try { return lastFontOf(JSON.parse(localStorage.getItem(LAST_FONT_KEY) || 'null')?.stack); } catch { return null; }
}

/**
 * The pinned names after a press on a font's pin: taken off when it was on,
 * put at the end when it was not. Pure — tested.
 */
export function togglePinned(pinned, label) {
  const key = String(label ?? '').toLowerCase();
  if (!key) return [...pinned];
  const without = pinned.filter((name) => String(name).toLowerCase() !== key);
  return without.length === pinned.length ? [...pinned, String(label)] : without;
}

/** The size the note is written in where nothing says otherwise: app.css `.editor` (tests/settings.test.js holds the two together). */
export const BASE_FONT_SIZE = 14;

/** The common sizes, behind the size box's caret — and what Settings offers a new note. */
// 5 to 9 too (0.9.3): at real size a note's 12px is 9 pt on paper, and smaller is asked for.
export const FONT_SIZES = [5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 48, 72];

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

  /**
   * The bars under A and H show the real colour of the theme that is on — on
   * the editing bar, and on the small bar over selected words, which the
   * right-click menu copies ("text colour and highlight have no picture under
   * them there", the owner, 0.9.4).
   */
  function paintColorBars() {
    const color = lastColor ? tokenValue(lastColor, 'color') : 'var(--ink)';
    const hilite = lastHilite ? tokenValue(lastHilite, 'backgroundColor') : 'transparent';
    for (const bar of [colorBar, ...document.querySelectorAll('.tb-bar[data-bar="color"]')]) if (bar) bar.style.background = color;
    for (const bar of [hiliteBar, ...document.querySelectorAll('.tb-bar[data-bar="hilite"]')]) if (bar) bar.style.background = hilite;
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
  function applyExclusive(classes, cls, extra = '', fixed = '') {
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    const parts = blockRanges(range);
    if (!parts.length) return;
    history?.push();
    applyInlineFamily(editorEl, parts, classes, cls, extra, fixed);
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
  function applyToBlockOrSelection(classes, cls, fixed = '') {
    const range = selectionInEditor();
    // Selection only. This used to fall back to the whole block when nothing
    // was selected, which is how "I did not select anywhere, I press change
    // colour and everything changes" happened — the same complaint the font
    // picker had, and the same answer.
    if (!range || range.collapsed) return;
    applyExclusive(classes, cls, '', fixed);
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
    // In a line with no words the caret stands before the <br> that holds it
    // open, never after it: after it, it is drawn in the same place and is not
    // at the start of the line to anything that asks (see placeCaretEnd).
    else r.setStart(el, atEnd ? el.childNodes.length - (el.lastChild?.nodeName === 'BR' ? 1 : 0) : 0);
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
    // The <br> that only holds an empty line open is not drawn content: going
    // forward, and — outside a list — going back too. A caret after it is at
    // the start of that line all the same; read as "inside the line", a
    // Backspace on the new line under a divider was left to the browser, which
    // took the divider at once and kept the line (the owner's Ideas note, 0.9.4).
    const holder = drawn.length === 1 && drawn[0].nodeName === 'BR' && isBlankLine(line) && (!back || !line.matches('li'));
    if (drawn.length && !holder) return null;
    for (let el = line; el && el !== editorEl; el = el.parentElement) {
      let sib = back ? el.previousSibling : el.nextSibling;
      while (sib && sib.nodeType === Node.TEXT_NODE && !sib.nodeValue.trim()) sib = back ? sib.previousSibling : sib.nextSibling;
      if (sib) return sib.nodeType === Node.ELEMENT_NODE ? sib : null;
    }
    return null;
  }

  /**
   * A caret on the note itself, before a line, stands in that line. A note
   * opens with it there, and a click on the first line does not move it: to
   * the browser the two places are one. The rules below read the caret's line,
   * and found none — with an empty first line over a picture, Delete took the
   * picture and the line under it in one press.
   */
  function standInLine() {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return;
    const { startContainer: host, startOffset: at } = sel.getRangeAt(0);
    if (host !== editorEl && !host.classList?.contains('blk-col')) return;
    const line = host.childNodes[at];
    if (line?.nodeType === Node.ELEMENT_NODE && line.matches('p, div:not([class]), h1, h2, h3, h4, h5, h6')) placeCaretAt(line, false);
  }

  /**
   * An empty line that a delete has nothing to join to, and that goes all the
   * same: the first line of the note or of a column, with something under it
   * (Backspace), and an empty line over a table or a video (Delete — over a
   * picture it went already). The owner, with a table, a video and a picture
   * each at the top of a column and an empty line over each (the "urgent
   * bugs" note, 0.9.4): "none of the three works — I click the caret up there
   * and cannot take it back".
   *
   * The caret goes where it can stand next: the line over it (Delete), the
   * first cell of a table, the line that follows; a picture with no line to go
   * to is selected.
   * @returns {boolean} whether a line went
   */
  function dropEmptyLine(back) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return false;
    const line = lineOf(sel.getRangeAt(0).startContainer);
    const host = line?.parentElement;
    if (!line || !(host === editorEl || host.classList.contains('blk-col'))) return false;
    if (!line.matches('p, div:not([class]), h1, h2, h3, h4, h5, h6') || !isBlankLine(line)) return false;
    const step = (el, side) => { let to = el[side]; while (to?.matches('.shape-layer, .image-layer')) to = to[side]; return to; };
    const over = step(line, 'previousElementSibling');
    const under = step(line, 'nextElementSibling');
    if (!under || (back ? over : !under.matches('.blk-table, .link-block'))) return false;
    history?.push();
    line.remove();
    const TEXT = 'p, div:not([class]), h1, h2, h3, h4, h5, h6, blockquote, li';
    const lineIn = (el) => (el.matches(TEXT) ? el : el.matches('.blk-cols, .blk-toggle, ul, ol') ? el.querySelector(TEXT) : null);
    const cell = under.matches('.blk-table') ? under.querySelector('td') : null;
    // A card above the empty line a Backspace takes away: the card is offered,
    // as a picture is - the next press removes it (rich-paste.js picks it).
    if (back && over?.matches('.link-block')) {
      editorEl.dispatchEvent(new CustomEvent('nebula-pick-card', { detail: over }));
      dirty();
      return true;
    }
    if (!back && over?.matches(TEXT)) placeCaretAt(over, true);
    else if (cell) placeCaretAt(cell, false);
    else {
      let to = null;
      for (let el = under; el && !to; el = step(el, 'nextElementSibling')) to = lineIn(el);
      if (to) placeCaretAt(to, false);
      else if (under.matches('.note-image')) editorEl.dispatchEvent(new CustomEvent('nebula-select-image', { detail: under }));
      else if (under.matches('.link-block')) editorEl.dispatchEvent(new CustomEvent('nebula-pick-card', { detail: under }));
    }
    dirty();
    return true;
  }

  // A delete that joined two lines: Chromium's style spans and a list split in two (blocks.js).
  let beforeThisDelete = null;
  let deleteFromProse = false;
  editorEl.addEventListener('beforeinput', (e) => {
    beforeThisDelete = e.inputType?.startsWith('delete') ? beforeDelete(editorEl) : null;
    const at = window.getSelection()?.anchorNode;
    const host = at?.nodeType === Node.ELEMENT_NODE ? at : at?.parentElement;
    deleteFromProse = !!e.inputType?.startsWith('delete') && !host?.closest?.('.image-caption, .shape-text, .code-src, .blk-table');
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
  // A key pressed in the note before it lost the focus, or in the note before
  // this one, did not bring the caret to where it is now.
  editorEl.addEventListener('blur', () => { lastKey = ''; });
  editorEl.addEventListener('nebula-note-load', () => { lastKey = ''; });
  const loose = (n) => n && ((n.nodeType === Node.TEXT_NODE && !n.nodeValue.trim())
    || (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR'));
  function settleGap() {
    const sel = window.getSelection();
    // On the note itself — or on a column of it, which is a flow of its own
    // (0.9.4): a caret left there beside a divider stood pressed against it.
    const host = sel?.anchorNode;
    if (!sel?.rangeCount || !sel.isCollapsed || !host) return;
    if (host !== editorEl && !(host.nodeType === Node.ELEMENT_NODE && host.classList.contains('blk-col') && editorEl.contains(host))) return;
    let before = host.childNodes[sel.anchorOffset - 1];
    let after = host.childNodes[sel.anchorOffset];
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
      // No key brought it there — a note opened with a divider first, a click:
      // the divider is not picked, or the first Backspace would take it (0.9.6,
      // found by the old-notes trials). The line under it has the caret, if any.
      else if (!lastKey) { if (line(below)) placeCaretAt(below, false); }
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
    // A colour written into the selected words themselves comes off (0.9.5): ours could not show through it.
    applyToBlockOrSelection(colorClasses(TEXT_COLORS), alreadyApplied(cls) ? '' : cls, 'color');
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
    // In a table the colour is the back of the selected cells (table.js).
    if (hiliteCells(editorEl, cls, colorClasses(HILITE_COLORS))) return;
    if (clearAtCaret(colorClasses(HILITE_COLORS))) return;
    // Words pasted with a background of their own showed it through whichever highlight was picked (0.9.5).
    applyToBlockOrSelection(colorClasses(HILITE_COLORS), alreadyApplied(cls) ? '' : cls, 'background');
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
    const top = (p) => p === editorEl || p?.classList?.contains('toggle-body') || p?.classList?.contains('blk-toggle') || p?.classList?.contains('blk-col');
    while (el && !top(el.parentElement)) el = el.parentElement;
    return el && el !== editorEl && !el.matches('.toggle-body, .blk-col, .blk-cols') ? el : null;
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
    // A line with nothing but the <br> that holds it open: before that <br>.
    // After it the caret is drawn in the same place, but stands "inside" the
    // line — and the first Backspace on a line just made under a divider was
    // not read as a Backspace at the start of a line (the owner's Ideas note, 0.9.4).
    if (el.lastChild?.nodeName === 'BR' && el.childNodes.length === 1) r.setStart(el, 0);
    r.collapse(true);
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
    // On a title the button takes the toggle away again, as the to-do button
    // does a to-do. It used to put a second toggle inside the first (0.9.4).
    const own = block.closest('.blk-toggle');
    if (own && (own.firstElementChild === block || own.firstElementChild?.contains(block))
      && !own.firstElementChild.classList.contains('toggle-body')) {
      const line = unmakeToggle(own);
      // A list item may hold the body's lines after its words: the start is the safe place there.
      if (line.tagName === 'LI') {
        const r = document.createRange();
        r.setStart(line, 0);
        r.collapse(true);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(r);
      } else {
        placeCaretEnd(line);
      }
      dirty();
      return;
    }
    const toggle = makeToggle(block);
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
  function applyFontSize(px, { remember = true } = {}) {
    // The note's writing size (0.9.3). The app's own is no size of the note's: it was still read as 17, the size before 0.9.3.
    if (remember) setNoteFont?.({ size: px === BASE_FONT_SIZE ? null : px });
    history?.push();
    const range = selectionInEditor();
    if (!range || range.collapsed) {
      // With only a caret, the LINE it is in — its list item, its paragraph.
      // It used to be the editor's direct child, so in a list the whole list
      // took the size, and words that carried a size of their own did not
      // move at all: "what grows? something moves but I cannot tell what"
      // (the owner, 0.9.4). The line's own words let go of their size, so the
      // line is seen to change; a list nested in the item keeps its own.
      const line = range ? blockAncestor(range.startContainer) : null;
      if (!line || line === editorEl || line.closest('.blk-code, .code-src')) return;
      line.style.fontSize = `${px}px`;
      for (const el of line.querySelectorAll('[style*="font-size"]')) {
        if (el.closest('.shape, .note-image, .blk-code, .inline-eq, .katex, .link-block') || blockAncestor(el) !== line) continue;
        el.style.removeProperty('font-size');
        if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
      }
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
    // The note shows its pictures from their files (0.9.4); a file for another
    // program holds the pictures themselves, so they are written in first.
    let html = serializeNote(editorEl);
    if (window.nebula?.media?.inline && html.includes('nebula-media://note/')) html = await window.nebula.media.inline(html).catch(() => html);
    return prepareVideos(html, getVideoMode(), { poster: (url) => window.nebula?.links?.videoPoster?.(url) });
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
    const res = await api.export({ suggested: safeFileName(title, fmt?.ext || format), content, format });
    // A Nebula note carries its videos inside it, up to a size; the rest stay behind.
    // The videos too large for the note's own file lie in a folder beside it: the two belong together.
    if (res?.videosBeside) window.dispatchEvent(new CustomEvent('nebula-toast', { detail: `Videos in the folder “${res.folder}” beside the note: ${res.videosBeside}. Keep the folder with the file.` }));
    else if (res?.videosLeft) window.dispatchEvent(new CustomEvent('nebula-toast', { detail: `Videos that could not be taken along: ${res.videosLeft}` }));
    return res;
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
    await takeFile(res);
  }

  /**
   * A file read by the main process — chosen in File → Import, or handed to
   * the app by "Open with Nebula" (0.9.4) — becomes a note.
   * @param {{ok: boolean, name: string, text?: string, bytes?: Uint8Array}} res
   */
  async function takeFile(res) {
    const cannot = () => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'That file could not be read' }));
    if (!res?.ok) { cannot(); return; }
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
    importFile: (res) => takeFile(res),
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
    // With the caret in a table's cell it goes under the table: a cell holds words (table.js).
    codeblock: () => { const table = tableAt(editorEl); insertCodeBlock(editorEl, 'javascript', history, table ? { after: table } : {}); },
    // Its size is asked for first (table-size.js): Enter makes five by five.
    table: () => {
      const anchor = toolbar.querySelector('[data-act="table"]')?.getBoundingClientRect() ?? { left: 200, top: 100, bottom: 100 };
      void pickTableSize(anchor).then((size) => { if (size) withSelection(() => insertTable(editorEl, history, size)); });
    },
    divider: () => insertDivider(),
    bold: () => { cmd('bold'); notePending('bold'); },
    italic: () => { cmd('italic'); notePending('italic'); },
    underline: () => { applyUnderline('u-single'); syncState(); },
    strike: () => { cmd('strikeThrough'); notePending('strikeThrough', 'strike'); },
    code: () => wrapSelection('inline-code'),
    eq: () => equation?.open(),
    color: () => applyTextColor(lastColor),
    hilite: () => applyHilite(lastHilite),
    // In a table it is the cells' words that are lined up — the selected cells', or the caret's.
    // Chromium's own command put a block into the cell.
    al: () => { if (!alignCells(editorEl, 'left')) cmd('justifyLeft'); },
    ac: () => { if (!alignCells(editorEl, 'center')) cmd('justifyCenter'); },
    ar: () => { if (!alignCells(editorEl, 'right')) cmd('justifyRight'); },
    aj: () => { if (!alignCells(editorEl, 'justify')) cmd('justifyFull'); },
  };
  /**
   * A table's cell holds words, not lines (table.js): what turns a line into
   * a list, a to-do or a toggle, or moves it in, does nothing with the caret in
   * one. These took the cell for a line of the note: the to-do button put the
   * whole table into a to-do, the list buttons made a list of the note's first
   * line, and Tab's button indented a cell (0.9.4, the table trials).
   */
  for (const name of ['ul', 'ol', 'todo', 'toggle', 'indent', 'outdent']) {
    const run = ACTIONS[name];
    ACTIONS[name] = (...args) => (tableAt(editorEl) ? undefined : run(...args));
  }
  // Only view (0.8.9): every action that would change the note does nothing;
  // the ones that read it — save, print, export, copy — and import (a new note) stay.
  {
    const READING = new Set(['save', 'print', 'export-md', 'export-html', 'export-pdf', 'export-docx', 'export-odt', 'export-doc', 'export-rtf', 'export-enex', 'copy', 'import', 'importFile']);
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
    // The font menu is as tall as its fonts, where the window has the room (the owner, 0.9.4:
    // "make the font block longer — Cascadia is left below"); the others keep their 520.
    openMenu.style.maxHeight = `${Math.min(openMenu.classList.contains('tb-menu--font') ? 760 : 520, window.innerHeight - 2 * margin)}px`;
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
      if (tableAt(editorEl)) return;                 // a cell is no line to make a heading of
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

  /* ----- the font menu (0.9.4: "a search in the fonts, and a button to add a
     font" — the owner). A search field on top; under it the app's fonts and
     the ones added; with something typed, or after "Add a font", the fonts of
     this computer too — picking one adds it to the list and applies it. ----- */
  const writeCustomFonts = (list) => writeNames(CUSTOM_FONTS_KEY, list);
  let customFonts = readCustomFonts();
  let pinnedFonts = readPinnedFonts();
  // One test build (2026-10-12) put fonts that are not on this computer into the
  // list, with the stack they came with. The owner: "then let it say it is not
  // on this computer and cannot be added". What that build added is taken off.
  try {
    const were = Object.keys(JSON.parse(localStorage.getItem(FONT_STACKS_KEY) || '{}') ?? {}).map((name) => name.toLowerCase());
    if (were.length) {
      customFonts = customFonts.filter((f) => !were.includes(f.toLowerCase()));
      pinnedFonts = pinnedFonts.filter((f) => !were.includes(f.toLowerCase()));
      writeCustomFonts(customFonts);
      writeNames(PINNED_FONTS_KEY, pinnedFonts);
    }
    localStorage.removeItem(FONT_STACKS_KEY);
  } catch { /* nothing kept, nothing to take off */ }
  /** The font used last, and the menu's way of showing it (set when the menu is built). */
  let lastFont = readLastFont();
  let paintLastFont = () => {};
  function usedFont(stack) {
    const font = lastFontOf(stack);
    if (!font) return;
    lastFont = font;
    try { localStorage.setItem(LAST_FONT_KEY, JSON.stringify(font)); } catch { /* this session only */ }
    paintLastFont();
  }
  /** The families installed on this computer, asked for once ("Add a font"). */
  let installedFonts = null;
  let showInstalled = false;

  async function loadInstalledFonts() {
    if (installedFonts) return installedFonts;
    try {
      const fonts = await window.queryLocalFonts?.();
      installedFonts = fonts ? [...new Set(fonts.map((f) => f.family).filter(Boolean))] : [];
    } catch {
      installedFonts = [];       // not allowed, or not there: a name can still be typed and added
    }
    return installedFonts;
  }

  /** Whether a face of that name is on this computer: it changes how wide words are set. */
  function fontIsInstalled(name) {
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      const width = (family) => { ctx.font = `32px ${family}`; return ctx.measureText('Nebula mwil 0123 ĞŻß').width; };
      return ['monospace', 'serif', 'sans-serif'].some((generic) => width(`"${name}", ${generic}`) !== width(generic));
    } catch {
      return true;               // cannot tell: let the name through
    }
  }

  /**
   * The font words in `stack` are DRAWN in on this computer, as the bar and the
   * menu name it. A stack whose first font is one of the app's keeps the app's
   * name for it. Any other is named after the first font in it this computer
   * has: words pasted from a page said `"Instrument Sans", system-ui, "Segoe
   * UI"`, the bar read "Instrument Sans", and the words stood in Segoe UI —
   * "Instrument Sans is the same font as Segoe UI; why does it say that up
   * there?" (the owner, 0.9.4).
   * @returns {{label: string, stack: string}} the stack to write that font with
   */
  const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont']);
  const fontsHere = new Map();
  const fontIsHere = (name) => {
    const key = name.toLowerCase();
    if (!fontsHere.has(key)) fontsHere.set(key, fontIsInstalled(name));
    return fontsHere.get(key);
  };
  function shownFont(stack) {
    const first = firstFamily(stack);
    const own = fontLabelFor(first);
    if (own || !first) return { label: own ?? '', stack };
    const names = String(stack).split(',').map((part) => cleanFontName(part)).filter(Boolean);
    const drawn = GENERIC_FONTS.has(first.toLowerCase()) ? first
      : names.find((name) => !GENERIC_FONTS.has(name.toLowerCase()) && fontIsHere(name)) ?? first;
    if (drawn.toLowerCase() === first.toLowerCase()) return { label: first, stack };
    const ours = FONTS.find(([, s]) => firstFamily(s).toLowerCase() === drawn.toLowerCase());
    return ours ? { label: ours[0], stack: ours[1] } : { label: drawn, stack: customFontStack(drawn) };
  }

  function pickFont(label, stack) {
    // Through withSelection: if anything has taken the selection since the
    // words were highlighted, applyFont's collapsed-caret branch would
    // quietly restyle the WHOLE line instead — "selecting some places
    // still changes the font of the whole area".
    withSelection(() => applyFont(stack));
    if (fontName) fontName.textContent = label;
    usedFont(stack);
    closeMenus();
  }

  /** Whether a font of that name is in the menu's list: the app's own, or one that was added. */
  const fontListed = (name) => FONTS.some(([label, stack]) => label.toLowerCase() === name.toLowerCase() || firstFamily(stack).toLowerCase() === name.toLowerCase())
    || customFonts.some((f) => f.toLowerCase() === name.toLowerCase());

  /**
   * A font of this computer put into the list. One that is not on it — a web
   * page's own, come in with pasted words — cannot be: there is no face to
   * write it in, and the app says so.
   * @returns {string} its name as it is kept, or '' when it could not be
   */
  function listFont(name) {
    const clean = cleanFontName(name);
    if (!clean) return '';
    if (fontListed(clean)) return clean;
    if (!fontIsInstalled(clean)) {
      window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'That font is not on this computer, so it cannot be added' }));
      return '';
    }
    customFonts = [...customFonts, clean];
    writeCustomFonts(customFonts);
    return clean;
  }

  function addFont(name) {
    const clean = listFont(name);
    if (clean) pickFont(clean, customFontStack(clean));
  }

  function buildFontMenu() {
    const menu = document.getElementById('menu-font');
    if (!menu) return;
    menu.innerHTML = '<div class="tb-menu__label">Font</div>'
      + '<input type="search" class="tb-menu__search" id="font-search" placeholder="Find a font" aria-label="Find a font" autocomplete="off" spellcheck="false">'
      + '<div class="tb-menu__rows" id="font-rows"></div>'
      + '<div class="tb-menu__last" id="font-last" hidden></div>'
      + '<button type="button" class="tb-menu__add" id="font-add">+ Add a font</button>';
    const search = menu.querySelector('#font-search');
    const rows = menu.querySelector('#font-rows');
    const lastEl = menu.querySelector('#font-last');
    const addBtn = menu.querySelector('#font-add');

    /**
     * The font used last, over "+ Add a font" (the owner, 0.9.4): picked from
     * the menu, or come in with pasted words. With the pointer on it, a + that
     * puts it into the list — where it is not in it — and a pin.
     */
    paintLastFont = () => {
      lastEl.replaceChildren();
      lastEl.hidden = !lastFont || !!search.value.trim();
      if (lastEl.hidden) return;
      // Named, and written, as the font it is drawn in here.
      const font = shownFont(lastFont.stack);
      const head = document.createElement('div');
      head.className = 'tb-menu__label';
      head.textContent = 'Last used font';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.font = font.stack;
      const name = document.createElement('span');
      name.className = 'label';
      name.dataset.noI18n = '';
      name.textContent = font.label;
      name.style.fontFamily = font.stack;
      btn.appendChild(name);
      const listed = fontListed(font.label);
      const pinnedNow = pinnedFonts.some((f) => f.toLowerCase() === font.label.toLowerCase());
      const tool = (cls, title, run) => {
        const el = document.createElement('span');
        el.className = cls;
        el.setAttribute('role', 'button');
        el.title = title;
        el.setAttribute('aria-label', title);
        el.addEventListener('click', (e) => { e.stopPropagation(); run(); });
        btn.appendChild(el);
        return el;
      };
      if (!listed) tool('tb-menu__plus', 'Add to the list', () => { if (listFont(font.label)) paintRows(); }).textContent = '+';
      const pin = tool('tb-menu__pin', pinnedNow ? 'Unpin' : 'Pin to the top', () => {
        // Pinned, it is in the list: a font that is not there yet is put there first.
        const kept = listFont(font.label);
        if (!kept) return;
        const label = fontLabelFor(kept) ?? kept;
        pinnedFonts = togglePinned(pinnedFonts, label);
        writeNames(PINNED_FONTS_KEY, pinnedFonts);
        paintRows();
        if (!pinnedNow) rows.scrollTop = 0;
      });
      pin.innerHTML = icon('pin', 'ic');
      pin.setAttribute('aria-pressed', String(pinnedNow));
      btn.addEventListener('click', () => pickFont(font.label, font.stack));
      lastEl.append(head, btn);
    };

    const row = (label, stack, { onPick, removable = false, pinned = null } = {}) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.font = stack;
      // Set in its own face, so the list is a preview and not fifteen identical
      // rows. Assigned as a property, not written into a style="" attribute:
      // the stacks contain double quotes ("Segoe UI"), which end the attribute
      // early and leave the row with no font at all.
      const labelEl = document.createElement('span');
      labelEl.className = 'label';
      labelEl.dataset.noI18n = '';
      labelEl.textContent = label;
      labelEl.style.fontFamily = stack;
      btn.appendChild(labelEl);
      // The pin: a press puts the font at the top of the list, or takes it down again.
      if (pinned !== null) {
        const pin = document.createElement('span');
        pin.className = 'tb-menu__pin';
        pin.innerHTML = icon('pin', 'ic');
        pin.setAttribute('role', 'button');
        pin.setAttribute('aria-pressed', String(pinned));
        pin.title = pinned ? 'Unpin' : 'Pin to the top';
        pin.setAttribute('aria-label', pin.title);
        pin.addEventListener('click', (e) => {
          e.stopPropagation();
          pinnedFonts = togglePinned(pinnedFonts, label);
          writeNames(PINNED_FONTS_KEY, pinnedFonts);
          paintRows();
          if (!pinned) rows.scrollTop = 0;       // it went to the top: shown there
        });
        btn.appendChild(pin);
      }
      if (removable) {
        const x = document.createElement('span');
        x.className = 'tb-menu__x';
        x.textContent = '×';
        x.title = 'Remove from the list';
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          customFonts = customFonts.filter((f) => f.toLowerCase() !== label.toLowerCase());
          writeCustomFonts(customFonts);
          // A font that is no longer in the list is no longer pinned in it.
          if (pinnedFonts.some((f) => f.toLowerCase() === label.toLowerCase())) {
            pinnedFonts = pinnedFonts.filter((f) => f.toLowerCase() !== label.toLowerCase());
            writeNames(PINNED_FONTS_KEY, pinnedFonts);
          }
          paintRows();
        });
        btn.appendChild(x);
      }
      btn.addEventListener('click', onPick ?? (() => pickFont(label, stack)));
      return btn;
    };

    function paintRows() {
      const found = fontRows(search.value, { custom: customFonts, pinned: pinnedFonts, installed: (showInstalled || search.value.trim()) ? (installedFonts ?? []) : [] });
      rows.replaceChildren();
      found.own.forEach((f, i) => {
        // A thin line under the pinned ones, where the rest of the list begins.
        if (i > 0 && !f.pinned && found.own[i - 1].pinned) {
          const rule = document.createElement('div');
          rule.className = 'tb-menu__rule';
          rows.appendChild(rule);
        }
        rows.appendChild(row(f.label, f.stack, { removable: f.custom, pinned: f.pinned }));
      });
      if (found.installed.length) {
        const head = document.createElement('div');
        head.className = 'tb-menu__label';
        head.textContent = 'On this computer';
        rows.appendChild(head);
        for (const family of found.installed) rows.appendChild(row(family, customFontStack(family), { onPick: () => addFont(family) }));
      }
      if (!found.own.length && !found.installed.length && !found.add) {
        const none = document.createElement('div');
        none.className = 'tb-menu__none';
        none.textContent = 'No font matches';
        rows.appendChild(none);
      }
      // A name that is in no list can still be added, if the computer has it.
      addBtn.dataset.name = found.add;
      addBtn.textContent = found.add ? `+ Add “${found.add}”` : '+ Add a font';
      // Pressed, it has done its work: the computer's fonts are in the list, and
      // a second "+ Add a font" under them would open nothing more ("what is it
      // doing there a second time, after the click?" — the owner, 0.9.4). It is
      // back for a typed name that is in no list, and when the menu opens anew.
      addBtn.hidden = showInstalled && (installedFonts?.length ?? 0) > 0 && !found.add;
      paintLastFont();
    }

    search.addEventListener('input', () => {
      paintRows();
      // The computer's fonts join the search once they are known.
      if (search.value.trim() && !installedFonts) void loadInstalledFonts().then(paintRows);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); (rows.querySelector('button') ?? addBtn).click(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMenus(); }
    });
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (addBtn.dataset.name) { addFont(addBtn.dataset.name); return; }
      // "Add a font": every font of this computer, to search and pick from.
      showInstalled = true;
      void loadInstalledFonts().then(() => {
        paintRows();
        // They come under the app's own fonts: brought to the top of the list,
        // or the press would seem to have done nothing.
        const head = rows.querySelector('.tb-menu__label');
        if (head) rows.scrollTop = head.offsetTop - rows.offsetTop;
        search.focus({ preventScroll: true });
      });
    });
    // Fresh each time it opens: the whole list, nothing typed.
    fontBtn?.addEventListener('click', () => {
      search.value = '';
      showInstalled = false;
      paintRows();
    });
    paintRows();
  }
  buildFontMenu();

  function applySize() {
    const px = parseSize(sizeInput.value);
    if (px) { sizeInput.value = String(px); withSelection(() => applyFontSize(px)); }
    paintSizeTarget(false);
  }
  /** The common sizes, behind the caret. Typing a number still works. */
  const SIZES = FONT_SIZES;
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
   * One step up or down the size list, from the size the words have now
   * (Ctrl + / Ctrl −, 0.9.4). Selected words change; with only a caret the
   * line the caret is in does, as it does from the size box.
   */
  function stepFontSize(dir) {
    const range = selectionInEditor();
    if (!range || !sizeInput) return;
    let at = range.startContainer;
    if (!range.collapsed) {
      // The first words of the selection: its start is often the line itself.
      const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeValue.trim() && range.intersectsNode(n)) { at = n; break; }
      }
    }
    const el = at.nodeType === Node.ELEMENT_NODE ? at : at.parentElement;
    if (!el || el.closest('.code-src, .blk-code')) return;
    const now = Math.round(parseFloat(getComputedStyle(el).fontSize)) || 14;
    const next = dir > 0
      ? (SIZES.find((s) => s > now) ?? now)
      : ([...SIZES].reverse().find((s) => s < now) ?? now);
    if (next === now) return;
    sizeInput.value = String(next);
    // The keys size these words; the note's writing size is the size box's to set.
    applyFontSize(next, { remember: false });
  }

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
    if (!block) return null;
    // The first line of a note with nothing in it yet is the note itself \u2014 no
    // line stands there until Enter is pressed. A new note that starts with a
    // font (Settings, 0.9.4) is written in it from its first letter.
    const bare = block === editorEl && [...editorEl.childNodes].every((n) => n.nodeName === 'BR' || (n.nodeType === Node.TEXT_NODE && !n.nodeValue.replace(/\u200b/g, '')));
    if ((block === editorEl && !bare) || block.textContent.replace(/\u200b/g, '').length) return null;
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
    // Bold, italic or strike switched on before the first letter (Ctrl+B, then
    // type) is Chromium's typing state, which a letter put in by hand never
    // sees: in a note with a writing font the words came out plain — "I press
    // Ctrl+B and start writing; it is not bold" (the owner, 0.9.4).
    const letter = document.createTextNode(e.data);
    let inner = span;
    for (const [command, tag] of [['bold', 'b'], ['italic', 'i'], ['strikeThrough', 's']]) {
      let on = false;
      try { on = document.queryCommandState(command); } catch { /* not asked of this caret */ }
      if (!on) continue;
      const mark = document.createElement(tag);
      inner.appendChild(mark);
      inner = mark;
    }
    inner.appendChild(letter);
    const block = blockAncestor(range.startContainer);
    const placeholder = block.childNodes.length === 1 && block.firstChild.nodeName === 'BR' ? block.firstChild : null;
    range.insertNode(span);
    placeholder?.remove();
    const caret = document.createRange();
    caret.setStart(letter, letter.nodeValue.length);
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
      fontName.textContent = shownFont(writing?.family || cs.fontFamily).label || 'Font';
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
    if (e.target.closest('.shape-text, .code-src, .image-caption, .blk-table')) return;
    if (!e.inputType?.startsWith('delete')) {
      editorEl.querySelectorAll('hr.blk-hr.armed').forEach((h) => h.classList.remove('armed'));
      return;
    }
    standInLine();
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
    if ((back || e.inputType === 'deleteContentForward') && dropEmptyLine(back)) {
      e.preventDefault();
      return;
    }
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
    // A card beside the caret's line, reached the same way as a picture above:
    // the empty line goes and the card is offered - the next press takes it,
    // Enter does what a click on it does (rich-paste.js picks it up).
    if (edge?.matches?.('.link-block') && !edge.closest('.shape-layer, .image-layer')) {
      e.preventDefault();
      const line = lineOf(window.getSelection().getRangeAt(0).startContainer);
      if (line && isBlankLine(line)) {
        history?.push();
        line.remove();
      }
      editorEl.dispatchEvent(new CustomEvent('nebula-pick-card', { detail: edge }));
      dirty();
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
    if (touching('.shape-layer, .image-layer, .link-block, .blk-table').length) {
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

      // Nothing under that empty line — it is the last of the note, of a column,
      // of a toggle: the line stays, for it is the only place the caret has
      // there, and the divider is offered at once; the next press takes it.
      // The line used to go and the caret was put "after the divider", on no
      // line at all: in a column it stood there, pressed against the divider,
      // and what was typed went nowhere a line was (the owner's Ideas note,
      // 0.9.4: "a bug again, the caret under the divider").
      const lastLine = isEmptyBlock(block) && block.previousElementSibling === hr && !block.nextElementSibling;
      if (lastLine && !hr.classList.contains('armed')) {
        editorEl.querySelectorAll('hr.blk-hr.armed').forEach((h) => h.classList.remove('armed'));
        hr.classList.add('armed');
        return;
      }

      if (!lastLine && isEmptyBlock(block) && block.previousElementSibling === hr) {
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
          // A card, a code block, a table or another divider comes up: no
          // caret stands in any of them, so — as over a picture — the divider
          // is picked, and the next Backspace takes it. A caret was left
          // between the two, on no line.
          editorEl.dispatchEvent(new CustomEvent('nebula-pick-divider', { detail: hr }));
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
    // A table's cell too (table.js): its Tab, Enter and arrows are its own.
    if (e.target.closest('.shape-text, .image-caption, .blk-table') && !mod) return;

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

    // Enter or Backspace a toggle has already dealt with (toggles.js): a
    // toggle in a list item is an item too, and the list rules below would
    // act on the same key a second time — lift the item out, leave the list.
    if (toggleHandled(e)) return;

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
    // Ctrl + and Ctrl − make the words bigger and smaller (the owner, 0.9.4:
    // "Ctrl + − does nothing; it should grow and shrink the font"). "=" is the
    // same key without Shift on a US keyboard.
    if (!e.altKey && (k === '+' || k === '=' || k === '-' || k === '_')) {
      e.preventDefault();
      stepFontSize(k === '-' || k === '_' ? -1 : 1);
      return;
    }
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
