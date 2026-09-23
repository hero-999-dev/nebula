import { describe, it, expect } from 'vitest';
import { releaseBody } from '../scripts/release-body.js';
import { RELEASE_NOTES } from '../src/js/release-notes.js';

describe('GitHub release instructions', () => {
  const version = Object.keys(RELEASE_NOTES)[0];
  it('uses the actual release changelog and exact app assets', () => {
    const body = releaseBody(`v${version}`);
    expect(body).toContain(RELEASE_NOTES[version].headline);
    for (const item of RELEASE_NOTES[version].items) expect(body).toContain(item.text);
    for (const name of [`Nebula-Setup-${version}.exe`, `Nebula-portable-${version}.exe`, `Nebula-${version}-mac.dmg`, `Nebula-${version}-mac.zip`]) expect(body).toContain(`/v${version}/${name}`);
  });
  it('explains Mac save, backup, replacement, verification and warning limits', () => {
    const body = releaseBody(version);
    for (const text of ['Saved', 'Cmd+Q', '~/Library/Application Support/nebula', 'Replace', 'About', 'Open Anyway', 'do not create', 'may prompt again']) expect(body).toContain(text);
    expect(body).not.toContain('xattr -dr');
  });
  it('refuses missing changelogs or unsafe tag input', () => {
    expect(() => releaseBody('99.99.99')).toThrow('Missing release notes');
    expect(() => releaseBody('../release')).toThrow('stable release');
  });
});
