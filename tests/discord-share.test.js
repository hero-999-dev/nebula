/**
 * A note as the text Discord reads (1.0.4, src/js/discord-share.js): what Copy
 * for Discord puts on the clipboard. Discord's markdown is not a .md file's,
 * a message ends at 2000 characters, and nothing the text cannot carry may go
 * missing without being counted.
 */
import { describe, it, expect } from 'vitest';
import { canShare, toDiscord, splitForDiscord, forDiscord, MESSAGE_LIMIT } from '../src/js/discord-share.js';
import { GUIDE_NOTE } from '../src/js/seed-notes.js';
import { STRINGS } from '../src/js/i18n.js';

const ZW = '​';
/** The whole note as it is pasted, where it fits one message. */
const one = (content, title = '') => forDiscord({ content, title }).parts.join('\n=====\n');

const code = (src, lang) =>
  `<div class="blk-code" data-block-type="code" data-lang="${lang}" data-code="${encodeURIComponent(src)}" contenteditable="false">`
  + '<div class="code-head"><select class="code-lang"></select><button class="code-copy">Copy</button></div>'
  + '<pre class="code-body"><code class="code-src">painted</code></pre></div>';

describe('which note may leave for Discord', () => {
  it('a note of one’s own may', () => {
    expect(canShare({ id: 'a', title: 'Mine', content: '<p>x</p>' })).toBe(true);
    // Kept to one computer is about sync; copying it is the owner's own act.
    expect(canShare({ id: 'a', title: 'Mine', noSync: true })).toBe(true);
    expect(canShare({ id: 'a', title: 'Mine', archivedAt: 5 })).toBe(true);
  });
  it('never a black hole’s note', () => {
    expect(canShare({ id: 'h', title: 'Sealed', hole: 'z' })).toBe(false);
  });
  it('never anything while Nebula is locked', () => {
    expect(canShare({ id: 'a', title: 'Mine' }, { locked: true })).toBe(false);
  });
  it('never a note in the Trash', () => {
    expect(canShare({ id: 'a', title: 'Mine', deletedAt: 9 })).toBe(false);
  });
  it('never the guide, and never no note', () => {
    expect(canShare({ id: 'g', title: GUIDE_NOTE.title })).toBe(false);
    expect(canShare(null)).toBe(false);
    expect(canShare(undefined)).toBe(false);
  });
});

describe('a note as Discord reads it', () => {
  it('writes the title as the first heading, once', () => {
    expect(one('<h1>My note</h1><p>x</p>', 'My note')).toBe('# My note\n\nx');
    expect(one('<p>x</p>', 'My note')).toBe('# My note\n\nx');
    expect(one('<p>x</p>')).toBe('x');
  });

  it('keeps three levels of heading and makes a deeper one a bold line', () => {
    expect(one('<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><h5><strong>E</strong></h5><h6>F</h6><h2></h2>'))
      .toBe('# A\n\n## B\n\n### C\n\n**D**\n\n**E**\n\n**F**');
  });

  it('keeps bold, italic and strike, underlines with __, and makes a highlight bold', () => {
    expect(one('<p>a <strong>bold</strong> and <em>it</em> and <s>gone</s></p>')).toBe('a **bold** and *it* and ~~gone~~');
    expect(one('<p><span class="u-single">under</span> <span class="h-yellow">lit</span> <u>old</u></p>')).toBe('__under__ **lit** __old__');
    // Bold in bold is written once, and the spaces stay outside the marks.
    expect(one('<p><strong>a <span class="h-yellow">b</span></strong></p>')).toBe('**a b**');
    expect(one('<p>x<strong> y </strong>z</p>')).toBe('x **y** z');
  });

  it('writes code and an equation as their source', () => {
    expect(one('<p>call <span class="inline-code">x_y</span> or <code>a`b</code></p>')).toBe('call `x_y` or `` a`b ``');
    expect(one('<p>so <span class="inline-eq" data-tex="\\frac{a}{b}"><span class="katex">rendered</span></span></p>')).toBe('so `\\frac{a}{b}`');
  });

  it('keeps a link to the web, and only the words of one into the vault', () => {
    expect(one('<p><a href="https://example.com/a_b">the site</a></p>')).toBe('[the site](https://example.com/a_b)');
    expect(one('<p><a href="https://example.com/a_b">https://example.com/a_b</a></p>')).toBe('https://example.com/a_b');
    expect(one('<p>see <a class="note-mention" data-note="n1" href="#note-n1">@Other note</a></p>')).toBe('see @Other note');
    expect(one('<p><a href="nebula-media://note/n1/plan.pdf">the plan</a></p>')).toBe('the plan');
    // A mail address is no link in Discord, and is not lost with it.
    expect(one('<p><a href="mailto:ada@example.com?subject=x">write to Ada</a></p>')).toBe('write to Ada (ada@example.com)');
    expect(one('<p><a href="mailto:ada@example.com">ada@example.com</a></p>')).toBe('ada@example.com');
    // A video embedded from the web is its watch address; the player is not text.
    expect(one('<div class="link-block link-embed link-embed--video"><a class="link-url" href="https://www.youtube.com/watch?v=abc">https://www.youtube.com/watch?v=abc</a><iframe src="https://www.youtube.com/embed/abc"></iframe></div>'))
      .toBe('https://www.youtube.com/watch?v=abc');
    expect(one('<div class="link-block"><a href="https://example.com/x">https://example.com/x</a><div class="link-card__title">A page</div></div>'))
      .toBe('[A page](https://example.com/x)');
  });

  it('writes lists, nested by two spaces', () => {
    expect(one('<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul><ol><li>first</li><li>second</li></ol>'))
      .toBe('- one\n  - inner\n- two\n\n1. first\n2. second');
  });

  it('draws a checklist with boxes, a quote with > and a divider as a line', () => {
    expect(one('<div class="blk-todo done">done</div><div class="blk-todo">open</div>')).toBe('☑ done\n\n☐ open');
    expect(one('<blockquote><p>said</p><p>twice</p></blockquote>')).toBe('> said\n> \n> twice');
    expect(one('<p>a</p><hr><p>b</p>')).toBe('a\n\n───\n\nb');
  });

  it('fences code with its language, and parts three backticks inside it', () => {
    expect(one(code('a = `x`\nb', 'python'))).toBe('```python\na = `x`\nb\n```');
    expect(one(code('plain', 'plain'))).toBe('```\nplain\n```');
    expect(one(code('```', 'plain'))).toBe(`\`\`\`\n\`${ZW}\`\`\n\`\`\``);
  });

  it('lines a table up in a code block', () => {
    const table = '<div class="blk-table"><table><tbody><tr><td>Name</td><td>Age</td></tr><tr><td>Ada<br>L.</td><td>36</td></tr><tr><td>Bo</td><td></td></tr></tbody></table></div>';
    expect(one(table)).toBe('```\nName    Age\n──────  ───\nAda L.  36\nBo\n```');
    // A merged cell stands in its first place.
    const merged = '<div class="blk-table"><table><tbody><tr><td colspan="2">Both</td></tr><tr><td>a</td><td>b</td></tr></tbody></table></div>';
    expect(one(merged)).toBe('```\nBoth\n────  ─\na     b\n```');
  });

  it('writes no empty row and no empty column of a table, and no rule under a first row with no words', () => {
    const cell = (words) => `<td contenteditable="true">${words || '<br>'}</td>`;
    const row = (...cells) => `<tr>${cells.map(cell).join('')}</tr>`;
    const table = (...rows) => `<div class="blk-table"><table><tbody>${rows.join('')}</tbody></table></div>`;
    // The owner's trial (2026-11-15): twelve columns, eight rows, two words in the second row.
    const wide = (a, b) => row(a, b, '', '', '', '', '', '', '', '', '', '');
    expect(one(table(wide(), wide('Deneme', 'Deneme&nbsp;'), wide(), wide(), wide(), wide(), wide(), wide())))
      .toBe('```\nDeneme  Deneme\n```');
    expect(one(table(row('', '', ''), row('a', '', 'b'), row('', '', ''), row('cc', '', 'd')))).toBe('```\na   b\ncc  d\n```');
    // A first row with words is still the head, over what is left.
    expect(one(table(row('Name', '', 'Age'), row('', '', ''), row('Ada', '', '36')))).toBe('```\nName  Age\n────  ───\nAda   36\n```');
    expect(forDiscord({ content: table(row('', ''), row('', '')) }).parts).toEqual([]);
  });

  it('does not write the name of a note never named', () => {
    expect(one('<p>x</p>', 'Untitled')).toBe('x');
    for (const name of STRINGS.Untitled) expect(one('<p>x</p>', name)).toBe('x');
    expect(one('<p>x</p>', 'Untitled plans')).toBe('# Untitled plans\n\nx');
  });

  it('escapes what Discord would read as marks, and leaves an address whole', () => {
    expect(one('<p>2 * 3 = 6, snake_case, [x] and `tick`</p>')).toBe('2 \\* 3 = 6, snake\\_case, \\[x\\] and \\`tick\\`');
    expect(one('<p>a ||spoiler|| and ~~not struck~~, a | b ~ c</p>')).toBe('a \\|\\|spoiler\\|\\| and \\~\\~not struck\\~\\~, a | b ~ c');
    expect(one('<p>see https://example.com/a_b_c*d now</p>')).toBe('see https://example.com/a_b_c*d now');
  });

  it('never lets plain words become a heading, a quote or a list', () => {
    expect(one('<p># not a heading</p>')).toBe('\\# not a heading');
    expect(one('<p>-# not small print</p>')).toBe('\\-# not small print');
    expect(one('<p>&gt; not a quote</p>')).toBe('\\> not a quote');
    expect(one('<p>- not a list<br>+ nor this</p>')).toBe('\\- not a list\n\\+ nor this');
    expect(one('<p>1. not numbered</p>')).toBe('1\\. not numbered');
    // Inside the words they are only themselves.
    expect(one('<p>a - b, 3 > 2, C# 1.0</p>')).toBe('a - b, 3 > 2, C# 1.0');
  });

  it('defuses @everyone, @here and a written-out mention', () => {
    expect(one('<p>hello @everyone and @here</p>')).toBe(`hello @${ZW}everyone and @${ZW}here`);
    expect(one('<p>&lt;@123&gt; and &lt;@&amp;9&gt;</p>')).toBe(`<${ZW}@123> and <${ZW}@&9>`);
    expect(one('', '@everyone read this')).toBe(`# @${ZW}everyone read this`);
  });
});

describe('what the text cannot carry', () => {
  it('lists the note’s own pictures in their order, and writes a picture from the web as its address', () => {
    const html = '<figure class="note-image"><img src="data:image/png;base64,AAAA" alt="one"><figcaption>the caption</figcaption></figure>'
      + '<p><img src="https://example.com/p.png" alt=""></p>'
      + '<figure class="note-image"><img src="nebula-media://note/n1/p.jpg" alt=""></figure>'
      + '<div class="link-block"><a href="https://example.com">x</a><img src="data:image/png;base64,BBBB" alt=""></div>';
    const made = forDiscord({ content: html });
    expect(made.pictures).toEqual([
      { src: 'data:image/png;base64,AAAA', alt: 'one' },
      { src: 'nebula-media://note/n1/p.jpg', alt: '' },
    ]);
    expect(made.parts).toEqual(['*the caption*\n\nhttps://example.com/p.png\n\n[x](https://example.com)']);
  });

  it('counts shapes, arrows, widgets and attached files, and writes none of a shape’s or a widget’s words', () => {
    const html = '<p>before</p>'
      + '<div class="shape-layer"><div class="shape rect"><svg class="shape-svg"></svg><div class="shape-text">in a shape</div></div>'
      + '<svg><path class="arrow-line"></path><circle class="arrow-end"></circle></svg></div>'
      + '<figure class="note-image note-image--inline note-widget" data-widget="calc"><div>7 8 9</div></figure>'
      + '<div class="link-block link-attach" data-name="plan.pdf"><a href="nebula-media://note/n1/plan.pdf">plan.pdf</a></div>'
      + '<p>after</p>';
    const made = forDiscord({ content: html });
    expect(made.left).toEqual({ shapes: 2, widgets: 1, files: 1 });
    // The file stays as a line with its name.
    expect(made.parts).toEqual(['before\n\n📎 plan.pdf\n\nafter']);
  });

  it('counts nothing in a note of words alone, and makes no part of an empty note', () => {
    expect(toDiscord('<p>words</p>').left).toEqual({ shapes: 0, widgets: 0, files: 0 });
    expect(forDiscord({ content: '', title: '' })).toEqual({ parts: [], pictures: [], left: { shapes: 0, widgets: 0, files: 0 } });
    expect(forDiscord({ content: '<p><br></p>' }).parts).toEqual([]);
    expect(forDiscord().parts).toEqual([]);
  });
});

describe('a note longer than one message', () => {
  it('one message is 2000 characters', () => {
    expect(MESSAGE_LIMIT).toBe(2000);
  });

  it('packs whole blocks into a part, an empty line between them', () => {
    const blocks = [{ text: 'a'.repeat(20) }, { text: 'b'.repeat(20) }, { text: 'c'.repeat(20) }];
    expect(splitForDiscord(blocks, 50)).toEqual([`${'a'.repeat(20)}\n\n${'b'.repeat(20)}`, 'c'.repeat(20)]);
    expect(splitForDiscord(blocks, 64)).toEqual([blocks.map((b) => b.text).join('\n\n')]);
    expect(splitForDiscord([], 50)).toEqual([]);
  });

  it('never cuts a block that fits a part by itself', () => {
    const blocks = [{ text: 'w '.repeat(15).trim() }, { code: 'x = 1\ny = 2\nz = 3', lang: 'js' }, { text: 'tail' }];
    const parts = splitForDiscord(blocks, 34);
    expect(parts).toEqual(['w '.repeat(15).trim(), '```js\nx = 1\ny = 2\nz = 3\n```\n\ntail']);
  });

  it('cuts a paragraph longer than a part at its lines, then at its spaces', () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const parts = splitForDiscord([{ text: words }], 50);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(50);
    expect(parts.join(' ')).toBe(words);

    const quote = Array.from({ length: 12 }, (_, i) => `> line ${i}`).join('\n');
    const lines = splitForDiscord([{ text: quote }], 40);
    for (const part of lines) {
      expect(part.length).toBeLessThanOrEqual(40);
      // Every line of every part is still a quote.
      for (const line of part.split('\n')) expect(line.startsWith('> ')).toBe(true);
    }
    expect(lines.join('\n')).toBe(quote);
  });

  it('fences a code block longer than a part again in each part', () => {
    const src = Array.from({ length: 10 }, (_, i) => `line ${i};`).join('\n');
    const parts = splitForDiscord([{ code: src, lang: 'js' }], 40);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(40);
      expect(part.startsWith('```js\n')).toBe(true);
      expect(part.endsWith('\n```')).toBe(true);
    }
    expect(parts.map((part) => part.slice(6, -4)).join('\n')).toBe(src);
  });

  it('cuts words with no space where the room ends, and never one character in two', () => {
    const parts = splitForDiscord([{ text: '😀'.repeat(30) }], 25);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(25);
      expect(/[\uD800-\uDBFF]$/.test(part)).toBe(false);
    }
    expect(parts.join('')).toBe('😀'.repeat(30));
  });

  it('keeps every part of a long note within one Discord message and loses no word', () => {
    const paragraphs = Array.from({ length: 60 }, (_, i) => `<p>Paragraph ${i} ${'lorem ipsum dolor sit amet '.repeat(4).trim()}</p>`).join('');
    const { parts } = forDiscord({ title: 'Long', content: `${paragraphs}${code('y = 2\n'.repeat(500), 'python')}` });
    expect(parts.length).toBeGreaterThan(3);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(MESSAGE_LIMIT);
    const all = parts.join('\n');
    for (let i = 0; i < 60; i += 1) expect(all).toContain(`Paragraph ${i} lorem`);
    expect(all.match(/y = 2/g).length).toBe(500);
  });
});
