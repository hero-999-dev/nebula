import { describe, it, expect } from 'vitest';
import { nextLayout, SIDES } from '../src/js/dock.js';
import { stepIndent, parseSize, TEXT_COLORS, HILITE_COLORS, colorClasses, U_STYLES, FONTS, firstFamily, fontLabelFor } from '../src/js/toolbar.js';
import { detectSlash, filterSlash, SLASH_ITEMS } from '../src/js/slash-menu.js';
import { makeShape, SHAPE_COLORS, SHAPE_KINDS } from '../src/js/shapes.js';
import { highlight, LANGS } from '../src/js/highlight.js';
import { codeBlockHtml, getCode } from '../src/js/codeblock.js';
import { ICONS, icon } from '../src/js/icons.js';
import { SEED_NOTES, GUIDE_NOTE, GUIDE_VERSION } from '../src/js/seed-notes.js';
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
    // Bold, like the rest of the set — the digits read as a smudge otherwise.
    expect(ICONS.numbers).toContain('font-weight="700"');
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

});

/**
 * The starter note. It was six or seven separate "Test ·" notes plus a second
 * set for installed copies; the thing you wanted was always in the note you had
 * not opened, and the two sets drifted. One page now, identical in every build.
 */
describe('the guide note', () => {
  const doc = () => {
    const div = document.createElement('div');
    div.innerHTML = GUIDE_NOTE.content;
    return div;
  };

  it('is the only starter note, and is what every build seeds', () => {
    expect(SEED_NOTES).toEqual([GUIDE_NOTE]);
    expect(GUIDE_NOTE.title).toBe('Welcome to Nebula Guide');
    expect(GUIDE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('opens with the welcome, then covers every feature area', () => {
    const div = doc();
    expect(div.querySelector('h1').textContent).toBe('Welcome to Nebula');
    const headings = [...div.querySelectorAll('h2')].map((h) => h.textContent);
    for (const area of ['window', 'Writing', 'Fonts', 'Lists', 'Equations', 'Shapes', 'Code blocks', 'notes live']) {
      expect(headings.some((h) => h.includes(area)), area).toBe(true);
    }
  });

  it('has a sample for EVERY language the picker offers', () => {
    // The user's report was "I still do not see examples for all the code
    // languages" — TypeScript and Bash had none. Anything added to LANGS from
    // now on fails here until it has one.
    const langs = [...doc().querySelectorAll('.blk-code')].map((b) => b.dataset.lang);
    const expected = Object.keys(LANGS).filter((l) => l !== 'plain');
    expect([...langs].sort()).toEqual([...expected].sort());
  });

  it('every sample decodes and highlights without throwing', () => {
    for (const block of doc().querySelectorAll('.blk-code')) {
      const src = getCode(block);
      expect(src.length, block.dataset.lang).toBeGreaterThan(20);
      expect(() => highlight(src, block.dataset.lang)).not.toThrow();
      expect(highlight(src, block.dataset.lang), block.dataset.lang).toContain('tok-');
    }
  });

  it('demonstrates every underline style', () => {
    for (const u of U_STYLES) expect(GUIDE_NOTE.content).toContain(u);
  });

  it('carries equations as LaTeX source, not a frozen rendering', () => {
    const eqs = [...doc().querySelectorAll('.inline-eq')];
    expect(eqs.length).toBeGreaterThanOrEqual(4);
    for (const eq of eqs) expect(eq.dataset.tex).toBeTruthy();
  });

  it('puts the behind-shape on the behind layer, not just in a class', () => {
    const div = doc();
    expect(div.querySelectorAll('.shape-layer').length).toBe(2);
    expect(div.querySelectorAll('.shape').length).toBe(3);
    const behind = div.querySelector('.shape.behind');
    expect(behind.closest('.shape-layer').classList.contains('shape-layer--behind')).toBe(true);
  });

  it('includes the fonts the user named', () => {
    for (const face of ['Arial', 'Calibri', 'Times New Roman', 'Comic Sans MS']) {
      expect(GUIDE_NOTE.content, face).toContain(face);
    }
  });
});

/**
 * Colours have to survive a theme change. Stored as hex they could not: a
 * "yellow background" picked on the light paper became a pale pastel under
 * light ink on Main and Dark, and the highlight and the text ran together.
 */
describe('note colours are classes, not frozen values', () => {
  it('every palette entry is a class name, never a colour value', () => {
    // Both families lead with a "clear it" row, which is deliberately empty.
    for (const [label, cls] of [...TEXT_COLORS, ...HILITE_COLORS].filter(([, c]) => c)) {
      expect(cls, label).toMatch(/^[ch]-[a-z]+$/);
      expect(cls, label).not.toMatch(/#|rgb/);
    }
  });

  it('the two families lead with a clear entry and do not overlap', () => {
    expect(TEXT_COLORS[0][1]).toBe('');
    expect(HILITE_COLORS[0][1]).toBe('');
    const text = colorClasses(TEXT_COLORS);
    const hilite = colorClasses(HILITE_COLORS);
    expect(text).toHaveLength(9);
    expect(hilite).toHaveLength(9);
    expect(text.every((c) => c.startsWith('c-'))).toBe(true);
    expect(hilite.every((c) => c.startsWith('h-'))).toBe(true);
    expect(text.filter((c) => hilite.includes(c))).toEqual([]);
  });

  it('the guide writes classes, so it reads on every theme', () => {
    expect(GUIDE_NOTE.content).not.toMatch(/style="[^"]*(?:background-)?color:\s*#/);
    for (const cls of ['c-red', 'c-blue', 'h-yellow', 'h-green']) {
      expect(GUIDE_NOTE.content, cls).toContain(`class="${cls}"`);
    }
  });
});
