/**
 * Feet made level (1.0.4).
 *
 * Pictures side by side were pulled to one height and a line along their foot
 * said so (1.0.3, rich-paste.js). The owner, a release on: "widgets have no
 * evening-out as pictures do; the same for a table (by its lines) and for
 * embedded pages … everything but the words, in short".
 *
 * So whatever is not words — a picture, a widget, a table, a card, an embedded
 * page or video — knows what stands beside it: at its left or right, sharing
 * some of its height, in a row of pictures or in the column next door. Pulled
 * larger or smaller to within a few pixels of a neighbour's foot, its own foot
 * goes there, and the line is drawn along both.
 *
 * Nothing here changes a note: the one that is pulled asks how far its foot is
 * (footGap), makes itself that much higher or lower its own way, and asks for
 * the line (showLevel).
 */

/** How near a foot must come to be taken, in the page's pixels. */
export const LEVEL_SNAP = 6;
/** What has a foot to be level with. */
const SOLID = '.note-image--inline, .link-block, .blk-table';
const NOT_HERE = '.shape-layer, .image-layer';

/** What of a block is measured: a picture's picture, a table's table; a widget and a card themselves. */
export function faceOf(block) {
  if (block.matches('.blk-table')) return block.querySelector(':scope > table') ?? block;
  if (block.matches('.note-image')) return block.querySelector(':scope > img') ?? block;
  return block;
}

/**
 * Where the blocks beside one are drawn: those at its left or right that share
 * some of its height (or would, a pull of `reach` on).
 * @param {HTMLElement} editor @param {HTMLElement} block
 * @param {number} [reach] in the window's pixels
 * @returns {DOMRect[]}
 */
export function besideOf(editor, block, reach = LEVEL_SNAP) {
  const box = faceOf(block).getBoundingClientRect();
  const found = [];
  for (const other of editor.querySelectorAll(SOLID)) {
    if (other === block || other.contains(block) || block.contains(other)) continue;
    if (other.closest(NOT_HERE) || other.classList.contains('note-image--inword')) continue;
    const r = faceOf(other).getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > box.left + 1 && r.left < box.right - 1) continue;          // over it or under it
    if (Math.min(r.bottom, box.bottom + reach) - Math.max(r.top, box.top) <= 4) continue;
    found.push(r);
  }
  return found;
}

/**
 * How far the foot of a block is from the nearest foot beside it: more than
 * nought, that one is lower. Null with none within reach.
 * @param {number} [reach] in the window's pixels (LEVEL_SNAP times the page's zoom)
 * @returns {number|null}
 */
export function footGap(editor, block, reach = LEVEL_SNAP) {
  const foot = faceOf(block).getBoundingClientRect().bottom;
  let best = null;
  for (const r of besideOf(editor, block, reach)) {
    const gap = r.bottom - foot;
    if (Math.abs(gap) <= reach && (best === null || Math.abs(gap) < Math.abs(best))) best = gap;
  }
  return best;
}

let guide = null;

/**
 * The line along the feet that are level with a block's, if any is.
 * @returns {boolean} whether it is drawn
 */
export function showLevel(editor, block) {
  const box = faceOf(block).getBoundingClientRect();
  const level = besideOf(editor, block, 1).filter((r) => Math.abs(r.bottom - box.bottom) <= 1);
  if (!level.length) { hideLevel(); return false; }
  const doc = editor.ownerDocument;
  if (!guide || guide.ownerDocument !== doc) {
    guide = doc.createElement('div');
    guide.className = 'image-row-guide';
  }
  if (!guide.isConnected) doc.body.appendChild(guide);
  const left = Math.min(box.left, ...level.map((r) => r.left));
  guide.style.left = `${left}px`;
  guide.style.top = `${Math.round(box.bottom)}px`;
  guide.style.width = `${Math.max(box.right, ...level.map((r) => r.right)) - left}px`;
  guide.hidden = false;
  return true;
}

export function hideLevel() {
  if (guide) guide.hidden = true;
}
