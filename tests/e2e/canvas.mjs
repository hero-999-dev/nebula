/**
 * Shapes and floating images on one canvas (0.8.8), driven with the real
 * pointer and keys, and kept across a restart.
 *
 * The owner asked for images and shapes on the same layer so they can be
 * moved over and under each other, and called this part "very buggy — it
 * needs a lot of testing". So this goes through every way the two meet:
 * an old note's image layer migrating on open, stacking order both ways,
 * dragging one over the other, sending behind the text, the image bar's three
 * placements, undo order with typing around a drag, redo, resize, delete, the
 * save indicator after an input that changed nothing, and a relaunch.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runCanvasChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-canvas-'));
  const notes = path.join(profile, 'storage/notes');
  fs.mkdirSync(notes, { recursive: true });
  const png = `data:image/png;base64,${fs.readFileSync(path.join(root, 'build', 'icon.png')).toString('base64')}`;
  const prose = Array.from({ length: 8 }, (_, i) => `<p>Line ${i + 1} of the canvas note, long enough to sit under the shape and the picture.</p>`).join('');
  // As 0.8.7 saved it: the image on its own layer, over the shape.
  fs.writeFileSync(path.join(notes, 'canvas.json'), JSON.stringify({
    id: 'canvas', title: 'Canvas', createdAt: 1, updatedAt: 1,
    content: '<div class="image-layer" contenteditable="false"><figure class="note-image" contenteditable="false" data-ratio="1" style="left:140px;top:40px;width:140px;height:140px"><img src="' + png + '"></figure></div>'
      + '<div class="shape-layer" contenteditable="false"><div class="shape rect" data-kind="rect" style="left:60px;top:20px;width:170px;height:110px;background:#D6E4D0"><div class="shape-text" contenteditable="true">a shape</div><span class="shape-h"></span></div></div>'
      + prose,
  }));
  fs.writeFileSync(path.join(notes, 'other.json'), JSON.stringify({ id: 'other', title: 'Other', content: '<p>x</p>', createdAt: 1, updatedAt: 1 }));

  let app; let win;
  const launch = async () => {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    win = await app.firstWindow(); win.setDefaultTimeout(10000);
    await app.evaluate(({ dialog, BrowserWindow }) => { dialog.showMessageBox = async () => ({ response: 0 }); BrowserWindow.getAllWindows()[0].setSize(1280, 1000); });
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 5000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
  };
  const open = async (title) => {
    await win.evaluate((t) => [...document.querySelectorAll('.note-row')].find((r) => r.textContent.includes(t))?.click(), title);
    await win.waitForFunction((t) => document.querySelector('#title').value === t, title, { polling: 50 });
    await win.waitForTimeout(300);
  };
  const center = (sel) => win.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const drag = async (from, dx, dy) => {
    await win.mouse.move(from.x, from.y); await win.mouse.down();
    for (let i = 1; i <= 10; i++) await win.mouse.move(from.x + dx * i / 10, from.y + dy * i / 10);
    await win.mouse.up(); await win.waitForTimeout(150);
  };
  const clickBar = async (bar, act) => {
    const at = await win.evaluate(({ b, a }) => { const r = document.querySelector(`#${b} [data-${b === 'image-bar' ? 'image' : 'shape'}="${a}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, { b: bar, a: act });
    await win.mouse.click(at.x, at.y); await win.waitForTimeout(150);
  };
  /** What the pointer would hit at the middle of the overlap of the shape and the image. */
  const topAtOverlap = () => win.evaluate(() => {
    const s = document.querySelector('#editor .shape').getBoundingClientRect();
    const i = document.querySelector('#editor .note-image').getBoundingClientRect();
    const x = (Math.max(s.left, i.left) + Math.min(s.right, i.right)) / 2;
    const y = (Math.max(s.top, i.top) + Math.min(s.bottom, i.bottom)) / 2;
    const hit = document.elementFromPoint(x, y);
    return hit?.closest('.note-image') ? 'image' : hit?.closest('.shape') ? 'shape' : hit?.tagName;
  });
  const geometry = () => win.evaluate(() => {
    const s = document.querySelector('#editor .shape'); const i = document.querySelector('#editor .note-image');
    return { shape: [s.style.left, s.style.top], image: [i.style.left, i.style.top, i.style.width], imageLayer: i.parentElement.className, order: [...i.parentElement.children].map((c) => c.classList.contains('note-image') ? 'image' : c.classList.contains('shape') ? 'shape' : c.tagName) };
  });
  const caretAtEnd = (line) => win.evaluate((n) => {
    const ed = document.getElementById('editor'); ed.focus();
    const p = [...ed.querySelectorAll('p')][n]; const t = p.lastChild;
    const r = document.createRange(); r.setStart(t, t.length); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  }, line);
  const lineText = (n) => win.evaluate((i) => [...document.querySelectorAll('#editor p')][i].textContent, n);

  try {
    await launch();
    await open('Canvas');

    /* An old note: its image layer joins the canvas, above the shape as before. */
    let g = await geometry();
    check('an old note\'s image layer is merged into the shapes\' canvas on open',
      await win.evaluate(() => !document.querySelector('#editor .image-layer')) && g.imageLayer === 'shape-layer' && g.order.join() === 'shape,image', JSON.stringify(g));
    check('after the merge the image still paints over the shape, as it did', await topAtOverlap() === 'image');

    /* Stacking both ways. */
    await win.mouse.click((await center('#editor .shape')).x - 60, (await center('#editor .shape')).y - 30);
    await clickBar('shape-bar', 'front');
    check('▴ on a shape brings it over the image: one stacking order for both', await topAtOverlap() === 'shape', JSON.stringify(await geometry()));
    await win.keyboard.press('Escape');
    const img = await win.evaluate(() => { const r = document.querySelector('#editor .note-image').getBoundingClientRect(); return { x: r.right - 12, y: r.bottom - 30 }; });
    await win.mouse.click(img.x, img.y);
    await clickBar('image-bar', 'front');
    check('▴ on the image brings it back over the shape', await topAtOverlap() === 'image');

    /* Dragging one over the other. */
    const before = await geometry();
    await drag(img, 120, 60);
    const afterImage = await geometry();
    check('the image drags across the shape; the shape stays put',
      afterImage.image[0] !== before.image[0] && afterImage.shape.join() === before.shape.join(), JSON.stringify({ before, afterImage }));
    await win.keyboard.press('Escape');
    const sh = await win.evaluate(() => { const r = document.querySelector('#editor .shape').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; });
    await drag(sh, 140, 70);
    const afterShape = await geometry();
    check('the shape drags onto the image; the image stays put',
      afterShape.shape[0] !== before.shape[0] && afterShape.image.join() === afterImage.image.join(), JSON.stringify(afterShape));
    await win.keyboard.press('Escape');

    /* One selection at a time: picking the image after a shape closes the shape's bar. */
    const shapeAt = await win.evaluate(() => { const r = document.querySelector('#editor .shape').getBoundingClientRect(); return { x: r.left + 15, y: r.top + 15 }; });
    await win.mouse.click(shapeAt.x, shapeAt.y);
    const imageAt = await win.evaluate(() => { const r = document.querySelector('#editor .note-image').getBoundingClientRect(); return { x: r.right - 12, y: r.bottom - 12 }; });
    await win.mouse.click(imageAt.x, imageAt.y);
    const bars = await win.evaluate(() => ({ shape: !document.getElementById('shape-bar')?.hidden, image: !document.getElementById('image-bar').hidden }));
    check('selecting the image after a shape leaves only the image bar open', bars.image && !bars.shape, JSON.stringify(bars));
    await win.mouse.click(shapeAt.x, shapeAt.y);
    const bars2 = await win.evaluate(() => ({ shape: !document.getElementById('shape-bar')?.hidden, image: !document.getElementById('image-bar').hidden }));
    check('and selecting the shape after the image leaves only the shape bar open', bars2.shape && !bars2.image, JSON.stringify(bars2));
    await win.keyboard.press('Escape');

    /* An arrow tied to the image follows it when the image is dragged. */
    await win.evaluate(() => document.querySelector('[data-arrow-add="straight"]').click());
    await win.waitForTimeout(150);
    const tip = await center('#editor .note-arrow .arrow-end[data-end="to"]');
    const target = await win.evaluate(() => { const r = document.querySelector('#editor .note-image').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await drag(tip, target.x - tip.x, target.y - tip.y);
    const tied = await win.evaluate(() => { const a = document.querySelector('#editor .note-arrow'); return { to: a.dataset.to, anchor: document.querySelector('#editor .note-image').dataset.anchor, x2: a.dataset.x2, y2: a.dataset.y2 }; });
    const grab = await win.evaluate(() => { const r = document.querySelector('#editor .note-image').getBoundingClientRect(); return { x: r.right - 12, y: r.bottom - 12 }; });
    await drag(grab, 80, 50);
    const followed = await win.evaluate(() => { const a = document.querySelector('#editor .note-arrow'); return { x2: a.dataset.x2, y2: a.dataset.y2 }; });
    check('an arrow tied to an image follows the image when it is dragged',
      !!tied.to && tied.to === tied.anchor && (followed.x2 !== tied.x2 || followed.y2 !== tied.y2), JSON.stringify({ tied, followed }));
    await win.keyboard.press('Escape');
    // Out of the way of the checks below, which look at the image and the shape alone.
    await win.evaluate(() => { document.querySelector('#editor .note-arrow')?.remove(); document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true })); });

    /* Undo order with typing around a drag (the owner's report). */
    await caretAtEnd(7);
    await win.keyboard.type(' abc', { delay: 15 });
    await win.waitForTimeout(800);
    const typed1 = await lineText(7);
    const pos1 = (await geometry()).image.join();
    const img2 = await win.evaluate(() => { const r = document.querySelector('#editor .note-image').getBoundingClientRect(); return { x: r.right - 12, y: r.bottom - 30 }; });
    await drag(img2, -60, 40);
    const pos2 = (await geometry()).image.join();
    await win.keyboard.press('Escape');
    await caretAtEnd(7);
    await win.keyboard.type(' def', { delay: 15 });
    await win.waitForTimeout(800);
    await win.keyboard.press('Control+z'); await win.waitForTimeout(150);
    const u1 = { text: await lineText(7), image: (await geometry()).image.join() };
    await win.keyboard.press('Control+z'); await win.waitForTimeout(150);
    const u2 = { text: await lineText(7), image: (await geometry()).image.join() };
    await win.keyboard.press('Control+z'); await win.waitForTimeout(150);
    const u3 = { text: await lineText(7), image: (await geometry()).image.join() };
    check('first Ctrl+Z takes back only the words typed after the drag', u1.text === typed1 && u1.image === pos2, JSON.stringify(u1));
    check('second Ctrl+Z takes back the drag', u2.text === typed1 && u2.image === pos1, JSON.stringify(u2));
    check('third Ctrl+Z takes back the words typed before it', !u3.text.endsWith(' abc') && u3.image === pos1, JSON.stringify(u3));
    await win.keyboard.press('Control+y'); await win.waitForTimeout(100);
    await win.keyboard.press('Control+y'); await win.waitForTimeout(100);
    check('Ctrl+Y replays the words and then the drag', (await lineText(7)) === typed1 && (await geometry()).image.join() === pos2);

    /* Resize, and its undo. */
    const w0 = (await geometry()).image[2];
    const img3 = await win.evaluate(() => { const r = document.querySelector('#editor .note-image').getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 30 }; });
    await win.mouse.click(img3.x, img3.y);
    const handle = await center('#editor .note-image.sel .image-h');
    await drag(handle, 60, 60);
    const w1 = (await geometry()).image[2];
    await win.keyboard.press('Escape');
    await win.keyboard.press('Control+z'); await win.waitForTimeout(150);
    check('the resize handle resizes, and Ctrl+Z puts the size back', w1 !== w0 && (await geometry()).image[2] === w0, JSON.stringify({ w0, w1 }));

    /* Behind the text: the words take the pointer there. */
    const img4 = await win.evaluate(() => { const r = document.querySelector('#editor .note-image').getBoundingClientRect(); return { x: r.right - 12, y: r.bottom - 30 }; });
    await win.mouse.click(img4.x, img4.y);
    await clickBar('image-bar', 'back');
    const behind = await win.evaluate(() => {
      const i = document.querySelector('#editor .note-image');
      const lit = [...document.querySelectorAll('#image-bar button.on')].map((b) => b.dataset.image);
      return { layer: i.parentElement.className, lit };
    });
    check('▾ sends the image behind the text, onto the lower canvas, and the bar says so',
      behind.layer.includes('shape-layer--behind') && behind.lit.join() === 'back', JSON.stringify(behind));

    /* The three placements by real clicks, and they survive switching notes. */
    await clickBar('image-bar', 'inline');
    const inText = await win.evaluate(() => { const i = document.querySelector('#editor .note-image'); return { inline: i.classList.contains('note-image--inline'), parent: i.parentElement.id }; });
    check('≡ puts the image into the text', inText.inline && inText.parent === 'editor', JSON.stringify(inText));
    await clickBar('image-bar', 'front');
    const onTop = await win.evaluate(() => { const i = document.querySelector('#editor .note-image'); return { inline: i.classList.contains('note-image--inline'), layer: i.parentElement.className, last: i.parentElement.lastElementChild === i }; });
    check('▴ from the text sets it free on top of everything', !onTop.inline && onTop.layer === 'shape-layer' && onTop.last, JSON.stringify(onTop));
    await win.keyboard.press('Escape');
    const kept = await geometry();
    await win.keyboard.press('Control+s'); await win.waitForTimeout(600);
    await open('Other'); await open('Canvas');
    check('placement, position and order are the same after switching notes away and back', JSON.stringify(await geometry()) === JSON.stringify(kept), JSON.stringify(await geometry()));

    /* The save indicator after an input that changed nothing. */
    await win.evaluate(() => document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true })));
    await win.waitForTimeout(400);
    await win.evaluate(() => document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true })));
    await win.waitForTimeout(1500);
    check('the indicator ends on "Saved" after an input that changed nothing', await win.evaluate(() => document.getElementById('savestate').textContent) === 'Saved',
      await win.evaluate(() => document.getElementById('savestate').textContent));

    /* Delete the selected image; the shape stays; Ctrl+Z brings it back. */
    const img5 = await win.evaluate(() => { const r = document.querySelector('#editor .note-image').getBoundingClientRect(); return { x: r.right - 12, y: r.bottom - 12 }; });
    await win.mouse.click(img5.x, img5.y);
    await win.keyboard.press('Delete'); await win.waitForTimeout(150);
    const gone = await win.evaluate(() => ({ images: document.querySelectorAll('#editor .note-image').length, shapes: document.querySelectorAll('#editor .shape').length }));
    await win.keyboard.press('Control+z'); await win.waitForTimeout(150);
    check('Delete removes the selected image and not the shape; Ctrl+Z restores it',
      gone.images === 0 && gone.shapes === 1 && await win.locator('#editor .note-image').count() === 1, JSON.stringify(gone));
    await win.keyboard.press('Control+s'); await win.waitForTimeout(800);
    const beforeRestart = await geometry();

    /* A relaunch keeps it all. */
    await app.close();
    await launch();
    await open('Canvas');
    const afterRestart = await geometry();
    check('after a restart the image and the shape keep their places and their order',
      JSON.stringify(afterRestart) === JSON.stringify(beforeRestart) && await win.evaluate(() => !document.querySelector('#editor .image-layer')), JSON.stringify({ beforeRestart, afterRestart }));

    /* A video card: player first, as wide as the column, link under it. */
    await open('Other');
    await win.evaluate(() => { const ed = document.getElementById('editor'); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await win.keyboard.press('Enter');
    await app.evaluate(({ clipboard }) => clipboard.writeText('https://www.youtube.com/watch?v=FUfGcZ092b0'));
    await win.keyboard.press('Control+v');
    await win.waitForFunction(() => document.activeElement?.id === 'link-url-input', null, { polling: 50 });
    await win.evaluate(() => document.querySelector('[data-link-kind="embed"]').click());
    await win.waitForTimeout(300);
    const card = await win.evaluate(() => {
      const c = document.querySelector('#editor .link-embed--video');
      const f = c.querySelector('webview').getBoundingClientRect(); const a = c.querySelector('.link-card').getBoundingClientRect();
      const col = document.getElementById('editor').clientWidth;
      return { width: Math.round(c.getBoundingClientRect().width), col, ratio: +(f.width / f.height).toFixed(2), playerFirst: f.bottom <= a.top + 1, hint: !!c.querySelector('.link-embed-hint') };
    });
    check('a video card is the player first, 16:9, wider than the old 560px, link underneath, no hint',
      card.width > 560 && card.ratio > 1.7 && card.ratio < 1.8 && card.playerFirst && !card.hint, JSON.stringify(card));
  } catch (err) {
    check('canvas checks ran to the end', false, err.message.split('\n').slice(0, 3).join(' | '));
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
