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

/** The nearest block a slash command or the outline menu may restyle. */
export function blockFromNode(node, root) {
  let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!el || !root?.contains(el)) return null;
  return el.closest('li,h1,h2,h3,h4,h5,h6,p,blockquote,div.blk-todo');
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
    list.appendChild(li);
    placeInstead(block, list);
    return li;
  }

  const tag = TAG[kind];
  if (!tag) return null;
  if (block.tagName === tag.toUpperCase()) return block;
  const next = doc.createElement(tag);
  next.innerHTML = html;
  placeInstead(block, next);
  return next;
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
