'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'App inline script is present');
function extract(a,b){
 const start=script.indexOf(a),end=script.indexOf(b,start+1);
 assert.ok(start>=0&&end>start,'Missing '+a);
 return script.slice(start,end);
}
function clockFixture(language='tr'){
 const context={
  pm:{w:90,b:60,ph:'w',lg:0,left:5400},
  A:{presets:[{w:90,b:10},{w:120,b:75}]},
  pad:n=>String(n).padStart(2,'0'),
  tr:()=>language==='tr'
 };
 vm.createContext(context);
 vm.runInContext(extract('const ft=s=>','/* kronometre: milisaniye')+'\nthis.ux={formatPomoClock,pomoPhaseMinutes,pomoClock}',context);
 return {context,ux:context.ux};
}
test('60, 61, 90, 120 and 600 minute clocks retain exact seconds',()=>{
 const {ux}=clockFixture();
 const cases=[
  [60,3600,'1 sa 00 dk 00 sn'],
  [61,3660,'1 sa 01 dk 00 sn'],
  [90,5400,'1 sa 30 dk 00 sn'],
  [120,7200,'2 sa 00 dk 00 sn'],
  [600,36000,'10 sa 00 dk 00 sn'],
  [90,5359,'1 sa 29 dk 19 sn'],
  [90,3599,'0 sa 59 dk 59 sn'],
  [90,1,'0 sa 00 dk 01 sn'],
  [90,0,'0 sa 00 dk 00 sn']
 ];
 for(const [minutes,seconds,expected] of cases)
  assert.equal(ux.formatPomoClock(seconds,minutes),expected,minutes+'/'+seconds);
 assert.equal(ux.formatPomoClock(1500,25),'25:00');
 assert.equal(ux.formatPomoClock(3599,59),'59:59');
 assert.equal(ux.formatPomoClock(3599,60),'0 sa 59 dk 59 sn');
});
test('English localization and break phase use the selected long-session duration',()=>{
 const {ux,context}=clockFixture('en');
 assert.equal(ux.formatPomoClock(5400,90),'1 h 30 min 00 sec');
 context.pm.ph='b';
 context.pm.lg=0;
 context.pm.left=60;
 assert.equal(ux.pomoPhaseMinutes(),60);
 assert.equal(ux.pomoClock(),'0 h 01 min 00 sec');
 context.pm.lg=1;
 context.pm.left=75*60;
 assert.equal(ux.pomoPhaseMinutes(),75,'long break uses longest stored break');
 assert.equal(ux.pomoClock(),'1 h 15 min 00 sec');
 context.pm.ph='w';context.pm.left=1;
 assert.equal(ux.pomoClock(),'0 h 00 min 01 sec');
});
test('focus, overlay and PiP all use the same live formatter',()=>{
 assert.match(script,/id="pt">\$\{pomoClock\(\)\}/);
 assert.match(script,/id="pomo-overlay-time">\$\{pomoClock\(\)\}/);
 assert.match(extract('function updatePomoOverlay(){','function openPomoOverlay(){'),/value\.textContent=pomoClock\(\)/);
 assert.match(extract('function updatePomoPip(){','function syncPomoPipAppearance'),/time\.textContent=pomoClock\(\)/);
 assert.match(extract('function pTick(','function pS()'),/t2\.textContent=pomoClock\(\)/);
 assert.match(extract('function pTick(','function pS()'),/document\.title=pomoClock\(\)/);
});
test('preset inputs submit with Enter, without double click side effects',()=>{
 assert.match(html,/<form class="row" onsubmit="event\.preventDefault\(\);addP\(\)">/);
 assert.match(html,/<input id="cw" type="number" min="1" max="600" step="1" required/);
 assert.match(html,/<input id="cb" type="number" min="1" max="600" step="1" required/);
 assert.match(html,/<button type="submit">\$\{tr\(\)\?'Ekle \/ Güncelle'/);
 assert.doesNotMatch(html,/onclick="addP\(\)"/);
});
test('preset storage accepts sixty-plus-minute focus/break and rejects invalid values',()=>{
 let w='90',b='65',saves=0,sets=[];
 const context={
  A:{presets:[]},
  $:id=>id==='#cw'?{value:w}:{value:b},
  save:()=>saves++,
  setP:(a,z)=>sets.push([a,z])
 };
 vm.createContext(context);
 vm.runInContext('let editIdx=-1;'+extract('function addP(){','function pTick(')+'\nthis.addP=addP;',context);
 context.addP();
 assert.deepEqual(JSON.parse(JSON.stringify(context.A.presets)),[{w:90,b:65}]);
 assert.deepEqual(sets,[[90,65]]);
 w='601';context.addP();
 b='0';w='90';context.addP();
 assert.equal(context.A.presets.length,1);
 assert.equal(saves,1);
});
