/**
 * A highlight with nothing in it is taken away (1.0.3).
 *
 * The owner's Bug Find note: "Enter in a bullet carries the highlight down and
 * then I cannot click back there", "I delete the highlighted words and a thin
 * highlight is left at the start". Chrome copies the inline marks of the line
 * an Enter splits into the new line, so the new line opened inside an empty
 * highlight: its 2px painted edges (editor.css) showed as a sliver, the caret
 * sat in it, and everything typed next came out highlighted. A highlight whose
 * words were all deleted was left behind the same way.
 *
 * After each edit, the highlights in the line the caret is in and the line
 * before it that hold no text are unwrapped: what they held stays (a <br>
 * keeps an empty line open), and a caret that was inside stays where it was.
 */

const HILITES = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const MARK = HILITES.map((c) => `span.h-${c}`).join(',');
const BLOCK = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote,td,figcaption';

/** Whether a mark holds no words: only nothing, <br>s or zero-width spaces. */
const isEmptyMark = (span) => !span.textContent.replace(/[​﻿]/g, '');

/**
 * Unwrap the empty highlights in `root`; a caret inside one is put back at the
 * place it held. Pure on the DOM it is given — tested.
 * @param {Element} root
 * @param {Selection|null} [sel]
 * @returns {number} how many were taken away
 */
export function dropEmptyMarks(root, sel = null) {
  let dropped = 0;
  const marks = [...(root.matches?.(MARK) ? [root] : []), ...root.querySelectorAll(MARK)].reverse();
  for (const span of marks) {
    if (!span.isConnected || !isEmptyMark(span)) continue;
    const parent = span.parentNode;
    const at = [...parent.childNodes].indexOf(span);
    const held = !!sel?.rangeCount && span.contains(sel.anchorNode);
    span.replaceWith(...span.childNodes);
    dropped++;
    if (held) {
      const range = document.createRange();
      range.setStart(parent, Math.min(at, parent.childNodes.length));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  return dropped;
}

/** @param {HTMLElement} editorEl */
export function initMarkHeal(editorEl) {
  editorEl.addEventListener('input', (e) => {
    const sel = getSelection();
    if (!sel?.rangeCount) return;
    let node = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (!node || !editorEl.contains(node)) return;
    const block = node.closest(BLOCK);
    if (!block || block === editorEl || !editorEl.contains(block)) return;
    dropEmptyMarks(block, sel);
    const before = block.previousElementSibling;
    if (before) dropEmptyMarks(before, sel);
    // A deleted highlight lives on in Chrome's typing style and comes back as
    // <font color><span style="background"> on the next key. Setting the same
    // caret again forgets it; outside a mark only, so typing inside one stays marked.
    if (e.inputType?.startsWith('delete') && sel.isCollapsed && !sel.anchorNode?.parentElement?.closest(MARK)) {
      const range = sel.getRangeAt(0).cloneRange();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
}
