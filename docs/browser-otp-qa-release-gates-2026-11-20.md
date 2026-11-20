# Yeni tarayıcı doğrulaması — QA ve yayın engelleri

Durum: **TASLAK / YAYINLANMADI** · PR #40, PR #38 üzerine kuruludur · 20 Kasım 2026.

## Tasarım

Her **yeni Supabase Auth oturumu** (JWT `session_id`) özel kullanıcı verisine erişmeden önce 6 haneli e-posta OTP'si doğrular. Aynı tarayıcıdan yeni bir Auth oturumu açıldığında da doğrulama yeniden istenir; cihaz parmak izi veya izleme çerezi kullanılmaz.

- Edge `browser-verification`: Supabase `/auth/v1/user` ile bearer doğrulaması, JWT `sub/session_id` eşleştirmesi, yalnızca service-role RPC'ye erişim. Kullanıcı adresi istemciden değil, veritabanından okunur. Resend e-postası harici tarayıcı açmayı gerektirmez.
- DB `iydu_private.browser_session_challenges`: 10 dakika süre, 5 yanlış giriş, dakikalık/saatlik yeniden istek sınırları, tek kullanımlık hash ve ilgili Auth session.
- DB `browser_verified_sessions`: yalnızca doğrulanan `(uid, session_id)` çifti onaylı. Bir tarayıcıdaki onay diğer tarayıcıya geçmez.
- `iydu_account_access_allowed()` ve üç tablo üzerindeki **RESTRICTIVE** RLS: doğrulanmamış veya kapanmış/şifresi süresi dolmuş hesaplar doğrudan Data API ya da CAS/Load RPC ile özel veri okuyamaz veya değiştiremez.
- Ön yüz giriş / hatırlanan Google Continue yolu, veri çekilmeden **önce** sunucu doğrulamasına girer. OTP onayında normal giriş akışına dönülür.

## Test kanıtı

- Supabase **QA**: `supabase/qa/browser-session-verification-assertions-qa-only.sql` başarılı. Yanlış kod, tekrar kullanma, 5 hata kilidi, UID/session eşleşmezliği, ikinci oturumun kapalı kalması, doğrudan tablo sorgusunun engellenmesi ve kapanmış hesap doğrulandı. SQL `ROLLBACK` ile sentetik veriler geri alındı.
- Supabase **QA**: Yeni RLS altında `supabase/qa/cas-safety-assertions-qa-only.sql` başarılı. Farklı günlerdeki günlük kayıtlarının korunması, geçmiş sürüm kurtarma, üç hesap ayrımı ve kapalı hesap erişim reddi.
- GitHub: `Cross-device sync safety` tüm Node regresyonları ve Edge/istemci sözdizimi testleri [başarılı](https://github.com/badgalnurkan/badgalnurkan/actions/runs/44630120938).
- GitHub: `Report period unlock regression` altında Chromium, WebKit ve Firefox browser işleri [başarılı](https://github.com/badgalnurkan/badgalnurkan/actions/runs/44630121130). **Ayrı `reports` işi, `iydu_save_cas` dağıtımını bloklamak için bilerek başarısızdır.** Kaldırılmadı.

## Kapanmamış yayın kapıları

1. **Üretim DB eski `iydu_save` kör yazma tehlikesi taşıyor.** Önce PR #38 CAS + journal archive, sonra PR #40 session OTP; SQL/Edge/frontend koordineli sürüm kontrolü şart.
2. QA'da gerçek Supabase Auth JWT'leri, üç bağımsız gerçek test hesabı ve gerçek e-posta teslimatıyla 2+ tarayıcı E2E henüz yok. Tarayıcı testleri mock sunucu kullanıyor.
3. Resend alan adı doğrulaması, gönderim başarısı ve Supabase Auth SMTP şablonları aynı şey değildir. Gerçek Inbox/Spam teslimatı, yenileme ve hata mesajları ayrı ölçülmeli.
4. 30 dakika **aktif Google oturumu sonlandırma** (sadece hızlı Continue sınırlaması değil), tamamen kodla e-posta değişimi, şifre süresi/kurtarma istisnaları, 30/60 günlük retention cron ve Web Push henüz uçtan uca doğrulanmadı.
5. QA Edge function production'a kurulmadı; PR40'ın Vercel preview'su mevcut statik `SUPABASE_URL` yüzünden **canlı Supabase'e bağlanma riski taşıyor**. Gerçek kullanıcı ile preview testi yapılmamalı.
6. Üretimin özel ve şifrelenmiş veritabanı yedeği, izole restore tatbikatı, sürüm yükseltme/rollback ve canary testi yok.
7. Güvenlik danışmanındaki `SECURITY DEFINER` fonksiyon erişim uyarıları ve leaked password protection ayarı değerlendirilmeden sıfır açık iddiası yapılamaz.

**Bu nedenle PR40 taslak bırakılmıştır; production'a merge, DB migration veya Edge deploy yapılmamıştır.**

## Kullanıcı deneyimi sınırları

Doğrulanmamış yeni tarayıcı, günlüğe erişemez. OTP gönderimi başarısızsa oturum açık kalabilir ancak özel veriler **sunucu tarafından reddedilir**. Kullanıcı kodu orijinal tarayıcıda girer, e-postadaki bağlantıya basma zorunluluğu yoktur.

Yayın kanıtı olarak en az üç QA hesapla Google/şifre giriş, OTP yenileme, yanlış kod/yeniden kullanım, bağlantı kesintisi, sekme kapanması, 30/60 gün lifecycle, 90 gün şifre, Web Push ve gerçek telefon–bilgisayar senkronizasyonu gereklidir.
