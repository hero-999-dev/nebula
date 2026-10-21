# Nebula Test — 1.0.0 elle yapılacak testler

Yalnızca proje kökündeki **Nebula Test.exe** ile deneyin (notları `Nebula-data` içinde). Kurulu Nebula'yı ve gerçek notları katmayın; uydurma notlar kullanın.

Her satırı **Geçti / Kaldı** ve kısa açıklamayla işaretleyin. Kalan bir satırı, ne yaptığınızı adım adım yazarak bildirin.

## 1. Widget'lar

- [ ] Boş bir satıra `/widget` yazıp Enter'a basın. Hesap makinesi, Bilimsel hesap makinesi ve Takvim, Nebula ikonlarıyla çıkmalı. Oklar ve Enter seçmeli; fareyle tıklamak da seçmeli.
- [ ] Esc seçiciyi kapatmalı; hiçbir şey eklenmemeli ve imleç aynı satırda kalmalı.
- [ ] **Doğru satır:** uzun bir notta ortadaki bir satırın sonuna ` /widget` yazın. Widget tam o satırın altına gelmeli, başka bir yere gitmemeli. Boş bir satırda o satırın yerine geçmeli.
- [ ] **Resimden sonra:** bir satıra resim yapıştırın (Ctrl+V), sonra başka bir satırda `/widget` yazın. Widget resmin yanına değil, yazdığınız satıra gelmeli.
- [ ] Sütunlu bir sayfada (divider ile bölünmüş) sol ve sağ sütunda `/widget` deneyin. Widget yazdığınız sütunda kalmalı.
- [ ] Toggle'ın içinde `/widget` deneyin. Widget toggle'ın içinde kalmalı; toggle kapanınca gizlenmeli.
- [ ] Hesap makinesinde fareyle `12 × 3 =` → **36** göstermeli.
- [ ] Widget seçiliyken klavyeden `+ 4` ve Enter → **40** göstermeli; notun içine hiçbir şey yazılmamalı.
- [ ] C temizlemeli, ⌫ son tuşu geri almalı. `1 ÷ 0 =` → **Error** göstermeli.
- [ ] Ctrl+Z basılan tuşları geri almalı.
- [ ] Bilimsel hesap makinesi:
  - `sin(30)` → 0.5 ve `√9` → 3 olmalı.
  - DEG/RAD geçişinden sonra `sin(π÷2)` → 1 olmalı.
  - `5!` → 120 olmalı.
  - `2π` çarpım olarak hesaplanmalı.
  - Kapanmamış parantez kendiliğinden kapanmalı: `(1+2` → 3.
- [ ] Takvim:
  - Bu ay açılmalı ve bugün halka içinde görünmeli.
  - ‹ ve › ayları değiştirmeli; ay adına tıklamak bu aya döndürmeli.
  - Bir güne tıklamak o günü işaretlemeli, tekrar tıklamak işareti kaldırmalı.
- [ ] Köşesinden çekince widget büyüyüp küçülmeli; rakamlar da onunla büyümeli ve şekli bozulmamalı.
- [ ] **Orantılı küçülme:** widget'ı çok küçültün. Kenar boşlukları, tuşlar ve tuş araları aynı oranda küçülmeli; küçük widget'ta boşluklar geniş kalmamalı. "Buraya bak düzelme olmamis" notundaki dört hesap makinesi aynı görünmeli, yalnız boyları farklı olmalı.
- [ ] Widget çubuğundan **metnin önüne** alın; fotoğraf gibi sürüklenebilmeli. **Metnin arkasına** alınca yazının altında kalmalı. **Metnin içine** alınca satırlarla birlikte akmalı. Bunların hepsinden sonra tuşlar hâlâ çalışmalı.
- [ ] Notu kapatıp yeniden açın, sonra uygulamayı da yeniden başlatın. Son sonuç, ay, işaretli günler, DEG/RAD ayarı ve boyut korunmalı.
- [ ] **Yazdır** ve **PDF olarak dışa aktar** önizlemesinde **With widgets / Without widgets** seçeneği olmalı. "Without" seçilince widget'lar çıktıda olmamalı, "With" seçilince olmalı. Notta widget yoksa bu seçenek görünmemeli.
- [ ] Dışa aktar menüsünde **Widgets: With / Without** olmalı; HTML/Word çıktısı seçime uymalı. Seçim bir sonraki açılışta hatırlanmalı.
- [ ] **Sağ tık:** widget'a sağ tıklayınca yalnızca **Copy widget** ve **Delete widget** çıkmalı; "Copy image", "Add caption", "Delete image" çıkmamalı. Copy widget ile kopyalanan widget yapıştırılabilmeli.
- [ ] Widget seçiliyken **Delete** widget'ı silmeli. Hesap makinesinde **Backspace** silmemeli, ⌫ tuşu gibi çalışmalı. Ctrl+Z silinen widget'ı geri getirmeli.
- [ ] Widget'ı kopyalayıp (Ctrl+C) başka bir yere yapıştırın; aynı içerikle gelmeli.
- [ ] Koyu ve açık temada ve farklı temalarda widget renkleri okunaklı olmalı.

## 2. Taşıma tutamağı (üç nokta)

- [ ] Fareyi bir satırın üzerine getirin. Solunda **üç dikey nokta** çıkmalı (eskiden altıydı) ve daha dar olmalı.
- [ ] Divider ile bölünmüş sayfada fareyi **sağ sütundaki** satırlara getirin. Noktalar divider çizgisinin üstüne veya soluna taşmamalı; çizgi ile yazı arasında durmalı.
- [ ] **Otomatik divider yok:** bir bloğu noktalardan tutup başka bir satırın sağ ya da sol kenarına bırakın. Yeni sütun ve divider açılmamalı; blok o satırın altına ya da üstüne gelmeli. Divider ile yapılmış sütunların içine taşımak hâlâ çalışmalı.
- [ ] Noktalardan tutup sürükleyince blok taşınmalı. Noktalara tıklayınca blok seçilmeli; Ctrl+C, Ctrl+X, Ctrl+D ve Delete çalışmalı.
- [ ] Divider'ı sürüklemek hâlâ çalışmalı; noktalar buna engel olmamalı.

## 3. Kara delikler

Önce `docs/BLACKHOLE-TESTS.md` dosyasındaki listenin tamamını yapın. Yeni olanlar:

- [ ] Kilitli bir kara delik listede, "Move into a black hole" listesinde ve PIN penceresinin başlığında yalnızca **baş harfleriyle** görünmeli ("Gizli Kasa" → "GK"). Açınca tam adı geri gelmeli.
- [ ] İki kara delik yapın ve alttakine ⋯ → **En üste sabitle** deyin. Listenin en üstüne değil, **Black holes bölümünün** en üstüne çıkmalı (notlardaki sabitleme gibi), yanında raptiye görünmeli; kilitleyip açınca ve yeniden başlatınca yerinde kalmalı. **Sabitlemeyi kaldır** eski sırasına döndürmeli.

## 4. Diğer düzeltmeler

- [ ] Toggle'ın içine eklenen embed ve yer imi (bookmark) toggle'ın dışına çıkmamalı; toggle kapanınca gizlenmeli.
- [ ] Ayarlar'da yazı tipi kısmında yalnızca seçilen yazı tipi ve boyut sayısı görünmeli.
- [ ] Tabloda ok tuşları hücreler arasında gezmeli: satır sonunda → bir sonraki hücreye, ↑ ve ↓ üst ve alt hücreye geçmeli.
- [ ] Bir URL yapıştırın; notun yazı tipinde kalmalı, serife dönmemeli.
- [ ] Başka bir yerden 5 link birden kopyalayıp yapıştırın; Nebula biçimini korumalı.
- [ ] Sayfanın boş yerlerinde fare imleci doğru görünmeli (yazı imleci ya da ok, yerine göre).
- [ ] **Sütunda liste + Tab:** divider ile bölünmüş bir sayfada bir sütundaki madde işaretli satırda Tab'a basın. Satır içeri girmeli; yanındaki sütun ve divider yerinde kalmalı ("Ideas" notundaki durum).
- [ ] **Girintili satırda Backspace:** widget'ın altındaki girintili bir satırın başında Backspace'e basın. Önce girinti bir adım azalmalı; widget seçilmemeli. Girinti bitince Backspace yukarıdaki widget'ı seçmeli.
- [ ] **Uzun yazının üstüne divider:** bir sütunda satır boyunca uzanan bir yazı (ya da widget ve altında yazı) varken divider'ı sütunun sol kısmına bırakın. Yazı solda kalmalı, sağa kaymamalı; yeni boş sütun sağda açılmalı.
- [ ] **Divider'ı yazının sağına bırakmak:** bir sütunda kısa bir yazı varken divider'ı yazının sağına sürükleyip bırakın. Yazı solda, olduğu yerde kalmalı; yeni boş sütun sağında açılmalı.
- [ ] **Divider sürükleme:** hata tam olarak tekrarlanamadı. Hâlâ oluyorsa adımları yazın: hangi notta, kaç divider vardı, nereden nereye çektiniz, ne oldu.

## 4b. Notlar yan yana

- [ ] Bir not açıkken listeden başka bir notu sayfanın sağ yarısına sürükleyip bırakın. Ekran ikiye eşit bölünmeli, yeni not sağda açılmalı; not başlığı sayfaya yazı olarak eklenmemeli.
- [ ] Üçüncü ve dördüncü notu sürükleyin: ekran üçe, sonra dörde eşit bölünmeli. Bir bölmenin sol yarısına bırakılan not onun soluna gelmeli.
- [ ] Beşinci notu sürükleyin: "Yan yana en fazla dört not" uyarısı çıkmalı, yeni bölme açılmamalı.
- [ ] Üst başlık bölünmeli: her bölmenin kendi başlığı, sayfa adı (NW, A4…) ve ✕ düğmesi olmalı. Düzenleme çubuğu ve AI paneli tek kalmalı, tıkladığınız not için çalışmalı.
- [ ] Başka bir bölmeye tıklayın: imleç tıkladığınız yere gelmeli, yazdıklarınız o nota kaydedilmeli; öbür bölmedeki yazı kaybolmamalı.
- [ ] Bir notun ⋯ menüsünde **Yan yana aç** olmalı ve notu sağa açmalı; dört bölme doluyken bu madde görünmemeli.
- [ ] NW bir notun yanına A4 bir not ekleyin: A4 not NW görünmeli. Bölmeyi kapatınca kendi A4 sayfasıyla açılmalı (kayıtlı sayfası değişmemeli).
- [ ] Listeden bir nota tıklayınca, yazdığınız bölmenin yerine o not gelmeli. ✕ ile tek not kalana kadar kapatın: başlık eski yerine dönmeli, sayfa bütün olmalı.

## 5. Genel

- [ ] Rehberdeki (Welcome to Nebula Guide) "1.0.0 ile gelenler" bölümünde widget'lar, kara delik ve "Notlar yan yana" paragrafları Türkçe görünmeli; dili Deutsch veya Polski yapınca o dilde görünmeli.
- [ ] "What's new" penceresinde 1.0.0 notlarında Widget'lar, Kara delikler, Notlar yan yana, Ayarlar ve Düzeltmeler maddeleri olmalı.
