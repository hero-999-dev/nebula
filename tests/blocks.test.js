import { describe, it, expect } from 'vitest';
import { convertBlock, liftNestedDividers, blockFromNode } from '../src/js/blocks.js';

const root = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('convertBlock', () => {
  it('turns only the caret paragraph into a heading', () => {
    const el = root('<h1>Ideas</h1><p>/here</p><hr class="blk-hr"><p>after</p>');
    const line = el.querySelectorAll('p')[0];
    convertBlock(line, 'h3');
    expect(el.querySelector('h3').textContent).toBe('/here');
    expect(el.querySelector('h1').textContent).toBe('Ideas');
    expect(el.querySelectorAll('h3')).toHaveLength(1);
    expect(el.querySelector('hr').nextElementSibling.textContent).toBe('after');
  });

  it('makes a list from one line and does not wrap the heading or the divider', () => {
    const el = root('<h1>Ideas</h1><p>item</p><hr class="blk-hr"><p>after</p>');
    convertBlock(el.querySelector('p'), 'bullet');
    expect(el.querySelector('h1').parentElement).toBe(el);
    expect(el.querySelector('ul').textContent).toBe('item');
    expect(el.querySelector('hr').parentElement).toBe(el);
    expect(el.querySelector('hr').closest('ul')).toBeNull();
  });

  it('finds the block that holds the caret', () => {
    const el = root('<h1>Bugs</h1><p>text</p>');
    const text = el.querySelector('p').firstChild;
    expect(blockFromNode(text, el).tagName).toBe('P');
  });
});

describe('liftNestedDividers', () => {
  it('pulls a divider out of a list and is idempotent', () => {
    const el = root('<ul><li>item</li><hr class="blk-hr"></ul><p>next</p>');
    expect(liftNestedDividers(el)).toBe(1);
    expect(el.querySelector('hr').parentElement).toBe(el);
    expect(el.querySelector('hr').closest('ul')).toBeNull();
    expect(liftNestedDividers(el)).toBe(0);
  });
});
