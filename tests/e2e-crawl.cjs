const { spawn } = require('child_process');const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const W=+(process.argv[3]||390),H=+(process.argv[4]||844),MOB=W<1000;
const PORT=9800+Math.floor(Math.random()*90);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
const proc=spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let wsu;for(let i=0;i<60;i++){try{const l=await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();const p=l.find(t=>t.type==='page');if(p){wsu=p.webSocketDebuggerUrl;break}}catch(e){}await sleep(250)}
 const ws=new WebSocket(wsu);await new Promise(r=>ws.onopen=r);let id=0;const pend=new Map();const errs=[];
 ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}if(m.method==='Runtime.exceptionThrown'){const d=m.params.exceptionDetails;errs.push((d.exception&&d.exception.description||d.text||'').split('\n').slice(0,2).join(' '))}
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errs.push('console.error: '+m.params.args.map(a=>a.value||a.description).join(' '))};
 const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(!r||!r.result)return null;if(r.result.exceptionDetails)return 'ERR:'+r.result.exceptionDetails.exception.description.split('\n')[0];return r.result.result&&r.result.result.value};
 await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:MOB});
 await send('Page.navigate',{url:FILE});await sleep(1500);
 await ev("localStorage.clear();sessionStorage.clear();localStorage.setItem('b1cloud','0');window.confirm=()=>false;window.alert=()=>{};window.open=()=>null");await send('Page.reload');await sleep(1300);
 await ev("window.confirm=()=>false;window.alert=()=>{};window.open=()=>null");
 // auth ekranlari: her butona bas
 const report=[];
 const clickAll=async(label,setupJs,skipRe)=>{
   await ev(setupJs);await sleep(350);
   const n=await ev(`document.querySelectorAll('#app button, #app [role=button], #app a.lg-link').length`);
   for(let i=0;i<n;i++){
     await ev(setupJs);await sleep(200);
     const info=await ev(`(function(){const b=document.querySelectorAll('#app button, #app [role=button], #app a.lg-link')[${i}];if(!b)return null;return (b.getAttribute('onclick')||'')+' | '+b.textContent.trim().slice(0,30)})()`);
     if(!info||new RegExp(skipRe).test(info))continue;
     const e0=errs.length;
     await ev(`try{document.querySelectorAll('#app button, #app [role=button], #app a.lg-link')[${i}].click()}catch(e){}`);await sleep(260);
     await ev("document.querySelectorAll('.modal').forEach(m=>m.remove());document.querySelectorAll('.greet-screen').forEach(g=>g.remove())");
     if(errs.length>e0)report.push(label+' :: '+info+' => '+errs.slice(e0).join(' || '));
   }
   return n;
 };
 const SKIP='goHome|headerHome|confirmLogout|delAcc|logoutAll|sbLogout|pickLang|tiktok|instagram|mailto';
 let total=0;
 total+=await clickAll('welcome',"goTo('welcome','home')",SKIP);
 total+=await clickAll('setup',"goTo('setup','home')",SKIP+'|setup\\(');
 total+=await clickAll('forgot',"goTo('forgot','home')",SKIP);
 // hesap ac
 await ev("goTo('setup','home')");await sleep(300);
 await ev("(async()=>{$('#u').value='tarama';$('#n').value='Tarama';$('#e').value='t@t.co';$('#p').value='GuzelSafak47';await setup()})()");
 for(let i=0;i<80&&!(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++)await sleep(250);
 await sleep(500);
 await ev("A.tasks=[{t:'a',s:''},{t:'b',s:'done'}];A.backlog=['x','y'];A.hist[addD(today(),-1)]=[{t:'a',done:true},{t:'b',done:false}];A.future=A.future||{};A.future[addD(today(),3)]='not';save()");
 const pages=await ev("[...document.querySelectorAll('aside a[data-k]')].map(a=>a.dataset.k)");
 const SKIP2=SKIP+'|navGo|delT|backlog.splice|delQ|delNote|setTheme|toggleBeige|th\\(|ck\\(|chg\\(';
 for(const p of pages){
   const e0=errs.length;
   const n=await ev(`goTo('app','${p}');document.querySelectorAll('#mn button,#mn [role=button],#mn .dot').length`);await sleep(300);
   if(errs.length>e0)report.push('sayfa '+p+' acilirken => '+errs.slice(e0).join(' || '));
   for(let i=0;i<n;i++){
     await ev(`if(pg!=='${p}')goTo('app','${p}')`);await sleep(150);
     const info=await ev(`(function(){const b=document.querySelectorAll('#mn button,#mn [role=button],#mn .dot')[${i}];if(!b)return null;return (b.getAttribute('onclick')||'')+' | '+b.textContent.trim().slice(0,30)})()`);
     if(!info||new RegExp(SKIP2).test(info))continue;
     const e1=errs.length;
     await ev(`try{document.querySelectorAll('#mn button,#mn [role=button],#mn .dot')[${i}].click()}catch(e){}`);await sleep(250);
     // modal varsa icindeki iptal disindaki butonlar
     await ev("document.querySelectorAll('.modal').forEach(m=>m.remove())");
     await ev("try{if(typeof pm!=='undefined'&&pm.run){clearInterval(pm.iv);pm.run=false}}catch(e){}");
     if(errs.length>e1)report.push(p+' :: '+info+' => '+errs.slice(e1).join(' || '));
   }
   total+=n;
 }
 // header ve mini takvim
 const e2=errs.length;await ev("toggleMiniCal(new MouseEvent('click'))");await sleep(200);await ev("document.querySelector('#mini-cal .mini-dot')&&document.querySelector('#mini-cal .mini-dot').click()");await sleep(200);
 if(errs.length>e2)report.push('mini takvim => '+errs.slice(e2).join(' || '));
 // tasma kontrolu tum sayfalarda
 const ovs=[];
 for(const p of pages){await ev(`goTo('app','${p}')`);await sleep(350);const o=await ev("(function(){const x=document.documentElement.scrollWidth-document.documentElement.clientWidth;const w=[...document.querySelectorAll('#mn *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&getComputedStyle(e).position!=='fixed'&&!e.closest('aside')}).slice(0,2).map(e=>e.tagName+'.'+String(e.className).slice(0,20));return x>1||w.length?x+' '+w.join(','):''})()");if(o)ovs.push(p+': '+o)}
 console.log(`[${W}x${H}] ${total} oge tiklandi`);
 console.log(report.length?'HATALAR:\n'+[...new Set(report)].join('\n'):'HATA YOK');
 console.log(ovs.length?'TASMA:\n'+ovs.join('\n'):'TASMA YOK');
 console.log('toplam js hatasi:',errs.length);
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
