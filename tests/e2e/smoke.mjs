/**
 * Electron smoke test — the class of bug unit tests structurally cannot see.
 *
 * jsdom has no preload bridge, no main process, no disk and no real Electron
 * APIs, so a broken `contextBridge`, a handler that throws only under Electron,
 * or a vault that never reaches the filesystem all pass a green unit suite.
 * This drives the REAL app, three times, on throwaway profiles.
 *
 * Run AFTER a build:   npm run build && npm run smoke
 */
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mainJs = path.join(root, 'dist-electron', 'main.js');
if (!fs.existsSync(mainJs)) {
  console.error('x dist-electron/main.js not found - run "npm run build" first.');
  process.exit(1);
}

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '+' : 'x'} ${name}${extra ? ` - ${extra}` : ''}`);
};

const newProfile = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-smoke-'));
const launch = (profile) =>
  electron.launch({ args: [mainJs], env: { ...process.env, NEBULA_USER_DATA: profile } });

const noteFiles = (profile) => {
  const dir = path.join(profile, 'storage', 'notes');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
};

let failure = null;

try {
  /* ---------------------------------------------- 1. a fresh, healthy vault */
  const profile = newProfile();
  let app = await launch(profile);
  let win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 20_000 });

  check('window opens with the app shell', true);
  check('window title', (await win.title()) === 'Nebula', await win.title());

  const bridge = await win.evaluate(() => ({
    storage: !!window.nebula?.storage,
    updates: !!window.nebula?.updates,
    paths: typeof window.nebula?.paths === 'function',
    reveal: typeof window.nebula?.reveal === 'function',
  }));
  check('preload bridge exposes storage', bridge.storage);
  check('preload bridge exposes updates', bridge.updates);
  check('preload bridge exposes paths + reveal', bridge.paths && bridge.reveal);

  // Three themes, and the picker shows which one is on without being clicked.
  const themes = await win.evaluate(() => {
    const btns = [...document.querySelectorAll('#theme-pick [data-theme]')];
    return { names: btns.map((b) => b.dataset.theme), on: btns.filter((b) => b.classList.contains('on')).map((b) => b.dataset.theme) };
  });
  check('theme picker offers main, dark and light',
    themes.names.join(',') === 'main,dark,light', themes.names.join(','));
  check('main is the theme on a fresh profile',
    themes.on.length === 1 && themes.on[0] === 'main', themes.on.join(','));

  const switched = await win.evaluate(async () => {
    document.querySelector('#theme-pick [data-theme="light"]').click();
    const applied = document.documentElement.dataset.theme;
    const paper = getComputedStyle(document.body).backgroundColor;
    document.querySelector('#theme-pick [data-theme="main"]').click();
    return { applied, paper, back: document.documentElement.dataset.theme };
  });
  check('switching to light repaints and switching back restores',
    switched.applied === 'light' && switched.back === 'main' && switched.paper === 'rgb(246, 241, 231)',
    switched.paper);

  // The seed notes are what a genuine first run gets, and they must reach disk.
  await win.waitForFunction(() => document.querySelectorAll('.note-row').length > 0, undefined, { timeout: 10_000 });
  const seeded = await win.evaluate(() => document.querySelectorAll('.note-row').length);
  check('a fresh vault seeds the sample notes', seeded === 6, `${seeded} notes`);

  await win.waitForTimeout(1200);
  const onDisk = noteFiles(profile);
  check('notes are mirrored to disk', onDisk.length === 6, `${onDisk.length} files`);
  check('vault meta is stamped', fs.existsSync(path.join(profile, 'storage', 'meta.json')));

  // Path guard, from the renderer, through the real IPC handler.
  const traversal = await win.evaluate(async () => {
    const a = await window.nebula.storage.read('../Preferences');
    const b = await window.nebula.storage.read('../../evil.json');
    return { a: a.ok, b: b.ok };
  });
  check('path traversal reads are rejected', traversal.a === false && traversal.b === false);

  const updateState = await win.evaluate(() => window.nebula.updates.state());
  check('updater reports a mode without crashing',
    ['auto', 'manual'].includes(updateState?.mode), updateState?.mode);

  // About: the answer to "where is this installed".
  const paths = await win.evaluate(() => window.nebula.paths());
  check('paths report a build channel', paths.channel === 'dev', paths.channel);
  check('paths honour NEBULA_USER_DATA and nest storage inside it',
    paths.userData === profile && paths.storage === path.join(profile, 'storage'), paths.storage);

  await win.click('#app-version');
  await win.waitForSelector('#ov-about:not([hidden])', { timeout: 5_000 });
  const aboutRows = await win.evaluate(() => document.querySelectorAll('#about-body .about-table tr').length);
  check('About opens and lists every folder', aboutRows === 6, `${aboutRows} rows`);
  await win.click('#about-close');

  // Editor surfaces that only exist once the real page has booted.
  const surfaces = await win.evaluate(() => ({
    toolbar: !!document.querySelector('#toolbar .tb[data-act="bold"]'),
    slash: !!document.getElementById('slash-menu'),
    shapes: !!document.querySelector('[data-shape-add="rect"]'),
    ai: !!document.getElementById('ai-panel'),
  }));
  check('toolbar, slash menu, shapes and AI panel are wired',
    surfaces.toolbar && surfaces.slash && surfaces.shapes && surfaces.ai);

  // Code blocks live in one seed note, so the note has to be opened first —
  // the boot note is the welcome one.
  const openedCode = await win.evaluate(() => {
    const row = [...document.querySelectorAll('.note-row')]
      .find((el) => el.querySelector('.nr-title')?.textContent.includes('Code blocks'));
    row?.click();
    return !!row;
  });
  check('the code-blocks seed note is in the list', openedCode);
  await win.waitForSelector('#editor .blk-code', { timeout: 5_000 });
  check('opening it renders a highlighted code block',
    await win.evaluate(() => !!document.querySelector('#editor .blk-code .code-src')));

  const before = onDisk.slice().sort().join(',');
  await app.close();

  /* --------------------------------- 2. the same profile again: notes persist */
  app = await launch(profile);
  win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 20_000 });
  await win.waitForFunction(() => document.querySelectorAll('.note-row').length > 0, undefined, { timeout: 10_000 });

  const afterCount = await win.evaluate(() => document.querySelectorAll('.note-row').length);
  const after = noteFiles(profile).sort().join(',');
  check('relaunch shows the same notes, not a second seeding', afterCount === 6, `${afterCount} notes`);
  check('note files are unchanged across a restart', after === before);
  await app.close();

  /* ----------------------------------- 3. editor behaviour, on its own profile */
  // A separate profile so writing in the editor cannot disturb the persistence
  // checks above.
  const scratch = newProfile();
  app = await launch(scratch);
  win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 20_000 });
  await win.waitForFunction(() => document.querySelectorAll('.note-row').length > 0, undefined, { timeout: 10_000 });
  await win.click('#btn-new');
  await win.click('#editor');

  // Lists: a numbered list started under a bulleted one must be its SIBLING.
  // Chromium buries it in the last <li>; lists.js is what puts it back.
  await win.type('#editor', 'one');
  await win.click('[data-act="ul"]');
  await win.keyboard.press('Enter');
  await win.type('#editor', 'two');
  await win.click('[data-act="ol"]');
  const lists = await win.evaluate(() => {
    const ed = document.getElementById('editor');
    return {
      ul: ed.querySelectorAll(':scope > ul').length,
      ol: ed.querySelectorAll(':scope > ol').length,
      buried: ed.querySelectorAll('li ol, li ul').length,
    };
  });
  check('a numbered list under a bulleted one is a sibling, not nested',
    lists.ul === 1 && lists.ol === 1 && lists.buried === 0, JSON.stringify(lists));

  // Inline formats have to be escapable.
  await win.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p>plain</p>';
    const p = ed.querySelector('p');
    const r = document.createRange();
    r.setStart(p.firstChild, 0);
    r.setEnd(p.firstChild, 5);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  await win.click('[data-act="code"]');
  check('inline code wraps the selection',
    await win.evaluate(() => !!document.querySelector('#editor .inline-code')));

  await win.evaluate(() => {
    // focus() before placing the caret — clicking the editor afterwards would
    // move the caret to wherever the click landed and undo this.
    const ed = document.getElementById('editor');
    ed.focus();
    const span = ed.querySelector('.inline-code');
    const r = document.createRange();
    r.setStart(span.firstChild, span.firstChild.length);
    r.collapse(true);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  await win.keyboard.press('Enter');
  await win.keyboard.type('after');
  {
    const state = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      return {
        ok: [...ed.querySelectorAll('.inline-code')].every((c) => !c.textContent.includes('after')),
        html: ed.innerHTML,
      };
    });
    check('Enter at the end of inline code starts a plain line', state.ok, state.ok ? '' : state.html);
  }

  // Equation: KaTeX, from source, surviving a reload.
  await win.click('[data-act="eq"]');
  await win.waitForSelector('#eq-pop:not([hidden])', { timeout: 5_000 });
  check('the equation editor opens', true);
  await win.fill('#eq-input', '\\frac{a}{b}');
  check('it previews as you type',
    await win.evaluate(() => !!document.querySelector('#eq-preview .katex')));
  await win.press('#eq-input', 'Enter');
  await win.waitForSelector('#editor .inline-eq .katex', { timeout: 5_000 });
  check('the equation is typeset into the note',
    await win.evaluate(() => document.querySelector('#editor .inline-eq')?.dataset.tex === '\\frac{a}{b}'));

  // An equation survives leaving the note and coming back, because it is
  // regenerated from data-tex rather than restored from saved markup.
  await win.evaluate(() => {
    const rows = [...document.querySelectorAll('.note-row')];
    rows[rows.length - 1].click();
  });
  await win.waitForTimeout(400);
  await win.evaluate(() => document.querySelectorAll('.note-row')[0].click());
  await win.waitForTimeout(600);
  check('the equation is still typeset after switching notes',
    await win.evaluate(() => !!document.querySelector('#editor .inline-eq .katex')));

  // The shape bar must not survive a note switch.
  await win.click('[data-act="shape-rect"]');
  await win.waitForSelector('#shape-bar:not([hidden])', { timeout: 5_000 });
  check('selecting a shape opens its bar', true);
  await win.evaluate(() => {
    const rows = [...document.querySelectorAll('.note-row')];
    rows[rows.length - 1].click();
  });
  await win.waitForTimeout(400);
  check('the shape bar closes when the note changes',
    await win.evaluate(() => document.getElementById('shape-bar').hidden));

  // The languages the user asked for, read off the control they appear in.
  await win.click('#editor');
  await win.click('[data-act="codeblock"]');
  await win.waitForSelector('#editor .blk-code .code-lang', { timeout: 5_000 });
  const langs = await win.evaluate(() =>
    [...document.querySelectorAll('#editor .blk-code .code-lang option')].map((o) => o.value));
  check('C, C++, C#, Java, Dart and Ruby are offered',
    ['c', 'cpp', 'csharp', 'java', 'dart', 'ruby'].every((l) => langs.includes(l)), `${langs.length} languages`);

  await app.close();

  /* -------------------------- 4. an unreadable vault must NOT look like a first run */
  // storage/notes as a FILE makes readdir fail with ENOTDIR - a real error that
  // is not ENOENT, which is exactly the case that used to seed over live data.
  const broken = newProfile();
  fs.mkdirSync(path.join(broken, 'storage'), { recursive: true });
  fs.writeFileSync(path.join(broken, 'storage', 'notes'), 'not a directory', 'utf8');

  app = await launch(broken);
  win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 20_000 });
  await win.waitForTimeout(1500);

  const brokenState = await win.evaluate(() => ({
    banner: !document.getElementById('demo-banner').hidden,
    isError: document.getElementById('demo-banner').classList.contains('storage-error'),
    rows: document.querySelectorAll('.note-row').length,
  }));
  check('unreadable vault shows the storage error banner', brokenState.banner && brokenState.isError);
  check('unreadable vault seeds nothing', brokenState.rows === 0, `${brokenState.rows} notes`);
  check('unreadable vault is left exactly as it was',
    fs.readFileSync(path.join(broken, 'storage', 'notes'), 'utf8') === 'not a directory');
  await app.close();
} catch (err) {
  failure = err;
  check('smoke run completed', false, err.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failure) console.error(failure);
process.exit(failed.length ? 1 : 0);
