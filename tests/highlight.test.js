/**
 * The six languages added in v0.4.0, and the case-sensitivity bug that was
 * quietly painting every identifier as a class name.
 */
import { describe, it, expect } from 'vitest';
import { LANGS, highlight } from '../src/js/highlight.js';

/** The token class a given piece of source came out as. */
const classOf = (code, lang, piece) => {
  const html = highlight(code, lang);
  const m = html.match(new RegExp(`<span class="tok-(\\w+)">${piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`));
  return m?.[1] ?? null;
};

describe('language list', () => {
  it('offers the languages the user asked for', () => {
    for (const id of ['c', 'cpp', 'csharp', 'java', 'dart', 'ruby']) {
      expect(LANGS[id], id).toBeTruthy();
    }
    expect(LANGS.dart.label).toBe('Dart (Flutter)');
    expect(LANGS.cpp.label).toBe('C++');
    expect(LANGS.csharp.label).toBe('C#');
  });
});

describe('C family', () => {
  it('colours keywords, strings and comments in C', () => {
    expect(classOf('int x = 1;', 'c', 'int')).toBe('keyword');
    expect(classOf('char* s = "hi";', 'c', '"hi"')).toBe('string');
    expect(classOf('// note\nint x;', 'c', '// note')).toBe('comment');
  });

  it('treats a C preprocessor line as its own token', () => {
    expect(classOf('#include &lt;stdio.h&gt;', 'c', '#include')).toBe('atrule');
  });

  it('knows C++ and C# keywords the others do not have', () => {
    expect(classOf('template&lt;T&gt; x;', 'cpp', 'template')).toBe('keyword');
    expect(classOf('var x = nameof(y);', 'csharp', 'nameof')).toBe('keyword');
  });

  it('reads a C# verbatim string as one string', () => {
    expect(highlight('var p = @"C:\\temp";', 'csharp')).toContain('tok-string');
  });

  it('colours a Java annotation', () => {
    expect(classOf('@Override\nvoid run() {}', 'java', '@Override')).toBe('decorator');
  });

  it('colours Dart keywords', () => {
    expect(classOf('final x = await f();', 'dart', 'final')).toBe('keyword');
    expect(classOf('final x = await f();', 'dart', 'await')).toBe('keyword');
  });
});

describe('Ruby', () => {
  it('keeps #{...} inside the string instead of starting a comment', () => {
    const html = highlight('puts "hi #{name} there"\nx = 1', 'ruby');
    // the whole literal is one string token; nothing after it became a comment
    expect(html).toContain('tok-string');
    expect(html).not.toContain('tok-comment');
  });

  it('still colours a real comment', () => {
    expect(classOf('# a note\nx = 1', 'ruby', '# a note')).toBe('comment');
  });

  it('colours instance variables and symbols', () => {
    expect(classOf('@name = 1', 'ruby', '@name')).toBe('decorator');
    expect(classOf('h = :key', 'ruby', ':key')).toBe('klass');
  });

  it('colours def as a keyword', () => {
    expect(classOf('def run\nend', 'ruby', 'def')).toBe('keyword');
  });
});

describe('case sensitivity', () => {
  it('does not paint a lowercase identifier as a class', () => {
    // The bug: every keyword list carried the `i` flag, which made the whole
    // combined regex case-insensitive, so /\b[A-Z]\w*\b/ matched anything.
    expect(classOf('let total = 1;', 'javascript', 'total')).not.toBe('klass');
    expect(classOf('int counter = 0;', 'java', 'counter')).not.toBe('klass');
  });

  it('still paints a real class name as one', () => {
    // Not `Widget(` — followed by a paren it is a call, and `fn` is right.
    expect(classOf('Widget w = other;', 'dart', 'Widget')).toBe('klass');
    expect(classOf('String name;', 'java', 'String')).toBe('klass');
  });

  it('keeps SQL case-insensitive, because SQL is', () => {
    expect(classOf('Select 1', 'sql', 'Select')).toBe('keyword');
    expect(classOf('SELECT 1', 'sql', 'SELECT')).toBe('keyword');
  });
});
