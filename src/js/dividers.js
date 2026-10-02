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
  const TEXTLESS = '.shape-layer, .image-layer, .link-block, .blk-code, hr, .note-image';
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
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      release();
      const above = hr.previousElementSibling;
      if (above && !above.matches(TEXTLESS)) caretIn(above, true);
      else if (pictureAt(above)) editorEl.dispatchEvent(new CustomEvent('nebula-select-image', { detail: above }));
      else caretIn(lineAfter(hr), false);
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && pictureAt(hr.nextElementSibling)) {
      e.preventDefault();
      release();
      editorEl.dispatchEvent(new CustomEvent('nebula-select-image', { detail: hr.nextElementSibling }));
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
