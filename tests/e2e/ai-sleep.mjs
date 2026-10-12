/**
 * 0.9.4 — part 6 of the owner's Ideas note, in the real app on a throwaway
 * profile: an AI tab nobody is looking at goes to sleep and gives its memory
 * back, unless loading its page again could lose something.
 *
 *   node tests/e2e/ai-sleep.mjs          (after npm run build)
 *
 * The tabs are pages of a server on this machine, and the twenty minutes are
 * four seconds here (`nebula:ai-sleep-minutes`). Keys are typed into a tab's
 * own page: the test's keyboard reaches the app's page only.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SLEEP_MS = 4000;

export async function runAiSleepChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-aisleep-'));
  fs.mkdirSync(path.join(profile, 'storage', 'notes'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'storage', 'notes', 'a.json'), JSON.stringify({ id: 'a', title: 'a', content: '<p>x</p>', createdAt: 1, updatedAt: 1 }));
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><title>local</title><body style="margin:0"><textarea id="t" autofocus style="width:100%;height:300px"></textarea><p>${req.url}</p><script>window.t0 = Date.now() + Math.random();</script>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let app;
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    let win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.evaluate(({ b, minutes }) => {
      localStorage.setItem('nebula:ai-custom', JSON.stringify(['one', 'two', 'three'].map((n) => ({ id: `ai-${n}`, name: n, url: `${b}/${n}`, dot: '#fff' }))));
      localStorage.setItem('nebula:ai-hidden', JSON.stringify(['claude', 'gemini', 'chatgpt', 'mistral', 'mathgpt', 'copilot']));
      localStorage.setItem('nebula:ai-active', 'ai-one');
      localStorage.setItem('nebula:ai-sleep-minutes', String(minutes));
      // A tab stays awake unless it was told it may sleep: these three were.
      localStorage.setItem('nebula:ai-may-sleep', JSON.stringify(['ai-one', 'ai-two', 'ai-three']));
      localStorage.setItem('nebula:layout', JSON.stringify({ bar: 'top', barHidden: false, ai: false }));
    }, { b: base, minutes: SLEEP_MS / 60000 });
    await win.reload();
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1300, 800));

    /** The pages the panel holds, by the last part of their address. */
    const guests = () => app.evaluate(async ({ webContents }) => Object.fromEntries(await Promise.all(webContents.getAllWebContents().filter((w) => w.getType() === 'webview')
      .map(async (w) => [new URL(w.getURL()).pathname.split('/')[1], { url: w.getURL(), t0: await w.executeJavaScript('window.t0').catch(() => null) }]))));
    const go = (from, to) => app.evaluate(async ({ webContents }, { from, to }) => {
      const w = webContents.getAllWebContents().find((c) => c.getType() === 'webview' && new URL(c.getURL()).pathname.startsWith(`/${from}`));
      await w.loadURL(to);
    }, { from, to });
    const tabs = () => win.evaluate(() => Object.fromEntries([...document.querySelectorAll('#ai-tabs .ai-tab')].map((b) => [b.dataset.ai.replace('ai-', ''), `${b.classList.contains('active') ? 'active ' : ''}${b.classList.contains('asleep') ? 'asleep' : 'awake'}`])));
    const tab = (name) => win.evaluate((n) => document.querySelector(`#ai-tabs [data-ai="ai-${n}"]`).click(), name);
    const menu = async (name, item) => {
      await win.evaluate((n) => {
        const b = document.querySelector(`#ai-tabs [data-ai="ai-${n}"]`);
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));
      }, name);
      const items = await win.evaluate(() => [...document.querySelectorAll('#ai-site-menu [role="menuitem"]')].map((b) => b.textContent));
      if (item) await win.evaluate((label) => [...document.querySelectorAll('#ai-site-menu [role="menuitem"]')].find((b) => b.textContent === label)?.click(), item);
      else await win.keyboard.press('Escape');
      return items;
    };
    const nap = () => win.waitForTimeout(SLEEP_MS + 1600);
    /** Keys pressed in a tab's page, as a keyboard sends them. */
    const typeIn = (name, keys) => app.evaluate(({ webContents }, { name, keys }) => {
      const w = webContents.getAllWebContents().find((c) => c.getType() === 'webview' && new URL(c.getURL()).pathname.startsWith(`/${name}`));
      w.focus();
      for (const key of keys) {
        w.sendInputEvent({ type: 'keyDown', keyCode: key });
        if (key.length === 1) w.sendInputEvent({ type: 'char', keyCode: key });
        w.sendInputEvent({ type: 'keyUp', keyCode: key });
      }
    }, { name, keys });
    const written = (name) => app.evaluate(({ webContents }, n) => webContents.getAllWebContents()
      .find((c) => c.getType() === 'webview' && new URL(c.getURL()).pathname.startsWith(`/${n}`))?.executeJavaScript('document.getElementById("t").value'), name);

    await win.evaluate(() => document.querySelector('#pad [data-pad="ai"]').click());
    await win.waitForTimeout(700);
    await tab('two');
    await win.waitForTimeout(700);
    // Words typed in "two", and not sent.
    await typeIn('two', [...'draft']);
    await win.waitForTimeout(200);
    const draft = await written('two');
    await tab('three');
    await win.waitForTimeout(700);
    const first = await guests();
    check('three tabs opened are three pages loaded, and words typed in one are in its page', Object.keys(first).sort().join() === 'one,three,two' && draft === 'draft', `${JSON.stringify(first)} ${draft}`);

    await nap();
    let g = await guests();
    let state = await tabs();
    check('a tab nobody looked at for the time goes to sleep: its page is gone, its tab stays, paler', !g.one && state.one === 'asleep', JSON.stringify({ g: Object.keys(g), state }));
    check('the tab on screen stays awake', !!g.three && state.three === 'active awake', JSON.stringify(state));
    check('a tab that was typed in, on an address that names no saved chat, stays awake — its words still there', !!g.two && g.two.t0 === first.two.t0 && state.two === 'awake' && await written('two') === 'draft', JSON.stringify({ g, state }));

    // A saved chat comes back from its address: sent with Enter, it may sleep.
    await go('two', `${base}/two/c/123e4567-e89b-12d3-a456-426614174000`);
    await win.waitForTimeout(400);
    await nap();
    g = await guests();
    check('on a saved chat’s address, with nothing typed since, it sleeps', !g.two && (await tabs()).two === 'asleep', JSON.stringify({ g: Object.keys(g), state: await tabs() }));

    // Waking: on the address it slept on.
    await tab('two');
    await win.waitForTimeout(900);
    g = await guests();
    check('opening a sleeping tab loads it again, where it was', g.two?.url === `${base}/two/c/123e4567-e89b-12d3-a456-426614174000` && g.two.t0 !== first.two.t0 && (await tabs()).two === 'active awake',
      JSON.stringify(g.two));
    // Typed there and not sent: Enter was not the last key.
    await typeIn('two', [...'sent', 'Enter', ...'more']);
    await win.waitForTimeout(200);
    const two = (await guests()).two.t0;
    await tab('one');
    await win.waitForTimeout(900);
    // A temporary chat says so in its address.
    await go('one', `${base}/one/?temporary-chat=true`);
    await win.waitForTimeout(400);
    await tab('three');
    await win.waitForTimeout(400);
    await nap();
    g = await guests();
    check('words typed after the last Enter keep a saved chat awake too', g.two?.t0 === two, JSON.stringify(g.two));
    check('a temporary chat is never put to sleep', !!g.one && (await tabs()).one === 'awake', JSON.stringify({ one: g.one, state: await tabs() }));

    // The reader's own word: keep awake; put to sleep.
    const items = await menu('three');
    check('a tab’s menu offers “Keep awake”, and “Put to sleep” for a tab that is not on screen', items.includes('Keep awake') && !items.includes('Put to sleep') && (await menu('two')).includes('Put to sleep'),
      items.join('|'));
    await menu('three', 'Keep awake');
    check('“Keep awake” is remembered, and the menu then offers to let it sleep', (await menu('three')).includes('Let it sleep when unused')
      && await win.evaluate(() => localStorage.getItem('nebula:ai-may-sleep')) === '["ai-one","ai-two"]');
    await menu('two', 'Put to sleep');
    await win.waitForTimeout(300);
    g = await guests();
    check('“Put to sleep” does it at once, whatever was typed', !g.two && (await tabs()).two === 'asleep', JSON.stringify({ g: Object.keys(g), state: await tabs() }));

    // The panel closed: nothing is on screen, so the open tab sleeps too — unless it is kept awake.
    await win.evaluate(() => document.querySelector('#pad [data-pad="ai"]').click());
    await nap();
    g = await guests();
    check('with the panel closed, a tab kept awake stays, and so does the temporary chat', !!g.three && !!g.one && !g.two, JSON.stringify(Object.keys(g)));
    await win.evaluate(() => document.querySelector('#pad [data-pad="ai"]').click());
    await win.waitForTimeout(300);
    await menu('three', 'Let it sleep when unused');
    await win.evaluate(() => document.querySelector('#pad [data-pad="ai"]').click());
    await nap();
    g = await guests();
    check('let go, it sleeps with the panel closed — the memory of every page but the temporary chat is given back', !g.three && !g.two && !!g.one, JSON.stringify(Object.keys(g)));
    await win.evaluate(() => document.querySelector('#pad [data-pad="ai"]').click());
    await win.waitForTimeout(900);
    g = await guests();
    check('opening the panel wakes the tab it shows, and only that one', !!g.three && !g.two && (await tabs()).three === 'active awake' && (await tabs()).two === 'asleep', JSON.stringify({ g: Object.keys(g), state: await tabs() }));

    // Never, if the reader says so: 0 minutes.
    await win.evaluate(() => localStorage.setItem('nebula:ai-sleep-minutes', '0'));
    await win.reload();
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(900);
    await tab('two');
    await win.waitForTimeout(600);
    await tab('three');
    await win.waitForTimeout(SLEEP_MS + 1200);
    g = await guests();
    check('with the sleep time set to 0, no tab sleeps by itself', !!g.two && !!g.three, JSON.stringify(Object.keys(g)));

    check('no page errors in the AI sleep checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runAiSleepChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
