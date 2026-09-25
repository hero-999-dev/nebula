/**
 * Arrows that sit on the shape layer and can point at a shape, a link card,
 * an image, or a text block. The path math is pure so it can be tested
 * without a layout.
 */

export const ARROW_KINDS = ['straight', 'elbow', 'curve'];

export function arrowPath(kind, x1, y1, x2, y2) {
  const n = (v) => Math.round(v * 10) / 10;
  if (kind === 'elbow') {
    const mid = n((x1 + x2) / 2);
    return `M ${n(x1)} ${n(y1)} L ${mid} ${n(y1)} L ${mid} ${n(y2)} L ${n(x2)} ${n(y2)}`;
  }
  if (kind === 'curve') {
    const dx = (x2 - x1) / 2;
    return `M ${n(x1)} ${n(y1)} C ${n(x1 + dx)} ${n(y1)}, ${n(x2 - dx)} ${n(y2)}, ${n(x2)} ${n(y2)}`;
  }
  return `M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`;
}

/** The anchor whose centre is closest, within `max` pixels. */
export function nearestAnchor(point, anchors, max = 18) {
  let best = null;
  let bestD = max;
  for (const anchor of anchors) {
    const d = Math.hypot(anchor.x - point.x, anchor.y - point.y);
    if (d <= bestD) {
      best = anchor;
      bestD = d;
    }
  }
  return best;
}

/** How near (px) an arrow end must come to an object's edge before it snaps on. */
export const MAGNET = 28;

/**
 * What an arrow end would hold on to at `point` — the XMind way: an object
 * catches the end once the pointer is inside it or within `magnet` pixels of
 * its edge, so it is enough to bring the arrow close (0.8.9). Until then the
 * end had to be dropped within 18px of the object's CENTRE.
 *
 * Objects (shapes, images, link cards) come before lines of text, and a text
 * line only catches the end from inside it — text runs everywhere and would
 * otherwise take every drop. With the pointer inside several objects, the one
 * painted on top (the highest `z`) wins — what the user sees under the pointer;
 * otherwise the nearest edge.
 *
 * @param {{x: number, y: number}} point
 * @param {{id: string, kind: 'object'|'text', z?: number, box: {left: number, top: number, width: number, height: number}}[]} anchors
 * @returns {typeof anchors[number]|null}
 */
export function magnetTarget(point, anchors, magnet = MAGNET) {
  let best = null;
  let bestScore = Infinity;
  for (const anchor of anchors) {
    const b = anchor.box;
    const dx = Math.max(b.left - point.x, 0, point.x - (b.left + b.width));
    const dy = Math.max(b.top - point.y, 0, point.y - (b.top + b.height));
    const distance = Math.hypot(dx, dy);
    const text = anchor.kind === 'text';
    if (distance > (text ? 0 : magnet)) continue;
    // Text last; then inside before near; inside, higher z first; near, closer first.
    const score = (text ? 2e12 : 0) + (distance > 0 ? 1e12 + distance * 1e6 : -(anchor.z ?? 0) * 1e3) + (b.width * b.height) / 1e6;
    if (score < bestScore) { best = anchor; bestScore = score; }
  }
  return best;
}

/** Where an arrow should meet a box: the side that faces `toward`. */
export function anchorPoint(box, toward) {
  const cy = box.top + box.height / 2;
  const cx = box.left + box.width / 2;
  const left = Math.abs(toward.x - box.left) + Math.abs(toward.y - cy);
  const right = Math.abs(toward.x - (box.left + box.width)) + Math.abs(toward.y - cy);
  const top = Math.abs(toward.y - box.top) + Math.abs(toward.x - cx);
  const bottom = Math.abs(toward.y - (box.top + box.height)) + Math.abs(toward.x - cx);
  const best = Math.min(left, right, top, bottom);
  if (best === left) return { x: box.left, y: cy };
  if (best === right) return { x: box.left + box.width, y: cy };
  if (best === top) return { x: cx, y: box.top };
  return { x: cx, y: box.top + box.height };
}

export function ensureAnchor(el) {
  if (!el.dataset.anchor) {
    el.dataset.anchor = `a-${Math.random().toString(36).slice(2, 8)}`;
  }
  return el.dataset.anchor;
}

function num(el, name, fallback) {
  const v = parseFloat(el.dataset[name]);
  return Number.isFinite(v) ? v : fallback;
}

function paint(arrow) {
  const path = arrow.querySelector('.arrow-line');
  if (!path) return;
  path.setAttribute('d', arrowPath(
    arrow.dataset.kind || 'straight',
    num(arrow, 'x1', 0), num(arrow, 'y1', 0),
    num(arrow, 'x2', 80), num(arrow, 'y2', 0),
  ));
}

export function makeArrow(kind = 'straight', at = { x1: 48, y1: 48, x2: 180, y2: 96 }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'note-arrow');
  svg.dataset.kind = ARROW_KINDS.includes(kind) ? kind : 'straight';
  svg.dataset.x1 = String(at.x1);
  svg.dataset.y1 = String(at.y1);
  svg.dataset.x2 = String(at.x2);
  svg.dataset.y2 = String(at.y2);
  svg.setAttribute('data-block-type', 'arrow');
  const marker = `arrowhead-${Math.random().toString(36).slice(2, 7)}`;
  svg.innerHTML =
    `<defs><marker id="${marker}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">`
    + '<path d="M0,0 L6,3 L0,6 Z" fill="currentColor"></path></marker></defs>'
    + `<path class="arrow-line" fill="none" stroke="currentColor" stroke-width="1.6" marker-end="url(#${marker})"></path>`
    + '<circle class="arrow-end" data-end="from" r="5"></circle>'
    + '<circle class="arrow-end" data-end="to" r="5"></circle>';
  paint(svg);
  placeHandles(svg);
  return svg;
}

function placeHandles(arrow) {
  const from = arrow.querySelector('[data-end="from"]');
  const to = arrow.querySelector('[data-end="to"]');
  if (from) {
    from.setAttribute('cx', arrow.dataset.x1);
    from.setAttribute('cy', arrow.dataset.y1);
  }
  if (to) {
    to.setAttribute('cx', arrow.dataset.x2);
    to.setAttribute('cy', arrow.dataset.y2);
  }
}

export function initArrows(editorEl, { history } = {}) {
  if (!editorEl) return null;
  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));

  function layer() {
    let el = editorEl.querySelector('.shape-layer:not(.shape-layer--behind)');
    if (!el) {
      el = document.createElement('div');
      el.className = 'shape-layer';
      el.setAttribute('contenteditable', 'false');
      editorEl.prepend(el);
    }
    return el;
  }

  function add(kind) {
    history?.push();
    const host = layer();
    const y = (editorEl.scrollTop || 0) + 72;
    const arrow = makeArrow(kind, { x1: 56, y1: y, x2: 200, y2: y + 36 });
    host.appendChild(arrow);
    dirty();
    return arrow;
  }

  function boxes() {
    const origin = layer().getBoundingClientRect();
    const out = [];
    let order = 0;
    for (const el of editorEl.querySelectorAll('.shape, .link-block, .note-image, p, h1, h2, h3, li')) {
      order += 1;
      if (!el.textContent.trim() && !el.matches('.shape, .link-block, .note-image')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      out.push({
        id: ensureAnchor(el),
        el,
        kind: el.matches('.shape, .link-block, .note-image') ? 'object' : 'text',
        // Paint order: the back canvas, then the text, then the front canvas, each in DOM order.
        z: (el.closest('.shape-layer--behind') ? 0 : el.closest('.shape-layer') ? 200000 : 100000) + order,
        x: r.left + r.width / 2 - origin.left,
        y: r.top + r.height / 2 - origin.top,
        box: {
          left: r.left - origin.left,
          top: r.top - origin.top,
          width: r.width,
          height: r.height,
        },
      });
    }
    return out;
  }

  function reflow() {
    const found = boxes();
    for (const arrow of editorEl.querySelectorAll('.note-arrow')) {
      for (const end of ['from', 'to']) {
        const id = arrow.dataset[end];
        const hit = found.find((a) => a.id === id);
        if (!hit) continue;
        const other = end === 'from'
          ? { x: num(arrow, 'x2', 0), y: num(arrow, 'y2', 0) }
          : { x: num(arrow, 'x1', 0), y: num(arrow, 'y1', 0) };
        const p = anchorPoint(hit.box, other);
        arrow.dataset[end === 'from' ? 'x1' : 'x2'] = String(Math.round(p.x));
        arrow.dataset[end === 'from' ? 'y1' : 'y2'] = String(Math.round(p.y));
      }
      paint(arrow);
      placeHandles(arrow);
    }
  }

  let drag = null;
  let selected = null;
  function select(arrow) {
    selected?.classList.remove('is-selected');
    selected = arrow;
    arrow?.classList.add('is-selected');
  }
  editorEl.addEventListener('mousedown', (e) => {
    const handle = e.target.closest?.('.arrow-end');
    const arrow = e.target.closest?.('.note-arrow');
    if (!arrow) { select(null); return; }
    e.preventDefault();
    select(arrow);
    history?.push();
    drag = {
      arrow,
      end: handle?.dataset.end || 'move',
      // Measured once: nothing else moves while an arrow end is dragged.
      targets: handle ? boxes() : null,
      target: null,
      x: e.clientX,
      y: e.clientY,
      x1: num(arrow, 'x1', 0),
      y1: num(arrow, 'y1', 0),
      x2: num(arrow, 'x2', 0),
      y2: num(arrow, 'y2', 0),
    };
  });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.end === 'move') {
      drag.arrow.dataset.x1 = String(Math.round(drag.x1 + dx));
      drag.arrow.dataset.y1 = String(Math.round(drag.y1 + dy));
      drag.arrow.dataset.x2 = String(Math.round(drag.x2 + dx));
      drag.arrow.dataset.y2 = String(Math.round(drag.y2 + dy));
    } else {
      const from = drag.end === 'from';
      const point = { x: (from ? drag.x1 : drag.x2) + dx, y: (from ? drag.y1 : drag.y2) + dy };
      const hit = magnetTarget(point, drag.targets || []);
      if (hit?.el !== drag.target?.el) {
        drag.target?.el.classList.remove('arrow-target');
        hit?.el.classList.add('arrow-target');
      }
      drag.target = hit;
      // Held: the end sits on the target's edge, facing the other end, while
      // still being dragged — so it is visible that it has taken hold.
      const other = from ? { x: num(drag.arrow, 'x2', 0), y: num(drag.arrow, 'y2', 0) } : { x: num(drag.arrow, 'x1', 0), y: num(drag.arrow, 'y1', 0) };
      const at = hit ? anchorPoint(hit.box, other) : point;
      drag.arrow.dataset[from ? 'x1' : 'x2'] = String(Math.round(at.x));
      drag.arrow.dataset[from ? 'y1' : 'y2'] = String(Math.round(at.y));
    }
    paint(drag.arrow);
    placeHandles(drag.arrow);
  });

  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    if (drag.end !== 'move') {
      const hit = drag.target;
      drag.target?.el.classList.remove('arrow-target');
      if (hit) drag.arrow.dataset[drag.end] = hit.id;
      else delete drag.arrow.dataset[drag.end];
      reflow();
    }
    drag = null;
    dirty();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected) { select(null); return; }
    // The editor keeps focus when an arrow is pressed (mousedown is cancelled
    // so the caret does not jump), so the key arrives from #editor. Excluding
    // #editor here made a selected arrow impossible to delete (0.8.3).
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected?.isConnected
      && !e.target.closest?.('.shape-text, .code-src, .image-caption, input, textarea, select')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      history?.push();
      selected.remove();
      selected = null;
      dirty();
    }
  }, true); // capture: before the editor's own Backspace handling edits text

  return { add, reflow };
}
