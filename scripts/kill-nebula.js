/**
 * Close any running Nebula before packing — a running exe locks the output
 * files and electron-builder stalls on "output file is locked".
 *
 * Covers the installed app and win-unpacked (Nebula.exe) as well as the
 * versioned portable build (Nebula-portable-x.y.z.exe).
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

const killed = isWin
  ? [run('taskkill /IM Nebula.exe /F /T'), run('taskkill /F /FI "IMAGENAME eq Nebula-portable-*.exe"')].some(Boolean)
  : run('pkill -f Nebula');

console.log(killed ? 'Closed running Nebula.' : 'Nebula was not running.');
