/**
 * Cutting a picture to the logo's tile (1.0.3, logo-crop.js): the picture always
 * covers the square, however it is pulled or zoomed. The window itself is in
 * tests/e2e/ideas-103.mjs.
 */
import { describe, it, expect } from 'vitest';
import { CROP_SIDE, coverScale, clampView, startView, cutOf, stretchOf } from '../src/js/logo-crop.js';

describe('the view of the picture', () => {
  it('starts centred and just covering the square', () => {
    const view = startView(1000, 500);
    expect(view.scale).toBeCloseTo(CROP_SIDE / 500);
    expect(view.y).toBeCloseTo(0);
    expect(view.x).toBeCloseTo((CROP_SIDE - 1000 * view.scale) / 2);
  });

  it('never leaves an empty part of the square showing', () => {
    const least = coverScale(1000, 500);
    const tooFar = clampView({ scale: least, x: 50, y: 50 }, 1000, 500);
    expect(tooFar.x).toBe(0);
    expect(tooFar.y).toBe(0);
    const otherWay = clampView({ scale: least, x: -99999, y: -99999 }, 1000, 500);
    expect(otherWay.x).toBeCloseTo(CROP_SIDE - 1000 * least);
    expect(otherWay.y).toBeCloseTo(0);
  });

  it('cannot be zoomed out past covering, nor in without end', () => {
    const least = coverScale(400, 400);
    expect(clampView({ scale: 0.001, x: 0, y: 0 }, 400, 400).scale).toBeCloseTo(least);
    expect(clampView({ scale: 999, x: 0, y: 0 }, 400, 400).scale).toBeCloseTo(least * 6);
  });
});

describe('the frame of the window shape (1.0.3)', () => {
  it('covers a frame wider than it is high, and never shows an empty part of it', () => {
    const view = startView(1000, 1000, 480, 270);
    expect(view.scale).toBeCloseTo(0.48);
    expect(view.x).toBeCloseTo(0);
    const pulled = clampView({ scale: 0.1, x: 50, y: -900 }, 1000, 1000, 480, 270);
    expect(pulled.scale).toBeCloseTo(0.48);
    expect(pulled.x).toBe(0);
    expect(pulled.y).toBeCloseTo(270 - 480);
  });
  it('gives the part of the picture shown, in its own pixels', () => {
    expect(cutOf({ scale: 0.5, x: -100, y: -40 }, 480, 270)).toEqual({ x: 200, y: 80, width: 960, height: 540 });
  });
  it('says how much a small cut is stretched, and nothing when it is not', () => {
    expect(stretchOf(569, 1920)).toBe(3.4);
    expect(stretchOf(1920, 1920)).toBe(0);
    expect(stretchOf(1600, 1920)).toBe(0);
  });
});
