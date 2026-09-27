/**
 * Note labels: the chips beside the title and the picker behind them.
 *
 * A label is plain text on the note (`note.labels`), so it travels with the
 * note through save, search and the .nebula.json export without a second store.
 */

import { on } from './bus.js';

const MAX_LABELS = 20;
const MAX_LENGTH = 40;

/** Trimmed, without leading #, case-insensitively unique, at most 20. */
export function normalizeLabels(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, MAX_LENGTH))
    .filter((v) => {
      const key = v.toLocaleLowerCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_LABELS);
}

/** One picker shared by the title's + and every note's actions menu. */
export function initLabels(store) {
  const host = document.getElementById('note-labels');
  if (!host) return null;

  const panel = document.createElement('div');
  panel.id = 'label-picker';
  panel.className = 'label-picker';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Note labels');
  panel.innerHTML =
    '<label for="label-search">Labels</label>' +
    '<input id="label-search" maxlength="40" placeholder="Find or add a label" autocomplete="off">' +
    '<div class="label-options"></div>' +
    '<button class="btn" type="button" data-label-create>Add label</button>' +
    '<button class="btn ghost" type="button" data-label-close>Done</button>';
  document.body.append(panel);

  const search = panel.querySelector('input');
  const options = panel.querySelector('.label-options');
  const create = panel.querySelector('[data-label-create]');
  let forId = null;
  let anchor = null;

  const labelsOf = (note) => normalizeLabels(note?.labels);

  function renderHeader() {
    host.replaceChildren();
    const note = store.active();
    if (!note) return;
    for (const label of labelsOf(note)) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'note-label';
      chip.textContent = '#' + label;
      chip.title = 'Edit labels';
      chip.addEventListener('click', () => open(note.id, chip));
      host.append(chip);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'note-label-add';
    add.textContent = '+';
    add.title = 'Add labels';
    add.setAttribute('aria-label', 'Add labels');
    add.addEventListener('click', () => open(note.id, add));
    host.append(add);
  }

  function renderOptions() {
    const note = store.get(forId);
    if (!note) { close(); return; }
    const selected = labelsOf(note);
    const q = search.value.trim().replace(/^#+/, '').toLocaleLowerCase();

    // Every label in use anywhere, collected without the per-note limit.
    const catalog = new Map();
    for (const n of store.notes.filter((n) => !n.deletedAt)) {
      for (const label of labelsOf(n)) catalog.set(label.toLocaleLowerCase(), label);
    }
    for (const label of selected) catalog.set(label.toLocaleLowerCase(), label);

    options.replaceChildren();
    for (const [key, label] of [...catalog].sort((a, b) => a[1].localeCompare(b[1]))) {
      if (!key.includes(q)) continue;
      const row = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selected.some((v) => v.toLocaleLowerCase() === key);
      box.addEventListener('change', () => {
        const current = labelsOf(store.get(forId));
        store.setLabels(forId, box.checked
          ? [...current, label]
          : current.filter((v) => v.toLocaleLowerCase() !== key));
        renderOptions();
      });
      row.append(box, document.createTextNode('#' + label));
      options.append(row);
    }
    create.disabled = !q || selected.length >= MAX_LABELS;
    create.textContent = catalog.has(q)
      ? 'Add selected label'
      : `Add ${q ? '#' + search.value.trim() : 'label'}`;
  }

  function close() {
    panel.hidden = true;
    forId = null;
    anchor?.focus({ preventScroll: true });
  }

  function open(id, button) {
    forId = id;
    anchor = button;
    search.value = '';
    panel.hidden = false;
    renderOptions();
    const r = button?.getBoundingClientRect() ?? { left: window.innerWidth / 2, bottom: 100 };
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 300)) + 'px';
    panel.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - panel.offsetHeight - 8)) + 'px';
    search.focus();
  }

  function add() {
    const value = normalizeLabels([search.value])[0];
    if (!value || !forId) return;
    store.setLabels(forId, [...labelsOf(store.get(forId)), value]);
    search.value = '';
    renderOptions();
    search.focus();
  }

  create.addEventListener('click', add);
  search.addEventListener('input', renderOptions);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });
  panel.querySelector('[data-label-close]').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (!panel.hidden && e.key === 'Escape') { e.preventDefault(); close(); }
  });
  document.addEventListener('mousedown', (e) => {
    if (panel.hidden || panel.contains(e.target) || host.contains(e.target)) return;
    if (e.target.closest('[data-note-act="labels"]')) return;
    close();
  });

  on('note-changed', renderHeader);
  on('note-opened', () => { panel.hidden = true; forId = null; renderHeader(); });
  renderHeader();
  return { open, render: renderHeader };
}
