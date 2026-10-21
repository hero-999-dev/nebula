/**
 * 1.0.0 — the spell checker on for every language, and a language taken off
 * it in Settings (the owner: "the word corrector active for all languages,
 * changed in Settings, a language removed from it"). The real app on a
 * throwaway profile; what the session is told to check is read back from the
 * main process.
 *
 *   node tests/e2e/spelling.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runSpellingChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-spell-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, 'sp.json'), JSON.stringify({ id: 'sp', title: 'sp', content: '<p>words</p>', createdAt: 1, updatedAt: 1 }));
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const session = () => app.evaluate(({ BrowserWindow }) => {
      const ses = BrowserWindow.getAllWindows()[0].webContents.session;
      return { on: ses.isSpellCheckerEnabled(), langs: ses.getSpellCheckerLanguages(), have: ses.availableSpellCheckerLanguages };
    });
    const until = async (what, ms = 4000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await session(); if (what(v)) return v; await win.waitForTimeout(100); } return session(); };
    const want = (have, tags) => tags.filter((t) => have.includes(t));

    const first = await session();
    const all = [...want(first.have, ['en-US', 'en-GB']), ...[['de-DE', 'de'], ['pl', 'pl-PL'], ['tr', 'tr-TR']].map((tags) => want(first.have, tags)[0]).filter(Boolean)];
    const atStart = await until((s) => s.langs.length === all.length);
    check('at start every language with a dictionary is checked', atStart.on && all.every((t) => atStart.langs.includes(t)) && all.length >= 4, JSON.stringify({ atStart, all }));

    await win.click('#app-menu [data-cmd="settings.open"]');
    await win.waitForFunction(() => !document.getElementById('ov-settings').hidden, null, { polling: 50 });
    const boxes = await win.evaluate(() => [...document.querySelectorAll('[id^="set-spell-"]')].map((b) => `${b.value}:${b.checked}:${b.nextElementSibling.textContent}`));
    check('Settings shows the four languages, all ticked, each in its own words', boxes.join(',') === 'en:true:English,de:true:Deutsch,pl:true:Polski,tr:true:Türkçe', boxes.join(','));

    await win.click('#set-spell-tr');
    await win.click('#set-spell-de');
    const two = await until((s) => !s.langs.some((t) => t.startsWith('tr') || t.startsWith('de')));
    check('unticking Türkçe and Deutsch takes them off the checker', two.on && !two.langs.some((t) => t.startsWith('tr') || t.startsWith('de')) && two.langs.some((t) => t.startsWith('pl')) && two.langs.includes('en-US'), JSON.stringify(two));

    await win.click('#set-spell-en');
    await win.click('#set-spell-pl');
    const none = await until((s) => !s.on);
    check('with none ticked the checker is off', !none.on, JSON.stringify(none));

    await win.click('#set-spell-tr');
    const back = await until((s) => s.on && s.langs.some((t) => t.startsWith('tr')));
    check('ticking Türkçe again turns it on with Turkish alone', back.on && back.langs.length === 1 && back.langs[0].startsWith('tr'), JSON.stringify(back));

    // The choice is kept: the app started again on the same profile checks only Turkish.
    await app.close();
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win2 = await app.firstWindow();
    await win2.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win2.waitForTimeout(600);
    const kept = await session();
    check('the choice is kept when the app starts again', kept.on && kept.langs.length === 1 && kept.langs[0].startsWith('tr'), JSON.stringify(kept));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  let failed = 0;
  await runSpellingChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`\n${count - failed}/${count} spelling checks passed`);
  process.exit(failed ? 1 : 0);
}
