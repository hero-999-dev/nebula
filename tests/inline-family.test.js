import { afterEach, describe, expect, it } from 'vitest';
import { applyInlineFamily, clearInlineFamilyAtCaret, cleanTypingMarkers } from '../src/js/inline-family.js';

const colors = ['c-red', 'c-blue'];
const underlines = ['u-single', 'u-double'];
function editor(html) {
  document.body.innerHTML = `<div id="editor" contenteditable="true">${html}</div>`;
  return document.getElementById('editor');
}
function select(node, start, end = start) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  return range;
}
afterEach(() => { window.getSelection().removeAllRanges(); document.body.innerHTML = ''; });

describe('exclusive inline formatting', () => {
  it('removes a fully selected legacy underline without empty wrappers', () => {
    const root = editor('<p><u>legacy</u></p>');
    applyInlineFamily(root, [select(root.querySelector('u').firstChild, 0, 6)], underlines, '', 'u');
    expect(root.innerHTML).toBe('<p>legacy</p>');
  });
  it('recolors the selected repeated word without changing the earlier occurrence', () => {
    const root = editor('<p><span class="c-red">same</span></p><p><span class="c-red">same</span></p>');
    const range = select(root.lastChild.firstChild.firstChild, 0, 4);
    applyInlineFamily(root, [range], colors, 'c-blue');
    expect(root.firstChild.innerHTML).toBe('<span class="c-red">same</span>');
    expect(root.lastChild.querySelector('.c-blue').textContent).toBe('same');
    expect(root.lastChild.querySelector('.c-red')).toBeNull();
    expect(window.getSelection().toString()).toBe('same');
  });

  it('clears underline only inside the selection while preserving other marks', () => {
    const root = editor('<p><span class="u-single c-red"><b>before middle after</b></span></p>');
    applyInlineFamily(root, [select(root.querySelector('b').firstChild, 7, 13)], underlines, '', 'u');
    expect([...root.querySelectorAll('.u-single')].map(el => el.textContent)).toEqual(['before ', ' after']);
    expect(root.textContent).toBe('before middle after');
    expect([...root.querySelectorAll('.c-red')].map(el => el.textContent).join('')).toBe(root.textContent);
    expect([...root.querySelectorAll('b')].map(el => el.textContent).join('')).toBe(root.textContent);
    expect(window.getSelection().toString()).toBe('middle');
  });

  it('preserves native underline attributes when clearing a partial range', () => {
    const root = editor('<p><u class="c-red">abcdef</u></p>');
    applyInlineFamily(root, [select(root.querySelector('u').firstChild, 2, 4)], underlines, '', 'u');
    expect([...root.querySelectorAll('u')].map(el => el.textContent)).toEqual(['ab', 'ef']);
    expect(window.getSelection().toString()).toBe('cd');
    expect([...root.querySelectorAll('.c-red')].map(el => el.textContent).join('')).toBe('abcdef');
  });

  it('changes several blocks without wrapping blocks in an inline span', () => {
    const root = editor('<p><span class="c-red">first</span></p><p><span class="c-red">second</span></p>');
    const first = select(root.firstChild.firstChild.firstChild, 1, 5);
    const second = select(root.lastChild.firstChild.firstChild, 0, 3);
    applyInlineFamily(root, [first, second], colors, 'c-blue');
    expect([...root.querySelectorAll('.c-blue')].map(el => el.textContent)).toEqual(['irst', 'sec']);
    expect(root.querySelector('span p')).toBeNull();
    expect(root.textContent).toBe('firstsecond');
    expect(window.getSelection().toString()).toBe('irstsec');
  });

  it('clears formatting at the caret without moving it past the remaining text', () => {
    const root = editor('<p><span class="u-single c-red"><b>beforeafter</b></span></p>');
    expect(clearInlineFamilyAtCaret(root, select(root.querySelector('b').firstChild, 6), underlines, 'u')).toBe(true);
    const caret = window.getSelection().getRangeAt(0);
    expect(caret.startContainer.parentElement.closest('.u-single')).toBeNull();
    expect(caret.startContainer.parentElement.closest('.c-red')).not.toBeNull();
    expect(caret.startContainer.parentElement.closest('b')).not.toBeNull();
    caret.insertNode(document.createTextNode('NEW'));
    cleanTypingMarkers(root);
    expect(root.textContent).toBe('beforeNEWafter');
    expect([...root.querySelectorAll('.u-single')].map(el => el.textContent)).toEqual(['before', 'after']);
    expect(root.querySelector('[data-format-caret]')).toBeNull();
  });

  it('cleans serialization clones while preserving an active empty typing marker', () => {
    const root = editor('<p><span class="u-single"><br></span></p>');
    clearInlineFamilyAtCaret(root, select(root.querySelector('span'), 0), underlines, 'u');
    cleanTypingMarkers(root, { preserveActive: true });
    expect(root.querySelector('[data-format-caret]')).not.toBeNull();
    const clone = root.cloneNode(true);
    cleanTypingMarkers(clone);
    expect(clone.innerHTML).not.toContain('\u200b');
    expect(clone.querySelector('[data-format-caret]')).toBeNull();
    expect(clone.querySelector('br')).not.toBeNull();
  });
});

/**
 * The owner's Ideas note (0.9.5): "I copied into the caption from another
 * format; when I try to change the background, the highlight, it closes
 * altogether, the caption disappears". The mark's edges were lifted past the
 * caption to the block around the picture, which cut the picture in two.
 */
describe('a mark on a picture\'s caption', () => {
  const hilites = ['h-yellow', 'h-blue'];
  const figure = (caption) => '<div class="blk-col"><p>before</p>'
    + '<figure class="note-image note-image--inline" contenteditable="false" style="width: 120px;"><img src="x.png" alt="x">'
    + `<figcaption class="image-caption" contenteditable="true">${caption}</figcaption></figure><p>after</p></div>`;

  it('leaves the picture whole, in a column and on the page itself', () => {
    for (const html of [figure('words under it'), figure('words under it').replace(/^<div class="blk-col">|<\/div>$/g, '')]) {
      const root = editor(html);
      applyInlineFamily(root, [select(root.querySelector('figcaption').firstChild, 0, 5)], hilites, 'h-yellow', '', 'background');
      expect(root.querySelectorAll('figure').length).toBe(1);
      expect(root.querySelectorAll('figure > img').length).toBe(1);
      expect(root.querySelectorAll('figcaption').length).toBe(1);
      expect(root.querySelector('figcaption').innerHTML).toBe('<span class="h-yellow">words</span> under it');
      expect(root.querySelector('figure').getAttribute('style')).toBe('width: 120px;');
      expect(window.getSelection().toString()).toBe('words');
    }
  });

  it('takes a pasted background off the words that get one of ours, and off no others', () => {
    const pasted = '<span style="color: rgb(182, 172, 203); font-size: 12px; background-color: rgb(32, 26, 56);">copied from a dark page</span>';
    const root = editor(figure(pasted));
    applyInlineFamily(root, [select(root.querySelector('figcaption span').firstChild, 0, 6)], hilites, 'h-blue', '', 'background');
    const caption = root.querySelector('figcaption');
    expect(root.querySelectorAll('figure').length).toBe(1);
    expect(caption.textContent).toBe('copied from a dark page');
    const marked = caption.querySelector('.h-blue');
    expect(marked.textContent).toBe('copied');
    expect(marked.querySelector('[style*="background"]')).toBeNull();
    expect(marked.querySelector('span').style.color).toBe('rgb(182, 172, 203)');        // its ink was not asked about
    expect(caption.lastElementChild.style.backgroundColor).toBe('rgb(32, 26, 56)');     // the words not selected
  });

  it('"No colour" takes it off too, and a colour of ours takes off a pasted one', () => {
    let root = editor('<p><span style="background: yellow;">loud</span> words</p>');
    applyInlineFamily(root, [select(root.querySelector('span').firstChild, 0, 4)], hilites, '', '', 'background');
    expect(root.innerHTML).toBe('<p>loud words</p>');
    root = editor('<p><font color="#000000"><span style="color: rgb(0, 0, 0); font-size: 20px;">black</span></font></p>');
    applyInlineFamily(root, [select(root.querySelector('span').firstChild, 0, 5)], colors, 'c-red', '', 'color');
    expect(root.querySelector('.c-red').textContent).toBe('black');
    expect(root.querySelector('[style*="color"], font[color]')).toBeNull();
    expect(root.querySelector('span[style]').style.fontSize).toBe('20px');
  });
});
