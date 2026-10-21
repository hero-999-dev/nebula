/**
 * Notes side by side (1.0.0). The owner: "birden fazla not acma olsun mesela
 * ekrani ikiye bölelim falan üce, sürükledigim not sayisina göre ekran esit
 * bölünsün, ai paneli ve editör ayni olsun, yukardaki header bölünsün" — a
 * note dragged from the list onto the page opens beside it, and the page is
 * shared out equally among them.
 *
 * There is still ONE editor: the editing bar, the AI panel, the page sizes and
 * everything bound to #editor stay as they are. The pane being written in
 * holds the real editor frame (and the title box, moved into its own head);
 * the others show their notes as they are saved, and a click on one opens the
 * editor there, the caret where the click was. So each pane has its own head
 * — its title, its page, a ✕ — and nothing about a note changes by being shown.
 *
 * "nw de ise sayfa ekledigim de nw formatinda gelsin": a note added while the
 * page in use is Nebula Wide is shown in Nebula Wide beside it. Only shown —
 * its own page is kept, and comes back when it leaves the split or when a
 * page size is chosen for it.
 */
import { pageMode } from './page-mode.js';

/** What a note row's drag carries (note-list.js). */
export const DRAG_TYPE = 'application/x-nebula-item';
/** Four side by side at most: more and a pane is narrower than a line of text. */
export const MAX_PANES = 4;
/**
 * The map as a pane (1.0.0): never written in, never a note — the one pane
 * that may stand alone ("the map over the whole page"), and the notes opened
 * from it come beside it. It counts toward MAX_PANES like any note.
 */
export const MAP = '@map';
const WIDTH_KEY = 'nebula:split-widths:';
const DIVIDER_WIDTH = 10;
const MIN_PANE = 240;

/** Keep a dragged boundary inside the room its two neighbours can share. */
export function pairWidths(left, right, move, minimum) {
  const room = left + right;
  const min = Math.min(minimum, room / 2);
  const next = Math.max(min, Math.min(room - min, left + move));
  return [next, room - next];
}

/**
 * Where a note let go over the panes goes: before or after the pane under the
 * pointer, by the half it was let go in. Pure — tested.
 * @param {{left: number, width: number}[]} rects the panes, left to right
 * @param {number} x
 * @returns {number} the index the new pane takes
 */
export function dropIndex(rects, x) {
  if (!rects.length) return 0;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x < r.left + r.width / 2) return i;
    if (x < r.left + r.width) return i + 1;
  }
  return rects.length;
}

/**
 * The panes after a note is added at `index`: the one already shown is not
 * shown twice, and no more than MAX_PANES. Pure — tested.
 * @returns {string[] | null} null when nothing changes
 */
export function withPane(panes, id, index, max = MAX_PANES) {
  if (!id || panes.includes(id) || panes.length >= max) return null;
  const at = Math.max(0, Math.min(index, panes.length));
  return [...panes.slice(0, at), id, ...panes.slice(at)];
}

export function initSplitView({ shell, frame, titleEl, store, openNote, translate = (x) => x, render = () => {}, onLayout = () => {}, say = () => {}, map = null }) {
  if (!shell || !frame || !titleEl) return null;
  const titleHome = { parent: titleEl.parentNode, next: titleEl.nextSibling };
  /** The notes side by side, left to right; empty when the page is not split. */
  let panes = [];
  /** Shown in Nebula Wide beside a Nebula Wide page, whatever their own page. */
  const wide = new Set();
  let row = null;
  const paneEls = new Map();
  let shownActive = null;
  let widths = [];
  let widthIds = '';
  const dividerEls = [];
  let layoutFrame = 0;

  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const alive = (id) => { if (id === MAP) return !!map; const n = store.get(id); return !!n && !n.deletedAt && !n.archivedAt; };
  /** The map alone over the whole page: a layout of one pane, which no note has. */
  const mapOnly = () => panes.length === 1 && panes[0] === MAP;
  /** The editor frame while no pane is written in (the map alone): kept, out of sight. */
  const park = el('div', 'split-park');
  park.hidden = true;
  /** The notes beside the map when it went over the whole page, to come back to. */
  let before = [];

  const equalWidths = (count) => Array(count).fill(1 / count);
  const readWidths = (count) => {
    try {
      const saved = JSON.parse(localStorage.getItem(WIDTH_KEY + count));
      if (Array.isArray(saved) && saved.length === count && saved.every((n) => Number.isFinite(n) && n > 0)) {
        const sum = saved.reduce((a, b) => a + b, 0);
        return saved.map((n) => n / sum);
      }
    } catch { /* equal widths still work without localStorage */ }
    return equalWidths(count);
  };
  const saveWidths = () => {
    try { localStorage.setItem(WIDTH_KEY + panes.length, JSON.stringify(widths)); } catch { /* this window keeps them */ }
  };
  const layoutChanged = () => {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      map?.resized?.();
      onLayout();
    });
  };
  function applyWidths() {
    panes.forEach((id, i) => {
      const pane = paneEls.get(id);
      if (pane) pane.style.flexGrow = String(widths[i]);
    });
  }
  function resetWidths() {
    widths = equalWidths(panes.length);
    widthIds = panes.join('\0');
    saveWidths();
    applyWidths();
  }
  function moveDivider(index, pixels, start = null) {
    if (!row || index < 0 || index >= panes.length - 1) return;
    const left = paneEls.get(panes[index]);
    const right = paneEls.get(panes[index + 1]);
    const total = row.clientWidth - (panes.length - 1) * DIVIDER_WIDTH;
    if (!left || !right || total <= 0) return;
    const a = start?.[0] ?? left.getBoundingClientRect().width;
    const b = start?.[1] ?? right.getBoundingClientRect().width;
    const minimum = Math.min(MIN_PANE, total / panes.length);
    const [nextA, nextB] = pairWidths(a, b, pixels, minimum);
    widths[index] = nextA / total;
    widths[index + 1] = nextB / total;
    applyWidths();
    layoutChanged();
  }
  function dividerAt(index) {
    if (dividerEls[index]) return dividerEls[index];
    const line = el('div', 'split-divider');
    line.tabIndex = 0;
    line.setAttribute('role', 'separator');
    line.setAttribute('aria-orientation', 'vertical');
    line.setAttribute('aria-label', translate('Resize panes'));
    line.title = translate('Drag to resize panes; double-click to make them equal');
    let drag = null;
    line.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const left = paneEls.get(panes[index]);
      const right = paneEls.get(panes[index + 1]);
      if (!left || !right) return;
      e.preventDefault();
      drag = { x: e.clientX, widths: [left.getBoundingClientRect().width, right.getBoundingClientRect().width] };
      line.setPointerCapture(e.pointerId);
      line.classList.add('dragging');
    });
    line.addEventListener('pointermove', (e) => { if (drag) moveDivider(index, e.clientX - drag.x, drag.widths); });
    const finish = () => { if (!drag) return; drag = null; line.classList.remove('dragging'); saveWidths(); };
    line.addEventListener('pointerup', finish);
    line.addEventListener('pointercancel', finish);
    line.addEventListener('dblclick', () => { resetWidths(); layoutChanged(); });
    line.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      moveDivider(index, e.key === 'ArrowLeft' ? -24 : 24);
      saveWidths();
    });
    dividerEls[index] = line;
    return line;
  }

  function mapPane() {
    const pane = el('section', 'split-pane split-map');
    pane.dataset.note = MAP;
    const head = el('div', 'split-head');
    const name = el('span', 'split-title split-map-title');
    const close = el('button', 'split-close');
    close.type = 'button';
    close.textContent = '✕';
    close.title = translate('Close Universe');
    close.setAttribute('aria-label', translate('Close Universe'));
    close.addEventListener('mousedown', (e) => e.preventDefault());
    close.addEventListener('click', (e) => { e.stopPropagation(); closePane(MAP); });
    head.append(name, close);
    pane.append(head, map.el);
    paneEls.set(MAP, pane);
    return pane;
  }

  function paneFor(id) {
    let pane = paneEls.get(id);
    if (pane) return pane;
    if (id === MAP) return mapPane();
    pane = el('section', 'split-pane');
    pane.dataset.note = id;
    const head = el('div', 'split-head');
    const name = el('button', 'split-title');
    name.type = 'button';
    name.setAttribute('data-no-i18n', '');
    const page = el('span', 'split-page');
    const close = el('button', 'split-close');
    close.type = 'button';
    close.textContent = '✕';
    close.title = translate('Close this side');
    close.setAttribute('aria-label', translate('Close this side'));
    close.addEventListener('mousedown', (e) => e.preventDefault());
    close.addEventListener('click', (e) => { e.stopPropagation(); closePane(id); });
    // The title of a pane not written in: a click opens it there, in its title.
    name.addEventListener('click', () => { if (id !== store.activeId) { openNote(id); titleEl.focus(); } });
    head.append(name, page, close);
    const ghostFrame = el('div', 'split-ghost-frame');
    const ghost = el('div', 'editor split-ghost');
    ghost.setAttribute('aria-readonly', 'true');
    ghostFrame.append(ghost);
    // A press on a pane shown as saved opens the editor there, the caret where it was pressed.
    ghostFrame.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const { clientX: x, clientY: y } = e;
      const scroll = ghost.scrollTop;
      openNote(id);
      requestAnimationFrame(() => {
        const editor = frame.querySelector('#editor');
        if (!editor) return;
        editor.scrollTop = scroll;
        editor.focus({ preventScroll: true });
        const range = document.caretRangeFromPoint?.(x, y);
        if (range && editor.contains(range.startContainer)) {
          const sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    });
    pane.append(head, ghostFrame);
    paneEls.set(id, pane);
    return pane;
  }

  /** What a pane shows of its page: the box's short name. */
  function paintHead(pane, id) {
    if (id === MAP) { pane.querySelector('.split-title').textContent = translate('Universe'); return; }
    const note = store.get(id);
    pane.querySelector('.split-title').textContent = note?.title || translate('Untitled');
    pane.querySelector('.split-page').textContent = pageMode(pageOf(id) ?? note?.page ?? 'nw').short;
  }

  function titleAtHome() {
    if (titleEl.parentNode === titleHome.parent) return;
    titleHome.parent.insertBefore(titleEl, titleHome.next?.parentNode === titleHome.parent ? titleHome.next : null);
  }

  function unsplit() {
    if (!row) return;
    const hadMap = paneEls.has(MAP);
    row.replaceWith(frame);
    titleAtHome();
    row = null;
    paneEls.clear();
    widths = equalWidths(panes.length);
    widthIds = panes.join('\0');
    document.body.classList.remove('split-on', 'map-full');
    if (hadMap) map?.hidden?.();
  }

  function draw() {
    if (panes.length < 2 && !mapOnly()) {
      const was = !!row;
      unsplit();
      if (was) onLayout();
      return;
    }
    const first = !row;
    if (!row) {
      row = el('div', 'split-row');
      frame.replaceWith(row);
      document.body.classList.add('split-on');
    }
    document.body.classList.toggle('map-full', mapOnly());
    const ids = panes.join('\0');
    if (ids !== widthIds) {
      widths = widthIds ? equalWidths(panes.length) : readWidths(panes.length);
      widthIds = ids;
      saveWidths();
    }
    const mapWas = paneEls.has(MAP);
    for (const [id, pane] of paneEls) if (!panes.includes(id)) { pane.remove(); paneEls.delete(id); }
    if (mapWas && !paneEls.has(MAP)) map?.hidden?.();
    // No pane is written in (the map alone): the editor waits out of sight, the title at home.
    if (!panes.includes(store.activeId)) {
      if (frame.parentNode !== park) park.append(frame);
      titleAtHome();
    }
    if (park.parentNode !== row) row.append(park);
    const moved = shownActive !== store.activeId;
    const ordered = [];
    panes.forEach((id, i) => {
      const pane = paneFor(id);
      ordered.push(pane);
      if (i < panes.length - 1) ordered.push(dividerAt(i));
      if (id === MAP) { paintHead(pane, id); return; }
      const active = id === store.activeId;
      pane.classList.toggle('active', active);
      const head = pane.querySelector('.split-head');
      const ghostFrame = pane.querySelector('.split-ghost-frame');
      if (active) {
        if (frame.parentNode !== pane) pane.append(frame);
        if (titleEl.parentNode !== head) head.prepend(titleEl);
        ghostFrame.hidden = true;
      } else {
        ghostFrame.hidden = false;
        const ghost = ghostFrame.firstChild;
        const html = store.get(id)?.content ?? '';
        if (ghost.dataset.html !== html || first || moved) {
          ghost.innerHTML = html;
          ghost.dataset.html = html;
          render(ghost, pageOf(id) ?? store.get(id)?.page ?? 'nw', store.get(id)?.title ?? '');
        }
      }
      paintHead(pane, id);
    });
    for (const child of [...row.children]) if (child !== park && !ordered.includes(child)) child.remove();
    ordered.forEach((child, i) => { if (row.children[i] !== child) row.insertBefore(child, row.children[i] ?? null); });
    if (row.lastElementChild !== park) row.append(park);
    applyWidths();
    shownActive = store.activeId;
    if (!mapWas && paneEls.has(MAP)) map?.shown?.();
    else if (paneEls.has(MAP)) map?.resized?.();
    if (first || moved) onLayout();
  }

  /**
   * After a note opened, or the list changed: notes gone from the list leave
   * their panes, and a note opened from the list takes the place of the one
   * being written in.
   */
  function sync() {
    if (!panes.length) return;
    const before = panes.join();
    panes = panes.filter(alive);
    for (const id of wide) if (!panes.includes(id)) wide.delete(id);
    const active = store.activeId;
    // The map alone: the note written in when it went over the page stays out
    // of sight; another note opened comes beside the map.
    const hidden = mapOnly() && active === shownActive;
    if (active && alive(active) && !panes.includes(active) && !hidden) {
      const at = panes.indexOf(shownActive);
      if (at >= 0) panes[at] = active; else panes.push(active);
      wide.delete(shownActive);
    }
    if (panes.length < 2 && !mapOnly()) { panes = []; wide.clear(); }
    if (before !== panes.join() || shownActive !== active || row) draw();
  }

  function add(id, index) {
    if (!alive(id)) return false;
    if (id === MAP) return addMap(index);
    const active = store.activeId;
    if (mapOnly()) {
      // From the map over the whole page: the note comes beside it.
      panes = withPane(panes, id, index ?? panes.length) ?? panes;
      openNote(id);
      draw();
      return true;
    }
    if (!active || !alive(active)) { openNote(id); return true; }
    if (id === active && panes.length < 2) return false;
    const current = panes.length ? panes : [active];
    if (current.includes(id)) { openNote(id); return true; }
    if (current.length >= MAX_PANES) { say(translate('At most four notes side by side')); return false; }
    // No place given: at the right of what is shown — the page alone counts as one.
    const next = withPane(current, id, index ?? current.length);
    if (!next) return false;
    panes = next;
    // Beside a Nebula Wide page, a note comes in Nebula Wide.
    const screen = pageOf(active) ?? store.get(active)?.page ?? 'nw';
    if (screen === 'nw' && (store.get(id)?.page ?? 'nw') !== 'nw') wide.add(id);
    openNote(id);
    draw();
    return true;
  }

  /** The map beside the notes — or, with no note open, over the whole page. */
  function addMap(index) {
    if (!map) return false;
    if (panes.includes(MAP)) return true;
    const active = store.activeId;
    const current = panes.length ? panes : (active && alive(active) ? [active] : []);
    if (current.length >= MAX_PANES) { say(translate('At most four notes side by side')); return false; }
    panes = withPane(current, MAP, index ?? current.length) ?? current;
    draw();
    return true;
  }

  /** The map over the whole page (on), or back beside the notes it was with. */
  function mapFull(on = !mapOnly()) {
    if (!map) return false;
    if (on) {
      if (mapOnly()) return true;
      before = panes.length ? [...panes] : (store.activeId && alive(store.activeId) ? [store.activeId] : []);
      panes = [MAP];
      shownActive = store.activeId;
      draw();
      onLayout();
      return true;
    }
    if (!mapOnly()) return false;
    // As it was: the map beside the notes if it stood there, or the notes alone.
    const back = before.filter(alive);
    before = [];
    const notes = back.filter((id) => id !== MAP);
    panes = notes.length && (back.includes(MAP) || notes.length > 1) ? back : [];
    draw();
    const open = notes.includes(store.activeId) ? store.activeId : notes[0];
    if (open) openNote(open);
    onLayout();
    return true;
  }

  function closePane(id) {
    const at = panes.indexOf(id);
    if (at < 0) return;
    const wasActive = id === store.activeId;
    panes.splice(at, 1);
    wide.delete(id);
    if (mapOnly()) {
      // The note beside the map closed: the map has the page.
      shownActive = store.activeId;
      draw();
      onLayout();
      return;
    }
    if (panes.length < 2) {
      const left = panes[0];
      panes = [];
      wide.clear();
      draw();
      // The one left is written in again, in its own page.
      if (left) openNote(left);
      else if (id === MAP && store.activeId) openNote(store.activeId);
      return;
    }
    if (wasActive) openNote(panes[Math.min(at, panes.length - 1)]);
    else draw();
  }

  /** The page a pane is shown in when it is not its own; null when it is. */
  function pageOf(id) { return wide.has(id) ? 'nw' : null; }
  /** A page size chosen for a note shown in Nebula Wide: from then on it is its own. */
  function choosePage(id) { if (wide.delete(id)) draw(); }

  // ---- a note dragged from the list onto the page -----------------------------
  const mark = el('div', 'split-drop');
  mark.hidden = true;
  document.body.append(mark);
  const isNoteDrag = (e) => [...(e.dataTransfer?.types || [])].includes(DRAG_TYPE);
  /** The panes as they stand, or the editor frame alone. */
  const targets = () => (row ? panes.map((id) => paneEls.get(id)).filter(Boolean) : [frame]);
  function where(e) {
    const els = targets();
    const rects = els.map((p) => p.getBoundingClientRect());
    const index = dropIndex(rects, e.clientX);
    // The mark: the half of the pane the new one will stand beside.
    const near = rects[Math.min(index, rects.length - 1)];
    const before = index < rects.length && e.clientX < near.left + near.width / 2;
    const r = before ? near : rects[Math.max(0, index - 1)];
    const left = before ? r.left : r.left + r.width / 2;
    return { index, box: { left, top: r.top, width: r.width / 2, height: r.height } };
  }
  function hideMark() { mark.hidden = true; }
  shell.addEventListener('dragover', (e) => {
    if (!isNoteDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!store.activeId && !panes.length) { e.dataTransfer.dropEffect = 'move'; hideMark(); return; }
    const full = (panes.length || 1) >= MAX_PANES;
    e.dataTransfer.dropEffect = full ? 'none' : 'move';
    if (full) { hideMark(); return; }
    const { box } = where(e);
    Object.assign(mark.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    mark.hidden = false;
  }, true);
  shell.addEventListener('dragleave', (e) => { if (!shell.contains(e.relatedTarget)) hideMark(); }, true);
  window.addEventListener('dragend', hideMark);
  shell.addEventListener('drop', (e) => {
    if (!isNoteDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    hideMark();
    const [kind, id] = String(e.dataTransfer.getData(DRAG_TYPE) || '').split(':');
    if (kind === 'map') { addMap(where(e).index); return; }
    if (kind !== 'note' || !id) return;
    add(id, where(e).index);
  }, true);

  return {
    add,
    close: closePane,
    sync,
    pageOf,
    choosePage,
    panes: () => [...panes],
    /** The map (1.0.0): beside the notes, over the whole page, and whether it is shown. */
    addMap,
    mapFull,
    mapShown: () => panes.includes(MAP),
    isMapFull: mapOnly,
    /** Beside the note being written in, at the right: the note menu's "Open side by side". */
    canAdd: (id) => alive(id) && id !== store.activeId && !panes.includes(id) && (mapOnly() || (panes.length || 1) < MAX_PANES),
  };
}
