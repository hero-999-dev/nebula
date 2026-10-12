/**
 * Nebula's logo in colours of one's own (0.9.4).
 *
 * The owner: "in Settings, the logo at the bottom left, and at its right its
 * colours to change — the colours of Nebula's logo on the desktop. In the
 * style of Your own theme. We use the Main theme's logo now; the star, the
 * moon, the ground and the rest should be the user's to set, and a theme —
 * a ready one like Contrast, or one of their own — can be put on the logo."
 *
 * The logo is the app's icon (build/make-icon.ps1): a rounded tile with a
 * hairline edge, and on it the crescent — filled from a light end to a darker
 * one — with a four-point star in its mouth. Five colours are picked:
 *
 *   bg     the tile
 *   edge   the hairline round the tile
 *   moon   the crescent, at its light end
 *   shade  the crescent, at its dark end
 *   star   the star
 *
 * This file is what the editor (logo-editor.js) rests on: the picks, the
 * drawing — the same geometry as the icon that ships, so a logo nobody has
 * changed is the one on the desktop already — and what a theme's five colours
 * make of it. Pure — tested. What is done with the drawing (the window's icon,
 * the shortcuts) is the main process's (electron/app-logo.js).
 */

import { cleanHex, mix } from './theme-custom.js';

/** The slots, in the order the editor shows them. */
export const LOGO_SLOTS = ['bg', 'edge', 'moon', 'shade', 'star'];

/**
 * The logo that ships: violet for Nebula, iris for the test build
 * (make-icon.ps1's palettes — tile, edge, from, to; the star stands where the
 * crescent's gradient has run about three fifths of its way).
 */
export const OWN_LOGO = Object.freeze({
  main: Object.freeze({ bg: '#17122A', edge: '#2A2145', moon: '#C9B6FF', shade: '#7C3AED', star: '#996AF4' }),
  test: Object.freeze({ bg: '#14142E', edge: '#242551', moon: '#B3BEFF', shade: '#5B5BF0', star: '#7D81F6' }),
});

/** The sizes an icon is made in, largest first: what Windows draws a title bar, a taskbar and a desktop from. */
export const LOGO_SIZES = [256, 64, 48, 32, 24, 16];

/**
 * The four fixed themes' five colours — bg, dark, lines, accent, text — as
 * tokens.css has them (tests/logo.test.js holds the two together), so that a
 * fixed theme can be put on the logo as a profile can.
 */
export const FIXED_THEMES = Object.freeze({
  main: Object.freeze({ bg: '#17122A', dark: '#100C1E', lines: '#302842', accent: '#A78BFA', text: '#EDE7F7' }),
  dark: Object.freeze({ bg: '#17140F', dark: '#100E0A', lines: '#35301F', accent: '#E8A87C', text: '#EDE4D3' }),
  light: Object.freeze({ bg: '#F6F1E7', dark: '#EFE8D8', lines: '#DDD3BF', accent: '#C15F3C', text: '#201E1A' }),
  white: Object.freeze({ bg: '#FFFFFF', dark: '#F4F4F4', lines: '#D8D8D8', accent: '#6B5BD6', text: '#111111' }),
});

/** Five valid colours whatever came in: a missing or broken pick takes `fallback`'s. */
export function cleanLogo(raw, fallback = OWN_LOGO.main) {
  const out = {};
  for (const slot of LOGO_SLOTS) out[slot] = cleanHex(raw?.[slot]) ?? fallback[slot];
  return out;
}

export const sameLogo = (a, b) => LOGO_SLOTS.every((slot) => cleanHex(a?.[slot]) === cleanHex(b?.[slot]));

/**
 * A theme's five colours on the logo: the tile is the theme's darkest tone
 * (its sidebar), the edge its lines, the crescent runs from the accent lifted
 * a quarter toward the words down to the accent itself, and the star is the
 * colour of the words. Contrast — one dark tone on a light ground — comes out
 * as a plain dark crescent and star on a light tile.
 * @param {{bg: string, dark: string, lines: string, accent: string, text: string}} theme
 */
export function logoFromTheme(theme) {
  const dark = cleanHex(theme?.dark) ?? cleanHex(theme?.bg) ?? OWN_LOGO.main.bg;
  const accent = cleanHex(theme?.accent) ?? OWN_LOGO.main.shade;
  const text = cleanHex(theme?.text) ?? accent;
  return {
    bg: dark,
    edge: cleanHex(theme?.lines) ?? dark,
    moon: mix(accent, text, 0.25),
    shade: accent,
    star: text,
  };
}

/** The crescent and the star, in the 24-unit box every drawing of Nebula's mark uses (icons.js, make-icon.ps1). */
const CRESCENT = 'M15.82 4.4A9 9 0 1 0 15.82 19.6A7.6 7.6 0 0 1 15.82 4.4Z';
const STAR = 'M17.6 7.2l.85 1.55 1.55.85-1.55.85-.85 1.55-.85-1.55-1.55-.85 1.55-.85z';

/**
 * The logo as an SVG document, `size` pixels a side.
 *
 * As make-icon.ps1 draws it: the tile inset by half a percent with corners of
 * 18.75 %, its edge a hairline (left out under 32 px, where it would be the
 * whole tile); the mark — 18 units wide and tall, centred on (11, 12) — fitted
 * to 62 % of the tile, the crescent filled along its diagonal.
 */
export function logoSvg(colors, size = 256) {
  const c = cleanLogo(colors);
  const px = Math.max(8, Math.round(Number(size) || 256));
  const inset = 256 * 0.005;
  const side = 256 - inset * 2;
  const fit = (256 * 0.62) / 18;
  const edge = px >= 32 ? ` stroke="${c.edge}" stroke-width="${Math.max(256 / px, 2)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 256 256">`
    + `<defs><linearGradient id="m" gradientUnits="userSpaceOnUse" x1="2" y1="3" x2="20" y2="21"><stop offset="0" stop-color="${c.moon}"/><stop offset="1" stop-color="${c.shade}"/></linearGradient></defs>`
    + `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="48" fill="${c.bg}"${edge}/>`
    + `<g transform="translate(128 128) scale(${fit.toFixed(4)}) translate(-11 -12)"><path d="${CRESCENT}" fill="url(#m)"/><path d="${STAR}" fill="${c.star}"/></g>`
    + '</svg>';
}

/** The SVG as an address an <img> can show. */
export const logoDataUrl = (colors, size = 256) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(colors, size))}`;

/* ---- Logo themes (0.9.4) ----------------------------------------------------
 * The owner, on the first build of the logo's editor: "a + beside Contrast:
 * users can add themes that are for the logo alone, and name them; and a
 * change made to a ready one is kept as a new theme." A logo theme is a name
 * and the five colours; they are kept on this computer by the editor. */

/** A logo theme's name as it is kept: one line, trimmed, not endless. */
export const cleanLogoName = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);

const lower = (list) => new Set(list.map((name) => String(name).toLowerCase()));

/**
 * Logo themes as they may be kept: named, five colours each, each name once,
 * and none under a name the editor has already (`reserved`: the fixed themes,
 * the profiles).
 */
export function cleanLogoThemes(raw, reserved = []) {
  const out = [];
  const seen = lower(reserved);
  for (const entry of Array.isArray(raw) ? raw : []) {
    const name = cleanLogoName(entry?.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, colors: cleanLogo(entry.colors) });
  }
  return out.slice(0, 24);
}

/**
 * Keep `colors` under `name`: a new logo theme, or the one of that name with
 * new colours. A name the editor has already for something else cannot be taken.
 * @returns {{themes: Array, error?: 'name'|'taken'}}
 */
export function saveLogoTheme(themes, name, colors, reserved = []) {
  const clean = cleanLogoName(name);
  const list = cleanLogoThemes(themes, reserved);
  if (!clean) return { themes: list, error: 'name' };
  if (lower(reserved).has(clean.toLowerCase())) return { themes: list, error: 'taken' };
  const entry = { name: clean, colors: cleanLogo(colors) };
  const at = list.findIndex((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (at >= 0) list[at] = entry; else list.push(entry);
  return { themes: cleanLogoThemes(list, reserved) };
}

/**
 * Another name for a logo theme. The same name in other letters is a rename
 * too; a name some other theme has is refused.
 * @returns {{themes: Array, name?: string, error?: 'name'|'taken'|'missing'}}
 */
export function renameLogoTheme(themes, from, to, reserved = []) {
  const list = cleanLogoThemes(themes, reserved);
  const at = list.findIndex((t) => t.name.toLowerCase() === String(from ?? '').toLowerCase());
  if (at < 0) return { themes: list, error: 'missing' };
  const clean = cleanLogoName(to);
  if (!clean) return { themes: list, error: 'name' };
  const others = lower([...reserved, ...list.filter((_, i) => i !== at).map((t) => t.name)]);
  if (others.has(clean.toLowerCase())) return { themes: list, error: 'taken' };
  list[at] = { ...list[at], name: clean };
  return { themes: list, name: clean };
}

/**
 * The name a theme made from another takes by itself: "Contrast 2", and
 * "Contrast 3" where that is taken. A base that ends in such a number counts on
 * from it: a change to "Contrast 2" kept as new is "Contrast 3".
 */
export function nextLogoName(base, taken = []) {
  const have = lower(taken);
  const m = /^(.*?)\s+(\d+)$/.exec(cleanLogoName(base));
  const stem = cleanLogoName(m ? m[1] : base).slice(0, 28) || 'Logo';
  for (let n = m ? Number(m[2]) + 1 : 2; n < 1000; n += 1) {
    const name = `${stem} ${n}`;
    if (!have.has(name.toLowerCase())) return name;
  }
  return `${stem} ${Date.now()}`;
}
