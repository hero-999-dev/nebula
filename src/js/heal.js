/**
 * Every note in the vault brought up to this version — once per version.
 *
 * Opening a note repairs it (main.js, openNote → migrate.js), but a note nobody
 * opens keeps what an older version wrote: in search, in the sidebar, in an
 * export carried to another computer, and for whoever opens it next. The
 * owner's rule (2026-09-27): a bug fixed in the app must not live on inside
 * the notes it already touched, on any computer. So on the first start of a
 * version that changed how notes are written, every note goes through the same
 * migration, a few at a time while the app is idle, after a copy of the vault
 * has been put aside.
 *
 * Only markup is repaired. A note whose words, pictures, links, shapes, code
 * blocks, equations, dividers or list items would come out different is left
 * exactly as it was and reported: a repair that loses a word is not a repair.
 */

import { migrateNote, MARKUP_VERSION } from './migrate.js';
import { getCode } from './codeblock.js';

/**
 * Parts of the markup that are the app's own controls and paint, not the
 * note's words — and the two kinds whose words are kept in an attribute (a code
 * block's source, an equation's TeX) and compared from there instead.
 */
const CHROME = [
  '.blk-code', '.inline-eq', '.katex', '.shape-layer', '.image-layer',
  '.link-del', '.link-card__kind', '.image-h', '.shape-rot', '.shape-h', '.shape-angle',
].join(', ');

/** What a repair must not change: [what, selector]. */
const COUNTED = [
  ['pictures', 'img'],
  ['links', '.link-block, a[href]'],
  ['shapes', '.shape'],
  ['code', '.blk-code'],
  ['equations', '.inline-eq'],
  ['dividers', 'hr'],
  ['items', 'li, .blk-todo'],
];

/** The note's words and the things it holds, independent of how they are marked up. */
export function fingerprint(root) {
  const counts = {};
  for (const [name, selector] of COUNTED) counts[name] = root.querySelectorAll(selector).length;
  const copy = root.cloneNode(true);
  copy.querySelectorAll(CHROME).forEach((el) => el.remove());
  const words = tidy(copy.textContent);
  // The words on the canvas (in shapes, under floating pictures) are compared
  // as a set: 0.8.8 moved pictures between layers, which reorders them there.
  const canvas = [...root.querySelectorAll('.shape-layer .shape-text, .shape-layer .image-caption, .image-layer .image-caption')]
    .map((el) => tidy(el.textContent)).sort().join('|');
  // A code block's source is its data-code (painted into the page on open), an
  // equation's is its data-tex; a block with no attribute yet holds it as text.
  const code = [...root.querySelectorAll('.blk-code')]
    .map((block) => (block.hasAttribute('data-code') ? getCode(block) : block.querySelector('.code-src')?.textContent ?? ''))
    .join('\u0000');
  const tex = [...root.querySelectorAll('.inline-eq')].map((eq) => eq.getAttribute('data-tex') ?? '').join('\u0000');
  return { words, canvas, code, tex, counts };
}

const tidy = (text) => text.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();

export function sameNote(a, b) {
  return a.words === b.words && a.canvas === b.canvas && a.code === b.code && a.tex === b.tex
    && COUNTED.every(([name]) => a.counts[name] === b.counts[name]);
}

/**
 * One note's markup, repaired off-screen. Nothing is laid out here, so what
 * needs measuring (a shape's height) waits for the note to be opened.
 * @returns {{html: string, changed: boolean, safe: boolean}}
 */
export function healHtml(html) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  const root = doc.body;
  const before = fingerprint(root);
  migrateNote(root);
  const out = root.innerHTML;
  return { html: out, changed: out !== html, safe: sameNote(before, fingerprint(root)) };
}

/**
 * Repair every note not yet brought up to MARKUP_VERSION.
 *
 * @param {import('./notes.js').NoteStore} store
 * @param {object} [opts]
 * @param {(label: string) => Promise<{ok: boolean}>} [opts.backup] puts the
 *   vault aside first; without a working backup nothing is written
 * @param {(fn: () => void) => void} [opts.idle] how to wait between notes
 * @param {(note: object) => boolean} [opts.skip] a note to leave to someone else
 *   (the open one: opening it already repaired it, on screen, with layout)
 * @param {(html: string) => {html: string, changed: boolean, safe: boolean}} [opts.heal]
 *   the repair itself; replaceable so a test can make one unsafe
 * @returns {Promise<{healed: number, unchanged: number, refused: string[], aborted?: boolean}>}
 */
export async function healVault(store, { backup, idle = (fn) => setTimeout(fn, 0), skip = () => false, heal = healHtml } = {}) {
  const due = store.notes.filter((n) => n && typeof n.content === 'string' && n.markupVersion !== MARKUP_VERSION && !skip(n));
  const result = { healed: 0, unchanged: 0, refused: [] };
  if (!due.length) return result;
  if (backup) {
    const done = await backup(`pre-heal-${MARKUP_VERSION}`).catch(() => null);
    if (!done?.ok) return { ...result, aborted: true };
  }
  const repairs = [];
  for (const note of due) {
    await new Promise((resolve) => idle(resolve));
    const from = note.content;
    let res;
    try { res = heal(from); } catch { result.refused.push(note.id); continue; }
    if (!res.safe) { result.refused.push(note.id); continue; }
    if (res.changed) result.healed += 1; else result.unchanged += 1;
    repairs.push({ id: note.id, from, content: res.html });
  }
  store.healMany(repairs, MARKUP_VERSION);
  return result;
}
