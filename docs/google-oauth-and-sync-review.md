# Google OAuth ve iki cihazlı eşitleme — güncel doğrulama

Bu sayfa PR #6'nın **taslak**, canlıya uygulanmamış çalışma kaydıdır.

## Google OAuth

`index.html`, Google oturumunu Supabase'in
`/auth/v1/authorize?provider=google` URL'sinden başlatır.
Geri dönen URL fragmentindeki oturum belirteçleri
`/auth/v1/user` ile doğrulanır. Test edilen akış, Chrome'da
geçerli **yerel Supabase Auth** oturum belirteçleriyle callback'i,
hata dönüşünü, URL temizliğini ve kullanıcı adı seçim ekranını doğruladı.

**Gerçek Google hesap seçimi/consent, Google Cloud client ID ve redirect
yapılandırması, canlı Vercel ortamından Google'a gidip dönüş
henüz test edilmedi.** Doğru yapılandırma yetkili bir test
hesabıyla manuel uçtan uca doğrulama gerektirir.

Google OAuth yapılandırmasına ilişkin resmî kaynaklar:

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/redirect-urls

## İki cihaz arasında JSON kayıtları

Önceden `iydu_save` tüm JSON'u kör biçimde değiştiriyordu.
İlk denemede CAS fonksiyonunun tek başına yeterli olmadığı
gerçek testle **kanıtlandı**: eski fonksiyon yeni veriyi
üzerine yazabiliyordu.

Bunun üzerine **taslak sunucu ve istemci birlikte düzeltildi**:

- `supabase/rollouts/username-integrity-staging.sql`,
  `iydu_save_cas(p_expected_data,p_data)` ile atomik veri
  karşılaştırması yapar; kullanıcıya ait olmayan kayıt
  üzerinde değişikliğe izin vermez.
- Eski `iydu_save` kör yazması reddedilir; doğrudan
  tablo mutation yetkileri kaldırılır. Kullanıcılar eski
  istemcilerle oturum açabilir ama bulut kaydı yeni
  uygulama yüklenene kadar geçici olarak başarısız olur.
- `index.html` onaylanan ham sunucu JSON'unu taban
  alır. Sonraki kullanıcı değişikliklerini ayrı yerel
  taslak dosyasına kaydeder. Eşzamanlı yazmaların
  yalnızca güncel olanı kabul edilir.
- Çakışan cihaz verisi **otomatik üzerine yazılmaz**.
  Yerel taslak sayfa yenilemesinde korunur, uyarı
  görünür ve yerel kopya indirilebilir. Buluttaki
  sürüm seçilirse yerel taslak ayrı kurtarma anahtarına
  arşivlenir; otomatik ve sessiz birleştirme yapılmaz.
- Önceki uygulama sürümünden kalan farklı bir
  yerel profil de ayrı yedeklenir ve indirme
  seçeneği gösterilir.

Bunun açıklaması, geçiş ve geri alma riskleri:
[CAS yayın planı](cas-rollout-release-plan.md).

## Gerçek test kanıtı

GitHub Actions'ta ücretsiz ve sadece geçici Docker
Supabase/Chrome kullanıldı; üretim Supabase'i yoktur.
`3f4c67a2c888bc4523a9fc3cbf2e4229acbb163e`
commit'inde üç test iş akışı **SUCCESS**:

- **Account consistency** — JS regresyonları
- **Username integrity (isolated PostgreSQL)** — RLS, ACL,
  kullanıcı adı sahipliği ve gerçek SQL
- **Supabase Auth integration (free local stack)** — gerçek
  e-posta/şifre API ve Chrome giriş, kullanıcı adı alma,
  iki tarayıcı bağlamında görev/günlük çatışması,
  sayfa yenilemesinden sonra taslağın korunması,
  yerel yedek indirme ve arşivli bulut kurtarma;
  eski/direkt yazıcının reddedilmesi.

Doğrulanmış iş akışı:
https://github.com/badgalnurkan/badgalnurkan/actions/runs/43654357943

## Yayın kapıları

Üretimde eski istemcilerin geçişinin planlanması,
özel yedeğin geri yükleme testi, gerçek Google OAuth
consent ve SMTP testleri, security-definer fonksiyon
yetki incelemesi ve geri alma planı **açıktır**.

Taslak PR canlıya otomatik birleştirilmemeli.
Bu çalışma güvenli yazma mekanizmasının test ortamında
işlediğini kanıtlar; gerçek sistemin tamamen
hatasız olduğu iddiası değildir.
