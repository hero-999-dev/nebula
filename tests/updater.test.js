import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ handlers: new Map(), events: new Map(), fetch: vi.fn(), install: vi.fn() }));
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '33.4.11' },
  ipcMain: { handle: (name, fn) => fake.handlers.set(name, fn) },
  net: { fetch: fake.fetch }, shell: { openExternal: vi.fn() },
}));
vi.mock('electron-updater', () => ({ default: { autoUpdater: {
  on: (name, fn) => fake.events.set(name, fn), checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: fake.install,
} } }));
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks(); fake.handlers.clear(); fake.events.clear();
  vi.stubGlobal('process', { ...process, platform: 'win32', env: { ...process.env, PORTABLE_EXECUTABLE_DIR: '' } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('update safety', () => {
  it('Mac builds notify but never download or install, even when packaged', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    fake.fetch.mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v0.8.1' }) });
    const beforeInstall = vi.fn();
    const { initUpdater } = await import('../electron/updater.js');
    expect(await initUpdater({ version: '0.8.0', beforeInstall })).toEqual({ mode: 'manual' });
    expect(await fake.handlers.get('update:check')()).toMatchObject({ state: 'manual', version: '0.8.1' });
    await fake.handlers.get('update:download')();
    await fake.handlers.get('update:install')();
    expect(beforeInstall).not.toHaveBeenCalled();
    expect(fake.install).not.toHaveBeenCalled();
    expect(fake.events.size).toBe(0);
  });
  it('compares releases with the Nebula version, not the Electron runtime version', async () => {
    fake.fetch.mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v0.7.5', html_url: 'https://github.com/hero-999-dev/nebula/releases/tag/v0.7.5' }) });
    const { initUpdater } = await import('../electron/updater.js');
    await initUpdater({ version: '0.7.4', canSelfUpdate: false });
    expect(await fake.handlers.get('update:check')()).toMatchObject({ state: 'manual', version: '0.7.5' });
    expect(fake.fetch.mock.calls[0][1].headers['User-Agent']).toBe('Nebula/0.7.4');
  });
  it('does not run the installer when saving or making the backup fails', async () => {
    const { initUpdater } = await import('../electron/updater.js');
    await initUpdater({ version: '0.7.4', beforeInstall: async () => { throw new Error('backup failed'); } });
    fake.events.get('update-downloaded')({ version: '0.7.5' });
    expect(await fake.handlers.get('update:install')()).toMatchObject({ state: 'error', error: 'backup failed' });
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.install).not.toHaveBeenCalled();
  });
  it('waits for saving and backup before silently installing', async () => {
    let finish;
    const beforeInstall = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const { initUpdater } = await import('../electron/updater.js');
    await initUpdater({ version: '0.7.4', beforeInstall });
    fake.events.get('update-downloaded')({ version: '0.7.5' });
    const install = fake.handlers.get('update:install')();
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.install).not.toHaveBeenCalled();
    finish(); await install; await vi.advanceTimersByTimeAsync(1);
    expect(fake.install).toHaveBeenCalledWith(true, true);
  });
});
