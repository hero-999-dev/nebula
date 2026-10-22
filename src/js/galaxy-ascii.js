/**
 * ASCII art for the galaxy map (1.0.0): the glyph half of the map.
 *
 * Everything here is ported from Hero Constellation's gate — `spinSaturn`
 * (the donut-demo sphere: sample the surface, rotate, project into character
 * cells with x doubled because cells are ~2:1, keep the nearest point per cell
 * in one z-buffer, pick the glyph by how much the point faces the light), the
 * asterisk star field and the shooting star's ramp. The rest (sun, vortex,
 * nebula, galactic core) is drawn the same way: a brightness per cell, mapped
 * onto Constellation's luminance ramp, so every body on the map looks like it
 * came from the same wall of ASCII.
 *
 * Pure module: no DOM, no storage, no Math.random — the same arguments always
 * give the same picture, which is what lets the engine memoise frames and what
 * makes it testable. Randomness comes from a seed through a local mulberry32;
 * `rng`/`hashSeed` also exist in galaxy-model.js, but this file stands alone so
 * the art can be used (and checked) without building a scene.
 */

export const RAMP = '.,-~:;=!*#$@';

const TAU = Math.PI * 2;

/** FNV-1a, 32-bit — the same hash the scene builder uses for body seeds. */
function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a tiny seeded generator, good enough for look decisions. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Brightness (0..1) -> ramp glyph, dark to light. */
const glyphOf = (s) => RAMP[clamp(Math.floor(s * RAMP.length), 0, RAMP.length - 1)];

/**
 * Which memo frame a spin angle falls into: the engine quantises the turn into
 * this many steps before drawing, so the frame cache only ever sees a handful
 * of spin values instead of a new one every tick.
 */
export function frameIndex(spin, frames = 48) {
  const turn = (((spin % TAU) + TAU) % TAU) / TAU;
  return Math.floor(turn * frames) % frames;
}

/**
 * A memo key for anything the engine caches (ASCII frames, star fields):
 * numbers are rounded so float churn does not defeat the cache.
 */
export function cacheKey(...parts) {
  return parts
    .map((p) => (typeof p === 'number' ? String(Math.round(p * 256) / 256) : String(p)))
    .join('|');
}

/**
 * A planet: Constellation's `spinSaturn`, cut loose from its fixed 98x30 cell
 * so the map can ask for a body at any on-screen size. Same recipe — banded
 * globe (rings optional, with the Cassini gap), tilt + a little roll so the
 * rings slant, one shared z-buffer so the ring passes behind the globe's top
 * and in front of its underside, seeded surface markings (belts, mottle, one
 * storm) so the turn reads. Ambient light keeps the shadowed half a round disk,
 * not just a lit cap. Sampling density scales with the asked-for size, so a
 * 6x3 planet costs a few hundred points, not Saturn's thirty thousand.
 */
export function sphere({ cols, rows, spin, tilt = 0.42, seed = 0, ring = false, roll = 0.26, light = [-0.6, 0.55, -0.6] }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const out = new Array(cols * rows).fill(' ');
  const zb = new Float64Array(cols * rows);          // 0 = nothing drawn yet

  // Geometry, straight from Constellation; only K1 (the projection scale) is
  // fitted to the asked-for cell size instead of hard-coded.
  const Rs = 1.4, Rr1 = 2.05, Rr2 = 2.68, G0 = 2.34, G1 = 2.44, K2 = 6.2;
  // `roll` turns the whole planet and its ring about the view axis: each ringed
  // planet has its own, 0–45° (owner, 2026-10-21), so no two Saturns match.
  const ROLL = roll, RING_LIFT = 0.3;
  // A rolled ring's box: its long axis leans by ROLL, so it reaches up as well.
  const ringH = Rr2 * Math.abs(Math.sin(tilt)) + RING_LIFT;
  const cR = Math.abs(Math.cos(roll)), sR = Math.abs(Math.sin(roll));
  const outerX = ring ? Math.max(Rs, Rr2 * cR + ringH * sR) : Rs;
  const outerY = ring ? Math.max(Rs, Rr2 * sR + ringH * cR) * 1.12 : Rs * 1.16;
  const K1 = Math.max(2, K2 * Math.min((cols / 2 - 1) / (2 * outerX), (rows / 2 - 1) / outerY));

  const cosT = Math.cos(tilt), sinT = -Math.sin(tilt);   // we look from a touch above
  const cosR = Math.cos(ROLL), sinR = Math.sin(ROLL);
  let lx = light[0], ly = light[1], lz = light[2];
  const ll = Math.hypot(lx, ly, lz) || 1;
  lx /= ll; ly /= ll; lz /= ll;
  const ringL = Math.abs((-cosT * sinR) * lx + (cosT * cosR) * ly + sinT * lz);

  // Seeded markings: bands, mottle and one storm fixed to the surface, so two
  // notes with different seeds turn up as different worlds.
  const r = mulberry(typeof seed === 'string' ? hash32(seed) : seed >>> 0);
  const bandFreq = 4.4 + r() * 2.6, bandPhase = r() * TAU;
  const motA = 0.14 + r() * 0.14, motB = 0.08 + r() * 0.1;
  const stormLon = r() * TAU, stormLat = (r() - 0.5) * 0.8, stormAmp = 0.3 + r() * 0.3;

  const put = (px, py, pz, shade) => {
    const ooz = 1 / (K2 + pz);
    const xp = Math.round(cols / 2 + K1 * ooz * px * 2);   // x doubled: cells are ~half as wide as tall
    const yp = Math.round(rows / 2 - K1 * ooz * py);
    if (xp < 0 || xp >= cols || yp < 0 || yp >= rows) return;
    const i = xp + yp * cols;
    if (ooz <= zb[i]) return;
    zb[i] = ooz;
    out[i] = glyphOf(shade);
  };

  // Sample steps tuned to the cell count: ~3 samples per cell across and down,
  // clamped so a tiny planet stays cheap and a big one stays smooth.
  const across = Math.max(6, (4 * K1 * outerX) / K2);
  const down = Math.max(6, (2 * K1 * outerY) / K2);
  const stepLon = clamp(TAU / (3 * across), 0.008, 0.5);
  const stepLat = clamp(Math.PI / (3 * down), 0.008, 0.5);

  for (let lat = -1.55; lat < 1.55; lat += stepLat) {
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let lon = 0; lon < TAU; lon += stepLon) {
      const x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      const yt = y * cosT - z * sinT, zt = y * sinT + z * cosT;    // tilt about screen x
      const xr = x * cosR - yt * sinR, yr = x * sinR + yt * cosR;  // roll about the view axis
      const L = xr * lx + yr * ly + zt * lz;                       // normal = the point itself
      const mlon = lon - spin;                                    // longitude fixed to the surface
      const belts = 0.74 + 0.26 * Math.sin(lat * bandFreq + bandPhase);
      const mottle = motA * Math.sin(mlon * 3 + lat * 1.5) + motB * Math.sin(mlon * 2 - lat * 2);
      const dl = Math.atan2(Math.sin(mlon - stormLon), Math.cos(mlon - stormLon));
      const storm = stormAmp * Math.exp(-((lat - stormLat) * (lat - stormLat) / 0.06 + dl * dl / 0.32));
      const albedo = clamp(belts + mottle + storm, 0.22, 1.3);
      put(xr * Rs, yr * Rs, zt * Rs, (0.3 + 0.7 * Math.max(0, L)) * albedo);
    }
  }

  if (ring) {
    const stepA = clamp(TAU / (3 * across), 0.008, 0.2);
    const stepR = clamp((Rr2 - Rr1) / Math.max(3, across / 2.5), 0.012, 0.06);
    for (let a = 0; a < TAU; a += stepA) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const spokes = 0.4 + 0.6 * Math.abs(Math.cos((a - spin) * 2.5));  // sweeps with the globe's turn
      for (let rad = Rr1; rad <= Rr2; rad += stepR) {
        if (rad > G0 && rad < G1) continue;                            // the Cassini gap
        const z = rad * sa, px = rad * ca;
        const yt = -z * sinT, zt = z * cosT;                           // y is 0 in the ring plane
        const xr = px * cosR - yt * sinR, yr = px * sinR + yt * cosR;
        const ripple = 0.84 + 0.16 * Math.abs(Math.sin((rad - Rr1) * 9));
        put(xr, yr + RING_LIFT, zt, (0.4 + 0.5 * ringL) * ripple * spokes);
      }
    }
  }

  const lines = [];
  for (let y = 0; y < rows; y++) lines.push(out.slice(y * cols, (y + 1) * cols).join(''));
  return lines;
}

/**
 * A folder's sun: a turning globe with corona rays that flicker with t — the
 * ray pattern is a seeded fan of lobes whose length and brightness wobble on a
 * few slow sines, so it reads as burning rather than strobing. The globe is
 * the planets' sphere seen face on: granulation and a few dark spots fixed to
 * its surface wheel past as `spin` grows, darker towards the limb, so the sun
 * visibly turns (owner, 2026-10-20: "yıldızlar dönmüyor"). Without `spin` it
 * holds one frame.
 */
export function sun({ cols, rows, t, spin = 0, seed = 0 }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const r = mulberry(typeof seed === 'string' ? hash32(seed) : seed >>> 0);
  const lobes = 3 + Math.floor(r() * 4);          // ray count, fixed per sun
  const lobeSkew = r() * TAU;
  const wobble1 = 0.5 + r() * 0.8, wobble2 = 1.1 + r() * 1.3;
  const granA = 2 + Math.floor(r() * 3), granB = 4 + Math.floor(r() * 3), granPhase = r() * TAU;
  const spots = [0, 1, 2].map(() => ({ lon: r() * TAU, lat: (r() - 0.5) * 0.9, size: 0.08 + r() * 0.1 }));
  const tt = t || 0;
  const DISC = 0.5;
  const lines = [];
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const u = (x - cx) / Math.max(1, cols / 2 - 0.5);
      const v = (y - cy) / Math.max(1, rows / 2 - 0.5);
      const d = Math.hypot(u, v);
      if (d > 1) { line += ' '; continue; }
      const ang = Math.atan2(v, u);
      // Each ray breathes on its own phase; the whole fan turns a little with
      // t so the corona crawls round the disc.
      const ray = Math.pow(Math.abs(Math.cos(ang * lobes + lobeSkew + tt * 0.21)), 2.4)
        * (0.62 + 0.38 * Math.sin(tt * wobble1 + ang * 3));
      const flare = 0.85 + 0.15 * Math.sin(tt * wobble2 + d * 5);
      if (d < DISC) {
        // The globe: a point on a unit sphere under this cell, its longitude
        // turned by spin, lit face on with a little limb darkening.
        const nx = u / DISC, ny = v / DISC;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lon = Math.atan2(nx, nz) + spin, lat = Math.asin(clamp(ny, -1, 1));
        let surf = 0.8 + 0.12 * Math.sin(lon * granA + lat * 2 + granPhase) + 0.1 * Math.sin(lon * granB - lat * 3);
        for (const sp of spots) {
          const dl = Math.atan2(Math.sin(lon - sp.lon), Math.cos(lon - sp.lon));
          surf -= 0.55 * Math.exp(-((lat - sp.lat) ** 2 + dl * dl) / (2 * sp.size * sp.size));
        }
        line += glyphOf(clamp(surf * (0.5 + 0.5 * nz), 0.05, 1));
        continue;
      }
      const rim = Math.max(0, 1 - Math.abs(d - 0.52) / 0.3);
      const halo = Math.max(0, 1 - d / 0.6);
      const b = clamp(rim * 0.55 + ray * Math.max(0, 1 - d) * 1.15 * flare + halo * 0.25, 0, 1);
      line += b < 0.1 ? ' ' : glyphOf(b);
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A black hole: an empty event horizon in the middle (nothing draws inside
 * it), a bright thin rim, and a two-armed logarithmic spiral of accretion
 * matter that rotates with t and thins out towards the edge.
 */
export function vortex({ cols, rows, t, seed = 0 }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const r = mulberry(typeof seed === 'string' ? hash32(seed) : seed >>> 0);
  const twist = 4.5 + r() * 2.5;                 // how tightly the spiral winds
  const rot = 0.5 + r() * 0.5;                   // disk spin, radians per second
  const tt = t || 0;
  const horizon = 0.3;
  const lines = [];
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const u = (x - cx) / Math.max(1, cols / 2 - 0.5);
      const v = (y - cy) / Math.max(1, rows / 2 - 0.5);
      const d = Math.hypot(u, v);
      if (d < horizon) { line += ' '; continue; }         // the hole itself: dark
      if (d > 1) { line += ' '; continue; }
      const ang = Math.atan2(v, u);
      // The rim glows hardest just outside the horizon.
      const rim = Math.max(0, 1 - Math.abs(d - horizon) / 0.13);
      // Two arms, wound on a log spiral, turning with t.
      const wind = ang * 2 + Math.log(Math.max(d, horizon)) * twist - tt * rot * 2;
      const arm = 0.5 + 0.5 * Math.cos(wind);
      const fall = Math.max(0, 1 - (d - horizon) / 0.85); // thins towards the edge
      const shimmer = 0.75 + 0.25 * Math.sin(tt * 2.4 + ang * 5);
      const b = clamp(rim * 1.05 + arm * fall * 0.62 * shimmer, 0, 1);
      line += b < 0.12 ? ' ' : glyphOf(b);
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A project's nebula: a faint, seeded haze of '.,:' that drifts slowly with t
 * — three layered sine fields decide where the haze is thick enough to print,
 * and the whole field is sampled a little way upstream of the cell so the
 * cloud crawls sideways over minutes, not frames.
 */
export function nebula({ cols, rows, seed = 0, t = 0 }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const r = mulberry(typeof seed === 'string' ? hash32(seed) : seed >>> 0);
  const f1 = 0.24 + r() * 0.3, f2 = 0.2 + r() * 0.28, f3 = 0.1 + r() * 0.16;
  const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  const drift = (t || 0) * 0.45;
  const lines = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const fx = x - drift, fy = y * 2;             // cells are 2:1; square the field up
      const v = Math.sin(fx * f1 + p1) + Math.sin(fy * f2 + fx * f3 + p2)
        + Math.sin((fx + fy) * f3 * 1.7 + p3) + Math.cos(fx * f2 - fy * f1 + p1);
      // Only the crests print, and only faint glyphs: a haze, not a texture.
      if (v > 1.45) line += ':';
      else if (v > 1.05) line += ',';
      else if (v > 0.7) line += '.';
      else line += ' ';
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The galactic core at the centre of main space: a small pulsing star — a
 * bright heart that swells and shrinks on a slow sine, with four short rays
 * that lengthen with the pulse. Small by design; it is a landmark, not a
 * spectacle.
 */
export function core({ cols, rows, t }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const tt = t || 0;
  const pulse = 0.5 + 0.5 * Math.sin(tt * 1.3);      // ~0.24 Hz: a slow breath
  const lines = [];
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  const rayLen = 1 + pulse * 2;                       // in cells, diagonal rays shorter
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const u = (x - cx) / (cols / 2 - 0.5);
      const v = (y - cy) / (rows / 2 - 0.5);
      const d = Math.hypot(u, v);
      let ch = ' ';
      if (d < 0.34 + pulse * 0.18) ch = pulse > 0.55 ? '@' : '#';
      else if (d < 0.8) ch = glyphOf(0.5 + pulse * 0.3);
      else {
        // The four rays: near a diagonal or an axis, within the pulse's reach.
        const au = Math.abs(u), av = Math.abs(v);
        const onAxis = (au < 0.22 && av < rayLen + 0.7) || (av < 0.22 && au < (rayLen + 0.7) / 2);
        const onDiag = Math.abs(au - av) < 0.3 && d < rayLen + 0.5;
        if (onAxis || onDiag) ch = glyphOf(0.32 + pulse * 0.35);
      }
      line += ch;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The distant background: `count` stars with a place, a size (6–14 px), a
 * dimness (0.12–0.52), one of three parallax depths (0.2–1) and a twinkle
 * phase — the same spread Constellation scattered as 160 asterisks, but from a
 * seed so the map redraws the identical sky every time.
 */
/** The sky's alphabet, faintest first: a star fades out, comes back, grows a point. */
export const TWINKLE = ' .+*';

/**
 * How a star of `stars()` shines at `seconds`: each at its own pace (the
 * deeper, the quicker) and in its own phase, as the glyph it is drawn with
 * (' ' when it has faded out) and how bright it is. The lock screen's sky,
 * and since 1.0.1 the Universe's too (owner: "bring the lock screen's stars
 * to Universe").
 * @returns {{ch: string, glow: number}}
 */
export function twinkle(star, seconds) {
  const glow = star.alpha * (0.55 + 0.45 * Math.sin(seconds * (0.6 + star.depth * 1.4) + star.phase));
  return { ch: TWINKLE[Math.max(0, Math.min(3, Math.floor(glow * 7)))], glow };
}

export function stars(seed, count, width, height) {
  const r = mulberry(typeof seed === 'string' ? hash32(seed) : seed >>> 0);
  const w = Math.max(1, width), h = Math.max(1, height);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: r() * w,
      y: r() * h,
      size: 6 + r() * 8,
      alpha: 0.12 + r() * 0.4,
      depth: 0.2 + r() * 0.8,
      phase: r() * TAU,
    });
  }
  return out;
}

/* The rocket and its burn, copied from Constellation — the map draws them
   much smaller than the gate did, but the art is the art. */
export const ROCKET_BODY = [
  '   .   ',
  "  .'.  ",
  '  |o|  ',
  " .'o'. ",
  ' |.-.| ',
  " '   ' ",
];
export const ROCKET_BURN = [
  ['  ( )  ', '   )   ', '  ( )  '],
  ['   )   ', '  ( )  ', '   )   '],
  ['  ( )  ', '   )   ', '   (   '],
];

/**
 * A shooting star, as a frame helper: `shot({ len })` returns a function that,
 * given progress p in [0, 1], yields the tail cells as offsets from the head —
 * {dx, dy} in cell steps back along the path, `ch` off Constellation's ramp
 * (bright head, faint tail) and `alpha` fading out both at the ends of the run
 * so it appears and leaves instead of popping. The engine owns the head's
 * path; this owns only what the streak looks like.
 */
export function shot({ len = 10, angle = 0.62 } = {}) {
  const n = Math.max(2, Math.round(len));
  const dx = Math.cos(angle), dy = Math.sin(angle);
  return (p) => {
    const prog = clamp(p, 0, 1);
    const fade = Math.min(1, prog / 0.12, (1 - prog) / 0.12);
    if (fade <= 0) return [];
    const cells = [];
    for (let k = 0; k <= n; k++) {
      cells.push({
        dx: -dx * k,
        dy: -dy * k,
        ch: RAMP[Math.round((1 - k / n) * (RAMP.length - 1))],
        alpha: (1 - k / n) * fade,
      });
    }
    return cells;
  };
}
