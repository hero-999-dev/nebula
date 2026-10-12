/**
 * A card, a video or a code block taken by the mouse (0.9.4, block-drag.js):
 * what a press takes a block by, and where a gap puts it. The dragging itself
 * is in tests/e2e/layout.mjs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { gripOf, spotOf, placeBlock, standsAlone, PLAYER_STRIP, DRAG_BLOCK } from '../src/js/block-drag.js';

const CODE = '<div class="blk-code" id="code" contenteditable="false"><div class="code-head" id="head"><select class="code-lang" id="lang"></select><span class="code-hint" id="hint">hint</span>'
  + '<button type="button" class="code-copy" id="copy">Copy</button><button type="button" class="code-del" id="del">✕</button></div><pre class="code-body" id="body"><code class="code-src" id="src" contenteditable="true">let a = 1</code></pre></div>';
const BOOKMARK = '<div class="link-block link-bookmark" id="mark" contenteditable="false"><a class="link-card" id="mark-card" href="https://example.com/"><strong class="link-card__title" id="mark-title">a page</strong></a>'
  + '<button type="button" class="link-del" id="mark-del" data-link-remove="true">×</button></div>';
const EMBED = '<div class="link-block link-embed" id="embed" contenteditable="false"><a class="link-card" id="embed-card" href="https://example.com/">a page</a><button type="button" class="link-del">×</button>'
  + '<webview class="link-frame" id="frame"></webview><span class="embed-h" id="edge" data-edge="se"></span></div>';
const VIDEO = '<div class="link-block link-embed link-file" id="film" contenteditable="false"><a class="link-card" id="film-card"><strong class="link-card__title">clip.mp4</strong></a><button type="button" class="link-del">×</button>'
  + '<video class="link-frame" id="player" controls></video><div class="video-bar" id="bar"><button type="button" id="back" data-video="back">↩ 10s</button><span class="video-now" id="now">0:00</span></div></div>';

let root;
const $ = (id) => root.querySelector(`#${id}`);
const order = (el = root) => [...el.children].map((e) => e.id || e.tagName.toLowerCase()).join(',');
function note(html) {
  root = document.createElement('div');
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

describe('what a block is taken by', () => {
  beforeEach(() => note(`<p id="a">one</p>${CODE}${BOOKMARK}${EMBED}${VIDEO}<figure class="note-image" id="pic"></figure>`));

  it('a card by its title line, and by nothing else of it', () => {
    expect(gripOf($('mark-card'), 0)).toBe($('mark'));
    expect(gripOf($('mark-title'), 0)).toBe($('mark'));
    expect(gripOf($('mark-del'), 0)).toBeNull();
    expect(gripOf($('embed-card'), 0)).toBe($('embed'));
    // An embedded page keeps the mouse to itself, and its edges resize it.
    expect(gripOf($('frame'), 0)).toBeNull();
    expect(gripOf($('edge'), 0)).toBeNull();
  });

  it('a code block by its top line — not by the language, Copy, ✕ or the code', () => {
    expect(gripOf($('head'), 0)).toBe($('code'));
    expect(gripOf($('hint'), 0)).toBe($('code'));
    for (const id of ['lang', 'copy', 'del', 'src', 'body']) expect(gripOf($(id), 0), id).toBeNull();
  });

  it('a video file by its title line and by its picture, above the strip of its own controls', () => {
    const player = $('player');
    player.getBoundingClientRect = () => ({ left: 0, top: 100, right: 640, bottom: 460, width: 640, height: 360 });
    Object.defineProperty(player, 'offsetWidth', { value: 640 });
    expect(gripOf($('film-card'), 0)).toBe($('film'));
    expect(gripOf(player, 120)).toBe($('film'));
    expect(gripOf(player, 460 - PLAYER_STRIP - 1)).toBe($('film'));
    expect(gripOf(player, 460 - PLAYER_STRIP + 1)).toBeNull();
    expect(gripOf(player, 455)).toBeNull();
    // The bar under it is the bar's.
    expect(gripOf($('back'), 0)).toBeNull();
    expect(gripOf($('now'), 0)).toBeNull();
  });

  it('on a zoomed page the strip is as much taller, and never more than half a small player', () => {
    const player = $('player');
    Object.defineProperty(player, 'offsetWidth', { value: 320, configurable: true });
    player.getBoundingClientRect = () => ({ left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360 });
    expect(gripOf(player, 360 - PLAYER_STRIP * 2 - 1)).toBe($('film'));
    expect(gripOf(player, 360 - PLAYER_STRIP * 2 + 1)).toBeNull();
    Object.defineProperty(player, 'offsetWidth', { value: 100, configurable: true });
    player.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 60, width: 100, height: 60 });
    expect(gripOf(player, 29)).toBe($('film'));
    expect(gripOf(player, 31)).toBeNull();
  });

  it('nothing else: a line of words, a picture, nothing at all', () => {
    expect(gripOf($('a'), 0)).toBeNull();
    expect(gripOf($('pic'), 0)).toBeNull();
    expect(gripOf(null, 0)).toBeNull();
    expect($('pic').matches(DRAG_BLOCK)).toBe(false);
  });
});

describe('where a gap puts a block', () => {
  beforeEach(() => note(`<p id="a">one</p>${CODE}<p id="b">two</p>${BOOKMARK}<p id="c">three</p>`
    + '<div class="blk-cols" id="cols"><div class="blk-col" id="left"><p id="l">left</p></div><hr class="blk-vr" id="vr"><div class="blk-col" id="right"><p id="r">right</p></div></div><div class="c-red" id="wrap">'
    + '<div class="blk-code" id="wrapped"></div></div>'));

  it('before the block under the mark', () => {
    expect(placeBlock($('code'), { parent: root, before: $('c'), after: $('mark') })).toBe(true);
    expect(order()).toBe('a,b,mark,code,c,cols,wrap');
  });

  it('after the block above it, when there is none under the mark — and then a line to go on with', () => {
    expect(placeBlock($('mark'), { parent: $('right'), before: null, after: $('r') })).toBe(true);
    expect(order($('right'))).toBe('r,mark,p');
    expect($('right').lastElementChild.innerHTML).toBe('<br>');
    expect(order()).toBe('a,code,b,c,cols,wrap');
  });

  it('into a flow that holds nothing', () => {
    $('r').remove();
    expect(placeBlock($('code'), { parent: $('right'), before: null, after: null })).toBe(true);
    expect(order($('right'))).toBe('code,p');
  });

  it('nowhere, where it stands there already or the gap is gone', () => {
    expect(spotOf($('code'), { parent: root, before: $('b'), after: $('code') })).toBeNull();
    expect(spotOf($('code'), { parent: root, before: $('code'), after: $('a') })).toBeNull();
    expect(placeBlock($('code'), { parent: root, before: null, after: $('a') })).toBe(false);
    const gone = $('c');
    gone.remove();
    expect(placeBlock($('code'), { parent: root, before: gone, after: null })).toBe(false);
    expect(placeBlock($('code'), null)).toBe(false);
    expect(order()).toBe('a,code,b,mark,cols,wrap');
  });

  it('keeps what the block holds: the code, the card’s address', () => {
    placeBlock($('code'), { parent: root, before: $('a'), after: null });
    placeBlock($('mark'), { parent: root, before: $('code'), after: null });
    expect(order()).toBe('mark,code,a,b,c,cols,wrap');
    expect($('src').textContent).toBe('let a = 1');
    expect($('mark-card').getAttribute('href')).toBe('https://example.com/');
  });

  it('is taken only where it stands in a row of its own: on the note, or in a column', () => {
    expect(standsAlone($('code'), root)).toBe(true);
    placeBlock($('code'), { parent: $('left'), before: $('l'), after: null });
    expect(standsAlone($('code'), root)).toBe(true);
    expect(standsAlone($('wrapped'), root)).toBe(false);
  });
});
