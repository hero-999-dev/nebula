/**
 * 0.9.4 — part 8 of the owner's Ideas note, in the real app on a throwaway
 * profile: black holes, notes kept encrypted.
 *
 *   node tests/e2e/black-holes.mjs          (after npm run build)
 *
 * The keys are wrapped by the real operating system (safeStorage); Windows
 * Hello is played by the test (NEBULA_HELLO=ok), since nobody is there to lend
 * a finger. After each thing the reader does, the whole profile on the disk is
 * searched for the note's words.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A real picture, too noisy to be made small. */
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

export async function runBlackHoleChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-holes-'));
  const vault = path.join(profile, 'storage', 'notes');
  const holesDir = path.join(profile, 'storage', 'blackholes');
  const backups = path.join(profile, 'backups');
  fs.mkdirSync(vault, { recursive: true });
  const picture = png(40, 30, 21);
  const seed = (id, title, content) => fs.writeFileSync(path.join(vault, `${id}.json`), JSON.stringify({ id, title, content, createdAt: 1, updatedAt: 1 }, null, 2));
  seed('n-plain', 'Tax papers', `<p id="tp">the account number is 7700-1234</p><figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" style="width: 200px;"><img src="data:image/png;base64,${picture.toString('base64')}" alt=""></figure>`);
  seed('n-other', 'Shopping', '<p>milk and bread</p>');

  const everyFile = (dir = profile) => {
    let out = [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      // The browser's own caches and databases are not notes; the vault and the backups are everything a note is written to.
      if (e.isDirectory()) out = out.concat(everyFile(full)); else out.push(full);
    }
    return out;
  };
  /** Files under storage and backups that hold these words in the clear. */
  const whereReadable = (...words) => [path.join(profile, 'storage'), backups].flatMap((dir) => everyFile(dir)).filter((file) => {
    const text = fs.readFileSync(file).toString('latin1');
    return words.some((w) => text.includes(w) || text.includes(Buffer.from(w, 'utf8').toString('latin1')));
  }).map((f) => path.relative(profile, f).replace(/\\/g, '/'));
  const holeIds = () => { try { return fs.readdirSync(holesDir); } catch { return []; } };
  const sealed = (hole) => { try { return fs.readdirSync(path.join(holesDir, hole)).filter((f) => f.endsWith('.bh')); } catch { return []; } };

  const launch = () => electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile, NEBULA_HELLO: 'ok' } });
  let app;
  try {
    app = await launch();
    let win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    const watch = () => win.on('pageerror', (e) => errors.push(e.message));
    watch();
    const ready = async () => {
      await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
      await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 3000 }).catch(() => {});
      await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
      await win.waitForTimeout(300);
    };
    await ready();
    const until = async (what) => { for (let i = 0; i < 50; i += 1) { if (await what()) return true; await win.waitForTimeout(100); } return !!(await what()); };
    const list = () => win.evaluate(() => [...document.querySelectorAll('#note-list .hole-block')].map((b) => ({
      name: b.querySelector('.fr-name').textContent, open: b.classList.contains('open'), state: b.classList.contains('open') ? String(b.querySelectorAll('.hole-notes .note-row').length) : 'locked', lock: b.querySelector('.hole-lock')?.dataset.state,
      notes: [...b.querySelectorAll('.hole-notes .note-row')].map((r) => r.title),
    })));
    const outside = () => win.evaluate(() => [...document.querySelectorAll('#note-list > .note-item .note-row, #note-list > .folder-block:not(.hole-block) .note-row')].map((r) => r.title));
    const dialog = () => win.evaluate(() => { const o = document.getElementById('ov-hole'); return o.hidden ? null : { title: o.querySelector('.dlg-title')?.textContent, error: o.querySelector('.hole-error')?.textContent ?? '', key: o.querySelector('.hole-key')?.textContent ?? null }; });
    const press = (label, scope = '#ov-hole') => win.evaluate(({ label, scope }) => [...document.querySelectorAll(`${scope} button`)].find((b) => b.textContent.trim() === label)?.click(), { label, scope });
    const holeRow = (name) => win.evaluate((n) => [...document.querySelectorAll('#note-list .hole-row')].find((r) => r.title === n)?.click(), name);
    const holeMenu = async (name, item) => {
      await win.evaluate((n) => [...document.querySelectorAll('#note-list .hole-block')].find((b) => b.querySelector('.hole-row').title === n).querySelector('.hole-more').click(), name);
      const items = await win.evaluate(() => [...document.querySelectorAll('#hole-menu button')].map((b) => b.textContent));
      if (item) await press(item, '#hole-menu');
      else await win.keyboard.press('Escape');
      return items;
    };
    /** A note's ⋯ → its black-hole item → the entry asked for. */
    const noteHole = async (title, entry) => {
      await win.evaluate((t) => [...document.querySelectorAll('#note-list .note-item')].find((i) => i.querySelector('.note-row')?.title === t).querySelector('.nr-more').click(), title);
      const label = await win.evaluate(() => { const b = document.querySelector('#note-menu [data-note-act="hole"]'); return b.hidden ? null : b.textContent; });
      await win.evaluate(() => document.querySelector('#note-menu [data-note-act="hole"]').click());
      // The menu is there when it is there: straight after a build the app is slower, and a press at a fixed 100 ms met no menu.
      await win.waitForFunction((label) => [...document.querySelectorAll('#hole-menu button')].some((b) => b.textContent.trim() === label), entry, { polling: 50, timeout: 5000 }).catch(() => {});
      await press(entry, '#hole-menu');
      await win.waitForTimeout(150);
      return label;
    };
    /** The black hole's answer, asked in a dialog of its own: what it says, and a PIN typed into it. */
    const asked = () => win.evaluate(() => { const o = document.getElementById('ov-hole'); return o.hidden ? null : { title: o.querySelector('.dlg-title')?.textContent, note: o.querySelector('.hole-note')?.textContent ?? '', pin: !!o.querySelector('.hole-pin'), passkey: !!o.querySelector('[data-hole-passkey]'), error: o.querySelector('.hole-error')?.textContent ?? '' }; });
    const answer = async (pin) => {
      await win.waitForSelector('#ov-hole:not([hidden]) .hole-pin', { timeout: 5000 });
      await win.fill('#ov-hole .hole-pin', pin);
      await win.waitForTimeout(350);
    };
    const openNote = async (title) => {
      await win.evaluate((t) => [...document.querySelectorAll('#note-list .note-row')].find((r) => r.title === t)?.click(), title);
      await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
      await win.waitForTimeout(200);
    };

    // ---- A new black hole -------------------------------------------------------
    check('with no black hole there is no section for them, and the button stands beside New folder', (await list()).length === 0
      && await win.evaluate(() => { const b = document.getElementById('btn-new-hole'); return !!b && b.previousElementSibling?.id === 'btn-new-folder' && b.offsetWidth > 0; })
      && await win.evaluate(() => document.querySelector('#note-menu [data-note-act="hole"]').hidden));
    await win.evaluate(() => document.getElementById('btn-new-hole').click());
    check('“New black hole” asks for a name and a 6-digit PIN — always; a passkey is a box to tick beside it', (await dialog())?.title === 'New black hole'
      && await win.evaluate(() => { const o = document.getElementById('ov-hole'); const box = o.querySelector('#hole-passkey'); return !o.querySelector('.hole-choice') && o.querySelectorAll('.hole-pin').length === 2 && !o.querySelector('.hole-pins').hidden && !!box && !box.checked && !box.disabled && box.closest('label').textContent === 'Also open with a passkey'; }));
    await win.fill('#ov-hole .hole-name', 'Safe');
    await win.focus('#ov-hole .hole-pin[data-pin="new"]');
    await win.keyboard.type('48a2x1937');     // as a hand types it, a letter here and there, one digit too many
    check('a PIN takes digits only, six of them', await win.inputValue('#ov-hole .hole-pin[data-pin="new"]') === '482193');
    check('each of the two boxes says what goes in it: six digits, and the same once more',
      await win.evaluate(() => [...document.querySelectorAll('#ov-hole .hole-pins .hole-hint')].slice(0, 2).map((p) => p.textContent).join('|')) === 'Six digits.|The same PIN once more.'
      && await win.evaluate(() => { const [a, b] = document.querySelectorAll('#ov-hole .hole-pin'); return b.getBoundingClientRect().top > a.getBoundingClientRect().bottom; }));
    await win.fill('#ov-hole .hole-pin[data-pin="again"]', '482194');
    await press('Create');
    await win.waitForTimeout(150);
    check('two PINs that differ make nothing', /not the same/.test((await dialog())?.error ?? '') && holeIds().length === 0, JSON.stringify(await dialog()));
    await win.fill('#ov-hole .hole-pin[data-pin="again"]', '482193');
    // A hint, if one is wanted — and never one that tells the PIN.
    check('a hint may be kept with it, and the box says that anyone can read it', await win.evaluate(() => { const f = document.querySelector('#ov-hole .hole-hint-field'); return !!f && f.placeholder === 'Hint (optional)' && /Anyone can read it/.test(f.nextElementSibling?.textContent ?? ''); }));
    await win.fill('#ov-hole .hole-hint-field', 'it is 482193');
    await press('Create');
    await win.waitForTimeout(200);
    check('a hint that gives the PIN away makes nothing', /must not give the PIN away/.test((await dialog())?.error ?? '') && holeIds().length === 0, JSON.stringify(await dialog()));
    await win.fill('#ov-hole .hole-hint-field', 'the year we moved, twice');
    await press('Create');
    await win.waitForFunction(() => document.querySelector('#ov-hole .hole-key'), null, { polling: 50, timeout: 8000 });
    const recoveryKey = (await dialog()).key;
    check('made, it shows a recovery key — once — and keeps asking until it is written down', /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/.test(recoveryKey ?? '') && (await dialog()).title === 'Recovery key', String(recoveryKey));
    await win.keyboard.press('Escape');
    check('Escape does not put the recovery key away', !!(await dialog())?.key);
    await press('I have written it down');
    const [safe] = holeIds();
    let shown = await list();
    check('the black hole stands under the notes, open and empty', shown.length === 1 && shown[0].name === 'Safe' && shown[0].open && shown[0].state === '0' && !(await dialog()), JSON.stringify(shown));
    check('its row has no counter; the lock stands at its left, open, and the three dots at its right',
      await win.evaluate(() => {
        const head = document.querySelector('#note-list .hole-item');
        const [lock, row, more] = head.children;
        const box = (e) => e.getBoundingClientRect();
        return lock.matches('.hole-lock[data-state="open"]') && row.matches('.hole-row') && more.matches('.hole-more') && !head.querySelector('.fr-count, .hole-state')
          && box(lock).right <= box(row).left + 1 && box(lock).right < box(more).left && box(lock).width > 10;
      }));
    // The arrow beside "Black holes" folds the whole section, and it stays folded.
    await win.evaluate(() => document.querySelector('#note-list .holes-head').click());
    await win.waitForTimeout(120);
    const folded = await win.evaluate(() => ({ blocks: document.querySelectorAll('#note-list .hole-block').length, head: document.querySelector('#note-list .holes-head')?.getAttribute('aria-expanded'), kept: localStorage.getItem('nebula:holes-folded') }));
    await win.evaluate(() => document.querySelector('#note-list .holes-head').click());
    await win.waitForTimeout(120);
    check('the arrow beside the heading folds the black holes away and brings them back, open as they were', folded.blocks === 0 && folded.head === 'false' && folded.kept === '1'
      && (await list())[0]?.open === true && await win.evaluate(() => document.querySelector('#note-list .holes-head').getAttribute('aria-expanded')) === 'true', JSON.stringify(folded));
    const meta = JSON.parse(fs.readFileSync(path.join(holesDir, safe, 'hole.json'), 'utf8'));
    check('on the disk it is a folder of its own, its key wrapped by the PIN and by the operating system — neither PIN nor recovery key in it',
      meta.lock === 'pin' && meta.cipher === 'aes-256-gcm' && meta.kdf.name === 'scrypt' && meta.key.os === true && !!meta.key.salt && !!meta.recovery.box
      && whereReadable('482193', recoveryKey, recoveryKey.replace(/-/g, '')).length === 0, JSON.stringify({ ...meta, key: '…', recovery: '…' }));

    // ---- A note written in it -----------------------------------------------------
    await win.evaluate(() => document.querySelector('#note-list .hole-add').click());
    await win.waitForTimeout(250);
    await win.keyboard.type('Launch plan');
    await win.keyboard.press('Tab');
    await win.evaluate(() => document.getElementById('editor').focus());
    await win.keyboard.type('the door code is 9911-ZEBRA');
    check('a note made in the black hole is sealed there: one .bh file, and no file of the vault or the backups holds its title or its words',
      await until(() => sealed(safe).length === 1) && await until(() => whereReadable('Launch plan', '9911-ZEBRA').length === 0), `${sealed(safe)} ${whereReadable('Launch plan', '9911-ZEBRA')}`);
    const secretId = sealed(safe)[0].slice(0, -3);
    check('it is not in the notes folder, and not among the notes of the list', !fs.existsSync(path.join(vault, `${secretId}.json`)) && !fs.existsSync(path.join(vault, secretId))
      && await until(async () => (await list())[0].notes.join() === 'Launch plan') && !(await outside()).includes('Launch plan'), JSON.stringify({ outside: await outside(), list: await list() }));

    // ---- A note moved in: its plain file leaves the vault and the backups ----------
    const plainMedia = fs.readdirSync(path.join(vault, 'n-plain')).filter((f) => f !== 'n-plain.json');
    check('before: the plain note is a file in the vault, its picture a file in its folder, and today’s backup has it', fs.existsSync(path.join(vault, 'n-plain', 'n-plain.json')) && plainMedia.length === 1
      && whereReadable('7700-1234').some((f) => f.startsWith('backups/')), `${plainMedia} ${whereReadable('7700-1234')}`);
    const label = await noteHole('Tax papers', 'Safe');
    check('a note’s menu offers “Move into a black hole”', label === 'Move into a black hole', String(label));
    check('moved in, it is sealed — and gone in the clear from the vault, its folder, and every backup',
      await until(() => sealed(safe).length === 2 && !fs.existsSync(path.join(vault, 'n-plain.json')) && !fs.existsSync(path.join(vault, 'n-plain')) && whereReadable('7700-1234', 'Tax papers').length === 0),
      `${sealed(safe)} ${whereReadable('7700-1234', 'Tax papers')} ${fs.existsSync(path.join(vault, 'n-plain'))}`);
    const pngBytes = picture.toString('latin1');
    check('its picture is nowhere on the disk as a picture', everyFile(path.join(profile, 'storage')).concat(everyFile(backups)).every((f) => !fs.readFileSync(f).toString('latin1').includes(pngBytes.slice(40, 200))));
    check('it is listed in the black hole now', (await list())[0].notes.slice().sort().join() === 'Launch plan,Tax papers' && !(await outside()).includes('Tax papers'), JSON.stringify(await list()));

    // ---- Locked ----------------------------------------------------------------------
    await openNote('Launch plan');
    await win.evaluate(() => document.querySelector('#note-list .hole-lock').click());
    await win.waitForTimeout(500);
    shown = await list();
    const afterLock = await win.evaluate(() => ({ title: document.getElementById('title').value, page: document.body.innerText }));
    check('“Lock” closes it: a name and “locked”, none of its notes on the page, another note in the editor',
      shown[0].state === 'locked' && shown[0].lock === 'locked' && !shown[0].open && shown[0].notes.length === 0 && !/Launch plan|9911-ZEBRA|Tax papers|7700-1234/.test(afterLock.page) && afterLock.title !== 'Launch plan',
      JSON.stringify({ shown, title: afterLock.title }));
    check('and its files are still there, sealed', sealed(safe).length === 2 && whereReadable('Launch plan', '9911-ZEBRA', '7700-1234').length === 0);

    // ---- The PIN -----------------------------------------------------------------------
    await holeRow('Safe');
    check('a click on a locked black hole asks for its PIN', (await dialog())?.title === 'Open “Safe”' && await win.evaluate(() => document.activeElement?.classList.contains('hole-pin')));
    check('and shows the hint kept with it, under the PIN', await win.evaluate(() => document.querySelector('#ov-hole .hole-reminder')?.textContent) === 'Hint: the year we moved, twice'
      && JSON.parse(fs.readFileSync(path.join(holesDir, safe, 'hole.json'), 'utf8')).hint === 'the year we moved, twice');
    await win.fill('#ov-hole .hole-pin', '000000');
    await win.waitForTimeout(700);
    check('a wrong PIN opens nothing and says how many tries are left', /^Wrong\. 4 more tries/.test((await dialog())?.error ?? '') && (await list())[0].state === 'locked', JSON.stringify(await dialog()));
    await win.fill('#ov-hole .hole-pin', '482193');
    check('the last digit of the right PIN opens it, with its notes', await until(async () => (await list())[0]?.open) && !(await dialog())
      && (await list())[0].notes.slice().sort().join() === 'Launch plan,Tax papers', JSON.stringify(await list()));
    await openNote('Launch plan');
    check('a note of it reads as it was written', await win.evaluate(() => document.getElementById('editor').textContent.includes('the door code is 9911-ZEBRA')));
    await openNote('Tax papers');
    const pic = await win.evaluate(async () => { const img = document.querySelector('#editor .note-image img'); if (!img.complete) await img.decode().catch(() => {}); return { w: img.naturalWidth, data: img.getAttribute('src').startsWith('data:image/png') }; });
    check('and the moved note has its picture, from inside the seal', pic.w === 40 && pic.data, JSON.stringify(pic));

    // ---- A video file in a black hole (the owner: "why can a video not go in?") -------
    const clipBytes = fs.readFileSync(path.join(root, 'tests', 'fixtures', 'clip.webm'));
    const clip = path.join(profile, 'Clip.webm');
    fs.writeFileSync(clip, clipBytes);
    const clipInClear = () => [path.join(profile, 'storage'), backups].flatMap((d) => everyFile(d)).filter((f) => fs.readFileSync(f).includes(clipBytes.subarray(300, 400))).map((f) => path.relative(profile, f).replace(/\\/g, '/'));
    const player = () => win.evaluate(async () => {
      const v = document.querySelector('#editor .link-file video');
      if (!v) return null;
      if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); v.addEventListener('error', r, { once: true }); setTimeout(r, 6000); });
      const seeked = await new Promise((r) => { v.addEventListener('seeked', () => r(true), { once: true }); setTimeout(() => r(false), 4000); try { v.currentTime = 0.4; } catch { r(false); } });
      return { src: v.getAttribute('src'), ready: v.readyState, w: v.videoWidth, seeked, name: v.closest('.link-file').querySelector('.link-card__title').textContent };
    });
    await openNote('Launch plan');
    await win.evaluate(() => { const i = document.createElement('input'); i.type = 'file'; i.id = 'probe-file'; i.style.display = 'none'; document.body.append(i); });
    await win.setInputFiles('#probe-file', clip);
    await win.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(document.getElementById('probe-file').files[0]);
      const at = document.getElementById('editor').getBoundingClientRect();
      document.getElementById('editor').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: at.left + 40, clientY: at.top + 30, bubbles: true, cancelable: true }));
      document.getElementById('probe-file').remove();
    });
    await win.waitForFunction(() => document.querySelector('#editor .link-file video'), null, { polling: 50, timeout: 8000 }).catch(() => {});
    let film = await player();
    const vid = new RegExp(`^nebula-media://hole/${safe}/${secretId}/(vid-[a-z0-9]+-[0-9a-f]{8}\\.webm)$`).exec(film?.src ?? '')?.[1] ?? '';
    const sealedVideo = () => path.join(holesDir, safe, `${secretId}~${vid}.bhv`);
    check('a video file dropped on a note in a black hole is sealed beside the note, and plays from there', !!vid && film.ready >= 1 && film.w === 64 && film.seeked && film.name === 'Clip.webm'
      && fs.existsSync(sealedVideo()), JSON.stringify(film));
    check('nothing of the video is on the disk in the clear — not in the notes folder, not in a backup', clipInClear().length === 0 && !fs.existsSync(path.join(vault, secretId))
      && fs.readFileSync(sealedVideo()).subarray(0, 4).toString() === 'NBV1', clipInClear().join());
    await win.waitForTimeout(700);                    // the note itself is saved with the video's address
    await win.evaluate(() => document.querySelector('#note-list .hole-lock').click());
    await until(async () => (await list())[0]?.state === 'locked');
    await holeRow('Safe');
    await win.fill('#ov-hole .hole-pin', '482193');
    await until(async () => (await list())[0]?.open);
    await openNote('Launch plan');
    film = await player();
    check('locked and opened again, the video is still there and plays', film?.ready >= 1 && film.w === 64 && fs.existsSync(sealedVideo()), JSON.stringify(film));
    await noteHole('Launch plan', 'Take out of the black hole');
    await win.waitForSelector('#ov-hole:not([hidden]) .hole-pin', { timeout: 5000 });
    const takeOut = await asked();
    check('taking a note out of a black hole asks for the black hole’s PIN first, and says what it means', takeOut?.title === 'Take out of the black hole' && takeOut.pin && !takeOut.passkey
      && takeOut.note === 'The note leaves “Safe” and is kept as an ordinary note again, not encrypted.' && sealed(safe).length === 2, JSON.stringify(takeOut));
    await answer('000000');
    check('a wrong PIN takes nothing out: the note and its video stay sealed', /^Wrong\./.test((await asked())?.error ?? '') && sealed(safe).length === 2 && fs.existsSync(sealedVideo()) && !fs.existsSync(path.join(vault, secretId)), JSON.stringify(await asked()));
    await answer('482193');
    check('the note taken out, its video is a plain file in the note’s own folder again — the same bytes — and the sealed one is gone',
      await until(() => fs.existsSync(path.join(vault, secretId, vid)) && fs.readFileSync(path.join(vault, secretId, vid)).equals(clipBytes) && !fs.existsSync(sealedVideo()) && sealed(safe).length === 1),
      `${fs.existsSync(path.join(vault, secretId, vid))} ${fs.existsSync(sealedVideo())} ${sealed(safe)}`);
    film = await player();
    check('and it plays there', film?.src === `nebula-media://note/${secretId}/${vid}` && film.ready >= 1, JSON.stringify(film));
    await noteHole('Launch plan', 'Safe');
    check('moved in again, note and video are sealed and gone from the notes folder', await until(() => fs.existsSync(sealedVideo()) && sealed(safe).length === 2 && !fs.existsSync(path.join(vault, secretId))
      && !fs.existsSync(path.join(vault, `${secretId}.json`)) && !fs.existsSync(path.join(vault, secretId)) && clipInClear().length === 0) && whereReadable('Launch plan', '9911-ZEBRA').length === 0, `${clipInClear()} ${whereReadable('Launch plan', '9911-ZEBRA')}`);
    film = await player();
    check('and the open note shows the sealed one', new RegExp(`^nebula-media://hole/${safe}/${secretId}/`).test(film?.src ?? '') && film.ready >= 1, JSON.stringify(film));
    await win.waitForTimeout(500);

    // ---- A restart: locked, and the same PIN opens it --------------------------------
    await app.close();
    app = await launch();
    win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    watch();
    await ready();
    check('after a restart every black hole is locked', await until(async () => (await list())[0]?.state === 'locked') && !(await outside()).includes('Launch plan'), JSON.stringify(await list()));
    await holeRow('Safe');
    await win.fill('#ov-hole .hole-pin', '482193');
    check('and opens with its PIN', await until(async () => (await list())[0]?.open));

    // ---- Taken out again -------------------------------------------------------------
    // Dragged up among the notes, as it was dragged in: the same question, and given up it stays where it is.
    const dragOut = () => win.evaluate(() => {
      const row = [...document.querySelectorAll('#note-list .hole-notes .note-row')].find((r) => r.title === 'Tax papers');
      const target = [...document.querySelectorAll('#note-list > .note-item')].find((i) => i.querySelector('.note-row')?.title === 'Shopping');
      const dt = new DataTransfer();
      const at = target.getBoundingClientRect();
      const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX: at.left + 30, clientY: at.top + 4, bubbles: true, cancelable: true }));
      const draggable = row.draggable;
      fire(row, 'dragstart');
      fire(target, 'dragover');
      fire(target, 'drop');
      fire(row, 'dragend');
      return { draggable, carried: dt.getData('application/x-nebula-item') };
    });
    const dragged = await dragOut();
    await win.waitForSelector('#ov-hole:not([hidden]) .hole-pin', { timeout: 5000 });
    check('a note of an open black hole can be dragged up among the notes — and that asks for the PIN too', dragged.draggable && dragged.carried === 'note:n-plain' && (await asked())?.title === 'Take out of the black hole' && sealed(safe).length === 2, JSON.stringify({ dragged, asked: await asked() }));
    await press('Cancel');
    await win.waitForTimeout(300);
    check('given up, the note stays in its black hole', !(await dialog()) && sealed(safe).length === 2 && !(await outside()).includes('Tax papers') && (await list())[0].notes.includes('Tax papers'), JSON.stringify(await list()));
    await dragOut();
    await answer('482193');
    check('with the PIN it leaves the black hole and stands where it was let go: over the note it was dropped on',
      await until(() => fs.existsSync(path.join(vault, 'n-plain', 'n-plain.json')) && sealed(safe).length === 1) && (await outside()).indexOf('Tax papers') >= 0 && (await outside()).indexOf('Tax papers') === (await outside()).indexOf('Shopping') - 1,
      `${sealed(safe)} ${(await outside()).join('|')}`);
    await noteHole('Tax papers', 'Safe');
    await until(() => sealed(safe).length === 2);

    const out = await noteHole('Tax papers', 'Take out of the black hole');
    await answer('482193');
    check('a note in a black hole can be taken out: a plain note again, with its folder, and its sealed file gone', out === 'Black hole…'
      && await until(() => fs.existsSync(path.join(vault, 'n-plain', 'n-plain.json')) && fs.readdirSync(path.join(vault, 'n-plain')).length === 2 && sealed(safe).length === 1)
      && (await outside()).includes('Tax papers'), `${out} ${sealed(safe)}`);

    // ---- The recovery key, and a new PIN ------------------------------------------------
    await win.evaluate(() => document.querySelector('#note-list .hole-lock').click());
    await until(async () => (await list())[0]?.state === 'locked');
    await holeRow('Safe');
    await press('Use the recovery key');
    await win.fill('#ov-hole .hole-recovery', 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA');
    await win.fill('#ov-hole .hole-pin', '135790');
    await press('Open');
    await win.waitForTimeout(600);
    check('a wrong recovery key opens nothing', (await list())[0].state === 'locked' && /Wrong/.test((await dialog())?.error ?? ''), JSON.stringify(await dialog()));
    await win.fill('#ov-hole .hole-recovery', recoveryKey.toLowerCase());
    await press('Open');
    check('the recovery key opens it, with a new PIN', await until(async () => (await list())[0]?.open));
    await win.evaluate(() => document.querySelector('#note-list .hole-lock').click());
    await until(async () => (await list())[0]?.state === 'locked');
    await holeRow('Safe');
    await win.fill('#ov-hole .hole-pin', '482193');
    await win.waitForTimeout(700);
    const old = (await list())[0].state;
    await win.fill('#ov-hole .hole-pin', '135790');
    check('from then on the new PIN is the key, and the old one is not', old === 'locked' && await until(async () => (await list())[0]?.open));
    check('the menu of an open black hole: Lock, Rename, Change PIN, the hint, Add a passkey, Move to trash', (await holeMenu('Safe')).join('|') === 'Lock|Rename black hole|Change PIN|Change hint|Add a passkey|Move to trash');
    await holeMenu('Safe', 'Add a passkey');
    const safeMeta = () => JSON.parse(fs.readFileSync(path.join(holesDir, safe, 'hole.json'), 'utf8'));
    // The passkey is on the disk before the list the menu is made from has heard of it (smoke under load, 0.9.5 and 0.9.6): the menu is waited for too.
    check('a passkey is added beside the PIN of an open black hole — and taken away again from the same menu', await until(() => !!safeMeta().passkey?.box) && safeMeta().lock === 'pin'
      && await until(async () => (await holeMenu('Safe')).join('|') === 'Lock|Rename black hole|Change PIN|Change hint|Remove the passkey|Move to trash'), JSON.stringify(Object.keys(safeMeta())));
    await holeMenu('Safe', 'Remove the passkey');
    await until(() => !safeMeta().passkey);

    // ---- A passkey beside the PIN (Windows Hello) ------------------------------------------------
    await win.evaluate(() => document.getElementById('btn-new-hole').click());
    await win.fill('#ov-hole .hole-name', 'Finger');
    await press('Create');
    await win.waitForTimeout(200);
    check('ticking nothing and typing no PIN makes no black hole: the PIN is the lock', (await dialog())?.error === 'A PIN is six digits.' && holeIds().length === 1, JSON.stringify(await dialog()));
    await win.fill('#ov-hole .hole-pin[data-pin="new"]', '246810');
    await win.fill('#ov-hole .hole-pin[data-pin="again"]', '246810');
    await win.check('#hole-passkey');
    await press('Create');
    await win.waitForFunction(() => document.querySelector('#ov-hole .hole-key'), null, { polling: 50, timeout: 8000 });
    await press('I have written it down');
    const finger = holeIds().find((id) => id !== safe);
    const fmeta = JSON.parse(fs.readFileSync(path.join(holesDir, finger, 'hole.json'), 'utf8'));
    check('with the box ticked the black hole has its PIN and, beside it, a passkey: a second copy of its key that the operating system hands over', fmeta.lock === 'pin' && !!fmeta.key.salt && !!fmeta.passkey?.box && fmeta.digits === 6
      && (await list()).map((h) => `${h.name}:${h.open}`).join() === 'Safe:true,Finger:true', JSON.stringify(await list()));
    await win.evaluate(() => [...document.querySelectorAll('#note-list .hole-block')].find((b) => b.querySelector('.hole-row').title === 'Finger').querySelector('.hole-lock').click());
    await until(async () => (await list())[1]?.state === 'locked');
    await holeRow('Finger');
    await win.waitForSelector('#ov-hole:not([hidden]) [data-hole-passkey]', { timeout: 5000 });
    await win.waitForTimeout(900);
    const door = await asked();
    check('locked, a click shows the PIN’s box and a button for the passkey — and asks the passkey for nothing by itself', door?.pin && door.passkey && door.error === '' && (await list())[1]?.state === 'locked', JSON.stringify(door));
    await press('Use the passkey');
    check('a press on the button, and its yes, opens it — no PIN typed', await until(async () => (await list())[1]?.open) && !(await dialog()), JSON.stringify(await list()));
    await win.evaluate(() => [...document.querySelectorAll('#note-list .hole-block')].find((b) => b.querySelector('.hole-row').title === 'Finger').querySelector('.hole-lock').click());
    await until(async () => (await list())[1]?.state === 'locked');
    await holeRow('Finger');
    await answer('246810');
    check('and its PIN opens it all the same: whichever is liked', await until(async () => (await list())[1]?.open), JSON.stringify(await list()));

    // ---- Deleted: gone, from the backups too ---------------------------------------------
    fs.cpSync(path.join(profile, 'storage'), path.join(backups, '2099-01-01'), { recursive: true });
    check('a backup holds the black hole as it is on the disk: sealed', fs.existsSync(path.join(backups, '2099-01-01', 'blackholes', safe, `${secretId}.bh`)) && whereReadable('Launch plan', '9911-ZEBRA').length === 0);
    await win.evaluate((t) => [...document.querySelectorAll('#note-list .note-item')].find((i) => i.querySelector('.note-row')?.title === t).querySelector('.nr-more').click(), 'Launch plan');
    await win.evaluate(() => document.querySelector('#note-menu [data-note-act="trash"]').click());
    await win.waitForTimeout(300);
    await win.evaluate(() => document.querySelector('.drawer-tab[data-drawer="trash"]').click());
    await win.waitForFunction(() => [...document.querySelectorAll('.drawer-item')].some((i) => i.textContent.includes('Launch plan')), null, { polling: 50 });
    check('in the Trash a note of a black hole is still sealed in it', sealed(safe).length === 1);
    await win.evaluate(() => { const item = [...document.querySelectorAll('.drawer-item')].find((i) => i.textContent.includes('Launch plan')); [...item.querySelectorAll('.drawer-actions button')].find((b) => b.textContent === 'Delete').click(); });
    check('deleted from the Trash, its sealed file is gone from the black hole and from the backup — its video too', await until(() => sealed(safe).length === 0 && !fs.existsSync(path.join(backups, '2099-01-01', 'blackholes', safe, `${secretId}.bh`))
      && fs.readdirSync(path.join(holesDir, safe)).join() === 'hole.json' && fs.readdirSync(path.join(backups, '2099-01-01', 'blackholes', safe)).join() === 'hole.json'),
      `${fs.readdirSync(path.join(holesDir, safe))} / ${fs.readdirSync(path.join(backups, '2099-01-01', 'blackholes', safe))}`);
    await win.evaluate(() => document.querySelector('.drawer-tab[data-drawer="trash"]').click());
    // ---- A black hole goes to the Trash whole, and is restored or deleted there -------------
    await win.evaluate(() => [...document.querySelectorAll('#note-list .hole-block')].find((b) => b.querySelector('.hole-row').title === 'Finger').querySelector('.hole-add').click());
    await win.waitForTimeout(250);
    await win.keyboard.type('Finger note');
    await win.keyboard.press('Tab');
    await win.evaluate(() => document.getElementById('editor').focus());
    await win.keyboard.type('kept under the thumb 4417-OKAPI');
    await until(() => sealed(finger).length === 1);
    const fingerNote = sealed(finger)[0];
    const sealedBytes = () => fs.readFileSync(path.join(holesDir, finger, fingerNote));
    const holeMeta = () => JSON.parse(fs.readFileSync(path.join(holesDir, finger, 'hole.json'), 'utf8'));
    const inTrash = () => win.evaluate(() => [...document.querySelectorAll('#drawer-body .drawer-hole')].map((i) => ({
      name: i.querySelector('.nr-title').textContent, meta: i.querySelector('.nr-meta').textContent, buttons: [...i.querySelectorAll('.drawer-actions button')].map((x) => x.textContent),
    })));
    const trashButton = (label) => win.evaluate((l) => [...document.querySelectorAll('#drawer-body .drawer-hole .drawer-actions button')].find((x) => x.textContent === l)?.click(), label);
    fs.cpSync(path.join(holesDir, finger), path.join(backups, '2099-01-01', 'blackholes', finger), { recursive: true });

    await holeMenu('Finger', 'Move to trash');
    check('moved to the Trash from its menu — no question asked — an open black hole is locked and leaves its section, its note out of the window',
      await until(async () => (await list()).map((h) => h.name).join() === 'Safe') && !(await win.evaluate(() => document.body.textContent.includes('4417-OKAPI'))), JSON.stringify(await list()));
    const before = sealedBytes();
    check('on the disk nothing of it changes but the day it went: its note still sealed, in the backup too',
      holeMeta().trashedAt > 0 && sealed(finger).join() === fingerNote && fs.existsSync(path.join(backups, '2099-01-01', 'blackholes', finger, fingerNote)) && whereReadable('Finger note', '4417-OKAPI').length === 0,
      `${JSON.stringify(holeMeta().trashedAt)} ${sealed(finger)} ${whereReadable('Finger note', '4417-OKAPI')}`);
    check('a note cannot be sent into it any more: it is not among the black holes a note’s menu offers', !(await win.evaluate(() => {
      const row = document.querySelector('#note-list > .note-item .nr-more');
      row?.click();
      const hole = document.querySelector('#note-menu [data-note-act="hole"]');
      hole?.click();
      const names = [...document.querySelectorAll('#hole-menu button')].map((x) => x.textContent);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return names.includes('Finger');
    })));
    await win.keyboard.press('Escape');
    await win.evaluate(() => { const tab = document.querySelector('.drawer-tab[data-drawer="trash"]'); if (tab.getAttribute('aria-expanded') !== 'true') tab.click(); });
    await until(async () => (await inTrash()).length === 1);
    check('in the Trash it is one row: its name, that it is a black hole and how many notes it holds — and Restore and Delete',
      JSON.stringify(await inTrash()) === JSON.stringify([{ name: 'Finger', meta: 'Black hole · 1 note', buttons: ['Restore', 'Delete'] }]), JSON.stringify(await inTrash()));

    await trashButton('Restore');
    check('restored, it is back in its section, locked, and gone from the Trash',
      await until(async () => (await list()).map((h) => `${h.name}:${h.state}`).join() === 'Safe:0,Finger:locked' || (await list())[1]?.state === 'locked') && (await inTrash()).length === 0 && !('trashedAt' in holeMeta()),
      `${JSON.stringify(await list())} ${JSON.stringify(await inTrash())}`);
    await holeRow('Finger');
    await win.waitForSelector('#ov-hole:not([hidden]) [data-hole-passkey]', { timeout: 5000 });
    await press('Use the passkey');
    check('and it opens as before, with the note it held — the very file', await until(async () => (await list())[1]?.notes?.join() === 'Finger note') && sealedBytes().equals(before), JSON.stringify(await list()));

    await holeMenu('Finger', 'Move to trash');
    await until(async () => (await inTrash()).length === 1);
    await trashButton('Delete');
    await win.waitForTimeout(300);
    check('Delete on a black hole that holds notes asks once more, and nothing is gone yet',
      (await inTrash())[0]?.buttons.join() === 'Restore,Delete for good?' && sealed(finger).join() === fingerNote, JSON.stringify(await inTrash()));
    await trashButton('Delete for good?');
    await win.waitForSelector('#ov-hole:not([hidden]) .hole-pin', { timeout: 5000 });
    const deleting = await asked();
    check('deleting a black hole asks for its password: its PIN, or its passkey at a press — and says nothing brings it back', deleting?.title === 'Delete the black hole' && deleting.pin && deleting.passkey
      && deleting.note === '“Finger” and every note in it are deleted for good. Nothing brings them back.' && sealed(finger).join() === fingerNote, JSON.stringify(deleting));
    await answer('000000');
    check('a wrong PIN deletes nothing: the black hole is still in the Trash, its note still sealed, in the backup too', /^Wrong\./.test((await asked())?.error ?? '') && sealed(finger).join() === fingerNote
      && fs.existsSync(path.join(backups, '2099-01-01', 'blackholes', finger, fingerNote)), JSON.stringify(await asked()));
    await press('Cancel');
    await win.waitForTimeout(300);
    check('given up, it stays in the Trash', (await inTrash()).length === 1 && fs.existsSync(path.join(holesDir, finger)), JSON.stringify(await inTrash()));
    await trashButton('Delete for good?');
    await trashButton('Delete');
    await win.waitForTimeout(200);
    await trashButton('Delete for good?');
    await answer('246810');
    check('deleted from the Trash it is gone for good: from the Trash, the list, the disk and the backup',
      await until(async () => (await inTrash()).length === 0 && (await list()).length === 1 && !fs.existsSync(path.join(holesDir, finger)) && !fs.existsSync(path.join(backups, '2099-01-01', 'blackholes', finger))),
      `${JSON.stringify(await inTrash())} ${JSON.stringify(await list())} ${fs.existsSync(path.join(holesDir, finger))}`);
    await win.evaluate(() => { const tab = document.querySelector('.drawer-tab[data-drawer="trash"]'); if (tab.getAttribute('aria-expanded') === 'true') tab.click(); });

    // ---- Left alone, it locks itself -------------------------------------------------------
    await win.evaluate(() => localStorage.setItem('nebula:holes-idle-minutes', '0.03'));
    await win.reload();
    await ready();
    await holeRow('Safe');
    await win.fill('#ov-hole .hole-pin', '135790');
    await until(async () => (await list())[0]?.open);
    await win.waitForTimeout(2600);
    check('a black hole nobody touches locks itself', (await list())[0].state === 'locked', JSON.stringify(await list()));

    check('no page errors in the black hole checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a handle still open */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runBlackHoleChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
