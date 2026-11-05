/**
 * Every block taken by the mouse, as in Notion (1.0.0).
 *
 * The owner, after 0.9.9: "I can't drag toggle lists … I want every element
 * to be movable with the mouse, the way Notion works." Notion's way, as it can
 * be seen from the outside: a grip (⋮⋮) comes up at the left of whatever block
 * the pointer is on — a line, a heading, a list item, a toggle, a picture, a
 * table, a whole set of columns. Pulled, the block goes with the pointer (a
 * faint copy of it follows), and a line shows where it will land:
 *
 *   – flat, between two blocks: there. Into a column, into an open toggle
 *     (on its title's lower half: first in what folds away), into a list;
 *   – upright, at the left or right edge of a block: the two stand side by
 *     side in columns. Beside a block in a column, it is a new column there.
 *
 * Nothing changes until the button is let go; Esc gives the drag up. With Alt
 * held when it is let go, a copy goes and the block stays (Notion's Alt-drag).
 *
 * A click on the grip without a pull picks the block: it is tinted, and
 *   Backspace / Delete     takes it away
 *   Ctrl+C / Ctrl+X        copies / cuts it, everything in it (a toggle with
 *                          what folds away, a list item with its own list)
 *   Ctrl+D                 puts a copy under it
 *   ↑ / ↓                  picks the block above / below
 *   Ctrl+Shift+↑ / ↓       moves it one place up / down (with the caret in a
 *                          line too, that line)
 *   Esc, a click, a key    lets it go
 *
 * Several blocks are picked together with Shift+click on a second grip, with
 * Shift+↑ / ↓, or with a box dragged from open ground on the page. All of the
 * keys above then act on the whole pick, and a drag by the grip of any of them
 * takes them all along.
 *
 * A column whose last block is dragged away goes, as in Notion; a list whose
 * last item goes goes with it.
 */

import { showDropMark, hideDropMark } from './drop-mark.js';
import { contentBox, ROW, tidyRows } from './image-place.js';
import { columnsBeside, columnBeside, canShare, dropColumn, columnIsEmpty, leastShare, healColumns, COL, COLS } from './columns.js';
import { editorZoom } from './page-zoom.js';

/** Children of a flow that are not blocks of it. */
const NOT_BLOCK = '.shape-layer, .image-layer, .blk-vr, .tbl-ui, .video-bar, .attach-bar, br, script, style';
/** Blocks under which a flow needs a line to go on writing. */
const NO_CARET = '.note-image, .link-block, .blk-code, .blk-table, hr, .blk-cols';
/** How far left of a block the pointer still counts as being on it (its grip stands there). */
export const GUTTER = 36;
/** How far a press on the grip must move to be a pull. */
const TAKE = 4;
/** Where the grip stands, left of the block. */
const GRIP_OFF = 12;

const isList = (el) => el?.tagName === 'UL' || el?.tagName === 'OL';
const isOpenToggle = (el) => el?.classList?.contains('blk-toggle') && el.dataset.open === 'true';
const bodyOf = (toggle) => toggle?.querySelector(':scope > .toggle-body');

/** Whether an element holds blocks one under another: the note, a column, a toggle's body, a list. */
export function isFlow(el, editor) {
  return !!el && (el === editor || el.classList?.contains(COL) || el.classList?.contains('toggle-body') || isList(el));
}
/** A flow that holds any block (a list holds only items). */
const holdsAny = (el, editor) => !!el && (el === editor || el.classList?.contains(COL) || el.classList?.contains('toggle-body'));

/** The blocks of a flow, top to bottom. */
export function blocksOf(flow) {
  if (!flow) return [];
  if (isList(flow)) return [...flow.children].filter((el) => el.tagName === 'LI');
  return [...flow.children].filter((el) => !el.matches(NOT_BLOCK));
}

const boxOf = (el) => el.getBoundingClientRect();

/** The block of a flow whose row holds that height: each row reaches halfway to its neighbours. */
function rowAt(flow, y) {
  const list = blocksOf(flow).map((el) => ({ el, r: boxOf(el) })).filter((b) => b.r.height > 0 || b.r.width > 0);
  for (let i = 0; i < list.length; i += 1) {
    const { el, r } = list[i];
    const top = i ? (list[i - 1].r.bottom + r.top) / 2 : r.top - 10;
    const bottom = i < list.length - 1 ? (r.bottom + list[i + 1].r.top) / 2 : r.bottom + 10;
    if (y >= top && y <= bottom) return el;
  }
  return null;
}

/** Where a block's grip lines up: a list item's from its list's edge, where its bullet is. */
export function anchorLeft(block) {
  return boxOf(block.tagName === 'LI' && block.parentElement ? block.parentElement : block).left;
}

/** The flow inside a block that a point is in, if any. */
function innerFlow(block, x, y) {
  if (block.classList.contains(COLS)) {
    let best = null;
    let far = Infinity;
    for (const col of block.querySelectorAll(`:scope > .${COL}`)) {
      const r = boxOf(col);
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < far) { far = d; best = col; }
    }
    return best;
  }
  if (isOpenToggle(block)) {
    const body = bodyOf(block);
    return body && boxOf(body).height > 0 && y >= boxOf(body).top - 2 ? body : null;
  }
  if (isList(block)) return block;
  if (block.tagName === 'LI') {
    for (const child of block.children) {
      if (isList(child)) { const r = boxOf(child); if (y >= r.top && y <= r.bottom) return child; }
      if (isOpenToggle(child)) {
        const body = bodyOf(child);
        if (body && boxOf(body).height > 0 && y >= boxOf(body).top - 2 && y <= boxOf(body).bottom) return body;
      }
    }
  }
  return null;
}

/**
 * The innermost block at a point: a line in a toggle in a column is that line,
 * unless the pointer is out in its gutter, where the grip of the block around
 * it stands.
 * @returns {HTMLElement|null}
 */
export function blockAt(editor, x, y) {
  let flow = editor;
  let found = null;
  for (let depth = 0; depth < 16 && flow; depth += 1) {
    const el = rowAt(flow, y);
    if (!el) break;
    if (found && x < anchorLeft(el) - GUTTER) break;
    found = el;
    flow = innerFlow(el, x, y);
  }
  return found;
}

/** The outermost of a block's own: a list item's whole list, out to the flow it stands in. */
function outOfLists(block, editor) {
  let el = block;
  while (el.parentElement && el.parentElement !== editor && !holdsAny(el.parentElement, editor)) el = el.parentElement;
  return el;
}

const prevBlock = (el) => { let p = el.previousElementSibling; while (p && p.matches(NOT_BLOCK)) p = p.previousElementSibling; return p; };
const nextBlock = (el) => { let n = el.nextElementSibling; while (n && n.matches(NOT_BLOCK)) n = n.nextElementSibling; return n; };

/** The least share of a line a column of that block may have, from the width it is drawn at. */
function leastOf(cols) {
  const line = contentBox(cols);
  const zoom = cols.getBoundingClientRect().width / Math.max(1, cols.offsetWidth) || 1;
  return leastShare((line.right - line.left) / zoom);
}

/**
 * What letting go of `dragged` at a point would do, and the line that says so.
 * Null where it would change nothing.
 * @param {HTMLElement} editor
 * @param {HTMLElement|null} dragged the block, or null for something coming from outside (files)
 * @param {{sides?: boolean}} [opts] sides: false — between blocks only
 * @returns {null | {kind: 'gap', parent: HTMLElement, ref: Node|null, line: object}
 *                | {kind: 'side', block: HTMLElement, side: 'left'|'right', line: object}}
 */
export function dropTarget(editor, dragged, x, y, { sides = true } = {}) {
  let block = blockAt(editor, x, y);
  if (!block) {
    // Above the first block or under the last: there.
    const all = blocksOf(editor);
    if (!all.length) {
      const box = contentBox(editor);
      return { kind: 'gap', parent: editor, ref: null, line: { left: box.left, top: box.top + 12, width: box.right - box.left, height: 3 } };
    }
    block = y < boxOf(all[0]).top ? all[0] : all.at(-1);
  }
  if (dragged && (block === dragged || dragged.contains(block))) return null;
  const item = dragged?.tagName === 'LI';
  // Anything but a list item goes beside a list, not into it.
  if (!item && block.tagName === 'LI') block = outOfLists(block, editor);
  // Columns do not go into columns: a block holding some goes on the note.
  const hasCols = !!dragged && (dragged.classList.contains(COLS) || !!dragged.querySelector(`.${COLS}`));
  if (hasCols) while (block.parentElement && block.parentElement !== editor) block = block.parentElement;
  if (dragged && (block === dragged || dragged.contains(block))) return null;

  const r = boxOf(block);
  const parent = block.parentElement;

  // At the left or right edge: beside it, in columns.
  if (sides && dragged && !hasCols && (parent === editor || parent.classList.contains(COL)) && !block.classList.contains(COLS)) {
    const w = r.width;
    // Notion's edges: at the very start of the block (or out left of it, in its
    // gutter), and the last stretch of its line at the right. Anywhere between
    // is above or below it — a card let go over the first words of a line goes
    // over that line, as it always did (tests/e2e/layout.mjs).
    const side = x >= r.left - GUTTER && x < r.left + Math.min(14, w * 0.05) ? 'left'
      : x > r.right - Math.min(56, w * 0.12) ? 'right' : null;
    const room = side && (parent === editor || canShare(parent, leastOf(parent.parentElement)));
    // Beside itself in its own column is where it is.
    const same = parent.classList.contains(COL) && dragged.parentElement === parent && blocksOf(parent).length === 1;
    if (side && room && !same) {
      const at = side === 'left' ? r.left - 6 : r.right + 3;
      return { kind: 'side', block, side, line: { left: at, top: r.top, width: 3, height: Math.max(20, r.height) } };
    }
  }

  // On an open toggle's title, lower half: first in what folds away.
  if (!hasCols && isOpenToggle(block) && bodyOf(block)) {
    const title = block.firstElementChild;
    const tr = boxOf(title);
    if (title !== bodyOf(block) && y > (tr.top + tr.bottom) / 2) {
      const body = bodyOf(block);
      const first = blocksOf(body)[0] ?? null;
      if (dragged && first === dragged) return null;
      const box = contentBox(body);
      const at = first ? (tr.bottom + boxOf(first).top) / 2 : tr.bottom + 2;
      return { kind: 'gap', parent: body, ref: first, line: { left: box.left, top: at - 1.5, width: box.right - box.left, height: 3 } };
    }
  }

  const upper = y < (r.top + r.bottom) / 2;
  const prev = prevBlock(block);
  const next = nextBlock(block);
  if (dragged && (upper ? prev === dragged : next === dragged)) return null;
  let at;
  if (upper) at = prev ? (boxOf(prev).bottom + r.top) / 2 : r.top - 3;
  else at = next ? (r.bottom + boxOf(next).top) / 2 : r.bottom + 3;
  const left = anchorLeft(block);
  const right = isList(parent) ? r.right : contentBox(parent).right;
  return {
    kind: 'gap', parent, ref: upper ? block : block.nextSibling,
    line: { left, top: at - 1.5, width: Math.max(8, right - left), height: 3 },
  };
}

/**
 * Where neighbours pulled together would go: dropTarget() for the one of them
 * that says the most (columns, if any holds some), and nowhere among themselves,
 * inside one of them, or where they already stand.
 * @param {HTMLElement[]} blocks neighbours in one place, in order
 */
export function dropTargetOfRun(editor, blocks, x, y) {
  const target = dropTarget(editor, blocks.find((block) => block.classList.contains(COLS) || block.querySelector(`.${COLS}`)) ?? blocks[0], x, y, { sides: false });
  if (blocks.length === 1 || target?.kind !== 'gap') return target;
  if (blocks.some((block) => block.contains(target.parent))) return null;
  if (target.parent !== blocks[0].parentElement) return target;
  let ref = target.ref;
  while (ref && (ref.nodeType !== 1 || ref.matches(NOT_BLOCK))) ref = ref.nextSibling;
  return blocks.includes(ref) || ref === nextBlock(blocks.at(-1)) ? null : target;
}

/** A copy that is a new block: no ids, nothing that only means "on screen now". */
function freshCopy(block) {
  const copy = block.cloneNode(true);
  for (const el of [copy, ...copy.querySelectorAll('[id]')]) el.removeAttribute?.('id');
  copy.classList.remove('block-picked', 'block-lifted', 'sel', 'in-sel');
  copy.querySelectorAll('.block-picked, .block-lifted, .in-sel').forEach((el) => el.classList.remove('block-picked', 'block-lifted', 'in-sel'));
  return copy;
}

/** The blocks from one to the other, in the note's order, when they are neighbours in one place; null otherwise. */
export function blocksBetween(a, b) {
  if (!a || !b || a.parentElement !== b.parentElement) return null;
  for (const [from, to] of [[a, b], [b, a]]) {
    const run = [];
    for (let el = from; el; el = nextBlock(el)) {
      run.push(el);
      if (el === to) return run;
    }
  }
  return null;
}

/** A line with nothing on it: no words, no picture, no widget. */
export function isBlankLine(block) {
  return block?.tagName === 'P' && !block.textContent.trim() && !block.querySelector('img, video, audio, iframe, webview, canvas, svg, hr, table, object, embed, [contenteditable="false"]');
}

/**
 * What a pick of `run` holds: the empty lines at its ends are not picked, and
 * the ones between its blocks go with them, unmarked (owner, 1.0.3: "seçerken
 * boş alanlar da alınıyor"). A run of nothing but empty lines is only its first.
 */
export function pickOf(run) {
  const first = run.findIndex((block) => !isBlankLine(block));
  if (first < 0) return { blocks: run.slice(0, 1), marked: run.slice(0, 1) };
  const blocks = run.slice(first, run.findLastIndex((block) => !isBlankLine(block)) + 1);
  return { blocks, marked: blocks.filter((block) => !isBlankLine(block)) };
}

/** Fresh copies of blocks as one piece of HTML: list items stay in a list of their kind. */
export function blocksCopyHtml(blocks) {
  let html = '';
  let list = null;
  let items = '';
  const flush = () => {
    if (list) html += `<${list}>${items}</${list}>`;
    list = null;
    items = '';
  };
  for (const block of blocks) {
    if (block.tagName !== 'LI') {
      flush();
      html += freshCopy(block).outerHTML;
      continue;
    }
    const tag = block.parentElement?.tagName === 'OL' ? 'ol' : 'ul';
    if (list !== tag) flush();
    list = tag;
    items += freshCopy(block).outerHTML;
  }
  flush();
  return html;
}

const blankLine = (doc) => {
  const p = doc.createElement('p');
  p.innerHTML = '<br>';
  return p;
};

/**
 * What a block leaves behind: a list without items goes, a toggle's body and
 * the note keep a line, a column left with nothing goes.
 */
export function tidyFrom(editor, from) {
  if (!from?.isConnected) return;
  const doc = from.ownerDocument;
  if (isList(from)) {
    if (!from.querySelector(':scope > li')) {
      const holder = from.parentElement;
      from.remove();
      tidyFrom(editor, holder);
    }
    return;
  }
  if (from.classList.contains('toggle-body')) {
    if (!blocksOf(from).length) from.append(blankLine(doc));
    return;
  }
  if (from.classList.contains(COL)) {
    if (columnIsEmpty(from)) dropColumn(from);
    return;
  }
  if (from === editor && !blocksOf(editor).length) editor.append(blankLine(doc));
}

/** A playing video is moved, not taken out and put in again, where the browser can (block-drag.js). */
function slip(parent, node, ref) {
  try {
    if (node.isConnected && typeof parent.moveBefore === 'function' && !node.querySelector('webview')) parent.moveBefore(node, ref);
    else parent.insertBefore(node, ref);
  } catch {
    parent.insertBefore(node, ref);
  }
}

/**
 * The block to where dropTarget() said. A list item put among other blocks
 * gets a list of its own kind.
 * @returns {HTMLElement|null} what now stands there (the block, or its new list)
 */
export function placeAt(editor, block, target) {
  if (!target || !block) return null;
  const doc = block.ownerDocument;
  const listed = (into) => {
    if (block.tagName !== 'LI' || isList(into)) return block;
    const list = doc.createElement(isList(block.parentElement) ? block.parentElement.tagName.toLowerCase() : 'ul');
    list.append(block);
    return list;
  };
  let node;
  if (target.kind === 'side') {
    const host = target.block.parentElement;
    if (!target.block.isConnected) return null;
    node = listed(host);
    if (host === editor) columnsBeside(target.block, node, target.side);
    else if (!columnBeside(host, node, target.side, leastOf(host.parentElement))) return null;
  } else {
    const { parent } = target;
    if (!parent?.isConnected) return null;
    const ref = target.ref && target.ref.parentNode === parent && target.ref !== block ? target.ref : (target.ref === block ? block.nextSibling : null);
    node = listed(parent);
    slip(parent, node, ref);
  }
  // At the foot of a flow, a block that takes no caret leaves a line to go on with.
  if (node.matches(NO_CARET) && !nextBlock(node) && !node.parentElement.classList.contains(COL)) node.after(blankLine(doc));
  if (block.classList.contains(ROW)) block.classList.remove(ROW);
  return node;
}

/**
 * Move or copy a block: placeAt, then what it left behind tidied.
 * @returns {HTMLElement|null} the block that moved (or the copy)
 */
export function moveBlock(editor, block, target, opts) {
  return moveBlocks(editor, [block], target, opts)?.[0] ?? null;
}

/**
 * Neighbours moved or copied together, in their order: the last goes where the
 * target says (so a line to go on with is left only if the last wants one, and
 * list items get one list), the others in front of it.
 * @param {HTMLElement[]} blocks neighbours in one place, in order
 * @returns {HTMLElement[]|null} the blocks that moved (or the copies)
 */
export function moveBlocks(editor, blocks, target, { copy = false } = {}) {
  const from = blocks[0].parentElement;
  const moving = copy ? blocks.map(freshCopy) : blocks;
  const last = moving.at(-1);
  if (!placeAt(editor, last, target)) return null;
  for (const block of moving.slice(0, -1)) {
    slip(last.parentNode, block, last);
    block.classList.remove(ROW);
  }
  if (!copy) tidyFrom(editor, from);
  if (from?.isConnected) tidyRows(from);
  healColumns(editor);
  return moving;
}

/**
 * The markup a copy of a selection carries, when the selection lies inside one
 * toggle — from its title down into what folds away. Chromium copies the two
 * parts without the toggle around them, and the paste was two plain lines
 * ("I have to make a toggle, copy the title, then copy the text", the owner).
 * @param {Range} range
 * @returns {string|null} the toggle again, holding what was selected; null where no toggle was cut in two
 */
export function toggleCopyHtml(range) {
  const top = range?.commonAncestorContainer;
  const el = top?.nodeType === 1 ? top : top?.parentElement;
  if (!el?.classList?.contains('blk-toggle')) return null;
  const shell = el.cloneNode(false);
  shell.append(range.cloneContents());
  for (const node of [shell, ...shell.querySelectorAll('[id]')]) node.removeAttribute('id');
  // Only the title selected: it is no toggle, just words.
  if (!shell.querySelector(':scope > .toggle-body')) return null;
  return shell.outerHTML;
}

/** Whether pasted markup holds blocks the browser's own paste takes apart. */
export const holdsStructure = (html) => /class="[^"]*\b(?:blk-toggle|blk-cols|link-block)\b/.test(String(html ?? ''));

/**
 * Blocks pasted at the caret, as blocks (1.0.0). The browser's paste merges
 * the first and last pasted block into the line the caret is on, which takes a
 * toggle's title out of its toggle, and columns out of their frame. Here the
 * caret's line is split, the blocks stand between its two halves, and an empty
 * line is replaced.
 * @returns {HTMLElement|null} the last block put in
 */
export function insertBlocks(editor, html, range) {
  const doc = editor.ownerDocument;
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(html ?? '');
  // Loose words become a line; empty text goes.
  const nodes = [];
  let run = null;
  for (const n of [...tpl.content.childNodes]) {
    // The clipboard's <!--StartFragment--> and the like.
    if (n.nodeType !== 1 && n.nodeType !== 3) continue;
    const inline = n.nodeType === 3 || (n.nodeType === 1 && !/^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|HR|FIGURE|TABLE)$/.test(n.tagName));
    if (inline) {
      if (n.nodeType === 3 && !n.nodeValue.trim() && !run) continue;
      if (!run) { run = doc.createElement('p'); nodes.push(run); }
      run.append(n);
    } else { run = null; nodes.push(n); }
  }
  for (const n of nodes) for (const el of [n, ...n.querySelectorAll('[id]')]) el.removeAttribute?.('id');
  if (!nodes.length) return null;
  if (range && !range.collapsed) range.deleteContents();
  const start = range?.startContainer;
  let line = start ? (start.nodeType === 1 ? start : start.parentElement) : null;
  if (!line || !editor.contains(line)) line = null;
  while (line && line !== editor && !holdsAny(line.parentElement, editor)) line = line.parentElement;
  if (line === editor) {
    const child = editor.childNodes[range.startOffset] ?? null;
    nodes.forEach((n) => editor.insertBefore(n, child));
  } else if (!line) {
    editor.append(...nodes);
  } else {
    const empty = !line.textContent.replace(/​/g, '').trim() && !line.querySelector('img, hr, .note-image, .link-block, .blk-code, .inline-eq, table');
    if (empty) line.replaceWith(...nodes);
    else {
      const before = doc.createRange();
      before.selectNodeContents(line);
      before.setEnd(range.startContainer, range.startOffset);
      const after = doc.createRange();
      after.selectNodeContents(line);
      after.setStart(range.startContainer, range.startOffset);
      const atStart = !before.toString().replace(/​/g, '').length && !before.cloneContents().querySelector?.('img, .note-image, .inline-eq');
      const atEnd = !after.toString().replace(/​/g, '').length && !after.cloneContents().querySelector?.('img, .note-image, .inline-eq');
      if (atStart) line.before(...nodes);
      else if (atEnd) line.after(...nodes);
      else {
        const rest = line.cloneNode(false);
        rest.removeAttribute('id');
        rest.append(after.extractContents());
        line.after(...nodes, rest);
      }
    }
  }
  const last = nodes.at(-1);
  if (last.matches?.(NO_CARET) && !nextBlock(last)) last.after(blankLine(doc));
  healColumns(editor);
  return last.isConnected ? last : null;
}

/** The caret at the end of a block's last words, or on the line after it. */
export function caretAfter(block) {
  if (!block?.isConnected) return;
  const sel = window.getSelection();
  const r = document.createRange();
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let text = null;
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.nodeValue.replace(/​/g, '').length && !t.parentElement?.closest('[contenteditable="false"]')) text = t;
  if (text) r.setStart(text, text.nodeValue.length);
  else {
    const line = block.matches('p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not([class])') ? block : nextBlock(block);
    if (!line) return;
    r.setStart(line, 0);
  }
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

const GRIP_SVG = '<svg viewBox="0 0 4 16" aria-hidden="true"><circle cx="2" cy="3" r="1.4"/><circle cx="2" cy="8" r="1.4"/><circle cx="2" cy="13" r="1.4"/></svg>';

/**
 * @param {HTMLElement} editor
 * @param {{history?: {push: () => void}, isLocked?: () => boolean, onGeometry?: () => void, label?: string}} [opts]
 */
export function initBlockHandles(editor, { history, isLocked = () => false, onGeometry, label = 'Drag to move · click to select' } = {}) {
  if (!editor) return null;
  const dirty = () => editor.dispatchEvent(new Event('input', { bubbles: true }));
  const locked = () => isLocked() || editor.dataset.readonly === 'true';

  const grip = document.createElement('div');
  grip.className = 'block-grip';
  grip.hidden = true;
  grip.title = label;
  grip.setAttribute('aria-hidden', 'true');
  grip.innerHTML = GRIP_SVG;
  document.body.appendChild(grip);

  /** The block the grip stands at. */
  let hovered = null;
  /** The block picked with a click on the grip. */
  let picked = null;
  /** @type {null | {block: HTMLElement, blocks: HTMLElement[], x: number, y: number, moved: boolean, target: object|null, ghost: HTMLElement|null, dx: number, dy: number}} */
  let drag = null;
  let lastX = 0;
  let lastY = 0;
  let scrollTimer = 0;

  const hideGrip = () => { grip.hidden = true; hovered = null; };

  function showGrip(block) {
    const r = boxOf(block);
    const frame = boxOf(editor);
    if (r.bottom < frame.top || r.top > frame.bottom) { hideGrip(); return; }
    const z = editorZoom(editor);
    // Lined up with the block's first line.
    const lh = parseFloat(getComputedStyle(block.tagName === 'LI' || block.classList.contains('blk-toggle') ? (block.querySelector('p, h1, h2, h3, li') ?? block) : block).lineHeight);
    const first = Math.min(r.height, (Number.isFinite(lh) ? lh : 22) * z);
    const top = Math.max(frame.top, r.top + first / 2 - 12);
    const left = Math.max(frame.left + 1, anchorLeft(block) - GRIP_OFF);
    grip.style.left = `${Math.round(left)}px`;
    grip.style.top = `${Math.round(top)}px`;
    grip.hidden = false;
    hovered = block;
  }

  function track(x, y) {
    if (drag || locked() || document.body.classList.contains('block-dragging') || document.body.classList.contains('divider-dragging')) return;
    const frame = boxOf(editor);
    if (x < frame.left || x > frame.right || y < frame.top || y > frame.bottom) { if (!grip.matches(':hover')) hideGrip(); return; }
    // Something stands over the note here: a sheet's dots belong to no block
    // (the owner, 1.0.3: "settings ekranina üc nokta cikiyor, arkadaki notu takip ediyor").
    const top = document.elementFromPoint(x, y);
    if (top && top !== grip && !grip.contains(top) && !editor.contains(top)) { hideGrip(); return; }
    const block = blockAt(editor, x, y);
    if (!block) { hideGrip(); return; }
    if (block !== hovered || grip.hidden) showGrip(block);
  }

  let raf = 0;
  document.addEventListener('mousemove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (drag) return;
    // A selection being drawn, a picture being pulled: no grip.
    if (e.buttons) { if (!grip.hidden && e.target !== grip && !grip.contains(e.target)) hideGrip(); return; }
    if (e.target === grip || grip.contains(e.target)) return;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; track(lastX, lastY); });
  }, { passive: true });
  // A sheet opened by a click or a key, the pointer not moving: it is looked at again.
  const lookAgain = () => { if (!drag && !grip.hidden) requestAnimationFrame(() => track(lastX, lastY)); };
  document.addEventListener('click', lookAgain);
  document.addEventListener('keyup', lookAgain);
  // Typing hides it, as in Notion; the next move brings it back.
  // Not for Shift alone: it is held to click another grip.
  editor.addEventListener('keydown', (e) => { if (!drag && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) hideGrip(); });
  editor.addEventListener('scroll', () => { if (!drag) hideGrip(); }, { passive: true });
  window.addEventListener('resize', () => { if (!drag) hideGrip(); });

  // ---- picked --------------------------------------------------------------
  // Several blocks together, as in Notion (the owner, 1.0.3: "blok blok kopyalama"):
  // `group` is everything picked, in the note's order; `picked` is where the pick
  // began and `tip` the end Shift+↑/↓ moves.
  let group = [];
  let tip = null;
  function release() {
    for (const block of group) block.classList.remove('block-picked');
    group = [];
    picked = null;
    tip = null;
  }
  function pickRange(from, to) {
    const run = blocksBetween(from, to);
    if (!run) return false;
    release();
    picked = from;
    tip = to;
    const { blocks, marked } = pickOf(run);
    group = blocks;
    for (const block of marked) block.classList.add('block-picked');
    if (!editor.contains(document.activeElement)) editor.focus({ preventScroll: true });
    // No caret anywhere: a key goes to the picked block, not into some line.
    window.getSelection()?.removeAllRanges();
    return true;
  }
  function pick(block) {
    release();
    if (block?.isConnected) pickRange(block, block);
  }

  /** Copying the picked blocks: set while the copy event it starts goes by. */
  let copying = null;
  document.addEventListener('copy', (e) => {
    if (!copying || !e.clipboardData) return;
    const blocks = copying;
    copying = null;
    let html = blocksCopyHtml(blocks);
    if (window.nebula?.media?.inlineSync && /nebula-media:\/\/note\//.test(html)) {
      try { html = window.nebula.media.inlineSync(html); } catch { /* the note's own addresses */ }
    }
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', blocks.map((block) => block.innerText ?? block.textContent ?? '').join('\n'));
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  function copyPicked() {
    if (!picked?.isConnected) return false;
    copying = [...group];
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    copying = null;
    return ok;
  }

  /** The note changed around the picked blocks: their list, toggle or column is tidied. */
  function removePicked() {
    const blocks = group.filter((block) => block.isConnected);
    if (!blocks.length || locked()) return;
    history?.push();
    const from = blocks[0].parentElement;
    const after = nextBlock(blocks.at(-1)) ?? prevBlock(blocks[0]);
    release();
    for (const block of blocks) block.remove();
    tidyFrom(editor, from);
    healColumns(editor);
    if (after?.isConnected) pick(after); else caretAfter(blocksOf(editor).at(-1));
    onGeometry?.();
    dirty();
  }

  function duplicatePicked() {
    const blocks = group.filter((block) => block.isConnected);
    if (!blocks.length || locked()) return;
    history?.push();
    const copies = blocks.map(freshCopy);
    blocks.at(-1).after(...copies);
    pickRange(copies[0], copies.at(-1));
    onGeometry?.();
    dirty();
  }

  /** One place up or down among its neighbours: a block, or the run from it to `last`. */
  function step(block, delta, last = block) {
    if (!block?.isConnected || !last?.isConnected || locked()) return false;
    const other = delta < 0 ? prevBlock(block) : nextBlock(last);
    if (!other) return false;
    history?.push();
    if (delta < 0) last.after(other); else block.before(other);
    block.scrollIntoView?.({ block: 'nearest' });
    onGeometry?.();
    dirty();
    return true;
  }

  document.addEventListener('keydown', (e) => {
    if (drag?.moved && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    // Ctrl+Shift+↑/↓: the picked block, or the caret's line, one place up or down.
    if (mod && e.shiftKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !locked()) {
      let block = picked?.isConnected ? picked : null;
      if (!block) {
        const sel = window.getSelection();
        const node = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null;
        let el = node?.nodeType === 1 ? node : node?.parentElement;
        if (!el || !editor.contains(el) || el.closest('.code-src, .shape-text, .image-caption, td, [contenteditable="false"]')) return;
        while (el && el !== editor && !isFlow(el.parentElement, editor)) el = el.parentElement;
        block = el && el !== editor ? el : null;
      }
      if (!block) return;
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      const keep = !picked && sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      const moved = picked ? step(group[0], delta, group.at(-1)) : step(block, delta);
      if (moved && keep) { sel.removeAllRanges(); sel.addRange(keep); }
      return;
    }
    if (!picked) return;
    if (!picked.isConnected) { release(); return; }
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    const k = e.key.toLowerCase();
    if (mod && k === 'c') { e.preventDefault(); e.stopPropagation(); copyPicked(); return; }
    if (mod && k === 'x') { e.preventDefault(); e.stopPropagation(); if (copyPicked()) removePicked(); return; }
    if (mod && k === 'd') { e.preventDefault(); e.stopPropagation(); duplicatePicked(); return; }
    if (mod && (k === 'z' || k === 'y')) { release(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); removePicked(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      const other = e.key === 'ArrowUp' ? prevBlock(tip) : nextBlock(tip);
      if (other) {
        // Shift: the pick grows or shrinks; without it, one block again.
        if (e.shiftKey) pickRange(picked, other); else pick(other);
        other.scrollIntoView?.({ block: 'nearest' });
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); release(); return; }
    // Enter or any other key: let go, the caret at the end of its words, and the key goes on there.
    const block = tip;
    release();
    caretAfter(block);
    if (e.key === 'Enter') e.preventDefault();
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (e.target === grip || grip.contains(e.target)) return;
    if (picked) release();
  }, true);

  // ---- what a selection holds without words -------------------------------
  // A divider, a picture, a video or a card in a selection gets no blue: it is
  // marked `in-sel` while the selection crosses it (editor.css).
  const NO_TINT = 'hr.blk-hr, .note-image, .link-block';
  let tintRaf = 0;
  function markSelection() {
    tintRaf = 0;
    const sel = window.getSelection();
    const range = sel?.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0) : null;
    const now = range && editor.contains(range.commonAncestorContainer)
      ? [...editor.querySelectorAll(NO_TINT)].filter((el) => range.intersectsNode(el))
      : [];
    // One picture alone is the picture's own selection: it has its outline already.
    if (now.length === 1 && now[0].classList.contains('sel')) now.length = 0;
    // Every mark, not only ours: one copied along in a selection is pasted with it.
    for (const el of editor.querySelectorAll('.in-sel')) if (!now.includes(el)) el.classList.remove('in-sel');
    for (const el of now) el.classList.add('in-sel');
  }
  document.addEventListener('selectionchange', () => { if (!tintRaf) tintRaf = requestAnimationFrame(markSelection); });
  editor.addEventListener('input', () => { if (!tintRaf) tintRaf = requestAnimationFrame(markSelection); });

  // ---- the band ------------------------------------------------------------
  // Pressed on the page where no block is — its sides, between blocks, under
  // the last — and pulled: every block it crosses is picked. Only the sides
  // started it, a strip the owner never hit, so they saw no box (1.0.3).
  // Past the end of a line's words is open ground too: "every empty area
  // should start the box" (the owner's Bug Find note).
  const WORDY = 'p, h1, h2, h3, h4, h5, h6, li, blockquote';
  const PAST = 16;
  function pastWords(target, x, y) {
    if (!(target instanceof Element) || !target.matches(WORDY) || !editor.contains(target)) return false;
    const r = document.createRange();
    r.selectNodeContents(target);
    const lines = [...r.getClientRects()].filter((q) => q.width > 0);
    if (!lines.length) return false;
    // The line under the press, or the nearest one when it fell between lines.
    const dist = (q) => (y < q.top ? q.top - y : y > q.bottom ? y - q.bottom : 0);
    const near = Math.min(...lines.map(dist));
    const line = lines.filter((q) => dist(q) - near < 1);
    return x > Math.max(...line.map((q) => q.right)) + PAST;
  }
  let band = null;
  editor.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey || e.detail > 1 || locked()) return;
    if (e.target !== editor && !pastWords(e.target, e.clientX, e.clientY)) return;
    const r = boxOf(editor);
    const scale = r.width / (editor.offsetWidth || 1);
    if (e.clientX > r.left + editor.clientWidth * scale) return;    // the scrollbar
    band = { x: e.clientX, y: e.clientY, scroll: editor.scrollTop, scale, el: null };
  });
  window.addEventListener('mousemove', (e) => {
    if (!band) return;
    if (!(e.buttons & 1)) { endBand(); return; }
    if (!band.el) {
      if (Math.abs(e.clientX - band.x) < TAKE && Math.abs(e.clientY - band.y) < TAKE) return;
      band.el = document.createElement('div');
      band.el.className = 'block-band';
      document.body.append(band.el);
      document.body.classList.add('block-banding');
      hideGrip();
    }
    const frame = boxOf(editor);
    if (e.clientY < frame.top + 24) editor.scrollTop -= 12;
    else if (e.clientY > frame.bottom - 24) editor.scrollTop += 12;
    // Where it began stays with the words under it when the page scrolls.
    const fromY = band.y - (editor.scrollTop - band.scroll) * band.scale;
    const top = Math.min(fromY, e.clientY);
    const bottom = Math.max(fromY, e.clientY);
    Object.assign(band.el.style, {
      left: `${Math.min(band.x, e.clientX)}px`, width: `${Math.abs(e.clientX - band.x)}px`,
      top: `${Math.max(frame.top, top)}px`, height: `${Math.max(0, Math.min(frame.bottom, bottom) - Math.max(frame.top, top))}px`,
    });
    const crossed = blocksOf(editor).filter((block) => { const b = boxOf(block); return !isBlankLine(block) && b.bottom > top && b.top < bottom; });
    if (crossed.length) pickRange(crossed[0], crossed.at(-1)); else { release(); window.getSelection()?.removeAllRanges(); }
  });
  function endBand() {
    band?.el?.remove();
    if (band?.el) window.getSelection()?.removeAllRanges();
    band = null;
    document.body.classList.remove('block-banding');
  }
  window.addEventListener('mouseup', () => { if (band) endBand(); });
  window.addEventListener('blur', () => { if (band) endBand(); });

  // ---- words, then blocks --------------------------------------------------
  // A drag begun in a line's words selects words while it stays in that block;
  // once it reaches another block, whole blocks are picked, as in Notion, and
  // back in its own block it is words again (the owner, 1.0.3: "it should know
  // when to copy blocks and when a part of the words in a block").
  const NO_SWEEP = '.code-src, .blk-table, .shape-layer, .image-layer, .note-image, .image-caption, .link-block, [contenteditable="false"]';
  let sweep = null;
  editor.addEventListener('mousedown', (e) => {
    sweep = null;
    if (e.button !== 0 || e.shiftKey || e.detail > 1 || e.target === editor || band || locked()) return;
    if (!(e.target instanceof Element) || e.target.closest(NO_SWEEP)) return;
    const block = blockAt(editor, e.clientX, e.clientY);
    const at = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (block && at) sweep = { block, at, blocks: false };
  });
  window.addEventListener('mousemove', (e) => {
    if (!sweep) return;
    if (!(e.buttons & 1)) { endSweep(); return; }
    const over = blockAt(editor, e.clientX, e.clientY);
    const pair = over && over !== sweep.block ? sharedFlow(sweep.block, over) : null;
    if (pair && pair[0] !== pair[1]) {
      if (!sweep.blocks) hideGrip();
      sweep.blocks = true;
      document.body.classList.add('block-sweeping');
      if (tip !== pair[1] || picked !== pair[0]) pickRange(pair[0], pair[1]);
      else window.getSelection()?.removeAllRanges();
      return;
    }
    sweep.y = e.clientY;
    sweep.over = over;
    if (!sweep.blocks) { holdToBlock(); return; }   // still in its own block: the browser's own selection
    // Back where it began: words again, from where the press was.
    release();
    document.body.classList.remove('block-sweeping');
    const to = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (to && editor.contains(to.startContainer)) {
      window.getSelection()?.setBaseAndExtent(sweep.at.startContainer, sweep.at.startOffset, to.startContainer, to.startOffset);
    }
  });
  // Pulled into the gap under (or over) its block, the browser's selection
  // leapt the picture below and took it, unasked ("selecting words takes a
  // picture I didn't choose", the owner's Bug Find note). Off the block's
  // lines and over no other block, the words run to the block's end or start.
  function holdToBlock() {
    if (!sweep || sweep.blocks || (sweep.over && sweep.over !== sweep.block) || sweep.y == null) return;
    const b = boxOf(sweep.block);
    if (sweep.y >= b.top && sweep.y <= b.bottom) return;
    const sel = window.getSelection();
    // Only once the browser has begun a selection of its own: one set by us under
    // a still press is taken by Chromium for words to drag away, and the sweep
    // never sees another move (a pull from a line onto a divider and a card picked nothing).
    if (!sel?.rangeCount || sel.isCollapsed) return;
    const down = sweep.y > b.bottom;
    const end = document.createRange();
    end.selectNodeContents(sweep.block);
    end.collapse(!down);
    if (sel.focusNode === end.startContainer && sel.focusOffset === end.startOffset) return;
    sel.setBaseAndExtent(sweep.at.startContainer, sweep.at.startOffset, end.startContainer, end.startOffset);
  }
  document.addEventListener('selectionchange', holdToBlock);
  function endSweep() {
    sweep = null;
    document.body.classList.remove('block-sweeping');
  }
  window.addEventListener('mouseup', () => { if (sweep) endSweep(); });
  window.addEventListener('blur', () => { if (sweep) endSweep(); });

  /** The two blocks, or the blocks round them, that stand in one flow. */
  function sharedFlow(a, b) {
    const chain = (el) => {
      const out = [];
      for (; el && el !== editor; el = el.parentElement) if (isFlow(el.parentElement, editor)) out.push(el);
      return out;
    };
    const left = chain(a);
    const right = chain(b);
    for (const x of left) {
      const y = right.find((el) => el.parentElement === x.parentElement);
      if (y) return [x, y];
    }
    return null;
  }

  // ---- the drag ------------------------------------------------------------
  function makeGhost(blocks) {
    const r = boxOf(blocks[0]);
    const ghost = document.createElement('div');
    ghost.className = 'editor block-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    const z = editorZoom(editor);
    ghost.style.zoom = String(z);
    ghost.style.width = `${Math.round(r.width / z)}px`;
    // List items are all of one list: they came from one place.
    const holder = blocks[0].tagName === 'LI' ? document.createElement(blocks[0].parentElement?.tagName === 'OL' ? 'ol' : 'ul') : ghost;
    if (holder !== ghost) ghost.append(holder);
    for (const block of blocks) {
      const copy = freshCopy(block);
      // A page, a player or a drawing in the copy would load or play again: a plain box stands in.
      copy.querySelectorAll('webview, iframe, video, canvas, object, embed').forEach((el) => {
        const box = document.createElement('div');
        box.className = 'block-ghost-media';
        el.replaceWith(box);
      });
      holder.append(copy);
    }
    document.body.appendChild(ghost);
    return ghost;
  }

  function moveGhost(x, y) {
    if (!drag?.ghost) return;
    const z = editorZoom(editor);
    drag.ghost.style.left = `${Math.round((x - drag.dx) / z)}px`;
    drag.ghost.style.top = `${Math.round((y - drag.dy) / z)}px`;
  }

  function over(x, y) {
    const t = dropTargetOfRun(editor, drag.blocks, x, y);
    if (t) showDropMark(t.line); else hideDropMark();
    return t;
  }

  /** Near the top or bottom of the page while dragging, it scrolls. */
  function autoscroll() {
    if (!drag?.moved) { scrollTimer = 0; return; }
    const frame = boxOf(editor);
    const edge = 48;
    let dy = 0;
    if (lastY < frame.top + edge) dy = -Math.ceil((frame.top + edge - lastY) / 4);
    else if (lastY > frame.bottom - edge) dy = Math.ceil((lastY - (frame.bottom - edge)) / 4);
    if (dy) {
      const was = editor.scrollTop;
      editor.scrollTop += dy;
      if (editor.scrollTop !== was) drag.target = over(lastX, lastY);
    }
    scrollTimer = requestAnimationFrame(autoscroll);
  }

  function finish(apply, { copy = false } = {}) {
    const d = drag;
    drag = null;
    hideDropMark();
    if (scrollTimer) cancelAnimationFrame(scrollTimer);
    scrollTimer = 0;
    document.body.classList.remove('block-dragging');
    d?.ghost?.remove();
    d?.blocks.forEach((block) => block.classList.remove('block-lifted'));
    if (!d) return;
    if (!d.moved) {
      // A click: the block is picked. With Shift, every block from the one picked to this one.
      if (apply && d.block.isConnected && !(d.shift && picked?.isConnected && pickRange(picked, d.block))) pick(d.block);
      return;
    }
    if (!apply || !d.target || !d.blocks.every((block) => block.isConnected) || locked()) return;
    history?.push();
    const moved = moveBlocks(editor, d.blocks, d.target, { copy });
    if (!moved) return;
    pickRange(moved[0], moved.at(-1));
    onGeometry?.();
    dirty();
  }

  grip.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hovered?.isConnected || locked()) return;
    e.preventDefault();
    e.stopPropagation();
    const r = boxOf(hovered);
    // The grip of a block in a pick of several, or of a line inside one of them: the whole pick goes.
    const run = group.length > 1 && group.some((block) => block.contains(hovered)) ? blocksBetween(group[0], group.at(-1)) : null;
    drag = { block: hovered, blocks: run?.length === group.length ? run : [hovered], shift: e.shiftKey, x: e.clientX, y: e.clientY, moved: false, target: null, ghost: null, dx: Math.min(40, e.clientX - r.left + 24), dy: Math.min(16, Math.max(0, e.clientY - r.top)) };
  });
  // A right-click on the grip picks the block too, as Notion's menu would.
  grip.addEventListener('contextmenu', (e) => { e.preventDefault(); if (hovered?.isConnected && !locked() && !group.includes(hovered)) pick(hovered); });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < TAKE && Math.abs(e.clientY - drag.y) < TAKE) return;
    // The button was let go where the window could not see it.
    if (!drag.blocks.every((block) => block.isConnected) || !(e.buttons & 1)) { finish(false); return; }
    if (!drag.moved) {
      drag.moved = true;
      release();
      grip.hidden = true;
      document.body.classList.add('block-dragging');
      drag.blocks.forEach((block) => block.classList.add('block-lifted'));
      drag.ghost = makeGhost(drag.blocks);
      scrollTimer = requestAnimationFrame(autoscroll);
    }
    moveGhost(e.clientX, e.clientY);
    drag.target = over(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', (e) => { if (drag) finish(true, { copy: e.altKey }); });
  window.addEventListener('blur', () => { if (drag) finish(false); });
  // A band only once drawn: a press on open ground that is not pulled is a click,
  // and the browser's caret must land (an empty note took no typing, 1.0.3).
  document.addEventListener('selectstart', (e) => { if (drag || band?.el) e.preventDefault(); }, true);

  // A copy of words cut out of one toggle — title and body — is the toggle again.
  editor.addEventListener('copy', (e) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed || !e.clipboardData) return;
    let html = toggleCopyHtml(sel.getRangeAt(0));
    if (!html) return;
    if (window.nebula?.media?.inlineSync && /nebula-media:\/\/note\//.test(html)) {
      try { html = window.nebula.media.inlineSync(html); } catch { /* the note's own addresses */ }
    }
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', sel.toString());
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  return {
    release,
    pick,
    picked: () => picked,
    dragging: () => !!drag?.moved,
    hide: hideGrip,
    /** For a card or a code block taken by its own top line (block-drag.js): the same targets. */
    target: (block, x, y) => dropTarget(editor, block, x, y, { sides: false }),
    move: (block, target, opts) => moveBlock(editor, block, target, opts),
  };
}
