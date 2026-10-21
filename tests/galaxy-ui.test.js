/**
 * The map of your notes (1.0.0) — what it is built from (galaxy-ui.js), and the
 * map as a pane of the split page (split-view.js). The owner: "when the map is
 * over the whole page and a note is opened, the note comes beside the map; a
 * second makes three". The engine's drawing is in tests/galaxy.test.js.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { galaxyInput, noteOfBody, initGalaxy } from '../src/js/galaxy-ui.js';
import { initSplitView, MAP } from '../src/js/split-view.js';

describe('what the map is built from', () => {
  const notes = [
    { id: 'a', title: 'A', folder: 'f1', labels: ['x', 'X', 'y'], content: '<p>secret</p>' },
    { id: 'b', title: 'B', project: 'j1', pinned: true },
    { id: 'c', title: 'C', project: 'gone' },
  ];
  const folders = [{ id: 'f1', name: 'F1' }, { id: 'f2', name: 'F2' }];
  const projects = [{ id: 'j1', name: 'J1', folders: ['f2'] }];
  const holes = [{ id: 'h1', name: 'Secret plans', open: false }, { id: 'h2', name: 'Diary', open: true }];
  const base = { notes, folders, projects, holes, projectOf: (id) => (id === 'f2' ? projects[0] : null), initials: (n) => n.slice(0, 2).toUpperCase() };

  it('main space: folders with their projects, notes without their text', () => {
    const input = galaxyInput(base);
    expect(input.hole).toBeNull();
    expect(input.folders).toEqual([{ id: 'f1', name: 'F1' }, { id: 'f2', name: 'F2', project: 'j1' }]);
    expect(input.projects).toEqual([{ id: 'j1', name: 'J1' }]);
    expect(input.notes[0]).toEqual({ id: 'a', title: 'A', folder: 'f1', labels: ['x', 'y'] });
    expect(input.notes[1]).toEqual({ id: 'b', title: 'B', project: 'j1', pinned: true, labels: [] });
    // A project that is gone: the note is a loose one.
    expect(input.notes[2].project).toBeUndefined();
    expect(JSON.stringify(input)).not.toContain('secret');
  });

  it('a locked black hole is its initials and nothing else', () => {
    const input = galaxyInput(base);
    expect(input.holes[0]).toEqual({ id: 'h1', initials: 'SE', locked: true });
    expect(JSON.stringify(input)).not.toContain('Secret plans');
    expect(input.holes[1]).toMatchObject({ id: 'h2', name: 'Diary', locked: false });
  });

  it('inside an open black hole: its notes alone, nothing of main space', () => {
    const input = galaxyInput({ ...base, holeId: 'h2', holeNotes: [{ id: 'd', title: 'D', hole: 'h2', folder: 'f1', labels: ['z'] }] });
    expect(input.hole).toEqual({ id: 'h2', name: 'Diary' });
    expect(input.notes).toEqual([{ id: 'd', title: 'D', labels: ['z'] }]);
    expect(input.folders).toEqual([]);
    expect(input.projects).toEqual([]);
    expect(input.holes).toEqual([]);
  });

  it('a locked black hole cannot be entered: main space is given instead', () => {
    const input = galaxyInput({ ...base, holeId: 'h1', holeNotes: [{ id: 'leak', title: 'leak' }] });
    expect(input.hole).toBeNull();
    expect(JSON.stringify(input)).not.toContain('leak');
  });

  it('the note a body stands for: a planet\'s, or its moon\'s planet\'s', () => {
    expect(noteOfBody({ kind: 'planet', id: 'note:a', ref: 'a' })).toBe('a');
    expect(noteOfBody({ kind: 'moon', id: 'label:a:x', parent: 'note:a' })).toBe('a');
    expect(noteOfBody({ kind: 'sun', id: 'folder:f1', ref: 'f1' })).toBeNull();
    expect(noteOfBody(null)).toBeNull();
  });

  it('map v2: the role decides — a folder is a planet that is no note, a folder\'s note a moon that is', () => {
    expect(noteOfBody({ kind: 'planet', role: 'folder', id: 'folder:f1', ref: 'f1' })).toBeNull();
    expect(noteOfBody({ kind: 'moon', role: 'note', id: 'note:b', ref: 'b', parent: 'folder:f1' })).toBe('b');
    expect(noteOfBody({ kind: 'moon', role: 'label', id: 'label:b:x', parent: 'note:b' })).toBe('b');
    expect(noteOfBody({ kind: 'sun', role: 'project', id: 'project:j1', ref: 'j1' })).toBeNull();
  });
});

describe('the map starting', () => {
  it('survives an engine that names its dimension before it is returned (the 1.0.0 boot failure)', () => {
    document.body.innerHTML = '<div id="slot"></div>';
    const fake = (canvas, opts) => {
      opts.onDimension(null);   // galaxy-map.js does this from its first refresh()
      return { view: () => ({ x: 1, y: 2, zoom: 0.5, holeId: null }), restore() {}, resize() {}, pause() {}, resume() {}, refresh() {}, follow() {}, bodies: () => [] };
    };
    const galaxy = initGalaxy({
      mount: document.getElementById('slot'),
      createMap: fake,
      store: { live: () => [], inHole: () => [], activeId: null },
      folders: { all: () => [] },
      projects: { all: () => [], of: () => null },
      blackHoles: { list: () => [] },
      holeInitials: (n) => n,
      openNote: () => {},
    });
    expect(galaxy).not.toBeNull();
    expect(document.querySelector('#slot .galaxy-mini canvas')).not.toBeNull();
  });

  it('a black hole locked while the map is inside it: out at once, on the refresh the lock calls', () => {
    document.body.innerHTML = '<div id="slot"></div>';
    const holes = [{ id: 'h2', name: 'Diary', open: true }];
    const calls = [];
    let inside = 'h2';
    const fake = () => ({
      view: () => ({ x: 0, y: 0, zoom: 1, holeId: inside }), restore() {}, resize() {}, pause() {}, resume() {}, follow() {},
      dimension: () => inside,
      leaveHole: (o) => { calls.push(['leave', o]); inside = null; },
      refresh: () => calls.push(['refresh', inside]),
      bodies: () => [],
    });
    const galaxy = initGalaxy({
      mount: document.getElementById('slot'), createMap: fake,
      store: { live: () => [], inHole: () => [], activeId: null },
      folders: { all: () => [] }, projects: { all: () => [], of: () => null },
      blackHoles: { list: () => holes }, holeInitials: (n) => n, openNote: () => {},
    });
    holes[0].open = false;
    galaxy.refresh();
    expect(calls[0]).toEqual(['leave', { instant: true }]);
    expect(calls[1]).toEqual(['refresh', null]);
  });

  it('a locked black hole on the map: its menu offers Open (the PIN), never a way straight in; a double-click asks for the PIN', () => {
    document.body.innerHTML = '<div id="slot"></div>';
    let opts = null;
    const done = [];
    const fake = (canvas, o) => {
      opts = opts || o;
      return {
        view: () => ({ x: 0, y: 0, zoom: 1, holeId: null }), restore() {}, resize() {}, pause() {}, resume() {}, refresh() {}, follow() {},
        dimension: () => null, bodies: () => [],
        focus: (id) => done.push(['focus', id]), enterHole: (id) => done.push(['enter', id]), overview() {},
      };
    };
    let unlockAsked = 0;
    initGalaxy({
      mount: document.getElementById('slot'), createMap: fake,
      store: { live: () => [], inHole: () => [], activeId: null },
      folders: { all: () => [] }, projects: { all: () => [], of: () => null },
      blackHoles: { list: () => [{ id: 'h1', name: 'Secret', open: false }], unlock: () => { unlockAsked++; } },
      holeInitials: (n) => n.slice(0, 2), openNote: () => {},
    });
    const body = { id: 'hole:h1', kind: 'hole', ref: 'h1', name: 'Se', locked: true };
    opts.onContext(body, 10, 10);
    const items = [...document.querySelectorAll('.galaxy-menu button')];
    expect(items.map((b) => b.textContent)).not.toContain('Enter the black hole');
    expect(items.map((b) => b.textContent)).not.toContain('Locked');
    opts.onContext(body, 10, 10, { open: true });
    expect(done).toEqual([]);
    expect(unlockAsked).toBe(1);              // a double-click opens it too: the PIN first (owner, 2026-10-21)
    opts.onContext(body, 10, 10);
    const open = [...document.querySelectorAll('.galaxy-menu button')].find((b) => b.textContent === 'Open');
    expect(open).toBeTruthy();
    open.click();
    expect(unlockAsked).toBe(2);              // Open asks for the PIN (owner, 2026-10-21)
    expect(done).toEqual([]);                 // and does not go in by itself
  });

  it('an open black hole on the map: Enter goes in, Lock locks it (owner, 2026-10-21)', () => {
    document.body.innerHTML = '<div id="slot"></div>';
    let opts = null;
    const done = [];
    const fake = (canvas, o) => {
      opts = opts || o;
      return {
        view: () => ({ x: 0, y: 0, zoom: 1, holeId: null }), restore() {}, resize() {}, pause() {}, resume() {}, refresh() {}, follow() {},
        dimension: () => null, bodies: () => [], focus() {}, overview() {},
        enterHole: (id) => done.push(['enter', id]),
      };
    };
    const locks = [];
    initGalaxy({
      mount: document.getElementById('slot'), createMap: fake,
      store: { live: () => [], inHole: () => [], activeId: null },
      folders: { all: () => [] }, projects: { all: () => [], of: () => null },
      blackHoles: { list: () => [{ id: 'h1', name: 'Secret', open: true }], unlock() {}, lock: (id) => locks.push(id) },
      holeInitials: (n) => n.slice(0, 2), openNote: () => {},
    });
    const body = { id: 'hole:h1', kind: 'hole', ref: 'h1', name: 'Secret', locked: false };
    opts.onContext(body, 10, 10);
    const labels = [...document.querySelectorAll('.galaxy-menu button')].map((b) => b.textContent);
    expect(labels).toContain('Enter the black hole');
    const lock = [...document.querySelectorAll('.galaxy-menu button')].find((b) => b.textContent === 'Lock');
    lock.click();
    expect(locks).toEqual(['h1']);
  });

  it('inside a hole every map has a way out: a right-click, even on empty space, offers Back to main space (Codex 25 #1)', () => {
    document.body.innerHTML = '<div id="slot"></div>';
    let opts = null;
    const left = [];
    const fake = (canvas, o) => {
      opts = opts || o;
      return {
        view: () => ({ x: 0, y: 0, zoom: 1, holeId: 'h1' }), restore() {}, resize() {}, pause() {}, resume() {}, refresh() {}, follow() {},
        dimension: () => 'h1', bodies: () => [], focus() {}, overview() {},
        leaveHole: () => left.push('out'),
      };
    };
    initGalaxy({
      mount: document.getElementById('slot'), createMap: fake,
      store: { live: () => [], inHole: () => [], activeId: null },
      folders: { all: () => [] }, projects: { all: () => [], of: () => null },
      blackHoles: { list: () => [{ id: 'h1', name: 'Secret', open: true }], unlock() {} },
      holeInitials: (n) => n.slice(0, 2), openNote: () => {},
    });
    opts.onContext(null, 10, 10);
    const back = [...document.querySelectorAll('.galaxy-menu button')].find((b) => b.textContent === 'Back to main space');
    expect(back).toBeTruthy();
    back.click();
    expect(left).toEqual(['out']);
    opts.onContext(null, 10, 10, { open: true });   // a double-click on nothing does nothing
    expect(left).toEqual(['out']);
  });

  it('the label search sits left of Fit and Full screen, and picks labels into the engine', () => {
    document.body.innerHTML = '<div id="slot"></div>';
    const lit = [];
    const fake = () => ({
      view: () => ({ x: 0, y: 0, zoom: 1, holeId: null }), restore() {}, resize() {}, pause() {}, resume() {}, refresh() {}, follow() {},
      dimension: () => null, bodies: () => [], focus() {}, overview() {}, shown() {}, hidden() {}, fit() {},
      labels: () => ['home', 'ideas', 'work'], labelColor: () => 'hsl(200, 50%, 70%)',
      highlight: (l) => lit.push(l.slice()),
    });
    const galaxy = initGalaxy({
      mount: document.getElementById('slot'), createMap: fake,
      store: { live: () => [], inHole: () => [], activeId: null },
      folders: { all: () => [] }, projects: { all: () => [], of: () => null },
      blackHoles: { list: () => [] }, holeInitials: (n) => n, openNote: () => {},
    });
    document.body.append(galaxy.pane.el);
    galaxy.pane.shown();                       // the big map is made when its pane opens
    const tools = galaxy.pane.el.querySelector('.galaxy-tools');
    expect(tools).not.toBeNull();
    const kids = [...tools.children];
    expect(kids[0].classList.contains('galaxy-search')).toBe(true);
    expect(kids.at(-3).classList.contains('galaxy-whole')).toBe(true);
    expect(kids.at(-2).classList.contains('galaxy-names')).toBe(true);
    expect(kids.at(-1).classList.contains('galaxy-full-pane')).toBe(true);
    const input = tools.querySelector('.galaxy-search-input');
    input.value = 'wo';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(lit.at(-1)).toEqual(['work']);
    expect(tools.querySelectorAll('.galaxy-chip')).toHaveLength(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
    expect(lit.at(-1)).toEqual([]);
  });

  it('the minimap steps aside while the big map is open, and comes back after (owner, 2026-10-21)', () => {
    document.body.innerHTML = '<div id="slot"></div>';
    const made = [];
    const fake = (canvas, o) => {
      const m = { mini: !!o.mini, paused: 0, resumed: 0,
        view: () => ({ x: 0, y: 0, zoom: 1, holeId: null }), restore() {}, resize() {}, refresh() {}, follow() {},
        pause() { m.paused++; }, resume() { m.resumed++; },
        dimension: () => null, bodies: () => [], focus() {}, overview() {}, fit() {}, labels: () => [] };
      made.push(m);
      return m;
    };
    const galaxy = initGalaxy({
      mount: document.getElementById('slot'), createMap: fake,
      store: { live: () => [], inHole: () => [], activeId: null },
      folders: { all: () => [] }, projects: { all: () => [], of: () => null },
      blackHoles: { list: () => [] }, holeInitials: (n) => n, openNote: () => {},
    });
    document.body.append(galaxy.pane.el);
    const mini = document.querySelector('.galaxy-mini');
    expect(mini.querySelector('.galaxy-mini-name').textContent).toBe('Universe');
    galaxy.pane.shown();
    expect(mini.hidden).toBe(true);
    expect(made.find((m) => m.mini).paused).toBeGreaterThan(0);
    galaxy.pane.hidden();
    expect(mini.hidden).toBe(false);
  });

  it('a #label written in the text is a label on the map too (owner: "labels are missing")', () => {
    const input = galaxyInput({
      notes: [{ id: 'a', title: 'A', labels: ['Work'], content: '<p>x <span class="note-tag" data-tag="idea">#idea</span> <span class="note-tag" data-tag="work">#work</span></p>' }],
    });
    expect(input.notes[0].labels).toEqual(['Work', 'idea']);   // one each, case aside
  });

  it('gives no map when the engine cannot draw', () => {
    document.body.innerHTML = '<div id="slot"></div>';
    const galaxy = initGalaxy({ mount: document.getElementById('slot'), createMap: () => null, store: {}, folders: {}, projects: {}, blackHoles: {}, holeInitials: (n) => n, openNote: () => {} });
    expect(galaxy).toBeNull();
    expect(document.querySelector('#slot').children.length).toBe(0);
  });
});

describe('the map as a pane of the split page', () => {
  let split;
  let store;
  let shown;
  const ids = () => split.panes();

  beforeEach(() => {
    document.body.innerHTML = '<div id="shell"><header><input id="title"></header><div id="frame"></div></div>';
    const notes = { a: { id: 'a', title: 'A' }, b: { id: 'b', title: 'B' }, c: { id: 'c', title: 'C' } };
    store = { activeId: 'a', get: (id) => notes[id] ?? null };
    shown = [];
    const mapEl = document.createElement('div');
    mapEl.className = 'galaxy-pane';
    const map = { el: mapEl, shown: () => shown.push('shown'), hidden: () => shown.push('hidden'), resized: () => {} };
    split = initSplitView({
      shell: document.getElementById('shell'),
      frame: document.getElementById('frame'),
      titleEl: document.getElementById('title'),
      store,
      openNote: (id) => { store.activeId = id; split.sync(); },
      map,
    });
  });

  it('over the whole page: the map alone, the editor out of sight', () => {
    expect(split.mapFull(true)).toBe(true);
    expect(ids()).toEqual([MAP]);
    expect(split.isMapFull()).toBe(true);
    expect(document.body.classList.contains('map-full')).toBe(true);
    expect(document.querySelector('.split-map .galaxy-pane')).not.toBeNull();
    expect(document.getElementById('frame').closest('.split-park')).not.toBeNull();
    expect(shown).toEqual(['shown']);
  });

  it('a note opened from it comes beside it; a second makes three', () => {
    split.mapFull(true);
    split.add('b');
    expect(ids()).toEqual([MAP, 'b']);
    expect(store.activeId).toBe('b');
    expect(document.getElementById('frame').closest('.split-pane').dataset.note).toBe('b');
    split.add('c');
    expect(ids()).toEqual([MAP, 'b', 'c']);
  });

  it('a note opened from the list takes the place of the one written in, not the map\'s', () => {
    split.mapFull(true);
    split.add('b');
    store.activeId = 'c';
    split.sync();
    expect(ids()).toEqual([MAP, 'c']);
  });

  it('the note beside it closed: the map has the page again; the map closed: the note alone', () => {
    split.mapFull(true);
    split.add('b');
    split.close('b');
    expect(ids()).toEqual([MAP]);
    split.add('c');
    split.close(MAP);
    expect(ids()).toEqual([]);
    expect(document.body.classList.contains('split-on')).toBe(false);
    expect(document.getElementById('frame').parentNode.id).toBe('shell');
    expect(shown.at(-1)).toBe('hidden');
  });

  it('back from the whole page: as it was before', () => {
    split.mapFull(true);
    split.mapFull(false);
    expect(ids()).toEqual([]);
    expect(store.activeId).toBe('a');
    expect(document.getElementById('frame').parentNode.id).toBe('shell');
    split.addMap();
    expect(ids()).toEqual(['a', MAP]);
    split.mapFull(true);
    split.mapFull(false);
    expect(ids()).toEqual(['a', MAP]);
  });

  it('beside the notes it counts toward the four', () => {
    split.add('b');
    split.add('c');
    expect(split.addMap(0)).toBe(true);
    expect(ids()).toEqual([MAP, 'a', 'b', 'c']);
    expect(split.canAdd('x')).toBe(false);
  });
});
