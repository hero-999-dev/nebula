/**
 * Widgets (1.0.0) — the owner: "/widget … calculator, scientific calculator,
 * calendar … in print page add an option to hide widgets or not". The sums,
 * the keys, the month grid, the drawing from the state on the figure, and the
 * print choice.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluate, formatNumber, press, keyFor, monthGrid, shiftMonth, makeWidget, renderWidget, stateOf,
  hasWidgets, withoutWidgets, getWidgetPrint, setWidgetPrint, WIDGET_PRINT_KEY,
} from '../src/js/widgets.js';

const M = '−';
const typeKeys = (keys, state = {}) => keys.reduce((s, k) => press(s, k), state);

describe('evaluate', () => {
  it('does the four sums in their order', () => {
    expect(evaluate('2+3×4')).toBe(14);
    expect(evaluate('(2+3)×4')).toBe(20);
    expect(evaluate(`10${M}4÷2`)).toBe(8);
    expect(evaluate('7÷2')).toBe(3.5);
  });
  it('reads powers right to left and minus before a power as the power negated', () => {
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate(`${M}2^2`)).toBe(-4);
    expect(evaluate(`2^${M}1`)).toBe(0.5);
  });
  it('takes percent, factorial, π, e and roots', () => {
    expect(evaluate('50%')).toBe(0.5);
    expect(evaluate('5!')).toBe(120);
    expect(evaluate('π')).toBeCloseTo(Math.PI, 12);
    expect(evaluate('ln(e)')).toBeCloseTo(1, 12);
    expect(evaluate('√9')).toBe(3);
    expect(evaluate('√(16)+1')).toBe(5);
    expect(evaluate('log(1000)')).toBeCloseTo(3, 12);
  });
  it('works in degrees or radians', () => {
    expect(evaluate('sin(30)')).toBeCloseTo(0.5, 12);
    expect(evaluate('cos(90)')).toBe(0);
    expect(evaluate('sin(π÷2)', 'rad')).toBeCloseTo(1, 12);
    expect(evaluate('asin(1)')).toBeCloseTo(90, 10);
    expect(Number.isNaN(evaluate('tan(90)'))).toBe(true);
  });
  it('multiplies a number written before a bracket or a function, and closes open brackets', () => {
    expect(evaluate('2π')).toBeCloseTo(2 * Math.PI, 12);
    expect(evaluate('3(4)')).toBe(12);
    expect(evaluate('2sin(30)')).toBeCloseTo(1, 12);
    expect(evaluate('(1+2')).toBe(3);
    expect(evaluate('sin(30')).toBeCloseTo(0.5, 12);
  });
  it('has no value for what cannot be read', () => {
    for (const bad of ['', '2+', '×3', '2)', 'abc', '1..2', '(-1)!', '3.5!']) expect(Number.isNaN(evaluate(bad))).toBe(true);
    expect(evaluate('1÷0')).toBe(Infinity);
  });
});

describe('formatNumber', () => {
  it('shows twelve digits at most, a real minus, and exponents at the ends', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(-5)).toBe(`${M}5`);
    expect(formatNumber(1 / 3)).toBe('0.333333333333');
    expect(formatNumber(2 ** 50)).toBe('1.1259E15');
    expect(formatNumber(1e-12)).toBe(`1E${M}12`);
    expect(evaluate(formatNumber(1e-12))).toBe(1e-12);
    expect(formatNumber(Infinity)).toBe('Error');
    expect(formatNumber(NaN)).toBe('Error');
  });
});

describe('press', () => {
  it('writes a sum and shows its answer on =', () => {
    const s = typeKeys(['1', '2', '×', '3', '=']);
    expect(s).toMatchObject({ expr: '12×3', out: '36', done: true });
  });
  it('after =, a number starts a new sum and an operator goes on from the answer', () => {
    const done = typeKeys(['2', '+', '2', '=']);
    expect(press(done, '5')).toMatchObject({ expr: '5', done: false });
    expect(press(done, '×')).toMatchObject({ expr: '4×', done: false });
    expect(typeKeys(['×', '3', '='], done).out).toBe('12');
  });
  it('C clears, ⌫ takes back a key or a whole function', () => {
    expect(typeKeys(['1', '2', '⌫'])).toMatchObject({ expr: '1' });
    expect(typeKeys(['2', 'sin', '⌫'])).toMatchObject({ expr: '2' });
    expect(typeKeys(['1', '+', 'C'])).toMatchObject({ expr: '', out: '' });
  });
  it('± turns the sign, 1/x and x² and Ans do what they say', () => {
    expect(typeKeys(['5', '±', '='])).toMatchObject({ out: `${M}5` });
    expect(typeKeys(['5', '±', '±'])).toMatchObject({ expr: '5' });
    expect(typeKeys(['4', '1/x', '='])).toMatchObject({ out: '0.25' });
    expect(typeKeys(['3', 'x²', '='])).toMatchObject({ out: '9' });
    expect(typeKeys(['6', '=', 'C', 'Ans'])).toMatchObject({ expr: '' });
    const ans = typeKeys(['6', '=', '+', '1', '=', '2', '×', 'Ans', '=']);
    expect(ans.out).toBe('14');
  });
  it('DEG switches the angle, and the angle is used', () => {
    const rad = press({}, 'DEG');
    expect(rad.angle).toBe('rad');
    expect(typeKeys(['sin', 'π', '÷', '2', '='], rad).out).toBe('1');
    expect(typeKeys(['sin', '3', '0', '=']).out).toBe('0.5');
  });
  it('a sum that cannot be done says Error, and = on nothing does nothing', () => {
    expect(typeKeys(['1', '÷', '0', '=']).out).toBe('Error');
    expect(press({}, '=')).toMatchObject({ expr: '', out: '' });
  });
});

describe('keyFor', () => {
  it('maps the keyboard to the keys, and leaves shortcuts alone', () => {
    expect(keyFor({ key: '7' })).toBe('7');
    expect(keyFor({ key: '*' })).toBe('×');
    expect(keyFor({ key: '/' })).toBe('÷');
    expect(keyFor({ key: '-' })).toBe(M);
    expect(keyFor({ key: 'Enter' })).toBe('=');
    expect(keyFor({ key: 'Backspace' })).toBe('⌫');
    expect(keyFor({ key: ',' })).toBe('.');
    expect(keyFor({ key: 'c', ctrlKey: true })).toBe(null);
    expect(keyFor({ key: 'Delete' })).toBe(null);
    expect(keyFor({ key: 'Escape' })).toBe(null);
  });
});

describe('calendar', () => {
  it('shows six weeks from a Monday', () => {
    const grid = monthGrid('2026-10');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ date: '2026-09-28', day: 28, inMonth: false });
    expect(grid.find((d) => d.day === 1 && d.inMonth).date).toBe('2026-10-01');
    expect(grid.filter((d) => d.inMonth)).toHaveLength(31);
    expect(monthGrid('2024-02').filter((d) => d.inMonth)).toHaveLength(29);
  });
  it('moves by months across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('the widget in the note', () => {
  it('is a picture of the note, drawn from the state on it', () => {
    const fig = makeWidget('calc');
    expect(fig.matches('figure.note-image.note-image--inline.note-widget[data-widget="calc"][contenteditable="false"]')).toBe(true);
    expect(fig.querySelectorAll('.wg [data-k]')).toHaveLength(20);
    fig.dataset.wgExpr = '12×3';
    fig.dataset.wgOut = '36';
    fig.dataset.wgDone = '1';
    expect(renderWidget(fig)).toBe(true);
    expect(fig.querySelector('.wg-out').textContent).toBe('36');
    expect(fig.querySelector('.wg-expr').textContent).toBe('12×3 =');
    expect(renderWidget(fig)).toBe(false);
    expect(makeWidget('nope')).toBe(null);
  });
  it('writes what it holds as text, never as markup', () => {
    const fig = makeWidget('calc');
    fig.dataset.wgExpr = '<img src=x onerror=alert(1)>';
    renderWidget(fig);
    expect(fig.querySelector('img')).toBe(null);
  });
  it('a calendar rings today and fills its marked days', () => {
    const fig = makeWidget('calendar');
    fig.dataset.wgMonth = '2026-10';
    fig.dataset.wgMarks = '2026-10-05,2026-10-19,bad';
    renderWidget(fig, { today: '2026-10-19' });
    expect(stateOf(fig).marks).toEqual(['2026-10-05', '2026-10-19']);
    expect(fig.querySelector('.wg-day--today').dataset.day).toBe('2026-10-19');
    expect([...fig.querySelectorAll('.wg-day--mark')].map((d) => d.dataset.day)).toEqual(['2026-10-05', '2026-10-19']);
    expect(fig.querySelectorAll('[data-day]')).toHaveLength(31);
  });
  it('the scientific one keeps its angle', () => {
    const fig = makeWidget('sci');
    fig.dataset.wgAngle = 'rad';
    renderWidget(fig);
    expect(fig.querySelector('[data-k="DEG"]').textContent).toBe('RAD');
  });
});

describe('printing', () => {
  it('finds widgets and leaves them out on request', () => {
    const fig = makeWidget('calendar');
    const html = `<p>a</p>${fig.outerHTML}<p>b</p><p>c ${makeWidget('calc').outerHTML.replace('<figure', '<span').replace('</figure>', '</span>')}</p>`;
    expect(hasWidgets(html)).toBe(true);
    const out = withoutWidgets(html);
    expect(hasWidgets(out)).toBe(false);
    expect(out).toBe('<p>a</p><p>b</p><p>c </p>');
    expect(withoutWidgets('<p>x</p>')).toBe('<p>x</p>');
  });
  it('remembers with or without, with by default', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    expect(getWidgetPrint(storage)).toBe('with');
    setWidgetPrint('without', storage);
    expect(store.get(WIDGET_PRINT_KEY)).toBe('without');
    expect(getWidgetPrint(storage)).toBe('without');
    setWidgetPrint('nonsense', storage);
    expect(getWidgetPrint(storage)).toBe('with');
  });
});
