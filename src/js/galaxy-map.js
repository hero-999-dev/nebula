/**
 * The galaxy map's engine (1.0.0): the half that draws. A canvas of ASCII art —
 * every body is glyphs from galaxy-ascii.js placed by galaxy-model.js — with a
 * camera you drag, zoom and focus, orbit time ticking at ~14 fps, and the
 * constellation sky behind it: a seeded starfield, and every 5–10 minutes a
 * tiny shooting star or rocket crossing.
 *
 * The engine never reads or writes notes and never touches storage: all data
 * comes in through `getInput(holeId)`, and the only thing it hands back out is
 * the camera (`view()`) for Claude to persist. A locked black hole leaks
 * nothing either: if `refresh()` finds the dimension's hole gone from the
 * input's unlocked list, the hole scene and every cached frame are dropped on
 * the spot, and a lock during the pull-in animation aborts back to main space.
 *
 * Budget (spec addendum #3): target ~6 ms a frame at 500 notes + 1500 labels.
 * Positions are memoised once per frame, bodies outside the view are culled,
 * bodies under ~10 px are a single glyph, only the largest visible bodies get
 * full ASCII frames, and those frames are shared — the cache key is
 * (kind, cols, rows, frame, ring, seed % 8) in an LRU capped at 400 — so two
 * planets of a size cost one frame.
 *
 * Map v2 (owner, 2026-10-21): projects are stars, folders planets, a folder's
 * notes its moons, loose notes planets round the core, labels the moons of
 * their notes. Every project, folder, label and hole has its own hue from the
 * model; the engine turns a hue into a colour that suits the theme (lighter
 * on a dark paper, deeper on a light one) and draws a null hue in the ink.
 * Picked labels are constellations: their notes joined by a thin minimum
 * spanning tree in the label's colour, ringed, everything else dimmed.
 */

import { buildScene, positionAt, boundsOf, focusFor, hueOf, labelsOf, mentionLinks } from './galaxy-model.js';
import { RAMP, sphere, sun, vortex, core, stars, shot, cacheKey, frameIndex,
  ROCKET_BODY, ROCKET_BURN } from './galaxy-ascii.js';

const TICK_MS = 70;          // ASCII frames at ~14 fps, like Constellation
const FRAME_CACHE_MAX = 400; // LRU cap on ASCII frames (addendum #3)
const ART_BODIES_MAX = 28;   // how many visible bodies may draw full frames
const ART_MIN_R = 5;         // a sun, planet or hole this big on screen is drawn as art, not a dot
const HOVER_SPIN = 2.4;      // extra radians a second for the body under the pointer
const MIN_TARGET_PX = 10;    // smallest thing a click can aim at (addendum #4)
const MOON_CLICK_PX = 4;     // a moon must be this big on screen to be a target
const NAME_MAX = 18;         // body names truncate to this on canvas (addendum #5)
const PX_PER_WORLD = 0.175;  // px-per-world = zoom * this * min(w, h) — matches focusFor
const DIM_ALPHA = 0.35;      // what is not in a picked constellation fades to this
const HALO_MAX = 3;          // halo rings round one note at most; more shows as "+N"
const LINK_MAX = 400;        // a constellation joins at most this many notes
const HOP_MS = 1200;          // the minimap's glide to the note just opened (650 read as a jerk)
const LOOSE_SHADE = 0.3;     // loose notes: the ink this far towards the paper
const NOTE_FRAME = 1.7;      // a selected note's system fills 1/1.7 of what a folder's would
/** The search's key for a note's @mentions — never a label name (labels have no control characters). */
export const MENTION_KEY = '\u0001@';
export const mentionKey = (noteId) => MENTION_KEY + noteId;
const PICK_MAX = 6;
const SHOT_EVERY_MS = 60000;      // a shooting star about once a minute…
const SHOT_MS = 900;              // …and fast
const ROCKET_EVERY_MS = 300000;   // a rocket every five minutes
const ROCKET_SPEED = 2.2;         // world units a second, once out of the launch
const ROCKET_EASE = 5;            // seconds to get up to speed
const ROCKET_LIFE_S = 150;
const ROCKET_H = 0.7;             // its height in world units: under a moon's 0.84          // at most this many labels are lit at once (Codex 25 #2)
const LINK_EVERY_MS = 1000;  // a constellation's tree is rebuilt at most this often
const DIVE_MS = 1100;        // the pull-in into a black hole
const DIVE_MS_REDUCED = 700; // ... under reduced motion: shorter, never skipped

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = (p) => 1 - Math.pow(1 - p, 3);

/** What a body is, for scenes built before roles existed. */
const roleOf = (b) => b.role || (b.kind === 'sun' ? 'folder' : b.kind === 'planet' ? 'note' : b.kind === 'moon' ? 'label' : b.kind);
/** A note shown as a moon (a folder's note) is a body in its own right; only
 * labels are the small satellites that hand their clicks to their note. */
const isLabelMoon = (b) => b.kind === 'moon' && roleOf(b) === 'label';

/** A hue (degrees) as a colour that sits on the theme's paper: light and soft
 * on a dark paper, deeper on a light one. Memoised: the draw asks every frame. */
const hueCache = new Map();
/** A CSS colour (#rgb, #rrggbb, rgb()/rgba()) as [r, g, b], or null. */
function rgbOf(css) {
  const t = String(css ?? '').trim();
  let m = /^#([0-9a-f]{6})$/i.exec(t);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t);
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
  m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(t);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function luminance(css) {
  const [r, g, b] = rgbOf(css) || [20, 22, 26];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
/** a moved the share t of the way towards b; a itself when either is unreadable. Memoised. */
const mixCache = new Map();
export function mixColor(a, b, t) {
  const key = a + '|' + b + '|' + t;
  let col = mixCache.get(key);
  if (col) return col;
  const p = rgbOf(a), q = rgbOf(b);
  col = p && q ? `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * t)).join(', ')})` : a;
  if (mixCache.size > 64) mixCache.clear();
  mixCache.set(key, col);
  return col;
}
export function hueColor(hue, paper) {
  const key = hue + '|' + paper;
  let col = hueCache.get(key);
  if (col) return col;
  const dark = luminance(paper) < 0.5;
  const h = ((Math.round(hue) % 360) + 360) % 360;
  col = dark ? `hsl(${h}, 52%, 70%)` : `hsl(${h}, 48%, 40%)`;
  if (hueCache.size > 2000) hueCache.clear();
  hueCache.set(key, col);
  return col;
}

/** Prim's minimum spanning tree over screen points: n-1 links, no crossings
 * of the kind a full mesh draws. Ties go to the lower index, so the same
 * scene always draws the same lines. Returns [i, j] index pairs. */
export function spanningTree(points) {
  const n = points.length;
  if (n < 2) return [];
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const links = [];
  best[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
    inTree[u] = 1;
    if (from[u] >= 0) links.push([from[u], u]);
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const d = (points[u].x - points[v].x) ** 2 + (points[u].y - points[v].y) ** 2;
      if (d < best[v]) { best[v] = d; from[v] = u; }
    }
  }
  return links;
}

/** Which glyph a body shrinks to when it is too small for art. */
function tinyGlyph(b) {
  if (b.kind === 'planet') return b.size > 2.5 ? '@' : 'o';
  if (b.kind === 'moon') return isLabelMoon(b) ? RAMP[3] : 'o';
  if (b.kind === 'sun' || b.kind === 'core' || b.kind === 'singularity') return '*';
  if (b.kind === 'hole') return '@';
  return RAMP[2];
}
/** A body's ASCII art kind, and whether a planet shows rings (seeded). */
/** How fast a body turns on its axis, radians a second: a planet in 10–20 s, a sun slower. */
function spinRate(b) {
  if (b.kind === 'sun') return 0.16 + (b.seed % 5) * 0.025;
  return 0.3 + (b.seed % 8) * 0.035;
}
function artKind(b) {
  if (b.kind === 'sun') return 'sun';
  if (b.kind === 'hole' || b.kind === 'singularity') return 'vortex';
  if (b.kind === 'core') return 'core';
  return 'sphere';
}

export function createGalaxyMap(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;                       // addendum #9: Claude hides the map
  const getInput = opts.getInput || (() => null);
  const getColors = opts.colors || (() => ({ ink: '#cfcfcf', faint: '#8a8a8a', accent: '#9ac2e8',
    fern: '#9ab97a', madder: '#c98a8a', paper: '#14161a' }));
  const onContext = opts.onContext || (() => {});
  const onEnterHole = opts.onEnterHole || (async () => true);
  const onDimension = opts.onDimension || (() => {});
  const mini = !!opts.mini;
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- state ---------- */
  let W = 0, H = 0, dpr = 1;
  let cellW = 8, cellH = 14, baseFont = '';
  let scene = null;
  let holeId = null;                 // current dimension (addendum #2/#8)
  let cam = { x: 0, y: 0, zoom: 0.05 };
  let savedMainCam = null;           // the camera to come back to from a hole
  let tween = null;                  // {from,to,start,dur} camera glide
  let followId = null;               // note id the camera tracks (mini mode)
  let hop = null;                    // the minimap's glide from one note to the next {from, zoom, start, dur}
  let selected = null;               // body id with a selection ring (a11y)
  let namesShown = opts.names !== false; // "Hide names" beside Fit (owner, 2026-10-21)
  // The camera is the map's own until a hand moves it: then the big map fills
  // whatever pane it is in, refitted on every resize (owner, 2026-10-20:
  // "tam ekrana fitlensin, yan ekrana alınca ekran ona göre fitlensin"), and
  // the minimap frames the open note's sun system. A drag, the wheel, the
  // arrow keys or a click on a body hand the camera over until "Show the
  // whole map" or Escape gives it back.
  let auto = true;
  let savedMainAuto = true;
  // Both clocks run under reduced motion too, only slower: a map that never
  // moves reads as broken (Constellation's gate does the same), and Windows
  // with "Animation effects" off asks every app for reduced motion.
  let orbitT = 0;                    // orbit clock
  let animT = 0;                     // flicker/pulse/turn clock
  let hoverId = null;                // the body under the pointer turns faster
  let hoverAt = -1e9;
  const spinBoost = new Map();       // body id -> extra turn it has been given
  let start = 0;                     // performance.now at first frame
  let raf = 0, lastTick = 0, running = true, inView = true, destroyed = false;
  let entering = null;               // {holeId, from, to, start, dur} pull-in
  let picked = [];                   // the labels whose constellations are drawn
  const tiny = [new Map(), new Map()]; // tiny bodies by colour, bright and dimmed — kept between frames
  let lit = null;                    // {scene, labels, members: Map<label, body[]>, ids: Set}
  let system = null;                 // {scene, id, ids: body ids bound to the selected body}
  let backdrop = null;               // main space, seen from inside a hole
  let eventState = null;             // the shooting star in flight (screen space)
  let rocket = null;                 // the rocket in flight (world space): {start, x0, y0, ux, uy, burn, lastBurn, followed}
  let nextShotAt = 0, nextRocketAt = 0;
  let starCache = null;              // {key, list}
  let sceneKey = null;               // what refresh() last built the scene from

  const frameCache = new Map();      // LRU: Map keeps insertion order = recency
  function cached(key, make) {
    const hit = frameCache.get(key);
    if (hit !== undefined) { frameCache.delete(key); frameCache.set(key, hit); return hit; }
    const made = make();
    frameCache.set(key, made);
    if (frameCache.size > FRAME_CACHE_MAX) frameCache.delete(frameCache.keys().next().value);
    return made;
  }
  const dropCaches = () => { frameCache.clear(); starCache = null; };

  const ppw = () => cam.zoom * PX_PER_WORLD * Math.max(1, Math.min(W, H));
  const toScreen = (x, y) => {
    const k = ppw();
    return { x: (x - cam.x) * k + W / 2, y: (y - cam.y) * k + H / 2 };
  };
  const toWorld = (mx, my) => {
    const k = ppw();
    return { x: (mx - W / 2) / k + cam.x, y: (my - H / 2) / k + cam.y };
  };

  /* ---------- scene ---------- */
  // The whole scene, filling the pane edge to edge in both directions: a wide
  // pane is used across its width, not only its shorter side.
  const overviewCam = () => {
    if (!scene) return { ...cam };
    const b = boundsOf(scene, orbitT);
    const hw = (b.maxX - b.minX) / 2 || 1;
    const hh = (b.maxY - b.minY) / 2 || 1;
    const zoom = W && H
      ? Math.min((0.47 * W) / hw, (0.47 * H) / hh) / (PX_PER_WORLD * Math.min(W, H))
      : 0.45 / (PX_PER_WORLD * Math.max(hw, hh));
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, zoom: clamp(zoom, 0.01, 10) };
  };
  // The camera the map chooses for itself: the minimap rides the open note
  // with its sun's whole system in view, the big map shows everything.
  const autoCam = () => {
    if (mini && followId && scene) {
      const body = scene.byId.get('note:' + followId);
      if (body) {
        const sun = body.parent && scene.byId.get(body.parent);
        const home = sun && (roleOf(sun) === 'folder' || roleOf(sun) === 'project');
        const sys = home ? focusFor(scene, sun.id, orbitT) : null;
        const p = positionAt(scene, body.id, orbitT);
        const own = focusFor(scene, body.id, orbitT);
        // Its sun's system across about 60% of the minimap's shorter side.
        const zoom = sys ? sys.zoom * 1.7 : (own ? own.zoom * 0.6 : cam.zoom);
        return { x: p.x, y: p.y, zoom: clamp(Math.max(zoom, overviewCam().zoom), 0.01, 10) };
      }
    }
    return overviewCam();
  };
  const fit = () => {
    auto = true;
    tween = null;
    if (!entering) cam = autoCam();
    wake();
  };
  const handOver = () => { auto = false; };
  const setDimension = (id, keepCam) => {
    holeId = id;
    scene = buildScene(getInput(id) || {});
    picked = [];                                  // a constellation belongs to one space
    rocket = null;                                // and so does a rocket
    backdrop = null;
    dropCaches();                                 // hole frames must not survive a lock
    if (!keepCam) cam = overviewCam();
    onDimension(id);
  };
  const buildMain = (keepCam) => {
    scene = buildScene(getInput(null) || {});
    holeId = null;
    picked = [];
    backdrop = null;
    if (!keepCam) cam = overviewCam();
    onDimension(null);
  };

  /* ---------- camera ---------- */
  const glideTo = (to, dur) => { tween = { from: { ...cam }, to, start: performance.now(), dur }; };
  const stepTween = (now) => {
    if (entering) {
      const p = clamp((now - entering.start) / entering.dur, 0, 1);
      const e = easeOut(p);
      cam.x = entering.from.x + (entering.to.x - entering.from.x) * e;
      cam.y = entering.from.y + (entering.to.y - entering.from.y) * e;
      cam.zoom = entering.from.zoom * Math.pow(entering.to.zoom / entering.from.zoom, e);
      // The spiral: the camera circles the hole as it falls in, tightening.
      const sway = (1 - e) * Math.sin(e * 9) * 6;
      cam.x += sway * 0.2; cam.y += sway * 0.14;
      if (p >= 1) { const done = entering; entering = null; done.finish(); }
      return;
    }
    if (tween) {
      const p = clamp((now - tween.start) / tween.dur, 0, 1);
      const e = easeOut(p);
      cam.x = tween.from.x + (tween.to.x - tween.from.x) * e;
      cam.y = tween.from.y + (tween.to.y - tween.from.y) * e;
      cam.zoom = tween.from.zoom + (tween.to.zoom - tween.from.zoom) * e;
      if (p >= 1) tween = null;
    }
  };

  /* ---------- measurement ---------- */
  function resize() {
    dpr = (window.devicePixelRatio || 1);
    const was = W + 'x' + H;
    W = canvas.clientWidth || 0;
    H = canvas.clientHeight || 0;
    // A pane that changed size is filled again — unless a hand has the camera.
    if (auto && !entering && scene && W && H && was !== W + 'x' + H) {
      if (tween) tween.to = autoCam();
      else cam = autoCam();
    }
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const style = getComputedStyle(canvas);
    const mono = (style.getPropertyValue('--mono') || '').trim() || 'ui-monospace, Consolas, monospace';
    const fs = mini ? 9 : 13;
    baseFont = fs + 'px ' + mono;
    ctx.font = baseFont;
    cellW = ctx.measureText('M').width || fs * 0.6;
    cellH = Math.round(fs * 1.1);
    starCache = null;
    draw(performance.now(), true);
  }

  /* ---------- drawing ---------- */
  /* Positions live in one persistent map, updated in place: a 2000-body scene
   * at 14 fps would otherwise hand the garbage collector 28 000 objects a
   * second, and those pauses were the frame budget's worst spikes. Safe
   * because buildScene always emits a body before the bodies that orbit it,
   * so one forward pass sees every parent before its children. */
  let posMap = new Map();
  let posMapFor = null;
  const ORIGIN = { x: 0, y: 0 };
  function allPositions(t) {
    if (posMapFor !== scene) {
      posMap = new Map();
      for (const b of scene.bodies) posMap.set(b.id, { x: 0, y: 0 });
      posMapFor = scene;
    }
    for (const b of scene.bodies) {
      const p = posMap.get(b.id);
      if (!b.parent) { p.x = b.x; p.y = b.y; }
      else {
        const pp = posMap.get(b.parent) || ORIGIN;
        const a = b.orbit.phase + b.orbit.speed * t;
        p.x = pp.x + Math.cos(a) * b.orbit.r;
        p.y = pp.y + Math.sin(a) * b.orbit.r;
      }
    }
    return posMap;
  }

  function drawStars(colors) {
    const key = cacheKey(holeId || 'main', W, H);
    if (!starCache || starCache.key !== key) starCache = { key, list: stars(holeId || 'main', Math.round(clamp((W * H) / 7000, 20, 180)), W, H) };
    // Constellation's ground (owner, 2026-10-20: "websitesindeki gibi arkada
    // küçük küçük yıldızlar"): its `.gate-star` — an asterisk in the mono face,
    // in the planets' own ink, 6–14 px, a third to a half see-through. A '.'
    // in the faint colour was there but could not be seen.
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.ink;
    const face = baseFont.slice(baseFont.indexOf('px ') + 3) || 'monospace';
    let lastSize = 0;
    for (const s of starCache.list) {
      const px = (((s.x - cam.x * ppw() * s.depth * 0.06) % W) + W) % W;
      const py = (((s.y - cam.y * ppw() * s.depth * 0.06) % H) + H) % H;
      const tw = reduced ? 1 : 0.75 + 0.25 * Math.sin(animT * 1.6 + s.phase);
      ctx.globalAlpha = s.alpha * tw;
      const size = Math.round(s.size);
      if (size !== lastSize) { ctx.font = size + 'px ' + face; lastSize = size; }
      ctx.fillText('*', px, py);
    }
    ctx.globalAlpha = 1;
    ctx.font = baseFont;
  }

  /** The body list with screen positions, culled to the view (+ margin). The
   * item objects are reused between frames — a 2000-body scene at 14 fps must
   * not leave 28 000 objects a second for the garbage collector. */
  const visItems = [];
  function visibleBodies(pos) {
    const k = ppw();
    const margin = 80;
    let n = 0;
    for (const b of scene.bodies) {
      const p = pos.get(b.id);
      if (!p) continue;
      const sx = (p.x - cam.x) * k + W / 2;
      const sy = (p.y - cam.y) * k + H / 2;
      const r = b.size * k;
      if (sx + r < -margin || sx - r > W + margin || sy + r < -margin || sy - r > H + margin) continue;
      let it = visItems[n];
      if (!it) { it = { b: null, p: null, sx: 0, sy: 0, r: 0 }; visItems[n] = it; }
      it.b = b; it.p = p; it.sx = sx; it.sy = sy; it.r = r;
      n++;
    }
    visItems.length = n;
    return visItems;
  }

  function drawFrame(art, colors, x, y, opts2) {
    const rows = art.rows;
    const f = opts2.font || baseFont;
    const cw = opts2.cw || cellW;
    const ch = opts2.ch || cellH;
    ctx.font = f;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = opts2.color || colors.ink;
    if (opts2.glow) { ctx.shadowColor = opts2.color || colors.ink; ctx.shadowBlur = opts2.glow; }
    const x0 = x - (rows[0].length * cw) / 2;
    const y0 = y - (rows.length * ch) / 2;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.trim()) continue;
      ctx.fillText(row, x0, y0 + (i + 0.5) * ch);
    }
    ctx.shadowBlur = 0;
    ctx.font = baseFont;
    return { w: rows[0].length * cw, h: rows.length * ch };
  }

  function draw(now, force) {
    if (!scene || !W || !H) return;
    const colors = getColors() || {};
    const c = { ink: colors.ink || '#cfcfcf', faint: colors.faint || '#8a8a8a',
      accent: colors.accent || '#9ac2e8', fern: colors.fern || '#9ab97a',
      madder: colors.madder || '#c98a8a', paper: colors.paper || '#14161a' };
    // A body's own colour: its hue on this paper, or the ink for a null hue.
    // Labels are one colour on every note, read from the label's name.
    // The core stays the theme's ink; the loose notes round it a shade deeper,
    // so the white middle stands out (owner, 2026-10-21).
    const loose = mixColor(c.ink, c.paper, LOOSE_SHADE);
    const colorOf = (b) => {
      if (b.hue === null || b.hue === undefined) {
        const role = roleOf(b);
        return role === 'label' ? c.faint : role === 'note' ? loose : c.ink;
      }
      return hueColor(b.hue, c.paper);
    };

    if (followId && mini) {
      const body = scene.byId.get('note:' + followId);
      if (body) {
        const p = positionAt(scene, body.id, orbitT);
        if (hop) {
          // Gliding over to the note just opened, which keeps orbiting meanwhile
          // (the owner: "it jumps — it should fly quickly to the other planet").
          const k = clamp((now - hop.start) / hop.dur, 0, 1);
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          cam.x = hop.from.x + (p.x - hop.from.x) * e;
          cam.y = hop.from.y + (p.y - hop.from.y) * e;
          cam.zoom = hop.from.zoom * Math.pow(hop.zoom / hop.from.zoom, e);
          if (k >= 1) hop = null;
        } else { cam.x = p.x; cam.y = p.y; }
      }
    }

    ctx.fillStyle = c.paper;
    ctx.fillRect(0, 0, W, H);
    if (scene.kind === 'hole') {
      // Inside a hole the whole space is tinted towards the accent, with faint
      // radial distortion lines running out of the singularity.
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = c.accent;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + (reduced ? 0 : animT * 0.05);
        ctx.beginPath();
        ctx.moveTo(W / 2, H / 2);
        ctx.lineTo(W / 2 + Math.cos(a) * Math.max(W, H), H / 2 + Math.sin(a) * Math.max(W, H));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    drawStars(c);
    if (scene.kind === 'hole') drawBackdrop(c);

    const pos = allPositions(orbitT);
    const vis = visibleBodies(pos);
    const k = ppw();
    const glow = litNow();
    const dimmed = (b) => glow && !glow.ids.has(b.id);

    // Cheap clock quantisation: flicker/pulse frames advance ~7 fps, sphere
    // turns are 48 steps — both memoised through the same key shape.
    const tFrame = Math.floor(animT / 0.14);
    // Art budget: only the largest few visible bodies get full frames; the
    // rest are glyphs (addendum #3).
    const artCap = mini ? 10 : ART_BODIES_MAX;
    const artOrder = [];
    for (let i = 0; i < vis.length; i++) {
      const v = vis[i];
      if (v.r >= (isLabelMoon(v.b) ? 10 : ART_MIN_R)) artOrder.push(v);
    }
    artOrder.sort((a, b2) => b2.r - a.r);
    vis.sort((a, b2) => b2.r - a.r);
    const artSet = new Set();
    for (let i = 0; i < artOrder.length && i < artCap; i++) artSet.add(artOrder[i].b.id);

    // Constellations go under everything: thin lines between the notes of
    // each picked label, in the label's colour.
    if (glow) drawLinks(glow, pos, c);

    /* Glyph pass. Everything smaller than 10 px — at a map-wide view that is
       nearly every body — is drawn here, and the canvas state is touched as
       little as possible: font and alignment once, fillStyle only when the
       colour actually changes, shadow state only around the few glowing
       bodies. Bodies under 2 px are not glyphs at all but tiny rects, batched
       into one path per colour: 1500 moons' worth of fillText is most of the
       frame budget on its own, and a 2 px rect reads the same as a 2 px glyph.
       At 2000 bodies this loop is the frame, so it allocates nothing. */
    ctx.font = baseFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fill = null;
    const focusedPlanet = selected && scene.byId.get(selected);
    const names = [];
    const arts = [];
    // Tiny bodies batch by colour (and by dimmed or not): one path each.
    for (const m of tiny) for (const arr of m.values()) arr.length = 0;
    for (let i = 0; i < vis.length; i++) {
      const v = vis[i];
      const b = v.b;
      const label = isLabelMoon(b);
      const role = roleOf(b);
      // Sub-pixel bodies are invisible noise — but a label is a speck of its
      // own colour down to half a pixel: the owner looked for the little
      // asteroids round their notes and found none (1.0.0).
      if (v.r < (label ? 0.45 : 0.8)) continue;
      const parentFocused = label && focusedPlanet && b.parent === focusedPlanet.id;
      if (artSet.has(b.id) && !(label && !parentFocused)) {
        arts.push(v);
        continue;
      }
      const col = colorOf(b);
      const dim = dimmed(b);
      if (v.r < 2) {
        const bucket = tiny[dim ? 1 : 0];
        let arr = bucket.get(col);
        if (!arr) { arr = []; bucket.set(col, arr); }
        arr.push(v.sx, v.sy, Math.max(1, v.r));
        continue;
      }
      if (col !== fill) { ctx.fillStyle = col; fill = col; }
      if (dim) ctx.globalAlpha = DIM_ALPHA;
      const glowBody = b.kind === 'sun' || b.kind === 'hole';
      if (glowBody) { ctx.shadowColor = col; ctx.shadowBlur = 6; }
      ctx.fillText(tinyGlyph(b), v.sx, v.sy);
      if (glowBody) ctx.shadowBlur = 0;
      if (dim) ctx.globalAlpha = 1;
      if (!mini && wantsName(v, role, parentFocused)) names.push(v);
    }
    for (let d = 0; d < 2; d++) {
      ctx.globalAlpha = d ? DIM_ALPHA : 1;
      for (const [col, arr] of tiny[d]) {
        if (!arr.length) continue;
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < arr.length; i += 3) ctx.rect(arr[i] - arr[i + 2] / 2, arr[i + 1] - arr[i + 2] / 2, arr[i + 2], arr[i + 2]);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const v of names) drawName(v, c);

    // The art pass: full ASCII frames for the largest bodies. A small one keeps
    // a minimum grid drawn in a smaller face, so a planet a few pixels across is
    // still a turning globe and not a dot (owner, 2026-10-20: "gezegenler,
    // yıldızlar dönmüyor"). Suns and planets turn on their axes, a planet in
    // 10–20 s, and the one under the pointer turns faster.
    const fsBase = parseFloat(baseFont) || 13;
    const face = baseFont.slice(baseFont.indexOf('px ') + 3) || 'monospace';
    for (const v of arts) {
      const b = v.b;
      const kind = artKind(b);
      const minRows = kind === 'sphere' ? 4 : 5;
      let rows2 = Math.round((v.r * 2) / cellH);
      let scale = 1;
      if (rows2 < minRows) {
        scale = clamp((v.r * 2.6) / (minRows * cellH), 6 / fsBase, 1);
        rows2 = minRows;
      }
      rows2 = clamp(rows2, minRows, 30);
      const cols2 = clamp(rows2 * 2, 5, 60);
      // Rings and their tilt come from the model: a quarter of the planets,
      // each ring rolled 0–45° (owner, 2026-10-21). The roll goes in the
      // cache key in 9 steps, so frames are still shared.
      const ring = kind === 'sphere' && b.kind === 'planet' && (b.ringed ?? b.seed % 4 === 0);
      const rollStep = ring ? Math.round(((b.roll ?? 0.26) / (Math.PI / 4)) * 8) : 0;
      const roll = (rollStep / 8) * (Math.PI / 4);
      const spin = animT * spinRate(b) + (b.seed % 628) / 100 + (spinBoost.get(b.id) || 0);
      const fi = kind === 'sphere' || kind === 'sun' ? frameIndex(spin, 48) : 0;
      const turn = (fi / 48) * Math.PI * 2;
      // A sun's corona flickers in step with its turn, so a sun has 48 frames
      // like a planet and never fills the shared cache with one-off frames.
      const turning = kind === 'sphere' || kind === 'sun';
      const art = cached(cacheKey(kind, cols2, rows2, turning ? fi : tFrame, ring ? 'r' + rollStep : 0, b.seed % 8), () => {
        const args = { cols: cols2, rows: rows2, seed: b.seed % 8 };
        if (kind === 'sphere') Object.assign(args, { spin: turn, ring, roll });
        else if (kind === 'sun') Object.assign(args, { t: fi * 0.42, spin: turn });
        else Object.assign(args, { t: tFrame * 0.14 });
        return { rows: { sphere, sun, vortex, core }[kind](args) };
      });
      const color = colorOf(b);
      const glowPx = kind === 'sun' ? 8 : 0;
      const small = scale < 1 ? { font: (fsBase * scale).toFixed(1) + 'px ' + face, cw: cellW * scale, ch: cellH * scale } : {};
      const dim = dimmed(b);
      if (dim) ctx.globalAlpha = DIM_ALPHA;
      drawFrame(art, c, v.sx, v.sy, { color, glow: glowPx, ...small });
      if (b.kind === 'hole' && b.initials && v.r >= 8) {
        // A hole shows its initials in its dark middle, open or locked — a
        // locked one shows nothing else. In the hole's own colour: in the
        // paper's they could not be seen.
        ctx.font = 'bold ' + Math.round(clamp(v.r * 0.5, 7, cellH * 0.9)) + 'px ' + face;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(String(b.initials).slice(0, 4), v.sx, v.sy);
        ctx.font = baseFont;
      }
      if (dim) ctx.globalAlpha = 1;
      const parentFocused = isLabelMoon(b) && focusedPlanet && b.parent === focusedPlanet.id;
      if (!mini && wantsName(v, roleOf(b), parentFocused)) drawName(v, c);
    }

    if (glow) drawHalos(glow, pos, c);

    // The selection ring (a11y's visible mark of the selected body), and round
    // it a second, wider circle that takes in everything bound to its orbit —
    // a folder's notes, a project's folders, a note's labels (owner, 2026-10-21).
    if (selected) {
      const b = scene.byId.get(selected);
      const p = pos.get(selected);
      if (b && p) {
        const s = toScreen(p.x, p.y);
        const inner = Math.max(12, b.size * k) + 4;
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, inner, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        const reach = systemReach(b, p, pos) * k;
        if (reach > inner + 6) {
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 1;
          ctx.strokeStyle = b.hue === null || b.hue === undefined ? c.accent : colorOf(b);
          ctx.beginPath();
          ctx.arc(s.x, s.y, reach + 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    if (entering) drawDive(now, c);
    drawEvent(now, c);
  }

  /** Whose name is written under it: projects, folders and holes (an open
   * one — a locked hole is its initials only) once they are a few pixels
   * across, notes when they are big enough to read as a body, a label only
   * while its note is selected. */
  function wantsName(v, role, parentFocused) {
    if (!namesShown) return false;
    if (role === 'project' || role === 'folder') return v.r >= 3;
    if (role === 'hole') return !v.b.locked && v.r >= 4;
    if (role === 'label') return !!parentFocused;
    if (v.b.kind === 'moon') return v.r * 2 >= cellH * 1.4;
    return v.r * 2 >= cellH * 1.6;
  }

  /** How far from the selected body its own system reaches, in world units:
   * every body whose parent chain leads to it. Rebuilt when the selection or
   * the scene changes, measured every frame (they orbit). */
  function systemReach(b, p, pos) {
    if (!system || system.scene !== scene || system.id !== b.id) {
      const ids = [];
      const under = new Set([b.id]);
      for (const x of scene.bodies) {
        if (x.parent && under.has(x.parent)) { under.add(x.id); ids.push(x); }
      }
      system = { scene, id: b.id, ids };
    }
    let reach = 0;
    for (const x of system.ids) {
      const q = pos.get(x.id);
      if (q) reach = Math.max(reach, Math.hypot(q.x - p.x, q.y - p.y) + x.size);
    }
    return reach;
  }

  /* ---------- constellations (owner, 2026-10-21: "Obsidian's grouping, in
     this space theme") ---------- */
  /** The picked labels' members in this scene, or null when nothing is picked. */
  function litNow() {
    if (!picked.length || !scene) return null;
    if (lit && lit.scene === scene && lit.labels === picked) return lit;
    const members = new Map(picked.map((l) => [l, []]));
    const ids = new Set();
    // A mention: the note and every note it links to or is linked from,
    // joined by arrows from → to (owner, 2026-10-21: "which note links to which").
    const arrows = new Map();
    const picks = picked.filter((k) => k.startsWith(MENTION_KEY));
    if (picks.length) {
      const bodyOf = new Map();
      for (const b of scene.bodies) if (roleOf(b) === 'note') bodyOf.set(b.ref, b);
      const links = mentionLinks(scene);
      for (const key of picks) {
        const ref = key.slice(MENTION_KEY.length);
        const mine = links.filter(([a, z]) => a === ref || z === ref).slice(0, LINK_MAX);
        const list = members.get(key);
        const seen = new Set();
        for (const r of [ref, ...mine.flat()]) {
          const b = bodyOf.get(r);
          if (b && !seen.has(r)) { seen.add(r); list.push(b); ids.add(b.id); }
        }
        arrows.set(key, mine.map(([a, z]) => [bodyOf.get(a).id, bodyOf.get(z).id]));
      }
    }
    for (const b of scene.bodies) {
      if (roleOf(b) !== 'note' || !b.labels) continue;
      for (const l of b.labels) {
        const list = members.get(l);
        if (!list) continue;
        if (list.length < LINK_MAX) list.push(b);
        ids.add(b.id);
        ids.add(`label:${b.ref ?? String(b.id).replace(/^note:/, '')}:${l}`);
      }
    }
    lit = { scene, labels: picked, members, ids, arrows };
    return lit;
  }
  function drawLinks(g, pos, c) {
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    const now = performance.now();
    if (!g.trees || now - g.treesAt > LINK_EVERY_MS) {
      g.trees = new Map();
      g.treesAt = now;
      for (const [label, list] of g.members) {
        if (g.arrows.has(label) || list.length < 2) continue;
        const at = [];
        const pts = [];
        for (const b of list) { const q = pos.get(b.id); if (q) { at.push(b.id); pts.push(q); } }
        g.trees.set(label, spanningTree(pts).map(([i, j]) => [at[i], at[j]]));
      }
    }
    for (const [label, links] of g.trees) {
      ctx.strokeStyle = hueColor(hueOf('label', label), c.paper);
      ctx.beginPath();
      for (const [a, b] of links) {
        const p = pos.get(a);
        const q = pos.get(b);
        if (!p || !q) continue;
        const s1 = toScreen(p.x, p.y);
        const s2 = toScreen(q.x, q.y);
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
      }
      ctx.stroke();
    }
    // Mentions: one arrow per link, its head at the note mentioned.
    for (const [key, links] of g.arrows) {
      ctx.strokeStyle = hueColor(hueOf('label', key), c.paper);
      const k = ppw();
      ctx.beginPath();
      for (const [a, b] of links) {
        const p = pos.get(a);
        const q = pos.get(b);
        if (!p || !q) continue;
        const s1 = toScreen(p.x, p.y);
        const s2 = toScreen(q.x, q.y);
        const len = Math.hypot(s2.x - s1.x, s2.y - s1.y);
        if (len < 1) continue;
        const ux = (s2.x - s1.x) / len;
        const uy = (s2.y - s1.y) / len;
        const stop = Math.min(len / 2, Math.max(5, (scene.byId.get(b)?.size || 1) * k) + 4);
        const tx = s2.x - ux * stop;
        const ty = s2.y - uy * stop;
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(tx, ty);
        ctx.moveTo(tx - ux * 7 - uy * 4, ty - uy * 7 + ux * 4);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx - ux * 7 + uy * 4, ty - uy * 7 - ux * 4);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawHalos(g, pos, c) {
    const k = ppw();
    const ringsOf = new Map();
    for (const [label, list] of g.members) {
      for (const b of list) {
        if (!ringsOf.has(b)) ringsOf.set(b, []);
        ringsOf.get(b).push(label);
      }
    }
    ctx.lineWidth = 1.4;
    for (const [b, labels] of ringsOf) {
      const q = pos.get(b.id);
      if (!q) continue;
      const s = toScreen(q.x, q.y);
      if (s.x < -40 || s.y < -40 || s.x > W + 40 || s.y > H + 40) continue;
      const r0 = Math.max(5, b.size * k) + 3;
      labels.slice(0, HALO_MAX).forEach((label, i) => {
        ctx.strokeStyle = hueColor(hueOf('label', label), c.paper);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r0 + i * 3, 0, Math.PI * 2);
        ctx.stroke();
        // The label's own moon on this note lights up too.
        const moon = pos.get(`label:${b.ref ?? String(b.id).replace(/^note:/, '')}:${label}`);
        if (moon) {
          const m = toScreen(moon.x, moon.y);
          ctx.beginPath();
          ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      if (labels.length > HALO_MAX && !mini) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = c.faint;
        ctx.font = Math.round(cellH * 0.7) + 'px ' + (baseFont.split('px ')[1] || 'monospace');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('+' + (labels.length - HALO_MAX), s.x + r0 + HALO_MAX * 3 + 2, s.y - r0);
        ctx.font = baseFont;
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- the dive and the space round a hole ---------- */
  /** While the camera falls into a hole: rings of the hole's colour closing
   * in on it, so the pull-in reads as one even when the camera barely moves. */
  function drawDive(now, c) {
    const e = entering;
    const p = clamp((now - e.start) / e.dur, 0, 1);
    const at = toScreen(e.to.x, e.to.y);
    const col = e.hue === null || e.hue === undefined ? c.madder : hueColor(e.hue, c.paper);
    const span = Math.max(W, H) * 0.7;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const q = (p + i / 5) % 1;
      const r = span * (1 - q) + 4;
      ctx.globalAlpha = 0.5 * q * (1 - p * 0.4);
      ctx.beginPath();
      const a0 = q * Math.PI * 3 + i;
      ctx.arc(at.x, at.y, r, a0, a0 + Math.PI * 1.4);
      ctx.stroke();
    }
    // The paper closes in at the end, then the new space opens.
    if (p > 0.7) {
      ctx.globalAlpha = (p - 0.7) / 0.3 * 0.85;
      ctx.fillStyle = c.paper;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
  }

  /** Inside a hole, main space stays faintly in view round it — the hole sits
   * where it orbits, and everything else is a dim, unclickable backdrop. Only
   * main space's own bodies are drawn: nothing of the hole leaks out of it. */
  function drawBackdrop(c) {
    if (!backdrop || backdrop.for !== holeId) {
      const main = buildScene(getInput(null) || {});
      backdrop = { for: holeId, scene: main, b: boundsOf(main, 0) };
    }
    const main = backdrop.scene;
    const here = main.byId.get('hole:' + holeId);
    if (!here) return;
    const hp = positionAt(main, here.id, orbitT);
    const b = backdrop.b;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) || 1;
    const kb = (Math.min(W, H) * 1.4) / span;   // main space a little wider than the pane
    const ox = W / 2 - cam.x * ppw() * 0.04;     // a touch of parallax with the camera
    const oy = H / 2 - cam.y * ppw() * 0.04;
    ctx.globalAlpha = 0.22;
    for (const x of main.bodies) {
      if (x.id === here.id || isLabelMoon(x)) continue;
      const q = positionAt(main, x.id, orbitT);
      const sx = ox + (q.x - hp.x) * kb, sy = oy + (q.y - hp.y) * kb;
      if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
      const r = clamp(x.size * kb * 0.5, 1, 4);
      ctx.fillStyle = x.hue === null || x.hue === undefined ? c.faint : hueColor(x.hue, c.paper);
      ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
  }

  function drawName(v, c, small) {
    const name = String(v.b.name || '');
    if (!name) return;
    ctx.font = small ? Math.round(cellH * 0.75) + 'px ' + baseFont.split('px ')[1] : baseFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = c.faint;
    ctx.fillText(name.length > NAME_MAX ? name.slice(0, NAME_MAX - 1) + '…' : name,
      v.sx, v.sy + Math.max(v.r, cellH) + 3);
    ctx.font = baseFont;
    ctx.textBaseline = 'middle';
  }

  /* ---------- events: a shooting star each minute, a rocket each five
     (owner, 2026-10-21: "one fast shooting star a minute; a rocket every five
     minutes, leaving a planet slowly, smaller than a moon; a click follows it,
     and when it is gone the camera goes back to Fit") ---------- */
  function scheduleEvent(now) {
    nextShotAt = now + SHOT_EVERY_MS * (0.85 + Math.random() * 0.3);
    nextRocketAt = now + ROCKET_EVERY_MS;
  }
  function tryEvent(now) {
    if (mini || reduced || !scene) return;
    // Away (hidden, off-screen) nothing fires; it waits for the next look.
    const away = !inView || document.hidden;
    if (now >= nextShotAt) {
      nextShotAt = now + SHOT_EVERY_MS * (0.85 + Math.random() * 0.3);
      if (!away && !eventState) launchShot(now);
    }
    if (now >= nextRocketAt) {
      nextRocketAt = now + ROCKET_EVERY_MS;
      if (!away && !rocket) launchRocket(now);
    }
  }
  function launchShot(now) {
    const fromLeft = Math.random() < 0.5;
    const a = (14 + Math.random() * 40) * Math.PI / 180;
    const y0 = Math.random() * H * 0.6;
    const dx = (fromLeft ? 1 : -1) * Math.cos(a), dy = Math.sin(a);
    eventState = { kind: 'shot', start: now, dur: SHOT_MS,
      from: { x: fromLeft ? -20 : W + 20, y: y0 }, dx, dy, len: Math.max(W, H) * 1.2,
      fn: shot({ len: 12, angle: Math.atan2(dy, dx) }) };
  }
  // The rocket leaves a planet (a note, folder or sun — never a moon) and
  // heads outwards, slowly at first; it lives in world space, so it moves
  // with the camera like everything else.
  function launchRocket(now) {
    const pads = scene.bodies.filter((b) => b.kind === 'planet' || b.kind === 'sun');
    if (!pads.length) return;
    const pad = pads[Math.floor(Math.random() * pads.length)];
    const p = allPositions(orbitT).get(pad.id);
    if (!p) return;
    const out = Math.atan2(p.y, p.x) + (Math.random() - 0.5) * 1.2;
    const ang = (p.x || p.y) ? out : Math.random() * Math.PI * 2;
    const b = boundsOf(scene);
    const reach = Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minY), Math.abs(b.maxY)) + 12;
    rocket = { reach, start: now, x0: p.x + Math.cos(ang) * pad.size, y0: p.y + Math.sin(ang) * pad.size,
      ux: Math.cos(ang), uy: Math.sin(ang), burn: 0, lastBurn: 0, followed: false };
  }
  /** Where the rocket is now, in world units, or null. Ends it once it is past the map's edge. */
  function rocketAt(now) {
    if (!rocket) return null;
    const t = (now - rocket.start) / 1000;
    // Eases out of the launch, then cruises: d = v·(t − τ(1 − e^(−t/τ))).
    const d = ROCKET_SPEED * (t - ROCKET_EASE * (1 - Math.exp(-t / ROCKET_EASE)));
    const wob = Math.sin(t * 0.9) * 0.6;
    const x = rocket.x0 + rocket.ux * d - rocket.uy * wob;
    const y = rocket.y0 + rocket.uy * d + rocket.ux * wob;
    if (Math.hypot(x, y) > rocket.reach || t > ROCKET_LIFE_S) { endRocket(); return null; }
    return { x, y };
  }
  function endRocket() {
    const was = rocket?.followed;
    rocket = null;
    // Out of sight: a camera that was riding along goes back to Fit.
    if (was) overview();
  }
  function rocketScreen(now) {
    const w = rocketAt(now);
    return w ? { ...toScreen(w.x, w.y), w } : null;
  }
  function drawEvent(now, c) {
    if (rocket) drawRocket(now, c);
    if (!eventState) return;
    const p = (now - eventState.start) / eventState.dur;
    if (p >= 1) { eventState = null; return; }
    const e = eventState;
    const head = { x: e.from.x + e.dx * e.len * p, y: e.from.y + e.dy * e.len * p };
    const fs = 8;
    const cw = fs * 0.6, ch = fs * 1.1;
    ctx.font = fs + 'px ' + baseFont.split('px ')[1];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const cell of e.fn(p)) {
      ctx.globalAlpha = cell.alpha;
      ctx.fillStyle = c.ink;
      ctx.fillText(cell.ch, head.x + cell.dx * cw, head.y + cell.dy * ch);
    }
    ctx.globalAlpha = 1;
    ctx.font = baseFont;
  }
  function drawRocket(now, c) {
    const s = rocketScreen(now);
    if (!s) return;
    if (now - rocket.lastBurn >= 130) { rocket.lastBurn = now; rocket.burn++; }
    const rows2 = ROCKET_BODY.concat(ROCKET_BURN[rocket.burn % ROCKET_BURN.length]);
    // Smaller than a moon: the whole craft is ROCKET_H world units tall.
    const ch = Math.max(0.6, (ROCKET_H * ppw()) / rows2.length);
    const fs = ch / 1.1;
    if (s.x < -60 || s.y < -60 || s.x > W + 60 || s.y > H + 60) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.atan2(rocket.uy, rocket.ux) + Math.PI / 2);
    ctx.font = Math.max(1, fs) + 'px ' + baseFont.split('px ')[1];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rocket.followed ? c.ink : c.faint;
    for (let i = 0; i < rows2.length; i++) ctx.fillText(rows2[i], 0, (i - rows2.length / 2) * ch);
    ctx.restore();
    ctx.font = baseFont;
  }
  /** Is a click at (mx, my) on the rocket? Generous, as it is tiny. */
  function onRocket(mx, my) {
    const s = rocket && rocketScreen(performance.now());
    return !!s && Math.hypot(mx - s.x, my - s.y) <= Math.max(MIN_TARGET_PX + 4, (ROCKET_H * ppw()) / 2);
  }
  // The camera rides along with a followed rocket.
  function followRocket(now) {
    if (!rocket?.followed) return false;
    const w = rocketAt(now);
    if (!w) return false;
    cam.x += (w.x - cam.x) * 0.2;
    cam.y += (w.y - cam.y) * 0.2;
    return true;
  }

  /* ---------- hit testing (screen space, addendum #4) ---------- */
  function hitAt(mx, my) {
    if (!scene) return null;
    const pos = allPositions(orbitT);
    const k = ppw();
    let best = null, bestRank = Infinity;
    for (const b of scene.bodies) {
      const p = pos.get(b.id);
      if (!p) continue;
      const sx = (p.x - cam.x) * k + W / 2;
      const sy = (p.y - cam.y) * k + H / 2;
      const r = b.size * k;
      const d = Math.hypot(mx - sx, my - sy);
      let target, body = b;
      if (b.kind === 'moon' && r < MOON_CLICK_PX) {
        // Too small to aim at: the click belongs to its planet.
        target = MIN_TARGET_PX;
        body = scene.byId.get(b.parent) || b;
        if (d > target) continue;
      } else {
        target = Math.max(r, MIN_TARGET_PX);
      }
      if (d > target) continue;
      // Smallest target wins.
      const rank = target;
      if (rank < bestRank) { bestRank = rank; best = body; }
    }
    return best;
  }

  /* ---------- pointer + keys ---------- */
  let down = null, dragging = false;
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    down = { x: e.offsetX, y: e.offsetY, camX: cam.x, camY: cam.y };
    if (rocket) rocket.followed = false;       // any click takes the camera back; one on the rocket rides again
    dragging = false;
    // The hand shows only while the map is held (owner, 2026-10-21).
    canvas.classList.add('is-grabbing');
    canvas.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!down) {
      // What is under the pointer turns faster — looked at at most every 60 ms.
      if (e.timeStamp - hoverAt < 60) return;
      hoverAt = e.timeStamp;
      const body = hitAt(e.offsetX, e.offsetY);
      hoverId = body && !isLabelMoon(body) ? body.id : null;
      return;
    }
    const dx = e.offsetX - down.x, dy = e.offsetY - down.y;
    if (!dragging && Math.hypot(dx, dy) > 4) dragging = true;   // >4 px = drag, not click
    if (dragging) {
      handOver();
      const k = ppw();
      cam.x = down.camX - dx / k;
      cam.y = down.camY - dy / k;
      tween = null;
      entering = null;
    }
  };
  const onPointerUp = async (e) => {
    if (!down) return;
    const wasDrag = dragging;
    down = null; dragging = false;
    canvas.classList.remove('is-grabbing');
    // The minimap is a window, not a control: a click on it does nothing
    // (the owner, 2026-10-21: "no clicking on the little map").
    if (wasDrag || mini) return;
    if (rocket && onRocket(e.offsetX, e.offsetY)) {
      rocket.followed = true;
      handOver();
      tween = null;
      selected = null;
      wake();
      return;
    }
    const body = hitAt(e.offsetX, e.offsetY);
    if (!body) {
      // Empty space lets go of the selection: its rings go, the camera stays
      // (owner, 2026-10-21).
      if (selected) { selected = null; wake(); }
      return;
    }
    if (body.kind === 'hole' && !body.locked) {
      // The engine asks first; a locked hole is no door — it is zoomed to like any body.
      const ok = await onEnterHole(body.ref);
      if (ok && !destroyed) enterHole(body.ref);
      return;
    }
    selected = body.id;
    handOver();
    focus(body.id);
  };
  const onContextEvent = (e) => {
    e.preventDefault();
    const body = hitAt(e.offsetX, e.offsetY);
    if (body || holeId) onContext(body, e.clientX, e.clientY);
  };
  const onDblClick = (e) => {
    if (mini) return;
    const body = hitAt(e.offsetX, e.offsetY);
    if (body) onContext(body, e.clientX, e.clientY, { open: true });
  };
  const onWheel = (e) => {
    e.preventDefault();
    handOver();
    const factor = Math.exp((e.ctrlKey ? -e.deltaY * 0.01 : -e.deltaY * 0.0022));
    const before = toWorld(e.offsetX, e.offsetY);
    cam.zoom = clamp(cam.zoom * factor, 0.01, 10);
    const after = toWorld(e.offsetX, e.offsetY);
    cam.x += before.x - after.x;               // the point under the cursor stays put
    cam.y += before.y - after.y;
    tween = null;
  };
  const onKey = (e) => {
    const k = ppw();
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'].includes(e.key)) handOver();
    if (e.key === 'ArrowLeft') { cam.x -= 80 / k; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { cam.x += 80 / k; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cam.y -= 80 / k; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { cam.y += 80 / k; e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { cam.zoom = clamp(cam.zoom * 1.25, 0.01, 10); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { cam.zoom = clamp(cam.zoom * 0.8, 0.01, 10); e.preventDefault(); }
    else if (e.key === 'Enter') {
      const body = (selected && scene.byId.get(selected))
        || hitAt(W / 2, H / 2);
      if (body) {
        const rect = canvas.getBoundingClientRect();
        onContext(body, rect.left + W / 2, rect.top + H / 2, { open: true });
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (holeId && auto) leaveHole();     // already whole: Escape again leaves the hole
      else overview();
      e.preventDefault();
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', () => { down = null; dragging = false; canvas.classList.remove('is-grabbing'); });
  canvas.addEventListener('pointerleave', () => { hoverId = null; });
  canvas.addEventListener('contextmenu', onContextEvent);
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;   // keyboard needs focus
  canvas.addEventListener('keydown', onKey);

  /* ---------- visibility ---------- */
  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => { inView = entries.some((en) => en.isIntersecting); wake(); })
    : null;
  if (observer) observer.observe(canvas);
  const onVisibility = () => wake();
  document.addEventListener('visibilitychange', onVisibility);

  /* ---------- the loop ---------- */
  let lastFrame = 0;
  function frame(now) {
    if (destroyed) return;
    // A parked loop parks completely: while the map is paused, hidden or
    // off-screen no callback is queued at all — a hidden pane must not burn
    // frames. wake() starts it again, and the clocks restart from zero so a
    // long absence does not jump the orbits (dt is capped anyway).
    if (!running || document.hidden || !inView) { raf = 0; lastFrame = 0; return; }
    raf = requestAnimationFrame(frame);
    if (!scene) return;
    if (!start) { start = now; scheduleEvent(now); }
    // dt capped so a tab that was away does not fast-forward the orbits.
    const dt = lastFrame ? Math.min(0.25, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    const pace = reduced ? 0.4 : 1;
    orbitT += dt * pace; animT += dt * pace;
    if (hoverId) spinBoost.set(hoverId, ((spinBoost.get(hoverId) || 0) + dt * pace * HOVER_SPIN) % (Math.PI * 2));
    stepTween(now);
    const riding = followRocket(now);
    // ASCII frames tick at ~14 fps; while the camera is moving it redraws at
    // RAF rate so the glide is smooth (the frames themselves stay memoised).
    // A minimap glued to its note is not moving: the orbit is slow, the tick
    // keeps up, and an idle sidebar must not draw 60 times a second.
    const moving = !!(tween || entering || hop || riding);
    if (moving || now - lastTick >= TICK_MS) {
      lastTick = now;
      tryEvent(now);
      draw(now);
    }
  }
  // Start the loop again if it is parked and allowed to run — cheap and
  // idempotent, so every API entry point that might wake a hidden map calls it.
  function wake() {
    if (!raf && !destroyed && running && !document.hidden && inView) raf = requestAnimationFrame(frame);
  }

  /* ---------- public API ---------- */
  function refresh() {
    // A pull-in whose hole vanished (locked, deleted) is cancelled before it
    // can complete: the dive must never land in a dimension that is gone.
    let parked = false;
    if (entering) {
      const holesNow = (getInput(null) || {}).holes || [];
      if (!holesNow.some((h) => h.id === entering.holeId && !h.locked)) {
        entering = null;
        tween = null;
        cam = savedMainCam || overviewCam();
        auto = savedMainCam ? savedMainAuto : true;
        parked = true;                    // back exactly where the dive started
      }
    }
    // A hole that disappeared from the input (locked, deleted) is dropped at
    // once, mid-animation included — it must not linger and leak nothing.
    if (holeId) {
      const main = getInput(null) || {};
      const still = (main.holes || []).some((h) => h.id === holeId && !h.locked);
      if (!still) {
        entering = null; tween = null;
        dropCaches();
        scene = buildScene(main);
        holeId = null;
        picked = [];
        backdrop = null;
        cam = savedMainCam || overviewCam();
        onDimension(null);
        wake();
        return;
      }
    }
    const keepZoom = scene ? { ...cam } : null;
    const input = getInput(holeId) || {};
    // Opening a note redraws the list, which refreshes the map: when nothing
    // the map shows has changed, the scene and the frame cache stay — a
    // rebuild there was the stutter in the minimap's glide (perf audit, 2026-10-21).
    const key = (holeId || '') + '\u0000' + JSON.stringify(input);
    if (scene && !parked && key === sceneKey && scene.kind === (holeId ? 'hole' : 'main')) { wake(); return; }
    sceneKey = key;
    scene = buildScene(input);
    backdrop = null;
    for (const id of spinBoost.keys()) if (!scene.byId.has(id)) spinBoost.delete(id);
    dropCaches();
    if (!keepZoom) cam = overviewCam();
    else if (auto && !entering && !parked && W && H) glideTo(autoCam(), 600);   // a new note or folder: still all in view
    onDimension(holeId);
    wake();
  }

  function enterHole(id) {
    const body = scene && scene.byId.get('hole:' + id);
    if (!body || body.locked || entering) return;   // a locked hole stays drawn, never entered
    const t = orbitT;
    const p = positionAt(scene, body.id, t);
    savedMainCam = { ...cam };
    savedMainAuto = auto;
    // Fall in: the camera dives at the hole while tightening round it.
    entering = {
      // Never 0 ms: under reduced motion it was, and the dive was never seen
      // (owner, 2026-10-21: "içeri girme animasyonu çalışıyor mu emin olamadım").
      holeId: id, hue: body.hue, start: performance.now(), dur: reduced ? DIVE_MS_REDUCED : DIVE_MS,
      from: { x: cam.x, y: cam.y, zoom: cam.zoom },
      to: { x: p.x, y: p.y, zoom: Math.max(cam.zoom * 18, 0.6) },
      finish: () => {
        // The lock could have landed mid-dive, and no refresh need have come:
        // re-check the hole before switching, and if it is gone stay in main
        // space, camera back where the dive started.
        const still = ((getInput(null) || {}).holes || []).some((h) => h.id === id && !h.locked);
        if (!still) { cam = savedMainCam || overviewCam(); auto = savedMainAuto; return; }
        // Land in the new dimension exactly where the dive ended, then ease
        // out to its overview — no cut.
        const dive = { ...cam };
        setDimension(id, true);
        cam = dive;
        auto = true;                      // a hole's own space is shown whole
        glideTo(overviewCam(), 700);
        selected = null;
      },
    };
    wake();
  }

  function leaveHole(instant) {
    if (!holeId) return;
    entering = null;
    tween = null;
    dropCaches();
    const back = savedMainCam || null;
    auto = back ? savedMainAuto : true;
    scene = buildScene(getInput(null) || {});
    holeId = null;
    picked = [];
    backdrop = null;
    onDimension(null);
    selected = null;
    if (instant || !back) { cam = back || overviewCam(); wake(); return; }
    // The way out is the pull-in played backwards: glide from wherever the
    // hole left the camera back to where main space was.
    glideTo(back, reduced ? 600 : 900);
    wake();
  }

  function follow(noteId) {
    followId = noteId;
    const body = scene && scene.byId.get('note:' + noteId);
    if (!body) { wake(); return; }
    if (mini) {                           // in mini the camera is glued on — after a short glide over
      tween = null;
      const zoom = auto ? autoCam().zoom : cam.zoom;
      hop = W && H ? { from: { ...cam }, zoom, start: performance.now(), dur: reduced ? 400 : HOP_MS } : null;
      if (!hop) cam.zoom = zoom;
      wake();
      return;
    }
    if (auto) { wake(); return; }         // the big map stays filled; a hand's camera glides to the note
    const p = positionAt(scene, body.id, orbitT);
    glideTo({ x: p.x, y: p.y, zoom: cam.zoom }, 1200);
    wake();
  }

  // The core's own frame: its first ring of loose notes, whole, with their
  // label moons — not the whole map (the owner, 2026-10-21).
  function coreFocus() {
    let ring = Infinity;
    for (const b of scene.bodies) if (b.parent === 'core' && roleOf(b) === 'note') ring = Math.min(ring, b.orbit.r);
    if (!Number.isFinite(ring)) return null;
    let reach = 0;
    for (const b of scene.bodies) {
      if (b.parent !== 'core' || roleOf(b) !== 'note' || b.orbit.r !== ring) continue;
      const own = focusFor(scene, b.id, orbitT);
      reach = Math.max(reach, own ? 1 / own.zoom : b.size);
    }
    const extent = ring + reach + 1;
    const fill = W && H ? Math.min(W, H) * 0.47 / (PX_PER_WORLD * Math.min(W, H)) : 0.45 / PX_PER_WORLD;
    return { x: 0, y: 0, zoom: clamp(fill / extent, 0.01, 10) };
  }

  function focus(bodyId) {
    if (rocket) rocket.followed = false;
    let to = (bodyId === 'core' && scene.kind === 'main' && coreFocus()) || focusFor(scene, bodyId, orbitT);
    // A note is framed with room round it: its label moons read as small
    // satellites, not as planets of their own (the owner, 2026-10-21: "on
    // hhhh the labels grow too big").
    const body = scene.byId.get(bodyId);
    if (to && body && roleOf(body) === 'note') to = { ...to, zoom: to.zoom / NOTE_FRAME };
    if (to) glideTo(to, 900);
    wake();
  }

  function select(bodyId) {
    selected = bodyId;
    if (bodyId && scene && scene.byId.has(bodyId)) focus(bodyId);
    wake();
  }

  function overview() {
    if (rocket) rocket.followed = false;
    auto = true;
    glideTo(overviewCam(), 900);
    wake();
  }

  function restore(view) {
    if (!view || typeof view !== 'object') return;
    // Only a camera a hand had chosen is worth bringing back.
    if (!view.manual) return;
    auto = false;
    cam = { x: view.x || 0, y: view.y || 0, zoom: clamp(view.zoom || 0.05, 0.01, 10) };
    const want = view.holeId || null;
    const input = getInput(want) || {};
    if (want && input.hole && !input.hole.locked) {
      scene = buildScene(input);
      holeId = want;
      onDimension(want);
    } else {
      scene = buildScene(getInput(null) || {});
      holeId = null;
      onDimension(null);
    }
    dropCaches();
    savedMainCam = null;
    wake();
  }

  resize();
  refresh();                          // the first scene, before the loop starts
  wake();

  return {
    refresh, follow, focus, enterHole, leaveHole, overview, select, restore, fit,
    dimension: () => holeId,
    bodies: () => (scene ? scene.bodies.map((b) => ({ id: b.id, kind: b.kind, role: roleOf(b), ref: b.ref, name: b.name, parent: b.parent })) : []),
    // The label search: every label on this map, a label's colour on this
    // theme, and the labels whose constellations are drawn.
    labels: () => (scene ? labelsOf(scene) : []),
    // The notes in an @mention, either end: { key, id, title }, by title.
    mentions: () => {
      if (!scene) return [];
      const refs = new Set(mentionLinks(scene).flat());
      return scene.bodies.filter((b) => roleOf(b) === 'note' && refs.has(b.ref))
        .map((b) => ({ key: mentionKey(b.ref), id: b.ref, title: b.name }))
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    // Names on the map: hidden by "Hide names", back with "Show names".
    setNames(on) { namesShown = !!on; wake(); },
    names: () => namesShown,
    selected: () => selected,
    labelColor: (name) => hueColor(hueOf('label', name), (getColors() || {}).paper || '#14161a'),
    highlight: (labels) => {
      const have = new Set(scene ? labelsOf(scene) : []);
      if (scene) for (const [a, z] of mentionLinks(scene)) { have.add(mentionKey(a)); have.add(mentionKey(z)); }
      picked = [...new Set((labels || []).filter((l) => have.has(l)))].slice(0, PICK_MAX);
      lit = null;
      draw(performance.now(), true);
      wake();
    },
    highlighted: () => picked.slice(),
    // The rocket now, for tests: world and screen position, followed or not.
    rocket: () => {
      const s = rocket && rocketScreen(performance.now());
      return s ? { x: s.w.x, y: s.w.y, sx: s.x, sy: s.y, followed: rocket.followed } : null;
    },
    shooting: () => !!eventState,
    view: () => ({ x: cam.x, y: cam.y, zoom: cam.zoom, holeId, manual: !auto }),
    frames: () => [...frameCache.keys()],   // what the frame cache holds — for tests
    resize, pause: () => { running = false; }, resume: () => { running = true; wake(); },
    // Lifecycle hooks for whoever owns the DOM around the canvas: shown
    // starts the loop again at the right size, hidden parks it, resized is
    // resize by the name a panel observer would call.
    shown: () => { running = true; resize(); wake(); },
    hidden: () => { running = false; },
    resized: () => resize(),
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      dropCaches();
      if (observer) observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('contextmenu', onContextEvent);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
    },
  };
}
