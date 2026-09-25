/**
 * The indicator top right. Every input event says "saving"; the flush after it
 * must always say "saved", including when nothing had changed — an input event
 * with no change is routine (selecting an image, clicking an arrow), and until
 * 0.8.8 it left the indicator on "Saving…" for good.
 */
import { describe, it, expect, vi } from 'vitest';
import { bindEditor } from '../src/js/editor.js';

describe('save indicator', () => {
  it('ends on "saved" after an input that changed nothing', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="ed" contenteditable="true"></div>';
    const el = document.getElementById('ed');
    const note = { id: 'n', content: '<p>same</p>' };
    const store = { get: () => note, updateNote: vi.fn() };
    const states = [];
    const editor = bindEditor(el, store, (s) => states.push(s));
    editor.load(note);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(states.at(-1)).toBe('saving');
    vi.advanceTimersByTime(1000);
    expect(states.at(-1)).toBe('saved');
    expect(store.updateNote).not.toHaveBeenCalled();
    expect(editor.pending).toBe(false);
    vi.useRealTimers();
  });

  it('still writes and says "saved" when something did change', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="ed" contenteditable="true"></div>';
    const el = document.getElementById('ed');
    const note = { id: 'n', content: '<p>one</p>' };
    const store = { get: () => note, updateNote: vi.fn() };
    const states = [];
    const editor = bindEditor(el, store, (s) => states.push(s));
    editor.load(note);
    el.innerHTML = '<p>two</p>';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(store.updateNote).toHaveBeenCalledWith('n', { content: '<p>two</p>' });
    expect(states.at(-1)).toBe('saved');
    vi.useRealTimers();
  });
});
