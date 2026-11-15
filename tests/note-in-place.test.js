/**
 * The open note taken in anew where the reader is (1.0.4,
 * src/js/note-in-place.js — the owner, 2026-11-15: "tailscale yapalim
 * kücükleri"): the block at the top of the page, the caret and a video's
 * player stay when Tailscale sync brings a newer version of the open note.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { markOf, sameBlock, holdPlace } from '../src/js/note-in-place.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.getSelection().removeAllRanges();
});

function editorWith(html) {
  const root = document.createElement('div');
  root.setAttribute('contenteditable', 'true');
  root.tabIndex = 0;
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}
function caretAt(node, offset) {
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
}

describe('which block of the new note is the one that stood there', () => {
  const a = ['p1', 'p2', 'p3', 'p4', 'p5'];

  it('is itself when nothing changed, or only blocks below it', () => {
    for (let i = 0; i < a.length; i += 1) expect(sameBlock(a, [...a], i)).toBe(i);
    expect(sameBlock(a, ['p1', 'p2', 'p3', 'x', 'y', 'z'], 2)).toBe(2);
  });

  it('moves down or up with the lines that came or went above it', () => {
    expect(sameBlock(a, ['new', 'more', ...a], 3)).toBe(5);
    expect(sameBlock(a, ['p3', 'p4', 'p5'], 3)).toBe(1);
    expect(sameBlock(a, ['p1', 'new', 'p2', 'p3', 'p4', 'p5'], 4)).toBe(5);
  });

  it('is the block at the same place when blocks were changed where they stand', () => {
    expect(sameBlock(a, ['p1', 'p2 changed', 'p3 changed', 'p4', 'p5'], 1)).toBe(1);
    expect(sameBlock(a, ['p1', 'p2 changed', 'p3 changed', 'p4', 'p5'], 2)).toBe(2);
  });

  it('is found by its mark among lines that came and went — of several alike, the one in the same order', () => {
    // Between an unchanged first and last block: one line gone, two come.
    expect(sameBlock(['top', 'gone', 'mine', 'end'], ['top', 'n1', 'n2', 'mine', 'end'], 2)).toBe(3);
    // Two empty lines alike, a new block before them: the second stays the second.
    expect(sameBlock(['top', '', 'x', '', 'end'], ['top', 'new', 'q', '', 'x2', '', 'end'], 3)).toBe(5);
    expect(sameBlock(['top', '', 'x', '', 'end'], ['top', 'new', 'q', '', 'x2', '', 'end'], 1)).toBe(3);
  });

  it('is nowhere once it is no longer in the note, and for a place the note never had', () => {
    expect(sameBlock(['top', 'mine', 'end'], ['top', 'end'], 1)).toBe(-1);
    expect(sameBlock(['top', 'mine', 'other', 'end'], ['top', 'x', 'y', 'z', 'w', 'end'], 1)).toBe(-1);
    expect(sameBlock(a, a, -1)).toBe(-1);
    expect(sameBlock(a, a, 5)).toBe(-1);
    expect(sameBlock(a, a, 1.5)).toBe(-1);
    expect(sameBlock([], ['x'], 0)).toBe(-1);
    // Everything gone.
    expect(sameBlock(a, [], 2)).toBe(-1);
  });
});

describe('a block’s mark', () => {
  const block = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstChild; };

  it('is its kind, its words and the file it shows — not what the screen draws on it', () => {
    expect(markOf(block('<p>one <b>two</b></p>'))).toBe(markOf(block('<p>one <i>two</i></p>')));
    expect(markOf(block('<p>one</p>'))).not.toBe(markOf(block('<h2>one</h2>')));
    expect(markOf(block('<p>one</p>'))).not.toBe(markOf(block('<p>one.</p>')));
    // A player's clock and buttons, a card's Open and ×: the screen's.
    const bare = '<div class="link-block link-file"><a class="link-card">clip.mp4</a><video src="nebula-media://note/a/vid-1.mp4"></video></div>';
    const drawn = '<div class="link-block link-file"><a class="link-card">clip.mp4</a><button class="link-del">×</button><video src="nebula-media://note/a/vid-1.mp4"></video><div class="video-bar"><button>−10</button><span class="video-now">0:12 / 3:00</span></div></div>';
    expect(markOf(block(drawn))).toBe(markOf(block(bare)));
    // Two wordless blocks are told apart by their file; a text node by its words.
    expect(markOf(block('<figure class="note-image"><img src="nebula-media://note/a/pic-1.png"></figure>')))
      .not.toBe(markOf(block('<figure class="note-image"><img src="nebula-media://note/a/pic-2.png"></figure>')));
    expect(markOf(block('<div class="link-block link-attach" data-src="nebula-media://note/a/att-1-00000000.pdf"></div>')))
      .not.toBe(markOf(block('<div class="link-block link-attach" data-src="nebula-media://note/a/att-2-00000000.pdf"></div>')));
    expect(markOf(document.createTextNode('loose'))).not.toBe(markOf(document.createTextNode('words')));
    // A pasted picture is megabytes of address: the mark stays short.
    const big = `data:image/png;base64,${'A'.repeat(50_000)}`;
    expect(markOf(block(`<p><img src="${big}"></p>`)).length).toBeLessThan(200);
    expect(markOf(block(`<p><img src="${big}"></p>`))).not.toBe(markOf(block(`<p><img src="${big}B"></p>`)));
  });
});

describe('the open note taken in anew', () => {
  it('puts the caret back in its block, at its place in it, though lines came above', () => {
    const root = editorWith('<p>one</p><p>two</p><p>three</p>');
    caretAt(root.children[1].firstChild, 2);
    const place = holdPlace(root);
    root.innerHTML = '<p>new</p><p>more</p><p>one</p><p>two</p><p>three</p>';
    place.players();
    place.restore();
    const sel = window.getSelection();
    expect(sel.anchorNode).toBe(root.children[3].firstChild);
    expect(sel.anchorOffset).toBe(2);
    expect(sel.isCollapsed).toBe(true);
  });

  it('keeps a selection across blocks, each end in its own block', () => {
    const root = editorWith('<p>one</p><p>two</p><p>three</p>');
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(root.children[0].firstChild, 1);
    range.setEnd(root.children[2].firstChild, 3);
    sel.removeAllRanges();
    sel.addRange(range);
    const place = holdPlace(root);
    root.innerHTML = '<p>one</p><p>two</p><p>between</p><p>three</p>';
    place.restore();
    const now = window.getSelection().getRangeAt(0);
    expect(now.startContainer).toBe(root.children[0].firstChild);
    expect(now.startOffset).toBe(1);
    expect(now.endContainer).toBe(root.children[3].firstChild);
    expect(now.endOffset).toBe(3);
  });

  it('keeps the caret in a block the other computer changed where it stands — no further than the block goes', () => {
    const root = editorWith('<p>one</p><p>two words</p><p>three</p>');
    caretAt(root.children[1].firstChild, 7);
    let place = holdPlace(root);
    root.innerHTML = '<p>one</p><p>two words and more</p><p>three</p>';
    place.restore();
    expect(window.getSelection().anchorNode).toBe(root.children[1].firstChild);
    expect(window.getSelection().anchorOffset).toBe(7);
    place = holdPlace(root);
    root.innerHTML = '<p>one</p><p>two</p><p>three</p>';
    place.restore();
    expect(window.getSelection().anchorNode).toBe(root.children[1].firstChild);
    expect(window.getSelection().anchorOffset).toBe(3);
  });

  it('puts the caret at the start of its block when the block is not built as it was', () => {
    const root = editorWith('<p>one</p><p><b>bold</b> two</p><p>three</p>');
    caretAt(root.children[1].lastChild, 2);
    const place = holdPlace(root);
    root.innerHTML = '<p>one</p><p>plain</p><p>three</p>';
    place.restore();
    const sel = window.getSelection();
    expect(sel.anchorNode).toBe(root.children[1]);
    expect(sel.anchorOffset).toBe(0);
  });

  it('leaves the caret alone when its block is gone, when there was none, and when the note is emptied', () => {
    const root = editorWith('<p>one</p><p>two</p><p>three</p><p>four</p>');
    caretAt(root.children[1].firstChild, 2);
    let place = holdPlace(root);
    root.innerHTML = '<p>one</p><p>three</p><p>four</p>';
    expect(() => place.restore()).not.toThrow();
    // Not in another block's words: nobody's typing lands where they did not put it.
    expect(window.getSelection().anchorNode?.nodeType === 3).toBe(false);
    window.getSelection().removeAllRanges();
    place = holdPlace(root);
    root.innerHTML = '<p>one</p>';
    expect(() => place.restore()).not.toThrow();
    expect(window.getSelection().rangeCount).toBe(0);
    caretAt(root.children[0].firstChild, 1);
    place = holdPlace(root);
    root.innerHTML = '';
    expect(() => { place.players(); place.restore(); }).not.toThrow();
  });

  it('gives the note its focus back, and a table cell that was typed in is typed in again', () => {
    const cell = (text) => `<table class="blk-table"><tbody><tr><td tabindex="0" contenteditable="false">${text}</td></tr></tbody></table>`;
    const root = editorWith(`<p>one</p>${cell('cell')}`);
    const td = root.querySelector('td');
    td.setAttribute('contenteditable', 'true');
    td.focus();
    expect(root.contains(document.activeElement)).toBe(true);
    caretAt(td.firstChild, 2);
    const place = holdPlace(root);
    root.innerHTML = `<p>new</p><p>one</p>${cell('cell')}`;
    expect(root.contains(document.activeElement)).toBe(false);
    place.restore();
    const now = root.querySelector('td');
    expect(document.activeElement).toBe(now);
    expect(now.getAttribute('contenteditable')).toBe('true');
    expect(window.getSelection().anchorNode).toBe(now.firstChild);
    expect(window.getSelection().anchorOffset).toBe(2);
    // A note nobody was in is not given the focus.
    document.activeElement.blur();
    window.getSelection().removeAllRanges();
    const idle = holdPlace(root);
    root.innerHTML = '<p>one</p>';
    idle.restore();
    expect(root.contains(document.activeElement)).toBe(false);
  });

  it('keeps a video of the same file as the player it was, and lets a new one be new', () => {
    const video = (name) => `<div class="link-block link-file"><video class="link-frame" src="nebula-media://note/a/${name}"></video></div>`;
    const root = editorWith(`<p>one</p>${video('vid-1.mp4')}${video('vid-2.mp4')}`);
    const [first, second] = root.querySelectorAll('video');
    const place = holdPlace(root);
    root.innerHTML = `<p>new</p>${video('vid-1.mp4')}<p>one</p>${video('vid-3.mp4')}${video('vid-1.mp4')}`;
    place.players();
    const now = [...root.querySelectorAll('video')];
    expect(now[0]).toBe(first);
    expect(now).not.toContain(second);
    expect(now[1].getAttribute('src')).toBe('nebula-media://note/a/vid-3.mp4');
    // The same file twice: one player there was, one it stays.
    expect(now[2]).not.toBe(first);
    expect(now[2].getAttribute('src')).toBe('nebula-media://note/a/vid-1.mp4');
    place.restore();
  });

  // The page has no layout here: each block is given a height, and its place follows from the scroller's.
  describe('on a page scrolled down', () => {
    function laidOut(html, scrollTop) {
      const scroller = document.createElement('div');
      const root = document.createElement('div');
      root.innerHTML = html;
      scroller.append(root);
      document.body.replaceChildren(scroller);
      let top = scrollTop;
      Object.defineProperty(scroller, 'scrollTop', { get: () => top, set: (v) => { top = v; }, configurable: true });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
        if (this === scroller) return { top: 100, bottom: 500, height: 400, width: 600, left: 0, right: 600 };
        if (this.parentElement !== root) return { top: 0, bottom: 0, height: 0, width: 0, left: 0, right: 0 };
        let y = 100 - top;
        for (let el = this.previousElementSibling; el; el = el.previousElementSibling) y += Number(el.dataset.h || 0);
        const h = Number(this.dataset.h || 0);
        return { top: y, bottom: y + h, height: h, width: 600, left: 0, right: 600 };
      });
      return { scroller, root };
    }
    const blocks = (names, h = 100) => names.map((n) => `<p data-h="${h}">${n}</p>`).join('');
    const ten = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'];
    const topOf = (el) => el.getBoundingClientRect().top;

    it('the block at the top of what is seen stands there again, though lines came or went above it', () => {
      const { scroller, root } = laidOut(blocks(ten), 330);
      // b3 is the first block seen: it begins 30 px above the top of the page's window.
      expect(topOf(root.children[3])).toBe(70);
      let place = holdPlace(root);
      root.innerHTML = `${blocks(['n1', 'n2'], 50)}${blocks(ten)}`;
      // Emptied and filled, the page was thrown somewhere else.
      scroller.scrollTop = 0;
      place.restore();
      expect(scroller.scrollTop).toBe(430);
      expect(root.children[5].textContent).toBe('b3');
      expect(topOf(root.children[5])).toBe(70);
      // And back up when they go again.
      place = holdPlace(root);
      root.innerHTML = blocks(ten);
      place.restore();
      expect(scroller.scrollTop).toBe(330);
      expect(topOf(root.children[3])).toBe(70);
    });

    it('a block above that grew or shrank where it stands does not move the reading either', () => {
      const { scroller, root } = laidOut(blocks(ten), 330);
      const place = holdPlace(root);
      root.innerHTML = `${blocks(['b0'])}<p data-h="260">b1 with much more in it</p>${blocks(ten.slice(2))}`;
      place.restore();
      expect(scroller.scrollTop).toBe(490);
      expect(topOf(root.children[3])).toBe(70);
    });

    it('stays as far down as it was when that block is gone, skips the canvases, and leaves the top of a note the top', () => {
      const { scroller, root } = laidOut(blocks(ten), 330);
      let place = holdPlace(root);
      root.innerHTML = blocks(['b0', 'b1', 'b2', 'x', 'y', 'z', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'more']);
      scroller.scrollTop = 0;
      place.restore();
      expect(scroller.scrollTop).toBe(330);
      // The canvases shapes and floating pictures lie on are as large as the note: never "the block at the top".
      const layer = '<div class="shape-layer" data-h="5000"></div>';
      root.innerHTML = `${layer}${blocks(ten)}`;
      scroller.scrollTop = 5330;
      place = holdPlace(root);
      root.innerHTML = `${layer}${blocks(['n1'], 40)}${blocks(ten)}`;
      place.restore();
      expect(scroller.scrollTop).toBe(5370);
      // At the very top nothing is held: a line that came above the first is seen.
      scroller.scrollTop = 0;
      place = holdPlace(root);
      root.innerHTML = `${layer}${blocks(['n1', 'n2'], 40)}${blocks(ten)}`;
      place.restore();
      expect(scroller.scrollTop).toBe(0);
    });
  });
});
