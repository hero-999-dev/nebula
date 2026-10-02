/**
 * 0.9.3 — the owner's "Ideas & Bugs" note: the pure parts. The same features
 * are driven in the real app by tests/e2e/v093.mjs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { stepListItems, normalizeLists } from '../src/js/lists.js';
import { detectMention, detectTag, matchNotes } from '../src/js/mentions.js';
import { t, STRINGS, translateTree, setLang, LANGUAGES } from '../src/js/i18n.js';
import { spellLanguages, menuFacts } from '../electron/context-menu.js';
import { NO_PASSKEYS } from '../electron/ai-browser-auth.js';
import { NoteStore } from '../src/js/notes.js';
import { initDiskStorage, flushDisk } from '../src/js/disk-store.js';
import { saveJson } from '../src/js/storage.js';
import { dropWrapperIndents, MARKUP_VERSION } from '../src/js/migrate.js';
import { makeToggle } from '../src/js/toggles.js';
import { hasExplicitFont } from '../src/js/toolbar.js';
import { detectSlash, filterSlash } from '../src/js/slash-menu.js';

const dom = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
};
const caret = (node, offset) => {
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  return sel;
};

describe('Tab in a list moves the item, not the list', () => {
  it('puts the item under the one above it and keeps the caret in it', () => {
    const root = dom('<h3>Bugs</h3><ul><li>first</li><li>second</li><li>third</li></ul>');
    const second = root.querySelectorAll('li')[1];
    const sel = caret(second.firstChild, 3);
    expect(stepListItems(root, sel, 1)).toBe(true);
    expect(root.innerHTML).toBe('<h3>Bugs</h3><ul><li>first<ul><li>second</li></ul></li><li>third</li></ul>');
    expect(sel.getRangeAt(0).startContainer).toBe(second.firstChild);
    expect(sel.getRangeAt(0).startOffset).toBe(3);
  });

  it('joins a sub-list the item above already has', () => {
    const root = dom('<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>');
    stepListItems(root, caret(root.querySelectorAll('li')[2].firstChild, 0), 1);
    expect(root.innerHTML).toBe('<ul><li>a<ul><li>a1</li><li>b</li></ul></li></ul>');
  });

  it('leaves the first item where it is (it has nothing to go under) and says it handled the key', () => {
    const root = dom('<ul><li>only</li></ul>');
    expect(stepListItems(root, caret(root.querySelector('li').firstChild, 0), 1)).toBe(true);
    expect(root.innerHTML).toBe('<ul><li>only</li></ul>');
  });

  it('Shift+Tab brings it back out, and the items after it become its children', () => {
    const root = dom('<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>');
    stepListItems(root, caret(root.querySelectorAll('li')[1].firstChild, 0), -1);
    normalizeLists(root);
    expect(root.innerHTML).toBe('<ul><li>a</li><li>b<ul><li>c</li></ul></li><li>d</li></ul>');
  });

  it('is not about lists outside one: a paragraph is left to the block indent', () => {
    const root = dom('<p>line</p>');
    expect(stepListItems(root, caret(root.querySelector('p').firstChild, 0), 1)).toBe(false);
    expect(stepListItems(root, caret(root.querySelector('p').firstChild, 0), -1)).toBe(false);
  });

  it('keeps a list inside a toggle where it is', () => {
    const root = dom('<div class="blk-toggle" data-open="true"><p>t</p><div class="toggle-body"><ul><li>x</li></ul></div></div>');
    normalizeLists(root);
    expect(root.querySelector('.toggle-body > ul')).not.toBeNull();
  });
});

describe('@ and # in a note', () => {
  it('finds "@query" before the caret, at the start or after a space only', () => {
    expect(detectMention('see @Sho')).toEqual({ query: 'Sho', start: 4 });
    expect(detectMention('@')).toEqual({ query: '', start: 0 });
    expect(detectMention('mail me@home')).toBeNull();
    expect(detectMention('two words @a b')).toBeNull();
  });

  it('makes "#word " a tag, and leaves C#, #1 and a Markdown heading alone', () => {
    expect(detectTag('buy #errands ')).toEqual({ tag: 'errands', start: 4, end: 12 });
    expect(detectTag('#ödev ')?.tag).toBe('ödev');
    for (const text of ['C# ', '#1 ', '# ', 'x#ab ', '#a ']) expect(detectTag(text)).toBeNull();
  });

  it('matches note titles by every word, not the open note, nothing trashed or archived', () => {
    const notes = [
      { id: 'a', title: 'Shopping list' }, { id: 'b', title: 'Shop hours' },
      { id: 'c', title: 'Shopping old', deletedAt: 1 }, { id: 'd', title: 'Shopping arch', archivedAt: 1 },
    ];
    expect(matchNotes(notes, 'shop').map((n) => n.id)).toEqual(['a', 'b']);
    expect(matchNotes(notes, 'shop list').map((n) => n.id)).toEqual(['a']);
    expect(matchNotes(notes, '', { exclude: 'a' }).map((n) => n.id)).toEqual(['b']);
  });
});

describe('four languages', () => {
  it('translates by the English text, keeps the spaces round it, and leaves the rest English', () => {
    expect(t('New note', 'de')).toBe('Neue Notiz');
    expect(t('New note', 'pl')).toBe('Nowa notatka');
    expect(t('New note', 'tr')).toBe('Yeni not');
    expect(t('  New note ', 'tr')).toBe('  Yeni not ');
    expect(t('New note', 'en')).toBe('New note');
    expect(t('Something nobody translated', 'de')).toBe('Something nobody translated');
  });

  it('fills patterns with their values', () => {
    expect(t('3 of 12', 'de')).toBe('3 von 12');
    expect(t('Nebula 0.9.3 is available.', 'tr')).toBe('Nebula 0.9.3 hazır.');
    expect(t('Add #home', 'pl')).toBe('Dodaj #home');
  });

  it('has all three translations for every string, none empty', () => {
    for (const [en, row] of Object.entries(STRINGS)) {
      expect(row, en).toHaveLength(3);
      for (const s of row) expect(s.trim(), en).not.toBe('');
    }
    expect(LANGUAGES.map(([c]) => c)).toEqual(['en', 'de', 'pl', 'tr']);
  });

  it('never touches the note, the title or a note name, and goes back to English', () => {
    document.body.innerHTML = '<button id="b">New note</button><div id="editor" data-placeholder="Start writing…  ( / for blocks )"><p>New note</p></div>'
      + '<input id="title" value="Archive" placeholder="Untitled"><div class="nr-title">Archive</div>';
    setLang('de');
    translateTree(document.body);
    expect(document.getElementById('b').textContent).toBe('Neue Notiz');
    expect(document.querySelector('#editor p').textContent).toBe('New note');
    expect(document.getElementById('editor').dataset.placeholder).toBe('Losschreiben…  ( / für Blöcke )');
    expect(document.getElementById('title').value).toBe('Archive');
    expect(document.getElementById('title').placeholder).toBe('Ohne Titel');
    expect(document.querySelector('.nr-title').textContent).toBe('Archive');
    setLang('en');
    expect(document.getElementById('b').textContent).toBe('New note');
    expect(document.getElementById('title').placeholder).toBe('Untitled');
  });

  it('the / menu takes a query in any language', () => {
    expect(detectSlash('/başlık')?.query).toBe('başlık');
    expect(detectSlash('text /überschrift')?.query).toBe('überschrift');
    setLang('tr');
    expect(filterSlash('başlık').map((i) => i.id)).toEqual(['h1', 'h2', 'h3']);
    setLang('en');
  });
});

describe('right-click suggestions', () => {
  it('passes on only what the page needs', () => {
    expect(menuFacts({ x: 1, y: 2, misspelledWord: 'teh', dictionarySuggestions: ['the', 'ten'], isEditable: true, mediaType: 'none', selectionText: 'teh', frame: {} }))
      .toEqual({ x: 1, y: 2, misspelledWord: 'teh', suggestions: ['the', 'ten'], isEditable: true, mediaType: 'none', selectionText: 'teh' });
  });

  it('checks spelling in the chosen language only, English when it has no dictionary', () => {
    const available = ['en-US', 'en-GB', 'de-DE', 'pl', 'tr'];
    expect(spellLanguages('tr', available)).toEqual(['tr']);
    expect(spellLanguages('de', available)).toEqual(['de-DE']);
    expect(spellLanguages('pl', available)).toEqual(['pl']);
    expect(spellLanguages('en', available)).toEqual(['en-US']);
    expect(spellLanguages('de', ['en-US'])).toEqual(['en-US']);
    expect(spellLanguages('tr', [])).toEqual([]);
  });
});

describe('no passkeys in the AI tabs', () => {
  it('refuses a public-key request and says there are no passkeys; a password request goes through', async () => {
    const original = vi.fn(async () => 'password');
    const fakeWindow = {};
    const fakeNavigator = { credentials: { get: original, create: original }, userAgent: 'Chrome' };
    class Navigator {}
    new Function('window', 'navigator', 'DOMException', 'Navigator', NO_PASSKEYS)(fakeWindow, fakeNavigator, DOMException, Navigator);
    // Present, as in every browser (a missing one is a sign of an odd one), and empty.
    expect(typeof fakeWindow.PublicKeyCredential).toBe('function');
    await expect(fakeWindow.PublicKeyCredential.isConditionalMediationAvailable()).resolves.toBe(false);
    await expect(fakeWindow.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()).resolves.toBe(false);
    await expect(fakeNavigator.credentials.get({ publicKey: {} })).rejects.toMatchObject({ name: 'NotAllowedError' });
    await expect(fakeNavigator.credentials.create({ publicKey: {} })).rejects.toMatchObject({ name: 'NotAllowedError' });
    await expect(fakeNavigator.credentials.get({ password: true })).resolves.toBe('password');
  });

  it('touches Google\'s pages only: DeepSeek\'s captcha saw the stand-ins and refused every answer (0.9.3)', () => {
    const run = (hostname) => {
      const win = { location: { hostname }, chrome: {} };
      const nav = { credentials: { get: vi.fn(), create: vi.fn() }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0' };
      new Function('window', 'navigator', 'DOMException', 'Navigator', NO_PASSKEYS)(win, nav, DOMException, class {});
      return typeof win.PublicKeyCredential;
    };
    for (const host of ['accounts.google.com', 'gemini.google.com', 'accounts.google.co.uk', 'www.youtube.com']) expect(run(host), host).toBe('function');
    for (const host of ['chat.deepseek.com', 'google.com.evil.test', 'notgoogle.com', 'copilot.microsoft.com']) expect(run(host), host).toBe('undefined');
  });

  it('where the page is told Firefox, nothing says Chromium', () => {
    class Navigator {}
    Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => ({ brands: ['Chromium'] }) });
    const nav = Object.assign(new Navigator(), { credentials: null, userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0' });
    const win = { chrome: { runtime: {} } };
    new Function('window', 'navigator', 'DOMException', 'Navigator', NO_PASSKEYS)(win, nav, DOMException, Navigator);
    expect(nav.userAgentData).toBeUndefined();
    expect(win.chrome).toBeUndefined();
    const chromeNav = Object.assign(new (class N2 {})(), { credentials: null, userAgent: 'Chrome/130' });
    const win2 = { chrome: {} };
    new Function('window', 'navigator', 'DOMException', 'Navigator', NO_PASSKEYS)(win2, chromeNav, DOMException, class {});
    expect(win2.chrome).toEqual({});
  });

  it('sends Google Firefox headers, without the ones only Chromium sends', async () => {
    const { asFirefox, firefoxUserAgent } = await import('../electron/ai-browser-auth.js');
    expect(asFirefox({ 'User-Agent': 'Chrome', 'sec-ch-ua': '"Chromium"', 'Sec-CH-UA-Platform': 'Windows', Cookie: 'c' }))
      .toEqual({ 'User-Agent': firefoxUserAgent(), Cookie: 'c' });
  });
});

describe('the note\'s writing font', () => {
  beforeEach(() => localStorage.clear());

  it('is kept per note, without dating it, and null goes back to the app\'s own', () => {
    const store = new NoteStore();
    const note = store.createNote('x');
    const before = note.updatedAt;
    store.setFont(note.id, { family: 'Consolas, monospace' });
    store.setFont(note.id, { size: 14 });
    expect(store.get(note.id).font).toEqual({ family: 'Consolas, monospace', size: 14 });
    expect(store.get(note.id).updatedAt).toBe(before);
    store.setFont(note.id, { family: null, size: null });
    expect(store.get(note.id).font).toBeUndefined();
  });

  it('knows a line that already has a font of its own', () => {
    const root = dom('<p><span style="font-family: Arial">a</span></p><p>b</p><p><font face="Arial">c</font></p>');
    const [a, b, c] = root.querySelectorAll('p');
    expect(hasExplicitFont(a.firstChild.firstChild, root)).toBe(true);
    expect(hasExplicitFont(b.firstChild, root)).toBe(false);
    expect(hasExplicitFont(c.firstChild.firstChild, root)).toBe(true);
  });
});

describe('a save writes the note that changed, not the vault', () => {
  beforeEach(() => { localStorage.clear(); delete window.nebula; });

  it('serialises and writes only the changed note, and drops the stale copy in localStorage', async () => {
    const files = new Map([['a.json', '{"id":"a","title":"a","content":"x","createdAt":1,"updatedAt":1}'], ['b.json', '{"id":"b","title":"b","content":"big","createdAt":1,"updatedAt":1}']]);
    const write = vi.fn(async (rel, content) => { files.set(rel.replace('notes/', ''), content); return { ok: true }; });
    window.nebula = { storage: {
      list: async () => ({ ok: true, files: [...files.keys()] }),
      read: async (rel) => ({ ok: true, data: files.get(rel.replace('notes/', '')) }),
      write, remove: vi.fn(async () => ({ ok: true })),
    } };
    await initDiskStorage();
    const store = new NoteStore({ allowSeed: false });
    expect(localStorage.getItem('nebula:notes')).not.toBeNull();   // the boot hand-over
    const spy = vi.spyOn(JSON, 'stringify');
    store.updateNote('a', { content: 'typed' });
    await flushDisk();
    const bigSerialised = spy.mock.calls.filter(([v]) => v?.id === 'b').length;
    spy.mockRestore();
    expect(bigSerialised).toBe(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(files.get('a.json')).content).toBe('typed');
    expect(localStorage.getItem('nebula:notes')).toBeNull();
  });

  it('still writes localStorage when there is no disk (the browser preview)', async () => {
    await initDiskStorage();      // no bridge: the mirror is gone
    saveJson('nebula:notes', [{ id: 'x' }]);
    expect(JSON.parse(localStorage.getItem('nebula:notes'))).toEqual([{ id: 'x' }]);
  });
});

describe('0.9.3 markup', () => {
  it('drops an indent a wrapper of several lines got from the old Tab, and nothing else', () => {
    const root = dom('<div data-ind="1"><h3>Bugs</h3><ul><li>a</li></ul></div><div data-ind="2">one line</div><p data-ind="1">p</p><div class="blk-todo" data-ind="1">t</div>');
    expect(dropWrapperIndents(root)).toBe(1);
    expect(root.innerHTML).toBe('<div><h3>Bugs</h3><ul><li>a</li></ul></div><div data-ind="2">one line</div><p data-ind="1">p</p><div class="blk-todo" data-ind="1">t</div>');
    expect(dropWrapperIndents(root)).toBe(0);
    expect(MARKUP_VERSION).toBe('0.9.3');
  });

  it('makes a toggle from a line, and from a list item without splitting the list wrong', () => {
    const root = dom('<p>Title <b>bold</b></p><ul><li>a</li><li>b</li><li>c</li></ul>');
    const toggle = makeToggle(root.querySelector('p'));
    expect(toggle.outerHTML).toBe('<div class="blk-toggle" data-open="true"><p class="toggle-title">Title <b>bold</b></p><div class="toggle-body"><p><br></p></div></div>');
    makeToggle(root.querySelectorAll('li')[1]);
    expect(root.innerHTML.replace(/<div class="blk-toggle".*?<\/div><\/div>/g, 'T')).toBe('T<ul><li>a</li></ul>T<ul><li>c</li></ul>');
  });
});

// ---- The owner's second round (Ideas note, 2026-09-29 04:56) ----------------
import { contentTags } from '../src/js/mentions.js';
import { labelCatalog, noteHasLabel } from '../src/js/label-filter.js';
import { cropRect } from '../src/js/image-crop.js';
import { repairTagChips } from '../src/js/migrate.js';
import { insertDivider } from '../src/js/blocks.js';
import { liftListItemAtStart } from '../src/js/lists.js';

describe('labels in the text are their own kind', () => {
  it('reads the #word chips of a note, each once', () => {
    const html = '<p><span class="note-tag" data-tag="work" contenteditable="false">#work</span> and <span contenteditable="false" class="note-tag" data-tag="Home">#Home</span> <span class="note-tag" data-tag="work">#work</span></p>';
    expect(contentTags(html)).toEqual(['work', 'Home']);
    expect(contentTags('<p>#work is only words</p>')).toEqual([]);
  });

  it('keeps the note labels and the text labels apart, and filters by either', () => {
    const notes = [
      { id: 'a', labels: ['home'], content: '<span class="note-tag" data-tag="errands">#errands</span>' },
      { id: 'b', labels: ['work'], content: '<p>x</p>' },
    ];
    expect(labelCatalog(notes)).toEqual({ note: ['home', 'work'], text: ['errands'] });
    expect(notes.filter((n) => noteHasLabel(n, { kind: 'note', label: 'Home' })).map((n) => n.id)).toEqual(['a']);
    expect(notes.filter((n) => noteHasLabel(n, { kind: 'text', label: 'errands' })).map((n) => n.id)).toEqual(['a']);
    expect(notes.filter((n) => noteHasLabel(n, { kind: 'text', label: 'home' }))).toEqual([]);
    expect(notes.filter((n) => noteHasLabel(n, null))).toHaveLength(2);
  });

  it('takes apart the chips the first build nested, without losing a word', () => {
    const root = dom('<div><span class="note-tag" data-tag="label4">#label4</span> </div>'
      + '<div><span class="note-tag" data-tag="label4"><span class="note-tag" data-tag="label5">#label5</span> </span></div>'
      + '<div><span class="note-tag" data-tag="label4"><span class="note-tag" data-tag="label5"><br></span></span></div>'
      + '<p><span class="note-tag" data-tag="x">#tag and more</span></p>');
    const words = root.textContent;
    repairTagChips(root);
    expect(root.textContent).toBe(words);
    expect(root.querySelector('.note-tag .note-tag')).toBeNull();
    expect([...root.querySelectorAll('.note-tag')].map((c) => [c.textContent, c.dataset.tag, c.getAttribute('contenteditable')]))
      .toEqual([['#label4', 'label4', null], ['#label5', 'label5', null], ['#tag', 'tag', null]]);
    expect(root.querySelectorAll('div')[2].innerHTML).toBe('<br>');
    expect(repairTagChips(root)).toBe(0);
  });
});

describe('inside a toggle and a list', () => {
  it('puts a divider in the toggle\'s body, after the caret\'s line', () => {
    const root = dom('<div class="blk-toggle" data-open="true"><p>T</p><div class="toggle-body"><p id="a">a</p></div></div><p>after</p>');
    const line = insertDivider(root, caret(root.querySelector('#a').firstChild, 1));
    expect(root.querySelector('.toggle-body').innerHTML).toBe('<p id="a">a</p><hr class="blk-hr"><p><br></p>');
    expect(line.parentElement.className).toBe('toggle-body');
  });

  it('Backspace after a break at the start of an item leaves the item in its list', () => {
    const root = dom('<ul><li><br>Bug</li></ul>');
    const li = root.querySelector('li');
    expect(liftListItemAtStart(root, caret(li.lastChild, 0))).toBe(false);
    expect(root.querySelector('ul li')).not.toBeNull();
  });
});

describe('cropping', () => {
  it('maps the frame on screen onto the picture\'s own pixels', () => {
    expect(cropRect({ width: 200, height: 100 }, { left: 50, top: 0, width: 100, height: 50 }, { width: 800, height: 400 }))
      .toEqual({ sx: 200, sy: 0, sw: 400, sh: 200 });
    expect(cropRect({ width: 100, height: 100 }, { left: 90, top: 90, width: 50, height: 50 }, { width: 10, height: 10 }))
      .toEqual({ sx: 9, sy: 9, sw: 1, sh: 1 });
  });
});

// ---- Third round: one set of labels; a label taken off the note leaves its text ----
import { removeTagChips } from '../src/js/mentions.js';

describe('labels, fourth round', () => {
  it('taking a label off a title leaves the text alone', () => {
    localStorage.clear();
    const store = new NoteStore();
    const note = store.createNote('x');
    store.updateNote(note.id, { content: '<p><span class="note-tag" data-tag="errands">#errands</span></p>' });
    store.setLabels(note.id, ['errands', 'home']);
    store.setLabels(note.id, ['home']);
    expect(store.get(note.id).content).toContain('#errands');
  });

  it('"Delete label" takes it off every note, title and text, and nothing else', () => {
    localStorage.clear();
    const store = new NoteStore();
    const a = store.createNote('a');
    const b = store.createNote('b');
    const c = store.createNote('c');
    store.updateNote(a.id, { content: '<p>x <span class="note-tag" data-tag="errands">#errands</span> y</p>', labels: ['home'] });
    store.updateNote(b.id, { content: '<p>z</p>', labels: ['Errands', 'work'] });
    store.updateNote(c.id, { content: '<p>untouched</p>' });
    const strip = (html) => { const box = document.createElement('div'); box.innerHTML = html; return removeTagChips(box, ['errands']) ? box.innerHTML : null; };
    const changed = store.deleteLabel('#errands', strip);
    expect(changed.sort()).toEqual([a.id, b.id].sort());
    expect(store.get(a.id).content).toBe('<p>x y</p>');
    expect(store.get(a.id).labels).toEqual(['home']);
    expect(store.get(b.id).labels).toEqual(['work']);
    expect(store.get(c.id).content).toBe('<p>untouched</p>');
  });

  it('takes its #chips out of the text, one space with them, and leaves the others', () => {
    const root = dom('<p>buy <span class="note-tag" data-tag="Errands" contenteditable="false">#Errands</span> milk <span class="note-tag" data-tag="home">#home</span></p>');
    expect(removeTagChips(root, ['errands'])).toBe(1);
    expect(root.innerHTML).toBe('<p>buy milk <span class="note-tag" data-tag="home">#home</span></p>');
  });

  it('matches a label in the search whether it is on the title or in the text', () => {
    const n = { labels: ['home'], content: '<span class="note-tag" data-tag="errands">#errands</span>' };
    expect(noteHasLabel(n, { kind: 'any', label: 'home' })).toBe(true);
    expect(noteHasLabel(n, { kind: 'any', label: 'errands' })).toBe(true);
    expect(noteHasLabel(n, { kind: 'any', label: 'work' })).toBe(false);
  });
});
