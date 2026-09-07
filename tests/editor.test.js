import { describe, it, expect } from 'vitest';
import { nextLayout, SIDES } from '../src/js/dock.js';
import { stepIndent, parseSize, TEXT_COLORS, HILITE_COLORS, U_STYLES, FONTS, FONT_MARK, firstFamily, fontLabelFor } from '../src/js/toolbar.js';
import { detectSlash, filterSlash, SLASH_ITEMS } from '../src/js/slash-menu.js';
import { makeShape, SHAPE_COLORS, SHAPE_KINDS } from '../src/js/shapes.js';
import { highlight, LANGS } from '../src/js/highlight.js';
import { codeBlockHtml, getCode } from '../src/js/codeblock.js';
import { ICONS, icon } from '../src/js/icons.js';
import { SEED_NOTES, HELP_NOTES, seedFor } from '../src/js/seed-notes.js';
import { AI_SERVICES } from '../src/js/ai-panel.js';

describe('editing-bar layout (the pad moves the BAR, not the note)', () => {
  const base = { bar: 'top', barHidden: false, ai: false };

  it('moves the bar to each side and back to top on repeat', () => {
    for (const s of SIDES) {
      const once = nextLayout(base, s);
      expect(once.bar).toBe(s);
      expect(nextLayout(once, s).bar).toBe('top');
    }
  });

  it('choosing a side un-hides the bar', () => {
    const hidden = nextLayout(base, 'hide');
    expect(hidden.barHidden).toBe(true);
    expect(nextLayout(hidden, 'left')).toMatchObject({ barHidden: false, bar: 'left' });
  });

  it('ai and hide toggle independently', () => {
    let s = nextLayout(base, 'ai');
    expect(s.ai).toBe(true);
    s = nextLayout(s, 'hide');
    expect(s).toMatchObject({ ai: true, barHidden: true });
    expect(nextLayout(s, 'ai').barHidden).toBe(true);
  });

  it('unknown action is a no-op', () => {
    expect(nextLayout(base, 'zzz')).toEqual(base);
  });
});

describe('indent + custom font size', () => {
  it('indent clamps 0..6', () => {
    expect(stepIndent(0, -1)).toBe(0);
    expect(stepIndent(6, 1)).toBe(6);
    expect(stepIndent('3', -1)).toBe(2);
    expect(stepIndent(undefined, 1)).toBe(1);
  });

  it('accepts any number the user types, clamped to sane px', () => {
    expect(parseSize('37')).toBe(37);       // arbitrary value, not in the list
    expect(parseSize('14px')).toBe(14);
    expect(parseSize('12.6')).toBe(13);
    expect(parseSize('0')).toBeNull();
    expect(parseSize('abc')).toBeNull();
    expect(parseSize('999')).toBe(400);
    expect(parseSize('2')).toBe(6);
  });
});

describe('slash menu', () => {
  it('detects "/" with a query at start or after a space', () => {
    expect(detectSlash('/')).toEqual({ query: '', start: 0 });
    expect(detectSlash('note /cod')).toEqual({ query: 'cod', start: 5 });
    expect(detectSlash('a/b')).toBeNull();
    expect(detectSlash('http://x')).toBeNull();
  });

  it('filters and includes the code block + shape entries', () => {
    expect(filterSlash('').length).toBe(SLASH_ITEMS.length);
    expect(filterSlash('cod')[0].id).toBe('code');
    expect(filterSlash('shape')[0].id).toBe('shape');
    expect(filterSlash('head').map((i) => i.id)).toEqual(['h1', 'h2', 'h3']);
  });

  it('every item names a real icon', () => {
    for (const it of SLASH_ITEMS) expect(ICONS[it.ic], it.id).toBeTruthy();
  });
});

describe('free-floating shapes', () => {
  it('makes each kind with a position, size, text and handle', () => {
    for (const kind of SHAPE_KINDS) {
      const el = makeShape(kind, SHAPE_COLORS[0], { left: 10, top: 20 });
      expect(el.classList.contains(kind)).toBe(true);
      expect(el.style.left).toBe('10px');
      expect(el.style.top).toBe('20px');
      expect(el.querySelector('.shape-text')).toBeTruthy();
      expect(el.querySelector('.shape-h')).toBeTruthy();
    }
  });

  it('cascades new shapes so they never stack exactly', () => {
    const a = makeShape('rect');
    const b = makeShape('rect');
    expect(a.style.left).not.toBe(b.style.left);
  });
});

describe('code blocks + syntax highlighting', () => {
  it('block carries raw source and language, round-trips losslessly', () => {
    const src = 'const a = "x"; // note & <tag>';
    const html = codeBlockHtml(src, 'javascript');
    const div = document.createElement('div');
    div.innerHTML = html;
    const block = div.querySelector('.blk-code');
    expect(block.dataset.lang).toBe('javascript');
    expect(getCode(block)).toBe(src);
    expect(block.querySelector('.code-lang')).toBeTruthy();
    expect(block.getAttribute('contenteditable')).toBe('false');
  });

  it('escapes HTML — code can never inject markup', () => {
    const out = highlight('<script>alert(1)</script>', 'javascript');
    // tokens may split the text, so assert on what the DOM actually builds:
    // only our own spans exist, and the source survives as literal text
    const div = document.createElement('div');
    div.innerHTML = out;
    expect(div.querySelector('script')).toBeNull();
    expect([...div.querySelectorAll('*')].every((el) => el.tagName === 'SPAN')).toBe(true);
    expect(div.textContent).toBe('<script>alert(1)</script>');
  });

  it('javascript: keywords, strings, numbers, comments get classes', () => {
    const out = highlight('const x = 5; // hi\nlet s = "str";', 'javascript');
    expect(out).toContain('tok-keyword');
    expect(out).toContain('tok-number');
    expect(out).toContain('tok-comment');
    expect(out).toContain('tok-string');
  });

  it('keywords inside strings stay strings (ordering matters)', () => {
    const out = highlight('const s = "const if for";', 'javascript');
    const inString = out.match(/<span class="tok-string">[^<]*<\/span>/)?.[0] ?? '';
    expect(inString).toContain('const if for');
  });

  it('python decorators + triple-quoted strings', () => {
    const out = highlight('@dec\ndef f():\n    """doc"""\n    return None', 'python');
    expect(out).toContain('tok-decorator');
    expect(out).toContain('tok-string');
    expect(out).toContain('tok-keyword');
  });

  it('colors differ per language for the same text', () => {
    const text = 'select from where';
    expect(highlight(text, 'sql')).toContain('tok-keyword');
    expect(highlight(text, 'plain')).not.toContain('tok-');
  });

  it('css, json, html, markdown each tokenize', () => {
    expect(highlight('.a { color: #fff; }', 'css')).toContain('tok-');
    expect(highlight('{"a": 1}', 'json')).toContain('tok-attr');
    expect(highlight('<div class="x">hi</div>', 'html')).toContain('tok-tag');
    expect(highlight('# title\n**bold**', 'markdown')).toContain('tok-');
  });

  it('every language in the picker is real and never throws', () => {
    for (const id of Object.keys(LANGS)) {
      expect(() => highlight('x = 1 // "s"\n', id)).not.toThrow();
    }
  });

  it('plain text passes through escaped, untouched', () => {
    expect(highlight('a < b && c', 'plain')).toBe('a &lt; b &amp;&amp; c');
  });
});

describe('icons', () => {
  it('renders inline currentColor svg with a class', () => {
    const html = icon('bold', 'ic');
    expect(html).toContain('<svg');
    expect(html).toContain('class="ic"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).not.toContain('fill="#');
  });

  it('has the toolbar set incl. 3-dot bullets and a 1-2 numbered mark', () => {
    for (const n of ['undo', 'redo', 'bold', 'italic', 'underline', 'strike', 'bullets', 'numbers',
      'todo', 'indent', 'outdent', 'code', 'equation', 'shapes', 'save', 'print', 'ai']) {
      expect(ICONS[n], n).toBeTruthy();
    }
    // bulleted list = three dots
    expect((ICONS.bullets.match(/<circle/g) || []).length).toBe(3);
    // Numbered list = "1" and "2" only. Three rows of digits in a 24-unit box
    // came out ~4.5 device pixels tall and read as a smudge; two rows at 8.5
    // are legible at the size the toolbar actually draws them.
    expect(ICONS.numbers).toContain('>1<');
    expect(ICONS.numbers).toContain('>2<');
    expect(ICONS.numbers).not.toContain('>3<');
    expect(ICONS.numbers).toContain('font-size="8.5"');
  });

  it('the equation mark reads as √x, not a multiplication cross', () => {
    // Two crossing strokes under the radical looked like ×, and a second
    // horizontal at mid-height read as a strikethrough.
    expect(ICONS.equation).toContain('>x<');
    expect(ICONS.equation).toContain('font-style="italic"');
    expect((ICONS.equation.match(/<path/g) || []).length).toBe(1);
  });

  it('unknown icon degrades to empty, never throws', () => {
    expect(icon('nope')).toBe('');
  });
});

describe('palettes', () => {
  it('text + background menus lead with a clear/default entry', () => {
    expect(TEXT_COLORS[0][1]).toBe('');
    expect(HILITE_COLORS[0][1]).toBe('');
    expect(TEXT_COLORS.length).toBeGreaterThanOrEqual(9);
    expect(HILITE_COLORS.length).toBeGreaterThanOrEqual(9);
  });

  it('underline styles are a closed set (exclusive application)', () => {
    expect(U_STYLES).toEqual(['u-single', 'u-double', 'u-bold', 'u-wavy', 'u-dash']);
  });
});

describe('AI services', () => {
  it('ships the Demo line-up', () => {
    for (const id of ['claude', 'gemini', 'chatgpt', 'mistral', 'deepseek']) {
      expect(AI_SERVICES[id], id).toBeTruthy();
      expect(AI_SERVICES[id].url).toMatch(/^https:\/\//);
    }
  });
});

describe('seed notes (one per feature category)', () => {
  it('covers every category with real content', () => {
    const titles = SEED_NOTES.map((n) => n.title);
    expect(titles[0]).toBe('Welcome to Nebula');
    for (const t of ['Code blocks', 'Text formatting', 'Lists, to-dos & indent', 'Shapes (free movement)', 'Editing bar & AI panel']) {
      expect(titles.some((x) => x.includes(t)), t).toBe(true);
    }
  });

  it('the code note has blocks in many languages, all decodable', () => {
    const note = SEED_NOTES.find((n) => n.title.includes('Code blocks'));
    const div = document.createElement('div');
    div.innerHTML = note.content;
    const blocks = [...div.querySelectorAll('.blk-code')];
    expect(blocks.length).toBeGreaterThanOrEqual(7);
    const langs = blocks.map((b) => b.dataset.lang);
    expect(new Set(langs).size).toBe(blocks.length); // each language once
    for (const b of blocks) {
      expect(LANGS[b.dataset.lang], b.dataset.lang).toBeTruthy();
      const code = getCode(b);
      expect(code.length).toBeGreaterThan(10);
      expect(() => highlight(code, b.dataset.lang)).not.toThrow();
    }
  });

  it('the shapes note seeds free-floating shapes on a layer', () => {
    const note = SEED_NOTES.find((n) => n.title.includes('Shapes'));
    const div = document.createElement('div');
    div.innerHTML = note.content;
    expect(div.querySelector('.shape-layer')).toBeTruthy();
    expect(div.querySelectorAll('.shape').length).toBe(3);
    expect(div.querySelector('.shape.behind')).toBeTruthy();
  });

  it('the formatting note demonstrates each underline style once', () => {
    const note = SEED_NOTES.find((n) => n.title.includes('Text formatting'));
    for (const u of U_STYLES) expect(note.content).toContain(u);
  });
});

describe('font picker', () => {
  it('offers the faces the user asked for, each with a generic fallback', () => {
    const labels = FONTS.map(([l]) => l);
    for (const want of ['Arial', 'Calibri', 'Times New Roman', 'Comic Sans MS']) {
      expect(labels, want).toContain(want);
    }
    // A bare "Calibri" silently falls back to the browser default where the
    // face is missing; every stack has to end in a family the box knows.
    for (const [label, stack] of FONTS) {
      expect(stack, label).toMatch(/(serif|sans-serif|monospace|cursive|system-ui)\s*$/);
    }
  });

  it('reads the first family out of a stack, quotes and all', () => {
    expect(firstFamily('"Times New Roman", Times, serif')).toBe('Times New Roman');
    expect(firstFamily("'Comic Sans MS', cursive")).toBe('Comic Sans MS');
    expect(firstFamily('Arial')).toBe('Arial');
    expect(firstFamily('')).toBe('');
    expect(firstFamily(null)).toBe('');
  });

  it('labels what the caret sits in, and admits when it is a font we do not list', () => {
    // getComputedStyle hands back the resolved stack; the button has to turn
    // that back into the menu entry it came from.
    expect(fontLabelFor('"Calibri", "Segoe UI", sans-serif')).toBe('Calibri');
    expect(fontLabelFor('Arial')).toBe('Arial');
    expect(fontLabelFor('arial')).toBe('Arial'); // family names are case-insensitive
    expect(fontLabelFor('Wingdings')).toBe(null);
    expect(fontLabelFor('')).toBe(null);
  });

  it('marks its own spans with a face name no real font has', () => {
    expect(FONT_MARK).toMatch(/^[a-z-]+$/);
    expect(FONTS.some(([, s]) => s.includes(FONT_MARK))).toBe(false);
  });
});

describe('starter notes per build', () => {
  it('the builds you check things in get the per-feature checklist', () => {
    for (const channel of ['test', 'dev']) expect(seedFor(channel), channel).toBe(SEED_NOTES);
    expect(SEED_NOTES.length).toBeGreaterThan(2);
  });

  it('an installed build gets the welcome note and one help page', () => {
    for (const channel of ['installed', 'portable', undefined, null]) {
      expect(seedFor(channel), String(channel)).toBe(HELP_NOTES);
    }
    expect(HELP_NOTES).toHaveLength(2);
    expect(HELP_NOTES[0].title).toBe('Welcome to Nebula');
    // One page, so no per-note checklist language in it.
    expect(HELP_NOTES[1].content).not.toContain('Check:');
  });

  it('the help page still covers every feature area', () => {
    const html = HELP_NOTES[1].content;
    for (const topic of ['Font', 'Equations', 'Shapes', 'to-do', 'Dart', 'theme']) {
      expect(html.toLowerCase(), topic).toContain(topic.toLowerCase());
    }
  });

  it('the code note carries the six languages added in 0.4.0', () => {
    const note = SEED_NOTES.find((n) => n.title.includes('Code blocks'));
    const div = document.createElement('div');
    div.innerHTML = note.content;
    const langs = [...div.querySelectorAll('.blk-code')].map((b) => b.dataset.lang);
    for (const lang of ['c', 'cpp', 'csharp', 'java', 'dart', 'ruby']) {
      expect(langs, lang).toContain(lang);
    }
  });

  it('seeded equations carry LaTeX source, not a frozen rendering', () => {
    for (const note of [...SEED_NOTES, ...HELP_NOTES]) {
      const div = document.createElement('div');
      div.innerHTML = note.content;
      for (const eq of div.querySelectorAll('.inline-eq')) {
        expect(eq.dataset.tex, note.title).toBeTruthy();
      }
    }
  });

  it('the shapes note puts a behind-shape on the behind layer', () => {
    // A single overlay could only fake "behind" with opacity; the shape has to
    // physically live under the text.
    const note = SEED_NOTES.find((n) => n.title.includes('Shapes'));
    const div = document.createElement('div');
    div.innerHTML = note.content;
    const behind = div.querySelector('.shape.behind');
    expect(behind.closest('.shape-layer').classList.contains('shape-layer--behind')).toBe(true);
    expect(div.querySelectorAll('.shape-layer').length).toBe(2);
  });
});
