import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runForSha, precheckBranch, WORKFLOW } from '../scripts/precheck-ci.js';
import { ROOT } from '../scripts/paths.js';

const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', WORKFLOW), 'utf8');
const release = fs.readFileSync(path.join(ROOT, 'scripts', 'release.js'), 'utf8');

describe('precheck on GitHub before the tag', () => {
  it('finds the run of exactly this commit, not an older run on the branch', () => {
    const runs = [
      { databaseId: 3, headSha: 'bbb', url: 'u3' },
      { databaseId: 2, headSha: 'aaa', url: 'u2' },
    ];
    expect(runForSha(runs, 'aaa').databaseId).toBe(2);
    expect(runForSha(runs, 'ccc')).toBeNull();
    expect(runForSha(undefined, 'aaa')).toBeNull();
  });

  it('skips a run of the same commit that was there before this push', () => {
    const runs = [{ databaseId: 5, headSha: 'aaa' }, { databaseId: 2, headSha: 'aaa' }];
    expect(runForSha(runs, 'aaa', new Set([2])).databaseId).toBe(5);
    expect(runForSha(runs, 'aaa', new Set([2, 5]))).toBeNull();
  });

  it('tags the commit GitHub built, refuses --no-smoke with --no-precheck, and keeps one REPO', () => {
    expect(release).toContain("git('tag', '-a', tag, '-m', `Nebula ${tag}`, releaseSha)");
    expect(release).toMatch(/--no-smoke'\) && skipPrecheck\)/);
    expect(release).not.toMatch(/const REPO =/);
  });

  it('runs the release workflow on precheck branches and publishes only from a tag', () => {
    expect(precheckBranch('v1.2.3')).toBe('precheck/v1.2.3');
    expect(workflow).toMatch(/branches:\s*\n\s*- 'precheck\/\*\*'/);
    expect(workflow).toMatch(/publish:\s*\n\s*needs: \[build-win, build-mac\]\s*\n(?:\s*#.*\n)?\s*if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  });

  it('gives a smoke run that could not finish (exit 2) one more attempt on CI, as the local release does', () => {
    expect(workflow).toMatch(/if \[ "\$code" -ne 2 \]; then exit "\$code"; fi/);
  });

  it('tags only after the precheck, and a failed precheck undoes the commit without a hard reset', () => {
    const precheckAt = release.indexOf('await precheckOnCi(');
    expect(precheckAt).toBeGreaterThan(release.indexOf("git('commit'"));
    expect(precheckAt).toBeLessThan(release.indexOf("git('tag'"));
    expect(release).toContain("git('reset', '--mixed', 'HEAD~1')");
    expect(release).not.toMatch(/reset', '--hard/);
  });
});
