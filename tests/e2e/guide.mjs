/**
 * The guide, regenerated and checked on every build (owner, 0.8.9).
 *
 * A fresh vault is seeded with this build's "Welcome to Nebula Guide", opened
 * in the real app and read the way a person reads it: it is locked, every
 * numbered section is a folded heading (1.0.4) that its arrow opens, Where
 * your notes live and Code blocks are the last two sections with Markdown the
 * first sample, every code sample is coloured, every equation typeset, the
 * demo shapes stay clear of the text at three window widths, and nothing on
 * the page throws. scripts/place-test-exe.js writes the same page into Nebula
 * Test's vault after every test build.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runGuideChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-guide-'));
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow(); win.setDefaultTimeout(10000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await app.evaluate(({ dialog, BrowserWindow }) => { dialog.showMessageBox = async () => ({ response: 0 }); BrowserWindow.getAllWindows()[0].setSize(1280, 1000); });
    await win.waitForFunction(() => document.querySelector('.note-row.active'), null, { polling: 50 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.waitForTimeout(1500);   // code and equations paint after open

    const page = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const top = [...ed.children].filter((el) => !el.matches('.shape-layer, .image-layer, .guide-stage'));
      // A section is a toggle whose title is its heading; what it says is in the toggle's body.
      const folds = top.filter((el) => el.matches('.blk-toggle') && el.firstElementChild?.tagName === 'H2');
      const body = (fold) => fold.querySelector(':scope > .toggle-body');
      return {
        title: document.getElementById('title').value,
        locked: !document.getElementById('readonly-chip').hidden && !ed.isContentEditable,
        sections: folds.map((fold) => fold.firstElementChild.textContent),
        numbered: folds.every((fold, i) => fold.firstElementChild.textContent.startsWith(`${i + 1} · `)),
        folded: folds.every((fold) => fold.dataset.open !== 'true' && !body(fold)?.offsetParent),
        looseHeads: top.filter((el) => el.tagName === 'H2').length,
        doubleDividers: top.some((el, i) => el.tagName === 'HR' && top[i + 1]?.tagName === 'HR'),
        endsWithDivider: top.at(-1)?.tagName === 'HR',
        emptySection: folds.some((fold) => !body(fold)?.children.length),
      };
    });
    check('the guide is what a fresh vault opens, and it opens locked', page.title === 'Welcome to Nebula Guide' && page.locked, JSON.stringify({ title: page.title, locked: page.locked }));
    check('every numbered section is a folded heading, in its order, and no heading stands loose',
      page.sections.length >= 20 && page.numbered && page.folded && page.looseHeads === 0, JSON.stringify({ n: page.sections.length, numbered: page.numbered, folded: page.folded, loose: page.looseHeads }));
    check('no two dividers in a row, none at the end, no empty section', !page.doubleDividers && !page.endsWithDivider && !page.emptySection, JSON.stringify(page));
    check('Where your notes live and Code blocks are the last two sections',
      page.sections.at(-2) === '19 · Where your notes live' && page.sections.at(-1) === '20 · Code blocks', JSON.stringify(page.sections.slice(-3)));

    // A reader opens a section with the arrow before its heading, and Only view lets them.
    for (let i = 0; i < page.sections.length; i++) {
      const at = await win.evaluate((n) => {
        const head = document.querySelectorAll('#editor > .blk-toggle > h2')[n];
        head.scrollIntoView({ block: 'center' });
        const r = head.getBoundingClientRect();
        return { x: r.left + 8, y: (r.top + r.bottom) / 2 };
      }, i);
      await win.mouse.click(at.x, at.y);
    }
    const opened = await win.evaluate(() => [...document.querySelectorAll('#editor > .blk-toggle')]
      .filter((fold) => fold.dataset.open !== 'true' || !fold.querySelector(':scope > .toggle-body')?.offsetParent)
      .map((fold) => fold.firstElementChild.textContent));
    check('the arrow before a heading opens its section, on the locked page too', opened.length === 0, opened.join(' | '));
    await win.waitForTimeout(1500);   // what was folded paints now

    const code = await win.evaluate(() => {
      const blocks = [...document.querySelectorAll('#editor .blk-code')];
      return {
        first: blocks[0]?.dataset.lang,
        count: blocks.length,
        unpainted: blocks.filter((b) => b.dataset.lang !== 'plain' && !b.querySelector('.code-src [class^="tok-"]')).map((b) => b.dataset.lang),
        afterCodeHeading: [...document.querySelectorAll('#editor > .blk-toggle')].find((fold) => fold.firstElementChild.textContent === '20 · Code blocks')?.querySelector('.blk-code')?.dataset.lang,
      };
    });
    check('the code samples open with Markdown, and every one is coloured', code.afterCodeHeading === 'markdown' && code.count >= 16 && code.unpainted.length === 0, JSON.stringify(code));
    const eq = await win.evaluate(() => { const all = [...document.querySelectorAll('#editor .inline-eq')]; return { n: all.length, typeset: all.filter((e) => e.querySelector('.katex')).length }; });
    check('every equation in the guide is typeset', eq.n > 0 && eq.typeset === eq.n, JSON.stringify(eq));

    const overlaps = [];
    for (const [w, h] of [[960, 900], [1280, 1000], [1920, 1040]]) {
      await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setSize(...s), [w, h]);
      await win.waitForTimeout(400);
      overlaps.push(await win.evaluate(() => {
        const ed = document.getElementById('editor');
        const text = [...ed.querySelectorAll('h1, h2, h3, p, li')].filter((e) => !e.closest('.shape-layer, .shape') && e.textContent.trim());
        return [...ed.querySelectorAll('.shape')].filter((s) => { const r = s.getBoundingClientRect(); return text.some((t) => { const q = t.getBoundingClientRect(); return r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom; }); }).length;
      }));
    }
    check('the demo shapes stay clear of the text at 960, 1280 and 1920 px', overlaps.every((n) => n === 0), JSON.stringify(overlaps));
    check('the guide loads without a page error', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('guide checks ran to the end', false, err.message.split('\n').slice(0, 3).join(' | '));
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
