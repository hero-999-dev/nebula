/**
 * Line icons — the "Welcome to Nebula" mockup style: 1.6px strokes, round
 * caps/joins, currentColor, no fills. Inline SVG so they theme themselves and
 * never need a network request.
 */

// stroke-width 1.75 in a 24-unit box drawn at 20px lands on ~1.46 device pixels.
// At the old 1.6-in-18px it was 1.2, which is what made the whole set look
// washed out — a stroke thinner than a pixel is antialiased into grey.
const S = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  undo: S('<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 0 14h-3"/>'),
  redo: S('<path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 0 0 0 14h3"/>'),

  bold: S('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
  // The Word / LibreOffice italic: serif bars offset from each other (top
  // right, bottom left) with a clearly slanted stem between them. The old one
  // put both bars over the same x range, which read as a lopsided H.
  italic: S('<path d="M10 5h8"/><path d="M6 19h8"/><path d="M15 5 9 19"/>'),
  underline: S('<path d="M7 4v6a5 5 0 0 0 10 0V4"/><path d="M5 20h14"/>'),
  strike: S('<path d="M5 12h14"/><path d="M8.5 8a3.5 3.5 0 0 1 3.5-3h1a3.5 3.5 0 0 1 3.5 3"/><path d="M8 16a3.5 3.5 0 0 0 3.5 3h1a3.5 3.5 0 0 0 3.5-3"/>'),

  // A with a thick underline bar = text color; the bar is painted by CSS
  textColor: S('<path d="M5 16 10 5l5 11"/><path d="M6.5 12.5h7"/>') ,
  hilite: S('<path d="M6 18h4"/><path d="M8 4h4a3 3 0 0 1 0 6H8z"/><path d="M8 10h5a3 3 0 0 1 0 6H8z" opacity=".55"/>'),
  pen: S('<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5 17.5 10.5"/>'),

  bullets: S('<circle cx="5" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1.3" fill="currentColor" stroke="none"/><path d="M10 7h10"/><path d="M10 12h10"/><path d="M10 17h10"/>'),
  // Two rows, not three: "1 2" is enough to say "numbered", and at 20px three
  // rows of 6px digits were 4.5 device pixels tall — a grey smudge.
  numbers: S(
    '<path d="M10 8h10"/><path d="M10 16h10"/>'
    + '<text x="2.6" y="11" font-size="8.5" font-weight="600" font-family="Inter, Segoe UI, sans-serif" fill="currentColor" stroke="none">1</text>'
    + '<text x="2.6" y="19" font-size="8.5" font-weight="600" font-family="Inter, Segoe UI, sans-serif" fill="currentColor" stroke="none">2</text>'),
  todo: S('<rect x="3.5" y="4.5" width="7" height="7" rx="1.6"/><path d="m5 8 1.6 1.6L9.2 6.6"/><path d="M14 8h7"/><path d="M3.5 16.5h7"/><path d="M14 16h7"/>'),

  indent: S('<path d="M10 7h11"/><path d="M10 12h11"/><path d="M10 17h11"/><path d="m3 9 3 3-3 3"/>'),
  outdent: S('<path d="M10 7h11"/><path d="M10 12h11"/><path d="M10 17h11"/><path d="m6 9-3 3 3 3"/>'),

  alignLeft: S('<path d="M4 6h16"/><path d="M4 10h10"/><path d="M4 14h16"/><path d="M4 18h10"/>'),
  alignCenter: S('<path d="M4 6h16"/><path d="M7 10h10"/><path d="M4 14h16"/><path d="M7 18h10"/>'),
  alignRight: S('<path d="M4 6h16"/><path d="M10 10h10"/><path d="M4 14h16"/><path d="M10 18h10"/>'),
  alignJustify: S('<path d="M4 6h16"/><path d="M4 10h16"/><path d="M4 14h16"/><path d="M4 18h16"/>'),

  image: S('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>'),
  table: S('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9.5h18"/><path d="M3 14.5h18"/><path d="M9 9.5v10"/><path d="M15 9.5v10"/>'),
  link: S('<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.4-1.4"/>'),
  code: S('<path d="m9 8-4 4 4 4"/><path d="m15 8 4 4-4 4"/>'),
  // Plainly √x: radical hook, rising stroke, vinculum, and an italic x sitting
  // under the bar where it belongs. The old one crossed two strokes under the
  // bar, which read as a multiplication sign rather than a variable, and put
  // a second horizontal at y=12 that looked like a strikethrough.
  equation: S(
    '<path d="M3 13.2h2.4l2.8 6.6L12.4 4.5H21"/>'
    + '<text x="14" y="17.4" font-size="9" font-style="italic" font-family="Charter, Georgia, serif" fill="currentColor" stroke="none">x</text>'),
  emoji: S('<circle cx="12" cy="12" r="8.5"/><path d="M8.8 14.5a4.2 4.2 0 0 0 6.4 0"/><circle cx="9.2" cy="9.8" r=".9" fill="currentColor" stroke="none"/><circle cx="14.8" cy="9.8" r=".9" fill="currentColor" stroke="none"/>'),
  clip: S('<path d="M19 11.5 12 18.5a4.5 4.5 0 0 1-6.4-6.4l7.6-7.6a3 3 0 0 1 4.3 4.3l-7.6 7.6a1.6 1.6 0 0 1-2.2-2.2l6.9-6.9"/>'),
  bookmark: S('<path d="M6 4.5h12v15l-6-4-6 4z"/>'),
  search: S('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
  spell: S('<path d="M3 16 7 6l4 10"/><path d="M4.4 13h5.2"/><path d="m13.5 15 2.5 2.5 5-5.5"/>'),
  preview: S('<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8z"/><path d="M14 3.5V10h5"/><circle cx="12" cy="14.5" r="2"/><path d="M8 14.5c1.4-2 6.6-2 8 0-1.4 2-6.6 2-8 0z"/>'),
  download: S('<path d="M12 4v10"/><path d="m7.5 10 4.5 4 4.5-4"/><path d="M4.5 19h15"/>'),
  print: S('<path d="M7 9V4.5h10V9"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v5.5H7z"/>'),
  cut: S('<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.3 15.7 19 4"/><path d="M15.7 15.7 5 4"/>'),
  copy: S('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5H6a1.5 1.5 0 0 0-1.5 1.5v9.5"/>'),
  paste: S('<path d="M9 4.5h6v2.5H9z"/><path d="M15 6h2.5A1.5 1.5 0 0 1 19 7.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V7.5A1.5 1.5 0 0 1 6.5 6H9"/><path d="M8.5 12h7"/><path d="M8.5 16h5"/>'),
  save: S('<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h9L20 8.5v10A1.5 1.5 0 0 1 18.5 20h-12A1.5 1.5 0 0 1 5 18.5z"/><path d="M8 4v5h7"/><rect x="8" y="13" width="8" height="7" rx="1"/>'),
  shapes: S('<path d="m6.5 3.5 3.5 6h-7z"/><rect x="3.5" y="13" width="7" height="7" rx="1.2"/><circle cx="17" cy="7" r="3.5"/><rect x="13.5" y="13" width="7" height="7" rx="1.2" transform="rotate(45 17 16.5)"/>'),
  quote: S('<path d="M9 6.5c-2.6 0-4.5 2-4.5 4.5S6.2 15 8 15c.9 0 1.5-.3 1.9-.7-.2 2-1.6 3.3-3.4 3.9"/><path d="M19 6.5c-2.6 0-4.5 2-4.5 4.5S16.2 15 18 15c.9 0 1.5-.3 1.9-.7-.2 2-1.6 3.3-3.4 3.9"/>'),
  divider: S('<path d="M3 12h18"/><path d="M6 7h12" opacity=".35"/><path d="M6 17h12" opacity=".35"/>'),
  heading: S('<path d="M5 5v14"/><path d="M13 5v14"/><path d="M5 12h8"/><path d="M17 19V9l3-1.5"/>'),
  text: S('<path d="M5 5h14"/><path d="M12 5v14"/><path d="M9.5 19h5"/>'),
  ai: S('<path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>'),
  up: S('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>'),
  down: S('<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>'),
  left: S('<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>'),
  right: S('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  minus: S('<path d="M5 12h14"/>'),
  square: S('<rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/>'),
  close: S('<path d="M6 6 18 18"/><path d="M18 6 6 18"/>'),
  trash: S('<path d="M4.5 7h15"/><path d="M9 7V5h6v2"/><path d="M6.5 7l1 12.5h9L17.5 7"/><path d="M10 11v5"/><path d="M14 11v5"/>'),
};

export function icon(name, cls = 'ic') {
  const svg = ICONS[name];
  return svg ? svg.replace('<svg ', `<svg class="${cls}" `) : '';
}

/** Fill every <span data-icon="name"> in the document. */
export function injectIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.dataset.iconDone) {
      el.innerHTML = icon(el.dataset.icon, el.dataset.iconCls || 'ic');
      el.dataset.iconDone = '1';
    }
  });
}
