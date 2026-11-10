const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]).replace(/\\/g,'/');
const PORT=9610+Math.floor(Math.random()*80);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
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
 for(let i=0;i<60 && !(await ev("!!(A&&document.querySelector('aside'))"));i++) await sleep(250);
 await sleep(600);
 // KRONOMETRE bicimi
 ck('kronometre sifir: S.dss', (await ev("fms(0)"))==='0.00', await ev("fms(0)"));
 ck('kronometre 3.5s: 3.50', (await ev("fms(3500)"))==='3.50', await ev("fms(3500)"));
 ck('kronometre 12.34s: 12.34', (await ev("fms(12340)"))==='12.34', await ev("fms(12340)"));
 ck('kronometre 1dk 5.6s: 1:05.60', (await ev("fms(65600)"))==='1:05.60', await ev("fms(65600)"));
 ck('kronometre 1sa: 1:00:00.00', (await ev("fms(3600000)"))==='1:00:00.00', await ev("fms(3600000)"));
 await ev("goTo('app','pomo')");await sleep(400);
 const sw0=await ev("$('#sw').textContent");
 ck('sayfada 00:00.00 (bastaki sifir yok)', sw0==='0.00', sw0);
 await ev("swS()");await sleep(300);const sw1=await ev("$('#sw').textContent");await ev("swR()");
 ck('calisirken S.dss', /^\d\d?\.\d\d$/.test(sw1), sw1);
 // FOOTER
 ck('footer: tek buton', (await ev("document.querySelectorAll('footer button').length"))===1, await ev("document.querySelectorAll('footer button').length"));
 const label=await ev("document.querySelector('#back-welcome').textContent.trim()");
 ck('cift ok yok', !label.includes('← ←') && (label.match(/←/g)||[]).length===1, JSON.stringify(label));
 await ev("document.querySelector('#back-welcome').click()");await sleep(700);
 ck('footer welcome ekranina gitti', (await ev("view"))==='welcome' && /HOŞ GELDİN|WELCOME/.test(await ev("document.body.innerText")), await ev("view"));
 // welcome -> giris -> hesap hatirlama
 await ev("goTo('login','home')");await sleep(400);
 ck('giris ekraninda kullanici hatirlandi', (await ev("$('#u').value"))==='deneme', await ev("$('#u').value"));
 // header takvim hala dogru: tiklayinca arkada kalmiyor
 await ev("$('#p').value='GuzelSafak47';loginDat.p='GuzelSafak47';login()");
 for(let i=0;i<60 && !(await ev("!!(A&&document.querySelector('aside')&&document.querySelectorAll('#mini-cal .mini-dot').length>0)"));i++) await sleep(250);
 await sleep(600);
 await ev("toggleMiniCal()");await sleep(300);
 await ev("(function(){const d=[...document.querySelectorAll('#mini-cal .mini-dot')].find(x=>x.title==='19.11')||document.querySelectorAll('#mini-cal .mini-dot')[6];window.__d=d;d.click()})()");
 await sleep(500);
 ck('takvim tiklamada acik kaliyor', (await ev("getComputedStyle(document.querySelector('#mini-cal')).display"))==='block');
 ck('tiklamada tum arayuz bej', (await ev("document.documentElement.dataset.t"))==='beige');
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
