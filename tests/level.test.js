/**
 * Feet made level, and what is not words taken beside what is not words
 * (1.0.4). The owner: "widgets have no evening-out as pictures do; the same for
 * a table (by its lines) and for embedded pages; and tables too should be
 * pulled to each other's sides as pictures are — everything but the words".
 * The pulling itself is tried in the built app.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LEVEL_SNAP, faceOf, besideOf, footGap, showLevel, hideLevel } from '../src/js/level.js';
import { dropTarget, moveBlock } from '../src/js/block-handle.js';
import { createPictureDrag } from '../src/js/image-place.js';

let ed;
const $ = (id) => ed.querySelector(`#${id}`);

/** Where an element is drawn: jsdom draws nothing. */
function lay(el, left, top, width, height) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
}

function note(html) {
  ed = document.createElement('div');
  ed.id = 'editor';
  ed.className = 'editor';
  ed.innerHTML = html;
  document.body.replaceChildren(ed);
  lay(ed, 0, 0, 600, 1000);
  return ed;
}

const TABLE = (id) => `<div class="blk-table" id="${id}" contenteditable="false"><table id="${id}t"><tbody><tr><td>1</td></tr></tbody></table></div>`;
const PICTURE = (id) => `<figure class="note-image note-image--inline" id="${id}" contenteditable="false"><img id="${id}i" alt=""></figure>`;
const WIDGET = (id) => `<figure class="note-image note-image--inline note-widget" id="${id}" contenteditable="false"><div class="wg"></div></figure>`;
const CARD = (id) => `<div class="link-block link-embed" id="${id}" contenteditable="false"><div class="link-card">page</div></div>`;

describe('what stands beside a block', () => {
  beforeEach(() => {
    note(`<div class="blk-cols" id="k" data-split="50"><div class="blk-col" id="k1">${TABLE('a')}</div><hr class="blk-vr"><div class="blk-col" id="k2">${TABLE('b')}${CARD('c')}</div></div>${WIDGET('w')}<p id="p">words</p>`);
    lay($('a'), 0, 0, 280, 130);
    lay($('at'), 30, 0, 250, 100);
    lay($('b'), 320, 0, 280, 124);
    lay($('bt'), 350, 0, 250, 96);
    lay($('c'), 320, 130, 280, 60);
    lay($('w'), 0, 200, 200, 150);
    lay($('p'), 0, 360, 600, 20);
  });

  it('a table is measured by its table, a picture by its picture, a widget and a card by themselves', () => {
    expect(faceOf($('a'))).toBe($('at'));
    expect(faceOf($('w'))).toBe($('w'));
    expect(faceOf($('c'))).toBe($('c'));
    note(PICTURE('i'));
    expect(faceOf($('i'))).toBe($('ii'));
  });

  it('only what is at its side and shares its height: not what is under it, not words', () => {
    // The table at the left: the table beside it, not the card lower down, nor the widget under itself.
    expect(besideOf(ed, $('a')).map((r) => r.left)).toEqual([350]);
    // The card in the right column has the left table's foot nowhere near its own height.
    expect(besideOf(ed, $('c'))).toEqual([]);
    expect(besideOf(ed, $('w'))).toEqual([]);
  });

  it('the nearest foot within reach, and none farther off', () => {
    expect(footGap(ed, $('a'))).toBe(-4);
    expect(footGap(ed, $('b'))).toBe(4);
    lay($('at'), 30, 0, 250, 96 + LEVEL_SNAP + 1);
    expect(footGap(ed, $('a'))).toBeNull();
    // A page drawn larger reaches farther on the screen.
    expect(footGap(ed, $('a'), LEVEL_SNAP * 2)).toBe(-(LEVEL_SNAP + 1));
  });

  it('the line lies along both feet once they are level, and goes when they are not', () => {
    expect(showLevel(ed, $('a'))).toBe(false);
    lay($('at'), 30, 0, 250, 96);
    expect(showLevel(ed, $('a'))).toBe(true);
    const guide = document.querySelector('.image-row-guide');
    expect(guide.hidden).toBe(false);
    expect(guide.style.left).toBe('30px');
    expect(guide.style.top).toBe('96px');
    expect(guide.style.width).toBe('570px');
    hideLevel();
    expect(guide.hidden).toBe(true);
    lay($('at'), 30, 0, 250, 99);
    expect(showLevel(ed, $('a'))).toBe(false);
    expect(guide.hidden).toBe(true);
  });

  it('a widget in a row of pictures has the pictures beside it', () => {
    note(`${WIDGET('w')}${PICTURE('i')}`);
    lay($('w'), 0, 0, 200, 150);
    lay($('i'), 212, 0, 200, 170);
    lay($('ii'), 212, 0, 200, 146);
    expect(footGap(ed, $('w'))).toBe(-4);
    expect(footGap(ed, $('i'))).toBe(4);
  });
});

describe('what is not words, taken beside what is not words', () => {
  beforeEach(() => {
    note(`<p id="p">words</p>${TABLE('a')}${TABLE('b')}${CARD('c')}${PICTURE('i')}<p id="q">more</p>`);
    lay($('p'), 0, 0, 600, 20);
    lay($('a'), 0, 30, 300, 100);
    lay($('b'), 0, 140, 300, 100);
    lay($('c'), 0, 250, 600, 60);
    lay($('i'), 0, 320, 300, 100);
    lay($('q'), 0, 430, 600, 20);
  });

  it('a third of it at each side is beside it; the middle is over or under it', () => {
    const solid = { sides: 'solid' };
    expect(dropTarget(ed, $('b'), 50, 60, solid)).toMatchObject({ kind: 'side', side: 'left', block: $('a') });
    expect(dropTarget(ed, $('b'), 250, 60, solid)).toMatchObject({ kind: 'side', side: 'right', block: $('a') });
    expect(dropTarget(ed, $('b'), 150, 40, solid)).toMatchObject({ kind: 'gap' });
    // A table over a card, a card over a table, either over a picture.
    expect(dropTarget(ed, $('a'), 500, 280, solid)).toMatchObject({ kind: 'side', side: 'right', block: $('c') });
    expect(dropTarget(ed, $('c'), 20, 180, solid)).toMatchObject({ kind: 'side', side: 'left', block: $('b') });
    expect(dropTarget(ed, $('a'), 280, 400, solid)).toMatchObject({ kind: 'side', side: 'right', block: $('i') });
  });

  it('over words it goes between the lines, as it always did', () => {
    expect(dropTarget(ed, $('a'), 595, 440, { sides: 'solid' })).toMatchObject({ kind: 'gap' });
    expect(dropTarget(ed, $('a'), 2, 440, { sides: 'solid' })).toMatchObject({ kind: 'gap' });
    // And words are not put beside a table by their own middle.
    expect(dropTarget(ed, $('q'), 150, 60, { sides: 'solid' })).toMatchObject({ kind: 'gap' });
  });

  it('a picture in a row of pictures is left to its row', () => {
    $('i').classList.add('note-image--row');
    expect(dropTarget(ed, $('a'), 280, 400, { sides: 'solid' })).toMatchObject({ kind: 'gap' });
  });

  it('let go there, the two stand in two columns', () => {
    const t = dropTarget(ed, $('b'), 250, 60, { sides: 'solid' });
    expect(moveBlock(ed, $('b'), t)).toBe($('b'));
    const cols = $('a').closest('.blk-cols');
    expect(cols).not.toBeNull();
    expect([...cols.querySelectorAll('.blk-col')].map((col) => col.firstElementChild.id)).toEqual(['a', 'b']);
  });

  it('a picture taken over a side of a table goes into columns with it; over a picture it is still a row', () => {
    const drag = createPictureDrag(ed, {
      sideAt: (figure, x, y) => {
        const t = dropTarget(ed, figure, x, y, { sides: 'solid' });
        return t?.kind === 'side' && !t.block.matches('.note-image') ? t : null;
      },
      toSide: (figure, side) => !!moveBlock(ed, figure, side),
    });
    const over = drag.over($('i'), 280, 60, 0);
    expect(over).toMatchObject({ kind: 'side' });
    expect(drag.drop($('i'), over)).toBe(true);
    const cols = $('a').closest('.blk-cols');
    expect([...cols.querySelectorAll('.blk-col')].map((col) => col.firstElementChild.id)).toEqual(['a', 'i']);

    note(`${PICTURE('i')}${PICTURE('j')}`);
    lay($('i'), 0, 0, 300, 100);
    lay($('j'), 0, 110, 300, 100);
    expect(createPictureDrag(ed, { sideAt: () => null }).over($('j'), 280, 50, 0)).toMatchObject({ kind: 'beside', side: 'after' });
  });
});
