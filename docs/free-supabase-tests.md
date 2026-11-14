# Ücretsiz Supabase Auth ve tarayıcı testleri

## Çalışma biçimi

Bu proje herkese açık bir GitHub deposudur. GitHub Actions'ın standart
`ubuntu-latest` çalıştırıcıları herkese açık depolarda ücretsizdir:
https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job

`.github/workflows/local-supabase-auth.yml` her PR güncellemesinde:

1. GitHub'ın **geçici** Linux çalıştırıcısında Supabase CLI **3.1.0**
   kurar. `$RUNNER_TEMP/iydu-local-supabase` altında, GitHub deposundan
   ve canlı Supabase projesinden bağımsız bir yerel proje başlatır.
2. Docker içinde gerçek GoTrue (Supabase Auth), PostgREST ve PostgreSQL
   servislerini başlatır. Supabase'e `login`, `link`, `db push` veya
   `--remote` komutlarını çağırmaz.
3. Yalnızca yerel `API_URL` ve `ANON_KEY` değerlerini test ortamına alır.
   Gerçek kullanıcıların verilerine ya da üretim anahtarlarına erişmez.
4. `tests/supabase-local/bootstrap.sql` ile Auth kaydı sırasında çalışan
   mevcut iki trigger ve üç sahiplik/RLS tablosunun üretim yapısına uygun
   **sentetik kopyalarını** oluşturur.
5. `supabase/rollouts/username-integrity-staging.sql` dosyasını sadece
   **yerel** PostgreSQL üzerinde çalıştırır. Bu dosya PR içinde bir
   otomatik üretim migrasyonu değildir.
6. `tests/supabase-local/http-auth.cjs` ile gerçek Auth signup, e-posta
   ve şifreyle login, sunucu username rezervasyonu, ilk claim, yeniden
   adlandırma, alınmış isim hatası, RLS izolasyonu ve görev/günlük
   içeriğinin korunmasını sınar.
7. `tests/supabase-local/browser-login.cjs` ile mevcut `index.html`
   dosyasını Chrome'da açar. HTML'in **yalnızca RAM'deki test kopyasında**
   `SUPABASE_URL` ve `SUPABASE_KEY` değerlerini yerel servise yönlendirir.
   Gerçek sitenin dosyasını değiştirmeden e-posta girişini, oturumun
   yenilenmesini, rezervasyonsuz hesabın isim seçmesini ve sonrasında
   yeniden girişini test eder.

GitHub'ın PR kontrolleri arasında bulunan mevcut `Username integrity
(isolated PostgreSQL)` ve `Account consistency` işleri de çalışmaya
devam eder.

## Doğrulama kanıtı

2026-11-15 tarihinde PR #6 üzerinde,
`d8d9555ebb91c0412fd2b6064100027215640615` commit'i için:

- **Account consistency**: başarılı
- **Username integrity (isolated PostgreSQL)**: başarılı
- **Supabase Auth integration (free local stack)**: başarılı; gerçek HTTP
  Auth/API ve mobil ekran boyutunda gerçek Chrome `index.html` testi
  başarılı

Çalıştırma: https://github.com/badgalnurkan/badgalnurkan/actions/runs/43652296881

Canlı Supabase'e çalıştırılan **salt okunur** son sayımda 5 Auth hesabı,
5 `profiles` kaydı, 5 `user_data` kaydı ve 4 kullanıcı adı rezervasyonu
vardı; `iydu_my_username()` henüz canlıya yüklenmemişti.

## Bilinen sınırlar ve yayın kararı

Bu testler **üretimde güvenli yayın garantisi vermez.** Gerçek Google OAuth
consent/redirect yönlendirmesi çalıştırılmadı; yalnızca username metadata
olmayan hesabın uygulama davranışı sınandı. Gerçek SMTP ile e-posta onayı,
üretim Google yapılandırması ve çoklu cihaz eşzamanlı JSON düzenlemeleri
testten geçmedi. `iydu_save` hâlâ veri alanlarında son-yazan-kazanır
davranışı sergiler; sadece kullanıcı adı alanını korur.

**PR #6 taslak kalmalıdır.** Gerçek kullanıcı verileri korunurken üretime
SQL ya da frontend tek başına uygulanmamalıdır. Üretim dağıtımı için
ayrıca gizli yedek ve geri alma doğrulaması, gerçek OAuth/SMTP senaryoları
ve iki cihazlı veri kaybı önlemi gerekir.

Bu test kurulumu bir Supabase *ücretli branching hizmeti* oluşturmaz,
Docker servisleri GitHub job'u bittiğinde silinir. Sadece herkese açık depodaki
standart GitHub-hosted çalıştırıcı kullanılır. Lütfen daha sonra repo özel
(private) yapılırsa GitHub'ın o tarihteki kota/fiyatlandırmasını yeniden
kontrol edin.
