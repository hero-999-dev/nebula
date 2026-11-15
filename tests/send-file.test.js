/**
 * A file sent to another note, and what is pulled shown at the pointer (1.0.4):
 * send-file.js, drag-ghost.js, and a file's card taken anywhere on it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendTargets, sentMarkup, initSendFile, copyOf } from '../src/js/send-file.js';
import { STRINGS } from '../src/js/i18n.js';
import { initBlockDrag } from '../src/js/block-drag.js';
import { initContextMenu } from '../src/js/context-menu.js';
import { showGhost, hideGhost, ghostName } from '../src/js/drag-ghost.js';
import { makeAttachBlock, isAttachUrl, initAttachCarry } from '../src/js/file-attach.js';
import { gripOf } from '../src/js/block-drag.js';

const URL = 'nebula-media://note/n-1_Ab/att-k3x9-0a1b2c3d.pdf';
const THERE = 'nebula-media://note/n-2/att-zz11-0a1b2c3d.pdf';
const SEALED = 'nebula-media://hole/h-1/n-3/att-zz22-0a1b2c3d.pdf';

function vault() {
  const notes = [
    { id: 'n-1_Ab', title: 'Here', content: '<p>here</p>', updatedAt: 5 },
    { id: 'n-2', title: 'Plans', content: '<p>plans</p>', updatedAt: 9 },
    { id: 'n-3', title: 'Secret plans', content: '<p>s</p>', updatedAt: 7, hole: 'h-1' },
    { id: 'n-4', title: 'Thrown', content: '', updatedAt: 8, deletedAt: 1 },
    { id: 'n-5', title: 'Put away', content: '', updatedAt: 8, archivedAt: 1 },
    { id: 'n-6', title: '', content: '', updatedAt: 1 },
  ];
  return {
    notes,
    get: (id) => notes.find((n) => n.id === id) ?? null,
    active: () => notes[0],
    updateNote: vi.fn((id, part) => Object.assign(notes.find((n) => n.id === id), part)),
  };
}

afterEach(() => { hideGhost(); document.body.replaceChildren(); delete window.nebula; });

describe('the notes a file can be sent to', () => {
  it('every note but the open one, the trash and the archive, newest first', () => {
    expect(sendTargets(vault(), 'n-1_Ab').map((n) => n.id)).toEqual(['n-2', 'n-3', 'n-6']);
  });

  it('narrowed by what is typed, whatever its case', () => {
    expect(sendTargets(vault(), 'n-1_Ab', ' PLAN ').map((n) => n.id)).toEqual(['n-2', 'n-3']);
    expect(sendTargets(vault(), 'n-1_Ab', 'untit').map((n) => n.id)).toEqual(['n-6']);
    expect(sendTargets(vault(), 'n-1_Ab', 'nothing like it')).toEqual([]);
  });

  it('a locked black hole’s notes are not in the store, and so are not offered', () => {
    const store = vault();
    store.notes = store.notes.filter((n) => !n.hole);
    expect(sendTargets(store, 'n-1_Ab').some((n) => n.hole)).toBe(false);
  });
});

describe('a file sent', () => {
  let store; let said; let card; let adoptFile; let saved;
  const set = (answer) => {
    adoptFile = vi.fn(async () => answer);
    window.nebula = { media: { adoptFile } };
  };
  beforeEach(() => {
    store = vault();
    said = [];
    saved = vi.fn(async () => {});
    card = makeAttachBlock(URL, 'a.pdf', 10);
    document.body.append(card);
  });
  const sender = () => initSendFile({ store, say: (text) => said.push(text), saveCurrent: saved });

  it('is a card of the copy, written at the end of the other note; this note keeps its own', async () => {
    set({ ok: true, url: THERE });
    expect(await sender().send(card, 'n-2')).toBe(true);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(adoptFile).toHaveBeenCalledWith('n-2', null, URL);
    const written = store.get('n-2').content;
    expect(written.startsWith('<p>plans</p>')).toBe(true);
    expect(written.endsWith('<p><br></p>')).toBe(true);
    const box = document.createElement('div');
    box.innerHTML = written;
    const sent = box.querySelector('.link-attach');
    expect(sent.dataset.src).toBe(THERE);
    expect(sent.dataset.name).toBe('a.pdf');
    expect(isAttachUrl(sent.dataset.src)).toBe(true);
    expect(card.dataset.src).toBe(URL);
    expect(store.get('n-1_Ab').content).toBe('<p>here</p>');
    expect(said).toEqual(['A copy was sent to the note']);
  });

  it('into an open black hole is sealed there', async () => {
    set({ ok: true, url: SEALED });
    expect(await sender().send(card, 'n-3')).toBe(true);
    expect(adoptFile).toHaveBeenCalledWith('n-3', 'h-1', URL);
    expect(store.get('n-3').content).toContain(SEALED);
  });

  it('writes nothing when the hole was locked meanwhile, the copy failed, or the note is gone', async () => {
    set({ ok: false, error: 'locked' });
    expect(await sender().send(card, 'n-3')).toBe(false);
    set({ ok: false, error: 'missing' });
    expect(await sender().send(card, 'n-2')).toBe(false);
    set({ ok: true, url: THERE });
    expect(await sender().send(card, 'n-9')).toBe(false);
    expect(await sender().send(card, 'n-1_Ab')).toBe(false);     // to itself
    adoptFile = vi.fn(async () => { store.get('n-2').deletedAt = 3; return { ok: true, url: THERE }; });
    window.nebula = { media: { adoptFile } };
    expect(await sender().send(card, 'n-2')).toBe(false);
    expect(store.updateNote).not.toHaveBeenCalled();
    expect(said).toEqual(['Open the black hole first', 'The file could not be sent', 'The file could not be sent', 'The file could not be sent', 'The file could not be sent']);
  });

  it('a card with no file of this note is not sent', async () => {
    set({ ok: true, url: THERE });
    card.dataset.src = '';
    expect(await sender().send(card, 'n-2')).toBe(false);
    expect(adoptFile).not.toHaveBeenCalled();
  });

  it('the list: a field, the notes under it, Enter sends to the one picked, Esc and a press elsewhere close it', async () => {
    set({ ok: true, url: THERE });
    const s = sender();
    s.open(card, 40, 40);
    const menu = document.querySelector('.send-menu');
    const field = menu.querySelector('input');
    const names = () => [...menu.querySelectorAll('.send-menu__list button')].map((b) => b.textContent);
    expect(names()).toEqual(['Plans', 'Secret plans', 'Untitled']);
    expect(menu.querySelector('.send-menu__hole').textContent).toBe('Secret plans');
    field.value = 'zzz';
    field.dispatchEvent(new Event('input'));
    expect(menu.querySelector('.send-menu__none')).not.toBeNull();
    field.value = 'plan';
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(menu.querySelector('button.sel').textContent).toBe('Secret plans');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(document.querySelector('.send-menu')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(adoptFile).toHaveBeenCalledWith('n-2', null, URL);

    s.open(card, 40, 40);
    document.querySelector('.send-menu input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.send-menu')).toBeNull();
    s.open(card, 40, 40);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.send-menu')).toBeNull();
    expect(adoptFile).toHaveBeenCalledTimes(1);
  });

  it('the card written is the one a pasted file gets', () => {
    const box = document.createElement('div');
    box.innerHTML = sentMarkup(THERE, 'report.pdf', 2048);
    expect(box.children.length).toBe(2);
    expect(box.firstElementChild.outerHTML).toBe(makeAttachBlock(THERE, 'report.pdf', 2048).outerHTML);
  });
});

describe('anything else in a note sent (1.0.4)', () => {
  const PIC = 'nebula-media://note/n-1_Ab/0a1b2c3d.png';
  let store; let said; let adoptFile;
  beforeEach(() => {
    store = vault();
    said = [];
    adoptFile = vi.fn(async () => ({ ok: true, url: THERE }));
    window.nebula = { media: { adoptFile } };
  });
  const sender = () => initSendFile({ store, say: (text) => said.push(text) });
  const note = (html) => {
    const editor = document.createElement('div');
    editor.innerHTML = html;
    document.body.append(editor);
    return editor;
  };

  it('a picture in the text is copied whole; one that floats goes into the text of the other note', () => {
    const editor = note(`<figure class="note-image note-image--inline" id="a" style="width: 200px;"><img src="${PIC}"><figcaption class="image-caption">words</figcaption></figure>`
      + `<div class="image-layer"><figure class="note-image behind" id="b" style="left: 40px; top: 90px; width: 120px; height: 80px;"><img src="${PIC}"></figure></div>`);
    const before = editor.innerHTML;
    const inText = copyOf(editor.querySelector('#a'));
    expect(inText.children.length).toBe(1);
    expect(inText.querySelector('figure.note-image--inline img').getAttribute('src')).toBe(PIC);
    expect(inText.querySelector('figcaption').textContent).toBe('words');
    const floated = copyOf(editor.querySelector('#b')).firstElementChild;
    expect(floated.classList.contains('note-image--inline')).toBe(true);
    expect(floated.classList.contains('behind')).toBe(false);
    expect(floated.style.left).toBe('');
    expect(floated.style.top).toBe('');
    expect(floated.style.width).toBe('120px');
    expect(editor.innerHTML).toBe(before);                            // this note keeps its own, where it was
  });

  it('a block is a line of its own, a list’s item a list of its kind, a picture alone a line', () => {
    const editor = note(`<h2 id="h">A heading</h2><ol><li id="i">one</li><li>two</li></ol><p>a <img id="p" src="${PIC}"> b</p><p id="e"><br></p>`);
    expect(copyOf(editor.querySelector('#h')).innerHTML).toContain('A heading');
    expect(copyOf(editor.querySelector('#h')).firstElementChild.tagName).toBe('H2');
    const item = copyOf(editor.querySelector('#i'));
    expect(item.firstElementChild.tagName).toBe('OL');
    expect([...item.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['one']);
    const pic = copyOf(editor.querySelector('#p'));
    expect(pic.firstElementChild.tagName).toBe('P');
    expect(pic.querySelector('img').getAttribute('src')).toBe(PIC);
    expect(copyOf(editor.querySelector('#e')).childNodes.length).toBe(0);     // an empty line is nothing to send
    expect(copyOf(null).childNodes.length).toBe(0);
  });

  it('the words selected go in lines: within one line, across two, out of a list, out of a table', () => {
    const editor = note('<p id="a">one <b>two</b> three</p><p id="b">four five</p><ul><li id="x">six</li><li id="y">seven</li></ul>'
      + '<table><tbody><tr><td id="c">eight</td><td id="d">nine</td></tr></tbody></table>');
    const range = (from, a, to, b) => {
      const r = document.createRange();
      r.setStart(from, a);
      r.setEnd(to, b);
      return r;
    };
    const one = copyOf(range(editor.querySelector('#a').firstChild, 4, editor.querySelector('#a').lastChild, 4));
    expect(one.children.length).toBe(1);
    expect(one.firstElementChild.tagName).toBe('P');
    expect(one.firstElementChild.innerHTML).toBe('<b>two</b> thr');
    const two = copyOf(range(editor.querySelector('#a').lastChild, 1, editor.querySelector('#b').firstChild, 4));
    expect([...two.children].map((el) => `${el.tagName}:${el.textContent}`)).toEqual(['P:three', 'P:four']);
    const listed = copyOf(range(editor.querySelector('#x').firstChild, 0, editor.querySelector('#y').firstChild, 5));
    expect(listed.children.length).toBe(1);
    expect(listed.firstElementChild.tagName).toBe('UL');
    expect([...listed.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['six', 'seven']);
    const cells = copyOf(range(editor.querySelector('#c').firstChild, 0, editor.querySelector('#d').firstChild, 4));
    expect(cells.querySelector('td, tr, table')).toBeNull();
    expect(cells.firstElementChild.tagName).toBe('P');
    expect(cells.textContent).toContain('eight');
    expect(cells.textContent).toContain('nine');
  });

  it('is written at the end of the other note; no file is copied for words or a picture', async () => {
    const editor = note(`<p id="a">take this</p><figure class="note-image note-image--inline" id="f"><img src="${PIC}"></figure>`);
    const s = sender();
    expect(await s.send(editor.querySelector('#a'), 'n-2')).toBe(true);
    expect(store.get('n-2').content).toMatch(/^<p>plans<\/p><p[^>]*>take this<\/p><p><br><\/p>$/);
    expect(await s.send(editor.querySelector('#f'), 'n-2')).toBe(true);
    expect(store.get('n-2').content).toContain(PIC);
    expect(adoptFile).not.toHaveBeenCalled();
    expect(said).toEqual(['A copy was sent to the note', 'A copy was sent to the note']);
    expect(editor.querySelector('#a').textContent).toBe('take this');
  });

  it('a file’s card inside what is sent is copied there too; nothing to send is said so', async () => {
    const editor = note('<div class="blk-cols" id="cols"><div class="blk-col"><p>beside</p></div><div class="blk-col"></div></div><p id="e"><br></p>');
    editor.querySelector('.blk-col:last-child').append(makeAttachBlock(URL, 'a.pdf', 10));
    const s = sender();
    expect(await s.send(editor.querySelector('#cols'), 'n-2')).toBe(true);
    expect(adoptFile).toHaveBeenCalledWith('n-2', null, URL);
    const box = document.createElement('div');
    box.innerHTML = store.get('n-2').content;
    expect(box.querySelector('.link-attach').dataset.src).toBe(THERE);
    expect(box.textContent).toContain('beside');
    expect(editor.querySelector('.link-attach').dataset.src).toBe(URL);
    expect(await s.send(editor.querySelector('#e'), 'n-2')).toBe(false);
    adoptFile.mockImplementation(async () => ({ ok: false, error: 'missing' }));
    expect(await s.send(editor.querySelector('#cols'), 'n-2')).toBe(false);
    expect(said).toEqual(['A copy was sent to the note', 'The copy could not be sent', 'The copy could not be sent']);
    expect(STRINGS['The copy could not be sent']?.length).toBe(3);
  });

  it('the right-click menu offers it on a picture, a widget, a card and the words selected — in an Only view note too', () => {
    const editor = note(`<p id="a">some words here</p><figure class="note-image note-image--inline" id="f"><img src="${PIC}"></figure>`
      + '<figure class="note-image note-widget" id="w"><div class="wg">12:00</div></figure>'
      + '<div class="link-block link-bookmark" id="m" contenteditable="false"><a class="link-card" href="https://example.com/">a page</a></div>');
    let fire = null;
    window.nebula = { contextMenu: { on: (fn) => { fire = fn; } } };
    const sendTo = vi.fn();
    let locked = true;
    initContextMenu(editor, { files: { sendTo }, isLocked: () => locked });
    const menu = document.getElementById('ctx-menu');
    const names = () => [...menu.querySelectorAll('button')].map((b) => b.textContent);
    const click = (el) => {
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 30 }));
      fire({ x: 30, y: 30 });
    };
    click(editor.querySelector('#f img'));
    expect(names()).toEqual(['Copy image', 'Send to…']);
    menu.querySelectorAll('button')[1].click();
    expect(sendTo).toHaveBeenLastCalledWith(editor.querySelector('#f'), 30, 30);
    click(editor.querySelector('#w .wg'));
    expect(names()).toEqual(['Copy widget', 'Send to…']);
    click(editor.querySelector('#m a'));
    expect(names()).toEqual(['Send to…']);
    menu.querySelector('button').click();
    expect(sendTo).toHaveBeenLastCalledWith(editor.querySelector('#m'), 30, 30);
    const r = document.createRange();
    r.setStart(editor.querySelector('#a').firstChild, 5);
    r.setEnd(editor.querySelector('#a').firstChild, 10);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    click(editor.querySelector('#a'));
    expect(names()).toEqual(['Copy', 'Send to…']);
    menu.querySelectorAll('button')[1].click();
    expect(sendTo.mock.calls.at(-1)[0].toString()).toBe('words');
    locked = false;
    click(editor.querySelector('#f img'));
    expect(names()).toEqual(['Copy image', 'Send to…', 'Add caption', 'Delete image']);
  });

  it('the list keeps the words that were selected when it was opened', async () => {
    const editor = note('<p id="a">keep these words</p>');
    const r = document.createRange();
    r.setStart(editor.querySelector('#a').firstChild, 5);
    r.setEnd(editor.querySelector('#a').firstChild, 10);
    const s = sender();
    s.open(r, 20, 20);
    r.collapse(true);                                                  // the field took the caret
    document.querySelector('.send-menu input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((done) => setTimeout(done, 0));
    expect(store.get('n-2').content).toBe('<p>plans</p><p>these</p><p><br></p>');
  });
});

describe('what is pulled, at the pointer', () => {
  it('a chip with the block’s name follows the mouse; the note’s own markup is not touched', () => {
    const card = makeAttachBlock(URL, 'report.pdf', 10);
    document.body.append(card);
    const before = card.outerHTML;
    showGhost(card, 100, 50);
    const chip = document.querySelector('.carry-ghost');
    expect(chip.querySelector('.carry-ghost__name').textContent).toBe('report.pdf');
    expect(chip.querySelector('.attach-icon')).not.toBeNull();
    expect(document.querySelector('.carry-veil')).not.toBeNull();
    const at = chip.style.left;
    showGhost(card, 300, 80);
    expect(document.querySelectorAll('.carry-ghost').length).toBe(1);
    expect(chip.style.left).not.toBe(at);
    // Saved in the middle of a pull, the note is as it was.
    expect(card.outerHTML).toBe(before);
    expect(card.contains(chip)).toBe(false);
    hideGhost();
    expect(document.querySelector('.carry-ghost, .carry-veil')).toBeNull();
  });

  it('a picture is shown small, itself; a widget by its name', () => {
    document.body.innerHTML = '<figure class="note-image note-image--inline" id="pic"><img src="data:image/png;base64,AAAA"><figcaption class="image-caption">words</figcaption></figure>'
      + '<figure class="note-image note-widget" id="wg"><div class="wg"></div></figure>';
    const pic = document.getElementById('pic');
    const before = pic.outerHTML;
    showGhost(pic, 10, 10);
    const chip = document.querySelector('.carry-ghost');
    expect(chip.querySelector('img.carry-ghost__pic').getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(chip.querySelector('.carry-ghost__name')).toBeNull();
    expect(pic.outerHTML).toBe(before);
    showGhost(document.getElementById('wg'), 10, 10);
    expect(document.querySelectorAll('.carry-ghost').length).toBe(1);
    expect(document.querySelector('.carry-ghost__name').textContent).toBe('Widget');
    expect(document.querySelector('.carry-ghost__pic')).toBeNull();
  });

  it('names a table, a code block and a card', () => {
    const el = (html) => Object.assign(document.createElement('div'), { innerHTML: html }).firstElementChild;
    expect(ghostName(el('<div class="blk-table"></div>'))).toBe('Table');
    expect(ghostName(el('<div class="blk-code"></div>'))).toBe('Code block');
    expect(ghostName(el('<div class="link-block"><a class="link-card"><strong class="link-card__title"> a page </strong></a></div>'))).toBe('a page');
    expect(ghostName(el('<div class="link-block"></div>'))).toBe('Link');
  });

  it('is taken down when the system’s drag takes the file out of the window', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const card = makeAttachBlock(URL, 'a.pdf', 10);
    editor.append(card);
    window.nebula = { media: { carryFile: vi.fn(async () => ({ ok: true })), dragFile: vi.fn(async () => ({ ok: true })), carryEnd: vi.fn() } };
    initAttachCarry(editor, { owner: () => ({ id: 'n-1_Ab', hole: null }) });
    const move = (x, y) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, buttons: 1 }));
    // Anywhere on the card: its badge's edge, the card itself — not only its title.
    card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    move(140, 100);
    showGhost(card, 140, 100);
    expect(window.nebula.media.carryFile).toHaveBeenCalledTimes(1);
    move(-5, 100);
    expect(window.nebula.media.dragFile).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.carry-ghost')).toBeNull();
  });

  it('the pull within the note ends with it: the veil is not drawn again when the file comes back (1.0.4)', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<p>above</p><p>below</p>';
    document.body.append(editor);
    const card = makeAttachBlock(URL, 'a.pdf', 10);
    editor.prepend(card);
    let never;
    const pending = new Promise((done) => { never = done; });
    const carryEnd = vi.fn();
    window.nebula = { media: { carryFile: vi.fn(async () => ({ ok: true })), dragFile: vi.fn(() => pending), carryEnd } };
    initBlockDrag(editor, {});
    initAttachCarry(editor, { owner: () => ({ id: 'n-1_Ab', hole: null }) });
    const move = (x, y, buttons = 1) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, buttons }));
    card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    move(140, 100);
    expect(document.querySelector('.carry-ghost')).not.toBeNull();
    expect(document.body.classList.contains('block-dragging')).toBe(true);
    move(-5, 100);                                                     // out of the window: the system's drag
    expect(window.nebula.media.dragFile).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.carry-ghost, .carry-veil')).toBeNull();
    expect(document.body.classList.contains('block-dragging')).toBe(false);
    move(140, 100);                                                    // back over the note
    expect(document.querySelector('.carry-ghost, .carry-veil')).toBeNull();
    // The button let go before the system's drag has begun: that drag is called off.
    expect(carryEnd).not.toHaveBeenCalled();
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(carryEnd).toHaveBeenCalled();
    never({ ok: true });
  });
});

describe('a file’s card taken anywhere on it', () => {
  it('by the card itself, its badge and its name — not by its buttons; other cards as before', () => {
    const root = document.createElement('div');
    const card = makeAttachBlock(URL, 'a.pdf', 10);
    root.append(card);
    root.insertAdjacentHTML('beforeend', '<div class="link-block link-bookmark" id="mark" contenteditable="false"><a class="link-card" href="https://example.com/">a</a></div>');
    document.body.append(root);
    expect(gripOf(card, 0)).toBe(card);
    expect(gripOf(card.querySelector('.attach-icon'), 0)).toBe(card);
    expect(gripOf(card.querySelector('.link-card__title'), 0)).toBe(card);
    expect(gripOf(card.querySelector('[data-link-remove]'), 0)).toBeNull();
    expect(gripOf(root.querySelector('#mark'), 0)).toBeNull();
  });
});
