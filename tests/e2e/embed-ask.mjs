/**
 * A page embedded in a note asks for the microphone or notifications, and the
 * person answers (owner, 2026-10-16; hunt B25, electron/permissions.js). No
 * "Allow", nothing; an answer lasts while that page is open — a reload or the
 * note opened again asks anew. Run after build.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');

const PAGE = `<!doctype html><title>embedded</title><body style="margin:0;height:100vh">embedded page<script>
window.state = { perm0: Notification.permission, n: 0 };
try { const n = new Notification('unasked'); n.onshow = () => { window.state.unasked = 'shown'; }; n.onerror = () => { window.state.unasked = 'error'; }; } catch (e) { window.state.unasked = e.name; }
navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => { window.state.auto = 'granted'; s.getTracks().forEach((t) => t.stop()); }, (e) => { window.state.auto = e.name; });
document.addEventListener('mousedown', () => {
  const want = window.want; window.want = '';
  const done = (v) => { window.state.last = v; window.state.n += 1; };
  if (want === 'mic') navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); done('granted'); }, (e) => done(e.name));
  if (want === 'notify') Notification.requestPermission().then(done);
});
<\/script>`;

export async function runEmbedAskChecks(check) {
  const server = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}/embed`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-embed-ask-'));
  const vault = path.join(profile, 'storage', 'notes');
  const note = (id, title, content) => {
    fs.mkdirSync(path.join(vault, id), { recursive: true });
    fs.writeFileSync(path.join(vault, id, `${id}.json`), JSON.stringify({ id, title, createdAt: 1, updatedAt: id === 'n-e' ? 2 : 1, content }));
  };
  note('n-e', 'Embedded', `<p>top</p><div class="link-block link-embed" contenteditable="false" data-block-type="link" data-kind="embed" data-url="${url}"></div><p>end</p>`);
  note('n-o', 'Other', '<p>other</p>');
  let app;
  try {
    app = await electron.launch({
      args: [path.join(root, 'dist-electron', 'main.js'), '--use-fake-device-for-media-stream'],
      env: { ...process.env, NEBULA_USER_DATA: profile },
    });
    const win = await app.firstWindow();
    await app.evaluate(({ dialog, shell }) => {
      shell.openExternal = async () => {};
      globalThis.__asks = [];
      globalThis.__answer = 0;
      dialog.showMessageBox = async (_w, o) => { globalThis.__asks.push(o?.message ?? ''); return { response: globalThis.__answer }; };
    });
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20000 });
    await win.waitForTimeout(600);
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const openNote = (title) => win.evaluate((t) => [...document.querySelectorAll('#note-list .note-row')].find((r) => r.textContent.includes(t))?.click(), title);
    const pageState = () => app.evaluate(({ webContents }, u) => {
      const wc = webContents.getAllWebContents().find((w) => !w.isDestroyed() && w.getURL() === u);
      return wc ? wc.executeJavaScript('JSON.stringify(window.state || null)').then(JSON.parse, () => null) : null;
    }, url);
    const asks = () => app.evaluate(() => globalThis.__asks.slice());
    const waitFor = async (test, ms = 8000) => {
      let s = null;
      for (let t = 0; t < ms; t += 150) { s = await pageState(); if (s && test(s)) return s; await win.waitForTimeout(150); }
      return s;
    };
    // The page is pressed: what it asks for now came from the person.
    const press = async (want, answer) => {
      const before = (await pageState())?.n ?? 0;
      await app.evaluate(({ webContents }, { u, want, answer }) => {
        globalThis.__answer = answer;
        const wc = webContents.getAllWebContents().find((w) => !w.isDestroyed() && w.getURL() === u);
        return wc.executeJavaScript(`window.want = ${JSON.stringify(want)}`).then(() => {
          wc.sendInputEvent({ type: 'mouseDown', x: 20, y: 20, button: 'left', clickCount: 1 });
          wc.sendInputEvent({ type: 'mouseUp', x: 20, y: 20, button: 'left', clickCount: 1 });
        });
      }, { u: url, want, answer });
      return (await waitFor((s) => s.n > before))?.last;
    };

    await openNote('Embedded');
    await waitFor((s) => s.auto);
    await win.waitForTimeout(500);
    const first = await pageState();
    check('an embedded page asking by itself gets no question and no microphone', first?.auto === 'NotAllowedError' && (await asks()).length === 0, JSON.stringify({ first, asks: await asks() }));
    check('an embedded page is not told notifications are allowed before anyone said so', first && first.perm0 !== 'granted' && first.unasked !== 'shown', JSON.stringify(first));

    const no = await press('mic', 0);
    check('"Don\'t allow" leaves the page without the microphone', no === 'NotAllowedError' && (await asks()).length === 1 && /wants to use your microphone/.test((await asks())[0]), JSON.stringify({ no, asks: await asks() }));
    const again = await press('mic', 1);
    check('a page told no is not asked again while it stays open', again === 'NotAllowedError' && (await asks()).length === 1, JSON.stringify({ again, asks: await asks() }));
    const yes = await press('notify', 1);
    const after = await app.evaluate(({ webContents }, u) => webContents.getAllWebContents().find((w) => !w.isDestroyed() && w.getURL() === u).executeJavaScript('Notification.permission'), url);
    check('"Allow" gives the page notifications', yes === 'granted' && after === 'granted' && (await asks()).length === 2 && /wants to show notifications/.test((await asks())[1]), JSON.stringify({ yes, after, asks: await asks() }));

    await app.evaluate(({ webContents }, u) => webContents.getAllWebContents().find((w) => !w.isDestroyed() && w.getURL() === u).reload(), url);
    await win.waitForTimeout(400);
    const reloaded = await waitFor((s) => s.auto);
    const mic = await press('mic', 1);
    check('a reload forgets every answer: asked again, and the yes holds', reloaded?.perm0 !== 'granted' && mic === 'granted' && (await asks()).length === 3, JSON.stringify({ reloaded, mic, asks: await asks() }));

    await openNote('Other');
    await win.waitForTimeout(600);
    await openNote('Embedded');
    const reopened = await waitFor((s) => s.auto);
    const told = await press('notify', 0);
    check('the note opened again asks again', reopened?.perm0 !== 'granted' && reopened?.auto === 'NotAllowedError' && told === 'denied' && (await asks()).length === 4, JSON.stringify({ reopened, told, asks: await asks() }));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    fs.rmSync(profile, { recursive: true, force: true });
    server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runEmbedAskChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` - ${detail}`}`); if (!ok) failed++; });
  process.exitCode = failed ? 1 : 0;
}
