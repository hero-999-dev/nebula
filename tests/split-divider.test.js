import { describe, it, expect, vi } from 'vitest';
import { pairWidths, initSplitView } from '../src/js/split-view.js';

describe('split divider limits', () => {
  it('moves only the shared boundary and keeps the pair total', () => {
    expect(pairWidths(500, 500, 150, 240)).toEqual([650, 350]);
    expect(pairWidths(500, 500, -150, 240)).toEqual([350, 650]);
  });
  it('keeps both panes usable, adapting the minimum in a narrow window', () => {
    expect(pairWidths(500, 500, 900, 240)).toEqual([760, 240]);
    expect(pairWidths(200, 200, -900, 240)).toEqual([200, 200]);
  });
});

describe('map beside a note', () => {
  it('keyboard resizing gives the map a throttled resize callback', () => {
    const frames = [];
    vi.stubGlobal('requestAnimationFrame', (fn) => { frames.push(fn); return frames.length; });
    try {
      document.body.innerHTML = '<div id="shell"><header><input id="title"></header><div id="frame"></div></div>';
      const resized = vi.fn();
      const split = initSplitView({
        shell: document.getElementById('shell'), frame: document.getElementById('frame'),
        titleEl: document.getElementById('title'),
        store: { activeId: 'a', get: () => ({ id: 'a', title: 'A' }) },
        openNote: () => {},
        map: { el: document.createElement('div'), shown: () => {}, hidden: () => {}, resized },
      });
      split.addMap();
      const row = document.querySelector('.split-row');
      Object.defineProperty(row, 'clientWidth', { value: 1000 });
      for (const pane of row.querySelectorAll('.split-pane')) pane.getBoundingClientRect = () => ({ width: 495 });
      const line = row.querySelector('.split-divider');
      const before = Number(row.querySelector('.split-pane').style.flexGrow);
      line.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      line.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(Number(row.querySelector('.split-pane').style.flexGrow)).toBeGreaterThan(before);
      expect(resized).toHaveBeenCalledTimes(0);
      expect(frames).toHaveLength(1);
      frames.shift()();
      expect(resized).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
});
