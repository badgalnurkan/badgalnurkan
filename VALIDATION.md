# 22 Kasım 2026 — Güvenlik başlıkları, yayından kaldırılan dosyalar ve kayıtlı kullanıcı adları (yayın adayı)

- `vercel.json` tüm yanıtlara `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` ve `Permissions-Policy` ekler. CSP kaynakları sitenin kendi dosyaları, Google Fonts, Supabase projesi ve izin verilen veri/blob kaynaklarıyla sınırlar; çerçeveleme ve eklenti nesneleri kapalıdır. `<base>` adresi ve form gönderimleri aynı origin ile sınırlıdır. Mevcut satır içi betik ve `onclick` yapısı nedeniyle `'unsafe-inline'` korunur, `'unsafe-eval'` yoktur.
- Kökteki eski uygulama kopyaları (`deneme.html`, `deneme_final.html`, `demo.html`), `patch9.py`, Markdown dosyaları, `package.json` ve `database/`, `docs/`, `scripts/`, `supabase/`, `tests/`, `.github/` yolları geçici yönlendirmeyle (307) ana sayfaya gider. Dosyalar depoda kalır; `deneme.html` yerel `npm run test:e2e` için gereklidir.
- Kayıtlı kullanıcı adları satır içi `onclick` metnine yazılmaz, `data-user` özniteliğinden okunur. Kesme işareti içeren bir ad düğmeyi bozamaz veya kod olarak çalışamaz.
- Geçmiş özet listesi günlük kayıtlarını arşiv listesiyle aynı tarih ve nesne filtresinden geçirir; bozuk veya `null` kayıt ekranı çökertemez.
- `tests/security-hardening.test.cjs` başlıkları, yönlendirmeleri, kökteki her HTML dosyasının durumunu ve iki şablon kuralını denetler; `npm test` kapsamına eklendi. Yayın onayı sonrası `SITE_RELEASE` benzersiz `2026-11-22-security-hardening-01` kimliğiyle değiştirildi ve bildirim kutusuna yalnızca uygulanan değişiklikleri anlatan tarihli Türkçe/İngilizce `SITE_CHANGES` kaydı eklendi.
- Doğrulama: `npm test` 293/293 geçti ve `python scripts/build-preview.py` çalıştı. Windows'ta `core.autocrlf=true` ile CRLF olan çalışma kopyasında `todo-empty-state` testi yanlış hata verdiği için ikisi de LF'ye çevrilmiş geçici bir kopyada çalıştırıldı; `dist/` depoya eklenmedi. `vercel.json` başlıkları ve yönlendirmeleri yerel bir sunucuda taklit edildi. Chromium tabanlı tarayıcıda `review-app.html` ve `index.html` giriş ekranı CSP ihlali olmadan açıldı; betikler, stil dosyası ve yazı tipleri yüklendi. `account-close.html` ile yasal sayfalar dosya içeriğinden kontrol edildi. Yayın bildirimi izole örnek uygulamada oluşturuldu, bildirim kutusundan sürüm ayrıntıları açıldı ve tekrar oluşturma çağrılarında yalnızca bir sürüm bildirimi kaldığı doğrulandı. 632 piksel genişlikte yapısal kontrolde yatay taşma ve CSP ihlali gözlenmedi.
- Doğrulama sınırı: Başlıklar ve yönlendirmeler gerçek bir Vercel önizlemesinde henüz denenmedi. Ekran görüntüsü alınamadığı için görsel kontrol yapılmadı. Google ile giriş, şifre yenileme ve hesap kapatma gerçek hesap ve e-postayla uçtan uca çalıştırılmadı. Canlı veritabanındaki hesap silme onay metni buradan okunamadı.

---

# 21 Kasım 2026 — Temalara uyumlu mobil menü (inceleme dalı)

- 17 seçilebilir temada mobil alt menü, aktif sekme, seçilmemiş simgeler, odak halkası ve aşağı kaydırmadaki tek simgeli görünüm ortak tema renklerini kullanır. Sabit koyu menü paleti kaldırıldı.
- Altı sekmeli solda toplanmış düzen, aşağı/yukarı kaydırma davranışı, aktif gösterge animasyonu, yatay gezinme ve masaüstü menüsü değiştirilmedi.
- `tests/mobile-navigation.test.cjs` dosyasına tema değişkenleri, açık/koyu renk uyumu ve daraltılmış menü için regresyon kontrolleri eklendi.
- Doğrulama sınırı: Değişiklik önce PR önizlemesine alınır. CI ve tarayıcı testleri tamamlanmadan canlıda yayımlandığı ya da kusursuz çalıştığı iddia edilmez.

---

# 18 Kasım 2026 · Şifre yenileme, görev planlama, rapor takvimi ve Pomodoro

Şifre yenileme isteği tarayıcıya bağlı bir PKCE doğrulayıcısı üretir. Posta başka tarayıcıda açılırsa tek kullanımlık kod ilk tarayıcıda kullanılabilir. Oturum açma, kapanış onayı ve şifre yenileme ayrı akışlardır. Hesap e-postasının teslim kanalı, Edge hizmetinin salt okunur durum yanıtında görülebilir. İşlem başlıkları için Resend gönderici bilgileri gerekir. Gerçek kullanıcı postaları test amacıyla gönderilmez.

`npm test` kapsamına eski ve yeni hesapların art arda sıfırlanması, eski kayıt tarihinin onarılması, rapor yanıt kilitleri, tamamlanmamış görevle yarını planlama girişimi, gece yarısı ve atlanan günler, tekrar çalıştırma, alfabetik sıra, duraklatılmış özel odak süresi ve iki dilde üç farklı e-posta konusu dahildir. Tarayıcı testleri e-posta ve kimlik uçlarını taklit eder. Aynı ve farklı tarayıcı profillerinde yenileme için Chromium, WebKit ve Firefox çalıştırılır. Odak özetinin sıfır, üç, dört ve daha fazla günlük durumları Chromium ve WebKit ile kontrol edilir.

# 18 Kasım 2026 · Dönem raporunu gönderme ve profil kısayolu

Haftalık ve aylık formlarda taslaklar yazarken saklanır. Gönder, o dönemin açık soru gruplarını birlikte kontrol edip tek kayıtta kilitler. Profilde e-posta altındaki kısayol şifre yenileme bölümünü açar. Uygulama şifresi olan hesaplar mevcut şifreyi doğrulayarak yenisini kaydedebilir. E-posta bağlantısı ilgili hesap için istenir. Arşiv etiketleri dar ekranda tam kelimelerle ortalanır.

# 18 Kasım 2026 · Rapor zamanı, görev taşıma ve odak özeti

- Haftalık sorular İstanbul takviminde pazar günleri, aylık sorular ayın son gününde açılır. Özet, dönem ayrıntıları ve cevap yazma işlemi aynı kuralı kullanır. Önceki dönemlerin istatistikleri okunabilir.
- Sıralama sırasında satır imleci izler ve komşu satırlar yer açar. Yeni sıra bırakıldığında kaydedilir. İptal, klavye ve azaltılmış hareket yolları desteklenir.
- Pomodoro kartı üç gün gösterir. Önceki aylara ait kayıtlar dahil eski günler açılır bölümde kalır. Üç kayıttan az olduğunda eksik tarihler “Kayıt yok” olarak gösterilir.
- Takvim testleri hafta ve ay sonunun çakışmasını, artık yılı, gece yarısından sonra eski formdan yazma girişimini ve yıl sonu cevap arşivini kapsar. Tarayıcı senaryosu sürüklemenin önizlemesini, açık rapor sekmesinin gün değişimini ve Pomodoro ayrıntılarını kontrol eder.

---

# 16 Kasım 2026 — Mevcut hesaplarda günlük yüzde artışı

Bu sürüm, GitHub main 36a09f16cb4c8b371889d9cb59e4e9754017477f (birleştirilmiş PR #13) üzerine kuruludur. Manuel giriş, mobil proje tarih alanı, tek kapaklı çöp kutusu ve giriş/üyelik gönderimindeki selamlama geçişi korunmuştur. Aşağıdaki eski sürüm notları arşiv niteliğindedir.

## Son kural

- Hiç gerçek kullanım/etkileşim geçmişi olmayan hesap, kayıt tarihinden bağımsız olarak %1'de kalır. Kimlik, tema, bildirim, boş üretilmiş soru ve kullanılmamış odak sayacı etkileşim kanıtı sayılmaz.
- Gerçek kullanım başladıktan sonra yüzde takvim günü başına +1 artmaya devam eder; sonraki her gün görev veya not girmek gerekmez. Aynı gün yeni kayıt yapmak, sayfayı yenilemek veya tekrar hesaplamak ek puan oluşturmaz.
- progressState v3, başlangıç değerini, o değerin tarihini ve kullanımın başladığı günü saklar. V2'de gerçek kullanım varsa kazanılmış başlangıç değeri korunur ve son tarihten itibaren takvim günleri sayılır. Hiç etkileşimi olmayan eski yapay sayaçlar kullanım kanıtı kabul edilmez.
- Önceden boş olan hesapta ilk etkileşim %1 → %2 yapar; kayıt ile ilk etkileşim arasındaki boş günler geriye dönük verilmez. Kullanım başladıktan sonra görevleri/notları silmek, bir kez etkileşim olmuş olmasını silmez. Ayarlar'daki açık sistem sıfırlaması yeni boş durumla yine %1 başlatır.
- Görev/not/rapor geçmişi yeniden yazılmaz; eski yüzde gövdesi gerçek kullanım için korunur. TR/EN açıklamaları ve yeni Site güncellenmiştir kaydı bu kurala göre yenilendi.

## Doğrulama

- **npm test: 171/171 geçti** (27 eski deneme.html kontrolü ve 144 güncel uygulama kontrolü). Tam betik sözdizimi, günlük tek artış, uzun boş kayıt dönemi, eski V2 geçişi, gerçek kullanımın korunması, hiç kullanılmamış hesaplar, ay/yıl sınırı ve artık gün kapsamda.
- **python scripts/build-preview.py** ve **git diff --check** başarılı.
- Gerçek Chrome arayüzünde 24 durum: TR/EN × 320/390 px × verisiz/mevcut kullanım × 15/16/30 Kasım. Verisiz hesap her tarihte %1; V2 başlangıcı 15 Kasım %20 olan örnek mevcut hesap 16 Kasım %21 ve 30 Kasım %35. Yatay taşma yok.
- Hatırlanan Google örneğindeki manuel giriş düğmesi parola formunu açtı; Continue aşamasında selamlama katmanı yoktu. Bu, gerçek Google veya Supabase girişi testi değildir.
- Bildirim merkezi: yalnızca bir genel çöp kutusu, satırlarda sıfır çöp kutusu. Tıklamada is-emptying sınıfıyla kapak açıldı; kapanıştan sonra liste boş ve düğme pasif oldu. Üretim kullanıcı bildirimi silinmedi; izole örnek kullanıldı.
- Mobil proje tarih alanı 390 px örnekte 340 px form sınırına sığdı. iPhone Safari/WebKit fiziksel testi yapılmadı; bu kontrol Chrome içindir.

Kanıtlar: docs/daily-progress-ui-checks.json, docs/existing-entry-inbox-checks.json, docs/daily-progress-existing-account.jpg. Tarih/kullanıcı senaryoları yalnızca izole review-app.html içine eklenir; gerçek index.html içine test hesabı veya tarih eklenmedi. Gerçek kullanıcı veritabanı kaydı değiştirilmedi, SQL/RLS/Auth kuralı değişmedi. Eski istemciyle açık kalmış sekmelerin yeni kuralı alması için sayfanın yenilenmesi gerekir.

---

## Önceki sürüm kayıtları

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


## 17 November 2026 · account security and domain

- Added server-only controls/challenges, restrictive RLS, password timestamps, 30-day deletion and private 15-minute cron.
- Synthetic SQL transaction verified active/expired password access, password trigger, OTP attempts, deactivation, revoked sessions, replay, reactivation, explicit deletion consent, exact 30-day deadline, expiry, permanent purge and grants. Rolled back all generated fixtures; no real emails or user-data tests.
- Six existing accounts stayed active; application progress, tasks and reports were not rewritten.
- New account/profile email is read from server status. Remembered Google restores before animating home and retains both 30-minute server checks.
- Custom lifecycle emails require Edge Resend secrets separately from Auth SMTP. Readiness and CI results recorded below after execution. Auth dashboard settings cannot be read by the current connector.
- Browser checks run in CI with Chromium and WebKit; physical iOS, real OAuth and inbox delivery are not claimed.

- CI request/regression run: 189 tests passed. Live backend health responded ok with mailReady=false: at least one of RESEND_API_KEY or ACCOUNT_MAIL_FROM is missing/invalid. No delivery test was sent. First browser installation encountered runner OS mismatch; runner pinned to Ubuntu 24.04 for Playwright 1.56.1.
- Actual authenticated-role SQL test passed: own active read/write succeeds, cross-account reads and deactivated reads/writes are denied, privileged service RPC is denied. All generated fixture writes rolled back.

- Cloud loader now explicitly refuses restricted accounts rather than treating RLS-filtered data as a new empty account.

- Chromium and WebKit checks passed at 320, 375, 390, 430, 768 and 1440px: project date control stayed in its parent and accepted input; no document overflow. Manual welcome Continue opened sign-in without a greeting.

- Chromium/WebKit mocked account journey passed: remembered Google entry reveals home while greeting runs; Settings renders the server email; a code-confirmed deactivation removes this browser’s identity and session. All cloud responses in this browser journey were intercepted, with no production writes.
- Public Auth settings verified emailAutoconfirm=false, emailEnabled=true, googleEnabled=true. SMTP delivery and secure-email-change configuration remain owner-verification items.

- Final checks also cover the permanent deletion email-link UI (Other reason, No without a request, and explicit Yes). Production domain verification runs only after publication. Real inbox delivery remains untested until the Edge mail secrets are configured.

- Final release: 190 tests passed. Chromium/WebKit: date field at six widths, remembered home reveal, verified email UI, code deactivation, deletion Other/No/Yes passed. Main CI confirmed https://badgalnurkan.com serves SITE_RELEASE 2026-11-17-account-security-domain and account-security.js/.css plus cookies.html. Vercel deployment succeeded.
- Migration filenames and statements now match the database's actual migration history, including the existing 30-minute quick-resume migration. This avoids reapplying existing DDL in a later CLI push. This is a source-history correction with no live schema change.
