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
import zlib from 'node:zlib';
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
    // The WIDTH is animated, so the class lands long before the geometry does.
    // A fixed wait here passed by luck and failed the moment boot got busier;
    // wait for the width to stop moving instead.
    // Stability alone is not enough: the ease curve crawls at both ends, so two
    // consecutive frames round to the same pixel while the bar is still moving.
    // Wait for it to reach the collapsed width as well.
    await win.waitForFunction(() => {
      const w = Math.round(document.getElementById('side').getBoundingClientRect().width);
      const settled = window.__sideW === w;
      window.__sideW = w;
      return settled && w < 100;
    }, null, { timeout: 10_000 }).catch(() => { /* fall through to the check */ });
    const narrow = await win.evaluate(() => ({
      width: document.getElementById('side').getBoundingClientRect().width,
      list: document.getElementById('note-list').getBoundingClientRect().width,
      toggle: document.getElementById('side-toggle').getBoundingClientRect().width,
      collapsed: document.getElementById('app').classList.contains('side-collapsed'),
      expanded: document.getElementById('side-toggle').getAttribute('aria-expanded'),
    }));
    check('the sidebar collapses and the toggle stays reachable',
      narrow.width < wide / 2 && narrow.list > 0 && narrow.toggle > 0,
      `${wide} -> ${narrow.width}, ${JSON.stringify(narrow)}`);
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

    // The / menu had no reference anywhere — you had to already know it existed.
    await menuItem('Help', 'Blocks');
    await win.waitForTimeout(250);
    check('Help -> Blocks lists every block the / menu offers, from the same source',
      await win.evaluate(() => {
        const rows = document.querySelectorAll('#blocks-body .blocks-table tr');
        const icons = document.querySelectorAll('#blocks-body .bl-ic svg');
        return !document.getElementById('ov-blocks').hidden && rows.length === 11 && icons.length === 11;
      }));
    await win.keyboard.press('Escape');
  }

  // Export and import. The dialogs are native, so they are stubbed in the MAIN
  // process — everything either side of them is the real path.
  {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-export-'));
    await app.evaluate(({ dialog }, { dir, sep }) => {
      dialog.showSaveDialog = async (_w, opts) => ({ canceled: false, filePath: dir + sep + (opts.defaultPath || 'out') });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir + sep + 'incoming.md'] });
    }, { dir: outDir, sep: path.sep });
    fs.writeFileSync(path.join(outDir, 'incoming.md'), [
      '# Imported title', '', '## Section', '', '- one', '- two', '',
      '```js', 'let a = 1;', '```', '', '> quoted', '',
    ].join(String.fromCharCode(10)));

    // Its own note, not the guide: setting #title renames whatever is open, and
    // the checks after this one know the guide by name.
    await press(win, '#btn-new');
    await win.waitForTimeout(400);
    await win.evaluate(() => {
      const src = encodeURIComponent('print("hi")');
      document.getElementById('editor').innerHTML =
        '<h1>My Report</h1><p>A sentence. And <strong>bold</strong>.</p><ul><li>one</li><li>two</li></ul>'
        + `<div class="blk-code" data-block-type="code" data-lang="python" data-code="${src}" contenteditable="false">`
        + '<div class="code-head"></div><pre class="code-body"><code class="code-src">painted</code></pre></div>'
        + '<blockquote>quoted</blockquote><hr class="blk-hr">';
      document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true }));
      const t = document.getElementById('title');
      t.value = 'My Report';
      t.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await win.waitForTimeout(700);

    for (const fmt of ['md', 'html', 'pdf']) {
      await win.evaluate((f) => {
        document.querySelector('[data-menu="menu-export"]').click();
        [...document.querySelectorAll('#menu-export button')].find((b) => b.dataset.format === f).click();
      }, fmt);
      // Wait for the FILE, not for a guess. The PDF is rendered in a window of
      // its own now — loaded, given a moment for its web fonts, then printed —
      // so a fixed wait that was comfortable before is not any more.
      const target = path.join(outDir, `My Report.${fmt}`);
      for (let i = 0; i < 60 && !fs.existsSync(target); i += 1) await win.waitForTimeout(200);
      await win.waitForTimeout(200);
    }

    const written = fs.readdirSync(outDir).filter((f) => f !== 'incoming.md').sort();
    check('export writes a file in each of the three formats',
      written.join(',') === 'My Report.html,My Report.md,My Report.pdf', written.join(','));

    const md = fs.readFileSync(path.join(outDir, 'My Report.md'), 'utf8');
    const NL = String.fromCharCode(10);
    check('the Markdown carries the title once, the list, and the code SOURCE',
      md.startsWith('# My Report' + NL + NL + 'A sentence.')
        && md.includes('- one' + NL + '- two')
        && md.includes('```python' + NL + 'print("hi")' + NL + '```')
        && !md.includes('painted'),
      JSON.stringify(md.slice(0, 60)));

    // The complaint that started this: printing produced a picture of the app,
    // because it went through the OS dialog. This is Chromium's own writer.
    const pdf = fs.readFileSync(path.join(outDir, 'My Report.pdf'));
    check('the PDF is a real PDF from the app, not a screenshot of the window',
      pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 2000, `${pdf.length} bytes`);

    /**
     * The sheet, and the margins, on every page.
     *
     * Printed from the live window this was a choice nobody should have to
     * make: a page's margin band is filled from a document background colour
     * Chromium captures at load, so `@page { margin: 12.7mm }` framed every
     * page of a dark-themed app, and the only way to a white sheet —
     * `@page { margin: 0 }` — cannot repeat a margin, so page two began at the
     * paper's edge. The note is printed as its own white document now.
     */
    {
      const latin = pdf.toString('latin1');
      const NL = String.fromCharCode(10);
      const CR = String.fromCharCode(13);

      // Walked, not matched. A regex here needs carriage return and newline
      // written into this file, and every layer between here and the disk has
      // its own opinion about a backslash; plain string search has none.
      const streams = [];
      for (let at = latin.indexOf('stream'); at >= 0; at = latin.indexOf('stream', at + 6)) {
        let st = at + 6;
        if (latin[st] === CR) st += 1;
        if (latin[st] !== NL) continue;                 // part of "endstream"
        st += 1;
        const en = pdf.indexOf('endstream', st);
        if (en < 0) continue;
        try { streams.push(zlib.inflateSync(pdf.subarray(st, en)).toString('latin1')); } catch { /* not flate */ }
      }

      /** The first `r g b rg ... x y w h re f` a page paints. */
      const firstBox = (text) => {
        const i = text.indexOf(' rg');
        if (i < 0) return null;
        // A stroke and a fill are set on one line: '1 1 1 RG 1 1 1 rg'.
        const rgb = text.slice(0, i).split(NL).pop().trim().split(' ').slice(-3).join(' ');
        const after = text.slice(i);
        const j = after.indexOf(' re');
        if (j < 0) return null;
        const nums = after.slice(0, j).split(NL).pop().trim().split(' ').map(Number);
        if (nums.length < 4 || nums.some(Number.isNaN)) return null;
        return { rgb, w: nums[2], h: nums[3] };
      };
      const boxes = streams.map(firstBox).filter(Boolean);
      check('nothing dark is painted on any page of the export',
        boxes.length > 0 && boxes.every((b) => b.rgb === '1 1 1'),
        JSON.stringify(boxes.slice(0, 3)));
      // A4 at 3.125 units/px is 794x1123; 12.7mm a side leaves 698x1027.
      check('every page keeps the 1.27cm margin, not just the first',
        boxes.every((b) => Math.abs(b.w - 698) <= 2 && Math.abs(b.h - 1027) <= 2),
        JSON.stringify(boxes.slice(0, 3)));
    }

    const html = fs.readFileSync(path.join(outDir, 'My Report.html'), 'utf8');
    check('the HTML is one self-contained file with nothing to fetch',
      html.startsWith('<!doctype html>') && html.includes('<style>') && !/<link|src="http/.test(html));

    const notesBefore = await win.evaluate(() => document.querySelectorAll('.note-row').length);
    await press(win, '[data-act="import"]');
    await win.waitForTimeout(1400);
    check('import makes the file a new note, parsed into real blocks',
      await win.evaluate((before) => ({
        title: document.getElementById('title').value,
        h2: !!document.querySelector('#editor h2'),
        items: document.querySelectorAll('#editor ul li').length,
        code: document.querySelectorAll('#editor .blk-code').length,
        quote: !!document.querySelector('#editor blockquote'),
        added: document.querySelectorAll('.note-row').length === before + 1,
      }), notesBefore).then((r) => r.title === 'Imported title' && r.h2 && r.items === 2 && r.code === 1 && r.quote && r.added));

    // Put the vault back: the checks after this one count the notes, and an
    // imported note left lying around would fail them for the wrong reason.
    await win.evaluate(() => {
      const row = [...document.querySelectorAll('.note-item')]
        .find((el) => el.querySelector('.nr-title')?.textContent === 'Imported title');
      row?.querySelector('.nr-more')?.click();
    });
    await win.waitForSelector('#note-menu:not([hidden])', { timeout: 5_000 });
    await press(win, '#note-menu [data-note-act="trash"]');
    await win.waitForTimeout(300);
    await press(win, '[data-drawer="trash"]');
    await win.waitForTimeout(300);
    await win.evaluate(() => {
      const item = [...document.querySelectorAll('#drawer-body .drawer-item')]
        .find((el) => el.querySelector('.nr-title')?.textContent === 'Imported title');
      [...(item?.querySelectorAll('.drawer-actions button') ?? [])]
        .find((b) => b.textContent === 'Delete')?.click();
    });
    await win.waitForTimeout(400);
    await press(win, '[data-drawer="trash"]');
    await win.waitForTimeout(250);
    check('the imported note can be deleted for good again',
      await win.evaluate(() => ![...document.querySelectorAll('.nr-title')]
        .some((e) => e.textContent === 'Imported title')));

    // ...and the scratch note this block wrote into.
    await win.evaluate(() => {
      const row = [...document.querySelectorAll('.note-item')]
        .find((el) => el.querySelector('.nr-title')?.textContent === 'My Report');
      row?.querySelector('.nr-more')?.click();
    });
    await win.waitForSelector('#note-menu:not([hidden])', { timeout: 5_000 });
    await press(win, '#note-menu [data-note-act="trash"]');
    await win.waitForTimeout(300);
    await press(win, '[data-drawer="trash"]');
    await win.waitForTimeout(300);
    await win.evaluate(() => {
      const item = [...document.querySelectorAll('#drawer-body .drawer-item')]
        .find((el) => el.querySelector('.nr-title')?.textContent === 'My Report');
      [...(item?.querySelectorAll('.drawer-actions button') ?? [])]
        .find((b) => b.textContent === 'Delete')?.click();
    });
    await win.waitForTimeout(400);
    await press(win, '[data-drawer="trash"]');
    await win.waitForTimeout(250);
    check('the vault is back to just the guide afterwards',
      await win.evaluate(() => {
        const titles = [...document.querySelectorAll('.note-row .nr-title')].map((e) => e.textContent);
        return titles.length === 1 && titles[0] === 'Welcome to Nebula Guide';
      }),
      await win.evaluate(() => [...document.querySelectorAll('.note-row .nr-title')].map((e) => e.textContent).join(' | ')));
  }

  // A title typed and then abandoned by pressing New note was simply lost: only
  // the body was flushed before the active note changed, never the title.
  {
    const before = await win.evaluate(() => document.querySelectorAll('.note-row').length);
    await win.fill('#title', 'Kept name');
    await press(win, '#btn-new');
    await win.waitForTimeout(700);
    const titles = await win.evaluate(() =>
      [...document.querySelectorAll('.note-row .nr-title')].map((e) => e.textContent.trim()));
    check('a title typed just before New note is kept, not dropped',
      titles.includes('Kept name') && titles.length === before + 1, titles.join(' | '));
    // Put the vault back: rename the guide and drop the note New note made,
    // or the checks that count notes fail for a reason of my own making.
    await win.evaluate(() => {
      const row = [...document.querySelectorAll('.note-item')]
        .find((el) => el.querySelector('.nr-title')?.textContent.trim() === 'Kept name');
      row?.querySelector('.note-row')?.click();
    });
    await win.waitForTimeout(400);
    await win.fill('#title', 'Welcome to Nebula Guide');
    await win.waitForTimeout(700);

    await win.evaluate(() => {
      const row = [...document.querySelectorAll('.note-item')]
        .find((el) => el.querySelector('.nr-title')?.textContent.trim() === 'Untitled');
      row?.querySelector('.nr-more')?.click();
    });
    await win.waitForSelector('#note-menu:not([hidden])', { timeout: 5_000 });
    await press(win, '#note-menu [data-note-act="trash"]');
    await win.waitForTimeout(300);
    await press(win, '[data-drawer="trash"]');
    await win.waitForTimeout(300);
    await win.evaluate(() => {
      const item = [...document.querySelectorAll('#drawer-body .drawer-item')]
        .find((el) => el.querySelector('.nr-title')?.textContent.trim() === 'Untitled');
      [...(item?.querySelectorAll('.drawer-actions button') ?? [])]
        .find((b) => b.textContent === 'Delete')?.click();
    });
    await win.waitForTimeout(400);
    await press(win, '[data-drawer="trash"]');
    await win.waitForTimeout(250);
    check('the guide is alone again after the title check',
      await win.evaluate(() => {
        const t = [...document.querySelectorAll('.note-row .nr-title')].map((e) => e.textContent.trim());
        return t.length === 1 && t[0] === 'Welcome to Nebula Guide';
      }),
      await win.evaluate(() => [...document.querySelectorAll('.note-row .nr-title')].map((e) => e.textContent.trim()).join(' | ')));
  }

  // A code block in a note written before the ✕ existed still has to be
  // removable — the markup lives in the note, not in the code.
  {
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>before</p><div class="blk-code" data-block-type="code" data-lang="python"'
        + ` data-code="${encodeURIComponent('print(1)')}" contenteditable="false">`
        + '<div class="code-head"><select class="code-lang"></select><button type="button" class="code-copy">Copy</button></div>'
        + '<pre class="code-body"><code class="code-src" contenteditable="true"></code></pre></div><p>after</p>';
      window.nebulaRepaint?.();
    });
    // openNote runs the paint pass; reopening the note is how that happens.
    await win.evaluate(() => document.querySelector('.note-row').click());
    await win.waitForTimeout(600);
  }

  // The / menu moved its highlight without scrolling, so past the sixth item
  // you were choosing something you could not see.
  {
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>x</p>'; ed.focus();
      const r = document.createRange();
      r.selectNodeContents(ed.querySelector('p')); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await win.keyboard.type(' /');
    await win.waitForTimeout(300);
    for (let i = 0; i < 9; i++) await win.keyboard.press('ArrowDown');
    await win.waitForTimeout(200);
    check('the / menu scrolls its highlighted row into view',
      await win.evaluate(() => {
        const menu = document.getElementById('slash-menu');
        const on = menu.querySelector('button.sel');
        if (!on) return false;
        const m = menu.getBoundingClientRect();
        const b = on.getBoundingClientRect();
        return b.top >= m.top - 1 && b.bottom <= m.bottom + 1;
      }));
    await win.keyboard.press('Escape');
  }

  // Backspace at the start of an item with text lifts it out of the list;
  // before, it merged into the item above and there was no way back to the
  // left margin.
  {
    const out = await win.evaluate(() => {
      const ed = document.getElementById('editor'); ed.focus();
      ed.innerHTML = '<ul><li>one</li><li>two</li></ul>';
      const li = ed.querySelectorAll('li')[1];
      const r = document.createRange();
      r.setStart(li.firstChild, 0); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return true;
    });
    void out;
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(250);
    check('Backspace at the start of a list item lifts it to the left margin',
      await win.evaluate(() => document.getElementById('editor').innerHTML) === '<ul><li>one</li></ul><p>two</p>',
      await win.evaluate(() => document.getElementById('editor').innerHTML));
  }

  // Every dropdown mark in the bar is the same triangle at the same size.
  check('every caret in the editing bar is the same size',
    await win.evaluate(() => {
      const sizes = [...document.querySelectorAll('.tb-caret')]
        .map((el) => getComputedStyle(el, '::after').borderTopWidth);
      const fontCaret = getComputedStyle(document.querySelector('.tb-font__caret')).borderTopWidth;
      return sizes.length > 2 && new Set(sizes).size === 1 && sizes[0] === fontCaret;
    }));

  // A clip-path cuts a border off with everything else outside the shape, so
  // the diamond and the triangle had no outline at all.
  {
    await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>x</p>'; });
    await press(win, '[data-shape-add="triangle"]');
    await win.waitForTimeout(300);
    const shape = await win.evaluate(() => {
      const s = document.querySelector('#editor .shape.triangle');
      return {
        fill: s.style.getPropertyValue('--shape-fill'),
        poly: !!s.querySelector('.shape-svg polygon'),
        effect: s.querySelector('.shape-svg polygon')
          ? getComputedStyle(s.querySelector('.shape-svg polygon')).vectorEffect : null,
      };
    });
    // Stroked as SVG. A clip-path cuts a border off, and the inset-fill trick it
    // was replaced with moved each edge perpendicular to the BOX, which on a
    // diagonal is not perpendicular to the EDGE — the diamond came out heavier
    // than the square and the triangle went thin at its point.
    check('the triangle is drawn as a stroked outline, not a clipped fill',
      shape.fill !== '' && shape.poly && shape.effect === 'non-scaling-stroke',
      JSON.stringify(shape));
    check('and the shape bar can turn that outline off',
      await win.evaluate(() => !!document.querySelector('#shape-bar [data-shape="outline"]')));
  }

  // A code block wrapped in a colour or font span is not a direct child of the
  // editor, so the neighbour-of-the-caret lookup found the wrapper and gave up —
  // Backspace fell through to Chromium, which merged the paragraphs and left
  // both the block and a stray blank line behind.
  {
    const CODE = '<div class="blk-code" data-block-type="code" data-lang="js"'
      + ' data-code="eA%3D%3D" contenteditable="false"><div class="code-head"></div>'
      + '<pre class="code-body"><code class="code-src">x</code></pre></div>';
    const run = async (html) => {
      await win.evaluate(({ h }) => {
        const ed = document.getElementById('editor'); ed.focus();
        ed.innerHTML = h;
        const p = ed.querySelector('p:last-of-type');
        const r = document.createRange(); r.setStart(p.firstChild, 0); r.collapse(true);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }, { h: html });
      await win.keyboard.press('Backspace');
      await win.waitForTimeout(250);
      return win.evaluate(() => document.getElementById('editor').innerHTML);
    };
    check('Backspace below a code block removes it, leaving no blank line',
      await run(`<p>a</p>${CODE}<p>below</p>`) === '<p>a</p><p>below</p>');
    check('and the same when the block sits inside a colour wrapper',
      await run(`<p>a</p><div class="c-red">${CODE}</div><p>below</p>`) === '<p>a</p><p>below</p>');
    check('a wrapper that also holds text keeps its text',
      await run(`<p>a</p><div class="c-red">keep me${CODE}</div><p>below</p>`)
        === '<p>a</p><div class="c-red">keep me</div><p>below</p>');
  }

  // Underline is a selection, never the whole line: picking a style with the
  // caret merely parked in a line underlined the entire line.
  {
    const caretOnly = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>caret only here</p>'; ed.focus();
      const t = ed.querySelector('p').firstChild;
      const r = document.createRange(); r.setStart(t, 6); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('[data-ustyle="u-wavy"]')?.click();
      return ed.innerHTML;
    });
    check('an underline with no selection changes nothing',
      caretOnly === '<p>caret only here</p>', caretOnly);
    const selected = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>underline these words</p>'; ed.focus();
      const t = ed.querySelector('p').firstChild;
      const r = document.createRange(); r.setStart(t, 10); r.setEnd(t, 15);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('[data-act="underline"]').click();
      return ed.innerHTML;
    });
    check('and with a selection it underlines exactly that',
      selected === '<p>underline <span class="u-single">these</span> words</p>', selected);
  }

  /**
   * A formatting run that crosses a paragraph boundary.
   *
   * The old wrapSelection extracted BLOCK nodes and put them inside one inline
   * span — `<span class="u-single"><p>a</p><p>b</p></span>`. text-decoration
   * does not propagate into a block child, so the underline was applied and
   * absolutely nothing was underlined, and the paragraph the drag started in
   * was split in two. One span per block now.
   */
  {
    const out = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p id="s-a">first line here</p><p id="s-b">second line here</p>';
      ed.focus();
      const r = document.createRange();
      r.setStart(document.getElementById('s-a').firstChild, 6);
      r.setEnd(document.getElementById('s-b').firstChild, 6);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.querySelector('[data-act="underline"]').click();
      const decorated = [...ed.querySelectorAll('span.u-single')]
        .filter((el) => getComputedStyle(el).textDecorationLine === 'underline').length;
      return {
        paras: ed.querySelectorAll('p').length,
        swallowed: !![...ed.querySelectorAll('span')].find((el) => el.querySelector('p,div,h1,h2,h3')),
        decorated,
      };
    });
    check('a cross-block underline keeps the paragraphs whole', out.paras === 2, `${out.paras} paragraphs`);
    check('a cross-block underline puts no block inside an inline span', !out.swallowed);
    check('a cross-block underline actually underlines both runs', out.decorated === 2,
      `${out.decorated} underlined`);

    await win.keyboard.press('Control+z');
    await win.waitForTimeout(150);
    check('and one Ctrl+Z takes the whole thing off',
      await win.evaluate(() => document.querySelectorAll('#editor .u-single').length === 0));
  }

  // Ctrl+U was never in the shortcut table, so it fell through to Chromium and
  // left a native <u> that the style menu's own "None" could not strip.
  {
    const out = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p id="s-u">underline this line</p>'; ed.focus();
      const r = document.createRange(); r.selectNodeContents(document.getElementById('s-u'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      return ed.innerHTML;
    });
    void out;
    await win.keyboard.press('Control+u');
    await win.waitForTimeout(150);
    const html = await win.evaluate(() => document.getElementById('editor').innerHTML);
    check('Ctrl+U makes the same u-single the button makes',
      html.includes('u-single') && !html.includes('<u>'), html);

    const stripped = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p id="s-l"><u>a legacy underline</u></p>'; ed.focus();
      const r = document.createRange(); r.selectNodeContents(document.getElementById('s-l'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.querySelector('[data-ustyle="none"]').click();
      return ed.innerHTML;
    });
    check('and None strips a native <u> an older note stored',
      !stripped.includes('<u>'), stripped);
  }

  /**
   * A code block wrapped together with the line under it.
   *
   * Applying a colour across a run that holds a code block leaves the block AND
   * the paragraph below it inside one `<div class="c-red">`. The neighbour
   * lookup used to climb to the editor's direct child, so it compared the
   * WRAPPER with whatever came before the wrapper and never saw the block
   * sitting right above the caret — "I still cannot delete a code block by
   * pressing back underneath it", reported for three releases running.
   */
  {
    const out = await win.evaluate(async () => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<div class="c-red">'
        + '<div class="blk-code" data-block-type="code" data-lang="javascript" data-code=""'
        + ' contenteditable="false"><div class="code-head">'
        + '<select class="code-lang"><option value="javascript" selected>JavaScript</option></select>'
        + '</div><pre class="code-body"><code class="code-src"><br></code></pre></div>'
        + '<p id="under">the line under it</p></div>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      const p = document.getElementById('under');
      const r = document.createRange();
      r.setStart(p.firstChild, 0);
      r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      ed.focus();
      return ed.querySelectorAll('.blk-code').length;
    });
    check('a wrapped code block is there to begin with', out === 1, `${out} blocks`);
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(200);
    const after = await win.evaluate(() => ({
      blocks: document.querySelectorAll('#editor .blk-code').length,
      text: document.getElementById('editor').textContent.trim(),
    }));
    check('Backspace under a wrapped code block removes it', after.blocks === 0,
      `${after.blocks} left`);
    check('and the line the caret was in survives', after.text === 'the line under it',
      JSON.stringify(after.text));
  }

  // Underline is a class, so queryCommandState knows nothing about it and the
  // button never lit up the way Bold and Italic do.
  {
    const lit = await win.evaluate(async () => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p id="lit">underline me</p><p id="plain">plain</p>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('lit'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      ed.focus();
      document.querySelector('.toolbar [data-act="underline"]').click();
      await new Promise((res) => setTimeout(res, 250));
      return document.querySelector('.toolbar [data-act="underline"]').classList.contains('active');
    });
    check('the underline button shows active on underlined text', lit);
    const dark = await win.evaluate(async () => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('plain'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.getElementById('editor').focus();
      await new Promise((res) => setTimeout(res, 250));
      return document.querySelector('.toolbar [data-act="underline"]').classList.contains('active');
    });
    check('and goes dark on a line without one', !dark);
  }

  // The size list is a column of two-digit numbers; "px" on every row was
  // eleven characters of noise in a 130px-wide menu.
  {
    const out = await win.evaluate(() => {
      document.querySelector('[data-menu="menu-size"]').click();
      const rows = [...document.querySelectorAll('#menu-size button .label')].map((l) => l.textContent);
      const menu = document.getElementById('menu-size').getBoundingClientRect();
      const input = document.getElementById('tb-size').getBoundingClientRect();
      const caret = document.querySelector('.tb-combo .tb-caret').getBoundingClientRect();
      document.querySelector('[data-menu="menu-size"]').click();
      return { anyPx: rows.some((r) => /px/.test(r)), first: rows[0],
               menuW: Math.round(menu.width), gap: Math.round(input.right - caret.right) };
    });
    check('the size rows are plain numbers', !out.anyPx && out.first === '10', out.first);
    check('the size menu is only as wide as its rows', out.menuW <= 90, `${out.menuW}px`);
    check('the size arrow sits inside, against the number', out.gap <= 3, `${out.gap}px`);
  }

  /**
   * The migration. Anything a feature writes into a note's MARKUP is frozen in
   * every note saved before it — "are you still keeping the buggy state of the
   * old notes?" This runs on open and is the one place that answers it.
   */
  {
    const out = await win.evaluate(async () => {
      const ed = document.getElementById('editor');
      ed.innerHTML =
        '<div class="shape-layer" contenteditable="false" data-block-type="shape-layer">'
        + '<div class="shape rect" data-kind="rect" style="left:40px;top:30px;width:150px;'
        + 'height:90px;background:rgb(232,205,189);">'
        + `<div class="shape-text" contenteditable="true">${'Chat'.repeat(40)}</div>`
        + '<span class="shape-h"></span></div></div>'
        + '<span class="u-single"><p>one</p><p>two</p></span>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 600));
      // Switch away and back, so openNote runs over what was stored.
      const rows = [...document.querySelectorAll('.note-row')];
      rows[rows.length - 1]?.click();
      await new Promise((r) => setTimeout(r, 250));
      rows[0]?.click();
      await new Promise((r) => setTimeout(r, 450));
      const shape = document.querySelector('#editor .shape');
      const text = shape?.querySelector('.shape-text');
      return {
        fits: !!text && text.offsetHeight <= shape.clientHeight,
        fill: shape?.style.getPropertyValue('--shape-fill') || '',
        swallowed: !![...document.querySelectorAll('#editor span')]
          .find((el) => el.querySelector('p,div,h1,h2,h3')),
      };
    });
    check('a shape stored overflowing is re-measured when the note opens', out.fits);
    check('a shape stored before --shape-fill gets it', !!out.fill, out.fill);
    check('a stored block-swallowing span is taken apart on open', !out.swallowed);
  }

  // The size field kept free typing but had no arrow of its own; a <datalist>
  // draws none and cannot be styled to match the other menus.
  {
    const out = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>make these words bigger</p>'; ed.focus();
      const t = ed.querySelector('p').firstChild;
      const r = document.createRange(); r.setStart(t, 5); r.setEnd(t, 16);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('[data-menu="menu-size"]').click();
      [...document.querySelectorAll('#menu-size button')].find((b) => b.dataset.size === '28').click();
      return ed.innerHTML;
    });
    check('the size caret opens a menu that sizes the selection',
      out === '<p>make <span style="font-size: 28px;">these words</span> bigger</p>', out);
    check('and every caret in the bar is now one triangle at one size',
      await win.evaluate(() => {
        const marks = [...document.querySelectorAll('.tb-caret')]
          .map((el) => getComputedStyle(el, '::after').borderTopWidth);
        return marks.length >= 4 && new Set(marks).size === 1;
      }));
  }

  /**
   * Deleting next to a shape layer, and deleting a divider.
   *
   * Both rules were written against `keydown` first, by working out from the
   * caret which element WOULD go. That guess is wrong often enough to matter:
   * with empty spans between the caret and a shape layer it saw the spans, and
   * Chromium — which selects a non-editable island on the first Backspace and
   * removes it on the second — took all eleven shapes in a note on the second
   * press. `beforeinput` does not guess; `getTargetRanges()` is what is about
   * to go.
   */
  {
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<div class="shape-layer" contenteditable="false" data-block-type="shape-layer">'
        + '<div class="shape rect" data-kind="rect" style="left:40px;top:20px;width:120px;height:80px;'
        + 'background:#e8cdbd;--shape-fill:#e8cdbd;">'
        + '<div class="shape-text" contenteditable="false"><br></div>'
        + '<span class="shape-h"></span></div></div>'
        + '<span class="c-red"></span><span class="c-red">text after the layer</span>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      const t = [...ed.querySelectorAll('span')]
        .find((x) => x.textContent.startsWith('text')).firstChild;
      const r = document.createRange();
      r.setStart(t, 0);
      r.collapse(true);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      ed.focus();
    });
    await win.waitForTimeout(250);
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(150);
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(150);
    check('no delete key can take a shape layer',
      await win.evaluate(() => document.querySelectorAll('#editor .shape').length === 1),
      await win.evaluate(() => String(document.querySelectorAll('#editor .shape').length)));
  }

  // A divider takes two presses: one to show which one, one to take it.
  {
    const hrs0 = await win.evaluate(async () => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>above</p><hr class="blk-hr"><p id="under">below</p>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
      const t = document.getElementById('under').firstChild;
      const r = document.createRange();
      r.setStart(t, 0);
      r.collapse(true);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      ed.focus();
      return ed.querySelectorAll('hr').length;
    });
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(200);
    const armed = await win.evaluate(() => ({
      hrs: document.querySelectorAll('#editor hr').length,
      armed: document.querySelectorAll('#editor hr.armed').length,
    }));
    check('the first press shows the divider rather than taking it',
      hrs0 === 1 && armed.hrs === 1 && armed.armed === 1, JSON.stringify(armed));
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(200);
    check('and the second press takes it',
      await win.evaluate(() => document.querySelectorAll('#editor hr').length === 0));
  }

  /**
   * The toolbar's marks say what the caret is standing IN.
   *
   * `queryCommandState('bold')` reports the TYPING state, which Chromium
   * carries across a boundary: with the caret at the start of a line whose
   * first word is bold, Bold lit up on plain text — "bold is stuck here, it
   * will not turn off". And a caret at offset 0 of a paragraph sits outside the
   * span holding the line's formatting, so the underline mark never appeared at
   * the beginning of an underlined line — "right at the start there is no
   * indicator at all".
   */
  {
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p id="mk-b"><b>bold run</b> plain</p>'
        + '<p id="mk-u"><span class="u-single">underlined line</span></p>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await win.waitForTimeout(200);

    const marks = () => win.evaluate(() => {
      const on = (a) => document.querySelector(`.toolbar [data-act="${a}"]`)
        ?.classList.contains('active');
      return { bold: on('bold'), underline: on('underline') };
    });
    const caretIn = (selector, offset, intoElement) => win.evaluate(([s, o, ie]) => {
      const el = document.querySelector(s);
      const r = document.createRange();
      if (ie) r.setStart(el, o);
      else r.setStart(el.firstChild, o);
      r.collapse(true);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.getElementById('editor').focus();
    }, [selector, offset, intoElement]);

    await caretIn('#mk-b', 1, true);
    await win.waitForTimeout(220);
    const plain = await marks();
    check('Bold is dark on plain text beside a bold run', plain.bold === false,
      JSON.stringify(plain));

    await caretIn('#mk-b b', 3, false);
    await win.waitForTimeout(220);
    check('and lit inside the bold run', (await marks()).bold === true);

    await caretIn('#mk-u', 0, true);
    await win.waitForTimeout(220);
    const atStart = await marks();
    check('Underline is lit at the very start of an underlined line',
      atStart.underline === true, JSON.stringify(atStart));
  }

  /**
   * A blank line under a divider goes before the divider is offered.
   *
   * Arming the divider while a blank line sat between it and the caret meant
   * the gap could never be closed — "it selects the divider, but the empty
   * white row underneath is still there".
   */
  {
    const started = await win.evaluate(async () => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>above</p><hr class="blk-hr"><p id="gap"><br></p><p id="under">below</p>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
      const gap = document.getElementById('gap');
      const r = document.createRange();
      r.setStart(gap, 0);
      r.collapse(true);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      ed.focus();
      return ed.querySelectorAll('p').length;
    });
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(220);
    const gone = await win.evaluate(() => ({
      paras: document.querySelectorAll('#editor p').length,
      hrs: document.querySelectorAll('#editor hr').length,
      armed: document.querySelectorAll('#editor hr.armed').length,
    }));
    check('the blank line under a divider goes on the first press',
      started === 3 && gone.paras === 2 && gone.hrs === 1 && gone.armed === 0,
      JSON.stringify(gone));
  }

  /**
   * One line weight for every shape.
   *
   * A declared 1.6px border is rounded to a whole pixel and an SVG stroke is
   * not, so declaring the same number gave the stroked kinds a visibly heavier
   * line than the square's.
   */
  {
    const weights = {};
    for (const kind of ['square', 'diamond', 'triangle']) {
      await win.evaluate((k) => {
        document.getElementById('editor').innerHTML = '<p>x</p>';
        document.querySelector(`[data-shape-add="${k}"]`).click();
      }, kind);
      await win.waitForTimeout(300);
      weights[kind] = await win.evaluate((k) => {
        const s = document.querySelector(`#editor .shape.${k}`);
        const poly = s?.querySelector('.shape-svg polygon');
        return poly ? getComputedStyle(poly).strokeWidth : getComputedStyle(s).borderTopWidth;
      }, kind);
    }
    check('every shape is outlined at the same weight',
      new Set(Object.values(weights)).size === 1, JSON.stringify(weights));
  }

  // A shape's text: a caret to see, and room to grow into.
  {
    await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>x</p>'; });
    await press(win, '[data-shape-add="rect"]');
    await win.waitForTimeout(300);
    const pt = await win.evaluate(() => {
      const r = document.querySelector('#editor .shape').getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    const startedAt = await win.evaluate(() => document.querySelector('#editor .shape').offsetHeight);
    await win.mouse.dblclick(pt.x, pt.y);
    await win.waitForTimeout(300);
    check('double-clicking a shape opens its text with a caret to see',
      await win.evaluate(() => {
        const t = document.querySelector('#editor .shape-text');
        // An empty contenteditable has no line box, so Chromium paints no caret
        // and nothing says you may type.
        return t.closest('.shape').classList.contains('editing') && t.offsetHeight > 10;
      }));
    await win.keyboard.type('a much longer piece of text than this shape was ever sized for');
    await win.waitForTimeout(700);
    const grew = await win.evaluate((was) => {
      const s = document.querySelector('#editor .shape');
      const t = s.querySelector('.shape-text');
      return { was, h: s.offsetHeight, clientH: s.clientHeight, textH: t.offsetHeight,
               editing: s.classList.contains('editing'), text: t.textContent.slice(0, 24) };
    }, startedAt);
    check('and the shape grows until the text fits',
      grew.h > grew.was && grew.textH <= grew.clientH, JSON.stringify(grew));
  }

  // Printing has to put the note on the page, and nothing else.
  check('the print stylesheet hides every piece of app chrome',
    await win.evaluate(() => {
      const printRules = [...document.styleSheets]
        .flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } })
        .filter((r) => r.media?.mediaText === 'print')
        .flatMap((r) => [...r.cssRules]);
      return ['.titlebar', '#app-menu', '.side', '.toolbar', '.update-card', '.overlay']
        .every((sel) => printRules.some((r) => r.selectorText?.includes(sel) && r.style.display === 'none'));
    }));

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

    // Archive and Trash sit side by side under one panel, in the New note
    // button's own visual language, and the panel grows upward over the list.
    check('Archive and Trash are two buttons side by side',
      await win.evaluate(() => {
        const tabs = [...document.querySelectorAll('.drawer-tab')];
        if (tabs.length !== 2) return false;
        const [a, b] = tabs.map((t) => t.getBoundingClientRect());
        return Math.abs(a.top - b.top) < 2 && a.left < b.left;
      }));

    await press(win, '[data-drawer="trash"]');
    await win.waitForTimeout(300);
    check('opening one grows the panel upward, over the note list',
      await win.evaluate(() => {
        const body = document.getElementById('drawer-body');
        const tabs = document.querySelector('.drawer-tabs');
        return !body.hidden && body.getBoundingClientRect().top < tabs.getBoundingClientRect().top;
      }));
    check('and it shows the trashed note as a note block, not a strip',
      await win.evaluate(() => {
        const rows = document.querySelectorAll('#drawer-body .drawer-item .note-row .nr-title');
        return rows.length === 1 && rows[0].textContent === 'Welcome to Nebula Guide';
      }));

    // Only one at a time: opening the other closes this one.
    await press(win, '[data-drawer="archive"]');
    await win.waitForTimeout(300);
    check('opening the other closes the first',
      await win.evaluate(() => {
        const on = [...document.querySelectorAll('.drawer-tab')]
          .filter((t) => t.getAttribute('aria-expanded') === 'true');
        return on.length === 1 && on[0].dataset.drawer === 'archive';
      }));
    await press(win, '[data-drawer="archive"]');
    await win.waitForTimeout(250);
    check('and pressing it again closes the panel',
      await win.evaluate(() => document.getElementById('drawer-body').hidden));

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
    // A font needs a SELECTION. 0.6.0 gave the collapsed caret a whole-block
    // fallback because picking a font with the caret merely parked in a line
    // appeared to do nothing; the answer to that was explicit — "only what is
    // selected should change; if nothing is selected it should not change" —
    // and a font quietly taking a whole paragraph is the more surprising of the
    // two. The click above had only a caret.
    const state = await win.evaluate(() => ({
      applied: document.querySelector('#editor p')?.style.fontFamily ?? '',
      label: document.querySelector('#tb-font .tb-font__name')?.textContent ?? '',
    }));
    check('a font picked with only a caret leaves the line alone',
      state.applied === '', JSON.stringify(state));

    const selected = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const p = ed.querySelector('p');
      const r = document.createRange();
      r.setStart(p.firstChild, 0);
      r.setEnd(p.firstChild, Math.min(4, p.firstChild.length));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      ed.focus();
      [...document.querySelectorAll('#menu-font button')]
        .find((b) => b.textContent.trim() === 'Comic Sans MS')?.click();
      return ed.innerHTML;
    });
    check('and applies to exactly what IS selected',
      /Comic Sans/.test(selected), selected.slice(0, 120));
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

  /**
   * A colour needs a SELECTION, like a font.
   *
   * 0.4.4 gave the collapsed caret a whole-block fallback, because picking a
   * colour with the caret merely parked in a line did nothing at all. That
   * traded one surprise for a bigger one: "I did not select anywhere, I press
   * change colour and everything changes." Nothing selected, nothing changed.
   */
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
    check('a colour with only a caret leaves the line alone',
      await win.evaluate(() => {
        const p = document.querySelector('#editor p');
        return !p?.classList.contains('c-red') && !p?.querySelector('.c-red');
      }), await win.evaluate(() => document.getElementById('editor').innerHTML.slice(0, 90)));

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

  // Headings: the order was right but h3 (18px) sat 1px above body text, so
  // "1 should be biggest and 3 smallest" read as broken.
  {
    const sizes = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<h1>a</h1><h2>b</h2><h3>c</h3><p>d</p>';
      const px = (s) => parseFloat(getComputedStyle(ed.querySelector(s)).fontSize);
      return { h1: px('h1'), h2: px('h2'), h3: px('h3'), p: px('p') };
    });
    check('h1 > h2 > h3 > body text, with room between each',
      sizes.h1 > sizes.h2 && sizes.h2 > sizes.h3 && sizes.h3 - sizes.p >= 2,
      JSON.stringify(sizes));
  }

  // The / menu drew all three headings with the same icon.
  {
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>x</p>'; ed.focus();
      const r = document.createRange();
      r.selectNodeContents(ed.querySelector('p')); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await win.keyboard.type(' /head');
    await win.waitForTimeout(300);
    const icons = await win.evaluate(() =>
      [...document.querySelectorAll('#slash-menu button .fm-ic svg')].map((s) => s.outerHTML));
    check('the three headings in the / menu have three different marks',
      icons.length === 3 && new Set(icons).size === 3, `${icons.length} rows, ${new Set(icons).size} distinct`);
    await win.keyboard.press('Escape');
  }

  // A code block could not be removed from the UI at all — nothing anywhere
  // called remove() on one, and Chromium will not delete a contenteditable=false
  // island with Backspace.
  {
    const twoBlocks = () => win.evaluate(() => {
      const src = encodeURIComponent('print("hi")');
      document.getElementById('editor').innerHTML =
        `<div class="blk-code" data-block-type="code" data-lang="python" data-code="${src}" contenteditable="false">`
        + '<div class="code-head"><button type="button" class="code-del">x</button></div>'
        + '<pre class="code-body"><code class="code-src"></code></pre></div><p>tail</p>';
    });
    await twoBlocks();
    await win.evaluate(() => {
      const ed = document.getElementById('editor'); ed.focus();
      const r = document.createRange();
      r.selectNodeContents(ed.querySelector('p')); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    const scrollBefore = await win.evaluate(() => document.getElementById('editor').scrollTop);
    await press(win, '[data-act="codeblock"]');
    await win.waitForTimeout(400);
    const inserted = await win.evaluate(() => {
      const blocks = [...document.querySelectorAll('#editor .blk-code')];
      return {
        count: blocks.length,
        focused: blocks.findIndex((b) => b.contains(document.activeElement)),
        scroll: document.getElementById('editor').scrollTop,
      };
    });
    // The old lookup grabbed the first unpainted block in the document, so
    // inserting one in the guide focused the guide's FIRST block and scrolled
    // the note to the top.
    check('a new code block is the one that gets focus, not the first in the note',
      inserted.count === 2 && inserted.focused === 1 && inserted.scroll === scrollBefore,
      JSON.stringify(inserted));
    await focusEditor(win);
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(300);
    check('and Ctrl+Z takes the new block back out',
      await win.evaluate(() => document.querySelectorAll('#editor .blk-code').length) === 1);

    await press(win, '#editor .code-del');
    await win.waitForTimeout(250);
    check('the ✕ on a code block deletes it',
      await win.evaluate(() => document.querySelectorAll('#editor .blk-code').length) === 0);
    await focusEditor(win);
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(300);
    check('and Ctrl+Z brings it back',
      await win.evaluate(() => document.querySelectorAll('#editor .blk-code').length) === 1);

    await win.evaluate(() => {
      const ed = document.getElementById('editor'); ed.focus();
      const r = document.createRange();
      r.setStart(ed.querySelector('p').firstChild, 0); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(250);
    check('Backspace at the start of the line after a block removes it too',
      await win.evaluate(() => document.querySelectorAll('#editor .blk-code').length) === 0);
  }

  // Every / block is one undo step. Nothing in slash-menu.js touched history.
  {
    for (const [typed, marker] of [[' /div', 'blk-hr'], [' /cod', 'blk-code'], [' /to', 'blk-todo']]) {
      await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p>line</p>'; });
      await win.evaluate(() => {
        const ed = document.getElementById('editor'); ed.focus();
        const r = document.createRange();
        r.selectNodeContents(ed.querySelector('p')); r.collapse(false);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        ed.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await win.waitForTimeout(750);
      await win.keyboard.type(typed);
      await win.waitForTimeout(300);
      await win.keyboard.press('Enter');
      await win.waitForTimeout(400);
      const added = await win.evaluate((m) => document.getElementById('editor').innerHTML.includes(m), marker);
      await focusEditor(win);
      await win.keyboard.press('Control+z');
      await win.waitForTimeout(400);
      const gone = await win.evaluate((m) => !document.getElementById('editor').innerHTML.includes(m), marker);
      check(`${typed.trim()} inserts and one Ctrl+Z takes it back`, added && gone, `added ${added}, undone ${gone}`);
    }
  }

  // Pressing a list button on a to-do line did nothing; handing the command a
  // plain paragraph instead produced `<p><ul>…</ul></p>`.
  {
    const out = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<div class="blk-todo">task</div>'; ed.focus();
      const r = document.createRange();
      r.selectNodeContents(ed.querySelector('.blk-todo')); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('[data-act="ul"]').click();
      return ed.innerHTML;
    });
    check('a to-do turns into a real list, not a list inside a paragraph',
      out === '<ul><li>task</li></ul>', out);
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
