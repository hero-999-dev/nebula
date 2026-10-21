/**
 * Enter in a toggle's title (1.0.0): an open toggle takes the caret into what
 * folds; a folded one makes a line under it and stays folded — "with toggles
 * one under another, Enter on a closed one goes into the note instead of
 * below" (the owner).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initToggles } from '../src/js/toggles.js';

let ed;
const $ = (id) => ed.querySelector(`#${id}`);

function caret(node, offset) {
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}
const enter = () => ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const caretLine = () => {
  const n = window.getSelection().anchorNode;
  return n.nodeType === 1 ? n : n.parentElement;
};

beforeEach(() => {
  ed = document.createElement('div');
  ed.id = 'editor';
  ed.contentEditable = 'true';
  document.body.appendChild(ed);
  initToggles(ed);
});
afterEach(() => ed.remove());

const toggle = (n, open) => `<div class="blk-toggle" id="t${n}"${open ? ' data-open="true"' : ''}><p class="toggle-title" id="h${n}">Title ${n}</p><div class="toggle-body"><p id="b${n}">body ${n}</p></div></div>`;

describe('Enter at the end of a toggle title', () => {
  it('in a folded toggle makes a line under it, the toggle staying folded', () => {
    ed.innerHTML = toggle(1, false) + toggle(2, false) + toggle(3, false);
    caret($('h1').firstChild, 'Title 1'.length);
    enter();
    const next = $('t1').nextElementSibling;
    expect(next.tagName).toBe('P');
    expect(next.textContent).toBe('');
    expect(next.nextElementSibling).toBe($('t2'));
    expect($('t1').dataset.open).toBeUndefined();
    expect($('t1').querySelector('.toggle-body').children).toHaveLength(1);
    expect(caretLine()).toBe(next);
  });

  it('in a folded toggle carries the words after the caret to the new line', () => {
    ed.innerHTML = toggle(1, false);
    caret($('h1').firstChild, 'Title'.length);
    enter();
    expect($('h1').textContent).toBe('Title');
    expect($('t1').nextElementSibling.textContent).toBe(' 1');
    expect($('t1').dataset.open).toBeUndefined();
  });

  it('in a folded toggle in a list makes the next item', () => {
    ed.innerHTML = `<ul><li id="i1">${toggle(1, false)}</li><li id="i2">two</li></ul>`;
    caret($('h1').firstChild, 'Title 1'.length);
    enter();
    const next = $('i1').nextElementSibling;
    expect(next.tagName).toBe('LI');
    expect(next).not.toBe($('i2'));
    expect(caretLine()).toBe(next);
  });

  it('in a folded toggle inside a column stays in the column', () => {
    ed.innerHTML = `<div class="blk-cols"><div class="blk-col"><p>left</p></div><hr class="blk-vr"><div class="blk-col" id="c2">${toggle(1, false)}${toggle(2, false)}</div></div>`;
    caret($('h1').firstChild, 'Title 1'.length);
    enter();
    expect([...$('c2').children].map((c) => c.id || c.tagName)).toEqual(['t1', 'P', 't2']);
    expect($('b1').isConnected && $('b2').isConnected).toBe(true);
  });

  it('in an open toggle still goes to the top of what folds', () => {
    ed.innerHTML = toggle(1, true);
    caret($('h1').firstChild, 'Title 1'.length);
    enter();
    const body = $('t1').querySelector('.toggle-body');
    expect(body.firstElementChild).toBe(caretLine());
    expect(body.children).toHaveLength(2);
    expect($('t1').dataset.open).toBe('true');
  });
});

const key = (k) => ed.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const bodyText = (n) => $(`t${n}`).querySelector('.toggle-body').textContent;

describe('Backspace and Delete beside a folded toggle keep what is folded (1.0.0)', () => {
  it('Backspace on an empty line under it takes the line, the caret to the end of the title', () => {
    ed.innerHTML = toggle(1, false) + toggle(2, false) + '<p id="x"><br></p>';
    caret($('x'), 0);
    expect(key('Backspace')).toBe(false);
    expect($('x')).toBeNull();
    expect(bodyText(2)).toBe('body 2');
    expect(caretLine()).toBe($('h2'));
  });

  it('Backspace at the start of words under it joins them to the title', () => {
    ed.innerHTML = toggle(1, false) + '<p id="x">words</p>';
    caret($('x').firstChild, 0);
    key('Backspace');
    expect($('h1').textContent).toBe('Title 1words');
    expect(bodyText(1)).toBe('body 1');
    expect($('t1').dataset.open).toBeUndefined();
  });

  it('does the same in a column', () => {
    ed.innerHTML = `<div class="blk-cols"><div class="blk-col"><p>l</p></div><hr class="blk-vr"><div class="blk-col">${toggle(1, false)}${toggle(2, false)}<p id="x"><br></p></div></div>`;
    caret($('x'), 0);
    key('Backspace');
    expect(bodyText(1)).toBe('body 1');
    expect(bodyText(2)).toBe('body 2');
  });

  it('leaves Backspace in the middle of a line, and under an open toggle, to the browser', () => {
    ed.innerHTML = toggle(1, false) + '<p id="x">words</p>';
    caret($('x').firstChild, 2);
    expect(key('Backspace')).toBe(true);
    ed.innerHTML = toggle(1, true) + '<p id="x">words</p>';
    caret($('x').firstChild, 0);
    expect(key('Backspace')).toBe(true);
  });

  it('Delete at the end of a folded title brings up the line under it, never the next toggle', () => {
    ed.innerHTML = toggle(1, false) + toggle(2, false) + '<p id="z">z</p>';
    caret($('h1').firstChild, 'Title 1'.length);
    expect(key('Delete')).toBe(false);
    expect($('h1').textContent).toBe('Title 1');
    expect(bodyText(1)).toBe('body 1');
    expect(bodyText(2)).toBe('body 2');
    caret($('h2').firstChild, 'Title 2'.length);
    key('Delete');
    expect($('h2').textContent).toBe('Title 2z');
    expect($('z')).toBeNull();
    expect(bodyText(2)).toBe('body 2');
  });

  it('Delete on an empty line over a folded toggle takes the line', () => {
    ed.innerHTML = '<p id="x"><br></p>' + toggle(1, false);
    caret($('x'), 0);
    key('Delete');
    expect($('x')).toBeNull();
    expect(bodyText(1)).toBe('body 1');
    expect(caretLine()).toBe($('h1'));
  });
});
