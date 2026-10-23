/** Simple contenteditable editor with debounced autosave. */
import { serializeNote, hasTransient } from './note-markup.js';

const AUTOSAVE_MS = 400;

/**
 * The files a note's markup names — its pictures and videos, each a
 * `nebula-media://…` address (electron/note-media.js).
 *
 * What a note no longer names is deleted at the next start, from its folder
 * and from every backup; so a note must never be written without a file by
 * a fault. Two things are held to, and neither can be tripped by an edit:
 *
 *  - what is saved names every file the editor shows — the stored markup is
 *    the editor's own, less what is only on screen, and nothing on screen
 *    only is a picture;
 *  - what the app itself makes of a note on the way in (a repair, a repaint)
 *    names every file the note named before — only a person takes a picture
 *    out of a note.
 *
 * A note that fails either is not written: what is on the disk stays, the
 * banner says why, and opening the note again starts afresh.
 */
const NAMED = /nebula-media:\/\/[\w\-./~%]+/g;
export const namedIn = (html) => [...new Set(String(html ?? '').match(NAMED) ?? [])];
const lostFrom = (html, names) => names.filter((name) => !html.includes(name));

export function bindEditor(el, store, onSaveState) {
  let timer = null;
  let lastHtml = '';
  let noteId = null;
  /** Why this note is not written, once it is not: said again at every try, until it is opened again. */
  let refused = null;
  const refuse = (message) => {
    refused = new Error(message);
    onSaveState?.('error', refused);
    return false;
  };

  function flush() {
    clearTimeout(timer);
    timer = null;
    // The buffer belongs to the note loaded here, even if a drawer action has
    // already changed the store's active note.
    const note = store.get(noteId);
    if (!note) return;
    if (refused) { onSaveState?.('error', refused); return false; }
    // What the note is, not what is on screen: no selection, no shape being
    // typed in, no pending-format caret (note-markup.js).
    const html = serializeNote(el);
    // serializeNote clones only when something transient is on screen; when
    // it did not, what it returned IS the editor's own markup — the second,
    // whole-document read the lost-media check needs would be the same
    // string over again, a whole extra serialization of a large note per
    // save (perf, 2026-10-23). Only a clone can hold a picture that shows on
    // screen and is missing from what is saved.
    if (!!el.querySelector('[data-format-caret]') || hasTransient(el)) {
      // Every picture and video the editor shows is in what is written.
      const shown = el.innerHTML;
      if (html !== shown) {
        const lost = lostFrom(html, namedIn(shown));
        if (lost.length) return refuse(`The note would have been saved without ${lost.length} of the pictures or videos it shows, so nothing was written. Open the note again.`);
      }
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
    // A large note's save is a whole-document pass — serialize, stringify,
    // and inside a black hole a seal — so the pause before it grows with the
    // note (by its last-saved size): typing stays first, and the queue still
    // ends with the newest state (perf, 2026-10-23).
    const size = store.get(noteId)?.content?.length ?? 0;
    const wait = size > 200_000 ? 1500 : size > 50_000 ? 800 : AUTOSAVE_MS;
    timer = setTimeout(() => {
      try { flush(); }
      catch (err) { onSaveState?.('error', err); }
    }, wait);
  }

  el.addEventListener('input', schedule);

  return {
    load(note) {
      clearTimeout(timer);
      timer = null;
      noteId = note?.id ?? null;
      refused = null;
      const html = note?.content ?? '';
      lastHtml = html;
      el.innerHTML = html;
      el.contentEditable = String(!!note);
      // A note opened is a caret no key has moved yet (toolbar.js settleGap).
      el.dispatchEvent(new CustomEvent('nebula-note-load'));
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
      if (refused) return null;
      const html = serializeNote(el);
      // Whatever the app made of the note on the way in, it took no picture out of it.
      const lost = lostFrom(html, namedIn(lastHtml));
      if (lost.length) {
        refuse(`This note did not open whole — ${lost.length} of its pictures or videos are missing here — so nothing is written over it. Open the note again.`);
        return null;
      }
      const changed = html !== lastHtml;
      lastHtml = html;
      return changed ? html : null;
    },
    get pending() { return timer !== null; },
    /** Why this note is not being written, or null. */
    get refused() { return refused; },
    flush,
  };
}
