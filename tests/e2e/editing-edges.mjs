import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeBlockHtml } from '../../src/js/codeblock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shapes = '<div class="shape-layer" contenteditable="false"><div class="shape square" data-kind="square" style="left:400px;top:1200px;width:118px;height:118px;background:#e8cdbd"><div class="shape-text" contenteditable="false">Shape text</div><span class="shape-h"></span></div></div>';
const fixture = [
  '<div class="shape-layer" contenteditable="false"></div><div class="shape-layer" contenteditable="false"></div><div><span>First prose line</span><div><div class="c-red"><div><p><br></p></div><hr class="blk-hr"><p><br></p><p>Text after the blank</p>' + codeBlockHtml('first\nsecond') + '</div></div></div>',
  shapes + '<div><span>First prose</span></div><div><hr class="blk-hr"><p><br></p><p>Text below gap</p>' + codeBlockHtml('first\nsecond') + '</div>',
];
export async function runEdgeChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-edges-'));
  const sources = process.env.NEBULA_EDGE_NOTES ? JSON.parse(process.env.NEBULA_EDGE_NOTES) : [];
  const originals = sources.map(p => fs.readFileSync(p, 'utf8'));
  const html = originals.length ? originals.map(s => JSON.parse(s).content) : fixture;
  fs.mkdirSync(path.join(profile, 'storage/notes'), { recursive: true });
  html.forEach((content, i) => fs.writeFileSync(path.join(profile, 'storage/notes', `edge-${i}.json`),
    JSON.stringify({ id: `edge-${i}`, title: `Edges ${i + 1}`, content, createdAt: Date.now(), updatedAt: Date.now() })));
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow(); win.setDefaultTimeout(10000);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
    await win.waitForFunction(() => document.querySelector('.note-row.active'), null, { polling: 50 });
    // The card opens only once the version IPC answers, after the note list is
    // drawn; under a loaded full smoke run that lands after an early close.
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const open = async i => { await win.locator('.note-row').filter({ hasText: `Edges ${i}` }).click(); };
    const caret = () => win.evaluate(() => {
      const s = getSelection(), r = s.getRangeAt(0), rect = r.getBoundingClientRect();
      return { x: rect.x, y: rect.y, h: rect.height, offset: s.anchorOffset,
        node: s.anchorNode.nodeName, parent: s.anchorNode.parentElement?.className, collapsed: s.isCollapsed };
    });
    for (const i of [1, 2]) {
      await open(i);
      await win.evaluate(() => {
        const ed = document.getElementById('editor'); ed.focus();
        const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, {
          acceptNode: n => n.textContent.trim() && !n.parentElement.closest('.shape-layer,.blk-code') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
        });
        const r = document.createRange(); r.setStart(walker.nextNode(), 0); r.collapse(true);
        getSelection().removeAllRanges(); getSelection().addRange(r);
      });
      const before = await caret();
      await win.keyboard.press('Backspace'); await win.keyboard.press('Backspace');
      const after = await caret();
      check(`note ${i}: Backspace at the first text keeps the caret on that line`,
        after.h > 0 && Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2 && after.collapsed, JSON.stringify({ before, after }));
      await win.evaluate(() => {
        const ed = document.getElementById('editor'), hr = ed.querySelector('hr');
        const p = hr.nextElementSibling.nextElementSibling;
        ed.focus(); const r = document.createRange(); r.setStart(p.firstChild, 0); r.collapse(true);
        getSelection().removeAllRanges(); getSelection().addRange(r);
      });
      await win.keyboard.press('Backspace');
      const state = await win.evaluate(() => {
        const hr = document.querySelector('#editor hr'), next = hr?.nextElementSibling;
        return { hr: !!hr, armed: hr?.classList.contains('armed'), nextText: next?.textContent,
          caretText: getSelection().anchorNode.textContent, html: next?.outerHTML };
      });
      check(`note ${i}: Backspace from text consumes the preceding blank without selecting the divider`,
        state.hr && !state.armed && !!state.nextText?.trim(), JSON.stringify(state));
      await win.keyboard.press('Backspace');
      check(`note ${i}: only the next press arms the divider`, await win.locator('#editor hr.armed').count() === 1);
    }
    await open(1);
    const hint = win.locator('#editor .code-hint').first();
    check('a code block with existing code has no editing hint', !await hint.isVisible());
    const code = win.locator('#editor .code-src').first();
    await code.click();
    await win.keyboard.type('x');
    await win.waitForTimeout(350);
    check('typing keeps the code hint hidden', !await hint.isVisible());
    await win.screenshot({ path: path.join(profile, 'code.png') });
    if (sources.length) check('current original reports remain byte-identical',
      sources.every((p, i) => fs.readFileSync(p, 'utf8') === originals[i]));
    console.log(`  Edge screenshots: ${profile}`);
  } finally { try { await app?.close(); } catch { /* closed */ } }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runEdgeChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name} ${detail}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}

