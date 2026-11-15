/**
 * Arrows that sit on the shape layer and can point at a shape, a link card,
 * an image, or a text block. The path math is pure so it can be tested
 * without a layout.
 */

import { editorZoom } from './page-zoom.js';
import { shapeAnchorPoint } from './shape-anchor.js';
import { sidePoint, nearestSide, outwardAt, edgeSpot, spotPoint, SIDE_DIR } from './shape-ports.js';
import { makeShape, RIDE_KEYS } from './shapes.js';
import { beginPlacing, cancelPlacing, pagePoint } from './place.js';
import { routeRound, crosses, wallsFor, grown } from './arrow-route.js';

export const ARROW_KINDS = ['straight', 'elbow', 'curve'];

/** How far (px) an elbow arrow runs straight out of a side before it turns. */
export const STUB = 16;

/**
 * The corners of an elbow arrow whose ends leave their objects squarely (1.0.4): `d1` and `d2`
 * are the ways out at each end, one of them may be missing (an end that holds nothing).
 * `bend`: how far the hand moved the leg in the middle, when the line has one (below).
 */
export function elbowPoints(x1, y1, x2, y2, d1, d2, bend = null) {
  return elbowRoute(x1, y1, x2, y2, d1, d2, bend).points;
}

/**
 * The corners, and the leg in the middle: `leg` is its middle point and the axis it is moved
 * along (0 across, 1 down), or null where the line has one corner only and nothing to move.
 */
function elbowRoute(x1, y1, x2, y2, d1, d2, bend = null) {
  const hor = (d) => Math.abs(d[0]) >= Math.abs(d[1]);
  const a = d1 ? [x1 + d1[0] * STUB, y1 + d1[1] * STUB] : [x1, y1];
  const b = d2 ? [x2 + d2[0] * STUB, y2 + d2[1] * STUB] : [x2, y2];
  let mid;
  let axis = null;
  const by = (i) => Number(bend?.[i]) || 0;
  if (d1 && d2) {
    const h1 = hor(d1);
    const h2 = hor(d2);
    if (h1 === h2) {
      // Both level, or both upright. `u` is the axis they run along, `v` the other.
      const u = h1 ? 0 : 1;
      const v = 1 - u;
      const at = (along, across) => (u === 0 ? [along, across] : [across, along]);
      if (d1[u] * d2[u] > 0) {
        // The same way out: round the one that reaches further.
        // Further out it may be pulled; not back in, through what it leaves.
        const m = d1[u] > 0 ? Math.max(a[u], b[u]) + Math.max(0, by(u)) : Math.min(a[u], b[u]) + Math.min(0, by(u));
        mid = [at(m, a[v]), at(m, b[v])];
        axis = u;
      } else if ((b[u] - a[u]) * d1[u] >= 0) {
        // Facing each other: turn half way, or where the hand put the turn, between the two.
        const m = Math.max(Math.min(a[u], b[u]), Math.min(Math.max(a[u], b[u]), (a[u] + b[u]) / 2 + by(u)));
        mid = [at(m, a[v]), at(m, b[v])];
        axis = u;
      } else {
        const m = (a[v] + b[v]) / 2 + by(v);      // back to back: between the two
        mid = [at(a[u], m), at(b[u], m)];
        axis = v;
      }
    } else if (h1) {
      mid = (b[0] - a[0]) * d1[0] >= 0 && (a[1] - b[1]) * d2[1] >= 0 ? [[b[0], a[1]]] : [[a[0], b[1]]];
    } else {
      mid = (b[1] - a[1]) * d1[1] >= 0 && (a[0] - b[0]) * d2[0] >= 0 ? [[a[0], b[1]]] : [[b[0], a[1]]];
    }
  } else if (d1) mid = hor(d1) ? [[a[0], y2]] : [[x2, a[1]]];
  else mid = hor(d2) ? [[b[0], y1]] : [[x1, b[1]]];
  const out = [];
  for (const p of [[x1, y1], a, ...mid, b, [x2, y2]]) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 0.05 || Math.abs(last[1] - p[1]) > 0.05) out.push(p);
  }
  const leg = axis === null ? null : { x: (mid[0][0] + mid[1][0]) / 2, y: (mid[0][1] + mid[1][1]) / 2, axis };
  return { points: out, leg };
}

/** The two points a curve is pulled towards; a straight line's lie on it. `bend` moves its middle by that much. */
function controls(kind, x1, y1, x2, y2, d1, d2, bend) {
  let c1;
  let c2;
  if (kind === 'curve') {
    const reach = Math.max(24, Math.min(120, Math.hypot(x2 - x1, y2 - y1) * 0.4));
    const half = (x2 - x1) / 2;
    c1 = d1 ? [x1 + d1[0] * reach, y1 + d1[1] * reach] : [x1 + half, y1];
    c2 = d2 ? [x2 + d2[0] * reach, y2 + d2[1] * reach] : [x2 - half, y2];
  } else {
    c1 = [x1 + (x2 - x1) / 3, y1 + (y2 - y1) / 3];
    c2 = [x1 + (x2 - x1) * 2 / 3, y1 + (y2 - y1) * 2 / 3];
  }
  // The middle of the line is three eighths of each: moved by 4/3 of the bend, it moves by the bend.
  const bx = (Number(bend?.[0]) || 0) * 4 / 3;
  const bz = (Number(bend?.[1]) || 0) * 4 / 3;
  return [[c1[0] + bx, c1[1] + bz], [c2[0] + bx, c2[1] + bz]];
}

/**
 * Where the grip that bends an arrow sits (1.0.4): the middle of a straight or curved line, free
 * to go anywhere (`axis` null); the middle of an elbow's middle leg, moved across (0) or down (1).
 * Null for an elbow of one corner.
 */
export function bendSpot(kind, x1, y1, x2, y2, d1 = null, d2 = null, bend = null) {
  if (kind === 'elbow') {
    if (d1 || d2) return elbowRoute(x1, y1, x2, y2, d1, d2, bend).leg;
    return { x: (x1 + x2) / 2 + (Number(bend?.[0]) || 0), y: (y1 + y2) / 2, axis: 0 };
  }
  const [c1, c2] = controls(kind, x1, y1, x2, y2, d1, d2, bend);
  return { x: (x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, y: (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8, axis: null };
}

/**
 * The line of an arrow. `d1`, `d2`: the way out of what each end holds, when it holds an object
 * (1.0.4) — an elbow then leaves and arrives squarely, a curve bends out of the side. Without
 * them it is drawn as it always was. `bend`: what the hand pulled its middle by (bendSpot) — a
 * straight line bent is a bow through that point.
 */
export function arrowPath(kind, x1, y1, x2, y2, d1 = null, d2 = null, bend = null) {
  const n = (v) => Math.round(v * 10) / 10;
  const bent = !!bend && (Number(bend[0]) || Number(bend[1]));
  if (kind === 'elbow' && (d1 || d2)) {
    return `M ${elbowPoints(x1, y1, x2, y2, d1, d2, bend).map(([x, y]) => `${n(x)} ${n(y)}`).join(' L ')}`;
  }
  if (kind === 'elbow') {
    const mid = n((x1 + x2) / 2 + (Number(bend?.[0]) || 0));
    return `M ${n(x1)} ${n(y1)} L ${mid} ${n(y1)} L ${mid} ${n(y2)} L ${n(x2)} ${n(y2)}`;
  }
  if (kind === 'curve' || bent) {
    const [c1, c2] = controls(kind, x1, y1, x2, y2, d1, d2, bend);
    return `M ${n(x1)} ${n(y1)} C ${n(c1[0])} ${n(c1[1])}, ${n(c2[0])} ${n(c2[1])}, ${n(x2)} ${n(y2)}`;
  }
  return `M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`;
}

/** A line through corner points, as a path. */
const pathOf = (points) => `M ${points.map(([x, y]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join(' L ')}`;

/**
 * The point a share `t` (0..1) of the way along an arrow's line, read from its `d`: the place a
 * label rides at. Along the legs of a straight or elbow arrow by their length; along a curve by
 * its own measure, which is near enough for a label.
 */
export function pathPoint(d, t) {
  const n = (String(d).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const k = Math.max(0, Math.min(1, Number(t) || 0));
  if (n.length < 4) return { x: n[0] || 0, y: n[1] || 0 };
  if (String(d).includes('C') && n.length >= 8) {
    const m = 1 - k;
    const w = [m * m * m, 3 * m * m * k, 3 * m * k * k, k * k * k];
    return {
      x: w[0] * n[0] + w[1] * n[2] + w[2] * n[4] + w[3] * n[6],
      y: w[0] * n[1] + w[1] * n[3] + w[2] * n[5] + w[3] * n[7],
    };
  }
  const points = [];
  for (let i = 0; i + 1 < n.length; i += 2) points.push([n[i], n[i + 1]]);
  const legs = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let left = legs.reduce((a, b) => a + b, 0) * k;
  for (let i = 0; i < legs.length; i += 1) {
    if (left <= legs[i] || i === legs.length - 1) {
      const f = legs[i] ? Math.min(1, left / legs[i]) : 0;
      return { x: points[i][0] + (points[i + 1][0] - points[i][0]) * f, y: points[i][1] + (points[i + 1][1] - points[i][1]) * f };
    }
    left -= legs[i];
  }
  return { x: points[0][0], y: points[0][1] };
}

/** How near (px) an arrow's line the middle of a text box must be let go to ride the arrow. */
export const LABEL_CATCH = 30;

/**
 * An arrow's heads and line, as its bar set them (1.0.4): `data-heads` both / start / none (one
 * at the end when it is not there), `data-dash`. Written on the line itself, so a note printed or
 * exported shows them without this code.
 */
export function dress(arrow) {
  const line = arrow.querySelector('.arrow-line');
  const marker = arrow.querySelector('marker');
  if (!line || !marker) return;
  const heads = arrow.dataset.heads || 'end';
  const url = `url(#${marker.id})`;
  marker.setAttribute('orient', 'auto-start-reverse');   // the same head, turned round at the start
  if (heads === 'none' || heads === 'start') line.removeAttribute('marker-end'); else line.setAttribute('marker-end', url);
  if (heads === 'both' || heads === 'start') line.setAttribute('marker-start', url); else line.removeAttribute('marker-start');
  if (arrow.dataset.dash === '1') line.setAttribute('stroke-dasharray', '6 5'); else line.removeAttribute('stroke-dasharray');
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

/**
 * Anchors that name nothing an arrow needs.
 *
 * Dragging an arrow stamps an anchor on every block it could attach to, and
 * those stamps were saved; Enter then copied a line's anchor onto every line
 * split off it. The owner's Ideas note had 37 anchored blocks and no arrow at
 * all, and one anchor on nine paragraphs — an arrow looks its end up by anchor,
 * so which paragraph it met was a matter of order (0.9.1). An anchor no arrow
 * uses goes; of several copies, the first keeps it, which is the one an arrow
 * already resolved to. On open (migrate.js), and after Enter (dropCopiedAnchor).
 * @returns {number} anchors removed
 */
export function pruneAnchors(root) {
  const used = new Set();
  for (const arrow of root.querySelectorAll('.note-arrow')) {
    if (arrow.dataset.from) used.add(arrow.dataset.from);
    if (arrow.dataset.to) used.add(arrow.dataset.to);
  }
  const seen = new Set();
  let removed = 0;
  for (const el of root.querySelectorAll('[data-anchor]')) {
    const id = el.dataset.anchor;
    if (!used.has(id) || seen.has(id)) { delete el.dataset.anchor; removed += 1; }
    else seen.add(id);
  }
  return removed;
}

/** After Enter: the line the caret moved to does not keep the anchor of the line it was split from. */
export function dropCopiedAnchor(root, selection) {
  const at = selection?.anchorNode;
  const el = at?.nodeType === 1 ? at : at?.parentElement;
  const block = el?.closest('[data-anchor]');
  if (!block || !root.contains(block)) return false;
  const id = block.dataset.anchor;
  const twins = [...root.querySelectorAll('[data-anchor]')].filter((other) => other.dataset.anchor === id);
  if (twins.length < 2) return false;
  delete block.dataset.anchor;
  return true;
}

function num(el, name, fallback) {
  const v = parseFloat(el.dataset[name]);
  return Number.isFinite(v) ? v : fallback;
}

/** The ways out at an arrow's ends, as last measured (never saved); a held side says it too. */
const ways = new WeakMap();
const wayOut = (arrow, end) => {
  const known = ways.get(arrow);
  if (known && end in known) return known[end];
  return SIDE_DIR[arrow.dataset[`${end}Side`]] ?? null;
};
const setWay = (arrow, end, way) => { ways.set(arrow, { ...ways.get(arrow), [end]: way }); };

/** What the hand pulled an arrow's middle by, "x,y" on the arrow, or null. */
const bendOf = (arrow) => {
  const [x, y] = (arrow.dataset.bend || '').split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) && (x || y) ? [x, y] : null;
};
/** The way round what stands between an elbow's ends, as last looked for (never saved; the line it gives is). */
const rounds = new WeakMap();

/** How wide (px) the band along an arrow's line is that a press catches. */
export const HIT_WIDTH = 16;

function paint(arrow) {
  const path = arrow.querySelector('.arrow-line');
  if (!path) return;
  // "An arrow is not caught in the middle, only at its ends" (the owner, 1.0.4): the line is
  // 1.6 px, too thin to press. A wide unseen line under it takes the press; arrows drawn
  // before it get theirs the first time they are painted.
  let hit = arrow.querySelector('.arrow-hit');
  if (!hit) {
    hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('class', 'arrow-hit');
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', String(HIT_WIDTH));
    path.before(hit);
  }
  const round = rounds.get(arrow);
  path.setAttribute('d', round ? pathOf(round) : arrowPath(
    arrow.dataset.kind || 'straight',
    num(arrow, 'x1', 0), num(arrow, 'y1', 0),
    num(arrow, 'x2', 80), num(arrow, 'y2', 0),
    wayOut(arrow, 'from'), wayOut(arrow, 'to'), bendOf(arrow),
  ));
  hit.setAttribute('d', path.getAttribute('d'));
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
  // The grip in the middle that bends it (1.0.4); seen on a picked arrow only (editor.css), and
  // without a colour of its own, so a note printed without the app's looks shows none.
  const spot = bendPlace(arrow);
  let grip = arrow.querySelector('.arrow-bend');
  if (!spot) { grip?.remove(); return; }
  if (!grip) {
    grip = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    grip.setAttribute('class', 'arrow-bend');
    grip.setAttribute('r', '4.5');
    grip.setAttribute('fill', 'none');
    arrow.append(grip);
  }
  grip.setAttribute('cx', String(Math.round(spot.x * 10) / 10));
  grip.setAttribute('cy', String(Math.round(spot.y * 10) / 10));
}

/** Where an arrow's bending grip is: on the line gone round something, its middle; else bendSpot. */
function bendPlace(arrow) {
  const kind = arrow.dataset.kind || 'straight';
  const spot = bendSpot(kind, num(arrow, 'x1', 0), num(arrow, 'y1', 0), num(arrow, 'x2', 80), num(arrow, 'y2', 0),
    wayOut(arrow, 'from'), wayOut(arrow, 'to'), bendOf(arrow));
  const round = rounds.get(arrow);
  if (!spot || !round) return spot;
  const p = pathPoint(pathOf(round), 0.5);
  return { x: p.x, y: p.y, axis: spot.axis };
}

export function initArrows(editorEl, { history, shapes } = {}) {
  if (!editorEl) return null;
  const dirty = () => editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  const isLocked = () => editorEl.dataset.readonly === 'true';
  const newId = () => `r-${Math.random().toString(36).slice(2, 8)}`;

  function layer() {
    let el = editorEl.querySelector(':scope > .shape-layer:not(.shape-layer--behind)');   // the note's own, not a stage's inside it
    if (!el) {
      el = document.createElement('div');
      el.className = 'shape-layer';
      el.setAttribute('contenteditable', 'false');
      editorEl.prepend(el);
    }
    return el;
  }

  /** The kind put last from the bar: an arrow drawn from a shape's side is of that kind, an elbow until one was put. */
  let lastKind = null;

  /** An arrow of the bar is this wide and this tall wherever it is put. */
  const PUT = { w: 144, h: 36 };

  function add(kind, at = null) {
    lastKind = ARROW_KINDS.includes(kind) ? kind : lastKind;
    history?.push();
    const host = layer();
    const y = (editorEl.scrollTop || 0) + 72;
    const x1 = at ? Math.max(0, Math.round(at.x - PUT.w / 2)) : 56;
    const y1 = at ? Math.max(0, Math.round(at.y - PUT.h / 2)) : y;
    const arrow = makeArrow(kind, { x1, y1, x2: x1 + PUT.w, y2: y1 + PUT.h });
    host.appendChild(arrow);
    dirty();
    return arrow;
  }

  /**
   * Chosen from the bar: a faint line follows the pointer and a press in the note puts the arrow
   * there, its middle under the pointer (place.js).
   */
  function place(kind) {
    if (editorEl.dataset.readonly === 'true') return;
    const d = kind === 'elbow' ? `M0 0H${PUT.w / 2}V${PUT.h}H${PUT.w}`
      : kind === 'curve' ? `M0 0C${PUT.w / 2} 0 ${PUT.w / 2} ${PUT.h} ${PUT.w} ${PUT.h}`
        : `M0 0L${PUT.w} ${PUT.h}`;
    const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ghost.setAttribute('width', String(PUT.w));
    ghost.setAttribute('height', String(PUT.h));
    ghost.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6"></path>`
      + `<circle cx="${PUT.w}" cy="${PUT.h}" r="3.5" fill="currentColor"></circle>`;
    beginPlacing(editorEl, {
      ghost, width: PUT.w, height: PUT.h,
      put: (e) => { add(kind, pagePoint(editorEl, layer(), e)); reflow(); },
    });
  }

  function boxes() {
    const origin = layer().getBoundingClientRect();
    // Rectangles are on the screen, the arrows' ends on the page (page-zoom.js).
    const z = editorZoom(editorEl);
    const out = [];
    let order = 0;
    for (const el of editorEl.querySelectorAll('.shape, .link-block, .note-image, p, h1, h2, h3, li')) {
      order += 1;
      if (el.matches('.shape.area')) continue;   // a work area is ground: an arrow in it holds what lies in it
      if (!el.textContent.trim() && !el.matches('.shape, .link-block, .note-image')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      out.push({
        geometry: el.matches('.shape') ? {
          left: (r.left + r.width / 2 - origin.left) / z - el.offsetWidth / 2,
          top: (r.top + r.height / 2 - origin.top) / z - el.offsetHeight / 2,
          width: el.offsetWidth, height: el.offsetHeight,
        } : null,
        shapeKind: el.dataset.kind,
        rotation: Number(el.dataset.rot) || 0,
        id: ensureAnchor(el),
        el,
        kind: el.matches('.shape, .link-block, .note-image') ? 'object' : 'text',
        // Paint order: the back canvas, then the text, then the front canvas, each in DOM order.
        z: (el.closest('.shape-layer--behind') ? 0 : el.closest('.shape-layer') ? 200000 : 100000) + order,
        x: (r.left + r.width / 2 - origin.left) / z,
        y: (r.top + r.height / 2 - origin.top) / z,
        box: {
          left: (r.left - origin.left) / z,
          top: (r.top - origin.top) / z,
          width: r.width / z,
          height: r.height / z,
        },
      });
    }
    return out;
  }

  const meetingPoint = (target, toward) => target.geometry
    ? shapeAnchorPoint(target.geometry, toward, target.shapeKind, target.rotation)
    : anchorPoint(target.box, toward);

  /**
   * Where an end meets what it holds, and the way out from there. With a side it is the middle
   * of that side (shape-ports.js); without, the point that faces the other end, as before.
   * Lines of text give no way out: an arrow to a word is drawn as it always was.
   */
  function meet(target, toward, side, spot = null) {
    const box = target.geometry ?? target.box;
    const kind = target.geometry ? target.shapeKind : 'rect';
    const rotation = target.geometry ? target.rotation : 0;
    if (spot && !side && target.kind === 'object') {
      // A place on the outline the end was let go at (1.0.4): it stays there.
      const p = spotPoint(box, spot.u, spot.v, kind, rotation);
      return { x: p.x, y: p.y, way: outwardAt(box, p, rotation) };
    }
    if (side && target.kind === 'object') {
      const p = sidePoint(box, side, kind, rotation);
      return { x: p.x, y: p.y, way: [p.dx, p.dy] };
    }
    const p = meetingPoint(target, toward);
    return { x: p.x, y: p.y, way: target.kind === 'object' ? outwardAt(box, p, rotation) : null };
  }
  const spotNear = (target, point) => (target?.kind === 'object'
    ? edgeSpot(point, target.geometry ?? target.box, target.geometry ? target.shapeKind : 'rect', target.geometry ? target.rotation : 0)
    : null);
  /** The place kept on an arrow's end, "u,v", or null. */
  const spotOf = (arrow, end) => {
    const [u, v] = (arrow.dataset[`${end}At`] || '').split(',').map(Number);
    return Number.isFinite(u) && Number.isFinite(v) ? { u, v } : null;
  };
  const sideNear = (target, point) => (target?.kind === 'object'
    ? nearestSide(point, target.geometry ?? target.box, target.geometry ? target.shapeKind : 'rect', target.geometry ? target.rotation : 0)
    : null);

  function reflow() {
    const arrows = editorEl.querySelectorAll('.note-arrow');
    if (!arrows.length) return;
    const found = boxes();
    for (const arrow of arrows) {
      for (const end of ['from', 'to']) {
        const id = arrow.dataset[end];
        const hit = found.find((a) => a.id === id);
        if (!hit) { setWay(arrow, end, null); continue; }
        const other = end === 'from'
          ? { x: num(arrow, 'x2', 0), y: num(arrow, 'y2', 0) }
          : { x: num(arrow, 'x1', 0), y: num(arrow, 'y1', 0) };
        const p = meet(hit, other, arrow.dataset[`${end}Side`], spotOf(arrow, end));
        setWay(arrow, end, p.way);
        arrow.dataset[end === 'from' ? 'x1' : 'x2'] = String(Math.round(p.x));
        arrow.dataset[end === 'from' ? 'y1' : 'y2'] = String(Math.round(p.y));
      }
      goRound(arrow, found);
      paint(arrow);
      placeHandles(arrow);
      placeRiders(arrow);
    }
    positionBar();
  }

  /**
   * An elbow whose own line passes through an object takes the way round it (arrow-route.js). The
   * line the hand bent is left as the hand put it; one that crosses nothing is drawn as always.
   * Lines of text and work areas are ground, and a label riding the arrow is on it by right.
   */
  function goRound(arrow, found) {
    rounds.delete(arrow);
    if ((arrow.dataset.kind || 'straight') !== 'elbow' || bendOf(arrow)) return;
    // An arrow that holds nothing is a drawing: it lies where it was laid, across a shape too.
    if (!arrow.dataset.from && !arrow.dataset.to) return;
    const x1 = num(arrow, 'x1', 0);
    const y1 = num(arrow, 'y1', 0);
    const x2 = num(arrow, 'x2', 80);
    const y2 = num(arrow, 'y2', 0);
    const d1 = wayOut(arrow, 'from');
    const d2 = wayOut(arrow, 'to');
    const a = d1 ? [x1 + d1[0] * STUB, y1 + d1[1] * STUB] : [x1, y1];
    const b = d2 ? [x2 + d2[0] * STUB, y2 + d2[1] * STUB] : [x2, y2];
    const rects = found
      .filter((t) => t.kind === 'object' && !(t.el.dataset.rides && t.el.dataset.rides === arrow.dataset.aid))
      .map((t) => grown(t.box));
    const walls = wallsFor(a, b, rects);
    if (!walls.length) return;
    const own = d1 || d2
      ? elbowPoints(x1, y1, x2, y2, d1, d2)
      : [[x1, y1], [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2], [x2, y2]];
    // The stubs are the ends' own: what is looked at is the line between them.
    const inner = own.slice(d1 ? 1 : 0, d2 ? own.length - 1 : own.length);
    if (!crosses(inner, walls)) return;
    const way = routeRound(a, b, d1, d2, walls);
    if (!way) return;
    const points = [];
    for (const p of [[x1, y1], ...way, [x2, y2]]) {
      const last = points[points.length - 1];
      if (!last || Math.abs(last[0] - p[0]) > 0.05 || Math.abs(last[1] - p[1]) > 0.05) points.push(p);
    }
    rounds.set(arrow, points);
  }

  let drag = null;
  let selected = null;
  function select(arrow) {
    selected?.classList.remove('is-selected');
    selected = arrow;
    arrow?.classList.add('is-selected');
    positionBar();
  }

  // ---- the bar of a picked arrow (1.0.4): "editing for the arrows, they are clumsy" ----
  let bar = document.getElementById('arrow-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'arrow-bar';
    bar.className = 'shape-bar';
    bar.hidden = true;
    document.body.append(bar);
  }
  bar.innerHTML = '<button type="button" data-arrow="straight" title="Straight arrow"><svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 15.5 14.5 3.5"/><path d="M8.5 3.5h6v6"/></svg></button><button type="button" data-arrow="elbow" title="Elbow arrow"><svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h7v9h6"/><path d="M12.5 10.5l3 3-3 3"/></svg></button><button type="button" data-arrow="curve" title="Curved arrow"><svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 14.5C3.5 6 9 3.5 15 4.5"/><path d="M11.5 2l3.6 2.6-2.6 3.4"/></svg></button><span class="shape-bar__sep"></span><button type="button" data-arrow="heads" title="Arrowheads: both ways, the other way, none"><svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h12"/><path d="M6 6 3 9l3 3"/><path d="M12 6l3 3-3 3"/></svg></button><button type="button" data-arrow="dash" title="Dashed line on / off"><svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9h3M7.5 9h3M13 9h3"/></svg></button><button type="button" data-arrow="label" title="Add a label"><svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4.5h10M9 4.5v9.5"/></svg></button><button type="button" data-arrow="del" title="Delete arrow">✕</button>';

  function positionBar() {
    if (!selected?.isConnected || drag || isLocked()) { bar.hidden = true; return; }
    bar.hidden = false;
    const r = (selected.querySelector('.arrow-line') ?? selected).getBoundingClientRect();
    const w = bar.offsetWidth || 230;
    const h = bar.offsetHeight || 34;
    const top = r.top - h - 14 >= 8 ? r.top - h - 14 : Math.min(r.bottom + 14, window.innerHeight - h - 8);
    bar.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
    bar.style.top = `${Math.max(8, top)}px`;
    const kind = selected.dataset.kind || 'straight';
    for (const b of bar.querySelectorAll('[data-arrow]')) {
      b.classList.toggle('on', b.dataset.arrow === kind || (b.dataset.arrow === 'dash' && selected.dataset.dash === '1'));
    }
  }

  // ---- text boxes that ride an arrow: its labels ----
  const ridersOf = (arrow) => (arrow.dataset.aid
    ? [...editorEl.querySelectorAll(`.shape[data-rides="${arrow.dataset.aid}"]`)] : []);
  const middle = (box) => ({
    x: (parseFloat(box.style.left) || 0) + box.offsetWidth / 2,
    y: (parseFloat(box.style.top) || 0) + box.offsetHeight / 2,
  });

  /** Each label goes where its share of the line is now, as far above or below it as it was put. */
  function placeRiders(arrow) {
    if (!arrow.dataset.aid) return;
    const d = arrow.querySelector('.arrow-line')?.getAttribute('d');
    if (!d) return;
    for (const box of ridersOf(arrow)) {
      const p = pathPoint(d, box.dataset.rideT);
      box.style.left = `${Math.max(0, Math.round(p.x + (Number(box.dataset.rideDx) || 0) - box.offsetWidth / 2))}px`;
      box.style.top = `${Math.max(0, Math.round(p.y + (Number(box.dataset.rideDy) || 0) - box.offsetHeight / 2))}px`;
    }
  }

  /** The arrow whose line passes nearest a point, and where along it. */
  function nearestLine(point) {
    let best = null;
    for (const arrow of editorEl.querySelectorAll('.note-arrow')) {
      const d = arrow.querySelector('.arrow-line')?.getAttribute('d');
      if (!d) continue;
      for (let i = 0; i <= 48; i += 1) {
        const p = pathPoint(d, i / 48);
        const dist = Math.hypot(p.x - point.x, p.y - point.y);
        if (!best || dist < best.dist) best = { arrow, t: i / 48, p, dist };
      }
    }
    return best && best.dist <= LABEL_CATCH ? best : null;
  }

  /** While a text box is carried: the arrow that would take it is lit. */
  function hint(box) {
    const near = box?.matches?.('.shape.textbox') ? nearestLine(middle(box))?.arrow : null;
    for (const arrow of editorEl.querySelectorAll('.note-arrow.is-catching')) if (arrow !== near) arrow.classList.remove('is-catching');
    near?.classList.add('is-catching');
  }

  /**
   * A text box let go by an arrow's line rides the arrow from then on: at that share of the line,
   * above it or below it as it was let go. Let go away from every line it is its own again.
   * @returns {boolean} whether an arrow took it
   */
  function catchLabel(box) {
    hint(null);
    if (!box?.matches?.('.shape.textbox')) return false;
    const at = middle(box);
    const near = nearestLine(at);
    if (!near) { for (const key of RIDE_KEYS) delete box.dataset[key]; return false; }
    if (!near.arrow.dataset.aid) near.arrow.dataset.aid = newId();
    box.dataset.rides = near.arrow.dataset.aid;
    box.dataset.rideT = String(Math.round(near.t * 1000) / 1000);
    box.dataset.rideDx = String(Math.round(at.x - near.p.x));
    box.dataset.rideDy = String(Math.round(at.y - near.p.y));
    return true;
  }

  /** A label put from the bar: a text box above the middle of the line, the caret in it. */
  function addLabel(arrow) {
    const box = makeShape('textbox', undefined, { left: 0, top: 0 });
    box.style.width = '90px';
    box.style.height = '34px';
    if (!arrow.dataset.aid) arrow.dataset.aid = newId();
    box.dataset.rides = arrow.dataset.aid;
    box.dataset.rideT = '0.5';
    box.dataset.rideDx = '0';
    box.dataset.rideDy = '-22';
    layer().appendChild(box);
    placeRiders(arrow);
    select(null);
    dirty();
    shapes?.edit?.(box);
    return box;
  }

  /** An arrow goes; its labels stay where they are, their own again. */
  function drop(arrow) {
    for (const box of ridersOf(arrow)) for (const key of RIDE_KEYS) delete box.dataset[key];
    arrow.remove();
    if (selected === arrow) select(null);
  }

  bar.addEventListener('mousedown', (e) => e.preventDefault());
  bar.addEventListener('click', (e) => {
    const act = e.target.closest?.('[data-arrow]')?.dataset.arrow;
    const arrow = selected;
    if (!act || !arrow?.isConnected || isLocked()) return;
    history?.push();
    if (ARROW_KINDS.includes(act)) {
      // A bend is of the line it was made on: another kind of line begins unbent.
      if (arrow.dataset.kind !== act) delete arrow.dataset.bend;
      arrow.dataset.kind = act;
      lastKind = act;
    } else if (act === 'heads') {
      // Both ways, the other way, none, and as it was drawn (the owner's order).
      const next = { end: 'both', both: 'start', start: 'none', none: 'end' }[arrow.dataset.heads || 'end'] ?? 'end';
      if (next === 'end') delete arrow.dataset.heads; else arrow.dataset.heads = next;
      dress(arrow);
    } else if (act === 'dash') {
      if (arrow.dataset.dash === '1') delete arrow.dataset.dash; else arrow.dataset.dash = '1';
      dress(arrow);
    } else if (act === 'label') {
      addLabel(arrow);
      return;
    } else if (act === 'del') {
      drop(arrow);
      dirty();
      return;
    }
    reflow();
    dirty();
  });
  // A press anywhere but the note and the bar lets the arrow go, as it does a shape.
  document.addEventListener('mousedown', (e) => {
    if (selected && !e.target.closest?.('#arrow-bar') && !editorEl.contains(e.target)) select(null);
  });
  editorEl.addEventListener('scroll', () => { if (selected) positionBar(); }, { passive: true });
  editorEl.addEventListener('input', () => { if (selected) positionBar(); });
  editorEl.addEventListener('mousedown', (e) => {
    const handle = e.target.closest?.('.arrow-end');
    const grip = e.target.closest?.('.arrow-bend');
    const arrow = e.target.closest?.('.note-arrow');
    if (!arrow) { select(null); return; }
    e.preventDefault();
    select(arrow);
    if (isLocked()) return;
    history?.push();
    // The grip of a line gone round something is on that line: the bend begins where the grip is.
    const spot = grip ? bendPlace(arrow) : null;
    const own = grip && rounds.get(arrow)
      ? bendSpot('elbow', num(arrow, 'x1', 0), num(arrow, 'y1', 0), num(arrow, 'x2', 80), num(arrow, 'y2', 0), wayOut(arrow, 'from'), wayOut(arrow, 'to'))
      : null;
    drag = {
      arrow,
      end: grip ? 'bend' : handle?.dataset.end || 'move',
      axis: spot?.axis ?? null,
      bend: own && spot ? [spot.x - own.x, spot.y - own.y] : bendOf(arrow) ?? [0, 0],
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
    positionBar();
  });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const z = editorZoom(editorEl);
    const dx = (e.clientX - drag.x) / z;
    const dy = (e.clientY - drag.y) / z;
    // While the hand has it the line is its own; the way round is looked for again when it lets go.
    if (drag.end !== 'bend' || dx || dy) rounds.delete(drag.arrow);
    if (drag.end === 'bend') {
      // An elbow's leg goes across or down only; a straight or curved line's middle goes anywhere.
      const bx = drag.axis === 1 ? 0 : Math.round(drag.bend[0] + dx);
      const bz = drag.axis === 0 ? 0 : Math.round(drag.bend[1] + dy);
      if (dx || dy) {
        if (bx || bz) drag.arrow.dataset.bend = `${bx},${bz}`; else delete drag.arrow.dataset.bend;
      }
    } else if (drag.end === 'move') {
      drag.arrow.dataset.x1 = String(Math.round(drag.x1 + dx));
      drag.arrow.dataset.y1 = String(Math.round(drag.y1 + dy));
      drag.arrow.dataset.x2 = String(Math.round(drag.x2 + dx));
      drag.arrow.dataset.y2 = String(Math.round(drag.y2 + dy));
    } else {
      const from = drag.end === 'from';
      const point = { x: (from ? drag.x1 : drag.x2) + dx, y: (from ? drag.y1 : drag.y2) + dy };
      const hit = magnetTarget(point, drag.targets || []);
      // Near the middle of a side the end holds that side; its four are shown meanwhile (shape-ports.js).
      const side = sideNear(hit, point);
      // Elsewhere at its edge it holds the outline right there; deep inside, the object as a whole.
      const spot = side ? null : spotNear(hit, point);
      if (hit?.el !== drag.target?.el || side !== drag.side) {
        drag.target?.el.classList.remove('arrow-target');
        hit?.el.classList.add('arrow-target');
        editorEl.dispatchEvent(new CustomEvent('nebula-arrow-target', { detail: hit?.kind === 'object' ? { el: hit.el, side } : null }));
      }
      drag.target = hit;
      drag.side = side;
      drag.spot = spot;
      // Held: the end sits on the target's edge, facing the other end, while
      // still being dragged — so it is visible that it has taken hold.
      const other = from ? { x: num(drag.arrow, 'x2', 0), y: num(drag.arrow, 'y2', 0) } : { x: num(drag.arrow, 'x1', 0), y: num(drag.arrow, 'y1', 0) };
      const at = hit ? meet(hit, other, side, spot) : point;
      setWay(drag.arrow, drag.end, hit ? at.way : null);
      drag.arrow.dataset[from ? 'x1' : 'x2'] = String(Math.round(at.x));
      drag.arrow.dataset[from ? 'y1' : 'y2'] = String(Math.round(at.y));
    }
    paint(drag.arrow);
    placeHandles(drag.arrow);
    placeRiders(drag.arrow);
  });

  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    if (drag.end === 'bend' || drag.end === 'move') {
      reflow();
    } else {
      const hit = drag.target;
      drag.target?.el.classList.remove('arrow-target');
      if (hit) editorEl.dispatchEvent(new CustomEvent('nebula-arrow-target', { detail: null }));
      if (hit) drag.arrow.dataset[drag.end] = hit.id;
      else delete drag.arrow.dataset[drag.end];
      if (hit && drag.side) drag.arrow.dataset[`${drag.end}Side`] = drag.side;
      else delete drag.arrow.dataset[`${drag.end}Side`];
      if (hit && !drag.side && drag.spot) drag.arrow.dataset[`${drag.end}At`] = `${drag.spot.u},${drag.spot.v}`;
      else delete drag.arrow.dataset[`${drag.end}At`];
      if (!hit && drag.ground) {
        // Drawn from a shape's side and let go on open ground: too short to be meant, it is
        // dropped; else the ground gives it something to hold (a shape like the first).
        const from = { x: num(drag.arrow, 'x1', 0), y: num(drag.arrow, 'y1', 0) };
        const to = { x: num(drag.arrow, 'x2', 0), y: num(drag.arrow, 'y2', 0) };
        const got = Math.hypot(to.x - from.x, to.y - from.y) < 24 ? null : drag.ground(to, from);
        if (got?.el) {
          drag.arrow.dataset.to = ensureAnchor(got.el);
          if (got.side) drag.arrow.dataset.toSide = got.side;
        } else {
          drop(drag.arrow);
        }
      }
      reflow();
    }
    const done = drag.done;
    drag = null;
    positionBar();
    dirty();
    done?.();
  });

  // A double-click on the grip takes the bend back: the line is its own again.
  editorEl.addEventListener('dblclick', (e) => {
    const arrow = e.target.closest?.('.arrow-bend')?.closest('.note-arrow');
    if (!arrow || isLocked() || !arrow.dataset.bend) return;
    e.preventDefault();
    history?.push();
    delete arrow.dataset.bend;
    reflow();
    dirty();
  });

  document.addEventListener('keydown', (e) => {
    if (editorEl.dataset.readonly === 'true') return;
    if (e.key === 'Escape' && selected) { select(null); return; }
    // The editor keeps focus when an arrow is pressed (mousedown is cancelled
    // so the caret does not jump), so the key arrives from #editor. Excluding
    // #editor here made a selected arrow impossible to delete (0.8.3).
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected?.isConnected
      && !e.target.closest?.('.shape-text, .code-src, .image-caption, .blk-table, input, textarea, select')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      history?.push();
      drop(selected);
      dirty();
    }
  }, true); // capture: before the editor's own Backspace handling edits text

  /** An arrow between two objects, each end on a side (or free of one). */
  function link(a, sideA, b, sideB) {
    const arrow = makeArrow(lastKind ?? 'elbow');
    arrow.dataset.from = ensureAnchor(a);
    arrow.dataset.to = ensureAnchor(b);
    if (sideA) arrow.dataset.fromSide = sideA;
    if (sideB) arrow.dataset.toSide = sideB;
    // An end without a side faces the other: each starts at the middle of what it holds.
    const found = boxes();
    for (const [el, x, y] of [[a, 'x1', 'y1'], [b, 'x2', 'y2']]) {
      const hit = found.find((t) => t.el === el);
      if (hit) { arrow.dataset[x] = String(Math.round(hit.x)); arrow.dataset[y] = String(Math.round(hit.y)); }
    }
    layer().appendChild(arrow);
    reflow();
    return arrow;
  }

  /**
   * An arrow drawn out of a side of `shape`, its far end in the hand from the press `e` on
   * (shape-ports.js). `ground(to, from)` is asked what the end holds when it is let go on
   * nothing; `done()` is told when the hand lets go.
   */
  function join(shape, side, e, { ground, done } = {}) {
    history?.push();
    const host = layer();
    const arrow = makeArrow(lastKind ?? 'elbow');
    arrow.dataset.from = ensureAnchor(shape);
    arrow.dataset.fromSide = side;
    const origin = host.getBoundingClientRect();
    const z = editorZoom(editorEl);
    const x2 = Math.round((e.clientX - origin.left) / z);
    const y2 = Math.round((e.clientY - origin.top) / z);
    arrow.dataset.x2 = String(x2);
    arrow.dataset.y2 = String(y2);
    host.appendChild(arrow);
    reflow();
    select(arrow);
    drag = {
      arrow, end: 'to', target: null, side: null, ground, done,
      targets: boxes().filter((b) => b.el !== shape),
      x: e.clientX, y: e.clientY,
      x1: num(arrow, 'x1', 0), y1: num(arrow, 'y1', 0), x2, y2,
    };
    return arrow;
  }

  return {
    add, place, reflow, link, join, catchLabel, hint,
    /** A note is opened: the arrow that was picked is gone. */
    reset: () => { cancelPlacing(); drag = null; select(null); },
  };
}
