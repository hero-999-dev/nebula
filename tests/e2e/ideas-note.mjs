/**
 * The Ideas-note reports, checked in the real app with real keys and pointer.
 *
 * 0.8.3 fixed slash commands on <p> lines and every unit test agreed, but the
 * line Chromium makes after Enter is a bare <div>, where `/h3` did nothing.
 * The same release saved the rotation readout into notes, could not delete a
 * selected arrow, and ran an `onerror` from an imported .nebula.json. Each
 * of those passed jsdom; each is driven here the way a person would hit it.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runIdeasChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-ideas-'));
  const notes = path.join(profile, 'storage/notes');
  fs.mkdirSync(notes, { recursive: true });
  const seed = (id, title, content) => fs.writeFileSync(path.join(notes, `${id}.json`),
    JSON.stringify({ id, title, content, createdAt: Date.now(), updatedAt: Date.now() }));
  seed('i-typed', 'Ideas typed', '<p><br></p>');
  seed('i-shape', 'Ideas shape', `<p>x</p>${'<p><br></p>'.repeat(12)}`);
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    const win = await app.firstWindow(); win.setDefaultTimeout(10000);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
    await win.waitForFunction(() => document.querySelector('.note-row.active'), null, { polling: 50 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const open = async (title) => {
      await win.locator('.note-row').filter({ hasText: title }).first().click();
      await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
    };
    const slash = async (query) => {
      await win.keyboard.type(`/${query}`, { delay: 20 });
      await win.waitForFunction(() => !document.getElementById('slash-menu').hidden, null, { polling: 50 });
      await win.keyboard.press('Enter');
    };
    const blocks = () => win.evaluate(() => [...document.getElementById('editor').children]
      .filter((e) => !e.classList.contains('shape-layer'))
      .map((e) => `${e.tagName.toLowerCase()}:${e.textContent.trim()}`));

    /* Slash on lines made by typing: after a heading, Enter starts a <div>. */
    await open('Ideas typed');
    await win.evaluate(() => {
      const ed = document.getElementById('editor'); ed.focus();
      const r = document.createRange(); r.setStart(ed.querySelector('p'), 0); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await win.keyboard.type('Top heading ', { delay: 5 });
    await slash('h1');
    await win.keyboard.press('Enter');
    await win.keyboard.type('Plain line', { delay: 5 });
    await win.keyboard.press('Enter');
    await slash('h3');
    await win.keyboard.type('Typed heading', { delay: 5 });
    await win.keyboard.press('Enter');
    await slash('bullet');
    await win.keyboard.type('Typed bullet', { delay: 5 });
    const typed = await blocks();
    check('a typed line after a heading turns into Heading 3 with /h3', typed.includes('h3:Typed heading'), JSON.stringify(typed));
    check('/bullet on a typed line makes only that line a list',
      typed.some((b) => /^(ul|ol):Typed bullet$/.test(b)) && typed.includes('h1:Top heading') && typed.some((b) => /^(div|p):Plain line$/.test(b)),
      JSON.stringify(typed));

    /* Rotation readout: shown while turning, gone (and unsaved) after. */
    await open('Ideas shape');
    await win.evaluate(() => {
      const ed = document.getElementById('editor'); ed.focus();
      const t = ed.querySelector('p').firstChild; const r = document.createRange(); r.setStart(t, 1); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await win.keyboard.type(' ', { delay: 5 });
    await slash('shape');
    await win.waitForSelector('#editor .shape .shape-rot');
    const centre = () => win.evaluate(() => { const r = document.querySelector('#editor .shape').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    // Away from where a new arrow appears, so the arrow's end is dropped on nothing but the shape.
    let c = await centre();
    await win.mouse.move(c.x, c.y); await win.mouse.down();
    for (let i = 1; i <= 10; i++) await win.mouse.move(c.x + 30 * i, c.y + 15 * i);
    await win.mouse.up();
    const rot = await win.evaluate(() => { const r = document.querySelector('#editor .shape .shape-rot').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.move(rot.x, rot.y); await win.mouse.down();
    for (let i = 1; i <= 8; i++) await win.mouse.move(rot.x + i * 12, rot.y + i * 8);
    const during = await win.evaluate(() => document.querySelector('#editor .shape .shape-angle')?.textContent ?? '');
    await win.mouse.up();
    check('the angle is shown while a shape turns', /^\d+°$/.test(during), during);
    await win.waitForFunction(() => !document.querySelector('#editor .shape-angle'), null, { polling: 50, timeout: 2000 }).catch(() => {});
    check('the angle readout is gone after release', !(await win.evaluate(() => !!document.querySelector('#editor .shape-angle'))));
    await win.waitForTimeout(1500); // autosave
    const saved = fs.readFileSync(path.join(notes, 'i-shape.json'), 'utf8');
    check('the angle readout is not saved into the note', saved.includes('data-rot') && !saved.includes('shape-angle'));

    /* Arrows: attach, follow, delete while the editor has focus. */
    await win.evaluate(() => document.querySelector('[data-arrow-add="straight"]').click());
    c = await centre();
    const end = await win.evaluate(() => { const r = document.querySelector('#editor .note-arrow .arrow-end[data-end="to"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.move(end.x, end.y); await win.mouse.down();
    for (let i = 1; i <= 10; i++) await win.mouse.move(end.x + (c.x - end.x) * i / 10, end.y + (c.y - end.y) * i / 10);
    await win.mouse.up();
    const tied = await win.evaluate(() => { const a = document.querySelector('#editor .note-arrow'); return { to: a.dataset.to, x2: a.dataset.x2, anchor: document.querySelector('#editor .shape').dataset.anchor }; });
    check('an arrow end dropped on a shape attaches to it', !!tied.to && tied.to === tied.anchor);
    await win.mouse.move(c.x, c.y); await win.mouse.down();
    for (let i = 1; i <= 10; i++) await win.mouse.move(c.x + 20 * i, c.y + 12 * i);
    await win.mouse.up();
    check('the attached end follows the shape', await win.evaluate((x2) => document.querySelector('#editor .note-arrow').dataset.x2 !== x2, tied.x2));
    await win.evaluate(() => document.getElementById('editor').focus());
    const mid = await win.evaluate(() => {
      const a = document.querySelector('#editor .note-arrow');
      const f = a.querySelector('.arrow-end[data-end="from"]').getBoundingClientRect();
      const t = a.querySelector('.arrow-end[data-end="to"]').getBoundingClientRect();
      return { x: (f.left + f.width / 2 + t.left + t.width / 2) / 2, y: (f.top + f.height / 2 + t.top + t.height / 2) / 2 };
    });
    const before = await win.evaluate(() => document.getElementById('editor').textContent);
    await win.mouse.click(mid.x, mid.y);
    check('a pressed arrow shows as selected', await win.evaluate(() => !!document.querySelector('#editor .note-arrow.is-selected')));
    await win.keyboard.press('Delete');
    check('Delete removes the selected arrow', await win.locator('#editor .note-arrow').count() === 0);
    check('deleting the arrow did not touch the text', await win.evaluate(() => document.getElementById('editor').textContent) === before);

    /* Import: a crafted .nebula.json runs nothing; a raw vault file opens as a note. */
    const evil = path.join(profile, 'evil.nebula.json');
    fs.writeFileSync(evil, JSON.stringify({ nebula: 1, title: 'Crafted', content: '<p>hi</p><img src="x" onerror="window.__pwned=1">' }));
    await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, evil);
    await win.evaluate(() => document.querySelector('[data-act="import"]').click());
    await win.waitForFunction(() => document.querySelector('#title').value === 'Crafted', null, { polling: 50 });
    await win.waitForTimeout(300);
    check('an imported .nebula.json cannot run script', !(await win.evaluate(() => window.__pwned === 1)));
    const raw = path.join(profile, 'n-raw.json');
    fs.writeFileSync(raw, JSON.stringify({ id: 'n-raw', title: 'From the vault', content: '<h1>From the vault</h1><p>line</p>', createdAt: 1, updatedAt: 2 }));
    await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, raw);
    await win.evaluate(() => document.querySelector('[data-act="import"]').click());
    await win.waitForFunction(() => document.querySelector('#title').value === 'From the vault', null, { polling: 50 }).catch(() => {});
    check('a note file copied from a vault imports as that note',
      await win.evaluate(() => document.querySelector('#title').value === 'From the vault' && !!document.querySelector('#editor h1')));
  } catch (err) {
    check('Ideas-note checks ran to the end', false, err.message.split('\n')[0]);
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
