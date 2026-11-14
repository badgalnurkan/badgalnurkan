# Senkronizasyon koruması — üretime geçiş kapısı

> Bu dosya taslak PR #6 içindir. 2026-11-15 itibarıyla canlıya uygulanmadı.
> Gerçek kullanıcı verilerinde hiçbir otomatik düzeltme, migration veya
> elle yazma yapılmadı.

## Çözülen teknik problem

Önceden `iydu_save`, kullanıcıya ait bütün görev/günlük JSON'unu
`expected` veya sürüm bilgisi olmadan `UPDATE` edebiliyordu.
A ve B cihazı aynı başlangıç kaydını okuyup farklı değişiklikler
yazdığında B'nin eski anlık görüntüsü A'nın yeni verisini siliyordu.

Taslak SQL `supabase/rollouts/username-integrity-staging.sql` tek
transaction olarak:

- `iydu_save_cas(p_expected_data,p_data)`: PostgreSQL'de
  `WHERE user_id=auth.uid() AND data=p_expected_data` koşuluyla
  atomik `UPDATE` uygular. Yalnızca güncel bazla yazan cihaz başarılı
  olur. `false` durumunda hiçbir satır değişmez.
- Eski `iydu_save`: sürümü olmayan **kör yazmaları reddeder**.
  Eski tarayıcı oturumu login olabilir ancak yeni frontend yüklenene
  kadar buluta kaydedemez. Eski istemciye başarı gösterilmemelidir.
- `authenticated` ve `anon` için
  `user_data`, `iydu_usernames`, `profiles` üzerindeki doğrudan
  `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` yetkileri
  kaldırılır; yalnızca RLS ile korunan `SELECT` verilir.
- Auth'a bağlı yazma yapan `iydu_set_username` ve
  `iydu_migrate_legacy` fonksiyonları açık `auth.uid()` kontrolü,
  boş `search_path`, tam nitelikli tablo adları ve yalnızca
  `authenticated` için `EXECUTE` ile `SECURITY DEFINER`
  olarak düzenlenir. Gerekli ayrı güvenlik incelemesi olmadan
  canlıya uygulanmamalıdır.

## Yeni tarayıcı davranışı

- Uygulama `sbPull` ile gelen **ham** JSON'u karşılaştırma
  tabanı olarak tutar; tahmin edilen bir hesap objesi kullanılmaz.
- Her yerel değişiklik bulut isteğinden **önce** kullanıcı UID'sine
  bağlı ayrı bir kalıcı taslak olarak saklanır.
- Arka arkaya kayıtlar tek uçuşta sırayla gider; yeni düzenleme
  mevcut isteğin ortasında yapılırsa sonraki CAS için yeniden
  kuyruklanır.
- CAS ret yanıtında buluta başka bir kayıt **yazılmaz**.
  Yerel taslak saklanır, açık ve erişilebilir uyarı gösterilir.
- Kullanıcı yerel verisini JSON olarak indirebilir. Bulut sürümüne
  geçmeyi seçerse taslak önce ayrı bir kurtarma anahtarına
  yedeklenir. Çakışan alanlar otomatik ve sessiz birleştirilmez.
- Sekme yeniden açılsa da henüz eşitlenmemiş taslak geri yüklenir.
  Diğer cihazın daha yeni bulut kaydı bulunursa bulutu ezmeden
  kullanıcıya çakışma gösterilir.
- Önceki sürümden kalan, doğrulanamayan tarayıcı önbelleği
  ayrı bir kurtarma anahtarına arşivlenir ve yedek indirme
  seçeneğiyle bildirilir.

## Doğrulanacak test matrisi

- SQL: görev ve günlük verisi, nickname ve kullanıcı adı rezervasyonu,
  RLS ve doğrudan yazma yetkilerinin kaldırılması
- Gerçek Supabase Auth: e-posta+şifre giriş/kayıt, oturum kimliği,
  isim alma ve reddedilen eskimiş yazma
- İki ayrı Chrome tarayıcı bağlamı: A kaydeder, B eski bazla
  yazmaya çalışır, B'nin kaydı reddedilir, yerel taslak korunur,
  sayfa yeniden açılınca taslak kalır, yedek indirilir ve
  bulut sürümü seçilerek yeni bir CAS başarıyla yapılır
- Görev ve günlükler dışında profil, pomodoro, tema, reset,
  hesap taşıma ve başka cihazda oturum gibi kritik akışların
  regressions testleri
- **Kapsam dışı:** gerçek Google OAuth consent ve üretim yönlendirmeleri,
  gerçek SMTP doğrulama, Vercel prod dağıtımı, çalışır
  tarayıcıda eski uygulama sürümünden yeniye geçiş.
- Bu aşamada otomatik alan-bazlı birleştirme yoktur. Aynı veri alanına
  yapılan iki değişiklik kullanıcının kararı olmadan birleştirilmez.

## Yayın öncesi zorunlu güvenlik ve operasyon kapıları

1. Gerçek üretim veritabanı için bağımsız, özel ve geri
   yükleme denemesi yapılmış yedek; eski SQL function DDL ve
   role GRANT/RLS tanımlarının ayrı bir geri alma kopyası.
2. Yeni `SECURITY DEFINER` fonksiyonları için Supabase
   güvenlik danışmanı çıktısı ve manuel yetki denetimi.
3. Sunucu SQL ve yeni `index.html` sürümünün eşgüdümlü yayını:
   SQL önce uygulanırsa eski istemciler giriş yapabilir ama
   **bulut verisi yazamaz**. Bu geçişte hangi kullanıcılara
   nasıl bilgilendirme yapılacağı ve zorunlu sayfa yenileme
   yöntemi ayrıca planlanmalıdır. PR'ın otomatik
   birleştirilmesi bunun yerine geçmez.
4. OAuth/SMTP gerçek sağlayıcı testi yalnızca izinli bir
   test hesabında; şifre ve client secret sohbete verilmez.
5. Uzun açık kalan eski sekmeler ve cihazlar arasında
   kurtarma testi; gerçek hesapların verileri üzerinde
   deney yapılmaması.
6. Geri alma yalnızca frontend/SQL birlikte ve mevcut
   kullanıcı verilerini koruyacak şekilde planlanmalı.
   SQL'i kör kaydı tekrar açarak geri almak veri kaybı
   korumasını kaldırır.
7. Mümkünse canary kullanıcılar ve yazma hatası izleme.

**Yayın kararı:** Testler geçse bile bu operasyon kapıları
tamamlanmadan PR #6 draft olarak kalmalıdır. Üretim
ortamında gerçek Google girişinin uçtan uca doğrulanmış
olduğu veya çakışan görevlerin otomatik birleştirildiği
iddia edilmemelidir.
