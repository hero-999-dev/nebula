import { describe, it, expect } from 'vitest';
import { arrowPath, nearestAnchor, anchorPoint } from '../src/js/arrows.js';
import { formatAngle } from '../src/js/shapes.js';

describe('arrowPath', () => {
  it('draws a straight segment', () => {
    expect(arrowPath('straight', 0, 0, 10, 0)).toBe('M 0 0 L 10 0');
  });

  it('bends an elbow through the midpoint', () => {
    expect(arrowPath('elbow', 0, 0, 10, 8)).toBe('M 0 0 L 5 0 L 5 8 L 10 8');
  });

  it('curves between the ends', () => {
    expect(arrowPath('curve', 0, 0, 10, 0)).toContain('C');
  });
});

describe('nearestAnchor', () => {
  const anchors = [
    { id: 'shape', x: 0, y: 0 },
    { id: 'text', x: 40, y: 0 },
  ];

  it('picks the end within range', () => {
    expect(nearestAnchor({ x: 4, y: 1 }, anchors).id).toBe('shape');
  });

  it('ignores an end that is too far to be a connection', () => {
    expect(nearestAnchor({ x: 100, y: 100 }, anchors)).toBeNull();
  });
});

describe('anchorPoint', () => {
  it('meets the side of a box that faces the other end', () => {
    const box = { left: 10, top: 10, width: 20, height: 10 };
    expect(anchorPoint(box, { x: 0, y: 15 })).toEqual({ x: 10, y: 15 });
    expect(anchorPoint(box, { x: 80, y: 15 }).x).toBe(30);
  });
});

describe('formatAngle', () => {
  it('shows a whole-degree readout and wraps a full turn', () => {
    expect(formatAngle(15.2)).toBe('15°');
    expect(formatAngle(-10)).toBe('350°');
  });
});
