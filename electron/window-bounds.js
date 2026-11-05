/**
 * Where the window may stand (1.0.3). The saved rectangle was restored as it
 * was, and a window left on a monitor that is no longer plugged in opened out
 * of sight: running, on the taskbar, and impossible to reach ("uygulama açık
 * gözüküyor ama ekranda gözükmüyor", the owner).
 */

/** How much of the window's top must stand on a screen for it to be taken by the mouse. */
const GRAB = 100;
/** A window snapped to an edge stands a few pixels over it. */
const OVER = 16;

const overlap = (a, aEnd, b, bEnd) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(a, b));

/** Its top strip can be reached on that work area. */
function reachable(bounds, area) {
  const wide = overlap(bounds.x, bounds.x + bounds.width, area.x, area.x + area.width);
  return wide >= GRAB && bounds.y >= area.y - OVER && bounds.y <= area.y + area.height - OVER * 2;
}

/** How far the rectangle's middle is from an area; 0 inside it. */
function distance(bounds, area) {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const dx = Math.max(area.x - cx, 0, cx - (area.x + area.width));
  const dy = Math.max(area.y - cy, 0, cy - (area.y + area.height));
  return Math.hypot(dx, dy);
}

/**
 * The rectangle to open at: the saved one when it can be reached on a screen
 * there is now; otherwise its size, cut to fit, in the middle of the nearest one.
 * @param {{x: number, y: number, width: number, height: number}} bounds
 * @param {Array<{x: number, y: number, width: number, height: number}>} areas the work areas of the displays
 */
export function onScreenBounds(bounds, areas) {
  if (!areas?.length || areas.some((area) => reachable(bounds, area))) return bounds;
  const area = areas.reduce((best, each) => (distance(bounds, each) < distance(bounds, best) ? each : best));
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };
}
