/**
 * 0.8.9 in the real app: Only view, arrows that snap on, the diamond's and
 * triangle's outline and handles, and the F12 window snapshot.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runViewSnapChecks(check) {
  // A fresh vault: the guide is seeded, and it must open locked.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-viewsnap-'));
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-shots-'));
  let app; let win;
  const launch = async () => {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile, NEBULA_SNAPSHOT_DIR: shots } });
    win = await app.firstWindow(); win.setDefaultTimeout(10000);
    await app.evaluate(({ dialog, BrowserWindow }) => { dialog.showMessageBox = async () => ({ response: 0 }); BrowserWindow.getAllWindows()[0].setSize(1280, 1000); });
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
  };
  const open = async (title) => {
    await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes(t))?.click(), title);
    await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
    await win.waitForTimeout(250);
  };
  const html = () => win.evaluate(() => document.getElementById('editor').innerHTML);
  const clickAt = async (sel, fx = 0.5, fy = 0.5) => {
    const at = await win.evaluate(({ s, fx, fy }) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; }, { s: sel, fx, fy });
    await win.mouse.click(at.x, at.y);
  };
  const menuFor = async (title) => {
    await win.evaluate((t) => { const row = [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes(t)); row?.parentElement?.querySelector('.nr-more')?.click(); }, title);
    await win.waitForFunction(() => !document.getElementById('note-menu').hidden, null, { polling: 50 });
  };

  try {
    await launch();
    await open('Welcome to Nebula Guide');

    /* ---------------- Only view: the guide opens locked */
    const lockedUi = await win.evaluate(() => ({
      chip: !document.getElementById('readonly-chip').hidden,
      editable: document.getElementById('editor').isContentEditable,
      title: document.getElementById('title').readOnly,
    }));
    check('the guide opens in Only view: badge shown, note and title not editable', lockedUi.chip && !lockedUi.editable && lockedUi.title, JSON.stringify(lockedUi));
    const before = await html();
    await clickAt('#editor p');
    await win.keyboard.type('xyz', { delay: 10 });
    await win.keyboard.press('Enter');
    await win.keyboard.press('Backspace');
    await app.evaluate(({ clipboard }) => clipboard.writeText('pasted words'));
    await win.keyboard.press('Control+v');
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(200);
    check('in Only view typing, Enter, Backspace, paste and Ctrl+Z change nothing', (await html()) === before);
    await win.evaluate(() => document.querySelector('#toolbar [data-act="bold"]').click());   // even if something got past pointer-events
    await win.evaluate(() => document.querySelector('.code-src')?.focus());
    await win.keyboard.type('code edit', { delay: 10 });
    const titleBefore = await win.evaluate(() => document.getElementById('title').value);
    await win.evaluate(() => document.getElementById('title').focus());
    await win.keyboard.type('!!', { delay: 10 });
    check('a toolbar action, a code block and the title stay unchanged too',
      (await html()) === before && (await win.evaluate(() => document.getElementById('title').value)) === titleBefore);
    const shapeBefore = await win.evaluate(() => { const s = document.querySelector('#editor .shape'); return s.style.left + s.style.top; });
    const s0 = await win.evaluate(() => { const r = document.querySelector('#editor .shape').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; });
    await win.mouse.move(s0.x, s0.y); await win.mouse.down(); await win.mouse.move(s0.x + 80, s0.y + 40, { steps: 8 }); await win.mouse.up();
    check('a shape on a locked note does not move', await win.evaluate(() => { const s = document.querySelector('#editor .shape'); return s.style.left + s.style.top; }) === shapeBefore);
    await win.evaluate(() => { const p = document.querySelector('#editor p'); const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); });
    await win.keyboard.press('Control+c');
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    check('selecting and copying still work in Only view', copied.length > 10 && copied !== 'pasted words', copied.slice(0, 40));

    /* ---------------- the ⋯ menu and the badge */
    await menuFor('Welcome to Nebula Guide');
    const ticked = await win.evaluate(() => document.querySelector('[data-note-act="readonly"]').getAttribute('aria-checked'));
    await win.evaluate(() => document.querySelector('[data-note-act="readonly"]').click());
    await win.waitForTimeout(200);
    const unlocked = await win.evaluate(() => ({ chip: !document.getElementById('readonly-chip').hidden, editable: document.getElementById('editor').isContentEditable }));
    check('the ⋯ menu shows Only view ticked, and choosing it unlocks the note', ticked === 'true' && !unlocked.chip && unlocked.editable, JSON.stringify({ ticked, unlocked }));
    await win.evaluate(() => { const ed = document.getElementById('editor'); ed.focus(); const t = ed.querySelector('p').lastChild; const r = document.createRange(); r.setStart(t, t.length); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.type(' QQQ', { delay: 10 });
    check('unlocked, typing works again', await win.evaluate(() => document.getElementById('editor').textContent.includes(' QQQ')));
    await win.keyboard.press('Control+z'); await win.waitForTimeout(150);
    await menuFor('Welcome to Nebula Guide');
    await win.evaluate(() => document.querySelector('[data-note-act="readonly"]').click());
    await win.waitForTimeout(200);
    check('the ⋯ menu locks it again', await win.evaluate(() => !document.getElementById('readonly-chip').hidden && !document.getElementById('editor').isContentEditable));
    await app.close();
    await launch();
    await open('Welcome to Nebula Guide');
    check('Only view survives a restart', await win.evaluate(() => !document.getElementById('readonly-chip').hidden));
    await win.evaluate(() => document.getElementById('readonly-chip').click());
    await win.waitForTimeout(200);
    check('clicking the 🔒 badge unlocks the note', await win.evaluate(() => document.getElementById('readonly-chip').hidden && document.getElementById('editor').isContentEditable));

    /* ---------------- shapes: diamond and triangle outline their own edge, handles at the corners */
    await win.evaluate(() => document.getElementById('btn-new').click());
    await win.waitForTimeout(300);
    await win.evaluate(() => { const ed = document.getElementById('editor'); ed.focus(); for (let i = 0; i < 14; i++) ed.insertAdjacentHTML('beforeend', '<p><br></p>'); ed.dispatchEvent(new Event('input', { bubbles: true })); });
    const kinds = {};
    for (const kind of ['rect', 'diamond', 'triangle']) {
      await win.evaluate((k) => document.querySelector(`[data-shape-add="${k}"]`).click(), kind);
      await win.waitForTimeout(150);
      kinds[kind] = await win.evaluate(() => {
        const s = document.querySelector('#editor .shape.sel'); const r = s.getBoundingClientRect();
        const rot = s.querySelector('.shape-rot').getBoundingClientRect(); const h = s.querySelector('.shape-h').getBoundingClientRect();
        const poly = s.querySelector('.shape-svg polygon');
        return {
          ring: getComputedStyle(s).boxShadow !== 'none',
          stroke: poly ? getComputedStyle(poly).stroke : null,
          rotAtBottomLeft: Math.abs(rot.left - r.left) < 4 && Math.abs(rot.bottom - r.bottom) < 4,
          sizeAtBottomRight: Math.abs(h.right - r.right) < 4 && Math.abs(h.bottom - r.bottom) < 4,
        };
      });
      await win.keyboard.press('Escape');
    }
    const clay = await win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--clay').trim());
    check('selected, the diamond and the triangle outline their own edges (no box ring)',
      !kinds.diamond.ring && !kinds.triangle.ring && kinds.diamond.stroke !== 'rgba(28, 26, 22, 0.62)' && kinds.triangle.stroke === kinds.diamond.stroke && kinds.rect.ring, JSON.stringify({ kinds, clay }));
    check('the diamond\'s handles sit where every shape\'s do: turn bottom-left, resize bottom-right',
      kinds.diamond.rotAtBottomLeft && kinds.diamond.sizeAtBottomRight && kinds.rect.rotAtBottomLeft && kinds.rect.sizeAtBottomRight, JSON.stringify(kinds));

    /* ---------------- arrows snap on (XMind-style) */
    await win.evaluate(() => {
      const shapes = [...document.querySelectorAll('#editor .shape')];
      shapes.forEach((s) => s.remove());
      document.querySelector('[data-shape-add="rect"]').click();
      const a = document.querySelector('#editor .shape.sel'); a.style.left = '60px'; a.style.top = '220px'; a.id = 'sa';
      document.querySelector('[data-shape-add="rect"]').click();
      const b = document.querySelector('#editor .shape.sel'); b.style.left = '520px'; b.style.top = '220px'; b.id = 'sb';
      document.querySelector('[data-arrow-add="straight"]').click();
    });
    await win.keyboard.press('Escape');
    await win.waitForTimeout(150);
    const endAt = (end) => win.evaluate((e) => { const r = document.querySelector(`#editor .note-arrow .arrow-end[data-end="${e}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, end);
    const rectOf = (id) => win.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }, id);
    // the 'to' end: brought to 15px LEFT of shape B's edge, never over its centre
    const to = await endAt('to'); const b = await rectOf('sb');
    const near = { x: b.left - 15, y: (b.top + b.bottom) / 2 };
    await win.mouse.move(to.x, to.y); await win.mouse.down();
    for (let i = 1; i <= 12; i++) await win.mouse.move(to.x + (near.x - to.x) * i / 12, to.y + (near.y - to.y) * i / 12);
    const mid = await win.evaluate(() => {
      const a = document.querySelector('#editor .note-arrow'); const layer = a.closest('.shape-layer').getBoundingClientRect(); const bx = document.getElementById('sb').getBoundingClientRect();
      return { lit: document.getElementById('sb').classList.contains('arrow-target'), x2: +a.dataset.x2 + layer.left, edge: bx.left };
    });
    await win.mouse.up();
    await win.waitForTimeout(150);
    const heldB = await win.evaluate(() => ({ to: document.querySelector('#editor .note-arrow').dataset.to, anchor: document.getElementById('sb').dataset.anchor, lit: document.querySelectorAll('.arrow-target').length }));
    check('while dragging, a shape the end comes within reach of is outlined and the end snaps to its edge',
      mid.lit && Math.abs(mid.x2 - mid.edge) <= 2, JSON.stringify(mid));
    check('let go near it (not on its centre) and the end is attached; the outline goes', !!heldB.to && heldB.to === heldB.anchor && heldB.lit === 0, JSON.stringify(heldB));
    // the 'from' end onto shape A, from its right side
    const from = await endAt('from'); const a = await rectOf('sa');
    const nearA = { x: a.right + 12, y: (a.top + a.bottom) / 2 };
    await win.mouse.move(from.x, from.y); await win.mouse.down();
    for (let i = 1; i <= 12; i++) await win.mouse.move(from.x + (nearA.x - from.x) * i / 12, from.y + (nearA.y - from.y) * i / 12);
    await win.mouse.up(); await win.waitForTimeout(150);
    const both = await win.evaluate(() => { const ar = document.querySelector('#editor .note-arrow'); return { from: ar.dataset.from === document.getElementById('sa').dataset.anchor, to: ar.dataset.to === document.getElementById('sb').dataset.anchor, x1: ar.dataset.x1, x2: ar.dataset.x2 }; });
    check('both ends can hold on: shape A to shape B', both.from && both.to, JSON.stringify(both));
    const grab = await win.evaluate(() => { const r = document.getElementById('sb').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; });
    await win.mouse.move(grab.x, grab.y); await win.mouse.down(); await win.mouse.move(grab.x + 60, grab.y + 90, { steps: 8 }); await win.mouse.up();
    await win.waitForTimeout(150);
    check('moving shape B takes its end of the arrow along', await win.evaluate((x2) => document.querySelector('#editor .note-arrow').dataset.x2 !== x2, both.x2));
    // far away: no hold
    const to2 = await endAt('to');
    await win.mouse.move(to2.x, to2.y); await win.mouse.down();
    for (let i = 1; i <= 10; i++) await win.mouse.move(to2.x, to2.y + 16 * i);
    await win.mouse.up(); await win.waitForTimeout(150);
    const loose = await win.evaluate(() => ({ to: document.querySelector('#editor .note-arrow').dataset.to || null, lit: document.querySelectorAll('.arrow-target').length }));
    check('dragged away out of reach, the end lets go', loose.to === null && loose.lit === 0, JSON.stringify(loose));
    check('the magnet outline is never saved into the note', !(await html()).includes('arrow-target'));

    /* ---------------- F12: a picture of the window */
    await app.evaluate(({ clipboard }) => clipboard.clear());
    await win.keyboard.press('F12');
    await win.waitForFunction(() => !document.getElementById('toast').hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.waitForTimeout(400);
    const files = fs.readdirSync(shots).filter((f) => /^Nebula \d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d( \(\d+\))?\.png$/.test(f));
    const png = files.length ? fs.readFileSync(path.join(shots, files[0])) : null;
    const size = png ? { w: png.readUInt32BE(16), h: png.readUInt32BE(20) } : null;
    const clip = await app.evaluate(({ clipboard }) => { const i = clipboard.readImage(); return i.isEmpty() ? null : i.getSize(); });
    const view = await win.evaluate(() => ({ w: innerWidth, h: innerHeight, toast: document.getElementById('toast').textContent }));
    check('F12 saves a PNG of the whole window, named by date and time', files.length === 1 && size && Math.abs(size.w - view.w) <= 2 && Math.abs(size.h - view.h) <= 2, JSON.stringify({ files, size, view }));
    check('and copies it, and says where it went', !!clip && clip.width === size?.w && view.toast.includes(files[0] || '???'), JSON.stringify({ clip, toast: view.toast }));
    await win.keyboard.press('F12');
    await win.waitForTimeout(800);
    check('a second F12 in the same second does not overwrite the first', fs.readdirSync(shots).filter((f) => f.endsWith('.png')).length === 2);
    // A key press that comes through the input pipeline — the path a real F12
    // takes: the main process catches it, and the page does not take a second one.
    await app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'F12' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'F12' });
    });
    await win.waitForTimeout(1200);
    check('a real F12 press is caught by the main process, once', fs.readdirSync(shots).filter((f) => f.endsWith('.png')).length === 3,
      JSON.stringify(fs.readdirSync(shots)));
  } catch (err) {
    check('Only view / arrows / snapshot checks ran to the end', false, err.message.split('\n').slice(0, 3).join(' | '));
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(shots, { recursive: true, force: true });
  }
}
