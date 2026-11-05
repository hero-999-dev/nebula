/**
 * The window never opens out of sight (1.0.3, electron/window-bounds.js): the
 * owner's window was saved on a second monitor that was no longer there.
 */
import { describe, it, expect } from 'vitest';
import { onScreenBounds } from '../electron/window-bounds.js';

const ONE = [{ x: 0, y: 0, width: 1920, height: 1040 }];
const TWO = [...ONE, { x: 1920, y: 0, width: 2560, height: 1400 }];

describe('onScreenBounds', () => {
  it('leaves a window on a screen where it was', () => {
    const b = { x: 100, y: 50, width: 1200, height: 800 };
    expect(onScreenBounds(b, ONE)).toBe(b);
  });

  it('brings the window of a monitor that is gone to the one that is there', () => {
    const b = { x: 2561, y: 0, width: 1278, height: 1031 };
    expect(onScreenBounds(b, ONE)).toEqual({ x: 321, y: 5, width: 1278, height: 1031 });
    expect(onScreenBounds(b, TWO)).toBe(b);
  });

  it('cuts a window too big for that screen to fit', () => {
    expect(onScreenBounds({ x: 3000, y: 0, width: 2500, height: 1300 }, ONE)).toEqual({ x: 0, y: 0, width: 1920, height: 1040 });
  });

  it('brings back a window with too little left to take hold of', () => {
    expect(onScreenBounds({ x: 1900, y: 100, width: 1000, height: 700 }, ONE).x).toBe(460);
    expect(onScreenBounds({ x: 100, y: -500, width: 1000, height: 700 }, ONE).y).toBe(170);
    expect(onScreenBounds({ x: 100, y: 1030, width: 1000, height: 700 }, ONE).y).toBe(170);
  });

  it('keeps a window part way off a side, or a few pixels over an edge when snapped', () => {
    const side = { x: 1500, y: 0, width: 1000, height: 700 };
    const snapped = { x: -8, y: -8, width: 976, height: 1056 };
    expect(onScreenBounds(side, ONE)).toBe(side);
    expect(onScreenBounds(snapped, ONE)).toBe(snapped);
  });

  it('picks the nearest screen, on the left of the main one too', () => {
    const left = [{ x: -1920, y: 0, width: 1920, height: 1040 }, ...ONE];
    expect(onScreenBounds({ x: -6000, y: 0, width: 1000, height: 700 }, left).x).toBe(-1460);
  });

  it('changes nothing with no display to go by', () => {
    const b = { x: 9000, y: 0, width: 1000, height: 700 };
    expect(onScreenBounds(b, [])).toBe(b);
  });
});
