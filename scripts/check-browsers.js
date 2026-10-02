/**
 * Is the app still a browser Google lets sign in? (0.9.3)
 *
 * The sign-in windows tell Google they are Firefox (today's, or the ESR), or
 * the Chromium inside Electron. A version that has fallen behind is what
 * Google answers with "Try using a different browser" — the owner met it with
 * a fixed Firefox 128, two years old. "Check this on every new version so we
 * do not get the error again" (the owner, 2026-09-30): `npm run push` runs
 * this and stops on a Firefox that is behind; preflight shows it.
 *
 *   node scripts/check-browsers.js        (npm run check:browsers)
 *
 * And Electron itself (the owner, 2026-09-30): "whenever Nebula is about to
 * be updated, check Electron; if there is an update, update Electron, then do
 * a bug check". A newer Electron on npm stops the release with the commands
 * that upgrade it and the tests that make the bug check.
 *
 * Asks Mozilla's own version list, Google's Chromium dashboard and npm. Offline,
 * it says so and does not stop anything.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ROOT } from './paths.js';
import * as services from '../src/js/ai-services.js';

const MOZILLA = 'https://product-details.mozilla.org/1.0/firefox_versions.json';
const CHROME = 'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1';
const ELECTRON = 'https://registry.npmjs.org/electron/latest';
/** How far Electron's Chromium may lag Chrome before the check says an Electron upgrade is due. */
const CHROMIUM_LAG = 4;

const major = (v) => Number.parseInt(String(v ?? ''), 10);

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function electronChromium() {
  try {
    const exe = execFileSync(process.execPath, ['-e', "process.stdout.write(require('electron'))"], { cwd: ROOT, encoding: 'utf8' }).trim();
    const out = execFileSync(exe, ['-e', 'process.stdout.write(process.versions.chrome)'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }).trim();
    return out || null;
  } catch { return null; }
}

/**
 * @param {{now?: number, mozilla?: object, chrome?: object[], engine?: string|null, electron?: string, installed?: string|null}} [given]
 *   the version lists and the engine, when a test hands them over
 * @returns {Promise<{ok: boolean, offline: boolean, rows: {name: string, ok: boolean, warn?: boolean, found: string, want: string, fix?: string}[]}>}
 */
export async function checkBrowsers(given = {}) {
  const now = given.now ?? Date.now();
  const rows = [];
  let offline = false;
  let mozilla = given.mozilla;
  let chrome = given.chrome;
  let electron = given.electron;
  try {
    mozilla ??= await getJson(MOZILLA);
    chrome ??= await getJson(CHROME);
    electron ??= (await getJson(ELECTRON)).version;
  } catch (err) {
    offline = true;
    rows.push({ name: 'version lists', ok: true, warn: true, found: 'not reachable', want: '', fix: `could not check: ${err.message}` });
  }

  if (mozilla) {
    const latest = major(mozilla.LATEST_FIREFOX_VERSION);
    const told = services.currentFirefox(now);
    // A release lands a few days either side of the four-week count: the one
    // before today's is still a Firefox that millions run.
    const ok = told === latest || told === latest - 1;
    rows.push({
      name: 'Firefox', ok, found: String(told), want: String(latest),
      fix: ok ? undefined : `set FIREFOX_RELEASE in src/js/ai-services.js to { version: ${latest}, date: '${mozilla.LAST_RELEASE_DATE}' }`,
    });
    const esr = major(mozilla.FIREFOX_ESR);
    const esrNext = major(mozilla.FIREFOX_ESR_NEXT);
    const esrOk = services.FIREFOX_ESR === esr || services.FIREFOX_ESR === esrNext;
    rows.push({
      name: 'Firefox ESR', ok: esrOk, found: String(services.FIREFOX_ESR), want: esrNext ? `${esr} or ${esrNext}` : String(esr),
      fix: esrOk ? undefined : `set FIREFOX_ESR in src/js/ai-services.js to ${esr}`,
    });
  }

  const engine = given.engine !== undefined ? given.engine : electronChromium();
  const stable = Array.isArray(chrome) ? chrome[0] : null;
  if (engine && stable) {
    const lag = major(stable.version) - major(engine);
    const behind = lag > CHROMIUM_LAG;
    rows.push({
      name: 'Chromium (Electron)', ok: true, warn: behind, found: String(major(engine)), want: String(major(stable.version)),
      fix: behind ? `Electron's Chromium is ${lag} versions behind Chrome: sites may refuse sign-ins or captchas as an old browser — upgrade Electron` : undefined,
    });
  }
  const installed = given.installed !== undefined ? given.installed : installedElectron();
  if (electron && installed) {
    const newer = compareVersions(electron, installed) > 0;
    rows.push({
      name: 'Electron', ok: !newer, found: installed, want: electron,
      fix: newer ? `a newer Electron is out: npm install --save-dev electron@^${electron} && npx install-electron --no — read docs/breaking-changes for every major in between, then the bug check: npm test, npm run build, npm run smoke` : undefined,
    });
  }
  return { ok: rows.every((r) => r.ok), offline, rows };
}

/** The Electron this repository builds with. */
function installedElectron() {
  try {
    return JSON.parse(execFileSync(process.execPath, ['-p', "JSON.stringify(require('electron/package.json').version)"], { cwd: ROOT, encoding: 'utf8' }));
  } catch { return null; }
}

/** a > b: 1, a < b: -1, same: 0 (plain x.y.z; a pre-release counts as older). */
export function compareVersions(a, b) {
  const parse = (v) => String(v).split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
  const pa = String(a).includes('-');
  const pb = String(b).includes('-');
  return pa === pb ? 0 : (pa ? -1 : 1);
}

export function printBrowsers({ rows }, log = console.log) {
  for (const r of rows) {
    const mark = !r.ok ? 'BEHIND' : r.warn ? 'warn  ' : 'ok    ';
    log(`  ${mark} ${r.name.padEnd(20)} told ${r.found.padEnd(6)} out now ${r.want}`);
    if (r.fix) log(`         ${r.fix}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkBrowsers();
  printBrowsers(result);
  if (!result.ok) process.exitCode = 1;
}
