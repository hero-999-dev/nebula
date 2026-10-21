/**
 * What a note IS, as opposed to what the editor is showing right now.
 *
 * The editor's DOM carries state that only means something while the note is
 * on screen: the picture or shape that is selected, the shape being typed in,
 * the divider armed for deletion, the arrow that is picked up and the object it
 * is about to snap to, a rotation readout, the pending-format caret. Until
 * 0.9.1 the save path wrote `innerHTML` as it stood, so whatever of these was
 * on screen at an autosave was frozen into the note — the owner's Ideas note
 * holds a picture that is "selected" forever. Undo steps had a shorter list of
 * their own (0.9.0) and the migration a third. This is the one list, used by
 * the save, by every undo step, and by the migration that cleans the notes
 * written before it (owner, 2026-09-27: a fixed bug must not live on inside
 * the notes it already touched).
 */

import { cleanTypingMarkers } from './inline-family.js';

/** [where, the class that only means "on screen now"] */
const CLASS_STATE = [
  ['.note-image.sel, .shape.sel', 'sel'],
  ['.link-block.sel', 'sel'],
  ['.shape.editing', 'editing'],
  ['.note-arrow.is-selected', 'is-selected'],
  ['.arrow-target', 'arrow-target'],
  ['hr.armed', 'armed'],
  ['.note-mention.is-missing', 'is-missing'],
  // A video the player could not play, found out on this screen (file-video.js).
  ['.link-file.cannot-play', 'cannot-play'],
  // Cells selected, stood in, or about to be filled (table.js).
  ['.blk-table td.sel', 'sel'],
  ['.blk-table td.act', 'act'],
  ['.blk-table td.fill', 'fill'],
  // A block picked with its grip, or lifted while it is dragged (1.0.0, block-handle.js).
  ['.block-picked', 'block-picked'],
  ['.block-lifted', 'block-lifted'],
];

/**
 * Elements that exist only while something is being done or shown: the angle
 * readout, and the bar under a video's player (0.9.4, file-video.js) — drawn
 * whenever a note is shown, with the player's clock in it — and what is drawn
 * round a table (table.js): its numbering, grips, the two +, the fill square
 * and the choices for the selected cells; and an attached file's Open and
 * Save a copy (0.9.6, file-attach.js), in the app's language.
 */
export const TRANSIENT_NODES = '.shape-angle, .video-bar, .tbl-ui, .attach-bar, .wg-live';
// (The crop frame and an embed's grip: the frame is on the page, not in the
// note; the grip is in the note, rebuilt on load like a shape's handles.)

/**
 * A shape's text is editable only while it is being edited (0.6.4). Without the
 * attribute it inherits the editor's `contenteditable`, so anything but "false"
 * counts as left editable.
 */
const EDITABLE_SHAPE_TEXT = '.shape-text:not([contenteditable="false"])';

/**
 * A table's column drawn narrower than it is, so that the table stays on its
 * page (table.js fitTable): the note holds the column's own width.
 */
const FITTED_COL = '.blk-table col[data-w]';

/**
 * A table's row with its height told to the stylesheet (table-grid.js
 * tellHeight): the note holds the height alone.
 */
const TOLD_ROW = '.blk-table tr[style*="--row"]';

const ANY_TRANSIENT = [...CLASS_STATE.map(([where]) => where), TRANSIENT_NODES, EDITABLE_SHAPE_TEXT, FITTED_COL, TOLD_ROW].join(', ');

export function hasTransient(root) {
  return !!root?.querySelector(ANY_TRANSIENT);
}

/**
 * Take the on-screen state out of `root`, in place.
 * @returns {number} how many things were taken out
 */
export function stripTransient(root) {
  if (!root) return 0;
  let touched = 0;
  for (const [where, cls] of CLASS_STATE) {
    for (const el of root.querySelectorAll(where)) {
      el.classList.remove(cls);
      // `<hr class="">` is not `<hr>`: the stored markup would differ from what
      // this version writes for the same note.
      if (!el.classList.length) el.removeAttribute('class');
      touched += 1;
    }
  }
  for (const el of root.querySelectorAll(TRANSIENT_NODES)) { el.remove(); touched += 1; }
  for (const el of root.querySelectorAll(EDITABLE_SHAPE_TEXT)) {
    el.setAttribute('contenteditable', 'false');
    touched += 1;
  }
  for (const col of root.querySelectorAll(FITTED_COL)) {
    const w = Number.parseFloat(col.dataset.w);
    if (w > 0) col.style.width = `${w}px`;
    col.removeAttribute('data-w');
    touched += 1;
  }
  for (const tr of root.querySelectorAll(TOLD_ROW)) {
    tr.style.removeProperty('--row');
    if (!tr.getAttribute('style')) tr.removeAttribute('style');
    touched += 1;
  }
  return touched;
}

/**
 * The note as it is stored: the editor's markup without on-screen state.
 *
 * @param {Element} el the editor
 * @param {{keepTypingMarkers?: boolean}} [opts] undo steps keep the
 *   pending-format caret, so taking a step back puts it back; a save never does.
 */
export function serializeNote(el, { keepTypingMarkers = false } = {}) {
  const typing = !keepTypingMarkers && !!el.querySelector('[data-format-caret]');
  if (!typing && !hasTransient(el)) return el.innerHTML;
  const copy = el.cloneNode(true);
  stripTransient(copy);
  if (typing) cleanTypingMarkers(copy);
  return copy.innerHTML;
}
