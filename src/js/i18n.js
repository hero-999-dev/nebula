/**
 * The app in four languages: English, Deutsch, Polski, Türkçe (0.9.3).
 *
 * The English text IS the key. Every word of the interface is still written
 * in English where it is used, and this module puts the chosen language over
 * it as it reaches the page: once for what is there, and through a
 * MutationObserver for everything drawn later (a menu, a toast, a label the
 * note menu rewrites each time it opens). So a module never has to know a
 * language exists, and a string nobody translated simply stays English.
 *
 * What is never translated: the note itself (#editor — its markup is the note,
 * and a word changed there would be saved into it), the title, note names in
 * the list, label names, and the AI panel's pages. Placeholders drawn inside
 * the note by CSS come from custom properties set here instead (--t-caption).
 *
 * Strings with something in them (a version, a count) are patterns.
 */

import { emit } from './bus.js';

const KEY = 'nebula:lang';

/** [code, the language's own name] — the picker shows each in itself. */
export const LANGUAGES = [
  ['en', 'English'],
  ['de', 'Deutsch'],
  ['pl', 'Polski'],
  ['tr', 'Türkçe'],
];
const CODES = LANGUAGES.map(([code]) => code);
const COLUMN = { de: 0, pl: 1, tr: 2 };

/** English -> [Deutsch, Polski, Türkçe] */
export const STRINGS = {
  // The note list and its foot
  'Hide the note list': ['Notizliste ausblenden', 'Ukryj listę notatek', 'Not listesini gizle'],
  'Show the note list': ['Notizliste einblenden', 'Pokaż listę notatek', 'Not listesini göster'],
  'Filter notes…': ['Notizen filtern…', 'Filtruj notatki…', 'Notları filtrele…'],
  'Filter notes': ['Notizen filtern', 'Filtruj notatki', 'Notları filtrele'],
  'Notes': ['Notizen', 'Notatki', 'Notlar'],
  'Archive': ['Archiv', 'Archiwum', 'Arşiv'],
  'Trash': ['Papierkorb', 'Kosz', 'Çöp kutusu'],
  'New note': ['Neue Notiz', 'Nowa notatka', 'Yeni not'],
  'Theme': ['Design', 'Motyw', 'Tema'],
  'Main': ['Haupt', 'Główny', 'Ana'],
  'Dark': ['Dunkel', 'Ciemny', 'Koyu'],
  'Light': ['Hell', 'Jasny', 'Açık'],
  'White': ['Weiß', 'Biały', 'Beyaz'],
  'Main — violet': ['Haupt — Violett', 'Główny — fiolet', 'Ana — mor'],
  'White — how the note looks on A4': ['Weiß — so sieht die Notiz auf A4 aus', 'Biały — tak notatka wygląda na A4', 'Beyaz — notun A4 kâğıttaki görünümü'],
  'Language': ['Sprache', 'Język', 'Dil'],
  'Choose the language': ['Sprache wählen', 'Wybierz język', 'Dili seç'],
  'Check for updates': ['Nach Updates suchen', 'Sprawdź aktualizacje', 'Güncellemeleri denetle'],
  'Pinned': ['Angeheftet', 'Przypięta', 'Sabitlendi'],
  'No notes match': ['Keine Notiz passt', 'Żadna notatka nie pasuje', 'Eşleşen not yok'],
  'No notes yet': ['Noch keine Notizen', 'Nie ma jeszcze notatek', 'Henüz not yok'],
  'Empty': ['Leer', 'Pusta', 'Boş'],
  'now': ['jetzt', 'teraz', 'şimdi'],
  'All labels': ['Alle Labels', 'Wszystkie etykiety', 'Tüm etiketler'],
  'Filter by label': ['Nach Label filtern', 'Filtruj według etykiety', 'Etikete göre filtrele'],
  'Clear the label filter': ['Label-Filter aufheben', 'Wyczyść filtr etykiet', 'Etiket filtresini kaldır'],
  'Find a label': ['Label suchen', 'Znajdź etykietę', 'Etiket ara'],
  'Label actions': ['Label-Aktionen', 'Działania etykiety', 'Etiket işlemleri'],
  'Delete label': ['Label löschen', 'Usuń etykietę', 'Etiketi sil'],
  'In the text': ['Im Text', 'W tekście', 'Metinde'],
  'No labels yet': ['Noch keine Labels', 'Nie ma jeszcze etykiet', 'Henüz etiket yok'],
  'No label matches': ['Kein Label passt', 'Żadna etykieta nie pasuje', 'Eşleşen etiket yok'],
  'Crop': ['Zuschneiden', 'Przytnij', 'Kırp'],
  'Crop the picture': ['Bild zuschneiden', 'Przytnij obraz', 'Resmi kırp'],
  'Drag the edges, then Enter to crop or Esc to cancel': ['Ränder ziehen, dann Enter zum Zuschneiden oder Esc zum Abbrechen', 'Przeciągnij krawędzie, potem Enter, aby przyciąć, lub Esc, aby anulować', 'Kenarları sürükleyin; kırpmak için Enter, vazgeçmek için Esc'],
  'Drag to resize the embed': ['Ziehen, um die Einbettung zu vergrößern oder zu verkleinern', 'Przeciągnij, aby zmienić rozmiar osadzenia', 'Gömülü içeriği boyutlandırmak için sürükleyin'],
  // The note menu, archive and trash
  'Edit labels': ['Labels bearbeiten', 'Edytuj etykiety', 'Etiketleri düzenle'],
  'Move to trash': ['In den Papierkorb', 'Przenieś do kosza', 'Çöp kutusuna taşı'],
  // Folders in the note list (0.9.3)
  // The page width beside Saved (0.9.3)
  'Actual size': ['Originalgröße', 'Rzeczywisty rozmiar', 'Gerçek boyut'],
  'Page zoom': ['Seitenzoom', 'Powiększenie strony', 'Sayfa yakınlaştırma'],
  'Fit to page': ['An Seite anpassen', 'Dopasuj do strony', 'Sayfaya sığdır'],
  'Fit': ['Anpassen', 'Dopasuj', 'Sığdır'],
  // Auto order page (0.9.3)
  'Auto order page': ['Seite automatisch ordnen', 'Automatyczny układ strony', 'Sayfayı otomatik düzenle'],
  'Auto order page — move what a page line falls across to the next page': ['Seite automatisch ordnen — was eine Seitenlinie schneidet, auf die nächste Seite', 'Automatyczny układ strony — to, co przecina linia strony, na następną stronę', 'Sayfayı otomatik düzenle — sayfa çizgisine denk geleni sonraki sayfaya taşı'],
  'Auto order page: not active': ['Seite automatisch ordnen: nicht aktiv', 'Automatyczny układ strony: nieaktywny', 'Otomatik sayfa düzeni: aktif değil'],
  'Auto order page: active': ['Seite automatisch ordnen: aktiv', 'Automatyczny układ strony: aktywny', 'Otomatik sayfa düzeni: aktif'],
  'Auto order mode is on': ['Automatische Seitenordnung ist an', 'Automatyczny układ strony jest włączony', 'Otomatik sayfa düzeni açık'],
  'Shapes and pictures a page line falls across go to the next page by themselves. Click to turn it off.': ['Formen und Bilder, die eine Seitenlinie schneidet, rücken von selbst auf die nächste Seite. Klicken zum Ausschalten.', 'Kształty i obrazy przecięte linią strony same przechodzą na następną stronę. Kliknij, aby wyłączyć.', 'Sayfa çizgisine denk gelen şekil ve resimler kendiliğinden sonraki sayfaya geçer. Kapatmak için tıklayın.'],
  'Nothing crosses a page line': ['Nichts schneidet eine Seitenlinie', 'Nic nie przecina linii strony', 'Sayfa çizgisine denk gelen bir şey yok'],
  // The PDF export's preview (0.9.3)
  'Landscape': ['Querformat', 'Poziomo', 'Yatay'],
  'Portrait': ['Hochformat', 'Pionowo', 'Dikey'],
  'Preparing the pages…': ['Seiten werden vorbereitet…', 'Przygotowywanie stron…', 'Sayfalar hazırlanıyor…'],
  'The preview could not be made': ['Die Vorschau konnte nicht erstellt werden', 'Nie udało się przygotować podglądu', 'Önizleme hazırlanamadı'],
  'Export': ['Exportieren', 'Eksportuj', 'Dışa aktar'],
  'margins': ['Ränder', 'marginesy', 'kenar boşluğu'],
  'Zoom the page in': ['Seite vergrößern', 'Powiększ stronę', 'Sayfayı yakınlaştır'],
  'Zoom the page out': ['Seite verkleinern', 'Pomniejsz stronę', 'Sayfayı uzaklaştır'],
  'Page width': ['Seitenbreite', 'Szerokość strony', 'Sayfa genişliği'],
  'Nebula Wide — as wide as the window; exported on A4, across or upright': ['Nebula Wide — so breit wie das Fenster; als A4 exportiert, quer oder hoch', 'Nebula Wide — szerokość okna; eksport na A4, poziomo lub pionowo', 'Nebula Wide — pencere genişliğinde; A4 olarak dışa aktarılır, yatay ya da dikey'],
  'Nebula Narrow — A4 written close to its edges, 6.35 mm margins': ['Nebula Narrow — A4 bis nah an den Rand beschrieben, 6,35 mm Rand', 'Nebula Narrow — A4 zapisana blisko krawędzi, marginesy 6,35 mm', 'Nebula Narrow — kenarlarına yakın yazılan A4, 6,35 mm kenar boşluğu'],
  'Change header': ['Titel ändern', 'Zmień nagłówek', 'Başlığı değiştir'],
  'Change website': ['Website ändern', 'Zmień stronę', 'Web sitesini değiştir'],
  'Delete website': ['Website löschen', 'Usuń stronę', 'Web sitesini sil'],
  'Restore removed sites': ['Entfernte Websites wiederherstellen', 'Przywróć usunięte strony', 'Silinen siteleri geri getir'],
  'Header:': ['Titel:', 'Nagłówek:', 'Başlık:'],
  'Website address:': ['Adresse der Website:', 'Adres strony:', 'Web sitesi adresi:'],
  'Reload this page': ['Seite neu laden', 'Wczytaj stronę ponownie', 'Sayfayı yenile'],
  'Move to folder': ['In Ordner verschieben', 'Przenieś do folderu', 'Klasöre taşı'],
  'New folder': ['Neuer Ordner', 'Nowy folder', 'Yeni klasör'],
  'New folder…': ['Neuer Ordner…', 'Nowy folder…', 'Yeni klasör…'],
  'Rename folder': ['Ordner umbenennen', 'Zmień nazwę folderu', 'Klasörü yeniden adlandır'],
  'Delete folder': ['Ordner löschen', 'Usuń folder', 'Klasörü sil'],
  'Folder actions': ['Ordneraktionen', 'Działania folderu', 'Klasör işlemleri'],
  'No folder': ['Kein Ordner', 'Bez folderu', 'Klasörsüz'],
  'Drag notes here': ['Notizen hierher ziehen', 'Przeciągnij tu notatki', 'Notları buraya sürükle'],
  'Delete the empty folder?': ['Den leeren Ordner löschen?', 'Usunąć pusty folder?', 'Boş klasör silinsin mi?'],
  'Pin to top': ['Oben anheften', 'Przypnij na górze', 'En üste sabitle'],
  'Unpin from top': ['Nicht mehr anheften', 'Odepnij z góry', 'Sabitlemeyi kaldır'],
  'Edit mode': ['Bearbeitungsmodus', 'Tryb edycji', 'Düzenleme modu'],
  'Only view mode': ['Nur-Lesen-Modus', 'Tryb tylko do odczytu', 'Yalnızca görüntüleme modu'],
  'Archive this note': ['Diese Notiz archivieren', 'Archiwizuj tę notatkę', 'Bu notu arşivle'],
  'Note actions': ['Notizaktionen', 'Działania notatki', 'Not işlemleri'],
  'Nothing archived': ['Nichts archiviert', 'Nic nie zarchiwizowano', 'Arşivde not yok'],
  'Open': ['Öffnen', 'Otwórz', 'Aç'],
  'Unarchive': ['Aus dem Archiv holen', 'Przywróć z archiwum', 'Arşivden çıkar'],
  'Trash is empty': ['Papierkorb ist leer', 'Kosz jest pusty', 'Çöp kutusu boş'],
  'Restore': ['Wiederherstellen', 'Przywróć', 'Geri yükle'],
  'Delete': ['Löschen', 'Usuń', 'Sil'],
  'Archived': ['Archiviert', 'Zarchiwizowane', 'Arşivlenenler'],
  'In the trash': ['Im Papierkorb', 'W koszu', 'Çöp kutusunda'],
  // The header
  'Untitled': ['Ohne Titel', 'Bez tytułu', 'Başlıksız'],
  'This note is view-only. Click to allow editing.': ['Diese Notiz ist schreibgeschützt. Klicken, um sie zu bearbeiten.', 'Ta notatka jest tylko do odczytu. Kliknij, aby zezwolić na edycję.', 'Bu not yalnızca görüntülenebilir. Düzenlemek için tıklayın.'],
  '🔒 Only view': ['🔒 Nur lesen', '🔒 Tylko odczyt', '🔒 Yalnızca görüntüle'],
  'Note labels': ['Notiz-Labels', 'Etykiety notatki', 'Not etiketleri'],
  'Saved': ['Gespeichert', 'Zapisano', 'Kaydedildi'],
  'Saving…': ['Speichert…', 'Zapisywanie…', 'Kaydediliyor…'],
  'Not saved': ['Nicht gespeichert', 'Nie zapisano', 'Kaydedilmedi'],
  'Retry saving': ['Erneut speichern', 'Spróbuj zapisać ponownie', 'Yeniden kaydetmeyi dene'],
  'Open notes folder': ['Notizordner öffnen', 'Otwórz folder notatek', 'Not klasörünü aç'],
  'Move the editing bar': ['Bearbeitungsleiste verschieben', 'Przenieś pasek edycji', 'Düzenleme çubuğunu taşı'],
  'Editing bar: top': ['Bearbeitungsleiste: oben', 'Pasek edycji: u góry', 'Düzenleme çubuğu: üstte'],
  'Editing bar: right': ['Bearbeitungsleiste: rechts', 'Pasek edycji: po prawej', 'Düzenleme çubuğu: sağda'],
  'Editing bar: bottom': ['Bearbeitungsleiste: unten', 'Pasek edycji: na dole', 'Düzenleme çubuğu: altta'],
  'Editing bar: left': ['Bearbeitungsleiste: links', 'Pasek edycji: po lewej', 'Düzenleme çubuğu: solda'],
  'Toggle AI panel': ['KI-Bereich ein/aus', 'Pokaż/ukryj panel AI', 'Yapay zekâ panelini aç/kapat'],
  'Hide / show the editing bar': ['Bearbeitungsleiste aus-/einblenden', 'Ukryj / pokaż pasek edycji', 'Düzenleme çubuğunu gizle / göster'],
  'Browser preview — notes stay in memory only. Use the desktop app for disk storage.': ['Browser-Vorschau — Notizen bleiben nur im Speicher. Für die Ablage auf der Festplatte die Desktop-App verwenden.', 'Podgląd w przeglądarce — notatki są tylko w pamięci. Aby zapisywać na dysku, użyj aplikacji.', 'Tarayıcı önizlemesi — notlar yalnızca bellekte kalır. Diske kaydetmek için masaüstü uygulamasını kullanın.'],
  // The editing bar
  'Undo (Ctrl+Z)': ['Rückgängig (Strg+Z)', 'Cofnij (Ctrl+Z)', 'Geri al (Ctrl+Z)'],
  'Redo (Ctrl+Y)': ['Wiederholen (Strg+Y)', 'Ponów (Ctrl+Y)', 'Yinele (Ctrl+Y)'],
  'Outline format': ['Gliederungsformat', 'Format konspektu', 'Başlık biçimi'],
  'Paragraph': ['Absatz', 'Akapit', 'Paragraf'],
  'Heading 1': ['Überschrift 1', 'Nagłówek 1', 'Başlık 1'],
  'Heading 2': ['Überschrift 2', 'Nagłówek 2', 'Başlık 2'],
  'Heading 3': ['Überschrift 3', 'Nagłówek 3', 'Başlık 3'],
  'Quote': ['Zitat', 'Cytat', 'Alıntı'],
  'Bulleted list': ['Aufzählung', 'Lista punktowana', 'Madde işaretli liste'],
  'Numbered list': ['Nummerierte Liste', 'Lista numerowana', 'Numaralı liste'],
  'To-do': ['Aufgabe', 'Zadanie', 'Yapılacak'],
  'Toggle list': ['Aufklappliste', 'Lista rozwijana', 'Açılır liste'],
  'Decrease indent (Shift+Tab)': ['Einzug verkleinern (Umschalt+Tab)', 'Zmniejsz wcięcie (Shift+Tab)', 'Girintiyi azalt (Shift+Tab)'],
  'Increase indent (Tab)': ['Einzug vergrößern (Tab)', 'Zwiększ wcięcie (Tab)', 'Girintiyi artır (Tab)'],
  'Save now (Ctrl+S)': ['Jetzt speichern (Strg+S)', 'Zapisz teraz (Ctrl+S)', 'Şimdi kaydet (Ctrl+S)'],
  'Print (Ctrl+P)': ['Drucken (Strg+P)', 'Drukuj (Ctrl+P)', 'Yazdır (Ctrl+P)'],
  'Export this note': ['Diese Notiz exportieren', 'Eksportuj tę notatkę', 'Bu notu dışa aktar'],
  'Import a note (.md, .html, .docx, .odt or .doc)': ['Notiz importieren (.md, .html, .docx, .odt oder .doc)', 'Importuj notatkę (.md, .html, .docx, .odt lub .doc)', 'Not içe aktar (.md, .html, .docx, .odt veya .doc)'],
  'Word (.docx)': ['Word (.docx)', 'Word (.docx)', 'Word (.docx)'],
  'Export as Word (.docx)': ['Als Word exportieren (.docx)', 'Eksportuj jako Word (.docx)', 'Word olarak dışa aktar (.docx)'],
  'Export as OpenDocument (.odt)': ['Als OpenDocument exportieren (.odt)', 'Eksportuj jako OpenDocument (.odt)', 'OpenDocument olarak dışa aktar (.odt)'],
  'Export as Word 97–2003 (.doc)': ['Als Word 97–2003 exportieren (.doc)', 'Eksportuj jako Word 97–2003 (.doc)', 'Word 97–2003 olarak dışa aktar (.doc)'],
  'Export as Rich Text (.rtf)': ['Als Rich Text exportieren (.rtf)', 'Eksportuj jako Rich Text (.rtf)', 'Rich Text olarak dışa aktar (.rtf)'],
  'Export for Evernote / Apple Notes (.enex)': ['Für Evernote / Apple Notes exportieren (.enex)', 'Eksportuj dla Evernote / Apple Notes (.enex)', 'Evernote / Apple Notes için dışa aktar (.enex)'],
  'Videos': ['Videos', 'Filmy', 'Videolar'],
  'With': ['Mit', 'Z', 'İle'],
  'Without': ['Ohne', 'Bez', 'Olmadan'],
  '▶ With videos': ['▶ Mit Videos', '▶ Z filmami', '▶ Videolarla'],
  'Links only': ['Nur Links', 'Tylko linki', 'Sadece bağlantılar'],
  'Videos as they show in the note: the picture, linked': ['Videos wie in der Notiz: das Bild, verlinkt', 'Filmy jak w notatce: obraz z linkiem', 'Videolar notta göründüğü gibi: bağlantılı resim'],
  'Videos as their links only': ['Videos nur als Links', 'Filmy tylko jako linki', 'Videolar sadece bağlantı olarak'],
  'Import a note (.md, .html, .docx, .odt, .doc, .rtf or .enex)': ['Notiz importieren (.md, .html, .docx, .odt, .doc, .rtf oder .enex)', 'Importuj notatkę (.md, .html, .docx, .odt, .doc, .rtf lub .enex)', 'Not içe aktar (.md, .html, .docx, .odt, .doc, .rtf veya .enex)'],
  'That file could not be read': ['Diese Datei konnte nicht gelesen werden', 'Nie udało się odczytać pliku', 'Bu dosya okunamadı'],
  'Cut (Ctrl+X)': ['Ausschneiden (Strg+X)', 'Wytnij (Ctrl+X)', 'Kes (Ctrl+X)'],
  'Copy (Ctrl+C)': ['Kopieren (Strg+C)', 'Kopiuj (Ctrl+C)', 'Kopyala (Ctrl+C)'],
  'Paste (Ctrl+V)': ['Einfügen (Strg+V)', 'Wklej (Ctrl+V)', 'Yapıştır (Ctrl+V)'],
  'Insert shape': ['Form einfügen', 'Wstaw kształt', 'Şekil ekle'],
  'Shape kind': ['Formart', 'Rodzaj kształtu', 'Şekil türü'],
  'Rectangle': ['Rechteck', 'Prostokąt', 'Dikdörtgen'],
  'Square': ['Quadrat', 'Kwadrat', 'Kare'],
  'Ellipse': ['Ellipse', 'Elipsa', 'Elips'],
  'Circle': ['Kreis', 'Koło', 'Daire'],
  'Diamond': ['Raute', 'Romb', 'Eşkenar dörtgen'],
  'Triangle': ['Dreieck', 'Trójkąt', 'Üçgen'],
  'Insert arrow': ['Pfeil einfügen', 'Wstaw strzałkę', 'Ok ekle'],
  'Arrow kind': ['Pfeilart', 'Rodzaj strzałki', 'Ok türü'],
  'Straight arrow': ['Gerader Pfeil', 'Prosta strzałka', 'Düz ok'],
  'Elbow arrow': ['Gewinkelter Pfeil', 'Strzałka łamana', 'Dirsekli ok'],
  'Curved arrow': ['Gebogener Pfeil', 'Strzałka zakrzywiona', 'Eğri ok'],
  'Code block (with language)': ['Codeblock (mit Sprache)', 'Blok kodu (z językiem)', 'Kod bloğu (dil seçmeli)'],
  'Divider': ['Trennlinie', 'Separator', 'Ayırıcı çizgi'],
  'Font': ['Schriftart', 'Czcionka', 'Yazı tipi'],
  'Size': ['Größe', 'Rozmiar', 'Boyut'],
  'Size — type any number, or pick one': ['Größe — eine Zahl eingeben oder auswählen', 'Rozmiar — wpisz liczbę lub wybierz', 'Boyut — bir sayı yazın ya da seçin'],
  'Font size': ['Schriftgröße', 'Rozmiar czcionki', 'Yazı boyutu'],
  'Text color (Ctrl+T)': ['Textfarbe (Strg+T)', 'Kolor tekstu (Ctrl+T)', 'Yazı rengi (Ctrl+T)'],
  'Text color': ['Textfarbe', 'Kolor tekstu', 'Yazı rengi'],
  'Text colour': ['Textfarbe', 'Kolor tekstu', 'Yazı rengi'],
  'Highlight (Ctrl+H)': ['Hervorheben (Strg+H)', 'Wyróżnienie (Ctrl+H)', 'Vurgula (Ctrl+H)'],
  'Highlight color': ['Hervorhebungsfarbe', 'Kolor wyróżnienia', 'Vurgu rengi'],
  'Background color': ['Hintergrundfarbe', 'Kolor tła', 'Arka plan rengi'],
  'Bold (Ctrl+B)': ['Fett (Strg+B)', 'Pogrubienie (Ctrl+B)', 'Kalın (Ctrl+B)'],
  'Italic (Ctrl+I)': ['Kursiv (Strg+I)', 'Kursywa (Ctrl+I)', 'İtalik (Ctrl+I)'],
  'Underline (Ctrl+U)': ['Unterstrichen (Strg+U)', 'Podkreślenie (Ctrl+U)', 'Altı çizili (Ctrl+U)'],
  'Underline style': ['Unterstreichungsart', 'Styl podkreślenia', 'Alt çizgi stili'],
  'Single': ['Einfach', 'Pojedyncze', 'Tek'],
  'Double': ['Doppelt', 'Podwójne', 'Çift'],
  'Wavy': ['Wellig', 'Faliste', 'Dalgalı'],
  'Dashed': ['Gestrichelt', 'Kreskowane', 'Kesikli'],
  'None': ['Keine', 'Brak', 'Yok'],
  'Strikethrough (Ctrl+Shift+S)': ['Durchgestrichen (Strg+Umschalt+S)', 'Przekreślenie (Ctrl+Shift+S)', 'Üstü çizili (Ctrl+Shift+S)'],
  'Inline code (Ctrl+E)': ['Inline-Code (Strg+E)', 'Kod w tekście (Ctrl+E)', 'Satır içi kod (Ctrl+E)'],
  'Link the selected words (or paste a URL over them)': ['Markierte Wörter verlinken (oder eine URL darüber einfügen)', 'Połącz zaznaczone słowa (lub wklej na nie adres URL)', 'Seçili sözcüklere bağlantı ver (ya da üzerine bir URL yapıştır)'],
  'Equation (Ctrl+Q)': ['Formel (Strg+Q)', 'Równanie (Ctrl+Q)', 'Denklem (Ctrl+Q)'],
  'Align left': ['Linksbündig', 'Wyrównaj do lewej', 'Sola hizala'],
  'Align center': ['Zentriert', 'Wyśrodkuj', 'Ortala'],
  'Align right': ['Rechtsbündig', 'Wyrównaj do prawej', 'Sağa hizala'],
  'Justify': ['Blocksatz', 'Wyjustuj', 'İki yana yasla'],
  'Bold': ['Fett', 'Pogrubienie', 'Kalın'],
  'Italic': ['Kursiv', 'Kursywa', 'İtalik'],
  'Underline': ['Unterstrichen', 'Podkreślenie', 'Altı çizili'],
  'Strikethrough': ['Durchgestrichen', 'Przekreślenie', 'Üstü çizili'],
  'Highlight': ['Hervorheben', 'Wyróżnienie', 'Vurgu'],
  'Inline code': ['Inline-Code', 'Kod w tekście', 'Satır içi kod'],
  'Link': ['Link', 'Link', 'Bağlantı'],
  'Equation': ['Formel', 'Równanie', 'Denklem'],
  'Serif (default)': ['Serif (Standard)', 'Szeryfowa (domyślna)', 'Serif (varsayılan)'],
  'Theme color (default)': ['Designfarbe (Standard)', 'Kolor motywu (domyślny)', 'Tema rengi (varsayılan)'],
  'Gray text': ['Grauer Text', 'Szary tekst', 'Gri yazı'],
  'Brown text': ['Brauner Text', 'Brązowy tekst', 'Kahverengi yazı'],
  'Orange text': ['Oranger Text', 'Pomarańczowy tekst', 'Turuncu yazı'],
  'Yellow text': ['Gelber Text', 'Żółty tekst', 'Sarı yazı'],
  'Green text': ['Grüner Text', 'Zielony tekst', 'Yeşil yazı'],
  'Blue text': ['Blauer Text', 'Niebieski tekst', 'Mavi yazı'],
  'Purple text': ['Lila Text', 'Fioletowy tekst', 'Mor yazı'],
  'Pink text': ['Rosa Text', 'Różowy tekst', 'Pembe yazı'],
  'Red text': ['Roter Text', 'Czerwony tekst', 'Kırmızı yazı'],
  'No background': ['Kein Hintergrund', 'Bez tła', 'Arka plan yok'],
  'Gray background': ['Grauer Hintergrund', 'Szare tło', 'Gri arka plan'],
  'Brown background': ['Brauner Hintergrund', 'Brązowe tło', 'Kahverengi arka plan'],
  'Orange background': ['Oranger Hintergrund', 'Pomarańczowe tło', 'Turuncu arka plan'],
  'Yellow background': ['Gelber Hintergrund', 'Żółte tło', 'Sarı arka plan'],
  'Green background': ['Grüner Hintergrund', 'Zielone tło', 'Yeşil arka plan'],
  'Blue background': ['Blauer Hintergrund', 'Niebieskie tło', 'Mavi arka plan'],
  'Purple background': ['Lila Hintergrund', 'Fioletowe tło', 'Mor arka plan'],
  'Pink background': ['Rosa Hintergrund', 'Różowe tło', 'Pembe arka plan'],
  'Red background': ['Roter Hintergrund', 'Czerwone tło', 'Kırmızı arka plan'],
  'Markdown (.md)': ['Markdown (.md)', 'Markdown (.md)', 'Markdown (.md)'],
  'Nebula note (.nebula.json)': ['Nebula-Notiz (.nebula.json)', 'Notatka Nebula (.nebula.json)', 'Nebula notu (.nebula.json)'],
  // Find, equation, dialogs
  'Find in this note…': ['In dieser Notiz suchen…', 'Szukaj w tej notatce…', 'Bu notta ara…'],
  'Find in this note': ['In dieser Notiz suchen', 'Szukaj w tej notatce', 'Bu notta ara'],
  'Previous (Shift+Enter)': ['Vorheriger (Umschalt+Enter)', 'Poprzedni (Shift+Enter)', 'Önceki (Shift+Enter)'],
  'Next (Enter)': ['Nächster (Enter)', 'Następny (Enter)', 'Sonraki (Enter)'],
  'Close (Esc)': ['Schließen (Esc)', 'Zamknij (Esc)', 'Kapat (Esc)'],
  'no matches': ['keine Treffer', 'brak wyników', 'eşleşme yok'],
  'Start writing…  ( / for blocks )': ['Losschreiben…  ( / für Blöcke )', 'Zacznij pisać…  ( / – bloki )', 'Yazmaya başlayın…  ( bloklar için / )'],
  'Drag to resize': ['Ziehen, um die Größe zu ändern', 'Przeciągnij, aby zmienić rozmiar', 'Boyutlandırmak için sürükleyin'],
  'Close': ['Schließen', 'Zamknij', 'Kapat'],
  'Cancel': ['Abbrechen', 'Anuluj', 'Vazgeç'],
  'Insert': ['Einfügen', 'Wstaw', 'Ekle'],
  'OK': ['OK', 'OK', 'Tamam'],
  'Later': ['Später', 'Później', 'Sonra'],
  'Got it': ['Verstanden', 'Rozumiem', 'Anladım'],
  'LaTeX · Enter inserts · Esc cancels': ['LaTeX · Enter fügt ein · Esc bricht ab', 'LaTeX · Enter wstawia · Esc anuluje', 'LaTeX · Enter ekler · Esc vazgeçer'],
  'Type LaTeX to see it here': ['LaTeX eingeben, um es hier zu sehen', 'Wpisz LaTeX, aby zobaczyć go tutaj', 'Burada görmek için LaTeX yazın'],
  'Type a command…': ['Befehl eingeben…', 'Wpisz polecenie…', 'Bir komut yazın…'],
  'Command palette': ['Befehlspalette', 'Paleta poleceń', 'Komut paleti'],
  'No command matches': ['Kein Befehl passt', 'Żadne polecenie nie pasuje', 'Eşleşen komut yok'],
  'Blocks — the / menu': ['Blöcke — das /-Menü', 'Bloki — menu /', 'Bloklar — / menüsü'],
  'Keyboard shortcuts': ['Tastenkürzel', 'Skróty klawiszowe', 'Klavye kısayolları'],
  'About Nebula': ['Über Nebula', 'O Nebula', 'Nebula hakkında'],
  'What’s new': ['Neuigkeiten', 'Co nowego', 'Yenilikler'],
  // The app menus
  'File': ['Datei', 'Plik', 'Dosya'],
  'Edit': ['Bearbeiten', 'Edycja', 'Düzen'],
  'View': ['Ansicht', 'Widok', 'Görünüm'],
  'Window': ['Fenster', 'Okno', 'Pencere'],
  'Help': ['Hilfe', 'Pomoc', 'Yardım'],
  'Save now': ['Jetzt speichern', 'Zapisz teraz', 'Şimdi kaydet'],
  'Print…': ['Drucken…', 'Drukuj…', 'Yazdır…'],
  'Print': ['Drucken', 'Drukuj', 'Yazdır'],
  'Export as Markdown': ['Als Markdown exportieren', 'Eksportuj jako Markdown', 'Markdown olarak dışa aktar'],
  'Export as HTML': ['Als HTML exportieren', 'Eksportuj jako HTML', 'HTML olarak dışa aktar'],
  'Export as PDF': ['Als PDF exportieren', 'Eksportuj jako PDF', 'PDF olarak dışa aktar'],
  'Import a note…': ['Notiz importieren…', 'Importuj notatkę…', 'Not içe aktar…'],
  'Quit Nebula': ['Nebula beenden', 'Zamknij Nebula', 'Nebula’dan çık'],
  'Undo': ['Rückgängig', 'Cofnij', 'Geri al'],
  'Redo': ['Wiederholen', 'Ponów', 'Yinele'],
  'Cut': ['Ausschneiden', 'Wytnij', 'Kes'],
  'Copy': ['Kopieren', 'Kopiuj', 'Kopyala'],
  'Paste': ['Einfügen', 'Wklej', 'Yapıştır'],
  'Zoom in': ['Vergrößern', 'Powiększ', 'Yakınlaştır'],
  'Zoom out': ['Verkleinern', 'Pomniejsz', 'Uzaklaştır'],
  'Actual size': ['Originalgröße', 'Rzeczywisty rozmiar', 'Gerçek boyut'],
  'Toggle note list': ['Notizliste ein/aus', 'Pokaż/ukryj listę notatek', 'Not listesini aç/kapat'],
  'Toggle editing bar': ['Bearbeitungsleiste ein/aus', 'Pokaż/ukryj pasek edycji', 'Düzenleme çubuğunu aç/kapat'],
  'Full screen': ['Vollbild', 'Pełny ekran', 'Tam ekran'],
  'Window snapshot': ['Fensterbild', 'Zrzut okna', 'Pencere görüntüsü'],
  'Developer tools': ['Entwicklertools', 'Narzędzia deweloperskie', 'Geliştirici araçları'],
  'Maximize': ['Maximieren', 'Maksymalizuj', 'Büyüt'],
  'Minimize': ['Minimieren', 'Minimalizuj', 'Simge durumuna küçült'],
  'Close window': ['Fenster schließen', 'Zamknij okno', 'Pencereyi kapat'],
  'Guide page': ['Anleitung', 'Przewodnik', 'Rehber sayfası'],
  'Blocks (the / menu)': ['Blöcke (das /-Menü)', 'Bloki (menu /)', 'Bloklar (/ menüsü)'],
  // Keyboard sheet and the blocks sheet
  'Writing': ['Schreiben', 'Pisanie', 'Yazma'],
  'Structure': ['Struktur', 'Struktura', 'Yapı'],
  'Editing': ['Bearbeiten', 'Edycja', 'Düzenleme'],
  'Window snapshot (saved and copied)': ['Fensterbild (gespeichert und kopiert)', 'Zrzut okna (zapisany i skopiowany)', 'Pencere görüntüsü (kaydedilir ve kopyalanır)'],
  'Block menu': ['Blockmenü', 'Menu bloków', 'Blok menüsü'],
  'Indent the block': ['Block einrücken (in einer Liste: den Punkt)', 'Wcięcie bloku (na liście: punktu)', 'Bloğu içeri al (listede: maddeyi)'],
  'Outdent the block': ['Einzug des Blocks verkleinern', 'Zmniejsz wcięcie bloku', 'Bloğu dışarı al'],
  'On an empty list item: leave the list': ['Auf einem leeren Listenpunkt: Liste verlassen', 'Na pustym punkcie listy: wyjdź z listy', 'Boş bir liste maddesinde: listeden çık'],
  'At the start of a format: take it off': ['Am Anfang einer Formatierung: entfernen', 'Na początku formatowania: usuń je', 'Bir biçimin başında: biçimi kaldır'],
  'Cut, copy, paste': ['Ausschneiden, kopieren, einfügen', 'Wytnij, kopiuj, wklej', 'Kes, kopyala, yapıştır'],
  'Zoom in and out': ['Vergrößern und verkleinern', 'Powiększ i pomniejsz', 'Yakınlaştır ve uzaklaştır'],
  'Close whatever is open': ['Schließt, was offen ist', 'Zamknij to, co otwarte', 'Açık olanı kapat'],
  'Plain paragraph': ['Einfacher Absatz', 'Zwykły akapit', 'Düz paragraf'],
  'Big heading': ['Große Überschrift', 'Duży nagłówek', 'Büyük başlık'],
  'Medium heading': ['Mittlere Überschrift', 'Średni nagłówek', 'Orta başlık'],
  'Small heading': ['Kleine Überschrift', 'Mały nagłówek', 'Küçük başlık'],
  'Bulleted list — Enter on an empty item leaves it': ['Aufzählung — Enter auf einem leeren Punkt verlässt sie', 'Lista punktowana — Enter na pustym punkcie ją kończy', 'Madde işaretli liste — boş maddede Enter listeden çıkar'],
  'Numbered list — Enter on an empty item leaves it': ['Nummerierte Liste — Enter auf einem leeren Punkt verlässt sie', 'Lista numerowana — Enter na pustym punkcie ją kończy', 'Numaralı liste — boş maddede Enter listeden çıkar'],
  'A line with a checkbox; the button toggles it back': ['Eine Zeile mit Kontrollkästchen; die Schaltfläche macht sie wieder normal', 'Linia z polem wyboru; przycisk przywraca zwykły tekst', 'Onay kutulu bir satır; düğme onu geri çevirir'],
  'Indented quote': ['Eingerücktes Zitat', 'Wcięty cytat', 'Girintili alıntı'],
  'Code block with a language picker and colours': ['Codeblock mit Sprachauswahl und Farben', 'Blok kodu z wyborem języka i kolorami', 'Dil seçicili ve renkli kod bloğu'],
  'A horizontal rule': ['Eine waagerechte Linie', 'Pozioma linia', 'Yatay bir çizgi'],
  'A floating shape you can drag anywhere': ['Eine freie Form, die sich überallhin ziehen lässt', 'Pływający kształt, który można przeciągnąć w dowolne miejsce', 'İstediğiniz yere sürükleyebileceğiniz serbest bir şekil'],
  'A safe clickable embed card for a URL': ['Eine sichere, anklickbare Einbettung für eine URL', 'Bezpieczna, klikalna karta osadzenia dla adresu URL', 'Bir URL için güvenli, tıklanabilir gömülü kart'],
  'A bookmark card for a URL': ['Eine Lesezeichenkarte für eine URL', 'Karta zakładki dla adresu URL', 'Bir URL için yer imi kartı'],
  'An inline URL link': ['Ein URL-Link im Text', 'Link URL w tekście', 'Metin içinde bir URL bağlantısı'],
  'An inline @mention link': ['Ein @Erwähnungs-Link im Text', 'Wzmianka @ w tekście', 'Metin içinde bir @bahsetme bağlantısı'],
  'A list whose items fold away under an arrow': ['Eine Liste, deren Inhalt unter einem Pfeil zugeklappt wird', 'Lista, której zawartość zwija się pod strzałką', 'İçeriği bir okun altında katlanan liste'],
  'Type / at the start of a line, or after a space, then keep typing to filter.': ['/ am Zeilenanfang oder nach einem Leerzeichen eingeben, dann weitertippen, um zu filtern.', 'Wpisz / na początku linii lub po spacji, a potem pisz dalej, aby filtrować.', 'Satır başında ya da bir boşluktan sonra / yazın, süzmek için yazmaya devam edin.'],
  // The slash menu
  'Text': ['Text', 'Tekst', 'Metin'],
  'Code block': ['Codeblock', 'Blok kodu', 'Kod bloğu'],
  'Shape': ['Form', 'Kształt', 'Şekil'],
  'Embed': ['Einbetten', 'Osadzenie', 'Göm'],
  'Bookmark': ['Lesezeichen', 'Zakładka', 'Yer imi'],
  'Mention': ['Erwähnung', 'Wzmianka', 'Bahsetme'],
  'Mention a note': ['Eine Notiz erwähnen', 'Wspomnij notatkę', 'Bir nottan bahset'],
  'No note has that name': ['Keine Notiz heißt so', 'Żadna notatka nie ma takiej nazwy', 'Bu adda not yok'],
  // Shapes, pictures, links
  'Fill': ['Füllung', 'Wypełnienie', 'Dolgu'],
  'Outline on / off': ['Umriss an / aus', 'Obrys wł. / wył.', 'Kenarlık açık / kapalı'],
  'Send behind text': ['Hinter den Text', 'Przenieś za tekst', 'Metnin arkasına gönder'],
  'Bring above text': ['Vor den Text', 'Przenieś nad tekst', 'Metnin önüne getir'],
  'Delete shape': ['Form löschen', 'Usuń kształt', 'Şekli sil'],
  'Behind the text (floats)': ['Hinter dem Text (frei)', 'Za tekstem (pływa)', 'Metnin arkasında (serbest)'],
  'Above the text (floats, on top)': ['Über dem Text (frei, oben)', 'Nad tekstem (pływa, na wierzchu)', 'Metnin üstünde (serbest, önde)'],
  'In the text (moves with the words)': ['Im Text (bewegt sich mit den Wörtern)', 'W tekście (przesuwa się ze słowami)', 'Metnin içinde (sözcüklerle birlikte kayar)'],
  'Add or edit a caption': ['Bildunterschrift hinzufügen oder bearbeiten', 'Dodaj lub edytuj podpis', 'Alt yazı ekle ya da düzenle'],
  'Delete image': ['Bild löschen', 'Usuń obraz', 'Resmi sil'],
  'Copy image': ['Bild kopieren', 'Kopiuj obraz', 'Resmi kopyala'],
  'Add caption': ['Bildunterschrift hinzufügen', 'Dodaj podpis', 'Alt yazı ekle'],
  'Edit caption': ['Bildunterschrift bearbeiten', 'Edytuj podpis', 'Alt yazıyı düzenle'],
  'Picture copied': ['Bild kopiert', 'Obraz skopiowany', 'Resim kopyalandı'],
  'The picture could not be copied': ['Das Bild konnte nicht kopiert werden', 'Nie udało się skopiować obrazu', 'Resim kopyalanamadı'],
  'Caption': ['Bildunterschrift', 'Podpis', 'Alt yazı'],
  'Paste as': ['Einfügen als', 'Wklej jako', 'Şu şekilde yapıştır'],
  'Link URL': ['Link-URL', 'Adres URL linku', 'Bağlantı URL’si'],
  'Remove link': ['Link entfernen', 'Usuń link', 'Bağlantıyı kaldır'],
  'Choose how this link should appear.': ['Wählen, wie dieser Link erscheinen soll.', 'Wybierz, jak ma wyglądać ten link.', 'Bu bağlantının nasıl görüneceğini seçin.'],
  'Choose how this link should appear — ↓, then ← → and Enter.': ['Wählen, wie dieser Link erscheinen soll — ↓, dann ← → und Enter.', 'Wybierz, jak ma wyglądać ten link — ↓, potem ← → i Enter.', 'Bu bağlantının nasıl görüneceğini seçin — ↓, sonra ← → ve Enter.'],
  'Paste a URL, then choose a format — ↓, then ← → and Enter.': ['Eine URL einfügen, dann ein Format wählen — ↓, dann ← → und Enter.', 'Wklej adres URL, potem wybierz format — ↓, potem ← → i Enter.', 'Bir URL yapıştırın, sonra biçim seçin — ↓, sonra ← → ve Enter.'],
  'Enter a valid http(s) URL first.': ['Zuerst eine gültige http(s)-URL eingeben.', 'Najpierw wpisz prawidłowy adres http(s).', 'Önce geçerli bir http(s) URL’si girin.'],
  // The right-click menu (0.9.3)
  'No suggestions': ['Keine Vorschläge', 'Brak podpowiedzi', 'Öneri yok'],
  'Add to dictionary': ['Zum Wörterbuch hinzufügen', 'Dodaj do słownika', 'Sözlüğe ekle'],
  'Select all': ['Alles auswählen', 'Zaznacz wszystko', 'Tümünü seç'],
  // Labels
  'Find or add a label': ['Label suchen oder hinzufügen', 'Znajdź lub dodaj etykietę', 'Etiket bul ya da ekle'],
  'Add labels': ['Labels hinzufügen', 'Dodaj etykiety', 'Etiket ekle'],
  'Add selected label': ['Gewähltes Label hinzufügen', 'Dodaj wybraną etykietę', 'Seçili etiketi ekle'],
  'Add label': ['Label hinzufügen', 'Dodaj etykietę', 'Etiket ekle'],
  // The AI panel
  'Remove': ['Entfernen', 'Usuń', 'Kaldır'],
  'Add a site': ['Website hinzufügen', 'Dodaj stronę', 'Site ekle'],
  'Site name:': ['Name der Website:', 'Nazwa strony:', 'Site adı:'],
  'Site URL:': ['URL der Website:', 'Adres URL strony:', 'Site URL’si:'],
  // Updates and About
  'Checking for updates…': ['Suche nach Updates…', 'Sprawdzanie aktualizacji…', 'Güncellemeler denetleniyor…'],
  'Update': ['Aktualisieren', 'Aktualizuj', 'Güncelle'],
  'Restart and install': ['Neu starten und installieren', 'Uruchom ponownie i zainstaluj', 'Yeniden başlat ve kur'],
  'Download': ['Herunterladen', 'Pobierz', 'İndir'],
  'Open releases': ['Veröffentlichungen öffnen', 'Otwórz wydania', 'Sürümleri aç'],
  'Nebula is up to date.': ['Nebula ist aktuell.', 'Nebula jest aktualna.', 'Nebula güncel.'],
  'About': ['Info', 'O programie', 'Hakkında'],
  'About Nebula — version, folders, updates': ['Über Nebula — Version, Ordner, Updates', 'O Nebula — wersja, foldery, aktualizacje', 'Nebula hakkında — sürüm, klasörler, güncellemeler'],
  'Installed': ['Installiert', 'Zainstalowana', 'Kurulu'],
  'Test build': ['Testversion', 'Wersja testowa', 'Test sürümü'],
  'Portable': ['Portabel', 'Przenośna', 'Taşınabilir'],
  'Development': ['Entwicklung', 'Deweloperska', 'Geliştirme'],
  'Version': ['Version', 'Wersja', 'Sürüm'],
  'Build': ['Ausgabe', 'Kompilacja', 'Derleme'],
  'Application': ['Programm', 'Aplikacja', 'Uygulama'],
  'Backups': ['Sicherungen', 'Kopie zapasowe', 'Yedekler'],
  'Profile': ['Profil', 'Profil', 'Profil'],
  'Open this folder': ['Diesen Ordner öffnen', 'Otwórz ten folder', 'Bu klasörü aç'],
  'Updates itself from GitHub Releases.': ['Aktualisiert sich selbst über GitHub Releases.', 'Aktualizuje się sama z GitHub Releases.', 'Kendini GitHub Releases üzerinden günceller.'],
  'A build for trying things out. Its own name, icon and notes — the installed Nebula is a separate app and is untouched.': ['Eine Version zum Ausprobieren. Eigener Name, eigenes Symbol, eigene Notizen — das installierte Nebula ist eine eigene App und bleibt unberührt.', 'Wersja do wypróbowania. Własna nazwa, ikona i notatki — zainstalowana Nebula to osobna aplikacja i pozostaje nietknięta.', 'Denemeler için bir sürüm. Kendi adı, simgesi ve notları var — kurulu Nebula ayrı bir uygulamadır ve dokunulmaz.'],
  'Runs from a folder and keeps its notes beside itself. Tells you about new versions but cannot install them.': ['Läuft aus einem Ordner und speichert die Notizen daneben. Meldet neue Versionen, kann sie aber nicht installieren.', 'Działa z folderu i trzyma notatki obok siebie. Informuje o nowych wersjach, ale nie może ich zainstalować.', 'Bir klasörden çalışır ve notlarını yanında tutar. Yeni sürümleri bildirir ama kuramaz.'],
  'Running from source, on a separate profile — the installed app is untouched.': ['Läuft aus dem Quellcode, mit eigenem Profil — die installierte App bleibt unberührt.', 'Działa z kodu źródłowego, na osobnym profilu — zainstalowana aplikacja pozostaje nietknięta.', 'Kaynak koddan, ayrı bir profille çalışır — kurulu uygulamaya dokunulmaz.'],
  'Browser preview — there is no installed app and nothing is stored on disk.': ['Browser-Vorschau — es gibt keine installierte App, und nichts wird auf der Festplatte gespeichert.', 'Podgląd w przeglądarce — nie ma zainstalowanej aplikacji i nic nie jest zapisywane na dysku.', 'Tarayıcı önizlemesi — kurulu uygulama yok ve diske hiçbir şey kaydedilmez.'],
  'An update replaces the application folder only. Your notes stay in the profile, and the whole vault is copied into Backups before anything installs.': ['Ein Update ersetzt nur den Programmordner. Die Notizen bleiben im Profil, und vor der Installation wird der ganze Notizordner in die Sicherungen kopiert.', 'Aktualizacja zastępuje tylko folder aplikacji. Notatki zostają w profilu, a cały sejf jest kopiowany do kopii zapasowych przed instalacją.', 'Güncelleme yalnızca uygulama klasörünü değiştirir. Notlarınız profilde kalır ve kurulumdan önce tüm not kasası Yedekler’e kopyalanır.'],
  'Snapshot failed': ['Fensterbild fehlgeschlagen', 'Zrzut nie powiódł się', 'Görüntü alınamadı'],
};

/** Strings with a value in them. [pattern, [de, pl, tr]] — $1, $2 are the values. */
const PATTERNS = [
  [/^([AB]\d) page — (\d+) × (\d+) mm$/, ['Seite $1 — $2 × $3 mm', 'Strona $1 — $2 × $3 mm', '$1 sayfa — $2 × $3 mm']],
  [/^Delete the folder\? Its (\d+) notes stay, back in the list\.$/, ['Den Ordner löschen? Seine $1 Notizen bleiben, wieder in der Liste.', 'Usunąć folder? Jego notatki ($1) zostają, wracają na listę.', 'Klasör silinsin mi? İçindeki $1 not listede kalır.']],
  [/^(\d+) of (\d+)$/, ['$1 von $2', '$1 z $2', '$1 / $2']],
  [/^What’s new in (v[\w.-]+)$/, ['Neu in $1', 'Co nowego w $1', '$1 yenilikleri']],
  [/^Nebula ([\w.-]+) is available\.$/, ['Nebula $1 ist verfügbar.', 'Nebula $1 jest dostępna.', 'Nebula $1 hazır.']],
  [/^Downloading Nebula ?([\w.-]*)…$/, ['Nebula $1 wird heruntergeladen…', 'Pobieranie Nebula $1…', 'Nebula $1 indiriliyor…']],
  [/^Nebula ([\w.-]+) is ready\. Your notes stay exactly where they are\.$/, ['Nebula $1 ist bereit. Die Notizen bleiben, wo sie sind.', 'Nebula $1 jest gotowa. Notatki zostają tam, gdzie są.', 'Nebula $1 hazır. Notlarınız olduğu yerde kalır.']],
  [/^Could not check for updates: (.*)$/, ['Updates konnten nicht geprüft werden: $1', 'Nie udało się sprawdzić aktualizacji: $1', 'Güncellemeler denetlenemedi: $1']],
  [/^Snapshot saved to (.*) and copied$/, ['Fensterbild gespeichert unter $1 und kopiert', 'Zrzut zapisany w $1 i skopiowany', 'Görüntü $1 konumuna kaydedildi ve kopyalandı']],
  [/^This chat could not be opened: (.*)$/, ['Dieser Chat konnte nicht geöffnet werden: $1', 'Nie udało się otworzyć tego czatu: $1', 'Bu sohbet açılamadı: $1']],
  [/^Add #(.+)$/, ['#$1 hinzufügen', 'Dodaj #$1', '#$1 ekle']],
  [/^Your notes could not be read \((.*)\)\. Nothing has been changed on disk\. ?$/, ['Die Notizen konnten nicht gelesen werden ($1). Auf der Festplatte wurde nichts geändert. ', 'Nie udało się odczytać notatek ($1). Na dysku nic nie zmieniono. ', 'Notlar okunamadı ($1). Diskte hiçbir şey değiştirilmedi. ']],
  [/^Your latest changes could not be saved\. (.*)$/, ['Die letzten Änderungen konnten nicht gespeichert werden. $1', 'Nie udało się zapisać ostatnich zmian. $1', 'Son değişiklikler kaydedilemedi. $1']],
  [/^Delete #(.+) from (\d+) notes\?$/, ['#$1 aus $2 Notizen löschen?', 'Usunąć #$1 z $2 notatek?', '#$1 etiketi $2 nottan silinsin mi?']],
  [/^#(.+) — notes with this label$/, ['#$1 — Notizen mit diesem Label', '#$1 — notatki z tą etykietą', '#$1 — bu etiketli notlar']],
];

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    return CODES.includes(saved) ? saved : 'en';
  } catch {
    return 'en';
  }
}

let lang = 'en';

export function getLang() {
  return lang;
}

/**
 * The text in the chosen language, or the text itself.
 * @param {string} text the English
 * @param {string} [to] a language code; the chosen one by default
 */
export function t(text, to = lang) {
  if (to === 'en' || typeof text !== 'string') return text;
  const col = COLUMN[to];
  if (col === undefined) return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  const core = text.trim();
  if (!core) return text;
  const hit = STRINGS[core]?.[col];
  if (hit) return lead + hit + trail;
  for (const [re, out] of PATTERNS) {
    const m = core.match(re);
    if (m) return lead + out[col].replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '') + trail;
  }
  return text;
}

/** Nothing inside these is interface: it is the note, a name, or a page. */
const NEVER = '#editor, #title, .nr-title, .nr-meta, .ai-body, .note-labels, .label-panel__list, .label-opt, #palette-list .pr-label-note, #whats-new-body, .lang-pick__name, [data-no-i18n]';
const ATTRS = ['title', 'placeholder', 'aria-label', 'data-placeholder'];

// The English each node or attribute had before it was translated.
const textSource = new WeakMap();   // Text -> {en, shown}
const attrSource = new WeakMap();   // Element -> {attr: {en, shown}}

function excluded(el) {
  return !el || !!el.closest?.(NEVER);
}

function translateText(node) {
  const known = textSource.get(node);
  // Written by us: nothing to do. Written by the app since: it is English again.
  const en = known && node.nodeValue === known.shown ? known.en : node.nodeValue;
  const shown = t(en);
  if (shown === en && !known) return;
  textSource.set(node, { en, shown });
  if (node.nodeValue !== shown) node.nodeValue = shown;
}

function translateAttrs(el) {
  // The editor's placeholder, and the title field's, are on the element, not in the note.
  if (el.id !== 'editor' && el.id !== 'title' && excluded(el)) return;
  for (const name of ATTRS) {
    if (!el.hasAttribute(name)) continue;
    if (name === 'data-placeholder' && el.id !== 'editor') continue;
    const value = el.getAttribute(name);
    let rec = attrSource.get(el);
    const known = rec?.[name];
    const en = known && value === known.shown ? known.en : value;
    const shown = t(en);
    if (shown === en && !known) continue;
    if (!rec) { rec = {}; attrSource.set(el, rec); }
    rec[name] = { en, shown };
    if (value !== shown) el.setAttribute(name, shown);
  }
}

/** Translate everything under `root` that is interface. */
export function translateTree(root = document.body) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!excluded(root.parentElement) && root.nodeValue.trim()) translateText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.id !== 'editor' && excluded(root)) return;
  translateAttrs(root);
  if (root.id === 'editor') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.id === 'editor' || n.id === 'title') { translateAttrs(n); return NodeFilter.FILTER_REJECT; }
        return n.matches(NEVER) || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'WEBVIEW'
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
      return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n);
    else translateAttrs(n);
  }
}

/** The strings CSS draws inside the note, which cannot be translated in place. */
function paintCssStrings() {
  const root = document.documentElement.style;
  root.setProperty('--t-caption', JSON.stringify(t('Caption')));
  root.setProperty('--t-toggle', JSON.stringify(t('Toggle list')));
}

let observer = null;

function watch() {
  if (observer || typeof MutationObserver !== 'function') return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      const host = r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentElement;
      // Typing in the note is most of what this sees; it leaves at once.
      if (host && host.id !== 'editor' && host.closest?.('#editor')) continue;
      if (r.type === 'childList') r.addedNodes.forEach((n) => translateTree(n));
      else if (r.type === 'characterData') translateTree(r.target);
      else if (r.type === 'attributes') translateAttrs(r.target);
    }
  });
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS,
  });
}

/**
 * @param {string} code one of LANGUAGES
 */
export function setLang(code) {
  if (!CODES.includes(code)) return;
  lang = code;
  try { localStorage.setItem(KEY, code); } catch { /* this session only */ }
  apply();
}

function apply() {
  document.documentElement.lang = lang;
  paintCssStrings();
  translateTree(document.body);
  // Words in the chosen language are not flagged as misspelt (the main process
  // adds English beside it).
  void window.nebula?.spell?.language?.(lang)?.catch?.(() => {});
  emit('lang-changed', { lang });
}

/** Read the saved language, translate the page, and keep translating it. */
export function initI18n() {
  lang = read();
  apply();
  watch();
  return { get: getLang, set: setLang, t };
}

/**
 * The picker in the sidebar's foot. Closed, it is one line - the language in
 * use, right above the version (the owner, 0.9.3); open, the four languages
 * in a row the way the themes are, each in its own language.
 */
export function initLanguagePicker(root = document.getElementById('lang-pick')) {
  if (!root) return null;
  const row = root.querySelector('#lang-row');

  function paint() {
    for (const b of row?.querySelectorAll('[data-lang]') ?? []) {
      b.classList.toggle('on', b.dataset.lang === lang);
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    }
  }

  row?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    setLang(b.dataset.lang);
    paint();
  });
  paint();
  return { paint };
}
