/**
 * Reset the DEV app's notes for a fresh start.
 *
 * Wipes only NOTE data, from the dev profile (<repo>/.dev-profile):
 *   <profile>/storage        — the per-note JSON disk mirror
 *   <profile>/Local Storage  — where nebula:* keys (notes, layout) live
 *   <profile>/Session Storage
 *
 * Keeps AI logins (<profile>/Partitions) so you don't sign in again.
 * Everything removed is copied to <profile>/backups/reset-<timestamp> first,
 * so a reset is always undoable.
 *
 *   npm run reset             reset the dev profile
 *   npm run reset -- --all    also drop AI logins + old dated backups
 *   npm run reset -- --installed
 *                             target the INSTALLED app instead. This is the
 *                             user's real notes; it asks for --yes as well.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEV_PROFILE, installedProfile } from './paths.js';

const args = process.argv.slice(2);
const all = args.includes('--all');
const wantsInstalled = args.includes('--installed');
const confirmed = args.includes('--yes');

if (wantsInstalled && !confirmed) {
  console.error(`REFUSING: --installed targets the real app's notes at\n  ${installedProfile()}\n`);
  console.error('If that is genuinely what you want, add --yes.');
  process.exit(1);
}

const root = wantsInstalled ? installedProfile() : DEV_PROFILE;
console.log(`Profile: ${root}${wantsInstalled ? '  (INSTALLED APP)' : '  (dev)'}`);

if (!fs.existsSync(root)) {
  console.log(`Nothing to reset — no profile at ${root}`);
  process.exit(0);
}

const targets = ['storage', 'Local Storage', 'Session Storage'];
if (all) targets.push('Partitions');

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = path.join(root, 'backups', `reset-${stamp}`);

let moved = 0;
for (const name of targets) {
  const src = path.join(root, name);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(backupDir, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
    console.log(`  reset  ${name}`);
    moved++;
  } catch (err) {
    console.warn(`  skip   ${name} — ${err.message} (is Nebula still open?)`);
  }
}

if (all) {
  const backups = path.join(root, 'backups');
  if (fs.existsSync(backups)) {
    for (const dir of fs.readdirSync(backups, { withFileTypes: true })) {
      if (dir.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dir.name)) {
        fs.rmSync(path.join(backups, dir.name), { recursive: true, force: true });
      }
    }
  }
}

if (moved === 0) {
  console.log('Nothing to reset — notes were already empty.');
} else {
  console.log('\nNotes reset. Next launch seeds the test notes fresh.');
  console.log(`Old data backed up to:\n  ${backupDir}`);
  if (!all) console.log('AI logins kept (use "npm run reset -- --all" to drop those too).');
}
