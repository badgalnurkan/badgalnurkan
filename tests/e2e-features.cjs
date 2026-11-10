const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const PORT=9500+Math.floor(Math.random()*40);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
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
 await send('Runtime.enable');await send('Page.navigate',{url:FILE});await sleep(1600);
 await ev("try{localStorage.clear()}catch(e){}");await send('Page.reload');await sleep(1300);

 // 1) giris ekraninda tema secimi
 await ev("goTo('login','home')");await sleep(500);
 ck('giris: tema secimi var', await ev("!!document.querySelector('.themebar')"));
 await ev("pickTheme('dark')");await sleep(300);
 ck('tema koyu uygulandi', (await ev("document.documentElement.dataset.t"))==='dark');
 await send('Page.reload');await sleep(1200);
 ck('tema yenilemede korunur', (await ev("document.documentElement.dataset.t"))==='dark');
 await ev("pickTheme('light')");await sleep(200);
 ck('tema aciga donuyor', (await ev("document.documentElement.dataset.t"))==='light');

 // 2) hesap + gecmis raporlar
 await ev("goTo('setup','home')");await sleep(400);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';setup()");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(500);
 ck('hesap acildi', await ev('!!A'));
 // gecmis bir hafta verisi olustur
 await ev("A.hist['2026-11-02']=[{t:'eski gorev',done:true},{t:'eski gorev 2',done:false}];A.qs['2026-11-02']=[{q:'Ne ogrendin?',a:'Sabir'}];save()");
 await ev("goTo('app','rep')");await sleep(900);
 ck('raporlar sayfasi: gecmis bolumu var', await ev("!!document.querySelector('#hist-w')&&!!document.querySelector('#hist-m')"));
 ck('gecmis bolumunde hafta kartlari', (await ev("document.querySelectorAll('#hist-w .card').length"))>=8, await ev("document.querySelectorAll('#hist-w .card').length"));
 ck('gecmis bolumunde ay kartlari', (await ev("document.querySelectorAll('#hist-m .card').length"))>=12, await ev("document.querySelectorAll('#hist-m .card').length"));
 await ev("showHist('w')");await sleep(300);
 ck('haftalik secilebiliyor', (await ev("getComputedStyle(document.querySelector('#hist-w')).display"))==='block');
 console.log('HIST:', String(await ev("document.querySelector('#hist-w').innerText.slice(0,300)")).replace(/\n/g,' | '));
 ck('cevap gecmiste gorunuyor', (await ev("document.querySelector('#hist-w').innerText")).includes('Sabir'));

 // 3) cihaz gecisleri
 for(const [w,h,name] of [[390,844,'telefon'],[820,1180,'tablet'],[1920,1080,'masaustu'],[3840,2160,'TV']]){
   await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<900});
   await sleep(400);
   const ok=(await ev("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"));
   ck(name+' ('+w+'x'+h+'): tasma yok', ok, await ev("document.documentElement.scrollWidth+'/'+document.documentElement.clientWidth"));
   ck(name+': kartlar ekranda', (await ev("document.querySelectorAll('main .card').length"))>0);
 }
 await send('Emulation.clearDeviceMetricsOverride');
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
