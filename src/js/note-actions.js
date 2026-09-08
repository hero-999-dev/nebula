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
  archive: () => 'Archive',
};

export function initNoteActions({ store, onChanged, openNote }) {
  const menu = document.getElementById('note-menu');
  const drawerBody = document.getElementById('drawer-body');
  const tabs = [...document.querySelectorAll('.drawer-tab')];
  const counts = {
    archive: document.getElementById('archive-count'),
    trash: document.getElementById('trash-count'),
  };
  /** Which drawer is showing, or null. Only ever one. */
  let openDrawer = null;

  if (!menu) return null;

  let forId = null;

  function close() {
    menu.hidden = true;
    document.querySelectorAll('.nr-more[aria-expanded="true"]')
      .forEach((b) => b.setAttribute('aria-expanded', 'false'));
    forId = null;
  }

  function openFor(id, button) {
    const note = store.get(id);
    if (!note) return;
    forId = id;
    menu.querySelector('[data-note-act="pin"]').textContent = LABELS.pin(note);
    menu.querySelector('[data-note-act="archive"]').textContent = LABELS.archive(note);
    menu.hidden = false;
    // Below the button, pulled back inside the window if there is no room.
    const r = button.getBoundingClientRect();
    const w = menu.offsetWidth || 172;
    const h = menu.offsetHeight || 110;
    menu.style.left = `${Math.min(r.left, window.innerWidth - w - 8)}px`;
    menu.style.top = `${r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
    button.setAttribute('aria-expanded', 'true');
  }

  menu.addEventListener('click', (e) => {
    const act = e.target.closest('[data-note-act]')?.dataset.noteAct;
    if (!act || !forId) return;
    const id = forId;
    close();
    if (act === 'pin') store.togglePin(id);
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

    if (!notes.length) {
      const none = document.createElement('div');
      none.className = 'drawer-empty';
      none.textContent = set.empty;
      drawerBody.appendChild(none);
      return;
    }
    for (const note of notes) drawerBody.appendChild(drawerRow(note, set.actions));
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const name = tab.dataset.drawer;
      openDrawer = openDrawer === name ? null : name;   // only one at a time
      for (const t of tabs) t.setAttribute('aria-expanded', String(t.dataset.drawer === openDrawer));
      renderDrawers();
    });
  }

  return { moreButton, renderDrawers, close };
}
