/**
 * Getting out of an inline format.
 *
 * Inline code, equations and the underline styles are real `<span>` wrappers,
 * not browser command state. Once the caret is inside one there was no way out:
 * Enter started the next line still inside the wrapper, and Backspace deleted a
 * character instead of the formatting. Every other note app answers this the
 * same way, so Nebula does too:
 *
 *   Enter at the end of a wrapper  -> the new line starts unformatted
 *   Enter in the middle            -> both halves keep the format (a real split)
 *   Backspace at the start, or in
 *   an empty wrapper               -> the wrapper is removed, the text stays
 *
 * Backspace is the deliberate signal: "I am not continuing in this format."
 */

export const INLINE_WRAPPERS = [
  'inline-code', 'inline-eq',
  'u-single', 'u-double', 'u-bold', 'u-wavy', 'u-dash',
];

const SELECTOR = INLINE_WRAPPERS.map((c) => `.${c}`).join(',');

/** The wrapper the node sits in, if it is inside `root`. */
export function wrapperAt(node, root) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  const wrapper = el?.closest?.(SELECTOR) ?? null;
  return wrapper && root?.contains(wrapper) ? wrapper : null;
}

export function isEmptyWrapper(wrapper) {
  return wrapper.textContent.replace(/[​\s]/g, '') === '';
}

/** Nothing between the caret and the wrapper's end. */
export function caretAtWrapperEnd(range, wrapper) {
  if (!range.collapsed) return false;
  const probe = wrapper.ownerDocument.createRange();
  probe.selectNodeContents(wrapper);
  probe.setStart(range.endContainer, range.endOffset);
  return probe.toString().length === 0;
}

/** Nothing between the wrapper's start and the caret. */
export function caretAtWrapperStart(range, wrapper) {
  if (!range.collapsed) return false;
  const probe = wrapper.ownerDocument.createRange();
  probe.selectNodeContents(wrapper);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length === 0;
}

/** Replace a wrapper with its own children. @returns the first moved node */
export function unwrap(wrapper) {
  const parent = wrapper.parentNode;
  if (!parent) return null;
  const first = wrapper.firstChild;
  while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
  wrapper.remove();
  return first;
}

/** The block this node lives in, as a direct child of the editor. */
function blockOf(node, root) {
  let el = node?.nodeType === 1 ? node : node?.parentElement;
  while (el && el.parentElement && el.parentElement !== root) el = el.parentElement;
  return el && el.parentElement === root ? el : null;
}

/**
 * Enter at the very end of a wrapper: build the next block ourselves.
 *
 * Moving the caret out of the wrapper first is not enough. Chromium carries a
 * "typing style" across the break and re-creates the same inline element on the
 * new line — measured, not assumed:
 *
 *   <p><span class="inline-code">plain</span></p>
 *   <p><span class="inline-code">after</span></p>   <- what it produced
 *
 * So the break is made here instead, and the new block starts genuinely empty.
 * Lists are left alone: <li> has its own Enter behaviour worth keeping.
 *
 * @returns {boolean} true if handled — the caller must preventDefault
 */
export function enterOutOfWrapper(root, selection) {
  if (!selection || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  const wrapper = wrapperAt(range.startContainer, root);
  if (!wrapper || !caretAtWrapperEnd(range, wrapper)) return false;

  const block = blockOf(wrapper, root);
  if (!block || /^(LI|UL|OL)$/.test(block.tagName)) return false;

  // Only when the wrapper ends the block. With text after it the browser's own
  // split already starts the new line outside the wrapper.
  const doc = root.ownerDocument;
  const tail = doc.createRange();
  tail.selectNodeContents(block);
  tail.setStart(range.endContainer, range.endOffset);
  if (tail.toString().length) return false;

  const tag = /^(P|DIV)$/.test(block.tagName) ? block.tagName.toLowerCase() : 'p';
  const next = doc.createElement(tag);
  next.innerHTML = '<br>';
  if (block.dataset?.ind && tag === block.tagName.toLowerCase()) next.dataset.ind = block.dataset.ind;
  block.after(next);

  const caret = doc.createRange();
  caret.setStart(next, 0);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
}

/**
 * Called on Backspace. Strips the wrapper when the caret is at its start or the
 * wrapper is empty, and leaves the text alone.
 *
 * @returns {boolean} whether it handled the key (caller should preventDefault)
 */
export function backspaceOutOfWrapper(root, selection) {
  if (!selection || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;

  const wrapper = wrapperAt(range.startContainer, root);
  if (!wrapper) return false;

  const empty = isEmptyWrapper(wrapper);
  if (!empty && !caretAtWrapperStart(range, wrapper)) return false;

  const doc = wrapper.ownerDocument;
  const parent = wrapper.parentNode;
  const index = Array.prototype.indexOf.call(parent.childNodes, wrapper);
  const first = wrapper.firstChild;
  if (empty) wrapper.remove();
  else unwrap(wrapper);

  // A zero-length text node before the wrapper has no line box. Chromium then
  // paints the caret at the block's extreme left edge — the reported jump in
  // the two Untitled screenshots. Anchor to the first real character instead;
  // the visible line start is stable even when the wrapper was nested in a
  // colour or highlight span.
  // Search only the former wrapper, never earlier text in its parent.
  const firstText = !empty && first?.nodeType === 3 ? first
    : !empty && first ? doc.createTreeWalker(first, NodeFilter.SHOW_TEXT).nextNode() : null;
  const next = doc.createRange();
  if (firstText?.textContent.length) next.setStart(firstText, 0);
  else next.setStart(parent, Math.min(index, parent.childNodes.length));
  next.collapse(true);
  selection.removeAllRanges();
  selection.addRange(next);
  return true;
}

/**
 * Bold and italic that are switched OFF stay off across Enter.
 *
 * Chromium forgets a cleared typing style when it starts a new line and copies
 * the formatting of the text before the caret instead: finish a line in
 * italics, press Ctrl+I, press Enter, and the next line is italic again —
 * then Ctrl+I there turns it *off*, so the words meant to be italic come out
 * plain (found by the page-rebuild test). The caller notes which formats were
 * off before Enter; this strips those wrappers from the new, still-empty line.
 */
export function formatsAt(node, root) {
  const out = { bold: false, italic: false };
  for (let el = node?.nodeType === 1 ? node : node?.parentElement; el && el !== root; el = el.parentElement) {
    const weight = el.style?.fontWeight;
    if (/^(B|STRONG)$/.test(el.tagName) || weight === 'bold' || Number(weight) >= 600) out.bold = true;
    if (/^(I|EM)$/.test(el.tagName) || el.style?.fontStyle === 'italic') out.italic = true;
  }
  return out;
}

/** @param {('bold'|'italic')[]} kinds formats to remove from the caret's empty line */
export function dropFormatsOnEmptyLine(root, selection, kinds) {
  if (!kinds.length || !selection?.rangeCount || !selection.isCollapsed) return false;
  let el = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement;
  let line = el;
  while (line && line.parentElement && line.parentElement !== root && !/^(P|DIV|LI|H[1-6]|BLOCKQUOTE)$/.test(line.tagName)) line = line.parentElement;
  if (!line || !root.contains(line) || line.textContent.replace(/\u200b/g, '').trim()) return false;
  let changed = false;
  for (el = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement; el && el !== line;) {
    const parent = el.parentElement;
    const weight = el.style?.fontWeight;
    const bold = /^(B|STRONG)$/.test(el.tagName) || weight === 'bold' || Number(weight) >= 600;
    const italic = /^(I|EM)$/.test(el.tagName) || el.style?.fontStyle === 'italic';
    if ((bold && kinds.includes('bold')) || (italic && kinds.includes('italic'))) {
      // Keep the other format if this element carried both.
      if (bold && italic && !(kinds.includes('bold') && kinds.includes('italic'))) {
        if (kinds.includes('bold')) el.style.fontWeight = ''; else el.style.fontStyle = '';
      } else {
        unwrap(el);
      }
      changed = true;
    }
    el = parent;
  }
  if (changed) {
    if (!line.firstChild) line.innerHTML = '<br>';
    const r = root.ownerDocument.createRange();
    r.setStart(line, 0);
    r.collapse(true);
    selection.removeAllRanges();
    selection.addRange(r);
  }
  return changed;
}
