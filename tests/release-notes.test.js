/**
 * What each release says for itself.
 *
 * The user's request: "on every update, put a small screen in the middle
 * saying what changed and what arrived — a report for the user." An update
 * that installs silently gives nobody a reason to go looking for what it
 * fixed, which is exactly how six items stayed in a bug report for three
 * releases after they were done.
 *
 * The decision of what to show, and whether it has been shown, is pure — the
 * dialog only draws.
 */
import { describe, it, expect } from 'vitest';
import { RELEASE_NOTES, notesFor, shouldShow } from '../src/js/release-notes.js';
import { latestOf } from '../src/js/whats-new.js';

const SAMPLE = {
  '1.0.0': { headline: 'first', items: [{ title: 'a', text: 'one' }] },
  '1.2.0': { headline: 'second', items: [{ title: 'b', text: 'two' }] },
  '1.10.0': { headline: 'third', items: [{ title: 'c', text: 'three' }] },
  '0.9.0': { headline: 'empty', items: [] },
};

describe('notesFor', () => {
  it('finds the entry for a version', () => {
    expect(notesFor('1.2.0', SAMPLE).headline).toBe('second');
  });

  it('tolerates a leading v, which is how a tag names it', () => {
    expect(notesFor('v1.2.0', SAMPLE).headline).toBe('second');
  });

  it('reports the version it matched, so the title can name it', () => {
    expect(notesFor('v1.0.0', SAMPLE).version).toBe('1.0.0');
  });

  it('is null for a version nobody wrote notes for', () => {
    expect(notesFor('3.0.0', SAMPLE)).toBeNull();
  });

  it('is null for an entry with no items — nothing to show is not a dialog', () => {
    expect(notesFor('0.9.0', SAMPLE)).toBeNull();
  });

  it('is null for no version at all', () => {
    // Electron answers with its OWN version when it cannot find the app's
    // package.json, so this lookup must simply miss rather than throw.
    expect(notesFor(null, SAMPLE)).toBeNull();
    expect(notesFor(undefined, SAMPLE)).toBeNull();
    expect(notesFor('33.4.11', SAMPLE)).toBeNull();
  });
});

describe('shouldShow', () => {
  it('shows when this version has not been acknowledged', () => {
    expect(shouldShow('1.2.0', '1.0.0', SAMPLE)).toBe(true);
  });

  it('does not show it twice', () => {
    expect(shouldShow('1.2.0', '1.2.0', SAMPLE)).toBe(false);
  });

  it('shows when nothing has ever been stored — that is an older install', () => {
    expect(shouldShow('1.2.0', null, SAMPLE)).toBe(true);
    expect(shouldShow('1.2.0', undefined, SAMPLE)).toBe(true);
  });

  it('never shows for a version with no notes, whatever was stored', () => {
    expect(shouldShow('3.0.0', null, SAMPLE)).toBe(false);
    expect(shouldShow('0.9.0', '1.0.0', SAMPLE)).toBe(false);
  });

  it('ignores a leading v on either side', () => {
    expect(shouldShow('v1.2.0', '1.2.0', SAMPLE)).toBe(false);
  });
});

describe('latestOf', () => {
  it('sorts by number, not by string — 1.10 is above 1.2', () => {
    expect(latestOf(SAMPLE)).toBe('1.10.0');
  });

  it('is null when there are no notes at all', () => {
    expect(latestOf({})).toBeNull();
  });
});

describe('the notes that actually ship', () => {
  it('every entry has a headline and at least one item', () => {
    for (const [version, entry] of Object.entries(RELEASE_NOTES)) {
      expect(entry.headline, version).toBeTruthy();
      expect(entry.items.length, version).toBeGreaterThan(0);
    }
  });

  it('every item has a title and text a reader can act on', () => {
    for (const [version, entry] of Object.entries(RELEASE_NOTES)) {
      for (const item of entry.items) {
        expect(item.title, version).toBeTruthy();
        expect(item.text, version).toBeTruthy();
        expect(item.title.length, `${version}: ${item.title}`).toBeLessThan(60);
      }
    }
  });

  it('names no version inside its own text — the title already says it', () => {
    for (const [version, entry] of Object.entries(RELEASE_NOTES)) {
      for (const item of entry.items) {
        expect(`${item.title} ${item.text}`, version).not.toMatch(/\bv?\d+\.\d+\.\d+\b/);
      }
    }
  });

  /**
   * NOT "the version in package.json has notes".
   *
   * The suite runs BEFORE `npm run push` bumps the version, so at that moment
   * package.json still names the release that just shipped while the notes have
   * already moved on to the one being prepared — which failed a release on a
   * rule that cannot hold. The version about to ship is checked where it is
   * actually known: `scripts/release.js`, against the bumped number.
   */
  it('is a map of versions to notes, newest first in the file', () => {
    const keys = Object.keys(RELEASE_NOTES);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k, k).toMatch(/^\d+\.\d+\.\d+$/);
    const sorted = [...keys].sort((a, b) => {
      const pa = a.split('.').map(Number); const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pb[i] - pa[i];
      return 0;
    });
    expect(keys).toEqual(sorted);
  });
});
