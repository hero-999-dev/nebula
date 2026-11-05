// Even rings (owner, 2026-10-21): "3 folders → equal distance between the 3,
// 4 → 4, 5 → 5"; a project's loose notes in the project's colour; the core a
// little bigger; and no two systems ever touch.
import { describe, it, expect } from 'vitest';
import { buildScene, positionAt, systemReach } from '../src/js/galaxy-model.js';

const TAU = Math.PI * 2;

function projectScene(nFolders, { notesPer = 2, loose = 3, extraProjects = 0, freeFolders = 0, holes = 0 } = {}) {
  const projects = [{ id: 'p1', name: 'P1' }];
  for (let i = 0; i < extraProjects; i++) projects.push({ id: `px${i}`, name: `PX${i}` });
  const folders = [];
  const notes = [];
  for (let i = 0; i < nFolders; i++) {
    folders.push({ id: `f${i}`, name: `F${i}`, project: 'p1' });
    for (let j = 0; j < notesPer + i; j++) notes.push({ id: `n${i}-${j}`, title: 'x', folder: `f${i}`, labels: j % 2 ? ['a'] : [] });
  }
  for (let i = 0; i < freeFolders; i++) {
    folders.push({ id: `free${i}`, name: `Free${i}` });
    for (let j = 0; j < 4 * (i + 1); j++) notes.push({ id: `fr${i}-${j}`, title: 'y', folder: `free${i}` });
  }
  for (let i = 0; i < loose; i++) notes.push({ id: `l${i}`, title: 'loose', project: 'p1' });
  for (let i = 0; i < 5; i++) notes.push({ id: `c${i}`, title: 'core' });
  const hs = [];
  for (let i = 0; i < holes; i++) hs.push({ id: `h${i}`, name: `H${i}` });
  return buildScene({ notes, folders, projects, holes: hs, hole: null });
}

const angleAround = (scene, id, centreId, t) => {
  const p = positionAt(scene, id, t);
  const c = positionAt(scene, centreId, t);
  return Math.atan2(p.y - c.y, p.x - c.x);
};

// Sorted angles round the centre; consecutive gaps (wrapping) should all be TAU/n.
function gaps(scene, ids, centreId, t) {
  const a = ids.map((id) => ((angleAround(scene, id, centreId, t) % TAU) + TAU) % TAU).sort((x, y) => x - y);
  return a.map((v, i) => (i + 1 < a.length ? a[i + 1] - v : a[0] + TAU - v));
}

// How far a body's whole system reaches from its centre, measured on the scene.
function reach(scene, rootId, t) {
  const root = positionAt(scene, rootId, t);
  let r = scene.byId.get(rootId).size;
  const inSystem = (b) => {
    for (let p = b.parent; p; p = scene.byId.get(p) && scene.byId.get(p).parent) if (p === rootId) return true;
    return false;
  };
  for (const b of scene.bodies) {
    if (!inSystem(b)) continue;
    const q = positionAt(scene, b.id, t);
    r = Math.max(r, Math.hypot(q.x - root.x, q.y - root.y) + b.size);
  }
  return r;
}

describe('even rings', () => {
  for (const n of [3, 4, 5]) {
    it(`${n} project folders sit TAU/${n} apart at t=0 and t=900`, () => {
      const scene = projectScene(n);
      const ids = scene.bodies.filter((b) => b.role === 'folder' && b.parent === 'project:p1').map((b) => b.id);
      expect(ids).toHaveLength(n);
      for (const t of [0, 900]) {
        for (const g of gaps(scene, ids, 'project:p1', t)) expect(g).toBeCloseTo(TAU / n, 6);
      }
    });
  }

  it('the outer ring (free folders and suns) is evenly divided', () => {
    const scene = projectScene(3, { extraProjects: 2, freeFolders: 2 });
    const ids = scene.bodies.filter((b) => b.parent === 'core' && (b.role === 'project' || b.role === 'folder')).map((b) => b.id);
    expect(ids).toHaveLength(5);
    for (const t of [0, 900]) {
      for (const g of gaps(scene, ids, 'core', t)) expect(g).toBeCloseTo(TAU / 5, 6);
    }
  });

  it('black holes are evenly divided', () => {
    const scene = projectScene(2, { holes: 3 });
    const ids = scene.bodies.filter((b) => b.kind === 'hole').map((b) => b.id);
    for (const g of gaps(scene, ids, 'core', 0)) expect(g).toBeCloseTo(TAU / 3, 6);
  });

  it("a project's loose notes carry the project's hue; the core's stay ink", () => {
    const scene = projectScene(3);
    const sun = scene.byId.get('project:p1');
    const loose = scene.bodies.filter((b) => b.role === 'note' && b.parent === 'project:p1');
    expect(loose).toHaveLength(3);
    for (const b of loose) expect(b.hue).toBe(sun.hue);
    for (const b of scene.bodies.filter((x) => x.role === 'note' && x.parent === 'core')) expect(b.hue).toBeNull();
  });

  it('the core is bigger than before (3) and its first ring stays clear', () => {
    const scene = projectScene(3);
    const core = scene.byId.get('core');
    expect(core.size).toBeGreaterThan(3);
    for (const b of scene.bodies.filter((x) => x.parent === 'core')) {
      expect(b.orbit.r - b.size).toBeGreaterThan(core.size);
    }
  });

  // Bug Find (1.0.3): "merkezin cemberi projectin cemberinin ic kisminda kaliyor, project cemberi tasiyor".
  it("the centre's circle holds every circle drawn inside it, a project's and its folders'", () => {
    const scene = projectScene(4, { notesPer: 6, extraProjects: 1, freeFolders: 2 });
    const of = new Map();
    // Listed children first, as a scene may be: the order must not leave any out.
    for (const x of [...scene.bodies].reverse()) if (x.parent) { if (!of.has(x.parent)) of.set(x.parent, []); of.get(x.parent).push(x); }
    const kidsOf = (id) => of.get(id) ?? [];
    const gap = 2;
    for (const t of [0, 300, 900]) {
      const posOf = (id) => positionAt(scene, id, t);
      const circle = (id) => systemReach(id, kidsOf, posOf, gap);
      const c = posOf('core');
      const outer = circle('core');
      for (const b of scene.bodies) {
        if (b.id === 'core' || !b.parent) continue;
        const r = circle(b.id);
        if (r === 0) continue;
        const p = posOf(b.id);
        expect(Math.hypot(p.x - c.x, p.y - c.y) + r + gap).toBeLessThanOrEqual(outer + 1e-9);
      }
      expect(outer).toBeGreaterThanOrEqual(reach(scene, 'core', t) - scene.byId.get('core').size);
    }
  });

  it('no two systems touch — project folders, outer ring and holes', () => {
    for (const opts of [{}, { extraProjects: 2, freeFolders: 3, holes: 2 }, { notesPer: 12, extraProjects: 1, freeFolders: 1 }]) {
      for (const n of [3, 4, 5]) {
        const scene = projectScene(n, opts);
        for (const t of [0, 900]) {
          const groups = [
            scene.bodies.filter((b) => b.role === 'folder' && b.parent === 'project:p1'),
            scene.bodies.filter((b) => b.parent === 'core' && b.role !== 'note'),
          ];
          for (const g of groups) {
            for (let i = 0; i < g.length; i++) {
              for (let j = i + 1; j < g.length; j++) {
                const a = positionAt(scene, g[i].id, t), b = positionAt(scene, g[j].id, t);
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                expect(d).toBeGreaterThanOrEqual(reach(scene, g[i].id, t) + reach(scene, g[j].id, t));
              }
            }
          }
        }
      }
    }
  });
});
