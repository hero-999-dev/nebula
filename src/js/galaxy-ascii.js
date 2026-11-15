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
 * A cube (1.0.4, the Pixel design; the owner: "pikselde dünyalar kare küpler
 * olsun"): a world as a block, turning about its upright axis and seen from a
 * little above, so its top and two of its sides show. One ray a cell, straight
 * down the view axis, met with the box in the box's own frame; every face is a
 * grid of seeded tiles, the top the brightest and the sides lit from the upper
 * left, so the turn reads. `sun` makes it a burning block: bright on every
 * side, its tiles flickering with `t`. `aspect` is a cell's width over its
 * height: 0.5 for glyphs, 1 for the square blocks the Pixel design draws.
 */
export function cube({ cols, rows, spin = 0, seed = 0, pitch = 0.5, aspect = 0.5, tiles = 4, sun: burning = false, t = 0 }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const s0 = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
  const cs = Math.cos(spin), ss = Math.sin(spin);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // The turning box's reach on the screen: a corner across, a top corner up.
  const unit = Math.max(0.5, Math.min(((cols / 2 - 0.5) * aspect) / Math.SQRT2, (rows / 2 - 0.5) / (cp + Math.SQRT2 * sp)));
  const tileOf = (face, a, b) => {
    let h = Math.imul(s0 ^ Math.imul(face + 1, 0x9e3779b1), 0x85ebca6b) ^ Math.imul(a + 1, 0xc2b2ae35) ^ Math.imul(b + 7, 0x27d4eb2f);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  };
  const tile = (c) => clamp(Math.floor(((c + 1) / 2) * tiles), 0, tiles - 1);
  const flicker = burning ? Math.floor(t) : 0;
  // The light, towards it: upper left, in front.
  const LX = -0.55, LY = 0.6, LZ = 0.58, LL = Math.hypot(LX, LY, LZ);
  const lines = [];
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  // The ray's direction in the box's frame is the same for every cell.
  const d1y = -sp, d1z = -cp;
  const d = [-d1z * ss, d1y, d1z * cs];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const X = ((x - cx) * aspect) / unit, Y = -(y - cy) / unit;
      const o1y = Y * cp, o1z = -Y * sp;
      const o = [X * cs - o1z * ss, o1y, X * ss + o1z * cs];
      let near = -Infinity, far = Infinity, axis = -1;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) {
          if (Math.abs(o[i]) > 1) { near = Infinity; break; }
          continue;
        }
        const a = (-1 - o[i]) / d[i], b = (1 - o[i]) / d[i];
        const lo = Math.min(a, b), hi = Math.max(a, b);
        if (lo > near) { near = lo; axis = i; }
        if (hi < far) far = hi;
      }
      if (axis < 0 || near > far) { line += ' '; continue; }
      const sign = d[axis] > 0 ? -1 : 1;                 // the face met looks back along the ray
      const p = [o[0] + near * d[0], o[1] + near * d[1], o[2] + near * d[2]];
      const u = p[(axis + 1) % 3], v = p[(axis + 2) % 3];
      const face = axis * 2 + (sign > 0 ? 1 : 0) + flicker * 6;
      const grain = burning ? 0.72 + 0.28 * tileOf(face, tile(u), tile(v)) : 0.66 + 0.34 * tileOf(face, tile(u), tile(v));
      let shade;
      if (axis === 1) shade = burning ? 1 : 0.98;         // the top
      else {
        // The side's normal, turned and tipped as the box is, against the light.
        const nx = axis === 0 ? sign : 0, nz = axis === 2 ? sign : 0;
        const wx = nx * cs + nz * ss, wz0 = -nx * ss + nz * cs;
        const wy = -wz0 * sp, wz = wz0 * cp;
        const lam = Math.max(0, (wx * LX + wy * LY + wz * LZ) / LL);
        shade = burning ? 0.66 + 0.3 * lam : 0.36 + 0.5 * lam;
      }
      line += glyphOf(clamp(shade * grain, 0.05, 1));
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A disk (1.0.4, the Medieval design; the owner: "medievalda disk şeklinde
 * olsun hepsi, düz dünya teorisinden"): a flat world seen from above its rim —
 * a round plate with its thickness under the near edge. Lands and seas are
 * drawn on it about a bright pole in the middle and wheel round with `spin`;
 * the wall of ice stands at the edge. A plate big enough carries the
 * firmament over it, a thin dome with a few fixed stars. `sun` makes it a
 * burning plate instead: spokes on its face and flames off its rim, which
 * flicker with `t`. `aspect` is a cell's width over its height.
 *
 * It is a drum more than a coin (the owner, on the first build: "dolu
 * silindirler dönsün"): its wall is a quarter as high as the plate is wide and
 * is built of stones, which go round with the lands over them. `bare` leaves
 * out all that is not the drum — the dome, its stars, a sun's flames — for the
 * design to paint the drum solid and write the rest over it.
 */
export function disk({ cols, rows, spin = 0, seed = 0, sun: burning = false, t = 0, aspect = 0.5, bare = false }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const s0 = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
  const r = mulberry(s0);
  const a1 = 2 + Math.floor(r() * 2), a2 = 3 + Math.floor(r() * 3);
  const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  const sea = 0.15 + r() * 0.5;                       // how much of the plate is water
  const lobes = 4 + Math.floor(r() * 4), skew = r() * TAU;
  const R = burning ? 0.7 : 0.97, Q = 0.44, TH = burning ? 0.2 : 0.3;   // a burning plate leaves room for its flames
  const roofed = !burning && rows >= 9;               // bare or not, the drum stands where the dome leaves it
  const dome = roofed && !bare;
  const stones = 10 + (s0 % 3) * 2;
  const DOME = 1.08;
  const unit = Math.max(0.5, Math.min((cols / 2 - 0.5) * aspect, rows / 2 - 0.5));
  // The plate is whole rows: three at the least — its far edge, its middle and
  // its near edge — with the rim's rows under them. A small ellipse cut where
  // the rows happen to fall is a sliver over a bar; this one is a coin at any size.
  const n = Math.max(3, Math.round(2 * Q * R * unit));
  const m = Math.max(1, Math.round(TH * unit));
  const half = n / 2;
  const cy = (rows - 1) / 2;
  const want = cy + (roofed ? 0.15 * unit : -m / 2);    // the plate's middle, a little low under a dome
  const c = n % 2 ? Math.round(want) : Math.round(want - 0.5) + 0.5;   // on a row, or between two
  const starAt = (x, y) => {
    let h = Math.imul(s0 ^ Math.imul(x + 3, 0x9e3779b1), 0x85ebca6b) ^ Math.imul(y + 11, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296 < 0.035;
  };
  const lines = [];
  const cx = (cols - 1) / 2;
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const U = ((x - cx) * aspect) / unit;
      const px = U / R, py = (y - c) / half;
      const rad = Math.hypot(px, py);
      if (rad <= 1) {
        // The plate's face, turned about its pole.
        const ang = Math.atan2(py, px) - spin;
        let b;
        if (burning) {
          const spoke = Math.pow(Math.abs(Math.cos(ang * lobes * 0.5 + skew)), 1.6);
          b = rad > 0.86 || rad < 0.22 ? 1 : 0.58 + 0.36 * spoke;
        } else if (rad > 0.88) b = 0.96;               // the wall of ice
        else if (rad < 0.1) b = 0.9;                   // the pole
        else {
          const f = Math.sin(ang * a1 + p1 + rad * 4) + 0.8 * Math.sin(ang * a2 - rad * 6 + p2) + 0.5 * Math.sin(rad * 9 + p3);
          b = f > sea - 0.4 ? 0.52 + 0.3 * clamp((f - sea + 0.4) / 1.6, 0, 1) : 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(ang * 5 + rad * 14));
        }
        line += glyphOf(clamp(b * (0.94 - 0.06 * px), 0.05, 1));
        continue;
      }
      // The rim: its rows under the plate's last row in this column, lit from the left.
      if (Math.abs(px) <= 1 && y > c) {
        const edge = half * Math.sqrt(1 - px * px);
        const last = Math.floor(c + edge + 1e-9);
        if (last >= Math.ceil(c - edge - 1e-9) && y <= last + m) {
          // The wall's stones, standing where the lands over them stand: the near half of the round.
          const joint = nearStep(Math.acos(clamp(px, -1, 1)) - spin, TAU / stones) < 0.07;
          line += glyphOf(clamp(((burning ? 0.62 : 0.42) - 0.16 * px) * (joint ? 0.55 : 1), 0.05, 1));
          continue;
        }
      }
      if (bare) { line += ' '; continue; }
      if (burning) {
        // Flames off the rim: a fan of rays that breathes with t.
        const ang = Math.atan2(py, px);
        const ray = Math.pow(Math.abs(Math.cos(ang * lobes * 0.5 + skew - spin + t * 0.21)), 2.4) * (0.62 + 0.38 * Math.sin(t * 0.9 + ang * 3));
        const b = rad < 1.42 ? clamp(ray * ((1.42 - rad) / 0.42) * 1.1 + Math.max(0, 1.1 - rad) * 2, 0, 1) : 0;
        line += b < 0.12 ? ' ' : glyphOf(b);
        continue;
      }
      if (dome && y < c) {
        // The firmament: a thin dome standing on the plate's edge, stars under it.
        const e = Math.hypot(px, (y - c) / unit / DOME);
        if (e <= 1 && e > 1 - 1.1 / unit) { line += glyphOf(0.2); continue; }
        if (e < 0.92 && starAt(x, y)) { line += glyphOf(0.05); continue; }
      }
      line += ' ';
    }
    lines.push(line);
  }
  return lines;
}

/** A seeded number in 0..1 for a pair of whole numbers: a bristle, a rivet, a facet. */
function pairHash(s0, a, b) {
  let h = Math.imul(s0 ^ Math.imul(a + 3, 0x9e3779b1), 0x85ebca6b) ^ Math.imul(b + 11, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
/** How far `v` is from the nearest whole multiple of `step`. */
function nearStep(v, step) {
  const m = ((v % step) + step) % step;
  return Math.min(m, step - m);
}
/** What every design's world is measured in: the cells from its middle to its edge, the short way. */
const reachOf = (cols, rows, aspect) => Math.max(0.5, Math.min((cols / 2 - 0.5) * aspect, rows / 2 - 0.5));

/**
 * A wire globe (1.0.4, the Blueprint design): a world as a draughtsman draws
 * it — its outline, its parallels and its meridians, and nothing between them.
 * The meridians wheel round with `spin`; those on the far side show through,
 * faint, since the globe is hollow. A small globe carries fewer lines. `sun`
 * makes it a drafted sun: a smaller globe with long and short rays set round
 * it, dashed, the dashes marching outward with `t`.
 */
export function wire({ cols, rows, spin = 0, seed = 0, sun: burning = false, t = 0, aspect = 0.5 }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const s0 = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
  const unit = reachOf(cols, rows, aspect);
  const R = burning ? 0.6 : 0.96;
  const reach = R * unit;                              // the globe's radius in rows
  const stepLon = TAU / (reach >= 8 ? 12 : reach >= 4 ? 8 : 6);
  const stepLat = reach >= 8 ? Math.PI / 6 : reach >= 4 ? Math.PI / 4 : Math.PI / 2;
  const th = 0.5 / unit;                               // half a row: a line's half width
  const tilt = 0.34 + ((s0 % 8) / 8) * 0.36;
  const roll = ((s0 % 5) - 2) * 0.16;
  const ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
  // How near a point of the globe is to one of its lines, as the eye sees it.
  const lineAt = (X, Y, z) => {
    const by = Y * ct + z * st, bz = -Y * st + z * ct;
    const lat = Math.asin(clamp(by / R, -1, 1));
    const lon = Math.atan2(X, bz) - spin;
    const d = Math.min(nearStep(lon, stepLon) * Math.cos(lat) * R, nearStep(lat, stepLat) * R);
    return d * (0.4 + 0.6 * Math.abs(z) / R);
  };
  const rays = 16;
  const lines = [];
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const X0 = ((x - cx) * aspect) / unit, Y0 = -(y - cy) / unit;
      const rad = Math.hypot(X0, Y0);
      if (rad > R + th * 0.6) {
        if (burning && rad > R + 0.1) {
          const ang = Math.atan2(Y0, X0);
          const k = Math.round(ang / (TAU / rays));
          const long = k % 2 === 0;
          const off = Math.abs(ang - k * (TAU / rays)) * rad;
          const dash = (Math.floor(rad * unit * 0.9 - t) % 3 + 3) % 3 !== 0;
          line += off < th * 0.9 && rad < (long ? 0.99 : 0.84) && dash ? glyphOf(long ? 0.62 : 0.4) : ' ';
        } else line += ' ';
        continue;
      }
      if (rad > R - th * 1.1) { line += glyphOf(0.95); continue; }
      const X = X0 * cr - Y0 * sr, Y = X0 * sr + Y0 * cr;
      const z = Math.sqrt(Math.max(0, R * R - rad * rad));
      if (lineAt(X, Y, z) < th) line += glyphOf(burning ? 0.9 : 0.72);
      else if (lineAt(X, Y, -z) < th * 0.8) line += glyphOf(burning ? 0.3 : 0.06);
      else line += ' ';
    }
    lines.push(line);
  }
  return lines;
}

/**
 * An ensō (1.0.4, the Ink design): a world as one stroke of the brush — a ring
 * begun heavy and wet, thinning as it goes round, its last third dry where the
 * bristles part, and left open before it meets its own beginning. No two are
 * begun at the same place or left as open; the stroke goes one way or the
 * other by the seed, and the ring wheels slowly with `spin`. `sun` is the
 * other thing a brush makes: a disc of solid ink, a pale wash round it that
 * breathes with `t`.
 */
export function enso({ cols, rows, spin = 0, seed = 0, sun: burning = false, t = 0, aspect = 0.5 }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const s0 = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
  const r = mulberry(s0);
  const way = s0 & 1 ? 1 : -1;
  const a0 = r() * TAU, gap = 0.07 + r() * 0.08, wob = r() * TAU, wide = 0.26 + r() * 0.1;
  const unit = reachOf(cols, rows, aspect);
  const R0 = 0.74;
  const lines = [];
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const X = ((x - cx) * aspect) / unit, Y = -(y - cy) / unit;
      const rad = Math.hypot(X, Y), ang = Math.atan2(Y, X);
      if (burning) {
        const edge = 0.6 * (1 + 0.035 * Math.sin(ang * 3 + wob + spin));
        if (rad <= edge) line += glyphOf(rad > edge - 0.5 / unit ? 0.8 : 0.99);
        else if (rad < 0.97) {
          const wash = (0.2 + 0.1 * Math.sin(t * 0.9 + ang * 2 + wob)) * (1 - (rad - edge) / (0.97 - edge) * 0.6);
          line += wash < 0.09 ? ' ' : glyphOf(wash);
        } else line += ' ';
        continue;
      }
      // Where on the stroke: 0 where the brush came down, 1 where it would close.
      const s = ((((ang - a0) * way - spin) / TAU) % 1 + 1) % 1;
      if (s > 1 - gap) { line += ' '; continue; }
      const ring = R0 * (1 + 0.035 * Math.sin(ang * 2 + wob));
      const half = Math.max((wide * (1 - 0.62 * s) * (s < 0.05 ? 1.2 : 1)) / 2, 0.52 / unit);
      const d = rad - ring;
      if (Math.abs(d) > half) { line += ' '; continue; }
      // The dry end: a bristle that has run out of ink leaves the paper bare.
      const hairs = Math.round(2 * half * unit * 1.3);
      if (s > 0.55 && hairs >= 2) {
        const hair = clamp(Math.floor(((d + half) / (2 * half)) * hairs), 0, hairs - 1);
        if (pairHash(s0, hair, 5) < (s - 0.55) * 1.5) { line += ' '; continue; }
      }
      line += glyphOf(clamp((0.99 - 0.4 * s) * (Math.abs(d) > half * 0.75 ? 0.72 : 1), 0.05, 1));
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A gem (1.0.4, the Art Deco design): a world as a cut stone seen from above —
 * a table in the middle, two rings of facets round it, the girdle a sharp line
 * at its edge. It turns under a light that stays where it is, so every facet
 * flashes as it comes to face the light, one after another round the stone.
 * The seed gives it six, eight or ten sides. `sun` is a sunburst: a disc, and
 * long and short pointed rays round it in steps of brightness, the short ones
 * breathing with `t`.
 */
export function gem({ cols, rows, spin = 0, seed = 0, sun: burning = false, t = 0, aspect = 0.5 }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const s0 = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
  const unit = reachOf(cols, rows, aspect);
  const n = 6 + 2 * (s0 % 3);
  const sector = TAU / n, apo = Math.cos(sector / 2);
  const rot = spin + (s0 % 7) * 0.3;
  const LIGHT = 2.3;                                   // upper left
  const RC = 0.97, RT = 0.46, MID = 0.74;
  // A point's place in a polygon standing at `turn`: 1 on its edge.
  const inPoly = (rad, ang, turn, rc) => {
    const a = ((((ang - turn) % sector) + sector) % sector) - sector / 2;
    return (rad * Math.cos(a)) / (rc * apo);
  };
  const facing = (normal) => Math.max(0, Math.cos(normal - LIGHT));
  const nRays = 12 + 4 * (s0 % 2), raySector = TAU / nRays;
  const lines = [];
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const X = ((x - cx) * aspect) / unit, Y = -(y - cy) / unit;
      const rad = Math.hypot(X, Y), ang = Math.atan2(Y, X);
      if (burning) {
        if (rad < 0.34) { line += glyphOf(1); continue; }
        if (rad < 0.42) { line += ' '; continue; }
        const k = Math.floor((ang - rot) / raySector + 0.5);
        const long = ((k % 2) + 2) % 2 === 0;
        const len = long ? 0.99 : 0.72 + 0.06 * Math.sin(t * 0.9 + k);
        const off = Math.abs(ang - rot - k * raySector);
        const part = (rad - 0.42) / (len - 0.42);
        if (part < 1 && off < raySector * 0.42 * (1 - part) + 0.25 / (unit * rad)) {
          line += glyphOf([1, 0.8, 0.62, 0.46][Math.min(3, Math.floor(part * 4))]);
        } else line += ' ';
        continue;
      }
      const out = inPoly(rad, ang, rot, RC);
      if (out > 1) { line += ' '; continue; }
      if (out > 1 - 0.7 / (unit * RC)) { line += glyphOf(0.95); continue; }      // the girdle
      const table = inPoly(rad, ang, rot + sector / 2, RT);
      if (table <= 1) {
        // The table flashes whole, once a turn.
        const flash = Math.pow(Math.max(0, Math.cos(rot * 1 - 0.8)), 10);
        line += glyphOf(clamp(table > 1 - 0.8 / (unit * RT) ? 0.8 : 0.46 + 0.5 * flash, 0.05, 1));
        continue;
      }
      // The crown: an inner ring of facets and an outer one, half a facet apart.
      const inner = out < MID;
      const halfSector = sector / 2;
      const id = Math.floor((ang - rot + (inner ? halfSector / 2 : 0)) / halfSector);
      const normal = rot + (id + 0.5) * halfSector - (inner ? halfSector / 2 : 0);
      const f = facing(normal);
      const b = (inner ? 0.42 : 0.26) + 0.3 * f + 0.4 * Math.pow(f, 14) + 0.06 * (((id % 2) + 2) % 2);
      line += glyphOf(clamp(b, 0.05, 1));
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A gear (1.0.4, the Clockwork and the Steampunk designs): a world as a wheel
 * of a movement — teeth round a rim, spokes, a hub with the hole its arbor
 * goes through. It turns one way or the other by its seed, so wheels beside
 * each other turn against each other as meshed wheels do. Clockwork's is fine:
 * many small teeth, a thin rim, thin spokes and nothing between them; a small
 * one is a plain wheel. `heavy` was Steampunk's: few broad teeth, a broad
 * riveted rim, four thick spokes and a plate between them with holes cut in
 * it — no design asks for it since Steampunk became part of Clockwork and the
 * map stayed Clockwork's; it is kept, and tested, for the day one does. `sun`
 * is a flywheel — a smooth rim, no teeth — in its own glow, which
 * breathes with `t`. `bare` leaves the glow out: the wheel alone, for a design
 * that paints its worlds solid.
 */
export function gear({ cols, rows, spin = 0, seed = 0, heavy = false, sun: burning = false, t = 0, aspect = 0.5, bare = false }) {
  cols = Math.max(5, Math.round(cols));
  rows = Math.max(3, Math.round(rows));
  const s0 = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
  const unit = reachOf(cols, rows, aspect);
  const way = s0 & 1 ? -1 : 1;
  const phase = (s0 % 11) * 0.37;
  const RT = burning ? 0.72 : 0.97;                    // the tips of its teeth, or a flywheel's edge
  const reach = RT * unit;
  const plain = !burning && reach < (heavy ? 2.4 : 3.2);
  const n = heavy ? clamp(Math.round(reach * 0.95) + (s0 % 3), 6, 12) : clamp(Math.round(reach * 2.3) + (s0 % 3) * 2, 10, 36);
  const RR = burning ? RT : RT * (heavy ? 0.76 : 0.86);  // the root of its teeth
  const RI = RT * (heavy ? 0.52 : burning ? 0.8 : 0.7);
  const RH = RT * (heavy ? 0.27 : 0.19), HOLE = RT * (heavy ? 0.1 : 0.07);
  const spokes = burning ? (heavy ? 6 : 8) : heavy ? 4 : 5 + (s0 % 2);
  const spokeStep = TAU / spokes;
  const spokeHalf = Math.max(heavy ? 0.1 * RT : 0.045 * RT, 0.5 / unit);
  const toothStep = TAU / n;
  const lines = [];
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const X = ((x - cx) * aspect) / unit, Y = -(y - cy) / unit;
      const rad = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X) - way * spin - phase;
      const lit = 0.95 - 0.07 * (X - Y);              // the light from the upper left
      if (rad > RT) {
        if (burning && !bare && rad < 1.02) {
          const glow = (1 - (rad - RT) / (1.02 - RT)) * (0.44 + 0.2 * Math.sin(t * 0.9 + Math.atan2(Y, X) * 3));
          line += glow < 0.1 ? ' ' : glyphOf(glow);
        } else line += ' ';
        continue;
      }
      if (plain) {
        line += glyphOf(clamp((rad > RT * 0.62 ? 0.84 : rad < RT * 0.3 ? 0.95 : 0.46) * lit, 0.05, 1));
        continue;
      }
      if (rad > RR) {
        // A tooth, narrower at its tip.
        const p = (((ang / toothStep) % 1) + 1) % 1;
        const up = (rad - RR) / (RT - RR);
        const half = heavy ? 0.3 - 0.1 * up : 0.27 * (1 - 0.55 * up);
        line += Math.abs(p - 0.5) < half ? glyphOf(clamp((heavy ? 0.9 : 0.97) * lit, 0.05, 1)) : ' ';
        continue;
      }
      if (rad >= RI) {
        let b = burning ? 0.97 : 0.76;
        if (heavy) {
          // Rivets round the middle of the rim, one to a tooth.
          const mid = (RI + RR) / 2;
          const off = Math.hypot(nearStep(ang, toothStep) * rad, rad - mid);
          b = off < Math.max(0.045, 0.5 / unit) ? 1 : rad > RR - 0.5 / unit || rad < RI + 0.5 / unit ? 0.82 : 0.6;
          if (burning) b = Math.max(b, 0.86);
        }
        line += glyphOf(clamp(b * lit, 0.05, 1));
        continue;
      }
      if (rad < HOLE) { line += ' '; continue; }
      if (rad <= RH) { line += glyphOf(clamp((rad > RH - 0.5 / unit ? 0.74 : 0.92) * lit, 0.05, 1)); continue; }
      // Between the hub and the rim: a spoke, or what is between the spokes.
      const k = Math.round(ang / spokeStep);
      const off = Math.abs(rad * Math.sin(ang - k * spokeStep));
      if (off < spokeHalf) { line += glyphOf(clamp((burning ? 0.9 : heavy ? 0.7 : 0.66) * lit, 0.05, 1)); continue; }
      if (heavy) {
        // The plate, a round hole cut in it between every two spokes.
        const mid = (RH + RI) / 2, between = (k + (ang - k * spokeStep > 0 ? 0.5 : -0.5)) * spokeStep;
        const dx = rad * Math.cos(ang - between) - mid, dy = rad * Math.sin(ang - between);
        const cut = Math.hypot(dx, dy) < (RI - RH) * 0.3;
        line += cut ? (burning && !bare ? glyphOf(0.3) : ' ') : glyphOf(clamp((burning ? 0.6 : 0.24) * lit, 0.05, 1));
        continue;
      }
      line += burning && !bare ? glyphOf(0.26 + 0.08 * Math.sin(t * 0.9 + ang * 2)) : ' ';
    }
    lines.push(line);
  }
  return lines;
}

/**
 * An art frame's cells by brightness, for a design that draws blocks and not
 * glyphs (Pixel): for every step of the ramp, the cells that carry it as
 * [col, row, col, row, …].
 */
export function cellsByShade(rows) {
  const out = Array.from({ length: RAMP.length }, () => []);
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const i = RAMP.indexOf(row[x]);
      if (i >= 0) out[i].push(x, y);
    }
  }
  return out;
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
