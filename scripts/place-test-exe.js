/**
 * Put the test build where it can actually be double-clicked.
 *
 * electron-builder writes it into test-build/, which is a folder nobody opens.
 * The point of this build is that it is one click away in the project root, so
 * it is copied there as `Nebula Test.exe`.
 *
 * Because it is a portable target it keeps its notes in `Nebula-data` beside
 * itself — which, from the project root, means <repo>/Nebula-data. That is a
 * third vault, separate from the installed app and from `npm run dev`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';

const built = path.join(ROOT, 'test-build', 'Nebula-Test.exe');
const placed = path.join(ROOT, 'Nebula Test.exe');

if (!fs.existsSync(built)) {
  console.error(`Not built: ${built}\nRun: npm run pack:test`);
  process.exit(1);
}

// A running copy holds a lock. `npm run kill` already ran at the start of
// pack:test, but packaging takes a couple of minutes and the app can easily be
// opened again in that window — which used to lose the whole refresh at the
// last step. Close it and retry; only give up if that does not help.
function place() {
  try {
    fs.copyFileSync(built, placed);
    return null;
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') return err;
    throw err;
  }
}

if (place()) {
  console.log('  Nebula Test.exe is open — closing it to put the new build in place.');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'kill-nebula.js')], { stdio: 'inherit' });
  if (place()) {
    console.error('"Nebula Test.exe" is still locked — close it and run `npm run pack:test` again.');
    process.exit(1);
  }
}

const mb = (fs.statSync(placed).size / 1024 / 1024).toFixed(1);
console.log(`\n  Nebula Test.exe  ${mb} MB  in ${ROOT}`);
console.log(`  Double-click it. Its notes live in ${path.join(ROOT, 'Nebula-data')}`);
console.log('  The installed Nebula is a separate app with separate notes.\n');
