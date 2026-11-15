# Continue, takvim raporları ve 30 dakikalık hızlı dönüş

15 Kasım 2026. Başlangıç GitHub main: 27ef6b88fe3604cf4200238d88dd083aca200844.

## Son davranış

- Sayfa açılışında saklanan oturum otomatik uygulama girişine dönüştürülmez. Karşılama Continue seçilene kadar kalır. Hem normal giriş hem hatırlanan Google yolu, aynı 2 saniyelik marka/döngeç/selamlama geçişini Continue'den sonra başlatır. Normal yol sonra giriş formunu açar. Başarılı kimlik doğrulaması aynı hareketi ikinci kez oynatmaz. OAuth geri dönüşü doğrulama ekranını kullanır.
- Hatırlanan Google hesabı e-postayla sunulur. Hızlı dönüşte Supabase kullanıcısı doğrulanır; sunucu zamanına göre son OAuth doğrulamasının üzerinden 30 dakika geçmemiş olmalıdır. Profil yüklenmeden önce ve yüklendikten sonra süre tekrar kontrol edilir. Başka kullanıcı kimliği, süre aşımı ve doğrulanamayan durum hızlı girişi engeller. Süre dolunca yerel aday oturum temizlenir ve Google hesap seçimi açılır. Süre yenileme jetonuyla uzamaz.
- 30 dakika, karşılama ekranından hızlı dönüş penceresidir. Açık uygulama oturumunu her 30 dakikada zorla kapatan bir kural eklenmedi. Mevcut Google oturumunu koruyarak karşılamaya dönme ve açık çıkış davranışı sürer.
- Hiç kullanım verisi olmayan hesap %1'de kalır. İlk etkin gün +1 puan, aynı gün sonraki işlemler +0, sonraki etkin gün +1 puandır. Yalnızca giriş yapmak, tema değiştirmek, bildirim almak veya boş soru üretmek etkinlik sayılmaz. Görev, proje, plan, not, günlük, rapor cevabı ve odak/kronometre kullanım verileri değerlendirilir.
- `progressState` v2 geçişi gerçek eski ilerlemeyi sabit bir başlangıç değeri olarak korur. Verisiz eski hesap ilk kaydında geçmiş boş takvim günleri nedeniyle yüksek yüzdeye sıçramaz. Mevcut görev, not, cevap ve geçmiş dizileri yeniden yazılmaz. Kayıtlı, kısmen tamamlanmış duraklatılmış Pomodoro da gerçek kullanım kabul edilir.
- Haftalık rapor pazar açılır; pazartesi yeni haftanın kilitli raporu başlar. Aylık rapor ayın gerçek son günü (28/29/30/31) açılır; ayın 1'inde yeni ayın raporu kilitli başlar. Dönem aralıkları pazartesi–pazar ve ayın 1'i–son günüdür.
- Örnek: 15 Kasım 2026'da 9–15 Kasım açık; 16 Kasım'da 16–22 Kasım kilitli, açılış 22 Kasım. 30 Kasım'da kasım açık; 1 Aralık'ta aralık kilitli, açılış 31 Aralık. Şubat 2027: 28 gün; Şubat 2028: 29 gün.
- Önceki tamamlanan döneme ayrı düğmeyle erişilir. Mevcut hesapların ilk açılış tarihi ve yeni hesapların ilk tam dönem kuralı korunur. Dönem başlatmak eski cevap kilitlerini sıfırlamaz veya yeni döneme kopyalamaz.
- Tüm sorular doldurulup son alandan çıkılınca ilgili cevap grubu yıl sonuna kadar gizlenir; sonraki 1 Ocak'ta arşivde salt okunur hale gelir. Değerlendirme ve planlama ayrı saklanır. Boş/boşluk cevaplar ve sıfır sorulu grup kilitlenmez. Yeni dönem başlarken önceki cevaplar silinmez.
- Hazır plan sorularının “gelecek hafta/ay” ifadesi hedef dönem güncel olduğunda “bu hafta/ay” olur. Soru kimlikleri ve cevap metni değişmez; özel sorular yeniden yazılmaz. TR/EN, rastgele sorular, görev odağı, bildirim kutusu, üst uyarılar, Pomodoro ve diğer mevcut özellikler korunur.
- SITE_RELEASE güncellendi; “Site güncellenmiştir!” kutusu yeni değişiklikleri TR/EN sunar.

## Doğrulama

`npm test`: **121/121 geçti** (27 değiştirilmemiş deneme.html testi ve 94 güncel uygulama testi).

Yeni kontroller: Continue öncesi/sonrası sıra ve çift tıklama; kayıtlı oturumla otomatik giriş olmaması; Google kimlik uyuşmazlığı ve 30 dakika süresinin profil isteği sırasında dolması; verisiz/eski/yeni hesap yüzdesi, günlük tek artış ve geçmişin korunması; pazar/pazartesi, ay sonu/1'i, 28/29/30/31 günler, yeni dönem ile cevap kilitlerinin ayrılığı ve dönemsel soru dili.

Chrome önizlemesi:

- Continue anında giriş formu yok, giriş tabakası 2 s ve daire 0,72 s; tamamlanınca giriş formu görünür.
- Verisiz örnek hesap %1; ilk kaydedilen nottan sonra %2; aynı gün ikinci kayıttan sonra %2.
- Önceki ayın üç cevabı tamamlanınca o grupta alan sayısı 3 → 0; 2027 başında açılma bildirimi. Geçerli ayın raporu kendi tarihine kadar kilitli kalır.
- İzole tarih seçimiyle 15/16 Kasım, 30 Kasım/1 Aralık, 28 Şubat/1 Mart 2027 ve 29 Şubat/1 Mart 2028 arayüzleri doğrulandı.
- 36 TR/EN yerleşim: 320, 390, 768, 844, 1280, 1920 px; hatırlanan Google, raporlar ve verisiz ilerleme. Yatay taşma bulunmadı.

Ölçümler: docs/calendar-progress-checks.json. Tarih simülasyonu yalnızca generated review-app.html içindedir; gerçek index.html tarihini değiştirmez.

## Supabase kontrolü

`database/quick-resume-status.sql`, mevcut projeye `google_quick_resume_30_minute_window` olarak uygulandı. `iydu_quick_resume_status()` salt okuma, SECURITY INVOKER ve boş search_path kullanır. Yalnızca authenticated çağırabilir; anon EXECUTE false. İşlev özel kullanıcı tablosu okumaz ve kullanıcı kaydı yazmaz. PostgREST'in doğruladığı JWT'deki OAuth AMR zamanını ve veritabanı saatini karşılaştırır; düzenlenebilir user_metadata veya yeni token_refresh zamanı kullanılmaz.

Gerçek veritabanında sentetik taleplerle 6 kontrol geçti: yeni OAuth, 29:59, 30:00, yenilenmiş ama eski OAuth, parola oturumu ve eksik AMR. Sonuçlar database/quick-resume-verification.json içindedir. Gerçek kullanıcı token'ı veya kaydı test amacıyla okunmadı.

Güvenlik danışmanı yeni işlev için bulgu üretmedi. Önceden bulunan, bu değişiklikte kapsam dışında bırakılan gruplar: [anon SECURITY DEFINER izinleri](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated SECURITY DEFINER izinleri](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [sızmış parola koruması ayarı](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Kaynaklar: [Supabase JWT alanları](https://supabase.com/docs/guides/auth/jwt-fields), [oturumlar](https://supabase.com/docs/guides/auth/sessions), [Google OpenID Connect parametreleri](https://developers.google.com/identity/openid-connect/openid-connect).

## Sınırlar

Gerçek Google hesabıyla uçtan uca giriş ve fiziksel iOS/Android cihazı sınanmadı. OAuth ve veri yükleme sırası otomatik testlerde taklit yanıtlarla doğrulandı; süre kararı ayrıca gerçek veritabanında sentetik JWT bağlamında sınandı. Tarayıcı örneği Supabase'e ve kalıcı depolamaya erişmez. Bildirimler site içinde çalışır; önceki bildirim tercihleri ve kapalı sitede push kapsamı değişmedi. Cevap kilitleri mevcut kullanıcı JSON modeliyle uygulamada uygulanır.
