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

// One guide note, the same in every build (seed-notes.js).
const SEEDED = 1;

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
  check('a fresh vault seeds the sample notes', seeded === SEEDED, `${seeded} notes`);

  await win.waitForTimeout(1200);
  const onDisk = noteFiles(profile);
  check('notes are mirrored to disk', onDisk.length === SEEDED, `${onDisk.length} files`);
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

  // The guide is the only starter note, and it is what boots.
  const bootTitle = await win.evaluate(() => document.querySelector('.note-row .nr-title')?.textContent);
  check('the guide is the starter note', bootTitle === 'Welcome to Nebula Guide', bootTitle);

  await win.waitForSelector('#editor .blk-code', { timeout: 5_000 });
  // Every language the picker offers must have a sample IN the guide — the
  // user reported still not seeing examples for all of them, and TypeScript
  // and Bash genuinely had none.
  const guideLangs = await win.evaluate(() => ({
    inNote: [...document.querySelectorAll('#editor .blk-code')].map((b) => b.dataset.lang),
    offered: [...document.querySelectorAll('#editor .blk-code .code-lang option')].map((o) => o.value),
    // A block whose rules failed to load paints no tokens at all and reads as
    // flat grey text — which is exactly what the user would see.
    flat: [...document.querySelectorAll('#editor .blk-code')]
      .filter((b) => !b.querySelector('.code-src [class^="tok-"]'))
      .map((b) => b.dataset.lang),
  }));
  const missing = [...new Set(guideLangs.offered)]
    .filter((l) => l !== 'plain' && !guideLangs.inNote.includes(l));
  check('the guide has a code sample for every language offered',
    missing.length === 0 && guideLangs.inNote.length >= 15,
    missing.length ? `missing: ${missing.join(', ')}` : `${guideLangs.inNote.length} samples`);
  check('every sample is painted, none left flat grey',
    guideLangs.flat.length === 0, guideLangs.flat.join(', '));

  const before = onDisk.slice().sort().join(',');
  await app.close();

  /* --------------------------------- 2. the same profile again: notes persist */
  app = await launch(profile);
  win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 20_000 });
  await win.waitForFunction(() => document.querySelectorAll('.note-row').length > 0, undefined, { timeout: 10_000 });

  const afterCount = await win.evaluate(() => document.querySelectorAll('.note-row').length);
  const after = noteFiles(profile).sort().join(',');
  check('relaunch shows the same notes, not a second seeding', afterCount === SEEDED, `${afterCount} notes`);
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

  // Getting OUT of a list. The report: on an empty numbered item "Backspace
  // does not leave the list, it goes up" — the empty item merged into the line
  // above instead of ending the list.
  const caretAtEndOf = (selector) => win.evaluate((sel) => {
    const ed = document.getElementById('editor');
    ed.focus();
    const r = document.createRange();
    r.selectNodeContents(ed.querySelector(sel));
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }, selector);

  await win.evaluate(() => { document.getElementById('editor').innerHTML = '<ol><li>one</li><li>two</li></ol>'; });
  await caretAtEndOf('li:nth-child(2)');
  await win.keyboard.press('Enter');   // empty third item
  await win.keyboard.press('Enter');   // ...and out of the list
  await win.keyboard.type('plain');
  {
    const state = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      return {
        items: ed.querySelectorAll('li').length,
        inList: [...ed.querySelectorAll('li')].some((li) => li.textContent.includes('plain')),
        html: ed.innerHTML,
      };
    });
    check('Enter on an empty list item ends the list',
      state.items === 2 && !state.inList, state.html);
  }

  await win.evaluate(() => { document.getElementById('editor').innerHTML = '<ol><li>one</li></ol>'; });
  await caretAtEndOf('li');
  await win.keyboard.press('Enter');       // empty second item
  await win.keyboard.press('Backspace');   // must leave the list, not merge up
  await win.keyboard.type('gone');
  {
    const state = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      return {
        items: [...ed.querySelectorAll('li')].map((li) => li.textContent),
        text: ed.textContent,
        html: ed.innerHTML,
      };
    });
    check('Backspace on an empty list item leaves the list instead of merging up',
      state.items.length === 1 && state.items[0] === 'one' && state.text.includes('gone'),
      state.html);
  }

  // The to-do button used to be one-way: a mis-click could not be undone.
  await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>task</p>'; });
  await caretAtEndOf('p');
  await win.click('[data-act="todo"]');
  const todoOn = await win.evaluate(() =>
    document.querySelector('#editor .blk-todo')?.textContent === 'task');
  await win.click('[data-act="todo"]');
  const todoOff = await win.evaluate(() => {
    const ed = document.getElementById('editor');
    return !ed.querySelector('.blk-todo') && ed.textContent.includes('task');
  });
  check('the to-do button toggles a line on and back off', todoOn && todoOff,
    `on=${todoOn} off=${todoOff}`);

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

  // The font picker. It was a <datalist>: every option looked identical, and
  // choosing one with a collapsed caret did nothing at all.
  await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>fonted</p>'; });
  await caretAtEndOf('p');
  await win.click('#tb-font');
  await win.waitForSelector('#menu-font:not([hidden])', { timeout: 5_000 });
  const fontRows = await win.evaluate(() =>
    [...document.querySelectorAll('#menu-font button .label')]
      .map((el) => ({ name: el.textContent.trim(), face: el.style.fontFamily })));
  check('the font menu lists faces, each drawn in its own type',
    fontRows.length >= 12
      && fontRows.every((r) => r.face)
      && new Set(fontRows.map((r) => r.face)).size === fontRows.length,
    `${fontRows.length} fonts`);
  check('the faces the user asked for are all there',
    ['Arial', 'Calibri', 'Times New Roman', 'Comic Sans MS']
      .every((f) => fontRows.some((r) => r.name === f)),
    fontRows.map((r) => r.name).join(', '));
  // The first version of this menu passed every check above while showing
  // "S…", "A…", "C…": the label had landed in the 17px swatch column, because
  // the override sat before the rule it was overriding. Faces are not enough —
  // the names have to be readable.
  const clipped = await win.evaluate(() =>
    [...document.querySelectorAll('#menu-font button .label')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent.trim()));
  check('no font name is squeezed down to an ellipsis',
    clipped.length === 0, clipped.join(', '));
  await win.evaluate(() => {
    [...document.querySelectorAll('#menu-font button')]
      .find((b) => b.textContent.trim() === 'Comic Sans MS')?.click();
  });
  {
    const state = await win.evaluate(() => ({
      applied: document.querySelector('#editor p')?.style.fontFamily ?? '',
      label: document.querySelector('#tb-font .tb-font__name')?.textContent ?? '',
    }));
    check('picking a font with only a caret sets the line, and the button says so',
      /Comic Sans/.test(state.applied) && state.label === 'Comic Sans MS',
      JSON.stringify(state));
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
  // A rendered formula with no frame dissolves into the sentence, and there is
  // nothing to aim at to open it again.
  check('a placed equation is framed like inline code',
    await win.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#editor .inline-eq'));
      return parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    }));

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

  // "Send behind text" has to MOVE the shape under the text, not fade it — a
  // single overlay could never be behind anything, whatever class it carried.
  await win.click('#editor');
  await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>words the shape goes behind</p>'; });
  await win.click('[data-act="shape-rect"]');
  await win.waitForSelector('#shape-bar:not([hidden])', { timeout: 5_000 });
  await win.click('#shape-bar [data-shape="back"]');
  {
    const state = await win.evaluate(() => {
      const shape = document.querySelector('#editor .shape.sel');
      const layer = shape?.closest('.shape-layer');
      const para = document.querySelector('#editor > p');
      const z = (el) => Number(getComputedStyle(el).zIndex);
      return {
        behindLayer: !!layer?.classList.contains('shape-layer--behind'),
        under: !!(layer && para) && z(layer) < z(para),
        opacity: shape ? getComputedStyle(shape).opacity : null,
      };
    });
    check('send-behind moves the shape under the text, at full opacity',
      state.behindLayer && state.under && state.opacity === '1', JSON.stringify(state));
  }
  await win.click('#shape-bar [data-shape="front"]');
  check('bring-above puts it back on the front layer',
    await win.evaluate(() => {
      const layer = document.querySelector('#editor .shape.sel')?.closest('.shape-layer');
      return !!layer && !layer.classList.contains('shape-layer--behind');
    }));

  // The ✕. `.shape-bar { display: flex }` beat the UA rule for [hidden], so
  // setting hidden did nothing and the bar stayed on screen with nothing to act
  // on. Asserting `.hidden` alone would still have passed — the computed
  // display is the part that was broken.
  await win.click('#shape-bar [data-shape="del"]');
  {
    const state = await win.evaluate(() => {
      const bar = document.getElementById('shape-bar');
      return {
        hidden: bar.hidden,
        display: getComputedStyle(bar).display,
        shapes: document.querySelectorAll('#editor .shape').length,
      };
    });
    check('the ✕ deletes the shape and really closes the bar',
      state.hidden && state.display === 'none' && state.shapes === 0, JSON.stringify(state));
  }

  // The languages the user asked for, read off the control they appear in.
  await win.click('#editor');
  await win.click('[data-act="codeblock"]');
  await win.waitForSelector('#editor .blk-code .code-lang', { timeout: 5_000 });
  const langs = await win.evaluate(() =>
    [...document.querySelectorAll('#editor .blk-code .code-lang option')].map((o) => o.value));
  check('C, C++, C#, Java, Dart and Ruby are offered',
    ['c', 'cpp', 'csharp', 'java', 'dart', 'ruby'].every((l) => langs.includes(l)), `${langs.length} languages`);

  await app.close();

  /* ------------------- 4. a vault that predates the guide gets it, and keeps its notes */
  // This is the path that runs on a machine that has been using Nebula: seeding
  // only ever happens on an EMPTY vault, so without `ensureGuide` an existing
  // copy would never see the guide at all — which is exactly what the user hit
  // ("I still don't see examples for all the languages"). It must ADD, never
  // overwrite, and it must not run twice.
  const existing = newProfile();
  const notesDir = path.join(existing, 'storage', 'notes');
  fs.mkdirSync(notesDir, { recursive: true });
  const mine = { id: 'n_mine', title: 'My own note', content: '<p>do not touch</p>', createdAt: 1, updatedAt: 1 };
  fs.writeFileSync(path.join(notesDir, 'n_mine.json'), JSON.stringify(mine), 'utf8');

  app = await launch(existing);
  win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 20_000 });
  await win.waitForFunction(() => document.querySelectorAll('.note-row').length > 1, undefined, { timeout: 10_000 });
  await win.waitForTimeout(1200);

  {
    const state = await win.evaluate(() => ({
      titles: [...document.querySelectorAll('.note-row .nr-title')].map((el) => el.textContent),
      open: document.querySelector('#title')?.value,
    }));
    check('an existing vault is given the guide',
      state.titles.includes('Welcome to Nebula Guide'), state.titles.join(' | '));
    check('and the guide is what opens, so it is actually seen',
      state.open === 'Welcome to Nebula Guide', state.open);
    check('the note that was already there is untouched',
      JSON.stringify(JSON.parse(fs.readFileSync(path.join(notesDir, 'n_mine.json'), 'utf8'))) === JSON.stringify(mine));
  }
  await app.close();

  app = await launch(existing);
  win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 20_000 });
  await win.waitForTimeout(1500);
  check('a second launch does not add it again',
    await win.evaluate(() => [...document.querySelectorAll('.note-row .nr-title')]
      .filter((el) => el.textContent === 'Welcome to Nebula Guide').length) === 1);
  await app.close();

  /* -------------------------- 5. an unreadable vault must NOT look like a first run */
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
