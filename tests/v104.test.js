/**
 * @vitest-environment jsdom
 *
 * 1.0.4, from the owner's Nebula note: the line under a column's last picture
 * stays deleted, a band over one column picks that column's blocks, and the
 * corner card steps through its sizes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { healColumns, tightenColumn } from '../src/js/columns.js';
import { blocksInBand } from '../src/js/block-handle.js';
import { nextCardSize, stepClock, stepPomo, POMO_LIMITS, TIMER_LIMITS, makeWidget, initWidgets, stateOf, widgetRuns } from '../src/js/widgets.js';
import { initDock } from '../src/js/dock.js';

const PICTURE = '<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image"><img alt=""></figure>';
const note = (html) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
};
const ROW = `<div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;" id="row"><div class="blk-col" id="l"><p id="l1">left</p>${PICTURE}</div><hr class="blk-vr"><div class="blk-col" id="r"><p id="r1">right</p><p id="r2">more</p></div></div>`;

describe('the line under a column’s last picture', () => {
  it('is given to a column that ends with a picture', () => {
    const root = note(ROW);
    healColumns(root);
    expect(root.querySelector('#l').lastElementChild.tagName).toBe('P');
  });

  it('stays away once it was deleted, and the mark goes when the column ends with a line again', () => {
    const root = note(ROW);
    const col = root.querySelector('#l');
    tightenColumn(col);
    expect(col.dataset.tight).toBe('1');
    healColumns(root);
    expect(col.lastElementChild.tagName).toBe('FIGURE');
    col.insertAdjacentHTML('beforeend', '<p>written under it</p>');
    healColumns(root);
    expect(col.dataset.tight).toBeUndefined();
  });

  it('marks only a column, and only one that ends with something no caret goes under', () => {
    const root = note(ROW);
    tightenColumn(root.querySelector('#r'));
    tightenColumn(root);
    tightenColumn(null);
    expect(root.querySelector('#r').dataset.tight).toBeUndefined();
    expect(root.dataset.tight).toBeUndefined();
  });
});

describe('a band drawn on the page', () => {
  const place = (el, left, top, right, bottom) => { el.getBoundingClientRect = () => ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top }); };
  const laid = () => {
    const root = note(`<p id="a">above</p>${ROW}<p id="b">below</p>`);
    const $ = (id) => root.querySelector(`#${id}`);
    place($('a'), 0, 0, 800, 20);
    place($('row'), 0, 20, 800, 220);
    place($('l'), 0, 20, 390, 220);
    place($('l1'), 0, 20, 390, 40);
    place($('l').querySelector('figure'), 0, 40, 200, 220);
    place($('r'), 410, 20, 800, 220);
    place($('r1'), 410, 20, 800, 40);
    place($('r2'), 410, 40, 800, 60);
    place($('b'), 0, 220, 800, 240);
    return root;
  };
  const ids = (blocks) => blocks.map((b) => b.id || b.tagName.toLowerCase());

  it('within one column picks that column’s blocks', () => {
    expect(ids(blocksInBand(laid(), { left: 500, right: 700, top: 25, bottom: 55 }))).toEqual(['r1', 'r2']);
    expect(ids(blocksInBand(laid(), { left: 20, right: 100, top: 50, bottom: 100 }))).toEqual(['figure']);
  });

  it('across two columns picks the row', () => {
    expect(ids(blocksInBand(laid(), { left: 300, right: 500, top: 25, bottom: 55 }))).toEqual(['row']);
  });

  it('that reaches past the row picks the note’s blocks', () => {
    expect(ids(blocksInBand(laid(), { left: 500, right: 700, top: 5, bottom: 55 }))).toEqual(['a', 'row']);
  });

  it('over pictures side by side takes those it reaches, and all of them with a line of the note', () => {
    const row = (id) => `<figure class="note-image note-image--inline note-image--row" id="${id}"><img alt=""></figure>`;
    const root = note(`<p id="a">above</p>${row('p1')}${row('p2')}${row('p3')}`);
    const $ = (id) => root.querySelector(`#${id}`);
    place($('a'), 0, 0, 800, 20);
    place($('p1'), 0, 20, 200, 120);
    place($('p2'), 210, 20, 410, 120);
    place($('p3'), 420, 20, 620, 120);
    expect(ids(blocksInBand(root, { left: 700, right: 720, top: 40, bottom: 60 }))).toEqual([]);
    expect(ids(blocksInBand(root, { left: 300, right: 500, top: 40, bottom: 60 }))).toEqual(['p2', 'p3']);
    expect(ids(blocksInBand(root, { left: 700, right: 720, top: 10, bottom: 60 }))).toEqual(['a', 'p1', 'p2', 'p3']);
  });

  it('over the empty foot of a column picks the row', () => {
    expect(ids(blocksInBand(laid(), { left: 500, right: 700, top: 100, bottom: 200 }))).toEqual(['row']);
  });
});

describe('the AI panel slides', () => {
  const page = () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="edit-shell" class="edit-shell bar-top"></div><aside id="ai-panel" hidden></aside><button id="ai-close"></button>'
      + '<div id="pad">' + ['top', 'right', 'ai', 'bottom', 'left', 'hide'].map((k) => `<button data-pad="${k}"></button>`).join('') + '</div>';
    const ai = document.getElementById('ai-panel');
    const runs = [];
    ai.animate = (frames, timing) => {
      const run = { frames, timing, cancelled: false, paused: false, cancel() { this.cancelled = true; this.oncancel?.(); }, pause() { this.paused = true; }, play() { this.paused = false; } };
      runs.push(run);
      return run;
    };
    return { ai, runs, press: () => document.querySelector('[data-pad="ai"]').click() };
  };

  it('in from the edge at a press, and is hidden only when the slide out has ended', () => {
    const { ai, runs, press } = page();
    initDock();
    expect(runs).toHaveLength(0);
    press();
    expect(ai.hidden).toBe(false);
    expect(runs).toHaveLength(1);
    expect(runs[0].frames[1].marginRight).toBe('0px');
    press();
    expect(ai.hidden).toBe(false);
    expect(runs[1].frames[0].marginRight).toBe('0px');
    runs[1].onfinish();
    expect(ai.hidden).toBe(true);
  });

  // The owner, later that day: "it still does not flow in like the left one" — showing the panel wakes its
  // chat page, and the window stood still through most of the slide.
  it('waits at the edge, held there, until two frames in a row come evenly, and not for ever', () => {
    const { runs, press } = page();
    const frames = [];
    let clock = 1000;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((fn) => frames.push(fn));
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const frame = (after) => { clock += after; frames.shift()(); };
    try {
      initDock();
      press();
      expect(runs[0].paused).toBe(true);
      expect(runs[0].timing.fill).toBe('backwards');
      expect(runs[0].timing.duration).toBe(140);
      frame(16);
      frame(90);      // the page woke: a long frame, the count begins again
      expect(runs[0].paused).toBe(true);
      frame(16);
      expect(runs[0].paused).toBe(true);
      frame(17);
      expect(runs[0].paused).toBe(false);
      expect(frames).toHaveLength(0);

      press(); runs[1].onfinish();
      press();
      for (let i = 0; i < 5; i++) frame(100);      // never even: it comes in all the same
      expect(runs[2].paused).toBe(false);
      expect(frames).toHaveLength(0);

      // Shut while it waits: the slide in is dropped and never played.
      press(); runs[3].onfinish();
      press();
      press();
      expect(runs[4].cancelled).toBe(true);
      frame(16);
      expect(frames).toHaveLength(0);
      expect(runs[4].paused).toBe(true);
    } finally { raf.mockRestore(); now.mockRestore(); }
  });

  it('stays when it is opened again on its way out, and opens still when it was open at the start', () => {
    const { ai, runs, press } = page();
    initDock();
    press();
    press();
    press();
    expect(runs[1].cancelled).toBe(true);
    expect(ai.hidden).toBe(false);
    expect(runs).toHaveLength(2);

    const again = page();
    localStorage.setItem('nebula:layout', JSON.stringify({ ai: true }));
    initDock();
    expect(again.ai.hidden).toBe(false);
    expect(again.runs).toHaveLength(0);
  });
});

describe('the Clock’s timer', () => {
  it('steps its keys on the state, and leaves other keys alone', () => {
    const s = { view: 'clock', timer: 10, alarm: '07:00', alarmOn: false };
    expect(stepClock(s, 'view-timer').view).toBe('timer');
    expect(stepClock({ ...s, view: 'timer' }, 'view-clock').view).toBe('clock');
    expect(stepClock(s, 'timer+').timer).toBe(15);
    expect(stepClock({ ...s, timer: 1 }, 'timer-').timer).toBe(TIMER_LIMITS[0]);
    // No most: it goes on past three hours, and a typed length is kept whole.
    expect(stepClock({ ...s, timer: 180 }, 'timer+').timer).toBe(185);
    expect(stepClock(s, 'timer=1440').timer).toBe(1440);
    expect(stepClock(s, 'timer=0').timer).toBe(1);
    expect(stepClock(s, 'h=6').alarm).toBe('06:00');
    expect(stepClock(s, 'h=99').alarm).toBe('23:00');
    expect(stepClock(s, 'm=45').alarm).toBe('07:45');
    expect(stepClock(s, 'm=75').alarm).toBe('07:59');
    expect(stepClock(s, 'timer=x')).toBeNull();
    expect(stepClock(s, 'alarm').alarmOn).toBe(true);
    expect(stepClock(s, 'h+').alarm).toBe('08:00');
    expect(stepClock(s, 'start')).toBeNull();
  });

  it('is a tab of the clock: set, started, paused and reset by its keys, and saved only when changed', () => {
    const editor = document.createElement('div');
    editor.id = 'editor';
    document.body.replaceChildren(editor);
    const fig = makeWidget('clock');
    editor.append(fig);
    initWidgets(editor);
    const click = (k) => fig.querySelector(`[data-k="${k}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fig.querySelector('[data-k="alarm"]')).not.toBeNull();
    expect(fig.dataset.wgTimer).toBeUndefined();
    click('view-timer');
    expect(fig.dataset.wgMode).toBe('timer');
    expect(fig.querySelector('[data-k="alarm"]')).toBeNull();
    expect(fig.querySelector('.wg-time').textContent).toBe('10:00');
    click('timer-');
    expect(fig.dataset.wgTimer).toBe('5');
    expect(fig.querySelector('.wg-time').textContent).toBe('05:00');
    click('start');
    expect(fig.querySelector('[data-k="start"]').textContent).toBe('Pause');
    expect(widgetRuns().timers.get(fig.dataset.wgId).endAt).toBeGreaterThan(Date.now());
    click('start');
    expect(fig.querySelector('[data-k="start"]').textContent).toBe('Start');
    expect(widgetRuns().timers.get(fig.dataset.wgId).left).toBeGreaterThan(0);
    click('timer+');
    expect(fig.querySelector('.wg-time').textContent).toBe('10:00');
    expect(fig.dataset.wgTimer).toBeUndefined();
    click('start');
    click('reset');
    expect(widgetRuns().timers.get(fig.dataset.wgId)).toEqual({ left: null, endAt: null });
    click('view-clock');
    expect(fig.dataset.wgMode).toBeUndefined();
    expect(stateOf(fig)).toMatchObject({ view: 'clock', timer: 10, alarm: '07:00' });
    editor.remove();
  });

  it('is not a Pomodoro’s tab', () => {
    const fig = makeWidget('pomodoro');
    fig.dataset.wgMode = 'timer';
    expect(stateOf(fig)).toMatchObject({ view: 'clock', mode: 'pomo' });
  });
});

describe('a stepper’s number, typed', () => {
  const widget = (kind, data = {}) => {
    const editor = document.createElement('div');
    editor.id = 'editor';
    document.body.replaceChildren(editor);
    const fig = makeWidget(kind);
    Object.assign(fig.dataset, data);
    editor.append(fig);
    initWidgets(editor);
    const click = (k) => fig.querySelector(`[data-k="${k}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { editor, fig, click };
  };
  const type = async (text, key = 'Enter') => {
    const input = document.querySelector('.number-menu__v');
    input.value = text;
    input.dispatchEvent(new Event('input'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    return input;
  };

  it('is kept within six hours in a Pomodoro, and one to twelve sessions', () => {
    const s = { focus: 25, short: 5, long: 15, rounds: 4 };
    expect(POMO_LIMITS.focus[1]).toBe(360);
    expect(stepPomo(s, 'focus=45').focus).toBe(45);
    expect(stepPomo(s, 'focus=900').focus).toBe(360);
    expect(stepPomo(s, 'short=0').short).toBe(1);
    expect(stepPomo(s, 'long=361').long).toBe(360);
    expect(stepPomo(s, 'rounds=40').rounds).toBe(12);
    expect(stepPomo({ ...s, focus: 355 }, 'focus+').focus).toBe(360);
    expect(stepPomo({ ...s, focus: 360 }, 'focus+').focus).toBe(360);
  });

  it('opens a field over the number: Enter keeps it, Escape leaves it, letters are not taken', async () => {
    const { fig, click } = widget('pomodoro');
    click('type-focus');
    expect(document.querySelector('.number-menu__v').value).toBe('25');
    const input = await type('4a7');
    expect(input.value).toBe('47');
    expect(document.querySelector('.number-menu')).toBeNull();
    expect(fig.dataset.wgFocus).toBe('47');
    expect(fig.querySelector('[data-k="type-focus"]').textContent).toBe('47');
    click('type-long');
    await type('999', 'Escape');
    expect(stateOf(fig).long).toBe(15);
    click('type-short');
    await type('999');
    expect(stateOf(fig).short).toBe(360);
    click('type-rounds');
    await type('');
    expect(stateOf(fig).rounds).toBe(4);
  });

  it('sets the Clock’s timer to any length and its alarm’s hour and minute; not in a note that cannot be written', async () => {
    const { editor, fig, click } = widget('clock');
    click('type-h');
    await type('18');
    click('type-m');
    await type('5');
    expect(stateOf(fig).alarm).toBe('18:05');
    click('view-timer');
    click('type-timer');
    await type('600');
    expect(fig.dataset.wgTimer).toBe('600');
    expect(fig.querySelector('.wg-time').textContent).toBe('10:00:00');
    editor.dataset.readonly = 'true';
    click('type-timer');
    expect(document.querySelector('.number-menu')).toBeNull();
  });
});

describe('Auto-continue', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it('starts each next part by itself, and stops after the long break that ends the sessions', () => {
    // jsdom has no sound: the ring at each part’s end would reject unhandled.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    let now = new Date(2026, 10, 11, 10, 0, 0).getTime();
    vi.setSystemTime(now);
    const editor = document.createElement('div');
    editor.id = 'editor';
    document.body.replaceChildren(editor);
    const fig = makeWidget('pomodoro');
    Object.assign(fig.dataset, { wgFocus: '1', wgShort: '1', wgLong: '1', wgRounds: '2', wgAuto: '1' });
    editor.append(fig);
    initWidgets(editor);
    fig.querySelector('[data-k="start"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const run = widgetRuns().runs.get(fig.dataset.wgId);
    const seen = [];
    for (let n = 0; n < 6; n += 1) {
      vi.setSystemTime(now += 61000);
      widgetRuns().tick();
      seen.push(`${run.phase} ${run.round} ${run.endAt ? 'going' : 'waiting'}`);
    }
    expect(seen).toEqual(['short 1 going', 'focus 2 going', 'long 2 going', 'focus 1 waiting', 'focus 1 waiting', 'focus 1 waiting']);
    editor.remove();
  });
});

describe('the corner card’s sizes', () => {
  it('go whole, the time alone, the icon alone, and whole again', () => {
    expect(nextCardSize('full')).toBe('small');
    expect(nextCardSize('small')).toBe('icon');
    expect(nextCardSize('icon')).toBe('full');
    expect(nextCardSize('nonsense')).toBe('full');
  });
});
