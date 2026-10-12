/**
 * The line that says where a dragged thing will land (0.9.4).
 *
 * One mark for the whole app, drawn over the page while a picture or a divider
 * is being dragged: flat between two blocks, upright beside a picture or where
 * a divider will split the page. Nothing in the note changes until the button
 * is let go — the owner: "it should show how it will be dropped, and place it
 * if the user agrees".
 */

let mark = null;
let shade = null;

function make(cls) {
  const el = document.createElement('div');
  el.className = cls;
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  return el;
}

function put(el, box) {
  el.style.left = `${Math.round(box.left)}px`;
  el.style.top = `${Math.round(box.top)}px`;
  el.style.width = `${Math.max(1, Math.round(box.width))}px`;
  el.style.height = `${Math.max(1, Math.round(box.height))}px`;
  el.hidden = false;
}

/**
 * @param {{left: number, top: number, width: number, height: number}} line in the window
 * @param {{left: number, top: number, width: number, height: number}} [area] what it stands in, tinted
 */
export function showDropMark(line, area = null) {
  if (!mark?.isConnected) mark = make('drop-mark');
  put(mark, line);
  if (area) {
    if (!shade?.isConnected) shade = make('drop-shade');
    put(shade, area);
  } else if (shade) shade.hidden = true;
}

export function hideDropMark() {
  if (mark) mark.hidden = true;
  if (shade) shade.hidden = true;
}

export const dropMarkShown = () => !!mark && !mark.hidden;
