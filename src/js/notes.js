import { loadJson, saveJson, generateId } from './storage.js';
import { emit } from './bus.js';
import { SEED_NOTES } from './seed-notes.js';

const STORAGE_KEY_NOTES = 'nebula:notes';
const STORAGE_KEY_ACTIVE = 'nebula:active-note';
const STORAGE_KEY_GUIDE = 'nebula:guide-version';

/**
 * The readable text of a note.
 *
 * Shape layers are dropped: they are the note's first children, so a couple of
 * words typed inside a shape became the whole sidebar preview of every note
 * that had one — "Heyoooo… drag me anywhere" ahead of the actual first line.
 *
 * Parsed rather than regexed: `.shape-layer` holds nested divs, and a pattern
 * that tries to match a closing tag across them will pick the wrong one. A
 * DOMParser document is inert — nothing in it loads or runs.
 *
 * Memoised on the exact HTML, because the sidebar filter runs this over every
 * note on every keystroke and the guide note alone is 85 KB.
 */
/** Elements that end a line of prose, so the text either side needs a gap. */
const BLOCKS = 'p,div,h1,h2,h3,h4,h5,h6,li,ul,ol,blockquote,pre,br,hr,tr,td,th,section,article,figure,figcaption';

const textCache = new Map();
const TEXT_CACHE_MAX = 64;

export function noteText(html) {
  const src = String(html ?? '');
  if (!src) return '';
  const hit = textCache.get(src);
  if (hit !== undefined) return hit;

  let text;
  if (typeof DOMParser === 'function') {
    const doc = new DOMParser().parseFromString(src, 'text/html');
    doc.body.querySelectorAll('.shape-layer').forEach((el) => el.remove());
    // textContent joins blocks with nothing at all, so a heading ran straight
    // into the paragraph under it ("Welcome to NebulaA calm place"). Inline
    // elements must NOT get one, or a word split across <strong> comes apart.
    doc.body.querySelectorAll(BLOCKS).forEach((el) => el.after(' '));
    text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  } else {
    text = src.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  if (textCache.size >= TEXT_CACHE_MAX) textCache.clear();
  textCache.set(src, text);
  return text;
}

export function plainSnippet(html, max = 80) {
  const text = noteText(html);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function relativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(ts).toLocaleDateString();
}

export class NoteStore {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.allowSeed=true] Write the sample notes when the store
   *   is empty. The desktop app passes false unless the vault on disk was read
   *   successfully AND came back genuinely empty — an unreadable vault looks
   *   identical to a first run from in here, and seeding over someone's notes
   *   because a read failed is the one mistake this store must not make.
   * @param {Array<{title: string, content: string}>} [opts.seed=SEED_NOTES] The
   *   starter notes to write — one guide page, the same in every build.
   */
  constructor({ allowSeed = true, seed = SEED_NOTES } = {}) {
    this.notes = loadJson(STORAGE_KEY_NOTES, []);
    this.activeId = localStorage.getItem(STORAGE_KEY_ACTIVE);

    if (this.notes.length === 0 && allowSeed) {
      // One guide page covering every feature, the same in every build.
      // Built in memory and saved ONCE — createNote() saves on every call.
      const now = Date.now();
      this.notes = seed.map((note, i) => ({
        id: generateId('n'),
        title: note.title,
        content: note.content,
        createdAt: now - i,
        updatedAt: now - i,
      }));
      this.activeId = this.notes[0].id;
      localStorage.setItem(STORAGE_KEY_ACTIVE, this.activeId);
      this.save();
    }

    if (!this.activeId || !this.get(this.activeId)) {
      this.activeId = this.notes[0]?.id ?? null;
    }
  }

  /**
   * Add the guide to a vault that predates this version of it — once.
   *
   * Seeding only ever happens on an empty vault, and that rule is not up for
   * negotiation: it is what stops a failed read from looking like a first run.
   * But it also means anyone who already had notes never saw the guide, and
   * never saw anything added to it afterwards. This closes that gap the way an
   * app normally does: it only ever ADDS a note, never edits or removes one,
   * and it remembers the version it added so deleting the guide keeps it gone.
   *
   * @param {{title: string, content: string}} note the guide
   * @param {string} version bumped whenever the guide's content changes
   * @returns {boolean} whether a note was added
   */
  ensureGuide(note, version) {
    if (!note || !version) return false;
    if (localStorage.getItem(STORAGE_KEY_GUIDE) === version) return false;

    // A fresh vault was just seeded with it; only stamp the version.
    const already = this.notes.some((n) => n.title === note.title);
    if (!already) {
      const now = Date.now();
      this.notes.unshift({
        id: generateId('n'),
        title: note.title,
        content: note.content,
        createdAt: now,
        updatedAt: now,
      });
      this.save();
    }
    localStorage.setItem(STORAGE_KEY_GUIDE, version);
    return !already;
  }

  get(id) {
    return this.notes.find((n) => n.id === id) ?? null;
  }

  active() {
    return this.get(this.activeId);
  }

  setActive(id) {
    if (!this.get(id)) return;
    this.activeId = id;
    localStorage.setItem(STORAGE_KEY_ACTIVE, id);
    emit('note-opened', { id });
  }

  createNote(title = 'Untitled') {
    const now = Date.now();
    const note = {
      id: generateId('n'),
      title,
      content: '',
      createdAt: now,
      updatedAt: now,
    };
    this.notes.unshift(note);
    this.activeId = note.id;
    localStorage.setItem(STORAGE_KEY_ACTIVE, note.id);
    this.save();
    emit('note-changed', { id: note.id });
    return note;
  }

  updateActive(partial) {
    const note = this.active();
    if (!note) return;
    Object.assign(note, partial, { updatedAt: Date.now() });
    this.save();
    emit('note-changed', { id: note.id });
  }

  deleteActive() {
    if (this.notes.length <= 1) return false;
    const idx = this.notes.findIndex((n) => n.id === this.activeId);
    if (idx < 0) return false;
    const [removed] = this.notes.splice(idx, 1);
    this.activeId = this.notes[Math.min(idx, this.notes.length - 1)]?.id ?? null;
    if (this.activeId) localStorage.setItem(STORAGE_KEY_ACTIVE, this.activeId);
    else localStorage.removeItem(STORAGE_KEY_ACTIVE);
    this.save();
    emit('note-changed', { id: removed.id, deleted: true });
    return true;
  }

  sorted() {
    return [...this.notes].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Title AND the whole body. It used to search `plainSnippet(content, 500)` —
   * the first 500 characters — so a word further down a long note simply could
   * not be found from the sidebar.
   */
  filter(query) {
    const q = query.trim().toLowerCase();
    if (!q) return this.sorted();
    return this.sorted().filter((n) => {
      const hay = `${n.title} ${noteText(n.content)}`.toLowerCase();
      return hay.includes(q);
    });
  }

  save() {
    saveJson(STORAGE_KEY_NOTES, this.notes);
  }
}
