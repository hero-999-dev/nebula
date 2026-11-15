/**
 * Tabs over the note (1.0.4). The owner: "notlarin üstünde sekmeler olmasi
 * gerekiyor tam not basliginin altindaki cizgi ile birlesik sekmeler, soldan
 * notu sürükleyip sekme ekleyebilecegiz, o sekmeleri alip ana alana sürükleyip
 * birden fazla ekran acabilecegiz, yukardaki sekmeler ama o sürüklemeyle yok
 * olmayacak sadece acilacak … kullanici mentiona mouse ile tiklayinca yukarda
 * yeni sekme acilacak, kullanici sonra isterse ona gecebilecek".
 *
 * The tabs stand on the line under the title. A tab is a note kept at hand,
 * nothing more: a click opens it where the writing is, a ✕ lets it go, and
 * nothing about a note changes by having one. They come from a note dragged
 * from the list onto the line, from a mention clicked in the text, and from
 * the note menu's "Open in a tab" — none of the three leaves the note being
 * written in. The first tab made brings that note along as a tab too, and one
 * tab alone says nothing, so the line is bare again when one is left.
 *
 * A note opened any other way (a click in the list, the map, a new note) takes
 * the tab being written in, as it takes the pane in split-view.js. A tab
 * dragged onto the page opens beside it there — what it carries is what a row
 * of the list carries — and stays a tab.
 */
import { DRAG_TYPE, dropIndex } from './split-view.js';
import { on } from './bus.js';

/** Beside DRAG_TYPE on a dragged tab: let go on the line, it is moved, not added. */
export const TAB_TYPE = 'application/x-nebula-tab';
const KEY = 'nebula:tabs';
/** How long a tab that came without being gone to is lit. */
const LIT_MS = 1400;

/**
 * The tabs with a note added: at `index`, or with none given right after the
 * one being written in. With no tabs yet, that one is the first of them.
 * Pure — tested.
 * @returns {string[] | null} null when nothing changes
 */
export function withTab(tabs, id, index = null, active = null) {
  if (!id || tabs.includes(id)) return null;
  const base = tabs.length ? tabs : (active && active !== id ? [active] : []);
  if (!base.length) return null;
  const after = base.indexOf(active);
  const at = index == null ? (after >= 0 ? after + 1 : base.length) : Math.max(0, Math.min(index, base.length));
  return [...base.slice(0, at), id, ...base.slice(at)];
}

/** The tabs with one moved to `index`, counted among the tabs as they stand. Pure — tested. */
export function movedTab(tabs, id, index) {
  const from = tabs.indexOf(id);
  if (from < 0) return tabs;
  const at = Math.max(0, Math.min(index, tabs.length));
  const to = at > from ? at - 1 : at;
  if (to === from) return tabs;
  const rest = tabs.filter((t) => t !== id);
  return [...rest.slice(0, to), id, ...rest.slice(to)];
}

/**
 * The tabs after the list changed or a note opened: notes gone from the list
 * leave, and a note opened that has no tab takes the one that was written in
 * (`was`) — its place, if that note is gone; the place after it, if that note
 * is still shown beside (`beside`, a pane of split-view.js clicked in). Fewer
 * than two are none. Pure — tested.
 */
export function tabsAfter(tabs, active, was, alive = () => true, beside = () => false) {
  if (!tabs.length) return tabs;
  const at = tabs.indexOf(was);
  const next = tabs.filter((id) => alive(id));
  if (active && alive(active) && !next.includes(active)) {
    const i = next.indexOf(was);
    if (i >= 0 && !beside(was)) next[i] = active;
    else if (i >= 0) next.splice(i + 1, 0, active);
    else next.splice(at >= 0 ? Math.min(at, next.length) : next.length, 0, active);
  }
  return next.length < 2 ? [] : next;
}

/**
 * Where the tab a note in the air would be is shown, counted among the other
 * tabs — its own left out, when it is a tab being moved: that one gives its
 * room to the preview. Null when nothing would come: a row of the list whose
 * note has its tab already, the note written in over the bare line.
 * Pure — tested.
 */
export function previewAt(tabs, id, index, active = null, moving = false) {
  const at = Math.max(0, Math.min(index, tabs.filter((t) => t !== id).length));
  if (tabs.includes(id)) return moving ? at : null;
  return withTab(tabs, id, index, active) ? at : null;
}

/** The tab `step` places from the one written in, round the ends. Pure — tested. */
export function stepTab(tabs, active, step) {
  if (tabs.length < 2) return null;
  const at = tabs.indexOf(active);
  if (at < 0) return tabs[step > 0 ? 0 : tabs.length - 1];
  return tabs[(at + step + tabs.length) % tabs.length];
}

export function initNoteTabs({ strip, store, openNote, titleEl = null, panes = () => [], closePane = () => {}, translate = (x) => x }) {
  if (!strip || !store) return null;
  const alive = (id) => { const n = store.get(id); return !!n && !n.deletedAt && !n.archivedAt; };
  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(saved) ? [...new Set(saved.filter((id) => typeof id === 'string' && id))] : [];
    } catch { return []; }
  };
  const save = () => {
    try { if (tabs.length) localStorage.setItem(KEY, JSON.stringify(tabs)); else localStorage.removeItem(KEY); } catch { /* this window keeps them */ }
  };

  /** The notes kept at hand, left to right; empty when the line is bare. */
  let tabs = read();
  /** The note written in when the tabs were last looked at. */
  let shown = store.activeId;
  /** A note is being dragged: the bare line shows where a tab would come. */
  let offering = false;
  const tabEls = new Map();
  const lit = new Map();

  strip.setAttribute('role', 'tablist');
  // The tab a note in the air would be, standing where it would come (the owner,
  // of the line that marked the place before: "sadece cizgi degilde sekme
  // önizlemesi seklinde olsun"). In the line only while the pointer is over it.
  const ghost = document.createElement('div');
  ghost.className = 'note-tab-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('data-no-i18n', '');
  ghost.append(Object.assign(document.createElement('span'), { className: 'nt-name' }));
  /** Its place among the tabs; null: not shown. */
  let ghostAt = null;

  const nameOf = (id) => store.get(id)?.title || translate('Untitled');

  function tabFor(id) {
    let tab = tabEls.get(id);
    if (tab) return tab;
    tab = document.createElement('div');
    tab.className = 'note-tab';
    tab.dataset.note = id;
    tab.draggable = true;
    tab.tabIndex = 0;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('data-no-i18n', '');
    const name = document.createElement('span');
    name.className = 'nt-name';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'nt-close';
    close.textContent = '✕';
    close.tabIndex = -1;
    close.title = translate('Close this tab');
    close.setAttribute('aria-label', translate('Close this tab'));
    // The caret stays in the note while a tab is let go.
    close.addEventListener('mousedown', (e) => e.preventDefault());
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });
    tab.addEventListener('click', () => { if (id !== store.activeId) openNote(id); });
    // The wheel pressed lets a tab go, as in a browser.
    tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(id); } });
    tab.addEventListener('keydown', (e) => {
      if (e.target !== tab) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (id !== store.activeId) openNote(id); }
      else if (e.key === 'Delete') { e.preventDefault(); closeTab(id); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const to = tabEls.get(tabs[tabs.indexOf(id) + (e.key === 'ArrowLeft' ? -1 : 1)]);
        if (to) { e.preventDefault(); to.focus(); }
      }
    });
    tab.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData(DRAG_TYPE, `note:${id}`);
      e.dataTransfer.setData(TAB_TYPE, id);
      e.dataTransfer.setData('text/plain', nameOf(id));
      e.dataTransfer.effectAllowed = 'move';
    });
    tab.append(name, close);
    tabEls.set(id, tab);
    return tab;
  }

  function draw() {
    const bare = !tabs.length;
    strip.hidden = bare && !offering;
    strip.classList.toggle('note-tabs--offer', bare && offering);
    if (bare && offering) strip.dataset.hint = translate('Drop a note here to keep it as a tab');
    else delete strip.dataset.hint;
    for (const [id, tab] of tabEls) if (!tabs.includes(id)) { tab.remove(); tabEls.delete(id); }
    const beside = new Set(panes());
    // Out of the way while the tabs are put in order, then back in its place.
    ghost.remove();
    tabs.forEach((id, i) => {
      const tab = tabFor(id);
      const active = id === store.activeId;
      const title = nameOf(id);
      tab.firstChild.textContent = title;
      tab.title = title;
      // Said again each time: a tab is not translated with the page (its name is the note's).
      tab.lastChild.title = translate('Close this tab');
      tab.lastChild.setAttribute('aria-label', tab.lastChild.title);
      tab.classList.toggle('active', active);
      // Shown beside the one written in (split-view.js).
      tab.classList.toggle('beside', !active && beside.has(id));
      tab.classList.toggle('lit', lit.has(id));
      tab.setAttribute('aria-selected', String(active));
      if (strip.children[i] !== tab) strip.insertBefore(tab, strip.children[i] ?? null);
    });
    placeGhost();
  }

  /** The tabs a note in the air is placed among: all but its own, when it is a tab. */
  const others = () => (dragged?.tab ? tabs.filter((id) => id !== dragged.id) : tabs);
  function placeGhost() {
    // A tab being moved gives its room to its preview, so the line is no longer
    // for it; off the line it is back where it was — it does not go with the drag.
    const own = dragged?.tab ? tabEls.get(dragged.id) : null;
    if (ghostAt == null || !dragged) { ghost.remove(); own?.classList.remove('away'); return; }
    ghost.firstChild.textContent = nameOf(dragged.id);
    strip.insertBefore(ghost, tabEls.get(others()[ghostAt]) ?? null);
    own?.classList.add('away');
  }
  function preview(at) {
    if (at === ghostAt) return;
    ghostAt = at;
    placeGhost();
  }

  /** After a note opened, or the list changed (main.js calls it beside split-view's). */
  function sync() {
    const before = tabs.join('\0');
    const beside = panes();
    tabs = tabsAfter(tabs, store.activeId, shown, alive, (id) => beside.includes(id));
    shown = store.activeId;
    if (before !== tabs.join('\0')) save();
    draw();
  }

  /** Lit for a moment: it came, and the page did not go to it. */
  function light(id) {
    clearTimeout(lit.get(id));
    lit.set(id, setTimeout(() => { lit.delete(id); tabEls.get(id)?.classList.remove('lit'); }, LIT_MS));
    const tab = tabEls.get(id);
    tab?.classList.add('lit');
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * A note kept as a tab without being gone to: a mention clicked, a row let
   * go on the line, the note menu. With no note open there is nothing to stay
   * in, and the note opens.
   */
  function add(id, index = null) {
    if (!alive(id)) return false;
    const active = store.activeId;
    if (!active || !alive(active)) { openNote(id); return true; }
    const next = withTab(tabs, id, index, active);
    if (next) { tabs = next; shown = active; save(); draw(); }
    if (id !== active && tabs.includes(id)) light(id);
    return !!next;
  }

  function closeTab(id) {
    const at = tabs.indexOf(id);
    if (at < 0) return;
    const next = tabs[at + 1] ?? tabs[at - 1] ?? null;
    tabs = tabs.filter((t) => t !== id);
    save();
    // Shown beside the others: its pane goes with its tab.
    if (panes().includes(id)) closePane(id);
    if (store.activeId === id && next) openNote(next);
    else sync();
  }

  // ---- a note, or a tab, dragged over the line -----------------------------------
  /** What is being dragged, read where the drag starts: only then can its kind be told. */
  let dragged = null;
  document.addEventListener('dragstart', (e) => {
    const [kind, id] = String(e.dataTransfer?.getData(DRAG_TYPE) || '').split(':');
    if (kind !== 'note' || !id) { dragged = null; return; }
    dragged = { id, tab: [...(e.dataTransfer.types || [])].includes(TAB_TYPE) };
    // A frame later: nothing moves under the pointer in the turn the drag starts.
    requestAnimationFrame(() => {
      if (!dragged) return;
      // Its own tab fades: the picture carried by the pointer was taken before this.
      if (dragged.tab) tabEls.get(dragged.id)?.classList.add('moving');
      if (!offering) { offering = true; draw(); }
    });
  });
  const dragOver = () => {
    dragged = null;
    ghostAt = null;
    ghost.remove();
    for (const tab of tabEls.values()) tab.classList.remove('moving', 'away');
    if (offering) { offering = false; draw(); }
  };
  window.addEventListener('dragend', dragOver);
  // Seen on its way down, a turn later: a row let go on the page is drawn again
  // by the list, and the end of its drag is told to a row no longer there.
  window.addEventListener('drop', () => setTimeout(dragOver, 0), true);

  const rects = () => others().map((id) => tabEls.get(id)?.getBoundingClientRect()).filter(Boolean);
  strip.addEventListener('dragover', (e) => {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    // Counted among the other tabs alone, the preview left out: standing in the line
    // it pushes them aside, and the place it shows must not move for that.
    preview(alive(dragged.id) ? previewAt(tabs, dragged.id, dropIndex(rects(), e.clientX), store.activeId, dragged.tab) : null);
  });
  // Left for good, not for one of its own tabs: told by where the pointer is, since the leave names no next target.
  strip.addEventListener('dragleave', (e) => {
    const r = strip.getBoundingClientRect();
    if (e.clientX <= r.left || e.clientX >= r.right || e.clientY <= r.top || e.clientY >= r.bottom) preview(null);
  });
  strip.addEventListener('drop', (e) => {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
    const { id, tab } = dragged;
    const index = dropIndex(rects(), e.clientX);
    dragOver();
    if (tab && tabs.includes(id)) {
      // Counted without itself, where the preview stood; movedTab counts it in.
      const next = movedTab(tabs, id, index > tabs.indexOf(id) ? index + 1 : index);
      if (next !== tabs) { tabs = next; save(); draw(); }
    } else add(id, index);
  });

  // Ctrl+Tab and Ctrl+Shift+Tab: the next tab and the one before, as in a browser.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !e.ctrlKey || e.altKey || e.metaKey) return;
    const to = stepTab(tabs, store.activeId, e.shiftKey ? -1 : 1);
    if (!to) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openNote(to);
  }, true);

  // A tab is named as its note is — while the title is typed, too.
  on('note-changed', ({ contentOnly } = {}) => { if (tabs.length && !contentOnly) draw(); });
  titleEl?.addEventListener('input', () => {
    const tab = tabEls.get(store.activeId);
    if (tab) { tab.firstChild.textContent = titleEl.value || translate('Untitled'); tab.title = tab.firstChild.textContent; }
  });

  draw();
  return {
    add,
    close: closeTab,
    sync,
    /** Drawn again: the panes beside the note changed. */
    paint: draw,
    tabs: () => [...tabs],
    /** The note menu's "Open in a tab": for a note that has none and is not the one written in. */
    canAdd: (id) => alive(id) && id !== store.activeId && !tabs.includes(id) && !!store.activeId && alive(store.activeId),
  };
}
