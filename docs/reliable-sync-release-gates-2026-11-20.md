## Güncel ek denetim — 20 Kasım 2026 (önceki notların üzerine geçer)

- Prod'da salt okunur kimlik bütünlüğü sayımı: **7 cloud veri kaydı, 1 eksik rezervasyon, 4 profil/kullanıcı adı farklılığı**, mevcut rezervasyonlarla JSON `u` arasında **0** farklılık. Bu durum doğrudan CAS'a geçişi engeller.
- `sync-cas-staging.sql` artık eksik rezervasyon veya profil kimlik sapması varsa **fail-closed** durur. Kullanıcıları yanlışlıkla kaydetme yetkisinden mahrum bırakmaz.
- `supabase/rollouts/username-reservation-reconcile-staging.sql`: şifre/Auth veya uygulamanın JSON içeriğini değiştirmeden rezervasyon ve görünür profil adlarını tek transaction'da eşler; çakışma varsa tamamı rollback. **Yalnızca yedek ve izole restore sonrası prod'a uygulanmalı.**
- `supabase/qa/username-reconciliation-qa-only.sql` QA üzerinde gerçek SQL içeriğiyle **PASS** (1 sentetik eksik rezervasyon ve 2 tutarsız profil, rollback). [Güncel CI](https://github.com/badgalnurkan/badgalnurkan/actions/runs/44745172342) Node güvenlik testleri başarılı.
- QA için production API'sinden izole tarayıcı testi PR #41 üzerinde hazırlanmıştır: https://badgalnurkan-git-qa-browser-otp-e2e-20261120-5044.vercel.app. Vercel Preview Protection nedeniyle oturum açılması gerekebilir; **gerçek üretim hesabıyla burada giriş yapmayın.**


---

# Güvenli çok cihazlı eşitleme — geliştirme durum raporu

Tarih: 20 Kasım 2026. Kapsam: PR #38 (güncel `main` tabanlı), üretim Supabase'e değişiklik **yok**.

## Teknik yaklaşım

- Bulutun onayladığı son ham JSON, istemcinin atomik karşılaştırma tabanı (`expected`). Eski `iydu_save` üretim geçişinde kapatılmadan yeni sürüm yayınlanamaz.
- `cross-device-sync.js`, **UID + sekme ID** anahtarıyla kalıcı yerel taslak saklar. Kaydetme isteği onaylanmadan bu taslak kaldırılmaz. Tarayıcı kapanırsa önceki sekmelerin taslakları ayrı anahtarlarda kalır; yeni sekmede saptanır ve indirme olanağı sunulur.
- Üç yönlü birleştirme (ilk baz, yerel, güncel bulut) birbirinden bağımsız nesne alanlarını, örneğin farklı tarihli günlükleri birleştirir. Aynı alanın iki farklı güncellemesi, silme/düzenleme yarışı ve birlikte değiştirilen listeler **çakışma** olarak durdurulur.
- Çakışan veriler `iydu.sync.conflict.v2.<uid>.<tab>` altında saklanır. Bulutu seçme işlemi önce özel arşiv oluşturur; ardından sunucudan en güncel kaydı tekrar okur. Sessiz silme yoktur.
- `index.html` normal login ile hatırlanan Google Continue / page reload için **aynı CAS aktivasyonunu** kullanır. İlk girişte mevcut cihaz kopyası ile bulut farklıysa cihaz kopyası ayrı kurtarma yedeğine alınır.
- App açık/önde iken 12 saniyelik yenileme, odak/çevrimiçi dönüşlerinde ek kontrol. Düzenlenmekte olan input'a uzaktan gelen veri zorla uygulanmaz. Bu, **eventual sync**, milisaniyelik gerçek zamanlı Realtime değildir.
- Buluta kayıt kesinleştirilmeden arayüz kesin başarı ilan etmez; çevrimdışı, çakışma ve önceki sekme taslağı ayrı görünür uyarılardır.

## Supabase QA kanıtı

`lvomrcqytfygcmguojcj` (QA) üzerinde şu kaynaklar uygulandı/test edildi:
`supabase/rollouts/sync-cas-staging.sql`, `supabase/rollouts/journal-revisions-staging.sql`, `supabase/qa/cas-safety-assertions-qa-only.sql`.
QA'ya özel sentetik oturum kapısı `supabase/qa/account-access-shim-qa-only.sql` üretim oturum politikasını **tam olarak taklit etmez**, yalnızca test için aktif/pasif hesap state'ini kontrol eder. Canlıda `iydu_account_access_allowed()` gerçek session_id kontrolünü içerir.

QA'da **PASS**: 19 Kasım günlüğünün eski telefon kaydıyla silinememesi; iki günlüğün uzlaştırılması; bilinçli silinen günlüğün geçmiş sürümünden geri getirilmesi; eski kör yazma ve doğrudan yetkilerin reddi; üç kimliğin birbirinden veri/history okuyamaması; kapalı hesabın CAS/history erişiminin reddi. Sentetik SQL kayıtları `ROLLBACK` ile geri alındı.

GitHub `Cross-device sync safety` workflow; güvenlik motoru, tüm Node yapısal testleri ve uygulama sözdizimini denetliyor.

**Güncel CI kanıtı:** PR #38 SHA `b92a4091060e...` için `Cross-device sync safety` testleri [başarılı](https://github.com/badgalnurkan/badgalnurkan/actions/runs/44625818252). Aynı HEAD için `Report period unlock regression` altındaki Chromium/WebKit UI ve Firefox password recovery işlerinin ikisi de **başarılı**; ayrı `reports` işi yalnızca yeni `iydu_save_cas` çağrısını henüz onaylı canlı sürüm olmadığı için reddeden bilinçli koruma nedeniyle **başarısız**. [Karma workflow](https://github.com/badgalnurkan/badgalnurkan/actions/runs/44625818260) bir üretim onayı değildir. Bu workflow'nun yeşil olması dış Google consent/SMTP, fiziksel telefon, son kullanıcının tarayıcısı ve canlı yayına uygunluk anlamına gelmez.

## Bilerek açık bırakılan yayın engelleri

1. **Canlı veritabanında `iydu_save` hâlâ kör güncelleme yapıyor.** Üretim CAS ve günlük-history şeması kurulmadı. PR taslak kalmalı.
2. Canlı özel yedeği, restorasyon tatbikatı ve zamanlı geri alma prosedürü yok; Free planda yönetilen günlük backup/PITR varsayılamaz.
3. QA ön yüzü şu anda dışarıdan erişilen bir gerçek kullanıcı tarayıcı test ortamı olarak ayrılmadı. Preview'daki sabit Supabase URL **üretime işaret eder**; orada test hesabı açılmamalı.
4. Çakışan **aynı günlük** veya aynı görev listesi alanı otomatik birleştirilmez. Kullanıcıya iki kopya indirtilir; güvenli elle uzlaştırma arayüzü eksik.
5. Kapanan sekmede kalan orphan taslaklar **korunur ve indirilebilir**, ama sahibinin açık onayı olmadan yeni sekmede otomatik birleştirilmez. Aktif eski sekmeleri ayırt edecek mekanizma geliştirilmelidir.
6. Günlük sürüm geçmişinin sunucu RPC'si var, kullanıcıya dönük geçmiş tarayıcısı ve geri getir düğmesi yok.
7. Cloud hesabı olup isim rezervasyonu bulunmayan tarihsel kullanıcı için kullanıcı adı talep akışı ve server-owner UID tutarlılığı ayrıca tamamlanmalı.
8. Eski açık sekmelere güncelleme zorunluluğu ve durdurulan cloud yazma uyarısı sağlanmadan SQL/ön yüz yayınlanmamalı.
9. Site dışı bildirimler, SMTP ve hesap yaşam döngüsü regresyon testleri bağımsız olarak doğrulanmalı; senkronizasyon yayını bunlara bağlı hesap state'i kurallarını bozmamalı.

## Koordineli yayın sırası

(1) Özel production dump + doğrulanmış izole restore → (2) Gerçek QA Auth üzerinde 3 hesap / 2 tarayıcı / offline + token refresh + telefon E2E → (3) CAS yetkileri ve Security Definer revizyonu için güvenlik danışmanları → (4) Eski istemcilerin bekleyen taslakları için kurtarma politikası → (5) SQL, Edge, web frontend koordineli kontrollü geçiş → (6) canlı canary, rollback ve log izlemesi.

Bu taslak **yayınlandı** veya **bütün kullanıcıların verisi artık güvende** anlamına gelmez.
