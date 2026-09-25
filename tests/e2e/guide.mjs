/**
 * The guide, regenerated and checked on every build (owner, 0.8.9).
 *
 * A fresh vault is seeded with this build's "Welcome to Nebula Guide", opened
 * in the real app and read the way a person reads it: it is locked, every
 * section is closed by a divider before the next heading, Where your notes
 * live and Code blocks are the last two sections with Markdown the first
 * sample, every code sample is coloured, every equation typeset, the demo
 * shapes stay clear of the text at three window widths, and nothing on the
 * page throws. scripts/place-test-exe.js writes the same page into Nebula
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
      const h2 = top.filter((el) => el.tagName === 'H2');
      return {
        title: document.getElementById('title').value,
        locked: !document.getElementById('readonly-chip').hidden && !ed.isContentEditable,
        sections: h2.map((h) => h.textContent),
        dividerBefore: h2.map((h) => h.previousElementSibling?.matches('hr.blk-hr') ?? false),
        doubleDividers: top.some((el, i) => el.tagName === 'HR' && top[i + 1]?.tagName === 'HR'),
        endsWithDivider: top.at(-1)?.tagName === 'HR',
        emptySection: h2.some((h) => !h.nextElementSibling || h.nextElementSibling.matches('hr, h2')),
      };
    });
    check('the guide is what a fresh vault opens, and it opens locked', page.title === 'Welcome to Nebula Guide' && page.locked, JSON.stringify({ title: page.title, locked: page.locked }));
    check('every section is closed by a divider before the next heading',
      page.dividerBefore.length >= 10 && page.dividerBefore.every(Boolean), JSON.stringify(page.sections.filter((_, i) => !page.dividerBefore[i])));
    check('no two dividers in a row, none at the end, no empty section', !page.doubleDividers && !page.endsWithDivider && !page.emptySection, JSON.stringify(page));
    check('Where your notes live and Code blocks are the last two sections',
      page.sections.at(-2) === '9 · Where your notes live' && page.sections.at(-1) === '10 · Code blocks', JSON.stringify(page.sections.slice(-3)));

    const code = await win.evaluate(() => {
      const blocks = [...document.querySelectorAll('#editor .blk-code')];
      return {
        first: blocks[0]?.dataset.lang,
        count: blocks.length,
        unpainted: blocks.filter((b) => b.dataset.lang !== 'plain' && !b.querySelector('.code-src [class^="tok-"]')).map((b) => b.dataset.lang),
        afterCodeHeading: (() => { const h = [...document.querySelectorAll('#editor h2')].find((x) => x.textContent === '10 · Code blocks'); let el = h; while (el && !el.matches('.blk-code')) el = el.nextElementSibling; return el?.dataset.lang; })(),
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
        const text = [...ed.querySelectorAll('h1, h2, h3, p, li')].filter((e) => !e.closest('.shape-layer') && e.textContent.trim());
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
