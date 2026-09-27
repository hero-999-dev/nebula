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
    ensureLineBox(li);
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
  ensureLineBox(next);
  keepInk(block, next);
  placeInstead(block, next);
  return next;
}

/**
 * An empty block has no line box, so there is nowhere to put a caret: a caret
 * set at its end moves on to the next line, and what is typed goes there. A
 * line whose only content was a slash command is exactly that once the command
 * is taken out — and when the line was in a font it is an empty span, which
 * `innerHTML || '<br>'` does not see. "/h3" made an empty heading and the
 * words went into the paragraph under it; Backspace then joined paragraphs
 * (the owner's Ideas note: "Heading 3 sometimes does nothing", 0.9.1).
 *
 * Gives the block the <br> a browser gives an empty line, inside the
 * formatting the line kept, so what is typed there keeps the font.
 * @returns {HTMLBRElement|null} the <br>, when the block had nothing to hold a caret
 */
export function ensureLineBox(block) {
  if (!block || block.textContent.replace(/​/g, '')) return null;
  if (block.querySelector('br, img, hr, .inline-eq, .link-block, .note-image')) return null;
  let host = block;
  while (host.lastElementChild?.matches('span, b, strong, i, em, u, s, font, a')) host = host.lastElementChild;
  const br = block.ownerDocument.createElement('br');
  host.appendChild(br);
  return br;
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

/**
 * What Chromium leaves behind when a delete joins two lines.
 *
 * Backspace at the start of a line merges it into the line above, and Chromium
 * keeps the merged words looking as they did by wrapping them in a
 * `<span style="…">` — a font size, a line height, the quote's italic undone.
 * Nothing in Nebula makes a classless styled span, so every one is this
 * leftover: the words carry a style the line does not have, and the note is no
 * longer the note it was before Enter was pressed. Joining two items of a list
 * goes through "lift the item out of the list" first, which leaves two lists
 * where there was one once the lifted line is merged back up.
 *
 * Called after every delete; looks only at the line the caret is in, and
 * touches only what this delete made: `before` (from beforeDelete) holds the
 * spans and the side-by-side lists that were already in the note, which stay.
 * @returns {boolean} whether anything changed
 */
export function tidyAfterDelete(root, selection, before = null) {
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  let el = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  if (!el || !root.contains(el) || el.closest('.blk-code, .shape-layer, .image-layer, .inline-eq')) return false;
  const block = el.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, .blk-todo, div') ?? root;
  if (block === root) return false;
  let changed = false;

  let { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = range;
  for (const span of [...block.querySelectorAll('span[style]:not([class])')]) {
    if (before?.has(span) || before?.spans?.has(spanKey(span)) || span.attributes.length !== 1 || span.closest('.inline-eq, .katex, .link-block')) continue;
    const parent = span.parentNode;
    const index = Array.prototype.indexOf.call(parent.childNodes, span);
    // The caret sits in the span's text nodes, which move with it; only a
    // caret on the span element itself needs re-pointing to the parent.
    if (sc === span) { sc = parent; so += index; }
    if (ec === span) { ec = parent; eo += index; }
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    span.remove();
    changed = true;
  }

  // Chromium joins only the first LINE of a block into the one above — up to
  // its first <br> — and leaves the rest behind as a block of its own: a list
  // item of three lines, split with Enter and joined again with Backspace, kept
  // one line in the list and put two outside it (the long-note trials, 0.9.1).
  // Joining a block means all of it, as in any word processor: the rest follows.
  const lower = before?.startBlock;
  if (range.collapsed && lower?.isConnected && lower !== block && !lower.contains(sc)
    && lower.textContent.replace(/​/g, '').trim()) {
    const below = block.nextElementSibling ?? (block.matches('li') ? block.parentElement?.nextElementSibling : null);
    if (below === lower) {
      if (lower.firstChild?.nodeName !== 'BR') block.appendChild(block.ownerDocument.createElement('br'));
      while (lower.firstChild) block.appendChild(lower.firstChild);
      lower.remove();
      changed = true;
    }
  }

  // Enter inside a styled span splits it in two; Backspace then joins the
  // lines but drops the second half's span, so those words change style (in a
  // quote, a span that keeps words upright: the second half went italic). The
  // words right after the caret go back into the span they came out of.
  if (before?.blocks !== undefined && blockCount(root) < before.blocks && range.collapsed) {
    let at = sc.nodeType === Node.TEXT_NODE && so === 0 ? sc : sc.nodeType === Node.ELEMENT_NODE ? sc.childNodes[so] : null;
    let span = at?.previousSibling;
    // The caret can also be left at the END of the span's own words, with the
    // words that lost their span right after it.
    if (!at && sc.nodeType === Node.TEXT_NODE && so === sc.length && sc.parentElement?.lastChild === sc) {
      span = sc.parentElement;
      at = span.nextSibling;
    }
    if (at?.nodeType === Node.TEXT_NODE && span?.matches?.('span[style]:not([class])') && before.has(span)) {
      const end = span.lastChild;
      for (let t = at; t?.nodeType === Node.TEXT_NODE;) { const next = t.nextSibling; span.appendChild(t); t = next; }
      // The space Enter turned into a no-break space to keep it visible at the
      // end of the line is an ordinary space in the middle of one again.
      if (end?.nodeType === Node.TEXT_NODE && end.data.endsWith(' ') && /^\S/.test(at.data)) {
        end.replaceData(end.length - 1, 1, ' ');
      }
      sc = at; so = 0; ec = at; eo = 0;
      changed = true;
    }
  }

  // Joining the lines, Chromium can also drop a styled span that was already
  // there, whole: the words stay and their style goes (a quote's upright
  // words went italic). A span that was in the note before the delete and is
  // gone after it is put back around its words, in the line the caret is in.
  if (before?.counts && blockCount(root) < before.blocks) {
    const now = spanCounts(root);
    // Splitting text moves a live range with it: let the selection carry the caret here.
    const live = root.ownerDocument.createRange();
    try { live.setStart(sc, so); live.setEnd(ec, eo); } catch { /* keep the captured one */ }
    for (const [key, count] of before.counts) {
      if ((now.get(key) ?? 0) >= count) continue;
      const cut = key.indexOf('|');
      const style = key.slice(0, cut);
      const words = key.slice(cut + 1);
      if (!words) continue;
      // Where it was: how much of its line came after it. The words after a
      // join are the same words, so that places it exactly — a "." is in
      // every sentence, and searching for the text found the wrong one.
      const lineEnd = block.textContent.length;
      const want = (before.tails?.get(key) ?? []).map((tail) => lineEnd - tail - words.length);
      const walker = root.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let t = walker.nextNode(); t; seen += t.nodeValue.length, t = walker.nextNode()) {
        const at = want.find((w) => w >= seen && w + words.length <= seen + t.nodeValue.length);
        const i = at === undefined ? -1 : at - seen;
        if (i < 0 || t.nodeValue.slice(i, i + words.length) !== words || t.parentElement.closest('span[style]')) continue;
        const inside = i ? t.splitText(i) : t;
        if (inside.nodeValue.length > words.length) inside.splitText(words.length);
        const span = root.ownerDocument.createElement('span');
        span.setAttribute('style', style);
        inside.before(span);
        span.appendChild(inside);
        changed = true;
        break;
      }
    }
    ({ startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = live);
  }

  // Joining two lines set in a font leaves the words that came up from the
  // lower line in a span of their own — Chromium rebuilds it from the computed
  // style, so it has the font's `style` but not the picker's `data-font-family`
  // — and the space that ended the upper line stays the no-break space Enter
  // turned it into. Deleting a word typed underlined inside such a line leaves
  // the font's span cut in two the same way. Either way the line looked the
  // same and was built differently, and the next Backspace ate a space that was
  // there before (the owner's notes, 0.9.1). Where the caret stands between two
  // spans that format alike, they become one span and one space again.
  if (range.collapsed) {
    const joined = rejoinSpans(sc, so);
    if (joined) { sc = joined.node; so = joined.offset; ec = sc; eo = so; changed = true; }
  }

  const list = block.closest('ul, ol');
  if (list && root.contains(list)) {
    for (const other of [list.nextElementSibling, list.previousElementSibling]) {
      if (!other || other.tagName !== list.tagName || other.className !== list.className) continue;
      if (before?.has(other === list.nextElementSibling ? list : other)) continue;   // two lists already
      if (other === list.nextElementSibling) { while (other.firstChild) list.appendChild(other.firstChild); }
      else { while (other.lastChild) list.insertBefore(other.lastChild, list.firstChild); }
      other.remove();
      changed = true;
    }
  }

  if (changed) {
    try {
      const r = root.ownerDocument.createRange();
      r.setStart(sc, so);
      r.setEnd(ec, eo);
      selection.removeAllRanges();
      selection.addRange(r);
    } catch { /* the caret's node is gone; Chromium's placement stands */ }
  }
  return changed;
}

/** What tidyAfterDelete must leave alone: read just before the delete. */
export function beforeDelete(root) {
  const known = new WeakSet(root.querySelectorAll('span[style]:not([class])'));
  known.blocks = blockCount(root);
  // The block the caret stands at the very start of: a Backspace there joins
  // it to the one above, and Chromium joins only its first line (tidyAfterDelete).
  known.startBlock = blockStartAt(root);
  // By what they are too: joining lines, Chromium rebuilds a span it moves, so
  // the one after the delete is a new element with the same style and words.
  known.spans = new Set([...root.querySelectorAll('span[style]:not([class])')].map(spanKey));
  known.counts = spanCounts(root);
  known.tails = new Map();
  for (const span of root.querySelectorAll('span[style]:not([class])')) {
    const line = span.parentElement.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, .blk-todo, div') ?? root;
    const after = root.ownerDocument.createRange();
    after.selectNodeContents(line);
    after.setStartAfter(span);
    const key = spanKey(span);
    known.tails.set(key, [...(known.tails.get(key) ?? []), after.toString().length]);
  }
  for (const list of root.querySelectorAll('ul, ol')) {
    const next = list.nextElementSibling;
    if (next && next.tagName === list.tagName && next.className === list.className) known.add(list);
  }
  return known;
}

/** Lines in the note, to tell a delete that joined two of them. */
/** The block a collapsed caret stands at the very start of, or null. */
function blockStartAt(root) {
  const doc = root.ownerDocument;
  const sel = doc.getSelection?.();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const el = r.startContainer.nodeType === Node.ELEMENT_NODE ? r.startContainer : r.startContainer.parentElement;
  const block = el?.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, .blk-todo, div');
  if (!block || block === root || !root.contains(block)) return null;
  const head = doc.createRange();
  head.setStart(block, 0);
  head.setEnd(r.startContainer, r.startOffset);
  if (head.toString().replace(/​/g, '')) return null;
  if (head.cloneContents().querySelector('br, img, hr')) return null;
  return block;
}

function blockCount(root) {
  return root.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, div').length;
}

/**
 * At a caret that sits where two lines were just joined: the span the caret is
 * at the end of and the span right after it, if they are the same formatting,
 * become one; a no-break space right before the caret, with a word right after
 * it, becomes a plain space again.
 * @returns {{node: Text, offset: number}|null} the caret, if anything changed
 */
function rejoinSpans(node, offset) {
  if (node?.nodeType !== Node.TEXT_NODE) return null;
  // The caret at the start of the right-hand span is the same place as the end
  // of the left-hand one: take it from there.
  if (offset === 0 && node.parentElement?.firstChild === node) {
    const prev = node.parentElement.previousSibling;
    const last = prev?.nodeType === Node.ELEMENT_NODE ? prev.lastChild : null;
    if (last?.nodeType === Node.TEXT_NODE && prev.tagName === 'SPAN') return rejoinSpans(last, last.length);
    return null;
  }
  if (offset !== node.length) return null;
  const left = node.parentElement;
  if (left?.tagName !== 'SPAN' || left.lastChild !== node) return null;
  const right = left.nextSibling;
  if (right?.nodeType !== Node.ELEMENT_NODE || !sameFormat(left, right)) return null;
  const font = right.getAttribute('data-font-family');
  if (font && !left.hasAttribute('data-font-family')) left.setAttribute('data-font-family', font);
  while (right.firstChild) left.appendChild(right.firstChild);
  right.remove();
  left.normalize();   // the caret's text node stays first, so its offset holds
  const next = node.data.charAt(offset);
  if (offset > 0 && node.data.charAt(offset - 1) === ' ' && next && !/\s/.test(next)) {
    node.replaceData(offset - 1, 1, ' ');
  }
  return { node, offset };
}

/** Two spans that format their words the same way; the picker's font name follows its style. */
function sameFormat(a, b) {
  if (a.tagName !== 'SPAN' || b.tagName !== 'SPAN') return false;
  if ((a.getAttribute('class') ?? '') !== (b.getAttribute('class') ?? '')) return false;
  if (a.style.cssText !== b.style.cssText) return false;
  const fa = a.getAttribute('data-font-family');
  const fb = b.getAttribute('data-font-family');
  if (fa && fb && fa !== fb) return false;
  // Anything else on either (an id, a data-anchor) makes it a different span.
  const extra = (el) => [...el.attributes].some((x) => !['class', 'style', 'data-font-family'].includes(x.name));
  return !extra(a) && !extra(b);
}

function spanKey(span) {
  return `${span.getAttribute('style')}|${span.textContent}`;
}

function spanCounts(root) {
  const counts = new Map();
  for (const span of root.querySelectorAll('span[style]:not([class])')) counts.set(spanKey(span), (counts.get(spanKey(span)) ?? 0) + 1);
  return counts;
}
