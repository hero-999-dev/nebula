/**
 * A big attached file or picture still on its way from another computer
 * (1.0.4, src/js/file-video.js — the owner, 2026-11-15: "tailscale yapalim
 * kücükleri"): its card, its frame says how much of it is here, in place, and
 * none of that is ever saved. The video's own card is in tests/file-video.test.js.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setComingVideos, videoComing, videoArrived, comingVideoWords, paintComingAttach, paintComingPicture } from '../src/js/file-video.js';
import { makeAttachBlock, refreshAttachBlocks, initAttachCards } from '../src/js/file-attach.js';
import { serializeNote, hasTransient } from '../src/js/note-markup.js';
import { STRINGS, t } from '../src/js/i18n.js';

const NOTE = 'n-1_Ab';
const ATT = 'att-m1abc-0a1b2c3d.pdf';
const PIC = 'pic-m1abc-0a1b2c3d.png';
const english = (pct, kind = 'video') => `${kind === 'picture' ? 'Picture' : kind === 'file' ? 'File' : 'Video'} syncing · ${pct} %`;
const tick = () => new Promise((r) => setTimeout(r, 0));

const figure = (src, cls = 'note-image note-image--inline') => `<figure class="${cls}" contenteditable="false" data-block-type="image" data-ratio="1.5" style="width: 300px;"><img src="${src}" alt="Pasted image" draggable="false"></figure>`;

function page(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.replaceChildren(root);
  refreshAttachBlocks(root);
  return root;
}

afterEach(() => {
  setComingVideos([]);
  comingVideoWords(english);
  delete window.nebula;
  document.body.replaceChildren();
});

describe('an attached file still on its way from another computer', () => {
  const attached = () => page(`<p>before</p>${makeAttachBlock(`nebula-media://note/${NOTE}/${ATT}`, 'report.pdf', 9_000_000).outerHTML}<p>after</p>`);
  const said = (card) => card.querySelector('.file-coming__text')?.textContent ?? null;
  const filled = (card) => card.querySelector('.file-coming__meter i')?.style.width ?? null;

  it('says so in its bar, with how much of it is here, moves on, and is a card again once the file is whole — none of it saved', () => {
    const root = attached();
    const stored = serializeNote(root);
    const card = root.querySelector('.link-attach');
    // The whole list: this card's file, and one nobody shows on this page.
    setComingVideos([{ id: NOTE, name: ATT, got: 250, size: 1000 }, { id: 'other', name: ATT, got: 5, size: 10 }], root);
    expect(card.classList.contains('is-coming')).toBe(true);
    expect(said(card)).toBe('File syncing · 25 %');
    expect(filled(card)).toBe('25%');
    // In the bar, before its buttons, which stay for when the file is here.
    const bar = card.querySelector(':scope > .attach-bar');
    expect(bar.firstElementChild.className).toBe('file-coming');
    expect([...bar.querySelectorAll('[data-attach]')].map((b) => b.dataset.attach)).toEqual(['open', 'save']);
    videoComing({ id: NOTE, name: ATT, got: 625, size: 1000 }, root);
    expect(said(card)).toBe('File syncing · 62 %');
    // Every byte here, yet not checked and put in its place: 99, not 100.
    videoComing({ id: NOTE, name: ATT, got: 1000, size: 1000 }, root);
    expect(said(card)).toBe('File syncing · 99 %');
    // The note shown again meanwhile: still one word.
    refreshAttachBlocks(root);
    expect(card.querySelectorAll('.file-coming')).toHaveLength(1);
    expect(card.classList.contains('is-coming')).toBe(true);
    // On the screen only.
    expect(hasTransient(root)).toBe(true);
    expect(serializeNote(root)).toBe(stored);
    // In the app's language, when the window's half of sync gives the words.
    comingVideoWords((pct, kind) => `${kind}:${pct}`);
    videoComing({ id: NOTE, name: ATT, got: 500, size: 1000 }, root);
    expect(said(card)).toBe('file:50');
    // Another file arriving changes nothing here; this one arriving gives the card its buttons back.
    videoArrived('other', ATT, root);
    expect(card.classList.contains('is-coming')).toBe(true);
    videoArrived(NOTE, ATT, root);
    expect(card.classList.contains('is-coming')).toBe(false);
    expect(card.querySelector('.file-coming')).toBeNull();
    expect(paintComingAttach(card)).toBe(false);
    expect(serializeNote(root)).toBe(stored);
  });

  it('says so on a note opened after the list was learned, and loses the word when the list no longer has it', () => {
    setComingVideos([{ id: NOTE, name: ATT, got: 300, size: 1000 }]);
    const root = attached();
    const card = root.querySelector('.link-attach');
    expect(card.classList.contains('is-coming')).toBe(true);
    expect(said(card)).toBe('File syncing · 30 %');
    setComingVideos([], root);
    expect(card.classList.contains('is-coming')).toBe(false);
    expect(said(card)).toBeNull();
  });

  it('neither opens nor copies what is not here yet: a click says the file is still syncing', async () => {
    const root = attached();
    const card = root.querySelector('.link-attach');
    const heard = [];
    const saveFile = vi.fn(async () => ({ ok: true }));
    const openFile = vi.fn(async () => ({ ok: true }));
    window.nebula = { media: { saveFile, openFile } };
    initAttachCards(root, { say: (text) => heard.push(text) });
    setComingVideos([{ id: NOTE, name: ATT, got: 300, size: 1000 }], root);
    card.querySelector('.link-card').click();
    card.querySelector('[data-attach="open"]').click();
    await tick();
    expect(heard).toEqual(['This file is still syncing', 'This file is still syncing']);
    expect(saveFile).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
    // Here, whole: a click saves a copy, as ever.
    videoArrived(NOTE, ATT, root);
    card.querySelector('.link-card').click();
    await tick();
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(heard.at(-1)).toBe('Saved a copy of the file');
  });

  it('is only ever a note’s own file: one sealed in a black hole is never said to be coming', () => {
    const root = page(makeAttachBlock(`nebula-media://hole/bh-1/${NOTE}/${ATT}`, 'report.pdf', 9_000_000).outerHTML);
    setComingVideos([{ id: NOTE, name: ATT, got: 300, size: 1000 }], root);
    const card = root.querySelector('.link-attach');
    expect(card.classList.contains('is-coming')).toBe(false);
    expect(card.querySelector('.file-coming')).toBeNull();
  });
});

describe('a picture still on its way from another computer', () => {
  const src = `nebula-media://note/${NOTE}/${PIC}`;
  const said = (fig) => fig.querySelector(':scope > .picture-coming .picture-coming__text')?.textContent ?? null;

  it('says so where the picture will be, moves on, and is a picture again once the file is whole — none of it saved', () => {
    const root = page(`<p>before</p>${figure(src)}<p>after</p>`);
    const stored = serializeNote(root);
    const fig = root.querySelector('.note-image');
    setComingVideos([{ id: NOTE, name: PIC, got: 250, size: 1000 }], root);
    expect(fig.classList.contains('is-coming')).toBe(true);
    expect(said(fig)).toBe('Picture syncing · 25 %');
    expect(fig.querySelector('.picture-coming__meter i').style.width).toBe('25%');
    // No place for a caret, and never the note's.
    expect(fig.querySelector('.picture-coming').getAttribute('contenteditable')).toBe('false');
    expect(hasTransient(root)).toBe(true);
    expect(serializeNote(root)).toBe(stored);
    videoComing({ id: NOTE, name: PIC, got: 620, size: 1000 }, root);
    expect(said(fig)).toBe('Picture syncing · 62 %');
    // Painted again (the note shown again): one word still.
    expect(paintComingPicture(fig)).toBe(true);
    expect(fig.querySelectorAll('.picture-coming')).toHaveLength(1);
    videoArrived(NOTE, PIC, root);
    expect(fig.classList.contains('is-coming')).toBe(false);
    expect(fig.querySelector('.picture-coming')).toBeNull();
    expect(paintComingPicture(fig)).toBe(false);
    expect(root.innerHTML).toBe(stored);
  });

  it('is only ever a picture in the note’s folder: not a pasted one, a widget, a video’s still, or one sealed in a black hole', () => {
    const root = page([
      figure('data:image/png;base64,AAAA'),
      figure(src, 'note-image note-image--inline note-widget'),
      figure(src, 'note-image note-image--inline note-video'),
      figure(`nebula-media://hole/bh-1/${NOTE}/pic-0123456789abcdef0123456789abcdef.png`),
    ].join(''));
    const stored = root.innerHTML;
    setComingVideos([{ id: NOTE, name: PIC, got: 250, size: 1000 }], root);
    expect(root.querySelector('.is-coming')).toBeNull();
    expect(root.querySelector('.picture-coming')).toBeNull();
    expect(root.innerHTML).toBe(stored);
    expect(paintComingPicture(null)).toBe(false);
    expect(paintComingAttach(null)).toBe(false);
  });
});

describe('the words of a file still coming', () => {
  it('are said in every language, with the per cent in its place', () => {
    expect(t('File syncing · 62 %', 'de')).toBe('Datei wird synchronisiert · 62 %');
    expect(t('File syncing · 62 %', 'pl')).toBe('Synchronizacja pliku · 62 %');
    expect(t('File syncing · 62 %', 'tr')).toBe('Dosya eşitleniyor · %62');
    expect(t('Picture syncing · 7 %', 'de')).toBe('Bild wird synchronisiert · 7 %');
    expect(t('Picture syncing · 7 %', 'pl')).toBe('Synchronizacja obrazu · 7 %');
    expect(t('Picture syncing · 7 %', 'tr')).toBe('Resim eşitleniyor · %7');
    expect(t('File syncing · 0 %', 'en')).toBe('File syncing · 0 %');
    expect(STRINGS['This file is still syncing']).toHaveLength(3);
    expect(new Set(STRINGS['This file is still syncing']).size).toBe(3);
  });
});
