/**
 * 1.0.0 — the Universe widget (the owner: "add Universe to the widgets — the
 * live map, added into a note"). The real app on a throwaway profile: it is
 * picked from /widget, its map is live and drawn in colour, the note keeps no
 * canvas, and the live map comes back when the note is opened again.
 *
 *   node tests/e2e/universe-widget.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runUniverseWidgetChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-universe-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const content = '<p id="a">The map of my notes</p><p id="b"><br></p><p id="c">end</p>';
  fs.writeFileSync(path.join(notes, 'uw.json'), JSON.stringify({ id: 'uw', title: 'uw', content, createdAt: 1, updatedAt: 3 }));
  // Some notes for the map to show.
  for (let i = 0; i < 6; i++) {
    fs.writeFileSync(path.join(notes, `s${i}.json`), JSON.stringify({ id: `s${i}`, title: `star ${i}`, content: `<p>${i}</p>`, labels: i % 2 ? ['work'] : ['home'], createdAt: 1, updatedAt: 0 }));
  }
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const openNote = (title) => win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
    await openNote('uw');
    await win.waitForFunction(() => document.getElementById('b'), null, { polling: 50 });
    await win.waitForTimeout(300);
    const line = await win.evaluate(() => { const r = document.getElementById('b').getBoundingClientRect(); return [r.left + 4, r.top + r.height / 2]; });
    await win.mouse.click(line[0], line[1]);

    // /widget → the chooser → Universe.
    await win.keyboard.type('/widget');
    await win.waitForTimeout(150);
    await win.keyboard.press('Enter');
    await win.waitForSelector('#widget-menu');
    const offered = await win.evaluate(() => {
      const b = document.querySelector('#widget-menu [data-widget-kind="universe"]');
      return b ? { text: b.textContent.trim(), icon: !!b.querySelector('.fm-ic svg') } : null;
    });
    check('the chooser offers the Universe with its icon', offered?.text === 'Universe' && offered.icon, JSON.stringify(offered));
    await win.click('#widget-menu [data-widget-kind="universe"]');
    await win.waitForSelector('#editor .note-widget[data-widget="universe"]');
    await win.waitForSelector('#editor .note-widget[data-widget="universe"] .wg-live canvas', { timeout: 5000 }).catch(() => {});
    await win.waitForTimeout(1200);

    const live = await win.evaluate(() => {
      const fig = document.querySelector('#editor .note-widget[data-widget="universe"]');
      const canvas = fig.querySelector('.wg-live canvas');
      const r = fig.getBoundingClientRect();
      const out = { inline: fig.classList.contains('note-image--inline'), ratio: r.width / r.height, canvas: !!canvas, w: canvas?.width, h: canvas?.height, colours: 0 };
      if (canvas?.width && canvas.height) {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const seen = new Set();
        for (let i = 0; i < data.length && seen.size < 50; i += 4 * 7) seen.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
        out.colours = seen.size;
      }
      return out;
    });
    check('the Universe lands in the text, wide', live.inline && live.ratio > 1.2, JSON.stringify(live));
    check('its map is live: a canvas over the face, drawn in more than one colour', live.canvas && live.w > 0 && live.colours > 1, JSON.stringify(live));

    // A drag on the map moves the map, not the widget.
    const before = await win.evaluate(() => { const r = document.querySelector('#editor .note-widget[data-widget="universe"]').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    const mid = await win.evaluate(() => { const r = document.querySelector('#editor .note-widget[data-widget="universe"] canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await win.mouse.move(mid[0], mid[1]);
    await win.mouse.down();
    await win.mouse.move(mid[0] + 40, mid[1] + 20, { steps: 5 });
    await win.mouse.up();
    await win.waitForTimeout(200);
    const after = await win.evaluate(() => { const r = document.querySelector('#editor .note-widget[data-widget="universe"]').getBoundingClientRect(); return { x: r.left, y: r.top, text: document.getElementById('a').textContent }; });
    check('a drag on the map leaves the widget where it is and the text as it was',
      Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2 && after.text === 'The map of my notes', JSON.stringify({ before, after }));

    // Saved: the face, never the canvas.
    await win.evaluate(() => document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true })));
    await win.waitForTimeout(1500);
    const file = [path.join(notes, 'uw', 'uw.json'), path.join(notes, 'uw.json')].find((f) => fs.existsSync(f));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).content;
    check('the saved note holds the Universe and its drawn face, and no canvas',
      saved.includes('data-widget="universe"') && saved.includes('wg-sky-art') && !saved.includes('<canvas') && !saved.includes('wg-live'), saved.slice(0, 400));

    // Another note, then back: the live map leaves with the note and comes back with it.
    await openNote('star 0');
    await win.waitForTimeout(500);
    const away = await win.evaluate(() => document.querySelectorAll('.wg-live canvas').length);
    check('opening another note leaves no live map behind', away === 0, String(away));
    await openNote('uw');
    await win.waitForSelector('#editor .note-widget[data-widget="universe"] .wg-live canvas', { timeout: 5000 }).catch(() => {});
    await win.waitForTimeout(1200);
    const back = await win.evaluate(() => {
      const canvas = document.querySelector('#editor .note-widget[data-widget="universe"] .wg-live canvas');
      if (!canvas?.width) return { canvas: !!canvas, colours: 0 };
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const seen = new Set();
      for (let i = 0; i < data.length && seen.size < 50; i += 4 * 7) seen.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
      return { canvas: true, colours: seen.size, count: document.querySelectorAll('#editor canvas').length };
    });
    check('reopening the note brings the live map back', back.canvas && back.colours > 1 && back.count === 1, JSON.stringify(back));

    // Printed: the drawn face, never the live map, with widgets or without (Codex 34 #2).
    await win.emulateMedia({ media: 'print' });
    const printed = await win.evaluate(() => {
      const fig = document.querySelector('#editor .note-widget[data-widget="universe"]');
      const shown = (el) => !!el && getComputedStyle(el).display !== 'none';
      const withWidgets = { live: shown(fig.querySelector('.wg-live')), art: shown(fig.querySelector('.wg-sky-art')) };
      document.body.classList.add('print-no-widgets');
      const without = { fig: shown(fig), live: shown(fig.querySelector('.wg-live')) };
      document.body.classList.remove('print-no-widgets');
      return { withWidgets, without };
    });
    await win.emulateMedia({ media: 'screen' });
    check('a print shows the drawn face and hides the live map; without widgets, neither',
      !printed.withWidgets.live && printed.withWidgets.art && !printed.without.fig && !printed.without.live, JSON.stringify(printed));

    // Copied: what the copy serializes holds the face, the live map stays in the note (Codex 34 #3).
    // Read at the copy itself, after the app's own handlers: under Playwright a default copy
    // does not reach the system clipboard, so the selection the browser serializes is checked.
    const title = await win.evaluate(() => { const r = document.querySelector('#editor .note-widget[data-widget="universe"] .wg-head').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await win.mouse.click(title[0], title[1]);
    await win.waitForTimeout(150);
    await win.evaluate(() => {
      window.__copied = null;
      window.addEventListener('copy', () => {
        const sel = getSelection();
        const box = document.createElement('div');
        if (sel.rangeCount) box.append(sel.getRangeAt(0).cloneContents());
        window.__copied = box.innerHTML;
      }, { once: true });
    });
    await win.keyboard.press('Control+c');
    await win.waitForTimeout(400);
    const clip = await win.evaluate(() => window.__copied || '');
    const kept = await win.evaluate(() => document.querySelectorAll('#editor .note-widget[data-widget="universe"] .wg-live canvas').length);
    check('a copied Universe takes its face, no live map, and its map stays live',
      clip.includes('data-widget="universe"') && clip.includes('wg-sky-art') && !clip.includes('<canvas') && !clip.includes('wg-live') && kept === 1, `${kept} ${clip.slice(0, 300)}`);

    // Four in a note: three live maps, the fourth only its face.
    await win.evaluate(() => {
      const fig = document.querySelector('#editor .note-widget[data-widget="universe"]');
      for (let i = 0; i < 3; i++) {
        const copy = fig.cloneNode(true);
        copy.querySelector('.wg-live')?.remove();
        fig.after(copy);
      }
    });
    await win.waitForTimeout(500);
    const four = await win.evaluate(() => ({ figs: document.querySelectorAll('#editor .note-widget[data-widget="universe"]').length, live: document.querySelectorAll('#editor .wg-live canvas').length }));
    check('at most three live maps in a note', four.figs === 4 && four.live === 3, JSON.stringify(four));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  let failed = 0;
  await runUniverseWidgetChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`\n${count - failed}/${count} Universe widget checks passed`);
  process.exit(failed ? 1 : 0);
}
