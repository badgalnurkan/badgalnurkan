# Ücretsiz gerçek Google OAuth testi — sadece yerel Supabase

Bu belge PR #6 içindir. Test **canlı Vercel'e ve canlı Supabase
projesine bağlanmaz**; yalnızca localhost üzerindeki örnek hesapları
kullanır. Üretim hesabı, mevcut müşteri verisi veya gerçek kişisel veri
ile denemeyin.

## Ön koşullar

- Node.js 22, Git ve Docker Desktop yüklü ve Docker çalışır durumda
- Google Cloud üzerinde Google Auth Platform'a erişim
- Yalnızca test için kullanılacak Google hesabı
- Herhangi bir ücretli Supabase branch/proje oluşturmayın
- `service_role`, Supabase secret veya Google client secret değerlerini
  GitHub'a, sohbetlere veya ekran görüntülerine koymayın

## A. Google Cloud üzerinde sadece TEST OAuth istemcisi

1. [Google Auth Platform](https://console.cloud.google.com/auth/overview)
   ekranında test projesi seçin. Ücretli API etkinleştirmeyin.
2. **Audience**: External / Testing (uygunsa). Test hesabını
   **Test users** listesine ekleyin.
3. **Data Access**: yalnızca `openid`, `email`, `profile`
   kapsamları. Fazladan hassas scope istemeyin.
4. **Clients → Create client**: `Web application`.
   - **Authorized JavaScript origins**:
     `http://127.0.0.1:4173`
   - **Authorized redirect URIs**:
     `http://127.0.0.1:54321/auth/v1/callback`
5. Client ID ve Client Secret'ı sadece kendi bilgisayarınızda saklayın.
   Production Google istemcisini bu test için değiştirmeyin.

Supabase referansı:
https://supabase.com/docs/guides/auth/social-sign-in/auth-google

## B. Kaynak kod ve yerel ortam

Proje henüz bilgisayarınızda yoksa:

```sh
git clone --branch fix/account-identity-consistency-20261115 https://github.com/badgalnurkan/badgalnurkan.git
cd badgalnurkan
```

Mevcut bir clone kullanıyorsanız, öncelikle kendi yerel
değişikliklerinizi yedekleyin ve ilgili dala geçin.

```sh
npm install --no-save --no-package-lock supabase@3.1.0
npx supabase init
```

`supabase/config.toml` dosyasındaki mevcut `[auth]`
bölümüne test sitesi adreslerini yerleştirin (aynı bölümü
iki kez eklemeyin):

```toml
[auth]
site_url = "http://127.0.0.1:4173"
additional_redirect_urls = ["http://127.0.0.1:4173/"]

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
skip_nonce_check = false
```

Projenin kökünde `.env` dosyası oluşturup kişisel
**TEST** OAuth istemci bilgilerinizi sadece yerel dosyaya girin:

```dotenv
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=YOUR_TEST_CLIENT_ID
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=YOUR_TEST_CLIENT_SECRET
```

`.gitignore` bu dosyayı saklamaya yardımcı olur, ancak
`git status` ile sırların GitHub'a eklenmediğini yine de
kontrol edin. `supabase/config.toml` içinde gerçek anahtarı
yazmayın; yalnızca `env(...)` referansı bulunsun.

## C. Yalnızca yerel Supabase kurulumunu başlatın

```sh
npx supabase start
npx supabase db query --file tests/supabase-local/bootstrap.sql
npx supabase db query --file supabase/rollouts/username-integrity-staging.sql
```

Bu iki SQL dosyası yalnızca bu komutlarda CLI'nin varsayılan
**local** hedefiyle çalıştırılmalıdır. `--remote`,
`supabase link`, `db push --remote` veya bir üretim DB URL'si
kullanmayın. Bu fixture temiz, yeni bir yerel kurulum için
tasarlanmıştır; aynı tablolar önceden varsa yeniden çalıştırmak
hata verebilir.

Çalışan Supabase CLI projesi kendi yerel `auth.users` ve
`public.user_data` tablolarında sentetik kullanıcılar oluşturur.

## D. Gerçek Google girişini kendi tarayıcınızda doğrulayın

Önce güvenlik kontrolü:

```sh
node tests/supabase-local/local-google-test-server.cjs --check
```

Sonra yerel siteyi açın:

```sh
node tests/supabase-local/local-google-test-server.cjs
```

Tarayıcıdan **yalnızca**
`http://127.0.0.1:4173/` adresine girin ve Google
düğmesine tıklayın.

Şu sıralamayı doğrulayın:

1. Google'ın **gerçek** oturum seçme/izin ekranı gösterilir.
2. Yalnızca test kullanıcısı ile devam edilir.
3. `http://127.0.0.1:4173/` adresine geri dönülür.
4. İlk defa girişte kullanıcı adı seçim ekranı gelir.
5. Benzersiz test adı seçildiğinde uygulama açılır.
6. Sayfa yenilenince hesap ve kayıtlı test görevleri kalır.
7. Çıkış / ikinci giriş aynı kullanıcıya döner.
8. Google girişinin iptalinde uygulama veri kaybı olmadan
   giriş ekranına döner.

Bir hata olursa yalnızca **hata metnini** paylaşın; tarayıcı
URL'sindeki token, OAuth `code`, Google Client Secret veya
kullanıcı e-posta bilgilerini paylaşmayın.

## E. Bitirme

Yerel sunucuyu Ctrl+C ile durdurun; gerekirse
`npx supabase stop` ile Docker test servislerini kapatın.
Bu testler ücretli Supabase projesi veya development branch
oluşturmaz.

## Kanıt sınırı

GitHub Actions, gerçek Supabase Auth API'si, gerçek Chrome
girişi, OAuth callback parçalarının işlenmesi ve Google
düğmesinin Google sağlayıcılı authorize URL'sini oluşturmasını
otomatik sınar. Ancak Google'ın **gerçek consent ekranı**
bu manuel adım tamamlanmadan geçmiş sayılmaz.

Üretimdeki Google Cloud callback adresi
`https://flcfqwndqfmbritaywfb.supabase.co/auth/v1/callback`
olabilir; bu **yerel test callback'i değildir**.
Üretim sağlayıcısı ve URL allowlist'ini değiştirmeden
önce canlı yayın için ayrı onay alınmalıdır.
