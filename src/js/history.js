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

/**
 * How many nodes `parent.childNodes[0..i)` become once the HTML is parsed
 * again: a run of adjacent text nodes is one node, and an empty run is none.
 */
function parsedIndex(parent, i) {
  let count = 0;
  let runHasText = false;
  for (let k = 0; k < i; k++) {
    const child = parent.childNodes[k];
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.nodeValue.length && !runHasText) { count++; runHasText = true; }
    } else {
      count++;
      runHasText = false;
    }
  }
  return count;
}

/** `pathOf`, counted in the parsed tree (see parsedIndex). */
function parsedPath(root, el) {
  const path = [];
  for (let n = el; n !== root; n = n.parentNode) {
    const parent = n?.parentNode;
    if (!parent) return null;
    path.unshift(parsedIndex(parent, Array.prototype.indexOf.call(parent.childNodes, n)));
  }
  return path;
}

/**
 * A boundary point as it will be in the note's HTML parsed again.
 *
 * A step is stored as HTML and put back with innerHTML, and parsing merges the
 * text nodes that typing, pasting and formatting split, and drops empty ones.
 * A caret recorded by raw child index then pointed at the wrong node or past
 * the end: after Ctrl+Z or Ctrl+Y it sat at the end of the line or at the top
 * of the note, and the next Backspace deleted words nobody touched (long-note
 * trials, 0.8.9).
 */
function parsedPoint(root, node, offset) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const before = node.childNodes[offset - 1];
    const after = node.childNodes[offset];
    // Between two text nodes is inside one text node once parsed.
    if (before?.nodeType === Node.TEXT_NODE && after?.nodeType === Node.TEXT_NODE) return parsedPoint(root, after, 0);
    const path = parsedPath(root, node);
    return path && { path, offset: parsedIndex(node, offset) };
  }
  let first = node;
  let at = offset;
  for (let p = node.previousSibling; p?.nodeType === Node.TEXT_NODE; p = p.previousSibling) { at += p.nodeValue.length; first = p; }
  let length = at - offset + node.nodeValue.length;
  for (let n = node.nextSibling; n?.nodeType === Node.TEXT_NODE; n = n.nextSibling) length += n.nodeValue.length;
  const parent = node.parentNode;
  const parentPath = parent && parsedPath(root, parent);
  if (!parentPath) return null;
  const index = parsedIndex(parent, Array.prototype.indexOf.call(parent.childNodes, first));
  if (!length) return { path: parentPath, offset: index };
  return { path: [...parentPath, index], offset: at };
}

/** Where the caret is, as something that can outlive the DOM it points into. */
export function readCaret(root, selection) {
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = parsedPoint(root, range.startContainer, range.startOffset);
  const end = parsedPoint(root, range.endContainer, range.endOffset);
  if (!start || !end) return null;
  return { start: start.path, startOffset: start.offset, end: end.path, endOffset: end.offset };
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
 * A ceiling on what the stack may hold, in characters of HTML.
 *
 * A step is a whole copy of the note. The guide alone is 85 KB, so a hundred
 * steps of it is 8 MB — survivable. Paste something large into a note and the
 * same hundred steps become hundreds of megabytes, on a machine that has
 * already been killing releases for want of memory. The step count is not
 * enough on its own; the size has to be bounded too.
 */
export const DEFAULT_MAX_CHARS = 8_000_000;

/**
 * @param {HTMLElement} editorEl
 * @param {object} [opts]
 * @param {(html: string) => void} [opts.onRestore] called after a state is put
 *   back, so code blocks and equations can be repainted and the note saved.
 * @param {number} [opts.limit] steps kept per note
 */
export function initHistory(editorEl, { onRestore, limit = DEFAULT_LIMIT, maxChars = DEFAULT_MAX_CHARS, isLocked = () => false } = {}) {
  if (!editorEl) return null;

  let past = [];
  let future = [];

  /**
   * Each picture is held once, not once per step.
   *
   * A pasted image lives in the note as a data: URL, so a step — a whole copy
   * of the note — carried every picture again. An article with its photos is
   * 3 to 6 MB, the stack's ceiling is 8 MB, and so such a note kept ONE step:
   * Ctrl+Z took back the last thing and nothing before it (long-note trials on
   * the rebuilt articles, 0.8.9). A step now holds a short token per picture;
   * the picture itself is kept here, once, while the note is open.
   */
  let pictures = new Map();          // data URL -> token
  let byToken = new Map();           // token -> data URL
  const PICTURE = /data:[^"'&\s)]{2048,}/g;
  const pack = (html) => html.replace(PICTURE, (uri) => {
    let token = pictures.get(uri);
    if (!token) { token = `nebula-picture:${pictures.size}`; pictures.set(uri, token); byToken.set(token, uri); }
    return token;
  });
  const unpack = (html) => html.replace(/nebula-picture:\d+/g, (token) => byToken.get(token) ?? token);

  const snapshotHtml = () => {
    if (!editorEl.querySelector('.note-image.sel')) return pack(editorEl.innerHTML);
    const copy = editorEl.cloneNode(true);
    copy.querySelectorAll('.note-image.sel').forEach((el) => el.classList.remove('sel'));
    return pack(copy.innerHTML);
  };
  let present = { html: snapshotHtml(), caret: null };
  let typingTimer = null;
  let restoring = false;

  const now = () => ({
    html: snapshotHtml(),
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
    // ...and drop from the far end until the stack fits in memory. One step is
    // always kept: undoing once has to remain possible however big the note.
    let held = past.reduce((n, step) => n + step.html.length, 0);
    while (past.length > 1 && held > maxChars) {
      held -= past.shift().html.length;
    }
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
    // The first key of a run closes whatever was done by script since the last
    // step — an image or shape moved, a caption, a colour — as its own step.
    // Otherwise it was folded into the typing that followed, and one Ctrl+Z
    // took back both the words and the move (owner's report, 0.8.7).
    if (!typingTimer) commit();
    clearTimeout(typingTimer);
    typingTimer = setTimeout(commit, TYPING_COALESCE_MS);
  }

  /** The caret as (code element, characters before it), or null outside code. */
  function codeCaret(selection) {
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const host = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const src = host?.closest?.('.code-src');
    if (!src || !editorEl.contains(src)) return null;
    const before = editorEl.ownerDocument.createRange();
    before.selectNodeContents(src);
    before.setEnd(range.startContainer, range.startOffset);
    return { src, path: pathOf(editorEl, src), offset: before.toString().length };
  }

  function putCodeCaret({ src, path, offset }, selection) {
    const code = src.isConnected ? src : nodeAt(editorEl, path);
    if (!code?.matches?.('.code-src')) return;
    const walker = editorEl.ownerDocument.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const range = editorEl.ownerDocument.createRange();
    let left = offset;
    let placed = false;
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (left <= t.nodeValue.length) { range.setStart(t, left); placed = true; break; }
      left -= t.nodeValue.length;
    }
    if (!placed) { range.selectNodeContents(code); range.collapse(false); }
    range.collapse(true);
    code.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function apply(state) {
    restoring = true;
    // Replacing the HTML drops the focused element when it was inside the note
    // (a code block, a caption). Focus then sat on the page, where the next
    // Ctrl+Z went to Chromium's own undo instead of this one.
    const hadFocus = editorEl.contains(editorEl.ownerDocument.activeElement);
    const html = unpack(state.html);
    editorEl.innerHTML = html;
    if (hadFocus && !editorEl.contains(editorEl.ownerDocument.activeElement)) editorEl.focus({ preventScroll: true });
    const selection = editorEl.ownerDocument.defaultView?.getSelection?.();
    writeCaret(editorEl, state.caret, selection);
    // A caret in code: repainting (onRestore) swaps the code's text nodes for
    // coloured ones, and the caret fell to the start of the block, outside its
    // focus, where Backspace did nothing (long-note trials, 0.8.9). Kept as a
    // character count in the code and put back after the repaint.
    const inCode = codeCaret(selection);
    onRestore?.(html);
    if (inCode) putCodeCaret(inCode, selection);
    // Rehydrating controls must not look like a new edit and discard redo.
    present = { html: snapshotHtml(), caret: state.caret };
    restoring = false;
  }

  function undo() {
    if (isLocked()) return false;   // Only view: the menu's Undo must not edit either
    commit();                       // an uncommitted run of typing is a step too
    if (!past.length) return false;
    future.unshift(present);
    apply(past.pop());
    return true;
  }

  function redo() {
    if (isLocked() || !future.length) return false;
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
    pictures = new Map();
    byToken = new Map();
    present = now();
  }

  return {
    push,
    typed,
    undo,
    redo,
    reset,
    commit,
    canUndo: () => past.length > 0 || snapshotHtml() !== present.html,
    canRedo: () => future.length > 0,
    depth: () => ({ past: past.length, future: future.length }),
    bytes: () => past.reduce((n, step) => n + step.html.length, 0),
    isRestoring: () => restoring,
  };
}
