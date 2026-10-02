/**
 * Cropping a picture (0.9.3, the owner's Ideas note: "a crop mode for
 * pictures — paste a copied picture, press crop, and crop it").
 *
 * ✂ on the picture's bar puts a frame over it: drag its edges or corners (or
 * move it from inside), then Enter or ✓ crops, Esc or ✕ leaves it as it was.
 * The crop is real — the picture stored in the note becomes the cropped one,
 * drawn at its own resolution — and one Ctrl+Z brings the whole picture back.
 * The frame lives on the page, over the note, never inside it.
 */

import { t } from './i18n.js';

const MIN = 16;          // px on screen; a crop smaller than this is not a picture

/** The part of the natural picture a frame covers. Pure — tested. */
export function cropRect(frame, area, natural) {
  const fx = natural.width / frame.width;
  const fy = natural.height / frame.height;
  const sx = Math.max(0, Math.round(area.left * fx));
  const sy = Math.max(0, Math.round(area.top * fy));
  const sw = Math.max(1, Math.min(natural.width - sx, Math.round(area.width * fx)));
  const sh = Math.max(1, Math.min(natural.height - sy, Math.round(area.height * fy)));
  return { sx, sy, sw, sh };
}

/**
 * @param {HTMLElement} editor
 * @param {{history?: {push: () => void}, onDone?: (figure: HTMLElement) => void}} [opts]
 */
export function initImageCrop(editor, { history, onDone } = {}) {
  let active = null;     // { figure, img, box, area, frameRect }

  function end() {
    if (!active) return;
    active.box.remove();
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
    active = null;
  }

  function place() {
    if (!active) return;
    if (!active.img.isConnected) { end(); return; }
    const r = active.img.getBoundingClientRect();
    const scaleX = r.width / active.frameRect.width;
    const scaleY = r.height / active.frameRect.height;
    active.frameRect = { left: r.left, top: r.top, width: r.width, height: r.height };
    Object.assign(active.box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    if (Number.isFinite(scaleX) && Number.isFinite(scaleY) && (scaleX !== 1 || scaleY !== 1)) {
      const a = active.area;
      Object.assign(a, { left: a.left * scaleX, top: a.top * scaleY, width: a.width * scaleX, height: a.height * scaleY });
    }
    paintArea();
  }

  function paintArea() {
    const a = active.area;
    Object.assign(active.box.querySelector('.crop-area').style, {
      left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
    });
  }

  async function apply() {
    if (!active) return;
    const { figure, img, area, frameRect } = active;
    const whole = area.left < 1 && area.top < 1
      && area.width > frameRect.width - 1 && area.height > frameRect.height - 1;
    if (whole) { end(); return; }
    try {
      if (!img.complete) await img.decode();
      const natural = { width: img.naturalWidth, height: img.naturalHeight };
      const { sx, sy, sw, sh } = cropRect(frameRect, area, natural);
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const jpeg = /^data:image\/jpe?g/i.test(img.getAttribute('src') || '');
      const src = jpeg ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
      history?.push();
      // The picture keeps its scale on the page: it loses what was cut, and a
      // floating one keeps the part that stayed where it was.
      const shownWidth = parseFloat(figure.style.width) || frameRect.width;
      const k = shownWidth / frameRect.width;
      figure.style.width = `${Math.round(area.width * k)}px`;
      if (figure.style.height) figure.style.height = `${Math.round(area.height * k)}px`;
      if (figure.style.left) figure.style.left = `${Math.round((parseFloat(figure.style.left) || 0) + area.left * k)}px`;
      if (figure.style.top) figure.style.top = `${Math.round((parseFloat(figure.style.top) || 0) + area.top * k)}px`;
      figure.dataset.ratio = String(sw / sh);
      img.setAttribute('src', src);
      end();
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      onDone?.(figure);
    } catch {
      end();
      window.dispatchEvent(new CustomEvent('nebula-toast', { detail: 'The picture could not be copied' }));
    }
  }

  function start(figure) {
    end();
    const img = figure?.querySelector('img');
    if (!img) return;
    const r = img.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'crop-frame';
    // The dimming is the area's shadow, cut off just outside the picture.
    box.innerHTML = '<div class="crop-clip"><div class="crop-area">'
      + ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map((d) => `<span class="crop-h" data-edge="${d}"></span>`).join('')
      + '</div></div>'
      + '<div class="crop-bar"><span class="crop-hint"></span>'
      + '<button type="button" class="crop-ok" title="Crop">✓</button>'
      + '<button type="button" class="crop-cancel" title="Cancel">✕</button></div>';
    box.querySelector('.crop-hint').textContent = t('Drag the edges, then Enter to crop or Esc to cancel');
    document.body.append(box);
    active = { figure, img, box, frameRect: { left: r.left, top: r.top, width: r.width, height: r.height }, area: { left: 0, top: 0, width: r.width, height: r.height } };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);

    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target.closest('.crop-ok')) { void apply(); return; }
      if (e.target.closest('.crop-cancel')) { end(); return; }
      const edge = e.target.closest('.crop-h')?.dataset.edge ?? (e.target.closest('.crop-area') ? 'move' : null);
      if (!edge) return;
      const from = { x: e.clientX, y: e.clientY, ...active.area };
      const W = active.frameRect.width;
      const H = active.frameRect.height;
      const move = (ev) => {
        const dx = ev.clientX - from.x;
        const dy = ev.clientY - from.y;
        let { left, top, width, height } = from;
        if (edge === 'move') {
          left = Math.min(Math.max(0, left + dx), W - width);
          top = Math.min(Math.max(0, top + dy), H - height);
        } else {
          if (edge.includes('w')) { const l = Math.min(Math.max(0, left + dx), left + width - MIN); width += left - l; left = l; }
          if (edge.includes('e')) width = Math.min(Math.max(MIN, width + dx), W - left);
          if (edge.includes('n')) { const tp = Math.min(Math.max(0, top + dy), top + height - MIN); height += top - tp; top = tp; }
          if (edge.includes('s')) height = Math.min(Math.max(MIN, height + dy), H - top);
        }
        Object.assign(active.area, { left, top, width, height });
        paintArea();
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    box.addEventListener('dblclick', (e) => { e.preventDefault(); void apply(); });
  }

  document.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); void apply(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(); }
  }, true);
  // A note switched or the picture gone: the frame goes with it.
  document.addEventListener('mousedown', (e) => { if (active && !active.box.contains(e.target)) end(); }, true);

  return { start, cancel: end, active: () => !!active };
}
