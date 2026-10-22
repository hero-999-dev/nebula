/**
 * 1.0.1 — the owner's "Ideas For Nebula and Testing For Nebula" note: the
 * German dash, a placeholder that follows the language back to English,
 * twinkling stars, and a divider that cuts only its part of a column. The
 * clicking is in tests/e2e/v101.mjs.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { dashFor, arrowFor } from '../src/js/auto-arrows.js';
import { setLang, translateTree } from '../src/js/i18n.js';
import { twinkle, TWINKLE } from '../src/js/galaxy-ascii.js';
import { splitPart, healColumns, MIN_COL } from '../src/js/columns.js';

describe('the German dash', () => {
  it('turns a standalone -- and a space into a dash, only in German', () => {
    expect(dashFor('Berlin -- ', 'de')).toEqual({ cut: 2, put: '–', back: 1 });
    expect(dashFor('-- ', 'de')).toEqual({ cut: 2, put: '–', back: 1 });
    expect(dashFor('Berlin -- ', 'en')).toBeNull();
    expect(dashFor('Berlin -- ', 'tr')).toBeNull();
  });

  it('leaves arrows, rules and words with dashes alone', () => {
    expect(dashFor('a---- ', 'de')).toBeNull();
    expect(dashFor('x-- ', 'de')).toBeNull();
    expect(dashFor('a --', 'de')).toBeNull();          // no space typed yet
    expect(arrowFor('a -->')).not.toBeNull();          // the arrow still comes
  });
});

describe('a translated text, back to English', () => {
  afterEach(() => setLang('en'));

  it('a placeholder written in Turkish becomes English again (the owner, 1.0.1)', () => {
    setLang('tr');
    const input = document.createElement('input');
    input.placeholder = 'Etiketler ve bahsetmeler…';   // set with t() while the app was in Turkish
    const p = document.createElement('p');
    p.textContent = ' Etiketler ve bahsetmeler… ';
    document.body.replaceChildren(input, p);
    setLang('en');
    translateTree(document.body);
    expect(input.placeholder).toBe('Labels and mentions…');
    expect(p.textContent).toBe(' Labels and mentions… ');
  });

  it('leaves words that are no translation as they are', () => {
    setLang('en');
    const p = document.createElement('p');
    p.textContent = 'my own words';
    document.body.replaceChildren(p);
    translateTree(document.body);
    expect(p.textContent).toBe('my own words');
  });
});

describe('twinkling stars', () => {
  it('a star changes its letter and glow over time, from the twinkle row', () => {
    const star = { alpha: 0.6, depth: 0.5, phase: 1 };
    const seen = new Set();
    for (let s = 0; s < 20; s += 0.25) {
      const { ch, glow } = twinkle(star, s);
      expect(TWINKLE).toContain(ch);
      expect(glow).toBeGreaterThanOrEqual(0);
      expect(glow).toBeLessThanOrEqual(star.alpha);
      seen.add(ch);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('a divider cuts its part of a column (the owner, 1.0.1)', () => {
  it('the part gets a row of its own; above and under keep the columns as they were', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;">'
      + '<div class="blk-col" id="L"><p id="top">top</p><hr class="blk-hr" id="h1"><hr class="blk-hr" id="h2"><p id="t">text</p><p id="t2">more</p><hr class="blk-hr" id="h3"><p id="foot">foot</p></div>'
      + '<hr class="blk-vr"><div class="blk-col" id="R"><p>right</p></div></div>';
    document.body.replaceChildren(root);
    const col = root.querySelector('#L');
    const made = splitPart(col, [root.querySelector('#t'), root.querySelector('#t2')], 20, root.querySelector('#h2'), MIN_COL, 'right');
    expect(made).not.toBeNull();
    const rows = [...root.children];
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.classList.contains('blk-cols'))).toBe(true);
    expect(rows[0].querySelector('#top')).not.toBeNull();
    expect(rows[0].querySelector('#h1')).not.toBeNull();
    expect(root.querySelector('#h2')).toBeNull();                  // the dragged divider is the upright one now
    expect(rows[1].querySelectorAll(':scope > .blk-col').length).toBe(3);
    expect(rows[1].querySelector('#t').parentElement).toBe(rows[1].querySelector('#t2').parentElement);
    expect(rows[2].querySelector('#foot')).not.toBeNull();
    expect(rows[2].querySelectorAll(':scope > .blk-col').length).toBe(2);
    expect(healColumns(root)).toBe(0);
  });
});
