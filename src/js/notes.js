import { normalizeLabels } from './labels.js';
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
const TEXT_CACHE_CHARS = 4_000_000;
let textCacheChars = 0;

export function noteText(html) {
  const src = String(html ?? '');
  if (!src) return '';
  const hit = textCache.get(src);
  if (hit !== undefined) return hit;

  let text;
  if (typeof DOMParser === 'function') {
    const doc = new DOMParser().parseFromString(src.replace(/data:image\/[^\s"'<>]+/gi, 'data:,'), 'text/html');
    doc.body.querySelectorAll('.shape-layer, .image-layer').forEach((el) => el.remove());
    // textContent joins blocks with nothing at all, so a heading ran straight
    // into the paragraph under it ("Welcome to NebulaA calm place"). Inline
    // elements must NOT get one, or a word split across <strong> comes apart.
    doc.body.querySelectorAll(BLOCKS).forEach((el) => el.after(' '));
    text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  } else {
    text = src.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  while (textCache.size && (textCache.size >= TEXT_CACHE_MAX || textCacheChars + src.length > TEXT_CACHE_CHARS)) {
    const oldest = textCache.keys().next().value;
    textCacheChars -= oldest.length; textCache.delete(oldest);
  }
  if (src.length <= TEXT_CACHE_CHARS) { textCache.set(src, text); textCacheChars += src.length; }
  return text;
}

/** How much of a note's markup the sidebar line reads, pictures taken out. */
const SNIPPET_SOURCE = 40_000;

export function plainSnippet(html, max = 80) {
  // The first words, not a parse of the whole note: every save redraws the
  // list, and the note being typed in is new markup each time — a 900 KB note
  // with pictures was parsed whole on every autosave. Cut after the pictures
  // are taken out, so a picture cannot use up the part that is read.
  let src = String(html ?? '');
  if (src.length > SNIPPET_SOURCE) src = src.replace(/data:image\/[^\s"'<>]+/gi, 'data:,').slice(0, SNIPPET_SOURCE);
  const text = noteText(src);
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

/**
 * Where a note stands in the list (0.9.3). A note nobody has dragged stands
 * by when it was last changed, newest first, as it always has; a dragged one
 * keeps the place it was put in (`order`). Both are on one scale — `order` is
 * made from its neighbours' keys — so the two kinds sort together.
 */
export function sortKey(note) {
  return typeof note?.order === 'number' && Number.isFinite(note.order) ? note.order : (note?.updatedAt ?? 0);
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
        ...(note.readOnly ? { readOnly: true } : {}),
        createdAt: now - i,
        updatedAt: now - i,
      }));
      this.activeId = this.notes[0].id;
      localStorage.setItem(STORAGE_KEY_ACTIVE, this.activeId);
      this.save();
    }

    const active = this.get(this.activeId);
    if (!active || active.deletedAt || active.archivedAt) {
      this.activeId = this.sorted()[0]?.id ?? null;
      if (this.activeId) localStorage.setItem(STORAGE_KEY_ACTIVE, this.activeId);
      else localStorage.removeItem(STORAGE_KEY_ACTIVE);
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
   * @param {{unedited?: (html: string) => boolean}} [opts] recognises a guide
   *   nobody has written in (seed-notes.js `guideUnedited`); that one is
   *   brought up to date in place. Until 0.8.6 an existing guide was never
   *   refreshed, so nothing added to it after a vault's first run was ever seen.
   * @returns {boolean} whether a note was added (a refresh in place returns false)
   */
  ensureGuide(note, version, { unedited } = {}) {
    if (!note || !version) return false;
    if (localStorage.getItem(STORAGE_KEY_GUIDE) === version) return false;

    const existing = this.notes.find((n) => n.title === note.title && !n.deletedAt);
    if (existing && existing.content !== note.content && unedited?.(existing.content)) {
      existing.content = note.content;
      existing.updatedAt = Date.now();
      if (note.readOnly) existing.readOnly = true;   // the guide arrives locked (0.8.9)
      this.save();
    }

    // A fresh vault was just seeded with it; only stamp the version.
    const already = this.notes.some((n) => n.title === note.title);
    if (!already) {
      const now = Date.now();
      this.notes.unshift({
        id: generateId('n'),
        title: note.title,
        content: note.content,
        ...(note.readOnly ? { readOnly: true } : {}),
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
    if (id === null) {
      this.activeId = null;
      localStorage.removeItem(STORAGE_KEY_ACTIVE);
      emit('note-opened', { id: null });
      return;
    }
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
    this.save([note.id]);
    emit('note-changed', { id: note.id });
    return note;
  }

  updateActive(partial) {
    this.updateNote(this.activeId, partial);
  }

  updateNote(id, partial) {
    const note = this.get(id);
    if (!note) return;
    Object.assign(note, partial, { updatedAt: Date.now() });
    this.save([note.id]);
    emit('note-changed', { id: note.id });
  }

  /** Notes on the main list: not archived, not in the trash. */
  live() {
    return this.notes.filter((n) => !n.archivedAt && !n.deletedAt);
  }

  archived() {
    return this.notes.filter((n) => n.archivedAt && !n.deletedAt)
      .sort((a, b) => b.archivedAt - a.archivedAt);
  }

  trashed() {
    return this.notes.filter((n) => n.deletedAt)
      .sort((a, b) => b.deletedAt - a.deletedAt);
  }

  /** Pinned first, then by place: dragged notes where they were put, the rest most recently touched. */
  sorted() {
    return this.live().sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return sortKey(b) - sortKey(a);
    });
  }

  /**
   * A note dragged to a place in the list (0.9.3): into a folder or out of
   * one, and to a place (`order`, worked out by note-list.js from the
   * neighbours it was dropped between). Dragging never pins or unpins a note
   * (the owner, 0.9.3: "moving a note must not pin it"). Not an edit: the date stays.
   * @param {string} id
   * @param {{folder?: string|null, order?: number}} where
   */
  setPlace(id, { folder = null, order } = {}) {
    const note = this.get(id);
    if (!note) return null;
    const patch = {};
    if (typeof order === 'number' && Number.isFinite(order)) patch.order = order;
    if (folder) patch.folder = folder; else delete note.folder;
    return this.#mark(id, patch);
  }

  /** Places for several notes at once (a group numbered afresh), one save. */
  setOrders(entries) {
    const changed = [];
    for (const [id, order] of entries) {
      const note = this.get(id);
      if (!note || !Number.isFinite(order)) continue;
      note.order = order;
      changed.push(id);
    }
    if (changed.length) {
      this.save(changed);
      emit('note-changed', { id: changed[0] });
    }
    return changed;
  }

  /** Into a folder, or out of every folder with null. Its place is kept. */
  setFolder(id, folder) {
    const note = this.get(id);
    if (!note) return null;
    if (!folder) {
      if (!note.folder) return note;
      delete note.folder;
      this.save([id]);
      emit('note-changed', { id });
      return note;
    }
    return note.folder === folder ? note : this.#mark(id, { folder });
  }

  /** A folder was deleted: its notes, archived and trashed ones too, are in the list again. */
  releaseFolder(folder) {
    const changed = [];
    for (const note of this.notes) {
      if (note.folder === folder) { delete note.folder; changed.push(note.id); }
    }
    if (changed.length) {
      this.save(changed);
      for (const id of changed) emit('note-changed', { id });
    }
    return changed;
  }

  /**
   * Title AND the whole body. It used to search `plainSnippet(content, 500)` —
   * the first 500 characters — so a word further down a long note simply could
   * not be found from the sidebar. Archived and trashed notes are not searched;
   * they have their own sections.
   */
  filter(query) {
    const q = query.trim().toLowerCase();
    if (!q) return this.sorted();
    return this.sorted().filter((n) => {
      const hay = `${n.title} ${normalizeLabels(n.labels).map(label => "#" + label).join(" ")} ${noteText(n.content)}`.toLowerCase();
      return hay.includes(q);
    });
  }

  /** Flip one flag on one note and save. Returns the note, or null. */
  #mark(id, patch) {
    const note = this.get(id);
    if (!note) return null;
    Object.assign(note, patch);
    // `updatedAt` is deliberately NOT touched: archiving a note is not editing
    // it, and bumping it would reorder the list for no reason.
    this.save([id]);
    emit('note-changed', { id });
    return note;
  }

  /**
   * Only view: the note opens for reading and nothing edits it until this is
   * turned off again (the note's ⋯ menu, or the badge by its title). A flag,
   * like pinning — not an edit, so `updatedAt` stays.
   */
  setReadOnly(id, on) {
    return this.#mark(id, { readOnly: !!on });
  }

  toggleReadOnly(id) {
    const note = this.get(id);
    return note ? this.#mark(id, { readOnly: !note.readOnly }) : null;
  }

  /**
   * Store a note as this version brought it up to date on the way in
   * (migrate.js and the controllers' rehydration) — a repair, not an edit, so
   * its date and its place in the list stay. `markupVersion` records which
   * version last healed it.
   */
  heal(id, content, markupVersion) {
    return this.#mark(id, { content, ...(markupVersion ? { markupVersion } : {}) });
  }

  /**
   * Many repairs, one save (heal.js). Each is applied only if the note still
   * holds exactly the markup it was computed from: a note someone typed in
   * meanwhile keeps what they typed.
   * @param {{id: string, from: string, content: string}[]} repairs
   * @returns {number} notes written
   */
  healMany(repairs, markupVersion) {
    const written = [];
    for (const { id, from, content } of repairs) {
      const note = this.get(id);
      if (!note || note.content !== from) continue;
      note.content = content;
      if (markupVersion) note.markupVersion = markupVersion;
      written.push(id);
    }
    if (written.length) this.save(written);
    return written.length;
  }

  /**
   * The note's writing font (0.9.3): the family and size picked last in it,
   * which a new line is written in. `null` for either goes back to the app's
   * own. A setting, not an edit — the note keeps its date.
   * @param {{family?: string|null, size?: number|null}} patch
   */
  setFont(id, patch) {
    const note = this.get(id);
    if (!note) return null;
    const font = { ...(note.font || {}) };
    for (const key of ['family', 'size']) {
      if (!(key in (patch || {}))) continue;
      if (patch[key] === null || patch[key] === undefined || patch[key] === '') delete font[key];
      else font[key] = key === 'size' ? Math.max(6, Math.min(400, Math.round(Number(patch[key])))) : String(patch[key]).slice(0, 200);
    }
    const same = JSON.stringify(font) === JSON.stringify(note.font || {});
    if (same) return note;
    return this.#mark(id, Object.keys(font).length ? { font } : { font: undefined });
  }

  /** Auto order page for this note (0.9.3, page-order.js): a setting, not an edit. */
  toggleAutoOrder(id) {
    const note = this.get(id);
    return note ? this.#mark(id, { autoOrder: !note.autoOrder }) : null;
  }

  /**
   * The note's page (0.9.3, page-mode.js): Nebula Wide, Nebula Narrow or a
   * paper size. A setting, like the font — the note keeps its date and place.
   */
  setPage(id, page) {
    const note = this.get(id);
    if (!note) return null;
    const value = page && page !== 'nw' ? String(page).slice(0, 8) : undefined;
    if ((note.page || undefined) === value) return note;
    if (value === undefined) {
      delete note.page;
      this.save([id]);
      emit('note-changed', { id });
      return note;
    }
    return this.#mark(id, { page: value });
  }

  /** The note's page zoom in percent (0.9.3, page-zoom.js); a setting, 100 stores nothing. */
  setZoom(id, percent) {
    const note = this.get(id);
    if (!note) return null;
    // A percentage of the real size or 'fit'; null (or nothing) is "the page's own default".
    const value = percent === 'fit' ? 'fit' : (Number.isFinite(percent) ? Math.round(percent) : undefined);
    if ((note.zoom ?? undefined) === value) return note;
    if (value === undefined) {
      delete note.zoom;
      this.save([id]);
      emit('note-changed', { id });
      return note;
    }
    return this.#mark(id, { zoom: value });
  }

  setLabels(id, labels) {
    return this.#mark(id, { labels: normalizeLabels(labels) });
  }

  /**
   * A label gone from every note (0.9.3, "⋯ -> Delete label" in the label
   * search): off each note's title, and — through `stripText`, which takes the
   * #chips out of a note's markup — out of each note's text. One save.
   * @param {string} label
   * @param {(html: string) => string|null} stripText the new markup, or null when nothing changed
   * @returns {string[]} the notes that changed
   */
  deleteLabel(label, stripText) {
    const want = String(label || '').replace(/^#+/, '').toLocaleLowerCase();
    if (!want) return [];
    const changed = [];
    for (const note of this.notes) {
      let touched = false;
      const labels = normalizeLabels(note.labels);
      const kept = labels.filter((l) => l.toLocaleLowerCase() !== want);
      if (kept.length !== labels.length) {
        if (kept.length) note.labels = kept; else delete note.labels;
        touched = true;
      }
      const html = typeof note.content === 'string' && note.content.includes('note-tag') ? stripText?.(note.content) : null;
      if (html !== null && html !== undefined && html !== note.content) { note.content = html; touched = true; }
      if (touched) changed.push(note.id);
    }
    if (changed.length) {
      this.save(changed);
      for (const id of changed) emit('note-changed', { id, labelDeleted: want });
    }
    return changed;
  }

  togglePin(id) {
    const note = this.get(id);
    return note ? this.#mark(id, { pinned: !note.pinned }) : null;
  }

  archive(id) {
    return this.#mark(id, { archivedAt: Date.now(), pinned: false });
  }

  unarchive(id) {
    return this.#mark(id, { archivedAt: null });
  }

  /**
   * To the trash, not gone. The old `deleteActive()` refused to remove the last
   * note because there was no way back; there is one now, and the user has to
   * be able to delete the guide.
   */
  trash(id) {
    const note = this.#mark(id, { deletedAt: Date.now(), pinned: false });
    if (note && this.activeId === id) this.setActive(this.sorted()[0]?.id ?? null);
    return note;
  }

  restore(id) {
    return this.#mark(id, { deletedAt: null, archivedAt: null });
  }

  /** Actually gone: the note leaves the store, and the mirror deletes its file. */
  destroy(id) {
    const idx = this.notes.findIndex((n) => n.id === id);
    if (idx < 0) return false;
    this.notes.splice(idx, 1);
    if (this.activeId === id) this.activeId = this.sorted()[0]?.id ?? null;
    if (this.activeId) localStorage.setItem(STORAGE_KEY_ACTIVE, this.activeId);
    else localStorage.removeItem(STORAGE_KEY_ACTIVE);
    this.save([]);
    emit('note-changed', { id, deleted: true });
    return true;
  }

  /**
   * @param {string[]} [changed] the notes this save is for. Without it every
   *   note is written again, which in a vault holding long articles cost a
   *   visible pause on each autosave.
   */
  save(changed) {
    saveJson(STORAGE_KEY_NOTES, this.notes, { changed });
  }
}
