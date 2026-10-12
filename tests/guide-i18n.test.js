/**
 * The guide in the language of the app (0.9.4).
 *
 * A reader, on the first translated release: "it would be better if, when you
 * switch to Deutsch, the whole welcome page and its information switched too".
 * A translation is used only when it is whole, so this fails the moment the
 * English guide gains or loses a block and a translation has not followed
 * (`node scripts/guide-blocks.js` lists the blocks, `--signatures` the
 * signatures GUIDE_SIGNATURES must hold).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GUIDE_NOTE, GUIDE_VERSION, GUIDE_SIGNATURES, guideSignature, guideUnedited, guideFor, isGuideTitle, syncGuideLanguage, addGuide } from '../src/js/seed-notes.js';
import { GUIDE_LANGS, guideBlocks, guideIn, guideTitles } from '../src/js/guide-i18n.js';
import { NoteStore } from '../src/js/notes.js';
import { RELEASE_NOTES, RELEASE_NOTES_I18N, notesFor, notesIn } from '../src/js/release-notes.js';
import { STRINGS } from '../src/js/i18n.js';

const parse = (html) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
const english = guideBlocks(GUIDE_NOTE.content);

describe('each translation of the guide', () => {
  for (const [lang, pack] of Object.entries(GUIDE_LANGS)) {
    it(`${lang}: one entry for every block, each the same kind of block with the same markup`, () => {
      expect(pack.blocks.length).toBe(english.length);
      const holder = document.createElement('div');
      english.forEach((html, i) => {
        if (pack.blocks[i] === null) return;
        holder.innerHTML = html;
        const want = holder.firstElementChild;
        const tags = (el) => [...el.querySelectorAll('*')].map((x) => `${x.tagName}.${x.className}`).join(' ');
        const wantTag = want.tagName;
        const wantTags = tags(want);
        const wantClass = want.className;
        const wantInd = want.dataset.ind;
        holder.innerHTML = pack.blocks[i];
        expect(holder.children.length, `${lang} block ${i}`).toBe(1);
        const got = holder.firstElementChild;
        expect(got.tagName, `${lang} block ${i}`).toBe(wantTag);
        expect(got.className, `${lang} block ${i}`).toBe(wantClass);
        expect(got.dataset.ind, `${lang} block ${i}`).toBe(wantInd);
        // The same elements inside, in the same order: every button name still
        // bold, every command still code, every list item still an item.
        expect(tags(got), `${lang} block ${i}`).toBe(wantTags);
        expect(got.textContent.trim().length, `${lang} block ${i}`).toBeGreaterThan(0);
      });
    });

    it(`${lang}: the page is translated, title and shapes too, and its signature is on record`, () => {
      const guide = guideFor(lang);
      expect(guide.title).toBe(pack.title);
      expect(guide.title).not.toBe(GUIDE_NOTE.title);
      expect(guide.readOnly).toBe(true);
      const body = parse(guide.content);
      expect([...body.querySelectorAll('.shape-text')].map((el) => el.textContent)).toEqual(pack.shapes);
      // What is not words is the English guide's own: the code samples, the stage, the dividers.
      const en = parse(GUIDE_NOTE.content);
      expect(body.querySelectorAll('.blk-code').length).toBe(en.querySelectorAll('.blk-code').length);
      expect(body.querySelectorAll('hr.blk-hr').length).toBe(en.querySelectorAll('hr.blk-hr').length);
      expect(body.querySelector('.guide-stage')).not.toBeNull();
      expect(body.querySelector('h1').textContent).not.toBe('Welcome to Nebula');
      expect(GUIDE_SIGNATURES[`${GUIDE_VERSION} ${lang}`]).toBe(guideSignature(guide.content));
      expect(guideUnedited(guide.content)).toBe(true);
    });
  }

  it('is not used at all when it is a block short — the page stays English, never half of each', () => {
    const short = { ...GUIDE_LANGS.de, blocks: GUIDE_LANGS.de.blocks.slice(1) };
    const real = GUIDE_LANGS.de;
    GUIDE_LANGS.de = short;
    try { expect(guideIn(GUIDE_NOTE, 'de')).toBe(GUIDE_NOTE); } finally { GUIDE_LANGS.de = real; }
    expect(guideIn(GUIDE_NOTE, 'xx')).toBe(GUIDE_NOTE);
    expect(guideFor('en')).toBe(GUIDE_NOTE);
  });

  it('knows the guide by its title in every language', () => {
    // Four languages, and the Polish title of the builds that declined the name.
    expect(guideTitles(GUIDE_NOTE)).toHaveLength(5);
    for (const title of guideTitles(GUIDE_NOTE)) expect(isGuideTitle(title)).toBe(true);
    expect(isGuideTitle('My notes')).toBe(false);
  });

  // The owner, on the nineteenth test build: "Witaj w Nebuli should be Witaj w
  // Nebula, and do not change the Nebula name".
  it('never declines the name of the app, in any language', () => {
    const words = (text) => String(text).match(/Nebul\p{L}*/gu) ?? [];
    const texts = [];
    for (const pack of Object.values(GUIDE_LANGS)) texts.push(pack.title, ...pack.shapes, ...pack.blocks.filter(Boolean));
    for (const langs of Object.values(RELEASE_NOTES_I18N)) for (const sheet of Object.values(langs)) texts.push(sheet.headline, ...sheet.items.flatMap((item) => [item.title, item.text]));
    texts.push(JSON.stringify(STRINGS));
    const declined = texts.flatMap(words).filter((word) => word !== 'Nebula');
    expect(declined).toEqual([]);
    expect(GUIDE_LANGS.pl.title).toBe('Witaj w Nebula – przewodnik');
  });

  it('still knows a guide under the Polish title that declined it, and gives it this one', () => {
    const store = new NoteStore({ allowSeed: true });
    const guide = store.notes[0];
    store.setGuide(guide.id, { title: 'Witaj w Nebuli – przewodnik', content: guideFor('pl').content });
    expect(isGuideTitle(store.get(guide.id).title)).toBe(true);
    expect(syncGuideLanguage(store, 'pl')).toEqual([guide.id]);
    expect(store.get(guide.id).title).toBe('Witaj w Nebula – przewodnik');
    expect(store.notes.filter((n) => isGuideTitle(n.title))).toHaveLength(1);
  });
});

describe('the vault’s guide follows the language', () => {
  beforeEach(() => { localStorage.clear(); });

  it('switches a guide nobody wrote in, title and page, and back again — without dating it', () => {
    const store = new NoteStore({ allowSeed: true });
    const guide = store.notes[0];
    const stamp = guide.updatedAt;
    expect(syncGuideLanguage(store, 'de')).toEqual([guide.id]);
    expect(guide.title).toBe(GUIDE_LANGS.de.title);
    expect(parse(guide.content).querySelector('h1').textContent).toBe('Willkommen bei Nebula');
    expect(guide.updatedAt).toBe(stamp);
    expect(guide.readOnly).toBe(true);
    // Asked again, there is nothing to do.
    expect(syncGuideLanguage(store, 'de')).toEqual([]);
    expect(syncGuideLanguage(store, 'tr')).toEqual([guide.id]);
    expect(guide.title).toBe(GUIDE_LANGS.tr.title);
    expect(syncGuideLanguage(store, 'en')).toEqual([guide.id]);
    expect(guide.title).toBe(GUIDE_NOTE.title);
    expect(guideSignature(guide.content)).toBe(guideSignature(GUIDE_NOTE.content));
  });

  it('leaves a guide somebody wrote in exactly as it is, and every other note', () => {
    const store = new NoteStore({ allowSeed: true });
    const guide = store.notes[0];
    store.updateNote(guide.id, { content: guide.content.replace('<h1>Welcome to Nebula</h1>', '<h1>Welcome to Nebula</h1><p>my own line</p>') });
    const mine = store.createNote('Willkommen bei Nebula – Anleitung');
    store.updateNote(mine.id, { content: '<p>a note of mine that happens to have that title</p>' });
    const before = store.notes.map((n) => n.content);
    expect(syncGuideLanguage(store, 'de')).toEqual([]);
    expect(store.notes.map((n) => n.content)).toEqual(before);
  });

  it('Help → Guide page gives the guide in the language of the app, once', () => {
    const store = new NoteStore({ allowSeed: false });
    const id = addGuide(store, 'pl');
    expect(store.get(id).title).toBe(GUIDE_LANGS.pl.title);
    expect(addGuide(store, 'pl')).toBe(id);
    expect(store.notes.filter((n) => isGuideTitle(n.title))).toHaveLength(1);
  });
});

describe('What’s new in the language of the app', () => {
  it('has every translated sheet item for item with the English one', () => {
    for (const [version, langs] of Object.entries(RELEASE_NOTES_I18N)) {
      expect(RELEASE_NOTES[version], version).toBeTruthy();
      for (const [lang, local] of Object.entries(langs)) {
        expect(local.headline, `${version} ${lang}`).toBeTruthy();
        expect(local.items.length, `${version} ${lang}`).toBe(RELEASE_NOTES[version].items.length);
        for (const item of local.items) {
          expect(item.title, `${version} ${lang}`).toBeTruthy();
          expect(item.text, `${version} ${lang}`).toBeTruthy();
        }
      }
    }
  });

  it('shows the translation when there is one, the English otherwise', () => {
    const version = Object.keys(RELEASE_NOTES_I18N)[0];
    const entry = notesFor(version);
    expect(notesIn(entry, 'de').headline).toBe(RELEASE_NOTES_I18N[version].de.headline);
    expect(notesIn(entry, 'de').version).toBe(version);
    expect(notesIn(entry, 'en')).toBe(entry);
    expect(notesIn(entry, 'xx')).toBe(entry);
    const older = notesFor('0.9.3');
    expect(notesIn(older, 'de')).toBe(older);
    // A translation that fell behind the English sheet is not shown.
    expect(notesIn(entry, 'de', { [version]: { de: { headline: 'x', items: [] } } })).toBe(entry);
  });
});
