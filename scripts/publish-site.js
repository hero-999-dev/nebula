/**
 * publish-site.js — push the generated docs site to the public web mirror.
 *
 *   npm run publish-site            (also runs at the end of npm run push)
 *
 * The mirror is a separate public repository, hosted on GitHub Pages, with the
 * page behind a password gate. Two things about that gate:
 *
 *   - The content lives in `p-<sha256("nebula:<password>")[:20]>/`, and the gate
 *     page derives that name in the browser from whatever the visitor types.
 *     Neither the password nor the directory name is in the gate's source; a
 *     wrong password simply asks for a directory that does not exist.
 *   - It locks the LINK, not the content. The repository is public, so anyone
 *     browsing it sees the directory. Nothing that would be a problem to read
 *     goes behind it — this is documentation for an open-source app.
 *
 * No credentials live here or in CI: this runs on your machine and uses the
 * `gh` session you are already signed into.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './paths.js';

const REPO = 'hero-999-dev/nebula-web';
const GATE_DIR = 'p-0248cf16830a5399fd15';   // sha256("nebula:<shared gate password>")[:20]

const dryRun = process.argv.includes('--dry-run');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

const site = path.join(ROOT, 'site', 'index.html');
if (!fs.existsSync(site)) {
  console.error('site/index.html is missing - run `npm run site` first.');
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-web-'));
try {
  console.log(`  cloning ${REPO}`);
  run('gh', ['repo', 'clone', REPO, work, '--', '--depth', '1'], { stdio: 'pipe' });

  // Point this clone at the gh session we are already signed into — locally, so
  // nothing is written to the machine's global git config.
  //
  // The empty value first is what makes it work. Credential helpers are
  // ADDITIVE: naming ours only appends it to a list that already holds the
  // machine's global `manager`, and Git asks them in order — so Windows'
  // credential manager opened an interactive window and the release sat on it
  // forever, twice. An empty string resets the chain, leaving only ours.
  run('git', ['config', '--local', '--replace-all', 'credential.helper', ''], { cwd: work });
  run('git', ['config', '--local', '--add', 'credential.helper', '!gh auth git-credential'], { cwd: work });

  const gate = path.join(work, GATE_DIR);
  fs.mkdirSync(gate, { recursive: true });
  fs.copyFileSync(site, path.join(gate, 'index.html'));

  const status = run('git', ['status', '--porcelain'], { cwd: work });
  if (!status) {
    console.log('  site unchanged - nothing to publish');
    process.exit(0);
  }

  if (dryRun) {
    console.log(`  dry run - would publish:\n${status}`);
    process.exit(0);
  }

  run('git', ['add', '-A'], { cwd: work });

  // `git status --porcelain` above reports a file whose only difference is its
  // line endings; staging normalises that away and leaves nothing to commit, so
  // re-publishing an unchanged site failed with "nothing to commit" and read as
  // a broken release. Ask the INDEX, which is what the commit will actually see.
  try {
    run('git', ['diff', '--cached', '--quiet'], { cwd: work });
    console.log('  site already published - nothing to do');
    process.exit(0);
  } catch {
    // a non-zero exit here means there ARE staged changes, which is the point
  }

  run('git', ['commit', '-m', `Docs for Nebula v${version}`], { cwd: work });
  run('git', ['push'], { cwd: work });

  console.log(`  published -> https://hero-999-dev.github.io/nebula-web/`);
} catch (err) {
  console.error(`  publish-site failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
