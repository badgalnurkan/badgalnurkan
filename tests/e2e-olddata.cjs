const { spawn } = require('child_process');const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const PORT=9950+Math.floor(Math.random()*40);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
const proc=spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let wsu;for(let i=0;i<60;i++){try{const l=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p){wsu=p.webSocketDebuggerUrl;break}}catch(e){}await sleep(250)}
 const ws=new WebSocket(wsu);await new Promise(r=>ws.onopen=r);let id=0;const pend=new Map();const errs=[];
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails.text)};
 const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(!r||!r.result)return null;if(r.result.exceptionDetails)return 'ERR';return r.result.result&&r.result.result.value};
 const out=[];const ck=(n,o,x)=>out.push((o?'✔ ':'✖ ')+n+(x!==undefined&&x!==null&&x!==''?' ['+x+']':''));
 await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 await send('Page.navigate',{url:FILE});await sleep(1500);
 await ev("localStorage.clear();sessionStorage.clear();localStorage.setItem('b1cloud','0')");await send('Page.reload');await sleep(1300);
 await ev("(async()=>{goTo('setup','home');await new Promise(r=>setTimeout(r,300));$('#u').value='eskiveri';$('#n').value='E';$('#e').value='e@e.co';$('#p').value='GuzelSafak47';await setup()})()");
 for(let i=0;i<80&&!(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++)await sleep(250);
 const cases={'backlog yok':"delete A.backlog",'tasks yok':"delete A.tasks",'backlog nesne':"A.backlog=[{t:'nesne'},null,5]",'tasks metin':"A.tasks=['duz metin',null,{text:'eski',done:true}]",'tasks obje':"A.tasks={a:{t:'x',s:''}}",'hist yok':"delete A.hist"};
 for(const [n,js] of Object.entries(cases)){
   await ev(js+";save();goTo('app','home')");await sleep(300);const e0=errs.length;
   await ev("document.querySelector('aside a[data-k=todo]').click()");await sleep(700);
   ck('eski veri: '+n,(await ev("pg==='todo'&&!!document.querySelector('#nt')"))&&errs.length===e0,errs.slice(e0).join('|'));
   ck('  ekleme calisir ('+n+')',(await ev("$('#nt').value='yeni';addT();A.tasks.some(x=>x.t==='yeni')")));
 }
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
