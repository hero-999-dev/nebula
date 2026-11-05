/**
 * Cutting a picture to the logo's tile, or to the window's shape (1.0.3).
 *
 * The owner's Ideas note: "logoyu bir resim ile degistirme, kullanici bir resim
 * secsin, nebula logosuna uygun sekilde nebula icinde kirpabilsin". The picture
 * is pulled and zoomed under the tile, drawn with the rounded corners the logo
 * itself has (logo.js `logoSvg`), and comes out as a PNG of each size an icon holds.
 *
 * The picture behind the note is cut the same way (the owner's Bug Find note,
 * 2026-11-04: "logoda ve background resmi seçerken ayarlama menüsü olsun,
 * kullanıcı kırpabilsin istediği şekilde resmi, nebula formatına uygun"): to a
 * frame of the window's own shape, kept at the size the cut part has in the
 * picture — never drawn bigger than it is, so a small cut says it will be
 * stretched.
 */

import { LOGO_SIZES } from './logo.js';
import { t } from './i18n.js';

/** The working square, in the units of the logo's drawing. */
export const CROP_SIDE = 256;
const INSET = 256 * 0.005;
const RADIUS = 48;
const MAX_ZOOM = 6;
/** The backdrop's frame is this wide, in the same units; its height follows the window. */
const FRAME_W = 480;

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The smallest scale at which the picture still covers the frame (a square when `fh` is left out). Pure — tested. */
export const coverScale = (width, height, side = CROP_SIDE, fh = side) => Math.max(side / Math.max(1, width), fh / Math.max(1, height));

/** A view of the picture with no empty part of the frame showing. Pure — tested. */
export function clampView(view, width, height, side = CROP_SIDE, fh = side) {
  const least = coverScale(width, height, side, fh);
  const scale = Math.min(least * MAX_ZOOM, Math.max(least, view.scale));
  return {
    scale,
    x: Math.min(0, Math.max(side - width * scale, view.x)),
    y: Math.min(0, Math.max(fh - height * scale, view.y)),
  };
}

/** The picture centred and just covering the frame. Pure — tested. */
export function startView(width, height, side = CROP_SIDE, fh = side) {
  const scale = coverScale(width, height, side, fh);
  return { scale, x: (side - width * scale) / 2, y: (fh - height * scale) / 2 };
}

/** The part of the picture a view shows, in the picture's own pixels. Pure — tested. */
export function cutOf(view, fw, fh) {
  return { x: -view.x / view.scale, y: -view.y / view.scale, width: fw / view.scale, height: fh / view.scale };
}

function tilePath(ctx) {
  ctx.beginPath();
  ctx.roundRect(INSET, INSET, CROP_SIDE - INSET * 2, CROP_SIDE - INSET * 2, RADIUS);
}

/** The cut picture, one PNG for each size an icon holds: size → data address. */
export function cropPictures(image, view) {
  const out = {};
  for (const size of LOGO_SIZES) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(size / CROP_SIDE, size / CROP_SIDE);
    tilePath(ctx);
    ctx.clip();
    ctx.drawImage(image, view.x, view.y, image.naturalWidth * view.scale, image.naturalHeight * view.scale);
    out[size] = canvas.toDataURL('image/png');
  }
  return out;
}

/**
 * The cutting window over a picture already read.
 * @param {HTMLImageElement} image
 * @param {{ fw: number, fh: number, veil: (ctx: CanvasRenderingContext2D) => void, hint: string,
 *   cls: string, note?: (view: object) => string }} frame the frame, what veils outside it, the words under it
 * @returns {Promise<object|null>} the view chosen; null when cancelled
 */
function cutWindow(image, { fw, fh, veil, hint, cls, note }) {
  const { naturalWidth: w, naturalHeight: h } = image;
  const least = coverScale(w, h, fw, fh);
  let view = startView(w, h, fw, fh);

  const overlay = el('div', 'overlay logo-crop-ov');
  const modal = el('div', `modal logo-crop ${cls}`);
  const canvas = el('canvas', 'logo-crop__stage');
  canvas.width = fw * 2;
  canvas.height = fh * 2;
  canvas.style.aspectRatio = `${fw} / ${fh}`;
  const zoomLine = el('label', 'logo-crop__zoom');
  const zoom = el('input');
  zoom.type = 'range';
  zoom.min = '1';
  zoom.max = String(MAX_ZOOM);
  zoom.step = '0.01';
  zoom.value = '1';
  zoomLine.append(el('span', '', 'Zoom'), zoom);
  const hintLine = el('p', 'set-hint', hint);
  const noteLine = el('p', 'set-hint logo-crop__note');
  noteLine.dataset.noI18n = '';
  const actions = el('div', 'logo-crop__actions');
  const cancel = el('button', 'btn', 'Cancel');
  const use = el('button', 'btn primary', 'Use this picture');
  cancel.type = 'button';
  use.type = 'button';
  use.id = 'logo-crop-use';
  actions.append(cancel, use);
  modal.append(canvas, zoomLine, hintLine, noteLine, actions);
  overlay.append(modal);

  const ctx = canvas.getContext('2d');
  function draw() {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, fw, fh);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, view.x, view.y, w * view.scale, h * view.scale);
    veil(ctx);
    const said = note?.(view) ?? '';
    noteLine.textContent = said;
    noteLine.hidden = !said;
  }

  /** A new scale, holding still the point of the picture at (cx, cy) of the frame. */
  function zoomTo(scale, cx = fw / 2, cy = fh / 2) {
    const next = clampView({ scale, x: 0, y: 0 }, w, h, fw, fh).scale;
    const k = next / view.scale;
    view = clampView({ scale: next, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k }, w, h, fw, fh);
    zoom.value = String(view.scale / least);
    draw();
  }
  zoom.addEventListener('input', () => zoomTo(least * Number(zoom.value)));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomTo(view.scale * Math.exp(-e.deltaY / 500), ((e.clientX - r.left) / r.width) * fw, ((e.clientY - r.top) / r.height) * fh);
  }, { passive: false });
  let pull = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pull = { x: e.clientX, y: e.clientY, from: view };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pull) return;
    const k = fw / canvas.getBoundingClientRect().width;
    view = clampView({ ...pull.from, x: pull.from.x + (e.clientX - pull.x) * k, y: pull.from.y + (e.clientY - pull.y) * k }, w, h, fw, fh);
    draw();
  });
  canvas.addEventListener('pointerup', () => { pull = null; });
  canvas.addEventListener('pointercancel', () => { pull = null; });

  return new Promise((resolve) => {
    const done = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    // Settings stands under this window: Escape shuts this one alone.
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      done(null);
    }
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => done(null));
    use.addEventListener('click', () => done(view));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(null); });
    document.body.append(overlay);
    draw();
  });
}

/** A file read as a picture, with its address to let go; null when it cannot be read. */
async function readImage(file) {
  const address = URL.createObjectURL(file);
  const image = new Image();
  image.src = address;
  try {
    await image.decode();
    return { image, address };
  } catch {
    URL.revokeObjectURL(address);
    return null;
  }
}

/**
 * The cutting window, for a file the user chose.
 * @param {File} file
 * @returns {Promise<Record<string, string>|null>} the pictures; null when cancelled or unreadable
 */
export async function cropLogoPicture(file) {
  const read = await readImage(file);
  if (!read) return null;
  try {
    const view = await cutWindow(read.image, {
      fw: CROP_SIDE,
      fh: CROP_SIDE,
      cls: 'logo-crop--tile',
      hint: 'Pull the picture to place it in the logo’s tile.',
      // Outside the tile's corners the logo has nothing: it is veiled here.
      veil: (ctx) => {
        ctx.fillStyle = 'rgba(0, 0, 0, .6)';
        tilePath(ctx);
        ctx.rect(CROP_SIDE, 0, -CROP_SIDE, CROP_SIDE);
        ctx.fill('evenodd');
      },
    });
    return view ? cropPictures(read.image, view) : null;
  } finally {
    URL.revokeObjectURL(read.address);
  }
}

/** How many times a cut `width` px wide is spread over a window `screenWidth` px wide, when more than 1.25. Pure — tested. */
export function stretchOf(width, screenWidth) {
  const k = screenWidth / Math.max(1, width);
  return k > 1.25 ? Math.round(k * 10) / 10 : 0;
}

/**
 * The cutting window for the picture behind the note: a frame of the window's
 * shape. The cut comes out as a JPEG of the size it has in the picture, its
 * long side no more than `maxSide`.
 * @param {File} file
 * @param {{ aspect: number, screenWidth: number, maxSide: number, quality: number }} shape
 * @returns {Promise<{ jpeg: string, image: HTMLImageElement }|'cancel'|null>} null when unreadable
 */
export async function cropBackdropPicture(file, { aspect, screenWidth, maxSide, quality }) {
  const read = await readImage(file);
  if (!read) return null;
  try {
    const fw = FRAME_W;
    const fh = Math.round(FRAME_W / Math.min(4, Math.max(0.25, aspect || 16 / 9)));
    const view = await cutWindow(read.image, {
      fw,
      fh,
      cls: 'logo-crop--window',
      hint: 'Pull the picture and zoom to choose the part that lies behind your notes. The frame has the shape of this window.',
      veil: () => {},
      note: (v) => {
        const cut = cutOf(v, fw, fh);
        const k = stretchOf(cut.width, screenWidth);
        return k ? t('This part is {w} × {h} pixels: on this window it is stretched {k} times and looks soft.')
          .replace('{w}', String(Math.round(cut.width))).replace('{h}', String(Math.round(cut.height))).replace('{k}', String(k)) : '';
      },
    });
    if (!view) return 'cancel';
    const cut = cutOf(view, fw, fh);
    const k = Math.min(1, maxSide / Math.max(cut.width, cut.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cut.width * k));
    canvas.height = Math.max(1, Math.round(cut.height * k));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(read.image, cut.x, cut.y, cut.width, cut.height, 0, 0, canvas.width, canvas.height);
    return { jpeg: canvas.toDataURL('image/jpeg', quality), image: read.image };
  } finally {
    URL.revokeObjectURL(read.address);
  }
}
