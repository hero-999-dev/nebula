/**
 * Words pasted from elsewhere take the note's font.
 *
 * Chromium pastes HTML with the page's own fonts, sizes and colours written
 * into it, so a paragraph copied from a website arrived in that website's font
 * and a black that vanished in the Dark theme. The owner (Bug Finding note,
 * 0.9.2): the pasted text should become this text's font; keeping the source's
 * fonts can be an option later. What the words ARE is kept — paragraphs,
 * headings, lists, quotes, links, bold, italic, underline, strike, code — and
 * how another page dressed them goes.
 *
 * A copy from Nebula itself is left to the browser: it carries this app's own
 * classes (colours, underline styles, blocks) and is already in its terms.
 */

import { plainTable } from './table-grid.js';

/** Classes only Nebula writes: a clipboard holding them came from a note. */
const OURS = /class="[^"]*\b(?:blk-|c-[a-z]+\b|h-[a-z]+\b|u-(?:single|double|dotted|dashed|wavy)\b|note-image|link-block|inline-eq|code-|shape)/;

export function fromNebula(html) {
  return OURS.test(String(html ?? ''));
}

const DROP = 'script, style, meta, link, title, img, picture, video, audio, iframe, svg, canvas, object, embed, input, button, select, textarea, form, noscript, template';
const KEEP = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'A', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'CODE', 'SUB', 'SUP', 'HR']);
const BLOCKISH = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'TR', 'DT', 'DD', 'ADDRESS']);

const SIZE_WORDS = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
const FONT_TAG_SIZES = [0, 10, 13, 16, 18, 24, 32, 48];

/**
 * A size as a source wrote it, in whole pixels — 0 where it says none that can
 * be read on its own (em and % depend on what is around them). Pure — tested.
 * @param {string} raw a CSS font-size ("17px", "12pt", "large") @param {string} [tagSize] a <font size="…">
 */
export function pastedSizePx(raw, tagSize = '') {
  const text = String(raw ?? '').trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)(px|pt|rem)$/.exec(text);
  let px = 0;
  if (m) px = Number(m[1]) * (m[2] === 'pt' ? 4 / 3 : m[2] === 'rem' ? 16 : 1);
  else if (SIZE_WORDS[text]) px = SIZE_WORDS[text];
  else if (/^[1-7]$/.test(String(tagSize ?? '').trim())) px = FONT_TAG_SIZES[Number(tagSize)];
  if (!px) return 0;
  return Math.min(96, Math.max(8, Math.round(px)));
}

/**
 * @param {string} html the clipboard's text/html
 * @param {{keepSize?: boolean}} [opts] `keepSize` — "Paste original format".
 *   The owner settled what that is in three steps (0.9.4): first all of the
 *   source's dress ("I did not say take the background too"), then its font
 *   alone, then: "the font is the same as Nebula's, no font of another source;
 *   only the source's font SIZE, and bold, italic, underline and the like where
 *   it has them". Bold and the like are kept by every paste; this adds the
 *   size, on the words that had one. Font, colour and ground stay behind.
 * @returns {string} the same words and structure, in the note's own dress
 */
export function cleanPastedHtml(html, { keepSize = false } = {}) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${String(html ?? '')}</body>`, 'text/html');
  const body = doc.body;
  body.querySelectorAll(DROP).forEach((el) => el.remove());
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const comments = [];
  for (let c = walker.nextNode(); c; c = walker.nextNode()) comments.push(c);
  comments.forEach((c) => c.remove());

  // The size each run of words was copied in — read now, while the source's
  // elements still say it; the words themselves outlive the cleaning below.
  // A heading is a heading here and has the note's size for one; code has its own.
  const sizeOf = new Map();
  if (keepSize) {
    const texts = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let n = texts.nextNode(); n; n = texts.nextNode()) {
      if (!n.nodeValue.trim() || n.parentElement?.closest('pre, code, h1, h2, h3, h4, h5, h6')) continue;
      let px = 0;
      for (let el = n.parentElement; el && el !== body && !px; el = el.parentElement) px = pastedSizePx(el.style?.fontSize, el.tagName === 'FONT' ? el.getAttribute('size') : '');
      if (px) sizeOf.set(n, px);
    }
  }

  // Deepest first, so an element is cleaned before its parent is looked at.
  for (const el of [...body.querySelectorAll('*')].reverse()) {
    const style = el.style;
    const bold = /^(bold|[6-9]00)$/.test(style?.fontWeight ?? '');
    const italic = style?.fontStyle === 'italic';
    const underline = /underline/.test(style?.textDecorationLine || style?.textDecoration || '');
    const strike = /line-through/.test(style?.textDecorationLine || style?.textDecoration || '');
    const tag = el.tagName;

    let node = el;
    if (/^H[4-6]$/.test(tag)) node = rename(el, 'h3');
    else if (tag === 'TD' || tag === 'TH') node = unwrap(el, ' ');
    else if (BLOCKISH.has(tag)) node = rename(el, 'p');
    else if (!KEEP.has(tag)) node = unwrap(el);
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      // Unwrapped: the emphasis it gave its words still counts.
      if (node?.length || node?.firstChild) wrapMarks(node, { bold, italic, underline, strike });
      continue;
    }
    for (const attr of [...node.attributes]) {
      if (node.tagName === 'A' && attr.name === 'href' && /^(https?:|mailto:)/i.test(attr.value)) continue;
      node.removeAttribute(attr.name);
    }
    if (node.tagName !== 'A') wrapContents(node, { bold, italic, underline, strike });
  }
  // A <p> inside a <p> is not HTML; lift the inner ones out. One at a time, and
  // looked for afresh each time: a box of TWO paragraphs (any web page's <div>)
  // was taken apart for the first, and then the second one's parent was the
  // body itself — which was taken apart too, and the paste came out empty.
  for (let inner = body.querySelector('p p'); inner; inner = body.querySelector('p p')) inner.parentElement.replaceWith(...inner.parentElement.childNodes);
  if (sizeOf.size) dressInSizes(body, sizeOf);
  return body.innerHTML.trim();
}

/**
 * The words back in the size they were copied in: a line's words in one span
 * where they share a size, each run in its own where they do not.
 * @param {HTMLElement} body the cleaned markup @param {Map<Text, number>} sizeOf pixels
 */
function dressInSizes(body, sizeOf) {
  const doc = body.ownerDocument;
  const isBlock = (n) => n.nodeType === Node.ELEMENT_NODE && /^(P|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|HR)$/.test(n.tagName);
  const wordsOf = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.trim() ? [node] : [];
    const out = [];
    const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.nodeValue.trim()) out.push(t);
    return out;
  };
  const wrap = (nodes, px) => {
    const span = doc.createElement('span');
    span.style.fontSize = `${px}px`;
    nodes[0].before(span);
    nodes.forEach((n) => span.appendChild(n));
  };
  const dress = (host) => {
    let run = [];
    const flush = () => {
      // From the first word to the last: a line break before or after them stays outside.
      while (run.length && !wordsOf(run[0]).length) run.shift();
      while (run.length && !wordsOf(run[run.length - 1]).length) run.pop();
      const words = run.flatMap(wordsOf);
      const sizes = new Set(words.map((t) => sizeOf.get(t) ?? 0));
      if (words.length && sizes.size === 1 && !sizes.has(0)) wrap(run, [...sizes][0]);
      else for (const t of words) if (sizeOf.has(t)) wrap([t], sizeOf.get(t));
      run = [];
    };
    for (const node of [...host.childNodes]) {
      if (isBlock(node)) flush();
      else run.push(node);
    }
    flush();
  };
  for (const block of body.querySelectorAll('p, li, h1, h2, h3, blockquote')) if (!block.closest('pre')) dress(block);
  dress(body);
}

/**
 * A copy from a Nebula note keeps Nebula's own classes and blocks, but not the
 * dress Chromium adds when it copies: every element's computed colour, font and
 * scrollbar written inline. One of the owner's notes held
 * `color: rgb(17, 17, 17)` — the Light theme's ink, fixed for good, so the words
 * went black on black in the Dark theme — and `scrollbar-color` on every line.
 * The font the words had goes as well: pasted words take the font of the text
 * they land in (0.9.2). Shapes, pictures, code and equations keep their styles:
 * those are their geometry and fill, not dress.
 * @returns {string} the cleaned markup (identical when there was nothing to take off)
 */
const DRESS = ['color', 'scrollbar-color', 'line-height', 'background', 'background-color', 'background-image'];
/** The app's own writing face and size: what a line has when nobody chose one. */
const APP_FAMILY = 'charter';
const APP_SIZE = 14;
const family0 = (stack) => String(stack || '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();

/**
 * 0.9.4 — a font somebody chose comes along. Until now every font went ("the
 * words take the font of the text they land in", 0.9.2), and the owner's
 * Consolas note pasted elsewhere "starts in the default serif". Chromium writes
 * the computed font on every element it copies, so the chosen ones are told
 * from the inherited default by what they are: a face that is not the app's
 * own, a size that is neither the app's nor a heading's. Those stay; the
 * default goes, so default words still take the font of where they land.
 */
export function cleanNebulaHtml(html, { keepFonts = true } = {}) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${String(html ?? '')}</body>`, 'text/html');
  const body = doc.body;
  // A table comes as the note holds it: without the numbering, the + and the
  // selection it was copied with, which are the screen's (table.js).
  for (const wrap of body.querySelectorAll('.blk-table')) if (!plainTable(wrap)) wrap.remove();
  for (const el of body.querySelectorAll('[style]')) {
    if (el.closest(OWN_STYLE)) continue;
    for (const prop of DRESS) el.style.removeProperty(prop);
    const classed = !keepFonts || el.matches('.inline-code, code, pre, .note-mention, .note-tag, .image-caption') || !!el.closest('.inline-code, code, pre, .image-caption');
    const family = family0(el.style.fontFamily);
    if (classed || !family || family === APP_FAMILY) el.style.removeProperty('font-family');
    const size = parseFloat(el.style.fontSize);
    if (classed || !Number.isFinite(size) || Math.abs(size - APP_SIZE) < 0.01 || el.closest('h1, h2, h3, h4, h5, h6')) el.style.removeProperty('font-size');
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  }
  body.querySelectorAll('[data-font-family]').forEach((el) => el.removeAttribute('data-font-family'));
  // A span that dressed its words and nothing else goes with its dress.
  for (const span of [...body.querySelectorAll('span')].reverse()) {
    if (!span.attributes.length) span.replaceWith(...span.childNodes);
  }
  return body.innerHTML.trim();
}

/**
 * Pasted words in the note's writing font (0.9.4, the owner: "text copied from
 * outside in another font should take whichever font is the note's default").
 *
 * A note's writing font is not inherited from anything: each line typed in it
 * carries a span with the font (toolbar.js). So pasted lines get the same span —
 * every pasted block's own words, and, when the paste lands on an empty line,
 * loose words too. Words that kept a font of their own (an in-app copy) are
 * inside that span and still win. A heading takes the face, not the size.
 * @param {string} html cleaned markup about to be inserted
 * @param {{family?: string|null, size?: number|null}|null} font the note's writing font
 * @param {{loose?: boolean}} [opts] also wrap words that are in no block
 * @returns {string}
 */
export function dressInNoteFont(html, font, { loose = false } = {}) {
  if (!font || (!font.family && !font.size)) return html;
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${String(html ?? '')}</body>`, 'text/html');
  const body = doc.body;
  const isBlock = (n) => n.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|HR|FIGURE|TABLE)$/.test(n.tagName);
  const wrapRuns = (host, heading) => {
    let run = [];
    const flush = () => {
      if (run.some((n) => n.textContent.trim())) {
        const span = doc.createElement('span');
        if (font.family) span.style.fontFamily = font.family;
        if (font.size && !heading) span.style.fontSize = `${font.size}px`;
        run[0].before(span);
        run.forEach((n) => span.appendChild(n));
      }
      run = [];
    };
    for (const node of [...host.childNodes]) {
      if (isBlock(node)) flush();
      else run.push(node);
    }
    flush();
  };
  for (const block of body.querySelectorAll('p, li, h1, h2, h3, blockquote, div.blk-todo, .toggle-title')) {
    if (block.closest(`${OWN_STYLE}, pre`)) continue;
    wrapRuns(block, /^H[1-6]$/.test(block.tagName));
  }
  if (loose) wrapRuns(body, false);
  return body.innerHTML.trim();
}

/** Where a style is geometry or fill, not dress. */
const OWN_STYLE = '.shape, .shape-layer, .image-layer, .note-image, .blk-code, .inline-eq, .katex, .link-block';

/**
 * The app's own inks, as Chromium writes them into pasted words (0.9.4).
 *
 * `insertHTML` dresses what it inserts once more: a `<b>` in clean pasted HTML
 * came out as `<b style="color: rgb(237, 231, 247)">` — the ink of the theme
 * that was on, fixed for good. Pasted in Light or White that is near-black,
 * and the words could not be read in Main or Dark ("they were black, I cannot
 * read them, I had to write everything again" — the owner). A note's colours
 * are classes; an inline colour that is one of these was never chosen by anyone.
 * Main, Dark, Light, White, and the ink a highlight sets.
 */
const THEME_INKS = new Set(['237,231,247', '237,228,211', '32,30,26', '17,17,17', '245,240,232']);

function inkKey(value) {
  const v = String(value ?? '').trim().toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (rgb) return `${rgb[1]},${rgb[2]},${rgb[3]}`;
  const hex = /^#([0-9a-f]{6})$/.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).join(',');
  return '';
}

function dropStyle(el, props) {
  let changed = false;
  for (const prop of props) {
    if (!el.style.getPropertyValue(prop)) continue;
    el.style.removeProperty(prop);
    changed = true;
  }
  if (changed && !el.getAttribute('style')?.trim()) el.removeAttribute('style');
  return changed;
}

/**
 * Old notes: every theme ink frozen into the words lets go (migrate.js).
 * A colour the source page gave ("Paste original format") is not one of ours
 * and stays. Idempotent.
 * @returns {number} how many elements were put right
 */
export function dropFrozenInk(root) {
  let touched = 0;
  for (const el of root.querySelectorAll('[style*="color"]')) {
    if (el.closest(OWN_STYLE)) continue;
    const frozen = THEME_INKS.has(inkKey(el.style.color));
    if (dropStyle(el, [...(frozen ? ['color'] : []), 'scrollbar-color'])) touched += 1;
  }
  return touched;
}

/**
 * After a paste in the note's own dress: whatever colour Chromium wrote onto
 * the elements it has just made goes — the words take the theme's ink.
 * @param {Element} root the editor
 * @param {Set<Element>} had the styled elements that were there before the paste
 */
export function undressInserted(root, had) {
  let touched = 0;
  for (const el of root.querySelectorAll('[style*="color"]')) {
    if (had.has(el) || el.closest(OWN_STYLE)) continue;
    if (dropStyle(el, ['color', 'scrollbar-color'])) touched += 1;
  }
  return touched;
}

function rename(el, tag) {
  const next = el.ownerDocument.createElement(tag);
  while (el.firstChild) next.appendChild(el.firstChild);
  el.replaceWith(next);
  return next;
}

/** Take the element away and keep what it held; returns a fragment-like record of it. */
function unwrap(el, after = '') {
  const doc = el.ownerDocument;
  const holder = doc.createDocumentFragment();
  while (el.firstChild) holder.appendChild(el.firstChild);
  if (after) holder.appendChild(doc.createTextNode(after));
  const nodes = [...holder.childNodes];
  el.replaceWith(holder);
  return { nodes, length: nodes.length };
}

const MARK_TAGS = [['bold', 'b'], ['italic', 'i'], ['underline', 'u'], ['strike', 's']];

function wrapMarks(record, marks) {
  const nodes = record.nodes ?? [];
  if (!nodes.length) return;
  for (const [flag, tag] of MARK_TAGS) {
    if (!marks[flag]) continue;
    const doc = nodes[0].ownerDocument;
    const wrap = doc.createElement(tag);
    nodes[0].before(wrap);
    for (const n of nodes) wrap.appendChild(n);
    nodes.length = 0;
    nodes.push(wrap);
  }
}

function wrapContents(el, marks) {
  for (const [flag, tag] of MARK_TAGS) {
    if (!marks[flag] || el.tagName.toLowerCase() === tag) continue;
    const wrap = el.ownerDocument.createElement(tag);
    while (el.firstChild) wrap.appendChild(el.firstChild);
    el.appendChild(wrap);
  }
}
