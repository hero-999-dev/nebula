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
