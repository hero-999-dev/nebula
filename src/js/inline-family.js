/** Exact DOM boundaries for exclusive inline marks (underline/ink/highlight). */
const BLOCKS = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre';
const familySelector = (classes, extra) => [...classes.map((cls) => `.${cls}`), extra].filter(Boolean).join(',');

const UNDERLINES = ['u-single', 'u-double', 'u-bold', 'u-wavy', 'u-dash'];

/** A decoration painted by an outer span keeps that span's colour even when
 * its child changes ink. Place the decoration on each actual text run. */
export function normalizeUnderlineInk(root) {
  const marks = [...root.querySelectorAll(UNDERLINES.map(c => '.' + c).join(','))].reverse();
  for (const mark of marks) {
    if (!mark.children.length || mark.closest('.code-head')) continue;
    const classes = UNDERLINES.filter(c => mark.classList.contains(c));
    const walker = mark.ownerDocument.createTreeWalker(mark, 4);
    const texts = [];
    while (walker.nextNode()) if (walker.currentNode.textContent) texts.push(walker.currentNode);
    for (const text of texts) {
      const span = mark.ownerDocument.createElement('span');
      span.classList.add(...classes);
      text.before(span);
      span.appendChild(text);
    }
    mark.classList.remove(...classes);
    if (!mark.className) mark.removeAttribute('class');
    if (mark.tagName === 'SPAN' && !mark.attributes.length) mark.replaceWith(...mark.childNodes);
  }
}

function stripMark(el, classes, extra) {
  el.classList.remove(...classes);
  if (!el.className) el.removeAttribute('class');
  if (extra && el.matches(extra)) {
    // A native <u> can carry another mark too; preserve its attributes.
    const span = el.ownerDocument.createElement('span');
    for (const attr of el.attributes) span.setAttribute(attr.name, attr.value);
    span.append(...el.childNodes);
    el.replaceWith(span);
    el = span;
  }
  if (el.tagName === 'SPAN' && !el.attributes.length) el.replaceWith(...el.childNodes);
}

/** A saved block may itself wear a mark: move that mark onto its inline runs. */
function demoteBlockMarks(block, root, classes) {
  const parents = [];
  for (let el = block; el && el !== root; el = el.parentElement) parents.unshift(el);
  for (const el of parents) {
    const marks = classes.filter((cls) => el.classList.contains(cls));
    if (!marks.length) continue;
    el.classList.remove(...marks);
    if (!el.className) el.removeAttribute('class');
    let run = null;
    for (const child of [...el.childNodes]) {
      if (child.nodeType === 1 && child.matches(BLOCKS)) {
        child.classList.add(...marks);
        run = null;
      } else {
        if (!run) {
          run = el.ownerDocument.createElement('span');
          run.classList.add(...marks);
          child.before(run);
        }
        run.appendChild(child);
      }
    }
  }
}

/** Lift a bookmark to its block while retaining both halves of every wrapper. */
function splitBoundary(marker, block) {
  while (marker.parentElement !== block) {
    const parent = marker.parentElement;
    const before = parent.cloneNode(false);
    const after = parent.cloneNode(false);
    before.removeAttribute('id');
    after.removeAttribute('id');
    while (parent.firstChild !== marker) before.appendChild(parent.firstChild);
    while (marker.nextSibling) after.appendChild(marker.nextSibling);
    const pieces = [];
    const hasContent = (el) => el.textContent.length || el.querySelector('br,img,hr,input,svg,.inline-eq');
    if (hasContent(before)) pieces.push(before);
    pieces.push(marker);
    if (hasContent(after)) pieces.push(after);
    parent.replaceWith(...pieces);
  }
}

/**
 * Change disjoint, block-local ranges without searching for their text again.
 * Matching ancestors are split, so unselected words and unrelated marks survive.
 */
export function applyInlineFamily(root, parts, classes, cls = '', extra = '') {
  const doc = root.ownerDocument;
  const bookmarks = [];
  const selector = familySelector(classes, extra);
  for (const part of [...parts].reverse()) {
    const startEl = part.startContainer.nodeType === 1 ? part.startContainer : part.startContainer.parentElement;
    const block = startEl.closest(BLOCKS) ?? root;
    const start = doc.createElement('span');
    const end = doc.createElement('span');
    const tail = part.cloneRange();
    tail.collapse(false);
    tail.insertNode(end);
    part.collapse(true);
    part.insertNode(start);
    demoteBlockMarks(block, root, classes);
    splitBoundary(start, block);
    splitBoundary(end, block);
    const fragment = doc.createDocumentFragment();
    while (start.nextSibling !== end) fragment.appendChild(start.nextSibling);
    for (const el of [...fragment.querySelectorAll(selector)].reverse()) stripMark(el, classes, extra);
    if (cls) {
      const span = doc.createElement('span');
      span.className = cls;
      span.appendChild(fragment);
      const holder = doc.createDocumentFragment();
      holder.appendChild(span);
      if (UNDERLINES.includes(cls)) normalizeUnderlineInk(holder);
      end.before(holder);
    } else end.before(fragment);
    bookmarks.unshift({ start, end });
  }
  if (!bookmarks.length) return false;
  const result = doc.createRange();
  result.setStartAfter(bookmarks[0].start);
  result.setEndBefore(bookmarks.at(-1).end);
  for (const { start, end } of bookmarks) { start.remove(); end.remove(); }
  root.normalize();
  const selection = doc.defaultView.getSelection();
  selection.removeAllRanges();
  selection.addRange(result);
  return true;
}

/** Clear only future typing at the current position, keeping both text halves. */
export function clearInlineFamilyAtCaret(root, range, classes, extra = '') {
  if (!range?.collapsed) return false;
  let at = range.startContainer;
  if (at.nodeType === 1) at = at.childNodes[range.startOffset] ?? at.childNodes[range.startOffset - 1] ?? at;
  const el = at.nodeType === 1 ? at : at.parentElement;
  const selector = familySelector(classes, extra);
  if (!el?.closest(selector) || !root.contains(el.closest(selector))) return false;
  const doc = root.ownerDocument;
  const block = el.closest(BLOCKS) ?? root;
  const marker = doc.createElement('span');
  range.insertNode(marker);
  demoteBlockMarks(block, root, classes);
  const ancestors = [];
  for (let parent = marker.parentElement; parent !== block; parent = parent.parentElement) {
    ancestors.push(parent.cloneNode(false));
  }
  splitBoundary(marker, block);
  const typing = doc.createElement('span');
  typing.dataset.formatCaret = '';
  const text = doc.createTextNode('\u200b');
  typing.appendChild(text);
  let branch = typing;
  for (const ancestor of ancestors) {
    ancestor.removeAttribute('id');
    ancestor.appendChild(branch);
    branch = ancestor;
  }
  const fragment = doc.createDocumentFragment();
  fragment.appendChild(branch);
  for (const item of [...fragment.querySelectorAll(selector)].reverse()) stripMark(item, classes, extra);
  marker.replaceWith(fragment);
  const caret = doc.createRange();
  caret.setStart(text, 1);
  caret.collapse(true);
  const selection = doc.defaultView.getSelection();
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
}

/** Run on a serialization clone, or once typed text makes the sentinel needless. */
export function cleanTypingMarkers(root, { preserveActive = false } = {}) {
  const selection = root.ownerDocument.defaultView?.getSelection();
  for (const marker of root.querySelectorAll('[data-format-caret]')) {
    if (preserveActive && marker.textContent === '\u200b' && marker.contains(selection?.anchorNode)) continue;
    const walker = root.ownerDocument.createTreeWalker(marker, 4);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const text of nodes) {
      const index = text.nodeValue.indexOf('\u200b');
      if (index >= 0) { text.deleteData(index, 1); break; }
    }
    marker.removeAttribute('data-format-caret');
    if (!marker.textContent && !marker.querySelector('br,img')) marker.remove();
  }
}
