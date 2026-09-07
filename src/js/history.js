/**
 * The editor's own undo/redo.
 *
 * Chromium's undo stack only knows about edits Chromium made. Everything this
 * app does by script — adding, moving, recolouring or deleting a shape,
 * repairing a list, placing an equation, wrapping a selection — is invisible to
 * it. So `document.execCommand('undo')` would roll back some older typing while
 * the scripted edit stayed put, and the two states together came out as
 * duplicated text. Routing scripted edits through `insertHTML` (0.4.4) made
 * them undoable but rewrote the spaces around the selection as `&nbsp;`, which
 * is its own corruption.
 *
 * So: snapshots. The note is small, the app already serialises it on every
 * keystroke for autosave, and a snapshot is the one representation that cannot
 * disagree with what is on screen.
 *
 * Typing is coalesced — a run of characters is one step, the way it is in every
 * other editor. Anything else (Enter, a delete, a paste, any toolbar action)
 * closes the current step and starts a new one.
 */

/** Where a node sits, as child indexes from the root. Survives innerHTML. */
export function pathOf(root, node) {
  if (!node || !root.contains(node)) return null;
  const path = [];
  let n = node;
  while (n && n !== root) {
    const parent = n.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, n));
    n = parent;
  }
  return n === root ? path : null;
}

/** The node a path points at, or null if the tree no longer has one there. */
export function nodeAt(root, path) {
  let n = root;
  for (const i of path ?? []) {
    if (!n?.childNodes?.[i]) return null;
    n = n.childNodes[i];
  }
  return n;
}

/** Where the caret is, as something that can outlive the DOM it points into. */
export function readCaret(root, selection) {
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const start = pathOf(root, range.startContainer);
  const end = pathOf(root, range.endContainer);
  if (!start || !end) return null;
  return { start, startOffset: range.startOffset, end, endOffset: range.endOffset };
}

/** Put the caret back. Silently gives up if the shape of the note changed. */
export function writeCaret(root, caret, selection) {
  if (!caret || !selection) return false;
  const startNode = nodeAt(root, caret.start);
  const endNode = nodeAt(root, caret.end);
  if (!startNode || !endNode) return false;
  const cap = (node, offset) => Math.min(
    offset,
    node.nodeType === Node.TEXT_NODE ? node.nodeValue.length : node.childNodes.length,
  );
  try {
    const range = root.ownerDocument.createRange();
    range.setStart(startNode, cap(startNode, caret.startOffset));
    range.setEnd(endNode, cap(endNode, caret.endOffset));
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  } catch {
    return false; // an offset that no longer exists is not worth throwing over
  }
}

export const TYPING_COALESCE_MS = 600;
export const DEFAULT_LIMIT = 100;

/**
 * @param {HTMLElement} editorEl
 * @param {object} [opts]
 * @param {(html: string) => void} [opts.onRestore] called after a state is put
 *   back, so code blocks and equations can be repainted and the note saved.
 * @param {number} [opts.limit] steps kept per note
 */
export function initHistory(editorEl, { onRestore, limit = DEFAULT_LIMIT } = {}) {
  if (!editorEl) return null;

  let past = [];
  let future = [];
  let present = { html: editorEl.innerHTML, caret: null };
  let typingTimer = null;
  let restoring = false;

  const now = () => ({
    html: editorEl.innerHTML,
    caret: readCaret(editorEl, editorEl.ownerDocument.defaultView?.getSelection?.()),
  });

  /** Close the current step: whatever is on screen becomes the new present. */
  function commit() {
    clearTimeout(typingTimer);
    typingTimer = null;
    const current = now();
    if (current.html === present.html) { present = current; return false; }
    past.push(present);
    if (past.length > limit) past.shift();
    future = [];
    present = current;
    return true;
  }

  /**
   * Call immediately BEFORE a scripted edit. Anything typed up to now becomes
   * its own step, so one Ctrl+Z takes back the action and not the sentence.
   */
  function push() {
    if (restoring) return;
    commit();
  }

  /** A keystroke landed. Coalesce a run of them into one step. */
  function typed({ separate = false } = {}) {
    if (restoring) return;
    if (separate) { commit(); return; }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(commit, TYPING_COALESCE_MS);
  }

  function apply(state) {
    restoring = true;
    editorEl.innerHTML = state.html;
    writeCaret(editorEl, state.caret, editorEl.ownerDocument.defaultView?.getSelection?.());
    present = { html: editorEl.innerHTML, caret: state.caret };
    restoring = false;
    onRestore?.(state.html);
  }

  function undo() {
    commit();                       // an uncommitted run of typing is a step too
    if (!past.length) return false;
    future.unshift(present);
    apply(past.pop());
    return true;
  }

  function redo() {
    if (!future.length) return false;
    past.push(present);
    apply(future.shift());
    return true;
  }

  /** A different note is open; its history is not this note's. */
  function reset() {
    clearTimeout(typingTimer);
    typingTimer = null;
    past = [];
    future = [];
    present = now();
  }

  return {
    push,
    typed,
    undo,
    redo,
    reset,
    commit,
    canUndo: () => past.length > 0 || editorEl.innerHTML !== present.html,
    canRedo: () => future.length > 0,
    depth: () => ({ past: past.length, future: future.length }),
    isRestoring: () => restoring,
  };
}
