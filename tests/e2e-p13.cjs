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
 const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(!r||!r.result)return null;if(r.result.exceptionDetails)return 'ERR';return r.result.result&&r.result.result.value};
 const out=[];const ck=(n,o,x)=>out.push((o?'✔ ':'✖ ')+n+(x!==undefined&&x!==null&&x!==''?' ['+x+']':''));
 await send('Runtime.enable');await send('Page.navigate',{url:FILE});await sleep(1500);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await ev("try{localStorage.clear();sessionStorage.clear()}catch(e){}");await send('Page.reload');await sleep(1300);
 await ev("goTo('setup','home')");await sleep(400);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';setup()");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(600);
 // menu: kabuk yeniden cizilmiyor
 await ev("window.__aside=document.querySelector('aside');window.__hdr=document.querySelector('header.top')");
 const links=await ev("[...document.querySelectorAll('aside a[data-k]')].map(a=>a.dataset.k)");
 ck('menu ogeleri data-k ile', Array.isArray(links)&&links.length>=5, links&&links.join(','));
 const last=links[links.length-1];
 await ev("document.querySelector('aside').scrollLeft=9999");await sleep(300);
 const sl0=await ev("document.querySelector('aside').scrollLeft");
 await ev(`document.querySelector('aside a[data-k="${last}"]').click()`);await sleep(900);
 ck('mobil: menu ayni eleman (yeniden cizilmedi)', await ev("document.querySelector('aside')===window.__aside"));
 ck('mobil: header ayni eleman', await ev("document.querySelector('header.top')===window.__hdr"));
 ck('mobil: son sekme secili', await ev(`document.querySelector('aside a[data-k="${last}"]').classList.contains('on')`));
 ck('mobil: tek secili sekme', (await ev("document.querySelectorAll('aside a.on').length"))===1);
 const sl1=await ev("document.querySelector('aside').scrollLeft");
 ck('mobil: menu basa atmadi', sl1>20, 'once='+sl0+' sonra='+sl1);
 ck('mobil: menu intro animasyonu tekrar oynamiyor', !(await ev("document.querySelector('aside').classList.contains('intro')&&getComputedStyle(document.querySelector('aside')).animationName!=='none'&&document.querySelector('aside').getAnimations().length>0")));
 ck('mobil: sayfa icerigi animasyonlu', await ev("document.querySelector('#mn').classList.contains('an')"));
 // takvim yuzdesi
 await ev("A.hist[addD(today(),-2)]=[{t:'a',done:true},{t:'b',done:false}];A.hist[addD(today(),-3)]=[{t:'a',done:true}];save()");
 await ev(`document.querySelector('aside a[data-k="pc"]').click()`);await sleep(900);
 const pcts=await ev("[...document.querySelectorAll('.cal .dot em.dpct')].map(e=>e.textContent.trim()).filter(Boolean)");
 ck('takvimde gunluk yuzde var', Array.isArray(pcts)&&pcts.includes('%50')&&pcts.includes('%100'), pcts&&pcts.join(' '));
 ck('takvim: gelecek gunlerde yuzde yok', await ev("[...document.querySelectorAll('.cal .dot.future em.dpct')].every(e=>e.textContent.trim()==='')"));
 ck('takvim noktalari tasmiyor', (await ev("document.documentElement.scrollWidth-document.documentElement.clientWidth"))<=1);
 // giris ekraninda yenileme -> ayni ekran
 await ev("goLogin()");await sleep(700);
 ck('cikista giris ekrani', (await ev("view"))==='login' && !(await ev("!!A")));
 await send('Page.reload');await sleep(1700);
 ck('yenileme: giris ekrani kaldi', (await ev("view"))==='login' && !(await ev("!!A")) && (await ev("!!document.querySelector('.login-wrap')")), await ev("view"));
 ck('yenileme: hatirlanan hesap karti duruyor', await ev("!!document.querySelector('.remember')"));
 await send('Page.reload');await sleep(1700);
 ck('ikinci yenileme: yine giris ekrani', (await ev("view"))==='login');
 // uygulamadayken yenileme -> uygulama kalir
 await ev("$('#u').value='deneme';loginDat.u='deneme';$('#p').value='GuzelSafak47';loginDat.p='GuzelSafak47';login()");
 for(let i=0;i<60 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(400);
 await send('Page.reload');await sleep(1800);
 ck('uygulamada yenileme: oturum korunur', await ev("!!A&&!!document.querySelector('aside')"));
 // giris ust seridi simetri: tum cihazlar
 await ev("goLogin()");await sleep(600);
 const devs=[[1440,900,false],[1920,1080,false],[1024,768,true],[820,1180,true],[390,844,true],[360,740,true],[320,568,true],[844,390,true]];
 for(const [w,h,mob] of devs){
   await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:mob});await sleep(500);
   const g=await ev(`(function(){const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top,b:b.bottom,cy:(b.top+b.bottom)/2}};return {th:r('.login-top .themebar'),lb:r('.login-top .langbar'),bx:r('.login-wrap .box'),sw:document.documentElement.scrollWidth-document.documentElement.clientWidth}})()`);
   if(!g||!g.th||!g.lb||!g.bx){ck(w+'x'+h+': ust serit',false);continue}
   const sameRow=Math.abs(g.th.cy-g.lb.cy)<=3;
   const symL=Math.abs(g.th.l-g.bx.l),symR=Math.abs(g.bx.r-g.lb.r);
   const gap=g.lb.l-g.th.r;
   ck(w+'x'+h+': tema+dil ayni hizada, simetrik, cakismasiz', sameRow && symL<=2 && symR<=2 && gap>=4 && g.sw<=1, 'sol='+symL.toFixed(0)+' sag='+symR.toFixed(0)+' ara='+gap.toFixed(0));
 }
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
