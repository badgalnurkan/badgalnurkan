const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]).replace(/\\/g,'/');
const PORT=9800+Math.floor(Math.random()*150);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
const proc=spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let url;for(let i=0;i<60;i++){try{const l=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p){url=p.webSocketDebuggerUrl;break}}catch(e){}await sleep(250)}
 const ws=new WebSocket(url);await new Promise(r=>ws.onopen=r);
 let id=0;const pend=new Map();const errs=[];
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description)};
 const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e.slice(0,70)+': '+(r.result.exceptionDetails.exception&&r.result.exceptionDetails.exception.description));return r.result.result&&r.result.result.value};
 await send('Runtime.enable');await send('Page.navigate',{url:FILE});await sleep(1600);
 await ev("try{localStorage.clear();sessionStorage.clear()}catch(e){}");
 const out=[];const ck=(n,o,x)=>out.push((o?'✔ ':'✖ ')+n+(x!==undefined&&x!==null&&x!==''?' ['+x+']':''));
 // kayit
 await ev("goTo('setup','home')");await sleep(300);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';$('#p').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
 for(let i=0;i<60 && !(await ev("!!(A&&document.querySelector('aside')&&document.querySelectorAll('#mini-cal .mini-dot').length>0)"));i++) await sleep(250);
 await sleep(600);
 ck('kayit + menu', await ev("!!document.querySelector('aside')"));
 ck('DB.lastUser kayitli', (await ev("DB.lastUser"))==='deneme', await ev("DB.lastUser"));
 // %1 = 1 gun
 ck('%1 gun sayisina esit', (await ev("pct()"))===1 && (await ev("dayCount()"))===1);
 await ev("A.hist['2026-11-05']=[{t:'x',done:false}];save();goTo('app','pc')");await sleep(600);
 ck('gecmis verisi % yi degistirmez', (await ev("pct()"))===1, await ev("pct()"));
 await ev("A.pctFrom='2026-11-05';save()");
 ck('% her gun +1 (5 gun once -> 6)', (await ev("pct()"))===6, await ev("pct()"));
 await ev("A.pctFrom=today();save();P.pc()");await sleep(400);
 ck('ilerleme kartinda yuzde', /Günlük yüzde|Daily percentage/.test(await ev("document.body.innerText")));
 // kronometre 3 hane
 await ev("goTo('app','pomo')");await sleep(400);
 await ev("swS()");await sleep(350);
 const sw=await ev("$('#sw').textContent");await ev("swR()");
 ck('kronometre S.dss (bastaki sifir yok)', /^\d\d?\.\d\d$/.test(sw), sw);
 // footer -> giris ekrani
 ck('footer butonu var', await ev("!!document.querySelector('#back-welcome')"));
 await ev("document.querySelector('#back-welcome').click()");await sleep(700);
 ck('footer welcome ekranina goturdu', /HOŞ GELDİN|WELCOME/.test(await ev("document.body.innerText")) && !(await ev("!!A")), await ev("view"));
 
 await ev("goTo('login','home')");await sleep(500);
 
 // hatirlanan kullanici: alan otomatik dolu + karsilama karti
 ck('kullanici adi otomatik dolu', (await ev("$('#u').value"))==='deneme', await ev("$('#u').value"));
 ck('hatirlanan kullanici karti', await ev("!!document.querySelector('.remember')"));
 // sadece sifre ile Enter -> giris
 await ev("$('#p').value='GuzelSafak47';loginDat.p='GuzelSafak47';$('#p').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(400);
 ck('sadece sifre ile giris', await ev("!!A"), await ev("typeof A"));
 // yanlis sifre mesaji: kullaniciyi taniyor
 await ev("A=null;loginDat={u:'',p:''};msg='';view='login';renderAppOrAuth()");await sleep(600);
 
 await ev("$('#p').value='YanlisSifre99';loginDat.p='YanlisSifre99';login();");
 await sleep(700);
 const txt=await ev("document.body.innerText");
 ck('yanlis sifrede kullaniciyi taniyor', /Deneme/.test(txt) && /(şifre yanlış|Password is wrong)/.test(txt), txt.split('\n').filter(l=>/yanlış|wrong/.test(l)).join(' / ').slice(0,90));
 // mini takvim: 19 -> bej + hover
 await ev("$('#p').value='GuzelSafak47';loginDat.p='GuzelSafak47';login()");
 for(let i=0;i<60 && !(await ev("!!(A&&document.querySelector('aside'))"));i++) await sleep(250);
 await sleep(500);
 await ev("toggleMiniCal()");await sleep(300);
 ck('mini takvim acildi', await ev("document.querySelectorAll('#mini-cal .mini-dot').length>0"), await ev("document.querySelectorAll('#mini-cal .mini-dot').length"));
 await ev("(function(){const d=[...document.querySelectorAll('#mini-cal .mini-dot')].find(x=>x.title==='19.11')||document.querySelectorAll('#mini-cal .mini-dot')[6];window.__d=d;fadeDot(d,1)})()");await sleep(450);
 ck('hover: lit', await ev("window.__d.classList.contains('lit')"));
 ck('hover: acik bej', /^rgba?\(247, 236, 220/.test(await ev("getComputedStyle(window.__d).backgroundColor")), await ev("getComputedStyle(window.__d).backgroundColor"));
 await ev("window.__d.click()");await sleep(600);
 ck('19.11 tiklandi: bej tema', (await ev("document.documentElement.dataset.t"))==='beige');
 ck('tum arayuz bej (card)', (await ev("getComputedStyle(document.querySelector('.card')).backgroundColor"))!=='rgba(0, 0, 0, 0)', await ev("getComputedStyle(document.querySelector('.card')).backgroundColor"));
 await ev("goTo('app','pc')");await sleep(500);
 await ev("$('#fnd').value='2026-11-19';newNote()");await sleep(300);
 await ev("$('#dn').value='notum';saveNote('2026-11-19')");
 await sleep(400);
 await ev("shell()");await sleep(400);await ev("toggleMiniCal()");await sleep(300);
 ck('mini takvimde not noktasi', (await ev("document.querySelectorAll('#mini-cal .mini-dot.note').length"))>0, await ev("[...document.querySelectorAll('#mini-cal .mini-dot')].filter(x=>x.classList.contains('note')).map(x=>x.title).join(',')+' | future='+JSON.stringify(A.future)"));
 ck('not kayitli', Object.values(await ev("A.future")).includes('notum'));
 // duyarli: dar ekran
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 await sleep(600);
 const overflow=await ev("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1");
 ck('mobil 390px: yatay tasma yok', overflow, await ev("document.documentElement.scrollWidth+'/'+document.documentElement.clientWidth"));
 ck('mobil: menu yatay serit', (await ev("getComputedStyle(document.querySelector('aside')).flexDirection"))==='row');
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await sleep(500);
 ck('masaustu 1920: tasma yok', await ev("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"));
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));
 console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
