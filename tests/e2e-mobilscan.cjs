const { spawn } = require('child_process');const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const PORT=9750+Math.floor(Math.random()*40);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
const proc=spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let wsu;for(let i=0;i<60;i++){try{const l=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p){wsu=p.webSocketDebuggerUrl;break}}catch(e){}await sleep(250)}
 const ws=new WebSocket(wsu);await new Promise(r=>ws.onopen=r);let id=0;const pend=new Map();const errs=[];
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}if(m.method==='Runtime.exceptionThrown'){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description||d.text||'').split('\n')[0])}};
 const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(!r||!r.result)return null;if(r.result.exceptionDetails)return 'ERR';return r.result.result&&r.result.result.value};
 const tap=async sel=>{const b=await ev(`(function(){const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center',inline:'center',behavior:'instant'});return 1})()`);if(!b)return false;await sleep(450);const bb=await ev(`(function(){const e=document.querySelector(${JSON.stringify(sel)});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,hit:(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===e||e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))}})()`);if(!bb.hit)console.log('ORTUSME',sel,JSON.stringify(bb));const b2=bb;
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b2.x,y:b2.y}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return true};
 const out=[];const ck=(n,o,x)=>out.push((o?'✔ ':'✖ ')+n+(x!==undefined&&x!==null&&x!==''?' ['+x+']':''));
 await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:FILE});await sleep(1500);
 await ev("localStorage.clear();sessionStorage.clear();localStorage.setItem('b1cloud','0')");await send('Page.reload');await sleep(1300);
 // kayit hatasi mesaji (eski cokme)
 await ev("goTo('setup','home')");await sleep(300);
 const r0=await ev("(async()=>{try{$('#u').value='a1';$('#n').value='x';$('#e').value='q@q.co';$('#p').value='GuzelSafak47';await setup();return msg}catch(e){return 'EXC '+e.message}})()");
 ck('kayit: hatali ad mesaji cokmez',r0&&!/^EXC/.test(r0),r0);
 await ev("(async()=>{$('#u').value='mobil';$('#n').value='Mobil';$('#e').value='m@m.co';$('#p').value='GuzelSafak47';await setup()})()");
 for(let i=0;i<80&&!(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++)await sleep(250);
 await sleep(800);
 await ev("A.backlog=['eski1','eski2'];A.tasks=[{t:'g1',s:''}];A.hist[addD(today(),-1)]=[{t:'g',done:true}];save()");
 const devs=[['iPhone',390,844],['kucuk',360,740],['SE',320,568],['tablet',820,1180],['yatay',844,390]];
 for(const [nm,w,h] of devs){
   await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:true});await sleep(400);
   const keys=await ev("[...document.querySelectorAll('aside a[data-k]')].map(a=>a.dataset.k)");
   for(const k of keys){
     const e0=errs.length;
     await tap(`aside a[data-k="${k}"]`);await sleep(650);
     const st=await ev(`JSON.stringify({pg,on:document.querySelector('aside a.on')&&document.querySelector('aside a.on').dataset.k,mn:document.querySelector('#mn').children.length,ox:document.documentElement.scrollWidth-document.documentElement.clientWidth,wide:[...document.querySelectorAll('#mn *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1}).slice(0,2).map(e=>e.tagName+'.'+e.className).join(' ')})`);
     const s=JSON.parse(st||'{}');
     ck(`${nm} ${w}x${h} · ${k}`, s.pg===k&&s.on===k&&s.mn>0&&s.ox<=1&&!s.wide&&errs.length===e0, (s.pg!==k?'acilmadi ':'')+(s.ox>1?'tasma='+s.ox+' ':'')+(s.wide?'tasan:'+s.wide+' ':'')+(errs.length>e0?errs.slice(e0).join('|'):''));
   }
 }
 // to-do dokunmatik islemler
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await sleep(300);
 await tap('aside a[data-k="todo"]');await sleep(600);
 await ev("$('#nt').value='dokun'");await tap('#nt + button');await sleep(300);
 ck('mobil: ekle butonu',await ev("A.tasks.some(x=>x.t==='dokun')"));
 await tap('#t0 .ck');await sleep(250);ck('mobil: ✓ dokunma',(await ev("A.tasks[0].s"))==='done');
 await tap('#t0 .xx');await sleep(250);ck('mobil: ✕ dokunma',(await ev("A.tasks[0].s"))==='miss');
 const bl0=await ev("A.backlog.length");
 await tap('#mn .card:nth-child(2) .task button');await sleep(350);ck('mobil: bekleyeni bugune ekle',(await ev("A.backlog.length"))===bl0-1);
 const tbtn=await ev("(function(){const b=[...document.querySelectorAll('#mn button')];return b.filter(x=>{const r=x.getBoundingClientRect();return r.height>0&&(r.height<32||r.width<32)}).map(x=>x.textContent.trim()+':'+Math.round(x.getBoundingClientRect().height)).slice(0,4).join(',')})()");
 ck('mobil: dokunma hedefleri ≥32px',!tbtn,tbtn);
 ck('JS hatasi yok',errs.length===0,[...new Set(errs)].slice(0,3).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
