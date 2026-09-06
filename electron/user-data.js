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

/** Only an installed build may replace itself in place. */
export const canSelfUpdate = (channel) => channel === 'installed';
