/**
 * What the app's own native dialogs say, in the app's language (hunt B26).
 * dialog-words.js follows src/js/i18n.js: the English text IS the key and the
 * columns are [Deutsch, Polski, Türkçe]. Every key must have all three, every
 * translation must carry the same placeholders as its English, and no {name}
 * may survive a full vars set in any language.
 */
import { describe, it, expect } from 'vitest';
import { WORDS, words } from '../electron/dialog-words.js';

const NAMES = /\{([a-z]+)\}/g;
const namesOf = (text) => [...String(text).matchAll(NAMES)].map((m) => m[1]).sort();
const FULL = { error: 'boom', file: 'a.bat', site: 'meet.example' };

describe('the words table', () => {
  it('has all three languages for every key, each a string with something to say', () => {
    expect(Object.keys(WORDS).length).toBeGreaterThan(20);
    for (const [en, columns] of Object.entries(WORDS)) {
      expect(columns, en).toHaveLength(3);
      for (const column of columns) expect(typeof column, en).toBe('string');
      expect([...columns].every((c) => c.length > 0), en).toBe(true);
    }
  });

  it('translates what it lists: a row that only copies the English is not a translation', () => {
    for (const [en, columns] of Object.entries(WORDS)) {
      expect(columns.some((c) => c !== en), `"${en}" repeats the English in every language`).toBe(true);
    }
  });

  it('gives every translation the same placeholders as its English', () => {
    for (const [en, columns] of Object.entries(WORDS)) {
      const enNames = namesOf(en);
      for (const column of columns) expect(namesOf(column), en).toEqual(enNames);
    }
  });
});

describe('words', () => {
  it('speaks the asked language', () => {
    expect(words('Cancel', 'de')).toBe('Abbrechen');
    expect(words('Cancel', 'pl')).toBe('Anuluj');
    expect(words('Cancel', 'tr')).toBe('Vazgeç');
    expect(words('Save a copy', 'pl')).toBe('Zapisz kopię');
  });

  it('keeps English when the key, the language or the word is unknown', () => {
    expect(words('A string nobody wrote', 'tr')).toBe('A string nobody wrote');
    expect(words('Cancel', 'fr')).toBe('Cancel');
    expect(words('Cancel')).toBe('Cancel');
  });

  it('fills every {name} in every language, and leaves no brace behind', () => {
    for (const en of Object.keys(WORDS)) {
      for (const lang of ['en', 'de', 'pl', 'tr']) {
        const out = words(en, lang, FULL);
        expect(out.match(NAMES), `${lang}: ${en}`).toBeNull();
        expect(out.includes('{'), `${lang}: ${en}`).toBe(false);
      }
    }
    expect(words('{file} can run code on this computer.', 'tr', FULL)).toBe('a.bat bu bilgisayarda kod çalıştırabilir.');
    expect(words('{error}\nThe window has stayed open so you can retry saving.', 'de', FULL)).toBe('boom\nDas Fenster ist offen geblieben, damit Sie das Speichern erneut versuchen können.');
  });

  it('an empty var fills with nothing rather than showing its name', () => {
    expect(words('{site} wants to show notifications', 'de', {})).toBe(' möchte Benachrichtigungen anzeigen');
  });
});
