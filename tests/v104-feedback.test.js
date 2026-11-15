/**
 * 1.0.4, the owner's feedback of the last day before it:
 *  - the AI panel has no animation coming in, the left panel has one both ways;
 *  - moving a shape gets mixed up with the mouse's catching (the pick box, the sweep);
 *  - Ctrl+Z after a picture was put back sends the caret to the very top of the page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { initDock, ARRIVING } from '../src/js/dock.js';
import { initBlockHandles } from '../src/js/block-handle.js';
import { initHistory } from '../src/js/history.js';
import { calendarRows, calendarRatio, makeWidget } from '../src/js/widgets.js';
import { readFileSync } from 'node:fs';

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('the AI panel, arriving', () => {
  const page = () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="edit-shell" class="edit-shell bar-top"></div><aside id="ai-panel" hidden></aside><button id="ai-close"></button>'
      + '<div id="pad">' + ['top', 'right', 'ai', 'bottom', 'left', 'hide'].map((k) => `<button data-pad="${k}"></button>`).join('') + '</div>';
    const ai = document.getElementById('ai-panel');
    const runs = [];
    ai.animate = (frames, timing) => {
      const run = { frames, timing, cancelled: false, cancel() { this.cancelled = true; this.oncancel?.(); }, pause() {}, play() {} };
      runs.push(run);
      return run;
    };
    return { ai, runs, press: () => document.querySelector('[data-pad="ai"]').click() };
  };

  it('carries its mark while it slides in, and loses it when it has come', () => {
    const { ai, runs, press } = page();
    initDock();
    press();
    expect(ai.hidden).toBe(false);
    expect(ai.classList.contains(ARRIVING)).toBe(true);
    runs[0].onfinish();
    expect(ai.classList.contains(ARRIVING)).toBe(false);
  });

  it('loses the mark when it is shut on its way in, and has none when it opens still', () => {
    const { ai, runs, press } = page();
    initDock();
    press();
    press();                       // shut while it comes
    expect(runs[0].cancelled).toBe(true);
    expect(ai.classList.contains(ARRIVING)).toBe(false);

    const again = page();
    localStorage.setItem('nebula:layout', JSON.stringify({ ai: true }));
    initDock();
    expect(again.ai.hidden).toBe(false);
    expect(again.ai.classList.contains(ARRIVING)).toBe(false);
  });

  // The left panel moves whatever the system says of motion; this one stood still under "reduce".
  it('slides whatever the system says of motion', () => {
    const { runs, press } = page();
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    try {
      initDock();
      press();
      expect(runs).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('a press over a shape behind the text', () => {
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top });
  const laid = () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<div class="shape-layer shape-layer--behind"><div class="shape"></div></div><p>one</p><p>two</p>';
    document.body.replaceChildren(editor);
    editor.getBoundingClientRect = () => rect(0, 0, 800, 600);
    Object.defineProperty(editor, 'clientWidth', { value: 800 });
    Object.defineProperty(editor, 'offsetWidth', { value: 800 });
    editor.querySelector('.shape').getBoundingClientRect = () => rect(300, 100, 500, 200);
    initBlockHandles(editor, { history: { push() {}, commit() {} } });
    const drag = (x, y) => {
      editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: x + 60, clientY: y + 60 }));
      const drawn = !!document.querySelector('.block-band');
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + 60, clientY: y + 60 }));
      return drawn;
    };
    return { drag };
  };

  it('draws no pick box: the shape is what moves', () => {
    const { drag } = laid();
    expect(drag(400, 150)).toBe(false);
  });

  it('and beside the shape the box is drawn as before', () => {
    const { drag } = laid();
    expect(drag(600, 300)).toBe(true);
  });
});

describe('Ctrl+Z and the caret', () => {
  // Where each line lies, by its words; the note shows 0..500.
  const TOPS = { top: -900, near: 100, far: 2000, pic: 2100, end: 2200 };
  const laid = (html) => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.innerHTML = html;
    document.body.replaceChildren(editor);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function place() {
      const top = this === editor ? 0 : TOPS[this.textContent] ?? 0;
      const height = this === editor ? 500 : 20;
      return { left: 0, right: 800, width: 800, top, bottom: top + height, height, x: 0, y: top };
    });
    const shown = vi.fn();
    Element.prototype.scrollIntoView = shown;
    const line = (words) => [...editor.querySelectorAll('p')].find((p) => p.textContent === words);
    const caretIn = (words) => {
      const range = document.createRange();
      range.setStart(line(words).firstChild, 1);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
    const caretLine = () => window.getSelection().anchorNode?.parentElement?.textContent;
    // A picture moved by the mouse: a step made by script, the caret not touched.
    const move = (history) => { history.push(); editor.append(line('pic')); history.commit(); };
    return { editor, shown, caretIn, caretLine, move, order: () => [...editor.querySelectorAll('p')].map((p) => p.textContent).join(' ') };
  };
  afterEach(() => { delete Element.prototype.scrollIntoView; });

  it('a step that kept no caret leaves the caret where it was, not at the top of the note', () => {
    const { editor, shown, caretIn, caretLine, move, order } = laid('<p>top</p><p>far</p><p>pic</p><p>end</p>');
    window.getSelection().removeAllRanges();
    const history = initHistory(editor);          // a note just opened: its first step has no caret
    caretIn('far');
    move(history);
    expect(order()).toBe('top far end pic');
    expect(history.undo()).toBe(true);
    expect(order()).toBe('top far pic end');
    expect(caretLine()).toBe('far');
    expect(shown).not.toHaveBeenCalled();
  });

  it('the page stays when the caret was out of sight before the step', () => {
    const { editor, shown, caretIn, caretLine, move } = laid('<p>top</p><p>far</p><p>pic</p><p>end</p>');
    const history = initHistory(editor);
    caretIn('top');                               // typed up there earlier, then scrolled down
    history.commit();
    move(history);
    history.undo();
    expect(caretLine()).toBe('top');
    expect(shown).not.toHaveBeenCalled();
  });

  it('and follows the caret a step puts back when the reader was at the caret', () => {
    const { editor, shown, caretIn, caretLine, move } = laid('<p>near</p><p>far</p><p>pic</p><p>end</p>');
    const history = initHistory(editor);
    caretIn('far');
    move(history);                                // the step remembers the caret down there
    caretIn('near');
    history.undo();
    expect(caretLine()).toBe('far');
    expect(shown).toHaveBeenCalledTimes(1);
  });
});

// "calendar: the part below is very empty, make it shorter" (the owner's note, 1.0.4).
describe('a calendar is as high as what it holds', () => {
  const on = (d, n) => Array.from({ length: n }, (_, i) => ({ id: `${d}-${i}`, d, t: '', x: 'x', a: false }));

  it('keeps one line under its day, or as many as its fullest day holds, three at the most', () => {
    expect(calendarRows([])).toBe(1);
    expect(calendarRows(undefined)).toBe(1);
    expect(calendarRows(on('2026-11-12', 1))).toBe(1);
    expect(calendarRows([...on('2026-11-12', 2), ...on('2026-11-13', 1)])).toBe(2);
    expect(calendarRows([...on('2026-11-12', 1), ...on('2026-11-13', 1), ...on('2026-11-14', 1)])).toBe(1);   // by the day, not by the count
    expect(calendarRows(on('2026-11-12', 7))).toBe(3);
  });

  it('is shorter for fewer lines, and the widget says so', () => {
    expect(calendarRatio(1)).toBeGreaterThan(calendarRatio(2));
    expect(calendarRatio(2)).toBeGreaterThan(calendarRatio(3));
    expect(calendarRatio(1)).toBeGreaterThan(0.8);          // what it was, whatever it held
    const fig = makeWidget('calendar');
    expect(fig.querySelector('.wg-events').dataset.rows).toBe('1');
    expect(fig.dataset.ratio).toBe(calendarRatio(1).toFixed(3));
  });

  it('has no height of its own in the style sheet: its lines give it', () => {
    const css = readFileSync('src/css/editor.css', 'utf8');
    expect(css).toMatch(/\.note-widget > \.wg--calendar \{ aspect-ratio: auto;/);
    expect(css).toMatch(/\.wg-events\[data-rows="3"\] \{ height:/);
    expect(css).not.toMatch(/\.wg-agenda \{ flex: 1/);
  });
});
