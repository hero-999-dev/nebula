// @vitest-environment jsdom
/**
 * 1.0.4, the owner on the arrows: "let them be edited, they are clumsy and join at four places
 * only; a text box first among the shapes, a work area second that the pieces of a flowchart go
 * in and that moves as one piece; text boxes that hold on above and below the arrows; nothing
 * round a text box, thin lines when it is clicked".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { edgeSpot, spotPoint, EDGE_DEPTH } from '../src/js/shape-ports.js';
import { initArrows, pathPoint, dress, makeArrow, LABEL_CATCH, HIT_WIDTH } from '../src/js/arrows.js';
import { makeShape, addShape, carriedBy, initShapes, AREA_FILL } from '../src/js/shapes.js';
import { SHAPE_TILES } from '../src/js/toolbar.js';
import { rebuildShapeChrome } from '../src/js/migrate.js';
import { isPlacing, cancelPlacing } from '../src/js/place.js';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

const BOX = { left: 100, top: 100, width: 200, height: 100 };

describe('a place on the outline', () => {
  it('an end let go just inside an edge holds the edge right there', () => {
    expect(edgeSpot({ x: 295, y: 120 }, BOX)).toEqual({ u: 1, v: -0.6 });
    expect(spotPoint(BOX, 1, -0.6)).toEqual({ x: 300, y: 120 });
    expect(edgeSpot({ x: 140, y: 104 }, BOX)).toEqual({ u: -0.6, v: -1 });
  });

  it('a point outside goes to the nearest of the outline, a corner too', () => {
    expect(edgeSpot({ x: 320, y: 90 }, BOX)).toEqual({ u: 1, v: -1 });
    expect(edgeSpot({ x: 150, y: 215 }, BOX)).toEqual({ u: -0.5, v: 1 });
  });

  it('deep inside it is the object as a whole, as it was', () => {
    expect(edgeSpot({ x: 200, y: 150 }, BOX)).toBeNull();
    expect(edgeSpot({ x: 200, y: 150 }, BOX, 'rect', 0, 60)).not.toBeNull();
    expect(EDGE_DEPTH).toBeGreaterThan(8);
  });

  it('the place stays its share of the shape when the shape grows or moves', () => {
    expect(spotPoint({ left: 0, top: 0, width: 400, height: 200 }, 1, -0.6)).toEqual({ x: 400, y: 40 });
    expect(spotPoint({ left: 50, top: 50, width: 200, height: 100 }, -0.5, 1)).toEqual({ x: 100, y: 150 });
  });

  it('on a round shape the place lies on the curve, not on the box', () => {
    const spot = edgeSpot({ x: 268, y: 118 }, BOX, 'ellipse');
    expect(spot).not.toBeNull();
    const p = spotPoint(BOX, spot.u, spot.v, 'ellipse');
    expect(((p.x - 200) / 100) ** 2 + ((p.y - 150) / 50) ** 2).toBeCloseTo(1, 1);
    // The corner of its box is not on it: nothing to hold there.
    const corner = edgeSpot({ x: 299, y: 101 }, BOX, 'ellipse');
    const q = spotPoint(BOX, corner.u, corner.v, 'ellipse');
    expect(q.x).toBeLessThan(295);
  });

  it('a turned shape is read in its own frame', () => {
    // Turned a quarter, the right edge points down: a point under the middle is on it.
    const spot = edgeSpot({ x: 200, y: 245 }, BOX, 'rect', 90);
    expect(spot).toEqual({ u: 1, v: 0 });
    const p = spotPoint(BOX, 1, 0, 'rect', 90);
    expect(Math.round(p.x)).toBe(200);
    expect(Math.round(p.y)).toBe(250);
  });
});

describe('a share of the way along a line', () => {
  it('goes by the length of the legs', () => {
    expect(pathPoint('M 0 0 L 100 0 L 100 100', 0.25)).toEqual({ x: 50, y: 0 });
    expect(pathPoint('M 0 0 L 100 0 L 100 100', 0.5)).toEqual({ x: 100, y: 0 });
    expect(pathPoint('M 0 0 L 100 0 L 100 100', 1)).toEqual({ x: 100, y: 100 });
    expect(pathPoint('M 10 10 L 110 10', 0.5)).toEqual({ x: 60, y: 10 });
  });
  it('follows a curve', () => {
    const p = pathPoint('M 0 0 C 0 100, 100 100, 100 0', 0.5);
    expect(p.x).toBe(50);
    expect(p.y).toBe(75);
  });
  it('is held between the ends', () => {
    expect(pathPoint('M 0 0 L 100 0', 7)).toEqual({ x: 100, y: 0 });
    expect(pathPoint('M 0 0 L 100 0', -1)).toEqual({ x: 0, y: 0 });
  });
});

describe('heads and line', () => {
  it('are written on the line itself', () => {
    const arrow = makeArrow('straight');
    const line = arrow.querySelector('.arrow-line');
    dress(arrow);
    expect(line.getAttribute('marker-end')).toMatch(/^url\(#/);
    expect(line.hasAttribute('marker-start')).toBe(false);
    arrow.dataset.heads = 'both';
    arrow.dataset.dash = '1';
    dress(arrow);
    expect(line.getAttribute('marker-start')).toBe(line.getAttribute('marker-end'));
    expect(line.getAttribute('stroke-dasharray')).toBe('6 5');
    expect(arrow.querySelector('marker').getAttribute('orient')).toBe('auto-start-reverse');
    arrow.dataset.heads = 'none';
    delete arrow.dataset.dash;
    dress(arrow);
    expect(line.hasAttribute('marker-end')).toBe(false);
    expect(line.hasAttribute('marker-start')).toBe(false);
    expect(line.hasAttribute('stroke-dasharray')).toBe(false);
  });
});

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

describe('an end that holds a place on the outline', () => {
  it('is let go at the edge, away from the middles, and stays there when the shape moves', () => {
    const { editor, shapes: [a, b] } = page([[100, 100], [600, 100]]);
    const arrows = initArrows(editor, { history });
    const arrow = arrows.link(a, 'right', b, 'left');
    // The end at b is taken and let go near b's top edge, well left of its middle.
    const end = arrow.querySelector('.arrow-end[data-end="to"]');
    mouse('mousedown', 600, 150, end);
    mouse('mousemove', 640, 103);
    mouse('mouseup', 640, 103);
    expect(arrow.dataset.toSide).toBeUndefined();
    expect(arrow.dataset.toAt).toBe('-0.6,-1');
    expect([arrow.dataset.x2, arrow.dataset.y2].map(Number)).toEqual([640, 100]);
    b.style.left = '700px';
    b.style.top = '300px';
    arrows.reflow();
    expect([arrow.dataset.x2, arrow.dataset.y2].map(Number)).toEqual([740, 300]);
  });

  it('by the middle of a side it is the side still', () => {
    const { editor, shapes: [a, b] } = page([[100, 100], [600, 100]]);
    const arrows = initArrows(editor, { history });
    const arrow = arrows.link(a, 'right', b, 'left');
    mouse('mousedown', 600, 150, arrow.querySelector('.arrow-end[data-end="to"]'));
    mouse('mousemove', 705, 104);
    mouse('mouseup', 705, 104);
    expect(arrow.dataset.toSide).toBe('top');
    expect(arrow.dataset.toAt).toBeUndefined();
  });
});

describe('the bar of a picked arrow', () => {
  function picked() {
    const laid = page([[100, 100], [600, 100]]);
    const arrows = initArrows(laid.editor, { history });
    const arrow = arrows.link(laid.shapes[0], 'right', laid.shapes[1], 'left');
    mouse('mousedown', 450, 150, arrow.querySelector('.arrow-line'));
    mouse('mouseup', 450, 150);
    const bar = document.getElementById('arrow-bar');
    const press = (act) => bar.querySelector(`[data-arrow="${act}"]`).click();
    return { ...laid, arrows, arrow, bar, press };
  }

  it('shows for the picked arrow and goes with it', () => {
    const { arrow, bar, arrows } = picked();
    expect(arrow.classList.contains('is-selected')).toBe(true);
    expect(bar.hidden).toBe(false);
    expect(bar.querySelector('[data-arrow="elbow"]').classList.contains('on')).toBe(true);
    arrows.reset();
    expect(bar.hidden).toBe(true);
    expect(arrow.classList.contains('is-selected')).toBe(false);
  });

  it('changes the kind of the line, and keeps what it holds', () => {
    const { arrow, press, bar } = picked();
    press('straight');
    expect(arrow.dataset.kind).toBe('straight');
    expect(arrow.querySelector('.arrow-line').getAttribute('d')).not.toContain('C');
    press('curve');
    expect(arrow.dataset.kind).toBe('curve');
    expect(arrow.querySelector('.arrow-line').getAttribute('d')).toContain('C');
    expect(bar.querySelector('[data-arrow="curve"]').classList.contains('on')).toBe(true);
    expect(arrow.dataset.fromSide).toBe('right');
    expect(arrow.dataset.toSide).toBe('left');
  });

  // The owner, 1.0.4: "1. tık çift yön yapıyor, 2. tık ters yön, 3. tık oksuz, 4. tık orijinale göre olsun".
  it('turns the heads: both ways, the other way, none, the one it had', () => {
    const { arrow, press } = picked();
    const line = arrow.querySelector('.arrow-line');
    press('heads');
    expect(arrow.dataset.heads).toBe('both');
    expect(line.hasAttribute('marker-start')).toBe(true);
    expect(line.hasAttribute('marker-end')).toBe(true);
    press('heads');
    expect(arrow.dataset.heads).toBe('start');
    expect(line.hasAttribute('marker-start')).toBe(true);
    expect(line.hasAttribute('marker-end')).toBe(false);
    press('heads');
    expect(arrow.dataset.heads).toBe('none');
    expect(line.hasAttribute('marker-start')).toBe(false);
    expect(line.hasAttribute('marker-end')).toBe(false);
    press('heads');
    expect(arrow.dataset.heads).toBeUndefined();
    expect(line.hasAttribute('marker-end')).toBe(true);
    expect(line.hasAttribute('marker-start')).toBe(false);
  });

  it('dashes the line and makes it whole again', () => {
    const { arrow, press, bar } = picked();
    press('dash');
    expect(arrow.dataset.dash).toBe('1');
    expect(bar.querySelector('[data-arrow="dash"]').classList.contains('on')).toBe(true);
    press('dash');
    expect(arrow.dataset.dash).toBeUndefined();
    expect(arrow.querySelector('.arrow-line').hasAttribute('stroke-dasharray')).toBe(false);
  });

  it('puts a label on the line: a text box that rides the arrow', () => {
    const laid = page([[100, 100], [600, 100]]);
    const edit = vi.fn();
    const arrows = initArrows(laid.editor, { history, shapes: { edit } });
    const arrow = arrows.link(laid.shapes[0], 'right', laid.shapes[1], 'left');
    mouse('mousedown', 450, 150, arrow.querySelector('.arrow-line'));
    mouse('mouseup', 450, 150);
    document.getElementById('arrow-bar').querySelector('[data-arrow="label"]').click();
    const box = laid.editor.querySelector('.shape.textbox');
    expect(box).not.toBeNull();
    expect(box.dataset.rides).toBe(arrow.dataset.aid);
    expect(edit).toHaveBeenCalledWith(box);
    // The line runs from (300,150) to (600,150): the label sits over its middle.
    expect(parseFloat(box.style.left) + 45).toBe(450);
    expect(parseFloat(box.style.top) + 17).toBe(128);
    // The shapes move apart: the label keeps the middle.
    laid.shapes[1].style.left = '800px';
    arrows.reflow();
    expect(parseFloat(box.style.left) + 45).toBe(550);
  });

  it('deletes the arrow and leaves its labels their own', () => {
    const { arrow, press, bar, editor, arrows } = picked();
    const box = makeShape('textbox', undefined, { left: 400, top: 100 });
    box.style.width = '100px';
    box.style.height = '40px';
    editor.firstChild.append(box);
    expect(arrows.catchLabel(box)).toBe(true);
    press('del');
    expect(arrow.isConnected).toBe(false);
    expect(bar.hidden).toBe(true);
    expect(box.isConnected).toBe(true);
    expect(box.dataset.rides).toBeUndefined();
    expect(box.dataset.rideT).toBeUndefined();
  });
});

describe('a text box by an arrow', () => {
  function laidOut() {
    const laid = page([[100, 100], [600, 100]]);
    const arrows = initArrows(laid.editor, { history });
    const arrow = arrows.link(laid.shapes[0], 'right', laid.shapes[1], 'left');   // (300,150) → (600,150)
    return { ...laid, arrows, arrow };
  }

  it('let go above the line rides above it, below it below', () => {
    const { arrows, arrow, put, shapes: [, b] } = laidOut();
    const over = put([400, 105], 'textbox', [100, 30]);     // middle (450,120): 30 above
    const under = put([330, 160], 'textbox', [100, 30]);    // middle (380,175): 25 below
    expect(arrows.catchLabel(over)).toBe(true);
    expect(arrows.catchLabel(under)).toBe(true);
    expect(over.dataset.rides).toBe(arrow.dataset.aid);
    expect(Number(over.dataset.rideDy)).toBe(-30);
    expect(Number(under.dataset.rideDy)).toBe(25);
    expect(Number(over.dataset.rideT)).toBeCloseTo(0.5, 1);
    // The far shape goes down: the line bends, the labels go with it and keep their sides.
    b.style.top = '100px';
    b.style.left = '900px';
    arrows.reflow();
    expect(parseFloat(over.style.left) + 50).toBeGreaterThan(550);
    expect(parseFloat(over.style.top) + 15).toBe(120);
    expect(parseFloat(under.style.top) + 15).toBe(175);
  });

  it('let go away from every line is its own', () => {
    const { arrows, put } = laidOut();
    const far = put([400, 400], 'textbox', [100, 30]);
    far.dataset.rides = 'r-gone';
    far.dataset.rideT = '0.5';
    expect(arrows.catchLabel(far)).toBe(false);
    expect(far.dataset.rides).toBeUndefined();
    expect(far.dataset.rideT).toBeUndefined();
    expect(LABEL_CATCH).toBeLessThan(60);
  });

  it('only a text box rides; a shape let go on a line stays a shape', () => {
    const { arrows, put } = laidOut();
    const shape = put([400, 120], 'rect', [100, 60]);
    expect(arrows.catchLabel(shape)).toBe(false);
    expect(shape.dataset.rides).toBeUndefined();
  });

  it('the arrow that would take a carried box is lit, and no longer once it is let go', () => {
    const { arrows, arrow, put } = laidOut();
    const box = put([400, 105], 'textbox', [100, 30]);
    arrows.hint(box);
    expect(arrow.classList.contains('is-catching')).toBe(true);
    box.style.top = '500px';
    arrows.hint(box);
    expect(arrow.classList.contains('is-catching')).toBe(false);
    box.style.top = '105px';
    arrows.hint(box);
    arrows.catchLabel(box);
    expect(arrow.classList.contains('is-catching')).toBe(false);
  });
});

describe('the text box and the work area', () => {
  it('come first and second among the shapes', () => {
    expect(SHAPE_TILES.slice(0, 3).map((t) => t.kind)).toEqual(['textbox', 'area', 'rect']);
    expect(SHAPE_TILES[0].label).toBe('Text box');
    expect(SHAPE_TILES[1].label).toBe('Work area');
  });

  it('a text box has nothing round it; a work area is wide and faint', () => {
    const box = makeShape('textbox');
    expect(box.classList.contains('textbox')).toBe(true);
    expect(box.style.background).toBe('transparent');
    expect(box.querySelector('.shape-text')).not.toBeNull();
    const area = makeShape('area');
    expect(area.style.width).toBe('360px');
    expect(area.style.height).toBe('240px');
    expect(area.style.background.replace(/\s/g, '')).toBe(AREA_FILL.replace(/\s/g, ''));
  });

  it('a work area goes under the shapes that are there', () => {
    const { editor, shapes: [a] } = page([[100, 100]]);
    const area = addShape(editor, 'area', history);
    expect(area.parentElement.firstElementChild).toBe(area);
    expect(a.compareDocumentPosition(area) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('a work area carries the shapes whose middle lies in it, and the loose ends of arrows in it', () => {
    const { editor, put } = page([]);
    const area = put([100, 100], 'area', [400, 300]);
    const inside = put([150, 150], 'rect', [100, 60]);
    const half = put([460, 200], 'rect', [100, 60]);      // middle at x 510: outside
    const out = put([700, 100], 'rect', [100, 60]);
    const loose = makeArrow('straight', { x1: 200, y1: 300, x2: 900, y2: 300 });
    editor.firstChild.append(loose);
    const held = makeArrow('straight', { x1: 250, y1: 180, x2: 300, y2: 350 });
    held.dataset.from = 'a-1';
    inside.dataset.anchor = 'a-1';                       // it holds a shape the area carries
    editor.firstChild.append(held);
    const got = carriedBy(area, editor);
    expect(got.shapes.map((s) => s.el)).toEqual([inside]);
    expect(got.shapes.some((s) => s.el === half || s.el === out || s.el === area)).toBe(false);
    expect(got.ends.map((e) => [e.el, e.x])).toEqual([[loose, 'x1'], [held, 'x2']]);
  });

  it('moved, the area takes them along as one piece; moved alone, a shape leaves the rest', () => {
    const { editor, put } = page([]);
    const area = put([100, 100], 'area', [400, 300]);
    const inside = put([150, 150], 'rect', [100, 60]);
    const out = put([700, 100], 'rect', [100, 60]);
    const loose = makeArrow('straight', { x1: 200, y1: 300, x2: 900, y2: 300 });
    editor.firstChild.append(loose);
    const onGeometry = vi.fn();
    initShapes(editor, { history, onGeometry });
    mouse('mousedown', 480, 380, area);
    mouse('mousemove', 540, 420);
    mouse('mouseup', 540, 420);
    expect([area.style.left, area.style.top]).toEqual(['160px', '140px']);
    expect([inside.style.left, inside.style.top]).toEqual(['210px', '190px']);
    expect([out.style.left, out.style.top]).toEqual(['700px', '100px']);
    expect([loose.dataset.x1, loose.dataset.y1, loose.dataset.x2]).toEqual(['260', '340', '900']);
    expect(onGeometry).toHaveBeenCalled();
    // The shape in it is taken by itself: the area stays.
    mouse('mousedown', 260, 220, inside);
    mouse('mousemove', 300, 220);
    mouse('mouseup', 300, 220);
    expect(inside.style.left).toBe('250px');
    expect(area.style.left).toBe('160px');
  });

  it('a text box that rode an arrow is free while it is carried, and is offered to the arrows when let go', () => {
    const { editor, put } = page([]);
    const box = put([400, 105], 'textbox', [100, 30]);
    box.dataset.rides = 'r-1';
    box.dataset.rideT = '0.5';
    const onDrag = vi.fn();
    const onDrop = vi.fn();
    initShapes(editor, { history, onDrag, onDrop });
    mouse('mousedown', 450, 120, box);
    mouse('mousemove', 450, 220);
    expect(box.dataset.rides).toBeUndefined();
    expect(onDrag).toHaveBeenCalledWith(box);
    mouse('mouseup', 450, 220);
    expect(onDrop).toHaveBeenCalledWith(box);
  });
});

describe('what the owner found in the 00:19 build', () => {
  it('an arrow is caught anywhere along its line: a wide unseen line lies under the thin one', () => {
    const arrow = makeArrow('elbow', { x1: 0, y1: 0, x2: 200, y2: 100 });
    const hit = arrow.querySelector('.arrow-hit');
    const line = arrow.querySelector('.arrow-line');
    expect(hit.getAttribute('d')).toBe(line.getAttribute('d'));
    expect(Number(hit.getAttribute('stroke-width'))).toBe(HIT_WIDTH);
    expect(HIT_WIDTH).toBeGreaterThanOrEqual(12);
    expect(hit.getAttribute('stroke')).toBe('transparent');
    expect(hit.getAttribute('fill')).toBe('none');
    expect(hit.nextElementSibling).toBe(line);
    expect(arrow.querySelectorAll('.arrow-hit')).toHaveLength(1);
  });

  it('an arrow drawn before gets its wide line when it is painted, once, and a press on it picks the arrow', () => {
    const { editor, shapes: [a, b] } = page([[100, 100], [600, 300]]);
    const arrows = initArrows(editor, { history });
    const arrow = arrows.link(a, 'right', b, 'left');
    arrow.querySelector('.arrow-hit').remove();          // as a note saved by an older build has it
    arrows.reflow();
    arrows.reflow();
    const hits = arrow.querySelectorAll('.arrow-hit');
    expect(hits).toHaveLength(1);
    expect(hits[0].getAttribute('d')).toBe(arrow.querySelector('.arrow-line').getAttribute('d'));
    mouse('mousedown', 450, 200, hits[0]);
    mouse('mouseup', 450, 200);
    expect(arrow.classList.contains('is-selected')).toBe(true);
    expect(document.getElementById('arrow-bar').hidden).toBe(false);
    // The wide line follows the thin one when a shape moves.
    b.style.top = '500px';
    arrows.reflow();
    expect(hits[0].getAttribute('d')).toBe(arrow.querySelector('.arrow-line').getAttribute('d'));
  });

  it('a fill is taken back: the first dot of the shape bar empties it', () => {
    const { editor, put } = page([]);
    const bar = document.createElement('div');
    bar.id = 'shape-bar';
    document.body.append(bar);
    const box = put([100, 100], 'textbox', [150, 40]);
    const area = put([400, 100], 'area', [360, 240]);
    initShapes(editor, { history });
    const dots = [...bar.querySelectorAll('.dot')];
    expect(dots[0].dataset.color).toBe('none');
    expect(dots[0].title).toBe('No fill');
    expect(dots).toHaveLength(7);
    const pick = (el, x, y) => { mouse('mousedown', x, y, el); mouse('mouseup', x, y); };
    pick(box, 170, 120);
    dots[2].click();
    expect(box.style.background).not.toBe('transparent');
    dots[0].click();
    expect(box.style.background).toBe('transparent');
    expect(box.style.getPropertyValue('--shape-fill')).toBe('transparent');
    // A work area goes back to its own faint ground, not to nothing.
    pick(area, 700, 320);
    dots[3].click();
    dots[0].click();
    expect(area.style.background.replace(/s/g, '')).toBe(AREA_FILL.replace(/s/g, ''));
  });
});

describe('what the owner found in the 01:26 build', () => {
  afterEach(() => cancelPlacing());

  it('a shape chosen from the bar is not put at once: a faint one follows the pointer until a press in the note', () => {
    const { editor } = page([]);
    const shapes = initShapes(editor, { history });
    shapes.place('rect');
    expect(editor.querySelectorAll('.shape')).toHaveLength(0);
    const ghost = document.querySelector('body > .place-ghost');
    expect(ghost.querySelector('.shape.rect')).toBeTruthy();
    expect(editor.contains(ghost)).toBe(false);          // no part of the note: nothing of it is saved
    expect(isPlacing()).toBe(true);
    mouse('mousemove', 400, 300, document.body);
    expect([ghost.style.left, ghost.style.top]).toEqual(['400px', '300px']);
    mouse('mousedown', 400, 300, editor.querySelector('p'));
    const put = editor.querySelector('.shape.rect');
    expect([put.style.left, put.style.top]).toEqual(['325px', '255px']);   // its middle under the pointer
    expect(put.classList.contains('sel')).toBe(true);
    expect(document.querySelector('.place-ghost')).toBeNull();
    expect(isPlacing()).toBe(false);
  });

  it('Esc or a press outside the note lets it go, and a note that is only viewed takes none', () => {
    const { editor } = page([]);
    const shapes = initShapes(editor, { history });
    shapes.place('area');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isPlacing()).toBe(false);
    shapes.place('area');
    const aside = document.createElement('div');
    document.body.append(aside);
    mouse('mousedown', 5, 5, aside);
    expect(isPlacing()).toBe(false);
    expect(document.querySelector('.place-ghost')).toBeNull();
    expect(editor.querySelectorAll('.shape')).toHaveLength(0);
    editor.dataset.readonly = 'true';
    shapes.place('rect');
    expect(isPlacing()).toBe(false);
  });

  it('an arrow from the bar the same way: put where the press is, its middle under the pointer', () => {
    const { editor } = page([]);
    const arrows = initArrows(editor, { history });
    arrows.place('elbow');
    expect(editor.querySelector('.note-arrow')).toBeNull();
    expect(document.querySelector('.place-ghost svg path')).toBeTruthy();
    mouse('mousedown', 500, 400, editor.querySelector('p'));
    const arrow = editor.querySelector('.note-arrow');
    expect(arrow.dataset.kind).toBe('elbow');
    expect([arrow.dataset.x1, arrow.dataset.y1, arrow.dataset.x2, arrow.dataset.y2]).toEqual(['428', '382', '572', '418']);
    expect(isPlacing()).toBe(false);
  });

  it('a work area is sized from all four corners and has no grip to turn it', () => {
    const { editor, put } = page([]);
    const area = put([300, 300], 'area', [360, 240]);
    expect([...area.querySelectorAll('.shape-h')].map((h) => h.dataset.corner || 'se')).toEqual(['se', 'nw', 'ne', 'sw']);
    expect(area.querySelector('.shape-rot')).toBeNull();
    initShapes(editor, { history });
    const drag = (corner, from, to) => {
      mouse('mousedown', from[0], from[1], area.querySelector(`[data-corner="${corner}"]`));
      mouse('mousemove', to[0], to[1]);
      mouse('mouseup', to[0], to[1]);
      return ['left', 'top', 'width', 'height'].map((k) => parseFloat(area.style[k]));
    };
    expect(drag('nw', [300, 300], [250, 270])).toEqual([250, 270, 410, 270]);
    expect(drag('ne', [660, 270], [700, 300])).toEqual([250, 300, 450, 240]);
    expect(drag('sw', [250, 540], [200, 600])).toEqual([200, 300, 500, 300]);
    // Never past the left of the page: the far corner stays where it is.
    expect(drag('nw', [200, 300], [-400, 300])).toEqual([0, 300, 700, 300]);
  });

  it('a work area saved by the build before gets its four grips when the note is opened, once', () => {
    const area = makeShape('area');
    area.querySelectorAll('.shape-h').forEach((grip) => grip.remove());
    area.insertAdjacentHTML('beforeend', '<span class="shape-rot" title="Rotate"></span><span class="shape-h" title="Resize"></span>');
    expect(rebuildShapeChrome(area)).toBe(true);
    expect(area.querySelector('.shape-rot')).toBeNull();
    expect([...area.querySelectorAll('.shape-h')].map((h) => h.dataset.corner || 'se')).toEqual(['se', 'nw', 'ne', 'sw']);
    expect(rebuildShapeChrome(area)).toBe(false);
    // The other shapes keep the two they had.
    const rect = makeShape('rect');
    expect([...rect.querySelectorAll('.shape-rot, .shape-h')].map((g) => g.className)).toEqual(['shape-rot', 'shape-h']);
  });
});

describe('a work area that holds pictures, and its name', () => {
  it('an arrow held by something that stays is left whole, and the text box riding it too', () => {
    const { editor, put } = page([]);
    const area = put([100, 100], 'area', [400, 300]);
    const picture = document.createElement('figure');     // a picture standing in the text
    picture.className = 'note-image note-image--inline';
    picture.dataset.anchor = 'a-pic';
    editor.append(picture);
    const held = makeArrow('straight', { x1: 250, y1: 180, x2: 300, y2: 350 });
    held.dataset.from = 'a-pic';
    held.dataset.aid = 'r-1';
    editor.firstChild.append(held);
    const label = put([260, 240], 'textbox', [80, 30]);
    label.dataset.rides = 'r-1';
    const free = put([150, 300], 'textbox', [80, 30]);
    const got = carriedBy(area, editor);
    expect(got.ends).toEqual([]);
    expect(got.shapes.map((s) => s.el)).toEqual([free]);
  });

  // The owner, 1.0.4: "sağ üstteki yakalamayı yukarı menüye al" — the button is in the bar over a picked area.
  it('its button, in the bar over it, turns the holding on and off; the area itself carries none', () => {
    const { editor, put } = page([]);
    const bar = document.createElement('div');
    bar.id = 'shape-bar';
    document.body.append(bar);
    const area = put([100, 100], 'area', [400, 300]);
    const rect = put([600, 100], 'rect', [100, 80]);
    initShapes(editor, { history });
    expect(area.querySelector('.area-catch')).toBeNull();
    const button = document.querySelector('#shape-bar [data-shape="catch"]');
    expect(button.title).toBe('Hold the pictures in it');
    expect(button.hidden).toBe(true);
    mouse('mousedown', 110, 105, area);
    mouse('mouseup', 110, 105);
    expect(button.hidden).toBe(false);
    expect(button.classList.contains('on')).toBe(false);
    button.click();
    expect(area.dataset.catch).toBe('1');
    expect(button.classList.contains('on')).toBe(true);
    expect(area.style.left).toBe('100px');
    button.click();
    expect(area.dataset.catch).toBeUndefined();
    expect(button.classList.contains('on')).toBe(false);
    // Another shape picked: the bar has no such button for it.
    mouse('mousedown', 610, 105, rect);
    mouse('mouseup', 610, 105);
    expect(button.hidden).toBe(true);
    // One the build before left in an area's corner goes when the note is opened.
    area.insertAdjacentHTML('beforeend', '<button type="button" class="area-catch" contenteditable="false"></button>');
    rebuildShapeChrome(area);
    expect(area.querySelector('.area-catch')).toBeNull();
    expect(makeShape('area').querySelector('.area-catch')).toBeNull();
  });

  it('on, a move lifts the pictures whose middle lies in it and carries them; off, or pressed without a move, none', () => {
    const { editor, put } = page([]);
    const area = put([100, 100], 'area', [400, 300]);
    const figure = (left, top) => {
      const el = document.createElement('figure');
      el.className = 'shape note-image note-image--inline';   // "shape" only so the page's mock gives it a box
      Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: '100px', height: '80px' });
      editor.append(el);
      return el;
    };
    const inside = figure(200, 200);
    const outside = figure(800, 200);
    const liftPicture = vi.fn((el) => { el.classList.remove('note-image--inline'); editor.firstChild.append(el); return el; });
    initShapes(editor, { history, liftPicture });
    const move = () => { mouse('mousedown', 130, 380, area); mouse('mousemove', 180, 400); mouse('mouseup', 180, 400); };
    move();                                                   // off: as it was
    expect(liftPicture).not.toHaveBeenCalled();
    expect(area.style.left).toBe('150px');
    area.dataset.catch = '1';
    mouse('mousedown', 180, 400, area);                       // a press alone lifts nothing
    mouse('mouseup', 180, 400, area);
    expect(liftPicture).not.toHaveBeenCalled();
    mouse('mousedown', 180, 400, area);
    mouse('mousemove', 230, 420);
    mouse('mouseup', 230, 420);
    expect(liftPicture).toHaveBeenCalledTimes(1);
    expect(liftPicture).toHaveBeenCalledWith(inside);
    expect([inside.style.left, inside.style.top]).toEqual(['250px', '220px']);
    expect(outside.style.left).toBe('800px');
  });

  it('a press in it on the words of a line is the line\'s; on the blank beside them, the area\'s', () => {
    const { editor, put } = page([]);
    const area = put([100, 100], 'area', [400, 300]);
    const line = document.createElement('p');
    line.textContent = 'words under the area';
    editor.append(line);
    const picture = document.createElement('figure');
    picture.className = 'note-image note-image--inline';
    editor.append(picture);
    // The words of the line stand from 120 to 260 across, 150 to 170 down.
    const words = [{ left: 120, right: 260, top: 150, bottom: 170, width: 140, height: 20 }];
    const real = document.createRange.bind(document);
    vi.spyOn(document, 'createRange').mockImplementation(() => Object.assign(real(), { getClientRects: () => words }));
    initShapes(editor, { history });
    mouse('mousedown', 200, 160, line);                       // on the words
    mouse('mouseup', 200, 160, line);
    expect(area.classList.contains('sel')).toBe(false);
    mouse('mousedown', 300, 200, picture);                    // on a picture standing in the text
    mouse('mouseup', 300, 200, picture);
    expect(area.classList.contains('sel')).toBe(false);
    mouse('mousedown', 400, 160, line);                       // the blank end of the same line
    mouse('mousemove', 450, 180);
    mouse('mouseup', 450, 180);
    expect(area.classList.contains('sel')).toBe(true);
    expect([area.style.left, area.style.top]).toEqual(['150px', '120px']);
    mouse('mousedown', 900, 160, line);                       // beside the area: nothing of its
    mouse('mousemove', 950, 180);
    mouse('mouseup', 950, 180);
    expect(area.style.left).toBe('150px');
  });

  it('an empty area says where its name goes while it is picked, and the bar writes it', () => {
    const { editor, put } = page([]);
    const bar = document.createElement('div');
    bar.id = 'shape-bar';
    document.body.append(bar);
    const area = put([100, 100], 'area', [400, 300]);
    const rect = put([700, 100], 'rect', [100, 60]);
    initShapes(editor, { history });
    const name = bar.querySelector('[data-shape="name"]');
    mouse('mousedown', 720, 120, rect);
    mouse('mouseup', 720, 120);
    expect(name.hidden).toBe(true);
    mouse('mousedown', 130, 380, area);
    mouse('mouseup', 130, 380);
    expect(name.hidden).toBe(false);
    expect(area.classList.contains('is-unnamed')).toBe(true);
    name.click();
    expect(area.classList.contains('editing')).toBe(true);
    const text = area.querySelector('.shape-text');
    text.textContent = 'Login flow';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    expect(area.classList.contains('is-unnamed')).toBe(false);
  });
});
