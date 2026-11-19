# Improvin' Your Day — Güvenlik ve sürüm hazırlığı doğrulaması

**Tarih:** 2026-11-19 · **Kapsam:** GitHub `main`, üretim Supabase `flcfqwndqfmbritaywfb`, ayrı QA Supabase `lvomrcqytfygcmguojcj`.

> Bu belge, okuma amaçlı denetim sonuçlarını kayıt altına alır. Üretim verileri, şifreler, anahtarlar, Auth ayarları, SMTP ve dağıtım değiştirilmemiştir. Bulgular tarihsel bir anlık görüntüdür; yeni sürümden önce sorguları yeniden çalıştırın.

## Doğrulanmış bulgular

| Alan | Sonuç | Kanıt / sınır |
| --- | --- | --- |
| Auth verisi | 7 Auth hesabı, 7 profile, 7 user_data; yetim veri 0 | Salt SELECT ile sayım; hesap içeriği okunmadı |
| Kullanıcı adı | 6 username rezervasyonu / 7 kullanıcı | Eksik 1 rezervasyon için kimlik uydurulmadı / otomatik veri düzeltmesi yapılmadı |
| RLS | public'teki 3 kullanıcı tablosunda etkin; mevcut sahiplik politikaları ve RESTRICTIVE hesap yaşam döngüsü kuralları var | Statik şema kontrolü, üç ayrı token ile sızma testi yerine geçmez |
| Çok cihazlı kaydetme | **BLOCK** | Üretimde authenticated rolüne açık `iydu_save`, tam JSON'u koşulsuz upsert ediyor. Aynı UID için eski kopya yeni veriyi ezebilir |
| Google hızlı dönüş | Var | `iydu_quick_resume_status()` OAuth AMR zamanını esas alıyor. Bu yalnızca *Continue* kısayoludur; aktif uygulama 30. dakikada otomatik çıkış yapıyor kanıtı değildir |
| Hesap yaşam döngüsü | 30/60 gün kontrol şeması, hesap silme cron'u aktif (15 dakikada bir) | Gerçek e-posta teslimi, süre sonu silme ve yeniden açma uçtan uca doğrulanmadı |
| Push | **WARN** | VAPID anahtar kaydı 0, kullanıcı cihaz aboneliği 0; zamanlayıcının varlığı site kapalıyken bildirim geldiği anlamına gelmez |
| Ayrıcalıklı RPC | **WARN** | Anon rolünün çağırabildiği bazı SECURITY DEFINER fonksiyonları mevcut; kod ve yetkiler işlev bazında incelenmeli |
| QA şema eşliği | **BLOCK** | QA projesinde public `profiles`, `user_data`, `iydu_usernames` tabloları yok; gerçek hesap testi üretim verisine dokunmadan başlayamaz |

Çalıştırılmış, salt-okuma kontrolü: [`database/release-preflight-readonly.sql`](../database/release-preflight-readonly.sql). Üretimde **1 BLOCK, 3 WARN, 6 PASS** döndürdü. PASS yalnızca ilgili statik kontrolün geçtiği anlamına gelir.

## Mevcut geliştirmeler — yeniden yazma yerine değerlendirme

- [PR #35](https://github.com/badgalnurkan/badgalnurkan/pull/35): Pomodoro Enter ile kayıt; >=60 dakika odak / mola için saat-dakika-saniye gösterimi, ana ekran / odak / PiP; testler. Henüz `main` değil.
- [PR #37](https://github.com/badgalnurkan/badgalnurkan/pull/37): üç hesap için UID'ye özel storage modülü ve regresyon testleri. Henüz `index.html` tarafından kullanılmıyor.
- [PR #6](https://github.com/badgalnurkan/badgalnurkan/pull/6): CAS / stale write engeli, kullanıcı adı tutarlılığı ve eski istemci geçiş planı. Taslak ve üretime uygulanmadı.
- [PR #24](https://github.com/badgalnurkan/badgalnurkan/pull/24): hatırlanan hesap değiştirme ve opsiyonel recovery OTP alanı. Gerçek SMTP testine bağlı taslak.
- [PR #23](https://github.com/badgalnurkan/badgalnurkan/pull/23): cihaz bildirimi/PWA opt-in, kullanıcı UID'sine bağlama. Gerçek Web Push teslimatı henüz kanıtlanmadı.

## Öncelikli sürüm kapıları

1. QA'da kişisel üretim verisi kullanmadan, gerekli veritabanı şeması + temel RLS ve RPC yapılarını eşit duruma getirin. Üretime bağlı preview üzerinde test hesabı açmayın.
2. SHA/şema beklentileri ve güvenli geri dönüşü doğrulayarak CAS dönüşümünü QA'da çalıştırın. İki cihazdan eşzamanlı yazmada ne bulut ne bekleyen yerel taslak kaybolmalı.
3. Üç ayrı QA Auth kullanıcısıyla tarayıcıları / sekmeleri değiştirerek kullanıcı adı, görev, not, Pomodoro, hesap kapatma ve yeniden açmada UID izolasyonu test edin. Her birinin eski `b1` yedeğini önce koruyun.
4. SMTP / Resend Free yapılandırmasını insan kontrollü dashboard'da doğrulayın. Altı haneli OTP ve e-posta değişikliğinde mevcut/yeni adres onayını, aynı ve farklı tarayıcı senaryolarını, süresi dolan ve tekrar kullanılan kodları test edin. Mail uygulamasının dış bağlantıyı belirli tarayıcıda açması web sitesi tarafından zorlanamaz; origin-bound PKCE/verifier veya kullanıcı tarafından girilen OTP güvenli alternatiftir.
5. Geçici kapatma (kod + Evet + 30 gün), kalıcı kapatma (e-posta bağlantısı + gerekçe + Evet + 60 gün), iptal ve gerçek temizlik job'unu yalnızca sentetik QA verisiyle kanıtlayın.
6. Google OAuth için sunucu-otoriteli 30 dakikalık *aktif oturum* kuralı gerekiyorsa, erişim kontrolünün yalnızca karşılama sayfasında kalmadığını doğrulayın. Süre dolunca kaydedilmemiş taslağı koruyun; refresh token yenileme, süreyi sessizce uzatmamalı.
7. Parola süresi için 90 günlük hatırlatma ve gerekli yeniden kimlik doğrulama davranışını sınayın. **Ele geçirilmiş parolayı değiştirmeyi 90 gün engelleyen mutlak kilit koymayın**; acil parola kurtarma yolu sürekli açık kalmalı. Güvenli varsayılan NIST SP 800-63B ile uyumlu olmalı.
8. Push: VAPID, cihazın açık rızası, kapalı tarayıcı, Safari / iOS Home Screen / Android ve oturum kapatma/hesap değiştirmede iptal; bildirim içeriklerinde özel görev metni bulunmamalı.
9. CI, test tarayıcıları, güvenlik danışmanları ve `database/release-preflight-readonly.sql` tekrar çalıştırıldıktan sonra *koordineli* üretim geçişi düşünün. Üretimde değişiklik için gerçek backup + restore testi ve rollback planı zorunlu.

## Sınırlamalar

- Denetim özel kullanıcı verilerini veya sıfırlama kodlarını göstermedi; 3 token'lı E2E yetki testi gerçekleştirilmedi.
- Resend gerçek inbox sonucu, üretimde gelen mail, mobil OS bildirimini kapalı tarayıcıda alma, verinin 30/60 gün sonra fiziksel silinmesi ve gerçek Google consent akışı bu incelemede doğrulanmadı.
- `PR #35` gibi tamamlanan kod parçaları, etkin sürümle eş anlamlı değildir. `main` ile yayındaki alan adlarında aynı commit olduğunu ayrıca dağıtım üzerinden karşılaştırın.

## Kaynaklar

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Auth sessions](https://supabase.com/docs/guides/auth/sessions)
- [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html)
