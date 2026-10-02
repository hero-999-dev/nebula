/**
 * Filter the note list by a label (0.9.3).
 *
 * The owner: under "Filter notes", a button that filters by label and opens
 * when pressed; and the labels written in a note's text (#word) are not the
 * note's own labels by its title — two kinds, kept apart. So the panel has a
 * search box and two groups: "Note labels" (the chips by a note's title) and
 * "In the text" (the #word chips inside notes). One label is picked at a time;
 * the button then names it, and its × takes it off.
 */

import { normalizeLabels } from './labels.js';
import { contentTags } from './mentions.js';
import { t } from './i18n.js';

/** Every label of each kind on these notes, each once, sorted. Pure — tested. */
export function labelCatalog(notes) {
  const note = new Map();
  const text = new Map();
  for (const n of notes) {
    for (const l of normalizeLabels(n.labels)) note.set(l.toLocaleLowerCase(), l);
    for (const l of contentTags(n.content)) text.set(l.toLocaleLowerCase(), l);
  }
  const sorted = (m) => [...m.values()].sort((a, b) => a.localeCompare(b));
  return { note: sorted(note), text: sorted(text) };
}

/** Does a note carry this label, of this kind? Pure — tested. */
export function noteHasLabel(n, pick) {
  if (!pick?.label) return true;
  const want = pick.label.toLocaleLowerCase();
  // One set in the search (the owner, 0.9.3): a label matches a note that has
  // it by its title or in its text; the two are still stored apart.
  const list = pick.kind === 'text' ? contentTags(n.content)
    : pick.kind === 'note' ? normalizeLabels(n.labels)
      : [...normalizeLabels(n.labels), ...contentTags(n.content)];
  return list.some((l) => l.toLocaleLowerCase() === want);
}

/**
 * @param {object} opts
 * @param {import('./notes.js').NoteStore} opts.store
 * @param {HTMLButtonElement} opts.button
 * @param {HTMLElement} opts.panel
 * @param {() => void} opts.onChange redraw the list
 */
export function initLabelFilter({ store, button, panel, onChange, onDelete }) {
  if (!button || !panel) return { matches: () => true, set() {}, render() {}, active: () => null };
  let pick = null;            // { kind: 'note' | 'text', label }
  let open = false;

  const search = panel.querySelector('#label-filter-search');
  const groups = {
    any: panel.querySelector('[data-kind="any"] .lf-chips'),
  };
  const label = button.querySelector('.lf-text');
  const clear = button.querySelector('.lf-clear');

  function paintButton() {
    button.classList.toggle('on', !!pick);
    button.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = pick ? `#${pick.label}` : t('Filter by label');
    if (clear) clear.hidden = !pick;
  }

  function render() {
    const both = labelCatalog(store.live());
    const merged = new Map([...both.note, ...both.text].map((l) => [l.toLocaleLowerCase(), l]));
    const catalog = { any: [...merged.values()].sort((x, y) => x.localeCompare(y)) };
    // A label that no note has any more is not a filter any more.
    if (pick && !catalog[pick.kind].some((l) => l.toLocaleLowerCase() === pick.label.toLocaleLowerCase())) pick = null;
    const q = (search?.value || '').trim().replace(/^#+/, '').toLocaleLowerCase();
    for (const kind of ['any']) {
      const host = groups[kind];
      if (!host) continue;
      host.replaceChildren();
      const shown = catalog[kind].filter((l) => l.toLocaleLowerCase().includes(q));
      host.closest('.lf-group').hidden = !catalog[kind].length;
      for (const l of shown) {
        const on = pick?.kind === kind && pick.label.toLocaleLowerCase() === l.toLocaleLowerCase();
        // One row per label: the label, and ⋯ for what can be done with it.
        const row = document.createElement('span');
        row.className = 'lf-row';
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `label-chip${on ? ' on' : ''}`;
        chip.dataset.noI18n = '';
        chip.textContent = `#${l}`;
        chip.setAttribute('aria-pressed', String(on));
        chip.addEventListener('click', () => set(on ? null : { kind, label: l }));
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'lf-more';
        more.textContent = '⋯';
        more.title = t('Label actions');
        more.setAttribute('aria-label', t('Label actions'));
        more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(l, more); });
        row.append(chip, more);
        host.append(row);
      }
      if (!shown.length && catalog[kind].length) {
        const none = document.createElement('span');
        none.className = 'lf-none';
        none.textContent = t('No label matches');
        host.append(none);
      }
    }
    const empty = panel.querySelector('.lf-empty');
    if (empty) empty.hidden = !!catalog.any.length;
    paintButton();
  }

  /* ---- ⋯ -> Delete label ----
     Two steps, in the menu itself: "Delete label", then what it will do and a
     Delete that means it — a label goes from every note, title and text. */
  const menu = document.createElement('div');
  menu.className = 'float-menu lf-menu';
  menu.id = 'label-menu';
  menu.hidden = true;
  document.body.append(menu);
  const closeMenu = () => { menu.hidden = true; menu.replaceChildren(); };

  function openMenu(labelName, anchor) {
    closeMenu();
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'lf-delete';
    del.textContent = t('Delete label');
    del.addEventListener('click', () => {
      const count = store.live().concat(store.archived()).filter((n) => noteHasLabel(n, { kind: 'any', label: labelName })).length;
      menu.replaceChildren();
      const what = document.createElement('p');
      what.className = 'lf-confirm';
      what.textContent = t(`Delete #${labelName} from ${count} notes?`);
      const yes = document.createElement('button');
      yes.type = 'button';
      yes.className = 'lf-delete lf-delete--yes';
      yes.textContent = t('Delete');
      yes.addEventListener('click', () => {
        closeMenu();
        if (pick && pick.label.toLocaleLowerCase() === labelName.toLocaleLowerCase()) pick = null;
        onDelete?.(labelName);
        render();
      });
      const no = document.createElement('button');
      no.type = 'button';
      no.textContent = t('Cancel');
      no.addEventListener('click', closeMenu);
      menu.append(what, yes, no);
      yes.focus();
    });
    menu.append(del);
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, window.innerWidth - 240)}px`;
    menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - 140)}px`;
    del.focus();
  }
  document.addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest?.('.lf-more')) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); closeMenu(); } }, true);

  function set(next) {
    pick = next?.label ? { kind: 'any', label: next.label } : null;
    render();
    onChange?.();
  }

  function show(state) {
    open = state;
    panel.hidden = !open;
    render();
    if (open) search?.focus({ preventScroll: true });
  }

  button.addEventListener('click', (e) => {
    if (e.target.closest('.lf-clear')) { set(null); return; }
    show(!open);
  });
  search?.addEventListener('input', render);
  search?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); show(false); button.focus(); }
    if (e.key === 'Enter') { e.preventDefault(); panel.querySelector('.label-chip')?.click(); }
  });
  document.addEventListener('mousedown', (e) => {
    if (open && !panel.contains(e.target) && !button.contains(e.target) && !menu.contains(e.target)) show(false);
  });

  render();
  return {
    matches: (n) => noteHasLabel(n, pick),
    set,
    render,
    active: () => pick,
  };
}
