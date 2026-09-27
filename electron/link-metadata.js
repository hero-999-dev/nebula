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
