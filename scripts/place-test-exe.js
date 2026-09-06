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
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';

const built = path.join(ROOT, 'test-build', 'Nebula-Test.exe');
const placed = path.join(ROOT, 'Nebula Test.exe');

if (!fs.existsSync(built)) {
  console.error(`Not built: ${built}\nRun: npm run pack:test`);
  process.exit(1);
}

// A running copy holds a lock; say which, rather than failing with EBUSY.
try {
  fs.copyFileSync(built, placed);
} catch (err) {
  if (err.code === 'EBUSY' || err.code === 'EPERM') {
    console.error('"Nebula Test.exe" is running — close it and run this again.');
    process.exit(1);
  }
  throw err;
}

const mb = (fs.statSync(placed).size / 1024 / 1024).toFixed(1);
console.log(`\n  Nebula Test.exe  ${mb} MB  in ${ROOT}`);
console.log(`  Double-click it. Its notes live in ${path.join(ROOT, 'Nebula-data')}`);
console.log('  The installed Nebula is a separate app with separate notes.\n');
