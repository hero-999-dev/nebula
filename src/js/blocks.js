/**
 * Turn the caret's own block into a heading or a list.
 *
 * `execCommand('formatBlock' | 'insertUnorderedList')` does not stop at that
 * block. A divider is a void element, so the command treats everything up to
 * it as one range: a bullet restyles the heading above, and Heading 3 turns
 * every line until the rule into a heading. The divider then sits inside the
 * list and indents as typing continues.
 *
 * These functions edit one element. Callers pass the block the caret is in.
 */

const LIST = { bullet: 'ul', numbered: 'ol' };
const TAG = { text: 'p', p: 'p', h1: 'h1', h2: 'h2', h3: 'h3', quote: 'blockquote' };

const NAMED = 'li,h1,h2,h3,h4,h5,h6,p,blockquote,div.blk-todo';
/** Children that make a <div> a container rather than one line of text. */
const BLOCK_CHILD = 'div,p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,hr,figure,table';
const BLOCK_TAGS = new Set(BLOCK_CHILD.toUpperCase().split(','));
/** Never a line of prose, even though some of these are divs. */
const NOT_A_LINE = '.shape-layer,.image-layer,.shape,.link-block,.blk-code,.note-image,[contenteditable="false"]';

/**
 * The nearest block a slash command or the outline menu may restyle.
 *
 * Not only named blocks: Enter after a heading makes Chromium start a bare
 * `<div>`, and old notes hold text straight in the editor. Returning null for
 * those made `/h3` and `/bullet` do nothing on most typed lines (0.8.3). A bare
 * run of text is wrapped in a `<p>` here so the caller has one element to turn.
 */
export function blockFromNode(node, root) {
  if (!node || !root || node === root) return null;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el || !root.contains(el)) return null;
  const inside = (sel) => { const hit = el.closest(sel); return hit && hit !== root && root.contains(hit) ? hit : null; };
  if (inside(NOT_A_LINE)) return null;
  const named = inside(NAMED);
  if (named) return named;
  for (let d = el; d && d !== root; d = d.parentElement) {
    if (d.tagName === 'DIV' && !d.querySelector(`:scope > :is(${BLOCK_CHILD})`)) return d;
  }
  return wrapLine(node, root);
}

/** Wrap the inline run around `node` (bounded by <br> or a block) in a <p>. */
function wrapLine(node, root) {
  let top = node;
  while (top.parentNode && top.parentNode !== root) top = top.parentNode;
  if (top.parentNode !== root) return null;
  const isEdge = (n) => n.nodeType === Node.ELEMENT_NODE && (BLOCK_TAGS.has(n.tagName) || n.tagName === 'BR' || n.matches(NOT_A_LINE));
  if (isEdge(top)) return null;
  let first = top;
  while (first.previousSibling && !isEdge(first.previousSibling)) first = first.previousSibling;
  const run = [];
  for (let n = first; n && !isEdge(n); n = n.nextSibling) run.push(n);
  const p = root.ownerDocument.createElement('p');
  first.before(p);
  run.forEach((n) => p.appendChild(n));
  // The <br> that ended this line is now the paragraph's own edge.
  if (p.nextSibling?.nodeName === 'BR') p.nextSibling.remove();
  return p;
}

/**
 * @param {Element} block
 * @param {'text'|'p'|'h1'|'h2'|'h3'|'quote'|'bullet'|'numbered'} kind
 * @returns {Element|null} the element that should hold the caret
 */
export function convertBlock(block, kind) {
  if (!block?.parentNode) return null;
  const doc = block.ownerDocument;
  const html = block.innerHTML || '<br>';

  if (kind === 'bullet' || kind === 'numbered') {
    const tag = LIST[kind];
    if (block.tagName === 'LI' && block.parentElement?.tagName === tag.toUpperCase()) return block;
    const list = doc.createElement(tag);
    const li = doc.createElement('li');
    li.innerHTML = html;
    keepInk(block, li);
    list.appendChild(li);
    placeInstead(block, list);
    return li;
  }

  const tag = TAG[kind];
  if (!tag) return null;
  if (block.tagName === tag.toUpperCase()) return block;
  const next = doc.createElement(tag);
  next.innerHTML = html;
  keepInk(block, next);
  placeInstead(block, next);
  return next;
}

/** A plain line's colour classes (c-red, h-blue…) travel with its text. */
function keepInk(from, to) {
  if (from.tagName !== 'DIV') return;
  for (const cls of from.classList) if (/^[ch]-/.test(cls)) to.classList.add(cls);
}

/** Replace a block. A list item is lifted out so the new node is not nested in the list. */
function placeInstead(block, next) {
  if (block.tagName !== 'LI') {
    block.replaceWith(next);
    return;
  }
  const list = block.parentElement;
  const rest = [...block.parentNode.childNodes].slice(
    [...block.parentNode.childNodes].indexOf(block) + 1,
  );
  list.after(next);
  if (rest.length) {
    const tail = list.cloneNode(false);
    rest.forEach((node) => tail.appendChild(node));
    next.after(tail);
  }
  block.remove();
  if (!list.querySelector('li')) list.remove();
}

/**
 * A divider saved inside a list or a heading is pulled back to the top level.
 * Idempotent. Returns how many rules moved.
 */
export function liftNestedDividers(root) {
  if (!root) return 0;
  let moved = 0;
  for (const hr of [...root.querySelectorAll('hr')]) {
    let host = hr.parentElement;
    if (!host || host === root) continue;
    if (!host.closest('ul,ol,li,h1,h2,h3,h4,h5,h6,blockquote')) continue;
    while (host.parentElement && host.parentElement !== root) host = host.parentElement;
    host.after(hr);
    moved += 1;
  }
  return moved;
}

/**
 * Enter on an empty line of a quote leaves the quote, as it leaves a list.
 *
 * Chromium answers Enter in a <blockquote> with another <blockquote>, so there
 * was no way out: every line typed after a quote was quoted too (found by the
 * page-rebuild test, 0.8.4). Handles both shapes Enter produces — an empty
 * sibling <blockquote>, and an empty line inside one. A line in the middle of a
 * quote splits it, so the text after it stays quoted.
 * @returns {boolean} true when it moved the caret out
 */
export function exitQuoteOnEmptyLine(root, selection) {
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const node = selection.anchorNode;
  const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const quote = el?.closest('blockquote');
  if (!quote || !root.contains(quote) || quote.parentElement !== root) return false;
  let line = el === quote ? null : el;
  while (line && line.parentElement !== quote) line = line.parentElement;
  const empty = (n) => !n.textContent.replace(/​/g, '').trim() && !n.querySelector?.('img, hr, .inline-eq');
  const doc = root.ownerDocument;
  const out = doc.createElement('p');
  out.innerHTML = '<br>';
  if (!line || line === quote) {
    if (!empty(quote)) return false;
    quote.replaceWith(out);
  } else {
    if (line.nodeType !== Node.ELEMENT_NODE || !empty(line)) return false;
    const rest = [];
    for (let n = line.nextSibling; n; n = n.nextSibling) rest.push(n);
    line.remove();
    quote.after(out);
    if (rest.some((n) => !empty(n.nodeType === 1 ? n : { textContent: n.textContent, querySelector: () => null }))) {
      const tail = quote.cloneNode(false);
      rest.forEach((n) => tail.appendChild(n));
      out.after(tail);
    } else {
      rest.forEach((n) => n.remove());
    }
    if (empty(quote)) quote.remove();
  }
  const r = doc.createRange();
  r.setStart(out, 0);
  r.collapse(true);
  selection.removeAllRanges();
  selection.addRange(r);
  return true;
}

/**
 * A divider, always at the top level, with an empty paragraph under it.
 *
 * Goes after the caret's top-level block; an empty block the divider was
 * called from is replaced, an empty list item is dropped. The toolbar did this
 * already, but /divider still used insertHTML, which put the rule INSIDE the
 * empty <div> line Enter makes — and the heading typed next went in with it
 * (the page-rebuild test, 0.8.5).
 * @returns {HTMLParagraphElement} the empty line under the divider
 */
export function insertDivider(root, selection) {
  const doc = root.ownerDocument;
  const node = selection?.rangeCount ? selection.getRangeAt(0).startContainer : null;
  let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!el || !root.contains(el)) el = null;
  const li = el?.closest('li');
  if (li && root.contains(li) && !li.textContent.trim()) {
    const list = li.parentElement;
    el = list;
    li.remove();
    if (!list.querySelector('li')) { el = list.previousElementSibling || null; list.remove(); if (!el) el = null; }
  }
  let block = el === root ? null : el;
  while (block && block.parentElement !== root) block = block.parentElement;
  const hr = doc.createElement('hr');
  hr.className = 'blk-hr';
  const after = doc.createElement('p');
  after.innerHTML = '<br>';
  if (block && !block.matches('.shape-layer, .image-layer')) {
    block.after(hr);
    hr.after(after);
    if (!block.textContent.trim() && !block.querySelector('img, .blk-code, .inline-eq, hr, .link-block')) block.remove();
  } else {
    root.append(hr, after);
  }
  return after;
}
