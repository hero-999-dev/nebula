/**
 * Whether what `safeStorage` wraps is kept secret on this computer (1.0.4, the
 * Linux builds).
 *
 * Windows wraps with the user's own key (DPAPI) and a Mac with the Keychain.
 * On Linux Electron asks the desktop's keyring — GNOME Keyring through
 * libsecret, or KWallet — and where there is none it still says "available":
 * it then wraps with a password that is the same in every copy of every
 * Electron app (`basic_text`), which keeps nothing from anyone who can read
 * the file. A black hole's key and the sync pairing are never kept that way:
 * with no keyring both refuse and say why (black-holes.js, sync.js).
 *
 * Only the keyrings named here count. A backend this list does not know —
 * `basic_text`, `unknown`, one of a later Electron — is taken as not secret,
 * so a new name can never let a key be kept weakly by surprise.
 */

/** What `safeStorage.getSelectedStorageBackend()` calls a real keyring. */
const KEYRINGS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']);

/** Whether a Linux storage backend of that name keeps a secret. Pure — tested. */
export const isKeyring = (backend) => KEYRINGS.has(String(backend ?? ''));

/**
 * @param {{isEncryptionAvailable: () => boolean, getSelectedStorageBackend?: () => string}} safeStorage  Electron's
 * @param {string} [platform]
 * @returns {boolean} true only where a key wrapped now stays secret. Never throws. Pure — tested.
 */
export function canKeepSecret(safeStorage, platform = process.platform) {
  try {
    // Asked first: on Linux the backend is chosen at this question, and is `unknown` before it.
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (platform !== 'linux') return true;
    return isKeyring(safeStorage.getSelectedStorageBackend());
  } catch {
    return false;
  }
}
