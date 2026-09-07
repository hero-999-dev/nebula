/**
 * Find inside the open note (Ctrl+F).
 *
 * The matches are NOT marked up. Wrapping hits in <mark> would edit the note —
 * it would dirty it, reach the autosave, and land on the undo stack — so this
 * uses the CSS Custom Highlight API: ranges are handed to the renderer and
 * painted by `::highlight()`, and the note's HTML is never touched.
 *
 * Chromium has had it since 105 and Electron 33 is Chromium 130, so it is
 * always there in the app; the guard is for a browser preview on something
 * older, where the bar still counts matches and scrolls to them.
 */

const HIGHLIGHT = 'nebula-find';
const CURRENT = 'nebula-find-current';

const supported = () => typeof CSS !== 'undefined' && typeof CSS.highlights !== 'undefined' && typeof Highlight === 'function';

/**
 * Every match of `query` in `root`, in document order, as Ranges.
 * Case-insensitive. Pure apart from reading the DOM — tested in jsdom.
 */
export function findMatches(root, query) {
  const needle = String(query ?? '').toLowerCase();
  if (!root || needle.length === 0) return [];

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Code blocks keep their source in a data attribute and repaint from it;
      // the shape layer is not part of the prose. Neither is what "find in this
      // note" means, but both are visible text, so they stay searchable.
      return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const out = [];
  let node;
  while ((node = walker.nextNode())) {
    const hay = node.nodeValue.toLowerCase();
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at === -1) break;
      const range = root.ownerDocument.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      out.push(range);
      from = at + needle.length;
    }
  }
  return out;
}

/** Wrap an index into 0..length-1, so next/prev cycle. Pure — tested. */
export function stepIndex(index, delta, length) {
  if (length <= 0) return -1;
  return (((index + delta) % length) + length) % length;
}

export function initFind(editorEl) {
  const bar = document.getElementById('find-bar');
  const input = document.getElementById('find-input');
  const countEl = document.getElementById('find-count');
  if (!bar || !input || !editorEl) return null;

  let matches = [];
  let index = -1;

  function paint() {
    if (!supported()) return;
    CSS.highlights.delete(HIGHLIGHT);
    CSS.highlights.delete(CURRENT);
    if (!matches.length) return;
    const rest = matches.filter((_, i) => i !== index);
    if (rest.length) CSS.highlights.set(HIGHLIGHT, new Highlight(...rest));
    if (matches[index]) CSS.highlights.set(CURRENT, new Highlight(matches[index]));
  }

  function reveal() {
    const range = matches[index];
    if (!range) return;
    const host = range.startContainer.parentElement;
    host?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function search(reset = true) {
    matches = findMatches(editorEl, input.value);
    if (reset) index = matches.length ? 0 : -1;
    countEl.textContent = matches.length ? `${index + 1} of ${matches.length}` : (input.value ? 'no matches' : '');
    countEl.classList.toggle('find-none', !!input.value && !matches.length);
    paint();
    reveal();
  }

  function step(delta) {
    if (!matches.length) return;
    index = stepIndex(index, delta, matches.length);
    search(false);
  }

  function open() {
    bar.hidden = false;
    const selected = window.getSelection()?.toString().trim();
    if (selected && selected.length < 80) input.value = selected;
    input.focus();
    input.select();
    search();
  }

  function close() {
    bar.hidden = true;
    matches = [];
    index = -1;
    if (supported()) { CSS.highlights.delete(HIGHLIGHT); CSS.highlights.delete(CURRENT); }
    editorEl.focus();
  }

  input.addEventListener('input', () => search());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  bar.querySelector('[data-find="next"]')?.addEventListener('click', () => step(1));
  bar.querySelector('[data-find="prev"]')?.addEventListener('click', () => step(-1));
  bar.querySelector('[data-find="close"]')?.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      open();
    }
  });

  // The note changed under the highlights; they point at nodes that are gone.
  return { open, close, refresh: () => { if (!bar.hidden) search(false); }, isOpen: () => !bar.hidden };
}
