/**
 * The manual (macOS / portable) update path decides whether to nag purely from
 * a GitHub tag name. Getting 0.3.10 vs 0.3.9 wrong there means either missing
 * every release after .9 or offering an "update" that goes backwards.
 */
import { describe, it, expect } from 'vitest';
import { compareVersions, isNewerVersion } from '../electron/version-compare.js';

describe('compareVersions', () => {
  it('orders by numeric segment, not lexically', () => {
    expect(compareVersions('0.3.10', '0.3.9')).toBe(1);
    expect(compareVersions('0.3.9', '0.3.10')).toBe(-1);
    expect(compareVersions('0.10.0', '0.9.99')).toBe(1);
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1);
  });

  it('ignores a leading v on either side', () => {
    expect(compareVersions('v0.3.1', '0.3.0')).toBe(1);
    expect(compareVersions('0.3.1', 'v0.3.1')).toBe(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBe(1);
  });

  it('sorts a pre-release below the release it leads to', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1);
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBe(1);
  });

  it('returns null rather than a wrong answer for garbage', () => {
    expect(compareVersions('latest', '1.0.0')).toBeNull();
    expect(compareVersions('', '1.0.0')).toBeNull();
    expect(compareVersions(undefined, '1.0.0')).toBeNull();
    expect(compareVersions('1.0.0', null)).toBeNull();
  });
});

describe('isNewerVersion', () => {
  it('is true only for a real step up', () => {
    expect(isNewerVersion('0.3.1', '0.3.0')).toBe(true);
    expect(isNewerVersion('0.3.0', '0.3.0')).toBe(false);
    expect(isNewerVersion('0.2.9', '0.3.0')).toBe(false);
  });

  it('never offers an update it cannot parse', () => {
    expect(isNewerVersion('nightly', '0.3.0')).toBe(false);
    expect(isNewerVersion('', '0.3.0')).toBe(false);
  });
});
