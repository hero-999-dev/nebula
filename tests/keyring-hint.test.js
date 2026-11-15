/**
 * On Linux a black hole and the sync pairing are refused where no keyring
 * runs (1.0.4, electron/safe-store.js) — and the refusal says why, and what
 * to do. On Windows and a Mac its words stand as they were.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { withKeyring } from '../src/js/keyring-hint.js';
import { refusalWords } from '../src/js/black-holes.js';
import { syncError } from '../src/js/tools-panel.js';
import { STRINGS } from '../src/js/i18n.js';

const KEYRING = 'Nebula keeps such keys in the system keyring, and this computer has none running: install and unlock GNOME Keyring or KWallet, then open Nebula again.';
const HOLE = 'Secure storage is unavailable on this computer. Try again when it is available.';
const PAIR = 'This computer cannot keep the pairing safe.';

afterEach(() => { delete window.nebula; });

describe('the keyring, named where it is missing', () => {
  it('adds the sentence on Linux only', () => {
    expect(withKeyring('No.', 'linux')).toBe(`No. ${KEYRING}`);
    for (const platform of ['win32', 'darwin', 'web', undefined]) expect(withKeyring('No.', platform), String(platform)).toBe('No.');
  });

  it('reads the platform from the window when none is given', () => {
    expect(withKeyring('No.')).toBe('No.');
    window.nebula = { platform: 'linux' };
    expect(withKeyring('No.')).toBe(`No. ${KEYRING}`);
  });

  it('a black hole refused and a pairing refused both say it on Linux', () => {
    window.nebula = { platform: 'linux' };
    expect(refusalWords({ error: 'storage-unavailable' })).toBe(`${HOLE} ${KEYRING}`);
    expect(syncError('protect')).toBe(`${PAIR} ${KEYRING}`);
    // Only those two: another refusal has nothing to do with a keyring.
    expect(refusalWords({ error: 'hello-unavailable' })).not.toContain('keyring');
    expect(syncError('code')).not.toContain('keyring');
  });

  it('and on Windows and a Mac they say what they said', () => {
    for (const platform of ['win32', 'darwin']) {
      window.nebula = { platform };
      expect(refusalWords({ error: 'storage-unavailable' })).toBe(HOLE);
      expect(syncError('protect')).toBe(PAIR);
    }
  });

  it('is said in every language, with both keyrings by name and Nebula never declined', () => {
    const said = STRINGS[KEYRING];
    expect(said).toHaveLength(3);
    expect(new Set(said).size).toBe(3);
    for (const words of said) {
      expect(words).toContain('GNOME Keyring');
      expect(words).toContain('KWallet');
      expect(words).toMatch(/Nebula(?![a-zęąı])/);
      expect(words).not.toMatch(/Nebul[ęiąy]\b|Nebulas\b/);
    }
  });
});
