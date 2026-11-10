const { spawn } = require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const BROWSER='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FILE='file:///'+path.resolve(process.argv[2]||'deneme.html').replace(/\\/g,'/');
const PORT=9550+Math.floor(Math.random()*40);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ep-'));
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
 const geo=`(function(){
   const g=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom),w:Math.round(r.width)}};
   const th=g('.login-top .themebar'),lb=g('.login-top .langbar'),bx=g('.login-wrap .box');
   if(!th||!lb||!bx)return null;
   const ov=!(lb.l>=th.r-1||lb.r<=th.l+1||lb.t>=th.b-1||lb.b<=th.t+1);
   return {th,lb,bx,overlap:ov,vw:innerWidth,vh:innerHeight};
 })()`;
 const measure=async(w,h,mob)=>{
   await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:!!mob});
   await send('Page.navigate',{url:FILE});await sleep(1500);
   await ev("try{A=null;view='login';pg='home';renderAppOrAuth()}catch(e){}");await sleep(700);
   return await ev(geo);
 };
 await send('Runtime.enable');
 const devs=[[1440,900,'masaustu',false],[1920,1080,'masaustu-genis',false],[1024,768,'tablet-yatay',true],[820,1180,'tablet-dikey',true],[390,844,'telefon',true],[360,740,'kucuk-telefon',true],[844,390,'telefon-yatay',true]];
 for(const [w,h,name,mob] of devs){
   const g=await measure(w,h,mob);
   ck(name+' ('+w+'x'+h+'): ust serit var', !!g && !!g.th && !!g.lb);
   if(!g) continue;
   ck(name+': dil ve tema cakismiyor', !g.overlap);
   ck(name+': tema ustte', g.th.b<=g.lb.t+2, 'temaAlt='+g.th.b+' dilUst='+g.lb.t);
   ck(name+': dil sag ust kosede', g.lb.r>=g.th.r-2, 'dilSag='+g.lb.r+' temaSag='+g.th.r);

   const nearRight=(g.lb.r>=g.th.r-2)||(g.lb.r>=g.vw/2 && g.lb.r>=g.bx.r-8);
   ck(name+': dil sag kenarda', nearRight, 'dil sag='+g.lb.r+' tema sag='+g.th.r+' genislik='+g.vw);
   ck(name+': kutu ekran icinde', g.bx.l>=0 && g.bx.r<=g.vw+1 && g.bx.w>=250, 'gen='+g.bx.w);
   ck(name+': yatay tasma yok', (await ev("document.documentElement.scrollWidth-document.documentElement.clientWidth"))<=1);
 }
 await send('Emulation.clearDeviceMetricsOverride');
 ck('JS hatasi yok', errs.length===0, errs.slice(0,2).join(' | '));
 console.log(out.join('\n'));
 const ok=out.filter(x=>x.startsWith('✔')).length;
 console.log('\n'+ok+'/'+out.length+' gecti');
 ws.close();proc.kill();process.exit(0);
})().catch(e=>{console.error('HATA:',e.message);proc.kill();process.exit(1)});
