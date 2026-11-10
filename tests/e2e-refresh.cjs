// YENILEME DAYANIKLILIGI: 5 senaryoda kullanici asla unutulmamali
const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const PORT=9100+Math.floor(Math.random()*80);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
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
 await send('Page.reload');await sleep(1300);
 await ev("goTo('setup','home')");await sleep(300);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';$('#p').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(500);
 await ev("goTo('app','todo')");await sleep(600);
 await ev("$('#nt').value='g1';addT();mk(0,'done')");await sleep(400);
 ck('gorev kaydi', (await ev("A&&A.tasks.length"))===1);

// 1) basit yenileme
 await send('Page.reload');await sleep(1800);
 ck('1) F5 sonrasi oturum acik', (await ev("!!A && !!document.querySelector('aside')")), await ev("A?A.u:'yok'"));
 ck('1) veri korunur', (await ev("A.tasks.length"))===1);

// 2) oturum anahtari (b1s) elle silinmis -> yedek yollardan kurtarir
 await ev("try{localStorage.removeItem('b1s');sessionStorage.removeItem('b1s')}catch(e){}");
 await send('Page.reload');await sleep(1800);
 ck('2) b1s silinse de hatirliyor', (await ev("!!A")), await ev("A?A.u:'yok'"));

// 3) ana kayit (b1) bozulmus -> yedekten kurtarma + oturum
 await ev("backupTick();try{localStorage.setItem('b1','}}bozuk{{')}catch(e){}");
 await send('Page.reload');await sleep(1800);
 ck('3) bozuk kayit -> yedek + oturum', (await ev("!!A")) && (await ev("Object.keys(DB.accounts).length"))>0);

// 4) tum oturum anahtarlari silindi -> DB.lastUser ile giris ekrani on-dolu
 await ev("try{localStorage.removeItem('b1s');localStorage.removeItem('b1.this')}catch(e){}");
 await send('Page.reload');await sleep(1800);
 const st4=await ev("(function(){return JSON.stringify({view:view,A:!!A,u:$('#u')?$('#u').value:null})})()");
 ck('4) lastUser ile hatirlama / on-dolu giris', (await ev("!!A"))||/deneme/.test(st4), st4);

// 5) coklu yenileme (art arda 5 kez) — hep hatirliyor
 for(let i=0;i<5;i++){await send('Page.reload');await sleep(1300);}
 ck('5) art arda 5 yenileme sonrasi oturum acik', await ev("!!A && !!document.querySelector('aside')"));
 ck('5) veriler yerinde', (await ev("A.tasks.length"))===1);
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
