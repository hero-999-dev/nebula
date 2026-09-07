/**
 * AI panel — Nebula Demo style: a horizontally scrollable tab strip of chat
 * services, each keeping its own persistent session, plus custom sites.
 * Real webviews on the desktop; open-in-browser links in preview.
 */

import { loadJson, saveJson, generateId } from './storage.js';

export const AI_SERVICES = {
  claude: { name: 'Claude', url: 'https://claude.ai', dot: '#d97706' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com', dot: '#4285f4' },
  chatgpt: { name: 'ChatGPT', url: 'https://chat.openai.com', dot: '#10a37f' },
  mistral: { name: 'Mistral', url: 'https://chat.mistral.ai', dot: '#ff7000' },
  deepseek: { name: 'DeepSeek', url: 'https://chat.deepseek.com', dot: '#5b50e5' },
  copilot: { name: 'Copilot', url: 'https://copilot.microsoft.com', dot: '#0f6cbd' },
  perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai', dot: '#20808d' },
};

/**
 * A plain Chrome user agent for the embedded views.
 *
 * Electron puts "Electron/33.x" and the app name into the UA, and some sites
 * treat that as an unsupported or automated client — DeepSeek answers with
 * "Abnormal usage environment… we recommend using our official product". The
 * engine really is the same Chromium these sites are built for, so the honest
 * thing to report is Chrome's own string; nothing else about the request
 * changes. The version tracks whatever Chromium this Electron carries.
 */
function chromeUserAgent() {
  const ua = navigator.userAgent;
  return ua
    .replace(/ Electron\/[\d.]+/i, '')
    .replace(/ Nebula(?: Test)?\/[\d.]+/i, '');
}

const CUSTOM_KEY = 'nebula:ai-custom';
const WIDTH_KEY = 'nebula:ai-width';
const ACTIVE_KEY = 'nebula:ai-active';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function initAiPanel({ askText } = {}) {
  const panel = document.getElementById('ai-panel');
  const tabsEl = document.getElementById('ai-tabs');
  const body = document.getElementById('ai-body');
  if (!panel || !tabsEl || !body) return null;

  const isElectron = !!window.nebula;
  const views = new Map();
  let custom = loadJson(CUSTOM_KEY, []);
  let active = localStorage.getItem(ACTIVE_KEY) || 'claude';

  const all = () => ({ ...AI_SERVICES, ...Object.fromEntries(custom.map((c) => [c.id, c])) });

  const savedWidth = Number(localStorage.getItem(WIDTH_KEY));
  if (savedWidth >= 280 && savedWidth <= 900) panel.style.width = `${savedWidth}px`;

  function renderTabs() {
    const services = all();
    tabsEl.innerHTML = Object.entries(services)
      .map(([id, s]) => {
        const isCustom = custom.some((c) => c.id === id);
        const x = isCustom ? `<span class="ai-tab__x" data-remove="${id}" title="Remove">×</span>` : '';
        const dot = s.dot ? `<span class="ai-dot" style="background:${s.dot}"></span>` : '<span class="ai-dot"></span>';
        return `<button class="ai-tab${id === active ? ' active' : ''}" data-ai="${id}" type="button" title="${esc(s.url)}">${dot}${esc(s.name)}${x}</button>`;
      })
      .join('') + '<button class="ai-tab ai-add" id="ai-add" type="button" title="Add a site">+</button>';
  }

  /**
   * A view is built only while the panel is actually on screen.
   *
   * It used to be built during boot, when `#ai-panel` still had `hidden` —
   * i.e. `display: none`, which is precisely the state that detaches an
   * Electron guest and makes it reload. That is also the most likely source of
   * the crash reported on the AI toggle, and because `initAiPanel` ran before
   * the editor was wired, a throw in here took the rest of boot with it.
   */
  const isVisible = () => !panel.hidden;

  function showError(message) {
    let box = body.querySelector('.ai-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'ai-view ai-fallback ai-error on';
      body.appendChild(box);
    }
    box.textContent = `This chat could not be opened: ${message}`;
    box.classList.add('on');
  }

  function show(id) {
    const service = all()[id];
    if (!service) return;
    active = id;
    localStorage.setItem(ACTIVE_KEY, id);
    renderTabs();
    // NOT `hidden`. A <webview> with display:none is detached from its guest and
    // reloads when it comes back, which logs you out of the site you had just
    // signed into. Every view stays laid out; only one is visible. See the
    // .ai-view rules in editor.css.
    body.querySelectorAll('.ai-view').forEach((el) => el.classList.remove('on'));

    if (isElectron) {
      // Nothing to attach to yet — the panel is closed. `open()` calls back in.
      if (!isVisible()) return;
      let wv = views.get(id);
      if (!wv) {
        wv = document.createElement('webview');
        wv.className = 'ai-view';
        wv.setAttribute('src', service.url);
        // persist: is what keeps a login across restarts; one partition per
        // service so signing into one is not signing into another.
        wv.setAttribute('partition', `persist:ai-${id}`);
        wv.setAttribute('allowpopups', '');
        wv.setAttribute('useragent', chromeUserAgent());
        // A guest that dies must say so in the panel, not in a console nobody
        // is reading. None of these were listened for before.
        wv.addEventListener('did-fail-load', (ev) => {
          if (ev.errorCode === -3) return;   // an aborted navigation is normal
          showError(ev.errorDescription || `load failed (${ev.errorCode})`);
        });
        wv.addEventListener('crashed', () => showError('the page crashed'));
        wv.addEventListener('render-process-gone', () => showError('the page stopped'));
        body.appendChild(wv);
        views.set(id, wv);
      }
      wv.classList.add('on');
    } else {
      let fb = body.querySelector(`.ai-fallback[data-ai="${id}"]`);
      if (!fb) {
        fb = document.createElement('div');
        fb.className = 'ai-view ai-fallback';
        fb.dataset.ai = id;
        fb.innerHTML = `<p><strong>${esc(service.name)}</strong></p>
          <p>Embedded chat needs the desktop app.</p>
          <p><a href="${esc(service.url)}" target="_blank" rel="noopener">Open ${esc(service.name)} ↗</a></p>`;
        body.appendChild(fb);
      }
      fb.classList.add('on');
    }
    // keep the active tab in view when the strip scrolls horizontally
    tabsEl.querySelector('.ai-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  tabsEl.addEventListener('click', async (e) => {
    const removeId = e.target.closest('[data-remove]')?.dataset.remove;
    if (removeId) {
      e.stopPropagation();
      custom = custom.filter((c) => c.id !== removeId);
      saveJson(CUSTOM_KEY, custom);
      views.get(removeId)?.remove();
      views.delete(removeId);
      body.querySelector(`.ai-fallback[data-ai="${removeId}"]`)?.remove();
      show(active === removeId ? 'claude' : active);
      return;
    }
    if (e.target.closest('#ai-add')) {
      const name = await askText?.('Site name:', 'My AI');
      if (!name?.trim()) return;
      let url = await askText?.('Site URL:', 'https://');
      if (!url?.trim()) return;
      url = url.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      try { new URL(url); } catch { return; }   // a malformed src is not a site
      const entry = { id: generateId('ai'), name: name.trim(), url, dot: '#C15F3C' };
      custom.push(entry);
      saveJson(CUSTOM_KEY, custom);
      show(entry.id);
      return;
    }
    const id = e.target.closest('[data-ai]')?.dataset.ai;
    if (id) show(id);
  });

  // shift+wheel scrolls the tab strip sideways (classic side-scroll)
  tabsEl.addEventListener('wheel', (e) => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    tabsEl.scrollLeft += e.deltaY;
  }, { passive: false });

  // drag the left edge to resize
  const grip = document.getElementById('ai-resize');
  if (grip) {
    let dragging = false;
    grip.addEventListener('mousedown', (e) => { e.preventDefault(); dragging = true; document.body.classList.add('resizing'); });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const w = Math.min(900, Math.max(280, window.innerWidth - e.clientX));
      panel.style.width = `${w}px`;
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('resizing');
      localStorage.setItem(WIDTH_KEY, String(parseInt(panel.style.width, 10) || 360));
    });
  }

  renderTabs();

  /**
   * Called by the dock when the panel is opened, so the guest is attached to a
   * visible container rather than to a `display: none` one.
   */
  function open() {
    try { show(active); } catch (err) { showError(err.message); }
  }

  return { open, show: (id) => { try { show(id); } catch (err) { showError(err.message); } } };
}
