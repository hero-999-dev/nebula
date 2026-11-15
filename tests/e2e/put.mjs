/**
 * A shape or an arrow from the editing bar, the way 1.0.4 puts one: the button
 * opens its kinds as tiles, the tile chosen follows the pointer, and a press in
 * the note says where it goes (src/js/place.js). Until 1.0.4 a click on the
 * kind put it at once, and every suite here did that click.
 *
 *   await putFromBar(win, 'shape', 'rect');
 *   await putFromBar(win, 'arrow', 'straight', { x: 600, y: 300 });
 *
 * With no place given it goes to the middle of the page, a little under its top.
 */
export async function putFromBar(win, what, kind, at = null) {
  const tile = `#${what}-menu [data-${what}-add="${kind}"]`;
  await win.evaluate((w) => {
    const button = document.querySelector(`#toolbar [data-act="${w}"]`);
    if (!button) throw new Error(`no ${w} button in the editing bar`);
    button.click();
  }, what);
  await win.waitForSelector(tile, { state: 'attached', timeout: 3000 });
  await win.evaluate((sel) => document.querySelector(sel).click(), tile);
  const spot = at ?? await win.evaluate(() => {
    const r = document.getElementById('editor').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(160, r.height / 2)) };
  });
  await win.mouse.move(spot.x, spot.y);
  await win.mouse.click(spot.x, spot.y);
  await win.waitForSelector(what === 'shape' ? '#editor .shape' : '#editor .note-arrow', { state: 'attached', timeout: 3000 });
}

/**
 * The guide comes with its sections folded (1.0.4). The suites that use it as
 * their page open every one first; a reader does it with the arrow before each
 * heading, here the mark that arrow sets is set.
 */
export const unfoldAll = (win) => win.evaluate(() => {
  document.querySelectorAll('#editor .blk-toggle:not([data-open="true"])').forEach((toggle) => { toggle.dataset.open = 'true'; });
});
