/**
 * AI panel — Nebula Demo style: a horizontally scrollable tab strip of chat
 * services, each keeping its own persistent session, plus custom sites.
 * Real webviews on the desktop; open-in-browser links in preview.
 */

import { loadJson, saveJson, generateId } from './storage.js';

import { AI_SERVICES, firefoxUserAgentFor, isGoogleService, mergeServices, siteUrl } from './ai-services.js';
import { t } from './i18n.js';
export { AI_SERVICES };

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
const OVERRIDE_KEY = 'nebula:ai-overrides';
const HIDDEN_KEY = 'nebula:ai-hidden';
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
  let overrides = loadJson(OVERRIDE_KEY, {});
  let hidden = loadJson(HIDDEN_KEY, []);
  const all = () => mergeServices(AI_SERVICES, custom, overrides, hidden);
  // A tab that is no longer there (Perplexity, taken out in 0.9.3) opens Claude.
  let active = localStorage.getItem(ACTIVE_KEY) || 'claude';
  if (!all()[active]) active = 'claude';

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
      .join('');
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

  function showError(id, message) {
    if (active !== id) return;
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
        // Gemini is Google's own sign-in, which refuses a visit that was Chrome
        // a page ago and Firefox now: its whole tab is Firefox (0.9.3).
        wv.setAttribute('useragent', isGoogleService(service.url)
          ? firefoxUserAgentFor(window.nebula?.platform) : chromeUserAgent());
        // A guest that dies must say so in the panel, not in a console nobody
        // is reading. None of these were listened for before.
        wv.addEventListener('did-fail-load', (ev) => {
          if (ev.errorCode === -3) return;   // an aborted navigation is normal
          if (ev.isMainFrame === false) return;
          showError(id, ev.errorDescription || `load failed (${ev.errorCode})`);
        });
        wv.addEventListener('crashed', () => showError(id, 'the page crashed'));
        wv.addEventListener('render-process-gone', () => showError(id, 'the page stopped'));
        wv.addEventListener('did-finish-load', () => { if (active === id) body.querySelector('.ai-error')?.classList.remove('on'); });
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
      removeSite(removeId);
      return;
    }
    const id = e.target.closest('[data-ai]')?.dataset.ai;
    if (id) show(id);
  });

  /** A site's tab gone: a site added with + is forgotten, a built-in one hidden. */
  function removeSite(id) {
    if (custom.some((c) => c.id === id)) {
      custom = custom.filter((c) => c.id !== id);
      saveJson(CUSTOM_KEY, custom);
    } else if (AI_SERVICES[id]) {
      hidden = [...new Set([...hidden, id])];
      saveJson(HIDDEN_KEY, hidden);
    }
    views.get(id)?.remove();
    views.delete(id);
    body.querySelector(`.ai-fallback[data-ai="${id}"]`)?.remove();
    const left = Object.keys(all());
    if (active === id) {
      if (left.length) show(left[0]);
      else renderTabs();
    } else renderTabs();
  }

  function changeSite(id, patch) {
    const c = custom.find((x) => x.id === id);
    if (c) { Object.assign(c, patch); saveJson(CUSTOM_KEY, custom); }
    else if (AI_SERVICES[id]) { overrides = { ...overrides, [id]: { ...(overrides[id] || {}), ...patch } }; saveJson(OVERRIDE_KEY, overrides); }
    if (patch.url) {
      const wv = views.get(id);
      if (wv) { try { wv.loadURL(patch.url); } catch { wv.setAttribute('src', patch.url); } }
    }
    renderTabs();
  }

  /* ---- Right-click on a tab (0.9.3): its header, its address, delete ---- */
  const siteMenu = document.createElement('div');
  siteMenu.className = 'float-menu ai-site-menu';
  siteMenu.id = 'ai-site-menu';
  siteMenu.setAttribute('role', 'menu');
  siteMenu.hidden = true;
  document.body.append(siteMenu);
  const closeSiteMenu = () => { siteMenu.hidden = true; siteMenu.replaceChildren(); };
  function menuItem(label, run, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    if (cls) b.className = cls;
    b.textContent = label;
    b.addEventListener('click', () => { closeSiteMenu(); void run(); });
    siteMenu.append(b);
  }
  tabsEl.addEventListener('contextmenu', (e) => {
    const id = e.target.closest('[data-ai]')?.dataset.ai;
    if (!id) return;
    e.preventDefault();
    closeSiteMenu();
    const site = all()[id];
    if (!site) return;
    menuItem(t('Change header'), async () => {
      const name = await askText?.(t('Header:'), site.name);
      if (name?.trim()) changeSite(id, { name: name.trim().slice(0, 40) });
    });
    menuItem(t('Change website'), async () => {
      const url = siteUrl(await askText?.(t('Website address:'), site.url));
      if (url) changeSite(id, { url });
    });
    menuItem(t('Delete website'), () => removeSite(id), 'ai-site-menu__delete');
    if (hidden.length) {
      menuItem(t('Restore removed sites'), () => {
        hidden = [];
        saveJson(HIDDEN_KEY, hidden);
        renderTabs();
      });
    }
    siteMenu.hidden = false;
    const w = siteMenu.offsetWidth || 200;
    const h = siteMenu.offsetHeight || 120;
    siteMenu.style.left = `${Math.max(6, Math.min(e.clientX, window.innerWidth - w - 6))}px`;
    siteMenu.style.top = `${Math.max(6, Math.min(e.clientY, window.innerHeight - h - 6))}px`;
    siteMenu.querySelector('button')?.focus({ preventScroll: true });
  });
  document.addEventListener('mousedown', (e) => { if (!siteMenu.hidden && !siteMenu.contains(e.target)) closeSiteMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !siteMenu.hidden) closeSiteMenu(); });

  // + adds a site. It stands outside the strip now, at its right (0.9.3).
  document.getElementById('ai-add')?.addEventListener('click', async () => {
    const name = await askText?.('Site name:', 'My AI');
    if (!name?.trim()) return;
    const url = siteUrl(await askText?.('Site URL:', 'https://'));
    if (!url) return;   // a malformed src is not a site
    const entry = { id: generateId('ai'), name: name.trim(), url, dot: '#C15F3C' };
    custom.push(entry);
    saveJson(CUSTOM_KEY, custom);
    show(entry.id);
  });

  // Load the open tab's page again (the owner, 0.9.3): the view it shows,
  // nothing else. A view not built yet has nothing to reload.
  document.getElementById('ai-reload')?.addEventListener('click', () => {
    const wv = views.get(active);
    if (wv && typeof wv.reload === 'function') {
      body.querySelector('.ai-error')?.classList.remove('on');
      try { wv.reload(); } catch { /* not attached yet */ }
    }
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
    /**
     * Pointer events with capture, not mouse events on the window.
     *
     * The panel holds a `<webview>`, which is a view of its own: the moment the
     * pointer crossed into it the host renderer stopped seeing `mousemove` and
     * `mouseup` at all, so `dragging` stayed true and the panel went on
     * resizing after the button was released — "I let go and it keeps growing,
     * I have to click again". Capture routes every pointer event back to the
     * grip whatever it passes over, and the shield in the stylesheet takes the
     * guest out of the way as well.
     */
    let dragging = false;
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('resizing');
      try {
        localStorage.setItem(WIDTH_KEY, String(parseInt(panel.style.width, 10) || 360));
      } catch { /* private mode */ }
    };

    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      document.body.classList.add('resizing');
      try { grip.setPointerCapture(e.pointerId); } catch { /* no capture; the shield still helps */ }
    });
    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      panel.style.width = `${Math.min(900, Math.max(280, window.innerWidth - e.clientX))}px`;
    });
    grip.addEventListener('pointerup', stop);
    grip.addEventListener('pointercancel', stop);
    // Belt to that brace: a release the grip never sees still ends the drag.
    window.addEventListener('pointerup', stop);
    window.addEventListener('blur', stop);
  }

  renderTabs();

  /**
   * Called by the dock when the panel is opened, so the guest is attached to a
   * visible container rather than to a `display: none` one.
   */
  function open() {
    try { show(active); } catch (err) { showError(active, err.message); }
  }

  return { open, show: (id) => { try { show(id); } catch (err) { showError(id, err.message); } } };
}
