const { spawn } = require('child_process');const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const PORT=9650+Math.floor(Math.random()*40);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
const proc=spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let wsu;for(let i=0;i<60;i++){try{const l=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p){wsu=p.webSocketDebuggerUrl;break}}catch(e){}await sleep(250)}
 const ws=new WebSocket(wsu);await new Promise(r=>ws.onopen=r);let id=0;const pend=new Map();const errs=[];
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description)};
 const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(!r||!r.result)return null;if(r.result.exceptionDetails)return 'ERR';return r.result.result&&r.result.result.value};
 const out=[];const ck=(n,o,x)=>out.push((o?'✔ ':'✖ ')+n+(x!==undefined&&x!==null&&x!==''?' ['+x+']':''));
 const waitApp=async()=>{for(let i=0;i<80&&!(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++)await sleep(250);await sleep(300)};
 await send('Runtime.enable');await send('Page.navigate',{url:FILE});await sleep(1500);
 await ev("localStorage.clear();sessionStorage.clear();localStorage.setItem('b1cloud','0')");await send('Page.reload');await sleep(1300);
 const reg=async(u,n,e)=>{await ev("goTo('setup','home')");await sleep(300);await ev(`$('#u').value='${u}';$('#n').value='${n}';$('#e').value='${e}';$('#p').value='GuzelSafak47';setup()`);await waitApp()};
 await reg('ayse','Ayşe','ayse@x.co');ck('1. kayit acildi',await ev("A&&A.u==='ayse'"));
 await ev("goLogin()");await sleep(500);
 await reg('mehmet','Mehmet','mehmet@x.co');ck('2. kayit acildi',await ev("A&&A.u==='mehmet'"));
 await ev("goLogin()");await sleep(500);
 await send('Page.reload');await sleep(1500);
 ck('yenileme sonrasi giris ekrani',(await ev("view"))==='login');
 ck('son kullanici hatirlaniyor',(await ev("document.querySelector('.remember b')&&document.querySelector('.remember b').textContent"))==='Mehmet');
 ck('diger kullanici listede',(await ev("[...document.querySelectorAll('.saved-list button')].map(b=>b.textContent).join(',')"))==='@ayse');
 // sekmeyi kapat-ac (sessionStorage gider)
 await ev("sessionStorage.clear()");await send('Page.navigate',{url:FILE});await sleep(1500);
 ck('yeni sekme: hesaplar duruyor',(await ev("Object.keys(DB.accounts).sort().join(',')"))==='ayse,mehmet');
 // e-posta ile giris
 await ev("goLogin()");await sleep(400);
 await ev("otherUser()");await sleep(200);
 await ev("$('#u').value='AYSE@x.co';loginDat.u='AYSE@x.co';$('#p').value='GuzelSafak47';loginDat.p='GuzelSafak47';login()");await waitApp();
 ck('e-posta ile giris',await ev("A&&A.u==='ayse'"));
 await ev("goLogin()");await sleep(400);await send('Page.reload');await sleep(1500);
 ck('e-posta girisinden sonra ayse hatirlaniyor',(await ev("document.querySelector('.remember small:last-child')&&document.querySelector('.remember small:last-child').textContent"))==='@ayse');
 // hatirlanan hesapla sadece sifre
 await ev("$('#p').value='GuzelSafak47';loginDat.p='GuzelSafak47';login()");await waitApp();
 ck('hatirlanan hesapla sadece sifreyle giris',await ev("A&&A.u==='ayse'"));
 ck('JS hatasi yok',errs.length===0,errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
