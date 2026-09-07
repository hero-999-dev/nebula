/**
 * The command palette (Ctrl+K) and the keyboard-shortcut sheet.
 *
 * The palette's list is the menu definitions themselves (`app-menu.js`), so a
 * command cannot appear in one and be missing from the other. Filtering and
 * arrow-key navigation follow the same shape as the slash menu.
 */
import { filterCommands } from './app-menu.js';
import { SLASH_ITEMS } from './slash-menu.js';
import { icon } from './icons.js';

export const SHORTCUTS = [
  ['Notes', [
    ['Ctrl+N', 'New note'],
    ['Ctrl+S', 'Save now'],
    ['Ctrl+F', 'Find in this note'],
    ['Ctrl+K', 'Command palette'],
    ['Ctrl+P', 'Print'],
  ]],
  ['Writing', [
    ['Ctrl+B', 'Bold'],
    ['Ctrl+I', 'Italic'],
    ['Ctrl+U', 'Underline'],
    ['Ctrl+Shift+S', 'Strikethrough'],
    ['Ctrl+E', 'Inline code'],
    ['Ctrl+Q', 'Equation'],
    ['Ctrl+T', 'Text colour'],
    ['Ctrl+H', 'Highlight'],
  ]],
  ['Structure', [
    ['/', 'Block menu'],
    ['Tab', 'Indent the block'],
    ['Shift+Tab', 'Outdent the block'],
    ['Enter', 'On an empty list item: leave the list'],
    ['Backspace', 'At the start of a format: take it off'],
  ]],
  ['Editing', [
    ['Ctrl+Z', 'Undo'],
    ['Ctrl+Y', 'Redo'],
    ['Ctrl+X / C / V', 'Cut, copy, paste'],
  ]],
  ['Window', [
    ['Ctrl + / Ctrl -', 'Zoom in and out'],
    ['Ctrl 0', 'Actual size'],
    ['F11', 'Full screen'],
    ['Esc', 'Close whatever is open'],
  ]],
];

export function initPalette(getCommands) {
  const overlay = document.getElementById('ov-palette');
  const input = document.getElementById('palette-input');
  const list = document.getElementById('palette-list');
  if (!overlay || !input || !list) return null;

  let shown = [];
  let index = 0;

  function paint() {
    list.innerHTML = '';
    if (!shown.length) {
      const none = document.createElement('div');
      none.className = 'palette-empty';
      none.textContent = 'No command matches';
      list.appendChild(none);
      return;
    }
    shown.forEach((cmd, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `palette-row${i === index ? ' on' : ''}`;
      row.innerHTML = '<span class="pr-menu"></span><span class="pr-label"></span><span class="pr-hint"></span>';
      row.children[0].textContent = cmd.menu;
      row.children[1].textContent = cmd.label;
      row.children[2].textContent = cmd.hint ?? '';
      row.addEventListener('click', () => run(i));
      list.appendChild(row);
    });
    list.querySelector('.palette-row.on')?.scrollIntoView({ block: 'nearest' });
  }

  function search() {
    shown = filterCommands(getCommands(), input.value);
    index = 0;
    paint();
  }

  function run(i) {
    const cmd = shown[i];
    close();
    cmd?.run();
  }

  function open() {
    overlay.hidden = false;
    input.value = '';
    search();
    input.focus();
  }

  function close() { overlay.hidden = true; }

  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(index + 1, shown.length - 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(index - 1, 0); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(index); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      overlay.hidden ? open() : close();
    }
  });

  return { open, close };
}

export function initShortcuts() {
  const overlay = document.getElementById('ov-shortcuts');
  const body = document.getElementById('shortcuts-body');
  if (!overlay || !body) return null;

  body.innerHTML = '';
  for (const [group, rows] of SHORTCUTS) {
    const h = document.createElement('h3');
    h.className = 'sc-group';
    h.textContent = group;
    body.appendChild(h);
    const table = document.createElement('table');
    table.className = 'sc-table';
    for (const [keys, what] of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = keys;
      const td = document.createElement('td');
      td.textContent = what;
      tr.append(th, td);
      table.appendChild(tr);
    }
    body.appendChild(table);
  }

  const open = () => { overlay.hidden = false; };
  const close = () => { overlay.hidden = true; };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.getElementById('shortcuts-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return { open, close };
}


/**
 * What `/` offers, listed from SLASH_ITEMS itself.
 *
 * The slash menu had no reference anywhere — you had to already know what was
 * in it. Reading the same array the menu is built from means this sheet cannot
 * fall behind it, the way the command palette reads the app menus.
 */
export const BLOCK_HELP = {
  text: 'Plain paragraph',
  h1: 'Big heading',
  h2: 'Medium heading',
  h3: 'Small heading',
  bullet: 'Bulleted list — Enter on an empty item leaves it',
  numbered: 'Numbered list — Enter on an empty item leaves it',
  todo: 'A line with a checkbox; the button toggles it back',
  quote: 'Indented quote',
  code: 'Code block with a language picker and colours',
  divider: 'A horizontal rule',
  shape: 'A floating shape you can drag anywhere',
};

export function initBlocks() {
  const overlay = document.getElementById('ov-blocks');
  const body = document.getElementById('blocks-body');
  if (!overlay || !body) return null;

  body.innerHTML = '';
  const intro = document.createElement('p');
  intro.className = 'sc-intro';
  intro.textContent = 'Type / at the start of a line, or after a space, then keep typing to filter.';
  body.appendChild(intro);

  const table = document.createElement('table');
  table.className = 'sc-table blocks-table';
  for (const item of SLASH_ITEMS) {
    const tr = document.createElement('tr');
    const ic = document.createElement('td');
    ic.className = 'bl-ic';
    ic.innerHTML = icon(item.ic);
    const name = document.createElement('th');
    name.textContent = `/${item.id}`;
    const what = document.createElement('td');
    what.textContent = BLOCK_HELP[item.id] ?? item.label;
    tr.append(ic, name, what);
    table.appendChild(tr);
  }
  body.appendChild(table);

  const open = () => { overlay.hidden = false; };
  const close = () => { overlay.hidden = true; };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.getElementById('blocks-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return { open, close };
}
