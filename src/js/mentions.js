/**
 * @ and # inside a note (0.9.3, the owner's Ideas note: "mentioning notes in
 * the notes with @, and with # adding label points inside the note").
 *
 *   @  opens a list of the other notes, filtered as you type; the one picked
 *      becomes a chip, <a class="note-mention" data-note="id">@Title</a>, and
 *      a click on it opens that note.
 *   #word followed by a space (or Enter) becomes a label chip,
 *      <span class="note-tag" data-tag="word">#word</span>, and the note gets
 *      that label. A click on the chip shows the notes with that label.
 *
 * "#" only counts at the start of a line or after a space and before a letter,
 * so "C#", "#1" and a Markdown "# " heading are left alone.
 */

import { t } from './i18n.js';
import { fold } from './fold.js';

/**
 * The labels written in a note's text (#word chips), each once, in order.
 * Read from the stored markup, so a note never opened has them too. Pure — tested.
 */
const tagCache = new Map();
let tagCacheChars = 0;
/** The key is the note's whole markup, so a note being typed in is a new
 * entry on every save. The entries keep a character budget and leave one at
 * a time, oldest first: 200 stale versions of a long article used to stay in
 * memory until the cache was emptied wholesale — the GC pressure behind the
 * typing lag in large notes and low-memory machines (perf audit, 2026-10-23).
 * A note too big for the budget is scanned again rather than kept. */
const TAG_CACHE_CHARS = 250_000;
export function contentTags(html) {
  const src = String(html ?? '');
  if (!src.includes('note-tag')) return [];
  const hit = tagCache.get(src);
  if (hit) return hit;
  const seen = new Map();
  for (const m of src.matchAll(/<span\b[^>]*\bclass="[^"]*\bnote-tag\b[^"]*"[^>]*>/g)) {
    const tag = m[0].match(/\bdata-tag="([^"]+)"/)?.[1];
    if (tag && !seen.has(tag.toLocaleLowerCase())) seen.set(tag.toLocaleLowerCase(), tag.replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
  }
  const out = [...seen.values()];
  if (src.length > TAG_CACHE_CHARS) return out;
  while (tagCache.size && tagCacheChars + src.length > TAG_CACHE_CHARS) {
    const oldest = tagCache.keys().next().value;
    tagCacheChars -= oldest.length; tagCache.delete(oldest);
  }
  tagCache.set(src, out); tagCacheChars += src.length;
  return out;
}

/**
 * The notes a note's text @mentions (note-mention chips), each id once, in
 * order. Read from the stored markup like contentTags. Pure — tested.
 */
const mentionCache = new Map();
let mentionCacheChars = 0;
/** The same character budget as contentTags' — see there. */
const MENTION_CACHE_CHARS = 250_000;
export function contentMentions(html) {
  const src = String(html ?? '');
  if (!src.includes('note-mention')) return [];
  const hit = mentionCache.get(src);
  if (hit) return hit;
  const seen = new Set();
  for (const m of src.matchAll(/<a\b[^>]*\bclass="[^"]*\bnote-mention\b[^"]*"[^>]*>/g)) {
    const id = m[0].match(/\bdata-note="([^"]+)"/)?.[1];
    if (id) seen.add(id);
  }
  const out = [...seen];
  if (src.length > MENTION_CACHE_CHARS) return out;
  while (mentionCache.size && mentionCacheChars + src.length > MENTION_CACHE_CHARS) {
    const oldest = mentionCache.keys().next().value;
    mentionCacheChars -= oldest.length; mentionCache.delete(oldest);
  }
  mentionCache.set(src, out); mentionCacheChars += src.length;
  return out;
}

/**
 * Take the #chips of these labels out of a note's markup, in place: the chip
 * goes, and so does one of the two spaces it leaves side by side. Returns how
 * many went. Case does not matter. Pure DOM — tested.
 */
export function removeTagChips(root, labels) {
  const gone = new Set(labels.map((l) => String(l).toLocaleLowerCase()));
  let count = 0;
  for (const chip of [...root.querySelectorAll('span.note-tag')]) {
    if (!gone.has(String(chip.dataset.tag || chip.textContent.replace(/^#/, '')).toLocaleLowerCase())) continue;
    const next = chip.nextSibling;
    const prev = chip.previousSibling;
    chip.remove();
    if (next?.nodeType === 3 && /^[\s\u00a0]/.test(next.nodeValue) && (!prev || (prev.nodeType === 3 && /[\s\u00a0]$/.test(prev.nodeValue)))) {
      next.nodeValue = next.nodeValue.slice(1);
    }
    count += 1;
  }
  return count;
}

/** "@query" right before the caret. Pure — tested. */
export function detectMention(textBeforeCaret) {
  const m = String(textBeforeCaret).match(/(?:^|\s)@([^\s@]{0,40})$/u);
  return m ? { query: m[1], start: textBeforeCaret.length - m[1].length - 1 } : null;
}

/** "#word " just typed, the space included. Pure — tested. */
export function detectTag(textBeforeCaret) {
  const m = String(textBeforeCaret).match(/(?:^|\s)#(\p{L}[\p{L}\p{N}_-]{1,39})(\s)$/u);
  return m ? { tag: m[1], start: textBeforeCaret.length - m[1].length - 2, end: textBeforeCaret.length - 1 } : null;
}

/**
 * "#" or "#que" right before the caret, while it is still being typed (0.9.4:
 * the label list opens the way the / menu does). A digit first is not a label
 * ("#1"), so only nothing or a letter may follow the #. Pure — tested.
 */
export function detectTagQuery(textBeforeCaret) {
  const m = String(textBeforeCaret).match(/(?:^|\s)#((?:\p{L}[\p{L}\p{N}_-]{0,39})?)$/u);
  return m ? { query: m[1], start: textBeforeCaret.length - m[1].length - 1 } : null;
}

/**
 * The labels to offer for what has been typed after "#": those that begin with
 * it first, then those that hold it, each once whatever its case. Pure — tested.
 */
export function matchLabels(labels, query, { limit = 8 } = {}) {
  const q = fold(query);
  const seen = new Map();
  for (const l of labels) if (l && !seen.has(l.toLocaleLowerCase())) seen.set(l.toLocaleLowerCase(), l);
  const all = [...seen.values()].sort((a, b) => a.localeCompare(b));
  const starts = all.filter((l) => fold(l).startsWith(q));
  const holds = all.filter((l) => !fold(l).startsWith(q) && fold(l).includes(q));
  return [...starts, ...holds].slice(0, limit);
}

/**
 * A #chip is ordinary text, so its word can be edited — and its `data-tag`,
 * which is what the label list reads, stayed what it was first written as:
 * "#abc changed to #abd, then to #acb — abd is still among the labels" (the
 * owner, 0.9.4). Each chip's tag follows its word; a chip whose # was deleted
 * is words again. Returns how many chips changed. Pure DOM — tested.
 */
export function syncTagChips(root) {
  let changed = 0;
  for (const chip of [...root.querySelectorAll('span.note-tag')]) {
    const m = chip.textContent.match(/^#([^\s#]+)/u);
    if (!m) {
      while (chip.firstChild) chip.before(chip.firstChild);
      chip.remove();
      changed += 1;
    } else if (chip.dataset.tag !== m[1]) {
      chip.dataset.tag = m[1];
      changed += 1;
    }
  }
  return changed;
}

/** Notes whose title holds every word of the query. Pure — tested. */
export function matchNotes(notes, query, { exclude = null, limit = 8 } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return notes
    .filter((n) => n.id !== exclude && !n.deletedAt && !n.archivedAt)
    .filter((n) => { const title = fold(n.title || 'Untitled'); return words.every((w) => title.includes(w)); })
    .slice(0, limit);
}

/**
 * @param {HTMLElement} editorEl
 * @param {object} deps
 * @param {import('./notes.js').NoteStore} deps.store
 * @param {{push: () => void}} [deps.history]
 * @param {(id: string) => void} [deps.openNote]
 * @param {(label: string) => void} [deps.showLabel] filter the note list by a label
 * @param {() => boolean} [deps.isLocked]
 */
export function initMentions(editorEl, { store, history, openNote, showLabel, isLocked = () => false } = {}) {
  if (!editorEl || !store) return null;
  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  const menu = document.createElement('div');
  menu.id = 'mention-menu';
  menu.className = 'float-menu mention-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  document.body.append(menu);

  let ctx = null;          // { node, start, end }
  let items = [];
  let index = 0;
  /** What the list is offering: notes for "@", labels for "#" (0.9.4). */
  let mode = 'mention';

  const hide = () => { menu.hidden = true; ctx = null; };
  const outOfProse = (node) => !!node.parentElement?.closest('.code-src, .shape, .image-caption, .blk-code, .note-mention, a');

  function paint() {
    menu.replaceChildren();
    // A label list with nothing lit does not own Enter (toggles.js asks).
    menu.toggleAttribute('data-idle', mode === 'tag' && index < 0);
    if (!items.length) {
      const none = document.createElement('div');
      none.className = 'mention-none';
      none.textContent = t('No note has that name');
      menu.append(none);
      return;
    }
    items.forEach((item, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i === index ? 'sel' : '';
      b.setAttribute('role', 'option');
      b.dataset.noI18n = '';
      b.textContent = mode === 'tag' ? `#${item}` : `@${item.title || 'Untitled'}`;
      b.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
      menu.append(b);
    });
    menu.querySelector('button.sel')?.scrollIntoView({ block: 'nearest' });
  }

  /** Every label in use — by a title or in a text — in any note that is not in the trash. */
  function labelsInUse() {
    const out = [];
    for (const n of store.notes) {
      if (n.deletedAt) continue;
      for (const l of Array.isArray(n.labels) ? n.labels : []) if (typeof l === 'string') out.push(l.replace(/^#+/, '').trim());
      out.push(...contentTags(n.content));
    }
    // And the ones in the open note that have not been saved yet.
    for (const chip of editorEl.querySelectorAll('span.note-tag[data-tag]')) out.push(chip.dataset.tag);
    return out;
  }

  /** A label picked from the list: "#que" becomes that label's chip, a space after it. */
  function chooseLabel(label) {
    history?.push();
    const r = document.createRange();
    r.setStart(ctx.node, ctx.start);
    r.setEnd(ctx.node, ctx.end);
    r.deleteContents();
    const chip = document.createElement('span');
    chip.className = 'note-tag';
    chip.dataset.tag = label;
    chip.textContent = `#${label}`;
    // A space that holds its place, as a typed one at the end of a line does:
    // after an ordinary one the caret counts as standing in the chip, and the
    // next letter typed went into the label.
    const space = document.createTextNode(' ');
    r.insertNode(space);
    r.insertNode(chip);
    const caret = document.createRange();
    caret.setStart(space, 1);
    caret.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(caret);
    hide();
    dirty();
  }

  function position() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
    menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 260)}px`;
  }

  function choose(i) {
    const note = items[i];
    if (!note || !ctx?.node?.isConnected) { hide(); return; }
    if (mode === 'tag') { chooseLabel(note); return; }
    history?.push();
    const r = document.createRange();
    r.setStart(ctx.node, ctx.start);
    r.setEnd(ctx.node, ctx.end);
    r.deleteContents();
    const chip = document.createElement('a');
    chip.className = 'note-mention';
    chip.dataset.note = note.id;
    chip.href = `#note-${note.id}`;
    chip.contentEditable = 'false';
    chip.textContent = `@${note.title || 'Untitled'}`;
    const space = document.createTextNode(' ');
    r.insertNode(space);
    r.insertNode(chip);
    const caret = document.createRange();
    caret.setStart(space, 1);
    caret.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(caret);
    hide();
    dirty();
  }

  /** "#word " just typed: the word becomes a chip and the note's label. */
  function tagBeforeCaret(node, offset) {
    const hit = detectTag(node.nodeValue.slice(0, offset));
    if (!hit) return false;
    const id = store.activeId;
    if (!id) return false;
    history?.push();
    const r = document.createRange();
    r.setStart(node, hit.start);
    r.setEnd(node, hit.end);
    const words = r.extractContents();
    const chip = document.createElement('span');
    chip.className = 'note-tag';
    chip.dataset.tag = hit.tag;
    // Ordinary text, so the caret walks through it (as one piece the caret
    // could not stand on its line and got lost — the owner, 0.9.3). What kept
    // the next words out of it is below: typing at its edge, and Enter.
    chip.appendChild(words);
    r.insertNode(chip);
    // The caret after the space, outside the chip, so the next words are plain.
    const after = chip.nextSibling;
    const caret = document.createRange();
    if (after?.nodeType === Node.TEXT_NODE) caret.setStart(after, Math.min(1, after.nodeValue.length));
    else caret.setStartAfter(chip);
    caret.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(caret);
    // A label written in the text stays in the text: it is not one of the
    // note's own labels by its title (the owner, 0.9.3). The list's label
    // filter finds notes by either kind.
    dirty();
    return true;
  }

  /** The #chip the caret is in, and whether it stands at its start or end. */
  function chipEdge() {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    const host = r.startContainer.nodeType === Node.ELEMENT_NODE ? r.startContainer : r.startContainer.parentElement;
    const chip = host?.closest?.('span.note-tag');
    if (!chip) {
      // Right behind a chip, with the caret counted in what follows it: the
      // same place to the eye as the chip's end.
      const c = r.startContainer;
      const prev = c.nodeType === Node.TEXT_NODE
        ? (r.startOffset === 0 ? c.previousSibling : null)
        : c.childNodes[r.startOffset - 1];
      if (prev?.nodeType === Node.ELEMENT_NODE && prev.matches('span.note-tag') && editorEl.contains(prev)) {
        return { chip: prev, start: false, end: true, sel };
      }
      return null;
    }
    if (!editorEl.contains(chip)) return null;
    const before = document.createRange();
    before.selectNodeContents(chip);
    before.setEnd(r.startContainer, r.startOffset);
    const at = before.toString().length;
    const len = chip.textContent.length;
    return { chip, start: at === 0, end: at >= len, sel };
  }

  // What is typed at a chip's edge. Before its # it is never part of it. At
  // its END, a space or a mark ends the label — a word written after "#errands "
  // is a word — but letters and digits typed straight on are the label's own:
  // until 0.9.4 they were put outside it, so a label could be shortened and
  // never lengthened again ("I changed #abc to #ace; only #ac was left, the e
  // was not part of it" — the owner). The chip's tag follows (syncTagChips).
  editorEl.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertText' || !e.data || e.isComposing || isLocked()) return;
    const edge = chipEdge();
    if (!edge || (!edge.start && !edge.end)) return;
    if (edge.end && !edge.start && /^[\p{L}\p{N}_-]+$/u.test(e.data)) {
      // Into the chip's own text, whatever node the caret was counted in.
      e.preventDefault();
      history?.typed?.();
      let last = edge.chip.lastChild;
      if (last?.nodeType !== Node.TEXT_NODE) { last = document.createTextNode(''); edge.chip.appendChild(last); }
      last.appendData(e.data);
      const r = document.createRange();
      r.setStart(last, last.nodeValue.length);
      r.collapse(true);
      edge.sel.removeAllRanges();
      edge.sel.addRange(r);
      dirty();
      return;
    }
    e.preventDefault();
    history?.typed?.();
    const text = document.createTextNode(e.data);
    if (edge.end) edge.chip.after(text); else edge.chip.before(text);
    const r = document.createRange();
    r.setStart(text, text.nodeValue.length);
    r.collapse(true);
    edge.sel.removeAllRanges();
    edge.sel.addRange(r);
    dirty();
  }, true);

  // Enter at the end of a line with a chip: Chromium starts the new line inside
  // a copy of the chip, and every tag typed there nested in it (the owner's
  // note held #label6 in #label5 in #label4). The copy is taken off again.
  editorEl.addEventListener('input', (e) => {
    if (e.inputType !== 'insertParagraph') return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const r = sel.getRangeAt(0);
    const keep = [r.startContainer, r.startOffset];
    let moved = false;
    for (let el = keep[0].nodeType === Node.ELEMENT_NODE ? keep[0] : keep[0].parentElement; el && el !== editorEl; el = el.parentElement) {
      if (!el.matches?.('span.note-tag')) continue;
      const chip = el;
      el = chip.parentElement;
      while (chip.firstChild) chip.before(chip.firstChild);
      chip.remove();
      moved = true;
      if (!el) break;
    }
    if (!moved) return;
    try {
      const back = document.createRange();
      back.setStart(keep[0], Math.min(keep[1], keep[0].nodeType === Node.TEXT_NODE ? keep[0].nodeValue.length : keep[0].childNodes.length));
      back.collapse(true);
      sel.removeAllRanges();
      sel.addRange(back);
    } catch { /* the caret's node went with the copy */ }
  });

  editorEl.addEventListener('input', (e) => {
    if (isLocked()) return hide();
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return hide();
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !editorEl.contains(node) || outOfProse(node)) return hide();
    const before = node.nodeValue.slice(0, sel.anchorOffset);
    if (e.inputType === 'insertText' && /\s$/.test(before) && tagBeforeCaret(node, sel.anchorOffset)) return hide();
    // "#" and the start of a label: the labels already in use, to pick from
    // (0.9.4, the owner: "like the / menu — if the label exists, let me choose
    // it"). Nothing is lit unless what was typed IS a label, so Enter and Space
    // still make the label exactly as typed; ↓ or Tab step into the list.
    const tag = node.parentElement?.closest('span.note-tag') ? null : detectTagQuery(before);
    if (tag) {
      const found = matchLabels(labelsInUse(), tag.query);
      if (!found.length) return hide();
      mode = 'tag';
      ctx = { node, start: tag.start, end: sel.anchorOffset };
      items = found;
      index = found.findIndex((l) => l.toLocaleLowerCase() === tag.query.toLocaleLowerCase());
      paint();
      menu.hidden = false;
      position();
      return;
    }
    const hit = detectMention(before);
    if (!hit) return hide();
    mode = 'mention';
    ctx = { node, start: hit.start, end: sel.anchorOffset };
    items = matchNotes(store.sorted(), hit.query, { exclude: store.activeId });
    index = 0;
    paint();
    menu.hidden = false;
    position();
  });

  // A chip's label follows its word as the word is edited (syncTagChips).
  editorEl.addEventListener('input', () => {
    if (isLocked() || !editorEl.querySelector('span.note-tag')) return;
    syncTagChips(editorEl);
  });

  editorEl.addEventListener('keydown', (e) => {
    // Enter after "#word" is a tag too, like the space — also with the label
    // list open and nothing lit in it: the label is made exactly as typed.
    const idleLabels = !menu.hidden && mode === 'tag' && index < 0;
    if (e.key === 'Enter' && (menu.hidden || idleLabels) && !e.shiftKey && !isLocked()) {
      if (idleLabels) hide();
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      if (sel?.isCollapsed && node?.nodeType === Node.TEXT_NODE && !outOfProse(node)) {
        const before = node.nodeValue.slice(0, sel.anchorOffset);
        if (/(?:^|\s)#\p{L}[\p{L}\p{N}_-]{1,39}$/u.test(before)) {
          node.insertData(sel.anchorOffset, ' ');
          const r = document.createRange();
          r.setStart(node, before.length + 1);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          tagBeforeCaret(node, before.length + 1);
        }
      }
      return;
    }
    if (menu.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (items.length) {
        // From "nothing lit" (a label list), ↓ lights the first and ↑ the last.
        index = index < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1)
          : (index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      }
      paint();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (!items.length) { hide(); return; }
      // (A label list with nothing lit never gets here on Enter — see above;
      // Tab takes the first label offered.)
      e.preventDefault();
      e.stopImmediatePropagation();
      choose(Math.max(0, index));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  }, true);

  // A mention opens its note; a label chip shows the notes with that label.
  editorEl.addEventListener('click', (e) => {
    const mention = e.target.closest?.('.note-mention');
    if (mention && editorEl.contains(mention)) {
      e.preventDefault();
      const id = mention.dataset.note;
      if (id && store.get(id) && !store.get(id).deletedAt) openNote?.(id);
      else window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'No note has that name' }));
      return;
    }
    const tag = e.target.closest?.('.note-tag');
    if (tag && editorEl.contains(tag) && tag.dataset.tag) showLabel?.(tag.dataset.tag);
  });

  document.addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target)) hide(); });
  editorEl.addEventListener('blur', () => setTimeout(() => { if (!menu.contains(document.activeElement)) hide(); }, 0));

  return { hide };
}

/**
 * Mentions written into notes keep a name; a renamed note is shown under its
 * name now. Called when a note opens. Returns how many chips changed.
 */
export function refreshMentions(root, store) {
  let changed = 0;
  for (const a of root.querySelectorAll('a.note-mention[data-note]')) {
    if (a.getAttribute('contenteditable') !== 'false') { a.setAttribute('contenteditable', 'false'); changed += 1; }
    const note = store?.get(a.dataset.note);
    if (!note || note.deletedAt) { a.classList.add('is-missing'); continue; }
    a.classList.remove('is-missing');
    const want = `@${note.title || 'Untitled'}`;
    if (a.textContent !== want) { a.textContent = want; changed += 1; }
  }
  return changed;
}
