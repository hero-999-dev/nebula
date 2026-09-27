import { describe, it, expect, vi, afterEach } from 'vitest';
import { bindLinkPreview } from '../src/js/link-preview.js';

const event = (el, name, props = {}) => {
  const e = new Event(name);
  Object.assign(e, props);
  el.dispatchEvent(e);
};

const card = (kind = 'embed', url = 'https://example.com/', title = 'Address') => {
  document.body.innerHTML = `<div class="link-block" data-kind="${kind}"><strong class="link-card__title">${title}</strong>`
    + `${kind === 'embed' ? '<webview></webview><small class="link-embed-hint">Old always-on warning</small>' : ''}</div>`;
  const c = document.querySelector('.link-block');
  c.dataset.url = url;
  return c;
};

afterEach(() => { delete window.nebula; document.body.innerHTML = ''; });

describe('preview metadata and load status', () => {
  it('shows a warning only on a failed main page, and clears it after recovery', () => {
    const c = card();
    bindLinkPreview(c);
    const frame = c.querySelector('webview');
    const hint = c.querySelector('small');
    expect(hint.hidden).toBe(true);
    event(frame, 'did-fail-load', { errorCode: -105, isMainFrame: false });
    expect(hint.hidden).toBe(true);
    event(frame, 'did-fail-load', { errorCode: -105, isMainFrame: true });
    expect(hint.hidden).toBe(false);
    event(frame, 'did-finish-load');
    expect(hint.hidden).toBe(false);
    event(frame, 'did-start-loading');
    event(frame, 'did-finish-load');
    expect(hint.hidden).toBe(true);
  });

  it('uses the page title as text and binds old cards once', () => {
    const c = card();
    const changed = vi.fn();
    bindLinkPreview(c, { onTitle: changed });
    bindLinkPreview(c, { onTitle: changed });
    const frame = c.querySelector('webview');
    event(frame, 'page-title-updated', { title: '<img onerror=bad()> Title' });
    event(frame, 'did-finish-load');
    expect(c.querySelector('strong').textContent).toBe('<img onerror=bad()> Title');
    expect(c.querySelector('img')).toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('ignores a title reported while the page is still loading', () => {
    const c = card('embed', 'https://www.youtube.com/watch?v=x', 'www.youtube.com/watch?v=x');
    const changed = vi.fn();
    bindLinkPreview(c, { onTitle: changed, placeholder: 'www.youtube.com/watch?v=x' });
    const frame = c.querySelector('webview');
    event(frame, 'page-title-updated', { title: 'YouTube' });
    expect(c.querySelector('strong').textContent).toBe('www.youtube.com/watch?v=x');
    event(frame, 'page-title-updated', { title: 'A video - YouTube' });
    event(frame, 'did-finish-load');
    expect(c.querySelector('strong').textContent).toBe('A video - YouTube');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('never replaces a title the note already has, so opening a note is not an edit', () => {
    const c = card('embed', 'https://www.youtube.com/watch?v=x', 'Introducing a thing - YouTube');
    const changed = vi.fn();
    bindLinkPreview(c, { onTitle: changed, placeholder: 'www.youtube.com/watch?v=x' });
    const frame = c.querySelector('webview');
    event(frame, 'did-finish-load');
    event(frame, 'page-title-updated', { title: 'YouTube' });
    expect(c.querySelector('strong').textContent).toBe('Introducing a thing - YouTube');
    expect(changed).not.toHaveBeenCalled();
  });

  it('fetches bookmark metadata and decodes entities without executing HTML', async () => {
    window.nebula = { links: { title: vi.fn().mockResolvedValue({ ok: true, title: 'Research &amp; notes' }) } };
    const c = card('bookmark', 'https://example.com/test-title', 'example.com/test-title');
    bindLinkPreview(c, { placeholder: 'example.com/test-title' });
    await new Promise((r) => setTimeout(r, 0));
    expect(c.querySelector('strong').textContent).toBe('Research & notes');
  });

  it('treats an address an older version wrote in another format as untitled', async () => {
    window.nebula = { links: { title: vi.fn().mockResolvedValue({ ok: true, title: 'Timetable' }) } };
    const c = card('bookmark', 'https://www.example.com/plan/', 'HTTPS://example.com/plan');
    bindLinkPreview(c, { placeholder: 'www.example.com/plan' });
    await new Promise((r) => setTimeout(r, 0));
    expect(c.querySelector('strong').textContent).toBe('Timetable');
  });

  it('keeps a bookmark title the note already has', async () => {
    window.nebula = { links: { title: vi.fn().mockResolvedValue({ ok: true, title: 'Fetched' }) } };
    const c = card('bookmark', 'https://example.com/kept', 'My own title');
    bindLinkPreview(c, { placeholder: 'example.com/kept' });
    await new Promise((r) => setTimeout(r, 0));
    expect(c.querySelector('strong').textContent).toBe('My own title');
  });

  it('does not change a removed card when a previous note request finishes', async () => {
    let resolve;
    window.nebula = { links: { title: () => new Promise((r) => { resolve = r; }) } };
    const c = card('bookmark', 'https://example.com/stale');
    const changed = vi.fn();
    bindLinkPreview(c, { onTitle: changed });
    await Promise.resolve();
    c.remove();
    resolve({ ok: true, title: 'Too late' });
    await Promise.resolve();
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
  });
});
