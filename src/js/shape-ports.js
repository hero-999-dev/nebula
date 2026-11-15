/**
 * The four sides of a shape, as places an arrow holds on to (1.0.4).
 *
 * The owner: "what I meant by shapes like Lucid's: the catching at the four
 * sides should work well, we should be able to make mind maps, flowcharts —
 * like draw.io". Until now an arrow's end held a shape wherever its other end
 * faced. Now:
 *
 *  - a shape under the pointer, or the selected one, shows a dot outside each
 *    of its four sides. Dragged, a dot draws an arrow from that side; let go
 *    over another object the arrow holds it, let go on open ground a shape
 *    like the first is put there, joined. Pressed without a drag, a dot puts
 *    such a shape beside that side — a mind map's next branch, a flowchart's
 *    next step;
 *  - an arrow's end brought near the middle of a side holds that side
 *    (`data-from-side` / `data-to-side`) and stays on it when the shapes move;
 *    anywhere else on the object it holds on as before, facing its other end.
 *
 * The geometry is pure, and tested without a layout.
 */

import { editorZoom } from './page-zoom.js';
import { makeShape, SHAPE_COLORS } from './shapes.js';
import { shapeAnchorPoint } from './shape-anchor.js';

export const SIDES = ['top', 'right', 'bottom', 'left'];
export const SIDE_DIR = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
export const OPPOSITE = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' };

/** How near (px) the middle of a side an arrow's end must come to hold that side. */
export const PORT_CATCH = 24;
/** How far (px) outside its side a shape's dot sits. */
export const PORT_OUT = 15;
/** The ground (px) left between a shape and the one a pressed dot puts beside it. */
export const BRANCH_GAP = 70;

const turn = (x, y, rotation) => {
  const r = (rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c * x - s * y, s * x + c * y];
};

/**
 * The middle of one side of a shape, on its painted outline, and the way out
 * from there. `box` is the unrotated shape; a triangle's left and right are the
 * middles of its slanted edges.
 * @returns {{x: number, y: number, dx: number, dy: number}}
 */
export function sidePoint(box, side, kind = 'rect', rotation = 0) {
  const rx = box.width / 2;
  const ry = box.height / 2;
  const [ux, uy] = SIDE_DIR[side] ?? SIDE_DIR.right;
  let lx = ux * rx;
  let ly = uy * ry;
  if (kind === 'triangle' && (side === 'left' || side === 'right')) { lx = ux * rx / 2; ly = 0; }
  const [px, py] = turn(lx, ly, rotation);
  const [dx, dy] = turn(ux, uy, rotation);
  return { x: box.left + rx + px, y: box.top + ry + py, dx, dy };
}

/** The side whose middle is nearest to a point, within `max` pixels; else null. */
export function nearestSide(point, box, kind = 'rect', rotation = 0, max = PORT_CATCH) {
  let best = null;
  let bestD = max;
  for (const side of SIDES) {
    const p = sidePoint(box, side, kind, rotation);
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d <= bestD) { best = side; bestD = d; }
  }
  return best;
}

/** The way out of a box at a point on its outline: the side that point lies on. */
export function outwardAt(box, point, rotation = 0) {
  const [lx, ly] = turn(point.x - (box.left + box.width / 2), point.y - (box.top + box.height / 2), -rotation);
  const fx = lx / Math.max(0.5, box.width / 2);
  const fy = ly / Math.max(0.5, box.height / 2);
  const side = Math.abs(fx) >= Math.abs(fy) ? (fx >= 0 ? 'right' : 'left') : (fy >= 0 ? 'bottom' : 'top');
  return turn(...SIDE_DIR[side], rotation);
}

/** How deep (px) inside an object an arrow's end still holds the outline beside it; deeper, it holds the object as a whole. */
export const EDGE_DEPTH = 18;

/** The kinds whose outline is not their box. */
const OUTLINED = new Set(['ellipse', 'circle', 'diamond', 'triangle']);

/**
 * The place on an object's outline beside a point — "they only join at four places" (the owner,
 * 1.0.4): an end let go at the edge of an object, away from the middles of its sides, holds the
 * outline right there. The place is kept as a share of the half width and half height from the
 * middle, so it stays where it is on a shape that is made bigger, moved or turned.
 * @returns {{u: number, v: number}|null} null deeper inside than `deep`: the end holds the whole object
 */
export function edgeSpot(point, box, kind = 'rect', rotation = 0, deep = EDGE_DEPTH) {
  const rx = Math.max(0.5, box.width / 2);
  const ry = Math.max(0.5, box.height / 2);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const [lx, ly] = turn(point.x - cx, point.y - cy, -rotation);
  let ex;
  let ey;
  if (OUTLINED.has(kind)) {
    const p = shapeAnchorPoint(box, { x: cx + lx, y: cy + ly }, kind, 0);   // where the ray from the middle leaves it
    ex = p.x - cx;
    ey = p.y - cy;
  } else {
    ex = Math.max(-rx, Math.min(rx, lx));
    ey = Math.max(-ry, Math.min(ry, ly));
    if (Math.abs(lx) < rx && Math.abs(ly) < ry) {
      // Inside: out to the edge that is nearest.
      if (rx - Math.abs(lx) <= ry - Math.abs(ly)) ex = lx >= 0 ? rx : -rx;
      else ey = ly >= 0 ? ry : -ry;
    }
  }
  const inside = Math.hypot(lx, ly) < Math.hypot(ex, ey);
  if (inside && Math.hypot(ex - lx, ey - ly) > deep) return null;
  const share = (n) => Math.round(n * 1000) / 1000;
  return { u: share(ex / rx), v: share(ey / ry) };
}

/** Where a place kept by `edgeSpot` lies on the object as it is now. */
export function spotPoint(box, u, v, kind = 'rect', rotation = 0) {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  let lx = u * box.width / 2;
  let ly = v * box.height / 2;
  if (OUTLINED.has(kind)) {
    const p = shapeAnchorPoint(box, { x: cx + lx, y: cy + ly }, kind, 0);
    lx = p.x - cx;
    ly = p.y - cy;
  }
  const [px, py] = turn(lx, ly, rotation);
  return { x: cx + px, y: cy + py };
}

/** The side of a new shape that faces back along a drag of (dx, dy). */
export function facingSide(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'left' : 'right';
  return dy >= 0 ? 'top' : 'bottom';
}

const overlaps = (a, b, pad) => a.left < b.left + b.width + pad && b.left < a.left + a.width + pad
  && a.top < b.top + b.height + pad && b.top < a.top + a.height + pad;

/**
 * Where the shape a pressed dot adds goes: beside that side of `box`, a gap
 * away, and from there along the side until it lies on no other shape — the
 * second branch under the first, the third under the second.
 * @param {{left: number, top: number, width: number, height: number}} box the shape pressed
 * @param {{left: number, top: number, width: number, height: number}[]} others the shapes already there
 * @returns {{left: number, top: number}}
 */
export function branchPlace(box, side, others = [], gap = BRANCH_GAP) {
  const [ux, uy] = SIDE_DIR[side] ?? SIDE_DIR.right;
  const at = {
    left: Math.max(0, box.left + ux * (box.width + gap)),
    top: Math.max(0, box.top + uy * (box.height + gap)),
    width: box.width,
    height: box.height,
  };
  const step = ux ? { left: 0, top: box.height + 24 } : { left: box.width + 24, top: 0 };
  for (let tries = 0; tries < 40 && [box, ...others].some((o) => overlaps(at, o, 8)); tries += 1) {
    at.left += step.left;
    at.top += step.top;
  }
  return { left: Math.round(at.left), top: Math.round(at.top) };
}

/** A shape like `source`, empty, at a place on the same canvas. */
export function shapeLike(source, at) {
  const kind = source.dataset.kind || 'rect';
  const shape = makeShape(kind, source.style.getPropertyValue('--shape-fill') || source.style.background || SHAPE_COLORS[0], at);
  for (const name of ['width', 'height', 'background', 'color', 'borderColor', 'fontSize']) {
    if (source.style[name]) shape.style[name] = source.style[name];
  }
  return shape;
}

const boxOnPage = (shape) => ({
  left: parseFloat(shape.style.left) || 0,
  top: parseFloat(shape.style.top) || 0,
  width: shape.offsetWidth || parseFloat(shape.style.width) || 0,
  height: shape.offsetHeight || parseFloat(shape.style.height) || 0,
});

/**
 * @param {HTMLElement} editorEl
 * @param {{history?: {push(): void}, shapes?: {select(el: Element|null): void}|null, arrows?: object|null, label?: string}} options
 */
export function initShapePorts(editorEl, { history, shapes, arrows, label = 'Drag to join · click to add a shape' } = {}) {
  if (!editorEl || !arrows) return null;
  const isLocked = () => editorEl.dataset.readonly === 'true';
  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  const overlay = document.createElement('div');
  overlay.className = 'shape-ports';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  for (const side of SIDES) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'shape-port';
    dot.dataset.side = side;
    dot.tabIndex = -1;
    dot.title = label;
    overlay.append(dot);
  }
  document.body.append(overlay);

  let hot = null;        // the shape under the pointer
  let target = null;     // { el, side } while an arrow's end is dragged over an object
  let press = null;      // a dot held down, not yet dragged
  let joining = false;   // an arrow being drawn from a dot

  /** The object's unrotated box on the screen. */
  function screenBox(el) {
    const r = el.getBoundingClientRect();
    if (!el.matches('.shape')) return { left: r.left, top: r.top, width: r.width, height: r.height };
    const z = editorZoom(editorEl);
    const w = el.offsetWidth * z;
    const h = el.offsetHeight * z;
    return { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - h / 2, width: w, height: h };
  }

  function place(el, out, lit) {
    const frame = editorEl.getBoundingClientRect();
    const box = screenBox(el);
    const kind = el.matches('.shape') ? el.dataset.kind : 'rect';
    const rotation = el.matches('.shape') ? Number(el.dataset.rot) || 0 : 0;
    for (const dot of overlay.children) {
      const p = sidePoint(box, dot.dataset.side, kind, rotation);
      const x = p.x + p.dx * out;
      const y = p.y + p.dy * out;
      dot.hidden = x < frame.left || x > frame.right || y < frame.top || y > frame.bottom;
      dot.style.left = `${Math.round(x)}px`;
      dot.style.top = `${Math.round(y)}px`;
      dot.classList.toggle('on', dot.dataset.side === lit);
    }
    overlay.hidden = false;
  }

  function refresh() {
    if (target?.el.isConnected) {
      overlay.classList.add('shape-ports--target');
      place(target.el, 0, target.side);
      return;
    }
    overlay.classList.remove('shape-ports--target');
    const selected = editorEl.querySelector('.shape.sel:not(.area)');
    const shape = press?.shape ?? (hot?.isConnected ? hot : null) ?? selected;
    if (!shape || !shape.isConnected || isLocked() || joining || shape.classList.contains('editing')) { overlay.hidden = true; return; }
    place(shape, PORT_OUT, null);
  }

  let queued = false;
  const soon = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; refresh(); });
  };

  window.addEventListener('mousemove', (e) => {
    if (press && !joining && (Math.abs(e.clientX - press.x) > 4 || Math.abs(e.clientY - press.y) > 4)) {
      // The dot is dragged: an arrow from that side, its far end in the hand.
      joining = true;
      overlay.hidden = true;
      const { shape, side } = press;
      arrows.join(shape, side, e, {
        // Let go on open ground: a shape like the first, there, facing back.
        ground: (point, from) => {
          const facing = facingSide(point.x - from.x, point.y - from.y);
          const box = boxOnPage(shape);
          const [ux, uy] = SIDE_DIR[facing];
          // The middle of its facing side lies where the arrow was let go.
          const clone = shapeLike(shape, {
            left: Math.max(0, Math.round(point.x - box.width / 2 - ux * box.width / 2)),
            top: Math.max(0, Math.round(point.y - box.height / 2 - uy * box.height / 2)),
          });
          shape.parentElement.append(clone);
          shapes?.select(clone);
          return { el: clone, side: facing };
        },
        done: () => { joining = false; press = null; hot = null; soon(); },
      });
      return;
    }
    if (press || joining || (e.buttons & 1)) { if (!overlay.hidden && !press && !target) overlay.hidden = true; return; }
    const over = e.target instanceof Element ? e.target : null;
    if (over?.closest('.shape-ports')) return;
    const shape = over?.closest('.shape:not(.area)');
    if (shape && editorEl.contains(shape)) hot = shape;
    else if (hot) {
      // Kept while the pointer is on its way to a dot.
      const r = hot.isConnected ? hot.getBoundingClientRect() : null;
      const reach = PORT_OUT + 14;
      if (!r || e.clientX < r.left - reach || e.clientX > r.right + reach || e.clientY < r.top - reach || e.clientY > r.bottom + reach) hot = null;
    }
    soon();
  });

  overlay.addEventListener('mousedown', (e) => {
    const dot = e.target.closest?.('.shape-port');
    const shape = (hot?.isConnected ? hot : null) ?? editorEl.querySelector('.shape.sel:not(.area)');
    if (!dot || !shape || e.button !== 0 || isLocked()) return;
    e.preventDefault();
    e.stopPropagation();          // the page's own press would let the shape go
    press = { shape, side: dot.dataset.side, x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => {
    if (!press || joining) { soon(); return; }
    // Pressed, not dragged: the next shape beside that side, joined.
    const { shape, side } = press;
    press = null;
    if (!shape.isConnected || isLocked()) { soon(); return; }
    history?.push();
    const others = [...shape.parentElement.querySelectorAll(':scope > .shape')].filter((s) => s !== shape).map(boxOnPage);
    const clone = shapeLike(shape, branchPlace(boxOnPage(shape), side, others));
    shape.parentElement.append(clone);
    arrows.link(shape, side, clone, OPPOSITE[side]);
    shapes?.select(clone);
    hot = null;
    dirty();
    soon();
  });

  // An arrow's end over an object: its four sides are shown, the one it would hold lit.
  editorEl.addEventListener('nebula-arrow-target', (e) => {
    target = e.detail?.el ? { el: e.detail.el, side: e.detail.side ?? null } : null;
    refresh();
  });
  editorEl.addEventListener('scroll', soon, { passive: true });
  editorEl.addEventListener('input', soon);
  editorEl.addEventListener('nebula-canvas-select', soon);
  window.addEventListener('resize', soon);
  document.addEventListener('mousedown', soon, true);
  document.addEventListener('keyup', soon);

  return {
    refresh,
    /** A note is opened: the shapes of the last one are gone. */
    reset: () => { hot = null; target = null; press = null; joining = false; overlay.hidden = true; },
  };
}
