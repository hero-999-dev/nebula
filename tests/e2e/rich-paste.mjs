import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mainJs = path.join(root, 'dist-electron', 'main.js');
const launch = (profile) => electron.launch({
  // Windows may occlude a test window behind another app. Keep compositor
  // frames alive so lazy embeds and pointer checks test the app, not throttling.
  args: [mainJs, '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
  env: { ...process.env, NEBULA_USER_DATA: profile },
});

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export async function runRichPasteChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-rich-paste-'));
  let app = await launch(profile);
  let win = await app.firstWindow();
  try {
    await win.waitForSelector('#editor');
    await win.waitForTimeout(500);

    const prepareBlank = () => win.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.innerHTML = '<p><br></p>';
      const text = editor.querySelector('p').firstChild;
      const range = document.createRange();
      range.setStart(editor.querySelector('p'), 0);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
    });

    await prepareBlank();
    const pasteUrl = await win.evaluate(() => {
      const editor = document.getElementById('editor');
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'https://example.com/docs');
      const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
      return { prevented: event.defaultPrevented, buttons: [...document.querySelectorAll('#link-menu [data-link-kind]')].map((b) => b.textContent) };
    });
    check('pasting a URL opens the four Paste as choices', pasteUrl.prevented
      && pasteUrl.buttons.join(',') === 'Embed,Bookmark,URL,Mention', pasteUrl.buttons.join(','));

    await win.evaluate(() => document.querySelector('#link-menu [data-link-kind="bookmark"]').click());
    await win.waitForSelector('.link-bookmark');
    const bookmark = await win.evaluate(() => {
      const card = document.querySelector('.link-bookmark');
      return { url: card?.dataset.url, label: card?.querySelector('.link-card__title')?.textContent, target: card?.querySelector('a')?.target };
    });
    check('Bookmark inserts a safe clickable card', bookmark.url === 'https://example.com/docs'
      && bookmark.label === 'example.com/docs' && bookmark.target === '_blank', JSON.stringify(bookmark));

    await win.evaluate(() => document.querySelector('.link-del').click());
    check('bookmark delete really removes the card', await win.locator('.link-block').count() === 0);
    await win.keyboard.press('Control+z');
    check('undo restores a deleted bookmark', await win.locator('.link-bookmark').count() === 1);
    await win.keyboard.press('Control+Shift+z');
    check('redo removes that bookmark again', await win.locator('.link-bookmark').count() === 0);

    for (const kind of ['url', 'mention', 'embed']) {
      await prepareBlank();
      await win.route('https://example.com/**', (route) => route.fulfill({
        contentType: 'text/html', body: '<html><body><h1>Embedded test content</h1></body></html>',
      }));
      await win.evaluate((kind) => {
        const editor = document.getElementById('editor');
        const transfer = new DataTransfer(); transfer.setData('text/plain', 'https://example.com/preview');
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
        document.querySelector(`[data-link-kind="${kind}"]`).click();
      }, kind);
      if (kind === 'embed') {
        await win.locator('.link-frame').evaluate((el) => el.scrollIntoView());
        const frame = win.frameLocator('.link-frame');
        try { await frame.locator('h1').waitFor({ timeout: 10000 }); }
        catch (error) {
          console.error('Embed diagnostic', await win.locator('.link-embed').evaluate((el) => ({ html: el.outerHTML, rect: el.getBoundingClientRect().toJSON() })), win.frames().map((f) => f.url()));
          throw error;
        }
        check('Embed renders a real isolated page, not another bookmark',
          await frame.locator('h1').textContent() === 'Embedded test content'
          && await win.locator('.link-frame').getAttribute('sandbox') === 'allow-scripts');
      } else {
        const text = await win.locator(`#editor .link-${kind}`).textContent();
        check(`${kind} inserts the expected inline label`, text === (kind === 'url' ? 'https://example.com/preview' : '@example.com'));
      }
    }

    await prepareBlank();
    await win.evaluate(() => {
      const p = document.querySelector('#editor p');
      p.textContent = '/';
      const range = document.createRange();
      range.setStart(p.firstChild, 1); range.collapse(true);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.getElementById('editor').dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '/' }));
    });
    await win.waitForSelector('#slash-menu:not([hidden])');
    const slashLinks = await win.evaluate(() => [...document.querySelectorAll('#slash-menu button')].map((b) => b.textContent.trim()));
    check('the slash menu offers Embed, Bookmark, URL and Mention', ['Embed', 'Bookmark', 'URL', 'Mention'].every((label) => slashLinks.includes(label)), slashLinks.slice(-4).join(','));
    await win.keyboard.press('Escape');

    await prepareBlank();
    const imagePasted = await win.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
      const file = new File([bytes], 'pixel.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const editor = document.getElementById('editor');
      const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
      return event.defaultPrevented;
    }, PIXEL);
    await win.waitForSelector('.note-image', { timeout: 5_000 });
    const firstImage = await win.evaluate(() => ({
      prevented: true,
      src: document.querySelector('.note-image img')?.src.startsWith('data:image/png'),
      bar: !document.getElementById('image-bar').hidden,
      width: document.querySelector('.note-image')?.offsetWidth || 0,
    }));
    check('pasting an image creates a selected image block', imagePasted && firstImage.src && firstImage.bar, JSON.stringify(firstImage));

    const resized = await win.evaluate(() => {
      const image = document.querySelector('.note-image');
      const handle = image.querySelector('.image-h');
      const before = image.offsetWidth;
      const r = handle.getBoundingClientRect();
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.right - 2, clientY: r.bottom - 2 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.right + 80, clientY: r.bottom + 40 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return { before, after: image.offsetWidth, height: image.offsetHeight };
    });
    check('the pasted image resizes from its handle', resized.after > resized.before && resized.height > 0, JSON.stringify(resized));

    const ordered = await win.evaluate(() => {
      const image = document.querySelector('.note-image');
      document.querySelector('#image-bar [data-image="back"]').click();
      const back = image.parentElement.classList.contains('image-layer--behind');
      document.querySelector('#image-bar [data-image="front"]').click();
      const front = !image.parentElement.classList.contains('image-layer--behind');
      return { back, front };
    });
    check('the image bar sends an image behind and brings it front', ordered.back && ordered.front, JSON.stringify(ordered));

    await win.keyboard.press('Delete');
    check('Delete removes only the selected image', await win.locator('.note-image').count() === 0
      && await win.locator('#editor p').count() === 1);
    await win.keyboard.press('Control+z');
    check('undo restores the deleted image and its dimensions', await win.locator('.note-image').count() === 1
      && await win.locator('.note-image').evaluate((el) => el.offsetWidth) === resized.after);
    await win.keyboard.press('Control+Shift+z');
    check('redo works after image controls are rehydrated', await win.locator('.note-image').count() === 0);

    await prepareBlank();
    await win.evaluate((base64) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))], 'drop.png', { type: 'image/png' }));
      const editor = document.getElementById('editor');
      const rect = editor.getBoundingClientRect();
      editor.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer,
        clientX: rect.left + 100, clientY: rect.top + 120 }));
    }, PIXEL);
    await win.waitForSelector('.note-image');
    const dropped = await win.locator('.note-image').evaluate((el) => ({ left: el.style.left, top: el.style.top }));
    check('dropping an image uses the drop coordinates', dropped.left === '100px' && dropped.top === '120px', JSON.stringify(dropped));
    const imageRect = await win.locator('.note-image').boundingBox();
    await win.mouse.move(imageRect.x + 20, imageRect.y + 20);
    await win.mouse.down();
    await win.mouse.move(imageRect.x + 70, imageRect.y + 50, { steps: 5 });
    await win.mouse.up();
    check('real pointer drag moves the image', await win.locator('.note-image').evaluate((el) => parseFloat(el.style.left) > 140));
    await win.keyboard.press('Escape');
    check('Escape deselects the image', await win.locator('.note-image.sel').count() === 0);

    const savedImage = await win.locator('.note-image').evaluate((el) => ({ src: el.querySelector('img').src, left: el.style.left, top: el.style.top, width: el.style.width }));
    await win.evaluate(() => document.querySelector('[data-act="save"]').click());
    await win.waitForFunction(() => document.getElementById('savestate').textContent === 'Saved');
    await app.close();
    app = await launch(profile); win = await app.firstWindow();
    await win.waitForSelector('.note-image');
    const reopenedImage = await win.locator('.note-image').evaluate((el) => ({ src: el.querySelector('img').src, left: el.style.left, top: el.style.top, width: el.style.width }));
    check('image bytes and geometry survive disk save and application restart', JSON.stringify(savedImage) === JSON.stringify(reopenedImage));

    // The bottommost floating object used to shrink scrollHeight mid-gesture.
    await win.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.querySelector('.note-image').style.top = '1400px';
      editor.scrollTop = editor.scrollHeight;
    });
    const edgeBox = await win.locator('.note-image').boundingBox();
    await win.mouse.move(edgeBox.x + 25, edgeBox.y + 25); await win.mouse.down();
    const beforeScroll = await win.locator('#editor').evaluate((el) => el.scrollTop);
    await win.mouse.move(edgeBox.x + 25, edgeBox.y - 25, { steps: 5 });
    const duringScroll = await win.locator('#editor').evaluate((el) => el.scrollTop);
    check('moving the lowest image does not pull the paper with it', beforeScroll === duringScroll);
    await win.mouse.up();
  } finally {
    await app.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failures = 0;
  await runRichPasteChecks((name, passed, detail = '') => {
    console.log(`${passed ? '+' : 'x'} ${name} ${detail}`);
    if (!passed) failures += 1;
  });
  if (failures) process.exitCode = 1;
}
