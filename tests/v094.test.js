/**
 * 0.9.4 — the owner's "Ideas For Nebula and Testing For Nebula" note, first part:
 * the small things. The parts that need the real app are in tests/e2e/v094.mjs.
 */
import { describe, it, expect, vi } from 'vitest';
import { arrowFor, isDividerLine, DIVIDER_DASHES, initAutoArrows } from '../src/js/auto-arrows.js';
import { spellLanguages, forgetIgnoredWords } from '../electron/context-menu.js';
import { buildMenus } from '../src/js/app-menu.js';
import { nextLayout } from '../src/js/dock.js';
import { dropFrozenInk, undressInserted } from '../src/js/paste-clean.js';
import { MARKUP_VERSION } from '../src/js/migrate.js';
import { makeToggle, unmakeToggle, healToggles } from '../src/js/toggles.js';
import { SLASH_ITEMS, filterSlash } from '../src/js/slash-menu.js';
import { exitListOnEmptyItem, liftListItemAtStart } from '../src/js/lists.js';
import { detectTagQuery, matchLabels, syncTagChips, contentTags } from '../src/js/mentions.js';
import { paintLabelHits } from '../src/js/label-filter.js';
import { FONTS, cleanFontName, cleanFontStack, customFontStack, fontRows } from '../src/js/toolbar.js';

describe('arrows as they are typed', () => {
  it('turns --> into a right arrow and <-- into a left one', () => {
    expect(arrowFor('do this -->')).toEqual({ cut: 3, put: '→' });
    expect(arrowFor('and this <--')).toEqual({ cut: 3, put: '←' });
  });

  it('leaves everything else alone', () => {
    expect(arrowFor('a -> b')).toBeNull();
    expect(arrowFor('--')).toBeNull();
    expect(arrowFor('--> and on')).toBeNull();   // only as the last character is typed
    expect(arrowFor('')).toBeNull();
    expect(arrowFor(null)).toBeNull();
  });

  it('a line of four dashes, and nothing else, is one that becomes a divider', () => {
    expect(DIVIDER_DASHES).toBe(4);                              // "at the fourth dash"
    expect(isDividerLine('----')).toBe(true);
    expect(isDividerLine('---')).toBe(false);
    expect(isDividerLine('-----')).toBe(false);                 // the fifth is typed on the line under the divider
    expect(isDividerLine(' ----​')).toBe(true);
    expect(isDividerLine('a ----')).toBe(false);
    expect(isDividerLine('--> --')).toBe(false);
    expect(isDividerLine(null)).toBe(false);
  });

  it('the fourth dash typed on a plain line makes the divider, with a line under it; in a list or a heading it stays dashes', () => {
    const editor = document.createElement('div');
    document.body.replaceChildren(editor);
    let steps = 0;
    initAutoArrows(editor, { history: { push: () => { steps += 1; } } });
    const typeFourth = (html, where) => {
      editor.innerHTML = html;
      const text = editor.querySelector(where).firstChild;
      const r = document.createRange();
      r.setStart(text, text.nodeValue.length);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: '-', bubbles: true }));
      return editor.innerHTML;
    };
    expect(typeFourth('<p>above</p><p id="d">----</p><p>below</p>', '#d')).toBe('<p>above</p><hr class="blk-hr"><p><br></p><p>below</p>');
    expect(steps).toBe(1);                                       // one step back gives the dashes again
    expect(getSelection().anchorNode).toBe(editor.children[2]);
    expect(typeFourth('<p id="d">---</p>', '#d')).toBe('<p id="d">---</p>');
    expect(typeFourth('<ul><li id="d">----</li></ul>', '#d')).toBe('<ul><li id="d">----</li></ul>');
    expect(typeFourth('<h2 id="d">----</h2>', '#d')).toBe('<h2 id="d">----</h2>');
    // In a column the divider is made in the column.
    expect(typeFourth('<div class="blk-cols"><div class="blk-col"><p id="d">----</p></div><hr class="blk-vr"><div class="blk-col"><p>r</p></div></div>', '#d'))
      .toBe('<div class="blk-cols"><div class="blk-col"><hr class="blk-hr"><p><br></p></div><hr class="blk-vr"><div class="blk-col"><p>r</p></div></div>');
  });
});

describe('spelling', () => {
  it('checks English as American and British together', () => {
    expect(spellLanguages('en', ['en-US', 'en-GB', 'de-DE'])).toEqual(['en-US', 'en-GB']);
    expect(spellLanguages('en', ['en-GB'])).toEqual(['en-GB']);
  });

  it('keeps one language for the others, and one English when theirs is missing', () => {
    expect(spellLanguages('de', ['en-US', 'en-GB', 'de-DE'])).toEqual(['de-DE']);
    expect(spellLanguages('tr', ['en-US', 'en-GB'])).toEqual(['en-US']);
    expect(spellLanguages('tr', [])).toEqual([]);
  });

  it('takes the ignored words out of the dictionary again', () => {
    const ses = { removeWordFromSpellCheckerDictionary: vi.fn() };
    forgetIgnoredWords(ses, ['Nebula', 'zorblat']);
    expect(ses.removeWordFromSpellCheckerDictionary.mock.calls).toEqual([['Nebula'], ['zorblat']]);
    // A word that was never added must not stop the rest.
    const failing = { removeWordFromSpellCheckerDictionary: vi.fn(() => { throw new Error('no such word'); }) };
    expect(() => forgetIgnoredWords(failing, ['a', 'b'])).not.toThrow();
    expect(failing.removeWordFromSpellCheckerDictionary).toHaveBeenCalledTimes(2);
  });
});

describe('the theme\'s ink a paste froze into the words', () => {
  const dom = (html) => { const el = document.createElement('div'); el.innerHTML = html; return el; };

  it('lets go of every theme ink in an old note, and of nothing else', () => {
    const root = dom(
      '<p><b style="color: rgb(17, 17, 17);">white theme</b> <i style="color: rgb(32, 30, 26)">light</i> '
      + '<span style="color: #EDE7F7; font-family: Consolas;">main</span> <span style="color: rgb(200, 0, 0);">the source\'s red</span></p>'
      + '<div class="shape-layer"><div class="shape" style="color: rgb(17, 17, 17); left: 4px;">a shape keeps its style</div></div>',
    );
    expect(dropFrozenInk(root)).toBe(3);
    expect(root.querySelector('b').hasAttribute('style')).toBe(false);
    expect(root.querySelector('i').hasAttribute('style')).toBe(false);
    // The font was chosen; only the ink was not.
    expect(root.querySelector('span').style.fontFamily).toBe('Consolas');
    expect(root.querySelector('span').style.color).toBe('');
    expect(root.querySelectorAll('span')[1].style.color).toBe('rgb(200, 0, 0)');
    expect(root.querySelector('.shape').style.color).toBe('rgb(17, 17, 17)');
    expect(dropFrozenInk(root)).toBe(0);
    expect(MARKUP_VERSION >= '0.9.4').toBe(true);
  });

  it('after a paste, only what the paste made loses its colour', () => {
    const root = dom('<p><span id="old" style="color: rgb(0, 0, 0);">kept as it was</span> <b id="new" style="color: rgb(237, 231, 247);">pasted</b></p>');
    const had = new Set([root.querySelector('#old')]);
    expect(undressInserted(root, had)).toBe(1);
    expect(root.querySelector('#old').style.color).toBe('rgb(0, 0, 0)');
    expect(root.querySelector('#new').hasAttribute('style')).toBe(false);
  });
});

describe('toggles: headings, and in a list', () => {
  const dom = (html) => { const el = document.createElement('div'); el.innerHTML = html; return el; };

  it('makes a heading that folds, from the slash menu or from a heading line', () => {
    const root = dom('<p>Chapter</p><h2>Part</h2>');
    expect(makeToggle(root.querySelector('p'), { heading: 'h1' }).firstElementChild.outerHTML).toBe('<h1 class="toggle-title">Chapter</h1>');
    // A heading stays the heading it was.
    expect(makeToggle(root.querySelector('h2')).firstElementChild.outerHTML).toBe('<h2 class="toggle-title">Part</h2>');
    expect(SLASH_ITEMS.filter((it) => it.id.startsWith('toggle-h')).map((it) => it.label)).toEqual(['Toggle heading 1', 'Toggle heading 2', 'Toggle heading 3']);
    // "/h1" still finds the plain heading first, "/toggle" the toggle list.
    expect(filterSlash('h1')[0].id).toBe('h1');
    expect(filterSlash('toggle')[0].id).toBe('toggle');
  });

  it('keeps a list item in its list, its sub-list what folds away', () => {
    const root = dom('<ol><li>one</li><li>two <b>bold</b><ul><li>sub</li></ul></li><li>three</li></ol>');
    const toggle = makeToggle(root.querySelectorAll('ol > li')[1]);
    expect(root.querySelectorAll('ol').length).toBe(1);
    expect(root.querySelectorAll('ol > li').length).toBe(3);
    expect(toggle.parentElement.tagName).toBe('LI');
    expect(toggle.outerHTML).toBe('<div class="blk-toggle" data-open="true"><p class="toggle-title">two <b>bold</b></p><div class="toggle-body"><ul><li>sub</li></ul></div></div>');
  });

  it('takes a toggle away again without losing a word', () => {
    const root = dom('<ol><li><div class="blk-toggle" data-open="true"><p class="toggle-title">two</p><div class="toggle-body"><p><br></p><p>under</p></div></div></li></ol>'
      + '<div class="blk-toggle"><h3 class="toggle-title">Head</h3><div class="toggle-body"><p>line</p><ul><li>x</li></ul></div></div>');
    const [inItem, plain] = root.querySelectorAll('.blk-toggle');
    expect(unmakeToggle(inItem).tagName).toBe('LI');
    expect(unmakeToggle(plain).outerHTML).toBe('<h3>Head</h3>');
    expect(root.innerHTML).toBe('<ol><li>two<p>under</p></li></ol><h3>Head</h3><p>line</p><ul><li>x</li></ul>');
  });

  it('leaves Enter and Backspace in a toggle to the toggle, not to the list around it', () => {
    const root = dom('<ul><li><div class="blk-toggle" data-open="true"><p class="toggle-title"><br></p><div class="toggle-body"><p id="in"><br></p></div></div></li><li id="plain"><br></li></ul>');
    document.body.appendChild(root);
    const caret = (el) => { const r = document.createRange(); r.setStart(el, 0); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); return s; };
    // An empty item is left by Enter — but not from inside the toggle it holds.
    expect(exitListOnEmptyItem(root, caret(root.querySelector('#in')))).toBe(false);
    expect(liftListItemAtStart(root, caret(root.querySelector('#in')))).toBe(false);
    expect(root.querySelectorAll('li').length).toBe(2);
    expect(exitListOnEmptyItem(root, caret(root.querySelector('#plain')))).toBe(true);
    root.remove();
  });
});

describe('labels: a list to pick from, and a chip whose label follows its word', () => {
  const dom = (html) => { const el = document.createElement('div'); el.innerHTML = html; return el; };

  it('opens on "#" and on the start of a label, not on "#1" or "C#"', () => {
    expect(detectTagQuery('see #')).toEqual({ query: '', start: 4 });
    expect(detectTagQuery('#wo')).toEqual({ query: 'wo', start: 0 });
    expect(detectTagQuery('see #çalışma')).toEqual({ query: 'çalışma', start: 4 });
    expect(detectTagQuery('#1')).toBeNull();
    expect(detectTagQuery('C#')).toBeNull();
    expect(detectTagQuery('#work ')).toBeNull();
  });

  it('offers the labels that begin with what was typed first, each once', () => {
    const labels = ['Work', 'homework', 'work', 'Errands', 'world'];
    expect(matchLabels(labels, 'wo')).toEqual(['Work', 'world', 'homework']);
    expect(matchLabels(labels, '')).toEqual(['Errands', 'homework', 'Work', 'world']);
    expect(matchLabels(labels, 'zz')).toEqual([]);
    expect(matchLabels(labels, '', { limit: 2 })).toHaveLength(2);
  });

  it('offers İş for iş and İŞ, and Alıntı for alinti (hunt B19)', () => {
    // In the window's en-US lower case İ is i + a combining dot: "iş" never found "İş".
    const labels = ['İş', 'iş planı', 'Ev', 'Alıntı'];
    expect(matchLabels(labels, 'iş').sort()).toEqual(['iş planı', 'İş'].sort());
    expect(matchLabels(labels, 'İŞ')).toHaveLength(2);
    expect(matchLabels(labels, 'alinti')).toEqual(['Alıntı']);
  });

  it('a chip edited to another word is that label, and the old one is gone', () => {
    const root = dom('<p><span class="note-tag" data-tag="abc">#abd</span> and <span class="note-tag" data-tag="keep">#keep</span></p>');
    expect(syncTagChips(root)).toBe(1);
    expect(contentTags(root.innerHTML)).toEqual(['abd', 'keep']);
    root.querySelector('.note-tag').textContent = '#acb';
    expect(syncTagChips(root)).toBe(1);
    expect(contentTags(root.innerHTML)).toEqual(['acb', 'keep']);
    expect(syncTagChips(root)).toBe(0);
  });

  it('a chip whose # was deleted is words again', () => {
    const root = dom('<p>x <span class="note-tag" data-tag="abc">abc</span> y</p>');
    expect(syncTagChips(root)).toBe(1);
    expect(root.innerHTML).toBe('<p>x abc y</p>');
  });

  it('finds the chips of the picked label in the open note, whatever their case', () => {
    const root = dom('<p><span class="note-tag" data-tag="Work">#Work</span> x <span class="note-tag" data-tag="home">#home</span></p><p><span class="note-tag" data-tag="work">#work</span></p>');
    expect(paintLabelHits(root, 'work').map((c) => c.textContent)).toEqual(['#Work', '#work']);
    expect(paintLabelHits(root, null)).toEqual([]);
    expect(paintLabelHits(root, 'nothing')).toEqual([]);
  });
});

describe('the font menu: a search, and adding a font', () => {
  it('keeps a font name that cannot end a CSS value', () => {
    expect(cleanFontName('  Noto   Serif ')).toBe('Noto Serif');
    expect(cleanFontName('Evil"; color: red; {')).toBe('Evil color: red');
    expect(cleanFontName('')).toBe('');
    expect(customFontStack('Noto Serif')).toBe('"Noto Serif", serif');
    expect(cleanFontName(`${'x'.repeat(59)}🌙 bold`)).toBe(`${'x'.repeat(59)}🌙`); // hunt B24: never half an emoji
    expect(cleanFontStack(`${'x'.repeat(199)}🌙 bold`)).toBe(`${'x'.repeat(199)}🌙`); // hunt B24: never half an emoji
  });

  it('lists the app’s fonts, then the ones added, then this computer’s, narrowed by what is typed', () => {
    const all = fontRows('', { custom: ['Noto Serif', 'arial'], installed: ['Bahnschrift', 'Arial', 'Candara'] });
    expect(all.own.length).toBe(FONTS.length + 1);          // "arial" is the app's Arial already
    expect(all.own.at(-1)).toEqual({ label: 'Noto Serif', stack: '"Noto Serif", serif', custom: true, pinned: false });
    expect(all.installed).toEqual(['Bahnschrift', 'Candara']);
    expect(all.add).toBe('');
    const found = fontRows('can', { installed: ['Bahnschrift', 'Candara', 'Cancun Sans'] });
    expect(found.own).toEqual([]);
    expect(found.installed).toEqual(['Cancun Sans', 'Candara']);
    expect(found.add).toBe('can');                           // a name no row is exactly
    expect(fontRows('Candara', { installed: ['Candara'] }).add).toBe('');
    expect(fontRows('conso').own.map((r) => r.label)).toEqual(['Consolas']);
    expect(fontRows('', { installed: Array.from({ length: 90 }, (_, i) => `Font ${i}`) }).installed).toHaveLength(40);
  });
});

describe('Ctrl + and Ctrl − belong to the words', () => {
  it('the View menu no longer promises those keys for the window zoom', () => {
    const view = buildMenus({}).find((m) => m.title === 'View');
    for (const id of ['view.zoomin', 'view.zoomout', 'view.zoomreset']) {
      expect(view.items.find((i) => i.id === id).hint).toBeUndefined();
    }
  });
});

describe('the editing bar before the app has loaded', () => {
  it('stands on top unless a side was chosen', () => {
    expect(nextLayout({}, 'none').bar).toBe('top');
  });
});

describe('a toggle that lost its title is no toggle (0.9.4)', () => {
  const heal = (html) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    const healed = healToggles(host);
    return { healed, html: host.innerHTML };
  };

  it('an empty frame — the owner’s, stuck at the top of a note — becomes one empty line', () => {
    expect(heal('<div class="blk-toggle" data-open="true"><br></div><p>after</p>')).toEqual({ healed: true, html: '<p><br></p><p>after</p>' });
    expect(heal('<div class="blk-toggle"></div>').html).toBe('<p><br></p>');
  });

  it('what a frame still holds becomes plain lines, nothing lost', () => {
    expect(heal('<div class="blk-toggle" data-open="true">loose <b>words</b><div class="toggle-body"><p>kept</p><p><br></p><ul><li>item</li></ul></div></div>').html)
      .toBe('<p>loose <b>words</b></p><p>kept</p><ul><li>item</li></ul>');
    expect(heal('<div class="blk-toggle"><div class="toggle-body"><p>only the body</p></div></div>').html).toBe('<p>only the body</p>');
  });

  it('in a list item the item keeps its place', () => {
    expect(heal('<ul><li><div class="blk-toggle" data-open="true"><br></div></li><li>next</li></ul>').html).toBe('<ul><li><br></li><li>next</li></ul>');
  });

  it('a frame inside a toggle is put right, the toggle around it kept', () => {
    const out = heal('<div class="blk-toggle" data-open="true"><p class="toggle-title">outer</p><div class="toggle-body"><div class="blk-toggle"><br></div><p>line</p></div></div>');
    expect(out.html).toBe('<div class="blk-toggle" data-open="true"><p class="toggle-title">outer</p><div class="toggle-body"><p><br></p><p>line</p></div></div>');
  });

  it('a toggle with its title is left alone — a heading, an empty title, a closed one', () => {
    for (const whole of [
      '<div class="blk-toggle" data-open="true"><p class="toggle-title">title</p><div class="toggle-body"><p><br></p></div></div>',
      '<div class="blk-toggle"><h2 class="toggle-title">heading</h2><div class="toggle-body"><p>x</p></div></div>',
      '<div class="blk-toggle" data-open="true"><p class="toggle-title"><br></p><div class="toggle-body"><p><br></p></div></div>',
      '<div class="blk-toggle" data-open="true"><p class="toggle-title">no body yet</p></div>',
    ]) expect(heal(whole)).toEqual({ healed: false, html: whole });
  });
});
