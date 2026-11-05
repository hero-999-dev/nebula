/**
 * Put the last test build on GitHub, where the other test builds look for it.
 *
 * Usage: npm run publish:test [-- <tag>]   (tag defaults to test-<today>)
 *
 * Uploads test-build/Nebula-Test.exe and its test-build.json to that
 * pre-release, replacing what was there. A running test build checks every
 * half hour and offers the newer one (electron/updater.js, test mode). This is
 * not a release: nothing is tagged on main and the version stays as it is.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';

const day = new Date();
const pad = (n) => String(n).padStart(2, '0');
const tag = process.argv[2] || `test-${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
const exe = path.join(ROOT, 'test-build', 'Nebula-Test.exe');
const stamp = path.join(ROOT, 'test-build', 'test-build.json');

for (const f of [exe, stamp]) {
  if (!fs.existsSync(f)) { console.error(`Missing: ${path.basename(f)} — run npm run pack:test first.`); process.exit(1); }
}
const gh = (...args) => execFileSync('gh', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

let exists = true;
try { gh('release', 'view', tag, '--repo', 'hero-999-dev/nebula', '--json', 'tagName'); } catch { exists = false; }
if (!exists) {
  gh('release', 'create', tag, '--repo', 'hero-999-dev/nebula', '--prerelease', '--title', `Nebula Test ${tag.slice(5)}`,
    '--notes', 'A test build. It syncs only with the very same test build, and updates itself from here.');
}
gh('release', 'upload', tag, exe, stamp, '--repo', 'hero-999-dev/nebula', '--clobber');
console.log(`Test build ${JSON.parse(fs.readFileSync(stamp, 'utf8')).stamp} is on ${tag}.`);
