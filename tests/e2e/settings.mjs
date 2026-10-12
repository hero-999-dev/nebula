/**
 * 0.9.4 — the owner's Ideas note of 2026-10-12, both rounds, in the real app
 * on a throwaway profile: the bar's lines at the side, the font menu's length
 * and its pins, the caret under a divider and a click on empty ground, and
 * Settings beside Help — what a new note starts with, the AI panel and the
 * black holes put away, and the lock on opening (a 6-digit PIN, a passkey
 * beside it, off without being removed).
 *
 *   node tests/e2e/settings.mjs          (after npm run build)
 *
 * The passkey is played by the test (NEBULA_HELLO), since nobody is there to
 * lend a finger. The app is started several times on the same profile: a lock
 * is only met when the app opens.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PIN = '271828';
const KEY = /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/;

export async function runSettingsChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-settings-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`),
    JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1, ...extra }));
  const GREY = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#bbb"/></svg>')}`;
  const fig = `<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" data-ratio="2" style="width: 300px;"><img src="${GREY}" alt="x" draggable="false"><figcaption class="image-caption" data-placeholder="Caption" contenteditable="true">cap</figcaption></figure>`;
  seed('plain', '<p id="pl">the words of the plain note</p>');
  seed('other', '<p id="ot">another note</p>');
  // The owner's snapshot: a picture and two lines in the left of two columns, a divider put under them.
  seed('cols', `<div class="blk-cols" data-block-type="columns" data-split="45" style="--split: 45%;"><div class="blk-col">${fig}<p id="g">g</p><p id="d">d</p></div><hr class="blk-vr"><div class="blk-col"><p id="r">right</p></div></div><p id="after">after</p>`);
  seed('flat', `${fig}<p id="g">g</p><p id="d">d</p>`);
  // A short column that ends in a divider, beside a long one; and a note that ends in one.
  seed('colhr', `<div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col">${'<p>left line</p>'.repeat(9)}</div><hr class="blk-vr"><div class="blk-col"><p id="rr">right</p><hr class="blk-hr"></div></div><p id="under">under the columns</p>`);
  seed('endhr', '<p id="e1">a line</p><hr class="blk-hr">');
  seed('mid', '<p id="m1">above</p><hr class="blk-hr"><p id="m2">below words</p>');
  const lockFile = path.join(profile, 'app-lock.json');
  // The logo: kept in the profile; a shortcut that starts this very program stands in a folder of the test's own.
  const logoDir = path.join(profile, 'logo');
  const shortcuts = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-shortcuts-'));
  const shortcut = path.join(shortcuts, 'Desk', 'Nebula here.lnk');
  fs.mkdirSync(path.dirname(shortcut), { recursive: true });
  const logoKept = () => { try { return JSON.parse(fs.readFileSync(path.join(logoDir, 'logo.json'), 'utf8')); } catch { return null; } };
  const icoFiles = () => (fs.existsSync(logoDir) ? fs.readdirSync(logoDir).filter((f) => f.endsWith('.ico')) : []);
  const kept = () => (fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : null);
  const errors = [];
  let app = null;
  let win = null;

  async function start(env = {}) {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile, NEBULA_HELLO: 'none', NEBULA_SHORTCUT_DIRS: shortcuts, ...env } });
    win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    win.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 760));
  }
  const stop = async () => { try { await app?.close(); } catch { /* closed */ } app = null; win = null; };
  const ready = () => win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
  const gate = () => win.waitForSelector('#app-lock', { timeout: 20_000 });
  const noteRows = () => win.evaluate(() => document.querySelectorAll('.note-row').length);
  const openNote = async (title) => {
    await win.evaluate((name) => [...document.querySelectorAll('.note-row')].find((r) => r.querySelector('.nr-title').textContent.trim() === name).click(), title);
    await win.waitForFunction((name) => document.getElementById('title').value === name, title, { polling: 50 });
    await win.waitForTimeout(150);
  };
  const openSettings = async () => {
    await win.click('#app-menu [data-cmd="settings.open"]');
    await win.waitForFunction(() => !document.getElementById('ov-settings').hidden, null, { polling: 50 });
  };
  const closeSettings = async () => {
    await win.click('#settings-close');
    await win.waitForFunction(() => document.getElementById('ov-settings').hidden, null, { polling: 50 });
  };
  const lockState = () => win.evaluate(() => document.querySelector('#set-lock .set-state')?.textContent ?? '');
  const lockButtons = () => win.evaluate(() => [...document.querySelectorAll('#set-lock [data-lock]')].map((b) => `${b.dataset.lock}${b.disabled ? '(off)' : ''}`).join(','));
  const lockSays = (words) => win.waitForFunction((want) => document.querySelector('#set-lock .set-state')?.textContent === want, words, { polling: 50, timeout: 10_000 }).catch(() => {});
  const dialogShut = () => win.waitForFunction(() => document.getElementById('ov-app-lock').hidden, null, { polling: 50, timeout: 10_000 });
  const dialogError = () => win.evaluate(() => document.querySelector('#ov-app-lock .hole-error')?.textContent ?? '');
  const typePin = async (selector, pin) => { await win.click(selector); await win.keyboard.type(pin, { delay: 15 }); };
  /** A note's file, as it is on the disk. */
  const noteOnDisk = (title) => {
    for (const id of fs.readdirSync(notes)) {
      const file = path.join(notes, id, `${id}.json`);
      if (!fs.existsSync(file)) continue;
      const note = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (note.title === title) return note;
    }
    return null;
  };
  /** Where the caret is: the line it stands in, and whether it stands on no line at all. */
  const caret = () => win.evaluate(() => {
    const s = getSelection();
    const n = s.anchorNode;
    const host = n?.nodeType === 1 ? n : n?.parentElement;
    const line = host?.closest('p, li, h1, h2, h3, div:not([class])');
    const flowOf = (el) => el?.closest('.blk-col') ?? document.getElementById('editor');
    return {
      line: line ? (line.id || `${line.tagName.toLowerCase()}:${line.textContent}`) : null,
      offset: s.anchorOffset,
      text: n?.nodeType === 3,
      // On the note or on a column itself: on no line.
      bare: !!n && (n.id === 'editor' || (n.nodeType === 1 && n.classList.contains('blk-col'))),
      column: line ? [...document.querySelectorAll('#editor .blk-col')].indexOf(flowOf(line)) : -1,
      afterHr: line?.previousElementSibling?.matches('hr.blk-hr') ?? false,
      armed: document.querySelectorAll('#editor hr.armed').length,
      hrs: document.querySelectorAll('#editor hr.blk-hr').length,
    };
  });

  try {
    await start();
    await ready();
    // What's new opens over a vault that is not new: put away, once.
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => { if (!document.getElementById('ov-whats-new').hidden) document.getElementById('whats-new-close').click(); });

    // ---- The bar at a side: its lines ------------------------------------------
    await win.click('[data-pad="right"]');
    const seps = await win.evaluate(() => [...document.querySelectorAll('#toolbar .tb-row')].map((row) => {
      const inner = row.clientWidth - parseFloat(getComputedStyle(row).paddingLeft) - parseFloat(getComputedStyle(row).paddingRight);
      return [...row.querySelectorAll('.tb-sep')].map((s) => ({ w: s.getBoundingClientRect().width, h: s.getBoundingClientRect().height, inner }));
    }).flat());
    check('with the bar at the right, the lines between its groups run the width of their column', seps.length >= 6 && seps.every((s) => s.w >= 30 && Math.abs(s.w - s.inner) <= 1 && s.h <= 1.5), JSON.stringify(seps.slice(0, 3)));
    // "The divider line at the right does not reach the two icons at the bottom."
    const between = () => win.evaluate(() => {
      const [first, second] = [...document.querySelectorAll('#toolbar .tb-row')];
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      const lowest = Math.max(...[...document.querySelectorAll('#toolbar .tb-row > *')].map((el) => el.getBoundingClientRect().bottom));
      return {
        drawnByFirst: getComputedStyle(first).borderRightWidth, drawnBySecond: getComputedStyle(second).borderLeftWidth,
        together: Math.abs(a.right - (b.left + 1)) <= 0.6,
        to: Math.max(a.bottom, b.bottom), lowest, heights: [Math.round(a.height), Math.round(b.height)],
      };
    });
    const lineRight = await between();
    check('and the line between its two columns is as long as the longer column: down past the last icon', lineRight.drawnByFirst === '1px' && lineRight.drawnBySecond === '1px' && lineRight.together && lineRight.to >= lineRight.lowest - 0.5 && lineRight.heights[0] !== lineRight.heights[1], JSON.stringify(lineRight));
    await win.click('[data-pad="left"]');
    const sepsLeft = await win.evaluate(() => [...document.querySelectorAll('#toolbar .tb-sep')].map((s) => s.getBoundingClientRect().width));
    const lineLeft = await between();
    check('the same at the left', sepsLeft.every((w) => w >= 30) && lineLeft.together && lineLeft.to >= lineLeft.lowest - 0.5, `${sepsLeft.join(',')} ${JSON.stringify(lineLeft)}`);

    // ---- The font menu: as long as its fonts ------------------------------------
    await openNote('plain');
    const openFonts = async () => {
      await win.evaluate(() => { if (document.getElementById('menu-font').hidden) document.querySelector('[data-menu="menu-font"]').click(); });
      await win.waitForFunction(() => !document.getElementById('menu-font').hidden, null, { polling: 50 });
    };
    const fonts = () => win.evaluate(() => {
      const menu = document.getElementById('menu-font');
      const rows = document.getElementById('font-rows');
      const buttons = [...rows.querySelectorAll(':scope > button')];
      const m = menu.getBoundingClientRect();
      const last = buttons.at(-1).getBoundingClientRect();
      const r = rows.getBoundingClientRect();
      return {
        labels: buttons.map((b) => b.querySelector('.label').textContent),
        pinned: buttons.filter((b) => b.querySelector('.tb-menu__pin')?.getAttribute('aria-pressed') === 'true').map((b) => b.querySelector('.label').textContent),
        pins: buttons.filter((b) => b.querySelector('.tb-menu__pin')).length,
        seen: buttons.filter((b) => Number(getComputedStyle(b.querySelector('.tb-menu__pin')).opacity) > 0).map((b) => b.querySelector('.label').textContent),
        scrolls: rows.scrollHeight > rows.clientHeight + 1,
        lastSeen: last.bottom <= r.bottom + 1 && last.top >= r.top - 1,
        inside: m.top >= 0 && m.bottom <= window.innerHeight && m.left >= 0 && m.right <= window.innerWidth,
        rule: !!rows.querySelector('.tb-menu__rule'),
        open: !menu.hidden,
      };
    });
    for (const side of ['left', 'right', 'top']) {
      if (side !== 'left') await win.click(`[data-pad="${side}"]`);
      await openFonts();
      const f = await fonts();
      check(`the font menu shows every font of the app without scrolling, Cascadia Code too — bar at the ${side}`, f.labels.length === 15 && f.labels.at(-1) === 'Cascadia Code' && !f.scrolls && f.lastSeen && f.inside, JSON.stringify({ ...f, labels: f.labels.length }));
      await win.keyboard.press('Escape');
    }

    // ---- Pins: at the font's side when the pointer is on it --------------------
    await openFonts();
    await win.mouse.move(5, 5);
    await win.waitForTimeout(150);
    const before = await fonts();
    check('the serif is "Serif", no longer "Serif (default)"; every font has a pin and none is pinned', before.labels[0] === 'Serif' && before.pins === 15 && before.pinned.length === 0 && !before.rule, before.labels[0]);
    check('no pin is drawn while the pointer is elsewhere', before.seen.length === 0, before.seen.join('|'));
    const rowOf = (label) => `#font-rows > button:has(.label:text-is("${label}"))`;
    await win.hover(rowOf('Consolas'));
    await win.waitForTimeout(150);
    const hovered = await fonts();
    check('with the pointer on a font, its pin comes up at its side — its alone', hovered.seen.join('|') === 'Consolas', hovered.seen.join('|'));
    await win.click(`${rowOf('Consolas')} .tb-menu__pin`);
    await win.click(`${rowOf('Georgia')} .tb-menu__pin`);
    await win.mouse.move(5, 5);
    await win.waitForTimeout(150);
    const pinned = await fonts();
    check('a pinned font stands at the top, in the order pinned, a thin line under the pinned ones', pinned.labels.slice(0, 3).join('|') === 'Consolas|Georgia|Serif' && pinned.pinned.join('|') === 'Consolas|Georgia' && pinned.rule && pinned.labels.length === 15, pinned.labels.slice(0, 4).join('|'));
    check('a pinned font keeps its pin drawn, pointer or not', pinned.seen.join('|') === 'Consolas|Georgia', pinned.seen.join('|'));
    check('pressing a pin picks no font and leaves the menu open', pinned.open && await win.evaluate(() => !document.querySelector('#editor [style*="font-family"]')));
    await win.keyboard.press('Escape');
    await openFonts();
    const again = await fonts();
    check('the pins are still there when the menu is opened again', again.labels.slice(0, 2).join('|') === 'Consolas|Georgia');
    await win.fill('#font-search', 'geo');
    const found = await fonts();
    check('and a search finds a pinned font as any other', found.labels.join('|') === 'Georgia' && found.pinned.join('|') === 'Georgia', found.labels.join('|'));
    await win.fill('#font-search', '');
    await win.click(`${rowOf('Consolas')} .tb-menu__pin`);
    const unpinned = await fonts();
    check('a second press takes a font down to its place again', unpinned.labels.slice(0, 2).join('|') === 'Georgia|Serif' && unpinned.labels.indexOf('Consolas') === 13, unpinned.labels.join('|'));
    await win.click(`${rowOf('Georgia')} .tb-menu__pin`);
    await win.keyboard.press('Escape');

    // ---- "A bug again: the caret under the divider" -----------------------------
    for (const [name, where] of [['cols', 'in a column'], ['flat', 'on the note']]) {
      await openNote(name);
      const d = await win.evaluate(() => { const r = document.getElementById('d').getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height / 2 }; });
      await win.mouse.click(d.x, d.y);
      await win.keyboard.press('End');
      await win.click('#toolbar [data-act="divider"]');
      await win.waitForTimeout(200);
      const made = await caret();
      check(`a divider put under a line ${where}: the caret is on the new line under it, at its start`, made.afterHr && made.offset === 0 && !made.bare && made.hrs === 1 && made.armed === 0, JSON.stringify(made));
      await win.keyboard.press('Backspace');
      await win.waitForTimeout(200);
      const first = await caret();
      check(`Backspace there — the last line ${where} — keeps the line and offers the divider; the caret stays on a line`, first.afterHr && !first.bare && first.hrs === 1 && first.armed === 1, JSON.stringify(first));
      await win.keyboard.press('Backspace');
      await win.waitForTimeout(200);
      const second = await caret();
      check('the next Backspace takes the divider, and the caret goes to the end of the line above', second.hrs === 0 && second.line === 'd' && second.text && second.offset === 1 && !second.bare, JSON.stringify(second));
      await win.keyboard.type('!');
      check('what is typed then is written there', await win.evaluate(() => document.getElementById('d').textContent === 'd!'));
    }

    // ---- "When I click where I want, the caret should be there" ------------------
    await openNote('cols');
    const foot = await win.evaluate(() => { const c = document.querySelectorAll('#editor .blk-col')[1].getBoundingClientRect(); const r = document.getElementById('r').getBoundingClientRect(); return { x: c.left + 80, y: c.bottom - 8, room: c.bottom - r.bottom }; });
    await win.mouse.click(foot.x, foot.y);
    await win.waitForTimeout(150);
    const atFoot = await caret();
    check('a click on the empty ground at the foot of a column goes to that column’s own last line — not to the line under the columns', foot.room > 60 && atFoot.line === 'r' && atFoot.column === 1 && atFoot.offset === 5, JSON.stringify({ foot, atFoot }));
    await win.keyboard.type(' here');
    check('and what is typed is written there', await win.evaluate(() => document.getElementById('r').textContent === 'right here' && document.getElementById('after').textContent === 'after'));

    await openNote('colhr');
    const underHr = await win.evaluate(() => { const h = document.querySelector('#editor .blk-col hr.blk-hr').getBoundingClientRect(); const c = h && document.querySelectorAll('#editor .blk-col')[1].getBoundingClientRect(); return { x: h.left + 60, y: h.bottom + 30, room: c.bottom - h.bottom }; });
    await win.mouse.click(underHr.x, underHr.y);
    await win.waitForTimeout(200);
    const inCol = await caret();
    check('under a divider that ends a column there was no line: a click there makes one, the caret in it', underHr.room > 40 && inCol.afterHr && inCol.column === 1 && !inCol.bare && inCol.offset === 0, JSON.stringify({ underHr, inCol }));
    await win.keyboard.type('made here');
    check('and it is written in', await win.evaluate(() => { const col = document.querySelectorAll('#editor .blk-col')[1]; return col.lastElementChild.textContent === 'made here' && document.getElementById('under').textContent === 'under the columns'; }));

    await openNote('endhr');
    const endHr = await win.evaluate(() => { const h = document.querySelector('#editor hr.blk-hr').getBoundingClientRect(); return { x: h.left + 60, y: h.bottom + 40 }; });
    await win.mouse.click(endHr.x, endHr.y);
    await win.waitForTimeout(200);
    const atEnd = await caret();
    check('the same under a divider that ends the note', atEnd.afterHr && !atEnd.bare && atEnd.offset === 0 && await win.evaluate(() => document.getElementById('editor').lastElementChild.tagName === 'P'), JSON.stringify(atEnd));

    // A divider is picked by a click on it or a few pixels from it; past that strip the ground is the note's.
    await openNote('mid');
    const gaps = await win.evaluate(() => { const h = document.querySelector('#editor hr.blk-hr').getBoundingClientRect(); return { x: h.left + 3, under: h.bottom + 11.5, over: h.top - 11.5, on: h.top + 4 }; });
    await win.mouse.click(gaps.x, gaps.under);
    await win.waitForTimeout(150);
    const below = await caret();
    await win.mouse.click(gaps.x + 400, gaps.over);
    await win.waitForTimeout(150);
    const above = await caret();
    check('a click on the ground right under a divider goes to the start of the line under it, right over it to the end of the line above', below.line === 'm2' && below.offset === 0 && below.armed === 0 && above.line === 'm1' && above.offset === 5 && above.armed === 0, JSON.stringify({ gaps, below, above }));
    await win.mouse.click(gaps.x + 200, gaps.on);
    await win.waitForTimeout(150);
    check('and a click on the divider itself still picks it', (await caret()).armed === 1);
    await win.keyboard.press('Escape');

    // ---- Settings, beside Help -------------------------------------------------
    const titles = await win.evaluate(() => [...document.querySelectorAll('#app-menu .am-title')].map((b) => ({ text: b.textContent, left: b.getBoundingClientRect().left, top: b.getBoundingClientRect().top })));
    check('Settings stands in the title strip, right after Help', titles.map((x) => x.text).join(',') === 'File,Edit,View,Window,Help,Settings' && titles[5].left > titles[4].left && Math.abs(titles[5].top - titles[4].top) < 1, JSON.stringify(titles.slice(-2)));
    await openSettings();
    const sheet = await win.evaluate(() => {
      const modal = document.querySelector('#ov-settings .modal').getBoundingClientRect();
      return {
        heads: [...document.querySelectorAll('#settings-body .set-head')].map((h) => h.textContent),
        font: document.getElementById('set-font').value, size: document.getElementById('set-size').value, page: document.getElementById('set-page').value,
        ownFont: document.getElementById('set-font').options[0].textContent, ownSize: document.getElementById('set-size').options[0].textContent,
        base: Math.round(parseFloat(getComputedStyle(document.getElementById('editor')).fontSize)),
        ai: document.getElementById('set-hide-ai').checked, holes: document.getElementById('set-hide-holes').checked,
        fonts: document.getElementById('set-font').options.length, pages: [...document.getElementById('set-page').options].map((o) => o.value).join(','),
        inside: modal.top >= 0 && modal.bottom <= window.innerHeight,
        menus: document.querySelectorAll('#app-menu .am-menu:not([hidden])').length,
      };
    });
    check('a press opens the sheet: new notes, show and hide, the lock on opening, the logo — nothing chosen yet', sheet.heads.join('|') === 'New notes|Show and hide|Lock on opening|Logo' && sheet.font === '' && sheet.size === '' && sheet.page === 'nw' && !sheet.ai && !sheet.holes && sheet.inside && sheet.menus === 0, JSON.stringify(sheet));
    check('"Nebula’s own" says in brackets what it is: the serif, and the size a note is really written in', sheet.ownFont === 'Nebula’s own (Serif)' && sheet.ownSize === `Nebula’s own (${sheet.base})` && sheet.base === 14, `${sheet.ownFont} | ${sheet.ownSize} | ${sheet.base}`);
    check('it offers the app’s fonts and every page', sheet.fonts === 15 && sheet.pages === 'nw,a3,a4,a5,nn,b3,b4,b5', `${sheet.fonts} ${sheet.pages}`);
    check('there is no lock, and one button to set one', (await lockState()) === 'Nebula opens without asking.' && (await lockButtons()) === 'set', `${await lockState()} | ${await lockButtons()}`);

    // ---- What a new note starts with -------------------------------------------
    await win.selectOption('#set-font', { label: 'Verdana' });
    await win.selectOption('#set-size', '18');
    await win.selectOption('#set-page', 'a4');
    await win.keyboard.press('Escape');
    check('Escape shuts the sheet', await win.evaluate(() => document.getElementById('ov-settings').hidden));
    await win.click('#btn-new');
    await win.waitForFunction(() => document.getElementById('title').value === 'Untitled', null, { polling: 50 });
    await win.fill('#title', 'Made after');
    await win.click('#editor');
    await win.keyboard.type('new words');
    await win.keyboard.press('Enter');
    await win.keyboard.type('second line');
    await win.keyboard.press('Enter');
    await win.keyboard.press('Enter');
    await win.keyboard.type('after an empty one');
    await win.keyboard.press('Control+S');
    await win.waitForTimeout(700);
    const made = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      // Every run of words, and the font and size it is drawn in.
      const runs = [];
      const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const cs = getComputedStyle(n.parentElement);
        runs.push(`${n.nodeValue}:${cs.fontFamily.split(',')[0].replace(/"/g, '')}:${cs.fontSize}`);
      }
      return { page: ed.dataset.page, paper: 'paper' in ed.dataset, runs, on: document.querySelector('#page-modes button.on')?.dataset.page, title: getComputedStyle(document.getElementById('title')).fontFamily.split(',')[0].replace(/"/g, ''), box: document.querySelector('.tb-font__name').textContent };
    });
    check('a new note is made on the chosen page', made.page === 'a4' && made.paper && made.on === 'a4', JSON.stringify(made));
    check('every line typed in it is in the chosen font and size — the first, the next, one after an empty line', made.runs.join('|') === 'new words:Verdana:18px|second line:Verdana:18px|after an empty one:Verdana:18px', made.runs.join('|'));
    check('its title is written in that font too, and the bar names it', made.title === 'Verdana' && made.box === 'Verdana', `${made.title} | ${made.box}`);
    const keptNote = noteOnDisk('Made after');
    check('the note keeps them as its own: its writing font and its page', keptNote?.font?.family === 'Verdana, Geneva, sans-serif' && keptNote?.font?.size === 18 && keptNote?.page === 'a4', JSON.stringify({ font: keptNote?.font, page: keptNote?.page }));
    await openNote('plain');
    const old = await win.evaluate(() => ({ page: document.getElementById('editor').dataset.page, html: document.getElementById('pl').innerHTML, title: document.getElementById('title').style.fontFamily }));
    check('a note that was there keeps its own page, its words and its title as they were', old.page === 'nw' && old.html === 'the words of the plain note' && old.title === '', JSON.stringify(old));
    await openSettings();
    const remembered = await win.evaluate(() => [document.getElementById('set-font').selectedOptions[0].textContent, document.getElementById('set-size').value, document.getElementById('set-page').value].join('|'));
    check('the sheet shows what was chosen', remembered === 'Verdana|18|a4', remembered);
    await win.selectOption('#set-font', '');
    await win.selectOption('#set-size', '');
    await win.selectOption('#set-page', 'nw');
    await closeSettings();
    await win.click('#btn-new');
    await win.waitForFunction(() => document.getElementById('title').value === 'Untitled', null, { polling: 50 });
    await win.fill('#title', 'Made plain');
    await win.click('#editor');
    await win.keyboard.type('plain words');
    await win.keyboard.press('Control+S');
    await win.waitForTimeout(700);
    const plainMade = noteOnDisk('Made plain');
    check('back at Nebula’s own, a new note has no font and no page of its own', !!plainMade && plainMade.font === undefined && plainMade.page === undefined && /plain words/.test(plainMade.content) && !/font-family/.test(plainMade.content), JSON.stringify({ font: plainMade?.font, page: plainMade?.page, content: plainMade?.content }));

    // ---- Hide the AI panel -----------------------------------------------------
    await openSettings();
    await win.check('#set-hide-ai');
    await closeSettings();
    const noAi = await win.evaluate(() => {
      const hide = document.querySelector('[data-pad="hide"]').getBoundingClientRect();
      const top = document.querySelector('[data-pad="top"]').getBoundingClientRect();
      const bottom = document.querySelector('[data-pad="bottom"]').getBoundingClientRect();
      return { button: getComputedStyle(document.querySelector('[data-pad="ai"]')).display, panel: document.getElementById('ai-panel').hidden, tall: Math.abs(hide.top - top.top) <= 1 && Math.abs(hide.bottom - bottom.bottom) <= 1, shown: [...document.querySelectorAll('#pad button')].filter((b) => b.getBoundingClientRect().width > 0).length };
    });
    check('with the AI panel put away its button is gone from the pad, whose last button fills both rows', noAi.button === 'none' && noAi.panel && noAi.tall && noAi.shown === 5, JSON.stringify(noAi));
    await win.evaluate(() => [...document.querySelectorAll('#app-menu .am-title')].find((b) => b.textContent === 'View').click());
    const viewAi = await win.evaluate(() => { const item = document.querySelector('[data-cmd="view.ai"]'); return { hidden: item.hidden, open: !item.closest('.am-menu').hidden, shown: [...item.closest('.am-menu').querySelectorAll('button')].filter((b) => !b.hidden).length }; });
    check('the View menu no longer offers Toggle AI panel', viewAi.open && viewAi.hidden && viewAi.shown === 8, JSON.stringify(viewAi));
    await win.keyboard.press('Escape');
    await win.keyboard.press('Control+K');
    await win.waitForFunction(() => !document.getElementById('ov-palette').hidden, null, { polling: 50 });
    await win.keyboard.type('AI panel');
    const inPalette = await win.evaluate(() => document.getElementById('palette-list').textContent);
    check('nor does the command palette', !/Toggle AI panel/.test(inPalette), inPalette.slice(0, 80));
    await win.keyboard.press('Escape');
    await win.keyboard.press('Control+K');
    await win.waitForFunction(() => !document.getElementById('ov-palette').hidden, null, { polling: 50 });
    await win.keyboard.type('settings');
    await win.keyboard.press('Enter');
    check('the palette opens Settings by its name', await win.evaluate(() => !document.getElementById('ov-settings').hidden && document.getElementById('set-hide-ai').checked));
    await win.uncheck('#set-hide-ai');
    await closeSettings();
    const aiBack = await win.evaluate(() => ({ button: getComputedStyle(document.querySelector('[data-pad="ai"]')).display !== 'none', panel: document.getElementById('ai-panel').hidden, six: [...document.querySelectorAll('#pad button')].filter((b) => b.getBoundingClientRect().width > 0).length }));
    check('turned off, the AI button is back — the panel still shut until it is pressed', aiBack.button && aiBack.panel && aiBack.six === 6, JSON.stringify(aiBack));

    // ---- Your own theme: Matcha and Contrast, ready — and deletable ---------------
    await win.click('#btn-theme-custom');
    await win.waitForFunction(() => !document.getElementById('theme-editor').hidden, null, { polling: 50 });
    const chips = () => win.evaluate(() => [...document.querySelectorAll('#theme-editor .te-profiles > *')].map((c) => `${c.querySelector('.te-chip__name')?.textContent ?? c.textContent}${c.querySelector('.te-chip__x') ? '×' : ''}${c.classList.contains('on') ? '*' : ''}`).join('|'));
    check('Your own theme comes with two ready profiles, Matcha and Contrast — each with a × like any other', (await chips()) === 'Matcha×|Contrast×', await chips());
    await win.click('#theme-editor .te-chip__name:text-is("Contrast")');
    const worn = await win.evaluate(() => { const css = getComputedStyle(document.documentElement); return ['--paper', '--paper-sunken', '--rule', '--clay', '--ink'].map((v) => css.getPropertyValue(v).trim().toUpperCase()).join(','); });
    check('Contrast is near-black on near-white, the lines and the lit buttons as dark as the words', worn === '#F7F7F7,#F7F7F7,#2B2B2B,#2B2B2B,#2B2B2B' && (await chips()) === 'Matcha×|Contrast×*', `${worn} ${await chips()}`);
    await win.click('#theme-editor .te-chip:has(.te-chip__name:text-is("Contrast")) .te-chip__x');
    await win.click('#theme-editor .te-chip--danger');
    const afterDelete = await chips();
    check('a ready profile can be deleted: it leaves the list, its colours stay worn as "Last edited", and one press brings the ready ones back', afterDelete === 'Matcha×|Last edited*|Bring back the ready profiles', afterDelete);
    await win.click('#theme-editor .te-chip--back');
    check('brought back, Contrast is there again', (await chips()) === 'Matcha×|Contrast×*', await chips());
    await win.click('#theme-pick [data-theme="main"]');
    await win.click('#theme-editor .te-close');

    {
    // ---- The logo, at the foot of Settings ---------------------------------------
    await app.evaluate(({ shell }, file) => shell.writeShortcutLink(file, 'create', { target: process.execPath }), shortcut);
    const linkOf = (file) => app.evaluate(({ shell }, f) => { const l = shell.readShortcutLink(f); return { icon: l.icon ?? '', target: l.target }; }, file);
    const linkIcon = () => linkOf(shortcut);
    await openSettings();
    await win.waitForTimeout(300);
    const logoNow = () => win.evaluate(() => {
      const ed = document.getElementById('logo-editor');
      const big = ed.querySelector('.logo-big');
      const svg = decodeURIComponent(big.src.slice(big.src.indexOf(',') + 1));
      const stops = [...svg.matchAll(/stop-color="(#\w{6})"/g)].map((m) => m[1]);
      const side = ed.querySelector('.logo-side').getBoundingClientRect();
      const tools = ed.querySelector('.logo-tools').getBoundingClientRect();
      return {
        colors: [/<rect[^>]*fill="(#\w{6})"/.exec(svg)?.[1], /<rect[^>]*stroke="(#\w{6})"/.exec(svg)?.[1], stops[0], stops[1], /<path[^>]*fill="(#\w{6})"/.exec(svg)?.[1]].join(','),
        chips: [...ed.querySelectorAll('.logo-themes > .te-chip')].map((c) => `${c.querySelector('.te-chip__name')?.textContent ?? c.textContent}${c.querySelector('.te-chip__x') ? '×' : ''}${c.classList.contains('on') ? '*' : ''}`).join('|'),
        slots: [...ed.querySelectorAll('.te-slot')].map((x) => `${x.querySelector('.te-slot__name').textContent}:${x.querySelector('.te-slot__box').style.background}`).join('|'),
        sizes: [big, ed.querySelector('.logo-mid'), ed.querySelector('.logo-tiny')].map((i) => Math.round(i.getBoundingClientRect().width)).join(','),
        drawn: [big, ed.querySelector('.logo-mid'), ed.querySelector('.logo-tiny')].every((i) => i.complete && i.naturalWidth > 0),
        left: side.right <= tools.left && side.left < tools.left,
        swatches: ed.querySelectorAll('.te-swatch').length,
        below: ed.getBoundingClientRect().top > document.getElementById('set-lock').getBoundingClientRect().bottom,
        kept: JSON.parse(localStorage.getItem('nebula:logo-themes') || '[]').map((x) => `${x.name}:${x.colors.star}`).join('|'),
      };
    });
    const until = async (what, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await what()) return true; await win.waitForTimeout(100); } return !!(await what()); };
    const chip = (name) => `#logo-editor .logo-themes > .te-chip:has-text("${name}")`;
    /** The in-app question for a name: what it offers, and an answer typed into it. */
    const nameAsked = () => win.evaluate(() => (document.getElementById('ov-dialog').hidden ? null : { title: document.getElementById('dlg-title').textContent, value: document.getElementById('dlg-input').value }));
    const answerName = async (name) => { await win.fill('#dlg-input', name); await win.click('#dlg-ok'); await win.waitForTimeout(200); };
    const own = await logoNow();
    check('at the foot of the sheet stands the logo — large, and as small as a taskbar and a title bar draw it — and at its right its colours, laid out as Your own theme is', own.left && own.below && own.sizes === '112,32,16' && own.drawn && own.swatches === 28 && own.slots.split('|').map((x) => x.split(':')[0]).join('|') === 'Background|Border|Moon|Moon’s shade|Star', JSON.stringify(own));
    check('it starts as the logo Nebula comes with — the Main theme’s, lit — with no "Nebula’s own" in an app that is not the test build, and a + after the last theme', own.colors === '#17122A,#2A2145,#C9B6FF,#7C3AED,#996AF4' && own.chips === 'Main*|Dark|Light|White|Matcha|Contrast|+' && !fs.existsSync(logoDir) && own.kept === '', `${own.colors} ${own.chips}`);
    await win.click(chip('Contrast'));
    await until(() => logoKept()?.colors?.bg === '#F7F7F7');
    const contrast = await logoNow();
    check('a ready theme put on it — Contrast: one dark tone on a light tile — is drawn at once, and makes no theme of the logo’s own', contrast.colors === '#F7F7F7,#2B2B2B,#2B2B2B,#2B2B2B,#2B2B2B' && contrast.chips === 'Main|Dark|Light|White|Matcha|Contrast*|+' && contrast.kept === '', `${contrast.colors} ${contrast.chips}`);
    const firstIco = icoFiles()[0];
    const ico = firstIco ? fs.readFileSync(path.join(logoDir, firstIco)) : Buffer.alloc(6);
    const entries = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ({ size: ico.readUInt8(6 + 16 * i) || 256, at: ico.readUInt32LE(6 + 16 * i + 12) }));
    check('and kept: its five colours, a picture, and an icon file that holds it in every size an icon needs — each a real picture of that size', JSON.stringify(logoKept()?.colors) === JSON.stringify({ bg: '#F7F7F7', edge: '#2B2B2B', moon: '#2B2B2B', shade: '#2B2B2B', star: '#2B2B2B' })
      && icoFiles().length === 1 && logoKept().ico === firstIco && entries.map((e) => e.size).join() === '256,64,48,32,24,16'
      && entries.every((e) => ico.subarray(e.at, e.at + 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && ico.readUInt32BE(e.at + 16) === e.size)
      && fs.readFileSync(path.join(logoDir, 'icon.png')).readUInt32BE(16) === 256, `${JSON.stringify(logoKept())} ${icoFiles()} ${JSON.stringify(entries)}`);
    check('the shortcut that starts this program wears it: its icon is that file', await until(async () => (await linkIcon()).icon.toLowerCase() === path.join(logoDir, firstIco ?? 'x').toLowerCase()), JSON.stringify(await linkIcon()));
    // 0.9.5: the taskbar draws a button from the window's app ID, and an installed copy's own ID stands for its Start-menu shortcut.
    const taskbarId = async () => (await win.evaluate(() => window.nebula.logo.get())).taskbar;
    const firstId = await taskbarId();
    check('the window tells the taskbar of it under an app ID that is this logo’s own', firstId === `com.nebula.app.logo.${(firstIco ?? '').slice(5, 17)}`, `${firstId} ${firstIco}`);
    const stripMark = await win.evaluate(() => { const m = document.getElementById('tb-logo'); const probe = document.createElement('i'); probe.style.color = 'var(--clay)'; document.body.append(probe); const clay = getComputedStyle(probe).color; probe.remove(); return { color: getComputedStyle(m).color, clay, picture: !!m.querySelector('img'), svg: !!m.querySelector('svg') }; });
    check('the mark at the top left of the app is not this logo: it stays in the app’s theme', stripMark.svg && !stripMark.picture && stripMark.color === stripMark.clay && stripMark.color !== 'rgb(43, 43, 43)', JSON.stringify(stripMark));

    // A change made to a ready theme is kept as a new theme, the logo's own.
    await win.click('#logo-editor .te-slot[data-slot="star"]');
    await win.fill('#logo-editor .te-hex', '#ff0000');
    await until(() => logoKept()?.colors?.star === '#FF0000');
    const red = await logoNow();
    check('a colour changed on a ready theme makes a new theme of it, named after it — Contrast itself is as it was', red.colors === '#F7F7F7,#2B2B2B,#2B2B2B,#2B2B2B,#FF0000' && red.chips === 'Main|Dark|Light|White|Matcha|Contrast|Contrast 2×*|+' && red.kept === 'Contrast 2:#FF0000'
      && await win.evaluate(() => document.querySelector('#logo-editor .te-slot[data-slot="star"]').classList.contains('on') && document.querySelector('#logo-editor .te-bar__code').textContent === '#FF0000'), `${red.colors} ${red.chips} ${red.kept}`);
    check('another logo is another file — the desktop remembers a picture by its name — and the one before is gone; the shortcut follows', icoFiles().length === 1 && icoFiles()[0] !== firstIco
      && await until(async () => (await linkIcon()).icon.toLowerCase() === path.join(logoDir, icoFiles()[0]).toLowerCase()), `${icoFiles()} ${JSON.stringify(await linkIcon())}`);
    check('and another app ID for the taskbar, which remembers a picture by that', await taskbarId() === `com.nebula.app.logo.${icoFiles()[0].slice(5, 17)}` && await taskbarId() !== firstId, `${await taskbarId()} ${icoFiles()}`);
    await win.click('#logo-editor .te-swatch[data-hex="#58A6FF"]');
    await until(() => logoKept()?.colors?.star === '#58A6FF');
    const blue = await logoNow();
    check('the next change goes into that same theme, not into another new one', blue.colors.endsWith('#58A6FF') && blue.kept === 'Contrast 2:#58A6FF' && blue.chips === 'Main|Dark|Light|White|Matcha|Contrast|Contrast 2×*|+' && icoFiles().length === 1, `${blue.chips} ${blue.kept}`);

    // + : the colours on the logo, kept under a name of one's own.
    await win.click('#logo-editor .logo-add');
    await win.waitForFunction(() => !document.getElementById('ov-dialog').hidden, null, { polling: 50 });
    const offeredName = await nameAsked();
    await answerName('matcha');
    const refusedName = await logoNow();
    await win.click('#logo-editor .logo-add');
    await win.waitForFunction(() => !document.getElementById('ov-dialog').hidden, null, { polling: 50 });
    await answerName('  My   night ');
    const named = await logoNow();
    check('+ asks for a name — offering one — and keeps the colours on the logo as a theme of the logo’s own; a name the editor has already is refused', offeredName?.title === 'Name of the logo theme:' && offeredName.value === 'Contrast 3'
      && refusedName.kept === 'Contrast 2:#58A6FF' && named.kept === 'Contrast 2:#58A6FF|My night:#58A6FF' && named.chips === 'Main|Dark|Light|White|Matcha|Contrast|Contrast 2×|My night×*|+', JSON.stringify({ offeredName, refused: refusedName.kept, named: named.chips }));
    await win.click('#logo-editor .te-slot[data-slot="moon"]');
    await win.fill('#logo-editor .te-hex', '#112233');
    await until(() => logoKept()?.colors?.moon === '#112233');
    const mineChanged = await win.evaluate(() => JSON.parse(localStorage.getItem('nebula:logo-themes')).map((x) => `${x.name}:${x.colors.moon}`).join('|'));
    check('a colour changed on a theme of one’s own changes that theme, and no other', mineChanged === 'Contrast 2:#2B2B2B|My night:#112233', mineChanged);
    await win.dblclick(`${chip('My night')} .te-chip__name`);
    await win.waitForFunction(() => !document.getElementById('ov-dialog').hidden, null, { polling: 50 });
    const renameAsked = await nameAsked();
    await answerName('Night');
    check('a double-click on its name renames it', renameAsked?.value === 'My night' && (await logoNow()).chips === 'Main|Dark|Light|White|Matcha|Contrast|Contrast 2×|Night×*|+', (await logoNow()).chips);
    await win.click(`${chip('Contrast 2')} .te-chip__name`);
    await until(() => logoKept()?.colors?.moon === '#2B2B2B' && logoKept()?.colors?.star === '#58A6FF');
    check('each theme is one press away', (await logoNow()).colors === '#F7F7F7,#2B2B2B,#2B2B2B,#2B2B2B,#58A6FF' && (await logoNow()).chips === 'Main|Dark|Light|White|Matcha|Contrast|Contrast 2×*|Night×|+', (await logoNow()).chips);
    await win.click(`${chip('Night')} .te-chip__x`);
    const askedDelete = await win.evaluate(() => document.querySelector('#logo-editor .te-ask')?.textContent ?? '');
    await win.click('#logo-editor .te-chip--danger');
    check('a theme of the logo’s own is deleted with its ×, after a question', askedDelete === 'Delete the profile Night?' && (await logoNow()).chips === 'Main|Dark|Light|White|Matcha|Contrast|Contrast 2×*|+' && (await logoNow()).kept === 'Contrast 2:#58A6FF', `${askedDelete} ${(await logoNow()).chips}`);

    // For a desktop with the program file itself on it: a shortcut is made, wearing the logo.
    const linksBefore = fs.readdirSync(shortcuts).filter((f) => f.endsWith('.lnk'));
    await win.click('#logo-editor + .set-hint + .logo-shortcut');
    await until(() => fs.readdirSync(shortcuts).filter((f) => f.endsWith('.lnk')).length === linksBefore.length + 1);
    const made = fs.readdirSync(shortcuts).filter((f) => f.endsWith('.lnk') && !linksBefore.includes(f))[0];
    const madeLink = made ? await linkOf(path.join(shortcuts, made)) : null;
    check('“Put a shortcut on the desktop” makes one that starts this program and wears the logo', !!made && madeLink.target.toLowerCase() === (await linkIcon()).target.toLowerCase() && madeLink.icon.toLowerCase() === path.join(logoDir, icoFiles()[0]).toLowerCase(), `${made} ${JSON.stringify(madeLink)}`);
    await closeSettings();
    await openSettings();
    await win.waitForTimeout(300);
    check('the sheet opened again shows the logo as it is worn, its theme lit', (await logoNow()).colors === '#F7F7F7,#2B2B2B,#2B2B2B,#2B2B2B,#58A6FF' && (await logoNow()).chips === 'Main|Dark|Light|White|Matcha|Contrast|Contrast 2×*|+', (await logoNow()).chips);
    await closeSettings();
    }

    // ---- Hide the black holes --------------------------------------------------
    await win.click('#btn-new-hole');
    await win.waitForSelector('#ov-hole:not([hidden]) .hole-name');
    await win.fill('#ov-hole .hole-name', 'Vault');
    await win.fill('#ov-hole [data-pin="new"]', '482193');
    await win.fill('#ov-hole [data-pin="again"]', '482193');
    await win.click('#ov-hole .dlg-actions .btn.primary');
    await win.waitForSelector('#ov-hole .hole-key', { timeout: 15_000 });
    await win.click('#ov-hole .dlg-actions .btn.primary');
    await win.waitForSelector('.holes .hole-block.open');
    await win.click('.holes .hole-add');
    await win.waitForFunction(() => document.getElementById('title').value === 'Untitled', null, { polling: 50 });
    await win.fill('#title', 'Sealed one');
    await win.click('#editor');
    await win.keyboard.type('kept in the dark');
    await win.keyboard.press('Control+S');
    await win.waitForTimeout(500);
    const rowsWithHole = await noteRows();
    await openSettings();
    await win.check('#set-hide-holes');
    await win.waitForFunction(() => !document.querySelector('.holes') && document.getElementById('btn-new-hole').hidden, null, { polling: 50, timeout: 10_000 });
    await closeSettings();
    const holesAway = await win.evaluate(async () => ({
      section: !!document.querySelector('.holes'), button: getComputedStyle(document.getElementById('btn-new-hole')).display,
      rows: document.querySelectorAll('.note-row').length, sealed: [...document.querySelectorAll('.nr-title')].some((x) => x.textContent.includes('Sealed one')),
      title: document.getElementById('title').value, words: document.getElementById('editor').textContent.includes('kept in the dark'),
      open: (await window.nebula.holes.list()).holes.map((h) => h.open).join(','),
    }));
    check('with the black holes put away their section and their button are gone from the list', !holesAway.section && holesAway.button === 'none', JSON.stringify(holesAway));
    check('the open one was locked first: its note left the list and the window', holesAway.rows === rowsWithHole - 1 && !holesAway.sealed && holesAway.title !== 'Sealed one' && !holesAway.words && holesAway.open === 'false', JSON.stringify(holesAway));
    await win.click('.note-row', { button: 'right' });
    await win.waitForSelector('#note-menu:not([hidden])');
    check('and a note’s menu no longer offers a black hole', await win.evaluate(() => document.querySelector('[data-note-act="hole"]').hidden));
    await win.keyboard.press('Escape');
    await win.mouse.click(700, 500);
    await openSettings();
    await win.uncheck('#set-hide-holes');
    await win.waitForSelector('.holes .hole-block');
    await closeSettings();
    const holesBack = await win.evaluate(() => ({ locked: document.querySelector('.hole-lock')?.dataset.state, button: !document.getElementById('btn-new-hole').hidden, name: document.querySelector('.hole-row .fr-name')?.textContent }));
    check('turned off, the black hole is back as it was left: locked, nothing lost', holesBack.locked === 'locked' && holesBack.button && holesBack.name === 'Vault', JSON.stringify(holesBack));

    // ---- A lock on opening: a 6-digit PIN ---------------------------------------
    const setLock = async ({ hint = '', passkey = false } = {}) => {
      await win.click('#set-lock [data-lock="set"]');
      await win.waitForSelector('#ov-app-lock:not([hidden]) [data-pin="new"]');
      await win.fill('#ov-app-lock [data-pin="new"]', PIN);
      await win.fill('#ov-app-lock [data-pin="again"]', PIN);
      if (hint) await win.fill('#ov-app-lock .hole-hint-field', hint);
      if (passkey) {
        await win.waitForFunction(() => !document.getElementById('app-lock-passkey').disabled, null, { polling: 50, timeout: 10_000 });
        await win.check('#app-lock-passkey');
      }
      await win.click('#ov-app-lock .dlg-actions .btn.primary');
      await win.waitForSelector('#ov-app-lock .hole-key', { timeout: 15_000 });
      const key = await win.evaluate(() => document.querySelector('#ov-app-lock .hole-key').textContent);
      await win.click('#ov-app-lock .dlg-actions .btn.primary');
      await dialogShut();
      return key;
    };
    await openNote('other');
    await openSettings();
    await win.click('#set-lock [data-lock="set"]');
    await win.waitForSelector('#ov-app-lock:not([hidden]) [data-pin="new"]');
    const setting = await win.evaluate(() => ({ title: document.querySelector('#ov-app-lock .dlg-title').textContent, pins: document.querySelectorAll('#ov-app-lock .hole-pin').length, passkey: !!document.getElementById('app-lock-passkey'), off: document.getElementById('app-lock-passkey').disabled }));
    check('setting a lock is setting a 6-digit PIN — the passkey is a box to tick beside it, greyed where the computer has none', setting.title === 'Lock Nebula' && setting.pins === 2 && setting.passkey && setting.off, JSON.stringify(setting));
    await win.fill('#ov-app-lock [data-pin="new"]', PIN);
    await win.fill('#ov-app-lock [data-pin="again"]', '271829');
    await win.click('#ov-app-lock .dlg-actions .btn.primary');
    check('two PINs that differ set no lock', (await dialogError()) === 'The two PINs are not the same.' && !fs.existsSync(lockFile));
    await win.fill('#ov-app-lock [data-pin="new"]', '');
    await win.click('#ov-app-lock .dlg-actions .btn.primary');
    check('and without a PIN there is no lock', (await dialogError()) === 'A PIN is six digits.' && !fs.existsSync(lockFile), await dialogError());
    await win.fill('#ov-app-lock [data-pin="new"]', PIN);
    await win.fill('#ov-app-lock [data-pin="again"]', PIN);
    await win.fill('#ov-app-lock .hole-hint-field', 'the number e');
    await win.click('#ov-app-lock .dlg-actions .btn.primary');
    await win.waitForSelector('#ov-app-lock .hole-key', { timeout: 15_000 });
    const recoveryKey = await win.evaluate(() => document.querySelector('#ov-app-lock .hole-key').textContent);
    await win.keyboard.press('Escape');
    check('the recovery key is shown once, and stays until it is said to be written down', KEY.test(recoveryKey) && await win.evaluate(() => !document.getElementById('ov-app-lock').hidden && !document.getElementById('ov-settings').hidden), recoveryKey.length);
    await win.click('#ov-app-lock .dlg-actions .btn.primary');
    await dialogShut();
    await lockSays('Nebula asks for its PIN when it opens.');
    await win.waitForTimeout(300);
    check('Settings says the app asks for its PIN, and offers: lock now, turn off, add a passkey (none here), remove', (await lockState()) === 'Nebula asks for its PIN when it opens.' && (await lockButtons()) === 'now,off,passkey-on(off),remove', `${await lockState()} | ${await lockButtons()}`);
    const keptLock = fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : '';
    check('the profile keeps what the PIN hashes to — never the PIN, never the recovery key', kept()?.on === true && kept()?.passkey === false && !!kept()?.pin?.hash && !keptLock.includes(PIN) && !keptLock.includes(recoveryKey) && !keptLock.includes(recoveryKey.replace(/-/g, '')), keptLock.length);
    await closeSettings();
    check('the app stays open for whoever set the lock', (await noteRows()) > 0 && await win.evaluate(() => !document.getElementById('app-lock')));
    await win.evaluate(() => [...document.querySelectorAll('#app-menu .am-title')].find((b) => b.textContent === 'File').click());
    check('and the File menu offers Lock Nebula', await win.evaluate(() => { const b = document.querySelector('[data-cmd="file.lock"]'); return !b.hidden && b.textContent === 'Lock Nebula' && !b.closest('.am-menu').hidden; }));
    await win.keyboard.press('Escape');
    await stop();

    // The app opened again: it asks, and shows nothing.
    await start();
    await gate();
    await win.waitForTimeout(800);
    const shut = await win.evaluate(async () => ({
      rows: document.querySelectorAll('.note-row').length, title: document.getElementById('title').value, words: document.getElementById('editor').textContent,
      inert: document.getElementById('app').inert, menus: document.querySelectorAll('#app-menu .am-title').length,
      heading: document.querySelector('#app-lock .dlg-title').textContent, hint: document.querySelector('#app-lock .hole-reminder')?.textContent ?? '',
      focus: document.activeElement?.classList.contains('hole-pin'), passkey: !!document.querySelector('#app-lock [data-lock="passkey"]'),
      list: await window.nebula.storage.list('notes'), read: await window.nebula.storage.read('notes/plain.json'),
      holes: await window.nebula.holes.list(), held: await window.nebula.media.held(),
      screen: (() => { const r = document.getElementById('app-lock').getBoundingClientRect(); return r.top >= 37 && r.top <= 39 && r.bottom >= window.innerHeight - 1 && r.right >= window.innerWidth - 1; })(),
    }));
    check('opened again, the app asks for its PIN before anything else: no note, no title, no menus — and no passkey button, none was added', shut.rows === 0 && shut.title === '' && shut.words === '' && shut.menus === 0 && shut.heading === 'Nebula is locked' && shut.inert && shut.focus && shut.screen && !shut.passkey, JSON.stringify({ ...shut, list: 0, read: 0, holes: 0 }));
    check('the hint kept with the PIN is shown', shut.hint === 'Hint: the number e', shut.hint);
    check('and the main process hands the window nothing while it is shut: no list of notes, no note, no black hole', shut.list.ok === false && shut.list.files.length === 0 && shut.read.ok === false && shut.read.missing === false && !('data' in shut.read) && shut.holes.ok === false && shut.held.length === 0, JSON.stringify({ list: shut.list, read: shut.read, holes: shut.holes }));
    const written = await win.evaluate(() => window.nebula.storage.write('notes/plain.json', '{"id":"plain","title":"gone","content":""}').then(() => 'written', () => 'refused'));
    check('nor lets it write one', written === 'refused' && JSON.parse(fs.readFileSync(path.join(notes, 'plain', 'plain.json'), 'utf8')).title === 'plain', written);
    await win.keyboard.type('000000', { delay: 15 });
    await win.waitForFunction(() => document.querySelector('#app-lock .hole-error').textContent.length > 0, null, { polling: 50 });
    const wrong = await win.evaluate(() => ({ error: document.querySelector('#app-lock .hole-error').textContent, field: document.querySelector('#app-lock .hole-pin').value, there: !!document.getElementById('app-lock'), rows: document.querySelectorAll('.note-row').length }));
    check('a wrong PIN opens nothing, says how many tries are left, and empties the box', wrong.error === 'Wrong. 4 more tries before a wait.' && wrong.field === '' && wrong.there && wrong.rows === 0, JSON.stringify(wrong));
    await win.keyboard.type(PIN, { delay: 15 });
    await ready();
    const opened = await win.evaluate(() => ({ gate: !!document.getElementById('app-lock'), inert: document.getElementById('app').inert, rows: document.querySelectorAll('.note-row').length, title: document.getElementById('title').value, menus: document.querySelectorAll('#app-menu .am-title').length }));
    check('the right PIN opens the app as it was left, at its last digit', !opened.gate && !opened.inert && opened.rows >= 4 && opened.title === 'other' && opened.menus === 6, JSON.stringify(opened));

    // "Lock Nebula": shut at once, what was typed saved first.
    await win.click('#editor');
    await win.keyboard.press('Control+End');
    await win.keyboard.type(' typed before the lock');
    await win.evaluate(() => [...document.querySelectorAll('#app-menu .am-title')].find((b) => b.textContent === 'File').click());
    await win.click('[data-cmd="file.lock"]');
    await gate();
    await win.waitForTimeout(500);
    const relocked = await win.evaluate(async () => ({ rows: document.querySelectorAll('.note-row').length, words: document.getElementById('editor').textContent, list: (await window.nebula.storage.list('notes')).ok }));
    check('File → Lock Nebula shuts the app at once', relocked.rows === 0 && relocked.words === '' && relocked.list === false, JSON.stringify(relocked));
    check('what was typed went to the disk first', /typed before the lock/.test(noteOnDisk('other')?.content ?? ''), noteOnDisk('other')?.content);

    // The recovery key opens it, and the lock is removed after.
    await win.click('#app-lock .hole-link');
    await win.waitForSelector('#app-lock .hole-recovery');
    await win.fill('#app-lock .hole-recovery', 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA');
    await win.keyboard.press('Enter');
    await win.waitForFunction(() => document.querySelector('#app-lock .hole-error').textContent.length > 0, null, { polling: 50 });
    check('a key that is not the recovery key opens nothing', await win.evaluate(() => /^Wrong\./.test(document.querySelector('#app-lock .hole-error').textContent) && document.querySelectorAll('.note-row').length === 0));
    await win.click('#app-lock .dlg-actions .btn.ghost');
    await win.waitForSelector('#app-lock .hole-pin');
    check('Back returns to the PIN', await win.evaluate(() => !document.querySelector('#app-lock .hole-recovery')));
    await win.click('#app-lock .hole-link');
    await win.fill('#app-lock .hole-recovery', recoveryKey.toLowerCase().replace(/-/g, ' '));
    await win.click('#app-lock .dlg-actions .btn.primary');
    await ready();
    await win.waitForFunction(() => !document.getElementById('toast').hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    const recovered = await win.evaluate(() => ({ toast: document.getElementById('toast').textContent, words: document.getElementById('editor').textContent }));
    check('the recovery key opens the app, typed in any case, and says the lock was removed', recovered.toast === 'The lock was removed — set a new one in Settings' && /typed before the lock/.test(recovered.words) && !fs.existsSync(lockFile), JSON.stringify(recovered));
    await openSettings();
    check('Settings shows no lock again', (await lockState()) === 'Nebula opens without asking.' && (await lockButtons()) === 'set', `${await lockState()} | ${await lockButtons()}`);

    // ---- "Turn the lock off" is not "Remove lock" -------------------------------
    await setLock({ hint: 'again e' });
    const whenOn = kept();
    await win.click('#set-lock [data-lock="off"]');
    await win.waitForSelector('#ov-app-lock:not([hidden]) .hole-pin');
    check('turning the lock off asks for the PIN, and says the lock is kept', await win.evaluate(() => document.querySelector('#ov-app-lock .dlg-title').textContent === 'Turn the lock off' && document.querySelector('#ov-app-lock .hole-note').textContent === 'Nebula will open without asking. The lock is kept, to be turned on again.' && !document.querySelector('#ov-app-lock [data-lock="passkey"]')));
    await typePin('#ov-app-lock .hole-pin', '111111');
    await win.waitForFunction(() => document.querySelector('#ov-app-lock .hole-error').textContent.length > 0, null, { polling: 50 });
    check('a wrong PIN leaves it on', kept()?.on === true && /^Wrong\./.test(await dialogError()), await dialogError());
    await typePin('#ov-app-lock .hole-pin', PIN);
    await dialogShut();
    await lockSays('The lock is turned off: Nebula opens without asking. Its PIN is kept.');
    await win.waitForTimeout(300);
    const whenOff = kept();
    check('the right one turns it off — and the lock is still there: its PIN, its hint, its recovery key, untouched', whenOff?.on === false && whenOff.pin.hash === whenOn.pin.hash && whenOff.recovery.hash === whenOn.recovery.hash && whenOff.hint === 'again e', JSON.stringify({ on: whenOff?.on, hint: whenOff?.hint }));
    check('Settings says so, and offers to turn it on again or to remove it', (await lockState()) === 'The lock is turned off: Nebula opens without asking. Its PIN is kept.' && (await lockButtons()) === 'on,passkey-on(off),remove', `${await lockState()} | ${await lockButtons()}`);
    await closeSettings();
    await win.evaluate(() => [...document.querySelectorAll('#app-menu .am-title')].find((b) => b.textContent === 'File').click());
    check('with the lock off, the File menu has no Lock Nebula', await win.evaluate(() => document.querySelector('[data-cmd="file.lock"]').hidden));
    await win.keyboard.press('Escape');
    await stop();

    await start({ NEBULA_LOGO_OWN: 'test' });
    await ready();
    check('opened again with the lock off, the app does not ask', await win.evaluate(() => !document.getElementById('app-lock') && document.querySelectorAll('.note-row').length >= 4));
    await openSettings();
    await win.waitForTimeout(400);
    const afterStart = await win.evaluate(() => { const big = document.querySelector('#logo-editor .logo-big'); return decodeURIComponent(big.src).includes('fill="#58A6FF"') && decodeURIComponent(big.src).includes('fill="#F7F7F7"'); });
    check('the logo is kept across a start of the app: its colours, its icon file, the shortcut still pointed at it', afterStart && logoKept()?.colors?.star === '#58A6FF' && icoFiles().length === 1
      && (await app.evaluate(({ shell }, file) => shell.readShortcutLink(file).icon ?? '', shortcut)).toLowerCase() === path.join(logoDir, icoFiles()[0]).toLowerCase(), JSON.stringify(logoKept()));
    const testChips = await win.evaluate(() => [...document.querySelectorAll('#logo-editor .logo-themes > .te-chip')].map((c) => `${c.querySelector('.te-chip__name')?.textContent ?? c.textContent}${c.classList.contains('on') ? '*' : ''}`).join('|'));
    check('the test build has a logo of its own, and offers it first — "Nebula’s own" — where no other build does', testChips === 'Nebula’s own|Main|Dark|Light|White|Matcha|Contrast|Contrast 2*|+', testChips);
    await win.click('#logo-editor .logo-themes > .te-chip:text-is("Nebula’s own")');
    {
      const end = Date.now() + 6000;
      while (Date.now() < end && fs.existsSync(logoDir)) await win.waitForTimeout(100);
    }
    const backToOwn = await win.evaluate(() => decodeURIComponent(document.querySelector('#logo-editor .logo-big').src));
    // The shortcuts follow a moment after the window: they are not written on the spot.
    let linkBack = null;
    for (const end = Date.now() + 6000; Date.now() < end;) {
      linkBack = await app.evaluate(({ shell }, file) => { const l = shell.readShortcutLink(file); return { icon: l.icon ?? '', target: l.target }; }, shortcut);
      if (linkBack.icon.toLowerCase() === linkBack.target.toLowerCase()) break;
      await win.waitForTimeout(150);
    }
    check('it puts the build’s own logo back: nothing of a logo is kept, and the shortcut wears the program’s own icon again', !fs.existsSync(logoDir) && backToOwn.includes('fill="#14142E"') && backToOwn.includes('#B3BEFF')
      && linkBack.icon.toLowerCase() === linkBack.target.toLowerCase(), JSON.stringify(linkBack));
    // In the test build the Main theme's logo is one to put on, like any other.
    await win.click('#logo-editor .logo-themes > .te-chip:text-is("Main")');
    {
      const end = Date.now() + 6000;
      while (Date.now() < end && logoKept()?.colors?.bg !== '#17122A') await win.waitForTimeout(100);
    }
    check('and Main there is the logo Nebula comes with, worn like any other', JSON.stringify(logoKept()?.colors) === JSON.stringify({ bg: '#17122A', edge: '#2A2145', moon: '#C9B6FF', shade: '#7C3AED', star: '#996AF4' }), JSON.stringify(logoKept()));
    await win.click('#logo-editor .logo-themes > .te-chip:text-is("Nebula’s own")');
    {
      const end = Date.now() + 6000;
      while (Date.now() < end && fs.existsSync(logoDir)) await win.waitForTimeout(100);
    }
    await win.click('#set-lock [data-lock="on"]');
    await lockSays('Nebula asks for its PIN when it opens.');
    check('turned on again at a press, with nothing to type: the same lock', kept()?.on === true && kept().pin.hash === whenOn.pin.hash && (await lockState()) === 'Nebula asks for its PIN when it opens.', await lockState());
    await closeSettings();
    // One test build (2026-10-12 05:44) listed fonts that are not on this computer, kept with their stacks; what it listed is taken off at the next start.
    await win.evaluate(() => {
      const add = (key) => localStorage.setItem(key, JSON.stringify([...JSON.parse(localStorage.getItem(key) || '[]'), 'Instrument Sans']));
      add('nebula:fonts'); add('nebula:fonts-pinned');
      localStorage.setItem('nebula:font-stacks', JSON.stringify({ 'instrument sans': '"Instrument Sans", system-ui, sans-serif' }));
    });
    await stop();

    await start();
    await gate();
    await win.waitForSelector('#app-lock .hole-pin');
    check('and it asks again — with the hint it had', await win.evaluate(() => document.querySelector('#app-lock .hole-reminder')?.textContent === 'Hint: again e' && document.querySelectorAll('.note-row').length === 0));
    await win.keyboard.type(PIN, { delay: 15 });
    await ready();
    check('a font that is not on this computer, listed by one test build, is off the list at the next start', await win.evaluate(() => !(localStorage.getItem('nebula:fonts') || '').includes('Instrument Sans')
      && !(localStorage.getItem('nebula:fonts-pinned') || '').includes('Instrument Sans') && localStorage.getItem('nebula:font-stacks') === null));
    await openSettings();
    await win.click('#set-lock [data-lock="remove"]');
    await win.waitForSelector('#ov-app-lock:not([hidden]) .hole-pin');
    check('Remove lock says what goes: the PIN, the passkey, the recovery key', await win.evaluate(() => document.querySelector('#ov-app-lock .dlg-title').textContent === 'Remove lock' && document.querySelector('#ov-app-lock .hole-note').textContent === 'The lock is deleted: its PIN, its passkey and its recovery key are forgotten.'));
    await typePin('#ov-app-lock .hole-pin', '111111');
    await win.waitForFunction(() => document.querySelector('#ov-app-lock .hole-error').textContent.length > 0, null, { polling: 50 });
    check('a wrong PIN removes nothing', fs.existsSync(lockFile) && /^Wrong\./.test(await dialogError()));
    await typePin('#ov-app-lock .hole-pin', PIN);
    await dialogShut();
    await lockSays('Nebula opens without asking.');
    check('the right one removes it: nothing of it is left in the profile', !fs.existsSync(lockFile) && (await lockState()) === 'Nebula opens without asking.' && (await lockButtons()) === 'set', `${await lockState()} | ${await lockButtons()}`);
    await closeSettings();

    // ---- The words follow the language ------------------------------------------
    await win.click('#lang-row [data-lang="tr"]');
    const turkish = await win.evaluate(() => [...document.querySelectorAll('#app-menu .am-title')].at(-1).textContent);
    await openSettings();
    const sheetTr = await win.evaluate(() => ({ heads: [...document.querySelectorAll('#settings-body .set-head')].map((h) => h.textContent).join('|'), state: document.querySelector('#set-lock .set-state').textContent, own: document.getElementById('set-size').options[0].textContent, font: document.getElementById('set-font').options[0].textContent, page: document.getElementById('set-page').options[0].textContent, set: document.querySelector('#set-lock [data-lock="set"]').textContent }));
    check('in Türkçe the title is Ayarlar and the sheet reads in Turkish, the pages keeping their names', turkish === 'Ayarlar' && sheetTr.heads === 'Yeni notlar|Göster ve gizle|Açılışta kilit|Logo' && sheetTr.state === 'Nebula sormadan açılır.' && sheetTr.own === 'Nebula varsayılanı (14)' && sheetTr.font === 'Nebula varsayılanı (Serif)' && sheetTr.page === 'Nebula Wide (NW)' && sheetTr.set === 'Kilit kur', JSON.stringify({ turkish, ...sheetTr }));
    await closeSettings();
    await win.click('#lang-row [data-lang="en"]');
    await stop();

    // ---- A passkey beside the PIN ------------------------------------------------
    await start({ NEBULA_HELLO: 'ok' });
    await ready();
    await openSettings();
    const helloKey = await setLock({ passkey: true });
    await lockSays('Nebula asks for its PIN — or your passkey — when it opens.');
    await win.waitForTimeout(300);
    check('with a passkey on the computer the box can be ticked: the lock is the PIN, and the passkey opens it too', KEY.test(helloKey) && kept()?.passkey === true && !!kept()?.pin?.hash && (await lockState()) === 'Nebula asks for its PIN — or your passkey — when it opens.' && (await lockButtons()) === 'now,off,passkey-off,remove', `${await lockState()} | ${await lockButtons()}`);
    await closeSettings();
    await stop();

    await start({ NEBULA_HELLO: 'no' });
    await gate();
    await win.waitForSelector('#app-lock [data-lock="passkey"]');
    await win.waitForTimeout(1500);
    const waiting = await win.evaluate(() => ({ error: document.querySelector('#app-lock .hole-error').textContent, rows: document.querySelectorAll('.note-row').length, pin: !!document.querySelector('#app-lock .hole-pin'), button: document.querySelector('#app-lock [data-lock="passkey"]').textContent, focus: document.activeElement?.classList.contains('hole-pin') }));
    check('opened again, the app shows the PIN’s box and a button to log in with the passkey — and asks the passkey for nothing by itself', waiting.error === '' && waiting.rows === 0 && waiting.pin && waiting.button === 'Log in with passkey' && waiting.focus, JSON.stringify(waiting));
    await win.click('#app-lock [data-lock="passkey"]');
    await win.waitForFunction(() => document.querySelector('#app-lock .hole-error').textContent === 'Not confirmed.', null, { polling: 50, timeout: 10_000 }).catch(() => {});
    const refused = await win.evaluate(() => ({ error: document.querySelector('#app-lock .hole-error').textContent, rows: document.querySelectorAll('.note-row').length, there: !!document.getElementById('app-lock') }));
    check('pressed, the passkey is asked; a no opens nothing', refused.error === 'Not confirmed.' && refused.rows === 0 && refused.there, JSON.stringify(refused));
    await win.click('#app-lock .hole-pin');
    await win.keyboard.type(PIN, { delay: 15 });
    await ready();
    check('and the PIN opens it all the same: whichever the person likes', await win.evaluate(() => !document.getElementById('app-lock') && document.querySelectorAll('.note-row').length >= 4));
    await openSettings();
    await win.waitForSelector('#set-lock [data-lock="passkey-off"]');
    await win.click('#set-lock [data-lock="passkey-off"]');
    await lockSays('Nebula asks for its PIN when it opens.');
    await win.waitForSelector('#set-lock [data-lock="passkey-on"]:not([disabled])');
    check('Remove the passkey takes it away at a press: the PIN is the lock again', kept()?.passkey === false && kept()?.on === true && (await lockButtons()) === 'now,off,passkey-on,remove', await lockButtons());
    await win.click('#set-lock [data-lock="passkey-on"]');
    await win.waitForSelector('#ov-app-lock:not([hidden]) .hole-pin');
    check('Add a passkey asks for the PIN first — not for a passkey', await win.evaluate(() => document.querySelector('#ov-app-lock .dlg-title').textContent === 'Add a passkey' && !document.querySelector('#ov-app-lock [data-lock="passkey"]')));
    await typePin('#ov-app-lock .hole-pin', PIN);
    await win.waitForFunction(() => document.querySelector('#ov-app-lock .hole-error').textContent.length > 0, null, { polling: 50, timeout: 10_000 }).catch(() => {});
    check('and then for the passkey’s own yes: refused, none is added', (await dialogError()) === 'Not confirmed.' && kept()?.passkey === false, await dialogError());
    await win.keyboard.press('Escape');
    await closeSettings();
    await stop();

    await start({ NEBULA_HELLO: 'ok' });
    await gate();
    await win.waitForSelector('#app-lock .hole-pin');
    check('with the passkey taken away, the lock screen has the PIN alone', await win.evaluate(() => !document.querySelector('#app-lock [data-lock="passkey"]')));
    await win.keyboard.type(PIN, { delay: 15 });
    await ready();
    await openSettings();
    await win.waitForSelector('#set-lock [data-lock="passkey-on"]:not([disabled])');
    await win.click('#set-lock [data-lock="passkey-on"]');
    await win.waitForSelector('#ov-app-lock:not([hidden]) .hole-pin');
    await typePin('#ov-app-lock .hole-pin', PIN);
    await dialogShut();
    await lockSays('Nebula asks for its PIN — or your passkey — when it opens.');
    check('added with the PIN and its yes, the passkey opens the app too', kept()?.passkey === true && (await lockState()) === 'Nebula asks for its PIN — or your passkey — when it opens.', await lockState());
    await win.waitForSelector('#set-lock [data-lock="off"]');
    await win.click('#set-lock [data-lock="off"]');
    await win.waitForSelector('#ov-app-lock:not([hidden]) [data-lock="passkey"]');
    await win.click('#ov-app-lock [data-lock="passkey"]');
    await dialogShut();
    await lockSays('The lock is turned off: Nebula opens without asking. Its PIN is kept.');
    check('the passkey answers for the lock where the PIN does: it turns it off', kept()?.on === false && kept()?.passkey === true, JSON.stringify({ on: kept()?.on }));
    await win.waitForSelector('#set-lock [data-lock="on"]');
    await win.click('#set-lock [data-lock="on"]');
    await lockSays('Nebula asks for its PIN — or your passkey — when it opens.');
    await closeSettings();
    await win.evaluate(() => [...document.querySelectorAll('#app-menu .am-title')].find((b) => b.textContent === 'File').click());
    await win.click('[data-cmd="file.lock"]');
    await gate();
    await win.waitForSelector('#app-lock [data-lock="passkey"]');
    await win.waitForTimeout(1200);
    check('locked now, the app waits: the passkey is not called until its button is pressed', await win.evaluate(() => !!document.getElementById('app-lock') && document.querySelector('#app-lock .hole-error').textContent === '' && document.querySelectorAll('.note-row').length === 0));
    await win.click('#app-lock [data-lock="passkey"]');
    await ready();
    check('a press on Log in with passkey, and its yes, opens the app', await win.evaluate(() => !document.getElementById('app-lock') && document.querySelectorAll('.note-row').length >= 4));
    await openSettings();
    await win.waitForSelector('#set-lock [data-lock="remove"]');
    await win.click('#set-lock [data-lock="remove"]');
    await win.waitForSelector('#ov-app-lock:not([hidden]) [data-lock="passkey"]');
    await win.click('#ov-app-lock [data-lock="passkey"]');
    await dialogShut();
    await lockSays('Nebula opens without asking.');
    check('and removes the lock', !fs.existsSync(lockFile) && (await lockState()) === 'Nebula opens without asking.', await lockState());
    await closeSettings();

    check('no page errors in the settings checks', errors.length === 0, errors.join(' | '));
  } finally {
    await stop();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
    try { fs.rmSync(shortcuts, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  let count = 0;
  await runSettingsChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`${count - failed}/${count}`);
  process.exitCode = failed ? 1 : 0;
}
