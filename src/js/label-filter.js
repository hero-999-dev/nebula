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
 * Show where a label is in the open note (0.9.4, the owner: "the label search
 * lists the notes; when I press one of them it should show the places the
 * label is, the way Ctrl+F does"). The #chips of that label are painted with
 * the CSS Custom Highlight API — like the find bar, nothing in the note is
 * marked up, so nothing is saved or undone.
 * @param {Element} root the editor
 * @param {string|null|undefined} label none clears the paint
 * @returns {Element[]} the chips of that label, in order
 */
const LABEL_HIT = 'nebula-label-hit';
const LABEL_HIT_CURRENT = 'nebula-label-hit-current';
export function paintLabelHits(root, label, current = -1) {
  const can = typeof CSS !== 'undefined' && typeof CSS.highlights !== 'undefined' && typeof Highlight === 'function';
  if (can) { CSS.highlights.delete(LABEL_HIT); CSS.highlights.delete(LABEL_HIT_CURRENT); }
  const want = String(label ?? '').toLocaleLowerCase();
  if (!root || !want) return [];
  const chips = [...root.querySelectorAll('span.note-tag')]
    .filter((chip) => String(chip.dataset.tag || chip.textContent.replace(/^#/, '')).toLocaleLowerCase() === want);
  if (can && chips.length) {
    const range = (chip) => { const r = root.ownerDocument.createRange(); r.selectNodeContents(chip); return r; };
    // The one stepped to stands out from the rest, as the find bar's does.
    const rest = chips.filter((_, i) => i !== current).map(range);
    if (rest.length) CSS.highlights.set(LABEL_HIT, new Highlight(...rest));
    if (chips[current]) CSS.highlights.set(LABEL_HIT_CURRENT, new Highlight(range(chips[current])));
  }
  return chips;
}

/**
 * The little bar that steps through a label's places in the open note (0.9.4,
 * the owner: "it lights up like Ctrl+F, but with several in one note there is
 * no going from one to the next"). The find bar's look and the find bar's
 * place: the label, "2 of 5", ↑ ↓ and ✕. ✕ puts the bar and the paint away
 * until another note is opened or another label picked.
 * @param {HTMLElement} editorEl
 * @param {{frame?: HTMLElement}} [opts]
 */
export function initLabelHits(editorEl, { frame = editorEl?.parentElement } = {}) {
  if (!editorEl || !frame) return { show: () => [], clear() {} };
  const bar = document.createElement('div');
  bar.className = 'find-bar label-bar';
  bar.id = 'label-bar';
  bar.hidden = true;
  bar.innerHTML = '<span class="label-bar__name" data-no-i18n></span><span class="find-count"></span>'
    + '<button type="button" class="find-btn" data-hit="prev" title="Previous">↑</button>'
    + '<button type="button" class="find-btn" data-hit="next" title="Next">↓</button>'
    + '<button type="button" class="find-btn" data-hit="close" title="Close">✕</button>';
  frame.append(bar);
  const nameEl = bar.querySelector('.label-bar__name');
  const countEl = bar.querySelector('.find-count');

  let label = null;
  let chips = [];
  let index = 0;
  let dismissed = false;

  function draw({ reveal = false } = {}) {
    if (dismissed || !label) {
      paintLabelHits(editorEl, null);
      bar.hidden = true;
      return;
    }
    chips = paintLabelHits(editorEl, label, index);
    if (index >= chips.length) { index = Math.max(0, chips.length - 1); chips = paintLabelHits(editorEl, label, index); }
    bar.hidden = !chips.length;
    nameEl.textContent = `#${label}`;
    countEl.textContent = chips.length ? `${index + 1} of ${chips.length}` : '';
    // With one place there is nowhere to step to.
    for (const b of bar.querySelectorAll('[data-hit="prev"], [data-hit="next"]')) b.hidden = chips.length < 2;
    if (reveal && chips[index]) {
      const view = editorEl.getBoundingClientRect();
      const at = chips[index].getBoundingClientRect();
      if (at.top < view.top || at.bottom > view.bottom) chips[index].scrollIntoView({ block: 'center' });
    }
  }

  bar.addEventListener('mousedown', (e) => e.preventDefault());     // the caret stays in the note
  bar.addEventListener('click', (e) => {
    const act = e.target.closest('[data-hit]')?.dataset.hit;
    if (!act) return;
    if (act === 'close') { dismissed = true; draw(); return; }
    if (!chips.length) return;
    index = (index + (act === 'next' ? 1 : chips.length - 1)) % chips.length;
    draw({ reveal: true });
  });

  return {
    /**
     * @param {string|null} next the label picked in the filter, or none
     * @param {{opened?: boolean}} [how] a note was just opened: start at its first place, in view
     * @returns {Element[]} the label's chips in the note
     */
    show(next, { opened = false } = {}) {
      const changed = String(next ?? '').toLocaleLowerCase() !== String(label ?? '').toLocaleLowerCase();
      label = next || null;
      if (changed || opened) { index = 0; dismissed = false; }
      draw({ reveal: opened || changed });
      return dismissed || !label ? [] : chips;
    },
    clear() { label = null; draw(); },
  };
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
