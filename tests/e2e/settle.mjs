/**
 * Waits that end on what the check needs, not on a number of milliseconds.
 *
 * A fixed `waitForTimeout(200)` is enough on an idle machine and too short
 * under `npm run push` (unit tests, a build, then six Electron launches): the
 * check then reads the page before the app has finished, and fails with
 * nothing wrong in the app. These poll with timers, never requestAnimationFrame,
 * which stops when the window is not being composited.
 */

/** Until `fn(arg)` is truthy in the page, at most `ms`. False if it never was: the check after it says so. */
export async function until(win, fn, arg, ms = 5000) {
  try {
    await win.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
    return true;
  } catch {
    return false;
  }
}

/** Until the element's box has stood still for three reads in a row (a scroll or a redraw in flight). */
export async function steady(win, selector, ms = 3000) {
  const end = Date.now() + ms;
  let last = null;
  let same = 0;
  while (same < 3 && Date.now() < end) {
    const box = await win.evaluate((sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : null;
    }, selector);
    same = box && box === last ? same + 1 : 0;
    last = box;
    await win.waitForTimeout(50);
  }
  return same >= 3;
}

/**
 * A drag from one element to another once both stand still. Playwright measures
 * the source, then presses: if the list is still scrolling in between, the press
 * lands on the row under it and the wrong item is dragged.
 */
export async function steadyDrag(win, from, to, options = {}) {
  await steady(win, from);
  await steady(win, to);
  await win.dragAndDrop(from, to, options);
}
