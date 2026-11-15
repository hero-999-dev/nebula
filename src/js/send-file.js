/**
 * A file of a note sent to another note (1.0.4) — and anything else in it: a
 * picture, a block, the words selected (`copyOf`).
 *
 * The owner: "a right-click on a file should have Send to…: the person picks a
 * note there and a copy goes to it; a black hole's notes are shown only while
 * it is open, to a locked one nothing can be sent."
 *
 * The copy is the one a pasted card gets (`media:adopt-file`): the file is
 * copied into the other note's folder — sealed when that note is in a black
 * hole — and a card for it is written at the end of that note. The note it
 * came from keeps its file. A locked black hole's notes are not in the store
 * at all, so they are never offered.
 */

import { t } from './i18n.js';
import { makeAttachBlock, isAttachUrl, shownName } from './file-attach.js';
import { serializeNote } from './note-markup.js';

/** How many notes the list shows at once; the field narrows it. */
const SHOWN = 40;

/**
 * The notes a file of `from` can be sent to, newest first: every note but
 * itself that is neither in the trash nor archived. A black hole's notes are
 * among them only while it is open — locked, the store does not hold them.
 * @param {{notes: object[]}} store
 * @param {string|null} from the open note
 * @param {string} [asked] what was typed in the field
 */
export function sendTargets(store, from, asked = '') {
  const want = String(asked ?? '').trim().toLowerCase();
  return store.notes
    .filter((n) => n && n.id !== from && !n.deletedAt && !n.archivedAt && typeof n.content === 'string')
    .filter((n) => !want || String(n.title || 'Untitled').toLowerCase().includes(want))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/**
 * The card as the other note's text holds it, with a line after it to go on with.
 * @param {string} url the copy's address in that note
 * @param {string} name
 * @param {string|number} [size]
 */
export function sentMarkup(url, name, size, doc = document) {
  return `${makeAttachBlock(url, shownName(name, url), size, doc).outerHTML}<p><br></p>`;
}

/** What stands on a line of its own in a note. */
const OWN_LINE = /^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|HR|FIGURE|TABLE|SECTION|DETAILS)$/;
/** Part of a table, cut out of it by a selection: no table without the rest. */
const OF_TABLE = ':scope > tr, :scope > td, :scope > th, :scope > tbody, :scope > thead, :scope > colgroup';
/** What a copy holds besides words. */
const NOT_WORDS = 'img, video, hr, table, .link-block, .note-image, .inline-eq';
/** The copies made here, told from what is in the note. */
const COPIES = new WeakSet();

/**
 * A copy of anything in a note as another note can hold it (1.0.4, the owner:
 * "Send to… on everything, not only files: pictures, blocks of text"): a
 * block, a picture, or the words selected, each on a line of its own and
 * without what only the screen draws. A list's item goes in a list of its
 * kind, a picture that floats goes into the text, words go in a line.
 * @param {Element|Range|null} what
 * @returns {HTMLElement} a holder outside the page, empty when there is nothing to send
 */
export function copyOf(what, doc = document) {
  const holder = doc.createElement('div');
  COPIES.add(holder);
  if (!what) return holder;
  if (what.nodeType === 1) {
    const el = what.cloneNode(true);
    if (el.tagName === 'LI' && what.parentElement) {
      const list = what.parentElement.cloneNode(false);
      list.append(el);
      holder.append(list);
    } else if (el.matches('.note-image') && what.closest('.shape-layer, .image-layer')) {
      // It floats over this note at a place of this note: in the other one it stands in the text.
      el.classList.add('note-image--inline');
      el.classList.remove('behind');
      for (const side of ['left', 'top', 'height']) el.style.removeProperty(side);
      if (!el.getAttribute('style')) el.removeAttribute('style');
      holder.append(el);
    } else if (OWN_LINE.test(el.tagName)) {
      holder.append(el);
    } else {
      const line = doc.createElement('p');
      line.append(el);
      holder.append(line);
    }
  } else if (typeof what.cloneContents === 'function') {
    holder.append(what.cloneContents());
    if (holder.querySelector(OF_TABLE)) {
      const words = holder.textContent.replace(/\s+/g, ' ').trim();
      holder.replaceChildren();
      if (words) holder.append(Object.assign(doc.createElement('p'), { textContent: words }));
    }
    const from = what.commonAncestorContainer;
    const listed = (from?.nodeType === 1 ? from : from?.parentElement)?.closest?.('ul, ol') ?? null;
    let loose = null;
    for (const node of [...holder.childNodes]) {
      const item = node.nodeType === 1 && node.tagName === 'LI';
      if (node.nodeType === 1 && OWN_LINE.test(node.tagName)) { loose = null; continue; }
      const kind = item ? (listed?.tagName ?? 'UL') : 'P';
      if (!loose || loose.tagName !== kind) {
        loose = item && listed ? listed.cloneNode(false) : doc.createElement(kind);
        node.before(loose);
      }
      loose.append(node);
    }
  }
  const clean = serializeNote(holder);
  if (clean !== holder.innerHTML) holder.innerHTML = clean;
  if (!holder.textContent.trim() && !holder.querySelector(NOT_WORDS)) holder.replaceChildren();
  return holder;
}

/**
 * @param {object} deps
 * @param {{notes: object[], get: Function, active: Function, updateNote: Function}} deps.store
 * @param {(text: string) => void} [deps.say]
 * @param {() => Promise<void>} [deps.saveCurrent] what is typed is saved first: the copy is made of the file on the disk
 */
export function initSendFile({ store, say = () => {}, saveCurrent = async () => {} } = {}) {
  let menu = null;
  const close = () => { menu?.remove(); menu = null; };

  /**
   * @param {Element|Range} what a file's card, a block, a picture, the words selected — or a copy already made of one
   * @param {string} id the note it goes to
   */
  async function send(what, id) {
    const media = window.nebula?.media;
    const target = store.get(id);
    const copy = COPIES.has(what) ? what : copyOf(what);
    const cards = [...copy.querySelectorAll('.link-attach')];
    // A file's card alone, as before: said of the file.
    const failed = cards.length === 1 && copy.children.length === 1 && copy.firstElementChild === cards[0] ? 'The file could not be sent' : 'The copy could not be sent';
    if (!target || target.id === store.active()?.id || !copy.childNodes.length
      || cards.some((card) => !isAttachUrl(card.dataset.src)) || (cards.length && !media?.adoptFile)) { say(failed); return false; }
    try { await saveCurrent(); } catch { say(failed); return false; }
    // Each file in it is copied into the other note — sealed there in a black hole — and its card names the copy.
    // (A picture or a video is copied by that note's save: note-media.js rehome.)
    for (const card of cards) {
      const res = await media.adoptFile(target.id, target.hole ?? null, card.dataset.src).catch(() => null);
      if (!res?.ok) { say(res?.error === 'locked' ? 'Open the black hole first' : failed); return false; }
      card.replaceWith(makeAttachBlock(res.url, shownName(card.dataset.name || 'file', res.url), card.dataset.size, copy.ownerDocument));
    }
    // Locked or deleted while the copy was made: nothing is written.
    const now = store.get(id);
    if (!now || now.deletedAt) { say(failed); return false; }
    // A picture of a black hole's note is held for as long as that black hole is open, and only named here
    // (electron/black-holes.js): the copy carries the picture itself, wherever it goes.
    let sent = copy.innerHTML;
    if (sent.includes('nebula-media://hole/') && media?.inline) sent = await media.inline(sent).catch(() => sent);
    store.updateNote(id, { content: `${now.content ?? ''}${sent}<p><br></p>` });
    say('A copy was sent to the note');
    return true;
  }

  /**
   * The list of notes, at that point of the window.
   * @param {Element|Range} what a file's card, a block, a picture, or the words selected
   */
  function open(what, x, y) {
    close();
    // Now: the words are no longer selected once the field has the caret.
    const card = copyOf(what);
    const from = store.active()?.id ?? null;
    menu = document.createElement('div');
    menu.className = 'float-menu link-menu send-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', t('Send a copy to a note'));
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'send-menu__q';
    field.placeholder = t('Send a copy to a note');
    field.setAttribute('aria-label', t('Send a copy to a note'));
    field.spellcheck = false;
    const list = document.createElement('div');
    list.className = 'send-menu__list';
    list.setAttribute('role', 'listbox');
    menu.append(field, list);
    let index = 0;
    let found = [];
    const draw = () => {
      found = sendTargets(store, from, field.value).slice(0, SHOWN);
      index = Math.min(index, Math.max(0, found.length - 1));
      list.replaceChildren();
      if (!found.length) {
        const none = document.createElement('div');
        none.className = 'send-menu__none';
        none.textContent = t('No note has that name');
        list.append(none);
        return;
      }
      found.forEach((note, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'option');
        b.dataset.noI18n = '';
        b.className = i === index ? 'sel' : '';
        b.textContent = note.title || t('Untitled');
        if (note.hole) b.classList.add('send-menu__hole');
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => { close(); void send(card, note.id); });
        list.append(b);
      });
      list.querySelector('button.sel')?.scrollIntoView?.({ block: 'nearest' });
    };
    field.addEventListener('input', () => { index = 0; draw(); });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (found.length) index = (index + (e.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length;
        draw();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const note = found[index];
        close();
        if (note) void send(card, note.id);
      }
    });
    document.body.append(menu);
    draw();
    const w = menu.offsetWidth || 300;
    const h = menu.offsetHeight || 260;
    menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - w - 6))}px`;
    menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - h - 6))}px`;
    field.focus({ preventScroll: true });
  }

  document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) close(); }, true);
  window.addEventListener('blur', close);

  return { open, close, send };
}
