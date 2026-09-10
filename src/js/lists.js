/**
 * Repair what `execCommand('insertUnorderedList' | 'insertOrderedList')` leaves
 * behind.
 *
 * Chromium's list commands are only correct for the simple case. Build a
 * bulleted list, put the caret on the line under it and press the numbered-list
 * button, and it does not give you two sibling lists — it drops the new <ol>
 * inside the last <li> of the <ul>. The numbering then restarts under a bullet,
 * indented, and the two lists visibly cut into each other. Running the same two
 * commands the other way round merges lists that should have stayed apart.
 *
 * This runs after every list command and puts the tree back into the shape the
 * user asked for. It is deliberately conservative: it moves and merges lists,
 * and it never deletes a list item that has content, because the caret is
 * usually sitting in one.
 */

const isList = (el) => !!el && (el.tagName === 'UL' || el.tagName === 'OL');

/**
 * The text an <li> owns, ignoring any list nested inside it. An item that is
 * only a container for a nested list has none, and that is the case Chromium
 * creates when it puts a new list in the wrong place.
 */
export function liOwnText(li) {
  let text = '';
  for (const node of li.childNodes) {
    if (node.nodeType === 3) text += node.textContent;
    else if (node.nodeType === 1 && !isList(node)) text += node.textContent;
  }
  return text.replace(/[​\s]+/g, ' ').trim();
}

/**
 * Move a nested list out to sit beside its parent list. If the item it came
 * from was not the last one, the items after it move into a fresh list of the
 * same kind so their order is preserved.
 */
function hoist(li, inner) {
  const list = li.parentElement;
  const doc = li.ownerDocument;

  const after = [];
  for (let n = li.nextElementSibling; n; n = n.nextElementSibling) after.push(n);

  list.after(inner);

  if (after.length) {
    const tail = doc.createElement(list.tagName.toLowerCase());
    for (const el of after) tail.appendChild(el);
    inner.after(tail);
  }

  // The item existed only to hold the list that just left.
  if (!liOwnText(li) && !Array.from(li.children).some(isList)) li.remove();
}

/** A list of one kind nested in an item of another kind was not asked for. */
function liftMismatched(root) {
  let changed = false;
  for (const li of Array.from(root.querySelectorAll('li'))) {
    // The list snapshot is taken up front, so an item may already have been
    // moved or removed by an earlier hoist in this same pass.
    const list = li.parentElement;
    if (!isList(list)) continue;
    if (liOwnText(li)) continue; // a real sub-list under a real item

    for (const inner of Array.from(li.children).filter(isList)) {
      if (inner.tagName === list.tagName) continue; // same kind: genuine nesting
      hoist(li, inner);
      changed = true;
      break; // li may be gone; the next pass picks up anything left
    }
  }
  return changed;
}

/** Two adjacent lists of the same kind are one list. */
function mergeAdjacent(root) {
  let changed = false;
  for (const list of Array.from(root.querySelectorAll('ul,ol'))) {
    const prev = list.previousElementSibling;
    if (!isList(prev) || prev.tagName !== list.tagName) continue;
    while (list.firstChild) prev.appendChild(list.firstChild);
    list.remove();
    changed = true;
  }
  return changed;
}

/** A list with no items is not a list. */
function dropEmptyLists(root) {
  let changed = false;
  for (const list of Array.from(root.querySelectorAll('ul,ol'))) {
    if (!list.querySelector('li')) { list.remove(); changed = true; }
  }
  return changed;
}

/**
 * Enter or Backspace on an empty list item leaves the list.
 *
 * Without this, Enter on the empty item just adds another one and Backspace
 * merges the caret up into the previous item — so once you are in a numbered
 * list there is no way out except deleting your way backwards. Every editor
 * ends a list this way.
 *
 * Only top-level lists: a nested one should outdent a level instead, and that
 * is left to the browser rather than guessed at here.
 *
 * @returns {boolean} true if handled — the caller must preventDefault
 */
export function exitListOnEmptyItem(root, selection) {
  if (!selection || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;

  const start = range.startContainer;
  const el = start.nodeType === 1 ? start : start.parentElement;
  const li = el?.closest?.('li');
  if (!li || !root.contains(li)) return false;
  if (liOwnText(li)) return false;                       // only an empty item
  if (Array.from(li.children).some(isList)) return false; // it holds a sub-list

  const list = li.parentElement;
  if (!isList(list) || list.parentElement !== root) return false;

  const doc = root.ownerDocument;
  const after = [];
  for (let n = li.nextElementSibling; n; n = n.nextElementSibling) after.push(n);

  const p = doc.createElement('p');
  p.innerHTML = '<br>';
  list.after(p);

  // Items below the one being left stay a list, under the new paragraph.
  if (after.length) {
    const tail = doc.createElement(list.tagName.toLowerCase());
    for (const n of after) tail.appendChild(n);
    p.after(tail);
  }

  li.remove();
  if (!list.querySelector('li')) list.remove();

  const caret = doc.createRange();
  caret.setStart(p, 0);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
}

/**
 * Backspace at the very start of a list item lifts that item out of the list.
 *
 * `exitListOnEmptyItem` only fires on an EMPTY item, so an item with text in it
 * had no way back: pressing Backspace at its start merged it into the item
 * above instead of returning the line to the left margin. Every editor lifts it
 * out — one press to leave the list, another to join the previous line.
 *
 * @returns {boolean} true if handled — the caller must preventDefault
 */
export function liftListItemAtStart(root, selection) {
  if (!selection || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || range.startOffset !== 0) return false;

  const start = range.startContainer;
  const el = start.nodeType === 1 ? start : start.parentElement;
  const li = el?.closest?.('li');
  if (!li || !root.contains(li)) return false;
  if (!liOwnText(li)) return false;          // the empty case belongs to exitList

  // Only at the true start of the item, not merely at the start of some node
  // in the middle of it.
  const before = root.ownerDocument.createRange();
  before.selectNodeContents(li);
  before.setEnd(range.startContainer, range.startOffset);
  if (before.toString().length) return false;

  const list = li.parentElement;
  if (!isList(list) || list.parentElement !== root) return false;

  const doc = root.ownerDocument;
  const p = doc.createElement('p');
  while (li.firstChild) p.appendChild(li.firstChild);
  if (!p.firstChild) p.innerHTML = '<br>';

  const after = [];
  for (let n = li.nextElementSibling; n; n = n.nextElementSibling) after.push(n);

  list.after(p);
  if (after.length) {
    const tail = doc.createElement(list.tagName.toLowerCase());
    for (const n of after) tail.appendChild(n);
    p.after(tail);
  }
  li.remove();
  if (!list.querySelector('li')) list.remove();

  const caret = doc.createRange();
  caret.setStart(p, 0);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
}

/**
 * @param {Element} root the editor
 * @returns {boolean} whether anything moved — callers use it to skip a save
 */
/**
 * Take a list out of the paragraph Chromium put it in.
 *
 * `execCommand('insertUnorderedList')` on an ordinary paragraph produces
 * `<p><ul><li>…</li></ul></p>` — which is not merely untidy, it is invalid: a
 * `<p>` cannot contain a `<ul>` at all. Everything after it went wrong in
 * sequence. Leaving the list added a `<div>` INSIDE that paragraph, the next
 * list nested inside that, and pressing To-do converted the paragraph itself —
 * swallowing both lists and everything under them into one to-do.
 *
 * This was half-known: `listCommand` builds a list by hand for a to-do line
 * with a comment describing exactly this markup, and left the ordinary case to
 * the browser.
 */
function liftOutOfParagraphs(root) {
  let touched = false;
  for (const list of [...root.querySelectorAll('ul, ol')]) {
    const p = list.parentElement;
    if (!p || p === root) continue;
    // An <li> holding a list is genuine nesting and stays. Anything else is a
    // wrapper the list fell into: a <p> from `insertUnorderedList`, a <div>
    // Chromium made when Enter was pressed on a line further up, a to-do that
    // swallowed the list whole. Checking only for <p> was not enough — the
    // trace that found this started from a heading, so the block the caret was
    // in was a DIV and nothing was lifted at all.
    if (p.tagName === 'LI') continue;
    // Whatever else the paragraph holds keeps a paragraph of its own, in order.
    const before = [];
    const after = [];
    let seen = false;
    for (const node of [...p.childNodes]) {
      if (node === list) { seen = true; continue; }
      (seen ? after : before).push(node);
    }
    const own = (nodes) => {
      if (!nodes.some((n) => n.nodeType !== 3 || n.nodeValue.trim())) return null;
      // The piece keeps the wrapper it was in — a to-do line stays a to-do.
      const el = p.cloneNode(false);
      nodes.forEach((n) => el.appendChild(n));
      return el;
    };
    const head = own(before);
    const tail = own(after);
    if (head) p.parentNode.insertBefore(head, p);
    p.parentNode.insertBefore(list, p);
    if (tail) p.parentNode.insertBefore(tail, p);
    p.remove();
    touched = true;
  }
  return touched;
}

export function normalizeLists(root) {
  if (!root) return false;
  let touched = false;
  // Hoisting can expose a new merge, and merging can expose a new hoist, so
  // this repeats until it settles. Bounded: a malformed tree must not spin.
  for (let pass = 0; pass < 5; pass++) {
    const z = liftOutOfParagraphs(root);
    const a = liftMismatched(root);
    const b = mergeAdjacent(root);
    const c = dropEmptyLists(root);
    touched = touched || z || a || b || c;
    if (!z && !a && !b && !c) break;
  }
  return touched;
}
