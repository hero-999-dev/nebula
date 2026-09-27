/**
 * Where an arrow meets a shape: on the painted outline, including a rotated
 * shape, instead of the invisible rectangle around a triangle, diamond or
 * ellipse. `box` is the unrotated shape in editor coordinates; `toward` is the
 * arrow's other end.
 */
export function shapeAnchorPoint(box, toward, kind = 'rect', rotation = 0) {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const radians = (rotation * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);

  // The direction to the other end, in the shape's own (unrotated) frame.
  const vx = toward.x - cx;
  const vy = toward.y - cy;
  const dx0 = c * vx + s * vy;
  const dy0 = -s * vx + c * vy;
  const rx = Math.max(0.5, box.width / 2);
  const ry = Math.max(0.5, box.height / 2);
  const [dx, dy] = Math.abs(dx0) + Math.abs(dy0) < 0.001 ? [dx0, 1] : [dx0, dy0];

  let x;
  let y;
  if (kind === 'diamond') {
    const scale = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
    x = dx * scale;
    y = dy * scale;
  } else if (kind === 'ellipse' || kind === 'circle') {
    const scale = 1 / Math.hypot(dx / rx, dy / ry);
    x = dx * scale;
    y = dy * scale;
  } else if (kind === 'triangle') {
    // The nearest edge the ray from the centre crosses.
    const points = [[0, -ry], [rx, ry], [-rx, ry]];
    const cross = (ax, ay, bx, by) => ax * by - ay * bx;
    let nearest = Infinity;
    for (let i = 0; i < 3; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % 3];
      const ex = bx - ax;
      const ey = by - ay;
      const denominator = cross(dx, dy, ex, ey);
      if (Math.abs(denominator) < 1e-9) continue;
      const t = cross(ax, ay, ex, ey) / denominator;
      const u = cross(ax, ay, dx, dy) / denominator;
      if (t >= 0 && u >= 0 && u <= 1) nearest = Math.min(nearest, t);
    }
    x = dx * nearest;
    y = dy * nearest;
  } else {
    // Keep the four cardinal attachment points rectangles already used.
    const options = [[-rx, 0], [rx, 0], [0, -ry], [0, ry]];
    const distance = (p) => Math.abs(dx - p[0]) + Math.abs(dy - p[1]);
    [x, y] = options.reduce((best, p) => (distance(p) < distance(best) ? p : best));
  }
  return { x: cx + c * x - s * y, y: cy + s * x + c * y };
}
