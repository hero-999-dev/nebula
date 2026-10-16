/**
 * Pictures a note no longer shows, asked about before they are deleted (0.9.4).
 *
 * What a note no longer names leaves its folder and every backup at the next
 * start — without a word where the person took it out, however many they
 * were. Where nothing in the app took it out (a fault, a file changed outside
 * the app) the main process keeps the files (electron/note-media.js
 * noteReleases, tidyVault) until the person says what is to become of them: Delete, and they go for good; Open the note, and they stay — in its
 * folder and in the backups — and the question comes again at the next start.
 *
 * And where it was a fault: Put back in the note (the owner, 0.9.4: "is there
 * an answer, when a fault does happen?"). The files are written into the note
 * again — at its end, for where they stood is not known any more — and the
 * person is told so: "add a warning too, that they have to be put back in
 * their old place."
 */
import { t } from './i18n.js';
import { makeVideoBlock, VIDEO_EXTENSIONS } from './file-video.js';
import { makeAttachBlock } from './file-attach.js';

const PICTURES = new Set(['png', 'jpg', 'gif', 'webp', 'bmp', 'avif', 'svg']);
const VIDEOS = new Set(VIDEO_EXTENSIONS);
const FILE = /^[\w-]{1,80}\.([a-z0-9]{2,5})$/;
/** As wide as a pasted picture is at most. */
const WIDEST = 560;

/** How large a picture is, from its file; a picture that cannot be read is given a size all the same. */
function sizeOf(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 420, height: image.naturalHeight || 280 });
    image.onerror = () => resolve({ width: 420, height: 280 });
    image.src = url;
  });
}

/**
 * The markup that puts a note's files back into it: each picture a picture in
 * the text, each video its player, each attached file its card (under the
 * name it is kept by: the one it came with was in the note), and a line to
 * type on after them.
 * @param {string} id the note
 * @param {string[]} files file names in the note's folder
 * @param {(url: string) => Promise<{width: number, height: number}>} [measure]
 * @returns {Promise<string>} '' when none of them is a picture, a video or an attached file
 */
export async function heldMarkup(id, files, measure = sizeOf) {
  const holder = document.createElement('div');
  for (const name of files ?? []) {
    const ext = FILE.exec(String(name))?.[1];
    if (!ext || !/^[\w-]{1,120}$/.test(String(id))) continue;
    const url = `nebula-media://note/${id}/${name}`;
    // An attached file first: it may end like a picture, and is none.
    if (/^att-[a-z0-9]+-[0-9a-f]{8}\./.test(name)) {
      holder.append(makeAttachBlock(url, name));
    } else if (PICTURES.has(ext)) {
      const { width, height } = await measure(url);
      const shown = Math.min(WIDEST, Math.max(1, width));
      const figure = document.createElement('figure');
      figure.className = 'note-image note-image--inline';
      figure.setAttribute('contenteditable', 'false');
      figure.dataset.blockType = 'image';
      figure.dataset.ratio = String(width / Math.max(1, height));
      figure.style.width = `${Math.round(shown)}px`;
      const image = document.createElement('img');
      image.setAttribute('src', url);
      image.alt = 'Pasted image';
      image.draggable = false;
      figure.append(image);
      holder.append(figure);
    } else if (VIDEOS.has(ext)) {
      holder.append(makeVideoBlock(url, name));
    }
  }
  if (!holder.children.length) return '';
  const line = document.createElement('p');
  line.append(document.createElement('br'));
  holder.append(line);
  return holder.innerHTML;
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (text, cls, run) => {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', run);
  return b;
};

/**
 * @param {object} deps
 * @param {(id: string) => ({title?: string}|null)} deps.noteOf
 * @param {(id: string) => void} deps.openNote
 * @param {(id: string, markup: string) => Promise<boolean>} deps.putBack the markup written at the end of the note, and the note shown
 * @returns {Promise<number>} how many notes were asked about
 */
export async function askAboutHeldMedia({ noteOf, openNote, putBack }) {
  const api = window.nebula?.media;
  if (!api?.held) return 0;
  let held = [];
  try { held = (await api.held()) ?? []; } catch { return 0; }
  held = held.filter((h) => h?.id && h.files > 0 && noteOf(h.id));
  if (!held.length) return 0;

  const overlay = el('div', 'overlay held-overlay');
  overlay.id = 'ov-held';
  const modal = el('div', 'modal held-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const close = () => overlay.remove();
  modal.append(
    el('p', 'dlg-title', t('Pictures no longer shown')),
    el('p', 'held-note', t('These notes no longer show pictures or videos they had, and they were not taken out in Nebula. Put them back in the note, or delete them for good. Nothing is deleted until you say so.')),
    el('p', 'held-note held-warning', t('Put back, they are added at the end of the note: you have to move them to where they were.')),
  );
  const list = el('div', 'held-list');
  for (const item of held) {
    const row = el('div', 'held-row');
    row.dataset.note = item.id;
    const what = el('div', 'held-what');
    const title = el('div', 'held-title', noteOf(item.id)?.title || 'Untitled');
    title.dataset.noI18n = '';
    what.append(title, el('div', 'held-count', t(item.files === 1 ? '1 picture or video' : `${item.files} pictures and videos`)));
    const del = button(t('Delete'), 'held-delete', async () => {
      del.disabled = true;
      const res = await api.dropHeld(item.id).catch(() => null);
      if (!res?.ok) { del.disabled = false; return; }
      row.remove();
      if (!list.children.length) close();
    });
    const open = button(t('Open the note'), 'held-open', () => { close(); openNote(item.id); });
    const back = button(t('Put back in the note'), 'held-back', async () => {
      back.disabled = true;
      const say = (text) => window.dispatchEvent(new CustomEvent('nebula-toast', { detail: text }));
      const res = await api.takeHeld(item.id).catch(() => null);
      const markup = res?.ok ? await heldMarkup(item.id, res.files) : '';
      if (!markup || !(await putBack(item.id, markup).catch(() => false))) { back.disabled = false; say('That did not work.'); return; }
      // The note is shown now, its pictures at its end: said, so that they are not left there.
      close();
      say('Put back at the end of the note. Move them to where they were.');
    });
    const actions = el('div', 'held-actions');
    actions.append(back, del, open);
    row.append(what, actions);
    list.append(row);
  }
  const foot = el('div', 'dlg-actions');
  foot.append(button(t('Later'), '', close));
  modal.append(list, foot);
  overlay.append(modal);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });

  // After What's new, where that is up: one question at a time.
  const whatsNew = document.getElementById('ov-whats-new');
  const show = () => { document.body.append(overlay); foot.querySelector('button')?.focus(); };
  if (!whatsNew || whatsNew.hidden) show();
  else {
    const seen = new MutationObserver(() => { if (whatsNew.hidden) { seen.disconnect(); show(); } });
    seen.observe(whatsNew, { attributes: true, attributeFilter: ['hidden'] });
  }
  return held.length;
}
