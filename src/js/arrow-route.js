/**
 * An elbow arrow that goes round what lies in its way (1.0.4, the owner's plan for the arrows).
 *
 * The line an elbow draws by itself knows its two ends only: a shape standing between them was
 * drawn through. Here the way is looked for again, on the lines that run along the edges of what
 * is in the way: the shortest one with the fewest corners that passes through nothing. Pure — boxes
 * and points on the page, no layout.
 */

/** How far (px) the line keeps from an object it goes round. Less than an elbow's stub, so the stub's end is clear of what it left. */
export const CLEAR = 10;
/** What a corner costs, in px of line: a way a little longer with fewer corners is the better one. */
const TURN = 30;
/** Of two ways as long, with as many corners, the one that turns nearer the middle: a corner's cost per px from it. */
const AWAY = 0.001;
/** No more objects than this are gone round at once; beyond it the line is left as it is. */
const MOST = 24;

/** A box on the page, grown by `by` on every side, as its four edges. */
export function grown(box, by = CLEAR) {
  return { left: box.left - by, top: box.top - by, right: box.left + box.width + by, bottom: box.top + box.height + by };
}

const within = (p, r) => p[0] > r.left && p[0] < r.right && p[1] > r.top && p[1] < r.bottom;

/** Whether a level or upright leg passes through a box; along its edge is not through it. */
function through(p, q, r) {
  return Math.max(p[0], q[0]) > r.left && Math.min(p[0], q[0]) < r.right
    && Math.max(p[1], q[1]) > r.top && Math.min(p[1], q[1]) < r.bottom;
}

/** Whether a line of level and upright legs passes through any of the boxes. */
export function crosses(points, walls) {
  for (let i = 0; i + 1 < points.length; i += 1) {
    for (const r of walls) if (through(points[i], points[i + 1], r)) return true;
  }
  return false;
}

/** The boxes that count for a way from `a` to `b`: not one an end stands in, and only those near. */
export function wallsFor(a, b, rects, reach = 120) {
  const left = Math.min(a[0], b[0]) - reach;
  const right = Math.max(a[0], b[0]) + reach;
  const top = Math.min(a[1], b[1]) - reach;
  const bottom = Math.max(a[1], b[1]) + reach;
  return rects.filter((r) => !within(a, r) && !within(b, r)
    && r.right > left && r.left < right && r.bottom > top && r.top < bottom);
}

// The four ways a leg runs: right, left, down, up.
const WAYS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const wayIndex = (d) => (!d ? -1 : Math.abs(d[0]) >= Math.abs(d[1]) ? (d[0] > 0 ? 0 : 1) : (d[1] > 0 ? 2 : 3));

/**
 * The way from `a` to `b` round the boxes in `walls`, as corner points with both ends, or null
 * when there is none (or too much stands there to look). `d1`: the way the line is already running
 * at `a`; `d2`: the way out of what the far end holds, which the line arrives against.
 */
export function routeRound(a, b, d1, d2, walls) {
  if (walls.length > MOST) return null;
  const line = (values) => [...new Set(values.map((v) => Math.round(v * 10) / 10))].sort((p, q) => p - q);
  const xs = line([a[0], b[0], (a[0] + b[0]) / 2, ...walls.flatMap((r) => [r.left, r.right])]);
  const ys = line([a[1], b[1], (a[1] + b[1]) / 2, ...walls.flatMap((r) => [r.top, r.bottom])]);
  const near = (list, v) => list.indexOf(Math.round(v * 10) / 10);
  const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = [near(xs, a[0]), near(ys, a[1])];
  const goal = [near(xs, b[0]), near(ys, b[1])];
  const first = wayIndex(d1);
  const last = d2 ? wayIndex([-d2[0], -d2[1]]) : -1;
  const key = (ix, iy, way) => (ix * ys.length + iy) * 5 + way + 1;
  const best = new Map();
  const from = new Map();
  // A small heap of [cost, ix, iy, way].
  const heap = [];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (heap[up][0] <= heap[i][0]) break;
      [heap[up], heap[i]] = [heap[i], heap[up]];
      i = up;
    }
  };
  const pop = () => {
    const top = heap[0];
    const end = heap.pop();
    if (heap.length) {
      heap[0] = end;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let least = i;
        if (l < heap.length && heap[l][0] < heap[least][0]) least = l;
        if (r < heap.length && heap[r][0] < heap[least][0]) least = r;
        if (least === i) break;
        [heap[least], heap[i]] = [heap[i], heap[least]];
        i = least;
      }
    }
    return top;
  };
  best.set(key(start[0], start[1], first), 0);
  push([0, start[0], start[1], first]);
  let reached = null;
  while (heap.length) {
    const [cost, ix, iy, way] = pop();
    const k = key(ix, iy, way);
    if (cost > best.get(k)) continue;
    if (ix === goal[0] && iy === goal[1]) {
      // Arriving against the way out of what the end holds is free; any other way is a corner more.
      const whole = cost + (last !== -1 && way !== -1 && way !== last
        ? TURN + AWAY * (Math.abs(b[0] - middle[0]) + Math.abs(b[1] - middle[1])) : 0);
      if (!reached || whole < reached.cost) reached = { cost: whole, k };
      continue;
    }
    if (reached && cost >= reached.cost) break;
    for (let w = 0; w < 4; w += 1) {
      if (way !== -1 && (way ^ 1) === w) continue;                 // no turning back on itself
      const nx = ix + WAYS[w][0];
      const ny = iy + WAYS[w][1];
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
      const p = [xs[ix], ys[iy]];
      const q = [xs[nx], ys[ny]];
      if (walls.some((r) => through(p, q, r))) continue;
      const turn = way !== -1 && way !== w ? TURN + AWAY * (Math.abs(p[0] - middle[0]) + Math.abs(p[1] - middle[1])) : 0;
      const next = cost + Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + turn;
      const nk = key(nx, ny, w);
      if (next < (best.get(nk) ?? Infinity)) {
        best.set(nk, next);
        from.set(nk, k);
        push([next, nx, ny, w]);
      }
    }
  }
  if (!reached) return null;
  const points = [];
  for (let k = reached.k; k !== undefined; k = from.get(k)) {
    const node = Math.floor(k / 5);
    points.unshift([xs[Math.floor(node / ys.length)], ys[node % ys.length]]);
  }
  // Only the corners: a point on a straight run between two others says nothing.
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const before = points[i - 1];
    const after = points[i + 1];
    return !((before[0] === p[0] && p[0] === after[0]) || (before[1] === p[1] && p[1] === after[1]));
  });
}
