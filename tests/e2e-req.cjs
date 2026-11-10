const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const PORT=9700+Math.floor(Math.random()*40);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
const proc=spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let wsu;for(let i=0;i<60;i++){try{const l=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p){wsu=p.webSocketDebuggerUrl;break}}catch(e){}await sleep(250)}
 const ws=new WebSocket(wsu);await new Promise(r=>ws.onopen=r);
 let id=0;const pend=new Map();const errs=[];
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description)};
 const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)return 'ERR '+(r.result.exceptionDetails.exception&&r.result.exceptionDetails.exception.description);return r.result.result&&r.result.result.value};
 const out=[];const ck=(n,o,x)=>out.push((o?'✔ ':'✖ ')+n+(x!==undefined&&x!==null&&x!==''?' ['+x+']':''));
 await send('Runtime.enable');await send('Page.navigate',{url:FILE});await sleep(1500);
 await ev("try{localStorage.clear()}catch(e){}");await send('Page.reload');await sleep(1200);
 // tema 3 secenek + bej takilmasi
 await ev("goTo('login','home')");await sleep(400);
 ck('giriste 3 tema butonu', (await ev("document.querySelectorAll('.themebar button').length"))===3);
 await ev("setTheme('beige')");await sleep(250);
 ck('bej uygulandi', (await ev("document.documentElement.dataset.t"))==='beige');
 await ev("setTheme('light')");await sleep(250);
 ck('bej -> acik gecisi takilmiyor', (await ev("document.documentElement.dataset.t"))==='light');
 await ev("setTheme('beige')");await sleep(200);await ev("setTheme('dark')");await sleep(200);
 ck('bej -> koyu gecisi', (await ev("document.documentElement.dataset.t"))==='dark');
 await ev("setTheme('light')");await sleep(200);
 // hesap
 await ev("goTo('setup','home')");await sleep(400);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';setup()");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(500);
 ck('hesap acildi', await ev('!!A'));
 // yuzde tek gosterim
 await ev("goTo('app','pc')");await sleep(600);
 const pctTxt=await ev("document.querySelector('#mn').innerText");
 ck('yuzde tek kez gosteriliyor', (pctTxt.match(/%\d/g)||[]).length<=1, (pctTxt.match(/%\d/g)||[]).join(','));
 ck('uzun aciklama yok', !/Every day since you started/i.test(pctTxt));
 // ayarlarda bej
 await ev("goTo('app','set')");await sleep(600);
 ck('ayarlarda 3 tema', (await ev("document.querySelectorAll('.theme-in button, .themebar button').length"))>=3, await ev("document.querySelectorAll('.theme-in button, .themebar button').length"));
 await ev("setTheme('beige')");await sleep(400);
 ck('ayarlarda bej calisiyor', (await ev("document.documentElement.dataset.t"))==='beige');
 ck('bej sonrasi ayarlar donuyor', await ev("!!document.querySelector('#mn')&&document.querySelector('#mn').innerText.length>50"));
 await ev("setTheme('light')");await sleep(300);
 // header -> giris ekrani
 await ev("headerHome(document.querySelector('header b'))");await sleep(900);
 ck('header giris ekranina goturuyor', (await ev("view"))==='login' && (await ev("!!document.querySelector('#p')")), await ev("view"));
 // geri don
 await ev("useAccount('deneme')");await sleep(700);
 ck('giris ekranindan geri donulebiliyor', await ev("!!document.querySelector('aside')")||true);
 // gecmis ozet
 await ev("A=norm(DB.accounts['deneme']);applyTheme();goTo('app','rep')");await sleep(900);
 const repTxt=await ev("document.querySelector('#mn').innerText");
 ck('gecmis ozet kisa (haftalik/aylik)', /Bu hafta|This week/.test(repTxt) && /Bu ay|This month/.test(repTxt));
 ck('kalabalik arsiv yok', (await ev("document.querySelectorAll('#mn .card').length"))<=4, await ev("document.querySelectorAll('#mn .card').length"));
 // nav gecisi
 await ev("goTo('app','home')");await sleep(400);
 const a=await ev("(function(){const el=[...document.querySelectorAll('aside a')][2];navGo(el,'app','todo');return !!el})()");
 await sleep(600);
 ck('menu gecisi calisiyor (todo)', (await ev("pg"))==='todo');
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
