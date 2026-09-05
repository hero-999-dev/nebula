/** Simple contenteditable editor with debounced autosave. */

const AUTOSAVE_MS = 400;

export function bindEditor(el, store, onSaveState) {
  let timer = null;
  let lastHtml = '';

  function flush() {
    const note = store.active();
    if (!note) return;
    const html = el.innerHTML;
    if (html === lastHtml) return;
    lastHtml = html;
    store.updateActive({ content: html });
    onSaveState?.('saved');
  }

  function schedule() {
    onSaveState?.('saving');
    clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_MS);
  }

  el.addEventListener('input', schedule);

  return {
    load(note) {
      clearTimeout(timer);
      const html = note?.content ?? '';
      lastHtml = html;
      el.innerHTML = html;
    },
    flush,
  };
}
