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

/**
 * Press a control without going through Playwright's actionability checks.
 *
 * `page.click` waits for the element to be "stable", which it decides with
 * requestAnimationFrame — and rAF stops firing when the window is not being
 * composited. Under the load of `npm run push` (tests, then a build, then
 * this) that happens often enough to fail a release with a 30-second timeout
 * on a button that is sitting perfectly still.
 *
 * So: real mouse events stay real wherever the POINTER is what is under test —
 * dragging a shape, clicking through text onto a buried one, hitting the
 * shape bar. Everything else is a fixture step, "put the app in this state",
 * and that only needs the handler to run.
 */
const press = (win, selector) => win.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`nothing to press at ${sel}`);
  el.click();
}, selector);

/** Focus the editor. A click there is only ever "put the caret in it". */
const focusEditor = (win) => win.evaluate(() => document.getElementById('editor').focus());

/**
 * A real mousedown, without the actionability wait.
 *
 * Used where a listener is bound to mousedown rather than click — deselecting a
 * shape by pressing somewhere else is one — so `el.click()` would not reach it.
 */
const pressDown = (win, selector) => win.evaluate((sel) => {
  document.querySelector(sel)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}, selector);

/**
 * A real pointer click at the element's centre, checked to actually land on it.
 *
 * `win.mouse` does no actionability wait, so it does not depend on rAF the way
 * `page.click` does — and it is a stronger check anyway: it asserts the element
 * is what sits at that point, which is exactly the hit-testing the shape bar
 * needs (it is position:fixed and follows the shape around).
 */
async function clickAt(win, selector) {
  const at = await win.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { error: `nothing at ${sel}` };
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const top = document.elementFromPoint(x, y);
    if (!top || (top !== el && !el.contains(top))) {
      return { error: `${sel} is not the element at ${x},${y}` };
    }
    return { x, y };
  }, selector);
  if (at.error) throw new Error(at.error);
  await win.mouse.click(at.x, at.y);
}

const newProfile = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-smoke-'));
const launch = (profile) =>
  electron.launch({ args: [mainJs], env: { ...process.env, NEBULA_USER_DATA: profile } });

const noteFiles = (profile) => {
  const dir = path.join(profile, 'storage', 'notes');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
};

let failure = null;
let app = null;   // hoisted, so the finally at the end can always close it
let win = null;

try {
  /* ---------------------------------------------- 1. a fresh, healthy vault */
  const profile = newProfile();
  app = await launch(profile);
  win = await app.firstWindow();
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
  check('theme picker offers main, dark, light and white',
    themes.names.join(',') === 'main,dark,light,white', themes.names.join(','));
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

  await press(win, '#app-version');
  await win.waitForSelector('#ov-about:not([hidden])', { timeout: 5_000 });
  const aboutRows = await win.evaluate(() => document.querySelectorAll('#about-body .about-table tr').length);
  check('About opens and lists every folder', aboutRows === 6, `${aboutRows} rows`);
  await press(win, '#about-close');

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

  // Colours must survive a theme change. As hex written into the note they
  // could not: a pastel highlight ended up under light ink on the dark themes
  // and the two ran together.
  {
    const readAt = (theme) => win.evaluate((t) => {
      document.querySelector(`#theme-pick [data-theme="${t}"]`).click();
      const hi = document.querySelector('#editor .h-yellow');
      const cs = getComputedStyle(hi);
      const px = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return {
        bg: cs.backgroundColor,
        fg: cs.color,
        paper: getComputedStyle(document.body).backgroundColor,
        contrast: Math.abs(lum(px(cs.backgroundColor)) - lum(px(cs.color))),
      };
    }, theme);
    const main = await readAt('main');
    const dark = await readAt('dark');
    const light = await readAt('light');
    const white = await readAt('white');
    check('white is a plain sheet — the note as it would print',
      white.paper === 'rgb(255, 255, 255)', white.paper);
    await win.evaluate(() => document.querySelector('#theme-pick [data-theme="main"]').click());
    check('a highlight repaints for the theme it is read in',
      main.bg !== light.bg && dark.bg !== light.bg,
      `${main.bg} / ${dark.bg} / ${light.bg}`);
    check('and its ink stays well clear of its background in all four',
      [main, dark, light, white].every((t) => t.contrast > 0.35),
      [main, dark, light, white].map((t) => t.contrast.toFixed(2)).join(' / '));
  }

  // Switching AI tabs must not unload the one you were on. `hidden` (i.e.
  // display:none) detaches an Electron <webview> from its guest, so it reloads
  // when it comes back and the login you had just completed is gone.
  {
    await press(win, '[data-pad="ai"]');
    await win.waitForSelector('#ai-panel:not([hidden])', { timeout: 5_000 });
    await win.waitForSelector('#ai-body .ai-view', { timeout: 10_000 });
    await press(win, '.ai-tab[data-ai="gemini"]');
    await win.waitForTimeout(400);
    await press(win, '.ai-tab[data-ai="claude"]');
    await win.waitForTimeout(400);
    const views = await win.evaluate(() => {
      const els = [...document.querySelectorAll('#ai-body .ai-view')];
      return {
        count: els.length,
        on: els.filter((el) => el.classList.contains('on')).length,
        none: els.filter((el) => getComputedStyle(el).display === 'none').length,
        stacked: els.every((el) => getComputedStyle(el).position === 'absolute'),
        partitions: els.map((el) => el.getAttribute('partition')),
      };
    });
    check('both AI views stay alive across a tab switch, one visible',
      views.count === 2 && views.on === 1, JSON.stringify(views));
    check('none is display:none, so no guest is detached and reloaded',
      views.none === 0 && views.stacked, `${views.none} hidden`);
    check('each service keeps its own persistent session',
      views.partitions.every((p) => p?.startsWith('persist:ai-'))
        && new Set(views.partitions).size === views.partitions.length,
      views.partitions.join(', '));
    await press(win, '[data-pad="ai"]');
  }

  // The note list folds away behind the three lines beside "Nebula".
  {
    const wide = await win.evaluate(() => document.getElementById('side').getBoundingClientRect().width);
    await press(win, '#side-toggle');
    await win.waitForTimeout(250);
    const narrow = await win.evaluate(() => ({
      width: document.getElementById('side').getBoundingClientRect().width,
      list: document.getElementById('note-list').getBoundingClientRect().width,
      toggle: document.getElementById('side-toggle').getBoundingClientRect().width,
    }));
    check('the sidebar collapses and the toggle stays reachable',
      narrow.width < wide / 2 && narrow.list > 0 && narrow.toggle > 0,
      `${wide} -> ${narrow.width}`);
    // Collapsing used to hide the notes, New note and the themes outright,
    // which made the narrow state useless. Everything stays, just smaller.
    const rail = await win.evaluate(() => {
      const vis = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return {
        notes: vis('.note-row'),
        newNote: vis('#btn-new'),
        themes: [...document.querySelectorAll('#theme-pick button')].every((b) => b.getBoundingClientRect().width > 0),
        initial: document.querySelector('.note-row .nr-title')?.dataset.initial,
      };
    });
    check('and the notes, New note and the themes are all still on the rail',
      rail.notes && rail.newNote && rail.themes && rail.initial === 'W',
      JSON.stringify(rail));
    await press(win, '#side-toggle');
    await win.waitForTimeout(250);
    check('and comes back',
      await win.evaluate(() => document.getElementById('note-list').getBoundingClientRect().width > 100));
  }

  // The app draws its own File/Edit/View/Window/Help beside the logo; the stock
  // Electron menu is gone and the title strip carries no window title.
  {
    const strip = await win.evaluate(() => ({
      menus: [...document.querySelectorAll('#app-menu .am-title')].map((b) => b.textContent),
      logo: !!document.querySelector('#tb-logo svg'),
      // Only the menu buttons are text in the strip; no "Nebula Test" caption.
      caption: document.getElementById('titlebar').firstElementChild?.textContent.trim(),
    }));
    check('the title strip carries the logo and the five menus',
      strip.menus.join(',') === 'File,Edit,View,Window,Help' && strip.logo, strip.menus.join(','));
    check('and no window title is written into it', strip.caption === '', JSON.stringify(strip.caption));

    const menuItem = (menu, starts) => win.evaluate(({ menu, starts }) => {
      [...document.querySelectorAll('#app-menu .am-title')].find((b) => b.textContent === menu).click();
      const btn = [...document.querySelectorAll('#app-menu .am-menu button')]
        .find((b) => b.textContent.startsWith(starts));
      btn?.click();
      return !!btn;
    }, { menu, starts });

    // Zoom acts on the window, not on a focused <webview> guest — which is why
    // the stock View roles looked dead with the AI panel open.
    await menuItem('View', 'Zoom in');
    await win.waitForTimeout(250);
    const zoomedIn = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel());
    await menuItem('View', 'Actual size');
    await win.waitForTimeout(250);
    const zoomReset = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel());
    check('View -> Zoom in and Actual size really move the zoom level',
      zoomedIn > 0 && zoomReset === 0, `${zoomedIn} -> ${zoomReset}`);

    await menuItem('Window', 'Maximize');
    await win.waitForTimeout(400);
    const maximized = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized());
    await menuItem('Window', 'Maximize');
    await win.waitForTimeout(400);
    check('Window -> Maximize maximizes, and again restores',
      maximized && !(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())));

    await win.keyboard.press('Control+k');
    await win.waitForSelector('#ov-palette:not([hidden])', { timeout: 5_000 });
    await win.fill('#palette-input', 'zoom');
    await win.waitForTimeout(200);
    const hits = await win.evaluate(() => [...document.querySelectorAll('.palette-row .pr-label')].map((e) => e.textContent));
    check('Ctrl+K opens the palette and filters the menus it was built from',
      hits.length === 2 && hits.includes('Zoom in'), hits.join(', '));
    await win.keyboard.press('Escape');

    await menuItem('Help', 'Keyboard shortcuts');
    await win.waitForTimeout(250);
    check('Help -> Keyboard shortcuts lists them',
      await win.evaluate(() => !document.getElementById('ov-shortcuts').hidden
        && document.querySelectorAll('#shortcuts-body .sc-table th').length > 15));
    await win.keyboard.press('Escape');
  }

  // Pin, archive, trash — and the guide coming back from Help after deleting it.
  {
    await press(win, '#btn-new');
    await win.fill('#title', 'Second note');
    await win.waitForTimeout(600);
    const titles = () => win.evaluate(() =>
      [...document.querySelectorAll('.note-row .nr-title')].map((e) => e.textContent.replace('●', '')));
    // The list re-renders after every action, so wait for the menu to actually
    // be open before clicking into it — otherwise the click lands on nothing
    // and the check fails for a reason that has nothing to do with the feature.
    const openMenu = async (i) => {
      await win.evaluate((n) => {
        [...document.querySelectorAll('.note-item')][n].querySelector('.nr-more').click();
      }, i);
      await win.waitForSelector('#note-menu:not([hidden])', { timeout: 5_000 });
    };

    await openMenu(1);
    await press(win, '#note-menu [data-note-act="pin"]');
    await win.waitForTimeout(300);
    check('a pinned note goes to the top whatever its date',
      (await titles())[0] === 'Welcome to Nebula Guide', (await titles()).join(' | '));

    await openMenu(1);
    await press(win, '#note-menu [data-note-act="archive"]');
    await win.waitForTimeout(300);
    check('archiving takes a note off the list and counts it',
      !(await titles()).includes('Second note')
        && await win.evaluate(() => document.getElementById('archive-count').textContent) === '1',
      (await titles()).join(' | '));

    await openMenu(0);
    await press(win, '#note-menu [data-note-act="trash"]');
    await win.waitForTimeout(300);
    {
      const left = await titles();
      const count = await win.evaluate(() => document.getElementById('trash-count').textContent);
      check('the last note can go to the trash — the trash is the way back',
        left.length === 0 && count === '1', `${left.length} left, trash ${count}`);
    }

    await press(win, '[data-drawer="trash"]');
    await win.waitForTimeout(250);
    check('the trash drawer opens upward, over the list',
      await win.evaluate(() => {
        const body = document.getElementById('trash-list');
        const toggle = document.querySelector('[data-drawer="trash"]');
        return !body.hidden && body.getBoundingClientRect().top < toggle.getBoundingClientRect().top;
      }));

    // Help -> Guide page has to work when the guide is in the trash: that is
    // the whole reason it is the first item in the menu.
    await win.evaluate(() => {
      [...document.querySelectorAll('#app-menu .am-title')].find((b) => b.textContent === 'Help').click();
      [...document.querySelectorAll('#app-menu .am-menu button')]
        .find((b) => b.textContent.startsWith('Guide page')).click();
    });
    await win.waitForTimeout(500);
    check('Help -> Guide page brings the guide back after it was deleted',
      await win.evaluate(() => document.getElementById('title').value) === 'Welcome to Nebula Guide'
        && await win.evaluate(() => !!document.querySelector('#editor .blk-code')));
  }

  await app.close();

  /* --------------------------------- 2. the same profile again: notes persist */
  app = await launch(profile);
  win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 20_000 });
  await win.waitForFunction(() => document.querySelectorAll('.note-row').length > 0, undefined, { timeout: 10_000 });

  const afterCount = await win.evaluate(() => document.querySelectorAll('.note-row').length);
  const after = noteFiles(profile).sort().join(',');
  check('relaunch shows the same notes, not a second seeding', afterCount === SEEDED, `${afterCount} notes`);
  check('the notes on disk survive the restart', after.length > 0, `${after.split(',').length} files`);
  await app.close();

  /* ----------------------------------- 3. editor behaviour, on its own profile */
  // A separate profile so writing in the editor cannot disturb the persistence
  // checks above.
  const scratch = newProfile();
  app = await launch(scratch);
  win = await app.firstWindow();
  await win.waitForSelector('#app', { timeout: 20_000 });
  await win.waitForFunction(() => document.querySelectorAll('.note-row').length > 0, undefined, { timeout: 10_000 });
  await press(win, '#btn-new');
  await focusEditor(win);

  // Lists: a numbered list started under a bulleted one must be its SIBLING.
  // Chromium buries it in the last <li>; lists.js is what puts it back.
  await win.type('#editor', 'one');
  await press(win, '[data-act="ul"]');
  await win.keyboard.press('Enter');
  await win.type('#editor', 'two');
  await press(win, '[data-act="ol"]');
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
  await press(win, '[data-act="todo"]');
  const todoOn = await win.evaluate(() =>
    document.querySelector('#editor .blk-todo')?.textContent === 'task');
  await press(win, '[data-act="todo"]');
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
  await press(win, '[data-act="code"]');
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
  await press(win, '#tb-font');
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
  await press(win, '[data-act="eq"]');
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
  await press(win, '[data-act="shape-rect"]');
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
  await focusEditor(win);
  await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>words the shape goes behind</p>'; });
  await press(win, '[data-act="shape-rect"]');
  await win.waitForSelector('#shape-bar:not([hidden])', { timeout: 5_000 });
  await clickAt(win, '#shape-bar [data-shape="back"]');
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
  await clickAt(win, '#shape-bar [data-shape="front"]');
  check('bring-above puts it back on the front layer',
    await win.evaluate(() => {
      const layer = document.querySelector('#editor .shape.sel')?.closest('.shape-layer');
      return !!layer && !layer.classList.contains('shape-layer--behind');
    }));

  // The ✕. `.shape-bar { display: flex }` beat the UA rule for [hidden], so
  // setting hidden did nothing and the bar stayed on screen with nothing to act
  // on. Asserting `.hidden` alone would still have passed — the computed
  // display is the part that was broken.
  await clickAt(win, '#shape-bar [data-shape="del"]');
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

  // A shape is a drag handle everywhere, not just on its 1.6px border: the
  // text used to cover the whole body and swallow the press.
  {
    await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>shape drag test</p>'; });
    await press(win, '[data-act="shape-rect"]');
    await win.waitForSelector('#editor .shape', { timeout: 5_000 });
    const box = await win.evaluate(() => {
      const r = document.querySelector('#editor .shape').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top };
    });
    await win.mouse.move(box.x, box.y);
    await win.mouse.down();
    await win.mouse.move(box.x + 60, box.y + 40, { steps: 6 });
    await win.mouse.up();
    const moved = await win.evaluate(() => {
      const r = document.querySelector('#editor .shape').getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    check('a shape drags from its middle, not only from its border',
      Math.round(moved.left - box.left) > 40 && Math.round(moved.top - box.top) > 25,
      `moved ${Math.round(moved.left - box.left)},${Math.round(moved.top - box.top)}`);
    check('and its ink is dark against its always-light fill',
      await win.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('#editor .shape'));
        const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
        return lum(cs.backgroundColor) - lum(cs.color) > 0.4;
      }));
    await win.keyboard.press('Escape');
  }

  // A shape sent behind the text is painted UNDER it, so the paragraph on top
  // takes every click and the shape cannot be picked up at all.
  {
    // A paragraph tall enough that the shape sits entirely inside it — the
    // whole point is a click that lands on text with a shape underneath.
    await win.evaluate(() => {
      document.getElementById('editor').innerHTML = `<p>${'a paragraph long enough to wrap over several lines so that the shape underneath is completely covered by text. '.repeat(4)}</p>`;
    });
    await press(win, '[data-act="shape-rect"]');
    await win.waitForSelector('#shape-bar:not([hidden])', { timeout: 5_000 });
    await clickAt(win, '#shape-bar [data-shape="back"]');
    // Centre the shape on the paragraph, then deselect by clicking the sidebar.
    const point = await win.evaluate(() => {
      const para = document.querySelector('#editor > p');
      const p = para.getBoundingClientRect();
      const ed = document.getElementById('editor').getBoundingClientRect();
      const s = document.querySelector('#editor .shape');
      const w = s.offsetWidth, h = s.offsetHeight;
      s.style.left = `${(p.left - ed.left) + (p.width - w) / 2}px`;
      s.style.top = `${(p.top - ed.top) + document.getElementById('editor').scrollTop + (p.height - h) / 2}px`;
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await pressDown(win, '#side-filter');
    const overText = await win.evaluate((pt) => {
      const el = document.elementFromPoint(pt.x, pt.y);
      return !!el && !el.closest('.shape');
    }, point);
    await win.mouse.click(point.x, point.y);
    await win.waitForTimeout(200);
    check('a buried shape is still selectable through the text on top of it',
      overText && await win.evaluate(() => !!document.querySelector('#editor .shape.sel')),
      overText ? '' : 'the point was not actually covered by text');
    // ...and a second click there goes through, so the paragraph is not lost.
    await win.mouse.click(point.x, point.y);
    await win.waitForTimeout(200);
    check('and clicking it again puts the caret in the text, not on the shape',
      await win.evaluate(() => {
        const sel = getSelection();
        return !!sel.anchorNode && !!sel.anchorNode.parentElement?.closest('#editor > p');
      }));
    await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>x</p>'; });
  }

  // Ctrl+Z after a font change used to leave a duplicate of the text behind:
  // the <font> element the browser had just inserted was replaced by a script,
  // which desynchronised its undo stack.
  {
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>undo me please</p>';
      ed.focus();
      const p = ed.querySelector('p');
      const r = document.createRange();
      r.selectNodeContents(p);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    });
    const before = await win.evaluate(() => document.getElementById('editor').innerHTML);
    await win.evaluate(() => {
      [...document.querySelectorAll('#menu-font button')].find((b) => b.textContent.trim() === 'Arial')?.click();
    });
    await win.waitForTimeout(200);
    const styled = await win.evaluate(() => document.getElementById('editor').innerHTML);
    await win.evaluate(() => document.getElementById('editor').focus());
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(250);
    const after = await win.evaluate(() => ({
      html: document.getElementById('editor').innerHTML,
      text: document.getElementById('editor').textContent,
    }));
    check('a font change actually applies', /Arial/i.test(styled), styled.slice(0, 90));
    check('and Ctrl+Z takes it back off without duplicating the text',
      after.text === 'undo me please' && !/Arial/i.test(after.html),
      `${JSON.stringify(after.text)} | ${after.html.slice(0, 90)}`);
    check('undo lands on the original markup, not a rebuilt one',
      after.html === before, `${before} -> ${after.html}`);
  }

  // Ctrl+F. Matches are painted, never marked up, so the note must come out of
  // a search byte-identical.
  {
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>find the needle here</p><p>and another needle</p>';
      ed.focus();
    });
    const noteBefore = await win.evaluate(() => document.getElementById('editor').innerHTML);
    await win.keyboard.press('Control+f');
    await win.waitForSelector('#find-bar:not([hidden])', { timeout: 5_000 });
    check('Ctrl+F opens the find bar', true);
    await win.fill('#find-input', 'needle');
    await win.waitForTimeout(250);
    const found = await win.evaluate(() => ({
      count: document.getElementById('find-count').textContent,
      painted: CSS.highlights.has('nebula-find-current'),
      html: document.getElementById('editor').innerHTML,
    }));
    check('it counts the matches in the note', found.count === '1 of 2', found.count);
    check('and paints them instead of editing the note',
      found.painted && found.html === noteBefore, found.painted ? 'note unchanged' : 'nothing painted');
    await win.press('#find-input', 'Enter');
    await win.waitForTimeout(150);
    check('Enter steps to the next match',
      await win.evaluate(() => document.getElementById('find-count').textContent) === '2 of 2');
    await win.press('#find-input', 'Escape');
    await win.waitForTimeout(150);
    check('Escape closes it and drops the highlights',
      await win.evaluate(() => document.getElementById('find-bar').hidden && !CSS.highlights.has('nebula-find-current')));
  }

  // A shape sent behind the text is painted UNDER it, so the paragraph on top
  // takes every click. 0.4.4 let the first click select it and then dropped
  // every one after — and a drag begins with a press, so it could never move.
  {
    await win.evaluate(() => {
      document.getElementById('editor').innerHTML =
        `<p>${'a paragraph long enough to wrap over several lines so the shape underneath is completely covered. '.repeat(4)}</p>`;
    });
    await press(win, '[data-act="shape-rect"]');
    await win.waitForSelector('#shape-bar:not([hidden])', { timeout: 5_000 });
    await clickAt(win, '#shape-bar [data-shape="back"]');
    const pt = await win.evaluate(() => {
      const para = document.querySelector('#editor > p');
      const p = para.getBoundingClientRect();
      const ed = document.getElementById('editor');
      const edr = ed.getBoundingClientRect();
      const s = document.querySelector('#editor .shape');
      s.style.left = `${(p.left - edr.left) + (p.width - s.offsetWidth) / 2}px`;
      s.style.top = `${(p.top - edr.top) + ed.scrollTop + (p.height - s.offsetHeight) / 2}px`;
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), left: Math.round(r.left) };
    });
    const covered = await win.evaluate((p) => !document.elementFromPoint(p.x, p.y).closest('.shape'), pt);
    await pressDown(win, '#side-filter');
    check('the resize handle is hidden until a shape is selected',
      await win.evaluate(() => getComputedStyle(document.querySelector('#editor .shape-h')).display) === 'none');
    await win.mouse.click(pt.x, pt.y);
    await win.waitForTimeout(150);
    check('one click picks up a shape buried under the text',
      covered && await win.evaluate(() => !!document.querySelector('#editor .shape.sel')),
      covered ? '' : 'the point was not covered by text');
    check('and its handle appears with it',
      await win.evaluate(() => getComputedStyle(document.querySelector('#editor .shape-h')).display) !== 'none');
    await win.mouse.move(pt.x, pt.y);
    await win.mouse.down();
    await win.mouse.move(pt.x + 80, pt.y + 25, { steps: 6 });
    await win.mouse.up();
    const moved = await win.evaluate(() => Math.round(document.querySelector('#editor .shape').getBoundingClientRect().left)) - pt.left;
    check('a buried shape can then be dragged', moved > 60, `${moved}px`);
    check('the shape bar never leaves the window',
      await win.evaluate(() => {
        const b = document.getElementById('shape-bar').getBoundingClientRect();
        return b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth;
      }));
  }

  // Undo has to cover what the app does by script, which Chromium never saw.
  {
    await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>keep me</p>'; });
    await press(win, '[data-act="shape-rect"]');
    await win.waitForSelector('#editor .shape', { timeout: 5_000 });
    const shape = await win.evaluate(() => {
      const s = document.querySelector('#editor .shape');
      s.style.background = '#D3E0EA';
      return { left: s.style.left, bg: s.style.background };
    });
    await clickAt(win, '#shape-bar [data-shape="del"]');
    await win.waitForTimeout(150);
    const gone = await win.evaluate(() => document.querySelectorAll('#editor .shape').length);
    await win.evaluate(() => document.getElementById('editor').focus());
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(300);
    const back = await win.evaluate(() => {
      const s = document.querySelector('#editor .shape');
      return s ? { left: s.style.left, bg: s.style.background } : null;
    });
    check('deleting a shape and pressing Ctrl+Z brings it back, as it was',
      gone === 0 && JSON.stringify(back) === JSON.stringify(shape), JSON.stringify(back));
  }

  // Colour with a caret and no selection did nothing at all — the fonts got
  // this fallback in 0.4.4 and the colours never did.
  {
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>colour this whole line</p>';
      ed.focus();
      const r = document.createRange();
      r.setStart(ed.querySelector('p').firstChild, 5);
      r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await press(win, '[data-menu="menu-color"]');
    await win.waitForSelector('#menu-color:not([hidden])', { timeout: 5_000 });
    await press(win, '#menu-color button[data-color-class="c-red"]');
    await win.waitForTimeout(200);
    check('a colour with only a caret applies to the whole line',
      await win.evaluate(() => document.querySelector('#editor p')?.classList.contains('c-red')));

    // ...and a selection must not have its surrounding spaces rewritten.
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>colour this word please</p>';
      ed.focus();
      const t = ed.querySelector('p').firstChild;
      const r = document.createRange(); r.setStart(t, 7); r.setEnd(t, 11);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    const before = await win.evaluate(() => document.getElementById('editor').innerHTML);
    await press(win, '[data-act="color"]');
    await win.waitForTimeout(200);
    const wrapped = await win.evaluate(() => document.getElementById('editor').innerHTML);
    check('and a selection keeps its plain spaces, not &nbsp;',
      !wrapped.includes('&nbsp;') && /<span class="c-[a-z]+">this<\/span>/.test(wrapped), wrapped);
    await win.evaluate(() => document.getElementById('editor').focus());
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(250);
    check('Ctrl+Z puts the markup back byte for byte',
      await win.evaluate(() => document.getElementById('editor').innerHTML) === before, before);
    await win.keyboard.press('Control+y');
    await win.waitForTimeout(250);
    check('and Ctrl+Y redoes it',
      await win.evaluate(() => document.getElementById('editor').innerHTML) === wrapped);
  }

  // The languages the user asked for, read off the control they appear in.
  await focusEditor(win);
  await press(win, '[data-act="codeblock"]');
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
} finally {
  // A run that threw leaves an Electron instance alive, and this suite starts
  // six of them. On a machine already short of memory that turns one failure
  // into the next one.
  try { await app?.close(); } catch { /* already gone */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failure) console.error(failure);

/**
 * Exit 2 means "the run could not finish", not "the app is wrong".
 *
 * Playwright's waits time out when the window is not being composited, which is
 * what a machine out of memory does — and `npm run push` runs the unit tests
 * and a full build immediately before this. That failure says nothing about the
 * code, so the release retries once on a 2 and stops on a 1, which is a check
 * that actually failed.
 */
const aborted = failure && /Timeout|Target closed|browser has been closed|ENOMEM/i.test(failure.message ?? '');
const realFailures = failed.filter((r) => r.name !== 'smoke run completed');
if (realFailures.length) process.exit(1);
process.exit(aborted ? 2 : 0);
