/**
 * The bottom-right corner's small cards that follow the user from note to
 * note: a Pomodoro going on out of sight, a calendar's alarm. They stack in
 * one column, above the update and sync cards when those are up.
 */

let stack = null;

/** The column the corner's cards go in, made the first time it is asked for. */
export function cornerStack() {
  if (stack?.isConnected) return stack;
  stack = document.createElement('div');
  stack.id = 'corner-stack';
  stack.className = 'corner-stack';
  document.body.append(stack);
  return stack;
}

/* Between the column and the note frame's inner rail. */
const INSIDE = 10;

/**
 * Sit just above and left of the note frame's bottom-right corner, inside its
 * rails (the owner, 1.0.3: "tam köse cizgilerinin üstünde ve solunda"), and
 * over the update, sync and screen cards that are showing.
 */
export function placeCorner() {
  if (!stack?.isConnected) return;
  let right = 18;
  let bottom = 18;
  const frames = [...document.querySelectorAll('.editor-frame')].filter((f) => f.offsetWidth);
  const frame = frames.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
  if (frame) {
    const r = frame.getBoundingClientRect();
    right = Math.max(right, window.innerWidth - Math.min(r.right, window.innerWidth) + INSIDE);
    bottom = Math.max(bottom, window.innerHeight - Math.min(r.bottom, window.innerHeight) + INSIDE);
  }
  for (const id of ['update-card', 'sync-card', 'screen-tip']) {
    const card = document.getElementById(id);
    if (!card || card.hidden || !card.offsetHeight) continue;
    const top = window.innerHeight - card.getBoundingClientRect().top;
    bottom = Math.max(bottom, top + 10);
  }
  if (stack.style.right !== `${right}px`) stack.style.right = `${right}px`;
  if (stack.style.bottom !== `${bottom}px`) stack.style.bottom = `${bottom}px`;
}
if (typeof window !== 'undefined') window.addEventListener('resize', () => placeCorner());

/** Whether any of an element's picture is in sight: in the window and in each scrolling box around it. */
export function inSight(el) {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return false;
  let top = Math.max(0, r.top);
  let bottom = Math.min(window.innerHeight, r.bottom);
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'visible') continue;
    const b = p.getBoundingClientRect();
    top = Math.max(top, b.top);
    bottom = Math.min(bottom, b.bottom);
  }
  return bottom - top > 8;
}

/** A widget brought into view and lit for a moment, the way a found word is. */
export function showWidget(fig) {
  fig.scrollIntoView({ block: 'center', behavior: 'smooth' });
  fig.classList.remove('wg-flash');
  void fig.offsetWidth;
  fig.classList.add('wg-flash');
  setTimeout(() => fig.classList.remove('wg-flash'), 1600);
}
