/**
 * Free-floating shapes — they live on ONE overlay layer that spans the whole
 * note and can be dragged anywhere in it (wrap: through — text flows under
 * them, nothing reflows). Positions are stored in the note HTML, so they
 * persist like any other content.
 */

export const SHAPE_COLORS = ['#E8CDBD', '#D6E4D0', '#D3E0EA', '#E2D7E8', '#F0D2CE', '#EFE8D8'];

export const SHAPE_KINDS = ['rect', 'ellipse', 'diamond', 'triangle'];

/**
 * Two overlays, created lazily as the note's first children: one painted under
 * the text and one over it. "Send behind text" moves a shape between them —
 * with a single layer it could only ever be faded, never actually behind.
 */
export function ensureLayer(editorEl, behind = false) {
  const cls = behind ? 'shape-layer shape-layer--behind' : 'shape-layer';
  const sel = behind ? ':scope > .shape-layer--behind' : ':scope > .shape-layer:not(.shape-layer--behind)';
  let layer = editorEl.querySelector(sel);
  if (!layer) {
    layer = document.createElement('div');
    layer.className = cls;
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
  // The diamond and the triangle are clipped, so their fill is painted by a
  // pseudo-element inset from the edge — and CSS cannot read an inline
  // `background`. Both are set; the rectangle and ellipse use the first, the
  // clipped kinds the second.
  el.style.setProperty('--shape-fill', color);
  // A <br>, not nothing: an empty contenteditable has no line box, so Chromium
  // paints no caret in it — you double-click in and there is no sign at all
  // that you may type.
  el.innerHTML = '<div class="shape-text" contenteditable="true"><br></div><span class="shape-h" title="Resize"></span>';
  return el;
}

export function addShape(editorEl, kind, history) {
  history?.push();
  const layer = ensureLayer(editorEl);
  const shape = makeShape(kind, SHAPE_COLORS[0], { left: 40 + cascade * 28, top: (editorEl.scrollTop || 0) + 40 + cascade * 24 });
  layer.appendChild(shape);
  editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  return shape;
}

export function initShapes(editorEl, { history } = {}) {
  if (!editorEl) return null;
  let drag = null;
  let selected = null;

  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  function select(el) {
    editorEl.querySelectorAll('.shape.sel').forEach((s) => s.classList.remove('sel'));
    if (!el) editorEl.querySelectorAll('.shape.editing').forEach((s) => s.classList.remove('editing'));
    selected = el ?? null;
    selected?.classList.add('sel');
    document.getElementById('shape-bar')?.toggleAttribute('hidden', !selected);
    if (selected) positionBar();
  }

  function positionBar() {
    const bar = document.getElementById('shape-bar');
    if (!bar || !selected) return;
    // Switching notes replaces the editor's innerHTML, so the selected shape can
    // already be detached. Its rect is then 0,0 and the bar parks in the corner
    // with nothing to act on.
    if (!selected.isConnected) { select(null); return; }
    const r = selected.getBoundingClientRect();
    const w = bar.offsetWidth || 250;
    const h = bar.offsetHeight || 34;
    // Above the shape by default, below it when the shape is near the top, and
    // never off the window: a bar parked outside the viewport takes its buttons
    // — including the one that deletes the shape — out of reach.
    const top = r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(r.bottom + 8, window.innerHeight - h - 8);
    bar.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    bar.style.top = `${Math.max(8, top)}px`;
  }

  /**
   * Mousedowns the editor handler has already taken for a shape.
   *
   * The document listener below bubbles LAST, so without this it would look at
   * a click that had just picked up a buried shape, see that its target is a
   * paragraph rather than a shape, and deselect it again — the selection would
   * exist for microseconds and nothing would appear to happen.
   */
  const claimed = new WeakSet();

  // Deselect on ANY click that is not on a shape or on the bar itself. Listening
  // only on the editor left the bar stuck open the moment you clicked the
  // sidebar, the toolbar, or another note.
  document.addEventListener('mousedown', (e) => {
    if (!selected || claimed.has(e)) return;
    if (e.target.closest('.shape') || e.target.closest('#shape-bar')) return;
    select(null);
  });

  /**
   * The topmost shape whose box contains a point, ignoring what is painted over
   * it. A shape sent behind the text is painted UNDER it, so the paragraph on
   * top receives every click and the shape cannot be selected at all — it is
   * "completely buried". Front shapes get their clicks the ordinary way; this
   * is only consulted for the ones behind.
   */
  function behindShapeAt(x, y) {
    let hit = null;
    for (const s of editorEl.querySelectorAll('.shape-layer--behind .shape')) {
      const r = s.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = s; // last = topmost
    }
    return hit;
  }

  editorEl.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.shape-h');
    let shape = e.target.closest('.shape');
    if (!shape) {
      // Nothing was hit directly. Before letting the click place a caret, check
      // whether a shape is sitting under the text at this point.
      //
      // 0.4.4 only took the click when that shape was NOT already selected,
      // which meant every press after the first one fell through — and since a
      // drag begins with a press, a shape behind the text could be selected but
      // never moved. The press always goes to the shape now; reaching the text
      // underneath is handled on mouseUP instead, below.
      shape = behindShapeAt(e.clientX, e.clientY);
    }
    if (!shape) return; // the document listener above already deselected
    claimed.add(e); // ...and it must not undo what happens next
    const wasSelected = shape === selected;
    // Leaving edit mode on any other shape, so the next click grabs it rather
    // than landing in its text.
    editorEl.querySelectorAll('.shape.editing').forEach((s) => {
      if (s !== shape) s.classList.remove('editing');
    });
    select(shape);
    // Only a shape that is BEING EDITED gives its click to the text. Otherwise
    // the whole body of the shape is a drag handle — the text used to cover it
    // completely, so a drag could only start from the 1.6px border.
    if (shape.classList.contains('editing') && e.target.closest('.shape-text') && !handle) return;
    e.preventDefault();
    // One snapshot for the whole gesture, taken before the first pixel moves.
    history?.push();
    drag = {
      wasSelected,
      moved: false,
      downX: e.clientX,
      downY: e.clientY,
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
    if (Math.abs(e.clientX - drag.downX) > 2 || Math.abs(e.clientY - drag.downY) > 2) drag.moved = true;
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

  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    const { el, moved, wasSelected } = drag;
    drag = null;
    if (moved) { dirty(); return; }

    // A press that never moved is a click. On a shape that was ALREADY
    // selected it means "let me at what is here": the shape's own text if the
    // pointer is over it, otherwise the paragraph underneath — which is the
    // only way to reach text that a behind-shape is covering.
    if (!wasSelected) return;
    if (e.target.closest('.shape-text')) { startEditing(el); return; }
    if (el.classList.contains('behind')) {
      select(null);
      const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (range && editorEl.contains(range.startContainer)) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        editorEl.focus();
      }
    }
  });

  /**
   * Grow a shape to fit what has been typed in it.
   *
   * `.shape-text` clips, so a long line simply disappeared instead of
   * overflowing anywhere visible. The shape gains height (and a little width,
   * up to a sane cap) until the text fits.
   */
  function fitToText(shape) {
    const text = shape?.querySelector('.shape-text');
    if (!text) return;
    // The text sizes itself; what runs out is the SHAPE. A diamond or a
    // triangle only shows its middle, so the same words need more room in one.
    const slack = shape.classList.contains('rect') || shape.classList.contains('ellipse') ? 14 : 40;
    let guard = 0;
    while (text.offsetHeight + slack > shape.clientHeight && guard < 60) {
      shape.style.height = `${shape.offsetHeight + 8}px`;
      guard += 1;
    }
  }

  editorEl.addEventListener('input', (e) => {
    const text = e.target.closest?.('.shape-text');
    if (text) fitToText(text.closest('.shape'));
  });

  editorEl.addEventListener('scroll', () => { if (selected) positionBar(); });

  /** Hand the shape's text over to the caret. Double-click, or a second click. */
  function startEditing(shape) {
    if (!shape) return;
    shape.classList.add('editing'); // now the text takes clicks, and drags stop
    const text = shape.querySelector('.shape-text');
    if (!text) return;
    if (!text.textContent.trim() && !text.querySelector('br')) text.innerHTML = '<br>';
    text.focus();
    const r = document.createRange();
    r.selectNodeContents(text);
    r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  editorEl.addEventListener('dblclick', (e) => {
    const shape = e.target.closest('.shape') ?? behindShapeAt(e.clientX, e.clientY);
    if (!shape) return;
    select(shape);
    startEditing(shape);
  });

  // floating shape toolbar (colors + delete + send back/front)
  const bar = document.getElementById('shape-bar');
  if (bar) {
    bar.innerHTML =
      SHAPE_COLORS.map((c) => `<span class="dot" data-color="${c}" style="background:${c}" title="Fill"></span>`).join('') +
      '<span class="shape-bar__sep"></span>' +
      // No text-colour swatches here: double-click into the shape, select the
      // words, and use the toolbar's own colours like anywhere else.
      '<button type="button" data-shape="outline" title="Outline on / off">▭</button>' +
      '<button type="button" data-shape="back" title="Send behind text">▾</button>' +
      '<button type="button" data-shape="front" title="Bring above text">▴</button>' +
      '<button type="button" data-shape="del" title="Delete shape">✕</button>';
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    bar.addEventListener('click', (e) => {
      if (!selected) return;
      const color = e.target.closest('.dot')?.dataset.color;
      if (color) {
        history?.push();
        selected.style.background = color;
        selected.style.setProperty('--shape-fill', color);
        dirty();
        return;
      }

      const act = e.target.closest('[data-shape]')?.dataset.shape;
      // Deleting a shape has to be undoable: it is a scripted DOM removal, and
      // Chromium's undo has never known about those.
      if (act === 'outline') {
        history?.push();
        selected.classList.toggle('no-outline');
        dirty();
      } else if (act === 'del') { history?.push(); selected.remove(); select(null); dirty(); }
      else if (act === 'back' || act === 'front') {
        history?.push();
        const behind = act === 'back';
        selected.classList.toggle('behind', behind);
        // Actually move it: the class alone cannot cross a stacking context.
        ensureLayer(editorEl, behind).appendChild(selected);
        positionBar();
        dirty();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected) { select(null); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected &&
        !document.activeElement?.classList?.contains('shape-text')) {
      e.preventDefault();
      history?.push();
      selected.remove();
      select(null);
      dirty();
    }
  });

  return {
    addShape: (kind) => select(addShape(editorEl, kind, history)),
    select,
    /**
     * Called when a note is opened: the previous note's shapes are gone.
     *
     * Shapes saved before 0.6.1 carry only an inline `background`, and the
     * clipped kinds now paint their fill from `--shape-fill`. Copy it across so
     * an old note does not open with hollow diamonds.
     */
    reset: () => {
      select(null);
      for (const shape of editorEl.querySelectorAll('.shape')) {
        if (shape.style.getPropertyValue('--shape-fill')) continue;
        const fill = shape.style.background || getComputedStyle(shape).backgroundColor;
        if (fill) shape.style.setProperty('--shape-fill', fill);
      }
    },
  };
}
