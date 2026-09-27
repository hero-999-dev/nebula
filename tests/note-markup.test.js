/**
 * What is saved is the note, not the screen.
 *
 * The owner's Ideas note holds a picture that has been "selected" since the day
 * it was saved: the autosave wrote the editor's markup as it stood, selection
 * and all. One list of on-screen-only state now serves the save, every undo
 * step, the exports and the migration of notes saved before it.
 */
import { describe, it, expect } from 'vitest';
import { serializeNote, stripTransient, hasTransient } from '../src/js/note-markup.js';

const editor = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

const ON_SCREEN =
  '<div class="shape-layer" contenteditable="false">'
  + '<div class="shape rect sel editing" data-kind="rect"><div class="shape-text" contenteditable="true">hi</div>'
  + '<span class="shape-angle">15°</span><span class="shape-rot" title="Rotate"></span><span class="shape-h" title="Resize"></span></div>'
  + '<figure class="note-image sel" contenteditable="false"><img src="data:,"></figure></div>'
  + '<p>text</p><hr class="armed"><p>more</p>'
  + '<svg class="note-arrow is-selected"></svg><div class="link-block arrow-target"></div>';

describe('serializeNote', () => {
  it('leaves out every kind of on-screen state', () => {
    const el = editor(ON_SCREEN);
    const saved = editor(serializeNote(el));
    expect(saved.querySelector('.sel, .editing, .armed, .is-selected, .arrow-target, .shape-angle')).toBeNull();
    expect(saved.querySelector('.shape-text').getAttribute('contenteditable')).toBe('false');
    expect(saved.textContent).toBe('hitextmore');
  });

  it('does not touch what is on screen', () => {
    const el = editor(ON_SCREEN);
    const before = el.innerHTML;
    serializeNote(el);
    expect(el.innerHTML).toBe(before);
  });

  it('writes a divider as <hr>, not <hr class="">', () => {
    expect(serializeNote(editor('<p>a</p><hr class="armed"><p>b</p>'))).toBe('<p>a</p><hr><p>b</p>');
  });

  it('keeps the classes that are content', () => {
    const html = '<hr class="blk-hr armed"><div class="blk-todo done">task</div>';
    expect(serializeNote(editor(html))).toBe('<hr class="blk-hr"><div class="blk-todo done">task</div>');
  });

  it('counts a shape text with no attribute as left editable (it inherits the editor)', () => {
    const el = editor('<div class="shape rect" data-kind="rect"><div class="shape-text">x</div></div>');
    expect(hasTransient(el)).toBe(true);
    expect(editor(serializeNote(el)).querySelector('.shape-text').getAttribute('contenteditable')).toBe('false');
  });

  it('drops the pending-format caret from a save but keeps it for an undo step', () => {
    const html = '<p>ab<span class="u-single" data-format-caret="">\u200b</span></p>';
    expect(serializeNote(editor(html))).not.toContain('data-format-caret');
    expect(serializeNote(editor(html), { keepTypingMarkers: true })).toContain('data-format-caret');
  });

  it('returns the markup as it is when there is nothing to leave out', () => {
    const html = '<p>plain <strong>note</strong></p><hr class="blk-hr">';
    expect(serializeNote(editor(html))).toBe(html);
  });
});

describe('stripTransient', () => {
  it('cleans a note saved with on-screen state, and a second pass finds nothing', () => {
    const el = editor(ON_SCREEN);
    expect(stripTransient(el)).toBeGreaterThan(0);
    const after = el.innerHTML;
    expect(stripTransient(el)).toBe(0);
    expect(el.innerHTML).toBe(after);
    expect(hasTransient(el)).toBe(false);
  });
});
