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
 *
 * A video whose note came over Tailscale sync before its file (1.0.4, the
 * owner: "oynatıcıda video eşitleniyor · % kartı"): a big file follows its
 * note in the background, and until it is here the player has nothing to
 * play. Its card says so in place — "Video syncing · 62 %", with a line that
 * fills — instead of "cannot be played", and is a player again the moment the
 * file is whole. Like the bar it stands in, that is the screen's, never the
 * note's. An attached file and a picture over the same size follow their note
 * the same way, and say it the same way: "File syncing · 62 %" in the card's
 * bar, "Picture syncing · 62 %" where the picture will be.
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

/** The files still on their way from another computer: `<note>/<file>` → how many per cent of it are here. */
const coming = new Map();
/**
 * What a card says, given the per cent and what it shows — 'video', 'picture'
 * or 'file': the window's half of sync puts it in the app's language (tailnet-sync.js).
 */
let comingWords = (pct, kind = 'video') => `${kind === 'picture' ? 'Picture' : kind === 'file' ? 'File' : 'Video'} syncing · ${pct} %`;
/** A note's own file, as `<note>/<file>`, from its address: only such a one is ever synced — never one sealed in a black hole. */
const keyOf = (src) => /^nebula-media:\/\/note\/([\w-]{1,120}\/[\w-]{1,80}\.[a-z0-9]{2,5})$/.exec(String(src ?? ''))?.[1] ?? null;
/** The note's own file a player shows. */
const fileOf = (player) => keyOf(player?.getAttribute('src'));
/** Whole only when it has arrived: never 100 while it is still coming. */
const perCent = (f) => (Number(f?.size) > 0 ? Math.max(0, Math.min(99, Math.floor((Number(f.got) || 0) / Number(f.size) * 100))) : 0);

/**
 * The card of a video still coming says how much of it is here; one that is
 * not (any more) loses that word. Never "cannot be played" meanwhile: there
 * is nothing to play yet.
 * @returns {boolean} whether the video is still coming
 */
function paintComing(card, player) {
  const pct = coming.get(fileOf(player));
  const bar = card.querySelector(':scope > .video-bar');
  let word = bar?.querySelector('.video-coming') ?? null;
  if (pct === undefined || !bar) {
    card.classList.remove('is-coming');
    word?.remove();
    return false;
  }
  card.classList.remove('cannot-play');
  bar.querySelector('.video-miss')?.remove();
  bar.querySelector('[data-video="outside"]')?.remove();
  card.classList.add('is-coming');
  if (!word) {
    word = card.ownerDocument.createElement('span');
    word.className = 'video-coming';
    word.innerHTML = '<span class="video-coming__text"></span><span class="video-coming__meter"><i></i></span>';
    bar.prepend(word);
  }
  word.firstChild.textContent = comingWords(pct);
  word.lastChild.firstChild.style.width = `${pct}%`;
  return true;
}

/** The word and the line that fills, as `<span class="name"><span class="name__text"></span><span class="name__meter"><i></i></span></span>`. */
function comingWord(doc, name) {
  const word = doc.createElement('span');
  word.className = name;
  word.innerHTML = `<span class="${name}__text"></span><span class="${name}__meter"><i></i></span>`;
  return word;
}

/**
 * An attached file still coming (1.0.4, the owner: "tailscale yapalim
 * kücükleri"): its bar says how much of it is here, in place of Open and Save
 * a copy, which have nothing to act on yet; one that is not (any more) has its
 * buttons again. In the bar, so never saved (note-markup.js).
 * @param {HTMLElement} card a `.link-attach` card whose bar is drawn (file-attach.js)
 * @returns {boolean} whether the file is still coming
 */
export function paintComingAttach(card) {
  const pct = coming.get(keyOf(card?.dataset?.src));
  const bar = card?.querySelector?.(':scope > .attach-bar') ?? null;
  let word = bar?.querySelector('.file-coming') ?? null;
  if (pct === undefined || !bar) {
    card?.classList?.remove('is-coming');
    word?.remove();
    return false;
  }
  card.classList.add('is-coming');
  if (!word) {
    word = comingWord(card.ownerDocument, 'file-coming');
    bar.prepend(word);
  }
  word.firstChild.textContent = comingWords(pct, 'file');
  word.lastChild.firstChild.style.width = `${pct}%`;
  return true;
}

/**
 * A picture still coming (1.0.4): its frame says how much of it is here, where
 * the picture will be; one that is not (any more) is a picture again. Drawn on
 * the screen, never saved (note-markup.js). A widget and an exported video's
 * still are no pictures of the note's folder.
 * @param {HTMLElement} figure a `.note-image`
 * @returns {boolean} whether the picture is still coming
 */
export function paintComingPicture(figure) {
  const img = figure?.matches?.('.note-image:not(.note-widget):not(.note-video)') ? figure.querySelector('img') : null;
  const pct = img ? coming.get(keyOf(img.getAttribute('src'))) : undefined;
  let word = figure?.querySelector?.(':scope > .picture-coming') ?? null;
  if (pct === undefined) {
    figure?.classList?.remove('is-coming');
    word?.remove();
    return false;
  }
  figure.classList.add('is-coming');
  if (!word) {
    word = comingWord(figure.ownerDocument, 'picture-coming');
    word.setAttribute('contenteditable', 'false');
    figure.append(word);
  }
  word.firstChild.textContent = comingWords(pct, 'picture');
  word.lastChild.firstChild.style.width = `${pct}%`;
  return true;
}

function paintAllComing(root, only = null) {
  for (const card of root?.querySelectorAll?.('.link-block.link-file') ?? []) {
    const player = card.querySelector('video');
    if (player && (only === null || fileOf(player) === only)) paintComing(card, player);
  }
  for (const card of root?.querySelectorAll?.('.link-block.link-attach') ?? []) {
    if (only === null || keyOf(card.dataset.src) === only) paintComingAttach(card);
  }
  for (const figure of root?.querySelectorAll?.('.note-image') ?? []) {
    if (only === null || keyOf(figure.querySelector('img')?.getAttribute('src')) === only) paintComingPicture(figure);
  }
}

/**
 * The words of a card, in the app's language: `say(perCent, kind)`, the kind
 * being 'video', 'picture' or 'file'. (Named for the video, the first to have a card.)
 */
export function comingVideoWords(say) {
  if (typeof say === 'function') comingWords = say;
}

/**
 * The big files still on their way, whole: `[{ id, name, got, size }]`, the
 * note, the file, and how many of its bytes are here. Every player on the page
 * showing one of them says so, and so does every attached file's card and
 * every picture; one no longer listed is a player, a card, a picture again.
 */
export function setComingVideos(list, root = document) {
  coming.clear();
  for (const f of Array.isArray(list) ? list : []) if (f && typeof f.id === 'string' && typeof f.name === 'string') coming.set(`${f.id}/${f.name}`, perCent(f));
  paintAllComing(root);
}

/** One of them moved on: `{ id, name, got, size }`. Told with every piece that comes, drawn once per cent. */
export function videoComing(f, root = document) {
  if (!f || typeof f.id !== 'string' || typeof f.name !== 'string') return;
  const key = `${f.id}/${f.name}`;
  const pct = perCent(f);
  if (coming.get(key) === pct) return;
  coming.set(key, pct);
  paintAllComing(root, key);
}

/** One of them is here, whole: its card is a player, a file's card, a picture again (the window's half of sync loads it anew). */
export function videoArrived(id, name, root = document) {
  if (coming.delete(`${id}/${name}`)) paintAllComing(root);
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
    // Still on its way from another computer: nothing has failed.
    if (paintComing(card, player)) continue;
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
    // A file still on its way is not there to be read: the card says how far it is, not that it cannot be played.
    if (card && paintComing(card, e.target)) return;
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
