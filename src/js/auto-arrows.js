/**
 * Arrows as they are typed (0.9.4).
 *
 * The owner's Ideas note: "when you do this --> you will get arrow
 * automatically and this <-- arrows". The three characters become one as the
 * last of them is typed: `-->` an arrow to the right, `<--` one to the left.
 * Code is left alone — there `-->` closes a comment.
 *
 * The swap is its own undo step: Ctrl+Z gives the three characters back, for
 * the times they were meant.
 *
 * And a line of dashes becomes a divider: "when it goes past four dashes, make
 * it a divider by itself" (the owner, on the first build) — read first as the
 * fifth, and then set right: "at the fourth dash". The fourth dash on a line
 * that holds nothing else does it; Ctrl+Z gives the dashes back.
 */

import { blockFromNode, insertDivider } from './blocks.js';

const ARROWS = [['-->', '→'], ['<--', '←']];

/**
 * @param {string} before the text up to the caret
 * @returns {{cut: number, put: string} | null} how many characters go, and what comes
 */
export function arrowFor(before) {
  const text = String(before ?? '');
  for (const [typed, arrow] of ARROWS) {
    if (text.endsWith(typed)) return { cut: typed.length, put: arrow };
  }
  return null;
}

const NO_ARROWS = '.code-src, .blk-code, .inline-code, pre, code, .inline-eq, .note-mention, .note-tag';

/** Dashes on a line of their own that turn into a divider. */
export const DIVIDER_DASHES = 4;
/** Whether a line's words are those dashes and nothing else. */
export const isDividerLine = (text) => String(text ?? '').replace(/[\u200b\u00a0 ]/g, '') === '-'.repeat(DIVIDER_DASHES);

/**
 * @param {HTMLElement} editorEl
 * @param {{history?: {push: () => void}, isLocked?: () => boolean}} [deps]
 */
export function initAutoArrows(editorEl, { history, isLocked = () => false } = {}) {
  if (!editorEl) return;

  /** A plain line that is four dashes and nothing else: the line goes, a divider stands there. */
  function dashesToDivider(node) {
    const line = node.parentElement?.closest('p, div:not([class])');
    if (!line || line === editorEl || !editorEl.contains(line) || line.closest('li, blockquote, .blk-todo, .toggle-title, .shape, .image-caption')) return false;
    if (!isDividerLine(line.textContent) || line.querySelector('img, .inline-eq, .note-image')) return false;
    if (blockFromNode(node, editorEl) !== line) return false;
    history?.push();
    line.innerHTML = '<br>';
    const sel = window.getSelection();
    const here = document.createRange();
    here.setStart(line, 0);
    here.collapse(true);
    sel.removeAllRanges();
    sel.addRange(here);
    const after = insertDivider(editorEl, sel);
    const caret = document.createRange();
    caret.setStart(after, 0);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  editorEl.addEventListener('input', (e) => {
    if (e.inputType !== 'insertText' || e.isComposing || isLocked()) return;
    if (e.data !== '>' && e.data !== '-') return;
    const sel = window.getSelection();
    if (!sel?.isCollapsed) return;
    const node = sel.anchorNode;
    if (node?.nodeType !== Node.TEXT_NODE || !editorEl.contains(node)) return;
    if (node.parentElement?.closest(NO_ARROWS)) return;
    if (e.data === '-' && dashesToDivider(node)) return;
    const found = arrowFor(node.nodeValue.slice(0, sel.anchorOffset));
    if (!found) return;
    history?.push();
    const start = sel.anchorOffset - found.cut;
    node.replaceData(start, found.cut, found.put);
    const caret = document.createRange();
    caret.setStart(node, start + found.put.length);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
  });
}
