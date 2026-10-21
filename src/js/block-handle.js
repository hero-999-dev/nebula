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

/** A copy that is a new block: no ids, nothing that only means "on screen now". */
function freshCopy(block) {
  const copy = block.cloneNode(true);
  for (const el of [copy, ...copy.querySelectorAll('[id]')]) el.removeAttribute?.('id');
  copy.classList.remove('block-picked', 'block-lifted', 'sel');
  copy.querySelectorAll('.block-picked, .block-lifted').forEach((el) => el.classList.remove('block-picked', 'block-lifted'));
  return copy;
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
    // A playing video is moved, not taken out and put in again, where the browser can (block-drag.js).
    try {
      if (node === block && block.isConnected && typeof parent.moveBefore === 'function' && !block.querySelector('webview')) parent.moveBefore(node, ref);
      else parent.insertBefore(node, ref);
    } catch {
      parent.insertBefore(node, ref);
    }
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
export function moveBlock(editor, block, target, { copy = false } = {}) {
  const from = block.parentElement;
  const moving = copy ? freshCopy(block) : block;
  if (!placeAt(editor, moving, target)) return null;
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
export const holdsStructure = (html) => /class="[^"]*\b(?:blk-toggle|blk-cols)\b/.test(String(html ?? ''));

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
  /** @type {null | {block: HTMLElement, x: number, y: number, moved: boolean, target: object|null, ghost: HTMLElement|null, dx: number, dy: number}} */
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
  // Typing hides it, as in Notion; the next move brings it back.
  editor.addEventListener('keydown', () => { if (!drag) hideGrip(); });
  editor.addEventListener('scroll', () => { if (!drag) hideGrip(); }, { passive: true });
  window.addEventListener('resize', () => { if (!drag) hideGrip(); });

  // ---- picked --------------------------------------------------------------
  function release() {
    if (picked?.isConnected) picked.classList.remove('block-picked');
    picked = null;
  }
  function pick(block) {
    release();
    if (!block?.isConnected) return;
    picked = block;
    block.classList.add('block-picked');
    if (!editor.contains(document.activeElement)) editor.focus({ preventScroll: true });
    // No caret anywhere: a key goes to the picked block, not into some line.
    window.getSelection()?.removeAllRanges();
  }

  /** Copying the picked block: set while the copy event it starts goes by. */
  let copying = null;
  document.addEventListener('copy', (e) => {
    if (!copying || !e.clipboardData) return;
    const block = copying;
    copying = null;
    const copy = freshCopy(block);
    let html = block.tagName === 'LI' ? `<${block.parentElement?.tagName === 'OL' ? 'ol' : 'ul'}>${copy.outerHTML}</${block.parentElement?.tagName === 'OL' ? 'ol' : 'ul'}>` : copy.outerHTML;
    if (window.nebula?.media?.inlineSync && /nebula-media:\/\/note\//.test(html)) {
      try { html = window.nebula.media.inlineSync(html); } catch { /* the note's own addresses */ }
    }
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', block.innerText ?? block.textContent ?? '');
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  function copyPicked() {
    if (!picked?.isConnected) return false;
    copying = picked;
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    copying = null;
    return ok;
  }

  /** The note changed around the picked block: its list, toggle or column is tidied. */
  function removePicked() {
    const block = picked;
    if (!block?.isConnected || locked()) return;
    history?.push();
    const from = block.parentElement;
    const after = nextBlock(block) ?? prevBlock(block);
    release();
    block.remove();
    tidyFrom(editor, from);
    healColumns(editor);
    if (after?.isConnected) pick(after); else caretAfter(blocksOf(editor).at(-1));
    onGeometry?.();
    dirty();
  }

  function duplicatePicked() {
    const block = picked;
    if (!block?.isConnected || locked()) return;
    history?.push();
    const copy = freshCopy(block);
    block.after(copy);
    pick(copy);
    onGeometry?.();
    dirty();
  }

  /** One place up or down among its neighbours. */
  function step(block, delta) {
    if (!block?.isConnected || locked()) return false;
    const other = delta < 0 ? prevBlock(block) : nextBlock(block);
    if (!other) return false;
    history?.push();
    if (delta < 0) other.before(block); else other.after(block);
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
      if (step(block, e.key === 'ArrowUp' ? -1 : 1) && keep) { sel.removeAllRanges(); sel.addRange(keep); }
      return;
    }
    if (!picked) return;
    if (!picked.isConnected) { picked = null; return; }
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
      const other = e.key === 'ArrowUp' ? prevBlock(picked) : nextBlock(picked);
      if (other) { pick(other); other.scrollIntoView?.({ block: 'nearest' }); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); release(); return; }
    // Enter or any other key: let go, the caret at the end of its words, and the key goes on there.
    const block = picked;
    release();
    caretAfter(block);
    if (e.key === 'Enter') e.preventDefault();
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (e.target === grip || grip.contains(e.target)) return;
    if (picked) release();
  }, true);

  // ---- the drag ------------------------------------------------------------
  function makeGhost(block) {
    const r = boxOf(block);
    const ghost = document.createElement('div');
    ghost.className = 'editor block-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    const z = editorZoom(editor);
    ghost.style.zoom = String(z);
    ghost.style.width = `${Math.round(r.width / z)}px`;
    const copy = freshCopy(block);
    // A page, a player or a drawing in the copy would load or play again: a plain box stands in.
    copy.querySelectorAll('webview, iframe, video, canvas, object, embed').forEach((el) => {
      const box = document.createElement('div');
      box.className = 'block-ghost-media';
      el.replaceWith(box);
    });
    if (block.tagName === 'LI') {
      const list = document.createElement(block.parentElement?.tagName === 'OL' ? 'ol' : 'ul');
      list.append(copy);
      ghost.append(list);
    } else ghost.append(copy);
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
    const t = dropTarget(editor, drag.block, x, y, { sides: false });
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
    d?.block.classList.remove('block-lifted');
    if (!d) return;
    if (!d.moved) {
      // A click: the block is picked.
      if (apply && d.block.isConnected) pick(d.block);
      return;
    }
    if (!apply || !d.target || !d.block.isConnected || locked()) return;
    history?.push();
    const moved = moveBlock(editor, d.block, d.target, { copy });
    if (!moved) return;
    pick(moved);
    onGeometry?.();
    dirty();
  }

  grip.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hovered?.isConnected || locked()) return;
    e.preventDefault();
    e.stopPropagation();
    const r = boxOf(hovered);
    drag = { block: hovered, x: e.clientX, y: e.clientY, moved: false, target: null, ghost: null, dx: Math.min(40, e.clientX - r.left + 24), dy: Math.min(16, Math.max(0, e.clientY - r.top)) };
  });
  // A right-click on the grip picks the block too, as Notion's menu would.
  grip.addEventListener('contextmenu', (e) => { e.preventDefault(); if (hovered?.isConnected && !locked()) pick(hovered); });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < TAKE && Math.abs(e.clientY - drag.y) < TAKE) return;
    // The button was let go where the window could not see it.
    if (!drag.block.isConnected || !(e.buttons & 1)) { finish(false); return; }
    if (!drag.moved) {
      drag.moved = true;
      release();
      grip.hidden = true;
      document.body.classList.add('block-dragging');
      drag.block.classList.add('block-lifted');
      drag.ghost = makeGhost(drag.block);
      scrollTimer = requestAnimationFrame(autoscroll);
    }
    moveGhost(e.clientX, e.clientY);
    drag.target = over(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', (e) => { if (drag) finish(true, { copy: e.altKey }); });
  window.addEventListener('blur', () => { if (drag) finish(false); });
  document.addEventListener('selectstart', (e) => { if (drag) e.preventDefault(); }, true);

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
