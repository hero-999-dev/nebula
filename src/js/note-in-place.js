/**
 * The open note, taken in anew where the reader is (1.0.4).
 *
 * Tailscale sync can bring a newer version of the very note that is open
 * (tailnet-sync.js). It used to be opened again for that: the page went back
 * to its top, the caret was gone, a video began anew — and while both
 * computers are open ("live", electron/sync.js) that happened every few
 * seconds on the one somebody was reading at. The owner, 2026-11-15:
 * "tailscale yapalim kücükleri". Now the note's markup is changed under the
 * reader, and the reader stays where they are:
 *
 *   const place = holdPlace(editorEl);   // before the new markup
 *   …the note's markup is put in…
 *   place.players();                     // at once: a video of the same file is the same player
 *   …everything is painted…
 *   place.restore();                     // the page, the caret and the focus
 *
 * The page: the block that stood at the top of what was seen stands there
 * again. It is looked for in the new note (`sameBlock`), so lines that came or
 * went above it do not push the reading away; a block that is no longer in
 * the note leaves the page as far down as it was.
 * The caret: back in its block, at its place in it, when that block is still
 * in the note; at the block's start when the block is not as it was; left to
 * the browser when the block is gone.
 * The focus: the note has it again if it had it.
 *
 * The undo steps are not this file's: the caller drops them (main.js), since
 * a step back would write the older version over what the other computer did.
 */
import { pathOf, nodeAt, readCaret, writeCaret } from './history.js';
import { TRANSIENT_NODES } from './note-markup.js';

/** Drawn on a block by the screen and none of its words: bars, buttons, a code block's head. */
const DRAWN = `${TRANSIENT_NODES}, .code-head, .link-del, select, button`;
/** The two canvases shapes and floating pictures lie on: as large as the note, at no place in its lines. */
const LAYERS = '.shape-layer, .image-layer';
/** Where typing goes only once it is made editable (history.js puts a caret back into these the same way). */
const HOSTS = '.shape-text, .image-caption, .blk-table td';

/**
 * A block's mark: its kind, its words, and the file it shows. Two blocks with
 * the same mark are alike. What the screen draws on a block — a player's
 * clock, a card's buttons — is none of it.
 * @param {Node} block
 */
export function markOf(block) {
  if (block?.nodeType !== 1) return `#\u0001${block?.nodeValue ?? ''}`;
  let words = '';
  const walker = block.ownerDocument.createTreeWalker(block, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.parentElement?.closest(DRAWN)) words += n.nodeValue;
  }
  const holder = block.matches('[src], [data-src]') ? block : block.querySelector('[src], [data-src]');
  const file = holder?.getAttribute('src') || holder?.getAttribute('data-src') || '';
  // A pasted picture is its own address, megabytes of it: its length and its end tell it apart as well.
  return `${block.tagName}\u0001${words}\u0001${file.length > 200 ? `${file.length}:${file.slice(-64)}` : file}`;
}

/**
 * Which block of the new note is the one that stood at `index` in the old.
 *
 * `before` and `after` are the marks of the note's blocks, in order.
 *  - Above the first block that differs, and below the last, nothing changed:
 *    the block is where it was, counted from that end.
 *  - In the part between, with as many blocks as before, blocks were changed
 *    where they stand: the same index.
 *  - With more or fewer, lines came or went: the block is found by its mark —
 *    of several alike in that part, the one in the same order among them.
 * @param {string[]} before
 * @param {string[]} after
 * @param {number} index
 * @returns {number} its index in `after`, or -1 when it is no longer there
 */
export function sameBlock(before, after, index) {
  if (!Number.isInteger(index) || index < 0 || index >= before.length) return -1;
  const most = Math.min(before.length, after.length);
  let head = 0;
  while (head < most && before[head] === after[head]) head += 1;
  if (index < head) return index;
  let tail = 0;
  while (tail < most - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  if (index >= before.length - tail) return after.length - (before.length - index);
  if (before.length === after.length) return index;
  const mark = before[index];
  let nth = 0;
  for (let i = head; i < index; i += 1) if (before[i] === mark) nth += 1;
  for (let i = head; i < after.length - tail; i += 1) {
    if (after[i] !== mark) continue;
    if (nth === 0) return i;
    nth -= 1;
  }
  return -1;
}

/**
 * Called before the open note's markup is replaced by a newer version of the
 * same note. See the head of this file for what is kept.
 * @param {HTMLElement} root the editor
 * @returns {{players: () => void, restore: () => void}}
 */
export function holdPlace(root) {
  const doc = root.ownerDocument;
  const selection = () => doc.defaultView?.getSelection?.() ?? null;
  const before = [...root.children].map(markOf);
  const hadFocus = root.contains(doc.activeElement);

  // Every scrolled element up from the note: emptied for a moment, the note is
  // shorter than where the page stood, and the page would stay where that left it.
  const scrolled = [];
  for (let el = root; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight || el.scrollTop || el.scrollLeft) scrolled.push([el, el.scrollTop, el.scrollLeft]);
  }
  // The block at the top of what is seen, and how far under the top it begins.
  // At the very top of the note there is none: the top stays the top.
  const scroller = scrolled.find(([, top]) => top > 0)?.[0] ?? null;
  let top = null;
  if (scroller) {
    const view = scroller.getBoundingClientRect();
    const blocks = root.children;
    for (let i = 0; i < blocks.length; i += 1) {
      if (blocks[i].matches(LAYERS)) continue;
      const at = blocks[i].getBoundingClientRect();
      if (at.height > 0 && at.bottom > view.top) { top = { index: i, under: at.top - view.top }; break; }
    }
  }

  // The caret, and the block each of its ends is in (-1: in the note itself, between blocks).
  const caret = readCaret(root, selection());
  const blockOf = (path) => {
    const block = path.length ? nodeAt(root, path.slice(0, 1)) : null;
    return block?.nodeType === 1 ? Array.prototype.indexOf.call(root.children, block) : -1;
  };
  const caretBlocks = caret && { start: blockOf(caret.start), end: blockOf(caret.end) };

  const kept = new Map();
  for (const player of root.querySelectorAll('video[src]')) {
    const src = player.getAttribute('src');
    if (!kept.has(src)) kept.set(src, player);
  }

  return {
    /** Right after the new markup is in: a video of the same file is the player it was, playing on. */
    players() {
      for (const fresh of kept.size ? root.querySelectorAll('video[src]') : []) {
        const src = fresh.getAttribute('src');
        const player = kept.get(src);
        if (!player) continue;
        kept.delete(src);
        fresh.replaceWith(player);
      }
    },

    /** Once the new note is painted: the page, the focus and the caret. */
    restore() {
      const blocks = [...root.children];
      const after = blocks.map(markOf);
      for (const [el, y, x] of scrolled) { el.scrollTop = y; el.scrollLeft = x; }
      if (hadFocus && !root.contains(doc.activeElement)) root.focus({ preventScroll: true });

      const sel = selection();
      if (caret && sel) {
        // An end of the caret, in the new note: its block found again, its place in the block as it was.
        const moved = (path, index) => {
          if (!path.length) return path;
          const at = index < 0 ? -1 : sameBlock(before, after, index);
          const head = at < 0 ? null : pathOf(root, blocks[at]);
          return head ? [...head, ...path.slice(1)] : null;
        };
        const start = moved(caret.start, caretBlocks.start);
        const end = moved(caret.end, caretBlocks.end);
        if (start && end) {
          const next = { ...caret, start, end };
          const node = nodeAt(root, start);
          const host = (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(HOSTS);
          if (host && hadFocus && root.contains(host)) {
            host.setAttribute('contenteditable', 'true');
            host.closest('.shape')?.classList.add('editing');
            host.focus({ preventScroll: true });
          }
          if (!writeCaret(root, next, sel) && start.length) {
            // Its block is there, and not as it was: the block's start.
            const block = nodeAt(root, start.slice(0, 1));
            if (block) {
              const range = doc.createRange();
              range.selectNodeContents(block);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }
      }

      if (top && scroller) {
        const at = sameBlock(before, after, top.index);
        const now = at < 0 ? null : blocks[at].getBoundingClientRect();
        if (now && now.height > 0) scroller.scrollTop += (now.top - scroller.getBoundingClientRect().top) - top.under;
      }
    },
  };
}
