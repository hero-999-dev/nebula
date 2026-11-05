/**
 * Which profile this launch writes to.
 *
 * There are three ways to start Nebula and they must not share notes:
 *
 *   installed   %APPDATA%\nebula            the user's real notes
 *   portable    <folder of the exe>\Nebula-data
 *   dev         <repo>\.dev-profile         via NEBULA_USER_DATA
 *
 * The portable rule is the one that was missing. Electron derives userData from
 * the package name, so a portable exe run out of the repo's release/ folder was
 * opening — and autosaving into — the installed app's vault. "Portable" should
 * mean the notes travel with the exe; that is also what stops a build in the
 * repository from touching anything the user cares about.
 *
 * Kept free of electron imports so it can be tested directly.
 */
import path from 'node:path';

export const PORTABLE_DATA_DIR = 'Nebula-data';

/**
 * @param {object} opts
 * @param {string} [opts.override]     NEBULA_USER_DATA — wins over everything
 * @param {string} [opts.portableDir]  PORTABLE_EXECUTABLE_DIR, set by the portable target
 * @param {string} opts.defaultDir     what Electron would use on its own
 * @returns {{dir: string, channel: 'dev'|'portable'|'installed'}}
 */
export function resolveUserData({ override, portableDir, defaultDir }) {
  if (override) return { dir: override, channel: 'dev' };
  if (portableDir) return { dir: path.join(portableDir, PORTABLE_DATA_DIR), channel: 'portable' };
  return { dir: defaultDir, channel: 'installed' };
}

/**
 * What this build calls itself. `test` is the packaged build meant for trying
 * things out: same code, its own name, icon, taskbar button and vault, so it
 * can never be mistaken for — or write into — the installed app.
 *
 * @param {object} opts
 * @param {boolean} opts.packaged        app.isPackaged
 * @param {string} [opts.metaChannel]    nebulaChannel from the packaged package.json
 * @param {string} [opts.portableDir]    PORTABLE_EXECUTABLE_DIR
 * @returns {'dev'|'test'|'portable'|'installed'}
 */
export function appChannel({ packaged, metaChannel, portableDir }) {
  if (!packaged) return 'dev';
  if (metaChannel === 'test') return 'test';
  if (portableDir) return 'portable';
  return 'installed';
}

/**
 * The version a copy shows to the devices it syncs with. A test build carries
 * the 1.0.2 of the last release while it holds the next one's work, so it adds
 * the moment it was packed: it then syncs only with that very build — never
 * with a released 1.0.2, nor with an older test build (the owner, 2026-11-05).
 */
export function syncVersion({ version, channel, stamp }) {
  if (channel !== 'test') return version;
  return stamp ? `${version}-test.${stamp}` : `${version}-test`;
}

/** The stamp `npm run pack:test` writes: local date and time, 20261105-0112. */
export function testStamp(date = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}`;
}

/** Only an installed build may replace itself in place. */
export const canSelfUpdate = (channel) => channel === 'installed';
