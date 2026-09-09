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

/** Bumped whenever a step is added, so the log line means something. */
export const MARKUP_VERSION = '0.6.3';

/**
 * @param {Element} root the editor
 * @param {{fitShape?: (shape: Element) => void}} deps
 *   `fitShape` measures, so it is injected: layout does not exist in jsdom and
 *   the shapes controller already owns the sizing rules.
 * @returns {{shapes: number, code: number}} how many nodes were touched
 */
export function migrateNote(root, { fitShape } = {}) {
  if (!root) return { shapes: 0, code: 0, wrappers: 0, blanks: 0 };
  return {
    shapes: migrateShapes(root, fitShape),
    code: migrateCodeBlocks(root),
    wrappers: unwrapBlockSwallowingSpans(root),
    blanks: migrateBlankLines(root),
  };
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
    if (span.closest('.blk-code, .shape-layer')) continue;

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

    // 0.6.9 — shapes can be turned, so every one needs the grip that turns it.
    if (!shape.querySelector('.shape-rot')) {
      const rot = shape.ownerDocument.createElement('span');
      rot.className = 'shape-rot';
      rot.setAttribute('title', 'Rotate');
      shape.insertBefore(rot, shape.querySelector('.shape-h'));
      changed = true;
    }

    // 0.6.1 — the resize grip gained a tooltip.
    const grip = shape.querySelector('.shape-h');
    if (grip && !grip.getAttribute('title')) {
      grip.setAttribute('title', 'Resize');
      changed = true;
    }

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
    if (el.children.length || el.textContent.length) continue;
    if (el.closest('.blk-code, .shape-layer, .code-head')) continue;
    if (el.classList.contains('shape-text')) continue;
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
