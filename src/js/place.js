import { editorZoom } from './page-zoom.js';

/**
 * Putting a shape or an arrow where the hand wants it (1.0.4, the owner: "it should not be placed
 * the moment it is clicked; until the user places it, a faint preview").
 *
 * What was chosen from the bar follows the pointer as a faint picture that is no part of the note:
 * it hangs on the body, so nothing of it can be saved. A press in the note puts the real thing
 * there; a press anywhere else, or Esc, lets it go.
 */
let pending = null;
const last = { x: null, y: null };
let wired = false;

function follow() {
  if (!pending) return;
  pending.wrap.style.left = `${last.x}px`;
  pending.wrap.style.top = `${last.y}px`;
}

function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener('mousemove', (e) => {
    last.x = e.clientX;
    last.y = e.clientY;
    follow();
  }, true);
  // Before the note's own handlers: the press that places must not also pick what lies under it.
  document.addEventListener('mousedown', (e) => {
    if (!pending) return;
    const { editorEl, put } = pending;
    const inside = e.button === 0 && editorEl.contains(e.target) && editorEl.dataset.readonly !== 'true';
    cancelPlacing();
    if (!inside) return;
    e.preventDefault();
    e.stopPropagation();
    put(e);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!pending || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    cancelPlacing();
  }, true);
}

/** Whether something chosen is still waiting for its place. */
export function isPlacing() {
  return Boolean(pending);
}

export function cancelPlacing() {
  if (!pending) return;
  pending.wrap.remove();
  document.body.classList.remove('is-placing');
  pending = null;
}

/**
 * @param {HTMLElement} editorEl the note
 * @param {{ ghost: Element, width: number, height: number, put: (e: MouseEvent) => void }} what
 *   the picture to show, its size on the page, and what a press in the note does
 */
export function beginPlacing(editorEl, { ghost, width, height, put }) {
  wire();
  cancelPlacing();
  const wrap = document.createElement('div');
  wrap.className = 'place-ghost';
  wrap.style.width = `${width}px`;
  wrap.style.height = `${height}px`;
  wrap.style.setProperty('--z', String(editorZoom(editorEl)));
  wrap.appendChild(ghost);
  if (last.x === null) {
    // Chosen with the keys before the pointer ever moved: it waits in the middle of the note.
    const r = editorEl.getBoundingClientRect();
    last.x = r.left + r.width / 2;
    last.y = r.top + r.height / 2;
  }
  document.body.appendChild(wrap);
  document.body.classList.add('is-placing');
  pending = { editorEl, wrap, put };
  follow();
}

/** Where a press is on the page of the note: a layer's own left and top, whatever the zoom. */
export function pagePoint(editorEl, layer, e) {
  const origin = layer.getBoundingClientRect();
  const z = editorZoom(editorEl);
  return { x: (e.clientX - origin.left) / z, y: (e.clientY - origin.top) / z };
}
