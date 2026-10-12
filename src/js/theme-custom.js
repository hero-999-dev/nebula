/**
 * A theme of one's own (0.9.4).
 *
 * The owner, after Matcha had been a fifth fixed theme for a day: "take Matcha
 * out of the row; at the far right a button like the folder one, and on a
 * press a profile editor opens upward, over Archive and Trash — the ground,
 * the sidebar and darkest tone, the lines, the accent and the words can be
 * set, the app changing as I do; a profile can be named and saved, and Matcha
 * is there as a ready one." The editor is drawn by theme-editor.js after the
 * custom theme screen of the Pixel Pomo app (base theme, slots, the long bar
 * of the chosen colour, ready swatches, save). This file is what it rests on:
 * the five picks, the tokens made from them, and the saved profiles. Pure —
 * tested.
 *
 * Five colours are picked; everything else the stylesheet asks for is made
 * from them, so no pick can leave a control without a colour:
 *
 *   bg      --paper            the ground of the window and the page
 *   dark    --paper-sunken     the sidebar, the title strip, the darkest tone
 *   lines   --rule             borders and dividers
 *   accent  --clay             the lit button, links, the caret of a choice
 *   text    --ink              the words
 */

/** The slots, in the order the editor shows them. */
export const SLOTS = ['bg', 'dark', 'lines', 'accent', 'text'];

/**
 * Matcha: the Pixel Pomo Art Kit's own palette (ArtKit/art_kit/theme.py — BG,
 * CANVAS_BG, PANEL_HI, ACCENT) with the words lifted to near-white, as the
 * owner asked: "like the Main theme, dark green and a white font". The ready
 * profile, and what a new profile starts from.
 */
export const MATCHA = Object.freeze({
  name: 'Matcha',
  colors: Object.freeze({ bg: '#1A2420', dark: '#141C18', lines: '#35483C', accent: '#A6E3A1', text: '#F1F6EE' }),
});

/**
 * Contrast: near-black on near-white, the lines and the lit buttons as dark as
 * the words. The owner made it as a profile of their own, "Black & White
 * Contrast", and then: "call it Contrast; those two — it and Matcha — are the
 * ready profiles of Your own theme, and whoever wants to may delete them."
 */
export const CONTRAST = Object.freeze({
  name: 'Contrast',
  colors: Object.freeze({ bg: '#F7F7F7', dark: '#F7F7F7', lines: '#2B2B2B', accent: '#2B2B2B', text: '#2B2B2B' }),
});

/**
 * The profiles the app comes with. They can be deleted like any other (0.9.4;
 * the names of the deleted ones are kept by the editor, which can bring them
 * back) but not written over: a ready profile that is there keeps its name.
 */
export const READY_PROFILES = [MATCHA, CONTRAST];

/** The ready profiles that have not been deleted. @param {string[]} [removed] names */
export function readyProfiles(removed = []) {
  const gone = new Set((Array.isArray(removed) ? removed : []).map((name) => String(name).toLowerCase()));
  return READY_PROFILES.filter((p) => !gone.has(p.name.toLowerCase()));
}

/** A name a ready profile was saved under before it was one: such a saved copy IS the ready profile now. */
const FORMER_NAMES = { 'black & white contrast': 'Contrast' };

/**
 * Ready colours for the editor's grid: a grey ramp and the hue families in
 * dark, mid and light — the Pixel Pomo editor's palette, so a theme made here
 * and one made there can share their colours.
 */
export const SWATCHES = [
  '#0B0B0B', '#2B2B2B', '#565656', '#8E8E8E', '#CFCFCF', '#F7F7F7', '#E06AA5',
  '#7A1F2B', '#E5484D', '#F7A8AC', '#7A4212', '#E8801E', '#F5C48A', '#6E5A10',
  '#E8C547', '#F6E9A8', '#1E4D33', '#46A03C', '#A6E3A1', '#14504B', '#1E9E92',
  '#9BE0D8', '#1B3A63', '#58A6FF', '#BBD9FF', '#422A63', '#9D7CD8', '#D9C7F5',
];

/** "#rrggbb" from anything that names six hex digits ("a6e3a1", "#A6E3A1", "rgb(…)"); null otherwise. */
export function cleanHex(raw) {
  const s = String(raw ?? '').trim();
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(s);
  if (rgb) return `#${[1, 2, 3].map((i) => Math.min(255, Number(rgb[i])).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  const hex = /^#?([0-9a-f]{6})$/i.exec(s);
  if (hex) return `#${hex[1].toUpperCase()}`;
  const short = /^#?([0-9a-f]{3})$/i.exec(s);
  return short ? `#${[...short[1]].map((c) => c + c).join('').toUpperCase()}` : null;
}

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** `a` moved `t` of the way to `b` (0 = a, 1 = b). */
export function mix(a, b, t) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return hexOf(x.map((v, i) => v + (y[i] - v) * t));
}

/** Relative luminance, 0 (black) to 1 (white) — WCAG's. */
export function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast of two colours, 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Whether a ground is a light one — which note colours and control tones go with it. */
export const toneOf = (colors) => (luminance(colors.bg) > 0.32 ? 'light' : 'dark');

/**
 * Five valid colours whatever came in: a missing or broken pick takes
 * `fallback`'s (Matcha's), so a damaged setting never leaves the app unstyled.
 */
export function cleanColors(raw, fallback = MATCHA.colors) {
  const out = {};
  for (const slot of SLOTS) out[slot] = cleanHex(raw?.[slot]) ?? fallback[slot];
  return out;
}

/** A profile name as it is kept: one line, trimmed, not endless. */
export const cleanProfileName = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);

/**
 * Every token the stylesheet reads, from the five picks.
 * @param {{bg: string, dark: string, lines: string, accent: string, text: string}} picked
 * @returns {Record<string, string>} CSS custom properties, and `color-scheme`
 */
export function deriveTokens(picked) {
  const c = cleanColors(picked);
  const light = toneOf(c) === 'light';
  // What is written ON the accent: whichever of the theme's own tones, white
  // or near-black reads best there — a pale accent takes dark words.
  const onClay = [c.dark, c.bg, c.text, '#FFFFFF', '#141414']
    .map((tone) => [tone, contrast(tone, c.accent)])
    .sort((a, b) => b[1] - a[1])[0][0];
  const shade = rgbOf(mix(c.dark, '#000000', light ? 0 : 0.5));
  return {
    '--paper': c.bg,
    // Raised surfaces stand a little off the ground: toward white on a light
    // one, toward the words on a dark one.
    '--paper-raised': light ? mix(c.bg, '#FFFFFF', 0.6) : mix(c.bg, c.text, 0.05),
    '--paper-sunken': c.dark,
    '--ink': c.text,
    '--ink-soft': mix(c.text, c.bg, 0.22),
    '--ink-faint': mix(c.text, c.bg, 0.48),
    '--rule': c.lines,
    '--clay': c.accent,
    '--clay-soft': mix(c.bg, c.accent, 0.3),
    '--on-clay': onClay,
    '--shadow': light ? `rgba(${rgbOf(c.text).join(', ')}, 0.14)` : `rgba(${shade.join(', ')}, 0.55)`,
    'color-scheme': light ? 'light' : 'dark',
  };
}

/** What the editor warns about: words that cannot be read on their ground. */
export function hardToRead(picked) {
  const c = cleanColors(picked);
  return contrast(c.text, c.bg) < 4.5;
}

const same = (a, b) => SLOTS.every((slot) => a?.[slot] === b?.[slot]);

/**
 * Saved profiles as they may be kept: named, five colours each, each name
 * once, not the ready ones' (`ready`: the ready profiles that are there).
 * A saved copy of a ready profile under the name it had before (the owner's
 * "Black & White Contrast") is that ready profile, and is not kept twice.
 */
export function cleanProfiles(raw, ready = READY_PROFILES) {
  const out = [];
  const seen = new Set(ready.map((p) => p.name.toLowerCase()));
  for (const entry of Array.isArray(raw) ? raw : []) {
    const name = cleanProfileName(entry?.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    const colors = cleanColors(entry.colors);
    const now = FORMER_NAMES[name.toLowerCase()];
    if (now && ready.some((p) => p.name === now && same(p.colors, colors))) continue;
    seen.add(name.toLowerCase());
    out.push({ name, colors });
  }
  return out.slice(0, 24);
}

/**
 * Save `colors` under `name`: a new profile, or the one of that name with new
 * colours. The name of a ready profile that is there cannot be taken.
 * @param {Array} [ready] the ready profiles that have not been deleted
 * @returns {{profiles: Array, error?: 'name'|'ready'}}
 */
export function saveProfile(profiles, name, colors, ready = READY_PROFILES) {
  const clean = cleanProfileName(name);
  const list = cleanProfiles(profiles, ready);
  if (!clean) return { profiles: list, error: 'name' };
  if (ready.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return { profiles: list, error: 'ready' };
  const entry = { name: clean, colors: cleanColors(colors) };
  const at = list.findIndex((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (at >= 0) list[at] = entry; else list.push(entry);
  return { profiles: cleanProfiles(list, ready) };
}

/** The profile these colours are, ready or saved — its name, or null. */
export function profileOf(colors, profiles = [], ready = READY_PROFILES) {
  const c = cleanColors(colors);
  return [...ready, ...profiles].find((p) => same(p.colors, c))?.name ?? null;
}
