/**
 * A note's page width (0.9.3) — the owner: "page modes, A4, A3, A5, B4, B5,
 * B3 by the standards, the page width set by them and the caret with it; the
 * mode we have is Nebula Wide (NW), and a narrower Nebula Narrow (NN)".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PAGE_MODES, columnPx, paperSize, pageMode, pageTitle, applyPageMode, pageBreakPx, opensFitted, sheetPx, isFluid, usesRealSize, setWideOrientation, sheetMm } from '../src/js/page-mode.js';
import { paperLine, restoreWideOrientation } from '../src/js/pdf-preview.js';
import { NoteStore } from '../src/js/notes.js';
import { toPrintDocument } from '../src/js/export.js';

describe('page modes', () => {
  it('are the eight boxes, Nebula\'s own first in each row', () => {
    expect(PAGE_MODES.map((m) => m.short)).toEqual(['NW', 'A3', 'A4', 'A5', 'NN', 'B3', 'B4', 'B5']);
  });

  it('a paper\'s line is its printed line: the ISO width less 12.7 mm a side', () => {
    expect(columnPx('a4')).toBe(698);      // 184.6 mm
    expect(columnPx('a5')).toBe(463);
    expect(columnPx('a3')).toBe(1027);
    expect(columnPx('b4')).toBe(849);
    expect(columnPx('b5')).toBe(569);
    expect(columnPx('b3')).toBe(1238);
    expect(columnPx('nn')).toBe(746);      // A4 less 6.35 mm a side: written close to its edges
    expect(columnPx('nw')).toBe(1027);     // A4 turned sideways (the owner, 0.9.3)
  });

  it('prints on that paper; Nebula\'s own print on A4', () => {
    expect(paperSize('b5')).toBe('176mm 250mm');
    expect(paperSize('nw')).toBe('297mm 210mm');
    expect(paperSize('nn')).toBe('210mm 297mm');
    // A very thin line where the export starts a new page: the sheet's height less the margins.
    expect(pageBreakPx('nw')).toBe(698);
    expect(pageBreakPx('a4')).toBe(1027);
    expect(pageBreakPx('nn')).toBe(1075);
    expect(pageTitle('nw')).toBe('Nebula Wide — as wide as the window; exported on A4, across or upright');
    // A4 and the smaller papers open at their real size; the wider ones fitted to the window.
    expect(['a4', 'a5', 'b5', 'a3', 'b4', 'b3', 'nw', 'nn'].filter(opensFitted)).toEqual(['a3', 'b4', 'b3']);
    // NW and NN are the old way: the screen's own size; NW has no paper on screen.
    expect(PAGE_MODES.map((m) => m.id).filter(usesRealSize)).toEqual(['a3', 'a4', 'a5', 'b3', 'b4', 'b5']);
    expect(PAGE_MODES.map((m) => m.id).filter(isFluid)).toEqual(['nw']);
    expect(sheetPx('a4')).toBe(794);
    expect(sheetPx('nw')).toBe(1123);
    expect(pageMode('nonsense').id).toBe('nw');
    expect(pageTitle('a4')).toBe('A4 page — 210 × 297 mm');
    expect(toPrintDocument({ body: '<p>x</p>', size: '148mm 210mm' })).toContain('@page { size: 148mm 210mm;');
    expect(toPrintDocument({ body: '<p>x</p>', size: 'evil; } body { x' })).toContain('@page { size: A4;');
    // NN prints with its narrow margins; an injected margin is refused.
    expect(toPrintDocument({ body: '<p>x</p>', size: '210mm 297mm', margin: '6.35mm' })).toContain('margin: 6.35mm;');
    expect(toPrintDocument({ body: '<p>x</p>', margin: '0; } body { x' })).toContain('margin: 12.7mm;');
  });

  it('sets the column on the editor and the sheet for printing', () => {
    const ed = document.createElement('div');
    applyPageMode(ed, 'a5');
    expect(ed.dataset.page).toBe('a5');
    expect(ed.style.getPropertyValue('--page-col')).toBe('463px');
    expect(document.getElementById('page-print-size').textContent).toContain('148mm 210mm');
    expect(ed.style.getPropertyValue('--page-break')).toBe('698px');   // 210 mm less the margins
    expect('paper' in ed.dataset).toBe(true);
    // Nebula Wide: no paper on screen; exported on A4 across, or upright when chosen.
    applyPageMode(ed, 'nw');
    expect('paper' in ed.dataset).toBe(false);
    expect(document.getElementById('page-print-size').textContent).toContain('297mm 210mm');
    setWideOrientation('portrait');
    expect(sheetMm('nw')).toEqual([210, 297]);
    expect(paperSize('nw')).toBe('210mm 297mm');
    expect(sheetMm('a3')).toEqual([297, 420]);          // a paper keeps its own way up
    setWideOrientation('nonsense');
    expect(paperSize('nw')).toBe('297mm 210mm');
  });

  it('the export preview says the sheet, and remembers how Nebula Wide was turned', () => {
    expect(paperLine('a4')).toBe('A4 · 210 × 297 mm · 12.7 mm margins');
    expect(paperLine('nn')).toBe('A4 · 210 × 297 mm · 6.35 mm margins');
    expect(paperLine('nw')).toBe('A4 · 297 × 210 mm · 12.7 mm margins');
    localStorage.setItem('nebula:nw-orientation', 'portrait');
    expect(restoreWideOrientation()).toBe('portrait');
    expect(paperLine('nw')).toBe('A4 · 210 × 297 mm · 12.7 mm margins');
    localStorage.removeItem('nebula:nw-orientation');
    expect(restoreWideOrientation()).toBe('landscape');
  });
});

describe('the page is a setting of the note', () => {
  beforeEach(() => localStorage.clear());

  it('kept on the note without dating it; Nebula Wide is no value at all', () => {
    localStorage.setItem('nebula:notes', JSON.stringify([{ id: 'a', title: 'a', content: '', updatedAt: 5 }]));
    const store = new NoteStore({ allowSeed: false });
    store.setPage('a', 'a4');
    expect(store.get('a').page).toBe('a4');
    expect(store.get('a').updatedAt).toBe(5);
    store.setPage('a', 'nw');
    expect('page' in store.get('a')).toBe(false);
  });
});
