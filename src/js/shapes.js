/**
 * Free-floating shapes — they live on ONE overlay layer that spans the whole
 * note and can be dragged anywhere in it (wrap: through — text flows under
 * them, nothing reflows). Positions are stored in the note HTML, so they
 * persist like any other content.
 */

export const SHAPE_COLORS = ['#E8CDBD', '#D6E4D0', '#D3E0EA', '#E2D7E8', '#F0D2CE', '#EFE8D8'];
export const SHAPE_KINDS = ['rect', 'ellipse', 'diamond'];

/** The overlay is created lazily and always sits as the note's first child. */
export function ensureLayer(editorEl) {
  let layer = editorEl.querySelector(':scope > .shape-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'shape-layer';
    layer.setAttribute('contenteditable', 'false');
    layer.dataset.blockType = 'shape-layer';
    editorEl.insertBefore(layer, editorEl.firstChild);
  }
  return layer;
}

let cascade = 0;

export function makeShape(kind = 'rect', color = SHAPE_COLORS[0], at = null) {
  const el = document.createElement('div');
  el.className = `shape ${kind}`;
  el.dataset.kind = kind;
  cascade = (cascade + 1) % 8;
  const left = at?.left ?? 40 + cascade * 28;
  const top = at?.top ?? 40 + cascade * 24;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = '150px';
  el.style.height = '90px';
  el.style.background = color;
  el.innerHTML = '<div class="shape-text" contenteditable="true"></div><span class="shape-h" title="Resize"></span>';
  return el;
}

export function addShape(editorEl, kind) {
  const layer = ensureLayer(editorEl);
  const shape = makeShape(kind, SHAPE_COLORS[0], { left: 40 + cascade * 28, top: (editorEl.scrollTop || 0) + 40 + cascade * 24 });
  layer.appendChild(shape);
  editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  return shape;
}

export function initShapes(editorEl) {
  if (!editorEl) return null;
  let drag = null;
  let selected = null;

  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  function select(el) {
    editorEl.querySelectorAll('.shape.sel').forEach((s) => s.classList.remove('sel'));
    selected = el ?? null;
    selected?.classList.add('sel');
    document.getElementById('shape-bar')?.toggleAttribute('hidden', !selected);
    if (selected) positionBar();
  }

  function positionBar() {
    const bar = document.getElementById('shape-bar');
    if (!bar || !selected) return;
    const r = selected.getBoundingClientRect();
    bar.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 250))}px`;
    bar.style.top = `${Math.max(8, r.top - 42)}px`;
  }

  editorEl.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.shape-h');
    const shape = e.target.closest('.shape');
    if (!shape) {
      if (!e.target.closest('#shape-bar')) select(null);
      return;
    }
    select(shape);
    if (e.target.closest('.shape-text') && !handle) return; // typing inside
    e.preventDefault();
    drag = {
      el: shape,
      kind: handle ? 'resize' : 'move',
      startX: e.clientX,
      startY: e.clientY,
      left: parseFloat(shape.style.left) || 0,
      top: parseFloat(shape.style.top) || 0,
      w: shape.offsetWidth,
      h: shape.offsetHeight,
    };
  });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.kind === 'move') {
      // free movement across the whole note — only kept out of negative space
      drag.el.style.left = `${Math.max(0, drag.left + dx)}px`;
      drag.el.style.top = `${Math.max(0, drag.top + dy)}px`;
    } else {
      drag.el.style.width = `${Math.max(48, drag.w + dx)}px`;
      drag.el.style.height = `${Math.max(34, drag.h + dy)}px`;
    }
    positionBar();
  });

  window.addEventListener('mouseup', () => {
    if (drag) { drag = null; dirty(); }
  });

  editorEl.addEventListener('scroll', () => { if (selected) positionBar(); });

  editorEl.addEventListener('dblclick', (e) => {
    const shape = e.target.closest('.shape');
    if (!shape) return;
    const text = shape.querySelector('.shape-text');
    text?.focus();
    if (text) {
      const r = document.createRange();
      r.selectNodeContents(text);
      r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
  });

  // floating shape toolbar (colors + delete + send back/front)
  const bar = document.getElementById('shape-bar');
  if (bar) {
    bar.innerHTML =
      SHAPE_COLORS.map((c) => `<span class="dot" data-color="${c}" style="background:${c}" title="Color"></span>`).join('') +
      '<button type="button" data-shape="back" title="Send behind text">▾</button>' +
      '<button type="button" data-shape="front" title="Bring above text">▴</button>' +
      '<button type="button" data-shape="del" title="Delete shape">✕</button>';
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    bar.addEventListener('click', (e) => {
      if (!selected) return;
      const color = e.target.closest('.dot')?.dataset.color;
      if (color) { selected.style.background = color; dirty(); return; }
      const act = e.target.closest('[data-shape]')?.dataset.shape;
      if (act === 'del') { selected.remove(); select(null); dirty(); }
      else if (act === 'back') { selected.classList.add('behind'); dirty(); }
      else if (act === 'front') { selected.classList.remove('behind'); dirty(); }
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected &&
        !document.activeElement?.classList?.contains('shape-text')) {
      e.preventDefault();
      selected.remove();
      select(null);
      dirty();
    }
  });

  return { addShape: (kind) => select(addShape(editorEl, kind)), select };
}
