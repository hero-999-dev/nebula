/**
 * 0.9.4 — part 7 of the owner's Ideas note, in the real app on a throwaway
 * profile: a note's pictures and videos are files in the note's own folder.
 *
 *   node tests/e2e/note-folders.mjs          (after npm run build)
 *
 * A vault written the old way (a picture inside the note's text) is opened,
 * and what is on the disk is looked at after each thing the reader does.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A real picture, too noisy to be made small: w × h of pixels drawn from a seed. */
function png(w, h, seed) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let x = seed;
  for (let i = 0; i < raw.length; i += 1) {
    if (i % (w * 4 + 1) === 0) { raw[i] = 0; continue; }
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = (i % (w * 4 + 1)) % 4 === 0 ? 255 : x & 0xff;
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export async function runNoteFolderChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-folders-'));
  const vault = path.join(profile, 'storage', 'notes');
  const backups = path.join(profile, 'backups');
  fs.mkdirSync(vault, { recursive: true });
  const first = png(40, 30, 7);
  const second = png(24, 24, 99);
  const dataUrl = (bytes) => `data:image/png;base64,${bytes.toString('base64')}`;
  const figure = (bytes, id) => `<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" data-ratio="1.33" style="width: 200px;" id="${id}"><img src="${dataUrl(bytes)}" alt="Pasted image" draggable="false"></figure>`;
  const seed = (id, title, content) => fs.writeFileSync(path.join(vault, `${id}.json`), JSON.stringify({ id, title, content, createdAt: 1, updatedAt: 1 }, null, 2));
  // As 0.9.3 wrote them: the picture inside the note's text.
  seed('n-old', 'Old way', `<p id="o1">words before</p>${figure(first, 'pic')}<p id="o2">words after</p>`);
  seed('n-bin', 'Into the bin', `<p>to be deleted</p>${figure(second, 'pic2')}`);
  seed('n-plain', 'Plain', '<p id="pl">no pictures here</p>');
  const oldText = fs.readFileSync(path.join(vault, 'n-old.json'), 'utf8');
  const plainText = fs.readFileSync(path.join(vault, 'n-plain.json'), 'utf8');
  const binText = fs.readFileSync(path.join(vault, 'n-bin.json'), 'utf8');
  // What a note's folder holds beside the note's own file: its pictures and videos. null: there is no folder.
  const folder = (id, base = vault) => { try { return fs.readdirSync(path.join(base, id)).filter((f) => f !== `${id}.json`).sort(); } catch { return null; } };
  // The note's own file: in its folder, since the note file moved in there.
  const stored = (id) => fs.readFileSync(path.join(vault, id, `${id}.json`), 'utf8');
  // Backups as 0.9.3 made them — a week ago, and before this update: the note's file flat, its picture inside its text.
  // And one a person put there under a name of their own.
  const OLD_COPIES = ['2026-01-01', 'pre-update-0.9.3-1790000000000'];
  for (const name of [...OLD_COPIES, 'kept-by-hand']) {
    fs.mkdirSync(path.join(backups, name, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(backups, name, 'notes', 'n-old.json'), oldText);
  }
  const launch = () => electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
  let app;
  try {
    app = await launch();
    let win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    const ready = async () => {
      await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
      await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 3000 }).catch(() => {});
      await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    };
    await ready();
    const open = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.title === t)?.click(), title);
      await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
      await win.waitForTimeout(200);
    };
    /** Until the disk says so, or ten seconds: under the whole smoke run the undo's write once took longer than four. */
    const until = async (what) => { for (let i = 0; i < 100; i += 1) { if (await what()) return true; await win.waitForTimeout(100); } return !!(await what()); };

    // ---- A vault written the old way, at its first start ----------------------
    const moved = stored('n-old');
    const name = folder('n-old')?.[0] ?? '';
    check('at the first start a note’s picture has left its text for the note’s own folder', !moved.includes('data:image') && folder('n-old')?.length === 1
      && /^[0-9a-f]{24}\.png$/.test(name) && moved.includes(`nebula-media://note/n-old/${name}`), `${folder('n-old')} ${moved.slice(0, 300)}`);
    check('the file is the picture itself, byte for byte', !!name && fs.readFileSync(path.join(vault, 'n-old', name)).equals(first));
    check('the note’s file is small now: its words and the picture’s name', moved.length < oldText.length / 3 && moved.includes('words before') && moved.includes('words after'), `${moved.length} of ${oldText.length}`);
    check('a note without pictures is not touched: its file goes into a folder of its own, and nothing else is in it', stored('n-plain') === plainText && folder('n-plain')?.length === 0);
    check('no note file lies flat in the notes folder any more: every note is one folder', fs.readdirSync(vault).every((name) => fs.statSync(path.join(vault, name)).isDirectory())
      && ['n-old', 'n-plain', 'n-bin'].every((id) => fs.existsSync(path.join(vault, id, `${id}.json`))), fs.readdirSync(vault).join());
    // The copy put aside before the move has done its work once every picture is in its note's folder: it is gone.
    check('the copy put aside for the move is gone again, the move being whole', !fs.existsSync(path.join(backups, 'pre-note-folders')), fs.readdirSync(backups).join());
    // The copies kept the old way do not wait a week to leave: they go at this start, and a copy the new way stands in their place.
    const today = path.join(backups, new Date().toISOString().slice(0, 10), 'notes');
    const sameFile = (a, b) => { try { return fs.statSync(a).ino === fs.statSync(b).ino; } catch { return false; } };
    const newWay = () => fs.existsSync(path.join(today, 'n-old', 'n-old.json')) && !fs.existsSync(path.join(today, 'n-old.json'));
    await until(() => OLD_COPIES.every((n) => !fs.existsSync(path.join(backups, n))) && newWay() && !fs.readdirSync(backups).some((n) => n.startsWith('going-')));
    check('the backups made while pictures were in the notes’ text are gone at once: the daily one and the one put aside before the update',
      OLD_COPIES.every((n) => !fs.existsSync(path.join(backups, n))) && !fs.readdirSync(backups).some((n) => n.startsWith('going-')), fs.readdirSync(backups).join());
    check('in their place is a copy of today kept the new way: each note in its folder, the picture the vault’s own file',
      newWay() && fs.readdirSync(today).every((n) => fs.statSync(path.join(today, n)).isDirectory())
      && fs.readFileSync(path.join(today, 'n-old', 'n-old.json'), 'utf8') === moved && sameFile(path.join(today, 'n-old', name), path.join(vault, 'n-old', name)),
      fs.existsSync(today) ? fs.readdirSync(today).join() : 'no copy of today');
    check('of the daily copies only the newest is kept: one dated copy, today’s', fs.readdirSync(backups).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).join() === new Date().toISOString().slice(0, 10)
      && !fs.existsSync(path.join(backups, new Date().toISOString().slice(0, 10), '.making')), fs.readdirSync(backups).join());
    check('a copy a person put there under a name of their own is left as it is',
      fs.existsSync(path.join(backups, 'kept-by-hand', 'notes', 'n-old.json')) && fs.readFileSync(path.join(backups, 'kept-by-hand', 'notes', 'n-old.json'), 'utf8') === oldText);
    // A backup copies the notes' own files and shares the pictures: a picture is on the disk once.
    const asked = await win.evaluate(() => window.nebula.storage.backup('shared-check'));
    const inBackup = path.join(backups, 'shared-check', 'notes', 'n-old');
    check('a backup shares a note’s pictures with the vault instead of copying them, and copies the note’s own file',
      asked?.ok && fs.statSync(path.join(inBackup, name)).nlink >= 2 && fs.statSync(path.join(inBackup, name)).ino === fs.statSync(path.join(vault, 'n-old', name)).ino
      && fs.statSync(path.join(inBackup, 'n-old.json')).nlink === 1 && fs.readFileSync(path.join(inBackup, 'n-old.json'), 'utf8') === moved,
      JSON.stringify({ asked, there: fs.existsSync(inBackup) ? fs.readdirSync(inBackup) : null }));
    check('and the vault says which way it is written', JSON.parse(fs.readFileSync(path.join(profile, 'storage', 'meta.json'), 'utf8')).schemaVersion === 3);

    // ---- In the app nothing changed: the picture is there ----------------------
    await open('Old way');
    const shown = await win.evaluate(async () => {
      const img = document.querySelector('#editor #pic img');
      if (!img.complete) await img.decode().catch(() => {});
      return { src: img.getAttribute('src'), w: img.naturalWidth, h: img.naturalHeight };
    });
    check('the note shows its picture straight from its file', shown.src === `nebula-media://note/n-old/${name}` && shown.w === 40 && shown.h === 30, JSON.stringify(shown));
    const handed = await win.evaluate(async () => { const r = await window.nebula.storage.read('notes/n-old.json'); return { ok: r.ok, text: r.data.includes('data:image'), length: r.data.length }; });
    check('and the window is handed the note without its pictures written into it', handed.ok && !handed.text && handed.length < 3000, JSON.stringify(handed));
    const whole = await win.evaluate(async (ref) => ({ html: await window.nebula.media.inline(`<img src="${ref}">`), one: await window.nebula.media.dataUrl(ref) }), shown.src);
    check('where the picture itself is needed — an export, a copy — it is written in on request', whole.html === `<img src="data:image/png;base64,${first.toString('base64')}">` && whole.one === `data:image/png;base64,${first.toString('base64')}`, whole.html.slice(0, 80));
    // Copied as a picture, for any program.
    const p0 = await win.evaluate(() => { const r = document.querySelector('#editor #pic').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.click(p0.x, p0.y);
    await win.waitForTimeout(150);
    await app.evaluate(async ({ clipboard, ClipboardItem }) => { await clipboard.write([new ClipboardItem({ 'text/plain': 'nothing yet' })]); });
    await win.keyboard.press('Control+c');
    await win.waitForFunction(() => /Picture copied|could not/.test(document.getElementById('toast')?.textContent ?? ''), null, { polling: 50, timeout: 5000 }).catch(() => {});
    const copied = await app.evaluate(async ({ clipboard }) => { const items = await clipboard.read(); const item = items.find((i) => i.types.includes('image/png')); return item ? (await (await item.getType('image/png')).arrayBuffer()).byteLength : 0; }).catch(() => -1);
    check('Ctrl+C on the picture copies the picture itself', copied > 100 && await win.evaluate(() => document.getElementById('toast').textContent) === 'Picture copied', String(copied));
    // Cropped: the crop is made of the picture's file, and is a picture of its own.
    await win.evaluate(() => document.querySelector('#image-bar [data-image="crop"]').click());
    await win.waitForTimeout(150);
    const edge = await win.evaluate(() => { const r = document.querySelector('.crop-h[data-edge="e"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await win.mouse.move(edge.x, edge.y);
    await win.mouse.down();
    await win.mouse.move(edge.x - 100, edge.y, { steps: 5 });
    await win.mouse.up();
    await win.keyboard.press('Enter');
    await win.waitForTimeout(400);
    const cropped = await win.evaluate(async () => { const img = document.querySelector('#editor #pic img'); if (!img.complete) await img.decode().catch(() => {}); return { data: img.getAttribute('src').startsWith('data:image/png'), w: img.naturalWidth, h: img.naturalHeight }; });
    check('a picture shown from its file can be cropped', cropped.data && cropped.w > 0 && cropped.w < 40 && cropped.h === 30, JSON.stringify(cropped));
    await win.keyboard.press('Control+z');
    await win.waitForTimeout(300);
    check('and Ctrl+Z brings the whole picture back, from its file', await win.evaluate(async (ref) => { const img = document.querySelector('#editor #pic img'); if (!img.complete) await img.decode().catch(() => {}); return img.getAttribute('src') === ref && img.naturalWidth === 40; }, shown.src));
    await win.keyboard.press('Escape');

    // ---- Typing writes the words, not the picture again --------------------------
    const wrote = fs.statSync(path.join(vault, 'n-old', name)).mtimeMs;
    await win.evaluate(() => { const p = document.getElementById('o2'); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); document.getElementById('editor').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.type(' and more');
    check('words typed are saved to the note’s file', await until(() => stored('n-old').includes('words after and more')));
    check('without the picture’s file being written again, and without the picture written into the text',
      // (The cropped picture that was undone may have been saved in between: its file then waits for the next start.)
      fs.statSync(path.join(vault, 'n-old', name)).mtimeMs === wrote && !stored('n-old').includes('data:image') && folder('n-old').includes(name) && folder('n-old').length <= 2,
      JSON.stringify({ sameTime: fs.statSync(path.join(vault, 'n-old', name)).mtimeMs === wrote, inText: stored('n-old').includes('data:image'), files: folder('n-old') }));

    // ---- A picture pasted, taken out, brought back -------------------------------
    await app.evaluate(async ({ clipboard, ClipboardItem }, b64) => {
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }) })]);
    }, second.toString('base64'));
    await win.keyboard.press('Control+v');
    check('a picture pasted into the note is a second file in its folder', await until(() => folder('n-old')?.length === 2) && !stored('n-old').includes('data:image'), `${folder('n-old')}`);
    await win.waitForTimeout(300);
    await win.keyboard.press('Delete');
    check('taken out of the note, the picture leaves the note’s file — its own file waits, an undo may want it', await until(() => (stored('n-old').match(/nebula-media:\/\/note\/n-old\/[0-9a-f]{24}\.png/g) ?? []).length === 1) && folder('n-old')?.length >= 2, `${folder('n-old')}`);
    await win.keyboard.press('Control+z');
    check('and Ctrl+Z brings the picture back', await until(() => (stored('n-old').match(/nebula-media:\/\/note\/n-old\/[0-9a-f]{24}\.png/g) ?? []).length === 2), `${folder('n-old')}`);

    // ---- A video file dropped on the note ----------------------------------------
    const clip = path.join(profile, 'My clip.webm');
    // One second of a test card, 64 × 36 (tests/fixtures/clip.webm, made once with ffmpeg).
    fs.copyFileSync(path.join(root, 'tests', 'fixtures', 'clip.webm'), clip);
    // A real file, as a drop brings one: chosen through a file input, then dropped on the note.
    await win.evaluate(() => { const i = document.createElement('input'); i.type = 'file'; i.id = 'probe-file'; i.style.display = 'none'; document.body.append(i); });
    await win.setInputFiles('#probe-file', clip);
    await win.evaluate(() => {
      const file = document.getElementById('probe-file').files[0];
      const dt = new DataTransfer();
      dt.items.add(file);
      const at = document.getElementById('o1').getBoundingClientRect();
      document.getElementById('editor').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: at.left + 20, clientY: at.top + 6, bubbles: true, cancelable: true }));
      document.getElementById('probe-file').remove();
    });
    await win.waitForFunction(() => document.querySelector('#editor .link-file video'), null, { polling: 50, timeout: 8000 }).catch(() => {});
    const card = await win.evaluate(async () => {
      const c = document.querySelector('#editor .link-file');
      if (!c) return null;
      const v = c.querySelector('video');
      if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); v.addEventListener('error', r, { once: true }); setTimeout(r, 6000); });
      // Asked for from its middle: the player gets the piece it asks for.
      const seeked = await new Promise((r) => { v.addEventListener('seeked', () => r(true), { once: true }); setTimeout(() => r(false), 4000); try { v.currentTime = 0.3; } catch { r(false); } });
      return { src: v.getAttribute('src'), ready: v.readyState, w: v.videoWidth, h: v.videoHeight, controls: v.controls, seeked, error: v.error?.message ?? null,
        name: c.querySelector('.link-card__title').textContent, after: c.previousElementSibling?.id, editable: c.getAttribute('contenteditable') };
    });
    const video = /^nebula-media:\/\/note\/n-old\/(vid-[a-z0-9]+-[0-9a-f]{8}\.webm)$/.exec(card?.src ?? '')?.[1] ?? '';
    check('a video file dropped on the note stands after the line it was dropped on, under its own name', !!card && !!video && card.name === 'My clip.webm' && card.after === 'o1' && card.editable === 'false', JSON.stringify(card));
    check('its copy lies in the note’s folder, the same bytes', !!video && fs.existsSync(path.join(vault, 'n-old', video)) && fs.readFileSync(path.join(vault, 'n-old', video)).equals(fs.readFileSync(clip)) && fs.existsSync(clip));
    check('and the note plays it straight from there', !!card && card.ready >= 1 && card.w === 64 && card.h === 36 && card.controls && card.seeked && !card.error, JSON.stringify(card));
    check('the note’s file names the video; nothing of it is in the text', await until(() => stored('n-old').includes(`nebula-media://note/n-old/${video}`)) && stored('n-old').length < 6000, `${stored('n-old').length}`);

    // The player's own bar: on the screen, never in the note.
    const bar = await win.evaluate(async () => {
      const c = document.querySelector('#editor .link-file');
      const v = c.querySelector('video');
      const press = (name) => c.querySelector(`.video-bar [data-video="${name}"]`).click();
      const buttons = [...c.querySelectorAll('.video-bar [data-video]')].map((b) => b.dataset.video).join(',');
      press('speed');
      const speed = { rate: v.playbackRate, label: c.querySelector('[data-video="speed"]').textContent };
      v.currentTime = 0;
      press('on');
      await new Promise((r) => setTimeout(r, 150));
      const box = (e) => e.getBoundingClientRect();
      return { buttons, speed, now: c.querySelector('.video-now').textContent, at: v.currentTime, dur: v.duration,
        under: box(c.querySelector('.video-bar')).top >= box(v).bottom - 1 && box(c.querySelector('.link-card')).top >= box(c.querySelector('.video-bar')).bottom - 1 };
    });
    check('under the player stands a bar of its own: back, on, the speed, the whole screen — and the clock', bar.buttons === 'back,on,speed,full' && bar.under && /^\d:\d\d \/ 0:01$/.test(bar.now), JSON.stringify(bar));
    check('its buttons work: the speed steps on, ten seconds on stops at the end of a short video', bar.speed.rate === 1.25 && bar.speed.label === '1.25×' && Math.abs(bar.at - bar.dur) < 0.05, JSON.stringify(bar));
    await win.waitForTimeout(1200);
    check('the bar is the screen’s: nothing of it is in the stored note', !/video-bar|video-now|cannot-play/.test(stored('n-old')) && stored('n-old').includes(video));

    // An undo step keeps the player: it is not a new one, black until its file is read again.
    await win.evaluate(() => {
      document.querySelector('#editor .link-file video').__kept = true;
      const p = document.getElementById('o1');
      const r = document.createRange();
      r.selectNodeContents(p);
      r.collapse(false);
      document.getElementById('editor').focus();
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await win.keyboard.type(' typed after the video came');
    await win.waitForTimeout(700);
    await win.keyboard.press('Control+z');
    const kept = await win.evaluate(() => { const v = document.querySelector('#editor .link-file video'); return { same: v?.__kept === true, ready: v?.readyState ?? -1, bars: document.querySelectorAll('#editor .link-file .video-bar').length, text: document.getElementById('o1').textContent }; });
    check('Ctrl+Z on words typed after it leaves the video the very same player, its picture still there — no black second', kept.same && kept.ready >= 1 && kept.bars === 1 && !/typed after/.test(kept.text), JSON.stringify(kept));
    await win.keyboard.press('Control+y');
    await win.waitForTimeout(200);
    await win.keyboard.press('Escape');

    // Taken out of the note: the file waits for an undo, and goes at the next start.
    await win.evaluate(() => document.querySelector('#editor .link-file .link-del').click());
    check('taken out of the note, the video’s file stays while an undo could bring it back', await until(() => !stored('n-old').includes(video)) && fs.existsSync(path.join(vault, 'n-old', video)));
    await win.keyboard.press('Control+z');
    const back = await win.evaluate(async () => {
      const v = document.querySelector('#editor .link-file video');
      if (!v) return null;
      if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 5000); });
      return v.readyState;
    });
    check('Ctrl+Z brings the video back, playable', back >= 1 && await until(() => stored('n-old').includes(video)), String(back));
    // A backup made now holds the video: the note shows it.
    await win.evaluate(() => window.nebula.storage.backup('with-video'));
    const inCopy = (name) => fs.existsSync(path.join(backups, 'with-video', 'notes', 'n-old', name));
    const copyHadVideo = inCopy(video);
    await win.evaluate(() => document.querySelector('#editor .link-file .link-del').click());
    await until(() => !stored('n-old').includes(video));
    await win.waitForTimeout(300);

    // ---- The next start ------------------------------------------------------------
    await app.close();
    const before = { old: stored('n-old'), plain: stored('n-plain'), files: folder('n-old') };
    app = await launch();
    win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    win.on('pageerror', (e) => errors.push(e.message));
    await ready();
    check('at the next start the video nobody shows any more has left the folder, and so has the cropped picture that was undone; the note’s pictures stay', !fs.existsSync(path.join(vault, 'n-old', video)) && folder('n-old')?.length === 2 && before.files.length >= 3, `${before.files} -> ${folder('n-old')}`);
    check('and it has left the backup that held it — the pictures the note still shows stay there', copyHadVideo && !inCopy(video) && folder('n-old').every((name) => inCopy(name)),
      `${copyHadVideo} ${folder('n-old', path.join(backups, 'with-video', 'notes'))}`);
    check('and a vault already written this way is not written again', stored('n-old') === before.old && stored('n-plain') === before.plain,
      `old ${stored('n-old') === before.old} (${before.old.length} -> ${stored('n-old').length}) plain ${stored('n-plain') === before.plain}`);
    await open('Old way');
    const again = await win.evaluate(async () => Promise.all([...document.querySelectorAll('#editor .note-image img')].map(async (img) => { if (!img.complete) await img.decode().catch(() => {}); return `${img.naturalWidth}x${img.naturalHeight}`; })));
    check('both pictures are in the note again', again.sort().join() === '24x24,40x30', again.join());

    // ---- /video: a file chosen from the computer; and a note that travels with it ------
    {
      // A Matroska file: one of the kinds a note holds since "every kind of video file". The same pictures as the clip.
      const film = path.join(profile, 'Film.mkv');
      fs.copyFileSync(path.join(root, 'tests', 'fixtures', 'clip.webm'), film);
      // The system's own file windows are answered by the test.
      await app.evaluate(({ dialog }, chosen) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] }); }, film);
      await open('Plain');
      await win.evaluate(() => {
        const p = document.getElementById('pl');
        const r = document.createRange();
        r.selectNodeContents(p);
        r.collapse(false);
        document.getElementById('editor').focus();
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      });
      await win.keyboard.press('Enter');
      await win.keyboard.type('/video');
      await win.waitForTimeout(250);
      const offered = await win.evaluate(() => { const m = document.getElementById('slash-menu'); return m.hidden ? null : [...m.querySelectorAll('button')].map((b) => b.textContent); });
      await win.keyboard.press('Enter');
      await win.waitForFunction(() => document.querySelector('#editor .link-file video'), null, { polling: 50, timeout: 8000 }).catch(() => {});
      const picked = await win.evaluate(async () => {
        const c = document.querySelector('#editor .link-file');
        if (!c) return null;
        const v = c.querySelector('video');
        if (v.readyState < 1 && !v.error) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); v.addEventListener('error', r, { once: true }); setTimeout(r, 6000); });
        await new Promise((r) => setTimeout(r, 100));
        return { src: v.getAttribute('src'), name: c.querySelector('.link-card__title').textContent, ready: v.readyState, error: v.error?.code ?? 0, cannot: c.classList.contains('cannot-play'),
          miss: c.querySelector('.video-miss')?.textContent ?? '', outside: !!c.querySelector('[data-video="outside"]'), slash: document.getElementById('editor').textContent.includes('/video') };
      });
      const mkv = /^nebula-media:\/\/note\/n-plain\/(vid-[a-z0-9]+-[0-9a-f]{8}\.mkv)$/.exec(picked?.src ?? '')?.[1] ?? '';
      check('/video offers Video, asks for a file, and puts the chosen one into the note under its own name', offered?.[0] === 'Video' && !!mkv && picked.name === 'Film.mkv' && !picked.slash
        && fs.existsSync(path.join(vault, 'n-plain', mkv)) && fs.readFileSync(path.join(vault, 'n-plain', mkv)).equals(fs.readFileSync(film)), JSON.stringify({ offered, picked }));
      // Either it plays, or the card says plainly that it cannot and offers another program: never a black box and silence.
      check(`a Matroska file is held like any video — here it ${picked?.cannot ? 'cannot be played, and the card says so' : 'plays'}`,
        !!picked && ((picked.ready >= 1 && !picked.cannot && !picked.error) || (picked.cannot && /cannot be played here/.test(picked.miss) && picked.outside)), JSON.stringify(picked));
      await until(() => stored('n-plain').includes(mkv));

      // A kind the app's own player cannot play (an AVI, one second of the same test card, tests/fixtures/clip.avi):
      // it is held all the same, and its card says so instead of showing a black box.
      const old = path.join(profile, 'Old camera.avi');
      fs.copyFileSync(path.join(root, 'tests', 'fixtures', 'clip.avi'), old);
      await app.evaluate(({ dialog }, chosen) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] }); }, old);
      await win.keyboard.type('/video');
      await win.waitForTimeout(250);
      await win.keyboard.press('Enter');
      await win.waitForFunction(() => document.querySelectorAll('#editor .link-file video').length === 2, null, { polling: 50, timeout: 8000 }).catch(() => {});
      const avi = await win.evaluate(async () => {
        const c = [...document.querySelectorAll('#editor .link-file')].find((card) => card.dataset.name === 'Old camera.avi');
        if (!c) return null;
        const v = c.querySelector('video');
        if (v.readyState < 1 && !v.error) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); v.addEventListener('error', r, { once: true }); setTimeout(r, 6000); });
        await new Promise((r) => setTimeout(r, 150));
        return { src: v.getAttribute('src'), ready: v.readyState, error: v.error?.code ?? 0, cannot: c.classList.contains('cannot-play'), miss: c.querySelector('.video-miss')?.textContent ?? '',
          outside: c.querySelector('[data-video="outside"]')?.textContent ?? '', others: [...c.querySelectorAll('.video-bar [data-video]')].filter((b) => b.offsetWidth).map((b) => b.dataset.video).join(',') };
      });
      const aviFile = /^nebula-media:\/\/note\/n-plain\/(vid-[a-z0-9]+-[0-9a-f]{8}\.avi)$/.exec(avi?.src ?? '')?.[1] ?? '';
      check('an AVI is held too; the app’s player cannot play it, and its card says so and offers another program', !!aviFile && fs.existsSync(path.join(vault, 'n-plain', aviFile))
        && avi.cannot && avi.error >= 3 && avi.miss === 'This kind of video cannot be played here.' && avi.outside === 'Open in another program' && avi.others === 'outside', JSON.stringify(avi));
      await win.waitForTimeout(1200);
      check('that it cannot be played is the screen’s to know, not the note’s', !/cannot-play|video-miss|video-bar/.test(stored('n-plain')) && stored('n-plain').includes(aviFile));

      // Exported as a Nebula note: a kind of video that is not written into the file goes into a folder beside it.
      const out = path.join(profile, 'out');
      fs.mkdirSync(out);
      const target = path.join(out, 'Plain taken along.json');
      await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, target);
      await win.evaluate(() => document.querySelector('[data-menu="menu-export"]').click());
      await win.waitForTimeout(150);
      await win.evaluate(() => [...document.querySelectorAll('#menu-export button')].find((b) => /Nebula note/.test(b.textContent)).click());
      const beside = path.join(out, 'Plain taken along videos', mkv);
      check('exported as a Nebula note, the video lies in a folder beside the file, named after it — the same bytes', await until(() => fs.existsSync(target) && fs.existsSync(beside))
        && fs.readFileSync(beside).equals(fs.readFileSync(film)) && fs.readFileSync(target, 'utf8').includes(mkv) && fs.statSync(target).size < 4000, fs.existsSync(out) ? fs.readdirSync(out).join() : 'no folder');
      const said = await win.evaluate(() => document.getElementById('toast')?.textContent ?? '');
      check('and the app says where they are, and that the two belong together', /Plain taken along videos/.test(said) && /Keep the folder with the file/.test(said), said);

      // Brought in again — as on another computer: nothing of the first note is asked for.
      await app.evaluate(({ dialog }, chosen) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] }); }, target);
      const noteNames = () => fs.readdirSync(vault).filter((id) => fs.existsSync(path.join(vault, id, `${id}.json`)));
      const had = new Set(noteNames());
      await win.evaluate(() => document.querySelector('.tb[data-act="import"]').click());
      await win.waitForFunction(() => document.querySelector('#editor .link-file video') && document.querySelector('#title').value !== 'Plain', null, { polling: 50, timeout: 8000 }).catch(() => {});
      await win.keyboard.press('Control+s');
      let fresh = '';
      await until(() => { fresh = noteNames().find((id) => !had.has(id)) ?? ''; return !!fresh && stored(fresh).includes(`nebula-media://note/${fresh}/${mkv}`); });
      const home = await win.evaluate(() => document.querySelector('#editor .link-file video')?.getAttribute('src') ?? '');
      check('imported, the note is a new one with the video in a folder of its own — taken from the folder beside the file', !!fresh && fresh !== 'n-plain' && fs.existsSync(path.join(vault, fresh, mkv))
        && fs.readFileSync(path.join(vault, fresh, mkv)).equals(fs.readFileSync(film)) && stored(fresh).includes(`nebula-media://note/${fresh}/${mkv}`) && !stored(fresh).includes('n-plain'),
        `${fresh} ${home} ${fresh ? folder(fresh) : ''}`);
      await win.keyboard.press('Escape');
    }

    // ---- Deleted is deleted: the folder too, in every backup ------------------------
    const binFiles = folder('n-bin');
    const inBackups = () => fs.readdirSync(backups).flatMap((b) => ['n-bin.json', 'n-bin'].filter((n) => fs.existsSync(path.join(backups, b, 'notes', n))).map((n) => `${b}/${n}`));
    // And a copy still kept the old way — one brought in since the start: the note's file lying flat, its picture in its text.
    fs.mkdirSync(path.join(backups, '2026-01-02', 'notes'), { recursive: true });
    fs.writeFileSync(path.join(backups, '2026-01-02', 'notes', 'n-bin.json'), binText);
    check('a note with a picture has its folder, and the backups hold it both ways: in its folder, and as a file of the old kind', binFiles?.length === 1
      && inBackups().some((n) => n.endsWith('/n-bin.json')) && inBackups().some((n) => n.endsWith('/n-bin')), `${binFiles} ${inBackups()}`);
    // A backup made the new way holds the folder: one is made by hand, as tomorrow's will be.
    fs.cpSync(path.join(profile, 'storage'), path.join(backups, '2099-01-01'), { recursive: true });
    check('a backup of the vault as it is now holds the note’s folder', fs.existsSync(path.join(backups, '2099-01-01', 'notes', 'n-bin', binFiles[0])));
    await win.evaluate(() => {
      const row = [...document.querySelectorAll('.note-row')].find((r) => r.querySelector('.nr-title')?.textContent === 'Into the bin');
      row.parentElement.querySelector('.nr-more').click();
      document.querySelector('[data-note-act="trash"]').click();
    });
    await win.waitForTimeout(500);
    check('in the Trash the note keeps its folder', folder('n-bin')?.length === 1 && fs.existsSync(path.join(vault, 'n-bin', 'n-bin.json')));
    await win.evaluate(() => document.querySelector('.drawer-tab[data-drawer="trash"]').click());
    await win.waitForFunction(() => [...document.querySelectorAll('.drawer-item')].some((i) => i.textContent.includes('Into the bin')), null, { polling: 50 });
    await win.evaluate(() => {
      const item = [...document.querySelectorAll('.drawer-item')].find((i) => i.textContent.includes('Into the bin'));
      // Delete in the Trash asks first: the second press is the "Delete for good?" one.
      const btn = [...item.querySelectorAll('.drawer-actions button')].find((b) => b.textContent === 'Delete');
      btn.click(); btn.click();
    });
    check('deleted from the Trash, the note and its folder are gone from the vault', await until(() => !fs.existsSync(path.join(vault, 'n-bin.json')) && folder('n-bin') === null), `${folder('n-bin')}`);
    check('and from every backup, the one put aside before the change among them', await until(() => inBackups().length === 0), inBackups().join());
    check('the other notes keep their folders, in the vault and in the backup', folder('n-old')?.length === 2 && folder('n-old', path.join(backups, '2099-01-01', 'notes'))?.length === 2);

    // ---- A note that lost every picture at once is asked about before anything is deleted --------
    await app.close();
    const hadPictures = folder('n-old');
    const wholeNote = stored('n-old');
    // As a fault would leave it: the note written without its pictures.
    const emptied = JSON.parse(wholeNote);
    emptied.content = emptied.content.replace(/<figure[\s\S]*?<\/figure>/g, '');
    fs.writeFileSync(path.join(vault, 'n-old', 'n-old.json'), JSON.stringify(emptied, null, 2));
    const inFuture = () => folder('n-old', path.join(backups, '2099-01-01', 'notes'));
    const question = () => win.evaluate(() => {
      const o = document.getElementById('ov-held');
      return o ? { title: o.querySelector('.dlg-title')?.textContent, rows: [...o.querySelectorAll('.held-row')].map((r) => `${r.querySelector('.held-title').textContent}|${r.querySelector('.held-count').textContent}|${[...r.querySelectorAll('button')].map((b) => b.textContent).join(',')}`) } : null;
    });
    const start = async () => {
      app = await launch();
      win = await app.firstWindow();
      win.setDefaultTimeout(10_000);
      win.on('pageerror', (e) => errors.push(e.message));
      await ready();
      await until(async () => !!(await question()));
    };
    await start();
    check('a note whose file lost both its pictures behind the app’s back: at the start nothing is deleted — not in its folder, not in the backup — and the app asks',
      hadPictures.length === 2 && folder('n-old')?.length === 2 && inFuture()?.length === 2
      && JSON.stringify(await question()) === JSON.stringify({ title: 'Pictures no longer shown', rows: ['Old way|2 pictures and videos|Put back in the note,Delete,Open the note'] }),
      `${folder('n-old')} ${inFuture()} ${JSON.stringify(await question())}`);
    await win.evaluate(() => document.querySelector('#ov-held .held-open').click());
    check('“Open the note” opens it and deletes nothing', await until(async () => !(await question()) && (await win.evaluate(() => document.querySelector('#title').value)) === 'Old way')
      && folder('n-old')?.length === 2 && inFuture()?.length === 2, `${folder('n-old')} ${inFuture()}`);
    await app.close();
    await start();
    check('unanswered, it is asked again at the next start', (await question())?.rows.length === 1 && folder('n-old')?.length === 2);
    const warned = await win.evaluate(() => [...document.querySelectorAll('#ov-held .held-note')].map((p) => p.textContent).join(' '));
    await win.evaluate(() => {
      window.__toasts = [];
      window.addEventListener('nebula-toast', (e) => window.__toasts.push(String(e.detail)));
      document.querySelector('#ov-held .held-back').click();
    });
    await until(async () => !(await question()) && hadPictures.every((name) => stored('n-old').includes(name)));
    const backIn = await win.evaluate(async () => {
      const figures = [...document.querySelectorAll('#editor figure.note-image')];
      const sizes = await Promise.all(figures.map(async (f) => { const img = f.querySelector('img'); if (!img.complete) await img.decode().catch(() => {}); return `${img.naturalWidth}x${img.naturalHeight}`; }));
      return { title: document.querySelector('#title').value, sizes: sizes.sort().join(), atEnd: figures.every((f) => !f.nextElementSibling || f.nextElementSibling.matches('figure, p')) && !!document.querySelector('#editor').lastElementChild?.matches('p'), toasts: window.__toasts };
    });
    check('“Put back in the note” writes both pictures into the note again, at its end, and shows it — nothing is deleted',
      backIn.title === 'Old way' && backIn.sizes === '24x24,40x30' && backIn.atEnd && hadPictures.every((name) => stored('n-old').includes(name)) && folder('n-old')?.length === 2 && inFuture()?.length === 2,
      `${JSON.stringify(backIn)} ${folder('n-old')}`);
    check('and it says, before and after, that they stand at the end and have to be moved to where they were',
      /at the end of the note: you have to move them to where they were/.test(warned) && backIn.toasts.includes('Put back at the end of the note. Move them to where they were.'), `${warned} | ${backIn.toasts}`);
    await app.close();
    app = await launch();
    win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    win.on('pageerror', (e) => errors.push(e.message));
    await ready();
    await win.waitForTimeout(600);
    check('put back, the note is whole: the next start asks nothing and deletes nothing', !(await question()) && folder('n-old')?.length === 2 && hadPictures.every((name) => stored('n-old').includes(name)));
    // Lost again, and this time they were meant to go.
    await app.close();
    const lostAgain = JSON.parse(stored('n-old'));
    lostAgain.content = lostAgain.content.replace(/<figure[\s\S]*?<\/figure>/g, '');
    fs.writeFileSync(path.join(vault, 'n-old', 'n-old.json'), JSON.stringify(lostAgain, null, 2));
    await start();
    await win.evaluate(() => document.querySelector('#ov-held .held-delete').click());
    check('“Delete” takes them out of the note’s folder and out of the backup, and the question is gone',
      await until(async () => !(await question()) && folder('n-old')?.length === 0 && inFuture()?.length === 0), `${folder('n-old')} ${inFuture()} ${JSON.stringify(await question())}`);

    // ---- What the person takes out is gone for good, however much it is: no question ----------
    await app.close();
    const mine = [png(30, 20, 11), png(20, 30, 22), png(26, 26, 33), png(34, 18, 44), png(18, 34, 55)];
    const mineNames = mine.map((bytes, i) => `${String(i + 1).repeat(24)}.png`);
    mine.forEach((bytes, i) => fs.writeFileSync(path.join(vault, 'n-old', mineNames[i]), bytes));
    const five = JSON.parse(stored('n-old'));
    five.content += mineNames.map((name, i) => `<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" data-ratio="1" style="width: 60px;" id="mine${i}"><img src="nebula-media://note/n-old/${name}" alt="Pasted image" draggable="false"></figure>`).join('');
    fs.writeFileSync(path.join(vault, 'n-old', 'n-old.json'), JSON.stringify(five, null, 2));
    const plainStart = async () => {
      app = await launch();
      win = await app.firstWindow();
      win.setDefaultTimeout(10_000);
      win.on('pageerror', (e) => errors.push(e.message));
      await ready();
      await win.waitForTimeout(700);
    };
    await plainStart();
    await open('Old way');
    const shownFive = await win.evaluate(() => document.querySelectorAll('#editor figure.note-image').length);
    // Taken out in the app, all five at once, as a person would: selected and deleted, and the app closed.
    await win.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.querySelectorAll('figure.note-image').forEach((figure) => figure.remove());
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await until(() => mineNames.every((name) => !stored('n-old').includes(name)));
    const list = () => { try { return JSON.parse(fs.readFileSync(path.join(profile, 'storage', 'released.json'), 'utf8')).notes; } catch { return null; } };
    check('five pictures taken out of a note in the app: their files wait for the next start, written down as taken out by the person',
      shownFive === 5 && folder('n-old')?.length === 5 && (list()?.['n-old'] ?? []).length === 5, `${shownFive} ${folder('n-old')} ${JSON.stringify(list())}`);
    await app.close();
    await plainStart();
    check('at the next start they are gone, all five, and nothing is asked — what a person deletes does not come back',
      !(await question()) && folder('n-old')?.length === 0 && Object.keys(list() ?? { x: 1 }).length === 0, `${JSON.stringify(await question())} ${folder('n-old')} ${JSON.stringify(list())}`);

    check('no page errors in the note folder checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runNoteFolderChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
