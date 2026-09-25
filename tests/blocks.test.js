import { describe, it, expect } from 'vitest';
import { convertBlock, liftNestedDividers, blockFromNode, exitQuoteOnEmptyLine } from '../src/js/blocks.js';

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

describe('blockFromNode on lines Chromium makes', () => {
  it('turns a bare <div> line (Enter after a heading) and nothing around it', () => {
    const el = root('<h2>Head</h2><div class="c-red">typed line</div><hr class="blk-hr"><p>after</p>');
    const block = blockFromNode(el.querySelector('div').firstChild, el);
    expect(block.tagName).toBe('DIV');
    convertBlock(block, 'h3');
    expect(el.querySelector('h3').textContent).toBe('typed line');
    expect(el.querySelector('h3').classList.contains('c-red')).toBe(true);
    expect(el.querySelector('h2').textContent).toBe('Head');
    expect(el.querySelector('hr').parentElement).toBe(el);
  });

  it('turns an empty <div> line into a list item', () => {
    const el = root('<h2>Head</h2><div><br></div>');
    const li = convertBlock(blockFromNode(el.querySelector('div'), el), 'bullet');
    expect(li.tagName).toBe('LI');
    expect(el.querySelector('h2').parentElement).toBe(el);
    expect(el.querySelector('ul').parentElement).toBe(el);
  });

  it('wraps text typed straight into the editor, one <br> line only', () => {
    const el = root('first<br>second <b>bold</b><br>third');
    const second = el.childNodes[2];
    const block = blockFromNode(second, el);
    expect(block.tagName).toBe('P');
    expect(block.textContent).toBe('second bold');
    convertBlock(block, 'bullet');
    expect(el.querySelector('li').textContent).toBe('second bold');
    expect(el.textContent).toBe('firstsecond boldthird');
  });

  it('does not treat a container <div> or a shape as a line', () => {
    const el = root('<div><p>inner</p></div><div class="shape-layer" contenteditable="false"><div class="shape"><div class="shape-text">s</div></div></div>');
    expect(blockFromNode(el.querySelector('p').firstChild, el).tagName).toBe('P');
    expect(blockFromNode(el.querySelector('.shape-text').firstChild, el)).toBeNull();
  });
});

describe('exitQuoteOnEmptyLine', () => {
  const caretIn = (node) => { const s = window.getSelection(); const r = document.createRange(); r.setStart(node, 0); r.collapse(true); s.removeAllRanges(); s.addRange(r); return s; };
  const mount = (html) => { const el = root(html); document.body.replaceChildren(el); return el; };

  it('turns the empty quote Enter made into a paragraph and puts the caret there', () => {
    const el = mount('<blockquote>Said the keeper.</blockquote><blockquote><br></blockquote>');
    expect(exitQuoteOnEmptyLine(el, caretIn(el.children[1]))).toBe(true);
    expect([...el.children].map((c) => c.tagName)).toEqual(['BLOCKQUOTE', 'P']);
    expect(window.getSelection().anchorNode).toBe(el.querySelector('p'));
  });

  it('moves an empty last line out of a quote', () => {
    const el = mount('<blockquote><div>one</div><div><br></div></blockquote>');
    expect(exitQuoteOnEmptyLine(el, caretIn(el.querySelectorAll('div')[1]))).toBe(true);
    expect(el.innerHTML).toBe('<blockquote><div>one</div></blockquote><p><br></p>');
  });

  it('splits a quote at an empty middle line so the rest stays quoted', () => {
    const el = mount('<blockquote><div>one</div><div><br></div><div>two</div></blockquote>');
    expect(exitQuoteOnEmptyLine(el, caretIn(el.querySelectorAll('div')[1]))).toBe(true);
    expect(el.innerHTML).toBe('<blockquote><div>one</div></blockquote><p><br></p><blockquote><div>two</div></blockquote>');
  });

  it('leaves a line with text alone, and anything outside a quote', () => {
    const el = mount('<blockquote>text</blockquote><p><br></p>');
    expect(exitQuoteOnEmptyLine(el, caretIn(el.querySelector('blockquote').firstChild))).toBe(false);
    expect(exitQuoteOnEmptyLine(el, caretIn(el.querySelector('p')))).toBe(false);
  });
});
