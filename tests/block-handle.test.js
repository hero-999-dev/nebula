/**
 * Every block taken by the mouse, as in Notion (1.0.0, block-handle.js): which
 * block the pointer is on, where letting go would put it, and what the move
 * leaves behind. The dragging itself is in tests/e2e/layout.mjs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { blocksOf, blockAt, dropTarget, moveBlock, tidyFrom, toggleCopyHtml, insertBlocks, holdsStructure, GUTTER } from '../src/js/block-handle.js';
import { sectionAround, columnsBeside, columnBeside, canShare, dropColumn, splitsOf } from '../src/js/columns.js';
import { stripTransient } from '../src/js/note-markup.js';

let ed;
const $ = (id) => ed.querySelector(`#${id}`);
const ids = (el) => [...el.children].map((e) => e.id || e.tagName.toLowerCase()).join(',');

/** Where an element is drawn: jsdom draws nothing. */
function lay(el, left, top, width, height) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
}

const NOTE = '<p id="a">one</p><p id="b">two</p>'
  + '<div class="blk-toggle" id="t" data-open="true"><p class="toggle-title" id="tt">title</p><div class="toggle-body" id="tb"><p id="c">inside</p></div></div>'
  + '<ul id="l"><li id="i1">first</li><li id="i2">second</li></ul>'
  + '<div class="blk-cols" id="k" data-split="50"><div class="blk-col" id="k1"><p id="d">left</p></div><hr class="blk-vr"><div class="blk-col" id="k2"><p id="e">right</p></div></div>'
  + '<div class="image-layer" id="layer"></div>';

function note(html = NOTE) {
  ed = document.createElement('div');
  ed.id = 'editor';
  ed.className = 'editor';
  ed.innerHTML = html;
  document.body.replaceChildren(ed);
  return ed;
}

/** The note above, drawn: lines 20 high, 10 apart; a toggle's body and a list 26 in. */
function drawn() {
  note();
  lay(ed, 0, 0, 600, 1000);
  lay($('a'), 0, 0, 600, 20);
  lay($('b'), 0, 30, 600, 20);
  lay($('t'), 0, 60, 600, 60);
  lay($('tt'), 0, 60, 600, 20);
  lay($('tb'), 26, 85, 574, 30);
  lay($('c'), 26, 85, 574, 20);
  lay($('l'), 0, 130, 600, 40);
  lay($('i1'), 26, 130, 574, 20);
  lay($('i2'), 26, 150, 574, 20);
  lay($('k'), 0, 180, 600, 40);
  lay($('k1'), 0, 180, 280, 40);
  lay($('d'), 0, 180, 280, 20);
  lay($('k2'), 320, 180, 280, 40);
  lay($('e'), 320, 180, 280, 20);
}

describe('which block the pointer is on', () => {
  beforeEach(drawn);

  it('the blocks of a flow leave out what is drawn over it; a list has items', () => {
    expect(blocksOf(ed).map((el) => el.id)).toEqual(['a', 'b', 't', 'l', 'k']);
    expect(blocksOf($('l')).map((el) => el.id)).toEqual(['i1', 'i2']);
  });

  it('the innermost block: a line in a toggle, a list item, a line in a column', () => {
    expect(blockAt(ed, 100, 10)).toBe($('a'));
    // Between two lines: the nearer half of the gap.
    expect(blockAt(ed, 100, 27)).toBe($('b'));
    expect(blockAt(ed, 100, 70)).toBe($('t'));
    expect(blockAt(ed, 100, 95)).toBe($('c'));
    expect(blockAt(ed, 100, 155)).toBe($('i2'));
    expect(blockAt(ed, 100, 190)).toBe($('d'));
    expect(blockAt(ed, 400, 190)).toBe($('e'));
  });

  it('out in the gutter left of an inner block, the block around it', () => {
    note('<div class="blk-toggle" id="t" data-open="true"><p class="toggle-title" id="tt">title</p><div class="toggle-body" id="tb"><p id="c">inside</p></div></div>');
    lay(ed, 0, 0, 600, 400);
    lay($('t'), 60, 0, 540, 60);
    lay($('tt'), 60, 0, 540, 20);
    lay($('tb'), 86, 25, 514, 30);
    lay($('c'), 86, 25, 514, 20);
    expect(blockAt(ed, 100, 30)).toBe($('c'));
    expect(blockAt(ed, 86 - GUTTER - 4, 30)).toBe($('t'));
  });

  it('a folded toggle is one block', () => {
    $('t').dataset.open = 'false';
    expect(blockAt(ed, 100, 95)).toBe($('t'));
  });
});

describe('where letting go puts it', () => {
  beforeEach(drawn);

  it('between two blocks, by which half of the block the pointer is on', () => {
    const t = dropTarget(ed, $('a'), 100, 45);
    expect(t.kind).toBe('gap');
    expect(t.parent).toBe(ed);
    expect(t.ref).toBe($('t'));
    expect(t.line.top).toBeCloseTo(55 - 1.5);
  });

  it('where it already is, nothing', () => {
    expect(dropTarget(ed, $('a'), 100, 35)).toBeNull();
    expect(dropTarget(ed, $('a'), 100, 5)).toBeNull();
    expect(dropTarget(ed, $('b'), 100, 15)).toBeNull();
  });

  it('on an open toggle\'s title, lower half: first in what folds away', () => {
    const t = dropTarget(ed, $('a'), 100, 75);
    expect(t.parent).toBe($('tb'));
    expect(t.ref).toBe($('c'));
  });

  it('into a column, at the side of a block: columns', () => {
    const into = dropTarget(ed, $('a'), 400, 195);
    expect(into.parent).toBe($('k2'));
    const side = dropTarget(ed, $('a'), 590, 40);
    expect(side).toMatchObject({ kind: 'side', block: $('b'), side: 'right' });
    expect(dropTarget(ed, $('a'), 2, 40)).toMatchObject({ kind: 'side', side: 'left' });
    // Between blocks only (a file from the computer).
    expect(dropTarget(ed, $('a'), 590, 40, { sides: false }).kind).toBe('gap');
  });

  it('a line goes beside a list, not into it; a list item goes into it', () => {
    const line = dropTarget(ed, $('a'), 100, 155);
    expect(line.parent).toBe(ed);
    expect(line.ref).toBe($('k'));
    const item = dropTarget(ed, $('i1'), 100, 165);
    expect(item.parent).toBe($('l'));
    expect(item.ref).toBeNull();
  });

  it('columns go only between blocks on the note', () => {
    const t = dropTarget(ed, $('k'), 100, 95);
    expect(t.parent).toBe(ed);
    expect(dropTarget(ed, $('k'), 590, 10).kind).toBe('gap');
  });

  it('never into itself', () => {
    expect(dropTarget(ed, $('t'), 100, 95)).toBeNull();
  });
});

describe('the move, and what it leaves behind', () => {
  beforeEach(drawn);

  it('a toggle goes whole, with what folds away', () => {
    moveBlock(ed, $('t'), { kind: 'gap', parent: ed, ref: $('a') });
    expect(ids(ed)).toBe('t,a,b,l,k,layer');
    expect($('t').querySelector('#c')).not.toBeNull();
  });

  it('a list item put among lines gets a list of its own; the list it left keeps the other', () => {
    moveBlock(ed, $('i1'), { kind: 'gap', parent: ed, ref: $('b') });
    const list = $('i1').parentElement;
    expect(list.tagName).toBe('UL');
    expect(list.parentElement).toBe(ed);
    expect(ids($('l'))).toBe('i2');
  });

  it('a list whose last item goes goes too', () => {
    moveBlock(ed, $('i1'), { kind: 'gap', parent: $('tb'), ref: null });
    moveBlock(ed, $('i2'), { kind: 'gap', parent: $('tb'), ref: null });
    expect($('l')).toBeNull();
  });

  it('a toggle\'s body left with nothing keeps a line to write on', () => {
    moveBlock(ed, $('c'), { kind: 'gap', parent: ed, ref: null });
    expect($('tb').children.length).toBe(1);
    expect($('tb').firstElementChild.tagName).toBe('P');
    expect($('tb').textContent).toBe('');
  });

  it('a column whose last block goes goes, as in Notion; two columns become one flow', () => {
    moveBlock(ed, $('d'), { kind: 'gap', parent: ed, ref: $('a') });
    expect($('k')).toBeNull();
    expect(ids(ed)).toBe('d,a,b,t,l,e,layer');
  });

  it('at the side of a block: the two stand in columns, half and half', () => {
    moveBlock(ed, $('a'), { kind: 'side', block: $('b'), side: 'left' });
    const cols = $('a').closest('.blk-cols');
    expect(cols).not.toBeNull();
    expect($('b').closest('.blk-cols')).toBe(cols);
    expect(cols.firstElementChild.firstElementChild).toBe($('a'));
    expect(splitsOf(cols)).toEqual([50]);
  });

  it('with Alt, a copy goes and the block stays; the copy has no ids', () => {
    $('c').innerHTML = '<span id="inner">inside</span>';
    const copy = moveBlock(ed, $('t'), { kind: 'gap', parent: ed, ref: null }, { copy: true });
    expect($('b').nextElementSibling).toBe($('t'));
    expect(copy.parentElement).toBe(ed);
    expect(copy.id).toBe('');
    expect(copy.querySelector('[id]')).toBeNull();
    expect(copy.classList.contains('blk-toggle')).toBe(true);
  });

  it('a note left with nothing keeps a line', () => {
    note('<p id="a">one</p>');
    tidyFrom(ed, ed);
    expect(ed.children.length).toBe(1);
    $('a').remove();
    tidyFrom(ed, ed);
    expect(ed.firstElementChild.tagName).toBe('P');
  });
});

describe('a toggle copied with what folds away', () => {
  it('a selection from the title into the body is the toggle again', () => {
    note(NOTE);
    const r = document.createRange();
    r.setStart($('tt').firstChild, 0);
    r.setEnd($('c').firstChild, 3);
    const html = toggleCopyHtml(r);
    const box = document.createElement('div');
    box.innerHTML = html;
    expect(box.firstElementChild.classList.contains('blk-toggle')).toBe(true);
    expect(box.querySelector('.toggle-title').textContent).toBe('title');
    expect(box.querySelector('.toggle-body').textContent).toBe('ins');
    expect(box.querySelector('[id]')).toBeNull();
    expect(holdsStructure(html)).toBe(true);
  });

  it('only words of the title: just words', () => {
    note(NOTE);
    const r = document.createRange();
    r.setStart($('tt').firstChild, 0);
    r.setEnd($('tt').firstChild, 3);
    expect(toggleCopyHtml(r)).toBeNull();
  });
});

describe('blocks pasted as blocks', () => {
  const TOGGLE = '<div class="blk-toggle" data-open="true" id="x"><p class="toggle-title">T</p><div class="toggle-body"><p>B</p></div></div>';

  it('in the middle of a line: the line is split, the toggle stands between its halves', () => {
    note('<p id="a">onetwo</p>');
    const r = document.createRange();
    r.setStart($('a').firstChild, 3);
    r.collapse(true);
    insertBlocks(ed, TOGGLE, r);
    expect([...ed.children].map((el) => el.className || el.textContent)).toEqual(['one', 'blk-toggle', 'two']);
    expect(ed.querySelector('.blk-toggle .toggle-title').textContent).toBe('T');
    expect(ed.querySelector('#x')).toBeNull();
  });

  it('on an empty line: in its place; at the end of a line: after it', () => {
    note('<p id="a">one</p><p id="z"><br></p>');
    let r = document.createRange();
    r.setStart($('z'), 0);
    insertBlocks(ed, TOGGLE, r);
    expect([...ed.children].map((el) => el.id || el.className)).toEqual(['a', 'blk-toggle']);
    r = document.createRange();
    r.setStart($('a').firstChild, 3);
    insertBlocks(ed, '<p>two</p>', r);
    expect(ed.children[1].textContent).toBe('two');
  });

  it('only blocks from Nebula with a toggle or columns are pasted this way', () => {
    expect(holdsStructure('<p class="x">a</p>')).toBe(false);
    expect(holdsStructure('<div class="blk-cols"></div>')).toBe(true);
  });
});

describe('columns made by a drop (columns.js)', () => {
  it('beside a block on the note, two columns where it stood', () => {
    note('<p id="a">a</p><p id="b">b</p>');
    const cols = columnsBeside($('b'), $('a'), 'right');
    expect(ids(ed)).toBe(`${cols.id || 'div'},p`);
    expect(cols.children[0].firstElementChild).toBe($('b'));
    expect(cols.children[2].firstElementChild).toBe($('a'));
  });

  it('beside a block in a column: a new column, half of that one\'s room', () => {
    note('<div class="blk-cols" data-split="50"><div class="blk-col" id="k1"><p>l</p></div><hr class="blk-vr"><div class="blk-col" id="k2"><p>r</p></div></div><p id="a">a</p>');
    const cols = ed.firstElementChild;
    expect(canShare($('k2'))).toBe(true);
    columnBeside($('k2'), $('a'), 'right');
    expect(cols.querySelectorAll(':scope > .blk-col').length).toBe(3);
    expect(splitsOf(cols)).toEqual([50, 75]);
    expect(cols.lastElementChild.firstElementChild).toBe($('a'));
  });

  it('a column taken away gives its room to its neighbour; the last but one ends the columns', () => {
    note('<div class="blk-cols" data-split="25,50"><div class="blk-col" id="k1"><p>1</p></div><hr class="blk-vr"><div class="blk-col" id="k2"><p>2</p></div><hr class="blk-vr"><div class="blk-col" id="k3"><p>3</p></div></div>');
    const cols = ed.firstElementChild;
    dropColumn($('k2'));
    expect(cols.querySelectorAll(':scope > .blk-col').length).toBe(2);
    expect(cols.querySelectorAll(':scope > hr').length).toBe(1);
    expect(splitsOf(cols)).toEqual([50]);
    dropColumn($('k3'));
    expect(ed.querySelector('.blk-cols')).toBeNull();
    expect(ed.textContent).toBe('1');
  });

  it('the part of the note around a block: between the dividers above and below it, the dragged one no bound', () => {
    note('<p id="a">a</p><hr class="blk-hr" id="h1"><p id="b">b</p><hr class="blk-hr" id="h2"><p id="c">c</p><hr class="blk-hr" id="h3"><p id="d">d</p>');
    expect(sectionAround($('c')).map((el) => el.id)).toEqual(['c']);
    // The divider pulled sideways from between b and c: c's part reaches up to h1.
    expect(sectionAround($('c'), $('h2')).map((el) => el.id)).toEqual(['b', 'c']);
    expect(sectionAround($('h1'))).toEqual([]);
  });
});

describe('what only the screen shows', () => {
  it('a picked or lifted block is not saved so', () => {
    note('<p id="a" class="block-picked">a</p><div id="b" class="blk-toggle block-lifted"></div>');
    stripTransient(ed);
    expect(ed.querySelector('.block-picked, .block-lifted')).toBeNull();
  });
});
