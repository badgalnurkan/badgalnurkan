const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const PORT=9800+Math.floor(Math.random()*40);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
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
 await ev("try{localStorage.clear()}catch(e){}");await send('Page.reload');await sleep(1300);

 // TELEFON: welcome ekraninda marka ve tema ust uste binmiyor
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await sleep(500);
 const rects=await ev("(function(){const b=document.querySelector('.brand-badge'),t=document.querySelector('#theme-anchor');if(!b||!t)return null;const r1=b.getBoundingClientRect(),r2=t.getBoundingClientRect();const ov=!(r2.left>=r1.right-1||r2.right<=r1.left+1||r2.top>=r1.bottom-1||r2.bottom<=r1.top+1);return {ov:ov,b:Math.round(r1.top),t:Math.round(r2.top),tr:Math.round(r2.right)}})()");
 ck('welcome: marka ve tema cakismiyor', rects&&!rects.ov, JSON.stringify(rects));
 ck('welcome: tema ekran icinde', rects && rects.tr<=390, rects&&rects.tr);
 const fsM=await ev("getComputedStyle(document.documentElement).fontSize");
 ck('mobil font >=16px', parseFloat(fsM)>=16, fsM);

 // hesap ac
 await ev("goTo('setup','home')");await sleep(500);
 await ev("$('#u').value='deneme';formDat.u='deneme';$('#n').value='Deneme';formDat.n='Deneme';$('#e').value='a@b.co';formDat.e='a@b.co';$('#p').value='GuzelSafak47';formDat.p='GuzelSafak47';setup()");
 for(let i=0;i<80 && !(await ev("!!(A&&document.querySelector('aside'))&&!document.querySelector('.greet-screen')"));i++) await sleep(250);
 await sleep(600);
 ck('hesap acildi', await ev('!!A'));

 // menuye basilinca sayfa basa atmiyor
 await ev("goTo('app','rep')");await sleep(700);
 await ev("window.scrollTo(0,400)");await sleep(200);
 const y1=await ev("window.scrollY");
 await ev("(function(){const a=[...document.querySelectorAll('aside a')];navGo(a[a.length-2],'app','home');return 1})()");
 await sleep(700);
 const y2=await ev("window.scrollY");
 ck('menu gecisi sayfayi basa atmaz', y2<=2, 'once='+y1+' sonra='+y2);
 ck('gecis sonrasi sayfa var', await ev("!!document.querySelector('main .card')"));

 // cok kucuk telefonda tasma yok
 for(const [w,h] of [[320,568],[360,640],[390,844],[414,896],[600,900]]){
   await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});await sleep(350);
   const over=await ev("document.documentElement.scrollWidth-document.documentElement.clientWidth");
   const fsx=await ev("getComputedStyle(document.documentElement).fontSize");
   ck(w+'x'+h+': tasma '+over+' font '+fsx, over<=1 && parseFloat(fsx)>=16);
 }

 // MASAUSTU: giris kutusu makul en-boy orani (temiz sayfa ile olc)
 const measure=async(w,h)=>{
   await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
   await send('Page.navigate',{url:FILE});await sleep(1500);
   await ev("try{A=null;view='login';pg='home';renderAppOrAuth()}catch(e){}");await sleep(700);
   return await ev("(function(){const x=document.querySelector('.box');if(!x)return null;const r=x.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),cx:Math.round(r.left+r.width/2)}})()");
 };
 const b1440=await measure(1440,900);
 ck('1440: giris kutusu genislik 320-440px', b1440 && b1440.w>=320 && b1440.w<=440, b1440&&b1440.w);
 ck('1440: en-boy orani dengeli', b1440 && (b1440.w/b1440.h)>0.55 && (b1440.w/b1440.h)<1.6, b1440&&(b1440.w/b1440.h).toFixed(2));
 ck('1440: yatayda ortali', b1440 && Math.abs(b1440.cx-720)<=8, b1440&&b1440.cx);
 const b1920=await measure(1920,1080);
 ck('1920: giris kutusu ortali ve makul', b1920 && Math.abs(b1920.cx-960)<=8 && b1920.w<=440, JSON.stringify(b1920));
 await send('Emulation.clearDeviceMetricsOverride');
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));console.log('\n'+out.filter(x=>x.startsWith('✔')).length+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
