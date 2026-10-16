/**
 * What the app's own native dialogs say, in the app's language (owner, 2026-10-16
 * consultation, item 3; hunt B26).
 *
 * The same shape as src/js/i18n.js: the English text IS the key, and the columns
 * are [Deutsch, Polski, Türkçe]. Wording is reused wherever i18n.js already has
 * the word (Cancel, Save a copy, Attach files, Export as PDF, Import a note…);
 * these sentences are new text, translated for this table. A word nobody
 * translated stays English, a filter that is a name (PDF, HTML, Markdown, Rich
 * Text, Nebula note) is not listed at all. Only the WORDS move: the buttons'
 * order and the default and cancel answers stay exactly as they are, and the
 * dialog's own chrome (its window, its scrolling list) stays the operating
 * system's.
 */

/** English -> [Deutsch, Polski, Türkçe] */
export const WORDS = {
  // The save that failed: the window stayed open so it can be retried
  'Your latest changes could not be saved.': [
    'Ihre letzten Änderungen konnten nicht gespeichert werden.',
    'Nie udało się zapisać ostatnich zmian.',
    'Son değişiklikleriniz kaydedilemedi.',
  ],
  '{error}\nThe window has stayed open so you can retry saving.': [
    '{error}\nDas Fenster ist offen geblieben, damit Sie das Speichern erneut versuchen können.',
    '{error}\nOkno pozostało otwarte, aby można było spróbować zapisać ponownie.',
    '{error}\nPencere açık kaldı; kaydetmeyi yeniden deneyebilirsiniz.',
  ],
  'Keep editing': ['Weiter bearbeiten', 'Edytuj dalej', 'Düzenlemeyi sürdür'],

  // Titles of the save and open dialogs
  'Export note': ['Notiz exportieren', 'Eksportuj notatkę', 'Notu dışa aktar'],
  'Export as PDF': ['Als PDF exportieren', 'Eksportuj jako PDF', 'PDF olarak dışa aktar'],
  'Import a note': ['Notiz importieren', 'Importuj notatkę', 'Not içe aktar'],
  'Add a video': ['Video hinzufügen', 'Dodaj wideo', 'Video ekle'],
  'Attach files': ['Dateien anhängen', 'Dołącz pliki', 'Dosya ekle'],
  'Save a copy': ['Kopie speichern', 'Zapisz kopię', 'Kopyasını kaydet'],

  // Names of the save and open filters
  'Word document': ['Word-Dokument', 'Dokument Word', 'Word belgesi'],
  'OpenDocument text': ['OpenDocument-Text', 'Tekst OpenDocument', 'OpenDocument metni'],
  'Word 97–2003 document': ['Word 97–2003-Dokument', 'Dokument Word 97–2003', 'Word 97–2003 belgesi'],
  'Evernote export': ['Evernote-Export', 'Eksport Evernote', 'Evernote dışa aktarımı'],
  'Notes': ['Notizen', 'Notatki', 'Notlar'],
  'All files': ['Alle Dateien', 'Wszystkie pliki', 'Tüm dosyalar'],
  'Video': ['Video', 'Wideo', 'Video'],

  // A file that can run code (hunt B12): asked before it is opened
  'Cancel': ['Abbrechen', 'Anuluj', 'Vazgeç'],
  'Open anyway': ['Trotzdem öffnen', 'Otwórz mimo to', 'Yine de aç'],
  '{file} can run code on this computer.': [
    '{file} kann Code auf diesem Computer ausführen.',
    'Plik {file} może uruchamiać kod na tym komputerze.',
    '{file} bu bilgisayarda kod çalıştırabilir.',
  ],
  'What it runs can reach everything you can. Open it only if you trust where this note came from. Save a copy keeps it without running it.': [
    'Was es ausführt, kann alles erreichen, was Sie auch erreichen können. Öffnen Sie es nur, wenn Sie vertrauen, woher diese Notiz kommt. Eine Kopie speichern bewahrt es auf, ohne es auszuführen.',
    'To, co uruchamia, ma dostęp do wszystkiego, do czego masz Ty. Otwórz go tylko, jeśli ufasz, skąd pochodzi ta notatka. Zapisanie kopii zachowa go bez uruchamiania.',
    'Çalıştırdığı kod, sizin erişebildiğiniz her şeye erişebilir. Bu notun nereden geldiğine güveniyorsanız açın. Bir kopya kaydetmek, onu çalıştırmadan saklar.',
  ],

  // A page embedded in a note asks (hunt B25): nothing is remembered
  '{site} wants to use your microphone': [
    '{site} möchte Ihr Mikrofon verwenden',
    '{site} chce korzystać z Twojego mikrofonu',
    '{site} mikrofonunuzu kullanmak istiyor',
  ],
  '{site} wants to use your camera': [
    '{site} möchte Ihre Kamera verwenden',
    '{site} chce korzystać z Twojej kamery',
    '{site} kameranızı kullanmak istiyor',
  ],
  '{site} wants to use your microphone and camera': [
    '{site} möchte Ihr Mikrofon und Ihre Kamera verwenden',
    '{site} chce korzystać z Twojego mikrofonu i kamery',
    '{site} mikrofonunuzu ve kameranızı kullanmak istiyor',
  ],
  '{site} wants to show notifications': [
    '{site} möchte Benachrichtigungen anzeigen',
    '{site} chce pokazywać powiadomienia',
    '{site} bildirim göstermek istiyor',
  ],
  'A page in this note wants to use your microphone': [
    'Eine in diese Notiz eingebettete Seite möchte Ihr Mikrofon verwenden',
    'Osadzona w tej notatce strona chce korzystać z Twojego mikrofonu',
    'Bu not içine gömülü bir sayfa mikrofonunuzu kullanmak istiyor',
  ],
  'A page in this note wants to use your camera': [
    'Eine in diese Notiz eingebettete Seite möchte Ihre Kamera verwenden',
    'Osadzona w tej notatce strona chce korzystać z Twojej kamery',
    'Bu not içine gömülü bir sayfa kameranızı kullanmak istiyor',
  ],
  'A page in this note wants to use your microphone and camera': [
    'Eine in diese Notiz eingebettete Seite möchte Ihr Mikrofon und Ihre Kamera verwenden',
    'Osadzona w tej notatce strona chce korzystać z Twojego mikrofonu i kamery',
    'Bu not içine gömülü bir sayfa mikrofonunuzu ve kameranızı kullanmak istiyor',
  ],
  'A page in this note wants to show notifications': [
    'Eine in diese Notiz eingebettete Seite möchte Benachrichtigungen anzeigen',
    'Osadzona w tej notatce strona chce pokazywać powiadomienia',
    'Bu not içine gömülü bir sayfa bildirim göstermek istiyor',
  ],
  'A page embedded in this note is asking. Nothing is remembered: the next time this page opens, it asks again.': [
    'Eine in diese Notiz eingebettete Seite fragt nach. Nichts wird gemerkt: Wenn diese Seite wieder geöffnet wird, fragt sie erneut.',
    'Strona osadzona w tej notatce prosi o dostęp. Nic nie jest zapamiętywane: gdy ta strona zostanie ponownie otwarta, zapyta znów.',
    'Bu nota gömülü bir sayfa izin istiyor. Hiçbir şey hatırlanmaz: bu sayfa bir daha açıldığında yeniden sorar.',
  ],
  "Don't allow": ['Nicht erlauben', 'Nie zezwalaj', 'İzin verme'],
  'Allow': ['Erlauben', 'Zezwalaj', 'İzin ver'],
};

/** As i18n.js keeps its columns: de, pl, tr. */
const COLUMN = { de: 0, pl: 1, tr: 2 };

/**
 * The English words a native dialog shows, in the asked language.
 *
 * @param {string} en the English text — also the key of WORDS
 * @param {string} [lang] the app's language ('en' when the window is gone)
 * @param {Record<string, string>} [vars] what fills each {name}
 * @returns {string} the translated text with every {name} filled, or the English
 * itself when nobody translated it or the language is unknown
 */
export function words(en, lang, vars) {
  const at = COLUMN[lang];
  const out = at === undefined ? en : (WORDS[en]?.[at] ?? en);
  return vars ? out.replace(/\{([a-z]+)\}/g, (_, name) => String(vars[name] ?? '')) : out;
}
