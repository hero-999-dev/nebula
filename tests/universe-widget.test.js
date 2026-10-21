/**
 * The Universe widget (1.0.0) — the owner: "add Universe to the widgets — the
 * live map, added into a note". The note keeps only the widget's face; the
 * live map is laid over it in the editor and never saved; main space only,
 * never into a black hole; a double-click on a note opens it; at most three
 * live maps in a note, each stopped when its widget leaves.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WIDGETS, makeWidget, renderWidget, withoutWidgets, hasWidgets,
  setUniverse, syncUniverses, refreshUniverses, liveUniverses, UNIVERSE_MAX, liftLiveForCopy,
} from '../src/js/widgets.js';
import fs from 'node:fs';
import path from 'node:path';
import { serializeNote } from '../src/js/note-markup.js';

/** A stand-in for createGalaxyMap that records what it was given and asked. */
function fakeEngine() {
  const made = [];
  const createMap = (canvas, opts) => {
    const map = { canvas, opts, calls: [], resize() { this.calls.push('resize'); }, fit() { this.calls.push('fit'); },
      refresh() { this.calls.push('refresh'); }, destroy() { this.calls.push('destroy'); } };
    made.push(map);
    return map;
  };
  return { made, createMap };
}

describe('the Universe widget', () => {
  let editor;
  beforeEach(() => {
    document.body.innerHTML = '<div id="editor" contenteditable="true"></div>';
    editor = document.getElementById('editor');
  });
  afterEach(() => {
    editor.replaceChildren();
    syncUniverses(editor);
    setUniverse(null);
  });

  it('is in the picker, wide, with its own icon and label', () => {
    const spec = WIDGETS.find((w) => w.kind === 'universe');
    expect(spec).toMatchObject({ kind: 'universe', ic: 'universe', label: 'Universe' });
    expect(spec.ratio).toBeGreaterThan(1);        // data-ratio is width / height: a wide map
  });

  it('stores only its face — a title and drawn rings, no canvas', () => {
    const fig = makeWidget('universe');
    expect(fig.dataset.widget).toBe('universe');
    expect(fig.querySelector('.wg--universe .wg-head .wg-title').textContent).toBe('Universe');
    expect(fig.querySelector('.wg-sky svg.wg-sky-art ellipse')).toBeTruthy();
    expect(fig.querySelector('canvas')).toBe(null);
    expect(fig.outerHTML).not.toContain('<canvas');
    expect(renderWidget(fig)).toBe(false);       // drawn once, not again
  });

  it('is dropped with the other widgets from a print without widgets', () => {
    const html = `<p>a</p>${makeWidget('universe').outerHTML}<p>b</p>`;
    expect(hasWidgets(html)).toBe(true);
    expect(withoutWidgets(html)).toBe('<p>a</p><p>b</p>');
  });

  it('is live in the editor on main space, and the saved note has no canvas', () => {
    const eng = fakeEngine();
    const asked = [];
    setUniverse({ createMap: eng.createMap, getInput: (h) => { asked.push(h); return { notes: [] }; }, colors: () => ({}) });
    const fig = makeWidget('universe');
    editor.append(fig);
    syncUniverses(editor);
    expect(eng.made.length).toBe(1);
    expect(fig.querySelector('.wg-live canvas.wg-live-canvas')).toBeTruthy();
    expect(liveUniverses()).toEqual([fig]);
    eng.made[0].opts.getInput('h1');               // whatever the map asks for, main space
    expect(asked).toEqual([null]);
    const saved = serializeNote(editor);
    expect(saved).not.toContain('<canvas');
    expect(saved).not.toContain('wg-live');
    expect(saved).toContain('wg-sky-art');
    expect(editor.querySelector('canvas')).toBeTruthy();   // the editor keeps its live map
  });

  it('never goes into a black hole, and a double-click on a note opens it', async () => {
    const eng = fakeEngine();
    const opened = [];
    setUniverse({ createMap: eng.createMap, getInput: () => ({}), colors: () => ({}), openNote: (id) => opened.push(id) });
    editor.append(makeWidget('universe'));
    syncUniverses(editor);
    const { opts } = eng.made[0];
    expect(await opts.onEnterHole('h1')).toBe(false);
    opts.onContext({ role: 'note', ref: 'n1', id: 'note:n1' }, 0, 0);             // a right-click: nothing
    opts.onContext({ role: 'note', ref: 'n1', id: 'note:n1' }, 0, 0, { open: true });
    opts.onContext({ role: 'label', ref: 'work', parent: 'note:n2' }, 0, 0, { open: true });
    opts.onContext({ role: 'hole', ref: 'h1' }, 0, 0, { open: true });
    opts.onContext(null, 0, 0, { open: true });
    expect(opened).toEqual(['n1', 'n2']);
  });

  it('keeps at most three live maps in a note and stops one whose widget leaves', () => {
    const eng = fakeEngine();
    setUniverse({ createMap: eng.createMap, getInput: () => ({}), colors: () => ({}) });
    const figs = Array.from({ length: UNIVERSE_MAX + 1 }, () => makeWidget('universe'));
    editor.append(...figs);
    syncUniverses(editor);
    expect(UNIVERSE_MAX).toBe(3);
    expect(eng.made.length).toBe(3);
    expect(figs[3].querySelector('canvas')).toBe(null);   // the fourth keeps its drawn face
    figs[0].remove();
    syncUniverses(editor);
    expect(eng.made[0].calls).toContain('destroy');
    expect(liveUniverses()).not.toContain(figs[0]);
    expect(figs[3].querySelector('canvas')).toBeTruthy(); // now one of the first three
    refreshUniverses();
    expect(eng.made[1].calls).toContain('refresh');
    editor.replaceChildren();                              // another note opened in its place
    syncUniverses(editor);
    expect(liveUniverses()).toEqual([]);
  });

  it('comes back when its face is drawn again, and a press on the map does not reach the note', () => {
    const eng = fakeEngine();
    setUniverse({ createMap: eng.createMap, getInput: () => ({}), colors: () => ({}) });
    const fig = makeWidget('universe');
    editor.append(fig);
    syncUniverses(editor);
    const down = vi.fn();
    editor.addEventListener('pointerdown', down);
    fig.querySelector('canvas').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(down).not.toHaveBeenCalled();
    const face = fig.querySelector('.wg');
    face.innerHTML = face.innerHTML;               // drawn again: the old layer is gone, a dead copy came back
    syncUniverses(editor);
    expect(eng.made.length).toBe(2);
    expect(eng.made[0].calls).toContain('destroy');
    expect(fig.querySelectorAll('canvas').length).toBe(1);
  });

  it('without the map (it could not start) the widget is only its face', () => {
    editor.append(makeWidget('universe'));
    syncUniverses(editor);
    expect(editor.querySelector('canvas')).toBe(null);
  });

  it('a lock refreshes the live maps at once, with the sidebar map (Codex 34 #1)', () => {
    const eng = fakeEngine();
    setUniverse({ createMap: eng.createMap, getInput: () => ({}), colors: () => ({}) });
    editor.append(makeWidget('universe'));
    syncUniverses(editor);
    refreshUniverses();
    expect(eng.made[0].calls).toContain('refresh');      // synchronously, no timer
    const main = fs.readFileSync(path.resolve('src/js/main.js'), 'utf8');
    const onLocked = main.split(/\r?\n/).find((l) => /^\s*onLocked:/.test(l)) || '';
    expect(onLocked).toContain('galaxy?.refresh()');
    expect(onLocked).toContain('refreshUniverses()');
    expect(onLocked).not.toMatch(/setTimeout\([^)]*refreshUniverses/);
  });

  it('a copy takes the face, never the live map, and the map goes on (Codex 34 #3)', () => {
    vi.useFakeTimers();
    try {
      const eng = fakeEngine();
      setUniverse({ createMap: eng.createMap, getInput: () => ({}), colors: () => ({}) });
      const picked = makeWidget('universe');
      const other = makeWidget('universe');
      editor.append(picked, other);
      syncUniverses(editor);
      const layer = picked.querySelector('.wg-live');
      picked.classList.add('sel');
      window.dispatchEvent(new Event('copy'));             // what every copy of the note passes first
      expect(picked.querySelector('.wg-live, canvas')).toBe(null);
      expect(picked.outerHTML).toContain('wg-sky-art');
      expect(other.querySelector('.wg-live canvas')).toBeTruthy();   // not in the copy: untouched
      vi.runAllTimers();
      expect(picked.querySelector('.wg-live')).toBe(layer);           // the same layer, back
      syncUniverses(editor);
      expect(eng.made.length).toBe(2);                                // no map restarted
      expect(eng.made[0].calls).not.toContain('destroy');
      // A selection running over a Universe lifts it too.
      picked.classList.remove('sel');
      const range = document.createRange();
      range.selectNode(other);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      expect(liftLiveForCopy(editor).count).toBe(1);
      expect(range.cloneContents().querySelector('canvas, .wg-live')).toBe(null);
      vi.runAllTimers();
      expect(other.querySelector('.wg-live canvas')).toBeTruthy();
      getSelection().removeAllRanges();
    } finally { vi.useRealTimers(); }
  });

  it('prints its drawn face in both print modes (Codex 34 #2)', () => {
    const css = fs.readFileSync(path.resolve('src/css/editor.css'), 'utf8');
    const prints = css.split('@media print').slice(1).map((b) => b.slice(0, b.search(/\r?\n\}/)));
    expect(prints.some((b) => /\.note-widget \.wg-live \{ display: none !important; \}/.test(b) && !/print-no-widgets[^{]*\.wg-live/.test(b))).toBe(true);
  });
});
