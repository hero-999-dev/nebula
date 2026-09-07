/**
 * The editor's own undo stack.
 *
 * The reported bugs: deleting a shape and pressing Ctrl+Z did not bring it
 * back, and undo elsewhere left duplicated text. Both come from the same place
 * — Chromium's undo stack cannot see edits made by script, and this app makes a
 * lot of them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initHistory, pathOf, nodeAt, readCaret, writeCaret, TYPING_COALESCE_MS,
} from '../src/js/history.js';

let editor;

function mount(html = '<p>one</p>') {
  document.body.innerHTML = '';
  editor = document.createElement('div');
  editor.contentEditable = 'true';
  editor.innerHTML = html;
  document.body.appendChild(editor);
  return editor;
}

/** Collapsed caret at an offset inside the first text node of `selector`. */
function caret(selector, offset) {
  const host = editor.querySelector(selector) ?? editor;
  const range = document.createRange();
  range.setStart(host.firstChild, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
}

beforeEach(() => { mount(); });

describe('paths survive innerHTML', () => {
  it('round-trips a node through a path', () => {
    mount('<p>a</p><ul><li>b</li><li>c</li></ul>');
    const li = editor.querySelectorAll('li')[1];
    const path = pathOf(editor, li);
    expect(nodeAt(editor, path)).toBe(li);
  });

  it('finds the same position after the HTML is written back', () => {
    mount('<p>hello</p>');
    const text = editor.querySelector('p').firstChild;
    const path = pathOf(editor, text);
    const html = editor.innerHTML;
    editor.innerHTML = '';          // the original nodes are gone for good
    editor.innerHTML = html;
    expect(nodeAt(editor, path).nodeValue).toBe('hello');
  });

  it('refuses a node from another tree', () => {
    const stray = document.createElement('p');
    expect(pathOf(editor, stray)).toBeNull();
    expect(pathOf(editor, null)).toBeNull();
  });

  it('returns null for a path the tree no longer has', () => {
    expect(nodeAt(editor, [9, 9, 9])).toBeNull();
  });
});

describe('the caret', () => {
  it('is restored to the same character after a round trip', () => {
    mount('<p>hello world</p>');
    const sel = caret('p', 6);
    const saved = readCaret(editor, sel);
    const html = editor.innerHTML;
    editor.innerHTML = html;        // same markup, all-new nodes
    expect(writeCaret(editor, saved, window.getSelection())).toBe(true);
    const now = window.getSelection().getRangeAt(0);
    expect(now.startContainer.nodeValue).toBe('hello world');
    expect(now.startOffset).toBe(6);
  });

  it('clamps an offset the text is now too short for, rather than throwing', () => {
    mount('<p>hello world</p>');
    const saved = readCaret(editor, caret('p', 11));
    editor.innerHTML = '<p>hi</p>';
    expect(writeCaret(editor, saved, window.getSelection())).toBe(true);
    expect(window.getSelection().getRangeAt(0).startOffset).toBe(2);
  });

  it('gives up quietly when the shape of the note changed', () => {
    const saved = readCaret(editor, caret('p', 1));
    editor.innerHTML = '';
    expect(writeCaret(editor, saved, window.getSelection())).toBe(false);
  });

  it('is null when the selection is outside the editor', () => {
    expect(readCaret(editor, null)).toBeNull();
    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    document.body.appendChild(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    expect(readCaret(editor, sel)).toBeNull();
  });
});

describe('undo and redo', () => {
  it('takes back a scripted edit — the case Chromium could never see', () => {
    const h = initHistory(editor);
    const before = editor.innerHTML;
    h.push();                                   // announce the edit
    editor.innerHTML = '<p>one</p><div class="shape"></div>';
    expect(h.undo()).toBe(true);
    expect(editor.innerHTML).toBe(before);
  });

  it('brings a deleted shape back, with its position and colour', () => {
    mount('<div class="shape-layer"><div class="shape" style="left:40px;top:10px;background:#D6E4D0"></div></div><p>x</p>');
    const h = initHistory(editor);
    h.push();
    editor.querySelector('.shape').remove();
    expect(editor.querySelectorAll('.shape')).toHaveLength(0);
    h.undo();
    const back = editor.querySelector('.shape');
    expect(back).toBeTruthy();
    expect(back.style.left).toBe('40px');
    expect(back.style.background).toBe('rgb(214, 228, 208)');
  });

  it('redoes what it just undid', () => {
    const h = initHistory(editor);
    h.push();
    editor.innerHTML = '<p>two</p>';
    h.undo();
    expect(editor.innerHTML).toBe('<p>one</p>');
    expect(h.redo()).toBe(true);
    expect(editor.innerHTML).toBe('<p>two</p>');
  });

  it('drops the redo branch once a new edit is made', () => {
    const h = initHistory(editor);
    h.push(); editor.innerHTML = '<p>two</p>';
    h.undo();
    h.push(); editor.innerHTML = '<p>three</p>';
    h.commit();
    expect(h.canRedo()).toBe(false);
    expect(h.redo()).toBe(false);
  });

  it('does nothing at the bottom of the stack', () => {
    const h = initHistory(editor);
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
    expect(editor.innerHTML).toBe('<p>one</p>');
  });

  it('never records a step when nothing actually changed', () => {
    const h = initHistory(editor);
    h.push(); h.push(); h.push();
    expect(h.depth().past).toBe(0);
  });

  it('restores the caret along with the text', () => {
    mount('<p>hello world</p>');
    const h = initHistory(editor);
    caret('p', 6);
    h.push();
    editor.innerHTML = '<p>hello there world</p>';
    h.undo();
    const range = window.getSelection().getRangeAt(0);
    expect(range.startContainer.nodeValue).toBe('hello world');
    expect(range.startOffset).toBe(6);
  });

  it('tells the app to repaint what it restored', () => {
    // Code blocks and equations are painted from data attributes on load; a
    // restored snapshot has to go through the same pass.
    const onRestore = vi.fn();
    const h = initHistory(editor, { onRestore });
    h.push();
    editor.innerHTML = '<p>two</p>';
    h.undo();
    expect(onRestore).toHaveBeenCalledWith('<p>one</p>');
  });

  it('keeps the stack bounded', () => {
    const h = initHistory(editor, { limit: 5 });
    for (let i = 0; i < 20; i++) { h.push(); editor.innerHTML = `<p>${i}</p>`; }
    expect(h.depth().past).toBe(5);
  });

  it('forgets everything when another note opens', () => {
    const h = initHistory(editor);
    h.push(); editor.innerHTML = '<p>two</p>'; h.commit();
    editor.innerHTML = '<p>a different note</p>';
    h.reset();
    expect(h.depth()).toEqual({ past: 0, future: 0 });
    expect(h.undo()).toBe(false);
  });
});

describe('typing is one step, not one per character', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('coalesces a run of keystrokes', () => {
    const h = initHistory(editor);
    for (const word of ['on', 'one', 'one ', 'one t', 'one tw', 'one two']) {
      editor.innerHTML = `<p>${word}</p>`;
      h.typed();
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(TYPING_COALESCE_MS);
    expect(h.depth().past).toBe(1);
    h.undo();
    expect(editor.innerHTML).toBe('<p>one</p>');   // the whole run, at once
    vi.useRealTimers();
  });

  it('starts a new step after a pause', () => {
    const h = initHistory(editor);
    editor.innerHTML = '<p>one two</p>';
    h.typed();
    vi.advanceTimersByTime(TYPING_COALESCE_MS + 10);
    editor.innerHTML = '<p>one two three</p>';
    h.typed();
    vi.advanceTimersByTime(TYPING_COALESCE_MS + 10);
    expect(h.depth().past).toBe(2);
    vi.useRealTimers();
  });

  it('treats Enter and deletes as their own step immediately', () => {
    const h = initHistory(editor);
    editor.innerHTML = '<p>one</p><p>two</p>';
    h.typed({ separate: true });
    expect(h.depth().past).toBe(1);   // no waiting for the coalesce window
    vi.useRealTimers();
  });
});
