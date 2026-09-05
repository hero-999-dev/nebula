/**
 * Start the dev app on its own Electron profile (see scripts/paths.js for why).
 * The installed Nebula's notes are never visible to a dev run.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DEV_PROFILE } from './paths.js';

fs.mkdirSync(DEV_PROFILE, { recursive: true });

const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(viteBin)) {
  console.error('vite is not installed - run `npm install` first.');
  process.exit(1);
}

console.log(`Dev profile: ${DEV_PROFILE}`);
console.log('(the installed Nebula keeps its own notes and is not touched)\n');

const child = spawn(process.execPath, [viteBin], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NEBULA_USER_DATA: DEV_PROFILE },
});
child.on('exit', (code) => process.exit(code ?? 0));
