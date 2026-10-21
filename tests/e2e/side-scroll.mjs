/**
 * 1.0.0 — the owner (2026-10-21): "new notes push the Black holes section
 * down; I want two separate scroll areas, one for notes and one for black
 * notes". The real app on a throwaway profile: sixty notes and one black
 * hole, the note list and the holes each scrolling their own, the section
 * staying in sight whatever the notes do.
 *
 *   node tests/e2e/side-scroll.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runSideScrollChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-side-scroll-'));
  const notes = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  // Sixty notes, so the list has to scroll in any window a person uses.
  for (let i = 1; i <= 60; i += 1) {
    fs.writeFileSync(path.join(notes, `n-${String(i).padStart(3, '0')}.json`), JSON.stringify({
      id: `n-${String(i).padStart(3, '0')}`,
      title: `Note ${String(i).padStart(2, '0')}`,
      content: `<p>the words of note ${i}</p>`,
      createdAt: 1, updatedAt: i,
    }, null, 2));
  }

  const launch = () => electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
  let app;
  try {
    app = await launch();
    const win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await win.setViewportSize?.({ width: 1200, height: 800 }).catch(() => {});
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(400);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.waitForTimeout(300);
    const until = async (what, tries = 50) => { for (let i = 0; i < tries; i += 1) { if (await what()) return true; await win.waitForTimeout(100); } return !!(await what()); };

    // ---- one black hole, made the way a hand makes it -------------------------
    await win.evaluate(() => document.getElementById('btn-new-hole').click());
    await win.waitForSelector('#ov-hole:not([hidden]) .hole-name', { timeout: 5000 });
    await win.fill('#ov-hole .hole-name', 'Safe');
    await win.fill('#ov-hole .hole-pin[data-pin="new"]', '482193');
    await win.fill('#ov-hole .hole-pin[data-pin="again"]', '482193');
    await win.evaluate(() => [...document.querySelectorAll('#ov-hole button')].find((b) => b.textContent.trim() === 'Create')?.click());
    await win.waitForFunction(() => document.querySelector('#ov-hole .hole-key'), null, { polling: 50, timeout: 8000 });
    await win.evaluate(() => [...document.querySelectorAll('#ov-hole button')].find((b) => b.textContent.trim() === 'I have written it down')?.click());
    const holeThere = () => win.evaluate(() => document.querySelectorAll('#holes-scroll .hole-block').length === 1);
    check('one black hole made, it stands in the holes\u2019 own area, not in the note list',
      await until(holeThere)
      && await win.evaluate(() => document.querySelectorAll('#note-list .hole-block').length === 0
        && !!document.querySelector('#holes-scroll .hole-block .hole-row')),
      'holes must be in #holes-scroll and only there');

    // ---- the section stays in sight with sixty notes ---------------------------
    const sight = () => win.evaluate(() => {
      const head = document.querySelector('#holes-scroll .holes-head');
      const r = head?.getBoundingClientRect();
      const list = document.getElementById('note-list');
      return {
        there: !!head,
        inside: !!r && r.top >= 0 && r.bottom <= window.innerHeight,
        title: head?.querySelector('.holes-title')?.textContent ?? '',
        listScrolls: list.scrollHeight > list.clientHeight,
        listTop: list.getBoundingClientRect().top,
      };
    });
    const seen = await sight();
    check('with sixty notes the Black holes heading is in view, no scrolling asked for',
      seen.there && seen.inside && seen.title === 'Black holes' && seen.listScrolls,
      JSON.stringify(seen));

    // ---- each area scrolls its own ---------------------------------------------
    const apart = await win.evaluate(() => {
      const list = document.getElementById('note-list');
      const holes = document.getElementById('holes-scroll');
      const head = holes.querySelector('.holes-head');
      const headTopBefore = head.getBoundingClientRect().top;
      const listBefore = list.scrollTop;
      const holesBefore = holes.scrollTop;
      list.scrollTop = list.scrollHeight;        // the notes fling to their end
      const listMoved = list.scrollTop > listBefore;
      const holesAfterList = holes.scrollTop;
      const headTopAfterList = head.getBoundingClientRect().top;
      holes.scrollTop = 60;                       // the holes scroll their own way
      const listAfterHoles = list.scrollTop;
      return { headTopBefore, headTopAfterList, listBefore, holesBefore, listMoved, holesAfterList, listAfterHoles };
    });
    check('the notes and the holes scroll apart: the one leaves the other where it was',
      apart.listMoved && apart.holesAfterList === apart.holesBefore && apart.listAfterHoles > apart.listBefore
      && Math.abs(apart.headTopAfterList - apart.headTopBefore) < 1,
      JSON.stringify(apart));

    // ---- a new note does not push the section down ------------------------------
    const topBefore = await win.evaluate(() => document.querySelector('#holes-scroll .holes-head').getBoundingClientRect().top);
    await win.evaluate(() => document.getElementById('btn-new').click());
    await win.waitForFunction(() => document.querySelectorAll('#note-list .note-row, #note-list .note-item').length >= 61
      || document.getElementById('title')?.value === '', null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.waitForTimeout(300);
    const topAfter = await win.evaluate(() => document.querySelector('#holes-scroll .holes-head').getBoundingClientRect().top);
    check('a new note does not move the Black holes heading',
      Math.abs(topAfter - topBefore) < 1, `heading top ${topBefore} -> ${topAfter}`);

    // ---- a filter that hides the list empties the holes' area -------------------
    await win.fill('#side-filter', 'zzz-no-note-is-called-this');
    const emptied = await until(() => win.evaluate(() => document.getElementById('holes-scroll').children.length === 0
      && !!document.querySelector('#note-list .note-list-empty')));
    check('while a filter hides the list, the holes\u2019 area is empty too', emptied,
      JSON.stringify(await win.evaluate(() => ({ holes: document.getElementById('holes-scroll').children.length }))));
    await win.fill('#side-filter', '');
    const back = await until(() => win.evaluate(() => document.querySelectorAll('#holes-scroll .hole-block').length === 1
      && document.querySelectorAll('#note-list .note-item, #note-list .note-row').length >= 60));
    check('the filter cleared, the holes are back beside the notes', back);

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  let failed = 0;
  await runSideScrollChecks((name, ok, detail = '') => { count += 1; console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  console.log(`\n${count - failed}/${count} side-scroll checks passed`);
  process.exitCode = failed ? 1 : 0;
}
