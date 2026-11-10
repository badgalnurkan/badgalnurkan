const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const PORT=9600+Math.floor(Math.random()*40);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
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
 await ev("goTo('setup','home')");await sleep(400);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';setup()");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(400);
 const cases=[[1440,900,'masaustu','desktop'],[1920,1080,'masaustu-full','desktop-xl'],[2560,1440,'buyuk-ekran','desktop-xl'],[3840,2160,'4K-TV','desktop-xl'],[1024,768,'tablet-yatay','tablet'],[820,1180,'tablet-dikey','tablet'],[390,844,'telefon','phone'],[360,740,'kucuk-telefon','phone'],[844,390,'telefon-yatay','phone']];
 for(const [w,h,name,exp] of cases){
   await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<=1024});
   await sleep(450);
   const fs_=await ev("getComputedStyle(document.documentElement).fontSize");
   const dev=await ev("document.documentElement.dataset.dev");
   const over=await ev("document.documentElement.scrollWidth-document.documentElement.clientWidth");
   ck(name+' ('+w+'x'+h+'): '+dev+' yazi '+fs_+' tasma:'+over, dev===exp && parseFloat(fs_)<=17 && over<=1, 'beklenen='+exp);
 }
 await send('Emulation.clearDeviceMetricsOverride');
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
