import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mainJs = path.join(root, 'dist-electron', 'main.js');
const launch = (profile) => electron.launch({
  args: [mainJs],
  env: { ...process.env, NEBULA_USER_DATA: profile },
});

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export async function runRichPasteChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-rich-paste-'));
  const app = await launch(profile);
  const win = await app.firstWindow();
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
      && pasteUrl.buttons.join(',') === 'Embed,Bookmark,Url,Mention', pasteUrl.buttons.join(','));

    await win.evaluate(() => document.querySelector('#link-menu [data-link-kind="bookmark"]').click());
    await win.waitForSelector('.link-bookmark');
    const bookmark = await win.evaluate(() => {
      const card = document.querySelector('.link-bookmark');
      return { url: card?.dataset.url, label: card?.querySelector('.link-card__title')?.textContent, target: card?.querySelector('a')?.target };
    });
    check('Bookmark inserts a safe clickable card', bookmark.url === 'https://example.com/docs'
      && bookmark.label === 'example.com/docs' && bookmark.target === '_blank', JSON.stringify(bookmark));

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
  } finally {
    await app.close();
  }
}
