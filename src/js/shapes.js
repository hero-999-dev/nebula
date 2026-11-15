import { editorZoom } from './page-zoom.js';
import { beginPlacing, cancelPlacing, pagePoint } from './place.js';
/**
 * Free-floating shapes — they live on ONE overlay layer that spans the whole
 * note and can be dragged anywhere in it (wrap: through — text flows under
 * them, nothing reflows). Positions are stored in the note HTML, so they
 * persist like any other content.
 */

export const SHAPE_COLORS = ['#E8CDBD', '#D6E4D0', '#D3E0EA', '#E2D7E8', '#F0D2CE', '#EFE8D8'];

export const SHAPE_KINDS = ['textbox', 'area', 'rect', 'square', 'ellipse', 'circle', 'diamond', 'triangle'];

/** A line of the note a press may fall beside the words of, and what is never such a line (areaAt). */
const TEXT_BLOCK = 'p, div, h1, h2, h3, h4, h5, h6, li, blockquote';
const NOT_WORDS = '.note-image, table, pre, .blk-code, .blk-todo, .link-block, .link-embed, .inline-eq, [contenteditable="false"]';
/** The presses a work area took from the lines under it: no box and no sweep of blocks begins with one (block-handle.js). */
const taken = new WeakSet();
export const pressTaken = (e) => taken.has(e);
/** A work area's own faint ground: what lies in it shows, and so does the page under it. */
export const AREA_FILL = 'rgba(140, 130, 170, 0.08)';

/** What ties a text box to the arrow it rides (arrows.js). */
export const RIDE_KEYS = ['rides', 'rideT', 'rideDx', 'rideDy'];

/** Degrees shown while a shape turns, rounded to the nearest whole degree. */
export function formatAngle(deg) {
  const n = Math.round(Number(deg) || 0);
  return `${((n % 360) + 360) % 360}°`;
}

/** The kinds that must stay as wide as they are tall. */
export const EQUILATERAL = new Set(['square', 'circle']);

/**
 * The kinds drawn as an SVG outline rather than with a border.
 *
 * A `clip-path` cuts a border off, so these were drawn as two layers: the
 * element painted the outline colour and a pseudo-element inset from the edge
 * carried the fill. An inset moves each edge perpendicular to the BOX, and on a
 * diagonal that is not perpendicular to the EDGE — so the line came out a
 * different weight from the square's, and thinner still at a sharp corner where
 * the inset degenerates. Reported three times, each time correctly.
 *
 * An SVG stroke has none of that: one width, mitred corners, and
 * `vector-effect: non-scaling-stroke` keeps it at that width however the shape
 * is stretched.
 */
export const STROKED = { diamond: '50,0 100,50 50,100 0,50', triangle: '50,0 100,100 0,100' };

/** The outline layer for a kind that has one, or an empty string. */
export function outlineSvg(kind) {
  const points = STROKED[kind];
  if (!points) return '';
  return '<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
    + `<polygon points="${points}" /></svg>`;
}

/**
 * A layer with nothing on it at all goes: the first shape in a note made one,
 * and deleting that shape left an empty layer in the note for good (long-note
 * trials, 0.8.9). The next shape makes a new one. Used after a delete and, for
 * the notes that already carry one, by migrate.js on open (0.9.1).
 * @returns {number} layers removed
 */
export function releaseEmptyLayers(root) {
  let removed = 0;
  for (const layer of root.querySelectorAll('.shape-layer')) {
    if (layer.querySelector('.shape, .note-image')) continue;
    if (!layer.children.length) { layer.remove(); removed += 1; }
    else layer.style.removeProperty('min-height');
  }
  return removed;
}

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

/**
 * The grips a shape of this kind carries, in the order they stand in it: [class, title, corner].
 * A work area is a frame: it is sized from all four corners and is not turned (1.0.4, the owner:
 * "it grows only from the bottom right, it should from the other three too").
 */
export function shapeGrips(kind) {
  // Its button that makes it hold the pictures standing in the text too is in the bar over it
  // (data-catch on the area; it stood in the area's top right corner until the owner asked it up).
  if (kind === 'area') return [['shape-h', 'Resize', ''], ['shape-h', 'Resize', 'nw'], ['shape-h', 'Resize', 'ne'], ['shape-h', 'Resize', 'sw']];
  return [['shape-rot', 'Rotate', ''], ['shape-h', 'Resize', '']];
}

export function makeShape(kind = 'rect', color = SHAPE_COLORS[0], at = null) {
  const el = document.createElement('div');
  el.className = `shape ${kind}`;
  el.dataset.kind = kind;
  cascade = (cascade + 1) % 8;
  const left = at?.left ?? 40 + cascade * 28;
  const top = at?.top ?? 40 + cascade * 24;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  // A square and a circle are defined by being as wide as they are tall; the
  // rest get the usual landscape box.
  const side = EQUILATERAL.has(kind);
  // A text box is words with nothing round them; a work area a wide frame for what is put in it (1.0.4).
  const [width, height] = kind === 'area' ? [360, 240] : kind === 'textbox' ? [150, 40] : side ? [110, 110] : [150, 90];
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.background = kind === 'textbox' ? 'transparent' : kind === 'area' ? AREA_FILL : color;
  // The diamond and the triangle are clipped, so their fill is painted by a
  // pseudo-element inset from the edge — and CSS cannot read an inline
  // `background`. Both are set; the rectangle and ellipse use the first, the
  // clipped kinds the second.
  el.style.setProperty('--shape-fill', color);
  // A <br>, not nothing: an empty contenteditable has no line box, so Chromium
  // paints no caret in it — you double-click in and there is no sign at all
  // that you may type.
  // contenteditable="false" until it is actually being edited: otherwise the
  // caret walks in from the paragraph next to it on an arrow key.
  el.innerHTML = outlineSvg(kind)
    + '<div class="shape-text" contenteditable="false"><br></div>'
    + shapeGrips(kind).map(([cls, title, corner]) => `<span class="${cls}" title="${title}"${corner ? ` data-corner="${corner}"` : ''}></span>`).join('');
  return el;
}

export function addShape(editorEl, kind, history, at = null) {
  history?.push();
  const layer = ensureLayer(editorEl);
  const shape = makeShape(kind, SHAPE_COLORS[0], at ?? { left: 40 + cascade * 28, top: (editorEl.scrollTop || 0) + 40 + cascade * 24 });
  // A work area goes under what is already there: the shapes in it stay in reach.
  if (kind === 'area') layer.prepend(shape);
  else layer.appendChild(shape);
  editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  return shape;
}

/**
 * What a work area carries when it is moved: the shapes and floating pictures whose middle lies
 * in it, and the ends of arrows that hold nothing and lie in it (the ends that hold a shape
 * follow their shape). Read when the move begins, so what is in it then stays with it.
 *
 * An arrow held by something the area does not carry — a picture standing in the text, a line of
 * words — stays whole: its loose end is not pulled away from it and the text box riding it is
 * left on it (the owner: "a picture has an arrow and the setting is off: do not catch the arrow
 * either, nor the text on the arrow").
 */
export function carriedBy(area, editorEl) {
  const host = area.closest('.shape-layer')?.parentElement ?? editorEl;
  const px = (el, name) => parseFloat(el.style[name]) || 0;
  const box = { left: px(area, 'left'), top: px(area, 'top'), width: area.offsetWidth, height: area.offsetHeight };
  const inside = (x, y) => x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;
  const shapes = [];
  for (const el of host.querySelectorAll(':scope > .shape-layer > .shape, :scope > .shape-layer > .note-image, :scope > .image-layer > .note-image')) {
    if (el === area || !el.style.left) continue;
    const left = px(el, 'left');
    const top = px(el, 'top');
    if (inside(left + el.offsetWidth / 2, top + el.offsetHeight / 2)) shapes.push({ el, left, top });
  }
  const taken = new Set(shapes.map((s) => s.el));
  const staying = new Set();
  const ends = [];
  for (const el of host.querySelectorAll(':scope > .shape-layer > .note-arrow')) {
    const stays = ['from', 'to'].some((end) => el.dataset[end] && !taken.has(host.querySelector(`[data-anchor="${el.dataset[end]}"]`)));
    if (stays) { if (el.dataset.aid) staying.add(el.dataset.aid); continue; }
    for (const [end, x, y] of [['from', 'x1', 'y1'], ['to', 'x2', 'y2']]) {
      if (el.dataset[end]) continue;
      const at = [Number(el.dataset[x]) || 0, Number(el.dataset[y]) || 0];
      if (inside(at[0], at[1])) ends.push({ el, x, y, at });
    }
  }
  return { shapes: shapes.filter((s) => !staying.has(s.el.dataset.rides)), ends };
}

export function initShapes(editorEl, { history, onGeometry, onDrag, onDrop, liftPicture } = {}) {
  if (!editorEl) return null;
  const isLocked = () => editorEl.dataset.readonly === 'true';
  let drag = null;
  let selected = null;

  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  function showAngle(shape, deg) {
    let label = shape.querySelector('.shape-angle');
    if (!label) {
      label = document.createElement('span');
      label.className = 'shape-angle';
      shape.appendChild(label);
    }
    label.textContent = formatAngle(deg);
    // Inside the shape it turns with it; turn it back so it reads level.
    label.style.transform = `translateX(-50%) rotate(${-deg}deg)`;
  }

  /** Only while turning. Removed before the note is marked dirty, so it is never saved. */
  function hideAngle(shape) {
    shape?.querySelectorAll('.shape-angle').forEach((label) => label.remove());
  }

  function select(el) {
    editorEl.querySelectorAll('.shape.sel').forEach((s) => s.classList.remove('sel'));
    if (!el) editorEl.querySelectorAll('.shape.editing').forEach((s) => s.classList.remove('editing'));
    selected = el ?? null;
    selected?.classList.add('sel');
    // A work area's words are its name: an empty one says so while it is picked, and the bar offers to write it.
    const area = !!selected?.classList.contains('area');
    if (area) selected.classList.toggle('is-unnamed', !selected.querySelector('.shape-text')?.textContent.trim());
    document.querySelector('#shape-bar [data-shape="name"]')?.toggleAttribute('hidden', !area);
    const catcher = document.querySelector('#shape-bar [data-shape="catch"]');
    catcher?.toggleAttribute('hidden', !area);
    catcher?.classList.toggle('on', area && selected.dataset.catch === '1');
    document.getElementById('shape-bar')?.toggleAttribute('hidden', !selected);
    if (selected) {
      positionBar();
      // One selection on the canvas: an image that was selected lets go.
      editorEl.dispatchEvent(new CustomEvent('nebula-canvas-select', { detail: 'shape' }));
    }
  }
  // ...and a shape lets go when an image is picked. The image handler stops
  // its mousedown, so the "clicked elsewhere" listener below never saw it and
  // both bars stayed open (0.8.8).
  editorEl.addEventListener('nebula-canvas-select', (e) => { if (e.detail !== 'shape' && selected) select(null); });

  function releaseEmptyCanvases() {
    releaseEmptyLayers(editorEl);
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

  /**
   * A work area lies over the words and the pictures standing in them, and is as big as a chart:
   * taking every press in its box, it shut the lines and the pictures under it away. Its ground
   * lets the pointer through (editor.css), and the press is read here: on words, a picture, a
   * table, it is theirs; on the empty ground, the frame, the blank end of a line, it is the area's.
   */
  function areaAt(e) {
    let hit = null;
    for (const s of editorEl.querySelectorAll('.shape-layer:not(.shape-layer--behind) > .shape.area')) {
      const r = s.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) hit = s; // last = topmost
    }
    return hit && !onContent(e) ? hit : null;
  }

  /** Whether a press lands on something written: the words of a line, not the blank beside them. */
  function onContent(e) {
    const t = e.target;
    // The page itself, or the stage the guide stands its shapes on: nothing written there.
    if (t === editorEl || !t?.matches || t.matches('.guide-stage')) return false;
    if (!t.matches(TEXT_BLOCK) || t.closest(NOT_WORDS)) return true;
    const inRect = (r) => r.width > 0 && e.clientX >= r.left - 3 && e.clientX <= r.right + 3 && e.clientY >= r.top && e.clientY <= r.bottom;
    for (const node of t.childNodes) {
      let rects = [];
      if (node.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        range.selectNodeContents(node);
        rects = range.getClientRects?.() ?? [];
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.matches('.shape-layer, .image-layer')) {
        rects = node.getClientRects();
      }
      for (const r of rects) if (inRect(r)) return true;
    }
    return false;
  }

  // The hand over an area's ground says it can be taken there; over its words it stays the caret.
  editorEl.addEventListener('mousemove', (e) => {
    if (drag) return;
    const grab = !isLocked() && !e.target.closest?.('.shape, .note-image, .note-arrow') && !!editorEl.querySelector('.shape.area') && !!areaAt(e);
    editorEl.toggleAttribute('data-area-grab', grab);
  });
  editorEl.addEventListener('mouseleave', () => editorEl.removeAttribute('data-area-grab'));
  // Said before anything else hears the press: the page's own handlers stand back from it.
  editorEl.addEventListener('mousedown', (e) => {
    if (!isLocked() && !e.target.closest?.('.shape, .note-image, .note-arrow') && areaAt(e)) taken.add(e);
  }, true);

  editorEl.addEventListener('mousedown', (e) => {
    if (isLocked()) return;
    const handle = e.target.closest('.shape-h');
    const rotator = e.target.closest('.shape-rot');
    let shape = e.target.closest('.shape');
    // A picture or an arrow lying over an area is itself, not the area under it.
    if (!shape && !e.target.closest('.note-image, .note-arrow')) shape = areaAt(e);
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
    if (shape.classList.contains('editing') && e.target.closest('.shape-text') && !handle && !rotator) return;
    e.preventDefault();
    // One snapshot for the whole gesture, taken before the first pixel moves.
    history?.push();
    drag = {
      wasSelected,
      moved: false,
      downX: e.clientX,
      downY: e.clientY,
      el: shape,
      kind: rotator ? 'rotate' : (handle ? 'resize' : 'move'),
      corner: handle?.dataset.corner || 'se',
      // Where the pointer started, as an angle, so the shape turns WITH the
      // hand rather than snapping its corner to the cursor.
      grabAngle: rotator ? angleTo(shape, e.clientX, e.clientY) : 0,
      rot: rotationOf(shape),
      startX: e.clientX,
      startY: e.clientY,
      left: parseFloat(shape.style.left) || 0,
      top: parseFloat(shape.style.top) || 0,
      w: shape.offsetWidth,
      h: shape.offsetHeight,
      layer: shape.closest('.shape-layer'),
      extent: editorEl.scrollHeight,
      // What an area carries is read at the first pixel of the move: a press alone lifts no picture out of the text.
      area: !rotator && !handle && shape.classList.contains('area'),
      carried: null,
    };
    // Reserve the canvas, never the scrolling editor. Its lowest shape can
    // define scrollHeight; moving it up otherwise clamps scrollTop on every
    // mousemove and makes the shape appear glued to the bottom of the window.
  });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (isLocked()) { drag = null; return; }
    // On the page, not on the screen: the page may be zoomed (page-zoom.js).
    const z = editorZoom(editorEl);
    const dx = (e.clientX - drag.startX) / z;
    const dy = (e.clientY - drag.startY) / z;
    if (Math.abs(e.clientX - drag.downX) > 2 || Math.abs(e.clientY - drag.downY) > 2) drag.moved = true;
    if (!drag.moved) return;
    if (drag.layer) drag.layer.style.minHeight = `${drag.extent}px`;
    if (drag.kind === 'rotate') {
      // Shift snaps to 15 degrees, the way every drawing tool does it.
      let deg = drag.rot + (angleTo(drag.el, e.clientX, e.clientY) - drag.grabAngle);
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = Math.round(deg * 10) / 10;
      drag.el.dataset.rot = String(deg);
      drag.el.style.transform = deg ? `rotate(${deg}deg)` : '';
      showAngle(drag.el, deg);
      document.getElementById('shape-bar')?.setAttribute('hidden', '');
      onGeometry?.();
      return;
    }
    if (drag.kind === 'move') {
      // Free movement across the whole note, kept only out of negative space.
      //
      // A ceiling was tried here and taken back out. It was meant for "a shape
      // drags the bottom of the note around with it", and it did stop that —
      // but a tall shape in a short note already sits below any such limit, so
      // the first pixel of movement threw it upwards and then it would not come
      // back down. Two new faults for one ambiguous one is the wrong trade.
      if (drag.area && !drag.carried) {
        catchPictures(drag.el);
        drag.carried = carriedBy(drag.el, editorEl);
      }
      const left = Math.max(0, drag.left + dx);
      const top = Math.max(0, drag.top + dy);
      drag.el.style.left = `${left}px`;
      drag.el.style.top = `${top}px`;
      // A text box taken off its arrow is free until it is let go (arrows.js catches it again).
      if (drag.el.dataset.rides) for (const key of RIDE_KEYS) delete drag.el.dataset[key];
      if (drag.carried) {
        // A work area moves as one piece with what lay in it.
        const mx = left - drag.left;
        const my = top - drag.top;
        for (const s of drag.carried.shapes) {
          s.el.style.left = `${Math.max(0, s.left + mx)}px`;
          s.el.style.top = `${Math.max(0, s.top + my)}px`;
        }
        for (const a of drag.carried.ends) {
          a.el.dataset[a.x] = String(Math.round(a.at[0] + mx));
          a.el.dataset[a.y] = String(Math.round(a.at[1] + my));
        }
      }
      onDrag?.(drag.el);
    } else {
      // A shape grows to fit its text, so it must not be draggable back down
      // to where the text no longer fits — that is the same clipping, put back
      // by hand. The floor is what the words need.
      const floor = minSize(drag.el);
      // A grip on the left or the top grows the shape that way: the far corner stays where it is.
      const west = drag.corner.includes('w');
      const north = drag.corner.includes('n');
      const gx = west ? -dx : dx;
      const gy = north ? -dy : dy;
      let width;
      let height;
      if (EQUILATERAL.has(drag.el.dataset.kind)) {
        width = height = Math.max(48, floor.h, floor.w, Math.max(drag.w + gx, drag.h + gy));
      } else {
        width = Math.max(48, floor.w, drag.w + gx);
        height = Math.max(34, floor.h, drag.h + gy);
      }
      // ...and never past the left or the top of the page.
      if (west) { width = Math.min(width, drag.left + drag.w); drag.el.style.left = `${drag.left + drag.w - width}px`; }
      if (north) { height = Math.min(height, drag.top + drag.h); drag.el.style.top = `${drag.top + drag.h - height}px`; }
      drag.el.style.width = `${width}px`;
      drag.el.style.height = `${height}px`;
    }
    positionBar();
    onGeometry?.();
  });

  /**
   * A work area whose button is on takes the pictures standing in the text along: those whose
   * middle lies in it are lifted out of the text, each staying where it is on the page, and are
   * the area's to carry from then on. Measured first, all of them: a picture lifted lets the text
   * under it rise, and the next one would be read from where it had slid to.
   */
  function catchPictures(area) {
    if (area.dataset.catch !== '1' || !liftPicture) return;
    const origin = ensureLayer(editorEl).getBoundingClientRect();
    const z = editorZoom(editorEl);
    const r = area.getBoundingClientRect();
    const found = [];
    for (const figure of editorEl.querySelectorAll('.note-image')) {
      if (figure.closest('.shape-layer, .image-layer')) continue;   // already free
      const b = figure.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      const mx = b.left + b.width / 2;
      const my = b.top + b.height / 2;
      if (mx < r.left || mx > r.right || my < r.top || my > r.bottom) continue;
      found.push({ figure, left: Math.round((b.left - origin.left) / z), top: Math.round((b.top - origin.top) / z) });
    }
    for (const f of found) {
      const lifted = liftPicture(f.figure);
      if (!lifted) continue;
      lifted.style.left = `${f.left}px`;
      lifted.style.top = `${f.top}px`;
    }
  }

  /** The angle from a shape's centre to a point, in degrees. */
  function angleTo(shape, x, y) {
    const r = shape.getBoundingClientRect();
    return (Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2)) * 180) / Math.PI;
  }

  /** What a shape is turned by right now. */
  function rotationOf(shape) {
    return Number(shape.dataset.rot || 0);
  }

  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    const { el, moved, wasSelected, kind } = drag;
    drag = null;
    hideAngle(el);
    if (selected) { document.getElementById('shape-bar')?.removeAttribute('hidden'); positionBar(); }
    if (isLocked()) return;
    if (moved) { if (kind === 'move') onDrop?.(el); onGeometry?.(); dirty(); return; }

    // A press that never moved is a click. On a shape that was ALREADY
    // selected it means "let me at what is here": the shape's own text if the
    // pointer is over it, otherwise the paragraph underneath — which is the
    // only way to reach text that a behind-shape is covering.
    if (!wasSelected || kind !== 'move') return;
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
  /**
   * The smallest this shape may be without hiding what is written in it.
   *
   * Measured by letting the text lay itself out at the shape's current width:
   * `scrollHeight` on the text is what it WANTS, whatever the box allows.
   */
  function minSize(shape) {
    const text = shape?.querySelector('.shape-text');
    if (!text) return { w: 48, h: 34 };
    // The text rectangle must fit inside the silhouette, including its corners.
    const kind = shape.dataset.kind;
    const factor = kind === 'diamond' || kind === 'triangle' ? 2
      : kind === 'ellipse' || kind === 'circle' ? Math.SQRT2 : 1;
    return { w: 48, h: Math.max(34, Math.ceil((text.scrollHeight + 12) * factor)) };
  }

  function fitToText(shape) {
    const text = shape?.querySelector('.shape-text');
    if (!text) return;
    // Folded away (in a closed toggle — the guide's own stand in one, 1.0.4) it
    // has no size to measure: fitted then, it was cut down to a line's height.
    if (!shape.getClientRects().length) return;
    const floor = minSize(shape);
    if (EQUILATERAL.has(shape.dataset.kind)) {
      const side = Math.max(shape.offsetWidth, shape.offsetHeight, floor.h);
      if (side > shape.offsetHeight || side > shape.offsetWidth) {
        shape.style.width = shape.style.height = side + 'px';
      }
    } else if (floor.h > shape.offsetHeight) shape.style.height = floor.h + 'px';
  }

  editorEl.addEventListener('input', (e) => {
    const text = e.target.closest?.('.shape-text');
    if (text && !isLocked()) {
      const owner = text.closest('.shape');
      if (owner?.classList.contains('area')) owner.classList.toggle('is-unnamed', !text.textContent.trim());
      const scrollTop = editorEl.scrollTop;
      fitToText(text.closest('.shape'));
      onGeometry?.();
      editorEl.scrollTop = scrollTop;
      if (selected) positionBar();
    }
  });

  editorEl.addEventListener('scroll', () => { if (selected) positionBar(); });

  /**
   * Hand the shape's text over to the caret. Double-click, or a second click.
   *
   * @param {Element} shape
   * @param {boolean} selectAll whether to take the whole text, the way a
   *   double-click on a word takes the word
   */
  function startEditing(shape, selectAll = false) {
    if (!shape || isLocked()) return;
    shape.classList.add('editing'); // now the text takes clicks, and drags stop
    const text = shape.querySelector('.shape-text');
    if (!text) return;
    // Editable only while being edited — see stopEditing. Arrow keys used to
    // walk the caret straight into a shape from the paragraph beside it.
    text.setAttribute('contenteditable', 'true');
    if (!text.textContent.trim() && !text.querySelector('br')) text.innerHTML = '<br>';
    text.focus({ preventScroll: true });
    const place = () => {
      const r = document.createRange();
      r.selectNodeContents(text);
      if (!selectAll) r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    };
    place();
    // A double-click carries the browser's own word selection, which lands
    // after this handler and replaced ours — the whole text came out
    // unselected. Set it again once that has happened.
    if (selectAll) requestAnimationFrame(place);
  }

  /**
   * Take the text back out of the caret's reach.
   *
   * A `.shape-text` left `contenteditable="true"` is part of the editor's own
   * caret path: holding the down arrow through a paragraph dropped the caret
   * inside the shape, which is never what was meant — "it should never go into
   * the shape's note like that".
   */
  function stopEditing(shape) {
    const el = shape ?? editorEl;
    for (const text of el.querySelectorAll?.('.shape-text') ?? []) {
      text.setAttribute('contenteditable', 'false');
      text.closest('.shape')?.classList.remove('editing');
    }
  }

  editorEl.addEventListener('dblclick', (e) => {
    if (isLocked() || e.target.closest('.shape-h, .shape-rot')) return;
    const shape = e.target.closest('.shape')
      ?? (e.target.closest('.note-image, .note-arrow') ? null : areaAt(e))
      ?? behindShapeAt(e.clientX, e.clientY);
    if (!shape) return;
    select(shape);
    // Was the pointer over the words? `e.target` cannot answer: `.shape-text`
    // only takes pointer events once the shape is already `.editing`, so a
    // double-click on it reports the SHAPE and the whole text was never taken.
    // Ask the geometry instead.
    const text = shape.querySelector('.shape-text');
    const box = text?.getBoundingClientRect();
    const onText = !!box && e.clientX >= box.left && e.clientX <= box.right
      && e.clientY >= box.top && e.clientY <= box.bottom;
    startEditing(shape, onText);
  });

  // Leaving the shape puts its text back out of reach.
  editorEl.addEventListener('focusout', (e) => {
    const text = e.target.closest?.('.shape-text');
    if (!text) return;
    requestAnimationFrame(() => {
      if (text.contains(document.activeElement)) return;
      if (document.activeElement === text) return;
      stopEditing(text.closest('.shape'));
    });
  });

  // floating shape toolbar (colors + delete + send back/front)
  const bar = document.getElementById('shape-bar');
  if (bar) {
    bar.innerHTML =
      // The way back from a colour (1.0.4): a text box filled by a dot had no dot to empty it.
      '<span class="dot dot--none" data-color="none" title="No fill"></span>' +
      SHAPE_COLORS.map((c) => `<span class="dot" data-color="${c}" style="background:${c}" title="Fill"></span>`).join('') +
      '<span class="shape-bar__sep"></span>' +
      // No text-colour swatches here: double-click into the shape, select the
      // words, and use the toolbar's own colours like anywhere else.
      // A work area only: its name, written where a shape's words are.
      '<button type="button" data-shape="name" title="Name the work area" hidden>T</button>' +
      // ...and its holding: lit, the area holds the pictures in it and takes them along.
      '<button type="button" data-shape="catch" title="Hold the pictures in it" hidden><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>' +
      '<button type="button" data-shape="outline" title="Outline on / off">▭</button>' +
      '<button type="button" data-shape="back" title="Send behind text">▾</button>' +
      '<button type="button" data-shape="front" title="Bring above text">▴</button>' +
      '<button type="button" data-shape="del" title="Delete shape">✕</button>';
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    bar.addEventListener('click', (e) => {
      if (!selected || isLocked()) return;
      const color = e.target.closest('.dot')?.dataset.color;
      if (color) {
        history?.push();
        // No fill: the page shows through; a work area goes back to its own faint ground.
        const fill = color !== 'none' ? color : selected.classList.contains('area') ? AREA_FILL : 'transparent';
        selected.style.background = fill;
        selected.style.setProperty('--shape-fill', fill);
        dirty();
        return;
      }

      const act = e.target.closest('[data-shape]')?.dataset.shape;
      // Deleting a shape has to be undoable: it is a scripted DOM removal, and
      // Chromium's undo has never known about those.
      if (act === 'name') { startEditing(selected, true); return; }
      if (act === 'catch') {
        // On, the area holds the pictures in it; off, it is as it was.
        history?.push();
        if (selected.dataset.catch === '1') delete selected.dataset.catch; else selected.dataset.catch = '1';
        select(selected);
        dirty();
      } else if (act === 'outline') {
        history?.push();
        // A work area is never without its line: outlined it is a whole line, else the broken one.
        selected.classList.toggle(selected.classList.contains('area') ? 'lined' : 'no-outline');
        dirty();
      } else if (act === 'del') { history?.push(); selected.remove(); releaseEmptyCanvases(); select(null); onGeometry?.(); dirty(); }
      else if (act === 'back' || act === 'front') {
        history?.push();
        const behind = act === 'back';
        selected.classList.toggle('behind', behind);
        // Actually move it: the class alone cannot cross a stacking context.
        // Into the layer beside its own: a shape on a stage inside the page
        // (the guide's, 1.0.4) is placed from that stage, not from the note.
        ensureLayer(selected.closest('.shape-layer')?.parentElement ?? editorEl, behind).appendChild(selected);
        positionBar();
        dirty();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (isLocked()) return;
    if (e.key === 'Escape' && selected) { select(null); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected &&
        !document.activeElement?.classList?.contains('shape-text')) {
      e.preventDefault();
      history?.push();
      selected.remove();
      releaseEmptyCanvases();
      select(null);
      onGeometry?.();   // an elbow that went round it is its own line again
      dirty();
    }
  });

  function put(kind, at) {
    if (isLocked()) return null;
    const shape = addShape(editorEl, kind, history, at);
    select(shape);
    onGeometry?.();   // an elbow it was put on goes round it (arrow-route.js)
    if (kind === 'textbox') startEditing(shape);   // a text box is for typing: the caret is in it at once
    return shape;
  }

  return {
    addShape: (kind, at = null) => put(kind, at),
    /**
     * Chosen from the bar: a faint picture of it follows the pointer and a press in the note puts
     * it there, its middle under the pointer (place.js).
     */
    place: (kind) => {
      if (isLocked()) return;
      const ghost = makeShape(kind);
      ghost.style.left = '0px';
      ghost.style.top = '0px';
      const width = parseFloat(ghost.style.width);
      const height = parseFloat(ghost.style.height);
      beginPlacing(editorEl, {
        ghost, width, height,
        put: (e) => {
          const p = pagePoint(editorEl, ensureLayer(editorEl), e);
          put(kind, { left: Math.max(0, Math.round(p.x - width / 2)), top: Math.max(0, Math.round(p.y - height / 2)) });
        },
      });
    },
    /** Pick a shape and put the caret in its words (a label just put on an arrow). */
    edit: (shape) => { if (!isLocked() && shape?.isConnected) { select(shape); startEditing(shape); } },
    select,
    /** Called when a note is opened: the previous note's shapes are gone. */
    reset: () => { cancelPlacing(); if (drag) hideAngle(drag.el); drag = null; select(null); stopEditing(null); },

    /**
     * Grow one shape to fit the text already in it.
     *
     * Exposed for migrate.js: the sizing rules live here, but the thing that
     * needs them most is a shape that was saved overflowing and never typed in
     * again. `input` alone could not reach those.
     */
    fit: (shape) => fitToText(shape),
  };
}
