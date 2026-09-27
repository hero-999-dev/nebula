/**
 * Live titles for link cards, and an honest "could not load" for embeds.
 *
 * An embed learns its title from its own webview. A bookmark asks the main
 * process for the page's <title> (electron/link-metadata.js), once per URL.
 * The hint under an embed is shown only when the page actually failed to load,
 * not up front as a guess.
 */

const bound = new WeakSet();
const titles = new Map();
const TITLE_CACHE_MAX = 100;

/** "https://www.example.com/a/" and "example.com/a" are the same address. */
const bareAddress = (s) => String(s ?? '').trim().toLowerCase()
  .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  .replace(/^www\./, '')
  .replace(/\/+$/, '');

/** Titles arrive HTML-escaped; a detached textarea decodes them as text. */
const decode = (raw) => {
  const box = document.createElement('textarea');
  box.innerHTML = String(raw);
  return box.value;
};

/**
 * Wire both freshly inserted cards and webviews parsed from an older note.
 *
 * `placeholder` is what a card shows before it has a title (its address). A
 * title is written only over that: a title already saved in the note is never
 * replaced, so opening a note does not change it — a YouTube player first
 * reports just "YouTube", and taking that turned a saved title into a new
 * edit that shifted undo and dropped redo (found by the long-note trials).
 */
export function bindLinkPreview(card, { onTitle, placeholder } = {}) {
  if (bound.has(card)) return;
  bound.add(card);

  const title = card.querySelector('.link-card__title');
  const untitled = () => {
    const now = title.textContent.trim();
    if (!now || placeholder === undefined || now === placeholder) return true;
    // A card an older version labelled with its address in another format
    // (scheme, www., a trailing slash) is still showing just the address.
    return bareAddress(now) === bareAddress(card.dataset.url);
  };
  // `onTitle(write)` decides how the title goes in (the editor folds it into
  // its history without making it an edit); without one it is simply written.
  const update = (raw) => {
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!text || !card.isConnected || !title || title.textContent === text || !untitled()) return;
    const write = () => { title.textContent = text; };
    if (onTitle) onTitle(write); else write();
  };

  const frame = card.querySelector('webview');
  if (frame) {
    let failed = false;
    let hint = card.querySelector('.link-embed-hint');
    if (!hint && !card.classList.contains('link-embed--video')) {
      hint = document.createElement('small');
      hint.className = 'link-embed-hint';
      card.append(hint);
    }
    if (hint) {
      hint.hidden = true;
      hint.textContent = 'This preview could not load. Open the link above in your browser.';
    }
    // Titles reported while the page is still loading are interim; the one
    // standing when it finishes is taken — and only from a page that came back
    // OK. An error page loads "successfully" as far as the webview is concerned,
    // and a card in the owner's Ideas note was named "Service unavailable".
    let loaded = false;
    let latest = '';
    let status = 0;
    frame.addEventListener('did-start-loading', () => {
      failed = false;
      loaded = false;
      if (hint) hint.hidden = true;
    });
    frame.addEventListener('did-navigate', (e) => { status = Number(e.httpResponseCode) || 0; });
    const pageOk = () => !failed && (status === 0 || (status >= 200 && status < 300));
    frame.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3 || e.isMainFrame === false) return; // aborted, or a sub-frame
      failed = true;
      if (hint) hint.hidden = false;
    });
    frame.addEventListener('did-finish-load', () => {
      loaded = true;
      if (hint && !failed) hint.hidden = true;
      if (latest && pageOk()) update(latest);
    });
    frame.addEventListener('page-title-updated', (e) => {
      latest = e.title;
      if (loaded && pageOk()) update(latest);
    });
  } else if (card.dataset.kind === 'bookmark' && window.nebula?.links?.title) {
    const url = card.dataset.url;
    if (!titles.has(url)) {
      if (titles.size >= TITLE_CACHE_MAX) titles.delete(titles.keys().next().value);
      titles.set(url, Promise.resolve()
        .then(() => window.nebula.links.title(url))
        .catch(() => ({ ok: false })));
    }
    void titles.get(url).then((result) => { if (result?.ok) update(decode(result.title)); });
  }
}
