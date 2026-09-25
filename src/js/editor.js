/** Simple contenteditable editor with debounced autosave. */
import { cleanTypingMarkers } from './inline-family.js';

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
    let html = el.innerHTML;
    if (el.querySelector('[data-format-caret]')) {
      const copy = el.cloneNode(true);
      cleanTypingMarkers(copy);
      html = copy.innerHTML;
    }
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
    get pending() { return timer !== null; },
    flush,
  };
}
