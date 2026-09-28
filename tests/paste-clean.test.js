/**
 * Words pasted from elsewhere take the note's font (owner, Bug Finding note,
 * 0.9.2): what they are stays, how another page dressed them goes.
 */
import { describe, it, expect } from 'vitest';
import { cleanPastedHtml, fromNebula, cleanNebulaHtml } from '../src/js/paste-clean.js';

describe('cleanPastedHtml', () => {
  it('drops the page\'s font, size and colour, keeps the words', () => {
    const out = cleanPastedHtml('<p style="font-family: Arial; font-size: 20px; color: rgb(0, 0, 0)"><span style="font-family: Georgia">Hello</span> world</p>');
    expect(out).toBe('<p>Hello world</p>');
  });

  it('keeps bold, italic, underline and strike, also when a page writes them as styles', () => {
    const out = cleanPastedHtml('<p><span style="font-weight:700">bold</span> <span style="font-style:italic">it</span> <b>b</b> <span style="text-decoration: underline">u</span> <s>s</s></p>');
    expect(out).toBe('<p><b>bold</b> <i>it</i> <b>b</b> <u>u</u> <s>s</s></p>');
  });

  it('keeps lists, headings, quotes and links; a link only to the web or mail', () => {
    const out = cleanPastedHtml('<h1 class="x">T</h1><ul><li>a</li></ul><blockquote>q</blockquote><a href="https://e.com" onclick="x()">l</a><a href="javascript:alert(1)">bad</a>');
    expect(out).toBe('<h1>T</h1><ul><li>a</li></ul><blockquote>q</blockquote><a href="https://e.com">l</a><a>bad</a>');
  });

  it('turns layout boxes into paragraphs and small headings into h3', () => {
    expect(cleanPastedHtml('<div>one</div><h5>small</h5>')).toBe('<p>one</p><h3>small</h3>');
  });

  it('removes what is not words at all', () => {
    expect(cleanPastedHtml('<style>p{}</style><p>x<img src="https://e.com/a.png"><script>bad()</script></p><!-- c -->')).toBe('<p>x</p>');
  });

  it('tells a copy from a Nebula note apart', () => {
    expect(fromNebula('<p><span class="c-red">x</span></p>')).toBe(true);
    expect(fromNebula('<hr class="blk-hr">')).toBe(true);
    expect(fromNebula('<p class="MsoNormal"><span style="color:red">x</span></p>')).toBe(false);
  });
});

describe('cleanNebulaHtml: a copy from a note, without the dress Chromium adds', () => {
  it('takes off the fixed ink and scrollbar colour a copy carries (one of the owner’s notes)', () => {
    const out = cleanNebulaHtml('<p style="scrollbar-color: var(--rule) transparent; color: rgb(17, 17, 17);"><span style="scrollbar-color: var(--rule) transparent; font-weight: 700;">Claude</span></p>');
    expect(out).toBe('<p><span style="font-weight: 700;">Claude</span></p>');
  });

  it('keeps Nebula’s classes, and drops the font a line had so it takes the new note’s', () => {
    const out = cleanNebulaHtml('<p><span class="c-red" style="color: rgb(200, 0, 0)">red</span> <span data-font-family="Noto Serif" style="font-size: 14px; font-family: Noto Serif;">words</span></p>');
    expect(out).toBe('<p><span class="c-red">red</span> words</p>');
  });

  it('leaves a shape’s fill and a picture’s size alone', () => {
    const shape = '<div class="shape rect" style="left: 1px; top: 2px; background: rgb(214, 228, 208); --shape-fill: rgb(214, 228, 208);"></div>';
    expect(cleanNebulaHtml(shape)).toBe(shape);
  });
});

