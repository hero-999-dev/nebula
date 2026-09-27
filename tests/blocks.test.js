import { describe, it, expect } from 'vitest';
import { convertBlock, liftNestedDividers, blockFromNode, exitQuoteOnEmptyLine, tidyAfterDelete, beforeDelete } from '../src/js/blocks.js';

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

describe('tidyAfterDelete (long-note trials, 0.8.9)', () => {
  const setup = (html, pick) => {
    document.body.innerHTML = `<div id="ed">${html}</div>`;
    const root = document.getElementById('ed');
    const [node, offset] = pick(root);
    const r = document.createRange(); r.setStart(node, offset); r.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    return { root, sel };
  };

  it('unwraps the style span Chromium leaves when two lines are joined, keeping the caret', () => {
    const { root, sel } = setup('<p>stands apart <span style="font-style: normal;">from the text</span></p>',
      (ed) => [ed.querySelector('span').firstChild, 4]);
    expect(tidyAfterDelete(root, sel)).toBe(true);
    expect(root.innerHTML).toBe('<p>stands apart from the text</p>');
    const r = sel.getRangeAt(0);
    expect(r.startContainer.nodeValue).toBe('from the text');
    expect(r.startOffset).toBe(4);
  });

  it('leaves Nebula\'s own classed spans alone', () => {
    const { root, sel } = setup('<p>a <span class="u-single" style="x">b</span></p>', (ed) => [ed.querySelector('p').firstChild, 1]);
    expect(tidyAfterDelete(root, sel)).toBe(false);
    expect(root.querySelector('.u-single')).not.toBeNull();
  });

  it('joins the two lists a lifted and re-merged item left behind', () => {
    const { root, sel } = setup('<ul><li>one two</li></ul><ul><li>three</li></ul>', (ed) => [ed.querySelector('li').firstChild, 3]);
    expect(tidyAfterDelete(root, sel)).toBe(true);
    expect(root.innerHTML).toBe('<ul><li>one two</li><li>three</li></ul>');
  });

  it('does not join lists of different kinds', () => {
    const { root, sel } = setup('<ul><li>one</li></ul><ol><li>two</li></ol>', (ed) => [ed.querySelector('li').firstChild, 1]);
    expect(tidyAfterDelete(root, sel)).toBe(false);
  });
});

describe('tidyAfterDelete puts back a span Chromium dropped (0.8.9)', () => {
  it('rewraps the upright words of a quote after Enter and Backspace joined it', () => {
    document.body.innerHTML = '<div id="ed"><blockquote>tam anlamıyla görünüyor<span style="font-style: normal;">.</span></blockquote></div>';
    const root = document.getElementById('ed');
    const before = beforeDelete(root);
    before.blocks += 1;                                   // there were two quotes before the join
    root.querySelector('blockquote').innerHTML = 'tam anlamıyla görünüyor.';
    const t = root.querySelector('blockquote').firstChild;
    const r = document.createRange(); r.setStart(t, 4); r.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    expect(tidyAfterDelete(root, sel, before)).toBe(true);
    expect(root.innerHTML).toBe('<blockquote>tam anlamıyla görünüyor<span style="font-style: normal;">.</span></blockquote>');
    expect(sel.getRangeAt(0).startOffset).toBe(4);
  });
});

describe('Enter then Backspace in a line set in a font (the owner\'s notes, 0.9.1)', () => {
  const FONT = 'data-font-family="Noto Serif, serif" style="font-size: 14px; font-family: &quot;Noto Serif&quot;, serif;"';
  const STYLE = 'style="font-size: 14px; font-family: &quot;Noto Serif&quot;, serif;"';
  /** Before: the item and, under it, the line Enter split off. After: Chromium's join. */
  const joined = (upper, lower, lowerBefore = FONT, lowerAfter = STYLE) => {
    document.body.innerHTML = `<div id="ed"><ul><li><span ${FONT}>${upper}</span></li></ul><p><span ${lowerBefore}>${lower}</span></p></div>`;
    const root = document.getElementById('ed');
    const before = beforeDelete(root);
    root.querySelector('p').remove();
    root.querySelector('li').insertAdjacentHTML('beforeend', `<span ${lowerAfter}>${lower}</span>`);
    const t = root.querySelector('li span').firstChild;
    const r = document.createRange(); r.setStart(t, t.length); r.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    return { root, sel, before };
  };

  it('makes the two halves one span again, with the font name, and the space a plain space', () => {
    const { root, sel, before } = joined('the harbour&nbsp;', 'boat waits');
    expect(tidyAfterDelete(root, sel, before)).toBe(true);
    const spans = root.querySelectorAll('li span');
    expect(spans).toHaveLength(1);
    expect(spans[0].getAttribute('data-font-family')).toBe('Noto Serif, serif');
    expect(spans[0].textContent).toBe('the harbour boat waits');
    // The caret is where the lines met, so the next Backspace takes the space and nothing else.
    const r = sel.getRangeAt(0);
    expect(r.startContainer.data.slice(0, r.startOffset)).toBe('the harbour ');
  });

  it('keeps two spans that format differently apart', () => {
    const big = 'style="font-size: 20px;"';
    const { root, sel, before } = joined('the harbour&nbsp;', 'boat', big, big);
    tidyAfterDelete(root, sel, before);
    expect(root.querySelectorAll('li span')).toHaveLength(2);
    expect(root.querySelector('li').textContent).toBe('the harbour boat');
  });

  it('rejoins the two halves a deleted underlined word left, with the caret at the start of the right one', () => {
    document.body.innerHTML = `<div id="ed"><ul><li><span ${FONT}>harbour </span><span ${FONT}>boat</span></li></ul></div>`;
    const root = document.getElementById('ed');
    const before = beforeDelete(root);
    const t = root.querySelectorAll('li span')[1].firstChild;
    const r = document.createRange(); r.setStart(t, 0); r.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    expect(tidyAfterDelete(root, sel, before)).toBe(true);
    expect(root.querySelectorAll('li span')).toHaveLength(1);
    expect(root.querySelector('li span').textContent).toBe('harbour boat');
    const at = sel.getRangeAt(0);
    expect(at.startContainer.data.slice(0, at.startOffset)).toBe('harbour ');
  });
});


describe('a slash command on a line in a font (the owner\'s Ideas note, 0.9.1)', () => {
  it('leaves the new heading somewhere to type: the <br> inside the font it kept', () => {
    // After "/h3" is taken out, the line is an empty span: no text, no <br>.
    const el = root('<p>above</p><p><span style="font-size: 14px;"></span></p><p>under</p>');
    const heading = convertBlock(el.querySelectorAll('p')[1], 'h3');
    expect(heading.outerHTML).toBe('<h3><span style="font-size: 14px;"><br></span></h3>');
    expect(el.querySelectorAll('p')).toHaveLength(2);
  });

  it('does the same for a list made from such a line, and leaves a line with words alone', () => {
    const el = root('<p><span style="font-size: 14px;"></span></p><p><span style="font-size: 14px;">words</span></p>');
    expect(convertBlock(el.querySelector('p'), 'bullet').innerHTML).toBe('<span style="font-size: 14px;"><br></span>');
    expect(convertBlock(el.querySelector('p'), 'h2').innerHTML).toBe('<span style="font-size: 14px;">words</span>');
  });
});

describe('Backspace joins the whole block, not its first line (0.9.1)', () => {
  const FONT = 'data-font-family="Noto Serif, serif" style="font-size: 14px;"';
  it('a list item of three lines, split with Enter and joined again, is one item of three lines', () => {
    // Before: the lower part was lifted out of the list by the first Backspace.
    document.body.innerHTML = `<div id="ed"><ul><li><span ${FONT}>the result is written into the&nbsp;</span></li></ul>`
      + `<p><span ${FONT}>second book by the door</span><br><span ${FONT}>line two</span><br><span ${FONT}>line three</span></p></div>`;
    const root = document.getElementById('ed');
    const p = root.querySelector('p');
    let r = document.createRange(); r.setStart(p.querySelector('span').firstChild, 0); r.collapse(true);
    let sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const before = beforeDelete(root);
    expect(before.startBlock).toBe(p);
    // What Chromium does with the second Backspace: the first line only, and without its span.
    const li = root.querySelector('li');
    li.append(document.createTextNode('second book by the door'));
    p.firstChild.remove(); p.firstChild.remove();           // its first line and the <br> after it
    const left = li.querySelector('span').firstChild;
    r = document.createRange(); r.setStart(left, left.length); r.collapse(true);
    sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);

    expect(tidyAfterDelete(root, sel, before)).toBe(true);
    expect(root.querySelector('p')).toBeNull();
    expect(root.querySelectorAll('li')).toHaveLength(1);
    const item = root.querySelector('li');
    expect(item.querySelectorAll('br')).toHaveLength(2);
    expect([...item.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['the result is written into the second book by the door', 'line two', 'line three']);
    const at = sel.getRangeAt(0);
    expect(at.startContainer.data.slice(0, at.startOffset)).toBe('');
    expect(at.startContainer.data).toBe('second book by the door');
  });

  it('leaves a block alone that Chromium joined whole', () => {
    document.body.innerHTML = '<div id="ed"><p>one</p><p>two</p></div>';
    const root = document.getElementById('ed');
    const second = root.querySelectorAll('p')[1];
    let r = document.createRange(); r.setStart(second.firstChild, 0); r.collapse(true);
    let sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const before = beforeDelete(root);
    root.querySelector('p').firstChild.appendData('two'); second.remove();
    r = document.createRange(); r.setStart(root.querySelector('p').firstChild, 3); r.collapse(true);
    sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    tidyAfterDelete(root, sel, before);
    expect(root.innerHTML).toBe('<p>onetwo</p>');
  });
});
