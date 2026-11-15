// @vitest-environment jsdom
/**
 * 1.0.4, the two things left of the owner's plan for the arrows: a grip in the middle that bends
 * the line, and an elbow that goes round what stands between its ends.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { initArrows, arrowPath, bendSpot, elbowPoints, pathPoint, makeArrow } from '../src/js/arrows.js';
import { routeRound, crosses, wallsFor, grown, CLEAR } from '../src/js/arrow-route.js';
import { initShapes, makeShape } from '../src/js/shapes.js';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

/** A note with shapes laid by their styles (jsdom lays nothing out). */
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
  const put = ([left, top], kind = 'rect', size = [200, 100]) => {
    const shape = makeShape(kind, undefined, { left, top });
    shape.style.width = `${size[0]}px`;
    shape.style.height = `${size[1]}px`;
    editor.firstChild.append(shape);
    return shape;
  };
  return { editor, shapes: places.map((p) => put(p)), put };
}
const mouse = (type, x, y, on = window) => on.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: x, clientY: y }));
const history = { push() {} };
const corners = (arrow) => (arrow.querySelector('.arrow-line').getAttribute('d').match(/-?\d+(?:\.\d+)?/g) || []).map(Number)
  .reduce((out, v, i, all) => (i % 2 ? out : [...out, [v, all[i + 1]]]), [])
  // The corners only: the stubs and the half-way point lie on a run.
  .filter((p, i, all) => i === 0 || i === all.length - 1
    || !((all[i - 1][0] === p[0] && p[0] === all[i + 1][0]) || (all[i - 1][1] === p[1] && p[1] === all[i + 1][1])));

describe('the line with a bend', () => {
  it('a straight line unbent is as it was; bent, it is a bow whose middle is where the hand put it', () => {
    expect(arrowPath('straight', 0, 0, 100, 0, null, null, null)).toBe('M 0 0 L 100 0');
    expect(arrowPath('straight', 0, 0, 100, 0, null, null, [0, 0])).toBe('M 0 0 L 100 0');
    const d = arrowPath('straight', 0, 0, 100, 0, null, null, [0, 30]);
    expect(d).toContain('C');
    expect(pathPoint(d, 0.5)).toEqual({ x: 50, y: 30 });
    expect(bendSpot('straight', 0, 0, 100, 0, null, null, [0, 30])).toEqual({ x: 50, y: 30, axis: null });
    expect(bendSpot('straight', 0, 0, 100, 0)).toEqual({ x: 50, y: 0, axis: null });
  });

  it('a curve is moved by the same: its middle goes by the bend', () => {
    const plain = bendSpot('curve', 0, 0, 200, 100, [1, 0], [-1, 0]);
    const bent = bendSpot('curve', 0, 0, 200, 100, [1, 0], [-1, 0], [20, -40]);
    expect([bent.x - plain.x, bent.y - plain.y].map(Math.round)).toEqual([20, -40]);
    const at = pathPoint(arrowPath('curve', 0, 0, 200, 100, [1, 0], [-1, 0], [20, -40]), 0.5);
    expect([Math.round(at.x), Math.round(at.y)]).toEqual([Math.round(bent.x), Math.round(bent.y)]);
    // Unbent it is drawn as it always was.
    expect(arrowPath('curve', 0, 0, 10, 0)).toBe('M 0 0 C 5 0, 5 0, 10 0');
  });

  it('an elbow\'s middle leg goes across or down, between the two when they face each other', () => {
    // Facing: out of a right side at 100, into a left side at 400; the turn is half way, at 250.
    expect(bendSpot('elbow', 100, 50, 400, 250, [1, 0], [-1, 0])).toEqual({ x: 250, y: 150, axis: 0 });
    expect(elbowPoints(100, 50, 400, 250, [1, 0], [-1, 0], [60, 999])).toEqual([[100, 50], [116, 50], [310, 50], [310, 250], [384, 250], [400, 250]]);
    // Not past the stubs.
    expect(bendSpot('elbow', 100, 50, 400, 250, [1, 0], [-1, 0], [900, 0]).x).toBe(384);
    // Back to back: the leg between them goes up and down.
    expect(bendSpot('elbow', 100, 50, 400, 250, [-1, 0], [1, 0]).axis).toBe(1);
    // The same way out: further out only.
    const same = bendSpot('elbow', 100, 50, 400, 250, [1, 0], [1, 0]);
    expect(bendSpot('elbow', 100, 50, 400, 250, [1, 0], [1, 0], [-50, 0]).x).toBe(same.x);
    expect(bendSpot('elbow', 100, 50, 400, 250, [1, 0], [1, 0], [50, 0]).x).toBe(same.x + 50);
    // One corner: nothing to move.
    expect(bendSpot('elbow', 100, 50, 400, 250, [1, 0], [0, -1])).toBeNull();
    // An elbow that holds nothing: its upright leg goes across.
    expect(arrowPath('elbow', 0, 0, 10, 8, null, null, [2, 0])).toBe('M 0 0 L 7 0 L 7 8 L 10 8');
  });
});

describe('the grip that bends an arrow', () => {
  it('is on every arrow that can be bent, in the middle, and pulled it bends the line', () => {
    const { editor } = page([]);
    initArrows(editor, { history });
    const arrow = makeArrow('straight', { x1: 100, y1: 100, x2: 300, y2: 100 });
    editor.firstChild.append(arrow);
    const grip = arrow.querySelector('.arrow-bend');
    expect([grip.getAttribute('cx'), grip.getAttribute('cy')]).toEqual(['200', '100']);
    expect(grip.getAttribute('fill')).toBe('none');           // nothing of it without the app's looks
    mouse('mousedown', 200, 100, grip);
    mouse('mousemove', 210, 140);
    mouse('mouseup', 210, 140);
    expect(arrow.dataset.bend).toBe('10,40');
    expect([grip.getAttribute('cx'), grip.getAttribute('cy')]).toEqual(['210', '140']);
    expect(arrow.querySelector('.arrow-line').getAttribute('d')).toContain('C');
    expect(arrow.querySelector('.arrow-hit').getAttribute('d')).toBe(arrow.querySelector('.arrow-line').getAttribute('d'));
    expect([arrow.dataset.x1, arrow.dataset.x2]).toEqual(['100', '300']);   // the ends stay
  });

  it('pressed and not moved it changes nothing; double-clicked, the bend is taken back', () => {
    const { editor } = page([]);
    initArrows(editor, { history });
    const arrow = makeArrow('straight', { x1: 100, y1: 100, x2: 300, y2: 100 });
    editor.firstChild.append(arrow);
    const grip = arrow.querySelector('.arrow-bend');
    mouse('mousedown', 200, 100, grip);
    mouse('mouseup', 200, 100);
    expect(arrow.dataset.bend).toBeUndefined();
    mouse('mousedown', 200, 100, grip);
    mouse('mousemove', 200, 150);
    mouse('mouseup', 200, 150);
    expect(arrow.dataset.bend).toBe('0,50');
    mouse('dblclick', 200, 150, grip);
    expect(arrow.dataset.bend).toBeUndefined();
    expect(arrow.querySelector('.arrow-line').getAttribute('d')).toBe('M 100 100 L 300 100');
  });

  it('an elbow between two shapes: the leg goes across only, and travels with the shapes', () => {
    const { editor, shapes: [a, b] } = page([[100, 100], [600, 300]]);
    const arrows = initArrows(editor, { history });
    const arrow = arrows.link(a, 'right', b, 'left');
    const grip = arrow.querySelector('.arrow-bend');
    expect([grip.getAttribute('cx'), grip.getAttribute('cy')]).toEqual(['450', '250']);
    mouse('mousedown', 450, 250, grip);
    mouse('mousemove', 500, 400);
    mouse('mouseup', 500, 400);
    expect(arrow.dataset.bend).toBe('50,0');
    expect(corners(arrow)).toEqual([[300, 150], [500, 150], [500, 350], [600, 350]]);
    b.style.left = '700px';
    arrows.reflow();
    expect(corners(arrow)[1][0]).toBe(550);                   // half way, and the 50 the hand gave
  });

  it('another kind of line from the bar begins unbent', () => {
    const { editor } = page([]);
    const arrows = initArrows(editor, { history });
    const arrow = makeArrow('straight', { x1: 100, y1: 100, x2: 300, y2: 100 });
    editor.firstChild.append(arrow);
    arrow.dataset.bend = '0,40';
    arrows.reflow();
    mouse('mousedown', 150, 110, arrow.querySelector('.arrow-hit'));
    mouse('mouseup', 150, 110);
    document.querySelector('#arrow-bar [data-arrow="curve"]').click();
    expect(arrow.dataset.kind).toBe('curve');
    expect(arrow.dataset.bend).toBeUndefined();
  });
});

describe('the way round', () => {
  const wall = grown({ left: 300, top: 100, width: 100, height: 100 });   // 290..410 across, 90..210 down

  it('a leg along the edge of a box is not through it; one inside is', () => {
    expect(CLEAR).toBeLessThan(16);
    expect(crosses([[0, 150], [600, 150]], [wall])).toBe(true);
    expect(crosses([[0, 90], [600, 90]], [wall])).toBe(false);
    expect(crosses([[0, 150], [200, 150], [200, 400]], [wall])).toBe(false);
  });

  it('goes round a box standing between the ends, by the shorter side, with no leg through it', () => {
    const way = routeRound([100, 140], [600, 140], [1, 0], [-1, 0], [wall]);
    expect(way[0]).toEqual([100, 140]);
    expect(way.at(-1)).toEqual([600, 140]);
    expect(crosses(way, [wall])).toBe(false);
    expect(way.some((p) => p[1] === 90)).toBe(true);          // over it: 50 up, not 70 down
    expect(way.every((p, i) => i === 0 || p[0] === way[i - 1][0] || p[1] === way[i - 1][1])).toBe(true);
    // Down to its own level again past the box: it arrives squarely, not with a corner at the end.
    expect(way).toEqual([[100, 140], [290, 140], [290, 90], [410, 90], [410, 140], [600, 140]]);
  });

  it('of two ways as long, the one that turns nearer the middle, not at the far end', () => {
    // A box on the upright leg of a step down: beside the box, not down along the end's stub.
    const box = grown({ left: 358, top: 176, width: 110, height: 110 });   // 348..478 across
    const way = routeRound([229, 136], [597, 326], [1, 0], [-1, 0], [box]);
    expect(way).toHaveLength(4);
    expect([348, 478]).toContain(way[1][0]);
    expect(crosses(way, [box])).toBe(false);
  });

  it('nothing in the way: the straight run; no way at all: null', () => {
    expect(routeRound([100, 50], [600, 50], [1, 0], [-1, 0], [wall])).toEqual([[100, 50], [600, 50]]);
    const shut = [{ left: 550, top: 0, right: 560, bottom: 400 }, { left: 550, top: 0, right: 700, bottom: 10 },
      { left: 690, top: 0, right: 700, bottom: 400 }, { left: 550, top: 390, right: 700, bottom: 400 }];
    expect(routeRound([100, 140], [620, 140], [1, 0], null, shut)).toBeNull();
  });

  it('a box an end stands in, or one far off, does not count', () => {
    const far = { left: 2000, top: 2000, right: 2100, bottom: 2100 };
    const own = { left: 80, top: 100, right: 180, bottom: 180 };
    expect(wallsFor([100, 140], [600, 140], [wall, far, own])).toEqual([wall]);
  });
});

describe('an elbow arrow between shapes', () => {
  it('goes round a shape that stands between them, and is its own line again when the shape is gone', () => {
    const { editor, shapes: [a, b], put } = page([[100, 100], [700, 100]]);
    const arrows = initArrows(editor, { history });
    const arrow = arrows.link(a, 'right', b, 'left');
    expect(corners(arrow)).toEqual([[300, 150], [700, 150]]);
    const between = put([450, 110], 'rect', [100, 100]);     // 450..550 across, 110..210 down
    arrows.reflow();
    const round = corners(arrow);
    expect(round[0]).toEqual([300, 150]);
    expect(round.at(-1)).toEqual([700, 150]);
    expect(crosses(round, [grown({ left: 450, top: 110, width: 100, height: 100 }, CLEAR - 1)])).toBe(false);
    expect(round.some((p) => p[1] === 100)).toBe(true);       // over it, ten clear of its top
    expect(arrow.querySelector('.arrow-hit').getAttribute('d')).toBe(arrow.querySelector('.arrow-line').getAttribute('d'));
    between.remove();
    arrows.reflow();
    expect(corners(arrow)).toEqual([[300, 150], [700, 150]]);
  });

  it('a line the hand bent is left as the hand put it; a straight or curved one is never sent round', () => {
    const { editor, shapes: [a, b], put } = page([[100, 100], [700, 300]]);
    const arrows = initArrows(editor, { history });
    const arrow = arrows.link(a, 'right', b, 'left');
    put([450, 200], 'rect', [100, 100]);                      // on the upright leg at 500
    arrows.reflow();
    const round = corners(arrow);
    expect(round[0]).toEqual([300, 150]);
    expect(round.at(-1)).toEqual([700, 350]);
    expect(round.some((p) => p[0] === 500)).toBe(false);      // the upright leg stands beside the box now
    expect(crosses(round, [grown({ left: 450, top: 200, width: 100, height: 100 }, CLEAR - 1)])).toBe(false);
    arrow.dataset.bend = '-20,0';
    arrows.reflow();
    expect(corners(arrow)).toEqual([[300, 150], [480, 150], [480, 350], [700, 350]]);
    delete arrow.dataset.bend;
    arrow.dataset.kind = 'straight';
    arrows.reflow();
    expect(arrow.querySelector('.arrow-line').getAttribute('d')).toBe('M 300 150 L 700 350');
  });

  it('a shape put down or deleted has the arrows look for their way again', () => {
    const { editor } = page([]);
    const onGeometry = vi.fn();
    const shapes = initShapes(editor, { history, onGeometry });
    shapes.addShape('rect', { left: 100, top: 100 });
    expect(onGeometry).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(editor.querySelector('.shape')).toBeNull();
    expect(onGeometry).toHaveBeenCalledTimes(2);
  });

  it('a work area and the label riding the arrow are not in its way; an arrow that holds nothing lies where it was laid', () => {
    const { editor, shapes: [a, b], put } = page([[100, 100], [700, 100]]);
    const arrows = initArrows(editor, { history });
    const arrow = arrows.link(a, 'right', b, 'left');
    arrow.dataset.aid = 'r-9';
    put([350, 50], 'area', [300, 250]);
    const label = put([460, 135], 'textbox', [80, 30]);
    label.dataset.rides = 'r-9';
    label.dataset.rideT = '0.5';
    arrows.reflow();
    expect(corners(arrow)).toEqual([[300, 150], [700, 150]]);
    const loose = makeArrow('elbow', { x1: 150, y1: 300, x2: 800, y2: 320 });
    editor.firstChild.append(loose);
    put([450, 260], 'rect', [100, 100]);
    arrows.reflow();
    expect(corners(loose)).toHaveLength(4);
    expect(corners(loose)[1]).toEqual([475, 300]);
  });
});
