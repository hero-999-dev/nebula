/**
 * Close any running Nebula BUILT FROM THIS PROJECT before packing — a running
 * exe locks the output files, so electron-builder stalls on "output file is
 * locked" and the copy into the project root fails with EBUSY.
 *
 * Covers the builds this project makes: the test build (Nebula Test.exe, the
 * one most likely to be open, because it is the build you check things in),
 * release/win-unpacked (Nebula.exe) and the versioned portable build
 * (Nebula-portable-x.y.z.exe).
 *
 * NEVER the installed app (owner, 2026-09-28; AGENTS.md, HANDOVER trap 55).
 * Until 0.9.3 this ran `taskkill /IM Nebula.exe /F`, which force-closed the
 * installed Nebula in C:\Program Files too — with whatever the owner had not
 * saved yet. On Windows a process is closed only when its executable lies
 * inside this project folder.
 */
import { execSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isWin = process.platform === 'win32';
// --dry-run: say what would be closed, close nothing.
const dryRun = process.argv.includes('--dry-run');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return '';
  }
}

let killed = false;
if (isWin) {
  // Every Nebula-named process, with the path of its executable; only the ones
  // under this project are closed.
  const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'Nebula*.exe' -and $_.ExecutablePath } | ForEach-Object { "$($_.ProcessId)|$($_.ExecutablePath)" }`;
  // No shell in between: cmd.exe would take the pipes in the script for its own.
  let listing = '';
  try { listing = execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { /* none running */ }
  const inside = (file) => path.resolve(file).toLowerCase().startsWith(root.toLowerCase() + path.sep);
  for (const line of listing.split(/\r?\n/).filter(Boolean)) {
    const [pid, exe] = line.split('|');
    if (!/^\d+$/.test(pid) || !exe || !inside(exe)) continue;
    if (dryRun) { console.log(`would close ${pid} ${exe}`); continue; }
    run(`taskkill /PID ${pid} /F /T`);
    killed = true;
  }
} else {
  killed = !!run(`pkill -f "${root}"`);
}

console.log(killed ? 'Closed this project\u2019s running Nebula builds.' : 'No Nebula build from this project was running.');
