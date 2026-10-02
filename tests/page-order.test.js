/**
 * Auto order page (0.9.3) — the owner: a button beside the page zoom that puts
 * right what runs over, by hand, on every page but NW; and in a note's ⋯ menu,
 * on by itself. What a page line falls across goes below it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { lineAcross, placeBelow, orderPage, ORDER_GAP } from '../src/js/page-order.js';
import { NoteStore } from '../src/js/notes.js';

describe('auto order page', () => {
  // A4: a page every 1027 px from where the writing starts (16), a 58 px title on page one.
  const origin = 16 - 58;
  const page = 1027;

  it('finds the page line a box straddles, and only that', () => {
    expect(lineAcross(900, 1000, origin, page)).toBe(985);
    expect(lineAcross(100, 900, origin, page)).toBeNull();
    expect(lineAcross(990, 1100, origin, page)).toBeNull();      // already below the line
    expect(lineAcross(1900, 2100, origin, page)).toBe(2012);     // the second line
    expect(lineAcross(10, 20, origin, 0)).toBeNull();
  });

  it('moves a box to just under the line; one taller than a page stays', () => {
    expect(placeBelow(900, 100, origin, page)).toBe(985 + ORDER_GAP);
    expect(placeBelow(100, 200, origin, page)).toBeNull();
    expect(placeBelow(500, 1100, origin, page)).toBeNull();
  });

  it('does nothing on Nebula Wide (no paper)', () => {
    const ed = document.createElement('div');
    ed.innerHTML = '<div class="shape-layer"><div class="shape" style="top:900px"></div></div>';
    expect(orderPage(ed)).toBe(0);
    expect(ed.querySelector('.shape').style.top).toBe('900px');
  });
});

describe('turned on for a note', () => {
  beforeEach(() => localStorage.clear());
  it('is a setting of the note, not an edit', () => {
    localStorage.setItem('nebula:notes', JSON.stringify([{ id: 'a', title: 'a', content: '', updatedAt: 5, page: 'a4' }]));
    const store = new NoteStore({ allowSeed: false });
    store.toggleAutoOrder('a');
    expect(store.get('a').autoOrder).toBe(true);
    expect(store.get('a').updatedAt).toBe(5);
    store.toggleAutoOrder('a');
    expect(store.get('a').autoOrder).toBe(false);
  });
});
