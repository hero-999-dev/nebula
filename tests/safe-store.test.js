/**
 * A key is kept only where the system keeps it secret (1.0.4, the Linux
 * builds): with no keyring Electron wraps with a password every copy knows,
 * and Nebula then refuses rather than keep a black hole's key or the sync
 * pairing that way.
 */
import { describe, it, expect, vi } from 'vitest';
import { canKeepSecret, isKeyring } from '../electron/safe-store.js';

const storage = (available, backend) => ({
  isEncryptionAvailable: vi.fn(() => available),
  getSelectedStorageBackend: vi.fn(() => backend),
});

describe('what safeStorage wraps is kept secret', () => {
  it('counts the keyrings and nothing else', () => {
    for (const name of ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']) expect(isKeyring(name), name).toBe(true);
    for (const name of ['basic_text', 'unknown', '', null, undefined, 'GNOME_LIBSECRET', 'kwallet7']) expect(isKeyring(name), String(name)).toBe(false);
  });

  it('refuses on Linux with no keyring, though Electron says encryption is available', () => {
    expect(canKeepSecret(storage(true, 'basic_text'), 'linux')).toBe(false);
    expect(canKeepSecret(storage(true, 'unknown'), 'linux')).toBe(false);
    expect(canKeepSecret(storage(true, 'a later name'), 'linux')).toBe(false);
  });

  it('keeps on Linux with GNOME Keyring or KWallet', () => {
    expect(canKeepSecret(storage(true, 'gnome_libsecret'), 'linux')).toBe(true);
    expect(canKeepSecret(storage(true, 'kwallet6'), 'linux')).toBe(true);
  });

  it('asks whether encryption is available before it asks for the backend', () => {
    const s = storage(true, 'gnome_libsecret');
    canKeepSecret(s, 'linux');
    expect(s.isEncryptionAvailable.mock.invocationCallOrder[0]).toBeLessThan(s.getSelectedStorageBackend.mock.invocationCallOrder[0]);
  });

  it('never asks for a backend on Windows or a Mac, where there is none to ask for', () => {
    for (const platform of ['win32', 'darwin']) {
      const s = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => { throw new Error('Linux only'); } };
      expect(canKeepSecret(s, platform), platform).toBe(true);
      expect(canKeepSecret({ isEncryptionAvailable: () => false }, platform), platform).toBe(false);
    }
  });

  it('is false, never an error, when encryption is unavailable or the question fails', () => {
    expect(canKeepSecret(storage(false, 'gnome_libsecret'), 'linux')).toBe(false);
    expect(canKeepSecret({ isEncryptionAvailable: () => { throw new Error('not ready'); } }, 'linux')).toBe(false);
    expect(canKeepSecret({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => { throw new Error('gone'); } }, 'linux')).toBe(false);
    expect(canKeepSecret({ isEncryptionAvailable: () => true }, 'linux')).toBe(false);
    expect(canKeepSecret(null, 'win32')).toBe(false);
  });
});
