/**
 * How large a new table is to be (0.9.4).
 *
 * The owner, in the "urgent bugs" note: "when a table is added there has to
 * be a setting for its size." The Table button and /table open this instead
 * of making a table at once: a grid of small squares — the pointer over one
 * says "so many rows by so many columns", a click makes it — and under it the
 * two numbers, to type a size the grid does not reach.
 *
 * Nothing here takes the caret from the note unless a number is clicked: the
 * arrows change the size, Enter makes the table (five by five when nothing was
 * touched), Escape or a press anywhere else closes it.
 */

import { t } from './i18n.js';
import { NEW_ROWS, NEW_COLS, MAX_ROWS, MAX_COLS } from './table-grid.js';

/**
 * The squares shown. Ten across left room beside them over the two numbers;
 * the owner (the "urgent bugs" note, 0.9.4): "twelve boxes fit, I think — 8x12".
 */
export const GRID_ROWS = 8;
export const GRID_COLS = 12;

let closeOpen = null;

/**
 * @param {{left: number, top: number, bottom: number}} anchor where it opens: under this, or over it where there is no room
 * @param {{rows?: number, cols?: number}} [start]
 * @returns {Promise<{rows: number, cols: number}|null>} null when it was closed without a choice
 */
export function pickTableSize(anchor, { rows = NEW_ROWS, cols = NEW_COLS } = {}) {
  closeOpen?.();
  return new Promise((resolve) => {
    const size = { rows, cols };
    const box = document.createElement('div');
    box.className = 'float-menu tbl-size';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('Table'));

    const grid = document.createElement('div');
    grid.className = 'tbl-size__grid';
    grid.style.setProperty('--cols', String(GRID_COLS));
    const squares = [];
    for (let r = 1; r <= GRID_ROWS; r += 1) {
      for (let c = 1; c <= GRID_COLS; c += 1) {
        const square = document.createElement('span');
        square.dataset.r = String(r);
        square.dataset.c = String(c);
        squares.push(square);
        grid.appendChild(square);
      }
    }

    const fields = document.createElement('div');
    fields.className = 'tbl-size__fields';
    const field = (label, max, key) => {
      const wrap = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = t(label);
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.max = String(max);
      input.step = '1';
      input.dataset.size = key;
      input.setAttribute('aria-label', t(label));
      input.addEventListener('input', () => {
        const n = Math.round(Number(input.value));
        if (Number.isFinite(n) && n >= 1) { size[key] = Math.min(max, n); paint(input); }
      });
      wrap.append(name, input);
      fields.appendChild(wrap);
      return input;
    };
    const rowsIn = field('Rows', MAX_ROWS, 'rows');
    const colsIn = field('Columns', MAX_COLS, 'cols');
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'tbl-size__go';
    go.textContent = t('Insert');
    fields.appendChild(go);

    function paint(skip = null) {
      for (const square of squares) square.classList.toggle('on', Number(square.dataset.r) <= size.rows && Number(square.dataset.c) <= size.cols);
      if (skip !== rowsIn) rowsIn.value = String(size.rows);
      if (skip !== colsIn) colsIn.value = String(size.cols);
    }

    let done = false;
    function finish(result) {
      if (done) return;
      done = true;
      closeOpen = null;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', cancel);
      box.remove();
      resolve(result);
    }
    const cancel = () => finish(null);
    const accept = () => finish({ rows: Math.max(1, Math.min(MAX_ROWS, size.rows)), cols: Math.max(1, Math.min(MAX_COLS, size.cols)) });
    closeOpen = cancel;

    function onKey(e) {
      const typing = e.target === rowsIn || e.target === colsIn;
      if (e.key === 'Escape' || e.key === 'Tab' && !typing) { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); accept(); return; }
      if (typing) { e.stopPropagation(); return; }           // the number is being typed: the keys are its own
      const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      // Anything else typed goes to the note as before, and this is in the way no longer.
      if (!step) { if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) cancel(); return; }
      e.preventDefault();
      e.stopPropagation();
      size.rows = Math.max(1, Math.min(MAX_ROWS, size.rows + step[0]));
      size.cols = Math.max(1, Math.min(MAX_COLS, size.cols + step[1]));
      paint();
    }
    function onDown(e) {
      if (!box.contains(e.target)) cancel();
    }

    grid.addEventListener('mousemove', (e) => {
      const square = e.target.closest('span[data-r]');
      if (!square) return;
      size.rows = Number(square.dataset.r);
      size.cols = Number(square.dataset.c);
      paint();
    });
    grid.addEventListener('click', (e) => { if (e.target.closest('span[data-r]')) accept(); });
    go.addEventListener('click', accept);
    // A press in it does not take the caret from the note — but a number can be clicked to type one.
    box.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });

    box.append(grid, fields);
    document.body.appendChild(box);
    paint();
    const w = box.offsetWidth || 220;
    const h = box.offsetHeight || 200;
    const under = anchor.bottom + 6;
    box.style.left = `${Math.max(6, Math.min(anchor.left, window.innerWidth - w - 6))}px`;
    box.style.top = `${under + h > window.innerHeight - 6 && anchor.top - h - 6 > 6 ? anchor.top - h - 6 : Math.max(6, Math.min(under, window.innerHeight - h - 6))}px`;

    document.addEventListener('keydown', onKey, true);
    // After this press has passed: the one that opened it must not close it.
    setTimeout(() => { if (!done) document.addEventListener('mousedown', onDown, true); }, 0);
    window.addEventListener('blur', cancel);
  });
}

/** Whether the size of a new table is being picked. */
export const pickingTableSize = () => !!closeOpen;
