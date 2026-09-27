/** Simple contenteditable editor with debounced autosave. */
import { serializeNote } from './note-markup.js';

const AUTOSAVE_MS = 400;

export function bindEditor(el, store, onSaveState) {
  let timer = null;
  let lastHtml = '';
  let noteId = null;

  function flush() {
    clearTimeout(timer);
    timer = null;
    // The buffer belongs to the note loaded here, even if a drawer action has
    // already changed the store's active note.
    const note = store.get(noteId);
    if (!note) return;
    // What the note is, not what is on screen: no selection, no shape being
    // typed in, no pending-format caret (note-markup.js).
    const html = serializeNote(el);
    // Nothing to write, but the indicator was told "saving" when the input came
    // in: say it is saved, or it stays on "Saving…" (0.8.7; an input event with
    // nothing changed is routine — selecting an image, clicking an arrow).
    if (html === lastHtml) { onSaveState?.('saved'); return; }
    store.updateNote(noteId, { content: html });
    lastHtml = html;
    onSaveState?.('saved');
  }

  function schedule() {
    onSaveState?.('saving');
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { flush(); }
      catch (err) { onSaveState?.('error', err); }
    }, AUTOSAVE_MS);
  }

  el.addEventListener('input', schedule);

  return {
    load(note) {
      clearTimeout(timer);
      timer = null;
      noteId = note?.id ?? null;
      const html = note?.content ?? '';
      lastHtml = html;
      el.innerHTML = html;
      el.contentEditable = String(!!note);
    },
    /**
     * The note as it now stands on screen is its starting point, not an edit.
     * Called once a note has been opened and brought up to this version; the
     * repaired markup is returned when it differs from what was stored, so it
     * can be written back as a repair. Before 0.9.1 the difference was saved by
     * the next flush as an EDIT — merely looking at an old note moved it to the
     * top of the list as "just now" — and never saved at all if nothing flushed.
     */
    adopt() {
      const html = serializeNote(el);
      const changed = html !== lastHtml;
      lastHtml = html;
      return changed ? html : null;
    },
    get pending() { return timer !== null; },
    flush,
  };
}
