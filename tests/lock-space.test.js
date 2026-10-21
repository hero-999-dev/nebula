// @vitest-environment jsdom
/**
 * The moving sky behind the lock screen (lock-space.js): a faint <pre> that
 * screen readers skip, that changes as time passes, and that stops by itself
 * once the lock screen has left the page.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '../src/js/lock-space.js';

let box;
beforeEach(() => {
  vi.useFakeTimers();
  box = document.createElement('div');
  box.className = 'app-lock';
  box.append(document.createElement('div'));
  document.body.append(box);
});
afterEach(() => { box.remove(); vi.useRealTimers(); });

describe('lock space', () => {
  it('is an aria-hidden pre, first in the screen so the card stays in front', () => {
    const { el, stop } = mount(box, { reduced: false });
    expect(el.tagName).toBe('PRE');
    expect(el.className).toBe('lock-space');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(box.firstElementChild).toBe(el);
    expect(el.textContent.trim().length).toBeGreaterThan(0);
    stop();
  });

  it('moves: the text changes as time passes, reduced motion included', () => {
    for (const reduced of [false, true]) {
      const { el, stop } = mount(box, { reduced });
      const first = el.textContent;
      vi.advanceTimersByTime(4000);
      expect(el.textContent).not.toBe(first);
      stop();
      el.remove();
    }
  });

  it('draws only from the sky\'s alphabet, row by row', () => {
    const { el, stop } = mount(box, { reduced: false });
    const lines = el.textContent.split('\n');
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
    expect(el.textContent).not.toMatch(/[<>&]/);
    stop();
  });

  it('stops by itself once the screen has left the page', () => {
    const { el } = mount(box, { reduced: false });
    vi.advanceTimersByTime(500);
    box.remove();
    vi.advanceTimersByTime(100);
    const after = el.textContent;
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(el.textContent).toBe(after);
  });

  it('stop() ends the loop at once', () => {
    const { stop } = mount(box, { reduced: false });
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
