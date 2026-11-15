/**
 * Copy for Discord (1.0.4): a note's menu puts the note on the clipboard as
 * the text Discord reads, and a card at the bottom right goes through what
 * one paste cannot take — a note longer than one message part by part, then
 * its pictures one at a time.
 *
 * Nebula sends nothing. What is copied is on the clipboard until something
 * else is, like any copy; the card itself keeps the note's text only while it
 * is up, and lets go of it when it is closed, when the note is deleted, or
 * when the note may no longer be shared (discord-share.js `canShare`).
 */
import { on } from './bus.js';
import { canShare, forDiscord } from './discord-share.js';

const MEDIA = /^nebula-media:\/\//i;

/** The clipboard as the app has it: text everywhere, a picture only through the desktop app's bridge. */
const systemClip = () => ({
  text: (words) => navigator.clipboard.writeText(words),
  // A picture shown from its file is read there by the main process (rich-paste.js does the same).
  image: window.nebula?.clipboard?.image
    ? (src) => window.nebula.clipboard.image(MEDIA.test(src) ? { url: src } : { dataUrl: src })
    : null,
});

/**
 * @param {object} deps
 * @param {import('./notes.js').NoteStore} deps.store
 * @param {() => Promise<void>} [deps.saveNow] what is being typed is written first
 * @param {(words: string) => void} deps.say a short word at the foot of the window
 * @param {() => boolean} [deps.locked] whether the lock screen is up
 * @param {{text: (words: string) => Promise<void>, image: ((src: string) => Promise<boolean>)|null}} [deps.clip]
 */
export function initDiscordCopy({ store, saveNow, say, locked = () => !!document.getElementById('app-lock'), clip = null }) {
  /** What is being copied: { id, parts, pictures, left, at, failed } — `at` is the step copied last. */
  let run = null;
  let card = null;
  let text = null;
  let leftEl = null;
  let next = null;

  const can = (note) => canShare(note, { locked: locked() });

  const hide = () => { run = null; if (card) card.hidden = true; };

  // "Deleted notes stay deleted": the card holds a note's words no longer than
  // the note is there, and no longer than it may be shared (into the Trash or
  // a black hole while the card is up).
  on('note-changed', ({ id, deleted } = {}) => {
    if (!run || (id && id !== run.id)) return;
    if (deleted || !can(store.get(run.id))) hide();
  });

  const build = () => {
    card = document.createElement('div');
    card.className = 'update-card discord-copy';
    card.id = 'discord-copy';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    text = document.createElement('p');
    text.className = 'uc-text';
    leftEl = document.createElement('p');
    leftEl.className = 'uc-text discord-left';
    const actions = document.createElement('div');
    actions.className = 'uc-actions';
    const button = (id, cls, press) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${cls}`;
      b.dataset.discord = id;
      b.addEventListener('click', press);
      return b;
    };
    const close = button('close', 'ghost', hide);
    close.textContent = 'Close';
    next = button('next', 'primary', () => { void step(); });
    actions.append(close, next);
    card.append(text, leftEl, actions);
    card.hidden = true;
    document.body.append(card);
  };

  /** What the card says of the step just copied, and what its button copies next. */
  const words = () => {
    const { parts, pictures, at, failed } = run;
    const n = parts.length;
    const m = pictures.length;
    let said;
    if (at >= n) said = failed ? `Picture ${at - n + 1} of ${m} could not be copied.` : `Picture ${at - n + 1} of ${m} copied. Paste it in Discord.`;
    else if (n === 1) said = 'Copied for Discord. Paste it there.';
    else if (at + 1 < n) said = `Part ${at + 1} of ${n} copied. Paste it in Discord, then press Next part.`;
    else said = `Part ${n} of ${n} copied. Paste it in Discord.`;
    const after = at + 1;
    let button = '';
    if (after < n) button = 'Next part';
    else if (after < n + m) button = `Copy picture ${after - n + 1} of ${m}`;
    return { said, button };
  };

  const show = () => {
    if (!card) build();
    const { said, button } = words();
    text.textContent = said;
    // One line for each kind of thing the text could not carry.
    const lines = [
      ['Shapes and arrows not in the copy', run.left.shapes],
      ['Widgets not in the copy', run.left.widgets],
      ['Files not in the copy', run.left.files],
      ['Pictures not in the copy', run.left.pictures],
    ].filter(([, count]) => count > 0).map(([what, count]) => `${what}: ${count}`);
    leftEl.replaceChildren(...lines.flatMap((line, i) => (i ? [document.createElement('br'), line] : [line])));
    leftEl.hidden = !lines.length;
    next.textContent = button;
    next.hidden = !button;
    // Above the other cards of this corner when they are up.
    let bottom = 18;
    for (const id of ['update-card', 'screen-tip', 'fonts-back']) {
      const other = document.getElementById(id);
      if (other && !other.hidden) bottom += other.offsetHeight + 10;
    }
    card.style.bottom = bottom > 18 ? `${bottom}px` : '';
    card.hidden = false;
  };

  /** Copy the next part, or the next picture, and say so on the card. */
  async function step() {
    if (!run) return false;
    // Moved into a black hole or the Trash, or the lock came up, since the card opened.
    if (!can(store.get(run.id))) { hide(); return false; }
    const now = run;
    const i = now.at + 1;
    const n = now.parts.length;
    if (i >= n + now.pictures.length) return false;
    let ok = false;
    try {
      if (i < n) { await now.clip.text(now.parts[i]); ok = true; } else ok = !!(await now.clip.image(now.pictures[i - n].src));
    } catch { ok = false; }
    if (run !== now) return false;        // closed, or another note asked for, while the clipboard answered
    if (!ok && i < n) {
      // The same part is tried again by the same button; nothing is skipped.
      say('Could not copy to the clipboard');
      if (now.at < 0) hide();
      return false;
    }
    // A picture the clipboard cannot take is passed over, and the card says which.
    now.at = i;
    now.failed = !ok;
    show();
    return ok;
  }

  return {
    /** Whether a note's menu offers the entry. */
    can,
    /**
     * The menu's entry: the first part onto the clipboard, the card for the rest.
     * @param {string} id
     * @returns {Promise<boolean>} whether something was copied
     */
    async copy(id) {
      await saveNow?.();
      const note = store.get(id);
      if (!can(note)) return false;
      const made = forDiscord(note);
      const using = clip ?? systemClip();
      // Outside the desktop app a picture cannot be put on the clipboard: it is counted with what stays behind.
      const pictures = using.image ? made.pictures : [];
      const left = { ...made.left, pictures: made.pictures.length - pictures.length };
      if (!made.parts.length && !pictures.length) {
        hide();
        say('There is nothing in this note to copy');
        return false;
      }
      run = { id, parts: made.parts, pictures, left, at: -1, failed: false, clip: using };
      return step();
    },
    /** The card's Next, for the tests. */
    next: step,
    close: hide,
    /** How many steps are still to copy. */
    get pending() { return run ? run.parts.length + run.pictures.length - run.at - 1 : 0; },
  };
}
