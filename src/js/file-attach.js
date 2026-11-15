/**
 * A file attached to a note (0.9.6).
 *
 * The owner, after Microsoft OneNote: "drag a file into the note and leave it
 * there — its name, its kind and its logo; a click saves it to the computer.
 * I want to keep in mind that this note concerns these files." A PDF, a
 * spreadsheet, an archive — any file. The main process copies it into the
 * note's own folder (electron/note-media.js addAttachment), or seals it beside
 * the note in a black hole, and the note shows a card for it:
 *
 *   <div class="link-block link-attach" contenteditable="false" data-block-type="link"
 *        data-kind="attach" data-name="report.pdf" data-size="123456"
 *        data-src="nebula-media://note/<id>/att-….pdf">
 *     <span class="attach-icon" data-type="pdf"><span class="attach-icon__ext">PDF</span></span>
 *     <a class="link-card"><span class="link-card__kind">PDF · 1.2 MB</span><strong class="link-card__title">report.pdf</strong></a>
 *     <button class="link-del" data-link-remove="true">×</button>
 *   </div>
 *
 * It is a card like a link's: everything that selects, deletes, drags and
 * steps over cards treats it as one. What it says is the file's own: its name,
 * its ending and its size — no word of a language, since the note is saved as
 * it is shown. Its buttons — Open, Save a copy — are the screen's, drawn when
 * the note is shown and never saved (note-markup.js), in the app's language.
 *
 * A click on the card saves a copy where the person says (Downloads, unless
 * they choose); Open hands a copy to the program the computer has for that
 * kind. Neither is ever the note's own file: a program saving into that would
 * change it in every backup that shares it.
 *
 * A file for another program cannot carry it: there it is a line with its
 * name (file-video.js fileVideoLines).
 */

import { t } from './i18n.js';
import { hideGhost } from './drag-ghost.js';
import { paintComingAttach } from './file-video.js';

/** The kinds a card is drawn for, by the file's ending: its colour and its word. */
const KINDS = [
  ['pdf', ['pdf']],
  ['doc', ['doc', 'docx', 'odt', 'rtf', 'pages']],
  ['sheet', ['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv', 'numbers']],
  ['slides', ['ppt', 'pptx', 'odp', 'key']],
  ['archive', ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso']],
  ['image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tif', 'tiff', 'avif', 'ico', 'psd', 'ai']],
  ['audio', ['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'wma', 'opus', 'mid', 'midi']],
  ['video', ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'm2ts', 'mts']],
  ['text', ['txt', 'md', 'log', 'ini', 'cfg', 'conf']],
  ['code', ['js', 'mjs', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'htm', 'css', 'scss', 'json', 'xml', 'yml', 'yaml', 'sh', 'ps1', 'bat', 'sql', 'kt', 'swift']],
  ['app', ['exe', 'msi', 'dmg', 'pkg', 'apk', 'appimage', 'deb', 'rpm']],
  ['book', ['epub', 'mobi', 'azw', 'azw3', 'djvu']],
];
const KIND_OF = new Map(KINDS.flatMap(([kind, exts]) => exts.map((ext) => [ext, kind])));

/** A file's ending, small letters, from its own name: '' when it has none. */
export function fileExt(name) {
  const base = String(name ?? '').split(/[\\/]/).pop();
  const at = base.lastIndexOf('.');
  if (at <= 0 || at === base.length - 1) return '';
  const ext = base.slice(at + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

/** A name cut to max characters by its stem: the ending, which says the kind, stays.
 * Characters, not UTF-16 units: an emoji cut in half was kept as "�" (hunt B24). */
export function clipName(name, max) {
  const chars = Array.from(String(name ?? ''));
  if (chars.length <= max) return chars.join('');
  const ext = fileExt(chars.join(''));
  return ext ? `${chars.slice(0, max - ext.length - 1).join('')}.${chars.slice(-ext.length).join('')}` : chars.slice(0, max).join('');
}

/** The kind a card is coloured for: pdf, doc, sheet, … or `file`. */
export const fileKind = (name) => KIND_OF.get(fileExt(name)) ?? 'file';

/** A size as people read it: 820 B, 14 KB, 1.2 MB, 3.4 GB. */
export function fileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)} ${units[i]}`;
}

/** What the card says under the name: the ending and the size — `PDF · 1.2 MB`. */
export function fileLabel(name, bytes) {
  const ext = fileExt(name);
  return [ext ? ext.toUpperCase() : 'FILE', fileSize(bytes)].filter(Boolean).join(' · ');
}

/** A note's attached file, by its address: in its folder, or sealed in a black hole. */
export const isAttachUrl = (url) => /^nebula-media:\/\/(?:note|hole\/[\w-]{1,120})\/[\w-]{1,120}\/att-[a-z0-9]+-[0-9a-f]{8}\.[a-z0-9]{2,5}$/.test(String(url ?? ''));

/**
 * Whether an attached file's address is the open note's own: its note, and its
 * black hole or none. A card pasted from another note names that note's file,
 * and is refused — a note opens only its own files.
 * @param {string} url
 * @param {{id?: string|null, hole?: string|null}|null} owner the open note
 */
export function ownsAttachUrl(url, owner) {
  if (!isAttachUrl(url) || !owner?.id) return false;
  const [, place, rest] = /^nebula-media:\/\/(note|hole\/[\w-]+)\/(.+)$/.exec(String(url));
  const hole = place === 'note' ? null : place.slice(5);
  return rest.split('/')[0] === String(owner.id) && hole === (owner.hole ? String(owner.hole) : null);
}

/**
 * @param {string} url the file's address in the note's folder (or its black hole)
 * @param {string} name the file's own name, as it came
 * @param {number} [size] its bytes
 * @param {Document} [doc]
 */
export function makeAttachBlock(url, name, size, doc = document) {
  const card = doc.createElement('div');
  card.className = 'link-block link-attach';
  card.setAttribute('contenteditable', 'false');
  card.dataset.blockType = 'link';
  card.dataset.kind = 'attach';
  card.dataset.name = clipName(name || 'file', 200);
  if (Number.isFinite(Number(size)) && Number(size) >= 0) card.dataset.size = String(Math.round(Number(size)));
  card.dataset.src = isAttachUrl(url) ? url : '';

  const icon = doc.createElement('span');
  icon.className = 'attach-icon';
  icon.dataset.type = fileKind(card.dataset.name);
  const ext = doc.createElement('span');
  ext.className = 'attach-icon__ext';
  ext.textContent = (fileExt(card.dataset.name) || 'file').toUpperCase().slice(0, 4);
  icon.append(ext);

  const label = doc.createElement('a');
  label.className = 'link-card';
  const badge = doc.createElement('span');
  badge.className = 'link-card__kind';
  badge.textContent = fileLabel(card.dataset.name, card.dataset.size);
  const title = doc.createElement('strong');
  title.className = 'link-card__title';
  title.textContent = card.dataset.name;
  label.append(badge, title);

  const remove = doc.createElement('button');
  remove.type = 'button';
  remove.className = 'link-del';
  remove.dataset.linkRemove = 'true';
  remove.title = t('Remove file');
  remove.textContent = '×';

  card.append(icon, label, remove);
  return card;
}

/**
 * The name a card shows for its file: the one it came with, ending in the
 * stored file's ending — the rule Open and Save a copy name the copy by
 * (attachedName, electron/opened-files.js). The name is note text: a card
 * calling a stored .exe "invoice.pdf" shows "invoice.pdf.exe" (hunt B13). A
 * stored .bin is a file whose ending is not a plain one: a plain one over it is
 * forged, any other ("main.c", "Makefile", ".env" - a leading dot is no
 * ending) is the file's own.
 */
export function shownName(name, url) {
  const stored = /\.([a-z0-9]{2,5})$/.exec(isAttachUrl(url) ? url : '')?.[1];
  const base = String(name ?? '').replace(/[.\s]+$/, '');
  if (!stored || !base) return String(name ?? '');
  if (stored === 'bin') return /.\.[a-z0-9]{2,5}$/i.test(base) ? `${base}.bin` : base;
  return base.toLowerCase().endsWith(`.${stored}`) ? base : `${base}.${stored}`;
}

/**
 * A card's face — its logo and its label — drawn again from what it holds when
 * they say anything else: the face is note text too (hunt B13).
 */
function redrawFace(card) {
  const fresh = makeAttachBlock(card.dataset.src, shownName(card.dataset.name || 'file', card.dataset.src), card.dataset.size, card.ownerDocument);
  for (const sel of ['.attach-icon', '.link-card']) {
    const now = card.querySelector(`:scope > ${sel}`);
    const want = fresh.querySelector(`:scope > ${sel}`);
    if (now?.outerHTML === want.outerHTML) continue;
    if (now) now.replaceWith(want);
    else if (sel === '.attach-icon') card.prepend(want);
    else card.querySelector(':scope > .attach-icon').after(want);
  }
}

/** The bar as this version draws it: one drawn by an older one is drawn again. */
const BAR_VERSION = '1';

/**
 * Every card made a control again, its address only ever a note's own file,
 * and its buttons drawn — on the screen, never into the note. A file still on
 * its way from another computer says so in their place (1.0.4, file-video.js).
 */
export function refreshAttachBlocks(root) {
  for (const card of root.querySelectorAll('.link-block.link-attach')) {
    card.setAttribute('contenteditable', 'false');
    if (!isAttachUrl(card.dataset.src)) card.dataset.src = '';
    redrawFace(card);
    let bar = card.querySelector(':scope > .attach-bar');
    if (bar?.dataset.v === BAR_VERSION) { paintComingAttach(card); continue; }
    bar?.remove();
    bar = card.ownerDocument.createElement('div');
    bar.className = 'attach-bar';
    bar.dataset.v = BAR_VERSION;
    bar.setAttribute('contenteditable', 'false');
    const button = (act, text, title) => {
      const b = card.ownerDocument.createElement('button');
      b.type = 'button';
      b.dataset.attach = act;
      b.textContent = t(text);
      b.title = t(title);
      return b;
    };
    bar.append(
      button('open', 'Open', 'Open a copy with its own program'),
      button('save', 'Save a copy', 'Save a copy of the file on the computer'),
    );
    const del = card.querySelector(':scope > .link-del');
    if (del) del.before(bar); else card.append(bar);
    paintComingAttach(card);
  }
}

/**
 * A click on a card saves a copy; its Open hands one to the file's own program.
 * @param {HTMLElement} editor
 * @param {{say?: (text: string) => void, owner?: () => ({id?: string|null, hole?: string|null}|null)}} [opts]
 *   owner: the open note, when known — a card naming any other note's file is refused
 */
export function initAttachCards(editor, { say = () => {}, owner = null } = {}) {
  if (!editor) return;
  const cardOf = (el) => { const card = el?.closest?.('.link-block.link-attach'); return card && editor.contains(card) ? card : null; };
  const busy = new WeakSet();
  async function act(card, what) {
    const media = window.nebula?.media;
    let url = card.dataset.src;
    const name = card.dataset.name || card.querySelector('.link-card__title')?.textContent || '';
    if (!media?.saveFile || !isAttachUrl(url)) { say('The file is not in this note'); return; }
    // Still on its way from another computer (1.0.4): there is no file to open or copy yet.
    if (card.classList.contains('is-coming')) { say('This file is still syncing'); return; }
    if (busy.has(card)) return;
    busy.add(card);
    try {
      const mine = owner?.();
      if (mine && !ownsAttachUrl(url, mine)) {
        // A card still naming another note's file: pasted this session, or brought
        // back by an undo after its paste was adopted. The file is copied in here and the
        // card names this note from now on; when that cannot be done, the click says why.
        const res = await media.adoptFile?.(mine.id, mine.hole ?? null, url).catch(() => null);
        if (res?.ok) { card.dataset.src = url = res.url; }
        else { say(res?.error === 'locked' ? 'Open the black hole first' : 'The file is not in this note'); return; }
      }
      const res = what === 'open' ? await media.openFile(url, name) : await media.saveFile(url, name);
      if (res?.ok) say(what === 'open' ? 'Opened a copy of the file' : 'Saved a copy of the file');
      else if (!res?.canceled) say(res?.error === 'locked' ? 'Open the black hole first' : (what === 'open' ? 'The file could not be opened' : 'The file could not be saved'));
    } catch {
      say(what === 'open' ? 'The file could not be opened' : 'The file could not be saved');
    } finally {
      busy.delete(card);
    }
  }
  editor.addEventListener('click', (e) => {
    const card = cardOf(e.target);
    if (!card || e.target.closest('[data-link-remove], .embed-h')) return;
    const button = e.target.closest('.attach-bar [data-attach]');
    if (!button && !e.target.closest('.link-card, .attach-icon')) return;
    e.preventDefault();
    e.stopPropagation();
    void act(card, button?.dataset.attach === 'open' ? 'open' : 'save');
  }, true);
  // A press on the bar is the bar's: it neither picks the card up nor moves the caret.
  editor.addEventListener('mousedown', (e) => { if (e.target.closest?.('.attach-bar') && cardOf(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
}

/** How far a press must move before a card is carried (block-drag.js TAKE). */
const CARRY = 8;

/**
 * Whether a card carried to that point has left the note for a place a file
 * can be let go: out of the window, or over the AI panel.
 * @param {number} x
 * @param {number} y in the window
 * @param {Document} [doc]
 */
export function carriedOut(x, y, doc = document) {
  const win = doc.defaultView;
  if (x <= 0 || y <= 0 || x >= win.innerWidth - 1 || y >= win.innerHeight - 1) return true;
  return !!doc.elementFromPoint?.(x, y)?.closest?.('#ai-panel');
}

/**
 * What the system's drag is carrying, when it began in this note.
 *
 * The owner: "I pulled it to the right, did not let it go there, pulled it
 * back and let it go in the note: a copy was made." Come back, the system's
 * drag is a file dropped on the note like any other. The note knows its own
 * (`takeCarried`): a card goes to where it is let go, a picture stays.
 *
 * While the system drags, the page sees no mouse; the first move without the
 * button, or a press, says that drag is over and the next drop is another's.
 * @type {null | {el: HTMLElement, ext: string}}
 */
let carriedNow = null;
let carriedWatched = false;
/** The system's drag that was asked for and has not answered yet. */
let asked = null;
const extOf = (name) => (/\.([a-z0-9]{1,8})$/i.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();
/**
 * @param {HTMLElement} el the card or the picture
 * @param {string} name
 * @param {Promise<unknown>|null} [started] the system's drag, asked for: answered once it began — on Windows, once it is over
 */
function carryOut(el, name, started = null) {
  carriedNow = { el, ext: extOf(name) };
  asked = started;
  Promise.resolve(started).catch(() => {}).then(() => { if (asked === started) asked = null; });
  // The system's drag has a picture of its own.
  hideGhost();
  // Whatever was moving it within the note gives up: it is not let go there (block-drag.js).
  window.dispatchEvent(new CustomEvent('nebula-carried-out'));
  if (carriedWatched) return;
  carriedWatched = true;
  // The button let go before the system's drag began (a picture's copy is made first): that drag must not begin
  // with no button held — it would be let go at once, wherever the pointer is. Until it has answered, what it
  // lets go in the note is still the note's own.
  const letGo = () => {
    if (!asked) { carriedNow = null; return; }
    window.nebula?.media?.carryEnd?.();
  };
  window.addEventListener('mousemove', (e) => { if (!(e.buttons & 1)) letGo(); }, true);
  window.addEventListener('mouseup', () => { if (asked) window.nebula?.media?.carryEnd?.(); }, true);
  window.addEventListener('mousedown', () => { carriedNow = null; }, true);
}

/**
 * The card or picture of this note that the files of a drop are a copy of, once.
 * @param {File[]} files what was dropped
 * @returns {HTMLElement|null}
 */
export function takeCarried(files) {
  const was = carriedNow;
  carriedNow = null;
  if (!was?.el.isConnected || files?.length !== 1) return null;
  return was.ext && extOf(files[0].name) !== was.ext ? null : was.el;
}

/**
 * A file's card pulled out of the note (1.0.4).
 *
 * The owner: "I should be able to take the files in a note — a docx, any kind
 * — out with the mouse, onto the desktop or into the AI panel." Within the
 * note the card is moved as every card is (block-drag.js). Once the pointer
 * is out of the window, or over the AI panel, the pull is the system's own
 * drag of a file: a copy, the one Open makes (electron/opened-files.js),
 * which Explorer, Finder or the page in the panel takes as any file dropped
 * on it. The note keeps its file, in an Only view note too.
 *
 * The copy is made as soon as the card is carried, so it is there when the
 * pointer leaves; while it is carried the panel's pages let the pointer
 * through (body.attach-carried), or the window would lose it at their edge.
 * @param {HTMLElement} editor
 * @param {{owner?: () => ({id?: string|null, hole?: string|null}|null)}} [opts]
 */
export function initAttachCarry(editor, { owner = null } = {}) {
  if (!editor) return;
  /** @type {null | {url: string, name: string, card: HTMLElement, x: number, y: number, carried: boolean}} */
  let held = null;
  const drop = () => {
    if (!held) return;
    if (held.carried) window.nebula?.media?.carryEnd?.();
    held = null;
    document.body.classList.remove('attach-carried');
  };
  editor.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const card = e.target.closest?.('.link-block.link-attach');
    // Anywhere on the card but its buttons (the owner: "not only by the middle of it").
    if (!card || !editor.contains(card) || e.target.closest('button, select, input')) return;
    const url = card.dataset.src;
    const mine = owner?.();
    // Only the open note's own file: one pasted from another note is adopted at a click first.
    if (!window.nebula?.media?.dragFile || !isAttachUrl(url) || (mine && !ownsAttachUrl(url, mine))) return;
    held = { url, name: card.dataset.name || '', card, x: e.clientX, y: e.clientY, carried: false };
  }, true);
  window.addEventListener('mousemove', (e) => {
    if (!held) return;
    if (!(e.buttons & 1) || !held.card.isConnected) { drop(); return; }
    const media = window.nebula.media;
    if (!held.carried) {
      if (Math.abs(e.clientX - held.x) < CARRY && Math.abs(e.clientY - held.y) < CARRY) return;
      held.carried = true;
      document.body.classList.add('attach-carried');
      void media.carryFile?.(held.url, held.name)?.catch?.(() => {});
    }
    if (!carriedOut(e.clientX, e.clientY)) return;
    const { url, name, card } = held;
    held = null;
    document.body.classList.remove('attach-carried');
    carryOut(card, name, media.dragFile(url, name));
  });
  window.addEventListener('mouseup', drop);
  window.addEventListener('blur', drop);
}

/** A picture's address a copy can be made of: a file of a note, or the picture itself written into the text. */
const isPictureSrc = (src) => /^nebula-media:\/\/note\/[\w-]{1,120}\/[\w-]{1,80}\.[a-z0-9]{2,5}$|^nebula-media:\/\/hole\/[\w-]{1,120}\/[\w-]{1,120}\/pic-[0-9a-f]{32}\.[a-z]{3,4}$|^data:image\/[a-z+]+;base64,/.test(String(src ?? ''));

/**
 * A picture pulled out of the note (1.0.4, the owner: "resimin de sürüklenmesi
 * lazim"). Within the note a picture is moved as it always was (rich-paste.js);
 * once the pointer is out of the window, or over the AI panel, that move is
 * given up (`onOut`) and the pull is the system's own drag of a copy of the
 * picture. In an Only view note too: the note is not changed by it.
 * @param {HTMLElement} editor
 * @param {{owner?: () => ({id?: string|null, hole?: string|null}|null), onOut?: () => void}} [opts]
 */
export function initPictureCarry(editor, { owner = null, onOut = null } = {}) {
  if (!editor) return;
  /** @type {null | {src: string, figure: HTMLElement, x: number, y: number, carried: boolean}} */
  let held = null;
  const drop = () => {
    if (!held) return;
    held = null;
    document.body.classList.remove('attach-carried');
  };
  editor.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest?.('.image-h, .image-caption')) return;
    const figure = e.target.closest?.('.note-image');
    if (!figure || !editor.contains(figure) || figure.matches('.note-widget, .note-video')) return;
    const src = figure.querySelector('img')?.getAttribute('src');
    if (!window.nebula?.media?.dragPicture || !isPictureSrc(src)) return;
    held = { src, figure, x: e.clientX, y: e.clientY, carried: false };
  }, true);
  window.addEventListener('mousemove', (e) => {
    if (!held) return;
    if (!(e.buttons & 1) || !held.figure.isConnected) { drop(); return; }
    if (!held.carried) {
      if (Math.abs(e.clientX - held.x) < CARRY && Math.abs(e.clientY - held.y) < CARRY) return;
      held.carried = true;
      document.body.classList.add('attach-carried');
    }
    if (!carriedOut(e.clientX, e.clientY)) return;
    const { src, figure } = held;
    drop();
    onOut?.();
    // A picture written into the text is copied under a name of its own: any one picture is it.
    carryOut(figure, src.startsWith('data:') ? '' : src, window.nebula.media.dragPicture(src, owner?.() ?? null));
  });
  window.addEventListener('mouseup', drop);
  window.addEventListener('blur', drop);
}

/**
 * How a drop is taken: files that are all pictures, or a video, go in as they
 * always did; anything else among them, and every file dropped becomes a card.
 * @param {File[]} files
 * @param {{isImage: (f: File) => boolean, isVideo: (f: File) => boolean}} kinds
 * @returns {'attach'|'video'|'image'|null}
 */
export function dropKind(files, { isImage, isVideo }) {
  const list = [...(files ?? [])];
  if (!list.length) return null;
  if (list.some((f) => !isImage(f) && !isVideo(f))) return 'attach';
  if (list.some(isVideo)) return 'video';
  return 'image';
}
