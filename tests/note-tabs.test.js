/**
 * Tabs over the note (1.0.4, note-tabs.js): which notes the tabs hold after
 * one is added, moved, opened or lost, and the strip itself over a store of
 * three notes — a tab that comes without the page going to it, a note opened
 * from the list taking the tab written in, a tab let go.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TAB_TYPE, withTab, movedTab, tabsAfter, stepTab, previewAt, initNoteTabs } from '../src/js/note-tabs.js';
import { DRAG_TYPE } from '../src/js/split-view.js';

describe('withTab', () => {
  it('the first tab made brings the note written in along, before it', () => {
    expect(withTab([], 'b', null, 'a')).toEqual(['a', 'b']);
    expect(withTab([], 'b', 0, 'a')).toEqual(['b', 'a']);
  });
  it('with no place given it comes right after the one written in', () => {
    expect(withTab(['a', 'b', 'c'], 'd', null, 'a')).toEqual(['a', 'd', 'b', 'c']);
    expect(withTab(['a', 'b', 'c'], 'd', null, 'c')).toEqual(['a', 'b', 'c', 'd']);
    expect(withTab(['a', 'b'], 'd', null, 'x')).toEqual(['a', 'b', 'd']);
  });
  it('a place given is kept, the nearest end when out of range', () => {
    expect(withTab(['a', 'b'], 'c', 1, 'a')).toEqual(['a', 'c', 'b']);
    expect(withTab(['a', 'b'], 'c', 9, 'a')).toEqual(['a', 'b', 'c']);
    expect(withTab(['a', 'b'], 'c', -2, 'a')).toEqual(['c', 'a', 'b']);
  });
  it('no note twice, and the note written in alone is no tab', () => {
    expect(withTab(['a', 'b'], 'b', 0, 'a')).toBeNull();
    expect(withTab([], 'a', null, 'a')).toBeNull();
    expect(withTab([], 'a', null, null)).toBeNull();
    expect(withTab(['a', 'b'], '', 0, 'a')).toBeNull();
  });
});

describe('movedTab', () => {
  it('goes where it was let go, counted among the tabs as they stood', () => {
    expect(movedTab(['a', 'b', 'c'], 'a', 3)).toEqual(['b', 'c', 'a']);
    expect(movedTab(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'a', 'c']);
    expect(movedTab(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(movedTab(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'c', 'b']);
  });
  it('let go on either of its own sides, nothing moves', () => {
    const tabs = ['a', 'b', 'c'];
    expect(movedTab(tabs, 'b', 1)).toBe(tabs);
    expect(movedTab(tabs, 'b', 2)).toBe(tabs);
    expect(movedTab(tabs, 'x', 0)).toBe(tabs);
  });
});

describe('tabsAfter', () => {
  const all = () => true;
  it('a note opened that has no tab takes the tab that was written in', () => {
    expect(tabsAfter(['a', 'b', 'c'], 'x', 'b', all)).toEqual(['a', 'x', 'c']);
  });
  it('a note that has a tab leaves them as they are', () => {
    const tabs = ['a', 'b', 'c'];
    expect(tabsAfter(tabs, 'c', 'a', all)).toEqual(tabs);
  });
  it('a pane clicked in beside the one written in comes after it, which keeps its tab', () => {
    expect(tabsAfter(['a', 'b'], 'x', 'a', all, (id) => id === 'a')).toEqual(['a', 'x', 'b']);
  });
  it('notes gone from the list leave; the one written in gone, the next takes its place', () => {
    const alive = (id) => id !== 'b';
    expect(tabsAfter(['a', 'b', 'c'], 'a', 'a', alive)).toEqual(['a', 'c']);
    expect(tabsAfter(['a', 'b', 'c', 'd'], 'x', 'b', alive)).toEqual(['a', 'x', 'c', 'd']);
  });
  it('fewer than two are none, and none stay none', () => {
    expect(tabsAfter(['a', 'b'], 'a', 'a', (id) => id === 'a')).toEqual([]);
    expect(tabsAfter([], 'a', null, all)).toEqual([]);
    expect(tabsAfter([], 'b', 'a', all)).toEqual([]);
  });
  it('an archived note read is no tab', () => {
    expect(tabsAfter(['a', 'b'], 'z', 'a', (id) => id !== 'z')).toEqual(['a', 'b']);
  });
});

describe('stepTab', () => {
  it('the next and the one before, round the ends', () => {
    expect(stepTab(['a', 'b', 'c'], 'a', 1)).toBe('b');
    expect(stepTab(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(stepTab(['a', 'b', 'c'], 'a', -1)).toBe('c');
  });
  it('nothing to step to without tabs; from a note with no tab, the nearest end', () => {
    expect(stepTab([], 'a', 1)).toBeNull();
    expect(stepTab(['a'], 'a', 1)).toBeNull();
    expect(stepTab(['a', 'b'], 'x', 1)).toBe('a');
    expect(stepTab(['a', 'b'], 'x', -1)).toBe('b');
  });
});

// The owner, of the line that marked the place: "sadece cizgi degilde sekme önizlemesi seklinde olsun".
describe('previewAt', () => {
  it('a note with no tab is shown where it would come; on the bare line, first', () => {
    expect(previewAt(['a', 'b'], 'c', 1, 'a')).toBe(1);
    expect(previewAt(['a', 'b'], 'c', 9, 'a')).toBe(2);
    expect(previewAt([], 'b', 0, 'a')).toBe(0);
  });
  it('nothing is shown where nothing would come', () => {
    expect(previewAt(['a', 'b'], 'b', 0, 'a')).toBeNull();   // a row of the list whose note has its tab
    expect(previewAt([], 'a', 0, 'a')).toBeNull();           // the note written in, over the bare line
  });
  it('a tab moved is shown among the others, its own place one of them', () => {
    expect(previewAt(['a', 'b', 'c'], 'b', 0, 'a', true)).toBe(0);
    expect(previewAt(['a', 'b', 'c'], 'b', 1, 'a', true)).toBe(1);
    expect(previewAt(['a', 'b', 'c'], 'b', 5, 'a', true)).toBe(2);
  });
});

describe('the strip', () => {
  let strip, store, opened, panes, closed, tabs;
  const ghost = () => strip.querySelector('.note-tab-ghost');
  // jsdom lays nothing out: the tabs are told where they stand, 100 wide each.
  const stand = (...ids) => ids.forEach((id, i) => { tabOf(id).getBoundingClientRect = () => ({ left: i * 100, width: 100, right: i * 100 + 100, top: 0, bottom: 29 }); });
  // A drag as the strip hears it: what is carried, and where the pointer is.
  const air = (type, target, id, { tab = false, x = 0 } = {}) => {
    const data = { [DRAG_TYPE]: `note:${id}`, ...(tab ? { [TAB_TYPE]: id } : {}) };
    target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      clientX: x, clientY: 5, dataTransfer: { getData: (t) => data[t] || '', types: Object.keys(data) },
    }));
  };
  const names = () => [...strip.querySelectorAll('.note-tab')].map((t) => t.querySelector('.nt-name').textContent);
  const tabOf = (id) => strip.querySelector(`.note-tab[data-note="${id}"]`);

  // Each strip listens on the window and the document: the last test's must not answer this one's keys.
  const heard = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const [target, type, fn, opts] of heard.splice(0)) target.removeEventListener(type, fn, opts);
  });

  beforeEach(() => {
    for (const target of [window, document]) {
      const add = target.addEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, opts) => { heard.push([target, type, fn, opts]); add(type, fn, opts); });
    }
    localStorage.clear();
    document.body.innerHTML = '<nav id="note-tabs" hidden></nav>';
    strip = document.getElementById('note-tabs');
    const notes = new Map([['a', { id: 'a', title: 'Alpha' }], ['b', { id: 'b', title: 'Beta' }], ['c', { id: 'c', title: '' }], ['d', { id: 'd', title: 'Delta' }]]);
    store = { activeId: 'a', get: (id) => notes.get(id) ?? null, notes };
    opened = [];
    panes = [];
    closed = [];
    tabs = initNoteTabs({
      strip, store,
      openNote: (id) => { opened.push(id); store.activeId = id; tabs.sync(); },
      panes: () => panes,
      closePane: (id) => { closed.push(id); panes = panes.filter((p) => p !== id); },
    });
  });

  it('is out of sight until a tab is made', () => {
    expect(strip.hidden).toBe(true);
    expect(tabs.tabs()).toEqual([]);
  });

  it('a tab added does not take the page: the note written in is a tab too, and stays the lit one', () => {
    expect(tabs.add('b')).toBe(true);
    expect(strip.hidden).toBe(false);
    expect(names()).toEqual(['Alpha', 'Beta']);
    expect(opened).toEqual([]);
    expect(tabOf('a').classList.contains('active')).toBe(true);
    expect(tabOf('b').classList.contains('active')).toBe(false);
    expect(tabOf('b').classList.contains('lit')).toBe(true);
    expect(JSON.parse(localStorage.getItem('nebula:tabs'))).toEqual(['a', 'b']);
  });

  it('a note with no name is Untitled; the same note is not added twice; the note written in is not added', () => {
    tabs.add('c');
    expect(names()).toEqual(['Alpha', 'Untitled']);
    expect(tabs.add('c')).toBe(false);
    expect(tabs.add('a')).toBe(false);
    expect(tabs.tabs()).toEqual(['a', 'c']);
  });

  it('a click on a tab opens its note; on the one written in, nothing', () => {
    tabs.add('b');
    tabOf('a').click();
    expect(opened).toEqual([]);
    tabOf('b').click();
    expect(opened).toEqual(['b']);
    expect(tabOf('b').classList.contains('active')).toBe(true);
    expect(tabOf('a').classList.contains('active')).toBe(false);
  });

  it('a note opened from the list takes the tab written in', () => {
    tabs.add('b');
    store.activeId = 'd';
    tabs.sync();
    expect(tabs.tabs()).toEqual(['d', 'b']);
    expect(names()).toEqual(['Delta', 'Beta']);
  });

  it('the ✕ lets a tab go; of two, the line is bare again', () => {
    tabs.add('b');
    tabs.add('c');
    expect(tabs.tabs()).toEqual(['a', 'c', 'b']);
    tabOf('b').querySelector('.nt-close').click();
    expect(tabs.tabs()).toEqual(['a', 'c']);
    expect(opened).toEqual([]);
    tabOf('c').querySelector('.nt-close').click();
    expect(tabs.tabs()).toEqual([]);
    expect(strip.hidden).toBe(true);
    expect(localStorage.getItem('nebula:tabs')).toBeNull();
  });

  it('the tab written in let go: the page goes to the one after it, or before', () => {
    tabs.add('b');
    tabs.add('c');
    tabOf('a').querySelector('.nt-close').click();
    expect(opened).toEqual(['c']);
    expect(tabs.tabs()).toEqual(['c', 'b']);
    tabOf('c').click();
    tabOf('b').click();
    tabOf('b').querySelector('.nt-close').click();
    expect(store.activeId).toBe('c');
    expect(tabs.tabs()).toEqual([]);
  });

  it('a tab shown beside is marked, and its pane goes with it', () => {
    tabs.add('b');
    panes = ['a', 'b'];
    tabs.paint();
    expect(tabOf('b').classList.contains('beside')).toBe(true);
    expect(tabOf('a').classList.contains('beside')).toBe(false);
    tabs.close('b');
    expect(closed).toEqual(['b']);
  });

  it('a note trashed loses its tab', () => {
    tabs.add('b');
    tabs.add('c');
    store.notes.get('b').deletedAt = 1;
    tabs.sync();
    expect(tabs.tabs()).toEqual(['a', 'c']);
  });

  it('the wheel pressed lets a tab go; Ctrl+Tab steps through them', () => {
    tabs.add('b');
    tabs.add('c');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(opened).toEqual(['c']);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    expect(opened).toEqual(['c', 'a']);
    tabOf('b').dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    expect(tabs.tabs()).toEqual(['a', 'c']);
  });

  it('a note in the air over the line is shown as the tab it would be, where it would come', () => {
    tabs.add('b');
    stand('a', 'b');
    air('dragstart', document.body, 'd');
    expect(ghost()).toBeNull();
    air('dragover', strip, 'd', { x: 120 });
    expect(ghost().textContent).toBe('Delta');
    expect(ghost().nextElementSibling).toBe(tabOf('b'));
    expect(names()).toEqual(['Alpha', 'Beta']);   // shown, not yet a tab
    air('dragover', strip, 'd', { x: 180 });
    expect(ghost().previousElementSibling).toBe(tabOf('b'));
    // The tabs drawn again meanwhile leave it where it is.
    tabs.paint();
    expect([...strip.children].map((el) => el.textContent.replace('✕', ''))).toEqual(['Alpha', 'Beta', 'Delta']);
    air('drop', strip, 'd', { x: 180 });
    expect(ghost()).toBeNull();
    expect(tabs.tabs()).toEqual(['a', 'b', 'd']);
  });

  it('a note that has its tab is not shown a second time; over the bare line the preview stands alone', () => {
    air('dragstart', document.body, 'b');
    air('dragover', strip, 'b', { x: 40 });
    expect(ghost().textContent).toBe('Beta');
    expect(strip.children).toHaveLength(1);
    air('drop', strip, 'b', { x: 40 });
    expect(tabs.tabs()).toEqual(['b', 'a']);
    stand('b', 'a');
    air('dragstart', document.body, 'b');
    air('dragover', strip, 'b', { x: 150 });
    expect(ghost()).toBeNull();
    air('dragend', window, 'b');
  });

  it('a tab in the air is faint where it stands, and over the line gives its room to its preview', async () => {
    tabs.add('b');
    tabs.add('d');
    expect(tabs.tabs()).toEqual(['a', 'd', 'b']);
    stand('a', 'd', 'b');
    air('dragstart', document.body, 'a', { tab: true });
    await new Promise((done) => requestAnimationFrame(done));
    expect(tabOf('a').className).toContain('moving');
    expect(tabOf('a').className).not.toContain('away');   // not over the line yet: it does not go with the drag
    air('dragover', strip, 'a', { tab: true, x: 20 });
    expect(ghost().textContent).toBe('Alpha');
    expect(ghost().nextElementSibling).toBe(tabOf('d'));   // where it is
    expect(tabOf('a').className).toContain('away');
    air('dragover', strip, 'a', { tab: true, x: 260 });
    expect(ghost().previousElementSibling).toBe(tabOf('b'));
    air('dragend', window, 'a', { tab: true });
    expect(ghost()).toBeNull();
    expect(tabOf('a').className).not.toMatch(/moving|away/);
    expect(tabs.tabs()).toEqual(['a', 'd', 'b']);
  });

  it('a tab let go on the line comes where its preview stood', () => {
    tabs.add('b');
    tabs.add('d');
    stand('a', 'd', 'b');
    air('dragstart', document.body, 'a', { tab: true });
    air('dragover', strip, 'a', { tab: true, x: 180 });
    expect(ghost().previousElementSibling).toBe(tabOf('d'));
    air('drop', strip, 'a', { tab: true, x: 180 });
    expect(tabs.tabs()).toEqual(['d', 'a', 'b']);
    stand('d', 'a', 'b');
    air('dragstart', document.body, 'b', { tab: true });
    air('drop', strip, 'b', { tab: true, x: 20 });
    expect(tabs.tabs()).toEqual(['b', 'd', 'a']);
    expect(ghost()).toBeNull();
  });

  it('the tabs come back with the app, without the notes that are gone', () => {
    localStorage.setItem('nebula:tabs', JSON.stringify(['a', 'gone', 'b', 'b']));
    const again = initNoteTabs({ strip, store, openNote: () => {} });
    again.sync();
    expect(again.tabs()).toEqual(['a', 'b']);
  });

  it('canAdd: a note with no tab that is not the one written in', () => {
    expect(tabs.canAdd('b')).toBe(true);
    expect(tabs.canAdd('a')).toBe(false);
    tabs.add('b');
    expect(tabs.canAdd('b')).toBe(false);
    expect(tabs.canAdd('nope')).toBe(false);
  });
});
