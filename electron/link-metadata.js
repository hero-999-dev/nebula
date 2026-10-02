/**
 * A bookmark's page title, fetched by the main process.
 *
 * Only the title: no cookies, nothing executed, at most 256 KB read and 8 s
 * waited, and the read stops at </title> or </head>. Anything else — not
 * http(s), credentials in the URL, not HTML — answers { ok: false } and the
 * card keeps showing the address.
 */

const MAX_BYTES = 262144;
const TIMEOUT_MS = 8000;

export async function fetchPageTitle(raw, { fetchImpl = globalThis.fetch } = {}) {
  let url;
  try { url = new URL(String(raw)); } catch { return { ok: false }; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return { ok: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let reader;
  try {
    const response = await fetchImpl(url.href, {
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' },
      credentials: 'omit',
    });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(type)) return { ok: false };

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let length = 0;
    while (length < MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/title\s*>/i.test(html) || /<\/head\s*>/i.test(html)) break;
    }
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]
      ?.replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
    return title ? { ok: true, title } : { ok: false };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
  }
}

/**
 * A video's picture and title, for an export that puts the video on the page
 * as it shows in the note (0.9.3). YouTube's own still (the largest it has),
 * or Vimeo's from its oEmbed; the title from the site's oEmbed. Only these two
 * sites, only https, no cookies, at most 4 MB and 8 s. { ok: false } otherwise:
 * the export then draws a plain frame with the title.
 */
const POSTER_MAX = 4 * 1024 * 1024;

export function videoOf(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  const host = u.hostname.replace(/^(?:www|m|music)\./, '');
  let id = '';
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.pathname === '/watch' ? (u.searchParams.get('v') || '') : ((u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]+)/) || [])[1] || '');
  }
  if (/^[\w-]{6,20}$/.test(id)) return { site: 'youtube', id, watch: `https://www.youtube.com/watch?v=${id}` };
  const vimeo = host === 'vimeo.com' && u.pathname.match(/^\/(\d{3,12})/);
  if (vimeo) return { site: 'vimeo', id: vimeo[1], watch: `https://vimeo.com/${vimeo[1]}` };
  const player = host === 'player.vimeo.com' && u.pathname.match(/^\/video\/(\d{3,12})/);
  if (player) return { site: 'vimeo', id: player[1], watch: `https://vimeo.com/${player[1]}` };
  return null;
}

async function fetchCapped(url, fetchImpl, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, credentials: 'omit', headers: { Accept: accept } });
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length') || 0);
    if (length > POSTER_MAX) return null;
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength > POSTER_MAX) return null;
    return { buf, type: response.headers.get('content-type') || '' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchVideoPoster(raw, { fetchImpl = globalThis.fetch } = {}) {
  const video = videoOf(raw);
  if (!video) return { ok: false };
  let title = '';
  let posterUrl = '';
  const oembed = video.site === 'youtube'
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(video.watch)}`
    : `https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(video.watch)}`;
  const meta = await fetchCapped(oembed, fetchImpl, 'application/json');
  if (meta) {
    try {
      const json = JSON.parse(new TextDecoder().decode(meta.buf));
      title = String(json.title ?? '').slice(0, 300);
      if (video.site === 'vimeo' && /^https:\/\/i\.vimeocdn\.com\//.test(String(json.thumbnail_url ?? ''))) posterUrl = json.thumbnail_url;
    } catch { /* no title */ }
  }
  const candidates = video.site === 'youtube'
    ? [`https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`]
    : (posterUrl ? [posterUrl] : []);
  for (const url of candidates) {
    const img = await fetchCapped(url, fetchImpl, 'image/*');
    if (!img || !/^image\/(jpeg|png|webp)/i.test(img.type)) continue;
    // YouTube answers a missing maxres with a 120x90 grey stand-in: too small to be the picture.
    if (img.buf.byteLength < 2000) continue;
    const mime = img.type.split(';')[0].trim().toLowerCase();
    return { ok: true, site: video.site, title, dataUrl: `data:${mime};base64,${Buffer.from(img.buf).toString('base64')}` };
  }
  return { ok: false, site: video.site, title };
}
