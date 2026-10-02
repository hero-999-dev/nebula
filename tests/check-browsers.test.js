/**
 * The browser the sign-in windows tell Google they are (0.9.3): checked on
 * every release, so a version that fell behind never ships again.
 */
import { describe, it, expect } from 'vitest';
import { checkBrowsers, compareVersions } from '../scripts/check-browsers.js';

const NOW = Date.UTC(2026, 8, 30);
const mozilla = (latest, esr = '140.17.0esr', next = '153.4.0esr') => ({ LATEST_FIREFOX_VERSION: `${latest}.0`, FIREFOX_ESR: esr, FIREFOX_ESR_NEXT: next, LAST_RELEASE_DATE: '2026-09-29' });

describe('check-browsers', () => {
  it('passes when the Firefox told is today\'s (or the one before)', async () => {
    const r = await checkBrowsers({ now: NOW, mozilla: mozilla(157), chrome: [{ version: '154.0.1' }], engine: '152.0.0' });
    expect(r.ok).toBe(true);
    expect((await checkBrowsers({ now: NOW, mozilla: mozilla(158), chrome: [], engine: null })).ok).toBe(true);
  });

  it('stops on a Firefox that fell behind, and says the line to change', async () => {
    const r = await checkBrowsers({ now: NOW, mozilla: mozilla(160), chrome: [], engine: null });
    expect(r.ok).toBe(false);
    expect(r.rows.find((x) => x.name === 'Firefox').fix).toContain("{ version: 160, date: '2026-09-29' }");
  });

  it('stops on an ESR that is no longer one', async () => {
    const r = await checkBrowsers({ now: NOW, mozilla: mozilla(157, '153.5.0esr', ''), chrome: [], engine: null });
    expect(r.ok).toBe(false);
    expect(r.rows.find((x) => x.name === 'Firefox ESR').fix).toContain('153');
  });

  it('says loudly, without stopping, that Electron\'s Chromium is years behind', async () => {
    const r = await checkBrowsers({ now: NOW, mozilla: mozilla(157), chrome: [{ version: '154.0.8037.93' }], engine: '130.0.6723.191' });
    expect(r.ok).toBe(true);
    const row = r.rows.find((x) => x.name === 'Chromium (Electron)');
    expect(row.warn).toBe(true);
    expect(row.fix).toContain('24 versions behind');
  });

  it('stops when a newer Electron is out, and says how to upgrade and what to test (the owner, 2026-09-30)', async () => {
    const base = { now: NOW, mozilla: mozilla(157), chrome: [], engine: null };
    const behind = await checkBrowsers({ ...base, electron: '44.6.0', installed: '44.5.0' });
    expect(behind.ok).toBe(false);
    const row = behind.rows.find((x) => x.name === 'Electron');
    expect(row.fix).toContain('npm install --save-dev electron@^44.6.0');
    expect(row.fix).toContain('npm run smoke');
    expect((await checkBrowsers({ ...base, electron: '44.5.0', installed: '44.5.0' })).ok).toBe(true);
    expect(compareVersions('45.0.0', '44.9.9')).toBe(1);
    expect(compareVersions('44.5.0', '44.5.0')).toBe(0);
    expect(compareVersions('45.0.0-beta.1', '45.0.0')).toBe(-1);
  });
});
