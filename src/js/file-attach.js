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
 * and its buttons drawn — on the screen, never into the note.
 */
export function refreshAttachBlocks(root) {
  for (const card of root.querySelectorAll('.link-block.link-attach')) {
    card.setAttribute('contenteditable', 'false');
    if (!isAttachUrl(card.dataset.src)) card.dataset.src = '';
    redrawFace(card);
    let bar = card.querySelector(':scope > .attach-bar');
    if (bar?.dataset.v === BAR_VERSION) continue;
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
