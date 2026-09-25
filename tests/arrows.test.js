import { describe, it, expect } from 'vitest';
import { arrowPath, nearestAnchor, anchorPoint, magnetTarget, MAGNET } from '../src/js/arrows.js';
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

describe('magnetTarget: an arrow end snaps on when it comes near (0.8.9)', () => {
  const shape = { id: 's', kind: 'object', box: { left: 100, top: 100, width: 160, height: 100 } };
  const image = { id: 'i', kind: 'object', box: { left: 140, top: 120, width: 60, height: 40 } };
  const text = { id: 't', kind: 'text', box: { left: 0, top: 300, width: 800, height: 28 } };

  it('catches from inside the object, not only at its centre', () => {
    expect(magnetTarget({ x: 110, y: 110 }, [shape])?.id).toBe('s');
  });

  it('catches within MAGNET pixels of the edge, and lets go beyond it', () => {
    expect(magnetTarget({ x: 100 - (MAGNET - 4), y: 150 }, [shape])?.id).toBe('s');
    expect(magnetTarget({ x: 100 - (MAGNET + 8), y: 150 }, [shape])).toBeNull();
  });

  it('a line of text only catches from inside it', () => {
    expect(magnetTarget({ x: 50, y: 310 }, [text])?.id).toBe('t');
    expect(magnetTarget({ x: 50, y: 290 }, [text])).toBeNull();
  });

  it('an object wins over text, and of two it is inside, the one painted on top', () => {
    const under = { id: 'u', kind: 'text', box: { left: 0, top: 100, width: 800, height: 120 } };
    expect(magnetTarget({ x: 110, y: 110 }, [under, shape])?.id).toBe('s');
    expect(magnetTarget({ x: 150, y: 130 }, [{ ...shape, z: 1 }, { ...image, z: 2 }])?.id).toBe('i');
    // the bigger one on top still wins: it is what is under the pointer
    expect(magnetTarget({ x: 150, y: 130 }, [{ ...shape, z: 5 }, { ...image, z: 2 }])?.id).toBe('s');
    // inside beats merely near
    expect(magnetTarget({ x: 150, y: 130 }, [{ ...image, z: 0 }, { id: 'n', kind: 'object', z: 9, box: { left: 205, top: 120, width: 40, height: 40 } }])?.id).toBe('i');
  });

  it('the nearest edge wins between two objects', () => {
    const right = { id: 'r', kind: 'object', box: { left: 300, top: 100, width: 100, height: 100 } };
    expect(magnetTarget({ x: 285, y: 150 }, [shape, right])?.id).toBe('r');
    expect(magnetTarget({ x: 270, y: 150 }, [shape, right])?.id).toBe('s');
  });
});
