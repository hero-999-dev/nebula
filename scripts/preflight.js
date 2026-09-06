/**
 * preflight.js — run this FIRST, every session, before touching a file.
 *
 * Nebula is worked on by whichever CLI agent happens to be open, and there is
 * no shared memory between them beyond this repository. The tracking files ARE
 * the handover: this script reads them back so the next session starts knowing
 * what the last one did, instead of rediscovering it from the diff.
 *
 *   npm run preflight
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './paths.js';
import { checkVersions } from './versions.js';

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
};

const read = (rel) => {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
};
const readJson = (rel) => {
  try { return JSON.parse(read(rel) ?? ''); } catch { return null; }
};
const git = (...args) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; }
};

const head = (title) => console.log(`\n${c.bold}${c.cyan}${title}${c.reset}`);

/* ------------------------------------------------------------------ where */

const pkg = readJson('package.json');
const memory = readJson('memory.json');
const lastTag = git('describe', '--tags', '--abbrev=0');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');

console.log(`\n${c.bold}Nebula v${pkg?.version ?? '?'}${c.reset}  ${c.dim}branch ${branch ?? '?'} · last release ${lastTag ?? 'none'}${c.reset}`);

if (memory?.currentPhase) {
  head('Phase');
  console.log(`  ${memory.currentPhase}`);
  if (memory.next) console.log(`  ${c.dim}next: ${memory.next}${c.reset}`);
}

/* ------------------------------------------------------- what last happened */

const log = read('Log.md');
if (log) {
  head('Last entries in Log.md');
  const entries = [...log.matchAll(/^## \[([^\]]+)\]\s*(\S*)\s*-\s*by (.+)$/gm)];
  for (const m of entries.slice(0, 3)) {
    const body = log.slice(m.index + m[0].length).split(/\n## /)[0].trim().split('\n');
    const first = body.find((l) => l.trim() && !l.startsWith('#')) ?? '';
    console.log(`  ${c.green}${m[2] || ''}${c.reset} ${c.dim}${m[1]} by ${m[3]}${c.reset}`);
    console.log(`    ${first.replace(/^\*\s*/, '').slice(0, 110)}`);
  }
  if (!entries.length) console.log(`  ${c.dim}(no entries yet)${c.reset}`);
}

/* ------------------------------------------------------------ what changed */

head(`Changed since ${lastTag ?? 'the first commit'}`);
const committed = (lastTag ? git('diff', '--name-only', `${lastTag}..HEAD`) : git('ls-files')) ?? '';
const dirty = git('status', '--porcelain') ?? '';

const committedFiles = committed.split('\n').filter(Boolean);
const dirtyFiles = dirty.split('\n').filter(Boolean).map((l) => l.slice(3));

if (!committedFiles.length && !dirtyFiles.length) {
  console.log(`  ${c.dim}nothing — the tree matches the last release${c.reset}`);
} else {
  for (const f of committedFiles.slice(0, 25)) console.log(`  ${c.dim}committed${c.reset}  ${f}`);
  if (committedFiles.length > 25) console.log(`  ${c.dim}…and ${committedFiles.length - 25} more${c.reset}`);
  for (const f of dirtyFiles) console.log(`  ${c.yellow}uncommitted${c.reset} ${f}`);
}

/* --------------------------------------------------- are the docs keeping up */

head('Tracking files');
const TRACKED = ['Log.md', 'tests.md', 'memory.json', 'Prompt.md', 'HANDOVER.md', 'README.md', 'AGENTS.md'];
const srcTouched = [...committedFiles, ...dirtyFiles].some((f) =>
  f.startsWith('src/') || f.startsWith('electron/') || f.startsWith('scripts/') || f.startsWith('tests/'));

for (const file of TRACKED) {
  const exists = fs.existsSync(path.join(ROOT, file));
  const touched = [...committedFiles, ...dirtyFiles].includes(file);
  const mark = !exists ? `${c.red}missing${c.reset}`
    : touched ? `${c.green}updated${c.reset}`
    : srcTouched ? `${c.yellow}not updated${c.reset}`
    : `${c.dim}unchanged${c.reset}`;
  console.log(`  ${mark.padEnd(22)} ${file}`);
}
if (srcTouched) {
  console.log(`\n  ${c.dim}Code changed since the last release. Log.md, tests.md and memory.json${c.reset}`);
  console.log(`  ${c.dim}are expected to change with it — npm run push checks this too.${c.reset}`);
}

/* ------------------------------------------------------- do the versions agree */

head('Versions');
{
  const { ok, rows } = checkVersions(pkg?.version);
  for (const r of rows) {
    console.log(`  ${r.ok ? `${c.dim}ok${c.reset}   ` : `${c.red}DRIFT${c.reset}`} ${r.file.padEnd(18)} ${r.found ?? '(not found)'}`);
  }
  if (!ok) console.log(`\n  ${c.yellow}npm run push restamps these; do not edit a version by hand.${c.reset}`);
}

/* ------------------------------------------------------------------- say it */

console.log(`\n${c.bold}Before editing anything, state:${c.reset}`);
console.log(`  ${c.dim}"Working on v${pkg?.version ?? '?'}. Last session: <what>. Files changed: <summary>. I will now <plan>."${c.reset}`);
console.log(`\n${c.dim}Full rules: AGENTS.md · new here? HANDOVER.md${c.reset}\n`);
