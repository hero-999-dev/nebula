/**
 * 1.0.0 — every block taken by the mouse, as in Notion (block-handle.js), in
 * the real app on a throwaway profile: the grip at a block's left, a toggle
 * dragged whole, a line dropped beside another (columns) and out of a column
 * (the column goes), a picked block copied and pasted whole, a toggle copied
 * from its title into its body, a divider pulled sideways over another part
 * of the note, and the mark of files dragged over the note.
 *
 *   node tests/e2e/block-handle.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TOGGLE = '<div class="blk-toggle" id="t" data-open="true"><p class="toggle-title" id="tt">Toggle title</p><div class="toggle-body"><p id="tc">inside the toggle</p></div></div>';

export async function runBlockHandleChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-handle-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, content, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`),
    JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1, ...extra }));
  seed('drag', `<p id="a">alpha line</p>${TOGGLE}<p id="b">beta line</p><p id="c">gamma line</p><ul id="l"><li id="i1">item one</li><li id="i2">item two</li></ul><p id="z">last line</p>`);
  seed('copy', `<p id="a">alpha line</p>${TOGGLE}<p id="e"><br></p><p id="z">last line</p>`);
  // The owner's case: text between a divider above and one below; a third divider under them all, pulled sideways onto that text.
  seed('divs', '<p id="s0">top</p><hr class="blk-hr" id="h1"><p id="s1">the words between two dividers</p><p id="s2">more of them</p><hr class="blk-hr" id="h2"><p id="s3">under the second</p><p id="s4">and more</p><hr class="blk-hr" id="h3"><p id="s5">the end</p>');
  seed('twohr', '<p id="u0">top</p><hr class="blk-hr" id="t1"><hr class="blk-hr" id="t2"><p id="u1">one</p><p id="u2">two</p><p id="u3">three</p>');
  seed('files', '<p id="f0">first line</p><p id="f1">second line</p><p id="f2">third line</p>');
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 800));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());

    const open = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
      await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
      await win.waitForTimeout(250);
    };
    const box = (selector) => win.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
    }, selector);
    const grip = () => win.evaluate(() => {
      const g = document.querySelector('.block-grip');
      if (!g || g.hidden) return null;
      const r = g.getBoundingClientRect();
      return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, left: r.left, top: r.top };
    });
    const mark = () => win.evaluate(() => {
      const m = document.querySelector('.drop-mark');
      if (!m || m.hidden) return null;
      const r = m.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, upright: r.height > r.width };
    });
    /** The note's blocks, columns as [left | right]. */
    const struct = () => win.evaluate(() => {
      const name = (e) => {
        if (e.matches('.blk-cols')) return `[${[...e.querySelectorAll(':scope > .blk-col')].map((c) => [...c.children].map(name).join(',')).join(' | ')}]`;
        if (e.matches('.blk-toggle')) return `T(${e.querySelector('.toggle-title')?.textContent ?? ''}:${[...(e.querySelector('.toggle-body')?.children ?? [])].map(name).join(',')})`;
        if (e.matches('ul, ol')) return `${e.tagName.toLowerCase()}(${[...e.children].map(name).join(',')})`;
        return e.id || e.tagName.toLowerCase();
      };
      return [...document.querySelectorAll('#editor > *')].filter((e) => !e.matches('.shape-layer, .image-layer')).map(name).join(',');
    });
    /** The pointer onto a block, then its grip taken and pulled to a point. */
    const hover = async (selector, dx = 40) => {
      const b = await box(selector);
      await win.mouse.move(b.left + dx, b.top + Math.min(10, b.height / 2));
      await win.waitForTimeout(80);
      return grip();
    };
    const pullGrip = async (selector, to, { hold = false } = {}) => {
      const g = await hover(selector);
      if (!g) return false;
      await win.mouse.move(g.x, g.y);
      await win.mouse.down();
      await win.mouse.move(g.x + 6, g.y + 6, { steps: 2 });
      await win.mouse.move(to.x, to.y, { steps: 10 });
      await win.waitForTimeout(80);
      if (!hold) { await win.mouse.up(); await win.waitForTimeout(150); }
      return true;
    };

    // ---- The grip ---------------------------------------------------------------
    await open('drag');
    const start = await struct();
    let g = await hover('#b');
    const b = await box('#b');
    check('the pointer on a line: a grip comes up at its left, on its first line',
      !!g && g.left < b.left && g.left > b.left - 40 && Math.abs(g.y - (b.top + 11)) < 12, JSON.stringify({ g, b }));
    g = await hover('#tc');
    const tc = await box('#tc');
    check('on a line in a toggle: the grip stands at that line, inside the toggle', !!g && g.left < tc.left && g.left > tc.left - 40, JSON.stringify({ g, tc }));
    g = await hover('#i2');
    const list = await box('#l');
    check('on a list item: the grip stands left of the list\'s bullets', !!g && g.left < list.left && g.left > list.left - 40, JSON.stringify({ g, list }));

    // ---- A toggle dragged whole ---------------------------------------------------
    const c = await box('#c');
    await pullGrip('#tt', { x: c.cx, y: c.bottom - 3 }, { hold: true });
    const held = { mark: await mark(), struct: await struct(), ghost: await win.evaluate(() => !!document.querySelector('.block-ghost')) };
    check('a toggle taken by its grip: a flat mark under the line it is over, a faint copy follows, nothing moved yet',
      !!held.mark && !held.mark.upright && held.ghost && held.struct === start, JSON.stringify(held));
    await win.mouse.up();
    await win.waitForTimeout(150);
    let s = await struct();
    check('let go, the toggle stands there with what folds away', s === 'a,b,c,T(Toggle title:tc),ul(i1,i2),z', s);
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);
    check('one Ctrl+Z puts it back', await struct() === start, await struct());

    // Esc gives the drag up.
    await pullGrip('#a', { x: c.cx, y: c.bottom - 3 }, { hold: true });
    await win.keyboard.press('Escape');
    await win.mouse.up();
    await win.waitForTimeout(120);
    check('Esc: no mark, no change', !(await mark()) && await struct() === start, await struct());

    // A line into the toggle: on the title's lower half, first in what folds away.
    const tt = await box('#tt');
    await pullGrip('#z', { x: tt.cx, y: tt.bottom - 3 });
    s = await struct();
    check('a line let go on a toggle\'s title, lower half: first inside the toggle', s === 'a,T(Toggle title:z,tc),b,c,ul(i1,i2)', s);

    // A list item out among lines: a list of its own; and back.
    const a = await box('#a');
    await pullGrip('#i2', { x: a.cx, y: a.bottom - 3 });
    s = await struct();
    check('a list item let go among lines gets a list of its own', s === 'a,ul(i2),T(Toggle title:z,tc),b,c,ul(i1)', s);

    // ---- Beside: no divider of its own (owner, 1.0.0: "birseyleri hareket ettirince otomatik divider ekleniyor onu da kaldiralim") ----
    const cb = await box('#c');
    await pullGrip('#b', { x: cb.right - 10, y: cb.bottom - 4 }, { hold: true });
    const side = await mark();
    check('at the right edge of a line: the mark lies flat, no upright divider', !!side && !side.upright, JSON.stringify(side));
    await win.mouse.up();
    await win.waitForTimeout(150);
    s = await struct();
    check('let go, the line moves next to it and no columns are made', !/\[/.test(s) && /(b,c|c,b)/.test(s), s);
    // Columns the owner made with a divider: a block still goes into them, and out of them.
    await win.evaluate(() => {
      const c = document.getElementById('c'), b = document.getElementById('b');
      const cols = document.createElement('div');
      cols.className = 'blk-cols'; cols.dataset.blockType = 'columns'; cols.dataset.split = '50'; cols.style.setProperty('--split', '50%');
      c.before(cols);
      const l = document.createElement('div'), r = document.createElement('div');
      l.className = r.className = 'blk-col';
      const vr = document.createElement('hr'); vr.className = 'blk-vr';
      cols.append(l, vr, r); l.append(c); r.append(b);
    });
    await win.waitForTimeout(150);
    s = await struct();
    check('(columns made for the next checks)', /\[c \| b\]/.test(s), s);
    // Three dots, narrow: in the right column the grip stays between the divider and the line (owner, 1.0.0).
    await hover('#b');
    const colGrip = await win.evaluate(() => {
      const g = document.querySelector('.block-grip').getBoundingClientRect();
      const vr = document.querySelector('#editor .blk-vr').getBoundingClientRect();
      return { left: g.left, right: g.right, dots: document.querySelectorAll('.block-grip circle').length, divider: vr.left + vr.width, line: document.getElementById('b').getBoundingClientRect().left };
    });
    check('the grip is three dots, and in the right column it stays off the divider', colGrip.dots === 3 && colGrip.left > colGrip.divider && colGrip.right <= colGrip.line, JSON.stringify(colGrip));
    // The only line of a column dragged out: the column goes.
    const a2 = await box('#a');
    await pullGrip('#b', { x: a2.cx, y: a2.top + 3 });
    s = await struct();
    check('the last line of a column dragged out: the column goes, the other is a flow again', s.startsWith('b,a,') && !/\[/.test(s) && s.includes(',c,'), s);

    // ---- A picked block: keys -------------------------------------------------------
    await open('copy');
    g = await hover('#tt');
    await win.mouse.click(g.x, g.y);
    await win.waitForTimeout(120);
    const picked = await win.evaluate(() => document.getElementById('t').classList.contains('block-picked'));
    check('a click on the grip picks the block', picked, String(picked));
    await win.keyboard.press('Control+c');
    await win.waitForTimeout(100);
    const e = await box('#e');
    await win.mouse.click(e.left + 20, e.cy);
    await win.waitForTimeout(100);
    check('a click elsewhere lets it go', !(await win.evaluate(() => document.querySelector('.block-picked'))));
    await win.keyboard.press('Control+v');
    await win.waitForTimeout(250);
    s = await struct();
    check('the picked toggle copied and pasted on an empty line: a whole toggle again, with what folds away', s === 'a,T(Toggle title:tc),T(Toggle title:p),z', s);
    const stored = await win.evaluate(() => document.getElementById('editor').innerHTML);
    check('no id twice, nothing picked left in the note', !/block-picked|block-lifted/.test(stored) && (stored.match(/id="tc"/g) ?? []).length === 1, stored.slice(0, 300));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);

    // Words selected from the title into the body, copied: the toggle again.
    await win.evaluate(() => {
      const r = document.createRange();
      r.setStart(document.getElementById('tt').firstChild, 0);
      r.setEnd(document.getElementById('tc').firstChild, 6);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.press('Control+c');
    const zb = await box('#z');
    await win.mouse.click(zb.right - 2, zb.cy);
    await win.keyboard.press('End');
    await win.keyboard.press('Enter');
    await win.keyboard.press('Control+v');
    await win.waitForTimeout(250);
    s = await struct();
    check('a toggle copied from its title into its body and pasted: a toggle, not two plain lines', /,z,T\(Toggle title:p\)/.test(s), s);

    // Picked, Delete takes it away; Ctrl+D copies it.
    g = await hover('#a');
    await win.mouse.click(g.x, g.y);
    await win.keyboard.press('Control+d');
    await win.waitForTimeout(100);
    s = await struct();
    check('Ctrl+D puts a copy under the picked block', s.startsWith('a,p,T('), s);
    await win.keyboard.press('Delete');
    await win.waitForTimeout(100);
    s = await struct();
    check('Delete takes the picked block away', s.startsWith('a,T('), s);

    // ---- The owner's divider -------------------------------------------------------
    await open('divs');
    const pg = await win.evaluate(() => {
      const ed = document.getElementById('editor');
      const r = ed.getBoundingClientRect();
      const css = getComputedStyle(ed);
      const left = r.left + parseFloat(css.paddingLeft);
      const right = r.left + ed.clientWidth - parseFloat(css.paddingRight);
      return { left, right, cx: (left + right) / 2 };
    });
    const h3 = await box('#h3');
    const s1 = await box('#s1');
    await win.mouse.move(pg.left + 200, h3.cy);
    await win.mouse.down();
    await win.mouse.move(pg.left + 204, h3.cy + 2);
    await win.mouse.move(pg.cx + 4, s1.cy, { steps: 10 });
    await win.waitForTimeout(80);
    await win.mouse.up();
    await win.waitForTimeout(150);
    s = await struct();
    check('a divider pulled sideways onto the words between two other dividers splits those words, not the part it came from',
      s === 's0,h1,[s1,s2 | p],h2,s3,s4,s5', s);

    // The lower of two dividers one under the other, carried down by its own
    // line with the hand drifting aside on the way: it moves, it does not split (1.0.0).
    await open('twohr');
    const t2 = await box('#t2');
    const u3 = await box('#u3');
    await win.mouse.move(pg.left + 200, t2.cy);
    await win.mouse.down();
    await win.mouse.move(pg.left + 203, t2.cy + 3);
    await win.mouse.move(pg.left + 260, u3.top + 3, { steps: 12 });
    await win.waitForTimeout(80);
    await win.mouse.up();
    await win.waitForTimeout(150);
    s = await struct();
    check('the lower of two dividers carried down with a drift aside moves there, it does not split the note', s === 'u0,t1,u1,u2,t2,u3', s);

    // ---- Files dragged over the note ----------------------------------------------
    await open('files');
    const f1 = await box('#f1');
    const fileMark = await win.evaluate(({ x, y }) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['words'], 'notes.txt', { type: 'text/plain' }));
      document.elementFromPoint(x, y).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
      const m = document.querySelector('.drop-mark');
      const r = m && !m.hidden ? m.getBoundingClientRect() : null;
      const out = r ? { top: r.top, height: r.height, width: r.width } : null;
      document.getElementById('editor').dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: null, dataTransfer: dt }));
      return { mark: out, after: !!document.querySelector('.drop-mark:not([hidden])') };
    }, { x: f1.cx, y: f1.bottom - 2 });
    check('a file dragged over the note: a flat mark between the lines where it will stand; gone when it leaves',
      !!fileMark.mark && fileMark.mark.width > fileMark.mark.height && fileMark.mark.top > f1.cy && !fileMark.after, JSON.stringify({ fileMark, f1 }));
    const picMark = await win.evaluate(({ x, y }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' }));
      document.elementFromPoint(x, y).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
      return !!document.querySelector('.drop-mark:not([hidden])');
    }, { x: f1.cx, y: f1.bottom - 2 });
    check('a picture dragged over the note gets no mark: it floats where it is let go', !picMark);

    // ---- Files copied in Explorer and pasted (Windows: the clipboard's file list) ----
    if (process.platform === 'win32') {
      const dir = path.join(profile, 'outside');
      fs.mkdirSync(dir, { recursive: true });
      const clip = path.join(dir, 'clip.webm');
      fs.copyFileSync(path.join(root, 'tests/fixtures/clip.webm'), clip);
      const sheet = path.join(dir, 'sheet.txt');
      fs.writeFileSync(sheet, 'words');
      const copyFiles = (...files) => execFileSync('powershell.exe', ['-NoProfile', '-Command',
        `Set-Clipboard -LiteralPath ${files.map((f) => `'${f.replace(/'/g, "''")}'`).join(',')}`]);
      const pasteAt = async (selector) => {
        await win.evaluate((s) => {
          const el = document.querySelector(s);
          const r = document.createRange();
          r.selectNodeContents(el);
          r.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          document.getElementById('editor').focus();
        }, selector);
        await win.keyboard.press('Control+V');
      };
      copyFiles(clip);
      await pasteAt('#f0');
      const video = await win.waitForFunction(() => document.querySelector('#editor .link-file')?.previousElementSibling?.id ?? '', null, { polling: 100, timeout: 8000 }).then((h) => h.jsonValue()).catch(() => '');
      check('a video file copied in Explorer pastes into the note, under the line the caret was in', video === 'f0', String(video));
      copyFiles(sheet);
      await pasteAt('#f2');
      const card = await win.waitForFunction(() => document.querySelector('#editor .link-attach')?.previousElementSibling?.id ?? '', null, { polling: 100, timeout: 8000 }).then((h) => h.jsonValue()).catch(() => '');
      check('any other file copied in Explorer pastes as a file card', card === 'f2', String(card));
      try { execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Set-Clipboard -Value " "']); } catch { /* leave it */ }
    }

    check('no page errors in the block-handle checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runBlockHandleChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
