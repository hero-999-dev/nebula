// @vitest-environment jsdom
/**
 * Designs (1.0.4). The owner: "theme organizer üstünde design olsun —
 * biri Nebula'nın kendisi, biri medieval, bir de piksel, bir de neon. Pikselde
 * dünyalar kare küpler olsun, cyber'de neon parlasın dünyalar, medieval'da disk
 * şeklinde olsun hepsi."
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DESIGNS, DESIGN_FACES, designStack, cleanDesign, wearStoredDesign, currentDesign, initDesign } from '../src/js/design.js';
import { on } from '../src/js/bus.js';
import { RAMP, cube, disk, wire, enso, gem, gear, cellsByShade } from '../src/js/galaxy-ascii.js';
import { createGalaxyMap, neonOf } from '../src/js/galaxy-map.js';
import { STRINGS, t } from '../src/js/i18n.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => resolve(here, '..', 'src', p);
const KEY = 'nebula:design';

const picker = () => {
  const group = document.createElement('div');
  for (const id of DESIGNS) {
    const b = document.createElement('button');
    b.dataset.design = id;
    group.append(b);
  }
  document.body.append(group);
  return group;
};
const pressed = (group) => [...group.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.design);

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.design;
  document.body.innerHTML = '';
});

describe('design.js', () => {
  it('has the eight designs, Nebula\'s own first', () => {
    expect(DESIGNS).toEqual(['nebula', 'medieval', 'pixel', 'neon', 'blueprint', 'ink', 'deco', 'clockwork']);
  });

  it('anything that is not a design is Nebula\'s own', () => {
    expect(cleanDesign('pixel')).toBe('pixel');
    for (const v of [null, undefined, '', 'Pixel', 'gothic', 3, {}, 'constructor', 'toString']) expect(cleanDesign(v)).toBe('nebula');
  });

  // The owner: "clockwork ile steampunk birleşsin".
  it('Steampunk is Clockwork now: a choice kept from before is worn as Clockwork', () => {
    expect(cleanDesign('steampunk')).toBe('clockwork');
    localStorage.setItem(KEY, 'steampunk');
    wearStoredDesign();
    expect(document.documentElement.dataset.design).toBe('clockwork');
    const group = picker();
    const design = initDesign(group);
    expect(design.current()).toBe('clockwork');
    expect(pressed(group)).toEqual(['clockwork']);
    expect(group.querySelector('[data-design="steampunk"]')).toBeNull();
  });

  it('wears nothing for Nebula\'s own look: no attribute, so no design rule can touch it', () => {
    wearStoredDesign();
    expect(document.documentElement.hasAttribute('data-design')).toBe(false);
    expect(currentDesign()).toBe('nebula');
  });

  it('wears the remembered design before the app starts', () => {
    localStorage.setItem(KEY, 'medieval');
    wearStoredDesign();
    expect(document.documentElement.dataset.design).toBe('medieval');
    expect(currentDesign()).toBe('medieval');
  });

  it('a stored value that is no design is not worn', () => {
    localStorage.setItem(KEY, 'gothic');
    wearStoredDesign();
    expect(document.documentElement.hasAttribute('data-design')).toBe(false);
  });

  it('a press wears, marks, keeps and tells', () => {
    const group = picker();
    const heard = [];
    const off = on('design-changed', (d) => heard.push(d.design));
    const design = initDesign(group);
    expect(pressed(group)).toEqual(['nebula']);

    group.querySelector('[data-design="pixel"]').click();
    expect(document.documentElement.dataset.design).toBe('pixel');
    expect(design.current()).toBe('pixel');
    expect(pressed(group)).toEqual(['pixel']);
    expect(group.querySelector('[data-design="pixel"]').classList.contains('on')).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('pixel');
    expect(heard).toEqual(['pixel']);

    group.querySelector('[data-design="pixel"]').click();      // the same again: nothing to tell
    expect(heard).toEqual(['pixel']);

    group.querySelector('[data-design="nebula"]').click();     // back to Nebula's own: the attribute goes
    expect(document.documentElement.hasAttribute('data-design')).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('nebula');
    expect(heard).toEqual(['pixel', 'nebula']);
    if (typeof off === 'function') off();
  });

  it('set() takes a design and nothing else', () => {
    const design = initDesign(picker());
    design.set('neon');
    expect(design.current()).toBe('neon');
    design.set('gothic');
    expect(design.current()).toBe('neon');
    expect(document.documentElement.dataset.design).toBe('neon');
    design.set('steampunk');                                   // no longer one to choose
    expect(document.documentElement.dataset.design).toBe('neon');
    design.set('clockwork');
    expect(document.documentElement.dataset.design).toBe('clockwork');
  });

  it('starts as it was left', () => {
    localStorage.setItem(KEY, 'neon');
    const group = picker();
    const design = initDesign(group);
    expect(design.current()).toBe('neon');
    expect(pressed(group)).toEqual(['neon']);
    expect(document.documentElement.dataset.design).toBe('neon');
  });

  it('works with no picker at all', () => {
    const design = initDesign(null);
    design.set('medieval');
    expect(currentDesign()).toBe('medieval');
  });
});

describe('the worlds of a design (galaxy-ascii)', () => {
  const ink = (rows) => rows.join('').replace(/ /g, '').length;
  const allRamp = (rows) => rows.every((r) => [...r].every((ch) => ch === ' ' || RAMP.includes(ch)));
  const size = (rows, cols, n) => rows.length === n && rows.every((r) => r.length === cols);

  describe('cube — Pixel', () => {
    it('fills the grid asked for with ramp glyphs', () => {
      const rows = cube({ cols: 16, rows: 16, spin: 0.6, seed: 3, aspect: 1 });
      expect(size(rows, 16, 16)).toBe(true);
      expect(allRamp(rows)).toBe(true);
      expect(ink(rows)).toBeGreaterThan(60);
    });

    it('is the same for the same seed and turn, another for another', () => {
      const a = cube({ cols: 20, rows: 20, spin: 1, seed: 5, aspect: 1 });
      expect(cube({ cols: 20, rows: 20, spin: 1, seed: 5, aspect: 1 })).toEqual(a);
      expect(cube({ cols: 20, rows: 20, spin: 1, seed: 6, aspect: 1 })).not.toEqual(a);
      expect(cube({ cols: 20, rows: 20, spin: 1.6, seed: 5, aspect: 1 })).not.toEqual(a);
    });

    it('is a block, not a ball: edge on it is narrower than corner on', () => {
      const width = (rows) => Math.max(...rows.map((r) => r.trimEnd().length - (r.length - r.trimStart().length)));
      const flat = cube({ cols: 40, rows: 40, spin: 0, seed: 1, aspect: 1 });
      const corner = cube({ cols: 40, rows: 40, spin: Math.PI / 4, seed: 1, aspect: 1 });
      expect(width(corner)).toBeGreaterThan(width(flat) * 1.25);
    });

    it('shows its top: the brightest face is the upper one', () => {
      const rows = cube({ cols: 40, rows: 40, spin: 0.5, seed: 2, aspect: 1 });
      const mean = (list) => list.join('').replace(/ /g, '').split('').reduce((s, ch) => s + RAMP.indexOf(ch), 0) / Math.max(1, ink(list));
      const first = rows.findIndex((r) => r.trim());
      const last = rows.length - 1 - [...rows].reverse().findIndex((r) => r.trim());
      expect(mean(rows.slice(first, first + 5))).toBeGreaterThan(mean(rows.slice(last - 4, last + 1)));
    });

    it('stays inside its grid at every turn', () => {
      for (let i = 0; i < 48; i++) {
        const rows = cube({ cols: 24, rows: 24, spin: (i / 48) * Math.PI * 2, seed: 4, aspect: 1 });
        expect(rows[0].trim()).toBe('');
        expect(rows.every((r) => r[0] === ' ' && r.at(-1) === ' ')).toBe(true);
      }
    });

    it('a burning cube is brighter, and flickers with t', () => {
      const lit = (rows) => rows.join('').replace(/ /g, '').split('').reduce((s, ch) => s + RAMP.indexOf(ch), 0) / ink(rows);
      const world = cube({ cols: 24, rows: 24, spin: 0.4, seed: 2, aspect: 1 });
      const star = cube({ cols: 24, rows: 24, spin: 0.4, seed: 2, aspect: 1, sun: true, t: 0 });
      expect(lit(star)).toBeGreaterThan(lit(world));
      expect(cube({ cols: 24, rows: 24, spin: 0.4, seed: 2, aspect: 1, sun: true, t: 3 })).not.toEqual(star);
    });

    it('takes a seed in words and the smallest grid there is', () => {
      expect(allRamp(cube({ cols: 1, rows: 1, spin: 0, seed: 'note' }))).toBe(true);
    });
  });

  describe('disk — Medieval', () => {
    it('fills the grid asked for with ramp glyphs', () => {
      const rows = disk({ cols: 40, rows: 20, spin: 0.3, seed: 2 });
      expect(size(rows, 40, 20)).toBe(true);
      expect(allRamp(rows)).toBe(true);
    });

    it('is flat: far wider than it is tall', () => {
      const rows = disk({ cols: 16, rows: 8, spin: 0, seed: 1 });   // too small for the dome: the plate alone
      const tall = rows.filter((r) => r.trim()).length;
      const wide = Math.max(...rows.map((r) => r.trim().length));
      expect(wide * 0.5).toBeGreaterThan(tall * 1.4);               // a cell is half as wide as it is tall
    });

    it('wheels round with spin, and is the same for the same turn', () => {
      const a = disk({ cols: 40, rows: 20, spin: 0, seed: 3 });
      expect(disk({ cols: 40, rows: 20, spin: 0, seed: 3 })).toEqual(a);
      expect(disk({ cols: 40, rows: 20, spin: 1.2, seed: 3 })).not.toEqual(a);
      expect(disk({ cols: 40, rows: 20, spin: 0, seed: 4 })).not.toEqual(a);
    });

    it('carries the firmament only when it is big enough', () => {
      // Under a dome the first row with ink is the dome's thin line and nothing else.
      const top = (rows) => [...new Set(rows.find((r) => r.trim()).replace(/ /g, ''))].join('');
      expect(top(disk({ cols: 60, rows: 30, spin: 0, seed: 1 }))).toBe(RAMP[2]);
      expect(top(disk({ cols: 24, rows: 12, spin: 0, seed: 1 }))).toBe(RAMP[2]);
      expect(top(disk({ cols: 16, rows: 8, spin: 0, seed: 1 }))).not.toBe(RAMP[2]);
    });

    it('is a coin at any size: three rows of plate at the least, the rim under them, the same on both sides', () => {
      for (const [cols, rows] of [[10, 5], [12, 6], [14, 7], [16, 8]]) {
        const art = disk({ cols, rows, spin: 0.4, seed: 2 });
        const inked = art.filter((r) => r.trim());
        expect(inked.length, `${cols}x${rows}`).toBeGreaterThanOrEqual(4);
        const widths = inked.map((r) => r.trim().length);
        const widest = Math.max(...widths);
        // The far edge is a row of the plate, not a sliver over it.
        expect(widths[0], `${cols}x${rows}`).toBeGreaterThanOrEqual(widest * 0.6);
        expect(widths[widths.length - 1], `${cols}x${rows}`).toBeGreaterThanOrEqual(widest * 0.5);
        for (const r of inked) expect(r.search(/\S/) + r.trimEnd().length - 1, `${cols}x${rows}`).toBe(cols - 1);
      }
    });

    it('a burning disk has no dome and throws flames that move with t', () => {
      const a = disk({ cols: 40, rows: 20, spin: 0, seed: 2, sun: true, t: 0 });
      expect(allRamp(a)).toBe(true);
      expect(disk({ cols: 40, rows: 20, spin: 0, seed: 2, sun: true, t: 4 })).not.toEqual(a);
      expect(a).not.toEqual(disk({ cols: 40, rows: 20, spin: 0, seed: 2 }));
    });
  });

  // The five that came after (the owner: "bu konuştuğumuz 5'ini de yap"): a wire globe for Blueprint,
  // a brush's ring for Ink, a cut stone for Art Deco, a fine wheel for Clockwork and a heavy one for Steampunk —
  // which is part of Clockwork now, under Clockwork's wheels; the heavy wheel is still drawn when asked for.
  describe('wire, enso, gem, gear', () => {
    const arts = { wire, enso, gem, gear, cog: (args) => gear({ ...args, heavy: true }) };
    for (const [name, art] of Object.entries(arts)) {
      it(`${name}: fills the grid asked for with ramp glyphs, and is the same for the same seed and turn`, () => {
        const a = art({ cols: 40, rows: 20, spin: 0.3, seed: 2 });
        expect(size(a, 40, 20)).toBe(true);
        expect(allRamp(a)).toBe(true);
        expect(ink(a)).toBeGreaterThan(20);
        expect(art({ cols: 40, rows: 20, spin: 0.3, seed: 2 })).toEqual(a);
        expect(art({ cols: 40, rows: 20, spin: 1.5, seed: 2 })).not.toEqual(a);
      });

      it(`${name}: burning it moves with t, and the smallest grid there is is taken`, () => {
        const a = art({ cols: 40, rows: 20, spin: 0, seed: 2, sun: true, t: 0 });
        expect(size(a, 40, 20)).toBe(true);
        expect(allRamp(a)).toBe(true);
        expect(art({ cols: 40, rows: 20, spin: 0, seed: 2, sun: true, t: 4 })).not.toEqual(a);
        expect(a).not.toEqual(art({ cols: 40, rows: 20, spin: 0, seed: 2 }));
        expect(allRamp(art({ cols: 1, rows: 1, spin: 0, seed: 'note' }))).toBe(true);
      });

      it(`${name}: stays inside its grid at every turn`, () => {
        for (let i = 0; i < 24; i++) {
          const rows = art({ cols: 30, rows: 15, spin: (i / 24) * Math.PI * 2, seed: 4 });
          expect(size(rows, 30, 15), String(i)).toBe(true);
        }
      });
    }

    it('a wire globe is lines with the sky between them; an enso is open in the middle', () => {
      const globe = wire({ cols: 40, rows: 20, spin: 0.3, seed: 2 });
      const ball = disk({ cols: 40, rows: 20, spin: 0.3, seed: 2, bare: true });
      const middle = (rows) => rows[10].slice(12, 28);
      expect(middle(globe)).toContain(' ');
      expect(middle(ball)).not.toContain(' ');
      expect(middle(enso({ cols: 40, rows: 20, spin: 0.3, seed: 2 })).trim().length).toBeLessThan(8);
    });

    it('the heavy wheel has more iron than Clockwork\'s fine one', () => {
      const fine = gear({ cols: 40, rows: 20, spin: 0.3, seed: 2 });
      const heavy = gear({ cols: 40, rows: 20, spin: 0.3, seed: 2, heavy: true });
      expect(heavy).not.toEqual(fine);
      expect(ink(heavy)).toBeGreaterThan(ink(fine));
    });

    it('bare is the body alone: nothing in it that the whole drawing has not', () => {
      const within = (bare, full) => bare.every((row, y) => [...row].every((ch, x) => ch === ' ' || full[y][x] !== ' '));
      for (const [cols, rows] of [[40, 20], [60, 30], [16, 8]]) {
        for (const art of [disk, gear, arts.cog]) {
          const full = art({ cols, rows, spin: 0.7, seed: 3 });
          const bare = art({ cols, rows, spin: 0.7, seed: 3, bare: true });
          expect(size(bare, cols, rows)).toBe(true);
          expect(ink(bare)).toBeGreaterThan(0);
          expect(within(bare, full), `${cols}x${rows}`).toBe(true);
        }
      }
      // A disk big enough for its firmament: bare, the dome is not there.
      expect(ink(disk({ cols: 60, rows: 30, spin: 0, seed: 1, bare: true }))).toBeLessThan(ink(disk({ cols: 60, rows: 30, spin: 0, seed: 1 })));
    });
  });

  describe('cellsByShade', () => {
    it('lists every inked cell once, under its own step', () => {
      const rows = ['. @', ' #.'];
      const cells = cellsByShade(rows);
      expect(cells).toHaveLength(RAMP.length);
      expect(cells[RAMP.indexOf('.')]).toEqual([0, 0, 2, 1]);
      expect(cells[RAMP.indexOf('@')]).toEqual([2, 0]);
      expect(cells[RAMP.indexOf('#')]).toEqual([1, 1]);
      expect(cells.reduce((n, list) => n + list.length / 2, 0)).toBe(4);
    });

    it('counts what a cube has', () => {
      const rows = cube({ cols: 16, rows: 16, spin: 0.7, seed: 1, aspect: 1 });
      expect(cellsByShade(rows).reduce((n, list) => n + list.length / 2, 0)).toBe(ink(rows));
    });
  });
});

describe('the map under a design (galaxy-map)', () => {
  let clock = 0;
  let queue = [];
  const stubCanvas = (calls) => {
    const ctx = new Proxy(
      { measureText: () => ({ width: 8 }) },
      { get: (target, k) => (k in target ? target[k] : (...args) => { calls?.push([k, ...args]); }), set: (target, k, v) => { calls?.push(['=' + String(k), v]); return true; } }
    );
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { get: () => 800 });
    Object.defineProperty(canvas, 'clientHeight', { get: () => 600 });
    canvas.getContext = () => ctx;
    return canvas;
  };
  const COLORS = () => ({ ink: '#fff', faint: '#999', accent: '#09f', fern: '#7c9', madder: '#c96', paper: '#111' });
  const input = () => ({
    notes: [{ id: 'n1', title: 'A', folder: 'f1' }],
    folders: [{ id: 'f1', name: 'F', project: 'j1' }],
    projects: [{ id: 'j1', name: 'J' }],
    holes: [],
  });
  const step = (ms = 70) => {
    clock += ms;
    const pending = queue;
    queue = [];
    for (const f of pending) f(clock);
  };
  const kinds = (map) => [...new Set(map.frames().map((k) => k.split('|')[0]))].sort();

  beforeEach(() => {
    clock = 0;
    queue = [];
    vi.stubGlobal('requestAnimationFrame', (fn) => { queue.push(fn); return queue.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('performance', { now: () => clock });
  });
  afterEach(() => vi.unstubAllGlobals());

  const run = (look, calls) => {
    const map = createGalaxyMap(stubCanvas(calls), { getInput: input, colors: COLORS, design: () => look.now });
    step(70);
    map.focus('project:j1');
    for (let i = 0; i < 30; i++) step(70);
    return map;
  };

  it('Nebula\'s own look keeps the frames and the keys it always had', () => {
    const map = run({ now: 'nebula' });
    expect(kinds(map)).toContain('sun');
    expect(kinds(map).every((k) => !k.includes(':'))).toBe(true);
    map.destroy();
  });

  it('Neon draws the same globes — the light is in the drawing, not the frame', () => {
    const calls = [];
    const map = run({ now: 'neon' }, calls);
    expect(kinds(map).every((k) => !k.includes(':'))).toBe(true);
    const blurs = calls.filter((c) => c[0] === '=shadowBlur').map((c) => c[1]);
    expect(Math.max(...blurs)).toBeGreaterThanOrEqual(12);
    // A world is written in its own hue burning, and throws that hue's light.
    const set = (prop) => calls.filter((c) => c[0] === '=' + prop).map((c) => String(c[1]));
    expect(set('fillStyle').some((v) => /^hsl\(\d+, 100%, 76%\)$/.test(v))).toBe(true);
    expect(set('shadowColor').some((v) => /^hsl\(\d+, 100%, 56%\)$/.test(v))).toBe(true);
    map.destroy();
  });

  it('Nebula\'s own look lights a sun and nothing brighter', () => {
    const calls = [];
    const map = run({ now: 'nebula' }, calls);
    const blurs = calls.filter((c) => c[0] === '=shadowBlur').map((c) => c[1]);
    expect(Math.max(...blurs)).toBeLessThanOrEqual(8);
    expect(calls.some((c) => (c[0] === '=fillStyle' || c[0] === '=shadowColor') && /100%/.test(String(c[1])))).toBe(false);
    map.destroy();
  });

  it('neonOf: a hue burns and throws its light, an ink is its own', () => {
    expect(neonOf('hsl(200, 52%, 70%)', '#111')).toEqual({ tube: 'hsl(200, 100%, 76%)', light: 'hsl(200, 100%, 56%)' });
    // On a light paper the tube is deep, so it can be read.
    expect(neonOf('hsl(200, 48%, 40%)', '#fff')).toEqual({ tube: 'hsl(200, 100%, 40%)', light: 'hsl(200, 100%, 46%)' });
    expect(neonOf('#cfcfcf', '#111')).toEqual({ tube: '#cfcfcf', light: '#cfcfcf' });
    expect(neonOf('hsl(200, 52%, 70%)', '#111')).toBe(neonOf('hsl(200, 52%, 70%)', '#111'));
  });

  it('Medieval draws disks: its own frames, in glyphs', () => {
    const calls = [];
    const map = run({ now: 'medieval' }, calls);
    expect(kinds(map)).toContain('disk:sun');
    expect(kinds(map)).not.toContain('sun');
    expect(calls.some((c) => c[0] === 'fillText')).toBe(true);
    map.destroy();
  });

  it('Pixel draws cubes as blocks on a square grid', () => {
    const calls = [];
    const map = run({ now: 'pixel' }, calls);
    const suns = map.frames().filter((k) => k.startsWith('px:sun|'));
    expect(suns.length).toBeGreaterThan(0);
    const [, cols, rows] = suns[0].split('|');
    expect(cols).toBe(rows);                                   // square
    expect(kinds(map)).not.toContain('sun');
    // Blocks: squares on the canvas, each as wide as it is tall.
    const rects = calls.filter((c) => c[0] === 'rect' && c[3] > 2);
    expect(rects.length).toBeGreaterThan(20);
    expect(rects.every((c) => c[3] === c[4])).toBe(true);
    map.destroy();
  });

  it('the four after them draw their own worlds, each under its own key', () => {
    for (const [look, shape] of [['blueprint', 'wire'], ['ink', 'enso'], ['deco', 'gem'], ['clockwork', 'gear']]) {
      const calls = [];
      const map = run({ now: look }, calls);
      expect(kinds(map), look).toContain(`${shape}:sun`);
      expect(kinds(map), look).not.toContain('sun');
      expect(calls.some((c) => c[0] === 'fillText'), look).toBe(true);
      map.destroy();
    }
  });

  it('Medieval fills its bodies in under the glyphs; Blueprint and Clockwork leave the sky between their lines', () => {
    const filled = (look) => {
      const calls = [];
      const map = run({ now: look }, calls);
      map.destroy();
      return calls.filter((c) => c[0] === 'rect' || c[0] === 'fillRect').length;
    };
    const lines = filled('blueprint');
    expect(filled('medieval')).toBeGreaterThan(lines);
    expect(filled('medieval')).toBeGreaterThan(filled('clockwork'));
  });

  it('a look that is no design\'s — Steampunk\'s, since it became Clockwork — is drawn as Nebula\'s own', () => {
    const map = run({ now: 'steampunk' });
    expect(kinds(map)).toContain('sun');
    expect(kinds(map).every((k) => !k.includes(':'))).toBe(true);
    map.destroy();
  });

  it('a design changed while the map is up drops what the old one drew', () => {
    const look = { now: 'nebula' };
    const map = run(look);
    expect(kinds(map)).toContain('sun');
    look.now = 'pixel';
    for (let i = 0; i < 5; i++) step(70);
    expect(kinds(map)).toContain('px:sun');
    expect(kinds(map)).not.toContain('sun');
    look.now = 'nebula';
    for (let i = 0; i < 5; i++) step(70);
    expect(kinds(map)).toContain('sun');
    expect(kinds(map).some((k) => k.includes(':'))).toBe(false);
    map.destroy();
  });

  it('a turning cube keeps at most 48 frames, as a globe does', () => {
    const map = run({ now: 'pixel' });
    for (let i = 0; i < 1200; i++) step(70);
    const suns = map.frames().filter((k) => k.startsWith('px:sun|'));
    expect(suns.length).toBeGreaterThan(1);
    expect(suns.length).toBeLessThanOrEqual(48);
    map.destroy();
  });

  it('reads the design off the page when it is given none', () => {
    document.documentElement.dataset.design = 'medieval';
    const map = createGalaxyMap(stubCanvas(), { getInput: input, colors: COLORS });
    step(70);
    map.focus('project:j1');
    for (let i = 0; i < 30; i++) step(70);
    expect(kinds(map)).toContain('disk:sun');
    map.destroy();
  });
});

describe('what the designs are made of', () => {
  const css = readFileSync(src('css/designs.css'), 'utf8');

  it('every face named is in the app, with its licence beside it', () => {
    const files = [...css.matchAll(/url\('\.\.\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
    // A file is named once, and the one cut of a face with one weight once more, for its bold.
    expect(new Set(files).size).toBe(178);
    expect(files.length).toBe(220);
    for (const f of files) expect(existsSync(src('fonts/' + f)), f).toBe(true);
    // The designs' seven, then the others of the font lists.
    const faces = ['fondamento', 'vt323', 'oxanium', 'patrick-hand', 'courgette', 'marcellus', 'bodoni-moda',
      'almendra', 'architects-daughter', 'caveat-brush', 'chakra-petch', 'cinzel', 'cormorant-garamond', 'courier-prime', 'cutive', 'cutive-mono',
      'eb-garamond', 'exo-2', 'glass-antiqua', 'grenze', 'handjet', 'inknut-antiqua', 'jersey-15', 'josefin-sans', 'jost', 'kalam', 'libre-baskerville',
      'libre-caslon-text', 'medievalsharp', 'old-standard-tt', 'oldenburg', 'pixelify-sans', 'poiret-one', 'rajdhani', 'raleway', 'sedgwick-ave',
      'shadows-into-light-two', 'sorts-mill-goudy', 'space-mono', 'tektur', 'tenor-sans', 'texturina', 'tiny5'];
    expect(readdirSync(src('fonts')).filter((f) => f.startsWith('OFL-')).map((f) => f.slice(4, -4)).sort()).toEqual([...faces].sort());
    // Hard to read in a paragraph, or short of a letter of the app's languages: out of the app (the owner: "okuması zor idi").
    for (const gone of ['kaushan-script', 'rye', 'grenze-gotisch']) expect(files.some((f) => f.startsWith(gone + '-')), gone).toBe(false);
    for (const l of faces) {
      expect(existsSync(src(`fonts/OFL-${l}.txt`)), l).toBe(true);
      expect(files.some((f) => f.startsWith(l + '-')), l).toBe(true);
    }
    // Every file in the folder belongs to one of them: nothing is packed that no rule names.
    for (const f of readdirSync(src('fonts'))) expect(f.startsWith('OFL-') || files.includes(f), f).toBe(true);
    expect(css).not.toMatch(/https?:\/\//);                     // packed with the app, never fetched
  });

  it('the sheet is linked, after the others', () => {
    const html = readFileSync(src('index.html'), 'utf8');
    expect(html.indexOf('css/designs.css')).toBeGreaterThan(html.indexOf('css/editor.css'));
  });

  it('every rule that changes the look names a design: Nebula\'s own is left alone', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*\{[^}]*\}/g, '');
    const selectors = [...body.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(40);
    // A selector list at its top-level commas: those inside :is() and :not() are not its own.
    const parts = (list) => {
      const out = [];
      let depth = 0, from = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i] === '(') depth++;
        else if (list[i] === ')') depth--;
        else if (list[i] === ',' && depth === 0) { out.push(list.slice(from, i)); from = i + 1; }
      }
      out.push(list.slice(from));
      return out.map((p) => p.trim());
    };
    // The bold of a one-weight face is the face's own, wherever a note is written in it: those rules
    // name the face, not a design, and set nothing but the line round a letter.
    const ofFace = (part) => /^\.editor[ :]|^\.lp-note:is\(/.test(part);
    for (const s of selectors) {
      for (const part of parts(s)) {
        expect(/^:root\[data-design="(medieval|pixel|neon|blueprint|ink|deco|clockwork)"\]|^:root:where\(\[data-design="|^\.design-pick|^\.dp-/.test(part) || ofFace(part), part).toBe(true);
      }
    }
    const faceRules = [...body.matchAll(/(?<=^|\})\s*([^{}@]+)\{([^{}]*)\}/g)].filter((m) => parts(m[1].trim()).some(ofFace));
    expect(faceRules.length).toBe(4);
    for (const m of faceRules) expect(m[2].trim(), m[1].trim().slice(0, 60)).toMatch(/^-webkit-text-stroke:\s*[^;]+;?$/);
    // And every design has rules of its own, and a button to pick it by.
    const panel = readFileSync(src('js/settings-panel.js'), 'utf8');
    for (const d of DESIGNS.slice(1)) {
      expect(selectors.filter((s) => s.startsWith(`:root[data-design="${d}"]`)).length, d).toBeGreaterThan(8);
      expect(css, d).toContain(`.design-pick [data-design="${d}"]`);
      expect(panel, d).toContain(`['${d}', '`);
    }
  });

  it('a design\'s own colours step aside for a worn profile', () => {
    const palettes = [...css.matchAll(/^(:root\[data-design[^{]*)\{\s*--paper:/gm)].map((m) => m[1]);
    expect(palettes).toHaveLength(9);                           // Main ×7, and Light in Medieval and in Ink
    for (const p of palettes) expect(p).toContain(':not([data-profile])');
    expect(palettes.filter((p) => p.includes('data-theme="light"')).map((p) => /data-design="(\w+)"/.exec(p)[1]).sort()).toEqual(['ink', 'medieval']);
  });

  it('nothing a design adds is thrown to one side: a shadow falls straight under or all round', () => {
    // The owner: "her designde ortalanması lazım her şeyin, simetrinin bozulmaması lazım".
    // The picker's tiles are the designs' names in their own letters: samples, not the app's own parts.
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\.design-pick[^{}]*\{[^{}]*\}/g, '');
    const shadows = [...body.matchAll(/(?:box|text)-shadow:\s*([^;}]+)/g)].map((m) => m[1]);
    expect(shadows.length).toBeGreaterThan(20);
    const layers = (value) => {
      const out = [];
      let depth = 0, from = 0;
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '(') depth++;
        else if (value[i] === ')') depth--;
        else if (value[i] === ',' && depth === 0) { out.push(value.slice(from, i)); from = i + 1; }
      }
      out.push(value.slice(from));
      return out.map((l) => l.trim());
    };
    for (const value of shadows) {
      const list = layers(value);
      for (const layer of list) {
        if (layer === 'none' || layer.startsWith('var(')) continue;
        const x = parseFloat(/(?:^|\s)(-?[\d.]+)(?:px)?\s+-?[\d.]+/.exec(layer.replace(/^inset\s+/, ''))?.[1] ?? '0');
        if (x === 0) continue;
        // A line down one side is allowed only inside the thing, and only with its like down the other side.
        expect(layer.startsWith('inset'), value).toBe(true);
        const mirror = layer.replace(/^inset\s+(-?)([\d.]+)/, (_, sign, n) => `inset ${sign ? '' : '-'}${n}`);
        // ...or where one side is the thing's only side of that kind: the mark of the open note, the list's seam with the page.
        const single = /note-row\.active|note-tab\.active|:is\(\.side, \.lp-side\) \{/.test(body.slice(Math.max(0, body.indexOf(value) - 160), body.indexOf(value)));
        expect(single || list.includes(mirror), value).toBe(true);
      }
    }
  });

  it('is named in every language', () => {
    const hint = 'A design changes the whole of Nebula: its lettering, its frames and the worlds of the Universe. Choosing one puts on Main, the colours of the design itself; your themes go on working under each one, and in Medieval and Ink Light is the design’s own too.';
    for (const lang of ['de', 'pl', 'tr']) {
      expect(t('Medieval', lang), lang).not.toBe('Medieval');
      expect(t(hint, lang), lang).not.toBe(hint);
      // The name is never declined, in any language.
      expect(t(hint, lang)).toMatch(/\bNebula\b(?![’'\p{L}])/u);
      for (const word of ['Design', 'Pixel', 'Neon', 'Blueprint', 'Ink', 'Art Deco', 'Clockwork']) expect(STRINGS[word], word).toHaveLength(3);
      for (const word of ['Blueprint', 'Ink', 'Clockwork']) expect(t(word, lang), word).not.toBe(word);
    }
    expect(t('Design', 'de')).toBe('Gestaltung');               // "Designs" are the themes there
    expect(t('Design', 'tr')).toBe('Tasarım');
    expect(STRINGS.Steampunk).toBeUndefined();
  });
});

// The owner: "hiçbir temada bölümlerin yükseklikleri ve genişlikleri değişmesin".
describe('a design takes no room and gives none', () => {
  const css = readFileSync(src('css/designs.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const rules = [...css.replace(/@font-face\s*\{[^}]*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }))
    .filter((r) => r.selector && !r.selector.startsWith('@'));
  const parts = (list) => {
    const out = [];
    let depth = 0, from = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i] === '(') depth++;
      else if (list[i] === ')') depth--;
      else if (list[i] === ',' && depth === 0) { out.push(list.slice(from, i)); from = i + 1; }
    }
    out.push(list.slice(from));
    return out.map((p) => p.trim());
  };
  const declarations = (body) => body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const at = d.indexOf(':');
    return [d.slice(0, at).trim().toLowerCase(), d.slice(at + 1).trim()];
  });
  // What a design draws before or after a thing has measures of its own; so has a scroll bar's own drawing.
  const drawn = (part) => /::(before|after|-webkit-scrollbar)/.test(part);
  const picker = (part) => /^\.design-pick|^\.dp-/.test(part);
  // Everything that gives a box its size, or its letters theirs.
  const SIZES = /^(font|font-size|font-size-adjust|font-stretch|zoom|line-height|padding(-.+)?|margin(-.+)?|(min-|max-)?(width|height)|(min-|max-)?(inline|block)-size|border(-(top|right|bottom|left|inline|block)(-(start|end))?)?(-width)?|gap|row-gap|column-gap|flex|flex-basis|flex-grow|flex-shrink|box-sizing|aspect-ratio|grid(-.+)?|columns|column-count|writing-mode|scale|word-spacing|text-indent)$/;

  it('reads the sheet: its rules, and the faces it brings', () => {
    expect(rules.length).toBeGreaterThan(200);
    expect(faces).toHaveLength(220);                            // one for each file named
  });

  it('no rule of a design sets a size: letters, lines, room inside or round a thing, borders', () => {
    const found = [];
    for (const { selector, body } of rules) {
      const own = parts(selector).filter((p) => !drawn(p) && !picker(p));
      if (!own.length) continue;
      for (const [prop, value] of declarations(body)) {
        if (prop.startsWith('--')) continue;
        if (SIZES.test(prop)) found.push(`${own[0]} { ${prop}: ${value} }`);
      }
    }
    expect(found).toEqual([]);
  });

  it('a button\'s capitals are small ones: a word in capitals is half as wide again, and its button with it', () => {
    for (const { selector, body } of rules) {
      const own = parts(selector).filter((p) => !drawn(p) && !picker(p));
      if (!own.some((p) => /\.btn\b|\.set-tab\b|\.set-hint\b|\.set-label\b/.test(p))) continue;
      expect(body, selector).not.toMatch(/text-transform:\s*uppercase/);
    }
    expect(css).toMatch(/font-variant-caps:\s*all-small-caps/);
  });

  it('every face stands on the lines of the face it takes the place of, whatever size it is drawn at', () => {
    // Nebula's own serif as Windows draws it, of 2048 (Palatino Linotype). Its sans's places are the
    // serif's and code is Nebula's mono in every design, so there is one set of lines.
    const [ascent, descent] = [2150, 613];
    const seen = new Set();
    for (const face of faces) {
      const family = /font-family:\s*"([^"]+)"/.exec(face)?.[1];
      expect(family, face.slice(0, 60)).toBeTruthy();
      const pct = (name) => { const m = new RegExp(name + ':\\s*([\\d.]+)%').exec(face); return m ? Number(m[1]) : NaN; };
      const adjust = /size-adjust:/.test(face) ? pct('size-adjust') : 100;
      expect(pct('ascent-override') * adjust / 100, family).toBeCloseTo(ascent / 2048 * 100, 2);
      expect(pct('descent-override') * adjust / 100, family).toBeCloseTo(descent / 2048 * 100, 2);
      expect(pct('line-gap-override'), family).toBe(0);
      seen.add(family);
    }
    // Every design's face is there, once: no second copy of a face for other lines.
    for (const d of DESIGNS.slice(1)) expect(seen.has(DESIGN_FACES[d][0]), d).toBe(true);
    expect(seen.size).toBe(43);
    for (const family of seen) expect(family).not.toMatch(/ as Sans$| Heads$|Signs/);
  });

  // The owner's picks, 1.0.4: one face for a design's words and its heads.
  it('a design names its face by the stacks, the same one in both, so the sizes stay Nebula\'s', () => {
    const picks = { medieval: 'Fondamento', pixel: 'VT323', neon: 'Oxanium', blueprint: 'Patrick Hand', ink: 'Courgette', deco: 'Marcellus', clockwork: 'Bodoni Moda' };
    for (const d of DESIGNS.slice(1)) {
      const own = rules.filter((r) => parts(r.selector).some((p) => p.startsWith(`:root[data-design="${d}"]`) && !p.includes(' '))).map((r) => r.body).join(' ');
      const serif = /--serif:\s*([^;]+);/.exec(own)?.[1];
      expect(serif, d).toMatch(new RegExp(`^"${picks[d]}", `));
      expect(/--sans:\s*([^;]+);/.exec(own)?.[1], d).toBe(serif);
      expect(DESIGN_FACES[d], d).toEqual([picks[d]]);
      // No other variable of a face, and no rule of the design's that names one: what it draws after a head aside.
      expect(own, d).not.toMatch(/--(gothic|px-head|deco|slab)\s*:/);
      for (const r of rules.filter((x) => x.selector.includes(`:root[data-design="${d}"]`))) {
        if (parts(r.selector).every(drawn)) continue;
        expect(r.body, r.selector).not.toMatch(/font-family\s*:/);
      }
      const name = rules.find((r) => r.selector.includes(`.design-pick [data-design="${d}"] .dp-name`));
      expect(name.body, d).toMatch(new RegExp(`font-family:\\s*"${picks[d]}"`));
    }
  });

  // The owner: "yapay kalın piksel piksel, net hissettirmiyor".
  it('a face with one weight is never fattened by the screen: its cut answers for bold, and bold is a line round the letter', () => {
    const familyOf = (face) => /font-family:\s*"([^"]+)"/.exec(face)[1];
    const bold = (face) => /font-weight:\s*(?:600 )?700/.test(face) || /font-weight:\s*\d+ [789]00/.test(face);
    const families = [...new Set(faces.map(familyOf))];
    // Every face answers for bold with a file of its own.
    for (const family of families) expect(faces.some((f) => familyOf(f) === family && bold(f)), family).toBe(true);
    const one = families.filter((family) => faces.some((f) => familyOf(f) === family && /font-weight:\s*600 700/.test(f) && /-400-normal\.woff2/.test(f)));
    expect(one).toHaveLength(19);
    const stroke = rules.filter((r) => /-webkit-text-stroke:\s*\.028em currentColor/.test(r.body));
    const byFace = stroke.filter((r) => r.selector.startsWith('.editor')).map((r) => r.selector).join(' ');
    for (const family of one) expect(byFace, family).toContain(`[style*="${family}"]`);
    for (const family of families.filter((f) => !one.includes(f))) expect(byFace, family).not.toContain(`[style*="${family}"]`);
    // And the designs that write in such a face give the line to their heads and their bold words; the others do not.
    const byDesign = stroke.find((r) => r.selector.startsWith(':root:where('));
    for (const d of DESIGNS.slice(1)) {
      expect(byDesign.selector.split(') :where(')[0].includes(`[data-design="${d}"]`), d).toBe(one.includes(DESIGN_FACES[d][0]));
    }
    // A note's own font takes the line off again, and so does a font given to a few words.
    const off = rules.filter((r) => /-webkit-text-stroke:\s*0/.test(r.body)).map((r) => r.selector).join(' ');
    expect(off).toContain('.editor:where([style*="--note-font"])');
    expect(off).toContain('.editor [style*="font-family"]');
  });

  // The owner: "kod hepsinde aynı olsun her temada".
  it('code is Nebula\'s mono in every design: no design names a mono of its own', () => {
    for (const r of rules.filter((x) => x.selector.includes('[data-design='))) expect(r.body, r.selector).not.toMatch(/--mono\s*:/);
  });

  // The owner: "gerisi tek font serif olsun".
  it('Nebula writes in one face: its sans\'s places are the serif\'s', () => {
    const tokens = readFileSync(src('css/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const [, serif] = tokens.match(/--serif:\s*([^;]+);/);
    const [, sans] = tokens.match(/--sans:\s*([^;]+);/);
    expect(sans).toBe(serif);
  });

  // The owner: "hepsini bir Old Standard TT yap", then the pick: Bodoni Moda.
  it('Clockwork writes everything in one face, and its signs are that face\'s own', () => {
    const own = rules.filter((r) => r.selector.includes(':root[data-design="clockwork"]'));
    expect(own.length).toBeGreaterThan(20);
    for (const r of own) expect(r.body, r.selector).not.toMatch(/--slab|Rye|Nebula Signs|Old Standard/);
    // Old Standard TT stays in the app for the font lists.
    expect(css).toMatch(/font-family:\s*"Old Standard TT"/);
  });

  // The owner: "ink için yaptığın el yazısı header'ların fontu … tüm ink'e uygulansın".
  it('Ink writes everything in one face, a hand that can be read in a paragraph', () => {
    const inkRules = rules.filter((r) => r.selector.includes('[data-design="ink"]') && !picker(r.selector));
    const ink = inkRules.map((r) => r.body).join(' ');
    expect(ink).toContain('--serif: "Courgette"');
    expect(ink).toContain('--sans: "Courgette"');
    expect(ink).not.toMatch(/EB Garamond/);
    // The brush's script the owner found hard to read is out of the app.
    expect(css).not.toMatch(/Kaushan/);
    // A small head is not set in capitals, and no rule of Ink's sets a weight: its bold is the line.
    const heads = inkRules.filter((r) => /\.set-head|\.editor :is\(h1/.test(r.selector)).map((r) => r.body).join(' ');
    expect(heads).toMatch(/text-transform:\s*none/);
    expect(ink).not.toMatch(/font-weight\s*:/);
    // Garamond stays in the app for the Font menu.
    expect(css).toMatch(/font-family:\s*"EB Garamond"/);
  });

  // The owner: "ink'te tepedeki beyaz çizgi kalksın".
  it('Ink paints no stroke along the top: not on the title strip, not on a dialog', () => {
    for (const r of rules.filter((x) => x.selector.includes('[data-design="ink"]'))) {
      if (!parts(r.selector).some((p) => /\.titlebar\b|\.modal\b|\.palette\b/.test(p) && !drawn(p))) continue;
      expect(r.body, r.selector).not.toMatch(/background-image/);
    }
  });

  // The owner: "blueprint'te no style deyince arkadaki çizgiler kayboluyor".
  it('Blueprint\'s grid goes on under the note when no style gives it a ground', () => {
    const frame = rules.find((r) => r.selector === ':root[data-design="blueprint"] #app:not(.has-backdrop) .editor-frame');
    expect(frame).toBeTruthy();
    const shell = rules.find((r) => r.selector.includes('[data-design="blueprint"]') && /\.edit-shell/.test(r.selector) && /background-image/.test(r.body));
    const of = (body, prop) => new RegExp(prop + ':\\s*([^;]+)').exec(body)?.[1].replace(/\s+/g, ' ').trim();
    for (const prop of ['background-image', 'background-size', 'background-attachment']) {
      expect(of(frame.body, prop), prop).toBeTruthy();
      expect(of(frame.body, prop), prop).toBe(of(shell.body, prop));
    }
    expect(of(frame.body, 'background-attachment')).toBe('fixed');   // both from the window's corner: one grid
  });

  // The owner: "önizlemeyi düzeltelim" — Appearance's preview drew no design's frames.
  it('Appearance\'s preview is drawn by the window\'s own rules: a design names each frame of the preview beside the window\'s', () => {
    const pairs = [
      [/\.brand-name(?![\w-])/, '.lp-brand__name'], [/\.title-input(?![\w-])/, '.lp-title'], [/\.titlebar(?![\w-])/, '.lp-bar'],
      [/\.side(?![\w-])/, '.lp-side'], [/\.toolbar(?![\w-])/, '.lp-toolbar'], [/\.tb-select(?![\w-])/, '.lp-select'],
      [/\.btn\.primary(?![\w-])/, '.lp-new'], [/\.btn(?![\w.-])/, '.lp-btn'],
      [/\.note-row\.active(?![\w-])/, '.lp-row.on'], [/\.note-row(?![\w.-])/, '.lp-row'], [/\.edit-shell(?![\w-])/, '.lp-shell'],
      [/\.editor blockquote(?![\w-])/, '.lp-quote'], [/\.editor :is\(h1, h2, h3\)/, '.lp-h'],
    ];
    const seen = new Set();
    for (const { selector } of rules) {
      // What a pointer or a caret brings is not in a picture of the window.
      if (!selector.startsWith(':root[data-design="') || /:(hover|active|focus)/.test(selector)) continue;
      for (const [real, small] of pairs) {
        if (!real.test(selector)) continue;
        expect(selector, `${small} beside ${real.source}`).toContain(small);
        seen.add(small);
      }
    }
    expect([...seen].sort()).toEqual(pairs.map((p) => p[1]).sort());
    // Blueprint's grid under the preview's page is the one under the note's frame.
    const frame = rules.find((r) => r.selector === ':root[data-design="blueprint"] #app:not(.has-backdrop) .editor-frame');
    const page = rules.find((r) => r.selector === ':root[data-design="blueprint"] .look-preview:not(.has-backdrop) .lp-page');
    expect(page.body.replace(/\s+/g, ' ')).toBe(frame.body.replace(/\s+/g, ' '));
    // The frames a design draws on stand in the preview at the window's own widths, on one ground.
    const app = readFileSync(src('css/app.css'), 'utf8');
    const editor = readFileSync(src('css/editor.css'), 'utf8');
    expect(readFileSync(src('js/settings-panel.js'), 'utf8')).toMatch(/pvShell = el\('div', 'lp-shell'\);\s*pvShell\.append\(pvTools, pvPage\);\s*pvMain\.append\(pvHead, pvShell\);/);
    expect(app).toMatch(/\.lp-shell \{ flex: 1; min-height: 0; display: flex; flex-direction: column;/);
    expect(app).toContain('.lp-row { padding: 5px 8px; border: 1px solid transparent; border-radius: 8px; }');
    expect(app).toContain('.lp-row.on { background: var(--paper-raised); border-color: var(--rule); }');
    expect(app).toContain('.note-row.active { background: var(--paper-raised); border-color: var(--rule); }');
    expect(app).toMatch(/\.lp-toolbar \{[^}]*border: 1\.4px solid var\(--ink\);/);
    expect(editor).toMatch(/\.toolbar \{[^}]*border: 1\.4px solid var\(--ink\);/);
    expect(app).toMatch(/\.lp-page \{[^}]*border: 1\.6px solid var\(--ink\); outline: 1\.6px solid var\(--ink\); outline-offset: 5px;/);
    expect(editor).toMatch(/\.editor-frame \{[^}]*border: 1\.6px solid var\(--ink\);\s*outline: 1\.6px solid var\(--ink\);\s*outline-offset: 5px;/);
    // Over a picture the list is its veil alone, as the window's is: a rule as heavy as the window's.
    expect(app).toContain('#ov-settings .look-preview.has-backdrop .lp-side { background: var(--backdrop-veil-side); }');
    expect(app).toContain('#app.has-backdrop .side { background: var(--backdrop-veil-side); }');
  });

  // The owner: "widgetler design fontunu kullansın".
  it('a widget is written in the design\'s face, whatever font its note is written in', () => {
    const editor = readFileSync(src('css/editor.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const wg = /\.note-widget > \.wg \{([^}]*)\}/.exec(editor)[1];
    expect(wg).toMatch(/font-family:\s*var\(--serif\);/);
    for (const m of editor.matchAll(/([^{}]+)\{([^{}]*--note-font[^{}]*)\}/g)) expect(m[1].trim()).not.toMatch(/\.wg(?![\w])|note-widget|\.wg-/);
  });

  // The owner: "design'da BLUEPRINT falan büyük harf gerek yok, hepsi kendi fontunda, sadece baş harfler büyük".
  it('a tile writes its name as it is spelt, in the design\'s face: no capitals put on', () => {
    const tiles = rules.filter((r) => /\.dp-name/.test(r.selector));
    expect(tiles.length).toBeGreaterThanOrEqual(DESIGNS.length - 1);
    for (const r of tiles) expect(r.body, r.selector).not.toMatch(/text-transform|font-variant/);
    for (const d of DESIGNS.slice(1)) {
      const own = tiles.filter((r) => r.selector.includes(`[data-design="${d}"]`)).map((r) => r.body).join(' ');
      expect(own, d).toMatch(/font-family:/);
    }
    expect(tiles.find((r) => r.selector.includes('"ink"')).body).toContain('"Courgette"');
  });

  it('the picker shows the names alone: no drawing of a world on a tile', () => {
    expect(css).not.toMatch(/\.dp-world/);
    expect(readFileSync(src('js/settings-panel.js'), 'utf8')).not.toMatch(/dp-world/);
  });

  // The owner: "design soldan sağa tek satır olsun".
  it('the picker is one row: as many columns as there are designs', () => {
    const row = rules.find((r) => r.selector.trim() === '.design-pick');
    expect(row.body).toContain(`grid-template-columns: repeat(${DESIGNS.length}, minmax(0, 1fr))`);
    expect(row.body).not.toMatch(/max-width/);
  });

  // The owner: "her design'ın main'i olsun, şu an göremiyorum" — a design chosen puts Main on.
  it('a design chosen puts Main on, where the theme is kept', () => {
    expect(readFileSync(src('js/main.js'), 'utf8')).toMatch(/on\('design-changed', \(\) => theme\.set\('main'\)\)/);
  });

  // The owner: "bullet point işaretleri tüm fontlarda nebula fontu olsun yani aynı işaretler olsun".
  it('a bullet is Nebula\'s own mark under every design: a stack no design sets', () => {
    const tokens = readFileSync(src('css/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/--marks:\s*([^;]+);/.exec(tokens)[1]).toBe(/--serif:\s*([^;]+);/.exec(tokens)[1]);
    expect(css).not.toMatch(/--marks/);
    const editor = readFileSync(src('css/editor.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const [, mark] = /\.editor ul > li:not\(\.blk-todo\)::before\s*\{([^}]*)\}/.exec(editor);
    expect(mark).toMatch(/font-family:\s*var\(--marks\)/);
    expect(mark).toMatch(/-webkit-text-stroke:\s*0/);
    // No design draws a list's mark of its own.
    for (const r of rules) expect(r.selector, r.selector).not.toMatch(/li[^,]*::(before|marker)/);
  });

  // The owner: "design değişimlerinde kayma var, scroll mesela kayıyor soldaki, headerlerin başlangıç hizası".
  it('a head starts where Nebula\'s does: a design\'s ornament stands after its words', () => {
    const heads = rules.filter((r) => /\.set-head::/.test(r.selector));
    expect(heads.length).toBe(DESIGNS.length - 1);
    for (const r of heads) expect(r.selector).toMatch(/\.set-head::after$/);
    // Nor is a head pushed in another way.
    for (const r of rules.filter((x) => /\.set-head\b(?!::)/.test(x.selector))) {
      expect(r.body, r.selector).not.toMatch(/padding|margin|text-indent/);
    }
  });

  it('a scroll bar is as wide under every design: a design gives it a colour, never the whole background', () => {
    const bars = rules.filter((r) => /::-webkit-scrollbar/.test(r.selector));
    expect(bars.length).toBeGreaterThan(0);
    for (const r of bars) {
      for (const [name] of declarations(r.body)) expect(name, r.selector).toMatch(/^(background-color|border-radius)$/);
    }
  });

  it('a hint of Appearance keeps the room of its longest wrap: the stacks measured are the designs\' own', () => {
    for (const d of DESIGNS) {
      const own = rules.filter((r) => parts(r.selector).some((p) => p === `:root[data-design="${d}"]`)).map((r) => r.body).join(' ');
      const serif = d === 'nebula'
        ? /--serif:\s*([^;]+);/.exec(readFileSync(src('css/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))[1]
        : /--serif:\s*([^;]+);/.exec(own)?.[1];
      expect(designStack(d), d).toBe(serif);
    }
    const panel = readFileSync(src('js/settings-panel.js'), 'utf8');
    expect(panel).toMatch(/const stacks = DESIGNS\.map\(designStack\)/);
    expect(panel).toMatch(/h\.style\.minHeight = /);
    // The sheet does not follow a thing that moved: no scroll anchoring.
    expect(readFileSync(src('css/app.css'), 'utf8')).toMatch(/#settings-body \{[^}]*overflow-anchor: none/);
  });

  it('the Settings sheet is drawn a tenth larger as one: one zoom, the window\'s measures divided by it, the Tools sheet as it was', () => {
    const css = readFileSync(src('css/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/#ov-settings \.modal \{ --set-zoom: 1\.1; zoom: var\(--set-zoom\); \}/);
    // What is measured against the window is divided by the zoom, or the sheet would leave the window.
    const own = css.split('\n').filter((line) => line.startsWith('#ov-settings'));
    for (const line of own.filter((l) => /\d(vh|vw)\b/.test(l) && /\.modal/.test(l))) {
      expect(line, line).toMatch(/calc\(\d+v[hw] \/ var\(--set-zoom\)\)/);
      expect(line.replace(/calc\(\d+v[hw] \/ var\(--set-zoom\)\)/g, ''), line).not.toMatch(/\d(vh|vw)\b/);
    }
    expect(own.some((l) => /max-height: calc\(92vh \/ var\(--set-zoom\)\)/.test(l))).toBe(true);
    expect(own.filter((l) => /width: min\(\d+px, calc\(\d+vw \/ var\(--set-zoom\)\)\)/.test(l))).toHaveLength(2);
    // The Tools sheet wears the same classes and is not Settings.
    expect(css).toMatch(/#ov-tools \.modal \{[^}]*max-height: 86vh;/);
    expect(css).not.toMatch(/#ov-tools[^{]*\{[^}]*zoom/);
    // A hint's room is measured as drawn and set as written.
    const panel = readFileSync(src('js/settings-panel.js'), 'utf8');
    expect(panel).toMatch(/const zoom = lookPanel\.getBoundingClientRect\(\)\.width \/ Math\.max\(1, lookPanel\.offsetWidth\) \|\| 1;/);
    expect(panel).toMatch(/h\.getBoundingClientRect\(\)\.height \/ zoom/);
  });
});
