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
 *   - a misspelt word: the suggestions, and "Add to dictionary"
 *   - a picture: copy it (as a picture, for any program), its caption, delete
 *   - words selected: the formatting bar, as before
 *   - anywhere else in the note: paste and select all
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
 * @param {(x: number, y: number) => void} [deps.miniBarAt] the formatting bar
 * @param {() => boolean} [deps.isLocked] Only view
 */
export function initContextMenu(editorEl, { history, images, miniBarAt, isLocked = () => false } = {}) {
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

  function place(x, y) {
    menu.hidden = false;
    const w = menu.offsetWidth || 220;
    const h = menu.offsetHeight || 120;
    menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - w - 6))}px`;
    menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - h - 6))}px`;
    menu.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
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

    // A misspelt word: its corrections first, the way every word processor does it.
    if (facts.misspelledWord && !locked) {
      const words = facts.suggestions ?? [];
      if (!words.length) item(t('No suggestions'), null, { disabled: true });
      for (const word of words) {
        item(word, () => {
          history?.push();            // one Ctrl+Z takes the correction back
          void window.nebula.spell.replace(word);
        }, { strong: true });
      }
      rule();
      item(t('Add to dictionary'), () => { void window.nebula.spell.add(facts.misspelledWord); });
      place(x, y);
      return;
    }

    const picture = target.closest('.note-image');
    if (picture && !target.closest('.image-caption')) {
      if (!locked) images?.selectImage?.(picture);
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

    const range = selectionInEditor();
    if (range && !range.collapsed && !target.closest('.code-src') && !locked) {
      miniBarAt?.(x, y);
      return;
    }

    if (locked) {
      if (range && !range.collapsed) { item(t('Copy'), () => document.execCommand('copy')); place(x, y); }
      return;
    }
    item(t('Paste'), () => { void images?.paste?.(); });
    item(t('Select all'), () => {
      editorEl.focus();
      const r = document.createRange();
      r.selectNodeContents(editorEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    });
    place(x, y);
  });

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
