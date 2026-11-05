/**
 * A click where there is no line to stand on (0.9.4, gap-caret.js): which
 * line it goes to, and where one is made. The clicks themselves are in
 * tests/e2e/layout.mjs.
 */
import { describe, it, expect } from 'vitest';
import { placeForClick, initGapCaret, NO_CARET } from '../src/js/gap-caret.js';

const KINDS = {
  p: (id) => `<p id="${id}">words</p>`,
  card: (id) => `<div class="link-block link-bookmark" id="${id}" contenteditable="false"></div>`,
  film: (id) => `<div class="link-block link-embed link-file" id="${id}" contenteditable="false"></div>`,
  code: (id) => `<div class="blk-code" id="${id}" contenteditable="false"></div>`,
  pic: (id) => `<figure class="note-image note-image--inline" id="${id}" contenteditable="false"></figure>`,
  hr: (id) => `<hr class="blk-hr" id="${id}">`,
  layer: (id) => `<div class="shape-layer" id="${id}" contenteditable="false"></div>`,
};

/**
 * A flow of blocks, each 40 high with 10 between them, the first at 100:
 * block n stands from 100 + 50n to 140 + 50n. A layer takes no room.
 * @param {string} spec "p card film" — ids are the kind and its place: p0, card1, film2
 */
function flow(spec) {
  const root = document.createElement('div');
  let n = 0;
  root.innerHTML = spec.split(' ').map((kind) => KINDS[kind](kind === 'layer' ? 'layer' : `${kind}${n++}`)).join('');
  document.body.replaceChildren(root);
  let i = 0;
  for (const el of root.children) {
    if (el.id === 'layer') { el.getBoundingClientRect = () => ({ top: 0, bottom: 2000, left: 0, right: 900 }); continue; }
    const top = 100 + 50 * i++;
    el.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 0, right: 600 });
  }
  return root;
}
const say = (place) => (!place ? null : place.line ? `${place.atEnd ? 'end of' : 'start of'} ${place.line.id}` : `a line before ${place.before?.id ?? 'the end'}`);

describe('a click in the gap between two blocks', () => {
  it('between two that take no caret, a line is made there', () => {
    expect(say(placeForClick(flow('p film film p'), 195))).toBe('a line before film2');
    expect(say(placeForClick(flow('code card'), 145))).toBe('a line before card1');
    expect(say(placeForClick(flow('film code'), 145))).toBe('a line before code1');
  });

  it('with a line on one side, the caret goes to that line', () => {
    expect(say(placeForClick(flow('p film p'), 145))).toBe('end of p0');
    expect(say(placeForClick(flow('p film p'), 195))).toBe('start of p2');
  });

  it('under the last block of a flow, and over the first', () => {
    expect(say(placeForClick(flow('p film'), 300))).toBe('a line before the end');
    expect(say(placeForClick(flow('film p'), 50))).toBe('a line before film0');
    expect(say(placeForClick(flow('p card layer'), 300))).toBe('a line before the end');
  });

  it('a divider or a picture beside it is no line: one is made', () => {
    expect(say(placeForClick(flow('hr card p'), 145))).toBe('a line before card1');
    expect(say(placeForClick(flow('card pic p'), 145))).toBe('a line before pic1');
  });

  it('where neither side is one of these blocks, the browser places the caret as it always did', () => {
    expect(placeForClick(flow('p p'), 145)).toBeNull();
    expect(placeForClick(flow('p pic'), 145)).toBeNull();
    expect(placeForClick(flow('pic pic'), 145)).toBeNull();
    expect(placeForClick(flow('hr pic'), 145)).toBeNull();
    expect(placeForClick(flow('p p'), 500)).toBeNull();
  });

  it('on the open ground under a picture that ends the flow, a line is made (the owner’s Ideas note)', () => {
    expect(say(placeForClick(flow('p pic'), 500))).toBe('a line before the end');
  });
});

describe('a click beside a block', () => {
  it('in its upper half is a click over it, in its lower half one under it', () => {
    expect(say(placeForClick(flow('p film p'), 155))).toBe('end of p0');
    expect(say(placeForClick(flow('p film p'), 185))).toBe('start of p2');
    expect(say(placeForClick(flow('film film'), 105))).toBe('a line before film0');
    expect(say(placeForClick(flow('film film'), 135))).toBe('a line before film1');
    expect(say(placeForClick(flow('p film'), 185))).toBe('a line before the end');
  });

  it('beside a line, a picture or a divider it is not answered here', () => {
    expect(placeForClick(flow('p film'), 120)).toBeNull();
    expect(placeForClick(flow('pic film'), 120)).toBeNull();
    expect(placeForClick(flow('hr film'), 120)).toBeNull();
  });
});

describe('what is answered for', () => {
  it('cards, videos and code blocks — not pictures, dividers or words', () => {
    const root = flow('p card film code pic hr');
    expect([...root.children].filter((el) => el.matches(NO_CARET)).map((el) => el.id)).toEqual(['card1', 'film2', 'code3']);
  });
});

describe('a click beside a divider (the owner’s Ideas note, 0.9.4)', () => {
  it('right under one, the caret goes to the start of the line under it', () => {
    expect(say(placeForClick(flow('p hr p'), 195))).toBe('start of p2');
  });

  it('right over one, to the end of the line above it', () => {
    expect(say(placeForClick(flow('p hr p'), 145))).toBe('end of p0');
  });

  it('under a divider that is the last thing of the flow, a line is made', () => {
    expect(say(placeForClick(flow('p hr'), 195))).toBe('a line before the end');
    expect(say(placeForClick(flow('p hr'), 600))).toBe('a line before the end');
    expect(say(placeForClick(flow('hr'), 300))).toBe('a line before the end');
  });

  it('between a divider and a picture nothing of ours is done: the picture answers', () => {
    expect(placeForClick(flow('p hr pic p'), 195)).toBeNull();
    expect(placeForClick(flow('pic hr p'), 145)).toBeNull();
    expect(placeForClick(flow('hr hr'), 145)).toBeNull();
  });

  it('a card beside the divider is answered as a card always was', () => {
    expect(say(placeForClick(flow('hr card p'), 145))).toBe('a line before card1');
    expect(say(placeForClick(flow('p card hr'), 195))).toBe('a line before hr2');
  });
});

describe('a click on the empty ground at the foot of a column', () => {
  const column = (spec) => { const root = flow(spec); root.className = 'blk-col'; return root; };

  it('goes to the end of the column’s own last line', () => {
    expect(say(placeForClick(column('p p'), 400))).toBe('end of p1');
    expect(say(placeForClick(column('p'), 150))).toBe('end of p0');
  });

  it('on the note itself the browser answers, as it always did', () => {
    expect(placeForClick(flow('p p'), 400)).toBeNull();
  });

  it('under a picture that ends the column, a line is made there', () => {
    expect(say(placeForClick(column('p pic'), 400))).toBe('a line before the end');
  });

  it('between two lines of a column, too, the browser answers', () => {
    expect(placeForClick(column('p p'), 145)).toBeNull();
  });
});

describe('a bare line break straight on the note (the owner’s Bug Find note, 1.0.3)', () => {
  it('becomes an empty line at the first press, and a press at its height puts the caret in it', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.innerHTML = '<br><hr class="blk-hr"><ul><li>words</li></ul>';
    document.body.replaceChildren(editor);
    initGapCaret(editor);
    const was = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { return this.tagName === 'P' ? { top: 0, bottom: 24, left: 0, right: 600 } : { top: 30, bottom: 40, left: 0, right: 600 }; };
    try {
      let inputs = 0;
      editor.addEventListener('input', () => inputs++);
      editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 10 }));
      expect(editor.firstElementChild.outerHTML).toBe('<p><br></p>');
      expect([...editor.children].some((c) => c.tagName === 'BR')).toBe(false);
      expect(inputs).toBe(1);
      expect(editor.firstElementChild.contains(window.getSelection().anchorNode)).toBe(true);
    } finally {
      Element.prototype.getBoundingClientRect = was;
    }
  });

  it('between a divider and a picture it is a gap, not a line: it goes and no line is made', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.innerHTML = '<p>words</p><hr class="blk-hr"><br><figure class="note-image" contenteditable="false"></figure>';
    document.body.replaceChildren(editor);
    initGapCaret(editor);
    editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 500 }));
    expect([...editor.children].map((c) => c.tagName).join(' ')).toBe('P HR FIGURE');
  });
});
