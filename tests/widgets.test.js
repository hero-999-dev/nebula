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
  phaseAfter, stepMinutes, stepPomo, stepAlarm, alarmDue, durationText, POMO_LIMITS, gridStep, initWidgets, pinOf,
  parseEvents, eventAt, chosenDay, showCalendarDay, cornerRun, toggleRun, widgetRuns,
} from '../src/js/widgets.js';
import { alarmsIn, dueAlarms } from '../src/js/reminders.js';

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

describe('the Pomodoro and the Clock (1.0.3)', () => {
  it('goes focus, break, focus … and a long break after the last session', () => {
    expect(phaseAfter('focus', 1, 4)).toEqual({ phase: 'short', round: 1 });
    expect(phaseAfter('short', 1, 4)).toEqual({ phase: 'focus', round: 2 });
    expect(phaseAfter('focus', 4, 4)).toEqual({ phase: 'long', round: 4 });
    expect(phaseAfter('long', 4, 4)).toEqual({ phase: 'focus', round: 1 });
    expect(phaseAfter('focus', 1, 1)).toEqual({ phase: 'long', round: 1 });
  });

  it('steps minutes by one up to five and by five above, within their bounds', () => {
    expect(stepMinutes(25, 1, POMO_LIMITS.focus)).toBe(30);
    expect(stepMinutes(27, 1, POMO_LIMITS.focus)).toBe(30);
    expect(stepMinutes(27, -1, POMO_LIMITS.focus)).toBe(25);
    expect(stepMinutes(5, -1, POMO_LIMITS.short)).toBe(4);
    expect(stepMinutes(4, 1, POMO_LIMITS.short)).toBe(5);
    expect(stepMinutes(1, -1, POMO_LIMITS.short)).toBe(1);
    expect(stepMinutes(180, 1, POMO_LIMITS.focus)).toBe(180);
  });

  it('sets its minutes, sessions and mode, and leaves other keys alone', () => {
    const s = { mode: 'pomo', focus: 25, short: 5, long: 15, rounds: 4 };
    expect(stepPomo(s, 'focus+').focus).toBe(30);
    expect(stepPomo(s, 'short-').short).toBe(4);
    expect(stepPomo(s, 'rounds+').rounds).toBe(5);
    expect(stepPomo({ ...s, rounds: 12 }, 'rounds+').rounds).toBe(12);
    expect(stepPomo(s, 'mode-watch').mode).toBe('watch');
    expect(stepPomo(s, 'start')).toBeNull();
    expect(stepPomo(s, 'auto').auto).toBe(true);
    expect(stepPomo({ ...s, auto: true }, 'auto').auto).toBe(false);
    expect(stepPomo(s, 'sound-focus')).toBeNull();
  });

  it('keeps auto-continue on the figure and shows its long-break line and two sounds', () => {
    const fig = makeWidget('pomodoro');
    expect(stateOf(fig).auto).toBe(false);
    fig.dataset.wgAuto = '1';
    renderWidget(fig);
    expect(stateOf(fig).auto).toBe(true);
    expect(fig.querySelector('[data-k="auto"]').getAttribute('aria-pressed')).toBe('true');
    expect(fig.querySelector('.wg-set--rounds .wg-set-unit').textContent).toBe('sessions');
    for (const k of ['sound-focus', 'sound-break']) expect(fig.querySelector(`[data-k="${k}"]`)).not.toBeNull();
    expect(makeWidget('clock').querySelector('[data-k="sound-alarm"]')).not.toBeNull();
  });

  it('reads where a Universe is pinned, and nothing from a broken pin', () => {
    const fig = makeWidget('universe');
    expect(pinOf(fig)).toBeNull();
    fig.dataset.wgPin = '1.5,-2,0.25';
    expect(pinOf(fig)).toEqual({ x: 1.5, y: -2, zoom: 0.25 });
    for (const bad of ['1,2', 'a,b,c', '1,2,0', '1,2,-1']) { fig.dataset.wgPin = bad; expect(pinOf(fig)).toBeNull(); }
  });

  it('keeps what is set on the figure and draws its keys', () => {
    const fig = makeWidget('pomodoro');
    expect(fig.dataset.wgId).toMatch(/^[a-z0-9]{6,24}$/);
    expect(stateOf(fig)).toMatchObject({ mode: 'pomo', focus: 25, short: 5, long: 15, rounds: 4 });
    expect(fig.querySelector('.wg-time').textContent).toBe('25:00');
    for (const k of ['start', 'reset', 'skip', 'focus+', 'rounds-', 'mode-watch']) expect(fig.querySelector(`[data-k="${k}"]`)).not.toBeNull();
    fig.dataset.wgFocus = '999';
    expect(stateOf(fig).focus).toBe(180);
    const clock = makeWidget('clock');
    expect(stateOf(clock)).toMatchObject({ alarm: '07:00', alarmOn: false });
    expect(clock.querySelector('[data-k="alarm"]')).not.toBeNull();
  });

  it('starts, pauses and resets a countdown by its keys, and saves only its settings', () => {
    const editor = document.createElement('div');
    editor.id = 'editor';
    document.body.append(editor);
    const fig = makeWidget('pomodoro');
    editor.append(fig);
    initWidgets(editor);
    let inputs = 0;
    editor.addEventListener('input', () => { inputs += 1; });
    const click = (k) => fig.querySelector(`[data-k="${k}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click('start');
    expect(fig.querySelector('[data-k="start"]').textContent).toBe('Pause');
    click('start');
    expect(fig.querySelector('[data-k="start"]').textContent).toBe('Start');
    expect(inputs).toBe(0);
    click('focus+');
    expect(fig.dataset.wgFocus).toBe('30');
    expect(inputs).toBe(1);
    click('reset');
    expect(fig.querySelector('.wg-time').textContent).toBe('30:00');
    editor.dataset.readonly = 'true';
    click('focus+');
    expect(fig.dataset.wgFocus).toBe('30');
    click('start');
    expect(fig.querySelector('[data-k="start"]').textContent).toBe('Pause');
    click('start');
    editor.remove();
  });

  it('moves an alarm round the clock', () => {
    expect(stepAlarm('07:00', 'h+')).toBe('08:00');
    expect(stepAlarm('00:00', 'h-')).toBe('23:00');
    expect(stepAlarm('07:03', 'm+')).toBe('07:05');
    expect(stepAlarm('07:03', 'm-')).toBe('07:00');
    expect(stepAlarm('07:55', 'm+')).toBe('07:00');
    expect(stepAlarm('bad', 'h+')).toBe('08:00');
    expect(stepAlarm('07:00', 'start')).toBeNull();
  });

  it('rings an alarm once, even when a tick comes late', () => {
    const at = (h, m, s = 0) => new Date(2026, 10, 3, h, m, s).getTime();
    expect(alarmDue('07:00', at(6, 59, 59), at(7, 0, 0))).toBe(true);
    expect(alarmDue('07:00', at(6, 58), at(7, 3))).toBe(true);
    expect(alarmDue('07:00', at(7, 0, 0), at(7, 0, 1))).toBe(false);
    expect(alarmDue('07:00', at(7, 1), at(7, 2))).toBe(false);
    expect(alarmDue('00:00', at(23, 59, 59) - 86400000, at(0, 0, 1))).toBe(true);
    expect(alarmDue('nope', at(6, 0), at(8, 0))).toBe(false);
  });

  it('shows a span as a timer does', () => {
    expect(durationText(25 * 60000)).toBe('25:00');
    expect(durationText(1)).toBe('00:01');
    expect(durationText(0)).toBe('00:00');
    expect(durationText(3909000)).toBe('1:05:09');
    expect(durationText(61234, { hundredths: true })).toBe('01:01.23');
    expect(durationText(5, { hundredths: true })).toBe('00:00.00');
  });

  it('steps the widget chooser through a grid (1.0.3)', () => {
    expect(gridStep(0, 3, 6, 3)).toBe(3);
    expect(gridStep(4, 3, 6, 3)).toBe(1);
    expect(gridStep(5, 1, 6, 3)).toBe(0);
    expect(gridStep(1, 3, 5, 3)).toBe(4);
    expect(gridStep(2, 3, 5, 3)).toBe(2);
  });
});

describe('the days and events of a calendar (1.0.3)', () => {
  it('keeps only events it can read, in the order of their time', () => {
    const raw = JSON.stringify([
      { id: 'evb0001', d: '2026-11-05', t: '14:30', x: 'Dentist', a: 1 },
      { id: 'eva0001', d: '2026-11-05', t: '', x: '  Buy   bread ' },
      { d: '2026-11-04', t: '09:00', x: '', a: 1 },
      { d: '2026-13-01', x: 'bad month' },
      { d: '2026-11-06', t: '', x: '' },
      { id: 'evb0001', d: '2026-11-06', t: '25:00', x: 'Twice', a: 1 },
      'nope',
    ]);
    const list = parseEvents(raw);
    expect(list.map((e) => [e.d, e.t, e.x, e.a])).toEqual([
      ['2026-11-04', '09:00', '', true],
      ['2026-11-05', '14:30', 'Dentist', true],
      ['2026-11-05', '', 'Buy bread', false],
      ['2026-11-06', '', 'Twice', false],
    ]);
    expect(new Set(list.map((e) => e.id)).size).toBe(4);
    expect(parseEvents('{')).toEqual([]);
    expect(parseEvents('{"d":1}')).toEqual([]);
  });
  it('rings an event only when it has a time and its alarm', () => {
    expect(eventAt({ d: '2026-11-05', t: '14:30', a: true })).toBe(new Date(2026, 10, 5, 14, 30).getTime());
    expect(eventAt({ d: '2026-11-05', t: '14:30', a: false })).toBe(null);
    expect(eventAt({ d: '2026-11-05', t: '', a: true })).toBe(null);
  });
  it('a day is chosen, its events listed under the month, its days dotted', () => {
    const fig = makeWidget('calendar');
    fig.dataset.wgMonth = '2026-11';
    fig.dataset.wgEvents = JSON.stringify([{ id: 'abcd1234', d: '2026-11-20', t: '08:00', x: '<b>Exam</b>', a: 1 }]);
    renderWidget(fig, { today: '2026-11-05' });
    expect(chosenDay(fig, '2026-11-05')).toBe('2026-11-05');
    expect(fig.querySelector('.wg-day--sel').dataset.day).toBe('2026-11-05');
    expect(fig.querySelector('.wg-ev-none')).not.toBe(null);
    expect([...fig.querySelectorAll('.wg-day--event')].map((d) => d.dataset.day)).toEqual(['2026-11-20']);
    showCalendarDay(fig, '2026-11-20');
    const ev = fig.querySelector('.wg-event');
    expect(ev.dataset.ev).toBe('abcd1234');
    expect(ev.querySelector('.wg-ev-text').textContent).toBe('<b>Exam</b>');
    expect(ev.querySelector('b')).toBe(null);
    expect(ev.querySelector('.wg-ev-bell')).not.toBe(null);
    expect(fig.querySelector('[data-k="mark"]')).not.toBe(null);
    expect(fig.querySelector('[data-k="add"]')).not.toBe(null);
  });
  it('an alarm leads to its month', () => {
    const fig = makeWidget('calendar');
    showCalendarDay(fig, '2031-02-03');
    expect(fig.dataset.wgMonth).toBe('2031-02');
    expect(fig.querySelector('.wg-day--sel').dataset.day).toBe('2031-02-03');
  });
  it('rings what fell due since the last look, once', () => {
    const at = new Date(2026, 10, 5, 14, 30).getTime();
    const list = alarmsIn([
      { note: 'n1', cal: 'c1', raw: JSON.stringify([{ id: 'aaaa1111', d: '2026-11-05', t: '14:30', x: 'Call', a: 1 }, { d: '2026-11-05', t: '15:00', x: 'Quiet' }]) },
      { note: 'n2', cal: 'c2', raw: 'broken' },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ note: 'n1', cal: 'c1', at });
    expect(dueAlarms(list, at - 5000, at)).toHaveLength(1);
    expect(dueAlarms(list, at, at + 5000)).toHaveLength(0);
    expect(dueAlarms(list, at - 1, at + 1, new Set([list[0].key]))).toHaveLength(0);
  });
});

describe('the Pomodoro in the corner (1.0.3)', () => {
  it('shows a run that is going before one that is paused, never one in sight or not started', () => {
    const list = new Map([
      ['p1', { mode: 'pomo', endAt: null, left: 60000 }],
      ['p2', { mode: 'pomo', endAt: Date.now() + 1000, left: null }],
      ['p3', { mode: 'pomo', endAt: null, left: null }],
      ['w1', { mode: 'watch', watch: 0, watchAt: null }],
    ]);
    expect(cornerRun(list, () => false)[0]).toBe('p2');
    expect(cornerRun(list, (id) => id === 'p2')[0]).toBe('p1');
    expect(cornerRun(list, () => true)).toBe(null);
  });
  it('pauses and goes on with no figure in sight', () => {
    const { runs } = widgetRuns();
    const now = Date.now();
    runs.set('zz1', { mode: 'pomo', phase: 'focus', round: 1, endAt: now + 90000, left: null, mins: { focus: 25 } });
    toggleRun('zz1', now);
    expect(runs.get('zz1')).toMatchObject({ endAt: null, left: 90000 });
    toggleRun('zz1', now + 5000);
    expect(runs.get('zz1').endAt).toBe(now + 95000);
    runs.set('zz2', { mode: 'watch', watch: 1000, watchAt: null });
    toggleRun('zz2', now);
    expect(runs.get('zz2').watchAt).toBe(now);
    toggleRun('zz2', now + 2000);
    expect(runs.get('zz2')).toMatchObject({ watch: 3000, watchAt: null });
    runs.delete('zz1');
    runs.delete('zz2');
  });
});
