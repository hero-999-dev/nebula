/**
 * Videos in an export (0.9.3).
 *
 * The owner: "videos are not put on the A4 in the export — I want them there,
 * the way they show in Nebula; exports with or without video, and without
 * means only the embed's link". A video embed is a live player in the note,
 * which no page and no document can hold, so:
 *
 *   with     the video as it shows: its still, the play button over it, as
 *            wide as the card, linked to the video (Word also plays it, see
 *            office.js), its title under it. HTML keeps a real player.
 *   without  the embed's link only: ▶ and the title, linked.
 *
 * The still comes from the site (main process, link-metadata.js); offline, or
 * from a site without one, a dark frame with the title stands in. The choice
 * is remembered and shown in the export menu and the export preview.
 */
import { embedSource } from './rich-paste.js';

export const VIDEO_KEY = 'nebula:export-videos';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function getVideoMode(storage = globalThis.localStorage) {
  try { return storage?.getItem(VIDEO_KEY) === 'without' ? 'without' : 'with'; } catch { return 'with'; }
}
export function setVideoMode(mode, storage = globalThis.localStorage) {
  const m = mode === 'without' ? 'without' : 'with';
  try { storage?.setItem(VIDEO_KEY, m); } catch { /* this run only */ }
  return m;
}

/** Whether the note holds a video embed. */
export function hasVideos(html) {
  return /link-embed--video/.test(String(html ?? ''));
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * The video as it shows: its still, cropped to the card, a play button in the
 * middle (YouTube's red, Vimeo's blue, else dark), as a JPEG data URL.
 */
export async function videoPicture({ poster, site, title, width, height }) {
  const scale = Math.min(2, 1600 / Math.max(1, width));
  const w = Math.max(64, Math.round(width * scale));
  const h = Math.max(36, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#111';
  g.fillRect(0, 0, w, h);
  const img = poster ? await loadImage(poster) : null;
  if (img) {
    const s = Math.max(w / img.width, h / img.height);
    g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
  } else {
    g.fillStyle = '#e8e8e8';
    g.font = `${Math.round(h * 0.07)}px Georgia, serif`;
    g.textAlign = 'center';
    g.fillText(String(title || '').slice(0, 80), w / 2, h * 0.78, w * 0.9);
  }
  // The play button, as the player draws it.
  const bw = Math.round(Math.min(w, h) * 0.22);
  const bh = Math.round(bw * 0.7);
  const x = (w - bw) / 2;
  const y = (h - bh) / 2;
  g.fillStyle = site === 'youtube' ? 'rgba(255, 0, 0, 0.92)' : site === 'vimeo' ? 'rgba(0, 173, 239, 0.92)' : 'rgba(20, 20, 20, 0.85)';
  const r = bh * 0.25;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + bw, y, x + bw, y + bh, r);
  g.arcTo(x + bw, y + bh, x, y + bh, r);
  g.arcTo(x, y + bh, x, y, r);
  g.arcTo(x, y, x + bw, y, r);
  g.closePath();
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(x + bw * 0.4, y + bh * 0.28);
  g.lineTo(x + bw * 0.4, y + bh * 0.72);
  g.lineTo(x + bw * 0.66, y + bh * 0.5);
  g.closePath();
  g.fill();
  try { return canvas.toDataURL('image/jpeg', 0.86); } catch { return null; }
}

/** A bookmark card as the note draws one: its kind, its title, its address. */
export function bookmarkCard(doc, url, title) {
  const card = doc.createElement('div');
  card.className = 'link-block link-bookmark';
  card.dataset.blockType = 'link';
  card.dataset.kind = 'bookmark';
  card.dataset.url = url;
  card.innerHTML = `<a class="link-card" href="${esc(url)}"><span class="link-card__kind">Bookmark</span><strong class="link-card__title">${esc(title)}</strong><small class="link-card__url">${esc(url)}</small></a>`;
  return card;
}

/**
 * The note's HTML with each video embed made ready for an export. An embed of
 * a web page cannot be shown on paper or in a document either: it goes out
 * as the bookmark it is underneath.
 * @param {string} html @param {'with'|'without'} mode
 * @param {{ poster?: (url: string) => Promise<{ok:boolean, dataUrl?:string, title?:string, site?:string}> }} deps
 */
export async function prepareVideos(html, mode, { poster } = {}) {
  if (!/link-embed/.test(String(html ?? ''))) return html;
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  for (const card of [...doc.querySelectorAll('.link-embed:not(.link-embed--video)')]) {
    const url = card.querySelector('a[href]')?.getAttribute('href') || card.dataset.url || '';
    if (!url) { card.remove(); continue; }
    card.replaceWith(bookmarkCard(doc, url, (card.querySelector('.link-card__title')?.textContent || url).trim()));
  }
  for (const card of [...doc.querySelectorAll('.link-embed--video')]) {
    const url = card.querySelector('a[href]')?.getAttribute('href') || card.dataset.url || '';
    let title = (card.querySelector('.link-card__title')?.textContent || '').trim();
    if (!url) { card.remove(); continue; }
    if (mode === 'without') {
      // As a bookmark, the way Nebula shows one (the owner: "without, like a bookmark").
      card.replaceWith(bookmarkCard(doc, url, `▶ ${title || url}`));
      continue;
    }
    const width = Number.parseFloat(card.style.width) || 640;
    const height = Number.parseFloat(card.style.getPropertyValue('--embed-h')) || Math.round((width * 9) / 16);
    const got = (await poster?.(url).catch(() => null)) ?? null;
    if (got?.title && (!title || title === url || /^https?:/i.test(title))) title = got.title;
    const site = got?.site || (/vimeo/.test(url) ? 'vimeo' : /youtu/.test(url) ? 'youtube' : '');
    // Drawn with its play button; the bare still if nothing can be drawn; its link if there is no picture at all.
    const src = (await videoPicture({ poster: got?.ok ? got.dataUrl : null, site, title, width, height }).catch(() => null))
      || (got?.ok ? got.dataUrl : null);
    if (!src) {
      card.replaceWith(bookmarkCard(doc, url, `▶ ${title || url}`));
      continue;
    }
    const figure = doc.createElement('figure');
    figure.className = 'note-image note-image--inline note-video';
    figure.dataset.ratio = String(width / height);
    figure.dataset.video = embedSource(url).src;
    figure.style.width = `${Math.round(width)}px`;
    figure.innerHTML = `<a href="${esc(url)}"><img src="${src}" alt="${esc(title || 'Video')}"></a><figcaption>▶ <a href="${esc(url)}">${esc(title || url)}</a></figcaption>`;
    card.replaceWith(figure);
  }
  return doc.body.innerHTML;
}
