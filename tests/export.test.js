/**
 * Exporting a note.
 *
 * The reported problem: printing went through `window.print()` and the OS
 * dialog, so the user's PDF came out of "Microsoft: Print To PDF" looking like
 * a picture of the app, while Notion's export of the same document was laid
 * out as a document. These are the conversions that make a real export.
 */
import { describe, it, expect } from 'vitest';
import { toMarkdown, toHtml, toPrintDocument, safeFileName, FORMATS } from '../src/js/export.js';

const code = (src, lang) =>
  `<div class="blk-code" data-block-type="code" data-lang="${lang}" data-code="${encodeURIComponent(src)}" contenteditable="false">`
  + '<div class="code-head"><select class="code-lang"></select><button class="code-copy">Copy</button></div>'
  + '<pre class="code-body"><code class="code-src">painted</code></pre></div>';

describe('toMarkdown', () => {
  it('writes the title as the first heading, like Notion', () => {
    expect(toMarkdown('<p>body</p>', 'My note')).toBe('# My note\n\nbody\n');
  });

  it('keeps the heading levels', () => {
    const md = toMarkdown('<h1>One</h1><h2>Two</h2><h3>Three</h3>');
    expect(md).toBe('# One\n\n## Two\n\n### Three\n');
  });

  it('writes both kinds of list, and nests them', () => {
    expect(toMarkdown('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b\n');
    expect(toMarkdown('<ol><li>a</li><li>b</li></ol>')).toBe('1. a\n2. b\n');
    expect(toMarkdown('<ul><li>a<ul><li>inner</li></ul></li></ul>')).toBe('- a\n  - inner\n');
  });

  it('writes to-dos as checkboxes, ticked or not', () => {
    expect(toMarkdown('<div class="blk-todo done">done</div><div class="blk-todo">open</div>'))
      .toBe('- [x] done\n\n- [ ] open\n');
  });

  it('fences a code block with its language, from the SOURCE not the painting', () => {
    // The block on screen is highlighted spans; the source lives in data-code
    // and is the only thing worth exporting.
    const md = toMarkdown(code('print("hi")', 'python'));
    expect(md).toBe('```python\nprint("hi")\n```\n');
    expect(md).not.toContain('painted');
  });

  it('leaves the language off a plain block', () => {
    expect(toMarkdown(code('x', 'plain'))).toBe('```\nx\n```\n');
  });

  it('writes quotes, dividers and inline marks', () => {
    expect(toMarkdown('<blockquote>quoted</blockquote>')).toBe('> quoted\n');
    expect(toMarkdown('<hr class="blk-hr">')).toBe('---\n');
    expect(toMarkdown('<p><strong>b</strong> and <em>i</em> and <s>s</s></p>'))
      .toBe('**b** and *i* and ~~s~~\n');
    expect(toMarkdown('<p>see <span class="inline-code">code</span></p>')).toBe('see `code`\n');
    expect(toMarkdown('<p><a href="https://x.dev">link</a></p>')).toBe('[link](https://x.dev)\n');
  });

  it('writes an equation as its LaTeX, never as the rendered maths', () => {
    const html = '<p>x <span class="inline-eq" data-tex="\frac{a}{b}"><span class="katex">rendered</span></span></p>';
    expect(toMarkdown(html)).toBe('x $\frac{a}{b}$\n');
  });

  it('leaves shapes out — they are not prose', () => {
    const html = '<div class="shape-layer"><div class="shape-text">Heyoooo</div></div><p>real</p>';
    expect(toMarkdown(html)).toBe('real\n');
  });

  it('escapes what would change meaning, and leaves prose alone', () => {
    expect(toMarkdown('<p>2 * 3 and _under_</p>')).toBe('2 \\* 3 and \\_under\\_\n');
    // Escaping every punctuation mark turned "A sentence." into "A sentence\."
    // — correct markdown, unreadable prose.
    expect(toMarkdown('<p>A sentence. And another!</p>')).toBe('A sentence. And another!\n');
  });

  it('does not repeat the title when the note opens with it as a heading', () => {
    expect(toMarkdown('<h1>Report</h1><p>body</p>', 'Report')).toBe('# Report\n\nbody\n');
    // A different first heading is kept — that one is not the title.
    expect(toMarkdown('<h1>Intro</h1><p>body</p>', 'Report')).toBe('# Report\n\n# Intro\n\nbody\n');
  });

  it('is empty for an empty note, not a crash', () => {
    expect(toMarkdown('')).toBe('\n');
    expect(toMarkdown(null)).toBe('\n');
  });
});

describe('toHtml', () => {
  it('is one self-contained file with nothing to fetch', () => {
    const html = toHtml('<p>hello</p>', 'Note');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<link|<script|src="http/);
    expect(html).toContain('<h1>Note</h1>');
    expect(html).toContain('<p>hello</p>');
  });

  it('turns a code block back into pre/code carrying the source', () => {
    const html = toHtml(code('let x = 1;', 'javascript'));
    expect(html).toContain('<pre><code class="language-javascript">let x = 1;</code></pre>');
    expect(html).not.toContain('code-head');
  });

  it('escapes the title rather than letting it become markup', () => {
    expect(toHtml('<p>x</p>', '<img src=x onerror=alert(1)>'))
      .toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('safeFileName', () => {
  it('replaces what a filesystem would refuse', () => {
    expect(safeFileName('a/b:c*d?e"f<g>h|i', 'md')).toBe('a-b-c-d-e-f-g-h-i.md');
  });

  it('never produces a hidden or empty name', () => {
    expect(safeFileName('...hidden', 'md')).toBe('hidden.md');
    expect(safeFileName('   ', 'html')).toBe('Untitled.html');
    expect(safeFileName(null, 'pdf')).toBe('Untitled.pdf');
  });

  it('keeps names short enough for any path', () => {
    expect(safeFileName('x'.repeat(300), 'md').length).toBeLessThanOrEqual(83);
  });
});

describe('FORMATS', () => {
  it('offers exactly Markdown, HTML and PDF', () => {
    // No CSV: Notion's CSV is for database views and Nebula has no table block,
    // so it would be an empty file with a confident name.
    expect(FORMATS.map((f) => f.id)).toEqual(['md', 'html', 'pdf']);
    expect(FORMATS.every((f) => f.label && f.ext)).toBe(true);
  });
});

/**
 * The document the PDF writer prints.
 *
 * Exporting used to print the LIVE window, which forced a choice: a page's
 * margin band is filled from a document background colour Chromium captures at
 * load, so on a dark app `@page { margin: 12.7mm }` framed every page in
 * violet. The only way to a white sheet was `@page { margin: 0 }` — and a page
 * margin is the only kind that repeats, so the second page began at the paper's
 * edge. A document that is white from the moment it loads has neither problem.
 */
describe('toPrintDocument', () => {
  it('is a complete document', () => {
    const out = toPrintDocument({ title: 'Note', body: '<p>hello</p>' });
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('<p>hello</p>');
  });

  it('carries the page margin that repeats on every page', () => {
    expect(toPrintDocument({ margin: '12.7mm' })).toContain('@page { size: A4; margin: 12.7mm; }');
  });

  it('loads light, so the sheet is white before anything is drawn', () => {
    expect(toPrintDocument({})).toContain('data-theme="white"');
  });

  it('heads the page with the note title', () => {
    const out = toPrintDocument({ title: 'Bug Report', body: '<p>x</p>' });
    expect(out).toContain('<div class="print-title">Bug Report</div>');
    expect(out.indexOf('print-title')).toBeLessThan(out.indexOf('<p>x</p>'));
  });

  it('escapes a title that contains markup', () => {
    expect(toPrintDocument({ title: '<script>x</script>' }))
      .toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('carries no script, and no handler on any element', () => {
    const out = toPrintDocument({
      body: '<p onclick="steal()">t</p><script>bad()</script><iframe src="x"></iframe>',
    });
    expect(out).not.toContain('bad()');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('<iframe');
  });

  it('drops the controls that are chrome, not content', () => {
    const out = toPrintDocument({
      body: '<div class="shape"><span class="shape-h"></span></div>'
        + '<div class="code-head"><button class="code-copy">Copy</button>'
        + '<button class="code-del">x</button></div>',
    });
    expect(out).not.toContain('shape-h');
    expect(out).not.toContain('code-copy');
    expect(out).not.toContain('code-del');
  });

  it('leaves nothing editable', () => {
    expect(toPrintDocument({ body: '<div contenteditable="true">x</div>' }))
      .not.toContain('contenteditable');
  });

  it('tells the printer the colours are content', () => {
    // Without this Chromium drops every background as decoration and a
    // highlighted note prints as plain text.
    expect(toPrintDocument({})).toContain('print-color-adjust: exact');
  });

  it('inlines the stylesheet it is given', () => {
    expect(toPrintDocument({ css: '.x{color:red}' })).toContain('.x{color:red}');
  });

  it('survives being given nothing at all', () => {
    expect(() => toPrintDocument()).not.toThrow();
    expect(toPrintDocument()).toContain('Untitled');
  });
});
