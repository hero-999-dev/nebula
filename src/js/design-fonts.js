/**
 * The design's font on every note (1.0.4) — and the fonts put back.
 *
 * The owner: "design kısmında altta ayar olsun, tüm notlara design theme olsun
 * mu diye; kullanıcı bassın, ona değişsin; sonra sağ alttan pop up çıksın,
 * isterseniz fontları eski haline döndürelim diye — bu tüm fontları eski
 * haline döndürür, nottaki ve not headerındaki".
 *
 * A note is written in the design's face wherever it has no font of its own:
 * no font on its words, no writing font (which is its title's font too). So
 * the button under the designs takes those off every note, and from then on
 * each note follows whichever design is on. Sizes, colours and everything else
 * stay. Code keeps its own face under every design and is not touched; the
 * trash, the black holes and the notes set to only view are left alone.
 *
 * The font of new notes (Settings → General) goes with them, and comes back
 * with them: the Serif is a font like any other since 1.0.4, so that list has
 * no row for "none", and a note made after the button was pressed is to follow
 * the design as the others do.
 *
 * What the notes had is kept in memory — never on disk — until the card at the
 * bottom right is answered: put back, or closed. A note deleted for good in the
 * meantime leaves it at once, and nothing here can bring a note back: only a
 * note that is still in the store, and has not been edited since, gets its
 * fonts again.
 */

import { on } from './bus.js';

/** Parts whose letters are the app's own under every design, or redrawn from their source on every open. */
const KEPT = '.blk-code, .inline-eq, .katex, .note-widget';

/**
 * A note's markup with no font on any of its words. A span left with nothing
 * to say goes with its font. The very string that came in is returned when
 * there was no font to take off. Pure — tested.
 */
export function withoutFonts(html) {
  const raw = String(html ?? '');
  if (!/font/i.test(raw)) return raw;
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${raw}</body>`, 'text/html');
  let changed = false;
  for (const el of doc.body.querySelectorAll('[style], [data-font-family], font[face]')) {
    if (el.closest(KEPT)) continue;
    let own = false;
    if (el.style.fontFamily) {
      el.style.removeProperty('font-family');
      if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
      own = true;
    }
    if (el.hasAttribute('data-font-family')) { el.removeAttribute('data-font-family'); own = true; }
    if (el.tagName === 'FONT' && el.hasAttribute('face')) { el.removeAttribute('face'); own = true; }
    if (!own) continue;
    changed = true;
    if ((el.tagName === 'SPAN' || el.tagName === 'FONT') && !el.attributes.length) el.replaceWith(...el.childNodes);
  }
  return changed ? doc.body.innerHTML : raw;
}

/** Whether the button passes a note by: the trash, a black hole, only view. */
const leftAlone = (note) => !note || !!note.deletedAt || !!note.hole || !!note.readOnly;

/**
 * What the button is to write, and what each of those notes had. Pure — tested.
 * @param {object[]} notes
 * @returns {{writes: {id: string, content: string, font: object|undefined}[], had: Map<string, {content: string, font: object|undefined, updatedAt: number}>}}
 */
export function fontsOff(notes) {
  const writes = [];
  const had = new Map();
  for (const note of notes ?? []) {
    if (leftAlone(note) || typeof note.content !== 'string') continue;
    const content = withoutFonts(note.content);
    const family = note.font?.family;
    if (content === note.content && !family) continue;
    const font = { ...(note.font || {}) };
    delete font.family;
    writes.push({ id: note.id, content, font: Object.keys(font).length ? font : undefined });
    had.set(note.id, { content: note.content, font: note.font ? { ...note.font } : undefined, updatedAt: note.updatedAt });
  }
  return { writes, had };
}

/**
 * The fonts put back: only into a note that is still there, is not left alone
 * now, and has not been edited since they were taken off — its date tells, for
 * taking the fonts off is no edit and a repair on opening is none either.
 * Pure — tested.
 * @param {Map<string, {content: string, font: object|undefined, updatedAt: number}>} had
 * @param {(id: string) => object|null|undefined} get
 * @returns {{writes: {id: string, content: string, font: object|undefined}[], edited: number}}
 */
export function fontsBack(had, get) {
  const writes = [];
  let edited = 0;
  for (const [id, was] of had ?? []) {
    const note = get(id);
    if (leftAlone(note)) continue;
    if (note.updatedAt !== was.updatedAt) { edited += 1; continue; }
    writes.push({ id, content: was.content, font: was.font });
  }
  return { writes, edited };
}

/**
 * @param {object} deps
 * @param {import('./notes.js').NoteStore} deps.store
 * @param {() => Promise<void>} deps.saveNow what is being typed is written first
 * @param {() => void} deps.reopen the open note is read again from the store
 * @param {(words: string) => void} deps.say a short word at the foot of the window
 * @param {{get: () => string|null, set: (font: string|null) => void}} [deps.newFont] the font of new notes, in Settings
 */
export function initDesignFonts({ store, saveNow, reopen, say, newFont }) {
  let had = new Map();
  /** The font new notes started in when the button was pressed, or null. */
  let hadNew = null;
  let card = null;

  // "Deleted notes stay deleted": what a note had goes when the note does.
  on('note-changed', ({ id, deleted } = {}) => { if (deleted && id) had.delete(id); });

  const hide = () => { had = new Map(); hadNew = null; if (card) card.hidden = true; };

  const write = async (pick) => {
    await saveNow();
    const result = pick();
    if (result.writes.length) {
      store.setFontsMany(result.writes);
      reopen();
    }
    return result;
  };

  const back = async () => {
    const { writes, edited } = await write(() => fontsBack(had, (id) => store.get(id)));
    // New notes get theirs again, unless one was chosen in Settings since.
    const again = !!hadNew && !newFont?.get();
    if (again) newFont.set(hadNew);
    hide();
    if (writes.length || edited || again) say(edited ? 'The fonts are back, except in the notes changed since' : 'The fonts are back as they were');
  };

  const build = () => {
    card = document.createElement('div');
    card.className = 'update-card fonts-back';
    card.id = 'fonts-back';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    const text = document.createElement('p');
    text.className = 'uc-text';
    text.textContent = 'Every note is in the design’s font now. If you like, the fonts can go back to what they were.';
    const actions = document.createElement('div');
    actions.className = 'uc-actions';
    const button = (id, cls, words, run) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${cls}`;
      b.dataset.fonts = id;
      b.textContent = words;
      b.addEventListener('click', run);
      return b;
    };
    actions.append(button('keep', 'ghost', 'Close', hide), button('back', 'primary', 'Put the fonts back', () => { void back(); }));
    card.append(text, actions);
    card.hidden = true;
    document.body.append(card);
  };

  const show = () => {
    if (!card) build();
    // Above the other cards of this corner when they are up.
    let bottom = 18;
    for (const id of ['update-card', 'screen-tip']) {
      const other = document.getElementById(id);
      if (other && !other.hidden) bottom += other.offsetHeight + 10;
    }
    card.style.bottom = bottom > 18 ? `${bottom}px` : '';
    card.hidden = false;
  };

  return {
    /** The button under the designs. */
    async apply() {
      const { writes, had: now } = await write(() => fontsOff(store.notes));
      // A font chosen for new notes — after an earlier press too — is the one to bring back.
      const starts = newFont?.get() || null;
      if (starts) { hadNew = starts; newFont.set(null); }
      if (!writes.length && !starts) {
        if (!had.size && !hadNew) say('No note had a font of its own');
        return 0;
      }
      // Pressed again before the card was answered: a note keeps what it had first, unless it was edited in between.
      for (const [id, was] of now) {
        const first = had.get(id);
        if (!first || first.updatedAt !== was.updatedAt) had.set(id, was);
      }
      show();
      return writes.length;
    },
    back,
    /** How many notes can still get their fonts back. */
    get pending() { return had.size; },
  };
}
