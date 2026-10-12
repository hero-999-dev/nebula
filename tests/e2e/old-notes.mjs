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
 *   node tests/e2e/old-notes.mjs            every note in Nebula Test's vault (npm run push runs it)
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

console.log(`long-note trials on ${docs.length} notes from this machine's vaults (copies)`);
let failed = 0;
let aborted = false;
await runDenseChecks((name, ok, detail = '') => {
  console.log(`  ${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`);
  // A run that could not finish (a wait that timed out on a busy machine) says
  // nothing about the notes; a trial that failed does.
  if (!ok && name === 'long-note trials ran to the end') aborted = true;
  else if (!ok) failed++;
}, { docs });

for (const { file, sha } of originals) {
  if (hash(file) !== sha) { console.log(`  x a note file changed during the trials: ${path.basename(file)}`); failed++; }
}
console.log(failed ? `\n${failed} failed` : aborted ? '\nthe run could not finish' : '\nevery trial passed on every note');
process.exit(failed ? 1 : aborted ? 2 : 0);
