const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]).replace(/\\/g,'/');
const PORT=9400+Math.floor(Math.random()*90);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
const proc=spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let url;for(let i=0;i<60;i++){try{const l=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p){url=p.webSocketDebuggerUrl;break}}catch(e){}await sleep(250)}
 const ws=new WebSocket(url);await new Promise(r=>ws.onopen=r);
 let id=0;const pend=new Map();const errs=[];
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description)};
 const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e.slice(0,60)+': '+(r.result.exceptionDetails.exception&&r.result.exceptionDetails.exception.description));return r.result.result&&r.result.result.value};
 await send('Runtime.enable');await send('Page.navigate',{url:FILE});await sleep(1600);
 await ev("try{localStorage.clear();sessionStorage.clear()}catch(e){}");
 const out=[];const ck=(n,o,x)=>out.push((o?'✔ ':'✖ ')+n+(x!==undefined&&x!==null&&x!==''?' ['+x+']':''));
 await ev("goTo('setup','home')");await sleep(300);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';$('#p').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))"));i++) await sleep(250);
 await sleep(700);
 ck('sifre PBKDF2 ile saklandi', /^p2\$/.test(await ev("A.pw")), (await ev("A.pw")).slice(0,12));
 ck('hesap localStorage\'da', (await ev("!!JSON.parse(localStorage.getItem('b1')||'{}').accounts.deneme")));
 ck('yuzde baslangici ayri', /^\d{4}-\d{2}-\d{2}$/.test(await ev("A.pctFrom")), await ev("A.pctFrom"));
 ck('% bugun 1', (await ev("pct()"))===1);
 // gorev bitirmek yuzdeyi DEGISTIRMEZ
 await ev("goTo('app','todo')");await sleep(700);
 await ev("$('#nt').value='x';addT();mk(0,'done')");await sleep(400);
 ck('gorev bitirince % degismez', (await ev("pct()"))===1, await ev("pct()"));
 // gecmis gun eklemek % degistirmez (bagimsiz)
 await ev("A.hist['2026-11-01']=[{t:'a',done:true}];save()");
 ck('gecmis verisi % degistirmez', (await ev("pct()"))===1, await ev("pct()"));
 // % her gun +1 (simule)
 await ev("A.pctFrom='2026-11-05';save()");
 ck('5 gun once -> %6', (await ev("pct()"))===6, await ev("pct()"));
 await ev("A.pctFrom=today();save()");
 // FOOTER tek buton
 const foot=await ev("document.querySelectorAll('footer button').length");
 ck('footer tek buton', foot===1, 'adet='+foot);
 const fl=await ev("document.querySelector('footer button').textContent.trim()");
 ck('footer metni tek ok', (fl.match(/←/g)||[]).length===1, JSON.stringify(fl));
 await ev("document.querySelector('footer button').click()");await sleep(700);
 ck('footer -> welcome ekrani', (await ev("view"))==='welcome' && /HOŞ GELDİN|WELCOME/.test(await ev("document.body.innerText")), await ev("view"));
 // hatirlanan kullanici
 await ev("goTo('login','home')");await sleep(400);
 ck('kullanici hatirlandi', (await ev("$('#u').value"))==='deneme', await ev("$('#u').value"));
 await ev("$('#p').value='GuzelSafak47';loginDat.p='GuzelSafak47';login()");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))"));i++) await sleep(250);
 await sleep(700);
 ck('sifre ile giris (PBKDF2)', await ev("!!A"));
 // TAKVIM: her ekran boyutunda tamamen gorunur, arkada kalmaz
 const sizes=[[320,568],[360,640],[390,844],[414,896],[768,1024],[1024,768],[1280,720],[1366,768],[1920,1080],[2560,1440],[3840,2160]];
 for(const [w,h] of sizes){
   await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<700});
   await sleep(350);
   await ev("closeMiniCal();toggleMiniCal()");await sleep(350);
   const r=await ev("(function(){const el=document.querySelector('#mini-cal');const b=el.getBoundingClientRect();return JSON.stringify({top:Math.round(b.top),left:Math.round(b.left),right:Math.round(b.right),bottom:Math.round(b.bottom),vw:innerWidth,vh:innerHeight,disp:getComputedStyle(el).display,z:getComputedStyle(el).zIndex,parent:el.parentElement.tagName})})()");
   const o=JSON.parse(r);
   const inside = o.disp==='block' && o.top>=0 && o.left>=0 && o.right<=o.vw+1 && o.bottom<=o.vh+1 && o.z>1000 && o.parent==='BODY';
   ck('takvim '+w+'x'+h+' tamamen gorunur', inside, r);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await sleep(300);
 // tiklama: takvim acik kalir, bej tema
 await ev("toggleMiniCal()");await sleep(300);
 await ev("(function(){const d=[...document.querySelectorAll('#mini-cal .mini-dot')].find(x=>x.title==='19.11')||document.querySelectorAll('#mini-cal .mini-dot')[6];window.__d=d;d.click()})()");
 await sleep(600);
 ck('tiklamada takvim acik', (await ev("getComputedStyle(document.querySelector('#mini-cal')).display"))==='block');
 ck('tiklamada bej tema', (await ev("document.documentElement.dataset.t"))==='beige');
 ck('tiklayan sayi bej', await ev("window.__d.classList.contains('lit')"));
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
