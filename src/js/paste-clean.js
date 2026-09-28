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

/** Classes only Nebula writes: a clipboard holding them came from a note. */
const OURS = /class="[^"]*\b(?:blk-|c-[a-z]+\b|h-[a-z]+\b|u-(?:single|double|dotted|dashed|wavy)\b|note-image|link-block|inline-eq|code-|shape)/;

export function fromNebula(html) {
  return OURS.test(String(html ?? ''));
}

const DROP = 'script, style, meta, link, title, img, picture, video, audio, iframe, svg, canvas, object, embed, input, button, select, textarea, form, noscript, template';
const KEEP = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'A', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'CODE', 'SUB', 'SUP', 'HR']);
const BLOCKISH = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'TR', 'DT', 'DD', 'ADDRESS']);

/**
 * @param {string} html the clipboard's text/html
 * @returns {string} the same words and structure, in the note's own dress
 */
export function cleanPastedHtml(html) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${String(html ?? '')}</body>`, 'text/html');
  const body = doc.body;
  body.querySelectorAll(DROP).forEach((el) => el.remove());
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const comments = [];
  for (let c = walker.nextNode(); c; c = walker.nextNode()) comments.push(c);
  comments.forEach((c) => c.remove());

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
  // A <p> inside a <p> is not HTML; lift the inner ones out.
  for (const p of [...body.querySelectorAll('p p')].reverse()) p.parentElement.replaceWith(...p.parentElement.childNodes);
  return body.innerHTML.trim();
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
const DRESS = ['color', 'scrollbar-color', 'font-family', 'font-size', 'line-height', 'background', 'background-color', 'background-image'];
export function cleanNebulaHtml(html) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${String(html ?? '')}</body>`, 'text/html');
  const body = doc.body;
  for (const el of body.querySelectorAll('[style]')) {
    if (el.closest('.shape, .shape-layer, .image-layer, .note-image, .blk-code, .inline-eq, .katex, .link-block')) continue;
    for (const prop of DRESS) el.style.removeProperty(prop);
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  }
  body.querySelectorAll('[data-font-family]').forEach((el) => el.removeAttribute('data-font-family'));
  // A span that dressed its words and nothing else goes with its dress.
  for (const span of [...body.querySelectorAll('span')].reverse()) {
    if (!span.attributes.length) span.replaceWith(...span.childNodes);
  }
  return body.innerHTML.trim();
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
