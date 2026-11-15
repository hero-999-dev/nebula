/**
 * Widgets (1.0.0): a calculator, a scientific calculator and a calendar that
 * live in a note.
 *
 * The owner: "/widget … you will get a pop up like the URL ones … calculator,
 * scientific calculator, calendar, add icons to them in Nebula's style … these
 * widgets can be moved like photos, videos, can be made bigger and smaller …
 * above or behind the text, or in the text like the others … when you print
 * the page it prints the current version, and the print has an option to hide
 * the widgets."
 *
 * So a widget IS a picture of the note as far as placing goes: a
 * `figure.note-image.note-widget`, and everything that moves, resizes, floats,
 * sinks, rows and deletes pictures (rich-paste.js, image-place.js) does the
 * same to it. What it holds is drawn from its state, kept on the figure:
 *
 *   <figure class="note-image note-image--inline note-widget" data-widget="calc"
 *           data-wg-expr="12×3" data-wg-out="36" data-wg-done="1" …>
 *     <span class="wg wg--calc"> …drawn by renderWidget… </span>
 *   </figure>
 *
 * The drawing is in the note too, so a print, a PDF and a copy show the widget
 * as it is now; it is drawn again whenever the note is shown. Everything in it
 * is sized in the widget's own width (cqw, editor.css), so resizing it scales
 * the whole thing.
 */

import { icon } from './icons.js';
import { t, getLang } from './i18n.js';
import { ring, stopRing, isRinging, soundChoices, soundOf, chooseSound, addOwnSound, removeOwnSound, builtInLabel } from './alarm-sound.js';
import { on } from './bus.js';
import { cornerStack, placeCorner, inSight, showWidget } from './corner.js';
import { cityOf, searchCities, countryName, wallTime, aheadText, skyOf, degrees } from './cities.js';

export const WIDGETS = [
  { kind: 'calc', ic: 'calculator', label: 'Calculator', width: 240, ratio: 0.72 },
  { kind: 'sci', ic: 'sciCalc', label: 'Scientific calculator', width: 360, ratio: 0.95 },
  { kind: 'calendar', ic: 'calendar', label: 'Calendar', width: 280, ratio: 0.975 },
  { kind: 'universe', ic: 'universe', label: 'Universe', width: 420, ratio: 1.6 },
  { kind: 'pomodoro', ic: 'pomodoro', label: 'Pomodoro', width: 300, ratio: 0.9 },
  { kind: 'clock', ic: 'clock', label: 'Clock', width: 260, ratio: 1.2 },
  { kind: 'world', ic: 'worldClock', label: 'World clock', width: 280, ratio: 2.3 },
  { kind: 'weather', ic: 'weather', label: 'Weather', width: 260, ratio: 1.6 },
];
/** As many cities as one World clock holds. */
export const WORLD_MAX = 8;
/** As many cities as one Weather holds: each is a question asked of Open-Meteo. */
export const WEATHER_MAX = 6;
const byKind = (kind) => WIDGETS.find((w) => w.kind === kind) ?? null;

/* ---- arithmetic ------------------------------------------------------------ */

const FUNCS = ['asin', 'acos', 'atan', 'sin', 'cos', 'tan', 'ln', 'log'];
const MINUS = '−';

/** The expression in tokens. Unknown characters make it unreadable (null). */
export function tokenize(expr) {
  const src = String(expr ?? '').replace(/\s+/g, '');
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const num = /^(\d+\.?\d*|\.\d+)(E[+\-−]?\d+)?/.exec(src.slice(i));
    // 1..2 is no number: a second point right after one is a typing slip, not 1 × 0.2.
    if (num && src[i + num[0].length] === '.') return null;
    if (num) { out.push({ t: 'num', v: Number(num[0].replace(MINUS, '-')) }); i += num[0].length; continue; }
    const fn = FUNCS.find((f) => src.startsWith(f, i));
    if (fn) { out.push({ t: 'fn', v: fn }); i += fn.length; continue; }
    if (c === 'π') { out.push({ t: 'num', v: Math.PI }); i += 1; continue; }
    if (c === 'e') { out.push({ t: 'num', v: Math.E }); i += 1; continue; }
    if (c === '√') { out.push({ t: 'fn', v: 'sqrt' }); i += 1; continue; }
    const op = { '+': '+', '-': '-', [MINUS]: '-', '×': '*', '*': '*', '÷': '/', '/': '/', '^': '^', '%': '%', '!': '!', '(': '(', ')': ')' }[c];
    if (!op) return null;
    out.push({ t: 'op', v: op });
    i += 1;
  }
  return out;
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let r = 1;
  for (let k = 2; k <= n; k += 1) r *= k;
  return r;
}

/**
 * The value of an expression as the calculators write it: × ÷ − ^ % ! ( ) π e
 * √ sin cos tan asin acos atan ln log, a number before a bracket or a function
 * multiplies it, brackets left open close at the end. NaN when it cannot be
 * read or has no value. Pure — tested.
 * @param {string} expr
 * @param {'deg'|'rad'} [angle]
 */
export function evaluate(expr, angle = 'deg') {
  const tokens = tokenize(expr);
  if (!tokens?.length) return NaN;
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const toRad = (x) => (angle === 'deg' ? (x * Math.PI) / 180 : x);
  const fromRad = (x) => (angle === 'deg' ? (x * 180) / Math.PI : x);
  // sin 30° is ½ exactly, not 0.49999999999999994.
  const tidy = (x) => (Math.abs(x) < 1e-12 ? 0 : x);
  const apply = (fn, x) => ({
    sin: () => tidy(Math.sin(toRad(x))), cos: () => tidy(Math.cos(toRad(x))),
    tan: () => (angle === 'deg' && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-12 ? NaN : tidy(Math.tan(toRad(x)))),
    asin: () => fromRad(Math.asin(x)), acos: () => fromRad(Math.acos(x)), atan: () => fromRad(Math.atan(x)),
    ln: () => Math.log(x), log: () => Math.log10(x), sqrt: () => Math.sqrt(x),
  }[fn]());

  function expression() {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[i++].v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  // A value right after another one multiplies it: 2π, 3(4), 2sin(30), (1)(2).
  const startsValue = () => { const p = peek(); return !!p && (p.t === 'num' || p.t === 'fn' || (p.t === 'op' && p.v === '(')); };
  function term() {
    let v = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = tokens[i++].v;
        const r = unary();
        v = op === '*' ? v * r : v / r;
      } else if (startsValue()) v *= unary();
      else return v;
    }
  }
  function unary() {
    if (isOp('-')) { i += 1; return -unary(); }
    if (isOp('+')) { i += 1; return unary(); }
    return power();
  }
  function power() {
    const base = postfix();
    if (isOp('^')) { i += 1; return base ** unary(); }
    return base;
  }
  function postfix() {
    let v = primary();
    for (;;) {
      if (isOp('!')) { i += 1; v = factorial(v); } else if (isOp('%')) { i += 1; v /= 100; } else return v;
    }
  }
  function primary() {
    const tok = tokens[i++];
    if (!tok) throw new Error('end');
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'fn') {
      // √9 and sin30 as well as √(9) and sin(30).
      const arg = isOp('(') ? primary() : postfix();
      return apply(tok.v, arg);
    }
    if (tok.v === '(') {
      const v = expression();
      if (isOp(')')) i += 1;
      else if (i < tokens.length) throw new Error('bracket');
      return v;
    }
    throw new Error('unexpected');
  }
  try {
    const v = expression();
    return i === tokens.length ? v : NaN;
  } catch {
    return NaN;
  }
}

/** A result as the display shows it: twelve digits at most, − for minus. Pure — tested. */
export function formatNumber(n) {
  if (!Number.isFinite(n)) return 'Error';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e12 || abs < 1e-9) s = n.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'E').replace('e-', 'E-');
  else s = String(Number(n.toPrecision(12)));
  return s.replace(/-/g, MINUS);
}

/** What each key adds to the line being written. */
const APPEND = { '×': '×', '÷': '÷', '+': '+', [MINUS]: MINUS, '^': '^', '%': '%', '!': '!', '(': '(', ')': ')', '.': '.', 'π': 'π', e: 'e', 'x²': '^2' };
const OPERATORS = new Set(['×', '÷', '+', MINUS, '^', '%', '!', 'x²']);
const FN_KEYS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', '√']);

/**
 * A key pressed on a calculator. Pure — tested.
 * @param {{expr: string, out: string, done: boolean, angle: 'deg'|'rad'}} state
 * @param {string} key the key's face: 0–9 . + − × ÷ ^ % ! ( ) π e x² √ sin … C ⌫ = ± 1/x Ans DEG
 * @returns the state after it
 */
export function press(state, key) {
  const s = { expr: '', out: '', done: false, angle: 'deg', ...state };
  const answer = s.out && s.out !== 'Error' ? s.out : '';
  // After =, a number starts a new sum and an operator goes on with the answer.
  const base = () => (s.done ? (OPERATORS.has(key) ? answer : '') : s.expr);
  if (key === 'C') return { ...s, expr: '', out: '', done: false };
  if (key === 'DEG' || key === 'RAD') return { ...s, angle: s.angle === 'deg' ? 'rad' : 'deg' };
  if (key === '⌫') {
    if (s.done) return { ...s, expr: '', done: false };
    const fn = /(asin|acos|atan|sin|cos|tan|ln|log|√)\($/.exec(s.expr);
    return { ...s, expr: fn ? s.expr.slice(0, -fn[0].length) : Array.from(s.expr).slice(0, -1).join('') };
  }
  if (key === '=') {
    if (!s.expr) return s;
    return { ...s, out: formatNumber(evaluate(s.expr, s.angle)), done: true };
  }
  if (key === '±') {
    const b = s.done ? answer : s.expr;
    const m = /^−\((.*)\)$/.exec(b);
    return { ...s, expr: m ? m[1] : `${MINUS}(${b || '0'})`, done: false };
  }
  if (key === '1/x') return { ...s, expr: `1÷(${(s.done ? answer : s.expr) || '1'})`, done: false };
  if (key === 'Ans') return answer ? { ...s, expr: base() + (answer.startsWith(MINUS) ? `(${answer})` : answer), done: false } : s;
  if (FN_KEYS.has(key)) return { ...s, expr: `${base()}${key}(`, done: false };
  if (/^\d$/.test(key)) return { ...s, expr: base() + key, done: false };
  if (key in APPEND) return { ...s, expr: base() + APPEND[key], done: false };
  return s;
}

/** A keyboard key as a calculator key, or null. */
export function keyFor(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key;
  if (/^\d$/.test(k)) return k;
  return {
    '.': '.', ',': '.', '+': '+', '-': MINUS, '*': '×', x: '×', '/': '÷', ':': '÷', '^': '^', '%': '%', '!': '!',
    '(': '(', ')': ')', Enter: '=', '=': '=', Backspace: '⌫', c: 'C', C: 'C', p: 'π', e: 'e',
  }[k] ?? null;
}

/* ---- calendar --------------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoMonth = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/**
 * The six weeks a month is shown in, Monday first. Pure — tested.
 * @param {string} month 'YYYY-MM'
 * @returns {{date: string, day: number, inMonth: boolean}[]} 42 days
 */
export function monthGrid(month) {
  const [y, m] = String(month).split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = [];
  for (let k = 0; k < 42; k += 1) {
    const d = new Date(y, m - 1, 1 - lead + k);
    days.push({ date: isoDay(d), day: d.getDate(), inMonth: d.getMonth() === m - 1 });
  }
  return days;
}

/** A month moved by some months. Pure — tested. */
export function shiftMonth(month, by) {
  const [y, m] = String(month).split('-').map(Number);
  return isoMonth(new Date(y, m - 1 + by, 1));
}

/*
 * A calendar's days hold notes and events (the owner, 2026-11-05: "gün
 * seçilsin, günlere not eklensin, alarmlı etkinlikler olsun"). Each is
 * { id, d: 'YYYY-MM-DD', t: 'HH:MM' or '', x: its words, a: rings or not },
 * kept on the figure as data-wg-events. One with an alarm rings at its time
 * whichever note is open (reminders.js).
 */
export const EVENTS_MAX = 400;
const EVENT_TEXT_MAX = 200;
const byWhen = (p, q) => `${p.d}${p.t || '99:99'}`.localeCompare(`${q.d}${q.t || '99:99'}`);

/** The events kept on a calendar, each checked; anything else is left out. Pure — tested. */
export function parseEvents(raw) {
  let list;
  try { list = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const out = [];
  const ids = new Set();
  for (const e of list.slice(0, EVENTS_MAX)) {
    if (!e || typeof e !== 'object' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(e.d ?? '')) continue;
    const time = validAlarm(e.t) ?? '';
    const text = String(e.x ?? '').replace(/\s+/g, ' ').trim().slice(0, EVENT_TEXT_MAX);
    if (!text && !time) continue;
    const id = /^[a-z0-9]{4,24}$/.test(e.id ?? '') && !ids.has(e.id) ? e.id : newId();
    ids.add(id);
    out.push({ id, d: e.d, t: time, x: text, a: !!e.a && !!time });
  }
  return out.sort(byWhen);
}

/** The moment an event rings, in ms; null when it has no alarm. Pure — tested. */
export function eventAt(e) {
  if (!e?.a || !e.t) return null;
  const [y, m, d] = e.d.split('-').map(Number);
  const [h, min] = e.t.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

/* ---- pomodoro and clock (1.0.3) ----------------------------------------------- */

/*
 * The owner's Bug Find note: "widgete pomodoro clock olsun icinde pomodoro
 * timer, stopwatch dakika ve session sayisi ayarlanabilmeli mola da" and
 * "birde alarm olsun saat ve alarm olsun widgette". What is set (the minutes,
 * the sessions, the alarm's time) is the note's, on the figure; what runs (a
 * countdown, a stopwatch, a ringing alarm) is this window's, by the widget's
 * id, so it goes on while another note is open and is not saved.
 */

/** [least, most, default] of each Pomodoro setting, in minutes (rounds: sessions). */
// Six hours at most, each (the owner, 1.0.4: "pomodoroda limit ise 6 saat olsun maks").
export const POMO_LIMITS = { focus: [1, 360, 25], short: [1, 360, 5], long: [1, 360, 15], rounds: [1, 12, 4] };
/**
 * The Clock's timer, in minutes (1.0.4, the owner: "clock widgetinde timer da
 * olsun"); as long as is asked for ("saat zamanlayicilari, siniri olmasin").
 */
export const TIMER_LIMITS = [1, Infinity, 10];
/** How many digits a typed length may have: a Pomodoro's part, the Clock's timer. */
const TYPED_DIGITS = { timer: 6, h: 2, m: 2 };
const within = (v, [lo, hi, def]) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const validAlarm = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v ?? '') ? v : null);

/** The phase after one ends: focus, a break after it, a long one after the last session. Pure — tested. */
export function phaseAfter(phase, round, rounds) {
  if (phase === 'focus') return round >= rounds ? { phase: 'long', round } : { phase: 'short', round };
  return { phase: 'focus', round: phase === 'long' ? 1 : round + 1 };
}

/** Minutes up or down: by one up to 5, by five above it. Pure — tested. */
export function stepMinutes(v, dir, [lo, hi]) {
  const n = dir > 0 ? (v < 5 ? v + 1 : Math.floor(v / 5) * 5 + 5) : (v <= 5 ? v - 1 : Math.ceil(v / 5) * 5 - 5);
  return Math.min(hi, Math.max(lo, n));
}

/** A Pomodoro setting key (focus+, rounds−, mode-watch, auto …) on the state; null for another key. Pure — tested. */
export function stepPomo(s, key) {
  if (key === 'mode-pomo' || key === 'mode-watch') return { ...s, mode: key === 'mode-watch' ? 'watch' : 'pomo' };
  if (key === 'auto') return { ...s, auto: !s.auto };
  // A number typed in place of the one between − and + (focus=45).
  const typed = /^(focus|short|long|rounds)=(\d{1,9})$/.exec(key ?? '');
  if (typed) return { ...s, [typed[1]]: within(typed[2], POMO_LIMITS[typed[1]]) };
  const m = /^(focus|short|long|rounds)([+-])$/.exec(key ?? '');
  if (!m) return null;
  const dir = m[2] === '+' ? 1 : -1;
  const lim = POMO_LIMITS[m[1]];
  const v = m[1] === 'rounds' ? Math.min(lim[1], Math.max(lim[0], s.rounds + dir)) : stepMinutes(s[m[1]], dir, lim);
  return { ...s, [m[1]]: v };
}

/** An alarm's time moved: h+ h- by an hour, m+ m- by five minutes, round the clock. Pure — tested. */
export function stepAlarm(at, key) {
  const [h, m] = (validAlarm(at) ?? '07:00').split(':').map(Number);
  const hour = { 'h+': 1, 'h-': -1 }[key] ?? 0;
  const min = { 'm+': 5, 'm-': -5 }[key] ?? 0;
  if (!hour && !min) return null;
  const mm = min > 0 ? Math.floor(m / 5) * 5 + 5 : min < 0 ? Math.ceil(m / 5) * 5 - 5 : m;
  return `${pad((h + hour + 24) % 24)}:${pad((mm + 60) % 60)}`;
}

/** A Clock key (view-timer, timer+, alarm, h+ …) on the state; null for another key. Pure — tested. */
export function stepClock(s, key) {
  if (key === 'view-clock' || key === 'view-timer') return { ...s, view: key === 'view-timer' ? 'timer' : 'clock' };
  if (key === 'timer+' || key === 'timer-') return { ...s, timer: stepMinutes(s.timer, key === 'timer+' ? 1 : -1, TIMER_LIMITS) };
  if (key === 'alarm') return { ...s, alarmOn: !s.alarmOn };
  // Typed: the timer's minutes, the alarm's hour or minute (timer=600, h=6, m=45).
  const typed = /^(timer|h|m)=(\d{1,9})$/.exec(key ?? '');
  if (typed?.[1] === 'timer') return { ...s, timer: within(typed[2], TIMER_LIMITS) };
  if (typed) {
    const [h, m] = (validAlarm(s.alarm) ?? '07:00').split(':').map(Number);
    const n = Number(typed[2]);
    return { ...s, alarm: typed[1] === 'h' ? `${pad(Math.min(23, n))}:${pad(m)}` : `${pad(h)}:${pad(Math.min(59, n))}` };
  }
  const at = stepAlarm(s.alarm, key);
  return at ? { ...s, alarm: at } : null;
}

/** Whether an alarm at 'HH:MM' came between two moments (ms), so a slow tick never misses it. Pure — tested. */
export function alarmDue(at, prev, now) {
  if (!validAlarm(at) || !(now > prev)) return false;
  const [h, m] = at.split(':').map(Number);
  const d = new Date(now);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  const yesterday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, h, m).getTime();
  return (prev < today && today <= now) || (prev < yesterday && yesterday <= now);
}

/** A time span as a timer shows it: 25:00, 1:05:09; a stopwatch adds hundredths. Pure — tested. */
export function durationText(ms, { hundredths = false } = {}) {
  const cs = Math.max(0, hundredths ? Math.floor(ms / 10) : Math.ceil(ms / 1000) * 100);
  const sec = Math.floor(cs / 100);
  const h = Math.floor(sec / 3600);
  const body = h ? `${h}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}` : `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
  return hundredths ? `${body}.${pad(cs % 100)}` : body;
}

/* ---- state on the figure ------------------------------------------------------ */

const validMonth = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(v ?? '') ? v : null);

export function stateOf(fig) {
  const d = fig.dataset;
  return {
    expr: d.wgExpr ?? '',
    out: d.wgOut ?? '',
    done: d.wgDone === '1',
    angle: d.wgAngle === 'rad' ? 'rad' : 'deg',
    month: validMonth(d.wgMonth),
    marks: (d.wgMarks ?? '').split(',').filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)),
    events: d.widget === 'calendar' ? parseEvents(d.wgEvents) : [],
    mode: d.wgMode === 'watch' ? 'watch' : 'pomo',
    focus: within(d.wgFocus, POMO_LIMITS.focus),
    short: within(d.wgShort, POMO_LIMITS.short),
    long: within(d.wgLong, POMO_LIMITS.long),
    rounds: within(d.wgRounds, POMO_LIMITS.rounds),
    auto: d.wgAuto === '1',
    alarm: validAlarm(d.wgAlarm) ?? '07:00',
    alarmOn: d.wgAlarmOn === '1',
    view: d.widget === 'clock' && d.wgMode === 'timer' ? 'timer' : 'clock',
    timer: within(d.wgTimer, TIMER_LIMITS),
    // Cities are known by Nebula's own list (cities.js); one it does not know is not kept.
    ...placesOf(d),
    unit: d.wgUnit === 'f' ? 'f' : 'c',
  };
}

/**
 * The cities a World clock or a Weather holds, and the one a Weather shows.
 * Cities are known by Nebula's own list (cities.js); one it does not know is not kept.
 */
function placesOf(d) {
  if (d.widget !== 'world' && d.widget !== 'weather') return { cities: [], city: null };
  let cities = (d.wgCities ?? '').split(',').filter((id, i, all) => cityOf(id) && all.indexOf(id) === i);
  if (d.widget === 'world') return { cities: cities.slice(0, WORLD_MAX), city: null };
  // A Weather from before it held more than one city has only the one it shows.
  if (cityOf(d.wgCity) && !cities.includes(d.wgCity)) cities = [d.wgCity, ...cities];
  cities = cities.slice(0, WEATHER_MAX);
  return { cities, city: cities.includes(d.wgCity) ? d.wgCity : cities[0] ?? null };
}

/**
 * A World clock or a Weather widget after a key: `city+id` adds a city (the
 * Weather shows the one just added), `city-del-id` takes one away, `city=id`
 * shows another of the Weather's cities, `unit` turns °C into °F and back.
 * null when nothing changes.
 */
export function stepPlace(s, key, max = WORLD_MAX) {
  const [, op, id] = /^city(\+|-del-|=)([a-z0-9-]+)$/.exec(key) ?? [];
  if (op === '+') return !cityOf(id) || s.cities.includes(id) || s.cities.length >= max ? null : { ...s, cities: [...s.cities, id], city: id };
  if (op === '-del-') {
    if (!s.cities.includes(id)) return null;
    const cities = s.cities.filter((c) => c !== id);
    return { ...s, cities, city: s.city === id ? cities[0] ?? null : s.city };
  }
  if (op === '=') return !s.cities.includes(id) || s.city === id ? null : { ...s, city: id };
  if (key === 'unit') return { ...s, unit: s.unit === 'f' ? 'c' : 'f' };
  return null;
}

function writeState(fig, s) {
  const set = (key, value) => { if (value) fig.dataset[key] = value; else delete fig.dataset[key]; };
  if (fig.dataset.widget === 'calendar') {
    set('wgMonth', s.month);
    set('wgMarks', [...new Set(s.marks)].sort().join(','));
    const events = (s.events ?? []).slice().sort(byWhen).slice(0, EVENTS_MAX);
    set('wgEvents', events.length ? JSON.stringify(events.map(({ id, d, t: at, x, a }) => ({ id, d, t: at, x, a: a ? 1 : 0 }))) : '');
    return;
  }
  if (fig.dataset.widget === 'pomodoro') {
    set('wgMode', s.mode === 'watch' ? 'watch' : '');
    for (const k of ['focus', 'short', 'long', 'rounds']) set(`wg${k[0].toUpperCase()}${k.slice(1)}`, String(s[k]));
    set('wgAuto', s.auto ? '1' : '');
    return;
  }
  if (fig.dataset.widget === 'clock') {
    set('wgAlarm', s.alarm);
    set('wgAlarmOn', s.alarmOn ? '1' : '');
    // Only what was changed: a clock from before the timer is written as it was.
    set('wgMode', s.view === 'timer' ? 'timer' : '');
    set('wgTimer', s.timer === TIMER_LIMITS[2] ? '' : String(s.timer));
    return;
  }
  if (fig.dataset.widget === 'world') { set('wgCities', s.cities.join(',')); return; }
  if (fig.dataset.widget === 'weather') {
    // One city is written as it always was; the list only when there is more than one.
    set('wgCities', s.cities.length > 1 ? s.cities.join(',') : '');
    set('wgCity', s.city);
    set('wgUnit', s.unit === 'f' ? 'f' : '');
    return;
  }
  set('wgExpr', s.expr);
  set('wgOut', s.out);
  set('wgDone', s.done ? '1' : '');
  if (fig.dataset.widget === 'sci') set('wgAngle', s.angle === 'rad' ? 'rad' : '');
}

/* ---- drawing ----------------------------------------------------------------- */

const CALC_KEYS = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', MINUS],
  ['1', '2', '3', '+'],
  ['±', '0', '.', '='],
];
const SCI_KEYS = [
  ['DEG', 'sin', 'cos', 'tan', 'C', '⌫'],
  ['π', 'asin', 'acos', 'atan', '(', ')'],
  ['e', 'ln', 'log', '√', 'x²', '^'],
  ['x!', '7', '8', '9', '÷', '%'],
  ['1/x', '4', '5', '6', '×', 'Ans'],
  ['±', '1', '2', '3', MINUS, '+'],
  ['', '0', '.', '', '=', ''],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function keyClass(k) {
  if (k === '=') return 'wg-key wg-key--eq';
  if (k === 'C' || k === '⌫') return 'wg-key wg-key--clear';
  if (OPERATORS.has(k) || k === '÷' || k === '%') return 'wg-key wg-key--op';
  if (/^\d$/.test(k) || k === '.') return 'wg-key wg-key--num';
  return 'wg-key wg-key--fn';
}

function head(spec) {
  return `<span class="wg-head">${icon(spec.ic, 'wg-ic')}<span class="wg-title">${esc(t(spec.label))}</span></span>`;
}

function calcHtml(spec, s, rows) {
  const top = s.done ? `${s.expr} =` : (s.out && s.out !== 'Error' ? `Ans = ${s.out}` : '');
  const big = s.done ? s.out : (s.expr || '0');
  const keys = rows.flat().map((k) => {
    if (!k) return '<span class="wg-gap"></span>';
    const face = k === 'DEG' ? (s.angle === 'rad' ? 'RAD' : 'DEG') : k === 'x!' ? 'x!' : k;
    const value = k === 'x!' ? '!' : k;
    return `<button type="button" class="${keyClass(value)}" data-k="${esc(value)}" tabindex="-1">${esc(face)}</button>`;
  }).join('');
  return `${head(spec)}<span class="wg-screen"><span class="wg-expr">${esc(top) || '&nbsp;'}</span><span class="wg-out${s.out === 'Error' && s.done ? ' wg-out--err' : ''}">${esc(big)}</span></span>`
    + `<span class="wg-keys" style="--cols: ${rows[0].length}">${keys}</span>`;
}

/* The day chosen in each calendar, by its id: this window's, never saved. Today until one is chosen. */
const chosenDays = new Map();
export const chosenDay = (fig, today = isoDay(new Date())) => chosenDays.get(fig.dataset.wgId) ?? today;

/** A calendar turned to a day and that day chosen: where an event's alarm leads. */
export function showCalendarDay(fig, day) {
  chosenDays.set(fig.dataset.wgId, day);
  const month = day.slice(0, 7);
  if ((fig.dataset.wgMonth ?? isoDay(new Date()).slice(0, 7)) !== month) {
    if (month === isoDay(new Date()).slice(0, 7)) delete fig.dataset.wgMonth; else fig.dataset.wgMonth = month;
  }
  renderWidget(fig);
}

function calendarHtml(spec, s, today, fig) {
  const month = s.month ?? today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const lang = getLang();
  const chosen = chosenDay(fig, today);
  const busy = new Set(s.events.map((e) => e.d));
  let title;
  try { title = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)); } catch { title = month; }
  const names = [];
  for (let k = 0; k < 7; k += 1) {
    let n;
    try { n = new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(new Date(2024, 0, 1 + k)); } catch { n = 'MTWTFSS'[k]; }
    names.push(`<span class="wg-dow">${esc(n.replace(/\.$/, ''))}</span>`);
  }
  const marks = new Set(s.marks);
  const days = monthGrid(month).map((d) => {
    if (!d.inMonth) return `<span class="wg-day wg-day--out">${d.day}</span>`;
    const cls = ['wg-day'];
    if (d.date === today) cls.push('wg-day--today');
    if (marks.has(d.date)) cls.push('wg-day--mark');
    if (d.date === chosen) cls.push('wg-day--sel');
    if (busy.has(d.date)) cls.push('wg-day--event');
    return `<button type="button" class="${cls.join(' ')}" data-day="${d.date}" tabindex="-1" aria-pressed="${d.date === chosen}">${d.day}</button>`;
  }).join('');
  return `${head(spec)}<span class="wg-cal-head"><button type="button" class="wg-nav" data-k="prev" tabindex="-1" aria-label="${esc(t('Previous month'))}">‹</button>`
    + `<button type="button" class="wg-month" data-k="today" tabindex="-1" title="${esc(t('This month'))}">${esc(title)}</button>`
    + `<button type="button" class="wg-nav" data-k="next" tabindex="-1" aria-label="${esc(t('Next month'))}">›</button></span>`
    + `<span class="wg-cal">${names.join('')}${days}</span>${agendaHtml(s, chosen, marks.has(chosen))}`;
}

/** A day's name as the agenda and the event box say it: Thu, 5 Nov. */
export function dayLabel(day, lang = getLang()) {
  const [y, m, d] = day.split('-').map(Number);
  try { return new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)); } catch { return day; }
}

/** Under the month: the chosen day, its mark, its events and a way to add one. */
/**
 * How many lines a calendar keeps under its day: as many as its fullest day holds, one at the
 * least and three at the most (more scroll). The calendar was one height whatever it held, and
 * under a day with nothing on it lay a quarter of the widget, empty ("the part below is very
 * empty, make it shorter", the owner, 1.0.4). It goes by all its days and not by the chosen one,
 * so choosing a day moves nothing in the note. Pure — tested.
 */
export function calendarRows(events) {
  const perDay = new Map();
  let most = 1;
  for (const e of Array.isArray(events) ? events : []) {
    const n = (perDay.get(e?.d) ?? 0) + 1;
    perDay.set(e?.d, n);
    if (n > most) most = n;
  }
  return Math.min(3, most);
}
/** How wide a calendar is for its height: its month, the day's line, and those lines (editor.css). */
export const calendarRatio = (rows) => 100 / (94.8 + 7.8 * rows);

function agendaHtml(s, day, marked) {
  const events = s.events.filter((e) => e.d === day);
  const list = events.length
    ? events.map((e) => `<button type="button" class="wg-event${e.a ? ' wg-event--alarm' : ''}" data-k="event" data-ev="${esc(e.id)}" tabindex="-1">`
      + `<span class="wg-ev-time">${esc(e.t || '·')}</span><span class="wg-ev-text">${esc(e.x || t('Alarm'))}</span>${e.a ? icon('bell', 'wg-ev-bell') : ''}</button>`).join('')
    : `<span class="wg-ev-none">${esc(t('Nothing on this day'))}</span>`;
  return `<span class="wg-agenda"><span class="wg-agenda-head"><span class="wg-agenda-day">${esc(dayLabel(day))}</span>`
    + `<button type="button" class="wg-agenda-btn${marked ? ' on' : ''}" data-k="mark" tabindex="-1" aria-pressed="${marked}">${esc(t('Mark'))}</button>`
    + `<button type="button" class="wg-agenda-btn wg-agenda-add" data-k="add" tabindex="-1">+ ${esc(t('Event'))}</button></span>`
    + `<span class="wg-events" data-rows="${calendarRows(s.events)}">${list}</span></span>`;
}

// The Universe's stored face: rings round a core. What is kept in the note,
// printed and copied is this; the live map is laid over it in the editor only.
const SKY = '<svg class="wg-sky-art" viewBox="0 0 120 70" aria-hidden="true">'
  + '<ellipse cx="60" cy="35" rx="16" ry="9"/><ellipse cx="60" cy="35" rx="32" ry="18"/><ellipse cx="60" cy="35" rx="50" ry="28"/>'
  + '<circle cx="60" cy="35" r="2.4" class="wg-sky-core"/><circle cx="76" cy="35" r="1.6"/><circle cx="35" cy="24" r="2"/><circle cx="96" cy="45" r="2.2"/><circle cx="22" cy="44" r="1.4"/></svg>';
function universeHtml(spec) {
  return `${head(spec)}<span class="wg-sky">${SKY}</span>`;
}

/* What runs, by widget id: a Pomodoro's phase and countdown, a stopwatch, a clock's alarm. */
const runs = new Map();       // id -> { phase, round, left: ms|null, endAt: ms|null, watch: ms, watchAt: ms|null }
const alarms = new Map();     // id -> { at, on, ringing }
const timers = new Map();     // id -> { left: ms|null, endAt: ms|null }: a Clock's timer
const LIVE_KEYS = new Set(['start', 'reset', 'skip', 'stop']);

function timerOf(id) {
  let run = timers.get(id);
  if (!run) { run = { left: null, endAt: null }; timers.set(id, run); }
  return run;
}
const timerLeft = (run, s, now) => (run.endAt ? run.endAt - now : run.left ?? s.timer * 60000);

function runOf(id) {
  let run = runs.get(id);
  if (!run) { run = { phase: 'focus', round: 1, left: null, endAt: null, watch: 0, watchAt: null }; runs.set(id, run); }
  return run;
}
const leftOf = (run, s, now) => (run.endAt ? run.endAt - now : run.left ?? s[run.phase] * 60000);
const watchOf = (run, now) => run.watch + (run.watchAt ? now - run.watchAt : 0);
const btn = (k, face, cls = 'wg-key') => `<button type="button" class="${cls}" data-k="${k}" tabindex="-1">${esc(face)}</button>`;
/** The number between a stepper's keys: a click on it and it is typed (1.0.4, "ortaya tiklayinca manuel degistirebilelim"). */
const typedV = (k, v) => `<button type="button" class="wg-set-v" data-k="type-${k}" tabindex="-1" title="${esc(t('Click to type it'))}">${esc(String(v))}</button>`;

/** What the time reads now, in a Pomodoro or a clock. */
function timeOf(fig, now = Date.now()) {
  const s = stateOf(fig);
  if (fig.dataset.widget === 'clock') {
    if (s.view === 'timer') return durationText(timerLeft(timerOf(fig.dataset.wgId), s, now));
    const d = new Date(now);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  const run = runOf(fig.dataset.wgId);
  return s.mode === 'watch' ? durationText(watchOf(run, now), { hundredths: true }) : durationText(leftOf(run, s, now));
}

function pomodoroHtml(spec, fig, s) {
  const run = runOf(fig.dataset.wgId);
  const watch = s.mode === 'watch';
  const going = watch ? !!run.watchAt : !!run.endAt;
  const tab = (k, label, on) => `<button type="button" class="wg-tab${on ? ' on' : ''}" data-k="${k}" tabindex="-1" aria-pressed="${on}">${esc(t(label))}</button>`;
  const phase = watch ? t('Stopwatch')
    : run.phase === 'focus' ? `${t('Focus')} ${Math.min(run.round, s.rounds)}/${s.rounds}` : t(run.phase === 'long' ? 'Long break' : 'Break');
  // The stopwatch's keys are the Pomodoro's, one fewer: each the same width (the owner: "reset start ile ayni boyutta degil").
  const row = btn('start', t(going ? 'Pause' : 'Start'), 'wg-key wg-key--eq') + btn('reset', t('Reset')) + (watch ? '' : btn('skip', t('Skip')));
  // One panel of rows, the name on the left and the stepper in the same column on each (the owner: "menüsü cok daginik").
  const set = (k, label) => `<span class="wg-set"><span class="wg-set-name">${esc(t(label))}</span>`
    + `${btn(`${k}-`, MINUS, 'wg-step')}${typedV(k, s[k])}${btn(`${k}+`, '+', 'wg-step')}`
    + `<span class="wg-set-unit">${esc(t('min'))}</span></span>`;
  // "pomodoroda long break hangi sessiondan sonra olsun diye bir ayar olsun": said in words, on its own line.
  const rounds = `<span class="wg-set wg-set--rounds"><span class="wg-set-name">${esc(t('Long break after'))}</span>`
    + `${btn('rounds-', MINUS, 'wg-step')}${typedV('rounds', s.rounds)}${btn('rounds+', '+', 'wg-step')}`
    + `<span class="wg-set-unit">${esc(t(s.rounds === 1 ? 'session' : 'sessions'))}</span></span>`;
  const opts = `<span class="wg-opts">`
    + `<button type="button" class="wg-opt wg-auto${s.auto ? ' on' : ''}" data-k="auto" tabindex="-1" aria-pressed="${s.auto}" title="${esc(t('The next part starts by itself'))}"><span class="wg-opt-name">${esc(t('Auto-continue'))}</span><span class="wg-switch" aria-hidden="true"></span></button>`
    + soundButton('focus', 'Focus') + soundButton('break', 'Break') + '</span>';
  const sets = watch ? '' : `<span class="wg-panel"><span class="wg-sets">${set('focus', 'Focus')}${set('short', 'Break')}${set('long', 'Long break')}${rounds}</span>${opts}</span>`;
  return `${head(spec)}<span class="wg-tabs">${tab('mode-pomo', 'Pomodoro', !watch)}${tab('mode-watch', 'Stopwatch', watch)}</span>`
    + `<span class="wg-face wg-face--${watch ? 'watch' : run.phase}"><span class="wg-phase">${esc(phase)}</span><span class="wg-time">${esc(timeOf(fig))}</span></span>`
    + `<span class="wg-row wg-row--${watch ? 2 : 3}">${row}</span>${sets}`;
}

/* The sounds' names, as the last look at them found them (soundChoices). */
const soundNames = new Map();
function soundName(value) {
  if (soundNames.has(value)) return soundNames.get(value);
  if (value === 'off') return t('Off');
  if (value === 'chime' || value === 'bell') return builtInLabel(value);
  if (value?.startsWith('system:')) return value.slice(7).replace(/\.[a-z0-9]+$/i, '');
  return t('My sound');
}
async function lookUpSounds() {
  const choices = await soundChoices();
  soundNames.clear();
  for (const c of choices) soundNames.set(c.value, c.label);
  return choices;
}

/** The button a widget chooses one of its sounds by: a note and the sound's name. */
function soundButton(slot, label) {
  const name = soundName(soundOf(slot));
  return `<button type="button" class="wg-opt wg-sound" data-k="sound-${slot}" tabindex="-1" title="${esc(`${t(label)}: ${name}`)}">`
    + `<span class="wg-sound-ic" aria-hidden="true">♪</span>${label ? `<span class="wg-sound-for">${esc(t(label))}</span>` : ''}<span class="wg-sound-name">${esc(name)}</span></button>`;
}

function clockHtml(spec, fig, s) {
  const now = new Date();
  let date;
  try { date = new Intl.DateTimeFormat(getLang(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now); } catch { date = isoDay(now); }
  const ringing = alarms.get(fig.dataset.wgId)?.ringing && isRinging();
  const [h, m] = s.alarm.split(':');
  const spin = (k, v) => `<span class="wg-spin">${btn(`${k}+`, '▲', 'wg-step')}${typedV(k, v)}${btn(`${k}-`, '▼', 'wg-step')}</span>`;
  const timer = s.view === 'timer';
  const tab = (k, label, on) => `<button type="button" class="wg-tab${on ? ' on' : ''}" data-k="${k}" tabindex="-1" aria-pressed="${on}">${esc(t(label))}</button>`;
  const tabs = `<span class="wg-tabs">${tab('view-clock', 'Clock', !timer)}${tab('view-timer', 'Timer', timer)}</span>`;
  if (timer) {
    // The Pomodoro's face and keys, one length to set: it counts down and rings with the alarm's sound.
    const going = !!timerOf(fig.dataset.wgId).endAt;
    const row = btn('start', t(going ? 'Pause' : 'Start'), 'wg-key wg-key--eq') + btn('reset', t('Reset')) + (ringing ? btn('stop', t('Stop'), 'wg-key wg-stop') : '');
    return `${head(spec)}${tabs}<span class="wg-face"><span class="wg-time">${esc(timeOf(fig, now.getTime()))}</span></span>`
      + `<span class="wg-row">${row}</span>`
      + `<span class="wg-panel"><span class="wg-set"><span class="wg-set-name">${esc(t('Timer'))}</span>`
      + `${btn('timer-', MINUS, 'wg-step')}${typedV('timer', s.timer)}${btn('timer+', '+', 'wg-step')}`
      + `<span class="wg-set-unit">${esc(t('min'))}</span></span></span>`;
  }
  return `${head(spec)}${tabs}<span class="wg-face"><span class="wg-time">${timeOf(fig, now.getTime())}</span><span class="wg-date">${esc(date)}</span></span>`
    + `<span class="wg-alarm${s.alarmOn ? ' on' : ''}">`
    + `<button type="button" class="wg-bell" data-k="alarm" tabindex="-1" aria-pressed="${s.alarmOn}" title="${esc(t(s.alarmOn ? 'Alarm on' : 'Alarm off'))}">${icon('bell')}</button>`
    + `${spin('h', h)}<span class="wg-colon">:</span>${spin('m', m)}`
    + `${ringing ? btn('stop', t('Stop'), 'wg-key wg-key--eq wg-stop') : ''}</span>`
    + `<span class="wg-opts wg-opts--clock">${soundButton('alarm', '')}</span>`;
}

/* ---- the World clock and the Weather (1.0.4) --------------------------------- */

/*
 * The owner: "widgetlara world clock gelsin ve farklı şehirler eklenebilsin",
 * "widgetlara weather eklensin". Both choose their cities from Nebula's own
 * list (cities.js). The World clock reads the computer's clock in each city's
 * time zone and asks nobody anything. The Weather asks Open-Meteo through the
 * main process, as little as can be asked (electron/weather.js).
 */

function worldHtml(spec, s, now = Date.now()) {
  const here = new Date(now);
  const hereDay = isoDay(here);
  const hereAhead = -here.getTimezoneOffset();
  let date;
  try { date = new Intl.DateTimeFormat(getLang(), { weekday: 'long', day: 'numeric', month: 'long' }).format(here); } catch { date = hereDay; }
  const row = (name, sub, time, id) => `<span class="wg-wrow${id ? '' : ' wg-wrow--here'}"><span class="wg-wname"><span class="wg-wcity"${id ? ' data-no-i18n' : ''}>${esc(name)}</span>`
    + `<span class="wg-wsub">${esc(sub)}</span></span><span class="wg-wtime">${esc(time)}</span>`
    + `${id ? `<button type="button" class="wg-wdel" data-k="city-del-${id}" tabindex="-1" title="${esc(t('Remove'))}" aria-label="${esc(t('Remove'))}">×</button>` : ''}</span>`;
  const rows = s.cities.map((id) => {
    const city = cityOf(id);
    const wall = wallTime(city.tz, now);
    if (!wall) return row(city.name, '', '–:–', id);
    const day = wall.day > hereDay ? t('Tomorrow') : wall.day < hereDay ? t('Yesterday') : '';
    const ahead = aheadText(wall.offset - hereAhead) || t('Same time');
    return row(city.name, day ? `${day} · ${ahead}` : ahead, wall.time, id);
  });
  const add = s.cities.length < WORLD_MAX ? `<button type="button" class="wg-wadd" data-k="city-add" tabindex="-1">+ ${esc(t('Add a city'))}</button>` : '';
  return `${head(spec)}<span class="wg-wrows">${row(t('Local time'), date, `${pad(here.getHours())}:${pad(here.getMinutes())}`, '')}${rows.join('')}</span>${add}`;
}

/** How wide a World clock is for its height: a line for here, one for each city, the key that adds one. */
const worldRatio = (n) => 100 / (30.25 + 13 * n + (n < WORLD_MAX ? 12 : 0));

const WEATHER_FRESH = 30 * 60000;     // a reading older than this is asked again
const WEATHER_AGAIN = 60000;          // after a failure, not before this
const WEATHER_KEY = 'nebula:weather';
const readings = new Map();           // city id -> { at, weather }
const asking = new Set();
const failed = new Map();             // city id -> when
let readingsLoaded = false;
let weatherTimer = 0;

function loadReadings() {
  if (readingsLoaded) return;
  readingsLoaded = true;
  try {
    const kept = JSON.parse(localStorage.getItem(WEATHER_KEY) || '{}');
    for (const [id, r] of Object.entries(kept)) {
      if (cityOf(id) && Number.isFinite(r?.at) && Number.isFinite(r?.weather?.temp)) readings.set(id, { at: r.at, weather: r.weather });
    }
  } catch { /* nothing kept */ }
}

function keepReadings() {
  // The last two dozen cities looked at; the rest are asked again when they are shown.
  const last = [...readings].sort((a, b) => b[1].at - a[1].at).slice(0, 24);
  try { localStorage.setItem(WEATHER_KEY, JSON.stringify(Object.fromEntries(last))); } catch { /* full or shut */ }
}

const weatherFigs = (id) => [...document.querySelectorAll('.note-widget[data-widget="weather"]')].filter((f) => !id || stateOf(f).cities.includes(id));

async function askWeather(id) {
  const city = cityOf(id);
  const api = typeof window === 'undefined' ? null : window.nebula?.weather;
  if (!city || asking.has(id)) return;
  if (!api) { failed.set(id, Date.now()); return; }
  asking.add(id);
  let answer;
  try { answer = await api.get({ lat: city.lat, lon: city.lon }); } catch { answer = null; }
  asking.delete(id);
  if (answer?.ok && Number.isFinite(answer.weather?.temp)) {
    readings.set(id, { at: Number(answer.at) || Date.now(), weather: answer.weather });
    failed.delete(id);
    keepReadings();
  } else failed.set(id, Date.now());
  for (const fig of weatherFigs(id)) renderWidget(fig);
}

/** The last reading of a city; one that is old or missing is asked for on the way. */
function readingOf(id, now = Date.now()) {
  loadReadings();
  const got = readings.get(id) ?? null;
  if ((!got || now - got.at > WEATHER_FRESH) && now - (failed.get(id) ?? 0) > WEATHER_AGAIN) void askWeather(id);
  return got;
}

/** The weather's readings — for tests. */
export const weatherReadings = () => ({ readings, failed, asking });

function weatherHtml(spec, s, now = Date.now()) {
  if (!s.city) {
    return `${head(spec)}<span class="wg-wxempty"><button type="button" class="wg-key wg-key--eq wg-wxpick" data-k="city-add" tabindex="-1">${esc(t('Choose a city'))}</button>`
      + `<span class="wg-wxnote">${esc(t('Only the city’s rough place is sent to Open-Meteo — no account, no key, nothing about you.'))}</span></span>`;
  }
  const city = cityOf(s.city);
  const got = readingOf(s.city, now);
  const del = (id) => `<button type="button" class="wg-wdel" data-k="city-del-${id}" tabindex="-1" title="${esc(t('Remove'))}" aria-label="${esc(t('Remove'))}">×</button>`;
  const place = `<span class="wg-wxcity"><span class="wg-wxname" data-no-i18n>${esc(city.region ? `${city.name}, ${city.region}` : city.name)}</span><span class="wg-wxcc" data-no-i18n>${esc(countryName(city.country, getLang()))}</span>${del(s.city)}</span>`;
  // The other cities, a line each: a press shows one in full. Each is asked for as the shown one is.
  const others = s.cities.filter((id) => id !== s.city).map((id) => {
    const c = cityOf(id);
    const r = readingOf(id, now);
    const sky = r ? skyOf(r.weather.code, r.weather.night) : null;
    const temp = r ? degrees(r.weather.temp, s.unit) : asking.has(id) ? '…' : '–';
    return `<span class="wg-wxrow"><button type="button" class="wg-wxgo" data-k="city=${id}" tabindex="-1"><span class="wg-wxrow-n" data-no-i18n>${esc(c.name)}</span>`
      + `${sky ? icon(sky.ic, 'wg-wxrow-ic') : ''}<span class="wg-wxrow-t" data-no-i18n>${esc(temp)}</span></button>${del(id)}</span>`;
  }).join('');
  const add = s.cities.length < WEATHER_MAX ? `<button type="button" class="wg-wadd" data-k="city-add" tabindex="-1">+ ${esc(t('Add a city'))}</button>` : '';
  const more = `${others ? `<span class="wg-wxrows">${others}</span>` : ''}${add}`;
  const keys = `<button type="button" class="wg-wxkey" data-k="unit" tabindex="-1" title="°C / °F" data-no-i18n>°${s.unit === 'f' ? 'F' : 'C'}</button>`
    + `<button type="button" class="wg-wxkey" data-k="refresh" tabindex="-1" title="${esc(t('Refresh'))}" aria-label="${esc(t('Refresh'))}">↻</button>`;
  const credit = '<span class="wg-wxby" data-no-i18n>Open-Meteo</span>';
  if (!got) {
    const word = asking.has(s.city) ? '…' : t('The weather could not be fetched');
    return `${head(spec)}${place}<span class="wg-wxempty"><span class="wg-wxnote">${esc(word)}</span></span>${more}<span class="wg-wxfoot">${credit}<span class="wg-wxkeys">${keys}</span></span>`;
  }
  const w = got.weather;
  const sky = skyOf(w.code, w.night);
  const bit = (label, value) => (value == null ? '' : `<span class="wg-wxbit"><span class="wg-wxbit-v" data-no-i18n>${esc(value)}</span><span class="wg-wxbit-n">${esc(t(label))}</span></span>`);
  const wind = w.wind == null ? null : (s.unit === 'f' ? `${Math.round(w.wind / 1.609)} mph` : `${Math.round(w.wind)} km/h`);
  const bits = bit('Feels like', w.feels == null ? null : degrees(w.feels, s.unit)) + bit('Wind', wind) + bit('Humidity', w.humidity == null ? null : `${Math.round(w.humidity)}%`);
  const days = (w.days ?? []).slice(1, 4).map((d) => {
    let name;
    try { name = new Intl.DateTimeFormat(getLang(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d.d}T00:00:00Z`)); } catch { name = d.d.slice(5); }
    return `<span class="wg-wxday"><span class="wg-wxday-n">${esc(name)}</span>${icon(skyOf(d.code).ic, 'wg-wxday-ic')}`
      + `<span class="wg-wxday-t" data-no-i18n>${esc(degrees(d.max, s.unit))} <span class="wg-wxday-min">${esc(degrees(d.min, s.unit))}</span></span></span>`;
  }).join('');
  const at = new Date(got.at);
  const when = asking.has(s.city) ? '…' : `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return `${head(spec)}${place}`
    + `<span class="wg-wxnow">${icon(sky.ic, 'wg-wxic')}<span class="wg-wxtemp" data-no-i18n>${esc(degrees(w.temp, s.unit))}</span></span>`
    + `<span class="wg-wxword">${esc(t(sky.word))}</span>`
    + `${bits ? `<span class="wg-wxbits">${bits}</span>` : ''}${days ? `<span class="wg-wxdays">${days}</span>` : ''}${more}`
    + `<span class="wg-wxfoot"><span class="wg-wxwhen" data-no-i18n>${esc(when)}</span>${credit}<span class="wg-wxkeys">${keys}</span></span>`;
}

/** Weather widgets in sight are looked at again now and then: an old reading asks for a new one. */
function watchWeather() {
  if (weatherTimer || typeof window === 'undefined') return;
  weatherTimer = setInterval(() => {
    const figs = weatherFigs();
    if (!figs.length) { clearInterval(weatherTimer); weatherTimer = 0; return; }
    for (const fig of figs) renderWidget(fig);
  }, 5 * 60000);
}

/** The ↻ of a Weather widget: every city of it asked now, whatever its reading's age. */
function refreshWeather(fig) {
  for (const id of stateOf(fig).cities) {
    failed.delete(id);
    void askWeather(id);
  }
  renderWidget(fig);
}

const say = (text) => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: text }));
const figsOf = (id) => [...document.querySelectorAll('.note-widget[data-wg-id]')].filter((f) => f.dataset.wgId === id);

/**
 * A Pomodoro phase came to its end: ring with the sound of the part that
 * ended, say so, and wait at the next one — or, with Auto-continue on, start it.
 * The long break is the end of the sessions: after it nothing starts by itself
 * (the owner, 1.0.4: "tüm sessionlari bitirdikten sonra devam ettirmemesi lazim
 * sonsuz döngüye giriyor").
 */
function phaseDone(id, run, now = Date.now()) {
  const was = run.phase;
  Object.assign(run, phaseAfter(run.phase, run.round, run.rounds ?? POMO_LIMITS.rounds[2]), { left: null, endAt: null });
  if (run.auto && run.mins && was !== 'long') run.endAt = now + run.mins[run.phase] * 60000;
  void ring({ id: soundOf(was === 'focus' ? 'focus' : 'break'), times: 2 });
  say(t(was === 'focus' ? 'Focus done — time for a break' : 'Break over — back to focus'));
  for (const fig of figsOf(id)) renderWidget(fig);
}

/** What a run needs of its Pomodoro's settings when no figure of it is in sight. */
const keepConfig = (run, s) => Object.assign(run, { mode: s.mode, rounds: s.rounds, auto: s.auto, mins: { focus: s.focus, short: s.short, long: s.long } });

let ticker = 0;
let lastTick = Date.now();
function tick() {
  const now = Date.now();
  for (const [id, run] of runs) if (run.endAt && run.endAt <= now) phaseDone(id, run, now);
  for (const [id, run] of timers) {
    if (!run.endAt || run.endAt > now) continue;
    // Time is up: it rings as the alarm does, and stands at its whole length again.
    Object.assign(run, { left: null, endAt: null });
    const a = alarms.get(id);
    if (a) a.ringing = true; else alarms.set(id, { at: null, on: false, ringing: true });
    void ring({ times: 6 });
    say(`${t('Timer')} — ${t('Time is up')}`);
    for (const fig of figsOf(id)) renderWidget(fig);
  }
  for (const [id, a] of alarms) {
    if (a.on && alarmDue(a.at, lastTick, now)) {
      a.ringing = true;
      void ring({ times: 12 });
      say(`${t('Alarm')} ${a.at}`);
      for (const fig of figsOf(id)) renderWidget(fig);
    } else if (a.ringing && !isRinging()) {
      a.ringing = false;
      for (const fig of figsOf(id)) renderWidget(fig);
    }
  }
  lastTick = now;
  const figs = document.querySelectorAll('.note-widget[data-widget="pomodoro"], .note-widget[data-widget="clock"]');
  for (const fig of figs) {
    const el = fig.querySelector(':scope > .wg .wg-time');
    const text = timeOf(fig, now);
    if (el && el.textContent !== text) el.textContent = text;
  }
  // A World clock reads minutes: drawn again when one has passed.
  const worlds = document.querySelectorAll('.note-widget[data-widget="world"]');
  const minute = Math.floor(now / 60000);
  if (minute !== lastMinute) {
    lastMinute = minute;
    for (const fig of worlds) renderWidget(fig);
  }
  paintPomoCard(now);
  // A paused run keeps the ticker: its card still shows when its figure goes out of sight.
  const busy = figs.length || worlds.length ||[...runs.values()].some(started) || [...alarms.values()].some((a) => a.on || a.ringing)
    || [...timers.values()].some((r) => r.endAt);
  if (!busy) { clearInterval(ticker); ticker = 0; return; }
  // A going stopwatch counts hundredths, so it is looked at oftener than a timer.
  const every = [...runs.values()].some((r) => r.mode === 'watch' && going(r)) ? FAST : SLOW;
  if (every !== tickEvery) { clearInterval(ticker); ticker = setInterval(tick, every); tickEvery = every; }
}
const SLOW = 250;
const FAST = 40;
let tickEvery = SLOW;
let lastMinute = 0;
function wake() {
  if (ticker || typeof window === 'undefined') return;
  lastTick = Date.now();
  tickEvery = SLOW;
  ticker = setInterval(tick, SLOW);
}

/** A start, a pause, a reset, a skip or a stop: what runs, never what is saved. */
function liveKey(fig, key) {
  const id = fig.dataset.wgId;
  const now = Date.now();
  if (fig.dataset.widget === 'clock') {
    if (key === 'stop') {
      stopRing();
      const a = alarms.get(id);
      if (a) a.ringing = false;
      return;
    }
    const s = stateOf(fig);
    if (s.view !== 'timer') return;
    const run = timerOf(id);
    if (key === 'start') {
      if (run.endAt) { run.left = Math.max(0, run.endAt - now); run.endAt = null; } else run.endAt = now + timerLeft(run, s, now);
      wake();
    } else if (key === 'reset') Object.assign(run, { left: null, endAt: null });
    return;
  }
  const s = stateOf(fig);
  const run = runOf(id);
  keepConfig(run, s);
  // The note it runs in, for the corner card's way back to it.
  run.note = host?.noteId?.() ?? run.note ?? null;
  if (s.mode === 'watch') {
    if (key === 'start') {
      if (run.watchAt) { run.watch += now - run.watchAt; run.watchAt = null; } else run.watchAt = now;
    } else if (key === 'reset') { run.watch = 0; run.watchAt = null; }
    return;
  }
  if (key === 'start') {
    if (run.endAt) { run.left = Math.max(0, run.endAt - now); run.endAt = null; } else run.endAt = now + leftOf(run, s, now);
  } else if (key === 'reset') Object.assign(run, { phase: 'focus', round: 1, left: null, endAt: null });
  else if (key === 'skip') Object.assign(run, phaseAfter(run.phase, run.round, s.rounds), { left: null, endAt: null });
}

/** Pomodoros and clocks running — for tests. */
export const widgetRuns = () => ({ runs, alarms, timers, tick });

let host = null;                     // { noteId, openNote } from main.js
/** What the corner's Pomodoro card needs of the app: the open note, and a way to open one. */
export function setWidgetHost(deps) { host = deps ?? null; }

/** A run that is going or stopped part way: the corner card is for these. */
const started = (run) => (run.mode === 'watch' ? !!run.watchAt || run.watch > 0 : !!run.endAt || run.left != null);
const going = (run) => (run.mode === 'watch' ? !!run.watchAt : !!run.endAt);

/** Pause or go on, with no figure of it in sight: the corner card's key. */
export function toggleRun(id, now = Date.now()) {
  const run = runs.get(id);
  if (!run) return;
  if (run.mode === 'watch') {
    if (run.watchAt) { run.watch += now - run.watchAt; run.watchAt = null; } else run.watchAt = now;
  } else if (run.endAt) { run.left = Math.max(0, run.endAt - now); run.endAt = null; } else {
    run.endAt = now + (run.left ?? (run.mins?.[run.phase] ?? 25) * 60000);
  }
  for (const fig of figsOf(id)) renderWidget(fig);
  wake();
  tick();
}

let pomoCard = null;
/**
 * How much of the corner card shows (1.0.4, the owner's Ideas note: "minimize
 * (daha kücük bir stil) ve hide (sadece logo)"): all of it, the time alone, or
 * the icon alone. Its − steps down; the icon alone opens it whole again. Kept
 * for the next start of the app.
 */
const CARD_SIZES = ['full', 'small', 'icon'];
const CARD_SIZE_KEY = 'nebula.cornerCard';
let cardSize = null;
function cardSizeNow() {
  if (cardSize) return cardSize;
  let kept = null;
  try { kept = localStorage.getItem(CARD_SIZE_KEY); } catch { /* no storage: whole */ }
  cardSize = CARD_SIZES.includes(kept) ? kept : 'full';
  return cardSize;
}
function setCardSize(size) {
  cardSize = CARD_SIZES.includes(size) ? size : 'full';
  try { localStorage.setItem(CARD_SIZE_KEY, cardSize); } catch { /* not kept, still shown so */ }
}
/** The size after this one: smaller each time, and whole again after the icon. */
export const nextCardSize = (size) => CARD_SIZES[(CARD_SIZES.indexOf(size) + 1) % CARD_SIZES.length];
/** Which run the corner shows: one going before one paused, none when one of its figures is in sight. */
export function cornerRun(list = runs, seen = (id) => figsOf(id).some(inSight)) {
  let best = null;
  for (const [id, run] of list) {
    if (!started(run) || seen(id)) continue;
    if (!best || (going(run) && !going(best[1]))) best = [id, run];
  }
  return best;
}
function paintPomoCard(now) {
  const pick = cornerRun();
  if (!pick) { if (pomoCard) pomoCard.hidden = true; return; }
  const [id, run] = pick;
  if (!pomoCard) {
    pomoCard = document.createElement('div');
    pomoCard.id = 'pomo-card';
    pomoCard.className = 'update-card corner-card pomo-card';
    pomoCard.setAttribute('role', 'button');
    pomoCard.tabIndex = 0;
    pomoCard.innerHTML = `<span class="corner-card__ic" aria-hidden="true">${icon(byKind('pomodoro').ic, 'ic')}</span><span class="corner-card__body"><span class="corner-card__head"></span><span class="corner-card__time"></span></span><button type="button" class="btn ghost corner-card__key"></button><button type="button" class="corner-card__size" aria-label="${t('Make smaller')}" title="${t('Make smaller')}">−</button>`;
    const back = () => {
      const want = pomoCard.dataset.run;
      const r = runs.get(want);
      if (r?.note && host?.noteId?.() !== r.note) host?.openNote?.(r.note);
      requestAnimationFrame(() => { const fig = figsOf(want)[0]; if (fig) showWidget(fig); });
    };
    pomoCard.addEventListener('click', (e) => {
      if (e.target.closest('.corner-card__key')) { toggleRun(pomoCard.dataset.run); return; }
      // Its −, and the icon it was made down to, change how much shows; nothing else.
      if (e.target.closest('.corner-card__size') || cardSizeNow() === 'icon') {
        setCardSize(nextCardSize(cardSizeNow()));
        tick();
        return;
      }
      back();
    });
    pomoCard.addEventListener('keydown', (e) => {
      if ((e.key !== 'Enter' && e.key !== ' ') || e.target !== pomoCard) return;
      e.preventDefault();
      if (cardSizeNow() === 'icon') { setCardSize('full'); tick(); } else back();
    });
    cornerStack().append(pomoCard);
  }
  pomoCard.dataset.run = id;
  const watch = run.mode === 'watch';
  const head = watch ? t('Stopwatch')
    : run.phase === 'focus' ? `${t('Focus')} ${Math.min(run.round, run.rounds ?? run.round)}/${run.rounds ?? '–'}` : t(run.phase === 'long' ? 'Long break' : 'Break');
  // Whole seconds in the corner, the stopwatch too (1.0.4: "saniyenin altindaki sayilar gözükmesin").
  const time = watch ? durationText(watchOf(run, now)) : durationText(run.endAt ? run.endAt - now : run.left ?? 0);
  const key = t(going(run) ? 'Pause' : 'Continue');
  const set = (sel, text) => { const el = pomoCard.querySelector(sel); if (el.textContent !== text) el.textContent = text; };
  set('.corner-card__head', head);
  set('.corner-card__time', time);
  set('.corner-card__key', key);
  pomoCard.classList.toggle('corner-card--paused', !going(run));
  pomoCard.classList.toggle('pomo-card--break', !watch && run.phase !== 'focus');
  const size = cardSizeNow();
  pomoCard.classList.toggle('corner-card--small', size === 'small');
  pomoCard.classList.toggle('corner-card--icon', size === 'icon');
  pomoCard.title = size === 'icon' ? `${head} ${time}` : '';
  pomoCard.setAttribute('aria-label', `${head} ${time}`);
  pomoCard.hidden = false;
  placeCorner();
}

const drawn = new WeakMap();

/**
 * Draw a widget from its state. Nothing is written when it already shows that.
 * @returns {boolean} whether its drawing changed
 */
export function renderWidget(fig, { today = isoDay(new Date()) } = {}) {
  const spec = byKind(fig.dataset.widget);
  if (!spec) return false;
  const s = stateOf(fig);
  if (spec.kind === 'pomodoro' || spec.kind === 'clock') {
    // A widget pasted from a note before ids had none; a run is kept by it.
    if (!/^[a-z0-9]{6,24}$/.test(fig.dataset.wgId ?? '')) fig.dataset.wgId = newId();
    if (spec.kind === 'clock') {
      const a = alarms.get(fig.dataset.wgId);
      alarms.set(fig.dataset.wgId, { at: s.alarm, on: s.alarmOn, ringing: !!a?.ringing });
    } else keepConfig(runOf(fig.dataset.wgId), s);
    wake();
  }
  // A calendar's chosen day, and an alarm's way back to it, go by its id.
  if (spec.kind === 'calendar' && !/^[a-z0-9]{6,24}$/.test(fig.dataset.wgId ?? '')) fig.dataset.wgId = newId();
  if (spec.kind === 'world') {
    // As high as its lines: the figure's ratio follows the cities it holds.
    const ratio = worldRatio(s.cities.length).toFixed(3);
    if (fig.dataset.ratio !== ratio) fig.dataset.ratio = ratio;
    wake();
  }
  if (spec.kind === 'calendar') {
    // As high as its lines too (and one placed before 1.0.4 is told so).
    const ratio = calendarRatio(calendarRows(s.events)).toFixed(3);
    if (fig.dataset.ratio !== ratio) fig.dataset.ratio = ratio;
  }
  if (spec.kind === 'weather') watchWeather();
  const html = spec.kind === 'calendar' ? calendarHtml(spec, s, today, fig)
    : spec.kind === 'world' ? worldHtml(spec, s)
    : spec.kind === 'weather' ? weatherHtml(spec, s)
    : spec.kind === 'universe' ? universeHtml(spec)
      : spec.kind === 'pomodoro' ? pomodoroHtml(spec, fig, s)
        : spec.kind === 'clock' ? clockHtml(spec, fig, s)
          : calcHtml(spec, s, spec.kind === 'sci' ? SCI_KEYS : CALC_KEYS);
  let body = fig.querySelector(':scope > .wg');
  if (!body) {
    body = document.createElement('span');
    fig.prepend(body);
  }
  const cls = `wg wg--${spec.kind}`;
  // The browser writes the markup back its own way (&nbsp;, the icon's
  // attributes), so what was drawn is compared with what was asked for.
  if (body.className === cls && drawn.get(body) === html) return false;
  body.className = cls;
  body.innerHTML = html;
  drawn.set(body, html);
  return true;
}

/** A new widget of that kind, to go into the text. */
export function makeWidget(kind) {
  const spec = byKind(kind);
  if (!spec) return null;
  const fig = document.createElement('figure');
  fig.className = 'note-image note-image--inline note-widget';
  fig.setAttribute('contenteditable', 'false');
  fig.dataset.blockType = 'image';
  fig.dataset.widget = kind;
  fig.dataset.ratio = String(spec.ratio);
  fig.style.width = `${spec.width}px`;
  if (kind === 'pomodoro' || kind === 'clock' || kind === 'calendar') fig.dataset.wgId = newId();
  renderWidget(fig);
  return fig;
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 24);
}

export const isWidget = (el) => !!el?.classList?.contains('note-widget');

/* ---- the picker -------------------------------------------------------------- */

let closePicker = null;

/** How many columns a grid lays out (3 when it cannot be measured). */
function gridColumns(grid) {
  const n = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
  return n > 0 && n < 20 ? n : 3;
}

/**
 * The cell a step lands on in a grid of n cells, cols wide. Left and right
 * wrap through all of them; up and down keep the column and wrap round it,
 * skipping the empty end of a last row that is short.
 */
export function gridStep(at, step, n, cols) {
  if (Math.abs(step) === 1 || cols <= 1) return (at + step + n) % n;
  const col = at % cols;
  const rows = Math.ceil(n / cols);
  let row = Math.floor(at / cols);
  for (let k = 0; k < rows; k += 1) {
    row = (row + Math.sign(step) + rows) % rows;
    if (row * cols + col < n) return row * cols + col;
  }
  return at;
}

/**
 * The widgets to choose from, where the caret is (as the link menu opens).
 * Arrows move, Enter takes, Escape or a press elsewhere closes it.
 * @param {{left: number, top: number, bottom: number}} anchor
 * @returns {Promise<string|null>} the kind chosen
 */
export function pickWidget(anchor) {
  return pickTile(anchor, { id: 'widget-menu', label: 'Add a widget', data: 'widgetKind', items: WIDGETS.map((spec) => ({ kind: spec.kind, mark: icon(spec.ic), label: spec.label })) });
}

/**
 * Tiles to choose one of, under `anchor`: the widgets, and the shapes of the editing bar (1.0.4, the
 * owner: "insert shape should be like widget"). One picker is open at a time.
 * @param {{left: number, top: number, bottom: number}} anchor
 * @param {{ id: string, label: string, data: string, items: {kind: string, mark: string, label: string}[], selected?: number }} o
 *   `data` names the dataset key a tile carries its kind in; `mark` is its drawing, as HTML; `selected` is the tile lit first.
 * @returns {Promise<string|null>} the kind chosen
 */
export function pickTile(anchor, { id, label, data, items, selected = 0 }) {
  closePicker?.();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = id;
    box.className = 'float-menu link-menu widget-menu';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t(label));
    const title = document.createElement('div');
    title.className = 'link-menu__title';
    title.textContent = t(label);
    const options = document.createElement('div');
    options.className = 'widget-menu__options';
    const buttons = items.map((spec, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset[data] = spec.kind;
      b.className = n === selected ? 'sel' : '';
      b.innerHTML = `<span class="fm-ic">${spec.mark}</span><span></span>`;
      b.lastChild.textContent = t(spec.label);
      options.appendChild(b);
      return b;
    });
    box.append(title, options);
    let at = selected;
    const light = () => buttons.forEach((b, n) => b.classList.toggle('sel', n === at));

    let done = false;
    function finish(kind) {
      if (done) return;
      done = true;
      closePicker = null;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', cancel);
      box.remove();
      resolve(kind);
    }
    const cancel = () => finish(null);
    closePicker = cancel;
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(items[at].kind); return; }
      // A grid: ↑ ↓ go a row (the owner, 1.0.3: "alta basınca yana gidiyor").
      const cols = gridColumns(options);
      const step = { ArrowDown: cols, ArrowRight: 1, ArrowUp: -cols, ArrowLeft: -1 }[e.key];
      if (!step) { if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) cancel(); return; }
      e.preventDefault();
      e.stopPropagation();
      at = gridStep(at, step, items.length, cols);
      light();
    }
    function onDown(e) { if (!box.contains(e.target)) cancel(); }
    box.addEventListener('mousedown', (e) => e.preventDefault());
    options.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) finish(items[buttons.indexOf(b)].kind);
    });
    options.addEventListener('mousemove', (e) => {
      const b = e.target.closest('button');
      if (b) { at = buttons.indexOf(b); light(); }
    });
    document.body.appendChild(box);
    const w = box.offsetWidth || 300;
    const h = box.offsetHeight || 120;
    const under = anchor.bottom + 8;
    box.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8))}px`;
    box.style.top = `${under + h > window.innerHeight - 8 && anchor.top - h - 8 > 8 ? anchor.top - h - 8 : Math.max(8, Math.min(under, window.innerHeight - h - 8))}px`;
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { if (!done) document.addEventListener('mousedown', onDown, true); }, 0);
    window.addEventListener('blur', cancel);
  });
}

/* ---- a calendar's event ------------------------------------------------------ */

let closeEventBox = null;

/**
 * The box an event is written in, under the button that asked for it: what
 * it is, a time, and whether it rings then. Resolves to the event, to
 * { remove: true } for Delete, or to null when left. Enter saves, Escape leaves.
 * @param {DOMRect} anchor
 * @param {{ day: string, event?: object }} o
 */
export function editEvent(anchor, { day, event = null }) {
  closeEventBox?.();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'event-menu';
    box.className = 'float-menu link-menu event-menu';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t(event ? 'Event' : 'Add event'));
    box.innerHTML = `<div class="link-menu__title"></div>`
      + `<input type="text" class="event-menu__text" maxlength="${EVENT_TEXT_MAX}" data-no-i18n>`
      + `<div class="event-menu__when"><div class="event-menu__clock" role="group" aria-label="${esc(t('Time'))}">`
      + '<span class="event-menu__spin"><button type="button" class="event-menu__step" data-s="h+">▲</button>'
      + '<input type="text" class="event-menu__h" inputmode="numeric" maxlength="2" placeholder="--" aria-label="h">'
      + '<button type="button" class="event-menu__step" data-s="h-">▼</button></span><span class="event-menu__colon">:</span>'
      + '<span class="event-menu__spin"><button type="button" class="event-menu__step" data-s="m+">▲</button>'
      + '<input type="text" class="event-menu__m" inputmode="numeric" maxlength="2" placeholder="--" aria-label="min">'
      + '<button type="button" class="event-menu__step" data-s="m-">▼</button></span>'
      + `<button type="button" class="event-menu__clear" aria-label="${esc(t('Delete'))}">×</button></div>`
      + `<button type="button" class="event-menu__alarm" role="switch" aria-checked="false"><span class="event-menu__switch"></span><span>${esc(t('Ring an alarm'))}</span></button></div>`
      + `<div class="event-menu__foot">${event ? `<button type="button" class="btn ghost event-menu__del">${esc(t('Delete'))}</button>` : ''}`
      + `<span class="event-menu__gap"></span><button type="button" class="btn ghost event-menu__cancel">${esc(t('Cancel'))}</button>`
      + `<button type="button" class="btn event-menu__ok">${esc(t('OK'))}</button></div>`;
    box.querySelector('.link-menu__title').textContent = dayLabel(day);
    const text = box.querySelector('.event-menu__text');
    const hour = box.querySelector('.event-menu__h');
    const min = box.querySelector('.event-menu__m');
    const alarm = box.querySelector('.event-menu__alarm');
    text.placeholder = t('What is on this day');
    text.value = event?.x ?? '';
    // The time the way the Clock widget sets one: ▲/▼ (an hour, five minutes, round the clock) or typed; blank is no time.
    const two = (n) => String(n).padStart(2, '0');
    const num = (input, top) => { const n = Number.parseInt(input.value, 10); return Number.isInteger(n) && n >= 0 && n <= top ? n : null; };
    const timeOf = () => (num(hour, 23) == null || num(min, 59) == null ? '' : `${two(num(hour, 23))}:${two(num(min, 59))}`);
    const setTime = (at) => { const [h = '', m = ''] = at ? at.split(':') : []; hour.value = h; min.value = m; };
    let ringing = !!event?.a;
    // An alarm needs a time: without one the switch is greyed, and turning it on gives 09:00 to change.
    const paint = () => {
      if (!timeOf()) ringing = false;
      alarm.classList.toggle('on', ringing);
      alarm.classList.toggle('off', !timeOf());
      alarm.setAttribute('aria-checked', String(ringing));
    };
    setTime(event?.t ?? '');
    for (const step of box.querySelectorAll('.event-menu__step')) {
      step.addEventListener('mousedown', (e) => e.preventDefault());
      step.addEventListener('click', () => {
        const [h, m] = (timeOf() || '09:00').split(':').map(Number);
        const by = { 'h+': 60, 'h-': -60, 'm+': 5, 'm-': -5 }[step.dataset.s];
        const at = (((h * 60 + (by % 60 ? Math.round(m / 5) * 5 : m) + by) % 1440) + 1440) % 1440;
        setTime(`${two(Math.floor(at / 60))}:${two(at % 60)}`);
        paint();
      });
    }
    for (const [input, top] of [[hour, 23], [min, 59]]) {
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 2); paint(); });
      input.addEventListener('blur', () => { const n = num(input, top); input.value = n == null ? '' : two(n); paint(); });
      input.addEventListener('focus', () => input.select());
    }
    box.querySelector('.event-menu__clear').addEventListener('click', () => { setTime(''); paint(); });
    alarm.addEventListener('click', () => {
      if (!ringing && !timeOf()) setTime('09:00');
      ringing = !ringing;
      paint();
    });
    paint();

    let done = false;
    function finish(value) {
      if (done) return;
      done = true;
      closeEventBox = null;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      box.remove();
      resolve(value);
    }
    function save() {
      const at = validAlarm(timeOf()) ?? '';
      const x = text.value.replace(/\s+/g, ' ').trim().slice(0, EVENT_TEXT_MAX);
      if (!x && !at) { text.focus(); return; }
      finish({ id: event?.id ?? newId(), d: day, t: at, x, a: ringing && !!at });
    }
    closeEventBox = () => finish(null);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); return; }
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); save(); }
    }
    function onDown(e) { if (!box.contains(e.target)) finish(null); }
    box.querySelector('.event-menu__ok').addEventListener('click', save);
    box.querySelector('.event-menu__cancel').addEventListener('click', () => finish(null));
    box.querySelector('.event-menu__del')?.addEventListener('click', () => finish({ remove: true }));
    document.body.appendChild(box);
    const w = box.offsetWidth || 300;
    const h = box.offsetHeight || 150;
    const under = anchor.bottom + 8;
    box.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8))}px`;
    box.style.top = `${under + h > window.innerHeight - 8 && anchor.top - h - 8 > 8 ? anchor.top - h - 8 : Math.max(8, Math.min(under, window.innerHeight - h - 8))}px`;
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { if (!done) document.addEventListener('mousedown', onDown, true); }, 0);
    text.focus();
  });
}

/* ---- a number typed ---------------------------------------------------------- */

let closeNumberBox = null;

/**
 * A small field laid over a stepper's number, to type it (1.0.4). Resolves to
 * the number, or to null when left. Enter and a click elsewhere keep what was
 * typed; Escape leaves it as it was. Over the widget, never in it: the note's
 * text has no field in it, and a redraw of the widget does not take it away.
 * @param {DOMRect} anchor the number's own box
 * @param {string|number} value what it reads now
 * @param {number} [digits] how many it may have
 * @returns {Promise<number|null>}
 */
export function askNumber(anchor, value, digits = 3) {
  closeNumberBox?.();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'float-menu link-menu number-menu';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'number-menu__v';
    input.inputMode = 'numeric';
    input.maxLength = digits;
    input.dataset.noI18n = '';
    input.setAttribute('aria-label', t('Click to type it'));
    input.value = String(value ?? '').replace(/\D/g, '').slice(0, digits);
    box.append(input);

    let done = false;
    function finish(v) {
      if (done) return;
      done = true;
      closeNumberBox = null;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', cancel);
      box.remove();
      resolve(v);
    }
    const cancel = () => finish(null);
    const save = () => finish(/^\d+$/.test(input.value) ? Number(input.value) : null);
    closeNumberBox = cancel;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.isComposing) { e.preventDefault(); e.stopPropagation(); save(); }
    }
    function onDown(e) { if (!box.contains(e.target)) save(); }
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, digits); });
    document.body.appendChild(box);
    const w = box.offsetWidth || 64;
    const h = box.offsetHeight || 34;
    // Over the number itself, its middle on the number's.
    box.style.left = `${Math.max(8, Math.min(anchor.left + anchor.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
    box.style.top = `${Math.max(8, Math.min(anchor.top + anchor.height / 2 - h / 2, window.innerHeight - h - 8))}px`;
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { if (!done) document.addEventListener('mousedown', onDown, true); }, 0);
    window.addEventListener('blur', cancel);
    input.focus();
    input.select();
  });
}

/* ---- a city ------------------------------------------------------------------ */

/**
 * The cities to choose from, under the key that asked: a field that narrows
 * them as it is typed in, the list under it. ↑ ↓ move, Enter takes, Escape or
 * a press elsewhere leaves. The list is Nebula's own — nothing is looked up.
 * @param {{left: number, top: number, bottom: number}} anchor
 * @param {{without?: string[], chosen?: string|null}} [o]
 * @returns {Promise<string|null>} the city's id
 */
export function pickCity(anchor, { without = [], chosen = null } = {}) {
  closePicker?.();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'city-menu';
    box.className = 'float-menu link-menu sound-menu city-menu';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('Choose a city'));
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'city-menu__q';
    input.placeholder = t('Search a city');
    input.setAttribute('aria-label', t('Search a city'));
    input.spellcheck = false;
    const list = document.createElement('div');
    list.className = 'sound-menu__list';
    list.setAttribute('role', 'listbox');
    list.dataset.noI18n = '';
    const none = document.createElement('div');
    none.className = 'city-menu__none';
    none.textContent = t('No city by that name');
    box.append(input, list, none);

    let found = [];
    let at = 0;
    const light = () => {
      [...list.children].forEach((b, n) => b.classList.toggle('sel', n === at));
      list.children[at]?.scrollIntoView?.({ block: 'nearest' });
    };
    const paint = () => {
      found = searchCities(input.value, { without, lang: getLang() });
      at = Math.max(0, input.value ? 0 : found.findIndex((c) => c.id === chosen));
      list.replaceChildren(...found.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sound-menu__pick${c.id === chosen ? ' on' : ''}`;
        b.dataset.city = c.id;
        b.setAttribute('role', 'option');
        const name = document.createElement('span');
        name.className = 'city-menu__name';
        name.textContent = c.region ? `${c.name}, ${c.region}` : c.name;
        const cc = document.createElement('span');
        cc.className = 'city-menu__cc';
        cc.textContent = countryName(c.country, getLang());
        b.append(name, cc);
        return b;
      }));
      none.hidden = found.length > 0;
      light();
    };

    let done = false;
    function finish(id) {
      if (done) return;
      done = true;
      closePicker = null;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', cancel);
      box.remove();
      resolve(id);
    }
    const cancel = () => finish(null);
    closePicker = cancel;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); finish(found[at]?.id ?? null); return; }
      const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (!step || !found.length) return;
      e.preventDefault();
      e.stopPropagation();
      at = (at + step + found.length) % found.length;
      light();
    }
    function onDown(e) { if (!box.contains(e.target)) cancel(); }
    input.addEventListener('input', paint);
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const id = e.target.closest('[data-city]')?.dataset.city;
      if (id) finish(id);
    });

    paint();
    document.body.appendChild(box);
    const w = box.offsetWidth || 260;
    const h = box.offsetHeight || 300;
    const under = anchor.bottom + 6;
    box.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8))}px`;
    box.style.top = `${under + h > window.innerHeight - 8 && anchor.top - h - 6 > 8 ? anchor.top - h - 6 : Math.max(8, Math.min(under, window.innerHeight - h - 8))}px`;
    light();
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { if (!done) document.addEventListener('mousedown', onDown, true); }, 0);
    window.addEventListener('blur', cancel);
    input.focus();
  });
}

/* ---- a widget's sound -------------------------------------------------------- */

/**
 * The sounds to choose for one slot, under the widget's button (the owner's
 * Bug Find note: "alarmda ve pomodoroda müzik ve ses ekleme ve ses detectleme
 * yok" — it was only in Settings). Nebula's two, the user's own (each with a
 * ×), the ones the system has, found now; at the foot, adding a file of one's
 * own. A choice rings once, so it is heard. Escape or a press elsewhere closes it.
 * @param {{left: number, top: number, bottom: number}} anchor
 * @param {'alarm'|'focus'|'break'} slot
 */
export async function pickSound(anchor, slot) {
  closePicker?.();
  const choices = await lookUpSounds();
  const box = document.createElement('div');
  box.id = 'sound-menu';
  box.className = 'float-menu link-menu sound-menu';
  box.setAttribute('role', 'dialog');
  const title = document.createElement('div');
  title.className = 'link-menu__title';
  title.textContent = t({ alarm: 'Alarm sound', focus: 'When a focus ends', break: 'When a break ends' }[slot]);
  const list = document.createElement('div');
  list.className = 'sound-menu__list';
  list.setAttribute('role', 'listbox');
  const paint = () => {
    const chosen = soundOf(slot);
    list.replaceChildren(...choices.map((c) => {
      const line = document.createElement('div');
      line.className = `sound-menu__row${c.value === chosen ? ' on' : ''}`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sound-menu__pick';
      b.dataset.sound = c.value;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(c.value === chosen));
      b.textContent = c.label;
      line.append(b);
      if (c.own) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'sound-menu__remove';
        x.dataset.remove = c.value;
        x.title = t('Remove my sound');
        x.setAttribute('aria-label', t('Remove my sound'));
        x.textContent = '×';
        line.append(x);
      }
      return line;
    }));
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'audio/*';
  file.hidden = true;
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'sound-menu__add';
  add.textContent = t('Add a sound of mine…');
  box.append(title, list, add, file);

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    closePicker = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onDown, true);
    box.remove();
  }
  closePicker = finish;
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopRing(); finish(); } }
  function onDown(e) { if (!box.contains(e.target)) finish(); }
  box.addEventListener('mousedown', (e) => { if (e.target !== file) e.preventDefault(); });
  list.addEventListener('click', async (e) => {
    const gone = e.target.closest('[data-remove]')?.dataset.remove;
    if (gone) {
      await removeOwnSound(gone);
      choices.splice(choices.findIndex((c) => c.value === gone), 1);
      paint();
      return;
    }
    const value = e.target.closest('[data-sound]')?.dataset.sound;
    if (!value) return;
    chooseSound(slot, value);
    paint();
    if (value === 'off') stopRing(); else void ring({ id: value });
  });
  add.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const value = await addOwnSound(file.files?.[0], slot);
    file.value = '';
    if (!value) return;
    choices.splice(0, choices.length, ...(await lookUpSounds()));
    paint();
    void ring({ id: value });
  });

  paint();
  document.body.appendChild(box);
  const w = box.offsetWidth || 260;
  const h = box.offsetHeight || 300;
  const under = anchor.bottom + 6;
  box.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8))}px`;
  box.style.top = `${under + h > window.innerHeight - 8 && anchor.top - h - 6 > 8 ? anchor.top - h - 6 : Math.max(8, Math.min(under, window.innerHeight - h - 8))}px`;
  list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => { if (!done) document.addEventListener('mousedown', onDown, true); }, 0);
}

/* ---- in the note ------------------------------------------------------------- */

/**
 * The keys and the clicks of the widgets in a note. A run of presses is one
 * undo step, as a run of typed letters is.
 * @param {HTMLElement} editor
 * @param {{history?: object, selected?: () => HTMLElement|null}} deps
 */
export function initWidgets(editor, { history, selected = () => editor.querySelector('.note-widget.sel') } = {}) {
  const changed = (fig) => {
    renderWidget(fig);
    history?.typed?.();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  };
  function act(fig, key) {
    const kind = fig.dataset.widget;
    if (kind === 'pomodoro' || kind === 'clock') {
      if (LIVE_KEYS.has(key)) { liveKey(fig, key); renderWidget(fig); return; }
      const s = stateOf(fig);
      const next = kind === 'pomodoro' ? stepPomo(s, key) : stepClock(s, key);
      if (!next) return;
      // A timer that is not going takes its new length whole, not what was left of the old one.
      if (kind === 'clock' && next.timer !== s.timer) { const run = timerOf(fig.dataset.wgId); if (!run.endAt) run.left = null; }
      writeState(fig, next);
      changed(fig);
      return;
    }
    if (kind === 'world' || kind === 'weather') {
      const next = stepPlace(stateOf(fig), key, kind === 'world' ? WORLD_MAX : WEATHER_MAX);
      if (!next) return;
      writeState(fig, next);
      changed(fig);
      return;
    }
    if (kind === 'calendar') {
      const s = stateOf(fig);
      const today = isoDay(new Date());
      const month = s.month ?? today.slice(0, 7);
      const chosen = chosenDay(fig, today);
      if (key === 'mark') {
        s.marks = s.marks.includes(chosen) ? s.marks.filter((d) => d !== chosen) : [...s.marks, chosen];
      } else if (key === 'prev' || key === 'next') s.month = shiftMonth(month, key === 'prev' ? -1 : 1);
      else if (key === 'today') { s.month = null; chosenDays.delete(fig.dataset.wgId); }
      else return;
      writeState(fig, s);
    } else {
      writeState(fig, press(stateOf(fig), key));
    }
    changed(fig);
  }
  editor.addEventListener('click', (e) => {
    const hit = e.target.closest?.('.note-widget [data-k], .note-widget [data-day]');
    const fig = hit?.closest('.note-widget');
    if (!fig || !editor.contains(fig)) return;
    // The sounds are the app's, not the note's: chosen in a note that cannot be written too.
    const slot = /^sound-(alarm|focus|break)$/.exec(hit.dataset.k ?? '')?.[1];
    if (slot) { e.preventDefault(); void pickSound(hit.getBoundingClientRect(), slot); return; }
    // A day is chosen in any note: the choice is this window's, not the note's.
    if (hit.dataset.day) { e.preventDefault(); chosenDays.set(fig.dataset.wgId, hit.dataset.day); renderWidget(fig); return; }
    // The weather is asked again in any note: a reading is the window's, not the note's.
    if (hit.dataset.k === 'refresh' && fig.dataset.widget === 'weather') { e.preventDefault(); refreshWeather(fig); return; }
    // A note that cannot be written still starts and stops its timers; only what is saved waits.
    if (editor.dataset.readonly === 'true' && !LIVE_KEYS.has(hit.dataset.k)) return;
    e.preventDefault();
    if (hit.dataset.k === 'city-add' || hit.dataset.k === 'city-pick') { void chooseCity(fig, hit); return; }
    const typed = /^type-(focus|short|long|rounds|timer|h|m)$/.exec(hit.dataset.k ?? '')?.[1];
    if (typed) { void typeValue(fig, hit, typed); return; }
    if (hit.dataset.k === 'add' || hit.dataset.k === 'event') { void writeEvent(fig, hit); return; }
    act(fig, hit.dataset.k);
  });
  /** One more city for a World clock or a Weather, from the list under the key. */
  async function chooseCity(fig, hit) {
    const s = stateOf(fig);
    const world = fig.dataset.widget === 'world';
    if (s.cities.length >= (world ? WORLD_MAX : WEATHER_MAX)) { if (world) say(t('That is as many cities as one world clock holds')); return; }
    const id = await pickCity(hit.getBoundingClientRect(), { without: s.cities });
    if (!id || !fig.isConnected || editor.dataset.readonly === 'true') return;
    act(fig, `city+${id}`);
  }
  /** A stepper's number typed over itself: kept within what its keys allow. */
  async function typeValue(fig, hit, name) {
    const got = await askNumber(hit.getBoundingClientRect(), hit.textContent, TYPED_DIGITS[name] ?? 3);
    if (got == null || !fig.isConnected || editor.dataset.readonly === 'true') return;
    act(fig, `${name}=${got}`);
  }
  /** An event added, changed or deleted in the box under its button. */
  async function writeEvent(fig, hit) {
    const day = chosenDay(fig);
    const old = hit.dataset.k === 'event' ? stateOf(fig).events.find((ev) => ev.id === hit.dataset.ev) : null;
    const got = await editEvent(hit.getBoundingClientRect(), { day: old?.d ?? day, event: old });
    if (!got || !fig.isConnected) return;
    const s = stateOf(fig);
    const rest = s.events.filter((ev) => ev.id !== (old?.id ?? got.id));
    if (!got.remove && rest.length >= EVENTS_MAX) { say(t('That is as many events as one calendar holds')); return; }
    writeState(fig, { ...s, events: got.remove ? rest : [...rest, got] });
    changed(fig);
  }
  // A sound chosen here, in another widget or in Settings: every Pomodoro and Clock shows it.
  on('settings-changed', () => {
    for (const fig of editor.querySelectorAll('.note-widget[data-widget="pomodoro"], .note-widget[data-widget="clock"]')) renderWidget(fig);
  });
  void lookUpSounds().then(() => refreshWidgets(editor)).catch(() => {});
  // A selected calculator takes the keys typed: numbers, operators, Enter, Backspace.
  // On the window, so it is ahead of every key handler of the note (a selected
  // picture's Enter opens a line under it).
  window.addEventListener('keydown', (e) => {
    if (editor.dataset.readonly === 'true') return;
    const fig = selected();
    if (!fig?.isConnected || !editor.contains(fig) || (fig.dataset.widget !== 'calc' && fig.dataset.widget !== 'sci')) return;
    if (e.target?.closest?.('input, textarea, [contenteditable="true"]:not(#editor)')) return;
    const key = keyFor(e);
    if (!key) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    act(fig, key);
  }, true);
  watchUniverses(editor);
}

/** Every widget of a note drawn as it is today (a calendar's today moves on). */
export function refreshWidgets(root) {
  for (const fig of root.querySelectorAll('.note-widget')) renderWidget(fig);
}

/* ---- the Universe: the live map in a note ------------------------------------ */

/*
 * The owner (2026-10-21): "add Universe to the widgets — the live map, added
 * into a note". The note keeps only the widget's face (SKY above); in the
 * editor a map engine (galaxy-map.js) is laid over it in a `.wg-live` layer,
 * which serializeNote strips (note-markup.js TRANSIENT_NODES), so a canvas
 * never reaches what is saved. The engine shows main space only — what the
 * sidebar map shows, a locked black hole as its initials — and never goes
 * into a hole. A double-click on a note opens it. One engine per widget, at
 * most UNIVERSE_MAX in a note; each is destroyed when its widget leaves the
 * note (a note opened in its place, a delete, an undo).
 */
export const UNIVERSE_MAX = 3;
let universe = null;                  // { createMap, getInput, colors, openNote } from main.js
const lives = new Map();              // figure -> { map, layer, ro }
const watched = new Set();            // editors observed
const aside = new Set();              // live layers out of the page while a copy runs

/** What the live map needs, given once the map of the sidebar exists. */
export function setUniverse(deps) {
  hookCopy();
  universe = deps && typeof deps.createMap === 'function' && typeof deps.getInput === 'function' ? deps : null;
  for (const editor of watched) syncUniverses(editor);
}

/** Live Universes in the open notes — for tests. */
export const liveUniverses = () => [...lives.keys()];

function noteOf(body) {
  if (!body) return null;
  if (body.role === 'note') return body.ref ?? String(body.id).replace(/^note:/, '');
  if (body.role === 'label') return String(body.parent || '').replace(/^note:/, '') || null;
  return null;
}

function stopLive(fig) {
  const live = lives.get(fig);
  if (!live) return;
  lives.delete(fig);
  live.ro?.disconnect();
  live.map?.destroy?.();
  live.layer.remove();
}

function startLive(fig) {
  const sky = fig.querySelector(':scope > .wg .wg-sky');
  if (!sky || !universe) return;
  for (const old of sky.querySelectorAll(':scope > .wg-live')) old.remove();   // a copy that came with pasted markup
  const layer = document.createElement('span');
  layer.className = 'wg-live';
  layer.setAttribute('contenteditable', 'false');
  const canvas = document.createElement('canvas');
  canvas.className = 'wg-live-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('Universe'));
  layer.append(canvas);
  // The map's own presses, wheel and keys stay the map's: the widget moves
  // by its title bar, and Backspace on the map must not delete it.
  for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown', 'contextmenu']) {
    layer.addEventListener(type, (e) => e.stopPropagation());
  }
  sky.append(layer);
  const deps = universe;
  let map = null;
  try {
    map = deps.createMap(canvas, {
      getInput: () => deps.getInput(null),           // main space, always
      colors: deps.colors,
      onContext: (body, x, y, opts) => {
        const id = opts?.open ? noteOf(body) : null;
        if (id) deps.openNote?.(id);
      },
      onEnterHole: async () => false,
      names: fig.dataset.wgNames !== 'off',
    });
  } catch { map = null; }
  if (!map) { layer.remove(); return; }
  // "universe widgetine harita sabitleme gelsin": a pinned map keeps the view it
  // was pinned at (saved with the note) and neither drags nor zooms; the wheel
  // scrolls the note past it. The pin itself is the live layer's, never saved.
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'wg-pin';
  pin.tabIndex = -1;
  const paintPin = () => {
    const on = !!pinOf(fig);
    pin.classList.toggle('on', on);
    pin.setAttribute('aria-pressed', String(on));
    pin.title = t(on ? 'Unpin the map' : 'Pin the map here');
    pin.setAttribute('aria-label', pin.title);
    pin.innerHTML = icon(on ? 'lock' : 'unlock');
  };
  pin.addEventListener('click', () => {
    if (fig.closest('[data-readonly="true"]')) return;
    if (pinOf(fig)) delete fig.dataset.wgPin;
    else {
      const v = map.view?.();
      if (!v) return;
      fig.dataset.wgPin = [v.x, v.y, v.zoom].map((n) => Math.round(n * 1000) / 1000).join(',');
      // Held still, the map is a picture: the round marks of a picked body go
      // ("takipten sonra kilide basinca etraftaki yuvarlak isareti kalksin").
      map.select?.(null);
    }
    paintPin();
    fig.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const type of ['pointerdown', 'pointermove', 'wheel', 'dblclick', 'keydown']) {
    layer.addEventListener(type, (e) => { if (e.target === canvas && pinOf(fig)) e.stopPropagation(); }, true);
  }
  paintPin();
  // Beside the lock, Fit: the whole map in view ("tüm haritayi icine alan fit").
  // A pinned map is pinned again at the fitted view, so it stays held.
  const fitBtn = document.createElement('button');
  fitBtn.type = 'button';
  fitBtn.className = 'wg-pin wg-fit';
  fitBtn.tabIndex = -1;
  fitBtn.title = t('Fit the whole map');
  fitBtn.setAttribute('aria-label', fitBtn.title);
  fitBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M10 2v4h4M14 10h-4v4M2 10h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  fitBtn.addEventListener('click', () => {
    const wasRiding = !!fig.dataset.wgFollow;
    delete fig.dataset.wgFollow;
    paintFollow();
    if (!pinOf(fig)) {
      map.fit?.({ glide: true });
      if (wasRiding) fig.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (fig.closest('[data-readonly="true"]')) return;
    map.fit?.();
    const v = map.view?.();
    if (!v) return;
    fig.dataset.wgPin = [v.x, v.y, v.zoom].map((n) => Math.round(n * 1000) / 1000).join(',');
    fig.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Between the lock and Fit, Follow (1.0.3, the owner: "universe bir cismi
  // takip etme özelligi"): the camera rides the body picked on the map, kept
  // with the note; pinned too, the map then stays on it at the pinned zoom.
  const followBtn = document.createElement('button');
  followBtn.type = 'button';
  followBtn.className = 'wg-pin wg-follow';
  followBtn.tabIndex = -1;
  followBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  function paintFollow() {
    const on = !!fig.dataset.wgFollow;
    followBtn.classList.toggle('on', on);
    followBtn.setAttribute('aria-pressed', String(on));
    followBtn.title = t(on ? 'Stop following' : 'Follow the body picked');
    followBtn.setAttribute('aria-label', followBtn.title);
  }
  followBtn.addEventListener('click', () => {
    if (fig.closest('[data-readonly="true"]')) return;
    if (fig.dataset.wgFollow) {
      delete fig.dataset.wgFollow;
      map.track?.(null);
    } else {
      const id = map.selected?.() ?? map.tracked?.();
      if (!id || !map.track?.(id)) {
        window.dispatchEvent(new CustomEvent('nebula-toast', { detail: t('Click a body on the map first') }));
        return;
      }
      fig.dataset.wgFollow = id;
    }
    paintFollow();
    fig.dispatchEvent(new Event('input', { bubbles: true }));
  });
  paintFollow();
  // A drag or another body clicked lets go of the one followed: the button says so.
  layer.addEventListener('pointerup', () => requestAnimationFrame(() => {
    if (!fig.dataset.wgFollow || map.tracked?.()) return;
    delete fig.dataset.wgFollow;
    paintFollow();
    fig.dispatchEvent(new Event('input', { bubbles: true }));
  }));
  // Beside Fit, the big map's Hide names (1.0.3, the owner: "universe widgetine de
  // isimleri gizleme gelsin"); kept with the widget. A picked body still names its own.
  const namesBtn = document.createElement('button');
  namesBtn.type = 'button';
  namesBtn.className = 'wg-pin wg-names';
  namesBtn.tabIndex = -1;
  namesBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12.5 5.2 3.5h.6L9 12.5M3.2 9.5h4.6M10.5 12.5V7m0 0c.6-.9 1.4-1.3 2.3-1.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path class="wg-names-off" d="M2 14 14 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  function paintNames() {
    const hidden = fig.dataset.wgNames === 'off';
    namesBtn.classList.toggle('on', hidden);
    namesBtn.setAttribute('aria-pressed', String(hidden));
    namesBtn.title = t(hidden ? 'Show names' : 'Hide names');
    namesBtn.setAttribute('aria-label', namesBtn.title);
    map.setNames?.(!hidden);
  }
  namesBtn.addEventListener('click', () => {
    if (fig.closest('[data-readonly="true"]')) return;
    if (fig.dataset.wgNames === 'off') delete fig.dataset.wgNames; else fig.dataset.wgNames = 'off';
    paintNames();
    fig.dispatchEvent(new Event('input', { bubbles: true }));
  });
  paintNames();
  layer.append(namesBtn, fitBtn, followBtn, pin);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.resize?.()) : null;
  ro?.observe(layer);
  requestAnimationFrame(() => {
    map.resize?.();
    const at = pinOf(fig);
    if (at) map.restore?.({ ...at, manual: true }); else map.fit?.();
    // A body it followed is ridden again; one gone from the map lets go.
    if (fig.dataset.wgFollow && !map.track?.(fig.dataset.wgFollow, { instant: true })) { delete fig.dataset.wgFollow; paintFollow(); }
  });
  lives.set(fig, { map, layer, ro });
}

/** Where a Universe's map is pinned: {x, y, zoom}, or null when it moves freely. Pure — tested. */
export function pinOf(fig) {
  const [x, y, zoom] = String(fig?.dataset?.wgPin ?? '').split(',').map(Number);
  return [x, y, zoom].every(Number.isFinite) && zoom > 0 ? { x, y, zoom } : null;
}

/** Every Universe of this editor live (up to the cap), every gone one stopped. */
export function syncUniverses(editor) {
  // A widget that left the page, or whose face was drawn again (the layer went with it).
  for (const [fig, live] of [...lives]) {
    if (!fig.isConnected || (!live.layer.isConnected && !aside.has(live.layer))) stopLive(fig);
  }
  const figs = universe ? [...editor.querySelectorAll('.note-widget[data-widget="universe"]')] : [];
  figs.forEach((fig, n) => {
    if (n >= UNIVERSE_MAX) stopLive(fig);
    else if (!lives.has(fig)) startLive(fig);
  });
  if (!universe) for (const fig of [...lives.keys()]) if (editor.contains(fig)) stopLive(fig);
}

/** The live maps drawn again from the notes (with the sidebar map's refresh). */
export function refreshUniverses() {
  for (const { map } of lives.values()) map.refresh?.();
}

/**
 * A copy (or cut) never takes a live map along (Codex 34 #3): whatever copies
 * it — a selection, a selected widget (rich-paste copyImage), a picked block
 * (block-handle) — the live layers of the Universes in it are out of the page
 * while the copy event and the browser's own copy run, and back right after
 * (the same elements, so the maps go on; the observer finds them in place).
 * On the window, ahead of every copy handler of the note.
 */
export function liftLiveForCopy(root = document) {
  const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  const lifted = [];
  for (const [fig, live] of lives) {
    if (!fig.isConnected || !root.contains(fig) || !live.layer.parentNode) continue;
    const inCopy = fig.classList.contains('sel') || !!fig.closest('.block-picked')
      || (range && !range.collapsed && range.intersectsNode(fig));
    if (!inCopy) continue;
    lifted.push([fig, live.layer, live.layer.parentNode, live.layer.nextSibling]);
    aside.add(live.layer);
    live.layer.remove();
  }
  const put = () => {
    for (const [fig, layer, parent, next] of lifted) {
      aside.delete(layer);
      if (lives.get(fig)?.layer !== layer || layer.isConnected) continue;
      if (fig.isConnected && parent.isConnected) parent.insertBefore(layer, next && next.parentNode === parent ? next : null);
      else stopLive(fig);
    }
  };
  if (lifted.length) setTimeout(put, 0);
  return { count: lifted.length, put };
}
let copyHooked = false;
function hookCopy() {
  if (copyHooked || typeof window === 'undefined') return;
  copyHooked = true;
  for (const type of ['copy', 'cut']) window.addEventListener(type, () => { if (lives.size) liftLiveForCopy(); }, true);
}

function watchUniverses(editor) {
  hookCopy();
  if (watched.has(editor)) return;
  watched.add(editor);
  let queued = 0;
  const later = (records) => {
    // Typing moves text, never a Universe: only an element that came or went
    // can change which figures are live, and the rescan is a query over the
    // whole note — skipped while someone types in a large one (perf, 2026-10-23).
    if (records && !records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1))) return;
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; syncUniverses(editor); });
  };
  if (typeof MutationObserver === 'function') new MutationObserver(later).observe(editor, { childList: true, subtree: true });
  later();
}

/* ---- printing ---------------------------------------------------------------- */

export const WIDGET_PRINT_KEY = 'nebula:print-widgets';

export function getWidgetPrint(storage = globalThis.localStorage) {
  try { return storage?.getItem(WIDGET_PRINT_KEY) === 'without' ? 'without' : 'with'; } catch { return 'with'; }
}
export function setWidgetPrint(mode, storage = globalThis.localStorage) {
  const m = mode === 'without' ? 'without' : 'with';
  try { storage?.setItem(WIDGET_PRINT_KEY, m); } catch { /* this run only */ }
  return m;
}

/** Whether the note holds a widget. */
export const hasWidgets = (html) => /\bnote-widget\b/.test(String(html ?? ''));

/** The note without its widgets, for a print or an export that leaves them out. */
export function withoutWidgets(html) {
  if (!hasWidgets(html)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const fig of doc.body.querySelectorAll('.note-widget')) {
    const line = fig.parentElement;
    fig.remove();
    if (line?.matches('p') && !line.textContent.trim() && !line.firstElementChild) line.innerHTML = '<br>';
  }
  return doc.body.innerHTML;
}
