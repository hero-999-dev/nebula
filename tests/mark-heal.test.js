import { describe, it, expect, beforeEach } from 'vitest';
import { dropEmptyMarks, initMarkHeal } from '../src/js/mark-heal.js';

describe('empty highlights are taken away', () => {
  let ed;
  beforeEach(() => {
    document.body.innerHTML = '<div id="ed" contenteditable="true"></div>';
    ed = document.getElementById('ed');
  });

  it('unwraps a mark that holds only a line break and keeps the break', () => {
    ed.innerHTML = '<ul><li><span class="h-yellow">first</span></li><li><span class="h-yellow"><br></span></li></ul>';
    expect(dropEmptyMarks(ed)).toBe(1);
    expect(ed.innerHTML).toBe('<ul><li><span class="h-yellow">first</span></li><li><br></li></ul>');
  });

  it('unwraps marks of nothing or zero-width spaces, never one with words', () => {
    ed.innerHTML = '<p>a<span class="h-red"></span>b<span class="h-blue">​</span><span class="h-green">kept</span></p>';
    expect(dropEmptyMarks(ed)).toBe(2);
    expect(ed.querySelectorAll('span').length).toBe(1);
    expect(ed.textContent).toBe('ab​kept');
  });

  it('leaves spans that are not highlights alone', () => {
    ed.innerHTML = '<p><span class="c-red"></span><span class="inline-code"><br></span></p>';
    expect(dropEmptyMarks(ed)).toBe(0);
  });

  it('puts a caret that was inside the mark where the mark was', () => {
    ed.innerHTML = '<p>x</p><p><span class="h-yellow"><br></span></p>';
    const span = ed.querySelector('span');
    const sel = getSelection();
    const r = document.createRange();
    r.setStart(span, 0); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    dropEmptyMarks(ed, sel);
    const p = ed.lastElementChild;
    expect(sel.anchorNode).toBe(p);
    expect(sel.anchorOffset).toBe(0);
  });

  it('heals the line the caret is in on input', () => {
    initMarkHeal(ed);
    ed.innerHTML = '<ul><li><span class="h-yellow">first</span></li><li><span class="h-yellow"><br></span></li></ul>';
    const span = ed.querySelectorAll('span')[1];
    const r = document.createRange();
    r.setStart(span, 0); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    ed.dispatchEvent(new InputEvent('input', { inputType: 'insertParagraph', bubbles: true }));
    expect(ed.querySelectorAll('span').length).toBe(1);
  });
});
