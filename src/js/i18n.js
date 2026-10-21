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
  // A theme of one's own (0.9.4, theme-editor.js)
  'Your own theme': ['Dein eigenes Design', 'Twój własny motyw', 'Kendi temanız'],
  'Profile name': ['Profilname', 'Nazwa profilu', 'Profil adı'],
  'Save this profile': ['Dieses Profil speichern', 'Zapisz ten profil', 'Bu profili kaydet'],
  'Profiles': ['Profile', 'Profile', 'Profiller'],
  'Background': ['Hintergrund', 'Tło', 'Zemin'],
  'Sidebar and darkest tone': ['Seitenleiste und dunkelster Ton', 'Pasek boczny i najciemniejszy ton', 'Kenar çubuğu ve en koyu ton'],
  'Lines': ['Linien', 'Linie', 'Çizgiler'],
  'Accent': ['Akzent', 'Akcent', 'Vurgu'],
  'Any colour': ['Jede Farbe', 'Dowolny kolor', 'Herhangi bir renk'],
  'Colour code': ['Farbcode', 'Kod koloru', 'Renk kodu'],
  'Press the bar for any colour, or type a code.': ['Auf den Balken drücken für jede Farbe, oder einen Code eintippen.', 'Naciśnij pasek, aby wybrać dowolny kolor, albo wpisz kod.', 'Her renk için çubuğa basın ya da bir kod yazın.'],
  'These words are hard to read on this ground.': ['Diese Schrift ist auf diesem Grund schwer zu lesen.', 'Te słowa trudno przeczytać na tym tle.', 'Bu yazı bu zeminde zor okunuyor.'],
  'Last edited': ['Zuletzt bearbeitet', 'Ostatnio edytowany', 'Son düzenlenen'],
  'Delete this profile': ['Dieses Profil löschen', 'Usuń ten profil', 'Bu profili sil'],
  'Give the profile a name first': ['Gib dem Profil zuerst einen Namen', 'Najpierw nadaj profilowi nazwę', 'Önce profile bir ad verin'],
  'That is a ready profile — give yours another name': ['Das ist ein fertiges Profil — gib deinem einen anderen Namen', 'To gotowy profil — nadaj swojemu inną nazwę', 'Bu hazır bir profil — kendinizinkine başka bir ad verin'],
  'Profile saved': ['Profil gespeichert', 'Profil zapisany', 'Profil kaydedildi'],
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
  'Picture at the left': ['Bild links', 'Obraz po lewej', 'Resim solda'],
  'Picture in the middle': ['Bild in der Mitte', 'Obraz pośrodku', 'Resim ortada'],
  'Picture at the right': ['Bild rechts', 'Obraz po prawej', 'Resim sağda'],
  'Beside the picture before it': ['Neben das Bild davor', 'Obok poprzedniego obrazu', 'Önceki resmin yanına'],
  'In a line of words': ['In einer Textzeile', 'W wierszu tekstu', 'Yazı satırının içinde'],  'Drag the edges, then Enter to crop or Esc to cancel': ['Ränder ziehen, dann Enter zum Zuschneiden oder Esc zum Abbrechen', 'Przeciągnij krawędzie, potem Enter, aby przyciąć, lub Esc, aby anulować', 'Kenarları sürükleyin; kırpmak için Enter, vazgeçmek için Esc'],
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
  // Black holes (0.9.4): notes kept encrypted.
  'Black holes': ['Schwarze Löcher', 'Czarne dziury', 'Kara delikler'],
  'locked': ['gesperrt', 'zamknięta', 'kilitli'],
  'Lock': ['Sperren', 'Zamknij', 'Kilitle'],
  'Rename black hole': ['Schwarzes Loch umbenennen', 'Zmień nazwę czarnej dziury', 'Kara deliği yeniden adlandır'],
  'Change PIN': ['PIN ändern', 'Zmień PIN', 'PIN’i değiştir'],
  'Black hole moved to the trash': ['Schwarzes Loch in den Papierkorb gelegt', 'Czarna dziura przeniesiona do kosza', 'Kara delik çöp kutusuna taşındı'],
  'Black hole · empty': ['Schwarzes Loch · leer', 'Czarna dziura · pusta', 'Kara delik · boş'],
  'Black hole · 1 note': ['Schwarzes Loch · 1 Notiz', 'Czarna dziura · 1 notatka', 'Kara delik · 1 not'],
  'Delete for good?': ['Endgültig löschen?', 'Usunąć na dobre?', 'Kalıcı silinsin mi?'],
  // Pictures a note lost many of at once: asked about before they are deleted (held-media.js).
  'Pictures no longer shown': ['Nicht mehr gezeigte Bilder', 'Obrazy, których notatki już nie pokazują', 'Artık gösterilmeyen resimler'],
  'These notes no longer show pictures or videos they had, and they were not taken out in Nebula. Put them back in the note, or delete them for good. Nothing is deleted until you say so.': [
    'Diese Notizen zeigen Bilder oder Videos nicht mehr, die sie hatten, und sie wurden nicht in Nebula entfernt. Lege sie zurück in die Notiz oder lösche sie endgültig. Nichts wird gelöscht, bevor du es sagst.',
    'Te notatki nie pokazują już obrazów lub filmów, które miały, a nie usunięto ich w Nebula. Przywróć je do notatki albo usuń na dobre. Nic nie zostanie usunięte, dopóki tego nie potwierdzisz.',
    'Bu notlar, önceden içlerinde olan resimleri ya da videoları artık göstermiyor ve bunlar Nebula’da çıkarılmadı. Onları nota geri koyun ya da kalıcı olarak silin. Siz söyleyene kadar hiçbir şey silinmez.'],
  'Put back, they are added at the end of the note: you have to move them to where they were.': [
    'Zurückgelegt stehen sie am Ende der Notiz: Du musst sie an ihre alte Stelle schieben.',
    'Przywrócone trafiają na koniec notatki: musisz przenieść je na dawne miejsce.',
    'Geri konulanlar notun sonuna eklenir: onları eski yerlerine sizin taşımanız gerekir.'],
  'Put back in the note': ['Zurück in die Notiz', 'Przywróć do notatki', 'Nota geri koy'],
  'Put back at the end of the note. Move them to where they were.': [
    'Am Ende der Notiz wieder eingefügt. Schiebe sie an ihre alte Stelle.',
    'Przywrócono na końcu notatki. Przenieś je na dawne miejsce.',
    'Notun sonuna geri konuldu. Onları eski yerlerine taşıyın.'],
  '1 picture or video': ['1 Bild oder Video', '1 obraz lub film', '1 resim ya da video'],
  'Open the note': ['Notiz öffnen', 'Otwórz notatkę', 'Notu aç'],
  'Later': ['Später', 'Później', 'Sonra'],
  'New black hole': ['Neues schwarzes Loch', 'Nowa czarna dziura', 'Yeni kara delik'],
  'Recovery key': ['Wiederherstellungsschlüssel', 'Klucz odzyskiwania', 'Kurtarma anahtarı'],
  'I have written it down': ['Ich habe ihn notiert', 'Zapisałem go', 'Not ettim'],
  'Name': ['Name', 'Nazwa', 'Ad'],
  '6-digit PIN': ['6-stellige PIN', '6-cyfrowy PIN', '6 haneli PIN'],
  'Passkey': ['Passkey', 'Klucz dostępu', 'Geçiş anahtarı'],
  'Six digits.': ['Sechs Ziffern.', 'Sześć cyfr.', 'Altı hane.'],
  'Hint': ['Hinweis', 'Podpowiedź', 'İpucu'],
  'Hint (optional)': ['Hinweis (optional)', 'Podpowiedź (opcjonalnie)', 'İpucu (isteğe bağlı)'],
  'Shown when the PIN is asked for. Anyone can read it: a reminder, not the PIN.': ['Wird gezeigt, wenn nach der PIN gefragt wird. Jeder kann ihn lesen: eine Erinnerung, nicht die PIN.', 'Pokazywana, gdy aplikacja pyta o PIN. Każdy może ją przeczytać: przypomnienie, nie PIN.', 'PIN sorulduğunda gösterilir. Herkes okuyabilir: bir hatırlatma, PIN’in kendisi değil.'],
  'The hint must not give the PIN away.': ['Der Hinweis darf die PIN nicht verraten.', 'Podpowiedź nie może zdradzać PIN-u.', 'İpucu PIN’i ele vermemeli.'],
  'Add a hint': ['Hinweis hinzufügen', 'Dodaj podpowiedź', 'İpucu ekle'],
  'Change hint': ['Hinweis ändern', 'Zmień podpowiedź', 'İpucunu değiştir'],
  'Hint for the PIN — anyone can read it': ['Hinweis zur PIN — jeder kann ihn lesen', 'Podpowiedź do PIN-u — każdy może ją przeczytać', 'PIN için ipucu — herkes okuyabilir'],
  'Hint saved': ['Hinweis gespeichert', 'Podpowiedź zapisana', 'İpucu kaydedildi'],
  'Hint removed': ['Hinweis entfernt', 'Podpowiedź usunięta', 'İpucu kaldırıldı'],
  'The same PIN once more.': ['Dieselbe PIN noch einmal.', 'Ten sam PIN jeszcze raz.', 'Aynı PIN’i bir kez daha yazın.'],
  'Waiting for passkey…': ['Warte auf Passkey…', 'Czekam na klucz dostępu…', 'Geçiş anahtarı bekleniyor…'],
  'No passkey is set up on this computer.': ['Auf diesem Computer ist kein Passkey eingerichtet.', 'Na tym komputerze nie ma skonfigurowanego klucza dostępu.', 'Bu bilgisayarda geçiş anahtarı kurulu değil.'],
  'Secure storage is unavailable on this computer. Try again when it is available.': ['Sicherer Speicher ist auf diesem Computer nicht verfügbar. Versuche es erneut, sobald er verfügbar ist.', 'Bezpieczny magazyn nie jest dostępny na tym komputerze. Spróbuj ponownie, gdy będzie dostępny.', 'Bu bilgisayarda güvenli depolama kullanılamıyor. Kullanılabilir olduğunda yeniden deneyin.'],
  'This black hole has a file open. Close it and try again.': ['In diesem schwarzen Loch ist eine Datei geöffnet. Schließe sie und versuche es erneut.', 'W tej czarnej dziurze jest otwarty plik. Zamknij go i spróbuj ponownie.', 'Bu kara delikte açık bir dosya var. Dosyayı kapatıp yeniden deneyin.'],
  'This black hole uses an older key wrapper. Opening it with its PIN while secure storage is available will strengthen it.': ['Dieses schwarze Loch verwendet eine ältere Schlüsselhülle. Öffne es mit der PIN, sobald sicherer Speicher verfügbar ist, um sie zu stärken.', 'Ta czarna dziura używa starszej osłony klucza. Otwórz ją PIN-em, gdy bezpieczny magazyn będzie dostępny, aby ją wzmocnić.', 'Bu kara delik eski bir anahtar koruması kullanıyor. Güvenli depolama kullanılabilirken PIN ile açmak korumayı güçlendirir.'],
  'Some older backups could not be protected. Check the backup folder permissions.': ['Einige ältere Sicherungen konnten nicht geschützt werden. Prüfe die Berechtigungen des Sicherungsordners.', 'Nie udało się zabezpieczyć części starszych kopii zapasowych. Sprawdź uprawnienia folderu kopii.', 'Bazı eski yedekler korunamadı. Yedek klasörünün izinlerini kontrol edin.'],
  'Open this black hole': ['Dieses schwarze Loch öffnen', 'Otwórz tę czarną dziurę', 'Bu kara deliği aç'],
  'Show the black holes': ['Schwarze Löcher zeigen', 'Pokaż czarne dziury', 'Kara delikleri göster'],
  'Hide the black holes': ['Schwarze Löcher ausblenden', 'Ukryj czarne dziury', 'Kara delikleri gizle'],
  'Spelling': ['Rechtschreibung', 'Pisownia', 'Yazım denetimi'],
  'Words are checked in every language ticked here. Untick one and it is no longer corrected; with none ticked, nothing is.': ['Wörter werden in jeder hier angehakten Sprache geprüft. Nimm einer den Haken, und sie wird nicht mehr korrigiert; ist keine angehakt, wird nichts korrigiert.', 'Słowa są sprawdzane w każdym zaznaczonym tu języku. Odznacz język, a przestanie być poprawiany; gdy żaden nie jest zaznaczony, nic nie jest poprawiane.', 'Sözcükler burada işaretli her dilde denetlenir. Bir dilin işaretini kaldırırsan o dil artık düzeltilmez; hiçbiri işaretli değilse hiçbir şey düzeltilmez.'],
  'PIN again': ['PIN wiederholen', 'PIN ponownie', 'PIN (tekrar)'],
  'New PIN': ['Neue PIN', 'Nowy PIN', 'Yeni PIN'],
  'Create': ['Erstellen', 'Utwórz', 'Oluştur'],
  'Change': ['Ändern', 'Zmień', 'Değiştir'],
  'Use the recovery key': ['Wiederherstellungsschlüssel verwenden', 'Użyj klucza odzyskiwania', 'Kurtarma anahtarını kullan'],
  'Try again': ['Erneut versuchen', 'Spróbuj ponownie', 'Yeniden dene'],
  'Take out of the black hole': ['Aus dem schwarzen Loch nehmen', 'Wyjmij z czarnej dziury', 'Kara delikten çıkar'],
  'Move into a black hole': ['In ein schwarzes Loch verschieben', 'Przenieś do czarnej dziury', 'Kara deliğe taşı'],
  'Move to notes': ['Zu den Notizen verschieben', 'Przenieś do notatek', 'Notlara taşı'],
  'Current PIN': ['Aktuelle PIN', 'Obecny PIN', 'Mevcut PIN'],
  'The current PIN is needed — or the passkey.': ['Die aktuelle PIN wird gebraucht — oder der Passkey.', 'Potrzebny jest obecny PIN — albo klucz dostępu.', 'Mevcut PIN gerekir — ya da geçiş anahtarı.'],
  'Type the recovery key that was shown when this black hole was made, and a new PIN for it.': ['Gib den Wiederherstellungsschlüssel ein, der beim Anlegen dieses schwarzen Lochs gezeigt wurde, und eine neue PIN dafür.', 'Wpisz klucz odzyskiwania pokazany przy tworzeniu tej czarnej dziury oraz nowy PIN dla niej.', 'Bu kara delik oluşturulurken gösterilen kurtarma anahtarını ve onun için yeni bir PIN yazın.'],
  'Type the recovery key that was shown when this black hole was made.': ['Gib den Wiederherstellungsschlüssel ein, der beim Anlegen dieses schwarzen Lochs gezeigt wurde.', 'Wpisz klucz odzyskiwania pokazany przy tworzeniu tej czarnej dziury.', 'Bu kara delik oluşturulurken gösterilen kurtarma anahtarını yazın.'],
  'A PIN is six digits.': ['Eine PIN hat sechs Ziffern.', 'PIN to sześć cyfr.', 'PIN altı hanelidir.'],
  'The two PINs are not the same.': ['Die beiden PINs stimmen nicht überein.', 'PIN-y nie są takie same.', 'İki PIN aynı değil.'],
  'Give it a name.': ['Gib ihm einen Namen.', 'Nadaj jej nazwę.', 'Bir ad verin.'],
  'Wrong. One more try before a wait.': ['Falsch. Noch ein Versuch, dann heißt es warten.', 'Źle. Jeszcze jedna próba przed przerwą.', 'Yanlış. Beklemeden önce bir deneme daha.'],
  'This black hole was locked on another computer. Open it with its recovery key.': ['Dieses schwarze Loch wurde auf einem anderen Computer gesperrt. Öffne es mit seinem Wiederherstellungsschlüssel.', 'Ta czarna dziura została zamknięta na innym komputerze. Otwórz ją kluczem odzyskiwania.', 'Bu kara delik başka bir bilgisayarda kilitlenmiş. Kurtarma anahtarıyla açın.'],
  'Not confirmed.': ['Nicht bestätigt.', 'Nie potwierdzono.', 'Onaylanmadı.'],
  'The black hole is locked.': ['Das schwarze Loch ist gesperrt.', 'Czarna dziura jest zamknięta.', 'Kara delik kilitli.'],
  'That did not work.': ['Das hat nicht geklappt.', 'To się nie udało.', 'Olmadı.'],
  'That key does not open this black hole.': ['Dieser Schlüssel öffnet dieses schwarze Loch nicht.', 'Ten klucz nie otwiera tej czarnej dziury.', 'Bu anahtar bu kara deliği açmıyor.'],
  'Recovery key copied': ['Wiederherstellungsschlüssel kopiert', 'Skopiowano klucz odzyskiwania', 'Kurtarma anahtarı kopyalandı'],
  'PIN changed': ['PIN geändert', 'PIN zmieniony', 'PIN değiştirildi'],
  'Open the black hole first': ['Öffne zuerst das schwarze Loch', 'Najpierw otwórz czarną dziurę', 'Önce kara deliği açın'],
  'Could not save: the black hole stays open': ['Speichern fehlgeschlagen: Das schwarze Loch bleibt offen', 'Nie udało się zapisać: czarna dziura pozostaje otwarta', 'Kaydedilemedi: kara delik açık kalıyor'],
  'Sealing the video into the black hole…': ['Das Video wird im schwarzen Loch versiegelt…', 'Pieczętowanie wideo w czarnej dziurze…', 'Video kara deliğe mühürleniyor…'],
  'Sealing the note into the black hole…': ['Die Notiz wird im schwarzen Loch versiegelt…', 'Szyfrowanie notatki w czarnej dziurze…', 'Not kara deliğe şifreleniyor…'],
  'Note moved into the black hole': ['Notiz in das schwarze Loch verschoben', 'Notatka przeniesiona do czarnej dziury', 'Not kara deliğe taşındı'],
  'The video could not be sealed': ['Das Video konnte nicht versiegelt werden', 'Nie udało się zapieczętować wideo', 'Video mühürlenemedi'],
  'The video could not be taken out': ['Das Video konnte nicht herausgenommen werden', 'Nie udało się wyjąć wideo', 'Video çıkarılamadı'],
  'Take it out of its black hole first': ['Nimm sie zuerst aus ihrem schwarzen Loch', 'Najpierw wyjmij ją z jej czarnej dziury', 'Önce bulunduğu kara delikten çıkarın'],
  'Could not save: the note stays where it is': ['Speichern fehlgeschlagen: Die Notiz bleibt, wo sie ist', 'Nie udało się zapisać: notatka zostaje na miejscu', 'Kaydedilemedi: not yerinde kalıyor'],
  'Wait for the note to finish moving': ['Warte, bis die Notiz fertig verschoben ist', 'Poczekaj, aż przenoszenie notatki się zakończy', 'Notun taşınması bitene kadar bekleyin'],
  'Black hole actions': ['Aktionen für das schwarze Loch', 'Działania czarnej dziury', 'Kara delik işlemleri'],
  'Lock this black hole': ['Dieses schwarze Loch sperren', 'Zamknij tę czarną dziurę', 'Bu kara deliği kilitle'],
  'Clear session data': ['Sitzungsdaten löschen', 'Wyczyść dane sesji', 'Oturum verilerini temizle'],
  'Put to sleep': ['Schlafen legen', 'Uśpij', 'Uyut'],
  'Keep awake': ['Wach halten', 'Nie usypiaj', 'Uyanık tut'],
  'Let it sleep when unused': ['Bei Nichtgebrauch schlafen lassen', 'Usypiaj, gdy nieużywana', 'Kullanılmayınca uyusun'],
  'Asleep — it loads again when you open it': ['Schläft — lädt neu, wenn du sie öffnest', 'Uśpiona — wczyta się ponownie po otwarciu', 'Uyuyor — açtığınızda yeniden yüklenir'],
  'Clear': ['Löschen', 'Wyczyść', 'Temizle'],
  'Session data cleared': ['Sitzungsdaten gelöscht', 'Dane sesji wyczyszczone', 'Oturum verileri temizlendi'],
  'The session data could not be cleared': ['Die Sitzungsdaten konnten nicht gelöscht werden', 'Nie udało się wyczyścić danych sesji', 'Oturum verileri temizlenemedi'],
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
  // Projects (1.0.0)
  'New project': ['Neues Projekt', 'Nowy projekt', 'Yeni proje'],
  'Rename project': ['Projekt umbenennen', 'Zmień nazwę projektu', 'Projeyi yeniden adlandır'],
  'Delete project': ['Projekt löschen', 'Usuń projekt', 'Projeyi sil'],
  'Project actions': ['Projektaktionen', 'Działania projektu', 'Proje işlemleri'],
  'Add a folder': ['Ordner hinzufügen', 'Dodaj folder', 'Klasör ekle'],
  'Drag folders and notes here': ['Ordner und Notizen hierher ziehen', 'Przeciągnij tu foldery i notatki', 'Klasörleri ve notları buraya sürükle'],
  'Take out of the project': ['Aus dem Projekt nehmen', 'Wyjmij z projektu', 'Projeden çıkar'],
  'Delete the project? Its folders and notes stay, back in the list.': ['Das Projekt löschen? Seine Ordner und Notizen bleiben und kommen zurück in die Liste.', 'Usunąć projekt? Jego foldery i notatki zostaną i wrócą na listę.', 'Proje silinsin mi? Klasörleri ve notları kalır, listeye geri döner.'],
  // The map (1.0.0)
  'Universe': ['Universe', 'Universe', 'Universe'],
  'Universe — your notes as a galaxy': ['Universe — deine Notizen als Galaxie', 'Universe — twoje notatki jako galaktyka', 'Universe — notlarının galaksisi'],
  'Universe over the whole page': ['Universe über die ganze Seite', 'Universe na całą stronę', 'Universe tüm sayfada'],
  'Resize panes': ['Bereiche anpassen', 'Zmień rozmiar paneli', 'Bölmeleri boyutlandır'],
  'Drag to resize panes; double-click to make them equal': ['Ziehen, um die Bereiche anzupassen; Doppelklick macht sie gleich breit', 'Przeciągnij, aby zmienić rozmiar paneli; dwuklik wyrównuje je', 'Bölmeleri boyutlandırmak için sürükleyin; çift tıklayınca eşitlenir'],
  'Close Universe': ['Universe schließen', 'Zamknij Universe', 'Universe’ü kapat'],
  'Back to main space': ['Zurück in den Hauptraum', 'Powrót do głównej przestrzeni', 'Ana uzaya dön'],
  'Enter the black hole': ['In das Schwarze Loch', 'Wejdź do czarnej dziury', 'Kara deliğe gir'],
  'Locked': ['Gesperrt', 'Zablokowana', 'Kilitli'],
  'Show all of Universe': ['Das ganze Universe zeigen', 'Pokaż całe Universe', 'Universe’ün tamamını göster'],
  'Fit Universe': ['Universe einpassen', 'Dopasuj Universe', 'Universe’ü sığdır'],
  'Hide names': ['Namen ausblenden', 'Ukryj nazwy', 'İsimleri gizle'],
  'Show names': ['Namen einblenden', 'Pokaż nazwy', 'İsimleri göster'],
  'Search labels and mentions in Universe': ['Labels und Erwähnungen im Universe suchen', 'Szukaj etykiet i wzmianek w Universe', 'Universe’te etiket ve bahsetme ara'],
  'Labels and mentions…': ['Labels und Erwähnungen…', 'Etykiety i wzmianki…', 'Etiketler ve bahsetmeler…'],
  'Remove from the search': ['Aus der Suche nehmen', 'Usuń z wyszukiwania', 'Aramadan çıkar'],
  'No such label or mention in Universe': ['Kein solches Label und keine solche Erwähnung im Universe', 'Brak takiej etykiety ani wzmianki w Universe', 'Universe’te böyle bir etiket ya da bahsetme yok'],
  // What a body of the map is, in its list for screen readers
  'map: folder': ['Ordner', 'folder', 'klasör'],
  'map: note': ['Notiz', 'notatka', 'not'],
  'map: black hole': ['Schwarzes Loch', 'czarna dziura', 'kara delik'],
  'map: project': ['Projekt', 'projekt', 'proje'],
  'map: label': ['Label', 'etykieta', 'etiket'],
  'Pin to top': ['Oben anheften', 'Przypnij na górze', 'En üste sabitle'],
  'Open side by side': ['Daneben öffnen', 'Otwórz obok', 'Yan yana aç'],
  'Close this side': ['Diese Seite schließen', 'Zamknij tę stronę', 'Bu tarafı kapat'],
  'At most four notes side by side': ['Höchstens vier Notizen nebeneinander', 'Najwyżej cztery notatki obok siebie', 'Yan yana en fazla dört not'],
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
  // Headings that fold (0.9.4)
  'Toggle heading 1': ['Aufklapp-Überschrift 1', 'Rozwijany nagłówek 1', 'Açılır başlık 1'],
  'Toggle heading 2': ['Aufklapp-Überschrift 2', 'Rozwijany nagłówek 2', 'Açılır başlık 2'],
  'Toggle heading 3': ['Aufklapp-Überschrift 3', 'Rozwijany nagłówek 3', 'Açılır başlık 3'],
  'A big heading that folds away what is under it': ['Eine große Überschrift, die zuklappt, was unter ihr steht', 'Duży nagłówek, który zwija to, co pod nim', 'Altındakileri katlayan büyük bir başlık'],
  'A medium heading that folds away what is under it': ['Eine mittlere Überschrift, die zuklappt, was unter ihr steht', 'Średni nagłówek, który zwija to, co pod nim', 'Altındakileri katlayan orta bir başlık'],
  'A small heading that folds away what is under it': ['Eine kleine Überschrift, die zuklappt, was unter ihr steht', 'Mały nagłówek, który zwija to, co pod nim', 'Altındakileri katlayan küçük bir başlık'],
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
  // Widgets (1.0.0, widgets.js).
  'Widget': ['Widget', 'Widżet', 'Widget'],
  'Widgets': ['Widgets', 'Widżety', "Widget'lar"],
  'Add a widget': ['Widget hinzufügen', 'Dodaj widżet', 'Widget ekle'],
  'Calculator': ['Taschenrechner', 'Kalkulator', 'Hesap makinesi'],
  'Scientific calculator': ['Wissenschaftlicher Rechner', 'Kalkulator naukowy', 'Bilimsel hesap makinesi'],
  'Calendar': ['Kalender', 'Kalendarz', 'Takvim'],
  'Previous month': ['Voriger Monat', 'Poprzedni miesiąc', 'Önceki ay'],
  'Next month': ['Nächster Monat', 'Następny miesiąc', 'Sonraki ay'],
  'This month': ['Dieser Monat', 'Ten miesiąc', 'Bu ay'],
  'With widgets': ['Mit Widgets', 'Z widżetami', "Widget'larla"],
  'Without widgets': ['Ohne Widgets', 'Bez widżetów', "Widget'sız"],
  'Widgets printed as they are now': ['Widgets so gedruckt, wie sie jetzt sind', 'Widżety drukowane tak, jak wyglądają teraz', "Widget'lar şu anki halleriyle yazdırılır"],
  'Widgets left out of the page': ['Widgets bleiben weg', 'Widżety pominięte na stronie', "Widget'lar sayfaya konmaz"],
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
  // Tables (0.9.4)
  'Table': ['Tabelle', 'Tabela', 'Tablo'],
  'Merge': ['Verbinden', 'Scal', 'Birleştir'],
  'Unmerge': ['Trennen', 'Rozdziel', 'Ayır'],
  'Delete row': ['Zeile löschen', 'Usuń wiersz', 'Satırı sil'],
  'Delete rows': ['Zeilen löschen', 'Usuń wiersze', 'Satırları sil'],
  'Delete column': ['Spalte löschen', 'Usuń kolumnę', 'Sütunu sil'],
  'Delete columns': ['Spalten löschen', 'Usuń kolumny', 'Sütunları sil'],
  'Delete table': ['Tabelle löschen', 'Usuń tabelę', 'Tabloyu sil'],
  'Add a row': ['Zeile hinzufügen', 'Dodaj wiersz', 'Satır ekle'],
  'Add a column': ['Spalte hinzufügen', 'Dodaj kolumnę', 'Sütun ekle'],
  'Insert row above': ['Zeile darüber einfügen', 'Wstaw wiersz powyżej', 'Üste satır ekle'],
  'Insert row below': ['Zeile darunter einfügen', 'Wstaw wiersz poniżej', 'Alta satır ekle'],
  'Insert column left': ['Spalte links einfügen', 'Wstaw kolumnę z lewej', 'Sola sütun ekle'],
  'Insert column right': ['Spalte rechts einfügen', 'Wstaw kolumnę z prawej', 'Sağa sütun ekle'],
  'Drag to fill the cells beside': ['Ziehen, um die Zellen daneben zu füllen', 'Przeciągnij, aby wypełnić sąsiednie komórki', 'Yandaki hücreleri doldurmak için sürükleyin'],
  'Drag to move the table': ['Ziehen, um die Tabelle zu verschieben', 'Przeciągnij, aby przenieść tabelę', 'Tabloyu taşımak için sürükleyin'],
  'Rows': ['Zeilen', 'Wiersze', 'Satır'],
  'Columns': ['Spalten', 'Kolumny', 'Sütun'],
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
  'Serif': ['Serif', 'Szeryfowa', 'Serif'],
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
  // The font menu's search and "Add a font" (0.9.4)
  'Find a font': ['Schriftart suchen', 'Znajdź czcionkę', 'Yazı tipi bul'],
  'On this computer': ['Auf diesem Computer', 'Na tym komputerze', 'Bu bilgisayarda'],
  'No font matches': ['Keine passende Schriftart', 'Brak pasującej czcionki', 'Eşleşen yazı tipi yok'],
  '+ Add a font': ['+ Schriftart hinzufügen', '+ Dodaj czcionkę', '+ Yazı tipi ekle'],
  'Remove from the list': ['Aus der Liste entfernen', 'Usuń z listy', 'Listeden kaldır'],
  'That font is not on this computer, so it cannot be added': ['Diese Schriftart ist nicht auf diesem Computer und kann nicht hinzugefügt werden', 'Tej czcionki nie ma na tym komputerze, nie można jej dodać', 'Bu yazı tipi bu bilgisayarda yok, eklenemez'],
  'Pin to the top': ['Oben anheften', 'Przypnij na górze', 'En üste sabitle'],
  'Last used font': ['Zuletzt verwendete Schriftart', 'Ostatnio używana czcionka', 'Son kullanılan yazı tipi'],
  'Add to the list': ['Zur Liste hinzufügen', 'Dodaj do listy', 'Listeye ekle'],
  'Unpin': ['Lösen', 'Odepnij', 'Sabitlemeyi kaldır'],
  // The logo's editor in Settings (0.9.4, logo-editor.js)
  'Logo': ['Logo', 'Logo', 'Logo'],
  'Put a theme on it': ['Ein Design darauflegen', 'Nałóż na nie motyw', 'Üzerine bir tema giydirin'],
  'Nebula’s own': ['Standard von Nebula', 'Domyślne w Nebula', 'Nebula varsayılanı'],
  'Border': ['Rand', 'Obramowanie', 'Kenar'],
  'Moon': ['Mond', 'Księżyc', 'Ay'],
  'Moon’s shade': ['Schatten des Mondes', 'Cień księżyca', 'Ayın gölgesi'],
  'Star': ['Stern', 'Gwiazda', 'Yıldız'],
  'It is worn by this window, the taskbar and the shortcuts that start Nebula — on the desktop, in the Start menu, pinned to the taskbar. A program file itself keeps the icon it was built with: a shortcut to it wears the logo.': ['Es wird von diesem Fenster, der Taskleiste und den Verknüpfungen getragen, die Nebula starten — auf dem Desktop, im Startmenü, an die Taskleiste angeheftet. Eine Programmdatei selbst behält das Symbol, mit dem sie gebaut wurde: Eine Verknüpfung zu ihr trägt das Logo.', 'Noszą je to okno, pasek zadań i skróty uruchamiające Nebula — na pulpicie, w menu Start, przypięte do paska zadań. Sam plik programu zachowuje ikonę, z którą go zbudowano: logo nosi skrót do niego.', 'Bu pencere, görev çubuğu ve Nebula’yı başlatan kısayollar — masaüstünde, Başlat menüsünde, görev çubuğuna sabitlenmiş olanlar — bu logoyu taşır. Program dosyasının kendisi, yapıldığı simgeyle kalır: logoyu ona giden bir kısayol taşır.'],
  // Themes that are the logo's alone, and a shortcut that wears it (0.9.4)
  'Add a logo theme': ['Logo-Design hinzufügen', 'Dodaj motyw logo', 'Logo teması ekle'],
  'Name of the logo theme:': ['Name des Logo-Designs:', 'Nazwa motywu logo:', 'Logo temasının adı:'],
  'Give the logo theme a name': ['Gib dem Logo-Design einen Namen', 'Nadaj motywowi logo nazwę', 'Logo temasına bir ad verin'],
  'That name is taken — give it another': ['Der Name ist vergeben — gib ihm einen anderen', 'Ta nazwa jest zajęta — nadaj inną', 'Bu ad kullanılıyor — başka bir ad verin'],
  'Double-click to rename': ['Doppelklick zum Umbenennen', 'Kliknij dwukrotnie, aby zmienić nazwę', 'Yeniden adlandırmak için çift tıklayın'],
  'Put a shortcut on the desktop': ['Verknüpfung auf den Desktop legen', 'Umieść skrót na pulpicie', 'Masaüstüne kısayol koy'],
  'Another shortcut of that name is on the desktop': ['Auf dem Desktop liegt schon eine andere Verknüpfung dieses Namens', 'Na pulpicie jest już inny skrót o tej nazwie', 'Masaüstünde bu adda başka bir kısayol var'],
  'The shortcut could not be made': ['Die Verknüpfung konnte nicht angelegt werden', 'Nie udało się utworzyć skrótu', 'Kısayol oluşturulamadı'],
  'A shortcut with the logo is on the desktop': ['Eine Verknüpfung mit dem Logo liegt auf dem Desktop', 'Skrót z logo jest na pulpicie', 'Logolu bir kısayol masaüstünde'],
  'The shortcut on the desktop wears the logo': ['Die Verknüpfung auf dem Desktop trägt das Logo', 'Skrót na pulpicie nosi logo', 'Masaüstündeki kısayol logoyu taşıyor'],
  'The logo is worn in the desktop app.': ['Das Logo wird in der Desktop-App getragen.', 'Logo jest noszone w aplikacji na komputer.', 'Logo masaüstü uygulamasında kullanılır.'],
  'The logo could not be changed': ['Das Logo konnte nicht geändert werden', 'Nie udało się zmienić logo', 'Logo değiştirilemedi'],
  // Ready profiles of Your own theme can be deleted, and brought back (0.9.4)
  'Bring back the ready profiles': ['Fertige Profile zurückholen', 'Przywróć gotowe profile', 'Hazır profilleri geri getir'],
  // Black holes: a PIN always, a passkey beside it; its answer for deleting and for taking a note out (0.9.4)
  'Set a PIN': ['PIN festlegen', 'Ustaw PIN', 'PIN belirle'],
  'Delete the black hole': ['Schwarzes Loch löschen', 'Usuń czarną dziurę', 'Kara deliği sil'],
  'Black hole deleted': ['Schwarzes Loch gelöscht', 'Czarna dziura usunięta', 'Kara delik silindi'],
  'Notes in a black hole are kept encrypted. Opening it asks for its 6-digit PIN — or, if you add one, for a passkey: your fingerprint, face or the computer’s own PIN.': ['Notizen in einem schwarzen Loch werden verschlüsselt aufbewahrt. Zum Öffnen braucht es seine 6-stellige PIN — oder, wenn du einen hinzufügst, einen Passkey: deinen Fingerabdruck, dein Gesicht oder die PIN des Computers.', 'Notatki w czarnej dziurze są przechowywane w postaci zaszyfrowanej. Otwarcie wymaga jej 6-cyfrowego PIN-u — albo, jeśli go dodasz, klucza dostępu: odcisku palca, twarzy lub PIN-u komputera.', 'Kara delikteki notlar şifreli tutulur. Açmak için 6 haneli PIN’i gerekir — ya da eklerseniz bir geçiş anahtarı: parmak iziniz, yüzünüz ya da bilgisayarın kendi PIN’i.'],
  // Settings, beside Help (0.9.4, settings-panel.js)
  'Settings': ['Einstellungen', 'Ustawienia', 'Ayarlar'],
  'New notes': ['Neue Notizen', 'Nowe notatki', 'Yeni notlar'],
  'Text size': ['Schriftgröße', 'Rozmiar tekstu', 'Yazı boyutu'],
  'Page': ['Seite', 'Strona', 'Sayfa'],
  'A new note starts with these. The notes you have keep their own.': ['Eine neue Notiz beginnt damit. Die vorhandenen Notizen behalten ihre eigenen.', 'Nowa notatka zaczyna z tymi ustawieniami. Notatki, które już masz, zachowują własne.', 'Yeni bir not bunlarla başlar. Var olan notlarınız kendi ayarlarını korur.'],
  'Show and hide': ['Ein- und ausblenden', 'Pokazywanie i ukrywanie', 'Göster ve gizle'],
  'Hide the AI panel': ['KI-Bereich ausblenden', 'Ukryj panel AI', 'Yapay zekâ panelini gizle'],
  'Its button and its tabs are put away. Your sign-ins stay as they are.': ['Sein Knopf und seine Tabs werden weggeräumt. Deine Anmeldungen bleiben, wie sie sind.', 'Jego przycisk i karty znikają. Twoje logowania zostają bez zmian.', 'Düğmesi ve sekmeleri kaldırılır. Oturumlarınız olduğu gibi kalır.'],
  'Their section and their button leave the note list; open ones are locked first. Nothing is deleted, and they are back when this is turned off.': ['Ihr Abschnitt und ihr Knopf verschwinden aus der Notizliste; offene werden zuerst gesperrt. Nichts wird gelöscht, und sie sind wieder da, sobald dies ausgeschaltet wird.', 'Ich sekcja i przycisk znikają z listy notatek; otwarte są najpierw zamykane. Nic nie jest usuwane, a po wyłączeniu tej opcji wracają.', 'Bölümleri ve düğmeleri not listesinden kalkar; açık olanlar önce kilitlenir. Hiçbir şey silinmez; bu ayar kapatılınca geri gelirler.'],
  // The lock on opening (0.9.4, app-lock.js): a 6-digit PIN, a passkey beside it if wanted; off is not removed.
  'Lock on opening': ['Sperre beim Öffnen', 'Blokada przy otwieraniu', 'Açılışta kilit'],
  'Lock Nebula': ['Nebula sperren', 'Zablokuj Nebula', 'Nebula’yı kilitle'],
  'Lock Nebula now': ['Nebula jetzt sperren', 'Zablokuj Nebula teraz', 'Nebula’yı şimdi kilitle'],
  'The lock needs the desktop app.': ['Die Sperre braucht die Desktop-App.', 'Blokada wymaga aplikacji na komputer.', 'Kilit için masaüstü uygulaması gerekir.'],
  'Nebula opens without asking.': ['Nebula öffnet sich, ohne zu fragen.', 'Nebula otwiera się bez pytania.', 'Nebula sormadan açılır.'],
  'Set a lock': ['Sperre einrichten', 'Ustaw blokadę', 'Kilit kur'],
  'A 6-digit PIN locks Nebula: it is asked for each time the app opens.': ['Eine 6-stellige PIN sperrt Nebula: Sie wird bei jedem Öffnen der App abgefragt.', '6-cyfrowy PIN blokuje Nebula: aplikacja pyta o niego przy każdym otwarciu.', '6 haneli bir PIN Nebula’yı kilitler: uygulama her açılışta onu ister.'],
  'Also open with a passkey': ['Auch mit einem Passkey öffnen', 'Otwieraj też kluczem dostępu', 'Geçiş anahtarıyla da açılsın'],
  'Set the lock': ['Sperre setzen', 'Ustaw blokadę', 'Kilidi kur'],
  'Nebula asks for its PIN when it opens.': ['Nebula fragt beim Öffnen nach der PIN.', 'Nebula przy otwieraniu prosi o PIN.', 'Nebula açılırken PIN’ini ister.'],
  'Nebula asks for its PIN — or your passkey — when it opens.': ['Nebula fragt beim Öffnen nach der PIN — oder nach deinem Passkey.', 'Nebula przy otwieraniu prosi o PIN — albo o klucz dostępu.', 'Nebula açılırken PIN’ini — ya da geçiş anahtarınızı — ister.'],
  'Nebula asks for your passkey when it opens.': ['Nebula fragt beim Öffnen nach deinem Passkey.', 'Nebula przy otwieraniu prosi o klucz dostępu.', 'Nebula açılırken geçiş anahtarınızı ister.'],
  'The lock is turned off: Nebula opens without asking. Its PIN is kept.': ['Die Sperre ist ausgeschaltet: Nebula öffnet sich, ohne zu fragen. Die PIN bleibt erhalten.', 'Blokada jest wyłączona: Nebula otwiera się bez pytania. PIN jest zachowany.', 'Kilitleme kapalı: Nebula sormadan açılır. PIN’i saklanıyor.'],
  'Turn the lock off': ['Sperre ausschalten', 'Wyłącz blokadę', 'Kilitlemeyi kapat'],
  'Turn the lock on': ['Sperre einschalten', 'Włącz blokadę', 'Kilitlemeyi aç'],
  'Nebula will open without asking. The lock is kept, to be turned on again.': ['Nebula öffnet sich dann, ohne zu fragen. Die Sperre bleibt erhalten und kann wieder eingeschaltet werden.', 'Nebula będzie się otwierać bez pytania. Blokada zostaje i można ją włączyć ponownie.', 'Nebula sormadan açılacak. Kilit saklanır; yeniden açılabilir.'],
  'Add a passkey': ['Passkey hinzufügen', 'Dodaj klucz dostępu', 'Geçiş anahtarı ekle'],
  'Remove the passkey': ['Passkey entfernen', 'Usuń klucz dostępu', 'Geçiş anahtarını kaldır'],
  'New recovery key': ['Neuen Wiederherstellungsschlüssel', 'Nowy klucz odzyskiwania', 'Yeni kurtarma anahtarı'],
  'New key': ['Neuer Schlüssel', 'Nowy klucz', 'Yeni anahtar'],
  'The recovery key that was shown before stops working. Write the new one down and keep it somewhere safe.': ['Der vorher gezeigte Wiederherstellungsschlüssel funktioniert nicht mehr. Schreib den neuen auf und bewahr ihn sicher auf.', 'Wcześniej pokazany klucz odzyskiwania przestaje działać. Zapisz nowy i przechowuj go w bezpiecznym miejscu.', 'Daha önce gösterilen kurtarma anahtarı artık çalışmaz. Yenisini yazıp güvenli bir yerde saklayın.'],
  'Type the PIN, then confirm with the passkey. After that, either one opens Nebula.': ['Gib die PIN ein und bestätige dann mit dem Passkey. Danach öffnet jedes von beiden Nebula.', 'Wpisz PIN, a potem potwierdź kluczem dostępu. Odtąd jedno i drugie otwiera Nebula.', 'PIN’i yazın, sonra geçiş anahtarıyla onaylayın. Bundan sonra ikisi de Nebula’yı açar.'],
  'Remove lock': ['Sperre entfernen', 'Usuń blokadę', 'Kilidi kaldır'],
  'The lock is deleted: its PIN, its passkey and its recovery key are forgotten.': ['Die Sperre wird gelöscht: PIN, Passkey und Wiederherstellungsschlüssel werden vergessen.', 'Blokada zostaje usunięta: jej PIN, klucz dostępu i klucz odzyskiwania przepadają.', 'Kilit silinir: PIN’i, geçiş anahtarı ve kurtarma anahtarı unutulur.'],
  'Log in with passkey': ['Mit Passkey anmelden', 'Zaloguj się kluczem dostępu', 'Geçiş anahtarıyla giriş yap'],
  'Use the passkey': ['Passkey verwenden', 'Użyj klucza dostępu', 'Geçiş anahtarını kullan'],
  'The lock keeps the app shut on this computer. It does not encrypt the notes’ files — a black hole does that.': ['Die Sperre hält die App auf diesem Computer verschlossen. Sie verschlüsselt die Dateien der Notizen nicht — das tut ein schwarzes Loch.', 'Blokada trzyma aplikację zamkniętą na tym komputerze. Nie szyfruje plików notatek — to robi czarna dziura.', 'Kilit, uygulamayı bu bilgisayarda kapalı tutar. Notların dosyalarını şifrelemez — bunu kara delik yapar.'],
  'Write this key down and keep it somewhere safe. It opens Nebula when the PIN is forgotten. It is shown only now.': ['Schreib dir diesen Schlüssel auf und bewahre ihn sicher auf. Er öffnet Nebula, wenn die PIN vergessen ist. Er wird nur jetzt gezeigt.', 'Zapisz ten klucz i przechowuj go w bezpiecznym miejscu. Otwiera Nebula, gdy zapomnisz PIN-u. Jest pokazywany tylko teraz.', 'Bu anahtarı bir yere yazın ve güvenli bir yerde saklayın. PIN unutulduğunda Nebula’yı açar. Yalnızca şimdi gösterilir.'],
  'The lock is on': ['Die Sperre ist an', 'Blokada jest włączona', 'Kilitleme açık'],
  'The lock is off': ['Die Sperre ist aus', 'Blokada jest wyłączona', 'Kilitleme kapalı'],
  'Lock removed': ['Sperre entfernt', 'Blokada usunięta', 'Kilit kaldırıldı'],
  'Passkey added': ['Passkey hinzugefügt', 'Dodano klucz dostępu', 'Geçiş anahtarı eklendi'],
  'Passkey removed': ['Passkey entfernt', 'Usunięto klucz dostępu', 'Geçiş anahtarı kaldırıldı'],
  'Could not save: Nebula stays open': ['Speichern fehlgeschlagen: Nebula bleibt offen', 'Nie udało się zapisać: Nebula pozostaje otwarta', 'Kaydedilemedi: Nebula açık kalıyor'],
  'The lock was removed — set a new one in Settings': ['Die Sperre wurde entfernt — richte in den Einstellungen eine neue ein', 'Blokada została usunięta — ustaw nową w Ustawieniach', 'Kilit kaldırıldı — Ayarlar’dan yenisini kurun'],
  'Nebula is locked': ['Nebula ist gesperrt', 'Nebula jest zablokowana', 'Nebula kilitli'],
  'Type the recovery key that was shown when the lock was set. It opens Nebula and removes the lock — set a new one in Settings.': ['Gib den Wiederherstellungsschlüssel ein, der beim Setzen der Sperre gezeigt wurde. Er öffnet Nebula und entfernt die Sperre — richte in den Einstellungen eine neue ein.', 'Wpisz klucz odzyskiwania pokazany przy ustawianiu blokady. Otwiera Nebula i usuwa blokadę — nową ustaw w Ustawieniach.', 'Kilit kurulurken gösterilen kurtarma anahtarını yazın. Nebula’yı açar ve kilidi kaldırır — yenisini Ayarlar’dan kurun.'],
  'That key does not open Nebula.': ['Dieser Schlüssel öffnet Nebula nicht.', 'Ten klucz nie otwiera Nebula.', 'Bu anahtar Nebula’yı açmıyor.'],
  'Back': ['Zurück', 'Wstecz', 'Geri'],
  // The label bar's steps (0.9.4)
  'Previous': ['Vorheriger', 'Poprzedni', 'Önceki'],
  'Next': ['Nächster', 'Następny', 'Sonraki'],
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
  // Every block's grip (1.0.0, block-handle.js).
  'Drag to move · click to select': ['Ziehen zum Verschieben · klicken zum Auswählen', 'Przeciągnij, aby przenieść · kliknij, aby zaznaczyć', 'Taşımak için sürükle · seçmek için tıkla'],
  'A line with a checkbox; the button toggles it back': ['Eine Zeile mit Kontrollkästchen; die Schaltfläche macht sie wieder normal', 'Linia z polem wyboru; przycisk przywraca zwykły tekst', 'Onay kutulu bir satır; düğme onu geri çevirir'],
  'Indented quote': ['Eingerücktes Zitat', 'Wcięty cytat', 'Girintili alıntı'],
  'Code block with a language picker and colours': ['Codeblock mit Sprachauswahl und Farben', 'Blok kodu z wyborem języka i kolorami', 'Dil seçicili ve renkli kod bloğu'],
  'A horizontal rule': ['Eine waagerechte Linie', 'Pozioma linia', 'Yatay bir çizgi'],
  'A table: cells to write in, colour, merge and fill': ['Eine Tabelle: Zellen zum Schreiben, Färben, Verbinden und Ausfüllen', 'Tabela: komórki do pisania, kolorowania, scalania i wypełniania', 'Tablo: yazılacak, renklendirilecek, birleştirilecek ve doldurulacak hücreler'],
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
  'Copy widget': ['Widget kopieren', 'Kopiuj widżet', 'Widget’ı kopyala'],
  'Delete widget': ['Widget löschen', 'Usuń widżet', 'Widget’ı sil'],
  'Add caption': ['Bildunterschrift hinzufügen', 'Dodaj podpis', 'Alt yazı ekle'],
  'Edit caption': ['Bildunterschrift bearbeiten', 'Edytuj podpis', 'Alt yazıyı düzenle'],
  'Picture copied': ['Bild kopiert', 'Obraz skopiowany', 'Resim kopyalandı'],
  'Copying the video into the note…': ['Video wird in die Notiz kopiert…', 'Kopiowanie wideo do notatki…', 'Video nota kopyalanıyor…'],
  'Video added': ['Video hinzugefügt', 'Dodano wideo', 'Video eklendi'],
  'Video': ['Video', 'Wideo', 'Video'],
  'This kind of video cannot be played here.': ['Diese Art von Video kann hier nicht abgespielt werden.', 'Tego rodzaju wideo nie da się tutaj odtworzyć.', 'Bu tür video burada oynatılamıyor.'],
  'Open in another program': ['In einem anderen Programm öffnen', 'Otwórz w innym programie', 'Başka bir programda aç'],
  'The video could not be added': ['Das Video konnte nicht hinzugefügt werden', 'Nie udało się dodać wideo', 'Video eklenemedi'],
  'Remove video': ['Video entfernen', 'Usuń wideo', 'Videoyu kaldır'],
  'Save a copy': ['Kopie speichern', 'Zapisz kopię', 'Kopyasını kaydet'],
  'Open a copy with its own program': ['Eine Kopie mit dem passenden Programm öffnen', 'Otwórz kopię w jej własnym programie', 'Bir kopyasını kendi programıyla aç'],
  'Save a copy of the file on the computer': ['Eine Kopie der Datei auf dem Computer speichern', 'Zapisz kopię pliku na komputerze', 'Dosyanın bir kopyasını bilgisayara kaydet'],
  'Remove file': ['Datei entfernen', 'Usuń plik', 'Dosyayı kaldır'],
  'Copying the file into the note…': ['Datei wird in die Notiz kopiert…', 'Kopiowanie pliku do notatki…', 'Dosya nota kopyalanıyor…'],
  'Copying the files into the note…': ['Dateien werden in die Notiz kopiert…', 'Kopiowanie plików do notatki…', 'Dosyalar nota kopyalanıyor…'],
  'File added': ['Datei hinzugefügt', 'Dodano plik', 'Dosya eklendi'],
  'Files added': ['Dateien hinzugefügt', 'Dodano pliki', 'Dosyalar eklendi'],
  'The file could not be added': ['Die Datei konnte nicht hinzugefügt werden', 'Nie udało się dodać pliku', 'Dosya eklenemedi'],
  'The files could not be added': ['Die Dateien konnten nicht hinzugefügt werden', 'Nie udało się dodać plików', 'Dosyalar eklenemedi'],
  'Some files could not be added': ['Einige Dateien konnten nicht hinzugefügt werden', 'Nie udało się dodać niektórych plików', 'Bazı dosyalar eklenemedi'],
  'Saved a copy of the file': ['Kopie der Datei gespeichert', 'Zapisano kopię pliku', 'Dosyanın kopyası kaydedildi'],
  'Opened a copy of the file': ['Kopie der Datei geöffnet', 'Otwarto kopię pliku', 'Dosyanın kopyası açıldı'],
  'The file could not be saved': ['Die Datei konnte nicht gespeichert werden', 'Nie udało się zapisać pliku', 'Dosya kaydedilemedi'],
  'The file could not be opened': ['Die Datei konnte nicht geöffnet werden', 'Nie udało się otworzyć pliku', 'Dosya açılamadı'],
  'The file is not in this note': ['Die Datei ist nicht in dieser Notiz', 'Tego pliku nie ma w tej notatce', 'Dosya bu notta değil'],
  'Attach files': ['Dateien anhängen', 'Dołącz pliki', 'Dosya ekle'],
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
  // 0.9.4: Ignore, and the two ways to paste
  'Ignore': ['Ignorieren', 'Ignoruj', 'Yoksay'],
  'Paste as Nebula format': ['Im Nebula-Format einfügen', 'Wklej w formacie Nebula', 'Nebula biçiminde yapıştır'],
  'Paste original format': ['Mit Originalformat einfügen', 'Wklej z oryginalnym formatem', 'Özgün biçimiyle yapıştır'],
  'Add a note': ['Notiz hinzufügen', 'Dodaj notatkę', 'Not ekle'],
  'Text bigger and smaller': ['Text größer und kleiner', 'Większy i mniejszy tekst', 'Metni büyüt ve küçült'],
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
  // Black holes (0.9.4).
  [/^Open “(.+)”$/, ['„$1“ öffnen', 'Otwórz „$1”', '“$1” kara deliğini aç']],
  [/^New PIN for “(.+)”$/, ['Neue PIN für „$1“', 'Nowy PIN dla „$1”', '“$1” için yeni PIN']],
  [/^Write this key down and keep it somewhere safe\. It opens “(.+)” on another computer, after Windows is installed again, or when the PIN is forgotten\. It is shown only now\.$/, ['Schreib dir diesen Schlüssel auf und bewahre ihn sicher auf. Er öffnet „$1“ auf einem anderen Computer, nach einer Neuinstallation von Windows oder wenn die PIN vergessen ist. Er wird nur jetzt gezeigt.', 'Zapisz ten klucz i przechowuj go w bezpiecznym miejscu. Otwiera „$1” na innym komputerze, po ponownej instalacji Windows albo gdy zapomnisz PIN-u. Jest pokazywany tylko teraz.', 'Bu anahtarı bir yere yazın ve güvenli bir yerde saklayın. “$1” kara deliğini başka bir bilgisayarda, Windows yeniden kurulduktan sonra ya da PIN unutulduğunda açar. Yalnızca şimdi gösterilir.']],
  [/^Wrong\. Wait (.+) before the next try\.$/, ['Falsch. Warte $1 bis zum nächsten Versuch.', 'Źle. Odczekaj $1 przed następną próbą.', 'Yanlış. Sonraki denemeden önce $1 bekleyin.']],
  [/^Wrong\. (\d+) more tries before a wait\.$/, ['Falsch. Noch $1 Versuche, dann heißt es warten.', 'Źle. Jeszcze $1 próby przed przerwą.', 'Yanlış. Beklemeden önce $1 deneme daha.']],
  [/^Too many wrong tries\. Wait (.+)\.$/, ['Zu viele falsche Versuche. Warte $1.', 'Za dużo błędnych prób. Odczekaj $1.', 'Çok fazla yanlış deneme. $1 bekleyin.']],
  [/^Waiting for (.+)…$/, ['Warte auf $1…', 'Czekam na $1…', '$1 bekleniyor…']],
  [/^Black hole · (\d+) notes$/, ['Schwarzes Loch · $1 Notizen', 'Czarna dziura · notatki: $1', 'Kara delik · $1 not']],
  [/^(\d+) notes of this black hole could not be read$/, ['$1 Notizen dieses schwarzen Lochs konnten nicht gelesen werden', 'Nie udało się odczytać notatek tej czarnej dziury: $1', 'Bu kara deliğin $1 notu okunamadı']],
  [/^Videos in the folder “(.+)” beside the note: (\d+)\. Keep the folder with the file\.$/, ['Videos im Ordner „$1“ neben der Notiz: $2. Bewahre den Ordner bei der Datei auf.', 'Wideo w folderze „$1” obok notatki: $2. Trzymaj folder razem z plikiem.', 'Notun yanındaki “$1” klasöründeki videolar: $2. Klasörü dosyayla birlikte tutun.']],
  [/^Videos that could not be taken along: (\d+)$/, ['Videos, die nicht mitgenommen werden konnten: $1', 'Wideo, których nie udało się zabrać: $1', 'Birlikte götürülemeyen videolar: $1']],
  [/^Delete the profile (.+)\?$/, ['Das Profil $1 löschen?', 'Usunąć profil $1?', '$1 profili silinsin mi?']],
  [/^The note leaves “(.+)” and is kept as an ordinary note again, not encrypted\.$/, ['Die Notiz verlässt „$1“ und wird wieder als gewöhnliche Notiz aufbewahrt, unverschlüsselt.', 'Notatka opuszcza „$1” i znów jest zwykłą notatką, niezaszyfrowaną.', 'Not “$1” kara deliğinden çıkar ve yeniden sıradan, şifresiz bir not olarak tutulur.']],
  [/^“(.+)” and every note in it are deleted for good\. Nothing brings them back\.$/, ['„$1“ und jede Notiz darin werden endgültig gelöscht. Nichts bringt sie zurück.', '„$1” i każda notatka w niej zostają usunięte na dobre. Nic ich nie przywróci.', '“$1” ve içindeki bütün notlar kalıcı olarak silinir. Hiçbir şey onları geri getirmez.']],
  // Settings: what "Nebula's own" is, said beside it — the font's name, the size.
  [/^Nebula’s own \((.+)\)$/, ['Standard von Nebula ($1)', 'Domyślne w Nebula ($1)', 'Nebula varsayılanı ($1)']],
  [/^\+ Add “(.+)”$/, ['+ „$1“ hinzufügen', '+ Dodaj „$1”', '+ “$1” ekle']],
  // An AI tab's right-click menu asks first (0.9.4).
  [/^Clear the session data of (.+)\? You will be signed out of it here\.$/, ['Die Sitzungsdaten von $1 löschen? Die Anmeldung dort geht hier verloren.', 'Wyczyścić dane sesji $1? Wylogujesz się z niej tutaj.', '$1 oturum verileri temizlensin mi? Buradaki oturumunuz kapanır.']],
  [/^Delete (.+) from the panel\?$/, ['$1 aus dem Panel löschen?', 'Usunąć $1 z panelu?', '$1 panelden silinsin mi?']],
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
  [/^(\d+) pictures and videos$/, ['$1 Bilder und Videos', 'Obrazy i filmy: $1', '$1 resim ve video']],
  [/^Your latest changes could not be saved\. The note would have been saved without (\d+) of the pictures or videos it shows, so nothing was written\. Open the note again\.\s*$/, [
    'Die letzten Änderungen konnten nicht gespeichert werden. Die Notiz wäre ohne $1 der Bilder oder Videos gespeichert worden, die sie zeigt; deshalb wurde nichts geschrieben. Öffne die Notiz erneut. ',
    'Nie udało się zapisać ostatnich zmian. Notatka zostałaby zapisana bez $1 z obrazów lub filmów, które pokazuje, więc nic nie zapisano. Otwórz notatkę ponownie. ',
    'Son değişiklikler kaydedilemedi. Not, gösterdiği resim ya da videolardan $1 tanesi olmadan kaydedilecekti; bu yüzden hiçbir şey yazılmadı. Notu yeniden açın. ']],
  [/^Your latest changes could not be saved\. This note did not open whole — (\d+) of its pictures or videos are missing here — so nothing is written over it\. Open the note again\.\s*$/, [
    'Die letzten Änderungen konnten nicht gespeichert werden. Diese Notiz wurde nicht vollständig geöffnet — $1 ihrer Bilder oder Videos fehlen hier —, deshalb wird nichts über sie geschrieben. Öffne die Notiz erneut. ',
    'Nie udało się zapisać ostatnich zmian. Ta notatka nie otworzyła się w całości — brakuje tu $1 z jej obrazów lub filmów — więc nic nie zostanie na niej zapisane. Otwórz notatkę ponownie. ',
    'Son değişiklikler kaydedilemedi. Bu not bütünüyle açılmadı — resim ya da videolarından $1 tanesi burada eksik — bu yüzden üzerine hiçbir şey yazılmıyor. Notu yeniden açın. ']],
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
