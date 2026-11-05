/**
 * A divider can be picked with the mouse (0.9.3).
 *
 * A click on a divider used to hand Chromium a point between two blocks, and
 * the caret came up wherever Chromium settled it — the owner: "clicking the
 * divider, a text cursor appears from some odd place". A click now selects the
 * divider: it is outlined, Backspace or Delete takes it away (one step to
 * undo), and any other key lets go of it and carries on in the line below.
 *
 * The outline is the same `armed` class the Backspace-twice path uses, so a
 * divider armed either way is deleted the same way, and note-markup.js already
 * keeps it out of the saved note.
 */

const HR = 'hr.blk-hr';

/**
 * @param {HTMLElement} editorEl
 * @param {{history?: {push: () => void}, isLocked?: () => boolean}} [opts]
 */
export function initDividerSelect(editorEl, { history, isLocked = () => false } = {}) {
  if (!editorEl) return null;
  let picked = null;

  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  function release() {
    if (picked?.isConnected) picked.classList.remove('armed');
    picked = null;
  }

  function caretIn(el, atEnd) {
    const sel = window.getSelection();
    const r = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    if (atEnd) for (let t = text; t; t = walker.nextNode()) text = t;
    if (text) r.setStart(text, atEnd ? text.nodeValue.length : 0);
    else r.setStart(el, atEnd ? el.childNodes.length : 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /** A line of text next to the divider, made if there is none. */
  const TEXTLESS = '.shape-layer, .image-layer, .link-block, .blk-code, .blk-table, hr, .note-image';
  function lineAfter(hr) {
    const next = hr.nextElementSibling;
    if (next && !next.matches(TEXTLESS)) return next;
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    hr.after(p);
    return p;
  }

  function pick(hr) {
    editorEl.querySelectorAll(`${HR}.armed`).forEach((h) => h.classList.remove('armed'));
    picked = hr;
    hr.classList.add('armed');
    if (!editorEl.contains(document.activeElement)) editorEl.focus({ preventScroll: true });
    // The divider itself is the selection, so the keys below reach the editor
    // and nothing is drawn as a caret somewhere else.
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStartBefore(hr);
    r.setEndAfter(hr);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  editorEl.addEventListener('mousedown', (e) => {
    const hr = e.target.closest?.(HR);
    if (!hr || !editorEl.contains(hr) || e.button !== 0 || isLocked()) {
      // The divider's selection goes with it: a click on the picture under
      // a picked divider left the divider selected, and deleting the picture
      // then left nothing picked and no caret (0.9.3). A click in text puts
      // its own caret over this at once.
      const was = picked;
      release();
      const sel = window.getSelection();
      if (was?.isConnected && sel?.rangeCount && !sel.isCollapsed) {
        const r = sel.getRangeAt(0);
        if (r.startContainer === editorEl && r.endContainer === editorEl && editorEl.childNodes[r.startOffset] === was) {
          r.setStartAfter(was);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
      return;
    }
    e.preventDefault();
    pick(hr);
  }, true);

  /** The nearest line over a divider, past what takes no caret. */
  function upTo(hr) {
    let el = hr.previousElementSibling;
    while (el && el.matches(TEXTLESS)) el = el.previousElementSibling;
    return el;
  }

  /**
   * Whether the caret stands on the first (or last) row of a block's words.
   * A caret at the very start of a text has no box, so the character beside it
   * says which row it is on; a block with no words has one row.
   */
  function onEdgeRow(block, range, up) {
    const all = document.createRange();
    all.selectNodeContents(block);
    const rows = [...all.getClientRects()].filter((b) => b.height);
    if (!rows.length) return true;
    const probe = range.cloneRange();
    let box = probe.getClientRects()[0];
    if (!box?.height && range.startContainer.nodeType === 3) {
      const text = range.startContainer;
      const at = range.startOffset;
      if (at < text.length) probe.setEnd(text, at + 1); else if (at > 0) probe.setStart(text, at - 1);
      box = probe.getClientRects()[0];
    }
    if (!box?.height) {
      // Between elements: only the block's very edge counts.
      const side = document.createRange();
      side.selectNodeContents(block);
      if (up) side.setEnd(range.startContainer, range.startOffset); else side.setStart(range.startContainer, range.startOffset);
      return !side.toString().replace(/​/g, '').trim();
    }
    const mid = box.top + box.height / 2;
    return up ? mid < rows[0].bottom : mid > rows.at(-1).top;
  }

  // Up from the row right under a divider, or Down from the row right over one,
  // stops on the divider: the arrows pass it one step at a time, and the caret
  // is not left on no line beside it to be pushed back (the owner's Ideas note).
  const WHOLE = '.blk-table, .blk-code, .blk-toggle, .link-block, .note-image';
  editorEl.addEventListener('keydown', (e) => {
    if (picked || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return;
    let block = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
    if (!block || !editorEl.contains(block) || block.closest(WHOLE)) return;
    while (block && block !== editorEl && block.parentElement !== editorEl && !block.parentElement?.matches('.blk-col, .toggle-body')) block = block.parentElement;
    if (!block || block === editorEl) return;
    const up = e.key === 'ArrowUp';
    const hr = up ? block.previousElementSibling : block.nextElementSibling;
    if (!hr?.matches(HR) || !onEdgeRow(block, sel.getRangeAt(0), up)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pick(hr);
  }, true);

  editorEl.addEventListener('keydown', (e) => {
    if (!picked) return;
    if (!picked.isConnected || !picked.classList.contains('armed')) { picked = null; return; }
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    if ((e.ctrlKey || e.metaKey) && ['z', 'y', 'c'].includes(e.key.toLowerCase())) { release(); return; }
    const hr = picked;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      e.stopImmediatePropagation();
      history?.push();
      const above = hr.previousElementSibling;
      const below = hr.nextElementSibling;
      release();
      hr.remove();
      if (below && !below.matches(TEXTLESS)) caretIn(below, false);
      else if (above && !above.matches(TEXTLESS)) caretIn(above, true);
      dirty();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      release();
      caretIn(lineAfter(hr), false);
      return;
    }
    // A picture next to the divider is selected, not given an empty line to
    // stand on: that line was the "caret between the divider and the
    // picture" (the owner, 0.9.3).
    const pictureAt = (el) => (el?.matches('.note-image') && !el.closest('.shape-layer, .image-layer') ? el : null);
    // The divider's selection goes first: left over it, Esc on the picture let
    // go with no caret, and the next key typed would have replaced the divider.
    const selectPicture = (picture) => {
      const sel = window.getSelection();
      const r = document.createRange();
      r.setStartBefore(picture);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      editorEl.dispatchEvent(new CustomEvent('nebula-select-image', { detail: picture }));
    };
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      release();
      const above = hr.previousElementSibling;
      if (above && !above.matches(TEXTLESS)) caretIn(above, true);
      else if (above?.matches(HR)) pick(above);
      else if (pictureAt(above)) selectPicture(above);
      else {
        // Nothing over it to stand on: it stays picked. Sending the caret back
        // under it, the next Up picked it again, and the two pushed each other
        // for ever (the owner's Ideas note).
        const line = upTo(hr);
        if (line) caretIn(line, true); else pick(hr);
      }
      return;
    }
    // The next divider of a pair is picked in its turn: no line is made between them.
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && hr.nextElementSibling?.matches(HR)) {
      e.preventDefault();
      release();
      pick(hr.nextElementSibling);
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && pictureAt(hr.nextElementSibling)) {
      e.preventDefault();
      release();
      selectPicture(hr.nextElementSibling);
      return;
    }
    if (e.key === 'Enter') {
      // A new line right under the divider.
      e.preventDefault();
      e.stopImmediatePropagation();
      history?.push();
      release();
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      hr.after(p);
      caretIn(p, false);
      dirty();
      return;
    }
    // Anything else — typing, the other arrows — carries on in the line below.
    release();
    const had = hr.nextElementSibling;
    const line = lineAfter(hr);
    if (line !== had) dirty();
    caretIn(line, false);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') e.preventDefault();
  }, true);

  // The caret left beside a divider on no line (toolbar.js settleGap) picks it.
  editorEl.addEventListener('nebula-pick-divider', (e) => {
    const hr = e.detail;
    if (hr?.isConnected && editorEl.contains(hr) && hr.matches(HR) && !isLocked()) pick(hr);
  });

  // Anything that changes the selection some other way lets the divider go.
  document.addEventListener('selectionchange', () => {
    if (!picked) return;
    const sel = window.getSelection();
    const r = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (!r || r.collapsed || !r.intersectsNode(picked)) release();
  });

  return { release, picked: () => picked };
}
