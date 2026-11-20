# E-posta değiştirme: kod doğrulama ve yayın koşulları

Durum: **QA doğrulama bekliyor, üretime alınmadı.** PR #42, PR #40'ın üzerine kuruludur.
Uygulama, Supabase Auth'ın kendi `/auth/v1/user` e-posta değişimi başlatma ve
`/auth/v1/verify` `type:email_change` doğrulama sözleşmesini kullanır; ayrı kimlik veritabanı oluşturmaz.

## 20 Kasım doğrulaması

- QA projesinin Supabase panelinde adres değişikliği postası bağlantı şablonu kullanıyordu. Kod şablonu kaydedildi. Sayfa yeniden yüklendikten sonra önizlemede `{{ .Token }}` ve yeni adres alanı doğrulandı. QA Email sağlayıcısında Secure email change etkin ve OTP uzunluğu 6.
- QA'da Google sağlayıcısı kapalı. Ayrı bir Google test istemcisiyle gerçek giriş ve sürenin dolması bekleniyor. SQL saat sınırı testi ve gerçek OAuth oturumu ayrı kontroller.
- Özel üretim yedeği ve izole geri yükleme henüz doğrulanmadı. Üretim Storage envanterinde bu kontrolde sıfır kova ve sıfır nesne vardı. Üretimde CAS yordamı mevcut değil; önceki kayıt yolu açık. Mevcut yayın koruması geçerli.
- Üretimdeki dört anonim SECURITY DEFINER yordamının tanımları ve şema yetkileri salt okunur incelendi. İki yordam kullanıcı adı uygunluğu için boolean döndürüyor. Eski yordam biçim sınırı uygulamıyor ve farklı kullanıcı adı tablosunu okuyor. İki aktarım yordamı geçici doğrulama akışına ait. Teslim alma süresine ve alıcı kanıtına bağlı; anonim ve oturum açmış roller public şemasında nesne oluşturamıyor. Bu inceleme gerçek kişilerin verilerini okumadı.
- QA için cihaz aboneliği, kuyruk, projeye özel Web Push anahtarı ve gönderim işlevi hazırlandı. Her iki proje bağımsız anahtar kullanır. İlk denetimde sıfır QA aboneliği vardı. Uygulama kapalıyken gerçek cihazda teslim hâlâ bekliyor.
- Korumalı önizlemede salt okunur tarayıcı denetimi için `node tests/qa-preview-network.cjs` kullanılır. Gerekirse `IYD_QA_ACCESS_FILE`, sabit QA adresi için özel Vercel erişim bağlantısını içeren yerel dosyayı gösterir. Denetim sonuçları giriş yapılmış oturumları kapsamaz.


## Geliştirilen davranış

- E-posta değiştirmeyi başlatan tarayıcıda mevcut ve yeni adres için 6 haneli OTP alanları açılır.
- Kodlar saklanmaz, loglanmaz; yanlış biçimli kod ağa gönderilmez.
- Her kod Supabase Auth sunucusunca doğrulanır. İki adresten biri başarıyla doğrulansa dahi uygulama **sunucu e-postayı değiştirmeden tamamlandı demez**.
- Kullanıcı kimliği doğrulama sırasında farklılaşırsa işlem kapatılır; yeni oturum token'ı yalnızca aynı Auth UID ise kabul edilir.
- İki aşama veya tek aşama kararı tarayıcıdan değil, Supabase'in gerçek `auth.users.email` bilgisinden verilir.
- Önizleme kopyası PR #41'de sadece QA Supabase'e bağlıdır; kullanıcılar gerçek production hesaplarıyla giriş yapmamalıdır.

## QA sahibi tarafından yapılacak ayar (gizli anahtar paylaşılmayacak)

1. QA Supabase → Authentication → Providers → Email bölümünde **Secure Email Change** etkin olduğunu doğrula; değişiklik için hem eski hem yeni adrese kod gönderilecek.
2. QA Supabase → Authentication → Email Templates → **Change email address** şablonuna
   `supabase/email-templates/change-email-otp.html` içeriğini uygula; `{{ .Token }}`
   6 haneli kodu gösterir, bağlantı gerektirmez. Yalnızca QA şablonunu değiştir, production'a dokunma.
3. QA'da iki ayrı disposable gelen kutusunu kontrol ettiğin bir test hesabı kullan. Her iki kodu da https://badgalnurkan-git-qa-browser-otp-e2e-20261120-5044.vercel.app üzerindeki ilgili alana gir. Buraya OTP veya parolayı gönderme.
4. İlk koddan sonra Auth email değişmemeli; ikinci koddan sonra QA Auth `/auth/v1/user` yeni email'i doğrulamalı. Hatalı/replay/süresi geçmiş kod ve yeni tarayıcıda tekrar giriş gereksinimi sınanmalı.

Supabase resmî kaynaklar:
https://supabase.com/docs/guides/auth/auth-email-templates
https://supabase.com/docs/reference/javascript/auth-verifyotp
https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook

## Otomatik kanıt ve açık sınırlar

- `tests/email-change-otp.test.cjs`: 5 Node testi, UID kapsamı, format doğrulaması,
  iki gelen kutusu, yanlış kod, tek kodla erken başarı olmaması.
- `npm test` bütün önceki testlerle birlikte çalışıyor. Chrome/WebKit/Firefox
  regresyonları GitHub Actions ile tekrarlanıyor.
- **Gerçek Supabase Auth Secure Email Change ve iki bağımsız gelen kutusu E2E henüz doğrulanmadı.**
  Bu tamamlanmadan PR42 veya ilgili QA kodu production'a merge edilmez.
- PR38 üretim CAS yedeği/restore, kullanıcı adı onarımı ve PR40 oturuma bağlı OTP
  geçişiyle birleştirilmeden bağımsız canlı yayın yapılmaz.
