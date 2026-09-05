/**
 * Mirror this project onto the portable drive.
 *
 * The drive (volume label HeroAI64GB) carries a per-machine copy of the
 * workspace. Two rules from its own _hub/AGENTS.md are honoured here:
 *
 *   - The drive letter is NOT stable across machines, so the drive is located
 *     by volume label and never by a hard-coded letter.
 *   - robocopy exits 1 when it copied files. Anything under 8 is success;
 *     treating "non-zero" as failure reports every successful sync as broken.
 *
 * Nothing secret is written: build output, node_modules and .git are excluded,
 * and this project holds no credentials of its own.
 *
 *   npm run sync-flash
 *   npm run sync-flash -- --machine LegionGo
 *   npm run sync-flash -- --dry-run
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const machineIdx = args.indexOf('--machine');
const MACHINE = machineIdx >= 0 ? args[machineIdx + 1] : 'AcerSwift';
const LABEL = 'HeroAI64GB';
const WORKSPACE = 'Cursor X Antigravity';

const EXCLUDE_DIRS = ['node_modules', 'dist', 'dist-electron', 'release', '.dev-profile', '.git'];

if (process.platform !== 'win32') {
  console.log('sync-flash currently supports Windows only.');
  process.exit(0);
}

/**
 * Find the drive by looking for its hub, not by asking for a volume label.
 *
 * Identifying it by content is both letter-independent (the drive's own
 * _hub/AGENTS.md insists on that) and more robust than a WMI query, which
 * returns nothing from some sandboxed shells.
 */
function findDrive() {
  for (let c = 'D'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const letter = `${String.fromCharCode(c)}:`;
    if (fs.existsSync(path.join(`${letter}\\`, '_hub', 'AGENTS.md'))) return letter;
  }
  return null;
}

const drive = findDrive();
if (!drive) {
  console.log(`The "${LABEL}" drive is not plugged in (no _hub/AGENTS.md on any drive) - nothing to sync.`);
  process.exit(0);
}

const destRoot = path.join(`${drive}\\`, MACHINE, WORKSPACE);
const dest = path.join(destRoot, path.basename(ROOT));

if (!fs.existsSync(destRoot)) {
  console.error(`No workspace folder on the drive: ${destRoot}`);
  console.error(`(pass --machine <name> if this machine's folder is called something else)`);
  process.exit(1);
}

console.log(`  ${ROOT}`);
console.log(`->  ${dest}`);
if (dryRun) console.log('  (dry run)');

const roboArgs = [
  ROOT, dest, '/MIR', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NP',
  '/XD', ...EXCLUDE_DIRS,
];
if (dryRun) roboArgs.push('/L');

let code = 0;
try {
  execFileSync('robocopy', roboArgs, { stdio: 'inherit' });
} catch (err) {
  code = err.status ?? 16;
}

// robocopy: 0 = nothing to do, 1 = files copied, 2 = extra files, 3 = both...
// 8 and above is a genuine failure.
if (code >= 8) {
  console.error(`\nrobocopy failed (exit ${code}).`);
  process.exit(1);
}

// The workspace notes live one level up and belong on the drive too.
const notes = path.join(path.dirname(ROOT), 'PROJECT-NOTES.md');
if (fs.existsSync(notes) && !dryRun) {
  fs.copyFileSync(notes, path.join(destRoot, 'PROJECT-NOTES.md'));
  console.log('  + PROJECT-NOTES.md');
}

console.log(`\nSynced to ${drive} (robocopy exit ${code} - under 8 is success).`);
