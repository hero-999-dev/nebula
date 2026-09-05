/**
 * The release ritual: `npm run push`.
 *
 * Tests -> build -> version bump -> Log.md -> commit -> tag -> push.
 *
 * Pushing the tag is what starts everything else: .github/workflows/release.yml
 * builds the Windows installer and the macOS DMG, and publishes them as a
 * GitHub Release. Installed copies of Nebula see it on their next check.
 *
 *   npm run push                  patch bump  (0.3.0 -> 0.3.1)
 *   npm run push -- minor         0.3.0 -> 0.4.0
 *   npm run push -- major         0.3.0 -> 1.0.0
 *   npm run push -- 0.5.2         exact version
 *   npm run push -- --notes "..." headline for the Log.md entry
 *   npm run push -- --dry-run     do everything except commit/tag/push
 *   npm run push -- --no-flash    skip the USB drive mirror
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipFlash = args.includes('--no-flash');
const notesIdx = args.indexOf('--notes');
const headline = notesIdx >= 0 ? args[notesIdx + 1] : null;
const bumpArg = args.find((a) => !a.startsWith('--') && a !== headline) ?? 'patch';

const REPO = 'hero-999-dev/nebula';

function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function runLoud(cmd, cmdArgs) {
  execFileSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}

function git(...gitArgs) {
  return run('git', gitArgs);
}

function tryGit(...gitArgs) {
  try { return git(...gitArgs); } catch { return null; }
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function nextVersion(current, how) {
  if (/^\d+\.\d+\.\d+/.test(how)) return how;
  const [major, minor, patch] = current.split('.').map(Number);
  if (how === 'major') return `${major + 1}.0.0`;
  if (how === 'minor') return `${major}.${minor + 1}.0`;
  if (how === 'patch') return `${major}.${minor}.${patch + 1}`;
  fail(`Unknown bump "${how}" — use patch, minor, major, or an exact version like 0.4.2.`);
  return null;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ------------------------------------------------------------- preflight */

if (!fs.existsSync(path.join(ROOT, '.git'))) {
  fail('Not a git repository. Run the one-time setup in docs/RELEASE.md first.');
}
if (!tryGit('remote', 'get-url', 'origin')) {
  fail(`No "origin" remote. Expected https://github.com/${REPO}.git — see docs/RELEASE.md.`);
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main' && !args.includes('--any-branch')) {
  fail(`On branch "${branch}". Releases go out from main (or pass --any-branch).`);
}

const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = nextVersion(pkg.version, bumpArg);
const tag = `v${version}`;

if (tryGit('rev-parse', '-q', '--verify', `refs/tags/${tag}`)) {
  fail(`Tag ${tag} already exists. Pick another version.`);
}

console.log(`\nNebula ${pkg.version} -> ${version}${dryRun ? '   (dry run)' : ''}\n`);

/* ------------------------------------------------- gates: tests and build */
// Nothing is committed until both of these pass. A release that fails to build
// still creates a tag that users' apps will try to update to.

console.log('> npm test');
runLoud('npm', ['test']);

console.log('\n> npm run build');
runLoud('npm', ['run', 'build']);

/* ---------------------------------------------------- version and changelog */

pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

const lastTag = tryGit('describe', '--tags', '--abbrev=0');
const range = lastTag ? `${lastTag}..HEAD` : null;
const subjects = (range ? tryGit('log', range, '--pretty=format:%s') : tryGit('log', '--pretty=format:%s')) || '';
const bullets = subjects
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((s) => !/^Nebula v\d+\.\d+\.\d+$/.test(s))
  .map((s) => `* ${s}`);

const logPath = path.join(ROOT, 'Log.md');
const header = fs.existsSync(logPath) ? '' : '# Nebula release log\n\nOne entry per release. Written by `npm run push`.\n';
const entry = [
  `## [${timestamp()}] ${tag} - by claude`,
  '',
  headline ? `${headline}\n` : '',
  bullets.length ? bullets.join('\n') : '* (no commits since the last release)',
  '',
  '---',
  '',
].join('\n');

const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
const body = existing.startsWith('# ')
  ? existing.replace(/^(# .*\n(?:(?!^## ).*\n)*)/m, `$1\n${entry}`)
  : `${header}\n${entry}${existing}`;
fs.writeFileSync(logPath, body, 'utf8');

if (dryRun) {
  console.log(`\nDry run — package.json and Log.md updated locally, nothing pushed.`);
  console.log(`Undo with:  git checkout -- package.json Log.md\n`);
  process.exit(0);
}

/* ------------------------------------------------------- commit, tag, push */

git('add', '-A');
git('commit', '-m', `Nebula ${tag}`);
git('tag', '-a', tag, '-m', `Nebula ${tag}`);
git('push', 'origin', branch, '--follow-tags');

console.log(`\n  pushed ${tag}`);
console.log(`  build:    https://github.com/${REPO}/actions`);
console.log(`  release:  https://github.com/${REPO}/releases/tag/${tag}`);
console.log('\n  The Windows installer and the macOS DMG appear on the release page in ~10 minutes.');
console.log('  Installed copies of Nebula offer the update on their next check.\n');

/* -------------------------------------------------------------- usb mirror */

if (!skipFlash) {
  try {
    runLoud('node', [path.join(ROOT, 'scripts', 'sync-flash.js')]);
  } catch {
    console.warn('  (flash sync skipped or failed — run `npm run sync-flash` when the drive is in)');
  }
}
