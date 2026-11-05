/**
 * Several blocks picked together (1.0.3, block-handle.js): which blocks a pick
 * from one to another holds, and what copying them puts on the clipboard. The
 * picking itself is in tests/e2e/ideas-103.mjs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { blocksBetween, blocksCopyHtml, moveBlocks, isBlankLine, pickOf } from '../src/js/block-handle.js';

let ed;
const $ = (id) => ed.querySelector(`#${id}`);
const ids = (run) => run.map((b) => b.id);

beforeEach(() => {
  ed = document.createElement('div');
  ed.innerHTML = '<p id="a">a</p><div class="block-grip" id="skip"></div><h2 id="b">b</h2><p id="c">c</p><ul id="u"><li id="u1">one</li><li id="u2">two</li></ul>';
  document.body.replaceChildren(ed);
});

describe('blocksBetween', () => {
  it('is the same run from either end, in the note\'s order', () => {
    expect(ids(blocksBetween($('a'), $('c')))).toEqual(ids(blocksBetween($('c'), $('a'))));
    expect(blocksBetween($('b'), $('c')).map((b) => b.id)).toEqual(['b', 'c']);
    expect(ids(blocksBetween($('c'), $('b')))).toEqual(['b', 'c']);
    expect(ids(blocksBetween($('c'), $('c')))).toEqual(['c']);
  });

  it('holds nothing across two places: the note and a list inside it', () => {
    expect(blocksBetween($('a'), $('u1'))).toBeNull();
    expect(blocksBetween(null, $('a'))).toBeNull();
  });
});

describe('moveBlocks', () => {
  const order = () => [...ed.children].map((b) => b.id || b.tagName);

  it('moves neighbours together, in their order', () => {
    const moved = moveBlocks(ed, [$('a'), $('b')], { kind: 'gap', parent: ed, ref: $('u') });
    expect(ids(moved)).toEqual(['a', 'b']);
    expect(order()).toEqual(['skip', 'c', 'a', 'b', 'u']);
  });

  it('copies them when told, with no ids, and leaves them where they were', () => {
    const copies = moveBlocks(ed, [$('b'), $('c')], { kind: 'gap', parent: ed, ref: null }, { copy: true });
    expect(copies.map((c) => c.textContent)).toEqual(['b', 'c']);
    expect(copies.every((c) => !c.id && c.parentElement === ed)).toBe(true);
    expect($('b').isConnected && $('c').isConnected).toBe(true);
  });

  it('puts list items pulled out of their list in one list, and the empty list goes', () => {
    moveBlocks(ed, [$('u1'), $('u2')], { kind: 'gap', parent: ed, ref: $('b') });
    expect($('u')).toBeNull();
    const list = $('u1').parentElement;
    expect(list.tagName).toBe('UL');
    expect(ids([...list.children])).toEqual(['u1', 'u2']);
    expect(list.nextElementSibling).toBe($('b'));
  });

  it('leaves one line to go on with under what takes no caret, after all of them', () => {
    ed.insertAdjacentHTML('afterbegin', '<hr id="r1"><hr id="r2">');
    moveBlocks(ed, [$('r1'), $('r2')], { kind: 'gap', parent: ed, ref: null });
    expect(order().slice(-3)).toEqual(['r1', 'r2', 'P']);
  });
});

describe('blocksCopyHtml', () => {
  it('copies in order, without ids, and keeps list items in a list', () => {
    expect(blocksCopyHtml([$('c'), $('u1'), $('u2')])).toBe('<p>c</p><ul><li>one</li><li>two</li></ul>');
  });

  it('starts a new list when the kind of list changes, and leaves no pick marks', () => {
    ed.insertAdjacentHTML('beforeend', '<ol><li id="o1" class="block-picked">x</li></ol>');
    expect(blocksCopyHtml([$('u2'), $('o1')])).toBe('<ul><li>two</li></ul><ol><li class="">x</li></ol>');
  });
});

describe('empty lines in a pick', () => {
  const lines = (html) => { const box = document.createElement('div'); box.innerHTML = html; return [...box.children]; };
  const names = (list) => list.map((b) => b.id).join();

  it('knows an empty line from a line with something on it', () => {
    const [blank, spaces, word, picture, line] = lines('<p><br></p><p>   </p><p>a</p><p><img></p><hr>');
    expect([blank, spaces].every(isBlankLine)).toBe(true);
    expect([word, picture, line].some(isBlankLine)).toBe(false);
  });
  it('leaves those at the ends out, and carries those between unmarked', () => {
    const { blocks, marked } = pickOf(lines('<p id="a"><br></p><p id="b">x</p><p id="c"><br></p><p id="d">y</p><p id="e"><br></p>'));
    expect(names(blocks)).toBe('b,c,d');
    expect(names(marked)).toBe('b,d');
  });
  it('of nothing but empty lines keeps the first', () => {
    const { blocks, marked } = pickOf(lines('<p id="a"><br></p><p id="b"><br></p>'));
    expect(names(blocks)).toBe('a');
    expect(names(marked)).toBe('a');
  });
});
