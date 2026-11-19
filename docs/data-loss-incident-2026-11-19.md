# P0 — 19 Kasım günlük kaybı / iki cihaz eşitleme incelemesi

**Durum:** Açık olay. Bu belge canlıya uygulanmış düzeltme değildir. **Canlı kullanıcı kayıtlarına dokunulmadı.**

## Doğrulanan teknik bulgular (20 Kasım 2026, salt okunur inceleme)

- Üretimde `public.iydu_save(text,text,jsonb)` eski JSON'un güncelliğini kontrol etmeden `INSERT ... ON CONFLICT DO UPDATE SET data=EXCLUDED.data` çalıştırıyor. Aynı hesaptaki eski cihaz daha yeni günlüğü/görevi silebilir.
- `authenticated` rolünün `public.user_data` üzerinde doğrudan INSERT/UPDATE/DELETE yetkisi var; yalnızca yeni bir CAS RPC eklemek yetersiz. Eski RPC **ve** doğrudan tablo yazma yolları kapatılmalı.
- Üretim `user_data` tablosunda app-düzeyi değişiklik geçmişi tutan tetikleyici bulunmadı. Özel bir history/backup tablosu saptanmadı. Supabase'in dış yedeklerinin kullanılabilirliği ayrıca doğrulanmalıdır.
- Verilerin metni okunmadan yapılan toplu incelemede 7 hesabın `journal` alanı bir nesneydi, hiçbirinde `journal['2026-11-19']` anahtarı görülmedi. Bu **kullanıcının kaydının geçmişte hiç oluşmadığını kanıtlamaz**: silinmiş/eski sürümün üzerine yazılmış, hiç buluta yüklenmemiş veya farklı cihazın yerel deposunda kalmış olabilir.
- Mevcut `index.html` tarayıcıda `b1` tutuyor ve `b1.bak` yedeğini **20 saniyede bir güncelliyor**. `b1.bak` sürümlü tarihçe değildir; yeni kopya önceki değerini ezebilir.

## Önce kullanıcının yazdığını koruma

1. Aynı hesaptaki tüm cihazlarda düzenleme/kaydetme/reset yapmayı durdurun. Tarayıcı depolamasını silmeyin, çıkış yapmayın; daha fazla veri kaybını önlemek için yeni test yapmayın.
2. Kullanıcıdan **parola, JWT, doğrulama kodu, tarayıcı localStorage dökümü, günlük metni, service-role anahtarı** istemeyin. Herhangi bir yedek cihazda özel saklanmalı; GitHub issue/PR ya da sohbete yüklenmemeli.
3. Kaydın yazıldığı **orijinal tarayıcı profili ve alan adında** geliştirici araçları → Application/Storage → Local Storage üzerinden salt okunur biçimde `b1` ve `b1.bak` anahtarlarında `journal` altındaki `2026-11-19` tarihini kontrol edin. Varsa içeriği paylaşmak yerine yalnızca `bulundu` deyin. Bekleyen yeni kodlu sürümde `b1.sync.pending.*`, `b1.sync.legacy-backup.*`, `b1.sync.archive.*` veya `b1.alias-backup.*` de olabilir. **Canlı uygulamadaki eski sürüm bunların hepsini oluşturmaz.**
4. `www.badgalnurkan.com`, `badgalnurkan.com` ve `badgalnurkan.vercel.app` farklı origin olduğu için, daha önce kullanıldıysa her birinin yerel depolaması ayrı olabilir. Yeni giriş yaparak kanıt yaratmayın; yalnızca mevcut profiller/sekme verisini kontrol edin.
5. Kurtarma için canlı üretim veritabanını önceki zamana döndürmeyin: bu başka kullanıcıların yeni verisini silebilir. Mevcut özel Supabase yedeği varsa önce **izole bir kopyada** inceleyip etkilenen tek hesaba ait kayıt için onaylı ve izlenebilir bir kurtarma prosedürü geliştirin.

## Düzeltme kapıları

- GitHub taslak [PR #6](https://github.com/badgalnurkan/badgalnurkan/pull/6): sunucuya atomik CAS, eski kör-yazma RPC'sini engelleme, doğrudan mutasyon izinlerini kaldırma, UID bazlı kalıcı bekleyen taslak, çakışma uyarısı ve kurtarma arşivi. Test ve kontrollü rollout olmadan **birleştirmeyin**.
- Bir cihaz 19 Kasım günlüğünü yazarken diğeri eski JSON ile 20 Kasım günlüğünü yazarsa, ikinci çağrı sunucuda reddedilmeli; **19 Kasım kaydı silinmemeli**, 20 Kasım yerel taslağı korunmalı.
- Farklı günleri açık inceleme sonrası birleştirmek mümkündür; **aynı günün farklı düzenlemeleri otomatik birleştirilmemeli**. CAS kaybı önler, tek başına anlık çok cihazlı eşitleme sağlamaz. Ayrı senkronizasyon yenileme/realtime/alan-bazlı uzlaştırma tasarlanmalı.
- Ağ timeout, 401/token refresh, yeniden giriş, iki sekme, üç farklı UID, yazma sonrası bağlantı kopması, `QuotaExceededError`, geçici/kalıcı kapatma ve eski açık sekme davranışı test edilmeli.
- SQL ve frontend geçişinde önce doğrulanmış özel yedek, geri yükleme tatbikatı, QA'da E2E, eski istemci koruması ve koordineli yayın gereklidir. Test projesinin şeması henüz üretime eş değil.

Bu belge analiz ve eylem listesidir; kaybolan günlüğün kurtarıldığı veya canlı veri kaybı riskinin giderildiği iddia edilmemelidir.
