/**
 * Importing a Markdown or HTML file as a note.
 *
 * Everything here comes from a file the app did not write. A note is loaded
 * with `innerHTML` and mirrored to disk, so an imported `<script>`, a `<style>`
 * that repaints the app, or an `<iframe>` would all become part of the vault.
 */
import { describe, it, expect } from 'vitest';
import {
  sanitize, fromMarkdown, titleFromMarkdown, titleFromHtml, noteFromFile,
} from '../src/js/import.js';

describe('sanitize', () => {
  it('removes scripts, styles and frames entirely', () => {
    const dirty = '<p>keep</p><script>alert(1)</script><style>body{display:none}</style>'
      + '<iframe src="https://evil.test"></iframe><object></object><embed>';
    expect(sanitize(dirty)).toBe('<p>keep</p>');
  });

  it('strips event handlers and inline styles', () => {
    const out = sanitize('<p onclick="steal()" onmouseover="x" style="position:fixed">text</p>');
    expect(out).toBe('<p>text</p>');
  });

  it('refuses javascript: and data: URLs but keeps ordinary links', () => {
    expect(sanitize('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitize('<img src="data:text/html,<script>">')).toBe('<img>');
    expect(sanitize('<a href="https://example.com">x</a>')).toBe('<a href="https://example.com">x</a>');
  });

  it('keeps only the classes the editor gives meaning to', () => {
    const out = sanitize('<span class="inline-code notion-hack side">x</span>');
    expect(out).toBe('<span class="inline-code">x</span>');
    expect(sanitize('<p class="totally-made-up">y</p>')).toBe('<p>y</p>');
  });

  it('keeps the data attributes the editor reads', () => {
    const out = sanitize('<div class="blk-code" data-lang="python" data-code="eA%3D%3D" data-evil="1"></div>');
    expect(out).toContain('data-lang="python"');
    expect(out).toContain('data-code="eA%3D%3D"');
    expect(out).not.toContain('data-evil');
  });
});

describe('fromMarkdown', () => {
  it('takes the leading # as the title, not as body text', () => {
    expect(fromMarkdown('# Title\n\nbody')).toBe('<p>body</p>');
    expect(titleFromMarkdown('# Title\n\nbody')).toBe('Title');
  });

  it('maps headings, and clamps past h3 because the editor has three', () => {
    expect(fromMarkdown('## Two\n### Three\n##### Five')).toBe('<h2>Two</h2><h3>Three</h3><h3>Five</h3>');
  });

  it('builds both kinds of list', () => {
    expect(fromMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(fromMarkdown('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
  });

  it('reads a fenced block back into a real code block', () => {
    const html = fromMarkdown('```python\nprint("hi")\n```');
    expect(html).toContain('class="blk-code"');
    expect(html).toContain('data-lang="python"');
    expect(decodeURIComponent(html.match(/data-code="([^"]*)"/)[1])).toBe('print("hi")');
  });

  it('does not treat markdown inside a fence as markdown', () => {
    const html = fromMarkdown('```\n# not a heading\n- not a list\n```');
    expect(html).not.toContain('<h1>');
    expect(html).not.toContain('<ul>');
    expect(decodeURIComponent(html.match(/data-code="([^"]*)"/)[1])).toBe('# not a heading\n- not a list');
  });

  it('reads to-dos, quotes and dividers', () => {
    expect(fromMarkdown('- [x] done')).toBe('<div class="blk-todo done">done</div>');
    expect(fromMarkdown('- [ ] open')).toBe('<div class="blk-todo">open</div>');
    expect(fromMarkdown('> quoted')).toBe('<blockquote>quoted</blockquote>');
    expect(fromMarkdown('---')).toBe('<hr class="blk-hr">');
  });

  it('reads inline marks', () => {
    expect(fromMarkdown('**b** and *i* and `c`'))
      .toBe('<p><strong>b</strong> and <em>i</em> and <span class="inline-code">c</span></p>');
    expect(fromMarkdown('[x](https://a.dev)')).toBe('<p><a href="https://a.dev">x</a></p>');
  });

  it('escapes HTML in the source rather than letting it through', () => {
    expect(fromMarkdown('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('survives an empty file', () => {
    expect(fromMarkdown('')).toBe('');
    expect(fromMarkdown(null)).toBe('');
  });
});

describe('noteFromFile', () => {
  it('titles a markdown file from its heading, falling back to the filename', () => {
    expect(noteFromFile('notes.md', '# Real title\n\nbody').title).toBe('Real title');
    expect(noteFromFile('My Notes.md', 'no heading here').title).toBe('My Notes');
  });

  it('titles an HTML file from <title>, then a heading', () => {
    expect(noteFromFile('x.html', '<title>From title</title><p>b</p>').title).toBe('From title');
    expect(titleFromHtml('<body><h1>From heading</h1></body>')).toBe('From heading');
  });

  it('sanitizes an HTML import and keeps only the body', () => {
    const note = noteFromFile('x.html', '<html><head><style>b{}</style></head><body><p>kept</p><script>x</script></body></html>');
    expect(note.content).toBe('<p>kept</p>');
  });

  it('round-trips a markdown file into something the editor can render', () => {
    const note = noteFromFile('doc.md', '# T\n\n## Section\n\n- one\n- two\n\n```js\nlet a = 1;\n```');
    expect(note.title).toBe('T');
    expect(note.content).toContain('<h2>Section</h2>');
    expect(note.content).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(note.content).toContain('data-lang="js"');
  });
});
