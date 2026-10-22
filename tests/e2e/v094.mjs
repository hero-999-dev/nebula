/**
 * 0.9.4 — the owner's "Ideas For Nebula and Testing For Nebula" note, first
 * part, in the real app on a throwaway profile.
 *
 *   node tests/e2e/v094.mjs          (after npm run build)
 *
 * What's new fitting the window, Paste from the right-click menu and its three
 * ways, the page staying where it was after a pasted address, Ctrl + / Ctrl −
 * sizing the words, arrows as they are typed, a new note in an empty folder,
 * and the note menu on a right-click (the only way to it on the folded rail).
 */
import { _electron as electron } from 'playwright-core';
import { until } from './settle.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runV094Checks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-v094-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`),
    JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1, ...extra }));
  seed('arrows', '<p id="a">x</p>');
  seed('size', '<p id="s">grow me</p>');
  seed('paste', '<p id="p">here</p>');
  seed('labels', '<p id="lb">x</p>', { labels: ['Work'] });
  // A note written in Consolas: its lines carry the writing font, as typed ones do.
  seed('fontnote', '<p id="fn1"><span style="font-family: Consolas, &quot;Cascadia Mono&quot;, monospace;">mine</span></p><p id="fn2"><br></p>', { font: { family: 'Consolas, "Cascadia Mono", monospace' } });
  seed('tagged', `${'<p>line of words</p>'.repeat(90)}<p id="far">here it is: <span class="note-tag" data-tag="errands">#errands</span> done</p>`
    + `${'<p>more lines</p>'.repeat(90)}<p id="farther">and again: <span class="note-tag" data-tag="Errands">#Errands</span></p>`, { labels: ['home'] });
  // The owner's own steps: the first label ever made, shortened and written out again.
  seed('rename', '<p id="rn">first <span class="note-tag" data-tag="abc">#abc</span>&nbsp;</p>');
  // As the owner's Ideas note holds it: an item whose words carry a size of their own.
  seed('list', '<ul><li id="l1"><span style="font-size: 14px;">first</span></li><li id="l2">second</li></ul>');
  // The owner's snapshot: a toggle straight under an embed, in a note written in Consolas.
  seed('toggles', '<div class="link-block link-embed" contenteditable="false" data-block-type="link" data-kind="embed" data-url="http://127.0.0.1:1/"><a class="link-card" href="http://127.0.0.1:1/">x</a></div>'
    + '<div class="blk-toggle" data-open="true"><p class="toggle-title" id="tt"><span style="font-family: Consolas;"><b>Charlie, Milo</b></span></p><div class="toggle-body"><ul><li>wet food</li></ul></div></div>'
    + '<p id="empty"><br></p><h2 id="head">Chapter</h2><ol><li id="i1">one</li><li id="i2">two</li><li id="i3">three</li></ol>', { font: { family: 'Consolas' } });
  seed('long',`${'<p>line of words</p>'.repeat(140)}<p id="end">end</p>`);
  // The owner's Ideas note, the Bug part (0.9.4): a divider, an empty line, a picture; and an embed whose page is gone.
  const GREY = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#bbb"/></svg>')}`;
  seed('bullet', `<p id="bh"><b>Bug</b></p><hr class="blk-hr"><div id="bl"><span style="font-size: 16px;"><br></span></div>`
    + `<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" data-ratio="2" style="width: 300px;"><img src="${GREY}" alt="x" draggable="false"><figcaption class="image-caption" data-placeholder="Caption" contenteditable="true"></figcaption></figure>`
    + `<p id="be">${'word '.repeat(400)}</p>${'<p>line of words</p>'.repeat(60)}`);
  const PAGE = 'data:text/html,<title>alive</title><body>here</body>';
  seed('gone', `<p id="go">over</p><div class="link-block link-embed" contenteditable="false" data-block-type="link" data-kind="embed" data-url="https://example.invalid/"><a href="https://example.invalid/" target="_blank" rel="noopener noreferrer" class="link-card"><span class="link-card__kind">Embed</span><strong class="link-card__title">A page</strong><small class="link-card__url">https://example.invalid/</small></a><button type="button" class="link-del" data-link-remove="true" title="Remove link">×</button><webview class="link-frame" partition="persist:embed" src="${PAGE}"></webview></div><p id="gu">under</p>`);
  fs.writeFileSync(path.join(profile, 'storage', 'folders.json'), JSON.stringify({ folders: [{ id: 'f-box', name: 'Box', createdAt: 1 }] }));
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));

    // ---- Before the script has run: the bar is above the page ---------------
    check('the page is served with the editing bar on top', /class="edit-shell bar-top"/.test(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8')));
    // "Check for updates" stood beside the languages until the script moved it,
    // and squeezed them to "E… D… P… T…" while the app loaded (the owner's snapshot).
    const servedPage = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
    const sideFoot = servedPage.slice(servedPage.indexOf('class="side-meta"'), servedPage.indexOf('</aside>'));
    check('and with nothing but the version beside the languages in the sidebar’s last row', sideFoot.includes('id="lang-row"') && !sideFoot.includes('btn-check-updates')
      && servedPage.indexOf('btn-check-updates') > servedPage.indexOf('id="about-actions"'));

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 760));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });

    // ---- What's new fits the window -----------------------------------------
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    const wn = await win.evaluate(() => {
      const body = document.getElementById('whats-new-body');
      // A version with two things to say has nothing to scroll (0.9.5: this check ran on 0.9.4's long
      // list here and on the new version's short one where the release is built). Made as long as it takes.
      const said = body.innerHTML;
      for (let i = 0; i < 60 && body.scrollHeight <= body.clientHeight + 1; i += 1) body.insertAdjacentHTML('beforeend', said);
      const modal = document.querySelector('#ov-whats-new .modal').getBoundingClientRect();
      const button = document.getElementById('whats-new-close').getBoundingClientRect();
      return { shown: !document.getElementById('ov-whats-new').hidden, bottom: modal.bottom, button: button.bottom,
        height: window.innerHeight, scrolls: body.scrollHeight > body.clientHeight + 1 };
    });
    check('What’s new stays inside the window, its button in reach', wn.shown && wn.bottom <= wn.height && wn.button <= wn.height, JSON.stringify(wn));
    check('and its list scrolls when it is longer than the window', wn.scrolls, JSON.stringify(wn));
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());

    const open = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
      await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
    };
    const caretIn = (selector, at = 'end') => win.evaluate(({ selector, at }) => {
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

    // ---- The line between the page sizes and the pad --------------------------
    const pad = await win.evaluate(() => {
      const modes = document.getElementById('page-modes').getBoundingClientRect();
      const p = document.getElementById('pad');
      const first = p.querySelector('button').getBoundingClientRect();
      return { line: getComputedStyle(p).borderLeftWidth, gap: first.left - modes.right };
    });
    check('a thin line stands between the page sizes and the pad, and they are closer', pad.line === '1px' && pad.gap > 12 && pad.gap < 20, JSON.stringify(pad));

    // ---- Arrows as they are typed ---------------------------------------------
    await open('arrows');
    await caretIn('#a');
    await win.keyboard.type(' -->');
    check('--> becomes an arrow to the right', await win.evaluate(() => document.querySelector('#a').textContent === 'x →'),
      await win.evaluate(() => document.querySelector('#a').textContent));
    await win.keyboard.type(' <--');
    check('<-- becomes an arrow to the left', await win.evaluate(() => document.querySelector('#a').textContent === 'x → ←'),
      await win.evaluate(() => document.querySelector('#a').textContent));
    await win.keyboard.press('Control+z');
    check('one Ctrl+Z gives the typed characters back', await win.evaluate(() => document.querySelector('#a').textContent === 'x → <--'),
      await win.evaluate(() => document.querySelector('#a').textContent));

    // ---- Ctrl + and Ctrl − size the words ---------------------------------------
    await open('size');
    await win.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.querySelector('#s'));
      document.getElementById('editor').focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    const sizeNow = () => win.evaluate(() => {
      const walker = document.createTreeWalker(document.querySelector('#s'), NodeFilter.SHOW_TEXT);
      return Math.round(parseFloat(getComputedStyle(walker.nextNode().parentElement).fontSize));
    });
    const size0 = await sizeNow();
    await win.keyboard.press('Control+Equal');
    const size1 = await sizeNow();
    check('Ctrl + makes the selected words one size bigger', size0 === 14 && size1 === 16, `${size0} -> ${size1}`);
    await win.keyboard.press('Control+Minus');
    await win.keyboard.press('Control+Minus');
    const size2 = await sizeNow();
    check('Ctrl − makes them smaller', size2 === 12, `${size1} -> ${size2}`);
    check('and the words are still there', await win.evaluate(() => document.querySelector('#s').textContent === 'grow me'));

    // With only a caret: the line it is in, seen to change, and nothing else.
    await open('list');
    await win.evaluate(() => {
      const t = document.querySelector('#l1 span').firstChild;
      const r = document.createRange();
      r.setStart(t, t.nodeValue.length);
      r.collapse(true);
      document.getElementById('editor').focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.press('Control+Equal');
    const line = await win.evaluate(() => {
      const px = (el) => Math.round(parseFloat(getComputedStyle(el).fontSize));
      const l1 = document.querySelector('#l1');
      return { words: px(l1.querySelector('span') ?? l1), other: px(document.querySelector('#l2')), list: document.querySelector('#editor ul').getAttribute('style'),
        lists: document.querySelectorAll('#editor ul').length, text: l1.textContent };
    });
    check('with only a caret, Ctrl + grows the line the caret is in — its words too', line.words === 16 && line.text === 'first', JSON.stringify(line));
    check('and not the list around it or the next item', line.other === 14 && !line.list && line.lists === 1, JSON.stringify(line));

    // ---- Over selected words: one menu, the formatting bar its first row ---------
    await open('size');
    const selectS = () => win.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.querySelector('#s'));
      document.getElementById('editor').focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    let onWords = await selectS();
    await win.mouse.click(onWords.x, onWords.y, { button: 'right' });
    await win.waitForFunction(() => !document.getElementById('ctx-menu')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    const merged = await win.evaluate(() => ({
      row: [...document.querySelectorAll('#ctx-menu .ctx-format button')].map((b) => b.dataset.act).join(','),
      items: [...document.querySelectorAll('#ctx-menu > button')].map((b) => b.textContent).join('|'),
      barAlone: !document.getElementById('mini-bar').hidden,
      stillSelected: getSelection().toString(),
    }));
    check('a right-click on selected words opens one menu: formatting, then cut, copy and the pastes',
      merged.row === 'bold,italic,underline,strike,color,hilite,code,link'
      && merged.items === 'Cut|Copy|Paste as Nebula format|Paste original format|Select all' && !merged.barAlone, JSON.stringify(merged));
    check('and the words stay selected while it is open', merged.stillSelected === 'grow me', JSON.stringify(merged));
    await win.evaluate(() => document.querySelector('#ctx-menu .ctx-format [data-act="bold"]').click());
    check('its Bold makes the selected words bold and closes the menu', await win.evaluate(() =>
      !!document.querySelector('#s b, #s strong') && document.getElementById('ctx-menu').hidden));
    await app.evaluate(({ clipboard }) => clipboard.clear());
    onWords = await selectS();
    await win.mouse.click(onWords.x, onWords.y, { button: 'right' });
    await win.waitForFunction(() => !document.getElementById('ctx-menu')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => [...document.querySelectorAll('#ctx-menu > button')].find((b) => b.textContent === 'Copy').click());
    await win.waitForTimeout(200);
    check('its Copy copies them', await app.evaluate(({ clipboard }) => clipboard.readText()) === 'grow me');

    // ---- Toggles: a caret at the start, a line above, bold, headings, in a list ---
    const setCaret = (selector, offset) => win.evaluate(({ selector, offset }) => {
      const el = document.querySelector(selector);
      const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      document.getElementById('editor').focus();
      const r = document.createRange();
      if (t) r.setStart(t, offset === 'end' ? t.nodeValue.length : offset); else r.setStart(el, 0);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    }, { selector, offset });
    const toggleButton = () => win.evaluate(() => document.querySelector('[data-act="toggle"]').click());

    await open('toggles');
    // The embed above the toggle (an address nobody answers) settles into its "could not load" card a moment
    // after the note opens, and the toggle moves down with it: a click aimed at where the title WAS missed it —
    // these two checks failed in about one run of three. The title is measured once it stands still, and again
    // for the second click.
    const firstLetter = () => win.evaluate(() => {
      const title = document.querySelector('#tt');
      const r = document.createRange();
      r.setStart(document.createTreeWalker(title, NodeFilter.SHOW_TEXT).nextNode(), 0);
      r.collapse(true);
      const b = r.getBoundingClientRect();
      return { x: b.left, y: b.top + b.height / 2, left: title.getBoundingClientRect().left };
    });
    const stillLetter = async () => {
      let at = await firstLetter();
      for (let same = 0, tries = 0; same < 4 && tries < 40; tries++) {
        await win.waitForTimeout(150);
        const now = await firstLetter();
        same = Math.abs(now.y - at.y) < 0.5 && Math.abs(now.x - at.x) < 0.5 ? same + 1 : 0;
        at = now;
      }
      return at;
    };
    let first = await stillLetter();
    await win.mouse.click(first.x - 3, first.y);
    check('a click just before a toggle’s first letter puts the caret there, and does not fold it', await win.evaluate(() =>
      document.querySelector('.blk-toggle').dataset.open === 'true' && document.querySelector('#tt').contains(getSelection().anchorNode) && getSelection().anchorOffset === 0));
    // Measured still again (the first click can move the page), and the fold waited for: two of five runs failed here.
    first = await stillLetter();
    await win.mouse.click(first.left + 10, first.y);
    check('a click on the arrow still folds it', await until(win, () => !document.querySelector('.blk-toggle').dataset.open));
    await win.mouse.click(first.left + 10, first.y);
    await setCaret('#tt', 0);
    await win.keyboard.press('Enter');
    const above = await win.evaluate(() => {
      const toggle = document.querySelector('.blk-toggle');
      const line = toggle.previousElementSibling;
      return { line: line?.tagName, empty: line?.textContent === '', afterEmbed: line?.previousElementSibling?.classList.contains('link-block'),
        title: document.querySelector('#tt').textContent, caretInTitle: document.querySelector('#tt').contains(getSelection().anchorNode) };
    });
    check('Enter at the start of a toggle’s title puts an empty line above it — a caret before the toggle',
      above.line === 'P' && above.empty && above.afterEmbed && above.title === 'Charlie, Milo' && above.caretInTitle, JSON.stringify(above));
    await win.keyboard.press('ArrowUp');
    await win.keyboard.type('before');
    check('and that line can be written on', await win.evaluate(() => document.querySelector('.blk-toggle').previousElementSibling.textContent === 'before'));

    // Ctrl+B, then type, in a note with a writing font (the owner's Consolas notes).
    await setCaret('#empty', 0);
    await win.keyboard.press('Control+b');
    await win.keyboard.type('ab');
    const bold = await win.evaluate(() => {
      const el = document.querySelector('#empty');
      const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const cs = getComputedStyle(t.parentElement);
      return { text: el.textContent, weight: Number(cs.fontWeight), font: cs.fontFamily };
    });
    check('Ctrl+B, then typing, is bold in a note with a writing font', bold.text === 'ab' && bold.weight >= 600 && /Consolas/.test(bold.font), JSON.stringify(bold));

    // Headings that fold.
    await setCaret('#head', 'end');
    await toggleButton();
    check('the toggle button on a heading makes a heading that folds', await win.evaluate(() =>
      document.querySelector('.blk-toggle > h2:first-child')?.textContent === 'Chapter'));
    await win.keyboard.press('Enter');
    await win.keyboard.press('Enter');
    await win.keyboard.type('/toggle-h1');
    await win.waitForFunction(() => !document.getElementById('slash-menu').hidden, null, { polling: 50, timeout: 3000 }).catch(() => {});
    await win.keyboard.press('Enter');
    await win.keyboard.type('Big');
    const big = await win.evaluate(() => {
      const h = [...document.querySelectorAll('.blk-toggle > h1:first-child')].find((x) => x.textContent === 'Big');
      if (!h) return null;
      const arrow = getComputedStyle(h, '::before');
      const box = h.getBoundingClientRect();
      const line = parseFloat(getComputedStyle(h).lineHeight);
      // The arrow's middle against the middle of the heading's first line.
      return { off: Math.abs(parseFloat(arrow.top) + 5 - line / 2), body: !!h.parentElement.querySelector('.toggle-body'), height: box.height };
    });
    check('"/toggle-h1" makes a big heading that folds, its arrow at the middle of the line', !!big && big.body && big.off < 2.5, JSON.stringify(big));

    // In a list: the item stays an item.
    await setCaret('#i2', 'end');
    await toggleButton();
    await win.keyboard.press('Enter');
    await win.keyboard.type('under two');
    await win.keyboard.press('Enter');
    await win.keyboard.type('more');
    const inList = await win.evaluate(() => {
      const li = document.querySelector('#i2');
      return { lists: document.querySelectorAll('#editor ol').length, items: document.querySelectorAll('#editor ol > li').length,
        toggle: li.firstElementChild?.className, title: li.querySelector('.blk-toggle > :first-child')?.textContent,
        body: [...li.querySelectorAll('.toggle-body > p')].map((p) => p.textContent).join('|') };
    });
    check('a list item becomes a toggle in its place: the list is not split', inList.lists === 1 && inList.items === 3 && inList.toggle === 'blk-toggle' && inList.title === 'two', JSON.stringify(inList));
    check('Enter in it writes lines under it, inside the item', inList.body === 'under two|more', JSON.stringify(inList));
    await win.keyboard.press('Enter');
    await win.keyboard.press('Enter');
    await win.keyboard.type('new item');
    const out = await win.evaluate(() => ({
      items: [...document.querySelectorAll('#editor ol > li')].map((li) => li.querySelector('.blk-toggle > :first-child')?.textContent ?? li.textContent).join('|'),
      lists: document.querySelectorAll('#editor ol').length,
      body: [...document.querySelectorAll('#i2 .toggle-body > p')].map((p) => p.textContent).join('|'),
    }));
    check('Enter on its empty last line goes on to the next item of the list', out.items === 'one|two|new item|three' && out.lists === 1 && out.body === 'under two|more', JSON.stringify(out));
    await setCaret('#i2 .blk-toggle > :first-child', 0);
    await win.keyboard.press('Backspace');
    const back = await win.evaluate(() => ({
      toggle: !!document.querySelector('#i2 .blk-toggle'), items: document.querySelectorAll('#editor ol > li').length,
      lists: document.querySelectorAll('#editor ol').length, text: document.querySelector('#i2').textContent,
    }));
    check('Backspace at the start of its title takes the toggle away and leaves the item in the list',
      !back.toggle && back.items === 4 && back.lists === 1 && back.text === 'twounder twomore', JSON.stringify(back));

    // ---- Paste from the right-click menu, three ways ----------------------------
    await open('paste');
    const rightClickAfter = async (selector) => {
      await caretIn(selector);
      const at = await win.evaluate((s) => {
        const r = document.createRange();
        r.selectNodeContents(document.querySelector(s));
        const b = r.getBoundingClientRect();
        return { x: b.right + 60, y: b.top + b.height / 2 };
      }, selector);
      await win.mouse.click(at.x, at.y, { button: 'right' });
      await win.waitForFunction(() => !document.getElementById('ctx-menu')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    };
    const menuItems = () => win.evaluate(() => [...document.querySelectorAll('#ctx-menu > button')].map((b) => b.textContent + (b.disabled ? '·' : '')).join('|'));
    const choose = async (label) => {
      await win.evaluate((l) => [...document.querySelectorAll('#ctx-menu button')].find((b) => b.textContent === l)?.click(), label);
      await win.waitForTimeout(350);
    };
    const DRESSED = '<span style="color: rgb(214, 210, 219); font-family: Arial; font-size: 20px; background-color: rgb(10, 10, 12); animation-duration: 0.01ms !important;">dressed <b>words</b></span>';
    const copy = (html, text) => app.evaluate(async ({ clipboard, ClipboardItem }, { html, text }) => {
      const data = { 'text/plain': text };
      if (html) data['text/html'] = html;
      await clipboard.write([new ClipboardItem(data)]);
    }, { html, text });

    await copy(DRESSED, 'dressed words');
    await rightClickAfter('#p');
    check('a right-click in the note is the one menu: the formatting row, cut and copy (grey with nothing selected), the two ways to paste — "Paste only text" is not offered', await menuItems() === 'Cut·|Copy·|Paste as Nebula format|Paste original format|Select all'
      && await win.evaluate(() => document.querySelectorAll('#ctx-menu .ctx-format button').length > 0), await menuItems());
    await win.keyboard.press('Escape');

    await open('arrows');
    await open('paste');
    await win.evaluate(() => { document.querySelector('#p').textContent = 'here'; });
    await rightClickAfter('#p');
    await choose('Paste as Nebula format');
    const nebula = await win.evaluate(() => ({ text: document.getElementById('editor').textContent, bold: !!document.querySelector('#editor b, #editor strong'), styled: !!document.querySelector('#editor [style*="color"], #editor [style*="font-family"]') }));
    check('Paste as Nebula format keeps what the words are and drops the source’s dress', nebula.text.includes('dressed words') && nebula.bold && !nebula.styled,
      `${JSON.stringify(nebula)} ${await win.evaluate(() => document.getElementById('editor').innerHTML)}`);

    await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p id="p">here</p>'; });
    await rightClickAfter('#p');
    await choose('Paste original format');
    const original = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const span = ed.querySelector('[style*="font-size"]');
      // The browser may split the span round the bold word as it inserts: every pasted word is asked its size.
      const sizes = [];
      const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/dressed|words/.test(n.nodeValue)) sizes.push(getComputedStyle(n.parentElement).fontSize);
      return {
        text: ed.textContent, size: span?.style.fontSize ?? '', sized: [...new Set(sizes)].join(','), bold: !!ed.querySelector('b, strong'),
        dress: [...ed.querySelectorAll('[style]')].map((e) => e.getAttribute('style')).join(' | '),
        shown: span ? [getComputedStyle(span).color, getComputedStyle(span).fontFamily, getComputedStyle(span).backgroundColor].join(' ') : '',
        own: `${getComputedStyle(document.getElementById('p')).color} ${getComputedStyle(document.getElementById('p')).fontFamily}`,
      };
    });
    check('Paste original format keeps the size the words were copied in, and bold', original.text.includes('dressed words') && original.size === '20px' && original.sized === '20px' && original.bold, JSON.stringify(original));
    check('and no more of the source: the font and the colour are the note’s, and its ground stays behind', !/color|font-family|Arial|background|animation/.test(original.dress)
      && original.shown === `${original.own} rgba(0, 0, 0, 0)`, JSON.stringify(original));
    // The caret is the theme's ink on every line, whatever the words under it wear.
    const carets = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const line = document.createElement('p');
      line.innerHTML = '<span id="pale" style="color: rgb(214, 210, 219);">pale words of an older paste</span>';
      ed.append(line);
      const ink = (() => { const probe = document.createElement('i'); probe.style.color = 'var(--ink)'; document.body.append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; })();
      const out = { ink, pale: getComputedStyle(document.getElementById('pale')).caretColor, plain: getComputedStyle(document.getElementById('p')).caretColor, words: getComputedStyle(document.getElementById('pale')).color };
      line.remove();
      return out;
    });
    check('the caret keeps the theme’s ink on a line of pale pasted words, as on any other', carets.pale === carets.ink && carets.plain === carets.ink && carets.words !== carets.ink, JSON.stringify(carets));

    // The font picked last stands over "+ Add a font" as the last used font.
    const lastFont = async () => {
      await win.evaluate(() => { if (document.getElementById('menu-font').hidden) document.querySelector('[data-menu="menu-font"]').click(); });
      await win.waitForFunction(() => !document.getElementById('menu-font').hidden, null, { polling: 50 });
      return win.evaluate(() => {
        const box = document.getElementById('font-last');
        const row = box.querySelector('button');
        const add = document.getElementById('font-add').getBoundingClientRect();
        return {
          shown: !box.hidden, head: box.querySelector('.tb-menu__label')?.textContent ?? '', name: row?.querySelector('.label')?.textContent ?? '',
          plus: !!row?.querySelector('.tb-menu__plus'), pin: row?.querySelector('.tb-menu__pin')?.getAttribute('aria-pressed') ?? null,
          over: !box.hidden && box.getBoundingClientRect().bottom <= add.top + 1,
          tools: row ? [...row.querySelectorAll('.tb-menu__plus, .tb-menu__pin')].map((x) => getComputedStyle(x).opacity).join(',') : '',
          first: document.querySelector('#font-rows > button .label')?.textContent, listed: [...document.querySelectorAll('#font-rows > button .label')].map((x) => x.textContent),
        };
      });
    };
    const rowOf = (name) => win.evaluate((n) => [...document.querySelectorAll('#font-rows > button')].find((b) => b.querySelector('.label').textContent === n)?.click(), name);
    const crossOf = (name) => win.evaluate((n) => [...document.querySelectorAll('#font-rows > button')].find((b) => b.querySelector('.label').textContent === n)?.querySelector('.tb-menu__x')?.click(), name);
    // A paste brings no font, so it is not a font used.
    const beforePick = await lastFont();
    check('a paste — original format too — is no font used: nothing of the source stands as the last used font', beforePick.name !== 'Arial', JSON.stringify(beforePick.name));
    await rowOf('Georgia');
    const pickedFont = await lastFont();
    check('the font picked last stands over “+ Add a font” as the last used font — with a pin, and no + for a font of the list', pickedFont.shown && pickedFont.head === 'Last used font' && pickedFont.name === 'Georgia' && !pickedFont.plus && pickedFont.pin === 'false' && pickedFont.over, JSON.stringify(pickedFont));
    await win.hover('#font-last button');
    await win.waitForTimeout(150);
    const hoveredFont = await lastFont();
    check('its pin is drawn when the pointer is on it', pickedFont.tools === '0' && hoveredFont.tools === '0.7', JSON.stringify({ before: pickedFont.tools, on: hoveredFont.tools }));
    await win.click('#font-last .tb-menu__pin');
    const pinnedLastFont = await lastFont();
    check('and puts it at the top of the list', pinnedLastFont.first === 'Georgia' && pinnedLastFont.pin === 'true', JSON.stringify({ first: pinnedLastFont.first, pin: pinnedLastFont.pin }));
    await win.click('#font-last .tb-menu__pin');
    await win.fill('#font-search', 'ver');
    check('while a font is searched for, the list is the search’s alone', await win.evaluate(() => document.getElementById('font-last').hidden));
    // A font of this computer, added and used, then taken off the list: the + beside it puts it back.
    await win.fill('#font-search', 'Bahnschrift');
    await win.waitForFunction(() => [...document.querySelectorAll('#font-rows > button .label')].some((x) => x.textContent === 'Bahnschrift'), null, { polling: 100, timeout: 6000 }).catch(() => {});
    await rowOf('Bahnschrift');
    await win.waitForTimeout(200);
    const addedFont = await lastFont();
    await crossOf('Bahnschrift');
    const unlistedFont = await lastFont();
    await win.click('#font-last .tb-menu__plus');
    const backFont = await lastFont();
    check('a last used font that is not in the list any more has a + beside it, which puts it back', addedFont.name === 'Bahnschrift' && !addedFont.plus && addedFont.listed.includes('Bahnschrift')
      && unlistedFont.plus && !unlistedFont.listed.includes('Bahnschrift') && backFont.listed.includes('Bahnschrift') && !backFont.plus, JSON.stringify({ added: addedFont.plus, unlisted: unlistedFont.plus, back: backFont.listed.slice(-2) }));
    await crossOf('Bahnschrift');
    // A font that is not on this computer cannot be put into the list, and the app says so in those words.
    await win.fill('#font-search', 'No Such Face 456');
    await win.evaluate(() => { document.getElementById('toast').hidden = true; document.getElementById('toast').textContent = ''; });
    await win.click('#font-add');
    await win.waitForFunction(() => !document.getElementById('toast').hidden, null, { polling: 50, timeout: 3000 }).catch(() => {});
    check('a font that is not on this computer cannot be added: the app says “not on this computer, so it cannot be added”', (await win.evaluate(() => document.getElementById('toast').textContent)) === 'That font is not on this computer, so it cannot be added'
      && await win.evaluate(() => !(JSON.parse(localStorage.getItem('nebula:fonts') || '[]')).includes('No Such Face 456')));
    await win.fill('#font-search', '');
    await win.keyboard.press('Escape');
    // The bar names the font the words are DRAWN in: a page's own font that is not here is not it.
    const barSays = async (stack) => {
      await win.evaluate((s) => { const ed = document.getElementById('editor'); ed.innerHTML = '<p id="p">here</p><p id="q"><span id="worn">worn words</span></p>'; document.getElementById('worn').style.fontFamily = s; }, stack);
      await caretIn('#worn');
      await win.waitForTimeout(200);
      return win.evaluate(() => document.querySelector('#tb-font .tb-font__name').textContent);
    };
    const barInstrument = await barSays('"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif');
    const barCourier = await barSays('"No Such Face 123", "Courier New", monospace');
    const barGeorgia = await barSays('Georgia, "Times New Roman", serif');
    const barBahn = await barSays('"Bahnschrift", serif');
    check('the bar names the font the words are drawn in — not a page’s own font this computer does not have', barInstrument === 'Segoe UI' && barCourier === 'Courier New' && barGeorgia === 'Georgia' && barBahn === 'Bahnschrift', JSON.stringify({ barInstrument, barCourier, barGeorgia, barBahn }));
    // A toggle's frame left without its title is no toggle: the owner's, stuck at the top of a note.
    const frames = () => win.evaluate(() => ({
      toggles: document.querySelectorAll('#editor .blk-toggle').length,
      broken: [...document.querySelectorAll('#editor .blk-toggle')].filter((t) => !t.firstElementChild || t.firstElementChild.tagName === 'BR' || t.firstElementChild.classList.contains('toggle-body')).length,
      html: document.getElementById('editor').innerHTML.slice(0, 200), text: document.getElementById('editor').textContent,
    }));
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<div class="blk-toggle" data-open="true" id="shell"><br></div><p id="p">after</p>';
      const r = document.createRange(); r.setStart(document.getElementById('shell'), 0); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); ed.focus();
    });
    await win.keyboard.press('Backspace');
    const unstuck = await frames();
    await win.keyboard.type('free');
    const typedThere = await frames();
    check('an empty toggle frame is not stuck: Backspace in it leaves a plain line, and words typed there are plain words', unstuck.toggles === 0 && unstuck.text === 'after' && typedThere.toggles === 0 && typedThere.text === 'freeafter', JSON.stringify({ unstuck, typedThere }));
    // How such a frame came to be: words selected from the title down into the body, and deleted.
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<div class="blk-toggle" data-open="true"><p class="toggle-title" id="tt">title</p><div class="toggle-body"><p id="tb">body</p></div></div><p id="p">after</p>';
      const r = document.createRange(); r.setStart(document.getElementById('tt').firstChild, 0); r.setEnd(document.getElementById('tb').firstChild, 4);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); ed.focus();
    });
    await win.keyboard.press('Delete');
    await win.waitForTimeout(150);
    const emptied = await frames();
    await win.keyboard.type('new');
    const refilled = await frames();
    check('a toggle emptied from its title into its body leaves no frame without a title, and what is typed next is kept', emptied.broken === 0 && refilled.broken === 0 && refilled.text === 'newafter', JSON.stringify({ emptied, refilled }));
    // A note that already holds such a frame is put right when it opens.
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<div class="blk-toggle" data-open="true"><br></div><p id="p">kept words</p>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const onEdit = await frames();
    check('and a frame found in a note is taken out at the next edit', onEdit.toggles === 0 && onEdit.text === 'kept words', JSON.stringify(onEdit));
    // The note's writing font back to the app's own, as the checks after this one expect it.
    await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p id="p">here</p>'; });
    await caretIn('#p');
    await lastFont();
    await rowOf('Serif');
    await win.evaluate(() => { localStorage.removeItem('nebula:font-last'); });

    // The bar's Paste button goes the same way.
    await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p id="p">here</p>'; });
    await copy('', ' from the bar');
    await caretIn('#p');
    await win.evaluate(() => document.querySelector('[data-act="paste"]').click());
    await win.waitForTimeout(350);
    check('the Paste button in the bar pastes', await win.evaluate(() => document.querySelector('#p').textContent === 'here from the bar'),
      await win.evaluate(() => document.getElementById('editor').textContent));

    // ---- A pasted address does not send the page to the top ---------------------
    await open('long');
    await caretIn('#end');
    await win.evaluate(() => { const ed = document.getElementById('editor'); ed.scrollTop = ed.scrollHeight; });
    const before = await win.evaluate(() => document.getElementById('editor').scrollTop);
    await copy('', 'https://example.com/');
    await win.keyboard.press('Control+v');
    await win.waitForFunction(() => !document.getElementById('link-menu')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.waitForTimeout(150);
    await win.keyboard.press('Enter');
    await win.waitForTimeout(250);
    const after = await win.evaluate(() => ({ top: document.getElementById('editor').scrollTop, link: !!document.querySelector('#editor a[href="https://example.com/"]') }));
    check('after "Paste as" the page is where it was, not at the top', after.link && before > 500 && after.top > before - 200, JSON.stringify({ before, ...after }));

    // ---- A new note straight into an empty folder -------------------------------
    await win.evaluate(() => { if (!document.querySelector('.folder-add')) document.querySelector('.folder-row')?.click(); });
    await win.waitForFunction(() => document.querySelector('.folder-add'), null, { polling: 50, timeout: 5000 }).catch(() => {});
    const add = await win.evaluate(() => {
      const a = document.querySelector('.folder-add');
      const hint = document.querySelector('.folder-empty');
      return { text: a?.textContent, above: !!a && !!hint && a.getBoundingClientRect().bottom <= hint.getBoundingClientRect().top + 1 };
    });
    check('an empty folder offers "+ Add a note" above "Drag notes here"', add.text === '+ Add a note' && add.above, JSON.stringify(add));
    await win.evaluate(() => document.querySelector('.folder-add').click());
    await win.waitForFunction(() => document.querySelector('.folder-notes .note-row'), null, { polling: 50, timeout: 5000 }).catch(() => {});
    check('and the new note is in that folder, open, its title ready', await win.evaluate(() =>
      document.querySelectorAll('.folder-notes .note-row').length === 1 && document.querySelector('.folder-notes .note-row').classList.contains('active')
      && document.activeElement?.id === 'title'));
    check('a folder with notes keeps "+ Add a note" above them', await win.evaluate(() => {
      const a = document.querySelector('.folder-notes .folder-add');
      const first = document.querySelector('.folder-notes .note-item');
      return !!a && !!first && !document.querySelector('.folder-empty') && a.getBoundingClientRect().bottom <= first.getBoundingClientRect().top + 1;
    }));

    // ---- The note menu on a right-click; the rail has no ⋯ ----------------------
    const rowAt = () => win.evaluate(() => {
      const r = [...document.querySelectorAll('#note-list .note-row')].find((x) => x.title === 'size').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    let at = await rowAt();
    await win.mouse.click(at.x, at.y, { button: 'right' });
    check('a right-click on a note opens its menu', await win.evaluate(() => !document.getElementById('note-menu').hidden));
    await win.keyboard.press('Escape');
    await win.evaluate(() => document.getElementById('side-toggle').click());
    await win.waitForTimeout(450);
    check('the folded rail shows no ⋯ over a note', await win.evaluate(() =>
      [...document.querySelectorAll('#note-list .nr-more')].every((b) => getComputedStyle(b).display === 'none')));
    at = await rowAt();
    await win.mouse.click(at.x, at.y, { button: 'right' });
    const railMenu = await win.evaluate(() => { const m = document.getElementById('note-menu'); const r = m.getBoundingClientRect(); return { open: !m.hidden, inside: r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight }; });
    check('and a right-click there opens the menu, inside the window', railMenu.open && railMenu.inside, JSON.stringify(railMenu));
    await win.evaluate(() => document.querySelector('#note-menu [data-note-act="pin"]').click());
    check('its commands act on that note', await win.evaluate(() =>
      !![...document.querySelectorAll('#note-list .note-row')].find((x) => x.title === 'size')?.querySelector('.nr-pin')));
    await win.evaluate(() => document.getElementById('side-toggle').click());

    // ---- Labels: a list on "#", a chip that follows its word, and where a label is ---
    // The owner's steps: #abc, the only label there was, changed to #ace.
    await open('rename');
    await win.evaluate(() => {
      const t = document.querySelector('#rn .note-tag').firstChild;
      const r = document.createRange();
      r.setStart(t, t.nodeValue.length);
      r.collapse(true);
      document.getElementById('editor').focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.press('Backspace');
    await win.keyboard.press('Backspace');
    await win.keyboard.type('ce');
    const longer = await win.evaluate(() => { const c = document.querySelector('#rn .note-tag'); return { text: c?.textContent, tag: c?.dataset.tag, chips: document.querySelectorAll('#rn .note-tag').length }; });
    check('a label shortened and written out again is the new label: #abc to #ace', longer.text === '#ace' && longer.tag === 'ace' && longer.chips === 1, JSON.stringify(longer));
    await win.keyboard.type(' then');
    const ended = await win.evaluate(() => ({ chip: document.querySelector('#rn .note-tag').textContent, line: document.querySelector('#rn').textContent.replace(/ /g, ' ') }));
    check('a space ends the label, and the words after it are words', ended.chip === '#ace' && /^first #ace then\s*$/.test(ended.line), JSON.stringify(ended));
    await win.waitForTimeout(700);       // the autosave

    await open('labels');
    await caretIn('#lb');
    await win.keyboard.type(' #');
    await win.waitForFunction(() => !document.getElementById('mention-menu').hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
    const offered = await win.evaluate(() => ({
      open: !document.getElementById('mention-menu').hidden,
      items: [...document.querySelectorAll('#mention-menu button')].map((b) => b.textContent).join('|'),
      lit: document.querySelectorAll('#mention-menu button.sel').length,
    }));
    check('typing # opens the labels already in use, of titles and of texts, none lit', offered.open && offered.items === '#ace|#errands|#home|#Work' && offered.lit === 0, JSON.stringify(offered));
    await win.keyboard.type('er');
    await win.waitForTimeout(120);
    check('typing on narrows the list', await win.evaluate(() => [...document.querySelectorAll('#mention-menu button')].map((b) => b.textContent).join('|') === '#errands'));
    await win.keyboard.press('Tab');
    const picked = await win.evaluate(() => { const c = document.querySelector('#lb .note-tag'); return { text: c?.textContent, tag: c?.dataset.tag, line: document.querySelector('#lb').textContent, menu: document.getElementById('mention-menu').hidden }; });
    check('Tab takes the label offered: a chip of that label, a space after it', picked.text === '#errands' && picked.tag === 'errands' && /^x #errands\s$/.test(picked.line) && picked.menu, JSON.stringify(picked));
    await win.keyboard.type('#err');
    await win.keyboard.press('Enter');
    const typed = await win.evaluate(() => [...document.querySelectorAll('#editor .note-tag')].map((c) => `${c.textContent}=${c.dataset.tag}`).join('|'));
    check('Enter with nothing lit makes the label exactly as typed, not the one offered', typed === '#errands=errands|#err=err', typed);
    // Edit a chip's word: its label follows.
    await win.evaluate(() => {
      const t = [...document.querySelectorAll('#editor .note-tag')].find((c) => c.textContent === '#err').firstChild;
      const r = document.createRange();
      r.setStart(t, 2);
      r.collapse(true);
      document.getElementById('editor').focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.type('Q');
    const renamed = await win.evaluate(() => [...document.querySelectorAll('#editor .note-tag')].map((c) => `${c.textContent}=${c.dataset.tag}`).join('|'));
    check('a chip edited to another word carries that label', renamed === '#errands=errands|#eQrr=eQrr', renamed);
    await win.waitForTimeout(800);       // the autosave
    await win.evaluate(() => document.getElementById('label-filter-btn').click());
    const catalog = await win.evaluate(() => [...document.querySelectorAll('#label-filter .label-chip')].map((c) => c.textContent).join('|'));
    check('and the old word is not among the labels any more', catalog === '#ace|#eQrr|#errands|#home|#Work', catalog);
    await win.evaluate(() => [...document.querySelectorAll('#label-filter .label-chip')].find((c) => c.textContent === '#errands').click());
    await win.evaluate(() => [...document.querySelectorAll('#note-list .note-row')].find((r) => r.title === 'tagged').click());
    await win.waitForFunction(() => document.querySelector('#title').value === 'tagged', null, { polling: 50 });
    await win.waitForTimeout(250);
    const hits = await win.evaluate(() => {
      const h = CSS.highlights.get('nebula-label-hit');
      const chip = document.querySelector('#far .note-tag').getBoundingClientRect();
      const view = document.getElementById('editor').getBoundingClientRect();
      return { painted: h ? h.size : 0, inView: chip.top >= view.top && chip.bottom <= view.bottom,
        header: [...document.querySelectorAll('#note-labels .note-label.hit')].map((c) => c.textContent).join('|'),
        html: document.getElementById('editor').innerHTML.includes('<mark') };
    });
    check('opening a note from the label’s list paints where the label is, and brings the first into view',
      hits.painted === 1 && hits.inView && !hits.html, JSON.stringify(hits));
    // Several places in one note: a bar steps from one to the next, like the find bar.
    const bar = () => win.evaluate(() => {
      const b = document.getElementById('label-bar');
      const cur = CSS.highlights.get('nebula-label-hit-current');
      const range = cur ? [...cur][0] : null;
      const at = range?.startContainer.parentElement.closest('p')?.id;
      const chip = range?.startContainer.parentElement.getBoundingClientRect();
      const view = document.getElementById('editor').getBoundingClientRect();
      return { shown: !b.hidden, name: b.querySelector('.label-bar__name').textContent, count: b.querySelector('.find-count').textContent,
        current: at, inView: !!chip && chip.top >= view.top && chip.bottom <= view.bottom };
    });
    const bar1 = await bar();
    check('with two places the label’s bar says 1 of 2, the first one lit', bar1.shown && bar1.name === '#errands' && bar1.count === '1 of 2' && bar1.current === 'far', JSON.stringify(bar1));
    await win.evaluate(() => document.querySelector('#label-bar [data-hit="next"]').click());
    await win.waitForTimeout(250);
    const bar2 = await bar();
    check('↓ goes to the next place and brings it into view', bar2.count === '2 of 2' && bar2.current === 'farther' && bar2.inView, JSON.stringify(bar2));
    await win.evaluate(() => document.querySelector('#label-bar [data-hit="next"]').click());
    await win.waitForTimeout(250);
    const bar3 = await bar();
    check('and round to the first again', bar3.count === '1 of 2' && bar3.current === 'far' && bar3.inView, JSON.stringify(bar3));
    await win.evaluate(() => document.querySelector('#label-bar [data-hit="close"]').click());
    check('✕ puts the bar and the paint away, the filter staying', await win.evaluate(() =>
      document.getElementById('label-bar').hidden && !CSS.highlights.has('nebula-label-hit') && !CSS.highlights.has('nebula-label-hit-current')
      && document.getElementById('label-filter-btn').classList.contains('on')));
    await win.evaluate(() => [...document.querySelectorAll('#label-filter .label-chip')].find((c) => c.textContent === '#home')?.click());
    await win.waitForTimeout(200);
    check('a label of the title is ringed by the title', await win.evaluate(() =>
      [...document.querySelectorAll('#note-labels .note-label.hit')].map((c) => c.textContent).join('|') === '#home' && !CSS.highlights.has('nebula-label-hit')));
    await win.evaluate(() => document.querySelector('#label-filter-btn .lf-clear').click());
    await win.evaluate(() => { if (!document.getElementById('label-filter').hidden) document.getElementById('label-filter-btn').click(); });
    check('taking the filter off takes the paint off', await win.evaluate(() =>
      !CSS.highlights.has('nebula-label-hit') && !document.querySelector('#note-labels .note-label.hit')));

    // ---- A theme of one's own: the editor over Archive and Trash ------------------
    {
    const themeRow = await win.evaluate(() => {
      const buttons = [...document.querySelectorAll('#theme-pick [data-theme]')];
      const side = document.getElementById('side').getBoundingClientRect();
      const palette = document.getElementById('btn-theme-custom').getBoundingClientRect();
      const last = buttons.at(-1).getBoundingClientRect();
      return { names: buttons.map((b) => b.dataset.theme).join(','),
        fits: buttons.every((b) => b.scrollWidth <= b.clientWidth + 1),
        right: palette.width > 0 && palette.left >= last.right - 0.5 && palette.right <= side.right + 0.5
          && Math.abs((palette.top + palette.bottom) - (last.top + last.bottom)) < 6 };
    });
    check('four themes in the row, and the palette button at their right', themeRow.names === 'main,dark,light,white' && themeRow.fits && themeRow.right, JSON.stringify(themeRow));

    await win.evaluate(() => document.getElementById('btn-theme-custom').click());
    await win.waitForTimeout(150);
    const opened = await win.evaluate(() => {
      const panel = document.getElementById('theme-editor');
      const box = panel.getBoundingClientRect();
      const side = document.getElementById('side').getBoundingClientRect();
      const tabs = document.querySelector('.drawer-tabs').getBoundingClientRect();
      const row = document.querySelector('.theme-row').getBoundingClientRect();
      const top = [...panel.children].filter((c) => !c.hidden).map((c) => c.className.split(' ')[0]);
      return { shown: !panel.hidden, expanded: document.getElementById('btn-theme-custom').getAttribute('aria-expanded'),
        above: box.bottom <= tabs.top + 0.5 && tabs.bottom <= row.top + 0.5, inside: box.top >= side.top - 0.5 && box.left >= side.left - 0.5 && box.right <= side.right + 0.5,
        order: top.join(','), slots: [...panel.querySelectorAll('.te-slot')].map((s) => s.dataset.slot).join(','),
        swatches: panel.querySelectorAll('.te-swatch').length, ready: panel.querySelector('.te-chip__name')?.textContent,
        theme: document.documentElement.dataset.theme, profile: document.documentElement.dataset.profile ?? null };
    });
    check('it opens upward over Archive and Trash: name and Save on top, then profiles, five slots, the bar, the colours',
      opened.shown && opened.expanded === 'true' && opened.above && opened.inside
      && opened.order === 'te-head,te-save,te-label,te-profiles,te-slots,te-bar-row,te-hint,te-swatches'
      && opened.slots === 'bg,dark,lines,accent,text' && opened.swatches === 28 && opened.ready === 'Matcha', JSON.stringify(opened));
    check('opening it changes nothing yet', opened.theme === 'main' && opened.profile === null, JSON.stringify(opened));

    const look = () => win.evaluate(() => {
      const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const hex = (c) => '#' + rgb(c).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      const root = document.documentElement;
      const ed = getComputedStyle(document.getElementById('editor'));
      const frame = getComputedStyle(document.getElementById('editor-frame'));
      const on = getComputedStyle(document.getElementById('btn-theme-custom'));
      const btn = getComputedStyle(document.getElementById('btn-new'));
      const ground = frame.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : frame.backgroundColor;
      return { theme: root.dataset.theme, profile: root.dataset.profile ?? null, inline: root.style.getPropertyValue('--paper'),
        // The picked background is the app's ground; the note's sheet lies a tone above it.
        ink: hex(ed.color), paper: hex(getComputedStyle(document.body).backgroundColor), sheet: hex(ground), accent: hex(btn.backgroundColor), side: hex(getComputedStyle(document.getElementById('side')).backgroundColor),
        scheme: getComputedStyle(root).colorScheme, lit: document.getElementById('btn-theme-custom').classList.contains('on'),
        fixedLit: !!document.querySelector('#theme-pick button.on'),
        text: contrast(ed.color, ground), picked: contrast(on.color, on.backgroundColor), primary: contrast(btn.color, btn.backgroundColor),
        chip: document.querySelector('#theme-editor .te-chip.on .te-chip__name')?.textContent ?? null,
        stored: localStorage.getItem('nebula:theme') };
    });
    const chipNamed = (name) => win.evaluate((n) => [...document.querySelectorAll('#theme-editor .te-chip__name')].find((c) => c.textContent === n)?.click(), name);

    await chipNamed('Matcha');
    await win.waitForTimeout(150);
    const matcha = await look();
    // The owner: "like the Main theme, dark green and a white font" — the Art Kit's palette.
    check('pressing Matcha wears it at once: white words on dark green, readable — its buttons too',
      matcha.profile === 'custom' && matcha.theme === 'main' && matcha.paper === '#1A2420' && matcha.ink === '#F1F6EE' && matcha.accent === '#A6E3A1'
      && matcha.scheme === 'dark' && matcha.lit && !matcha.fixedLit && matcha.chip === 'Matcha' && matcha.stored === 'custom'
      && matcha.text > 10 && matcha.picked > 4.5 && matcha.primary > 4.5, JSON.stringify(matcha));

    // A slot, then a colour: the app is the preview.
    await win.evaluate(() => document.querySelector('#theme-editor .te-slot[data-slot="accent"]').click());
    const swatch = await win.evaluate(() => {
      const cell = [...document.querySelectorAll('#theme-editor .te-swatch')].find((c) => !c.classList.contains('on') && c.dataset.hex !== '#A6E3A1');
      cell.click();
      return cell.dataset.hex;
    });
    await win.waitForTimeout(150);
    const recoloured = await look();
    const barNow = await win.evaluate(() => ({ code: document.querySelector('#theme-editor .te-bar__code').textContent, hex: document.querySelector('#theme-editor .te-hex').value,
      box: document.querySelector('#theme-editor .te-slot.on').dataset.slot }));
    check('a ready colour on the Accent slot changes the app as it is pressed', recoloured.accent === swatch && recoloured.paper === '#1A2420'
      && recoloured.primary > 4.5 && barNow.code === swatch && barNow.hex === swatch && barNow.box === 'accent' && recoloured.chip !== 'Matcha',
      JSON.stringify({ swatch, recoloured, barNow }));
    await win.evaluate(() => document.querySelector('#theme-editor .te-slot[data-slot="bg"]').click());
    await win.fill('#theme-editor .te-hex', '#102030');
    await win.waitForTimeout(150);
    const typed = await look();
    check('a typed code on the Background slot does too', typed.paper === '#102030' && typed.inline === '#102030' && typed.accent === swatch, JSON.stringify(typed));
    await win.fill('#theme-editor .te-hex', '#F4F1EA');
    await win.evaluate(() => document.querySelector('#theme-editor .te-slot[data-slot="text"]').click());
    await win.waitForTimeout(150);
    const pale = await look();
    const warned = await win.evaluate(() => !document.querySelector('#theme-editor .te-warn').hidden);
    check('a pale ground rides on the light theme, and white words on it are called hard to read', pale.theme === 'light' && pale.scheme === 'light' && pale.paper === '#F4F1EA' && warned, JSON.stringify({ pale, warned }));
    await win.fill('#theme-editor .te-hex', '#1B1B1B');
    await win.waitForTimeout(150);
    check('and dark words on it are not', await win.evaluate(() => document.querySelector('#theme-editor .te-warn').hidden) && (await look()).text > 10);

    // Name it, save it.
    const profilesNow = () => win.evaluate(() => ({ stored: JSON.parse(localStorage.getItem('nebula:theme-profiles') || '[]').map((p) => p.name).join('|'),
      chips: [...document.querySelectorAll('#theme-editor .te-chip__name')].map((c) => c.textContent).join('|'),
      lit: document.querySelector('#theme-editor .te-chip.on .te-chip__name')?.textContent ?? null,
      ask: document.querySelector('#theme-editor .te-ask')?.textContent ?? null }));
    await win.fill('#theme-editor .te-name', '');
    await win.evaluate(() => document.querySelector('#theme-editor .te-save-btn').click());
    const unnamed = await profilesNow();
    await win.fill('#theme-editor .te-name', 'matcha');
    await win.evaluate(() => document.querySelector('#theme-editor .te-save-btn').click());
    const stolen = await profilesNow();
    check('a profile needs a name of its own to be saved', unnamed.stored === '' && stolen.stored === '', JSON.stringify({ unnamed, stolen }));
    await win.fill('#theme-editor .te-name', 'Paper day');
    await win.evaluate(() => document.querySelector('#theme-editor .te-save-btn').click());
    await win.waitForTimeout(150);
    const saved = await profilesNow();
    check('“Save this profile” keeps it under its name, beside the ready ones — Matcha and Contrast', saved.stored === 'Paper day' && saved.chips === 'Matcha|Contrast|Paper day' && saved.lit === 'Paper day', JSON.stringify(saved));
    await chipNamed('Matcha');
    await win.waitForTimeout(120);
    const backToMatcha = await look();
    await chipNamed('Paper day');
    await win.waitForTimeout(120);
    const backToMine = await look();
    check('and each profile is one press away', backToMatcha.paper === '#1A2420' && backToMatcha.ink === '#F1F6EE' && backToMine.paper === '#F4F1EA' && backToMine.ink === '#1B1B1B' && backToMine.accent === swatch,
      JSON.stringify({ backToMatcha, backToMine }));

    // Deleting asks first.
    const crossOf = (name) => win.evaluate((n) => [...document.querySelectorAll('#theme-editor .te-chip')].find((c) => c.querySelector('.te-chip__name')?.textContent === n).querySelector('.te-chip__x').click(), name);
    await crossOf('Paper day');
    const asked = await profilesNow();
    await win.evaluate(() => [...document.querySelectorAll('#theme-editor .te-profiles button')].find((b) => b.textContent === 'Cancel').click());
    const kept = await profilesNow();
    await crossOf('Paper day');
    await win.evaluate(() => document.querySelector('#theme-editor .te-chip--danger').click());
    const gone = await profilesNow();
    check('deleting a profile asks first', /Paper day/.test(asked.ask ?? '') && asked.stored === 'Paper day' && kept.stored === 'Paper day' && kept.ask === null
      && gone.stored === '' && gone.chips === 'Matcha|Contrast|Last edited', JSON.stringify({ asked, kept, gone }));
    // A ready profile goes the same way (the owner, 0.9.4) — and comes back at a press.
    await crossOf('Matcha');
    const askedReady = await profilesNow();
    await win.evaluate(() => document.querySelector('#theme-editor .te-chip--danger').click());
    const readyGone = await profilesNow();
    await win.evaluate(() => document.querySelector('#theme-editor .te-chip--back').click());
    const readyBack = await profilesNow();
    check('a ready profile can be deleted too, and is brought back', /Matcha/.test(askedReady.ask ?? '') && readyGone.chips === 'Contrast|Last edited' && readyBack.chips === 'Matcha|Contrast|Last edited', JSON.stringify({ askedReady, readyGone, readyBack }));

    // A fixed theme takes every picked colour off the page; the picks wait in the editor.
    await win.evaluate(() => document.querySelector('#theme-pick [data-theme="main"]').click());
    await win.waitForTimeout(150);
    const fixed = await look();
    const left = await win.evaluate(() => document.documentElement.getAttribute('style') ?? '');
    check('a fixed theme takes the picked colours off again', fixed.theme === 'main' && fixed.profile === null && fixed.inline === '' && !/--(paper|ink|rule|clay|on-clay|shadow)|color-scheme/.test(left)
      && !fixed.lit && fixed.fixedLit && fixed.stored === 'main' && fixed.paper !== '#F4F1EA', JSON.stringify({ fixed, left }));
    await chipNamed('Last edited');
    await win.waitForTimeout(120);
    const again = await look();
    check('the unsaved colours wait under “Last edited”', again.profile === 'custom' && again.paper === '#F4F1EA' && again.ink === '#1B1B1B', JSON.stringify(again));
    await win.evaluate(() => document.querySelector('#theme-pick [data-theme="main"]').click());

    // Archive and Trash need the room the editor stands in.
    await win.evaluate(() => document.querySelector('.drawer-tab').click());
    await win.waitForTimeout(150);
    const drawer = await win.evaluate(() => ({ editor: document.getElementById('theme-editor').hidden, expanded: document.getElementById('btn-theme-custom').getAttribute('aria-expanded'),
      open: document.querySelector('.drawer-tab').getAttribute('aria-expanded') }));
    await win.evaluate(() => document.getElementById('btn-theme-custom').click());
    await win.waitForTimeout(150);
    const swapped = await win.evaluate(() => ({ editor: !document.getElementById('theme-editor').hidden, drawers: [...document.querySelectorAll('.drawer-tab')].map((t) => t.getAttribute('aria-expanded')).join(',') }));
    await win.evaluate(() => document.querySelector('#theme-editor .te-close').click());
    check('opening Archive puts the editor away, and the editor puts Archive away', drawer.editor && drawer.expanded === 'false' && drawer.open === 'true'
      && swapped.editor && !/true/.test(swapped.drawers) && await win.evaluate(() => document.getElementById('theme-editor').hidden), JSON.stringify({ drawer, swapped }));
    }

    // ---- Fonts: a copy inside Nebula keeps its font; outside words take the note's ---
    const NEBULA_COPY = '<p style="font-family: Charter, &quot;Iowan Old Style&quot;, serif; font-size: 14px; color: rgb(237, 231, 247);">'
      + '<span class="c-red" style="font-family: Charter, serif; color: rgb(240, 128, 120);">default words</span> '
      + '<span style="font-family: Consolas, &quot;Cascadia Mono&quot;, monospace; font-size: 14px; color: rgb(237, 231, 247);">mono words</span></p>';
    await open('arrows');
    await open('paste');
    await win.evaluate(() => { document.getElementById('editor').innerHTML = '<p id="p">here</p><p id="q"><br></p>'; });
    await copy(NEBULA_COPY, 'default words mono words');
    await caretIn('#q');
    await win.keyboard.press('Control+v');
    await win.waitForTimeout(350);
    const fonts = await win.evaluate(() => {
      const find = (word) => { const w = document.createTreeWalker(document.getElementById('editor'), NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.includes(word)) return getComputedStyle(n.parentElement); return null; };
      return { mono: find('mono words')?.fontFamily, plain: find('default words')?.fontFamily, frozen: !!document.querySelector('#editor [style*="color"]'), red: !!document.querySelector('#editor .c-red') };
    });
    check('words copied in Nebula keep the font chosen for them, and the default ones stay the note’s own',
      /^Consolas/.test(fonts.mono ?? '') && /Charter/.test(fonts.plain ?? '') && !fonts.frozen && fonts.red, JSON.stringify(fonts));

    await open('fontnote');
    await copy('<p style="font-family: Arial; font-size: 20px;">outside <b>words</b></p><ul><li style="font-family: Georgia;">an item</li></ul>', 'outside words\nan item');
    await caretIn('#fn2');
    await win.keyboard.press('Control+v');
    await win.waitForTimeout(350);
    const dressed = await win.evaluate(() => {
      const find = (word) => { const w = document.createTreeWalker(document.getElementById('editor'), NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.includes(word)) return getComputedStyle(n.parentElement); return null; };
      return { a: find('outside')?.fontFamily, b: find('words')?.fontFamily, bold: Number(find('words')?.fontWeight) >= 600, item: find('an item')?.fontFamily, size: find('outside')?.fontSize, arial: /Arial|Georgia/.test(document.getElementById('editor').innerHTML) };
    });
    check('words from outside are written in the note’s writing font, bold and lists kept',
      [dressed.a, dressed.b, dressed.item].every((f) => /^Consolas/.test(f ?? '')) && dressed.bold && dressed.size === '14px' && !dressed.arial, JSON.stringify(dressed));

    // ---- The font menu: a search, and adding a font of this computer ----------------
    await caretIn('#fn1');
    await win.evaluate(() => document.getElementById('tb-font').click());
    await win.waitForFunction(() => !document.getElementById('menu-font').hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
    await win.click('#font-search');
    await win.keyboard.type('geo');
    await win.waitForTimeout(250);
    const searched = await win.evaluate(() => ({
      own: [...document.querySelectorAll('#font-rows > button')].map((b) => b.textContent.replace('×', '')).slice(0, 3).join('|'),
      open: !document.getElementById('menu-font').hidden,
      inside: (() => { const r = document.getElementById('menu-font').getBoundingClientRect(); return r.bottom <= window.innerHeight && r.right <= window.innerWidth; })(),
    }));
    check('the font menu has a search that narrows its list', searched.open && searched.own.startsWith('Georgia') && searched.inside, JSON.stringify(searched));
    await win.evaluate(() => { const s = document.getElementById('font-search'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await win.click('#font-add');
    await win.waitForFunction(() => document.querySelectorAll('#font-rows .tb-menu__label').length > 0 || document.querySelectorAll('#font-rows > button').length > 15, null, { polling: 100, timeout: 6000 }).catch(() => {});
    const installed = await win.evaluate(() => {
      const rows = [...document.querySelectorAll('#font-rows > button')].map((b) => b.textContent);
      const head = document.querySelector('#font-rows .tb-menu__label')?.textContent ?? '';
      return { head, count: rows.length, own: 15 };
    });
    check('"+ Add a font" lists the fonts of this computer', installed.head === 'On this computer' && installed.count > installed.own, JSON.stringify(installed));
    // Pressed, the button has done its work: it does not stand under the fonts it opened.
    const addSeen = () => win.evaluate(() => { const b = document.getElementById('font-add'); return `${getComputedStyle(b).display !== 'none'}:${b.textContent}`; });
    const addAfter = await addSeen();
    await win.fill('#font-search', 'Zz Qq 9');
    const addTyped = await addSeen();
    await win.fill('#font-search', '');
    const addCleared = await addSeen();
    check('once pressed, "+ Add a font" is gone from under the fonts it opened — back only for a typed name that is in no list', addAfter.startsWith('false:') && addTyped === 'true:+ Add “Zz Qq 9”' && addCleared.startsWith('false:'), JSON.stringify({ addAfter, addTyped, addCleared }));
    // Pick the first font of the computer: it is added to the list and becomes the note's.
    const added = await win.evaluate(() => {
      const head = document.querySelector('#font-rows .tb-menu__label');
      const first = head?.nextElementSibling;
      const name = first?.textContent ?? '';
      first?.click();
      return name;
    });
    await win.waitForTimeout(200);
    await win.evaluate(() => document.getElementById('tb-font').click());
    await win.waitForTimeout(150);
    const afterAdd = await win.evaluate((name) => ({
      listed: [...document.querySelectorAll('#font-rows > button')].some((b) => b.textContent.replace('×', '') === name && b.querySelector('.tb-menu__x')),
      shown: document.querySelector('#tb-font .tb-font__name').textContent,
    }), added);
    check('a font picked there joins the list, with a × to take it off again', !!added && afterAdd.listed, JSON.stringify({ added, ...afterAdd }));
    check('and with the menu opened anew, "+ Add a font" is there again', (await addSeen()) === 'true:+ Add a font', await addSeen());
    await win.keyboard.press('Escape');

    // ---- The guide follows the language, while nobody has written in it ---------
    const guideRow = () => win.evaluate(() => [...document.querySelectorAll('#note-list .note-row')].map((r) => r.title)
      .filter((t) => /Nebula/.test(t)).join('|'));
    check('a vault that had no guide gets it, in English', (await guideRow()) === 'Welcome to Nebula Guide', await guideRow());
    await open('Welcome to Nebula Guide');
    await win.evaluate(() => document.querySelector('#lang-row [data-lang="de"]').click());
    await win.waitForFunction(() => document.querySelector('#title').value === 'Willkommen bei Nebula – Anleitung', null, { polling: 50, timeout: 8000 }).catch(() => {});
    const german = await win.evaluate(() => ({
      title: document.querySelector('#title').value,
      h1: document.querySelector('#editor h1')?.textContent,
      section: [...document.querySelectorAll('#editor h2')].map((h) => h.textContent).find((t) => t.startsWith('9')),
      shape: document.querySelector('#editor .shape-text')?.textContent,
      locked: document.getElementById('editor').dataset.readonly === 'true',
      code: document.querySelectorAll('#editor .blk-code').length,
      rows: [...document.querySelectorAll('#note-list .note-row')].filter((r) => /Nebula/.test(r.title)).length,
    }));
    check('choosing Deutsch turns the open guide German: title, page, shapes — still locked, its code samples kept',
      german.title === 'Willkommen bei Nebula – Anleitung' && german.h1 === 'Willkommen bei Nebula' && german.section === '9 · Deine Privatsphäre'
      && german.shape === 'hinter dem Text' && german.locked && german.code === 16 && german.rows === 1, JSON.stringify(german));
    await open('paste');
    const mineBefore = await win.evaluate(() => document.getElementById('editor').innerHTML);
    await win.evaluate(() => document.querySelector('#lang-row [data-lang="tr"]').click());
    await win.waitForFunction(() => [...document.querySelectorAll('#note-list .note-row')].some((r) => r.title === 'Nebula’ya Hoş Geldiniz – Rehber'), null, { polling: 50, timeout: 8000 }).catch(() => {});
    check('with another note open the guide still follows (Türkçe), and the open note is not touched',
      (await guideRow()) === 'Nebula’ya Hoş Geldiniz – Rehber' && await win.evaluate((b) => document.getElementById('editor').innerHTML === b && document.querySelector('#title').value === 'paste', mineBefore),
      await guideRow());
    // Written in: it is the reader's now, and stays as it is.
    await win.evaluate(() => [...document.querySelectorAll('#note-list .note-row')].find((r) => r.title === 'Nebula’ya Hoş Geldiniz – Rehber').click());
    await win.waitForFunction(() => document.querySelector('#title').value === 'Nebula’ya Hoş Geldiniz – Rehber', null, { polling: 50 });
    await win.evaluate(() => document.getElementById('readonly-chip').click());
    await win.waitForFunction(() => document.getElementById('editor').dataset.readonly !== 'true', null, { polling: 50 });
    await win.evaluate(() => {
      const h = document.querySelector('#editor h1');
      const r = document.createRange();
      r.selectNodeContents(h);
      r.collapse(false);
      document.getElementById('editor').focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.type(' benim');
    await win.waitForTimeout(700);
    await win.evaluate(() => document.querySelector('#lang-row [data-lang="en"]').click());
    await win.waitForTimeout(500);
    const kept = await win.evaluate(() => ({ title: document.querySelector('#title').value, h1: document.querySelector('#editor h1')?.textContent }));
    check('a guide somebody wrote in keeps its language and its words', kept.title === 'Nebula’ya Hoş Geldiniz – Rehber' && kept.h1 === 'Nebula’ya Hoş Geldiniz benim', JSON.stringify(kept));

    // ---- An AI tab: clear its session, and Delete asks first -----------------------
    await win.evaluate(() => { if (document.getElementById('ai-panel').hidden) document.querySelector('[data-pad="ai"]').click(); });
    await win.waitForFunction(() => document.querySelectorAll('#ai-tabs .ai-tab').length > 1, null, { polling: 50, timeout: 8000 }).catch(() => {});
    const tabMenu = async () => {
      const tab = await win.evaluate(() => { const r = document.querySelector('#ai-tabs [data-ai="mistral"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await win.evaluate(() => document.querySelector('#ai-tabs [data-ai="mistral"]').scrollIntoView({ inline: 'center' }));
      const at = await win.evaluate(() => { const r = document.querySelector('#ai-tabs [data-ai="mistral"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await win.mouse.click(at.x || tab.x, at.y || tab.y, { button: 'right' });
      await win.waitForFunction(() => !document.getElementById('ai-site-menu').hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
      return win.evaluate(() => [...document.querySelectorAll('#ai-site-menu button')].map((b) => b.textContent).join('|'));
    };
    const pressItem = (label) => win.evaluate((l) => [...document.querySelectorAll('#ai-site-menu button')].find((b) => b.textContent === l)?.click(), label);
    const items = await tabMenu();
    check('a right-click on an AI tab offers Clear session data, right above Delete website', /Clear session data\|Delete website/.test(items), items);
    await pressItem('Delete website');
    const asked = await win.evaluate(() => ({ q: document.querySelector('#ai-site-menu .fm-confirm')?.textContent, buttons: [...document.querySelectorAll('#ai-site-menu button')].map((b) => b.textContent).join('|') }));
    check('Delete website asks first', asked.q === 'Delete Mistral from the panel?' && asked.buttons === 'Delete|Cancel', JSON.stringify(asked));
    await pressItem('Cancel');
    check('Cancel leaves the tab where it was', await win.evaluate(() => !!document.querySelector('#ai-tabs [data-ai="mistral"]') && document.getElementById('ai-site-menu').hidden));
    await tabMenu();
    await pressItem('Clear session data');
    const clearAsk = await win.evaluate(() => document.querySelector('#ai-site-menu .fm-confirm')?.textContent);
    check('Clear session data asks first, and says what it does', clearAsk === 'Clear the session data of Mistral? You will be signed out of it here.', String(clearAsk));
    await app.evaluate(async ({ session }) => { await session.fromPartition('persist:ai-mistral').cookies.set({ url: 'https://chat.mistral.ai', name: 'probe', value: '1', expirationDate: Date.now() / 1000 + 3600 }); });
    await pressItem('Clear');
    await win.waitForFunction(() => !document.getElementById('toast').hidden, null, { polling: 50, timeout: 6000 }).catch(() => {});
    const cleared = await app.evaluate(async ({ session }) => (await session.fromPartition('persist:ai-mistral').cookies.get({ name: 'probe' })).length);
    check('and then that tab’s cookies are gone', cleared === 0 && await win.evaluate(() => document.getElementById('toast').textContent === 'Session data cleared'),
      `${cleared} ${await win.evaluate(() => document.getElementById('toast').textContent)}`);
    await tabMenu();
    await pressItem('Delete website');
    await pressItem('Delete');
    check('Delete, once confirmed, removes the tab', await win.evaluate(() => !document.querySelector('#ai-tabs [data-ai="mistral"]')));

    // ---- The owner's Ideas note, the Bug part (2026-10-11) --------------------
    // "The divider under Bug gets selected — when it is a divider, a bullet point, a picture, in that order."
    {
    await open('bullet');
    await win.waitForTimeout(200);
    const lineAt = await win.evaluate(() => { const r = document.getElementById('bl').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
    await win.mouse.click(lineAt.x, lineAt.y);
    await win.click('#toolbar [data-act="ul"]');
    await win.waitForTimeout(150);
    const bulletNow = () => win.evaluate(() => {
      const ed = document.getElementById('editor');
      const sel = getSelection();
      const at = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
      return { order: [...ed.children].slice(0, 4).map((e) => e.tagName.toLowerCase()).join(','), inItem: !!at?.closest('li'), onNote: sel.anchorNode === ed, armed: ed.querySelectorAll('hr.armed').length, hrs: ed.querySelectorAll('hr.blk-hr').length, pictures: ed.querySelectorAll('.note-image').length };
    });
    const bulleted = await bulletNow();
    check('bullets made on the empty line between a divider and a picture: the caret is in the bullet, not beside the list', bulleted.order === 'p,hr,ul,figure' && bulleted.inItem && !bulleted.onNote, JSON.stringify(bulleted));
    await win.keyboard.press('Backspace');
    await win.waitForTimeout(150);
    const unbulleted = await bulletNow();
    check('Backspace there makes it a line again — the divider is neither picked nor taken, the picture stays', unbulleted.order === 'p,hr,p,figure' && unbulleted.armed === 0 && unbulleted.hrs === 1 && unbulleted.pictures === 1, JSON.stringify(unbulleted));
    await win.click('#toolbar [data-act="ul"]');
    await win.waitForTimeout(150);
    await win.keyboard.type('point');
    const typedIn = await win.evaluate(() => document.querySelector('#editor hr.blk-hr + ul > li')?.textContent);
    check('and words typed after the bar’s bullets go into the bullet', typedIn === 'point', String(typedIn));

    // "On the right side the divider falls short": the scroll bar stood between the writing and the frame.
    const sides = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const frame = ed.getBoundingClientRect();
      const hr = ed.querySelector('hr.blk-hr').getBoundingClientRect();
      const words = document.getElementById('be').getBoundingClientRect();
      return { left: hr.left - frame.left, right: frame.right - hr.right, words: frame.right - words.right, scrolls: ed.scrollHeight > ed.clientHeight, sideways: ed.scrollWidth > ed.clientWidth };
    });
    check('on Nebula Wide a divider ends as far from the frame at the right as it begins at the left, in a note that scrolls', sides.scrolls && !sides.sideways && Math.abs(sides.left - sides.right) <= 1 && Math.abs(sides.words - sides.right) <= 1, JSON.stringify(sides));
    await open('arrows');
    await win.waitForTimeout(200);
    const shortSides = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const frame = ed.getBoundingClientRect();
      const line = ed.firstElementChild.getBoundingClientRect();
      return { left: line.left - frame.left, right: frame.right - line.right, scrolls: ed.scrollHeight > ed.clientHeight };
    });
    check('and the same in a note that does not scroll: the lines do not move when it begins to', !shortSides.scrolls && Math.abs(shortSides.left - shortSides.right) <= 1 && Math.abs(shortSides.right - sides.right) <= 1, JSON.stringify(shortSides));

    await open('gone');
    await win.waitForTimeout(200);
    // "Let the code block go beside the code in a line, up among the icons."
    const barOrder = await win.evaluate(() => [...document.querySelectorAll('#toolbar .tb-row')].map((row) => [...row.querySelectorAll('[data-act]')].map((b) => b.dataset.act).join(',')));
    check('the bar’s code block stands right after its inline code', barOrder.some((row) => row.includes('code,codeblock,link')) && barOrder.join(',').split(',').filter((a) => a === 'codeblock').length === 1, barOrder.join(' / '));
    const barFits = await win.evaluate(() => { const bar = document.getElementById('toolbar').getBoundingClientRect(); return [...document.querySelectorAll('#toolbar .tb-row > *')].every((el) => { const r = el.getBoundingClientRect(); return r.width === 0 || (r.left >= bar.left - 1 && r.right <= bar.right + 1); }); });
    check('and the row still fits the bar', barFits);

    // "Why is this such a grey screen": an embed whose process was gone stayed a grey box.
    const answer = () => win.evaluate(async () => {
      const w = document.querySelector('#editor webview');
      try { return await Promise.race([w.executeJavaScript('document.title + (window.__seen ? " seen" : "")'), new Promise((r) => setTimeout(() => r('no answer'), 1500))]); } catch { return 'no answer'; }
    });
    let alive = '';
    for (let i = 0; i < 40 && alive !== 'alive'; i += 1) { alive = await answer(); if (alive !== 'alive') await win.waitForTimeout(150); }
    await win.evaluate(() => document.querySelector('#editor webview').executeJavaScript('window.__seen = true'));
    const endEmbeds = () => app.evaluate(({ webContents }) => webContents.getAllWebContents().filter((c) => c.getType() === 'webview' && c.getURL().startsWith('data:text/html,<title>alive')).map((c) => { c.forcefullyCrashRenderer(); return 1; }).length);
    const embedsEnded = await endEmbeds();
    let back = '';
    for (let i = 0; i < 40 && back !== 'alive'; i += 1) { await win.waitForTimeout(200); back = await answer(); }
    check('an embed whose process is gone is loaded again', alive === 'alive' && embedsEnded === 1 && back === 'alive', `${alive} | ${embedsEnded} | ${back}`);
    const savedGone = await win.evaluate(() => document.querySelector('.savestate').textContent);
    check('and that is no edit: nothing is waiting to be saved', !/saving|unsaved/i.test(savedGone), savedGone);
    }

    check('no page errors in the 0.9.4 checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runV094Checks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
