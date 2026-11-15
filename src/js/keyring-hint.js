/**
 * Why a black hole or the sync pairing is refused on Linux (1.0.4, the Linux
 * builds; electron/safe-store.js).
 *
 * Their keys are wrapped by the system, and on Linux that is the desktop's
 * keyring. With none running nothing wrapped is secret, so Nebula refuses
 * rather than keep a key that way — and here it says so, and what to do. On
 * Windows and a Mac the refusal's own words stand alone.
 */
import { t } from './i18n.js';

/**
 * A refusal's words, and on Linux the keyring sentence after them.
 * @param {string} words  already in the reader's language
 * @param {string} [platform]  the window's (preload: `nebula.platform`)
 */
export function withKeyring(words, platform = globalThis.window?.nebula?.platform) {
  if (platform !== 'linux') return words;
  return `${words} ${t('Nebula keeps such keys in the system keyring, and this computer has none running: install and unlock GNOME Keyring or KWallet, then open Nebula again.')}`;
}
