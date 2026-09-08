/**
 * The shapes Chromium actually produces when list commands are used one after
 * another, and what they have to be turned back into.
 *
 * The user's report: "bulleted list and numbered list, used one after another,
 * cut into each other and break". They do — execCommand nests the second list
 * inside the last item of the first.
 */
import { describe, it, expect } from 'vitest';
import { normalizeLists, liOwnText, exitListOnEmptyItem, liftListItemAtStart } from '../src/js/lists.js';

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

/**
 * Leaving a list. The user's report: on an empty numbered item, "Backspace does
 * not get me out of the numbered list, it goes up" — the empty item merged into
 * the line above instead of ending the list.
 */
describe('exitListOnEmptyItem', () => {
  let host;

  /** jsdom's Selection only works on nodes that are in the live document. */
  function mount(html) {
    document.body.innerHTML = '';
    host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  /** Collapsed caret inside `el` (an element container, offset 0). */
  function caretIn(el) {
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    return s;
  }

  const flat = () => host.innerHTML.replace(/\s+</g, '<').replace(/>\s+/g, '>');

  it('ends the list from a trailing empty item', () => {
    mount('<ol><li>one</li><li>two</li><li><br></li></ol>');
    const last = host.querySelectorAll('li')[2];
    expect(exitListOnEmptyItem(host, caretIn(last))).toBe(true);
    expect(flat()).toBe('<ol><li>one</li><li>two</li></ol><p><br></p>');
  });

  it('leaves the caret in the new paragraph, not back in the list', () => {
    mount('<ol><li>one</li><li><br></li></ol>');
    const sel = caretIn(host.querySelectorAll('li')[1]);
    exitListOnEmptyItem(host, sel);
    const p = host.querySelector('p');
    expect(sel.getRangeAt(0).startContainer).toBe(p);
    expect(p.closest('li')).toBe(null);
  });

  it('keeps the items below in a list of their own, in order', () => {
    mount('<ol><li>a</li><li><br></li><li>c</li><li>d</li></ol>');
    exitListOnEmptyItem(host, caretIn(host.querySelectorAll('li')[1]));
    expect(flat()).toBe('<ol><li>a</li></ol><p><br></p><ol><li>c</li><li>d</li></ol>');
  });

  it('removes a list that had nothing but the empty item', () => {
    mount('<ul><li><br></li></ul>');
    expect(exitListOnEmptyItem(host, caretIn(host.querySelector('li')))).toBe(true);
    expect(flat()).toBe('<p><br></p>');
  });

  it('does nothing on an item that has text — Backspace must still delete', () => {
    mount('<ol><li>one</li><li>two</li></ol>');
    const li = host.querySelectorAll('li')[1];
    const range = document.createRange();
    range.setStart(li.firstChild, 0);
    range.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    expect(exitListOnEmptyItem(host, s)).toBe(false);
    expect(flat()).toBe('<ol><li>one</li><li>two</li></ol>');
  });

  it('does nothing outside a list', () => {
    mount('<p><br></p>');
    expect(exitListOnEmptyItem(host, caretIn(host.querySelector('p')))).toBe(false);
  });

  it('does nothing on an empty item that holds a sub-list', () => {
    mount('<ul><li><ul><li>child</li></ul></li></ul>');
    const outer = host.querySelector('li');
    expect(exitListOnEmptyItem(host, caretIn(outer))).toBe(false);
  });

  it('leaves a nested list to the browser — that should outdent, not exit', () => {
    mount('<ul><li>parent<ul><li><br></li></ul></li></ul>');
    const inner = host.querySelectorAll('li')[1];
    expect(exitListOnEmptyItem(host, caretIn(inner))).toBe(false);
  });

  it('does nothing when the selection is a range, not a caret', () => {
    mount('<ol><li>one</li><li><br></li></ol>');
    const li = host.querySelectorAll('li')[1];
    const range = document.createRange();
    range.selectNodeContents(host.querySelector('ol'));
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    expect(exitListOnEmptyItem(host, s)).toBe(false);
    expect(li.isConnected).toBe(true);
  });

  it('does nothing without a selection', () => {
    mount('<ol><li><br></li></ol>');
    expect(exitListOnEmptyItem(host, null)).toBe(false);
    window.getSelection().removeAllRanges();
    expect(exitListOnEmptyItem(host, window.getSelection())).toBe(false);
  });
});

/**
 * Backspace at the start of an item that HAS text.
 *
 * `exitListOnEmptyItem` only fires on an empty item, so a line with words in it
 * had no way out: Backspace merged it into the item above. "Pressing back does
 * not take me to the very beginning, to the far left."
 */
describe('liftListItemAtStart', () => {
  let host;

  function mount(html) {
    document.body.innerHTML = '';
    host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  /** Collapsed caret at `offset` in the first text node of `selector`. */
  function caret(selector, offset = 0) {
    const node = host.querySelector(selector).firstChild;
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return sel;
  }

  const flat = () => host.innerHTML.replace(/\s+</g, '<').replace(/>\s+/g, '>');

  it('turns the item into a paragraph at the left margin', () => {
    mount('<ul><li>one</li><li>two</li></ul>');
    expect(liftListItemAtStart(host, caret('li:nth-child(2)'))).toBe(true);
    expect(flat()).toBe('<ul><li>one</li></ul><p>two</p>');
  });

  it('keeps the items below as a list of their own, in order', () => {
    mount('<ol><li>a</li><li>b</li><li>c</li></ol>');
    liftListItemAtStart(host, caret('li:nth-child(2)'));
    expect(flat()).toBe('<ol><li>a</li></ol><p>b</p><ol><li>c</li></ol>');
  });

  it('removes the list when it was the only item', () => {
    mount('<ul><li>only</li></ul>');
    liftListItemAtStart(host, caret('li'));
    expect(flat()).toBe('<p>only</p>');
  });

  it('keeps the text inside the item, formatting and all', () => {
    mount('<ul><li><strong>bold</strong> tail</li></ul>');
    liftListItemAtStart(host, caret('li strong'));
    // Not `flat()` here: it collapses whitespace between tags, and the space
    // after </strong> is exactly what this is checking survived.
    expect(host.querySelectorAll('li')).toHaveLength(0);
    expect(host.querySelector('p').innerHTML).toBe('<strong>bold</strong> tail');
  });

  it('does nothing in the middle of the text — Backspace still deletes', () => {
    mount('<ul><li>one</li></ul>');
    expect(liftListItemAtStart(host, caret('li', 2))).toBe(false);
    expect(flat()).toBe('<ul><li>one</li></ul>');
  });

  it('leaves an empty item to exitListOnEmptyItem', () => {
    mount('<ul><li>one</li><li><br></li></ul>');
    const li = host.querySelectorAll('li')[1];
    const range = document.createRange();
    range.setStart(li, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    expect(liftListItemAtStart(host, sel)).toBe(false);
  });

  it('does nothing outside a list, or with a range rather than a caret', () => {
    mount('<p>plain</p>');
    expect(liftListItemAtStart(host, caret('p'))).toBe(false);
    mount('<ul><li>one</li></ul>');
    const range = document.createRange();
    range.selectNodeContents(host.querySelector('li'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    expect(liftListItemAtStart(host, sel)).toBe(false);
    expect(liftListItemAtStart(host, null)).toBe(false);
  });
});
