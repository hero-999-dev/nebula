/**
 * Three ways to launch Nebula, three vaults.
 *
 * This existed as a comment and a habit until a portable build in the repo's
 * release/ folder was caught autosaving into %APPDATA%\nebula — the installed
 * app's notes. Electron derives userData from the package name, so every build
 * of the same app lands in the same place unless something says otherwise.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveUserData, appChannel, canSelfUpdate, PORTABLE_DATA_DIR } from '../electron/user-data.js';

const APPDATA = path.join('C:', 'Users', 'someone', 'AppData', 'Roaming', 'nebula');
const REPO = path.join('C:', 'work', 'Nebula');

describe('resolveUserData', () => {
  it('an installed launch uses the profile Electron chose', () => {
    expect(resolveUserData({ defaultDir: APPDATA }))
      .toEqual({ dir: APPDATA, channel: 'installed' });
  });

  it('a portable launch keeps its notes beside the exe, not in the user profile', () => {
    const releaseDir = path.join(REPO, 'release');
    const { dir, channel } = resolveUserData({ portableDir: releaseDir, defaultDir: APPDATA });
    expect(channel).toBe('portable');
    expect(dir).toBe(path.join(releaseDir, PORTABLE_DATA_DIR));
    expect(dir.startsWith(APPDATA)).toBe(false);
  });

  it('NEBULA_USER_DATA wins over everything — dev must be able to isolate itself', () => {
    const dev = path.join(REPO, '.dev-profile');
    expect(resolveUserData({ override: dev, portableDir: path.join(REPO, 'release'), defaultDir: APPDATA }))
      .toEqual({ dir: dev, channel: 'dev' });
  });

  it('the three launches never resolve to the same directory', () => {
    const installed = resolveUserData({ defaultDir: APPDATA }).dir;
    const portable = resolveUserData({ portableDir: path.join(REPO, 'release'), defaultDir: APPDATA }).dir;
    const dev = resolveUserData({ override: path.join(REPO, '.dev-profile'), defaultDir: APPDATA }).dir;
    expect(new Set([installed, portable, dev]).size).toBe(3);
  });

  it('an empty override is ignored rather than resolving to nowhere', () => {
    expect(resolveUserData({ override: '', defaultDir: APPDATA }).dir).toBe(APPDATA);
  });
});

describe('appChannel', () => {
  it('names each way of launching', () => {
    expect(appChannel({ packaged: false })).toBe('dev');
    expect(appChannel({ packaged: true, metaChannel: 'test', portableDir: 'C:\\x' })).toBe('test');
    expect(appChannel({ packaged: true, portableDir: 'C:\\x' })).toBe('portable');
    expect(appChannel({ packaged: true })).toBe('installed');
  });

  it('a test build is test even though it is packaged, on Windows and portable', () => {
    // "packaged and win32 and not portable" was the old auto-update condition;
    // a test build satisfies the first two, so the channel has to be explicit.
    expect(appChannel({ packaged: true, metaChannel: 'test' })).toBe('test');
  });
});

describe('canSelfUpdate', () => {
  it('is true only for an installed build', () => {
    expect(canSelfUpdate('installed')).toBe(true);
    for (const channel of ['test', 'portable', 'dev']) {
      expect(canSelfUpdate(channel), channel).toBe(false);
    }
  });
});
