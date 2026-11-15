/**
 * The design's font on every note (1.0.4, design-fonts.js): the button under
 * the designs takes the fonts off every note, and the card at the bottom right
 * puts them back — into the notes and their titles.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { withoutFonts, fontsOff, fontsBack, initDesignFonts } from '../src/js/design-fonts.js';
import { NoteStore } from '../src/js/notes.js';
import { STRINGS } from '../src/js/i18n.js';

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

const COURGETTE = '"Courgette", "Segoe Script", cursive';
const FONTED = `<p>one <span style="font-family: ${COURGETTE.replace(/"/g, '&quot;')};">two</span> three</p>`;

describe('a note’s markup without its fonts', () => {
  it('is the very string where there was no font', () => {
    for (const html of ['', '<p>plain</p>', '<p><span style="color: red;">red</span> and <b>bold</b></p>', '<p>the word font, written</p>']) {
      expect(withoutFonts(html)).toBe(html);
    }
    expect(withoutFonts(null)).toBe('');
  });

  it('takes the font off the words and the span with it when it says nothing else', () => {
    expect(withoutFonts(FONTED)).toBe('<p>one two three</p>');
    expect(withoutFonts('<p><span style="font-family: Arial, Helvetica, sans-serif;"><b>bold</b> and <i>slanted</i></span></p>'))
      .toBe('<p><b>bold</b> and <i>slanted</i></p>');
    expect(withoutFonts('<p><span data-font-family="Arial">old</span> <font face="Verdana">older</font></p>')).toBe('<p>old older</p>');
  });

  it('keeps the size, the colour and whatever else the words had', () => {
    const out = withoutFonts('<p><span style="font-family: Georgia, serif; font-size: 18px; color: rgb(200, 0, 0);">big red</span></p>');
    expect(out).not.toMatch(/font-family|Georgia/);
    expect(out).toMatch(/font-size: 18px/);
    expect(out).toMatch(/color: rgb\(200, 0, 0\)/);
    expect(out).toContain('>big red</span>');
    expect(withoutFonts('<p><span class="mark" style="font-family: Georgia, serif;">kept span</span></p>')).toBe('<p><span class="mark">kept span</span></p>');
    expect(withoutFonts('<h2 style="font-family: Verdana, Geneva, sans-serif;">A heading</h2>')).toBe('<h2>A heading</h2>');
    expect(withoutFonts('<p><font face="Verdana" color="#ff0000">red</font></p>')).toBe('<p><font color="#ff0000">red</font></p>');
  });

  it('takes a font inside a font, and leaves code in its own face', () => {
    expect(withoutFonts('<p><span style="font-family: Arial;">a <span style="font-family: Georgia;">b</span> c</span></p>')).toBe('<p>a b c</p>');
    const code = '<div class="blk-code"><span style="font-family: Consolas, monospace;">let x = 1;</span></div>';
    expect(withoutFonts(code)).toBe(code);
    expect(withoutFonts(`${code}${FONTED}`)).toBe(`${code}<p>one two three</p>`);
  });
});

describe('what the button writes, and what the card puts back', () => {
  const note = (id, extra = {}) => ({ id, title: id, content: FONTED, updatedAt: 100, ...extra });

  it('writes every note that has a font, in its words or as its writing font, and keeps its size', () => {
    const notes = [
      note('words'),
      note('writing', { content: '<p>plain</p>', font: { family: COURGETTE, size: 18 } }),
      note('both', { font: { family: COURGETTE } }),
      note('none', { content: '<p>plain</p>' }),
      note('size only', { content: '<p>plain</p>', font: { size: 20 } }),
      note('archived', { archivedAt: 5 }),
    ];
    const { writes, had } = fontsOff(notes);
    expect(writes).toEqual([
      { id: 'words', content: '<p>one two three</p>', font: undefined },
      { id: 'writing', content: '<p>plain</p>', font: { size: 18 } },
      { id: 'both', content: '<p>one two three</p>', font: undefined },
      { id: 'archived', content: '<p>one two three</p>', font: undefined },
    ]);
    expect([...had.keys()]).toEqual(['words', 'writing', 'both', 'archived']);
    expect(had.get('writing')).toEqual({ content: '<p>plain</p>', font: { family: COURGETTE, size: 18 }, updatedAt: 100 });
    expect(had.get('words')).toEqual({ content: FONTED, font: undefined, updatedAt: 100 });
  });

  it('leaves the trash, the black holes and the notes set to only view alone', () => {
    const { writes } = fontsOff([note('trash', { deletedAt: 9 }), note('hole', { hole: 'h1' }), note('view', { readOnly: true }), null]);
    expect(writes).toEqual([]);
  });

  it('puts the fonts back only into a note that is still there and was not edited since', () => {
    const had = new Map([
      ['same', { content: FONTED, font: { family: COURGETTE }, updatedAt: 100 }],
      ['edited', { content: FONTED, font: undefined, updatedAt: 100 }],
      ['gone', { content: FONTED, font: undefined, updatedAt: 100 }],
      ['trashed', { content: FONTED, font: undefined, updatedAt: 100 }],
    ]);
    const now = {
      same: note('same', { content: '<p>one two three</p>' }),
      edited: note('edited', { content: '<p>one two three four</p>', updatedAt: 200 }),
      trashed: note('trashed', { content: '<p>one two three</p>', deletedAt: 150 }),
    };
    expect(fontsBack(had, (id) => now[id])).toEqual({ writes: [{ id: 'same', content: FONTED, font: { family: COURGETTE } }], edited: 1 });
    expect(fontsBack(new Map(), () => null)).toEqual({ writes: [], edited: 0 });
  });
});

describe('the store, many notes’ fonts at once', () => {
  it('writes the markup and the writing font, and no note’s date', () => {
    const store = new NoteStore({ allowSeed: false });
    const a = store.createNote('a');
    const b = store.createNote('b');
    store.updateNote(a.id, { content: FONTED });
    store.setFont(a.id, { family: COURGETTE, size: 18 });
    store.updateNote(b.id, { content: FONTED });
    const dates = [store.get(a.id).updatedAt, store.get(b.id).updatedAt];
    const { writes, had } = fontsOff(store.notes);
    expect(store.setFontsMany(writes)).toBe(2);
    expect(store.get(a.id)).toMatchObject({ content: '<p>one two three</p>', font: { size: 18 } });
    expect(store.get(b.id).content).toBe('<p>one two three</p>');
    expect('font' in store.get(b.id)).toBe(false);
    expect([store.get(a.id).updatedAt, store.get(b.id).updatedAt]).toEqual(dates);
    // Written to the vault, not only held.
    expect(new NoteStore({ allowSeed: false }).get(a.id).content).toBe('<p>one two three</p>');
    // And back.
    expect(store.setFontsMany(fontsBack(had, (id) => store.get(id)).writes)).toBe(2);
    expect(store.get(a.id)).toMatchObject({ content: FONTED, font: { family: COURGETTE, size: 18 } });
    expect(store.get(b.id).content).toBe(FONTED);
    expect(store.setFontsMany([{ id: 'nobody', content: 'x' }, { id: a.id }])).toBe(0);
    expect(store.setFontsMany()).toBe(0);
  });
});

describe('the button and its card', () => {
  const setUp = () => {
    const store = new NoteStore({ allowSeed: false });
    const a = store.createNote('a');
    const b = store.createNote('b');
    store.updateNote(a.id, { content: FONTED });
    store.setFont(a.id, { family: COURGETTE });
    store.updateNote(b.id, { content: FONTED });
    const said = [];
    const reopen = vi.fn();
    const saveNow = vi.fn(async () => {});
    const fonts = initDesignFonts({ store, saveNow, reopen, say: (words) => said.push(words) });
    return { store, a, b, said, reopen, saveNow, fonts };
  };
  const card = () => document.getElementById('fonts-back');

  it('takes the fonts off, shows the card at the bottom right, and puts them back from it', async () => {
    const { store, a, b, said, reopen, saveNow, fonts } = setUp();
    expect(await fonts.apply()).toBe(2);
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(store.get(a.id).content).toBe('<p>one two three</p>');
    expect(store.get(a.id).font).toBeUndefined();
    expect(card().hidden).toBe(false);
    expect(card().className).toBe('update-card fonts-back');
    expect(fonts.pending).toBe(2);

    card().querySelector('[data-fonts="back"]').click();
    await vi.waitFor(() => expect(card().hidden).toBe(true));
    expect(store.get(a.id)).toMatchObject({ content: FONTED, font: { family: COURGETTE } });
    expect(store.get(b.id).content).toBe(FONTED);
    expect(reopen).toHaveBeenCalledTimes(2);
    expect(said).toEqual(['The fonts are back as they were']);
    expect(fonts.pending).toBe(0);
  });

  it('says so where no note had a font, and shows no card', async () => {
    const store = new NoteStore({ allowSeed: false });
    store.createNote('plain');
    const said = [];
    const fonts = initDesignFonts({ store, saveNow: async () => {}, reopen: () => {}, say: (words) => said.push(words) });
    expect(await fonts.apply()).toBe(0);
    expect(said).toEqual(['No note had a font of its own']);
    expect(card()).toBeNull();
  });

  it('closed, the card keeps nothing: the fonts stay off', async () => {
    const { store, a, fonts } = setUp();
    await fonts.apply();
    card().querySelector('[data-fonts="keep"]').click();
    expect(card().hidden).toBe(true);
    expect(fonts.pending).toBe(0);
    await fonts.back();
    expect(store.get(a.id).content).toBe('<p>one two three</p>');
  });

  it('leaves a note edited since as it is now, and says so', async () => {
    const { store, a, b, said, fonts } = setUp();
    await fonts.apply();
    await new Promise((r) => setTimeout(r, 3));
    store.updateNote(a.id, { content: '<p>one two three four</p>' });
    await fonts.back();
    expect(store.get(a.id).content).toBe('<p>one two three four</p>');
    expect(store.get(b.id).content).toBe(FONTED);
    expect(said).toEqual(['The fonts are back, except in the notes changed since']);
  });

  // "Deleted notes stay deleted": nothing of a note deleted for good is held, and nothing brings it back.
  it('forgets a note the moment it is deleted for good', async () => {
    const { store, a, b, fonts } = setUp();
    await fonts.apply();
    store.destroy(a.id);
    expect(fonts.pending).toBe(1);
    await fonts.back();
    expect(store.get(a.id)).toBeFalsy();
    expect(store.notes.map((n) => n.id)).toEqual([b.id]);
    expect(store.get(b.id).content).toBe(FONTED);
  });

  it('pressed twice, still puts back what the notes had first', async () => {
    const { store, a, fonts } = setUp();
    await fonts.apply();
    store.setFont(a.id, { family: 'Arial, Helvetica, sans-serif' });   // a font picked after: no edit
    expect(await fonts.apply()).toBe(1);
    expect(fonts.pending).toBe(2);
    await fonts.back();
    expect(store.get(a.id)).toMatchObject({ content: FONTED, font: { family: COURGETTE } });
  });

  // The Serif is a font like any other, so Settings has no row for "none": the button gives new notes the
  // design's face as well, and the card gives them their font again.
  describe('and the font of new notes', () => {
    const withNew = (start) => {
      const store = new NoteStore({ allowSeed: false });
      let chosen = start;
      const said = [];
      const newFont = { get: () => chosen, set: (font) => { chosen = font; } };
      const fonts = initDesignFonts({ store, saveNow: async () => {}, reopen: () => {}, say: (words) => said.push(words), newFont });
      return { store, fonts, said, newFont };
    };

    it('goes with the notes’ fonts and comes back with them, where no note had a font too', async () => {
      const { fonts, said, newFont } = withNew(COURGETTE);
      expect(await fonts.apply()).toBe(0);
      expect(newFont.get()).toBe(null);
      expect(said).toEqual([]);
      expect(card().hidden).toBe(false);
      await fonts.back();
      expect(newFont.get()).toBe(COURGETTE);
      expect(said).toEqual(['The fonts are back as they were']);
      expect(card().hidden).toBe(true);
    });

    it('stays off when the card is closed, and one chosen since is left as chosen', async () => {
      const closed = withNew(COURGETTE);
      await closed.fonts.apply();
      card().querySelector('[data-fonts="keep"]').click();
      await closed.fonts.back();
      expect(closed.newFont.get()).toBe(null);

      const since = withNew(COURGETTE);
      await since.fonts.apply();
      since.newFont.set('Arial, Helvetica, sans-serif');
      await since.fonts.back();
      expect(since.newFont.get()).toBe('Arial, Helvetica, sans-serif');
      expect(since.said).toEqual([]);
    });

    it('is left alone where none was chosen', async () => {
      const { fonts, said, newFont } = withNew(null);
      const set = vi.spyOn(newFont, 'set');
      expect(await fonts.apply()).toBe(0);
      expect(said).toEqual(['No note had a font of its own']);
      expect(set).not.toHaveBeenCalled();
    });
  });
});

describe('where it is wired, and its words', () => {
  const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

  it('stands at the foot of the Design group in Settings, and main.js gives it the store', () => {
    const panel = read('src/js/settings-panel.js');
    expect(panel.indexOf("all.id = 'design-fonts-all';")).toBeGreaterThan(panel.indexOf('initDesign(designRow);'));
    expect(panel.indexOf("all.id = 'design-fonts-all';")).toBeLessThan(panel.indexOf("group('Theme organizer', 'look')"));
    const main = read('src/js/main.js');
    expect(main).toContain('fontsOnAll: () => designFonts.apply(),');
    expect(main).toContain('newFont: { get: () => readSettings().font, set: (font) => { writeSettings({ font }); } },');
    expect(main).toContain('reopen: () => { if (store.activeId) openNote(store.activeId); else renderList(); },');
    // Over Settings, where it was asked from.
    expect(read('src/css/app.css')).toMatch(/\.fonts-back \{ z-index: 110; \}/);
  });

  it('is said in every language', () => {
    const source = read('src/js/design-fonts.js') + read('src/js/settings-panel.js');
    for (const words of [
      'Put the design’s font on every note',
      'The fonts chosen in your notes and for their titles are taken off, and the font of new notes with them, so every note is written in the design’s face and follows the next design too. Right after, a card at the bottom right puts them back. Notes in the trash, in a black hole or set to only view are left alone.',
      'Every note is in the design’s font now. If you like, the fonts can go back to what they were.',
      'Put the fonts back', 'Close',
      'No note had a font of its own', 'The fonts are back as they were', 'The fonts are back, except in the notes changed since',
    ]) {
      expect(source, words).toContain(`'${words}'`);
      expect(STRINGS[words], words).toHaveLength(3);
      for (const said of STRINGS[words]) {
        expect(said).toBeTruthy();
        expect(said, words).not.toMatch(/Nebul(i|ę|ą|as|y)\b/);   // the name is never declined
      }
    }
  });
});
