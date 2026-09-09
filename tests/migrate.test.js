/**
 * Bringing a stored note up to what the current version writes.
 *
 * The user's question was exact: "are you still keeping the buggy state of the
 * old notes?" For everything that lives in a note's MARKUP rather than in the
 * code, the answer had been yes — a shape saved before shapes could grow stayed
 * clipped for good, and a code block written before the ✕ existed had no way to
 * be deleted. Each was patched at its own call site; this is the one place that
 * has to catch them all, on every open, idempotently.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  migrateNote, migrateShapes, migrateCodeBlocks, unwrapBlockSwallowingSpans,
  migrateBlankLines, MARKUP_VERSION,
} from '../src/js/migrate.js';

const root = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

const shape = (attrs = '', text = '') =>
  `<div class="shape-layer" contenteditable="false"><div class="shape rect" data-kind="rect" ${attrs}>`
  + `<div class="shape-text" contenteditable="true">${text}</div>`
  + '<span class="shape-h"></span></div></div>';

describe('migrateShapes', () => {
  it('copies an old inline background into --shape-fill', () => {
    // 0.6.1: the clipped kinds paint their fill from the custom property, and
    // CSS cannot read an element's inline `background`.
    const el = root(shape('style="background: rgb(1, 2, 3);"', 'hi'));
    expect(migrateShapes(el)).toBe(1);
    expect(el.querySelector('.shape').style.getPropertyValue('--shape-fill')).toBe('rgb(1, 2, 3)');
  });

  it('leaves a --shape-fill that is already there alone', () => {
    const el = root(shape('style="background: rgb(1, 2, 3); --shape-fill: rgb(9, 9, 9);"', 'hi'));
    migrateShapes(el);
    expect(el.querySelector('.shape').style.getPropertyValue('--shape-fill')).toBe('rgb(9, 9, 9)');
  });

  it('gives an empty shape the <br> that makes a caret visible', () => {
    // An empty contenteditable has no line box, so Chromium paints no caret in
    // it: nothing said you could type. Only shapes made after 0.6.2 got this.
    const el = root(shape('style="background: #eee;"'));
    migrateShapes(el);
    expect(el.querySelector('.shape-text').innerHTML).toBe('<br>');
  });

  it('does not touch a shape that already has text', () => {
    const el = root(shape('style="background: #eee;"', 'written'));
    migrateShapes(el);
    expect(el.querySelector('.shape-text').innerHTML).toBe('written');
  });

  it('gives the resize grip its tooltip', () => {
    const el = root(shape('style="background: #eee;"', 'x'));
    migrateShapes(el);
    expect(el.querySelector('.shape-h').getAttribute('title')).toBe('Resize');
  });

  it('re-measures a shape that was SAVED overflowing', () => {
    // The one the user kept reporting: the guide note's own box is 150x90 with
    // 155 characters in it. `fitToText` only ever ran on `input`, so a shape
    // already on disk was never measured again.
    const el = root(shape('style="background: #eee; height: 90px;"', 'long text'));
    const fit = vi.fn((s) => { s.style.height = '240px'; });
    expect(migrateShapes(el, fit)).toBe(1);
    expect(fit).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.shape').style.height).toBe('240px');
  });

  it('is idempotent — a second pass changes nothing', () => {
    const el = root(shape('style="background: rgb(1, 2, 3);"'));
    migrateShapes(el);
    const after = el.innerHTML;
    expect(migrateShapes(el)).toBe(0);
    expect(el.innerHTML).toBe(after);
  });

  it('reports nothing to do on a note with no shapes', () => {
    expect(migrateShapes(root('<p>plain</p>'))).toBe(0);
  });
});

describe('migrateCodeBlocks', () => {
  const legacy =
    '<div class="blk-code" data-block-type="code" data-lang="javascript" data-code="" contenteditable="false">'
    + '<div class="code-head"><select class="code-lang"></select>'
    + '<button type="button" class="code-copy">Copy</button></div>'
    + '<pre class="code-body"><code class="code-src"></code></pre></div>';

  it('gives a block written before 0.6.0 the delete button it never had', () => {
    const el = root(legacy);
    expect(el.querySelector('.code-del')).toBeNull();
    expect(migrateCodeBlocks(el)).toBe(1);
    expect(el.querySelector('.code-del')).not.toBeNull();
  });

  it('is idempotent', () => {
    const el = root(legacy);
    migrateCodeBlocks(el);
    expect(migrateCodeBlocks(el)).toBe(0);
    expect(el.querySelectorAll('.code-del')).toHaveLength(1);
  });
});

/**
 * Until 0.6.3, dragging a selection across a paragraph boundary wrapped the
 * whole thing in ONE inline span. Real notes are full of
 * `<span class="u-single"><p>..</p><p>..</p></span>`, which underlines nothing
 * (decoration does not reach a block child) and makes the span itself "the
 * block the caret is in", so a font picked anywhere inside restyled all of it.
 */
describe('unwrapBlockSwallowingSpans', () => {
  it('moves the formatting down onto each block', () => {
    const el = root('<span class="u-single"><p>one</p><p>two</p></span>');
    expect(unwrapBlockSwallowingSpans(el)).toBe(1);
    expect(el.innerHTML).toBe('<p class="u-single">one</p><p class="u-single">two</p>');
  });

  it('carries several classes across', () => {
    const el = root('<span class="u-single c-red"><p>x</p></span>');
    unwrapBlockSwallowingSpans(el);
    const p = el.querySelector('p');
    expect(p.classList.contains('u-single')).toBe(true);
    expect(p.classList.contains('c-red')).toBe(true);
  });

  it('carries an inline style, letting the block\'s own win', () => {
    const el = root('<span style="font-family: Tahoma"><p style="color: red">x</p></span>');
    unwrapBlockSwallowingSpans(el);
    expect(el.querySelector('p').getAttribute('style')).toBe('font-family: Tahoma;color: red');
  });

  it('keeps inline text beside the blocks wrapped', () => {
    const el = root('<span class="c-red">lead<p>block</p></span>');
    unwrapBlockSwallowingSpans(el);
    expect(el.innerHTML).toBe('<span class="c-red">lead</span><p class="c-red">block</p>');
  });

  it('leaves an ordinary inline span completely alone', () => {
    const html = '<p>a <span class="u-single">word</span> here</p>';
    const el = root(html);
    expect(unwrapBlockSwallowingSpans(el)).toBe(0);
    expect(el.innerHTML).toBe(html);
  });

  it('does not touch a span with no formatting to move', () => {
    const html = '<span><p>x</p></span>';
    const el = root(html);
    expect(unwrapBlockSwallowingSpans(el)).toBe(0);
  });

  it('never reaches inside a code block or a shape layer', () => {
    const html = '<div class="blk-code"><span class="c-red"><div>src</div></span></div>'
      + '<div class="shape-layer"><span class="c-red"><div>t</div></span></div>';
    const el = root(html);
    expect(unwrapBlockSwallowingSpans(el)).toBe(0);
    expect(el.innerHTML).toBe(html);
  });

  it('handles nested swallowing spans, innermost first', () => {
    const el = root('<span class="c-red"><span class="u-single"><p>deep</p></span></span>');
    unwrapBlockSwallowingSpans(el);
    const p = el.querySelector('p');
    expect(el.querySelector('span')).toBeNull();
    expect(p.classList.contains('u-single')).toBe(true);
    expect(p.classList.contains('c-red')).toBe(true);
  });

  it('is idempotent', () => {
    const el = root('<span class="u-single"><p>one</p></span>');
    unwrapBlockSwallowingSpans(el);
    const after = el.innerHTML;
    expect(unwrapBlockSwallowingSpans(el)).toBe(0);
    expect(el.innerHTML).toBe(after);
  });
});

/**
 * An empty block has no line box, so Chromium paints no caret in it and the
 * line has no height either: clicking there put the caret nowhere visible and
 * the line read as a gap nobody could get into.
 */
describe('migrateBlankLines', () => {
  it('gives an empty paragraph a <br> to put a caret on', () => {
    const el = root('<p>text</p><p></p>');
    expect(migrateBlankLines(el)).toBe(1);
    expect(el.innerHTML).toBe('<p>text</p><p><br></p>');
  });

  it('does the same for a formatting wrapper left empty', () => {
    const el = root('<div class="c-red"></div>');
    migrateBlankLines(el);
    expect(el.querySelector('.c-red').innerHTML).toBe('<br>');
  });

  it('leaves a line that already has one alone', () => {
    const el = root('<p><br></p>');
    expect(migrateBlankLines(el)).toBe(0);
  });

  it('empties a line that is nothing but empty formatting', () => {
    // Applying a style and then deleting the words under it leaves the
    // wrappers. The caret lands in a stub four pixels wide, impossible to see,
    // and anything typed there comes out underlined, highlighted AND red.
    const el = root('<p class="h-blue"><span class="u-single">'
      + '<span class="h-blue"><span class="c-red"></span></span></span></p>');
    expect(migrateBlankLines(el)).toBe(1);
    expect(el.querySelector('p').innerHTML).toBe('<br>');
    expect(el.querySelector('p').className).toBe('h-blue');   // the line keeps its own style
  });

  it('never empties a line that has words in it', () => {
    const html = '<p><span class="c-red">words</span></p>';
    const el = root(html);
    expect(migrateBlankLines(el)).toBe(0);
    expect(el.innerHTML).toBe(html);
  });

  it('leaves a line holding a divider or an equation alone', () => {
    const el = root('<div><hr class="blk-hr"></div>'
      + '<p><span class="inline-eq" data-tex="x"></span></p>');
    expect(migrateBlankLines(el)).toBe(0);
  });

  it('never reaches into a code block or a shape layer', () => {
    const html = '<div class="blk-code"><pre class="code-body"><code class="code-src"></code></pre></div>'
      + '<div class="shape-layer"><div class="shape"><div class="shape-text"></div></div></div>';
    const el = root(html);
    expect(migrateBlankLines(el)).toBe(0);
  });

  it('is idempotent', () => {
    const el = root('<p></p><div></div>');
    migrateBlankLines(el);
    expect(migrateBlankLines(el)).toBe(0);
  });
});

describe('migrateNote', () => {
  it('runs every pass and counts what it touched', () => {
    const el = root(shape('style="background: rgb(4, 5, 6);"')
      + '<div class="blk-code" data-lang="plain" data-code="" contenteditable="false">'
      + '<div class="code-head"><select class="code-lang"></select></div>'
      + '<pre class="code-body"><code class="code-src"></code></pre></div>'
      + '<span class="u-single"><p>swallowed</p></span>');
    // The shape's own empty text is a blank line too, so `blanks` counts it.
    expect(migrateNote(el)).toEqual({ shapes: 1, code: 1, wrappers: 1, blanks: 0 });
  });

  it('survives being handed nothing', () => {
    expect(migrateNote(null)).toEqual({ shapes: 0, code: 0, wrappers: 0, blanks: 0 });
  });

  it('carries a version, so a log line means something', () => {
    expect(MARKUP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
