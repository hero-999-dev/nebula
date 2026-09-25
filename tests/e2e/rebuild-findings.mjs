/**
 * What the page-rebuild test found, pinned in smoke so it stays fixed offline.
 *
 * The rebuild (rebuild-page.mjs) needs the network and a real article; these
 * are the three faults it exposed, reproduced with nothing but keys:
 *   - Enter on an empty quote line did not leave the quote;
 *   - italic switched off at the end of a line came back after Enter;
 *   - a YouTube link embedded the whole watch page instead of the player.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runRebuildFindingChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-findings-'));
  fs.mkdirSync(path.join(profile, 'storage/notes'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'storage/notes/f.json'), JSON.stringify({ id: 'f', title: 'Findings', content: '<p><br></p>', createdAt: Date.now(), updatedAt: Date.now() }));
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow(); win.setDefaultTimeout(10000);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
    await win.waitForFunction(() => document.querySelector('.note-row.active'), null, { polling: 50 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    // Fixture steps press without Playwright's rAF-based stability wait (see press() in smoke.mjs).
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes('Findings'))?.click());
    await win.waitForFunction(() => document.querySelector('#title').value === 'Findings', null, { polling: 50 });
    await win.evaluate(() => {
      const ed = document.getElementById('editor'); ed.focus();
      const r = document.createRange(); r.setStart(ed.querySelector('p'), 0); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    const slash = async (q) => {
      await win.keyboard.type(`/${q}`, { delay: 15 });
      await win.waitForFunction(() => !document.getElementById('slash-menu').hidden, null, { polling: 50 });
      await win.keyboard.press('Enter');
    };
    const blocks = () => win.evaluate(() => [...document.getElementById('editor').children]
      .filter((e) => !e.matches('.shape-layer, .image-layer'))
      .map((e) => `${e.tagName.toLowerCase()}:${e.textContent.trim()}`));

    /* A quote, then Enter twice: the next line is outside it. */
    await slash('quote');
    await win.keyboard.type('Quoted words', { delay: 5 });
    await win.keyboard.press('Enter');
    await win.keyboard.press('Enter');
    await win.keyboard.type('Plain after quote', { delay: 5 });
    let b = await blocks();
    check('Enter on an empty quote line leaves the quote', b.includes('blockquote:Quoted words') && b.some((x) => /^(p|div):Plain after quote$/.test(x)), JSON.stringify(b));

    /* Italic to the end of a line, Ctrl+I off, Enter: the next line is plain. */
    await win.keyboard.press('Enter');
    await win.keyboard.press('Control+i');
    await win.keyboard.type('an italic caption', { delay: 5 });
    await win.keyboard.press('Control+i');
    await win.keyboard.press('Enter');
    await win.keyboard.type('then plain text', { delay: 5 });
    const plain = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const line = [...ed.querySelectorAll('p, div')].find((e) => e.textContent.trim() === 'then plain text');
      const t = line && document.createTreeWalker(line, 4).nextNode();
      let italic = false;
      for (let el = t?.parentElement; el && el !== ed; el = el.parentElement) if (/^(I|EM)$/.test(el.tagName) || el.style.fontStyle === 'italic') italic = true;
      return { found: !!line, italic };
    });
    check('italic switched off before Enter stays off on the next line', plain.found && !plain.italic, JSON.stringify(plain));

    /* A YouTube link, pasted and embedded: the card loads the player. */
    await win.keyboard.press('Enter');
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://www.youtube.com/watch?v=FUfGcZ092b0&t=90'));
    await win.keyboard.press('Control+v');
    await win.waitForFunction(() => document.getElementById('link-url-input')?.offsetParent, null, { polling: 50 });
    await win.evaluate(() => document.querySelector('[data-link-kind="embed"]').click());
    const card = await win.evaluate(() => {
      const c = document.querySelector('#editor .link-block[data-kind="embed"]');
      const w = c?.querySelector('webview');
      return { url: c?.dataset.url, src: w?.getAttribute('src'), referrer: w?.getAttribute('httpreferrer'), video: c?.classList.contains('link-embed--video') };
    });
    check('a YouTube embed loads the player, not the watch page',
      card.src === 'https://www.youtube-nocookie.com/embed/FUfGcZ092b0?start=90' && card.video, JSON.stringify(card));
    check('the video card still shows the link that was pasted', card.url === 'https://www.youtube.com/watch?v=FUfGcZ092b0&t=90');
    check('the player is sent a referrer (YouTube refuses one without: error 153)', /^https:\/\//.test(card.referrer || ''));

    /* Links on words: select them, paste a URL over them. */
    await win.evaluate(() => document.getElementById('editor').focus());
    await win.keyboard.press('Control+End');
    await win.keyboard.press('Enter');
    await win.keyboard.type('Read the report today', { delay: 5 });
    for (let k = 0; k < ' today'.length; k++) await win.keyboard.press('ArrowLeft');
    for (let k = 0; k < 'the report'.length; k++) await win.keyboard.press('Shift+ArrowLeft');
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.org/report'));
    await win.keyboard.press('Control+v');
    await win.keyboard.press('End');
    await win.keyboard.type(' and more', { delay: 5 });
    const link = await win.evaluate(() => {
      const a = [...document.querySelectorAll('#editor a.link-url')].find((x) => x.getAttribute('href') === 'https://example.org/report');
      return { text: a?.textContent, line: a?.parentElement?.textContent };
    });
    check('pasting a URL over selected words links those words', link.text === 'the report', JSON.stringify(link));
    check('text typed after the line stays outside the link', link.line === 'Read the report today and more', JSON.stringify(link));

    /* Ctrl+click opens the link in the system browser. */
    await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u); }; });
    const at = await win.evaluate(() => { const r = document.querySelector('#editor a.link-url').getBoundingClientRect(); return { x: r.left + 5, y: r.top + r.height / 2 }; });
    await win.keyboard.down('Control');
    await win.mouse.click(at.x, at.y);
    await win.keyboard.up('Control');
    await win.waitForTimeout(300);
    check('Ctrl+click opens a link in the browser', (await app.evaluate(() => globalThis.__opened)).includes('https://example.org/report'));

    /* A caption on an image, and back to the note with Enter. */
    await win.evaluate((src) => {
      const ed = document.getElementById('editor');
      const layer = document.createElement('div');
      layer.className = 'image-layer';
      layer.setAttribute('contenteditable', 'false');
      layer.innerHTML = `<figure class="note-image" contenteditable="false" style="left: 640px; top: 20px; width: 120px; height: 120px;"><img src="${src}"></figure>`;
      ed.prepend(layer);
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    }, `data:image/png;base64,${fs.readFileSync(path.join(root, 'build', 'icon.png')).toString('base64')}`);
    await win.evaluate(() => document.getElementById('editor').focus());
    await win.keyboard.press('Control+End');
    // Right of the video card (a webview is its own layer and would take the click), and on screen.
    const fig = await win.evaluate(() => { const f = document.querySelector('#editor .note-image'); f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.click(fig.x, fig.y);
    const btn = await win.evaluate(() => { const r = document.querySelector('#image-bar [data-image="caption"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.click(btn.x, btn.y);
    await win.keyboard.type('Source: survey', { delay: 5 });
    await win.keyboard.press('Enter');
    await win.keyboard.type(' back', { delay: 5 });
    const cap = await win.evaluate(() => ({
      caption: document.querySelector('#editor .note-image figcaption')?.textContent,
      image: !!document.querySelector('#editor .note-image'),
      prose: [...document.querySelectorAll('#editor > p, #editor > div:not(.image-layer)')].some((p) => p.textContent.endsWith('and more back')),
    }));
    check('the image bar adds a caption to the image itself', cap.caption === 'Source: survey' && cap.image, JSON.stringify(cap));
    check('Enter leaves the caption and typing goes back into the note', cap.prose, JSON.stringify(cap));

    /* /divider on the empty <div> line Enter makes goes to the top level, not inside it. */
    await win.keyboard.press('Enter');
    await slash('divider');
    await slash('h2');
    await win.keyboard.type('After the rule', { delay: 5 });
    const rule = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const h = [...ed.querySelectorAll('h2')].find((x) => x.textContent === 'After the rule');
      const hr = h?.previousElementSibling;
      return { heading: h?.parentElement === ed, hr: hr?.tagName === 'HR' && hr.parentElement === ed };
    });
    check('/divider on an empty line goes to the top level, and the heading after it too', rule.heading && rule.hr, JSON.stringify(rule));

    /* Arrows have their own menu beside the shapes, with icons and whole names (0.8.6). */
    const menus = await win.evaluate(() => {
      document.querySelector('[data-menu="menu-arrows"]').click();
      const m = document.getElementById('menu-arrows');
      const rows = [...m.querySelectorAll('[data-arrow-add]')];
      const out = {
        inShapes: !!document.querySelector('#menu-shapes [data-arrow-add]'),
        rows: rows.length,
        icons: rows.every((b) => b.querySelector('svg')),
        truncated: rows.filter((b) => { const l = b.querySelector('.label'); return l.scrollWidth > l.clientWidth + 1; }).map((b) => b.textContent),
      };
      document.querySelector('[data-menu="menu-arrows"]').click();
      return out;
    });
    check('arrows are in their own menu, not the shape list', !menus.inShapes && menus.rows === 3, JSON.stringify(menus));
    check('every arrow row has an icon and its whole name', menus.icons && menus.truncated.length === 0, JSON.stringify(menus));

    /* A pasted image sits in the text and stays clear of it at any window width (0.8.6). */
    await win.evaluate(() => document.getElementById('editor').focus());
    await win.keyboard.press('Control+End');
    await win.keyboard.press('Enter');
    await win.keyboard.type('Line above the picture', { delay: 5 });
    await win.keyboard.press('Enter');
    const before = await win.locator('#editor .note-image').count();
    await app.evaluate(({ clipboard, nativeImage }, file) => clipboard.writeImage(nativeImage.createFromPath(file)), path.join(root, 'build', 'icon.png'));
    await win.keyboard.press('Control+v');
    await win.waitForFunction((n) => document.querySelectorAll('#editor .note-image').length > n, before, { polling: 50 });
    await win.keyboard.type('Line below the picture', { delay: 5 });
    const placed = await win.evaluate(() => {
      const f = [...document.querySelectorAll('#editor .note-image--inline')].pop();
      return { inText: f?.parentElement?.id === 'editor', prev: f?.previousElementSibling?.textContent, next: f?.nextElementSibling?.textContent };
    });
    check('a pasted image goes into the text on the caret line', placed.inText && placed.prev === 'Line above the picture' && placed.next === 'Line below the picture', JSON.stringify(placed));
    const clear = [];
    for (const [w, h] of [[1920, 1040], [900, 900]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [w, h]);
      await win.waitForTimeout(500);
      clear.push(await win.evaluate(() => {
        const f = [...document.querySelectorAll('#editor .note-image--inline')].pop();
        const r = f.getBoundingClientRect();
        const lines = [...document.querySelectorAll('#editor > p, #editor > div:not(.image-layer):not(.shape-layer)')].filter((el) => el.textContent.trim());
        return !lines.some((el) => { const t = el.getBoundingClientRect(); return r.top < t.bottom - 2 && t.top < r.bottom - 2 && r.left < t.right && t.left < r.right; });
      }));
    }
    check('the image in the text never overlaps the text, wide or narrow', clear.every(Boolean), JSON.stringify(clear));

    /* The link menu by keyboard (0.8.7): ↓ into the choices, ← → between them, Enter. */
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 1000));
    await win.evaluate(() => document.getElementById('editor').focus());
    await win.keyboard.press('Control+End');
    await win.keyboard.press('Enter');
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.org/keys'));
    await win.keyboard.press('Control+v');
    await win.waitForFunction(() => document.getElementById('link-url-input')?.offsetParent, null, { polling: 50 });
    // The menu focuses its address on the next frame; a person reads it first.
    await win.waitForFunction(() => document.activeElement?.id === 'link-url-input', null, { polling: 50 });
    await win.keyboard.press('ArrowDown');
    const first = await win.evaluate(() => document.activeElement?.dataset?.linkKind);
    await win.keyboard.press('ArrowLeft');                 // wraps to the last: Mention
    await win.keyboard.press('Enter');
    const byKeys = await win.evaluate(() => ({
      menuHidden: document.getElementById('link-menu').hidden,
      mention: [...document.querySelectorAll('#editor a.link-mention')].some((a) => a.getAttribute('href') === 'https://example.org/keys'),
    }));
    check('in the link menu ↓ reaches the choices and ← → Enter picks one', first === 'embed' && byKeys.menuHidden && byKeys.mention, JSON.stringify({ first, ...byKeys }));

    /* Rust (0.8.7): the guide's Rust sample is coloured in the running app. */
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes('Welcome to Nebula Guide'))?.click());
    await win.waitForFunction(() => document.querySelector('#editor .blk-code[data-lang="rust"] .code-src span'), null, { polling: 100, timeout: 8000 }).catch(() => {});
    const rust = await win.evaluate(() => {
      const src = document.querySelector('#editor .blk-code[data-lang="rust"] .code-src');
      const has = (cls, text) => [...(src?.querySelectorAll(`.tok-${cls}`) || [])].some((t) => t.textContent === text);
      return { block: !!src, lifetime: has('decorator', "'a"), attribute: has('atrule', '#[derive(Debug, Clone)]'), macro: has('fn', 'println!'), picker: !!document.querySelector('.code-lang option[value="rust"]') };
    });
    check('Rust code blocks are coloured (lifetimes, attributes, macros) and in the picker', Object.values(rust).every(Boolean), JSON.stringify(rust));
  } catch (err) {
    check('rebuild-finding checks ran to the end', false, err.message.split('\n')[0]);
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
