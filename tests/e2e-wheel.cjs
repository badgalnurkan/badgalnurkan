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
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(!r||!r.result)return null;if(r.result.exceptionDetails)return 'ERR';return r.result.result&&r.result.result.value};
 const out=[];const ck=(n,o,x)=>out.push((o?'✔ ':'✖ ')+n+(x!==undefined&&x!==null&&x!==''?' ['+x+']':''));
 await send('Runtime.enable');await send('Page.navigate',{url:FILE});await sleep(1500);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await sleep(300);
 await ev("try{localStorage.clear()}catch(e){}");await send('Page.reload');await sleep(1200);
 await ev("goTo('setup','home')");await sleep(400);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';setup()");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(500);
 // uzun sayfa
 await ev("for(let i=0;i<40;i++)A.tasks.push({t:'gorev '+i,done:false,id:'x'+i});save();goTo('app','todo')");await sleep(900);
 await ev("window.scrollTo(0,0)");await sleep(200);
 // TEKERLEK asagi
 await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:720,y:450,deltaX:0,deltaY:700});await sleep(700);
 const y1=await ev("window.scrollY");
 ck('mouse tekerlegi: asagi kayiyor', y1>100, y1);
 // TEKERLEK yukari
 await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:720,y:450,deltaX:0,deltaY:-500});await sleep(700);
 const y2=await ev("window.scrollY");
 ck('mouse tekerlegi: yukari kayiyor', y2<y1, 'yukari sonrasi='+y2);
 // baslik scroll engeli yok
 ck('html overflow kaydirilabilir', (await ev("getComputedStyle(document.documentElement).overflowY"))!=='hidden');
 ck('body overscroll auto', (await ev("getComputedStyle(document.body).overscrollBehaviorY"))==='auto');
 // "not you?" gercekten formu temizliyor
 /* once cikis yap, sonra giris ekranina gel */
 await ev("goTo('app','home')");await sleep(400);
 await ev("(function(){try{confirmLogout=()=>{};A=null;view='login';pg='home';skipRem=false;rememberedUser();renderAppOrAuth()}catch(e){}})()");
 await ev("try{setItem('b1.this','deneme');setItem('b1s','deneme');DB.lastUser='deneme';save();A=null;view='login';pg='home';renderAppOrAuth()}catch(e){}");
 await sleep(700);
 const hasRem=await ev("!!document.querySelector('.remember')");
 ck('hatirlanan hesap karti var', hasRem===true);
 await ev("document.querySelector('.remember')?document.querySelectorAll('.lg-link').length:0");
 await ev("otherUser()");await sleep(600);
 ck('not you: hatirlanan kart gizlendi', (await ev("!!document.querySelector('.remember')"))===false);
 ck('not you: kullanici alani bos', ((await ev("$('#u').value"))||'')==='', JSON.stringify(await ev("$('#u').value")));
 ck('not you: kullanici alani odakli', (await ev("document.activeElement&&document.activeElement.id"))==='u');
 // hatirlanan hesaba donus
 await ev("backToRemembered()");await sleep(400);
 ck('geri donunce hatirlanan hesap yine gelir', (await ev("!!document.querySelector('.remember')"))===true);
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
