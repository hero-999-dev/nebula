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

export const WIDGETS = [
  { kind: 'calc', ic: 'calculator', label: 'Calculator', width: 240, ratio: 0.72 },
  { kind: 'sci', ic: 'sciCalc', label: 'Scientific calculator', width: 360, ratio: 0.95 },
  { kind: 'calendar', ic: 'calendar', label: 'Calendar', width: 280, ratio: 0.92 },
  { kind: 'universe', ic: 'universe', label: 'Universe', width: 420, ratio: 1.6 },
];
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
  };
}

function writeState(fig, s) {
  const set = (key, value) => { if (value) fig.dataset[key] = value; else delete fig.dataset[key]; };
  if (fig.dataset.widget === 'calendar') {
    set('wgMonth', s.month);
    set('wgMarks', [...new Set(s.marks)].sort().join(','));
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

function calendarHtml(spec, s, today) {
  const month = s.month ?? today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const lang = getLang();
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
    return `<button type="button" class="${cls.join(' ')}" data-day="${d.date}" tabindex="-1">${d.day}</button>`;
  }).join('');
  return `${head(spec)}<span class="wg-cal-head"><button type="button" class="wg-nav" data-k="prev" tabindex="-1" aria-label="${esc(t('Previous month'))}">‹</button>`
    + `<button type="button" class="wg-month" data-k="today" tabindex="-1" title="${esc(t('This month'))}">${esc(title)}</button>`
    + `<button type="button" class="wg-nav" data-k="next" tabindex="-1" aria-label="${esc(t('Next month'))}">›</button></span>`
    + `<span class="wg-cal">${names.join('')}${days}</span>`;
}

// The Universe's stored face: rings round a core. What is kept in the note,
// printed and copied is this; the live map is laid over it in the editor only.
const SKY = '<svg class="wg-sky-art" viewBox="0 0 120 70" aria-hidden="true">'
  + '<ellipse cx="60" cy="35" rx="16" ry="9"/><ellipse cx="60" cy="35" rx="32" ry="18"/><ellipse cx="60" cy="35" rx="50" ry="28"/>'
  + '<circle cx="60" cy="35" r="2.4" class="wg-sky-core"/><circle cx="76" cy="35" r="1.6"/><circle cx="35" cy="24" r="2"/><circle cx="96" cy="45" r="2.2"/><circle cx="22" cy="44" r="1.4"/></svg>';
function universeHtml(spec) {
  return `${head(spec)}<span class="wg-sky">${SKY}</span>`;
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
  const html = spec.kind === 'calendar' ? calendarHtml(spec, s, today)
    : spec.kind === 'universe' ? universeHtml(spec)
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
  renderWidget(fig);
  return fig;
}

export const isWidget = (el) => !!el?.classList?.contains('note-widget');

/* ---- the picker -------------------------------------------------------------- */

let closePicker = null;

/**
 * The widgets to choose from, where the caret is (as the link menu opens).
 * Arrows move, Enter takes, Escape or a press elsewhere closes it.
 * @param {{left: number, top: number, bottom: number}} anchor
 * @returns {Promise<string|null>} the kind chosen
 */
export function pickWidget(anchor) {
  closePicker?.();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'widget-menu';
    box.className = 'float-menu link-menu widget-menu';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('Add a widget'));
    const title = document.createElement('div');
    title.className = 'link-menu__title';
    title.textContent = t('Add a widget');
    const options = document.createElement('div');
    options.className = 'widget-menu__options';
    const buttons = WIDGETS.map((spec, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.widgetKind = spec.kind;
      b.className = n === 0 ? 'sel' : '';
      b.innerHTML = `<span class="fm-ic">${icon(spec.ic)}</span><span></span>`;
      b.lastChild.textContent = t(spec.label);
      options.appendChild(b);
      return b;
    });
    box.append(title, options);
    let at = 0;
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
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(WIDGETS[at].kind); return; }
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!step) { if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) cancel(); return; }
      e.preventDefault();
      e.stopPropagation();
      at = (at + step + WIDGETS.length) % WIDGETS.length;
      light();
    }
    function onDown(e) { if (!box.contains(e.target)) cancel(); }
    box.addEventListener('mousedown', (e) => e.preventDefault());
    options.addEventListener('click', (e) => {
      const b = e.target.closest('[data-widget-kind]');
      if (b) finish(b.dataset.widgetKind);
    });
    options.addEventListener('mousemove', (e) => {
      const b = e.target.closest('[data-widget-kind]');
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
  function act(fig, key, day) {
    if (fig.dataset.widget === 'calendar') {
      const s = stateOf(fig);
      const today = isoDay(new Date());
      const month = s.month ?? today.slice(0, 7);
      if (day) {
        s.marks = s.marks.includes(day) ? s.marks.filter((d) => d !== day) : [...s.marks, day];
      } else if (key === 'prev' || key === 'next') s.month = shiftMonth(month, key === 'prev' ? -1 : 1);
      else if (key === 'today') s.month = null;
      else return;
      writeState(fig, s);
    } else {
      writeState(fig, press(stateOf(fig), key));
    }
    changed(fig);
  }
  editor.addEventListener('click', (e) => {
    if (editor.dataset.readonly === 'true') return;
    const hit = e.target.closest?.('.note-widget [data-k], .note-widget [data-day]');
    const fig = hit?.closest('.note-widget');
    if (!fig || !editor.contains(fig)) return;
    e.preventDefault();
    act(fig, hit.dataset.k, hit.dataset.day);
  });
  // A selected calculator takes the keys typed: numbers, operators, Enter, Backspace.
  // On the window, so it is ahead of every key handler of the note (a selected
  // picture's Enter opens a line under it).
  window.addEventListener('keydown', (e) => {
    if (editor.dataset.readonly === 'true') return;
    const fig = selected();
    if (!fig?.isConnected || !editor.contains(fig) || fig.dataset.widget === 'calendar' || fig.dataset.widget === 'universe') return;
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
    });
  } catch { map = null; }
  if (!map) { layer.remove(); return; }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.resize?.()) : null;
  ro?.observe(layer);
  requestAnimationFrame(() => { map.resize?.(); map.fit?.(); });
  lives.set(fig, { map, layer, ro });
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
