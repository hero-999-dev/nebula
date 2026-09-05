/**
 * Where things live. One module so "which profile am I about to touch" has a
 * single answer.
 *
 * Electron derives userData from package.json "name", so without an override a
 * dev run and the installed Nebula share <appData>/nebula — and a reset would
 * delete the notes of the app the user actually uses. NEBULA_USER_DATA (read in
 * electron/main.js) points development at <repo>/.dev-profile instead.
 */
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The profile `npm run dev` uses. Safe to wipe. */
export const DEV_PROFILE = path.join(ROOT, '.dev-profile');

/** The profile the installed app uses. The user's real notes. */
export function installedProfile(appName = 'nebula') {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), appName);
}
