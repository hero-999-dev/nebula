/**
 * A picture of the user's own behind the note (1.0.3).
 *
 * The owner's Ideas note: "arkaya custom foto - transparent". It is laid into
 * the page's ground under a veil of the theme's paper, so the words stay on the
 * theme's colours and Settings says how much of it shows. The picture is made
 * smaller here and kept by the main process (electron/backdrop.js); how much it
 * shows is a setting.
 *
 * It lies under the whole window, the note list too (the owner's Bug Find note:
 * "sol taraftan sag tarafa farkli renk oluyor"), each side under its own veil.
 * And it can be made of colours instead of a photo: a few colours and a style,
 * drawn here into a picture like any other.
 *
 * A style is not a photo (the owner's Bug Find note, 2026-11-04: "styles picture
 * olarak sayılıyor ve eskisini siliyor foto"): wearing one takes the photo off
 * and keeps it. Every photo chosen is kept, cut to the window's shape first
 * (logo-crop.js), and put on again from its little picture; Remove the picture
 * takes off what is worn, photo or style, and only a photo's × deletes it.
 */

import { emit, on } from './bus.js';
import { readSettings } from './settings.js';
import { cropBackdropPicture } from './logo-crop.js';

const MAX_SIDE = 2560;
/** High: the photo was most likely a JPEG already, and each saving loses some of it again. */
const QUALITY = 0.92;

let shown = false;
let picture = null;
/** The address of a mix drawn in this page, let go when another takes its place. */
let drawn = null;
/** The photo worn, as it was kept: what is softened again when the screen changes. */
let photo = null;
/** Its id among the photos kept, or null. */
let photoId = null;
/** Whether the picture is softened for the screen the window stands on, and that screen. */
let smooth = false;
let screenInfo = null;

/** The size a picture is kept at: its own, or its long side brought down to `max`. Pure — tested. */
export function fitSide(width, height, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(width, height, 1));
  return [Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k))];
}

function paint(address) {
  const app = document.getElementById('app');
  if (!app) return;
  if (drawn && drawn !== address) { URL.revokeObjectURL(drawn); drawn = null; }
  shown = !!address;
  picture = address || null;
  app.classList.toggle('has-backdrop', shown);
  if (shown) app.style.setProperty('--backdrop-image', `url("${address}")`);
  else app.style.removeProperty('--backdrop-image');
}

function paintStrength() {
  document.getElementById('app')?.style.setProperty('--backdrop', String(readSettings().backdrop));
}

export const hasBackdrop = () => shown;
export const backdropPicture = () => picture;

/** The id of the photo worn now, or null when none is (a style may be). */
export const wornPhotoId = () => (readMix().on ? null : photoId);

/**
 * Its colours, offered to the styles and the theme (1.0.3, the owner: "resim
 * seçme panelinden stillerin renklerini seçebilelim").
 */
function takeColors(image) {
  const small = document.createElement('canvas');
  [small.width, small.height] = [64, 36];
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(image, 0, 0, small.width, small.height);
  writePhotoColors(paletteOf(sctx.getImageData(0, 0, small.width, small.height).data));
}

/**
 * A file the user chose: cut to the window's shape, kept among the photos, and
 * put behind the note. True when worn, 'cancel' when the cut was cancelled,
 * 'full' when no more photos can be kept, false when it could not be read or kept.
 */
export async function chooseBackdrop(file) {
  const app = document.getElementById('app');
  const width = app?.clientWidth || window.innerWidth;
  const height = app?.clientHeight || window.innerHeight;
  try {
    const cut = await cropBackdropPicture(file, {
      aspect: width / Math.max(1, height),
      screenWidth: width * (window.devicePixelRatio || 1),
      maxSide: MAX_SIDE,
      quality: QUALITY,
    });
    if (cut === 'cancel') return 'cancel';
    if (!cut) return false;
    const res = await window.nebula?.backdrop?.add(cut.jpeg);
    if (res?.error === 'full') return 'full';
    if (!res?.ok || !await wearPhoto(res.id, cut.jpeg)) return false;
    takeColors(cut.image);
    return true;
  } catch {
    return false;
  }
}

/** The photos kept, the oldest first: [{ id, picture }]. */
export async function backdropPhotos() {
  const res = await window.nebula?.backdrop?.list?.()?.catch?.(() => null);
  return res?.ok ? res.photos : [];
}

/** A kept photo put behind the note; the style worn, if one is, is taken off. False when it could not be. */
export async function wearPhoto(id, picture = null) {
  const res = await window.nebula?.backdrop?.wear(id)?.catch?.(() => null);
  if (!res?.ok) return false;
  const address = picture ?? (await backdropPhotos()).find((p) => p.id === id)?.picture ?? null;
  if (!address) return false;
  writeMix({ ...readMix(), on: false });
  photoId = id;
  await show(address);
  if (!picture) {
    try {
      const image = new Image();
      image.src = address;
      await image.decode();
      takeColors(image);
    } catch { /* its colours stay as they were */ }
  }
  return true;
}

/** Deletes a kept photo for good; worn, it is taken off too. */
export async function deletePhoto(id) {
  const res = await window.nebula?.backdrop?.remove(id)?.catch?.(() => null);
  if (!res?.ok) return false;
  if (photoId === id) {
    photoId = null;
    if (!readMix().on) {
      photo = null;
      writePhotoColors([]);
      paint(null);
    }
  }
  return true;
}

/** Takes off what is behind the note, a photo or a style; the photos stay kept. */
export async function removeBackdrop() {
  await window.nebula?.backdrop?.wear(null)?.catch?.(() => {});
  writeMix({ ...readMix(), on: false });
  writePhotoColors([]);
  photo = null;
  photoId = null;
  paint(null);
}

// ---- the colours of the photo chosen -----------------------------------------

const PHOTO_COLORS_KEY = 'nebula:backdrop-photo-colors';

const hexOf = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * The few colours a picture is mostly made of, the most of it first: its
 * pixels (RGBA) put in coarse buckets, each bucket's mean, and colours too
 * close to one already taken left out. Pure — tested.
 */
export function paletteOf(pixels, most = 7) {
  const buckets = new Map();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const at = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    at.n += 1; at.r += r; at.g += g; at.b += b;
    buckets.set(key, at);
  }
  const out = [];
  for (const { n, r, g, b } of [...buckets.values()].sort((x, y) => y.n - x.n)) {
    const c = [r / n, g / n, b / n];
    if (out.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 48)) continue;
    out.push(c);
    if (out.length >= most) break;
  }
  return out.map((c) => hexOf(...c));
}

function writePhotoColors(list) {
  try {
    if (list.length) localStorage.setItem(PHOTO_COLORS_KEY, JSON.stringify(list));
    else localStorage.removeItem(PHOTO_COLORS_KEY);
  } catch { /* this session only */ }
}
/** The colours of the last photo worn: offered while it is worn (settings-panel.js), gone with Remove. */
export function photoColors() {
  try {
    const list = JSON.parse(localStorage.getItem(PHOTO_COLORS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) : [];
  } catch { return []; }
}

// ---- a picture made of colours ------------------------------------------------

/** The styles colours can be laid out in, each drawn by `drawMix`. */
export const MIX_STYLES = [
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'across', label: 'Across' },
  { id: 'glow', label: 'Glow' },
  { id: 'swirl', label: 'Swirl' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'clouds', label: 'Clouds' },
  { id: 'waves', label: 'Waves' },
  // Four more (1.0.3, the owner: "4 tane daha stil ekle").
  { id: 'aurora', label: 'Aurora' },
  { id: 'rings', label: 'Rings' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'facets', label: 'Facets' },
  // Three more (1.0.3, the owner: "3 tane daha styles eklensin").
  { id: 'horizon', label: 'Horizon' },
  { id: 'dunes', label: 'Dunes' },
  { id: 'bubbles', label: 'Bubbles' },
];
export const MIX_MIN = 2;
export const MIX_MAX = 5;
const MIX_KEY = 'nebula:backdrop-mix';
const MIX_SIZE = [1920, 1080];
export const DEFAULT_MIX = { style: 'diagonal', colors: ['#ff7e5f', '#7b6cf6', '#2bc0b4'], on: false };

/** A mix as it may be kept: a known style, two to five #rrggbb colours. Pure — tested. */
export function cleanMix(raw) {
  const style = MIX_STYLES.some((x) => x.id === raw?.style) ? raw.style : DEFAULT_MIX.style;
  let colors = Array.isArray(raw?.colors)
    ? raw.colors.filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).map((c) => c.toLowerCase())
    : [];
  colors = colors.slice(0, MIX_MAX);
  if (colors.length < MIX_MIN) colors = [...DEFAULT_MIX.colors];
  return { style, colors, on: raw?.on === true };
}
export function readMix() {
  try { return cleanMix(JSON.parse(localStorage.getItem(MIX_KEY) || 'null')); } catch { return cleanMix(null); }
}
function writeMix(mix) {
  try { localStorage.setItem(MIX_KEY, JSON.stringify(cleanMix(mix))); } catch { /* this session only */ }
}
/** Keeps colours and a style for the maker without wearing them. */
export const keepMix = (raw) => writeMix({ ...readMix(), ...raw });

/** Where each colour stands along a gradient: evenly, the first at 0, the last at 1. Pure — tested. */
export function stopsOf(colors) {
  const n = colors.length;
  return colors.map((c, i) => [n === 1 ? 0 : i / (n - 1), c]);
}

/** The colour at `t` (0–1) along the colours, as `stopsOf` spreads them. Pure — tested. */
export function colorAt(colors, t) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const x = Math.min(1, Math.max(0, t)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(x));
  if (colors.length < 2) return colors[0];
  const [a, b] = [rgb(colors[i]), rgb(colors[i + 1])];
  const f = x - i;
  return hexOf(...a.map((v, j) => v + (b[j] - v) * f));
}

/** A number of 0–1 that is always the same for the same two: where the facets' corners lean. */
const jitter = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/*
 * No grain is laid over the pictures any more (the owner's Bug Find note,
 * 2026-11-04: "bu pikselleşme stilleri eklemeden önce yoktu … ne zaman stilleri
 * ekledik arka plan resimlerinde de pikselleşme olmaya başladı"). The grain, and
 * the specks over the veils, had been put in to hide the steps of a smooth
 * gradient; on the external screen they were the pixels themselves. A style is
 * drawn as PNG, never JPEG: a JPEG keeps colour at a quarter of the pixels, and
 * on a dark green ground those quarters showed as green blotches.
 */

/** Draws `colors` in `style` over a w × h canvas: the big picture and the little drawing on its button alike. */
export function drawMix(ctx, w, h, style, colors) {
  const k = w / MIX_SIZE[0];
  const gradient = (g, list = colors) => { for (const [at, c] of stopsOf(list)) g.addColorStop(at, c); return g; };
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, w, h);
  if (style === 'diagonal') {
    ctx.fillStyle = gradient(ctx.createLinearGradient(0, 0, w, h));
    ctx.fillRect(0, 0, w, h);
  } else if (style === 'across') {
    ctx.fillStyle = gradient(ctx.createLinearGradient(0, 0, w, 0));
    ctx.fillRect(0, 0, w, h);
  } else if (style === 'glow') {
    ctx.fillStyle = gradient(ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2));
    ctx.fillRect(0, 0, w, h);
  } else if (style === 'swirl') {
    ctx.fillStyle = gradient(ctx.createConicGradient(-Math.PI / 2, w / 2, h / 2), [...colors, colors[0]]);
    ctx.fillRect(0, 0, w, h);
  } else if (style === 'stripes') {
    const band = Math.max(4, 140 * k);
    const reach = Math.hypot(w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 4);
    for (let x = -reach, i = 0; x < reach; x += band, i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, -reach, band + 1, reach * 2);
    }
  } else if (style === 'blocks') {
    const col = w / colors.length;
    colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(Math.floor(i * col), 0, Math.ceil(col) + 1, h); });
  } else if (style === 'clouds') {
    // Soft blots of each colour over the first, always in the same places.
    const spots = [[0.2, 0.25], [0.8, 0.3], [0.35, 0.8], [0.75, 0.78], [0.5, 0.5]];
    ctx.filter = `blur(${Math.max(2, 60 * k)}px)`;
    colors.slice(1).forEach((c, i) => {
      const [x, y] = spots[i % spots.length];
      const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, Math.max(w, h) * 0.45);
      g.addColorStop(0, c);
      g.addColorStop(1, `${c}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  } else if (style === 'waves') {
    // Each colour below a wavy line lower than the last.
    const n = colors.length;
    colors.forEach((c, i) => {
      if (i === 0) return;
      const base = (i / n) * h;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += Math.max(1, w / 96)) ctx.lineTo(x, base + Math.sin((x / w) * Math.PI * 2 + i * 1.3) * h * 0.07);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
    });
  } else if (style === 'aurora') {
    // Curtains of light: each colour a soft wavy ribbon over the first, darker one.
    ctx.filter = `blur(${Math.max(3, 70 * k)}px)`;
    colors.slice(1).forEach((c, i, rest) => {
      const mid = h * (0.25 + (0.5 * (i + 0.5)) / rest.length);
      const thick = h * 0.16;
      ctx.beginPath();
      for (let x = 0; x <= w; x += Math.max(1, w / 64)) ctx.lineTo(x, mid - thick + Math.sin((x / w) * Math.PI * 3 + i * 2.1) * h * 0.12);
      for (let x = w; x >= 0; x -= Math.max(1, w / 64)) ctx.lineTo(x, mid + thick + Math.sin((x / w) * Math.PI * 2 + i * 1.7) * h * 0.08);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, mid - thick * 2, 0, mid + thick * 2);
      g.addColorStop(0, `${c}00`);
      g.addColorStop(0.5, c);
      g.addColorStop(1, `${c}00`);
      ctx.fillStyle = g;
      ctx.fill();
    });
  } else if (style === 'rings') {
    // Rings from the middle outward, each colour in turn.
    const band = Math.max(3, 110 * k);
    const reach = Math.hypot(w, h) / 2;
    for (let r = Math.ceil(reach / band) * band, i = Math.ceil(reach / band); r > 0; r -= band, i--) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
    }
  } else if (style === 'mesh') {
    // Each colour from a corner of its own (the last one from the middle), melting into the rest.
    const spots = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]];
    colors.forEach((c, i) => {
      const [x, y] = spots[i % spots.length];
      const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, Math.hypot(w, h) * (i === 4 ? 0.35 : 0.8));
      g.addColorStop(0, c);
      g.addColorStop(1, `${c}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  } else if (style === 'facets') {
    // Cut glass: triangles, each the colour of its place along the diagonal, a little off.
    const size = Math.max(6, 170 * k);
    const cols = Math.ceil(w / size) + 1;
    const rows = Math.ceil(h / size) + 1;
    const at = (cx, cy) => [cx * size + (jitter(cx, cy) - 0.5) * size * 0.7, cy * size + (jitter(cy, cx + 9) - 0.5) * size * 0.7];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const [a, b, c, d] = [at(cx, cy), at(cx + 1, cy), at(cx + 1, cy + 1), at(cx, cy + 1)];
        for (const [tri, lean] of [[[a, b, c], 0], [[a, c, d], 1]]) {
          const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
          const my = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
          const t = (mx / w + my / h) / 2 + (jitter(cx * 2 + lean, cy) - 0.5) * 0.18;
          ctx.beginPath();
          ctx.moveTo(...tri[0]);
          ctx.lineTo(...tri[1]);
          ctx.lineTo(...tri[2]);
          ctx.closePath();
          ctx.fillStyle = colorAt(colors, t);
          ctx.fill();
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  } else if (style === 'horizon') {
    // A sky of the colours down to the horizon, the last one a sun low on it, the ground the first.
    const line = h * 0.66;
    const sky = colors.length > 2 ? colors.slice(0, -1) : colors;
    ctx.fillStyle = gradient(ctx.createLinearGradient(0, 0, 0, line), sky);
    ctx.fillRect(0, 0, w, line);
    const sun = colors[colors.length - 1];
    const glow = ctx.createRadialGradient(w / 2, line, 0, w / 2, line, h * 0.55);
    glow.addColorStop(0, sun);
    glow.addColorStop(0.25, `${sun}cc`);
    glow.addColorStop(1, `${sun}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, line);
    const ground = ctx.createLinearGradient(0, line, 0, h);
    ground.addColorStop(0, colorAt(colors, 0.2));
    ground.addColorStop(1, colors[0]);
    ctx.fillStyle = ground;
    ctx.fillRect(0, line, w, h - line);
  } else if (style === 'dunes') {
    // Smooth hills one before the other, each a colour fading into the one before it.
    ctx.fillStyle = gradient(ctx.createLinearGradient(0, 0, 0, h), colors.slice(0, 2));
    ctx.fillRect(0, 0, w, h);
    const n = colors.length;
    for (let i = 1; i < n; i++) {
      const base = h * (0.3 + (0.55 * i) / n);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += Math.max(1, w / 96)) {
        ctx.lineTo(x, base + Math.sin((x / w) * Math.PI * 1.6 + i * 2.4) * h * 0.08 + Math.sin((x / w) * Math.PI * 4.2 + i) * h * 0.025);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, base - h * 0.1, 0, h);
      g.addColorStop(0, colors[i]);
      g.addColorStop(1, colors[i - 1]);
      ctx.fillStyle = g;
      ctx.fill();
    }
  } else if (style === 'bubbles') {
    // Soft see-through bubbles of every colour over the first two, always in the same places.
    ctx.fillStyle = gradient(ctx.createLinearGradient(0, 0, w, h), colors.slice(0, 2));
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      const [x, y] = [jitter(i, 1) * w, jitter(i, 2) * h];
      const r = h * (0.05 + 0.18 * jitter(i, 3));
      const c = colors[i % colors.length];
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, `${c}a6`);
      g.addColorStop(0.85, `${c}40`);
      g.addColorStop(1, `${c}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A mix drawn small, as an address: what the preview shows while a style is pointed at. */
export function mixPicture(raw, w = 480, h = 270) {
  const mix = cleanMix(raw);
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [w, h];
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawMix(ctx, w, h, mix.style, mix.colors);
  return canvas.toDataURL('image/png');
}

// ---- softened for the screen ---------------------------------------------------

/**
 * The owner's outside screen (2026-11-04: "harici ekranda yeşillenme oluyor")
 * showed the picture's smooth colours in steps and green specks where the
 * laptop's own did not. Nothing in the page can see what a screen does to it,
 * so Settings may say to soften it there: the picture is drawn at 1280 × 720
 * and a little blurred, and the browser spreads it over the window. No detail
 * is made up; there is less of it. No grain is added (see above).
 */
const SMOOTH_SIZE = [1280, 720];
const SMOOTH_BLUR = 2.4;

/** Whether to soften: Settings' on or off, else on a screen that is not the laptop's own. Pure — tested. */
export function smoothFor(setting, info) {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return info?.internal === false;
}
export const isSmooth = () => smooth;
/** The screen the window stands on, as the main process said: { internal, label } — or null. */
export const screenOf = () => screenInfo;

/** Draws a canvas again over itself, a little blurred. */
function soften(canvas, px) {
  const copy = document.createElement('canvas');
  [copy.width, copy.height] = [canvas.width, canvas.height];
  copy.getContext('2d').drawImage(canvas, 0, 0);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.save();
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(copy, 0, 0);
  ctx.restore();
}

const pngOf = async (canvas) => {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
};

/** A photo softened as the screen asks: the address of a PNG, or null. */
async function softPhoto(address) {
  const image = new Image();
  image.src = address;
  await image.decode();
  const [width, height] = fitSide(image.naturalWidth, image.naturalHeight, SMOOTH_SIZE[0]);
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [width, height];
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = `blur(${SMOOTH_BLUR / 2}px)`;
  ctx.drawImage(image, 0, 0, width, height);
  ctx.filter = 'none';
  return pngOf(canvas);
}

/** Puts a kept photo behind the window, softened when the screen asks for it. */
async function show(original) {
  photo = original;
  if (smooth) {
    try {
      const soft = await softPhoto(original);
      if (soft && photo === original) { paint(soft); drawn = soft; return; }
      if (soft) URL.revokeObjectURL(soft);
    } catch { /* the photo as it is */ }
    if (photo !== original) return;
  }
  paint(original);
}

/** The big picture of a mix, drawn here without loss — smaller and softened when the screen asks: the address of a PNG, or null. */
async function drawBig(mix) {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = smooth ? SMOOTH_SIZE : MIX_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  drawMix(ctx, canvas.width, canvas.height, mix.style, mix.colors);
  if (smooth) soften(canvas, SMOOTH_BLUR);
  return pngOf(canvas);
}

/**
 * Puts a mix behind the window. It is not kept as a file: its colours and style
 * are, and it is drawn again each time the app opens. The photo worn before it
 * is taken off and stays kept among the photos. False when it could not be drawn.
 */
export async function useMix(raw) {
  const mix = cleanMix(raw);
  try {
    const address = await drawBig(mix);
    if (!address) return false;
    await window.nebula?.backdrop?.wear(null)?.catch?.(() => {});
    photo = null;
    photoId = null;
    paint(address);
    drawn = address;
    writeMix({ ...mix, on: true });
    return true;
  } catch {
    return false;
  }
}

/** Softens or stops softening as the setting and the screen now say, and draws the picture again when that changed. */
function paintSmooth({ redraw = true } = {}) {
  const next = smoothFor(readSettings().smoothScreen, screenInfo);
  const app = document.getElementById('app');
  app?.classList.toggle('screen-smooth', next);
  if (next === smooth) return;
  smooth = next;
  emit('backdrop-smooth', { smooth, screen: screenInfo });
  if (!redraw || !shown) return;
  const mix = readMix();
  if (mix.on) {
    void drawBig(mix).then((address) => {
      if (address && smooth === next && readMix().on) { paint(address); drawn = address; } else if (address) URL.revokeObjectURL(address);
    }).catch(() => {});
  } else if (photo) void show(photo);
}

export function initBackdrop() {
  paintStrength();
  on('settings-changed', () => { paintStrength(); paintSmooth(); });
  window.nebula?.screen?.onChanged?.((info) => {
    if (!info?.ok) return;
    screenInfo = info;
    paintSmooth();
    emit('backdrop-smooth', { smooth, screen: screenInfo });
  });
  const asked = Promise.resolve(window.nebula?.screen?.get?.()).catch(() => null);
  void asked.then((info) => {
    if (info?.ok) screenInfo = info;
    paintSmooth({ redraw: false });
    emit('backdrop-smooth', { smooth, screen: screenInfo });
    const mix = readMix();
    if (mix.on) {
      void drawBig(mix).then((address) => { if (address && !shown) { paint(address); drawn = address; } }).catch(() => {});
      return;
    }
    void window.nebula?.backdrop?.get()?.then((res) => {
      if (res?.ok && res.picture && !shown) { photoId = res.id ?? null; void show(res.picture); }
    })?.catch?.(() => {});
  });
}
