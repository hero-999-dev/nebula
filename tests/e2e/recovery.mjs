import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function runRecoveryChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-recovery-'));
  let app;
  let win;
  const start = async () => {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    win.on('pageerror', error => console.error('renderer error:', error.message));
    await app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showMessageBox = async () => ({ response: 0 });
      BrowserWindow.getAllWindows()[0].setTitle('Nebula automated test - temporary notes');
    });
    await win.waitForFunction(() => document.querySelector('.note-row.active'), null, { polling: 50, timeout: 20_000 });
    // A fresh vault's guide opens in Only view (0.8.9); unlock it with the badge.
    await win.evaluate(() => { const chip = document.getElementById('readonly-chip'); if (chip && !chip.hidden) chip.click(); });
    await win.waitForFunction(() => document.querySelector('#editor')?.isContentEditable, null, { polling: 50, timeout: 20_000 });
    // The card opens only once the version IPC answers, after the note list is
    // drawn; under a loaded full smoke run that lands after an early close.
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
  };
  const press = selector => win.evaluate(sel => document.querySelector(sel).click(), selector);
  const saved = async () => {
    try { await win.waitForFunction(() => document.querySelector('#savestate').textContent === 'Saved', null, { polling: 50, timeout: 10_000 }); }
    catch (error) {
      console.error(await win.evaluate(() => ({ state: document.querySelector('#savestate').textContent, banner: document.querySelector('#demo-banner').textContent })));
      throw error;
    }
  };
  const notes = () => fs.readdirSync(path.join(profile, 'storage/notes')).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(profile, 'storage/notes', f), 'utf8')));
  try {
    await start();
    await press('#btn-new');
    await win.evaluate(() => {
      const title = document.getElementById('title');
      title.value = 'Pending archived title'; title.dispatchEvent(new Event('input'));
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>Pending archived body</p>'; ed.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.note-item.active .nr-more')?.click();
      // The active class is on the note row in older builds.
      if (document.getElementById('note-menu').hidden) document.querySelector('.note-row.active')?.parentElement.querySelector('.nr-more').click();
      document.querySelector('[data-note-act="archive"]').click();
    });
    await saved();
    const archived = notes().find(n => n.archivedAt);
    check('archiving before autosave keeps the original title and body',
      archived?.title === 'Pending archived title' && archived?.content.includes('Pending archived body'));
    check('the next note does not receive the archived note buffer',
      notes().filter(n => !n.archivedAt).every(n => !n.content.includes('Pending archived body')));

    await press('#btn-new');
    await win.evaluate(() => {
      const ed = document.getElementById('editor'); ed.focus();
      ed.innerHTML = '<p><span class="c-red">same</span></p><p><span class="c-red">same</span></p>';
      const range = document.createRange(); range.selectNodeContents(ed.lastChild.firstChild);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      document.querySelector('#menu-color [data-color-class="c-blue"]').click();
    });
    check('recoloring repeated text changes only the selected occurrence in Chromium', await win.evaluate(() => {
      const ed = document.getElementById('editor');
      return ed.firstChild.querySelector('.c-red')?.textContent === 'same'
        && ed.lastChild.querySelector('.c-blue')?.textContent === 'same' && getSelection().toString() === 'same';
    }));

    for (const side of ['left', 'right', 'bottom', 'top']) {
      await press(`[data-pad="${side}"]`);
      await win.evaluate(() => document.querySelector('[data-menu="menu-color"]').scrollIntoView({ block: 'nearest' }));
      await press('[data-menu="menu-color"]');
      const hit = await win.evaluate(() => {
        const menu = document.getElementById('menu-color');
        const button = menu.querySelector('[data-color-class="c-blue"]');
        const r = button.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !menu.hidden && button.contains(top) && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      });
      check(`color menu can be clicked with the toolbar docked ${side}`, hit);
      await win.keyboard.press('Escape');
    }

    // Force a real filesystem error only inside this throwaway profile.
    await press('[data-act="save"]');
    await saved();
    const folder = path.join(profile, 'storage/notes');
    const parked = path.join(profile, 'storage/notes-parked');
    fs.renameSync(folder, parked);
    fs.writeFileSync(folder, 'test obstruction');
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>Retry this body</p>'; ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await win.waitForFunction(() => document.getElementById('savestate').textContent === 'Not saved', null, { polling: 50, timeout: 10_000 });
    check('disk failure displays Not saved and offers a retry', await win.evaluate(() =>
      !document.getElementById('demo-banner').hidden && document.getElementById('demo-banner').textContent.includes('Retry saving')));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
    await win.evaluate(() => { void window.nebula.window.close(); });
    await win.waitForTimeout(500);
    check('native close keeps the window open when disk save fails', !win.isClosed());
    fs.unlinkSync(folder);
    fs.renameSync(parked, folder);
    await press('#demo-banner button');
    await saved();
    check('retry saves the exact failed body and clears the error',
      notes().some(n => n.content === '<p>Retry this body</p>')
      && await win.evaluate(() => document.getElementById('demo-banner').hidden));

    // The lowest shape defines the scrollable extent. Moving it upwards must
    // not move the paper under the pointer while the mouse is still down.
    await win.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>top</p><div class="shape-layer" contenteditable="false"><div class="shape rect" data-kind="rect" style="left:100px;top:1200px;width:150px;height:90px;background:#e8cdbd"><div class="shape-text" contenteditable="false"><br></div><span class="shape-h"></span></div></div>';
      ed.scrollTop = ed.scrollHeight;
    });
    const edgeShape = win.locator('#editor .shape');
    const edgeBefore = await edgeShape.boundingBox();
    const edgeScroll = await win.evaluate(() => document.getElementById('editor').scrollTop);
    await win.mouse.move(edgeBefore.x + 75, edgeBefore.y + 45);
    await win.mouse.down();
    await win.mouse.move(edgeBefore.x + 85, edgeBefore.y - 15, { steps: 6 });
    const edgeDuring = await edgeShape.boundingBox();
    const edgeScrollDuring = await win.evaluate(() => document.getElementById('editor').scrollTop);
    await win.mouse.up();
    check('dragging the lowest shape keeps the paper still until release',
      Math.abs(edgeScrollDuring - edgeScroll) < 2 && Math.abs(edgeDuring.y - edgeBefore.y + 60) < 2,
      JSON.stringify({ edgeScroll, edgeScrollDuring, beforeY: edgeBefore.y, duringY: edgeDuring.y }));
    await press('[data-shape="del"]');
    check('deleting the last shape releases its reserved canvas space', await win.evaluate(() =>
      !document.querySelector('#editor .shape') && !document.querySelector('#editor .shape-layer')?.style.minHeight));

    // Read the user's reported note only if supplied; never write its vault or
    // put its contents into a committed fixture.
    if (process.env.NEBULA_REPRO_NOTE) {
      const original = fs.readFileSync(process.env.NEBULA_REPRO_NOTE, 'utf8');
      const note = JSON.parse(original);
      await win.evaluate(html => {
        const ed = document.getElementById('editor'); ed.innerHTML = html;
        ed.dispatchEvent(new Event('input', { bubbles: true }));
      }, note.content);
      await press('[data-act="save"]'); await saved();
      await press('#btn-new');
      await win.evaluate(() => document.querySelectorAll('.note-row')[1].click());
      const shape = win.locator('#editor .shape').last();
      const before = await shape.evaluate(el => {
        const ed = document.getElementById('editor');
        ed.scrollTop = ed.scrollHeight;
        return { top: parseFloat(el.style.top), left: parseFloat(el.style.left), scroll: ed.scrollTop };
      });
      const box = await shape.boundingBox();
      await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await win.mouse.down();
      await win.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 - 40, { steps: 8 });
      await win.mouse.up();
      const after = await shape.evaluate(el => ({ top: parseFloat(el.style.top), left: parseFloat(el.style.left), scroll: document.getElementById('editor').scrollTop }));
      check('reported note shape follows the pointer at the bottom of the page',
        Math.abs(after.left - before.left - 40) < 3 && Math.abs(after.top - before.top + 40) < 3,
        JSON.stringify({ before, box, after }));
      check('the reported note source stays byte-identical', fs.readFileSync(process.env.NEBULA_REPRO_NOTE, 'utf8') === original);
      await win.screenshot({ path: path.join(profile, 'reported-note.png') });
      console.log(`  reported-note screenshot: ${path.join(profile, 'reported-note.png')}`);
    }

    // Both debounces are pending when the native close button is invoked.
    const closed = app.waitForEvent('close', { timeout: 20_000 });
    await win.evaluate(() => {
      const title = document.getElementById('title');
      title.value = 'Immediate close title'; title.dispatchEvent(new Event('input'));
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p>Immediate close body</p>'; ed.dispatchEvent(new Event('input', { bubbles: true }));
      void window.nebula.window.close();
    });
    await closed;
    check('immediate native close flushes both title and body to disk',
      notes().some(n => n.title === 'Immediate close title' && n.content === '<p>Immediate close body</p>'));
    await start();
    const reopened = await win.evaluate(() => ({ title: document.getElementById('title').value, body: document.getElementById('editor').textContent }));
    check('the flushed title and body survive restart', reopened.title === 'Immediate close title'
      && reopened.body === 'Immediate close body', JSON.stringify(reopened));
  } finally {
    const parked = path.join(profile, 'storage/notes-parked');
    const folder = path.join(profile, 'storage/notes');
    if (fs.existsSync(parked)) {
      if (fs.existsSync(folder) && fs.statSync(folder).isFile()) fs.unlinkSync(folder);
      fs.renameSync(parked, folder);
    }
    try { await app?.close(); } catch { /* already closed */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runRecoveryChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name} ${detail}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
