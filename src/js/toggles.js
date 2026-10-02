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
 * Keys: Enter in the title goes into the body (opening it, and taking the
 * words after the caret along); Enter on an empty last line of the body leaves
 * the toggle; Backspace at the start of the title turns the toggle back into
 * plain lines, nothing lost.
 */

export const TOGGLE = '.blk-toggle';
const ARROW_WIDTH = 24;

const titleOf = (toggle) => toggle?.firstElementChild?.classList.contains('toggle-body') ? null : toggle?.firstElementChild;
const bodyOf = (toggle) => toggle?.querySelector(':scope > .toggle-body');
const isOpen = (toggle) => toggle?.dataset.open === 'true';

function caretAt(node, offset) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** An empty line that can hold a caret. */
function emptyLine(doc = document) {
  const p = doc.createElement('p');
  p.innerHTML = '<br>';
  return p;
}

/**
 * Make `block` (a line) the title of a new toggle, open, with an empty line
 * under it. Returns the toggle.
 */
export function makeToggle(block) {
  const doc = block.ownerDocument;
  const toggle = doc.createElement('div');
  toggle.className = 'blk-toggle';
  toggle.dataset.open = 'true';
  const title = doc.createElement('p');
  title.className = 'toggle-title';
  while (block.firstChild) title.appendChild(block.firstChild);
  if (!title.textContent.replace(/​/g, '') && !title.querySelector('br')) title.innerHTML = '<br>';
  const body = doc.createElement('div');
  body.className = 'toggle-body';
  body.appendChild(emptyLine(doc));
  toggle.append(title, body);
  if (block.tagName === 'LI') {
    // Out of the list, keeping the items after it as a list of their own.
    const list = block.parentElement;
    const rest = [];
    for (let n = block.nextElementSibling; n; n = n.nextElementSibling) rest.push(n);
    list.after(toggle);
    if (rest.length) {
      const tail = list.cloneNode(false);
      rest.forEach((n) => tail.appendChild(n));
      toggle.after(tail);
    }
    block.remove();
    if (!list.querySelector('li')) list.remove();
  } else {
    block.replaceWith(toggle);
  }
  return toggle;
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
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const at = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const toggle = at?.closest?.(TOGGLE);
    if (!toggle || !editorEl.contains(toggle)) return;
    const title = titleOf(toggle);
    const body = bodyOf(toggle);

    if (title && title.contains(at)) {
      const before = document.createRange();
      before.selectNodeContents(title);
      before.setEnd(range.startContainer, range.startOffset);
      const atStart = !before.toString().replace(/​/g, '').length;
      if (e.key === 'Backspace' && atStart) {
        // Back to plain lines: the title a paragraph, the body's lines after it.
        e.preventDefault();
        history?.push();
        const p = document.createElement(title.tagName === 'P' ? 'p' : title.tagName.toLowerCase());
        while (title.firstChild) p.appendChild(title.firstChild);
        if (!p.firstChild) p.innerHTML = '<br>';
        // The body's lines follow it; the empty line a new toggle starts with does not.
        const blank = (n) => n.nodeType !== 1
          ? !n.textContent.trim()
          : n.matches('p, div:not([class])') && !n.textContent.replace(/\u200b/g, '').trim() && !n.querySelector('img, hr, .inline-eq, .note-image');
        const lines = body ? [...body.childNodes].filter((n) => !blank(n)) : [];
        toggle.replaceWith(p, ...lines);
        caretAt(p, 0);
        dirty();
        return;
      }
      if (e.key === 'Enter') {
        // Into the body, open; the words after the caret go with it.
        e.preventDefault();
        history?.push();
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

    // Enter on an empty last line of the body: out of the toggle.
    if (e.key === 'Enter' && body?.contains(at)) {
      let line = at;
      while (line && line.parentElement !== body) line = line.parentElement;
      if (!line || line !== body.lastElementChild || !line.matches('p, div:not([class])')) return;
      if (line.textContent.replace(/​/g, '').trim() || line.querySelector('img, hr, .inline-eq')) return;
      e.preventDefault();
      history?.push();
      if (body.children.length > 1) line.remove();
      const out = emptyLine();
      toggle.after(out);
      caretAt(out, 0);
      dirty();
    }
  }, true);

  return { makeToggle, setOpen };
}
