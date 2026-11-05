/**
 * 1.0.3 — the owner's "Ideas For Nebula and Testing For Nebula" note: blocks
 * picked, copied and pulled together as in Notion, a window saved on a monitor
 * that is gone, words copied across lines, a divider
 * pulled right out of a column taking only its part, a picture behind the note,
 * a picture cut to the logo's tile, the grip staying under Settings, the palette
 * putting Universe away, the add-project button and where snapshots go. The real
 * app on a throwaway profile.
 *
 *   node tests/e2e/ideas-103.mjs          (after npm run build)
 *
 * NEBULA_SHOTS=<folder> keeps a picture of the note with a background.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const LINES = '<p id="a">alpha line</p><h2 id="b">beta heading</h2><ul id="l"><li id="i1">item one</li><li id="i2">item two</li></ul><p id="c">gamma line</p><p id="d">delta line</p><p id="e">epsilon line</p>';
const COLS = '<div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col" id="cl"><p id="top">the top of the column</p><hr class="blk-hr" id="h"><p id="under">the part under the divider</p></div><hr class="blk-vr"><div class="blk-col" id="cr"><p>right</p><p><br></p><p><br></p></div></div><p id="after">after</p>';

export async function runIdeas103Checks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-ideas103-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content) => fs.writeFileSync(path.join(notes, `${id}.json`), JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1 }));
  seed('lines', LINES);
  seed('cols', COLS);
  fs.writeFileSync(path.join(notes, 'tagged.json'), JSON.stringify({ id: 'tagged', title: 'tagged', content: '<p>words</p>', labels: ['Alpha', 'Beta'], createdAt: 1, updatedAt: 1 }));
  let app;
  const launch = async () => {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    win.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 800));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.waitForTimeout(300);
    return win;
  };
  const errors = [];
  try {
    let win = await launch();
    const open = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
      await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
      await win.waitForTimeout(250);
    };
    const load = async (html) => {
      await win.evaluate((h) => { document.getElementById('editor').innerHTML = h; }, html);
      await win.waitForTimeout(150);
    };
    const box = (selector) => win.evaluate((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 } : null;
    }, selector);
    const pickedIds = () => win.evaluate(() => [...document.querySelectorAll('#editor .block-picked')].map((b) => b.id));
    const ids = () => win.evaluate(() => [...document.getElementById('editor').querySelectorAll('[id]')].map((b) => b.id));
    /** The grip of a block, clicked. */
    const clickGrip = async (selector, modifiers = {}) => {
      const b = await box(selector);
      await win.mouse.move(b.left + 10, b.cy - 1);
      await win.mouse.move(b.left + 10, b.cy);
      await win.waitForTimeout(150);
      await win.waitForFunction(() => { const g = document.querySelector('.block-grip'); return g && !g.hidden; }, null, { polling: 30 });
      const g = await box('.block-grip');
      await win.mouse.move(g.cx, g.cy);
      if (modifiers.shift) await win.keyboard.down('Shift');
      await win.mouse.down();
      await win.mouse.up();
      if (modifiers.shift) await win.keyboard.up('Shift');
      await win.waitForTimeout(60);
    };
    const openSettings = async () => {
      await win.evaluate(() => document.querySelector('#app-menu [data-cmd="settings.open"]')?.click());
      await win.waitForFunction(() => !document.getElementById('ov-settings').hidden, null, { polling: 50 });
      await win.evaluate(() => document.getElementById('set-tab-look').click());
    };
    const clipboard = () => app.evaluate(async ({ clipboard: c }) => {
      const item = (await c.read()).find((i) => i.types.includes('text/html'));
      return { html: item ? await (await item.getType('text/html')).text() : '', text: await c.readText() };
    });

    // ---- blocks together --------------------------------------------------
    await open('lines');
    await clickGrip('#c');
    check('the grip picks one block', (await pickedIds()).join() === 'c', (await pickedIds()).join());
    await win.keyboard.press('Shift+ArrowDown');
    await win.keyboard.press('Shift+ArrowDown');
    check('Shift+↓ makes the pick grow', (await pickedIds()).join() === 'c,d,e', (await pickedIds()).join());
    await win.keyboard.press('Shift+ArrowUp');
    check('Shift+↑ makes it shrink again', (await pickedIds()).join() === 'c,d', (await pickedIds()).join());
    await win.keyboard.press('Control+c');
    await win.waitForTimeout(100);
    const copied = await clipboard();
    check('copying takes every picked block', /gamma line/.test(copied.html) && /delta line/.test(copied.html) && !/epsilon/.test(copied.html), copied.html);
    check('the plain text has a line for each', copied.text.replace(/\r/g, '') === 'gamma line\ndelta line', JSON.stringify(copied.text));
    await win.keyboard.press('Delete');
    await win.waitForTimeout(100);
    let now = await ids();
    check('Delete removes them all', !now.includes('c') && !now.includes('d') && now.includes('e'), now.join());
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(150);
    now = await ids();
    check('one undo brings them all back', now.includes('c') && now.includes('d'), now.join());

    await load(LINES);
    await clickGrip('#a');
    await clickGrip('#c', { shift: true });
    check('Shift on another grip picks everything between', (await pickedIds()).join() === 'a,b,l,c', (await pickedIds()).join());
    await win.keyboard.press('Control+Shift+ArrowDown');
    await win.waitForTimeout(80);
    now = await win.evaluate(() => [...document.getElementById('editor').children].map((b) => b.id).filter(Boolean));
    check('Ctrl+Shift+↓ moves them together', now.join() === 'd,a,b,l,c,e', now.join());
    await win.keyboard.press('Escape');

    // ---- the pick pulled by the grip --------------------------------------
    const topIds = () => win.evaluate(() => [...document.getElementById('editor').children].map((b) => b.id).filter(Boolean));
    /** The pick c,d, pressed by a grip, carried to a place and let go there. */
    const pull = async (grab, to, { letGo = true } = {}) => {
      await load(LINES);
      await clickGrip('#c');
      await clickGrip('#d', { shift: true });
      const b = await box(grab);
      await win.mouse.move(b.left + 10, b.cy - 1);
      await win.mouse.move(b.left + 10, b.cy);
      await win.waitForTimeout(150);
      const g = await box('.block-grip');
      await win.mouse.move(g.cx, g.cy);
      await win.mouse.down();
      const end = await to();
      await win.mouse.move(end.x, end.y, { steps: 8 });
      await win.waitForTimeout(60);
      if (letGo) await win.mouse.up();
      await win.waitForTimeout(80);
    };
    const aboveA = async () => { const r = await box('#a'); return { x: r.left + 60, y: r.top + 2 }; };
    await pull('#d', aboveA, { letGo: false });
    const held = await win.evaluate(() => ({ lifted: [...document.querySelectorAll('#editor .block-lifted')].map((b) => b.id).join(), ghost: document.querySelector('.block-ghost')?.textContent ?? '' }));
    check('pulling lifts the whole pick', held.lifted === 'c,d', held.lifted);
    check('and the ghost carries all of it', /gamma line/.test(held.ghost) && /delta line/.test(held.ghost), held.ghost);
    await win.keyboard.press('Escape');
    await win.mouse.up();
    await win.waitForTimeout(60);
    check('Esc puts the pull back where it was', (await topIds()).join() === 'a,b,l,c,d,e' && await win.evaluate(() => !document.querySelector('.block-ghost, #editor .block-lifted')), (await topIds()).join());

    await pull('#d', aboveA);
    check('the pick goes together, in order, by any of its grips', (await topIds()).join() === 'c,d,a,b,l,e', (await topIds()).join());
    check('and stays picked', (await pickedIds()).join() === 'c,d', (await pickedIds()).join());
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(150);
    check('one undo puts all of it back', (await topIds()).join() === 'a,b,l,c,d,e', (await topIds()).join());

    await pull('#c', async () => { const r = await box('#d'); return { x: r.left + 60, y: r.cy }; });
    check('let go on itself, nothing moves', (await topIds()).join() === 'a,b,l,c,d,e', (await topIds()).join());
    await pull('#c', async () => { const r = await box('#e'); return { x: r.left + 60, y: r.top + 2 }; });
    check('nor just under itself', (await topIds()).join() === 'a,b,l,c,d,e', (await topIds()).join());

    await load(LINES);
    await clickGrip('#c');
    await clickGrip('#d', { shift: true });
    const other = await box('#e');
    await win.mouse.move(other.left + 10, other.cy - 1);
    await win.mouse.move(other.left + 10, other.cy);
    await win.waitForTimeout(150);
    const otherGrip = await box('.block-grip');
    await win.mouse.move(otherGrip.cx, otherGrip.cy);
    await win.mouse.down();
    const a = await box('#a');
    await win.mouse.move(a.left + 60, a.top + 2, { steps: 8 });
    await win.mouse.up();
    await win.waitForTimeout(80);
    check('the grip of a block outside the pick moves that block alone', (await topIds()).join() === 'e,a,b,l,c,d', (await topIds()).join());
    await win.keyboard.press('Escape');

    await load(LINES);
    const band = { from: await box('#a'), to: await box('#c'), ed: await box('#editor') };
    const sideX = band.ed.left + 8;
    await win.mouse.move(sideX, band.from.cy);
    await win.mouse.down();
    await win.mouse.move(sideX + 20, band.from.cy + 30, { steps: 3 });
    await win.mouse.move(sideX + 40, band.to.cy, { steps: 5 });
    check('a band pulled on the empty side is drawn', await win.evaluate(() => !!document.querySelector('.block-band')));
    await win.mouse.up();
    check('the band picks what it crossed, and goes', (await pickedIds()).join() === 'a,b,l,c' && await win.evaluate(() => !document.querySelector('.block-band')), (await pickedIds()).join());
    check('no words are selected after it', await win.evaluate(() => window.getSelection().toString() === ''));
    await win.keyboard.press('Escape');

    // ---- empty lines are not picked, and five go up together ---------------
    const FIVE = '<p id="t">top one</p><p id="u">top two</p><p id="b0"><br></p><p id="p1">one</p><p id="p2">two</p><p id="b1"><br></p><p id="p3">three</p><p id="p4">four</p><p id="p5">five</p><p id="b2"><br></p><p id="z">end</p>';
    await load(FIVE);
    const bandOver = async (fromId, toId) => {
      const f = await box(fromId);
      const u = await box(toId);
      const x = (await box('#editor')).left + 8;
      await win.mouse.move(x, f.cy);
      await win.mouse.down();
      await win.mouse.move(x + 20, f.cy + 10, { steps: 3 });
      await win.mouse.move(x + 40, u.cy, { steps: 6 });
      await win.mouse.up();
      await win.waitForTimeout(60);
    };
    await bandOver('#b0', '#b2');
    check('a band over empty lines marks only what has something on it', (await pickedIds()).join() === 'p1,p2,p3,p4,p5', (await pickedIds()).join());
    const pullUp = async (grab, end) => {
      const b = await box(grab);
      await win.mouse.move(b.left + 10, b.cy - 1);
      await win.mouse.move(b.left + 10, b.cy);
      await win.waitForTimeout(150);
      const g = await box('.block-grip');
      await win.mouse.move(g.cx, g.cy);
      await win.mouse.down();
      await win.mouse.move(end.x, end.y, { steps: 10 });
      await win.waitForTimeout(80);
    };
    const t = await box('#t');
    await pullUp('#p3', { x: t.left + 60, y: t.top + 2 });
    await win.mouse.up();
    await win.waitForTimeout(80);
    check('the five go up by the grip of one, the empty line between them with them', (await topIds()).join() === 'p1,p2,b1,p3,p4,p5,t,u,b0,b2,z', (await topIds()).join());
    check('and stay picked', (await pickedIds()).join() === 'p1,p2,p3,p4,p5', (await pickedIds()).join());
    await win.keyboard.press('Escape');

    await load(FIVE);
    await bandOver('#b0', '#b0');
    check('a band over nothing but an empty line picks nothing', (await pickedIds()).length === 0, (await pickedIds()).join());
    await clickGrip('#b0');
    check('an empty line can still be picked on its own', (await pickedIds()).join() === 'b0', (await pickedIds()).join());
    await win.keyboard.press('Shift+ArrowDown');
    await win.keyboard.press('Shift+ArrowDown');
    check('Shift+↓ walks off it and leaves it out', (await pickedIds()).join() === 'p1,p2', (await pickedIds()).join());
    await win.keyboard.press('Shift+ArrowDown');
    await win.keyboard.press('Shift+ArrowDown');
    check('and over an empty line, which stays unmarked', (await pickedIds()).join() === 'p1,p2,p3', (await pickedIds()).join());
    await win.keyboard.press('Control+c');
    await win.waitForTimeout(100);
    check('what is between goes along when copied', (await clipboard()).text.replace(/\r/g, '').split('\n').length >= 4, JSON.stringify((await clipboard()).text));
    await win.keyboard.press('Escape');

    // In a note longer than the page: pulled to the top edge, it scrolls and lands there.
    const filler = Array.from({ length: 70 }, (_, i) => `<p id="f${i}">filler line ${i}</p>`).join('');
    await load(`${filler}<p id="m1">m one</p><p><br></p><p id="m2">m two</p><p id="m3">m three</p><p id="m4">m four</p><p id="m5">m five</p>`);
    await win.evaluate(() => document.getElementById('m5').scrollIntoView({ block: 'center' }));
    await win.waitForTimeout(100);
    await clickGrip('#m1');
    await clickGrip('#m5', { shift: true });
    check('five picked at the foot of a long note', (await pickedIds()).join() === 'm1,m2,m3,m4,m5', (await pickedIds()).join());
    const frame = await box('#editor');
    const mid = await box('#m3');
    await pullUp('#m3', { x: mid.left + 60, y: frame.top + 8 });
    await win.waitForFunction(() => document.getElementById('editor').scrollTop === 0, null, { polling: 50, timeout: 8000 }).catch(() => {});
    await win.waitForTimeout(100);
    const f0 = await box('#f0');
    await win.mouse.move(f0.left + 60, Math.max(f0.top + 2, frame.top + 1));
    await win.waitForTimeout(80);
    await win.mouse.up();
    await win.waitForTimeout(100);
    const longTop = (await topIds()).slice(0, 6).join();
    check('pulled up a long note they scroll with it and land at the top', longTop === 'm1,m2,m3,m4,m5,f0', longTop);
    await win.keyboard.press('Escape');

    // ---- words, not blocks: a selection across lines ----------------------
    await load('<p id="x">first of the words</p><p>a <a href="https://example.com/a" id="li">link</a> between</p><p id="y">last of the words</p><p id="z"><br></p>');
    const from = await box('#x');
    const to = await box('#y');
    await win.mouse.move(from.left + 2, from.cy);
    await win.mouse.down();
    await win.mouse.move(to.left + 120, to.cy, { steps: 8 });
    await win.mouse.up();
    await win.keyboard.press('Control+c');
    await win.waitForTimeout(100);
    const words = await clipboard();
    check('words copied across lines keep their lines', /first of the words/.test(words.text) && /between/.test(words.text) && /last of/.test(words.text), JSON.stringify(words.text));
    await win.click('#z');
    await win.keyboard.press('Control+v');
    await win.waitForTimeout(250);
    const pasted = await win.evaluate(() => document.getElementById('editor').innerText);
    check('and paste as they were', (pasted.match(/first of the words/g) ?? []).length === 2 && (pasted.match(/between/g) ?? []).length === 2, JSON.stringify(pasted));

    // ---- a divider in a column --------------------------------------------
    await open('cols');
    const hr = await box('#h');
    await win.mouse.move(hr.cx, hr.cy);
    await win.mouse.down();
    await win.mouse.move(hr.cx + 150, hr.cy + 2, { steps: 12 });
    await win.mouse.up();
    await win.waitForTimeout(150);
    const cut = await win.evaluate(() => ({
      top: !!document.querySelector('#top'), under: !!document.querySelector('#under'),
      cols: document.querySelectorAll('.blk-cols').length,
      // since 1.0.3 the part under the divider becomes two columns inside the column; the top stays as it was
      topHome: document.querySelector('#top')?.parentElement?.id,
      underIn: !!document.querySelector('#under')?.closest('#cl > .blk-cols'),
      right: document.querySelector('#cr > p')?.textContent,
    }));
    check('a divider pulled right keeps the column above it whole', cut.top && cut.under && cut.topHome === 'cl' && cut.underIn && cut.right === 'right', JSON.stringify(cut));

    // ---- the picture behind the note --------------------------------------
    const photo = path.join(profile, 'photo.png');
    const photoUrl = await win.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 900;
      c.height = 500;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 900, 500);
      grad.addColorStop(0, '#e6456b');
      grad.addColorStop(1, '#2f6fe0');
      g.fillStyle = grad;
      g.fillRect(0, 0, 900, 500);
      return c.toDataURL('image/png');
    });
    fs.writeFileSync(photo, Buffer.from(photoUrl.split(',')[1], 'base64'));
    await open('lines');
    await openSettings();
    await win.waitForFunction(() => !document.getElementById('ov-settings')?.hidden, null, { polling: 50 });
    check('no grip over the Settings sheet', await (async () => {
      const b = await box('#set-backdrop-choose');
      await win.mouse.move(b.cx, b.cy);
      await win.waitForTimeout(100);
      return win.evaluate(() => document.querySelector('.block-grip')?.hidden !== false);
    })());
    check('without a picture there is nothing to remove', await win.evaluate(() => document.getElementById('set-backdrop-remove').hidden));
    check('the preview shows Nebula with no picture behind it', await win.evaluate(() => {
      const p = document.getElementById('set-look-preview');
      return !!p && p.offsetHeight > 150 && !p.classList.contains('has-backdrop') && p.querySelector('.lp-amount').hidden;
    }));
    await win.setInputFiles('#set-backdrop-file', photo);
    // 1.0.3 (the Bug Find note: "background resmi seçerken ayarlama menüsü olsun, kullanıcı kırpabilsin").
    await win.waitForSelector('.logo-crop--window .logo-crop__stage');
    const cutFrame = await win.evaluate(() => {
      const r = document.querySelector('.logo-crop--window .logo-crop__stage').getBoundingClientRect();
      const a = document.getElementById('app');
      return { frame: r.width / r.height, window: a.clientWidth / a.clientHeight };
    });
    check('a chosen photo is cut first, in a frame of the window’s shape', Math.abs(cutFrame.frame - cutFrame.window) < 0.05, JSON.stringify(cutFrame));
    await win.click('#logo-crop-use');
    await win.waitForFunction(() => document.querySelector('#app.has-backdrop'), null, { polling: 50 });
    await win.waitForFunction(() => document.getElementById('set-look-preview').classList.contains('has-backdrop'), null, { polling: 50 });
    const preview = () => win.evaluate(() => {
      const p = document.getElementById('set-look-preview');
      const s = getComputedStyle(p);
      return { image: /url\(/.test(s.backgroundImage), layer: getComputedStyle(p.querySelector('.lp-main')).backgroundColor, percent: p.querySelector('.lp-amount').textContent, words: p.querySelector('.lp-title').textContent, height: p.offsetHeight };
    });
    check('the photo’s colours are offered to the styles', await win.evaluate(() => JSON.parse(localStorage.getItem('nebula:backdrop-photo-colors') || '[]').length >= 1));
    const slide = (v) => win.evaluate((value) => { const s = document.getElementById('set-backdrop-amount'); s.value = String(value); s.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await slide(20);
    const faint = await preview();
    check('the picture is previewed in Settings, with words over it', faint.image && faint.height > 60 && faint.words === 'Your note', JSON.stringify(faint));
    await slide(90);
    const strong = await preview();
    check('and the slider changes the preview at once, saying how much', faint.layer !== strong.layer && faint.percent === '20%' && strong.percent === '90%', JSON.stringify({ faint, strong }));
    if (process.env.NEBULA_SHOTS) {
      await win.locator('#set-look-preview').scrollIntoViewIfNeeded();
      await slide(35);
      await win.waitForTimeout(100);
      await win.screenshot({ path: path.join(process.env.NEBULA_SHOTS, 'backdrop-preview.png') });
    }
    // Under the whole window since the Bug Find note ("sol taraftan sag tarafa farkli renk oluyor").
    check('the picture goes behind the note', await win.evaluate(() => /url\(/.test(getComputedStyle(document.getElementById('app')).backgroundImage)));
    check('and shows through behind the words', await win.evaluate(() => getComputedStyle(document.getElementById('editor-frame')).backgroundColor === 'rgba(0, 0, 0, 0)'));
    const photos = () => { try { return fs.readdirSync(path.join(profile, 'backdrop', 'photos')).filter((f) => f.endsWith('.jpg')); } catch { return []; } };
    check('it is kept in the profile', photos().length === 1);
    await win.waitForFunction(() => document.querySelectorAll('#set-backdrop-photos .set-photo').length === 1, null, { polling: 50 });
    check('and kept as a little picture beside Choose a picture, marked worn', await win.evaluate(() => !!document.querySelector('#set-backdrop-photos .set-photo.on .set-photo__wear')));
    const offersHead = await win.evaluate(() => {
      const o = document.querySelector('#theme-editor .te-offers-label');
      const x = document.querySelector('#theme-editor .te-extra-label');
      return { words: o?.textContent, level: !!o && !!x && o.offsetHeight > 0 && Math.abs(o.getBoundingClientRect().top - x.getBoundingClientRect().top) < 1.5 };
    });
    check('the photo’s colours are headed “Colours inspired by your picture”, level with Style colours', offersHead.words === 'Colours inspired by your picture' && offersHead.level, JSON.stringify(offersHead));
    // The Bug Find note: "styles picture olarak sayılıyor ve eskisini siliyor foto".
    await win.click('[data-mix-style="waves"]');
    await win.waitForFunction(() => document.querySelector('[data-mix-style="waves"].on'), null, { polling: 50 });
    await win.waitForTimeout(300);
    check('a style worn keeps the photo, no longer marked worn', photos().length === 1
      && await win.evaluate(() => document.querySelectorAll('#set-backdrop-photos .set-photo').length === 1 && !document.querySelector('#set-backdrop-photos .set-photo.on')));
    const offersShown = () => win.evaluate(() => { const b = document.querySelector('#theme-editor .te-pick__offers'); return !!b && !b.hidden && b.querySelectorAll('.te-offers > *').length > 0; });
    check('and the photo’s colours go with it while the style is worn', !await offersShown());
    await win.click('#set-backdrop-photos .set-photo__wear');
    await win.waitForFunction(() => document.querySelector('#set-backdrop-photos .set-photo.on') && !document.querySelector('[data-mix-style].on'), null, { polling: 50 });
    check('worn again, its colours are offered again', await offersShown());
    check('and its little picture puts it back on', await win.evaluate(() => /^url\("data:image\/jpeg/.test(document.getElementById('app').style.getPropertyValue('--backdrop-image'))));
    check('Settings is not dimmed over the picture', await win.evaluate(() => getComputedStyle(document.getElementById('ov-settings')).backgroundColor === 'rgba(0, 0, 0, 0)'));
    await win.evaluate(() => { const s = document.getElementById('set-backdrop-amount'); s.value = '70'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    check('the slider says how much shows', await win.evaluate(() => document.getElementById('app').style.getPropertyValue('--backdrop') === '0.7'));
    // The owner, 2026-11-04: "varsayılana dön olsun".
    check('Reset to default sits beside it, ready', await win.evaluate(() => { const b = document.getElementById('set-backdrop-default'); return !!b && !b.disabled && b.closest('.set-row')?.contains(document.getElementById('set-backdrop-amount')); }));
    await win.click('#set-backdrop-default');
    const reset = await win.evaluate(() => ({ slider: document.getElementById('set-backdrop-amount').value, shown: document.getElementById('app').style.getPropertyValue('--backdrop'), saved: JSON.parse(localStorage.getItem('nebula:settings')).backdrop, percent: document.querySelector('#set-look-preview .lp-amount').textContent, off: document.getElementById('set-backdrop-default').disabled }));
    check('and puts it back to 30%, then rests', reset.slider === '30' && reset.shown === '0.3' && reset.saved === 0.3 && reset.percent === '30%' && reset.off, JSON.stringify(reset));
    await win.evaluate(() => { const s = document.getElementById('set-backdrop-amount'); s.value = '70'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    // 1.0.3 (the owner: "sag alttan bir pop up gelsin … bir daha gösterme derse o harici ekran icin tekrardan göstermesin").
    check('Soften for the screen says when to soften', await win.evaluate(() => /green specks/.test(document.getElementById('set-picture').textContent)));
    const moveTo = (info) => app.evaluate(({ BrowserWindow }, i) => BrowserWindow.getAllWindows()[0].webContents.send('screen:changed', i), info);
    const tip = () => win.evaluate(() => { const c = document.getElementById('screen-tip'); if (!c || c.hidden) return null; const r = c.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, words: c.textContent }; });
    await moveTo({ ok: true, id: 101, internal: true, label: 'Built-in' });
    await moveTo({ ok: true, id: 202, internal: false, label: 'Test Monitor' });
    await win.waitForTimeout(150);
    const card = await tip();
    check('onto an external screen with the picture unsoftened, a card at the bottom right says where to soften it',
      !!card && card.right < 40 && card.bottom < 120 && /Soften for the screen/.test(card.words), JSON.stringify(card));
    await win.click('#screen-tip [data-tip="off"]');
    await moveTo({ ok: true, id: 101, internal: true, label: 'Built-in' });
    await moveTo({ ok: true, id: 202, internal: false, label: 'Test Monitor' });
    await win.waitForTimeout(150);
    check('“Don’t show again for this screen” keeps it away from that screen', !(await tip()));
    await moveTo({ ok: true, id: 303, internal: false, label: 'Other Monitor' });
    await win.waitForTimeout(150);
    check('but another external screen still gets it', !!(await tip()));
    await win.click('#screen-tip [data-tip="later"]');
    if (process.env.NEBULA_SHOTS) {
      await win.click('#settings-close');
      await win.waitForTimeout(300);
      await win.screenshot({ path: path.join(process.env.NEBULA_SHOTS, 'backdrop.png') });
      await openSettings();
    }
    const content = () => fs.readdirSync(notes, { recursive: true, withFileTypes: true }).filter((f) => f.isFile()).map((f) => fs.readFileSync(path.join(f.parentPath, f.name), 'utf8')).join('');
    check('no note holds it', !/backdrop|picture\.jpg/.test(content()));

    // ---- a picture cut to the logo's tile ---------------------------------
    check('the logo has no picture to remove at first', await win.evaluate(() => document.getElementById('logo-picture-remove').hidden));
    await win.setInputFiles('#logo-picture-file', photo);
    await win.waitForSelector('.logo-crop__stage');
    const stage = await box('.logo-crop__stage');
    await win.mouse.move(stage.cx, stage.cy);
    await win.mouse.down();
    await win.mouse.move(stage.cx - 60, stage.cy, { steps: 4 });
    await win.mouse.up();
    await win.mouse.wheel(0, -120);
    await win.waitForTimeout(60);
    await win.click('#logo-crop-use');
    await win.waitForFunction(() => !document.querySelector('.logo-crop'), null, { polling: 50 });
    await win.waitForFunction(() => !document.getElementById('logo-picture-remove').hidden, null, { polling: 50 });
    const logoDir = path.join(profile, 'logo');
    await win.waitForTimeout(500);
    check('the picture becomes the logo', JSON.parse(fs.readFileSync(path.join(logoDir, 'logo.json'), 'utf8')).picture === true);
    check('with an icon file of its own', fs.readdirSync(logoDir).some((f) => /^icon-.*\.ico$/.test(f)));
    // 1.0.3 (the owner: "use a picture of mine kaydedilmiyor, temaya bastim kayboldu"): a theme worn over it does not lose it.
    const pictureDir = path.join(profile, 'logo-picture');
    const logoJson = () => { try { return JSON.parse(fs.readFileSync(path.join(logoDir, 'logo.json'), 'utf8')); } catch { return {}; } };
    await win.click('#logo-editor .logo-themes > .te-chip:text-is("Dark")');
    for (const end = Date.now() + 6000; Date.now() < end && logoJson().picture === true;) await win.waitForTimeout(100);
    check('a theme put on over the picture keeps the picture to go back to', logoJson().picture !== true && fs.existsSync(path.join(pictureDir, 'picture-256.png'))
      && await win.evaluate(() => !!document.querySelector('#logo-editor .logo-mine') && !document.querySelector('#logo-editor .logo-mine').classList.contains('on')));
    await win.click('#logo-editor [data-logo-theme="picture"]');
    for (const end = Date.now() + 6000; Date.now() < end && logoJson().picture !== true;) await win.waitForTimeout(100);
    check('and “My picture” puts it back on', logoJson().picture === true && await win.evaluate(() => document.querySelector('#logo-editor .logo-mine').classList.contains('on')), JSON.stringify(logoJson()));
    await win.dblclick('#logo-editor [data-logo-theme="picture"]');
    await win.waitForFunction(() => !document.getElementById('ov-dialog').hidden, null, { polling: 50 });
    const pictureAsked = await win.evaluate(() => document.getElementById('dlg-input').value);
    await win.fill('#dlg-input', 'Holiday');
    await win.click('#dlg-ok');
    await win.waitForTimeout(200);
    check('a double-click on “My picture” renames it', pictureAsked === 'My picture'
      && await win.evaluate(() => document.querySelector('#logo-editor .logo-mine span')?.textContent === 'Holiday' && localStorage.getItem('nebula:logo-picture-name') === 'Holiday'), pictureAsked);
    await win.setInputFiles('#logo-picture-file', photo);
    await win.waitForSelector('.logo-crop__stage');
    await win.keyboard.press('Escape');
    await win.waitForFunction(() => !document.querySelector('.logo-crop'), null, { polling: 50 });
    check('Escape shuts the cutting window, not Settings', await win.evaluate(() => !document.getElementById('ov-settings').hidden));
    await win.click('#settings-close');

    // ---- both still there after a restart ---------------------------------
    await app.close();
    app = null;
    win = await launch();
    check('the picture behind the note comes back', await win.evaluate(() => !!document.querySelector('#app.has-backdrop')));
    check('at the strength it was left', await win.evaluate(() => document.getElementById('app').style.getPropertyValue('--backdrop') === '0.7'));
    await openSettings();
    await win.waitForFunction(() => !document.getElementById('logo-picture-remove')?.hidden, null, { polling: 50 });
    check('the logo is still the picture', await win.evaluate(() => /^data:image\/png/.test(document.querySelector('.set-logo img')?.src ?? '')));
    await win.click('#logo-picture-remove');
    await win.waitForTimeout(900);
    check('removing it goes back to the drawn logo', await win.evaluate(() => document.getElementById('logo-picture-remove').hidden)
      && JSON.parse(fs.existsSync(path.join(profile, 'logo', 'logo.json')) ? fs.readFileSync(path.join(profile, 'logo', 'logo.json'), 'utf8') : '{}').picture !== true);
    check('and the kept picture goes with it', !fs.existsSync(path.join(profile, 'logo-picture')) && await win.evaluate(() => !document.querySelector('#logo-editor .logo-mine')));
    await win.click('#set-backdrop-remove');
    await win.waitForFunction(() => !document.querySelector('#app.has-backdrop'), null, { polling: 50 });
    check('Remove the picture takes it off and keeps it', photos().length === 1 && await win.evaluate(() => !document.querySelector('#set-backdrop-photos .set-photo.on')));
    check('and the preview goes with it, and the photo’s colours too', await win.evaluate(() => !document.getElementById('set-look-preview').classList.contains('has-backdrop') && !localStorage.getItem('nebula:backdrop-photo-colors')));
    await win.hover('#set-backdrop-photos .set-photo');
    await win.click('#set-backdrop-photos .set-photo__drop');
    await win.waitForFunction(() => !document.querySelector('#set-backdrop-photos .set-photo'), null, { polling: 50 });
    check('its × deletes it, and the last one deleted leaves no file', !fs.existsSync(path.join(profile, 'backdrop')));
    await win.click('#settings-close');

    // ---- the side of the window -------------------------------------------
    const place = await win.evaluate(() => {
      const folder = document.getElementById('btn-new-folder')?.getBoundingClientRect();
      const project = document.getElementById('btn-new-project')?.getBoundingClientRect();
      return folder && project && project.height > 0 && Math.abs(folder.top - project.top) < 6;
    });
    check('the add-project button stands by the folder one', !!place);
    // 1.0.3: the theme's editor stands open in Settings, with no palette
    // button to open it, so the sidebar's Universe stays put.
    await win.evaluate(() => document.querySelector('#app-menu [data-cmd="settings.open"]').click());
    await win.waitForFunction(() => !document.getElementById('ov-settings').hidden, null, { polling: 50 });
    await win.evaluate(() => document.getElementById('set-tab-look').click());
    await win.waitForTimeout(200);
    const foot = await win.evaluate(() => {
      const slot = document.querySelector('.side-foot .galaxy-slot');
      const row = document.getElementById('btn-new')?.getBoundingClientRect();
      return { shown: !!slot && getComputedStyle(slot).display !== 'none', open: !document.getElementById('theme-editor').hidden,
        inSettings: !!document.getElementById('theme-editor').closest('#ov-settings'), button: !!document.getElementById('btn-theme-custom'),
        rowOn: !!row && row.top >= 0 && row.bottom <= innerHeight };
    });
    check('the theme’s editor stands open in Settings, no button opens it, and Universe stays where it is', foot.shown && foot.open && foot.inSettings && !foot.button, JSON.stringify(foot));
    check('and the new-note button stays on screen', foot.rowOn, JSON.stringify(foot));
    // The organizer (1.0.3), laid out as the logo's editor is: a whole small
    // Nebula at the left, and at its right the themes, the theme's and the
    // styles' colours in one editor, then the styles and the picture.
    const organizer = await win.evaluate(() => {
      const look = document.getElementById('set-panel-look');
      const heads = [...look.querySelectorAll('.set-head')].map((h) => h.textContent).join(',');
      const tools = document.querySelector('.studio-tools');
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const preview = r('set-look-preview');
      const p = document.getElementById('set-look-preview');
      return { heads, together: ['theme-row', 'theme-editor', 'set-mix-styles'].every((id) => tools.contains(document.getElementById(id))),
        beside: preview.right <= tools.getBoundingClientRect().left + 0.5, fits: preview.right <= look.getBoundingClientRect().right + 0.5,
        order: r('theme-row').bottom <= r('theme-editor').top + 0.5 && r('theme-editor').bottom <= r('set-mix-styles').top + 0.5,
        whole: ['.lp-bar', '.lp-side', '.lp-search', '.lp-list', '.lp-galaxy', '.lp-drawers', '.lp-newrow', '.lp-head', '.lp-toolbar', '.lp-page'].every((s) => !!p.querySelector(s)),
        rows: p.querySelectorAll('.lp-row').length, tbrows: p.querySelectorAll('.lp-tbrow').length,
        styles: document.querySelectorAll('[data-mix-style]').length, dots: document.querySelectorAll('#theme-editor .te-dot').length,
        picture: !!document.getElementById('set-picture')?.closest('.studio-side') && !!document.getElementById('set-backdrop-choose')?.closest('#set-picture')
          && r('set-picture').top >= preview.bottom - 0.5 && !tools.contains(document.getElementById('set-picture')),
        pickBeside: document.querySelector('#theme-editor .te-pick__colors').getBoundingClientRect().left >= document.querySelector('#theme-editor .te-pick__sets').getBoundingClientRect().right - 0.5,
        label: document.querySelector('#theme-editor .te-extra-label')?.textContent ?? '',
        smooth: !!document.getElementById('set-smooth-screen')?.closest('#set-picture') && document.getElementById('set-smooth-screen').value };
    });
    check('Appearance: the preview at the left, the themes, one editor of their and the styles’ colours, and fifteen styles at its right',
      organizer.heads === 'Theme organizer,Logo' && organizer.together && organizer.beside && organizer.fits && organizer.order && organizer.styles === 15 && organizer.dots === 3, JSON.stringify(organizer));
    check('the picture stands at the left under the preview, with Soften for the screen on Never',
      organizer.picture && organizer.smooth === 'off', JSON.stringify(organizer));
    // 1.0.3 (the owner: "aşağı indirince picture kısmı önizlemenin altına düşüyor, hepsi sabit olsun aşağı doğru insin").
    const scrolled = await win.evaluate(async () => {
      const body = document.getElementById('settings-body');
      const gap = () => document.getElementById('set-picture').getBoundingClientRect().top - document.getElementById('set-look-preview').getBoundingClientRect().bottom;
      const before = gap();
      body.scrollTop = 0;
      body.scrollTop = 400;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = gap();
      body.scrollTop = 0;
      return { before, after, moved: body.scrollHeight > body.clientHeight };
    });
    check('scrolled down, the preview goes up with the picture under it, never over it',
      scrolled.after >= 0 && Math.abs(scrolled.after - scrolled.before) < 1, JSON.stringify(scrolled));
    check('the colours to choose from stand at the right of Style colours, which says up to five and counts them',
      organizer.pickBeside && /Style colours \(up to 5\)/.test(organizer.label) && /3\/5/.test(organizer.label), JSON.stringify(organizer));
    check('the preview is a whole Nebula: the title strip, the note list and its foot, the page’s head, the editing bar and a note',
      organizer.whole && organizer.rows >= 3 && organizer.tbrows === 2, JSON.stringify(organizer));
    await win.click('#theme-editor .te-dot[data-x="0"]');
    await win.waitForTimeout(150);
    const chosen = await win.evaluate(() => ({ on: document.querySelector('#theme-editor .te-dot.on')?.dataset.x, slot: document.querySelector('#theme-editor .te-slot.on')?.dataset.slot ?? null, theme: document.documentElement.dataset.theme }));
    check('a style’s colour pressed is the one the theme’s bar chooses', chosen.on === '0' && chosen.slot === null, JSON.stringify(chosen));
    await win.click('#theme-editor .te-swatch[data-hex]');
    await win.waitForTimeout(150);
    const picked = await win.evaluate(() => ({ mix: JSON.parse(localStorage.getItem('nebula:backdrop-mix') || '{}').colors?.[0], chip: getComputedStyle(document.querySelector('#theme-editor .te-dot[data-x="0"]')).backgroundColor, theme: document.documentElement.dataset.theme }));
    check('a swatch then colours the style, and leaves the theme as it was', picked.mix === (await win.evaluate(() => document.querySelector('#theme-editor .te-swatch[data-hex]').dataset.hex.toLowerCase())) && picked.theme === chosen.theme, JSON.stringify(picked));
    await win.evaluate(() => document.querySelector('[data-mix-style="rings"]').dispatchEvent(new PointerEvent('pointerenter')));
    const pointed = await win.evaluate(() => { const p = document.getElementById('set-look-preview'); return p.classList.contains('has-backdrop') && /^url\("data:image\/png/.test(p.style.getPropertyValue('--backdrop-image')); });
    await win.evaluate(() => document.querySelector('[data-mix-style="rings"]').dispatchEvent(new PointerEvent('pointerleave')));
    const left = await win.evaluate(() => !document.getElementById('set-look-preview').classList.contains('has-backdrop'));
    check('a style pointed at is shown in the preview, and only there', pointed && left && !(await win.evaluate(() => document.querySelector('#app.has-backdrop'))), JSON.stringify({ pointed, left }));
    // 1.0.3 (the owner: "color picker basligi ekle, theme colours'un headeri ile ayni hizaya"; "yana dogru gitmek yerine alta gidiyor").
    await win.click('#theme-editor .te-dot-add');
    await win.click('#theme-editor .te-dot-add');
    await win.waitForTimeout(150);
    const pickRow = await win.evaluate(() => {
      const pick = document.querySelector('#theme-editor .te-pick-label');
      const head = document.querySelector('#theme-editor .te-pick__sets > .te-label');
      const dots = [...document.querySelectorAll('#theme-editor .te-extra .te-dot')].map((d) => d.getBoundingClientRect());
      return { pick: pick?.textContent, shown: !!pick && pick.offsetHeight > 0, level: !!pick && Math.abs(pick.getBoundingClientRect().top - head.getBoundingClientRect().top) < 1.5,
        dots: dots.length, oneRow: dots.every((d) => Math.abs(d.top - dots[0].top) < 1) };
    });
    check('the colours to choose from stand under a “Colour picker” head, level with Theme colours, and five styles’ colours stay on one row',
      pickRow.pick === 'Colour picker' && pickRow.shown && pickRow.level && pickRow.dots === 5 && pickRow.oneRow, JSON.stringify(pickRow));
    await win.click('#settings-close');

    // ---- a black hole on the map: its name open, its initials locked ------
    await win.click('#btn-new-hole');
    const HOLE = 'Secret Treasure Hoard Vault';
    await win.fill('#ov-hole .hole-name', HOLE);
    await win.fill('#ov-hole .hole-pin[data-pin="new"]', '482193');
    await win.fill('#ov-hole .hole-pin[data-pin="again"]', '482193');
    const holeButton = (label) => win.evaluate((l) => [...document.querySelectorAll('#ov-hole button')].find((b) => b.textContent.trim() === l)?.click(), label);
    await holeButton('Create');
    await win.waitForFunction(() => document.querySelector('#ov-hole .hole-key'), null, { polling: 50, timeout: 8000 });
    await holeButton('I have written it down');
    await win.waitForTimeout(300);
    await win.click('.galaxy-mini .galaxy-full');
    await win.waitForTimeout(900);
    await win.evaluate(() => {
      const real = CanvasRenderingContext2D.prototype.fillText;
      window.drawn = new Set();
      window.drawnMiddle = new Set();
      CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
        window.drawn.add(String(text));
        if (this.textBaseline === 'middle' && this.textAlign === 'center') window.drawnMiddle.add(String(text));
        return real.call(this, text, ...rest);
      };
    });
    const onMap = async () => {
      await win.evaluate(() => window.drawn.clear());
      await win.waitForTimeout(500);
      return win.evaluate(() => [...window.drawn]);
    };
    const open1 = await onMap();
    check('an open black hole is written with its whole name', open1.includes(HOLE), JSON.stringify(open1));
    const setLocked = async () => {
      await win.evaluate(() => document.querySelector('#holes-scroll .hole-lock').click());
      await win.waitForTimeout(600);
    };
    await setLocked();
    const initials = await win.evaluate(() => document.querySelector('#holes-scroll .hole-row').title);
    const shut = await onMap();
    check('locked, only its initials', shut.includes(initials) && !shut.some((s) => /Secret|Treasure/.test(s)), JSON.stringify({ initials, shut }));
    check('and they are inside the hole, not under it', await win.evaluate((i) => window.drawnMiddle.has(i), initials));
    if (process.env.NEBULA_SHOTS) await win.screenshot({ path: path.join(process.env.NEBULA_SHOTS, 'hole-locked.png') });
    await win.evaluate(() => document.querySelector('#holes-scroll .hole-row').click());
    await win.waitForFunction(() => !document.getElementById('ov-hole').hidden, null, { polling: 50 });
    await win.fill('#ov-hole .hole-pin', '482193');
    await holeButton('Open');
    await win.waitForFunction(() => document.getElementById('ov-hole').hidden, null, { polling: 50, timeout: 8000 });
    await win.waitForTimeout(500);
    check('opened again, the whole name is back', (await onMap()).includes(HOLE), JSON.stringify(await onMap()));
    await setLocked();
    const again = await onMap();
    check('and locked again, the initials', again.includes(initials) && !again.includes(HOLE), JSON.stringify(again));

    // ---- the new-note button and the label search in every language --------
    const measure = () => win.evaluate(() => {
      const button = document.getElementById('btn-new');
      const row = button.parentElement.getBoundingClientRect();
      const side = button.closest('.sidebar, aside, .side')?.getBoundingClientRect() ?? row;
      const small = [...button.parentElement.querySelectorAll('.new-folder')].filter((b) => b.offsetWidth).map((b) => b.getBoundingClientRect());
      const box = document.querySelector('.split-map .galaxy-search').getBoundingClientRect();
      const input = document.querySelector('.split-map .galaxy-search-input');
      const field = input.getBoundingClientRect();
      const g = document.createElement('canvas').getContext('2d');
      g.font = getComputedStyle(input).font;
      return {
        text: button.textContent, font: getComputedStyle(button).fontSize, whole: button.scrollWidth <= button.clientWidth,
        oneLine: button.getBoundingClientRect().height < 40, inside: small.every((b) => b.right <= row.right + .5) && row.right <= side.right + .5,
        placeholder: input.placeholder, left: Math.round(field.left - box.left), right: Math.round(box.right - field.right), room: field.width - g.measureText(input.placeholder).width,
      };
    });
    for (const lang of ['de', 'pl', 'tr', 'en']) {
      await win.evaluate((l) => document.querySelector(`[data-lang="${l}"]`)?.click(), lang);
      await win.waitForTimeout(400);
      const m = await measure();
      check(`${lang}: the new-note button holds its words on one line, at the same size`, m.whole && m.oneLine && m.inside && m.font === '13px', JSON.stringify(m));
      check(`${lang}: the search's words sit evenly in it, and whole`, Math.abs(m.left - m.right) <= 1 && m.room >= -1, JSON.stringify(m));
    }
    if (process.env.NEBULA_SHOTS) {
      await win.evaluate(() => document.querySelector('[data-lang="pl"]')?.click());
      await win.waitForTimeout(400);
      await win.screenshot({ path: path.join(process.env.NEBULA_SHOTS, 'universe-pl.png') });
      await win.evaluate(() => document.querySelector('[data-lang="en"]')?.click());
      await win.waitForTimeout(300);
    }

    // ---- one press empties the search --------------------------------------
    const wipe = '.split-map .galaxy-search-clear';
    const wipeShown = () => win.evaluate((s) => getComputedStyle(document.querySelector(s)).display !== 'none', wipe);
    check('with nothing in the search there is nothing to clear', !(await wipeShown()));
    for (const q of ['Alpha', 'Beta']) {
      await win.fill('.split-map .galaxy-search-input', q);
      await win.waitForTimeout(120);
      await win.keyboard.press('Enter');
    }
    await win.keyboard.type('Bet');
    const chipCount = () => win.evaluate(() => document.querySelectorAll('.split-map .galaxy-chip').length);
    check('with picks in it, Clear stands there', await chipCount() === 2 && await wipeShown(), String(await chipCount()));
    await win.click(wipe);
    await win.waitForTimeout(100);
    check('and one press takes all of it out', await chipCount() === 0 && await win.inputValue('.split-map .galaxy-search-input') === '' && !(await wipeShown()));
    await win.evaluate(() => document.querySelector('[data-lang="tr"]')?.click());
    await win.fill('.split-map .galaxy-search-input', 'x');
    await win.waitForTimeout(300);
    check('its word follows the language', await win.evaluate((s) => document.querySelector(s).textContent, wipe) === 'Temizle', await win.evaluate((s) => document.querySelector(s).textContent, wipe));
    await win.fill('.split-map .galaxy-search-input', '');
    await win.evaluate(() => document.querySelector('[data-lang="en"]')?.click());
    await win.evaluate(() => document.querySelector('.split-pane[data-note="@map"] .split-close')?.click());
    await win.waitForTimeout(300);

    check('nothing threw', errors.length === 0, errors.join(' | '));

    // ---- a window saved on a monitor that is gone -------------------------
    await app.close();
    fs.writeFileSync(path.join(profile, 'window.json'), JSON.stringify({ bounds: { x: 40000, y: 0, width: 1278, height: 800 }, maximized: false }));
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    await app.firstWindow();
    const onAScreen = () => app.evaluate(({ BrowserWindow, screen }) => {
      const b = BrowserWindow.getAllWindows()[0].getNormalBounds();
      return { b, on: screen.getAllDisplays().some(({ workArea: w }) => b.x >= w.x && b.y >= w.y && b.x + b.width <= w.x + w.width && b.y + b.height <= w.y + w.height) };
    });
    const opened = await onAScreen();
    check('a window saved off every screen opens on one', opened.on, JSON.stringify(opened.b));
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setBounds({ x: 40000, y: 0, width: 1278, height: 800 });
      w.minimize();
    });
    await app.evaluate(({ BrowserWindow }) => new Promise((done) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.once('restore', () => setTimeout(done, 100));
      w.restore();
    }));
    const back = await onAScreen();
    check('and one left out of sight comes back when it is restored', back.on, JSON.stringify(back.b));
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let failed = 0;
  await runIdeas103Checks((name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  });
  process.exit(failed ? 1 : 0);
}
