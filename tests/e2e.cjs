// Gercek tarayicida (headless Edge/Chrome) uctan uca duman testi
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BROWSER = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE = 'file:///' + path.resolve(process.argv[2] || path.join(__dirname, '..', 'deneme.html')).replace(/\\/g, '/');
const PORT = 9333 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'edgeprof-'));

const proc = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { }
    await sleep(250);
  }
  throw new Error('tarayici acilmadi');
}

async function main() {
  const url = await wsUrl();
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console: ' + m.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('eval(' + expr.slice(0, 70) + '): ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description));
    return r.result.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: FILE });
  await send('Runtime.evaluate', { expression: "try{localStorage.clear();sessionStorage.clear()}catch(e){}" });
  await sleep(1500);

  const steps = [];
  const check = (name, ok, extra) => { steps.push([name, !!ok, extra]); };

  // 1) welcome ekrani + dil butonlari
  let txt = await evaluate('document.body.innerText');
  check('welcome ekrani acildi', /WELCOME/.test(txt), txt.slice(0, 60));
  check('dil butonlari var', await evaluate("!!document.querySelector('.langbar button')"));

  // 2) Turkce secimi -> alinti ve arayuz cevrilir
  await evaluate("[...document.querySelectorAll('.langbar button')].find(b=>b.textContent.includes('Türkçe')).click()");
  await sleep(200);
  txt = await evaluate('document.body.innerText');
  check('TR secilince welcome Turkce', /HOŞ GELDİN/.test(txt));
  check('TR secimi DB.lang', (await evaluate('DB.lang')) === 'tr');

  // 3) hesap olustur (form + Enter)
  await evaluate("goTo('setup','home')");
  await sleep(200);
  await evaluate(`(()=>{
    $('#u').value='deneme';formDat.u='deneme';
    $('#n').value='Deneme';formDat.n='Deneme';
    $('#e').value='a@b.co';formDat.e='a@b.co';
    $('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';
    $('#p').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  })()`);
  for (let i = 0; i < 40 && !(await evaluate('!!(A && document.querySelector(\'aside\'))')); i++) await sleep(250);
  await sleep(400);
  check('kayit sonrasi selamlama ekrani cikti', await evaluate("!!document.querySelector('.greet-screen') || !!document.querySelector('aside')"));
  txt = await evaluate('document.body.innerText');
  check('giris sonrasi menu Turkce', /Ana sayfa/.test(txt) && /Çıkış yap/.test(txt), txt.slice(0, 80));
  check('gunun alintisi Turkce', /Günün alıntısı/.test(txt));
  check('menu ogesi sayisi 7', (await evaluate("document.querySelectorAll('aside a').length")) === 7, await evaluate("document.querySelector('#app').innerHTML.slice(0,80)"));
  check('selamlama Turkiye saatine gore', await evaluate("/Günaydın|Tünaydın|İyi geceler/.test(greetText())"));

  // 4) todo ekleme + Enter
  await evaluate("goTo('app','todo')");
  await sleep(600);
  await evaluate("$('#nt').value='Test gorevi';addT()");
  await sleep(200);
  check('gorev eklendi', (await evaluate('A.tasks.length')) === 1);

  // 5) pomodoro kronometresi milisaniye
  await evaluate("goTo('app','pomo')");
  await sleep(300);
  await evaluate('swS()');
  await sleep(400);
  const sw = await evaluate("$('#sw').textContent");
  check('kronometre 3 haneli sifir (SS.dss)', /^\d\d:\d\d\.\d\d$/.test(sw), sw);
  await evaluate('swR()');

  // 6) takvim: sis + gelecek not
  await evaluate("goTo('app','pc')");
  await sleep(400);
  check('takvimde gelecek gun var', await evaluate("document.querySelectorAll('.dot.future').length>0"));
  await evaluate("openDay('2099-01-05')");
  await sleep(200);
  await evaluate("$('#dn').value='gelecek notu';saveNote('2099-01-05')");
  await sleep(200);
  check('gelecege not kaydedildi', (await evaluate("A.future['2099-01-05']")) === 'gelecek notu');
  check('not listelendi', /gelecek notu/.test(await evaluate("document.body.innerText")));
  // 10.11 tiklaninca bej tema
  await evaluate("toggleBeige()");
  await sleep(200);
  check('10.11 bej tema aktif', (await evaluate('document.documentElement.dataset.t')) === 'beige');
  check('bej tema CSS yuklu', (await evaluate("getComputedStyle(document.body).backgroundColor")) !== 'rgba(0, 0, 0, 0)', await evaluate("getComputedStyle(document.body).backgroundColor"));

  // 7) raporlar TR
  await evaluate("goTo('app','rep')");
  await sleep(300);
  txt = await evaluate('document.body.innerText');
  check('raporlar Turkce', /Haftalık rapor/.test(txt) && /Aylık rapor/.test(txt));

  // 8) ayarlar
  await evaluate("goTo('app','set')");
  await sleep(300);
  txt = await evaluate('document.body.innerText');
  check('ayarlar Turkce', /Hesap/.test(txt) && /Tema/.test(txt));

  // 9) giris ekranina don
  await evaluate("window.__ps=0;window.addEventListener('popstate',()=>{window.__ps++});goHome()");
  await sleep(500);
  await sleep(400);
  txt = await evaluate('document.body.innerText');
  check('welcome ekranina donuldu', /HOŞ GELDİN/.test(txt), txt.slice(0, 40));

  // 10) Enter ile giris (footer'daki buton giris ekranina goturur; oradan devam)
  await evaluate("goTo('login','home')"); // giris ekrani
  await sleep(600);
  await evaluate(`(()=>{
    $('#u').value='deneme';loginDat.u='deneme';
    $('#p').value='GuzelSafak47';loginDat.p='GuzelSafak47';
    $('#p').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  })()`);
  for (let i = 0; i < 40 && !(await evaluate('!!(A && document.querySelector(\'aside\'))')); i++) await sleep(250);
  await sleep(400);
  check('Enter ile giris yapildi', /Ana sayfa/.test(await evaluate('document.body.innerText')));
  check('kayitli veri geri yuklendi', (await evaluate("A&&A.tasks.length")) === 1 && (await evaluate("A&&!!A.future['2099-01-05']")));

  // 11) Ingilizceye don
  await evaluate("setLang('en');goTo('app','home')");
  await sleep(300);
  txt = await evaluate('document.body.innerText');
  check('EN secilince arayuz Ingilizce', /Home/.test(txt) && /Quote of the day/.test(txt));

  // 12) cikis
  await evaluate("confirmLogout()");
  await sleep(200);
  await evaluate("document.querySelector('.modal button').click()");
  await sleep(400);
  check('cikis yapildi', /Sign in/.test(await evaluate('document.body.innerText')));

  check('JS hatasi yok', errors.length === 0, errors.slice(0, 3).join(' | '));

  let fail = 0;
  for (const [name, ok, extra] of steps) {
    if (!ok) fail++;
    console.log((ok ? '✔ ' : '✖ ') + name + (extra ? '  [' + String(extra).slice(0, 90) + ']' : ''));
  }
  console.log('\n' + (steps.length - fail) + '/' + steps.length + ' gecti');
  ws.close();
  proc.kill();
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HATA:', e.message); try { proc.kill(); } catch (_) { } process.exit(1); });
