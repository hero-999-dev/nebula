/** Proportional resize with the opposite corner held in place. */
export function resizeImageBox(box, dx, dy, corner = 'se', inText = false) {
  const west = corner.includes('w'), north = corner.includes('n');
  const ratio = Number.isFinite(box.ratio) && box.ratio > 0 ? box.ratio : 1;
  const x = west ? -dx : dx, y = (north ? -dy : dy) * ratio;
  const delta = Math.abs(x) >= Math.abs(y) ? x : y;
  let width = Math.max(Math.min(100, 60 * ratio), box.width + delta);
  if (!inText) {
    if (west) width = Math.min(width, box.left + box.width);
    if (north) width = Math.min(width, (box.top + box.height) * ratio);
  }
  const height = width / ratio;
  return {
    width, height,
    left: !inText && west ? box.left + box.width - width : box.left,
    top: !inText && north ? box.top + box.height - height : box.top,
  };
}

/** Rebuild old notes' one-grip images too. Idempotent. SE stays first. */
export function ensureImageHandles(image) {
  const corners = ['se', 'nw', 'ne', 'sw'];
  const handles = [...image.querySelectorAll(':scope > .image-h')];
  if (handles.length === 4 && handles.every((h,i) => h.dataset.corner === corners[i])) return;
  handles.forEach(h => h.remove());
  for (const corner of corners) {
    const handle = image.ownerDocument.createElement('span');
    handle.className = 'image-h';
    handle.dataset.corner = corner;
    handle.title = 'Resize image';
    image.appendChild(handle);
  }
}
