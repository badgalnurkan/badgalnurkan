# 15 Kasım 2026 — Manuel giriş, mobil proje formu ve tek çöp kutusu (PR #13)

Bu bölüm önceki sürüm notlarını günceller. Önceki 1,6 saniyelik animasyon korunur ancak **normal Continue yerine** doğrulamaları geçen manuel Sign in / Create account gönderiminde başlatılır. Hatırlanan Google hesabının hızlı devam akışı mevcut sunucu doğrulamasını kullanmaya devam eder.

## Uygulanan davranış
- Hatırlanan Google hesabının yanındaki ayrı **Sign in** tuşu, hesap e-postası önceden doldurulmuş parola formunu açar. Otomatik Google devamı zorunlu değildir; parola yoksa kullanıcı önceden uygulama parolası belirlemiş olmalıdır.
- Boş veya yerel olarak geçersiz form girişleri animasyonu başlatmaz. Giriş/üyelik doğrulaması yapılırken animasyon başlar; yalnızca gerçekten geçerli bir oturum oluştuğunda uygulamaya geçiş yapılır. Sunucu reddederse giriş formunda hata görülür.
- Proje ekleme tarih alanı etiketli bir kapsayıcıya taşındı; özellikle 600 px ve altında tek sütun, sınırlı genişlik, WebKit tarih düzeni ve uzun proje adları ele alındı.
- Bildirim merkezinde her kayıt için ayrı silme kontrolü kaldırıldı; erişilebilir etiketli tek toplu silme kontrolü var. Kapak açıldıktan sonra yalnızca o sırada mevcut kayıtlar silinir, animasyon sonunda kapanır. İşlem sırasında gelen yeni kayıtlar korunur; teslim edilmiş bildirim işaretleri silinmez.
- Animasyon sistemin azaltılmış hareket tercihini gözetir. Eski tekil silme fonksiyonu geriye dönük test uyumluluğu için durur; görünür arayüzde kullanılmaz.

## Doğrulama ve sınırlar
- JavaScript kaynağı sözdizimi kontrolünden geçti.
- GitHub Actions: [başarılı çalıştırma](https://github.com/badgalnurkan/badgalnurkan/actions/runs/43723469627). **npm test**, betik sözdizimi ve **python scripts/build-preview.py** adımlarının tamamı başarılı. Yeni testler manuel giriş seçeneği, kimlik doğrulaması sırasında animasyon, tek çöp kutusu, yeni gelen bildirimlerin korunması, azaltılmış hareket ve mobil CSS sınırlamalarını kapsar.
- Gerçek iPhone Safari, küçük Android ekranları ve gerçek Supabase/Google giriş akışı bu PR üzerinde uçtan uca doğrulanmadı. Bu test sonucu üretim ortamında fiziksel cihaz onayı anlamına gelmez.
- PR taslak; `main` ve üretim dağıtımı değiştirilmedi.

---

# Selamlama, tema, mobil form ve bildirim düzeltmeleri

15 Kasım 2026. Başlangıç GitHub main: a51c4cd5c1501fca056012bed337a7bd5438aaba.

## Bu sürümdeki davranış

- Selamlama uygulamanın Türkiye saatiyle aynı kaynağı kullanır: 05.00–12.00 sabah, 12.00–18.00 gün, 18.00–22.00 akşam, 22.00–05.00 gece. 16.00 artık İyi günler / Good afternoon verir.
- Continue sonrasındaki giriş geçişi 2 saniyeden 1,6 saniyeye indirildi. İleri daire hareketi 340 ms, geri 240 ms; selamlama kalan zamanla uyumlu. Azaltılmış hareket tercihi ve Continue öncesi bekleme korunur.
- Karşılama veya girişte açıkça seçilen tema, sonraki doğrulanmış hesabın eski temasına üstün gelir. Hesap atanıp normal kayıt/eşitleme yapılmadan önce uygulanır. Google geri yönlendirmesi boyunca sekme deposunda korunur; sekme deposu yoksa mevcut depolama katmanı kullanılır. Tercih bir kez tüketilir; başka hesaba yeni seçim yapılmadan taşınmaz. Yeni seçim yoksa hesabın kayıtlı teması korunur.
- Mobil proje formu 600 px ve altında tek sütundur; ad, tarih ve Ekle düğmesi tam genişliktedir. Yerel tarih/saat alanı ve uzun proje adı için kutu sınırları tanımlandı. Gerçek form gönderimi Enter'ı destekler. Boş ad, eksik/geçersiz/geçmiş tarih açıklanır; geçersiz veriler kaydedilmez. Ekleme sonrası yeni proje adı odaklanır.
- Gün görevleri artık üç durum taşır: done, miss, pending. Tik/çarpı seçilmemiş görev takvim tarih penceresinde ○ Henüz yapılmadı / Not done yet olarak gösterilir. Yalnızca açık çarpı miss olur. Gün devri ve tamamlanan grup arşivi s alanıyla durumu korur; toplam/tamamlanma hesapları aynı done bayrağını kullanmaya devam eder.
- Eski geçmişte yalnızca done:false tutulduğunda bunun çarpı mı yoksa işaretlenmemiş görev mi olduğu geri çıkarılamaz. Bu kayıtlar değiştirilmeden, görünümde pending kabul edilir. Kanıt olmadan kullanıcıya çarpı atfedilmez. Bilinen done ve miss korunur. Açıkça boşaltılmış s, eski done:true alanı nedeniyle tekrar işaretlenmez.
- Üst bildirim yatay sürüklemeyle iki yönde kapatılır. Dikey/çapraz, kısa ve çok parmaklı hareket kapatma yapmaz; hareket sonrası sentetik tıklama detayı açmaz. Dokunma yedeği, pointercancel ve azaltılmış hareket desteklenir. 8 saniyelik zamanlayıcı hareket sırasında durur.
- Kaydırma yalnızca üst uyarıyı kapatır; merkez kaydı ve okunmamış işareti korunur. Merkezin açılması kırmızı işareti temizler. Merkezde 44 px çöp kutusu düğmesi kaydı siler; varsa eşleşen üst uyarı da kapanır. Silinen uyarı tekrar üretilmez.
- İngilizce görev bildirimindeki tekil/çoğul düzeltildi. Yeni SITE_RELEASE ve TR/EN değişiklik kaydı eklendi. Haftalık/aylık takvim, yıl sonu cevap kilitleri, ilerleme kazanımı, 30 dakikalık Google hızlı dönüşü ve Supabase yetkilendirme akışı değiştirilmedi.

## Doğrulama

- npm test: **157/157 geçti** (27 önceki deneme.html kontrolü, 130 güncel uygulama kontrolü). Tam JavaScript ayrıştırması dahil. Yeni kontroller: gerçek zaman damgaları ve 18.00 sınırı; tema önceliği/hesap değişimi/yönlendirme/depolama yedeği; proje kaydı ve hata yolları; üç görev durumu ve gün devri; iki yönlü sürükleme, kısa/dikey/çok parmaklı iptal, sentetik tıklama ve azaltılmış hareket.
- python scripts/build-preview.py ve git diff --check başarılı.
- Chrome: saat 16.xx → İyi günler; gerçek CSS geçiş süresi 1.6 s, daire 0.58 s.
- Örnek hesap UI'sinde beyaz kayıtlı hesap → karşılamada siyah → ana sayfa siyah; sonra siyah kayıtlı hesap → karşılamada beyaz → ana sayfa beyaz.
- 16 proje formu + hatırlatma penceresi yerleşimi: TR/EN × açık/koyu × 320/390/768/1280 px. Kontroller kutularına sığdı. Ek olarak 24 sayfa görünümü: TR/EN × 320/768 px × altı ana sayfa; yatay taşma/render hatası görülmedi.
- Proje arayüzünde boş ad ve boş tarih reddedildi. 40 karakterlik uzun ad, tarih girildikten sonra Enter ile tek kez eklendi; odak pn alanına döndü. Hatırlatma penceresi taşmadı.
- 320 px İlerleme penceresinde gerçek To-do tıklamalarıyla ✓ Yapıldı, ✕ Yapılmadı ve ○ Henüz yapılmadı ayrı görüldü; satırlar taşmadı.
- Gerçek tarayıcı sürüklemesiyle üst uyarı sayısı sola 2→1, sağa 1→0. Merkezde iki kayıt korundu; çöp kutusu tıklamasıyla 2→1. Sekiz ek bildirim merkezi yerleşimi (TR/EN × açık/koyu × 320/390 px) taşmadı.

Ölçümler: docs/greeting-project-mobile-checks.json, docs/progress-task-state-checks.json, docs/notification-theme-checks.json. Ekranlar: docs/mobile-project-form-fixed.jpg, docs/progress-task-states.jpg, docs/notification-center-trash.jpg.

Önizlemedeki örnek hesaba giriş sadece izole review-app.html içindedir. Üretim index.html içine test kimliği eklenmedi. Örnek iframe form olaylarına izin verir; connect-src ve form-action none ile dış istek ve form navigasyonu kapalıdır. Bu değişiklikte veritabanı şeması, RLS, SQL veya Auth token kuralları değiştirilmedi; gerçek kullanıcı kaydı test amacıyla okunmadı/yazılmadı.

Fiziksel iOS/Android ve Safari/WebKit motoru sınanmadı. Pointer sürüklemesi Chrome'da, touch yedeği otomatik testte doğrulandı. Gerçek Google hesabıyla giriş/tema eşitlemesi uçtan uca yapılmadı; doğrulanmış hesap aktivasyonunda kullanılan ortak tema işlevi otomatik test ve izole örnek hesapla sınandı. Eski belirsiz görevlerin özgün tik/çarpı seçimi kurtarılamaz.

---

## Önceki sürümün doğrulama kaydı

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
