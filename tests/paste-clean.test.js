/**
 * Words pasted from elsewhere take the note's font (owner, Bug Finding note,
 * 0.9.2): what they are stays, how another page dressed them goes.
 */
import { describe, it, expect } from 'vitest';
import { cleanPastedHtml, fromNebula, cleanNebulaHtml, dressInNoteFont, pastedSizePx } from '../src/js/paste-clean.js';

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

  const dom = (html) => { const el = document.createElement('div'); el.innerHTML = html; return el; };

  it('keeps Nebula’s classes; the app’s own font and size go, so default words take the new note’s', () => {
    const out = cleanNebulaHtml('<p style="font-family: Charter, &quot;Iowan Old Style&quot;, serif; font-size: 14px;"><span class="c-red" style="color: rgb(200, 0, 0); font-family: Charter, serif;">red</span> words</p>');
    expect(out).toBe('<p><span class="c-red">red</span> words</p>');
  });

  it('keeps a font and a size somebody chose (0.9.4: a Consolas note pasted elsewhere stays Consolas)', () => {
    const out = dom(cleanNebulaHtml(
      '<p style="font-family: Charter, serif; font-size: 14px;"><span style="font-family: Consolas, &quot;Cascadia Mono&quot;, monospace; font-size: 14px; color: rgb(17, 17, 17);">mono words</span>'
      + ' <span style="font-family: Charter, serif; font-size: 22px;">big</span></p>'));
    const [mono, big] = out.querySelectorAll('span');
    expect(mono.style.fontFamily).toMatch(/^Consolas/);
    expect(mono.style.fontSize).toBe('');
    expect(mono.style.color).toBe('');
    expect(big.style.fontSize).toBe('22px');
    expect(big.style.fontFamily).toBe('');
    expect(out.querySelector('p').hasAttribute('style')).toBe(false);
  });

  it('does not freeze a heading’s size or the look of inline code', () => {
    const out = dom(cleanNebulaHtml(
      '<h2 style="font-size: 24.5px; font-family: Charter, serif;"><span style="font-size: 24.5px;">Title</span></h2>'
      + '<p><span class="inline-code" style="font-family: &quot;Cascadia Code&quot;, Consolas, monospace; font-size: 12.6px;">code</span></p>'));
    expect(out.querySelector('[style]')).toBeNull();
  });

  it('can still take every font off', () => {
    expect(cleanNebulaHtml('<p><span style="font-family: Consolas, monospace;">x</span></p>', { keepFonts: false })).toBe('<p>x</p>');
  });

  it('leaves a shape’s fill and a picture’s size alone', () => {
    const shape = '<div class="shape rect" style="left: 1px; top: 2px; background: rgb(214, 228, 208); --shape-fill: rgb(214, 228, 208);"></div>';
    expect(cleanNebulaHtml(shape)).toBe(shape);
  });
});

describe('dressInNoteFont: pasted lines are written in the note’s writing font (0.9.4)', () => {
  const dom = (html) => { const el = document.createElement('div'); el.innerHTML = html; return el; };
  const font = { family: 'Consolas, "Cascadia Mono", monospace', size: 16 };

  it('leaves the paste alone in a note with no writing font', () => {
    expect(dressInNoteFont('<p>x</p>', null)).toBe('<p>x</p>');
    expect(dressInNoteFont('<p>x</p>', {})).toBe('<p>x</p>');
  });

  it('gives every pasted line the font and size; a heading the face only', () => {
    const out = dom(dressInNoteFont('<h2>Title</h2><p>one <b>bold</b></p><ul><li>item<ul><li>inner</li></ul></li></ul>', font));
    const spans = [...out.querySelectorAll('span')];
    expect(spans.map((s) => s.textContent)).toEqual(['Title', 'one bold', 'item', 'inner']);
    expect(spans.every((s) => /^Consolas/.test(s.style.fontFamily))).toBe(true);
    expect(spans.map((s) => s.style.fontSize)).toEqual(['', '16px', '16px', '16px']);
    // What the words are is untouched: the bold, the list in the item.
    expect(out.querySelector('p b').textContent).toBe('bold');
    expect(out.querySelector('li > ul > li').textContent).toBe('inner');
    expect(out.textContent).toBe('Titleone bolditeminner');
  });

  it('wraps loose words only when they land on an empty line', () => {
    expect(dressInNoteFont('a few <b>words</b>', font)).toBe('a few <b>words</b>');
    const out = dom(dressInNoteFont('a few <b>words</b>', font, { loose: true }));
    expect(out.children.length).toBe(1);
    expect(out.firstElementChild.tagName).toBe('SPAN');
    expect(out.textContent).toBe('a few words');
  });

  it('a font that came along from another note stays inside it and wins', () => {
    const out = dom(dressInNoteFont('<p><span style="font-family: Georgia, serif;">kept</span> plain</p>', font));
    const outer = out.querySelector('p > span');
    expect(outer.style.fontFamily).toMatch(/^Consolas/);
    expect(outer.querySelector('span').style.fontFamily).toMatch(/^Georgia/);
  });

  it('does not reach into code', () => {
    expect(dressInNoteFont('<pre>let x = 1;</pre>', font)).toBe('<pre>let x = 1;</pre>');
  });
});

describe('Paste original format: the size the words were copied in, and bold and the like (0.9.4)', () => {
  // As Chromium hands over a paragraph copied from a dark page.
  const DARK = '<span style="color: rgb(214, 210, 219); font-family: &quot;Instrument Sans&quot;, system-ui, -apple-system, &quot;Segoe UI&quot;, sans-serif; font-size: 17px; background-color: rgb(10, 10, 12);">Words of a <b>dark</b> <span style="font-style: italic; text-decoration: underline;">page</span></span><br style="color: rgb(214, 210, 219); font-size: 17px; background-color: rgb(10, 10, 12); animation-duration: 0.01ms !important;">';

  it('keeps the size, on the words that had it — one span for the line', () => {
    const out = cleanPastedHtml(DARK, { keepSize: true });
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect(doc.body.textContent).toBe('Words of a dark page');
    const spans = doc.body.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    expect(spans[0].getAttribute('style')).toBe('font-size: 17px;');
    expect(spans[0].textContent).toBe('Words of a dark page');
    // The line break that carried a dress of its own is a plain one, outside the span.
    expect(out).toMatch(/<\/span><br>$/);
  });

  it('keeps bold, italic and underline, as every paste does', () => {
    const doc = new DOMParser().parseFromString(cleanPastedHtml(DARK, { keepSize: true }), 'text/html');
    expect(doc.body.querySelector('b, strong').textContent).toBe('dark');
    expect(doc.body.querySelector('i, em').textContent).toBe('page');
    expect(doc.body.querySelector('u').textContent).toBe('page');
  });

  it('takes no font of the source, no colour, no ground, no animation', () => {
    const out = cleanPastedHtml(DARK, { keepSize: true });
    expect(out).not.toMatch(/font-family|Instrument|color|background|animation|rgb\(/);
  });

  it('is the paste as Nebula format when the size is not asked for', () => {
    expect(cleanPastedHtml(DARK)).not.toMatch(/style=/);
    expect(cleanPastedHtml(DARK, { keepSize: false })).toBe(cleanPastedHtml(DARK));
  });

  it('gives each line its own size, and words of two sizes in one line a span each', () => {
    const out = cleanPastedHtml('<div style="font-size: 20px"><p>one</p><p style="font-size: 12pt">two <span style="font-size: 30px">three</span></p></div><ul><li style="font-size: large">item</li></ul><p>none</p>', { keepSize: true });
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect([...doc.body.querySelectorAll('span')].map((x) => `${x.textContent.trim()}=${x.style.fontSize}`)).toEqual(['one=20px', 'two=16px', 'three=30px', 'item=18px']);
    expect(doc.body.querySelectorAll('p')).toHaveLength(3);
    expect(doc.body.querySelector('li span')).not.toBeNull();
  });

  it('leaves a heading the note’s size for one, and code its own', () => {
    const out = cleanPastedHtml('<h1 style="font-size: 40px">Title</h1><h5 style="font-size: 11px">Small title</h5><pre style="font-size: 9px">code();</pre><p><code style="font-size: 9px">x</code> <font size="5">loud</font></p>', { keepSize: true });
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect([...doc.body.querySelectorAll('span')].map((x) => `${x.textContent}=${x.style.fontSize}`)).toEqual(['loud=24px']);
    expect(doc.body.querySelector('h1').outerHTML).toBe('<h1>Title</h1>');
    expect(doc.body.querySelector('pre').outerHTML).toBe('<pre>code();</pre>');
  });

  it('reads a size in pixels, points, rem, a word or a <font size>; not one that depends on its surroundings', () => {
    expect(pastedSizePx('17px')).toBe(17);
    expect(pastedSizePx('16.6px')).toBe(17);
    expect(pastedSizePx('12pt')).toBe(16);
    expect(pastedSizePx('1.5rem')).toBe(24);
    expect(pastedSizePx('x-large')).toBe(24);
    expect(pastedSizePx('', '7')).toBe(48);
    for (const none of ['', '1.2em', '120%', 'larger', 'inherit', 'calc(1px + 2px)', null, undefined]) expect(pastedSizePx(none)).toBe(0);
    expect(pastedSizePx('', '9')).toBe(0);
  });

  it('keeps a size inside what a note can hold: 8 to 96', () => {
    expect(pastedSizePx('2px')).toBe(8);
    expect(pastedSizePx('400px')).toBe(96);
    const out = cleanPastedHtml('<p style="font-size: 999px; position: fixed" onclick="x()">big</p><script>alert(1)</script>', { keepSize: true });
    expect(out).toBe('<p><span style="font-size: 96px;">big</span></p>');
  });

  it('keeps every paragraph of a box of them (it came out empty: the body was taken apart with the box)', () => {
    const box = '<div><p>one</p><p>two</p><p>three</p></div>';
    expect(cleanPastedHtml(box)).toBe('<p>one</p><p>two</p><p>three</p>');
    expect(cleanPastedHtml(`<article><section>${box}</section><div><p>four</p></div></article>`)).toBe('<p>one</p><p>two</p><p>three</p><p>four</p>');
  });
});
