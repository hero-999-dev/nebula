/**
 * The first run, on any system: the app opens, a note is written, the app is
 * closed, and on the next start the note is there.
 *
 * The smoke suite (smoke.mjs) grew on Windows and has never run anywhere else;
 * its black-hole checks need a keyring a Linux runner does not have. This is
 * what the Linux job of the release runs in its place (1.0.4): the real
 * Electron app on a throwaway profile, through the preload bridge, the main
 * process and the vault on disk — and nothing a system has to be set up for.
 *
 * Run AFTER a build:   npm run build && node tests/e2e/first-run.mjs
 * On Linux without a screen:   xvfb-run -a node tests/e2e/first-run.mjs
 */
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { sweepStaleProfiles, readNotesIn } from './profiles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mainJs = path.join(root, 'dist-electron', 'main.js');
sweepStaleProfiles();
if (!fs.existsSync(mainJs)) {
  console.error('x dist-electron/main.js not found - run "npm run build" first.');
  process.exit(1);
}

const WORDS = 'first run on this system';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '+' : 'x'} ${name}${extra ? ` - ${extra}` : ''}`);
};

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-first-'));
const launch = () => electron.launch({ args: [mainJs], env: { ...process.env, NEBULA_USER_DATA: profile } });
const open = async (app) => {
  const win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 30_000 });
  await win.waitForFunction(() => document.querySelectorAll('.note-row').length > 0, undefined, { timeout: 15_000 });
  return win;
};
const rows = (win) => win.evaluate(() => document.querySelectorAll('.note-row').length);
const onDisk = () => readNotesIn(path.join(profile, 'storage', 'notes'))
  .filter((note) => JSON.stringify(note).includes(WORDS)).length;

let app = null;
let failure = null;
try {
  /* ------------------------------------------------ 1. a fresh profile opens */
  app = await launch();
  let win = await open(app);
  check('the window opens with the app in it', true);
  check('window title', (await win.title()) === 'Nebula', await win.title());
  const bridge = await win.evaluate(() => window.nebula?.platform ?? null);
  check('the preload bridge names this system', bridge === process.platform, `${bridge} / ${process.platform}`);
  const seeded = await rows(win);
  check('the guide is seeded', seeded === 1, `${seeded} notes`);

  /* ------------------------------------------------------ 2. a note is written */
  // The handler is run, not the pointer: Playwright's click waits on frames a
  // window that is not being drawn never gives (smoke.mjs, `press`).
  await win.evaluate(() => document.getElementById('btn-new').click());
  await win.waitForFunction((n) => document.querySelectorAll('.note-row').length === n + 1, seeded, { timeout: 10_000 });
  await win.evaluate(() => document.getElementById('editor').focus());
  await win.keyboard.type(WORDS, { delay: 5 });
  const typed = await win.evaluate(() => document.getElementById('editor').textContent);
  check('the editor takes the words', typed.includes(WORDS), typed.slice(0, 60));
  // Saving waits for a pause in the typing; the file is what counts.
  const until = Date.now() + 15_000;
  while (onDisk() === 0 && Date.now() < until) await win.waitForTimeout(250);
  check('the note reaches the disk', onDisk() === 1, `${onDisk()} files with the words`);
  await app.close();
  app = null;

  /* ------------------------------------------- 3. the next start still has it */
  app = await launch();
  win = await open(app);
  const again = await rows(win);
  check('the next start shows both notes, and seeds no second guide', again === seeded + 1, `${again} notes`);
  check('the note is on the disk after the restart', onDisk() === 1, `${onDisk()} files with the words`);
  const listed = await win.evaluate((words) => [...document.querySelectorAll('.note-row')].some((row) => row.textContent.includes(words)), WORDS);
  check('and its words are in the list', listed);
} catch (err) {
  failure = err;
  check('the first run finished', false, err.message);
} finally {
  try { await app?.close(); } catch { /* already gone */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* the sweep takes it next time */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failure) console.error(failure);
process.exit(failed.length ? 1 : 0);
