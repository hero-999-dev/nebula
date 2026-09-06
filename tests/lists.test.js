/**
 * The shapes Chromium actually produces when list commands are used one after
 * another, and what they have to be turned back into.
 *
 * The user's report: "bulleted list and numbered list, used one after another,
 * cut into each other and break". They do — execCommand nests the second list
 * inside the last item of the first.
 */
import { describe, it, expect } from 'vitest';
import { normalizeLists, liOwnText } from '../src/js/lists.js';

const root = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};
const shape = (el) => el.innerHTML.replace(/\s+</g, '<').replace(/>\s+/g, '>');

describe('normalizeLists', () => {
  it('lifts a numbered list out of the bulleted item Chromium buried it in', () => {
    // exactly what insertOrderedList does on the line after a <ul>
    const el = root('<ul><li>one</li><li><ol><li>first</li><li>second</li></ol></li></ul>');
    expect(normalizeLists(el)).toBe(true);
    expect(shape(el)).toBe('<ul><li>one</li></ul><ol><li>first</li><li>second</li></ol>');
  });

  it('keeps the order when the buried list was not the last item', () => {
    const el = root('<ul><li>a</li><li><ol><li>n</li></ol></li><li>b</li></ul>');
    normalizeLists(el);
    expect(shape(el)).toBe('<ul><li>a</li></ul><ol><li>n</li></ol><ul><li>b</li></ul>');
  });

  it('leaves a genuine sub-list alone', () => {
    // an item with its own text that also has children is real nesting
    const html = '<ul><li>parent<ul><li>child</li></ul></li></ul>';
    const el = root(html);
    expect(normalizeLists(el)).toBe(false);
    expect(shape(el)).toBe(html);
  });

  it('leaves same-kind nesting alone even without text', () => {
    const html = '<ul><li><ul><li>deep</li></ul></li></ul>';
    const el = root(html);
    normalizeLists(el);
    expect(el.querySelectorAll('ul').length).toBe(2);
  });

  it('merges two adjacent lists of the same kind', () => {
    const el = root('<ul><li>a</li></ul><ul><li>b</li></ul>');
    expect(normalizeLists(el)).toBe(true);
    expect(shape(el)).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('does NOT merge adjacent lists of different kinds', () => {
    const html = '<ul><li>a</li></ul><ol><li>b</li></ol>';
    const el = root(html);
    normalizeLists(el);
    expect(shape(el)).toBe(html);
  });

  it('drops a list left with no items', () => {
    const el = root('<p>x</p><ul></ul>');
    expect(normalizeLists(el)).toBe(true);
    expect(el.querySelector('ul')).toBeNull();
  });

  it('never removes an item that has content — the caret is usually in one', () => {
    const el = root('<ul><li>keep</li><li><br></li></ul>');
    normalizeLists(el);
    expect(el.querySelectorAll('li').length).toBe(2);
  });

  it('settles rather than spinning on a tangled tree', () => {
    const el = root('<ul><li><ol><li><ul><li>x</li></ul></li></ol></li></ul>');
    expect(() => normalizeLists(el)).not.toThrow();
    expect(el.textContent).toBe('x');
  });

  it('is a no-op on content with no lists', () => {
    const html = '<p>hello</p><h2>head</h2>';
    const el = root(html);
    expect(normalizeLists(el)).toBe(false);
    expect(shape(el)).toBe(html);
  });
});

describe('liOwnText', () => {
  it('ignores text that belongs to a nested list', () => {
    const el = root('<ul><li>mine<ul><li>theirs</li></ul></li></ul>');
    expect(liOwnText(el.querySelector('li'))).toBe('mine');
  });

  it('is empty for an item that only wraps a list', () => {
    const el = root('<ul><li><ol><li>x</li></ol></li></ul>');
    expect(liOwnText(el.querySelector('li'))).toBe('');
  });

  it('treats a lone <br> as empty', () => {
    const el = root('<ul><li><br></li></ul>');
    expect(liOwnText(el.querySelector('li'))).toBe('');
  });
});
