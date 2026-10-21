/**
 * The galaxy map's model half (1.0.0, v2 — the owner's redefined universe,
 * 2026-10-21): the scene, its orbit math and the hit test — everything about
 * WHERE things are and WHAT COLOUR they are, with nothing about how they look.
 *
 * The v2 hierarchy: projects are STARS (suns), folders are PLANETS, a folder's
 * notes are MOONS bound to their folder planet, notes that belong to no folder
 * stay PLANETS, and labels are little moons of their note. The whole map
 * slowly turns — every top-level body (holes, free folders, projects) rides
 * the same 40-minute orbit round the core, so the rings turn like one wheel
 * and nothing on them can ever collide.
 *
 * The layout is deterministic by contract: the same input builds the identical
 * scene. Ids are sorted before anything is placed, every decision that could
 * be random comes from a body's own seed through mulberry32, and Math.random
 * is never touched here. Sizes are jittered per body off that same seed, and
 * colours are assigned by role — a folder keeps its colour, a label is the
 * same colour on every note that carries it.
 *
 * Pure module: no DOM, no storage. The engine (galaxy-map.js) draws it, and
 * Claude's code supplies the input. Sizes are in world units.
 */

const TAU = Math.PI * 2;

/** One shared turn of every ring round the core: 40 minutes (the owner's
 * "EVERYTHING slowly orbits the centre, even far bodies — very slowly"). */
export const GALAXY_PERIOD = 2400;

/* Base sizes in world units, before the seeded per-body jitter. */
const SIZE = {
  core: 3.5, sun: 6, planet: 2.4, planetPinned: 3,
  folder: 3.6, noteMoon: 0.9, noteMoonPinned: 1.2,
  moon: 0.42, miniMoon: 0.24, hole: 5, singularity: 2,
};

/** FNV-1a, 32-bit -> uint32: a body's seed comes from its own id string. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: () => [0,1), seeded — the only randomness this module has. */
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The green band the owner disliked (2026-10-21): no body wears it. */
const GREEN_LO = 85, GREEN_HI = 150;
const inGreen = (h) => h >= GREEN_LO && h <= GREEN_HI;
const GOLDEN = 137.508;

/** Golden-angle hues off a start, walking past the green band. */
function hueWalk(start, count) {
  const out = [];
  let i = 0;
  while (out.length < count) {
    const h = (start + i * GOLDEN) % 360;
    i++;
    if (inGreen(h)) continue;
    out.push(h);
  }
  return out;
}

/**
 * A body's colour when it is a pure function of its name/id rather than of
 * the layout: labels (the same label is the same colour everywhere, the
 * owner's rule #4) and black holes (each its own colour, in the purples). A
 * label that hashes into the green band is shifted out of it by +70°.
 */
export function hueOf(role, key) {
  if (role === 'label') {
    let h = hashSeed('label:' + String(key)) % 360;
    if (inGreen(h)) h = (h + 70) % 360;
    return h;
  }
  if (role === 'hole') return 255 + (hashSeed(String(key)) % 90);
  return null;
}

/** Every label that appears in the scene, sorted and unique — the search's
 * index. Bodies carry their own `labels` too, so nothing walks moons. */
export function labelsOf(scene) {
  const seen = new Set();
  for (const b of scene.bodies) {
    if (b.role === 'note' && b.labels) for (const l of b.labels) seen.add(l);
  }
  return [...seen].sort();
}

/** The @mentions a note body carries: the ids it links to, each once, never itself. */
const mentionsField = (note) => {
  const ids = [...new Set((Array.isArray(note.mentions) ? note.mentions : []).filter((m) => m && m !== note.id))];
  return ids.length ? { mentions: ids } : {};
};

/**
 * The @mention links on this map: [from, to] note ids (refs), only where both
 * notes are on it. Each pair once, in body order. Pure — tested.
 */
export function mentionLinks(scene) {
  const here = new Set();
  for (const b of scene.bodies) if (b.role === 'note') here.add(b.ref);
  const out = [];
  for (const b of scene.bodies) {
    if (b.role !== 'note' || !b.mentions) continue;
    for (const to of b.mentions) if (here.has(to)) out.push([b.ref, to]);
  }
  return out;
}

const byString = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const noteLabels = (n) => [...new Set(n.labels || [])].sort(byString);

/**
 * An orbit: radius in world units, speed in rad/s, phase in radians. A note
 * turns in 60–180 s, a moon in 15–40 s — alive but slow, per the owner.
 */
function orbitOf(seedStr, r, periodMin, periodMax) {
  const r0 = rng(hashSeed(seedStr));
  const period = periodMin + r0() * (periodMax - periodMin);
  return { r, speed: TAU / period, phase: r0() * TAU };
}

/** Per-body look off the body's own seed: size jitter 0.85–1.15×, whether a
 * planet is ringed (~1 in 4), and its ring's roll in [0, π/4]. */
function lookOf(id) {
  const r = rng(hashSeed(id));
  return { jitter: 0.85 + 0.3 * r(), ringed: r() < 0.25, roll: r() * Math.PI / 4 };
}

/**
 * A note's own size and its SYSTEM radius — how far the note plus its farthest
 * label moon reaches — computed off the very seeds the bodies will be built
 * from, so the layout can promise exactly what gets drawn. The owner,
 * 2026-10-21: "planets in the second ring touch each other, more spacing in
 * all rings" — spacing now counts the whole system, not the bare planet, and
 * label moons share one tight orbit (labelRing) so systems stay compact.
 */
function noteSys(note, kind) {
  const planet = kind === 'planet';
  const base = planet
    ? (note.pinned ? SIZE.planetPinned : SIZE.planet)
    : (note.pinned ? SIZE.noteMoonPinned : SIZE.noteMoon);
  const size = base * lookOf(`note:${note.id}`).jitter;
  const ring = labelRing(note, size, planet ? SIZE.moon : SIZE.miniMoon);
  return { size, sys: ring ? ring.r + ring.maxSize : size };
}

/**
 * A note's label moons share ONE orbit: one radius, one speed, evenly spaced
 * phases — so they can never meet, however many there are (the owner,
 * 2026-10-21: "the labels cut into each other"). The radius clears the note
 * and gives neighbours a chord of at least three moon widths. Null when the
 * note has no labels.
 */
function labelRing(note, noteSize, base) {
  const labels = noteLabels(note);
  if (!labels.length) return null;
  const sizes = labels.map((label) => base * lookOf(`label:${note.id}:${label}`).jitter);
  const maxSize = Math.max(...sizes);
  const n = labels.length;
  const clearNote = noteSize * 1.45 + maxSize;
  const chord = n >= 2 ? (maxSize * 3) / (2 * Math.sin(Math.PI / n)) : 0;
  const r0 = rng(hashSeed(`labels:${note.id}`));
  return {
    labels, sizes, maxSize,
    r: Math.max(clearNote, chord),
    speed: TAU / (20 + r0() * 25),
    phase: r0() * TAU,
  };
}

/**
 * Planet rings that hold a FIXED 8 (the owner's rule #6: past a count, new
 * loose planets go farther out, not by packing the same width). A ring's
 * radius is what its widest system needs: the ring's own neighbours (8 even
 * fractions, so a chord of 2r·sin(π/8) between them), the parent body, and
 * the ring inside — the old 3.6·1.18^(k-1) gaps remain only as a floor.
 * Returns the rings, the outermost radius, and how far the outermost systems
 * reach (the edge the next ring out has to clear).
 */
/** The smallest ring on which n bodies TAU/n apart are `need` apart by chord. */
function evenRing(n, need) {
  return n >= 2 ? need / (2 * Math.sin(Math.PI / n)) : 0;
}

function loosePlan(list, parentSize) {
  const rings = [];
  let prevSys = 0, floor = 0;
  for (let k = 0; k * 8 < list.length; k++) {
    const count = Math.min(8, list.length - k * 8);
    const maxSys = Math.max(...list.slice(k * 8, k * 8 + count).map((n) => noteSys(n, 'planet').sys));
    floor = k === 0 ? parentSize * 2 + 4 : floor + 3.6 * Math.pow(1.18, k - 1);
    // A lone body on a ring has no ring-mate to clear (and sin(π/1) is 0).
    const chord = count >= 2 ? maxSys / Math.sin(Math.PI / count) : 0;
    let radius = Math.max(floor, chord, parentSize + maxSys + 0.5);
    if (k > 0) radius = Math.max(radius, rings[k - 1].radius + prevSys + maxSys + 0.5);
    rings.push({ radius, count });
    prevSys = maxSys;
  }
  const outer = rings.length ? rings[rings.length - 1].radius : 0;
  return { rings, outer, edge: outer + prevSys };
}

/**
 * Note-moon rings round a folder planet: cap 6+3k per ring, same clearance
 * rules as the loose rings — neighbours on a ring clear each other by chord,
 * neighbouring rings radially, the folder planet itself at the bottom.
 * `extent` is how far the whole system reaches past the folder's centre.
 */
function folderPlan(list, folderSize) {
  const rings = [];
  let idx = 0, k = 0, prevSys = 0;
  while (idx < list.length) {
    const count = Math.min(6 + 3 * (k + 1), list.length - idx);
    const maxSys = Math.max(...list.slice(idx, idx + count).map((n) => noteSys(n, 'moon').sys));
    // A lone body on a ring has no ring-mate to clear (and sin(π/1) is 0).
    const chord = count >= 2 ? maxSys / Math.sin(Math.PI / count) : 0;
    let radius = Math.max(folderSize * 1.6 + 2 + k * 2.2, chord, folderSize + maxSys + 0.5);
    if (k > 0) radius = Math.max(radius, rings[k - 1].radius + prevSys + maxSys + 0.5);
    rings.push({ radius, count });
    prevSys = maxSys;
    idx += count;
    k++;
  }
  const outer = rings.length ? rings[rings.length - 1].radius : 0;
  return { rings, outer, extent: rings.length ? outer + prevSys : folderSize };
}

/**
 * Build one dimension's scene. `input.hole` null => main space; otherwise the
 * hole's own dimension: a singularity, its notes as planets, their labels as
 * moons — nothing of main space reaches in, and hole notes never leak out.
 *
 * Main space: core at (0,0); loose notes on fixed-8 rings round it; holes on
 * the ring right outside them; free folders on a ring outside the holes, each
 * carrying its notes as moons; projects on the outermost ring as suns, each
 * holding its folders (planets, with note moons) and its own loose notes on
 * rings inside them. Every ring round the core turns at one shared
 * GALAXY_PERIOD speed, so the whole sky wheels while the inner systems live
 * their faster lives.
 */
export function buildScene(input = {}) {
  const notes = (input.notes || []).slice();
  const folders = (input.folders || []).slice();
  const projects = (input.projects || []).slice();
  const holes = (input.holes || []).slice();
  const bodies = [];
  const byId = new Map();
  const add = (b) => { bodies.push(b); byId.set(b.id, b); return b; };

  const folderIds = new Set(folders.map((f) => f.id));
  const projectIds = new Set(projects.map((p) => p.id));
  // Where a note truly lives: its folder if that folder exists, else its
  // project if that exists, else the core's loose rings.
  const homeOfNote = (n) => {
    if (n.folder && folderIds.has(n.folder)) return { parent: `folder:${n.folder}`, folder: n.folder };
    if (n.project && projectIds.has(n.project)) return { parent: `project:${n.project}`, folder: null };
    return { parent: 'core', folder: null };
  };

  const sceneRng = rng(hashSeed(input.hole ? `hole:${input.hole.id}` : 'nebula:galaxy:main'));
  const GALAXY_SPEED = TAU / GALAXY_PERIOD;

  /* Colours: projects off the golden angle from 205°, folders off 20° across
     all folders in sorted id order — both walking past the green band. */
  const sortedProjects = projects.slice().sort((a, b) => byString(a.id, b.id));
  const sortedFolders = folders.slice().sort((a, b) => byString(a.id, b.id));
  const projectHues = hueWalk(205, sortedProjects.length);
  const folderHues = hueWalk(20, sortedFolders.length);
  const folderHue = new Map(sortedFolders.map((f, i) => [f.id, folderHues[i]]));

  /* ---- body makers ---- */
  // A note drawn as a planet (loose around the core / a project sun / inside a
  // hole): theme ink, maybe ringed; its labels are moons on one shared
  // orbit just outside it, so a note and its moons read as one system.
  const addNotePlanet = (note, parentId, orbit, hue = null) => {
    const id = `note:${note.id}`;
    const look = lookOf(id);
    const size = (note.pinned ? SIZE.planetPinned : SIZE.planet) * look.jitter;
    const labels = noteLabels(note);
    add({
      id, kind: 'planet', role: 'note', ref: note.id,
      name: (note && note.title) || 'Untitled', labels,
      ...mentionsField(note),
      parent: parentId, orbit, size, hue, ringed: look.ringed,
      roll: look.ringed ? look.roll : 0,
      seed: hashSeed(id),
    });
    addLabelMoons(note, id, size, SIZE.moon);
  };
  // A note drawn as a moon of its folder's planet: the folder's colour, no
  // rings; its labels are tinier moons on one shared orbit.
  const addNoteMoon = (note, parentId, orbit, hue) => {
    const id = `note:${note.id}`;
    const look = lookOf(id);
    const size = (note.pinned ? SIZE.noteMoonPinned : SIZE.noteMoon) * look.jitter;
    const labels = noteLabels(note);
    add({
      id, kind: 'moon', role: 'note', ref: note.id,
      name: (note && note.title) || 'Untitled', labels,
      ...mentionsField(note),
      parent: parentId, orbit, size, hue, ringed: false, roll: 0,
      seed: hashSeed(id),
    });
    addLabelMoons(note, id, size, SIZE.miniMoon);
  };
  // Label moons: one per (note, label), the label's own colour everywhere,
  // evenly spaced on the note's one label orbit (labelRing).
  function addLabelMoons(note, noteId, noteSize, base) {
    const ring = labelRing(note, noteSize, base);
    if (!ring) return;
    ring.labels.forEach((label, i) => {
      const id = `label:${note.id}:${label}`;
      add({
        id, kind: 'moon', role: 'label', ref: label, name: label,
        parent: noteId,
        orbit: { r: ring.r, speed: ring.speed, phase: ring.phase + (TAU * i) / ring.labels.length },
        size: ring.sizes[i], hue: hueOf('label', label),
        seed: hashSeed(id),
      });
    });
  }
  // A folder body: a planet — free ones round the core, the rest round their
  // project sun — in the folder's own colour.
  const folderBody = (f, parent, orbit) => {
    const id = `folder:${f.id}`;
    const look = lookOf(id);
    return add({
      id, kind: 'planet', role: 'folder', ref: f.id, name: f.name || '',
      parent, orbit, size: SIZE.folder * look.jitter, hue: folderHue.get(f.id) ?? null,
      ringed: look.ringed, roll: look.ringed ? look.roll : 0, seed: hashSeed(id),
    });
  };

  /* Notes of one folder: the rings come from folderPlan (clearance-sized);
     one shared speed per ring at even fractions, so ring-mates never meet. */
  const emitFolderNotes = (plan, list, folderId, hue) => {
    let idx = 0;
    plan.rings.forEach((ring, k) => {
      const base = orbitOf(`${folderId}:ring:${k + 1}`, ring.radius, 60, 180);
      for (let j = 0; j < ring.count; j++) {
        addNoteMoon(list[idx + j], folderId,
          { r: ring.radius, speed: base.speed, phase: base.phase + (TAU * j) / ring.count }, hue);
      }
      idx += ring.count;
    });
  };
  /* Loose planet rings round a parent (the core, a project sun, a
     singularity): the rings come from loosePlan, one shared speed each. */
  const emitLooseRings = (plan, list, parentId, hue = null) => {
    plan.rings.forEach((ring, k) => {
      const base = orbitOf(`${parentId}:ring:${k + 1}`, ring.radius, 60, 180);
      for (let j = 0; j < ring.count; j++) {
        addNotePlanet(list[k * 8 + j], parentId,
          { r: ring.radius, speed: base.speed, phase: base.phase + (TAU * j) / ring.count }, hue);
      }
    });
  };

  /* ================= the hole's own dimension ================= */
  if (input.hole) {
    add({
      id: 'singularity', kind: 'singularity', role: 'singularity', ref: input.hole.id,
      name: input.hole.name || '', parent: null, x: 0, y: 0,
      size: SIZE.singularity, hue: hueOf('hole', input.hole.id), seed: hashSeed('singularity'),
    });
    const holeNotes = notes.slice().sort((a, b) => byString(a.id, b.id));
    emitLooseRings(loosePlan(holeNotes, SIZE.singularity), holeNotes, 'singularity');
    return { kind: 'hole', holeId: input.hole.id, bodies, byId };
  }

  /* ================= main space ================= */
  add({
    id: 'core', kind: 'core', role: 'core', ref: null, name: '', labels: [],
    parent: null, x: 0, y: 0, size: SIZE.core, hue: null, seed: hashSeed('core'),
  });

  const sortedNotes = notes.slice().sort((a, b) => byString(a.id, b.id));
  const notesOfFolder = new Map();
  const looseOfProject = new Map();
  const looseAroundCore = [];
  for (const n of sortedNotes) {
    const home = homeOfNote(n);
    if (home.folder) {
      if (!notesOfFolder.has(home.folder)) notesOfFolder.set(home.folder, []);
      notesOfFolder.get(home.folder).push(n);
    } else if (home.parent.startsWith('project:')) {
      const pid = home.parent.slice(8);
      if (!looseOfProject.has(pid)) looseOfProject.set(pid, []);
      looseOfProject.get(pid).push(n);
    } else {
      looseAroundCore.push(n);
    }
  }

  // Loose notes: fixed-8 rings round the core, sized by their systems, in
  // theme ink. `edge` is where the loose systems end — everything outside
  // starts from there.
  const loosePlanCore = loosePlan(looseAroundCore, SIZE.core);
  emitLooseRings(loosePlanCore, looseAroundCore, 'core');
  const looseEdge = looseAroundCore.length ? loosePlanCore.edge : SIZE.core;

  /* Black holes: on the ring right outside the loose notes, orbiting the core
     like everything else, with just room enough to clear them. A locked hole
     is its initials and nothing else. */
  const sortedHoles = holes.slice().sort((a, b) => byString(a.id, b.id));
  const holeLook = (h) => {
    const id = `hole:${h.id}`;
    return { size: SIZE.hole * lookOf(id).jitter };
  };
  const maxHole = sortedHoles.reduce((m, h) => Math.max(m, holeLook(h).size), 0);
  // Evenly divided (owner, 2026-10-21: "3 → equal distance between the 3"):
  // n holes sit TAU/n apart; the ring grows until neighbours clear by chord.
  const holeStart = sceneRng() * TAU;
  const holeRing = Math.max(looseEdge + maxHole + 2,
    evenRing(sortedHoles.length, 2 * maxHole + 2));
  const placedHoles = sortedHoles.map((h, i) => ({ h, theta: holeStart + (TAU * i) / sortedHoles.length }));
  for (const { h, theta } of placedHoles) {
    const id = `hole:${h.id}`;
    add({
      id, kind: 'hole', role: 'hole', ref: h.id,
      name: h.locked ? (h.initials || '') : (h.name || ''),
      parent: 'core', orbit: { r: holeRing, speed: GALAXY_SPEED, phase: theta },
      size: holeLook(h).size, hue: hueOf('hole', h.id),
      locked: !!h.locked, initials: h.initials, seed: hashSeed(id),
    });
  }

  /* Free folders: planets on a ring outside the holes, each with its notes
     as moons round it. */
  const freeFolders = sortedFolders.filter((f) => !f.project || !projectIds.has(f.project));
  const projFolders = new Map();
  for (const p of sortedProjects) projFolders.set(p.id, []);
  for (const f of sortedFolders) {
    if (f.project && projectIds.has(f.project)) projFolders.get(f.project).push(f);
  }
  /* Every folder's note-ring plan, computed once: the rings' clearance-sized
     radii drive both the extents the outer rings are spaced by and the
     bodies themselves (owner, 2026-10-21: "folders and projects sit too far
     away, no need" — the gaps are now just enough to not overlap). */
  const plansOfFolder = new Map();
  const extentOfFolder = new Map();
  for (const f of sortedFolders) {
    const list = notesOfFolder.get(f.id) || [];
    const size = SIZE.folder * lookOf(`folder:${f.id}`).jitter;
    const plan = folderPlan(list, size);
    plansOfFolder.set(f.id, plan);
    extentOfFolder.set(f.id, plan.extent);
  }

  /* Projects: suns, their folders as planets round the sun (one shared speed
     so their spacing holds), their loose notes on fixed-8 rings inside the
     folders. Laid out here, placed below with the free folders. */
  const projectLayouts = [];
  for (const p of sortedProjects) {
    const sunSize = SIZE.sun * lookOf(`project:${p.id}`).jitter;
    const suns = projFolders.get(p.id);
    const loose = looseOfProject.get(p.id) || [];
    const maxFE = suns.length
      ? Math.max(...suns.map((f) => extentOfFolder.get(f.id))) : 0;
    const looseP = loosePlan(loose, sunSize);
    const pRng = rng(hashSeed(`project:${p.id}`));
    const speed = TAU / (300 + pRng() * 300);        // folders: one turn in 5–10 minutes
    const startPhase = pRng() * TAU;
    // The folders' ring: far enough out to clear the sun's loose rings, then
    // grown until n folders TAU/n apart clear each other. Packing them by
    // extent bunched three folders at the bottom of a roomy ring (owner,
    // 2026-10-21: "the top stays empty — divide everything evenly").
    const ring = Math.max(maxFE + 2, looseP.edge + maxFE + 2, sunSize + maxFE + 2,
      evenRing(suns.length, 2 * maxFE + 2));
    const sunThetas = suns.map((_, i) => startPhase + (TAU * i) / suns.length);
    const extent = suns.length ? ring + maxFE : (loose.length ? looseP.edge : sunSize);
    projectLayouts.push({ p, sunSize, suns, sunThetas, ring, speed, extent, loose, looseP });
  }
  /* Free folders and project suns share ONE ring outside the holes (the
     owner, 2026-10-21, twice: "projects are much too far away"): each sits
     just far enough out for its own system to clear the holes — a small
     folder close in, a big project a little further — and the angular gaps
     are sized by chord so neighbours clear each other even on different
     radii. All of them turn at GALAXY_SPEED, so the gaps hold for ever. */
  const outer = [
    ...freeFolders.map((f) => ({ folder: f, extent: extentOfFolder.get(f.id) })),
    ...projectLayouts.map((l) => ({ project: l, extent: l.extent })),
  ];
  let innerEdge = sortedHoles.length ? holeRing + maxHole : looseEdge;
  const outerStart = sceneRng() * TAU;
  // Even angles, TAU/n apart (owner, 2026-10-21); each body still sits at
  // its own radius, so the inner edge grows until every pair of neighbours
  // (the last and first too) clears by straight-line distance.
  const radius = (o) => innerEdge + 2 + o.extent;
  const step = outer.length ? TAU / outer.length : 0;
  const crowded = () => outer.some((a, i) => {
    const b = outer[(i + 1) % outer.length];
    const ra = radius(a), rb = radius(b);
    const d = Math.sqrt(Math.max(0, ra * ra + rb * rb - 2 * ra * rb * Math.cos(step)));
    return d < a.extent + b.extent + 2;
  });
  for (let tries = 0; tries < 200 && outer.length > 1 && crowded(); tries++) {
    innerEdge = innerEdge * 1.05 + 0.5;              // grow just enough to fit
  }
  const placedOuter = outer.map((o, i) => ({ o, theta: outerStart + step * i, r: radius(o) }));
  for (const { o, theta, r } of placedOuter) {
    const orbit = { r, speed: GALAXY_SPEED, phase: theta };
    if (o.folder) {
      const body = folderBody(o.folder, 'core', orbit);
      emitFolderNotes(plansOfFolder.get(o.folder.id), notesOfFolder.get(o.folder.id) || [], body.id, body.hue);
      continue;
    }
    const l = o.project;
    const id = `project:${l.p.id}`;
    add({
      id, kind: 'sun', role: 'project', ref: l.p.id, name: l.p.name || '',
      parent: 'core', orbit,
      size: l.sunSize, hue: projectHues[sortedProjects.indexOf(l.p)], seed: hashSeed(id),
    });
    l.suns.forEach((f, i) => {
      const body = folderBody(f, id, { r: l.ring, speed: l.speed, phase: l.sunThetas[i] });
      emitFolderNotes(plansOfFolder.get(f.id), notesOfFolder.get(f.id) || [], body.id, body.hue);
    });
    // A project's loose notes wear its colour, not the core's ink (owner, 2026-10-21).
    emitLooseRings(l.looseP, l.loose, id, projectHues[sortedProjects.indexOf(l.p)]);
  }

  return { kind: 'main', holeId: null, bodies, byId };
}

/**
 * Where a body is at t seconds: walk up its parent chain to a fixed body and
 * add the orbit offsets on the way down. Chains are short (a label sits on a
 * note on a folder on a project at most), so this stays cheap per body.
 */
export function positionAt(scene, bodyId, tSec) {
  const target = scene.byId.get(bodyId);
  if (!target) return null;
  const chain = [];
  for (let b = target, depth = 0; b && depth < 8; b = b.parent && scene.byId.get(b.parent), depth++) {
    chain.push(b);
  }
  let x = 0, y = 0;
  for (let i = chain.length - 1; i >= 0; i--) {
    const b = chain[i];
    if (b.parent) {
      const a = b.orbit.phase + b.orbit.speed * tSec;
      x += Math.cos(a) * b.orbit.r;
      y += Math.sin(a) * b.orbit.r;
    } else {
      x = b.x;
      y = b.y;
    }
  }
  return { x, y };
}

/**
 * Which body is under a world point, if any: the nearest body whose disc
 * (size + slop) covers it wins, and when several overlap the smallest wins —
 * so a note moon stays clickable inside its folder system and a label stays
 * clickable over its own note.
 */
export function bodyAt(scene, x, y, tSec, slop = 0) {
  let best = null, bestSize = Infinity;
  for (const b of scene.bodies) {
    const p = positionAt(scene, b.id, tSec);
    if (!p) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= b.size + slop && b.size < bestSize) { best = b.id; bestSize = b.size; }
  }
  return best;
}

/** The world rectangle everything sits in at t, with each body's size added. */
export function boundsOf(scene, tSec) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of scene.bodies) {
    const p = positionAt(scene, b.id, tSec);
    if (!p) continue;
    minX = Math.min(minX, p.x - b.size); maxX = Math.max(maxX, p.x + b.size);
    minY = Math.min(minY, p.y - b.size); maxY = Math.max(maxY, p.y + b.size);
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/**
 * The camera target that frames a body together with everything that orbits
 * it (and their own moons). `zoom` is the reciprocal of that system's world
 * half-extent, floored so a lone moon is not blown up to pixel size; the
 * engine's convention is px-per-world = zoom * 0.175 * min(canvas w, h).
 */
export function focusFor(scene, bodyId, tSec) {
  const body = scene.byId.get(bodyId);
  if (!body) return null;
  const centre = positionAt(scene, bodyId, tSec);
  let extent = body.size;
  for (const b of scene.bodies) {
    let cur = b, depth = 0, inside = false;
    while (cur && depth < 8) {
      if (cur === body) { inside = true; break; }
      cur = cur.parent ? scene.byId.get(cur.parent) : null;
      depth++;
    }
    if (!inside) continue;
    const p = positionAt(scene, b.id, tSec);
    if (p) extent = Math.max(extent, Math.hypot(p.x - centre.x, p.y - centre.y) + b.size);
  }
  extent = Math.max(extent, 1.5);
  return { x: centre.x, y: centre.y, zoom: 1 / extent };
}
