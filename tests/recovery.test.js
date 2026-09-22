import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindEditor } from '../src/js/editor.js';
import { NoteStore } from '../src/js/notes.js';
import { toMarkdown } from '../src/js/export.js';
import { fromMarkdown, sanitize } from '../src/js/import.js';
import { caretAtBlockEdge } from '../src/js/codeblock.js';

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); });

describe('autosave ownership', () => {
  it.each(['trash', 'archive'])('keeps the pending body with the original note after %s', (action) => {
    vi.useFakeTimers();
    const store = new NoteStore({ allowSeed: false });
    const original = store.createNote('Original');
    const other = store.createNote('Other');
    store.updateNote(other.id, { content: '<p>Other body</p>' });
    store.setActive(original.id);
    const el = document.createElement('div');
    const editor = bindEditor(el, store);
    editor.load(original);
    el.innerHTML = '<p>Latest body</p>';
    el.dispatchEvent(new Event('input'));
    store[action](original.id);
    editor.flush();
    editor.load(store.active());
    vi.runAllTimers();
    expect(store.get(original.id).content).toBe('<p>Latest body</p>');
    expect(store.get(other.id).content).toBe('<p>Other body</p>');
  });
  it('does not reopen a trashed or archived note when no live notes remain', () => {
    const store = new NoteStore({ allowSeed: false });
    store.trash(store.createNote('Deleted').id);
    store.archive(store.createNote('Archived').id);
    expect(new NoteStore({ allowSeed: false }).active()).toBeFalsy();
    const el = document.createElement('div');
    bindEditor(el, store).load(null);
    expect(el.contentEditable).toBe('false');
  });
  it('retries the same body after a synchronous save failure', () => {
    const store = new NoteStore({ allowSeed: false });
    const note = store.createNote('Retry');
    const el = document.createElement('div');
    const editor = bindEditor(el, store);
    editor.load(note);
    el.innerHTML = 'unsaved';
    const update = vi.spyOn(store, 'updateNote').mockImplementationOnce(() => { throw new Error('quota'); });
    expect(() => editor.flush()).toThrow('quota');
    editor.flush();
    expect(update).toHaveBeenCalledTimes(2);
    expect(note.content).toBe('unsaved');
  });
});

describe('lossless Markdown recovery', () => {
  it('keeps bare text and paragraphs nested in formatting wrappers', () => {
    expect(toMarkdown('first<div><p>second</p><p><b>third</b></p></div>last'))
      .toBe('first\n\nsecond\n\n**third**\n\nlast\n');
  });
  it('round-trips code containing fences and consecutive blank lines', () => {
    const code = 'before\n```\n\n\nafter';
    const md = toMarkdown(`<div class="blk-code" data-lang="js" data-code="${encodeURIComponent(code)}"></div>`);
    expect(md).toContain('````js\n');
    const root = document.createElement('div');
    root.innerHTML = fromMarkdown(md);
    expect(decodeURIComponent(root.querySelector('.blk-code').dataset.code)).toBe(code);
  });
  it.each(['java&#9;script:alert(1)', '&#10;javascript:alert(1)', 'vb&#13;script:bad', 'data:text/html,bad'])('removes obfuscated active links: %s', href => {
    const root = document.createElement('div');
    root.innerHTML = sanitize(`<p><a href="${href}">keep text</a></p>`);
    expect(root.textContent).toBe('keep text');
    expect(root.querySelector('a').hasAttribute('href')).toBe(false);
  });
});

describe('code block deletion boundaries', () => {
  it('does not treat the start of an inline run as the start of its paragraph', () => {
    const p = document.createElement('p');
    p.innerHTML = 'before <b>after</b>';
    const range = document.createRange();
    range.setStart(p.querySelector('b').firstChild, 0);
    range.collapse(true);
    expect(caretAtBlockEdge(range, p, 'before')).toBe(false);
    range.setStart(p.firstChild, 0);
    range.collapse(true);
    expect(caretAtBlockEdge(range, p, 'before')).toBe(true);
  });
});
