import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeBlockHtml } from '../../src/js/codeblock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Same DOM structures as the reports, without committing private note text.
const fixtures = [
  'Upper line<br><div class="shape-layer shape-layer--behind" contenteditable="false"></div><div class="shape-layer" contenteditable="false"></div><span class="u-single"></span><div><span>Lower line</span></div><div><br></div><p class="h-blue">Highlighted paragraph</p><span class="u-single"><span class="h-blue"><span class="c-red">Underlined coloured words</span></span></span><p>Following paragraph</p><div class="c-red"><div><p><br></p></div><hr class="blk-hr"><p><br></p><p>After divider</p><div class="blk-code" data-lang="javascript" data-code="one%0Atwo" contenteditable="false"></div></div>',
  '<div class="shape-layer" contenteditable="false"><div class="shape square" data-kind="square" style="left:350px;top:1200px;width:118px;height:118px;background:#e8cdbd"><div class="shape-text" contenteditable="false">Shape words</div><span class="shape-h"></span></div></div><div><span>First line</span></div><div><hr class="blk-hr"><p><br></p><p>After divider</p><div class="blk-code" data-lang="javascript" data-code="one%0Atwo" contenteditable="false"></div></div>',
];

export async function runReportedChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-reported-'));
  const sourcePaths = process.env.NEBULA_REPORT_NOTES ? JSON.parse(process.env.NEBULA_REPORT_NOTES) : [];
  const originals = sourcePaths.map(p => fs.readFileSync(p, 'utf8'));
  const contents = originals.length ? originals.map(s => JSON.parse(s).content)
    : fixtures.map(html => html.replace(/<div class="blk-code"[^>]*><\/div>/g, codeBlockHtml('one\ntwo')));
  fs.mkdirSync(path.join(profile, 'storage/notes'), { recursive: true });
  contents.forEach((content, i) => fs.writeFileSync(path.join(profile, 'storage/notes', `report-${i}.json`),
    JSON.stringify({ id: `report-${i}`, title: `Report ${i + 1}`, content, createdAt: Date.now(), updatedAt: Date.now() })));
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10000);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
    await win.waitForFunction(() => document.querySelector('.note-row.active'), null, { polling: 50 });
    // The card opens only once the version IPC answers, after the note list is
    // drawn; under a loaded full smoke run that lands after an early close.
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const open = async i => {
      await win.locator('.note-row').filter({ hasText: `Report ${i}` }).click();
      await win.waitForFunction(title => document.querySelector('#title').value === title, `Report ${i}`, { polling: 50 });
    };
    await open(1);
    const join = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      // The report's second prose block is the first non-layer DIV.
      const second = [...ed.children].find(el => el.tagName === 'DIV' && !el.classList.contains('shape-layer'));
      const walker = document.createTreeWalker(second, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      ed.focus();
      const r = document.createRange(); r.setStart(text, 0); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      const first = [...ed.childNodes].find(n => !n.classList?.contains('shape-layer') && n.textContent.trim());
      return { lower: second.textContent, upper: first.textContent, layers: ed.querySelectorAll('.shape-layer').length };
    });
    await win.keyboard.press('Backspace');
    check('reported upper and lower prose join across old overlay layers', await win.evaluate(({ lower, upper }) => {
      const ed = document.getElementById('editor');
      return [...ed.childNodes].some(n => n.textContent.includes(upper) && n.textContent.includes(lower));
    }, join));
    check('joining prose preserves every shape layer', await win.locator('#editor .shape-layer').count() === join.layers);
    await win.keyboard.press('Control+z');

    const marked = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const textEl = ed.querySelector('.u-single .c-red, .c-red .u-single, .c-red.u-single');
      const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
      const range = document.createRange(); range.setStart(walker.nextNode(), 0); range.collapse(true);
      const rect = range.getBoundingClientRect();
      const p = textEl.closest('p,div');
      const ink = getComputedStyle(textEl).color;
      const underline = textEl.closest('.u-single');
      return { x: rect.x, y: rect.y + rect.height / 2, ink, lineInk: getComputedStyle(underline).textDecorationColor,
        paragraph: p !== ed, caret: getComputedStyle(textEl).caretColor };
    });
    check('legacy underlined text has its own real paragraph', marked.paragraph);
    check('underline colour follows its coloured text', marked.ink === marked.lineInk, JSON.stringify(marked));
    await win.mouse.click(marked.x + 1, marked.y);
    check('clicking the highlighted underline start puts a caret before its text', await win.evaluate(() => {
      const text = document.querySelector('#editor .u-single .c-red, #editor .c-red .u-single, #editor .c-red.u-single');
      const sel = getSelection();
      if (!text || !sel.rangeCount || !text.contains(sel.anchorNode)) return false;
      const prefix = document.createRange(); prefix.selectNodeContents(text); prefix.setEnd(sel.anchorNode, sel.anchorOffset);
      return prefix.toString().length === 0 && document.activeElement.id === 'editor';
    }));
    await win.keyboard.type('Prefix ');
    check('typing at the reported underline start inserts visible text there', await win.evaluate(() =>
      document.querySelector('#editor .c-red .u-single')?.textContent.startsWith('Prefix ')));
    await win.keyboard.press('Control+z');
    await win.evaluate(() => {
      const text = document.querySelector('#editor .c-red .u-single');
      const range = document.createRange(); range.selectNodeContents(text);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      document.querySelector('[data-ustyle="none"]').click();
    });
    check('None removes underline from the reported coloured text', await win.evaluate(() =>
      !document.querySelector('#editor .c-red .u-single, #editor .u-single .c-red')));
    await win.keyboard.press('Control+z');
    check('undo restores that underline without losing its text colour', await win.evaluate(() =>
      !!document.querySelector('#editor .c-red .u-single')));
    const blue = await win.evaluate(() => {
      const p = document.querySelector('#editor p.h-blue');
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const range = document.createRange(); range.setStart(walker.nextNode(), 0); range.collapse(true);
      const box = range.getBoundingClientRect();
      return { x: box.x + 1, y: box.y + box.height / 2, text: p.textContent };
    });
    await win.mouse.click(blue.x, blue.y);
    await win.keyboard.type('Prefix ');
    check('the other highlighted paragraph also accepts typing at its start',
      await win.locator('#editor p.h-blue').textContent() === 'Prefix ' + blue.text);
    await win.keyboard.press('Control+z');
    await win.screenshot({ path: path.join(profile, 'report-1.png') });

    await open(2);
    const blank = await win.evaluate(() => {
      const ed = document.getElementById('editor'), hr = ed.querySelector('hr');
      const blank = hr.nextElementSibling;
      blank.dataset.reportBlank = 'true';
      ed.focus(); const r = document.createRange(); r.setStart(blank, 0); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      return ed.querySelectorAll('hr').length;
    });
    await win.keyboard.press('Backspace');
    check('blank line below a nested divider disappears before the divider', await win.evaluate(count =>
      !document.querySelector('[data-report-blank]') && document.querySelectorAll('#editor hr').length === count, blank));
    await win.keyboard.press('Backspace');
    check('next Backspace selects the nested divider without deleting it', await win.locator('#editor hr.armed').count() === 1);
    await win.keyboard.press('Backspace');
    check('only the following Backspace removes the selected divider', await win.locator('#editor hr').count() === blank - 1);

    const spacing = await win.evaluate(() => {
      const select = document.querySelector('#editor .code-lang'), box = select.closest('.blk-code');
      return { padding: parseFloat(getComputedStyle(select).paddingLeft),
        left: select.getBoundingClientRect().left - box.getBoundingClientRect().left };
    });
    check('code language box sits left with breathing room inside', spacing.padding >= 8 && spacing.left <= 10, JSON.stringify(spacing));

    const shape = win.locator('#editor .shape').first();
    await shape.scrollIntoViewIfNeeded();
    await shape.dblclick();
    const old = await shape.locator('.shape-text').textContent();
    await win.keyboard.press('End');
    await win.keyboard.press('Backspace');
    check('Backspace deletes text inside a shape without deleting the shape',
      await shape.locator('.shape-text').textContent() === old.slice(0, -1), JSON.stringify({ old, now: await shape.locator('.shape-text').textContent() }));
    await win.keyboard.press('Control+z');
    check('undo restores the shape text', await shape.locator('.shape-text').textContent() === old);

    await win.keyboard.press('Escape');
    const bottom = win.locator('#editor .shape.square').first();
    await bottom.evaluate(el => { const ed = el.closest('#editor'); ed.scrollTop = ed.scrollHeight; });
    const before = await bottom.boundingBox();
    await win.mouse.move(before.x + 8, before.y + 8); await win.mouse.down();
    await win.mouse.move(before.x + 28, before.y - 32, { steps: 8 }); await win.mouse.up();
    const after = await bottom.boundingBox();
    check('the lowest reported shape follows an upward drag', Math.abs(after.y - before.y + 40) < 3, JSON.stringify({ before, after }));
    await win.screenshot({ path: path.join(profile, 'report-2.png') });
    if (sourcePaths.length) check('both original report files remain byte-identical',
      sourcePaths.every((p, i) => fs.readFileSync(p, 'utf8') === originals[i]));
    console.log(`  Report screenshots: ${profile}`);
  } finally { try { await app?.close(); } catch { /* closed */ } }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runReportedChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name} ${detail}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
