/**
 * The note list with folders, and dragging notes and folders about in it (0.9.3).
 *
 * The owner's Ideas note: "notes can be dragged — into folders; a click on a
 * folder shows the notes in it; folders can be named; notes can be pinned
 * inside a folder" and "the order of the notes can be dragged too, the pinned
 * ones among themselves as well"; then "the folder is always at the top once
 * it is made" and "moving a note must not pin it".
 *
 * Drawn as: pinned notes, then the folders and the other notes together, each
 * where it stands (open folders with their notes under them, pinned first).
 * Every run that can be ordered is a sequence (`data-seq`): "p" the pinned
 * notes, "r" the folders and notes of the list, "f:<folder>:p" and
 * "f:<folder>:r" the two runs inside a folder. A note is dropped between two
 * items, onto a folder (to the top of it) or below everything (to the end); a
 * folder is dropped between the items of "r". Dragging never pins or unpins:
 * a pinned note let go among unpinned ones goes to the end of its own pinned
 * run, an unpinned one let go among pinned ones to the start of its run.
 *
 * When the list is filtered (words or a label) it is one flat list of what
 * matches, as before; folders are for browsing.
 */

import { icon } from './icons.js';
import { t } from './i18n.js';
import { askText } from './dialog.js';
import { listGroups } from './folders.js';
import { sortKey } from './notes.js';

const DRAG_TYPE = 'application/x-nebula-item';

/** "f:<id>:p" -> { folder: id, pinned: true }; "p" / "r" are the list itself. */
export function parseGroup(key) {
  if (key === 'p') return { folder: null, pinned: true };
  if (key === 'r') return { folder: null, pinned: false };
  const m = /^f:(.+):([pr])$/.exec(String(key || ''));
  return m ? { folder: m[1], pinned: m[2] === 'p' } : null;
}

export function groupKey(folder, pinned) {
  return folder ? `f:${folder}:${pinned ? 'p' : 'r'}` : (pinned ? 'p' : 'r');
}

/**
 * The place for the item at `at` in a run shown newest-first, from the keys
 * of its neighbours (`keys[at]`, its old key, is not used). With no room
 * between them the whole run is numbered afresh, a second apart.
 * @returns {{order: number} | {renumber: number[]}}
 */
export function orderFor(keys, at) {
  const above = at > 0 ? keys[at - 1] : null;
  const below = at < keys.length - 1 ? keys[at + 1] : null;
  let order;
  if (above !== null && below !== null) order = (above + below) / 2;
  else if (above !== null) order = above - 1;
  else if (below !== null) order = below + 1;
  else return { order: keys[at] };
  const cramped = (above !== null && !(order < above)) || (below !== null && !(order > below));
  if (!cramped) return { order };
  const top = Math.max(...keys.filter(Number.isFinite));
  return { renumber: keys.map((_, i) => top - i * 1000) };
}

/**
 * Where a dragged note lands when it is let go in a run of the other pin
 * (dragging never pins or unpins): its own run in the same place, at the end
 * of the pinned ones or the start of the others.
 * @returns {{seq: string, edge: 'start'|'end'} | null} null when the run fits
 */
export function ownRun(seqKey, pinned) {
  const g = parseGroup(seqKey);
  if (!g || g.pinned === !!pinned) return null;
  return { seq: groupKey(g.folder, !!pinned), edge: pinned ? 'end' : 'start' };
}

/**
 * @param {{listEl: HTMLElement, store: import('./notes.js').NoteStore,
 *   folders: import('./folders.js').FolderStore,
 *   noteItem: (note: object) => HTMLElement, onChanged: () => void}} deps
 */
export function initNoteList({ listEl, store, folders, noteItem, onChanged }) {
  // ---- drawing ---------------------------------------------------------

  function item(note, seq) {
    const el = noteItem(note);
    el.dataset.id = note.id;
    el.dataset.kind = 'note';
    el.dataset.seq = seq;
    el.dataset.group = seq;
    const row = el.querySelector('.note-row');
    if (row) row.draggable = true;
    return el;
  }

  function folderHeader(folder, count, open) {
    const head = document.createElement('div');
    head.className = 'note-item folder-item';
    head.dataset.folder = folder.id;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'folder-row';
    row.draggable = true;
    row.setAttribute('aria-expanded', String(open));
    row.title = folder.name;
    row.innerHTML = `<span class="fr-caret" aria-hidden="true"></span>${icon('folder', 'ic fr-icon')}<span class="fr-name" data-no-i18n></span><span class="fr-count" data-no-i18n></span>`;
    row.querySelector('.fr-name').textContent = folder.name;
    row.querySelector('.fr-count').textContent = String(count);
    row.dataset.initial = folder.name.trim().charAt(0).toUpperCase() || 'F';
    row.addEventListener('click', () => { folders.toggle(folder.id); onChanged(); });
    row.addEventListener('dblclick', (e) => { e.preventDefault(); void rename(folder.id); });
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'nr-more fr-more';
    more.textContent = '⋯';
    more.title = 'Folder actions';
    more.setAttribute('aria-label', 'Folder actions');
    more.addEventListener('click', (e) => { e.stopPropagation(); folderMenu(folder.id, more); });
    head.append(row, more);
    return head;
  }

  function folderBlock(folder, inside) {
    const open = folders.isOpen(folder.id);
    const block = document.createElement('div');
    block.className = `folder-block${open ? ' open' : ''}`;
    block.dataset.folder = folder.id;
    block.dataset.id = folder.id;
    block.dataset.kind = 'folder';
    block.dataset.seq = 'r';
    block.append(folderHeader(folder, inside.length, open));
    if (open) {
      const body = document.createElement('div');
      body.className = 'folder-notes';
      body.setAttribute('role', 'group');
      body.setAttribute('aria-label', folder.name);
      if (!inside.length) {
        const empty = document.createElement('div');
        empty.className = 'folder-empty';
        empty.dataset.folder = folder.id;
        empty.textContent = t('Drag notes here');
        body.append(empty);
      }
      for (const note of inside) body.append(item(note, groupKey(folder.id, note.pinned)));
      block.append(body);
    }
    return block;
  }

  /**
   * @param {object[]} notes the live notes in order (store.sorted())
   * @returns {number} how many rows were drawn
   */
  function render(notes) {
    const groups = listGroups(notes, folders, sortKey);
    let rows = 0;
    for (const note of groups.pinned) { listEl.append(item(note, 'p')); rows += 1; }
    for (const entry of groups.root) {
      listEl.append(entry.kind === 'folder' ? folderBlock(entry.folder, entry.notes) : item(entry.note, 'r'));
      rows += 1;
    }
    return rows;
  }

  // ---- dragging --------------------------------------------------------

  let dragging = null;     // { kind: 'note' | 'folder', id }
  let mark = null;         // { el, where: 'before' | 'after' | 'into' | 'end' }

  function clearMark() {
    listEl.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
    listEl.classList.remove('drop-end');
    mark = null;
  }

  const half = (el, e) => { const r = el.getBoundingClientRect(); return e.clientY < r.top + r.height / 2 ? 'before' : 'after'; };

  function targetAt(e) {
    const t0 = e.target;
    if (dragging.kind === 'folder') {
      // A folder moves among the folders and notes of the list, nowhere else.
      const block = t0.closest?.('.folder-block');
      if (block && listEl.contains(block)) {
        if (block.dataset.id === dragging.id) return null;
        return { el: block, where: half(block.querySelector('.folder-item') || block, e) };
      }
      const note = t0.closest?.('.note-item[data-seq="r"]');
      if (note && listEl.contains(note)) return { el: note, where: half(note, e) };
      if (t0.closest?.('.note-item[data-seq="p"]')) {
        const first = [...listEl.children].find((c) => c.dataset.seq === 'r');
        return first ? { el: first, where: 'before' } : { el: listEl, where: 'end' };
      }
      return { el: listEl, where: 'end' };
    }
    const empty = t0.closest?.('.folder-empty');
    if (empty && listEl.contains(empty)) return { el: empty, where: 'into' };
    const head = t0.closest?.('.folder-item');
    if (head && listEl.contains(head)) {
      // The middle of a folder's row puts the note in it; its top and bottom
      // edges put the note above or below the folder, in the list.
      const r = head.getBoundingClientRect();
      const y = e.clientY - r.top;
      const block = head.closest('.folder-block');
      if (y < r.height * 0.25) return { el: block, where: 'before' };
      if (y > r.height * 0.75 && !block.classList.contains('open')) return { el: block, where: 'after' };
      return { el: head, where: 'into' };
    }
    const note = t0.closest?.('.note-item[data-seq]');
    if (note && listEl.contains(note)) {
      if (note.dataset.id === dragging.id) return null;
      return { el: note, where: half(note, e) };
    }
    return { el: listEl, where: 'end' };
  }

  listEl.addEventListener('dragstart', (e) => {
    const folderRow = e.target.closest?.('.folder-row');
    const noteRow = e.target.closest?.('.note-row');
    const el = folderRow ? folderRow.closest('.folder-block') : noteRow?.closest('.note-item[data-seq]');
    if (!el) return;
    dragging = { kind: folderRow ? 'folder' : 'note', id: el.dataset.id };
    e.dataTransfer.setData(DRAG_TYPE, `${dragging.kind}:${dragging.id}`);
    e.dataTransfer.setData('text/plain', (folderRow || noteRow).title || '');
    e.dataTransfer.effectAllowed = 'move';
    // A frame later, or the drag image is taken of the faded row.
    requestAnimationFrame(() => el.classList.add('is-dragging'));
    listEl.classList.add('dragging-note');
  });

  listEl.addEventListener('dragover', (e) => {
    if (!dragging) return;
    const at = targetAt(e);
    if (!at) { clearMark(); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (mark && mark.el === at.el && mark.where === at.where) return;
    clearMark();
    mark = at;
    if (at.where === 'end') listEl.classList.add('drop-end');
    else at.el.classList.add(`drop-${at.where}`);
  });

  listEl.addEventListener('dragleave', (e) => {
    if (!listEl.contains(e.relatedTarget)) clearMark();
  });

  listEl.addEventListener('drop', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const at = mark ?? targetAt(e);
    const what = dragging;
    finish();
    if (at) drop(what, at);
  });

  function finish() {
    clearMark();
    listEl.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
    listEl.classList.remove('dragging-note');
    dragging = null;
  }
  listEl.addEventListener('dragend', finish);

  /** The items of a run as drawn, the dragged one left out. */
  const run = (seq, except) => [...listEl.querySelectorAll('[data-seq]')]
    .filter((el) => el.dataset.seq === seq && el.dataset.id !== except)
    .map((el) => ({ kind: el.dataset.kind, id: el.dataset.id }));

  const keyOf = ({ kind, id }) => (kind === 'folder' ? folders.key(id) : sortKey(store.get(id)));

  /** Put the dragged item where `at` says, and redraw. */
  function drop(what, at) {
    const me = { kind: what.kind, id: what.id };
    const note = what.kind === 'note' ? store.get(what.id) : null;
    if (what.kind === 'note' && !note) return;
    if (what.kind === 'folder' && !folders.has(what.id)) return;
    let seq;
    let list;
    if (at.where === 'into') {
      const folder = at.el.dataset.folder;
      if (!folders.has(folder)) return;
      seq = groupKey(folder, !!note.pinned);
      list = [me, ...run(seq, me.id)];
      folders.setOpen(folder, true);
    } else if (at.where === 'end') {
      seq = what.kind === 'folder' ? 'r' : groupKey(null, !!note.pinned);
      list = [...run(seq, me.id), me];
    } else {
      seq = at.el.dataset.seq;
      const other = note ? ownRun(seq, note.pinned) : null;
      if (other) {
        seq = other.seq;
        list = run(seq, me.id);
        if (other.edge === 'end') list.push(me); else list.unshift(me);
      } else {
        list = run(seq, me.id);
        const i = list.findIndex((x) => x.id === at.el.dataset.id);
        list.splice(i < 0 ? list.length : (at.where === 'before' ? i : i + 1), 0, me);
      }
    }
    const where = parseGroup(seq);
    if (!where) return;
    const index = list.findIndex((x) => x.id === me.id);
    const placed = orderFor(list.map(keyOf), index);
    if ('renumber' in placed) {
      store.setOrders(list.map((x, i) => [x, placed.renumber[i]]).filter(([x]) => x.kind === 'note' && x.id !== me.id).map(([x, o]) => [x.id, o]));
      list.forEach((x, i) => { if (x.kind === 'folder') folders.setOrder(x.id, placed.renumber[i]); });
    }
    const order = 'renumber' in placed ? placed.renumber[index] : placed.order;
    if (note) store.setPlace(note.id, { folder: where.folder, order });
    else folders.setOrder(me.id, order);
    onChanged();
  }

  // ---- menus -----------------------------------------------------------

  const menu = document.createElement('div');
  menu.className = 'float-menu folder-menu';
  menu.id = 'folder-menu';
  menu.hidden = true;
  document.body.append(menu);
  const closeMenu = () => { menu.hidden = true; menu.replaceChildren(); };
  document.addEventListener('mousedown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !e.target.closest?.('.fr-more, [data-note-act="folder"]')) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); closeMenu(); } }, true);

  function button(text, run, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    if (cls) b.className = cls;
    b.textContent = text;
    b.addEventListener('click', run);
    return b;
  }

  function place(anchor) {
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth || 200;
    const h = menu.offsetHeight || 120;
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    menu.style.top = `${r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
    menu.querySelector('button')?.focus();
  }

  async function rename(id) {
    const folder = folders.get(id);
    if (!folder) return;
    const name = await askText(t('Rename folder'), folder.name);
    if (name === null) return;
    folders.rename(id, name);
    onChanged();
  }

  async function create(thenMove) {
    const name = await askText(t('New folder'), t('New folder'));
    if (name === null) return null;
    const folder = folders.create(name);
    if (!folder) return null;
    if (thenMove) store.setFolder(thenMove, folder.id);
    onChanged();
    return folder;
  }

  function folderMenu(id, anchor) {
    closeMenu();
    const folder = folders.get(id);
    if (!folder) return;
    const del = button(t('Delete folder'), () => {
      const count = store.notes.filter((n) => n.folder === id && !n.deletedAt).length;
      menu.replaceChildren();
      const what = document.createElement('p');
      what.className = 'fm-confirm';
      what.textContent = count
        ? t(`Delete the folder? Its ${count} notes stay, back in the list.`)
        : t('Delete the empty folder?');
      const yes = button(t('Delete'), () => {
        closeMenu();
        store.releaseFolder(id);
        folders.remove(id);
        onChanged();
      }, 'fm-delete fm-delete--yes');
      menu.append(what, yes, button(t('Cancel'), closeMenu));
      yes.focus();
    }, 'fm-delete');
    menu.append(button(t('Rename folder'), () => { closeMenu(); void rename(id); }), del);
    place(anchor);
  }

  /** The note's ⋯ -> Move to folder: every folder, "No folder", and a new one. */
  function moveMenu(noteId, anchor) {
    closeMenu();
    const note = store.get(noteId);
    if (!note || !anchor) return;
    const current = folders.has(note.folder) ? note.folder : null;
    for (const folder of folders.all()) {
      const b = button('', () => {
        closeMenu();
        store.setFolder(noteId, folder.id);
        folders.setOpen(folder.id, true);
        onChanged();
      }, folder.id === current ? 'sel' : '');
      b.innerHTML = `<span class="fm-ic">${icon('folder')}</span><span data-no-i18n></span>`;
      b.lastChild.textContent = folder.name;
      if (folder.id === current) b.setAttribute('aria-current', 'true');
      menu.append(b);
    }
    if (current) menu.append(button(t('No folder'), () => { closeMenu(); store.setFolder(noteId, null); onChanged(); }));
    menu.append(button(t('New folder…'), () => { closeMenu(); void create(noteId); }));
    place(anchor);
  }

  return { render, moveMenu, create, rename, closeMenu };
}
