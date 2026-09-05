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

const CUSTOM_KEY = 'nebula:ai-custom';
const WIDTH_KEY = 'nebula:ai-width';
const ACTIVE_KEY = 'nebula:ai-active';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function initAiPanel({ askText } = {}) {
  const panel = document.getElementById('ai-panel');
  const tabsEl = document.getElementById('ai-tabs');
  const body = document.getElementById('ai-body');
  if (!panel || !tabsEl || !body) return;

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

  function show(id) {
    const service = all()[id];
    if (!service) return;
    active = id;
    localStorage.setItem(ACTIVE_KEY, id);
    renderTabs();
    body.querySelectorAll('webview, .ai-fallback').forEach((el) => { el.hidden = true; });

    if (isElectron) {
      let wv = views.get(id);
      if (!wv) {
        wv = document.createElement('webview');
        wv.setAttribute('src', service.url);
        wv.setAttribute('partition', `persist:ai-${id}`);
        wv.setAttribute('allowpopups', '');
        body.appendChild(wv);
        views.set(id, wv);
      }
      wv.hidden = false;
    } else {
      let fb = body.querySelector(`.ai-fallback[data-ai="${id}"]`);
      if (!fb) {
        fb = document.createElement('div');
        fb.className = 'ai-fallback';
        fb.dataset.ai = id;
        fb.innerHTML = `<p><strong>${esc(service.name)}</strong></p>
          <p>Embedded chat needs the desktop app.</p>
          <p><a href="${esc(service.url)}" target="_blank" rel="noopener">Open ${esc(service.name)} ↗</a></p>`;
        body.appendChild(fb);
      }
      fb.hidden = false;
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
  show(active);
}
