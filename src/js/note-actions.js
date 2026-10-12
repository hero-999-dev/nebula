import { plainSnippet } from './notes.js';
/**
 * The per-note ⋯ menu and the Archive / Trash drawers.
 *
 * One menu element, moved to whichever row asked for it — a menu per row would
 * be a hundred hidden elements in a long list, and they would all need keeping
 * in sync.
 *
 * Archive and Trash share ONE panel with a button each, side by side under it.
 * The panel sits above the buttons in the DOM, so it opens upward over the note
 * list without anything having to be measured, and the rows inside it are the
 * same `.note-item` blocks the sidebar itself draws.
 */

const LABELS = {
  pin: (note) => (note.pinned ? 'Unpin from top' : 'Pin to top'),
  // Says what choosing it switches TO, like Pin/Unpin — no checkbox (owner, 0.9.2).
  readonly: (note) => (note.readOnly ? 'Edit mode' : 'Only view mode'),
  archive: () => 'Archive this note',
  // Auto order page (0.9.3): what a page line falls across, put right by itself in this note.
  // Says where it stands (the owner: "say not active"); choosing it turns it the other way.
  autoorder: (note) => (note.autoOrder ? 'Auto order page: active' : 'Auto order page: not active'),
};

export function initNoteActions({ store, onChanged, openNote, onLabels, onFolder, onHole, holeLabel, trashedHoles, onHoleRestore, onHoleDelete }) {
  const menu = document.getElementById('note-menu');
  const drawerBody = document.getElementById('drawer-body');
  const tabs = [...document.querySelectorAll('.drawer-tab')];
  // No counters (the owner, 0.9.4: beside folders, black holes, Archive and Trash alike). A page that still has them is filled.
  const counts = {
    archive: document.getElementById('archive-count'),
    trash: document.getElementById('trash-count'),
  };
  /** Which drawer is showing, or null. Only ever one. */
  let openDrawer = null;

  if (!menu) return null;

  let forId = null;
  /** What the labels and folder pickers open beside: the ⋯, or the row on the rail. */
  let anchor = null;

  function close() {
    menu.hidden = true;
    document.querySelectorAll('.nr-more[aria-expanded="true"]')
      .forEach((b) => b.setAttribute('aria-expanded', 'false'));
    forId = null;
  }

  /**
   * @param {string} id
   * @param {HTMLElement} button the row's ⋯
   * @param {{x: number, y: number}} [point] a right-click: the menu opens there (0.9.4)
   */
  function openFor(id, button, point = null) {
    const note = store.get(id);
    if (!note) return;
    forId = id;
    menu.querySelector('[data-note-act="pin"]').textContent = LABELS.pin(note);
    menu.querySelector('[data-note-act="archive"]').textContent = LABELS.archive(note);
    const mode = menu.querySelector('[data-note-act="readonly"]');
    if (mode) mode.textContent = LABELS.readonly(note);
    const order = menu.querySelector('[data-note-act="autoorder"]');
    if (order) {
      order.textContent = LABELS.autoorder(note);
      order.hidden = !note.page || note.page === 'nw';    // Nebula Wide has no pages to order
    }
    // Black holes (0.9.4): into one, or out of the one it is in. A note in a
    // black hole is in no folder.
    const hole = menu.querySelector('[data-note-act="hole"]');
    if (hole) {
      const label = holeLabel?.(note) ?? null;
      hole.hidden = !label;
      if (label) hole.textContent = label;
    }
    const folder = menu.querySelector('[data-note-act="folder"]');
    if (folder) folder.hidden = !!note.hole;
    menu.hidden = false;
    // Below the button, pulled back inside the window if there is no room.
    const r = point
      ? { left: point.x, top: point.y, bottom: point.y }
      : button.getBoundingClientRect();
    const w = menu.offsetWidth || 172;
    const h = menu.offsetHeight || 110;
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    menu.style.top = `${r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
    button.setAttribute('aria-expanded', 'true');
    // On the rail the ⋯ is not drawn, so the pickers open beside the row.
    anchor = button.offsetParent ? button : (button.closest('.note-item') ?? button);
  }

  /** A right-click on a note's row (note-list.js). */
  function openAt(id, x, y) {
    const button = [...document.querySelectorAll('#note-list .note-item')]
      .find((el) => el.dataset.id === id)?.querySelector('.nr-more:not(.fr-more)');
    if (!button) return;
    close();
    openFor(id, button, { x, y });
  }

  menu.addEventListener('click', (e) => {
    const act = e.target.closest('[data-note-act]')?.dataset.noteAct;
    if (!act || !forId) return;
    const id = forId;
    const button = anchor?.isConnected ? anchor
      : [...document.querySelectorAll('.nr-more')].find(b => b.getAttribute('aria-expanded') === 'true');
    close();
    if (act === 'labels') { onLabels?.(id, button); return; }
    if (act === 'folder') { onFolder?.(id, button); return; }
    if (act === 'hole') { onHole?.(id, button); return; }
    if (act === 'pin') store.togglePin(id);
    else if (act === 'readonly') store.toggleReadOnly(id);
    else if (act === 'autoorder') store.toggleAutoOrder(id);
    else if (act === 'archive') store.archive(id);
    else if (act === 'trash') store.trash(id);
    onChanged?.();
  });

  document.addEventListener('mousedown', (e) => {
    if (menu.hidden) return;
    if (e.target.closest('#note-menu') || e.target.closest('.nr-more')) return;
    close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  /** The ⋯ button for a row. The row itself is a <button>, so this is a sibling. */
  function moreButton(id) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nr-more';
    btn.textContent = '⋯';
    btn.title = 'Note actions';
    btn.setAttribute('aria-label', 'Note actions');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (forId === id) { close(); return; }
      close();
      openFor(id, btn);
    });
    return btn;
  }

  /**
   * The archive and the trash, in the sidebar's own note-row shape.
   *
   * They used to be two stacked strips with their own miniature rows. The list
   * above uses `.note-item` / `.note-row`, and these are the same kind of
   * thing, so they are drawn the same way and read as part of the same column.
   */
  const SETS = {
    archive: {
      empty: 'Nothing archived',
      notes: () => store.archived(),
      // Open shows the note; it does NOT bring it back to the list. Reading an
      // archived note is not the same as un-archiving it.
      actions: [
        ['Open', (id) => openNote?.(id)],
        ['Unarchive', (id) => store.unarchive(id)],
      ],
    },
    trash: {
      empty: 'Trash is empty',
      notes: () => store.trashed(),
      // No confirm on Delete: the note is already in the trash, and that was
      // the confirm.
      actions: [
        ['Restore', (id) => store.restore(id)],
        ['Delete', (id) => store.destroy(id)],
      ],
    },
  };

  function drawerRow(note, actions) {
    const item = document.createElement('div');
    item.className = 'note-item drawer-item';

    const row = document.createElement('div');
    row.className = 'note-row';
    row.innerHTML = '<div class="nr-title"></div><div class="nr-meta"></div>';
    const title = note.title || 'Untitled';
    row.children[0].textContent = title;
    row.children[0].dataset.initial = title.trim().charAt(0).toUpperCase() || 'U';
    row.children[1].textContent = plainSnippet(note.content, 44) || 'Empty';
    row.title = title;

    // The buttons sit to the RIGHT of the note block, not under it.
    const bar = document.createElement('div');
    bar.className = 'drawer-actions';
    for (const [label, run] of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => { run(note.id); onChanged?.(); });
      bar.appendChild(btn);
    }
    item.append(row, bar);
    return item;
  }

  /**
   * A black hole in the Trash (0.9.4): whole and locked — its name and how many
   * notes it holds, never anything of them. Restore puts it back in its
   * section; Delete removes it and every note in it, and asks once more when
   * it holds any: a note in the Trash is one note, this may be fifty.
   */
  function holeRow(hole) {
    const item = document.createElement('div');
    item.className = 'note-item drawer-item drawer-hole';
    item.dataset.hole = hole.id;

    const row = document.createElement('div');
    row.className = 'note-row';
    row.innerHTML = '<div class="nr-title" data-no-i18n></div><div class="nr-meta"></div>';
    row.children[0].textContent = hole.name;
    row.children[0].dataset.initial = hole.name.trim().charAt(0).toUpperCase() || 'B';
    row.children[1].textContent = hole.notes ? `Black hole · ${hole.notes} ${hole.notes === 1 ? 'note' : 'notes'}` : 'Black hole · empty';
    row.title = hole.name;

    const bar = document.createElement('div');
    bar.className = 'drawer-actions';
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Restore';
    restore.addEventListener('click', () => { void onHoleRestore?.(hole.id); });
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      if (hole.notes && !del.classList.contains('is-sure')) {
        del.classList.add('is-sure');
        del.textContent = 'Delete for good?';
        return;
      }
      void onHoleDelete?.(hole.id);
    });
    bar.append(restore, del);
    item.append(row, bar);
    return item;
  }

  function renderDrawers() {
    for (const [name, set] of Object.entries(SETS)) {
      if (counts[name]) counts[name].textContent = String(set.notes().length);
    }
    if (!drawerBody) return;

    if (!openDrawer) { drawerBody.hidden = true; drawerBody.innerHTML = ''; return; }
    const set = SETS[openDrawer];
    const notes = set.notes();
    drawerBody.hidden = false;
    drawerBody.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'drawer-head';
    head.textContent = openDrawer === 'archive' ? 'Archived' : 'In the trash';
    drawerBody.appendChild(head);

    const holes = openDrawer === 'trash' ? (trashedHoles?.() ?? []) : [];
    if (!notes.length && !holes.length) {
      const none = document.createElement('div');
      none.className = 'drawer-empty';
      none.textContent = set.empty;
      drawerBody.appendChild(none);
      return;
    }
    for (const note of notes) drawerBody.appendChild(drawerRow(note, set.actions));
    for (const hole of holes) drawerBody.appendChild(holeRow(hole));
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const name = tab.dataset.drawer;
      openDrawer = openDrawer === name ? null : name;   // only one at a time
      for (const t of tabs) t.setAttribute('aria-expanded', String(t.dataset.drawer === openDrawer));
      renderDrawers();
    });
  }

  return { moreButton, renderDrawers, close, openAt };
}
