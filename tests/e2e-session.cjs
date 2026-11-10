const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]).replace(/\\/g,'/');
const PORT=9300+Math.floor(Math.random()*80);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
const proc=spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let url;for(let i=0;i<60;i++){try{const l=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p){url=p.webSocketDebuggerUrl;break}}catch(e){}await sleep(250)}
 const ws=new WebSocket(url);await new Promise(r=>ws.onopen=r);
 let id=0;const pend=new Map();const errs=[];
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description)};
 const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e.slice(0,60)+': '+(r.result.exceptionDetails.exception&&r.result.exceptionDetails.exception.description));return r.result.result&&r.result.result.value};
 const out=[];const ck=(n,o,x)=>out.push((o?'✔ ':'✖ ')+n+(x!==undefined&&x!==null&&x!==''?' ['+x+']':''));
 await send('Runtime.enable');await send('Page.navigate',{url:FILE});await sleep(1500);
 await ev("try{localStorage.clear();sessionStorage.clear()}catch(e){}");
 await send('Page.reload');await sleep(1200);
 await ev("goTo('setup','home')");await sleep(300);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';$('#p').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(500);
 await ev("goTo('app','todo')");await sleep(600);
 await ev("$('#nt').value='kayitli gorev';addT();mk(0,'done')");await sleep(500);
 ck('gorev kaydedildi', (await ev("A.tasks.length"))===1);
 const before=await ev("A.tasks[0].t+'|'+A.tasks[0].s");
 // 1) YENILEME: oturum korunur
 await send('Page.reload');await sleep(2000);
 ck('YENILEME: oturum korunur (welcome/login degil)', (await ev("!!A&&!!document.querySelector('aside')")), await ev("view"));
 ck('YENILEME: veri yerinde', (await ev("A.tasks[0].t+'|'+A.tasks[0].s"))===before, await ev("A.tasks[0]&&A.tasks[0].t+'|'+A.tasks[0].s"));
 ck('YENILEME: ayni sayfada kalindi', (await ev("pg"))==='todo', await ev("pg"));
 ck('YENILEME: % korunur', (await ev("pct()"))===1);
 // 2) YENI SEKME: oturum korunur
 const t2=await send('Target.createTarget',{url:FILE});
 await sleep(2500);
 const list=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();
 const pg2=list.find(t=>t.type==='page'&&t.id===t2.result.targetId.replace(/[^A-Za-z0-9]/g,''))||list.find(t=>t.type==='page'&&t.url.startsWith('file:')&&t.id!==undefined&&t.webSocketDebuggerUrl!==url);
 // 2. sekmeye baglan
 let ws2=new WebSocket(pg2.webSocketDebuggerUrl);await new Promise(r=>ws2.onopen=r);
 let id2=0;const pend2=new Map();
 ws2.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend2.has(m.id)){pend2.get(m.id)(m);pend2.delete(m.id)}};
 const send2=(m,p={})=>new Promise(r=>{const i=++id2;pend2.set(i,r);ws2.send(JSON.stringify({id:i,method:m,params:p}))});
 const ev2=async e=>{const r=await send2('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw new Error(e.slice(0,60)+': '+(r.result.exceptionDetails.exception&&r.result.exceptionDetails.exception.description));return r.result.result&&r.result.result.value};
 await send2('Runtime.enable');await sleep(1500);
 ck('YENI SEKME: kullanici hatirlandi', await ev2("!!A"), await ev2("A?A.u:'yok'"));
 ck('YENI SEKME: veriler yuklendi', (await ev2("A&&A.tasks.length"))===1, await ev2("A?A.tasks.length:'-'"));
 ck('YENI SEKME: menu var', await ev2("!!document.querySelector('aside')"));
 ws2.close();
 // 3) cerez reddedilse de hatirlanir
 await ev("try{localStorage.setItem('b1ck','0')}catch(e){}");
 await send('Page.reload');await sleep(1800);
 ck('CEREZ REDDI: hala hatirliyor', await ev("!!A"));
 // 4) yedek (b1.bak) olusur, anahtar silinince kurtarir
 await sleep(300);
 await ev("backupTick()");
 ck('yedek anahtari var', await ev("!!localStorage.getItem('b1.bak')"));
 await ev("localStorage.setItem('b1','{}');");
 await send('Page.reload');await sleep(1800);
 ck('BOZUK VERI: yedekten kurtarildi', (await ev("Object.keys(DB.accounts).length"))>0, await ev("Object.keys(DB.accounts).join(',')"));
 ck('BOZUK VERI: oturum yine acik', await ev("!!A"), await ev("A?A.u:'yok'"));
 // 5) mobil menu
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 await sleep(500);
 ck('MOBIL: menu yatay', (await ev("getComputedStyle(document.querySelector('aside')).flexDirection"))==='row');
 ck('MOBIL: dokunma hedefi yeterli', (await ev("document.querySelector('aside a').getBoundingClientRect().height"))>=40, Math.round(await ev("document.querySelector('aside a').getBoundingClientRect().height")));
 ck('MOBIL: yatay kaydirma acik', /auto|scroll/.test(await ev("getComputedStyle(document.querySelector('aside')).overflowX")), await ev("getComputedStyle(document.querySelector('aside')).overflowX"));
 const before2=await ev("pg");await ev("document.querySelectorAll('aside a')[3].click()");await sleep(700);
 ck('MOBIL: menu gecisi calisiyor', (await ev("pg"))!==before2, await ev("pg"));
 ck('MOBIL: tasma yok', await ev("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"));
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
