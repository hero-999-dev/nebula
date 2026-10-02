/**
 * Bring a stored note up to what the current version writes.
 *
 * Anything a feature writes INTO a note's markup is frozen in every note saved
 * before that feature existed. The code block's delete button, a shape's
 * `--shape-fill`, the `<br>` that gives an empty shape a caret to sit on — each
 * was patched at its own call site, one at a time, and each time the notes
 * written earlier kept the bug. Fixes to behaviour (JS and CSS) reach every
 * note the moment the app starts; fixes that live in markup reach nothing.
 *
 * "Are you still keeping the buggy state of the old notes?" was a fair
 * question and the answer was yes. This module is the one place that answers
 * it: it runs on every note open, it is idempotent, and every new in-markup
 * control belongs here rather than in a fresh one-off top-up.
 */

import { ensureHeadControls, paintCode } from './codeblock.js';
import { outlineSvg, ensureLayer, releaseEmptyLayers } from './shapes.js';
import { normalizeUnderlineInk } from './inline-family.js';
import { liftNestedDividers } from './blocks.js';
import { stripTransient } from './note-markup.js';
import { pruneAnchors } from './arrows.js';

/** Bumped whenever a step is added, so the log line means something. */
export const MARKUP_VERSION = '0.9.3';

/**
 * @param {Element} root the editor
 * @param {{fitShape?: (shape: Element) => void}} deps
 *   `fitShape` measures, so it is injected: layout does not exist in jsdom and
 *   the shapes controller already owns the sizing rules.
 * @returns {{shapes: number, code: number}} how many nodes were touched
 */
export function migrateNote(root, { fitShape } = {}) {
  if (!root) return { shapes: 0, code: 0, wrappers: 0, blanks: 0, transient: 0, gaps: 0 };
  mergeImageLayers(root);
  const wrappers = unwrapBlockSwallowingSpans(root);
  liftNestedDividers(root);
  // Whatever was on screen when an older version saved: a selected picture or
  // shape, a shape being typed in, an armed divider, a picked-up arrow and its
  // target, the rotation readout 0.8.3 left in the shape it labelled.
  const transient = stripTransient(root);
  // An empty canvas an older version left behind after its last shape went.
  releaseEmptyLayers(root);
  // Anchors no arrow uses, and the copies Enter made of a line's anchor.
  pruneAnchors(root);
  // Before normalizeProse, which would make each of them an empty line.
  const gaps = dropGapBreaks(root);
  normalizeProse(root);
  normalizeUnderlineInk(root);
  dropWrapperIndents(root);
  repairTagChips(root);
  return {
    shapes: migrateShapes(root, fitShape),
    code: migrateCodeBlocks(root),
    wrappers,
    blanks: migrateBlankLines(root),
    transient,
    gaps,
  };
}

/**
 * A loose <br> between two blocks that are not lines (0.9.3).
 *
 * The owner's Ideas note holds `<hr><br><figure>`: a <br> straight on the
 * editor, between a divider and a picture. It is no line anyone wrote on —
 * normalizeProse would make it an empty paragraph, and the caret stood on it
 * under the divider ("there should be nothing between the divider and the
 * picture"). Only a <br> with nothing but other loose <br>s and blank text
 * between two such blocks goes. Idempotent.
 */
const NOT_A_LINE = 'hr, .note-image, .blk-code, .link-block';
export function dropGapBreaks(root) {
  let touched = 0;
  const loose = (n) => n && ((n.nodeType === 3 && !n.nodeValue.trim()) || (n.nodeType === 1 && n.tagName === 'BR'));
  for (const br of [...root.children].filter((c) => c.tagName === 'BR')) {
    if (br.parentNode !== root) continue;
    let before = br.previousSibling;
    let after = br.nextSibling;
    while (loose(before)) before = before.previousSibling;
    while (loose(after)) after = after.nextSibling;
    if (before?.nodeType !== 1 || after?.nodeType !== 1) continue;
    if (!before.matches(NOT_A_LINE) || !after.matches(NOT_A_LINE)) continue;
    br.remove();
    touched += 1;
  }
  return touched;
}

/**
 * An indent on a wrapper that holds several lines (0.9.3).
 *
 * Up to 0.9.2, Tab indented "the block the caret was in", which was the
 * editor's direct child — and when a font or colour had put one wrapper round
 * a heading and the list under it, Tab moved all of them: the owner's Ideas
 * note holds `<div data-ind="1"><h3>Bugs</h3><ul>…</ul></div>` ("I pressed Tab
 * to move the next item under, and everything moved"). Tab now moves one line
 * or one list item, so an indent on a container of lines is only ever that
 * bug. It goes; nothing else changes. Idempotent.
 */
const LINE_BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, figure, hr';

/**
 * #word chips, one piece each (0.9.3).
 *
 * The first 0.9.3 build wrote a chip as an editable span, so Enter after it
 * carried it to the next line and every tag typed below went inside the one
 * above: the owner's Ideas note holds `#label6` inside `#label5` inside
 * `#label4`, and a chip holding only the line's <br>. A chip that holds other
 * chips is taken apart; one that holds more than its "#word" gives the rest
 * back to the line; each ends up plain text, its data-tag its word. Nothing
 * is lost. Idempotent.
 */
export function repairTagChips(root) {
  let touched = 0;
  const unwrap = (el) => { while (el.firstChild) el.before(el.firstChild); el.remove(); };
  for (const chip of [...root.querySelectorAll('span.note-tag')].reverse()) {
    if (chip.isConnected && chip.querySelector('span.note-tag')) { unwrap(chip); touched += 1; }
  }
  for (const chip of [...root.querySelectorAll('span.note-tag')]) {
    const m = chip.textContent.match(/^#([^\s#]+)/u);
    if (!m) { unwrap(chip); touched += 1; continue; }
    const word = `#${m[1]}`;
    if (chip.textContent !== word || chip.children.length) {
      // Keep the chip's own word; everything after it follows the chip, in order.
      const rest = document.createRange();
      const walker = root.ownerDocument.createTreeWalker(chip, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (seen + t.nodeValue.length >= word.length) { rest.setStart(t, word.length - seen); break; }
        seen += t.nodeValue.length;
      }
      rest.setEnd(chip, chip.childNodes.length);
      const tail = rest.extractContents();
      chip.after(tail);
      chip.textContent = word;
      touched += 1;
    }
    if (chip.dataset.tag !== m[1]) { chip.dataset.tag = m[1]; touched += 1; }
    // Ordinary text again (the second 0.9.3 build made chips one piece, and
    // the caret could not stand on a line of them).
    if (chip.hasAttribute('contenteditable')) { chip.removeAttribute('contenteditable'); touched += 1; }
  }
  return touched;
}
export function dropWrapperIndents(root) {
  let touched = 0;
  for (const el of root.querySelectorAll('div[data-ind]')) {
    if (el.matches('.blk-todo, .blk-code, .blk-toggle, .shape, .shape-layer, .image-layer, .link-block')) continue;
    const lines = [...el.children].filter((c) => c.matches(LINE_BLOCKS));
    if (lines.length < 2) continue;
    el.removeAttribute('data-ind');
    touched += 1;
  }
  return touched;
}

/**
 * Floating images used to have layers of their own, painted above every shape.
 * From 0.8.8 they share the shapes' layers so the two can be stacked and moved
 * over each other. Each image joins the matching layer AFTER the shapes there,
 * which is exactly where its own layer used to paint it. Idempotent.
 */
export function mergeImageLayers(root) {
  let moved = 0;
  for (const old of [...root.querySelectorAll(':scope > .image-layer')]) {
    const behind = old.classList.contains('image-layer--behind');
    const images = [...old.querySelectorAll(':scope > .note-image')];
    if (images.length) {
      const canvas = ensureLayer(root, behind);
      for (const image of images) { canvas.appendChild(image); moved += 1; }
    }
    if (!old.querySelector('.note-image')) old.remove();
  }
  return moved;
}

/** Old notes mixed anonymous text lines with non-editable overlays. Give each
 * prose run a real block and keep overlays outside the native merge path. */
export function normalizeProse(root) {
  const layers = [...root.querySelectorAll('.shape-layer, .image-layer')];
  for (const layer of layers.reverse()) {
    // Empty nested overlays have no local geometry to preserve.
    if (layer.parentElement === root || !layer.querySelector('.shape, .note-image')) root.prepend(layer);
  }
  let paragraph = null;
  for (const node of [...root.childNodes]) {
    if (node.nodeType === 1 && BLOCK_TAGS.has(node.tagName)) { paragraph = null; continue; }
    if (node.nodeType === 1 && node.tagName === 'SPAN' && !node.textContent
      && !node.querySelector('br,img,.inline-eq')) { node.remove(); continue; }
    if (node.nodeType === 3 && !node.textContent.trim() && !paragraph) continue;
    if (!paragraph) {
      paragraph = root.ownerDocument.createElement('p');
      node.before(paragraph);
    }
    paragraph.appendChild(node);
  }
}

/** Tags that lay their contents out as a block, whatever the stylesheet says. */
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'FIGURE',
]);

/**
 * Take a block back out of the inline span that swallowed it.
 *
 * Until 0.6.3 a selection dragged across a paragraph boundary was wrapped in a
 * single inline span, so notes contain things like
 *
 *     <span class="u-single"><p>one</p><p>two</p></span>
 *
 * which are wrong twice over. `text-decoration` does not propagate into a block
 * child, so an underline written that way underlines nothing — and the span is
 * now the editor's direct child, which makes it what "the block the caret is
 * in" resolves to: picking a font with the caret in ANY of those paragraphs
 * restyled all of them. "Selecting some places still changes the font of the
 * whole area."
 *
 * The formatting is kept, moved down onto each child where it belongs.
 */
export function unwrapBlockSwallowingSpans(root) {
  let touched = 0;
  // Innermost first: unwrapping an outer span must not skip a nested one.
  const spans = [...root.querySelectorAll('span')].reverse();
  for (const span of spans) {
    if (!span.parentNode) continue;   // already taken apart by an outer pass
    if (!span.className && !span.getAttribute('style')) continue;
    if (![...span.children].some((c) => BLOCK_TAGS.has(c.tagName))) continue;
    if (span.closest('.blk-code, .shape-layer, .image-layer')) continue;

    const classes = span.className ? span.className.split(/\s+/).filter(Boolean) : [];
    const style = span.getAttribute('style') || '';
    const doc = span.ownerDocument;

    for (const node of [...span.childNodes]) {
      if (node.nodeType === 1 && BLOCK_TAGS.has(node.tagName)) {
        // The formatting belongs on the block itself now.
        if (classes.length) node.classList.add(...classes);
        if (style) node.setAttribute('style', `${style};${node.getAttribute('style') || ''}`);
      } else if (node.nodeType === 3 && !node.nodeValue.trim()) {
        // whitespace between blocks — nothing to carry
      } else {
        // Inline content beside the blocks keeps a wrapper of its own.
        const keep = doc.createElement('span');
        if (classes.length) keep.className = classes.join(' ');
        if (style) keep.setAttribute('style', style);
        span.replaceChild(keep, node);
        keep.appendChild(node);
      }
    }
    span.replaceWith(...span.childNodes);
    touched += 1;
  }
  return touched;
}

export function migrateShapes(root, fitShape) {
  let touched = 0;
  for (const shape of root.querySelectorAll('.shape')) {
    let changed = false;

    // 0.6.1 — the clipped kinds paint their fill from a custom property,
    // because CSS cannot read the inline `background` an older note stored.
    if (!shape.style.getPropertyValue('--shape-fill')) {
      const fill = shape.style.background || shape.style.backgroundColor;
      if (fill) {
        shape.style.setProperty('--shape-fill', fill);
        changed = true;
      }
    }

    // 0.6.2 — an empty contenteditable has no line box, so Chromium paints no
    // caret in it and nothing at all says you may type. Only shapes created
    // after 0.6.2 were given the <br>.
    const text = shape.querySelector('.shape-text');
    if (text && !text.textContent.trim() && !text.querySelector('br')) {
      text.innerHTML = '<br>';
      changed = true;
    }

    // 0.6.4 — a shape's text is editable only while it is being edited, so the
    // caret cannot walk into it from the paragraph beside it with an arrow key.
    if (text && text.getAttribute('contenteditable') !== 'false') {
      text.setAttribute('contenteditable', 'false');
      changed = true;
    }

    // The outline (0.7.2) and the two grips (0.6.1, 0.6.9) are drawn by this
    // version, not kept from the note: they used to be added only when missing,
    // so an outline or grip an older version wrote wrongly stayed wrong forever.
    if (rebuildShapeChrome(shape)) changed = true;

    // 0.6.2 — a shape grows to fit its text, but only while someone is TYPING
    // in it: nothing ever re-measured a shape that was already on disk. The
    // guide note's own box is 150x90 with 155 characters in it, so the text was
    // clipped, and a double-click put the caret at the end of it — outside the
    // visible box, which is why "the line for writing does not appear".
    if (fitShape && text) {
      const before = shape.style.height;
      fitShape(shape);
      if (shape.style.height !== before) changed = true;
    }

    if (changed) touched += 1;
  }
  return touched;
}

/**
 * A shape's outline and grips, exactly as `makeShape` in this version writes
 * them: one outline first (for the kinds that have one), then the turning grip,
 * then the resize grip, last. Idempotent; returns whether anything changed.
 */
export function rebuildShapeChrome(shape) {
  const doc = shape.ownerDocument;
  const before = shape.innerHTML;

  const want = outlineSvg(shape.dataset.kind);
  const outlines = [...shape.querySelectorAll(':scope > .shape-svg')];
  const holder = doc.createElement('div');
  holder.innerHTML = want;
  const fresh = holder.firstElementChild;
  if (!fresh) {
    outlines.forEach((svg) => svg.remove());
  } else if (outlines.length !== 1 || outlines[0].outerHTML !== fresh.outerHTML || shape.firstElementChild !== outlines[0]) {
    outlines.forEach((svg) => svg.remove());
    shape.insertBefore(fresh, shape.firstChild);
  }

  for (const [cls, title] of [['shape-rot', 'Rotate'], ['shape-h', 'Resize']]) {
    shape.querySelectorAll(`:scope > .${cls}`).forEach((grip) => grip.remove());
    const grip = doc.createElement('span');
    grip.className = cls;
    grip.setAttribute('title', title);
    shape.appendChild(grip);
  }
  return shape.innerHTML !== before;
}

/**
 * Give an empty line something to put a caret on.
 *
 * A block with no children and no text has no line box, so Chromium draws no
 * caret in it and the line has no height either: clicking there put the caret
 * nowhere visible — "the straight line that guides while typing is gone,
 * clicking does not show it" — and the line itself read as a gap nobody could
 * get into. A `<br>` is what a browser puts in an empty paragraph of its own
 * accord; these were made by script and never got one.
 */
export function migrateBlankLines(root) {
  let touched = 0;
  for (const el of root.querySelectorAll('p, div, h1, h2, h3, h4, li, blockquote')) {
    if (el.closest('.blk-code, .shape-layer, .image-layer, .code-head')) continue;
    if (el.classList.contains('shape-text')) continue;
    if (el.textContent.length) continue;                 // it has words
    if (el.querySelector('br') && el.children.length === 1) continue;   // already blank
    if (el.querySelector('img, hr, .blk-code, .inline-eq, .shape-layer, .image-layer, .note-image')) continue;

    // Everything inside is empty formatting. Clear it and leave one <br>.
    //
    // A line that LOOKS blank was often three nested empty spans —
    // `<p class="h-blue"><span class="u-single"><span class="h-blue">
    // <span class="c-red"></span></span></span></p>` — left behind by applying
    // a style and then deleting the words under it. Two things follow from
    // that, and both were reported: the caret lands inside a stub four pixels
    // wide and is impossible to see, and anything typed there comes out
    // underlined, highlighted AND red, because that is what the caret is
    // standing in.
    el.textContent = '';
    el.appendChild(el.ownerDocument.createElement('br'));
    touched += 1;
  }
  return touched;
}

export function migrateCodeBlocks(root) {
  let touched = 0;
  for (const block of root.querySelectorAll('.blk-code')) {
    const head = block.querySelector('.code-head');
    const had = !!head?.querySelector('.code-del');
    ensureHeadControls(block);
    paintCode(block);
    if (!had && head?.querySelector('.code-del')) touched += 1;
  }
  return touched;
}
