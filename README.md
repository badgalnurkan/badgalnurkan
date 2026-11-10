## Hi there 👋

<!--
**badgalnurkan/badgalnurkan** is a ✨ _special_ ✨ repository because its `README.md` (this file) appears on your GitHub profile.

Here are some ideas to get you started:

- 🔭 I’m currently working on ...
- 🌱 I’m currently learning ...
- 👯 I’m looking to collaborate on ...
- 🤔 I’m looking for help with ...
- 💬 Ask me about ...
- 📫 How to reach me: ...
- 😄 Pronouns: ...
- ⚡ Fun fact: ...
-->

## deneme.html — özellikler

Tek dosyalık uygulama (`deneme.html`). Veriler tarayıcıda `localStorage` içinde hesap bazında saklanır.

- **Giriş**: şifre alanında **Enter** ile giriş; cihazda hatırlanan kullanıcı adı otomatik dolu gelir (sadece şifre yazman yeterli).
- **TR / EN**: welcome, giriş, kayıt, şifre sıfırlama ve Ayarlar'dan dil seçimi; alıntılar ve sorular her iki dilde ayrı yazılmıştır.
- **Geçişler**: giriş sonrası Türkiye saatine göre "Günaydın / Tünaydın / İyi geceler" → menü alttan yukarı → içerik yukarıdan aşağı sıralanır.
- **Header sağ üst tarih (09.11)**: takvim sayıları hover'da fade-in/out ve açık bej; herhangi bir güne tıklayınca tüm arayüz açık bej temaya geçer ve o güne not eklenir.
- **İlerleme**: %1 = 1 gün. Kayıt gününden bugüne her gün sayılır, hiçbir koşula bağlı değildir. Geçmişte tamamlanmayan günler sisli, gelecek günlere not eklenebilir.
- **Pomodoro / kronometre**: toplam 3 haneli sıfır (`SS.dss`).
- **Footer**: "← Giriş ekranına dön".
- **Duyarlı**: telefon, tablet, masaüstü ve farklı en/boy oranlarında simetrik düzen (yatay taşma yok).

### Testler

```bash
npm test          # yapısal testler (node --test)
npm run test:e2e  # gerçek tarayıcıda uçtan uca testler (Edge/Chrome)
```

