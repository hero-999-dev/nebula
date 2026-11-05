/**
 * Tailscale sync (1.0.3), three real copies of Nebula on one computer.
 *
 * Loopback stands in for the tailnet (NEBULA_SYNC_HOST=127.0.0.1), each copy
 * on its own port and told the other's. They pair with a code made on one and
 * typed into the other, then pull from each other: a note made on one side
 * comes over with its picture, a note changed on both sides is kept twice
 * side by side, and a note deleted for good on one side goes on the other too.
 * A third copy joins later with the code shown again on A, lists only B, and
 * still hears of A's deletes through B (the owner, 2026-11-04: "iki den fazla
 * cihazı bağlama olsun").
 * Tools sits beside Settings in the menu bar.
 */
import { _electron as electron } from 'playwright-core';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT_A = 37511;
const PORT_B = 37512;
const PORT_C = 37513;

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function seed(profile, notes) {
  const vault = path.join(profile, 'storage', 'notes');
  for (const n of notes) {
    fs.mkdirSync(path.join(vault, n.id), { recursive: true });
    fs.writeFileSync(path.join(vault, n.id, `${n.id}.json`), JSON.stringify({ createdAt: 1, updatedAt: 1, ...n }));
  }
  return vault;
}
const noteIds = (vault) => fs.readdirSync(vault).filter((d) => fs.existsSync(path.join(vault, d, `${d}.json`)));
const readNote = (vault, id) => { try { return JSON.parse(fs.readFileSync(path.join(vault, id, `${id}.json`), 'utf8')); } catch { return null; } };

async function launch(profile, port, peerPort) {
  const app = await electron.launch({
    args: [path.join(root, 'dist-electron/main.js')],
    env: { ...process.env, NEBULA_USER_DATA: profile, NEBULA_SYNC_HOST: '127.0.0.1', NEBULA_SYNC_PORT: String(port), NEBULA_SYNC_PEER_PORT: String(peerPort) },
  });
  const win = await app.firstWindow();
  win.setDefaultTimeout(15_000);
  await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
  await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
  await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
  return { app, win };
}

const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return !!(await fn()); };

export async function runSyncChecks(check) {
  const profileA = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-sync-a-'));
  const profileB = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-sync-b-'));
  const profileC = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-sync-c-'));
  const shared = [
    { id: 'n-shared', title: 'Shared', content: '<p id="s1">Both have this.</p>' },
    { id: 'n-del', title: 'Going', content: '<p>Deleted on one side.</p>', deletedAt: 2 },
  ];
  const vaultA = seed(profileA, [...shared, { id: 'n-a', title: 'Made on A', content: '<p>A picture:</p><p><img src="nebula-media://note/n-a/pic.png"></p>' }]);
  fs.writeFileSync(path.join(vaultA, 'n-a', 'pic.png'), PIXEL);
  const vaultC = () => path.join(profileC, 'storage', 'notes');
  const vaultB = seed(profileB, [...shared, { id: 'n-b', title: 'Made on B', content: '<p>From B.</p>' }]);

  let a; let b; let c;
  try {
    a = await launch(profileA, PORT_A, PORT_B);
    b = await launch(profileB, PORT_B, PORT_A);
    const sync = (side, fn, arg) => side.win.evaluate(([f, x]) => window.nebula.sync[f](x), [fn, arg]);

    // Tools, beside Settings.
    const titles = await a.win.evaluate(() => [...document.querySelectorAll('.am-title')].map((t) => t.textContent));
    check('Tools sits right after Settings in the menu bar', titles.indexOf('Tools') === titles.indexOf('Settings') + 1, JSON.stringify(titles));
    await a.win.evaluate(() => [...document.querySelectorAll('.am-title')].find((t) => t.textContent === 'Tools').click());
    const items = await a.win.evaluate(() => [...document.querySelectorAll('.am-menu:not([hidden]) button')].filter((x) => !x.hidden).map((x) => x.dataset.cmd));
    check('...and opens a menu of its own (sync now only once paired)', items.includes('tools.tailscale') && !items.includes('tools.syncnow'), JSON.stringify(items));
    await a.win.evaluate(() => document.querySelector('.am-menu:not([hidden]) [data-cmd="tools.tailscale"]').click());
    check('...whose first item opens the Tools sheet', await until(() => a.win.evaluate(() => !document.getElementById('ov-tools').hidden && !!document.querySelector('#tools-body input[type="checkbox"]'))));
    const guide = await a.win.evaluate(() => ({ open: document.getElementById('tool-guide')?.open, steps: document.querySelectorAll('#tool-guide .tool-steps li').length }));
    check('...with the setup steps open while nothing is paired', guide.open === true && guide.steps === 6, JSON.stringify(guide));
    await a.win.keyboard.press('Escape');

    // Pairing: a code made on A, typed into B. Nothing answers before it.
    check('nothing listens before pairing', (await sync(a, 'state')).listening === false);
    const made = await sync(a, 'makeCode');
    check('A makes a pairing code', made.ok && typeof made.code === 'string' && made.code.replace(/\W/g, '').length >= 20, JSON.stringify(made));
    check('B takes it', (await sync(b, 'setCode', made.code)).ok === true);
    check('a wrong code is refused', (await sync(b, 'setCode', 'nope')).ok === false);
    const pairFile = path.join(profileA, 'sync', 'pair.bin');
    check('the key is kept wrapped, never the code as text', fs.existsSync(pairFile) && !fs.readFileSync(pairFile).toString('latin1').includes(made.code));
    check('the code itself is kept wrapped too', !fs.readFileSync(path.join(profileA, 'sync', 'code.bin')).toString('latin1').includes(made.code.replace(/-/g, '')));
    await sync(a, 'configure', { enabled: true });
    await sync(a, 'configure', { addDevice: `127.0.0.1:${PORT_B}` });
    await sync(b, 'configure', { enabled: true });
    await sync(b, 'configure', { addDevice: `127.0.0.1:${PORT_A}` });
    check('both answer once paired and on', await until(async () => (await sync(a, 'state')).listening && (await sync(b, 'state')).listening));
    const reached = await sync(a, 'check');
    check('A says B is connected', reached.devices?.[0]?.reach?.ok === true, JSON.stringify(reached.devices));
    await a.win.evaluate(() => [...document.querySelectorAll('.am-title')].find((t) => t.textContent === 'Tools').click());
    await a.win.evaluate(() => document.querySelector('.am-menu:not([hidden]) [data-cmd="tools.tailscale"]').click());
    check('...and so does the Tools sheet, beside B and at the top', await until(() => a.win.evaluate(() =>
      /^Connected · Nebula /.test(document.querySelector('#tool-devices .tool-device--ok .tool-device__state')?.textContent ?? '')
      && /1 of 1 connected/.test(document.getElementById('tool-status').textContent))));
    // Show the code, then the same button hides it again (the owner, 2026-11-05).
    const codeButton = () => a.win.evaluate(() => document.getElementById('tool-show-code')?.textContent);
    check('...with Show the code', (await codeButton()) === 'Show the code', await codeButton());
    await a.win.evaluate(() => document.getElementById('tool-show-code').click());
    check('...which turns into Hide the code once shown', await until(async () => (await codeButton()) === 'Hide the code'));
    await a.win.evaluate(() => document.getElementById('tool-show-code').click());
    check('...and back to Show the code once hidden', await until(async () => (await codeButton()) === 'Show the code'));
    await a.win.keyboard.press('Escape');

    // First pulls: each takes what only the other has.
    const first = await sync(b, 'now');
    check('B pulls from A without an error', !first.error, JSON.stringify(first));
    check('...and takes the note made on A', readNote(vaultB, 'n-a')?.title === 'Made on A');
    check('...with its picture, byte for byte', await until(() => fs.existsSync(path.join(vaultB, 'n-a', 'pic.png')) && sha(fs.readFileSync(path.join(vaultB, 'n-a', 'pic.png'))) === sha(PIXEL)));
    check('...and shows it in the list', await until(() => b.win.evaluate(() => [...document.querySelectorAll('.nr-title')].some((t) => t.textContent === 'Made on A'))));
    // The owner, 2026-11-05: Sync now goes both ways, and says so at the bottom right.
    check('Sync now on B makes A pull from B too', first.told === 1 && await until(() => readNote(vaultA, 'n-b')?.title === 'Made on B'), JSON.stringify(first));
    const cardOf = (copy) => copy.win.evaluate(() => { const c = document.getElementById('sync-card'); if (!c || c.hidden) return null; const r = c.getBoundingClientRect(); return { head: c.querySelector('.sync-card__head').textContent, right: innerWidth - r.right, bottom: innerHeight - r.bottom }; });
    const cardB = await cardOf(b);
    check('...and B’s card at the bottom right says it synced on all devices', cardB?.head === 'Synced on all your devices' && cardB.right < 40 && cardB.bottom < 40, JSON.stringify(cardB));
    check('...while A’s card says it synced', (await cardOf(a))?.head === 'Synced', JSON.stringify(await cardOf(a)));
    const back = await sync(a, 'now');
    check('A pulls from B', !back.error && readNote(vaultA, 'n-b')?.title === 'Made on B', JSON.stringify(back));

    // Changed on both sides: kept twice, nothing written over.
    const edit = async (side, words) => {
      await side.win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.querySelector('.nr-title')?.textContent === 'Shared')?.click());
      await side.win.waitForFunction(() => document.getElementById('title').value === 'Shared', null, { polling: 50 });
      await side.win.evaluate(() => { const el = document.querySelector('#editor #s1') ?? document.querySelector('#editor p'); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); el.closest('[contenteditable]')?.focus(); });
      await side.win.keyboard.type(words);
      await side.win.keyboard.press('Control+s');
      return until(() => (readNote(side === a ? vaultA : vaultB, 'n-shared')?.content ?? '').includes(words), 5000);
    };
    check('the shared note is changed on A', await edit(a, ' Edited on A.'));
    check('...and on B', await edit(b, ' Edited on B.'));
    const clash = await sync(b, 'now');
    const copies = noteIds(vaultB).filter((id) => /^n-shared-c[0-9a-f]{8}$/.test(id));
    const texts = [readNote(vaultB, 'n-shared'), ...copies.map((id) => readNote(vaultB, id))].map((n) => n?.content ?? '').join(' ');
    check('a note changed on both sides is kept twice, side by side', clash.copies === 1 && copies.length === 1, JSON.stringify({ clash, copies: copies.map((id) => readNote(vaultB, id)), kept: readNote(vaultB, 'n-shared') }));
    check('...holding both changes', texts.includes('Edited on A.') && texts.includes('Edited on B.'));
    check('...the copy says so in its title', (readNote(vaultB, copies[0])?.title ?? '').includes('⇄'));

    // A third device: the code shown again on A, typed into C, which lists only B.
    const shown = await sync(a, 'showCode');
    check('A shows the code again for the next device', shown.ok && shown.code.replace(/-/g, '') === made.code.replace(/-/g, ''), JSON.stringify(shown));
    c = await launch(profileC, PORT_C, PORT_B);
    check('C takes it', (await sync(c, 'setCode', shown.code)).ok === true);
    await sync(c, 'configure', { enabled: true });
    await sync(c, 'configure', { addDevice: `127.0.0.1:${PORT_B}` });
    await sync(b, 'configure', { addDevice: `127.0.0.1:${PORT_C}` });
    check('B now lists two devices', (await sync(b, 'state')).devices?.length === 2);
    check('C answers', await until(async () => (await sync(c, 'state')).listening));
    const third = await sync(c, 'now');
    check('C pulls everything through B', !third.error && readNote(vaultC(), 'n-a')?.title === 'Made on A' && readNote(vaultC(), 'n-b')?.title === 'Made on B', JSON.stringify(third));
    check('...and A’s picture with it', await until(() => fs.existsSync(path.join(vaultC(), 'n-a', 'pic.png'))));

    // Deleted for good on A: gone from B too.
    await a.win.evaluate(() => document.querySelector('.drawer-tab[data-drawer="trash"]').click());
    await a.win.waitForFunction(() => [...document.querySelectorAll('.drawer-item')].some((i) => i.textContent.includes('Going')), null, { polling: 50 });
    await a.win.evaluate(() => {
      const item = [...document.querySelectorAll('.drawer-item')].find((i) => i.textContent.includes('Going'));
      const btn = [...item.querySelectorAll('.drawer-actions button')].find((x) => x.textContent === 'Delete');
      btn.click(); btn.click();
    });
    check('A deletes a note for good', await until(() => !readNote(vaultA, 'n-del')));
    const stateA = JSON.parse(fs.readFileSync(path.join(profileA, 'sync', 'state.json'), 'utf8'));
    check('...and remembers only its id as gone', !!stateA.tombs?.['n-del'] && !JSON.stringify(stateA).includes('Deleted on one side'));
    const gone = await sync(b, 'now');
    check('B lets the deleted note go too', !gone.error && gone.dropped >= 1 && await until(() => !readNote(vaultB, 'n-del')), JSON.stringify(gone));
    check('...and nothing of it is left half-downloaded', !fs.existsSync(path.join(profileB, 'sync', 'partial', 'n-del')));
    const heard = await sync(c, 'now');
    check('C, which never asks A, lets it go too, through B', !heard.error && await until(() => !readNote(vaultC(), 'n-del')), JSON.stringify(heard));
    const both = await sync(b, 'now');
    check('B pulls from both A and C in one go', !both.error && both.devices?.length === 2 && both.devices.every((d) => !d.error), JSON.stringify(both));
    await c.app.close();
    const away = await sync(b, 'now');
    check('with C closed, B still syncs with A and says one was not reached', !away.error && away.devices.filter((d) => d.error).length === 1, JSON.stringify(away));
    const removed = await sync(b, 'configure', { removeDevice: `127.0.0.1:${PORT_C}` });
    check('C comes off B’s list', removed.ok !== false && (await sync(b, 'state')).devices.length === 1);
    // One tool, Tailscale; Sync now only in its sheet, even when paired (the owner, 2026-11-05).
    const menuNow = await a.win.evaluate(() => {
      [...document.querySelectorAll('.am-title')].find((t) => t.textContent === 'Tools').click();
      const cmds = [...document.querySelectorAll('.am-menu:not([hidden]) button')].map((x) => x.dataset.cmd);
      document.querySelector('.am-title').click(); document.querySelector('.am-title').click();
      return cmds;
    });
    check('paired, the Tools menu still holds Tailscale alone', JSON.stringify(menuNow) === '["tools.tailscale"]', JSON.stringify(menuNow));

    // Connected devices ask before they are parted (the owner, 2026-11-05).
    await a.win.evaluate(() => document.querySelector('[data-cmd="tools.tailscale"]').click());
    await until(() => a.win.evaluate(() => [...document.querySelectorAll('#tools-body button')].some((x) => x.textContent === 'Unpair')));
    await a.win.evaluate(() => [...document.querySelectorAll('#tools-body button')].find((x) => x.textContent === 'Unpair').click());
    check('...and the Tailscale sheet holds Sync now', await a.win.evaluate(() => [...document.querySelectorAll('#tools-body button')].some((x) => x.textContent === 'Sync now' && !x.hidden && !x.disabled)));
    const asked = await until(() => a.win.evaluate(() => !document.getElementById('ov-dialog').hidden && document.getElementById('dlg-input').hidden));
    const question = await a.win.evaluate(() => document.getElementById('dlg-title').textContent);
    await a.win.evaluate(() => document.getElementById('dlg-cancel').click());
    check('Unpair asks “are you sure” while connected, and Cancel keeps the pairing', asked && /^Unpair this device\?/.test(question) && (await sync(a, 'state')).paired, question);

    // Unpaired: the other side is refused.
    await sync(a, 'unpair');
    check('after unpairing nothing answers', await until(async () => !(await sync(a, 'state')).listening) && !fs.existsSync(pairFile));
    const refused = await sync(b, 'now');
    check('...and the other side’s pull fails cleanly', !!refused.error, JSON.stringify(refused));
  } finally {
    await a?.app.close().catch(() => {});
    await b?.app.close().catch(() => {});
    await c?.app.close().catch(() => {});
    fs.rmSync(profileA, { recursive: true, force: true });
    fs.rmSync(profileB, { recursive: true, force: true });
    fs.rmSync(profileC, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runSyncChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
