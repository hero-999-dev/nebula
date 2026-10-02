/**
 * Page zoom (0.9.3) — the owner: "a zoom ratio for the pages, beside the
 * alignment". Zoomed with CSS `zoom`; a drag divides the pointer's travel by it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ZOOM_STEPS, clampZoom, stepZoom, editorZoom, applyZoom, realScaleFor, setRealScale, setWindowZoom, getRealScale, zoomFactor, normalizeZoom, fitFor, setFitScale, setRealBased, FIT } from '../src/js/page-zoom.js';
import { NoteStore } from '../src/js/notes.js';

describe('page zoom', () => {
  it('offers 50 % to 200 %, and keeps to its steps', () => {
    expect(ZOOM_STEPS[0]).toBe(50);
    expect(ZOOM_STEPS.at(-1)).toBe(200);
    expect(clampZoom(130)).toBe(125);
    expect(clampZoom('nonsense')).toBe(100);
    expect(stepZoom(100, +1)).toBe(110);
    expect(stepZoom(100, -1)).toBe(90);
    expect(stepZoom(200, +1)).toBe(200);
    expect(stepZoom(50, -1)).toBe(50);
  });

  it('zooms the editor, and tells a drag how much a screen pixel is on the page', () => {
    const ed = document.createElement('div');
    ed.id = 'editor';
    const shape = document.createElement('div');
    ed.append(shape);
    document.body.append(ed);
    expect(editorZoom(shape)).toBe(1);
    applyZoom(ed, 150);
    expect(ed.style.zoom).toBe('1.5');
    expect(editorZoom(shape)).toBe(1.5);
    applyZoom(ed, 100);
    expect(ed.style.zoom).toBe('');
    expect(editorZoom(ed)).toBe(1);
    ed.remove();
  });
});

describe('actual size (0.9.3)', () => {
  it('a centimetre on the paper is a centimetre on the screen', () => {
    // The owner's 14-inch screen: 1920 px across 31 cm at 100 % scaling.
    expect(realScaleFor(1920, 1080, [{ w: 31, h: 17 }])).toBe(1.639);
    // Windows' scaling falls out: 1536 DIP across the same 31 cm at 125 %.
    expect(realScaleFor(1536, 864, [{ w: 31, h: 17 }])).toBe(1.311);
    // Two monitors: the one shaped like this screen.
    expect(realScaleFor(1920, 1080, [{ w: 34, h: 27 }, { w: 53, h: 30 }])).toBe(0.958);
    // Nothing usable, or an answer no screen gives: 100 %.
    expect(realScaleFor(1920, 1080, [])).toBe(1);
    expect(realScaleFor(1920, 1080, [{ w: 0, h: 0 }])).toBe(1);
    expect(realScaleFor(1920, 1080, [{ w: 6, h: 4 }])).toBe(1);
  });

  it('is 100 % (the owner: "the real-size scale should be 100 %"), every step a share of it', () => {
    setRealScale(1.644);                 // 1920 px across the owner's 309 mm
    expect(zoomFactor(100)).toBe(1.644);
    expect(zoomFactor(50)).toBe(0.822);
    const ed = document.createElement('div');
    expect(applyZoom(ed, 100)).toBe(100);
    expect(ed.style.zoom).toBe('1.644');
    // Before, actual size was a value of its own: it reads as 100 now.
    expect(normalizeZoom('actual')).toBe(100);
    // Ctrl + on the whole window: real size takes it back out.
    setWindowZoom(1.2);
    expect(getRealScale()).toBe(1.37);
    setWindowZoom(NaN);
    expect(getRealScale()).toBe(1.644);
    // NW and NN: 100 % is the screen's own size, the old way.
    setRealBased(false);
    expect(zoomFactor(100)).toBe(1);
    expect(zoomFactor(150)).toBe(1.5);
    setRealBased(true);
    setRealScale(NaN);
    expect(zoomFactor(100)).toBe(1);
  });

  it('fit to page makes the whole sheet as wide as the frame, and − / + step past it', () => {
    setRealScale(1.644);
    // A4's 794 px sheet, 12px a side and a 10px scroll bar, in a 700 px frame.
    expect(fitFor(700, 794, 10)).toBe(0.845);
    // Half the screen or the whole: measured again, never squeezed to nothing.
    expect(fitFor(1600, 1123)).toBe(1.394);
    expect(fitFor(0, 794)).toBe(1);
    setFitScale(0.833);                  // 51 % of the real size
    expect(zoomFactor(FIT)).toBe(0.833);
    expect(stepZoom(FIT, +1)).toBe(67);
    expect(stepZoom(FIT, -1)).toBe(50);
    expect(normalizeZoom(FIT)).toBe(FIT);
    setRealScale(NaN);
  });
});

describe('the zoom is a setting of the note', () => {
  beforeEach(() => localStorage.clear());

  it('kept without dating the note; the page\'s own default stores nothing', () => {
    localStorage.setItem('nebula:notes', JSON.stringify([{ id: 'a', title: 'a', content: '', updatedAt: 5 }]));
    const store = new NoteStore({ allowSeed: false });
    store.setZoom('a', 150);
    expect(store.get('a').zoom).toBe(150);
    expect(store.get('a').updatedAt).toBe(5);
    store.setZoom('a', 'fit');
    expect(store.get('a').zoom).toBe('fit');
    store.setZoom('a', null);           // back to the page's own default
    expect('zoom' in store.get('a')).toBe(false);
  });
});
