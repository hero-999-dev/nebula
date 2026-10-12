/**
 * A video file in a note (0.9.4): the card the note shows it in, and what a
 * file written for another program holds in its place. The copying into the
 * note's folder is in tests/note-media.test.js; the playing in
 * tests/e2e/note-folders.mjs.
 */
import { describe, it, expect } from 'vitest';
import { isVideoFile, isMediaUrl, makeVideoBlock, refreshVideoBlocks, fileVideoLines, plainVideosOf, sealedVideosOf, initVideoPlayers, videoClock, VIDEO_EXTENSIONS, VIDEO_SPEEDS } from '../src/js/file-video.js';
import { serializeNote } from '../src/js/note-markup.js';
import { VIDEO_EXTENSIONS as MAIN_EXTENSIONS } from '../electron/note-media.js';
import { toMarkdown, toHtml } from '../src/js/export.js';
import { readBlocks } from '../src/js/office.js';
import { prepareVideos } from '../src/js/export-video.js';
import { fingerprint, sameNote, healHtml } from '../src/js/heal.js';

const URL = 'nebula-media://note/n-1_Ab/vid-m1abc-0a1b2c3d.mp4';

describe('a video file', () => {
  it('is known by its ending', () => {
    expect(isVideoFile({ name: 'Holiday.MP4', type: 'video/mp4' })).toBe(true);
    expect(isVideoFile({ name: 'clip.webm', type: '' })).toBe(true);
    expect(isVideoFile({ name: 'clip.mov', type: 'video/quicktime' })).toBe(true);
    // Every kind of video file is held — an AVI too, which the app's own player cannot play.
    expect(isVideoFile({ name: 'clip.avi', type: 'video/x-msvideo' })).toBe(true);
    expect(isVideoFile({ name: 'film.MKV', type: '' })).toBe(true);
    expect(isVideoFile({ name: 'main.ts', type: 'video/mp2t' })).toBe(false);          // a TypeScript file far more often than a video
    expect(VIDEO_EXTENSIONS).toEqual(MAIN_EXTENSIONS);                                // the window and the main process hold the same kinds
    expect(isVideoFile({ name: 'picture.png', type: 'image/png' })).toBe(false);
    expect(isVideoFile({ name: 'mp4', type: 'video/mp4' })).toBe(false);
    expect(isVideoFile(null)).toBe(false);
  });

  it('is shown from the note’s own folder, and from nowhere else', () => {
    expect(isMediaUrl(URL)).toBe(true);
    expect(isMediaUrl('nebula-media://hole/bh-1/n-1_Ab/vid-m1abc-0a1b2c3d.mp4')).toBe(true);     // sealed beside a note in a black hole
    expect(isMediaUrl('nebula-media://hole/bh-1/vid-m1abc-0a1b2c3d.mp4')).toBe(false);
    expect(plainVideosOf(`<video src="${URL}"></video><video src="${URL}"></video>`)).toEqual([[URL, 'n-1_Ab', 'vid-m1abc-0a1b2c3d.mp4']]);
    expect(sealedVideosOf('<video src="nebula-media://hole/bh-1/n1/vid-m1abc-0a1b2c3d.mp4"></video>')).toEqual([['nebula-media://hole/bh-1/n1/vid-m1abc-0a1b2c3d.mp4', 'bh-1', 'n1', 'vid-m1abc-0a1b2c3d.mp4']]);
    expect(plainVideosOf('<img src="nebula-media://note/n1/0123456789abcdef01234567.png">')).toEqual([]);
    expect(isMediaUrl('nebula-media://note/n1/../x.mp4')).toBe(false);
    expect(isMediaUrl('https://example.org/x.mp4')).toBe(false);
    expect(isMediaUrl('file:///C:/x.mp4')).toBe(false);
  });
});

describe('the card of a video file', () => {
  it('is a card like an embedded video: the player, its name, a × to remove it', () => {
    const card = makeVideoBlock(URL, 'My clip.mp4');
    expect(card.className).toBe('link-block link-embed link-file');
    expect(card.getAttribute('contenteditable')).toBe('false');
    expect(card.dataset.kind).toBe('file');
    expect(card.dataset.name).toBe('My clip.mp4');
    expect(card.querySelector('.link-card__title').textContent).toBe('My clip.mp4');
    expect(card.querySelector('.link-card').hasAttribute('href')).toBe(false);      // a name, not a link
    expect(card.querySelector('.link-del').dataset.linkRemove).toBe('true');
    const player = card.querySelector('video.link-frame');
    expect(player.getAttribute('src')).toBe(URL);
    expect(player.controls).toBe(true);
    expect(player.preload).toBe('metadata');
  });

  it('never plays an address that is not a note’s own file', () => {
    expect(makeVideoBlock('https://example.org/x.mp4', 'x').querySelector('video').getAttribute('src')).toBe('');
    const root = document.createElement('div');
    root.innerHTML = '<div class="link-block link-embed link-file" data-kind="file" data-name="x.mp4"><video class="link-frame" src="https://example.org/x.mp4"></video></div>'
      + `<div class="link-block link-embed link-file" data-kind="file" data-name="y.mp4"><video class="link-frame" src="${URL}"></video></div>`;
    refreshVideoBlocks(root);
    const [bad, good] = root.querySelectorAll('video');
    expect(bad.hasAttribute('src')).toBe(false);
    expect(good.getAttribute('src')).toBe(URL);
    expect(good.controls).toBe(true);
    expect(root.firstElementChild.getAttribute('contenteditable')).toBe('false');
  });
});

describe('in a file for another program', () => {
  const html = `<p>before</p>${makeVideoBlock(URL, 'My clip.mp4').outerHTML}<p>after</p>`;

  it('a video file is a line with its name', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    fileVideoLines(doc);
    expect(doc.body.innerHTML).toBe('<p>before</p><p>▶ My clip.mp4</p><p>after</p>');
    expect(toMarkdown(html)).toBe('before\n\n▶ My clip.mp4\n\nafter\n');
    expect(readBlocks(html).map((b) => b.runs?.[0]?.text)).toEqual(['before', '▶ My clip.mp4', 'after']);
    const page = toHtml(html, 'T');
    expect(page).toContain('<p>▶ My clip.mp4</p>');
    expect(page).not.toContain('nebula-media');
    expect(page).not.toContain('<video');
  });

  it('whichever way the note’s other videos go out', async () => {
    for (const mode of ['with', 'without']) {
      const out = await prepareVideos(html, mode, {});
      expect(out).toContain('▶ My clip.mp4');
      expect(out).not.toContain('nebula-media');
    }
  });
});

describe('the repair of old notes', () => {
  it('leaves a video card as it is', () => {
    const html = `<p>before</p>${makeVideoBlock(URL, 'My clip.mp4').outerHTML}<p>after</p>`;
    const healed = healHtml(html);
    expect(healed.safe).toBe(true);
    const a = document.createElement('div');
    a.innerHTML = html;
    const b = document.createElement('div');
    b.innerHTML = healed.html;
    expect(sameNote(fingerprint(a), fingerprint(b))).toBe(true);
    expect(b.querySelector('.link-file video').getAttribute('src')).toBe(URL);
    expect(b.querySelector('.link-file .link-card__title').textContent).toBe('My clip.mp4');
  });
});

describe('the player’s own bar', () => {
  const shown = () => {
    const root = document.createElement('div');
    root.innerHTML = `<p>before</p>${makeVideoBlock(URL, 'My clip.mp4').outerHTML}<p>after</p>`;
    document.body.replaceChildren(root);
    refreshVideoBlocks(root);
    initVideoPlayers(root);
    return root;
  };

  it('is drawn under the player when a note is shown — once — and is never saved with the note', () => {
    const root = shown();
    const stored = `<p>before</p>${makeVideoBlock(URL, 'My clip.mp4').outerHTML}<p>after</p>`;
    const card = root.querySelector('.link-file');
    expect([...card.children].map((e) => e.className || e.tagName)).toEqual(['link-card', 'link-del', 'link-frame', 'video-bar']);
    expect([...card.querySelectorAll('.video-bar [data-video]')].map((b) => b.dataset.video)).toEqual(['back', 'on', 'speed', 'full']);
    refreshVideoBlocks(root);
    expect(card.querySelectorAll('.video-bar')).toHaveLength(1);
    expect(serializeNote(root)).toBe(stored);
  });

  it('steps back and on by ten seconds, and through the speeds', () => {
    const root = shown();
    const player = root.querySelector('video');
    Object.defineProperty(player, 'duration', { value: 95, configurable: true });
    const press = (name) => root.querySelector(`.video-bar [data-video="${name}"]`).click();
    player.currentTime = 30;
    press('on');
    expect(player.currentTime).toBe(40);
    press('back'); press('back'); press('back'); press('back'); press('back');
    expect(player.currentTime).toBe(0);
    player.currentTime = 90;
    press('on');
    expect(player.currentTime).toBe(95);                                   // never past its end
    expect(root.querySelector('.video-now').textContent).toBe('1:35 / 1:35');
    const seen = [];
    for (let i = 0; i < VIDEO_SPEEDS.length; i += 1) { press('speed'); seen.push(player.playbackRate); }
    expect(seen).toEqual([...VIDEO_SPEEDS.slice(1), 1]);
    expect(root.querySelector('[data-video="speed"]').textContent).toBe('1×');
  });

  it('says so when a video cannot be played here, offers another program for a file of the note — and none of that is saved', () => {
    const root = shown();
    const stored = serializeNote(root);
    const player = root.querySelector('video');
    Object.defineProperty(player, 'error', { value: { code: 4 }, configurable: true });
    player.dispatchEvent(new Event('error'));
    const card = root.querySelector('.link-file');
    expect(card.classList.contains('cannot-play')).toBe(true);
    expect(card.querySelector('.video-miss').textContent).toBe('This kind of video cannot be played here.');
    expect(card.querySelector('[data-video="outside"]')).not.toBeNull();
    player.dispatchEvent(new Event('error'));
    expect(card.querySelectorAll('.video-miss')).toHaveLength(1);
    expect(serializeNote(root)).toBe(stored);
    // A video sealed in a black hole is nobody else's to open.
    const hole = document.createElement('div');
    hole.innerHTML = makeVideoBlock('nebula-media://hole/bh-1/n-1_Ab/vid-m1abc-0a1b2c3d.avi', 'x.avi').outerHTML;
    document.body.replaceChildren(hole);
    refreshVideoBlocks(hole);
    initVideoPlayers(hole);
    Object.defineProperty(hole.querySelector('video'), 'error', { value: { code: 4 }, configurable: true });
    hole.querySelector('video').dispatchEvent(new Event('error'));
    expect(hole.querySelector('.video-miss')).not.toBeNull();
    expect(hole.querySelector('[data-video="outside"]')).toBeNull();
  });

  it('tells the time as a clock', () => {
    expect([0, 7, 75, 3600 + 2 * 60 + 3, NaN, -1].map(videoClock)).toEqual(['0:00', '0:07', '1:15', '1:02:03', '0:00', '0:00']);
  });
});
