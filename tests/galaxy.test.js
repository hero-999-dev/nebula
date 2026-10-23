/**
 * Galaxy map model and ASCII art tests (1.0.0) — unit tests for galaxy-model.js
 * and galaxy-ascii.js per the spec in test-results/orchestra/galaxy-2026-10-20/
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hashSeed,
  rng,
  buildScene,
  positionAt,
  bodyAt,
  GALAXY_PERIOD,
  hueOf,
  labelsOf,
  mentionLinks,
} from '../src/js/galaxy-model.js';
import {
  RAMP,
  frameIndex,
  sphere,
  sun,
  vortex,
  core,
  stars,
} from '../src/js/galaxy-ascii.js';
import { createGalaxyMap, spanningTree, hueColor, mentionKey, mixColor, nameShownAt } from '../src/js/galaxy-map.js';

describe('galaxy-model', () => {
  describe('hashSeed', () => {
    it('gives the same number for the same string', () => {
      expect(hashSeed('hello')).toBe(hashSeed('hello'));
      expect(hashSeed('note:123')).toBe(hashSeed('note:123'));
      expect(hashSeed('a')).toBe(hashSeed('a'));
    });

    it('produces different hashes for different strings', () => {
      expect(hashSeed('a')).not.toBe(hashSeed('b'));
      expect(hashSeed('hello')).not.toBe(hashSeed('world'));
    });

    it('returns a uint32', () => {
      const h = hashSeed('test');
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
      expect(Number.isInteger(h)).toBe(true);
    });
  });

  describe('rng', () => {
    it('repeats the same sequence for the same seed', () => {
      const r1 = rng(12345);
      const r2 = rng(12345);
      expect(r1()).toBe(r2());
      expect(r1()).toBe(r2());
      expect(r1()).toBe(r2());
    });

    it('produces numbers in [0,1)', () => {
      const r = rng(999);
      for (let i = 0; i < 100; i++) {
        const val = r();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });

    it('different seeds produce different sequences', () => {
      const r1 = rng(1);
      const r2 = rng(2);
      expect(r1()).not.toBe(r2());
    });

    it('accepts string seed', () => {
      const r = rng('my-seed');
      expect(r()).toBeGreaterThanOrEqual(0);
      expect(r()).toBeLessThan(1);
    });
  });

  describe('buildScene', () => {
    it('is deterministic: same input twice produces same bodies', () => {
      const input = {
        notes: [{ id: 'n1', title: 'Note 1' }, { id: 'n2', title: 'Note 2' }],
        folders: [{ id: 'f1', name: 'Folder 1' }],
        projects: [],
        holes: [],
        hole: null,
      };
      const scene1 = buildScene(input);
      const scene2 = buildScene(input);
      expect(scene1.bodies).toEqual(scene2.bodies);
      expect(scene1.kind).toBe(scene2.kind);
      expect(scene1.holeId).toBe(scene2.holeId);
    });

    it('main space has one core', () => {
      const scene = buildScene({ notes: [], folders: [], projects: [], holes: [], hole: null });
      const core = scene.bodies.find((b) => b.kind === 'core');
      expect(core).toBeDefined();
      expect(core.id).toBe('core');
      expect(core.parent).toBeNull();
      expect(core.x).toBe(0);
      expect(core.y).toBe(0);
    });

    it('creates one sun per project and one planet per folder (v2: projects are stars)', () => {
      const input = {
        notes: [],
        folders: [{ id: 'f1', name: 'Alpha' }, { id: 'f2', name: 'Beta', project: 'j1' }],
        projects: [{ id: 'j1', name: 'Job' }, { id: 'j2', name: 'Other' }],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const suns = scene.bodies.filter((b) => b.kind === 'sun');
      expect(suns).toHaveLength(2);
      expect(suns.map((s) => s.id)).toContain('project:j1');
      expect(suns.map((s) => s.id)).toContain('project:j2');
      const planets = scene.bodies.filter((b) => b.kind === 'planet' && b.role === 'folder');
      expect(planets).toHaveLength(2);
      expect(planets.map((p) => p.id)).toContain('folder:f1');
      expect(planets.map((p) => p.id)).toContain('folder:f2');
      expect(scene.byId.get('folder:f1').parent).toBe('core');          // free folder rides the core's ring
      expect(scene.byId.get('folder:f2').parent).toBe('project:j1');     // a project's folder orbits its sun
    });

    it('creates one planet per note', () => {
      const input = {
        notes: [{ id: 'n1', title: 'A' }, { id: 'n2', title: 'B' }, { id: 'n3', title: 'C' }],
        folders: [],
        projects: [],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const planets = scene.bodies.filter((b) => b.kind === 'planet');
      expect(planets).toHaveLength(3);
      expect(planets.map((p) => p.id)).toContain('note:n1');
      expect(planets.map((p) => p.id)).toContain('note:n2');
      expect(planets.map((p) => p.id)).toContain('note:n3');
    });

    it('creates one moon per (note, label) pair', () => {
      const input = {
        notes: [{ id: 'n1', title: 'Note', labels: ['tag1', 'tag2'] }],
        folders: [],
        projects: [],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const moons = scene.bodies.filter((b) => b.kind === 'moon');
      expect(moons).toHaveLength(2);
      expect(moons.map((m) => m.id)).toContain('label:n1:tag1');
      expect(moons.map((m) => m.id)).toContain('label:n1:tag2');
      const moon1 = scene.byId.get('label:n1:tag1');
      expect(moon1.parent).toBe('note:n1');
    });

    it('creates one hole per black hole', () => {
      const input = {
        notes: [],
        folders: [],
        projects: [],
        holes: [{ id: 'h1', name: 'Black Hole 1' }, { id: 'h2', name: 'Black Hole 2' }],
        hole: null,
      };
      const scene = buildScene(input);
      const holes = scene.bodies.filter((b) => b.kind === 'hole');
      expect(holes).toHaveLength(2);
      expect(holes.map((h) => h.id)).toContain('hole:h1');
      expect(holes.map((h) => h.id)).toContain('hole:h2');
    });

    it('note parent is its folder planet when in a folder (v2: folders are planets)', () => {
      const input = {
        notes: [{ id: 'n1', title: 'In Folder', folder: 'f1' }],
        folders: [{ id: 'f1', name: 'Folder' }],
        projects: [],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const planet = scene.byId.get('note:n1');
      expect(planet.parent).toBe('folder:f1');
    });

    it('planet parent is its project when folder missing but project exists', () => {
      const input = {
        notes: [{ id: 'n1', title: 'In Project', project: 'j1' }],
        folders: [],
        projects: [{ id: 'j1', name: 'Project' }],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const planet = scene.byId.get('note:n1');
      expect(planet.parent).toBe('project:j1');
    });

    it('planet parent is core when no folder or project', () => {
      const input = {
        notes: [{ id: 'n1', title: 'Loose' }],
        folders: [],
        projects: [],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const planet = scene.byId.get('note:n1');
      expect(planet.parent).toBe('core');
    });

    it('locked hole: name is initials and no other field leaks', () => {
      const input = {
        notes: [],
        folders: [],
        projects: [],
        holes: [{ id: 'secret', initials: 'SH', locked: true }],
        hole: null,
      };
      const scene = buildScene(input);
      const hole = scene.byId.get('hole:secret');
      expect(hole.name).toBe('SH');
      expect(hole.kind).toBe('hole');
      expect(hole.id).toBe('hole:secret');
      expect('locked' in hole).toBe(true);
      expect(hole.locked).toBe(true);
      expect('initials' in hole).toBe(true);
      expect(hole.initials).toBe('SH');
    });

    it('black holes sit close by: inside every folder planet and project, outside the core\'s loose notes (owner, 2026-10-20)', () => {
      const scene = buildScene({
        notes: [{ id: 'l1', title: 'Loose' }, { id: 'n1', title: 'A', folder: 'f1' }, { id: 'n2', title: 'B', folder: 'f2' }],
        folders: [{ id: 'f1', name: 'F1' }, { id: 'f2', name: 'F2' }, { id: 'f3', name: 'F3' }],
        projects: [{ id: 'p1', name: 'P' }],
        holes: [{ id: 'h1', name: 'One' }, { id: 'h2', initials: 'TW', locked: true }],
        hole: null,
      });
      // The v2 rings all wheel round the core together, so at any one moment
      // the picture is the layout: distances from the centre tell the order.
      const dist = (id) => { const p = positionAt(scene, id, 0); return Math.hypot(p.x, p.y); };
      const holes = scene.bodies.filter((b) => b.kind === 'hole');
      const freeFolders = scene.bodies.filter((b) => b.role === 'folder' && b.parent === 'core');
      const loose = positionAt(scene, 'note:l1', 0);
      expect(holes).toHaveLength(2);                       // the locked one too
      expect(freeFolders.length).toBeGreaterThan(0);
      for (const h of holes) {
        for (const f of freeFolders) expect(dist(h.id) + h.size).toBeLessThan(dist(f.id));
        expect(dist(h.id) - h.size).toBeGreaterThan(Math.hypot(loose.x, loose.y));
        expect(dist(h.id)).toBeLessThan(dist('project:p1'));
      }
      const [a, b] = holes;
      const pa = positionAt(scene, a.id, 0);
      const pb = positionAt(scene, b.id, 0);
      expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeGreaterThan(a.size + b.size);   // side by side, not on top
    });

    it('many black holes: the ring grows so none overlap, and the folder planets move out past it', () => {
      const holes = Array.from({ length: 12 }, (_, i) => ({ id: `h${i}`, name: `H${i}` }));
      const scene = buildScene({ notes: [], folders: [{ id: 'f1', name: 'F' }], projects: [], holes, hole: null });
      const hs = scene.bodies.filter((b) => b.kind === 'hole');
      const at = (id) => positionAt(scene, id, 0);
      for (let i = 0; i < hs.length; i++) {
        for (let j = i + 1; j < hs.length; j++) {
          const pa = at(hs[i].id);
          const pb = at(hs[j].id);
          expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeGreaterThan(hs[i].size + hs[j].size);
        }
      }
      const folder = at('folder:f1');
      for (const h of hs) {
        const ph = at(h.id);
        expect(Math.hypot(ph.x, ph.y) + h.size).toBeLessThan(Math.hypot(folder.x, folder.y));
      }
    });

    it('hole dimension: has singularity, no core, no hole bodies, no main-space folders/suns', () => {
      const input = {
        notes: [{ id: 'n1', title: 'In Hole' }],
        folders: [{ id: 'f1', name: 'Main Folder' }],
        projects: [{ id: 'j1', name: 'Main Project' }],
        holes: [],
        hole: { id: 'h1', name: 'Hole' },
      };
      const scene = buildScene(input);
      expect(scene.kind).toBe('hole');
      expect(scene.holeId).toBe('h1');

      const singularity = scene.bodies.find((b) => b.kind === 'singularity');
      expect(singularity).toBeDefined();
      expect(singularity.id).toBe('singularity');

      const core = scene.bodies.find((b) => b.kind === 'core');
      expect(core).toBeUndefined();

      const holeBodies = scene.bodies.filter((b) => b.kind === 'hole');
      expect(holeBodies).toHaveLength(0);

      const suns = scene.bodies.filter((b) => b.kind === 'sun');
      expect(suns).toHaveLength(0);

      const projects = scene.bodies.filter((b) => b.kind === 'project');
      expect(projects).toHaveLength(0);

      const folders = scene.bodies.filter((b) => b.ref === 'f1');
      expect(folders).toHaveLength(0);

      const planets = scene.bodies.filter((b) => b.kind === 'planet');
      expect(planets).toHaveLength(1);
      expect(planets[0].parent).toBe('singularity');
    });
  });

  describe('positionAt', () => {
    it('moves a planet over time', () => {
      const input = {
        notes: [{ id: 'n1', title: 'Orbiting' }],
        folders: [],
        projects: [],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const pos0 = positionAt(scene, 'note:n1', 0);
      const pos30 = positionAt(scene, 'note:n1', 30);
      expect(pos0).not.toEqual(pos30);
    });

    it('keeps distance to parent constant within tolerance', () => {
      const input = {
        notes: [{ id: 'n1', title: 'Orbiting', folder: 'f1' }],
        folders: [{ id: 'f1', name: 'Parent' }],
        projects: [],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const folder = scene.byId.get('folder:f1');
      const note = scene.byId.get('note:n1');
      // In v2 the folder planet rides the core's ring too, so the parent is
      // measured where it stands at each moment.
      const folderPos0 = positionAt(scene, 'folder:f1', 0);
      const notePos0 = positionAt(scene, 'note:n1', 0);
      const d0 = Math.hypot(notePos0.x - folderPos0.x, notePos0.y - folderPos0.y);

      const folderPos30 = positionAt(scene, 'folder:f1', 30);
      const notePos30 = positionAt(scene, 'note:n1', 30);
      const d30 = Math.hypot(notePos30.x - folderPos30.x, notePos30.y - folderPos30.y);

      expect(Math.abs(d0 - d30)).toBeLessThan(1e-6);
      expect(d0).toBeCloseTo(note.orbit.r, 10);
    });
  });

  describe('bodyAt', () => {
    it('finds a planet at its own position', () => {
      const input = {
        notes: [{ id: 'n1', title: 'Find Me' }],
        folders: [],
        projects: [],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const pos = positionAt(scene, 'note:n1', 0);
      const found = bodyAt(scene, pos.x, pos.y, 0);
      expect(found).toBe('note:n1');
    });

    it('returns null far away from everything', () => {
      const input = {
        notes: [{ id: 'n1', title: 'Only' }],
        folders: [],
        projects: [],
        holes: [],
        hole: null,
      };
      const scene = buildScene(input);
      const found = bodyAt(scene, 999999, 999999, 0);
      expect(found).toBeNull();
    });
  });
});

describe('galaxy-ascii', () => {
  describe('RAMP', () => {
    it('is the expected luminance ramp', () => {
      expect(RAMP).toBe('.,-~:;=!*#$@');
    });
  });

  describe('frameIndex', () => {
    it('returns index within [0, frames) for spin 0', () => {
      expect(frameIndex(0, 48)).toBe(0);
    });

    it('returns index within [0, frames) for spin 0.5', () => {
      const idx = frameIndex(0.5, 48);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(48);
    });

    it('returns index within [0, frames) for spin 7.3', () => {
      const idx = frameIndex(7.3, 48);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(48);
    });

    it('returns index within [0, frames) for negative spin -1', () => {
      const idx = frameIndex(-1, 48);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(48);
    });

    it('wraps spin values greater than TAU', () => {
      const idx1 = frameIndex(0, 48);
      const idx2 = frameIndex(Math.PI * 2, 48);
      expect(idx1).toBe(idx2);
    });
  });

  describe('sphere', () => {
    it('returns correct dimensions', () => {
      const result = sphere({ cols: 20, rows: 10, spin: 0 });
      expect(result).toHaveLength(10);
      expect(result.every((row) => row.length === 20)).toBe(true);
    });

    it('only contains RAMP characters or space', () => {
      const result = sphere({ cols: 20, rows: 10, spin: 0 });
      const allChars = result.join('');
      for (const ch of allChars) {
        expect(RAMP.includes(ch) || ch === ' ').toBe(true);
      }
    });

    it('is deterministic: same args produce same output', () => {
      const result1 = sphere({ cols: 20, rows: 10, spin: 0 });
      const result2 = sphere({ cols: 20, rows: 10, spin: 0 });
      expect(result1).toEqual(result2);
    });

    it('works with minimum cols and rows', () => {
      const result = sphere({ cols: 5, rows: 3, spin: 0 });
      expect(result).toHaveLength(3);
      expect(result.every((row) => row.length === 5)).toBe(true);
    });
  });

  describe('sun', () => {
    it('returns correct dimensions', () => {
      const result = sun({ cols: 20, rows: 10, t: 0 });
      expect(result).toHaveLength(10);
      expect(result.every((row) => row.length === 20)).toBe(true);
    });

    it('only contains RAMP characters or space', () => {
      const result = sun({ cols: 20, rows: 10, t: 0 });
      const allChars = result.join('');
      for (const ch of allChars) {
        expect(RAMP.includes(ch) || ch === ' ').toBe(true);
      }
    });

    it('turns: a different spin moves the surface, the same spin draws the same sun (owner, 2026-10-20)', () => {
      const a = sun({ cols: 24, rows: 12, t: 1, spin: 0, seed: 7 });
      const b = sun({ cols: 24, rows: 12, t: 1, spin: 0.8, seed: 7 });
      expect(b).not.toEqual(a);
      expect(sun({ cols: 24, rows: 12, t: 1, spin: 0.8, seed: 7 })).toEqual(b);
    });

    it('is deterministic: same args produce same output', () => {
      const result1 = sun({ cols: 20, rows: 10, t: 0, seed: 42 });
      const result2 = sun({ cols: 20, rows: 10, t: 0, seed: 42 });
      expect(result1).toEqual(result2);
    });
  });

  describe('vortex', () => {
    it('returns correct dimensions', () => {
      const result = vortex({ cols: 20, rows: 10, t: 0 });
      expect(result).toHaveLength(10);
      expect(result.every((row) => row.length === 20)).toBe(true);
    });

    it('only contains RAMP characters or space', () => {
      const result = vortex({ cols: 20, rows: 10, t: 0 });
      const allChars = result.join('');
      for (const ch of allChars) {
        expect(RAMP.includes(ch) || ch === ' ').toBe(true);
      }
    });

    it('is deterministic: same args produce same output', () => {
      const result1 = vortex({ cols: 20, rows: 10, t: 0, seed: 42 });
      const result2 = vortex({ cols: 20, rows: 10, t: 0, seed: 42 });
      expect(result1).toEqual(result2);
    });
  });

  describe('core', () => {
    it('returns correct dimensions', () => {
      const result = core({ cols: 20, rows: 10, t: 0 });
      expect(result).toHaveLength(10);
      expect(result.every((row) => row.length === 20)).toBe(true);
    });

    it('only contains RAMP characters or space', () => {
      const result = core({ cols: 20, rows: 10, t: 0 });
      const allChars = result.join('');
      for (const ch of allChars) {
        expect(RAMP.includes(ch) || ch === ' ').toBe(true);
      }
    });

    it('is deterministic: same args produce same output', () => {
      const result1 = core({ cols: 20, rows: 10, t: 0 });
      const result2 = core({ cols: 20, rows: 10, t: 0 });
      expect(result1).toEqual(result2);
    });
  });

  describe('stars', () => {
    it('returns correct count of stars', () => {
      const result = stars(12345, 50, 800, 600);
      expect(result).toHaveLength(50);
    });

    it('all stars are inside the box', () => {
      const result = stars(12345, 50, 800, 600);
      for (const star of result) {
        expect(star.x).toBeGreaterThanOrEqual(0);
        expect(star.x).toBeLessThanOrEqual(800);
        expect(star.y).toBeGreaterThanOrEqual(0);
        expect(star.y).toBeLessThanOrEqual(600);
      }
    });

    it('stars have expected properties', () => {
      const result = stars(12345, 50, 800, 600);
      for (const star of result) {
        expect(typeof star.x).toBe('number');
        expect(typeof star.y).toBe('number');
        expect(typeof star.size).toBe('number');
        expect(star.size).toBeGreaterThanOrEqual(6);
        expect(star.size).toBeLessThanOrEqual(14);
        expect(typeof star.alpha).toBe('number');
        expect(star.alpha).toBeGreaterThanOrEqual(0.12);
        expect(star.alpha).toBeLessThanOrEqual(0.52);
        expect(typeof star.depth).toBe('number');
        expect(star.depth).toBeGreaterThanOrEqual(0.2);
        expect(star.depth).toBeLessThanOrEqual(1);
        expect(typeof star.phase).toBe('number');
      }
    });

    it('is deterministic: same seed produces same stars', () => {
      const result1 = stars(999, 50, 800, 600);
      const result2 = stars(999, 50, 800, 600);
      expect(result1).toEqual(result2);
    });

    it('different seeds produce different stars', () => {
      const result1 = stars(1, 50, 800, 600);
      const result2 = stars(2, 50, 800, 600);
      expect(result1).not.toEqual(result2);
    });
  });
});

describe('galaxy-map (engine)', () => {
  // jsdom has no canvas rasteriser (getContext returns null), so the engine
  // gets a real element with a recording-free 2d context stub — the same
  // trick the engine's null-context fallback makes necessary. Time is a
  // stepped fake clock so the 900 ms pull-in and the ~70 ms tick are exact.
  let clock = 0;
  let queue = [];

  const stubCanvas = (size = { w: 800, h: 600 }) => {
    const ctx = new Proxy(
      { measureText: () => ({ width: 8 }) },
      { get: (t, k) => (k in t ? t[k] : () => {}) }
    );
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { get: () => size.w });
    Object.defineProperty(canvas, 'clientHeight', { get: () => size.h });
    canvas.getContext = () => ctx;
    return canvas;
  };

  const COLORS = () => ({ ink: '#fff', faint: '#999', accent: '#09f', fern: '#7c9', madder: '#c96', paper: '#111' });
  const step = (ms = 70) => {
    clock += ms;
    const pending = queue;
    queue = [];
    for (const f of pending) f(clock);
  };

  beforeEach(() => {
    clock = 0;
    queue = [];
    vi.stubGlobal('requestAnimationFrame', (fn) => { queue.push(fn); return queue.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('performance', { now: () => clock });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a lock during the pull-in cancels the entry before it completes', () => {
    let locked = false;
    const dims = [];
    const map = createGalaxyMap(stubCanvas(), {
      getInput: (hid) => (hid
        ? { notes: [], hole: { id: 'h1', name: 'H' } }
        : {
            notes: [{ id: 'n1', title: 'A' }], folders: [], projects: [],
            holes: [{ id: 'h1', name: 'H', locked }],
          }),
      colors: COLORS,
      onDimension: (id) => dims.push(id),
    });
    step(70);
    map.enterHole('h1');
    step(70);                                 // the dive is under way
    locked = true;                            // the hole locks mid-dive
    for (let i = 0; i < 20; i++) step(70);    // past the 900 ms finish
    expect(map.dimension()).toBe(null);
    expect(dims).not.toContain('h1');
    map.destroy();
  });

  it('refresh() during the pull-in parks the dive and restores the camera', () => {
    let locked = false;
    const dims = [];
    const map = createGalaxyMap(stubCanvas(), {
      getInput: (hid) => (hid
        ? { notes: [], hole: { id: 'h1', name: 'H' } }
        : {
            notes: [{ id: 'n1', title: 'A' }], folders: [], projects: [],
            holes: [{ id: 'h1', name: 'H', locked }],
          }),
      colors: COLORS,
      onDimension: (id) => dims.push(id),
    });
    step(70);
    const before = map.view();
    map.enterHole('h1');
    step(70);
    locked = true;
    map.refresh();
    for (let i = 0; i < 5; i++) step(70);
    expect(map.dimension()).toBe(null);
    expect(dims).not.toContain('h1');
    expect(map.view()).toEqual(before);      // back exactly where the dive started
    map.destroy();
  });

  it('a minimap following its note draws at the tick, not at every frame (Codex recheck)', () => {
    let draws = 0;
    const map = createGalaxyMap(stubCanvas(), {
      getInput: () => ({ notes: [{ id: 'n1', title: 'A', folder: 'f1' }], folders: [{ id: 'f1', name: 'F' }], projects: [], holes: [] }),
      colors: () => { draws += 1; return COLORS(); },
      mini: true,
    });
    step(70);
    map.follow('n1');
    // The glide over to the note draws every frame — at the tick it stuttered
    // (the owner, 2026-10-21: "it catches, and goes too fast").
    draws = 0;
    for (let i = 0; i < 60; i++) step(16);
    expect(draws).toBeGreaterThan(40);
    for (let i = 0; i < 30; i++) step(16);   // the 1.2 s glide is over
    draws = 0;
    for (let i = 0; i < 60; i++) step(16);   // about a second at 60 Hz
    expect(draws).toBeGreaterThan(5);         // still alive
    expect(draws).toBeLessThanOrEqual(16);    // ~14 fps, not 60
    map.destroy();
  });

  it('the minimap is a window: a click or double-click on it does nothing (owner, 2026-10-21)', () => {
    const opened = [];
    const target = stubCanvas({ w: 240, h: 150 });
    target.setPointerCapture = () => {};
    target.releasePointerCapture = () => {};
    const map = createGalaxyMap(target, {
      getInput: () => ({ notes: [{ id: 'n1', title: 'A' }], folders: [], projects: [], holes: [] }),
      colors: COLORS, mini: true, onContext: (b) => opened.push(b.id),
    });
    step(70);
    const before = map.view();
    const at = (type) => { const e = new MouseEvent(type, { bubbles: true }); Object.defineProperties(e, { offsetX: { value: 120 }, offsetY: { value: 75 } }); return e; };
    target.dispatchEvent(at('pointerdown'));
    target.dispatchEvent(at('pointerup'));
    target.dispatchEvent(at('dblclick'));
    for (let i = 0; i < 20; i++) step(70);
    expect(map.view()).toEqual(before);
    expect(opened).toEqual([]);
    map.destroy();
  });

  it('a click on empty space lets go of the selection; the hand shows only while held (owner, 2026-10-21)', () => {
    const target = stubCanvas();
    target.setPointerCapture = () => {};
    const map = createGalaxyMap(target, {
      getInput: () => ({ notes: [{ id: 'n1', title: 'A' }], folders: [], projects: [], holes: [] }),
      colors: COLORS,
    });
    step(70);
    const at = (type, x, y) => { const e = new MouseEvent(type, { bubbles: true }); Object.defineProperties(e, { offsetX: { value: x }, offsetY: { value: y } }); return e; };
    map.restore({ x: 0, y: 0, zoom: 0.35, manual: true });     // the core dead centre
    step(70);
    target.dispatchEvent(at('pointerdown', 400, 300));          // the core, in the middle
    expect(target.classList.contains('is-grabbing')).toBe(true);
    target.dispatchEvent(at('pointerup', 400, 300));
    expect(target.classList.contains('is-grabbing')).toBe(false);
    expect(map.selected()).toBe('core');
    for (let i = 0; i < 30; i++) step(70);
    target.dispatchEvent(at('pointerdown', 2, 2));               // a corner: empty space
    target.dispatchEvent(at('pointerup', 2, 2));
    expect(map.selected()).toBe(null);
    map.destroy();
  });

  it('Hide names: setNames(false) draws no names, setNames(true) brings them back (owner, 2026-10-21)', () => {
    let texts = 0;
    const ctx = new Proxy({ measureText: () => ({ width: 8 }), fillText: (s) => { if (/Alphanote|Folderly/.test(s)) texts += 1; } },
      { get: (t, k) => (k in t ? t[k] : () => {}) });
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { get: () => 800 });
    Object.defineProperty(canvas, 'clientHeight', { get: () => 600 });
    canvas.getContext = () => ctx;
    const map = createGalaxyMap(canvas, {
      getInput: () => ({ notes: [{ id: 'n1', title: 'Alphanote', folder: 'f1' }], folders: [{ id: 'f1', name: 'Folderly' }], projects: [], holes: [] }),
      colors: COLORS,
    });
    for (let i = 0; i < 30; i++) step(70);
    expect(map.names()).toBe(true);
    texts = 0;
    for (let i = 0; i < 10; i++) step(70);
    expect(texts).toBeGreaterThan(0);
    map.setNames(false);
    expect(map.names()).toBe(false);
    step(70);
    texts = 0;
    for (let i = 0; i < 10; i++) step(70);
    expect(texts).toBe(0);
    map.setNames(true);
    texts = 0;
    for (let i = 0; i < 10; i++) step(70);
    expect(texts).toBeGreaterThan(0);
    map.destroy();
  });

  it('names come in a layer at a time; a selected body names its whole orbit (owner, 2026-10-22)', () => {
    const seen = new Set();
    const ctx = new Proxy({ measureText: () => ({ width: 8 }), fillText: (s) => seen.add(s) },
      { get: (t, k) => (k in t ? t[k] : () => {}) });
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { get: () => 800 });
    Object.defineProperty(canvas, 'clientHeight', { get: () => 600 });
    canvas.getContext = () => ctx;
    const notes = [{ id: 'n1', title: 'Alphanote', folder: 'f1', labels: ['Labelle'] }];
    for (let i = 2; i < 30; i++) notes.push({ id: 'n' + i, title: 'Other' + i, folder: 'f' + (i % 4) });
    const map = createGalaxyMap(canvas, {
      getInput: () => ({
        notes,
        folders: [0, 1, 2, 3].map((i) => ({ id: 'f' + i, name: i === 1 ? 'Folderly' : 'Fold' + i, project: i < 2 ? 'j1' : 'j2' })),
        projects: [{ id: 'j1', name: 'Projecta' }, { id: 'j2', name: 'Projectb' }], holes: [],
      }),
      colors: COLORS,
    });
    for (let i = 0; i < 30; i++) step(70);          // the whole map, fitted
    const fitView = map.view();
    seen.clear();
    for (let i = 0; i < 5; i++) step(70);
    expect(seen.has('Projecta')).toBe(true);
    expect(seen.has('Folderly')).toBe(false);
    expect(seen.has('Alphanote')).toBe(false);
    expect(seen.has('Labelle')).toBe(false);
    // Picked, at the same whole-map view: everything in Projecta's orbit is named.
    const sun = map.bodies().find((b) => b.name === 'Projecta');
    map.select(sun.id);
    map.restore({ ...fitView, manual: true });
    seen.clear();
    for (let i = 0; i < 5; i++) step(70);
    for (const n of ['Projecta', 'Folderly', 'Alphanote', 'Labelle']) expect(seen.has(n), n).toBe(true);
    expect(seen.has('Fold2')).toBe(false);          // Projectb's own folders stay unnamed
    map.destroy();
  });

  it('the name layers: projects, then folders and holes, then notes, then labels (owner, 2026-10-22)', () => {
    const fitK = 1;
    const order = ['project', 'folder', 'note', 'label'];
    const firstAt = (role) => [0.5, 1, 2, 3, 5, 8, 13, 20].find((k) => nameShownAt(role, k, fitK));
    for (let i = 1; i < order.length; i++) expect(firstAt(order[i])).toBeGreaterThan(firstAt(order[i - 1]));
    expect(firstAt('hole')).toBe(firstAt('folder'));
    expect(nameShownAt('core', 100, fitK)).toBe(false);
    // Going out they hide in the same order backwards.
    expect(nameShownAt('label', 10, fitK)).toBe(false);
    expect(nameShownAt('note', 10, fitK)).toBe(true);
    // Without projects, folders are the outermost layer and named at the whole-map view.
    expect(nameShownAt('folder', fitK, fitK, 1)).toBe(true);
    expect(nameShownAt('folder', fitK, fitK, 0)).toBe(false);
  });

  it('a turning sun keeps at most 48 frames, so it never churns the shared cache (Codex, 2026-10-20)', () => {
    const map = createGalaxyMap(stubCanvas(), {
      getInput: () => ({
        notes: [{ id: 'n1', title: 'A', folder: 'f1' }],
        folders: [{ id: 'f1', name: 'F', project: 'j1' }],
        projects: [{ id: 'j1', name: 'J' }],
        holes: [],
      }),
      colors: COLORS,
    });
    step(70);
    map.focus('project:j1');                          // v2: the sun is the project
    for (let i = 0; i < 1200; i++) step(70);          // 84 s of a sun on screen
    const suns = map.frames().filter((k) => k.startsWith('sun|'));
    expect(suns.length).toBeGreaterThan(1);           // it turned
    expect(suns.length).toBeLessThanOrEqual(48);
    map.destroy();
  });

  describe('the map fills its pane (owner, 2026-10-20)', () => {
    const sized = (size) => stubCanvas(size);
    const input = () => ({
      notes: [{ id: 'n1', title: 'A', folder: 'f1' }, { id: 'n2', title: 'B', folder: 'f2' }, { id: 'n3', title: 'C', folder: 'f3' }],
      folders: [{ id: 'f1', name: 'F1' }, { id: 'f2', name: 'F2' }, { id: 'f3', name: 'F3' }],
      projects: [], holes: [{ id: 'h1', name: 'H' }],
    });

    it('a wide pane is filled across its width and a narrow one across its own; a resize refits', () => {
      const size = { w: 1600, h: 600 };
      const map = createGalaxyMap(sized(size), { getInput: input, colors: COLORS });
      step(70);
      const px = () => map.view().zoom * Math.min(size.w, size.h);   // screen px per world unit, up to a constant
      const wide = px();
      const settle = () => { for (let i = 0; i < 20; i++) step(70); };
      size.w = 280;                     // notes opened beside it: the map's pane narrows
      map.resize();
      settle();
      expect(px()).toBeLessThan(wide * 0.9);
      size.w = 1600;
      map.resize();
      settle();
      // In v2 the whole map wheels round the core (owner, 2026-10-21), so the
      // bounds at refit time differ by a whisker from the ones first fitted:
      // the pane still fills to within two percent (fast label moons on the
      // outermost systems move the bounds a little between the two fits).
      expect(Math.abs(px() - wide) / wide).toBeLessThan(0.02);
      expect(map.view().manual).toBe(false);
      map.destroy();
    });

    it('once a hand has zoomed, a resize leaves the camera alone; Show the whole map gives it back', () => {
      const size = { w: 1200, h: 700 };
      const canvas = sized(size);
      const map = createGalaxyMap(canvas, { getInput: input, colors: COLORS });
      step(70);
      const fitted = map.view().zoom;
      const wheel = new Event('wheel', { cancelable: true });
      Object.assign(wheel, { deltaY: -200, offsetX: 600, offsetY: 350 });
      canvas.dispatchEvent(wheel);
      const zoomed = map.view();
      expect(zoomed.manual).toBe(true);
      expect(zoomed.zoom).toBeGreaterThan(fitted);
      size.w = 600;
      map.resize();
      expect(map.view().zoom).toBe(zoomed.zoom);
      map.overview();
      for (let i = 0; i < 20; i++) step(70);
      expect(map.view().manual).toBe(false);
      map.destroy();
    });

    it('the minimap comes close: following a note frames its sun system, nearer than the whole map', () => {
      const many = () => ({
        notes: Array.from({ length: 16 }, (_, i) => ({ id: `n${i + 1}`, title: `N${i}`, folder: `f${i % 8}` })),
        folders: Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, name: `F${i}` })),
        projects: [], holes: [],
      });
      const map = createGalaxyMap(sized({ w: 240, h: 150 }), { getInput: many, colors: COLORS, mini: true });
      step(70);
      const whole = map.view().zoom;
      map.follow('n1');
      // The tighter v2 layout makes the sun's system relatively bigger, so
      // the hop to it is longer — let it land before judging the zoom.
      for (let i = 0; i < 12; i++) step(70);
      expect(map.view().zoom).toBeGreaterThan(whole * 1.5);
      map.destroy();
    });

    it('a remembered view comes back only if a hand had chosen it', () => {
      const map = createGalaxyMap(sized({ w: 800, h: 600 }), { getInput: input, colors: COLORS });
      step(70);
      const fitted = map.view();
      map.restore({ x: 500, y: 500, zoom: 0.02 });
      expect(map.view()).toEqual(fitted);
      map.restore({ x: 500, y: 500, zoom: 0.02, manual: true });
      expect(map.view()).toMatchObject({ x: 500, y: 500, zoom: 0.02, manual: true });
      map.destroy();
    });
  });

  it('a locked black hole stays on the map and is never entered (owner, 2026-10-20)', () => {
    const dims = [];
    const asked = [];
    const map = createGalaxyMap(stubCanvas(), {
      getInput: (hid) => (hid
        ? { notes: [{ id: 'leak', title: 'leak' }], hole: { id: 'h1', name: 'H' } }
        : { notes: [{ id: 'n1', title: 'A' }], folders: [], projects: [], holes: [{ id: 'h1', initials: 'SA', locked: true }] }),
      colors: COLORS,
      onDimension: (id) => dims.push(id),
      onEnterHole: async (id) => { asked.push(id); return true; },
    });
    step(70);
    expect(map.bodies().find((b) => b.id === 'hole:h1')).toMatchObject({ kind: 'hole', name: 'SA' });
    map.enterHole('h1');
    for (let i = 0; i < 20; i++) step(70);
    expect(map.dimension()).toBe(null);
    expect(dims).not.toContain('h1');
    expect(map.bodies().some((b) => b.id === 'hole:h1')).toBe(true);   // still drawn
    map.destroy();
  });

  it('under reduced motion the map still turns, only slower (Windows "Animation effects" off)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const map = createGalaxyMap(stubCanvas(), {
      getInput: () => ({ notes: [{ id: 'n1', title: 'A', folder: 'f1' }], folders: [{ id: 'f1', name: 'F' }], projects: [], holes: [] }),
      colors: COLORS,
      mini: true,
    });
    step(70);
    map.follow('n1');
    step(70);
    const a = map.view();
    for (let i = 0; i < 40; i++) step(70);
    const b = map.view();
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0);   // the planet the camera rides moved
    map.destroy();
  });

  it('a paused map queues no frames; resume queues exactly one', () => {
    const map = createGalaxyMap(stubCanvas(), {
      getInput: () => ({ notes: [{ id: 'n1', title: 'A' }], folders: [], projects: [], holes: [] }),
      colors: COLORS,
    });
    step(70);
    expect(queue.length).toBe(1);            // the loop keeps itself alive
    map.pause();
    step(70);
    expect(queue.length).toBe(0);            // parked: no callback queued
    map.resume();
    expect(queue.length).toBe(1);            // exactly one, not two
    step(70);
    expect(queue.length).toBe(1);            // running, it requeues itself
    map.destroy();
    step(70);
    expect(queue.length).toBe(0);            // destroyed for good
  });

  describe('map v2 drawing (owner, 2026-10-21)', () => {
    const labelled = () => ({
      notes: [
        { id: 'a', title: 'A', labels: ['work', 'ideas'] },
        { id: 'b', title: 'B', labels: ['work'], folder: 'f1' },
        { id: 'c', title: 'C', labels: ['work'] },
        { id: 'd', title: 'D', labels: ['home'] },
      ],
      folders: [{ id: 'f1', name: 'F1' }], projects: [], holes: [{ id: 'h1', name: 'H', initials: 'H' }],
    });

    it('the pull-in into a hole plays under reduced motion too — never 0 ms (owner #10)', () => {
      vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
      const dims = [];
      const map = createGalaxyMap(stubCanvas(), {
        getInput: (hid) => (hid ? { notes: [], hole: { id: 'h1', name: 'H' } } : labelled()),
        colors: COLORS,
        onDimension: (id) => dims.push(id),
      });
      step(70);
      map.enterHole('h1');
      step(70);
      step(70);
      expect(map.dimension()).toBe(null);      // still falling, not cut straight in
      for (let i = 0; i < 20; i++) step(70);
      expect(map.dimension()).toBe('h1');
      map.destroy();
    });

    it('the label search: every label of the map, one colour each, unknown labels ignored', () => {
      const map = createGalaxyMap(stubCanvas(), { getInput: labelled, colors: COLORS });
      step(70);
      expect(map.labels()).toEqual(['home', 'ideas', 'work']);
      expect(map.labelColor('work')).toBe(map.labelColor('work'));
      expect(map.labelColor('work')).toMatch(/^hsl\(/);
      map.highlight(['work', 'nope', 'work']);
      expect(map.highlighted()).toEqual(['work']);
      map.destroy();
    });

    it('at most six labels are lit at once, so the lines stay cheap (Codex 25 #2)', () => {
      const many = () => ({
        notes: Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, title: `N${i}`, labels: [`l${i}`, 'all'] })),
        folders: [], projects: [], holes: [],
      });
      const map = createGalaxyMap(stubCanvas(), { getInput: many, colors: COLORS });
      step(70);
      map.highlight(['all', 'l0', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6']);
      expect(map.highlighted()).toEqual(['all', 'l0', 'l1', 'l2', 'l3', 'l4']);
      for (let i = 0; i < 5; i++) step(70);       // draws with the lines and the cached trees
      map.destroy();
    });

    it('mentions in the search: the notes in a link, keyed apart from labels, drawn as arrows (owner, 2026-10-21)', () => {
      const linked = () => ({
        notes: [
          { id: 'a', title: 'Alpha', labels: ['work'], mentions: ['b', 'gone', 'a'] },
          { id: 'b', title: 'Beta', labels: [] },
          { id: 'c', title: 'Gamma', labels: [], mentions: ['b'] },
          { id: 'd', title: 'Delta', labels: [] },
        ],
        folders: [], projects: [], holes: [],
      });
      const map = createGalaxyMap(stubCanvas(), { getInput: linked, colors: COLORS });
      step(70);
      expect(map.labels()).toEqual(['work']);                    // mentions are no labels
      expect(map.mentions()).toEqual([                            // Delta links nowhere; 'gone' is not on the map
        { key: mentionKey('a'), id: 'a', title: 'Alpha' },
        { key: mentionKey('b'), id: 'b', title: 'Beta' },
        { key: mentionKey('c'), id: 'c', title: 'Gamma' },
      ]);
      expect(map.labelColor(mentionKey('b'))).toMatch(/^hsl\(/);
      map.highlight(['work', mentionKey('b'), mentionKey('d')]);
      expect(map.highlighted()).toEqual(['work', mentionKey('b')]);
      for (let i = 0; i < 3; i++) step(70);                       // draws the arrows without a fault
      map.destroy();
    });

    it('a shooting star about once a minute, fast; a rocket every five minutes (owner, 2026-10-21)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const map = createGalaxyMap(stubCanvas(), { getInput: labelled, colors: COLORS });
      step(70);
      let shots = 0, was = false;
      for (let t = 0; t < 130000; t += 100) {
        step(100);
        const now = map.shooting();
        if (now && !was) shots++;
        was = now;
      }
      expect(shots).toBe(2);                    // at ~60 s and ~120 s
      expect(map.rocket()).toBe(null);          // not yet: five minutes
      for (let t = 0; t < 175000; t += 250) step(250);
      const r = map.rocket();
      expect(r).not.toBe(null);
      expect(r.followed).toBe(false);
      vi.restoreAllMocks();
      map.destroy();
    });

    it('a click on the rocket makes the camera ride along; once it is gone the camera goes back to Fit', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const canvas = stubCanvas();
      canvas.setPointerCapture = () => {};
      const map = createGalaxyMap(canvas, { getInput: labelled, colors: COLORS });
      step(70);
      for (let t = 0; t < 301000; t += 250) step(250);
      let r = map.rocket();
      expect(r).not.toBe(null);
      const click = (type, x, y) => {
        const e = new MouseEvent(type, { button: 0, bubbles: true });
        Object.defineProperty(e, 'offsetX', { value: x });
        Object.defineProperty(e, 'offsetY', { value: y });
        Object.defineProperty(e, 'pointerId', { value: 1 });
        canvas.dispatchEvent(e);
      };
      click('pointerdown', r.sx, r.sy);
      click('pointerup', r.sx, r.sy);
      expect(map.rocket().followed).toBe(true);
      for (let i = 0; i < 40; i++) step(16);
      r = map.rocket();
      expect(Math.hypot(map.view().x - r.x, map.view().y - r.y)).toBeLessThan(1.5);  // riding along
      expect(map.view().manual).toBe(true);
      for (let t = 0; t < 160000 && map.rocket(); t += 250) step(250);
      expect(map.rocket()).toBe(null);
      for (let i = 0; i < 80; i++) step(16);
      expect(map.view().manual).toBe(false);    // Fit again
      vi.restoreAllMocks();
      map.destroy();
    });

    it('a refresh with nothing changed keeps the scene and its frames — opening a note does not rebuild the map (perf audit)', () => {
      let input = labelled();
      const map = createGalaxyMap(stubCanvas(), { getInput: () => input, colors: COLORS });
      for (let i = 0; i < 4; i++) step(70);
      const before = map.frames();
      expect(before.length).toBeGreaterThan(0);
      map.refresh();
      expect(map.frames()).toEqual(before);           // same input: nothing dropped
      input = { ...labelled(), notes: [...labelled().notes, { id: 'new', title: 'New' }] };
      map.refresh();
      expect(map.bodies().some((b) => b.id === 'note:new')).toBe(true);   // a real change still rebuilds
      map.destroy();
    });

    it('a constellation is cleared when the map goes into a hole', () => {
      const map = createGalaxyMap(stubCanvas(), {
        getInput: (hid) => (hid ? { notes: [{ id: 'x', title: 'X', labels: ['work'] }], hole: { id: 'h1', name: 'H' } } : labelled()),
        colors: COLORS,
      });
      step(70);
      map.highlight(['work']);
      map.enterHole('h1');
      for (let i = 0; i < 30; i++) step(70);
      expect(map.dimension()).toBe('h1');
      expect(map.highlighted()).toEqual([]);
      map.destroy();
    });

    it('bodies() names each body\'s role, so the list and the menu can tell a folder planet from a note', () => {
      const map = createGalaxyMap(stubCanvas(), { getInput: labelled, colors: COLORS });
      step(70);
      const f = map.bodies().find((b) => b.id === 'folder:f1');
      expect(f).toMatchObject({ kind: 'planet', role: 'folder', ref: 'f1', name: 'F1' });
      expect(map.bodies().find((b) => b.id === 'note:b')).toMatchObject({ kind: 'moon', role: 'note' });
      map.destroy();
    });
  });
});

describe('constellation lines and theme colours', () => {
  it('a spanning tree joins n points with n-1 links, the same every time', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }];
    const links = spanningTree(pts);
    expect(links).toHaveLength(4);
    expect(spanningTree(pts)).toEqual(links);
    // Every point is reached.
    const seen = new Set([0]);
    for (const [i, j] of links) { seen.add(i); seen.add(j); }
    expect(seen.size).toBe(5);
    expect(spanningTree([{ x: 1, y: 1 }])).toEqual([]);
    expect(spanningTree([])).toEqual([]);
  });

  it('the tree takes the short links, not a mesh: a line of points is a chain', () => {
    const pts = [0, 3, 1, 2].map((x) => ({ x: x * 10, y: 0 }));
    const pairs = spanningTree(pts).map(([i, j]) => [pts[i].x, pts[j].x].sort((a, b) => a - b).join('-')).sort();
    expect(pairs).toEqual(['0-10', '10-20', '20-30']);
  });

  it('a hue is lighter on a dark paper and deeper on a light one', () => {
    const light = (c) => Number(/(\d+)%\)$/.exec(c)[1]);
    expect(light(hueColor(210, '#111111'))).toBeGreaterThan(light(hueColor(210, '#fafafa')));
    expect(hueColor(210, 'rgb(250, 250, 250)')).toBe(hueColor(210, '#fafafa'));
  });
});

describe('map v2 (owner, 2026-10-21)', () => {
  it('hierarchy: projects are suns, folders planets, folder notes moons, loose notes planets', () => {
    const scene = buildScene({
      notes: [
        { id: 'loose', title: 'Loose', labels: ['tag'] },
        { id: 'infolder', title: 'In', folder: 'f1', labels: ['tag'] },
        { id: 'inproj', title: 'Proj loose', project: 'j1' },
      ],
      folders: [{ id: 'f1', name: 'F', project: 'j1' }],
      projects: [{ id: 'j1', name: 'J' }],
      holes: [{ id: 'h1', name: 'H' }],
      hole: null,
    });
    expect(scene.byId.get('project:j1')).toMatchObject({ kind: 'sun', role: 'project', parent: 'core' });
    expect(scene.byId.get('folder:f1')).toMatchObject({ kind: 'planet', role: 'folder', parent: 'project:j1' });
    expect(scene.byId.get('note:infolder')).toMatchObject({ kind: 'moon', role: 'note', parent: 'folder:f1' });
    expect(scene.byId.get('note:infolder').hue).toBe(scene.byId.get('folder:f1').hue);   // its folder's colour
    expect(scene.byId.get('note:loose')).toMatchObject({ kind: 'planet', role: 'note', parent: 'core', hue: null });
    expect(scene.byId.get('note:inproj')).toMatchObject({ kind: 'planet', role: 'note', parent: 'project:j1' });
    expect(scene.byId.get('label:loose:tag')).toMatchObject({ kind: 'moon', role: 'label', parent: 'note:loose' });
    expect(scene.byId.get('label:infolder:tag')).toMatchObject({ kind: 'moon', role: 'label', parent: 'note:infolder' });
    // A label of a moon note is a smaller moon than a label of a planet note.
    expect(scene.byId.get('label:infolder:tag').size).toBeLessThan(scene.byId.get('label:loose:tag').size);
    expect(scene.byId.get('hole:h1')).toMatchObject({ kind: 'hole', role: 'hole', parent: 'core' });
  });

  it("a folder's notes are moons on rings round their folder planet", () => {
    const notes = Array.from({ length: 15 }, (_, i) => ({ id: 'n' + i, title: 'N' + i, folder: 'f1' }));
    const scene = buildScene({ notes, folders: [{ id: 'f1', name: 'F' }], projects: [], holes: [], hole: null });
    const folder = scene.byId.get('folder:f1');
    for (const n of notes) {
      const note = scene.byId.get('note:' + n.id);
      expect(note.parent).toBe('folder:f1');
      expect(note.kind).toBe('moon');
      expect(note.orbit.r).toBeGreaterThan(folder.size);   // clear of the planet itself
    }
    const radii = [...new Set(notes.map((n) => scene.byId.get('note:' + n.id).orbit.r))];
    expect(radii).toHaveLength(2);    // cap 6+3k: rings of 9 and 6
  });

  it('twenty loose notes make three rings, each sized to keep its systems apart (owner #6)', () => {
    const notes = Array.from({ length: 20 }, (_, i) => ({ id: 'l' + i, title: 'L' + i }));
    const scene = buildScene({ notes, folders: [], projects: [], holes: [], hole: null });
    const radii = [...new Set(notes.map((n) => scene.byId.get('note:' + n.id).orbit.r))].sort((a, b) => a - b);
    expect(radii).toHaveLength(3);                                  // 8 + 8 + 4
    expect(radii[0]).toBeCloseTo(3.5 * 2 + 4, 5);                   // r1 = core.size*2+4
    // v2 spacing (owner, 2026-10-21: "planets in the second ring touch each
    // other, more spacing in all rings"): each gap clears the two rings'
    // systems; the old widening gaps (3.6·1.18^k) remain only as a floor.
    expect(radii[1] - radii[0]).toBeGreaterThanOrEqual(3.6);
    expect(radii[2] - radii[1]).toBeGreaterThanOrEqual(3.6 * 1.18);
    // The real promise: on the first ring, no two neighbours' discs touch.
    const ring1 = scene.bodies.filter((b) => b.role === 'note' && b.orbit.r === radii[0]);
    expect(ring1.length).toBe(8);
    for (let i = 0; i < ring1.length; i++) {
      const a = ring1[i], b = ring1[(i + 1) % ring1.length];
      const pa = positionAt(scene, a.id, 0);
      const pb = positionAt(scene, b.id, 0);
      expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeGreaterThanOrEqual(a.size + b.size);
    }
  });

  it('sizes carry a seeded jitter of 0.85–1.15× (core and singularity excepted)', () => {
    const scene = buildScene({
      notes: [
        { id: 'n1', title: 'A', labels: ['t'] },
        { id: 'n2', title: 'B', folder: 'f1', labels: ['t'] },
      ],
      folders: [{ id: 'f1', name: 'F' }],
      projects: [{ id: 'j1', name: 'J' }],
      holes: [{ id: 'h1', name: 'H' }],
      hole: null,
    });
    const inside = buildScene({ notes: [], hole: { id: 'h1', name: 'H' } });
    const baseOf = (scene, b) => {
      if (b.role === 'project') return 6;
      if (b.role === 'folder') return 3.6;
      if (b.role === 'note') return b.kind === 'planet' ? 2.4 : 0.9;
      if (b.role === 'label') {
        const note = scene.byId.get(b.parent);
        return note && note.kind === 'planet' ? 0.42 : 0.24;
      }
      if (b.role === 'hole') return 5;
      return null;    // core, singularity: no jitter
    };
    for (const s of [scene, inside]) {
      for (const b of s.bodies) {
        const base = baseOf(s, b);
        if (base === null) {
          expect(b.size).toBe(b.role === 'core' ? 3.5 : 2);   // exactly the base
          continue;
        }
        expect(b.size / base).toBeGreaterThanOrEqual(0.85);
        expect(b.size / base).toBeLessThanOrEqual(1.15);
      }
    }
  });

  it('a ringed planet rolls its ring between 0 and 45 degrees (owner #8)', () => {
    const notes = Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, title: 'P' + i }));
    const scene = buildScene({ notes, folders: [], projects: [], holes: [], hole: null });
    const planets = scene.bodies.filter((b) => b.kind === 'planet');
    const ringed = planets.filter((b) => b.ringed);
    expect(ringed.length).toBeGreaterThan(0);
    expect(ringed.length).toBeLessThan(planets.length);      // ~1 in 4, seeded
    for (const b of ringed) {
      expect(b.roll).toBeGreaterThanOrEqual(0);
      expect(b.roll).toBeLessThanOrEqual(Math.PI / 4);
    }
    for (const b of planets.filter((x) => !x.ringed)) expect(b.roll).toBe(0);
  });

  it('the same label is the same colour on every note (owner #4)', () => {
    const scene = buildScene({
      notes: [
        { id: 'a', title: 'A', labels: ['shared'] },
        { id: 'b', title: 'B', labels: ['shared'] },
        { id: 'c', title: 'C', folder: 'f1', labels: ['shared'] },
      ],
      folders: [{ id: 'f1', name: 'F' }],
      projects: [],
      holes: [],
      hole: null,
    });
    const hues = ['label:a:shared', 'label:b:shared', 'label:c:shared'].map((id) => scene.byId.get(id).hue);
    expect(new Set(hues).size).toBe(1);
    expect(hues[0]).toBe(hueOf('label', 'shared'));
  });

  it('no body wears the green band the owner disliked (85–150°)', () => {
    const scene = buildScene({
      notes: [{ id: 'a', title: 'A', labels: ['x', 'y', 'z', 'w', 'q', 'r', 's', 't'] }],
      folders: [{ id: 'f1', name: 'F' }, { id: 'f2', name: 'G' }, { id: 'f3', name: 'H' }, { id: 'f4', name: 'I' }],
      projects: [{ id: 'j1', name: 'J' }, { id: 'j2', name: 'K' }, { id: 'j3', name: 'L' }],
      holes: [{ id: 'h1', name: 'H' }, { id: 'h2', name: 'I' }],
      hole: null,
    });
    for (const b of scene.bodies) {
      if (b.hue === null || b.hue === undefined) continue;
      expect(b.hue < 85 || b.hue > 150).toBe(true);
    }
  });

  it('every top-level body rides the same 40-minute turn round the core (owner #7)', () => {
    const scene = buildScene({
      notes: [{ id: 'a', title: 'A' }],
      folders: [{ id: 'f1', name: 'F' }, { id: 'f2', name: 'G', project: 'j1' }],
      projects: [{ id: 'j1', name: 'J' }],
      holes: [{ id: 'h1', name: 'H' }, { id: 'h2', name: 'I' }],
      hole: null,
    });
    expect(GALAXY_PERIOD).toBe(2400);
    const top = scene.bodies.filter((b) => b.parent === 'core' && ['hole', 'folder', 'project'].includes(b.role));
    expect(top.length).toBeGreaterThanOrEqual(4);
    for (const b of top) expect(b.orbit.speed).toBe(Math.PI * 2 / GALAXY_PERIOD);
  });

  it('the v2 scene is deterministic', () => {
    const input = {
      notes: [{ id: 'a', title: 'A', labels: ['x'] }, { id: 'b', title: 'B', folder: 'f1' }, { id: 'c', title: 'C', project: 'j1' }],
      folders: [{ id: 'f1', name: 'F' }, { id: 'f2', name: 'G', project: 'j1' }],
      projects: [{ id: 'j1', name: 'J' }],
      holes: [{ id: 'h1', name: 'H' }],
      hole: null,
    };
    const key = (s) => JSON.stringify(s.bodies.map((b) =>
      [b.id, b.parent, b.size, b.hue, b.orbit && [b.orbit.r, b.orbit.speed, b.orbit.phase]]));
    expect(key(buildScene(input))).toBe(key(buildScene(JSON.parse(JSON.stringify(input)))));
  });

  it('labelsOf lists every label in the scene, sorted and unique', () => {
    const scene = buildScene({
      notes: [
        { id: 'a', title: 'A', labels: ['zed', 'mid'] },
        { id: 'b', title: 'B', labels: ['mid', 'abc'] },
      ],
      folders: [], projects: [], holes: [], hole: null,
    });
    expect(labelsOf(scene)).toEqual(['abc', 'mid', 'zed']);
  });

  it('a black hole keeps one colour: its body in main space and its singularity agree', () => {
    const scene = buildScene({ notes: [], folders: [], projects: [], holes: [{ id: 'hx', name: 'X' }], hole: null });
    const inside = buildScene({ notes: [], hole: { id: 'hx', name: 'X' } });
    expect(scene.byId.get('hole:hx').hue).toBe(inside.byId.get('singularity').hue);
    expect(scene.byId.get('hole:hx').hue).toBe(hueOf('hole', 'hx'));
    expect(inside.byId.get('singularity')).toMatchObject({ kind: 'singularity', role: 'singularity', size: 2 });
    expect(scene.byId.get('core')).toMatchObject({ kind: 'core', role: 'core', size: 3.5 });
  });
});

describe('map v2 extra (Mistral)', () => {
  it('hueColor(h, paper) starts with hsl( for h = 0, 200, 359 on both white and black paper', () => {
    for (const h of [0, 200, 359]) {
      expect(hueColor(h, '#ffffff')).toMatch(/^hsl\(/);
      expect(hueColor(h, '#000000')).toMatch(/^hsl\(/);
    }
  });

  it('spanningTree on 10 points in a circle gives 9 links and every index 0-9 appears', () => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI * 2) / 10;
      pts.push({ x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 });
    }
    const links = spanningTree(pts);
    expect(links).toHaveLength(9);
    const seen = new Set();
    for (const [i, j] of links) {
      seen.add(i);
      seen.add(j);
    }
    expect(seen.size).toBe(10);
    for (let i = 0; i < 10; i++) expect(seen.has(i)).toBe(true);
  });

  it("hueOf('label', 'x') is the same twice and never in 85-150 for 50 different names", () => {
    for (let i = 0; i < 50; i++) {
      const name = 'label' + i;
      const h1 = hueOf('label', name);
      const h2 = hueOf('label', name);
      expect(h1).toBe(h2);
      expect(h1 < 85 || h1 > 150).toBe(true);
    }
  });
});

describe('map v2 spacing (owner, 2026-10-21: "planets in the second ring touch each other, more spacing in all rings"; "folders and projects sit too far away, no need")', () => {
  // A note system: how far from the note's centre the note or its farthest
  // label moon reaches.
  const systemOf = (scene, note) => {
    let sys = note.size;
    for (const b of scene.bodies) {
      if (b.parent === note.id && b.role === 'label') {
        sys = Math.max(sys, b.orbit.r + b.size);
      }
    }
    return sys;
  };
  const noSystemsTouch = (scene, times) => {
    const notes = scene.bodies.filter((b) => b.role === 'note');
    for (const t of times) {
      const at = notes.map((n) => ({ n, p: positionAt(scene, n.id, t), sys: systemOf(scene, n) }));
      for (let i = 0; i < at.length; i++) {
        for (let j = i + 1; j < at.length; j++) {
          const d = Math.hypot(at[i].p.x - at[j].p.x, at[i].p.y - at[j].p.y);
          expect(d).toBeGreaterThanOrEqual(at[i].sys + at[j].sys - 1e-6);
        }
      }
    }
  };
  const labelled = (count, labelsPer) => Array.from({ length: count }, (_, i) => ({
    id: 'n' + String(i).padStart(3, '0'),
    title: 'N' + i,
    labels: Array.from({ length: i % (labelsPer + 1) }, (_, l) => 'tag' + ((i + l) % 5)),
  }));

  it("a note's labels never cut into each other: one orbit, evenly spaced (owner, 2026-10-21)", () => {
    const labels = ['abc', 'add', 'broo', 'btr', 'e', 'f', 'g'];
    for (const n of [2, 4, 7]) {
      const scene = buildScene({
        notes: [{ id: 'n1', title: 'A', labels: labels.slice(0, n) }, { id: 'n2', title: 'B', folder: 'f', labels: labels.slice(0, n) }],
        folders: [{ id: 'f', name: 'F' }], projects: [], holes: [], hole: null,
      });
      for (const note of ['note:n1', 'note:n2']) {
        const moons = scene.bodies.filter((b) => b.parent === note && b.role === 'label');
        expect(moons).toHaveLength(n);
        expect(new Set(moons.map((m) => m.orbit.r)).size).toBe(1);
        expect(new Set(moons.map((m) => m.orbit.speed)).size).toBe(1);
        for (const t of [0, 7.3, 120]) {
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              const p = positionAt(scene, moons[i].id, t), q = positionAt(scene, moons[j].id, t);
              expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(2 * Math.max(moons[i].size, moons[j].size));
            }
            // and clear of their own note
            const p = positionAt(scene, moons[i].id, t), c = positionAt(scene, note, t);
            expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(scene.byId.get(note).size + moons[i].size);
          }
        }
      }
    }
  });

  it('loose notes with labels never touch, ring to ring (8, 20, 60 notes)', () => {
    for (const count of [8, 20, 60]) {
      const scene = buildScene({ notes: labelled(count, 3), folders: [], projects: [], holes: [], hole: null });
      noSystemsTouch(scene, [0, 3.7, 41]);
    }
  });

  it("folders' note moons never touch, on their rings and between them", () => {
    const notes = [];
    for (let f = 0; f < 3; f++) {
      for (let i = 0; i < 10; i++) {
        notes.push({ id: 'f' + f + 'n' + i, title: 'N', folder: 'fold' + f,
          labels: i % 3 ? ['x', 'y'] : [] });
      }
    }
    const scene = buildScene({
      notes,
      folders: [{ id: 'fold0', name: 'A' }, { id: 'fold1', name: 'B' }, { id: 'fold2', name: 'C' }],
      projects: [], holes: [{ id: 'h1', name: 'H' }], hole: null,
    });
    noSystemsTouch(scene, [0, 5.1, 88]);
  });

  it('projects, folders and holes sit close: ring gaps are just enough, never generous', () => {
    const notes = [];
    for (let i = 0; i < 12; i++) notes.push({ id: 'jn' + i, title: 'J', project: 'p' + (i % 2), labels: ['q'] });
    for (let i = 0; i < 8; i++) notes.push({ id: 'pn' + i, title: 'P', folder: 'pfold', labels: i % 2 ? ['r'] : [] });
    for (let i = 0; i < 6; i++) notes.push({ id: 'fn' + i, title: 'F', folder: 'free', labels: [] });
    const scene = buildScene({
      notes,
      folders: [{ id: 'free', name: 'Free' }, { id: 'pfold', name: 'PFolder', project: 'p0' }],
      projects: [{ id: 'p0', name: 'Zero' }, { id: 'p1', name: 'One' }],
      holes: [{ id: 'h1', name: 'H' }],
      hole: null,
    });
    noSystemsTouch(scene, [0, 2.2, 60]);

    // What each ring and system actually reaches, read back from the scene.
    const maxHole = Math.max(...scene.bodies.filter((b) => b.role === 'hole').map((b) => b.size));
    const holeRing = scene.byId.get('hole:h1').orbit.r;
    const extentOf = (body) => {
      let extent = body.size;
      for (const b of scene.bodies) {
        if (b.parent !== body.id) continue;
        if (b.role === 'note') extent = Math.max(extent, b.orbit.r + systemOf(scene, b));
        if (b.role === 'folder') extent = Math.max(extent, b.orbit.r + extentOf(b));
      }
      return extent;
    };
    const freeFolders = scene.bodies.filter((b) => b.role === 'folder' && b.parent === 'core');
    const maxFreeExtent = Math.max(...freeFolders.map((f) => extentOf(f)));
    const projects = scene.bodies.filter((b) => b.role === 'project');
    const maxProjExtent = Math.max(...projects.map((p) => extentOf(p)));

    // Free folders and project suns share one ring (owner, 2026-10-21: "the
    // projects are much too far away"): each just clear of the holes by its
    // own system, no further; and no two of them ever touch.
    const inner = holeRing + maxHole;
    const outer = [...freeFolders, ...projects];
    // One ring: every body's inner edge sits on the same circle, clear of the
    // holes, widened only as far as the ring needs to close.
    const base = outer[0].orbit.r - extentOf(outer[0]);
    for (const o of outer) {
      expect(o.orbit.r - extentOf(o)).toBeCloseTo(base, 6);
    }
    expect(base).toBeGreaterThanOrEqual(inner + 2 - 1e-6);
    expect(base).toBeLessThanOrEqual(inner * 1.5 + 3);
    for (const t of [0, 30, 900]) {
      for (let i = 0; i < outer.length; i++) {
        for (let j = i + 1; j < outer.length; j++) {
          const p = positionAt(scene, outer[i].id, t), q = positionAt(scene, outer[j].id, t);
          expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(extentOf(outer[i]) + extentOf(outer[j]) - 1e-6);
        }
      }
    }
    // A project is no longer pushed outside every free folder's system.
    expect(Math.max(...projects.map((p) => p.orbit.r))).toBeLessThan(freeFolders[0].orbit.r + maxFreeExtent + maxProjExtent);
  });
});

describe('mentions and loose-note colours (owner, 2026-10-21)', () => {
  it('contentMentions reads each @mention chip once, in order', async () => {
    const { contentMentions } = await import('../src/js/mentions.js');
    expect(contentMentions('<p>no chips</p>')).toEqual([]);
    expect(contentMentions('<p><a class="note-mention" data-note="x1">@X</a> and <a href="#" class="note-mention" data-note="y2">@Y</a> <a class="note-mention" data-note="x1">@X</a></p>'))
      .toEqual(['x1', 'y2']);
  });
  it('galaxyInput carries a note’s mentions, never itself', async () => {
    const { galaxyInput } = await import('../src/js/galaxy-ui.js');
    const input = galaxyInput({ notes: [
      { id: 'a', title: 'A', content: '<a class="note-mention" data-note="b">@B</a><a class="note-mention" data-note="a">@A</a>' },
      { id: 'b', title: 'B', content: '<p>x</p>' },
    ] });
    expect(input.notes[0].mentions).toEqual(['b']);
    expect(input.notes[1].mentions).toBeUndefined();
  });
  it('mentionLinks: from → to, only where both notes are on the map', () => {
    const scene = buildScene({ notes: [
      { id: 'a', title: 'A', mentions: ['b', 'zz'] },
      { id: 'b', title: 'B', mentions: ['a'] },
    ], folders: [], projects: [], holes: [], hole: null });
    expect(mentionLinks(scene)).toEqual([['a', 'b'], ['b', 'a']]);
  });
  it('mixColor moves a colour towards another; loose notes sit a shade under the white core', () => {
    expect(mixColor('#ffffff', '#000000', 0.3)).toBe('rgb(179, 179, 179)');
    expect(mixColor('rgb(0, 0, 0)', '#fff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(mixColor('nonsense', '#000', 0.3)).toBe('nonsense');
  });
});
