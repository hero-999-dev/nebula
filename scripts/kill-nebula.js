/**
 * Close any running Nebula before packing — a running exe locks the output
 * files, so electron-builder stalls on "output file is locked" and the copy
 * into the project root fails with EBUSY.
 *
 * Covers all four ways the app can be running: the installed app and
 * win-unpacked (Nebula.exe), the versioned portable build
 * (Nebula-portable-x.y.z.exe), and the test build (Nebula Test.exe) — which is
 * the one most likely to be open, because it is the build you check things in.
 * Leaving it out meant every `npm run pack:test` ended with "close it and run
 * this again", which is not a refresh.
 */
import { execSync } from 'node:child_process';

const isWin = process.platform === 'win32';

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// The test build's image name contains a space, so it has to be quoted.
const WIN_TARGETS = [
  'taskkill /IM Nebula.exe /F /T',
  'taskkill /IM "Nebula Test.exe" /F /T',
  'taskkill /F /FI "IMAGENAME eq Nebula-portable-*.exe"',
];

const killed = isWin
  ? WIN_TARGETS.map(run).some(Boolean)
  : run('pkill -f Nebula');

console.log(killed ? 'Closed running Nebula.' : 'Nebula was not running.');
