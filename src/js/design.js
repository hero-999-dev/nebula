/**
 * Designs (1.0.4): the whole of Nebula in another style.
 *
 * The owner: "theme organizer üstünde design olsun — biri Nebula'nın kendisi,
 * biri medieval, bir de piksel, tüm arayüz ona göre değişsin, bir de neon
 * (cyberpunk). Pikselde dünyalar kare küpler olsun, cyber'de neon parlasın
 * dünyalar, medieval'da disk şeklinde olsun hepsi."
 *
 * A design is not a theme: a theme is the colours, a design is the faces, the
 * frames and the worlds of the Universe. It is one attribute on <html>
 * (`data-design`; none for Nebula's own), which css/designs.css reads, and
 * which the map asks for on every frame (galaxy-map.js). The themes go on
 * working under every design; only Main (and, in Medieval and Ink, Light) is
 * each design's own colours, and choosing a design puts Main on (main.js), so
 * that it is seen as it was made.
 *
 * Five more after the first build (the owner: "bu konuştuğumuz 5'ini de yap"):
 * Blueprint, Ink, Art Deco, Clockwork, Steampunk — wire globes, a brush's one
 * stroke, cut stones, fine wheels and heavy ones for their worlds.
 *
 * Then Clockwork and Steampunk became one (the owner: "clockwork ile steampunk
 * birleşsin, font steampunk'tan olsun, map de clockwork olsun, gerisi
 * clockwork"): eight designs, and a choice kept as Steampunk is worn as
 * Clockwork.
 */

import { emit } from './bus.js';

const KEY = 'nebula:design';
export const DESIGNS = ['nebula', 'medieval', 'pixel', 'neon', 'blueprint', 'ink', 'deco', 'clockwork'];
const DEFAULT = 'nebula';
/** A design that is no more, and the one it became. */
const FORMER = { steampunk: 'clockwork' };

/** Each design's name as its button says it (settings-panel.js): English, i18n has the other languages. */
export const DESIGN_NAMES = {
  nebula: 'Nebula', medieval: 'Medieval', pixel: 'Pixel', neon: 'Neon', blueprint: 'Blueprint', ink: 'Ink', deco: 'Art Deco', clockwork: 'Clockwork',
};

/**
 * The face a design writes in, by its name in the Font menu (toolbar.js
 * FONTS). One each, for its words and its heads alike (the owner's picks,
 * 1.0.4); Nebula's is the app's own Serif. The owner: "design fontları en
 * üstte olsun ve design adı o fontun yanında parantez içinde olsun", then
 * "designdekiler pinlensin en üstte" — the font lists begin with these, each
 * with its design's name after it, and nothing stands over them.
 */
export const DESIGN_FACES = {
  nebula: ['Serif'],
  medieval: ['Fondamento'],
  pixel: ['VT323'],
  neon: ['Oxanium'],
  blueprint: ['Patrick Hand'],
  ink: ['Courgette'],
  deco: ['Marcellus'],
  clockwork: ['Bodoni Moda'],
};

/** Nebula's own stack (tokens.css `--serif`): every design's face stands in front of it (designs.css). */
const OWN_STACK = '"Charter", "Iowan Old Style", "Palatino Linotype", "TeX Gyre Pagella", "URW Palladio L", "P052", Georgia, serif';

/** The font-family a design writes in, as its `--serif` has it. */
export const designStack = (id) => {
  const face = DESIGN_FACES[id]?.[0];
  return !face || face === DESIGN_FACES[DEFAULT][0] ? OWN_STACK : `"${face}", ${OWN_STACK}`;
};

/** Every design's faces in the designs' order, lower case: a face's place in the font lists. */
const FACE_ORDER = DESIGNS.flatMap((id) => (DESIGN_FACES[id] ?? []).map((face) => face.toLowerCase()));

/** Where a face stands among the designs' faces, or -1 for a font that is no design's. */
export const designFacePlace = (font) => FACE_ORDER.indexOf(String(font ?? '').toLowerCase());

/** The name of the design that writes in that face, or '' — whatever the case of the font's name. */
export function designOfFace(font) {
  const want = String(font ?? '').toLowerCase();
  if (!want) return '';
  const id = DESIGNS.find((d) => (DESIGN_FACES[d] ?? []).some((face) => face.toLowerCase() === want));
  return id ? DESIGN_NAMES[id] : '';
}

/** A design's name as it is kept: one of DESIGNS, what a former one became, Nebula's own for anything else. */
export const cleanDesign = (value) => {
  if (DESIGNS.includes(value)) return value;
  return typeof value === 'string' && Object.hasOwn(FORMER, value) ? FORMER[value] : DEFAULT;
};

function read() {
  try {
    return cleanDesign(localStorage.getItem(KEY));
  } catch {
    return DEFAULT;
  }
}

function wear(design) {
  const root = document.documentElement;
  if (design === DEFAULT) delete root.dataset.design;
  else root.dataset.design = design;
}

/** The remembered design, worn now — before the app has started, as the theme is. */
export function wearStoredDesign() {
  wear(read());
}

/** The design worn now, as the page says it. */
export function currentDesign() {
  return typeof document === 'undefined' ? DEFAULT : cleanDesign(document.documentElement.dataset.design);
}

/**
 * @param {HTMLElement|null} group container holding one [data-design] button per design
 */
export function initDesign(group) {
  const buttons = group ? [...group.querySelectorAll('[data-design]')] : [];
  let current = read();

  function paint() {
    for (const btn of buttons) {
      const on = btn.dataset.design === current;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  function apply(design) {
    current = cleanDesign(design);
    wear(current);
    paint();
    // Main's colours are the design's own: main.js puts Main on, and whoever has
    // read a token repaints at its `theme-changed`.
    emit('design-changed', { design: current });
  }

  const set = (design) => {
    if (!DESIGNS.includes(design) || design === current) return;
    apply(design);
    try { localStorage.setItem(KEY, current); } catch { /* private mode: this session only */ }
  };

  wear(current);
  paint();
  for (const btn of buttons) btn.addEventListener('click', () => set(btn.dataset.design));

  return { current: () => current, set };
}
