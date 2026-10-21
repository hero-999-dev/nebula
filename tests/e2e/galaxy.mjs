/**
 * 1.0.0 — the map of your notes (the owner, v2: projects stars, folders planets, notes their moons,
 * labels moons; bottom left among Archive and Trash; a button puts it over the
 * note's page, and a note opened from it comes beside it — a second makes
 * three). The real app on a throwaway profile.
 *
 *   node tests/e2e/galaxy.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runGalaxyChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-galaxy-'));
  const storage = path.join(profile, 'storage');
  const notes = path.join(storage, 'notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(storage, 'folders.json'), JSON.stringify({ folders: [{ id: 'f-work', name: 'Work', createdAt: 1 }] }));
  const write = (id, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`), JSON.stringify({ id, title: id, content: `<p>the words of ${id}</p>`, createdAt: 1, updatedAt: 1, ...extra }));
  write('alpha', { folder: 'f-work', labels: ['idea'], updatedAt: 9 });
  write('beta', { folder: 'f-work', updatedAt: 8 });
  write('gamma', { updatedAt: 7 });
  let app;
  const errors = [];
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.on('pageerror', (e) => errors.push(String(e)));
    win.on('console', (m) => { if (m.type() === 'error' && /map|galaxy/i.test(m.text())) errors.push(m.text()); });
    win.setDefaultTimeout(10_000);
    await win.setViewportSize?.({ width: 1500, height: 900 }).catch(() => {});
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());

    const mini = await win.evaluate(() => {
      const m = document.querySelector('.side-foot .galaxy-mini');
      const c = m?.querySelector('canvas');
      const tabs = document.querySelector('.drawer-tabs');
      return { there: !!m, w: c?.width ?? 0, h: c?.height ?? 0, aboveTabs: !!(m && tabs && (m.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING)) };
    });
    check('the map is in the sidebar, above Archive and Trash, and draws', mini.there && mini.aboveTabs && mini.w > 0 && mini.h > 0, JSON.stringify(mini));

    // Something is drawn: the canvas is not one flat colour.
    const drawn = await win.evaluate(() => {
      const c = document.querySelector('.galaxy-mini canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 16) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      return seen.size;
    });
    check('the minimap draws more than its background', drawn > 3, `${drawn} colours`);

    // Over the whole page.
    await win.click('.galaxy-mini .galaxy-full');
    await win.waitForTimeout(800);
    const state = () => win.evaluate(() => ({
      full: document.body.classList.contains('map-full'),
      panes: [...document.querySelectorAll('.split-row > .split-pane')].map((p) => p.dataset.note),
      toolbar: getComputedStyle(document.getElementById('toolbar')).display,
    }));
    let s = await state();
    check('⤢ puts the map over the whole page, the editing bar out of sight', s.full && s.panes.join() === '@map' && s.toolbar === 'none', JSON.stringify(s));

    // What the map holds, through its list for screen readers: titles and kinds, never the words.
    const listed = await win.evaluate(() => [...document.querySelectorAll('.split-map .galaxy-list button')].map((b) => b.textContent));
    check('the map holds the folder as a planet and its notes as its moons (v2)', ['Work (folder)', 'alpha (note)', 'beta (note)', 'gamma (note)'].every((x) => listed.includes(x)), JSON.stringify(listed));
    check('and nothing of what the notes say', !listed.some((x) => x.includes('the words of')), JSON.stringify(listed));

    // A note opened from the map comes beside it; a second makes three.
    const openFromMap = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('.split-map .galaxy-list button')].find((b) => b.textContent === `${t} (note)`)?.focus(), title);
      await win.waitForTimeout(200);
      await win.focus('.split-map canvas');
      await win.keyboard.press('Enter');
      await win.waitForTimeout(600);
    };
    await openFromMap('beta');
    s = await state();
    check('a note opened from the map comes beside it', s.panes.join() === '@map,beta' && s.toolbar !== 'none', JSON.stringify(s));
    const editorText = await win.evaluate(() => document.getElementById('editor')?.textContent);
    check('and is the note being written in', editorText === 'the words of beta', editorText);
    await openFromMap('gamma');
    s = await state();
    check('a second makes three', s.panes.join() === '@map,beta,gamma', JSON.stringify(s));

    // The right-click menu: Open is first for a planet.
    const menu = await win.evaluate(async () => {
      const b = [...document.querySelectorAll('.split-map .galaxy-list button')].find((x) => x.textContent === 'alpha (note)');
      b.focus();
      await new Promise((r) => setTimeout(r, 1200));
      const c = document.querySelector('.split-map canvas');
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      await new Promise((res) => setTimeout(res, 100));
      const m = document.querySelector('.galaxy-menu');
      return m && !m.hidden ? [...m.querySelectorAll('button')].map((x) => x.textContent) : null;
    });
    check('right-click on a planet offers Open', menu?.[0] === 'Open', JSON.stringify(menu));
    await win.keyboard.press('Escape');

    // Closing the map leaves the notes; the page is whole again with one.
    await win.evaluate(() => document.querySelector('.split-pane[data-note="@map"] .split-close').click());
    await win.waitForTimeout(400);
    s = await state();
    check('closing the map leaves the notes beside each other', !s.full && s.panes.join() === 'beta,gamma', JSON.stringify(s));
    await win.evaluate(() => document.querySelector('.split-pane[data-note="beta"] .split-close').click());
    await win.waitForTimeout(400);
    s = await state();
    const frame = await win.evaluate(() => document.getElementById('editor-frame').parentElement.id);
    check('and down to one, the page is whole again', s.panes.length === 0 && frame === 'edit-shell', JSON.stringify({ s, frame }));

    // Unstyled controls on a dark theme.
    await win.click('#theme-pick [data-theme="dark"]');
    await win.waitForTimeout(300);
    const grey = await win.evaluate(() => [...document.querySelectorAll('.galaxy-mini button, .galaxy-pane button, .galaxy-menu button')]
      .filter((b) => { const c = getComputedStyle(b); return c.color === 'rgb(0, 0, 0)' || c.backgroundColor === 'rgb(240, 240, 240)'; })
      .map((b) => b.className || b.textContent));
    check('every map control is styled on a dark theme', grey.length === 0, JSON.stringify(grey));
    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  let failed = 0;
  await runGalaxyChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`\n${count - failed}/${count} map checks passed`);
  process.exit(failed ? 1 : 0);
}
