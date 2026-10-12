/**
 * A note is never written without a picture or a video by a fault (0.9.4).
 *
 * What a note no longer names is deleted at the next start, from its folder
 * and from every backup — so the editor holds to two things an edit can never
 * trip: what is saved names every file it shows, and what the app itself makes
 * of a note on the way in names every file the note named before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bindEditor, namedIn } from '../src/js/editor.js';

const A = 'nebula-media://note/n1/aaaaaaaaaaaaaaaaaaaaaaaa.png';
const B = 'nebula-media://note/n1/bbbbbbbbbbbbbbbbbbbbbbbb.png';
const V = 'nebula-media://hole/bh-1/n1/vid-m1abc-0a1b2c3d.mp4';
const fig = (src) => `<figure class="note-image"><img src="${src}"></figure>`;

let el;
let note;
let store;
let states;
let editor;
const type = () => { el.dispatchEvent(new Event('input', { bubbles: true })); vi.advanceTimersByTime(1000); };

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="ed" contenteditable="true"></div>';
  el = document.getElementById('ed');
  note = { id: 'n1', content: `<p>words</p>${fig(A)}${fig(B)}` };
  store = { get: () => note, updateNote: vi.fn((id, patch) => Object.assign(note, patch)) };
  states = [];
  editor = bindEditor(el, store, (state, error) => states.push(error ? `${state}: ${error.message}` : state));
  editor.load(note);
});
afterEach(() => { vi.useRealTimers(); });

describe('the files a note names', () => {
  it('are its pictures and videos, each once', () => {
    expect(namedIn(`${fig(A)}${fig(A)}<video src="${V}"></video><img src="data:image/png;base64,AAAA"><img src="https://example.org/a.png">`)).toEqual([A, V]);
    expect(namedIn('')).toEqual([]);
    expect(namedIn(null)).toEqual([]);
  });
});

describe('what is saved names every file the editor shows', () => {
  it('an edit is saved as ever: words typed, a picture taken out by the person', () => {
    el.querySelector('p').textContent = 'more words';
    type();
    expect(note.content).toContain('more words');
    el.querySelectorAll('figure')[1].remove();                              // the person takes a picture out
    type();
    expect(note.content).not.toContain(B);
    expect(states.at(-1)).toBe('saved');
    expect(editor.refused).toBeNull();
    expect(editor.adopt()).toBeNull();                                      // and the app's own look at it afterwards finds nothing lost
    expect(editor.refused).toBeNull();
  });

  it('a note that would be written without a picture it shows is not written at all', () => {
    // As if what is only on screen had swallowed a picture: the bar under a video is never stored.
    const bar = document.createElement('div');
    bar.className = 'video-bar';
    bar.append(el.querySelectorAll('figure')[1]);
    el.append(bar);
    el.querySelector('p').textContent = 'typed after';
    type();
    expect(store.updateNote).not.toHaveBeenCalled();
    expect(note.content).toContain(B);                                      // what is on the disk stays
    expect(states.at(-1)).toMatch(/^error: The note would have been saved without 1 of the pictures or videos it shows, so nothing was written\. Open the note again\.$/);
    // It stays refused, said again at every try, and a flush asked for from outside answers false instead of throwing.
    expect(editor.flush()).toBe(false);
    expect(store.updateNote).not.toHaveBeenCalled();
    // Opened again, it starts afresh.
    editor.load(note);
    expect(editor.refused).toBeNull();
    el.querySelector('p').textContent = 'typed again';
    type();
    expect(note.content).toContain('typed again');
  });
});

describe('what the app makes of a note on the way in takes no picture out of it', () => {
  it('a repair that keeps every file is written back as before', () => {
    el.querySelector('p').setAttribute('data-block-type', 'paragraph');     // the kind of thing a repair adds
    const healed = editor.adopt();
    expect(healed).toContain('data-block-type');
    expect(healed).toContain(A);
    expect(editor.refused).toBeNull();
  });

  it('a note that did not open whole is not written back, and nothing typed in it is written over the stored one', () => {
    el.querySelectorAll('figure')[0].remove();                              // the way in dropped a picture
    expect(editor.adopt()).toBeNull();                                      // no "repair" goes to the disk
    expect(states.at(-1)).toMatch(/^error: This note did not open whole — 1 of its pictures or videos are missing here — so nothing is written over it\. Open the note again\.$/);
    el.querySelector('p').textContent = 'typed into the broken view';
    type();
    expect(store.updateNote).not.toHaveBeenCalled();
    expect(note.content).toContain(A);
    expect(editor.adopt()).toBeNull();
    editor.load(note);                                                      // opened again: whole this time
    expect(editor.adopt()).toBeNull();
    expect(editor.refused).toBeNull();
  });

  it('a sealed video of a note in a black hole is held to as well', () => {
    note.content = `<p>x</p><video src="${V}"></video>`;
    editor.load(note);
    el.querySelector('video').remove();
    expect(editor.adopt()).toBeNull();
    expect(editor.refused?.message).toContain('did not open whole');
  });
});
