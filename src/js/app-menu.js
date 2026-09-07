/**
 * File · Edit · View · Window · Help, drawn by the app.
 *
 * They are ours rather than Electron's `Menu` for one reason: they have to sit
 * beside the logo in the title strip, and a native menu bar cannot go there.
 * `Menu.setApplicationMenu(null)` in the main process takes the stock bar away.
 *
 * The definitions here are also the ONLY source the command palette reads, so
 * a command can never exist in one and not the other.
 */

/**
 * @param {object} ctx everything a command might need to act on
 * @returns {Array<{title: string, items: Array}>} an item is
 *   `{ id, label, hint?, run() }`, or `{ separator: true }`
 */
export function buildMenus(ctx) {
  const {
    actions = {}, store, openNote, newNote, find, palette, shortcuts,
    about, checkUpdates, guide, toggleSide, toggleBar, toggleAi, history,
  } = ctx;
  const shell = typeof window !== 'undefined' ? window.nebula : null;

  return [
    {
      title: 'File',
      items: [
        { id: 'file.new', label: 'New note', hint: 'Ctrl+N', run: () => newNote?.() },
        { id: 'file.save', label: 'Save now', hint: 'Ctrl+S', run: () => actions.save?.() },
        { separator: true },
        { id: 'file.print', label: 'Print…', hint: 'Ctrl+P', run: () => actions.print?.() },
        { id: 'file.folder', label: 'Open notes folder', run: () => shell?.reveal?.('storage') },
        { separator: true },
        { id: 'file.quit', label: 'Quit Nebula', run: () => shell?.quit?.() },
      ],
    },
    {
      title: 'Edit',
      items: [
        { id: 'edit.undo', label: 'Undo', hint: 'Ctrl+Z', run: () => history?.undo() },
        { id: 'edit.redo', label: 'Redo', hint: 'Ctrl+Y', run: () => history?.redo() },
        { separator: true },
        { id: 'edit.cut', label: 'Cut', hint: 'Ctrl+X', run: () => actions.cut?.() },
        { id: 'edit.copy', label: 'Copy', hint: 'Ctrl+C', run: () => actions.copy?.() },
        { id: 'edit.paste', label: 'Paste', hint: 'Ctrl+V', run: () => actions.paste?.() },
        { separator: true },
        { id: 'edit.find', label: 'Find in this note', hint: 'Ctrl+F', run: () => find?.open() },
        { id: 'edit.palette', label: 'Command palette', hint: 'Ctrl+K', run: () => palette?.open() },
      ],
    },
    {
      title: 'View',
      items: [
        // These act on the window, never on a focused <webview> guest — which
        // is why the stock View menu appeared to do nothing with the AI panel
        // open. The level is remembered across launches.
        { id: 'view.zoomin', label: 'Zoom in', hint: 'Ctrl +', run: () => shell?.view?.zoom('in') },
        { id: 'view.zoomout', label: 'Zoom out', hint: 'Ctrl -', run: () => shell?.view?.zoom('out') },
        { id: 'view.zoomreset', label: 'Actual size', hint: 'Ctrl 0', run: () => shell?.view?.zoom('reset') },
        { separator: true },
        { id: 'view.side', label: 'Toggle note list', run: () => toggleSide?.() },
        { id: 'view.bar', label: 'Toggle editing bar', run: () => toggleBar?.() },
        { id: 'view.ai', label: 'Toggle AI panel', run: () => toggleAi?.() },
        { separator: true },
        { id: 'view.fullscreen', label: 'Full screen', hint: 'F11', run: () => shell?.window?.fullscreen() },
        { id: 'view.devtools', label: 'Developer tools', run: () => shell?.view?.devtools() },
      ],
    },
    {
      title: 'Window',
      items: [
        { id: 'window.maximize', label: 'Maximize', run: () => shell?.window?.maximize() },
        { id: 'window.minimize', label: 'Minimize', run: () => shell?.window?.minimize() },
        { separator: true },
        { id: 'window.close', label: 'Close window', run: () => shell?.window?.close() },
      ],
    },
    {
      title: 'Help',
      items: [
        // First, deliberately: it is the way back to the guide after deleting it.
        { id: 'help.guide', label: 'Guide page', run: () => guide?.() },
        { separator: true },
        { id: 'help.shortcuts', label: 'Keyboard shortcuts', run: () => shortcuts?.open() },
        { id: 'help.palette', label: 'Command palette', hint: 'Ctrl+K', run: () => palette?.open() },
        { separator: true },
        { id: 'help.updates', label: 'Check for updates', run: () => checkUpdates?.() },
        { id: 'help.about', label: 'About Nebula', run: () => about?.() },
      ],
    },
  ];
}

/** Every runnable command, flattened — what the palette searches. */
export function commandsOf(menus) {
  const out = [];
  for (const menu of menus) {
    for (const item of menu.items) {
      if (item.separator) continue;
      out.push({ ...item, menu: menu.title, search: `${menu.title} ${item.label}`.toLowerCase() });
    }
  }
  return out;
}

/** Commands whose label or menu matches every word of the query. Pure — tested. */
export function filterCommands(commands, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands.filter((c) => words.every((w) => c.search.includes(w)));
}

export function initAppMenu(ctx) {
  const bar = document.getElementById('app-menu');
  if (!bar) return null;

  const menus = buildMenus(ctx);
  let open = null;

  function close() {
    bar.querySelectorAll('.am-menu').forEach((m) => { m.hidden = true; });
    bar.querySelectorAll('.am-title').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    open = null;
  }

  for (const menu of menus) {
    const wrap = document.createElement('div');
    wrap.className = 'am-wrap';

    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'am-title';
    title.textContent = menu.title;
    title.setAttribute('aria-expanded', 'false');

    const list = document.createElement('div');
    list.className = 'am-menu';
    list.hidden = true;

    for (const item of menu.items) {
      if (item.separator) {
        const hr = document.createElement('div');
        hr.className = 'am-sep';
        list.appendChild(hr);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.cmd = item.id;
      const label = document.createElement('span');
      label.textContent = item.label;
      btn.appendChild(label);
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'am-hint';
        hint.textContent = item.hint;
        btn.appendChild(hint);
      }
      btn.addEventListener('click', () => { close(); item.run(); });
      list.appendChild(btn);
    }

    title.addEventListener('click', () => {
      const wasOpen = open === menu.title;
      close();
      if (wasOpen) return;
      list.hidden = false;
      title.setAttribute('aria-expanded', 'true');
      open = menu.title;
    });
    // Once one is open, sliding across the strip opens the next — the way a
    // menu bar has always behaved.
    title.addEventListener('mouseenter', () => { if (open && open !== menu.title) title.click(); });

    wrap.append(title, list);
    bar.appendChild(wrap);
  }

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#app-menu')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { menus, commands: commandsOf(menus), close };
}
