/**
 * 1.0.4 — tabs over the note (the owner: "notlarin üstünde sekmeler olmasi
 * gerekiyor tam not basliginin altindaki cizgi ile birlesik sekmeler, soldan
 * notu sürükleyip sekme ekleyebilecegiz, o sekmeleri alip ana alana sürükleyip
 * birden fazla ekran acabilecegiz, yukardaki sekmeler ama o sürüklemeyle yok
 * olmayacak sadece acilacak … @ yapinca oldugum notu mentionlayamiyorum …
 * mentiona mouse ile tiklayinca yukarda yeni sekme acilacak"). The real app on
 * a throwaway profile, rows and tabs dragged with the mouse.
 *
 *   node tests/e2e/note-tabs.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runNoteTabChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-tabs-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const write = (id, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`), JSON.stringify({ id, title: id, content: `<p>words of ${id}</p>`, createdAt: 1, updatedAt: 1, ...extra }));
  const chip = (id) => `<a class="note-mention" data-note="${id}" contenteditable="false">@${id}</a>`;
  write('one', { updatedAt: 9, content: `<p>see ${chip('three')} and ${chip('four')} here</p>` });
  write('two', { updatedAt: 8 });
  write('three', { updatedAt: 7 });
  write('four', { updatedAt: 6 });
  write('five', { updatedAt: 5 });
  let app;
  const errors = [];
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.on('pageerror', (e) => errors.push(String(e)));
    win.setDefaultTimeout(10_000);
    const ready = async () => {
      await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
      await win.waitForTimeout(600);
      await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    };
    await ready();
    const openNote = async (title) => { await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title); await win.waitForTimeout(300); };
    const row = (title) => `#note-list .note-row[title="${title}"]`;
    const tab = (id) => `#note-tabs .note-tab[data-note="${id}"]`;
    const rect = (sel) => win.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; }, sel);
    const state = () => win.evaluate(() => {
      const strip = document.getElementById('note-tabs');
      const mark = (t) => `${t.dataset.note}${t.classList.contains('active') ? '*' : ''}${t.classList.contains('beside') ? '|' : ''}`;
      return {
        hidden: strip.hidden,
        tabs: [...strip.querySelectorAll('.note-tab')].map(mark).join(' '),
        lit: [...strip.querySelectorAll('.note-tab.lit')].map((t) => t.dataset.note).join(' '),
        title: document.getElementById('title').value,
        panes: [...document.querySelectorAll('.split-row > .split-pane')].map((p) => p.dataset.note).join(' '),
        saved: localStorage.getItem('nebula:tabs'),
      };
    });
    // A hand's drag, in steps; the line of tabs is only there once a note is in the air.
    const drag = async (fromSel, fx0, toSel, fx, mid = null) => {
      const from = await rect(fromSel);
      await win.mouse.move(from.x + from.w * fx0, from.y + from.h / 2);
      await win.mouse.down();
      await win.mouse.move(from.x + from.w * fx0 + 12, from.y + from.h / 2 + 4, { steps: 4 });
      await win.mouse.move(from.x + from.w * fx0 + 30, from.y + from.h / 2 + 8, { steps: 4 });
      await win.waitForFunction((s) => document.querySelector(s)?.getBoundingClientRect().width > 0, toSel, { polling: 50, timeout: 3000 }).catch(() => {});
      const box = await rect(toSel);
      await win.mouse.move(box.x + box.w * fx, box.y + box.h / 2, { steps: 12 });
      await win.mouse.move(box.x + box.w * fx + 3, box.y + box.h / 2 + 1, { steps: 3 });
      await win.waitForTimeout(200);
      const seen = mid ? await mid() : null;
      await win.mouse.up();
      await win.waitForTimeout(400);
      return seen;
    };

    await openNote('one');
    let s = await state();
    check('one note open: no line of tabs, and the page where it always was', s.hidden && s.tabs === '' && s.saved === null, JSON.stringify(s));
    const toolbarY = (await rect('.toolbar')).y;

    // A row of the list, let go on the line.
    const offer = await drag(row('three'), 0.5, '#note-tabs', 0.3, () => win.evaluate(() => { const st = document.getElementById('note-tabs'); const g = st.querySelector('.note-tab-ghost'); return { hidden: st.hidden, offer: st.classList.contains('note-tabs--offer'), hint: st.dataset.hint, ghost: g?.textContent, words: getComputedStyle(st, '::before').display, left: g ? Math.round(g.getBoundingClientRect().left - st.getBoundingClientRect().left) : null }; }));
    check('a note in the air: the bare line says a tab can be kept there', !offer.hidden && offer.offer && offer.hint === 'Drop a note here to keep it as a tab', JSON.stringify(offer));
    check('over the bare line the note is shown as the tab it would be, at the start, in place of the words', offer.ghost === 'three' && offer.words === 'none' && offer.left === 28, JSON.stringify(offer));
    s = await state();
    check('a row let go on the line is a tab, the note written in a tab beside it, and the page did not go to it',
      s.tabs === 'three one*' && s.title === 'one' && s.lit === 'three' && s.saved === '["three","one"]', JSON.stringify(s));
    const head = await win.evaluate(() => { const st = document.getElementById('note-tabs').getBoundingClientRect(); const a = document.querySelector('.note-tab.active').getBoundingClientRect(); const h = document.querySelector('header.page-head').getBoundingClientRect(); return { gap: Math.round(st.top - h.bottom), foot: Math.round(st.bottom - a.bottom), line: getComputedStyle(document.querySelector('header.page-head')).borderBottomColor }; });
    check('the tabs stand on the line under the title: no gap to the header, the tab written in down to the line', head.gap === 0 && head.foot === 0, JSON.stringify(head));

    // A mention clicked.
    await win.click('#editor a.note-mention[data-note="four"]');
    await win.waitForTimeout(250);
    s = await state();
    check('a mention clicked comes as a tab after the one written in, lit, and the page stays', s.tabs === 'three one* four' && s.title === 'one' && s.lit.includes('four'), JSON.stringify(s));
    await win.click('#editor a.note-mention[data-note="four"]');
    await win.waitForTimeout(250);
    s = await state();
    check('clicked again it is not there twice', s.tabs === 'three one* four' && s.title === 'one', JSON.stringify(s));

    // A row let go between two tabs, shown there as the tab it will be (the owner: not a line, a preview of the tab).
    const onLine = () => win.evaluate(() => {
      const st = document.getElementById('note-tabs');
      const g = st.querySelector('.note-tab-ghost');
      const box = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), b: Math.round(r.bottom) }; };
      return {
        line: [...st.children].map((el) => (el === g ? `(${g.textContent})` : el.dataset.note)).join(' '),
        ghost: g ? box(g) : null,
        next: g?.nextElementSibling ? box(g.nextElementSibling) : null,
        foot: Math.round(st.getBoundingClientRect().bottom),
        moving: [...st.querySelectorAll('.note-tab.moving')].map((t) => t.dataset.note).join(' '),
        away: [...st.querySelectorAll('.note-tab')].filter((t) => t.getBoundingClientRect().width < 1).map((t) => t.dataset.note).join(' '),
      };
    });
    const pre = await drag(row('two'), 0.5, tab('one'), 0.1, onLine);
    check('over the tabs the note is shown as a tab where it will come, the tabs after it standing aside',
      pre.line === 'three (two) one four' && pre.ghost.w >= 84 && Math.abs(pre.next.l - pre.ghost.r - 3) <= 1 && pre.ghost.b === pre.foot, JSON.stringify(pre));
    s = await state();
    check('and it comes there', s.tabs === 'three two one* four' && s.title === 'one', JSON.stringify(s));
    const left = await onLine();
    check('let go, the preview is gone', left.ghost === null && left.line === 'three two one four', JSON.stringify(left));

    // A click on a tab.
    await win.click(tab('two'));
    await win.waitForTimeout(350);
    s = await state();
    const text = await win.evaluate(() => document.getElementById('editor').innerText.trim());
    check('a click on a tab opens its note', s.tabs === 'three two* one four' && s.title === 'two' && text === 'words of two', JSON.stringify({ s, text }));
    await win.click(tab('one'));
    await win.waitForTimeout(350);

    // A tab moved along the line.
    const moved = await drag(tab('three'), 0.3, tab('four'), 0.9, onLine);
    check('a tab in the air is shown where it will come, and gives its room on the line to that', moved.line === 'three two one four (three)' && moved.moving === 'three' && moved.away === 'three', JSON.stringify(moved));
    s = await state();
    check('a tab dragged along the line is moved, not added', s.tabs === 'two one* four three' && s.saved === '["two","one","four","three"]', JSON.stringify(s));
    const still = await onLine();
    check('and nothing of the drag is left on the line', still.ghost === null && still.moving === '', JSON.stringify(still));

    // A tab dragged onto the page.
    await drag(tab('four'), 0.3, '#editor-frame', 0.85);
    s = await state();
    check('a tab dragged onto the page opens beside it there, and stays a tab', s.panes === 'one four' && s.tabs === 'two one| four* three', JSON.stringify(s));

    // Ctrl+Tab.
    await win.keyboard.press('Control+Tab');
    await win.waitForTimeout(400);
    s = await state();
    check('Ctrl+Tab goes to the next tab', s.tabs === 'two one| four| three*' || s.title === 'three', JSON.stringify(s));
    await win.keyboard.press('Control+Shift+Tab');
    await win.waitForTimeout(400);
    s = await state();
    check('Ctrl+Shift+Tab to the one before', s.title === 'four', JSON.stringify(s));

    // A tab let go takes its pane with it.
    await win.click(`${tab('one')} .nt-close`);
    await win.waitForTimeout(400);
    s = await state();
    check('the ✕ of a tab shown beside closes its pane too, and the note is still in the list',
      s.tabs === 'two four* three' && s.panes === '' && await win.evaluate(() => !!document.querySelector('#note-list .note-row[title="one"]')), JSON.stringify(s));

    // A note opened from the list takes the tab written in.
    await openNote('five');
    s = await state();
    check('a note opened from the list takes the tab written in', s.tabs === 'two five* three' && s.title === 'five', JSON.stringify(s));

    // Ctrl+click on a mention goes there.
    await openNote('one');
    await win.click('#editor a.note-mention[data-note="three"]', { modifiers: ['Control'] });
    await win.waitForTimeout(400);
    s = await state();
    check('Ctrl+click on a mention goes straight to the note', s.title === 'three' && s.tabs === 'two one three*', JSON.stringify(s));

    // @ offers the note being written in.
    await win.click('#editor');
    await win.keyboard.press('Control+End');
    await win.keyboard.type(' @thr');
    await win.waitForTimeout(400);
    const offered = await win.evaluate(() => [...document.querySelectorAll('.mention-menu button')].map((b) => b.textContent.trim()));
    check('@ offers the note being written in', offered.includes('@three'), JSON.stringify(offered));
    await win.keyboard.press('Enter');
    await win.waitForTimeout(300);
    const own = await win.evaluate(() => [...document.querySelectorAll('#editor a.note-mention')].map((a) => a.dataset.note).join(' '));
    check('and it is written as a mention of itself', own === 'three', own);

    // The note menu.
    await win.click(row('four'), { button: 'right' });
    await win.waitForTimeout(300);
    const shown = await win.evaluate(() => { const b = document.querySelector('[data-note-act="tab"]'); return !!b && !b.hidden && !!b.offsetParent; });
    check('the note menu offers "Open in a tab" for a note that has none', shown);
    await win.evaluate(() => document.querySelector('[data-note-act="tab"]').click());
    await win.waitForTimeout(300);
    s = await state();
    check('and it comes as a tab without the page going to it', s.tabs === 'two one three* four' && s.title === 'three', JSON.stringify(s));

    // The wheel pressed, and down to one.
    await win.click(tab('four'), { button: 'middle' });
    await win.waitForTimeout(300);
    s = await state();
    check('the wheel pressed on a tab lets it go', s.tabs === 'two one three*', JSON.stringify(s));

    // Closed and opened again.
    await win.waitForTimeout(900);
    await win.reload();
    await ready();
    s = await state();
    check('the tabs are there again when the app opens', s.tabs.replace('*', '').split(' ').sort().join(' ') === 'one three two' && !s.hidden, JSON.stringify(s));

    for (const id of ['two', 'one']) {
      await win.click(`${tab(id)} .nt-close`);
      await win.waitForTimeout(300);
    }
    s = await state();
    const back = (await rect('.toolbar')).y;
    check('one tab left is none: the line is bare and the page where it was', s.hidden && s.tabs === '' && s.saved === null && Math.abs(back - toolbarY) < 1, JSON.stringify({ s, back, toolbarY }));
    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  let failed = 0;
  await runNoteTabChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`\n${count - failed}/${count} note tab checks passed`);
  process.exit(failed ? 1 : 0);
}
