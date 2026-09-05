/**
 * Compare two version strings. Kept free of any electron import so the unit
 * tests can load it directly.
 *
 * Only what a release tag actually needs: numeric dot segments, an optional
 * leading "v", and an optional pre-release suffix after "-" (which always
 * sorts BEFORE the same version without one, per semver).
 */

function parse(version) {
  const raw = String(version ?? '').trim().replace(/^v/i, '');
  const [core, pre = ''] = raw.split('-', 2);
  const parts = core.split('.').map((n) => Number.parseInt(n, 10));
  // A segment that is not a number makes the whole version unusable — say so
  // rather than silently comparing NaN, which would make every check "equal".
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return { parts, pre };
}

/**
 * @returns -1 if a < b, 0 if equal, 1 if a > b, or null if either is unparseable.
 */
export function compareVersions(a, b) {
  const va = parse(a);
  const vb = parse(b);
  if (!va || !vb) return null;

  const len = Math.max(va.parts.length, vb.parts.length);
  for (let i = 0; i < len; i++) {
    const x = va.parts[i] ?? 0;
    const y = vb.parts[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }

  if (va.pre === vb.pre) return 0;
  if (!va.pre) return 1;   // 1.0.0 > 1.0.0-beta
  if (!vb.pre) return -1;
  return va.pre < vb.pre ? -1 : 1;
}

/** True only when `candidate` is a real, parseable step up from `current`. */
export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) === 1;
}
