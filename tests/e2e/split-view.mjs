/**
 * 1.0.0 — notes side by side (the owner: "birden fazla not acma olsun mesela
 * ekrani ikiye bölelim falan üce sürükledigim not sayisina göre ekran esit
 * bölünsün, ai paneli ve editör ayni olsun yukardaki header bölünsün … nw de
 * ise sayfa ekledigim de nw formatinda gelsin"). The real app on a throwaway
 * profile, notes dragged from the list with the mouse.
 *
 *   node tests/e2e/split-view.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runSplitChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-split-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const write = (id, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`), JSON.stringify({ id, title: id, content: `<p>words of ${id}</p>`, createdAt: 1, updatedAt: 1, ...extra }));
  write('one', { updatedAt: 9 });
  write('two', { page: 'a4', updatedAt: 8 });
  write('three', { updatedAt: 7 });
  write('four', { updatedAt: 6 });
  write('five', { updatedAt: 5 });
  const saved = (id) => { try { return JSON.parse(fs.readFileSync(path.join(notes, `${id}.json`), 'utf8')); } catch { return JSON.parse(fs.readFileSync(path.join(notes, id, `${id}.json`), 'utf8')); } };
  let app;
  const errors = [];
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.on('pageerror', (e) => errors.push(String(e)));
    win.setDefaultTimeout(10_000);
    await win.setViewportSize?.({ width: 1500, height: 900 }).catch(() => {});
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const openNote = (title) => win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
    const row = (title) => `#note-list .note-row[title="${title}"]`;
    const state = () => win.evaluate(() => {
      const panes = [...document.querySelectorAll('.split-row > .split-pane')];
      return {
        on: document.body.classList.contains('split-on'),
        panes: panes.map((p) => p.dataset.note),
        active: panes.find((p) => p.classList.contains('active'))?.dataset.note ?? null,
        widths: panes.map((p) => Math.round(p.getBoundingClientRect().width)),
        heads: panes.map((p) => (p.classList.contains('active') ? p.querySelector('.title-input')?.value : p.querySelector('.split-title').textContent)),
        pages: panes.map((p) => p.querySelector('.split-page').textContent),
        titleInHead: !!document.querySelector('.split-pane.active > .split-head > #title'),
        frameInPane: !!document.querySelector('.split-pane.active > #editor-frame'),
        editorPage: document.getElementById('editor').dataset.page,
        editorText: document.getElementById('editor').innerText.trim(),
        ghosts: panes.filter((p) => !p.classList.contains('active')).map((p) => p.querySelector('.split-ghost').innerText.trim()),
      };
    });
    const drop = async (title, sel, fx) => {
      const box = await win.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
      const from = await win.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, row(title));
      // A hand's drag, in steps: one jump from the row to the page sometimes started no drag at all.
      await win.mouse.move(from.x, from.y);
      await win.mouse.down();
      await win.mouse.move(from.x + 12, from.y + 4, { steps: 4 });
      await win.mouse.move(box.x + box.w * fx, box.y + box.h / 2, { steps: 12 });
      await win.waitForTimeout(100);
      await win.mouse.up();
      await win.waitForTimeout(400);
    };

    await openNote('one');
    await win.waitForTimeout(300);
    await drop('two', '#editor-frame', 0.8);
    let s = await state();
    check('a note dragged onto the right of the page opens beside it: two panes, the new one at the right and written in',
      s.on && s.panes.join() === 'one,two' && s.active === 'two', JSON.stringify(s));
    check('the page is shared out equally', Math.abs(s.widths[0] - s.widths[1]) <= 2, JSON.stringify(s.widths));
    // The owner: drag the edge between two panes to give one more room.
    const equal = [...s.widths];
    const divider = await win.locator('.split-divider').first().boundingBox();
    await win.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
    await win.mouse.down();
    await win.mouse.move(divider.x + divider.width / 2 + 150, divider.y + divider.height / 2, { steps: 10 });
    await win.mouse.up();
    await win.waitForTimeout(150);
    s = await state();
    check('dragging the divider moves the boundary while both panes share the same room',
      s.widths[0] > equal[0] + 110 && s.widths[1] < equal[1] - 110
      && Math.abs((s.widths[0] + s.widths[1]) - (equal[0] + equal[1])) <= 2, JSON.stringify({ equal, now: s.widths }));
    await win.locator('.split-divider').first().dblclick();
    s = await state();
    check('double-clicking the divider makes the panes equal again', Math.abs(s.widths[0] - s.widths[1]) <= 2, JSON.stringify(s.widths));
    check('the header is split: each pane has its own title, the title box in the one written in', s.heads.join() === 'one,two' && s.titleInHead && s.frameInPane, JSON.stringify(s));
    check('the editing bar stays one, above the panes', await win.evaluate(() => document.querySelectorAll('#toolbar').length === 1 && !document.querySelector('.split-pane #toolbar')));
    check('the note let go is not written into the page as its title', !(await win.evaluate(() => document.querySelector('.split-ghost')?.innerText.includes('two'))) && s.editorText === 'words of two', JSON.stringify(s));
    check('beside a Nebula Wide page an A4 note comes in Nebula Wide', s.editorPage === 'nw' && s.pages.join() === 'NW,NW', JSON.stringify(s));
    check('only shown: its own page is still A4 on the disk', saved('two').page === 'a4', String(saved('two').page));
    check('the other pane shows its note as saved', s.ghosts.join() === 'words of one', JSON.stringify(s.ghosts));

    // Writing in one pane, then a press on the other: the editor goes there.
    await win.evaluate(() => { const e = document.getElementById('editor'); e.focus(); const r = document.createRange(); r.selectNodeContents(e.lastElementChild); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.type(' typed in two');
    const ghostAt = await win.evaluate(() => { const r = document.querySelector('.split-pane:not(.active) .split-ghost p').getBoundingClientRect(); return [r.right - 2, r.top + r.height / 2]; });
    await win.mouse.click(ghostAt[0], ghostAt[1]);
    await win.waitForTimeout(400);
    s = await state();
    check('a press on the other pane writes there: the editor and the title box move to it', s.active === 'one' && s.titleInHead && s.heads.join() === 'one,two' && s.editorText === 'words of one', JSON.stringify(s));
    check('and what was typed in the first stays in it, shown beside', s.ghosts.join() === 'words of two typed in two', JSON.stringify(s.ghosts));
    await win.keyboard.type(' and one');
    await win.waitForTimeout(1500);
    check('the caret is where the press was, and each note is saved on its own', saved('one').content.includes('words of one and one') && saved('two').content.includes('typed in two') && !saved('one').content.includes('typed in two'), `${saved('one').content} | ${saved('two').content}`);

    // A third, let go at the left of the first pane.
    await drop('three', '.split-pane[data-note="one"]', 0.2);
    s = await state();
    check('a third note let go at the left of the first pane: three panes in that order, the screen in thirds',
      s.panes.join() === 'three,one,two' && Math.max(...s.widths) - Math.min(...s.widths) <= 2, JSON.stringify(s));

    // The note menu says it too, up to four.
    await win.evaluate(() => document.querySelector('#note-list .note-row[title="four"]').closest('.note-item').querySelector('.nr-more').click());
    const beside = await win.evaluate(() => { const b = document.querySelector('#note-menu [data-note-act="beside"]'); return b.hidden ? null : b.textContent; });
    check('a note\'s menu offers “Open side by side”', beside === 'Open side by side', String(beside));
    await win.evaluate(() => document.querySelector('#note-menu [data-note-act="beside"]').click());
    await win.waitForTimeout(400);
    s = await state();
    check('and opens it beside, at the right: four panes', s.panes.join() === 'three,one,two,four' && s.active === 'four', JSON.stringify(s));
    await win.evaluate(() => document.querySelector('#note-list .note-row[title="five"]').closest('.note-item').querySelector('.nr-more').click());
    check('four is the most: a fifth is not offered', await win.evaluate(() => document.querySelector('#note-menu [data-note-act="beside"]').hidden));
    await win.keyboard.press('Escape');

    // A note opened from the list takes the place of the one being written in.
    await openNote('five');
    await win.waitForTimeout(400);
    s = await state();
    check('a note opened from the list takes the place of the pane written in', s.panes.join() === 'three,one,two,five' && s.active === 'five' && s.editorText === 'words of five', JSON.stringify(s));

    // Closing: down to one, and the page as it was.
    for (const id of ['three', 'one', 'five']) {
      await win.evaluate((n) => document.querySelector(`.split-pane[data-note="${n}"] .split-close`).click(), id);
      await win.waitForTimeout(300);
    }
    s = await state();
    const back = await win.evaluate(() => ({ title: document.querySelector('header.page-head > #title') ? document.getElementById('title').value : null, frame: document.getElementById('editor-frame').parentElement.id }));
    check('closed down to one, the page is whole again: no panes, the title back in the header, the frame in its place',
      !s.on && s.panes.length === 0 && back.title === 'two' && back.frame === 'edit-shell', JSON.stringify({ s, back }));
    check('and the note left is in its own page again: A4', s.editorPage === 'a4', s.editorPage);
    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  let failed = 0;
  await runSplitChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`\n${count - failed}/${count} split view checks passed`);
  process.exit(failed ? 1 : 0);
}
