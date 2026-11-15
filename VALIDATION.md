# Mobil gezinme, giriş geçişi ve rapor soruları

15 Kasım 2026. Kaynak: `badgalnurkan/badgalnurkan`, başlangıç commit'i `3203c955caf66b583c025c8937b886972c1ce6d3`.

## Son davranış

- Mobilde kaydırılabilir, kaydırırken görünür kalan menü; altı bölüme erişen ayrı menü penceresi; klavye odağı, Escape ile kapatma ve en az 44 px menü hedefleri.
- Küçük ekranda başlık, tarih, dil ve profil alanları ayrılır. Yatay telefonda başlık tek satırlı, daha kısa bir düzene geçer.
- Hızlı menü tıklamaları önceki geçişi iptal eder. Dikey kaydırma, metin seçme, form alanları, çoklu dokunma ve ekran kenarı hareketleri sayfa kaydırması olarak yorumlanmaz.
- Yeni görev ekleme düğmesi ve Enter sonrasında temizlenen `New task` alanı tekrar odaklanır. Bugün tamamlanınca yarına yönlendirilen görevlerde de aynı davranış vardır.
- Hazır ve rastgele rapor soruları, mevcut eski kayıtlar dahil, TR/EN seçimine göre gösterilir. Cevap metinleri değiştirilmez; kullanıcı tarafından yazılan özel sorular yazıldıkları dilde kalır.
- Gelecek hafta ve ay için üçer farklı planlama sorusu ve ayrıca geleceğe yönelik rastgele soru havuzları bulunur. Plan cevapları `planningQs` içinde tutulur; mevcut `qs` değerlendirme cevapları değiştirilmez. Dönem sonunda önceki planlar ayrıca görülebilir; kilitleme ve yıl sonu arşivinin gizlilik süresi korunur.
- Karşılama ekranındaki Devam, marka ve döngeçten sonra dairenin 30 ms genişleyip 20 ms ters yönde çekildiği geçişi oynatır. 180 ms marka aşamasından sonra, 230 ms'de saate uygun selamlama başlar; harf aralıkları hızla açılır. Toplam giriş 900 ms'dir. Aynı sayfa yüklemesinde tekrar oynatılmaz; hareketi azaltma tercihi animasyonu atlar.

## Doğrulama

`npm test`: **79/79 geçti**. Bunların 27'si değiştirilmeyen eski `deneme.html` yapısal testleri; 52'si güncel `index.html` rapor tarihleri, soru dilleri ve ayrı plan kayıtları, menü hareketleri ve karşılama geçişi davranışlarını kontrol eder.

Chrome önizlemesinde:

- TR/EN × 8 genişlik × 6 sayfa = 96 yerleşim kontrolü. Genişlikler: 320, 360, 390, 430, 768, 900, 1024, 1280 px. Yatay taşma veya başlık çakışması bulunmadı.
- 844 × 390 yatay görünüm: başlık 67 px; menü penceresindeki tüm seçenekler kaydırma gerektirmeden sığdı.
- Menü açma, sayfa seçme, seçili öğeyi görünür tutma, Escape ve ileri/geri Tab odağı; sayfa kayarken menü görünürlüğü kontrol edildi.
- Görev ekleme: düğme, Enter ve tamamlanan günden sonra yarına ekleme senaryolarında yeni alanın değeri boş ve etkin öğe `nt` olarak doğrulandı.
- İngilizce rapora dört cevap yazılıp bir rastgele soru eklendi. Uygulamanın dil düğmesiyle Türkçeye geçince 13/13 soru Türkçeleşti, dört cevap aynen korundu.
- Canlı CSS ölçümünde daire animasyonu 50 ms, başlangıç gecikmesi 180 ms; selamlama başlangıcı 230 ms ve süresi 670 ms olarak doğrulandı. Dairenin %60 noktasında tam genişlemesi, ileri 30 ms ve geri 20 ms dağılımını verir. Gerçek çizilen kareler ekranın yenileme hızına bağlıdır.

## Sınırlar

Tarayıcı kontrolleri ayrı, örnek hesaplı iframe önizlemesinde yapıldı. Bu örnek kalıcı tarayıcı depolamasına ve Supabase'e erişemez. Gerçek iOS/Android cihazı, gerçek kullanıcı girişi ve bulut eşitlemesi bu çalışmada uçtan uca sınanmadı. Gerçek kullanıcı kayıtlarına işlem yapılmadı.

`dist/index.html` gerçek uygulamadır. `dist/review.html` ve `dist/review-app.html`, gerçek hesaba giriş gerektirmeyen inceleme görünümüdür; uygulamanın giriş veya izin kontrollerinde bir istisna oluşturmaz.
