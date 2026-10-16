/**
 * A video file in a note (0.9.4).
 *
 * The owner's Ideas note: "a copy of the pictures and videos put into a note,
 * kept in the note's own folder". A video file dropped on a note is copied
 * into that folder by the main process (electron/note-media.js) and shown here
 * with the browser's own player, straight from the folder.
 *
 * It is a card like an embedded video — the same frame, title bar, × and
 * resize handles — so everything that selects, deletes and steps over cards
 * treats it as one:
 *
 *   <div class="link-block link-embed link-file" data-kind="file" data-name="clip.mp4">
 *     <a class="link-card">…clip.mp4…</a><button class="link-del">×</button>
 *     <video class="link-frame" controls src="nebula-media://note/<id>/vid-….mp4"></video>
 *   </div>
 *
 * Under the player stands a bar of its own ("a simple video player in the app,
 * for now", the owner — in the style of his study pages' player): back and on
 * by ten seconds, the speed, the whole screen, and where the video is. The bar
 * is the screen's, not the note's: it is drawn when a note is shown and never
 * saved (note-markup.js).
 *
 * A file for another program cannot carry it: there it is a line with its name.
 *
 * In a black hole the video is sealed beside its note (electron/black-holes.js)
 * and played from there while the black hole is open.
 */

/**
 * The kinds of video file a note can hold: every one, by its ending
 * (electron/note-media.js holds the same list; a test keeps the two alike).
 * Not every one can be played by the app's own player — see cannotPlay.
 */
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'm2ts', 'mts'];
const VIDEO_FILE = new RegExp(`\\.(${VIDEO_EXTENSIONS.join('|')})$`, 'i');

export function isVideoFile(file) {
  return !!file && VIDEO_FILE.test(String(file.name ?? ''));
}

/** The speeds the bar steps through. */
export const VIDEO_SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75];

/** Seconds as a clock: 0:07, 12:34, 1:02:03. */
export function videoClock(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const two = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(Math.floor(s % 60))}` : `${m}:${two(Math.floor(s % 60))}`;
}

/**
 * A note's own file: `nebula-media://note/<id>/<file>` — or, for a note in a
 * black hole, a video sealed beside it: `nebula-media://hole/<hole>/<id>/<file>`.
 */
export const isMediaUrl = (url) => /^nebula-media:\/\/(?:note|hole\/[\w-]{1,120})\/[\w-]{1,120}\/[\w-]{1,80}\.[a-z0-9]{2,5}$/.test(String(url ?? ''));

/** The video files, and the attached files (file-attach.js), a note's markup names in its own folder: [address, note, file]. */
export function plainVideosOf(html) {
  return [...new Map([...String(html ?? '').matchAll(/nebula-media:\/\/note\/([\w-]{1,120})\/((?:vid|att)-[a-z0-9]+-[0-9a-f]{8}\.[a-z0-9]{2,5})/g)].map((m) => [m[0], [m[0], m[1], m[2]]])).values()];
}

/** The videos and attached files a note's markup names sealed in a black hole: [address, hole, note, file]. */
export function sealedVideosOf(html) {
  return [...new Map([...String(html ?? '').matchAll(/nebula-media:\/\/hole\/([\w-]{1,120})\/([\w-]{1,120})\/((?:vid|att)-[a-z0-9]+-[0-9a-f]{8}\.[a-z0-9]{2,5})/g)].map((m) => [m[0], [m[0], m[1], m[2], m[3]]])).values()];
}

/**
 * @param {string} url the video's address in the note's folder
 * @param {string} name the file's own name, shown under the player
 * @param {Document} [doc]
 */
export function makeVideoBlock(url, name, doc = document) {
  const card = doc.createElement('div');
  card.className = 'link-block link-embed link-file';
  card.setAttribute('contenteditable', 'false');
  card.dataset.blockType = 'link';
  card.dataset.kind = 'file';
  card.dataset.name = Array.from(String(name || 'video')).slice(0, 200).join(''); // characters, not UTF-16 units: an emoji cut in half stayed in the note (hunt B24)

  const label = doc.createElement('a');
  label.className = 'link-card';
  const badge = doc.createElement('span');
  badge.className = 'link-card__kind';
  badge.textContent = 'Video';
  const title = doc.createElement('strong');
  title.className = 'link-card__title';
  title.textContent = card.dataset.name;
  label.append(badge, title);

  const remove = doc.createElement('button');
  remove.type = 'button';
  remove.className = 'link-del';
  remove.dataset.linkRemove = 'true';
  remove.title = 'Remove video';
  remove.textContent = '×';

  const player = doc.createElement('video');
  player.className = 'link-frame';
  player.controls = true;
  player.preload = 'metadata';
  player.setAttribute('src', isMediaUrl(url) ? url : '');
  card.append(label, remove, player);
  return card;
}

/** The bar as this version draws it: one drawn by an older one is drawn again. */
const BAR_VERSION = '1';

/** The player's bar under the picture: drawn into the card on the screen, never into the note. */
function ensureVideoBar(card, player) {
  let bar = card.querySelector(':scope > .video-bar');
  if (bar?.dataset.v !== BAR_VERSION) {
    bar?.remove();
    bar = card.ownerDocument.createElement('div');
    bar.className = 'video-bar';
    bar.dataset.v = BAR_VERSION;
    bar.setAttribute('contenteditable', 'false');
    bar.innerHTML = '<button type="button" data-video="back" title="Back 10 seconds">↩ 10s</button>'
      + '<button type="button" data-video="on" title="On 10 seconds">10s ↪</button>'
      + '<button type="button" data-video="speed" title="Speed">1×</button>'
      + '<button type="button" data-video="full" title="Full screen">⛶</button>'
      + '<span class="video-now">0:00</span>';
    player.after(bar);
  }
  paintVideoBar(card, player);
  return bar;
}

/** Where the video is, and how fast it runs. */
function paintVideoBar(card, player) {
  const now = card.querySelector(':scope > .video-bar .video-now');
  if (now) now.textContent = Number.isFinite(player.duration) && player.duration > 0 ? `${videoClock(player.currentTime)} / ${videoClock(player.duration)}` : videoClock(player.currentTime);
  const speed = card.querySelector(':scope > .video-bar [data-video="speed"]');
  if (speed) speed.textContent = `${player.playbackRate}×`;
}

/**
 * A video the app's player cannot play — an AVI, a WMV, a codec Chromium does
 * not have: the card says so, and offers the computer's own player for a video
 * that is a file in the note's folder (a sealed one is nobody else's to open).
 */
function cannotPlay(card, player) {
  card.classList.add('cannot-play');
  const bar = card.querySelector(':scope > .video-bar');
  if (!bar || bar.querySelector('.video-miss')) return;
  const miss = card.ownerDocument.createElement('span');
  miss.className = 'video-miss';
  miss.textContent = 'This kind of video cannot be played here.';
  bar.prepend(miss);
  if (/^nebula-media:\/\/note\//.test(player.getAttribute('src') || '')) {
    const out = card.ownerDocument.createElement('button');
    out.type = 'button';
    out.dataset.video = 'outside';
    out.textContent = 'Open in another program';
    miss.after(out);
  }
}

/** A player is a control: it never takes the caret, and a saved one is given its controls again. */
export function refreshVideoBlocks(root) {
  for (const card of root.querySelectorAll('.link-block.link-file')) {
    card.setAttribute('contenteditable', 'false');
    const player = card.querySelector('video');
    if (!player) continue;
    player.controls = true;
    if (!isMediaUrl(player.getAttribute('src'))) player.removeAttribute('src');   // only ever a note's own file
    ensureVideoBar(card, player);
    // A file that failed before this was looked at: the card is told now.
    if (player.error && player.error.code >= 3) cannotPlay(card, player);
  }
}

/**
 * The bar's buttons and its clock, for every player in the note. Media events
 * do not bubble, so they are caught on their way down.
 * @param {HTMLElement} editor
 */
export function initVideoPlayers(editor) {
  if (!editor) return;
  const cardOf = (el) => { const card = el?.closest?.('.link-block.link-file'); return card && editor.contains(card) ? card : null; };
  editor.addEventListener('click', (e) => {
    const button = e.target.closest?.('.video-bar [data-video]');
    const card = button ? cardOf(button) : null;
    const player = card?.querySelector('video');
    if (!player) return;
    e.preventDefault();
    e.stopPropagation();
    const act = button.dataset.video;
    if (act === 'back') player.currentTime = Math.max(0, player.currentTime - 10);
    else if (act === 'on') player.currentTime = Math.min(Number.isFinite(player.duration) ? player.duration : player.currentTime + 10, player.currentTime + 10);
    else if (act === 'speed') player.playbackRate = VIDEO_SPEEDS[(VIDEO_SPEEDS.indexOf(player.playbackRate) + 1) % VIDEO_SPEEDS.length];
    else if (act === 'full') { if (document.fullscreenElement) void document.exitFullscreen?.(); else void player.requestFullscreen?.()?.catch?.(() => {}); }
    else if (act === 'outside') void window.nebula?.media?.openOutside?.(player.getAttribute('src'));
    paintVideoBar(card, player);
  }, true);
  // A press on the bar is the bar's: it neither picks the card up nor moves the caret.
  editor.addEventListener('mousedown', (e) => { if (e.target.closest?.('.video-bar') && cardOf(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
  const show = (e) => {
    const card = e.target?.tagName === 'VIDEO' ? cardOf(e.target) : null;
    if (card) paintVideoBar(card, e.target);
  };
  for (const name of ['timeupdate', 'loadedmetadata', 'durationchange', 'ratechange', 'seeked']) editor.addEventListener(name, show, true);
  editor.addEventListener('error', (e) => {
    const card = e.target?.tagName === 'VIDEO' ? cardOf(e.target) : null;
    // 3: it cannot be decoded; 4: its kind is not one the player has.
    if (card && e.target.error && e.target.error.code >= 3) cannotPlay(card, e.target);
  }, true);
}

/**
 * For a file another program opens: each video of the note becomes a line
 * with its name, and so does each attached file (file-attach.js). In place,
 * on a parsed copy of the note.
 */
export function fileVideoLines(doc) {
  for (const card of [...doc.querySelectorAll('.link-block.link-file, .link-block.link-attach')]) {
    const line = doc.createElement('p');
    const attached = card.classList.contains('link-attach');
    line.textContent = `${attached ? '📎' : '▶'} ${card.dataset.name || card.querySelector('.link-card__title')?.textContent || (attached ? 'file' : 'video')}`;
    card.replaceWith(line);
  }
  return doc;
}
