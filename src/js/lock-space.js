/**
 * The moving sky behind the lock screen.
 *
 * The owner, 2026-10-21: "when Nebula is locked, space moves in the
 * background — the PIN menu like Constellation's, ASCII, transparent behind
 * it, so the menu in front is not broken". A faint <pre> of twinkling stars
 * and a slowly turning ringed planet, drawn with the Universe's own ASCII
 * engine (galaxy-ascii.js). It takes no clicks (pointer-events: none in
 * app.css), is hidden from screen readers, and stops by itself the moment the
 * lock screen leaves the document.
 */
import { sphere, stars, frameIndex, cacheKey, twinkle } from './galaxy-ascii.js';

const TAU = Math.PI * 2;
// One character cell of the 12px / 14px-line monospace face in app.css.
const CELL_W = 7.2;
const CELL_H = 14;
// What a container that has not been laid out yet (or jsdom) is drawn at.
const FALLBACK = { cols: 120, rows: 40 };
// ~25 fps; reduced motion is gentler, not frozen. At Constellation's 14 fps,
// with the Universe's 48 frames a turn, the planet moved under twice a second
// (owner, 1.0.1: "the lock screen turns at a low fps"): it has 360 now.
const TICK = 40;
const TICK_REDUCED = 250;
const TURN_SECONDS = 28;
const TURN_FRAMES = 360;

function reducedMotion() {
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * Put the sky in `container` (as its first child, so whatever follows is in
 * front) and start it turning. Returns { el, stop }.
 */
export function mount(container, { reduced = reducedMotion() } = {}) {
  const pre = document.createElement('pre');
  pre.className = 'lock-space';
  pre.setAttribute('aria-hidden', 'true');
  container.prepend(pre);

  const tick = reduced ? TICK_REDUCED : TICK;
  const pace = reduced ? 0.35 : 1;
  const frames = new Map();
  let size = null;
  let sky = [];
  let timer = 0;
  let started = 0;
  let stopped = false;

  const measure = () => {
    const w = container.clientWidth, h = container.clientHeight;
    const cols = w > 0 ? Math.max(20, Math.floor(w / CELL_W)) : FALLBACK.cols;
    const rows = h > 0 ? Math.max(10, Math.floor(h / CELL_H)) : FALLBACK.rows;
    if (size && size.cols === cols && size.rows === rows) return;
    size = { cols, rows };
    sky = stars('lock-space', Math.round((cols * rows) / 55), cols, rows);
    frames.clear();
  };
  const onResize = () => { size = null; };

  const planet = (spin) => {
    const prow = Math.max(9, Math.min(26, Math.round(size.rows * 0.42)));
    const pcols = Math.round(prow * 2.6);
    const idx = frameIndex(spin, TURN_FRAMES);
    const key = cacheKey(pcols, prow, idx);
    let art = frames.get(key);
    if (!art) {
      art = sphere({ cols: pcols, rows: prow, spin: (idx / TURN_FRAMES) * TAU, ring: true, seed: 'lock-space' });
      frames.set(key, art);
    }
    return art;
  };

  const draw = (seconds) => {
    if (!size) measure();
    const { cols, rows } = size;
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(' '));
    for (const s of sky) {
      const { ch } = twinkle(s, seconds * pace);
      const x = Math.floor(s.x), y = Math.floor(s.y);
      if (ch !== ' ' && y < rows && x < cols) grid[y][x] = ch;
    }
    // The planet sits up and to the left, clear of the card in the middle.
    const art = planet((seconds * pace * TAU) / TURN_SECONDS);
    const top = Math.max(0, Math.round(rows * 0.3 - art.length / 2));
    const left = Math.max(0, Math.round(cols * 0.2 - (art[0]?.length || 0) / 2));
    art.forEach((line, r) => {
      const y = top + r;
      if (y >= rows) return;
      for (let c = 0; c < line.length; c++) {
        const x = left + c;
        if (x < cols && line[c] !== ' ') grid[y][x] = line[c];
      }
    });
    const text = grid.map((row) => row.join('')).join('\n');
    if (pre.textContent !== text) pre.textContent = text;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    globalThis.removeEventListener?.('resize', onResize);
  };

  const step = () => {
    if (stopped) return;
    if (!pre.isConnected) { stop(); return; }
    draw((Date.now() - started) / 1000);
    timer = setTimeout(step, tick);
  };

  globalThis.addEventListener?.('resize', onResize);
  started = Date.now();
  draw(0);
  // The first step waits a tick, so a container appended right after mount() is in the page by then.
  timer = setTimeout(step, tick);
  return { el: pre, stop };
}
