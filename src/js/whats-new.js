/**
 * The "what changed" card, shown once per version.
 *
 * The dialog itself is deliberately dumb: `release-notes.js` decides what there
 * is to say and whether it has been said already, and both of those are pure
 * functions with tests. This only draws and remembers.
 */
import { RELEASE_NOTES, notesFor, shouldShow } from './release-notes.js';

const KEY = 'nebula:whats-new-seen';

const read = (storage) => {
  try { return storage.getItem(KEY); } catch { return null; }   // private mode
};
const write = (storage, version) => {
  try { storage.setItem(KEY, version); } catch { /* nothing to do about it */ }
};

/**
 * @param {{overlay: Element, body: Element, close: Element}} els
 * @param {{version?: string, notes?: object, storage?: Storage}} opts
 * @returns {{open: (v?: string) => void, maybeOpen: () => boolean}}
 */
export function initWhatsNew(els, opts = {}) {
  const { overlay, body, close } = els;
  const { notes = RELEASE_NOTES, storage = localStorage } = opts;
  if (!overlay || !body) return { open: () => {}, maybeOpen: () => false };

  let current = opts.version ?? null;

  function draw(entry) {
    body.innerHTML = '';
    const head = document.createElement('p');
    head.className = 'wn-headline';
    head.textContent = entry.headline || '';
    body.appendChild(head);

    const list = document.createElement('div');
    list.className = 'wn-list';
    for (const item of entry.items) {
      const row = document.createElement('div');
      row.className = 'wn-item';
      const t = document.createElement('p');
      t.className = 'wn-item__title';
      t.textContent = item.title;
      const d = document.createElement('p');
      d.className = 'wn-item__text';
      d.textContent = item.text;
      row.append(t, d);
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  function show(entry) {
    draw(entry);
    const title = document.getElementById('whats-new-title');
    if (title) title.textContent = `What’s new in v${entry.version}`;
    overlay.hidden = false;
    close?.focus();
  }

  function dismiss() {
    overlay.hidden = true;
    if (current) write(storage, String(current).replace(/^v/, ''));
  }

  close?.addEventListener('click', dismiss);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) dismiss(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) dismiss();
  });

  return {
    /** Open it on demand — Help → What's new, whatever the stored version. */
    open(version = current) {
      const entry = notesFor(version, notes) ?? notesFor(latestOf(notes), notes);
      if (entry) show(entry);
    },
    /** Open it only if this version has something unsaid. */
    maybeOpen() {
      const entry = notesFor(current, notes);
      if (!entry || !shouldShow(current, read(storage), notes)) return false;
      show(entry);
      return true;
    },
    setVersion(v) { current = v; },
    /**
     * Mark this version as seen without showing anything.
     *
     * A brand-new vault has no older version to have missed. Opening "what's
     * new" for someone running Nebula for the first time is noise, it lands on
     * top of the guide they were meant to read, and — because every test
     * profile is a fresh vault — it covered the whole window for the six
     * launches of the smoke suite.
     */
    acknowledge() {
      if (current) write(storage, String(current).replace(/^v/, ''));
    },
  };
}

/** The highest version the notes know about — the fallback for Help. */
export function latestOf(notes = RELEASE_NOTES) {
  const cmp = (a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i += 1) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
    }
    return 0;
  };
  return Object.keys(notes).sort(cmp).pop() ?? null;
}
