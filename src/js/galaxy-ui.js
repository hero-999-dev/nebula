/**
 * The map of your notes (1.0.0) — everything around the galaxy engine
 * (galaxy-map.js): the minimap at the foot of the list, the map as a pane of
 * the split page, its right-click menu, the way into a black hole and back,
 * a list of what it shows for the keyboard and screen readers, and where its
 * camera was.
 *
 * The owner (2026-10-21): "projects are stars, folders planets, notes the moons
 * bound to their folder's planet (only loose notes are planets), labels their
 * moons; a black hole is a dimension of its own". The engine only draws:
 * what it shows comes from here (`galaxyInput`), and a locked black hole gives
 * it nothing but its initials.
 */
import { normalizeLabels } from './labels.js';
import { contentTags, contentMentions } from './mentions.js';
import { MAP, DRAG_TYPE } from './split-view.js';

const VIEW_KEY = 'nebula:map-view';
const MINI_VIEW_KEY = 'nebula:map-mini-view';
const NAMES_KEY = 'nebula:map-names';
const PICK_MAX = 6;                    // labels lit at once — the engine's own cap too

/**
 * What the map is built from: notes, folders (each with its project), projects
 * and black holes — or, inside an open black hole, its notes alone. Pure — tested.
 * A locked black hole is its initials and nothing else: no name, no count.
 * @param {{ notes: object[], folders: object[], projects: object[], holes: object[], holeId?: string|null, holeNotes?: object[], initials?: (name: string) => string, projectOf?: (folderId: string) => object|null }} from
 */
export function galaxyInput({ notes = [], folders = [], projects = [], holes = [], holeId = null, holeNotes = [], initials = (n) => String(n || '?').slice(0, 2).toUpperCase(), projectOf = () => null }) {
  // One label whatever its case: "Work" on one note and "#work" on another are
  // one moon colour and one constellation, as they are one entry in the list's
  // filter. The first spelling met names it.
  const spelling = new Map();
  const canon = (l) => {
    const key = l.toLocaleLowerCase();
    if (!spelling.has(key)) spelling.set(key, l);
    return spelling.get(key);
  };
  const note = (n) => {
    // A label is either set on the note or a #chip in its text — the list's
    // filter counts both, and so does the map (the owner: "labels are missing").
    const labels = normalizeLabels([...(Array.isArray(n.labels) ? n.labels : []), ...contentTags(n.content)]).map(canon);
    const out = { id: n.id, title: n.title || '', labels };
    // Its @mentions, so the search can show which note links to which.
    const mentions = contentMentions(n.content).filter((m) => m !== n.id);
    if (mentions.length) out.mentions = mentions;
    if (n.pinned) out.pinned = true;
    if (!holeId) {
      if (n.folder) out.folder = n.folder;
      else if (n.project) out.project = n.project;
    }
    return out;
  };
  const open = holeId ? holes.find((h) => h.id === holeId && h.open) : null;
  if (holeId && open) {
    // A dimension of its own: nothing of main space reaches in.
    return { notes: holeNotes.map(note), folders: [], projects: [], holes: [], hole: { id: open.id, name: open.name || '' } };
  }
  const projectIds = new Set(projects.map((p) => p.id));
  const input = {
    notes: notes.map(note),
    folders: folders.map((f) => {
      const p = projectOf(f.id);
      return p && projectIds.has(p.id) ? { id: f.id, name: f.name, project: p.id } : { id: f.id, name: f.name };
    }),
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    holes: holes.map((h) => (h.open
      ? { id: h.id, name: h.name || '', locked: false, initials: initials(h.name) }
      : { id: h.id, initials: initials(h.name), locked: true })),
    hole: null,
  };
  // A note whose project is gone is a loose one.
  for (const n of input.notes) if (n.project && !projectIds.has(n.project)) delete n.project;
  return input;
}

/** The note a body of the map stands for: a note's own, or a label's note's.
 * A folder is a planet too now, so what decides is the body's role. */
export function noteOfBody(body) {
  if (!body) return null;
  const role = body.role || (body.kind === 'planet' ? 'note' : body.kind === 'moon' ? 'label' : null);
  if (role === 'note') return body.ref ?? String(body.id).replace(/^note:/, '');
  if (role === 'label') return String(body.parent || '').replace(/^note:/, '') || null;
  return null;
}

const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* a convenience */ } };

/**
 * @param {object} deps
 * @param {HTMLElement} deps.mount where the minimap goes (the foot of the list)
 * @param {Function} deps.createMap galaxy-map.js's createGalaxyMap
 */
export function initGalaxy({ mount, createMap, store, folders, projects, blackHoles, holeInitials, openNote, split, translate = (x) => x, icon = () => '' }) {
  if (!mount || typeof createMap !== 'function') return null;
  const t = translate;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  const css = () => {
    const s = getComputedStyle(document.body);
    const v = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
    return { ink: v('--ink', '#ddd'), faint: v('--ink-faint', '#888'), accent: v('--clay', '#c79'), fern: v('--fern', '#7a9'), madder: v('--madder', '#c55'), paper: v('--paper', '#111') };
  };

  const holes = () => blackHoles?.list?.() ?? [];
  function getInput(holeId) {
    return galaxyInput({
      notes: store.live(),
      folders: folders.all ? folders.all() : [],
      projects: projects?.all ? projects.all() : [],
      holes: holes(),
      holeId,
      holeNotes: holeId ? store.inHole(holeId) : [],
      initials: holeInitials,
      projectOf: (id) => projects?.of?.(id) ?? null,
    });
  }

  // ---- the menu a right click opens -------------------------------------------
  const menu = el('div', 'galaxy-menu');
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  const closeMenu = () => { menu.hidden = true; menu.textContent = ''; };
  window.addEventListener('mousedown', (e) => { if (!menu.contains(e.target)) closeMenu(); }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); closeMenu(); } }, true);
  window.addEventListener('blur', closeMenu);

  /** A note opened from the map: beside it when the map is a pane, else as any note. */
  function openFrom(noteId) {
    if (!noteId || !store.get(noteId)) return;
    if (split?.mapShown?.()) split.add(noteId);
    else openNote(noteId);
  }

  // Only an open black hole lets the map in. A locked one stays on the map, its
  // initials and nothing more, and is not a door (owner, 2026-10-20: "kitlenince
  // silinmesin haritadan, sadece içine girme olmasın"): it opens in the list.
  function enterHole(map, holeId) {
    return Promise.resolve(holes().some((h) => h.id === holeId && h.open));
  }
  const goIn = (map, body) => { void enterHole(map, body.ref).then((ok) => { if (ok) map.enterHole(body.ref); }); };

  // A black hole opened from the map's menu is entered once its PIN is in
  // (owner, 2026-10-21: "karadeliğe sağ tıklayınca aç ve kilitle olmalı").
  let wantIn = null;
  function openHole(map, id) {
    wantIn = { map, id, until: Date.now() + 60000 };
    blackHoles?.unlock?.(id);
  }

  function context(map, body, x, y, opts = {}) {
    closeMenu();
    wantIn = null;                             // a new choice on the map replaces an Open still waiting for its PIN
    const inside = map.dimension?.();
    if (!body && !inside) return;
    const noteId = noteOfBody(body);
    if (opts.open) {
      if (!body) return;
      if (noteId) openFrom(noteId);
      else if (body.kind === 'hole' && !body.locked) goIn(map, body);
      // A locked hole opens on a double-click too: PIN first, then in
      // (owner, 2026-10-21).
      else if (body.kind === 'hole') openHole(map, body.ref);
      else map.focus(body.id);
      return;
    }
    const item = (text, run) => {
      const b = el('button', null, text);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { closeMenu(); run(); });
      menu.append(b);
      return b;
    };
    if (noteId) item(t('Open'), () => openFrom(noteId));
    if (body?.kind === 'hole' && body.locked) item(t('Open'), () => openHole(map, body.ref));
    if (body?.kind === 'hole' && !body.locked) {
      item(t('Enter the black hole'), () => goIn(map, body));
      item(t('Lock'), () => { void blackHoles?.lock?.(body.ref); });
    }
    item(t('Show all of Universe'), () => map.overview?.());
    // The way out of a hole on every map, the sidebar's too (Codex 25 #1).
    if (inside) item(t('Back to main space'), () => map.leaveHole?.());
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
    menu.querySelector('button')?.focus();
  }

  // ---- one engine on one canvas ---------------------------------------------------
  function engine(canvas, { mini, viewKey, onDimension }) {
    let map = null;
    map = createMap(canvas, {
      getInput,
      colors: css,
      mini,
      onContext: (body, x, y, opts) => context(map, body, x, y, opts),
      onEnterHole: (holeId) => enterHole(map, holeId),
      onDimension: (holeId) => { onDimension?.(holeId); if (!holeId) saveView(); },
    });
    if (!map) return null;
    // Only main space is remembered: a black hole is never opened by itself.
    const saved = read(viewKey);
    if (saved && !saved.holeId) try { map.restore?.(saved); } catch { /* an older view */ }
    // The engine names its first dimension while it is still being made — before `map` is set.
    function saveView() {
      const v = map?.view?.();
      if (v && !v.holeId) write(viewKey, { x: v.x, y: v.y, zoom: v.zoom, manual: !!v.manual });
    }
    window.addEventListener('pagehide', saveView);
    map.saveView = saveView;
    return map;
  }

  // ---- the minimap ------------------------------------------------------------------
  const mini = el('div', 'galaxy-mini');
  const head = el('div', 'galaxy-mini-head');
  const grip = el('span', 'galaxy-grip');
  grip.innerHTML = icon('galaxy');
  const name = el('span', 'galaxy-mini-name', t('Universe'));
  grip.append(name);
  grip.draggable = true;
  grip.title = t('Universe — your notes as a galaxy');
  // Dragged onto the page: the map comes beside the notes (split-view.js).
  grip.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData(DRAG_TYPE, 'map:');
    e.dataTransfer.effectAllowed = 'move';
  });
  const full = el('button', 'galaxy-full');
  full.type = 'button';
  full.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  full.title = t('Universe over the whole page');
  full.setAttribute('aria-label', t('Universe over the whole page'));
  full.addEventListener('click', () => { split?.mapFull?.(); paintFull(); });
  // Beside it, Fit (owner, 1.0.1): the minimap rides the open note's planet
  // by itself; after a zoom by hand this takes it back there.
  const miniFit = el('button', 'galaxy-mini-fit');
  miniFit.type = 'button';
  miniFit.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M10 2v4h4M14 10h-4v4M2 10h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  miniFit.title = t('Fit');
  miniFit.setAttribute('aria-label', t('Fit'));
  miniFit.addEventListener('click', () => miniMap?.fit?.({ glide: true }));
  head.append(grip, miniFit, full);
  const miniCanvas = el('canvas', 'galaxy-canvas');
  miniCanvas.tabIndex = 0;
  miniCanvas.setAttribute('role', 'img');
  miniCanvas.setAttribute('aria-label', t('Universe — your notes as a galaxy'));
  mini.append(head, miniCanvas);
  mount.append(mini);
  const miniMap = engine(miniCanvas, { mini: true, viewKey: MINI_VIEW_KEY });
  if (!miniMap) { mini.remove(); menu.remove(); return null; }

  function paintFull() {
    const on = !!split?.isMapFull?.();
    full.classList.toggle('on', on);
    full.setAttribute('aria-pressed', String(on));
  }

  // ---- the map as a pane --------------------------------------------------------------
  const pane = el('div', 'galaxy-pane');
  const bigCanvas = el('canvas', 'galaxy-canvas');
  bigCanvas.tabIndex = 0;
  bigCanvas.setAttribute('role', 'img');
  bigCanvas.setAttribute('aria-label', t('Universe — your notes as a galaxy'));
  // Top right (owner, 2026-10-21): the label search, then Fit and Full screen
  // as two icon buttons of one size.
  const tools = el('div', 'galaxy-tools');
  const back = el('button', 'btn galaxy-back', '↩ ');
  back.append(el('span', null, t('Back to main space')));
  back.type = 'button';
  back.hidden = true;
  const iconBtn = (cls, svg, label) => {
    const b = el('button', `galaxy-tool ${cls}`);
    b.type = 'button';
    b.innerHTML = svg;
    b.title = label;
    b.setAttribute('aria-label', label);
    return b;
  };
  const whole = iconBtn('galaxy-whole', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M10 2v4h4M14 10h-4v4M2 10h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>', t('Fit Universe'));
  const fullToo = iconBtn('galaxy-full-pane', full.innerHTML, t('Universe over the whole page'));
  // Names off and on again, beside Fit (owner, 2026-10-21); remembered.
  const namesBtn = iconBtn('galaxy-names', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12.5 5.2 3.5h.6L9 12.5M3.2 9.5h4.6M10.5 12.5V7m0 0c.6-.9 1.4-1.3 2.3-1.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path class="galaxy-names-off" d="M2 14 14 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>', t('Hide names'));
  let namesOn = read(NAMES_KEY) !== false;
  const paintNames = () => {
    const label = t(namesOn ? 'Hide names' : 'Show names');
    namesBtn.title = label;
    namesBtn.setAttribute('aria-label', label);
    namesBtn.setAttribute('aria-pressed', String(!namesOn));
    namesBtn.classList.toggle('on', !namesOn);
    big?.setNames?.(namesOn);
  };
  namesBtn.addEventListener('click', () => { namesOn = !namesOn; write(NAMES_KEY, namesOn); paintNames(); });
  const search = labelSearch();
  tools.append(search.el, back, whole, namesBtn, fullToo);
  // What the map shows, as a list: for the keyboard and screen readers (visually hidden).
  const list = el('ul', 'galaxy-list sr-only');
  list.setAttribute('aria-label', t('Universe — your notes as a galaxy'));
  pane.append(bigCanvas, tools, list);

  let big = null;
  let bigShown = false;
  let lastDim = null;                 // the space the label search was filled in

  /* The label search: chips of the labels picked, a field, and a short list
     of matches. The picked labels' notes light up on the map in each label's
     colour and are joined in thin lines — a constellation per label, the
     map's form of Obsidian's groups (owner, 2026-10-21). */
  function labelSearch() {
    const box = el('div', 'galaxy-search');
    const chips = el('div', 'galaxy-chips');
    const input = el('input', 'galaxy-search-input');
    input.type = 'search';
    input.placeholder = t('Labels and mentions…');
    input.setAttribute('aria-label', t('Search labels and mentions in Universe'));
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.spellcheck = false;
    const list = el('ul', 'galaxy-suggest');
    list.id = 'galaxy-suggest';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    input.setAttribute('aria-controls', list.id);
    box.append(chips, input, list);
    let picked = [];
    let matches = [];
    let at = 0;
    // Labels by name; @mentions by the note's key, shown as @Title (owner,
    // 2026-10-21: "labels and mentions — which note links to which").
    let titles = new Map();
    const known = () => {
      const mentions = big?.mentions?.() ?? [];
      titles = new Map(mentions.map((m) => [m.key, '@' + (m.title || t('Untitled'))]));
      return [...(big?.labels?.() ?? []), ...mentions.map((m) => m.key)];
    };
    const nameOf = (key) => titles.get(key) ?? key;
    const colorOf = (name) => big?.labelColor?.(name) || 'currentColor';
    const apply = () => {
      big?.highlight?.(picked);
      chips.textContent = '';
      box.classList.toggle('has-chips', picked.length > 0);
      const have = new Set(known());
      for (const name of picked) {
        // A pick the map does not show now stays, faded, until it is taken
        // off by hand (owner, 1.0.1: "they vanish when I click outside").
        const chip = el('span', have.has(name) ? 'galaxy-chip' : 'galaxy-chip gone');
        chip.style.setProperty('--chip', colorOf(name));
        const dot = el('i', 'galaxy-chip-dot');
        const text = el('span', null, nameOf(name));
        const x = el('button', 'galaxy-chip-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', `${t('Remove from the search')}: ${nameOf(name)}`);
        x.addEventListener('click', () => { picked = picked.filter((p) => p !== name); apply(); input.focus(); });
        chip.append(dot, text, x);
        chips.append(chip);
      }
    };
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const paint = () => {
      const q = input.value.trim().toLowerCase();
      const all = known().filter((l) => !picked.includes(l));
      const low = (k) => nameOf(k).replace(/^@/, '').toLowerCase();
      matches = (q ? all.filter((l) => nameOf(l).toLowerCase().includes(q))
        .sort((a, b) => (low(b).startsWith(q.replace(/^@/, '')) - low(a).startsWith(q.replace(/^@/, ''))) || nameOf(a).localeCompare(nameOf(b)))
        : all).slice(0, 8);
      at = Math.min(at, Math.max(0, matches.length - 1));
      list.textContent = '';
      if (!matches.length) {
        if (q) list.append(el('li', 'galaxy-suggest-none', t('No such label or mention in Universe')));
        else { close(); return; }
      }
      matches.forEach((name, i) => {
        const li = el('li', i === at ? 'on' : null);
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === at));
        li.style.setProperty('--chip', colorOf(name));
        li.append(el('i', 'galaxy-chip-dot'), el('span', null, nameOf(name)));
        li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(name); });
        list.append(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };
    const pick = (name) => {
      if (!name || picked.includes(name) || picked.length >= PICK_MAX) return;
      picked = [...picked, name];
      input.value = '';
      at = 0;
      apply();
      paint();
    };
    input.addEventListener('input', () => { at = 0; paint(); });
    input.addEventListener('focus', paint);
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();                    // the map's own keys stay on the canvas
      if (e.key === 'ArrowDown') { at = Math.min(at + 1, matches.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { at = Math.max(at - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { pick(matches[at]); e.preventDefault(); }
      else if (e.key === 'Escape') { if (!list.hidden) close(); else input.blur(); e.preventDefault(); }
      else if (e.key === 'Backspace' && !input.value && picked.length) { picked = picked.slice(0, -1); apply(); paint(); }
    });
    return {
      el: box,
      // The map changed: the picks stay (a label gone for now is drawn faded
      // and lights again when it is back); only a new space starts empty.
      sync() { apply(); },
      // A constellation belongs to one space: going into a hole or back out
      // starts the search empty (Codex, map v2 ideas).
      clear() { picked = []; input.value = ''; close(); apply(); },
      picked: () => picked.slice(),
    };
  }
  function bigMap() {
    if (big) return big;
    big = engine(bigCanvas, {
      mini: false,
      viewKey: VIEW_KEY,
      onDimension: (holeId) => {
        back.hidden = !holeId;
        paintList();
        if ((holeId || null) !== lastDim) { lastDim = holeId || null; search.clear(); } else search.sync();
      },
    });
    paintNames();
    return big;
  }
  back.addEventListener('click', () => big?.leaveHole?.());
  whole.addEventListener('click', () => big?.overview?.());
  fullToo.addEventListener('click', () => { split?.mapFull?.(); paintFull(); });

  function paintList() {
    if (!big || !bigShown) return;
    list.textContent = '';
    for (const body of big.bodies?.() ?? []) {
      const role = body.role || body.kind;
      if (!['project', 'folder', 'note', 'hole'].includes(role)) continue;
      const li = el('li');
      const b = el('button', null, `${body.name || ''} (${t(KIND_WORDS[role] ?? role).replace(/^map: /, '')})`);
      b.type = 'button';
      b.addEventListener('focus', () => big.select?.(body.id));
      b.addEventListener('click', () => context(big, body, 0, 0, { open: true }));
      li.append(b);
      list.append(li);
    }
  }

  /** What split-view.js is given: the pane's element and its turns on and off. */
  const paneApi = {
    el: pane,
    shown() {
      bigShown = true;
      // One map at a time: while the big one is open the minimap steps aside
      // (the owner, 2026-10-21), and its loop stops with it.
      mini.hidden = true;
      miniMap?.pause?.();
      const m = bigMap();
      if (!m) return;
      // Opened, the map fills its pane (owner, 2026-10-20); resized() refits it.
      requestAnimationFrame(() => { m.resize(); m.resume?.(); m.fit?.(); m.follow?.(store.activeId); paintList(); });
      paintFull();
    },
    hidden() {
      bigShown = false;
      big?.saveView?.();
      // Out of sight is out of a black hole: nothing of it stays drawn or kept.
      if (big?.dimension?.()) big.leaveHole?.({ instant: true });
      big?.pause?.();
      mini.hidden = false;
      requestAnimationFrame(() => { miniMap?.resume?.(); miniMap?.resize?.(); miniMap?.follow?.(store.activeId); });
      paintFull();
    },
    resized() { if (bigShown) requestAnimationFrame(() => big?.resize()); paintFull(); },
  };

  // ---- keeping up with the notes ----------------------------------------------------
  const maps = () => [miniMap, bigShown ? big : null].filter(Boolean);
  function refresh() {
    for (const m of maps()) {
      const inside = m.dimension?.();
      // Locked while inside: out at once, nothing of it left (05-spec-addendum §2).
      if (inside && !holes().some((h) => h.id === inside && h.open)) m.leaveHole?.({ instant: true });
      m.refresh();
    }
    if (big && !bigShown && big.dimension?.()) big.leaveHole?.({ instant: true });
    // A hole opened from the map's menu: once its PIN is in, the map goes in.
    if (wantIn && Date.now() > wantIn.until) wantIn = null;
    if (wantIn && holes().some((h) => h.id === wantIn.id && h.open)) {
      const { map, id } = wantIn;
      wantIn = null;
      if (map === miniMap || bigShown) map.enterHole?.(id);
    }
    paintList();
    if (bigShown) search.sync();
  }
  function follow(noteId) { for (const m of maps()) m.follow?.(noteId); }

  // The minimap rests when the list is folded away or the window is hidden.
  const watch = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([e]) => { if (e?.isIntersecting) { miniMap.resize(); miniMap.resume?.(); } else miniMap.pause?.(); })
    : null;
  watch?.observe(miniCanvas);
  const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { miniMap.resize(); if (bigShown) big?.resize(); }) : null;
  sized?.observe(miniCanvas);
  sized?.observe(bigCanvas);

  // input/colors: what the map shows and in which colours, for the Universe widget (widgets.js).
  return { pane: paneApi, refresh, follow, closeMenu, miniMap: () => miniMap, bigMap: () => big, input: getInput, colors: css };
}

const KIND_WORDS = { folder: 'map: folder', note: 'map: note', hole: 'map: black hole', project: 'map: project', label: 'map: label' };

export { MAP };
