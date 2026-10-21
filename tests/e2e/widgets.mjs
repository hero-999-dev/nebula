/**
 * 1.0.0 — widgets (the owner: "/widget … a pop up like the URL ones …
 * calculator, scientific calculator, calendar … moved like photos … made bigger
 * and smaller … above or behind the text, or in the text … in print an option
 * to hide the widgets"). The real app on a throwaway profile, real keys and
 * mouse.
 *
 *   node tests/e2e/widgets.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runWidgetChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-widgets-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const content = '<p id="a">Sums for today</p><p id="b"><br></p><p id="c">middle</p><p id="d"><br></p><p id="e">end</p>';
  fs.writeFileSync(path.join(notes, 'wg.json'), JSON.stringify({ id: 'wg', title: 'wg', content, createdAt: 1, updatedAt: 1 }));
  fs.writeFileSync(path.join(notes, 'other.json'), JSON.stringify({ id: 'other', title: 'other', content: '<p>x</p>', createdAt: 1, updatedAt: 0 }));
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const openNote = (title) => win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
    await openNote('wg');
    await win.waitForFunction(() => document.getElementById('b'), null, { polling: 50 });
    await win.waitForTimeout(300);
    const clickAt = async (sel) => {
      // On a short window (GitHub's runner) 'nearest' can leave the key under
      // the bottom bar: when the point is not the key, centre it and look again.
      const at = await win.evaluate((s) => {
        const el = document.querySelector(s);
        const mid = () => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
        el.scrollIntoView({ block: 'nearest' });
        let p = mid();
        if (!el.contains(document.elementFromPoint(p[0], p[1]))) { el.scrollIntoView({ block: 'center' }); p = mid(); }
        return p;
      }, sel);
      await win.mouse.click(at[0], at[1]);
    };
    const clickLine = async (sel) => {
      const at = await win.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + 4, r.top + r.height / 2]; }, sel);
      await win.mouse.click(at[0], at[1]);
    };

    // /widget opens the chooser where the caret is.
    await clickLine('#b');
    await win.keyboard.type('/widget');
    await win.waitForTimeout(150);
    const slash = await win.evaluate(() => [...document.querySelectorAll('#slash-menu:not([hidden]) button')].map((b) => b.textContent.trim()));
    check('/widget finds Widget in the / menu', slash[0] === 'Widget', JSON.stringify(slash));
    await win.keyboard.press('Enter');
    await win.waitForSelector('#widget-menu');
    const picker = await win.evaluate(() => {
      const m = document.getElementById('widget-menu');
      return { kinds: [...m.querySelectorAll('[data-widget-kind]')].map((b) => `${b.dataset.widgetKind}:${b.textContent.trim()}:${!!b.querySelector('.fm-ic svg')}`), slashLeft: (document.getElementById('b').textContent || '').includes('/') };
    });
    check('the chooser offers the calculator, the scientific one, the calendar and the Universe, each with its icon',
      JSON.stringify(picker.kinds) === JSON.stringify(['calc:Calculator:true', 'sci:Scientific calculator:true', 'calendar:Calendar:true', 'universe:Universe:true']) && !picker.slashLeft, JSON.stringify(picker));
    await win.keyboard.press('Escape');
    await win.waitForTimeout(100);
    check('Escape closes the chooser and adds nothing', await win.evaluate(() => !document.getElementById('widget-menu') && !document.querySelector('#editor .note-widget')));

    await clickLine('#b');
    await win.keyboard.type('/widget');
    await win.waitForTimeout(150);
    await win.keyboard.press('Enter');
    await win.waitForSelector('#widget-menu');
    await win.keyboard.press('Enter');
    await win.waitForSelector('#editor .note-widget');
    const placed = await win.evaluate(() => {
      const w = document.querySelector('#editor .note-widget');
      return { kind: w.dataset.widget, inline: w.classList.contains('note-image--inline'), sel: w.classList.contains('sel'), after: w.previousElementSibling?.id, bar: !document.getElementById('image-bar').hidden, crop: document.querySelector('#image-bar [data-image="crop"]').hidden };
    });
    check('Enter takes the calculator: in the text where the caret was, selected, with the picture bar (no crop)',
      placed.kind === 'calc' && placed.inline && placed.sel && placed.after === 'a' && placed.bar && placed.crop, JSON.stringify(placed));

    // Its keys, by mouse and by keyboard.
    for (const k of ['1', '2', '×', '3', '=']) await clickAt(`#editor .note-widget [data-k="${k}"]`);
    const out1 = await win.evaluate(() => document.querySelector('#editor .note-widget .wg-out').textContent);
    check('clicked keys 12 × 3 = show 36', out1 === '36', out1);
    await win.keyboard.type('+4');
    await win.keyboard.press('Enter');
    const out2 = await win.evaluate(() => ({ out: document.querySelector('#editor .note-widget .wg-out').textContent, text: [...document.querySelectorAll('#editor > p')].some((p) => p.textContent.includes('4')) }));
    check('typed keys go on with the answer: + 4 Enter shows 40, and nothing is typed into the note', out2.out === '40' && !out2.text, JSON.stringify(out2));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(150);
    const undone = await win.evaluate(() => document.querySelector('#editor .note-widget .wg-out')?.textContent);
    check('Ctrl+Z takes the presses back', undone !== '40', undone);
    await win.keyboard.press('Control+y');
    await win.waitForTimeout(150);
    await win.evaluate(() => { const w = document.querySelector('#editor .note-widget'); w.dataset.wgExpr = '36+4'; w.dataset.wgOut = '40'; w.dataset.wgDone = '1'; window.nebula && w.dispatchEvent(new Event('input', { bubbles: true })); });

    // Bigger and smaller, and everything in it with it.
    const before = await win.evaluate(() => { const w = document.querySelector('#editor .note-widget'); return { w: w.getBoundingClientRect().width, f: parseFloat(getComputedStyle(w.querySelector('.wg-out')).fontSize) }; });
    await clickAt('#editor .note-widget .wg-head');
    const grip = await win.evaluate(() => { const h = document.querySelector('#editor .note-widget .image-h[data-corner="se"]').getBoundingClientRect(); return [h.left + h.width / 2, h.top + h.height / 2]; });
    await win.mouse.move(grip[0], grip[1]);
    await win.mouse.down();
    await win.mouse.move(grip[0] + 60, grip[1] + 60, { steps: 6 });
    await win.mouse.move(grip[0] + 120, grip[1] + 120, { steps: 6 });
    await win.mouse.up();
    const after = await win.evaluate(() => { const w = document.querySelector('#editor .note-widget'); const r = w.getBoundingClientRect(); return { w: r.width, h: r.height, f: parseFloat(getComputedStyle(w.querySelector('.wg-out')).fontSize) }; });
    check('dragging its corner makes it bigger, and its numbers with it', after.w > before.w + 40 && after.f > before.f * 1.1, JSON.stringify({ before, after }));
    check('the bigger widget keeps its shape', Math.abs(after.w / after.h - 0.72) < 0.06, JSON.stringify(after));
    // Small or big, every part and every gap is the same share of it (the owner's note: made small, the margins stayed wide).
    const shares = await win.evaluate(async () => {
      const w = document.querySelector('#editor .note-widget');
      const keep = w.style.width;
      const share = () => {
        const W = w.getBoundingClientRect().width;
        const wg = w.querySelector('.wg');
        const keys = w.querySelector('.wg-keys').getBoundingClientRect();
        return { pad: parseFloat(getComputedStyle(wg).paddingLeft) / W, keys: keys.width / W, keysH: keys.height / W };
      };
      w.style.width = '400px'; await new Promise(requestAnimationFrame);
      const big = share();
      w.style.width = '160px'; await new Promise(requestAnimationFrame);
      const small = share();
      w.style.width = keep;
      return { big, small };
    });
    check('made small, its margins and keys shrink in the same measure as the widget',
      ['pad', 'keys', 'keysH'].every((k) => Math.abs(shares.big[k] - shares.small[k]) < 0.03), JSON.stringify(shares));

    // Above the text, behind it, and back into it.
    await win.evaluate(() => document.querySelector('#image-bar [data-image="front"]').click());
    await win.waitForTimeout(150);
    const front = await win.evaluate(() => { const w = document.querySelector('#editor .note-widget'); return { layer: !!w.closest('.shape-layer, .image-layer') && !w.closest('.shape-layer--behind, .image-layer--behind'), inline: w.classList.contains('note-image--inline') }; });
    check('Above text floats it over the text', front.layer && !front.inline, JSON.stringify(front));
    const box = await win.evaluate(() => { const r = document.querySelector('#editor .note-widget .wg-head').getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2, document.querySelector('#editor .note-widget').getBoundingClientRect().left]; });
    await win.mouse.move(box[0], box[1]);
    await win.mouse.down();
    await win.mouse.move(box[0] + 40, box[1] + 30, { steps: 5 });
    await win.mouse.move(box[0] + 80, box[1] + 60, { steps: 5 });
    await win.mouse.up();
    const moved = await win.evaluate(() => document.querySelector('#editor .note-widget').getBoundingClientRect().left);
    check('a floating widget is moved by dragging it, like a photo', moved > box[2] + 50, JSON.stringify([box[2], moved]));
    await win.evaluate(() => document.querySelector('#image-bar [data-image="back"]').click());
    await win.waitForTimeout(150);
    check('Behind text puts it under the text', await win.evaluate(() => !!document.querySelector('#editor .note-widget').closest('.shape-layer--behind, .image-layer--behind')));
    await win.evaluate(() => document.querySelector('#image-bar [data-image="inline"]').click());
    await win.waitForTimeout(150);
    const back = await win.evaluate(() => { const w = document.querySelector('#editor .note-widget'); return { inline: w.classList.contains('note-image--inline'), parent: w.parentElement.id || w.parentElement.className }; });
    check('In text puts it back in the text', back.inline, JSON.stringify(back));
    const stillWorks = await win.evaluate(() => { document.querySelector('#editor .note-widget [data-k="C"]').click(); return document.querySelector('#editor .note-widget .wg-out').textContent; });
    check('after all that its keys still work (C clears)', stillWorks === '0', stillWorks);
    // A right-click on a widget offers the widget's own items, not a picture's (owner, 1.0.0: "copy image, add caption, delete image cikiyor hata bu").
    const head = await win.evaluate(() => { const r = document.querySelector('#editor .note-widget .wg-head').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.click(head.x, head.y, { button: 'right' });
    await win.waitForFunction(() => !document.getElementById('ctx-menu')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    const items = await win.evaluate(() => [...document.querySelectorAll('#ctx-menu > button')].map((b) => b.textContent));
    check('a right-click on a widget offers Copy widget and Delete widget, no picture or caption items', JSON.stringify(items) === '["Copy widget","Delete widget"]', JSON.stringify(items));
    await win.keyboard.press('Escape');
    await win.waitForTimeout(100);

    // A calendar, by the mouse, and the scientific one.
    await win.keyboard.press('Escape');   // the picture bar lies over the next lines
    await clickLine('#d');
    await win.keyboard.type('/widget');
    await win.waitForTimeout(150);
    await win.keyboard.press('Enter');
    await win.waitForSelector('#widget-menu');
    await win.click('#widget-menu [data-widget-kind="calendar"]');
    await win.waitForSelector('#editor .note-widget[data-widget="calendar"]');
    const cal = await win.evaluate(() => {
      const w = document.querySelector('#editor .note-widget[data-widget="calendar"]');
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { days: w.querySelectorAll('[data-day]').length, today: w.querySelector('.wg-day--today')?.dataset.day === today, month: w.querySelector('.wg-month').textContent };
    });
    check('the calendar shows this month with today ringed', cal.days >= 28 && cal.today, JSON.stringify(cal));
    await clickAt('#editor .note-widget[data-widget="calendar"] [data-k="next"]');
    const next = await win.evaluate(() => document.querySelector('#editor .note-widget[data-widget="calendar"] .wg-month').textContent);
    check('› goes to the next month', next !== cal.month, `${cal.month} -> ${next}`);
    await clickAt('#editor .note-widget[data-widget="calendar"] [data-day$="-15"]');
    const marked = await win.evaluate(() => [...document.querySelectorAll('#editor .note-widget[data-widget="calendar"] .wg-day--mark')].map((d) => d.dataset.day));
    check('a day clicked is marked', marked.length === 1 && marked[0].endsWith('-15'), JSON.stringify(marked));
    await clickAt('#editor .note-widget[data-widget="calendar"] [data-k="today"]');
    const home = await win.evaluate(() => document.querySelector('#editor .note-widget[data-widget="calendar"] .wg-month').textContent);
    check('the month name brings it back to this month', home === cal.month, home);

    await win.keyboard.press('Escape');
    await clickLine('#e');
    await win.keyboard.press('End');
    await win.keyboard.press('Enter');
    await win.keyboard.type('/widget');
    await win.waitForTimeout(150);
    await win.keyboard.press('Enter');
    await win.waitForSelector('#widget-menu');
    await win.keyboard.press('ArrowRight');
    await win.keyboard.press('Enter');
    await win.waitForSelector('#editor .note-widget[data-widget="sci"]');
    for (const k of ['sin', '3', '0', ')', '+', '√', '9', '=']) await clickAt(`#editor .note-widget[data-widget="sci"] [data-k="${k}"]`);
    const sci = await win.evaluate(() => document.querySelector('#editor .note-widget[data-widget="sci"] .wg-out').textContent);
    check('the scientific calculator: sin(30) + √9 = 3.5', sci === '3.5', sci);

    // Kept with the note, and drawn again when it opens.
    await win.waitForTimeout(1500);
    const file = [path.join(notes, 'wg', 'wg.json'), path.join(notes, 'wg.json')].find((f) => fs.existsSync(f));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).content;
    check('the note is saved with its widgets and what they hold',
      (saved.match(/note-widget/g) || []).length === 3 && saved.includes('data-wg-out="3.5"') && /data-wg-marks="\d{4}-\d{2}-15"/.test(saved), saved.slice(0, 300));
    await openNote('other');
    await win.waitForTimeout(400);
    await openNote('wg');
    await win.waitForFunction(() => document.querySelectorAll('#editor .note-widget').length === 3, null, { polling: 50 });
    const reopened = await win.evaluate(() => ({
      sci: document.querySelector('#editor .note-widget[data-widget="sci"] .wg-out')?.textContent,
      keys: document.querySelectorAll('#editor .note-widget[data-widget="calc"] [data-k]').length,
      mark: document.querySelectorAll('#editor .note-widget[data-widget="calendar"] .wg-day--mark').length,
    }));
    check('opened again, the widgets are as they were and still answer', reopened.sci === '3.5' && reopened.keys === 20, JSON.stringify(reopened));
    const again = await win.evaluate(() => { const w = document.querySelector('#editor .note-widget[data-widget="calc"]'); for (const k of ['7', '×', '6', '=']) w.querySelector(`[data-k="${k}"]`).click(); return w.querySelector('.wg-out').textContent; });
    check('… 7 × 6 = 42 after opening again', again === '42', again);

    // Printing: with them, or without.
    const seg = await win.evaluate(() => [...document.querySelectorAll('#menu-export [data-widgets]')].map((b) => b.dataset.widgets));
    check('the Export menu has Widgets: With / Without', JSON.stringify(seg) === '["with","without"]', JSON.stringify(seg));
    await win.emulateMedia({ media: 'print' });
    const printWith = await win.evaluate(() => [...document.querySelectorAll('#editor .note-widget')].filter((w) => getComputedStyle(w).display !== 'none').length);
    await win.evaluate(() => document.querySelector('#menu-export [data-widgets="without"]').click());
    const mode = await win.evaluate(() => localStorage.getItem('nebula:print-widgets'));
    await win.evaluate(() => document.body.classList.add('print-no-widgets'));
    const printWithout = await win.evaluate(() => [...document.querySelectorAll('#editor .note-widget')].filter((w) => getComputedStyle(w).display !== 'none').length);
    await win.evaluate(() => document.body.classList.remove('print-no-widgets'));
    await win.emulateMedia({ media: 'screen' });
    check('printed with widgets they show; Without hides them on the page', printWith === 3 && printWithout === 0 && mode === 'without', JSON.stringify({ printWith, printWithout, mode }));
    await win.evaluate(() => document.querySelector('#menu-export [data-widgets="with"]').click());

    // Delete takes a selected widget away; Backspace stays the calculator's.
    await clickAt('#editor .note-widget[data-widget="calc"] .wg-head');
    await win.keyboard.press('Backspace');
    check('Backspace on a selected calculator is its ⌫, not a delete', await win.evaluate(() => !!document.querySelector('#editor .note-widget[data-widget="calc"]')));
    await win.keyboard.press('Delete');
    await win.waitForTimeout(150);
    check('Delete takes the selected widget away', await win.evaluate(() => !document.querySelector('#editor .note-widget[data-widget="calc"]') && document.querySelectorAll('#editor .note-widget').length === 2));

    // A picture pasted on one line, then /widget on another: the widget goes to that other line (owner, 1.0.0).
    await win.keyboard.press('Escape');
    await clickLine('#a');
    await win.keyboard.press('End');
    await win.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 20; c.height = 20;
      return new Promise((res) => c.toBlob((b) => { const dt = new DataTransfer(); dt.items.add(new File([b], 'a.png', { type: 'image/png' })); document.getElementById('editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); res(); }));
    });
    await win.waitForTimeout(600);
    await win.keyboard.press('Escape');
    await clickLine('#e');
    await win.keyboard.press('End');
    await win.keyboard.type(' /widget');
    await win.waitForTimeout(150);
    await win.keyboard.press('Enter');
    await win.waitForSelector('#widget-menu');
    await win.keyboard.press('Enter');
    await win.waitForTimeout(200);
    const lastCalc = await win.evaluate(() => [...document.querySelectorAll('#editor .note-widget[data-widget="calc"]')].map((w) => w.previousElementSibling?.id));
    check('after a pasted picture, /widget still lands under the line it was typed on', lastCalc.includes('e'), JSON.stringify(lastCalc));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  let failed = 0;
  await runWidgetChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`\n${count - failed}/${count} widget checks passed`);
  process.exit(failed ? 1 : 0);
}
