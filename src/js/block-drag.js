/**
 * A card, a video or a code block taken by the mouse (0.9.4).
 *
 * The owner, on the nineteenth test build: "videos, embedded websites, code
 * blocks and so on should all be draggable like pictures". A picture in the
 * text is taken by the mouse and a mark shows the place between two blocks
 * where it will lie (image-place.js); these blocks go the same way, by the
 * same mark, onto the note or into a column.
 *
 * What a block is taken by:
 *   – a card (a bookmark, an embedded page, an embedded video, a video file):
 *     its title line. An embedded page is another page inside the note and
 *     keeps the mouse to itself, so only the line over it can take the card;
 *   – a video file: its picture too — but not the strip along its lower edge,
 *     where the player's own controls are;
 *   – a code block: its top line, between the language and Copy. The code
 *     itself is text to select;
 *   – a table: the corner where its two rows of numbers meet (table.js).
 *
 * A press that does not move is the click it always was: a card's link opens,
 * a video plays. Nothing in the note changes until the button is let go, and
 * Esc leaves the block where it was.
 */

import { showDropMark, hideDropMark } from './drop-mark.js';
import { flowAt, gapAwayFrom } from './image-place.js';

/** The blocks that are moved this way. */
export const DRAG_BLOCK = '.link-block, .blk-code, .blk-table';
const GRIP = '.link-card, .code-head, .tbl-corner';
/** The height of a video's own controls, on the page. */
export const PLAYER_STRIP = 64;
/** How far a press must move before it is a pull: a click with an unsteady hand stays a click. */
const TAKE = 8;

/**
 * The block a press on that element takes, if it takes one.
 * @param {Element|null} target what was pressed
 * @param {number} y where, in the window
 * @returns {HTMLElement|null}
 */
export function gripOf(target, y) {
  const block = target?.closest?.(DRAG_BLOCK);
  if (!block || target.closest('button, select, input')) return null;
  if (target.closest(GRIP)) return block;
  const player = target.closest('.link-file > video');
  if (!player) return null;
  const box = player.getBoundingClientRect();
  const zoom = box.width / Math.max(1, player.offsetWidth) || 1;
  return y < box.bottom - Math.min(PLAYER_STRIP * zoom, box.height / 2) ? block : null;
}

/** Whether a block stands in a row of its own: on the note, or in a column. */
export const standsAlone = (block, editor) => block.parentElement === editor || !!block.parentElement?.classList.contains('blk-col');

/**
 * Where a gap is in the note: the flow it is in and the node the block goes
 * before (null: at the end).
 * @param {HTMLElement} block
 * @param {{parent: HTMLElement, before: Element|null, after: Element|null}} target the gap
 * @returns {{home: Node, ref: Node|null}|null} null where the block stands there already
 */
export function spotOf(block, target) {
  const { parent, before, after } = target ?? {};
  let home = null;
  let ref = null;
  if (before?.isConnected && before !== block) { home = before.parentNode; ref = before; }
  else if (after?.isConnected && after !== block) { home = after.parentNode; ref = after.nextSibling; }
  else if (!before && !after && parent?.isConnected) home = parent;
  if (!home || block.contains(home) || ref === block || block.nextSibling === ref && block.parentNode === home) return null;
  return { home, ref };
}

/**
 * To its new place. A video is moved, not taken out and put in again, where
 * the browser can (`moveBefore`): it goes on playing. An embedded page is put
 * in again as it always was and loads anew — its frame is the app's own
 * element, which has to be told it moved.
 * @param {HTMLElement} block
 * @param {{parent: HTMLElement, before: Element|null, after: Element|null}} target the gap it goes into
 * @returns {boolean} whether it moved
 */
export function placeBlock(block, target) {
  const spot = spotOf(block, target);
  if (!spot) return false;
  const { home, ref } = spot;
  try {
    if (typeof home.moveBefore === 'function' && !block.querySelector('webview')) home.moveBefore(block, ref); else home.insertBefore(block, ref);
  } catch {
    home.insertBefore(block, ref);
  }
  // At the very end it leaves no line to go on with.
  if (!block.nextElementSibling) {
    const line = block.ownerDocument.createElement('p');
    line.innerHTML = '<br>';
    block.after(line);
  }
  return true;
}

/**
 * @param {HTMLElement} editor
 * @param {{history?: {push: () => void}, isLocked?: () => boolean, onGeometry?: () => void}} [opts]
 */
export function initBlockDrag(editor, { history, isLocked = () => false, onGeometry } = {}) {
  if (!editor) return null;
  const dirty = () => editor.dispatchEvent(new Event('input', { bubbles: true }));
  /** @type {null | {block: HTMLElement, x: number, y: number, moved: boolean, target: object|null}} */
  let drag = null;

  /** What letting go here would do, and the mark that says so. */
  function over(x, y) {
    const gap = gapAwayFrom(drag.block, flowAt(editor, x, y), y);
    if (!gap) { hideDropMark(); return null; }
    showDropMark(gap.line);
    return { parent: gap.parent, before: gap.before, after: gap.units[gap.slot - 1]?.els.at(-1) ?? null };
  }

  /**
   * The click that ends a drag is no click: the card's link stays shut, the
   * video as it was. It comes right after the button is let go, so it is
   * waited for until then — after Esc too, the button still being down.
   */
  let eatClick = false;

  function finish(apply, { held = true } = {}) {
    const d = drag;
    drag = null;
    hideDropMark();
    document.body.classList.remove('block-dragging');
    if (!d?.moved) return;
    eatClick = held;
    if (!apply || !d.target || !d.block.isConnected || !spotOf(d.block, d.target)) return;
    history?.push();
    placeBlock(d.block, d.target);
    onGeometry?.();
    dirty();
  }

  editor.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || isLocked() || editor.dataset.readonly === 'true') return;
    const block = gripOf(e.target, e.clientY);
    if (!block || !editor.contains(block) || !standsAlone(block, editor)) return;
    // A title line is a link, and a link pulled is the browser's own drag of its address.
    if (e.target.closest(GRIP)) e.preventDefault();
    drag = { block, x: e.clientX, y: e.clientY, moved: false, target: null };
  }, true);
  editor.addEventListener('dragstart', (e) => { if (e.target.closest?.(GRIP)) e.preventDefault(); });
  // A video's picture is pressed as it always was (it takes the keys), but the press starts no selection of text.
  document.addEventListener('selectstart', (e) => { if (drag) e.preventDefault(); }, true);

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < TAKE && Math.abs(e.clientY - drag.y) < TAKE) return;
    // The button was let go where the window could not see it.
    if (!drag.block.isConnected || !(e.buttons & 1)) { finish(false, { held: false }); return; }
    drag.moved = true;
    document.body.classList.add('block-dragging');
    drag.target = over(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (drag) finish(true);
    if (eatClick) setTimeout(() => { eatClick = false; }, 0);
  });
  window.addEventListener('click', (e) => {
    if (!eatClick) return;
    eatClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  window.addEventListener('blur', () => { if (drag) finish(false, { held: false }); });
  // Esc: as it was.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !drag?.moved) return;
    e.preventDefault();
    e.stopPropagation();
    finish(false);
  }, true);

  return { dragging: () => !!drag?.moved };
}
