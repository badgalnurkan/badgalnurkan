# Improvin’ Your Day — Ürün, Güvenlik ve Test Sözleşmesi

**Sürüm:** 2026-11-19 · **Durum:** Çalışan ürün sözleşmesi, uygulama ve doğrulama aşamalı.
**Kapsam:** badgalnurkan.com, GitHub `badgalnurkan/badgalnurkan`, Supabase Auth/Postgres/Edge Functions, Resend, Vercel.

Bu belge isteklerin kaybolmaması için **proje deposunda** saklanan kaynak belgedir. Bir özelliğin burada tanımlanması, tamamlandığı veya canlıya alındığı anlamına gelmez. Her teslim PR + test kanıtı + yayın/geri dönüş kararıyla kayıt altına alınır.

## A. Değişmez ilkeler

1. **Veri kaybı yok:** Gerçek kullanıcı verilerini, Auth yapılandırmasını, silme zamanlayıcılarını veya prod veritabanı şemasını yalnızca ayrı, açık onay ve doğrulanmış geri dönüş planıyla değiştir.
2. **Önce doğrula:** Her değişiklik için izole dal, unit test, hata senaryoları, Playwright (Chromium/WebKit/Firefox), mümkünse QA Supabase entegrasyon testi ve ancak sonra dağıtım.
3. **Ücretsiz yol:** Ücretli ürün veya faturalandırma kullanıcı onayı olmadan etkinleştirilmez.
4. **Mevcut teknoloji:** Saf HTML/CSS/JS korunsun; zorunlu gerekçe olmadan framework migration veya mikroservis yok. İşlevler küçük modüllere ayrılabilir.
5. **Kullanıcıya şeffaflık:** Doğrulanan, tahmini, henüz test edilmemiş ve yayınlanan durumları kesinlikle ayır.
6. **Güvenlik:** RLS, `auth.uid()` sahiplik kontrolü, güvenli SQL fonksiyon grant'leri, hassas işlemlerde yeniden doğrulama, denetlenebilir yedekleme ve gizli anahtarların sunucu dışında bulunmaması.

## B. Kimlik, e-posta, hesap yaşam döngüsü — P0

### B1. Tarayıcıya bağlı doğrulama

**Amaç:** Kullanıcının başlattığı tarayıcıdaki işlemi, başka bir cihaz veya tarayıcıdaki oturum devralmadan tamamlamak.

- Varsayılan etkileşim: doğrulanmış e-postaya gelen **tek kullanımlık OTP**, isteği başlatan tarayıcıdaki forma elle girilir. Amaç (signup / recovery / email update / deactivate / delete / reactivate), kullanıcı kimliği, challenge kimliği, son kullanma ve tüketilme durumu sunucuda bağlanmalıdır.
- E-posta bağlantısı alternatif olabilir; **web sitesi Mail/Safari/Edge/Chrome'un bağlantıyı hangi tarayıcıda açacağını kontrol edemez.** Aynı tarayıcıda PKCE verifier eşleşirse yerel callback çalışır. Başka tarayıcıda yalnızca kontrollü aktarım/kod mesajı gösterilir; yeni Auth session yaratılmaz.
- Başka hesapla açık sekme, çoklu sekme, kod tekrar kullanımı, bitmiş/yanlış kod, ağ kopması, spam/rate-limit, yanlış e-posta ve geri tuşu zorunlu testlerdir.
- Arayüzde kullanıcıyı kafa karıştıran “continue as this browser” metni varsa, işlemi başlatan ekrana dönmeyi açık ve kısa anlatan bir Türkçe/İngilizce akışla değiştirilir; güvenliği azaltan otomatik tarayıcı taşıma yapılmaz.

### B2. Şifre sıfırlama ve güncelleme

- Mevcut/doğrulanmış kullanıcı için şifre kurtarma, güncelleme ve yenileme ayrı state-machine testleri almalı.
- Sunucu PUT başarılı olmuşsa sonraki session kontrolü başarısız diye “şifre değişmedi” denmez; yeniden giriş istenir. PUT başarısızsa işlem başarıyla tamamlandı denmez.
- Kullanıcı Google ile kayıtlı olsa bile **doğrulanmış** uygulama şifresi oluşturabilir ve aynı bulut hesabına parola ile giriş yapabilir. Google kimliği koparılmaz, yeni ikinci kullanıcı profili açılmaz.
- Şifreler uygulamanın localStorage profil payload'ına kaydedilmez. Auth session'ı UID ile eşleşmeden bulut profiline yazma yapılmaz.

### B3. 90 gün politikası ve güvenlik ayrımı

**İstenen ürün beklentisi:** 90 günde bir güvenlik kontrolü, yeni şifrenin değişim tarihini hatırlama ve kullanıcıya “90 gün sonra” bilgisi.

**Güvenli uygulama kararı:** 90 gün içinde parola değiştirmeyi *tamamen yasaklama*. Hesabı ele geçirilmiş kullanıcıyı veya şifresi sızmış kişiyi çıkmaza sokar. NIST SP 800-63B-4 rutin zorunlu rotasyonu tavsiye etmez. 90 günlük *hatırlatma* veya isteğe bağlı politika yapılabilir; olağanüstü güvenlik olayında şifreyi hemen değiştirme ve yeniden doğrulama daima açık kalır. Eski parolayı tekrar kullanma, ele geçirilmiş parola, yakın tarihli reauth ve session iptali ayrıca ele alınır.

Bkz: https://pages.nist.gov/800-63-4/sp800-63b.html

### B4. E-posta güncelleme

- Mevcut ve yeni adres doğrulaması korunur; işlem yarıda kesilirse gerçek e-posta değişmiş gibi gösterilmez.
- Uygulamanın veri profilindeki e-posta yalnızca Supabase Auth'un doğrulanmış nihai adresiyle eşlenir.
- Yanlış kod, gecikmiş mail, iki tarayıcı, yeniden açılan bağlantı ve kullanıcı değişimi test edilir.

### B5. Geçici/kalıcı kapatma ve yeniden açma

- **Geçici kapatma:** sahiplik doğrulaması + e-postayla OTP + son onay + **30 günlük** geri dönüş politikası.
- **Kalıcı kapatma:** e-postayla bağlantı + ayrı neden ekranı (diğer dahil) + son onay + **60 günlük** geri dönüş penceresi.
- Kapatılan hesapların saklama/geri açma/silme zaman damgaları **sunucu saati** ile tutulur; cron tekrarı idempotent olmalı, ikinci silme/yeniden oynatma başka hesabı etkilememeli.
- Kapatma öncesi kaydedilmiş veriler, oturum iptali, Auth satırı, profil ve Storage sahiplik ilişkisi; nihai silmede kontrollü, denetlenebilir akış gerekir.
- Hem 30/60 gün sınırlarının öncesi/sonrası hem de silme görevleri ile eşzamanlı açma talepleri QA üzerinde test edilir.

## C. Google OAuth — P1

- Başarılı **etkileşimli** Google login sonrasında 00:00–29:59 arasında aynı oturumu her işlemde tekrar doğrulatma.
- 30:00'da uygulamanın özel verileri gösterilmeksizin yeniden etkileşimli doğrulama istenir. Refresh token dönüşü, interaktif oturum saatini yenilemez.
- Hesap seçimi gerekli olduğunda sunulur; sırf sekme/route değiştiği için sürekli `prompt=select_account` tetiklenmez.
- Server-side doğrulanabilir Auth `amr`/`auth_time` ve sabit oturum süresi esas alınır; cihaz saati tek yetkili kaynak değildir. Çoklu sekme ve ağ kesintisi fail-closed test edilir.
- Oturumun sona ermesi **kaydedilmiş diğer iki hesabın profilini silmemeli**.

Bkz: https://supabase.com/docs/guides/auth/sessions

## D. Aynı cihazdaki üç hesap — P0 veri bütünlüğü / P1 refactor

- Aynı cihazda en fazla **üç hatırlanan hesap**: her biri ayrı ve benzersiz Supabase `authUid`; kullanıcı adı tek başına oturum kimliği olarak kullanılmaz.
- Bugünkü tek `b1` JSON blob'u ve ortak `b1sb` Auth session'ı çoklu sekmelerde risk oluşturur.
- Hedef: **UID başına fiziksel depolama anahtarı** + meta indeks + UID'ye bağlı aktif oturum anahtarı. Legacy `b1` migrasyonu `copy → validate → readback → commit`; veri doğrulanmadan eski blob silinmez.
- Bir hesaba ait not, görev, rapor, proje, Pomodoro tarihi, kullanıcı adı veya email başka UID'ye yazılamaz. `sbPush` ve DB RPC hem UID hem session sahipliğini doğrular.
- Aynı hesap iki cihazda eşzamanlı değiştirilirse sunucu `revision` ve **optimistic concurrency** ile eski snapshot yazımını reddetmeli; yanlışlıkla “son yazan kazanır” olmaz.
- QA kabul: üç hesap, iki tarayıcı, en az 20 geçiş, aynı anda kayıt, çevrimdışı yazım, yarım kalan sync, silinen hatırlanan hesap ve bozuk tek hesap JSON'ı. Diğer hesapların satır sayısı/veri hash'i değişmemeli.

## E. Pomodoro — P1

- Odak ve mola dakika girdileri **Enter** ile eklenir/güncellenir.
- Kullanıcı 60–600 dakika belirlerse ana sayaç, odak ekranı, PiP ve tarayıcı başlığında kalan süre saat/dakika/saniye gösterilir; örn. 90 dakika → `1 sa 30 dk 00 sn`.
- Bu yalnızca **sunum** katmanıdır; 90 dakika hâlâ 5400 saniye sürer. Sekme arka planda/uykuda olduğunda `end` timestamp üzerinden gerçek zaman hesaplanır.
- Tamamlama, duraklatma, yeniden başlatma, beşinci uzun mola, ilerleme raporu ve farklı hesap verisi için regresyon testi.
- PiP desteklenmeyen cihazda odak ekranı fallback.

## F. Tarayıcı dışı bildirimler — P2

- Web Push için Service Worker, Push API, Notifications API, VAPID ve sunucu tarafı teslimat gerekir; uygulama içi bildirim merkezi tek başına yeterli değildir.
- İzin yalnızca kullanıcının açık eylemiyle sorulur; tarayıcı ve cihaz başına izin/subscription saklanır.
- Push abonelikleri `user_id + device` ile izole edilir; logout veya hesap değişiminde yanlış kullanıcının cihazına yeni kullanıcı verisi gönderilmez.
- iOS/iPadOS'ta Home Screen web app gereksinimi, masaüstü ve Android desteği ayrıca anlatılır ve sınanır.
- Abonelik iptali, 404/410 invalid endpoint temizliği, network retry/backoff, gizli VAPID anahtarının sunucuda tutulması gerekir.
- Otomatik bildirim spam'i yok; reminder saatleri, günlük sınır ve sessiz saatler kullanıcı tarafından yönetilir.

Bkz: https://developer.mozilla.org/en-US/docs/Web/API/Push_API

## G. QA ortamı ve release güvenliği — P0

**19 Kasım 2026 read-only bulgusu:** Prod `public.user_data` 7 satır ve aktif hesap denetimleri 7; bekleyen silme yok. Prod `public` tablolarında RLS etkin. QA Supabase projesinde uygulamaya ait **`public` tablo sayısı 0**; `user_data` ve `iydu_usernames` yok. Bu QA, üretim auth/data yaşam döngüsünün gerçekçi E2E testini henüz yapamaz.

### QA hazırlık sırası

1. Prod'dan **şema/izin/fonksiyon tanımları** read-only çıkarılır, gizli anahtar veya kullanıcı PII'si aktarılmaz.
2. Şema migration'ları izole QA projesine uygulanır; içi boş/test hesaplı tutarlı tablo ve trigger kurulur.
3. Rollback veya `down` planı ve readback testi sağlanır; prod değişikliği gerekirse ayrıca onay alınır.
4. QA endpoint/e-posta sınırları production domain, Resend/Google credentials ve gerçek kullanıcı hesaplarından ayrılır.
5. Her özelliğin test raporunda `PASS / FAIL / NOT TESTED` ayrımı ile GitHub Actions bağlantısı kaydedilir.

## H. Teslim sırası ve kapsam dışı varsayımlar

**P0:** Auth/recovery/email/closure için state-machine ve QA şema paritesi; prod RLS/RPC review; üç hesabın veri kaybını önleme.
**P1:** Google 30 dakika reauth, optimistic concurrency, Pomodoro UX ve hesap başına storage migration.
**P2:** Tarayıcı dışı push, performans ve erişilebilirlik iyileştirmeleri, kontrollü modülerleştirme.

**Tamamlandı işaretleme:** Yalnızca ilgili PR merge + yayında dosya eşleşmesi + CI + gerekli QA/user smoke testi tamamlandıktan sonra. Önizlemedeki başarılı testler, gerçek e-posta ile uçtan uca test yerine geçmez.

**Şifre/OTP/recovery bağlantıları ve hizmet anahtarları GitHub issue, PR veya loglara asla yapıştırılmaz.**
