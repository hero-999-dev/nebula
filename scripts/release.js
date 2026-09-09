/**
 * The release ritual: `npm run push`.
 *
 * Tests -> build -> version bump -> Log.md -> commit -> tag -> push, then the
 * three things that must not fall behind the tag: the local `Nebula Test.exe`,
 * the docs site, and the USB mirror.
 *
 * Pushing the tag is what starts everything else: .github/workflows/release.yml
 * builds the Windows installer and the macOS DMG, and publishes them as a
 * GitHub Release. Installed copies of Nebula see it on their next check.
 * BOTH platforms build on every tag and neither is asked about: the repository
 * is public, and GitHub Actions is free and unlimited on public repos —
 * including the macOS runner, which is billed at 10x only on private ones.
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
import { stampVersions, checkVersions } from './versions.js';

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
  // npm/npx are .cmd shims on Windows and need a shell. node does not — and
  // giving it one concatenates the arguments unquoted, so a repository path
  // containing a space (…\AI Workspace\…) becomes two arguments and the script
  // "cannot be found". Only shell what actually needs shelling.
  const needsShell = process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx');
  execFileSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: needsShell });
}

/** Like runLoud, but hands back the exit code instead of throwing. */
function runSoft(cmd, cmdArgs) {
  const needsShell = process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx');
  try {
    execFileSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: needsShell });
    return 0;
  } catch (err) {
    return err.status ?? 1;
  }
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

/**
 * Every release says what it changed.
 *
 * The card is only as good as the notes behind it, and the version being
 * released is the one that needs an entry — the tests run BEFORE the bump, so
 * they can only ever vouch for the version being replaced. This is the gate
 * that looks forward.
 */
{
  const notesFile = path.join(ROOT, 'src', 'js', 'release-notes.js');
  const src = fs.readFileSync(notesFile, 'utf8');
  if (!new RegExp(`['"]${version.replace(/\./g, '\\.')}['"]\\s*:`).test(src)) {
    fail(`No release notes for ${version}.\n`
      + `  Add an entry to src/js/release-notes.js — it is what the what's-new\n`
      + `  card shows the user on their first run of this build.`);
  }
}

console.log(`\nNebula ${pkg.version} -> ${version}${dryRun ? '   (dry run)' : ''}\n`);

/* ------------------------------------------------- gates: tests and build */
// Nothing is committed until both of these pass. A release that fails to build
// still creates a tag that users' apps will try to update to.

// Close any running Nebula FIRST, not later.
//
// `pack:test` has always called this, but that runs after the tag — so the
// heaviest part of a release (Vitest, a full Vite build, then six Electron
// launches for the smoke suite) happened while the installed app and the test
// build were still holding ~1.6 GB between them. Four releases in a row were
// killed for want of memory, twice after the gates had already passed. The
// same processes get closed either way; closing them at the start is simply
// the order that works.
console.log('> npm run kill');
runSoft('npm', ['run', 'kill']);

console.log('\n> npm test');
runLoud('npm', ['test']);

console.log('\n> npm run build');
runLoud('npm', ['run', 'build']);

// The smoke suite reports 2 when the RUN could not finish — a Playwright wait
// that timed out because the window stopped being composited, which is what a
// machine short of memory does, and this runs straight after the unit tests and
// a full build. That says nothing about the code, so it gets one more attempt.
// Exit 1 is a check that actually failed, and stops the release immediately.
console.log('\n> npm run smoke');
{
  const first = runSoft('npm', ['run', 'smoke']);
  if (first === 1) fail('Smoke checks failed. Nothing was committed.');
  if (first !== 0) {
    console.warn(`\n  ! the smoke run could not finish (exit ${first}) — retrying once.\n`);
    const second = runSoft('npm', ['run', 'smoke']);
    if (second === 1) fail('Smoke checks failed. Nothing was committed.');
    if (second !== 0) fail('Smoke could not complete twice. Nothing was committed.');
  }
}

// The docs site is NOT built here. It stamps the version from package.json, and
// the bump happens below — building it now publishes a page that is one release
// behind, every time. It is built after the tag instead.

/* --------------------------------------------- did the tracking files keep up */
// Log.md and memory.json are written below, so only tests.md is a judgement
// call. A release whose code moved but whose test log did not is usually a
// session that forgot to record what it proved.
{
  const since = tryGit('describe', '--tags', '--abbrev=0');
  const changed = [
    ...((since ? tryGit('diff', '--name-only', `${since}..HEAD`) : '') || '').split('\n'),
    ...((tryGit('status', '--porcelain') || '').split('\n').map((l) => l.slice(3))),
  ].filter(Boolean);

  const codeMoved = changed.some((f) => /^(src|electron|tests|scripts)\//.test(f));
  if (codeMoved && !changed.includes('tests.md')) {
    console.warn('\n  ! tests.md has not changed since the last release, but code has.');
    console.warn('    Record what the new or changed tests prove — see AGENTS.md.\n');
  }
}

/* ---------------------------------------------------- version and changelog */

pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

// Everything that prints a version is rewritten from package.json, and the docs
// site is rebuilt HERE rather than after the tag — so the site committed in this
// release is the site this release publishes. Building it later is what made the
// published page trail one version behind.
const stamped = stampVersions(version);
if (stamped.length) console.log(`  restamped ${stamped.join(', ')}`);

console.log('\n> npm run site');
runLoud('npm', ['run', 'site']);

const versions = checkVersions(version);
if (!versions.ok) {
  for (const r of versions.rows) console.error(`  ${r.ok ? 'ok   ' : 'DRIFT'} ${r.file} -> ${r.found ?? '(not found)'}`);
  fail(`Version surfaces disagree with package.json (${version}). Nothing was committed.`);
}
console.log(`  versions agree: ${versions.rows.map((r) => r.file).join(', ')}`);

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

/* --------------------------------------------- the local test build follows */

// `Nebula Test.exe` in the project root is the copy you actually click, so it
// has to carry the version that was just released — otherwise the next defect
// report is written against an older build than the one on GitHub. Not
// committed (it is in .gitignore); rebuilt here so it never has to be
// remembered. `npm run kill` closes a running copy first, including this one.
try {
  console.log('\n> npm run pack:test   (refreshing Nebula Test.exe)');
  runLoud('npm', ['run', 'pack:test']);
} catch {
  console.warn('  (test build not refreshed — run `npm run pack:test` to retry)');
}

/* ------------------------------------------------------ docs site + mirrors */

// All of these are best-effort: the release is already tagged and building, and
// neither a missing USB drive nor a network hiccup should read as a failed
// release.

try {
  // The site was built and committed above, so this publishes exactly what the
  // tag contains — the repository copy and the published copy cannot diverge.
  runLoud('node', [path.join(ROOT, 'scripts', 'publish-site.js')]);
} catch {
  console.warn('  (docs site not published — run `npm run publish-site` to retry)');
}

if (!skipFlash) {
  try {
    runLoud('node', [path.join(ROOT, 'scripts', 'sync-flash.js')]);
  } catch {
    console.warn('  (flash sync skipped or failed — run `npm run sync-flash` when the drive is in)');
  }
}
