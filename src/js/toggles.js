/**
 * The toggle list, as in Notion (0.9.3, the owner's Ideas note).
 *
 *   <div class="blk-toggle" data-open="true">
 *     <p class="toggle-title">A line with an arrow before it</p>
 *     <div class="toggle-body"><p>…what folds away under it…</p></div>
 *   </div>
 *
 * The first child is the title whatever it is: "/h2" on a title makes a
 * heading that folds, and the arrow stays, because nothing here or in the
 * stylesheet reads the title's class — only its place. Whether it is open is
 * part of the note, like a ticked to-do.
 *
 * 0.9.4 (the owner's second Ideas note): a toggle heading is made in one go
 * (`/toggle-h1`, or the toggle button on a heading); a list item becomes a
 * toggle IN the list — `<li><div class="blk-toggle">…</div></li>`, bullet or
 * number first, then the arrow — where it used to be taken out of the list.
 *
 * Keys: Enter in the title goes into the body (opening it, and taking the
 * words after the caret along) — but at the very start of a title with words
 * it puts an empty line ABOVE the toggle, the only way to get a caret before a
 * toggle that begins the note or follows an embed; Enter on an empty last line
 * of the body leaves the toggle; Backspace at the start of the title turns the
 * toggle back into plain lines, nothing lost.
 */

export const TOGGLE = '.blk-toggle';
/**
 * How far from the title's left edge a press still folds the toggle. The
 * arrow is drawn from 7px to 14px and the words start at 26px. This was 24:
 * a click aimed just before the first letter folded the toggle instead of
 * putting the caret there — "the caret cannot be put at the start of a
 * toggle" (the owner, 0.9.4).
 */
const ARROW_WIDTH = 20;
const HEADINGS = new Set(['H1', 'H2', 'H3']);
const isList = (el) => el?.tagName === 'UL' || el?.tagName === 'OL';

const titleOf = (toggle) => toggle?.firstElementChild?.classList.contains('toggle-body') ? null : toggle?.firstElementChild;
const bodyOf = (toggle) => toggle?.querySelector(':scope > .toggle-body');
const isOpen = (toggle) => toggle?.dataset.open === 'true';

/**
 * Keys a toggle has dealt with. toolbar.js listens on the same element and has
 * list rules of its own for Enter and Backspace; a key in this set is not
 * theirs any more (a toggle inside a list item is both a toggle and an item).
 */
const handled = new WeakSet();
export const toggleHandled = (event) => handled.has(event);

function caretAt(node, offset) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** An empty line that can hold a caret. */
function emptyLine(doc = document, tag = 'p') {
  const p = doc.createElement(tag);
  p.innerHTML = '<br>';
  return p;
}

/**
 * Make `block` (a line) the title of a new toggle, open, with an empty line
 * under it. A heading stays a heading; `heading` makes the title one.
 * A list item keeps its place in the list and holds the toggle; a list nested
 * in the item becomes what folds away.
 * @param {Element} block
 * @param {{heading?: 'h1'|'h2'|'h3'}} [opts]
 * @returns {Element} the toggle
 */
export function makeToggle(block, { heading } = {}) {
  const doc = block.ownerDocument;
  const toggle = doc.createElement('div');
  toggle.className = 'blk-toggle';
  toggle.dataset.open = 'true';
  const tag = heading || (HEADINGS.has(block.tagName) ? block.tagName.toLowerCase() : 'p');
  const title = doc.createElement(tag);
  title.className = 'toggle-title';
  const body = doc.createElement('div');
  body.className = 'toggle-body';
  const inItem = block.tagName === 'LI';
  for (const node of [...block.childNodes]) {
    if (inItem && isList(node)) body.appendChild(node);
    else title.appendChild(node);
  }
  if (!title.textContent.replace(/​/g, '') && !title.querySelector('br')) title.innerHTML = '<br>';
  if (!body.firstChild) body.appendChild(emptyLine(doc));
  toggle.append(title, body);
  if (inItem) block.appendChild(toggle);
  else block.replaceWith(toggle);
  return toggle;
}

/**
 * A toggle back into plain lines: its title a line (a heading stays one), the
 * body's lines after it; the empty line a new toggle starts with does not come.
 * In a list item the title's words are the item's again.
 * @returns {Node} what holds the title's words now — where the caret goes
 */
export function unmakeToggle(toggle) {
  const doc = toggle.ownerDocument;
  const title = titleOf(toggle);
  const body = bodyOf(toggle);
  const blank = (n) => n.nodeType !== 1
    ? !n.textContent.trim()
    : n.matches('p, div:not([class])') && !n.textContent.replace(/​/g, '').trim() && !n.querySelector('img, hr, .inline-eq, .note-image');
  const lines = body ? [...body.childNodes].filter((n) => !blank(n)) : [];
  if (toggle.parentElement?.tagName === 'LI') {
    const li = toggle.parentElement;
    const words = title ? [...title.childNodes] : [];
    toggle.replaceWith(...words, ...lines);
    if (!li.firstChild) li.innerHTML = '<br>';
    return li;
  }
  const p = doc.createElement(title && HEADINGS.has(title.tagName) ? title.tagName.toLowerCase() : 'p');
  while (title?.firstChild) p.appendChild(title.firstChild);
  if (!p.firstChild) p.innerHTML = '<br>';
  toggle.replaceWith(p, ...lines);
  return p;
}

/**
 * A toggle that lost its title is no toggle (0.9.4). Words selected from the
 * title down into the body and deleted left the frame alone — a
 * `<div class="blk-toggle">` holding a line break. No key had a rule for it:
 * the caret went in and nothing took it away — "the toggle list is stuck at
 * the top left" (the owner). What such a frame still holds becomes plain
 * lines; one that holds nothing becomes one empty line, which Backspace takes
 * like any other.
 * @param {ParentNode} root
 * @returns {boolean} whether anything was put right
 */
export function healToggles(root) {
  if (!root) return false;
  let healed = false;
  // Inner ones first: a frame inside a frame is plain lines by the time the outer one is looked at.
  for (const toggle of [...root.querySelectorAll(TOGGLE)].reverse()) {
    const first = toggle.firstElementChild;
    // A title is a line of its own; words or a line break loose in the frame are not one.
    if (first && !first.classList.contains('toggle-body') && !/^(BR|B|I|U|S|EM|STRONG|SPAN|A|CODE|FONT|MARK|SUB|SUP)$/.test(first.tagName)) continue;
    const doc = toggle.ownerDocument;
    const sel = doc.defaultView?.getSelection?.();
    const held = !!sel?.anchorNode && toggle.contains(sel.anchorNode);
    const where = held ? { node: sel.anchorNode, offset: sel.anchorOffset } : null;
    const blank = (n) => n.nodeType !== 1
      ? !n.textContent.replace(/\u200b/g, '').trim()
      : n.tagName === 'BR' || (n.matches('p, div:not([class])') && !n.textContent.replace(/\u200b/g, '').trim() && !n.querySelector('img, hr, .inline-eq, .note-image'));
    const bodies = [...toggle.children].filter((el) => el.classList.contains('toggle-body'));
    const words = [...toggle.childNodes].filter((n) => !bodies.includes(n) && !blank(n));
    const lines = bodies.flatMap((body) => [...body.childNodes].filter((n) => !blank(n)));
    const item = toggle.parentElement?.tagName === 'LI' ? toggle.parentElement : null;
    let at;
    if (item) {
      toggle.replaceWith(...words, ...lines);
      if (!item.firstChild) item.innerHTML = '<br>';
      at = item;
    } else {
      const out = [];
      if (words.length) { const p = doc.createElement('p'); p.append(...words); out.push(p); }
      out.push(...lines);
      if (!out.length) out.push(emptyLine(doc));
      toggle.replaceWith(...out);
      at = out[0];
    }
    // The caret stays in the words it was in; from the frame itself it goes to the line that took its place.
    if (held) {
      try {
        if (where.node !== toggle && where.node.isConnected) caretAt(where.node, where.offset);
        else if (at?.isConnected) caretAt(at, 0);
      } catch { /* a block that takes no caret */ }
    }
    healed = true;
  }
  return healed;
}

/** Open or close one toggle. */
export function setOpen(toggle, open) {
  if (open) toggle.dataset.open = 'true';
  else delete toggle.dataset.open;
}

/**
 * @param {HTMLElement} editorEl
 * @param {{history?: {push: () => void}, isLocked?: () => boolean}} [opts]
 */
export function initToggles(editorEl, { history, isLocked = () => false } = {}) {
  if (!editorEl) return null;
  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  // The arrow is drawn before the title, in its padding; a press there folds it.
  editorEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const title = e.target.closest?.('.blk-toggle > :first-child');
    const toggle = title?.parentElement;
    if (!toggle || !editorEl.contains(toggle) || title.classList.contains('toggle-body')) return;
    const x = e.clientX - title.getBoundingClientRect().left;
    if (x > ARROW_WIDTH) return;
    e.preventDefault();
    e.stopPropagation();
    const locked = isLocked();
    if (!locked) history?.push();
    setOpen(toggle, !isOpen(toggle));
    // A locked note folds on screen only; nothing is saved.
    if (!locked) dirty();
  }, true);

  editorEl.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isLocked()) return;
    if (e.key !== 'Enter' && e.key !== 'Backspace') return;
    if (e.key === 'Enter' && e.shiftKey) return;
    // Enter with a menu open (/, @, #) chooses from the menu. This listener
    // runs before theirs, so it looks for the menu rather than at the event.
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' && document.querySelector('#slash-menu:not([hidden]), .mention-menu:not([hidden]):not([data-idle])')) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const at = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    let toggle = at?.closest?.(TOGGLE);
    if (!toggle || !editorEl.contains(toggle)) return;
    // A frame without its title (healToggles) is plain lines before the key acts: the key is the line's then.
    if (healToggles(editorEl)) {
      dirty();
      const now = window.getSelection().anchorNode;
      toggle = (now?.nodeType === Node.ELEMENT_NODE ? now : now?.parentElement)?.closest?.(TOGGLE);
      if (!toggle) return;
    }
    const title = titleOf(toggle);
    const body = bodyOf(toggle);
    const item = toggle.parentElement?.tagName === 'LI' ? toggle.parentElement : null;
    const take = () => { e.preventDefault(); handled.add(e); history?.push(); };

    if (title && title.contains(at)) {
      const before = document.createRange();
      before.selectNodeContents(title);
      before.setEnd(range.startContainer, range.startOffset);
      const atStart = !before.toString().replace(/​/g, '').length;
      const hasWords = !!title.textContent.replace(/​/g, '').trim();
      if (e.key === 'Backspace' && atStart) {
        // Back to plain lines: the title a paragraph, the body's lines after it.
        take();
        caretAt(unmakeToggle(toggle), 0);
        dirty();
        return;
      }
      if (e.key === 'Enter' && atStart && hasWords) {
        // An empty line above, the caret staying with the title's words — as
        // Enter at the start of any line does. It used to carry the whole
        // title into the body and leave the title empty.
        take();
        if (item) item.before(emptyLine(document, 'li'));
        else toggle.before(emptyLine());
        dirty();
        return;
      }
      if (e.key === 'Enter') {
        // Into the body, open; the words after the caret go with it.
        take();
        const after = document.createRange();
        after.setStart(range.startContainer, range.startOffset);
        after.setEnd(title, title.childNodes.length);
        const moved = after.extractContents();
        if (!title.textContent.replace(/​/g, '') && !title.querySelector('br, img')) title.innerHTML = '<br>';
        let host = body;
        if (!host) { host = document.createElement('div'); host.className = 'toggle-body'; toggle.appendChild(host); }
        setOpen(toggle, true);
        let line;
        if (moved.textContent.replace(/​/g, '')) {
          line = document.createElement('p');
          line.appendChild(moved);
          host.prepend(line);
        } else {
          line = host.firstElementChild;
          if (!line || line.textContent.replace(/​/g, '') || line.matches('ul, ol, .blk-toggle, .blk-code, figure, hr')) {
            line = emptyLine();
            host.prepend(line);
          }
        }
        caretAt(line, 0);
        dirty();
        return;
      }
      return;
    }

    if (!body?.contains(at)) return;
    let line = at;
    while (line && line.parentElement !== body) line = line.parentElement;
    if (!line || !line.matches('p, div:not([class])')) return;
    const empty = !line.textContent.replace(/​/g, '').trim() && !line.querySelector('img, hr, .inline-eq');

    if (e.key === 'Enter' && empty && line === body.lastElementChild) {
      // On the last line: out of the toggle.
      take();
      if (body.children.length > 1) line.remove();
      // Out of a toggle in a list item is the next item of that list.
      const out = item ? emptyLine(document, 'li') : emptyLine();
      (item ?? toggle).after(out);
      caretAt(out, 0);
      dirty();
      return;
    }
    // In a list item the browser's own answer to Enter and Backspace on a line
    // of the body is the list's: it breaks the item out of its list, toggle
    // and all. The line is split, and joined to the one above, here.
    if (!item) return;
    if (e.key === 'Enter') {
      take();
      const rest = document.createRange();
      rest.setStart(range.startContainer, range.startOffset);
      rest.setEnd(line, line.childNodes.length);
      const next = line.cloneNode(false);
      next.removeAttribute('id');
      next.appendChild(rest.extractContents());
      for (const el of [line, next]) {
        if (!el.textContent.replace(/​/g, '') && !el.querySelector('br, img, .inline-eq')) el.innerHTML = '<br>';
      }
      line.after(next);
      caretAt(next, 0);
      dirty();
      return;
    }
    // Backspace: only at the start of the line; anywhere else it deletes a letter.
    const lead = document.createRange();
    lead.selectNodeContents(line);
    lead.setEnd(range.startContainer, range.startOffset);
    if (lead.toString().replace(/​/g, '').length) return;
    take();
    const above = line.previousElementSibling;
    const to = !above ? title : (above.matches('p, div:not([class])') ? above : null);
    if (!to) return;                        // a list or a block above: nothing to join
    const end = document.createRange();
    end.selectNodeContents(to);
    end.collapse(false);
    if (to.lastChild?.nodeName === 'BR') end.setStartBefore(to.lastChild);
    end.collapse(true);
    const mark = document.createTextNode('');
    end.insertNode(mark);
    if (!empty) {
      if (to.lastChild?.nodeName === 'BR') to.lastChild.remove();
      while (line.firstChild) to.appendChild(line.firstChild);
    }
    if (!empty || body.children.length > 1) line.remove();
    if (!body.firstChild) body.appendChild(emptyLine());
    caretAt(mark, 0);
    dirty();
  }, true);

  // After every edit, and when a note opens (main.js): a frame left without its title.
  const heal = () => healToggles(editorEl);
  editorEl.addEventListener('input', () => { if (!isLocked()) heal(); });

  return { makeToggle, unmakeToggle, setOpen, heal };
}
