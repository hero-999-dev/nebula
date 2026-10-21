/**
 * Right-click in the note (0.9.3).
 *
 * The owner, twice in the Ideas note: "a right-click on the word with the red
 * underline should offer corrections, the way Office does". Electron draws no
 * context menu of its own, so a right-click on a misspelt word did nothing at
 * all. Only the main process learns what Chromium's spellchecker found
 * (electron/context-menu.js); it sends that here, and the menu is drawn in the
 * app's own style and language:
 *
 * One menu everywhere in the note (0.9.4). There were four — over a misspelt
 * word, over selected words, in a table, and anywhere else — and the owner,
 * with a snapshot of each: "let THIS one be the main menu, and the others be
 * joined with it", pointing at the one over selected words. So:
 *
 *   - the formatting bar as the first row;
 *   - on a misspelt word: its suggestions, "Add to dictionary" and "Ignore";
 *   - in a table (table.js): a row put in above or below the cell, a column at
 *     its left or right, its row, its column or the whole table deleted;
 *   - cut and copy (grey with nothing selected), paste three ways (as Nebula
 *     format, as the original, only the text) and select all.
 *
 * Apart from it: a picture has its own (copy it, its caption, delete); a
 * table's numbering offers that row's or column's choices alone, and its
 * corner "Delete table"; a locked note offers Copy.
 *
 * In a browser preview there is no main process, and the old behaviour (the
 * formatting bar over a selection) stays with toolbar.js.
 */

import { t } from './i18n.js';

/**
 * @param {HTMLElement} editorEl
 * @param {object} deps
 * @param {{push: () => void}} [deps.history]
 * @param {object} [deps.images] rich-paste.js: copyImage, editCaption, deleteImage, selectImage, paste
 * @param {(x: number, y: number) => void} [deps.miniBarAt] the formatting bar on its own (no `format`)
 * @param {{bar: HTMLElement, run: (act: string) => void}} [deps.format] the formatting bar and its commands
 * @param {{menu: (target: Element) => Array|null}} [deps.tables] table.js: what a table offers for the cell that was clicked
 * @param {() => boolean} [deps.isLocked] Only view
 */
export function initContextMenu(editorEl, { history, images, miniBarAt, format, tables, isLocked = () => false } = {}) {
  const bridge = window.nebula?.contextMenu;
  if (!editorEl || !bridge?.on) return null;

  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'float-menu ctx-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.append(menu);

  // Where the pointer was: the DOM event comes first, and its coordinates are
  // the page's own (the main process reports window pixels, which differ once
  // the window is zoomed).
  let last = null;
  document.addEventListener('contextmenu', (e) => {
    last = { x: e.clientX, y: e.clientY, target: e.target, at: Date.now() };
  }, true);

  const close = () => { menu.hidden = true; menu.replaceChildren(); };

  function item(label, run, { strong = false, disabled = false } = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    if (strong) b.style.fontWeight = '600';
    b.disabled = disabled;
    b.addEventListener('click', () => { close(); run?.(); });
    menu.append(b);
    return b;
  }
  function rule() {
    const hr = document.createElement('div');
    hr.className = 'ctx-rule';
    menu.append(hr);
  }

  function place(x, y, { focus = true } = {}) {
    menu.hidden = false;
    const w = menu.offsetWidth || 220;
    const h = menu.offsetHeight || 120;
    menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - w - 6))}px`;
    menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - h - 6))}px`;
    // The first of its choices, not a button of the formatting row.
    if (focus) menu.querySelector(':scope > button:not([disabled])')?.focus({ preventScroll: true });
  }

  function selectionInEditor() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const r = sel.getRangeAt(0);
    return editorEl.contains(r.commonAncestorContainer) ? r : null;
  }

  bridge.on((facts) => {
    close();
    const recent = last && Date.now() - last.at < 1500 ? last : null;
    const x = recent?.x ?? facts.x;
    const y = recent?.y ?? facts.y;
    const target = recent?.target ?? document.elementFromPoint(x, y);
    last = null;
    if (!target || !editorEl.contains(target)) return;
    const locked = isLocked();

    const picture = target.closest('.note-image');
    if (picture && !target.closest('.image-caption')) {
      if (!locked) images?.selectImage?.(picture);
      // A widget is no picture (1.0.0, the owner): it has no caption, and it is copied and deleted as a widget.
      if (picture.matches('.note-widget')) {
        item(t('Copy widget'), () => { void images?.copyImage?.(picture); });
        if (!locked) {
          rule();
          item(t('Delete widget'), () => images?.deleteImage?.(picture));
        }
        place(x, y);
        return;
      }
      item(t('Copy image'), () => { void images?.copyImage?.(picture); });
      if (!locked) {
        const hasCaption = !!picture.querySelector('.image-caption')?.textContent.trim();
        item(t(hasCaption ? 'Edit caption' : 'Add caption'), () => images?.editCaption?.(picture));
        rule();
        item(t('Delete image'), () => images?.deleteImage?.(picture));
      }
      place(x, y);
      return;
    }

    // A table's numbering is no place to paste: its row's or its column's choices, and nothing else.
    if (target.closest('.blk-table th')) {
      if (tableItems(target)) place(x, y);
      return;
    }

    const range = selectionInEditor();
    const words = !!range && !range.collapsed;
    if (locked) {
      if (words) { item(t('Copy'), () => document.execCommand('copy')); place(x, y); }
      return;
    }
    // The caret is remembered now: the paste must land where the click was.
    const at = range ? range.cloneRange() : null;
    // Code is not dressed: its menu has no formatting row.
    const inCode = !!target.closest('.code-src');
    if (!inCode && !formatRow() && words) { miniBarAt?.(x, y); return; }

    // A misspelt word: its corrections, the way every word processor offers them.
    if (facts.misspelledWord) {
      const found = facts.suggestions ?? [];
      if (!found.length) item(t('No suggestions'), null, { disabled: true });
      for (const word of found) {
        item(word, () => {
          history?.push();            // one Ctrl+Z takes the correction back
          void window.nebula.spell.replace(word);
        }, { strong: true });
      }
      item(t('Add to dictionary'), () => { void window.nebula.spell.add(facts.misspelledWord); });
      // Ignore (0.9.4): left alone until the app closes, and not kept after.
      if (window.nebula.spell.ignore) item(t('Ignore'), () => { void window.nebula.spell.ignore(facts.misspelledWord); });
      rule();
    }
    if (tableItems(target)) rule();
    // Cells selected in a table are cut and copied as cells (table.js), with no words selected.
    const some = words || !!tables?.selection?.()?.ranged;
    item(t('Cut'), () => document.execCommand('cut'), { disabled: !some });
    item(t('Copy'), () => document.execCommand('copy'), { disabled: !some });
    pasteItems(at);
    rule();
    selectAllItem();
    // The words stay selected while it is open — nothing in it takes the focus.
    place(x, y, { focus: !words });
  });

  /**
   * In a table: rows and columns put in beside the cell that was clicked, or
   * taken away (the owner, 0.9.4: "a right-click, then add column and add
   * row"). table.js says what there is and does it.
   * @returns {boolean} whether anything was offered
   */
  function tableItems(target) {
    const rows = tables?.menu?.(target);
    if (!rows?.length) return false;
    for (const row of rows) {
      if (row) item(t(row[0]), row[1]);
      else rule();
    }
    return true;
  }

  /**
   * Two ways to paste, at `at` — a caret, or words to replace (the owner, 0.9.4;
   * a third, "Paste only text", was taken away again: "for now, like this").
   */
  function pasteItems(at) {
    item(t('Paste as Nebula format'), () => { void images?.paste?.('nebula', at); });
    item(t('Paste original format'), () => { void images?.paste?.('original', at); });
  }

  function selectAllItem() {
    item(t('Select all'), () => {
      editorEl.focus();
      const r = document.createRange();
      r.selectNodeContents(editorEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    });
  }

  /**
   * The formatting bar's buttons as the menu's first row: the same marks, the
   * same commands (toolbar.js), drawn from the bar itself so the two cannot
   * drift apart.
   * @returns {boolean} whether there was a bar to draw
   */
  function formatRow() {
    const bar = format?.bar;
    if (!bar || !format.run) return false;
    const row = document.createElement('div');
    row.className = 'ctx-format';
    row.setAttribute('role', 'group');
    for (const child of bar.children) {
      if (!child.dataset?.act) {
        const sep = document.createElement('span');
        sep.className = 'mb-sep';
        row.append(sep);
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.title = child.title;
      b.setAttribute('aria-label', child.title);
      b.dataset.act = child.dataset.act;
      b.innerHTML = child.innerHTML;
      b.addEventListener('click', () => { close(); format.run(child.dataset.act); });
      row.append(b);
    }
    menu.append(row, Object.assign(document.createElement('div'), { className: 'ctx-rule' }));
    return true;
  }

  // A press in the menu must not take the selection from the note.
  menu.addEventListener('mousedown', (e) => e.preventDefault());

  document.addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const all = [...menu.querySelectorAll('button:not([disabled])')];
      const i = all.indexOf(document.activeElement);
      all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
    }
  }, true);
  window.addEventListener('blur', close);
  editorEl.addEventListener('scroll', close);

  return { close, element: menu };
}
