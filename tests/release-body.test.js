import { describe, it, expect } from 'vitest';
import { releaseBody } from '../scripts/release-body.js';
import { RELEASE_NOTES } from '../src/js/release-notes.js';

describe('GitHub release instructions', () => {
  const version = Object.keys(RELEASE_NOTES)[0];
  it('uses the actual release changelog and exact app assets', () => {
    const body = releaseBody(`v${version}`);
    expect(body).toContain(RELEASE_NOTES[version].headline);
    for (const item of RELEASE_NOTES[version].items) expect(body).toContain(item.text);
    for (const name of [`Nebula-Setup-${version}.exe`, `Nebula-portable-${version}.exe`, `Nebula-${version}-mac.dmg`, `Nebula-${version}-mac.zip`,
      `Nebula-${version}.AppImage`, `nebula_${version}_amd64.deb`, `nebula-${version}.pacman`]) expect(body).toContain(`/v${version}/${name}`);
  });
  it('says which Linux package is for which system, how each is updated, and what needs a keyring', () => {
    const body = releaseBody(version);
    for (const text of ['Ubuntu, Linux Mint, Kali', 'Arch, Manjaro, EndeavourOS', `sudo apt install ./nebula_${version}_amd64.deb`,
      `sudo pacman -U nebula-${version}.pacman`, `chmod +x Nebula-${version}.AppImage`, 'libfuse2', '~/.config/nebula',
      'GNOME Keyring', 'KWallet', 'does not store those keys weakly']) expect(body).toContain(text);
    // Never the way round the sandbox, and nobody's home folder.
    expect(body).not.toContain('--no-sandbox');
    expect(body).not.toMatch(/\/home\/|C:\\/);
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
