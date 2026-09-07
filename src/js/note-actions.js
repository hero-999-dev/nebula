/**
 * The per-note ⋯ menu and the Archive / Trash drawers.
 *
 * One menu element, moved to whichever row asked for it — a menu per row would
 * be a hundred hidden elements in a long list, and they would all need keeping
 * in sync. The drawers put their body ABOVE their toggle in the DOM, so they
 * open upward without anything having to be measured.
 */

const LABELS = {
  pin: (note) => (note.pinned ? 'Unpin from top' : 'Pin to top'),
  archive: () => 'Archive',
};

export function initNoteActions({ store, onChanged, openNote }) {
  const menu = document.getElementById('note-menu');
  const drawers = {
    archive: {
      body: document.getElementById('archive-list'),
      count: document.getElementById('archive-count'),
      toggle: document.querySelector('[data-drawer="archive"]'),
    },
    trash: {
      body: document.getElementById('trash-list'),
      count: document.getElementById('trash-count'),
      toggle: document.querySelector('[data-drawer="trash"]'),
    },
  };
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

  function drawerRow(note, actions) {
    const row = document.createElement('div');
    row.className = 'drawer-row';
    const title = document.createElement('span');
    title.className = 'dr-title';
    title.textContent = note.title || 'Untitled';
    title.title = note.title || 'Untitled';
    row.appendChild(title);
    for (const [label, run] of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => { run(note.id); onChanged?.(); });
      row.appendChild(btn);
    }
    return row;
  }

  function renderDrawers() {
    const sets = {
      archive: {
        notes: store.archived(),
        empty: 'Nothing archived',
        actions: [
          ['Open', (id) => { store.unarchive(id); openNote?.(id); }],
          ['Unarchive', (id) => store.unarchive(id)],
        ],
      },
      trash: {
        notes: store.trashed(),
        empty: 'Trash is empty',
        actions: [
          ['Restore', (id) => store.restore(id)],
          // No confirm: the note is already in the trash, which IS the confirm.
          ['Delete', (id) => store.destroy(id)],
        ],
      },
    };

    for (const [name, drawer] of Object.entries(drawers)) {
      if (!drawer.body) continue;
      const { notes, empty, actions } = sets[name];
      drawer.count.textContent = String(notes.length);
      drawer.body.innerHTML = '';
      if (!notes.length) {
        const none = document.createElement('div');
        none.className = 'drawer-empty';
        none.textContent = empty;
        drawer.body.appendChild(none);
      } else {
        for (const note of notes) drawer.body.appendChild(drawerRow(note, actions));
      }
    }
  }

  for (const [name, drawer] of Object.entries(drawers)) {
    drawer.toggle?.addEventListener('click', () => {
      const open = drawer.body.hidden;
      drawer.body.hidden = !open;
      drawer.toggle.setAttribute('aria-expanded', String(open));
    });
    void name;
  }

  return { moreButton, renderDrawers, close };
}
