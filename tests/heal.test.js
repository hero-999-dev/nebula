/**
 * The residue museum, and the repair that empties it.
 *
 * The owner (2026-09-27): a bug that has been fixed in the app keeps living in
 * the notes it touched — "if they continue the note, the bug is still there; a
 * new note is clean" — on every computer the app runs on. Each exhibit below is
 * markup an older version really wrote into notes. Every one must come out as
 * this version writes it, without losing a word, and a second pass must find
 * nothing left to do.
 *
 * A fix whose bug could have written something into a note adds its exhibit
 * here (AGENTS.md).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { healHtml, healVault, fingerprint, sameNote } from '../src/js/heal.js';
import { MARKUP_VERSION } from '../src/js/migrate.js';
import { NoteStore } from '../src/js/notes.js';
import { GUIDE_NOTE } from '../src/js/seed-notes.js';

const parse = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

const MUSEUM = [
  {
    when: 'up to 0.9.0: the autosave wrote whatever was on screen — a picture saved selected (the owner\'s Ideas note)',
    html: '<p>text</p><div class="shape-layer" contenteditable="false"><figure class="note-image sel" contenteditable="false"><img src="data:,"></figure></div>',
    gone: '.sel',
  },
  {
    when: 'up to 0.9.0: a divider saved "armed" for deletion',
    html: '<p>a</p><hr class="blk-hr armed"><p>b</p>',
    gone: '.armed',
  },
  {
    when: '0.8.3: the rotation readout saved inside the shape it labelled',
    html: '<div class="shape-layer" contenteditable="false"><div class="shape rect" data-kind="rect"><div class="shape-text" contenteditable="false">x</div><span class="shape-angle">285°</span><span class="shape-rot" title="Rotate"></span><span class="shape-h" title="Resize"></span></div></div><p>t</p>',
    gone: '.shape-angle',
  },
  {
    when: 'before 0.6.4: a shape\'s text saved editable, so the caret walked into it from the next line',
    html: '<div class="shape-layer" contenteditable="false"><div class="shape rect" data-kind="rect"><div class="shape-text" contenteditable="true">words</div><span class="shape-rot" title="Rotate"></span><span class="shape-h" title="Resize"></span></div></div><p>t</p>',
    gone: '.shape-text[contenteditable="true"]',
  },
  {
    when: 'before 0.6.9: a shape with no turning grip',
    html: '<div class="shape-layer" contenteditable="false"><div class="shape rect" data-kind="rect"><div class="shape-text" contenteditable="false">x</div><span class="shape-h"></span></div></div><p>t</p>',
    present: '.shape-rot',
  },
  {
    when: 'before 0.8.9: an empty canvas left after the last shape on it was deleted',
    html: '<div class="shape-layer shape-layer--behind" contenteditable="false"></div><p>only text</p>',
    gone: '.shape-layer',
  },
  {
    when: 'before 0.8.8: floating pictures on a layer of their own, painted above every shape',
    html: '<div class="shape-layer" contenteditable="false"><div class="shape rect" data-kind="rect"><div class="shape-text" contenteditable="false">s</div><span class="shape-rot" title="Rotate"></span><span class="shape-h" title="Resize"></span></div></div>'
      + '<div class="image-layer" contenteditable="false"><figure class="note-image" contenteditable="false"><img src="data:,"><figcaption class="image-caption">cap</figcaption></figure></div><p>t</p>',
    gone: '.image-layer',
  },
  {
    when: 'before 0.6.3: a selection dragged across paragraphs wrapped them in one inline span',
    html: '<span class="u-single"><p>one</p><p>two</p></span>',
    gone: 'span > p',
  },
  {
    when: 'anchors stamped on every block by an arrow drag, and copied onto new lines by Enter (the owner’s Ideas note: 37, no arrow)',
    html: '<p data-anchor="a-x1">one</p><p data-anchor="a-x1">two</p><h2 data-anchor="a-x2">three</h2>',
    gone: '[data-anchor]',
  },
  {
    when: 'a divider typed inside a list item, which later text "slipped into"',
    html: '<ul><li>item<hr class="blk-hr"></li></ul><p>after</p>',
    gone: 'li hr',
  },
];

describe('the residue museum: each exhibit comes out as this version writes it', () => {
  for (const exhibit of MUSEUM) {
    it(exhibit.when, () => {
      const first = healHtml(exhibit.html);
      expect(first.safe).toBe(true);
      expect(first.changed).toBe(true);
      const out = parse(first.html);
      if (exhibit.gone) expect(out.querySelector(exhibit.gone)).toBeNull();
      if (exhibit.present) expect(out.querySelector(exhibit.present)).not.toBeNull();
      // Nothing left to do the second time.
      const second = healHtml(first.html);
      expect(second.changed).toBe(false);
      expect(second.safe).toBe(true);
    });
  }

  it('the guide this version ships needs nothing on a second pass', () => {
    const once = healHtml(GUIDE_NOTE.content);
    expect(once.safe).toBe(true);
    expect(healHtml(once.html).changed).toBe(false);
  });
});

describe('the guard: a repair that would change a word is not a repair', () => {
  it('tells a changed word, picture or shape text apart from a markup change', () => {
    const a = fingerprint(parse('<p>one two</p><img src="data:,">'));
    expect(sameNote(a, fingerprint(parse('<p><span>one</span> two</p><img src="data:,">')))).toBe(true);
    expect(sameNote(a, fingerprint(parse('<p>one too</p><img src="data:,">')))).toBe(false);
    expect(sameNote(a, fingerprint(parse('<p>one two</p>')))).toBe(false);
  });

  it('ignores the app\'s own controls and paint', () => {
    const plain = fingerprint(parse('<div class="blk-code"><pre><code class="code-src">x = 1</code></pre></div>'));
    const painted = fingerprint(parse('<div class="blk-code"><div class="code-head"><select><option>JavaScript</option></select></div><pre><code class="code-src">x = 1</code></pre></div>'));
    expect(sameNote(plain, painted)).toBe(true);
  });
});

describe('healVault: the whole vault, once per version', () => {
  beforeEach(() => { localStorage.clear(); });

  const vault = () => {
    const store = new NoteStore({ allowSeed: false });
    const a = store.createNote('A');
    store.updateNote(a.id, { content: MUSEUM[0].html });
    const b = store.createNote('B');
    store.updateNote(b.id, { content: '<p>already fine</p>' });
    return { store, a, b };
  };

  it('repairs every note, stamps the version, and dates none of them', async () => {
    const { store, a, b } = vault();
    const dates = store.notes.map((n) => [n.id, n.updatedAt]);
    const order = store.sorted().map((n) => n.id);
    const backup = vi.fn(async () => ({ ok: true }));
    const result = await healVault(store, { backup });
    expect(backup).toHaveBeenCalledWith(`pre-heal-${MARKUP_VERSION}`);
    expect(result).toMatchObject({ healed: 1, unchanged: 1, refused: [] });
    expect(store.get(a.id).content).not.toContain('sel');
    expect(store.notes.every((n) => n.markupVersion === MARKUP_VERSION)).toBe(true);
    expect(store.notes.map((n) => [n.id, n.updatedAt])).toEqual(dates);
    expect(store.sorted().map((n) => n.id)).toEqual(order);
    expect(store.get(b.id).content).toBe('<p>already fine</p>');
    // Once done, a second start has nothing to do and makes no backup.
    backup.mockClear();
    expect(await healVault(store, { backup })).toMatchObject({ healed: 0, unchanged: 0 });
    expect(backup).not.toHaveBeenCalled();
  });

  it('writes nothing when the vault could not be put aside first', async () => {
    const { store, a } = vault();
    const before = store.get(a.id).content;
    const result = await healVault(store, { backup: async () => ({ ok: false }) });
    expect(result.aborted).toBe(true);
    expect(store.get(a.id).content).toBe(before);
    expect(store.notes.some((n) => n.markupVersion)).toBe(false);
  });

  it('never overwrites a note that was typed in while the repair was running', async () => {
    const { store, a } = vault();
    const idle = (fn) => { store.get(a.id).content = '<p>typed meanwhile</p>'; fn(); };
    await healVault(store, { idle });
    expect(store.get(a.id).content).toBe('<p>typed meanwhile</p>');
  });

  it('leaves a note it cannot repair safely exactly as it was, and reports it', async () => {
    const { store, a } = vault();
    const before = store.get(a.id).content;
    const result = await healVault(store, { heal: (html) => ({ html: html + '<p>extra</p>', changed: true, safe: false }) });
    expect(result.refused).toContain(a.id);
    expect(store.get(a.id).content).toBe(before);
  });

  it('leaves the open note to the editor, which already repaired it with layout', async () => {
    const { store, a } = vault();
    const before = store.get(a.id).content;
    await healVault(store, { skip: (n) => n.id === a.id });
    expect(store.get(a.id).content).toBe(before);
  });
});
