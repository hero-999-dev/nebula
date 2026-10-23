/**
 * The long-note trials on the notes people actually have (owner, 2026-09-27).
 *
 * Every other trial runs on notes this version wrote, which can hold nothing
 * an older version left behind — and that was the owner's complaint: a bug
 * fixed in the app kept happening inside the notes it had already touched.
 * This runs the same trials on COPIES of the notes in Nebula Test's vault
 * (Nebula-data beside the project). The notes never leave the machine, nothing
 * is written back, and the files are checked to be byte-identical afterwards.
 * With no notes there is nothing to try (exit 3).
 *
 * NEVER the installed app: C:/Program Files/Nebula and its notes
 * (%APPDATA%/nebula) are the owner's private notes and are not to be opened,
 * read or copied by any agent or test (owner, 2026-09-28). 0.9.1 read them
 * here; that was removed.
 *
 * Lighter since 1.0.1 (owner, 2026-10-22, never dropped): one note of each
 * structure is tried, not the guide (smoke and the rebuild try it), and a
 * failed trial runs once more on its note alone before the release stops.
 *
 *   node tests/e2e/old-notes.mjs            Nebula Test's vault, one note per structure (npm run push runs it)
 *   NEBULA_OLD_NOTES=dir1;dir2 node ...     other vaults' notes folders
 *
 * Exit: 0 all passed · 1 a trial failed · 2 the run could not finish · 3 no notes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDenseChecks } from './dense.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function vaults() {
  if (process.env.NEBULA_OLD_NOTES) return process.env.NEBULA_OLD_NOTES.split(';').filter(Boolean);
  // Nebula Test only — never the installed app's notes (see above).
  return [path.join(root, 'Nebula-data', 'storage', 'notes')];
}

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const docs = [];
const originals = [];
for (const dir of vaults()) {
  if (!fs.existsSync(dir)) continue;
  // A note is a folder of its own since 0.9.4 (notes/<id>/<id>.json, its pictures and videos beside it);
  // a vault an older version wrote still has notes/<id>.json. Both are tried.
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .map((e) => (e.isDirectory() ? { file: `${e.name}.json`, full: path.join(dir, e.name, `${e.name}.json`), mediaDir: path.join(dir, e.name), sourceId: e.name }
      : { file: e.name, full: path.join(dir, e.name) }))
    .filter((e) => e.file.endsWith('.json') && fs.existsSync(e.full));
  for (const { file, full, mediaDir, sourceId } of entries) {
    // The rebuilt articles have a run of their own (npm run rebuild); the
    // guide is always in the trials already.
    if (file.startsWith('rebuild-')) continue;
    let note;
    try { note = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
    // The guide under any of its four titles (0.9.4: it follows the app's language).
    if (typeof note?.content !== 'string' || note.deletedAt
      || /^(Welcome to Nebula Guide|Willkommen bei Nebula – Anleitung|Witaj w Nebul[ai] – przewodnik|Nebula’ya Hoş Geldiniz – Rehber)/.test(note.title ?? '')) continue;
    originals.push({ file: full, sha: hash(full) });
    // Named by vault and file, never by title: titles are the owner's words.
    docs.push({ name: `${path.basename(path.dirname(path.dirname(dir)))}/${file.replace(/\.json$/, '')}`, title: note.title || 'Untitled', content: note.content, mediaDir, sourceId });
  }
}

if (!docs.length) {
  console.log('  (no notes found in this machine\'s vaults — nothing to try)');
  process.exit(3);
}

/**
 * What a note is built of: every element as its parent > itself, with its
 * classes (digits dropped: ids and sizes are not structure). Two notes with the
 * same set hold the same blocks in the same nesting, and a trial that passes in
 * one says what it would in the other (owner, 2026-10-22: in 1.0.1's run 35 of
 * 42 notes were only opened and saved, many of them alike).
 */
const VOID = new Set(['br', 'hr', 'img', 'input', 'wbr', 'source', 'col', 'area', 'embed', 'track', 'meta', 'link']);
function structure(html) {
  const seen = new Set();
  const stack = ['note'];
  for (const [, close, tag, attrs] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const t = tag.toLowerCase();
    if (close) { const at = stack.lastIndexOf(t); if (at > 0) stack.length = at; continue; }
    const cls = (/\bclass\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/).filter(Boolean).map((c) => c.replace(/\d+/g, '#')).sort();
    seen.add(`${stack.at(-1)}>${[t, ...cls].join('.')}`);
    if (!VOID.has(t) && !attrs.trimEnd().endsWith('/')) stack.push(t);
  }
  return [...seen].sort().join(' ');
}
const groups = new Map();
for (const d of docs) {
  const key = structure(d.content);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(d);
}
// Of each group, the note with the most in it: the likeliest to have places for the trials.
const tried = [...groups.values()].map((g) => g.reduce((a, b) => (b.content.length > a.content.length ? b : a)));

// The guide is tried by smoke and by the page rebuild already; here only the vault's notes.
console.log(`long-note trials on ${tried.length} of ${docs.length} notes from this machine's vaults (copies): one of each structure`);
const run = async (list) => {
  const out = { failed: [], aborted: false };
  await runDenseChecks((name, ok, detail = '') => {
    console.log(`  ${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`);
    // A run that could not finish (a wait that timed out on a busy machine) says
    // nothing about the notes; a trial that failed does.
    if (!ok && name === 'long-note trials ran to the end') out.aborted = true;
    else if (!ok) out.failed.push(name);
  }, { docs: list, guide: false });
  return out;
};
let { failed, aborted } = await run(tried);

// A trial that failed is run once more on that note alone, as smoke's failed
// files are (retryAlone in scripts/release.js): most such failures were a wait
// on a busy machine. If it passes alone the release goes on and Log.md says so.
const retriedFile = path.join(root, 'test-results', 'old-notes-retried.json');
fs.rmSync(retriedFile, { force: true });
const named = failed.map((n) => /^long note "([^"]+)"/.exec(n)?.[1]);
const again = [...new Set(named)];
if (failed.length && !aborted && !again.includes(undefined) && again.length <= 3) {
  console.log(`\n  ! ${failed.length} trial(s) failed in ${again.length} note(s) — running ${again.length === 1 ? 'that note' : 'those notes'} alone once.\n`);
  const second = await run(tried.filter((d) => again.includes(d.name)));
  if (!second.failed.length && !second.aborted) {
    fs.mkdirSync(path.dirname(retriedFile), { recursive: true });
    fs.writeFileSync(retriedFile, JSON.stringify({ notes: again.length, failed }));
  }
  ({ failed, aborted } = second);
}

for (const { file, sha } of originals) {
  if (hash(file) !== sha) { console.log(`  x a note file changed during the trials: ${path.basename(file)}`); failed.push(file); }
}
console.log(failed.length ? `\n${failed.length} failed` : aborted ? '\nthe run could not finish' : '\nevery trial passed on every note tried');
process.exit(failed.length ? 1 : aborted ? 2 : 0);
