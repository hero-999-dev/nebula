/**
 * 1.0.4, the owner: "what I meant by shapes like Lucid's: the catching at the
 * four sides should work well, we should be able to make mind maps, flowcharts
 * — like draw.io".
 *  - an arrow's end near the middle of a side holds that side, and stays on it;
 *  - an elbow leaves and arrives squarely, a curve bends out of the side;
 *  - a shape shows a dot at each side: dragged it draws an arrow, pressed it
 *    puts the next shape beside that side, joined.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  sidePoint, nearestSide, outwardAt, facingSide, branchPlace, initShapePorts,
  SIDES, SIDE_DIR, OPPOSITE, PORT_CATCH, BRANCH_GAP,
} from '../src/js/shape-ports.js';
import { arrowPath, elbowPoints, initArrows, STUB } from '../src/js/arrows.js';
import { makeShape } from '../src/js/shapes.js';

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

const BOX = { left: 100, top: 100, width: 200, height: 100 };
const near = (a, b) => expect(a).toBeCloseTo(b, 5);

describe('the four sides of a shape', () => {
  it('each has its middle on the outline, and a way out', () => {
    expect(sidePoint(BOX, 'top')).toEqual({ x: 200, y: 100, dx: 0, dy: -1 });
    expect(sidePoint(BOX, 'right')).toEqual({ x: 300, y: 150, dx: 1, dy: 0 });
    expect(sidePoint(BOX, 'bottom')).toEqual({ x: 200, y: 200, dx: 0, dy: 1 });
    expect(sidePoint(BOX, 'left')).toEqual({ x: 100, y: 150, dx: -1, dy: 0 });
  });

  it('turns with the shape', () => {
    const p = sidePoint(BOX, 'right', 'rect', 90);      // its right now points down
    near(p.x, 200); near(p.y, 250); near(p.dx, 0); near(p.dy, 1);
  });

  it('a triangle\'s left and right are the middles of its slanted edges', () => {
    expect(sidePoint(BOX, 'left', 'triangle').x).toBe(150);
    expect(sidePoint(BOX, 'right', 'triangle').x).toBe(250);
    expect(sidePoint(BOX, 'bottom', 'triangle')).toMatchObject({ x: 200, y: 200 });
  });

  it('an end holds a side only near its middle', () => {
    expect(nearestSide({ x: 296, y: 158 }, BOX)).toBe('right');
    expect(nearestSide({ x: 205, y: 90 }, BOX)).toBe('top');
    expect(nearestSide({ x: 200, y: 150 }, BOX)).toBe(null);                 // the middle of the shape
    expect(nearestSide({ x: 300, y: 150 + PORT_CATCH + 1 }, BOX)).toBe(null); // along the side, too far from its middle
    expect(nearestSide({ x: 200, y: 258 }, BOX, 'rect', 90)).toBe('right');  // turned: the right is below
  });

  it('knows the way out at any point of the outline', () => {
    expect(outwardAt(BOX, { x: 300, y: 120 })).toEqual([1, 0]);
    expect(outwardAt(BOX, { x: 130, y: 200 })).toEqual([0, 1]);
    const [dx, dy] = outwardAt(BOX, { x: 200, y: 250 }, 90);
    near(dx, 0); near(dy, 1);
  });

  it('a shape let go on open ground faces back along the drag', () => {
    expect(facingSide(120, 10)).toBe('left');
    expect(facingSide(-120, 10)).toBe('right');
    expect(facingSide(10, 90)).toBe('top');
    expect(facingSide(10, -90)).toBe('bottom');
  });

  it('the next shape goes beside the side, and under the last one put there', () => {
    const first = branchPlace(BOX, 'right');
    expect(first).toEqual({ left: 100 + 200 + BRANCH_GAP, top: 100 });
    const second = branchPlace(BOX, 'right', [{ ...BOX, ...first }]);
    expect(second).toEqual({ left: first.left, top: 100 + 100 + 24 });
    const third = branchPlace(BOX, 'right', [{ ...BOX, ...first }, { ...BOX, ...second }]);
    expect(third.top).toBe(second.top + 124);
    expect(branchPlace(BOX, 'bottom')).toEqual({ left: 100, top: 100 + 100 + BRANCH_GAP });
    expect(branchPlace({ ...BOX, left: 20 }, 'left').left).toBe(0);          // never off the page
  });
});

describe('an arrow that knows the ways out of its ends', () => {
  const legs = (points) => points.slice(1).map((p, i) => [Math.sign(p[0] - points[i][0]), Math.sign(p[1] - points[i][1])]);

  it('an elbow runs level and upright only, out of one side and into the other, whatever the two sides', () => {
    const spots = [[500, 300], [500, 20], [-200, 300], [-200, 20], [330, 400], [40, 160]];
    for (const a of SIDES) for (const b of SIDES) for (const [x2, y2] of spots) {
      const d1 = SIDE_DIR[a];
      const d2 = SIDE_DIR[b];
      const points = elbowPoints(300, 150, x2, y2, d1, d2);
      const ways = legs(points);
      for (const [sx, sy] of ways) expect(sx === 0 || sy === 0, `${a} to ${b} at ${x2},${y2}`).toBe(true);
      expect(ways[0]).toEqual(d1);                                            // out of the first side
      expect(ways[ways.length - 1]).toEqual([-d2[0] || 0, -d2[1] || 0]);      // into the second
      expect(points[0]).toEqual([300, 150]);
      expect(points[points.length - 1]).toEqual([x2, y2]);
    }
  });

  it('two sides that face each other turn half way between', () => {
    expect(arrowPath('elbow', 300, 150, 500, 300, [1, 0], [-1, 0]))
      .toBe(`M 300 150 L ${300 + STUB} 150 L 400 150 L 400 300 L ${500 - STUB} 300 L 500 300`);
  });

  it('a right side to a top below it turns once', () => {
    expect(arrowPath('elbow', 300, 150, 500, 300, [1, 0], [0, -1]))
      .toBe(`M 300 150 L ${300 + STUB} 150 L 500 150 L 500 ${300 - STUB} L 500 300`);
  });

  it('an end that holds nothing is met squarely from the one that does', () => {
    expect(arrowPath('elbow', 300, 150, 500, 300, [1, 0], null)).toBe(`M 300 150 L ${300 + STUB} 150 L ${300 + STUB} 300 L 500 300`);
  });

  it('a curve bends out of its sides; a straight arrow and an arrow that holds nothing are as they were', () => {
    expect(arrowPath('curve', 0, 0, 100, 100, [0, 1], [0, -1])).toMatch(/^M 0 0 C 0 [\d.]+, 100 [\d.]+, 100 100$/);
    expect(arrowPath('straight', 0, 0, 100, 50, [1, 0], [0, 1])).toBe(arrowPath('straight', 0, 0, 100, 50));
    expect(arrowPath('elbow', 0, 0, 100, 50)).toBe('M 0 0 L 50 0 L 50 50 L 100 50');
  });
});

/** A note with shapes laid by their styles: jsdom has no layout of its own. */
function page(places) {
  const editor = document.createElement('div');
  editor.innerHTML = '<div class="shape-layer" contenteditable="false"></div><p></p>';
  document.body.replaceChildren(editor);
  const px = (el, name) => parseFloat(el.style[name]) || 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
    if (this === editor) return { left: 0, top: 0, right: 2000, bottom: 2000, width: 2000, height: 2000 };
    if (!this.classList?.contains('shape')) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const [left, top, width, height] = [px(this, 'left'), px(this, 'top'), px(this, 'width'), px(this, 'height')];
    return { left, top, width, height, right: left + width, bottom: top + height };
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function w() { return px(this, 'width'); });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function h() { return px(this, 'height'); });
  const put = ([left, top]) => {
    const shape = makeShape('rect', undefined, { left, top });
    shape.style.width = '200px';
    shape.style.height = '100px';
    editor.firstChild.append(shape);
    return shape;
  };
  return { editor, shapes: places.map(put), put, arrow: () => editor.querySelector('.note-arrow') };
}
const at = (arrow) => [arrow.dataset.x1, arrow.dataset.y1, arrow.dataset.x2, arrow.dataset.y2].map(Number);
const mouse = (type, x, y, on = window) => on.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: x, clientY: y }));

describe('arrows on the sides of shapes', () => {
  it('a joined pair holds its sides, and keeps them when a shape moves', () => {
    const { editor, shapes: [a, b] } = page([[100, 100], [500, 300]]);
    const arrows = initArrows(editor, { history: { push() {} } });
    const arrow = arrows.link(a, 'right', b, 'left');
    expect(arrow.dataset.kind).toBe('elbow');
    expect(arrow.dataset.fromSide).toBe('right');
    expect(arrow.dataset.toSide).toBe('left');
    expect(at(arrow)).toEqual([300, 150, 500, 350]);
    expect(arrow.querySelector('.arrow-line').getAttribute('d')).toBe('M 300 150 L 316 150 L 400 150 L 400 350 L 484 350 L 500 350');

    b.style.left = '40px';          // carried to the far left: the arrow still enters its left side
    b.style.top = '400px';
    arrows.reflow();
    expect(at(arrow)).toEqual([300, 150, 40, 450]);
  });

  it('is of the kind last put from the bar', () => {
    const { editor, shapes: [a, b] } = page([[100, 100], [500, 300]]);
    const arrows = initArrows(editor, { history: { push() {} } });
    arrows.add('curve').remove();
    expect(arrows.link(a, 'bottom', b, 'top').dataset.kind).toBe('curve');
  });

  it('an end without a side faces the other end, as before', () => {
    const { editor, shapes: [a, b] } = page([[100, 100], [500, 100]]);
    const arrows = initArrows(editor, { history: { push() {} } });
    const arrow = arrows.link(a, null, b, null);
    expect(arrow.dataset.fromSide).toBeUndefined();
    expect(at(arrow)).toEqual([300, 150, 500, 150]);
  });

  it('drawn from a side and let go near the middle of another shape\'s side, it holds that side', () => {
    const { editor, shapes: [a, b], arrow } = page([[100, 100], [500, 300]]);
    const arrows = initArrows(editor, { history: { push() {} } });
    const shown = [];
    editor.addEventListener('nebula-arrow-target', (e) => shown.push(e.detail && { el: e.detail.el, side: e.detail.side }));
    const done = vi.fn();
    const ground = vi.fn();
    arrows.join(a, 'right', { clientX: 320, clientY: 150 }, { ground, done });
    mouse('mousemove', 495, 345);
    expect(shown).toEqual([{ el: b, side: 'left' }]);
    mouse('mouseup', 495, 345);
    expect(arrow().dataset.to).toBe(b.dataset.anchor);
    expect(arrow().dataset.toSide).toBe('left');
    expect(at(arrow())).toEqual([300, 150, 500, 350]);
    expect(shown[shown.length - 1]).toBe(null);
    expect(ground).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('let go inside a shape, away from its sides\' middles, it holds the shape without a side', () => {
    const { editor, shapes: [a], put, arrow } = page([[100, 100]]);
    const b = put([500, 300]);
    const arrows = initArrows(editor, { history: { push() {} } });
    arrows.join(a, 'right', { clientX: 320, clientY: 150 }, {});
    mouse('mousemove', 600, 350);
    mouse('mouseup', 600, 350);
    expect(arrow().dataset.to).toBe(b.dataset.anchor);
    expect(arrow().dataset.toSide).toBeUndefined();
  });

  it('let go on open ground, the ground gives it a shape to hold; let go at once, it is dropped', () => {
    const { editor, shapes: [a], put, arrow } = page([[100, 100]]);
    const arrows = initArrows(editor, { history: { push() {} } });
    let asked = null;
    arrows.join(a, 'right', { clientX: 320, clientY: 150 }, {
      ground: (to, from) => { asked = { to, from }; return { el: put([900, 500]), side: 'left' }; },
    });
    mouse('mousemove', 900, 550);
    mouse('mouseup', 900, 550);
    expect(asked).toEqual({ to: { x: 900, y: 550 }, from: { x: 300, y: 150 } });
    expect(arrow().dataset.toSide).toBe('left');
    expect(at(arrow())).toEqual([300, 150, 900, 550]);
    arrow().remove();

    const ground = vi.fn();
    const done = vi.fn();
    arrows.join(a, 'right', { clientX: 305, clientY: 150 }, { ground, done });
    mouse('mousemove', 310, 152);
    mouse('mouseup', 310, 152);
    expect(ground).not.toHaveBeenCalled();
    expect(arrow()).toBe(null);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('the dots at a shape\'s sides', () => {
  const setup = () => {
    const laid = page([[100, 100]]);
    const arrows = { join: vi.fn(), link: vi.fn() };
    const shapes = { select: vi.fn() };
    const history = { push: vi.fn() };
    const ports = initShapePorts(laid.editor, { history, shapes, arrows });
    const overlay = document.querySelector('.shape-ports');
    const dot = (side) => overlay.querySelector(`[data-side="${side}"]`);
    const hover = () => { mouse('mousemove', 200, 150, laid.shapes[0]); ports.refresh(); };
    return { ...laid, arrows, picker: shapes, history, ports, overlay, dot, hover };
  };
  const moveFree = (x, y, on = window) => on.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 0, clientX: x, clientY: y }));

  it('show outside the four sides of the shape under the pointer', () => {
    const { shapes: [a], overlay, dot, ports } = setup();
    expect(overlay.hidden).toBe(true);
    moveFree(200, 150, a);
    ports.refresh();
    expect(overlay.hidden).toBe(false);
    expect([dot('right').style.left, dot('right').style.top]).toEqual(['315px', '150px']);
    expect([dot('top').style.left, dot('top').style.top]).toEqual(['200px', '85px']);
    expect(overlay.querySelectorAll('.shape-port')).toHaveLength(4);
  });

  it('are not shown in a note that is only viewed', () => {
    const { editor, shapes: [a], overlay, ports } = setup();
    editor.dataset.readonly = 'true';
    moveFree(200, 150, a);
    ports.refresh();
    expect(overlay.hidden).toBe(true);
  });

  it('pressed, one puts a shape like the first beside that side, joined side to side', () => {
    const { editor, shapes: [a], dot, ports, arrows, picker, history } = setup();
    a.style.background = 'rgb(1, 2, 3)';
    moveFree(200, 150, a);
    ports.refresh();
    mouse('mousedown', 315, 150, dot('right'));
    mouse('mouseup', 315, 150);
    const all = editor.querySelectorAll('.shape');
    expect(all).toHaveLength(2);
    const next = all[1];
    expect([next.style.left, next.style.top, next.style.width]).toEqual([`${100 + 200 + BRANCH_GAP}px`, '100px', '200px']);
    expect(next.style.background).toBe('rgb(1, 2, 3)');
    expect(arrows.link).toHaveBeenCalledWith(a, 'right', next, OPPOSITE.right);
    expect(picker.select).toHaveBeenCalledWith(next);
    expect(history.push).toHaveBeenCalledTimes(1);
    expect(arrows.join).not.toHaveBeenCalled();
  });

  it('dragged, one draws an arrow from that side; on open ground a shape is put where it was let go', () => {
    const { editor, shapes: [a], dot, ports, arrows } = setup();
    moveFree(200, 150, a);
    ports.refresh();
    mouse('mousedown', 315, 150, dot('right'));
    mouse('mousemove', 330, 152);
    expect(arrows.join).toHaveBeenCalledTimes(1);
    const [shape, side, , hooks] = arrows.join.mock.calls[0];
    expect([shape, side]).toEqual([a, 'right']);
    const got = hooks.ground({ x: 700, y: 180 }, { x: 300, y: 150 });
    expect(got.side).toBe('left');
    expect([got.el.style.left, got.el.style.top]).toEqual(['700px', '130px']);   // its left side's middle where the hand let go
    expect(editor.querySelectorAll('.shape')).toHaveLength(2);
    hooks.done();
    mouse('mouseup', 700, 180);
    expect(arrows.link).not.toHaveBeenCalled();                                 // a drag is not a press
  });

  it('sit on the sides of what an arrow\'s end is over, the held one lit', () => {
    const { editor, shapes: [a], overlay, dot } = setup();
    editor.dispatchEvent(new CustomEvent('nebula-arrow-target', { detail: { el: a, side: 'bottom' } }));
    expect(overlay.hidden).toBe(false);
    expect(overlay.classList.contains('shape-ports--target')).toBe(true);
    expect([dot('bottom').style.left, dot('bottom').style.top]).toEqual(['200px', '200px']);
    expect(dot('bottom').classList.contains('on')).toBe(true);
    expect(dot('top').classList.contains('on')).toBe(false);
    editor.dispatchEvent(new CustomEvent('nebula-arrow-target', { detail: null }));
    expect(overlay.hidden).toBe(true);
  });
});
