/**
 * 0.9.3 — the owner's "Ideas & Bugs" note, in the real app on a throwaway profile.
 *
 *   node tests/e2e/v093.mjs          (after npm run build; smoke runs it too)
 *
 * Languages, Tab in a list, picking a divider, a picture in the text against
 * Backspace, double-click for a caption, copying a picture, the right-click
 * menu on a misspelt word, and the save no longer freezing a large vault.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A real 16x8 PNG, one colour - a picture the clipboard can take. */
function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4);
  head[8] = 8; head[9] = 2; head[10] = 0; head[11] = 0; head[12] = 0;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (let x = 0; x < width; x += 1) rows.push(r, g, b);
  }
  const file = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head),
    chunk('IDAT', zlib.deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${file.toString('base64')}`;
}
const PIC = png(16, 8, [200, 60, 60]);
const FIG = `<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" data-ratio="2" style="width: 160px;"><img src="${PIC}" alt="Pasted image" draggable="false"></figure>`;

export async function runV093Checks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-v093-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`),
    JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1, ...extra }));
  seed('lists', '<h3>Bugs</h3><ul><li>first</li><li>second</li><li>third</li></ul>');
  seed('divider', '<p>above</p><hr class="blk-hr"><p>below</p>');
  seed('picture', `<p id="a">text</p>${FIG}<p id="b">after</p>`);
  seed('blocks', '<p id="t">Groceries</p><p id="z"><br></p>');
  seed('Shopping list', '<p>eggs</p>', { labels: ['home'] });
  // The owner's second round (Ideas note, 04:56): the structures that failed there.
  seed('edges', `<h1>Ideas</h1><hr class="blk-hr"><ul><li id="brli"><br>Bug var buradan</li></ul><p><br></p>${FIG}<p><br></p><p id="resmi">resmi buradan</p>${FIG}<ul><li id="rli">R Buradan</li></ul>`);
  seed('toggle-in', '<div class="blk-toggle" data-open="true"><p class="toggle-title">T</p><div class="toggle-body"><p id="in">inside</p></div></div><p id="out">after</p>');
  // The owner's Ideas note at 08:53: a loose <br> between the divider and the picture.
  seed('gapnote', `<h1>Ideas &amp; Bugs</h1><hr class="blk-hr"><br>${FIG}${FIG}<p>text</p>`);
  seed('embed', '<p>x</p><div class="link-block link-embed" contenteditable="false" data-block-type="link" data-kind="embed" data-url="http://127.0.0.1:1/"><a class="link-card" href="http://127.0.0.1:1/">x</a></div><p>y</p>');
  // A big note beside the one typed in: every save used to write all of them again.
  seed('big', `<p>${'long article words '.repeat(250_000)}</p>`, { updatedAt: 0 });
  // A sign-in page stand-in for an AI tab: it reports whether it was offered passkeys.
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<script>document.title = [typeof PublicKeyCredential, typeof navigator.credentials.get].join(",");</script>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 900));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const open = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
      await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
    };
    const caretIn = (selector, at = 'start') => win.evaluate(({ selector, at }) => {
      const ed = document.getElementById('editor');
      ed.focus();
      const el = ed.querySelector(selector);
      const t = el.firstChild || el;
      const r = document.createRange();
      r.setStart(t, at === 'end' ? (t.nodeValue ?? '').length : 0);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    }, { selector, at });
    const html = () => win.evaluate(() => document.getElementById('editor').innerHTML);

    // ---- Languages -------------------------------------------------------
    await open('lists');
    const noteBefore = await html();
    const row = await win.evaluate(() => {
      const langs = document.getElementById('lang-row');
      const r = langs.getBoundingClientRect();
      const v = document.getElementById('app-version').getBoundingClientRect();
      const side = document.getElementById('side').getBoundingClientRect();
      return {
        names: [...langs.querySelectorAll('[data-lang]')].map((b) => b.textContent).join(','),
        visible: !langs.hidden && r.width > 0,
        rightOfVersion: r.left >= v.right - 1 && Math.abs((r.top + r.bottom) / 2 - (v.top + v.bottom) / 2) < 8,
        fits: r.right <= side.right + 0.5,
        cut: [...langs.querySelectorAll('button')].some((b) => b.scrollWidth > b.clientWidth + 1),
      };
    });
    check('the four languages are always open, right of the version, and fit', row.visible && row.rightOfVersion && row.fits && !row.cut
      && row.names === 'English,Deutsch,Polski,Türkçe', JSON.stringify(row));
    await win.evaluate(() => document.querySelector('#lang-row [data-lang="de"]').click());
    const de = await win.evaluate(() => ({
      newNote: document.getElementById('btn-new').textContent.trim(),
      filter: document.getElementById('side-filter').placeholder,
      menu: document.querySelector('#app-menu button')?.textContent.trim(),
      on: document.querySelector('#lang-row .on')?.dataset.lang,
      lang: document.documentElement.lang,
    }));
    check('Deutsch: the interface is German', de.newNote === 'Neue Notiz' && de.filter === 'Notizen filtern…' && de.menu === 'Datei' && de.lang === 'de' && de.on === 'de', JSON.stringify(de));
    check('spelling is checked in the chosen language only', JSON.stringify(await app.evaluate(({ session }) => session.defaultSession.getSpellCheckerLanguages()))
      === JSON.stringify(['de-DE']) || (await app.evaluate(({ session }) => session.defaultSession.availableSpellCheckerLanguages.includes('de-DE'))) === false);
    check('a language never changes the note', await html() === noteBefore);
    await win.evaluate(() => document.querySelector('#lang-row [data-lang="tr"]').click());
    check('Türkçe: the menus follow', await win.evaluate(() => document.getElementById('btn-new').textContent.trim() === 'Yeni not'
      && document.querySelector('#app-menu button')?.textContent.trim() === 'Dosya'));
    await win.evaluate(() => document.querySelector('#app-menu button').click());
    check('a menu drawn after the switch is translated too', await win.evaluate(() =>
      [...document.querySelectorAll('.am-menu button, .am-menu [role="menuitem"]')].some((e) => /Yeni not/.test(e.textContent))));
    await win.keyboard.press('Escape');
    await win.evaluate(() => document.querySelector('#lang-row [data-lang="en"]').click());
    check('back to English', await win.evaluate(() => document.getElementById('btn-new').textContent.trim() === 'New note'));

    // ---- Tab in a list moves the item, not the list ----------------------
    await caretIn('li:nth-child(2)', 'end');
    await win.keyboard.press('Tab');
    const nested = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const second = [...ed.querySelectorAll('li')].find((li) => li.firstChild?.nodeValue === 'second');
      return {
        underFirst: second?.parentElement?.parentElement?.firstChild?.nodeValue === 'first',
        headingStill: !ed.querySelector('h3').closest('[data-ind]'),
        listStill: !ed.querySelector('ul').dataset.ind,
      };
    });
    check('Tab puts the item under the one above it, and nothing else moves', nested.underFirst && nested.headingStill && nested.listStill, JSON.stringify(nested));
    await win.keyboard.press('Shift+Tab');
    check('Shift+Tab brings it back', await win.evaluate(() => document.querySelectorAll('#editor ul').length === 1
      && [...document.querySelectorAll('#editor li')].map((li) => li.textContent).join(',') === 'first,second,third'));

    // ---- A divider is picked with a click --------------------------------
    await open('divider');
    const hr = await win.evaluate(() => { const r = document.querySelector('#editor hr').getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; });
    await win.mouse.click(hr.x, hr.y);
    check('a click selects the divider', await win.evaluate(() => document.querySelector('#editor hr').classList.contains('armed')));
    await win.keyboard.press('Backspace');
    check('Backspace takes the picked divider away', await win.evaluate(() => !document.querySelector('#editor hr')));
    await win.keyboard.press('Control+z');
    check('one undo brings it back', await win.evaluate(() => !!document.querySelector('#editor hr')));
    check('the divider\'s outline is never saved', !(await html()).includes('armed'));

    // ---- A picture in the text against Backspace and Delete --------------
    await open('picture');
    await caretIn('#b', 'start');
    await win.keyboard.press('Backspace');
    check('Backspace under a picture selects it instead of deleting it', await win.evaluate(() =>
      !!document.querySelector('#editor .note-image.sel') && document.querySelector('#b')?.textContent === 'after'));
    await win.keyboard.press('Backspace');
    check('the second Backspace deletes it', await win.evaluate(() => !document.querySelector('#editor .note-image')));
    await win.keyboard.press('Control+z');
    await caretIn('#a', 'end');
    await win.keyboard.press('Delete');
    check('Delete above a picture selects it too', await win.evaluate(() =>
      !!document.querySelector('#editor .note-image.sel') && document.querySelector('#a')?.textContent === 'text'));
    await win.keyboard.press('Escape');

    // ---- Double-click for a caption; copy a picture ----------------------
    const pic = await win.evaluate(() => { const r = document.querySelector('#editor .note-image img').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.dblclick(pic.x, pic.y);
    check('a double click on a picture opens its caption', await win.evaluate(() => document.activeElement?.classList.contains('image-caption')));
    await win.keyboard.type('A caption');
    await win.keyboard.press('Enter');
    check('the caption is kept', await win.evaluate(() => document.querySelector('#editor .image-caption')?.textContent === 'A caption'));
    await app.evaluate(({ clipboard }) => clipboard.clear());
    await win.mouse.click(pic.x, pic.y);
    await win.keyboard.press('Control+c');
    await win.waitForFunction(() => !document.getElementById('toast').hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    const copied = await app.evaluate(async ({ clipboard, nativeImage }) => { const i = await (async () => { const items = await clipboard.read(); const it = items.find((x) => x.types.includes('image/png')); return it ? nativeImage.createFromBuffer(Buffer.from(await (await it.getType('image/png')).arrayBuffer())) : nativeImage.createEmpty(); })(); return { empty: i.isEmpty(), size: i.getSize() }; });
    check('Ctrl+C on a selected picture puts the picture on the clipboard', !copied.empty && copied.size.width === 16, JSON.stringify(copied));

    // ---- The right-click menu --------------------------------------------
    await win.keyboard.press('Escape');   // the picture's bar would sit over the word
    // What the main process sends for a misspelt word, after a real right-click in the note.
    const word = await win.evaluate(() => { const r = document.createRange(); const t = document.querySelector('#a').firstChild; r.setStart(t, 1); r.setEnd(t, 2); const b = r.getBoundingClientRect(); return { x: b.left, y: b.top + b.height / 2 }; });
    // A right-click as the page sees it; the main process's half is sent by hand
    // below, since the spellchecker's verdict on a word cannot be arranged.
    await win.evaluate((p) => document.elementFromPoint(p.x, p.y).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: p.x, clientY: p.y })), word);
    await app.evaluate(({ BrowserWindow }, p) => BrowserWindow.getAllWindows()[0].webContents.send('ui:context-menu',
      { x: p.x, y: p.y, misspelledWord: 'txet', suggestions: ['text', 'test'], isEditable: true, mediaType: 'none', selectionText: '' }), word);
    await win.waitForFunction(() => !document.getElementById('ctx-menu')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    check('a misspelt word gets its suggestions and "Add to dictionary"', await win.evaluate(() =>
      [...document.querySelectorAll('#ctx-menu button')].map((b) => b.textContent).join('|') === 'text|test|Add to dictionary'),
      await win.evaluate(() => [document.getElementById('ctx-menu')?.hidden, [...document.querySelectorAll('#ctx-menu button')].map((b) => b.textContent).join('|')].join(' ')));
    await win.keyboard.press('Escape');
    await win.evaluate((p) => document.elementFromPoint(p.x, p.y).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: p.x, clientY: p.y })), pic);
    await app.evaluate(({ BrowserWindow }, p) => BrowserWindow.getAllWindows()[0].webContents.send('ui:context-menu',
      { x: p.x, y: p.y, misspelledWord: '', suggestions: [], isEditable: true, mediaType: 'image', selectionText: '' }), pic);
    await win.waitForTimeout(200);
    check('a picture gets Copy image, its caption and Delete image', await win.evaluate(() =>
      [...document.querySelectorAll('#ctx-menu button')].map((b) => b.textContent).join('|') === 'Copy image|Edit caption|Delete image'));
    await win.keyboard.press('Escape');

    // ---- The toggle list ---------------------------------------------------
    await open('blocks');
    await caretIn('#t', 'end');
    await win.evaluate(() => document.querySelector('[data-act="toggle"]').click());
    check('the toolbar makes the line a toggle title', await win.evaluate(() => {
      const tg = document.querySelector('#editor .blk-toggle');
      return tg?.dataset.open === 'true' && tg.firstElementChild.textContent === 'Groceries' && !!tg.querySelector('.toggle-body');
    }));
    await win.keyboard.press('End');
    await win.keyboard.press('Enter');
    await win.keyboard.type('milk');
    check('Enter in the title goes into the body', await win.evaluate(() =>
      document.querySelector('#editor .toggle-body')?.textContent === 'milk'));
    await win.keyboard.press('Enter');
    await win.keyboard.press('Enter');
    await win.keyboard.type('after the toggle');
    check('Enter on an empty last line leaves the toggle', await win.evaluate(() => {
      const tg = document.querySelector('#editor .blk-toggle');
      return tg.nextElementSibling?.textContent === 'after the toggle' && tg.querySelector('.toggle-body').textContent === 'milk';
    }));
    const arrow = await win.evaluate(() => { const r = document.querySelector('#editor .blk-toggle > :first-child').getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 }; });
    await win.mouse.click(arrow.x, arrow.y);
    check('a click on the arrow folds the body away', await win.evaluate(() => {
      const tg = document.querySelector('#editor .blk-toggle');
      return !tg.dataset.open && getComputedStyle(tg.querySelector('.toggle-body')).display === 'none';
    }));
    await win.mouse.click(arrow.x, arrow.y);
    check('and a second click opens it', await win.evaluate(() => document.querySelector('#editor .blk-toggle').dataset.open === 'true'));
    await win.evaluate(() => document.querySelector('[data-act="bullet"], [data-act="ul"]'));
    await win.evaluate(() => {
      const body = document.querySelector('#editor .toggle-body');
      body.insertAdjacentHTML('beforeend', '<ul><li>inside</li></ul>');
      document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await caretIn('.toggle-body li', 'end');
    await win.keyboard.press('Tab');
    check('a list inside a toggle stays inside it', await win.evaluate(() => !!document.querySelector('#editor .toggle-body ul')));

    // ---- @ mentions a note, # adds a label --------------------------------
    await caretIn('#z', 'start');
    await win.evaluate(() => {
      const z = document.querySelector('#z') || document.querySelector('#editor > p:last-child');
      const r = document.createRange(); r.selectNodeContents(z); r.collapse(false);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await win.keyboard.type('see @Shop');
    await win.waitForFunction(() => !document.getElementById('mention-menu')?.hidden, null, { polling: 50, timeout: 3000 }).catch(() => {});
    check('@ lists the notes that match', await win.evaluate(() =>
      [...document.querySelectorAll('#mention-menu button')].map((b) => b.textContent).join('|') === '@Shopping list'));
    await win.keyboard.press('Enter');
    check('Enter puts a mention of that note in', await win.evaluate(() => {
      const a = document.querySelector('#editor a.note-mention');
      return a?.textContent === '@Shopping list' && a.dataset.note === 'Shopping list' && a.getAttribute('contenteditable') === 'false';
    }));
    await win.keyboard.type('#errands ');
    check('#word and a space make a label chip', await win.evaluate(() => document.querySelector('#editor .note-tag')?.dataset.tag === 'errands'));
    await win.waitForTimeout(300);
    check('a label in the text is not added to the note\'s own labels', await win.evaluate(() =>
      ![...document.querySelectorAll('#note-labels .note-label')].some((c) => c.textContent === '#errands')
      && !document.querySelector('#editor .note-tag').hasAttribute('contenteditable')));
    await win.keyboard.press('Enter');
    await win.keyboard.type('#second ');
    check('a tag on the next line is not inside the one above', await win.evaluate(() =>
      document.querySelectorAll('#editor .note-tag').length === 2 && !document.querySelector('#editor .note-tag .note-tag')));
    const tagsBefore = await win.evaluate(() => document.querySelectorAll('#editor .note-tag').length);
    await win.keyboard.type('in C# and #1 ');
    check('"C#" and "#1" stay words', await win.evaluate((n) => document.querySelectorAll('#editor .note-tag').length === n, tagsBefore));
    check('the label filter is closed until its button is pressed', await win.evaluate(() => document.getElementById('label-filter').hidden));
    await win.evaluate(() => document.getElementById('label-filter-btn').click());
    await win.waitForTimeout(700);
    const groups = await win.evaluate(() => ({
      open: !document.getElementById('label-filter').hidden,
      all: [...document.querySelectorAll('#label-filter .label-chip')].map((c) => c.textContent).join(','),
    }));
    check('pressed, it shows every label, of the title and of the text, in one set', groups.open && groups.all === '#errands,#home,#second', JSON.stringify(groups));
    await win.evaluate(() => [...document.querySelectorAll('#label-filter .label-chip')].find((c) => c.textContent === '#home')?.click());
    check('a note label shows only its notes, and the button names it', await win.evaluate(() =>
      [...document.querySelectorAll('#note-list .note-row')].map((r) => r.title).join('|') === 'Shopping list'
      && document.querySelector('#label-filter-btn .lf-text').textContent === '#home'));
    await win.evaluate(() => [...document.querySelectorAll('#label-filter .label-chip')].find((c) => c.textContent === '#errands')?.click());
    check('a label in the text shows the notes with it in their text', await win.evaluate(() =>
      [...document.querySelectorAll('#note-list .note-row')].map((r) => r.title).join('|') === 'blocks'));
    await win.evaluate(() => document.querySelector('#label-filter-btn .lf-clear').click());
    check('its × shows every note again', await win.evaluate(() => document.querySelectorAll('#note-list .note-row').length > 3));
    // A label taken off the note by its title takes its #chips out of the text.
    await win.evaluate(() => document.querySelector('#note-labels .note-label-add').click());
    await win.keyboard.type('errands');
    await win.keyboard.press('Enter');
    await win.waitForTimeout(150);
    await win.evaluate(() => { const box = [...document.querySelectorAll('#label-picker label')].find((l) => l.textContent === '#errands')?.querySelector('input'); box?.click(); });
    await win.waitForTimeout(300);
    await win.keyboard.press('Escape');
    check('taking a label off the title leaves the #chips in the text', await win.evaluate(() =>
      [...document.querySelectorAll('#editor .note-tag')].some((c) => c.dataset.tag === 'errands')));
    // ⋯ -> Delete label: from every note, title and text.
    await win.evaluate(() => document.querySelector('#note-labels .note-label-add').click());
    await win.keyboard.type('second');
    await win.keyboard.press('Enter');
    await win.keyboard.press('Escape');
    await win.evaluate(() => { if (document.getElementById('label-filter').hidden) document.getElementById('label-filter-btn').click(); });
    await win.waitForTimeout(200);
    await win.evaluate(() => [...document.querySelectorAll('#label-filter .lf-row')].find((r) => r.textContent.startsWith('#second'))?.querySelector('.lf-more').click());
    const menuText = await win.evaluate(() => [...document.querySelectorAll('#label-menu button')].map((b) => b.textContent).join('|'));
    check('each label in the search has ⋯ with "Delete label"', menuText === 'Delete label', menuText);
    await win.evaluate(() => document.querySelector('#label-menu .lf-delete').click());
    const confirmText = await win.evaluate(() => document.querySelector('#label-menu .lf-confirm')?.textContent);
    check('it says what it will do before it does it', /^Delete #second from 1 notes\?$/.test(confirmText || ''), confirmText);
    await win.evaluate(() => document.querySelector('#label-menu .lf-delete--yes').click());
    await win.waitForTimeout(300);
    check('"Delete label" takes it off the title and out of the text', await win.evaluate(() =>
      ![...document.querySelectorAll('#editor .note-tag')].some((c) => c.dataset.tag === 'second')
      && ![...document.querySelectorAll('#note-labels .note-label')].some((c) => c.textContent === '#second')
      && [...document.querySelectorAll('#editor .note-tag')].some((c) => c.dataset.tag === 'errands')
      && ![...document.querySelectorAll('#label-filter .label-chip')].some((c) => c.textContent === '#second')));
    // Arrow keys walk through lines of chips; nothing is lost on the way.
    await win.evaluate(() => { const ed = document.getElementById('editor'); ed.insertAdjacentHTML('beforeend', '<p id="above">above</p><div><span class="note-tag" data-tag="one">#one</span> </div><div><span class="note-tag" data-tag="two">#two</span> </div><p id="under">under</p>'); ed.dispatchEvent(new Event('input', { bubbles: true })); });
    await caretIn('#above', 'end');
    for (let i = 0; i < 3; i++) await win.keyboard.press('ArrowDown');
    const walk = await win.evaluate(() => { const n = getSelection().anchorNode; const el = n?.nodeType === 1 ? n : n?.parentElement; return { at: el?.closest('p, div')?.id || el?.closest('p, div')?.textContent, chips: document.querySelectorAll('#editor .note-tag[data-tag="one"], #editor .note-tag[data-tag="two"]').length }; });
    check('ArrowDown walks through lines of #chips and they stay', walk.at === 'under' && walk.chips === 2, JSON.stringify(walk));
    const chip = await win.evaluate(() => { const r = document.querySelector('#editor a.note-mention').getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height / 2 }; });
    await win.mouse.click(chip.x, chip.y);
    await win.waitForFunction(() => document.querySelector('#title').value === 'Shopping list', null, { polling: 50, timeout: 3000 }).catch(() => {});
    check('a click on a mention opens that note', await win.evaluate(() => document.querySelector('#title').value === 'Shopping list'));

    // ---- The note's writing font --------------------------------------------
    await open('blocks');
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const p = document.createElement('p'); p.id = 'w'; p.innerHTML = '<br>'; ed.appendChild(p);
      ed.focus(); const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await win.evaluate(() => document.querySelector('[data-menu="menu-font"]').click());
    await win.evaluate(() => [...document.querySelectorAll('#menu-font [data-font]')].find((b) => b.textContent === 'Consolas').click());
    await win.keyboard.type('code words');
    check('a font picked with nothing selected is what the new line is written in', await win.evaluate(() => {
      const w = document.getElementById('w');
      return w.textContent === 'code words' && /Consolas/.test(getComputedStyle(w.querySelector('span') || w).fontFamily);
    }));
    check('the other lines keep their font', await win.evaluate(() => !/Consolas/.test(getComputedStyle(document.querySelector('.blk-toggle > :first-child')).fontFamily)));
    await win.keyboard.press('Control+z');
    check('one undo takes the words back', await win.evaluate(() => !document.getElementById('w')?.textContent.includes('code')));
    await win.waitForTimeout(600);
    const blocksNote = JSON.parse(fs.readFileSync(path.join(notes, 'blocks.json'), 'utf8'));
    check('the writing font is kept with the note', /Consolas/.test(blocksNote.font?.family || ''), JSON.stringify(blocksNote.font));

    // ---- A save in a vault with a big note does not freeze the window ----
    await open('picture');
    await caretIn('#b', 'end');
    await win.evaluate(() => {
      window.__longest = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longest = Math.max(window.__longest, e.duration); }).observe({ entryTypes: ['longtask'] });
    });
    await win.keyboard.type(' more');
    await win.waitForFunction(() => document.querySelector('#savestate').textContent === 'Saved', null, { polling: 50, timeout: 10_000 });
    await win.waitForTimeout(300);
    const longest = await win.evaluate(() => window.__longest);
    check('an autosave beside a 5 MB note takes no long pause', longest < 150, `${Math.round(longest)} ms`);
    const bigFile = JSON.parse(fs.readFileSync(path.join(notes, 'big.json'), 'utf8'));
    check('the big note on disk was not rewritten or changed', bigFile.updatedAt === 0 && bigFile.content.length > 4_000_000);

    // ---- The owner's second round -----------------------------------------
    await open('edges');
    await caretIn('#brli', 'start');
    await win.evaluate(() => { const li = document.getElementById('brli'); const t = [...li.childNodes].find((n) => n.nodeType === 3); const r = document.createRange(); r.setStart(t, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('Backspace');
    check('Backspace after a break at the start of an item removes the break, not the item', await win.evaluate(() => {
      const li = document.getElementById('brli');
      return !!li?.closest('ul') && !li.querySelector('br') && !document.querySelector('#editor hr.armed');
    }));
    await caretIn('#rli', 'start');
    await win.evaluate(() => { const t = document.getElementById('rli').firstChild; const r = document.createRange(); r.setStart(t, 1); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('Backspace');
    check('the letter at the start of a line under a picture is deleted, the picture is not selected', await win.evaluate(() =>
      document.getElementById('rli')?.textContent.replace(/ /g, ' ') === ' Buradan' && !document.querySelector('#editor .note-image.sel')),
      await win.evaluate(() => JSON.stringify([document.getElementById('rli')?.outerHTML, !!document.querySelector('#editor .note-image.sel'), document.getElementById('editor').innerHTML.replace(/src="[^"]*"/g, '').slice(-300)])));
    await caretIn('#resmi', 'start');
    await win.keyboard.press('Backspace');
    check('Backspace under an empty line removes the empty line and the caret stays', await win.evaluate(() => {
      const p = document.getElementById('resmi');
      const s = getSelection();
      return p.previousElementSibling?.matches('.note-image') && s.anchorNode && p.contains(s.anchorNode) && s.anchorOffset === 0;
    }));
    await win.keyboard.press('Backspace');
    check('the next Backspace selects the picture above', await win.evaluate(() => !!document.querySelector('#editor .note-image.sel')));
    await win.keyboard.press('Escape');
    await win.evaluate(() => { const p = document.getElementById('resmi'); const r = document.createRange(); r.selectNodeContents(p); document.getElementById('editor').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('Backspace');
    await win.keyboard.press('Backspace');
    check('emptying a line between two pictures takes it away and never leaves the caret in a caption', await win.evaluate(() => {
      const n = getSelection().anchorNode;
      const el = n?.nodeType === 1 ? n : n?.parentElement;
      return !document.getElementById('resmi') && !el?.closest?.('.image-caption') && document.activeElement?.id === 'editor'
        && (!!document.querySelector('#editor .note-image.sel') || (!!el && el.id !== 'editor'));
    }));

    // A picture right under a divider, an empty line between: Delete there
    // takes the line away and the picture comes up (the owner, 0.9.3).
    await win.evaluate((fig) => { const ed = document.getElementById('editor'); ed.innerHTML = `<p>t</p><hr class="blk-hr"><p id="gap"><br></p>${fig}<p id="below">below</p>`; ed.dispatchEvent(new Event('input', { bubbles: true })); }, FIG);
    await win.evaluate(() => { const g = document.getElementById('gap'); document.getElementById('editor').focus(); const r = document.createRange(); r.setStart(g, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('Delete');
    check('Delete on an empty line between a divider and a picture brings the picture up', await win.evaluate(() =>
      !document.getElementById('gap') && document.querySelector('#editor hr').nextElementSibling?.matches('.note-image')),
      await win.evaluate(() => document.getElementById('editor').innerHTML.replace(/src="[^"]*"/g, '').replace(/<span class="image-h"[^>]*><\/span>/g, '').slice(0, 300)));
    await win.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    // The same with Backspace: the line goes and the picture comes up; going
    // backwards, the divider is picked (not the picture, which the next
    // Backspace would have deleted — the long-note trials, 0.9.3), and no
    // caret is left between.
    await win.evaluate((fig) => { const ed = document.getElementById('editor'); ed.innerHTML = `<p>t</p><hr class="blk-hr"><p id="gap"><br></p>${fig}<p id="below">below</p>`; ed.dispatchEvent(new Event('input', { bubbles: true })); }, FIG);
    await win.evaluate(() => { const g = document.getElementById('gap'); document.getElementById('editor').focus(); const r = document.createRange(); r.setStart(g, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(100);
    check('Backspace on the empty line under a divider brings the picture up and picks the divider', await win.evaluate(() =>
      !document.getElementById('gap') && document.querySelector('#editor hr.armed')?.nextElementSibling?.matches('.note-image:not(.sel)')));
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(100);
    check('... and the next Backspace takes the divider, the picture stays', await win.evaluate(() =>
      !document.querySelector('#editor hr') && document.querySelectorAll('#editor .note-image').length === 1));
    await win.evaluate((fig) => { const ed = document.getElementById('editor'); ed.innerHTML = `<p>t</p><hr class="blk-hr">${fig}<p id="below">below</p>`; ed.dispatchEvent(new Event('input', { bubbles: true })); }, FIG);
    await win.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    const pic3 = await win.evaluate(() => { const r = document.querySelector('#editor .note-image img').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.click(pic3.x, pic3.y);
    await win.keyboard.press('Alt+ArrowUp');
    check('Alt+↑ moves a selected picture past the line above', await win.evaluate(() => document.querySelector('#editor hr').previousElementSibling?.matches('.note-image')));
    await win.keyboard.press('Enter');
    await win.keyboard.type('under the picture');
    check('Enter on a selected picture opens a line under it', await win.evaluate(() => document.querySelector('#editor .note-image').nextElementSibling?.textContent === 'under the picture'));

    // ---- Blocks inside a toggle stay inside it ---------------------------
    for (const [how, cmd, sel] of [['/todo', 'todo', '.blk-todo'], ['/code', 'code', '.blk-code'], ['/divider', 'divider', 'hr'], ['the to-do button', null, '.blk-todo']]) {
      await open('toggle-in');
      await caretIn('#in', 'end');
      await win.keyboard.press('Enter');
      if (cmd) {
        await win.keyboard.type(`/${cmd}`, { delay: 10 });
        await win.waitForTimeout(120);
        await win.keyboard.press('Enter');
      } else {
        await win.keyboard.type('line');
        await win.evaluate(() => document.querySelector('#toolbar [data-act="todo"]').click());
      }
      await win.waitForTimeout(120);
      check(`${how} inside a toggle stays inside it`, await win.evaluate((sel) =>
        !!document.querySelector(`#editor .toggle-body ${sel}`) && ![...document.querySelectorAll(`#editor ${sel}`)].some((e) => !e.closest('.toggle-body'))
        && !!document.querySelector('#editor .blk-toggle'), sel));
      await win.keyboard.press('Control+z');
    }
    await open('toggle-in');
    await win.evaluate(() => { const b = document.querySelector('#editor .toggle-body'); b.innerHTML = '<ul><li id="in">one</li></ul>'; });
    await caretIn('#in', 'end');
    await win.keyboard.press('Enter'); await win.keyboard.type('two'); await win.keyboard.press('Tab');
    await win.keyboard.press('Enter'); await win.keyboard.press('Enter');
    check('an empty item one level in comes back out on Enter, in the toggle', await win.evaluate(() => {
      const ul = document.querySelector('#editor .toggle-body > ul');
      return !!ul && !ul.querySelector(':scope > ul') && ul.children.length === 2 && ul.firstElementChild.querySelector('ul li')?.textContent === 'two';
    }));

    // ---- Crop a picture; resize an embed ---------------------------------
    await open('picture');
    const pic2 = await win.evaluate(() => { const r = document.querySelector('#editor .note-image img').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
    await win.mouse.click(pic2.x, pic2.y);
    await win.evaluate(() => document.querySelector('#image-bar [data-image="crop"]').click());
    const handle = await win.evaluate(() => { const r = document.querySelector('.crop-h[data-edge="e"]').getBoundingClientRect(); return { x: r.left + 6, y: r.top + 6 }; });
    await win.mouse.move(handle.x, handle.y);
    await win.mouse.down();
    await win.mouse.move(handle.x - pic2.w / 2, handle.y, { steps: 5 });
    await win.mouse.up();
    await win.keyboard.press('Enter');
    await win.waitForTimeout(300);
    const cropped = await win.evaluate(() => { const img = document.querySelector('#editor .note-image img'); return { w: img.naturalWidth, h: img.naturalHeight, frame: !!document.querySelector('.crop-frame') }; });
    check('✂ crops the picture to the frame (half its width here)', cropped.w === 8 && cropped.h === 8 && !cropped.frame, JSON.stringify(cropped));
    await win.keyboard.press('Control+z');
    check('one undo brings the whole picture back', await win.evaluate(() => document.querySelector('#editor .note-image img').naturalWidth === 16 || document.querySelector('#editor .note-image img').src.length > 0));
    await open('embed');
    const grip = await win.evaluate(() => { const g = document.querySelector('#editor .link-embed .embed-h[data-edge="se"]'); const r = g?.getBoundingClientRect(); return r ? { x: r.left + 6, y: r.top + 6, w: g.closest('.link-block').getBoundingClientRect().width } : null; });
    check('an embed has handles on its four sides and corners', !!grip && await win.evaluate(() => document.querySelectorAll('#editor .link-embed .embed-h').length === 8));
    if (grip) {
      await win.mouse.move(grip.x, grip.y);
      await win.mouse.down();
      await win.mouse.move(grip.x - 120, grip.y + 80, { steps: 5 });
      await win.mouse.up();
      // The pointer's travel is the page's over its zoom (a wide note opens fitted to the window).
      const size = await win.evaluate(() => { const c = document.querySelector('#editor .link-embed'); return { w: c.getBoundingClientRect().width, h: c.style.getPropertyValue('--embed-h'), z: Number.parseFloat(document.getElementById('editor').style.zoom || '1') }; });
      check('dragging it makes the embed narrower and taller, and it is kept', Math.abs(size.w - (grip.w - 120)) < 3 && size.h === `${Math.round(300 + 80 / size.z)}px`, JSON.stringify({ ...size, was: grip.w }));
      const west = await win.evaluate(() => { const r = document.querySelector('#editor .link-embed .embed-h[data-edge="w"]').getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; });
      await win.mouse.move(west.x, west.y);
      await win.mouse.down();
      await win.mouse.move(west.x - 60, west.y, { steps: 4 });
      await win.mouse.up();
      check('pulling the left side out widens it', await win.evaluate((w) => Math.abs(document.querySelector('#editor .link-embed').getBoundingClientRect().width - w) < 3, size.w + 60));
    }
    await win.evaluate(() => document.getElementById('btn-new').click());
    await win.evaluate(() => { const ed = document.getElementById('editor'); ed.focus(); document.execCommand('insertText', false, 'x'); });
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.com/pasted'));
    await win.keyboard.press('Control+v');
    const embedBtn = await win.waitForFunction(() => { const b = document.querySelector('#link-menu [data-link-kind="embed"]'); return b?.offsetParent ? true : null; }, null, { polling: 50, timeout: 3000 }).then(() => true).catch(() => false);
    if (embedBtn) await win.evaluate(() => document.querySelector('#link-menu [data-link-kind="embed"]').click());
    await win.waitForTimeout(200);
    check('a freshly pasted embed has its handles at once', await win.evaluate(() => document.querySelectorAll('#editor .link-embed .embed-h').length === 8));

    // ---- Nothing between a divider and the picture under it (0.9.3) -------
    await open('gapnote');
    check('a loose <br> between a divider and a picture is gone when the note opens', await win.evaluate(() =>
      document.querySelector('#editor hr').nextElementSibling?.matches('.note-image')), (await html()).replace(/src="[^"]*"/g, '').slice(0, 200));
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const hr = ed.querySelector('hr');
      hr.after(Object.assign(document.createElement('p'), { id: 'gap2', innerHTML: '<br>' }));
      ed.focus();
      const r = document.createRange(); r.setStart(document.getElementById('gap2'), 0); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await win.keyboard.press('Backspace');                 // the gap goes, the divider is picked
    await win.waitForTimeout(150);
    const firstPic = await win.evaluate(() => { const r = document.querySelector('#editor hr + .note-image img').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.click(firstPic.x, firstPic.y);           // the picture under the divider, selected
    await win.waitForTimeout(150);
    await win.keyboard.press('Backspace');                 // ...and deleted
    await win.waitForTimeout(250);
    check('taking away the picture under a divider selects the next one, and no caret blinks between them', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const next = ed.querySelector('hr').nextElementSibling;
      return ed.querySelectorAll('.note-image').length === 1 && next?.matches('.note-image.sel')
        && getComputedStyle(ed).caretColor === 'rgba(0, 0, 0, 0)';
    }), await win.evaluate(() => { const ed = document.getElementById('editor'); const s = getSelection(); const r = s.rangeCount ? s.getRangeAt(0) : null; return `pics=${ed.querySelectorAll('.note-image').length} sel=${ed.querySelectorAll('.note-image.sel').length} caret=${r ? (r.startContainer === ed ? 'EDITOR' : r.startContainer.nodeName) + '@' + r.startOffset + (r.collapsed ? '' : ' RANGE') : 'none'} kids=${[...ed.children].slice(0, 5).map((c) => c.tagName + (c.classList.contains('sel') ? '*' : '') + (c.classList.contains('armed') ? '!' : '')).join(',')} color=${getComputedStyle(ed).caretColor}`; }));
    await win.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    // ↓ from the end of the heading: the caret landed beside the divider, on
    // no line, and blinked at its left end (the owner, 0.9.3, "halen var").
    await caretIn('h1', 'end');
    await win.keyboard.press('ArrowDown');
    await win.waitForTimeout(200);
    check('↓ from the heading goes past the divider to the picture, never beside the divider', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const s = getSelection();
      const aboveDivider = s.rangeCount && s.isCollapsed && s.anchorNode === ed && ed.childNodes[s.anchorOffset]?.matches?.('hr');
      return !aboveDivider && !!ed.querySelector('hr + .note-image.sel');
    }), await win.evaluate(() => { const s = getSelection(); const n = s.anchorNode; return `${n?.nodeName}@${s.anchorOffset} ${[...document.getElementById('editor').children].map((c) => c.tagName + (c.classList.contains('sel') ? '*' : '')).join(',')}`; }));
    await caretIn('h1', 'end');
    await win.keyboard.press('ArrowRight');
    await win.waitForTimeout(200);
    check('→ at the end of the heading does the same', await win.evaluate(() => {
      const s = getSelection();
      const ed = document.getElementById('editor');
      return !(s.isCollapsed && s.anchorNode === ed && ed.childNodes[s.anchorOffset]?.matches?.('hr')) && !!ed.querySelector('hr + .note-image.sel');
    }));
    await win.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    // Esc on the picture under the divider: the caret was left beside it on
    // the editor and blinked there once the picture was let go (0.9.3).
    await caretIn('h1', 'end');
    await win.keyboard.press('ArrowDown');
    await win.waitForTimeout(150);
    await win.keyboard.press('Escape');
    await win.waitForTimeout(200);
    check('Esc on the picture under the divider puts the caret on a line, never beside the divider', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const s = getSelection();
      return !ed.querySelector('.note-image.sel') && s.rangeCount > 0 && s.anchorNode !== ed && ed.contains(s.anchorNode);
    }));
    // A long line of preformatted text (a pasted JSON error) wraps.
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const pre = document.createElement('pre');
      pre.id = 'longpre';
      pre.textContent = `"errors":[{"message":"Unauthorized request","long_message":"${'x'.repeat(400)}"}]`;
      ed.append(pre);
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    check('a long pasted <pre> line wraps instead of widening the note', await win.evaluate(() => {
      const pre = document.getElementById('longpre');
      const ok = pre.scrollWidth <= pre.clientWidth + 1 && pre.getBoundingClientRect().right <= document.getElementById('editor').getBoundingClientRect().right + 1;
      pre.remove();
      document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true }));
      return ok;
    }));

    // ---- The page width beside Saved (0.9.3) -----------------------------
    const column = () => win.evaluate(() => Math.round(document.querySelector('#editor p, #editor div, #editor li')?.getBoundingClientRect().width ?? 0));
    await win.waitForTimeout(700);    // the last edit's save has landed
    const pageNote = await win.evaluate(() => document.querySelector('#title').value);
    const datedBefore = JSON.parse(fs.readFileSync(path.join(notes, `${pageNote}.json`), 'utf8')).updatedAt;
    // 100 % is real size: the line measured on screen, over the page's zoom, is the paper's in CSS pixels.
    const pageZoom = () => win.evaluate(() => Number.parseFloat(document.getElementById('editor').style.zoom || '1'));
    await win.click('#page-modes [data-page="a5"]');
    await win.selectOption('#zoom-select', '100');
    await win.waitForTimeout(150);
    const real = await pageZoom();
    const a5 = Math.round((await column()) / real);
    await win.click('#page-modes [data-page="a4"]');
    await win.selectOption('#zoom-select', '100');
    await win.waitForTimeout(150);
    const a4 = Math.round((await column()) / real);
    // The page asked while Windows was still answering got 1: 100 % was CSS's size, not the paper's.
    check('100 % is the screen’s real size, the one the main process measured', Math.abs(real - await win.evaluate(() => window.nebula.display.realScale())) < 0.003, String(real));
    // Shapes and pictures are placed on the paper: the canvas is the sheet.
    check('the canvas is the paper: as wide as the sheet, from its left edge', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      let layer = ed.querySelector(':scope > .shape-layer:not(.shape-layer--behind)');
      const made = !layer;
      if (made) { layer = document.createElement('div'); layer.className = 'shape-layer'; ed.prepend(layer); }
      const z = Number.parseFloat(ed.style.zoom || '1');
      const r = layer.getBoundingClientRect();
      const e = ed.getBoundingClientRect();
      const margin = Number.parseFloat(ed.style.getPropertyValue('--page-margin'));
      const edge = e.left + (Number.parseFloat(getComputedStyle(ed).paddingLeft) - margin) * z;
      const ok = Math.abs(r.width / z - 794) <= 2 && Math.abs(r.left - edge) <= 2;
      if (made) layer.remove();
      return ok;
    }));
    check('A5 and A4 make the line as long as on that paper (463 / 698 px)', Math.abs(a5 - 463) <= 2 && Math.abs(a4 - 698) <= 2, `${a5} ${a4}`);
    await win.waitForTimeout(600);
    const stored = JSON.parse(fs.readFileSync(path.join(notes, `${pageNote}.json`), 'utf8'));
    check('the page width is kept on the note, without dating it', stored.page === 'a4' && stored.updatedAt === datedBefore, `${stored.page} ${stored.updatedAt} ${datedBefore}`);
    check('the print sheet follows the paper', (await win.evaluate(() => document.getElementById('page-print-size')?.textContent || '')).includes('210mm 297mm'));
    // A4 at 100 % (its own default) stores nothing, so A5 below opens at its default.
    check('choosing the page’s own default zoom stores none', await (async () => { await win.waitForTimeout(600); return !('zoom' in JSON.parse(fs.readFileSync(path.join(notes, `${pageNote}.json`), 'utf8'))); })());
    await win.click('#page-modes [data-page="nw"]');
    await win.waitForTimeout(150);
    check('NW is A4 turned sideways: a 1027 px line (or the room there is), pages 698 px tall', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      return ed.style.getPropertyValue('--page-col') === '1027px' && ed.style.getPropertyValue('--page-break') === '698px';
    }));
    check('NW is the page as it always was: no paper, the whole width, 100 % the screen’s size, nothing to fit', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const fr = document.getElementById('editor-frame');
      const s = document.getElementById('zoom-select');
      return !('paper' in ed.dataset) && s.value === '100' && !ed.style.zoom && s.options[0].hidden
        && getComputedStyle(ed).paddingLeft === '28px' && getComputedStyle(ed).backgroundImage === 'none'
        && fr.scrollWidth <= fr.clientWidth + 1;
    }));
    // Half the window: fit to page is measured again (A3, which opens fitted).
    await win.click('#page-modes [data-page="a3"]');
    await win.waitForTimeout(200);
    const fitWide = await pageZoom();
    const winBounds = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; const b = w.getBounds(); w.setBounds({ ...b, width: Math.round(b.width * 0.6) }); return b; });
    await win.waitForTimeout(500);
    const fitHalf = await pageZoom();
    check('fit to page follows the window when it is made narrower', fitHalf < fitWide - 0.05
      && await win.evaluate(() => { const fr = document.getElementById('editor-frame'); return fr.scrollWidth <= fr.clientWidth + 1; }), `${fitWide} ${fitHalf}`);
    await app.evaluate(({ BrowserWindow }, b) => BrowserWindow.getAllWindows()[0].setBounds(b), winBounds);
    await win.waitForTimeout(400);
    await win.click('#page-modes [data-page="nw"]');
    await win.waitForTimeout(200);
    check('a press on NW says what it is', await win.evaluate(() => { const h = document.querySelector('.page-mode-hint'); return !h.hidden && /A4/.test(h.textContent); }));
    await win.click('#page-modes [data-page="a5"]');
    await win.waitForTimeout(200);
    check('A5 opens at its real size, 100 %; fit to page is the first in the box', await win.evaluate(() => {
      const s = document.getElementById('zoom-select');
      return s.value === '100' && s.selectedOptions[0].title === 'Actual size' && s.options[0].value === 'fit' && /^Fit \(\d+%\)$/.test(s.options[0].textContent);
    }));
    // B4 at 100 %: no sideways scroll while the sheet itself fits (a 12px gutter used to start it early).
    await win.click('#page-modes [data-page="b4"]');
    await win.selectOption('#zoom-select', '100');
    await win.waitForTimeout(200);
    check('a page at 100 % scrolls sideways only when the sheet itself is wider than the frame', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const fr = document.getElementById('editor-frame');
      const z = Number.parseFloat(ed.style.zoom || '1');
      const sb = Number.parseFloat(ed.style.getPropertyValue('--sb')) || 0;
      return fr.scrollWidth <= Math.max(fr.clientWidth, Math.ceil((945 + sb) * z)) + 1;
    }));
    // "Fit (25%)": the share of the real size fitting is, as it changes.
    await win.selectOption('#zoom-select', 'fit');
    await win.waitForTimeout(200);
    check('fit shows its percentage of the real size', await win.evaluate((r) => {
      const z = Number.parseFloat(document.getElementById('editor').style.zoom || '1');
      const pct = Number(/\((\d+)%\)/.exec(document.getElementById('zoom-select').options[0].textContent)?.[1]);
      return Math.abs(pct - Math.round((z / r) * 100)) <= 1;
    }, real));
    // Only view still zooms: the page zoom is how the note is looked at, not an edit.
    await win.evaluate(() => { document.body.classList.add('note-readonly'); });
    check('in Only view the zoom stays bright and pressable', await win.evaluate(() => {
      const g = document.getElementById('tb-zoom');
      return getComputedStyle(g).pointerEvents === 'auto' && getComputedStyle(g).opacity === '1'
        && getComputedStyle(document.querySelector('#toolbar [data-act="bold"]')).opacity === '0.45';
    }));
    await win.evaluate(() => { document.body.classList.remove('note-readonly'); });
    await win.selectOption('#zoom-select', '100');
    await win.click('#page-modes [data-page="a5"]');
    await win.waitForTimeout(200);
    // A narrow window: real size shows the whole sheet, its edges too, and scrolls sideways.
    check('A5 at real size shows the paper’s edges, never cuts them off', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const pad = Number.parseFloat(getComputedStyle(ed).paddingLeft);
      return pad >= Number.parseFloat(ed.style.getPropertyValue('--page-margin')) - 0.5;
    }));
    // A page wider than the window scrolls sideways; the line stays the paper's.
    await win.click('#page-modes [data-page="b3"]');
    await win.selectOption('#zoom-select', '200');
    await win.waitForTimeout(200);
    check('B3 at 200 % keeps its 1238 px line and the frame scrolls sideways', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const fr = document.getElementById('editor-frame');
      const p = ed.querySelector('p, div, li');
      const z = Number.parseFloat(ed.style.zoom || '1');
      return fr.scrollWidth > fr.clientWidth && Math.abs(p.getBoundingClientRect().width / z - 1238) <= 3;
    }));
    await win.selectOption('#zoom-select', '100');
    await win.click('#page-modes [data-page="nn"]');
    await win.waitForTimeout(200);
    check('NN is A4 written close to its edges: a 746 px line', await win.evaluate(() => document.getElementById('editor').style.getPropertyValue('--page-col') === '746px'));
    check('NN is at the screen’s own size: 100 % leaves no zoom', await win.evaluate(() => document.getElementById('zoom-select').value === '100' && !document.getElementById('editor').style.zoom));

    // ---- The PDF export's preview (0.9.3) --------------------------------
    const exportPdf = () => win.evaluate(() => {
      document.querySelector('[data-menu="menu-export"]').click();
      [...document.querySelectorAll('#menu-export button')].find((b) => b.dataset.format === 'pdf').click();
    });
    const previewState = () => win.evaluate(() => {
      const ov = document.getElementById('ov-pdf');
      const view = ov.querySelector('webview');
      return { open: !ov.hidden, orient: !ov.querySelector('[data-orient-group]').hidden, paper: ov.querySelector('.pdf-paper').textContent,
        src: view?.getAttribute('src') || '', plugins: view?.hasAttribute('plugins'), ready: !ov.querySelector('[data-pdf="export"]').disabled };
    });
    const previewFiles = () => { try { return fs.readdirSync(path.join(profile, 'pdf-preview')).length; } catch { return 0; } };
    // NN: its paper is said, nothing to turn.
    await exportPdf();
    for (let i = 0; i < 40 && !(await previewState()).ready; i += 1) await win.waitForTimeout(150);
    const nnPreview = await previewState();
    check('PDF export opens a preview of the pages first, on the note’s paper (NN: A4, 6.35 mm)', nnPreview.open && !nnPreview.orient
      && /210 × 297 mm · 6\.35 mm/.test(nnPreview.paper) && /\.pdf#/.test(nnPreview.src) && nnPreview.plugins && previewFiles() === 1, JSON.stringify(nnPreview));
    await win.click('#ov-pdf [data-pdf="cancel"]');
    await win.waitForTimeout(300);
    check('Cancel closes it and the preview’s PDF is gone', !(await previewState()).open && previewFiles() === 0);
    // NW: landscape or portrait.
    await win.click('#page-modes [data-page="nw"]');
    await win.waitForTimeout(150);
    await exportPdf();
    for (let i = 0; i < 40 && !(await previewState()).ready; i += 1) await win.waitForTimeout(150);
    const across = await previewState();
    await win.click('#ov-pdf [data-orient="portrait"]');
    for (let i = 0; i < 40 && (await previewState()).src === across.src; i += 1) await win.waitForTimeout(150);
    for (let i = 0; i < 40 && !(await previewState()).ready; i += 1) await win.waitForTimeout(150);
    const upright = await previewState();
    check('a Nebula Wide note chooses A4 landscape or portrait, and the pages are made again', across.orient && /297 × 210/.test(across.paper)
      && /210 × 297/.test(upright.paper) && upright.src !== across.src && previewFiles() === 1, JSON.stringify({ across, upright }));
    check('the choice is remembered, and NW prints that way up', await win.evaluate(() => localStorage.getItem('nebula:nw-orientation') === 'portrait'
      && document.getElementById('page-print-size').textContent.includes('210mm 297mm')));
    await win.click('#ov-pdf [data-orient="landscape"]');
    await win.waitForTimeout(300);
    await win.click('#ov-pdf [data-pdf="cancel"]');
    await win.waitForTimeout(300);
    check('turned back to landscape and closed: no preview left behind', !(await previewState()).open && previewFiles() === 0
      && await win.evaluate(() => localStorage.getItem('nebula:nw-orientation') === 'landscape'));
    // ---- Auto order page (0.9.3) -----------------------------------------
    // A shape across the first page line goes to just under it; NW has nothing to order.
    check('Auto order page does nothing on Nebula Wide (the button is off, and faded)', await win.evaluate(() => {
      const b = document.getElementById('btn-order-page');
      return b.disabled && Number(getComputedStyle(b).opacity) < 0.35;
    }));
    await win.click('#page-modes [data-page="a4"]');
    await win.waitForTimeout(200);
    const lineAt = () => win.evaluate(() => {
      const ed = document.getElementById('editor');
      return 16 - Number.parseFloat(ed.style.getPropertyValue('--page-title')) + Number.parseFloat(ed.style.getPropertyValue('--page-break'));
    });
    const firstLine = await lineAt();
    check('the first page line leaves room for the title the PDF prints on page one', firstLine < 16 + 1027 - 40 && firstLine > 16 + 1027 - 140, String(firstLine));
    const crossing = async () => {
      await win.evaluate((y) => {
        const ed = document.getElementById('editor');
        let layer = ed.querySelector(':scope > .shape-layer:not(.shape-layer--behind)');
        if (!layer) { layer = document.createElement('div'); layer.className = 'shape-layer'; layer.setAttribute('contenteditable', 'false'); ed.prepend(layer); }
        layer.querySelector('#order-me')?.remove();
        layer.insertAdjacentHTML('beforeend', `<div class="shape rect" id="order-me" data-kind="rect" style="left:40px;top:${Math.round(y - 50)}px;width:120px;height:100px;background:#D6E4D0"><div class="shape-text" contenteditable="false"></div></div>`);
        ed.dispatchEvent(new Event('input', { bubbles: true }));
      }, firstLine);
    };
    await crossing();
    await win.click('#btn-order-page');
    await win.waitForTimeout(200);
    check('pressed, a shape across the page line moves to just under it', await win.evaluate((y) => {
      const top = Number.parseFloat(document.getElementById('order-me').style.top);
      return Math.abs(top - (y + 8)) <= 2;
    }, firstLine));
    // On by itself: the note's ⋯ menu.
    await win.evaluate(() => {
      document.querySelector('.note-item.active .nr-more')?.click();
      if (document.getElementById('note-menu').hidden) document.querySelector('.note-row.active')?.parentElement.querySelector('.nr-more')?.click();
    });
    await win.waitForTimeout(150);
    const menuLabel = await win.evaluate(() => { const b = document.querySelector('#note-menu [data-note-act="autoorder"]'); return b && !document.getElementById('note-menu').hidden ? b.textContent : null; });
    if (menuLabel) await win.click('#note-menu [data-note-act="autoorder"]');
    await win.waitForTimeout(600);
    await crossing();
    await win.mouse.click(5, 5);
    await win.evaluate(() => document.getElementById('editor').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    await win.waitForTimeout(700);
    check('turned on in the ⋯ menu, the note puts it right by itself', menuLabel === 'Auto order page: not active' && await win.evaluate((y) => {
      const top = Number.parseFloat(document.getElementById('order-me').style.top);
      return Math.abs(top - (y + 8)) <= 2;
    }, firstLine), String(menuLabel));
    check('while it is on, the button stays pressed and “Auto order mode is on” shows by the title', await win.evaluate(() => {
      const b = document.getElementById('btn-order-page');
      return b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true' && !document.getElementById('order-chip').hidden;
    }));
    await win.click('#order-chip');
    await win.waitForTimeout(200);
    check('the word by the title turns it off', await win.evaluate(() => document.getElementById('order-chip').hidden && !document.getElementById('btn-order-page').classList.contains('on')));
    await win.evaluate(() => { document.getElementById('order-me')?.remove(); document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true })); });
    await win.click('#page-modes [data-page="nn"]');
    await win.waitForTimeout(150);
    await win.click('#page-modes [data-page="a5"]');
    await win.waitForTimeout(200);
    await win.click('#page-modes [data-page="nw"]');
    await win.waitForTimeout(200);

    // ---- Page zoom beside the alignment (0.9.3) --------------------------
    // Under CSS zoom a drag must follow the pointer: a shape at 150 % ran half
    // as far again until the drag divided by the zoom.
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<div class="shape-layer" contenteditable="false"><div class="shape rect" data-kind="rect" style="left:60px;top:20px;width:170px;height:110px;background:#D6E4D0"><div class="shape-text" contenteditable="false">z</div><span class="shape-h"></span></div></div><p>zoomed line</p>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await win.selectOption('#zoom-select', '150');
    await win.waitForTimeout(150);
    const z0 = await win.evaluate(() => { const r = document.querySelector('#editor .shape').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    await win.mouse.move(z0.x + 20, z0.y + 8);
    await win.mouse.down();
    await win.mouse.move(z0.x + 70, z0.y + 8, { steps: 5 });
    await win.mouse.move(z0.x + 120, z0.y + 8, { steps: 5 });
    await win.mouse.up();
    const z1 = await win.evaluate(() => document.querySelector('#editor .shape').getBoundingClientRect().left);
    check('at 150 % a shape follows the pointer (100 px dragged, 100 px moved)', Math.abs((z1 - z0.x) - 100) <= 3, String(Math.round(z1 - z0.x)));
    // On NW, 100 % is the screen's own size: 150 % is 1.5.
    check('the zoom is on the page and in the box', await win.evaluate(() => document.getElementById('editor').style.zoom === '1.5' && document.getElementById('zoom-select').value === '150'));
    await win.click('#tb-zoom [data-zoom="out"]');
    check('− steps the zoom down', await win.evaluate(() => document.getElementById('zoom-select').value === '125'));
    await win.selectOption('#zoom-select', '100');
    check('100 % on NW leaves no zoom on the page (the old size)', await win.evaluate(() => !document.getElementById('editor').style.zoom));

    // ---- Folders and a dragged order in the list (0.9.3) -------------------
    const listed = () => win.evaluate(() => [...document.querySelectorAll('#note-list .note-item')].map((el) =>
      el.classList.contains('folder-item') ? `[${el.querySelector('.fr-name').textContent}]` : el.querySelector('.note-row').title));
    const noteRow = (t) => `#note-list .note-row[title="${t}"]`;
    await win.click('#btn-new-folder');
    await win.waitForSelector('#ov-dialog:not([hidden])');
    await win.fill('#dlg-input', 'Work');
    await win.keyboard.press('Enter');
    await win.waitForSelector('#note-list .folder-empty');
    check('New folder makes a named folder, open and empty', (await listed()).includes('[Work]'));
    // Notes on screen: a drag that has to scroll the list on the way is cut
    // short by the test driver, not by the app.
    await win.dragAndDrop(noteRow('picture'), '#note-list .folder-empty');
    await win.waitForTimeout(200);
    check('a note dragged onto a folder goes into it', await win.evaluate(() =>
      !!document.querySelector('#note-list .folder-notes .note-row[title="picture"]')));
    const before = (await listed()).filter((x) => !x.startsWith('[') && x !== 'picture');
    await win.dragAndDrop(noteRow(before[3]), noteRow(before[0]), { targetPosition: { x: 20, y: 3 } });
    await win.waitForTimeout(200);
    const after = (await listed()).filter((x) => !x.startsWith('[') && x !== 'picture');
    check('a note dragged above another stands there', after[0] === before[3] && after[1] === before[0], after.join(', '));
    // Dragging never pins or unpins (the owner, 0.9.3: "a note moved above the folder was pinned").
    const pinnedOf = (t) => win.evaluate((t) => !!document.querySelector(`#note-list .note-row[title="${t}"] .nr-pin`), t);
    await win.hover(noteRow(after[2]));
    await win.click(`#note-list .note-item:has(> .note-row[title="${after[2]}"]) .nr-more`);
    await win.click('[data-note-act="pin"]');
    await win.waitForTimeout(200);
    const pinnedName = after[2];
    await win.dragAndDrop(noteRow(after[1]), noteRow(pinnedName), { targetPosition: { x: 20, y: 3 } });
    await win.waitForTimeout(200);
    check('a note dropped among the pinned ones is not pinned by it', !(await pinnedOf(after[1])) && (await pinnedOf(pinnedName)));
    await win.dragAndDrop(noteRow(pinnedName), noteRow(after[4]), { targetPosition: { x: 20, y: 30 } });
    await win.waitForTimeout(200);
    check('a pinned note dropped among the others stays pinned', await pinnedOf(pinnedName));
    // At the row's very foot: if the rows shift as the folder lifts off, the
    // pointer is then at the next row's head — the same place, under this note.
    // y: 30 sat near the middle and once landed a row low on a busy machine.
    const targetHeight = await win.evaluate((t) => document.querySelector(`#note-list .note-row[title="${t}"]`).getBoundingClientRect().height, after[1]);
    await win.dragAndDrop('#note-list .folder-row', noteRow(after[1]), { targetPosition: { x: 20, y: Math.max(1, Math.round(targetHeight) - 3) } });
    await win.waitForTimeout(200);
    const withFolder = await listed();
    check('a folder is dragged below a note like a note', withFolder.indexOf('[Work]') === withFolder.indexOf(after[1]) + 1, withFolder.join(', '));
    await win.click('#note-list .folder-row');
    check('a click on a folder closes it, and shows its notes again', !(await listed()).includes('picture'));
    await win.click('#note-list .folder-row');
    check('... and opens it', (await listed()).includes('picture'));
    await win.waitForTimeout(600);
    const vault = JSON.parse(fs.readFileSync(path.join(profile, 'storage', 'folders.json'), 'utf8'));
    const shop = JSON.parse(fs.readFileSync(path.join(notes, 'picture.json'), 'utf8'));
    check('the folder is kept in the vault, and the note says it is in it', vault.folders?.[0]?.name === 'Work' && shop.folder === vault.folders[0].id);
    await win.hover('#note-list .folder-item');
    await win.click('#note-list .fr-more');
    await win.click('#folder-menu .fm-delete');
    await win.click('#folder-menu .fm-delete--yes');
    await win.waitForTimeout(200);
    check('deleting a folder keeps its notes, back in the list', !(await listed()).some((x) => x.startsWith('[')) && (await listed()).includes('picture'));

    // ---- The AI panel's tabs (0.9.3) ---------------------------------------
    await win.evaluate(() => document.querySelector('[data-pad="ai"]')?.click());
    await win.waitForTimeout(300);
    const aiHead = await win.evaluate(() => ({
      tabs: [...document.querySelectorAll('#ai-tabs .ai-tab')].map((b) => b.textContent.trim()),
      head: [...document.querySelector('.ai-head').children].map((c) => c.id),
    }));
    check('MathGPT follows Mistral; Perplexity and DeepSeek are gone', aiHead.tabs.indexOf('MathGPT') === aiHead.tabs.indexOf('Mistral') + 1 && !aiHead.tabs.includes('Perplexity') && !aiHead.tabs.includes('DeepSeek'), aiHead.tabs.join(', '));
    check('reload, then +, stand right of the tab strip, outside it', aiHead.head.join(',') === 'ai-tabs,ai-reload,ai-add,ai-close', aiHead.head.join(','));
    // Right-click on a tab: change its header, its address, delete it (0.9.3).
    const tabMenu = async (id) => {
      const r = await win.evaluate((id) => { const tab = document.querySelector(`[data-ai="${id}"]`); tab.scrollIntoView({ inline: 'nearest', block: 'nearest' }); const q = tab.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, id);
      await win.mouse.click(r.x, r.y, { button: 'right' });
      await win.waitForSelector('#ai-site-menu:not([hidden])');
      return win.evaluate(() => [...document.querySelectorAll('#ai-site-menu button')].map((b) => b.textContent));
    };
    const items = await tabMenu('mathgpt');
    check('a tab\'s right-click offers its header, its address and delete', items.join('|') === 'Change header|Change website|Delete website', items.join('|'));
    await win.click('#ai-site-menu button >> nth=0');
    await win.waitForSelector('#ov-dialog:not([hidden])');
    await win.fill('#dlg-input', 'Maths');
    await win.keyboard.press('Enter');
    await win.waitForTimeout(150);
    check('Change header renames the tab', await win.evaluate(() => document.querySelector('[data-ai="mathgpt"]')?.textContent.trim() === 'Maths'));
    await tabMenu('mathgpt');
    await win.click('#ai-site-menu .ai-site-menu__delete');
    await win.waitForTimeout(150);
    check('Delete website takes the tab away', await win.evaluate(() => !document.querySelector('[data-ai="mathgpt"]')));
    const again = await tabMenu('claude');
    check('... and Restore removed sites brings it back', again.includes('Restore removed sites'), again.join('|'));
    await win.click('#ai-site-menu button >> text=Restore removed sites');
    await win.waitForTimeout(150);
    check('... under the name it was given', await win.evaluate(() => document.querySelector('[data-ai="mathgpt"]')?.textContent.trim() === 'Maths'));
    // A click in the AI page closes the menu: the page's clicks never reach
    // this document, and the menu stayed over the page (0.9.3).
    await tabMenu('claude');
    const inPage = await win.evaluate(() => { const r = document.querySelector('.ai-view.on').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 }; });
    await win.mouse.click(inPage.x, inPage.y);
    await win.waitForTimeout(150);
    check('a click in the AI page closes the tab menu', await win.evaluate(() => document.getElementById('ai-site-menu').hidden));
    await win.evaluate(() => { localStorage.removeItem('nebula:ai-overrides'); localStorage.removeItem('nebula:ai-hidden'); });
    await win.evaluate(() => document.querySelector('[data-pad="ai"]')?.click());

    // ---- No passkey prompt in an AI tab; no firewall question --------------
    await win.evaluate((url) => {
      const view = document.createElement('webview');
      view.id = 'passkey-probe';
      view.setAttribute('partition', 'persist:ai-claude');
      view.setAttribute('src', url);
      view.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:100px;visibility:hidden';
      document.body.append(view);
    }, origin);
    await win.waitForTimeout(2500);
    // Asked in the guest itself, from the main process: what a sign-in page's script would see.
    const probe = await app.evaluate(async ({ webContents }) => {
      const guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview' && w.getURL().startsWith('http://127.0.0.1'));
      if (!guest) return 'no guest';
      return guest.executeJavaScript(`navigator.credentials.get({ publicKey: { challenge: new Uint8Array(8) } })
        .then(() => 'offered', (e) => e.name).then((how) => [typeof PublicKeyCredential, how].join(','))`);
    });
    await win.evaluate(() => document.getElementById('passkey-probe')?.remove());
    // A service's own tab (here Claude's) is left as the browser made it
    // (0.9.3): passkeys are off in Blink, so the request is refused at once
    // and no stand-in API is there for a captcha to see.
    check('an AI tab\'s pages are not offered passkeys (no Windows passkey dialog), and get no stand-in',
      /^undefined,(SecurityError|NotSupportedError|NotAllowedError)$/.test(probe), probe);
    const candidates = await win.evaluate(async () => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('probe');
      const seen = [];
      pc.addEventListener('icecandidate', (e) => { if (e.candidate?.candidate) seen.push(e.candidate.candidate); });
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise((r) => { if (pc.iceGatheringState === 'complete') r(); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') r(); }); setTimeout(r, 4000); });
      pc.close();
      return seen;
    });
    check('WebRTC waits for nothing from outside (no UDP host candidates to open a port for)',
      !candidates.some((c) => / udp /i.test(c) && / typ host/.test(c)), candidates.join(' | '));

    // ---- Word and OpenDocument, out and back in (0.9.3) ------------------
    {
      const officeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-office-'));
      try {
        await app.evaluate(({ dialog }, { dir, sep }) => {
          dialog.showSaveDialog = async (_w, opts) => ({ canceled: false, filePath: dir + sep + String(opts.defaultPath || 'out').split(/[\\/]/).pop() });
          globalThis.__nebulaOpen = dir + sep + 'none';
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.__nebulaOpen] });
        }, { dir: officeDir, sep: path.sep });
        await win.click('#btn-new');
        await win.waitForTimeout(400);
        await win.evaluate(() => {
          const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwnwEIGAAZ+QL+qjv4HQAAAABJRU5ErkJggg==';
          document.getElementById('editor').innerHTML = '<h2>Office round</h2><p>Words with <strong>bold</strong> and <em>italic</em>.</p><ul><li>apple</li><li>pear</li></ul>'
            + `<figure class="note-image note-image--inline" data-ratio="2" style="width: 120px;"><img src="${png}" alt="p"></figure>`;
          document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true }));
          const t = document.getElementById('title');
          t.value = 'Office Note';
          t.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await win.waitForTimeout(700);
        const magic = {};
        const previews = {};
        const PAGED = ['docx', 'odt', 'doc', 'rtf'];
        const exportAs = async (fmt, name = 'Office Note') => {
          await win.evaluate((f) => {
            document.querySelector('[data-menu="menu-export"]').click();
            [...document.querySelectorAll('#menu-export button')].find((b) => b.dataset.format === f).click();
          }, fmt);
          // The page-making ones show their pages first (0.9.3); Export writes the file.
          if (PAGED.includes(fmt)) {
            for (let i = 0; i < 60; i += 1) {
              if (await win.evaluate(() => !document.getElementById('ov-pdf').hidden && !document.querySelector('#ov-pdf [data-pdf="export"]').disabled)) break;
              await win.waitForTimeout(150);
            }
            previews[fmt] = await win.evaluate(() => ({ title: document.getElementById('pdf-title').textContent, paper: document.querySelector('#ov-pdf .pdf-paper').textContent, pdf: /\.pdf#/.test(document.querySelector('#ov-pdf webview')?.getAttribute('src') || ''), videos: !document.querySelector('#ov-pdf .pdf-videos').hidden }));
            await win.click('#ov-pdf [data-pdf="export"]');
          }
          const file = path.join(officeDir, `${name}.${fmt}`);
          for (let i = 0; i < 40 && !fs.existsSync(file); i += 1) await win.waitForTimeout(150);
          await win.waitForTimeout(200);
          return file;
        };
        for (const fmt of ['docx', 'odt', 'doc', 'rtf', 'enex']) {
          const file = await exportAs(fmt);
          magic[fmt] = fs.existsSync(file) ? fs.readFileSync(file).subarray(0, 5).toString('latin1') : 'missing';
        }
        check('exports as Word (.docx), OpenDocument (.odt), Word 97–2003 (.doc), Rich Text (.rtf) and Evernote (.enex)', magic.docx.startsWith('PK') && magic.odt.startsWith('PK') && magic.doc === '{\\rtf' && magic.rtf === '{\\rtf' && magic.enex === '<?xml', JSON.stringify(magic));
        check('Word, OpenDocument and Rich Text show their pages first, on the note’s paper', PAGED.every((f) => previews[f]?.pdf && /A4 · 297 × 210/.test(previews[f].paper))
          && previews.docx.title === 'Export as Word (.docx)' && previews.odt.title === 'Export as OpenDocument (.odt)', JSON.stringify(previews));
        const back = {};
        for (const fmt of ['docx', 'odt', 'doc', 'rtf', 'enex']) {
          await app.evaluate((_e, f) => { globalThis.__nebulaOpen = f; }, path.join(officeDir, `Office Note.${fmt}`));
          const before = await win.evaluate(() => document.querySelectorAll('.note-item').length);
          await win.evaluate(() => {
            document.querySelector('[data-menu="menu-export"]')?.click();
            document.querySelector('[data-menu="menu-export"]')?.click();
          });
          await win.evaluate(() => window.dispatchEvent(new Event('nebula-noop')));
          await win.evaluate(() => document.querySelector('[data-act="import"]')?.click());
          for (let i = 0; i < 40 && (await win.evaluate(() => document.querySelectorAll('.note-item').length)) === before; i += 1) await win.waitForTimeout(150);
          await win.waitForTimeout(300);
          back[fmt] = await win.evaluate(() => {
            const ed = document.getElementById('editor');
            return { title: document.getElementById('title').value, bold: !!ed.querySelector('strong, b'), items: ed.querySelectorAll('li').length, img: !!ed.querySelector('img[src^="data:image/png"]'), text: ed.textContent.includes('Words with') };
          });
        }
        check('each comes back in as a note: its words, bold, list and picture', Object.values(back).every((b) => b.bold && b.items >= 2 && b.img && b.text), JSON.stringify(back));

        // Videos: with them, the still is on the page, linked (and Word plays it); without, the link only.
        await app.evaluate(({ ipcMain }, still) => {
          ipcMain.removeHandler('links:video-poster');
          ipcMain.handle('links:video-poster', () => ({ ok: true, site: 'youtube', title: 'My clip', dataUrl: still }));
        }, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwnwEIGAAZ+QL+qjv4HQAAAABJRU5ErkJggg==');
        await win.click('#btn-new');
        await win.waitForTimeout(400);
        await win.evaluate(() => {
          document.getElementById('editor').innerHTML = '<p>Watch this</p><div class="link-block link-embed link-embed--video" data-block-type="link" style="width: 480px; --embed-h: 270px;"><a class="link-card" href="https://www.youtube.com/watch?v=abcDEF12345"><span class="link-card__title">My clip</span></a></div><p>after</p>';
          document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true }));
          const t = document.getElementById('title');
          t.value = 'Video Note';
          t.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await win.waitForTimeout(700);
        await win.evaluate(() => document.querySelector('[data-menu="menu-export"]').click());
        const seg = await win.evaluate(() => ({ with: document.querySelector('#menu-export [data-videos="with"]')?.classList.contains('on'), without: !!document.querySelector('#menu-export [data-videos="without"]') }));
        await win.evaluate(() => document.querySelector('[data-menu="menu-export"]').click());
        check('the export menu chooses videos with or without (with by default)', seg.with && seg.without, JSON.stringify(seg));
        const withHtml = fs.readFileSync(await exportAs('html', 'Video Note'), 'utf8');
        const withDocx = fs.readFileSync(await exportAs('docx', 'Video Note'));
        const videosShown = previews.docx;
        check('with videos: the web page holds the player, and Word the still that plays', withHtml.includes('<iframe src="https://www.youtube-nocookie.com/embed/abcDEF12345"')
          && withDocx.includes(Buffer.from('word/media/image1')) && await (async () => {
            const { default: JSZip } = await import('jszip');
            const xml = await (await JSZip.loadAsync(withDocx)).file('word/document.xml').async('string');
            return xml.includes('wp15:webVideoPr') && xml.includes('My clip');
          })(), String(withHtml.length));
        check('the preview offers videos with or without when the note has one, and not otherwise', videosShown?.videos === true && previews.odt?.videos === false, JSON.stringify(videosShown));
        fs.rmSync(path.join(officeDir, 'Video Note.docx'));
        await win.evaluate(() => document.querySelector('[data-menu="menu-export"]').click());
        await win.click('#menu-export [data-videos="without"]');
        await win.evaluate(() => document.querySelector('[data-menu="menu-export"]').click());
        const withoutDocx = fs.readFileSync(await exportAs('docx', 'Video Note'));
        check('without videos: only the link, no picture', !withoutDocx.includes(Buffer.from('word/media/')) && await (async () => {
          const { default: JSZip } = await import('jszip');
          const xml = await (await JSZip.loadAsync(withoutDocx)).file('word/document.xml').async('string');
          return xml.includes('▶ My clip') && xml.includes('w:hyperlink');
        })());
        await win.evaluate(() => localStorage.removeItem('nebula:export-videos'));
      } finally {
        fs.rmSync(officeDir, { recursive: true, force: true });
      }
    }

    check('0.9.3 checks raise no renderer errors', errors.length === 0, errors.join('\n'));
  } finally {
    await app?.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failed = [];
  let count = 0;
  await runV093Checks((name, ok, detail = '') => {
    count += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
    if (!ok) failed.push(name);
  });
  console.log(`${count - failed.length}/${count} checks passed`);
  if (failed.length) process.exitCode = 1;
}
