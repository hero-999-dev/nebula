/**
 * Inline equations, typeset with KaTeX — the engine Notion uses.
 *
 * The old button only wrapped the selection in a span called `inline-eq` and
 * italicised it; nothing was ever typeset. This is the real thing: a small
 * popover takes LaTeX, shows it rendered as you type, and drops the result into
 * the note.
 *
 * The stored form is the SOURCE, not the rendering:
 *
 *     <span class="inline-eq" data-tex="\frac{a}{b}" contenteditable="false">…</span>
 *
 * and `paintAllEquations()` regenerates the inside from `data-tex` every time a
 * note loads — the same rule code blocks follow with `data-code`. Saved HTML is
 * never trusted to be correct KaTeX markup, and a KaTeX upgrade re-renders old
 * notes instead of leaving them frozen.
 *
 * KaTeX and its fonts are bundled, so this works with no network.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';

const RENDER_OPTIONS = {
  throwOnError: false,   // a half-typed formula shows red, it does not explode
  errorColor: 'var(--madder)',
  output: 'html',
  strict: false,
};

/** Typeset one equation node from its `data-tex`. */
export function paintEquation(el) {
  const tex = el.dataset.tex ?? '';
  try {
    el.innerHTML = katex.renderToString(tex, RENDER_OPTIONS);
  } catch {
    el.textContent = tex; // never leave a blank gap where maths should be
  }
  el.setAttribute('contenteditable', 'false');
  el.title = tex;
}

/** Typeset every equation in a loaded note. */
export function paintAllEquations(root) {
  root?.querySelectorAll('.inline-eq').forEach((el) => {
    // Notes written before KaTeX have no data-tex; adopt their text as source.
    if (el.dataset.tex === undefined) el.dataset.tex = el.textContent.trim();
    paintEquation(el);
  });
}

export function makeEquation(doc, tex) {
  const el = doc.createElement('span');
  el.className = 'inline-eq';
  el.dataset.tex = tex;
  paintEquation(el);
  return el;
}

/**
 * @param {HTMLElement} editorEl
 * @param {object} opts
 * @param {() => void} opts.dirty  mark the note changed
 */
export function initEquation(editorEl, { dirty } = {}) {
  const pop = document.getElementById('eq-pop');
  const input = document.getElementById('eq-input');
  const preview = document.getElementById('eq-preview');
  if (!pop || !input || !preview || !editorEl) return null;

  // The selection dies the moment focus moves to the input, so it is saved.
  let savedRange = null;
  let editing = null; // an existing equation being changed

  function renderPreview() {
    const tex = input.value.trim();
    if (!tex) {
      preview.innerHTML = '<span class="eq-empty">Type LaTeX to see it here</span>';
      return;
    }
    try {
      preview.innerHTML = katex.renderToString(tex, RENDER_OPTIONS);
    } catch (err) {
      preview.textContent = err.message;
    }
  }

  function place(rect) {
    pop.hidden = false;
    const w = pop.offsetWidth || 320;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    const below = rect.bottom + 8;
    const fitsBelow = below + pop.offsetHeight < window.innerHeight - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${fitsBelow ? below : Math.max(8, rect.top - pop.offsetHeight - 8)}px`;
  }

  function close() {
    pop.hidden = true;
    editing = null;
    savedRange = null;
  }

  function open({ tex = '', node = null, rect = null } = {}) {
    editing = node;
    const sel = window.getSelection();
    savedRange = !node && sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;

    input.value = tex;
    renderPreview();
    place(rect ?? (savedRange?.getBoundingClientRect() ?? editorEl.getBoundingClientRect()));
    input.focus();
    input.select();
  }

  function commit() {
    const tex = input.value.trim();
    if (!tex) { close(); return; }

    if (editing) {
      editing.dataset.tex = tex;
      paintEquation(editing);
    } else {
      const el = makeEquation(document, tex);
      const range = savedRange;
      if (range) {
        range.deleteContents();
        range.insertNode(el);
        // Land the caret after the equation so typing continues normally.
        const after = document.createRange();
        const tail = document.createTextNode(' ');
        el.after(tail);
        after.setStart(tail, 1);
        after.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(after);
      } else {
        editorEl.appendChild(el);
      }
    }
    close();
    editorEl.focus();
    dirty?.();
  }

  input.addEventListener('input', renderPreview);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); editorEl.focus(); }
  });
  document.getElementById('eq-ok')?.addEventListener('click', commit);
  document.getElementById('eq-cancel')?.addEventListener('click', () => { close(); editorEl.focus(); });

  document.addEventListener('mousedown', (e) => {
    if (!pop.hidden && !e.target.closest('#eq-pop') && !e.target.closest('.inline-eq')) close();
  });

  // Clicking a finished equation reopens it on its own source.
  editorEl.addEventListener('click', (e) => {
    const el = e.target.closest('.inline-eq');
    if (!el) return;
    e.preventDefault();
    open({ tex: el.dataset.tex ?? '', node: el, rect: el.getBoundingClientRect() });
  });

  return {
    /** Ctrl+Q / the toolbar button. Seeds from the selection if there is one. */
    open() {
      const sel = window.getSelection();
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      const inside = range && editorEl.contains(range.commonAncestorContainer);
      open({ tex: inside ? range.toString().trim() : '' });
    },
    close,
    isOpen: () => !pop.hidden,
  };
}
