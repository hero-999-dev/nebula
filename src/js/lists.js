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
 * @param {Element} root the editor
 * @returns {boolean} whether anything moved — callers use it to skip a save
 */
export function normalizeLists(root) {
  if (!root) return false;
  let touched = false;
  // Hoisting can expose a new merge, and merging can expose a new hoist, so
  // this repeats until it settles. Bounded: a malformed tree must not spin.
  for (let pass = 0; pass < 5; pass++) {
    const a = liftMismatched(root);
    const b = mergeAdjacent(root);
    const c = dropEmptyLists(root);
    touched = touched || a || b || c;
    if (!a && !b && !c) break;
  }
  return touched;
}
