/**
 * Notes side by side (1.0.0, split-view.js): where a note let go over the
 * panes goes, and which notes the panes hold after it. The panes themselves,
 * the shared editor and the drag from the list are in tests/e2e/split-view.mjs.
 */
import { describe, it, expect } from 'vitest';
import { dropIndex, withPane, MAX_PANES } from '../src/js/split-view.js';

const rects = [{ left: 0, width: 300 }, { left: 310, width: 300 }, { left: 620, width: 300 }];

describe('dropIndex', () => {
  it('the left half of a pane puts the new one before it, the right half after it', () => {
    expect(dropIndex(rects, 10)).toBe(0);
    expect(dropIndex(rects, 200)).toBe(1);
    expect(dropIndex(rects, 400)).toBe(1);
    expect(dropIndex(rects, 500)).toBe(2);
    expect(dropIndex(rects, 900)).toBe(3);
  });
  it('past the last pane, at the end; with none, first', () => {
    expect(dropIndex(rects, 2000)).toBe(3);
    expect(dropIndex([], 50)).toBe(0);
  });
  it('one page alone: its left half before it, its right half after it', () => {
    expect(dropIndex([{ left: 0, width: 800 }], 100)).toBe(0);
    expect(dropIndex([{ left: 0, width: 800 }], 700)).toBe(1);
  });
});

describe('withPane', () => {
  it('puts the note where it was let go', () => {
    expect(withPane(['a', 'b'], 'c', 1)).toEqual(['a', 'c', 'b']);
    expect(withPane(['a'], 'b', 1)).toEqual(['a', 'b']);
    expect(withPane(['a'], 'b', 0)).toEqual(['b', 'a']);
  });
  it('a place out of range is the nearest end', () => {
    expect(withPane(['a', 'b'], 'c', 9)).toEqual(['a', 'b', 'c']);
    expect(withPane(['a', 'b'], 'c', -3)).toEqual(['c', 'a', 'b']);
  });
  it('never shows a note twice, and no more than four', () => {
    expect(withPane(['a', 'b'], 'a', 1)).toBeNull();
    expect(MAX_PANES).toBe(4);
    expect(withPane(['a', 'b', 'c', 'd'], 'e', 2)).toBeNull();
    expect(withPane(['a'], '', 0)).toBeNull();
  });
});
