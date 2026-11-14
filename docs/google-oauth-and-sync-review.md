# Google OAuth ve iki cihazda veri tutarlılığı — doğrulama notları

Bu not PR #6'nın taslak durumunu belgelemek içindir. Üretim `main`
veya canlı Supabase üzerinde hiçbir değişiklik yapmaz.

## 1. Google ile gerçek giriş

Şu an uygulama, Google düğmesi tıklandığında Supabase Auth'un
`/auth/v1/authorize?provider=google` adresine yönlendiriyor ve
`redirect_to` olarak mevcut site kökünü gönderiyor.
Dönen `#access_token` ve `#refresh_token` fragmentlerini okuyup
`/auth/v1/user` ile doğruluyor. Ardından sunucudaki kullanıcı adı
rezervasyonuna bakıyor. İsim yoksa seçim formuna yönlendiriyor.

Ücretsiz yerel Chrome testinde, bir **gerçek yerel Auth oturumu**
ile fragment callback ve OAuth hata dönüşü denenir. **Bu test
Google'ın gerçek kimlik ekranı, izin verme, client ID/secret, Google
hesap bağlama veya Google sağlayıcı yönlendirmesini test etmez.**
`tests/supabase-local/browser-login.cjs` kodunda bu ayrım açıkça yazılıdır.

Google'ın gerçek E2E testinde ayrı ve izinli bir test Google hesabı ve
yönetim panelindeki OAuth yapılandırması gerekir. Google'ın yönlendirdiği
Supabase callback adresi `https://flcfqwndqfmbritaywfb.supabase.co/auth/v1/callback`
Google Cloud OAuth istemcisinde izin verilen redirect URI olmalıdır.
Supabase Auth içindeki izin verilen `redirect_to` adresi de test
edilecek site kökünü kapsamalıdır. Kullanıcıdan client secret veya
hesap şifresini sohbete yapıştırması istenmemelidir.

Resmî dokümanlar:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/redirect-urls

## 2. İki cihazın aynı JSON kaydını düzenlemesi

Canlı işlev `iydu_save(p_username,p_nick,p_data)` mevcut
`user_data.data` JSON'unu önceki sürümü kontrol etmeden değiştiriyor.
Örnek: A ve B aynı görevi görüyor. A görevi işaretliyor; B eski
ekranından günlük yazıyor. B'nin tam JSON kaydı A'nın değişikliğini
geri alabilir. Tek başına tarayıcıdaki `fetch` öncesi kontrol yeterli
değildir.

`supabase/rollouts/sync-cas-experimental.sql`, üretime konması
yasak ayrı bir **deney** fonksiyonu tanımlar:
`iydu_save_cas(p_expected_data,p_data)`.

Her kaydetmede PostgreSQL tek bir UPDATE içinde sunucudaki JSON ile
cihazın son onaylı JSON kopyasını karşılaştırır. İki cihaz aynı
kopyadan farklı kayıtlar yazarsa yalnızca ilk eşleşen yazma yapılır,
diğeri `false` döndürür. Böylece yeni RPC kullanan istemciler için
çakışma otomatik üzerine yazma ile sonuçlanmaz.

Bu deney tek başına **yeterli değildir**:
- Eski `iydu_save` RPC'si hâlâ açıktır; onunla veri üzerine yazılabilir.
- Mevcut RLS/GRANT ile doğrudan `user_data` UPDATE erişimi olabilir.
- Tarayıcı yeni CAS RPC'sini kullanacak şekilde güncellenmedi.
- Başarısız CAS durumunda yerel değişiklikleri kalıcı kurtarma
  yedeğine alan, iki cihazın sürümlerini kıyaslayan ve kullanıcının
  seçimine göre birleştiren arayüz yok.
- Oturum açılırken veya sekme yenilenirken eşitlenmemiş yerel
  değişiklikler otomatik kaybolmamalı. Buna yönelik kalıcı dirty-state
  kontrolü gereklidir.
- Hesap adı değiştirme, sıfırlama ve eski hesap aktarımı dahil tüm
  yazarların aynı eşzamanlılık sözleşmesine uyması gerekir.

**Üretim dağıtımına başlamadan önce:** Eski yazıcıların güvenli
biçimde devre dışı bırakılması, yeni istemcinin revizyon yönetimi,
başarısız yazmanın güvenli geri kazanımı, çok cihazlı tarayıcı
senaryoları, yedek ve geri alma planı birlikte geliştirilmelidir.

### CI deneyi

`tests/supabase-local/cas-experiment.cjs` yerel Supabase'de
iki bağımsız oturuma aynı JSON'u okutur; eşzamanlı CAS yazmalarından
yalnız birinin başarılı olmasını bekler. Ardından eski RPC'nin
hâlâ yeni veriyi ezebildiğini **özellikle doğrular**. Dolayısıyla
bu testin başarılı geçmesi bir güvenlik açığının tamamen çözüldüğü
anlamına gelmez; **yayın engelinin kanıtıdır**.

Canlı veritabanına SQL uygulanmadı; deney sadece geçici Github
Actions Supabase ortamında yürütülür.
