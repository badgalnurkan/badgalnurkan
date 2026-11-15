# Giriş, raporlar ve bildirimler — 15 Kasım 2026

Başlangıç: badgalnurkan/badgalnurkan main, 663457778ce51840ea0a44704d898490a82a2c8c.

## Son davranış

- Karşılama ekranı mevcut renk, tema ve dil sistemiyle yenilendi. Devam giriş formuna geçer; marka/döngeç/selamlama yalnızca başarılı hesap aktivasyonundan sonra oynar. Daire 420 ms ileri, 300 ms geri; toplam giriş 2 saniye. Hareketi azaltma tercihi animasyonu atlar.
- Google ile açılmış hesap karşılama ve giriş ekranında e-postasıyla hatırlanır. Karşılamaya dönmek Google oturumunu korur. Tek tıklamayla dönüş önce Supabase sunucusundan kullanıcı kimliğini doğrular; geçersiz oturum mevcut Google OAuth akışına yönlenir. Açık çıkış işlemi oturumu kapatmayı sürdürür.
- Etkileşimli öğelerde ortak, gecikmesiz tıklama geri bildirimi; sayfa ve pencere geçişleri. Metin alanlarında yumuşak odak durumu. Tekrarlanan tıklamalar animasyon kuyruğu oluşturmaz.
- Raporların ana sayfasında haftalık ve aylık kısa özetler vardır. Daha fazlası / More details; dönemin tamamlanan ve tamamlanmayan görevlerini gün gün, ardından değerlendirme ve gelecek dönem sorularını gösterir. Kayıt bulunmayan günler atlanır; tamamlanmayan sayısı yapılmadı işaretli ve açık kalan görevleri içerir.
- Son cevap yazılırken taslak korunur. Tüm sorular doluyken son alanın odağı bırakıldığında ilgili grup otomatik kilitlenir. Değerlendirme ve planlama ayrı kilitlenir. Boş/yalnızca boşluk içeren cevaplar ve sıfır sorulu grup kilitlenmez. Kilitli gruplar ekleme/silme/değiştirme işlevlerinden korunur, cevapları ilgili dönemin yılından sonraki 1 Ocak'ta okunabilir olur. Mevcut cevaplar, soru kimlikleri ve rapor tarihleri korunur.
- Tek bildirim kutusu: site güncellemeleri, proje hatırlatmaları, günlük görevler ve Pomodoro uyarıları. Yeni bildirim simgede kırmızı işaret oluşturur; kutuyu açmak okundu işaretler. Tek tek silme yeniden gönderime neden olmaz. Son 200 bildirim hesap verisinde saklanır.
- SITE_RELEASE sürümü başına “Site güncellenmiştir!” bildirimi, tarihli TR/EN değişiklik ayrıntılarını açar. Ayrı Updates menüsü yoktur. AGENTS.md gelecekteki görünür sürümlerde bu kaydın güncellenmesini ister.
- Proje hatırlatması varsayılan olarak proje günü Türkiye saatiyle 09.00'dadır; proje üzerindeki Hatırlatma düğmesinden yerel tarih/saat seçilebilir veya kapatılabilir.
- Açık sitede günlük görevler Türkiye saatiyle 09.00, 14.00, 19.00 dilimlerinde hatırlatılır. Geri dönüşte yalnızca son geçmiş dilim hatırlatılır; tamamlanmış/yapılmadı işaretli görevler dışarıda tutulur. Kontrol aralığı 30 saniyedir.
- Pomodoro; 5 dakikadan uzun odak oturumlarında molaya 5 dakika kala, odak bitip mola başladığında ve mola bitip odak tekrar başladığında bildirim oluşturur. Mevcut beş oturum/uzun mola düzeni korunur. Durdurup başlatma aynı uyarıyı tekrarlamaz; farklı hesaba geçiş önceki uyarı durumunu taşımaz.

## Gerçekleştirilen kontroller

`npm test`: 103/103 geçti; 27 eski deneme.html testi ve 76 güncel uygulama testi. Tarih sınırları, eski/yeni hesap takvimi, soru dilleri, plan/değerlendirme ayrımı, yıl sonu kilidi, taslak/son alan davranışı, bildirim tekrarları, okundu/silme, hatırlatma tercihleri, Pomodoro evreleri ve doğrulanmış Google kimliği sınanır.

Chrome örnek önizlemesinde:

- 48 düzen: TR/EN, 320/390/768/844/1024/1280/1920/3840 px, karşılama veya hatırlanan Google / ana sayfa / rapor özeti. Yatay taşma veya başlık kontrol çakışması yok.
- 844×390 koyu tema: altı ana sayfada taşma yok; başlık yüksekliği 67,375 px. 320×568 hatırlanan Google düğmesi e-postayla sığar.
- Rapor özetinde 2 kart, 0 cevap alanı; ayrıntıda günlük görev ayrımı. Son cevaptan önce/sonra 3 → 0 metin alanı ve 2027 başı kilit bildirimi doğrulandı.
- Bildirim kutusu açılışı, kırmızı işaretin sönmesi, tek bildirim silme, site güncellemesi ayrıntılarını açma; projeye geçmiş saat seçip üst bildirim ve kutu kaydı oluşturma kontrol edildi. Gerçek hesap kullanılmadı.
- Canlı CSS ölçümü: giriş 2 s, daire 0,72 s, daire başlangıç gecikmesi 0,24 s.

Ham yerleşim ölçümleri docs/responsive-checks.json içindedir.

## Doğrulama sınırları

Tarayıcı kontrolleri Supabase ve kalıcı depolamaya erişemeyen örnek iframe içinde yapıldı. Gerçek Google hesabıyla uçtan uca giriş ve fiziksel iOS/Android cihazı sınanmadı. Sunucu kimliği, geçersiz oturum ve kimlik uyuşmazlığı otomatik testlerde taklit edilen yanıtlarla doğrulandı.

Bildirimler site içinde çalışır. Kapalı siteye işletim sistemi push bildirimi gönderen bir servis kurulmadı. Kilitler mevcut kullanıcı JSON verisinde saklanır ve uygulamada uygulanır. Gerçek kullanıcı kayıtlarına veya Supabase şemasına işlem yapılmadı.

Gerçek giriş dosyası index.html; dist/index.html aynı dosyanın dağıtım kopyasıdır. review.html/review-app.html izole örnek önizlemedir ve üretim kimlik doğrulamasını değiştirmez.
