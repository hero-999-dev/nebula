import { loadJson, saveJson, generateId } from './storage.js';
import { emit } from './bus.js';
import { SEED_NOTES } from './seed-notes.js';

const STORAGE_KEY_NOTES = 'nebula:notes';
const STORAGE_KEY_ACTIVE = 'nebula:active-note';

export function plainSnippet(html, max = 80) {
  const text = String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
   * @param {Array<{title: string, content: string}>} [opts.seed=SEED_NOTES] Which
   *   starter notes to write. The test build gets the per-feature checklist;
   *   an installed app gets the single help page (see seedFor).
   */
  constructor({ allowSeed = true, seed = SEED_NOTES } = {}) {
    this.notes = loadJson(STORAGE_KEY_NOTES, []);
    this.activeId = localStorage.getItem(STORAGE_KEY_ACTIVE);

    if (this.notes.length === 0 && allowSeed) {
      // one note per feature category, so everything can be checked by hand.
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

  filter(query) {
    const q = query.trim().toLowerCase();
    if (!q) return this.sorted();
    return this.sorted().filter((n) => {
      const hay = `${n.title} ${plainSnippet(n.content, 500)}`.toLowerCase();
      return hay.includes(q);
    });
  }

  save() {
    saveJson(STORAGE_KEY_NOTES, this.notes);
  }
}
