/**
 * The release commit goes through GitHub's own build BEFORE it is tagged.
 *
 * Five releases in a row (0.9.4 to 0.9.8) passed every gate on this machine and
 * then failed on GitHub's Windows runner: a path that held on Windows only, and
 * timings a slower machine did not meet. A tag already pushed cannot be taken
 * back from installed apps' point of view, so each repair needed a new tag —
 * 0.9.7 and 0.9.8 were never published and their numbers are gone.
 *
 * `npm run push` therefore pushes the release commit to `precheck/vX.Y.Z`,
 * which runs .github/workflows/release.yml with every job except publish, and
 * waits for it. Only a green run gets the tag. The branch is removed afterwards
 * either way; a red run leaves no tag, no release and no commit on main.
 *
 *   npm run precheck:ci           the same check on the current HEAD, no release
 */
import { execFileSync } from 'node:child_process';
import { ROOT } from './paths.js';

export const REPO = 'hero-999-dev/nebula';
export const WORKFLOW = 'release.yml';

/**
 * Git's credential chain, reset to the gh session we are signed into.
 *
 * Credential helpers are ADDITIVE: naming one only appends it to a list that
 * already holds the machine's global `manager`, and Git asks them in order — so
 * Windows' credential manager opened an interactive window and the release sat
 * on it forever. Three releases were lost that way before the empty value,
 * which clears the list, went in. `publish-site.js` learned this first.
 * release.js takes REPO and CREDS from here, so the two cannot drift apart.
 */
export const CREDS = [
  '-c', 'credential.helper=',
  '-c', 'credential.helper=!gh auth git-credential',
];

function git(...args) {
  return execFileSync('git', [...CREDS, ...args], {
    cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

function gh(...args) {
  return execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The branch a version's precheck runs on. */
export const precheckBranch = (label) => `precheck/${label}`;

/**
 * The run that built exactly this commit for this push, newest first; null
 * when none yet. A run of the same commit that was there before the push (an
 * earlier precheck of it, a re-run) is not this one: it may be red, green or
 * still going for reasons of its own.
 * @param {Array<{databaseId: number, headSha: string}>|undefined} runs
 * @param {string} sha
 * @param {Set<number>} [before] ids of the runs that existed before the push
 */
export function runForSha(runs, sha, before = new Set()) {
  return (runs || []).find((r) => r.headSha === sha && !before.has(r.databaseId)) ?? null;
}

function listRuns(branch) {
  return JSON.parse(gh('run', 'list', '--repo', REPO, '--workflow', WORKFLOW,
    '--branch', branch, '--limit', '20', '--json', 'databaseId,headSha,url'));
}

/**
 * Push `sha` to the precheck branch, wait for its run, remove the branch.
 *
 * @param {{sha: string, label: string, findTimeoutMs?: number, log?: (s: string) => void}} o
 * @returns {Promise<{ok: boolean, url: string|null, conclusion: string}>}
 *   ok is true only for a run that finished with `success`. A run that could
 *   not be found or watched is not a pass: an unproved build is not tagged.
 */
export async function precheckOnCi({ sha, label, findTimeoutMs = 180_000, log = console.log }) {
  const branch = precheckBranch(label);
  // Ctrl+C would end the process at once and skip the `finally` below, leaving
  // the precheck branch on GitHub (and, in release.js, an untagged release
  // commit). With a listener the run is only marked, and the waiting stops.
  let interrupted = false;
  const onInterrupt = () => { interrupted = true; log('\n  interrupted: stopping the precheck and removing its branch…'); };
  process.on('SIGINT', onInterrupt);
  try {
    log(`\n> precheck on GitHub: ${branch} (${sha.slice(0, 7)})`);
    let before = new Set();
    try { before = new Set(listRuns(branch).map((r) => r.databaseId)); } catch { /* none, or no answer: nothing to skip */ }
    // --force: a precheck branch left behind by an interrupted run is replaced.
    // A push that fails returns instead of throwing, so the caller still
    // undoes its release commit.
    try {
      git('push', '--force', 'origin', `${sha}:refs/heads/${branch}`);
    } catch (err) {
      log(`  ${String(err.stderr || err.message).trim()}`);
      return { ok: false, url: null, conclusion: 'push-failed' };
    }

    let run = null;
    const until = Date.now() + findTimeoutMs;
    while (!run && !interrupted && Date.now() < until) {
      await sleep(5000);
      try {
        run = runForSha(listRuns(branch), sha, before);
      } catch { /* the API can lag behind the push; ask again */ }
    }
    if (interrupted) return { ok: false, url: run?.url ?? null, conclusion: 'interrupted' };
    if (!run) return { ok: false, url: null, conclusion: 'not-found' };

    log(`  run: ${run.url}`);
    log('  waiting for Windows (tests, build, smoke, package) and macOS (tests, package)…');
    try {
      execFileSync('gh', ['run', 'watch', String(run.databaseId), '--repo', REPO,
        '--exit-status', '--interval', '30'], { cwd: ROOT, stdio: 'inherit' });
    } catch { /* the conclusion below decides, not the watcher's exit code */ }

    let conclusion = 'unknown';
    try {
      conclusion = JSON.parse(gh('run', 'view', String(run.databaseId), '--repo', REPO,
        '--json', 'conclusion')).conclusion || 'unknown';
    } catch { /* stays unknown, which is not a pass */ }
    await sleep(0); // a Ctrl+C that stopped the watcher is heard here
    if (interrupted) return { ok: false, url: run.url, conclusion: 'interrupted' };
    return { ok: conclusion === 'success', url: run.url, conclusion };
  } finally {
    try { git('push', 'origin', '--delete', branch); } catch { /* already gone */ }
    process.off('SIGINT', onInterrupt);
  }
}

/** Run directly: prove the current HEAD on GitHub without releasing anything. */
if (process.argv[1] && process.argv[1].endsWith('precheck-ci.js')) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const result = await precheckOnCi({ sha, label: `manual-${sha.slice(0, 7)}` });
  if (result.ok) {
    console.log(`\n  precheck passed: ${result.url}\n`);
  } else {
    console.error(`\n  precheck did not pass (${result.conclusion})${result.url ? `: ${result.url}` : ''}\n`);
    process.exit(1);
  }
}
