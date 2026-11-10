// deneme.html icin dogrulama testleri (node --test)
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const FILE = process.env.TARGET || path.join(__dirname, '..', 'deneme.html');
const html = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');

function scriptBody() {
  const parts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  return parts.join('\n');
}

// --- sozdizimi kontrolu
test('gömülü JavaScript sözdizimi geçerli', () => {
  const body = scriptBody();
  assert.ok(body.length > 1000, 'script bulunamadi');
  assert.doesNotThrow(() => new Function(body));
});

test('tek bir <script> ve kapanışı var', () => {
  assert.strictEqual((html.match(/<script>/g) || []).length, 1);
  assert.strictEqual((html.match(/<\/script>/g) || []).length, 1);
});

// --- i18n
test('Türkçe ve İngilizce sözlükler aynı anahtarlara sahip', () => {
  const body = scriptBody();
  const m = body.match(/const STRS=\{([\s\S]*?)\};/);
  assert.ok(m, 'STRS bulunamadi');
  const block = m[1];
  const enStart = block.indexOf('en:{');
  const trStart = block.indexOf('tr:{');
  assert.ok(enStart >= 0 && trStart > enStart, 'dil bloklari hatali');
  // anahtarlar yalnizca ust seviyede: degerden sonra , veya } ve ardindan yeni anahtar
  const keysOf = s => {
    const out = [];
    let q = null, esc = false, depth = 0, word = '', expectKey = true;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === q) q = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { q = c; continue; }
      if (expectKey && /[A-Za-z]/.test(c)) {
        let j = i, w = '';
        while (j < s.length && /[A-Za-z0-9]/.test(s[j])) { w += s[j]; j++; }
        if (s[j] === ':') { out.push(w); expectKey = false; }
        i = j - 1;
        continue;
      }
      if (!expectKey && (c === ',' || c === '}')) expectKey = true;
    }
    return out.sort();
  };
  const en = keysOf(block.slice(enStart + 3, trStart));
  const tr = keysOf(block.slice(trStart + 3));
  assert.deepStrictEqual(tr, en, 'TR ve EN anahtarlari ayni olmali');
  assert.ok(en.length > 80, 'sozluk cok kucuk');
});

test('alıntılar TR ve EN olarak ayrı ayrı var ve sayıları eşit', () => {
  const body = scriptBody();
  const arr = name => {
    const m = body.match(new RegExp('const ' + name + '=\\[([\\s\\S]*?)\\];'));
    assert.ok(m, name + ' bulunamadi');
    return JSON.parse('[' + m[1] + ']');
  };
  const en = arr('Q_EN'), tr = arr('Q_TR');
  assert.strictEqual(tr.length, en.length);
  assert.ok(en.length >= 8);
  assert.ok(tr.every(q => /[çğıöşüÇĞİÖŞÜ]/.test(q)), 'TR cevirilerde Turkce karakter olmali');
});

test('rastgele sorular ve rapor soruları iki dilde de var', () => {
  const body = scriptBody();
  assert.ok(/const RQ_EN=\[/.test(body) && /const RQ_TR=\[/.test(body));
  assert.ok(/DEFQ_EN=\{week:\[[\s\S]*month:\[/.test(body));
  assert.ok(/DEFQ_TR=\{week:\[[\s\S]*month:\[/.test(body));
});

// --- giriş ekranı
test('giriş ekranında Enter tuşu login() çağırıyor', () => {
  assert.ok(/onkeydown="if\(event\.key==='Enter'\)\{event\.preventDefault\(\);login\(\)\}"/.test(html),
    'şifre alanında Enter ile giriş yok');
});

test('giriş ve welcome ekranında dil seçimi var', () => {
  assert.ok(/langBtns\(\)/.test(html));
  assert.ok(/function pickLang\(/.test(html));
  assert.ok(/LANG_NAMES=\{en:'English',tr:'Türkçe'\}/.test(html));
});

// --- geçiş / animasyon
test('giriş sonrası selamlama ekranı ve menü animasyonu var', () => {
  assert.ok(/function greetThen\(/.test(html));
  assert.ok(/greetThen\(\)/.test(html), 'login/setup sonrasi cagri yok');
  assert.ok(/@keyframes navIn/.test(html), 'menu animasyonu yok');
  assert.ok(/@keyframes slIn/.test(html), 'icerik siralama animasyonu yok');
  assert.ok(/aside a:hover\{transform:scale\(1\.05\)\}/.test(html), 'menu hover buyumesi yok');
});

test('selamlama Türkiye saatine göre seçiliyor', () => {
  const body = scriptBody();
  assert.ok(/const greetKey=\(\)=>\{const h=new Date\(\)\.getHours\(\);return h>=5&&h<12\?'morning':h>=12&&h<18\?'afternoon':'night'\}/.test(body));
  assert.ok(/Günaydın/.test(body) && /Tünaydın/.test(body) && /İyi geceler/.test(body));
});

// --- kalıcılık
test('veriler localStorage üzerinden kalıcı saklanıyor', () => {
  assert.ok(/localStorage\.getItem\('b1'\)/.test(html) && /setItem\('b1',JSON\.stringify\(DB\)\)/.test(html));
  assert.ok(/a\.future=A\.future/.test(html), 'hesap sifirlamada gelecek notlari korunmuyor');
});

// --- pomodoro / kronometre
test('kronometre 3 haneli, baştaki sıfır yok (S.dss)', () => {
  const body = scriptBody();
  assert.ok(/const fms=ms=>/.test(body), 'fms yok');
  assert.ok(/ms%1000\)\/10/.test(body), 'santisecond hesabi yok');
  assert.ok(/return s\+'\.'\+pad2\(x\)/.test(body), 'ilk 10 saniyede bastaki sifir atilmali');
  assert.ok(/setInterval\(\(\)=>\{pm\.swT=\(Date\.now\(\)-start\)\/1000/.test(body));
});

// --- takvim
test('takvimde sisli geçmiş, gelecek gün ve not özelliği var', () => {
  const body = scriptBody();
  assert.ok(/function dayFog\(k\)/.test(body));
  assert.ok(/\.dot\.fog\{/.test(html));
  assert.ok(/future=k>today\(\)/.test(body) && /cls\+=' note'/.test(body));
  assert.ok(/function saveNote\(k\)/.test(body) && /function openDay\(k\)/.test(body));
  assert.ok(/function fadeDot\(el,on\)/.test(body), 'fade-in/out efekti yok');
  assert.ok(/const noteList=Object\.keys\(A\.future\|\|\{\}\)/.test(body), 'gelecege not listesi yok');
});

test('10.11 için bej tema arayüz genelinde tanımlı', () => {
  assert.ok(/:root\[data-t=beige\]/.test(html));
  assert.ok(/function toggleBeige\(\)/.test(html));
  assert.ok(/DB\.beige\?'beige':A\.theme/.test(html));
});

test('giriş ekranına dönüş butonu var', () => {
  const body = scriptBody();
  assert.ok(/function goHome\(\)/.test(body));
  assert.ok(/class="lg-link"[^>]*onclick="goHome\(\)"/.test(html) || /class="lg-link" role="button" tabindex="0" onclick="goHome\(\)"/.test(html));
});

// --- yüzdelik
test('%1 = 1 gün: yüzdelik koşulsuz her gün artıyor', () => {
  const body = scriptBody();
  assert.ok(/const pct=\(\)=>Math\.max\(1,dd\(pctStart\(\),today\(\)\)\+1\)/.test(body), 'yuzde her gun +1 hesabi yok');
  assert.ok(/pctFrom/.test(body), 'yuzde baslangici ayri tutulmuyor');
});

// --- çapraz cihaz / tarayıcı dayanıklılığı
test('hesap kaydı her zaman localStorage içinde tutulur (çerez reddedilse de hatırlanır)', () => {
  const body = scriptBody();
  assert.ok(/const storeAcct=\(\)=>/.test(body), 'storeAcct yok');
  assert.ok(/storeAcct\(\)\|\|store\(\)/.test(body));
});

test('şifreler PBKDF2 + tuz ile saklanıyor, eski kayıtlar doğrulanabiliyor', () => {
  const body = scriptBody();
  assert.ok(/async function hashPw\(p,salt\)/.test(body));
  assert.ok(/PBKDF2/.test(body) && /iterations:120000/.test(body));
  assert.ok(/async function pwMatch\(a,p\)/.test(body));
  assert.ok(!/a\.pw===await sha\(loginDat\.p\)/.test(body), 'eski duz hash karsilastirmasi kalmis');
});

test('takvim sabit konumlu katman: portal + z-index + konumlama', () => {
  const body = scriptBody();
  assert.ok(/\.mini-popup\{display:none;position:fixed/.test(html), 'position:fixed yok');
  assert.ok(/z-index:99999/.test(html));
  assert.ok(/function placeMiniCal\(\)/.test(body), 'konumlama yok');
  assert.ok(/parentElement!==document\.body\)document\.body\.appendChild\(mc0\)/.test(body), 'portal yok');
  assert.ok(/addEventListener\('resize'/.test(body) && /addEventListener\('scroll'/.test(body));
});

test('footer tek buton ve karşılama ekranına gidiyor', () => {
  assert.ok((html.match(/<footer>/g) || []).length === 1);
  assert.ok(/id="back-welcome"[^>]*onclick="goHome\(\)"/.test(html));
  assert.ok(!/id="back-login"/.test(html), 'ikinci buton kalmis');
  assert.ok(!/loginBack:'←/.test(html), 'metinde cift ok kalmis');
});

test('yüzde görevlere/geçmişe bağlı değil, ayrı sayaç', () => {
  const body = scriptBody();
  assert.ok(/const pctStart=\(\)=>/.test(body));
  assert.ok(!/const pct=\(\)=>1\+succ\(\)/.test(body), 'yuzde hala gorevlere bagli');
  assert.ok(/pctFrom/.test(body));
});

test('tüm ekran boyutları için duyarlı kurallar', () => {
  assert.ok(/@media\(max-width:900px\)/.test(html) && /@media\(max-width:560px\)/.test(html));
  assert.ok(/@media\(min-width:1400px\)/.test(html));
  assert.ok(/max-aspect-ratio:3\/4/.test(html), 'portre oran kurali yok');
  assert.ok(/max-height:520px/.test(html), 'yatay/dusuk yukseklik kurali yok');
});
