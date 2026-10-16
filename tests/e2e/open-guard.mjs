/**
 * "Open" on a file card hands a copy to the system (hunt B12). The name on a
 * card is note text — an imported note says whatever it likes — so the copy's
 * ending is the stored file's, never the card's: a stored .txt the card calls
 * "readme.bat" opens as text. And a program, a script or a shortcut is run, not
 * shown: Open asks first, Cancel is the default, and nothing is copied out
 * before the answer. shell.openPath is replaced by a recorder: nothing runs.
 *
 *   node tests/e2e/open-guard.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');

const TXT = 'att-mabc123-0a1b2c3d.txt';
const BAT = 'att-mabc124-0a1b2c3e.bat';
const card = (file, name) => `<div class="link-block link-attach" contenteditable="false" data-block-type="link" data-kind="attach" data-name="${name}" data-size="12" data-src="nebula-media://note/n-guard/${file}"></div>`;

export async function runOpenGuardChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-open-guard-'));
  const folder = path.join(profile, 'storage/notes/n-guard');
  fs.mkdirSync(folder, { recursive: true });
  const content = `<p>Cards</p>${card(TXT, 'readme.bat')}<p><br></p>${card(BAT, 'tool.bat')}<p>end</p>`;
  fs.writeFileSync(path.join(folder, 'n-guard.json'), JSON.stringify({ id: 'n-guard', title: 'Open guard', content, createdAt: Date.now(), updatedAt: Date.now() }));
  fs.writeFileSync(path.join(folder, TXT), '@echo words\r\n');
  fs.writeFileSync(path.join(folder, BAT), '@echo tool\r\n');
  const opened = path.join(profile, 'opened');
  const zoneOf = (file) => { try { return fs.readFileSync(`${file}:Zone.Identifier`, 'utf8'); } catch { return null; } };
  const internetZone = '[ZoneTransfer]\r\nZoneId=3\r\n';
  const copies = () => { try { return fs.readdirSync(opened, { recursive: true }).map(String).filter((n) => /\.(txt|bat)$/.test(n)); } catch { return []; } };
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    await app.evaluate(({ dialog, shell }) => {
      globalThis.__asked = [];
      globalThis.__answer = 0;
      dialog.showMessageBox = async (...args) => { const o = args.find((a) => a && a.buttons); globalThis.__asked.push(o?.message ?? ''); return { response: globalThis.__answer }; };
      globalThis.__opened = [];
      shell.openPath = async (p) => { globalThis.__opened.push(p); return ''; };
    });
    await win.waitForFunction(() => !!document.querySelector('.note-row'));
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { timeout: 5000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes('Open guard'))?.click());
    await win.waitForFunction(() => document.querySelectorAll('#editor .link-attach .attach-bar [data-attach="open"]').length === 2);
    const openCard = async (i) => {
      await win.evaluate((n) => document.querySelectorAll('#editor .link-attach')[n].querySelector('.attach-bar [data-attach="open"]').click(), i);
      await new Promise((r) => { setTimeout(r, 600); });
    };
    const state = () => app.evaluate(() => ({ asked: globalThis.__asked.slice(), opened: globalThis.__opened.slice() }));
    // The face is note text too (hunt B13): it is drawn from the stored ending.
    const faces = await win.evaluate(() => [...document.querySelectorAll('#editor .link-attach')].map((c) => `${c.querySelector('.attach-icon__ext')?.textContent} ${c.querySelector('.link-card__title')?.textContent}`));
    check('a card shows the stored file’s ending, not the one its name claims', faces[0] === 'TXT readme.bat.txt' && faces[1] === 'BAT tool.bat', JSON.stringify(faces));

    await openCard(0);
    let s = await state();
    check('a stored .txt opens as a .txt, whatever its card calls it', s.opened.length === 1 && path.basename(s.opened[0]) === 'readme.bat.txt', JSON.stringify(s));
    check('a text file opens without a question', s.asked.length === 0, JSON.stringify(s.asked));
    if (process.platform === 'win32') {
      check('Open marks its completed copy, never the stored file', zoneOf(s.opened[0]) === internetZone && zoneOf(path.join(folder, TXT)) === null, JSON.stringify({ copy: zoneOf(s.opened[0]), stored: zoneOf(path.join(folder, TXT)) }));
      const saved = path.join(profile, 'saved-copy.txt');
      await app.evaluate(({ dialog }, dest) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: dest }); }, saved);
      await win.evaluate(() => document.querySelectorAll('#editor .link-attach')[0].querySelector('.attach-bar [data-attach="save"]').click());
      for (let i = 0; i < 30 && !fs.existsSync(saved); i++) await new Promise((r) => setTimeout(r, 100));
      check('Save a copy marks the chosen destination after copying', fs.existsSync(saved) && zoneOf(saved) === internetZone && fs.readFileSync(saved, 'utf8') === '@echo words\r\n', JSON.stringify({ copy: zoneOf(saved), exists: fs.existsSync(saved) }));
    }

    await openCard(1);
    s = await state();
    check('Open on an attached .bat asks first', s.asked.length === 1 && /tool\.bat/.test(s.asked[0]), JSON.stringify(s.asked));
    check('Cancel runs nothing and copies nothing out', s.opened.length === 1 && !copies().some((n) => n.endsWith('.bat')), JSON.stringify({ opened: s.opened, copies: copies() }));

    await app.evaluate(() => { globalThis.__answer = 1; });
    await openCard(1);
    s = await state();
    check('Open anyway opens it', s.asked.length === 2 && s.opened.length === 2 && path.basename(s.opened[1]) === 'tool.bat', JSON.stringify(s));
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runOpenGuardChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` - ${detail}`}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
