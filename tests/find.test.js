/**
 * Find inside a note. The reported bug was simply that Ctrl+F did nothing.
 *
 * Matching is done over Ranges rather than by wrapping hits in markup: a search
 * must not edit the note, dirty it, or land on the undo stack.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { findMatches, stepIndex } from '../src/js/find.js';

let root;
const mount = (html) => {
  root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
};
const texts = (ranges) => ranges.map((r) => r.toString());

beforeEach(() => { document.body.innerHTML = ''; });

describe('findMatches', () => {
  it('finds every occurrence, in document order', () => {
    mount('<p>one two one</p><p>and one more</p>');
    expect(texts(findMatches(root, 'one'))).toEqual(['one', 'one', 'one']);
  });

  it('is case-insensitive but returns the text as written', () => {
    mount('<p>Nebula nebula NEBULA</p>');
    expect(texts(findMatches(root, 'nebula'))).toEqual(['Nebula', 'nebula', 'NEBULA']);
    expect(findMatches(root, 'NeBuLa')).toHaveLength(3);
  });

  it('crosses element boundaries as separate hits, never a partial one', () => {
    mount('<p>al<strong>pha</strong> alpha</p>');
    // "al|pha" is split across two text nodes, so only the whole word counts
    expect(texts(findMatches(root, 'alpha'))).toEqual(['alpha']);
  });

  it('finds repeats that touch each other', () => {
    mount('<p>aaaa</p>');
    expect(findMatches(root, 'aa')).toHaveLength(2); // non-overlapping
  });

  it('returns nothing for an empty query, so the bar starts quiet', () => {
    mount('<p>anything</p>');
    expect(findMatches(root, '')).toEqual([]);
    expect(findMatches(root, null)).toEqual([]);
    expect(findMatches(null, 'x')).toEqual([]);
  });

  it('leaves the note exactly as it was', () => {
    const html = '<p>one two one</p>';
    mount(html);
    findMatches(root, 'one');
    expect(root.innerHTML).toBe(html);
  });

  it('searches text inside code blocks and shapes too — it is all visible', () => {
    mount('<div class="shape-layer"><div class="shape-text">hidden gem</div></div><p>a gem</p>');
    expect(findMatches(root, 'gem')).toHaveLength(2);
  });
});

describe('stepIndex', () => {
  it('cycles forwards and backwards', () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);   // wraps to the first
    expect(stepIndex(0, -1, 3)).toBe(2);  // wraps to the last
  });

  it('is -1 when there is nothing to step through', () => {
    expect(stepIndex(0, 1, 0)).toBe(-1);
    expect(stepIndex(-1, -1, 0)).toBe(-1);
  });
});
